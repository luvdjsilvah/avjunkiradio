(() => {
  "use strict";
  const section = document.getElementById("section-inbox");
  if (!section) return;
  const filter = document.getElementById("stationInboxFilter");
  const status = document.getElementById("stationInboxStatus");
  const items = document.getElementById("stationInboxItems");
  const newer = document.getElementById("stationInboxNewer");
  const older = document.getElementById("stationInboxOlder");
  const previous = [];
  let before = null, next = null, revision = 0;

  const date = value => {
    const time = new Date(String(value).replace(" ","T") + "Z");
    return Number.isFinite(time.getTime()) ? new Intl.DateTimeFormat("en-US",{timeZone:"America/Los_Angeles",dateStyle:"medium",timeStyle:"short"}).format(time) + " PT" : "";
  };
  async function load() {
    const version = ++revision;
    status.className = "message";
    status.textContent = "Loading private station messages…";
    items.replaceChildren();
    newer.disabled = true;
    older.disabled = true;
    try {
      const params = new URLSearchParams({status:filter.value});
      if (before !== null) params.set("before",String(before));
      const response = await adminFetch(`${API_BASE}/api/station/inbox?${params}`,{cache:"no-store"});
      const data = await response.json();
      if (!response.ok || !data.ok || !Array.isArray(data.messages)) throw new Error(data.error || "The inbox could not be loaded.");
      if (version !== revision) return;
      next = data.nextBefore;
      status.className = "message good";
      status.textContent = `${Number(data.totals.new || 0)} new · ${Number(data.totals.read || 0)} read · ${Number(data.totals.archived || 0)} archived. ${data.messages.length} shown.`;
      items.innerHTML = data.messages.map(message => `<article class="drop-card" data-station-message="${Number(message.id)}">
        <div class="slot-label">${escapeHtml(message.status)} · ${escapeHtml(message.topic)}</div>
        <h2>${escapeHtml(message.name)}</h2>
        <p><a style="color:#efd0a0" href="mailto:${escapeHtml(encodeURIComponent(message.email))}">${escapeHtml(message.email)}</a></p>
        <p>${escapeHtml(date(message.created_at))} · ${escapeHtml(message.reference)} · ${escapeHtml(message.purpose)}</p>
        <p style="white-space:pre-wrap;overflow-wrap:anywhere;color:#f4eee8;margin:16px 0">${escapeHtml(message.message)}</p>
        <div style="display:flex;gap:8px">
          ${message.status !== "read" && message.status !== "archived" ? '<button class="button" type="button" data-message-status="read">Mark read</button>' : ""}
          ${message.status === "archived" ? '<button class="button" type="button" data-message-status="new">Restore to new</button>' : '<button class="button" type="button" data-message-status="archived">Archive</button>'}
        </div>
        <div class="message" role="status"></div>
      </article>`).join("") || '<p style="color:#bfae9f">No messages in this view.</p>';
      newer.disabled = previous.length === 0;
      older.disabled = !next;
    } catch (error) {
      if (version !== revision) return;
      status.className = "message bad";
      status.textContent = error.message;
    }
  }
  function reset() {before=null;next=null;previous.length=0;load();}
  document.querySelector('.admin-tab[data-section="inbox"]').addEventListener("click",reset);
  document.getElementById("stationInboxRefresh").addEventListener("click",reset);
  filter.addEventListener("change",reset);
  older.addEventListener("click",() => {if (next) {previous.push(before);before=next;load();}});
  newer.addEventListener("click",() => {if (previous.length) {before=previous.pop();load();}});
  window.addEventListener("station-admin-key-ready",() => {if (section.classList.contains("active")) reset();});
  items.addEventListener("click",async event => {
    const button = event.target.closest("button[data-message-status]");
    if (!button || !items.contains(button)) return;
    const card = button.closest("[data-station-message]");
    const message = card.querySelector(".message");
    button.disabled = true;
    message.textContent = "Saving…";
    try {
      const response = await adminFetch(`${API_BASE}/api/station/inbox/${encodeURIComponent(card.dataset.stationMessage)}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:button.dataset.messageStatus})});
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "The message could not be updated.");
      await load();
    } catch (error) {message.className="message bad";message.textContent=error.message;button.disabled=false;}
  });
})();
