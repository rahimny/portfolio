// Adapted from Flow's MLS-MPM solver, based on WebGPU-Ocean.
// See THIRD_PARTY_NOTICES.md and public/third-party/ for the MIT notices.
import * as THREE from 'three/webgpu';
import {
  array,
  Fn,
  If,
  instancedArray,
  instanceIndex,
  Return,
  uniform,
  int,
  float,
  vec3,
  vec4,
  atomicAdd,
  uint,
  max,
  pow,
  mat3,
  clamp,
  time,
  cross,
  mix,
  ivec3,
  mx_noise_vec3,
} from 'three/tsl';
import { StructuredArray } from './StructuredArray';
import { hsvtorgb } from '../../../tsl/hsvToRgb';
import { conf } from '../constants';
import { neighbourLoop, arrayElement } from './tslCompatibility';

export const particleStruct = {
  position: { type: 'vec3' },
  density: { type: 'float' },
  velocity: { type: 'vec3' },
  mass: { type: 'float' },
  C: { type: 'mat3' },
  direction: { type: 'vec3' },
  color: { type: 'vec3' },
} as const;

const cellStruct = {
  x: { type: 'int', atomic: true },
  y: { type: 'int', atomic: true },
  z: { type: 'int', atomic: true },
  mass: { type: 'int', atomic: true },
} as const;

export class Simulation {
  private renderer: THREE.WebGPURenderer;
  public numParticles = 0;
  private gridSize = new THREE.Vector3(0, 0, 0);
  private gridCellSize = new THREE.Vector3(0, 0, 0);
  private uniforms = {
    gravityType: uniform(0, 'uint'),
    gravity: uniform(new THREE.Vector3()),
    stiffness: uniform(0),
    restDensity: uniform(0),
    dynamicViscosity: uniform(0),
    noise: uniform(0),

    gridSize: uniform(new THREE.Vector3(), 'ivec3'),
    gridCellSize: uniform(new THREE.Vector3()),
    dt: uniform(0.1),
    numParticles: uniform(0, 'uint'),

    mouseRayDirection: uniform(new THREE.Vector3()),
    mouseRayOrigin: uniform(new THREE.Vector3()),
    mouseForce: uniform(new THREE.Vector3()),
  };
  private kernels: Record<string, THREE.ComputeNode> = {};
  private fixedPointMultiplier = 1e7;
  private mousePos = new THREE.Vector3();
  private mousePosArray: THREE.Vector3[] = [];
  public particleBuffer!: StructuredArray<typeof particleStruct>;
  private cellBuffer!: StructuredArray<typeof cellStruct>;
  private cellBufferF!: THREE.StorageBufferNode<'vec4'>;

