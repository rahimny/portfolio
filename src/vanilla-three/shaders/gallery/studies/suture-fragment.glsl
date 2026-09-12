precision highp float;
varying vec2 vUv;
uniform vec2 uResolution;
uniform float uClock, uSeed, uFocusX, uFocusY;
uniform float uTension, uWeave, uSplit;

mat2 turn(float a) { float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }

// A pleated annular membrane. Its twist and seam alter the field itself.
vec2 membrane(vec3 p) {
  float angle = atan(p.y, p.x);
  float seed = uSeed * 0.73;
  float tension = uTension + uFocusX * 0.25;
  float radius = 1.08 + 0.13 * sin(angle * 3.0 + seed)
    + 0.12 * tension * cos(angle * 2.0);
  vec2 section = vec2(length(p.xy) - radius, p.z);
  section *= turn(angle * 2.0 + 0.28 * sin(uClock * 0.3) + tension);
  float wave = angle * uWeave + section.x * 13.0 - uClock * 0.65;
  float pleat = 0.065 * sin(wave) + 0.025 * sin(wave * 2.0 + seed);
  float width = 0.26 + 0.07 * sin(angle * 3.0 - uClock * 0.25);
  float sheet = max(abs(section.y - pleat) - 0.018, abs(section.x) - width);
  float seam = uSplit * 0.9 + uFocusY * 0.25;
  sheet = max(sheet, seam - abs(angle));
  // The finer helical thread persists across the cut, exposing the joining rule.
  vec2 threadCenter = 0.21 * vec2(cos(angle * 7.0 + seed), sin(angle * 7.0 + seed));
  float thread = length(section - threadCenter) - 0.011;
  float field = min(sheet, thread);
  return vec2(field, angle * 0.22 + section.x * 1.5 + 0.08 * sin(wave));
}

vec3 spectrum(float phase) {
  vec3 spectral = 0.5 + 0.5 * cos(6.28318 * (phase + vec3(0.0, 0.32, 0.62)));
  return mix(vec3(0.18, 0.5, 0.9), spectral * spectral, 0.95);
}

void main() {
  float aspect = uResolution.x / uResolution.y;
  vec2 screen = (vUv * 2.0 - 1.0) * vec2(aspect, 1.0);
  screen.y += 0.03;
  vec3 origin = vec3(0.0, 0.0, 4.4);
  vec3 ray = normalize(vec3(screen, -2.35 * min(aspect, 1.0)));
  origin.yz *= turn(0.5); ray.yz *= turn(0.5);
  origin.xz *= turn(-0.25); ray.xz *= turn(-0.25);
  vec3 color = vec3(0.0015, 0.0022, 0.006) * exp(-dot(screen,screen));
  float b = dot(origin,ray);
  float determinant = b*b-dot(origin,origin)+2.9;
  if (determinant > 0.0) {
    float root = sqrt(determinant);
    float travel = -b-root;
    float end = -b+root;
    float transmission = 1.0;
    for (int i=0; i<112; i++) {
      if (travel > end || transmission < 0.03) break;
      vec3 p = origin + ray*travel;
      vec2 sampleField = membrane(p);
      float distanceToField = abs(sampleField.x);
      float stride = clamp(distanceToField * 0.42, 0.006, 0.11);
      float density = exp(-distanceToField * 155.0);
      float opacity = 1.0-exp(-density*stride*65.0);
      vec3 light = spectrum(sampleField.y + uSeed * 0.117);
      float embroidery = pow(0.5+0.5*cos(atan(p.y,p.x)*96.0+p.z*22.0),8.0);
      light = light * (1.7 + embroidery*2.0) + vec3(0.012,0.018,0.025);
      color += transmission * opacity * light;
      color += transmission * spectrum(sampleField.y) * exp(-distanceToField*16.0)*stride*0.16;
      transmission *= 1.0-opacity*0.72;
      travel += stride;
    }
  }
  color = 1.0-exp(-color*1.3);
  gl_FragColor = vec4(pow(max(color,0.0),vec3(1.0/2.2)),1.0);
}
