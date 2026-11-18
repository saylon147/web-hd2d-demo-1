"""Build the H4 cutout atlas from the supplied male turnaround (Pillow, NumPy)."""
import json
from pathlib import Path

import numpy as np
from PIL import Image

root = Path(__file__).resolve().parents[1]
source = Image.open(root / "art-source/sprites/man.png").convert("RGB")
out = root / "public/assets/sprites"
out.mkdir(exist_ok=True, parents=True)
cell, height = 48, 44
atlas = Image.new("RGBA", (4 * cell, 4 * cell))
frames = {}
for row, direction in enumerate(("front", "back", "left", "right")):
    walk = []
    for col in range(4):
        box = tuple(round(v * source.width / 4) for v in (col, row, col+1, row+1))
        tile = source.crop(box)
        rgb = np.asarray(tile, dtype=int)
        background = np.median(rgb[:8], axis=(0, 1))
        mask = np.max(abs(rgb - background), axis=2) > 35
        tile.putalpha(Image.fromarray(mask.astype("uint8") * 255))
        tile = tile.crop(tile.getbbox())
        sprite = tile.resize((round(tile.width * height / tile.height), height), Image.Resampling.NEAREST)
        # Center the head; a swinging foot or arm must not shift the whole figure.
        head = np.where(np.asarray(sprite.getchannel("A"))[:10] > 0)[1]
        x = col * cell + cell // 2 - round(float(np.median(head)))
        y = row * cell + cell - 2 - height
        assert col * cell <= x and x + sprite.width <= (col+1) * cell
        atlas.paste(sprite, (x, y))
        walk.append({"x": col*cell, "y": row*cell, "w": cell, "h": cell})
    frames[direction] = {"walk": walk, "idle": [walk[1]]}
atlas.save(out / "gardener.png")
metadata = {"image": "gardener.png", "size": list(atlas.size), "anchorPx": [24, 46],
            "visibleHeightPx": height, "stepFrameMeters": 0.16, "directions": frames}
(out / "gardener.json").write_text(json.dumps(metadata, indent=2) + "\n")
