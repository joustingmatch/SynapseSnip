import { useEffect, useState, useRef, useCallback } from "react";

interface Props {
  value: string;
  onChange: (v: string) => void;
}

const MOD_KEYS = new Set(["Control", "Shift", "Alt", "Meta"]);

function keyLabel(e: KeyboardEvent): string | null {
  const k = e.key;
  if (MOD_KEYS.has(k)) return null;
  if (k === " ") return "Space";
  if (k.length === 1) return k.toUpperCase();
  return k;
}

export function HotkeyRecorder({ value, onChange }: Props) {
  const [recording, setRecording] = useState(false);
  const recordButtonRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleStartRecording = useCallback(() => {
    setRecording(true);
  }, []);

  const handleCancelRecording = useCallback(() => {
    setRecording(false);
  }, []);

  const handleClear = useCallback(() => {
    onChange("");
  }, [onChange]);

  useEffect(() => {
    if (!recording) return;
    
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      if (e.key === "Escape") {
        setRecording(false);
        // Return focus to the record button
        setTimeout(() => recordButtonRef.current?.focus(), 0);
        return;
      }
      
      const k = keyLabel(e);
      if (!k) return;
      
      const parts: string[] = [];
      if (e.ctrlKey) parts.push("Ctrl");
      if (e.shiftKey) parts.push("Shift");
      if (e.altKey) parts.push("Alt");
      if (e.metaKey) parts.push("Cmd");
      parts.push(k);
      
      onChange(parts.join("+"));
      setRecording(false);
      // Return focus to the record button
      setTimeout(() => recordButtonRef.current?.focus(), 0);
    };
    
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [recording, onChange]);

  // Handle blur to cancel recording if clicking outside
  useEffect(() => {
    if (!recording) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setRecording(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [recording]);

  const displayId = `hotkey-display-${Math.random().toString(36).substr(2, 9)}`;

  return (
    <div 
      ref={containerRef}
      className="flex gap-2 items-center" 
      style={{ fontFamily: 'var(--font-mono)' }}
    >
      <div
        id={displayId}
        className={`
          flex-1 px-3 py-2 rounded text-sm min-h-[36px] flex items-center
          ${recording ? "animate-pulse" : ""}
        `}
        style={{
          background: recording ? 'var(--accent-subtle)' : 'var(--bg-primary)',
          color: recording ? 'var(--accent)' : value ? 'var(--text-secondary)' : 'var(--text-muted)',
          border: `1px solid ${recording ? 'var(--accent)' : 'var(--border-default)'}`,
          borderRadius: 'var(--radius-md)',
          fontFamily: 'var(--font-mono)',
          transition: 'all var(--duration-fast) ease',
        }}
        aria-live="polite"
        aria-atomic="true"
        aria-label={recording ? "Recording keyboard shortcut" : `Current shortcut: ${value || "None"}`}
      >
        {recording ? (
          <span 
            className="uppercase tracking-wide"
            style={{ color: 'var(--accent)' }}
          >
            Press keys...
          </span>
        ) : (
          <span>{value || "None"}</span>
        )}
      </div>
      <button
        ref={recordButtonRef}
        type="button"
        onClick={recording ? handleCancelRecording : handleStartRecording}
        className="btn-secondary text-sm h-9 px-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        style={{
          color: recording ? 'var(--accent)' : 'var(--text-secondary)',
          transition: 'all var(--duration-fast) ease',
        }}
        aria-label={recording ? "Cancel recording" : "Record new keyboard shortcut"}
        aria-pressed={recording}
      >
        {recording ? "Cancel" : "Record"}
      </button>
      {value && !recording && (
        <button
          type="button"
          onClick={handleClear}
          className="btn-ghost h-9 px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          aria-label="Clear keyboard shortcut"
        >
          Clear
        </button>
      )}
    </div>
  );
}
