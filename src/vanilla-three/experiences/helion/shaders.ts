export const plateVertex = /* glsl */ `
  attribute vec3 aCentre;
  attribute float aLevel, aSurface, aSeed;
  uniform float uTime, uCharge, uIntensity, uHover, uSweep, uMood;
  uniform vec3 uAim;
  uniform vec4 uImpacts[8];
  uniform float uStrengths[8];
  varying vec3 vNormal, vView, vCentre, vPosition;
  varying float vHeat, vSurface, vLevel, vSeed, vHeight;
  void main() {
    float phase = dot(aCentre, vec3(2.8, 1.5, -1.9)) + uTime * .65;
    float wave = pow(.5 + .5 * sin(phase * 2.6 + sin(aCentre.y * 5.0 - uTime * .4)), 7.0);
    float height = .13 + sin(phase*.7)*.025 + .08 * wave * uIntensity * uMood;
    float heat = wave * .12;
    float focus = exp(-max(0.0, 1.0 - dot(aCentre,uAim)) * 12.0);
    height += focus * (uCharge * .33 + uHover * .09 + uSweep * .08);
    float selected=exp(-max(0.0,1.0-dot(aCentre,uAim))*300.0);
    height += selected*uHover*.11;
    heat += focus * uCharge * .65 + selected*uHover*.19;
    for (int i=0; i<8; i++) {
      float age = uTime - uImpacts[i].w;
      if (age >= 0.0 && age < 4.5) {
        float distance = acos(clamp(dot(aCentre,uImpacts[i].xyz),-.9999,.9999));
        // A delayed damped oscillator gives neighbours the same impulse at
        // successive arrival times. Motion continues through rest into recovery.
        float arrival = age - distance / 2.8;
        float local = exp(-distance*distance*24.0);
        float compression = -.16*local*exp(-pow((age-.035)*27.0,2.0));
        float spring = 0.0;
        if(arrival>0.0) {
          float onset=smoothstep(0.0,.075,arrival);
          spring=sin(arrival*11.5)*exp(-arrival*3.7)*onset;
        }
        float spread=exp(-distance*1.1);
        float response=(compression+spring*spread*.78)*uStrengths[i];
        height+=response*(.97+abs(aSeed)*.06);
        heat=max(heat,(max(0.0,spring)*spread*.85+local*exp(-age*9.0)) * uStrengths[i]);
      }
    }
    height = .035 + 1.1*(1.0-exp(-max(0.0,height-.035)/1.1));
    vec3 displaced = position * 1.94 + aCentre * (aLevel * height);
    vec4 view = modelViewMatrix * vec4(displaced,1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = -view.xyz; vCentre = aCentre; vPosition = position; vHeat = heat;
    vSurface = aSurface; vLevel = aLevel; vSeed = aSeed; vHeight = height;
    gl_Position = projectionMatrix * view;
  }
`;
export const plateFragment = /* glsl */ `
  uniform float uCel;
  uniform vec3 uPaper,uInk,uBrand;
  varying vec3 vNormal, vView, vCentre, vPosition;
  varying float vHeat, vSurface, vLevel, vSeed, vHeight;
  void main() {
    vec3 n=normalize(vNormal), view=normalize(vView);
    vec3 key=normalize(vec3(-.65,.85,1.2));
    float diffuse=max(dot(n,key),0.0);
    float aa=max(fwidth(diffuse),.015);
    float bands=.18 + smoothstep(.24-aa,.24+aa,diffuse)*.36 + smoothstep(.67-aa,.67+aa,diffuse)*.4;
    float light=mix(.2+diffuse*.75,bands,uCel);
    float fresnel=pow(1.0-max(dot(n,view),0.0),3.0);
    float spec=pow(max(dot(n,normalize(key+view)),0.0),78.0);
    vec3 colour=mix(uInk,uPaper,light*(.78+vSeed*.06));
    colour+=vec3(spec*(1.0-uCel)*.45);
    float opacity=mix(.72,.96,uCel)+fresnel*.04;
    if(vSurface>.5 && vSurface<.95) {
      colour=mix(uInk,uPaper,.035+(1.0-uCel)*.32);
      opacity=1.0;
    }
    if(vSurface<.5) {
      float frequency=32.0;
      float antialias=1.0-smoothstep(.2,1.0,fwidth(vLevel)*frequency);
      float conductor=pow(.5+.5*sin(vLevel*frequency),12.0)*antialias;
      colour=mix(uInk,uPaper,.10+conductor*.13);
      opacity=.96;
    }
    float heat=min(max(0.0,vHeat-.055)*1.3,1.65);
    float hot=smoothstep(.15,.95,heat);
    colour=mix(colour,uBrand*(.38+light*.6),hot*.95);
    colour+=uBrand*max(0.0,heat-.8)*.2;
    gl_FragColor=vec4(colour,min(1.0,opacity));
  }
`;

