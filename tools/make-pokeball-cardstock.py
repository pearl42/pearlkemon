#!/usr/bin/env python3
"""
Poke Ball invitation cut from three sheets of cardstock: black, red, white.

THE SHAPE. The red and white are plain halves with sharp corners, cut to the
FULL ball. The black is a core that stays OVER (4mm) inside them all round, so
from the front and from the back the colour overhangs it and a wobbly cut or a
slightly askew piece hides itself. The band is the black showing between the
two halves, and because the core is inset it stops short of the rim: at each
end of the band the outline opens into a small gap, 4mm deep. That gap is
deliberate -- nothing fills it.

THE RING COSTS NOTHING. The black around the button is two halves of the same
core. Its upper half is the top flap showing through a circular bite in the
red -- the only bite either colour piece carries. Its lower half is that same
flap dipping below the band and lying ON TOP of the white, which needs no bite
at all because it sits underneath. So the band can stay thin (10.7mm) while
the button stays big (17.8mm) with 4mm of black all round it.

THE THREE PIECES

  BLACK   one folding piece: a core disc with a flap hinged above and below on
          a slim neck, both folding FORWARD onto the core. The top flap's lower
          edge is the band's bottom, with a round lobe at the centre.

  RED     the upper half, one circular bite for the ring.

  WHITE   the lower half, plain, plus a tongue: a neck and a disc. The disc is
          the button.

THE LATCH is Poley's: the tongue runs up BEHIND the top flap, through the slit,
and folds back down over it. The disc lands dead centre, wider than the slit it
came through, holding both halves shut. Arriving from behind and doubling back
is what puts the slit ABOVE the button's centre, inside the red's bite, instead
of below it in the band.

Usage:  python3 make-pokeball-cardstock.py <out-prefix> [ball-inches]
"""
import sys
from shapely.geometry import box, Point, LineString
from shapely.ops import unary_union
from shapely import affinity

BLACK = "#15151a"
RED   = "#c3122a"
WHITE = "#f4f4f2"
GUIDE = "#9aa0ab"
MARK  = "#d24b6a"

PAGE_W, PAGE_H = 215.9, 279.4

F_NECK  = 0.17      # the black hinge, as a chord of the core
F_BAND  = 0.12      # the band: the gap between the two halves
F_BTN   = 0.20      # the white button
OVER    = 4.0       # colour overhangs the black by this, all round
RING    = 4.0       # black showing around the button
F_SLIT  = 0.82      # x button
NECK_W  = 7.0
BOT_REACH = 6.0     # the bottom flap runs this far past centre, behind the top
                    # flap, so a low-placed white backs onto black, not a hole
FILLET  = 1.2

def ring_path(c):
    return "M " + " L ".join(f"{x:.3f},{-y:.3f}" for x, y in c.coords) + " Z"


def poly_path(g):
    gs = g.geoms if g.geom_type in ("MultiPolygon", "GeometryCollection") else [g]
    out = []
    for p in gs:
        if p.is_empty or p.geom_type != "Polygon":
            continue
        out.append(ring_path(p.exterior))
        for i in p.interiors:
            out.append(ring_path(i))
    return " ".join(out)


