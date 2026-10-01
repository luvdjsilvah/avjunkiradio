import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {test} from "node:test";
import worker from "./worker.js";

function database() {
  const sqlite = new DatabaseSync(":memory:");
  return {sqlite,prepare(sql) {
    let values = [];
    return {bind(...args) {values=args;return this;},
      async first() {return sqlite.prepare(sql).get(...values) || null;},
      async all() {return {results:sqlite.prepare(sql).all(...values)};},
      async run() {const result=sqlite.prepare(sql).run(...values);return {meta:{last_row_id:Number(result.lastInsertRowid),changes:Number(result.changes)}};}};
  },async batch(statements) {for (const statement of statements) await statement.run();}};
}
const token = "test-only-station-admin-key";
const env = () => ({DB:database(),ADMIN_API_TOKEN:token,get AUDIO_BUCKET() {throw new Error("Navigation must never access radio media");}});
const input = () => ({submissionId:crypto.randomUUID(),purpose:"contact",topic:"General enquiry",name:"Test Listener",email:"listener@example.test",message:"A local automated enquiry test.",consent:true,website:""});
function request(path,method="GET",body,auth=false,origin="https://avjunkiradio.com") {
  return new Request(`https://station.test${path}`,{method,headers:{Origin:origin,"CF-Connecting-IP":"192.0.2.10",...(body !== undefined ? {"Content-Type":"application/json"} : {}),...(auth ? {Authorization:`Bearer ${token}`} : {})},...(body !== undefined ? {body:JSON.stringify(body)} : {})});
}

test("station messages are saved privately and retries keep one reference", async () => {
  const state=env(),data=input();
  let response=await worker.fetch(request("/api/station/messages","POST",data),state);
  assert.equal(response.status,202);
  const saved=await response.json();
  assert.match(saved.reference,/^AVJ-[A-F0-9]{12}$/);
  response=await worker.fetch(request("/api/station/messages","POST",data),state);
  assert.deepEqual(await response.json(),saved);
  assert.equal(state.DB.sqlite.prepare("SELECT COUNT(*) AS total FROM station_messages").get().total,1);
  assert.equal(state.DB.sqlite.prepare("SELECT count FROM station_message_limits").get().count,1);
  const tables=state.DB.sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(row=>row.name);
  assert.ok(!tables.includes("music_library") && !tables.includes("station_drops"));
  assert.equal(response.headers.get("Cache-Control"),"no-store");
});

test("all private inbox reads and changes require the existing admin key", async () => {
  const state=env();
  for (const [path,method,body] of [["/api/station/inbox","GET"],["/api/station/inbox/1","PATCH",{status:"read"}]]) {
    const response=await worker.fetch(request(path,method,body),state);
    assert.equal(response.status,401);
  }
  assert.equal(state.DB.sqlite.prepare("SELECT COUNT(*) AS total FROM sqlite_master WHERE name = 'station_messages'").get().total,0);
  await worker.fetch(request("/api/station/messages","POST",input()),state);
  let response=await worker.fetch(request("/api/station/inbox","GET",undefined,true),state);
  const inbox=await response.json();
  assert.equal(inbox.messages.length,1);
  assert.equal(inbox.messages[0].email,"listener@example.test");
  assert.equal(inbox.totals.new,1);
  response=await worker.fetch(request("/api/station/inbox/1","PATCH",{status:"read"},true),state);
  assert.equal(response.status,200);
  response=await worker.fetch(request("/api/station/inbox?status=new","GET",undefined,true),state);
  assert.equal((await response.json()).messages.length,0);
  await worker.fetch(request("/api/station/inbox/1","PATCH",{status:"archived"},true),state);
  assert.equal(state.DB.sqlite.prepare("SELECT status FROM station_messages WHERE id = 1").get().status,"archived");
  assert.equal((await worker.fetch(request("/api/station/inbox/1","DELETE",undefined,true),state)).status,405);
});

