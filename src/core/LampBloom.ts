import { PointLight, ShaderMaterial, Vector2, Vector3 } from 'three';
import type { Camera, PerspectiveCamera, Scene, WebGLRenderer, WebGLRenderTarget } from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

export class LampBloom {
  private readonly seeds=[new Vector3(),new Vector3(),new Vector3()];
  private readonly material=new ShaderMaterial({
    uniforms:{source:{value:null},depth:{value:null},seeds:{value:this.seeds},clip:{value:new Vector2()},projection:{value:new Vector2()}},
    vertexShader:'varying vec2 uv0;void main(){uv0=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader:`
      varying vec2 uv0;
      uniform sampler2D source,depth;
      uniform vec3 seeds[3];
      uniform vec2 clip,projection;
      void main(){
        vec3 base=texture2D(source,uv0).rgb, halo=vec3(0.);
        for(int j=0;j<3;j++){
          vec3 s=seeds[j];
          if(s.z<=0.)continue;
          vec2 metres=projection/s.z;
          float radius=j==2?0.42:0.28;
          if(length((uv0-s.xy)/metres)>radius+0.44)continue;
          for(int i=0;i<40;i++){
            float n=float(i)+0.5;
            float r=sqrt(n/40.),angle=n*2.39996323;
            vec2 uv=uv0+vec2(cos(angle),sin(angle))*r*0.44*metres;
            float mask=1.-smoothstep(radius*0.4,radius,length((uv-s.xy)/metres));
            float d=texture2D(depth,uv).r;
            float z=clip.x*clip.y/(clip.y-d*(clip.y-clip.x));
            mask*=1.-smoothstep(0.32,0.75,abs(z-s.z));
            vec3 c=texture2D(source,uv).rgb;
            float energy=smoothstep(0.52,0.9,dot(c,vec3(0.2126,0.7152,0.0722)));
            halo+=mask*energy*c*exp(-2.5*r*r)/40.;
          }
        }
        gl_FragColor=vec4(base+(1.-base)*min(vec3(1.),2.8*halo),1.);
      }`,
    toneMapped:false,depthTest:false,depthWrite:false,
  });
  private readonly quad=new FullScreenQuad(this.material);
  private project(scene:Scene,camera:Camera){
    this.seeds.forEach((seed,i)=>{
      const light=scene.getObjectByName('courtyard-lamp-'+i);
      if(!(light instanceof PointLight) || !light.visible){seed.z=-1;return;}
      seed.setFromMatrixPosition(light.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
      const distance=-seed.z;
      seed.applyMatrix4(camera.projectionMatrix);
      seed.set(seed.x*0.5+0.5,seed.y*0.5+0.5,distance);
    });
  }
  render(renderer:WebGLRenderer,scene:Scene,camera:PerspectiveCamera,color:WebGLRenderTarget,geometry:WebGLRenderTarget){
    this.project(scene,camera);
    const u=this.material.uniforms;
    u.source!.value=color.texture;u.depth!.value=geometry.depthTexture;
    u.clip!.value.set(camera.near,camera.far);
    u.projection!.value.set(camera.projectionMatrix.elements[0]!/2,camera.projectionMatrix.elements[5]!/2);
    renderer.setRenderTarget(null);this.quad.render(renderer);
  }
  dispose(){this.material.dispose();this.quad.dispose();}
}
