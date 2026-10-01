/* Live data for the existing left fascia. No player or layout operations. */
(() => {
  "use strict";

  function start() {
    const display = document.getElementById("left-info-display");
    if (!display || display.dataset.liveInfo !== "true") return;

    const fields = new Map([...display.querySelectorAll("[id]")].map(el => [el.id, el]));
    const API = "https://av-junki-radio-admin-api.luvdjsilvah.workers.dev/api/info/";
    const zone = "America/Los_Angeles";
    const time = new Intl.DateTimeFormat("en-US", {timeZone: zone, hour: "numeric", minute: "2-digit"});
    const date = new Intl.DateTimeFormat("en-US", {timeZone: zone, weekday: "long", month: "long", day: "numeric"});
    const gameDate = new Intl.DateTimeFormat("en-US", {timeZone: zone, weekday: "short", hour: "numeric", minute: "2-digit"});
    const quoteDate = new Intl.DateTimeFormat("en-US", {timeZone: zone, month: "short", day: "numeric"});
    const number = new Intl.NumberFormat("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2});
    const started = Date.now();
    const feeds = {
      weather: {interval: 10 * 60_000, maxAge: 30 * 60_000},
      sports: {interval: 60_000, maxAge: 3 * 60_000},
      markets: {interval: 5 * 60_000, maxAge: 15 * 60_000},
      traffic: {interval: 5 * 60_000, maxAge: 15 * 60_000},
      news: {interval: 10 * 60_000, maxAge: 30 * 60_000}
    };

    function text(id, value, title = "") {
      const field = fields.get(id);
      if (!field) return;
      const content = String(value);
      if (field.textContent !== content) field.textContent = content;
      field.title = title;
    }

    function short(value, limit) {
      const full = String(value || "").replace(/\s+/g, " ").trim();
      if (full.length <= limit) return full;
      return full.slice(0, limit - 1).replace(/\s+\S*$/, "") + "…";
    }

    function stamp(value) {
      const milliseconds = Date.parse(value);
      return Number.isFinite(milliseconds) ? time.format(milliseconds) : "";
    }

    function usable(name) {
      const feed = feeds[name];
      return feed.data && Date.now() - Date.parse(feed.data.fetchedAt) <= feed.maxAge;
    }

    function status(name, label) {
      const feed = feeds[name];
      return feed.failed ? "UPDATE DELAYED" : label;
    }

    function renderWeather() {
      if (!usable("weather")) {
        text("weather-temp", "--°");
        text("weather-condition", "UNAVAILABLE");
        text("weather-range", "NWS · RETRYING");
        return;
      }
      const data = feeds.weather.data;
      const details = `National Weather Service · observed ${data.observedAt}; highs/lows are the next daytime/nighttime forecast.`;
      text("weather-temp", `${Math.round(data.temperature)}°`, details);
      text("weather-condition", short(data.condition, 20).toUpperCase(), data.condition);
      const range = data.high !== null && data.low !== null
        ? `H ${Math.round(data.high)}°  L ${Math.round(data.low)}°`
        : "FORECAST UNAVAILABLE";
      text("weather-range", feeds.weather.failed ? "UPDATE DELAYED" : `${range} · NWS`, details);
    }

    function renderSports() {
      const data = usable("sports") && feeds.sports.data;
      const games = data?.games || [];
      if (!games.length) {
        text("sports-name", "SPORTS");
        for (const id of ["sports-team-a", "sports-team-b", "sports-score-a", "sports-score-b"]) text(id, "--");
        text("sports-status", data ? "NO GAMES SCHEDULED" : "SCORES UNAVAILABLE");
        return;
      }
      // Six eight-second slots match the original 24–72s sports window.
      const elapsed = Math.max(0, Date.now() - started);
      const cycle = Math.floor(elapsed / 96_000);
      const slot = Math.min(5, Math.max(0, Math.floor((elapsed % 96_000 - 24_000) / 8_000)));
      const game = games[(cycle * 6 + slot) % games.length];
      text("sports-name", `${game.league} ${game.sport}`);
      text("sports-team-a", game.teamA);
      text("sports-team-b", game.teamB);
      text("sports-score-a", game.scoreA);
      text("sports-score-b", game.scoreB);
      const scheduled = game.scheduled && Number.isFinite(Date.parse(game.date));
      const detail = scheduled ? gameDate.format(new Date(game.date)).toUpperCase() : game.status.toUpperCase();
      text("sports-status", status("sports", `${short(detail, 23)} · ESPN`), `${game.fullName} · ${game.status} · ESPN checked ${data.fetchedAt}`);
    }

    function renderMarkets() {
      if (!usable("markets")) {
        text("dow-value", "--,---.--");
        text("dow-points", "--");
        text("dow-percent", "(--.--%)");
        text("dow-status", "QUOTE UNAVAILABLE");
        return;
      }
      const data = feeds.markets.data;
      const sign = data.change >= 0 ? "+" : "";
      text("dow-value", number.format(data.value));
      text("dow-points", sign + number.format(data.change));
      text("dow-percent", `(${sign}${data.percent.toFixed(2)}%)`);
      const color = data.change < 0 ? "#ef9b9b" : "#72d58a";
      for (const id of ["dow-points", "dow-percent"]) if (fields.has(id)) fields.get(id).style.color = color;
      const label = data.marketOpen ? `DELAYED · ${stamp(data.quoteAt)}` : `LAST CLOSE · ${quoteDate.format(new Date(data.quoteAt)).toUpperCase()}`;
      text("dow-status", status("markets", label), `Yahoo Finance · quote ${data.quoteAt}; quotes may be delayed.`);
    }

    function renderTraffic() {
      const data = usable("traffic") && feeds.traffic.data;
      if (!data) {
        text("traffic-route", "HENDERSON / LAS VEGAS");
        text("traffic-condition", "REPORT UNAVAILABLE");
        text("traffic-status", "NV511 · RETRYING");
        return;
      }
      const events = data.events || [];
      const event = events[Math.floor((Date.now() - started) / 96_000) % Math.max(1, events.length)];
      text("traffic-route", event ? short(event.route, 32).toUpperCase() : "HENDERSON / LAS VEGAS", event?.description || "");
      text("traffic-condition", event ? short(event.condition, 45).toUpperCase() : "NO REPORTED INCIDENTS", event?.description || "Nevada 511 reports no active local events; this is not a traffic-speed measurement.");
      if (fields.has("traffic-condition")) fields.get("traffic-condition").style.color = event ? "#e5ac4c" : "#72d58a";
      text("traffic-status", status("traffic", `NV511 · ${stamp(data.fetchedAt)}`), `${event?.updated || ""} · Nevada 511 checked ${data.fetchedAt}`);
    }

    function renderNews() {
      const data = usable("news") && feeds.news.data;
      const items = data?.items || [];
      if (!items.length) {
        text("news-headline", "HEADLINES UNAVAILABLE");
        text("news-status", "DW NEWS · RETRYING");
        return;
      }
      const item = items[Math.floor((Date.now() - started) / 96_000) % items.length];
      text("news-headline", short(item.title, 85), item.title);
      text("news-status", status("news", `DW NEWS · ${stamp(item.publishedAt)}`), `${item.link} · published ${item.publishedAt}`);
    }

    const renderers = {weather: renderWeather, sports: renderSports, markets: renderMarkets, traffic: renderTraffic, news: renderNews};

    async function refresh(name) {
      const feed = feeds[name];
      if (feed.pending || document.hidden) return;
      feed.pending = true;
      feed.attemptedAt = Date.now();
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 30_000);
      try {
        const response = await fetch(API + name, {signal: controller.signal, credentials: "omit"});
        if (!response.ok) throw new Error("Feed unavailable");
        const data = await response.json();
        if (!data.ok || !Number.isFinite(Date.parse(data.fetchedAt)) || Date.now() - Date.parse(data.fetchedAt) > feed.maxAge) throw new Error("Feed out of date");
        feed.data = data;
        feed.failed = false;
      } catch {
        feed.failed = true;
      } finally {
        window.clearTimeout(timer);
        feed.pending = false;
        renderers[name]();
      }
    }

    function tick() {
      const now = new Date();
      text("left-info-clock", time.format(now), "Henderson / Las Vegas · Pacific Time");
      text("left-info-date", date.format(now));
      for (const render of Object.values(renderers)) render();
    }

    function refreshDue() {
      if (document.hidden) return;
      for (const [name, feed] of Object.entries(feeds)) {
        if (!feed.attemptedAt || Date.now() - feed.attemptedAt >= feed.interval) void refresh(name);
      }
    }

    tick();
    refreshDue();
    window.setInterval(() => { if (!document.hidden) tick(); }, 1000);
    window.setInterval(refreshDue, 15_000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) {tick(); refreshDue();} });
    window.addEventListener("online", () => {for (const name of Object.keys(feeds)) void refresh(name);});
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, {once: true});
  else start();
})();
