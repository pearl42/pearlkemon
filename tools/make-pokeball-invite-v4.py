#!/usr/bin/env python3
"""
Print-cut-fold Poke Ball invitation -- the stacked net.

THE SHAPE (Poley's): three pieces up the sheet. A whole ball in the middle, a
red half above it, a white half below, each half overlapping the middle disc so
the hinge is a proper chord instead of a single point.

THE CONSEQUENCE, which is why this version is simple: the halves fold BACKWARD.
A flap folded forward shows its own blank back, which is what forced the last
two versions onto a duplex printer. Folded backward, all three printed faces
end up on show -- the middle disc is the front of the ball, and the two halves
meet behind it to make the ball again on the back. ONE SIDE OF THE SHEET.

That is also why the net has ball artwork on all three pieces.

THE LATCH. The red half folds back first, the white half folds back over it.
A paper disc on the white half's edge pushes through a slit in the red half and
lies flat: the button on the back face, and the only thing holding the halves
shut. The slit sits at the button's rim -- that is where the paper bends -- so a
printed ring swallows it, which is also what a button's outline looks like.

Band 0.12 D, button 0.20 D, so the button is proudly bigger than the band.

The inside -- the back of the middle disc and the two halves' insides -- is left
blank on purpose.

Usage:  python3 make-pokeball-invite-v4.py <out-prefix> [ball-inches]
"""
import sys
from shapely.geometry import box, Point
from shapely.ops import unary_union
from shapely import affinity

INK   = "#1a1a1a"
RED   = "#cc0b0b"
GUIDE = "#b9bcc4"
SLIT  = "#8c93a0"

PAGE_W, PAGE_H = 215.9, 279.4

F_NECK   = 0.17     # the hinge, as a chord: slim, but enough to survive folding
FILLET   = 1.2      # the concave corners either side of that neck, rounded
F_Y_R    = -0.20    # how far past centre the red (outer) half reaches
F_Y_W    = -0.14    # ... and the white (inner) half: 0.06 D of overlap
F_BAND   = 0.12
F_BTN    = 0.20
F_SLIT   = 0.82     # x button
F_NECK_L = 0.04
F_NECK_W = 0.075
RING_IN  = 1.5      # how far the printed ring runs under the paper disc
RING_PAD = 0.6      # and how far it clears the ends of the slit
BLEED    = 3.0


def ring_path(r):
    return "M " + " L ".join(f"{x:.3f},{-y:.3f}" for x, y in r.coords) + " Z"


def poly_path(g):
    gs = g.geoms if g.geom_type == "MultiPolygon" else [g]
    out = []
    for p in gs:
        out.append(ring_path(p.exterior))
        for i in p.interiors:
            out.append(ring_path(i))
    return " ".join(out)


