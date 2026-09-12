// Five-fold: the smallest symmetry that cannot tile the plane periodically.
#define WAVES 5

uniform float uTime;
uniform vec2 uResolution;
uniform vec2 uMouse;

uniform float uZoom;
uniform float uPlanScale;
/**
 * The five wave vectors, unit length, 72 degrees apart, rotated by the
 * programme's field phase. Built once per frame on the CPU rather than per
 * cell: deriving them in here cost ten transcendentals for every one the field
 * actually needed, and the field is evaluated for every cell of every ray.
 */
uniform vec2 uWaves[WAVES];
uniform float uPlaza;
uniform float uStoreys;
uniform float uStoreyHeight;
uniform float uStreet;
uniform float uTypology;
uniform float uMast;
uniform float uSun;
uniform float uStroke;
uniform float uFloorLines;
uniform float uGridLines;
uniform float uShadow;
uniform float uHaze;
uniform vec2 uPan;
uniform float uInfluence;
uniform float uPointer;
uniform float uSuper;
uniform float uInvert;
uniform vec3 uPaper;
uniform vec3 uInk;
uniform vec3 uBrand;

varying vec2 vUv;

#include ../../utils/math.glsl;
#include ../../utils/hash.glsl;

// The ray descends from a ceiling plane above the tallest mast, so the number
// of blocks it can cross before reaching the ground is bounded by the skyline
// rather than by the viewport. 64 covers the extremes the sliders allow.
#define MAX_CELLS 64
#define SHADOW_CELLS 28
#define MAST_STOREYS 3.5

// Axes in a true isometric projection are all foreshortened to sqrt(2/3), so
// one device pixel is a constant world length on every face. That is what lets
// the linework hold a fixed weight without fwidth, and without the halo fwidth
// leaves along a silhouette.
#define ISO_FORESHORTEN 0.81649658

#define KIND_TOWER 0.0
#define KIND_TERRACE 1.0
#define KIND_BAR 2.0

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------

/**
 * Five plane waves 72 degrees apart.
 *
 * Five-fold symmetry cannot tile the plane periodically — that is the
 * definition of a quasicrystal — so the interference pattern has cores,
 * districts and street networks but no arrangement of blocks that appears
 * twice. A city grid with no repeating block is the alien part. Nothing here is
 * placed, and nothing is noise.
 */
float quasi(vec2 p) {
    float s = 0.0;
    for (int k = 0; k < WAVES; k++) {
        s += cos(dot(p, uWaves[k]));
    }
    return s / float(WAVES);
}

/**
 * The exact gradient of the same sum, not a finite difference.
 *
 * A sum of plane waves differentiates in closed form, which is what makes the
 * slope cheap enough to consult for every block: five sines, against the ten
 * extra cosines two probe samples would have cost. |grad| lands in [0, 1]
 * because the wave vectors are unit length.
 */
vec2 quasiGrad(vec2 p) {
    vec2 g = vec2(0.0);
    for (int k = 0; k < WAVES; k++) {
        g -= sin(dot(p, uWaves[k])) * uWaves[k];
    }
    return g / float(WAVES);
}

/**
 * What stands on one block.
 *
 * Everything here is read off the field. Height is the field value; the
 * archetype is the field's *shape* at that point — flat ground near a core
 * terraces, a steep flank builds in bars along the contour, everywhere else
 * takes a tower. Because the rule is geometric rather than random, the typology
 * comes out in bands: terraced cores, ringed by bars tracing the contours,
 * thinning to towers in the flats. Nobody drew the rings.
 */
struct Block {
    float storeys;  // 0 means open ground
    float field;    // normalised field value, 0..1
    float kind;
    float grain;    // 0 = bars run along z, 1 = along x
    float jitter;
};

