import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { startDrag } from "@crabnebula/tauri-plugin-drag";
import {
  attachSnip,
  exportSnipToTemp,
  forceDiscard,
  getSnip,
  getSnipSrc,
  releaseNotificationWindow,
  showFloatingImage,
  showSnipEditor,
} from "../hooks/useCapture";

const PREWARM_ID = "__prewarm__";
const closeSelfWindow = releaseNotificationWindow;
import type { CaptureResult, Settings } from "../types";
import { applyTheme } from "../utils/theme";

const DEFAULT_DURATION_MS = 3000;

function parseId(): string | null {
  const h = window.location.hash;
  const q = h.includes("?") ? h.slice(h.indexOf("?") + 1) : "";
  return new URLSearchParams(q).get("id");
}

export function NotificationPage() {
  const [id, setId] = useState<string | null>(parseId);
  const [snip, setSnip] = useState<CaptureResult | null>(null);
  const [hover, setHover] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [durationMs, setDurationMs] = useState(DEFAULT_DURATION_MS);
  const closeTimer = useRef<number | null>(null);

  const [dragging, setDragging] = useState(false);
  const dragCommittedRef = useRef(false);
  const dragStartingRef = useRef(false);
  const pendingDragRef = useRef<{ x: number; y: number } | null>(null);
  const DRAG_THRESHOLD = 5;

  useEffect(() => {
    setMounted(false);
    const t = window.setTimeout(() => setMounted(true), 16);
    return () => clearTimeout(t);
  }, [resetKey]);

  useEffect(() => {
    if (!id || id === PREWARM_ID) return;
    getSnip(id).then(setSnip).catch(() => closeSelfWindow());
    void attachSnip(id);
  }, [id]);

  useEffect(() => {
    const un = listen<string>("snip-reload", (e) => {
      setId(e.payload);
      setSnip(null);
      setResetKey((k) => k + 1);
    });
    return () => {
      un.then((f) => f());
    };
  }, []);

  useEffect(() => {
    invoke<Settings>("load_settings")
      .then((s) => {
        const secs = Math.max(1, Math.min(60, Number(s.notification_timer_seconds) || 8));
        setDurationMs(secs * 1000);
        if (s.theme) applyTheme(s.theme);
      })
      .catch(() => {});
  }, [resetKey]);

  useEffect(() => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    if (hover) return;
    if (!id || id === PREWARM_ID) return;
    closeTimer.current = window.setTimeout(() => closeSelfWindow(), durationMs);
    return () => {
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
    };
  }, [hover, resetKey, durationMs, id]);

  const openEditor = async () => {
    if (!id) return;
    if (dragCommittedRef.current) {
      dragCommittedRef.current = false;
      return;
    }
    await showSnipEditor(id);
    await closeSelfWindow();
  };

  const beginNativeDrag = async () => {
    if (!id || !snip || dragStartingRef.current) return;
    dragStartingRef.current = true;
    dragCommittedRef.current = true;
    try {
      const path = await exportSnipToTemp(id);
      setDragging(true);
      await startDrag({ item: [path], icon: path, mode: "copy" }, (payload) => {
        setDragging(false);
        dragStartingRef.current = false;
        if (payload.result === "Dropped") {
          closeSelfWindow();
        } else {
          setTimeout(() => {
            dragCommittedRef.current = false;
          }, 250);
        }
      });
    } catch (err) {
      console.error("native drag failed", err);
      setDragging(false);
      dragStartingRef.current = false;
      dragCommittedRef.current = false;
    }
  };

  const onImgPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!id || !snip || e.button !== 0) return;
    pendingDragRef.current = { x: e.clientX, y: e.clientY };
  };

  const onImgPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = pendingDragRef.current;
    if (!p || dragStartingRef.current) return;
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_THRESHOLD) return;
    pendingDragRef.current = null;
    beginNativeDrag();
  };

  const onImgPointerUp = () => {
    pendingDragRef.current = null;
  };

  const dismiss = async () => {
    if (id) await forceDiscard(id);
    await closeSelfWindow();
  };

  const pin = async () => {
    if (!id) return;
    const win = getCurrentWindow();
    const pos = await win.outerPosition();
    const size = await win.outerSize();
    await showFloatingImage(id, pos.x, pos.y, size.width, size.height);
    await closeSelfWindow();
  };

  return (
    <div
      className="w-screen h-screen bg-transparent select-none overflow-hidden"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div
        key={resetKey}
        className="relative group w-full h-full overflow-hidden rounded cursor-pointer animate-fade-in-up"
        style={{
          transform: mounted ? "scale(1)" : "scale(0.95)",
          opacity: mounted ? 1 : 0,
          transition: "transform 400ms var(--ease-out-expo), opacity 300ms ease",
          border: '1px solid var(--border-default)',
        }}
        onClick={openEditor}
      >
        {snip ? (
          <div
            className="relative w-full h-full bg-[var(--bg-secondary)]"
            onPointerDown={onImgPointerDown}
            onPointerMove={onImgPointerMove}
            onPointerUp={onImgPointerUp}
            onPointerCancel={onImgPointerUp}
            style={{ touchAction: "none", cursor: dragging ? "grabbing" : "grab" }}
            title="Click to edit, drag to share"
          >
            <img
              src={getSnipSrc(snip.id)}
              className="w-full h-full object-contain block pointer-events-none"
              alt=""
              draggable={false}
              style={{ 
                opacity: dragging ? 0.5 : 1, 
                transition: "opacity 150ms ease" 
              }}
            />
          </div>
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

        {/* Action buttons */}
        <div 
          className="absolute top-3 right-3 flex items-center gap-2"
          style={{
            opacity: hover ? 1 : 0,
            transform: hover ? 'translateY(0)' : 'translateY(-8px)',
            transition: 'opacity 200ms ease, transform 200ms var(--ease-out-expo)',
          }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              void pin();
            }}
            className="btn-icon"
            style={{ 
              background: 'var(--bg-secondary)',
              width: '28px',
              height: '28px'
            }}
            title="Pin"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v8M5 10h14M8 18v4M16 18v4"/>
            </svg>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              void dismiss();
            }}
            className="btn-icon"
            style={{ 
              background: 'var(--bg-secondary)',
              width: '28px',
              height: '28px'
            }}
            title="Dismiss"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Progress bar */}
        <div 
          className="absolute bottom-0 left-0 right-0 h-0.5"
          style={{ background: 'var(--border-subtle)' }}
        >
          <div
            key={`bar-${resetKey}-${hover ? "p" : "r"}`}
            className="h-full"
            style={{
              width: "100%",
              background: 'var(--accent)',
              transformOrigin: "left",
              animation: hover ? "none" : `progress ${durationMs}ms linear forwards`,
            }}
          />
        </div>
      </div>
      
      <style>{`
        @keyframes progress { 
          from { transform: scaleX(1); } 
          to { transform: scaleX(0); } 
        }
        
        @keyframes slide-in-right {
          from { 
            opacity: 0;
            transform: translateX(20px);
          }
          to { 
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
}
