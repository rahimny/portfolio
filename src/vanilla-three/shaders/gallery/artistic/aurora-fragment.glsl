uniform float uTime;
uniform vec2 uResolution;
uniform vec2 uMouse;
uniform float uIntensity;
uniform float uSpeed;
uniform float uWaveHeight;

varying vec2 vUv;

#include ../../utils/noise.glsl;

void main() {
    // Properly handle aspect ratio like Julia set shader
    vec2 uv = (vUv - 0.5) * 2.0;
    uv.x *= uResolution.x / uResolution.y;
    
    // Scale back to [0,1] range for aurora calculations
    vec2 normalizedUv = (uv + 1.0) * 0.5;
    vec2 st = normalizedUv * vec2(3.0, 1.0);
    
    float time = uTime * uSpeed;
    
    float wave1 = sin(st.x * 2.0 + time) * uWaveHeight;
    float wave2 = sin(st.x * 3.0 + time * 0.8) * uWaveHeight * 0.7;
    float wave3 = sin(st.x * 5.0 + time * 1.2) * uWaveHeight * 0.5;
    
    float baseWave = wave1 + wave2 + wave3;
    
    float noise1 = snoise(st + time * 0.1) * 0.3;
    float noise2 = snoise(st * 2.0 + time * 0.15) * 0.2;
    
    float auroraShape = baseWave + noise1 + noise2;
    
    float distFromCenter = abs(normalizedUv.y - 0.5 - auroraShape);
    
    float aurora = smoothstep(0.3, 0.1, distFromCenter);
    aurora += smoothstep(0.4, 0.2, distFromCenter) * 0.5;
    aurora += smoothstep(0.5, 0.3, distFromCenter) * 0.3;
    
    aurora *= (1.0 + snoise(st * 4.0 + time * 0.2) * 0.3);
    
    vec3 color1 = vec3(0.0, 1.0, 0.4);
    vec3 color2 = vec3(0.0, 0.8, 1.0);
    vec3 color3 = vec3(0.6, 0.2, 1.0);
    vec3 color4 = vec3(1.0, 0.3, 0.8);
    
    float colorMix = sin(st.x * 2.0 + time * 0.5) * 0.5 + 0.5;
    vec3 finalColor = mix(color1, color2, colorMix);
    finalColor = mix(finalColor, color3, sin(time * 0.3) * 0.5 + 0.5);
    finalColor = mix(finalColor, color4, aurora * 0.3);
    
    finalColor *= aurora * uIntensity;

    float glow = exp(-distFromCenter * 2.0) * 0.15;
    finalColor += vec3(0.15, 0.4, 0.7) * glow;
    
    vec3 ambientLight = vec3(0.05, 0.08, 0.12);
    finalColor += ambientLight;
    
    gl_FragColor = vec4(finalColor, 1.0);
} 