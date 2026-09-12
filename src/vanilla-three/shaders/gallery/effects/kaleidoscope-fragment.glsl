uniform float uTime;
uniform vec2 uResolution;
uniform vec2 uMouse;
uniform float uSegments;
uniform float uRotation;
uniform float uScale;

varying vec2 vUv;

#include ../../utils/fbm.glsl;
#include ../../utils/math.glsl;

vec2 kaleidoscope(vec2 uv, float segments) {
    // Convert to polar coordinates
    float angle = atan(uv.y, uv.x);
    float radius = length(uv);
    
    // Create segments
    float segmentAngle = 2.0 * PI / segments;
    angle = mod(angle, segmentAngle);
    
    // Mirror every other segment
    if (mod(floor((atan(uv.y, uv.x) + PI) / segmentAngle), 2.0) == 1.0) {
        angle = segmentAngle - angle;
    }
    
    // Convert back to cartesian
    return vec2(cos(angle), sin(angle)) * radius;
}

void main() {
    vec2 uv = (vUv - 0.5) * 2.0;
    uv.x *= uResolution.x / uResolution.y;
    
    // Apply rotation
    float rotation = uRotation + uTime * 0.1;
    float s = sin(rotation);
    float c = cos(rotation);
    uv = mat2(c, -s, s, c) * uv;
    
    // Apply kaleidoscope effect
    vec2 kaleido = kaleidoscope(uv * uScale, uSegments);
    
    // Create colorful pattern
    float pattern1 = fbm(kaleido * 3.0 + uTime * 0.2);
    float pattern2 = fbm(kaleido * 5.0 - uTime * 0.15);
    float pattern3 = fbm(kaleido * 7.0 + uTime * 0.1);
    
    // Color mapping
    vec3 color1 = vec3(1.0, 0.2, 0.5);  // Pink
    vec3 color2 = vec3(0.2, 0.8, 1.0);  // Cyan
    vec3 color3 = vec3(1.0, 0.8, 0.2);  // Yellow
    vec3 color4 = vec3(0.5, 0.2, 1.0);  // Purple
    
    vec3 color = mix(color1, color2, pattern1);
    color = mix(color, color3, pattern2);
    color = mix(color, color4, pattern3);
    
    // Add some brightness variation
    float brightness = (pattern1 + pattern2 + pattern3) / 3.0;
    color *= 0.5 + brightness * 0.5;
    
    gl_FragColor = vec4(color, 1.0);
} 