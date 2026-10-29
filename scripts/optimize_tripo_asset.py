"""Headless Blender GLB LOD spike. Original remains byte-identical.

blender --background --factory-startup --python-exit-code 1 --python
scripts/optimize_tripo_asset.py -- [input.glb output-dir] [--config JSON]
"""
import argparse
from array import array
import hashlib
import json
import math
from pathlib import Path
import shutil
import struct
import sys
import time

import bpy
import bmesh
from mathutils import Matrix, Vector

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(Path(__file__).resolve().parent))
from inspect_glb import inspect, read_glb

parser=argparse.ArgumentParser()
parser.add_argument('input',nargs='?',type=Path)
parser.add_argument('output',nargs='?',type=Path)
parser.add_argument('--config',type=Path,default=ROOT/'art-source/tripo/rock_pipeline.json')
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
config=json.loads(args.config.read_text(encoding='utf-8'))
input_path=args.input or ROOT/config['input']
output=args.output or ROOT/config['outputDirectory']
reports=ROOT/config['reports']
for path in [output,reports,ROOT/config['blend']]:
    (path.parent if path.suffix else path).mkdir(parents=True,exist_ok=True)
if not input_path.is_file():
    raise FileNotFoundError(f'Missing Tripo GLB. Expected: {input_path}')
assert bpy.app.version[:3]==(5,2,1), f'Validated version is Blender 5.2.1; detected {bpy.app.version_string}'
started=time.perf_counter()
original=inspect(input_path)
(reports/'inspection.json').write_text(json.dumps(original,indent=2)+'\n',encoding='utf-8')
source_json, source_bin, source_bytes=read_glb(input_path)
assert len(source_json.get('meshes',[]))==1 and len(source_json.get('materials',[]))==1 and len(source_json['meshes'][0]['primitives'])==1, f"Unsupported Tripo structure: {len(source_json.get('meshes',[]))} meshes / {len(source_json.get('materials',[]))} materials. This pipeline requires one mesh, one primitive, one material; explicit conversion is needed."
assert len(source_json.get('images',[]))==3, 'Expected three embedded PBR images; explicit texture conversion is needed'
source_material=source_json['materials'][0]
assert source_material.get('pbrMetallicRoughness',{}).get('baseColorTexture',{}).get('index')==0 and source_material.get('pbrMetallicRoughness',{}).get('metallicRoughnessTexture',{}).get('index')==1 and source_material.get('normalTexture',{}).get('index')==2, 'Unsupported PBR texture layout; explicit channel conversion is needed'
assert not source_json.get('extensionsRequired'), 'Required extensions need explicit conversion first'
assert not source_json['materials'][0].get('extensions'), 'Active material extensions require an explicit conversion policy'

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(input_path),merge_vertices=True)
mesh_objects=[obj for obj in bpy.context.scene.objects if obj.type=='MESH']
assert len(mesh_objects)==1
high=mesh_objects[0]
high.data.transform(high.matrix_world)
high.matrix_world=Matrix.Identity(4)
high.name='Tripo_Rock_High'
minimum=[min(v.co[a] for v in high.data.vertices) for a in range(3)]
maximum=[max(v.co[a] for v in high.data.vertices) for a in range(3)]
factor=config['runtimeWidthM']/(maximum[0]-minimum[0])
offset=Vector(((minimum[0]+maximum[0])/2,(minimum[1]+maximum[1])/2,minimum[2]))
for vertex in high.data.vertices:
    vertex.co=(vertex.co-offset)*factor
high.data.update()
high.data.calc_loop_triangles()


def topology(obj):
    bm=bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    visited=bytearray(len(bm.verts))
    shells=[]
    for start in bm.verts:
        if visited[start.index]:
            continue
        stack=[start]
        visited[start.index]=1
        count=0
        while stack:
            vertex=stack.pop()
            count+=1
            for edge in vertex.link_edges:
                other=edge.other_vert(vertex)
                if not visited[other.index]:
                    visited[other.index]=1
                    stack.append(other)
        shells.append(count)
    result={'vertices':len(bm.verts),'edges':len(bm.edges),'faces':len(bm.faces),
            'boundaryEdges':sum(edge.is_boundary for edge in bm.edges),
            'nonmanifoldEdges':sum(not edge.is_manifold for edge in bm.edges),
            'looseVertices':sum(not v.link_faces for v in bm.verts),
            'zeroAreaFaces':sum(face.calc_area()<1e-12 for face in bm.faces),
            'connectedShellCount':len(shells),'largestShellVertexCounts':sorted(shells,reverse=True)[:10],
            'signedVolumeM3':bm.calc_volume(signed=True),
            'hiddenFacesAssessment':'Topology only; enclosed/intersecting/internal sheets cannot be reliably classified without an expensive solid analysis. Front/back renders are required.'}
    bm.free()
    return result