class Ball:
    def __init__(self, D):
        self.D = D
        self.r = r = D / 2                         # the ball: colour only
        self.r_blk = rb = r - OVER                 # the core, hiding inside it
        self.bh = F_BAND * D
        self.btn = F_BTN * D
        self.slit = F_SLIT * self.btn
        self.r_op = self.btn / 2 + RING            # the ring's outer edge
        self.neck_hinge = F_NECK * D
        self.f = f = (rb ** 2 - (self.neck_hinge / 2) ** 2) ** 0.5
        self.slit_y = self.btn / 2                 # the button's UPPER rim

        ball = Point(0, 0).buffer(r, quad_segs=160)
        self.ball = ball
        self.core = Point(0, 0).buffer(rb, quad_segs=160)
        self.op = Point(0, 0).buffer(self.r_op, quad_segs=96)

        # --- black ---------------------------------------------------------
        # The flap's lower edge is the band's bottom, plus the lobe that makes
        # the ring's lower half. It lies ON the white, which is why the white
        # needs no bite of its own.
        top_cover = unary_union([
            self.core.intersection(box(-rb, -self.bh / 2, rb, f)),
            self.op.intersection(self.core)])
        self.top = affinity.scale(top_cover, 1, -1, origin=(0, f))
        bot_cover = self.core.intersection(box(-rb, -f, rb, BOT_REACH))
        self.bot = affinity.scale(bot_cover, 1, -1, origin=(0, -f))
        die = unary_union([self.core, self.top, self.bot])
        self.black = die.buffer(FILLET, quad_segs=24).buffer(-FILLET, quad_segs=24)
        self.slit_flat = 2 * f - self.slit_y

        # --- red: plain upper half, one bite for the ring -------------------
        self.red = ball.intersection(box(-r, self.bh / 2, r, r)).difference(self.op)

        # --- white: plain lower half, plus the tongue -----------------------
        body = ball.intersection(box(-r, -r, r, -self.bh / 2))
        neck = box(-NECK_W / 2, -self.bh / 2 - 0.8, NECK_W / 2, self.slit_y + 1.2)
        disc = Point(0, self.slit_y + self.btn / 2).buffer(self.btn / 2, quad_segs=96)
        self.white = unary_union([body, neck, disc]) \
            .buffer(0.9, quad_segs=24).buffer(-0.9, quad_segs=24)
        self.white_fold = self.slit_y

    def checks(self):
        from shapely.ops import unary_union as uu
        seen = uu([g for g, _ in self.assembled()])
        halfw = (self.r_op ** 2 - self.slit_y ** 2) ** 0.5
        gap_w = self.r - (self.r_blk ** 2 - (self.bh / 2) ** 2) ** 0.5
        return {
            "ball (colour only) mm": round(2 * self.r, 1),
            "black core mm": round(2 * self.r_blk, 1),
            "colour overhangs black by mm": OVER,
            "band mm": round(self.bh, 1),
            "button mm": round(self.btn, 1),
            "button bigger than band by mm": round(self.btn - self.bh, 1),
            "ring around button mm": RING,
            "gap at each end of the band mm": round(gap_w, 2),
            "button centre once folded": round(self.slit_y - self.btn / 2, 2),
            "slit fits inside the bite by mm": round(halfw - self.slit / 2, 2),
            "catch each side mm": round((self.btn - self.slit) / 2, 2),
            "hinge width mm": round(self.neck_hinge, 1),
            "colour outside the ball mm2": round(seen.difference(self.ball).area, 2),
        }

    def assembled(self):
        """Every layer in the order it is seen, back to front."""
        b = lambda g, s: affinity.scale(g, 1, -1, origin=(0, s))
        btn = Point(0, self.slit_y - self.btn / 2).buffer(self.btn / 2, quad_segs=96)
        return [(self.core, BLACK), (b(self.bot, -self.f), BLACK),
                (self.white, WHITE), (b(self.top, self.f), BLACK),
                (self.red, RED), (btn, WHITE)]

    def reverse(self):
        """Turned over: the core is nearest, colour peeking out all round."""
        return [(self.red, RED), (self.white, WHITE), (self.core, BLACK)]


def sheet(parts, label):
    return "\n".join([
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{PAGE_W}mm" height="{PAGE_H}mm" '
        f'viewBox="0 0 {PAGE_W} {PAGE_H}">',
        f'<rect width="{PAGE_W}" height="{PAGE_H}" fill="#ffffff"/>',
        "\n".join(parts),
        f'<text x="{PAGE_W/2}" y="{PAGE_H-9}" text-anchor="middle" font-size="3.2" '
        f'fill="{GUIDE}" font-family="Helvetica, Arial, sans-serif">{label}</text>',
        '</svg>'])


