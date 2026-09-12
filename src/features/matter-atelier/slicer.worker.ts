import { planPrint, sliceTriangles } from './toolpath';
self.onmessage = (event: MessageEvent<Float32Array>) => {
  try {
    self.postMessage({ job: planPrint(sliceTriangles(event.data)) });
  } catch (error) {
    self.postMessage({
      error:
        error instanceof Error ? error.message : 'Unable to slice this mesh.',
    });
  }
};