print('TOPOLOGY_START',flush=True)
source_topology=topology(high)
print('TOPOLOGY',json.dumps(source_topology),flush=True)
(reports/'source-topology.json').write_text(json.dumps(source_topology,indent=2)+'\n',encoding='utf-8')

# Opt-in cleanup on a copy: only tiny disconnected input fragments, never the high reference.
cleaned_high=high
cleanup_report={'performed':False}
shell_limit=config.get('removeTinyShellsMaxVertices',0)
if shell_limit:
    cleaned_high=high.copy()
    cleaned_high.data=high.data.copy()
    bpy.context.collection.objects.link(cleaned_high)
    cleaned_high.name='Tripo_Rock_Cleaned'
    bm=bmesh.new()
    bm.from_mesh(cleaned_high.data)
    visited=set()
    remove=[]
    for start in bm.verts:
        if start in visited:
            continue
        stack=[start]
        visited.add(start)
        component=[]
        while stack:
            vertex=stack.pop()
            component.append(vertex)
            for edge in vertex.link_edges:
                other=edge.other_vert(vertex)
                if other not in visited:
                    visited.add(other)
                    stack.append(other)
        if len(component)<=shell_limit:
            remove.extend(component)
    assert len(remove)<len(bm.verts)*0.001, 'Tiny-fragment cleanup exceeds 0.1%; review input explicitly'
    removed=len(remove)
    bmesh.ops.delete(bm,geom=remove,context='VERTS')
    bm.to_mesh(cleaned_high.data)
    bm.free()
    cleaned_high.data.update()
    cleanup_report={'performed':True,'removedVertices':removed,'maxShellVertices':shell_limit,'after':topology(cleaned_high),'policy':'copy only; disconnected shells up to configured vertex threshold, total <0.1%; high reference unmodified'}

# Exact source blobs at 4K; downscales through Blender Image, no map rebaking.
textures={}
cache=reports/'texture-cache'
cache.mkdir(exist_ok=True)
for limit in config['textureLimits']:
    blobs=[]
    for index,item in enumerate(source_json['images']):
        view=source_json['bufferViews'][item['bufferView']]
        blob=source_bin[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']]
        original_path=cache/item['name']
        original_path.write_bytes(blob)
        width,height=original['images'][index]['dimensions']
        target_ratio=min(1,limit/max(width,height))
        if target_ratio<1:
            image=bpy.data.images.load(str(original_path),check_existing=False)
            image.colorspace_settings.name='sRGB' if index==0 else 'Non-Color'
            image.scale(round(width*target_ratio),round(height*target_ratio))
            resized_path=cache/f'{limit}-{index}.{ "png" if index==2 else "jpg" }'
            image.filepath_raw=str(resized_path)
            image.file_format='PNG' if index==2 else 'JPEG'
            image.save()
            blob=resized_path.read_bytes()
            bpy.data.images.remove(image)
        blobs.append(blob)
    textures[limit]=blobs


def attach_textures(geometry_path,destination,limit):
    doc,binary,_=read_glb(geometry_path)
    binary=bytearray(binary)
    doc['materials']=source_json['materials']
    doc['textures']=source_json['textures']
    doc['samplers']=source_json.get('samplers',[])
    doc['images']=[]
    for index,(source_image,blob) in enumerate(zip(source_json['images'],textures[limit])):
        binary.extend(b'\0'*((-len(binary))%4))
        view_index=len(doc['bufferViews'])
        doc['bufferViews'].append({'buffer':0,'byteOffset':len(binary),'byteLength':len(blob)})
        binary.extend(blob)
        doc['images'].append({'name':f'rock_{index}_{limit}','mimeType':source_image['mimeType'],'bufferView':view_index})
    for mesh in doc['meshes']:
        for primitive in mesh['primitives']:
            primitive['material']=0
    # Source only lists unused volume/ngon hints; output uses standard PBR fields.
    doc.pop('extensionsUsed',None)
    doc.pop('extensionsRequired',None)
    doc['buffers']=[{'byteLength':len(binary)}]
    json_bytes=json.dumps(doc,separators=(',',':')).encode()
    json_bytes+=b' '*((-len(json_bytes))%4)
    binary.extend(b'\0'*((-len(binary))%4))
    total=12+8+len(json_bytes)+8+len(binary)
    destination.write_bytes(struct.pack('<III',0x46546C67,2,total)+struct.pack('<II',len(json_bytes),0x4E4F534A)+json_bytes+struct.pack('<II',len(binary),0x004E4942)+binary)


def export_geometry(obj,path):
    bpy.ops.object.select_all(action='DESELECT')
    obj.hide_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active=obj
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,
        export_apply=True,export_materials='NONE',export_texcoords=True,export_normals=True,export_tangents=True)


