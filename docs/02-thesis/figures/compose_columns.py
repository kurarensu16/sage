"""Place two rendered DFD columns side by side as one figure image.

Usage: python compose_columns.py <column_a.png> <column_b.png> <out.png>
"""
import sys

from PIL import Image, ImageDraw

GAP = 140          # space between columns (px)
DIVIDER = "#CCCCCC"


def main(a_path, b_path, out_path):
    a, b = Image.open(a_path).convert("RGB"), Image.open(b_path).convert("RGB")
    width, height = a.width + GAP + b.width, max(a.height, b.height)
    canvas = Image.new("RGB", (width, height), "white")
    canvas.paste(a, (0, 0))
    canvas.paste(b, (a.width + GAP, 0))
    x = a.width + GAP // 2
    ImageDraw.Draw(canvas).line([(x, 20), (x, height - 20)], fill=DIVIDER, width=3)
    canvas.save(out_path)
    print(f"wrote {out_path} {canvas.size}")


if __name__ == "__main__":
    main(*sys.argv[1:4])
