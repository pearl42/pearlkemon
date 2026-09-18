/* ============================================================
   game.js — scenes, dialogue, the crate, battle UI, trainer card.
   ============================================================ */

const $  = (id) => document.getElementById(id);
const on = (el, ev, fn) => el && el.addEventListener(ev, fn);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));

const state = {
  id: null, revision: 0,
  name: "", rivalName: "", plusOneName: "", starter: null, plusOneStarter: null, comingSolo: false,
  rivalSpecies: null, won: false, attempts: 0, attending: null, note: "", handNote: "",
  unlocked: false
};

const TYPE_COLORS = {
  normal:"#9aa0a6", fire:"#ef7a45", water:"#4aa3e0", grass:"#5fbf6a", electric:"#e0b429",
  ground:"#c9a86c", rock:"#a89a72", flying:"#8fa8e0", bug:"#8cba4a", psychic:"#e0709a",
  dark:"#6b6270", steel:"#8b98a6", ice:"#5cc0d0", fairy:"#e79ac2", fighting:"#c3543f",
  poison:"#a066bb", ghost:"#7a6ea8", dragon:"#6f63c4"
};

/* ---------- text substitution ---------- */
function fill(s) {
  return String(s)
    .replace(/\{NAME\}/g,        state.name || "Trainer")
    .replace(/\{RIVAL\}/g,       state.rivalName || "her grandson")
    .replace(/\{PLUSONE\}/g,     state.plusOneName || "your plus-one")
    .replace(/\{STARTER\}/g,     state.starter ? DEX.byId[state.starter].name : "your partner")
    .replace(/\{PLUSSTARTER\}/g, state.plusOneStarter ? DEX.byId[state.plusOneStarter].name : "that one")
    .replace(/\{HOST\}/g,        PARTY.hostName);
}