// A second, opaque skin sits beneath the translucent caps. Its coordinates
// follow the same sphere; moving plates reveal the machinery between layers.
export const coreVertex = /* glsl */ `
  varying vec3 vPosition;
  void main(){vPosition=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}
`;
export const coreFragment = /* glsl */ `
  varying vec3 vPosition;
  uniform float uTime;
  uniform vec3 uPaper,uInk,uBrand;
  void main(){
    vec3 p=normalize(vPosition);
    float latitude=asin(clamp(p.y,-1.0,1.0));
    float longitude=atan(p.z,p.x);
    vec2 uv=vec2(longitude*7.0,latitude*12.0);
    vec2 cell=abs(fract(uv)-.5);
    vec2 aa=max(fwidth(uv),vec2(.002));
    float traces=max(1.0-smoothstep(.015,.015+aa.x,cell.x),1.0-smoothstep(.018,.018+aa.y,cell.y));
    float rivet=1.0-smoothstep(.045,.075,length(cell-vec2(.3)));
    float rotor=pow(.5+.5*sin(longitude*18.0+latitude*7.0-uTime*.55),18.0);
    vec3 colour=mix(uInk,uPaper,.06+traces*.12);
    colour+=uBrand*rivet*.1;
    colour+=uPaper*rotor*.06;
    gl_FragColor=vec4(colour,1.0);
  }
`;
export const trailVertex = /* glsl */ `
  varying vec2 vUv;
  void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}
`;
export const trailFragment = /* glsl */ `
  varying vec2 vUv;
  uniform vec3 uColour;
  uniform float uTime;
  void main(){
    float edge=abs(vUv.y*2.0-1.0);
    float core=exp(-edge*edge*55.0);
    float sheath=pow(max(0.0,1.0-edge),2.0);
    float taper=pow(1.0-vUv.x,1.6);
    float turbulence=.72+.28*sin(vUv.x*95.0-uTime*24.0+sin(vUv.x*42.0-uTime*7.0));
    core += exp(-pow((vUv.y-.5-sin(vUv.x*53.0-uTime*19.0)*.17)*36.0,2.0))*.35;
    vec3 colour=mix(vec3(.012,.01,.008),uColour,sheath*.85);
    colour=mix(colour,vec3(1.0,.18,.02),core*.2);
    gl_FragColor=vec4(colour,taper*turbulence*pow(sheath,.35));
  }
`;
export const glowFragment = /* glsl */ `
  varying vec2 vUv;
  uniform vec3 uColour;
  uniform float uOpacity;
  void main(){
    float r=length((vUv-.5)*2.0);
    float glow=exp(-r*r*6.5)*smoothstep(1.0,.65,r);
    gl_FragColor=vec4(uColour,glow*uOpacity);
  }
`;
export const sparkVertex = /* glsl */ `
  attribute float aLife, aSize;
  attribute vec3 aColour;
  uniform float uPixelRatio;
  varying float vPixel, vLife;
  varying vec3 vColour;
  void main(){
    vec4 p=modelViewMatrix*vec4(position,1.0);
    vLife=aLife;vColour=aColour;vPixel=step(.54,aSize);
    gl_PointSize=clamp(aSize*uPixelRatio*65.0/max(1.0,-p.z),1.0,30.0);
    gl_Position=projectionMatrix*p;
  }
`;
export const sparkFragment = /* glsl */ `
  varying float vPixel, vLife;
  varying vec3 vColour;
  void main(){
    vec2 p=abs(gl_PointCoord-.5)*2.0;
    float r=mix(length(p),max(p.x,p.y),vPixel);
    float alpha=mix(exp(-r*r*4.0)*smoothstep(1.0,.5,r),1.0-smoothstep(.65,.9,r),vPixel)*vLife;
    gl_FragColor=vec4(vColour*vec3(.75,.12,.015),alpha);
  }
`;
export const dustVertex = /* glsl */ `
  uniform float uTime,uPixelRatio;
  attribute float aSeed;
  varying float vAlpha;
  void main(){
    vec3 p=position;
    float angle=uTime*.022*(.4+aSeed);
    p.xz=mat2(cos(angle),-sin(angle),sin(angle),cos(angle))*p.xz;
    vec4 view=modelViewMatrix*vec4(p,1.0);
    gl_Position=projectionMatrix*view;
    gl_PointSize=clamp((1.2+aSeed*1.7)*uPixelRatio*7.0/max(1.0,-view.z),1.0,7.0);
    vAlpha=(.13+aSeed*.32)*(.7+.3*sin(aSeed*120.0+uTime*.4));
  }
`;
export const dustFragment = /* glsl */ `
  varying float vAlpha;
  void main(){float d=length(gl_PointCoord-.5)*2.0;gl_FragColor=vec4(.12,.105,.09,vAlpha*.35*smoothstep(1.0,.15,d));}
`;
export const shockFragment = /* glsl */ `
  varying vec2 vUv;
  uniform float uOpacity, uAge;
  void main(){
    vec2 p=(vUv-.5)*2.0;
    float angle=atan(p.y,p.x),r=length(p);
    // The six-fold wave inherits the plate construction, then opens into arcs.
    float hexRadius=cos(3.14159/6.0)/cos(mod(angle+3.14159/6.0,3.14159/3.0)-3.14159/6.0);
    float d=r-hexRadius*.77;
    float ring=1.0-smoothstep(.008,.023,abs(d));
    float inner=exp(-pow((d+.055)*34.0,2.0))*.2;
    float broken=smoothstep(-.4,.1,sin(angle*6.0+uAge*2.0));
    vec3 colour=mix(vec3(1.0,.04,.002),vec3(.045,.035,.027),smoothstep(.1,.45,uAge));
    gl_FragColor=vec4(colour*1.5,(ring+inner)*broken*uOpacity);
  }
`;