variants=[]
url_prefix=config.get('runtimeUrlPrefix','/assets/models/tripo-rock/')
reference_path=output/'rock-original-4k.glb'
shutil.copyfile(input_path,reference_path)
variants.append({'id':'original-4k','trianglesTarget':original['triangleCount'],'textureLimit':4096,'original':True,
                 'modelUrl':url_prefix+reference_path.name,**inspect(reference_path)})
geometry_cache=reports/'geometry-cache'
geometry_cache.mkdir(exist_ok=True)
previous=cleaned_high
for target in sorted(config['triangleTargets'],reverse=True):
    print('DECIMATE_START',target,flush=True)
    obj=previous.copy()
    obj.data=previous.data.copy()
    bpy.context.collection.objects.link(obj)
    obj.name=f'Coastal_Rock_{target}'
    obj.data.calc_loop_triangles()
    ratio=target/len(obj.data.loop_triangles)
    modifier=obj.modifiers.new('Progressive_QEM','DECIMATE')
    modifier.decimate_type='COLLAPSE'
    modifier.ratio=ratio
    modifier.use_collapse_triangulate=True
    bpy.context.view_layer.objects.active=obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.data.calc_loop_triangles()
    uv_values=array('f',[0])* (len(obj.data.uv_layers.active.data)*2)
    obj.data.uv_layers.active.data.foreach_get('uv',uv_values)
    assert all(math.isfinite(v) for v in uv_values), 'Finite UV coordinates required'
    lod_topology=topology(obj)
    geom_path=geometry_cache/f'{target}.glb'
    export_geometry(obj,geom_path)
    for limit in config['textureLimits']:
        destination=output/f'rock-{target//1000}k-{limit//1024}k.glb'
        attach_textures(geom_path,destination,limit)
        info=inspect(destination)
        assert info['triangleCount']<=target*1.15, 'Target triangle tolerance exceeded'
        assert len(info['images'])==3 and all(max(image['dimensions'])<=limit for image in info['images'])
        assert all('NORMAL' in primitive['attributes'] and 'TEXCOORD_0' in primitive['attributes'] for primitive in info['primitives'])
        variants.append({'id':f'{target//1000}k-{limit//1024}k','trianglesTarget':target,'textureLimit':limit,
                         'targetDeviation':info['triangleCount']-target,'modelUrl':url_prefix+destination.name,
                         'topology':lod_topology,**info})
    previous=obj
    print('DECIMATE_DONE',target,len(obj.data.loop_triangles),flush=True)

default_mesh=bpy.data.objects[f"Coastal_Rock_{int(config['defaultVariant'].split('-')[0][:-1])*1000}"]
for obj in bpy.context.scene.objects:
    obj.hide_set(obj != default_mesh)
    obj.hide_render=obj != default_mesh
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/config['blend']),compress=True)
assert hashlib.sha256(input_path.read_bytes()).hexdigest()==original['sha256'], 'Original was modified'
manifest={'schemaVersion':1,'approval':'experimental-awaiting-human','sourceSha256':original['sha256'],
          'defaultVariant':config['defaultVariant'],'runtimeWidthM':config['runtimeWidthM'],
          'placement':config['placement'],'rotationYDegrees':config['rotationYDegrees'],
          'lighting':config['lighting'],'inspectionCamera':config['inspectionCamera'],
          'performance':config['performance'],'variants':variants}
(ROOT/config['manifest']).write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
result={'blenderVersion':bpy.app.version_string,'seconds':time.perf_counter()-started,'sourceSha256':original['sha256'],
        'originalPreserved':True,'strategy':'progressive Blender COLLAPSE QEM '+ '→'.join(str(target) for target in sorted(config['triangleTargets'],reverse=True)) + '; UV interpolation, normals exported',
        'normalBakingPerformed':False,'extensions':'source volume/ngon declarations have no active payload or required entry; output uses standard PBR',
        'texturePolicy':'4K blobs preserved exactly; 2K/1K downscaled with Blender Image, base sRGB, ORM/normal Non-Color',
        'sourceTopology':source_topology,'cleanup':cleanup_report,'variants':variants}
(reports/'optimization.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print('OPTIMIZATION_COMPLETE',result['seconds'],flush=True)
