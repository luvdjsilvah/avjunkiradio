import assert from "node:assert/strict";
import {test} from "node:test";

let instance = 0;
async function setup(t, respond) {
  t.mock.method(Date, "now", () => Date.parse("2026-10-01T07:00:00Z"));
  const calls = [];
  t.mock.method(globalThis, "fetch", async url => {
    calls.push(String(url));
    const data = await respond(String(url));
    return typeof data === "string" ? new Response(data) : Response.json(data);
  });
  const worker = (await import(`./worker.js?info-test=${++instance}`)).default;
  return {calls, request: (name, method = "GET") => worker.fetch(new Request(`https://station.example/api/info/${name}`, {method}), {
    get DB() {throw new Error("An info request must never access D1");},
    get AUDIO_BUCKET() {throw new Error("An info request must never access R2");}
  })};
}

test("information routes are read-only, bounded to known feeds, and independent of media bindings", async t => {
  const {request,calls} = await setup(t, () => {throw new Error("No upstream access expected");});
  assert.equal((await request("unknown")).status, 404);
  assert.equal((await request("sports", "POST")).status, 405);
  const options = await request("sports", "OPTIONS");
  assert.equal(options.status, 204);
  assert.equal(options.headers.get("Access-Control-Allow-Origin"), "*");
  assert.equal(calls.length, 0);
});

test("sports keep scheduled scores blank, show real live zero scores, and isolate one failed league", async t => {
  const event = (state, score) => ({name:"Away at Home",date:"2026-10-02T01:00:00Z",competitions:[{
    date:"2026-10-02T01:00:00Z",status:{type:{state,name:state === "pre" ? "STATUS_SCHEDULED" : "STATUS_IN_PROGRESS",shortDetail:"1st quarter"}},
    competitors:[{homeAway:"home",team:{abbreviation:"LV"},score},{homeAway:"away",team:{abbreviation:"KC"},score}]
  }]});
  const {request} = await setup(t, url => {
    if (url.includes("basketball/nba/")) throw new Error("Upstream unavailable");
    return {events:[event(url.includes("football/") ? "pre" : "in", "0")]};
  });
  const response = await request("sports");
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.games.find(game => game.league === "NFL").scoreA, "--");
  assert.equal(data.games.find(game => game.league === "WNBA").scoreA, "0");
  assert.equal(data.games.find(game => game.league === "NFL").scheduled, true);
  assert.deepEqual(data.unavailableLeagues, ["NBA"]);
});

test("weather rejects old observations instead of presenting a forecast as current conditions", async t => {
  const {request} = await setup(t, () => ({properties:{temperature:{value:25,unitCode:"wmoUnit:degC"},timestamp:"2026-09-30T01:00:00Z",textDescription:"Clear"}}));
  const response = await request("weather");
  assert.equal(response.status, 503);
  assert.equal((await response.json()).ok, false);
});

test("a forecast outage preserves the measured current weather with unavailable highs/lows", async t => {
  const {request} = await setup(t, url => {
    if (url.includes("/points/")) throw new Error("Forecast metadata offline");
    return {properties:{temperature:{value:20,unitCode:"wmoUnit:degC"},timestamp:"2026-10-01T06:45:00Z",textDescription:"Clear"}};
  });
  const data = await (await request("weather")).json();
  assert.equal(data.temperature, 68);
  assert.equal(data.high, null);
  assert.equal(data.low, null);
});

test("Dow daily change uses the prior trading close, not the first day of the requested range", async t => {
  const quoteAt = Date.parse("2026-09-30T20:00:00Z") / 1000;
  const {request,calls} = await setup(t, () => ({chart:{result:[{
    meta:{regularMarketPrice:51000,regularMarketTime:quoteAt,chartPreviousClose:48000,currentTradingPeriod:{regular:{start:quoteAt - 23400,end:quoteAt}}},
    timestamp:[quoteAt - 4 * 86400,quoteAt - 86400,quoteAt],indicators:{quote:[{close:[48000,52000,51000]}]}
  }]}}));
  const data = await (await request("markets")).json();
  assert.equal(data.change, -1000);
  assert.equal(data.marketOpen, false);
  assert.equal(data.delayed, true);
  const head = await request("markets", "HEAD");
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
  assert.equal(calls.length, 1);
});

test("Nevada traffic reads all pages before filtering to local reports and never invents clear roads", async t => {
  const {request,calls} = await setup(t, url => {
    if (url.includes("/map/mapIcons/")) return {item2:[{itemId:"local",location:[35.83,-115.28]}]};
    const query = JSON.parse(new URL(url).searchParams.get("query"));
    return query.start === 0 ? {recordsFiltered:2,data:[{region:"Reno",roadwayName:"I-80",type:"Incidents"}]} :
      {recordsFiltered:2,data:[{DT_RowId:"local",layerName:"Incidents",region:"Las Vegas",roadwayName:"I-15",type:"Incidents",eventSubType:"vehicleOnFire",description:"Vehicle fire, lane affected",laneDescription:"1 right lane affected",lastUpdated:"9/30/26, 11:08 PM"}]};
  });
  const data = await (await request("traffic")).json();
  assert.equal(calls.length, 5);
  assert.equal(data.events.length, 1);
  assert.equal(data.events[0].route, "I-15");
  assert.match(data.events[0].condition, /vehicle On Fire/);
});

test("an incomplete traffic response is unavailable rather than an all-clear", async t => {
  const {request} = await setup(t, url => url.includes("/map/mapIcons/") ? {item2:[]} : {recordsFiltered:10,data:[]});
  assert.equal((await request("traffic")).status, 503);
});

test("traffic excludes distant southern Nevada events and labels future local closures planned", async t => {
  const {request} = await setup(t, url => url.includes("/map/mapIcons/") ? {item2:[
    {itemId:"distant",location:[37.6,-114.7]}, {itemId:"local",location:[36.1,-115.1]}
  ]} : {recordsFiltered:2,data:[
    {DT_RowId:"distant",layerName:"Incidents",region:"Las Vegas",roadwayName:"US-93",type:"Incidents",eventSubType:"accident"},
    {DT_RowId:"local",layerName:"Closures",region:"Las Vegas",roadwayName:"I-215",type:"Closures",eventSubType:"roadClosure",startDate:"10/2/26, 12:00 PM",isFullClosure:true}
  ]});
  const data = await (await request("traffic")).json();
  assert.equal(data.events.length,1);
  assert.equal(data.events[0].route,"I-215");
  assert.match(data.events[0].condition,/^Planned/);
});

test("news keeps current attributed headlines as plain text and filters unsafe links and stale items", async t => {
  const {request} = await setup(t, () => `<rdf:RDF>
    <item><title><![CDATA[News &amp; updates]]></title><link>https://www.dw.com/en/news/a-123</link><dc:date>2026-10-01T06:00:00Z</dc:date></item>
    <item><title>Old item</title><link>https://www.dw.com/en/old/a-456</link><dc:date>2026-09-27T06:00:00Z</dc:date></item>
    <item><title>Untrusted link</title><link>javascript:alert(1)</link><dc:date>2026-10-01T06:00:00Z</dc:date></item>
  </rdf:RDF>`);
  const data = await (await request("news")).json();
  assert.equal(data.source, "DW News");
  assert.equal(data.items.length, 1);
  assert.equal(data.items[0].title, "News & updates");
});