  constructor(renderer: THREE.WebGPURenderer) {
    this.renderer = renderer;
  }
  async init() {
    const { maxParticles } = conf.particles;
    this.gridSize.set(64, 64, 64);

    this.particleBuffer = new StructuredArray(
      particleStruct,
      maxParticles,
      'particleData'
    );

    const vec = new THREE.Vector3();
    for (let i = 0; i < maxParticles; i++) {
      let dist = 2;
      while (dist > 1) {
        vec
          .set(Math.random(), Math.random(), Math.random())
          .multiplyScalar(2.0)
          .subScalar(1.0);
        dist = vec.length();
        vec
          .multiplyScalar(0.8)
          .addScalar(1.0)
          .divideScalar(2.0)
          .multiply(this.gridSize);
      }
      const mass = 1.0 - Math.random() * 0.002;
      this.particleBuffer.set(i, 'position', vec);
      this.particleBuffer.set(i, 'mass', mass);
    }

    const cellCount = this.gridSize.x * this.gridSize.y * this.gridSize.z;
    this.cellBuffer = new StructuredArray(cellStruct, cellCount, 'cellData');
    this.cellBufferF = instancedArray(cellCount, 'vec4').label('cellDataF');

    this.uniforms.gridSize.value.copy(this.gridSize);
    this.uniforms.gridCellSize.value.copy(this.gridCellSize);

    this.kernels.clearGrid = Fn(() => {
      this.cellBuffer.setAtomic('x', false);
      this.cellBuffer.setAtomic('y', false);
      this.cellBuffer.setAtomic('z', false);
      this.cellBuffer.setAtomic('mass', false);

      If(instanceIndex.greaterThanEqual(uint(cellCount)), () => {
        Return();
      });

      this.cellBuffer.element(instanceIndex).get('x').assign(0);
      this.cellBuffer.element(instanceIndex).get('y').assign(0);
      this.cellBuffer.element(instanceIndex).get('z').assign(0);
      this.cellBuffer.element(instanceIndex).get('mass').assign(0);
      this.cellBufferF.element(instanceIndex).assign(0);
    })().compute(cellCount);

    const encodeFixedPoint = (f32: THREE.Node<'float'>) => {
      return int(f32.mul(this.fixedPointMultiplier));
    };
    const decodeFixedPoint = (i32: THREE.Node<'int'>) => {
      return float(i32).div(this.fixedPointMultiplier);
    };

    const getCellPtr = (ipos: THREE.Node<'ivec3'>) => {
      const gridSize = this.uniforms.gridSize;
      const cellPtr = int(ipos.x)
        .mul(gridSize.y)
        .mul(gridSize.z)
        .add(int(ipos.y).mul(gridSize.z))
        .add(int(ipos.z))
        .toConst();
      return cellPtr;
    };
    const getCell = (ipos: THREE.Node<'ivec3'>) => {
      return this.cellBuffer.element(getCellPtr(ipos));
    };

    this.kernels.p2g1 = Fn(() => {
      this.cellBuffer.setAtomic('x', true);
      this.cellBuffer.setAtomic('y', true);
      this.cellBuffer.setAtomic('z', true);
      this.cellBuffer.setAtomic('mass', true);

      If(
        instanceIndex.greaterThanEqual(uint(this.uniforms.numParticles)),
        () => {
          Return();
        }
      );
      const particlePosition = this.particleBuffer
        .element(instanceIndex)
        .get('position')
        .xyz.toConst('particlePosition');
      const particleVelocity = this.particleBuffer
        .element(instanceIndex)
        .get('velocity')
        .xyz.toConst('particleVelocity');

      const cellIndex = ivec3(particlePosition).sub(1).toConst('cellIndex');
      const cellDiff = particlePosition.fract().sub(0.5).toConst('cellDiff');
      const w0 = float(0.5)
        .mul(float(0.5).sub(cellDiff))
        .mul(float(0.5).sub(cellDiff));
      const w1 = float(0.75).sub(cellDiff.mul(cellDiff));
      const w2 = float(0.5)
        .mul(float(0.5).add(cellDiff))
        .mul(float(0.5).add(cellDiff));
      const weights = array([vec3(w0), vec3(w1), vec3(w2)]).toConst('weights');

      const C = this.particleBuffer.element(instanceIndex).get('C').toConst();
      neighbourLoop('gx', (gx) => {
        neighbourLoop('gy', (gy) => {
          neighbourLoop('gz', (gz) => {
            const weight = arrayElement(weights, gx)
              .x.mul(arrayElement(weights, gy).y)
              .mul(arrayElement(weights, gz).z);
            const cellX = cellIndex.add(ivec3(gx, gy, gz)).toConst();
            const cellDist = vec3(cellX)
              .add(0.5)
              .sub(particlePosition)
              .toConst('cellDist');
            const Q = C.mul(cellDist);

            const massContrib = weight; // assuming particle mass = 1.0
            const velContrib = massContrib
              .mul(particleVelocity.add(Q))
              .toConst('velContrib');
            const cell = getCell(cellX);
            atomicAdd(cell.get('x'), encodeFixedPoint(velContrib.x));
            atomicAdd(cell.get('y'), encodeFixedPoint(velContrib.y));
            atomicAdd(cell.get('z'), encodeFixedPoint(velContrib.z));
            atomicAdd(cell.get('mass'), encodeFixedPoint(massContrib));
          });
        });
      });
    })().compute(1);

    this.kernels.p2g2 = Fn(() => {
      this.cellBuffer.setAtomic('x', true);
      this.cellBuffer.setAtomic('y', true);
      this.cellBuffer.setAtomic('z', true);
      this.cellBuffer.setAtomic('mass', false);

      If(
        instanceIndex.greaterThanEqual(uint(this.uniforms.numParticles)),
        () => {
          Return();
        }
      );
      const particlePosition = this.particleBuffer
        .element(instanceIndex)
        .get('position')
        .xyz.toConst('particlePosition');

      const cellIndex = ivec3(particlePosition).sub(1).toConst('cellIndex');
      const cellDiff = particlePosition.fract().sub(0.5).toConst('cellDiff');
      const w0 = float(0.5)
        .mul(float(0.5).sub(cellDiff))
        .mul(float(0.5).sub(cellDiff));
      const w1 = float(0.75).sub(cellDiff.mul(cellDiff));
      const w2 = float(0.5)
        .mul(float(0.5).add(cellDiff))
        .mul(float(0.5).add(cellDiff));
      const weights = array([vec3(w0), vec3(w1), vec3(w2)]).toConst('weights');

      const density = float(0).toVar('density');
      neighbourLoop('gx', (gx) => {
        neighbourLoop('gy', (gy) => {
          neighbourLoop('gz', (gz) => {
            const weight = arrayElement(weights, gx)
              .x.mul(arrayElement(weights, gy).y)
              .mul(arrayElement(weights, gz).z);
            const cellX = cellIndex.add(ivec3(gx, gy, gz)).toConst();
            const cell = getCell(cellX);
            density.addAssign(decodeFixedPoint(cell.get('mass')).mul(weight));
          });
        });
      });
      const densityStore = this.particleBuffer
        .element(instanceIndex)
        .get('density');
      densityStore.assign(mix(densityStore, density, 0.05));

      const volume = float(1).div(density);
      const pressure = max(
        0.0,
        pow(density.div(this.uniforms.restDensity), 5.0)
          .sub(1)
          .mul(this.uniforms.stiffness)
      ).toConst('pressure');
      const stress = mat3(
        pressure.negate(),
        0,
        0,
        0,
        pressure.negate(),
        0,
        0,
        0,
        pressure.negate()
      ).toVar('stress');
      const dudv = this.particleBuffer
        .element(instanceIndex)
        .get('C')
        .toConst('C');

      const strain = dudv.add(dudv.transpose());
      stress.addAssign(strain.mul(this.uniforms.dynamicViscosity));
      const eq16Term0 = volume.mul(-4).mul(stress).mul(this.uniforms.dt);

      neighbourLoop('gx', (gx) => {
        neighbourLoop('gy', (gy) => {
          neighbourLoop('gz', (gz) => {
            const weight = arrayElement(weights, gx)
              .x.mul(arrayElement(weights, gy).y)
              .mul(arrayElement(weights, gz).z);
            const cellX = cellIndex.add(ivec3(gx, gy, gz)).toConst();
            const cellDist = vec3(cellX)
              .add(0.5)
              .sub(particlePosition)
              .toConst('cellDist');
            const cell = getCell(cellX);

            const momentum = eq16Term0
              .mul(weight)
              .mul(cellDist)
              .toConst('momentum');
            atomicAdd(cell.get('x'), encodeFixedPoint(momentum.x));
            atomicAdd(cell.get('y'), encodeFixedPoint(momentum.y));
            atomicAdd(cell.get('z'), encodeFixedPoint(momentum.z));
          });
        });
      });
    })().compute(1);

    this.kernels.updateGrid = Fn(() => {
      this.cellBuffer.setAtomic('x', false);
      this.cellBuffer.setAtomic('y', false);
      this.cellBuffer.setAtomic('z', false);
      this.cellBuffer.setAtomic('mass', false);

      If(instanceIndex.greaterThanEqual(uint(cellCount)), () => {
        Return();
      });
      const cell = this.cellBuffer.element(instanceIndex).toConst('cell');

      const mass = decodeFixedPoint(cell.get('mass')).toConst();
      If(mass.lessThanEqual(0), () => {
        Return();
      });

      const vx = decodeFixedPoint(cell.get('x')).div(mass).toVar();
      const vy = decodeFixedPoint(cell.get('y')).div(mass).toVar();
      const vz = decodeFixedPoint(cell.get('z')).div(mass).toVar();

      const x = int(instanceIndex)
        .div(this.uniforms.gridSize.z)
        .div(this.uniforms.gridSize.y);
      const y = int(instanceIndex)
        .div(this.uniforms.gridSize.z)
        .mod(this.uniforms.gridSize.y);
      const z = int(instanceIndex).mod(this.uniforms.gridSize.z);

      If(
        x
          .lessThan(int(2))
          .or(x.greaterThan(this.uniforms.gridSize.x.sub(int(2)))),
        () => {
          vx.assign(0);
        }
      );
      If(
        y
          .lessThan(int(2))
          .or(y.greaterThan(this.uniforms.gridSize.y.sub(int(2)))),
        () => {
          vy.assign(0);
        }
      );
      If(
        z
          .lessThan(int(2))
          .or(z.greaterThan(this.uniforms.gridSize.z.sub(int(2)))),
        () => {
          vz.assign(0);
        }
      );

      this.cellBufferF.element(instanceIndex).assign(vec4(vx, vy, vz, mass));
    })().compute(cellCount);

    this.kernels.g2p = Fn(() => {
      If(
        instanceIndex.greaterThanEqual(uint(this.uniforms.numParticles)),
        () => {
          Return();
        }
      );
      const particleMass = this.particleBuffer
        .element(instanceIndex)
        .get('mass')
        .toConst('particleMass');
      const particleDensity = this.particleBuffer
        .element(instanceIndex)
        .get('density')
        .toConst('particleDensity');
      const particlePosition = this.particleBuffer
        .element(instanceIndex)
        .get('position')
        .xyz.toVar('particlePosition');
      const particleVelocity = vec3(0).toVar();
      If(this.uniforms.gravityType.equal(uint(2)), () => {
        const pn = particlePosition
          .div(vec3(this.uniforms.gridSize.sub(1)))
          .sub(0.5)
          .normalize()
          .toConst();
        particleVelocity.subAssign(pn.mul(0.3).mul(this.uniforms.dt));
      }).Else(() => {
        particleVelocity.addAssign(this.uniforms.gravity.mul(this.uniforms.dt));
      });

      // Three's MaterialX noise provides the signed force field. Drift the
      // domain while preserving the existing force magnitude and timestep.
      const noise = mx_noise_vec3(
        particlePosition.mul(0.06).add(time.mul(0.011))
      )
        .add(vec3(0.00001, 0, 0))
        .normalize()
        .mul(0.28)
        .toVar();
      particleVelocity.subAssign(
        noise.mul(this.uniforms.noise).mul(this.uniforms.dt)
      );

      const cellIndex = ivec3(particlePosition).sub(1).toConst('cellIndex');
      const cellDiff = particlePosition.fract().sub(0.5).toConst('cellDiff');

      const w0 = float(0.5)
        .mul(float(0.5).sub(cellDiff))
        .mul(float(0.5).sub(cellDiff));
      const w1 = float(0.75).sub(cellDiff.mul(cellDiff));
      const w2 = float(0.5)
        .mul(float(0.5).add(cellDiff))
        .mul(float(0.5).add(cellDiff));
      const weights = array([vec3(w0), vec3(w1), vec3(w2)]).toConst('weights');

      const B = mat3(0, 0, 0, 0, 0, 0, 0, 0, 0).toVar('B');
      neighbourLoop('gx', (gx) => {
        neighbourLoop('gy', (gy) => {
          neighbourLoop('gz', (gz) => {
            const weight = arrayElement(weights, gx)
              .x.mul(arrayElement(weights, gy).y)
              .mul(arrayElement(weights, gz).z);
            const cellX = cellIndex.add(ivec3(gx, gy, gz)).toConst();
            const cellDist = vec3(cellX)
              .add(0.5)
              .sub(particlePosition)
              .toConst('cellDist');
            const cellPtr = getCellPtr(cellX);

            const weightedVelocity = this.cellBufferF
              .element(cellPtr)
              .xyz.mul(weight)
              .toConst('weightedVelocity');
            const term = mat3(
              weightedVelocity.mul(cellDist.x),
              weightedVelocity.mul(cellDist.y),
              weightedVelocity.mul(cellDist.z)
            );
            B.addAssign(term);
            particleVelocity.addAssign(weightedVelocity);
          });
        });
      });

      const dist = cross(
        this.uniforms.mouseRayDirection,
        particlePosition.mul(vec3(1, 1, 0.4)).sub(this.uniforms.mouseRayOrigin)
      ).length();
      const force = dist.mul(0.1).oneMinus().max(0.0).pow(2);
      //particleVelocity.assign(mix(particleVelocity, this.uniforms.mouseForce.mul(6), force));
      particleVelocity.addAssign(this.uniforms.mouseForce.mul(1).mul(force));
      particleVelocity.mulAssign(particleMass); // to ensure difference between particles

      this.particleBuffer.element(instanceIndex).get('C').assign(B.mul(4));
      particlePosition.addAssign(particleVelocity.mul(this.uniforms.dt));
      particlePosition.assign(
        clamp(particlePosition, vec3(2), vec3(this.uniforms.gridSize).sub(2))
      );

      const wallStiffness = 0.3;
      const xN = particlePosition
        .add(particleVelocity.mul(this.uniforms.dt).mul(3.0))
        .toConst('xN');
      const wallMin = vec3(3).toConst('wallMin');
      const wallMax = vec3(this.uniforms.gridSize).sub(3).toConst('wallMax');
      If(xN.x.lessThan(wallMin.x), () => {
        particleVelocity.x.addAssign(wallMin.x.sub(xN.x).mul(wallStiffness));
      });
      If(xN.x.greaterThan(wallMax.x), () => {
        particleVelocity.x.addAssign(wallMax.x.sub(xN.x).mul(wallStiffness));
      });
      If(xN.y.lessThan(wallMin.y), () => {
        particleVelocity.y.addAssign(wallMin.y.sub(xN.y).mul(wallStiffness));
      });
      If(xN.y.greaterThan(wallMax.y), () => {
        particleVelocity.y.addAssign(wallMax.y.sub(xN.y).mul(wallStiffness));
      });
      If(xN.z.lessThan(wallMin.z), () => {
        particleVelocity.z.addAssign(wallMin.z.sub(xN.z).mul(wallStiffness));
      });
      If(xN.z.greaterThan(wallMax.z), () => {
        particleVelocity.z.addAssign(wallMax.z.sub(xN.z).mul(wallStiffness));
      });

      this.particleBuffer
        .element(instanceIndex)
        .get('position')
        .assign(particlePosition);
      this.particleBuffer
        .element(instanceIndex)
        .get('velocity')
        .assign(particleVelocity);

      const direction = this.particleBuffer
        .element(instanceIndex)
        .get('direction');
      direction.assign(mix(direction, particleVelocity, 0.1));

      const color = hsvtorgb(
        vec3(
          particleDensity
            .div(this.uniforms.restDensity)
            .mul(0.25)
            .add(time.mul(0.05)),
          particleVelocity.length().mul(0.5).clamp(0, 1).mul(0.3).add(0.7),
          force.mul(0.3).add(0.7)
        )
      );
      this.particleBuffer.element(instanceIndex).get('color').assign(color);
    })().compute(1);
  }

