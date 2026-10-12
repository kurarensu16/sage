"""Figure 2.7 — Level 0 DFD (ASPIRE context diagram), drawn as a hand-laid-out SVG.

Mermaid's auto-layout cannot place a central process with entities around it, so this
figure is generated directly: one inbound and one outbound arrow per external entity,
each with its own label, in the grayscale style of the other figures.

Usage: python make_figure_2_7.py <out.svg>
"""
import math
import sys
from html import escape

W, H = 2700, 2200
FONT = "trebuchet ms, verdana, arial, sans-serif"
FS = 30           # data-flow label size
LINE = 1.25 * FS  # label line height
CHAR = 0.52 * FS  # approximate character width for layout
INK, LINE_GREY, BOX_FILL = "#000000", "#555555", "#FFFFFF"
ACCENT = "#1E3A8A"

CX, CY, R = W / 2, 1180, 215
ENTITIES = {  # name: (centre x, centre y, width, height, label lines)
    "ai": (W / 2, 200, 640, 150, ["AI Model Provider", "Gemini 2.5 Flash via OpenRouter"]),
    "student": (360, 560, 400, 130, ["Student"]),
    "faculty": (360, 1800, 400, 130, ["Faculty"]),
    "dean": (W - 360, 560, 400, 130, ["College Dean"]),
    "admin": (W - 360, 1800, 400, 130, ["Admin"]),
}
FLOWS = {  # entity: (to ASPIRE, from ASPIRE)
    "student": (["credentials", "plan acknowledgments", "task completion reports",
                 "consultation requests", "profile, guardian, alert settings"],
                ["posted grades and GWA", "published study plans",
                 "task verifications and returns", "AI Study Tutor diagnostics"]),
    "faculty": (["activity scores and metadata", "attendance", "evaluations and catch-up tasks",
                 "task verifications, follow-ups", "SG correction proposals"],
                ["grade previews", "risk-sorted rosters", "AI task drafts", "correction decisions"]),
    "dean": (["correction decisions", "case dispositions", "report parameters"],
             ["SG correction proposals", "escalated cases", "Risk and Honors Overview",
              "intervention results, reports"]),
    "admin": (["user accounts, CSV/Excel imports", "academic setup, term settings", "grade overrides"],
              ["system metrics", "activity logs"]),
    "ai": (["JSON diagnostics", "AI task drafts"], ["metadata-grounded prompts"]),
}
OFFSET = 34  # half gap between the paired arrows
LABEL_AT = {"ai": 0.16}  # fraction along the arrow from the entity (default 0.5)


def text_block(x, y, lines, anchor="middle", size=FS, weight="normal", fill=INK):
    out = [f'<text x="{x:.1f}" y="{y:.1f}" font-family="{FONT}" font-size="{size}" '
           f'font-weight="{weight}" fill="{fill}" text-anchor="{anchor}">']
    for i, line in enumerate(lines):
        out.append(f'<tspan x="{x:.1f}" dy="{0 if i == 0 else LINE:.1f}">{escape(line)}</tspan>')
    out.append("</text>")
    return "".join(out)


def box_edge_point(cx, cy, w, h, dx, dy):
    """Point where a ray from the box centre in direction (dx, dy) leaves the box."""
    tx = (w / 2) / abs(dx) if dx else math.inf
    ty = (h / 2) / abs(dy) if dy else math.inf
    t = min(tx, ty)
    return cx + dx * t, cy + dy * t


def arrow(x1, y1, x2, y2):
    return (f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{LINE_GREY}" '
            f'stroke-width="3" marker-end="url(#head)"/>')


def label_for(mx, my, nx, ny, lines, header):
    """Place a label block (bold direction header + flows) beside an arrow on the normal's side."""
    lines = [header] + lines
    bw = max(len(s) for s in lines) * CHAR
    bh = len(lines) * LINE
    gap = 26 + abs(nx) * bw / 2 + abs(ny) * bh / 2
    bx, by = mx + nx * gap, my + ny * gap
    pad = 10
    rect = (f'<rect x="{bx - bw / 2 - pad:.1f}" y="{by - bh / 2 - pad:.1f}" width="{bw + 2 * pad:.1f}" '
            f'height="{bh + 2 * pad:.1f}" fill="#FFFFFF" fill-opacity="0.9"/>')
    first_baseline = by - bh / 2 + 0.8 * FS
    return (rect + text_block(bx, first_baseline, lines[:1], weight="bold", fill=ACCENT)
            + text_block(bx, first_baseline + LINE, lines[1:]))


