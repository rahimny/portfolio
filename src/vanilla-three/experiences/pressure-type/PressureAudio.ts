type Cue = 'pump' | 'knock' | 'burst';

/** Short, opt-in physical cues. No downloads, perpetual nodes or automatic playback. */
export class PressureAudio {
  private context?: AudioContext;
  private noise?: AudioBuffer;
  private readonly voices = new Set<AudioBufferSourceNode>();
  private disposed = false;
  private toggling = false;
  enabled = false;

  async toggle() {
    if (this.disposed || this.toggling) return this.enabled;
    this.toggling = true;
    try {
      if (this.enabled) {
        this.enabled = false;
        await this.context?.suspend();
        return false;
      }
      this.context ??= new AudioContext();
      await this.context.resume();
      if (this.disposed) return false;
      if (!this.noise) {
        this.noise = this.context.createBuffer(
          1,
          this.context.sampleRate / 2,
          this.context.sampleRate
        );
        const data = this.noise.getChannelData(0);
        let seed = 9173;
        for (let i = 0; i < data.length; i++) {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          data[i] = seed / 0x80000000 - 1;
        }
      }
      this.enabled = true;
      return true;
    } catch {
      this.enabled = false;
      return false;
    } finally {
      this.toggling = false;
    }
  }

  play(cue: Cue, air: number) {
    const context = this.context;
    if (
      !this.enabled ||
      !context ||
      !this.noise ||
      context.state !== 'running' ||
      this.voices.size >= 6
    )
      return;
    const source = context.createBufferSource();
    source.buffer = this.noise;
    const filter = context.createBiquadFilter();
    filter.type = cue === 'pump' ? 'bandpass' : 'lowpass';
    filter.frequency.value =
      cue === 'pump' ? 1400 : cue === 'burst' ? 3200 : 160 + air * 180;
    filter.Q.value = cue === 'knock' ? 3 : 0.7;
    const gain = context.createGain();
    const now = context.currentTime,
      duration = cue === 'pump' ? 0.2 : cue === 'burst' ? 0.16 : 0.12;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(
      cue === 'burst' ? 0.16 : 0.12,
      now + 0.004
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(context.destination);
    this.voices.add(source);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
      this.voices.delete(source);
    };
    source.start(now);
    source.stop(now + duration + 0.01);
  }

  dispose() {
    this.disposed = true;
    this.enabled = false;
    for (const voice of this.voices) voice.stop();
    this.voices.clear();
    void this.context?.close();
    this.noise = undefined;
  }
}
