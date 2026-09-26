const DEFAULT_DROPS = [
  {
    slot: "id-01",
    title: "You're Listening to AV Junki Radio",
    artist: "AV Junki Radio",
    filename: "AVJ_ID_01_Youre_Listening.mp3",
    sourcePath: "assets/audio/ids/AVJ_ID_01_Youre_Listening.mp3",
    duration: 4.101224
  },
  {
    slot: "id-02",
    title: "Where the Vibe Lives",
    artist: "AV Junki Radio",
    filename: "AVJ_ID_02_Where_The_Vibe_Lives.mp3",
    sourcePath: "assets/audio/ids/AVJ_ID_02_Where_The_Vibe_Lives.mp3",
    duration: 7.601633
  },
  {
    slot: "id-03",
    title: "This Is AV Junki Radio",
    artist: "AV Junki Radio",
    filename: "AVJ_ID_03_This_Is_AV_Junki_Radio.mp3",
    sourcePath: "assets/audio/ids/AVJ_ID_03_This_Is_AV_Junki_Radio.mp3",
    duration: 3.082449
  },
  {
    slot: "id-04",
    title: "Stay Right Here",
    artist: "AV Junki Radio",
    filename: "AVJ_ID_04_Stay_Right_Here.mp3",
    sourcePath: "assets/audio/ids/AVJ_ID_04_Stay_Right_Here.mp3",
    duration: 4.754286
  },
  {
    slot: "id-05",
    title: "Smooth Jazz to Soul",
    artist: "AV Junki Radio",
    filename: "AVJ_ID_05_Smooth_Jazz_To_Soul.mp3",
    sourcePath: "assets/audio/ids/AVJ_ID_05_Smooth_Jazz_To_Soul.mp3",
    duration: 11.441633
  },
  {
    slot: "id-06",
    title: "Music for the Moment",
    artist: "AV Junki Radio",
    filename: "AVJ_ID_06_Music_For_The_Moment.mp3",
    sourcePath: "assets/audio/ids/AVJ_ID_06_Music_For_The_Moment.mp3",
    duration: 10.344490
  },
  {
    slot: "id-07",
    title: "No Rush, No Noise",
    artist: "AV Junki Radio",
    filename: "AVJ_ID_07_No_Rush_No_Noise.mp3",
    sourcePath: "assets/audio/ids/AVJ_ID_07_No_Rush_No_Noise.mp3",
    duration: 14.602449
  },
  {
    slot: "id-08",
    title: "Settle In",
    artist: "AV Junki Radio",
    filename: "AVJ_ID_08_Settle_In.mp3",
    sourcePath: "assets/audio/ids/AVJ_ID_08_Settle_In.mp3",
    duration: 14.602449
  }
];
function json(data, status = 200) {
  return new Response(
    JSON.stringify(data, null, 2),
    {
      status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store"
      }
    }
  );
}
const databaseInitPromises = new WeakMap();
async function ensureDatabase(db) {
  if (!databaseInitPromises.has(db)) {
    const promise = initializeDatabase(db).catch((error) => {
      databaseInitPromises.delete(db);
      throw error;
    });
    databaseInitPromises.set(db, promise);
  }
  return databaseInitPromises.get(db);
}

