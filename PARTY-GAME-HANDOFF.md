# Party Game — Handoff Brief

**For:** a fresh Cowork session that has the PokeParty invite folder available.
**Status:** design only. Nothing in this document has been built. No code was written for any of it.
**Written:** 2026-09-17, at the end of a brainstorm session with Poley.

---

## 0. Read this first

This describes a **second, separate project**: a live collect-and-battle game
played on guests' phones during Poley's Pokémon-themed 30th birthday party
(Nov 21, 6pm). It reuses the battle engine and assets from the existing
**invite** in this folder.

**Do not modify the invite while working on this** unless Poley explicitly asks.
The invite is nearly finished and has its own working rules (see
`claude/invite-concept.md` in the Claude project — the short version is:
`js/config.js` contains Poley's own writing and must never be overwritten
wholesale, the Pokémon sprites must never be cropped, and files should be
staged and diffed before every commit because Poley edits between turns).

Nothing here is committed to. Poley asked for a brainstorm and this is the
record of it. Treat the recommendations as recommendations.

---

## 1. The concept, in Poley's words

Guests walk around the house and **tap NFC tags or scan QR codes** attached to
decorations and food to encounter Pokémon. The Ditto disco ball is the
canonical example: tap it, and you choose to **battle it** (your team gains
EXP) or **catch it** (it joins your team).

- ~50 unique Pokémon placed around the house
- Guests build a team over the course of the evening
- The payoff for building a team is **battling other guests**
- 10–20 participants
- Logic only needs to cover the 50 offered species plus their evolutions, plus
  whatever starters guests picked in the invite plus their evolutions

---

## 2. What was decided

These came out of the brainstorm and Poley reacted positively to them. They
are decisions-in-principle, not locked specs.

1. **Encounters are URLs.** Each NFC tag / QR encodes something like
   `site/#e=ditto-disco`. The page reads the hash, looks the encounter up in a
   config table, and runs it. Team state in `localStorage`, same pattern as the
   invite's RSVP. No server needed for the collecting half at all.
2. **Every NFC tag gets a printed QR code next to it.** Non-negotiable. See the
   iOS notes in §5.
3. **Trainer-vs-trainer uses the "Jackbox model":** battle renders on a TV or
   laptop showing only public information; each player's phone is a private
   controller showing only their own move menu. Poley is willing to stand up a
   **Firebase** backend for this and already knows Firebase.
4. **The TV client is authoritative.** It is the only thing that runs the
   battle engine. Phones write a move choice and read back what they are
   permitted to see. This avoids any determinism / lockstep work.
5. **Build a hot-seat fallback and make it the first thing that works.** The
   battle should read its inputs from an abstraction that is either Firebase or
   local, so a network failure at 9pm degrades to pass-the-phone instead of
   killing the centerpiece.
6. **Do a de-risking spike before building the party game proper:** hardcoded
   teams, two real phones, one laptop, a single battle end to end over Firebase.
   One evening. It retires nearly all the risk in the idea.

---

## 3. What exists already and can be reused as-is

All paths relative to the invite folder (`C:\PokeParty`).

| File | What it gives you |
|---|---|
| `js/engine.js` | The `Battle` class. Gen-3 damage formula, official type chart, STAB, accuracy/evasion stages, crits, priority, PP + Struggle, burn/poison/paralysis/sleep/freeze, confusion with self-hit, flinching, stat stages, turn limit. Also holds `chooseFoeMove()`, the rival AI. |
| `js/dex.js` | `makeMon(speciesId, level, budget)`, `normalizeBase()`, `effectiveness()`, `searchSpecies()`, `pickRivalSpecies()`. |
| `data/dex-data.js` | The whole dataset as plain globals (`POKEDEX_DATA`, `MOVES_DATA`, `TYPECHART_DATA`) loaded via `<script>` — **not** fetched, because `fetch()` refuses `file://`. Gen 1–4, level-up learnsets filtered to gen 1–4 version groups. |
| `data/sprite-fit.js` | Per-sprite map of how much of each 96x96 canvas the artwork fills, used to scale sprites up with CSS without cropping them. |
| `sprites/pokemon/` | 534 uncropped 96x96 sprites (front + back). **Never crop these.** |
| `audio/cries/` | 267 legacy Game Boy cries as mp3. |
| `audio/music/`, `audio/sfx/` | intro, victory, keyitem, rival-battle; text-blip, ball-open, hit-normal/super/weak, faint, healing, low-hp, save. |
| `js/audio.js` | `Sound` module — `play()`, `cry()`, `music()`, `fanfare()`, `startLoop()`, `stopLoop()`, `toggleMute()`. |
| `js/game.js` | Battle UI, HP bars, sprite rendering, event-queue drain loop. Good reference for the TV view even if you rewrite it. |
| `tools/build-dex.js` | Regenerates `data/dex-data.js` from the PokéAPI CSV dataset. |

