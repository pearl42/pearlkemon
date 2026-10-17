#!/usr/bin/env python3
"""
Cut files for Silhouette Studio: the shape, and a scale frame around it.

WHY THE FRAME. Silhouette Studio ignores DXF units and scales each drawing to
fit the page, so a tall piece and a wide piece arrive at different scales and
no longer fit together. Proof from the first export: the red came in 2.979x
too big, the black 1.479x -- different factors, so it is not a unit error.
What they had in common is that each file's LONGEST side landed on the same
number.

So every file now carries an identical rectangle, exactly 8 x 10 inches,
around the piece. Fit-to-page then scales every file by the same factor,
which keeps the three pieces in proportion to each other, and the rectangle
gives one known dimension to type in to fix the absolute size:

    import -> select all -> lock the aspect -> set width to 8.000 in
            -> delete the rectangle

Nothing else is in the files: no text, no fold lines, no stroke on the piece.
The black file also carries the buttonhole slit, because that is a cut.

SVG and DXF of each, plus one file with all three pieces inside a single frame
if you would rather scale once and copy the pieces out.

Usage:  python3 make-pokeball-cutfiles.py <out-dir> [ball-inches]
"""
import sys, os, importlib.util

HERE = __file__.rsplit("/", 1)[0]
spec = importlib.util.spec_from_file_location("cs", f"{HERE}/make-pokeball-cardstock.py")
cs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cs)

FRAME_W, FRAME_H = 203.2, 254.0    # exactly 8 x 10 inches: round in the units
                                   # Silhouette is usually set to
PAD = 8.0                          # breathing room inside the frame
SIMPLIFY = 0.03                    # mm: thins the arcs without moving them visibly


def rings(geom):
    """Every closed ring of a (single-part) polygon, outer first."""
    g = geom.simplify(SIMPLIFY, preserve_topology=True)
    gs = g.geoms if g.geom_type == "MultiPolygon" else [g]
    out = []
    for p in gs:
        out.append(list(p.exterior.coords))
        out.extend(list(i.coords) for i in p.interiors)
    return out


def layout(geoms):
    """Centre the pieces in the frame; return them plus the placement offset."""
    minx = min(g.bounds[0] for g in geoms); maxx = max(g.bounds[2] for g in geoms)
    miny = min(g.bounds[1] for g in geoms); maxy = max(g.bounds[3] for g in geoms)
    dx = (FRAME_W - (maxx - minx)) / 2 - minx
    dy = (FRAME_H - (maxy - miny)) / 2 - miny
    return dx, dy


# ---------------------------------------------------------------- SVG ------
def svg(path, geoms, slit=None):
    """Filled paths, no stroke, inside the 8x10in frame."""
    dx, dy = layout(geoms)
    top = FRAME_H                                 # SVG y runs down, so flip
    body = [f'<rect x="0" y="0" width="{FRAME_W}" height="{FRAME_H}" '
            f'fill="none" stroke="#000000" stroke-width="0.1"/>']
    for g in geoms:
        d = []
        for ring in rings(g):
            pts = " L ".join(f"{x+dx:.3f},{top-(y+dy):.3f}" for x, y in ring)
            d.append(f"M {pts} Z")
        body.append(f'<path d="{" ".join(d)}" fill="#000000" stroke="none"/>')
    if slit:
        (x1, y1), (x2, y2) = slit
        body.append(f'<path d="M {x1+dx:.3f},{top-(y1+dy):.3f} '
                    f'L {x2+dx:.3f},{top-(y2+dy):.3f}" '
                    f'fill="none" stroke="#000000" stroke-width="0.1"/>')
    open(path, "w").write(
        f'<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<svg xmlns="http://www.w3.org/2000/svg" version="1.1" '
        f'width="{FRAME_W}mm" height="{FRAME_H}mm" '
        f'viewBox="0 0 {FRAME_W} {FRAME_H}">\n' + "\n".join(body) + '\n</svg>\n')


