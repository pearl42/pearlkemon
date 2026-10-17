#!/usr/bin/env python3
"""
Print-cut-fold Poke Ball invitation, opening version.

The ball splits at the band. A middle disc holds the QR; the red upper half
folds DOWN over it from a hinge near the top, the white lower half folds UP
from a hinge near the bottom, and they overlap just under the band. A paper
button on the white half pushes up through a slit in the red half and lies
flat on the front -- a buttonhole. That one disc is the whole latch: unbutton
it and the two halves swing apart like the real thing.

WHY IT PRINTS ON BOTH SIDES. A flap that folds over the middle shows its own
back, so the red half's artwork has to live on the reverse of the sheet. Only
that one flap does -- the back page carries three stripes of colour and
nothing else -- and every boundary on it is red-to-red or white-to-white
across the fold, with 3mm of bleed, so a millimetre or two of duplex drift
has nothing to spoil. The front carries the cut lines, both caps and the QR.

GEOMETRY, as fractions of the ball diameter, origin at the ball's centre,
y upwards. Changing one of these moves everything that depends on it:

    hR   +0.30   the red half's hinge, a chord of the middle disc
    hW   -0.34   the white half's hinge
    y_r  -0.17   how far down the red half reaches when closed
    y_w  -0.12   how far up the white half reaches: the two overlap by 0.05
    bh    0.20   band height, centred on the ball's middle
    btn   0.17   the paper button. MUST be smaller than the band: the slit
                 sits at the button's rim, and the band is what hides it
    slit  0.14   ~0.82 x btn, so the button has to bend through and then
                 catches on the way back

Usage:  python3 make-pokeball-invite-v2.py <url> <out-prefix>
Writes  <prefix>-front.svg and <prefix>-back.svg
"""
import sys
import segno
from shapely.geometry import box, Point
from shapely.ops import unary_union
from shapely import affinity

INK   = "#2b2f3a"
RED   = "#d94f4f"
GUIDE = "#b9bcc4"
SLIT  = "#8c93a0"

PAGE_W, PAGE_H = 215.9, 279.4

HR, HW   = 0.30, -0.34
Y_R, Y_W = -0.17, -0.12
F_BAND, F_BTN, F_SLIT = 0.20, 0.17, 0.14
F_NECK_L, F_NECK_W = 0.035, 0.075
F_QR = 0.45
BLEED = 3.0


def ring_path(ring):
    return "M " + " L ".join(f"{x:.3f},{-y:.3f}" for x, y in ring.coords) + " Z"


def poly_path(geom):
    """Shapely polygon -> SVG path, flipping y (maths up, SVG down)."""
    geoms = geom.geoms if geom.geom_type == "MultiPolygon" else [geom]
    out = []
    for g in geoms:
        out.append(ring_path(g.exterior))
        for i in g.interiors:
            out.append(ring_path(i))
    return " ".join(out)


def qr_path(url, size, cx, cy):
    qr = segno.make(url, error="m")
    rows = [list(r) for r in qr.matrix]
    n = len(rows) + 8
    m = size / n
    x0, y0 = cx - size / 2 + 4 * m, cy + size / 2 - 4 * m
    out = []
    for j, row in enumerate(rows):
        i = 0
        while i < len(row):
            if row[i]:
                k = i
                while k < len(row) and row[k]:
                    k += 1
                out.append(f"M {x0+i*m:.3f},{-(y0-j*m):.3f} h {(k-i)*m:.3f} "
                           f"v {m:.3f} h {-(k-i)*m:.3f} Z")
                i = k
            else:
                i += 1
    return " ".join(out)