**Important sourcing note:** `pokeapi.co`, `play.pokemonshowdown.com` and
`cdn.jsdelivr.net` are **blocked by the workspace egress proxy**.
`raw.githubusercontent.com` is not. The dataset comes from
`raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv` — 14 CSV files
instead of ~800 REST calls. Cries come from PokéAPI's GitHub cries repo.

---

## 4. The one real code change to the engine

`Battle.runTurn(playerAction)` currently takes **one** action and generates the
opponent's move internally via `chooseFoeMove()`. For trainer-vs-trainer it
needs to accept **two** actions.

This is the most invasive change in the whole project and it is still small:
the priority/speed ordering block inside `runTurn` already sorts two actions,
it just sources one of them itself. Keep `chooseFoeMove()` — the wild
encounters and any NPC gym leaders still need it.

Other engine work the party game needs that does not exist yet:

- **EXP and leveling.** Level-up learnsets are already in `dex-data.js`, so a
  Pokémon leveling mid-party can genuinely learn a new move at the right level.
- **Evolution.** Evolution data is available in the same PokéAPI CSV set
  (`pokemon_evolution.csv`) and is not currently pulled into `dex-data.js`.
  Flagged in the brainstorm as **the highest delight-per-line-of-code feature in
  the entire idea** — someone's Bulbasaur evolving in the kitchen in front of
  their friends is the punchline of the party.
- **Catching.** Recommendation was to *not* implement the real gen-3 catch
  formula. Catching a full-HP wild Pokémon cold mostly fails, and failure at a
  party is someone standing next to a disco ball tapping their phone six times.
  Suggested instead: guarantee the catch but make the caught Pokémon a couple of
  levels lower than the battled version, so Poley's battle-or-catch tradeoff has
  teeth in both directions. Alternative: three attempts then guaranteed.
- **Multi-Pokémon teams and switching.** The invite is strictly 1v1 with no
  switching, by design. A party team needs both.

---

## 5. NFC and QR — practical findings

- **iPhone:** background NFC tag reading works on XS and newer, but it shows a
  **notification banner the guest has to tap** — it does not just open the page.
  It also will not fire when the screen is off, or while the camera is open.
  Older iPhones need the Control Center NFC widget.
- **Android:** just works, opens automatically.
- **Therefore every tag needs a printed QR alongside it.** Same URL. This is the
  difference between a bit that works for everyone and one that works for the
  Android half of the guest list. The QR is also the retry path when a tap
  misses.
- **Metal detunes NFC antennas.** The Ditto disco ball is metallic — ordinary
  NFC stickers will fail on it. Needs ferrite-backed "on-metal" tags, or hang
  the tag from a ribbon off the ball. Every metallic decoration needs this check.
- NTAG213 stickers run about $0.30 each; 50 tags is roughly $15–25. Buy spares,
  some will die. Keep two pre-written spare tags in a drawer on party night.

---

## 6. Pacing — flagged as the biggest real risk

50 encounters, 10–20 guests, roughly a three-hour window. For a guest to see a
meaningful slice of the house, **each tap needs to resolve in about 30–60
seconds**. A full manual battle in the current engine runs 3–5 minutes at
reading speed. That does not fit.

Suggested shape: wild encounters are short by construction — two or three turns,
faster text, or auto-resolve with a replay. Save full manual battles for gym
encounters and trainer-vs-trainer, where the length is the point.

**Level design matters as much as code.** Once guests gain EXP, flat difficulty
collapses. Give each tag a fixed level and lay the house out as routes: porch is
level 3–5, kitchen 8–12, upstairs 15+, one room is a gym with a badge. The house
becomes a map. This is a design problem, not an engineering one, and it is worth
real thought.

---

## 7. The hidden-information problem, and the answers

Poley's concern: on a single shared device, each player can see the other's team
and moves, which real battles do not allow.

**Useful reframing:** in canon, most of the battle screen is already public —
opponents see species, level, types, HP bar and status. What is actually secret
is the exact HP number, the move list, the stats, and the bench. So on one
device the real leak is narrow: the move menu during the other player's turn.

Options discussed, cheapest first:

1. **The curtain.** Between turns show a full-screen "Pass to Gary — tap when
   ready" card; the move menu only renders after the handoff tap. ~30 lines.
   Kills the actual leak. Hide numeric HP and you are essentially at canon-level
   information.
2. **Open team sheets.** Official VGC tournaments now play with open team
   sheets, so "you can see my team" can simply be declared a format rather than
   apologized for. Arguably better at a party — it enables trash talk.
3. **Jackbox model** (chosen). TV shows public info, phones are private
   controllers. Not a workaround — it is how the real games work: your screen is
   yours, the shared view is shared.
