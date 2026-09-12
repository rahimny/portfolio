import { useState, useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import './AnimatedCounter.css';

interface AnimatedCounterProps {
  target: number;
  duration?: number;
  delay?: number;
  label: string;
  onClick?: () => void;
}

export function AnimatedCounter({
  delay = 0.5,
  duration = 0.8,
  target,
  label,
  onClick,
}: AnimatedCounterProps) {
  const [count, setCount] = useState(0);
  const countRef = useRef({ value: 0 });
  const timelineRef = useRef<gsap.core.Timeline | null>(null);

  useEffect(() => {
    if (timelineRef.current) {
      timelineRef.current.kill();
    }

    // Reset count
    countRef.current.value = 0;
    setCount(0);

    timelineRef.current = gsap.timeline({ delay });

    timelineRef.current.to(countRef.current, {
      value: target,
      duration: duration,
      ease: 'expo.out',
      onUpdate: () => {
        setCount(Math.floor(countRef.current.value));
      },
    });

    return () => {
      if (timelineRef.current) {
        timelineRef.current.kill();
      }
    };
  }, [delay, duration, target]);

  return (
    <div
      className={`relative inline-flex items-center gap-2 mb-6 ${
        onClick ? 'cursor-pointer' : ''
      } group`}
      style={
        {
          '--angle': '0deg',
        } as React.CSSProperties
      }
      onClick={onClick}
    >
      {/* Animated border */}
      <div className="animated-border">
        <div className="h-full w-full bg-bg"></div>
      </div>

      {/* Content */}
      <div className="relative z-10 flex items-center gap-3 bg-surface px-4 py-2">
        <span className="font-display text-lg tabular-nums text-fg">
          {count}
        </span>
        <span className="font-meta text-fg-muted">{label}</span>
      </div>
    </div>
  );
}
