import * as THREE from 'three';
import type { PulseField } from '@/features/filament/pulses';
const vertex = /* glsl */ `
  attribute vec2 aStart;
  attribute vec2 aEnd;
  attribute vec4 aDistanceStart;
  attribute vec4 aDistanceEnd;
  varying vec4 vStartDistance;
  varying vec4 vEndDistance;
  varying float vAlong;
  varying float vLength;
  varying float vAcross;
  void main(){
    vec2 delta=(aEnd-aStart)*vec2(1.0,-1.0);
    float length=max(length(delta),.001);
    vec2 n=vec2(-delta.y,delta.x)/length;
    vec2 p=mix(aStart,aEnd,position.x)/512.0-1.0;
    p.y=-p.y;
    gl_Position=vec4(p+n*position.y*1.25/512.0,0.0,1.0);
    vAlong=position.x;vLength=length;vAcross=position.y;
    vStartDistance=aDistanceStart;vEndDistance=aDistanceEnd;
  }
`;
const fragment = /* glsl */ `
  uniform vec4 uFronts;
  uniform vec4 uGains;
  uniform float uForce;
  varying vec4 vStartDistance;
  varying vec4 vEndDistance;
  varying float vAlong;
  varying float vLength;
  varying float vAcross;
  void main(){
    // A front can enter an edge from either end; the two fronts meet inside it.
    vec4 distance=min(vStartDistance+vAlong*vLength,vEndDistance+(1.0-vAlong)*vLength);
    vec4 behind=uFronts-distance;
    float attack=4.0+uForce*8.0;
    float wake=24.0+uForce*70.0;
    vec4 leading=min(behind,0.0)/attack;
    vec4 trailing=max(behind,0.0)/wake;
    vec4 pulse=exp(-leading*leading-trailing-distance/1800.0)*uGains;
    float light=dot(pulse,vec4(1.0))*(0.65+uForce*1.5);
    float fibre=exp(-vAcross*vAcross*30.0)+exp(-vAcross*vAcross*4.0)*0.18;
    gl_FragColor=vec4(vec3(light*fibre),1.0);
  }
`;

/** Four scalar wave clocks replace frame-by-frame particle routing. */
export class PulseRenderer {
  readonly target = new THREE.WebGLRenderTarget(1024, 1024, {
    depthBuffer: false,
    stencilBuffer: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
  });
  readonly edgeCount: number;
  private scene = new THREE.Scene();
  private camera = new THREE.Camera();
  private geometry = new THREE.InstancedBufferGeometry();
  private material: THREE.ShaderMaterial;
  private origins: Float32Array;
  private births = [0, -1.35, -2.7, -4.05];
  private nextSource = 0;
  emissions = 0;
  private uniforms = {
    uFronts: { value: new THREE.Vector4() },
    uGains: { value: new THREE.Vector4() },
    uForce: { value: 0.85 },
  };
  constructor(field: PulseField) {
    this.origins = field.origins;
    this.edgeCount = field.edges.length / 2;
    const attributes = new Float32Array(this.edgeCount * 12);
    for (let i = 0; i < this.edgeCount; i++) {
      const a = field.edges[i * 2],
        b = field.edges[i * 2 + 1],
        offset = i * 12;
      attributes[offset] = field.positions[a * 2];
      attributes[offset + 1] = field.positions[a * 2 + 1];
      attributes[offset + 2] = field.positions[b * 2];
      attributes[offset + 3] = field.positions[b * 2 + 1];
      for (let j = 0; j < 4; j++) {
        attributes[offset + 4 + j] = field.distances[a * 4 + j];
        attributes[offset + 8 + j] = field.distances[b * 4 + j];
      }
    }
    this.geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [0, -1, 0, 1, -1, 0, 0, 1, 0, 1, 1, 0],
        3
      )
    );
    this.geometry.setIndex([0, 1, 2, 2, 1, 3]);
    const buffer = new THREE.InstancedInterleavedBuffer(attributes, 12);
    for (const [name, size, offset] of [
      ['aStart', 2, 0],
      ['aEnd', 2, 2],
      ['aDistanceStart', 4, 4],
      ['aDistanceEnd', 4, 8],
    ] as const)
      this.geometry.setAttribute(
        name,
        new THREE.InterleavedBufferAttribute(buffer, size, offset)
      );
    this.geometry.instanceCount = this.edgeCount;
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(this.geometry, this.material);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    this.target.texture.colorSpace = THREE.NoColorSpace;
  }
  render(renderer: THREE.WebGLRenderer, time: number, force: number) {
    for (let i = 0; i < 4; i++) {
      const age = (((time - this.births[i]) % 5.4) + 5.4) % 5.4;
      this.uniforms.uFronts.value.setComponent(i, age * 760);
      this.uniforms.uGains.value.setComponent(
        i,
        Math.exp(-age * 0.14) * (1 - THREE.MathUtils.smoothstep(age, 4.5, 5.4))
      );
    }
    this.uniforms.uForce.value = force;
    const target = renderer.getRenderTarget(),
      clear = renderer.getClearColor(new THREE.Color()),
      alpha = renderer.getClearAlpha();
    renderer.setRenderTarget(this.target);
    renderer.setClearColor(0, 0);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(target);
    renderer.setClearColor(clear, alpha);
  }
  emit(time: number, x?: number, y?: number) {
    let source = this.nextSource++ % 4;
    if (x !== undefined && y !== undefined) {
      let best = Infinity;
      for (let i = 0; i < 4; i++) {
        const d =
          (this.origins[i * 2] - x) ** 2 + (this.origins[i * 2 + 1] - y) ** 2;
        if (d < best) {
          best = d;
          source = i;
        }
      }
    }
    this.births[source] = time;
    this.emissions++;
  }
  reset() {
    this.births = [0, -1.35, -2.7, -4.05];
    this.nextSource = 0;
    this.emissions = 0;
  }
  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this.target.dispose();
    this.scene.clear();
  }
}
