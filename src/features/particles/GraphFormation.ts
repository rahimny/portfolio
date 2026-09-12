import type { ParticleBounds, ParticleState } from './ParticleState';
import {
  GRAPH_TOPOLOGIES,
  generateGraphTopology,
  type GraphTopologyKind,
} from './graphTopology';

const MAX_STRUCTURAL_NODES = 320;
const MIN_STRUCTURAL_NODES = 48;
const BLEND_TIME = 0.55;
// Leaving graph mode decays faster than entering it. The stronger charge and
// weaker centring that make the layout read as organic (see `step` below)
// also give structural nodes more momentum to shed on the way out; a slow
// symmetric fade let that momentum keep fighting the letterform spring and
// pointer forces for a couple of seconds, reading as sluggish typing right
// after a visit to graph mode.
const EXIT_BLEND_TIME = 0.2;

/** The same cursor state the letterform spring yields to, so a drag can open
 * up the graph the way it smears text instead of being out-muscled by it. */
export interface GraphPointerState {
  readonly active: boolean;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly falloff: number;
  readonly yieldAmount: number;
  readonly strength: number;
}

function hash(value: number): number {
  let n = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/**
 * A sparse graph carried by a dense particle field.
 *
 * Only stable, deterministic structural particles run the graph solver. Every
 * other particle follows one of those nodes with its own offset, so the whole
 * field reads as a graph without paying graph-layout cost for every speck of
 * ink. The class owns topology and graph forces, never rendering or lifecycle.
 */
export class GraphFormation {
  private readonly capacity: number;
  private readonly anchorOf: Int32Array;
  private readonly offsetX: Float32Array;
  private readonly offsetY: Float32Array;
  private readonly offsetZ: Float32Array;
  private readonly isAnchor: Uint8Array;
  private readonly holdOf: Float32Array;
  private nodes = new Uint32Array();
  private edgePairs = new Uint32Array();
  private configuredCount = 0;
  private targetBlend = 0;
  private currentBlend = 0;
  private topologyIndex = 0;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.anchorOf = new Int32Array(capacity).fill(-1);
    this.offsetX = new Float32Array(capacity);
    this.offsetY = new Float32Array(capacity);
    this.offsetZ = new Float32Array(capacity);
    this.isAnchor = new Uint8Array(capacity);
    this.holdOf = new Float32Array(capacity).fill(1);
  }

  public get blend(): number {
    return this.currentBlend;
  }

  public get edges(): Uint32Array {
    return this.edgePairs;
  }

  public get structuralNodes(): Uint32Array {
    return this.nodes;
  }

  public get topology(): GraphTopologyKind {
    return GRAPH_TOPOLOGIES[this.topologyIndex];
  }

  public setActive(active: boolean, count: number, immediate = false): void {
    this.targetBlend = active ? 1 : 0;
    if (immediate) this.currentBlend = this.targetBlend;
    if (active && this.configuredCount !== count) this.configure(count);
  }

  public setCount(count: number): void {
    if (this.targetBlend > 0 || this.currentBlend > 0) this.configure(count);
  }

  public cycle(count: number): GraphTopologyKind {
    this.topologyIndex = (this.topologyIndex + 1) % GRAPH_TOPOLOGIES.length;
    this.configure(count);
    return this.topology;
  }

  public step(
    state: ParticleState,
    count: number,
    bounds: ParticleBounds,
    dt: number,
    em: number,
    pointer?: GraphPointerState
  ): number {
    const blendTime =
      this.targetBlend < this.currentBlend ? EXIT_BLEND_TIME : BLEND_TIME;
    const blendStep = 1 - 1 / (1 + dt / blendTime);
    this.currentBlend += (this.targetBlend - this.currentBlend) * blendStep;
    if (this.currentBlend < 0.0005 && this.targetBlend === 0) {
      this.currentBlend = 0;
      return 0;
    }
    if (this.configuredCount !== count) this.configure(count);

    const blend = this.currentBlend;
    const width = Math.max(1, bounds.right - bounds.left);
    const height = Math.max(1, bounds.bottom - bounds.top);
    const centreX = (bounds.left + bounds.right) * 0.5;
    const centreY = (bounds.top + bounds.bottom) * 0.5;
    const naturalSpacing = Math.sqrt(
      (width * height) / Math.max(1, this.nodes.length)
    );
    const restLength = Math.max(em * 0.18, naturalSpacing * 1.05);
    const spring = 8.5 * blend;
    // Weak on purpose: this only keeps the whole graph from drifting off
    // screen. Shape has to come from the topology via link + charge, the way
    // d3-force's centering force never dictates layout, only recentres it.
    const centre = 0.3 * blend;
    const separationRadius = Math.max(em * 0.22, naturalSpacing * 1.5);
    const separationSq = separationRadius * separationRadius;
    const separation = 320 * blend;
    const charge = naturalSpacing * naturalSpacing * 42 * blend;

    const { posX, posY, posZ, velX, velY, velZ, invMass } = state;
    const edges = this.edgePairs;

    // A node under the cursor yields its graph forces exactly as the
    // letterform spring yields in text mode, so a drag opens the graph up
    // instead of being fought by physics that just got a lot stiffer.
    const pointerActive = pointer?.active ?? false;
    const pointerInvRadius = pointerActive
      ? 1 / Math.max(1e-3, pointer!.radius)
      : 0;
    for (let i = 0; i < this.nodes.length; i++) {
      const a = this.nodes[i];
      let hold = 1;
      if (pointerActive) {
        const dx = posX[a] - pointer!.x;
        const dy = posY[a] - pointer!.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < pointer!.radius * pointer!.radius) {
          const dist = Math.sqrt(distSq);
          const t = 1 - dist * pointerInvRadius;
          const force =
            pointer!.falloff === 2 ? t * t : Math.pow(t, pointer!.falloff);
          hold = Math.max(
            0,
            1 - force * pointer!.yieldAmount * pointer!.strength
          );
        }
      }
      this.holdOf[a] = hold;
    }

    for (let i = 0; i < edges.length; i += 2) {
      const a = edges[i];
      const b = edges[i + 1];
      const dx = posX[b] - posX[a];
      const dy = posY[b] - posY[a];
      const dz = posZ[b] - posZ[a];
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz + 1e-4);
      const force = (distance - restLength) * spring * dt;
      const fx = (dx / distance) * force;
      const fy = (dy / distance) * force;
      const fz = (dz / distance) * force;
      const holdA = this.holdOf[a];
      const holdB = this.holdOf[b];
      velX[a] += fx * invMass[a] * holdA;
      velY[a] += fy * invMass[a] * holdA;
      velZ[a] += fz * invMass[a] * holdA;
      velX[b] -= fx * invMass[b] * holdB;
      velY[b] -= fy * invMass[b] * holdB;
      velZ[b] -= fz * invMass[b] * holdB;
    }

    // The structural budget is deliberately small enough that an all-pairs
    // repulsion pass is cheaper than maintaining an allocation-heavy tree.
    // Long-range charge opens the overall form while the stronger local term
    // keeps nearby nodes legible.
    for (let i = 0; i < this.nodes.length; i++) {
      const a = this.nodes[i];
      const holdA = this.holdOf[a];
      for (let j = i + 1; j < this.nodes.length; j++) {
        const b = this.nodes[j];
        const dx = posX[b] - posX[a];
        const dy = posY[b] - posY[a];
        const distanceSq = dx * dx + dy * dy;
        const distance = Math.sqrt(distanceSq + 1e-4);
        const local =
          distanceSq < separationSq
            ? (1 - distance / separationRadius) * separation
            : 0;
        const strength = (local + charge / (distanceSq + 16)) * blend * dt;
        const fx = (dx / distance) * strength;
        const fy = (dy / distance) * strength;
        const holdB = this.holdOf[b];
        velX[a] -= fx * invMass[a] * holdA;
        velY[a] -= fy * invMass[a] * holdA;
        velX[b] += fx * invMass[b] * holdB;
        velY[b] += fy * invMass[b] * holdB;
      }

      const dx = centreX - posX[a];
      const dy = centreY - posY[a];
      velX[a] += dx * centre * dt * holdA;
      velY[a] += dy * centre * dt * holdA;
      // A real but shallow volume now; future formations can increase this
      // without changing the state or topology contracts.
      velZ[a] += -posZ[a] * centre * 0.7 * dt * holdA;
    }

    const followerPull = 15 * blend;
    const cloudRadius = Math.max(2, em * 0.12);
    for (let p = 0; p < count; p++) {
      if (this.isAnchor[p]) continue;
      const anchor = this.anchorOf[p];
      if (anchor < 0) continue;
      const tx = posX[anchor] + this.offsetX[p] * cloudRadius;
      const ty = posY[anchor] + this.offsetY[p] * cloudRadius;
      const tz = posZ[anchor] + this.offsetZ[p] * cloudRadius * 0.45;
      const pull = followerPull * invMass[p] * dt;
      velX[p] += (tx - posX[p]) * pull;
      velY[p] += (ty - posY[p]) * pull;
      velZ[p] += (tz - posZ[p]) * pull;
    }

    return blend;
  }

  private configure(count: number): void {
    const safeCount = Math.max(0, Math.min(count, this.capacity));
    this.configuredCount = safeCount;
    this.isAnchor.fill(0, 0, safeCount);
    this.anchorOf.fill(-1, 0, safeCount);
    if (safeCount < 2) {
      this.nodes = new Uint32Array();
      this.edgePairs = new Uint32Array();
      return;
    }

    const nodeCount = Math.min(
      safeCount,
      MAX_STRUCTURAL_NODES,
      Math.max(MIN_STRUCTURAL_NODES, Math.floor(Math.sqrt(safeCount) * 1.8))
    );
    const nodes = new Uint32Array(nodeCount);
    for (let i = 0; i < nodeCount; i++) {
      const particle = Math.min(
        safeCount - 1,
        Math.floor(((i + 0.5) * safeCount) / nodeCount)
      );
      nodes[i] = particle;
      this.isAnchor[particle] = 1;
    }
    this.nodes = nodes;
    this.edgePairs = generateGraphTopology(nodes, this.topology);

    for (let p = 0; p < safeCount; p++) {
      if (this.isAnchor[p]) {
        this.anchorOf[p] = p;
        continue;
      }
      const anchorSlot = Math.floor(hash(p * 17 + 5) * nodeCount);
      this.anchorOf[p] = nodes[anchorSlot];
      const radius = Math.sqrt(hash(p * 19 + 7));
      const angle = hash(p * 23 + 11) * Math.PI * 2;
      this.offsetX[p] = Math.cos(angle) * radius;
      this.offsetY[p] = Math.sin(angle) * radius;
      this.offsetZ[p] = hash(p * 29 + 13) - 0.5;
    }
  }
}
