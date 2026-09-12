import { Loop } from 'three/tsl';
import type { Node } from 'three/webgpu';

/** Named loop inputs exist at runtime but are absent from the current types. */
export function neighbourLoop(
  name: string,
  body: (index: Node<'int'>) => void
): void {
  const options = {
    start: 0,
    end: 3,
    type: 'int' as const,
    name,
    condition: '<',
  };
  Loop(options, (inputs) => {
    body((inputs as unknown as Record<string, Node<'int'>>)[name]);
  });
}

/** Array variables support element() at runtime, including after toConst(). */
export function arrayElement<T>(array: Node<T>, index: Node<'int'>): Node<T> {
  return (array as Node<T> & { element(index: Node<'int'>): Node<T> }).element(
    index
  );
}
