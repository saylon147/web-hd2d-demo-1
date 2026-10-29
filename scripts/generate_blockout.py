"""Blender 5.2.1: deterministic M2.1 spatial blockout, GLB, metrics and clay evidence.

Run: blender --background --factory-startup --python-exit-code 1
     --python scripts/generate_blockout.py -- [--params PATH] [--skip-renders]
Geometry helpers accept runtime coordinates (+Y up); source stores (x,-z,y).
No textures, AI geometry, or final art are produced.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import random
import sys

import bpy
import bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0, str(Path(__file__).resolve().parent))
from terrain_blockout import coastal_mesh
from survey_blockout import survey_land, net_floor_area


ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--params', type=Path, default=ROOT / 'art-source/parameters/island_cottage_v2.json')
parser.add_argument('--skip-renders', action='store_true')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
params_bytes = args.params.read_bytes().replace(b'\r\n', b'\n')  # Stable provenance across Git newline settings.
p = json.loads(params_bytes)
assert p['schemaVersion'] == 1
assert bpy.app.version[:3] == (5, 2, 1), 'Use Blender 5.2.1 for reproducible source/export.'
outputs = {key: ROOT / value for key, value in p['outputs'].items()}
for key, path in outputs.items():
    (path if key == 'evidence' else path.parent).mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
rng = random.Random(p['seed'])
nodes = {}
walls = []
wall_plans = []
furniture_blockers = []


def source(point):
    x, y, z = point
    return (x, -z, y)


def group(name, parent=None):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    obj['placeholder'] = True
    nodes[name] = obj
    return obj


def linear(value):
    return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4


def material(name, hex_color):
    mat = bpy.data.materials.new(name)
    rgba = tuple(linear(int(hex_color[i:i+2], 16) / 255) for i in (0, 2, 4)) + (1,)
    mat.diffuse_color = rgba
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = rgba
    shader.inputs['Roughness'].default_value = 0.9
    return mat


palette = p['palette']
clay = material('diagnostic_walls_placeholder', palette['walls'])
rock = material('diagnostic_rock_placeholder', palette['rock'])
roof_mat = material('diagnostic_roof_placeholder', palette['roof'])
furniture = material('diagnostic_furniture_placeholder', palette['furniture'])
paving = material('diagnostic_paths_placeholder', palette['paths'])
garden_mat = material('diagnostic_garden_placeholder', palette['garden'])
water_mat = material('diagnostic_water_placeholder', palette['water'])
floor_mat = material('diagnostic_floor_placeholder', palette['floor'])
bs_floor_mat = material('diagnostic_basementFloor_placeholder', palette['basementFloor'])
stair_mat = material('diagnostic_stairs_placeholder', palette['stairs'])
land_mat = material('diagnostic_land_placeholder', palette['land'])
sand_mat = material('diagnostic_sand_placeholder', palette['sand'])

def mesh(name, vertices, faces, parent, mat):
    data = bpy.data.meshes.new(name)
    data.from_pydata([source(v) for v in vertices], [], faces)
    data.update()
    bm = bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(data)
    bm.free()
    uv = data.uv_layers.new(name='UVMap')
    for polygon in data.polygons:
        for loop_index in polygon.loop_indices:
            co = data.vertices[data.loops[loop_index].vertex_index].co
            uv.data[loop_index].uv = ((co.x + 20) / 40, (co.y + 20) / 40)
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    obj.data.materials.append(mat)
    obj['placeholder'] = True
    return obj


def box(name, center, size, parent, mat=clay):
    x, y, z = center
    w, h, d = size
    vertices = [(x+sx*w/2, y+sy*h/2, z+sz*d/2)
                for sx, sy, sz in [(-1,-1,-1),(1,-1,-1),(1,-1,1),(-1,-1,1),
                                   (-1,1,-1),(1,1,-1),(1,1,1),(-1,1,1)]]
    return mesh(name, vertices, [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)], parent, mat)


def prism(name, outline, bottom, top, parent, mat):
    count = len(outline)
    vertices = [(x, bottom, z) for x, z in outline] + [(x, top, z) for x, z in outline]
    faces = [tuple(range(count-1, -1, -1)), tuple(range(count, count*2))]
    faces += [(i, (i+1) % count, (i+1) % count + count, i+count) for i in range(count)]
    return mesh(name, vertices, faces, parent, mat)


def difference(obj, center, size):
    cutter = box('_temporary_cut', center, size, None)
    bpy.context.view_layer.objects.active = obj
    mod = obj.modifiers.new('spatial_opening', 'BOOLEAN')
    mod.operation = 'DIFFERENCE'
    mod.solver = 'EXACT'
    mod.object = cutter
    bpy.ops.object.modifier_apply(modifier=mod.name)
    cutter_data = cutter.data
    bpy.data.objects.remove(cutter, do_unlink=True)
    bpy.data.meshes.remove(cutter_data)


def area(outline):
    return abs(sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(outline, outline[1:]+outline[:1]))) / 2


root = group('IslandRoot')
terrain = group('Terrain', root)
terrain_ext = group('TerrainExterior', terrain)
terrain_section = group('TerrainSection', terrain)
shore = group('Shoreline', root)
water = group('Water', root)
pier = group('Pier', root)
garden = group('Garden', root)
terrace = group('Terrace', root)
paths = group('Paths', root)
cottage = group('CottageRoot', root)
cottage['placement_anchor'] = 'IslandRoot sea-level origin; house center in manifest'
roof = group('Roof', cottage)
exterior = group('ExteriorWalls', cottage)
ground = group('GroundFloor', cottage)
gf_structure = group('GroundFloor_Structure', ground)
gf_interior = group('GroundFloor_InteriorWalls', ground)
gf_full = group('GF_Interior_Full', gf_interior)
gf_cut = group('GF_Interior_Cutaway', gf_interior)
gf_furniture = group('GroundFloor_Furniture', ground)
stair = group('StairsDown', ground)
basement = group('Basement', cottage)
bs_structure = group('Basement_Structure', basement)
bs_back = group('Basement_BackLeftWalls', bs_structure)
bs_front = group('Basement_FrontRightWalls', bs_structure)
bs_interior = group('Basement_InteriorWalls', basement)
bs_full = group('BS_Interior_Full', bs_interior)
bs_cut = group('BS_Interior_Cutaway', bs_interior)
bs_furniture = group('Basement_Furniture', basement)
stairs_up = group('StairsUp', basement)
stairs_up['role'] = 'bottom entrance anchor; physical shared staircase is GroundFloor/StairsDown'

h = p['house']
i = p['island']
s = p['internalStair']
cx, cz = h['center']
w, d = h['width'], h['depth']
assert w == 6 and d == 6, 'V1 retains the reviewed 6×6 plan. Revise net-room plans together before changing the footprint.'
sx, sz = w / 6, d / 6
floor_y, basement_y, thickness = h['floorY'], h['basementFloorY'], h['wallThickness']
basement_ceiling = floor_y - h['floorThickness']
basement_clear = basement_ceiling - basement_y
assert 2.3 <= basement_clear <= 2.5, 'Basement clear height must be 2.3–2.5m.'
assert 2.6 <= h['clearHeight'] <= 2.8
assert basement_y - h['basementFloorThickness'] > 0.5, 'Basement must remain above sea.'
stair_width = s['flightWidth']*2 + s['gap']
stair_depth = s['stepsPerFlight']*s['tread'] + s['landing']
bay_left, bay_back = -w/2 + thickness*sx, -d/2 + thickness*sz
bay_right, bay_front = bay_left + stair_width, bay_back + stair_depth
assert bay_right + 0.9 < 0.3*sx and bay_front < d/2 - 1.2, 'House too small for stair/circulation.'
riser = (floor_y-basement_y) / (2*s['stepsPerFlight'])
assert riser <= 0.19 and s['tread'] >= 0.26 and s['flightWidth'] >= 0.9


def house_box(name, center, size, parent, mat=clay):
    x,y,z = center
    return box(name, (cx+x*sx, y, cz+z*sz), (size[0]*sx, size[1], size[2]*sz), parent, mat)


vertices, faces, zones, plateau_outline = coastal_mesh(i['terrain'], i['plateauY'], i['beachY'], p['seed'])
coast = mesh('Organic_Coastal_Mass', vertices, faces, terrain_ext, rock)
coast.data.materials.append(land_mat)
coast.data.materials.append(sand_mat)
for poly, zone in zip(coast.data.polygons, zones):
    poly.material_index = {'rock': 0, 'land': 1, 'sand': 2}[zone]
rock_meshes = [coast]
outlines = [plateau_outline]
# True basement excavation in the high rock core.
difference(coast, (cx, (i['plateauY']+basement_y)/2, cz),
           (w+0.08, i['plateauY']-basement_y+0.2, d+0.08))
upper_end = i['mainStairStartZ'] + i['upperSteps']*i['mainStairTread']
lower_start = upper_end + i['landing']
lower_end = lower_start + i['lowerSteps']*i['mainStairTread']
# Cut to each tread elevation, not a broad rectangular canyon.
for start, start_y, end_y, count in [(i['mainStairStartZ'], i['plateauY'], i['terraceY'], i['upperSteps']),
                                   (lower_start, i['terraceY'], i['beachY'], i['lowerSteps'])]:
    for step in range(count):
        top = start_y-(start_y-end_y)*(step+1)/count
        recess = top-0.025  # Separate the terrain from the visible tread to prevent coplanar flicker.
        difference(coast, (i['mainStairX'], (recess+10)/2, start+(step+0.5)*i['mainStairTread']),
                   (i['mainStairWidth']+0.06, 10-recess, i['mainStairTread']+0.002))
difference(coast, (i['mainStairX'], (i['terraceY']-0.025+10)/2, (upper_end+lower_start)/2),
           (i['mainStairWidth']+0.06, 10-i['terraceY']+0.025, i['landing']))
section = coast.copy()
section.data = coast.data.copy()
bpy.context.collection.objects.link(section)
section.parent = terrain_section
section.name = 'Organic_Coastal_Section'
difference(section, (cx+1.5, 5, cz+7), (w+5, 12, d+16))
box('Sea_Plane', (0,-0.05,2), (120,0.1,120), water, water_mat)
# Detached rocks are visual only; they no longer define the main silhouette.
for index, (x,z) in enumerate([(-11,-4),(-9,8),(10,3),(8,9),(-7,11)]):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=1, location=source((x, 0.4, z)))
    obj = bpy.context.object
    obj.name = f'Coastal_Rock_Visual_{index:02d}'
    obj.scale = (rng.uniform(0.65,1.1),rng.uniform(0.8,1.3),rng.uniform(0.5,0.95))
    obj.parent = shore
    obj.data.materials.append(rock)
    obj['placeholder'] = True
courtyard_outline = [(-4.3,1.5),(-1.1,1.5),(-1.1,2.25),(5.2,2.25),(5.2,3.8),(-4.3,4.3)]
prism('Courtyard', courtyard_outline, i['plateauY']-0.02, i['plateauY']+0.035, terrace, paving)
box('Garden_Loop_Path', (-5.9,i['plateauY']+0.03,-2), (1.2,0.06,4.6), paths,paving)
box('Back_Garden_Path', (-2.9,i['plateauY']+0.03,-5.9), (6.2,0.06,1.2), paths,paving)
box('Right_House_Path', (5.9,i['plateauY']+0.03,-2), (1.2,0.06,5.7), paths,paving)
box('Stair_Approach', (i['mainStairX'],i['plateauY']+0.03,4.05), (1.6,0.06,0.5), paths,paving)
for index in range(5):
    box(f'Local_Retaining_Stone_{index}', (0.3+index*0.85,i['plateauY']-0.15,3.9-index*0.04), (0.82,0.35,0.35), terrace, rock)
for index in range(3):
    box(f'Garden_Bed_{index}', (-3.8+index*1.25,i['plateauY']+0.18,-3.1), (0.9,0.36,3),garden,garden_mat)
for index, (x,z) in enumerate([(-6.7,-3.8),(-4.5,-6.8),(1,-6.7),(6,-4.8)]):
    box(f'Tree_Trunk_{index}', (x,i['plateauY']+0.85,z), (0.25,1.7,0.25),garden,furniture)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=1.05,location=source((x,i['plateauY']+2,z)))
    obj=bpy.context.object
    obj.name=f'Tree_Crown_Placeholder_{index}'
    obj.parent=garden
    obj.data.materials.append(garden_mat)
    obj['placeholder']=True

for label,start,end,start_y,end_y,count in [
    ('Upper',i['mainStairStartZ'],upper_end,i['plateauY'],i['terraceY'],i['upperSteps']),
    ('Lower',lower_start,lower_end,i['terraceY'],i['beachY'],i['lowerSteps']),
]:
    for step in range(count):
        top=start_y-(start_y-end_y)*(step+1)/count
        box(f'Coast_Stair_{label}_{step+1:02d}', (i['mainStairX'],(top+end_y-0.1)/2,start+(step+0.5)*i['mainStairTread']),
            (i['mainStairWidth'],top-end_y+0.1,i['mainStairTread']), paths,paving)
box('Coast_Mid_Landing', (i['mainStairX'],i['terraceY']-0.05,(upper_end+lower_start)/2), (i['mainStairWidth'],0.1,i['landing']),paths,paving)
box('Beach_Pier_Path', (i['mainStairX'],i['beachY']+0.025,(lower_end+p['pier']['startZ'])/2),
    (1.6,0.05,p['pier']['startZ']-lower_end),shore,paving)
q=p['pier']
box('Pier_Deck', (i['mainStairX'],q['deckY']-0.1,q['startZ']+q['length']/2), (q['width'],0.2,q['length']),pier,furniture)
box('Pier_Access_Step', (i['mainStairX'],i['beachY']+0.05,q['startZ']-0.25), (q['width'],0.1,0.5),pier,paving)
for row in range(4):
    for side in (-1,1):
        box(f'Pier_Post_{row}_{side}', (i['mainStairX']+side*q['width']/2,0.4,q['startZ']+0.3+row*(q['length']-0.6)/3), (0.18,1.5,0.18),pier,furniture)

gf_slab=house_box('GroundFloor_Slab',(0,floor_y-h['floorThickness']/2,0),(6,h['floorThickness'],6),gf_structure,floor_mat)
difference(gf_slab,(cx+(bay_left+bay_right)/2,floor_y,cz+(bay_back+bay_front)/2),(stair_width,1.2,stair_depth))
house_box('Basement_Slab',(0,basement_y-h['basementFloorThickness']/2,0),(6,h['basementFloorThickness'],6),bs_structure,bs_floor_mat)


def wall(name, axis, fixed, low, high, floor, height, parent, openings=(), record=False):
    # Openings are (center along wall, width, sill, opening height).
    center=((low+high)/2,floor+height/2,fixed) if axis=='x' else (fixed,floor+height/2,(low+high)/2)
    size=(high-low,height,thickness) if axis=='x' else (thickness,height,high-low)
    obj=house_box(name,center,size,parent)
    for u,width,sill,opening_height in openings:
        center=(cx+u*sx,floor+sill+opening_height/2,cz+fixed*sz) if axis=='x' else (cx+fixed*sx,floor+sill+opening_height/2,cz+u*sz)
        size=(width*sx,opening_height,thickness*sz+0.2) if axis=='x' else (thickness*sx+0.2,opening_height,width*sz)
        difference(obj,center,size)
    if record:
        walls.append(obj)
        wall_plans.append({'name':name, 'axis':axis, 'fixed':fixed, 'low':low, 'high':high,
                           'floorY':floor, 'height':height, 'thickness':thickness, 'openings':list(openings)})
    return obj


for side,axis,fixed in [('Front','x',3),('Right','z',3),('Back','x',-3),('Left','z',-3)]:
    parent=group('Exterior_'+side,exterior)
    fixed = math.copysign(3-thickness/2, fixed)  # outer face remains exactly ±3, then scales with footprint
    openings={'Front':[(-0.2,1,0,2.1),(2.0,0.65,1.45,0.65)],'Right':[(-1.4,1.3,1,1.1)],'Back':[(1.5,1.3,1,1.1)],'Left':[(1.8,1.1,1.05,1.1)]}[side]
    wall('Wall_'+side,axis,fixed,-3,3,floor_y,h['clearHeight'],parent,openings,True)
    wall('Basement_Wall_'+side,axis,fixed,-3,3,basement_y,basement_clear,bs_front if side in ('Front','Right') else bs_back,record=True)
house_box('Front_Door_Placeholder',(-0.2,floor_y+1.04,3-thickness/2),(0.94,2.08,0.07),nodes['Exterior_Front'],furniture)
house_box('Porch_Threshold',(-0.2,(floor_y+i['plateauY'])/2,3.18),(1.3,floor_y-i['plateauY'],0.36),terrace,paving)

for parent,height,record in [(gf_full,h['clearHeight'],True),(gf_cut,1.05,False)]:
    wall('GF_Bedroom_Front_'+parent.name,'x',0.3,0.4,2.7,floor_y,height,parent,record=record)
    wall('GF_Bedroom_Left_'+parent.name,'z',0.4,-2.7,0.3,floor_y,height,parent,[(-0.5,0.9,0,2.1)],record)
    wall('GF_Bathroom_Left_'+parent.name,'z',1.15,0.65,2.7,floor_y,height,parent,[(1.65,0.9,0,2.1)],record)
    wall('GF_Bathroom_Back_'+parent.name,'x',0.65,1.15,2.7,floor_y,height,parent,record=record)
for parent,height,record in [(bs_full,basement_clear,True),(bs_cut,0.95,False)]:
    wall('BS_Storage_Right_'+parent.name,'z',-0.65,0.65,2.7,basement_y,height,parent,[(1.4,0.9,0,2.1)],record)
    wall('BS_Workshop_Front_'+parent.name,'x',0.3,0.3,2.7,basement_y,height,parent,[(0.85,0.9,0,2.1)],record)

for name,center,size in [
    ('Kitchen_Counter',(-2.43,floor_y+0.45,2.0),(0.55,0.9,1.4)),
    ('Dining_Table',(0.75,floor_y+0.38,2.35),(0.55,0.76,0.55)),
    ('Living_Bench',(-2.2,floor_y+0.3,0.95),(0.8,0.6,0.4)),
    ('Bedroom_Bed',(2.0,floor_y+0.25,-1.6),(1.3,0.5,2.0)),
    ('Bathroom_Shower',(2.2,floor_y+0.04,2.24),(0.8,0.08,0.8)),
    ('Bathroom_Toilet',(2.25,floor_y+0.22,1.20),(0.42,0.44,0.55)),
    ('Bathroom_Basin',(1.62,floor_y+0.4,0.99),(0.48,0.8,0.32)),
]:
    furniture_blockers.append(house_box(name,center,size,gf_furniture,furniture))
for name,center,size in [
    ('Storage_Shelf',(-1.9,basement_y+0.75,2.45),(1.4,1.5,0.42)),
    ('Workshop_Bench',(2.35,basement_y+0.43,-1.4),(0.6,0.86,2.0)),
    ('Rest_Bench',(1.55,basement_y+0.3,2.35),(1.7,0.6,0.5)),
    ('Reading_Table',(1.3,basement_y+0.32,1.65),(0.7,0.64,0.6)),
]:
    furniture_blockers.append(house_box(name,center,size,bs_furniture,furniture))

# Solid U-stair: two adjacent flights and one full-width landing. Entire bay is open above.
run=s['stepsPerFlight']*s['tread']
mid_y=(floor_y+basement_y)/2
for step in range(s['stepsPerFlight']):
    top=basement_y+(step+1)*riser
    box(f'Internal_Stair_Lower_{step+1:02d}',(cx+bay_left+s['flightWidth']/2,(top+basement_y)/2,cz+bay_front-(step+0.5)*s['tread']),
        (s['flightWidth'],top-basement_y,s['tread']),stair,stair_mat)
    top=mid_y+(step+1)*riser
    box(f'Internal_Stair_Upper_{step+1:02d}',(cx+bay_right-s['flightWidth']/2,(top+basement_y)/2,cz+bay_back+s['landing']+(step+0.5)*s['tread']),
        (s['flightWidth'],top-basement_y,s['tread']),stair,stair_mat)
box('Internal_Stair_MidLanding',(cx+(bay_left+bay_right)/2,(mid_y+basement_y)/2,cz+bay_back+s['landing']/2),(stair_width,mid_y-basement_y,s['landing']),stair,stair_mat)
box('Stair_Void_Guard',(cx+bay_right+0.03,floor_y+0.5,cz+(bay_back+bay_front)/2),(0.06,1.0,stair_depth),gf_structure,furniture)
stairs_up.location=source((cx+bay_left+s['flightWidth']/2,basement_y,cz+bay_front))

eave_y=floor_y+h['clearHeight']
rw,rd=w/2+h['eaves'],d/2+h['eaves']
roof_vertices=[(cx-rw,eave_y,cz-rd),(cx+rw,eave_y,cz-rd),(cx,eave_y+h['roofRise'],cz-rd),
               (cx-rw,eave_y,cz+rd),(cx+rw,eave_y,cz+rd),(cx,eave_y+h['roofRise'],cz+rd)]
mesh('Pitched_Roof_Blockout',roof_vertices,[(0,2,5,3),(2,1,4,5),(0,1,2),(3,5,4),(0,3,4,1)],roof,roof_mat)
house_box('Chimney_Blockout',(1.7,eave_y+h['roofRise']-0.1,-1.2),(0.48,0.95,0.48),roof,clay)

# Validate circulation against the actual Boolean-opened wall meshes (including door headroom).
routes={
    'ground-to-stair': [('ground',(-0.2,3.3)),('ground',(-0.2,1.6)),('ground',(-1.25,0.9)),('ground',(-1.25,bay_front))],
    'ground-to-bedroom': [('ground',(-0.2,3.3)),('ground',(-0.2,1.6)),('ground',(-0.2,-0.5)),('ground',(0.95,-0.5)),('ground',(0.95,-1.0))],
    'ground-to-bathroom': [('ground',(-0.2,3.3)),('ground',(-0.2,1.6)),('ground',(0.55,1.65)),('ground',(1.65,1.65))],
    'ground-to-kitchen': [('ground',(-0.2,3.3)),('ground',(-0.2,1.6)),('ground',(-1.7,2.0))],
    'basement-to-workshop': [('basement',(-2.25,bay_front)),('basement',(-2.25,1.4)),('basement',(-0.2,1.4)),('basement',(0.85,0.8)),('basement',(0.85,-0.2))],
}
bpy.context.view_layer.update()
clearance_checks = 0
for label,points in routes.items():
    for (_,a),(_,b) in zip(points,points[1:]):
        for height in (0.25,1.1,2.05):
            y=(floor_y if points[0][0]=='ground' else basement_y)+height
            start=Vector(source((cx+a[0]*sx,y,cz+a[1]*sz)))
            end=Vector(source((cx+b[0]*sx,y,cz+b[1]*sz)))
            direction=(end-start).normalized()
            side = Vector((-direction.y,direction.x,0))
            for offset in (-0.3,0,0.3):
                for obj in walls+furniture_blockers:
                    hit,_,_,_=obj.ray_cast(start+side*offset,direction,distance=(end-start).length)
                    assert not hit, f'Circulation route {label} at {height}m / offset {offset} intersects {obj.name}'
                clearance_checks += 1


def set_mode(mode):
    for obj in root.children_recursive:
        obj.hide_render=False
        obj.hide_set(False)
    def hide(name,hidden=True):
        for obj in [nodes[name]]+list(nodes[name].children_recursive):
            obj.hide_render=hidden
            obj.hide_set(hidden)
    hide('TerrainSection', mode!='basement')
    hide('TerrainExterior', mode=='basement')
    hide('Roof',mode!='exterior')
    hide('Exterior_Front',mode!='exterior')
    hide('Exterior_Right',mode!='exterior')
    hide('GF_Interior_Cutaway',mode!='ground-floor')
    hide('GF_Interior_Full',mode!='exterior')
    hide('BS_Interior_Cutaway',mode!='basement')
    hide('BS_Interior_Full',mode=='basement')
    if mode=='ground-floor':
        hide('Basement')
    if mode=='basement':
        for name in ['ExteriorWalls','GroundFloor_Structure','GroundFloor_InteriorWalls','GroundFloor_Furniture','Garden','Terrace','Paths','Shoreline','Pier']:
            hide(name)
        hide('Basement_FrontRightWalls')


scene=bpy.context.scene
scene.render.engine='BLENDER_EEVEE'
scene.render.resolution_x=1440
scene.render.resolution_y=900
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.world=bpy.data.worlds.new('Clay_World')
scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(0.7,0.73,0.7,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=p['lighting']['blenderWorld']
scene.view_settings.view_transform='AgX'
light_data=bpy.data.lights.new('Inspection_Sun','SUN')
light_data.energy=p['lighting']['blenderSun']
light_data.angle=0.12
light=bpy.data.objects.new('Inspection_Sun',light_data)
scene.collection.objects.link(light)
light.rotation_euler=(Vector(source((0,0,0)))-Vector(source((-8,15,10)))).to_track_quat('-Z','Y').to_euler()
camera_data=bpy.data.cameras.new('Inspection_Camera')
camera=bpy.data.objects.new('Inspection_Camera',camera_data)
scene.collection.objects.link(camera)
scene.camera=camera


def set_camera(view, ortho=None):
    target=view['target']
    yaw=math.radians(view['baseYaw']+view['yawOffset'])
    pitch=math.radians(view['pitch'])
    dist=view['distance']
    camera.location=source((target['x']+dist*math.cos(pitch)*math.sin(yaw),target['y']+dist*math.sin(pitch),target['z']+dist*math.cos(pitch)*math.cos(yaw)))
    direction=Vector(source((target['x'],target['y'],target['z'])))-camera.location
    camera.rotation_euler=direction.to_track_quat('-Z','Y').to_euler()
    camera_data.type='ORTHO' if ortho else 'PERSP'
    if ortho:
        camera_data.ortho_scale=ortho
    else:
        camera_data.sensor_fit='VERTICAL'
        camera_data.sensor_height=24
        camera_data.lens=12/math.tan(math.radians(view['fov'])/2)
    camera_data.clip_start=0.1
    camera_data.clip_end=150


def export_selected(path, objects):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.hide_set(False)
        obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,
        export_apply=True,export_extras=True,export_cameras=False,export_lights=False)


bpy.context.view_layer.update()
land_metrics = survey_land([coast]+list(paths.children_recursive)+[bpy.data.objects['Courtyard'], bpy.data.objects['Beach_Pier_Path']],
                          [obj for obj in garden.children_recursive if obj.name.startswith(('Garden_Bed','Tree_Trunk'))],
                          h, {**i['terrain'], 'ratioRange': i['landRatioRange']})
export_selected(outputs['model'], [root]+list(root.children_recursive))
axis_root=group('AxisTestRoot')
axis_objects=[axis_root]
for name,source_point in [('Axis_PosX',(1,0,0)),('Axis_PosY',(0,1,0)),('Axis_PosZ',(0,0,1))]:
    bpy.ops.mesh.primitive_cube_add(size=0.12,location=source_point)
    obj=bpy.context.object
    obj.name=name
    obj.parent=axis_root
    obj.data.materials.append(clay)
    axis_objects.append(obj)
export_selected(outputs['axis'],axis_objects)
for obj in axis_objects:
    bpy.data.objects.remove(obj,do_unlink=True)
nodes.pop('AxisTestRoot')

rooms_ground=[
    {'name':'Living / kitchen','rect':[-2.7,0.65,1.0,2.7]},
    {'name':'Bedroom','rect':[0.55,-2.7,2.7,0.15]},
    {'name':'Bathroom','rect':[1.30,0.80,2.7,2.7]},
]
rooms_basement=[
    {'name':'Storage','rect':[-2.7,0.65,-0.8,2.7]},
    {'name':'Workshop','rect':[0.3,-2.7,2.7,0.15]},
    {'name':'Rest / reading','rect':[0.3,0.65,2.7,2.7]},
]
for room in rooms_ground+rooms_basement:
    rect=room['rect']
    room['areaM2']=round((rect[2]-rect[0])*sx*(rect[3]-rect[1])*sz,3)
rooms_ground[0]['areaM2'] = net_floor_area(walls, [cx-2.7,cz-2.7,cx+2.7,cz+2.7],
    [cx+bay_left,cz+bay_back,cx+bay_right,cz+bay_front],
    [[cx+a,cz+b,cx+c,cz+d] for a,b,c,d in [rooms_ground[1]['rect'],rooms_ground[2]['rect']]], floor_y)
rooms_ground[0]['definition'] = 'net living/kitchen plus shared circulation, excludes partitions/stair/closed rooms; furniture occupies part of this floor'
report={
    'schemaVersion':1,'approval':'candidate-awaiting-human','generator':'scripts/generate_blockout.py',
    'blenderVersion':bpy.app.version_string,'parametersSha256':hashlib.sha256(params_bytes).hexdigest(),
    'coordinates':{'source':'Blender Z-up','runtime':'Three.js Y-up','mapping':'(x,y,z) -> (x,z,-y)','units':'meters'},
    'land':{**land_metrics,
            'areaM2':land_metrics['areaM2'],'cottageFootprintM2':w*d,'ratio':land_metrics['areaM2']/(w*d),
            'outlineScale':1,'outlines':outlines,'plateauY':i['plateauY'],'terraceY':i['terraceY'],'beachY':i['beachY']},
    'house':{**h,'basementClearHeight':basement_clear,'basementCeilingY':basement_ceiling,'groundCeilingY':eave_y,
             'aboveGroundStoreys':1,'basementStoreys':1,'seaClearance':basement_y-h['basementFloorThickness'],
             'groundRooms':rooms_ground,'basementRooms':rooms_basement,
             'roomAreaDefinition':'bedroom and bathroom rectangles are net clear faces; living/circulation sampled minus stair, walls, closed rooms; basement open zones are shared, not net enclosed rooms'},
    'stair':{'footprint':[bay_left,bay_back,bay_right,bay_front],'riser':riser,'tread':s['tread'],
             'flightWidth':s['flightWidth'],'landing':s['landing'],'totalRisers':s['stepsPerFlight']*2,
             'rise':floor_y-basement_y,'minimumHeadroom':min(basement_clear,h['clearHeight']),
             'headroomBasis':'full stair-bay opening through ground slab; no slab above either flight',
             'corridorWidth':0.4*sx-thickness*sx/2-bay_right-0.06},
    'coastalStair':{'x':i['mainStairX'],'upperRiser':(i['plateauY']-i['terraceY'])/i['upperSteps'],
                    'lowerRiser':(i['terraceY']-i['beachY'])/i['lowerSteps'],'width':i['mainStairWidth'],
                    'upperStartZ':i['mainStairStartZ'],'upperEndZ':upper_end,'lowerStartZ':lower_start,'lowerEndZ':lower_end},
    'courtyard':{'outline':courtyard_outline,'areaM2':area(courtyard_outline)},
    'circulation':{'routes':routes,'wallRayTestsPassed':True,'primaryOutdoorPathWidth':1.2,
                   'sweptWidthM':0.6,'rayChecks':clearance_checks,
                   'clearances':{'entranceDoor':1.0,'bedroomDoor':0.9,'bathroomDoor':0.9,
                                 'bedSide':0.8,'bedFoot':0.75,'bathroomEntryToToilet':0.74,
                                 'gardenPaths':1.2,'coastalStair':1.6,'pier':1.8}},
    'planWalls':wall_plans,
    'planFurniture':[{'name':obj.name,'boundsXZ':[min(v.co.x for v in obj.data.vertices)-cx,
                       min(-v.co.y for v in obj.data.vertices)-cz,max(v.co.x for v in obj.data.vertices)-cx,
                       max(-v.co.y for v in obj.data.vertices)-cz],
                     'floor':'ground' if obj.parent == gf_furniture else 'basement'} for obj in furniture_blockers],
    'views':p['views'],'sourceMeshes':sum(obj.type=='MESH' for obj in root.children_recursive),
    'section':{'sliceX':cx+bay_right-s['flightWidth']/2,'targetY':eave_y/2,'orthoScale':14},
}
outputs['report'].write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
manifest={
    'schemaVersion':1,'id':'island_cottage_blockout_v2','lighting':p['lighting'],'approval':'placeholder-awaiting-human',
    'modelUrl':'/assets/models/'+outputs['model'].name,'axisUrl':'/assets/models/'+outputs['axis'].name,
    'modelSha256':hashlib.sha256(outputs['model'].read_bytes()).hexdigest(),'units':'meters','upAxis':'Y',
    'metrics':{'landAreaM2':report['land']['areaM2'],'houseAreaM2':w*d,'landRatio':report['land']['ratio'],
               'groundHeight':h['clearHeight'],'basementHeight':basement_clear,'courtyardAreaM2':area(courtyard_outline)},
    'views':p['views'],'requiredNodes':list(nodes.keys()),
    'modeHidden':{
        'exterior':['TerrainSection','GF_Interior_Cutaway','BS_Interior_Cutaway'],
        'ground-floor':['TerrainSection','Roof','Exterior_Front','Exterior_Right','GF_Interior_Full','Basement'],
        'basement':['TerrainExterior','Roof','ExteriorWalls','GroundFloor_Structure','GroundFloor_InteriorWalls',
                    'GroundFloor_Furniture','Garden','Terrace','Paths','Shoreline','Pier','GF_Interior_Full','GF_Interior_Cutaway',
                    'BS_Interior_Full','Basement_FrontRightWalls'],
    },
}
outputs['manifest'].write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
set_mode('exterior')
set_camera(p['views']['exterior'])
bpy.ops.wm.save_as_mainfile(filepath=str(outputs['blend']),compress=True)
print('SPATIAL_REPORT',json.dumps({'landArea':report['land']['areaM2'],'ratio':report['land']['ratio'],'basementHeight':basement_clear,'stairRiser':riser}),flush=True)
if not args.skip_renders:
    for mode,view in p['views'].items():
        set_mode(mode)
        set_camera(view)
        scene.render.filepath=str(outputs['evidence']/('blender-'+mode+'.png'))
        print('RENDER',mode,flush=True)
        bpy.ops.render.render(write_still=True)
    for label,mode,y,ortho,pitch in [('ground-plan','ground-floor',floor_y,8,90),('basement-plan','basement',basement_y,8,90)]:
        set_mode(mode)
        set_camera({'target':{'x':cx,'y':y,'z':cz},'baseYaw':0,'yawOffset':0,'pitch':pitch,'distance':20,'fov':35},ortho)
        scene.render.filepath=str(outputs['evidence']/('blender-'+label+'.png'))
        bpy.ops.render.render(write_still=True)
    # Render-only physical slice through the upper internal flight. It is not exported.
    set_mode('exterior')
    section_objects = []
    slice_x = cx+bay_right-s['flightWidth']/2
    for parent in [terrain_ext, roof, exterior, gf_structure, stair, bs_structure, water]:
        for original in parent.children_recursive:
            if original.type != 'MESH':
                continue
            obj = original.copy()
            obj.data = original.data.copy()
            obj.parent = None
            bpy.context.collection.objects.link(obj)
            cutter = box('_slice_cut', (slice_x,5,0), (0.16,13,34), None)
            bpy.context.view_layer.objects.active = obj
            mod = obj.modifiers.new('inspection_slice','BOOLEAN')
            mod.operation = 'INTERSECT'
            mod.solver = 'EXACT'
            mod.object = cutter
            bpy.ops.object.modifier_apply(modifier=mod.name)
            cutter_data = cutter.data
            bpy.data.objects.remove(cutter,do_unlink=True)
            bpy.data.meshes.remove(cutter_data)
            obj.hide_render = False
            section_objects.append(obj)
    for obj in root.children_recursive:
        obj.hide_render = True
    set_camera({'target':{'x':slice_x,'y':report['section']['targetY'],'z':0},'baseYaw':90,'yawOffset':0,'pitch':0,'distance':25,'fov':35},report['section']['orthoScale'])
    scene.render.filepath=str(outputs['evidence']/'blender-section.png')
    bpy.ops.render.render(write_still=True)
    for obj in section_objects:
        data = obj.data
        bpy.data.objects.remove(obj,do_unlink=True)
        bpy.data.meshes.remove(data)
print('M2.1_GENERATION_COMPLETE',flush=True)
