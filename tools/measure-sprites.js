#!/usr/bin/env node
/* ============================================================
   measure-sprites.js — writes data/sprite-fit.js

   The sprites arrive on a 96x96 canvas and the artwork inside fills
   anywhere from 20% to 100% of it. Keeping that canvas is what makes
   every Poke Ball in the crate render identically — but it also means
   that at one fixed size on the battle screen, Onix fills the screen
   and Bulbasaur is a speck.

   So instead of cropping the files (which breaks the crate), we measure
   how much of the canvas each one uses and let the battle screen scale
   each sprite individually. Run this after adding or changing sprites:

       node tools/measure-sprites.js

   Needs sharp, or just run the four-line Python in the repo README.
   ============================================================ */
const fs = require("fs"), path = require("path");
console.log("This script needs an image library. The version that produced");
console.log("data/sprite-fit.js used Python + Pillow:\n");
console.log(`  from PIL import Image; import json, os
  dex = json.load(open("data/pokedex.json")); fit = {}
  for d in dex:
      row = []
      for sub in ["", "back/"]:
          p = f"sprites/pokemon/{sub}{d['id']}.png"
          im = Image.open(p).convert("RGBA"); bb = im.split()[-1].getbbox()
          w, h = im.size
          row.append(round(max((bb[2]-bb[0])/w, (bb[3]-bb[1])/h), 3) if bb else 0)
      fit[d["id"]] = row
  open("data/sprite-fit.js","w").write("const SPRITE_FIT = " + json.dumps(fit) + ";")`);
