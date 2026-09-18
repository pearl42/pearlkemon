#!/usr/bin/env node
/* ============================================================
   build-dex.js — bakes the PokéAPI data the invite needs into
   three static JSON files, so the live site makes ZERO API calls.

   Usage:   node tools/build-dex.js
   Output:  data/pokedex.json  data/moves.json  data/typechart.json

   Source: the PokéAPI project's own CSV dataset, pulled from GitHub.
   We use the CSVs rather than the REST API because it's ~14 files
   instead of ~800 requests, and it gives us the official type chart
   and move metadata (ailments, stat changes) in one shot.
   ============================================================ */

const fs = require("fs");
const path = require("path");
const https = require("https");

const CSV_BASE = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv";
const CACHE = process.env.DEX_CACHE || path.join(__dirname, ".cache");
const OUT = path.join(__dirname, "..", "data");

const FILES = [
  "pokemon_species", "pokemon", "pokemon_stats", "pokemon_types", "stats",
  "types", "type_efficacy", "moves", "move_names", "pokemon_moves",
  "pokemon_species_names", "move_meta", "move_meta_stat_changes",
  "version_groups"
];

/* ---------- tiny CSV reader (the dataset is well-formed, quoted commas only
   appear in flavour text files we don't read) ---------- */
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.length);
  const head = lines[0].split(",");
  return lines.slice(1).map(line => {
    const cells = []; let cur = "", q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { q = !q; continue; }
      if (c === "," && !q) { cells.push(cur); cur = ""; continue; }
      cur += c;
    }
    cells.push(cur);
    const row = {};
    head.forEach((h, i) => row[h] = cells[i] === undefined || cells[i] === "" ? null : cells[i]);
    return row;
  });
}

function get(url, dest, tries = 6) {
  return new Promise((resolve, reject) => {
    const attempt = (n) => {
      https.get(url, res => {
        if (res.statusCode !== 200) {
          res.resume();
          if (n < tries) return setTimeout(() => attempt(n + 1), n * 2500);
          return reject(new Error(url + " -> HTTP " + res.statusCode));
        }
        const chunks = [];
        res.on("data", c => chunks.push(c));
        res.on("end", () => { fs.writeFileSync(dest, Buffer.concat(chunks)); resolve(); });
      }).on("error", e => {
        if (n < tries) return setTimeout(() => attempt(n + 1), n * 2500);
        reject(e);
      });
    };
    attempt(1);
  });
}

async function load(name) {
  fs.mkdirSync(CACHE, { recursive: true });
  const f = path.join(CACHE, name + ".csv");
  if (!fs.existsSync(f) || fs.statSync(f).size < 40) {
    process.stdout.write("  fetching " + name + ".csv ... ");
    await get(`${CSV_BASE}/${name}.csv`, f);
    process.stdout.write("ok\n");
  }
  return parseCSV(fs.readFileSync(f, "utf8"));
}

/* ---------- what we keep ---------- */
const MAX_GEN = 4;              // gen 1-4 only
const POWER_MIN = 20;           // Absorb and Bubble are 20 — normal at Lv5
const POWER_MAX = 65;           // nothing that one-shots a level-5 starter
const LEARN_LEVEL = 5;          // a species gets ONLY what it knows by this
                                // level, exactly as in the games. Raise it for
                                // fuller movesets: 5 -> most species get 1-2
                                // attacks, 10 -> 2-3, 15 -> 3-4.
// Famous moves that do nothing this engine can model. Kept anyway, because a
// Magikarp that can only Splash is the joke, not a bug.
const NOOP_MOVES = new Set(["splash", "teleport", "transform", "sketch", "present"]);
const AILMENTS = { 1:"par", 2:"slp", 3:"frz", 4:"brn", 5:"psn", 6:"cnf" };
const STAT_IDS = { 2:"atk", 3:"def", 4:"spa", 5:"spd", 6:"spe", 7:"acc", 8:"eva" };
// meta categories we can actually execute in the engine
const OK_CATEGORY = new Set(["0", "1", "2", "4", "6", "7"]);
const DMG_CLASS = { "1":"status", "2":"phys", "3":"spec" };

