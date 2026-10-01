/* Independent, cached information feeds. These handlers use no D1/R2 bindings. */
const INFO_TTL = {weather: 300, sports: 60, markets: 120, traffic: 300, news: 600};
const infoMemory = new Map();
const infoPending = new Map();
const INFO_AGENT = "AVJunkiRadio/1.0 (+https://avjunkiradio.com)";

function infoResponse(data, status = 200, ttl = 30) {
  return new Response(JSON.stringify(data), {status, headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Cache-Control": `public, max-age=${ttl}`,
    "X-Content-Type-Options": "nosniff"
  }});
}

async function infoRead(url, format = "json") {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, {signal: controller.signal, headers: {
      "User-Agent": INFO_AGENT,
      "Accept": format === "json" ? "application/json, application/geo+json" : "application/rss+xml, application/xml, text/xml"
    }});
    if (!response.ok) throw new Error(`Information source returned ${response.status}`);
    const body = await response.text();
    if (body.length > 2_000_000) throw new Error("Information response too large");
    return format === "json" ? JSON.parse(body) : body;
  } finally {
    clearTimeout(timer);
  }
}

function infoText(value, max = 240) {
  return String(value || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]*>/g, "").replace(/&#(x[\da-f]+|\d+);/gi, (_, n) => {
      const point = n[0].toLowerCase() === "x" ? parseInt(n.slice(1), 16) : Number(n);
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : "";
    }).replace(/&(amp|lt|gt|quot|apos|nbsp);/gi, (_, name) => ({amp:"&",lt:"<",gt:">",quot:'"',apos:"'",nbsp:" "})[name.toLowerCase()])
    .replace(/\s+/g, " ").trim().slice(0, max);
}

function infoDate(value) {
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : null;
}

function infoFahrenheit(value, unit) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return unit === "F" || /degF$/.test(unit) ? value : value * 9 / 5 + 32;
}

async function infoWeather() {
  const readings = await Promise.allSettled([
    infoRead("https://api.weather.gov/stations/KHND/observations/latest"),
    infoRead("https://api.weather.gov/stations/KLAS/observations/latest"),
    infoRead("https://api.weather.gov/points/36.0395,-114.9817")
  ]);
  const observations = readings.slice(0, 2).filter(x => x.status === "fulfilled")
    .map(x => x.value.properties).filter(x => x && typeof x.temperature?.value === "number" &&
      Number.isFinite(x.temperature.value) && Date.now() - Date.parse(x.timestamp) < 2 * 60 * 60_000 &&
      Date.parse(x.timestamp) <= Date.now() + 5 * 60_000);
  const observed = observations[0] || observations[1];
  if (!observed) throw new Error("Current weather observation unavailable");
  let high = null, low = null;
  const forecastUrl = readings[2].status === "fulfilled" && readings[2].value.properties?.forecast;
  if (forecastUrl && new URL(forecastUrl).origin === "https://api.weather.gov") {
    try {
      const forecast = await infoRead(forecastUrl);
      const periods = forecast.properties?.periods || [];
      const day = periods.find(p => p.isDaytime);
      const night = periods.find(p => !p.isDaytime);
      high = infoFahrenheit(day?.temperature, day?.temperatureUnit);
      low = infoFahrenheit(night?.temperature, night?.temperatureUnit);
    } catch { /* Current observations can still be shown when forecasts are late. */ }
  }
  return {
    source: "National Weather Service", location: "Henderson, NV",
    temperature: infoFahrenheit(observed.temperature.value, observed.temperature.unitCode),
    condition: infoText(observed.textDescription || "Conditions unavailable", 60),
    observedAt: infoDate(observed.timestamp), high, low,
    rangeLabel: "Next daytime high / nighttime low"
  };
}

const INFO_LEAGUES = [
  {path: "football/nfl", league: "NFL", sport: "FOOTBALL", local: "LV"},
  {path: "basketball/wnba", league: "WNBA", sport: "BASKETBALL", local: "LV"},
  {path: "basketball/nba", league: "NBA", sport: "BASKETBALL"},
  {path: "baseball/mlb", league: "MLB", sport: "BASEBALL"},
  {path: "hockey/nhl", league: "NHL", sport: "HOCKEY", local: "VGK"},
  {path: "soccer/usa.1", league: "MLS", sport: "SOCCER"}
];

