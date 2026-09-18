#!/usr/bin/env node
/* ============================================================
   fetch-sprites.js — optional. Downloads the front and back sprite
   for every Pokémon in data/pokedex.json into sprites/pokemon/, so
   the invite serves its own images instead of hot-linking the
   PokéAPI CDN.

   Usage:  node tools/fetch-sprites.js
   Then:   set SPRITE_BASE in js/config.js to "sprites/pokemon/"

   About 550 small PNGs, roughly 2 MB total.

   DO NOT CROP THESE FILES. It's tempting — the artwork only fills about
   half of its 96x96 canvas — but the uniform canvas is what makes every
   Poke Ball in the crate render identically, and cropping makes each
   species a different size and shape. The battle screen solves the size
   problem a different way: tools/measure-sprites.js records how much of
   the canvas each sprite uses, and each one is scaled individually at
   render time. Re-run that script after changing any sprite.

   ============================================================ */
const fs = require("fs"), path = require("path"), https = require("https");

const BASE = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/";
const OUT = path.join(__dirname, "..", "sprites", "pokemon");
const dex = require(path.join(__dirname, "..", "data", "pokedex.json"));

function fetchOne(url, dest, tries = 5) {
  return new Promise(resolve => {
    if (fs.existsSync(dest) && fs.statSync(dest).size > 100) return resolve("cached");
    const attempt = n => https.get(url, res => {
      if (res.statusCode === 404) { res.resume(); return resolve("missing"); }
      if (res.statusCode !== 200) {
        res.resume();
        if (n < tries) return setTimeout(() => attempt(n + 1), n * 2000);
        return resolve("failed");
      }
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => { fs.writeFileSync(dest, Buffer.concat(chunks)); resolve("ok"); });
    }).on("error", () => n < tries ? setTimeout(() => attempt(n + 1), n * 2000) : resolve("failed"));
    attempt(1);
  });
}

(async () => {
  fs.mkdirSync(path.join(OUT, "back"), { recursive: true });
  const jobs = [];
  dex.forEach(d => {
    jobs.push([`${BASE}${d.id}.png`, path.join(OUT, `${d.id}.png`)]);
    jobs.push([`${BASE}back/${d.id}.png`, path.join(OUT, "back", `${d.id}.png`)]);
  });
  let done = 0, failed = 0, missing = 0;
  const CONCURRENCY = 6;
  const queue = jobs.slice();
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const [url, dest] = queue.shift();
      const r = await fetchOne(url, dest);
      if (r === "failed") failed++;
      if (r === "missing") missing++;
      if (++done % 50 === 0) process.stdout.write(`  ${done}/${jobs.length}\r`);
    }
  }));
  console.log(`\n  ${done} sprites, ${missing} with no back sprite (fine), ${failed} failed`);
  console.log(`  now set SPRITE_BASE = "sprites/pokemon/" in js/config.js`);
})();
