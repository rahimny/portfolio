/**
 * Resolve a CSS colour to linear-free sRGB floats for a shader uniform.
 *
 * The palette is authored in oklch (tokens.css), and `getComputedStyle` hands
 * oklch back as oklch — there is nothing to parse into RGB without shipping a
 * colour-space conversion. Painting one pixel and reading it back makes the
 * browser do the conversion it was always going to do, so the particles are
 * exactly the ink the rest of the page is set in, whatever syntax the token
 * happens to use next year.
 */
const probe = document.createElement('canvas');
probe.width = 1;
probe.height = 1;

const cache = new Map<string, readonly [number, number, number]>();

export function cssColorToRgb(
  color: string,
  fallback: readonly [number, number, number] = [0, 0, 0]
): readonly [number, number, number] {
  const cached = cache.get(color);
  if (cached) return cached;

  const ctx = probe.getContext('2d', { willReadFrequently: true });
  if (!ctx) return fallback;

  ctx.clearRect(0, 0, 1, 1);
  // An unparseable value leaves `fillStyle` at whatever it was, so it is parked
  // on transparent first: a colour the browser rejected then paints nothing and
  // is distinguishable from one that genuinely painted black.
  ctx.fillStyle = 'transparent';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);

  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  // A colour the browser could not parse leaves the pixel untouched, which is
  // transparent rather than black — distinguishable, unlike a black result.
  const rgb: readonly [number, number, number] =
    a === 0 ? fallback : [r / 255, g / 255, b / 255];

  cache.set(color, rgb);
  return rgb;
}

/**
 * Resolve a design token to RGB, through the property that actually uses it.
 *
 * Reading `--ink` off `getComputedStyle` returns whatever the token was
 * authored as, which may still be a `var()` chain. Assigning it to a real
 * `color` on a throwaway child makes the cascade do the substitution first, so
 * this works for `--fg: var(--ink)` as readily as for a literal.
 */
export function tokenToRgb(
  host: Element,
  property: string,
  fallback?: readonly [number, number, number]
): readonly [number, number, number] {
  const probeEl = document.createElement('span');
  probeEl.style.cssText = `display:none;color:var(${property})`;
  host.appendChild(probeEl);
  const used = getComputedStyle(probeEl).color;
  probeEl.remove();
  return cssColorToRgb(used, fallback);
}