function infoGame(event, config) {
  const competition = event.competitions?.[0];
  const competitors = competition?.competitors || [];
  if (competitors.length !== 2) return null;
  const a = competitors.find(x => x.homeAway === "away") || competitors[0];
  const b = competitors.find(x => x.homeAway === "home") || competitors[1];
  const type = competition.status?.type || event.status?.type;
  if (!a.team?.abbreviation || !b.team?.abbreviation || !type?.state) return null;
  const score = competitor => type.state === "pre" ? "--" : /^\d{1,3}$/.test(String(competitor.score)) ? String(competitor.score) : "--";
  const link = event.links?.find(x => /^https:\/\/(www\.)?espn\.com\//.test(x.href || ""))?.href || "https://www.espn.com/";
  return {
    league: config.league, sport: config.sport,
    teamA: infoText(a.team.abbreviation, 5), teamB: infoText(b.team.abbreviation, 5),
    scoreA: score(a), scoreB: score(b), state: type.state,
    scheduled: type.name === "STATUS_SCHEDULED",
    status: infoText(type.shortDetail || type.detail || type.description, 80),
    date: infoDate(competition.date || event.date), fullName: infoText(event.name, 160), link
  };
}

async function infoSports() {
  const results = await Promise.allSettled(INFO_LEAGUES.map(async config => {
    let board;
    try {
      board = await infoRead(`https://site.api.espn.com/apis/site/v2/sports/${config.path}/scoreboard`);
    } catch {
      board = await infoRead(`https://site.web.api.espn.com/apis/site/v2/sports/${config.path}/scoreboard`);
    }
    if (!Array.isArray(board.events)) throw new Error("Sports response invalid");
    const games = board.events.map(event => infoGame(event, config)).filter(Boolean);
    const rank = game => (game.state === "in" ? 0 : game.state === "pre" ? 2 : 4) -
      (config.local && [game.teamA, game.teamB].includes(config.local) ? 1 : 0);
    games.sort((a,b) => rank(a) - rank(b) || (a.state === "post" ? Date.parse(b.date) - Date.parse(a.date) : Date.parse(a.date) - Date.parse(b.date)));
    return games.slice(0, 4);
  }));
  if (results.every(x => x.status === "rejected")) throw new Error("Sports feeds unavailable");
  const lists = results.map(x => x.status === "fulfilled" ? x.value : []);
  const games = [];
  // Interleave leagues, so every league with games appears in the first rotation.
  for (let slot = 0; slot < 4; slot++) for (const list of lists) if (list[slot]) games.push(list[slot]);
  return {source: "ESPN", games, unavailableLeagues: results.flatMap((x,i) => x.status === "rejected" ? [INFO_LEAGUES[i].league] : [])};
}

function infoMarketDate(seconds) {
  return new Intl.DateTimeFormat("en-CA", {timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(seconds * 1000));
}

async function infoMarkets() {
  const data = await infoRead("https://query1.finance.yahoo.com/v8/finance/chart/%5EDJI?interval=1d&range=5d");
  const chart = data.chart?.result?.[0], meta = chart?.meta;
  const value = meta?.regularMarketPrice, seconds = meta?.regularMarketTime;
  if (typeof value !== "number" || !Number.isFinite(value) || !(seconds > 0)) throw new Error("Market quote invalid");
  const closes = chart.indicators?.quote?.[0]?.close || [];
  const previous = (chart.timestamp || []).map((timestamp,i) => ({timestamp,close:closes[i]}))
    .filter(x => typeof x.close === "number" && Number.isFinite(x.close) && infoMarketDate(x.timestamp) < infoMarketDate(seconds)).at(-1)?.close;
  if (!(previous > 0)) throw new Error("Previous trading close unavailable");
  const change = value - previous;
  const regular = meta.currentTradingPeriod?.regular;
  const now = Date.now() / 1000;
  return {
    source: "Yahoo Finance", symbol: "^DJI", value, change, percent: change / previous * 100,
    quoteAt: new Date(seconds * 1000).toISOString(), delayed: true,
    marketOpen: Boolean(regular && now >= regular.start && now < regular.end)
  };
}

function infoPacificDate(value) {
  const parts = String(value || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4}),?\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!parts) return null;
  const year = Number(parts[3]) < 100 ? 2000 + Number(parts[3]) : Number(parts[3]);
  const hour = Number(parts[4]) % 12 + (parts[6].toUpperCase() === "PM" ? 12 : 0);
  const civil = Date.UTC(year, Number(parts[1]) - 1, Number(parts[2]), hour, Number(parts[5]));
  const offset = new Intl.DateTimeFormat("en-US", {timeZone:"America/Los_Angeles",timeZoneName:"longOffset"})
    .formatToParts(new Date(civil)).find(part => part.type === "timeZoneName")?.value.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!offset) return null;
  const minutes = (Number(offset[2]) * 60 + Number(offset[3])) * (offset[1] === "+" ? 1 : -1);
  return civil - minutes * 60_000;
}

