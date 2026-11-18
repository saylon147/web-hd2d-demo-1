from PIL import Image,ImageDraw
from pathlib import Path
base=Path(__file__).resolve().parent
sheet=Image.new('RGB',(1500,638),'#efece4')
draw=ImageDraw.Draw(sheet)
for row,view in enumerate(['entrance','house']):
    for col,sky in enumerate(['day','dusk','night']):
        x,y=500*col,319*row
        draw.text((x+12,y+8),f'{view.title()} / {sky.title()}    Pixel 480',fill='black')
        image=Image.open(base/f'{view}-{sky}.png')
        sheet.paste(image.resize((500,287),Image.Resampling.LANCZOS),(x,y+29))
sheet.save(base/'comparison.jpg',quality=94)
