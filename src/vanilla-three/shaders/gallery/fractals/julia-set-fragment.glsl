uniform float uTime;
uniform vec2 uResolution;
uniform vec2 uMouse;
uniform vec2 uC;
uniform float uZoom;
uniform float uMaxIterations;

varying vec2 vUv;

#include ../../utils/math.glsl;

void main() {
    vec2 uv = (vUv - 0.5) * 2.0;
    uv.x *= uResolution.x / uResolution.y;
    
    vec2 z = uv / uZoom;
    
    vec2 c = uC + vec2(cos(uTime * 0.5) * 0.1, sin(uTime * 0.3) * 0.1);
    
    float iterations = 0.0;
    
    for(float i = 0.0; i < 80.0; i++) {
        if(i >= uMaxIterations) break;
        
        float x = (z.x * z.x - z.y * z.y) + c.x;
        float y = (z.y * z.x + z.x * z.y) + c.y;
        
        if((x * x + y * y) > 4.0) break;
        
        z.x = x;
        z.y = y;
        
        iterations += 1.0;
    }
    
    if(iterations >= uMaxIterations) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    } else {
        float smoothIter = iterations + 1.0 - log(log(length(z)))/log(2.0);
        
        float hue = fract(smoothIter * 0.08 + uTime * 0.2);
        float sat = 0.9;
        float val = smoothIter < uMaxIterations ? 0.8 : 0.0;
        
        vec3 color = hsv2rgb(vec3(hue, sat, val));
        gl_FragColor = vec4(color, 1.0);
    }
} 