async function infoTraffic() {
  // This is the public Nevada 511 text-report data, not its keyed developer API.
  const layers = ["Incidents", "Closures", "Construction"];
  const markerResults = await Promise.all(layers.map(layer => infoRead(`https://www.nvroads.com/map/mapIcons/${layer}`)));
  const localIds = new Set();
  for (let i = 0; i < layers.length; i++) {
    const markers = markerResults[i].item2;
    if (!Array.isArray(markers)) throw new Error("Traffic locations unavailable");
    for (const marker of markers) {
      const [latitude, longitude] = marker.location || [];
      if (typeof latitude === "number" && typeof longitude === "number" && latitude >= 35.7 && latitude <= 36.5 && longitude >= -115.6 && longitude <= -114.6) {
        localIds.add(`${layers[i]}:${marker.itemId}`);
      }
    }
  }
  const rows = [];
  let complete = false;
  for (let page = 0; page < 5; page++) {
    const url = new URL("https://www.nvroads.com/List/GetData/traffic");
    url.searchParams.set("query", JSON.stringify({start:page * 100,length:100,columns:[],order:[],search:{value:""}}));
    url.searchParams.set("lang", "en");
    const data = await infoRead(url.href);
    if (!Array.isArray(data.data) || !Number.isFinite(data.recordsFiltered)) throw new Error("Traffic response invalid");
    rows.push(...data.data);
    if (rows.length >= data.recordsFiltered) {complete = true; break;}
    if (!data.data.length) break;
  }
  if (!complete) throw new Error("Complete Nevada traffic report unavailable");
  const events = rows.filter(event => localIds.has(`${event.layerName}:${event.DT_RowId}`))
    .map(event => {
      const condition = infoText(String(event.eventSubType || event.type || "Traffic alert").replace(/([a-z])([A-Z])/g, "$1 $2"));
      const start = infoPacificDate(event.startDate);
      const planned = start !== null && start > Date.now();
      return {
        route: infoText(`${event.roadwayName || "Las Vegas"}${event.locationDescription ? " · " + event.locationDescription : ""}`, 160),
        condition: infoText((planned ? "Planned " : "") + condition + (event.laneDescription ? " · " + event.laneDescription : ""), 160),
        description: infoText(event.description, 400), updated: infoText(event.lastUpdated, 40),
        priority: (event.isFullClosure ? 0 : event.type === "Incidents" ? 1 : event.type === "Closures" ? 2 : 3) + (planned ? 10 : 0),
        link: "https://www.nvroads.com/list/events/traffic"
      };
    }).sort((a,b) => a.priority - b.priority).slice(0, 8);
  return {source: "Nevada 511", region: "Henderson / Las Vegas", events};
}

async function infoNews() {
  const xml = await infoRead("https://rss.dw.com/rdf/rss-en-world", "xml");
  const get = (item, name) => infoText(item.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, "i"))?.[1], 500);
  const items = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map(match => {
    const item = match[1];
    return {title:get(item,"title"),link:get(item,"link"),publishedAt:infoDate(get(item,"pubDate") || get(item,"dc:date"))};
  }).filter(item => item.title && /^https:\/\/(?:www\.|amp\.)?dw\.com\//.test(item.link) && item.publishedAt &&
    Date.now() - Date.parse(item.publishedAt) < 48 * 60 * 60_000 && Date.parse(item.publishedAt) <= Date.now() + 5 * 60_000)
    .sort((a,b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)).slice(0, 5);
  if (!items.length) throw new Error("Current world headlines unavailable");
  return {source: "DW News", items};
}