# ---------------------------------------------------------------- DXF ------
def dxf(path, geoms, slit=None):
    """R12 DXF: closed POLYLINEs, y up, inside the same 8x10in frame."""
    dx, dy = layout(geoms)
    o = ["0", "SECTION", "2", "HEADER",
         "9", "$ACADVER", "1", "AC1009",
         "9", "$INSUNITS", "70", "4",            # 4 = mm; Silhouette ignores it
         "0", "ENDSEC",
         "0", "SECTION", "2", "ENTITIES"]

    def poly(points, closed=True):
        out = ["0", "POLYLINE", "8", "0", "66", "1", "70", "1" if closed else "0"]
        for x, y in points:
            out += ["0", "VERTEX", "8", "0", "10", f"{x:.4f}", "20", f"{y:.4f}"]
        return out + ["0", "SEQEND", "8", "0"]

    o += poly([(0, 0), (FRAME_W, 0), (FRAME_W, FRAME_H), (0, FRAME_H)])
    for g in geoms:
        for ring in rings(g):
            o += poly([(x + dx, y + dy) for x, y in ring[:-1]])
    if slit:
        (x1, y1), (x2, y2) = slit
        o += ["0", "LINE", "8", "0",
              "10", f"{x1+dx:.4f}", "20", f"{y1+dy:.4f}",
              "11", f"{x2+dx:.4f}", "21", f"{y2+dy:.4f}"]
    o += ["0", "ENDSEC", "0", "EOF"]
    open(path, "w").write("\n".join(o) + "\n")


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "."
    inches = float(sys.argv[2]) if len(sys.argv) > 2 else 3.5
    os.makedirs(out, exist_ok=True)
    B = cs.Ball(inches * 25.4)

    slit = ((-B.slit / 2, B.slit_flat), (B.slit / 2, B.slit_flat))
    for name, geom, sl in (("black", B.black, slit), ("red", B.red, None),
                           ("white", B.white, None)):
        svg(f"{out}/cameo-{name}.svg", [geom], sl)
        dxf(f"{out}/cameo-{name}.dxf", [geom], sl)
        minx, miny, maxx, maxy = geom.bounds
        n = sum(len(r) for r in rings(geom))
        print(f"  {name:5s} {maxx-minx:6.1f} x {maxy-miny:6.1f} mm "
              f"({(maxx-minx)/25.4:5.3f} x {(maxy-miny)/25.4:5.3f} in)   {n:4d} points")

    # all three in one frame, for scaling once and copying the pieces out
    from shapely import affinity as af
    GAP = 9.0
    col_x = B.black.bounds[2] + GAP                      # right of the black
    red_dx = col_x - B.red.bounds[0]
    red_dy = B.black.bounds[3] - B.red.bounds[3]         # top-aligned
    wht_dx = col_x - B.white.bounds[0]
    wht_dy = (B.black.bounds[3] - B.red.bounds[3] - (B.red.bounds[3] - B.red.bounds[1])
              - GAP) - B.white.bounds[3]
    trio = [B.black,
            af.translate(B.red, red_dx, red_dy),
            af.translate(B.white, wht_dx, wht_dy)]
    sl3 = ((-B.slit / 2, B.slit_flat), (B.slit / 2, B.slit_flat))
    svg(f"{out}/cameo-all-three.svg", trio, sl3)
    dxf(f"{out}/cameo-all-three.dxf", trio, sl3)
    print(f"\n  frame in every file: {FRAME_W} x {FRAME_H} mm "
          f"= {FRAME_W/25.4:.3f} x {FRAME_H/25.4:.3f} in")

    # where to put score lines, measured from the piece's own edges
    minx, miny, maxx, maxy = B.black.bounds
    print(f"\n  black piece is {maxy-miny:.1f} mm tall")
    print(f"  upper fold: {maxy - B.f:.1f} mm down from its top edge")
    print(f"  lower fold: {-B.f - miny:.1f} mm up from its bottom edge")
    print(f"  white tongue fold: {B.white.bounds[3] - B.white_fold:.1f} mm "
          f"down from the tongue's tip")


if __name__ == "__main__":
    main()