class Unit:
    def __init__(self, D):
        self.D = D
        self.r = r = D / 2
        # The hinge is a chord, so the fold line sits (r - f) below the top of
        # the ball and a flap can only ever cover what is BELOW its own fold.
        # A low fold line therefore flattens the ball: everything above it has
        # to come from the other panel. Slim neck -> fold line almost at the
        # apex -> the shortfall is a crescent a fraction of a millimetre deep.
        self.neck_w_hinge = F_NECK * D
        self.f = f = (r ** 2 - (F_NECK * D / 2) ** 2) ** 0.5
        self.cap = r - f
        self.y_r, self.y_w = F_Y_R * D, F_Y_W * D
        self.bh, self.btn = F_BAND * D, F_BTN * D
        self.slit = F_SLIT * self.btn
        self.neck_l, self.neck_w = F_NECK_L * D, F_NECK_W * D

        self.base = Point(0, 0).buffer(r, quad_segs=128)

        # each half is the slice of the ball it has to cover, mirrored about
        # its own hinge, so folded back it lands exactly on the silhouette
        # Each flap mirrors only the slice BETWEEN its fold line and where it
        # has to reach. Mirroring a slice that crosses the fold line puts flap
        # material on the disc's side of the crease, which is what made the
        # first cut of this design fold flat across the top.
        self.red = affinity.scale(
            self.base.intersection(box(-r, self.y_r, r, f)), 1, -1, origin=(0, f))
        self.white = affinity.scale(
            self.base.intersection(box(-r, -f, r, self.y_w)), 1, -1, origin=(0, -f))

        self.slit_y_folded = -self.btn / 2            # the button's rim
        self.slit_y = 2 * f - self.slit_y_folded      # ... in the red half, flat

        self.white_edge = -2 * f - self.y_w           # flat far edge of the white half
        self.neck = box(-self.neck_w / 2, -2 * f + self.slit_y_folded,
                        self.neck_w / 2, self.white_edge + 0.8)
        self.btn_cy = -2 * f                          # flat: lands dead centre
        self.disc = Point(0, self.btn_cy).buffer(self.btn / 2, quad_segs=96)

        self.ring_in = self.btn / 2 - RING_IN
        self.ring_out = ((self.slit / 2) ** 2 + (self.btn / 2) ** 2) ** 0.5 + RING_PAD

        die = unary_union([self.base, self.red, self.white, self.neck, self.disc])
        # round the notches either side of each neck: sharp concave corners are
        # where a fold starts to tear
        self.die = die.buffer(FILLET, quad_segs=24).buffer(-FILLET, quad_segs=24)
        self.bounds = self.die.bounds

    # ---- fold it in software before anyone folds it in paper -------------
    def verify(self):
        b = lambda g, s: affinity.scale(g, 1, -1, origin=(0, s))
        red_f, white_f = b(self.red, self.f), b(self.white, -self.f)
        covered = unary_union([red_f, white_f])
        disc_c = b(self.disc, -self.f).centroid
        return {
            "back face uncovered mm2": round(self.base.difference(covered).area, 2),
            "outside the ball mm2": round(covered.difference(self.base.buffer(0.01)).area, 2),
            "halves overlap mm2": round(red_f.intersection(white_f).area, 1),
            "button centre": (round(disc_c.x, 2), round(disc_c.y, 2)),
            "button vs band mm": f"{self.btn:.1f} vs {self.bh:.1f}",
            "catch each side mm": round((self.btn - self.slit) / 2, 2),
            "ring clears slit ends by mm": round(
                self.ring_out - ((self.slit / 2) ** 2 + (self.btn / 2) ** 2) ** 0.5, 2),
            "hinge width mm": round(self.neck_w_hinge, 1),
            "flat spot on the front mm": 0.0,
            "bare crescent on the back mm": round(self.cap, 2),
        }

    # ---- artwork ---------------------------------------------------------
    def _ball(self, uid, clip_to, y0, shift=0.0, flip=False, ring=True):
        """Ball colours drawn in folded coordinates, optionally mirrored back
        into a flap's flat frame. shift/flip describe that mirror."""
        r = self.r
        m = (lambda y: shift - y) if flip else (lambda y: y)
        s = [f'<defs><clipPath id="c{uid}"><path d="{poly_path(clip_to)}"/></clipPath></defs>',
             f'<g clip-path="url(#c{uid})">']
        for lo, hi, col in [(self.bh / 2, r + BLEED + 3, RED),
                            (-self.bh / 2, self.bh / 2, INK),
                            (-r - BLEED - 3, -self.bh / 2, None)]:
            if col is None:
                continue
            a, b = sorted((m(lo), m(hi)))
            s.append(f'<rect x="{-r-BLEED-3:.2f}" y="{-b:.2f}" width="{2*(r+BLEED+3):.2f}" '
                     f'height="{b-a:.2f}" fill="{col}"/>')
        if ring:
            cy = m(0)
            s.append(f'<circle cx="0" cy="{-cy:.2f}" r="{(self.ring_in+self.ring_out)/2:.2f}" '
                     f'fill="none" stroke="{INK}" stroke-width="{self.ring_out-self.ring_in:.2f}"/>')
            s.append(f'<circle cx="0" cy="{-cy:.2f}" r="{self.ring_in:.2f}" fill="#ffffff"/>')
        s.append('</g>')
        return "\n".join(s)

    def front(self, uid):
        """One printed side: the ball on the middle disc, and the red half's
        artwork for the back face. The white half stays bare paper."""
        r, f = self.r, self.f
        a = [f'<path d="{poly_path(self.die)}" fill="#ffffff"/>']

        # the middle disc: the face of the ball, with a decorative button
        a.append(self._ball(f"m{uid}", self.base, 0))
        a.append(f'<circle cx="0" cy="0" r="{self.btn/2 - 2.6:.2f}" fill="none" '
                 f'stroke="{INK}" stroke-width="0.7"/>')

        # the red half: same colours, mirrored about its hinge
        a.append(self._ball(f"r{uid}", self.red.buffer(BLEED), 0, shift=2 * f, flip=True))

        a.append(f'<path d="{poly_path(self.die)}" fill="none" stroke="{INK}" '
                 f'stroke-width="0.6" stroke-linejoin="round"/>')

        # the top crease lands on red, the bottom one on bare paper
        for h, col in ((f, "#ffffff"), (-f, SLIT)):
            half = (r ** 2 - h ** 2) ** 0.5
            a.append(f'<line x1="{-half+0.5:.2f}" y1="{-h:.2f}" x2="{half-0.5:.2f}" '
                     f'y2="{-h:.2f}" stroke="{col}" stroke-width="0.5" '
                     f'stroke-dasharray="2.0 2.0"/>')
            for sgn in (-1, 1):
                a.append(f'<line x1="{sgn*(half+1.5):.2f}" y1="{-h:.2f}" '
                         f'x2="{sgn*(half+5.5):.2f}" y2="{-h:.2f}" stroke="{GUIDE}" '
                         f'stroke-width="0.4"/>')

        a.append(f'<line x1="{-self.slit/2:.2f}" y1="{-self.slit_y:.2f}" '
                 f'x2="{self.slit/2:.2f}" y2="{-self.slit_y:.2f}" stroke="#ffffff" '
                 f'stroke-width="0.5" stroke-dasharray="1.4 1.4"/>')
        a.append(f'<text x="{self.slit/2 + 3:.2f}" y="{-self.slit_y + 1.1:.2f}" '
                 f'font-size="2.8" fill="{SLIT}" font-family="Helvetica, Arial, sans-serif">'
                 f'cut this slit</text>')
        return "\n".join(a)