async function fetchInformation(request) {
  const url = new URL(request.url);
  const name = url.pathname.slice("/api/info/".length);
  if (!Object.hasOwn(INFO_TTL, name)) return infoResponse({ok:false,error:"Information feed not found"}, 404);
  if (request.method === "OPTIONS") return new Response(null, {status:204,headers:{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET, HEAD, OPTIONS"}});
  if (!["GET", "HEAD"].includes(request.method)) return infoResponse({ok:false,error:"Information feeds are read-only"}, 405);
  const ttl = INFO_TTL[name];
  const cacheKey = new Request(url.origin + url.pathname);
  const edge = globalThis.caches?.default;
  try {
    const cached = await edge?.match(cacheKey);
    if (cached) return request.method === "HEAD" ? new Response(null, {headers:cached.headers}) : cached;
  } catch { /* A cache failure must not block the feed. */ }
  const memory = infoMemory.get(name);
  if (memory && memory.expires > Date.now()) {
    const response = infoResponse(memory.data, 200, Math.max(1, Math.floor((memory.expires - Date.now()) / 1000)));
    return request.method === "HEAD" ? new Response(null, {headers:response.headers}) : response;
  }
  try {
    if (!infoPending.has(name)) {
      const loader = {weather:infoWeather,sports:infoSports,markets:infoMarkets,traffic:infoTraffic,news:infoNews}[name];
      const pending = loader().then(payload => {
        const now = Date.now();
        const data = {ok:true,...payload,fetchedAt:new Date(now).toISOString()};
        infoMemory.set(name, {data,expires:now + ttl * 1000});
        return data;
      }).finally(() => infoPending.delete(name));
      infoPending.set(name, pending);
    }
    const data = await infoPending.get(name);
    const response = infoResponse(data, 200, ttl);
    try {await edge?.put(cacheKey, response.clone());} catch { /* Optional caching only. */ }
    return request.method === "HEAD" ? new Response(null, {headers:response.headers}) : response;
  } catch {
    return infoResponse({ok:false,source:name,error:"Information feed temporarily unavailable"}, 503);
  }
}

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
    ["station_drops", "pool", "TEXT NOT NULL DEFAULT 'jazz'"],
    ["station_drops", "stations", "TEXT NOT NULL DEFAULT ''"]
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
const DROP_STATIONS = new Set(["jazz", "hip-hop", "rnb", "house", "reggae", "gospel"]);

function validStations(stations) {
  return Array.isArray(stations) && stations.length > 0 && stations.length <= DROP_STATIONS.size &&
    new Set(stations).size === stations.length && stations.every((station) => DROP_STATIONS.has(station));
}

function poolForStations(stations) {
  const first = stations[0];
  return first === "hip-hop" || first === "rnb" || first === "house" ? "nightlife" : first;
}
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
  if (method === "POST" && pathname === "/api/drops/upload") {
    if (!bucket) return mediaError("R2 binding AUDIO_BUCKET is missing.", 500);
    if (!(request.headers.get("Content-Type") || "").includes("multipart/form-data")) {
      return mediaError("Upload must use multipart/form-data.");
    }
    const form = await request.formData();
    const file = form.get("file");
    const artwork = form.get("artwork");
    const title = String(form.get("title") || "").trim();
    const artist = String(form.get("artist") || "AV Junki Radio").trim();
    const duration = Number(form.get("duration"));
    const enabled = form.get("enabled");
    let stations;
    try { stations = JSON.parse(String(form.get("stations") || "")); } catch { stations = null; }
    if (!title || title.length > 120 || !artist || artist.length > 120 ||
        !Number.isFinite(duration) || duration <= 0 || duration > 24 * 60 * 60 ||
        !validEnabled(enabled) || !validStations(stations) ||
        artwork && !imageFile(artwork) || !(await mp3File(file))) {
      return mediaError("Supply a title, valid MP3, station selection, duration, status, and optional image.");
    }
    const slot = `drop-${crypto.randomUUID()}`;
    const filename = safeName(file.name);
    const r2Key = mediaKey(`station-drops/${slot}`, filename);
    let artworkKey = "";
    try {
      await bucket.put(r2Key, file.stream(), {
        httpMetadata: { contentType: "audio/mpeg" },
        customMetadata: { slot, version: "1", duration: String(duration) }
      });
      if (artwork) {
        artworkKey = await storeImage(bucket, artwork, "images/drops");
        if (!artworkKey) {
          await bucket.delete(r2Key);
          return mediaError("Artwork content does not match its file type.");
        }
      }
      await db.prepare(`INSERT INTO station_drops
        (slot_key, title, artist, original_filename, source_path, r2_key,
         artwork_key, pool, stations, duration_seconds, enabled)
        VALUES (?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?)`).bind(
        slot, title, artist, filename, r2Key, artworkKey,
        poolForStations(stations), JSON.stringify(stations), duration, Number(enabled)
      ).run();
    } catch (error) {
      await bucket.delete(r2Key);
      if (artworkKey) await bucket.delete(artworkKey);
      throw error;
    }
    const drop = await db.prepare("SELECT * FROM station_drops WHERE slot_key = ?").bind(slot).first();
    return json({ ok: true, drop }, 201);
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
  if (method === "PATCH" && (match = pathname.match(/^\/api\/drops\/([^/]+)$/))) {
    const slot = decodeURIComponent(match[1]);
    const data = await request.json().catch(() => null);
    const existing = await db.prepare("SELECT * FROM station_drops WHERE slot_key = ?").bind(slot).first();
    if (!existing) return mediaError("Drop not found.", 404);
    if (!data || typeof data !== "object" ||
        !Object.hasOwn(data, "stations") && !Object.hasOwn(data, "pool") && !Object.hasOwn(data, "enabled")) {
      return mediaError("Choose stations or an enabled status.");
    }
    let stations = existing.stations;
    let pool = existing.pool;
    if (Object.hasOwn(data, "stations")) {
      if (!validStations(data.stations)) return mediaError("Choose one or more valid stations.");
      stations = JSON.stringify(data.stations);
      pool = poolForStations(data.stations);
    } else if (Object.hasOwn(data, "pool")) {
      if (!MEDIA_POOLS.has(data.pool)) return mediaError("Choose a valid genre pool.");
      pool = data.pool;
      stations = ""; // Existing clients can continue to use their shared genre pool.
    }
    const enabled = Object.hasOwn(data, "enabled") ? data.enabled : existing.enabled;
    if (!validEnabled(enabled)) return mediaError("Choose an enabled status.");
    await db.prepare(`UPDATE station_drops SET stations = ?, pool = ?, enabled = ?,
      updated_at = CURRENT_TIMESTAMP WHERE slot_key = ?`)
      .bind(stations, pool, Number(enabled), slot).run();
    const drop = await db.prepare("SELECT * FROM station_drops WHERE slot_key = ?").bind(slot).first();
    return json({ ok: true, drop });
  }
  if (method === "PATCH" && (match = pathname.match(/^\/api\/(music|image-ads)\/([^/]+)$/))) {
    const [, resource, idText] = match;
    const data = await request.json().catch(() => null);
    const table = resource === "music" ? "music_library" : "image_ads";
    const column = "enabled";
    const key = "id";
    const id = Number(idText);
    if (!Number.isSafeInteger(id) || !validEnabled(data?.enabled)) return mediaError("Choose an enabled status.");
    const result = await db.prepare(`UPDATE ${table} SET ${column} = ? WHERE ${key} = ?`)
      .bind(Number(data.enabled), id).run();
    if (!result.meta?.changes) return mediaError("Media record not found.", 404);
    const updated = await db.prepare(`SELECT * FROM ${table} WHERE ${key} = ?`).bind(id).first();
    return json({ ok: true, [resource === "image-ads" ? "ad" : "music"]: updated });
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
const STATION_TOPICS = new Set(["General enquiry", "Listener feedback", "Technical help", "Artist submission", "Podcast pitch", "Event submission", "Advertising", "Sponsorship", "Merchandise", "Community"]);
const STATION_ORIGINS = new Set(["https://avjunkiradio.com", "https://www.avjunkiradio.com"]);
const stationSchemas = new WeakMap();

function stationResponse(request, data, status = 200) {
  const origin = request.headers.get("Origin");
  return new Response(JSON.stringify(data), {status,headers:{
    "Content-Type":"application/json; charset=utf-8",
    "Cache-Control":"no-store",
    "Access-Control-Allow-Origin":STATION_ORIGINS.has(origin) ? origin : "https://avjunkiradio.com",
    "Vary":"Origin",
    "X-Content-Type-Options":"nosniff"
  }});
}

async function ensureStationMessages(db) {
  if (!stationSchemas.has(db)) {
    const ready = db.batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS station_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        submission_id TEXT NOT NULL UNIQUE,
        reference TEXT NOT NULL UNIQUE,
        purpose TEXT NOT NULL,
        topic TEXT NOT NULL,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        message TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','read','archived')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS station_message_limits (
        bucket INTEGER NOT NULL,
        sender_hash TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (bucket, sender_hash)
      )`)
    ]).catch(error => {stationSchemas.delete(db);throw error;});
    stationSchemas.set(db,ready);
  }
  await stationSchemas.get(db);
}

async function stationBody(request) {
  if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) return {error:"Send a JSON message.",status:415};
  if (Number(request.headers.get("Content-Length")) > 16_384) return {error:"The message is too long.",status:413};
  const reader = request.body?.getReader();
  if (!reader) return {error:"Supply a message.",status:400};
  const chunks = [];
  let length = 0;
  while (true) {
    const {value,done} = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 16_384) {await reader.cancel();return {error:"The message is too long.",status:413};}
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {bytes.set(chunk,offset);offset += chunk.byteLength;}
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid body");
    return {value};
  } catch {return {error:"Supply a valid JSON message.",status:400};}
}

async function handleStationRoutes(request, env) {
  const parsed = new URL(request.url), path = parsed.pathname, method = request.method;
  const item = path.match(/^\/api\/station\/inbox\/(\d+)$/);
  const publicMessage = path === "/api/station/messages";
  const inbox = path === "/api/station/inbox";
  const respond = (data,status) => stationResponse(request,data,status);
  if (!publicMessage && !inbox && !item) return respond({ok:false,error:"Station route not found."},404);
  if (method === "OPTIONS") {
    const headers = new Headers(stationResponse(request,{}).headers);
    headers.set("Access-Control-Allow-Methods","GET, POST, PATCH, OPTIONS");
    headers.set("Access-Control-Allow-Headers","Content-Type, Authorization");
    headers.set("Access-Control-Max-Age","600");
    return new Response(null,{status:204,headers});
  }
  if (!(publicMessage && method === "POST" || inbox && method === "GET" || item && method === "PATCH")) return respond({ok:false,error:"Method not allowed."},405);
  if (!publicMessage) {
    const rejected = await authorizeWrite(request,env);
    if (rejected) {
      const detail = await rejected.json();
      return respond(detail,rejected.status);
    }
  } else if (!STATION_ORIGINS.has(request.headers.get("Origin"))) {
    return respond({ok:false,error:"Send your enquiry from avjunkiradio.com."},403);
  }
  let input;
  if (method !== "GET") {
    const body = await stationBody(request);
    if (body.error) return respond({ok:false,error:body.error},body.status);
    input = body.value;
  }
  if (publicMessage) {
    // Quietly discard the hidden field used by form-filling bots.
    if (typeof input.website === "string" && input.website.trim()) return respond({ok:true},202);
    const validText = (value,min,max) => typeof value === "string" && value.trim().length >= min && value.trim().length <= max && !/[\u0000]/.test(value);
    if (!validText(input.name,2,80) || !validText(input.email,3,254) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email.trim()) ||
        !validText(input.message,10,3000) || !STATION_TOPICS.has(input.topic) || !["contact","inquiry","advertise"].includes(input.purpose) || input.consent !== true ||
        typeof input.submissionId !== "string" || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(input.submissionId)) {
      return respond({ok:false,error:"Supply your name, a valid email, a message of 10–3000 characters, a topic and permission to reply."},400);
    }
  } else if (item && !["new","read","archived"].includes(input.status)) {
    return respond({ok:false,error:"Choose new, read or archived."},400);
  }
  if (!env.DB) return respond({ok:false,error:"The station inbox is unavailable. Please try again later."},503);
  await ensureStationMessages(env.DB);
  if (publicMessage) {
    const previous = await env.DB.prepare("SELECT reference FROM station_messages WHERE submission_id = ?").bind(input.submissionId).first();
    if (previous) return respond({ok:true,reference:previous.reference},202);
    const bucket = Math.floor(Date.now() / 3_600_000);
    const sender = `${env.ADMIN_API_TOKEN || "AV-Junki-station"}:${bucket}:${request.headers.get("CF-Connecting-IP") || "unknown"}`;
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(sender)));
    const hash = Array.from(digest,byte => byte.toString(16).padStart(2,"0")).join("");
    const rate = await env.DB.prepare(`INSERT INTO station_message_limits (bucket, sender_hash, count) VALUES (?, ?, 1)
      ON CONFLICT (bucket, sender_hash) DO UPDATE SET count = count + 1 RETURNING count`).bind(bucket,hash).first();
    if (Number(rate?.count) > 5) return respond({ok:false,error:"Too many messages were sent from this connection. Please try again in an hour."},429);
    const reference = `AVJ-${crypto.randomUUID().replaceAll("-","").slice(0,12).toUpperCase()}`;
    await env.DB.prepare(`INSERT OR IGNORE INTO station_messages (submission_id, reference, purpose, topic, name, email, message)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(input.submissionId,reference,input.purpose,input.topic,input.name.trim(),input.email.trim(),input.message.trim()).run();
    await env.DB.prepare("DELETE FROM station_message_limits WHERE bucket < ?").bind(bucket-24).run();
    const saved = await env.DB.prepare("SELECT reference FROM station_messages WHERE submission_id = ?").bind(input.submissionId).first();
    return respond({ok:true,reference:saved.reference},202);
  }
  if (inbox) {
    const status = parsed.searchParams.get("status") || "all";
    const before = parsed.searchParams.get("before");
    if (!["all","new","read","archived"].includes(status) || before !== null && !/^\d{1,15}$/.test(before)) return respond({ok:false,error:"Invalid inbox filter."},400);
    const conditions = [], values = [];
    if (status !== "all") {conditions.push("status = ?");values.push(status);}
    if (before !== null) {conditions.push("id < ?");values.push(Number(before));}
    const messages = await env.DB.prepare(`SELECT id, reference, purpose, topic, name, email, message, status, created_at FROM station_messages
      ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""} ORDER BY id DESC LIMIT 51`).bind(...values).all();
    const totals = await env.DB.prepare("SELECT status, COUNT(*) AS total FROM station_messages GROUP BY status").all();
    const rows = messages.results || [];
    return respond({ok:true,messages:rows.slice(0,50),nextBefore:rows.length > 50 ? rows[49].id : null,totals:Object.fromEntries((totals.results || []).map(row => [row.status,Number(row.total)]))});
  }
  const saved = await env.DB.prepare("SELECT id FROM station_messages WHERE id = ?").bind(Number(item[1])).first();
  if (!saved) return respond({ok:false,error:"Message not found."},404);
  await env.DB.prepare("UPDATE station_messages SET status = ? WHERE id = ?").bind(input.status,Number(item[1])).run();
  return respond({ok:true});
}

export default {
  async fetch(request, env) {
    try {
      if (new URL(request.url).pathname.startsWith("/api/station/")) {
        try {return await handleStationRoutes(request, env);}
        catch (error) {
          console.error("AV Junki Radio station inbox unavailable:", error instanceof Error ? error.name : "Unknown error");
          return stationResponse(request, {ok:false,error:"The station inbox is unavailable. Please try again later."}, 503);
        }
      }
      // Information feeds are read-only and never touch the radio DB or media.
      if (new URL(request.url).pathname.startsWith("/api/info/")) {
        return await fetchInformation(request);
      }
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
                stations,
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
                stations,
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
                stations,
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
                stations,
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
