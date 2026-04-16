import { useEffect, useRef, useState } from "react";

interface CountdownOverlayProps {
  seconds: number;
  rect?: { x: number; y: number; w: number; h: number };
  onSkip: () => void;
  onComplete: () => void;
}

export function CountdownOverlay({ seconds, rect, onSkip, onComplete }: CountdownOverlayProps) {
  const [remaining, setRemaining] = useState(seconds);
  const [progress, setProgress] = useState(0);
  const [displayNum, setDisplayNum] = useState(seconds);
  const [numKey, setNumKey] = useState(0);
  const completedRef = useRef(false);
  const startTimeRef = useRef(performance.now());
  const rafRef = useRef<number>(0);

  const centerX = rect ? rect.x + rect.w / 2 : window.innerWidth / 2;
  const centerY = rect ? rect.y + rect.h / 2 : window.innerHeight / 2;

  const triggerComplete = () => {
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete();
  };

  const handleSkip = () => {
    if (!completedRef.current) {
      completedRef.current = true;
      onSkip();
    }
  };

  useEffect(() => {
    if (completedRef.current) return;

    startTimeRef.current = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTimeRef.current;
      const p = Math.min(elapsed / 1000, 1);
      setProgress(p);
      if (p < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };

    rafRef.current = requestAnimationFrame(animate);

    const timer = window.setTimeout(() => {
      if (remaining <= 1) {
        triggerComplete();
      } else {
        setRemaining((r) => r - 1);
        setDisplayNum((r) => r - 1);
        setNumKey((k) => k + 1);
      }
    }, 1000);

    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(rafRef.current);
    };
  }, [remaining]);

  useEffect(() => {
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const size = 96;
  const ringWidth = 3;
  const radius = (size - ringWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - progress);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        cursor: "pointer",
        fontFamily: "var(--font-mono)",
      }}
      onClick={handleSkip}
    >
      <div
        style={{
          position: "absolute",
          left: centerX,
          top: centerY,
          transform: "translate(-50%, -50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div style={{ position: "relative", width: size, height: size }}>
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            style={{ position: "absolute", inset: 0 }}
          >
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="var(--bg-secondary)"
              stroke="var(--border-default)"
              strokeWidth={ringWidth}
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={ringWidth + 1}
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              style={{ transition: "stroke-dashoffset 80ms linear" }}
            />
          </svg>

          <div
            key={numKey}
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 32,
              fontWeight: 700,
              color: "var(--text-primary)",
              fontFamily: "var(--font-mono)",
              fontVariantNumeric: "tabular-nums",
              animation: "countdown-num-in 150ms var(--ease-out-expo)",
            }}
          >
            {displayNum}
          </div>
        </div>

        <span
          style={{
            fontSize: 11,
            color: "var(--text-tertiary)",
            fontFamily: "var(--font-mono)",
            letterSpacing: "0.02em",
          }}
        >
          Space to skip
        </span>
      </div>

      <style>{`
        @keyframes countdown-num-in {
          from { opacity: 0; transform: scale(0.85); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}