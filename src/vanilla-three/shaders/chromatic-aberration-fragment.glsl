uniform sampler2D tDiffuse;
uniform float uStrength;
varying vec2 vUv;

void main() {
  vec2 distortion = (vUv - 0.5) * uStrength;
  
  float r = texture2D(tDiffuse, vUv + distortion).r;
  float g = texture2D(tDiffuse, vUv).g;
  float b = texture2D(tDiffuse, vUv - distortion).b;
  
  gl_FragColor = vec4(r, g, b, 1.0);
} 