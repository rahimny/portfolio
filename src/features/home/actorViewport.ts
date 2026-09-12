/** Keep page-wide travel in logical CSS space; allocate only the visible slice. */
export function actorViewport(
  width: number,
  height: number,
  pageTop: number,
  scrollY: number,
  viewportHeight: number,
  dpr: number,
  modestDevice: boolean
) {
  const visibleHeight = Math.min(height, viewportHeight + 200);
  return {
    height: visibleHeight,
    top: Math.max(0, Math.min(height - visibleHeight, scrollY - pageTop - 100)),
    ratio: Math.min(
      dpr,
      modestDevice ? 1.25 : 1.5,
      Math.sqrt((modestDevice ? 900_000 : 1_500_000) / (width * visibleHeight)),
      4096 / width,
      4096 / visibleHeight
    ),
  };
}
