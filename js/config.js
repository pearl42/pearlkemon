/* ============================================================
   config.js — EVERYTHING YOU'LL WANT TO EDIT LIVES IN THIS FILE.
   Party details, the script, battle tuning, which Pokémon are offered.

   The Pokémon themselves come from data/*.json, generated from the
   PokéAPI dataset by tools/build-dex.js. You don't edit those by hand.
   ============================================================ */

/* ---------- 1. PARTY DETAILS ---------- */
const PARTY = {
  hostName:  "Pearl",
  occasion:  "30th Birthday",
  dateLong:  "Saturday, November 21st",
  time:      "6:00 PM",
  address:   "House with the penguin mailbox",
  addressNote: "",
  mapUrl:    "https://maps.app.goo.gl/JQ88x47KNvYBraQa9",                       // optional Google Maps link
  theme:     "Back to the VERY FIRST party theme: Pokémon.",
  theme2:     "Pokémon",
  themeNote: "No prior knowledge required!",
  attire: "Costumes encouraged! Pokémon, trainer, Team Rocket--the world is your Cloyster",
  attireNote: "Costumes are a silly little birthday treat for me, not a necessity (and spares will be available at the door :)",
  food:      "SO MUCH. You will be well-fed!",
  foodNote:  "Tell me below if you have any dietary restrictions I should plan+label for!",
  rsvpBy:    "",
  contact:   "Professor Pearl"
};

/* ---------- 2. WHO'S IN THE BALLS ----------
   The dex ships every first-form Pokémon from gens 1-4 (plus the ones
   whose only pre-evolution is a baby, so Pikachu and Snorlax are in).  */
const DEX_FILTER = {
  allowLegendary:      false,  // false hides Mewtwo, the birds, Arceus... (-35)
  allowBaby:           true,  // false hides Pichu, Igglybuff, Togepi... (-18)
  allowBabyEvolutions: false   // false hides the 20 species that are only in
                              // because their pre-evolution is a baby:
                              // Pikachu, Clefairy, Jigglypuff, Snorlax,
                              // Chansey, Marill, Sudowoodo, Mr. Mime...
};
/* All three true  -> 267 Pokémon in the crate.
   Legendaries and baby-evolutions off -> 212, i.e. strict first forms only.  */

/* ---------- 3. BATTLE TUNING ----------
   Guests can pick anything from Magikarp to Mewtwo, so raw base stats
   are rescaled to a common budget before the battle. The SHAPE is kept
   — a fast, frail pick stays fast and frail — but nobody wins or loses
   on the lottery of who their favourite happens to be. Type matchups
   and move choice are what decide the fight.                          */
const BATTLE = {
  playerLevel:  5,
  rivalLevel:   5,
  playerBudget: 340,   // total base stats every player mon is scaled to
  rivalBudget:  250,
  hpScale:      1.75,   // both sides get this much more HP, so a fight lasts
  rivalMisplay: 30,    // % of turns the rival takes its second-best move
  mercyAfter:   2,     // losses before Pearl hands over the details anyway
  turnLimit:    25     // two Lv5 mons with one weak move each can grind; if
                       // nobody has won by here, Pearl calls it
};
/* Simulated over 4,000 random matchups at these numbers:
   thinking about type matchups wins 80%, tapping at random wins 49%,
   a battle runs ~5 turns and can't exceed turnLimit.

   Everything fights at Lv5 with the moves it actually knows at Lv5, which
   means no level edge and often only one attack each — so the type matchup
   decides nearly everything. The fairness rule in dex.js does the balancing
   instead: the rival may only pick something the guest can hit at least as
   hard as it hits back.                                                  */

/* Where the sprites come from. All 534 are already in sprites/pokemon/
   (fetched by tools/fetch-sprites.js), so the invite has no external
   image dependency — it works on bad wifi and can't be rate-limited.
   Point this at a CDN instead if you'd rather not host 2 MB of PNGs:
   "https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/pokemon/"  */
const SPRITE_BASE = "sprites/pokemon/";

