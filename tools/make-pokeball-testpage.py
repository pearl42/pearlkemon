#!/usr/bin/env python3
"""
One Letter page: a single black, red and white piece, enough to build one
test ball. Print on plain paper at 100%, cut, and see whether the latch bites
before committing the foil stock.

Usage:  python3 make-pokeball-testpage.py <out.svg> [ball-inches]
"""
import sys, importlib.util
from shapely import affinity

HERE = __file__.rsplit("/", 1)[0]
spec = importlib.util.spec_from_file_location("cs", f"{HERE}/make-pokeball-cardstock.py")
cs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cs)
OVER = cs.OVER

PAGE_W, PAGE_H = 215.9, 279.4
INK, GUIDE, MARK = "#1a1a1a", "#9aa0ab", "#d24b6a"
F = 'font-family="Helvetica, Arial, sans-serif"'


def txt(x, y, s, size=3.2, col=GUIDE, anchor="start", w="normal"):
    return (f'<text x="{x:.2f}" y="{y:.2f}" text-anchor="{anchor}" font-size="{size}" '
            f'fill="{col}" font-weight="{w}" {F}>{s}</text>')


def place(geom, cx, top):
    """Position a shape with its visual top edge at `top`; return (ox, oy, w, h)."""
    minx, miny, maxx, maxy = geom.bounds
    return cx, top + maxy, maxx - minx, maxy - miny


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "pokeball-test.svg"
    inches = float(sys.argv[2]) if len(sys.argv) > 2 else 3.5
    B = cs.Ball(inches * 25.4)

    cut = lambda g: (f'<path d="{cs.poly_path(g)}" fill="none" stroke="{INK}" '
                     f'stroke-width="0.4" stroke-linejoin="round"/>')
    dash = lambda x1, y1, x2, y2: (f'<line x1="{x1:.2f}" y1="{y1:.2f}" x2="{x2:.2f}" '
                                   f'y2="{y2:.2f}" stroke="{MARK}" stroke-width="0.4" '
                                   f'stroke-dasharray="2 2"/>')

    o = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{PAGE_W}mm" height="{PAGE_H}mm" '
         f'viewBox="0 0 {PAGE_W} {PAGE_H}">',
         f'<rect width="{PAGE_W}" height="{PAGE_H}" fill="#ffffff"/>']

    # ---- BLACK, left column ---------------------------------------------
    ox, oy, bw, bh_ = place(B.black, 58, 8)
    g = [cut(B.black)]
    for hh in (B.f, -B.f):
        half = (B.r ** 2 - hh ** 2) ** 0.5
        g.append(dash(-half, -hh, half, -hh))
    g.append(f'<line x1="{-B.slit/2:.2f}" y1="{-B.slit_flat:.2f}" x2="{B.slit/2:.2f}" '
             f'y2="{-B.slit_flat:.2f}" stroke="{MARK}" stroke-width="0.7"/>')
    g.append(txt(B.slit / 2 + 3, -B.slit_flat + 1.1, "slit — cut right through", 2.9, MARK))
    g.append(txt(0, 1.5, "BLACK", 4.2, GUIDE, "middle", "bold"))
    g.append(txt(0, 7, "this face is the inside", 2.9, GUIDE, "middle"))
    o.append(f'<g transform="translate({ox:.2f},{oy:.2f})">' + "\n".join(g) + '</g>')

    # ---- RED, top right --------------------------------------------------
    ox, oy, rw, rh = place(B.red, 152, 14)
    o.append(f'<g transform="translate({ox:.2f},{oy:.2f})">{cut(B.red)}</g>')
    o.append(txt(152, 14 + rh * 0.42, "RED", 4.2, GUIDE, "middle", "bold"))

    # ---- WHITE, below it -------------------------------------------------
    wtop = 14 + rh + 12
    ox, oy, ww, wh = place(B.white, 152, wtop)
    g = [cut(B.white),
         dash(-cs.NECK_W / 2 - 5, -B.white_fold, cs.NECK_W / 2 + 5, -B.white_fold)]
    g.append(txt(cs.NECK_W / 2 + 6, -B.white_fold + 1.0, "fold here, after", 2.9, MARK))
    g.append(txt(cs.NECK_W / 2 + 6, -B.white_fold + 4.4, "it is through", 2.9, MARK))
    o.append(f'<g transform="translate({ox:.2f},{oy:.2f})">' + "\n".join(g) + '</g>')
    o.append(txt(152, wtop + wh * 0.62, "WHITE", 4.2, GUIDE, "middle", "bold"))

    # ---- assembled thumbnail, right column, under the white --------------
    s = 0.33
    sc = lambda gg: affinity.scale(gg, s, s, origin=(0, 0))
    ty = wtop + wh + 16 + B.r * s
    layers = "\n".join(f'<path d="{cs.poly_path(sc(g))}" fill="{col}"/>'
                       for g, col in B.assembled())
    o.append(f'<g transform="translate(152,{ty:.2f})">' + layers + '</g>')
    o.append(txt(152, ty + B.r * s + 6, "what it should come to", 2.9, GUIDE, "middle"))

    # ---- the crib, bottom ------------------------------------------------
    # Helvetica runs about half the font size per character, so at 3.2mm keep
    # every line under ~115 characters or it walks off the right edge.
    y = 8 + bh_ + 5
    o.append(txt(14, y, "BUILD ONE", 4.2, INK, "start", "bold")); y += 6.2
    for line in [
        "1. Cut all three out. Cut the slit in the black with a knife \u2014 it is a cut, not a fold.",
        "2. Score the black on both dashed lines, fold both halves FORWARD onto the middle disc, then",
        "     open them again. That tells you which face of each half ends up on the outside.",
        "3. Glue the red to the outward face of the upper half and the white to the outward face of the",
        f"     lower half. Line the red\u2019s bite up with the black\u2019s round lobe \u2014 then the {OVER:.0f} mm of colour",
        "     hanging past the black lands evenly. Leave the white\u2019s tongue unglued.",
        "4. Fold the white half forward first, then the red half forward over it.",
        "5. Feed the tongue up BEHIND the red half, through the slit, and fold it back down on its dashed",
        "     line. The disc lands in the middle and holds both halves shut.",
    ]:
        o.append(txt(14, y, line, 3.2)); y += 4.0

    y += 2
    o.append(txt(14, y, "WHAT TO WATCH FOR", 4.2, INK, "start", "bold")); y += 6.2
    for line in [
        f"Slit {B.slit:.1f} mm, button {B.btn:.1f} mm \u2014 {(B.btn-B.slit)/2:.1f} mm of catch a side. If the disc will not go",
        "     through, lengthen the slit 1 mm at a time; if it falls back out, shorten it.",
        f"No black should show at the rim: the colour overhangs it by {OVER:.0f} mm. If any does, the colour is",
        f"     more than {OVER:.0f} mm out of place \u2014 tell me and I will widen the overhang.",
        f"Neck {B.neck_hinge:.1f} mm at each hinge \u2014 tell me if it feels like it will tear in heavier stock.",
        "Foil can crack along a fold: score it properly first, and fold away from the foil side.",
    ]:
        o.append(txt(14, y, line, 3.2)); y += 4.0

    # scale bar
    y += 3
    o.append(f'<g stroke="{GUIDE}" stroke-width="0.4" fill="none">'
             f'<line x1="14" y1="{y:.2f}" x2="64" y2="{y:.2f}"/>'
             f'<line x1="14" y1="{y-2:.2f}" x2="14" y2="{y+2:.2f}"/>'
             f'<line x1="64" y1="{y-2:.2f}" x2="64" y2="{y+2:.2f}"/></g>')
    o.append(txt(67, y + 1.1, "50 mm — print at 100%, actual size, no “fit to page”", 3.2))
    o.append('</svg>')
    open(out, "w").write("\n".join(o))
    print(f"black {bw:.0f}x{bh_:.0f}  red {rw:.0f}x{rh:.0f}  white {ww:.0f}x{wh:.0f} mm; "
          f"crib ends at {y+4:.0f} of {PAGE_H:.0f}")


if __name__ == "__main__":
    main()
