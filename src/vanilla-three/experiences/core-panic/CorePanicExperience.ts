import * as THREE from 'three';
import { BaseExperience, type ExperienceOptions } from '../BaseExperience';
import { ExperienceLoop } from '../../ExperienceLoop';
import {
  advanceGame,
  createGame,
  beginGather,
  cancelGather,
  releaseGather,
  salvoSize,
  opening,
  isOpen,
  growth,
  multiplier,
  nearestKnot,
  selectKnot,
  startGame,
  targetable,
  type GameEvent,
  type Phase,
} from '@/features/core-panic/model';
import { CoreSculpture } from './CoreSculpture';
import { CoreAudio } from './audio';

export interface CoreTarget {
  slot: number;
  x: number;
  y: number;
  growth: number;
  active: boolean;
  selected: boolean;
  open: boolean;
  exposed: boolean;
}
export interface CoreStatus {
  ready: boolean;
  phase: Phase;
  pressure: number;
  score: number;
  best: number;
  multiplier: number;
  cooldown: number;
  gathering: boolean;
  charge: number;
  salvo: number;
  opening: number;
  required: number;
  followups: number;
  blocked: number;
  hits: number;
  combo: number;
  bestCombo: number;
  time: number;
  feedback: string;
  reduced: boolean;
  targets: CoreTarget[];
}
export const INITIAL_STATUS: CoreStatus = {
  ready: false,
  phase: 'idle',
  pressure: 12,
  score: 0,
  best: 0,
  multiplier: 1,
  cooldown: 0,
  gathering: false,
  charge: 0,
  salvo: 2,
  opening: 0,
  required: 2,
  followups: 0,
  blocked: 0,
  hits: 0,
  combo: 0,
  bestCombo: 0,
  time: 0,
  feedback: '',
  reduced: false,
  targets: [],
};
export class CorePanicExperience extends BaseExperience {
  private game = createGame();
  private gatherSource: 'pointer' | 'keyboard' | 'toggle' | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-3, 3, 3, -3, 0.1, 30);
  private renderer?: THREE.WebGLRenderer;
  private sculpture?: CoreSculpture;
  private loop?: ExperienceLoop;
  private resizeObserver?: ResizeObserver;
  private visibilityObserver?: IntersectionObserver;
  private audio = new CoreAudio();
  private motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private visualTime = 0;
  private recoilAt = -100;
  private recoilPower = 0;
  private previousTime = 0;
  private reportTime = -1;
  private ready = false;
  private disposed = false;
  private feedback = '';
  private feedbackAt = -100;
  private best = 0;
  private quality = 1;
  private slowFrames = 0;
  private lastGathered = 0;
  private readonly onStatus: (status: CoreStatus) => void;
  constructor(
    canvas: HTMLCanvasElement,
    onStatus: (status: CoreStatus) => void,
    options: ExperienceOptions = {}
  ) {
    super(canvas, options);
    this.onStatus = onStatus;
    try {
      this.best = Math.max(
        0,
        Number(localStorage.getItem('core-panic-salvo-best')) || 0
      );
    } catch {
      /* Storage is optional. */
    }
  }
  public async init(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted || this.disposed) return;
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: true,
        alpha: true,
      });
    } catch {
      throw new Error(
        'Core Panic needs WebGL 2. Try a browser with hardware acceleration enabled.'
      );
    }
    this.renderer.setClearColor(0x08050f, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.camera.position.set(0, 0, 9);
    this.sculpture = new CoreSculpture();
    this.scene.add(this.sculpture.root);
    this.loop = new ExperienceLoop(
      this.canvas,
      this.frame,
      this.options.onError
    );
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(this.canvas.parentElement ?? this.canvas);
    this.visibilityObserver = new IntersectionObserver((entries) => {
      if (!entries[entries.length - 1]?.isIntersecting) this.pause();
    });
    this.visibilityObserver.observe(this.canvas);
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('blur', this.pause);
    window.addEventListener('keyup', this.keyUp);
    window.addEventListener('orientationchange', this.pause);
    this.canvas.addEventListener('webglcontextlost', this.contextLost);
    this.motion.addEventListener('change', this.motionChanged);
    this.resize();
    await this.loop.start();
    if (signal?.aborted || this.disposed) return;
    this.ready = true;
    this.report();
  }
  public start = (): void => {
    if (!this.ready || this.disposed) return;
    this.cancel();
    startGame(this.game);
    this.sculpture?.reset();
    this.recoilAt = -100;
    this.feedback = '';
    this.feedbackAt = -100;
    this.previousTime = 0;
    this.loop?.setPlaying(true);
    this.loop?.invalidate();
    this.report();
  };
  public pause = (): void => {
    if (this.game.phase !== 'playing' || this.disposed) return;
    this.cancel();
    this.game.phase = 'paused';
    this.previousTime = 0;
    this.loop?.setPlaying(false);
    this.report();
  };
  public resume = (): void => {
    if (this.game.phase !== 'paused' || this.disposed) return;
    this.game.phase = 'playing';
    this.previousTime = 0;
    this.loop?.setPlaying(true);
    this.loop?.invalidate();
    this.report();
  };
  public aim = (clientX: number, clientY: number): number => {
    if (this.disposed || this.game.phase !== 'playing') return -1;
    const bounds = this.canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return -1;
    const x =
      ((clientX - bounds.left) / bounds.width) *
        (this.camera.right - this.camera.left) +
      this.camera.left;
    const y =
      this.camera.top -
      ((clientY - bounds.top) / bounds.height) *
        (this.camera.top - this.camera.bottom);
    const reach = Math.max(
      0.32,
      (32 / bounds.width) * (this.camera.right - this.camera.left)
    );
    const slot = nearestKnot(this.game, x, y, reach);
    if (slot >= 0) {
      this.game.selected = slot;
      this.loop?.invalidate();
    }
    return slot;
  };
  public select = (slot: number): void => {
    if (this.game.knots[slot] && targetable(this.game.knots[slot])) {
      this.game.selected = slot;
      this.loop?.invalidate();
      this.report();
    }
  };
  public begin = (source: 'pointer' | 'keyboard' | 'toggle'): void => {
    if (this.disposed || this.gatherSource || !beginGather(this.game)) return;
    this.gatherSource = source;
    this.loop?.invalidate();
    this.report();
  };
  public release = (source: 'pointer' | 'keyboard' | 'toggle'): void => {
    if (this.disposed || this.gatherSource !== source) return;
    releaseGather(this.game);
    this.gatherSource = null;
    this.consumeEvents();
    this.loop?.invalidate();
    this.report();
  };
  public cancel = (): void => {
    cancelGather(this.game);
    this.gatherSource = null;
    this.report();
  };
  public toggleGather = (slot?: number): void => {
    if (slot !== undefined) this.select(slot);
    if (this.gatherSource) this.release(this.gatherSource);
    else this.begin('toggle');
  };
  private keyUp = (event: KeyboardEvent): void => {
    if (event.key === ' ') this.release('keyboard');
  };
  public setSound = (enabled: boolean): void => {
    this.audio.setEnabled(enabled);
  };
  public keyDown = (key: string, repeat: boolean): void => {
    if (repeat) return;
    if (key === 'Escape' || key === 'p') {
      if (this.game.phase === 'paused') this.resume();
      else this.pause();
      return;
    }
    if (this.game.phase !== 'playing') return;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(key)) {
      selectKnot(this.game, key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 1);
      this.report();
      this.loop?.invalidate();
    }
    if (/^[1-5]$/.test(key)) this.select(Number(key) - 1);
    if (key === ' ') this.begin('keyboard');
  };
  private onVisibility = (): void => {
    if (document.hidden) this.pause();
  };
  private motionChanged = (): void => {
    this.previousTime = 0;
    this.loop?.invalidate();
    this.report();
  };
  private contextLost = (event: Event): void => {
    event.preventDefault();
    this.pause();
    this.options.onError?.(
      new Error(
        'The graphics connection was interrupted. Reload to restart Core Panic.'
      )
    );
  };
  private consumeEvents(): void {
    const changed = this.game.events.length > 0;
    for (const event of this.game.events) {
      this.sculpture?.event(event, this.visualTime);
      this.audio.play(event);
      if (event.type === 'hit' || event.type === 'chain') {
        this.recoilAt = this.visualTime;
        this.recoilPower =
          event.type === 'chain' ? 1 : 0.55 + event.power * 0.35;
      }
      this.feedback = this.eventLabel(event);
      this.feedbackAt = this.game.time;
      if (event.type === 'breach') {
        this.loop?.setPlaying(false);
        if (this.game.score > this.best) {
          this.best = this.game.score;
          try {
            localStorage.setItem('core-panic-salvo-best', String(this.best));
          } catch {
            /* A run never depends on storage. */
          }
        }
      }
    }
    this.game.events.length = 0;
    if (changed) this.report();
  }
  private eventLabel(event: GameEvent): string {
    switch (event.type) {
      case 'shot':
        return 'Salvo committed';
      case 'blocked':
        return 'Deflected · release when the aperture opens';
      case 'graze':
        return 'Cracked open · fire again or gather 4 missiles';
      case 'hit':
        return `Implosion +${event.points} · nearby knots exposed`;
      case 'chain':
        return `Chain reaction +${event.points}`;
      case 'rupture':
        return 'Knot ruptured · instability rising';
      case 'breach':
        return 'The pressure knots overwhelmed the core.';
    }
  }
  private report(): void {
    if (this.disposed) return;
    const game = this.game;
    const width = this.camera.right - this.camera.left,
      height = this.camera.top - this.camera.bottom;
    this.onStatus({
      ready: this.ready,
      phase: game.phase,
      pressure: game.pressure,
      score: game.score,
      best: this.best,
      multiplier: multiplier(game.combo),
      cooldown: game.cooldown,
      gathering: game.gathering,
      charge: game.charge,
      salvo: salvoSize(game),
      opening:
        this.game.knots[game.selected]?.state === 'active'
          ? opening(game, game.knots[game.selected])
          : -1,
      required:
        growth(game, game.knots[game.selected]) >= 0.65 &&
        !game.knots[game.selected].wounded
          ? 4
          : 2,
      followups: game.followups,
      blocked: game.blocked,
      hits: game.hits,
      combo: game.combo,
      bestCombo: game.bestCombo,
      time: game.time,
      feedback:
        game.time - this.feedbackAt < 1.6 || game.phase === 'over'
          ? this.feedback
          : '',
      reduced: this.motion.matches,
      targets: game.knots
        .filter((k) => k.state === 'active' || k.state === 'targeted')
        .map((k) => ({
          slot: k.slot,
          x: ((k.position[0] - this.camera.left) / width) * 100,
          y: ((this.camera.top - k.position[1]) / height) * 100,
          growth: growth(game, k),
          active: targetable(k),
          selected: game.selected === k.slot,
          open: isOpen(game, k),
          exposed: k.exposedUntil > game.time,
        })),
    });
  }

  private frame = (): void => {
    if (!this.renderer || !this.sculpture || this.disposed) return;
    const now = performance.now();
    const delta = this.previousTime
      ? Math.min(0.05, Math.max(0, (now - this.previousTime) / 1000))
      : 0;
    const interval = this.previousTime ? now - this.previousTime : 0;
    this.previousTime = now;
    const running = this.game.phase === 'playing',
      idle = this.game.phase === 'idle';
    if (running || idle) this.visualTime += delta;
    if (running) {
      advanceGame(this.game, delta);
      this.consumeEvents();
    }
    const gathered = this.game.gathering ? salvoSize(this.game) : 0;
    if (gathered > this.lastGathered)
      this.audio.play({
        type: 'shot',
        position: [0, 0, 0],
        points: 0,
        power: gathered / 6,
      });
    this.lastGathered = gathered;
    this.sculpture.update(this.game, this.visualTime, this.motion.matches);
    const recoilAge = this.visualTime - this.recoilAt;
    const recoil = this.motion.matches
      ? 0
      : Math.exp(-recoilAge * 14) * this.recoilPower;
    // Presentation-only recoil stays below three CSS pixels. Aim and target
    // hit areas remain stable while the camera settles after contact.
    this.camera.position.x = Math.sin(recoilAge * 48) * recoil * 0.022;
    this.camera.position.y = Math.sin(recoilAge * 34) * recoil * 0.016;
    this.renderer.render(this.scene, this.camera);
    this.camera.position.set(0, 0, 9);
    Object.assign(this.canvas.dataset, {
      phase: this.game.phase,
      time: this.game.time.toFixed(3),
      pressure: this.game.pressure.toFixed(2),
      hits: String(this.game.hits),
      ruptures: String(this.game.ruptures),
      shots: String(this.game.shots),
      score: String(this.game.score),
      missiles: String(this.game.missiles.filter((m) => m.active).length),
      selected: String(this.game.selected),
      gathering: String(this.game.gathering),
      charge: this.game.charge.toFixed(3),
      salvo: String(salvoSize(this.game)),
      blocked: String(this.game.blocked),
      followups: String(this.game.followups),
      reduced: String(this.motion.matches),
      drawCalls: String(this.renderer.info.render.calls),
      pixels: `${this.canvas.width}×${this.canvas.height}`,
    });
    if (now - this.reportTime > 33) {
      this.reportTime = now;
      this.report();
    }
    if ((running || idle) && interval > 27) this.slowFrames++;
    else this.slowFrames = Math.max(0, this.slowFrames - 1);
    if (this.slowFrames > 120 && this.quality > 0.65) {
      this.quality = Math.max(0.65, this.quality - 0.12);
      this.slowFrames = 0;
      this.resize();
    }
    // Essential gameplay continues with decorative motion reduced. The shared
    // loop still owns RAF, visibility and disposal; there is no second loop.
    if (this.game.phase === 'playing' && this.motion.matches)
      this.loop?.invalidate();
  };
  private resize = (): void => {
    if (this.disposed) return;
    this.updateSizes();
    const { width, height } = this.sizes;
    if (!width || !height) return;
    const aspect = width / height,
      half = 2.5;
    this.camera.left = -half * Math.max(1, aspect);
    this.camera.right = -this.camera.left;
    this.camera.top = half * Math.max(1, 1 / aspect);
    this.camera.bottom = -this.camera.top;
    this.camera.updateProjectionMatrix();
    const ratio =
      Math.min(
        1.5,
        window.devicePixelRatio || 1,
        Math.sqrt(1_300_000 / (width * height))
      ) * this.quality;
    this.renderer?.setPixelRatio(ratio);
    this.renderer?.setSize(width, height, false);
    this.loop?.invalidate();
  };
  public dispose(): void {
    if (this.disposed) return;
    this.cancel();
    this.disposed = true;
    this.loop?.dispose();
    this.resizeObserver?.disconnect();
    this.visibilityObserver?.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('blur', this.pause);
    window.removeEventListener('keyup', this.keyUp);
    window.removeEventListener('orientationchange', this.pause);
    this.canvas.removeEventListener('webglcontextlost', this.contextLost);
    this.motion.removeEventListener('change', this.motionChanged);
    this.audio.dispose();
    this.sculpture?.dispose();
    this.scene.clear();
    this.renderer?.dispose();
  }
}