/* ---------- UI labels ---------- */
const UI = {
  skipLink:    "Skip to party info ▸",
  editHint:    "Anything on this card can be changed. Come back any time.",
  notePrompt:  "Anything I should know? Dietary concerns, late arrival/early departure, your favorite Pokémon that you demand to see represented, etc.",
  savedLink:   "Bookmark this link and you can change your RSVP from any device. Or, submit a new RSVP under the same name and I'll use the most recent submission!",
  // Shown on the card when the RSVP could not be confirmed as received.
  // {CONTACT} becomes PARTY.contact.
  sendFailed:  "This answer is saved on your device, but it never reached {CONTACT}. Please send her a message so you don't get left off the list.",
  // The invite that opens after the battle. The date, time and theme on it
  // come straight from PARTY above, so they can't drift from the card.
  inviteKicker: "PARTY INVITE",
  inviteTap:    "\u25bc TAP TO CONTINUE",
  // On the card once an RSVP is in, so it's clear they're free to go.
  backToTitle:  "\u25c2 Back to title screen",
  // The 1-5 question. knowHint sits under the buttons before anything is
  // picked; knowConfirm is the button once a level is selected.
  knowHint:      "Tap a number to see what it means.",
  knowConfirm:   "That's me \u25b8",
  knowSkip:      "Leave blank \u25b8",       // plus-one only — theirs is optional
  knowClassLabel: "Trainer class"
};

/* Where Professor Pearl's open palm sits, as a percentage of her artwork —
   measured off the art itself, so it holds at every screen size. Re-measure
   if you replace professor-pearl.png. The view pushes in while she writes,
   because the palm is only a tenth of the picture wide.                   */
/* ---------- HOW MUCH POKéMON DO THEY KNOW? ----------
   Asked once, before the rival shows up. The number is what gets stored; the
   class name is looked up from here at render time, so renaming a class never
   invalidates an answer somebody already gave.

   `blurb` is what they see while deciding — it appears under the buttons as
   they move across them, so nobody has to guess what a "3" is agreeing to. */
const KNOW_LEVELS = [
  { n: 1, cls: "First-time Trainer",
    blurb: "You mean the children's cartoon?" },
  { n: 2, cls: "Rookie Trainer",
    blurb: "I know Pikachu and think I could figure out a Pokémon battle." },
  { n: 3, cls: "Seasoned Trainer",
    blurb: "I've battled Pokémon before, but not much/not in a long time." },
  { n: 4, cls: "Ace Trainer",
    blurb: "I could name three moves that are super effective on Squirtle." },
  { n: 5, cls: "Champion",
    blurb: "Some or all of these terms mean something to me: Nuzlocke, Smogon, STAB, IVs." }
];

const HAND = {
  x: "10.4%",        // centre of her palm, across the artwork
  y: "23%",          // ...and down it
  tilt: "-31deg",    // the palm is angled, so the writing is too
  size: 0.084,       // starting font size, as a share of the artwork's width
  maxWidth: 0.084,   // it shrinks to fit this much of the width, so a short
                     // name and a long one both stay on her hand
  zoom: 1,         // how far the view pushes in while she writes (1 = off)
  zoomHold: 2600     // ms to hold the close-up before pulling back
};

/* Same body, same palm — but the Magikarp head makes the picture taller, so
   the hand sits lower down it. */
const HAND_KARP = Object.assign({}, HAND, { y: "28%" });

/* ---------- AUDIO ----------
   All optional. Drop files into audio/music, audio/sfx and audio/cries and
   they start working; anything missing simply stays silent. Filenames are
   yours to choose — these are just what the code looks for.              */
const AUDIO = {
  musicVolume: 0.30,
  sfxVolume:   0.40,
  cryVolume:   0.25,
  cries:       true,        // false turns cries off without deleting the files
  cryFormat:   "mp3",       // audio/cries/<slug>.mp3

  music: {
    title:    "intro.mp3",        // PRESS START — same track as the lab, so it
    lab:      "intro.mp3",        //   carries on without restarting
    battle:   "rival-battle.mp3", // the fight
    victory:  "victory.mp3",      // loops from the win until the key item
    keyitem:  "keyitem.mp3"       // one-shot fanfare, then victory resumes
    // crate:   "crate.mp3",      // ← not yet: choosing a Pokémon
    // details: "details.mp3"     // ← not yet: the trainer card
  },

  sfx: {
    text:     "text-blip.mp3",    // per line of dialogue
    select:   "text-blip.mp3",    // STOPGAP: no select beep yet, so the
                                  // dialogue blip doubles as the button press
    ball:     "ball-open.mp3",    // opening a Poke Ball in the crate
    hit:      "hit-normal.mp3",   // a hit lands
    hitSuper: "hit-super.mp3",    // ...super effectively
    hitWeak:  "hit-weak.mp3",     // ...not very effectively
    faint:    "faint.mp3",        // a Pokemon goes down
    heal:     "healing.mp3",      // Pearl patching you up for round two
    lowHp:    "low-hp.mp3",       // loops while you're under 20% HP
    save:     "save.mp3"          // the RSVP is sent
  }
};

