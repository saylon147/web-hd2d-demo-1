"""Coherent coastal profiles, not extruded terraces. Runtime X/Y/Z coordinates."""
import math
import random


def coastal_mesh(config, plateau_y, beach_y, seed):
    n = config['segments']
    tx, tz = config['center']
    phases = [random.Random(seed + j).uniform(0, math.tau) for j in range(4)]
    vertices, rings = [], []
    # Interior land -> irregular plateau lip -> fractured shoulder -> shoreline -> seabed.
    for ring in range(6):
        indices = []
        for k in range(n):
            angle = math.tau * k / n
            south = max(0, math.sin(angle)) ** 6
            variation = (0.11 * math.sin(3*angle+phases[0]) +
                         0.06 * math.sin(5*angle+phases[1]) +
                         0.025 * math.sin(9*angle+phases[2]))
            rx = config['radiusX'] * (1 + variation)
            rz = config['radiusZ'] * (1 + variation) * (1-config['frontCompression']*south)
            scale = [0.84, 1, 1.09, 1.16, config['shoreExpansion'], config['shoreExpansion']*0.98][ring]
            local = 0 if ring < 2 else (0.075*math.sin(4*angle+phases[3]+ring*0.9)+
                                       0.04*math.sin(7*angle+phases[1]-ring*0.6))
            x = tx + rx * (scale+local) * math.cos(angle)
            z = tz + rz * (scale+local) * math.sin(angle)
            if ring >= 2:
                z += config['beachExtension'] * south * [0, 0, 0.24, 0.7, 1, 1][ring]
            edge = config['edgeVariation'] * (math.sin(3*angle+phases[0])+0.4*math.sin(7*angle+phases[2]))
            y = [plateau_y, plateau_y+edge, plateau_y*(0.49+0.23*math.sin(2*angle+phases[1])+0.063*math.sin(5*angle+phases[0])),
                 plateau_y*(0.177+0.135*math.sin(5*angle+phases[3])), 0.12, -0.32][ring]
            # Only the southern cove has a low sand shelf. It is not a perimeter terrace.
            if ring in (3, 4) and south > 0.36:
                y = beach_y if ring == 3 else 0.25
            indices.append(len(vertices))
            vertices.append((x, y, z))
        rings.append(indices)
    center = len(vertices)
    vertices.append((tx, plateau_y, tz))
    faces, zones = [], []
    for k in range(n):
        faces.append((center, rings[0][k], rings[0][(k+1)%n]))
        zones.append('land')
    for ring in range(5):
        for k in range(n):
            a, b = rings[ring][k], rings[ring][(k+1)%n]
            c, d = rings[ring+1][(k+1)%n], rings[ring+1][k]
            south = max(0, math.sin(math.tau*(k+0.5)/n)) ** 6
            zone = 'land' if ring == 0 else 'sand' if ring >= 2 and south > 0.36 else 'rock'
            faces.extend(((a,b,c), (a,c,d)))
            zones.extend((zone, zone))
    faces.append(tuple(reversed(rings[-1])))
    zones.append('rock')
    return vertices, faces, zones, [(vertices[k][0], vertices[k][2]) for k in rings[1]]