/* ---------- sprites ---------- */
const placeholderCache = {};
function placeholderFor(label, color) {
  const key = label + color;
  if (placeholderCache[key]) return placeholderCache[key];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <ellipse cx="32" cy="54" rx="20" ry="5" fill="rgba(0,0,0,.15)"/>
    <path d="M32 10c12 0 20 9 20 20 0 11-9 20-20 20s-20-9-20-20c0-11 8-20 20-20z" fill="${color}" stroke="#2b2f3a" stroke-width="2.5"/>
    <circle cx="25" cy="29" r="3.2" fill="#2b2f3a"/><circle cx="39" cy="29" r="3.2" fill="#2b2f3a"/>
    <path d="M26 38q6 5 12 0" stroke="#2b2f3a" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <text x="32" y="62" font-family="monospace" font-size="7" text-anchor="middle" fill="#2b2f3a">${label}</text>
  </svg>`;
  const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  placeholderCache[key] = url;
  return url;
}
function setSprite(imgEl, src, label, color) {
  imgEl.onerror = () => { imgEl.onerror = null; imgEl.src = placeholderFor(label, color || "#9aa0a6"); };
  imgEl.src = src;
  imgEl.alt = label;
}
function monSprite(imgEl, mon, back) {
  imgEl.onerror = () => {
    imgEl.onerror = () => { imgEl.onerror = null; imgEl.src = placeholderFor(mon.name, TYPE_COLORS[mon.types[0]]); };
    imgEl.src = spriteFront(mon.id);
    imgEl.style.setProperty("--sprite-scale", spriteScale(mon.id, false));
  };
  imgEl.src = back ? spriteBack(mon.id) : spriteFront(mon.id);
  imgEl.alt = mon.name;
  imgEl.style.setProperty("--sprite-scale", spriteScale(mon.id, back));
}

/* Every species is drawn at a different size inside its 96x96 canvas, so each
   one gets its own scale to land at about the same size on screen. Keeping the
   canvas is what keeps the crate's Poke Balls uniform. */
function spriteScale(id, back) {
  const cfg = typeof SPRITE_SIZE !== "undefined" ? SPRITE_SIZE : { target: 0.78, min: 0.78, max: 2 };
  const fit = (typeof SPRITE_FIT !== "undefined" && SPRITE_FIT[id]) || null;
  const f = fit ? (back ? fit[1] || fit[0] : fit[0]) : 0;
  if (!f) return 1;
  return Math.min(cfg.max, Math.max(cfg.min, cfg.target / f)).toFixed(3);
}

/* ---------- scenes ---------- */
const SCENE_MUSIC = {
  "scene-title":   "title",
  "scene-talk":    "lab",
  "scene-starter": "crate",
  "scene-battle":  "battle",
  "scene-details": "details"
};

function showScene(id) {
  document.querySelectorAll(".scene").forEach(s => s.classList.toggle("active", s.id === id));
  if (SCENE_MUSIC[id]) Sound.music(SCENE_MUSIC[id]);
  const skip = $("skip-link");
  if (skip && !skip.hidden) skip.style.display = (id === "scene-details") ? "none" : "";
}

/* ---------- typewriter ---------- */
let typing = null;
function typeInto(spanEl, arrowEl, text) {
  const isAside = text.startsWith("*");
  const body = isAside ? text.slice(1).trim() : text;
  spanEl.className = isAside ? "aside" : "";
  spanEl.textContent = "";
  if (arrowEl) arrowEl.hidden = true;
  if (typing) clearInterval(typing);
  let i = 0;
  const speed = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 18;
  const finish = () => { spanEl.textContent = body; if (arrowEl) arrowEl.hidden = false; typing = null; };
  if (!speed) return finish();
  typing = setInterval(() => {
    spanEl.textContent = body.slice(0, ++i);
    if (i >= body.length) { clearInterval(typing); finish(); }
  }, speed);
}
function fastForward(spanEl, arrowEl, text) {
  if (!typing) return false;
  clearInterval(typing); typing = null;
  spanEl.textContent = text.startsWith("*") ? text.slice(1).trim() : text;
  if (arrowEl) arrowEl.hidden = false;
  return true;
}

/* ============================================================
   DIALOGUE
   Every chain gets a token. A callback from a stale chain — a
   double-tapped OK button, a leftover listener — is dropped instead
   of quietly starting a second copy of the story.
   ============================================================ */
let talkQueue = [], talkRaw = [], talkIndex = 0, talkEnd = null, currentLine = "", chainToken = 0;

function say(lines, onEnd, portrait) {
  showScene("scene-talk");
  hidePrompt();
  const pw = $("portrait-wrap");
  if (pw) { clearTimeout(zoomTimer); pw.classList.remove("zoom-hand"); }
  if (portrait) {
    const img = $("talk-portrait");
    // Same speaker, same artwork, already on screen? Then this is a new chain
    // of dialogue from someone who never left. Re-running the pop animation
    // there reads as a blip where she vanishes and springs back in, so leave
    // the portrait — and the writing on her hand — exactly as they are.
    const wantSrc = "sprites/" + portrait.file;
    const same = !img.hidden && currentSpeaker === portrait.label &&
                 (img.getAttribute("src") || "") === wantSrc;
    if (!same) {
      img.classList.remove("enter"); void img.offsetWidth; img.classList.add("enter");
      setSprite(img, wantSrc, portrait.label, portrait.color);
      img.hidden = false;
      currentSpeaker = portrait.label;
      updateHandNote(false);
    }
  }
  chainToken++;
  talkRaw = lines.slice();
  talkQueue = lines.map(fill);
  talkIndex = -1;
  talkEnd = onEnd;
  advanceTalk();
}

function advanceTalk() {
  talkIndex++;
  hidePrompt();                       // the OK row belongs to input steps only
  if (talkIndex >= talkQueue.length) {
    const f = talkEnd; talkEnd = null;
    f && f();
    return;
  }
  currentLine = talkQueue[talkIndex];
  if (/received the/i.test(currentLine)) Sound.fanfare("keyitem");
  const writesOnHand = /\[\[hand\]\]/.test(currentLine);
  const putsOnCostume = /\[\[karp\]\]/.test(currentLine);
  const healsYou = /\[\[heal\]\]/.test(currentLine);
  currentLine = currentLine.replace(/\s*\[\[(hand|karp|heal)\]\]\s*/g, " ").trim();
  setSpeaker(talkRaw[talkIndex]);
  if (putsOnCostume) wearTheCostume();
  if (writesOnHand) writeOnHand();
  if (healsYou) Sound.play("heal"); else Sound.play("text");
  typeInto($("talk-text"), $("talk-arrow"), currentLine);
}

/* A scene can change speaker mid-chain — the victory beat hands off from the
   rival to Pearl. Swap the portrait to match whoever is talking. */
let currentSpeaker = null;
function setSpeaker(rawLine) {
  if (!rawLine) return;
  let who = null;
  if (/^\s*PEARL\s*:/i.test(rawLine))      who = PEARL();
  else if (/^\s*\{RIVAL\}\s*:/.test(rawLine)) who = RIVAL();
  if (!who || who.label === currentSpeaker) return;
  currentSpeaker = who.label;
  const img = $("talk-portrait");
  img.classList.remove("enter"); void img.offsetWidth; img.classList.add("enter");
  setSprite(img, "sprites/" + who.file, who.label, who.color);
  img.hidden = false;
  updateHandNote(false);
}

/* ---------- the name on Pearl's hand ----------
   She writes it down so she won't forget again, and it stays there for the
   rest of the visit. Positioned against her artwork rather than the screen,
   so it lands on her palm at every size. */
/* Returns true only if the note actually got placed. Callers use that to
   decide whether it's safe to make it visible: a note that is shown before
   it has coordinates falls back to its static position and flashes in the
   middle of the screen. */
function placeHandNote() {
  const wrap = $("portrait-wrap"), note = $("hand-note"), img = $("talk-portrait");
  if (!wrap || !note || !img) return false;
  if (!img.complete || !img.naturalWidth) return false;

  // offsetWidth/Height/Left/Top are LAYOUT measurements: unlike
  // getBoundingClientRect they ignore CSS transforms, so neither the pop-in
  // animation nor the zoom-hand push-in can distort them. That's what makes
  // it safe to re-measure whenever the layout might have moved — which is
  // the actual fix, because the stage resizes when the input prompt appears
  // and the old pixel offsets were left pointing at thin air.
  const iw = img.offsetWidth, ih = img.offsetHeight;
  if (!iw || !ih) return false;
  // img sits inside .portrait-wrap, which is position:relative, so its
  // offsets are already in the wrapper's coordinates.
  const ox = img.offsetParent === wrap ? img.offsetLeft : 0;
  const oy = img.offsetParent === wrap ? img.offsetTop  : 0;

  const H = currentHand();
  const fx = parseFloat(H.x) / 100, fy = parseFloat(H.y) / 100;
  note.style.left = (ox + iw * fx) + "px";
  note.style.top  = (oy + ih * fy) + "px";
  note.style.setProperty("--hand-tilt", H.tilt);

  // Shrink to fit the palm — a 14-character name is as welcome as a 4-letter one.
  let size = iw * (H.size || 0.105);
  note.style.fontSize = size + "px";
  const allowed = iw * (H.maxWidth || 0.105);
  // scrollWidth is the unrotated layout width — getBoundingClientRect would
  // return the tilted bounding box and over-shrink the text.
  const actual = note.scrollWidth;
  if (actual > allowed) size = Math.max(6, size * (allowed / actual));
  note.style.fontSize = size + "px";
  return true;
}

/* The stage changes size when the input prompt opens, when a button row
   appears, and when the phone is rotated. Any of those moves the artwork, so
   the writing has to be re-measured against it. */
function repositionHandNote() {
  const note = $("hand-note");
  if (note && note.classList.contains("show")) placeHandNote();
}
window.addEventListener("resize", repositionHandNote);
window.addEventListener("orientationchange", repositionHandNote);

/* Watch the WRAPPER, not just the picture. When the input prompt opens the
   stage gets shorter, and because the artwork is bottom-aligned it slides up
   without changing size at all — its height stays 507px while its top moves
   61px. A ResizeObserver on the image sees nothing there; one on the wrapper
   sees the height change and fires. That was the writing halfway down her arm
   on the "who's coming with you?" screen.

   Safe from feedback loops: this only moves the note, which cannot resize
   either element. */
if (typeof ResizeObserver !== "undefined") {
  const ro = new ResizeObserver(repositionHandNote);
  [$("portrait-wrap"), $("talk-portrait")].forEach(el => el && ro.observe(el));
}
let handPlacedOn = "";      // which artwork the note was last measured against
let handWaiting = false;

/* The artwork wasn't ready to be measured against. Keep the writing hidden
   and try again as it loads, rather than showing it somewhere wrong. */
function showHandNoteWhenReady() {
  if (handWaiting) return;
  handWaiting = true;
  const note = $("hand-note"), img = $("talk-portrait");
  let tries = 0;
  const attempt = () => {
    if (!state.handNote || currentSpeaker !== "Professor Pearl") { handWaiting = false; return; }
    if (placeHandNote()) { note.classList.add("show"); handWaiting = false; return; }
    if (++tries > 40) { handWaiting = false; return; }   // ~4s, then give up quietly
    setTimeout(attempt, 100);
  };
  if (img && img.decode) img.decode().then(attempt).catch(() => {});
  setTimeout(attempt, 60);
}

function updateHandNote(writing) {
  const note = $("hand-note");
  if (!note) return;
  const onPearl = currentSpeaker === "Professor Pearl";
  if (!state.handNote || !onPearl) { note.classList.remove("show", "writing"); return; }
  note.textContent = state.handNote;

  // Re-measure every time. This used to be once per artwork, to dodge the
  // pop-in animation distorting getBoundingClientRect — but placeHandNote no
  // longer reads transformed boxes, so measuring often is free, and stale
  // offsets were what sent the writing wandering when the stage resized.
  //
  // Crucially: only reveal it once it HAS a place. Showing first and
  // measuring after is what made it flash, sometimes mid-screen, on the
  // frames where the artwork hadn't finished loading or laying out.
  handPlacedOn = pearlOutfit;
  if (placeHandNote()) {
    note.classList.add("show");
    requestAnimationFrame(placeHandNote);    // refine once layout settles
  } else {
    note.classList.remove("show");
    showHandNoteWhenReady();
  }
  if (writing) {
    note.classList.remove("writing"); void note.offsetWidth; note.classList.add("writing");
    pushInOnHand();
  }
}

/* Lean in on her hand for a couple of seconds so the name is readable, then
   pull back. The palm is about a tenth of the artwork wide — without this the
   gag is there but nobody can see it on a phone. */
let zoomTimer = null;
function pushInOnHand() {
  const wrap = $("portrait-wrap"), img = $("talk-portrait");
  if (!wrap || !img || !(HAND.zoom > 1)) return;
  const ib = img.getBoundingClientRect(), wb = wrap.getBoundingClientRect();
  if (!ib.width) return;
  const H = currentHand();
  const ox = (ib.left - wb.left + ib.width  * parseFloat(H.x) / 100) / wb.width  * 100;
  const oy = (ib.top  - wb.top  + ib.height * parseFloat(H.y) / 100) / wb.height * 100;
  wrap.style.transformOrigin = `${ox}% ${oy}%`;
  wrap.style.setProperty("--zoom", HAND.zoom);
  wrap.classList.add("zoom-hand");
  clearTimeout(zoomTimer);
  zoomTimer = setTimeout(() => wrap.classList.remove("zoom-hand"), HAND.zoomHold || 2600);
}
// function writeOnHand() {
//   state.handNote = state.rivalName || "";
//   // a beat, so it appears as she's writing rather than before she starts
//   setTimeout(() => updateHandNote(true), 260);
// }
function writeOnHand() {
  let name = state.rivalName || "";
  state.handNote = name ? ` ${name} ` : "";
  
  // a beat, so it appears as she's writing rather than before she starts
  setTimeout(() => updateHandNote(true), 260);
}
on(window, "resize", placeHandNote);
on($("talk-portrait"), "load", () => updateHandNote(false));

function tapTalk() {
  if (fastForward($("talk-text"), $("talk-arrow"), currentLine)) return;
  if (!$("talk-input-wrap").hidden) return;   // mid-input: the box isn't a "next"
  advanceTalk();
}
on($("talk-box"), "click", tapTalk);
on($("talk-box"), "keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tapTalk(); } });

function hidePrompt() {
  $("talk-input-wrap").hidden = true;
  $("talk-buttons").hidden = true;
  $("talk-buttons").innerHTML = "";
  repositionHandNote();       // the stage just grew back
}

/* One listener on the reused input, forever. Re-registering per prompt is
   what made an old question's answer fire again three steps later. */
let pendingSubmit = null;
on($("talk-input"), "keydown", e => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  pendingSubmit && pendingSubmit();
});

function ask(promptLine, placeholder, onSubmit, opts = {}) {
  say([promptLine], () => {
    const token = chainToken;
    const wrap = $("talk-input-wrap"), input = $("talk-input"), row = $("talk-buttons");
    wrap.hidden = false;
    repositionHandNote();       // the stage just shrank to make room
    input.value = opts.value || "";
    input.placeholder = placeholder || "";
    input.maxLength = opts.maxLength || 14;
    input.focus();

    let done = false;
    const submit = () => {
      if (done || token !== chainToken) return;   // one answer per question
      const v = input.value.trim();
      if (!v && !opts.allowEmpty) { input.focus(); toast("Give me something to work with."); return; }
      done = true;
      pendingSubmit = null;
      hidePrompt();
      onSubmit(v);
    };
    pendingSubmit = submit;

    row.hidden = false; row.innerHTML = "";
    const go = document.createElement("button");
    go.className = "btn primary"; go.textContent = "OK";
    on(go, "click", () => { go.disabled = true; Sound.play("select"); submit(); });
    row.appendChild(go);
    // The stage shrinks TWICE here — once for the input, once for this button
    // row — and each one slides the artwork up. Re-place after the second.
    repositionHandNote();
  });
}

/* A row of choices under the text box. */
function choose(lines, options, portrait) {
  say(lines, () => {
    const token = chainToken;
    const row = $("talk-buttons");
    row.hidden = false; row.innerHTML = "";
    options.forEach(o => {
      const b = document.createElement("button");
      b.className = "btn " + (o.primary ? "primary" : "");
      b.textContent = o.label;
      on(b, "click", () => {
        if (token !== chainToken) return;
        Sound.play("select");
        row.innerHTML = ""; row.hidden = true;
        o.action();
      });
      row.appendChild(b);
    });
    repositionHandNote();        // this row resizes the stage too
  }, portrait);
}

function toast(msg) {
  const t = $("toast");
  t.textContent = msg; t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2400);
}

/* Pearl has two outfits. The [[karp]] marker in the script switches her into
   the Magikarp costume for good — the artwork is taller, so her hand sits at a
   different spot and the note that's written on it has to follow. */
let pearlOutfit = "professor";
const PEARL = () => ({
  file: pearlOutfit === "karp" ? TRAINER_ART.professorKarp : TRAINER_ART.professor,
  label: "Professor Pearl", color: "#b9a7d8",
  hand: pearlOutfit === "karp" ? HAND_KARP : HAND
});
const currentHand = () => (currentSpeaker === "Professor Pearl" && pearlOutfit === "karp") ? HAND_KARP : HAND;

function wearTheCostume() {
  if (pearlOutfit === "karp") return;
  pearlOutfit = "karp";
  const img = $("talk-portrait");
  img.classList.remove("enter"); void img.offsetWidth; img.classList.add("enter");
  setSprite(img, "sprites/" + TRAINER_ART.professorKarp, "Professor Pearl", "#b9a7d8");
  // The costume art is a different shape, so the writing on her palm has to be
  // re-placed — but only once the new picture has actually been laid out.
  // Measuring too early pins it to the old image's box.
  //
  // Until then the note is hidden rather than left sitting at coordinates
  // that belong to the previous artwork. It fades out and back in over the
  // costume change, which reads as part of the gag.
  handPlacedOn = "karp";
  const note = $("hand-note");
  const wasShown = note && note.classList.contains("show");
  if (wasShown) note.classList.remove("show");
  const replace = () => {
    if (!state.handNote) return;
    placeHandNote();
    if (wasShown && note) note.classList.add("show");
  };
  if (img.decode) img.decode().then(replace).catch(replace);
  setTimeout(replace, 120);
  setTimeout(replace, 400);
  setTimeout(replace, 900);
}
const RIVAL = () => ({ file: TRAINER_ART.rival, label: state.rivalName || "Rival", color: "#e0a05a" });

/* ============================================================
   FLOW
   ============================================================ */
function start() {
  $("skip-link").hidden = false;
  say(SCRIPT.intro, askPlayerName, PEARL());
}
function askPlayerName() {
  ask(SCRIPT.askName, "Your name", v => {
    state.name = v;
    say(SCRIPT.afterName, () => say(SCRIPT.rivalIntro, askRivalName, RIVAL()), PEARL());
  });
}
function askRivalName() {
  ask(SCRIPT.askRival, "Who are you bringing?", v => {
    state.rivalName = v;
    say(SCRIPT.afterRival, () => say(SCRIPT.starterIntro, () => openCrate("player"), PEARL()), PEARL());
  });
}

/* ============================================================
   THE CRATE
   mode: "player" | "plusone" | "edit-player" | "edit-plusone"
   ============================================================ */
let crateMode = "player";

function openCrate(mode) {
  crateMode = mode;
  $("screen").classList.remove("glitching");
  showScene("scene-starter");
  $("picker-search").value = "";
  $("picker-search").placeholder = `Search ${DEX.species.length} Pokémon…`;
  renderBalls(DEX.species);
  setPickInfo(null);
  $("picker-search").focus({ preventScroll: true });
}

function crateOwner() {
  return (crateMode === "plusone" || crateMode === "edit-plusone")
    ? (state.plusOneName || "your plus-one") : (state.name || "you");
}

function renderBalls(list) {
  const grid = $("ball-grid");
  grid.innerHTML = "";
  if (!list.length) {
    grid.innerHTML = `<p class="no-hits">Nothing in the crate by that name.</p>`;
    return;
  }
  const frag = document.createDocumentFragment();
  list.forEach(s => {
    const ball = document.createElement("button");
    ball.className = "ball"; ball.type = "button";
    ball.dataset.id = s.id;
    ball.setAttribute("role", "option");
    ball.setAttribute("aria-label", `Poké Ball ${s.id}. Open to see what's inside.`);
    ball.innerHTML = `<span class="ball-art" aria-hidden="true"></span><img class="ball-mon" alt="" hidden>`;
    // No hover handler. Revealing on hover meant that moving the mouse from
    // the ball you'd clicked over to the Choose button dragged the selection
    // along with it — every ball the pointer crossed took over the panel, so
    // anything not on the edge of the grid was impossible to choose.
    on(ball, "focus", () => reveal(s, ball));
    // Tapping a ball only ever opens it and shows what's inside. It used to
    // pick the Pokemon if the ball was already open, which meant flicking
    // back and forth between two you'd revealed chose the second one for you.
    // Choosing happens on the Choose button, and nowhere else.
    on(ball, "click", () => reveal(s, ball));
    frag.appendChild(ball);
  });
  grid.appendChild(frag);
}