def main(path):
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">',
             '<defs><marker id="head" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="5" markerHeight="5" '
             f'orient="auto-start-reverse"><path d="M0,0 L12,6 L0,12 z" fill="{LINE_GREY}"/></marker></defs>',
             f'<rect width="{W}" height="{H}" fill="#FFFFFF"/>']
    arrows, labels = [], []
    for key, (ex, ey, ew, eh, _) in ENTITIES.items():
        dx, dy = CX - ex, CY - ey
        length = math.hypot(dx, dy)
        ux, uy = dx / length, dy / length          # entity -> ASPIRE
        nx, ny = -uy, ux                           # left-hand normal
        inbound, outbound = FLOWS[key]
        for sign, lines, towards_system in ((1, inbound, True), (-1, outbound, False)):
            ox, oy = nx * OFFSET * sign, ny * OFFSET * sign
            sx, sy = box_edge_point(ex, ey, ew + 24, eh + 24, ux, uy)
            tx, ty = CX - ux * (R + 14), CY - uy * (R + 14)
            sx, sy, tx, ty = sx + ox, sy + oy, tx + ox, ty + oy
            arrows.append(arrow(sx, sy, tx, ty) if towards_system else arrow(tx, ty, sx, sy))
            t = LABEL_AT.get(key, 0.5)
            mx, my = sx + (tx - sx) * t, sy + (ty - sy) * t
            header = "to ASPIRE" if towards_system else "from ASPIRE"
            labels.append(label_for(mx, my, nx * sign, ny * sign, lines, header))
    parts += arrows + labels

    # External entities: white boxes with a dark border.
    for ex, ey, ew, eh, lines in ENTITIES.values():
        parts.append(f'<rect x="{ex - ew / 2:.1f}" y="{ey - eh / 2:.1f}" width="{ew}" height="{eh}" '
                     f'fill="{BOX_FILL}" stroke="#333333" stroke-width="4"/>')
        top = ey - (len(lines) - 1) * LINE / 2 + 0.35 * 36
        parts.append(text_block(ex, top, lines[:1], size=36, weight="bold"))
        if len(lines) > 1:
            parts.append(text_block(ex, top + LINE, lines[1:], size=FS))

    # The single process.
    parts.append(f'<circle cx="{CX}" cy="{CY}" r="{R}" fill="{ACCENT}"/>')
    parts.append(text_block(CX, CY - 22, ["0"], size=40, weight="bold", fill="#FFFFFF"))
    parts.append(text_block(CX, CY + 30, ["ASPIRE"], size=46, weight="bold", fill="#FFFFFF"))
    parts.append(text_block(CX, CY + 84, ["System"], size=46, weight="bold", fill="#FFFFFF"))

    # Legend.
    ly = H - 120
    parts.append(f'<rect x="{CX - 900}" y="{ly - 70}" width="1800" height="140" fill="#FAFAFA" stroke="#BBBBBB" stroke-width="2"/>')
    parts.append(text_block(CX - 860, ly + 10, ["Legend:"], anchor="start", weight="bold"))
    parts.append(f'<rect x="{CX - 690}" y="{ly - 32}" width="70" height="64" fill="#FFFFFF" stroke="#333333" stroke-width="4"/>')
    parts.append(text_block(CX - 600, ly + 10, ["External entity"], anchor="start"))
    parts.append(f'<circle cx="{CX - 230}" cy="{ly}" r="34" fill="{ACCENT}"/>')
    parts.append(text_block(CX - 180, ly + 10, ["Process (the system)"], anchor="start"))
    parts.append(arrow(CX + 220, ly, CX + 340, ly))
    parts.append(text_block(CX + 360, ly + 10, ["Data flow (labelled to / from ASPIRE)"], anchor="start"))

    parts.append("</svg>")
    with open(path, "w", encoding="utf-8") as handle:
        handle.write("\n".join(parts))


if __name__ == "__main__":
    main(sys.argv[1])
