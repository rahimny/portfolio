uniform vec2 uResolution, uViewport, uOffset, uCuts;
uniform float uSlicing, uCutAccent;
uniform vec3 uEye, uPaper, uInk, uBrand, uWeights, uPointer, uPulseOrigin;
uniform mat4 uCameraWorld;
uniform float uFov, uPower, uSection, uFine, uTime, uAmplitude;
uniform float uScale, uBranching, uComplexity, uPointerStrength, uPulse, uPulseAge;
uniform float uFinish, uLine, uHatch;

vec3 livingCoordinates(vec3 point) {
  vec3 p = point / uScale;
  float breath = sin(uTime * 1.65) * 0.065 + sin(uTime * 0.67) * 0.035;
  vec3 stretch = vec3(1.0 + breath, 1.0 - breath * 0.65, 1.0 + breath * 0.4);
  p /= mix(vec3(1.0), stretch, uWeights.x * uAmplitude);
  float tide = sin(p.y * 3.5 - uTime * 1.6) * cos(p.z * 2.2 + uTime * 0.7);
  p.x += tide * uAmplitude * uWeights.y * 0.14;
  p.z += sin(p.x * 3.0 + p.y * 2.0 - uTime * 1.2) * uAmplitude * uWeights.y * 0.10;
  float twist = (p.y * 0.7 + sin(uTime * 0.8 + p.y * 2.0) * 0.6) * uWeights.z * uAmplitude;
  p.xz = mat2(cos(twist), -sin(twist), sin(twist), cos(twist)) * p.xz;
  float influence = exp(-dot(point - uPointer, point - uPointer) * 3.8);
  p -= normalize(uPointer + vec3(0.0001)) * influence * uPointerStrength * 0.26;
  float waveDistance = length(point - uPulseOrigin);
  float ripple = sin(waveDistance * 15.0 - uPulseAge * 8.0) * exp(-pow(waveDistance - uPulseAge * 0.7, 2.0) * 3.0);
  p *= 1.0 + ripple * uPulse * 0.075;
  return p;
}

vec2 bulb(vec3 point) {
  vec3 z = point;
  float derivative = 1.0;
  float radius = max(length(z), 0.000001);
  float trap = 1.0;
  float previous = 0.0;
  float distanceEstimate = max(0.5 * log(radius) * radius, 0.0);
  for (int iteration = 0; iteration < 9; iteration++) {
    radius = length(z);
    if (radius > 2.4) break;
    if (radius < 0.000001) return vec2(0.0, 0.0);
    trap = min(trap, radius);
    float theta = acos(clamp(z.z / radius, -1.0, 1.0));
    float phi = atan(z.y, z.x);
    float radialPower = pow(radius, uPower - 1.0);
    derivative = radialPower * uPower * derivative + 1.0;
    theta *= uPower;
    phi *= uPower;
    z = radialPower * radius * vec3(sin(theta) * cos(phi), sin(theta) * sin(phi), cos(theta)) + point;
    radius = max(length(z), 0.000001);
    previous = distanceEstimate;
    distanceEstimate = max(0.5 * log(radius) * radius / max(derivative, 0.000001), 0.0);
    float level = float(iteration + 1);
    if (level >= uComplexity) {
      if (iteration > 0) distanceEstimate = mix(previous, distanceEstimate, smoothstep(0.0, 1.0, uComplexity - (level - 1.0)));
      break;
    }
  }
  return vec2(distanceEstimate, trap);
}