async function initializeDatabase(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS station_drops (id INTEGER PRIMARY KEY AUTOINCREMENT, slot_key TEXT NOT NULL UNIQUE, title TEXT NOT NULL, artist TEXT NOT NULL DEFAULT 'AV Junki Radio', original_filename TEXT NOT NULL, source_path TEXT NOT NULL, r2_key TEXT NOT NULL DEFAULT '', duration_seconds REAL NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS music_library (id INTEGER PRIMARY KEY AUTOINCREMENT, genre TEXT NOT NULL, original_filename TEXT NOT NULL, r2_key TEXT NOT NULL, duration_seconds REAL NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
  for (const [table, column, definition] of [
    ["music_library", "artwork_key", "TEXT NOT NULL DEFAULT ''"],
    ["station_drops", "artwork_key", "TEXT NOT NULL DEFAULT ''"],
    ["station_drops", "pool", "TEXT NOT NULL DEFAULT 'jazz'"]
  ]) {
    const columns = await db.prepare(`PRAGMA table_info(${table})`).all();
    if (!(columns.results || []).some((entry) => entry.name === column)) {
      try {
        await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
      } catch (error) {
        if (!String(error).includes("duplicate column name")) throw error;
      }
    }
  }
  await db.prepare("CREATE TABLE IF NOT EXISTS image_ads (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, pool TEXT NOT NULL, image_key TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS videos (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, pool TEXT NOT NULL, video_key TEXT NOT NULL, thumbnail_key TEXT NOT NULL DEFAULT '', enabled INTEGER NOT NULL DEFAULT 1, uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS pending_video_uploads (upload_id TEXT PRIMARY KEY, video_key TEXT NOT NULL, title TEXT NOT NULL, pool TEXT NOT NULL, content_type TEXT NOT NULL, enabled INTEGER NOT NULL, admin_subject TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
  const statements = DEFAULT_DROPS.map(
    (drop) => {
      return db
        .prepare(`
          INSERT OR IGNORE INTO station_drops (
            slot_key,
            title,
            artist,
            original_filename,
            source_path,
            duration_seconds
          )
          VALUES (?, ?, ?, ?, ?, ?)
        `)
        .bind(
          drop.slot,
          drop.title,
          drop.artist,
          drop.filename,
          drop.sourcePath,
          drop.duration
        );
    }
  );
  if (statements.length) {
    await db.batch(statements);
  }
}
const MEDIA_POOLS = new Set(["jazz", "nightlife", "reggae", "gospel"]);
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024;

function mediaError(message, status = 400) {
  return json({ ok: false, error: message }, status);
}

function validEnabled(value) {
  return value === "0" || value === "1" || value === 0 || value === 1;
}

function safeName(value) {
  return String(value || "media").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
}

function mediaKey(section, filename) {
  return `${section}/${Date.now()}-${crypto.randomUUID()}-${safeName(filename)}`;
}

function imageFile(file) {
  return file && typeof file !== "string" && IMAGE_TYPES.has(file.type) &&
    file.size > 0 && file.size <= MAX_IMAGE_BYTES;
}

async function mp3File(file) {
  if (!file || typeof file === "string" || !["audio/mpeg", "audio/mp3"].includes(file.type) ||
    !/\.mp3$/i.test(file.name || "") || file.size < 4 || file.size > 90 * 1024 * 1024) return false;
  const bytes = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  return String.fromCharCode(...bytes.slice(0, 3)) === "ID3" ||
    bytes[0] === 255 && (bytes[1] & 0xe0) === 0xe0;
}

async function storeImage(bucket, file, section) {
  if (!imageFile(file)) return null;
  const signature = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const png = signature.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10]
    .every((byte, index) => signature[index] === byte);
  const jpeg = signature[0] === 255 && signature[1] === 216 && signature[2] === 255;
  const webp = signature.length >= 12 &&
    String.fromCharCode(...signature.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...signature.slice(8, 12)) === "WEBP";
  if (!(file.type === "image/png" && png || file.type === "image/jpeg" && jpeg ||
    file.type === "image/webp" && webp)) return null;
  const key = mediaKey(section, file.name);
  await bucket.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
  return key;
}

async function mediaObject(request, bucket, key, fallbackType) {
  if (!bucket || !key) return mediaError("Media not found.", 404);
  const object = await bucket.get(key, { range: request.headers });
  if (!object || !("body" in object)) return mediaError("Media not found.", 404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Type", headers.get("Content-Type") || fallbackType);
  headers.set("Accept-Ranges", "bytes");
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Expose-Headers", "Accept-Ranges, Content-Length, Content-Range, ETag");
  headers.set("Cache-Control", "no-store");
  if (object.httpEtag) headers.set("ETag", object.httpEtag);
  if (object.range) {
    const start = object.range.offset ?? object.size - object.range.suffix;
    const length = object.range.length ?? object.size - start;
    headers.set("Content-Range", `bytes ${start}-${start + length - 1}/${object.size}`);
    headers.set("Content-Length", String(length));
  } else {
    headers.set("Content-Length", String(object.size));
  }
  return new Response(object.body, { status: object.range ? 206 : 200, headers });
}

async function authorizeWrite(request, env) {
  if (!env.ADMIN_API_TOKEN) return mediaError("Admin API token has not been configured.", 503);
  const header = request.headers.get("Authorization") || "";
  const supplied = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!supplied || supplied.length > 256) return mediaError("Admin authorization required.", 401);
  const encoder = new TextEncoder();
  const [expectedHash, suppliedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(env.ADMIN_API_TOKEN)),
    crypto.subtle.digest("SHA-256", encoder.encode(supplied))
  ]);
  const expected = new Uint8Array(expectedHash);
  const actual = new Uint8Array(suppliedHash);
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) difference |= expected[index] ^ actual[index];
  return difference === 0 ? null : mediaError("Invalid admin authorization.", 401);
}

