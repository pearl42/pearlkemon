#!/usr/bin/env python3
"""
Print-cut-fold Poke Ball invitation.

The object: two discs joined by a hinge at the top, plus a band that wraps
around the left edge and across the face. The band's tongue pushes into a slit
at the centre of the face and its shoulders catch behind the paper -- the
takeout-container latch -- and the printed button sits over the slit, so the
closed invitation reads as a plain Poke Ball with nothing obviously holding it
shut. Swing the band off, open the back disc, and there's the QR code.

Everything prints on ONE side of the sheet. That is the whole reason for the
layout: the back disc folds BEHIND the face, so its printed side (the QR) ends
up hidden, and the band folds twice, so its printed side ends up facing out.
Any design where the art has to land on the reverse needs duplex registration
a home printer can't hold at the equator seam.

Usage:  python3 make-pokeball-invite.py <url> <out.svg-prefix>
Writes  <prefix>-p1.svg (one 3.5in ball) and <prefix>-p2.svg (two 2.4in balls).
"""
import sys, math
import segno
from shapely.geometry import box, Point
from shapely.ops import unary_union

# ---------- palette: lifted from css/style.css so paper matches the site ----
INK    = "#2b2f3a"      # --frame
RED    = "#d94f4f"      # --accent
GUIDE  = "#b9bcc4"      # fold lines, instructions
SLIT   = "#525c6b"      # just legible on the dark band, near-invisible once cut

PAGE_W, PAGE_H = 215.9, 279.4      # US Letter, portrait, mm

# ---------- geometry, all as fractions of the ball diameter D ---------------
F_BAND   = 0.150   # height of the equatorial band
F_BUTTON = 0.200   # button diameter
F_NECK_L = 0.015   # length of the tongue's neck: keeps the slit tight to the button
F_NECK_H = 0.075   # height of the neck: must pass the slit freely
F_HEAD_L = 0.100   # length of the tongue's head
F_HEAD_H = 0.165   # height of the head: must EXCEED the slit, that's the catch
F_SLIT   = 0.130   # slit length. head - slit = the bite, ~1.5mm a side
F_HINGE  = 0.220   # width of the hinge bridge between the two discs
F_QR     = 0.600   # QR size on the back disc
WRAP     = 0.4     # slack for the thickness of the fold around the disc edge


def ring_to_path(ring):
    pts = list(ring.coords)
    return "M " + " L ".join(f"{x:.3f},{y:.3f}" for x, y in pts) + " Z"


def qr_path(url, size, cx, cy):
    """QR as one path of merged row-runs, centred on (cx, cy), `size` mm wide."""
    qr = segno.make(url, error="m")
    rows = [list(r) for r in qr.matrix]
    n = len(rows) + 8                      # 4-module quiet zone each side
    m = size / n                           # module size in mm
    x0, y0 = cx - size / 2 + 4 * m, cy - size / 2 + 4 * m
    out = []
    for j, row in enumerate(rows):
        i = 0
        while i < len(row):
            if row[i]:
                k = i
                while k < len(row) and row[k]:
                    k += 1
                out.append(f"M {x0+i*m:.3f},{y0+j*m:.3f} h {(k-i)*m:.3f} "
                           f"v {m:.3f} h {-(k-i)*m:.3f} Z")
                i = k
            else:
                i += 1
    return " ".join(out), m


