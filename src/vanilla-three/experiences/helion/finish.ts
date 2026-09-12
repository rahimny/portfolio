import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

/** CSS colour conversion is owned by the browser, including oklch tokens. */
export function siteColour(token: string): THREE.Color {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.fillStyle = getComputedStyle(document.documentElement)
    .getPropertyValue(token)
    .trim();
  context.fillRect(0, 0, 1, 1);
  const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
  return new THREE.Color().setRGB(
    r / 255,
    g / 255,
    b / 255,
    THREE.SRGBColorSpace
  );
}

/** Display-space line work; the canvas paper and HTML paper remain identical. */
export function createPrintPass(
  paper: THREE.Color,
  ink: THREE.Color
): ShaderPass {
  return new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uSize: { value: new THREE.Vector2(1, 1) },
      uPaper: { value: paper.clone().convertLinearToSRGB() },
      uInk: { value: ink.clone().convertLinearToSRGB() },
      uLine: { value: 0.6 },
      uHatch: { value: 0.22 },
      uRatio: { value: 1 },
    },
    vertexShader: /* glsl */ `varying vec2 vUv;
      void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform vec2 uSize;
      uniform vec3 uPaper,uInk;
      uniform float uLine,uHatch,uRatio;
      varying vec2 vUv;
      float printLuma(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
      void main(){
        vec3 colour=texture2D(tDiffuse,vUv).rgb;
        float light=printLuma(colour);
        float mask=smoothstep(.025,.16,length(colour-uPaper));
        vec2 px=vec2(max(.65,uLine*1.6)*uRatio)/uSize;
        float x=printLuma(texture2D(tDiffuse,vUv+vec2(px.x,0)).rgb)-printLuma(texture2D(tDiffuse,vUv-vec2(px.x,0)).rgb);
        float y=printLuma(texture2D(tDiffuse,vUv+vec2(0,px.y)).rgb)-printLuma(texture2D(tDiffuse,vUv-vec2(0,px.y)).rgb);
        float contour=smoothstep(.1,.34,length(vec2(x,y)))*uLine*(.92+.08*sin((gl_FragCoord.x+gl_FragCoord.y)*.13));
        vec2 paperPx=gl_FragCoord.xy/max(.5,uRatio);
        float wobble=sin(paperPx.y*.06)*.6+sin(paperPx.x*.031)*.35;
        float hatch=abs(fract((paperPx.x+paperPx.y+wobble)/6.0)-.5);
        float line=1.0-smoothstep(.035,.16,hatch);
        float cross=1.0-smoothstep(.035,.16,abs(fract((paperPx.x-paperPx.y)/7.0)-.5));
        float shadow=(1.0-smoothstep(.18,.75,light));
        float pencil=(line*shadow+cross*shadow*shadow*.45)*uHatch*mask*.5;
        float tooth=fract(sin(dot(floor(paperPx),vec2(12.9898,78.233)))*43758.5453);
        colour=mix(colour,uInk,clamp(contour+pencil,0.0,.9));
        colour-=vec3((tooth-.5)*uHatch*.018*mask);
        gl_FragColor=vec4(colour,1.0);
      }
    `,
  });
}
