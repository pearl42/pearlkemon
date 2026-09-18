/* ============================================================
   dex.js — loads the baked PokéAPI data and turns a species into
   a battle-ready Pokémon.
   ============================================================ */

const DEX = {
  species: [],        // array, dex order
  byId: {},
  moves: {},
  chart: {},
  ready: false
};

async function loadDex() {
  let dex, moves, chart;

  // data/dex-data.js defines these as plain globals. That's the normal path,
  // and the reason the invite works when index.html is opened straight off
  // disk — fetch() refuses file:// URLs, a <script> tag doesn't care.
  if (typeof POKEDEX_DATA !== "undefined") {
    dex = POKEDEX_DATA; moves = MOVES_DATA; chart = TYPECHART_DATA;
  } else {
    [dex, moves, chart] = await Promise.all([
      fetch("data/pokedex.json").then(r => r.json()),
      fetch("data/moves.json").then(r => r.json()),
      fetch("data/typechart.json").then(r => r.json())
    ]);
  }

  DEX.moves = moves;
  DEX.chart = chart;
  DEX.species = dex.filter(s =>
    (DEX_FILTER.allowLegendary      || !s.legendary) &&
    (DEX_FILTER.allowBaby           || !s.baby) &&
    (DEX_FILTER.allowBabyEvolutions || !s.fromBaby)
  );
  DEX.species.forEach(s => DEX.byId[s.id] = s);
  DEX.ready = true;
  return DEX;
}

const spriteFront = id => `${SPRITE_BASE}${id}.png`;
const spriteBack  = id => `${SPRITE_BASE}back/${id}.png`;

/* ---------- type effectiveness, straight from the official chart ---------- */
function effectiveness(moveType, defTypes) {
  let mult = 1;
  const row = DEX.chart[moveType] || {};
  for (const t of defTypes) if (row[t] !== undefined) mult *= row[t];
  return mult;
}

/* ---------- stat normalisation ----------
   Every pick is rescaled to a common base-stat budget. The proportions
   are preserved, so a pick still feels like itself — Magikarp is still
   a fast noodle, Snorlax is still a wall — it just isn't a blowout
   before the first turn.                                              */
function normalizeBase(base, budget) {
  const keys = ["hp", "atk", "def", "spa", "spd", "spe"];
  const total = keys.reduce((a, k) => a + (base[k] || 1), 0);
  const k = budget / total;
  const out = {};
  keys.forEach(key => out[key] = Math.max(25, Math.round((base[key] || 1) * k)));
  return out;
}

function makeMon(speciesId, level, budget) {
  const s = DEX.byId[speciesId] || DEX.species.find(x => x.id === speciesId);
  const base = normalizeBase(s.base, budget);
  const iv = 15;
  const calc = b => Math.floor(((2 * b + iv) * level) / 100) + 5;
  const scale = (typeof BATTLE !== "undefined" && BATTLE.hpScale) || 1;
  const hp = Math.round((Math.floor(((2 * base.hp + iv) * level) / 100) + level + 10) * scale);
  return {
    id: s.id, name: s.name, species: s, level,
    types: s.types.slice(),
    max: hp, hp,
    stats: { atk: calc(base.atk), def: calc(base.def), spa: calc(base.spa), spd: calc(base.spd), spe: calc(base.spe) },
    stages: { atk:0, def:0, spa:0, spd:0, spe:0, acc:0, eva:0 },
    status: null, sleepTurns: 0, confusedTurns: 0, flinched: false,
    moves: s.moves.filter(m => DEX.moves[m]).map(m => ({ key: m, pp: DEX.moves[m].pp, maxpp: DEX.moves[m].pp })),
    fainted: false
  };
}

/* ---------- the rival's pick ----------
   He waits until he's seen yours, then chooses something that beats it.
   Same as he's always done.                                           */
function pickRivalSpecies(playerSpeciesId) {
  const attackTypes = s => s.moves
    .filter(m => DEX.moves[m] && DEX.moves[m].cat !== "status" && !DEX.moves[m].noop)
    .map(m => DEX.moves[m].type);

  const you = DEX.byId[playerSpeciesId];
  const mine = attackTypes(you);

  // He SAYS he has a type advantage, so he has to actually have one: at least
  // one of his own types must be super effective against yours. Whether he
  // owns a move of that type is beside the point — the boast is about the
  // Pokemon, not its moveset.
  const hasEdge = s => Math.max(0, ...s.types.map(t => effectiveness(t, you.types))) > 1;

  // Magikarp, Abra and friends can't attack at all — nothing to balance
  // around, but he should still turn up holding the right answer.
  if (!mine.length) {
    let any = DEX.species.filter(s => !s.legendary && s.id !== you.id);
    const edged = any.filter(hasEdge);
    if (edged.length) any = edged;
    return any[Math.floor(Math.random() * any.length)].id;
  }

  const scored = DEX.species
    .filter(s => !s.legendary && s.id !== you.id && attackTypes(s).length >= 1)
    .map(s => ({
      s,
      yours: Math.max(0, ...mine.map(t => effectiveness(t, s.types))),        // your best hit on it
      theirs: Math.max(0, ...attackTypes(s).map(t => effectiveness(t, you.types))) // its best hit on you
    }));

  // The boast comes first: only species that genuinely counter your typing.
  let pool = scored.filter(x => hasEdge(x.s));
  if (!pool.length) pool = scored;          // nothing in the dex counters you

  // FAIRNESS: at Lv5 with real Lv5 movesets nobody has a level or coverage
  // advantage to fall back on, so the type matchup decides almost everything.
  // Among the species that counter you, prefer the ones you can answer —
  // your best hit landing at least as hard as his. Without any such rule the
  // guest wins about 31% of the time.
  let use = pool.filter(x => x.yours >= x.theirs && x.yours >= 1);
  if (!use.length) use = pool.filter(x => x.yours >= 1);
  if (!use.length) use = pool;
  return use[Math.floor(Math.random() * use.length)].s.id;
}

/* ---------- search, for the ball grid ---------- */
function searchSpecies(q) {
  q = q.trim().toLowerCase();
  if (!q) return DEX.species;
  if (/^#?\d+$/.test(q)) {
    const n = +q.replace("#", "");
    return DEX.species.filter(s => s.id === n);
  }
  const starts = [], contains = [];
  for (const s of DEX.species) {
    const n = s.name.toLowerCase();
    if (n.startsWith(q)) starts.push(s);
    else if (n.includes(q) || s.types.some(t => t.startsWith(q))) contains.push(s);
  }
  return starts.concat(contains);
}
