uniform float uTime;
varying vec2 vUv;
varying vec3 vPosition;

void main() {
    // Create a wave effect
    float wave = sin(vPosition.x * 2.0 + uTime) * 0.5 + 0.5;
    
    // Mix colors based on position and time
    vec3 color1 = vec3(0.0, 1.0, 0.0); // Green
    vec3 color2 = vec3(0.0, 0.5, 1.0); // Blue
    
    vec3 finalColor = mix(color1, color2, wave);
    
    gl_FragColor = vec4(finalColor, 1.0);
} 