"""Measured surface union and net floor circulation from generated meshes (Blender)."""
import math
from collections import deque
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def tree(objects):
    vertices, faces = [], []
    for obj in objects:
        if obj.type != 'MESH':
            continue
        offset = len(vertices)
        vertices.extend(obj.matrix_world @ v.co for v in obj.data.vertices)
        faces.extend(tuple(offset+k for k in face.vertices) for face in obj.data.polygons)
    return BVHTree.FromPolygons(vertices, faces)


def survey_land(objects, blockers, house, config):
    surface = tree(objects)
    obstacle = tree(blockers)
    bounds = [obj.matrix_world @ v.co for obj in objects if obj.type == 'MESH' for v in obj.data.vertices]
    low_x, high_x = min(v.x for v in bounds), max(v.x for v in bounds)
    low_z, high_z = min(-v.y for v in bounds), max(-v.y for v in bounds)
    cx, cz = house['center']
    def measure(step):
        planted, projected = 0, 0
        eligible = {}
        for x_index in range(math.floor(low_x/step), math.ceil(high_x/step)):
            x = (x_index+0.5)*step
            for z_index in range(math.floor(low_z/step), math.ceil(high_z/step)):
                z = (z_index+0.5)*step
                if abs(x-cx) < house['width']/2 and abs(z-cz) < house['depth']/2:
                    continue  # Occupied pad counted analytically once, including the stair void.
                hit, normal, _, _ = surface.ray_cast(Vector((x,-z,20)), Vector((0,0,-1)), 21)
                if hit is None or hit.z < 0.24:
                    continue
                projected += 1
                if abs(normal.z) < math.cos(math.radians(config['slopeLimitDegrees'])):
                    continue
                # Garden beds/trunks are planted ground, not navigable surface.
                blocked, _, _, _ = obstacle.ray_cast(Vector((x,-z,20)), Vector((0,0,-1)), 21)
                if blocked is not None and blocked.z > hit.z+0.12:
                    planted += 1
                    continue
                eligible[(x_index,z_index)] = (hit.z, abs(normal.z))
        entrance = (cx-0.2,cz+house['depth']/2+0.5)
        start = min(eligible, key=lambda cell: ((cell[0]+0.5)*step-entrance[0])**2+((cell[1]+0.5)*step-entrance[1])**2)
        queue, reached = deque([start]), {start}
        while queue:
            x,z = queue.popleft()
            for neighbor in [(x-1,z),(x+1,z),(x,z-1),(x,z+1)]:
                if neighbor not in reached and neighbor in eligible and abs(eligible[(x,z)][0]-eligible[neighbor][0]) <= 0.24:
                    reached.add(neighbor)
                    queue.append(neighbor)
        actual = sum(step*step / eligible[cell][1] for cell in reached)
        runs = []
        for z in sorted({cell[1] for cell in reached}):
            row = sorted(cell[0] for cell in reached if cell[1] == z)
            left = previous = row[0]
            for x in row[1:]+[row[-1]+2]:
                if x != previous+1:
                    runs.append([round(left*step,4),round(z*step,4),round((previous+1)*step,4)])
                    left = x
                previous = x
        return {'exteriorNavigableM2': len(reached)*step*step, 'plantedExcludedM2': planted*step*step,
                'disconnectedExcludedM2': (len(eligible)-len(reached))*step*step,
                'projectedExteriorSurfaceM2': projected*step*step, 'actualNavigableSurfaceM2': actual, 'surveyRunsXZ':runs}
    fine = measure(config['areaGrid'])
    coarse = measure(config['areaGrid']*2)
    occupied = house['width']*house['depth']
    return {**fine, 'areaM2': fine['exteriorNavigableM2']+occupied, 'occupiedCottagePadM2': occupied,
            'gridStepM': config['areaGrid'], 'coarseStepM': config['areaGrid']*2,
            'coarseFineDifferenceM2': abs(fine['exteriorNavigableM2']-coarse['exteriorNavigableM2']),
            'boundsXZ': [low_x,low_z,high_x,high_z], 'targetRatioRange': config['ratioRange'],
            'definition': 'nonoverlapping projected navigable surface union + occupied cottage pad; BVH first hit then 4-neighbor flood from porch, max height step 0.24m; sea/visual rocks/pier/garden beds/disconnected pockets excluded; slope <=30deg, Y>=0.24; actual sloping surface area separate'}


def net_floor_area(wall_objects, bounds, bay, excluded_rooms, floor_y, step=0.05):
    wall_tree = tree(wall_objects)
    count = 0
    x1,z1,x2,z2 = bounds
    for nx in range(round((x2-x1)/step)):
        x=x1+(nx+0.5)*step
        for nz in range(round((z2-z1)/step)):
            z=z1+(nz+0.5)*step
            if any(a<=x<=c and b<=z<=d for a,b,c,d in [bay]+excluded_rooms):
                continue
            hit,_,_,_ = wall_tree.ray_cast(Vector((x,-z,floor_y+0.2)),Vector((0,0,1)),3)
            if hit is None:
                count += 1
    return count*step*step