def unit(D, url, instructions_id=""):
    """One invitation. Returns (svg_fragment, width, height, offset_x, offset_y).

    Local coords: the face disc is centred on (0,0), y down, mm.
    The back disc sits directly above it, the band runs out to the left.
    """
    r   = D / 2
    bh  = F_BAND * D
    btn = F_BUTTON * D
    nl, nh = F_NECK_L * D, F_NECK_H * D
    hl, hh = F_HEAD_L * D, F_HEAD_H * D
    sl  = F_SLIT * D
    nw  = F_HINGE * D

    face   = Point(0, 0).buffer(r, quad_segs=96)
    back   = Point(0, -D).buffer(r, quad_segs=96)

    # The discs are tangent, so without this bridge they'd be joined at a
    # single point and tear off. It reaches a hair outside both outlines; at
    # this width that's about 1mm, which reads as a hinge rather than a flaw.
    hbulge = (nw / 2) ** 2 / (2 * r) + 0.35
    hinge  = box(-nw / 2, -r - hbulge, nw / 2, -r + hbulge)

    # the band, in t = distance from its fold line at x = -r
    t_btn  = r + WRAP                      # button centre lands on the face's centre
    t_n0   = t_btn + btn / 2
    t_n1   = t_n0 + nl
    t_h1   = t_n1 + hl
    # reaches 1.5mm past the fold line, into the disc, so the union actually
    # joins: a circle only touches its own tangent at one point
    strip  = box(-r - t_btn, -D - bh / 2, -r + 1.5, -D + bh / 2)
    button = Point(-r - t_btn, -D).buffer(btn / 2, quad_segs=96)
    # again overlapping its neighbour by 1mm rather than meeting it exactly
    neck   = box(-r - t_n1, -D - nh / 2, -r - t_n0 + 1.0, -D + nh / 2)
    head   = box(-r - t_h1 + 1.2, -D - hh / 2 + 1.2, -r - t_n1, -D + hh / 2 - 1.2) \
             .buffer(1.2, quad_segs=24, join_style=1)

    die = unary_union([face, back, hinge, strip, button, neck, head])
    die_path = ring_to_path(die.exterior)

    x_slit = (t_n0 + t_n1) / 2 - r         # where the neck crosses the face
    qrp, mod = qr_path(url, F_QR * D, 0, -D)

    s = []
    a = s.append
    uid = instructions_id or f"u{int(D*10)}"
    a(f'<defs><clipPath id="face-{uid}"><circle cx="0" cy="0" r="{r:.3f}"/></clipPath></defs>')

    # --- the die line, filled paper-white so the art sits on something ------
    a(f'<path d="{die_path}" fill="#ffffff"/>')

    # --- the band, laid down before the back disc: it reaches a little way
    #     inside that disc to keep the two joined, and the disc's own white
    #     covers the overlap again -----------------------------------------
    band = unary_union([strip, button, neck, head])
    a(f'<path d="{ring_to_path(band.exterior)}" fill="{INK}"/>')
    a(f'<circle cx="0" cy="{-D:.3f}" r="{r:.3f}" fill="#ffffff"/>')

    # --- the face ----------------------------------------------------------
    a(f'<g clip-path="url(#face-{uid})">')
    a(f'  <rect x="{-r-1:.3f}" y="{-r-1:.3f}" width="{2*r+2:.3f}" '
      f'height="{r+1-bh/2:.3f}" fill="{RED}"/>')                      # upper half
    a(f'  <rect x="{-r-1:.3f}" y="{-bh/2:.3f}" width="{2*r+2:.3f}" '
      f'height="{bh:.3f}" fill="{INK}"/>')                            # the band, printed
    a('</g>')
    # the sliver of hinge that sits below the fold ends up on the face, so it
    # wants to be red too — otherwise there's a white nick at the top of the ball
    a(f'<rect x="{-nw/2:.3f}" y="{-r:.3f}" width="{nw:.3f}" '
      f'height="{hbulge:.3f}" fill="{RED}"/>')


    # the slit: dark-on-dark once cut, so it needs a visible guide beforehand
    a(f'<line x1="{x_slit:.3f}" y1="{-sl/2:.3f}" x2="{x_slit:.3f}" y2="{sl/2:.3f}" '
      f'stroke="{SLIT}" stroke-width="0.4" stroke-dasharray="1.2 1.2"/>')

    # --- the back disc: QR only, per the brief -----------------------------
    a(f'<path d="{qrp}" fill="{INK}"/>')
    a(f'<text x="0" y="{-D + F_QR*D/2 + 5.2:.3f}" text-anchor="middle" fill="{INK}" '
      f'font-family="Helvetica, Arial, sans-serif" font-size="3.4" '
      f'letter-spacing="0.3">{url.replace("https://", "").replace("http://", "").rstrip("/")}</text>')

    # --- the button, sitting on the band -----------------------------------
    a(f'<circle cx="{-r-t_btn:.3f}" cy="{-D:.3f}" r="{btn/2-0.5:.3f}" '
      f'fill="#ffffff" stroke="none"/>')
    a(f'<circle cx="{-r-t_btn:.3f}" cy="{-D:.3f}" r="{btn/2-0.5:.3f}" '
      f'fill="none" stroke="{INK}" stroke-width="0.5"/>')

    # --- one outline around the whole die: that line IS the cut guide ------
    a(f'<path d="{die_path}" fill="none" stroke="{INK}" stroke-width="0.7" '
      f'stroke-linejoin="round"/>')

    # --- the two fold lines ------------------------------------------------
    a(f'<line x1="{-nw/2+0.6:.3f}" y1="{-r:.3f}" x2="{nw/2-0.6:.3f}" y2="{-r:.3f}" '
      f'stroke="{GUIDE}" stroke-width="0.4" stroke-dasharray="1.6 1.6"/>')
    a(f'<line x1="{-r:.3f}" y1="{-D-bh/2+0.6:.3f}" x2="{-r:.3f}" y2="{-D+bh/2-0.6:.3f}" '
      f'stroke="#ffffff" stroke-width="0.4" stroke-dasharray="1.6 1.6"/>')

    minx, miny, maxx, maxy = die.bounds
    return "\n".join(s), maxx - minx, maxy - miny, -minx, -miny


