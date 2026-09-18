#!/usr/bin/env node
/* ============================================================
   fetch-cries.js — optional. Downloads one cry per Pokémon in
   data/pokedex.json into audio/cries/, named by the dex slug so
   the game can find them.

   Usage:  node tools/fetch-cries.js

   Source is PokéAPI's own cries repo on GitHub, which is reachable from
   more places than Showdown is. It serves .ogg by dex number, preferring
   the "legacy" set — the original Game Boy cries, which suit a GBA-style
   invite far better than the modern re-recordings. They're saved under our
   slug. Safari's Ogg support is patchy, so convert them to mp3 afterwards:

       for f in audio/cries/*.ogg; do
         ffmpeg -i "$f" -ac 1 -ar 22050 -b:a 64k "${f%.ogg}.mp3" && rm "$f"
       done

   (The set already in audio/cries/ was fetched and converted this way.)
   ============================================================ */
const fs = require("fs"), path = require("path"), https = require("https");

const BASE = "https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/";
const OUT = path.join(__dirname, "..", "audio", "cries");
const dex = require(path.join(__dirname, "..", "data", "pokedex.json"));


function fetchOne(url, dest, tries = 4) {
  return new Promise(resolve => {
    if (fs.existsSync(dest) && fs.statSync(dest).size > 500) return resolve("cached");
    const attempt = n => https.get(url, res => {
      if (res.statusCode === 404) { res.resume(); return resolve("missing"); }
      if (res.statusCode !== 200) {
        res.resume();
        if (n < tries) return setTimeout(() => attempt(n + 1), n * 1500);
        return resolve("failed");
      }
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => { fs.writeFileSync(dest, Buffer.concat(chunks)); resolve("ok"); });
    }).on("error", () => n < tries ? setTimeout(() => attempt(n + 1), n * 1500) : resolve("failed"));
    attempt(1);
  });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const queue = dex.map(d => [BASE + "legacy/" + d.id + ".ogg", path.join(OUT, d.slug + ".ogg"), d.id]);
  let done = 0, missing = 0, failed = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const [url, dest, id] = queue.shift();
      let r = await fetchOne(url, dest);
      // a few species have no legacy cry — fall back to the modern one
      if (r === "missing") r = await fetchOne(BASE + "latest/" + id + ".ogg", dest);
      if (r === "missing") missing++;
      if (r === "failed") failed++;
      if (++done % 25 === 0) process.stdout.write(`  ${done}/${dex.length}\r`);
    }
  }));
  console.log(`\n  ${done} cries, ${missing} not found, ${failed} failed`);
  console.log("  now convert them to mp3 — see the note at the top of this file");
})();
