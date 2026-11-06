"""Render every Level 1 DFD in the Essence style into ./out.  Run: py build_level1.py"""
import os
import sys
sys.path.insert(0, os.path.dirname(__file__))
from dfdkit import level1
import level1_data as D

OUT = os.path.join(os.path.dirname(__file__), 'out')
os.makedirs(OUT, exist_ok=True)
for table in (D.EXISTING, D.PROPOSED):
    for name, (entity, mods) in table.items():
        for p, w, h in level1(os.path.join(OUT, name), entity, mods):
            print(os.path.basename(p), w, h)
