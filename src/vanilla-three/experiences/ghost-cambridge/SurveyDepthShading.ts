import * as THREE from 'three';

const fragmentShader = /* glsl */ `
uniform sampler2D uColour, uDepth;
uniform vec2 uTexel;
uniform float uNear, uFar, uRadius, uStrength;
varying vec2 vUv;

float eyeDepth(float depth) {
  return uNear * uFar / max(uFar - depth * (uFar - uNear), 0.00001);
}

void main() {
  vec4 colour = texture2D(uColour, vUv);
  float depth = texture2D(uDepth, vUv).r;
  float response = 0.0;
  if (depth < 1.0) {
    float centre = log2(eyeDepth(depth));
    for (int i = 0; i < 8; i++) {
      float angle = float(i) * 0.78539816339;
      vec2 uv = vUv + vec2(cos(angle), sin(angle)) * uTexel * uRadius;
      if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) continue;
      float neighbour = texture2D(uDepth, uv).r;
      // Empty pixels must not cast a halo around every isolated return.
      if (neighbour >= 1.0) continue;
      float difference = max(0.0, centre - log2(eyeDepth(neighbour)) - 0.001);
      response += min(difference, 0.15);
    }
  }
  float shade = max(0.48, exp(-uStrength * 12.0 * response / 8.0));
  gl_FragColor = vec4(colour.rgb * shade, 1.0);
  // Keep the survey's visibility for the transparent section plane drawn next.
  gl_FragDepth = depth;
  #include <colorspace_fragment>
}
`;

/** One bounded colour/depth target; context is composited after survey shading. */
export class SurveyDepthShading {
  private target = new THREE.WebGLRenderTarget(1, 1, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    type: THREE.HalfFloatType,
    depthTexture: new THREE.DepthTexture(1, 1, THREE.UnsignedIntType),
    samples: 2,
  });
  private material = new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader,
    uniforms: {
      uColour: { value: this.target.texture },
      uDepth: { value: this.target.depthTexture },
      uTexel: { value: new THREE.Vector2(1, 1) },
      uNear: { value: 0.02 },
      uFar: { value: 160 },
      uRadius: { value: 2 },
      uStrength: { value: 1 },
    },
    depthFunc: THREE.AlwaysDepth,
    toneMapped: false,
  });
  private scene = new THREE.Scene();
  private camera = new THREE.Camera();
  private geometry = new THREE.PlaneGeometry(2, 2);
  private disposed = false;
  private renderer: THREE.WebGLRenderer;
  available = true;

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    // Preserve dark linear colours; RGBA8 quantises the near-black survey ground.
    this.available = renderer.extensions.has('EXT_color_buffer_float');
    this.target.samples = Math.min(2, renderer.capabilities.maxSamples);
    this.scene.add(new THREE.Mesh(this.geometry, this.material));
  }

  resize(width: number, height: number, pixelRatio: number) {
    if (
      this.disposed ||
      !this.available ||
      !Number.isFinite(width + height) ||
      width < 1 ||
      height < 1
    )
      return;
    this.target.setSize(width, height);
    this.material.uniforms.uTexel.value.set(1 / width, 1 / height);
    this.material.uniforms.uRadius.value = 2 * pixelRatio;
    const previous = this.renderer.getRenderTarget();
    const gl = this.renderer.getContext();
    try {
      this.renderer.setRenderTarget(this.target);
      if (
        gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE
      ) {
        // Some devices cannot resolve a multisampled depth texture.
        this.target.dispose();
        this.target.samples = 0;
        this.renderer.setRenderTarget(null);
        this.renderer.setRenderTarget(this.target);
        this.available =
          gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      }
    } catch {
      this.available = false;
    } finally {
      this.renderer.setRenderTarget(previous);
      if (!this.available) this.target.dispose();
    }
  }

  render(
    survey: THREE.Scene,
    context: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    strength: number
  ) {
    if (this.disposed) return;
    const renderer = this.renderer;
    const autoClear = renderer.autoClear;
    try {
      renderer.autoClear = true;
      // Keep identical sampling for the plain/shaded comparison, including map view.
      if (this.available) {
        this.material.uniforms.uNear.value = camera.near;
        this.material.uniforms.uFar.value = camera.far;
        this.material.uniforms.uStrength.value = strength;
        renderer.setRenderTarget(this.target);
        renderer.render(survey, camera);
        renderer.setRenderTarget(null);
        renderer.render(this.scene, this.camera);
      } else {
        renderer.setRenderTarget(null);
        renderer.render(survey, camera);
      }
      renderer.autoClear = false;
      renderer.render(context, camera);
    } finally {
      renderer.setRenderTarget(null);
      renderer.autoClear = autoClear;
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.target.dispose();
    this.material.dispose();
    this.geometry.dispose();
    this.scene.clear();
  }
}