float cursorCut(vec3 point) {
  if (uSlicing < 0.5) return -10.0;
  if (uSlicing < 1.5) return point.x - uCuts.x;
  if (uSlicing < 2.5) return point.y - uCuts.y;
  // Remove a corner rather than hiding three quarters of the body at centre.
  return min(point.x - uCuts.x, point.y - uCuts.y);
}
float field(vec3 point) {
  vec3 p = livingCoordinates(point);
  float seed = length(p) - 0.67;
  float fractal = bulb(p).x;
  // The morph and coordinate warp make this distance-like; under-step deliberately.
  float rounding = (1.0 - uBranching) * 0.18;
  float body = mix(seed, fractal - rounding, smoothstep(0.0, 0.3, uBranching)) * uScale;
  body /= 1.1 + uAmplitude * 0.65 + uPointerStrength * 0.6;
  return max(body, max(point.z - uSection, cursorCut(point)));
}
vec3 surfaceNormal(vec3 point, float epsilon) {
  vec2 e = vec2(1.0, -1.0) * epsilon;
  return normalize(e.xyy * field(point + e.xyy) + e.yyx * field(point + e.yyx) + e.yxy * field(point + e.yxy) + e.xxx * field(point + e.xxx));
}
float occlusion(vec3 point, vec3 normal) {
  float obstruction = 0.0;
  float weight = 1.0;
  for (int i = 1; i <= 4; i++) {
    float offset = float(i) * 0.05;
    obstruction += max(0.0, offset - field(point + normal * offset) * 1.7) * weight;
    weight *= 0.55;
  }
  return clamp(1.0 - obstruction * 4.5, 0.14, 1.0);
}
float celLight(float value) {
  float edge = max(fwidth(value), 0.012);
  return 0.20 + 0.25 * smoothstep(0.22 - edge, 0.22 + edge, value)
    + 0.28 * smoothstep(0.48 - edge, 0.48 + edge, value)
    + 0.27 * smoothstep(0.75 - edge, 0.75 + edge, value);
}
void main() {
  vec2 uv = (2.0 * gl_FragCoord.xy - uResolution) / uResolution.y;
  vec3 ray = normalize((uCameraWorld * vec4((uv + uOffset) * uFov, -1.0, 0.0)).xyz);
  vec3 color = uPaper;
  // A soft contact impression stays beneath the object in world coordinates.
  if (ray.y < -0.001) {
    float planeTravel = (-1.5 - uEye.y) / ray.y;
    vec3 floorPoint = uEye + ray * planeTravel;
    float contact = exp(-dot(floorPoint.xz, floorPoint.xz) * 1.65) * 0.09 * uScale;
    color = mix(color, uInk, contact);
  }
  float b = dot(uEye, ray);
  float discriminant = b * b - dot(uEye, uEye) + 3.61;
  if (discriminant > 0.0) {
    float travel = max(0.0, -b - sqrt(discriminant));
    float farTravel = -b + sqrt(discriminant);
    bool hit = false;
    float epsilon = 0.0006;
    vec3 point = uEye;
    for (int stepIndex = 0; stepIndex < 240; stepIndex++) {
      if (stepIndex >= 176 && uFine < 0.5) break;
      point = uEye + ray * travel;
      epsilon = max(0.0002, travel * uFov / uResolution.y * 0.7);
      float distanceEstimate = field(point);
      if (distanceEstimate < epsilon) { hit = true; break; }
      travel += max(distanceEstimate * 0.85, epsilon * 0.4);
      if (travel > farTravel) break;
    }
    if (hit) {
      vec3 normal = surfaceNormal(point, epsilon * 1.5);
      float ao = occlusion(point, normal);
      vec3 light = normalize(vec3(-3.0, 4.5, 3.0));
      float diffuse = max(dot(normal, light), 0.0);
      float trap = bulb(livingCoordinates(point)).y;
      float facing = max(0.0, dot(normal, -ray));
      float shade = (uFinish > 1.5 ? 0.24 + diffuse * 0.76 : celLight(diffuse)) * ao;
      vec3 porcelain = mix(uPaper * 0.85, vec3(0.93, 0.91, 0.86), smoothstep(0.35, 0.9, trap));
      color = porcelain * shade;
      float contour = (1.0 - smoothstep(0.08, 0.36, facing)) * 0.78;
      contour += (1.0 - smoothstep(0.18, 0.65, ao)) * 0.35;
      color = mix(color, uInk, clamp(contour * uLine, 0.0, 0.92));
      vec2 paperPx = gl_FragCoord.xy * uViewport / uResolution;
      float hatchPhase = (paperPx.x + paperPx.y) / 6.0;
      float hatch = 1.0 - smoothstep(0.06, 0.06 + max(fwidth(hatchPhase), 0.07), abs(fract(hatchPhase) - 0.5));
      color = mix(color, uInk, hatch * (1.0 - smoothstep(0.25, 0.65, shade)) * uHatch * 0.55);
      if (uFinish > 1.5) {
        vec3 halfVector = normalize(light - ray);
        color += vec3(0.28) * pow(max(dot(normal, halfVector), 0.0), 42.0) * ao;
      }
      bool zCap = uSection < 1.35 && abs(point.z - uSection) < epsilon * 5.0;
      bool cursorCap = uSlicing > 0.5 && abs(cursorCut(point)) < epsilon * 5.0;
      if (zCap || cursorCap) {
        float contourPhase = trap * 42.0;
        float width = max(fwidth(contourPhase), 0.04);
        float contourLine = 1.0 - smoothstep(0.035, 0.035 + width, abs(fract(contourPhase) - 0.5));
        vec3 cutPaper = mix(uPaper, vec3(0.64, 0.58, 0.48), 0.16);
        color = cutPaper * (0.72 + 0.22 * ao);
        color = mix(color, uInk, contourLine * 0.22);
        // Warmth belongs to the exposed material, never to a whole-body hover wash.
        color = mix(color, uBrand * 0.52 + cutPaper * 0.18, uCutAccent);
      }
    }
  }
  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}