STEPS = [
    "1. Print at 100% — actual size, no “fit to page”. One side only.",
    "2. Cut around the outside line; it is all one piece. Cut the marked slit in",
    "    the red half with a craft knife, not scissors.",
    "3. Score the two dashed lines. Both folds go BEHIND: white half first,",
    "    then the red half back over it.",
    "4. Push the paper disc through the slit. It pops through, lies flat inside its",
    "    ring and holds the back shut. Pop it out again to open.",
    "The ball is on the front, and the two halves make it again on the back.",
    "Inside is left blank for you.",
]


REG = [(20, 20), (PAGE_W - 20, 20), (20, PAGE_H - 20), (PAGE_W - 20, PAGE_H - 20)]


def notes(x, y):
    o = [f'<g font-family="Helvetica, Arial, sans-serif" fill="{GUIDE}">']
    for i, line in enumerate(STEPS):
        o.append(f'<text x="{x}" y="{y + i*4.4:.2f}" font-size="3.1">{line}</text>')
    o.append('</g>')
    ry = y + len(STEPS) * 4.4 + 4
    o.append(f'<g stroke="{GUIDE}" stroke-width="0.4" fill="none">'
             f'<line x1="{x}" y1="{ry:.2f}" x2="{x+50}" y2="{ry:.2f}"/>'
             f'<line x1="{x}" y1="{ry-2:.2f}" x2="{x}" y2="{ry+2:.2f}"/>'
             f'<line x1="{x+50}" y1="{ry-2:.2f}" x2="{x+50}" y2="{ry+2:.2f}"/></g>'
             f'<text x="{x+53}" y="{ry+1.1:.2f}" font-size="3.1" fill="{GUIDE}" '
             f'font-family="Helvetica, Arial, sans-serif">50 mm — check your print scale</text>')
    return "\n".join(o)


def page(body, label=None):
    marks = [f'<g stroke="{GUIDE}" stroke-width="0.3">']
    for x, y in REG:
        marks.append(f'<line x1="{x-3}" y1="{y}" x2="{x+3}" y2="{y}"/>'
                     f'<line x1="{x}" y1="{y-3}" x2="{x}" y2="{y+3}"/>')
    marks.append('</g>')
    return "\n".join([
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{PAGE_W}mm" height="{PAGE_H}mm" '
        f'viewBox="0 0 {PAGE_W} {PAGE_H}">',
        f'<rect width="{PAGE_W}" height="{PAGE_H}" fill="#ffffff"/>',
        body, "".join(marks),
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
    gut = 9.0
    x0 = (PAGE_W - (2 * w + gut)) / 2
    xs = [x0 + w / 2, x0 + w + gut + w / 2]
    top = 12.0
    cy = top + maxy

    body = [f'<g transform="translate({x:.3f},{cy:.3f})">{u.front(i)}</g>'
            for i, x in enumerate(xs)]
    body.append(notes(28, top + h + 10))
    open(f"{prefix}.svg", "w").write(page("\n".join(body)))
    print(f"unit {w:.1f} x {h:.1f} mm, ball {inches} in, two per sheet")


if __name__ == "__main__":
    main()
