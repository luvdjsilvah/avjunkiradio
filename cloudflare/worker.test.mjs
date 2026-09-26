import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import worker from "./worker.js";

function database() {
  const sqlite = new DatabaseSync(":memory:");
  const statement = (sql) => {
    let values = [];
    return {
      bind(...params) { values = params; return this; },
      async run() {
        const result = sqlite.prepare(sql).run(...values);
        return { meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
      },
      async first() { return sqlite.prepare(sql).get(...values) || null; },
      async all() { return { results: sqlite.prepare(sql).all(...values) }; }
    };
  };
  return {
    sqlite,
    prepare: statement,
    async batch(statements) { for (const item of statements) await item.run(); }
  };
}

function bucket() {
  const entries = new Map();
  const pending = new Map();
  const consume = async (body) => new Uint8Array(await new Response(body).arrayBuffer());
  const multipart = (key, uploadId) => ({
    uploadId,
    async uploadPart(partNumber, body) {
      const parts = pending.get(uploadId);
      parts.set(partNumber, await consume(body));
      return { etag: `part-${partNumber}` };
    },
    async complete(parts) {
      const stored = pending.get(uploadId);
      const buffers = parts.map(({ partNumber }) => stored.get(partNumber));
      entries.set(key, { data: Uint8Array.from(buffers.flatMap((part) => [...part])), type: "video/mp4" });
      pending.delete(uploadId);
    },
    async abort() { pending.delete(uploadId); }
  });
  return {
    entries,
    async put(key, body, options) {
      entries.set(key, { data: await consume(body), type: options.httpMetadata.contentType });
    },
    async delete(key) { entries.delete(key); },
    async get(key, options) {
      const entry = entries.get(key);
      if (!entry) return null;
      let start = 0;
      let end = entry.data.length - 1;
      let range = null;
      const spec = options?.range?.get?.("Range")?.match(/^bytes=(\d+)-(\d*)$/);
      if (spec) {
        start = Number(spec[1]);
        end = spec[2] ? Number(spec[2]) : end;
        range = { offset: start, length: end - start + 1 };
      }
      return {
        size: entry.data.length,
        range,
        body: entry.data.slice(start, end + 1),
        httpEtag: '"test-etag"',
        writeHttpMetadata(headers) { headers.set("Content-Type", entry.type); }
      };
    },
    async createMultipartUpload(key, options) {
      const uploadId = crypto.randomUUID();
      pending.set(uploadId, new Map());
      const upload = multipart(key, uploadId);
      const complete = upload.complete;
      upload.complete = async (parts) => {
        await complete(parts);
        entries.get(key).type = options.httpMetadata.contentType;
      };
      return upload;
    },
    resumeMultipartUpload: multipart
  };
}

const mp3 = new File([Uint8Array.from([73, 68, 51, 4, 0, 0, 0, 0])],
  "Do_Me_by_Dj_Silvah.mp3", { type: "audio/mpeg" });
const artwork = new File([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0])],
  "cover.png", { type: "image/png" });
const videoBytes = Uint8Array.from([0, 0, 0, 24, 102, 116, 121, 112, 65, 66, 67, 68]);

test("upgrades the existing D1 music and drop tables without removing live tracks", async () => {
  const DB = database();
  DB.sqlite.exec(`
    CREATE TABLE music_library (id INTEGER PRIMARY KEY AUTOINCREMENT, genre TEXT NOT NULL,
      original_filename TEXT NOT NULL, r2_key TEXT NOT NULL, duration_seconds REAL NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1, uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE station_drops (id INTEGER PRIMARY KEY AUTOINCREMENT, slot_key TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL, artist TEXT NOT NULL DEFAULT 'AV Junki Radio',
      original_filename TEXT NOT NULL, source_path TEXT NOT NULL,
      r2_key TEXT NOT NULL DEFAULT '', duration_seconds REAL NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1, version INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    INSERT INTO music_library (id, genre, original_filename, r2_key, duration_seconds)
      VALUES (2, 'hip-hop', 'Do_Me_by_Dj_Silvah.mp3', 'music/hip-hop/do-me.mp3', 220.58);
  `);
  const AUDIO_BUCKET = bucket();
  await AUDIO_BUCKET.put("music/hip-hop/do-me.mp3", mp3.stream(),
    { httpMetadata: { contentType: "audio/mpeg" } });
  const env = { DB, AUDIO_BUCKET, ADMIN_API_TOKEN: "local-test-token" };
  const response = await worker.fetch(new Request("https://station.example/api/music"), env);
  const result = await response.json();
  assert.equal(result.music[0].id, 2);
  assert.equal(result.music[0].genre, "hip-hop");
  assert.equal(result.music[0].artwork_key, "");
  assert.equal(DB.sqlite.prepare("SELECT COUNT(*) AS total FROM station_drops").get().total, 8);
  const stream = await worker.fetch(new Request("https://station.example/api/music/2/audio"), env);
  assert.equal(stream.status, 200);
});

