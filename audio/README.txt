AUDIO GOES IN THIS FOLDER.
==========================

Everything is optional — anything missing simply stays silent. The speaker
button in the top-left mutes it all and remembers the choice.

Filenames live in the AUDIO block of js/config.js.

IMPORTANT: .mid FILES DO NOT PLAY IN BROWSERS
---------------------------------------------
No browser can play a MIDI file from an <audio> tag — it needs a synthesiser
and an instrument bank. The .mid files you added were rendered to mp3 with
fluidsynth and a General MIDI soundfont, trimmed of silence, loudness-matched
and encoded mono:

  intro.mid          ->  music/intro.mp3          42s   572 KB
  victory.mid        ->  music/victory.mp3        32s   436 KB
  keyitem.mid        ->  music/keyitem.mp3       2.8s    40 KB
  Low_HP_Alarm.mid   ->  sfx/low-hp-alt.mp3      8.3s   100 KB  (unused spare)

Your original .mid files are still in this folder, ignored by the site. If you
want a different instrument sound, re-render them rather than re-recording.

WHAT'S WORKING NOW
------------------
  music/intro.mp3          title screen AND Professor Pearl's dialogue — one
                           track, and it does NOT restart between the two
  music/rival-battle.mp3   the battle          109s  1.5 MB
  music/victory.mp3        loops from the win until the key item fanfare
  music/keyitem.mp3        one-shot fanfare as she hands the invite over,
                           then victory resumes underneath
  sfx/text-blip.mp3        every line of dialogue, and standing in for the
                           button beep until a real one turns up
  sfx/low-hp.mp3           LOOPS while your Pokemon is under 20% HP, and
                           stops on faint or when the battle ends

STILL MISSING, MOST NOTICEABLE FIRST
------------------------------------
  1. sfx/ball-open.mp3   Opening a Poke Ball in the crate. This is the single
                         most-repeated action in the whole invite and it's
                         silent. Biggest win available.
  2. sfx/hit-normal.mp3  The battle has no impact sound at all. Three files
     sfx/hit-super.mp3   is ideal; one generic hit would still transform it.
     sfx/hit-weak.mp3
  3. sfx/select.mp3      A real confirm beep, distinct from the text blip.
  4. sfx/faint.mp3       When a Pokemon goes down.
  5. music/crate.mp3     Choosing a Pokemon. Without it the lab track plays
                         on, which is fine — this is polish.
  6. music/details.mp3   The trainer card. Same: the victory theme carries
                         over, which honestly works.
  7. sfx/save.mp3        The RSVP being sent. Least noticeable.

CRIES — DONE
------------
  All 267 are in audio/cries/, named by slug (bulbasaur.mp3, mr-mime.mp3,
  nidoran-f.mp3 ...). 2.3 MB for the lot. They play when a ball opens in the
  crate, when either Pokemon is sent out, and when one faints.

  These are the LEGACY cries — the original Game Boy ones, not the modern
  re-recordings. They suit a GBA-styled invite much better.

  Source note: play.pokemonshowdown.com is blocked by this workspace's egress
  proxy, so tools/fetch-cries.js now pulls from PokeAPI's own cries repo on
  GitHub instead, which isn't. It fetches .ogg; Safari's Ogg support is patchy
  so they were converted to mp3. The README inside that script has the one
  ffmpeg line if you ever need to redo it.

SIZE
----
  Music is the heaviest thing on the page — the battle track alone is bigger
  than all 534 sprites combined. Keep loops short, mono, 96-128 kbps.
  Current total: about 4.9 MB, of which 2.3 MB is cries and 1.5 MB is the
  battle track.
