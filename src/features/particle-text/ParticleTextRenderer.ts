import { STRIDE } from './ParticleTextField';
import type { CaretRect } from './layout';

/** Anything drawn as a flat rectangle in layout px: the caret, and the rules. */
export interface RectMark {
  x: number;
  y: number;
  width: number;
  height: number;
  /** 0..1. Perimeter segments only: drives per-segment alpha and ink-to-brand tint. */
  heat?: number;
}

/**
 * One draw call for the ink, and one apiece for the flat marks over it.
 *
 * Ink uses soft-edged point sprites, drawn in
 * `--ink`, mixed toward `--brand` by however far the pointer has displaced it.
 *
 * WebGL 2 provides the visual layer; the live heading remains the fallback
 * when the context is unavailable.
 */

const POINT_VERTEX = `#version 300 es
  layout(location = 0) in vec4 aParticle;  // screen x, y (css px), tint, depth scale
  layout(location = 1) in float aJitter;   // 0..1, static per particle

  uniform vec2 uResolution;   // device px
  uniform float uScale;       // device px per css px
  uniform vec2 uOrigin;       // layout origin within the canvas, css px
  uniform float uSize;        // css px diameter
  uniform float uSizeJitter;

  out float vTint;
  out float vDepth;

  void main() {
    vec2 device = (aParticle.xy + uOrigin) * uScale;
    vec2 ndc = device / uResolution * 2.0 - 1.0;
    gl_Position = vec4(ndc.x, -ndc.y, 0.0, 1.0);
    // The perspective scale arrives already computed: the simulation runs in
    // three dimensions and projects on the way out, so this stays a flat sprite.
    gl_PointSize = max(
      1.0,
      uSize * uScale * aParticle.w * (1.0 + uSizeJitter * (aJitter - 0.5) * 2.0)
    );
    vTint = aParticle.z;
    vDepth = aParticle.w;
  }
`;

const POINT_FRAGMENT = `#version 300 es
  precision mediump float;

  uniform vec3 uInk;
  uniform vec3 uBrand;
  uniform float uAlpha;
  uniform float uDepthContrast;

  in float vTint;
  in float vDepth;
  out vec4 outColor;

  void main() {
    // Squared radius, so the edge falls off without a sqrt. Tight enough that a
    // two-pixel dot still reads as a dot rather than as a smudge.
    vec2 offset = gl_PointCoord - 0.5;
    float r2 = dot(offset, offset);
    // Ink further from the camera is smaller *and* lighter. Two weak cues read
    // as depth where either on its own reads as an accident of density.
    // Perspective alone changes the default cloud by only a few percent. Turn
    // that same physically meaningful signal into a stronger tonal separation:
    // near ink stays dense, rear ink lets more paper through.
    float depthTone = clamp(
      1.0 + (vDepth - 1.0) * 12.0 * uDepthContrast,
      0.58,
      1.24
    );
    float alpha = uAlpha * depthTone * (1.0 - smoothstep(0.16, 0.25, r2));
    if (alpha <= 0.0) discard;
    // A short, late ramp rather than a linear mix. Ink and the signal orange sit
    // far apart, so a linear blend spends most of its range in the muddy
    // red-brown between them and a light sweep washed the whole fold in it. This
    // keeps displaced ink reading as ink until it has really been thrown, so the
    // orange stays a small hot core under the cursor.
    float tint = smoothstep(0.25, 0.9, vTint);
    outColor = vec4(mix(uInk, uBrand, tint) * alpha, alpha);
  }
`;

const LINE_VERTEX = `#version 300 es
  layout(location = 0) in vec4 aParticle;

  uniform vec2 uResolution;
  uniform float uScale;
  uniform vec2 uOrigin;

  void main() {
    vec2 device = (aParticle.xy + uOrigin) * uScale;
    vec2 ndc = device / uResolution * 2.0 - 1.0;
    gl_Position = vec4(ndc.x, -ndc.y, 0.0, 1.0);
  }
`;

const LINE_FRAGMENT = `#version 300 es
  precision mediump float;
  uniform vec3 uColor;
  uniform float uAlpha;
  out vec4 outColor;
  void main() {
    outColor = vec4(uColor * uAlpha, uAlpha);
  }
`;

const RECT_VERTEX = `#version 300 es
  uniform vec2 uResolution;
  uniform float uScale;
  uniform vec2 uOrigin;
  uniform vec4 uRect;  // x, y, w, h in css px

  void main() {
    vec2 corner = vec2(float(gl_VertexID & 1), float((gl_VertexID >> 1) & 1));
    vec2 device = (uRect.xy + corner * uRect.zw + uOrigin) * uScale;
    vec2 ndc = device / uResolution * 2.0 - 1.0;
    gl_Position = vec4(ndc.x, -ndc.y, 0.0, 1.0);
  }
`;