class Unit:
    """One invitation, in ball-centre coordinates, y up."""

    def __init__(self, D):
        self.D = D
        self.r = r = D / 2
        self.hR, self.hW = HR * D, HW * D
        self.y_r, self.y_w = Y_R * D, Y_W * D
        self.bh, self.btn = F_BAND * D, F_BTN * D
        self.slit, self.neck_l, self.neck_w = F_SLIT * D, F_NECK_L * D, F_NECK_W * D

        self.base = Point(0, 0).buffer(r, quad_segs=128)

        # Each flap is the mirror image, about its own hinge, of the slice of
        # the middle disc it has to cover -- so folded, its edges land exactly
        # on the disc's edges and the closed silhouette is a circle.
        red_cover = self.base.intersection(box(-r, self.y_r, r, self.hR))
        self.red = affinity.scale(red_cover, 1, -1, origin=(0, self.hR))

        white_cover = self.base.intersection(box(-r, self.hW, r, self.y_w))
        self.white = affinity.scale(white_cover, 1, -1, origin=(0, self.hW))

        # the button, hanging off the white half's far edge
        self.white_edge = 2 * self.hW - self.y_w          # flat y of that edge
        self.neck = box(-self.neck_w / 2, self.white_edge - self.neck_l,
                        self.neck_w / 2, self.white_edge + 0.8)
        self.btn_cy = self.white_edge - self.neck_l - self.btn / 2
        self.disc = Point(0, self.btn_cy).buffer(self.btn / 2, quad_segs=96)

        # the slit, in the red half, at the button's rim once folded
        self.slit_y_folded = -self.btn / 2
        self.slit_y = 2 * self.hR - self.slit_y_folded

        self.die = unary_union([self.base, self.red, self.white, self.neck, self.disc])
        self.bounds = self.die.bounds

    # -- checks -----------------------------------------------------------
    def verify(self):
        """Fold it in software before anyone folds it in paper."""
        back = lambda g, h: affinity.scale(g, 1, -1, origin=(0, h))
        red_f, white_f = back(self.red, self.hR), back(self.white, self.hW)
        covered = unary_union([red_f, white_f])
        msg = self.base.intersection(box(-self.r, self.hW, self.r, self.hR))
        gap = msg.difference(covered).area
        spill = covered.difference(self.base.buffer(0.01)).area
        overlap = red_f.intersection(white_f).area
        disc_c = back(self.disc, self.hW).centroid
        return {
            "uncovered mm2": round(gap, 2),
            "outside the ball mm2": round(spill, 2),
            "overlap mm2": round(overlap, 1),
            "button centre": (round(disc_c.x, 2), round(disc_c.y, 2)),
            "slit at": round(self.slit_y_folded, 2),
            "button rim": round(self.btn_cy - (self.white_edge - self.neck_l - self.btn), 2),
        }

    # -- drawing ----------------------------------------------------------
    def front(self, url, uid):
        r, D = self.r, self.D
        s = []
        a = s.append
        a(f'<path d="{poly_path(self.die)}" fill="#ffffff"/>')

        # the two caps: the parts of the middle disc that stay on show
        cap_t = self.base.intersection(box(-r, self.hR - 2.0, r, r + 1))
        a(f'<path d="{poly_path(cap_t)}" fill="{RED}"/>')
        # the bottom cap is the ball's white, which is just the paper

        a(f'<path d="{qr_path(url, F_QR * D, 0, -0.02 * D)}" fill="{INK}"/>')
        short = url.replace("https://", "").replace("http://", "").rstrip("/")
        a(f'<text x="0" y="{-(-0.02*D - F_QR*D/2 - 5.0):.2f}" text-anchor="middle" '
          f'fill="{INK}" font-family="Helvetica, Arial, sans-serif" font-size="3.4" '
          f'letter-spacing="0.3">{short}</text>')

        a(f'<path d="{poly_path(self.die)}" fill="none" stroke="{INK}" '
          f'stroke-width="0.6" stroke-linejoin="round"/>')

        # fold lines, drawn on the chords where flap meets disc
        for h in (self.hR, self.hW):
            half = (self.r ** 2 - h ** 2) ** 0.5
            a(f'<line x1="{-half+0.5:.2f}" y1="{-h:.2f}" x2="{half-0.5:.2f}" y2="{-h:.2f}" '
              f'stroke="{GUIDE}" stroke-width="0.4" stroke-dasharray="1.8 1.8"/>')
            for sgn in (-1, 1):
                a(f'<line x1="{sgn*(half+1.5):.2f}" y1="{-h:.2f}" '
                  f'x2="{sgn*(half+5.5):.2f}" y2="{-h:.2f}" stroke="{GUIDE}" '
                  f'stroke-width="0.4"/>')

        # the slit, and the button's outline where it is easy to see
        a(f'<line x1="{-self.slit/2:.2f}" y1="{-self.slit_y:.2f}" '
          f'x2="{self.slit/2:.2f}" y2="{-self.slit_y:.2f}" stroke="{SLIT}" '
          f'stroke-width="0.5" stroke-dasharray="1.4 1.4"/>')
        a(f'<text x="{self.slit/2 + 2.5:.2f}" y="{-self.slit_y + 1.1:.2f}" '
          f'font-size="2.8" fill="{SLIT}" font-family="Helvetica, Arial, sans-serif">'
          f'cut this slit</text>')
        return "\n".join(s)

    def back(self, uid):
        """The red half's artwork: three bands of colour, generously bled."""
        D = self.D
        fold = lambda y: 2 * self.hR - y          # folded y -> flat y
        grown = self.red.buffer(BLEED)
        s = [f'<defs><clipPath id="rf-{uid}"><path d="{poly_path(grown)}"/></clipPath></defs>',
             f'<g clip-path="url(#rf-{uid})">']
        zones = [(self.bh / 2, self.hR + BLEED + 2, RED),          # red
                 (-self.bh / 2, self.bh / 2, INK),                  # the band
                 (self.y_r - BLEED - 2, -self.bh / 2, None)]        # white: paper
        for lo, hi, col in zones:
            if col is None:
                continue
            y0, y1 = sorted((fold(lo), fold(hi)))
            s.append(f'<rect x="{-self.r-BLEED-2:.2f}" y="{-y1:.2f}" '
                     f'width="{2*(self.r+BLEED+2):.2f}" height="{y1-y0:.2f}" fill="{col}"/>')
        s.append('</g>')
        return "\n".join(s)


