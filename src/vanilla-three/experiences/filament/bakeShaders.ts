const deformation = /* glsl */ `
  uniform float uDepthLayer;
  uniform vec4 uShells[23];
  uniform float uRadiiZ[23];
  float shellLight(vec3 p) {
    // The measured colony envelopes supply a low-frequency normal; actual
    // fibre z determines which side of that envelope receives the key light.
    vec3 normal = vec3(0.0,0.0,1.0);
    float nearest = 2.1;
    for(int i=0;i<23;i++) {
      vec3 radii = vec3(uShells[i].zw,uRadiiZ[i]);
      vec3 local = p-vec3(uShells[i].xy,i==22?30.0:40.0);
      float distance = length(local/radii);
      if(distance<nearest) {
        nearest=distance;
        normal=normalize(local/(radii*radii)+vec3(0.0,0.0,0.000001));
      }
    }
    float diffuse=max(0.0,dot(normal,normalize(vec3(-0.5,-0.65,0.85))));
    return .3+diffuse*.9+pow(1.0-abs(normal.z),3.0)*.12;
  }
  uniform float uTime;
  uniform float uTension;
  uniform float uPixelRatio;
  uniform float uPointScale;
  uniform vec2 uResolution;
  uniform float uLineScale;
  varying float vLight;
  varying vec3 vPosition;
  vec3 deform(vec3 p) {
    vec2 d = p.xy - vec2(511.0, 520.0);
    float r = length(d);
    float envelope = exp(-pow((r - 250.0) / 170.0, 2.0));
    float pulse = sin(uTime * 0.55 + r * 0.011) * sin(uTime * 0.19);
    p.xy += d * envelope * ((uTension - 1.0) * 0.15 + pulse * 0.009);
    p.z += sin(uTime * 0.4 + p.x * 0.008) * sin(uTime * 0.2) * 2.0;
    return p;
  }
`;
export const filamentVertex = /* glsl */ `
  attribute vec3 aStart;
  attribute vec3 aEnd;
  attribute float aLight;
  varying float vAcross;
  ${deformation}
  void main() {
    vec3 start = deform(aStart), end = deform(aEnd);
    vec4 a = projectionMatrix * modelViewMatrix * vec4(start, 1.0);
    vec4 b = projectionMatrix * modelViewMatrix * vec4(end, 1.0);
    vec2 delta = (b.xy / b.w - a.xy / a.w) * uResolution;
    float lineLength = length(delta);
    vec2 normal = lineLength > 0.0001 ? vec2(-delta.y, delta.x) / lineLength : vec2(0.0, 1.0);
    float halfWidth = 0.5 * uLineScale + 0.75;
    gl_Position = mix(a, b, position.x);
    gl_Position.xy += normal * position.y * halfWidth * 2.0 / uResolution * gl_Position.w;
    vAcross = position.y * halfWidth;
    vPosition = mix(start, end, position.x);
    vLight = aLight * (uDepthLayer > 0.5 ? shellLight(vPosition) : 1.0);
  }
`;
export const particleVertex = /* glsl */ `
  attribute float aLight;
  ${deformation}
  void main() {
    vec3 p = deform(position);
    vPosition = p;
    vLight = aLight * (uDepthLayer > 0.5 ? shellLight(vPosition) : 1.0);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = max(1.0, uLineScale * uPointScale);
  }
`;
export const filamentFragment = /* glsl */ `
  uniform float uDepthLayer;
  uniform float uExposure;
  uniform float uLineScale;
  varying float vLight;
  varying vec3 vPosition;
  #ifndef PARTICLES
    varying float vAcross;
  #endif
  void main() {
    float upper = 1.18 - smoothstep(170.0, 780.0, vPosition.y) * 0.38;
    vec2 coreUV = (vPosition.xy-vec2(515.0,565.0))/vec2(205.0,210.0);
    float core = exp(-dot(coreUV,coreUV));
    float attenuation = (1.0 - core * smoothstep(345.0, 720.0, vPosition.y) * 0.74) * upper;
    float alpha = min(0.85, vLight * uExposure * attenuation);
    #ifdef PARTICLES
      float radius = length(gl_PointCoord - 0.5) * 2.0;
      alpha *= (1.0 - smoothstep(0.1, 1.0, radius)) * min(1.0, uLineScale*uLineScale);
    #else
      float aa = max(0.6, fwidth(vAcross));
      alpha *= clamp((uLineScale * 0.5 - abs(vAcross)) / aa + 0.5, 0.0, 1.0);
    #endif
    if(uDepthLayer > 0.5) {
      float front=smoothstep(35.0,75.0,vPosition.z);
      float back=1.0-smoothstep(-40.0,10.0,vPosition.z);
      alpha *= uDepthLayer<1.5?front:(uDepthLayer<2.5?1.0-front-back:back);
    }
    gl_FragColor = vec4(vec3(0.94, 0.945, 0.925), alpha);
  }
`;
