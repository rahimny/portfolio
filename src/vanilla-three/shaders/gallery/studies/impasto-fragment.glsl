precision highp float;
varying vec2 vUv;
uniform vec2 uResolution;
uniform float uClock, uSeed, uFocusX, uFocusY;
uniform float uLoad, uSplay, uWet, uBrush;

const float TAU = 6.28318530718;
// Four depth slabs. The picture is an arrangement of marks in space, not a
// texture: near slabs occlude far ones and shift further under the pointer.
const int LAYERS = 4;

vec3 hash3(vec2 cell, float stream) {
  vec3 p = fract(vec3(cell.xyx) * vec3(0.1031, 0.1030, 0.0973) + stream);
  p += dot(p, p.yzx + 33.33);
  return fract((p.xxy + p.yzz) * p.zyx);
}

float hash1(vec2 cell, float stream) {
  return fract(sin(dot(cell, vec2(12.9898, 78.233)) + stream * 43.17) * 43758.5453);
}

// The subject. Three slow masses give the field something to be about: marks
// crowd onto them, the brush wraps around them, and the ground is left bare
// where there is nothing. `grad` comes out analytically, so the direction the
// paint follows is the form's own tangent rather than a second sample.
float massField(vec2 p, float t, out vec2 grad) {
  grad = vec2(0.0);
  float total = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float a = uSeed * 1.7 + fi * 2.39;
    vec2 centre = vec2(cos(a), sin(a * 1.3)) * (0.30 + 0.55 * fract(uSeed * 0.37 + fi * 0.31))
                + 0.13 * vec2(sin(t * 0.09 + fi), cos(t * 0.07 - fi));
    float k = 1.35 + 0.95 * fract(uSeed * 0.71 + fi * 0.53);
    vec2 d = p - centre;
    float g = exp(-dot(d, d) * k);
    total += g;
    grad += -2.0 * k * d * g;
  }
  return total;
}

// The armature. Nothing places a stroke by hand: a smooth field decides where
// every mark points, the masses turn it so the brush follows the form, and the
// pointer bends the whole thing into a local circulation.
vec2 flowDir(vec2 p, float t, float phase, vec2 grad) {
  float a = 1.9 * (sin(p.x * 0.9 + t * 0.21 + phase) * cos(p.y * 0.8 - t * 0.17)
          + 0.5 * sin(p.y * 1.7 - t * 0.13 + 1.7 + phase * 1.7) * cos(p.x * 1.5 + t * 0.11));
  vec2 dir = vec2(cos(a), sin(a));
  float slope = length(grad);
  vec2 wrap = vec2(-grad.y, grad.x) / max(slope, 1e-5);
  dir = normalize(mix(dir, wrap, smoothstep(0.06, 0.55, slope) * 0.78));
  vec2 d = p - vec2(uFocusX, uFocusY) * 1.35;
  float pull = exp(-dot(d, d) * 2.4);
  vec2 swirl = normalize(vec2(-d.y, d.x) + vec2(1e-4));
  return normalize(mix(dir, swirl, pull * 0.88));
}

vec3 familyHue() {
  return 0.5 + 0.5 * cos(TAU * (fract(uSeed * 0.6180) + vec3(0.0, 0.28, 0.56)));
}

// Broad tonal structure. Without it the marks tile evenly and the result is
// wallpaper; with it, light and dark passages collect and a viewer can measure
// one part of the picture against another.
float valueField(vec2 p) {
  float a = sin(p.x * 0.61 + 1.15 * sin(p.y * 0.44 + uSeed * 1.7) + uSeed * 3.1);
  float b = cos(p.y * 0.53 - 0.90 * sin(p.x * 0.38 - uSeed * 2.3));
  return clamp(0.5 + 0.32 * a + 0.22 * b, 0.0, 1.0);
}

// One pigment family, worked mostly in tone. Value contrast is what makes a
// painting read; hue barely drifts, and the complement is rationed to roughly
// one mark in twelve so the field keeps a single colour event.
// The tonal ramp of one pigment family: chromatic dark, body colour, warm tint.
vec3 pigmentTone(float drift, float tone) {
  vec3 hue = 0.5 + 0.5 * cos(TAU * (fract(uSeed * 0.6180 + drift) + vec3(0.0, 0.28, 0.56)));
  vec3 deep = pow(hue, vec3(2.6)) * 0.22 + vec3(0.010, 0.009, 0.014);
  vec3 body = pow(hue, vec3(1.25)) * 0.62;
  vec3 tint = mix(pow(hue, vec3(0.70)), vec3(1.0, 0.92, 0.78), 0.50) * 0.80;
  // Weighted toward the darker end: light passages earn their place by being rare.
  float t = pow(clamp(tone, 0.0, 1.0), 1.35);
  return t < 0.5
    ? mix(deep, body, smoothstep(0.0, 1.0, t * 2.0))
    : mix(body, tint, smoothstep(0.0, 1.0, (t - 0.5) * 2.0));
}

