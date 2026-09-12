import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { cn } from '@/lib/utils';
import type { DomEffect, DomEffectPointer } from './types';

interface DomEffectOverlayProps {
  children: ReactNode;
  className?: string;
  createEffect?: (canvas: HTMLCanvasElement) => DomEffect;
  /** A companion driven by an existing effect's clock and disposal lifecycle.
   * It adds to the semantic content without capturing or hiding it. */
  companionCanvasRef?: RefObject<HTMLCanvasElement | null>;
}

const CAPTURE_SCALE_LIMIT = 1.5;

/**
 * Keeps semantic DOM live beneath a transient canvas treatment.
 *
 * This component is intentionally unaware of Three.js, WebGL or any particular
 * visual technique. Future effects only need to implement `DomEffect`.
 */
export function DomEffectOverlay({
  children,
  className,
  createEffect,
  companionCanvasRef,
}: DomEffectOverlayProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const root = rootRef.current;
    const content = contentRef.current;
    const canvas = canvasRef.current;
    const hasFinePointer = window.matchMedia(
      '(hover: hover) and (pointer: fine)'
    ).matches;

    if (
      !createEffect ||
      !root ||
      !content ||
      !canvas ||
      reducedMotion ||
      !hasFinePointer
    ) {
      return;
    }

    let effect: DomEffect;
    try {
      effect = createEffect(canvas);
    } catch {
      return;
    }

    let animationFrame = 0;
    let captureTimer = 0;
    let captureRevision = 0;
    let disposed = false;
    let isReady = false;
    let overlayVisible = false;
    let previousTime = performance.now();
    let previousPointer: { x: number; y: number } | null = null;

    const setOverlayVisible = (visible: boolean) => {
      if (overlayVisible === visible) return;
      overlayVisible = visible;
      canvas.style.opacity = visible ? '1' : '0';
      content.style.opacity = visible ? '0' : '1';
    };

    const stopAnimation = () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      setOverlayVisible(false);
    };

    const animate = (time: number) => {
      const isActive = effect.update(time - previousTime);
      previousTime = time;
      effect.render();

      // Swap only after the first affected frame has reached the canvas. The
      // old crossfade showed two differently rasterised copies at once, which
      // read as a brief change in font size and weight.
      setOverlayVisible(isActive);

      if (!isActive) {
        animationFrame = 0;
        return;
      }

      animationFrame = requestAnimationFrame(animate);
    };

    const startAnimation = () => {
      if (!isReady || animationFrame) return;
      previousTime = performance.now();
      animationFrame = requestAnimationFrame(animate);
    };

    const capture = async () => {
      const revision = ++captureRevision;
      isReady = false;
      stopAnimation();

      await document.fonts.ready;
      if (disposed || revision !== captureRevision) return;

      const bounds = content.getBoundingClientRect();
      if (bounds.width < 1 || bounds.height < 1) return;

      try {
        const { domToCanvas } = await import('modern-screenshot');
        const snapshot = await domToCanvas(content, {
          width: bounds.width,
          height: bounds.height,
          scale: Math.min(window.devicePixelRatio, CAPTURE_SCALE_LIMIT),
          backgroundColor: null,
          style: { opacity: '1', transition: 'none' },
          font: { preferredFormat: 'woff2' },
        });

        if (disposed || revision !== captureRevision) return;
        effect.setSource(snapshot, {
          width: bounds.width,
          height: bounds.height,
        });
        effect.render();
        isReady = true;
      } catch {
        // The original DOM is the permanent fallback.
        isReady = false;
      }
    };

    const scheduleCapture = () => {
      window.clearTimeout(captureTimer);
      captureTimer = window.setTimeout(capture, 150);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!isReady || event.pointerType === 'touch') return;

      const bounds = root.getBoundingClientRect();
      const currentPointer = {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      };

      if (previousPointer) {
        const pointer: DomEffectPointer = {
          ...currentPointer,
          deltaX: currentPointer.x - previousPointer.x,
          deltaY: currentPointer.y - previousPointer.y,
        };
        effect.onPointerMove(pointer);
        startAnimation();
      }

      previousPointer = currentPointer;
    };

    const handlePointerLeave = () => {
      previousPointer = null;
      effect.onPointerLeave();
    };

    const resizeObserver = new ResizeObserver(scheduleCapture);
    resizeObserver.observe(content);
    root.addEventListener('pointermove', handlePointerMove);
    root.addEventListener('pointerleave', handlePointerLeave);
    void capture();

    return () => {
      disposed = true;
      captureRevision += 1;
      window.clearTimeout(captureTimer);
      stopAnimation();
      resizeObserver.disconnect();
      root.removeEventListener('pointermove', handlePointerMove);
      root.removeEventListener('pointerleave', handlePointerLeave);
      effect.dispose();
    };
  }, [createEffect, reducedMotion]);

  return (
    <div ref={rootRef} className={cn('relative isolate', className)}>
      <div ref={contentRef} className="relative">
        {children}
      </div>
      <canvas
        ref={companionCanvasRef ?? canvasRef}
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute opacity-0',
          !companionCanvasRef && 'inset-0 size-full'
        )}
      />
    </div>
  );
}
