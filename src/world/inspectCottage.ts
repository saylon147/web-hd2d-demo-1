import { DoubleSide, LinearFilter, Mesh, MeshStandardMaterial } from 'three';
import type { Object3D } from 'three';

// Opt-in probes of the loaded preview only. Reloading without probe restores the GLB defaults.
export function inspectCottage(root:Object3D, probe:string|null, maxAnisotropy:number) {
  root.traverse(object=>{
    if (!(object instanceof Mesh) || !(object.material instanceof MeshStandardMaterial)) return;
    const m=object.material;
    for(const texture of new Set([m.map,m.normalMap,m.roughnessMap,m.metalnessMap])){
      if(!texture)continue;
      if(probe==='no-mips'){texture.minFilter=LinearFilter;texture.generateMipmaps=false;}
      if(probe==='aniso')texture.anisotropy=Math.min(8,maxAnisotropy);
    }
    if(probe==='double')m.side=DoubleSide;
    if(probe==='no-normal')m.normalScale.set(0,0);
    if(probe==='no-specular')m.onBeforeCompile=shader=>{
      shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',
        'outgoingLight -= totalSpecular;\n#include <opaque_fragment>');
    };
    if(probe==='solid')m.onBeforeCompile=shader=>{
      shader.fragmentShader=shader.fragmentShader.replace('#include <fog_fragment>',
        'gl_FragColor = vec4(0.12,0.12,0.12,1.0);');
    };
  });
}
