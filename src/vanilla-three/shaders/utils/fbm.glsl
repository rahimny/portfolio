#include noise.glsl;

float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 5; i++) {
        value += amplitude * noise(p);
        p *= 2.0;
        amplitude *= 0.5;
    }
    return value;
}

float fbm3D(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;
    
    for (int i = 0; i < 6; i++) {
        value += amplitude * noise3D(p * frequency);
        amplitude *= 0.5;
        frequency *= 2.0;
    }
    
    return value;
}

float turbulence(vec3 p) {
    return abs(fbm3D(p));
}

vec2 domainWarp(vec2 p, float time) {
    return p + vec2(
        fbm(p + vec2(time * 0.1, 0.0)),
        fbm(p + vec2(0.0, time * 0.1))
    ) * 0.1;
} 