import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { attachSnip, closeSelfWindow, forceDiscard, getSnip, getSnipSrc } from "../hooks/useCapture";
import type { CaptureResult } from "../types";

function parseId(): string | null {
  const h = window.location.hash;
  const q = h.includes("?") ? h.slice(h.indexOf("?") + 1) : "";
  return new URLSearchParams(q).get("id");
}

export function FloatingImagePage() {
  const [snip, setSnip] = useState<CaptureResult | null>(null);
  const [hover, setHover] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const id = parseId();
    if (!id) {
      closeSelfWindow();
      return;
    }
    getSnip(id).then(setSnip).catch(() => closeSelfWindow());
    void attachSnip(id);
    const t = window.setTimeout(() => setMounted(true), 16);
    return () => clearTimeout(t);
  }, []);

  const onPointerDown = async (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("[data-no-drag]")) return;
    try {
      await getCurrentWindow().startDragging();
    } catch {}
  };

  const dismiss = async () => {
    if (snip) {
      await forceDiscard(snip.id);
    }
    await closeSelfWindow();
  };

  return (
    <div
      className="w-screen h-screen select-none overflow-hidden"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onPointerDown={onPointerDown}
      style={{ 
        cursor: "grab",
        background: 'transparent'
      }}
    >
      <div
        className="relative w-full h-full"
        style={{
          transform: mounted ? "scale(1)" : "scale(0.95)",
          opacity: mounted ? 1 : 0,
          transition: "transform 300ms var(--ease-out-expo), opacity 200ms ease",
        }}
      >
        {snip ? (
          <img
            src={getSnipSrc(snip.id)}
            alt=""
            draggable={false}
            className="w-full h-full object-contain block rounded"
            style={{
              border: '1px solid var(--border-default)',
            }}
          />
        ) : (
          <div 
            className="w-full h-full flex items-center justify-center"
            style={{ background: 'var(--bg-secondary)' }}
          >
            <div 
              className="w-5 h-5 rounded-full border-2 animate-spin"
              style={{ 
                borderColor: 'var(--border-default)',
                borderTopColor: 'var(--accent)'
              }}
            />
          </div>
        )}

        {/* Close button */}
        <button
          data-no-drag
          onClick={(e) => {
            e.stopPropagation();
            void dismiss();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="btn-icon absolute top-2 right-2"
          style={{
            opacity: hover ? 1 : 0,
            transform: hover ? 'scale(1)' : 'scale(0.9)',
            transition: 'opacity 150ms ease, transform 150ms var(--ease-spring)',
            background: 'var(--bg-secondary)',
            width: '24px',
            height: '24px',
          }}
          title="Dismiss"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
