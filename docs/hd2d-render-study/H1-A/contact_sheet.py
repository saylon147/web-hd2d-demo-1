"""Rebuild the H1-A contact sheet from the eight original browser captures."""
from pathlib import Path
from PIL import Image, ImageDraw

folder = Path(__file__).resolve().parent
sheet = Image.new("RGB", (1600, 760), "#f5f1e6")
draw = ImageDraw.Draw(sheet)
for row, view in enumerate(["entrance", "side"]):
    for column, mode in enumerate(["native", "640", "480", "320"]):
        frame = Image.open(folder / f"{view}-{mode}.png").convert("RGB")
        x, y = column * 400, row * 380
        draw.text((x + 6, y + 6), f"{view.title()}  /  {mode.title()}     |     facade crop 1:1 below", fill="black")
        sheet.paste(frame.resize((400, round(400 * frame.height / frame.width)), Image.Resampling.LANCZOS), (x, y+31))
        cx = int(frame.width * (0.57 if row == 0 else 0.58))
        cy = int(frame.height * 0.48)
        sheet.paste(frame.crop((cx-200,cy-55,cx+200,cy+55)), (x,y+265))
sheet.save(folder / "comparison.jpg", quality=95)