def main():
    prefix = sys.argv[1] if len(sys.argv) > 1 else "cardstock"
    inches = float(sys.argv[2]) if len(sys.argv) > 2 else 3.5
    B = Ball(inches * 25.4)
    for k, v in B.checks().items():
        print(f"  {k}: {v}")

    cut = lambda g: (f'<path d="{poly_path(g)}" fill="none" stroke="{BLACK}" '
                     f'stroke-width="0.4" stroke-linejoin="round"/>')

    # ---- BLACK: two per sheet ------------------------------------------
    minx, miny, maxx, maxy = B.black.bounds
    w, h = maxx - minx, maxy - miny
    parts = []
    for i, cx in enumerate(((PAGE_W - (2 * w + 9)) / 2 + w / 2,
                            (PAGE_W - (2 * w + 9)) / 2 + w * 1.5 + 9)):
        cy = 14 + maxy
        g = [cut(B.black)]
        for hh, lab in ((B.f, "fold"), (-B.f, "fold")):
            half = (B.r ** 2 - hh ** 2) ** 0.5
            g.append(f'<line x1="{-half:.2f}" y1="{-hh:.2f}" x2="{half:.2f}" y2="{-hh:.2f}" '
                     f'stroke="{MARK}" stroke-width="0.4" stroke-dasharray="2 2"/>')
        g.append(f'<line x1="{-B.slit/2:.2f}" y1="{-B.slit_flat:.2f}" '
                 f'x2="{B.slit/2:.2f}" y2="{-B.slit_flat:.2f}" stroke="{MARK}" '
                 f'stroke-width="0.6"/>')
        g.append(f'<text x="{B.slit/2+3:.2f}" y="{-B.slit_flat+1.1:.2f}" font-size="2.9" '
                 f'fill="{MARK}" font-family="Helvetica, Arial, sans-serif">slit</text>')
        parts.append(f'<g transform="translate({cx:.2f},{cy:.2f})">' + "\n".join(g) + '</g>')
    parts.append(f'<text x="14" y="{14 + h + 14:.1f}" font-size="3.2" fill="{GUIDE}" '
                 f'font-family="Helvetica, Arial, sans-serif">'
                 f'BLACK — 2 per sheet. Dashed = score and fold forward. Cut the short slit; it is the '
                 f'buttonhole. The core is 4 mm smaller than the ball all round, so the colour covers it.</text>')
    open(f"{prefix}-black.svg", "w").write(sheet(parts, "BLACK cardstock"))

    # ---- RED and WHITE: nested grids ------------------------------------
    for name, geom, cols, rows in (("red", B.red, 2, 6), ("white", B.white, 2, 3)):
        minx, miny, maxx, maxy = geom.bounds
        w, h = maxx - minx, maxy - miny
        gx = (PAGE_W - cols * w) / (cols + 1)
        gy = (PAGE_H - 26 - rows * h) / (rows + 1)
        parts = []
        for i in range(cols):
            for j in range(rows):
                cx = gx + i * (w + gx) + (0 - minx)
                cy = 12 + gy + j * (h + gy) + maxy
                g = [cut(geom)]
                if name == "white":
                    g.append(f'<line x1="{-NECK_W/2-4:.2f}" y1="{-B.white_fold:.2f}" '
                             f'x2="{NECK_W/2+4:.2f}" y2="{-B.white_fold:.2f}" '
                             f'stroke="{MARK}" stroke-width="0.4" stroke-dasharray="2 2"/>')
                parts.append(f'<g transform="translate({cx:.2f},{cy:.2f})">'
                             + "\n".join(g) + '</g>')
        note = ("RED — the full upper half of the ball. The bite is the band and the button\u2019s ring."
                if name == "red" else
                "WHITE — the full lower half, reaching a little past centre so the red laps over it. "
                "The tongue folds on the dashed line once it is through the slit.")
        parts.append(f'<text x="14" y="{PAGE_H-16:.1f}" font-size="3.2" fill="{GUIDE}" '
                     f'font-family="Helvetica, Arial, sans-serif">{note}</text>')
        open(f"{prefix}-{name}.svg", "w").write(sheet(parts, f"{name.upper()} cardstock"))

    print(f"black unit {w:.0f}mm wide; three files written with prefix {prefix}-")


if __name__ == "__main__":
    main()
