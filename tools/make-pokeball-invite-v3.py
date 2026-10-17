#!/usr/bin/env python3
"""
Print-cut-fold Poke Ball invitation. Opens at the band; the button is the latch.

THE PROBLEM THIS VERSION SOLVES. A buttonhole puts the slit at the button's
rim -- that is simply where the neck bends through -- so v2 hid the slit by
making the band taller than the button. Wrong way round: a Poke Ball's button
is bigger than its band. The fix is to stop asking the band to hide the slit
and print a dark ring at the button's rim instead. The slit is cut inside that
ring, the paper button lands on top of it, and anything that peeks out reads as
the button's own outline. Band and button are then free to be any size, so:

    band    0.12 D      thin, as it should be
    button  0.20 D      and proudly larger than the band

THE PIECE. A middle disc, a red upper half hinged on a chord at +0.36 D, a
white lower half hinged at -0.36 D. Both fold inwards over the middle; they
overlap by 0.06 D just below the band, white underneath. A paper disc on the
white half pushes up through the slit in the red half and lies flat on the
front. That disc is the whole latch.

The inside is deliberately left empty -- Poley is doing that part.

WHY IT PRINTS BOTH SIDES. A flap folding over the middle shows its own back,
so the red half's artwork lives on the reverse. Only that one flap does. Every
boundary across a fold is red-to-red or white-to-white with 3mm of bleed, and
the one registration-sensitive mark -- the button's ring -- is a 2mm stroke
sitting under the paper disc, so a millimetre of duplex drift just thickens one
side of an outline.

Usage:  python3 make-pokeball-invite-v3.py <out-prefix> [ball-inches]
"""
import sys
from shapely.geometry import box, Point
from shapely.ops import unary_union
from shapely import affinity

INK   = "#2b2f3a"
RED   = "#d94f4f"
GUIDE = "#b9bcc4"
SLIT  = "#8c93a0"

PAGE_W, PAGE_H = 215.9, 279.4

F_HINGE  = 0.36     # both hinges, as chords of the middle disc
F_Y_R    = -0.20    # how far down the red half reaches, closed
F_Y_W    = -0.14    # how far up the white half reaches: 0.06 D of overlap
F_BAND   = 0.12
F_BTN    = 0.20     # the paper disc. Larger than the band, as it must be
F_SLIT   = 0.82     # x button: it has to bend through, then catch coming back
F_NECK_L = 0.04
F_NECK_W = 0.075
RING_IN  = 1.5      # how far the printed ring runs UNDER the paper disc
RING_PAD = 0.6      # and how far it clears the ends of the slit
BLEED    = 3.0


def ring_path(ring):
    return "M " + " L ".join(f"{x:.3f},{-y:.3f}" for x, y in ring.coords) + " Z"


def poly_path(geom):
    geoms = geom.geoms if geom.geom_type == "MultiPolygon" else [geom]
    out = []
    for g in geoms:
        out.append(ring_path(g.exterior))
        for i in g.interiors:
            out.append(ring_path(i))
    return " ".join(out)


