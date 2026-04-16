import React, { useEffect, useState } from "react";

/**
 * GridBackground - Subtle dot grid that adds texture without distraction.
 * Pauses animation when tab is not visible to save resources.
 */
export const GridBackground: React.FC = () => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsVisible(document.visibilityState === "visible");
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden select-none">
      {/* Base Grid */}
      <div 
        className="absolute inset-0 animate-breathe"
        style={{
          backgroundImage: `radial-gradient(circle, var(--border-default) 1px, transparent 1px)`,
          backgroundSize: '24px 24px',
          opacity: isVisible ? 0.4 : 0.2,
          animationPlayState: isVisible ? 'running' : 'paused',
        }}
      />
      
      {/* Radial Fade to focus center */}
      <div 
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 0%, var(--bg-primary) 80%)',
        }}
      />
    </div>
  );
};