4. **Pre-committed strategy + auto-battle.** Each trainer privately sets lineup
   and a rough style before the two of them meet; the battle then resolves on
   the big screen with no live input. Nothing can leak because no decisions
   happen while the screens are together. Also solves pacing. Worth keeping in
   the back pocket.

Honest caveat recorded at the time: at level ~15 with drinks, the strategic
depth is low enough that perfect hidden information buys less than it feels
like. What Poley actually wants is the *feeling* of secrecy and reveal.

---

## 8. Jackbox / Firebase design sketch

**Realtime Database** for the live room rather than Firestore — cheaper for
many tiny writes, lower latency, and `onDisconnect` presence is genuinely
useful. Firestore (or the same RTDB) for durable team/pokédex/leaderboard data.

```
/rooms/{code}
  status:  lobby | picking | resolving | done
  turn:    3
  seats:   { A: {uid, name, teamPublic}, B: {...} }
  prompt:  { A: {legalMoves, deadline}, B: {...} }   <- TV writes, per-seat
  choices: { 3: { A: {move}, B: {move} } }           <- phones write
  log:     [ events... ]                              <- public, TV writes
```

**Turn loop:** TV computes and writes each seat's legal moves -> phones render
buttons -> each phone writes its choice -> TV sees both, calls `runTurn()`,
writes the event log, animates locally -> repeat.

**Secrecy is enforced by security rules, not by UI.** `/rooms/$c/prompt/$seat`
readable only by that seat's uid; `/choices/$turn/$seat` writable only by that
seat and unreadable by the other until the TV publishes the turn. Without rules
anyone with a JS console reads the whole room — and Poley has at least one
friend who would try that as a bit.

**Auth:** anonymous. Each guest already has an identity from the collecting
phase; the uid lives in `localStorage`. Note the failure mode: cleared storage
loses the identity, so teams should also be recoverable from a link or short
code (same trick as the invite's base64url `#r=` RSVP hash).

**Joining:** QR on the TV rather than a typed room code. QR is already the
project's idiom.

**Effort estimate given at the time (~15–25 hours total):**

| Piece | Hours |
|---|---|
| Firebase project, anon auth, security rules | 1–2 |
| Room lifecycle: create, join by QR, seat assignment, reconnect | 3–4 |
| Turn loop + the two-action `runTurn` refactor | 3–5 |
| Phone controller UI (mostly reuses existing move buttons) | 2–3 |
| TV landscape layout (existing battle scene, scaled up) | 2–3 |
| Disconnect / timeout / rejoin handling — *where the time actually goes* | 2–4 |
| Testing on real devices | 2–3 |

**Free bonus of TV-authoritative design:** because the log is public, spectator
view comes for free — anyone can open the room link and watch on their phone.

---

## 9. Party-night failure modes to design for

- **A phone sleeps or Safari backgrounds the tab** and that player vanishes
  mid-battle. **The single most important feature is a turn deadline with
  auto-pick** — if nobody chooses within ~30 seconds the TV picks a random legal
  move and continues. A battle must never be able to stall; a stalled battle
  with an audience is the worst possible failure.
- **Rejoin.** Keep all room state in the DB, never only in TV memory, so a
  player who locked their phone can reopen the link and resume their seat by uid.
- **The TV laptop sleeping.** Plug it in, disable sleep, and do not use that
  machine for anything else.
- **Lost teams.** Cleared browser storage or a swapped phone loses everything.
  Team state should be recoverable from a link or short code.
- **Dead phone batteries.** A charging station doubles as a place people gather.
- **Test on a real iPhone AND a real Android** before the party. Not on the same
  phone twice.
- **Cost:** free tier, nowhere near a limit at 20 guests.

---

## 10. Open questions Poley has not answered

1. **Endgame shape:** a formal bracket where a few people battle while everyone
   watches, or any two guests challenging each other anywhere in the house at
   any time? These pull in opposite directions — the first makes the TV setup
   very worth it, the second makes it nearly useless. *This is the question that
   most changes the architecture. Ask it early.*
2. **EXP sharing:** across the whole team, or only the Pokémon that fought?
   Affects how fast people evolve and how much collecting matters.
3. **Are caught Pokémon usable immediately**, or do they need registering
   somewhere? A registration station is another excuse to make people move
   around the house.
4. Whether wild encounters are manual, auto-resolve, or both.

---

## 11. Suggested first move

Do not start with the collecting system. Do the **spike** from §2.6 first:
hardcoded teams, two phones, one laptop, one battle end to end over Firebase, no
NFC, no polish. A few hours. It tells Poley whether the latency and the
phone-sleep behavior feel acceptable on the actual devices and the actual house
wifi. If that evening feels good, everything else is known work.