STEPS = [
    "1. Print at 100% — actual size, no “fit to page”. Check the bar below.",
    "2. Cut around the outside of every dark line. It comes out in one piece.",
    "3. Cut the short dotted slit at the centre of the ball — craft knife, not scissors.",
    "4. Score and fold the two dashed lines.",
    "5. Fold the QR disc behind the ball face.",
    "6. Wrap the dark band around the left edge and across the face, then push",
    "    its tongue into the slit. The shoulders catch; the button hides the slit.",
]

STEPS_NARROW = [
    "1. Print at 100% — actual size.",
    "    No “fit to page”. Check the bar.",
    "2. Cut around the outside of every",
    "    dark line — one piece.",
    "3. Cut the dotted slit at the centre",
    "    of the ball. Craft knife.",
    "4. Score and fold the dashed lines.",
    "5. Fold the QR disc behind the face.",
    "6. Wrap the band around the left edge,",
    "    across the face, and push its tongue",
    "    into the slit. The button hides it.",
]


def notes_block(x, y, steps=None, narrow=False):
    steps = steps or STEPS
    out = [f'<g font-family="Helvetica, Arial, sans-serif" fill="{GUIDE}">']
    for i, line in enumerate(steps):
        out.append(f'<text x="{x}" y="{y + i*4.4:.2f}" font-size="3.1">{line}</text>')
    out.append('</g>')
    ry = y + len(steps) * 4.4 + 5
    out.append(f'<g stroke="{GUIDE}" stroke-width="0.4" fill="none">'
               f'<line x1="{x}" y1="{ry:.2f}" x2="{x+50}" y2="{ry:.2f}"/>'
               f'<line x1="{x}" y1="{ry-2:.2f}" x2="{x}" y2="{ry+2:.2f}"/>'
               f'<line x1="{x+50}" y1="{ry-2:.2f}" x2="{x+50}" y2="{ry+2:.2f}"/></g>'
               + (f'<text x="{x}" y="{ry+5.5:.2f}" font-size="3.1" fill="{GUIDE}" '
                  f'font-family="Helvetica, Arial, sans-serif">50 mm — check your print scale</text>'
                  if narrow else
                  f'<text x="{x+53}" y="{ry+1.1:.2f}" font-size="3.1" fill="{GUIDE}" '
                  f'font-family="Helvetica, Arial, sans-serif">50 mm — check your print scale</text>'))
    return "\n".join(out)