const RECT_FRAGMENT = `#version 300 es
  precision mediump float;
  uniform vec3 uColor;
  uniform float uAlpha;
  out vec4 outColor;
  void main() {
    outColor = vec4(uColor * uAlpha, uAlpha);
  }
`;

type Rgb = readonly [number, number, number];

export class ParticleTextRenderer {
  private readonly gl: WebGL2RenderingContext;
  private readonly pointProgram: WebGLProgram;
  private readonly lineProgram: WebGLProgram;
  private readonly rectProgram: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly emptyVao: WebGLVertexArrayObject;
  private readonly particleBuffer: WebGLBuffer;
  private readonly jitterBuffer: WebGLBuffer;
  private readonly edgeBuffer: WebGLBuffer;
  private readonly nodeBuffer: WebGLBuffer;
  private readonly point: Record<string, WebGLUniformLocation | null>;
  private readonly line: Record<string, WebGLUniformLocation | null>;
  private readonly rect: Record<string, WebGLUniformLocation | null>;

  private width = 0;
  private height = 0;
  private scale = 1;
  private ink: Rgb = [0, 0, 0];
  private brand: Rgb = [1, 0.21, 0];
  private edgeCount = 0;
  private nodeCount = 0;
  /** Reused every frame the caret is drawn, so passing it to `drawRects` does not allocate. */
  private readonly caretMarks: RectMark[] = [
    { x: 0, y: 0, width: 0, height: 0 },
  ];