/* ---------- PICK JOKES ----------
   A line Professor Pearl says the moment someone commits to a Pokemon, keyed
   by its dex slug. Anything not listed here just gets the normal reaction, so
   add and delete freely. Written in her voice; "PEARL:" prefixes show her
   portrait, a leading "*" is a stage direction.                            */
const PICK_JOKES = {
  buneary:    "PEARL: {STARTER}. I do hope that's for... ethical reasons.",
  lopunny:    "PEARL: Absolutely not. Put it back.",
  eevee:      "PEARL: {STARTER}. Lovely. You had better not be evolving that into a VAPOREON.",
  rattata:    "*It's in the top percentage of RATTATA.",
  pikachu:    "PEARL: {STARTER}. How brave. How wildly original.",
  magikarp:   "PEARL: HELL YEAH bestie. Karp on top!",
  ditto:      "PEARL: Oh great, now I have to code logic for shapeshifting.",
  psyduck:    "PEARL: Now it's on you to figure out the appropriate dosage of ibuprofen for a duck.",
  slowpoke:   "PEARL: I feel like this choice is a red flag.",
  wobbuffet:  "PEARL: It cannot attack. It can only be attacked. Think about that.",
  jynx:       "*PROFESSOR PEARL takes a long sip of tea and says nothing.",
  machop:     "PEARL: Finally. Someone who lifts.",
  snorlax:    "PEARL: A kindred spirit. It also intends to eat at my party.",
  gengar:     "PEARL: You know that's a shadow, don't you? Of something else?",
  mewtwo:     "PEARL: That one's a war crime, dear. Enjoy.",
  mew:        "PEARL: It was under the truck the whole time. I knew it.",
  arceus:     "PEARL: Bold, bringing God to a birthday party.",
  sudowoodo:  "PEARL: It's not a tree. It has never been a tree. It would like you to think it's a tree.",
  farfetchd:  "PEARL: It brought its own vegetable. Frankly that's more than most guests manage.",
  abra:       "PEARL: It will teleport away the moment things get difficult. Relatable.",
  smeargle:   "PEARL: An artist. Can it come early to help decorate?",
  bidoof:     "PEARL: {STARTER}. The people's champion.",
  zubat:      "PEARL: Why. Why would you. There are two hundred others.",
  luvdisc:    "PEARL: Oh, how romantic.",
  spinda:     "PEARL: No two are alike, and not one of them is well.",
  wurmple:    "PEARL: Nobody knows what that becomes. Not even it.",
  shuckle:    "PEARL: Why. Why would you. There are two hundred others.",
  igglybuff:  "PEARL: Igglybuff will come in handy when it's time to sing happy birthday!",
  chansey:    "PEARL: Bringing the nurse. Sensible, given the cake situation.",
  clefairy:   "PEARL: That one came from space and we all just accepted it.",
  cubone:     "PEARL: ...Let's not get into whose skull that is. Not today.",
  gastly:     "PEARL: It's mostly gas. Aren't we all.",
  drowzee:    "PEARL: It eats dreams. Don't let it near the guest bedroom.",
  meowth:     "PEARL: If it starts talking, that's a different franchise and not my problem.",
  togepi:     "PEARL: You have chosen an egg with a face. I respect the commitment.",
  bellsprout: "PEARL: {STARTER}. All mouth.",
  tentacool:  "PEARL: You will be surfing past forty of those later.",
  geodude:    "PEARL: A rock-solid choice.",
  ralts:      "PEARL: It can feel your emotions, so do try to have some nice ones.",
  seedot:     "PEARL: An acorn. You've picked an acorn.",
  feebas:     "PEARL: Ugly now. Insufferable later. Much like {RIVAL}."
};

/* How big each Pokemon ends up on the battle screen. The sprites keep their
   96x96 canvas — that's what makes the crate's Poke Balls uniform — but the
   artwork inside fills between 28% and 100% of it, so each one is scaled
   individually to land at roughly the same size.
     target : share of the box the artwork should end up occupying
     min/max: how far a single sprite may be scaled, so Onix stays on screen
              and Caterpie doesn't become a mural                           */
const SPRITE_SIZE = { target: 0.78, min: 0.78, max: 2.0 };

const TRAINER_ART = {
  professor:     "professor-pearl.png",
  professorKarp: "professor-pearl-karp.png",   // shown by the [[karp]] marker
  rival:     "rival.webp",
  logo:      "logo.png"
};

