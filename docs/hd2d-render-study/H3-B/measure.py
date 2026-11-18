"""Measure isolated bright samples and assemble lossless 1:1 review crops."""
from pathlib import Path
import json
import numpy as np
from PIL import Image,ImageDraw,ImageFilter

root=Path(__file__).resolve().parent
regions={'roof':(233,66,485,177),'wall':(489,349,681,468)}
modes=['default','no-mips','aniso','msaa','double','double-msaa','no-specular','no-normal','solid','no-shadows','depth-precision']
results={}
for width in [480,640]:
    sheet=Image.new('RGB',(3*480,4*154),'#f1ebdf')
    draw=ImageDraw.Draw(sheet)
    for i,name in enumerate(['native']+[str(width)+'-'+m for m in modes]):
        im=Image.open(root/'sampling'/(name+'.png')).convert('RGB')
        w=im.width if name=='native' else width
        h=round(w*im.height/im.width)
        internal=im.resize((w,h),Image.Resampling.NEAREST).convert('L')
        delta=np.asarray(internal,dtype=float)-np.asarray(internal.filter(ImageFilter.MedianFilter(3)))
        metrics={}
        x=(i%3)*480;y=(i//3)*154
        for key,(l,t,r,b) in regions.items():
            area=delta[round(t*h/im.height):round(b*h/im.height),round(l*w/im.width):round(r*w/im.width)]
            metrics[key]={'peaks':int((area>32).sum()),'peakDelta':int(area.max()),'samples':int(area.size)}
            sheet.paste(im.crop((l,t,r,b)),(x+(0 if key=='roof' else 259),y+28))
        draw.text((x+4,y+6),name+'   roof / wall',fill='black')
        results[name]=metrics
    sheet.save(root/f'sampling-{width}-1to1.png')

bloom={}
sheet=Image.new('RGB',(4*380,2*264),'#f1ebdf')
draw=ImageDraw.Draw(sheet)
for col,mode in enumerate(['native','480','480-before','480-after']):
    pair=[]
    for row,state in enumerate(['off','on']):
        im=Image.open(root/'bloom'/f'{mode}-{state}.png').convert('RGB')
        pair.append(np.asarray(im,dtype=float))
        x,y=col*380,row*264
        sheet.paste(im.crop((482,340,862,572)),(x,y+26))
        draw.text((x+4,y+6),f'{mode} / Bloom {state}',fill='black')
    delta=np.max(abs(pair[1]-pair[0]),axis=2)
    y,x=np.where(delta>5)
    bloom[mode]={'changedPercent':round(100*len(x)/delta.size,3),'bounds':[int(n) for n in (x.min(),y.min(),x.max(),y.max())]}
sheet.save(root/'bloom-1to1.png')
(root/'metrics.json').write_text(json.dumps({'sampling':results,'bloom':bloom},indent=2)+'\n')
