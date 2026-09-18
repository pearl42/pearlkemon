# A Wild Invitation Appeared!

A playable invite. Professor Pearl welcomes you to the world of Pokémon, forgets
her grandson's name, makes you name him, and hands you a crate of unlabelled
Poké Balls. Whatever you pull out, her grandson picks something to beat it.
Win the 1v1 and she hands over the party details as a key item.

Afterwards the plus-one picks a partner of their own, and everyone lands on a
trainer card that doubles as the RSVP — editable, any time, from any device.

No build step, no framework, no dependencies, no API calls at runtime.

---

## 1. Files

```
index.html            the page
css/style.css         all styling (colour tokens at the top)
js/config.js          ← YOU EDIT THIS: party details, the script, battle tuning
js/dex.js             loads the data, scales stats, picks the rival
js/engine.js          battle mechanics
js/game.js            scenes and UI
js/rsvp.js            ← YOU EDIT THIS: where RSVPs go
js/audio.js           music, sound effects and cries (all optional)
data/dex-data.js      the data the page actually loads, generated
data/pokedex.json     the same 267 Pokémon as JSON, for other tools
data/moves.json       167 moves
data/typechart.json   the official type chart
sprites/pokemon/      534 sprites (front + back), fetched once
sprites/              professor-pearl.png, professor-pearl-karp.png,
                      rival.webp, logo.png
tools/build-dex.js    regenerates data/*.json from the PokéAPI dataset
audio/                drop music, sfx and cries here — see audio/README.txt
tools/fetch-sprites.js  re-downloads sprites/pokemon/
tools/fetch-cries.js    downloads one cry per Pokémon
```

## 2. Run it locally

**Just double-click `index.html`.** It works straight off disk — the Pokémon
data is loaded as a `<script>` (`data/dex-data.js`) rather than fetched, because
browsers block `fetch()` on `file://` URLs.

If you'd rather serve it:

```bash
cd pokeparty
python3 -m http.server 8000
```

…then open <http://localhost:8000>. Either way works.

---

## 3. Fill in your details

`js/config.js`, first block. The only thing you *have* to change:

```js
const PARTY = {
  address: "[YOUR ADDRESS HERE]",   // ← this one
  mapUrl:  "",                      // ← optional Google Maps link
  ...
};
```

The whole script is at the bottom of the same file under `SCRIPT`:

| token | who |
|---|---|
| `{NAME}` | the guest |
| `{RIVAL}` | **Pearl's grandson** — a character, named by the guest as a gag |
| `{PLUSONE}` | the guest's **actual plus-one**, asked for separately |
| `{STARTER}` / `{PLUSSTARTER}` | their two Pokémon |
| `{HOST}` | you |

