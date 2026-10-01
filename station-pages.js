(() => {
  "use strict";

  const API = "https://av-junki-radio-admin-api.luvdjsilvah.workers.dev";
  const PAGES = {
    home: {title: "Home · Main station", keywords: "home studio now playing listen jazz soul"},
    radio: {title: "Radio", keywords: "listen music stations genres jazz main lobby hip hop rnb R&B house reggae gospel live player"},
    podcasts: {title: "Podcasts", keywords: "episodes conversations shows audio podcast pitch"},
    events: {title: "Events", keywords: "calendar shows gatherings dates event submission"},
    news: {title: "News", keywords: "world headlines current affairs DW"},
    shop: {title: "Shop", keywords: "merchandise merch products store"},
    community: {title: "Community", keywords: "listeners feedback artists music submissions suggestions"},
    advertise: {title: "Advertise", keywords: "advertising sponsorship sponsors audio spots visual ads campaigns business"},
    contact: {title: "Contact", keywords: "message station help support technical"},
    search: {title: "Search", keywords: "find catalogue artist title"},
    inquiry: {title: "Inquiry", keywords: "enquiry proposal bookings artist submission podcast pitch events merchandise"},
    about: {title: "About AV Junki Radio", keywords: "about info information station beta mission music lives here"}
  };
  const TOPICS = ["General enquiry", "Listener feedback", "Technical help", "Artist submission", "Podcast pitch", "Event submission", "Advertising", "Sponsorship", "Merchandise", "Community"];
  const GENRES = [
    ["Jazz", "Main Lobby · Smooth jazz & soul", "lobby"],
    ["Hip Hop", "Beats, rhythm & wordplay", "hip-hop"],
    ["R&B", "Soulful voices & slow grooves", "rnb"],
    ["House", "The sound of the dance floor", "house"],
    ["Reggae", "Island rhythms & inspiration", "reggae"],
    ["Gospel", "Faith, gratitude & uplifting sounds", "gospel"]
  ];
  const EYEBROWS = {radio:"Find your frequency",podcasts:"Conversations worth hearing",events:"Beyond the broadcast",news:"The world, in focus",shop:"The AV Junki collection",community:"You're part of the sound",advertise:"Let your brand be heard",contact:"A direct line to the station",search:"Explore AV Junki Radio",inquiry:"Let's make something happen",about:"Where the vibe lives"};
  const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  const url = value => {
    try {const parsed = new URL(value); return parsed.protocol === "https:" && !parsed.username && !parsed.password ? parsed.href : "";} catch {return "";}
  };
  const date = value => {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? new Intl.DateTimeFormat("en-US", {timeZone:"America/Los_Angeles",dateStyle:"medium",timeStyle:"short"}).format(parsed) + " PT" : "";
  };
  const action = (page, text, topic = "", primary = false) => `<button type="button" data-page="${escape(page)}"${topic ? ` data-topic="${escape(topic)}"` : ""}${primary ? ' class="station-primary"' : ""}>${escape(text)}</button>`;
  const card = (title, text) => `<article class="station-card"><h3>${escape(title)}</h3><p>${escape(text)}</p></article>`;
  const external = (link, text) => url(link) ? `<a class="station-link-button" href="${escape(url(link))}" target="_blank" rel="noopener noreferrer">${escape(text)} <span aria-hidden="true">↗</span></a>` : "";
  const feature = (heading, text, actions = "", aside = "") => `<div class="station-feature"><div class="station-feature-copy"><h2>${escape(heading)}</h2><p>${escape(text)}</p>${actions ? `<div class="station-actions">${actions}</div>` : ""}</div><div class="station-feature-aside">${aside}</div></div>`;
  const brandArt = '<div class="station-brand-art" aria-hidden="true"><img src="assets/av-junki-radio-glass-logo.png" alt=""><span>WHERE THE VIBE LIVES</span></div>';

  function init() {
    const panel = document.getElementById("station-pages");
    if (!panel) return;
    const title = document.getElementById("station-page-title");
    const eyebrow = document.getElementById("station-page-eyebrow");
    const body = document.getElementById("station-page-body");
    const buttons = [...document.querySelectorAll("#radio-navigation [data-station-page]")];
    const cache = new Map(), drafts = new Map(), receipts = new Map();
    let revision = 0, returnFocus = null, sending = false;

    async function load(key, endpoint, ttl = 300_000) {
      const current = cache.get(key);
      if (current?.pending) return current.pending;
      if (current?.value && Date.now() - current.at < ttl) return current.value;
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 30_000);
      const pending = (async () => {
        try {
          const response = await fetch(endpoint, {signal:controller.signal,cache:"no-store"});
          if (!response.ok) throw new Error("Content unavailable");
          const value = await response.json();
          if (value.ok === false) throw new Error("Content unavailable");
          cache.set(key, {value,at:Date.now()});
          return value;
        } catch (error) {cache.delete(key);throw error;}
        finally {window.clearTimeout(timeout);}
      })();
      cache.set(key, {pending});
      return pending;
    }
    const library = () => load("music", `${API}/api/music`, 60_000).then(data => {
      if (!Array.isArray(data.music)) throw new Error("Library unavailable");
      return data.music.filter(item => Number(item.enabled) === 1 && /^\d+$/.test(String(item.id)));
    });
    const listings = () => load("listings", "station-content.json?v=1");
    const metadata = item => {
      const filename = String(item.original_filename || "").replace(/\.[^.]+$/, "").replace(/_/g, " ").replace(/\s+/g, " ").trim();
      const parts = filename.split(/\s+by\s+/i);
      return {title:item.title || parts[0] || "Untitled audio",artist:item.artist || parts.slice(1).join(" by ") || "AV Junki Radio"};
    };
    const listen = '<button type="button" class="station-primary" data-listen>Listen to the current station</button>';
    const inquiryAction = (text, topic) => action("inquiry", text, topic);
    const receipt = (page, reference) => `<p class="station-success" role="status">Your message is in the station inbox.${reference ? ` Reference: ${escape(reference)}.` : ""}</p><p class="station-muted">Thank you for getting in touch. The station can reply using the email you supplied.</p><div><button type="button" data-new-message="${escape(page)}">Write another message</button></div>`;

    function form(page, selectedTopic) {
      if (receipts.has(page)) return `<div class="station-form">${receipt(page, receipts.get(page))}</div>`;
      const draft = drafts.get(page) || {name:"",email:"",message:"",topic:selectedTopic || (page === "advertise" ? "Advertising" : "General enquiry"),consent:false,submissionId:crypto.randomUUID()};
      if (selectedTopic) draft.topic = selectedTopic;
      drafts.set(page, draft);
      return `<form class="station-form" data-message-form="${escape(page)}">
        <div class="station-form-row">
          <label>Your name<input name="name" autocomplete="name" minlength="2" maxlength="80" required value="${escape(draft.name)}"></label>
          <label>Email for a reply<input name="email" type="email" autocomplete="email" maxlength="254" required value="${escape(draft.email)}"></label>
        </div>
        <label>What is this about?<select name="topic">${TOPICS.map(topic => `<option${draft.topic === topic ? " selected" : ""}>${escape(topic)}</option>`).join("")}</select></label>
        <label>Your message<textarea name="message" minlength="10" maxlength="3000" rows="3" required>${escape(draft.message)}</textarea></label>
        <label class="station-honeypot" aria-hidden="true">Leave this field empty<input name="website" tabindex="-1" autocomplete="off"></label>
        <label class="station-consent"><input name="consent" type="checkbox" required${draft.consent ? " checked" : ""}>AV Junki Radio may save these details and use my email to reply to this enquiry.</label>
        <div><button class="station-primary" type="submit"${sending ? " disabled" : ""}>${sending ? "Sending…" : "Send to the station"}</button></div>
        <p class="station-form-status" role="status" aria-live="polite"></p>
        <small>Your name, email and message are private to the station. They are not posted in the Community section.</small>
      </form>`;
    }

    function render(page, topic) {
      const version = ++revision;
      const active = () => version === revision && !panel.hidden;
      const fail = (message, key) => {if (active()) body.innerHTML = `<p class="station-intro station-error">${escape(message)}</p><button type="button" data-refresh="${escape(key)}">Try again</button>`;};
      title.textContent = PAGES[page].title;
      if (eyebrow) eyebrow.textContent = EYEBROWS[page] || "AV JUNKI RADIO";
      body.scrollTop = 0;
      switch (page) {
        case "radio":
          body.innerHTML = `<p class="station-intro">Six moods. One place to settle in. Choose your station, then press Listen to join the broadcast.</p>
            <div class="station-tuning-grid">${GENRES.map(([name,description,channel]) => `<button class="station-tune" type="button" data-tune="${channel}"><span class="station-tune-name">${escape(name)}<small>${escape(description)}</small></span><span aria-hidden="true">↗</span></button>`).join("")}</div>
            <div class="station-actions">${listen}<button type="button" data-close>Back to the studio</button></div>`;
          break;
        case "podcasts":
          body.innerHTML = '<p class="station-intro" role="status">Loading the station’s published episodes…</p>';
          library().then(items => {
            if (!active()) return;
            const episodes = items.filter(item => item.genre === "podcast");
            body.innerHTML = `<p class="station-intro">Conversations, stories and shows from AV Junki Radio. Episodes open in a separate tab.</p>
              ${episodes.length ? `<div class="station-grid">${episodes.map(item => {const meta = metadata(item);const minutes = Math.round(Number(item.duration_seconds) / 60);return `<article class="station-card"><span class="station-tag">${minutes > 0 ? `${minutes} min` : "Episode"}</span><h3>${escape(meta.title)}</h3><p>${escape(meta.artist)}</p><div class="station-actions">${external(`${API}/api/music/${encodeURIComponent(item.id)}/audio`,"Open episode")}</div></article>`;}).join("")}</div>` : feature("The next conversation starts here.", "Our episode collection is taking shape. New conversations will appear here when they’re published.", inquiryAction("Pitch your show","Podcast pitch"), `<span class="station-tag">A voice worth sharing</span><h3>Bring your story.</h3><p class="station-muted">Have a perspective, a passion or a conversation that belongs on the air? We’d love to hear about it.</p>`) }
              <div class="station-actions">${episodes.length ? inquiryAction("Pitch a podcast","Podcast pitch") : ""}${action("radio","Return to radio")}</div>`;
          }).catch(() => fail("The episode library could not be loaded. Please try again.","podcasts"));
          break;
        case "events":
          body.innerHTML = '<p class="station-intro" role="status">Loading station events…</p>';
          listings().then(data => {
            if (!active()) return;
            const upcoming = Array.isArray(data.events) ? data.events.filter(item => item.published === true && item.title && new Date(item.endsAt || item.startsAt).getTime() >= Date.now()).sort((a,b) => new Date(a.startsAt)-new Date(b.startsAt)) : [];
            body.innerHTML = `<p class="station-intro">Find published AV Junki Radio appearances, listening events and community gatherings. Event times are shown in Pacific Time.</p>
              ${upcoming.length ? `<div class="station-grid">${upcoming.map(item => `<article class="station-card"><span class="station-tag">${escape(date(item.startsAt))}</span><h3>${escape(item.title)}</h3><p>${escape(item.location || "")}</p><p>${escape(item.description || "")}</p><div class="station-actions">${external(item.link,"Event details")}</div></article>`).join("")}</div>` : feature("Good music brings us together.", "There are no upcoming station events announced just yet. This is where you’ll find the next chance to connect beyond the broadcast.", inquiryAction("Bring us your event","Event submission"), `<span class="station-tag">Make a connection</span><h3>Set the scene.</h3><p class="station-muted">A listening party, an appearance or a collaboration — tell us what you have in mind.</p>`) }
              <div class="station-actions">${upcoming.length ? inquiryAction("Submit an event","Event submission") : ""}${inquiryAction("Discuss a collaboration","General enquiry")}</div>`;
          }).catch(() => fail("The event calendar could not be loaded. Please try again.","events"));
          break;
        case "news":
          body.innerHTML = '<p class="station-intro" role="status">Loading current world headlines…</p>';
          load("news", `${API}/api/info/news`, 300_000).then(data => {
            if (!active()) return;
            const stories = Array.isArray(data.items) ? data.items.filter(item => item.title && url(item.link)) : [];
            if (!stories.length) throw new Error("No current stories");
            const [lead, ...remaining] = stories;
            body.innerHTML = `<div class="station-news-dateline"><span class="station-tag">World headlines · ${escape(data.source || "DW News")}</span><small>Updated ${escape(date(data.fetchedAt))}</small></div>
              <div class="station-news-layout"><article class="station-news-feature"><span class="station-tag">In the headlines</span><a href="${escape(url(lead.link))}" target="_blank" rel="noopener noreferrer"><h2>${escape(lead.title)}</h2><small>${escape(date(lead.publishedAt))}</small><span class="station-read-story">Read the original story <span aria-hidden="true">↗</span></span></a></article>
              <ul class="station-list">${remaining.map(item => `<li><a href="${escape(url(item.link))}" target="_blank" rel="noopener noreferrer">${escape(item.title)} <span aria-hidden="true">↗</span></a><small>${escape(date(item.publishedAt))}</small></li>`).join("")}</ul></div>
              <div class="station-actions"><button type="button" data-refresh="news">Refresh headlines</button></div>`;
          }).catch(() => fail("Current headlines are unavailable. Please try again later.","news"));
          break;
        case "shop":
          body.innerHTML = '<p class="station-intro" role="status">Loading the station shop…</p>';
          listings().then(data => {
            if (!active()) return;
            const products = Array.isArray(data.products) ? data.products.filter(item => item.published === true && item.title && url(item.link)) : [];
            body.innerHTML = products.length ? `<p class="station-intro">Official AV Junki Radio merchandise and releases.</p><div class="station-grid">${products.map(item => `<article class="station-card"><h3>${escape(item.title)}</h3><p>${escape(item.description || "")}</p>${item.price ? `<p>${escape(item.price)}</p>` : ""}<div class="station-actions">${external(item.link,"View product")}</div></article>`).join("")}</div><div class="station-actions">${inquiryAction("Ask about merchandise","Merchandise")}</div>`
              : `<div class="station-feature">${brandArt}<div class="station-feature-copy"><span class="station-tag">Official merchandise</span><h2>Take the vibe with you.</h2><p>Our collection has yet to launch. Tell us what you’d love to see from AV Junki Radio.</p><div class="station-actions">${inquiryAction("Ask about merchandise","Merchandise")}</div><p class="station-section station-muted">No products are currently available for purchase.</p></div></div>`;
          }).catch(() => fail("The shop listings could not be loaded. Please try again.","shop"));
          break;
        case "community":
          body.innerHTML = feature("Your seat at the table.", "The station is better with you in it. Share a favourite sound, suggest a theme, or tell us what keeps you listening.", inquiryAction("Join the conversation","Community") + inquiryAction("Share feedback","Listener feedback"), `<span class="station-tag">Artists & creators</span><h3>Let us hear your world.</h3><p class="station-muted">Introduce your music with a listening link and a few words about yourself.</p><div class="station-actions">${inquiryAction("Introduce your music","Artist submission")}</div>`)
            + `<p class="station-section station-muted"><small>Your messages go privately to the station. Music submissions are reviewed for programming.</small></p>`;
          break;
        case "advertise":
          body.innerHTML = `<p class="station-intro">Put your business in the conversation. Tell us about your campaign, audience and preferred dates, and discuss a placement with AV Junki Radio.</p>
            <div class="station-grid">${card("Audio spots & sponsorship", "Discuss an audio campaign or a sponsor presence within the station programme.")}${card("Studio screen placements", "Discuss visual advertising and featured video opportunities in the virtual studio.")}</div>
            <p class="station-section station-muted">Rates, availability, creative requirements and scheduling are agreed with the station for each campaign.</p>${form(page, topic)}`;
          break;
        case "contact":
          body.innerHTML = `<p class="station-intro">Reach AV Junki Radio with a question, listener feedback or help using the station. Include the details that will help us reply.</p>${form(page, topic)}`;
          break;
        case "inquiry":
          body.innerHTML = `<p class="station-intro">Send a proposal, music introduction, podcast pitch, event listing or business enquiry. Links to your work and relevant dates are welcome.</p>${form(page, topic)}`;
          break;
        case "about":
          body.innerHTML = feature("Music for the moment.", "AV Junki Radio is a place to settle in. Smooth jazz and soul welcome you at the front door, with more sounds waiting along the studio walls.", action("radio","Find your station", "", true), `<span class="station-tag">More than a playlist</span><h3>Where the vibe lives.</h3><p class="station-muted">Music, conversations and a connection to the people behind the sound. Join the broadcast and make yourself at home.</p>`)
            + `<div class="station-actions">${action("contact","Contact the station")}${inquiryAction("Share feedback","Listener feedback")}</div><p class="station-section station-muted"><small>AV Junki Radio is in beta. Your feedback helps shape the experience.</small></p>`;
          break;
        case "search":
          body.innerHTML = `<p class="station-intro">Find station sections, artists, audio titles and published podcast episodes.</p><label class="station-search-label">Search AV Junki Radio<input id="station-search-input" type="search" placeholder="Try Jazz, advertising or an artist" maxlength="100" autocomplete="off"></label><p id="station-search-status" class="station-muted" role="status"></p><div id="station-search-results"></div>`;
          let audio = [];
          let audioState = "Loading the audio catalogue…";
          const update = () => {
            if (!active()) return;
            const normal = value => String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
            const query = normal(document.getElementById("station-search-input").value.trim()).split(/\s+/).filter(Boolean);
            const sections = Object.entries(PAGES).filter(([key]) => key !== "search").map(([key,data]) => ({key,title:data.title,detail:"Station section",keywords:data.keywords}));
            const matches = [...sections,...audio].filter(item => query.every(term => normal(`${item.title} ${item.detail} ${item.keywords || ""}`).includes(term)));
            document.getElementById("station-search-status").textContent = `${matches.length} ${matches.length === 1 ? "match" : "matches"}. ${audioState}`;
            document.getElementById("station-search-results").innerHTML = matches.slice(0,40).map(item => item.key
              ? `<button class="station-search-result" type="button" data-page="${escape(item.key)}"><span>${escape(item.title)}</span><small>${escape(item.detail)}</small></button>`
              : `<article class="station-search-result station-library-entry"><span>${escape(item.title)}</span><small>${escape(item.detail)}</small></article>`).join("") || '<p class="station-section">No matches. Try a station, topic, artist or title.</p>';
          };
          document.getElementById("station-search-input").addEventListener("input", update);
          update();
          Promise.allSettled([library(),load("catalogue","station-catalogue.json?v=1")]).then(results => {
            if (!active()) return;
            const items = results[0].status === "fulfilled" ? results[0].value : [];
            const builtIn = results[1].status === "fulfilled" && Array.isArray(results[1].value.tracks) ? results[1].value.tracks : [];
            const records = items.map(item => {const meta = metadata(item);return {title:meta.title,detail:`${meta.artist} · ${item.genre === "podcast" ? "Podcast episode" : "Station audio library"}`,key:item.genre === "podcast" ? "podcasts" : "",keywords:item.genre};});
            const unique = new Set(records.map(item => item.title.toLowerCase()));
            audio = [...records,...builtIn.filter(item => !unique.has(String(item.title).toLowerCase())).map(item => ({title:item.title,detail:`${item.artist} · ${item.station}`,keywords:item.station}))];
            audioState = results[0].status === "rejected" ? "Uploaded audio is temporarily unavailable; station search is available." : "Audio follows station programming; podcast episodes open from Podcasts.";
            update();
          });
          break;
      }
      if (sending) body.querySelectorAll("form[data-message-form] input, form[data-message-form] select, form[data-message-form] textarea").forEach(field => {field.disabled=true;});
    }

    function open(page, topic = "", focus = true) {
      if (!PAGES[page]) return;
      if (page === "home") {
        close(focus);
        if (document.documentElement.dataset.radioChannel !== "lobby") document.getElementById("home-station-control")?.click();
        const home = document.getElementById("nav-home");
        home?.setAttribute("aria-current", "page");
        if (focus) home?.focus({preventScroll:true});
        return;
      }
      if (TOPICS.includes(topic)) receipts.delete(page);
      if (panel.hidden) returnFocus = document.activeElement;
      panel.hidden = false;
      panel.dataset.page = page;
      buttons.forEach(button => {
        const selected = button.dataset.stationPage === page;
        if (button.dataset.stationPage === "home") button.removeAttribute("aria-expanded");
        else button.setAttribute("aria-expanded", String(selected));
        if (selected) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current");
      });
      render(page, TOPICS.includes(topic) ? topic : "");
      if (focus) title.focus({preventScroll:true});
    }
    function close(focus = true) {
      revision++;
      panel.hidden = true;
      delete panel.dataset.page;
      buttons.forEach(button => {if (button.dataset.stationPage !== "home") button.setAttribute("aria-expanded","false");button.removeAttribute("aria-current");});
      if (focus && returnFocus?.isConnected) returnFocus.focus({preventScroll:true});
    }
    function navigate(page, topic = "") {
      const next = `${location.pathname}${location.search}${page ? `#${page}` : ""}`;
      if (location.hash !== (page ? `#${page}` : "")) history.pushState(null,"",next);
      if (page) open(page, topic); else close();
    }
    function route() {
      const page = location.hash.slice(1);
      if (PAGES[page]) {if (page === "home" || panel.hidden || panel.dataset.page !== page) open(page,"",false);}
      else if (!panel.hidden) close();
    }
    buttons.forEach(button => {
      button.setAttribute("aria-controls",button.dataset.stationPage === "home" ? "screen-content" : "station-pages");
      if (button.dataset.stationPage !== "home") button.setAttribute("aria-expanded","false");
      button.addEventListener("click", event => {event.preventDefault();navigate(button.dataset.stationPage);});
    });
    document.getElementById("station-pages-close").addEventListener("click", () => navigate(""));
    body.addEventListener("click", event => {
      const target = event.target.closest("button");
      if (!target || !body.contains(target)) return;
      if (target.dataset.newMessage) {receipts.delete(target.dataset.newMessage);navigate(target.dataset.newMessage);}
      else if (target.dataset.page) navigate(target.dataset.page,target.dataset.topic);
      else if (target.dataset.tune && GENRES.some(genre => genre[2] === target.dataset.tune)) {
        navigate("");
        if (document.documentElement.dataset.radioChannel !== target.dataset.tune) {
          document.querySelector(`.panel-hotspot[data-channel="${target.dataset.tune}"]`)?.click();
        }
      }
      else if (target.hasAttribute("data-close")) navigate("");
      else if (target.hasAttribute("data-listen")) {
        navigate("");
        const player = document.getElementById("play-pause");
        player?.focus({preventScroll:true});
        if (document.getElementById("radio-audio")?.paused) player?.click();
      } else if (target.dataset.refresh) {
        cache.delete(target.dataset.refresh === "events" || target.dataset.refresh === "shop" ? "listings" : target.dataset.refresh === "podcasts" ? "music" : target.dataset.refresh);
        render(target.dataset.refresh);
      }
    });
    body.addEventListener("input", event => {
      const formElement = event.target.closest("form[data-message-form]");
      if (!formElement) return;
      const draft = drafts.get(formElement.dataset.messageForm);
      if (draft && ["name","email","message","topic","consent"].includes(event.target.name)) draft[event.target.name] = event.target.name === "consent" ? event.target.checked : event.target.value;
    });
    body.addEventListener("submit", async event => {
      const formElement = event.target;
      if (!formElement.matches("form[data-message-form]")) return;
      event.preventDefault();
      if (sending || !formElement.reportValidity()) return;
      const purpose = formElement.dataset.messageForm;
      const draft = drafts.get(purpose);
      const values = new FormData(formElement);
      const payload = {purpose,name:values.get("name"),email:values.get("email"),topic:values.get("topic"),message:values.get("message"),website:values.get("website"),consent:values.get("consent") === "on"};
      const signature = JSON.stringify(payload);
      if (draft.sentPayload && draft.sentPayload !== signature) draft.submissionId = crypto.randomUUID();
      draft.sentPayload = signature;
      payload.submissionId = draft.submissionId;
      const status = formElement.querySelector(".station-form-status");
      const submit = formElement.querySelector('button[type="submit"]');
      sending = true;
      formElement.querySelectorAll("input, select, textarea").forEach(field => {field.disabled=true;});
      submit.disabled = true;
      submit.textContent = "Sending…";
      status.className = "station-form-status";
      status.textContent = "Sending your message to the station…";
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 25_000);
      try {
        const response = await fetch(`${API}/api/station/messages`, {method:"POST",headers:{"Content-Type":"application/json"},signal:controller.signal,body:JSON.stringify(payload)});
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.error || "Your message could not be sent. Please try again.");
        drafts.delete(purpose);
        receipts.set(purpose,result.reference || "");
        const currentForm = body.querySelector(`form[data-message-form="${purpose}"]`);
        if (currentForm) currentForm.innerHTML = receipt(purpose,result.reference);
      } catch (error) {
        const currentStatus = body.querySelector(`form[data-message-form="${purpose}"] .station-form-status`);
        if (currentStatus) {currentStatus.className="station-form-status station-error";currentStatus.textContent=error.name === "AbortError" ? "The connection timed out. Your draft is still here; try sending again." : error.message;}
      } finally {
        window.clearTimeout(timeout);
        sending = false;
        // A listener may have changed pages while the request was in progress.
        panel.querySelectorAll("form[data-message-form] input, form[data-message-form] select, form[data-message-form] textarea").forEach(field => {field.disabled=false;});
        panel.querySelectorAll('form[data-message-form] button[type="submit"]').forEach(button => {button.disabled=false;button.textContent="Send to the station";});
      }
    });
    document.addEventListener("keydown", event => {if (event.key === "Escape" && !panel.hidden) {event.preventDefault();navigate("");}});
    window.addEventListener("popstate", route);
    window.addEventListener("hashchange", route);
    route();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded",init,{once:true}); else init();
})();
