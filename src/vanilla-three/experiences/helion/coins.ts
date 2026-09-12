import * as THREE from 'three';

const COUNT = 40;
const LIFETIME = 1.45;
/** Shared bevelled metal geometry, impulse-driven spin and bounded raster glints. */
export class CoinPops {
  readonly mesh: THREE.InstancedMesh;
  readonly glints: THREE.InstancedMesh;
  private cursor = 0;
  private dummy = new THREE.Object3D();
  private spinStep = new THREE.Quaternion();
  private axis = new THREE.Vector3();
  private cameraRotation = new THREE.Quaternion();
  private light = new THREE.Vector3();
  private half = new THREE.Vector3();
  private face = new THREE.Vector3();
  private coins = Array.from({ length: COUNT }, () => ({
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    orientation: new THREE.Quaternion(),
    angular: new THREE.Vector3(),
    gravity: new THREE.Vector3(0, -6.8, 0),
    life: 0,
  }));
  constructor() {
    // Recessed central faces, annular rims, bevels and a thick outer edge.
    const profile = [
      [0, -0.024],
      [0.132, -0.024],
      [0.142, -0.035],
      [0.163, -0.035],
      [0.175, -0.022],
      [0.175, 0.022],
      [0.163, 0.035],
      [0.142, 0.035],
      [0.132, 0.024],
      [0, 0.024],
    ].map(([radius, height]) => new THREE.Vector2(radius, height));
    this.mesh = new THREE.InstancedMesh(
      new THREE.LatheGeometry(profile, 40),
      new THREE.ShaderMaterial({
        vertexShader: /* glsl */ `
          varying vec2 vDisc;
          varying vec3 vNormal,vView,vTangent,vBitangent;
          varying float vFace;
          void main(){
            vDisc=position.xz/.175;
            vFace=1.0-step(.0005,abs(abs(position.y)-.024));
            mat3 basis=normalMatrix*mat3(instanceMatrix);
            vNormal=normalize(basis*normal);
            vTangent=normalize(basis*vec3(1,0,0));
            vBitangent=normalize(basis*vec3(0,0,1));
            vec4 view=modelViewMatrix*instanceMatrix*vec4(position,1.0);
            vView=-view.xyz;
            gl_Position=projectionMatrix*view;
          }
        `,
        fragmentShader: /* glsl */ `
          varying vec2 vDisc;
          varying vec3 vNormal,vView,vTangent,vBitangent;
          varying float vFace;
          float slot(vec2 p){
            vec2 q=abs(p)-vec2(.12,.49);
            return length(max(q,0.0))+min(max(q.x,q.y),0.0)-.065;
          }
          float relief(vec2 p){return smoothstep(-.015,.025,slot(p));}
          void main(){
            vec3 n=normalize(vNormal),view=normalize(vView);
            float face=smoothstep(.75,.95,vFace);
            vec2 gradient=vec2(relief(vDisc+vec2(.012,0))-relief(vDisc-vec2(.012,0)),
              relief(vDisc+vec2(0,.012))-relief(vDisc-vec2(0,.012)));
            n=normalize(n-(vTangent*gradient.x+vBitangent*gradient.y)*face*.95);
            vec3 reflection=reflect(-view,n);
            // Analytic studio cards: highlights move with the actual coin normal.
            float strip=pow(max(0.0,dot(reflection,normalize(vec3(-.5,.75,1.0)))),46.0);
            float broad=pow(max(0.0,dot(reflection,normalize(vec3(.7,.4,.9)))),7.0);
            float edge=pow(max(0.0,dot(reflection,normalize(vec3(-.8,-.15,.5)))),90.0);
            float fresnel=pow(1.0-max(0.0,dot(n,view)),4.0);
            float diffuse=.35+.65*max(0.0,dot(n,normalize(vec3(-.4,.8,1.0))));
            vec3 gold=vec3(.83,.48,.008)*diffuse;
            gold+=vec3(1.0,.79,.035)*broad*.4;
            gold+=vec3(1.0,.94,.56)*(strip*3.7+edge*2.4);
            gold+=vec3(.7,.45,.025)*fresnel*.45;
            float cavity=1.0-smoothstep(-.04,.0,slot(vDisc));
            gold*=1.0-cavity*face*.62;
            gl_FragColor=vec4(gold,1.0);
          }
        `,
      }),
      COUNT
    );
    this.glints = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.ShaderMaterial({
        vertexShader: /* glsl */ `varying vec2 vUv;
        void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0);}`,
        fragmentShader: /* glsl */ `varying vec2 vUv;
        void main(){
          vec2 p=abs((floor(vUv*15.0)+.5)/15.0-.5)*2.0;
          float cross=max(step(p.x,.09)*step(p.y,.9),step(p.y,.09)*step(p.x,.9));
          float diamond=step(p.x+p.y,.43);
          float shape=max(cross,diamond);
          gl_FragColor=vec4(vec3(2.8,2.3,1.1),shape*.85);
        }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
      COUNT
    );
    this.glints.renderOrder = 4;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.glints.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = this.glints.frustumCulled = false;
    this.update(0);
  }
  emit(
    origin: THREE.Vector3,
    camera: THREE.Camera,
    count: number,
    power = 1
  ): void {
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const toward = new THREE.Vector3(0, 0, 1).applyQuaternion(
      camera.quaternion
    );
    const base = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(1, 0, 0),
      Math.PI * 0.5
    );
    const normal = origin.clone().normalize();
    for (let i = 0; i < count; i++) {
      const coin = this.coins[this.cursor++ % COUNT];
      const spread = (i - (count - 1) * 0.5) / Math.max(1, count - 1);
      coin.position.copy(origin).addScaledVector(toward, 0.25);
      coin.velocity
        .copy(up)
        .multiplyScalar(2.7 + power * 0.8 + (i % 3) * 0.25)
        .addScaledVector(right, spread * 3)
        .addScaledVector(normal, 0.4 + power * 0.35);
      coin.gravity.copy(up).multiplyScalar(-6.1);
      coin.orientation.copy(camera.quaternion).multiply(base);
      // Torque around the camera's up axis flips the face edge-on. Small
      // transverse torque produces precession instead of a flat in-plane spin.
      coin.angular
        .copy(up)
        .multiplyScalar((10 + power * 4 + i * 0.45) * (i % 2 ? 1 : -1))
        .addScaledVector(right, spread * 3.5)
        .addScaledVector(toward, spread * 1.2);
      coin.life = LIFETIME;
    }
  }
  clear(): void {
    for (const coin of this.coins) coin.life = 0;
  }
  update(dt: number, camera?: THREE.Camera): void {
    if (camera) this.cameraRotation.copy(camera.quaternion);
    this.light
      .set(-0.5, 0.75, 1)
      .normalize()
      .applyQuaternion(this.cameraRotation);
    let active = 0;
    for (let i = 0; i < COUNT; i++) {
      const coin = this.coins[i];
      coin.life = Math.max(0, coin.life - dt);
      const age = LIFETIME - coin.life;
      if (coin.life > 0) {
        active++;
        coin.velocity.addScaledVector(coin.gravity, dt);
        coin.position.addScaledVector(coin.velocity, dt);
        coin.angular.multiplyScalar(Math.exp(-dt * 0.55));
        const speed = coin.angular.length();
        this.axis.copy(coin.angular).divideScalar(Math.max(0.001, speed));
        this.spinStep.setFromAxisAngle(this.axis, speed * dt);
        coin.orientation.premultiply(this.spinStep).normalize();
      }
      const scale =
        coin.life > 0 ? Math.min(1, age * 22) * Math.min(1, coin.life * 5) : 0;
      this.dummy.position.copy(coin.position);
      this.dummy.quaternion.copy(coin.orientation);
      this.dummy.scale.setScalar(scale);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      this.axis.set(0.125, 0.04, 0.04).applyQuaternion(coin.orientation);
      this.dummy.position.add(this.axis);
      this.dummy.quaternion.copy(this.cameraRotation);
      this.face.set(0, 1, 0).applyQuaternion(coin.orientation);
      this.half
        .copy(camera?.position ?? this.light)
        .sub(coin.position)
        .normalize()
        .add(this.light)
        .normalize();
      const glint = Math.pow(Math.abs(this.face.dot(this.half)), 32);
      this.dummy.scale.setScalar(scale * glint * 0.34);
      this.dummy.updateMatrix();
      this.glints.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.visible = this.glints.visible = active > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.glints.instanceMatrix.needsUpdate = true;
  }
}
