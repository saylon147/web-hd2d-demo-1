"""Build the courtyard preview mesh from the local Tripo cottage in Blender."""
import bpy
from pathlib import Path

root = Path(__file__).resolve().parents[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(root / "art-source/tripo/inbox/tripo_cottage.glb"))
for obj in tuple(bpy.context.scene.objects):
    if obj.type == "MESH":
        bpy.context.view_layer.objects.active = obj
        mod = obj.modifiers.new("Preview reduction", "DECIMATE")
        mod.ratio = 0.045
        bpy.ops.object.modifier_apply(modifier=mod.name)
for image in bpy.data.images:
    if image.size[0] > 2048:
        image.scale(2048, 2048)
        image.pack()
out = root / "public/assets/models/courtyard_cottage_preview.glb"
bpy.ops.export_scene.gltf(filepath=str(out), export_format="GLB", export_image_format="JPEG", export_jpeg_quality=86)
