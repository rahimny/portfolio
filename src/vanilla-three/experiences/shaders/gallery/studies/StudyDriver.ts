import type { Pane } from 'tweakpane';
import { StudyMotion } from '@/features/shader-studies/motion';
import type { FrameDriver, ShaderRuntime } from '../../ShaderGalleryExperience';

export interface StudyControl {
  uniform: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
}

export class StudyDriver implements FrameDriver {
  readonly motion: StudyMotion;
  readonly runtime: ShaderRuntime;
  private preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  private previousTouchAction: string;
  onRefresh?: () => void;

  constructor(runtime: ShaderRuntime, controls: readonly StudyControl[]) {
    this.runtime = runtime;
    this.motion = new StudyMotion(
      Object.fromEntries(controls.map((c) => [c.uniform, c.value]))
    );
    this.motion.playing = !this.preference.matches;
    const canvas = runtime.canvas;
    this.previousTouchAction = canvas.style.touchAction;
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointermove', this.onPointer);
    canvas.addEventListener('pointerdown', this.onPointer);
    canvas.addEventListener('pointerleave', this.onLeave);
    canvas.addEventListener('pointercancel', this.onLeave);
    this.preference.addEventListener('change', this.onPreference);
  }

  private onPointer = (event: PointerEvent): void => {
    const rect = this.runtime.canvas.getBoundingClientRect();
    this.motion.focusTarget.x = Math.max(
      -1,
      Math.min(
        1,
        ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1
      )
    );
    this.motion.focusTarget.y = Math.max(
      -1,
      Math.min(
        1,
        1 - ((event.clientY - rect.top) / Math.max(1, rect.height)) * 2
      )
    );
    this.runtime.invalidate();
  };

  private onLeave = (): void => {
    this.motion.focusTarget.x = 0;
    this.motion.focusTarget.y = 0;
    this.runtime.invalidate();
  };

  private onPreference = (): void => {
    this.motion.playing = !this.preference.matches;
    this.onRefresh?.();
    this.runtime.invalidate();
  };

  update(uniforms: Record<string, { value: unknown }>, dt: number): void {
    this.motion.step(dt, this.preference.matches);
    for (const [key, value] of Object.entries(this.motion.current)) {
      uniforms[key].value = value;
    }
    uniforms.uClock.value = this.motion.time;
    uniforms.uSeed.value = this.motion.seed;
    uniforms.uFocusX.value = this.motion.focus.x;
    uniforms.uFocusY.value = this.motion.focus.y;
  }

  resetComposition(): void {
    this.motion.reset();
  }

  needsFrame(): boolean {
    return this.motion.needsFrame();
  }

  dispose(): void {
    const canvas = this.runtime.canvas;
    canvas.style.touchAction = this.previousTouchAction;
    canvas.removeEventListener('pointermove', this.onPointer);
    canvas.removeEventListener('pointerdown', this.onPointer);
    canvas.removeEventListener('pointerleave', this.onLeave);
    canvas.removeEventListener('pointercancel', this.onLeave);
    this.preference.removeEventListener('change', this.onPreference);
    this.onRefresh = undefined;
  }
}

export function setupStudyPane(
  pane: Pane,
  driver: StudyDriver,
  controls: readonly StudyControl[],
  presets: Record<string, Record<string, number>>
): void {
  pane.expanded = window.innerWidth >= 700;
  const motion = driver.motion;
  const play = pane.addButton({
    title: motion.playing ? 'Pause motion' : 'Play motion',
  });
  // The numeric input rounds to its step. Keep that display constraint away
  // from the recording clock: refreshing the pane must never rewind history.
  const phase = { seconds: motion.time };
  let refreshing = false;
  const refresh = () => {
    refreshing = true;
    phase.seconds = motion.time;
    play.title = motion.playing ? 'Pause motion' : 'Play motion';
    pane.refresh();
    refreshing = false;
  };
  play.on('click', () => {
    motion.playing = !motion.playing;
    refresh();
    driver.runtime.invalidate();
  });
  const presetsFolder = pane.addFolder({
    title: 'Compositions',
    expanded: false,
  });
  for (const [title, values] of Object.entries(presets)) {
    presetsFolder.addButton({ title }).on('click', () => {
      Object.assign(motion.target, values);
      refresh();
      driver.runtime.invalidate();
    });
  }
  for (const control of controls) {
    pane.addBinding(motion.target, control.uniform, {
      label: control.label,
      min: control.min,
      max: control.max,
      step: control.step ?? 0.01,
    });
  }
  const output = pane.addFolder({ title: 'Motion & edition', expanded: false });
  output.addBinding(motion, 'speed', {
    label: 'Tempo',
    min: 0,
    max: 2,
    step: 0.05,
  });
  // Numeric phase is intentionally unbounded: a paused image remains reproducible.
  output
    .addBinding(phase, 'seconds', { label: 'Phase / s', min: 0, step: 0.1 })
    .on('change', (event) => {
      if (refreshing) return;
      motion.time = event.value;
      motion.playing = false;
      refresh();
    });
  output.addBinding(motion, 'seed', {
    label: 'Edition',
    min: 1,
    max: 999,
    step: 1,
  });
  output.addBinding(motion.focusTarget, 'x', {
    label: 'Force X',
    min: -1,
    max: 1,
    step: 0.01,
  });
  output.addBinding(motion.focusTarget, 'y', {
    label: 'Force Y',
    min: -1,
    max: 1,
    step: 0.01,
  });
  pane.addButton({ title: 'New variation' }).on('click', () => {
    motion.seed = (motion.seed % 999) + 1;
    refresh();
    driver.runtime.invalidate();
  });
  pane
    .addButton({ title: 'Save PNG' })
    .on('click', () => driver.runtime.savePng());
  output.addButton({ title: 'Reset composition' }).on('click', () => {
    driver.resetComposition();
    refresh();
    driver.runtime.invalidate();
  });
  pane.on('change', () => driver.runtime.invalidate());
  driver.onRefresh = refresh;
  for (const row of pane.element.querySelectorAll('.tp-lblv')) {
    const label = row.querySelector('.tp-lblv_l')?.textContent;
    if (!label) continue;
    for (const control of row.querySelectorAll(
      'input, select, [role="slider"]'
    )) {
      control.setAttribute('aria-label', label);
    }
    row.querySelector('.tp-sldv_t')?.setAttribute('tabindex', '-1');
  }
}
