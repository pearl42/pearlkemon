#!/usr/bin/env python3
"""
The disc that goes inside the invitation: a QR label, nine to a Letter sheet.

Decisions baked in:
  - 63.5mm (2.5in) circles, so a standard 2.5in craft punch cuts them, and so
    they sit on the 80.9mm black core with ~8mm of black showing all round.
  - Dark on matte white. Never on the foil: metallic stock throws glare back
    at the camera and scanners give up.
  - Error correction H. The theoretical 30% does NOT all go to the hole --
    print noise, camera angle and the finder patterns want their share -- so
    the cleared circle is held to about 12% of the code's area, which was
    measured to decode rather than assumed to.
  - The URL is printed underneath. If one guest's camera will not cooperate,
    that line saves the invitation.

Fonts come from the invite's own files so the print matches the screen.

Usage:  python3 make-qr-labels.py <out.html> [url]
"""
import sys, base64, segno

FONTS = "/mnt/user-data/outputs/pokeparty"
PAGE_W, PAGE_H = 215.9, 279.4
D = 63.5                      # label diameter: a 2.5in punch
GAP = 5.0
COLS, ROWS = 3, 3

INK    = "#1f2630"
MUTED  = "#79828f"
RED    = "#c3122a"
GUIDE  = "#d6dae0"
QR_MM  = 32.0                 # overall, quiet zone included
BALL   = 8.0                  # the ball sitting in the code's middle
HALO   = 9.6                  # white gap cleared around it. THIS is the number
                              # that decides whether the code still reads -- not
                              # the ball. Measured on this exact code (29x29,
                              # level H): a hole 12 modules across still decodes,
                              # 13 does not. At 32mm overall that is 0.865mm per
                              # module, so 9.6mm = 11.1 modules, inside the line
                              # with a module to spare. Do not raise it without
                              # re-running the decode check.


def font_face(name, path):
    b64 = base64.b64encode(open(path, "rb").read()).decode()
    return (f"@font-face{{font-family:'{name}';"
            f"src:url(data:font/ttf;base64,{b64}) format('truetype');}}")


def qr_svg(url, cx, cy):
    """The code, centred on (cx, cy), with a hole cleared in the middle."""
    qr = segno.make(url, error="h")
    rows = [list(r) for r in qr.matrix]
    n = len(rows) + 8                                  # 4-module quiet zone
    m = QR_MM / n
    x0, y0 = cx - QR_MM / 2 + 4 * m, cy - QR_MM / 2 + 4 * m
    keep = (HALO / 2) ** 2
    d = []
    for j, row in enumerate(rows):
        i = 0
        while i < len(row):
            if row[i]:
                k = i
                while k < len(row) and row[k]:
                    k += 1
                # drop any run that falls inside the cleared circle
                for a in range(i, k):
                    px, py = x0 + (a + 0.5) * m - cx, y0 + (j + 0.5) * m - cy
                    if px * px + py * py > keep:
                        d.append(f"M {x0+a*m:.3f},{y0+j*m:.3f} h {m:.3f} "
                                 f"v {m:.3f} h {-m:.3f} Z")
                i = k
            else:
                i += 1
    return f'<path d="{" ".join(d)}" fill="{INK}"/>', len(rows), m


def ball(cx, cy, d):
    """A small Poke Ball, same proportions as the paper one."""
    r, bh, btn = d / 2, 0.12 * d, 0.20 * d
    return f'''<g>
  <circle cx="{cx}" cy="{cy}" r="{r:.3f}" fill="#ffffff"/>
  <path d="M {cx-r:.3f},{cy:.3f} a {r:.3f},{r:.3f} 0 0 1 {2*r:.3f},0 Z" fill="{RED}"/>
  <rect x="{cx-r:.3f}" y="{cy-bh/2:.3f}" width="{2*r:.3f}" height="{bh:.3f}" fill="{INK}"/>
  <circle cx="{cx}" cy="{cy}" r="{btn/2:.3f}" fill="#ffffff" stroke="{INK}" stroke-width="{bh*0.55:.3f}"/>
  <circle cx="{cx}" cy="{cy}" r="{r:.3f}" fill="none" stroke="{INK}" stroke-width="{bh*0.5:.3f}"/>
</g>'''