/* ---------- 4. THE SCRIPT ----------
   {NAME} = the guest.  {RIVAL} = their plus-one.  {STARTER} = their pick.
   {HOST} = you.  Each array entry is one text box.
   A line starting with "*" renders in italics as a stage direction.    */
const SCRIPT = {
  intro: [
    "Ah, there you are. Right on time.",
    "Welcome to the world of Pokémon. My name is PROFESSOR PEARL.",
    "I have studied these creatures for nearly thirty years. I conduct research so we may learn more about Pokémon.",
    "*You note PROFESSOR PEARL looks really hot and muscular for her age.",
    "But before we go any further, I should know who I'm talking to."
  ],
  askName: "What's your name, then?",
  afterName: [
    "{NAME}. A fine name. Suits you."
  ],
  /* The 1-5 question happens here, between these two blocks. */
  askKnow: [
    "{NAME}, how much do you already know about the world of Pokémon?"
  ],
  askKnowPrompt: "Rate your Pokémon knowlege:",
  /* One line back, keyed to what they picked. 5 gets the wink. */
  knowReply: {
    1: "PEARL: Yay for a first-time trainer! I'll include a little extra info as we go, then.",
    2: "PEARL: You'll pick it right up! I'll help fill in the gaps as we go.",
    3: "PEARL: It comes back quickly! Like riding a bicycle. Except now's not the time to use that.",
    4: "PEARL: Enough to get all the jokes but not so much you break my battling logic--perf!",
    5: "PEARL: Well then I won't insult you by explaining type effectiveness!"
  },
  afterKnow: [
    "Now. There's someone else you should meet."
  ],
  rivalIntro: [
    "This is my grandson.",
    "The two of you have been inseparable since you were babies. Thick as thieves. Rivals, even.",
    "His name is... his name is...",
    "*PROFESSOR PEARL stares into the distance.",
    "...Erm, what is his name again?",
    "Pole dancing really scrambles the brain particles."
  ],
  askRival: "What is my grandson's name?",
  afterRival: [
    "{RIVAL}! Yes. Of course. {RIVAL}. My own flesh and blood.",
    "*PROFESSOR PEARL writes '{RIVAL}' on her hand. [[hand]]",
    "Never doubted it for a moment."
  ],
  starterIntro: [
    "Right. Down to business.",
    "{NAME}, your very own Pokémon legend is about to unfold!",
    "*PROFESSOR PEARL hauls a crate onto the table using her huge muscles. It is full of poké balls.",
    "Thirty years of fieldwork. Take whichever one you like--I've labelled none of them.",
    "Go on, have a rummage!"
  ],
  afterStarter: [
    "{STARTER}! Oh, that's a good one. Bold choice.",
    "*{RIVAL} is hiding his phone screen to conceal a Pokémon Type Effectiveness Chart.",
    "*{RIVAL} grabs a ball of his own, smirking at you as he does."
  ],
  /* Extra lines for guests who said 1 or 2. Purely additive — everybody sees
     the normal script, these just get folded in at the right moments. Set a
     block to [] to switch that bit of hand-holding off. */
  helpTypeChart: [
    "PEARL: A word, before he starts.",
    "PEARL: Every Pokémon has a type, and some types beat others. Water puts out fire, fire burns grass, grass soaks up water.",
    "PEARL: He's picked something whose type is strong against yours. That's what he's so pleased about.",
    "PEARL: But it's not the whole story! Hit him hard enough and type won't matter.",
    "PEARL: Now go ahead, knock that smile off his face!"
  ],
  helpFirstMenu: [
    "PEARL: Your moves are listed in the menu under your Pokémon. Each move can be used a certain number of times before it runs out of PP.",
    "PEARL: You may also see tags like 'SUPER' that tell you how well each move will land.",
    "PEARL: SUPER means your opponent's Pokémon is weak to that move. RESISTED means it affects them less. Pick one, and we'll see what happens."
  ],
  rivalTaunt: [
    "{RIVAL}: What a coincidence, this Pokémon seems to have a type advantage over yours.",
    "PEARL: {RIVAL}, those are research specimens—",
    "{RIVAL}: And I'm researching how to make {NAME} my bitch. {NAME}, let's battle. Right now.",
    "*{RIVAL} wants to battle!"
  ],
  /* Winning hands over the details the way a game hands over a key item.
     {STARTER} is the guest's pick, {PLUSSTARTER} the plus-one's.         */
  victory: [
    "{RIVAL}: ...Fine. You won. Enjoy it, it won't happen twice.",
    "*{RIVAL} handed over ₽280 for losing.",
    "PEARL: Well fought, {NAME}. Both of you.",
    "PEARL: Now, do you remember what I said before about my almost thirty years of research?",
    "PEARL: This battle was for more than just your little heated rivalry.",
    "*PROFESSOR PEARL produced a strange envelope.",
    "*{NAME} received the PARTY INVITE!",
    "*{NAME} put away the PARTY INVITE in the KEY ITEMS POCKET.",
    "PEARL: Go on. Open it."
  ],
  mercy: [
    "{RIVAL}: Okay. Stop. This is painful to watch.",
    "PEARL: {NAME}, dear. That was downright animal abuse.",
    "PEARL: Thankfully you have some time to train up before it really matters.",
    "*PROFESSOR PEARL produced a strange envelope anyway.",
    "*{NAME} received the PARTY INVITE!",
    "*{NAME} put away the PARTY INVITE in the KEY ITEMS POCKET.",
    "PEARL: Consider it a participation trophy. Open it."
  ],
  stalemate: [
    "PEARL: Right. I'm calling it.",
    "*PROFESSOR PEARL steps between the two Pokémon.",
    "PEARL: You've both made your point, and I've made a decision about my afternoon.",
    "PEARL: Nobody won. Everyone's tired. Come to the party anyway."
  ],
  defeat: [
    "{RIVAL}: Get up. That was embarrassing for both of us.",
    "PEARL: Your {STARTER} has been restored to full health. Try one more time, {NAME}. [[heal]]"
  ],

  /* After the battle, two separate things happen: the grandson gives the
     specimen back, and Pearl asks who's ACTUALLY coming with you. The
     grandson is a character; the plus-one is a real person. {RIVAL} is his
     name, {PLUSONE} is theirs.                                            */
  plusOneIntro: [
    "PEARL: One more thing.",
    "PEARL: Now. You're not walking into this journey alone, are you?"
  ],
  askPlusOne: "Who might come with you on the 21st?",
  plusOneSolo: "*Leave it blank if you're planning to fly solo.",
  askPlusOneKnow: [
    "PEARL: And {PLUSONE}--how much do they know about Pokémon?"
  ],
  askPlusOneKnowPrompt: "{PLUSONE}'s Pokémon knowledge",
  afterPlusOneName: [
    "PEARL: {PLUSONE}. Good. I'll set a place.",
    "{RIVAL}: Wait. Do I not get to come?",
    "PEARL: Oh my god, you're still here.",
    "PEARL: {RIVAL}, put that Pokémon back so that {PLUSONE} can pick their starter.",
    "*{RIVAL} reluctantly returns his partner Pokémon.",
    "PEARL: Go on, let's pick out a starter for {PLUSONE}. The crate's open."
  ],
  afterPlusOne: [
    "*{PLUSONE} chose {PLUSSTARTER}.",
    "PEARL: Settled. {NAME}, {PLUSONE}, and their partner Pokémon!",
    "PEARL: Here's your Trainer card--can you help me make sure I got everything right?"
  ],
  soloPath: [
    "PEARL: Ah, travelling light. More cake for you."
  ],

  /* The deep cut. Type MISSINGNO. into the crate's search box. */
  missingno: [
    "*The screen fills with garbage.",
    "PEARL: Put that DOWN.",
    "PEARL: ...Where did you even— no. No. We do not have that one.",
    "*Your ITEM in slot 6 has multiplied.",
    "*PROFESSOR PEARL does not acknowledge this."
  ],

  accepted: [
    "PEARL: Wonderful. I'll let the gym leaders know to expect you.",
    "PEARL: Feel free to wear something ridiculous. I intend to.",
    "*PROFESSOR PEARL has transformed into a Magikarp. [[karp]]",
    "PEARL: Your journey in the wonderful world of Pokémon begins November 21st.",
    "PEARL: Can't wait to see you there!"
  ],
  declined: [
    "PEARL: Ah, what a shame! You will be so missed!",
    "PEARL: The world of Pokémon will still be here for you if anything changes.",
    "*You can change your answer whenever you like."
  ],

  /* Shown when someone comes back to a saved RSVP. */
  welcomeBack: "Oh, {NAME}. Back already? Your trainer card is where you left it.",
  welcomeBackAnon: "Welcome back. Your trainer card is where you left it."
};
