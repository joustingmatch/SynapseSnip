import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { RecordingTickEvent } from "../../types";

type Rect = { x: number; y: number; w: number; h: number };

interface RecordingHudProps {
  recordingId: string;
  onStop: () => void;
  onCancel: () => void;
  width: number;
  height: number;
  format: string;
  stopping?: boolean;
  rect?: Rect;
  viewportW?: number;
  viewportH?: number;
}

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

const HUD_PAD = 8;
const HUD_WIDTH = 280;
const HUD_HEIGHT = 44;

export function computeHudRect(
  rect: Rect | undefined,
  viewportW: number,
  viewportH: number
): { top: number; left: number; width: number; height: number } {
  const rectsOverlap = (
    ax: number, ay: number, aw: number, ah: number,
    bx: number, by: number, bw: number, bh: number
  ) => ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;

  if (rect) {
    const candidates: Array<{ top: number; left: number }> = [
      { top: rect.y - HUD_HEIGHT - HUD_PAD, left: rect.x + rect.w - HUD_WIDTH },
      { top: rect.y - HUD_HEIGHT - HUD_PAD, left: rect.x },
      { top: rect.y + rect.h + HUD_PAD, left: rect.x + rect.w - HUD_WIDTH },
      { top: rect.y + rect.h + HUD_PAD, left: rect.x },
      { top: HUD_PAD, left: viewportW - HUD_WIDTH - HUD_PAD },
      { top: HUD_PAD, left: HUD_PAD },
      { top: viewportH - HUD_HEIGHT - HUD_PAD, left: viewportW - HUD_WIDTH - HUD_PAD },
      { top: viewportH - HUD_HEIGHT - HUD_PAD, left: HUD_PAD },
    ];
    const chosen = candidates.find(
      (c) =>
        c.top >= HUD_PAD &&
        c.left >= HUD_PAD &&
        c.top + HUD_HEIGHT <= viewportH - HUD_PAD &&
        c.left + HUD_WIDTH <= viewportW - HUD_PAD &&
        !rectsOverlap(c.left, c.top, HUD_WIDTH, HUD_HEIGHT, rect.x, rect.y, rect.w, rect.h),
    );
    if (chosen) {
      return { top: chosen.top, left: chosen.left, width: HUD_WIDTH, height: HUD_HEIGHT };
    }
  }
  return {
    top: HUD_PAD,
    left: viewportW - HUD_WIDTH - HUD_PAD,
    width: HUD_WIDTH,
    height: HUD_HEIGHT,
  };
}

export function RecordingHud({
  recordingId,
  onStop,
  onCancel,
  width,
  height,
  format,
  stopping = false,
  rect,
  viewportW,
  viewportH,
}: RecordingHudProps) {
  const [elapsed, setElapsed] = useState(0);
  const [bytes, setBytes] = useState(0);
  useEffect(() => {
    const unlisten = listen<RecordingTickEvent>("recording-tick", (event) => {
      if (event.payload.id === recordingId) {
        setElapsed(event.payload.elapsed_ms);
        setBytes(event.payload.bytes_written);
      }
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, [recordingId]);

  const hud = computeHudRect(rect, viewportW ?? window.innerWidth, viewportH ?? window.innerHeight);

  const posStyle: React.CSSProperties = {
    position: "fixed",
    top: hud.top,
    left: hud.left,
    zIndex: 10000,
    pointerEvents: "auto",
    fontFamily: "var(--font-mono)",
  };

  return (
    <div style={posStyle}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 14px",
          borderRadius: 4,
          background: "var(--bg-secondary)",
          border: "1px solid var(--border-default)",
        }}
      >
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: stopping ? "var(--warning)" : "var(--error)",
            animation: stopping ? "none" : "recording-pulse 1.6s ease-in-out infinite",
          }}
        />

        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <span
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "var(--text-primary)",
              fontVariantNumeric: "tabular-nums",
              letterSpacing: 0,
              fontFamily: "var(--font-mono)",
            }}
          >
            {stopping ? "Finalizing..." : formatTime(elapsed)}
          </span>
          <span 
            style={{ 
              fontSize: 11, 
              color: "var(--text-muted)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {width}×{height} · {format.toUpperCase()} · {formatBytes(bytes)}
          </span>
        </div>

        {!stopping && (
          <button
            onClick={onStop}
            style={{
              width: 28,
              height: 28,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 4,
              border: "1px solid var(--border-strong)",
              cursor: "pointer",
              background: "var(--surface-active)",
              color: "var(--text-primary)",
              transition: "background 150ms ease, border-color 150ms ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--surface-pressed)";
              e.currentTarget.style.borderColor = "var(--border-default)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--surface-active)";
              e.currentTarget.style.borderColor = "var(--border-strong)";
            }}
            title="Stop recording (Space)"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <rect x="4" y="4" width="16" height="16" rx="2" />
            </svg>
          </button>
        )}

        {!stopping && (
          <button
            onClick={onCancel}
            style={{
              width: 28,
              height: 28,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 4,
              border: "none",
              cursor: "pointer",
              background: "transparent",
              color: "var(--text-tertiary)",
              transition: "background 150ms ease, color 150ms ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--error-subtle)";
              e.currentTarget.style.color = "var(--error)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "var(--text-tertiary)";
            }}
            title="Cancel recording (Esc)"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