class Unit:
    def __init__(self, D):
        self.D = D
        self.r = r = D / 2
        self.h = h = F_HINGE * D
        self.y_r, self.y_w = F_Y_R * D, F_Y_W * D
        self.bh, self.btn = F_BAND * D, F_BTN * D
        self.slit = F_SLIT * self.btn
        self.neck_l, self.neck_w = F_NECK_L * D, F_NECK_W * D

        self.base = Point(0, 0).buffer(r, quad_segs=128)

        # each half is its own covered slice, mirrored about its hinge, so the
        # closed silhouette comes back to a circle
        self.red = affinity.scale(
            self.base.intersection(box(-r, self.y_r, r, h)), 1, -1, origin=(0, h))
        self.white = affinity.scale(
            self.base.intersection(box(-r, -h, r, self.y_w)), 1, -1, origin=(0, -h))

        # the slit sits at the button's rim; the button lands centred on the ball
        self.slit_y_folded = -self.btn / 2
        self.slit_y = 2 * h - self.slit_y_folded            # flat, in the red half

        self.white_edge = -2 * h - self.y_w                 # flat far edge of the white half
        self.neck = box(-self.neck_w / 2, self.white_edge - self.neck_l,
                        self.neck_w / 2, self.white_edge + 0.8)
        self.btn_cy = self.white_edge - self.neck_l - self.btn / 2
        self.disc = Point(0, self.btn_cy).buffer(self.btn / 2, quad_segs=96)

        # The ring has one job besides looking like a button: swallow the slit.
        # Its outer edge must clear the slit's ENDS, which sit further from the
        # centre than the slit itself -- that is what v3's first pass got wrong.
        self.ring_in = self.btn / 2 - RING_IN
        self.ring_out = ((self.slit / 2) ** 2 + (self.btn / 2) ** 2) ** 0.5 + RING_PAD

        self.die = unary_union([self.base, self.red, self.white, self.neck, self.disc])
        self.bounds = self.die.bounds

    def verify(self):
        """Fold it in software before anyone folds it in paper."""
        back = lambda g, s: affinity.scale(g, 1, -1, origin=(0, s))
        red_f, white_f = back(self.red, self.h), back(self.white, -self.h)
        covered = unary_union([red_f, white_f])
        middle = self.base.intersection(box(-self.r, -self.h, self.r, self.h))
        disc_c = back(self.disc, -self.h).centroid
        return {
            "uncovered mm2": round(middle.difference(covered).area, 2),
            "outside the ball mm2": round(covered.difference(self.base.buffer(0.01)).area, 2),
            "overlap mm2": round(red_f.intersection(white_f).area, 1),
            "button centre": (round(disc_c.x, 2), round(disc_c.y, 2)),
            "button vs band": f"{self.btn:.1f} vs {self.bh:.1f} mm",
            "catch each side mm": round((self.btn - self.slit) / 2, 2),
            "ring covers slit ends by mm": round(
                self.ring_out - ((self.slit/2)**2 + (self.btn/2)**2) ** 0.5, 2),
            "ring under disc by mm": round(self.btn / 2 - self.ring_in, 2),
            "inside, usable": f"{2*(self.r**2 - self.h**2)**0.5:.0f} x {2*self.h:.0f} mm",
        }

    # ---- the two printed sides -----------------------------------------
    def front(self, uid):
        r, D, h = self.r, self.D, self.h
        a = []
        a.append(f'<path d="{poly_path(self.die)}" fill="#ffffff"/>')
        # the top cap, bled 2mm past the fold so a sloppy fold shows no sliver
        a.append(f'<path d="{poly_path(self.base.intersection(box(-r, h - 2, r, r + 1)))}" '
                 f'fill="{RED}"/>')
        a.append(f'<path d="{poly_path(self.die)}" fill="none" stroke="{INK}" '
                 f'stroke-width="0.6" stroke-linejoin="round"/>')
        for hh in (h, -h):
            half = (r ** 2 - hh ** 2) ** 0.5
            a.append(f'<line x1="{-half+0.5:.2f}" y1="{-hh:.2f}" x2="{half-0.5:.2f}" '
                     f'y2="{-hh:.2f}" stroke="{GUIDE}" stroke-width="0.4" '
                     f'stroke-dasharray="1.8 1.8"/>')
            for sgn in (-1, 1):
                a.append(f'<line x1="{sgn*(half+1.5):.2f}" y1="{-hh:.2f}" '
                         f'x2="{sgn*(half+5.5):.2f}" y2="{-hh:.2f}" stroke="{GUIDE}" '
                         f'stroke-width="0.4"/>')
        a.append(f'<line x1="{-self.slit/2:.2f}" y1="{-self.slit_y:.2f}" '
                 f'x2="{self.slit/2:.2f}" y2="{-self.slit_y:.2f}" stroke="{SLIT}" '
                 f'stroke-width="0.5" stroke-dasharray="1.4 1.4"/>')
        a.append(f'<text x="{self.slit/2 + 2.5:.2f}" y="{-self.slit_y + 1.1:.2f}" '
                 f'font-size="2.8" fill="{SLIT}" font-family="Helvetica, Arial, sans-serif">'
                 f'cut this slit</text>')
        return "\n".join(a)

    def back(self, uid):
        """The red half's artwork, in folded coordinates mapped back to flat."""
        D, h = self.D, self.h
        fold = lambda y: 2 * h - y
        grown = self.red.buffer(BLEED)
        s = [f'<defs><clipPath id="rf-{uid}"><path d="{poly_path(grown)}"/></clipPath></defs>',
             f'<g clip-path="url(#rf-{uid})">']
        for lo, hi, col in [(self.bh / 2, h + BLEED + 2, RED),
                            (-self.bh / 2, self.bh / 2, INK),
                            (self.y_r - BLEED - 2, -self.bh / 2, None)]:
            if col is None:
                continue
            y0, y1 = sorted((fold(lo), fold(hi)))
            s.append(f'<rect x="{-self.r-BLEED-2:.2f}" y="{-y1:.2f}" '
                     f'width="{2*(self.r+BLEED+2):.2f}" height="{y1-y0:.2f}" fill="{col}"/>')
        # the button's outline, straddling the rim the slit is cut at
        s.append(f'<circle cx="0" cy="{-fold(0):.2f}" '
                 f'r="{(self.ring_in + self.ring_out)/2:.2f}" fill="none" stroke="{INK}" '
                 f'stroke-width="{self.ring_out - self.ring_in:.2f}"/>')
        s.append('</g>')
        return "\n".join(s)