test("admin MP3, drop, image ad and video workflows", async () => {
  const env = { DB: database(), AUDIO_BUCKET: bucket(), ADMIN_API_TOKEN: "local-test-token" };
  const request = (path, options = {}) => worker.fetch(new Request(`https://station.example${path}`, options), env);
  const authorized = (method, body, headers = {}) => ({
    method, body, headers: { Authorization: "Bearer local-test-token", ...headers }
  });
  const body = async (response) => {
    const result = await response.json();
    assert.equal(result.ok, true, JSON.stringify(result));
    return result;
  };

  const preflight = await request("/api/music/upload", { method: "OPTIONS" });
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get("Access-Control-Allow-Headers"), /Authorization/);
  assert.equal((await request("/api/image-ads/upload", {
    method: "POST", headers: { Authorization: "Bearer incorrect" }
  })).status, 401);

  const musicForm = new FormData();
  musicForm.set("file", mp3);
  musicForm.set("duration", "220");
  musicForm.set("genre", "hip-hop");
  musicForm.set("enabled", "1");
  musicForm.set("artwork", artwork);
  assert.equal((await request("/api/music/upload", { method: "POST", body: musicForm })).status, 401);
  const uploaded = await body(await request("/api/music/upload", authorized("POST", musicForm)));
  assert.equal(uploaded.music.artwork_key.startsWith("images/music/"), true);
  const musicId = uploaded.music.id;
  const music = await body(await request("/api/music"));
  assert.equal(music.music[0].genre, "hip-hop");
  assert.equal(music.music[0].original_filename, "Do_Me_by_Dj_Silvah.mp3");
  const stream = await request(`/api/music/${musicId}/audio`, { headers: { Range: "bytes=0-2" } });
  assert.equal(stream.status, 206);
  assert.equal(stream.headers.get("Content-Range"), "bytes 0-2/8");
  assert.deepEqual(new Uint8Array(await stream.arrayBuffer()), Uint8Array.from([73, 68, 51]));
  assert.equal((await request(`/api/music/${musicId}/artwork`)).headers.get("Content-Type"), "image/png");
  await body(await request(`/api/music/${musicId}`, authorized("PATCH", JSON.stringify({ enabled: 0 }),
    { "Content-Type": "application/json" })));
  assert.equal((await request(`/api/music/${musicId}/audio`)).status, 404);

  const dropForm = new FormData();
  dropForm.set("file", mp3);
  dropForm.set("duration", "8");
  dropForm.set("pool", "nightlife");
  dropForm.set("artwork", artwork);
  const drop = await body(await request("/api/drops/id-01/upload", authorized("POST", dropForm)));
  assert.equal(drop.drop.pool, "nightlife");
  assert.equal((await request("/api/drops/id-01/artwork")).status, 200);
  assert.equal((await request("/api/audio/id-01", { headers: { Range: "bytes=0-2" } })).status, 206);
  await body(await request("/api/drops/id-01", authorized("PATCH", JSON.stringify({ pool: "gospel" }),
    { "Content-Type": "application/json" })));

  const adForm = new FormData();
  adForm.set("image", artwork);
  adForm.set("pool", "reggae");
  adForm.set("enabled", "1");
  adForm.set("title", "Reggae visual");
  const ad = await body(await request("/api/image-ads/upload", authorized("POST", adForm)));
  assert.equal((await body(await request("/api/image-ads"))).ads[0].pool, "reggae");
  assert.equal((await request(`/api/image-ads/${ad.ad.id}/image`)).status, 200);
  await body(await request(`/api/image-ads/${ad.ad.id}`, authorized("PATCH",
    JSON.stringify({ enabled: 0 }), { "Content-Type": "application/json" })));
  assert.equal((await body(await request("/api/image-ads"))).ads[0].enabled, 0);

  const initiated = await body(await request("/api/videos/uploads", authorized("POST", JSON.stringify({
    filename: "clip.mp4", contentType: "video/mp4", size: videoBytes.length,
    title: "Station clip", pool: "nightlife", enabled: 1
  }), { "Content-Type": "application/json" })));
  const part = await body(await request(`/api/videos/uploads/${initiated.uploadId}/parts/1`,
    authorized("PUT", videoBytes)));
  const completed = await body(await request(`/api/videos/uploads/${initiated.uploadId}/complete`,
    authorized("POST", JSON.stringify({ parts: [{ partNumber: 1, etag: part.etag }] }),
      { "Content-Type": "application/json" })));
  assert.equal((await body(await request("/api/videos"))).videos[0].pool, "nightlife");
  const movie = await request(`/api/videos/${completed.video.id}/stream`, { headers: { Range: "bytes=0-3" } });
  assert.equal(movie.status, 206);
  assert.equal(movie.headers.get("Content-Type"), "video/mp4");
  const thumbForm = new FormData();
  thumbForm.set("thumbnail", artwork);
  await body(await request(`/api/videos/${completed.video.id}/thumbnail`, authorized("POST", thumbForm)));
  assert.equal((await request(`/api/videos/${completed.video.id}/thumbnail`)).status, 200);
});