test("validation, consent, JSON size and allowed site origins are enforced", async () => {
  const state=env();
  for (const override of [{email:"not an email"},{message:"tiny"},{name:""},{topic:"invented"},{purpose:"admin"},{consent:false},{submissionId:"nope"}]) {
    assert.equal((await worker.fetch(request("/api/station/messages","POST",{...input(),...override}),state)).status,400);
  }
  assert.equal((await worker.fetch(request("/api/station/messages","POST",input(),false,"https://unrelated.test"),state)).status,403);
  assert.equal((await worker.fetch(request("/api/station/messages","POST",{...input(),message:"x".repeat(17_000)}),state)).status,413);
  const malformed=new Request("https://station.test/api/station/messages",{method:"POST",headers:{Origin:"https://avjunkiradio.com","Content-Type":"application/json"},body:"{broken"});
  assert.equal((await worker.fetch(malformed,state)).status,400);
  assert.equal((await worker.fetch(request("/api/station/messages","POST",{...input(),website:"a bot filled this"}),state)).status,202);
  assert.equal(state.DB.sqlite.prepare("SELECT COUNT(*) AS total FROM sqlite_master WHERE name = 'station_messages'").get().total,0);
});

test("message limits are atomic, retain enquiries and store no raw sender IP", async () => {
  const state=env();
  for (let index=0;index<5;index++) assert.equal((await worker.fetch(request("/api/station/messages","POST",input()),state)).status,202);
  assert.equal((await worker.fetch(request("/api/station/messages","POST",input()),state)).status,429);
  assert.equal(state.DB.sqlite.prepare("SELECT COUNT(*) AS total FROM station_messages").get().total,5);
  const sender=state.DB.sqlite.prepare("SELECT sender_hash FROM station_message_limits").get().sender_hash;
  assert.match(sender,/^[a-f0-9]{64}$/);
  assert.ok(!sender.includes("192.0.2.10"));
});

test("inbox filters and pagination never expose an unauthenticated list", async () => {
  const state=env();
  await worker.fetch(request("/api/station/messages","POST",input()),state);
  const insert=state.DB.sqlite.prepare("INSERT INTO station_messages (submission_id,reference,purpose,topic,name,email,message) VALUES (?,?,?,?,?,?,?)");
  for(let index=0;index<55;index++) insert.run(crypto.randomUUID(),`TEST-${index}`,"inquiry","Podcast pitch","Test","test@example.test","Only a local test record");
  let response=await worker.fetch(request("/api/station/inbox","GET",undefined,true),state);
  const first=await response.json();
  assert.equal(first.messages.length,50);
  assert.equal(first.messages[0].id,56);
  assert.equal(first.nextBefore,7);
  response=await worker.fetch(request(`/api/station/inbox?before=${first.nextBefore}`,"GET",undefined,true),state);
  const second=await response.json();
  assert.equal(second.messages.length,6);
  assert.equal(second.nextBefore,null);
  assert.equal((await worker.fetch(request("/api/station/inbox?status=invalid","GET",undefined,true),state)).status,400);
  assert.equal((await worker.fetch(request("/api/station/inbox?before=1%20OR%201=1","GET",undefined,true),state)).status,400);
  assert.equal((await worker.fetch(request("/api/station/inbox?before=7"),state)).status,401);
});

test("station preflight and method handling leave media routes and DB untouched", async () => {
  const state={get DB(){throw new Error("Unexpected DB access");}};
  let response=await worker.fetch(request("/api/station/messages","OPTIONS"),state);
  assert.equal(response.status,204);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"),"https://avjunkiradio.com");
  assert.match(response.headers.get("Access-Control-Allow-Headers"),/Authorization/);
  assert.equal((await worker.fetch(request("/api/station/messages"),state)).status,405);
  assert.equal((await worker.fetch(request("/api/station/unknown"),state)).status,404);
  response=await worker.fetch(request("/api/station/messages","POST",input()),{});
  assert.equal(response.status,503);
  assert.equal((await response.json()).ok,false);
});
