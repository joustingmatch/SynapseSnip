import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

function parseParams(): Record<string, string> {
  const h = window.location.hash;
  const q = h.includes("?") ? h.slice(h.indexOf("?") + 1) : "";
  const params: Record<string, string> = {};
  new URLSearchParams(q).forEach((v, k) => { params[k] = v; });
  return params;
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, "0")}`;
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

async function revealInFolder(path: string) {
  try {
    await invoke("reveal_path_in_folder", { path });
  } catch {}
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {}
}

export function VideoNotificationPage() {
  const params = parseParams();
  const [mounted, setMounted] = useState(false);
  const [hover, setHover] = useState(false);

  const filePath = params.path || "";
  const format = params.format || "mp4";
  const width = Number(params.width) || 0;
  const height = Number(params.height) || 0;
  const durationMs = Number(params.duration_ms) || 0;
  const sizeBytes = Number(params.size_bytes) || 0;

  useEffect(() => {
    setMounted(false);
    const t = window.setTimeout(() => setMounted(true), 16);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void invoke("release_notification_window");
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const un = listen("video-notif-reload", () => {
      setMounted(false);
      requestAnimationFrame(() => setMounted(true));
    });
    return () => { un.then((f) => f()); };
  }, []);

  const dismiss = async () => {
    await invoke("release_notification_window");
  };

  return (
    <div
      className="w-screen h-screen bg-transparent select-none overflow-hidden"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div
        className="relative group w-full h-full overflow-hidden rounded cursor-pointer animate-fade-in-up"
        style={{
          transform: mounted ? "scale(1)" : "scale(0.95)",
          opacity: mounted ? 1 : 0,
          transition: "transform 400ms var(--ease-out-expo), opacity 300ms ease",
          border: "1px solid var(--border-default)",
          background: "var(--bg-secondary)",
        }}
      >
        <div className="flex flex-col items-center justify-center h-full p-4" style={{ gap: 8 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              background: "var(--accent-subtle)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polygon points="10 8 16 12 10 16 10 8" fill="var(--accent)" />
            </svg>
          </div>

          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
            Video Recorded
          </div>

          <div style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
            {width}×{height} · {format.toUpperCase()} · {formatDuration(durationMs)} · {formatBytes(sizeBytes)}
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button
              onClick={(e) => { e.stopPropagation(); void revealInFolder(filePath); }}
              style={{
                padding: "4px 12px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border-default)",
                background: "var(--surface-default)",
                color: "var(--text-secondary)",
                fontSize: 11,
                cursor: "pointer",
                fontFamily: "var(--font-mono)",
              }}
            >
              Reveal in folder
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); void copyToClipboard(filePath); }}
              style={{
                padding: "4px 12px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border-default)",
                background: "var(--surface-default)",
                color: "var(--text-secondary)",
                fontSize: 11,
                cursor: "pointer",
                fontFamily: "var(--font-mono)",
              }}
            >
              Copy path
            </button>
          </div>
        </div>

        <div
          className="absolute top-3 right-3 flex items-center gap-2"
          style={{
            opacity: hover ? 1 : 0,
            transform: hover ? "translateY(0)" : "translateY(-8px)",
            transition: "opacity 200ms ease, transform 200ms var(--ease-out-expo)",
          }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); void dismiss(); }}
            className="btn-icon"
            style={{ background: "var(--bg-secondary)", width: 28, height: 28 }}
            title="Dismiss"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div
          className="absolute bottom-0 left-0 right-0 h-0.5"
          style={{ background: "var(--border-subtle)" }}
        >
          <div
            className="h-full"
            style={{
              width: "100%",
              background: "var(--accent)",
              transformOrigin: "left",
              animation: "progress 5s linear forwards",
            }}
          />
        </div>
      </div>

      <style>{`
        @keyframes progress { from { transform: scaleX(1); } to { transform: scaleX(0); } }
      `}</style>
    </div>
  );
}