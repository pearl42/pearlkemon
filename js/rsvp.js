/* ============================================================
   rsvp.js — the RSVP record: where it's kept, and where it's sent.

   A guest can come back and change their answer at any time, so every
   submission carries a stable `id`. Your endpoint should UPDATE the row
   with that id if it already exists and APPEND otherwise — the Apps
   Script in the README does exactly that.
   ============================================================ */

const RSVP_CONFIG = {
  // "console"   — logs to the browser console. Good for testing. (default)
  // "sheet"     — Google Sheet via Apps Script. Set endpoint below.
  // "formspree" — Formspree / Netlify Forms. Set endpoint below.
  // "worker"    — your own API. Set endpoint below.
  mode: "sheet",
  // "sheet" mode only: read the row back after posting, so a guest is told the
  // truth when Google silently drops it. Needs the doGet in tools/apps-script.gs.
  verify: true,
  endpoint: "https://script.google.com/macros/s/AKfycbzQVSv1jyEU1Jdj2YyIZmiXdGKcqN9fmVtiI0A2PAMHs8jyYK6MWFd9xxleLbiwSPvE/exec"
};

const STORE_KEY = "pokeparty.rsvp";

/* ---------- a stable id per guest ---------- */
function newId() {
  const r = new Uint8Array(8);
  (crypto || {}).getRandomValues ? crypto.getRandomValues(r) : r.forEach((_, i) => r[i] = Math.random() * 256);
  return Array.from(r, b => b.toString(16).padStart(2, "0")).join("");
}

/* ---------- the record ---------- */
function buildPayload(state) {
  return {
    id:             state.id,
    submittedAt:    new Date().toISOString(),
    revision:       state.revision || 1,
    name:           state.name || "",
    starter:        state.starter ? DEX.byId[state.starter].name : "",
    starterDex:     state.starter || "",
    plusOne:        state.plusOneName || "",
    plusOneStarter: state.plusOneStarter ? DEX.byId[state.plusOneStarter].name : "",
    plusOneDex:     state.plusOneStarter || "",
    attending:      state.attending,
    note:           state.note || "",
    rivalPokemon:   state.rivalSpecies ? DEX.byId[state.rivalSpecies].name : "",
    rivalNamed:     state.rivalName || "",      // what they called Pearl's grandson
    wonBattle:      !!state.won,
    attempts:       state.attempts || 0
  };
}

/* ---------- local persistence ----------
   Two places, because neither alone is enough:
   - localStorage remembers them on THIS browser.
   - the #r= hash in the URL is a link they can bookmark, mail to
     themselves, or open on another device. No account, no server read. */
function saveLocal(payload) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(payload)); } catch (e) { /* private mode */ }
  try {
    const packed = btoa(unescape(encodeURIComponent(JSON.stringify(payload))))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    history.replaceState(null, "", "#r=" + packed);
  } catch (e) { /* ignore */ }
}

function loadLocal() {
  // the link wins over this browser's memory — it's the more deliberate act
  const m = location.hash.match(/[#&]r=([A-Za-z0-9\-_]+)/);
  if (m) {
    try {
      const json = decodeURIComponent(escape(atob(m[1].replace(/-/g, "+").replace(/_/g, "/"))));
      return JSON.parse(json);
    } catch (e) { /* mangled link — fall through */ }
  }
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* ignore */ }
  return null;
}

function clearLocal() {
  try { localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ }
  try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { /* ignore */ }
}

function editLink() {
  return location.origin === "null" || location.protocol === "file:"
    ? location.href
    : location.origin + location.pathname + location.search + location.hash;
}

/* ---------- did it actually land? ----------
   fetch() cannot read a cross-origin Apps Script response, but a <script> tag
   can, so the check goes out as JSONP. Only the random id and the revision
   number travel in the URL — never a guest's name, plus-one or message.

   Apps Script can be slow to wake up, so ask a few times with a widening gap
   before giving up. A false "couldn't send" is a much cheaper mistake than a
   false "saved!", so anything unproven counts as failure. */
const VERIFY_TRIES = [900, 2000, 3500];   // ms to wait before each attempt
const VERIFY_TIMEOUT = 8000;              // per attempt

function jsonp(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const cb = "__rsvpcb_" + Math.random().toString(36).slice(2, 12);
    const tag = document.createElement("script");
    let settled = false;
    const cleanup = () => {
      try { delete window[cb]; } catch (e) { window[cb] = undefined; }
      if (tag.parentNode) tag.parentNode.removeChild(tag);
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true; cleanup(); reject(new Error("timeout"));
    }, timeoutMs);

    window[cb] = data => {
      if (settled) return;
      settled = true; clearTimeout(timer); cleanup(); resolve(data);
    };
    tag.onerror = () => {
      if (settled) return;
      settled = true; clearTimeout(timer); cleanup(); reject(new Error("blocked"));
    };
    tag.src = url + (url.indexOf("?") > -1 ? "&" : "?") + "callback=" + cb;
    document.head.appendChild(tag);
  });
}

async function verifyOnSheet(id, revision) {
  if (!RSVP_CONFIG.verify) return { ok: true, why: "verification off" };
  const url = RSVP_CONFIG.endpoint +
              "?verify=" + encodeURIComponent(id) +
              "&rev="    + encodeURIComponent(revision);
  let why = "no answer";
  for (const wait of VERIFY_TRIES) {
    await new Promise(r => setTimeout(r, wait));
    try {
      const res = await jsonp(url, VERIFY_TIMEOUT);
      if (res && res.ok) return { ok: true };
      why = res && res.error ? res.error
          : res && !res.found ? "row not found"
          : "stale revision";
    } catch (err) {
      why = String(err.message || err);
    }
  }
  console.warn("[RSVP] not verified:", why);
  return { ok: false, why };
}

/* ---------- sending ---------- */
async function submitRSVP(state) {
  const payload = buildPayload(state);
  saveLocal(payload);

  try {
    switch (RSVP_CONFIG.mode) {
      case "console":
        console.log("[RSVP]", payload);
        return { ok: true, mode: "console" };

      case "sheet": {
        // Apps Script web apps reject preflight, so send as no-cors plain text.
        await fetch(RSVP_CONFIG.endpoint, {
          method: "POST", mode: "no-cors",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(payload)
        });
        // A no-cors response is opaque: it resolves whatever Google did with
        // it, so on its own it proves nothing. Go and look instead.
        const seen = await verifyOnSheet(payload.id, payload.revision);
        return { ok: seen.ok, verified: seen.ok, mode: "sheet", why: seen.why };
      }

      case "formspree":
      case "worker": {
        const res = await fetch(RSVP_CONFIG.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify(payload)
        });
        return { ok: res.ok, mode: RSVP_CONFIG.mode, status: res.status };
      }

      default:
        return { ok: false, error: "Unknown RSVP mode: " + RSVP_CONFIG.mode };
    }
  } catch (err) {
    console.error("[RSVP] send failed", err);
    return { ok: false, error: String(err) };
  }
}
