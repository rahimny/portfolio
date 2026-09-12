import { Pane, type FolderApi } from 'tweakpane';
import {
  COLOR_KEYS,
  DEFAULT_SETTINGS,
  LIMITS,
  STRUCTURAL_KEYS,
  parseRecipe,
  serializeRecipe,
  type MedusaSettings,
} from '@/features/medusa/settings';
import { PALETTES } from './OilPainter';

interface StudioActions {
  change: (rebuild: boolean) => Promise<void>;
  step: () => void;
  grow: () => void;
  finish: () => void;
  current: () => void;
  resetCamera: () => void;
  print: () => Promise<void>;
}

/** Owns only the editor; rendering state remains in the experience. */
export class MedusaStudio {
  private pane: Pane;
  private file = document.createElement('input');
  private disposed = false;
  private status = { message: 'Ready to explore' };
  private settings: MedusaSettings;
  private actions: StudioActions;
  constructor(
    container: HTMLElement,
    settings: MedusaSettings,
    actions: StudioActions
  ) {
    this.settings = settings;
    this.actions = actions;
    this.pane = new Pane({ container, title: 'PAINTING STUDIO' });
    const numeric = (
      folder: FolderApi,
      key: keyof typeof LIMITS,
      label: string
    ) => {
      const [min, max, step] = LIMITS[key];
      const binding = folder.addBinding(settings, key, {
        label,
        min,
        max,
        step,
      });
      binding.element.querySelector('input')?.setAttribute('aria-label', label);
      binding.on('change', (event) => {
        if (STRUCTURAL_KEYS.has(key) && !event.last) return;
        void this.apply(STRUCTURAL_KEYS.has(key));
      });
    };
    const button = (
      folder: FolderApi | Pane,
      title: string,
      action: () => void
    ) => folder.addButton({ title }).on('click', action);
    const specimen = this.pane.addFolder({ title: 'Specimen', expanded: true });
    numeric(specimen, 'seed', 'Seed');
    button(specimen, 'New specimen', () => {
      settings.seed = crypto.getRandomValues(new Uint32Array(1))[0];
      void this.apply(true);
    });
    const emergence = this.pane.addFolder({
      title: 'Emergence',
      expanded: false,
    });
    emergence
      .addBinding(settings, 'growOnCreation', { label: 'Grow on creation' })
      .on('change', () => {
        if (!settings.growOnCreation) actions.finish();
        void this.apply(false);
      });
    numeric(emergence, 'growthDuration', 'Growth duration');
    button(emergence, 'Replay growth', () => {
      actions.grow();
      this.pane.refresh();
    });
    button(emergence, 'Finish growth', actions.finish);
    const anatomy = this.pane.addFolder({ title: 'Anatomy', expanded: false });
    for (const [key, label] of [
      ['width', 'Bell width'],
      ['dome', 'Dome height'],
      ['lobes', 'Rim lobes'],
      ['scallop', 'Scallop depth'],
      ['arms', 'Oral arms'],
      ['armLength', 'Arm length'],
      ['tentacles', 'Tentacle count'],
      ['tentacleLength', 'Tentacle length'],
      ['density', 'Paint density'],
    ] as const)
      numeric(anatomy, key, label);
    const paint = this.pane.addFolder({ title: 'Brushwork', expanded: true });
    const style = paint.addBinding(settings, 'brushStyle', {
      label: 'Brush',
      options: {
        'Broken oil': 0,
        'Round scumble': 1,
        Pointillist: 2,
        'Dry hatch': 3,
      },
    });
    style.element.querySelector('select')?.setAttribute('aria-label', 'Brush');
    style.on('change', () => void this.apply(true));
    for (const [key, label] of [
      ['brushSize', 'Brush size'],
      ['aspect', 'Stroke aspect'],
      ['distortion', 'View distortion'],
      ['paintMotion', 'Paint breathing'],
      ['grain', 'Grain'],
      ['cutoff', 'Bristle breakup'],
      ['armWidth', 'Ribbon width'],
      ['folds', 'Ribbon folds'],
    ] as const)
      numeric(paint, key, label);
    const pigment = this.pane.addFolder({
      title: 'Pigment & light',
      expanded: false,
    });
    const palette = pigment.addBinding(settings, 'palette', {
      label: 'Palette',
      options: Object.fromEntries(PALETTES.map((p, i) => [p.name, i])),
    });
    palette.element
      .querySelector('select')
      ?.setAttribute('aria-label', 'Palette');
    palette.on('change', () => {
      const preset = PALETTES[settings.palette];
      for (const key of COLOR_KEYS) settings[key] = preset[key];
      void this.apply(false);
    });
    const labels = {
      dark: 'Shadow',
      mid: 'Body pigment',
      pale: 'Highlight',
      edge: 'Rim pigment',
      ground: 'Ground',
      light: 'Ground light',
    };
    for (const key of COLOR_KEYS)
      pigment
        .addBinding(settings, key, { label: labels[key] })
        .on('change', () => void this.apply(false));
    for (const [key, label] of [
      ['contrast', 'Contrast'],
      ['rimLight', 'Pearl edges'],
      ['depthSoftness', 'Depth softness'],
      ['atmosphere', 'Painted light pool'],
      ['lightX', 'Light horizontal'],
      ['lightZ', 'Light depth'],
    ] as const)
      numeric(pigment, key, label);
    const motion = this.pane.addFolder({ title: 'Movement', expanded: true });
    motion
      .addBinding(settings, 'paused', { label: 'Hold motion' })
      .on('change', () => void this.apply(false));
    for (const [key, label] of [
      ['rate', 'Swimming pace'],
      ['pulseAmount', 'Contraction'],
      ['current', 'Cross-current'],
      ['turbulence', 'Turbulence'],
      ['drag', 'Water drag'],
      ['suspension', 'Buoyancy'],
    ] as const)
      numeric(motion, key, label);
    button(motion, 'Step +0.1s', actions.step);
    button(motion, 'Send a current', actions.current);
    const camera = this.pane.addFolder({ title: 'Camera', expanded: false });
    camera
      .addBinding(settings, 'rotating', { label: 'Slow turn' })
      .on('change', () => void this.apply(false));
    for (const [key, label] of [
      ['turnSpeed', 'Turn speed'],
      ['tilt', 'Specimen tilt'],
      ['zoom', 'Zoom'],
    ] as const)
      numeric(camera, key, label);
    button(camera, 'Reset view', () => {
      settings.zoom = 1;
      actions.resetCamera();
      void this.apply(false);
    });
    const recipes = this.pane.addFolder({
      title: 'Recipes & export',
      expanded: true,
    });
    button(
      recipes,
      'Save print',
      () => void this.run(actions.print, 'Print saved')
    );
    button(recipes, 'Export recipe', () => {
      const url = URL.createObjectURL(
        new Blob([serializeRecipe(settings)], { type: 'application/json' })
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = `medusa-${settings.seed}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    button(recipes, 'Import recipe', () => this.file.click());
    button(recipes, 'Reset all settings', () => {
      Object.assign(settings, DEFAULT_SETTINGS);
      actions.resetCamera();
      void this.apply(true);
    });
    this.file.type = 'file';
    this.file.accept = '.json,application/json';
    this.file.hidden = true;
    this.file.setAttribute('aria-label', 'Import Medusa recipe');
    container.append(this.file);
    this.file.addEventListener('change', this.importFile);
    this.pane.addBinding(this.status, 'message', {
      label: 'Status',
      readonly: true,
      multiline: true,
      rows: 2,
    });
    // Tweakpane does not link its visual labels to all native inputs.
    for (const row of container.querySelectorAll('.tp-lblv')) {
      const label = row.querySelector('.tp-lblv_l')?.textContent;
      if (label)
        for (const input of row.querySelectorAll('input, select, textarea'))
          input.setAttribute('aria-label', label);
    }
  }
  private async run(action: () => Promise<void>, message: string) {
    this.pane.disabled = true;
    this.status.message = 'Preparing painting…';
    this.pane.refresh();
    try {
      await action();
      this.status.message = message;
    } catch (error) {
      this.status.message =
        error instanceof Error
          ? error.message
          : 'Could not update the painting.';
    } finally {
      if (!this.disposed) {
        this.pane.disabled = false;
        this.pane.refresh();
      }
    }
  }
  private async apply(rebuild: boolean) {
    if (rebuild)
      await this.run(() => this.actions.change(true), 'Specimen painted');
    else {
      await this.actions.change(false);
      if (!this.disposed) this.pane.refresh();
    }
  }
  private importFile = async () => {
    const file = this.file.files?.[0];
    this.file.value = '';
    if (!file) return;
    await this.run(async () => {
      if (file.size > 64_000)
        throw new Error('Recipe must be smaller than 64 KB.');
      const recipe = parseRecipe(JSON.parse(await file.text()));
      if (this.disposed) return;
      Object.assign(this.settings, recipe);
      this.actions.resetCamera();
      await this.actions.change(true);
    }, 'Recipe loaded');
  };
  dispose() {
    this.disposed = true;
    this.file.removeEventListener('change', this.importFile);
    this.file.remove();
    this.pane.dispose();
  }
}
