uniform float uTime;
uniform vec2 uResolution;
uniform vec2 uMouse;
uniform vec4 uCircles[192];
uniform float uCircleCount;
uniform float uGrowth;
uniform float uSpeed;
uniform float uAutoGrow;
uniform float uDetail;
uniform float uStroke;
uniform float uLayer;
uniform float uFill;
uniform float uInfluence;
uniform float uDrift;
uniform float uInvert;
uniform float uKMax;
uniform vec3 uPaper;
uniform vec3 uInk;
uniform vec3 uBrand;

varying vec2 vUv;

// Must match GASKET_CIRCLE_CAP in packGasket.ts
#define MAX_CIRCLES 192

vec2 cmul(vec2 a, vec2 b) {
    return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

vec2 cdiv(vec2 a, vec2 b) {
    return cmul(a, vec2(b.x, -b.y)) / max(dot(b, b), 1e-8);
}

vec2 mobius(vec2 z, vec2 a) {
    vec2 num = z - a;
    vec2 den = vec2(1.0, 0.0) - cmul(vec2(a.x, -a.y), z);
    return cdiv(num, den);
}

float over(float dst, float src) {
    return dst + src * (1.0 - dst);
}

void main() {
    vec2 uv = (vUv - 0.5) * 2.0;
    float aspect = uResolution.x / uResolution.y;
    uv.x *= aspect;

    float margin = 1.22;
    uv *= margin;

    vec2 pointer = uMouse;
    pointer.x *= aspect;
    pointer *= margin;

    vec2 drift = vec2(sin(uTime * 0.11), cos(uTime * 0.087)) * uDrift;
    vec2 a = pointer * uInfluence + drift;
    float aLen = length(a);
    if (aLen > 0.62) a *= 0.62 / aLen;

    vec2 z = aLen < 0.001 ? uv : mobius(uv, -a);

    vec3 paper = mix(uPaper, uInk, step(0.5, uInvert));
    vec3 ink = mix(uInk, uPaper, step(0.5, uInvert));

    float growth = uGrowth;
    if (uAutoGrow > 0.5) {
        growth = 1.0 - exp(-uTime * max(uSpeed, 0.0) * 0.2);
    }

    float kCeil = mix(8.0, max(uKMax, 8.0), clamp(uDetail, 0.0, 1.0));
    float logMin = log(1.8);
    float logMax = log(kCeil + 1.0);
    float logReveal = mix(logMin, logMax, clamp(growth, 0.0, 1.0));
    float countReveal = mix(4.0, uCircleCount * mix(0.25, 1.0, uDetail), growth);

    float plateDist = length(uv) - 1.0;
    float plateAA = max(fwidth(plateDist), 1e-6);
    float inPlate = 1.0 - smoothstep(0.0, plateAA * 2.0, plateDist);

    float inkLine = 0.0;
    float brandLine = 0.0;
    float inkFill = 0.0;

    for (int i = 0; i < MAX_CIRCLES; i++) {
        if (float(i) >= uCircleCount) break;

        vec4 c = uCircles[i];
        float r = c.z;
        float kk = c.w;
        if (r <= 0.0 || kk < 0.0 || kk > kCeil + 0.5) continue;

        float indexGate = 1.0 - smoothstep(countReveal, countReveal + 8.0, float(i));
        if (indexGate <= 0.0) continue;

        float logK = log(max(kk, 1.0));
        // Wide window in log-curvature so several sizes are in-flight at once.
        float born = smoothstep(logK - 0.05, logK + 0.55, logReveal) * indexGate;
        if (born <= 0.002) continue;

        float drawR = r * mix(0.02, 1.0, born);
        float dist = length(z - c.xy) - drawR;
        float aa = max(fwidth(dist), 1e-6);

        float sizeFade = mix(0.92, 0.32, smoothstep(logMin, logMax, logK));
        float frontier = born * (1.0 - born) * 4.0;
        float alpha = clamp((sizeFade * mix(0.45, 1.0, born) + frontier * 0.3) * uLayer, 0.0, 1.0);

        bool seed = kk < 3.51;
        float core = (seed ? 2.1 : mix(1.35, 0.7, smoothstep(4.0, kCeil, kk))) * uStroke;
        float line = (1.0 - smoothstep(core * aa, (core + 1.15) * aa, abs(dist))) * alpha;

        if (seed) {
            brandLine = over(brandLine, line);
        } else {
            inkLine = over(inkLine, line);
        }

        if (!seed && uFill > 0.001) {
            float inside = 1.0 - smoothstep(-aa * 1.5, aa, dist);
            float fill = inside * born * sizeFade * 0.07 * uFill;
            inkFill = over(inkFill, fill);
        }
    }

    vec3 color = paper;
    color = mix(color, ink, inkFill);
    color = mix(color, ink, inkLine);
    color = mix(color, uBrand, brandLine);
    color = mix(paper, color, inPlate);

    gl_FragColor = vec4(color, 1.0);
}
