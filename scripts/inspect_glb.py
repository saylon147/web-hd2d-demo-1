"""Independent standard-library glTF inspection; no Blender dependency."""
import argparse
import hashlib
import json
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read_glb(path):
    data = Path(path).read_bytes()
    magic, version, length = struct.unpack_from('<III', data)
    if magic != 0x46546C67 or version != 2 or length != len(data):
        raise ValueError('Invalid GLB 2 header/length')
    offset, document, binary = 12, None, b''
    while offset < length:
        size, kind = struct.unpack_from('<II', data, offset)
        chunk = data[offset+8:offset+8+size]
        if kind == 0x4E4F534A:
            document = json.loads(chunk)
        elif kind == 0x004E4942:
            binary = chunk
        offset += 8+size
    if document is None:
        raise ValueError('Missing glTF JSON')
    return document, binary, data


def image_dimensions(data, mime):
    if mime == 'image/png':
        return list(struct.unpack_from('>II', data, 16))
    if mime != 'image/jpeg':
        return None
    offset = 2
    while offset < len(data):
        if data[offset] != 0xFF:
            offset += 1
            continue
        marker = data[offset+1]
        offset += 2
        if marker in (0xD8,0xD9) or 0xD0 <= marker <= 0xD7:
            continue
        length = struct.unpack_from('>H', data, offset)[0]
        if marker in (0xC0,0xC1,0xC2,0xC3,0xC5,0xC6,0xC7,0xC9,0xCA,0xCB,0xCD,0xCE,0xCF):
            height,width = struct.unpack_from('>HH', data, offset+3)
            return [width,height]
        offset += length
    raise ValueError('Could not find JPEG dimensions')


def inspect(path):
    document, binary, data = read_glb(path)
    primitives=[]
    for mesh in document.get('meshes',[]):
        for primitive in mesh['primitives']:
            accessors = document['accessors']
            position=accessors[primitive['attributes']['POSITION']]
            count=accessors[primitive['indices']]['count'] if 'indices' in primitive else position['count']
            primitives.append({'mode':primitive.get('mode',4),'vertices':position['count'],
                'triangles':count//3 if primitive.get('mode',4)==4 else None,
                'attributes':primitive['attributes'],'material':primitive.get('material'),
                'positionBounds':[position.get('min'),position.get('max')]})
    images=[]
    for item in document.get('images',[]):
        if 'bufferView' not in item:
            raise ValueError('Spike requires embedded images, no external paths')
        view=document['bufferViews'][item['bufferView']]
        blob=binary[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']]
        size=image_dimensions(blob,item['mimeType'])
        images.append({'name':item.get('name'),'mimeType':item['mimeType'],'bytes':len(blob),
                       'dimensions':size,'sha256':hashlib.sha256(blob).hexdigest()})
    return {'input':str(path),'fileBytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),
        'asset':document['asset'],'nodes':document.get('nodes',[]),'meshes':len(document.get('meshes',[])),
        'primitives':primitives,'triangleCount':sum(p['triangles'] or 0 for p in primitives),
        'images':images,'materials':document.get('materials',[]),'textures':document.get('textures',[]),
        'extensionsUsed':document.get('extensionsUsed',[]),'extensionsRequired':document.get('extensionsRequired',[]),
        'gpuTextureRgbaMipEstimateBytes':sum((i['dimensions'][0]*i['dimensions'][1]*4*4/3) for i in images if i['dimensions']),
        'gpuEstimateDefinition':'RGBA8 plus complete mip chain; excludes geometry/framebuffer; browser allocation may differ'}


if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('input',nargs='?',type=Path,default=ROOT/'art-source/tripo/inbox/rocky pyramid 3d model.glb')
    parser.add_argument('--output',type=Path,default=ROOT/'artifacts/tripo-rock/inspection.json')
    args=parser.parse_args()
    if not args.input.is_file():
        parser.error(f'Missing Tripo input; expected {args.input}')
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(inspect(args.input),indent=2)+'\n',encoding='utf-8')
    print(f'Inspection written to {args.output}')