Block readBlock(vec2 cell) {
    Block b;
    b.kind = KIND_TOWER;
    b.grain = 0.0;
    b.jitter = hash21(cell + 17.3);

    vec2 p = (cell + 0.5) * uPlanScale;

    // Fixed span rather than the theoretical [-1, 1]: five summed waves cluster
    // hard around zero, so normalising against the maximum would flatten every
    // block outside a core to a single storey.
    b.field = clamp((quasi(p) - uPlaza) / 0.55, 0.0, 1.0);
    if (b.field <= 0.0) {
        b.storeys = 0.0;
        return b;
    }

    // Heights are quantised to storeys so the drawing can be measured: count
    // the floor lines on a tower and you have read the field at that block.
    b.storeys = floor(pow(b.field, 1.2) * uStoreys * mix(0.55, 1.0, b.jitter)) + 1.0;

    if (uTypology > 0.5) {
        vec2 g = quasiGrad(p);
        if (length(g) > 0.42) {
            b.kind = KIND_BAR;
            // Bars run along the contour, so they lie across the gradient.
            // Snapping that to an axis keeps every box inside its own cell,
            // which is what keeps the traversal exact.
            b.grain = step(abs(g.y), abs(g.x));
        } else if (b.field > 0.62) {
            b.kind = KIND_TERRACE;
        }
    }

    return b;
}

/**
 * A mast stands only on a local maximum of the field — the tallest block of a
 * core, roughly one per rosette centre. Putting one on every tall block instead
 * scatters the colour across the whole frame; this way the masts read as where
 * the five-fold centres are, which is the thing worth pointing at.
 */
