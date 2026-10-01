import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import {test} from "node:test";

const source = readFileSync(new URL("./info-center.js", import.meta.url), "utf8");
const flush = async () => {for (let n=0;n<6;n++) await new Promise(resolve => setImmediate(resolve));};

async function display({offline = false} = {}) {
  let now = Date.parse("2026-10-01T06:58:00Z");
  class Clock extends Date {
    constructor(...args) {super(...(args.length ? args : [now]));}
    static now() {return now;}
  }
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  const panel = html.slice(html.indexOf('id="left-info-display"'), html.indexOf('id="player-album-art"'));
  const fields = new Map([...panel.matchAll(/id="([^"]+)"/g)].map(match => [match[1], {id:match[1],textContent:"",title:"",style:{}}]));
  const container = {dataset:{liveInfo:"true"},querySelectorAll:() => [...fields.values()]};
  const events = new Map(), timers = new Map(), requests = [];
  let timer = 0;
  const data = {
    weather:{temperature:72,condition:"Clear",high:94,low:71,observedAt:new Clock().toISOString()},
    sports:{games:[{league:"NFL",sport:"FOOTBALL",teamA:"KC",teamB:"LV",scoreA:"--",scoreB:"--",scheduled:true,date:"2026-10-02T00:00:00Z",state:"pre",status:"Scheduled",fullName:"Kansas City at Las Vegas"}]},
    markets:{value:50906.05,change:-443.87,percent:-0.864,quoteAt:"2026-09-30T20:48:36Z",marketOpen:false},
    traffic:{events:[{route:"I-15 · Jean",condition:"Vehicle on fire",description:"One lane affected",updated:"9/30/26, 11:08 PM"}]},
    news:{items:[{title:"An attributed world headline",link:"https://www.dw.com/en/example/a-123",publishedAt:"2026-10-01T06:00:00Z"}]}
  };
  const document = {readyState:"complete",hidden:false,getElementById(id) {
    assert.equal(id,"left-info-display", "The controller must only select the information panel");
    return container;
  },addEventListener:(name,fn) => events.set(name,fn)};
  const window = {setTimeout:() => ++timer,clearTimeout(){},setInterval:(fn,ms) => {timers.set(++timer,{fn,ms});return timer;},addEventListener:(name,fn) => events.set(name,fn)};
  let failing = offline;
  vm.runInNewContext(source,{document,window,Date:Clock,Intl,AbortController,fetch:async url => {
    requests.push(url);
    if (failing) throw new Error("Network offline");
    const name = url.split("/").at(-1);
    return {ok:true,json:async () => ({ok:true,...structuredClone(data[name]),fetchedAt:new Clock().toISOString()})};
  }});
  await flush();
  return {fields,requests,document,events,setOffline:value => {failing=value;},advance:ms => {now+=ms;},async tick(ms) {for (const t of timers.values()) if (t.ms===ms) t.fn();await flush();}};
}

test("the existing panel receives live content, Pacific time, and the correct negative market colour", async () => {
  const panel = await display();
  const text = id => panel.fields.get(id).textContent;
  assert.equal(text("left-info-clock"),"11:58 PM");
  assert.equal(text("left-info-date"),"Wednesday, September 30");
  assert.equal(text("weather-temp"),"72°");
  assert.equal(text("sports-team-b"),"LV");
  assert.equal(text("sports-score-b"),"--");
  assert.equal(text("dow-points"),"-443.87");
  assert.equal(panel.fields.get("dow-points").style.color,"#ef9b9b");
  assert.match(text("dow-status"),/LAST CLOSE/);
  assert.equal(text("traffic-condition"),"VEHICLE ON FIRE");
  assert.equal(panel.requests.length,5);
  assert.ok(panel.requests.every(url => url.includes("/api/info/")));
});

test("all failed feeds remain unavailable while the local clock keeps running", async () => {
  const panel = await display({offline:true});
  assert.equal(panel.fields.get("sports-status").textContent,"SCORES UNAVAILABLE");
  assert.equal(panel.fields.get("dow-status").textContent,"QUOTE UNAVAILABLE");
  assert.equal(panel.fields.get("traffic-condition").textContent,"REPORT UNAVAILABLE");
  panel.advance(120_000);
  await panel.tick(1000);
  assert.equal(panel.fields.get("left-info-clock").textContent,"12:00 AM");
  assert.equal(panel.fields.get("left-info-date").textContent,"Thursday, October 1");
});

test("a lost connection labels recent scores delayed and clears them after their freshness limit", async () => {
  const panel = await display();
  panel.setOffline(true);
  panel.advance(60_000);
  await panel.tick(15_000);
  assert.equal(panel.fields.get("sports-status").textContent,"UPDATE DELAYED");
  panel.advance(3 * 60_000);
  await panel.tick(1000);
  assert.equal(panel.fields.get("sports-status").textContent,"SCORES UNAVAILABLE");
  assert.equal(panel.fields.get("sports-team-b").textContent,"--");
});

test("hidden tabs pause feed requests and resume on returning to the station", async () => {
  const panel = await display();
  panel.document.hidden = true;
  panel.advance(10 * 60_000);
  await panel.tick(15_000);
  assert.equal(panel.requests.length,5);
  panel.document.hidden = false;
  panel.events.get("visibilitychange")();
  await flush();
  assert.equal(panel.requests.length,10);
});
