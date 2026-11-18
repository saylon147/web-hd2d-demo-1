import { Color, DirectionalLight, FogExp2, HemisphereLight, PointLight, Scene } from 'three';
import type { ConstrainedCamera } from '../camera/ConstrainedCamera';


const skies = {
  day: { key:'#fff0d2', power:2.35, position:[-7,13,8], sky:'#fff4df', ground:'#b4aa86', fill:1.55, haze:'#d7d2af', density:0.012, lamp:0 },
  dusk: { key:'#ffad75', power:1.9, position:[-13,6,-5], sky:'#d8c5d4', ground:'#9f7368', fill:0.78, haze:'#d4ac99', density:0.019, lamp:3.5 },
  night: { key:'#aec9ff', power:0.53, position:[6,11,-9], sky:'#8bace3', ground:'#626e94', fill:0.48, haze:'#364866', density:0.022, lamp:8 },
} as const;
type Sky = keyof typeof skies;

// Surface picks from the two lanterns and front window. Move bulbs just forward of glass.
const anchors = [[1.23,1.86,-0.04],[3.08,1.89,-0.02],[4.06,1.68,-0.32]] as const;
export function createLightingRig(scene:Scene, key:DirectionalLight, ambient:HemisphereLight) {
  const bulbs=anchors.map(([x,y,z],index)=>{
    const bulb=new PointLight(index===2?'#ffb66d':'#ffca87',0,index===2?2.4:4);
    bulb.position.set(x,y,z);
    bulb.name='courtyard-lamp-'+index;
    scene.add(bulb);
    return bulb;
  });
  return (sky:Sky, lamps:boolean, shadows:boolean)=>{
    const p=skies[sky];
    key.color.set(p.key);key.intensity=p.power;key.position.fromArray(p.position);
    key.castShadow=shadows;
    ambient.color.set(p.sky);ambient.groundColor.set(p.ground);ambient.intensity=p.fill;
    (scene.background as Color).set(p.haze);
    const fog=scene.fog as FogExp2;
    fog.color.set(p.haze);fog.density=p.density;
    bulbs.forEach((light,index)=>{
      light.intensity=p.lamp*(index===2?0.32:1);
      light.visible=lamps && light.intensity>0;
    });
  };
}

export function mountLightingControls(parent:HTMLElement,orbit:ConstrainedCamera,
  apply:ReturnType<typeof createLightingRig>,signal:AbortSignal){
  const panel=document.createElement('details');
  panel.className='lighting-panel';
  panel.innerHTML='<summary>光照与镜头</summary><section><label>时段 <select aria-label="时段"><option value="day">日间</option><option value="dusk">黄昏</option><option value="night">夜景</option></select></label><label>镜头 <select aria-label="固定镜头"><option value="entrance">庭院入口</option><option value="house">房屋近景</option><option value="detail">屋瓦排查</option></select></label><label><input name="lamps" type="checkbox"> 门窗局部光</label><label><input name="shadows" type="checkbox"> 主光投影</label></section>';
  const sky=panel.querySelector<HTMLSelectElement>('[aria-label="时段"]')!;
  const shot=panel.querySelector<HTMLSelectElement>('[aria-label="固定镜头"]')!;
  const lamps=panel.querySelector<HTMLInputElement>('[name=lamps]')!;
  const shadows=panel.querySelector<HTMLInputElement>('[name=shadows]')!;
  const params=new URL(location.href).searchParams;
  sky.value=['dusk','night'].includes(params.get('sky')??'')?params.get('sky')!:'day';
  shot.value=['house','detail'].includes(params.get('shot')??'')?params.get('shot')!:'entrance';
  lamps.checked=params.get('lamps')!=='0';shadows.checked=params.get('shadows')!=='0';
  const setShot=()=>orbit.setPreset(shot.value!=='entrance'
    ? {...orbit.profile.defaults, target:{x:2.5,y:1.8,z:-1.2},pitch:30,distance:shot.value==='detail'?9:12,yawOffset:shot.value==='detail'?-2.09:0}
    : orbit.profile.defaults);
  setShot();apply(sky.value as Sky,lamps.checked,shadows.checked);
  panel.addEventListener('change',event=>{
    if(event.target===shot)setShot();
    apply(sky.value as Sky,lamps.checked,shadows.checked);
    const url=new URL(location.href);
    for(const [k,v] of Object.entries({sky:sky.value,shot:shot.value,lamps:Number(lamps.checked),shadows:Number(shadows.checked)}))
      url.searchParams.set(k,String(v));
    history.replaceState(history.state,'',url);
  },{signal});
  parent.append(panel);
  signal.addEventListener('abort',()=>panel.remove(),{once:true});
}