function reveal(s, ball) {
  if (!ball.classList.contains("open")) {
    Sound.play("ball");
    Sound.cry(s.slug);
    const img = ball.querySelector(".ball-mon");
    setSprite(img, spriteFront(s.id), s.name, TYPE_COLORS[s.types[0]]);
    img.hidden = false;
    ball.classList.add("open");
    ball.setAttribute("aria-label", `${s.name}, ${s.types.join(" and ")} type.`);
  }
  document.querySelectorAll(".ball.focused").forEach(b => b.classList.remove("focused"));
  ball.classList.add("focused");
  setPickInfo(s);
}

function setPickInfo(s) {
  const row = $("starter-buttons");
  row.hidden = false; row.innerHTML = "";

  if (!s) {
    const who = crateMode.endsWith("plusone")
      ? `Pick one for ${esc(state.plusOneName || "your plus-one")}.`
      : `Thirty years of fieldwork, and not one label.`;
    $("starter-text").innerHTML = `${who} Open a ball — or search if you already know who you want.`;
  } else {
    const chips = s.types.map(t =>
      `<span class="type-chip" style="background:${TYPE_COLORS[t]}">${t}</span>`).join("");
    const tag = s.legendary ? `<span class="tag-legendary">legendary</span>` : "";
    $("starter-text").innerHTML =
      `<strong>#${String(s.id).padStart(3, "0")} ${esc(s.name)}</strong> ${chips} ${tag}
       <small>${s.moves.map(m => esc(DEX.moves[m].name)).join(" · ")}</small>`;
    const pick = document.createElement("button");
    pick.className = "btn primary"; pick.textContent = `Choose ${s.name} ▸`;
    on(pick, "click", () => choosePokemon(s.id));
    row.appendChild(pick);
  }

  if (crateMode === "plusone") {
    const solo = document.createElement("button");
    solo.className = "btn ghost";
    solo.textContent = `${state.plusOneName || "They"} isn't coming`;
    on(solo, "click", goSolo);
    row.appendChild(solo);
  } else if (crateMode.startsWith("edit")) {
    const back = document.createElement("button");
    back.className = "btn ghost"; back.textContent = "← Back";
    on(back, "click", openCard);
    row.appendChild(back);
  }
}

