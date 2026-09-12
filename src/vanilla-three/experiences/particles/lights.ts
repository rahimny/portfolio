import * as THREE from 'three/webgpu';
import { conf } from './constants';

export class Lights {
  public object: THREE.Object3D;

  dispose(): void {
    this.object.traverse((object) => {
      if (object instanceof THREE.Light) object.dispose();
    });
    this.object.clear();
  }

  constructor() {
    this.object = new THREE.Object3D();
    const spotLight = new THREE.SpotLight(
      0xffd28c,
      conf.light.intensity,
      25,
      conf.light.angle,
      conf.light.penumbra,
      2
    );
    const lightTarget = new THREE.Object3D();
    const [lx, ly, lz] = conf.light.position;
    const [tx, ty, tz] = conf.light.target;
    spotLight.position.set(lx, ly, lz);
    lightTarget.position.set(tx, ty, tz);
    spotLight.target = lightTarget;
    spotLight.castShadow = true;

    spotLight.shadow.camera.near = 500;
    spotLight.shadow.camera.far = 4000;
    spotLight.shadow.camera.fov = 30;

    this.object.add(spotLight);
    this.object.add(lightTarget);
  }
}