The grandson and the plus-one are deliberately different people. Conflating
them meant a girlfriend called Priya was drawn as a spiky-haired boy, so the
gag (naming him) and the logistics (who's coming) were split apart.

A line starting with `*` renders as an italic stage direction. Each array entry
is one text box — add and remove freely. Two markers do extra work:

- `[[hand]]` — Pearl writes the name on her palm (see §5a)
- `[[karp]]` — Pearl changes into the Magikarp costume, permanently

---

## 4. Where the Pokémon come from

`tools/build-dex.js` pulls the PokéAPI project's own CSV dataset from GitHub and
bakes three JSON files. It uses the CSVs rather than the REST API because it's
14 files instead of ~800 requests, and it hands over the official type chart and
move metadata in one shot. Re-run it any time:

```bash
node tools/build-dex.js
```

**Who's included:** every first-form Pokémon from gens 1–4 — 267 of them,
including legendaries and babies. Species whose *only* pre-evolution is a baby
are included too, so Pikachu, Snorlax, Jigglypuff and friends are all in the
crate. Nobody's favourite is locked away on a technicality.

Toggle whole groups in `js/config.js` — no rebuild needed, just reload:

```js
const DEX_FILTER = {
  allowLegendary:      true,   // false: -35 (Mewtwo, the birds, Arceus...)
  allowBaby:           true,   // false: -18 (Pichu, Igglybuff, Togepi...)
  allowBabyEvolutions: true    // false: -20 (Pikachu, Snorlax, Chansey...)
};
```

`allowBabyEvolutions: false` gives you strict first forms only — Pichu is in the
crate, Pikachu isn't. With legendaries off as well that's **212 Pokémon**.

**Movesets** are exactly what each species knows at `LEARN_LEVEL` (5) **in a
gen 1-4 game**. That last part matters: most rows in the PokéAPI learnset table
come from gen 5+ titles, so without filtering by version group a species
arrives with the level it learns something in Sun/Moon. Bulbasaur's honest
level-5 moveset is Tackle and Growl.

The cost is thin movesets — 209 of 265 species have exactly one attack. Raise
`LEARN_LEVEL` in `tools/build-dex.js` for more variety; the balance holds
either way:

| `LEARN_LEVEL` | species with ≤1 attack | thoughtful | mashing | turns |
|---|---|---|---|---|
| **5** (shipped) | 209 / 265 | 79% | 53% | 6.2 |
| 8 | 164 / 265 | 79% | 49% | 5.4 |
| 10 | 136 / 265 | 77% | 46% | 5.0 |

Species that genuinely can't attack at level 5 keep their famous useless move
and get a Struggle button. **No species is ever dropped** for having nothing
usable — Wobbuffet ships with an empty moveset rather than disappearing from a
crate someone is searching.

**Sprites keep their original 96×96 canvas — don't crop them.** The artwork
inside fills anywhere from 28% to 100% of that canvas, so at one fixed size
Onix fills the screen and Bulbasaur is a speck. Cropping each file fixes that
but breaks the crate, where the uniform canvas is what makes 212 Poké Balls
render identically.

Instead, `tools/measure-sprites.js` records each sprite's fill fraction into
`data/sprite-fit.js`, and the battle screen scales each one individually to
land at about the same size. Tune it with `SPRITE_SIZE` in `js/config.js`:

```js
const SPRITE_SIZE = { target: 0.78, min: 0.78, max: 2.0 };
```

`target` is the share of the box the artwork should occupy; `min`/`max` cap how
far any single sprite may be scaled, so Onix stays on screen and Caterpie
doesn't become a mural. Re-run the measure script after changing sprites.

The battle field is laid out diagonally and absolutely — foe top-right, you
bottom-left — because stacked in a flex column a sprite can never be taller
than half the stage. Sprites sit *behind* the HP panels by design.

The set is already downloaded into `sprites/pokemon/` — 2.1 MB, so the
invite has no external image dependency and can't be rate-limited on party
night. To use a CDN instead, point `SPRITE_BASE` in `js/config.js` at
`https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/pokemon/`.

---

## 5. Balance

Everything fights at **level 5 with the moves it actually knows at level 5** —
`LEARN_LEVEL` in `tools/build-dex.js`. Bulbasaur gets Vine Whip, Tackle and
Growl. Charmander gets Ember, Scratch and Growl. Magikarp gets Splash, and
Tackle only because the window opens to the level it first learns an attack.

That authenticity costs something, and the costs are handled explicitly:

**Most species have one or two attacks, not four.** 83 of them have exactly one.
Raise `LEARN_LEVEL` to 10 or 15 for fuller movesets if battles feel thin.

**`POWER_MIN` is 20**, not 35 — Absorb and Bubble are 20-power moves and they're
normal at this level.

**Six species can't attack at all** (Abra, Ditto, Wobbuffet, Wynaut, Smeargle,
Budew) and Delibird only has Present. They keep their famous useless move — it
prints *"But nothing happened!"* — and get a Struggle button from turn one. A
Magikarp that can only Splash is the joke, not a bug.

**Base stats are rescaled to a common budget.** Guests can pick anything, so the
*shape* is preserved — a fast frail pick stays fast and frail, Snorlax still
tanks — but the fight isn't decided by whose favourite has the higher BST.

**The rival's pick has a fairness rule**, and at level 5 it does most of the
balancing. Neither side has a level advantage and both may have only one attack,
so the type matchup decides nearly everything. The rule: he may only pick a
species the guest can hit *at least as hard as it hits back*. Without it the
guest wins about 31% of the time; with it, 78%. Within what's fair he still
prefers something that counters you, so it still reads as a counter-pick.

**`turnLimit` caps a battle at 25 turns.** Two level-5 Pokémon with one weak
move each can genuinely grind; if nobody has won, Pearl steps in, calls it a
draw and hands over the details anyway.

