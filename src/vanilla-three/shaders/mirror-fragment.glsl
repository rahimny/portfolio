uniform sampler2D tDiffuse;
uniform int uMirrorType;
uniform float uIntensity;
uniform float uSegments;
uniform float uOffset;
uniform vec2 uResolution;
varying vec2 vUv;

vec2 mirrorHorizontal(vec2 uv, float offset) {
  if (uv.x > offset) {
    uv.x = offset - (uv.x - offset);
  }
  return uv;
}

vec2 mirrorVertical(vec2 uv, float offset) {
  if (uv.y > offset) {
    uv.y = offset - (uv.y - offset);
  }
  return uv;
}

vec2 mirrorDiagonal(vec2 uv) {
  if (uv.x + uv.y > 1.0) {
    float temp = uv.x;
    uv.x = 1.0 - uv.y;
    uv.y = 1.0 - temp;
  }
  return uv;
}

vec2 mirrorQuadrant(vec2 uv) {
  vec2 center = vec2(0.5);
  vec2 toCenter = abs(uv - center);
  return center + toCenter;
}

vec2 mirrorRadial(vec2 uv, float segments) {
  vec2 center = vec2(0.5);
  vec2 delta = uv - center;
  float angle = atan(delta.y, delta.x);
  float radius = length(delta);
  
  float segmentAngle = 2.0 * 3.14159 / segments;
  angle = mod(angle, segmentAngle);
  if (mod(floor((atan(delta.y, delta.x) + 3.14159) / segmentAngle), 2.0) >= 1.0) {
    angle = segmentAngle - angle;
  }
  
  return center + radius * vec2(cos(angle), sin(angle));
}

vec2 mirrorKaleidoscope(vec2 uv, float segments) {
  vec2 center = vec2(0.5);
  vec2 delta = uv - center;
  float angle = atan(delta.y, delta.x);
  float radius = length(delta);
  
  float segmentAngle = 3.14159 / segments;
  angle = mod(angle + 3.14159, segmentAngle);
  
  return center + radius * vec2(cos(angle), sin(angle));
}

vec2 mirrorCenter(vec2 uv, float offset) {
  vec2 center = vec2(offset);
  vec2 delta = uv - center;
  float dist = length(delta);
  
  if (dist > 0.5) {
    return center - normalize(delta) * (dist - 0.5);
  }
  return uv;
}

void main() {
  vec2 mirroredUv = vUv;
  
  if (uMirrorType == 0) {
    // Horizontal mirror
    mirroredUv = mirrorHorizontal(vUv, uOffset);
  } else if (uMirrorType == 1) {
    // Vertical mirror
    mirroredUv = mirrorVertical(vUv, uOffset);
  } else if (uMirrorType == 2) {
    // Kaleidoscope
    mirroredUv = mirrorKaleidoscope(vUv, uSegments);
  } else if (uMirrorType == 3) {
    // Radial mirror
    mirroredUv = mirrorRadial(vUv, uSegments);
  } else if (uMirrorType == 4) {
    // Diagonal mirror
    mirroredUv = mirrorDiagonal(vUv);
  } else if (uMirrorType == 5) {
    // Quadrant mirror
    mirroredUv = mirrorQuadrant(vUv);
  } else if (uMirrorType == 6) {
    // Center mirror
    mirroredUv = mirrorCenter(vUv, uOffset);
  }
  
  vec4 original = texture2D(tDiffuse, vUv);
  vec4 mirrored = texture2D(tDiffuse, mirroredUv);
  
  gl_FragColor = mix(original, mirrored, uIntensity);
} 