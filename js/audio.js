/* ============================================================
   audio.js — music, sound effects and Pokémon cries.

   Everything here is OPTIONAL. If a file isn't in audio/ the call
   does nothing and the invite behaves exactly as it does today, so
   you can drop tracks in one at a time.

   Two things worth knowing:
   - Browsers refuse to play audio until the visitor has interacted
     with the page. The PRESS START tap is that interaction, so the
     first track starts there and not before.
   - There's a speaker button in the corner. It remembers the choice.
   ============================================================ */

const Sound = (() => {
  const cache = {};                 // src -> HTMLAudioElement (for sfx)
  let current = null;               // the music element now playing
  const loops = {};                 // name -> looping sfx element
  let currentName = "";
  let muted = false;
  let unlocked = false;

  try { muted = localStorage.getItem("pokeparty.muted") === "1"; } catch (e) {}

  const cfg = () => (typeof AUDIO !== "undefined" ? AUDIO : {});
  const url = (folder, file) => file ? `audio/${folder}/${file}` : null;

  function make(src, loop, volume) {
    const a = new Audio(src);
    a.loop = !!loop;
    a.volume = volume;
    a.preload = "auto";
    // a missing file is not an error worth surfacing — it just stays quiet
    a.addEventListener("error", () => {}, { once: true });
    return a;
  }

  function safePlay(el) {
    if (!el) return;
    const p = el.play();
    if (p && p.catch) p.catch(() => {});   // autoplay blocked, or no file
  }

  /* ---------- low-latency effects ----------
     HTMLAudioElement is fine for music but bad for short effects on a phone:
     every play() re-seeks and re-decodes, and iOS piles its own delay on top,
     so the blip meant for the tap you just made arrives a line or two later.
     Web Audio decodes each effect ONCE into memory and fires it with no
     scheduling delay at all.

     It degrades quietly: if Web Audio is missing, or the file can't be
     fetched — opening index.html straight off disk, where fetch() refuses
     file:// URLs — the buffer is marked unusable and the old element path
     takes over for that sound. */
  let ac = null;                 // null = untried, false = unavailable
  const buffers = {};            // src -> AudioBuffer, or false if unusable
  const pending = {};            // src -> in-flight promise

  function audioCtx() {
    if (ac !== null) return ac;
    const C = window.AudioContext || window.webkitAudioContext;
    try { ac = C ? new C() : false; } catch (e) { ac = false; }
    return ac;
  }

  function loadBuffer(src) {
    const ctx = audioCtx();
    if (!ctx) return Promise.resolve(null);
    if (buffers[src] !== undefined) return Promise.resolve(buffers[src]);
    if (pending[src]) return pending[src];
    pending[src] = fetch(src)
      .then(r => r.ok ? r.arrayBuffer() : Promise.reject(new Error("missing")))
      .then(buf => new Promise((res, rej) => ctx.decodeAudioData(buf, res, rej)))
      .then(b => (buffers[src] = b))
      .catch(() => (buffers[src] = false))
      .then(v => { delete pending[src]; return v; });
    return pending[src];
  }

  function playBuffer(src, volume) {
    const ctx = audioCtx(), b = buffers[src];
    if (!ctx || !b) return false;
    try {
      const s = ctx.createBufferSource(); s.buffer = b;
      const g = ctx.createGain(); g.gain.value = volume;
      s.connect(g); g.connect(ctx.destination);
      s.start(0);
      return true;
    } catch (e) { return false; }
  }

  /* One code path for every short sound: buffer if we have it, element if we
     don't, and start decoding so the next one is instant. */
  function fire(src, volume) {
    if (buffers[src]) { if (playBuffer(src, volume)) return; }
    else if (buffers[src] === undefined) loadBuffer(src);
    let a = cache[src];
    if (!a) { a = cache[src] = make(src, false, volume); }
    try { a.currentTime = 0; } catch (e) {}
    safePlay(a);
  }

  return {
    get muted() { return muted; },

    /* Called on the first real tap. Before this, browsers won't allow sound. */
    unlock() {
      unlocked = true;
      // The context has to be created/resumed inside a real gesture, and this
      // runs on the PRESS START tap. Decoding every effect now means the first
      // blip isn't the slow one.
      const ctx = audioCtx();
      if (ctx && ctx.state === "suspended") { try { ctx.resume(); } catch (e) {} }
      Object.values(cfg().sfx || {}).forEach(f => {
        const src = url("sfx", f); if (src) loadBuffer(src);
      });
      if (muted) return;
      if (current) safePlay(current);
      Object.values(loops).forEach(safePlay);
    },

    /* One-shot effect. name is a key in AUDIO.sfx. */
    play(name) {
      if (muted || !unlocked) return;
      const file = (cfg().sfx || {})[name];
      const src = url("sfx", file);
      if (!src) return;
      fire(src, cfg().sfxVolume ?? 0.5);
    },

    /* A Pokémon's cry, by its dex slug ("bulbasaur"). */
    cry(slug) {
      if (muted || !unlocked || !slug || !cfg().cries) return;
      const src = `audio/cries/${slug}.${cfg().cryFormat || "mp3"}`;
      fire(src, cfg().cryVolume ?? 0.6);
    },

    /* Looping background track. name is a key in AUDIO.music.
       Calling it with the track already playing does nothing, so it's safe
       to call on every scene change. */
    music(name) {
      const file = (cfg().music || {})[name];
      if (!file) return;
      // compare the FILE, not the key — the title screen and the lab share a
      // track, and it shouldn't restart when the scene changes
      if (current && current.dataset.file === file) return;
      this.stopMusic();
      currentName = name;
      current = make(url("music", file), true, cfg().musicVolume ?? 0.35);
      current.dataset.file = file;
      if (!muted && unlocked) safePlay(current);
    },

    /* A fanfare that ducks the music, plays once, then brings it back. */
    fanfare(name) {
      const file = (cfg().music || {})[name];
      if (!file || muted || !unlocked) return;
      const resume = currentName;
      this.stopMusic();
      const a = make(url("music", file), false, cfg().musicVolume ?? 0.35);
      a.dataset.file = "__fanfare:" + file;
      a.addEventListener("ended", () => { if (resume) this.music(resume); }, { once: true });
      a.addEventListener("error", () => { if (resume) this.music(resume); }, { once: true });
      current = a; currentName = "__fanfare";
      safePlay(a);
    },

    /* A short effect that repeats until stopped — the low-HP alarm. */
    startLoop(name) {
      const file = (cfg().sfx || {})[name];
      const src = url("sfx", file);
      if (!src || loops[name]) return;
      const a = loops[name] = make(src, true, cfg().sfxVolume ?? 0.5);
      if (!muted && unlocked) safePlay(a);
    },
    stopLoop(name) {
      const a = loops[name];
      if (!a) return;
      try { a.pause(); } catch (e) {}
      delete loops[name];
    },
    stopAllLoops() { Object.keys(loops).forEach(n => this.stopLoop(n)); },

    stopMusic() {
      if (current) { try { current.pause(); } catch (e) {} }
      current = null; currentName = "";
    },

    toggleMute() {
      muted = !muted;
      try { localStorage.setItem("pokeparty.muted", muted ? "1" : "0"); } catch (e) {}
      if (muted) {
        if (current) { try { current.pause(); } catch (e) {} }
        Object.values(loops).forEach(a => { try { a.pause(); } catch (e) {} });
      } else if (unlocked) {
        if (current) safePlay(current);
        Object.values(loops).forEach(safePlay);
      }
      return muted;
    }
  };
})();