Simulated over 4,000 random matchups at the shipped settings:

| Guest behaviour | Win rate | Length |
|---|---|---|
| Thinks about type matchups | **78%** | ~5 turns |
| Taps buttons at random | **48%** | ~7 turns |

Lose twice and Pearl hands over the details regardless, and a permanent
**Skip to party info ▸** link sits in the corner for guests who'd rather not
play — that lands them on the same trainer card, blank and editable.

**The plus-one picks too.** After the battle Pearl makes her grandson put the
research specimen back and both trainers choose a partner they actually like.
The rival's counter-pick still happens — that one was only ever a loaner.

**Mechanics implemented:** Gen-3 damage formula, the official type chart, STAB,
accuracy and evasion stages, critical hits (and high-crit moves), move priority,
PP with Struggle as the fallback, burn / poison / paralysis / sleep / freeze,
confusion with self-hit, flinching, and stat-stage changes. No switching — you
only have the one Pokémon.

---

## 5a. The name on Pearl's hand

When Pearl writes the plus-one's name down so she won't forget it again, it
appears in handwriting on her palm — and stays there for the rest of the visit,
every time she's on screen.

The position is measured off the artwork itself, not the screen, so it lands on
her palm at any size. `HAND` in `js/config.js`:

```js
const HAND = {
  x: "10.4%", y: "23%",   // centre of her palm within the image
  tilt: "-11deg",         // the palm is angled, so the writing is too
  size: 0.105,            // font size as a share of the image width
  maxWidth: 0.105,        // shrinks to fit, so long names stay on the hand
  zoom: 2.1, zoomHold: 2600
};
```

Her palm is only about a tenth of the picture wide, which on a phone is roughly
17 pixels — so the view pushes in for two and a half seconds while she writes,
then pulls back. Set `zoom: 1` to turn that off.

Any script line containing `[[hand]]` triggers it; the marker is stripped before
the line is displayed. **If you replace `professor-pearl.png`, re-measure `x`
and `y`** — they're specific to that drawing.

---

## 5d. Jokes for particular picks

`PICK_JOKES` in `js/config.js` is keyed by dex slug. When someone commits to
that Pokémon, Pearl says the line before her usual reaction. 41 are written;
anything unlisted just gets the normal response, so add and delete freely.

```js
const PICK_JOKES = {
  rattata: "*It's in the top percentage of RATTATA.",
  eevee:   "PEARL: {STARTER}. Lovely. You had better not be evolving that into a VAPOREON.",
};
```

`PEARL:` shows her portrait; a leading `*` is a stage direction; `{STARTER}`,
`{NAME}` and `{RIVAL}` all work.

**Check your `DEX_FILTER` against this list.** With legendaries and
baby-evolutions off, nine of the written jokes can never fire — including
Pikachu, Snorlax, Chansey, Clefairy and Mewtwo.

---

## 5c. MISSINGNO.

Type `missingno` into the crate's search box. There is no 152nd ball, but the
search finds one anyway and it is not well. Choosing it corrupts the screen for
a second, Pearl refuses to discuss it, your item in slot 6 multiplies, and you
are returned to the crate. Copy is `SCRIPT.missingno` in config.

---

## 5b. Sound

Optional, and silent until you add files. `audio/README.txt` lists exactly what
goes where; `js/config.js` has an `AUDIO` block for filenames and volumes.

Three things worth knowing:

- **Browsers won't play audio until the visitor taps the page.** The PRESS START
  tap is that moment, so nothing tries to play before it.
- **There's a mute button** in the top-left. It remembers the choice, so a guest
  who mutes on their phone stays muted when they come back to edit.
- **Music is the heaviest thing on the page.** Five two-megabyte loops outweigh
  all 534 sprites combined. Short loops at 96–128 kbps mono are plenty.

Cries play when a ball opens in the crate, when either Pokémon is sent out, and
when one faints. Collect them with:

```bash
node tools/fetch-cries.js
```

---

## 6. The RSVP

The trainer card at the end *is* the RSVP form. Every field on it can be changed
— name, their Pokémon, plus-one name, the plus-one's Pokémon, a free-text
message, and attending yes/no. There's no login.

