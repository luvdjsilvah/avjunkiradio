(() => {
  "use strict";

  const API = "https://av-junki-radio-admin-api.luvdjsilvah.workers.dev";
  const PAGES = {
    home: {title: "Welcome home", keywords: "welcome studio now playing listen jazz soul"},
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
    ["Jazz · Main Lobby", "Smooth jazz and soul at the front door of the station."],
    ["Hip Hop", "Beats, rhythm and the station’s Hip Hop programming."],
    ["R&B", "Soulful vocals and R&B selections."],
    ["House", "Dance floor energy and House programming."],
    ["Reggae", "Reggae rhythms and island sounds."],
    ["Gospel", "Gospel selections and uplifting listening."]
  ];
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

  function init() {
    const panel = document.getElementById("station-pages");
    if (!panel) return;
    const title = document.getElementById("station-page-title");
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
    const nowPlaying = () => ({
      title:document.getElementById("player-track-title")?.textContent.trim() || "AV Junki Radio",
      artist:document.getElementById("player-artist")?.textContent.trim() || "Music lives here"
    });
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
      const now = nowPlaying();
      title.textContent = PAGES[page].title;
      body.scrollTop = 0;
      switch (page) {
        case "home":
          body.innerHTML = `<p class="station-intro">Where the vibe lives. Settle in with AV Junki Radio.</p>
            <div class="station-grid"><article class="station-card"><span class="station-tag">On the station</span><h2 class="station-now" id="station-now-title">${escape(now.title)}</h2><p id="station-now-artist">${escape(now.artist)}</p><div class="station-actions">${listen}</div></article>
            <article class="station-card"><h2>Your virtual studio</h2><p>Music, conversations and a community built around the sound. Choose a station, join the broadcast, and explore while you listen.</p><div class="station-actions">${action("radio","Explore radio")}${action("about","Station info")}</div></article></div>
            <div class="station-actions">${action("podcasts","Podcasts")}${action("events","Events")}${action("news","Latest news")}${action("community","Join the conversation")}</div>`;
          break;
        case "radio":
          body.innerHTML = `<p class="station-intro">Choose a genre on the studio wall, then press Listen to join its programme in progress. Songs, station IDs and breaks follow the broadcast.</p>
            <div class="station-actions" style="margin:0 0 12px">${listen}<button type="button" data-close>Show the studio controls</button></div>
            <div class="station-grid">${GENRES.map(([name,description]) => card(name,description)).join("")}</div>
            <p class="station-section station-muted">Programming follows the station’s published library. If a channel has no programme available, the player will let you know.</p>`;
          break;
        case "podcasts":
          body.innerHTML = '<p class="station-intro" role="status">Loading the station’s published episodes…</p>';
          library().then(items => {
            if (!active()) return;
            const episodes = items.filter(item => item.genre === "podcast");
            body.innerHTML = `<p class="station-intro">Conversations, stories and shows from AV Junki Radio. Episodes open in a separate tab.</p>
              ${episodes.length ? `<div class="station-grid">${episodes.map(item => {const meta = metadata(item);const minutes = Math.round(Number(item.duration_seconds) / 60);return `<article class="station-card"><span class="station-tag">${minutes > 0 ? `${minutes} min` : "Episode"}</span><h3>${escape(meta.title)}</h3><p>${escape(meta.artist)}</p><div class="station-actions">${external(`${API}/api/music/${encodeURIComponent(item.id)}/audio`,"Open episode")}</div></article>`;}).join("")}</div>` : card("The episode library", "No episodes have been published yet. Published podcasts will be listed here.")}
              <div class="station-actions">${inquiryAction("Pitch a podcast","Podcast pitch")}${action("radio","Return to radio")}</div>`;
          }).catch(() => fail("The episode library could not be loaded. Please try again.","podcasts"));
          break;
        case "events":
          body.innerHTML = '<p class="station-intro" role="status">Loading station events…</p>';
          listings().then(data => {
            if (!active()) return;
            const upcoming = Array.isArray(data.events) ? data.events.filter(item => item.published === true && item.title && new Date(item.endsAt || item.startsAt).getTime() >= Date.now()).sort((a,b) => new Date(a.startsAt)-new Date(b.startsAt)) : [];
            body.innerHTML = `<p class="station-intro">Find published AV Junki Radio appearances, listening events and community gatherings. Event times are shown in Pacific Time.</p>
              ${upcoming.length ? `<div class="station-grid">${upcoming.map(item => `<article class="station-card"><span class="station-tag">${escape(date(item.startsAt))}</span><h3>${escape(item.title)}</h3><p>${escape(item.location || "")}</p><p>${escape(item.description || "")}</p><div class="station-actions">${external(item.link,"Event details")}</div></article>`).join("")}</div>` : card("Upcoming events", "There are no published station events on the calendar. For an appearance, collaboration or event listing, send the details to the station.")}
              <div class="station-actions">${inquiryAction("Submit an event","Event submission")}${inquiryAction("Discuss a collaboration","General enquiry")}</div>`;
          }).catch(() => fail("The event calendar could not be loaded. Please try again.","events"));
          break;
        case "news":
          body.innerHTML = '<p class="station-intro" role="status">Loading current world headlines…</p>';
          load("news", `${API}/api/info/news`, 300_000).then(data => {
            if (!active()) return;
            const stories = Array.isArray(data.items) ? data.items.filter(item => item.title && url(item.link)) : [];
            if (!stories.length) throw new Error("No current stories");
            body.innerHTML = `<p class="station-intro">World headlines · ${escape(data.source || "DW News")}<br><small>Updated ${escape(date(data.fetchedAt))}. Read the original reporting in a separate tab.</small></p>
              <ul class="station-list">${stories.map(item => `<li><a href="${escape(url(item.link))}" target="_blank" rel="noopener noreferrer">${escape(item.title)} <span aria-hidden="true">↗</span></a><small>${escape(date(item.publishedAt))}</small></li>`).join("")}</ul>
              <div class="station-actions"><button type="button" data-refresh="news">Refresh headlines</button></div>`;
          }).catch(() => fail("Current headlines are unavailable. Please try again later.","news"));
          break;
        case "shop":
          body.innerHTML = '<p class="station-intro" role="status">Loading the station shop…</p>';
          listings().then(data => {
            if (!active()) return;
            const products = Array.isArray(data.products) ? data.products.filter(item => item.published === true && item.title && url(item.link)) : [];
            body.innerHTML = `<p class="station-intro">Official AV Junki Radio merchandise and releases. Listed products link to their purchase page.</p>
              ${products.length ? `<div class="station-grid">${products.map(item => `<article class="station-card"><h3>${escape(item.title)}</h3><p>${escape(item.description || "")}</p>${item.price ? `<p>${escape(item.price)}</p>` : ""}<div class="station-actions">${external(item.link,"View product")}</div></article>`).join("")}</div>` : card("Official merchandise", "No products are listed for sale yet. Tell us which AV Junki Radio merchandise or releases you would like to see.")}
              <div class="station-actions">${inquiryAction("Ask about merchandise","Merchandise")}${action("radio","Keep listening")}</div>`;
          }).catch(() => fail("The shop listings could not be loaded. Please try again.","shop"));
          break;
        case "community":
          body.innerHTML = `<p class="station-intro">A place for the people behind the listening. Share an idea, introduce your music, or tell us what you love hearing.</p>
            <div class="station-grid">${card("Listeners", "Tell us about your favourite sounds, suggest a theme, or share feedback on the station.")}${card("Artists & creators", "Introduce your work with a listening link and a few words about yourself. The station can review it for programming.")}</div>
            <div class="station-actions">${inquiryAction("Share listener feedback","Listener feedback")}${inquiryAction("Submit music","Artist submission")}${inquiryAction("Start a conversation","Community")}</div>
            <p class="station-section station-muted">Community messages go privately to the station. Submissions are reviewed; sending one does not guarantee a broadcast or event placement.</p>`;
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
          body.innerHTML = `<p class="station-intro">Music lives here. AV Junki Radio is an online radio experience built around a virtual studio, with smooth jazz and soul at its front door and room to explore more sounds.</p>
            <div class="station-grid">${card("Music for the moment", "Explore Jazz, Hip Hop, R&B, House, Reggae and Gospel programming. Join a station in progress and let the programme carry the listening.")}${card("More than a playlist", "Find published podcasts, station events, world headlines and ways to connect with the people behind the sound.")}</div>
            <p class="station-section station-muted">AV Junki Radio is currently in beta. Listener feedback helps shape the experience.</p>
            <div class="station-actions">${action("radio","Explore the stations")}${action("contact","Contact the station")}${inquiryAction("Send feedback","Listener feedback")}</div>`;
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
      if (panel.hidden) returnFocus = document.activeElement;
      panel.hidden = false;
      panel.dataset.page = page;
      buttons.forEach(button => {
        const selected = button.dataset.stationPage === page;
        button.setAttribute("aria-expanded", String(selected));
        if (selected) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current");
      });
      render(page, TOPICS.includes(topic) ? topic : "");
      if (focus) title.focus({preventScroll:true});
    }
    function close() {
      revision++;
      panel.hidden = true;
      delete panel.dataset.page;
      buttons.forEach(button => {button.setAttribute("aria-expanded","false");button.removeAttribute("aria-current");});
      if (returnFocus?.isConnected) returnFocus.focus({preventScroll:true});
    }
    function navigate(page, topic = "") {
      const next = `${location.pathname}${location.search}${page ? `#${page}` : ""}`;
      if (location.hash !== (page ? `#${page}` : "")) history.pushState(null,"",next);
      if (page) open(page, topic); else close();
    }
    function route() {
      const page = location.hash.slice(1);
      if (PAGES[page]) {if (panel.hidden || panel.dataset.page !== page) open(page,"",false);}
      else if (!panel.hidden) close();
    }
    buttons.forEach(button => {
      button.setAttribute("aria-controls","station-pages");
      button.setAttribute("aria-expanded","false");
      button.addEventListener("click", event => {event.preventDefault();navigate(button.dataset.stationPage);});
    });
    document.getElementById("station-pages-close").addEventListener("click", () => navigate(""));
    body.addEventListener("click", event => {
      const target = event.target.closest("button");
      if (!target || !body.contains(target)) return;
      if (target.dataset.newMessage) {receipts.delete(target.dataset.newMessage);navigate(target.dataset.newMessage);}
      else if (target.dataset.page) navigate(target.dataset.page,target.dataset.topic);
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
        const response = await fetch(`${API}/api/station/messages`, {method:"POST",headers:{"Content-Type":"application/json"},signal:controller.signal,body:JSON.stringify({purpose,name:values.get("name"),email:values.get("email"),topic:values.get("topic"),message:values.get("message"),website:values.get("website"),consent:values.get("consent") === "on",submissionId:draft.submissionId})});
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
    const trackInfo = document.getElementById("player-track-info");
    if (trackInfo) new MutationObserver(() => {
      if (panel.hidden || panel.dataset.page !== "home") return;
      const current = nowPlaying();
      const trackTitle = document.getElementById("station-now-title"), trackArtist = document.getElementById("station-now-artist");
      if (trackTitle) trackTitle.textContent = current.title;
      if (trackArtist) trackArtist.textContent = current.artist;
    }).observe(trackInfo,{childList:true,characterData:true,subtree:true});
    route();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded",init,{once:true}); else init();
})();
