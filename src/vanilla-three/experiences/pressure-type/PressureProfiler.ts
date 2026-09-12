interface TimerExtension {
  TIME_ELAPSED_EXT: number;
  GPU_DISJOINT_EXT: number;
}

/** GPU timing is optional and asynchronous; never stalls for a result. */
export class PressureProfiler {
  gpuMs = 0;
  private readonly gl: WebGL2RenderingContext;
  private readonly extension: TimerExtension | null;
  private readonly pending: WebGLQuery[] = [];
  private readonly available: WebGLQuery[] = [];
  private readonly queries: WebGLQuery[] = [];
  private active: WebGLQuery | null = null;
  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.extension = gl.getExtension(
      'EXT_disjoint_timer_query_webgl2'
    ) as TimerExtension | null;
    if (this.extension)
      for (let i = 0; i < 3; i++) {
        const query = gl.createQuery();
        if (query) {
          this.queries.push(query);
          this.available.push(query);
        }
      }
  }
  begin() {
    const gl = this.gl,
      ext = this.extension;
    if (!ext) return;
    if (gl.getParameter(ext.GPU_DISJOINT_EXT)) {
      for (const query of this.pending) this.available.push(query);
      this.pending.length = 0;
      this.gpuMs = 0;
    }
    while (
      this.pending.length &&
      gl.getQueryParameter(this.pending[0], gl.QUERY_RESULT_AVAILABLE)
    ) {
      const query = this.pending.shift()!;
      this.gpuMs = gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6;
      this.available.push(query);
    }
    if (!this.available.length) return;
    this.active = this.available.pop()!;
    if (this.active) gl.beginQuery(ext.TIME_ELAPSED_EXT, this.active);
  }
  end() {
    if (!this.active || !this.extension) return;
    this.gl.endQuery(this.extension.TIME_ELAPSED_EXT);
    this.pending.push(this.active);
    this.active = null;
  }
  dispose() {
    if (this.active) {
      this.gl.endQuery(this.extension!.TIME_ELAPSED_EXT);
    }
    for (const query of this.queries) this.gl.deleteQuery(query);
    this.queries.length = this.available.length = 0;
    this.pending.length = 0;
    this.active = null;
  }
}