export const burstFragment = /* glsl */ `
  varying vec2 vUv;
  uniform float uAge,uPower,uPixelation;
  void main(){
    vec2 p=(vUv-.5)*2.0;
    // Quantise only the outer plume during breakup, leaving the core clean.
    float raster=uPixelation*smoothstep(.16,.5,length(p));
    p=mix(p,(floor(p*38.0)+.5)/38.0,raster);
    float r=length(p),angle=atan(p.y,p.x);
    float opening=smoothstep(0.0,.09,uAge);
    float breakup=smoothstep(.14,.6,uAge);
    float lobes=.055*sin(angle*7.0+.7)+.025*sin(angle*13.0-1.2);
    float radius=mix(.16,.54,opening)+lobes*opening;
    float needle=pow(abs(cos(angle*6.0+.4)),22.0)*(.3+uPower*.055)*(1.0-breakup);
    float boundary=radius+needle;
    float aa=max(fwidth(r),.004);
    float silhouette=1.0-smoothstep(boundary-aa,boundary+aa,r);
    float inkEdge=smoothstep(boundary-.035,boundary-.018,r);
    float hollow=smoothstep(.1,.56,uAge)*smoothstep(radius-.14,radius-.055,r);
    float coverage=mix(1.0,hollow,breakup);
    float hot=1.0-smoothstep(radius*.28,radius*.8,r);
    vec3 colour=mix(vec3(.95,.035,.002),vec3(1.0,.16,.01),step(.3,hot));
    colour=mix(colour,vec3(.94,.93,.91),step(.72,hot));
    colour=mix(colour,vec3(.012,.01,.008),inkEdge*.95);
    float stipple=step(.4,fract(sin(dot(floor(p*38.0),vec2(12.9898,78.233)))*43758.5453));
    coverage*=mix(1.0,stipple,raster*.45);
    float fade=1.0-smoothstep(.29,.68,uAge);
    gl_FragColor=vec4(colour*1.35,silhouette*coverage*fade*.94);
  }
`;
