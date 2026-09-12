uniform float uTime;
uniform vec2 uResolution;
uniform vec2 uMouse;
uniform float uSpeed;
uniform float uAmplitude;
uniform float uFrequency;

varying vec2 vUv;

#include ../../utils/noise.glsl;

void main() {
    vec2 uv = vUv;
    
    float time = uTime * uSpeed;
    vec2 pos = uv * uFrequency + vec2(time * 0.3, time * 0.2);
    
    float noise = 0.0;
    float amplitude = uAmplitude;
    float freq = 1.0;
    
    for(int i = 0; i < 4; i++) {
        noise += snoise(pos * freq) * amplitude;
        freq *= 2.0;
        amplitude *= 0.5;
    }
    
    float wave = sin(uv.x * 6.0 + time) * 0.1;
    noise += wave;
    
    vec3 color1 = vec3(0.1, 0.4, 0.8);
    vec3 color2 = vec3(0.8, 0.2, 0.6);
    vec3 color3 = vec3(0.9, 0.7, 0.2);
    
    vec3 color = mix(color1, color2, smoothstep(-0.5, 0.0, noise));
    color = mix(color, color3, smoothstep(0.0, 0.5, noise));
    
    gl_FragColor = vec4(color, 1.0);
} 