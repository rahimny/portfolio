import type { GameEvent } from '@/features/core-panic/model';

/** Short, bounded voices; there is no audio clock driving the game. */
export class CoreAudio {
  private context?: AudioContext;
  private voices = new Set<AudioScheduledSourceNode>();
  private enabled = false;
  private noise?: AudioBuffer;
  private disposed = false;
  public setEnabled(enabled: boolean): void {
    if (this.disposed) return;
    this.enabled = enabled;
    if (enabled) {
      try {
        this.context ??= new AudioContext();
        void this.context.resume().catch(() => {
          this.enabled = false;
        });
      } catch {
        this.enabled = false;
      }
    } else if (this.context) void this.context.suspend().catch(() => {});
  }
  public play(event: GameEvent): void {
    const context = this.context;
    if (!context || !this.enabled || this.disposed || this.voices.size >= 16)
      return;
    const impact = event.type === 'hit' || event.type === 'chain';
    const bright = event.type === 'chain';
    const frequency = impact
      ? bright
        ? 170
        : 125
      : event.type === 'shot'
        ? 480 + event.power * 250
        : 75;
    const voice = (frequency: number, volume: number, duration: number) => {
      const oscillator = context.createOscillator(),
        gain = context.createGain(),
        now = context.currentTime;
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, now);
      oscillator.frequency.exponentialRampToValueAtTime(
        impact ? 38 : frequency * 0.4,
        now + duration
      );
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(volume, now + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      this.voices.add(oscillator);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
        this.voices.delete(oscillator);
      };
      oscillator.start();
      oscillator.stop(now + duration + 0.02);
    };
    voice(frequency, impact ? 0.17 : 0.04, impact ? 0.48 : 0.18);
    if (impact) {
      voice(700, 0.035, 0.055);
      if (!this.noise) {
        this.noise = context.createBuffer(
          1,
          Math.ceil(context.sampleRate * 0.38),
          context.sampleRate
        );
        const samples = this.noise.getChannelData(0);
        for (let i = 0; i < samples.length; i++)
          samples[i] = Math.random() * 2 - 1;
      }
      const source = context.createBufferSource(),
        filter = context.createBiquadFilter(),
        gain = context.createGain(),
        now = context.currentTime;
      source.buffer = this.noise;
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(5200, now);
      filter.frequency.exponentialRampToValueAtTime(130, now + 0.35);
      filter.Q.value = 1.8;
      gain.gain.setValueAtTime(0.065 + event.power * 0.025, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.36);
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
      source.start();
      source.stop(now + 0.38);
    }
    if (bright) voice(frequency * 1.5, 0.025, 0.32);
  }
  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.voices.forEach((voice) => {
      voice.stop();
      voice.disconnect();
    });
    this.voices.clear();
    this.noise = undefined;
    void this.context?.close().catch(() => {});
  }
}
