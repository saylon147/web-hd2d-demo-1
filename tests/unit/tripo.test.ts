import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseTripoManifest, rockCameraProfile } from '../../src/config/tripo';
const fixture=(): Record<string,unknown>=>JSON.parse(readFileSync('public/assets/manifests/tripo_rock_spike.json','utf8')) as Record<string,unknown>;
describe('Tripo experiment contract',()=>{
  it('allows all measured variants and four fixed views without changing M1 limits',()=>{
    const manifest=parseTripoManifest(fixture());
    expect(manifest.variants).toHaveLength(13);
    expect(rockCameraProfile(manifest,'front').defaults.baseYaw).toBe(35);
    expect(rockCameraProfile(manifest,'side').defaults.baseYaw).toBe(125);
    expect(rockCameraProfile(manifest,'back').defaults.baseYaw).toBe(215);
    expect(rockCameraProfile(manifest,'site').defaults.distance).toBe(40);
  });
  it('rejects nonlocal paths, missing default variants and invalid coordinates',()=>{
    const data=fixture();
    data.defaultVariant='missing';expect(()=>parseTripoManifest(data)).toThrow('default');
    data.defaultVariant='20k-2k';data.placement=[0,NaN,0];expect(()=>parseTripoManifest(data)).toThrow('coordinates');
    const invalid=fixture(), variants=invalid.variants as Record<string,unknown>[];
    variants[0]!.modelUrl='https://external.invalid/rock.glb';expect(()=>parseTripoManifest(invalid)).toThrow('asset path');
  });
});