  setMouseRay(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    pos: THREE.Vector3
  ) {
    origin.multiplyScalar(64);
    pos.multiplyScalar(64);
    origin.add(new THREE.Vector3(32, 0, 0));
    this.uniforms.mouseRayDirection.value.copy(direction.normalize());
    this.uniforms.mouseRayOrigin.value.copy(origin);
    this.mousePos.copy(pos);
  }

  async update(interval: number, moving = true) {
    const { particles } = conf.particles;
    const { run } = conf.rendering;
    const {
      noise,
      dynamicViscosity,
      stiffness,
      restDensity,
      speed,
      gravity,
      gravitySensorReading,
      accelerometerReading,
    } = conf.simulation;

    this.uniforms.noise.value = noise;
    this.uniforms.stiffness.value = stiffness;
    this.uniforms.gravityType.value = gravity;
    if (gravity === 0) {
      this.uniforms.gravity.value.set(0, 0, 0.2);
    } else if (gravity === 1) {
      this.uniforms.gravity.value.set(0, -0.2, 0);
    } else if (gravity === 3) {
      this.uniforms.gravity.value
        .copy(gravitySensorReading)
        .add(accelerometerReading);
    }
    this.uniforms.dynamicViscosity.value = dynamicViscosity;
    this.uniforms.restDensity.value = restDensity;

    if (particles !== this.numParticles) {
      this.numParticles = particles;
      this.uniforms.numParticles.value = particles;
      this.kernels.p2g1.count = particles;
      this.kernels.p2g2.count = particles;
      this.kernels.g2p.count = particles;
    }

    interval = Math.min(interval, 1 / 60);
    const dt = interval * 6 * speed;
    this.uniforms.dt.value = dt;

    this.mousePosArray.push(this.mousePos.clone());
    if (this.mousePosArray.length > 3) {
      this.mousePosArray.shift();
    }
    if (this.mousePosArray.length > 1) {
      this.uniforms.mouseForce.value
        .copy(this.mousePosArray[this.mousePosArray.length - 1])
        .sub(this.mousePosArray[0])
        .divideScalar(this.mousePosArray.length);
    }

    if (run && moving && interval > 0) {
      const kernels = [
        this.kernels.clearGrid,
        this.kernels.p2g1,
        this.kernels.p2g2,
        this.kernels.updateGrid,
        this.kernels.g2p,
      ];
      await this.renderer.computeAsync(kernels);
    }
  }
}