vec3 pigment(float key, float tone, float depth) {
  // Broken colour: the family holds, but no two neighbouring marks are quite
  // the same pigment, and the passage carries the oldest trick in painting —
  // lights drift warm, shadows drift cool.
  vec3 col = pigmentTone(0.085 * (fract(key) - 0.5) + 0.085 * (tone - 0.5), tone);
  // The complement collects in the darker passages, where it reads as one
  // colour event rather than as confetti over the whole field.
  float accent = step(0.952 - 0.035 * (1.0 - tone), fract(key * 7.31 + uSeed * 0.29));
  vec3 hot = 0.5 + 0.5 * cos(TAU * (fract(uSeed * 0.6180) + 0.47 + vec3(0.0, 0.30, 0.62)));
  col = mix(col, pow(hot, vec3(1.15)) * 0.80, accent * 0.82);
  // Some marks are nearly neutral. A painting without greys is a poster.
  float chroma = 0.34 + 0.66 * fract(key * 3.71 + 0.37);
  col = mix(vec3(dot(col, vec3(0.30, 0.46, 0.24))), col, 0.42 + 0.58 * chroma);
  // Aerial perspective: far slabs sink toward the ground they sit on.
  return mix(col * 0.38, col, 0.26 + 0.74 * depth);
}

// Bare linen, visible wherever the brush never reached.
vec3 ground(vec2 p) {
  float grain = hash1(floor(p * 190.0), 3.0) * 0.5 + hash1(floor(p * 61.0), 9.0) * 0.5;
  vec3 linen = vec3(0.072, 0.062, 0.052) * (0.74 + 0.46 * grain);
  // The ground is not neutral: it is the first thin wash of the same family,
  // so bare canvas belongs to the picture instead of interrupting it.
  return linen * (0.42 + 0.52 * valueField(p))
       + pow(familyHue(), vec3(3.0)) * 0.030;
}

// A scrubbed imprimatura: thin paint dragged along the armature, covering the
// linen before any mark is laid. Chasing full coverage with capsules alone
// leaves the ground showing through as bare board, which no painting does.
vec3 underpainting(vec2 p, float t) {
  vec2 grad;
  float mass = massField(p, t, grad);
  float v = clamp(valueField(p) * 0.62 + mass * 0.45, 0.0, 1.0);
  vec2 d = flowDir(p, t, 0.0, grad);
  float streak = 0.5 + 0.5 * sin(dot(p, vec2(-d.y, d.x)) * 23.0)
               * (0.4 + 0.6 * hash1(floor(p * 9.0), 4.2));
  // Continuous, so it takes the tonal ramp alone: per-mark accents and chroma
  // jitter are step functions, and a step function over a smooth field is a band.
  vec3 thin = pigmentTone(0.03 * v - 0.015, v * 0.34 + 0.02) * 0.34;
  // Dull and dark: an imprimatura is something to paint over, not a background
  // the marks have to fight.
  thin = mix(vec3(dot(thin, vec3(0.30, 0.46, 0.24))), thin, 0.55);
  return mix(ground(p), thin * (0.78 + 0.34 * streak), 0.90);
}

/**
 * One loaded brush mark.
 *
 * The stroke is a capsule laid along the flow field, but it bends with the
 * field rather than running straight, and the paint inside it is per-bristle:
 * every bristle carries its own charge and runs dry at its own point along the
 * stroke, which is what leaves the tail ragged. `ridge` returns thickness
 * rather than colour — the lighting is built from it afterwards.
 */