/* ---------- MISSINGNO. ----------
   Type it into the search box. There is no 152nd ball in the crate, but the
   search finds one anyway, and it is not well. */
const GLITCH_SPRITE = (() => {
  // deterministic garbage — an 8x8 block of noise, scaled up and pixelated
  let rects = "", seed = 1337;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const r = rnd();
    if (r < 0.42) continue;
    const shade = r < 0.6 ? "#2b2f3a" : r < 0.8 ? "#6b6270" : "#c9c4b4";
    rects += `<rect x="${x * 8}" y="${y * 8}" width="8" height="8" fill="${shade}"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${rects}</svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
})();

const MISSINGNO = {
  id: 0, name: "MISSINGNO.", slug: "missingno", types: ["normal"],
  glitch: true, moves: [],
  base: { hp: 33, atk: 136, def: 0, spa: 6, spd: 6, spe: 29 }   // the real ones
};

function isMissingnoQuery(q) { return /^\s*missin?g?\s*no\.?\s*$/i.test(q); }

function renderGlitchBall() {
  const grid = $("ball-grid");
  grid.innerHTML = "";
  const ball = document.createElement("button");
  ball.className = "ball open glitch focused"; ball.type = "button";
  ball.setAttribute("role", "option");
  ball.setAttribute("aria-label", "MISSINGNO. Do not.");
  ball.innerHTML = `<img class="ball-mon" src="${GLITCH_SPRITE}" alt="">`;
  on(ball, "click", touchMissingno);
  grid.appendChild(ball);

  $("starter-text").innerHTML =
    `<strong class="glitch-text">#000 MISSINGNO.</strong>
     <span class="type-chip" style="background:#6b6270">?????</span>
     <small>▯▯▯▯▯ · ▯▯▯▯▯▯▯ · ▯▯▯ · ▯▯▯▯▯▯▯▯</small>`;
  const row = $("starter-buttons");
  row.hidden = false; row.innerHTML = "";
  const b = document.createElement("button");
  b.className = "btn"; b.textContent = "Choose M̸I̷S̶S̵I̴N̷G̸N̶O̴. ▸";
  on(b, "click", touchMissingno);
  row.appendChild(b);
}

function touchMissingno() {
  const screen = $("screen");
  screen.classList.add("glitching");
  Sound.play("text");
  setTimeout(() => {
    screen.classList.remove("glitching");
    const back = crateMode;
    say(SCRIPT.missingno, () => openCrate(back), PEARL());
  }, 900);
}

on($("picker-search"), "input", e => {
  if (isMissingnoQuery(e.target.value)) return renderGlitchBall();
  const hits = searchSpecies(e.target.value);
  renderBalls(hits);
  if (hits.length === 1) {
    const ball = $("ball-grid").querySelector(".ball");
    if (ball) reveal(hits[0], ball);
  } else {
    setPickInfo(null);
  }
});
on($("picker-random"), "click", () => {
  const s = DEX.species[Math.floor(Math.random() * DEX.species.length)];
  $("picker-search").value = "";
  renderBalls(DEX.species);
  const ball = $("ball-grid").querySelector(`.ball[data-id="${s.id}"]`);
  if (ball) { reveal(s, ball); ball.scrollIntoView({ block: "center", behavior: "smooth" }); }
});

/* Some picks deserve a comment. PICK_JOKES in config is keyed by dex slug;
   anything without an entry just doesn't get one. */
function jokeFor(id) {
  const s = DEX.byId[id];
  if (!s || typeof PICK_JOKES === "undefined") return [];
  const line = PICK_JOKES[s.slug];
  return line ? [line] : [];
}

/* A custom line for this Pokemon stands IN PLACE of Pearl's stock reaction,
   not in front of it — "Eevee, don't you dare" followed by "Bold choice!"
   reads like she forgot she'd already said something. The rest of the
   sequence (the rival watching, him picking his own) always plays. */
function reactionTo(id, script) {
  const joke = jokeFor(id);
  return joke.length ? joke.concat(script.slice(1)) : script.slice();
}

function choosePokemon(id) {
  switch (crateMode) {
    case "player":
      state.starter = id;
      state.rivalSpecies = pickRivalSpecies(id);
      say(reactionTo(id, SCRIPT.afterStarter),
          () => say(SCRIPT.rivalTaunt, beginBattle, RIVAL()), PEARL());
      break;
    case "plusone":
      state.plusOneStarter = id;
      state.comingSolo = false;
      say(jokeFor(id).concat(SCRIPT.afterPlusOne), openCard, PEARL());
      break;
    case "edit-player":
      state.starter = id;
      openCard();
      break;
    case "edit-plusone":
      state.plusOneStarter = id;
      state.comingSolo = false;
      openCard();
      break;
  }
}

function goSolo() {
  state.comingSolo = true;
  state.plusOneStarter = null;
  say(SCRIPT.soloPath, openCard, PEARL());
}

/* ============================================================
   BATTLE — 1v1, no switching
   ============================================================ */
let battle = null, eventQueue = [], battleLine = "", battleAdvance = null, lowHpWarned = false;

/* ---------- input lock ----------
   While a turn resolves the move buttons stay on screen but go dead, and
   every new line of commentary holds the tap for a beat. Without this the
   menu collapsing out of the layout slid the textbox up under the player's
   finger, so spamming one spot alternately picked a move and skipped the
   line describing what it did -- you could win without ever seeing the
   rival attack or the HP bar move. */
const TAP_HOLD_MS = 400;     // per line of battle commentary
let inputLockUntil = 0;
const inputLocked = () => performance.now() < inputLockUntil;
const holdInput = ms => { inputLockUntil = Math.max(inputLockUntil, performance.now() + ms); };
function setMenuBusy(busy) {
  const menu = $("battle-menu");
  if (!menu) return;
  menu.classList.toggle("busy", !!busy);
  menu.querySelectorAll("button").forEach(b => {
    if (busy) { if (!b.disabled) { b.dataset.wasEnabled = "1"; b.disabled = true; } }
    else if (b.dataset.wasEnabled) { delete b.dataset.wasEnabled; b.disabled = false; }
  });
}

function beginBattle() {
  state.attempts++;
  lowHpWarned = false;
  inputLockUntil = 0;
  Sound.stopLoop("lowHp");
  const mine = makeMon(state.starter, BATTLE.playerLevel, BATTLE.playerBudget);
  const foe  = makeMon(state.rivalSpecies, BATTLE.rivalLevel, BATTLE.rivalBudget);
  battle = new Battle(mine, foe, state.name, state.rivalName);
  showScene("scene-battle");
  document.querySelectorAll(".battler").forEach(b => b.classList.remove("down", "hit"));
  renderField();
  eventQueue = [
    { t:"text", text: `${state.rivalName} sent out ${foe.name}!`, cry: foe.species.slug },
    { t:"text", text: `Go! ${mine.name}!`, cry: mine.species.slug }
  ];
  drainEvents(showBattleMenu);
}

const hpColor = f => f > .5 ? "var(--hp-hi)" : f > .2 ? "var(--hp-mid)" : "var(--hp-lo)";

function renderHP(boxId, mon, showNumbers) {
  const frac = mon.hp / mon.max;
  let chips = "";
  if (mon.status && STATUS_SHORT[mon.status]) chips += `<span class="status-chip">${STATUS_SHORT[mon.status]}</span>`;
  if (mon.confusedTurns > 0) chips += `<span class="status-chip cnf">CNF</span>`;
  $(boxId).innerHTML = `
    <div class="row1"><span class="mon-name">${esc(mon.name)}</span><span class="lv">Lv${mon.level}</span></div>
    ${chips ? `<div class="chips">${chips}</div>` : ""}
    <div class="hp-track"><div class="hp-fill" style="width:${frac * 100}%;background:${hpColor(frac)}"></div></div>
    ${showNumbers ? `<div class="hp-num">${mon.hp}/${mon.max}</div>` : ""}`;
}

function renderField() {
  renderHP("hp-mine", battle.me(), true);
  renderHP("hp-foe", battle.them(), false);
  monSprite($("sprite-mine").querySelector("img"), battle.me(), true);
  monSprite($("sprite-foe").querySelector("img"), battle.them(), false);
}

function drainEvents(done) {
  // Keep the menu where it is and disable it, rather than pulling it out of
  // the layout -- a hidden menu lets everything below slide up into the space
  // the player is still tapping.
  const menu = $("battle-menu");
  if (menu.children.length) setMenuBusy(true); else menu.hidden = true;
  const step = () => {
    if (!eventQueue.length) { done && done(); return; }
    const ev = eventQueue.shift();
    if (ev.t === "text") {
      battleLine = ev.text;
      if (ev.cry) Sound.cry(ev.cry); else Sound.play("text");
      // the commentary tells us how hard it landed
      if (/super effective/i.test(ev.text)) Sound.play("hitSuper");
      else if (/not very effective/i.test(ev.text)) Sound.play("hitWeak");
      typeInto($("battle-text"), $("battle-arrow"), ev.text);
      battleAdvance = step;
      holdInput(TAP_HOLD_MS);
      return;
    }
    if (ev.t === "damage") {
      const el = ev.side === "player" ? $("sprite-mine") : $("sprite-foe");
      el.classList.remove("hit"); void el.offsetWidth; el.classList.add("hit");
      renderHP(ev.side === "player" ? "hp-mine" : "hp-foe", ev.mon, ev.side === "player");
      Sound.play("hit");
      // the low-HP beep, once, for your own Pokemon
      if (ev.side === "player" && !lowHpWarned && ev.mon.hp > 0 && ev.mon.hp / ev.mon.max <= 0.2) {
        lowHpWarned = true; Sound.startLoop("lowHp");
      }
    }
    if (ev.t === "faint") {
      (ev.side === "player" ? $("sprite-mine") : $("sprite-foe")).classList.add("down");
      Sound.stopLoop("lowHp");
      Sound.play("faint");
      Sound.cry(ev.mon.species.slug);
    }
    if (ev.t === "status") {
      renderHP("hp-mine", battle.me(), true);
      renderHP("hp-foe", battle.them(), false);
    }
    setTimeout(step, 320);
  };
  step();
}

function tapBattle() {
  if (inputLocked()) return;
  if (fastForward($("battle-text"), $("battle-arrow"), battleLine)) return;
  const f = battleAdvance; battleAdvance = null;
  f && f();
}
on($("battle-box"), "click", tapBattle);
on($("battle-box"), "keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tapBattle(); } });

function showBattleMenu() {
  if (battle.over) return finishBattle();

  battleLine = `What will ${battle.me().name} do?`;
  typeInto($("battle-text"), $("battle-arrow"), battleLine);
  $("battle-arrow").hidden = true;

  const menu = $("battle-menu");
  menu.hidden = false; menu.innerHTML = "";
  setMenuBusy(false);
  const foe = battle.them();

  const mine = battle.me();
  const outOfPP = !mine.moves.some(m => m.pp > 0);
  // Abra knows Teleport. Magikarp knows Splash. They still need a button.
  const noAttack = !mine.moves.some(m => m.pp > 0 && DEX.moves[m.key] &&
                                    DEX.moves[m.key].cat !== "status" && !DEX.moves[m.key].noop);

  if (outOfPP || noAttack) {
    const b = document.createElement("button");
    b.className = "btn move-btn struggle"; b.type = "button";
    b.innerHTML = `<span class="mv-name">Struggle</span>
      <span class="mv-meta"><span>${outOfPP ? "out of PP" : "nothing else works"}</span><span>recoil</span></span>`;
    on(b, "click", () => takeTurn({ kind:"move", move: struggleSlot() }));
    menu.appendChild(b);
    if (outOfPP) return;
  }

  mine.moves.forEach(slot => {
    const mv = DEX.moves[slot.key];
    const b = document.createElement("button");
    b.className = "btn move-btn"; b.type = "button";
    if (slot.pp <= 0) b.disabled = true;
    let tag = "";
    if (mv.noop) tag = `<span class="eff-tag eff-weak">NO EFFECT</span>`;
    else if (mv.cat !== "status") {
      const e = effectiveness(mv.type, foe.types);
      if (e > 1)        tag = `<span class="eff-tag eff-super">SUPER</span>`;
      else if (e === 0) tag = `<span class="eff-tag eff-weak">NO EFFECT</span>`;
      else if (e < 1)   tag = `<span class="eff-tag eff-weak">RESISTED</span>`;
    }
    b.innerHTML = `<span class="mv-name">${esc(mv.name)}</span>
      <span class="mv-meta"><span style="color:${TYPE_COLORS[mv.type]}">${mv.type.toUpperCase()}</span>
      <span>${slot.pp}/${slot.maxpp}</span>${tag}</span>`;
    on(b, "click", () => { Sound.play("select"); takeTurn({ kind:"move", move: slot }); });
    menu.appendChild(b);
  });
}

function takeTurn(action) {
  setMenuBusy(true);
  holdInput(TAP_HOLD_MS);
  eventQueue = battle.runTurn(action).slice();
  drainEvents(() => { if (!battle.over) renderField(); showBattleMenu(); });
}

function finishBattle() {
  Sound.stopLoop("lowHp");
  if (battle.winner === "draw") {
    return say(SCRIPT.stalemate, afterTheBattle, PEARL());
  }
  if (battle.winner === "player") {
    state.won = true;
    Sound.music("victory");
    say(SCRIPT.victory, afterTheBattle, RIVAL());
  } else if (state.attempts >= BATTLE.mercyAfter) {
    say(SCRIPT.mercy, afterTheBattle, PEARL());
  } else {
    say(SCRIPT.defeat, beginBattle, RIVAL());
  }
}

/* The battle is over either way. Two separate things now: the grandson gives
   the specimen back, and Pearl asks who is ACTUALLY coming with you. */
/* ---------- the invite, opened ----------
   She says "open it", so it opens: date, time and theme, straight from
   PARTY, before anyone is asked who they're bringing on the 21st. One tap
   anywhere dismisses it. Guarded so a double tap can't fire the callback
   twice and fork the story, the way the OK button once did. */
function showInvite(done) {
  const pop = $("invite-pop");
  if (!pop) return done && done();

  $("invite-kick").textContent  = UI.inviteKicker || "PARTY INVITE";
  $("invite-title").textContent = `${PARTY.hostName}'s ${PARTY.occasion}`;
  $("invite-date").textContent  = PARTY.dateLong;
  $("invite-time").textContent  = PARTY.time;
  $("invite-theme").textContent = PARTY.theme;
  $("invite-tap").textContent   = UI.inviteTap || "▼ TAP TO CONTINUE";

  pop.hidden = false;
  pop.focus && pop.setAttribute("tabindex", "-1");
  pop.focus && pop.focus();

  let closed = false;
  const close = e => {
    if (closed) return;
    closed = true;
    if (e) e.stopPropagation();
    pop.removeEventListener("click", close);
    document.removeEventListener("keydown", key);
    pop.hidden = true;
    done && done();
  };
  const key = e => {
    if (e.key === "Enter" || e.key === " " || e.key === "Escape") { e.preventDefault(); close(); }
  };
  // a beat before it listens, so the tap that finished the dialogue can't
  // also dismiss the thing it just opened
  setTimeout(() => {
    if (closed) return;
    pop.addEventListener("click", close);
    document.addEventListener("keydown", key);
  }, 260);
}

function afterTheBattle() {
  if (state.plusOneStarter || state.comingSolo || state.plusOneName) return openCard();
  showInvite(() => say(SCRIPT.plusOneIntro, askPlusOneName, PEARL()));
}

function askPlusOneName() {
  ask(SCRIPT.askPlusOne, "Leave blank if coming alone", v => {
    if (!v) { state.comingSolo = true; return say(SCRIPT.soloPath, openCard, PEARL()); }
    state.plusOneName = v;
    state.comingSolo = false;
    say(SCRIPT.afterPlusOneName, () => openCrate("plusone"), PEARL());
  }, { allowEmpty: true });
}

/* ============================================================
   THE TRAINER CARD — party info and the RSVP, both editable
   ============================================================ */
function monLine(id, emptyLabel) {
  if (!id) return `<span class="empty">${emptyLabel}</span>`;
  const s = DEX.byId[id];
  return `<span class="mon-inline"><img src="${spriteFront(s.id)}" alt="" loading="lazy">${esc(s.name)}</span>`;
}

function openCard() {
  state.unlocked = true;
  showScene("scene-details");
  renderCard();
}

function renderCard() {
  const mapLink = PARTY.mapUrl ? ` <a href="${PARTY.mapUrl}" target="_blank" rel="noopener">map ▸</a>` : "";
  const editBtn = k => `<button class="edit-btn" data-edit="${k}" aria-label="Edit">✎</button>`;

  $("details-card").innerHTML = `
    <div class="kicker">Trainer Card${state.name ? " · " + esc(state.name) : ""}</div>
    <h2>${esc(PARTY.hostName)}'s ${esc(PARTY.occasion)}</h2>

    <div class="detail-row"><span class="k">When</span><span class="v">${esc(PARTY.dateLong)}<br>${esc(PARTY.time)}${PARTY.rsvpBy ? `<small>RSVP by ${esc(PARTY.rsvpBy)}</small>` : ""}</span></div>
    <div class="detail-row"><span class="k">Where</span><span class="v">${esc(PARTY.address)}${mapLink}<small>${esc(PARTY.addressNote)}</small></span></div>
    <div class="detail-row"><span class="k">Theme</span><span class="v">${esc(PARTY.theme)}<small>${esc(PARTY.themeNote)}</small></span></div>
    ${PARTY.food ? `<div class="detail-row"><span class="k">Food</span><span class="v">${esc(PARTY.food)}${PARTY.foodNote ? `<small>${esc(PARTY.foodNote)}</small>` : ""}</span></div>` : ""}

    <div class="card-split">Your party</div>

    <div class="detail-row"><span class="k">You</span><span class="v">${state.name ? esc(state.name) : `<span class="empty">not set</span>`} ${editBtn("name")}</span></div>
    <div class="detail-row"><span class="k">Partner</span><span class="v">${monLine(state.starter, "none chosen")} ${editBtn("starter")}</span></div>
    <div class="detail-row"><span class="k">Plus-one</span><span class="v">${state.comingSolo || !state.plusOneName ? `<span class="empty">coming solo</span>` : esc(state.plusOneName)} ${editBtn("plusone")}</span></div>
    ${state.comingSolo || !state.plusOneName ? "" :
      `<div class="detail-row"><span class="k">Their partner</span><span class="v">${monLine(state.plusOneStarter, "none chosen")} ${editBtn("plusonestarter")}</span></div>`}
    <div class="detail-row"><span class="k">Message</span><span class="v">${state.note ? esc(state.note) : `<span class="empty">none</span>`} ${editBtn("note")}</span></div>
    <p class="card-hint">${esc(UI.editHint)}</p>`;

  $("details-card").querySelectorAll(".edit-btn").forEach(b =>
    on(b, "click", () => editField(b.dataset.edit)));

  const row = $("details-buttons");
  row.innerHTML = "";
  if (state.attending === null) {
    const yes = document.createElement("button");
    yes.className = "btn primary"; yes.textContent = "I'm in ▸";
    on(yes, "click", () => sendRSVP(true));
    const no = document.createElement("button");
    no.className = "btn"; no.textContent = "Can't make it";
    on(no, "click", () => sendRSVP(false));
    row.append(yes, no);
  } else {
    const save = document.createElement("button");
    save.className = "btn primary";
    save.textContent = state.attending ? "Save changes" : "Actually, I'm in ▸";
    on(save, "click", () => sendRSVP(true));
    const flip = document.createElement("button");
    flip.className = "btn";
    flip.textContent = state.attending ? "Can't make it after all" : "Still can't make it";
    on(flip, "click", () => sendRSVP(false));
    row.append(save, flip);
  }

  // Once an answer is in, the card is the end of the road — so offer a way
  // off it. Saving used to leave you staring at a screen with nothing left
  // to do and no sign you were free to go.
  if (state.revision > 0) {
    const home = document.createElement("button");
    home.className = "btn ghost";
    home.dataset.home = "1";
    home.textContent = UI.backToTitle || "◂ Back to title screen";
    on(home, "click", backToTitle);
    row.appendChild(home);
  }
}

/* Inline editors, rendered into the card itself. */
function editField(key) {
  if (key === "starter")         return openCrate("edit-player");
  if (key === "plusonestarter")  return openCrate("edit-plusone");

  const cfg = {
    name:    { label: "Your name",    value: state.name,      max: 14, placeholder: "Your name" },
    plusone: { label: "Plus-one",     value: state.comingSolo ? "" : state.plusOneName, max: 14,
               placeholder: "Leave blank if coming alone", allowEmpty: true },
    note:    { label: "Message",      value: state.note,      max: 240, placeholder: fill(UI.notePrompt),
               allowEmpty: true, multiline: true }
  }[key];
  if (!cfg) return;

  const card = $("details-card");
  card.innerHTML = `
    <div class="kicker">Editing</div>
    <h2>${esc(cfg.label)}</h2>
    ${cfg.multiline
      ? `<textarea class="name-input field-edit" id="field-input" rows="4" maxlength="${cfg.max}" placeholder="${esc(cfg.placeholder)}"></textarea>`
      : `<input class="name-input field-edit" id="field-input" maxlength="${cfg.max}" placeholder="${esc(cfg.placeholder)}" autocomplete="off">`}
    ${key === "plusone" ? `<p class="card-hint">Clearing this marks you as coming solo.</p>` : ""}`;
  const input = $("field-input");
  input.value = cfg.value || "";
  input.focus();

  const row = $("details-buttons");
  row.innerHTML = "";
  const save = document.createElement("button");
  save.className = "btn primary"; save.textContent = "Save";
  const cancel = document.createElement("button");
  cancel.className = "btn"; cancel.textContent = "Cancel";
  const commit = () => {
    const v = input.value.trim();
    if (!v && !cfg.allowEmpty) { input.focus(); toast("That one can't be blank."); return; }
    if (key === "name") state.name = v;
    if (key === "note") state.note = v;
    if (key === "plusone") {
      if (v) { state.plusOneName = v; state.comingSolo = false; }
      else   { state.comingSolo = true; state.plusOneStarter = null; }
    }
    renderCard();
  };
  on(save, "click", commit);
  on(cancel, "click", renderCard);
  if (!cfg.multiline) on(input, "keydown", e => { if (e.key === "Enter") { e.preventDefault(); commit(); } });
  row.append(save, cancel);
}

let sending = false;
async function sendRSVP(attending) {
  if (sending) return;
  if (!state.name) { toast("I'll need a name first."); return editField("name"); }
  sending = true;
  state.attending = attending;
  state.revision = (state.revision || 0) + 1;
  const first = state.revision === 1;

  $("details-buttons").innerHTML = `<button class="btn" disabled>Sending… (this may take a few seconds)</button>`;
  const res = await submitRSVP(state);
  sending = false;
  if (res.ok) Sound.play("save");
  if (!res.ok) toast("Couldn't send — message " + PARTY.contact + " instead.");

  if (first) {
    say(attending ? SCRIPT.accepted : SCRIPT.declined, () => showSaved(res), PEARL());
  } else {
    showSaved(res);
    if (res.ok) toast(attending ? "Saved. See you on the 21st!" : "Saved. You will be missed!");
  }
}

function showSaved(res) {
  openCard();
  const card = $("details-card");

  // A toast lasts 2.4s and the first RSVP plays a whole dialogue over the top
  // of it, so a send that failed says so here, on the card, until they act on
  // it. Their answer is safe on this device either way — what's lost is my
  // knowing about it.
  if (res && res.ok === false) {
    const warn = document.createElement("p");
    warn.className = "saved-warn";
    warn.textContent = (UI.sendFailed ||
      "This answer is saved on your device, but it never reached {CONTACT}.")
      .replace(/\{CONTACT\}/g, PARTY.contact);
    card.appendChild(warn);
  }

  const p = document.createElement("p");
  p.className = "saved-link";
  p.innerHTML = `${esc(UI.savedLink)}<br><code id="saved-url"></code>`;
  card.appendChild(p);
  $("saved-url").textContent = editLink();
}

/* ---------- back to the start ----------
   Saving an RSVP leaves you sitting on the card with nothing obviously left
   to do, so there's a way back to the title screen. It doesn't reload — it
   winds the story down and re-arms PRESS START, which then recognises the
   saved RSVP and offers the card straight back. */
let armTitle = null;                  // boot() fills this in

function backToTitle() {
  if (typing) { clearInterval(typing); typing = null; }
  chainToken++;                       // orphan any dialogue still in flight
  talkEnd = null; battleAdvance = null;   // and any battle step waiting on a tap
  hidePrompt();
  const pop = $("invite-pop"); if (pop) pop.hidden = true;
  Sound.stopAllLoops();
  const skip = $("skip-link"); if (skip) { skip.hidden = true; skip.style.display = ""; }
  $("press-start").textContent = "▶ PRESS START";
  showScene("scene-title");
  armTitle && armTitle();
}

/* ---------- escape hatch ---------- */
on($("skip-link"), "click", () => {
  if (typing) { clearInterval(typing); typing = null; }
  chainToken++;                      // orphan any dialogue chain in flight
  openCard();
});

/* ============================================================
   BOOT
   ============================================================ */
function restore(saved) {
  // A saved pick can disappear if DEX_FILTER changes between visits (someone
  // picked Mewtwo, legendaries got switched off). Drop it rather than crash.
  const known = id => (id && DEX.byId[id]) ? id : null;

  state.id             = saved.id || newId();
  state.revision       = saved.revision || 0;
  state.name           = saved.name || "";
  state.plusOneName    = saved.plusOne || "";
  state.rivalName      = saved.rivalNamed || "";
  state.starter        = known(saved.starterDex);
  state.plusOneStarter = known(saved.plusOneDex);
  state.comingSolo     = !saved.plusOne;
  state.attending      = typeof saved.attending === "boolean" ? saved.attending : null;
  state.note           = saved.note || "";
  state.won            = !!saved.wonBattle;
  state.attempts       = saved.attempts || 0;
}

(async function boot() {
  $("title-sub").textContent = `${PARTY.hostName}'s ${PARTY.occasion} · ${PARTY.dateLong}`;
  $("skip-link").textContent = UI.skipLink;

  const logo = $("title-logo");
  logo.onerror = () => { logo.hidden = true; $("title-text").hidden = false; };
  logo.onload  = () => { logo.hidden = false; $("title-text").hidden = true; };
  logo.src = "sprites/" + TRAINER_ART.logo;

  $("press-start").textContent = "loading…";

  let ready = false, launched = false;
  const mute = $("mute-btn");
  mute.hidden = false;
  const paintMute = () => {
    mute.classList.toggle("off", Sound.muted);
    mute.textContent = Sound.muted ? "♪" : "♪";
    mute.setAttribute("aria-pressed", String(Sound.muted));
    mute.setAttribute("aria-label", Sound.muted ? "Unmute sound" : "Mute sound");
  };
  paintMute();
  on(mute, "click", e => { e.stopPropagation(); Sound.toggleMute(); paintMute(); });

  // Queue the title track now. Nothing plays until the tap unlocks audio, and
  // because the lab uses the same file it simply carries on from there.
  Sound.music("title");

  const go = () => {
    if (launched) return;
    Sound.unlock();          // browsers only allow sound after a real tap
    if (!ready) { go.wanted = true; return; }     // clicked early: fire once loaded
    launched = true;
    document.removeEventListener("keydown", go);
    $("scene-title").removeEventListener("click", go);
    begin();
  };
  on($("scene-title"), "click", go);
  document.addEventListener("keydown", go);

  // The title screen disarms itself once the story starts. "Back to title"
  // needs it live again, so hand the rest of the file a way to do that.
  armTitle = () => {
    if (!launched) return;                 // already waiting for a tap
    launched = false;
    on($("scene-title"), "click", go);
    document.addEventListener("keydown", go);
  };

  function begin() {
    $("skip-link").hidden = false;
    const saved = loadLocal();
    if (saved && (saved.name || saved.starterDex)) {
      restore(saved);
      const line = state.name ? fill(SCRIPT.welcomeBack) : SCRIPT.welcomeBackAnon;
      choose([line], [
        { label: "Open my trainer card", primary: true, action: openCard },
        { label: "Start over", action: () => {
            clearLocal();
            Object.assign(state, { id: newId(), revision: 0, name: "", rivalName: "", plusOneName: "",
              starter: null, plusOneStarter: null, comingSolo: false, rivalSpecies: null,
              won: false, attempts: 0, attending: null, note: "" });
            start();
          } }
      ], PEARL());
      return;
    }
    state.id = newId();
    start();
  }

  try {
    await loadDex();
    ready = true;
    $("press-start").textContent = "▶ PRESS START";
    if (go.wanted) go();
  } catch (e) {
    console.error(e);
    $("press-start").textContent = "couldn't load — refresh?";
  }
})();
