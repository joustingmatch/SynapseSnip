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
    
    // Handle number change animation
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
    
    prevCountdownRef.current = countdown;
    
    const t = setTimeout(() => {
      if (countdown - 1 <= 0) onDone();
      setCountdown(countdown - 1);
    }, 1000);
    return () => clearTimeout(t);
  }, [countdown, displayNumber, onDone, setCountdown]);

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
        background: 'rgba(0, 0, 0, 0.7)',
        animation: 'fade-in 300ms var(--ease-out-quart) both',
        fontFamily: 'var(--font-mono)',
      }}
    >
      <div 
        className="relative"
        style={{
          animation: 'scale-in 400ms var(--ease-out-expo) 50ms both'
        }}
      >
        {/* Counter card */}
        <div 
          className="relative w-32 h-32 flex items-center justify-center rounded overflow-hidden"
          style={{ 
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-default)',
          }}
        >
          {/* Number */}
          <span 
            className={`text-6xl font-bold relative z-10 countdown-number ${numberClass}`}
            style={{ 
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)',
              lineHeight: 1,
            }}
          >
            {displayNumber}
          </span>
        </div>
        
        <p 
          className="text-center mt-4 text-sm"
          style={{ 
            color: 'var(--text-tertiary)',
            animation: 'fade-in-up 400ms var(--ease-out-expo) 200ms both',
            fontFamily: 'var(--font-mono)',
          }}
        >
          Capturing in...
        </p>
      </div>
    </div>
  );
}
