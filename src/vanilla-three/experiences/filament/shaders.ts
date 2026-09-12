export const fieldVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const fieldFragment = /* glsl */ `
  uniform sampler2D uSpecimen;
  uniform sampler2D uSignals;
  uniform sampler2D uDepthField;
  uniform float uDepth;
  uniform float uNetwork;
  uniform float uTime;
  uniform float uStrength;
  uniform float uSpectral;
  uniform float uGlitch;
  uniform float uBurst;
  uniform float uPixelation;
  uniform float uStretch;
  uniform float uStretchVertical;
  uniform float uMode;
  uniform float uTension;
  uniform float uExposure;
  uniform float uZoom;
  uniform vec2 uPointer;
  uniform float uTouch;
  uniform vec2 uGrab;
  uniform vec2 uDrag;
  uniform float uHover;
  uniform float uDigitalDrag;
  varying vec2 vUv;

  vec2 rotate(vec2 p, float angle) {
    float c = cos(angle), s = sin(angle);
    return mat2(c, -s, s, c) * p;
  }

  float hash(float value) {
    return fract(sin(value*127.1+311.7)*43758.5453);
  }

  vec2 digitalCoordinates(vec2 uv, out float tear) {
    // Quantise display coordinates once: all anatomy and signals share a cell.
    if(uPixelation>0.001) {
      float cell=(1.0+uPixelation*uPixelation*39.0)/1024.0;
      uv=(floor(uv/cell)+0.5)*cell;
    }
    if(uStretch>0.001) {
      vec2 axis=uStretchVertical>0.5?uv.yx:uv;
      float row=floor(axis.y*1024.0/(3.0+uStretch*17.0));
      float selected=step(1.0-uStretch*.78,hash(row+19.0));
      float span=.014+uStretch*uStretch*.42;
      float anchor=(floor(axis.x/span)+hash(row+47.0))*span;
      axis.x=mix(axis.x,anchor,selected*smoothstep(0.0,.55,uStretch));
      uv=uStretchVertical>0.5?axis.yx:axis;
    }
    vec2 material=(uv-.5)*2.0/uZoom;
    float dragLength=length(uDrag);
    float along=clamp(dot(material-uGrab,uDrag)/max(dot(uDrag,uDrag),.00001),0.0,1.0);
    vec2 toStrand=material-(uGrab+uDrag*along);
    float influence=exp(-dot(toStrand,toStrand)*38.0);
    float strain=smoothstep(.025,.45,dragLength)*influence*uDigitalDrag;
    // Pull from the grabbed point. A capsule of strain follows the gesture,
    // rather than dragging a disconnected screen-space filter over the image.
    uv-=uDrag*uZoom*.5*influence*.85;
    if(strain>.001) {
      float cell=(1.0+strain*strain*15.0)/1024.0;
      uv=mix(uv,(floor(uv/cell)+.5)*cell,strain);
      vec2 direction=uDrag/max(dragLength,.0001);
      float stretchedCell=(1.0+strain*strain*85.0)/1024.0;
      float projected=dot(uv,direction);
      float held=(floor(projected/stretchedCell)+.5)*stretchedCell;
      uv+=direction*(held-projected)*strain;
      vec2 across=vec2(-direction.y,direction.x);
      float band=floor(dot(material,across)*75.0);
      float slip=(hash(band+floor(uTime*6.0)*13.0)-.5)*strain*.035;
      uv+=direction*slip;
    }
    tear=strain*.35;
    if(uGlitch<0.001 && uBurst<0.001) return uv;
    // Sparse local tears, never a full-screen brightness flash. The shared
    // simulation clock makes paused frames and exports reproducible.
    float beat=uTime*1.35;
    float envelope=1.0-smoothstep(.03,.24,fract(beat));
    float force=clamp(uGlitch*(.15+.85*envelope)+uBurst*.9,0.0,1.0);
    float frame=floor(uTime*8.0);
    float row=floor(uv.y*(38.0+floor(hash(frame)*9.0)));
    tear=max(tear,step(.67,hash(row+frame*71.0))*force);
    uv.x+=(hash(row*3.0+frame*17.0)-.5)*tear*.28;
    return uv;
  }

  vec3 specimen(vec2 p) {
    vec2 uv = p * 0.5 + 0.5;
    // Explicit border avoids smearing the outermost texel beyond the specimen.
    float inside = step(0.0, uv.x) * step(0.0, uv.y) * step(uv.x, 1.0) * step(uv.y, 1.0);
    vec2 sampleUv=clamp(uv,0.0,1.0);
    float pixelLod=uPixelation>0.001?log2(1.0+uPixelation*uPixelation*39.0)*.7:0.0;
    vec3 base=texture2D(uSpecimen,sampleUv,pixelLod).rgb;
    if(uDepth>0.001) {
      // RGB stores near, middle and far fibres, lit from their 3D coordinates.
      vec3 layers=texture2D(uDepthField,sampleUv,pixelLod).rgb;
      vec2 lightOffset=vec2(-2.5,3.2)/1024.0;
      vec3 shadow=(texture2D(uDepthField,clamp(sampleUv+lightOffset,0.0,1.0)).rgb
                  +texture2D(uDepthField,clamp(sampleUv+lightOffset*2.5,0.0,1.0)).rgb)*0.5;
      float transmission=exp(-shadow.r*2.2);
      float near=layers.r;
      float middle=layers.g*transmission*0.9;
      float far=layers.b*exp(-(shadow.r+shadow.g)*2.8)*0.52;
      float relief=near+(1.0-near)*(middle+(1.0-middle)*far);
      vec3 lit=vec3(relief)*vec3(1.02,1.025,1.0)*1.35;
      base=mix(base,lit,uDepth);
    }
    float pulse=texture2D(uSignals,sampleUv).r*uNetwork;
    return (base*mix(1.0,.68,uNetwork)+pulse*vec3(.89,1.0,.94))*inside;
  }

  vec2 field(vec2 p, float amount) {
    float r = length(p);
    float envelope = exp(-r*r*1.35);
    float rim = 1.0 - smoothstep(0.82, 1.04, r);
    // Zero time and unit tension reproduce the cached procedural drawing.
    float breathe = sin(uTime*0.83-r*8.0) * sin(uTime*0.37);
    p *= 1.0 + (uTension-1.0)*0.15*exp(-pow((r-0.49)/0.33,2.0));
    if(uMode < 0.5) return p;
    p *= 1.0 + amount*breathe*0.105*rim;
    if (uMode < 1.5) {
      float twist = sin(uTime*0.48-r*5.4)*sin(uTime*0.31)*1.8;
      p = rotate(p, amount*twist*envelope*rim);
    } else if (uMode < 2.5) {
      vec2 flowing = sin(p.yx*7.0 + vec2(uTime*0.55,-uTime*0.43));
      p += flowing*amount*0.065*rim;
      p += sin(p.yx*13.0 + vec2(-uTime*0.36,uTime*0.47))*amount*0.025*rim;
    } else {
      p = rotate(p, amount*sin(uTime*0.42-r*4.0)*0.65*rim);
      p *= 1.0 + amount*0.13*sin(r*17.0-uTime*0.85)*rim;
    }
    vec2 local = p-uPointer;
    float influence = exp(-dot(local,local)*14.0)*uTouch;
    p -= local*influence*0.18;
    p += vec2(-local.y,local.x)*influence*0.12;
    return p;
  }

  void main() {
    float tear;
    vec2 digitalUv=digitalCoordinates(vUv,tear);
    vec2 p = (digitalUv-0.5)*2.0/uZoom;
    float amount = uStrength*smoothstep(0.0,1.8,uTime);
    vec2 warped = field(p,amount);
    vec3 colour = specimen(warped);
    if (uMode > 2.5 && amount > 0.001) {
      // Two bounded nested readings of the same specimen, confined to its core.
      float gate = exp(-dot(p,p)*13.0)*amount;
      vec2 echo = rotate(warped, uTime*0.14)*(2.6+0.25*sin(uTime*0.4));
      colour = mix(colour, max(colour*0.58, specimen(echo)), gate*0.82);
      colour += specimen(rotate(echo, -uTime*0.24)*2.7)*gate*0.18;
    }
    if (uSpectral > 0.001 || tear > 0.001) {
      vec2 offset = vec2(cos(uTime*0.27),sin(uTime*0.31))*uSpectral*0.012+vec2(tear*.014,0.0);
      vec3 dispersion = vec3(specimen(warped+offset).r,colour.g,specimen(warped-offset).b);
      colour = mix(colour,dispersion,max(uSpectral,tear*.85));
    }
    vec2 hoverDistance=(vUv-.5)*2.0/uZoom-uPointer;
    float reveal=exp(-dot(hoverDistance,hoverDistance)*34.0)*uHover;
    colour*=1.0+reveal*.22;
    gl_FragColor = vec4(clamp(colour*uExposure,0.0,1.0),1.0);
  }
`;