bool isCoreBlock(vec2 cell, float field) {
    if (field < uMast) return false;
    vec2 c = (cell + 0.5) * uPlanScale;
    float q0 = quasi(c);
    return q0 > quasi(c + vec2(uPlanScale, 0.0))
        && q0 > quasi(c - vec2(uPlanScale, 0.0))
        && q0 > quasi(c + vec2(0.0, uPlanScale))
        && q0 > quasi(c - vec2(0.0, uPlanScale));
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

struct Hit {
    float t;
    vec3 nrm;
    vec3 bmin;
    vec3 bmax;
    vec2 cell;
    float mast;
};

// Slab intersection, keeping the nearest hit recorded so far.
bool hitBox(vec3 ro, vec3 rd, vec3 bmin, vec3 bmax, inout Hit h) {
    vec3 inv = 1.0 / rd;
    vec3 t0 = (bmin - ro) * inv;
    vec3 t1 = (bmax - ro) * inv;
    vec3 lo = min(t0, t1);
    vec3 hi = max(t0, t1);
    float tN = max(max(lo.x, lo.y), lo.z);
    float tF = min(min(hi.x, hi.y), hi.z);
    if (tF < 0.0 || tN > tF || tN >= h.t) return false;

    h.t = max(tN, 0.0);
    h.nrm = -sign(rd) * step(lo.yzx, lo.xyz) * step(lo.zxy, lo.xyz);
    h.bmin = bmin;
    h.bmax = bmax;
    return true;
}

// Distance to the border of the face that was hit, in world units.
float boxEdge(vec3 p, vec3 nrm, vec3 bmin, vec3 bmax) {
    vec3 d = min(p - bmin, bmax - p);
    // The axis the face is normal to carries no border; push it out of the min.
    d += abs(nrm) * 1e3;
    return min(min(d.x, d.y), d.z);
}

/**
 * Every box a block is made of.
 *
 * The one invariant the whole renderer rests on: each box sits inside its own
 * cell footprint. That is what lets a front-to-back walk of the lattice return
 * the nearest surface without sorting anything — the first cell whose boxes are
 * hit is the answer. Every archetype has to respect it, which is why the bars
 * snap to an axis and nothing cantilevers across a street.
 */
bool traceBlock(vec2 cell, Block b, vec3 ro, vec3 rd, bool withMast, inout Hit h) {
    if (b.storeys <= 0.0) return false;

    float top = b.storeys * uStoreyHeight;
    float inset = uStreet * 0.5;
    vec2 lo2 = cell + inset;
    vec2 hi2 = cell + 1.0 - inset;
    float span = 1.0 - uStreet;
    bool any = false;

    if (b.kind == KIND_BAR) {
        // Two slabs along the contour, the second one lower.
        float w = span * 0.34;
        for (int i = 0; i < 2; i++) {
            float near = i == 0 ? 0.0 : span - w;
            float hgt = i == 0 ? top : top * mix(0.5, 0.88, b.jitter);
            vec2 a = mix(vec2(lo2.x, lo2.y + near), vec2(lo2.x + near, lo2.y), b.grain);
            vec2 c = mix(vec2(hi2.x, a.y + w), vec2(a.x + w, hi2.y), b.grain);
            any = hitBox(ro, rd, vec3(a.x, 0.0, a.y), vec3(c.x, hgt, c.y), h) || any;
        }
    } else if (b.kind == KIND_TERRACE) {
        // Three setbacks, widest at the ground — self-supporting in the same
        // sense the printable studies have to be.
        for (int i = 0; i < 3; i++) {
            float f = float(i);
            float pull = inset + f * span * 0.14;
            float hgt = top * (0.34 + f * 0.33);
            any = hitBox(ro, rd,
                vec3(cell.x + pull, 0.0, cell.y + pull),
                vec3(cell.x + 1.0 - pull, hgt, cell.y + 1.0 - pull), h) || any;
        }
    } else {
        // Podium and shaft.
        float podium = min(uStoreyHeight * 1.6, top);
        any = hitBox(ro, rd,
            vec3(cell.x + inset * 0.55, 0.0, cell.y + inset * 0.55),
            vec3(cell.x + 1.0 - inset * 0.55, podium, cell.y + 1.0 - inset * 0.55), h) || any;
        any = hitBox(ro, rd, vec3(lo2.x, 0.0, lo2.y), vec3(hi2.x, top, hi2.y), h) || any;
    }

    if (withMast && isCoreBlock(cell, b.field)) {
        if (hitBox(ro, rd,
                vec3(cell.x + 0.44, top, cell.y + 0.44),
                vec3(cell.x + 0.56, top + uStoreyHeight * MAST_STOREYS, cell.y + 0.56), h)) {
            h.mast = 1.0;
            any = true;
        }
    }

    if (any) h.cell = cell;
    return any;
}

// ---------------------------------------------------------------------------
// Traversal
// ---------------------------------------------------------------------------

// A direction with a zero horizontal component would divide by zero in the DDA.
vec2 safeXZ(vec2 d) {
    return sign(d + step(abs(d), vec2(0.0))) * max(abs(d), vec2(1e-3));
}

/**
 * Amanatides-Woo over the block lattice.
 *
 * Because the camera is orthographic every ray shares a direction, so this is a
 * grid walk with an exact box intersection per cell rather than a sphere trace:
 * no distance field, no step artefacts, and edges that stay crisp at any zoom.
 * `stopHigh` ends the walk above the skyline for shadow rays and below the
 * ground for view rays — the same walk read in opposite directions.
 */
void traceCity(vec3 ro, vec3 rd, float ceiling, bool stopHigh, bool withMast, inout Hit h) {
    vec2 dxz = safeXZ(rd.xz);
    vec2 cell = floor(ro.xz);
    vec2 stepDir = sign(dxz);
    vec2 tDelta = abs(1.0 / dxz);
    vec2 tMax = ((cell + max(stepDir, 0.0)) - ro.xz) / dxz;

    int limit = stopHigh ? SHADOW_CELLS : MAX_CELLS;

    for (int i = 0; i < MAX_CELLS; i++) {
        if (i >= limit) break;

        Block b = readBlock(cell);
        if (traceBlock(cell, b, ro, rd, withMast, h)) break;

        float tCross;
        if (tMax.x < tMax.y) {
            cell.x += stepDir.x;
            tCross = tMax.x;
            tMax.x += tDelta.x;
        } else {
            cell.y += stepDir.y;
            tCross = tMax.y;
            tMax.y += tDelta.y;
        }

        float y = ro.y + rd.y * tCross;
        if (stopHigh ? y > ceiling : y < 0.0) break;
    }
}

/**
 * Hard shadow. Walks the same lattice toward the sun and stops at the first
 * block, so shadow length is exactly proportional to the caster's height — a
 * second way to read storey count off the drawing. Masts are too thin to be
 * worth tracing and are left out.
 */
float shadowCity(vec3 p, vec3 sd, float ceiling) {
    Hit h;
    h.t = 1e5;
    h.mast = 0.0;
    h.cell = vec2(1e4);
    traceCity(p + sd * 0.004, sd, ceiling, true, false, h);
    return h.t < 1e4 ? 1.0 : 0.0;
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

// 2x2 rotated grid, offsets in pixels from the pixel centre.
vec2 rgss(int i) {
    if (i == 0) return vec2(-0.125, -0.375);
    if (i == 1) return vec2(0.375, -0.125);
    if (i == 2) return vec2(-0.375, 0.125);
    return vec2(0.125, 0.375);
}

/**
 * One isometric sample.
 *
 * `key` comes back as a value that is continuous across a flat face and jumps
 * across a silhouette or a shadow boundary, so main() can ask the screen
 * derivative whether this pixel is on an edge. `edgeRatio` is the distance to
 * the nearest drawn line in units of line weight.
 */
vec3 sampleCity(vec2 uv, float aspect, out float key, out float edgeRatio) {
    // Inversion is a crossfade rather than a switch, so the programme can turn
    // the drawing inside out without a cut.
    float flip = clamp(uInvert, 0.0, 1.0);
    vec3 paper = mix(uPaper, uInk, flip);
    vec3 ink = mix(uInk, uPaper, flip);

    vec3 rd = normalize(vec3(1.0, -1.0, 1.0));
    vec3 right = normalize(cross(rd, vec3(0.0, 1.0, 0.0)));
    vec3 up = cross(right, rd);

    // uPan is integrated by the driver; the pointer adds a damped parallax on
    // top. Both go through the same centre, so the site marker below lands
    // exactly under the cursor.
    vec3 centre = vec3(uPan.x + uMouse.x * uInfluence, 0.0,
                       uPan.y + uMouse.y * uInfluence);

    float mastH = uStoreyHeight * MAST_STOREYS;
    float ceiling = uStoreys * uStoreyHeight + mastH + 0.5;

    vec3 ro = centre + right * (uv.x * uZoom) + up * (uv.y * uZoom);
    ro += rd * ((ceiling - ro.y) / rd.y);

    float sa = uSun * TAU;
    vec3 sunDir = normalize(vec3(cos(sa) * 0.62, 0.78, sin(sa) * 0.62));

    // The block under the pointer, found on the ground plane rather than with a
    // second trace: one ray, no walk, a handful of ops.
    vec3 pRo = centre + right * (uMouse.x * aspect * uZoom) + up * (uMouse.y * uZoom);
    vec2 pickCell = floor((pRo + rd * (pRo.y / max(-rd.y, 1e-4))).xz);

    Hit h;
    h.t = 1e5;
    h.mast = 0.0;
    h.cell = vec2(1e4);
    h.nrm = vec3(0.0, 1.0, 0.0);
    traceCity(ro, rd, ceiling, false, true, h);

    // World units per device pixel, corrected for isometric foreshortening.
    float px = 2.0 * uZoom / max(uResolution.y, 1.0);
    float weight = px / ISO_FORESHORTEN * uStroke;

    vec3 p;
    float tone;
    float edge;
    float lineStrength = 1.0;

    if (h.t > 1e4) {
        // Open ground. The lattice is drawn so block sizes stay measurable.
        float tg = ro.y / max(-rd.y, 1e-4);
        p = ro + rd * tg;
        h.nrm = vec3(0.0, 1.0, 0.0);
        h.cell = floor(p.xz);
        tone = 0.9;
        vec2 g = abs(fract(p.xz) - 0.5);
        edge = 0.5 - max(g.x, g.y);
        lineStrength = 0.18 * uGridLines;
    } else {
        p = ro + rd * h.t;
        float lit = step(0.0, dot(h.nrm, sunDir));
        tone = h.nrm.y > 0.5 ? 1.0 : mix(0.32, 0.7, lit);
        edge = boxEdge(p, h.nrm, h.bmin, h.bmax);

        // Floor lines on the vertical faces. Count them, get the storey count.
        if (uFloorLines > 0.5 && h.nrm.y < 0.5 && h.mast < 0.5) {
            float f = p.y / max(uStoreyHeight, 1e-3);
            edge = min(edge, abs(f - floor(f + 0.5)) * uStoreyHeight);
        }
    }

    float shade = 0.0;
    if (uShadow > 0.5 && dot(h.nrm, sunDir) > 0.0) {
        shade = shadowCity(p, sunDir, ceiling);
        tone = mix(tone, tone * 0.62, shade);
    }

    key = min(h.t, 1e4) + shade;
    edgeRatio = edge / max(weight, 1e-6);

    vec3 col = h.mast > 0.5
        ? mix(uBrand * 0.68, uBrand, tone)
        : mix(ink, paper, tone);

    // A soft shoulder rather than a hard one: a fixed-width line creeping a
    // couple of pixels a second is what reads as flicker.
    float line = 1.0 - smoothstep(weight * 0.25, weight * 1.25, edge);
    col = mix(col, ink, line * lineStrength);

    // Site marker. The block under the pointer is picked out in the signal
    // colour, which is what turns the drawing into something you can point at:
    // hover a block and its storeys are there to be counted.
    float picked = uPointer * (1.0 - step(0.5, max(
        abs(h.cell.x - pickCell.x), abs(h.cell.y - pickCell.y))));
    col = mix(col, uBrand, picked * 0.14);
    col = mix(col, uBrand, picked * line * max(lineStrength, 0.85));

    // Aerial fade toward the far edge. A drawing convention, not atmosphere.
    float depth = dot(p - centre, rd);
    col = mix(col, paper, clamp(depth / max(uZoom * 1.5, 1e-3), 0.0, 1.0) * uHaze);

    return col;
}

void main() {
    vec2 res = max(uResolution, vec2(1.0));
    float aspect = res.x / res.y;

    // Screen coordinates: y in [-1, 1], x widened by the aspect ratio.
    vec2 uv0 = (vUv - 0.5) * 2.0 * vec2(aspect, 1.0);
    vec2 pixel = 2.0 * vec2(aspect, 1.0) / res;

    float key;
    float edgeRatio;
    vec3 acc = sampleCity(uv0 + rgss(0) * pixel, aspect, key, edgeRatio);

    // Adaptive supersampling.
    //
    // Every edge in an isometric drawing is at 30, 90 or 150 degrees. A square
    // 2x2 sample grid resolves those into three coverage levels, which is what
    // makes a slow pan shimmer; a rotated grid gives four distinct levels on
    // exactly those angles for the same four samples. But most of this drawing
    // is the flat interior of a face, where three extra traces buy nothing —
    // and sampling everything at 4x cost four times the frame. So the pixel
    // asks first: the screen derivative of `key` finds silhouettes and shadow
    // boundaries, and edgeRatio finds the linework. Only those pixels pay.
    float px = 2.0 * uZoom / max(res.y, 1.0);
    if (uSuper > 0.5 && (edgeRatio < 2.0 || fwidth(key) > px * 2.5)) {
        float k;
        float e;
        for (int i = 1; i < 4; i++) {
            acc += sampleCity(uv0 + rgss(i) * pixel, aspect, k, e);
        }
        acc *= 0.25;
    }

    gl_FragColor = vec4(acc, 1.0);
}