def label(cx, cy, url):
    r = D / 2
    short = url.replace("https://", "").replace("http://", "").rstrip("/")
    code, n, m = qr_svg(url, cx, cy + 2.5)
    return f'''<g>
  <circle cx="{cx}" cy="{cy}" r="{r:.3f}" fill="#ffffff"/>
  <circle cx="{cx}" cy="{cy}" r="{r-1.35:.3f}" fill="none" stroke="{INK}" stroke-width="0.45"/>
  <text x="{cx}" y="{cy-22.2:.2f}" text-anchor="middle" font-family="Pixelify"
        font-size="3.4" fill="{MUTED}" letter-spacing="0.5">No. 030</text>
  <text x="{cx}" y="{cy-16.2:.2f}" text-anchor="middle" font-family="Pixelify"
        font-size="6.2" fill="{INK}">PEARLKÉMON</text>
  {code}
  {ball(cx, cy + 1.5, BALL)}
  <text x="{cx}" y="{cy+22.0:.2f}" text-anchor="middle" font-family="Varela"
        font-size="4.3" fill="{INK}">{short}</text>
  <text x="{cx}" y="{cy+26.0:.2f}" text-anchor="middle" font-family="Varela"
        font-size="2.5" fill="{MUTED}">ten minutes · sound on</text>
  <circle cx="{cx}" cy="{cy}" r="{r:.3f}" fill="none" stroke="{GUIDE}" stroke-width="0.25"/>
</g>''', n, m


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "qr-labels.html"
    url = sys.argv[2] if len(sys.argv) > 2 else "https://pearlkemon.com"

    span_x = COLS * D + (COLS - 1) * GAP
    span_y = ROWS * D + (ROWS - 1) * GAP
    x0 = (PAGE_W - span_x) / 2 + D / 2
    y0 = 16 + D / 2

    cells, n, m = [], 0, 0
    for j in range(ROWS):
        for i in range(COLS):
            g, n, m = label(x0 + i * (D + GAP), y0 + j * (D + GAP), url)
            cells.append(g)

    note = (f'<text x="{(PAGE_W-span_x)/2:.1f}" y="{y0 + span_y - D/2 + 14:.1f}" '
            f'font-family="Varela" font-size="3.2" fill="{MUTED}">'
            f'Print at 100% on MATTE paper or matte sticker stock — not on the foil. '
            f'Cut on the faint circles, or punch with a 2.5 in punch.</text>')

    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{PAGE_W}mm" '
           f'height="{PAGE_H}mm" viewBox="0 0 {PAGE_W} {PAGE_H}">'
           f'<rect width="{PAGE_W}" height="{PAGE_H}" fill="#ffffff"/>'
           + "\n".join(cells) + note + '</svg>')

    css = font_face("Pixelify", f"{FONTS}/PixelifySans.ttf") + \
          font_face("Varela", f"{FONTS}/VarelaRound-Regular.ttf")
    open(out, "w").write(
        f'<!doctype html><html><head><meta charset="utf-8"><style>{css}'
        f'@page{{size:{PAGE_W}mm {PAGE_H}mm;margin:0}}'
        f'html,body{{margin:0;background:#fff}}'
        f'svg{{display:block;width:{PAGE_W}mm;height:{PAGE_H}mm}}'
        f'</style></head><body>{svg}</body></html>')

    print(f"  label {D}mm ({D/25.4:.2f} in), {COLS*ROWS} per sheet")
    print(f"  QR {QR_MM}mm overall, {n}x{n} modules at error level H "
          f"-> {m:.2f}mm per module")
    side = (n + 8) * m
    print(f"  ball {BALL}mm in a {HALO}mm clearing = {HALO/m:.1f} modules "
          f"({(HALO/side)**2 * 78.5:.1f}% of the code area cleared)")


if __name__ == "__main__":
    main()
