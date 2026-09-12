import * as THREE from 'three';
import {
  decodeSurvey,
  nearestTiles,
  tileForPoint,
  type Survey,
  type SurveyData,
} from '@/features/ghost-cambridge/survey';

type Cloud = THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
export class SurveyCloud {
  private base = new Map<number, Cloud>();
  private detailed = new Map<number, Cloud>();
  private pending = new Map<number, AbortController>();
  private wanted = new Set<number>();
  private disposed = false;
  private allPoints = false;
  private focus: [number, number, number] = [0, 0, Infinity];
  private failed = new Set<number>();
  private scene: THREE.Scene;
  private material: THREE.ShaderMaterial;
  private survey: Survey;
  private changed: () => void;
  constructor(
    scene: THREE.Scene,
    material: THREE.ShaderMaterial,
    survey: Survey,
    data: SurveyData,
    changed: () => void
  ) {
    this.scene = scene;
    this.material = material;
    this.survey = survey;
    this.changed = changed;
    const attributes = this.attributes(data);
    const buckets = new Map<number, number[]>();
    for (let i = 0; i < survey.count; i++) {
      const id = tileForPoint(
        data.positions[i * 3] * 100 + survey.origin[0],
        -data.positions[i * 3 + 2] * 100 + survey.origin[1],
        survey
      );
      let bucket = buckets.get(id);
      if (!bucket) {
        bucket = [];
        buckets.set(id, bucket);
      }
      bucket.push(i);
    }
    for (const [id, indices] of buckets) {
      const geometry = new THREE.BufferGeometry();
      for (const [name, attribute] of Object.entries(attributes))
        geometry.setAttribute(name, attribute);
      geometry.setIndex(indices);
      this.base.set(id, this.add(geometry));
    }
  }
  private attributes(data: SurveyData) {
    return {
      position: new THREE.BufferAttribute(data.positions, 3),
      intensity: new THREE.BufferAttribute(data.intensities, 1),
      classification: new THREE.BufferAttribute(data.classifications, 1),
      heightAboveGround: new THREE.BufferAttribute(data.heights, 1),
      acquisition: new THREE.BufferAttribute(data.acquisition, 1),
      returnKind: new THREE.BufferAttribute(data.returns, 1),
    };
  }
  private add(geometry: THREE.BufferGeometry) {
    const cloud = new THREE.Points(geometry, this.material);
    cloud.frustumCulled = false;
    this.scene.add(cloud);
    return cloud;
  }
  setAllPoints(enabled: boolean) {
    this.allPoints = enabled;
    this.failed.clear();
    this.updateFocus(...this.focus);
  }
  updateFocus(east: number, north: number, distance: number) {
    if (this.disposed) return;
    this.focus = [east, north, distance];
    const tiles = this.allPoints
      ? (this.survey.tiles ?? [])
      : distance < 9
        ? nearestTiles(east, north, this.survey)
        : [];
    const wanted = new Set(tiles.map((tile) => tile.id));
    if (
      wanted.size === this.wanted.size &&
      [...wanted].every((id) => this.wanted.has(id))
    )
      return;
    this.wanted = wanted;
    for (const [id, controller] of this.pending) {
      if (!wanted.has(id)) {
        controller.abort();
        this.pending.delete(id);
      }
    }
    this.sync();
    this.fetchNext();
  }
  private fetchNext() {
    for (const id of this.wanted) {
      if (this.pending.size >= 2 || this.disposed) break;
      if (this.detailed.has(id) || this.pending.has(id) || this.failed.has(id))
        continue;
      const tile = this.survey.tiles?.find((candidate) => candidate.id === id);
      if (!tile) continue;
      const controller = new AbortController();
      this.pending.set(id, controller);
      void (async () => {
        try {
          const response = await fetch(`/ghost-cambridge/${tile.file}`, {
            signal: controller.signal,
          });
          if (!response.ok) throw new Error('Detail unavailable');
          const buffer = await response.arrayBuffer();
          if (this.disposed || controller.signal.aborted) return;
          const data = decodeSurvey(buffer, {
            ...this.survey,
            count: tile.count,
          });
          const geometry = new THREE.BufferGeometry();
          for (const [name, attribute] of Object.entries(this.attributes(data)))
            geometry.setAttribute(name, attribute);
          this.detailed.set(id, this.add(geometry));
        } catch {
          if (!controller.signal.aborted && !this.disposed) this.failed.add(id);
        } finally {
          if (this.pending.get(id) === controller) this.pending.delete(id);
          if (!this.disposed) {
            this.sync();
            this.fetchNext();
          }
        }
      })();
    }
    this.changed();
  }
  private sync() {
    for (const [id, cloud] of this.base)
      cloud.visible = !(this.wanted.has(id) && this.detailed.has(id));
    for (const [id, cloud] of this.detailed)
      cloud.visible = this.wanted.has(id);
    // Retain all requested patches; adaptive mode keeps at most six cached.
    for (const [id, cloud] of this.detailed) {
      if (this.detailed.size <= 6) break;
      if (!this.wanted.has(id)) {
        this.scene.remove(cloud);
        cloud.geometry.dispose();
        this.detailed.delete(id);
      }
    }
    this.changed();
  }
  get state() {
    let count = 0,
      fullTiles = 0;
    for (const cloud of this.base.values())
      if (cloud.visible) count += cloud.geometry.index?.count ?? 0;
    for (const cloud of this.detailed.values())
      if (cloud.visible) {
        count += cloud.geometry.getAttribute('position').count;
        fullTiles++;
      }
    return {
      count,
      fullTiles,
      loading: this.pending.size > 0,
      failed: [...this.wanted].some((id) => this.failed.has(id)),
    };
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const controller of this.pending.values()) controller.abort();
    this.pending.clear();
    for (const cloud of [...this.base.values(), ...this.detailed.values()]) {
      this.scene.remove(cloud);
      cloud.geometry.dispose();
    }
    this.base.clear();
    this.detailed.clear();
  }
}
