uniform float uTime;
uniform vec2 uResolution;
uniform vec2 uMouse;
uniform float uBlobCount;
uniform float uBlobSize;
uniform float uFlowSpeed;

varying vec2 vUv;

#include ../../utils/fbm.glsl;
#include ../../utils/math.glsl;

void main() {
    vec2 uv = vUv;
    vec2 p = uv - 0.5;
    
    float time = uTime * uFlowSpeed;
    
    float metaball = 0.0;
    
    for (int i = 0; i < 8; i++) {
        if (float(i) >= uBlobCount) break;
        
        float fi = float(i);
        
        float angle = time * 0.3 + fi * (PI / 4.0);
        float radius = 0.15 + sin(time * 0.2 + fi) * 0.1;
        
        vec2 center = vec2(
            cos(angle) * radius + sin(time * 0.15 + fi * 2.1) * 0.1,
            sin(angle) * radius + cos(time * 0.12 + fi * 1.7) * 0.1
        );
        
        center.x += fbm(vec2(fi * 10.0, time * 0.1)) * 0.05;
        center.y += fbm(vec2(fi * 15.0 + 100.0, time * 0.1)) * 0.05;
        
        float blobRadius = uBlobSize * (0.8 + sin(time * 0.4 + fi * 2.0) * 0.3);
        
        float dist = length(p - center);
        
        float contribution = blobRadius / (dist * dist + 0.01);
        metaball += contribution;
    }
    
    float threshold = 1.0;
    float surface = smoothstep(threshold - 0.1, threshold + 0.1, metaball);
    
    vec3 color1 = vec3(1.0, 0.1, 0.0);
    vec3 color2 = vec3(1.0, 0.4, 0.0);
    vec3 color3 = vec3(1.0, 0.8, 0.0);
    vec3 color4 = vec3(1.0, 0.9, 0.4);
    
    vec3 lavaColor;
    if (metaball > threshold * 2.0) {
        lavaColor = mix(color3, color4, (metaball - threshold * 2.0) / threshold);
    } else if (metaball > threshold * 1.5) {
        lavaColor = mix(color2, color3, (metaball - threshold * 1.5) / (threshold * 0.5));
    } else {
        lavaColor = mix(color1, color2, metaball / (threshold * 1.5));
    }
    
    vec2 distortion = vec2(
        fbm(uv * 8.0 + time * 0.5) * 0.02,
        fbm(uv * 6.0 + time * 0.3) * 0.02
    );
    
    vec2 distortedP = p + distortion * surface;
    float distortedMetaball = 0.0;
    
    for (int i = 0; i < 8; i++) {
        if (float(i) >= uBlobCount) break;
        
        float fi = float(i);
        float angle = time * 0.3 + fi * (PI / 4.0);
        float radius = 0.15 + sin(time * 0.2 + fi) * 0.1;
        
        vec2 center = vec2(
            cos(angle) * radius + sin(time * 0.15 + fi * 2.1) * 0.1,
            sin(angle) * radius + cos(time * 0.12 + fi * 1.7) * 0.1
        );
        
        center.x += fbm(vec2(fi * 10.0, time * 0.1)) * 0.05;
        center.y += fbm(vec2(fi * 15.0 + 100.0, time * 0.1)) * 0.05;
        
        float blobRadius = uBlobSize * (0.8 + sin(time * 0.4 + fi * 2.0) * 0.3);
        float dist = length(distortedP - center);
        float contribution = blobRadius / (dist * dist + 0.01);
        distortedMetaball += contribution;
    }
    
    surface = smoothstep(threshold - 0.1, threshold + 0.1, distortedMetaball);
    
    vec3 bgColor = mix(vec3(0.1, 0.05, 0.2), vec3(0.2, 0.1, 0.3), uv.y);
    
    vec3 finalColor = mix(bgColor, lavaColor, surface);
    
    float rim = 1.0 - surface;
    rim = pow(rim, 3.0);
    finalColor += rim * vec3(1.0, 0.6, 0.2) * 0.3;
    
    float highlight = step(threshold * 3.0, distortedMetaball);
    finalColor += highlight * vec3(1.0, 1.0, 0.8) * 0.4;
    
    gl_FragColor = vec4(finalColor, 1.0);
} 