import { useEffect, useRef, useState } from "react";
import { RecordingOptionsDropdown } from "./RecordingOptionsDropdown";

export type CaptureMode = "screenshot" | "record";

interface CaptureModeBarProps {
  mode: CaptureMode;
  onModeChange: (mode: CaptureMode) => void;
  onCancel: () => void;
}

export function CaptureModeBar({ mode, onModeChange, onCancel }: CaptureModeBarProps) {
  const [showOptions, setShowOptions] = useState(false);
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(t);
  }, []);

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <div
      ref={ref}
      onMouseDown={stop}
      onMouseMove={stop}
      onMouseUp={stop}
      onDoubleClick={stop}
      style={{
        position: "fixed",
        top: 16,
        left: "50%",
        transform: `translate(-50%, ${mounted ? "0" : "-6px"})`,
        opacity: mounted ? 1 : 0,
        transition: "opacity 150ms ease-out, transform 150ms ease-out",
        zIndex: 9999,
        pointerEvents: "auto",
        fontFamily: "var(--font-mono)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 8px",
          borderRadius: 4,
          background: "var(--bg-secondary)",
          border: "1px solid var(--border-default)",
        }}
      >
        <ModeButton
          active={mode === "screenshot"}
          onClick={() => onModeChange("screenshot")}
          title="Screenshot (S)"
          label="Screenshot"
          hotkey="S"
          icon={
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          }
        />

        <ModeButton
          active={mode === "record"}
          onClick={() => onModeChange("record")}
          title="Record (R)"
          label="Record"
          hotkey="R"
          icon={
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="4" fill="currentColor" />
            </svg>
          }
        />

        <div style={{ width: 1, height: 20, background: "var(--border-subtle)" }} />

        <IconBtn
          onClick={() => setShowOptions((v) => !v)}
          title="Recording options"
          disabled={mode !== "record"}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </IconBtn>

        <IconBtn onClick={onCancel} title="Cancel (Esc)">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </IconBtn>
      </div>

      {showOptions && mode === "record" && (
        <RecordingOptionsDropdown onClose={() => setShowOptions(false)} />
      )}
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  title,
  label,
  hotkey,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  label: string;
  hotkey: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        height: 28,
        padding: "0 10px",
        borderRadius: 4,
        border: active ? "1px solid var(--accent)" : "1px solid var(--border-default)",
        cursor: "pointer",
        background: active ? "var(--accent-subtle)" : "var(--surface-default)",
        color: active ? "var(--accent)" : "var(--text-secondary)",
        fontSize: 11,
        fontWeight: 600,
        fontFamily: "var(--font-mono)",
        transition: "background 120ms ease, color 120ms ease, border-color 120ms ease",
      }}
    >
      {icon}
      <span>{label}</span>
      <span
        style={{
          fontSize: 9,
          padding: "1px 4px",
          borderRadius: 2,
          background: "var(--surface-hover)",
          color: "var(--text-tertiary)",
          fontWeight: 500,
        }}
      >
        {hotkey}
      </span>
    </button>
  );
}

function IconBtn({
  onClick,
  title,
  children,
  disabled = false,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      style={{
        width: 26,
        height: 26,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 4,
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        background: "transparent",
        color: disabled ? "var(--text-muted)" : "var(--text-tertiary)",
        opacity: disabled ? 0.5 : 1,
        transition: "background 120ms ease, color 120ms ease",
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        e.currentTarget.style.background = "var(--surface-hover)";
        e.currentTarget.style.color = "var(--text-primary)";
      }}
      onMouseLeave={(e) => {
        if (disabled) return;
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = "var(--text-tertiary)";
      }}
    >
      {children}
    </button>
  );
}
