uniform float uTime;
uniform vec2 uResolution;
uniform vec2 uMouse;
uniform float uZoom;
uniform vec2 uCenter;
uniform float uMaxIterations;
uniform float uColorIntensity;

varying vec2 vUv;

#include ../../utils/math.glsl;

void main() {
    vec2 uv = (vUv - 0.5) * 2.0;
    uv.x *= uResolution.x / uResolution.y;
    
    vec2 z = uv / uZoom + vec2(uCenter.x, uCenter.y);
    
    vec2 c = z;
    vec2 zn = vec2(0.0);
    
    float iterations = 0.0;
    
    for(float i = 0.0; i < 100.0; i++) {
        if(i >= uMaxIterations) break;
        
        float x = (zn.x * zn.x - zn.y * zn.y) + c.x;
        float y = (zn.y * zn.x + zn.x * zn.y) + c.y;
        
        if((x * x + y * y) > 4.0) break;
        
        zn.x = x;
        zn.y = y;
        
        iterations += 1.0;
    }
    
    if(iterations >= uMaxIterations) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    } else {
        float smoothIter = iterations + 1.0 - log(log(length(zn)))/log(2.0);
        
        float hue = fract(smoothIter * 0.05 + uTime * 0.1);
        float sat = 0.8;
        float val = smoothIter < uMaxIterations ? uColorIntensity : 0.0;
        
        vec3 color = hsv2rgb(vec3(hue, sat, val));
        gl_FragColor = vec4(color, 1.0);
    }
} 