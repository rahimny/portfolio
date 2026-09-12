precision highp float;
varying vec2 vUv;
uniform vec2 uResolution;
uniform float uClock, uSeed, uFocusX, uFocusY;
uniform float uRelief, uContours, uSection;
uniform float uImpulse, uImpulseAge;
uniform vec2 uImpulseOrigin;
uniform float uFraming;
uniform float uPagePalette;
uniform vec3 uPaper, uInk, uSignal;

float heightField(vec2 p) {
  float phase = uClock * 0.32;
  float seed = uSeed * 1.37;
  // Interfering radial sources form the terraces; the pointer relocates a source.
  vec2 source = vec2(uFocusX,uFocusY)*0.62;
  float r1 = length(p-source-vec2(0.36,0.16));
  float r2 = length(p+vec2(0.46,-0.27));
  float wave = 0.16*sin(r1*9.0-phase+seed) + 0.12*cos(r2*11.0+phase);
  if (uImpulse > 0.001) {
    float radius = length(p-uImpulseOrigin);
    wave += uImpulse*0.2*sin(radius*13.0-uImpulseAge*6.5)*exp(-pow(radius-uImpulseAge*0.5,2.0)*8.0);
  }
  float envelope = exp(-dot(p,p)*1.4);
  return (0.38 + wave + 0.12*sin(p.x*5.0+p.y*3.0+seed))*envelope*uRelief;
}

vec3 ink(float level) {
  vec3 low = vec3(0.018,0.065,0.19);
  vec3 middle = vec3(0.04,0.63,0.67);
  vec3 high = vec3(1.0,0.46,0.13);
  return mix(mix(low,middle,smoothstep(0.0,0.43,level)),high,smoothstep(0.44,0.9,level));
}

void main() {
  float aspect = uResolution.x/uResolution.y;
  vec2 screen = (vUv*2.0-1.0)*vec2(aspect,1.0)/min(aspect,1.0);
  screen *= uFraming > 0.0 ? uFraming : 1.48;
  screen.y += 0.1;
  bool page = uPagePalette > 0.5;
  vec3 color = page ? uPaper : vec3(0.006,0.013,0.027);
  // Orthographic isometric slices, composited from the lowest level upwards.
  // This is an analytic height field, not a voxel simulation.
  for (int layer=0; layer<48; layer++) {
    float level = float(layer)/47.0;
    if (level > uSection) break;
    float height = level*0.8;
    vec2 plane = vec2(screen.x, (screen.y-height*1.4)/0.48);
    plane = mat2(0.866,-0.5,0.5,0.866)*plane;
    float field = heightField(plane);
    float interval = 0.8/uContours;
    float terrace = floor(field/interval)*interval;
    float aa = max(fwidth(field)*0.8,0.0015);
    float inside = smoothstep(height-aa,height+aa,terrace);
    float base = 1.0-smoothstep(1.13,1.15,length(plane));
    inside *= base;
    float contour = 1.0-smoothstep(0.002,0.013+aa,abs(field-height));
    vec2 grid = abs(fract(plane*24.0)-0.5);
    float lattice = (1.0-smoothstep(0.035,0.06,min(grid.x,grid.y)))*0.17;
    vec3 surface = ink(level)*mix(0.36,1.0,contour) + ink(level)*lattice;
    surface += contour*vec3(0.1,0.18,0.17);
    if (page) {
      surface = mix(uPaper,uInk,0.045+(1.0-level)*0.09);
      surface = mix(surface,uInk,contour*0.62+lattice*0.16);
      float signal = uImpulse*exp(-pow(length(plane-uImpulseOrigin)-uImpulseAge*0.5,2.0)*12.0);
      surface = mix(surface,uSignal,signal*0.86);
    }
    color = mix(color,surface,inside*0.96);
  }
  // Sparse registration lines reveal the plane shared by every contour.
  vec2 ground = vec2(screen.x,screen.y/0.48);
  ground = mat2(0.866,-0.5,0.5,0.866)*ground;
  float border = exp(-abs(length(ground)-1.16)*180.0)*0.12;
  if (page) {
    color = mix(color,uInk,border*0.7);
    gl_FragColor = vec4(color,1.0);
    return;
  }
  color += border*vec3(0.1,0.5,0.65);
  color *= 1.0-0.15*smoothstep(0.8,2.1,length(screen));
  color = 1.0-exp(-color*1.6);
  gl_FragColor = vec4(pow(max(color,0.0),vec3(1.0/2.2)),1.0);
}
