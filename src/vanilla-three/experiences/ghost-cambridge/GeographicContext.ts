import * as THREE from 'three';
import {
  clipSegment,
  localPosition,
  type MapContext,
  type Survey,
  type SurveyData,
} from '@/features/ghost-cambridge/survey';
export interface ProjectedLandmark {
  id: string;
  x: number;
  y: number;
  visible: boolean;
}
export class GeographicContext {
  private roads: THREE.LineSegments<
    THREE.BufferGeometry,
    THREE.LineBasicMaterial
  >;
  private river: THREE.LineSegments<
    THREE.BufferGeometry,
    THREE.LineBasicMaterial
  >;
  private anchors: { id: string; position: THREE.Vector3 }[];
  private scene: THREE.Scene;
  readonly context: MapContext;
  constructor(
    scene: THREE.Scene,
    context: MapContext,
    survey: Survey,
    data: SurveyData
  ) {
    this.scene = scene;
    this.context = context;
    const roads: number[] = [],
      river: number[] = [];
    for (const feature of context.features) {
      const destination = feature.kind === 'river' ? river : roads;
      for (let i = 1; i < feature.points.length; i++) {
        const segment = clipSegment(
          feature.points[i - 1],
          feature.points[i],
          survey.bounds
        );
        if (segment)
          for (const point of segment)
            destination.push(...localPosition(point[0], point[1], 8, survey));
      }
    }
    const make = (vertices: number[], color: number, opacity: number) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(vertices, 3)
      );
      const lines = new THREE.LineSegments(
        geometry,
        new THREE.LineBasicMaterial({
          color,
          transparent: true,
          opacity,
          depthTest: false,
          depthWrite: false,
        })
      );
      lines.renderOrder = 2;
      scene.add(lines);
      return lines;
    };
    this.roads = make(roads, 0x8195a0, 0.13);
    this.river = make(river, 0x73c6e5, 0.8);
    this.anchors = context.landmarks.map((landmark) => {
      const position = new THREE.Vector3(
        ...localPosition(...landmark.position, 8, survey)
      );
      let roof = 0.08;
      // Anchor above the recorded local silhouette, not an invented building height.
      for (let i = 0; i < data.positions.length; i += 3) {
        if (
          Math.hypot(
            data.positions[i] - position.x,
            data.positions[i + 2] - position.z
          ) < 0.22
        )
          roof = Math.max(roof, data.positions[i + 1]);
      }
      position.y = roof + 0.035;
      return { id: landmark.id, position };
    });
    if (survey.highestPoint)
      this.anchors.unshift({
        id: 'highest-return',
        position: new THREE.Vector3(
          ...localPosition(...survey.highestPoint.position, survey)
        ),
      });
  }
  update(map: number, relief: number, palette: number, section: boolean) {
    for (const line of [this.roads, this.river]) {
      line.scale.y = THREE.MathUtils.lerp(relief, 0.008, map);
      line.visible = !section;
    }
    this.roads.material.opacity = (palette === 0 ? 0.16 : 0.04) + map * 0.38;
  }
  project(
    camera: THREE.Camera,
    map: number,
    relief: number,
    width: number,
    height: number,
    selected: string,
    showHighestPoint: boolean
  ): ProjectedLandmark[] {
    const used: { x: number; y: number }[] = [];
    const priority = (id: string) =>
      id === 'highest-return' ? 2 : Number(id === selected);
    const ranked = this.anchors
      .filter((anchor) => anchor.id !== 'highest-return' || showHighestPoint)
      .sort((a, b) => priority(b.id) - priority(a.id));
    return ranked.map((anchor) => {
      const p = anchor.position.clone();
      p.y *= THREE.MathUtils.lerp(relief, 0.008, map);
      p.project(camera);
      const x = (p.x * 0.5 + 0.5) * width,
        y = (-p.y * 0.5 + 0.5) * height;
      const visible =
        p.z > -1 &&
        p.z < 1 &&
        x > 30 &&
        x < width - (anchor.id === 'highest-return' ? 185 : 130) &&
        y > (anchor.id === 'highest-return' ? 95 : 24) &&
        y < height - 34 &&
        !used.some(
          (other) => Math.abs(x - other.x) < 155 && Math.abs(y - other.y) < 45
        );
      if (visible) used.push({ x, y });
      return { id: anchor.id, x, y, visible };
    });
  }
  dispose() {
    for (const line of [this.roads, this.river]) {
      this.scene.remove(line);
      line.geometry.dispose();
      line.material.dispose();
    }
  }
}
