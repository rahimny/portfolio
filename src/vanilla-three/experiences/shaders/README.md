# Shader Gallery

## Adding a New Shader

### Step 1: Create your shader files

Put your fragment shader in the appropriate category folder:

```
src/vanilla-three/shaders/gallery/
├── [category]/
│   └── your-shader-fragment.glsl
```

### Step 2: Add it to the definitions

Open up `src/vanilla-three/experiences/shaders/shader-definitions.ts` and add your shader:

```typescript
'your-shader-id': {
  id: 'your-shader-id',
  name: 'Your Shader Name',
  description: 'Brief description of what it does',
  category: 'noise' | 'fractal' | 'effect' | 'artistic' | 'geometric',
  vertexShader: baseVertexShader,
  fragmentShader: yourShaderFragment,
  geometry: 'plane', // or 'sphere', 'cube', 'torus'
  uniforms: {
    uCustomParam: { value: 1.0 },
    uColor: { value: [1.0, 0.0, 0.5] },
  },
},
```

### Step 3: Done

The system will automatically:

- Create a route at `/experiments/shader-gallery/your-shader-id`
- Generate Leva controls for your uniforms
- Use a template image based on your category

## Basic Shader Template

```glsl
// your-shader-fragment.glsl
uniform float uTime;
uniform vec2 uResolution;
uniform vec2 uMouse;
uniform float uCustomParam;
uniform vec3 uColor;

varying vec2 vUv;

void main() {
    vec2 uv = vUv;

    // Your shader code goes here
    vec3 color = uColor * sin(uv.x * 10.0 + uTime * uCustomParam);

    gl_FragColor = vec4(color, 1.0);
}
```

## Controls

The system automatically generates controls based on your uniform types:

- `float` values get sliders (range is roughly value*0.1 to value*3)
- `vec2` values get two sliders for X and Y components
- More types can be added as needed

## Categories and Colors

Each category gets its own color scheme for the template images:

- `noise` - Blue gradients
- `fractal` - Purple gradients
- `effect` - Green gradients
- `artistic` - Orange gradients
- `geometric` - Indigo gradients