float mark(vec2 p, vec2 cell, float size, float depth, float t, float px,
           out float order, out vec3 pig, out float ridge) {
  order = -1.0;
  pig = vec3(0.0);
  ridge = 0.0;

  vec3 h = hash3(cell, depth * 3.31 + uSeed * 7.13 + 0.5);
  float h4 = hash1(cell, depth * 11.7 + uSeed * 2.9);
  vec2 centre = (cell + 0.5 + (h.xy - 0.5) * 0.56) * size;
  vec2 grad;
  float mass = massField(centre, t, grad);
  // Scale hierarchy, and a subject: the far slabs are a continuous underpainting
  // and the near one thins to a few large marks, while every slab crowds onto
  // the masses. An evenly dense stack of four hides its own largest strokes.
  float presence = clamp(0.26 + 0.90 * mass, 0.10, 1.0);
  if (hash1(cell + 7.7, depth * 2.31 + uSeed * 1.13) > mix(0.98, 0.55, depth) * presence)
    return 0.0;
  // Each slab reads the armature at its own phase, so the slabs do not all
  // comb in the same direction; only the pointer's circulation is shared.
  vec2 dir = flowDir(centre, t, depth * 2.1, grad);
  // Scatter keeps the field from reading as a comb; splay widens it, because a
  // ragged brush is held less precisely than a sable one.
  float scatter = (h.z - 0.5) * (0.34 + uSplay * 0.80);
  float cs = cos(scatter), sn = sin(scatter);
  dir = vec2(cs * dir.x - sn * dir.y, sn * dir.x + cs * dir.y);

  // Short dabs among long drags: one brush size does not make a painting, and
  // a dab is held flatter than a drag, so width runs against reach.
  float reach = mix(0.34, 1.02, h4 * h4);
  float half_ = size * reach * (0.84 + 0.26 * uLoad);
  // The far slabs are scrubbed in broad and cover the ground; the near slab is
  // slim and deliberate. One brush width for all four reads as decoration.
  float width = size * (0.115 + 0.125 * h.y) * mix(1.45, 0.82, reach)
              * mix(1.55, 0.95, depth);

  vec2 q = p - centre;
  vec2 local = vec2(dot(q, dir), dot(q, vec2(-dir.y, dir.x)));
  float u = local.x / half_;
  if (abs(u) > 1.06) return 0.0;

  // The spine follows the armature: sampling the field a step further along
  // gives the turn rate, and the mark arcs by it. A straight capsule on a
  // lattice reads as masonry, not as a brush being dragged.
  vec2 aheadPoint = centre + dir * half_ * 0.62;
  vec2 aheadGrad;
  massField(aheadPoint, t, aheadGrad);
  vec2 ahead = flowDir(aheadPoint, t, depth * 2.1, aheadGrad);
  float turn = dir.x * ahead.y - dir.y * ahead.x;
  float bend = clamp(turn / max(half_ * 0.62, 1e-4), -6.0, 6.0);
  float offset = local.y - 0.5 * bend * local.x * local.x;

  // Pressure in at the heel, pigment out at the tip. How far the paint carries
  // is the Load control, so a starved brush leaves a shorter, thinner mark.
  float charge = -0.62 + 1.62 * uLoad * (0.42 + 0.58 * h.z);
  float head = smoothstep(-1.02, -0.80, u);
  float run = 1.0 - smoothstep(charge - 0.34, charge + 0.30, u);
  float body = head * run;
  if (body < 0.004) return 0.0;

  // Both ends taper: the brush lands and lifts, it does not stop square. How
  // blunt that is varies per mark, or every stroke resolves to the same leaf.
  float taper = sqrt(max(0.0, 1.0 - pow(abs(u), mix(1.5, 4.0, h.y))));
  float w = width * max(taper, 0.06) * (0.60 + 0.40 * body);
  float v = offset / max(w, 1e-5);
  if (abs(v) > 1.3) return 0.0;

  // Softness is held in domain units, not pixels, so the bristle edge — and the
  // slope the lighting reads from it — stays the same at any resolution.
  float soft = clamp(px * 1.4 / max(w, 1e-5), 0.06, 0.9);
  float across = 1.0 - smoothstep(1.0 - soft, 1.0, abs(v));

  float bristles = floor(mix(3.0, 9.0, uSplay) + 0.5) + 1.0;
  float s = (v * 0.5 + 0.5) * bristles;
  float rib = 0.5 + 0.5 * cos(fract(s) * TAU);
  // The lighting differentiates the paint height in screen space, so any ridge
  // finer than a few pixels returns a quad-sized checker instead of a bristle.
  // Resolve the ridges only once they are wide enough to survive that.
  float period = (2.0 * w / bristles) / px;
  rib = mix(0.5, rib, smoothstep(3.0, 7.5, period));
  // Separation only appears as the brush splays; at zero the mark is one body.
  float gapSoft = clamp(soft * bristles * 0.5, 0.08, 0.6);
  float ribCover = 0.5 + 0.5 * cos(fract(s) * TAU);
  // A gap thinner than a pixel cannot be drawn; closing it is honest, and it
  // keeps the height field free of sub-pixel holes.
  float separated = mix(1.0,
    smoothstep(uSplay * 0.40 - gapSoft, uSplay * 0.40 + gapSoft, ribCover),
    smoothstep(1.3, 3.2, period));
  // Each bristle runs dry at its own point along the stroke, which is what
  // leaves the tail ragged — but once bristles are too fine to resolve, their
  // ensemble is a single soft dry-out. Keeping the per-bristle version there
  // would put pixel-frequency structure into the height the lighting reads.
  float charged = hash1(cell * 3.0 + floor(s), depth * 5.0 + uSeed);
  float perBristle = 1.0 - smoothstep(charged * 1.9 - 1.0, charged * 1.9 - 0.55, u);
  float ensemble = 1.0 - smoothstep(-0.78, 1.12, u);
  float alive = mix(ensemble, perBristle, smoothstep(1.3, 3.2, period));

  float coverage = clamp(across * body * mix(1.0, separated, uSplay) * alive, 0.0, 1.0);
  if (coverage < 0.004) return 0.0;

  order = h.x * 0.62 + h.z * 0.38;
  // Tone is mostly the passage the mark falls in, with enough per-mark scatter
  // that no passage flattens into a single colour.
  float tone = clamp(valueField(centre) * 0.34 + mass * 0.40
                   + fract(h.z * 3.17 + h4 * 0.61) * 0.66 - 0.16, 0.0, 1.0);
  pig = pigment(h.y + floor(cell.x) * 0.013 - floor(cell.y) * 0.017, tone, depth);
  // Thickness follows the bristles: the ridges are where the paint stands up.
  ridge = coverage * uLoad * (0.70 + 0.30 * rib) * (0.55 + 0.45 * body);
  return coverage;
}