async function handleMediaRoutes(request, env, pathname) {
  const db = env.DB;
  const bucket = env.AUDIO_BUCKET;
  const method = request.method;
  let match;

  if (method === "GET" && (match = pathname.match(/^\/api\/music\/(\d+)\/(audio|artwork)$/))) {
    const music = await db.prepare("SELECT r2_key, artwork_key, enabled FROM music_library WHERE id = ?")
      .bind(Number(match[1])).first();
    if (!music || match[2] === "audio" && Number(music.enabled) !== 1) return mediaError("Track not found.", 404);
    return mediaObject(request, bucket, match[2] === "audio" ? music.r2_key : music.artwork_key,
      match[2] === "audio" ? "audio/mpeg" : "image/jpeg");
  }
  if (method === "GET" && (match = pathname.match(/^\/api\/drops\/([^/]+)\/artwork$/))) {
    const drop = await db.prepare("SELECT artwork_key FROM station_drops WHERE slot_key = ?")
      .bind(decodeURIComponent(match[1])).first();
    return mediaObject(request, bucket, drop?.artwork_key, "image/jpeg");
  }
  if (method === "GET" && pathname === "/api/image-ads") {
    const result = await db.prepare("SELECT id, title, pool, image_key, enabled, uploaded_at FROM image_ads ORDER BY id DESC").all();
    return json({ ok: true, ads: result.results || [] });
  }
  if (method === "GET" && (match = pathname.match(/^\/api\/image-ads\/(\d+)\/image$/))) {
    const ad = await db.prepare("SELECT image_key FROM image_ads WHERE id = ?")
      .bind(Number(match[1])).first();
    return mediaObject(request, bucket, ad?.image_key, "image/jpeg");
  }
  if (method === "GET" && pathname === "/api/videos") {
    const result = await db.prepare("SELECT id, title, pool, video_key, thumbnail_key, enabled, uploaded_at FROM videos ORDER BY id DESC").all();
    return json({ ok: true, videos: result.results || [] });
  }
  if (method === "GET" && (match = pathname.match(/^\/api\/videos\/(\d+)\/(stream|thumbnail)$/))) {
    const video = await db.prepare("SELECT video_key, thumbnail_key, enabled FROM videos WHERE id = ?")
      .bind(Number(match[1])).first();
    if (!video || match[2] === "stream" && Number(video.enabled) !== 1) return mediaError("Video not found.", 404);
    return mediaObject(request, bucket, match[2] === "stream" ? video.video_key : video.thumbnail_key,
      match[2] === "stream" ? "video/mp4" : "image/jpeg");
  }

  if (method === "POST" && (match = pathname.match(/^\/api\/(music\/\d+|drops\/[^/]+|videos\/\d+)\/(artwork|thumbnail)$/))) {
    if (!bucket) return mediaError("R2 binding AUDIO_BUCKET is missing.", 500);
    const [, resource, field] = match;
    const form = await request.formData();
    const file = form.get(field);
    if (!imageFile(file)) return mediaError("Choose a JPEG, PNG, or WebP image under 8 MiB.");
    const section = resource.startsWith("music/") ? "music_library" :
      resource.startsWith("drops/") ? "station_drops" : "videos";
    const id = section === "station_drops" ? decodeURIComponent(resource.slice(6)) :
      Number(resource.split("/")[1]);
    const column = section === "videos" ? "thumbnail_key" : "artwork_key";
    const condition = section === "station_drops" ? "slot_key" : "id";
    const record = await db.prepare(`SELECT ${condition} FROM ${section} WHERE ${condition} = ?`).bind(id).first();
    if (!record) return mediaError("Media record not found.", 404);
    const key = await storeImage(bucket, file, `images/${section}`);
    if (!key) return mediaError("Image content does not match its file type.");
    await db.prepare(`UPDATE ${section} SET ${column} = ? WHERE ${condition} = ?`).bind(key, id).run();
    const updated = await db.prepare(`SELECT * FROM ${section} WHERE ${condition} = ?`).bind(id).first();
    return json({ ok: true, [section === "music_library" ? "music" : section === "station_drops" ? "drop" : "video"]: updated });
  }
  if (method === "PATCH" && (match = pathname.match(/^\/api\/(music|drops|image-ads)\/([^/]+)$/))) {
    const [, resource, idText] = match;
    const data = await request.json().catch(() => null);
    const table = resource === "music" ? "music_library" : resource === "drops" ? "station_drops" : "image_ads";
    const column = resource === "drops" ? "pool" : "enabled";
    const key = resource === "drops" ? "slot_key" : "id";
    const id = resource === "drops" ? decodeURIComponent(idText) : Number(idText);
    if (resource !== "drops" && !Number.isSafeInteger(id)) return mediaError("Invalid record ID.");
    if (column === "pool" ? !MEDIA_POOLS.has(data?.pool) : !validEnabled(data?.enabled)) {
      return mediaError(column === "pool" ? "Choose a valid genre pool." : "Choose an enabled status.");
    }
    const result = await db.prepare(`UPDATE ${table} SET ${column} = ? WHERE ${key} = ?`)
      .bind(column === "pool" ? data.pool : Number(data.enabled), id).run();
    if (!result.meta?.changes) return mediaError("Media record not found.", 404);
    const updated = await db.prepare(`SELECT * FROM ${table} WHERE ${key} = ?`).bind(id).first();
    return json({ ok: true, [resource === "image-ads" ? "ad" : resource === "drops" ? "drop" : "music"]: updated });
  }
  if (method === "POST" && pathname === "/api/image-ads/upload") {
    if (!bucket) return mediaError("R2 binding AUDIO_BUCKET is missing.", 500);
    const form = await request.formData();
    const image = form.get("image");
    const title = String(form.get("title") || "").trim().slice(0, 120);
    const pool = String(form.get("pool") || "");
    const enabled = form.get("enabled");
    if (!imageFile(image) || !title || !MEDIA_POOLS.has(pool) || !validEnabled(enabled)) {
      return mediaError("Supply an image, title, genre pool, and enabled status.");
    }
    const key = await storeImage(bucket, image, "images/ads");
    if (!key) return mediaError("Image content does not match its file type.");
    const inserted = await db.prepare("INSERT INTO image_ads (title, pool, image_key, enabled) VALUES (?, ?, ?, ?)")
      .bind(title, pool, key, Number(enabled)).run();
    const ad = await db.prepare("SELECT * FROM image_ads WHERE id = ?").bind(inserted.meta.last_row_id).first();
    return json({ ok: true, ad });
  }

  if (method === "POST" && pathname === "/api/videos/uploads") {
    if (!bucket) return mediaError("R2 binding AUDIO_BUCKET is missing.", 500);
    const data = await request.json().catch(() => null);
    const type = data?.contentType;
    const name = String(data?.filename || "");
    const title = String(data?.title || "").trim().slice(0, 120);
    if (!MEDIA_POOLS.has(data?.pool) || !title || !validEnabled(data?.enabled) ||
      !Number.isSafeInteger(data?.size) || data.size < 1 || data.size > MAX_VIDEO_BYTES ||
      !(type === "video/mp4" && /\.mp4$/i.test(name) || type === "video/webm" && /\.webm$/i.test(name))) {
      return mediaError("Supply one MP4 or WebM video, title, genre pool, and enabled status (2 GiB maximum).");
    }
    const key = mediaKey(`videos/${data.pool}`, name);
    const upload = await bucket.createMultipartUpload(key, { httpMetadata: { contentType: type } });
    try {
      await db.prepare("INSERT INTO pending_video_uploads (upload_id, video_key, title, pool, content_type, enabled, admin_subject) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(upload.uploadId, key, title, data.pool, type, Number(data.enabled), "admin").run();
    } catch (error) {
      await upload.abort();
      throw error;
    }
    return json({ ok: true, uploadId: upload.uploadId });
  }
  if ((match = pathname.match(/^\/api\/videos\/uploads\/([^/]+)\/(?:parts\/(\d+)|(complete))$/))) {
    const uploadId = decodeURIComponent(match[1]);
    const pending = await db.prepare("SELECT * FROM pending_video_uploads WHERE upload_id = ?")
      .bind(uploadId).first();
    if (!pending) return mediaError("Video upload not found.", 404);
    const multipart = bucket.resumeMultipartUpload(pending.video_key, uploadId);
    const age = Date.now() - Date.parse(`${pending.created_at.replace(" ", "T")}Z`);
    if (!Number.isFinite(age) || age > 24 * 60 * 60 * 1000) {
      await multipart.abort();
      await db.prepare("DELETE FROM pending_video_uploads WHERE upload_id = ?").bind(uploadId).run();
      return mediaError("Video upload expired. Start again.", 410);
    }
    if (method === "PUT" && match[2]) {
      const partNumber = Number(match[2]);
      const bytes = Number(request.headers.get("Content-Length"));
      if (!Number.isSafeInteger(partNumber) || partNumber < 1 || partNumber > 205 ||
        !request.body || (bytes && bytes > 12 * 1024 * 1024)) return mediaError("Invalid video part.");
      const part = await multipart.uploadPart(partNumber, request.body);
      return json({ ok: true, etag: part.etag });
    }
    if (method === "POST" && match[3]) {
      const data = await request.json().catch(() => null);
      const parts = data?.parts;
      if (!Array.isArray(parts) || parts.length < 1 || parts.length > 205 ||
        parts.some((part, index) => part?.partNumber !== index + 1 ||
          typeof part.etag !== "string" || !part.etag || part.etag.length > 200)) {
        return mediaError("Invalid video parts list.");
      }
      await multipart.complete(parts);
      const inserted = await db.prepare("INSERT INTO videos (title, pool, video_key, enabled) VALUES (?, ?, ?, ?)")
        .bind(pending.title, pending.pool, pending.video_key, pending.enabled).run();
      await db.prepare("DELETE FROM pending_video_uploads WHERE upload_id = ?").bind(uploadId).run();
      const video = await db.prepare("SELECT * FROM videos WHERE id = ?")
        .bind(inserted.meta.last_row_id).first();
      return json({ ok: true, video });
    }
  }
  return null;
}
export default {
  async fetch(request, env) {
    try {
      if (!env.DB) {
        return json(
          {
            ok: false,
            error: "D1 binding DB is missing."
          },
          500
        );
      }
      await ensureDatabase(
        env.DB
      );
      const url =
        new URL(
          request.url
        );
      const pathname =
        url.pathname;
      if (
        request.method === "OPTIONS"
      ) {
        return new Response(
          null,
          {
            status: 204,
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, OPTIONS",
              "Access-Control-Allow-Headers": "Content-Type, Authorization, Range",
              "Access-Control-Max-Age": "600"
            }
          }
        );
      }
      if (pathname.startsWith("/api/") && !["GET", "HEAD"].includes(request.method)) {
        const rejected = await authorizeWrite(request, env);
        if (rejected) return rejected;
      }
      const mediaResponse = await handleMediaRoutes(request, env, pathname);
      if (mediaResponse) return mediaResponse;
      if (
        request.method === "GET" &&
        pathname === "/"
      ) {
        return json({
          ok: true,
          service: "AV Junki Radio Admin API",
          message: "Admin backend is online."
        });
      }
      if (
  request.method === "GET" &&
  pathname === "/api/health"
) {
  const result =
    await env.DB
      .prepare(`
        SELECT COUNT(*) AS total
        FROM station_drops
      `)
      .first();
  return json({
    ok: true,
    database: "connected",
    audioBucket:
      env.AUDIO_BUCKET
        ? "connected"
        : "missing",
    dropCount:
      Number(
        result?.total || 0
      )
  });
}
      if (
        request.method === "GET" &&
        pathname === "/api/drops"
      ) {
        const result =
          await env.DB
            .prepare(`
              SELECT
                slot_key,
                title,
                artist,
                original_filename,
                source_path,
                r2_key,
                artwork_key,
                pool,
                duration_seconds,
                enabled,
                version,
                updated_at
              FROM station_drops
              ORDER BY id ASC
            `)
            .all();
        return json({
          ok: true,
          drops:
            result.results || []
        });
      }
      if (
        request.method === "GET" &&
        pathname.startsWith(
          "/api/drops/"
        )
      ) {
        const slot =
          decodeURIComponent(
            pathname.replace(
              "/api/drops/",
              ""
            )
          );
        const drop =
          await env.DB
            .prepare(`
              SELECT
                slot_key,
                title,
                artist,
                original_filename,
                source_path,
                r2_key,
                artwork_key,
                pool,
                duration_seconds,
                enabled,
                version,
                updated_at
              FROM station_drops
              WHERE slot_key = ?
              LIMIT 1
            `)
            .bind(
              slot
            )
            .first();
        if (!drop) {
          return json(
            {
              ok: false,
              error: "Drop not found."
            },
            404
          );
        }
        return json({
          ok: true,
          drop
        });
      }
      // Replace a station drop with an uploaded MP3.
      if (
        request.method === "POST" &&
        pathname.startsWith("/api/drops/") &&
        pathname.endsWith("/upload")
      ) {
        if (!env.AUDIO_BUCKET) {
          return json(
            {
              ok: false,
              error: "R2 binding AUDIO_BUCKET is missing."
            },
            500
          );
        }
        const slot =
          decodeURIComponent(
            pathname
              .replace("/api/drops/", "")
              .replace("/upload", "")
          );
        const existingDrop =
          await env.DB
            .prepare(`
              SELECT
                slot_key,
                title,
                artist,
                original_filename,
                source_path,
                r2_key,
                artwork_key,
                pool,
                duration_seconds,
                enabled,
                version,
                updated_at
              FROM station_drops
              WHERE slot_key = ?
              LIMIT 1
            `)
            .bind(slot)
            .first();
        if (!existingDrop) {
          return json(
            {
              ok: false,
              error: "Drop slot not found."
            },
            404
          );
        }
        const contentType =
          request.headers.get("Content-Type") || "";
        if (!contentType.includes("multipart/form-data")) {
          return json(
            {
              ok: false,
              error: "Upload must use multipart/form-data."
            },
            400
          );
        }
        const formData =
          await request.formData();
        const file =
          formData.get("file");
        const durationValue =
          formData.get("duration");
        const pool = String(formData.get("pool") || existingDrop.pool || "jazz");
        const artwork = formData.get("artwork");
        if (!MEDIA_POOLS.has(pool) || artwork && !imageFile(artwork) || !(await mp3File(file))) {
          return mediaError("Supply a valid MP3, optional image, and genre pool.");
        }
        if (
          !file ||
          typeof file === "string" ||
          typeof file.arrayBuffer !== "function"
        ) {
          return json(
            {
              ok: false,
              error: "No audio file was supplied."
            },
            400
          );
        }
        const allowedTypes = [
          "audio/mpeg",
          "audio/mp3"
        ];
        if (
          file.type &&
          !allowedTypes.includes(file.type)
        ) {
          return json(
            {
              ok: false,
              error: "Only MP3 files are accepted right now."
            },
            400
          );
        }
        const duration =
          Number(durationValue);
        if (
          !Number.isFinite(duration) ||
          duration <= 0
        ) {
          return json(
            {
              ok: false,
              error: "A valid audio duration is required."
            },
            400
          );
        }
        const safeFilename =
          String(file.name || `${slot}.mp3`)
            .replace(/[^a-zA-Z0-9._-]/g, "_");
        const nextVersion =
          Number(existingDrop.version || 0) + 1;
        const r2Key =
          `station-drops/${slot}/v${nextVersion}/${safeFilename}`;
        await env.AUDIO_BUCKET.put(
          r2Key,
          file.stream(),
          {
            httpMetadata: {
              contentType:
                file.type || "audio/mpeg"
            },
            customMetadata: {
              slot,
              version:
                String(nextVersion),
              duration:
                String(duration)
            }
          }
        );
        const artworkKey = artwork
          ? await storeImage(env.AUDIO_BUCKET, artwork, "images/drops")
          : existingDrop.artwork_key;
        if (artwork && !artworkKey) {
          await env.AUDIO_BUCKET.delete(r2Key);
          return mediaError("Artwork content does not match its file type.");
        }
        await env.DB
          .prepare(`
            UPDATE station_drops
            SET
              original_filename = ?,
              r2_key = ?,
              artwork_key = ?,
              pool = ?,
              duration_seconds = ?,
              version = ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE slot_key = ?
          `)
          .bind(
            safeFilename,
            r2Key,
            artworkKey,
            pool,
            duration,
            nextVersion,
            slot
          )
          .run();
        const updatedDrop =
          await env.DB
            .prepare(`
              SELECT
                slot_key,
                title,
                artist,
                original_filename,
                source_path,
                r2_key,
                artwork_key,
                pool,
                duration_seconds,
                enabled,
                version,
                updated_at
              FROM station_drops
              WHERE slot_key = ?
              LIMIT 1
            `)
            .bind(slot)
            .first();
        return json({
          ok: true,
          message: "Station drop uploaded successfully.",
          drop: updatedDrop
        });
      }
      // Upload an MP3 to the music library.
    if (
      request.method === "POST" &&
      pathname === "/api/music/upload"
    ) {
      if (!env.AUDIO_BUCKET) {
        return json(
          {
            ok: false,
            error: "R2 binding AUDIO_BUCKET is missing."
          },
          500
        );
      }
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS music_library (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          genre TEXT NOT NULL,
          original_filename TEXT NOT NULL,
          r2_key TEXT NOT NULL,
          duration_seconds REAL NOT NULL,
          enabled INTEGER NOT NULL DEFAULT 1,
          uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `).run();
      const contentType =
        request.headers.get("Content-Type") || "";
      if (!contentType.includes("multipart/form-data")) {
        return json(
          {
            ok: false,
            error: "Upload must use multipart/form-data."
          },
          400
        );
      }
      const formData =
        await request.formData();
      const file =
        formData.get("file");
      const genre =
        String(formData.get("genre") || "").trim();
      const duration =
        Number(formData.get("duration"));
      const enabled = formData.get("enabled") ?? "1";
      const artwork = formData.get("artwork");
      if (!validEnabled(enabled) || artwork && !imageFile(artwork) || !(await mp3File(file))) {
        return mediaError("Supply a valid MP3, optional image, and enabled status.");
      }
      if (
        !file ||
        typeof file === "string" ||
        typeof file.arrayBuffer !== "function"
      ) {
        return json(
          {
            ok: false,
            error: "No audio file was supplied."
          },
          400
        );
      }
      const allowedGenres = [
        "jazz",
        "hip-hop",
        "rnb",
        "house",
        "reggae",
        "gospel",
        "podcast",
        "unassigned"
      ];
      if (!allowedGenres.includes(genre)) {
        return json(
          {
            ok: false,
            error: "A valid genre is required."
          },
          400
        );
      }
      const allowedTypes = [
        "audio/mpeg",
        "audio/mp3"
      ];
      if (
        file.type &&
        !allowedTypes.includes(file.type)
      ) {
        return json(
          {
            ok: false,
            error: "Only MP3 files are accepted right now."
          },
          400
        );
      }
      if (
        !Number.isFinite(duration) ||
        duration <= 0
      ) {
        return json(
          {
            ok: false,
            error: "A valid audio duration is required."
          },
          400
        );
      }
      const safeFilename =
        String(file.name || "audio.mp3")
          .replace(/[^a-zA-Z0-9._-]/g, "_");
      const uniqueId =
        `${Date.now()}-${crypto.randomUUID()}`;
      const r2Key =
        `music/${genre}/${uniqueId}-${safeFilename}`;
      await env.AUDIO_BUCKET.put(
        r2Key,
        file.stream(),
        {
          httpMetadata: {
            contentType:
              file.type || "audio/mpeg"
          },
          customMetadata: {
            genre,
            duration:
              String(duration),
            originalFilename:
              safeFilename
          }
        }
      );
      const artworkKey = artwork
        ? await storeImage(env.AUDIO_BUCKET, artwork, "images/music") : "";
      if (artwork && !artworkKey) {
        await env.AUDIO_BUCKET.delete(r2Key);
        return mediaError("Artwork content does not match its file type.");
      }
      const result =
        await env.DB
          .prepare(`
            INSERT INTO music_library (
              genre,
              original_filename,
              r2_key,
              duration_seconds,
              artwork_key,
              enabled
            )
            VALUES (?, ?, ?, ?, ?, ?)
          `)
          .bind(
            genre,
            safeFilename,
            r2Key,
            duration,
            artworkKey,
            Number(enabled)
          )
          .run();
      return json({
        ok: true,
        message: "Audio uploaded successfully.",
        music: {
          id: result.meta?.last_row_id ?? null,
          genre,
          original_filename: safeFilename,
          r2_key: r2Key,
          duration_seconds: duration,
          artwork_key: artworkKey,
          enabled: Number(enabled)
        }
      });
    }
      // List music tracks for the admin and public player.
if (
  request.method === "GET" &&
  pathname === "/api/music"
) {
  const result =
    await env.DB
      .prepare(`
        SELECT
          id,
          genre,
          original_filename,
          r2_key,
          artwork_key,
          duration_seconds,
          enabled,
          uploaded_at
        FROM music_library
        ORDER BY uploaded_at DESC, id DESC
      `)
      .all();
  return json({
    ok: true,
    music: result.results || []
  });
}
      if (
        request.method === "GET" &&
        pathname.startsWith("/api/audio/")
      ) {
        if (!env.AUDIO_BUCKET) {
          return json(
            {
              ok: false,
              error: "R2 binding AUDIO_BUCKET is missing."
            },
            500
          );
        }
        const slot =
          decodeURIComponent(
            pathname.replace(
              "/api/audio/",
              ""
            )
          );
        const drop =
          await env.DB
            .prepare(`
              SELECT
                slot_key,
                r2_key,
                enabled
              FROM station_drops
              WHERE slot_key = ?
              LIMIT 1
            `)
            .bind(slot)
            .first();
        if (
          !drop ||
          !drop.r2_key ||
          Number(drop.enabled) !== 1
        ) {
          return json(
            {
              ok: false,
              error: "Audio file not found."
            },
            404
          );
        }
        return mediaObject(request, env.AUDIO_BUCKET, drop.r2_key, "audio/mpeg");
      }
      return json(
        {
          ok: false,
          error: "Route not found."
        },
        404
      );
    } catch (error) {
      console.error(
        "AV Junki Radio Admin API error:",
        error
      );
      return json(
        {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : String(error)
        },
        500
      );
    }
  }
};