def diagram(x, y, s=9.0):
    """Three tiny figures: fold the disc back, wrap the band, push the tongue.

    Drawn at radius `s` -- small enough to sit beside the written steps, big
    enough to show which way each piece travels. Nobody has folded one of
    these before, and the latch is the part a sentence describes badly."""
    dash = "stroke-dasharray=\'1.2 1.2\'"
    g = [f'<g transform="translate({x},{y})" font-family="Helvetica, Arial, sans-serif">']
    step = s * 4.4
    cap = lambda cx, t: (f'<text x="{cx}" y="{s*2.0:.2f}" text-anchor="middle" '
                         f'font-size="2.8" fill="{GUIDE}">{t}</text>')

    def ball(cx, band=False, button=False):
        o = [f'<circle cx="{cx}" cy="0" r="{s}" fill="{RED}" stroke="none"/>',
             f'<path d="M {cx-s},0 a {s},{s} 0 0 0 {2*s},0 Z" fill="#ffffff"/>',
             f'<rect x="{cx-s*0.98:.2f}" y="{-s*0.17:.2f}" width="{s*1.96:.2f}" '
             f'height="{s*0.34:.2f}" fill="{INK}"/>',
             f'<circle cx="{cx}" cy="0" r="{s}" fill="none" stroke="{INK}" stroke-width="0.45"/>']
        if band:
            o.append(f'<rect x="{cx-s*1.12:.2f}" y="{-s*0.19:.2f}" width="{s*1.12:.2f}" '
                     f'height="{s*0.38:.2f}" fill="{INK}"/>')
        if button:
            o.append(f'<circle cx="{cx}" cy="0" r="{s*0.22:.2f}" fill="#ffffff" '
                     f'stroke="{INK}" stroke-width="0.4"/>')
        return o

    g += ball(0)
    g.append(f'<circle cx="0" cy="{-2*s:.2f}" r="{s}" fill="none" stroke="{GUIDE}" '
             f'stroke-width="0.45" {dash}/>')
    g.append(f'<path d="M {s*0.55:.2f},{-2.75*s:.2f} q {s*1.7:.2f},{s*1.0:.2f} '
             f'{s*0.15:.2f},{s*2.0:.2f}" fill="none" stroke="{INK}" stroke-width="0.45" '
             f'marker-end="url(#arw)"/>')
    g.append(cap(0, "1 · fold back"))

    g += ball(step, band=True)
    g.append(f'<path d="M {step-s*2.5:.2f},{s*1.0:.2f} q {s*0.9:.2f},{-s*1.0:.2f} '
             f'{s*2.0:.2f},{-s*0.95:.2f}" fill="none" stroke="{INK}" stroke-width="0.45" '
             f'marker-end="url(#arw)"/>')
    g.append(cap(step, "2 · wrap across"))

    g += ball(2 * step, band=True, button=True)
    g.append(f'<path d="M {2*step+s*1.7:.2f},{-s*1.6:.2f} l {-s*1.1:.2f},{s*1.1:.2f}" '
             f'fill="none" stroke="{INK}" stroke-width="0.45" marker-end="url(#arw)"/>')
    g.append(cap(2 * step, "3 · tongue in"))
    g.append('</g>')
    return "\n".join(g)


def sheet(units, notes_at=None, steps=None, narrow=False, diagram_at=None):
    """units: list of (svg_fragment, ox, oy, place_x, place_y)"""
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{PAGE_W}mm" '
           f'height="{PAGE_H}mm" viewBox="0 0 {PAGE_W} {PAGE_H}">',
           f'<rect width="{PAGE_W}" height="{PAGE_H}" fill="#ffffff"/>',
           f'<defs><marker id="arw" viewBox="0 0 10 10" refX="8" refY="5" '
           f'markerWidth="5" markerHeight="5" orient="auto-start-reverse">'
           f'<path d="M 0 1 L 9 5 L 0 9 z" fill="{INK}"/></marker></defs>']
    for frag, ox, oy, px, py in units:
        out.append(f'<g transform="translate({px+ox:.3f},{py+oy:.3f})">{frag}</g>')
    if notes_at:
        out.append(notes_block(notes_at[0], notes_at[1], steps, narrow))
    if diagram_at:
        out.append(diagram(*diagram_at))
    out.append('</svg>')
    return "\n".join(out)


def main():
    url = sys.argv[1] if len(sys.argv) > 1 else "https://pearlkemon.com"
    prefix = sys.argv[2] if len(sys.argv) > 2 else "pokeball-invite"

    # ---- page 1: one 3.5in ball ------------------------------------------
    D1 = 88.9
    f1, w1, h1, ox1, oy1 = unit(D1, url, "big")
    open(f"{prefix}-p1.svg", "w").write(
        sheet([(f1, ox1, oy1, (PAGE_W - w1) / 2, 14)],
              notes_at=(14, 14 + h1 + 18), steps=STEPS_NARROW, narrow=True,
              diagram_at=(112, 14 + h1 + 44, 7.5)))

    # ---- page 2: two 2.4in balls, stacked, notes in the spare column ------
    D2 = 61.0
    us = []
    for i in range(2):
        f, w2, h2, ox, oy = unit(D2, url, f"small{i}")
        us.append((f, ox, oy, 14, 12 + i * (h2 + 6)))
    open(f"{prefix}-p2.svg", "w").write(
        sheet(us, notes_at=(126, 26), steps=STEPS_NARROW, narrow=True,
              diagram_at=(132, 112, 6.5)))
    print(f"page 1: {w1:.1f} x {h1:.1f} mm unit, {D1/25.4:.2f} in ball "
          f"(bottom at {14+h1:.0f}mm)")
    print(f"page 2: two {D2/25.4:.2f} in balls, {w2:.1f} x {h2:.1f} mm each "
          f"(bottom at {12+2*(h2+6):.0f}mm)")


if __name__ == "__main__":
    main()
