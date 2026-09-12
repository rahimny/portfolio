const VERTEX_SHADER = `#version 300 es
  out vec2 vUv;

  void main() {
    vec2 position = vec2(
      (gl_VertexID == 1) ? 3.0 : -1.0,
      (gl_VertexID == 2) ? 3.0 : -1.0
    );
    vUv = position * 0.5 + 0.5;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const FRAGMENT_SHADER = `#version 300 es
  precision highp float;

  uniform sampler2D uSource;
  uniform sampler2D uFlow;
  uniform float uDisplacement;

  in vec2 vUv;
  out vec4 outColor;

  void main() {
    vec2 flow = clamp(
      (texture(uFlow, vUv).rg * 255.0 - 128.0) / 127.0,
      vec2(-1.0),
      vec2(1.0)
    );
    vec2 distortedUv = clamp(
      vUv - flow * uDisplacement,
      vec2(0.0),
      vec2(1.0)
    );
    outColor = texture(uSource, distortedUv);
  }
`;

interface FlowTexture {
  width: number;
  height: number;
  data: Uint8Array;
}

/** A deliberately small WebGL renderer for the DOM treatment. */
export class PixelFlowRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly sourceTexture: WebGLTexture;
  private readonly flowTexture: WebGLTexture;
  private readonly displacementLocation: WebGLUniformLocation;
  private flowWidth = 0;
  private flowHeight = 0;

  constructor(canvas: HTMLCanvasElement, displacement = 0.032) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      depth: false,
      powerPreference: 'low-power',
      premultipliedAlpha: true,
    });

    if (!gl) {
      throw new Error('WebGL 2 is unavailable');
    }

    this.gl = gl;
    this.program = this.createProgram(VERTEX_SHADER, FRAGMENT_SHADER);
    this.sourceTexture = this.createTexture();
    this.flowTexture = this.createTexture();

    const displacementLocation = gl.getUniformLocation(
      this.program,
      'uDisplacement'
    );
    if (!displacementLocation) {
      throw new Error('Pixel Flow displacement uniform is unavailable');
    }
    this.displacementLocation = displacementLocation;

    gl.useProgram(this.program);
    gl.uniform1i(gl.getUniformLocation(this.program, 'uSource'), 0);
    gl.uniform1i(gl.getUniformLocation(this.program, 'uFlow'), 1);
    gl.uniform1f(this.displacementLocation, displacement);
    gl.clearColor(0, 0, 0, 0);
  }

  public setSource(source: HTMLCanvasElement): void {
    this.canvas.width = source.width;
    this.canvas.height = source.height;
    this.gl.viewport(0, 0, source.width, source.height);
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.sourceTexture);
    this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, true);
    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.RGBA,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      source
    );
  }

  public setDisplacement(displacement: number): void {
    this.gl.useProgram(this.program);
    this.gl.uniform1f(this.displacementLocation, displacement);
  }

  public render(flow: FlowTexture): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.flowTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    if (flow.width !== this.flowWidth || flow.height !== this.flowHeight) {
      this.flowWidth = flow.width;
      this.flowHeight = flow.height;
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        flow.width,
        flow.height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        flow.data
      );
    } else {
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        flow.width,
        flow.height,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        flow.data
      );
    }

    gl.useProgram(this.program);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  public dispose(): void {
    const gl = this.gl;
    gl.deleteTexture(this.sourceTexture);
    gl.deleteTexture(this.flowTexture);
    gl.deleteProgram(this.program);
  }

  private createTexture(): WebGLTexture {
    const texture = this.gl.createTexture();
    if (!texture) throw new Error('Could not create a Pixel Flow texture');

    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
    this.gl.texParameteri(
      this.gl.TEXTURE_2D,
      this.gl.TEXTURE_MIN_FILTER,
      this.gl.LINEAR
    );
    this.gl.texParameteri(
      this.gl.TEXTURE_2D,
      this.gl.TEXTURE_MAG_FILTER,
      this.gl.LINEAR
    );
    this.gl.texParameteri(
      this.gl.TEXTURE_2D,
      this.gl.TEXTURE_WRAP_S,
      this.gl.CLAMP_TO_EDGE
    );
    this.gl.texParameteri(
      this.gl.TEXTURE_2D,
      this.gl.TEXTURE_WRAP_T,
      this.gl.CLAMP_TO_EDGE
    );
    return texture;
  }

  private createProgram(vertexSource: string, fragmentSource: string) {
    const vertexShader = this.compileShader(
      this.gl.VERTEX_SHADER,
      vertexSource
    );
    const fragmentShader = this.compileShader(
      this.gl.FRAGMENT_SHADER,
      fragmentSource
    );
    const program = this.gl.createProgram();
    if (!program) throw new Error('Could not create the Pixel Flow program');

    this.gl.attachShader(program, vertexShader);
    this.gl.attachShader(program, fragmentShader);
    this.gl.linkProgram(program);
    this.gl.deleteShader(vertexShader);
    this.gl.deleteShader(fragmentShader);

    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      const message = this.gl.getProgramInfoLog(program) ?? 'Unknown error';
      this.gl.deleteProgram(program);
      throw new Error(`Could not link the Pixel Flow program: ${message}`);
    }

    return program;
  }

  private compileShader(type: number, source: string): WebGLShader {
    const shader = this.gl.createShader(type);
    if (!shader) throw new Error('Could not create a Pixel Flow shader');

    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);

    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      const message = this.gl.getShaderInfoLog(shader) ?? 'Unknown error';
      this.gl.deleteShader(shader);
      throw new Error(`Could not compile a Pixel Flow shader: ${message}`);
    }

    return shader;
  }
}
