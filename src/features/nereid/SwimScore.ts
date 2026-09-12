import { SwimmingModel } from './swimming';

const FRAMES = 180;
const DURATION = 5.7;
const CHANNELS = 3;
let preparedFrames: Float32Array | undefined;

/** A short sampled performance of the real rod model, interpolated in either direction. */
export class SwimScore {
  readonly model = new SwimmingModel({
    frequency: 0.44,
    current: -0.18,
    turbulence: 0.08,
  });
  private stride =
    CHANNELS + this.model.chains.reduce((n, c) => n + c.positions.length, 0);
  private frames = new Float32Array((FRAMES + 1) * this.stride);

  async prepare(signal?: AbortSignal) {
    if (signal?.aborted) return;
    if (preparedFrames) {
      this.frames = preparedFrames;
      return;
    }
    for (let frame = 0; frame <= FRAMES; frame++) {
      if (signal?.aborted) return;
      if (frame) this.model.advance(DURATION / FRAMES);
      let offset = frame * this.stride;
      this.frames[offset++] = this.model.bell;
      this.frames[offset++] = this.model.margin;
      this.frames[offset++] = this.model.distance;
      for (const chain of this.model.chains) {
        this.frames.set(chain.positions, offset);
        offset += chain.positions.length;
      }
      // Yield between small batches so a route departure can cancel preparation.
      if (frame % 12 === 0)
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    if (!signal?.aborted) preparedFrames = this.frames;
  }

  exportFrames() {
    return this.frames.slice();
  }

  loadFrames(buffer: ArrayBuffer) {
    if (buffer.byteLength !== (FRAMES + 1) * this.stride * 4)
      throw new Error('Invalid Nereid swimming recording.');
    const frames = new Float32Array(buffer);
    if (!frames.every(Number.isFinite))
      throw new Error('Invalid Nereid swimming pose.');
    this.frames = frames;
  }

  sample(progress: number) {
    const position = Math.max(0, Math.min(1, progress)) * FRAMES;
    const a = Math.floor(position) * this.stride;
    const b = Math.min(FRAMES, Math.floor(position) + 1) * this.stride;
    const mix = position % 1;
    const at = (index: number) =>
      this.frames[a + index] * (1 - mix) + this.frames[b + index] * mix;
    this.model.bell = at(0);
    this.model.margin = at(1);
    this.model.distance = at(2);
    let offset = CHANNELS;
    for (const chain of this.model.chains) {
      for (let i = 0; i < chain.positions.length; i++)
        chain.positions[i] = at(offset++);
    }
    return this.model;
  }
}