**Coming back later** works two ways, and it needs both:

- **localStorage** remembers them on that browser, so reopening the invite on
  the same phone picks up where they left off.
- **The `#r=` link.** After saving, the card shows a link with their whole RSVP
  packed into the URL hash. Bookmark it, mail it to yourself, open it on a
  laptop — everything comes back. Nothing is read back from a server, so this is
  the only way an edit survives a different device.

Every submission carries a stable `id`, so **your endpoint should update the
existing row and only append when the id is new** — otherwise one guest who
changes their mind three times becomes four rows.

`js/rsvp.js`, set `mode`. Ships as `"console"` so you can test without wiring
anything up.

### Option A — Google Sheet (recommended)

1. New Google Sheet, headers in row 1:

   `id | submittedAt | revision | name | starter | plusOne | plusOneStarter | attending | note | rivalPokemon | wonBattle | attempts`

2. Extensions → Apps Script, replace everything with:

   ```js
   function doPost(e) {
     var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
     var d = JSON.parse(e.postData.contents);
     var row = [d.id, d.submittedAt, d.revision, d.name, d.starter, d.plusOne,
                d.plusOneStarter, d.attending, d.note, d.rivalPokemon,
                d.wonBattle, d.attempts];

     // update in place if we've seen this guest before, otherwise add a row
     var last = sheet.getLastRow();
     if (last > 1) {
       var ids = sheet.getRange(2, 1, last - 1, 1).getValues();
       for (var i = 0; i < ids.length; i++) {
         if (ids[i][0] === d.id) {
           sheet.getRange(i + 2, 1, 1, row.length).setValues([row]);
           return ContentService.createTextOutput("updated");
         }
       }
     }
     sheet.appendRow(row);
     return ContentService.createTextOutput("added");
   }
   ```

3. Deploy → New deployment → **Web app**. Execute as **Me**, access **Anyone**.
   Copy the URL.

4. In `js/rsvp.js`: `mode: "sheet"`, `endpoint: "<that URL>"`.

Apps Script is posted `no-cors`, so the browser can't read the response and the
site always reports success. Watch the sheet to confirm.

### Option B — Formspree / Netlify Forms

`mode: "formspree"` plus the endpoint. Returns a real status, so failures are
caught and the guest is told to message you instead. Note that these append
rather than update, so edits arrive as extra submissions with the same `id` —
sort by `id` then `revision` and keep the last.

### Option C — your own Worker/API

`mode: "worker"` plus the endpoint. It receives:

```json
{ "id":"9f2c…", "submittedAt":"…", "revision":2,
  "name":"Ash", "starter":"Pikachu", "starterDex":25,
  "plusOne":"Gary", "plusOneStarter":"Snorlax", "plusOneDex":143,
  "attending":true, "note":"no pineapple please",
  "rivalPokemon":"Onix", "wonBattle":true, "attempts":1 }
```

Upsert on `id`.

---

## 7. Deploy

### Netlify — drag and drop

<https://app.netlify.com/drop>, drag the `pokeparty` folder on. You get a URL
immediately. Rename under Site settings → Change site name.

### Netlify — CLI, for redeploying later

```bash
npm install -g netlify-cli
cd pokeparty
netlify deploy --dir=. --prod
```

First run asks you to log in and pick or create a site; the same command ships
updates after that.

### Vercel

```bash
npm install -g vercel
cd pokeparty
vercel --prod
```

Static site — no framework to detect, no build command to set.

### Custom domain

Netlify: Domain settings → Add domain. For `party.polemovebook.com`, add a CNAME
record at your DNS host pointing `party` at the Netlify hostname it gives you.

---

## 8. Accessibility

- Every interactive element is a real `<button>`, keyboard-reachable;
  Enter/Space advance dialogue, focus opens a Poké Ball.
- `prefers-reduced-motion` disables the typewriter and all animation.
- Layout verified with no overflow at 375×667, 390×844 and 768×1024.
- Tap targets are 44px minimum.
- The essential information is never more than one tap away via the skip link.

## 9. A note on the assets

Sprites, names, moves and the type chart are Nintendo / Game Freak / The Pokémon
Company's, served through the PokéAPI fan project. Fine for a private party
invite; don't put ads on it or sell tickets.