void main() {
  float aspect = uResolution.x / uResolution.y;
  vec2 screen = (vUv * 2.0 - 1.0) * vec2(aspect, 1.0) / min(aspect, 1.0);
  float px = max(fwidth(screen.x), 1e-5);
  float t = uClock;
  vec2 force = vec2(uFocusX, uFocusY);

  vec3 canvas = underpainting(screen, t);
  float painted = 0.0;
  float height = 0.0;

  for (int layer = 0; layer < LAYERS; layer++) {
    float depth = float(layer) / float(LAYERS - 1);
    float size = uBrush * mix(0.105, 0.255, depth);
    // Parallax: the near slabs travel further under the pointer than the far
    // ones, so moving reveals the picture was never flat.
    vec2 p = screen * mix(1.07, 1.0, depth)
           + force * (depth - 0.42) * 0.17
           + vec2(0.021 * t * (0.35 + depth), -0.013 * t * (0.2 + depth));
    vec2 base = floor(p / size);

    // Two slots, kept in paint order. Within a slab the later mark covers the
    // earlier one, and the earlier one still shows through its bristle gaps.
    float topOrder = -1.0, topCover = 0.0, topRidge = 0.0;
    float lowOrder = -1.0, lowCover = 0.0, lowRidge = 0.0;
    vec3 topPig = vec3(0.0), lowPig = vec3(0.0);

    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        float order, ridge;
        vec3 pig;
        float cover = mark(p, base + vec2(float(i), float(j)), size, depth, t, px, order, pig, ridge);
        if (cover <= 0.0) continue;
        if (order > topOrder) {
          lowOrder = topOrder; lowCover = topCover; lowPig = topPig; lowRidge = topRidge;
          topOrder = order; topCover = cover; topPig = pig; topRidge = ridge;
        } else if (order > lowOrder) {
          lowOrder = order; lowCover = cover; lowPig = pig; lowRidge = ridge;
        }
      }
    }

    // Wet paint lifts what is under it, so the palette is a consequence of the
    // order marks were laid down in — not a colour chosen per stroke.
    if (lowCover > 0.0) {
      canvas = mix(canvas, mix(lowPig, canvas, uWet * 0.62 * painted), lowCover);
      painted = mix(painted, 1.0, lowCover);
      height += lowCover * lowRidge;
    }
    if (topCover > 0.0) {
      canvas = mix(canvas, mix(topPig, canvas, uWet * 0.62 * painted), topCover);
      painted = mix(painted, 1.0, topCover);
      height += topCover * topRidge;
    }
  }

  // Thickness becomes surface: screen-space derivatives of the accumulated
  // paint height give the impasto normal without a second sampling pass.
  vec2 slope = clamp(vec2(dFdx(height), dFdy(height)) / px, vec2(-100.0), vec2(100.0));
  vec3 n = normalize(vec3(-slope * 0.0042, 1.0));
  vec3 lightDir = normalize(vec3(-0.50, 0.66, 0.62));
  vec3 halfway = normalize(lightDir + vec3(0.0, 0.0, 1.0));
  float diffuse = 0.56 + 0.50 * max(dot(n, lightDir), 0.0);
  float spec = pow(max(dot(n, halfway), 0.0), 24.0) * 0.16 * smoothstep(0.02, 0.30, height);
  // Paint sits in its own shadow where it is thin; the ground stays flat.
  float occlusion = mix(1.0, 0.80 + 0.20 * smoothstep(0.0, 0.55, height), 0.72 * painted);

  vec3 color = canvas * diffuse * occlusion + spec * vec3(1.0, 0.95, 0.88) * (0.35 + 0.65 * painted);
  float vignette = 1.0 - smoothstep(0.80, 1.34, length(screen * vec2(0.86, 1.0)));
  color *= 0.30 + 0.70 * vignette;
  color = 1.0 - exp(-max(color, 0.0) * 1.45);
  gl_FragColor = vec4(pow(color, vec3(1.0 / 2.2)), 1.0);
}
