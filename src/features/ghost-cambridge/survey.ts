export type Bounds = [number, number, number, number];
export interface SurveyTile {
  id: number;
  file: string;
  count: number;
  bounds: Bounds;
}
export interface Survey {
  version: number;
  count: number;
  cropCount: number;
  sourceFile: string;
  attribution: string;
  bounds: Bounds;
  minimum: [number, number, number];
  origin: [number, number, number];
  scale: [number, number, number];
  heightRange: [number, number];
  highestPoint?: {
    position: [number, number, number];
    heightAboveGround: number;
    classification: number;
    returnKind: number;
  };
  gpsRange?: [number, number];
  acquisitionSegments?: [number, number][];
  tiles?: SurveyTile[];
  tileColumns?: number;
  tileSize?: number;
}
export interface Landmark {
  id: string;
  name: string;
  description: string;
  position: [number, number];
  distance: number;
  osm: string;
}
export interface MapContext {
  bounds: Bounds;
  source: string;
  licence: string;
  landmarks: Landmark[];
  features: {
    id: number;
    kind: 'road' | 'river';
    name: string;
    points: [number, number][];
  }[];
}
/** East → x, height → y, north → -z; local units are 100 metres. */
export function localPosition(
  east: number,
  north: number,
  height: number,
  survey: Survey
): [number, number, number] {
  return [
    (east - survey.origin[0]) / 100,
    (height - survey.origin[2]) / 100,
    -(north - survey.origin[1]) / 100,
  ];
}
export function decodeSurvey(buffer: ArrayBuffer, survey: Survey) {
  const view = new DataView(buffer);
  const version = survey.version;
  if (
    buffer.byteLength < 8 ||
    view.getUint32(0, false) !== (version === 2 ? 0x47434232 : 0x47434231)
  )
    throw new Error('The survey file has an invalid header.');
  const count = view.getUint32(4, true);
  const stride = version === 2 ? 16 : 8;
  if (
    ![1, 2].includes(version) ||
    count !== survey.count ||
    count > 2000000 ||
    buffer.byteLength !== 8 + count * stride
  )
    throw new Error('The survey file is incomplete or incompatible.');
  if (
    ![...survey.minimum, ...survey.origin, ...survey.scale].every(
      Number.isFinite
    ) ||
    survey.scale.some((value) => value <= 0)
  )
    throw new Error('The survey coordinates are invalid.');
  if (
    version === 2 &&
    (!survey.gpsRange ||
      !survey.gpsRange.every(Number.isFinite) ||
      survey.gpsRange[1] <= survey.gpsRange[0])
  )
    throw new Error('The survey acquisition times are invalid.');
  const segments = survey.acquisitionSegments;
  const activeDuration =
    segments?.reduce((sum, [start, end]) => sum + end - start, 0) ?? 0;
  const positions = new Float32Array(count * 3);
  const intensities = new Float32Array(count);
  const classifications = new Float32Array(count);
  const heights = new Float32Array(count);
  const acquisition = new Float32Array(count);
  const returns = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const offset = 8 + i * stride;
    const east =
      view.getUint16(offset, true) * survey.scale[0] + survey.minimum[0];
    const north =
      view.getUint16(offset + 2, true) * survey.scale[1] + survey.minimum[1];
    const height =
      view.getUint16(offset + 4, true) * survey.scale[2] + survey.minimum[2];
    positions.set(localPosition(east, north, height, survey), i * 3);
    intensities[i] = view.getUint8(offset + 6) / 255;
    classifications[i] = view.getUint8(offset + 7);
    heights[i] =
      version === 2
        ? view.getUint16(offset + 12, true) / 100
        : height - survey.origin[2];
    acquisition[i] =
      version === 2
        ? view.getUint32(offset + 8, true) /
          (1000 * (survey.gpsRange![1] - survey.gpsRange![0]))
        : 0;
    if (version === 2 && segments && activeDuration > 0) {
      const seconds = view.getUint32(offset + 8, true) / 1000;
      let active = 0;
      for (const [start, end] of segments)
        active += Math.max(0, Math.min(seconds, end) - start);
      acquisition[i] = Math.min(1, active / activeDuration);
    }
    const packed = version === 2 ? view.getUint8(offset + 14) : 17;
    const ordinal = packed & 15,
      total = packed >> 4;
    returns[i] = (ordinal === 1 ? 1 : 0) + (ordinal === total ? 2 : 0);
  }
  return {
    positions,
    intensities,
    classifications,
    heights,
    acquisition,
    returns,
  };
}
export type SurveyData = ReturnType<typeof decodeSurvey>;

/** A half-open tile partition makes replacement of sampled returns unambiguous. */
export function tileForPoint(
  east: number,
  north: number,
  survey: Survey
): number {
  const size = survey.tileSize ?? 230,
    columns = survey.tileColumns ?? 5;
  const col = Math.min(
    columns - 1,
    Math.max(0, Math.floor((east - survey.bounds[0] + 0.001) / size))
  );
  const rows = Math.ceil((survey.bounds[3] - survey.bounds[1]) / size);
  const row = Math.min(
    rows - 1,
    Math.max(0, Math.floor((north - survey.bounds[1] + 0.001) / size))
  );
  return row * columns + col;
}
export function nearestTiles(
  east: number,
  north: number,
  survey: Survey
): SurveyTile[] {
  return [...(survey.tiles ?? [])]
    .sort((a, b) => {
      const distance = (tile: SurveyTile) =>
        Math.hypot(
          (tile.bounds[0] + tile.bounds[2]) / 2 - east,
          (tile.bounds[1] + tile.bounds[3]) / 2 - north
        );
      return distance(a) - distance(b);
    })
    .slice(0, 4);
}
/** Clip source map segments to the measured patch; never clamp them into false edges. */
export function clipSegment(
  a: [number, number],
  b: [number, number],
  bounds: Bounds
): [[number, number], [number, number]] | null {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const p = [-dx, dx, -dy, dy];
  const q = [
    a[0] - bounds[0],
    bounds[2] - a[0],
    a[1] - bounds[1],
    bounds[3] - a[1],
  ];
  let start = 0,
    end = 1;
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return null;
      continue;
    }
    const t = q[i] / p[i];
    if (p[i] < 0) start = Math.max(start, t);
    else end = Math.min(end, t);
    if (start > end) return null;
  }
  return [
    [a[0] + start * dx, a[1] + start * dy],
    [a[0] + end * dx, a[1] + end * dy],
  ];
}

/** Map the continuous playback clock back to actual seconds since the first return. */
export function acquisitionOffset(progress: number, survey: Survey): number {
  const segments = survey.acquisitionSegments;
  if (!segments?.length)
    return (
      progress * ((survey.gpsRange?.[1] ?? 0) - (survey.gpsRange?.[0] ?? 0))
    );
  let remaining =
    Math.max(0, Math.min(1, progress)) *
    segments.reduce((sum, [start, end]) => sum + end - start, 0);
  for (const [start, end] of segments) {
    if (remaining <= end - start) return start + remaining;
    remaining -= end - start;
  }
  return segments[segments.length - 1][1];
}
