"""Trace center rays of bright samples remaining in the flat-material roof probe."""
import json,struct
from pathlib import Path
import numpy as np
from PIL import Image,ImageFilter
root=Path(__file__).resolve().parent
model=root.parents[2]/'public/assets/models/courtyard_cottage_preview.glb'
with model.open('rb') as f:
    g=json.loads(f.read(struct.unpack_from('<I',f.read(20),12)[0]))
    f.read(8)
    buf=f.read()
def accessor(index,dtype,k):
    a=g['accessors'][index]
    view=g['bufferViews'][a['bufferView']]
    return np.frombuffer(buf,dtype,a['count']*k,view.get('byteOffset',0)+a.get('byteOffset',0)).reshape(-1,k)
prim=g['meshes'][0]['primitives'][0]
p=accessor(prim['attributes']['POSITION'],'<f4',3).astype(float)
idx=prim['indices']
tri=accessor(idx,{5123:'<u2',5125:'<u4'}[g['accessors'][idx]['componentType']],1).reshape(-1,3)
p=(p-(p.max(0)+p.min(0))/2)*6.7/np.ptp(p[:,0])
p[:,1]-=p[:,1].min()
p+=[2.5,0,-2.7]
_,weld=np.unique(p,axis=0,return_inverse=True)
faces=weld[tri]
edges=np.sort(np.concatenate([faces[:,[0,1]],faces[:,[1,2]],faces[:,[2,0]]]),axis=1)
_,counts=np.unique(edges,axis=0,return_counts=True)
print('open edges',int((counts==1).sum()),'exact duplicate faces',len(tri)-len(np.unique(np.sort(faces,axis=1),axis=0)))
a,b,c=p[tri].transpose(1,0,2)
records=json.loads((root/'captures.json').read_text())['records']
for width in (480,640):
    record=next(r for r in records if r['file']==f'sampling/{width}-solid.png')
    camera=np.fromstring(record['camera'],sep=',').reshape(4,4).T
    eye=camera[:3,3]
    w,h=map(int,record['resolution'].split('×'))
    image=Image.open(root/record['file'])
    aspect=image.width/image.height
    lum=image.resize((w,h),Image.Resampling.NEAREST).convert('L')
    delta=np.asarray(lum,dtype=float)-np.asarray(lum.filter(ImageFilter.MedianFilter(3)))
    for region,(l,t0,r,b0) in {'roof':(233,66,485,177),'wall':(489,349,681,468)}.items():
        xs,ys=round(l*w/image.width),round(t0*h/image.height)
        v,u=np.where(delta[ys:round(b0*h/image.height),xs:round(r*w/image.width)]>32)
        stats={'front':0,'back-only':0,'miss':0}
        for x,y in zip(u+xs,v+ys):
            screen=np.array([((x+.5)/w*2-1)*aspect,1-(y+.5)/h*2])*np.tan(np.radians(17.5))
            ray=camera[:3,:3]@np.array([*screen,-1])
            e=b-a;cross=np.cross(ray,c-a);det=(e*cross).sum(axis=1)
            s=eye-a;q=np.cross(s,e)
            with np.errstate(divide='ignore',invalid='ignore'):
                u0=(s*cross).sum(axis=1)/det;v0=(q*ray).sum(axis=1)/det;t=((c-a)*q).sum(axis=1)/det
            hit=(u0>=0)&(v0>=0)&(u0+v0<=1)&(t>0)
            stats['front' if np.any(hit&(det>0)) else 'back-only' if hit.any() else 'miss']+=1
        print(width,region,stats)
