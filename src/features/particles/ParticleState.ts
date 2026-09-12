export interface ParticleState {
  readonly posX: Float32Array;
  readonly posY: Float32Array;
  readonly posZ: Float32Array;
  readonly velX: Float32Array;
  readonly velY: Float32Array;
  readonly velZ: Float32Array;
  readonly invMass: Float32Array;
}

export interface ParticleBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