  constructor(canvas: HTMLCanvasElement, capacity: number) {
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'low-power',
      premultipliedAlpha: true,
    });
    if (!gl) throw new Error('WebGL 2 is unavailable');
    this.gl = gl;

    this.pointProgram = this.link(POINT_VERTEX, POINT_FRAGMENT);
    this.lineProgram = this.link(LINE_VERTEX, LINE_FRAGMENT);
    this.rectProgram = this.link(RECT_VERTEX, RECT_FRAGMENT);

    const vao = gl.createVertexArray();
    const emptyVao = gl.createVertexArray();
    const particleBuffer = gl.createBuffer();
    const jitterBuffer = gl.createBuffer();
    const edgeBuffer = gl.createBuffer();
    const nodeBuffer = gl.createBuffer();
    if (
      !vao ||
      !emptyVao ||
      !particleBuffer ||
      !jitterBuffer ||
      !edgeBuffer ||
      !nodeBuffer
    ) {
      throw new Error('Could not allocate the particle text buffers');
    }
    this.vao = vao;
    this.emptyVao = emptyVao;
    this.particleBuffer = particleBuffer;
    this.jitterBuffer = jitterBuffer;
    this.edgeBuffer = edgeBuffer;
    this.nodeBuffer = nodeBuffer;

    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, particleBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, capacity * STRIDE * 4, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, STRIDE, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, jitterBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, capacity * 4, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, edgeBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, 0, gl.DYNAMIC_DRAW);
    gl.bindVertexArray(null);

    const uniform = (program: WebGLProgram, names: string[]) =>
      Object.fromEntries(
        names.map((n) => [n, gl.getUniformLocation(program, n)])
      );

    this.point = uniform(this.pointProgram, [
      'uResolution',
      'uScale',
      'uOrigin',
      'uSize',
      'uSizeJitter',
      'uInk',
      'uBrand',
      'uAlpha',
      'uDepthContrast',
    ]);
    this.line = uniform(this.lineProgram, [
      'uResolution',
      'uScale',
      'uOrigin',
      'uColor',
      'uAlpha',
    ]);
    this.rect = uniform(this.rectProgram, [
      'uResolution',
      'uScale',
      'uOrigin',
      'uRect',
      'uColor',
      'uAlpha',
    ]);

    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
  }

  /** Static per-particle size variation. Uploaded once. */
  public setJitter(jitter: Float32Array): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.jitterBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, jitter);
  }

  /** Topology changes are rare; positions continue to arrive in the shared VBO. */
  public setGraph(edges: Uint32Array, nodes: Uint32Array): void {
    const gl = this.gl;
    this.edgeCount = edges.length;
    this.nodeCount = nodes.length;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.edgeBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, edges, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.nodeBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, nodes, gl.DYNAMIC_DRAW);
    gl.bindVertexArray(null);
  }

  public setSize(cssWidth: number, cssHeight: number, scale: number): void {
    const width = Math.max(1, Math.round(cssWidth * scale));
    const height = Math.max(1, Math.round(cssHeight * scale));
    if (width === this.width && height === this.height && scale === this.scale)
      return;

    this.width = width;
    this.height = height;
    this.scale = scale;
    this.gl.canvas.width = width;
    this.gl.canvas.height = height;
    this.gl.viewport(0, 0, width, height);
  }

  public setColors(ink: Rgb, brand: Rgb): void {
    this.ink = ink;
    this.brand = brand;
    const gl = this.gl;
    gl.useProgram(this.pointProgram);
    gl.uniform3f(this.point.uInk, ink[0], ink[1], ink[2]);
    gl.uniform3f(this.point.uBrand, brand[0], brand[1], brand[2]);
  }

  public render(options: {
    data: Float32Array;
    count: number;
    /** Where layout (0, 0) sits inside the canvas, css px. */
    originX: number;
    originY: number;
    pointSize: number;
    sizeJitter: number;
    alpha: number;
    depthContrast: number;
    edgeAlpha: number;
    nodeAlpha: number;
    nodeSize: number;
    /** Baseline rules, under the ink. */
    rules: readonly RectMark[];
    ruleAlpha: number;
    /** Perimeter segments, over the ink. Each mark's own `heat` sets its alpha and tint. */
    perimeter: readonly RectMark[];
    perimeterAlpha: number;
    caret: CaretRect | null;
    caretAlpha: number;
  }): void {
    const gl = this.gl;
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Under the ink, deliberately. The rules are the sheet the type is set on,
    // so ink crossing one covers it — which is also what makes a rule visible
    // where the ink has left it.
    if (options.rules.length > 0 && options.ruleAlpha > 0.001) {
      this.drawRects(
        options.rules,
        this.ink,
        options.ruleAlpha,
        options.originX,
        options.originY,
        true
      );
    }

    if (options.count > 0) {
      gl.bindVertexArray(this.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.particleBuffer);
      // srcOffset/length passed directly rather than through `subarray`, which
      // would allocate a new typed-array view every frame for no benefit here.
      gl.bufferSubData(
        gl.ARRAY_BUFFER,
        0,
        options.data,
        0,
        options.count * STRIDE
      );

      gl.useProgram(this.pointProgram);
      gl.uniform2f(this.point.uResolution, this.width, this.height);
      gl.uniform1f(this.point.uScale, this.scale);
      gl.uniform2f(this.point.uOrigin, options.originX, options.originY);
      gl.uniform1f(this.point.uSize, options.pointSize);
      gl.uniform1f(this.point.uSizeJitter, options.sizeJitter);
      gl.uniform1f(this.point.uAlpha, options.alpha);
      gl.uniform1f(this.point.uDepthContrast, options.depthContrast);
      gl.drawArrays(gl.POINTS, 0, options.count);

      if (this.edgeCount > 0 && options.edgeAlpha > 0.001) {
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.edgeBuffer);
        gl.useProgram(this.lineProgram);
        gl.uniform2f(this.line.uResolution, this.width, this.height);
        gl.uniform1f(this.line.uScale, this.scale);
        gl.uniform2f(this.line.uOrigin, options.originX, options.originY);
        gl.uniform3f(this.line.uColor, this.ink[0], this.ink[1], this.ink[2]);
        gl.uniform1f(this.line.uAlpha, options.edgeAlpha);
        gl.drawElements(gl.LINES, this.edgeCount, gl.UNSIGNED_INT, 0);
      }

      if (this.nodeCount > 0 && options.nodeAlpha > 0.001) {
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.nodeBuffer);
        gl.useProgram(this.pointProgram);
        gl.uniform1f(this.point.uSize, options.nodeSize);
        gl.uniform1f(this.point.uSizeJitter, 0);
        gl.uniform1f(this.point.uAlpha, options.nodeAlpha);
        gl.drawElements(gl.POINTS, this.nodeCount, gl.UNSIGNED_INT, 0);
      }
    }

    // Over the ink, unlike the rules: this is a foreground event, the wall's
    // own version of the orange the pointer leaves on the ink itself, not a
    // background sheet the ink is set on.
    if (options.perimeter.length > 0 && options.perimeterAlpha > 0.001) {
      this.renderPerimeter(
        options.perimeter,
        options.perimeterAlpha,
        options.originX,
        options.originY
      );
    }

    if (options.caret && options.caretAlpha > 0.001) {
      this.caretMarks[0] = options.caret;
      this.drawRects(
        this.caretMarks,
        this.brand,
        options.caretAlpha,
        options.originX,
        options.originY
      );
    }

    gl.bindVertexArray(null);
  }

  /**
   * Flat marks, one four-vertex strip apiece.
   *
   * Instancing a handful of rectangles would cost a buffer upload per frame to
   * save two or three state changes on a draw that touches a few hundred
   * fragments. The masthead has at most `maxLines` rules and one caret.
   */
  private drawRects(
    marks: readonly RectMark[],
    color: Rgb,
    alpha: number,
    originX: number,
    originY: number,
    snap = false
  ): void {
    const gl = this.gl;
    const scale = this.scale;
    gl.bindVertexArray(this.emptyVao);
    gl.useProgram(this.rectProgram);
    gl.uniform2f(this.rect.uResolution, this.width, this.height);
    gl.uniform1f(this.rect.uScale, scale);
    gl.uniform2f(this.rect.uOrigin, originX, originY);
    gl.uniform3f(this.rect.uColor, color[0], color[1], color[2]);
    gl.uniform1f(this.rect.uAlpha, alpha);

    // A hairline whose device-space edges are fractional is spread across two
    // or three rows of pixels, which halves its contrast and makes an
    // already-faint rule read as a smudge that moves as the type refits.
    // Rounding both edges onto the device grid is the difference between a rule
    // and a grey blur; the caret is thick enough not to need it.
    const line = snap ? Math.max(1, Math.round(scale)) / scale : 0;

    for (const mark of marks) {
      const y = snap
        ? Math.round((mark.y + originY) * scale) / scale - originY
        : mark.y;
      gl.uniform4f(
        this.rect.uRect,
        mark.x,
        y,
        mark.width,
        snap ? line : mark.height
      );
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
  }

  /**
   * One draw call per lit segment, skipping the rest. Unlike `drawRects`,
   * every mark carries its own alpha and colour, so the uniforms are set
   * inside the loop rather than once before it — the same rect pipeline,
   * asked for a different thing per mark instead of the same thing repeated.
   *
   * No device-pixel snapping, unlike the rules: a rule is a hairline that has
   * to stay crisp to read as a reference grid; this is a glow marking an
   * event, and a soft edge reads as light rather than as a smudge.
   */
  private renderPerimeter(
    marks: readonly RectMark[],
    alpha: number,
    originX: number,
    originY: number
  ): void {
    const gl = this.gl;
    gl.bindVertexArray(this.emptyVao);
    gl.useProgram(this.rectProgram);
    gl.uniform2f(this.rect.uResolution, this.width, this.height);
    gl.uniform1f(this.rect.uScale, this.scale);
    gl.uniform2f(this.rect.uOrigin, originX, originY);

    for (const mark of marks) {
      const heat = mark.heat ?? 0;
      if (heat <= 0.004 || mark.width <= 0 || mark.height <= 0) continue;

      // The same late ramp the ink itself uses (see POINT_FRAGMENT): a hit
      // reads as ink darkening before it reads as orange, so a graze does not
      // paint the wall the signal colour.
      const tint = Math.min(1, Math.max(0, (heat - 0.25) / 0.75));
      gl.uniform3f(
        this.rect.uColor,
        this.ink[0] + (this.brand[0] - this.ink[0]) * tint,
        this.ink[1] + (this.brand[1] - this.ink[1]) * tint,
        this.ink[2] + (this.brand[2] - this.ink[2]) * tint
      );
      gl.uniform1f(this.rect.uAlpha, alpha * heat);
      gl.uniform4f(this.rect.uRect, mark.x, mark.y, mark.width, mark.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
  }

  public dispose(): void {
    const gl = this.gl;
    gl.deleteBuffer(this.particleBuffer);
    gl.deleteBuffer(this.jitterBuffer);
    gl.deleteBuffer(this.edgeBuffer);
    gl.deleteBuffer(this.nodeBuffer);
    gl.deleteVertexArray(this.vao);
    gl.deleteVertexArray(this.emptyVao);
    gl.deleteProgram(this.pointProgram);
    gl.deleteProgram(this.lineProgram);
    gl.deleteProgram(this.rectProgram);
    // The host can reuse this canvas after a live reduced-motion toggle.
    // All owned GPU objects are deleted above; losing the context would make
    // that next renderer fail before it can restore the interactive heading.
    if (!(gl.canvas as HTMLCanvasElement).isConnected)
      gl.getExtension('WEBGL_lose_context')?.loseContext();
  }

  private link(vertexSource: string, fragmentSource: string): WebGLProgram {
    const gl = this.gl;
    const vertex = this.compile(gl.VERTEX_SHADER, vertexSource);
    const fragment = this.compile(gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram();
    if (!program) throw new Error('Could not create the particle text program');

    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const message = gl.getProgramInfoLog(program) ?? 'unknown error';
      gl.deleteProgram(program);
      throw new Error(`Could not link the particle text program: ${message}`);
    }
    return program;
  }

  private compile(type: number, source: string): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type);
    if (!shader) throw new Error('Could not create a particle text shader');

    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader) ?? 'unknown error';
      gl.deleteShader(shader);
      throw new Error(`Could not compile a particle text shader: ${message}`);
    }
    return shader;
  }
}