STEPS = [
    "1. Print both sides at 100% — actual size, flipping on the LONG edge.",
    "    Hold the sheet to a lamp: the corner crosses should sit on top of each other.",
    "2. Cut around the outside line. The whole invitation is one piece.",
    "3. Cut the marked slit in the upper half. Craft knife, not scissors.",
    "4. Score and fold the two dashed lines.",
    "5. Fold the lower (white) half up, then the upper (red) half down over it.",
    "6. Push the paper button up through the slit. It pops through, lies flat inside",
    "    its printed ring, and holds both halves shut. Pop it back out to open.",
]


REG = [(20, 20), (PAGE_W - 20, 20), (20, PAGE_H - 20), (PAGE_W - 20, PAGE_H - 20)]


def reg_marks():
    o = [f'<g stroke="{GUIDE}" stroke-width="0.3">']
    for x, y in REG:
        o.append(f'<line x1="{x-3}" y1="{y}" x2="{x+3}" y2="{y}"/>'
                 f'<line x1="{x}" y1="{y-3}" x2="{x}" y2="{y+3}"/>')
    o.append('</g>')
    return "".join(o)


def notes(x, y, extra=()):
    o = [f'<g font-family="Helvetica, Arial, sans-serif" fill="{GUIDE}">']
    for i, line in enumerate(list(STEPS) + list(extra)):
        o.append(f'<text x="{x}" y="{y + i*4.4:.2f}" font-size="3.1">{line}</text>')
    o.append('</g>')
    ry = y + (len(STEPS) + len(extra)) * 4.4 + 6
    o.append(f'<g stroke="{GUIDE}" stroke-width="0.4" fill="none">'
             f'<line x1="{x}" y1="{ry:.2f}" x2="{x+50}" y2="{ry:.2f}"/>'
             f'<line x1="{x}" y1="{ry-2:.2f}" x2="{x}" y2="{ry+2:.2f}"/>'
             f'<line x1="{x+50}" y1="{ry-2:.2f}" x2="{x+50}" y2="{ry+2:.2f}"/></g>'
             f'<text x="{x+53}" y="{ry+1.1:.2f}" font-size="3.1" fill="{GUIDE}" '
             f'font-family="Helvetica, Arial, sans-serif">50 mm — check your print scale</text>')
    return "\n".join(o)


def page(body, label=None):
    return "\n".join([
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{PAGE_W}mm" height="{PAGE_H}mm" '
        f'viewBox="0 0 {PAGE_W} {PAGE_H}">',
        f'<rect width="{PAGE_W}" height="{PAGE_H}" fill="#ffffff"/>',
        body, reg_marks(),
        (f'<text x="{PAGE_W/2}" y="{PAGE_H-8}" text-anchor="middle" font-size="3.1" '
         f'fill="{GUIDE}" font-family="Helvetica, Arial, sans-serif">{label}</text>'
         if label else ""),
        '</svg>'])


def main():
    prefix = sys.argv[1] if len(sys.argv) > 1 else "pokeball"
    inches = float(sys.argv[2]) if len(sys.argv) > 2 else 3.5
    D = inches * 25.4
    u = Unit(D)
    print("fold check:", u.verify())

    minx, miny, maxx, maxy = u.bounds
    w, h = maxx - minx, maxy - miny
    gut = 8.0
    x0 = (PAGE_W - (2 * w + gut)) / 2
    xs = [x0 + w / 2, x0 + w + gut + w / 2]
    top = 14.0
    cy = top + maxy

    inside = u.verify()["inside, usable"]
    front = [f'<g transform="translate({x:.3f},{cy:.3f})">{u.front(f"f{i}")}</g>'
             for i, x in enumerate(xs)]
    front.append(notes(15, top + h + 22,
                       extra=("", f"The middle disc is left blank on purpose — "
                                  f"about {inside} of it stays hidden when closed.")))
    open(f"{prefix}-front.svg", "w").write(
        page("\n".join(front), "FRONT — cut from this side"))

    back = ['<g transform="translate(%.1f,0) scale(-1,1)">' % PAGE_W]
    for i, x in enumerate(xs):
        back.append(f'<g transform="translate({x:.3f},{cy:.3f})">{u.back(f"b{i}")}</g>')
    back.append('</g>')
    back.append(f'<text x="{PAGE_W/2}" y="{top + h + 30:.2f}" text-anchor="middle" '
                f'font-size="3.4" fill="{GUIDE}" font-family="Helvetica, Arial, sans-serif">'
                f'BACK — the red half&#8217;s artwork. Nothing here is cut.</text>')
    open(f"{prefix}-back.svg", "w").write(
        page("\n".join(back), "BACK — prints on the reverse, flipped on the long edge"))
    print(f"unit {w:.1f} x {h:.1f} mm, ball {inches} in, two per sheet")


if __name__ == "__main__":
    main()
