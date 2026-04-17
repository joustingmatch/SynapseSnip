import { useEffect, useState, useRef } from "react";
import { useAppStore } from "../store/appStore";

export function DelayTimer({ onDone }: { onDone: () => void }) {
  const countdown = useAppStore((s) => s.countdown);
  const setCountdown = useAppStore((s) => s.setCountdown);
  const [displayNumber, setDisplayNumber] = useState(countdown);
  const [numberState, setNumberState] = useState<"idle" | "exiting" | "entering">("idle");
  const prevCountdownRef = useRef(countdown);

  useEffect(() => {
    if (countdown <= 0) return;

    if (countdown !== prevCountdownRef.current && prevCountdownRef.current !== 0) {
      setNumberState("exiting");

      const exitTimeout = setTimeout(() => {
        setDisplayNumber(countdown);
        setNumberState("entering");

        const enterTimeout = setTimeout(() => {
          setNumberState("idle");
        }, 150);

        return () => clearTimeout(enterTimeout);
      }, 100);

      prevCountdownRef.current = countdown;
      return () => clearTimeout(exitTimeout);
    }

    setDisplayNumber(countdown);
    prevCountdownRef.current = countdown;
  }, [countdown]);

  useEffect(() => {
    if (countdown <= 0) return;

    const t = setTimeout(() => {
      if (countdown - 1 <= 0) onDone();
      setCountdown(countdown - 1);
    }, 1000);
    return () => clearTimeout(t);
  }, [countdown, onDone, setCountdown]);

  if (countdown <= 0) return null;
  
  const numberClass = numberState === "exiting" 
    ? "exiting" 
    : numberState === "entering" 
      ? "entering" 
      : "";
  
  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ 
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        animation: 'fade-in 300ms var(--ease-out-quart) both',
        fontFamily: 'var(--font-mono)',
      }}
    >
      {/* Ambient glow behind counter */}
      <div 
        className="absolute w-64 h-64 rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle at center, var(--accent-subtle) 0%, transparent 70%)',
          opacity: 0.5,
          animation: 'ambient-float 8s ease-in-out infinite',
        }}
      />
      
      <div 
        className="relative"
        style={{
          animation: 'scale-in-spring 600ms cubic-bezier(0.34, 1.56, 0.64, 1) 50ms both'
        }}
      >
        {/* Counter card */}
        <div 
          className="relative w-36 h-36 flex items-center justify-center rounded-lg overflow-hidden"
          style={{ 
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-default)',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.02)',
          }}
        >
          {/* Subtle grid pattern */}
          <div 
            className="absolute inset-0 opacity-30"
            style={{
              backgroundImage: 'radial-gradient(circle at center, var(--border-default) 1px, transparent 1px)',
              backgroundSize: '16px 16px',
            }}
          />
          
          {/* Number with flip animation */}
          <span 
            className={`text-7xl relative z-10 countdown-number ${numberClass}`}
            style={{ 
              color: 'var(--accent)',
              fontFamily: 'var(--font-mono)',
              lineHeight: 1,
              fontWeight: 300,
              textShadow: '0 0 30px var(--accent-subtle)',
              transition: 'all 300ms var(--ease-out-expo)',
              transform: numberState === 'exiting' ? 'scale(0.8) rotateX(-20deg)' : 
                         numberState === 'entering' ? 'scale(1.1) rotateX(10deg)' : 'scale(1) rotateX(0)',
              opacity: numberState === 'exiting' ? 0.3 : 1,
            }}
          >
            {displayNumber}
          </span>
          
          {/* Accent ring */}
          <div 
            className="absolute inset-3 rounded-md pointer-events-none"
            style={{
              border: '1px solid var(--accent-subtle)',
              opacity: 0.5,
            }}
          />
        </div>
        
        <p 
          className="text-center mt-5 text-sm"
          style={{ 
            color: 'var(--text-tertiary)',
            animation: 'fade-in-up 400ms var(--ease-out-expo) 200ms both',
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.02em',
          }}
        >
          Capturing in...
        </p>
      </div>
    </div>
  );
}
