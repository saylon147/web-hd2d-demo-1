"""Headless matched source/LOD views for a configured coastal asset."""
import json
import math
from pathlib import Path
import sys
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
config = json.loads(Path(sys.argv[sys.argv.index('--') + 1]).read_text(encoding='utf-8'))
bpy.ops.wm.open_mainfile(filepath=str(ROOT / config['blend']))
scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x = 900
scene.render.resolution_y = 720
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.world = bpy.data.worlds.new('Coastal_Audit_World')
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs[0].default_value = (0.42, 0.48, 0.48, 1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value = 0.45
scene.view_settings.view_transform = 'AgX'
sun_data = bpy.data.lights.new('Audit_Sun', 'SUN')
sun_data.energy = 2
sun_data.angle = 0.1
sun = bpy.data.objects.new('Audit_Sun', sun_data)
scene.collection.objects.link(sun)
sun.rotation_euler = Vector((8, 10, -15)).to_track_quat('-Z', 'Y').to_euler()
camera_data = bpy.data.cameras.new('Audit_Camera')
camera = bpy.data.objects.new('Audit_Camera', camera_data)
scene.collection.objects.link(camera)
scene.camera = camera
camera_data.sensor_fit = 'VERTICAL'
camera_data.sensor_height = 24
camera_data.lens = 12 / math.tan(math.radians(35) / 2)
high = bpy.data.objects['Tripo_Rock_High']
height = max(vertex.co.z for vertex in high.data.vertices)
target = Vector((0, 0, height * 0.48))
distance = config['runtimeWidthM'] * 2.7
output = ROOT / config['evidence']
output.mkdir(parents=True, exist_ok=True)
for variant, name in [('original', 'Tripo_Rock_High'), ('20k', 'Coastal_Rock_20000')]:
    for obj in scene.objects:
        if obj.type == 'MESH':
            obj.hide_render = obj.name != name
            obj.hide_set(obj.name != name)
    for view, yaw, pitch in [('front', 35, 42), ('left', -55, 42), ('right', 125, 42), ('back', 215, 42), ('top', 35, 89.9)]:
        yaw, pitch = math.radians(yaw), math.radians(pitch)
        camera.location = target + Vector((distance * math.cos(pitch) * math.sin(yaw), -distance * math.cos(pitch) * math.cos(yaw), distance * math.sin(pitch)))
        camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = str(output / f"{config['id']}-{variant}-{view}.png")
        bpy.ops.render.render(write_still=True)
print('COASTAL_AUDIT_RENDER_COMPLETE', config['id'])
