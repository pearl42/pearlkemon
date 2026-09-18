YOUR ART GOES IN THIS FOLDER.
=============================

Already here:
  professor-pearl.png    Professor Pearl, resized to 900px tall and
                         palette-optimised (2.8 MB -> 96 KB)
  rival.webp             the grandson / plus-one stand-in
  pokemon/               534 Pokémon sprites, fetched by
                         tools/fetch-sprites.js. Don't edit these.

Optional, and the only art still missing:

  logo.png               A wordmark for the opening screen. If this file
                         exists it REPLACES the big text title ("A WILD
                         INVITATION APPEARED!"); if it doesn't, the text
                         title shows and nothing looks broken. Roughly
                         3:1, 600px wide is plenty.

  share.png              NOT wired up yet, but worth having: the preview
                         image that shows when the link is pasted into
                         iMessage, Instagram DM, Discord or Slack.
                         1200x630. Ask and it takes one line in
                         index.html (<meta property="og:image">).

  favicon.png            The browser tab icon. 32x32 or 180x180.

Anything missing renders as a labelled placeholder blob instead, so the
site never looks broken while art is in progress.

SPECS
  - PNG or WebP, with transparency. Both work.
  - People: tall is good. professor-pearl.png is 565x900, rival.webp is
    547x1023 — match that rough shape and the layout handles it.
  - Keep each under ~150 KB. If a file comes in heavy, resizing to 900px
    tall and quantising to ~160 colours is what was done to Pearl.

CHANGING FILENAMES
  Edit TRAINER_ART in js/config.js — the names here just have to match.