STEPS = [
    "1. Print both sides at 100% — actual size, flipping on the LONG edge.",
    "    Hold the sheet to a lamp: the red band should sit over the upper flap.",
    "2. Cut around the outside line. The whole invitation is one piece.",
    "3. Cut the marked slit in the upper flap. Craft knife, not scissors.",
    "4. Score and fold the two dashed lines.",
    "5. Fold the lower (white) half up, then the upper (red) half down over it.",
    "6. Push the paper button up through the slit. It pops through, lies flat,",
    "    and holds both halves shut. Pop it back out to open the invitation.",
]


def notes(x, y, steps=STEPS):
    o = [f'<g font-family="Helvetica, Arial, sans-serif" fill="{GUIDE}">']
    for i, line in enumerate(steps):
        o.append(f'<text x="{x}" y="{y + i*4.4:.2f}" font-size="3.1">{line}</text>')
    o.append('</g>')
    ry = y + len(steps) * 4.4 + 6
    o.append(f'<g stroke="{GUIDE}" stroke-width="0.4" fill="none">'
             f'<line x1="{x}" y1="{ry:.2f}" x2="{x+50}" y2="{ry:.2f}"/>'
             f'<line x1="{x}" y1="{ry-2:.2f}" x2="{x}" y2="{ry+2:.2f}"/>'
             f'<line x1="{x+50}" y1="{ry-2:.2f}" x2="{x+50}" y2="{ry+2:.2f}"/></g>'
             f'<text x="{x+53}" y="{ry+1.1:.2f}" font-size="3.1" fill="{GUIDE}" '
             f'font-family="Helvetica, Arial, sans-serif">50 mm — check your print scale</text>')
    return "\n".join(o)


def diagram(x, y, s=8.0):
    """closed · unbuttoned · open."""
    g = [f'<g transform="translate({x},{y})" font-family="Helvetica, Arial, sans-serif">']
    step = s * 3.9
    cap = lambda cx, t: (f'<text x="{cx}" y="{s*2.15:.2f}" text-anchor="middle" '
                         f'font-size="2.8" fill="{GUIDE}">{t}</text>')

    def shut(cx, button=True):
        o = [f'<circle cx="{cx}" cy="0" r="{s}" fill="{RED}" stroke="none"/>',
             f'<path d="M {cx-s},0 a {s},{s} 0 0 0 {2*s},0 Z" fill="#ffffff"/>',
             f'<rect x="{cx-s*0.995:.2f}" y="{-s*0.2:.2f}" width="{s*1.99:.2f}" '
             f'height="{s*0.4:.2f}" fill="{INK}"/>',
             f'<circle cx="{cx}" cy="0" r="{s}" fill="none" stroke="{INK}" stroke-width="0.45"/>']
        if button:
            o.append(f'<circle cx="{cx}" cy="0" r="{s*0.17:.2f}" fill="#ffffff" '
                     f'stroke="{INK}" stroke-width="0.35"/>')
        return o

    g += shut(0)
    g.append(cap(0, "closed"))

    g += shut(step, button=False)
    g.append(f'<circle cx="{step:.2f}" cy="{-s*0.5:.2f}" r="{s*0.17:.2f}" fill="#ffffff" '
             f'stroke="{INK}" stroke-width="0.35"/>')
    g.append(f'<path d="M {step+s*0.35:.2f},{-s*0.75:.2f} l {s*0.7:.2f},{-s*0.5:.2f}" '
             f'stroke="{INK}" stroke-width="0.45" fill="none" marker-end="url(#arw)"/>')
    g.append(cap(step, "unbutton"))

    # open: halves swung apart, QR between them
    cx = 2 * step
    g.append(f'<path d="M {cx-s},{-s*1.05:.2f} a {s},{s} 0 0 1 {2*s},0 Z" fill="{RED}" '
             f'stroke="{INK}" stroke-width="0.45" transform="translate(0,{-s*0.75:.2f})"/>')
    g.append(f'<path d="M {cx-s},{s*1.05:.2f} a {s},{s} 0 0 0 {2*s},0 Z" fill="#ffffff" '
             f'stroke="{INK}" stroke-width="0.45" transform="translate(0,{s*0.75:.2f})"/>')
    g.append(f'<rect x="{cx-s*0.52:.2f}" y="{-s*0.5:.2f}" width="{s*1.04:.2f}" '
             f'height="{s*1.0:.2f}" fill="none" stroke="{INK}" stroke-width="0.45"/>')
    for i in range(3):
        for j in range(3):
            if (i + j) % 2 == 0:
                g.append(f'<rect x="{cx-s*0.42+i*s*0.3:.2f}" y="{-s*0.4+j*s*0.3:.2f}" '
                         f'width="{s*0.2:.2f}" height="{s*0.2:.2f}" fill="{INK}"/>')
    g.append(cap(2 * step, "open"))
    g.append('</g>')
    return "\n".join(g)