const title = s => s.split("-").map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(" ");

(async () => {
  console.log("Loading PokéAPI dataset...");
  const data = {};
  for (const f of FILES) data[f] = await load(f);

  /* ---------- types + official type chart ---------- */
  const typeName = {};
  data.types.forEach(t => { if (+t.id < 10000) typeName[t.id] = t.identifier; });

  const typechart = {};
  Object.values(typeName).forEach(t => typechart[t] = {});
  data.type_efficacy.forEach(r => {
    const a = typeName[r.damage_type_id], d = typeName[r.target_type_id];
    if (!a || !d) return;
    const f = +r.damage_factor / 100;
    if (f !== 1) typechart[a][d] = f;
  });

  /* ---------- moves ---------- */
  const moveNameEn = {};
  data.move_names.forEach(r => { if (r.local_language_id === "9") moveNameEn[r.move_id] = r.name; });

  const meta = {};
  data.move_meta.forEach(r => meta[r.move_id] = r);
  const statChanges = {};
  data.move_meta_stat_changes.forEach(r => (statChanges[r.move_id] ||= []).push(r));

  const moves = {};          // identifier -> move object
  const moveById = {};
  data.moves.forEach(m => {
    if (+m.generation_id > MAX_GEN) return;
    if (+m.id > 10000) return;
    const mt = meta[m.id];
    const isNoop = NOOP_MOVES.has(m.identifier);
    if (!isNoop && (!mt || !OK_CATEGORY.has(mt.meta_category_id))) return;
    const cat = DMG_CLASS[m.damage_class_id];
    if (!cat) return;
    if (isNoop) {
      moves[m.identifier] = {
        name: moveNameEn[m.id] || title(m.identifier),
        type: typeName[m.type_id] || "normal",
        cat: "status", power: 0, acc: null, pp: +m.pp || 20, priority: 0, noop: true
      };
      moveById[m.id] = m.identifier;
      return;
    }

    const power = m.power ? +m.power : 0;
    if (cat !== "status") {
      if (!power || power < POWER_MIN || power > POWER_MAX) return;
      if (mt.min_hits) return;                       // skip multi-hit
    }

    // what does it do beyond damage?
    let effect = null;
    const ail = AILMENTS[+mt.meta_ailment_id];
    if (ail) {
      const chance = +mt.ailment_chance || (cat === "status" ? 100 : 0);
      if (chance > 0) effect = { status: ail, chance };
    }
    if (!effect && statChanges[m.id] && statChanges[m.id].length) {
      const sc = statChanges[m.id][0];
      const stat = STAT_IDS[+sc.stat_id];
      if (stat) {
        const stages = +sc.change;
        const chance = +mt.stat_chance || (cat === "status" ? 100 : 0);
        if (chance > 0) effect = { stat, stages, target: stages > 0 ? "self" : "foe", chance };
      }
    }
    // a status move that does nothing we can model is no use to us
    if (cat === "status" && !effect) return;

    const obj = {
      name: moveNameEn[m.id] || title(m.identifier),
      type: typeName[m.type_id],
      cat, power,
      acc: m.accuracy ? +m.accuracy : null,          // null = never misses
      pp: +m.pp || 15,
      priority: +m.priority || 0
    };
    if (effect) obj.effect = effect;
    if (mt.flinch_chance && +mt.flinch_chance > 0) obj.flinch = +mt.flinch_chance;
    if (mt.crit_rate && +mt.crit_rate > 0) obj.highCrit = true;
    if (!obj.type) return;
    moves[m.identifier] = obj;
    moveById[m.id] = m.identifier;
  });

  /* ---------- species: gen 1-4, first form only ---------- */
  const speciesNameEn = {};
  data.pokemon_species_names.forEach(r => { if (r.local_language_id === "9") speciesNameEn[r.pokemon_species_id] = r.name; });

  const allSpecies = {};
  data.pokemon_species.forEach(s => allSpecies[s.id] = s);

  const keepSpecies = new Set();
  const speciesRow = {};
  data.pokemon_species.forEach(s => {
    if (+s.generation_id > MAX_GEN) return;
    const from = s.evolves_from_species_id;
    // First form — but ALSO the form people actually think of as the base when
    // the only thing below it is a baby (Pikachu, Snorlax, Jigglypuff...).
    // Nobody's favourite Pokémon is locked away because Pichu exists.
    if (from && !(allSpecies[from] && allSpecies[from].is_baby === "1")) return;
    keepSpecies.add(s.id);
    speciesRow[s.id] = s;
  });

  // default pokemon row per species (skips alternate forms)
  const monOfSpecies = {};
  data.pokemon.forEach(p => {
    if (p.is_default !== "1") return;
    if (!keepSpecies.has(p.species_id)) return;
    monOfSpecies[p.species_id] = p.id;
  });

  const statKey = {};
  data.stats.forEach(s => statKey[s.id] = s.identifier);
  const NORM = { hp:"hp", attack:"atk", defense:"def", "special-attack":"spa", "special-defense":"spd", speed:"spe" };

  const baseStats = {};
  data.pokemon_stats.forEach(r => {
    const k = NORM[statKey[r.stat_id]];
    if (!k) return;
    (baseStats[r.pokemon_id] ||= {})[k] = +r.base_stat;
  });

  const monTypes = {};
  data.pokemon_types.forEach(r => {
    const t = typeName[r.type_id];
    if (!t) return;
    (monTypes[r.pokemon_id] ||= [])[+r.slot - 1] = t;
  });

  /* learnsets. Level-up is the first choice; everything else (TM, tutor, egg)
     is the fallback for species whose level-up pool is too thin to fight with
     — Magikarp with only Tackle is not a battle. */
  // Learn LEVELS differ between games, and most rows in this dataset come from
  // Gen 5+ titles. Without this filter a species could arrive with the level it
  // learns something in Sun/Moon — which is not the game this invite is set in.
  const vgGen = {};
  data.version_groups.forEach(v => vgGen[v.id] = +v.generation_id);

  const learn = {}, learnAny = {}, learnLevel = {};
  data.pokemon_moves.forEach(r => {
    if ((vgGen[r.version_group_id] || 99) > MAX_GEN) return;
    const id = moveById[r.move_id];
    if (!id) return;
    (learnAny[r.pokemon_id] ||= new Set()).add(id);
    if (r.pokemon_move_method_id !== "1") return;
    (learn[r.pokemon_id] ||= new Set()).add(id);
    // earliest level this species learns it, across gen 1-4 version groups
    const key = r.pokemon_id + ":" + id;
    const lv = +r.level || 1;
    if (learnLevel[key] === undefined || lv < learnLevel[key]) learnLevel[key] = lv;
  });

  /* pick four moves that make a coherent little moveset */
  function pickMoves(monId, types) {
    const known = lvl => Object.entries(learnLevel)
      .filter(([k, L]) => k.startsWith(monId + ":") && L <= lvl)
      .map(([k]) => k.slice(String(monId).length + 1))
      .filter(id => moves[id]);

    const isAttack = id => moves[id].cat !== "status";

    // What it knows at LEARN_LEVEL, exactly like the games.
    let ids = known(LEARN_LEVEL);

    // One concession: if it has no way to deal damage yet, open the window to
    // the level it learns its first attack. Magikarp gets Tackle at 15, so it
    // ends up with Splash and Tackle — which is what a Magikarp should have.
    if (!ids.some(isAttack)) {
      const firstAttack = Object.entries(learnLevel)
        .filter(([k]) => k.startsWith(monId + ":"))
        .filter(([k]) => moves[k.slice(String(monId).length + 1)] &&
                         isAttack(k.slice(String(monId).length + 1)))
        .map(([, L]) => L).sort((a, b) => a - b)[0];
      if (firstAttack) ids = known(firstAttack);
    }

    // Still nothing (Abra, Ditto, Wobbuffet, Beldum...): take whatever flavour
    // move exists by any method, and if there's genuinely nothing we can model
    // — Wobbuffet only knows Counter and Mirror Coat — leave it empty. The
    // battle UI gives those a Struggle button from turn one. What we must NOT
    // do is drop the species: a guest searching for it would find nothing.
    if (!ids.length) ids = [...(learn[monId] || [])].filter(id => moves[id]).slice(0, 2);
    if (!ids.length) ids = [...(learnAny[monId] || [])].filter(id => moves[id]).slice(0, 2);

    const score = id => (moves[id].power || 0) * ((moves[id].acc ?? 100) / 100);
    const attacks = ids.filter(isAttack).sort((a, b) => score(b) - score(a));
    const others  = ids.filter(id => !isAttack(id));

    const chosen = [];
    // STAB first, then coverage of a different type, then the rest
    const take = pred => {
      const hit = attacks.find(id => !chosen.includes(id) && pred(id));
      if (hit) chosen.push(hit);
      return !!hit;
    };
    take(id => types.includes(moves[id].type));
    take(id => !chosen.some(c => moves[c].type === moves[id].type));
    for (const id of attacks) if (chosen.length < 4 && !chosen.includes(id)) chosen.push(id);
    for (const id of others)  if (chosen.length < 4 && !chosen.includes(id)) chosen.push(id);
    return chosen.slice(0, 4);
  }

  const dex = [];
  for (const sid of keepSpecies) {
    const monId = monOfSpecies[sid];
    if (!monId || !baseStats[monId] || !monTypes[monId]) continue;
    const types = monTypes[monId].filter(Boolean);
    const mv = pickMoves(monId, types);
    const s = speciesRow[sid];
    dex.push({
      id: +sid,
      name: speciesNameEn[sid] || title(s.identifier),
      slug: s.identifier,
      types,
      base: baseStats[monId],
      moves: mv,
      baby: s.is_baby === "1",
      // included only because its pre-evolution is a baby (Pikachu, Snorlax...)
      fromBaby: !!(s.evolves_from_species_id && allSpecies[s.evolves_from_species_id]
                   && allSpecies[s.evolves_from_species_id].is_baby === "1"),
      legendary: s.is_legendary === "1" || s.is_mythical === "1"
    });
  }
  dex.sort((a, b) => a.id - b.id);

  // only ship the moves something actually uses
  const used = new Set();
  dex.forEach(d => d.moves.forEach(m => used.add(m)));
  const shipped = {};
  [...used].sort().forEach(k => { if (moves[k]) shipped[k] = moves[k]; });
  if (!shipped.tackle && moves.tackle) shipped.tackle = moves.tackle;

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "pokedex.json"), JSON.stringify(dex));
  fs.writeFileSync(path.join(OUT, "moves.json"), JSON.stringify(shipped));
  fs.writeFileSync(path.join(OUT, "typechart.json"), JSON.stringify(typechart));

  // Also emit the same data as a plain script. index.html loads THIS one, so
  // that opening the file straight off disk works — fetch() refuses file://
  // URLs, a <script> tag doesn't care.
  fs.writeFileSync(path.join(OUT, "dex-data.js"),
    `/* GENERATED by tools/build-dex.js — do not edit by hand. */\n` +
    `const POKEDEX_DATA = ${JSON.stringify(dex)};\n` +
    `const MOVES_DATA = ${JSON.stringify(shipped)};\n` +
    `const TYPECHART_DATA = ${JSON.stringify(typechart)};\n`);

  const sizes = n => (fs.statSync(path.join(OUT, n)).size / 1024).toFixed(1) + " KB";
  console.log(`\n  pokedex.json   ${dex.length} species    ${sizes("pokedex.json")}`);
  console.log(`  moves.json     ${Object.keys(shipped).length} moves      ${sizes("moves.json")}`);
  console.log(`  typechart.json ${Object.keys(typechart).length} types     ${sizes("typechart.json")}`);
  console.log(`\n  of those: ${dex.filter(d => d.legendary).length} legendary/mythical, ${dex.filter(d => d.baby).length} baby`);
})();
