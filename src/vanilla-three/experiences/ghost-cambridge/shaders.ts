export const vertexShader = /* glsl */ `
attribute float intensity, classification, heightAboveGround, acquisition, returnKind;
uniform float uRelief, uPointSize, uPointScale, uScan, uWidth, uTime, uPingTime;
uniform float uFloor, uLayer, uPalette, uMap, uSection, uSlice, uReplay, uReturnFilter;
uniform vec2 uOrigin;
varying vec3 vColour;
varying float vVisible;
vec3 thermal(float t) {
  vec3 colour = mix(vec3(0.045, 0.018, 0.18), vec3(0.46, 0.07, 0.31), smoothstep(0.0, 0.35, t));
  colour = mix(colour, vec3(1.0, 0.22, 0.12), smoothstep(0.25, 0.7, t));
  return mix(colour, vec3(1.0, 0.93, 0.51), smoothstep(0.65, 1.0, t));
}
void main() {
  float height = position.y * 100.0;
  bool vegetation = classification >= 3.0 && classification <= 5.0;
  bool ground = classification == 2.0;
  bool building = classification == 6.0;
  float visible = step(uFloor, heightAboveGround);
  if (uLayer == 1.0 && !vegetation) visible = 0.0;
  if (uLayer == 2.0 && !ground) visible = 0.0;
  if (uLayer == 3.0 && !building) visible = 0.0;
  if (uReturnFilter == 1.0 && returnKind != 1.0 && returnKind != 3.0) visible = 0.0;
  if (uReturnFilter == 2.0 && returnKind < 2.0) visible = 0.0;
  float sliceX = (uSlice - 0.5) * uWidth;
  if (uSection > 0.5 && abs(position.x - sliceX) > 0.32) visible = 0.0;
  float response = smoothstep(0.08, 0.75, intensity);
  float age = uTime - uPingTime;
  float echo = 0.0;
  // A bounded travelling wave packet; inactive clicks add no radial shader work.
  if (age >= 0.0 && age < 6.0) {
    float offset = length(position.xz - uOrigin) - age * 2.2;
    float envelope = exp(-offset * offset * 1.6)
      * smoothstep(0.0, 0.15, age) * (1.0 - smoothstep(0.0, 6.0, age));
    float oscillation = sin(offset * 11.0);
    echo = envelope * (0.35 + 0.65 * max(0.0, oscillation));
  }
  vec3 p = position;
  p.y = mix(p.y * uRelief, p.y * 0.008, uMap);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float scanX = (uScan - 0.5) * uWidth;
  float distanceToScan = abs(position.x - scanX);
  float front = exp(-distanceToScan * distanceToScan * 500.0);
  float wake = exp(-max(0.0, scanX - position.x) * 0.7) * step(position.x, scanX);
  if (uReplay > 0.5) {
    float distanceToTime = abs(acquisition - uScan);
    front = exp(-distanceToTime * distanceToTime * 180000.0);
    wake = step(acquisition, uScan);
  }
  // Illumination carries the wave; measured structure and point footprints stay still.
  float wave = clamp(max(sqrt(front), sqrt(echo)), 0.0, 1.0);
  float pulse = response * wave;
  gl_PointSize = uPointSize * uPointScale;
  float elevation = clamp(heightAboveGround / 40.0, 0.0, 1.0);
  // Atlas colour encodes the source's automated classes, not photographed colour.
  vec3 base = vec3(0.052, 0.09, 0.105);
  if (vegetation) base = mix(vec3(0.04, 0.16, 0.15), vec3(0.19, 0.40, 0.30), elevation);
  if (building) base = mix(vec3(0.48, 0.43, 0.33), vec3(0.95, 0.88, 0.66), elevation);
  if (classification == 1.0) base = vec3(0.20, 0.24, 0.27);
  base *= mix(0.65, 1.1, intensity);
  if (uPalette == 1.0) base = thermal(elevation) * mix(0.65, 1.0, intensity);
  if (uPalette == 2.0) base = mix(vec3(0.015, 0.07, 0.08), vec3(0.45, 0.85, 0.77), pow(clamp(height / 38.0, 0.0, 1.0), 1.4)) * mix(0.7, 1.15, intensity);
  if (uPalette == 3.0) base = vec3(0.025 + pow(intensity, 0.85) * 0.9);
  float illumination = uPalette == 2.0 ? 0.24 + wake * 0.76 : 0.88 + wake * 0.12;
  if (uReplay > 0.5) illumination = 0.07 + wake * 0.93;
  float scanEffect = uPalette == 3.0 && uReplay < 0.5 ? 0.0 : front * 0.9;
  float highlight = clamp(scanEffect + echo, 0.0, 1.0) * mix(0.18, 1.0, response);
  vColour = mix(base * illumination * (1.0 + 0.9 * pulse), vec3(1.0, 0.5, 0.17), highlight);
  vVisible = visible;
}
`;
export const fragmentShader = /* glsl */ `
varying vec3 vColour;
varying float vVisible;
void main() {
  float radius = length(gl_PointCoord - 0.5);
  if (radius > 0.5 || vVisible < 0.5) discard;
  float coverage = 1.0 - smoothstep(0.5 - fwidth(radius), 0.5, radius);
  gl_FragColor = vec4(vColour, coverage);
  #include <colorspace_fragment>
}
`;