REG = [(20, 20), (PAGE_W - 20, 20), (20, PAGE_H - 20), (PAGE_W - 20, PAGE_H - 20)]


def reg_marks():
    o = [f'<g stroke="{GUIDE}" stroke-width="0.3">']
    for x, y in REG:
        o.append(f'<line x1="{x-3}" y1="{y}" x2="{x+3}" y2="{y}"/>'
                 f'<line x1="{x}" y1="{y-3}" x2="{x}" y2="{y+3}"/>')
    o.append('</g>')
    return "".join(o)


def page(body, label=None):
    return "\n".join([
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{PAGE_W}mm" height="{PAGE_H}mm" '
        f'viewBox="0 0 {PAGE_W} {PAGE_H}">',
        f'<rect width="{PAGE_W}" height="{PAGE_H}" fill="#ffffff"/>',
        f'<defs><marker id="arw" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" '
        f'markerHeight="5" orient="auto-start-reverse"><path d="M 0 1 L 9 5 L 0 9 z" '
        f'fill="{INK}"/></marker></defs>',
        body,
        reg_marks(),
        (f'<text x="{PAGE_W/2}" y="{PAGE_H-8}" text-anchor="middle" font-size="3.1" '
         f'fill="{GUIDE}" font-family="Helvetica, Arial, sans-serif">{label}</text>'
         if label else ""),
        '</svg>'])


def main():
    url = sys.argv[1] if len(sys.argv) > 1 else "https://pearlkemon.com"
    prefix = sys.argv[2] if len(sys.argv) > 2 else "pokeball-open"

    D = 88.9
    u = Unit(D)
    print("fold check:", u.verify())

    minx, miny, maxx, maxy = u.bounds
    w, h = maxx - minx, maxy - miny
    gut = 8.0
    xs = [(PAGE_W - (2 * w + gut)) / 2 + w / 2,
          (PAGE_W - (2 * w + gut)) / 2 + w + gut + w / 2]
    top = 16.0
    cy = top + maxy                      # ball centre, page coords

    front = [f'<g transform="translate({x:.3f},{cy:.3f})">{u.front(url, f"f{i}")}</g>'
             for i, x in enumerate(xs)]
    front.append(notes(15, top + h + 24))
    front.append(diagram(128, top + h + 54, 8.0))
    open(f"{prefix}-front.svg", "w").write(
        page("\n".join(front), "FRONT — cut from this side"))

    back = [f'<g transform="translate({PAGE_W},0) scale(-1,1)">']
    for i, x in enumerate(xs):
        back.append(f'<g transform="translate({x:.3f},{cy:.3f})">{u.back(f"b{i}")}</g>')
    back.append('</g>')
    back.append(f'<text x="{PAGE_W/2}" y="{top + h + 30:.2f}" text-anchor="middle" '
                f'font-size="3.4" fill="{GUIDE}" font-family="Helvetica, Arial, sans-serif">'
                f'BACK — the red half&#8217;s artwork. Nothing here is cut.</text>')
    open(f"{prefix}-back.svg", "w").write(
        page("\n".join(back), "BACK — prints on the reverse, flipped on the long edge"))

    print(f"unit {w:.1f} x {h:.1f} mm, ball {D/25.4:.2f} in, two per sheet")


if __name__ == "__main__":
    main()
