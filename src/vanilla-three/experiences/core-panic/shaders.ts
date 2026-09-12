export const coreVertex = /* glsl */ `
  uniform float uTime, uPressure, uCharge;
  uniform vec4 uImpacts[6];
  uniform vec4 uKnots[5];
  varying vec3 vPosition, vLocal, vNormal;
  varying float vImpact;
  vec4 surface(vec3 direction) {
    float t = uTime * .24;
    vec3 q = direction;
    q += .23 * sin(q.yzx * 3.2 + vec3(t, -t*.8, t*.6));
    float folds = sin(q.x*3.8+t) * sin(q.y*3.6-t*.7) * sin(q.z*3.9+t*.5);
    float radius = 1.58 + folds*.21 + sin(q.y*6.0+q.x*2.0+t)*.055 + uPressure*.06;
    radius -= uCharge*.075;
    radius += sin(direction.y*16.0-uTime*6.0)*uCharge*.012;
    float impact = 0.0;
    vec3 surface = direction * radius;
    for (int i=0; i<5; i++) {
      float d = length(surface-uKnots[i].xyz);
      radius += exp(-d*d*7.0) * uKnots[i].w * .18;
    }
    for (int i=0; i<6; i++) {
      float age=uImpacts[i].w;
      float d=length(surface-uImpacts[i].xyz);
      float dent = -exp(-age*7.0)*.62 + sin(age*12.0)*exp(-age*3.7)*.28;
      float arrival=age-d*.24;
      float wave=arrival>0.0 ? sin(arrival*15.0)*exp(-arrival*4.0)*exp(-d*.7)*.13 : 0.0;
      radius += dent*exp(-d*d*3.4) + wave;
      impact += exp(-d*d*3.0-age*3.0);
    }
    return vec4(direction*radius,impact);
  }
  void main() {
    vec3 direction=normalize(position);
    vec3 tangent=normalize(cross(abs(direction.y)<.95?vec3(0.0,1.0,0.0):vec3(1.0,0.0,0.0),direction));
    vec3 bitangent=cross(direction,tangent);
    vec4 p=surface(direction);
    vec3 du=surface(normalize(direction+tangent*.001)).xyz-p.xyz;
    vec3 dv=surface(normalize(direction+bitangent*.001)).xyz-p.xyz;
    vNormal=normalize(normalMatrix*normalize(cross(du,dv)));
    vImpact=p.w;
    vLocal=p.xyz;
    vPosition=(modelViewMatrix*vec4(vLocal,1.0)).xyz;
    gl_Position=projectionMatrix*vec4(vPosition,1.0);
  }
`;
export const coreFragment = /* glsl */ `
  uniform float uTime, uPressure, uCharge;
  varying vec3 vPosition, vLocal, vNormal;
  varying float vImpact;
  vec3 thermal(float h) {
    vec3 c=mix(vec3(.028,.005,.095),vec3(.16,.025,.48),smoothstep(.0,.35,h));
    c=mix(c,vec3(.68,.045,.22),smoothstep(.3,.62,h));
    c=mix(c,vec3(1.0,.24,.028),smoothstep(.57,.8,h));
    return mix(c,vec3(1.0,.80,.33),smoothstep(.79,1.05,h));
  }
  float flow(vec3 p) {
    float t=uTime*.19;
    p += .44*sin(p.yzx*1.6+vec3(t,-t*.7,t*.5));
    p += .23*sin(p.zxy*3.1+vec3(-t*.6,t,t*.4));
    p += .10*sin(p.yzx*6.0-t*.8);
    return sin(p.x*3.0+p.y*1.8)*cos(p.z*2.5-p.y*1.5);
  }
  void main() {
    vec3 n=normalize(vNormal);
    vec3 eye=normalize(-vPosition);
    vec3 r=reflect(-eye,n);
    float facing=max(dot(n,eye),0.0);
    float fresnel=pow(1.0-facing,3.0);
    // Eight bounded interior field samples suggest luminous depth beneath a
    // wet skin. This is an analytic material, not physical fluid transport.
    vec3 interior=vec3(0.0);
    for(int i=0; i<8; i++) {
      vec3 p=vLocal-vec3(0.0,0.0,float(i)*.11);
      float f=flow(p);
      float channel=exp(-abs(f)*9.0);
      float heat=.45 + p.y*.13 + p.x*.10 + uPressure*.25;
      interior += thermal(heat+channel*.3)*channel*(.15-float(i)*.012);
    }
    float field=flow(vLocal);
    float membrane=pow(max(0.0,1.0-abs(field)*1.7),3.0);
    float light=pow(max(dot(r,normalize(vec3(-.8,1.2,1.6))),0.0),38.0)*1.6;
    light+=pow(max(dot(r,normalize(vec3(1.2,.2,.8))),0.0),64.0)*1.2;
    float rim=pow(max(dot(r,normalize(vec3(-.8,-.6,.4))),0.0),22.0)*.35;
    vec3 colour=vec3(.012,.004,.035)+interior*(.7+facing*.6);
    colour+=thermal(.46+membrane*.3+uPressure*.2)*membrane*.22;
    colour+=vec3(.64,.57,.88)*(light+rim)+vec3(.25,.095,.54)*fresnel*.8;
    colour+=thermal(.9)*vImpact*1.6;
    colour+=interior*uCharge*1.8+vec3(.3,.08,.55)*fresnel*uCharge;
    gl_FragColor=vec4(colour,1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
export const knotFragment = /* glsl */ `
  uniform float uTime, uGrowth, uLocked, uOpen;
  varying vec3 vNormal, vView;
  void main() {
    vec3 n=normalize(vNormal), e=normalize(-vView);
    float edge=pow(1.0-max(dot(n,e),0.0),2.0);
    float liquid=sin(n.x*7.0+n.z*3.0+uTime*2.0+sin(n.y*8.0-uTime));
    vec3 hot=mix(vec3(1.0,.22,.07),vec3(1.0,.78,.35),uGrowth);
    vec3 c=mix(hot*.35,hot,edge*.6+.2+liquid*.12);
    c+=pow(max(dot(reflect(-e,n),normalize(vec3(-.5,.8,1.0))),0.0),18.0)*vec3(1.0,.95,.8)*1.5;
    c=mix(vec3(.065,.023,.12)+c*.15,c,smoothstep(.4,.7,uOpen));
    c+=vec3(.5,.3,.15)*uLocked;
    gl_FragColor=vec4(c,1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
export const knotVertex = /* glsl */ `
  varying vec3 vNormal, vView;
  uniform float uTime, uGrowth;
  void main() {
    vec3 p=position*(1.0+sin(position.y*12.0+uTime*3.0)*.035*uGrowth);
    vNormal=normalMatrix*normal;
    vView=(modelViewMatrix*vec4(p,1.0)).xyz;
    gl_Position=projectionMatrix*vec4(vView,1.0);
  }
`;

export const fieldVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv=uv;
    vec4 p=vec4(position,1.0);
    #ifdef USE_INSTANCING
      p=instanceMatrix*p;
    #endif
    gl_Position=projectionMatrix*modelViewMatrix*p;
  }
`;
export const haloFragment = /* glsl */ `
  varying vec2 vUv;
  void main() {
    float r=length(vUv-.5)*2.0;
    float glow=exp(-r*r*7.0)*(1.0-smoothstep(.65,1.0,r));
    gl_FragColor=vec4(mix(vec3(.48,.12,1.0),vec3(1.0,.68,.25),exp(-r*r*22.0)),glow*.65);
  }
`;
export const impactFragment = /* glsl */ `
  varying vec2 vUv;
  uniform float uAge, uPower, uFailure;
  void main() {
    vec2 p=(vUv-.5)*2.0;
    float r=length(p), a=atan(p.y,p.x), t=uAge;
    float fade=exp(-t*2.8)*(1.0-smoothstep(.72,1.0,r));
    float twist=a+r*16.0+t*9.0;
    float filaments=pow(.5+.5*sin(twist*5.0+sin(a*3.0-t*5.0)),12.0);
    float sink=exp(-pow((r-(.30*exp(-t*3.0)+.05))/.09,2.0));
    float front=.08+t*.85;
    float warp=sin(a*7.0-t*4.0)*.009+sin(a*13.0+t)*.006;
    float ring=exp(-pow((r-front+warp)/(.011+t*.016),2.0))*exp(-t*2.4);
    float wake=exp(-pow((r-front*.78)/.065,2.0))*exp(-t*4.0)*.25;
    float flash=exp(-r*r*50.0-t*24.0)*2.8;
    float spiral=filaments*sink*fade*.8;
    float light=flash+ring+wake+spiral;
    vec3 colour=mix(vec3(1.0,.40,.12),vec3(.60,.16,1.0),uFailure);
    colour=mix(colour,vec3(1.0,.94,.74),clamp(flash+ring*.6,0.0,1.0));
    gl_FragColor=vec4(colour,clamp(light*(.65+uPower*.55),0.0,.95));
  }
`;
export const ribbonVertex = /* glsl */ `
  attribute float fade, across;
  varying float vFade, vAcross;
  void main(){
    vFade=fade;vAcross=across;
    gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
  }
`;
export const ribbonFragment = /* glsl */ `
  uniform float uOpacity;
  varying float vFade, vAcross;
  void main(){
    float spine=exp(-vAcross*vAcross*75.0);
    float halo=exp(-vAcross*vAcross*5.0);
    vec3 colour=mix(vec3(.42,.07,1.0),vec3(1.0,.5,.14),vFade);
    colour=mix(colour,vec3(1.0,.96,.76),spine);
    gl_FragColor=vec4(colour,(halo*.35+spine*.8)*pow(vFade,.65)*uOpacity);
  }
`;

export const auraFragment = /* glsl */ `
  varying vec2 vUv;
  uniform float uCharge, uAge, uTime;
  void main() {
    vec2 p=(vUv-.5)*2.0;
    float r=length(p), a=atan(p.y,p.x);
    float fog=exp(-pow((r-.43)/.19,2.0));
    float flow=.65+.35*sin(a*3.0-r*19.0+uTime*.8+sin(a*5.0+uTime*.3));
    float front=.37+uAge*.42;
    float wave=exp(-pow((r-front)/.028,2.0))*exp(-uAge*3.8);
    float veil=fog*flow*(.055+uCharge*.13);
    vec3 colour=mix(vec3(.24,.055,.7),vec3(.8,.27,.14),wave);
    gl_FragColor=vec4(colour,(veil+wave*.24)*(1.0-smoothstep(.8,1.0,r)));
  }
`;
