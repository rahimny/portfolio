import { Pane } from 'tweakpane';
import {
  materialName,
  DEFAULT_SETTINGS,
  MATERIALS,
  SETTINGS_KEY,
  SETTING_LIMITS,
  type PressureSettings,
  type MaterialName,
} from '@/features/pressure-type/settings';

export class PressureTuner {
  private readonly pane: Pane;
  private readonly look: { material: MaterialName | 'Custom' };
  private readonly settings: PressureSettings;
  private markUnsaved?: () => void;
  constructor(
    container: HTMLElement,
    settings: PressureSettings,
    change: (physics: boolean) => void
  ) {
    this.pane = new Pane({ title: 'Pressure studio', container });
    this.settings = settings;
    const look = (this.look = { material: materialName(settings) });
    const skin = this.pane
      .addBinding(look, 'material', {
        label: 'Skin',
        options: {
          Ink: 'Ink',
          Porcelain: 'Porcelain',
          Mercury: 'Mercury',
          Custom: 'Custom',
        },
      })
      .on('change', () => {
        if (look.material !== 'Custom')
          Object.assign(settings, MATERIALS[look.material]);
        this.refresh();
        change(false);
      });
    skin.element.querySelector('select')?.setAttribute('aria-label', 'Skin');
    const material = this.pane.addFolder({ title: 'Material', expanded: true });
    const pigment = material
      .addBinding(settings, 'color', { label: 'Pigment', view: 'color' })
      .on('change', () => {
        this.refresh();
        change(false);
      });
    pigment.element.querySelectorAll('input').forEach((input, index) => {
      input.setAttribute(
        'aria-label',
        ['Pigment', 'Red', 'Green', 'Blue'][index] ?? 'Colour channel'
      );
    });
    const lighting = this.pane.addFolder({
      title: 'Light & reflection',
      expanded: false,
    });
    const camera = this.pane.addFolder({ title: 'Camera', expanded: false });
    const motion = this.pane.addFolder({ title: 'Response', expanded: false });
    const labels: Partial<Record<keyof PressureSettings, string>> = {
      metalness: 'Metal',
      roughness: 'Roughness',
      coat: 'Clear coat',
      coatRoughness: 'Coat blur',
      exposure: 'Exposure',
      environment: 'Reflections',
      lightAngle: 'Studio rotation',
      key: 'Key light',
      shadow: 'Shadow density',
      shadowSoftness: 'Shadow softness',
      yaw: 'Turn',
      pitch: 'Elevation',
      zoom: 'Scale',
      hitStrength: 'Impact',
      lift: 'Buoyancy',
      drag: 'Air drag',
      tether: 'Tether tension',
      softness: 'Skin compliance',
      fairing: 'Skin smoothing',
      burstAt: 'Burst threshold',
    };
    const groups = [
      [material, ['metalness', 'roughness', 'coat', 'coatRoughness'], false],
      [
        lighting,
        [
          'exposure',
          'environment',
          'lightAngle',
          'key',
          'shadow',
          'shadowSoftness',
        ],
        false,
      ],
      [camera, ['yaw', 'pitch', 'zoom'], false],
      [
        motion,
        [
          'hitStrength',
          'lift',
          'drag',
          'tether',
          'softness',
          'fairing',
          'burstAt',
        ],
        true,
      ],
    ] as const;
    for (const [folder, keys, physics] of groups)
      for (const key of keys) {
        const [min, max] = SETTING_LIMITS[key];
        const binding = folder
          .addBinding(settings, key, {
            label: labels[key],
            min,
            max,
            step: key === 'fairing' ? 0.005 : 0.01,
          })
          .on('change', () => {
            this.refresh();
            change(physics);
          });
        binding.element
          .querySelector('input')
          ?.setAttribute('aria-label', labels[key] ?? key);
      }
    const save = this.pane.addButton({ title: 'Save settings on this device' });
    this.markUnsaved = () => {
      save.title = 'Save settings on this device';
    };
    save.on('click', () => {
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        save.title = 'Settings saved';
      } catch {
        save.title = 'Storage unavailable — export instead';
      }
    });
    this.pane.addButton({ title: 'Export settings · JSON' }).on('click', () => {
      const link = document.createElement('a');
      const url = URL.createObjectURL(
        new Blob([JSON.stringify({ version: 1, settings }, null, 2)], {
          type: 'application/json',
        })
      );
      link.href = url;
      link.download = 'pressure-type-studio.json';
      link.click();
      URL.revokeObjectURL(url);
    });
    this.pane
      .addButton({ title: 'Restore studio defaults' })
      .on('click', () => {
        Object.assign(settings, DEFAULT_SETTINGS);
        try {
          localStorage.removeItem(SETTINGS_KEY);
        } catch {
          /* Storage is optional. */
        }
        this.refresh();
        change(true);
      });
  }
  refresh() {
    this.markUnsaved?.();
    this.look.material = materialName(this.settings);
    this.pane.refresh();
  }
  dispose() {
    this.pane.dispose();
  }
}
