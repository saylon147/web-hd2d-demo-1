"""Render the generated Blender master without manual UI or re-optimization."""
import json
import math
from pathlib import Path
import bpy
from mathutils import Vector

root=Path(__file__).resolve().parents[1]
config=json.loads((root/'art-source/tripo/rock_pipeline.json').read_text(encoding='utf-8'))
bpy.ops.wm.open_mainfile(filepath=str(root/config['blend']))
scene=bpy.context.scene
scene.render.engine='BLENDER_EEVEE'
scene.render.resolution_x=1000
scene.render.resolution_y=800
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.world=bpy.data.worlds.new('Tripo_Inspection_World')
scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(0.55,0.60,0.56,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=0.45
scene.view_settings.view_transform='AgX'
source=lambda p:(p[0],-p[2],p[1])
light_data=bpy.data.lights.new('Tripo_Inspection_Sun','SUN')
light_data.energy=2
light_data.angle=0.1
light=bpy.data.objects.new('Tripo_Inspection_Sun',light_data)
scene.collection.objects.link(light)
light.rotation_euler=(Vector(source((0,0,0)))-Vector(source((-8,15,10)))).to_track_quat('-Z','Y').to_euler()
camera_data=bpy.data.cameras.new('Tripo_Inspection_Camera')
camera=bpy.data.objects.new('Tripo_Inspection_Camera',camera_data)
scene.collection.objects.link(camera)
scene.camera=camera
camera_data.sensor_fit='VERTICAL'
camera_data.sensor_height=24
camera_data.lens=12/math.tan(math.radians(35)/2)
output=root/'docs/tripo-rock-spike/images'
output.mkdir(parents=True,exist_ok=True)
for variant,name in [('original','Tripo_Rock_High'),('20k','Coastal_Rock_20000')]:
    for obj in scene.objects:
        if obj.type=='MESH':
            obj.hide_render=obj.name!=name
            obj.hide_set(obj.name!=name)
    for angle,yaw in [('front',35),('back',215)]:
        pitch=math.radians(42)
        yaw=math.radians(yaw)
        camera.location=source((8*math.cos(pitch)*math.sin(yaw),0.7+8*math.sin(pitch),8*math.cos(pitch)*math.cos(yaw)))
        camera.rotation_euler=(Vector(source((0,0.7,0)))-camera.location).to_track_quat('-Z','Y').to_euler()
        scene.render.filepath=str(output/f'blender-{variant}-{angle}.png')
        bpy.ops.render.render(write_still=True)
print('TRIPO_RENDER_COMPLETE',flush=True)
