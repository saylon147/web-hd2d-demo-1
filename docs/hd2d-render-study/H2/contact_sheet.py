from pathlib import Path
from PIL import Image, ImageDraw
folder = Path(__file__).resolve().parent
cases = [('native-off','Native'),('native-before','Native + DOF'),('480-off','Pixel 480'),('480-before','DOF then Pixel 480'),('480-after','Pixel 480 then DOF'),('640-off','Pixel 640'),('640-before','DOF then Pixel 640'),('640-after','Pixel 640 then DOF')]
sheet = Image.new('RGB',(1600,800),'#f4f0e6')
draw = ImageDraw.Draw(sheet)
for i,(name,label) in enumerate(cases):
    frame = Image.open(folder/(name+'.png')).convert('RGB')
    x,y = (i%4)*400,(i//4)*400
    draw.text((x+8,y+8),label,fill='black')
    sheet.paste(frame.resize((400,229),Image.Resampling.LANCZOS),(x,y+28))
    sheet.paste(frame.crop((620,335,900,470)),(x,y+260))
    sheet.paste(frame.crop((400,500,520,635)),(x+280,y+260))
sheet.save(folder/'comparison.jpg',quality=95)
