import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { cancelCapture, finalizeCapture, getPendingCapture, getPendingSrc, startVideoRecording, stopVideoRecording, cancelVideoRecording, setOverlayPassthrough, markOverlayReady } from "../hooks/useCapture";
import type { PendingInfo, Settings } from "../types";
import { CaptureModeBar, type CaptureMode } from "../components/capture/CaptureModeBar";
import { CountdownOverlay } from "../components/capture/CountdownOverlay";
import { RecordingHud, computeHudRect } from "../components/capture/RecordingHud";

type Pt = { x: number; y: number };
type Rect = { x: number; y: number; w: number; h: number };
type Phase = "selecting" | "countdown" | "recording" | "stopping";

export function OverlayPage() {
  const [info, setInfo] = useState<PendingInfo | null>(null);
  const [phase, setPhase] = useState<Phase>("selecting");
  const [captureMode, setCaptureMode] = useState<CaptureMode>("screenshot");
  const [pendingSrc, setPendingSrc] = useState(() => `${getPendingSrc()}?rev=${Date.now()}`);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [recordingFormat, setRecordingFormat] = useState("mp4");
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const errorTimerRef = useRef<number | null>(null);
  const [recordingW, setRecordingW] = useState(0);
  const [recordingH, setRecordingH] = useState(0);
  const [countdownValue, setCountdownValue] = useState(0);

  const startRef = useRef<Pt | null>(null);
  const curRef = useRef<Pt | null>(null);
  const committedRef = useRef<Rect | null>(null);
  const infoRef = useRef<PendingInfo | null>(null);
  const scheduleRenderRef = useRef<() => void>(() => {});
  const phaseRef = useRef<Phase>("selecting");
  const captureModeRef = useRef<CaptureMode>("screenshot");

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    captureModeRef.current = captureMode;
  }, [captureMode]);

  useEffect(() => {
    infoRef.current = info;
  }, [info]);

  useEffect(() => {
    let alive = true;
    const loadPending = async () => {
      try {
        const pending = await getPendingCapture();
        if (!alive) return;
        const newSrc = `${getPendingSrc()}?rev=${Date.now()}`;
        // Pre-decode so the very first paint after we reveal the window
        // already contains the new screenshot — no flash of stale content.
        try {
          const pre = new Image();
          pre.src = newSrc;
          if (typeof pre.decode === "function") {
            await pre.decode();
          } else {
            await new Promise<void>((res) => {
              pre.onload = () => res();
              pre.onerror = () => res();
            });
          }
        } catch {}
        if (!alive) return;
        startRef.current = null;
        curRef.current = null;
        committedRef.current = null;
        setPhase("selecting");
        setCaptureMode("screenshot");
        setRecordingId(null);
        setRecordingError(null);
        setCountdownValue(0);
        setPendingSrc(newSrc);
        setInfo(pending);
        // After React commits and the browser composites the first frame
        // (double rAF), tell Rust it's safe to reveal the overlay window.
        requestAnimationFrame(() => {
          scheduleRenderRef.current();
          requestAnimationFrame(() => {
            void markOverlayReady().catch(() => {});
          });
        });
      } catch {
        if (!alive) return;
        setInfo(null);
      }
    };

    void loadPending();
    let unlisten: (() => void) | null = null;
    listen("overlay-refresh", () => {
      void loadPending();
    }).then((un) => {
      unlisten = un;
    });

    return () => {
      alive = false;
      if (unlisten) unlisten();
    };
  }, []);

  const getSelection = useCallback((): Rect | null => {
    if (committedRef.current) return committedRef.current;
    const start = startRef.current;
    const cur = curRef.current;
    if (!start || !cur) return null;
    return {
      x: Math.min(start.x, cur.x),
      y: Math.min(start.y, cur.y),
      w: Math.abs(cur.x - start.x),
      h: Math.abs(cur.y - start.y),
    };
  }, []);

  const submit = useCallback(async (logicalX: number, logicalY: number, logicalW: number, logicalH: number) => {
    const data = infoRef.current;
    if (!data) return;
    const sx = data.origin_x + Math.round(logicalX * data.scale);
    const sy = data.origin_y + Math.round(logicalY * data.scale);
    const sw = Math.max(1, Math.round(logicalW * data.scale));
    const sh = Math.max(1, Math.round(logicalH * data.scale));
    try {
      await finalizeCapture(sx, sy, sw, sh);
    } catch {
      await cancelCapture();
    }
  }, []);

  const startRecording = async (rect: Rect, data: PendingInfo, settings: Settings) => {
    const sx = data.origin_x + Math.round(rect.x * data.scale);
    const sy = data.origin_y + Math.round(rect.y * data.scale);
    const sw = Math.max(1, Math.round(rect.w * data.scale));
    const sh = Math.max(1, Math.round(rect.h * data.scale));
    setRecordingW(sw);
    setRecordingH(sh);
    setRecordingFormat(settings.recording_format || "mp4");
    setRecordingError(null);

    try {
      const id = await startVideoRecording(sx, sy, sw, sh, {
        format: settings.recording_format || "mp4",
        fps: settings.recording_fps || 30,
        microphone: settings.recording_microphone || false,
        microphone_device: settings.recording_microphone_device || "",
        system_audio: settings.recording_system_audio || false,
        system_audio_device: settings.recording_system_audio_device || "",
        show_cursor: settings.recording_show_cursor !== false,
        click_highlight: settings.recording_click_highlight || false,
        countdown_seconds: 0,
        max_duration_seconds: settings.recording_max_duration_seconds || 0,
      });
      setRecordingId(id);
      setPhase("recording");
    } catch (err) {
      console.error("startVideoRecording failed:", err);
      setRecordingError(String(err));
      committedRef.current = null;
      setPhase("selecting");
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      errorTimerRef.current = window.setTimeout(() => setRecordingError(null), 5000);
      scheduleRenderRef.current();
    }
  };

  const beginRecord = useCallback((rect: Rect) => {
    const data = infoRef.current;
    if (!data) return;
    void invoke<Settings>("load_settings").then((s) => {
      const countdown = s.recording_countdown_seconds || 0;
      if (countdown > 0) {
        setCountdownValue(countdown);
        setPhase("countdown");
      } else {
        void startRecording(rect, data, s);
      }
    });
  }, []);

  const handleStopRecording = useCallback(async () => {
    if (!recordingId) return;
    setPhase("stopping");
    try {
      await stopVideoRecording(recordingId);
      setRecordingId(null);
      setPhase("selecting");
      void cancelCapture();
    } catch {
      setRecordingId(null);
      setPhase("selecting");
      void cancelCapture();
    }
  }, [recordingId]);

  const handleCancelRecording = useCallback(async () => {
    if (!recordingId) return;
    try {
      await cancelVideoRecording(recordingId);
    } catch {}
    setRecordingId(null);
    setPhase("selecting");
    await cancelCapture();
  }, [recordingId]);

  const beginRecordingAfterCountdown = useCallback(() => {
    const selected = committedRef.current;
    const data = infoRef.current;
    if (!selected || !data) {
      committedRef.current = null;
      setPhase("selecting");
      return;
    }
    void invoke<Settings>("load_settings").then((s) => {
      void startRecording(selected, data, s);
    });
  }, []);

  const beginRecordingAfterCountdownRef = useRef(beginRecordingAfterCountdown);
  useEffect(() => { beginRecordingAfterCountdownRef.current = beginRecordingAfterCountdown; }, [beginRecordingAfterCountdown]);

  const drawOnce = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number, tick: number) => {
      const data = infoRef.current;
      if (!data) return false;

      ctx.clearRect(0, 0, width, height);

      // In record mode we need the overlay region transparent so ffmpeg
      // gdigrab captures the live desktop, not our cached PNG or dim mask.
      const recordMode = captureModeRef.current === "record";
      if (!recordMode) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
        ctx.fillRect(0, 0, width, height);
      }

      const sel = getSelection();
      const cur = curRef.current;

      if (sel) {
        const { x, y, w, h } = sel;

        if (!recordMode) ctx.clearRect(x, y, w, h);

        const isRecording = phaseRef.current === "recording" || phaseRef.current === "stopping";
        ctx.save();
        if (isRecording) {
          ctx.strokeStyle = "#ef4444";
          ctx.lineWidth = 2;
          ctx.setLineDash([]);
          ctx.strokeRect(x - 1, y - 1, w + 2, h + 2);
        } else {
          ctx.strokeStyle = recordMode ? "#ef4444" : "var(--accent)";
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 4]);
          ctx.lineDashOffset = -tick * 0.3;
          // In record mode, stroke OUTSIDE the region so ffmpeg doesn't
          // capture our marching ants.
          if (recordMode) {
            ctx.strokeRect(x - 1, y - 1, w + 2, h + 2);
          } else {
            ctx.strokeRect(x + 0.5, y + 0.5, w, h);
          }
        }
        ctx.restore();

        if (!isRecording && !recordMode) {
          ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
          ctx.lineWidth = 1;
          ctx.setLineDash([]);
          ctx.strokeRect(x + 1.5, y + 1.5, w - 2, h - 2);
        }

        if (!isRecording) {
          const physW = Math.round(w * data.scale);
          const physH = Math.round(h * data.scale);
          const label = `${physW} × ${physH}`;
          ctx.font = "500 12px var(--font-mono)";
          const pad = 8;
          const tw = ctx.measureText(label).width + pad * 2;
          const th = 24;
          const anchor = cur ?? { x: x + w, y: y + h };
          let lx = anchor.x + 12;
          let ly = anchor.y + 12;
          if (lx + tw > width) lx = anchor.x - tw - 12;
          if (ly + th > height) ly = anchor.y - th - 12;

          ctx.fillStyle = "var(--bg-secondary)";
          ctx.beginPath();
          ctx.roundRect(lx, ly, tw, th, 4);
          ctx.fill();

          ctx.fillStyle = "var(--text-primary)";
          ctx.fillText(label, lx + pad, ly + 16);
        }
      }

      if (cur && phaseRef.current === "selecting" && !recordMode) {
        ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(cur.x, 0);
        ctx.lineTo(cur.x, height);
        ctx.moveTo(0, cur.y);
        ctx.lineTo(width, cur.y);
        ctx.stroke();
      }

      return !!sel;
    },
    [getSelection],
  );

  useEffect(() => {
    if (!info) return;
    const c = canvasRef.current;
    if (!c) return;

    let ctx: CanvasRenderingContext2D | null = c.getContext("2d");
    if (!ctx) return;

    const fitCanvas = () => {
      const dpr = window.devicePixelRatio || 1;
      c.width = Math.max(1, Math.round(window.innerWidth * dpr));
      c.height = Math.max(1, Math.round(window.innerHeight * dpr));
      c.style.width = window.innerWidth + "px";
      c.style.height = window.innerHeight + "px";
      ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    fitCanvas();

    let raf = 0;
    let tick = 0;

    const renderFrame = () => {
      raf = 0;
      tick += 1;
      if (!ctx) return;
      const animating = drawOnce(ctx, window.innerWidth, window.innerHeight, tick);
      if (animating) raf = requestAnimationFrame(renderFrame);
    };

    const scheduleRender = () => {
      if (raf) return;
      raf = requestAnimationFrame(renderFrame);
    };

    scheduleRenderRef.current = scheduleRender;

    const onResize = () => {
      fitCanvas();
      scheduleRender();
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (phaseRef.current === "recording" || phaseRef.current === "stopping") {
          e.preventDefault();
          e.stopPropagation();
          void handleCancelRecording();
          return;
        }
        if (phaseRef.current === "countdown") {
          e.preventDefault();
          setCountdownValue(0);
          committedRef.current = null;
          setPhase("selecting");
          scheduleRender();
          return;
        }
        void cancelCapture();
        return;
      }
      if (phaseRef.current === "selecting") {
        if (e.key === "s" || e.key === "S") {
          e.preventDefault();
          setCaptureMode("screenshot");
          scheduleRender();
          return;
        }
        if (e.key === "r" || e.key === "R") {
          e.preventDefault();
          setCaptureMode("record");
          scheduleRender();
          return;
        }
      }
      if (e.key === " " || e.key === "Spacebar") {
        if (phaseRef.current === "recording") {
          e.preventDefault();
          void handleStopRecording();
          return;
        }
        if (phaseRef.current === "countdown") {
          e.preventDefault();
          beginRecordingAfterCountdownRef.current();
          return;
        }
      }
    };

    window.addEventListener("resize", onResize);
    window.addEventListener("keydown", onKey);
    scheduleRender();

    return () => {
      if (raf) cancelAnimationFrame(raf);
      scheduleRenderRef.current = () => {};
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey);
    };
  }, [drawOnce, info, handleCancelRecording, handleStopRecording]);

  // Re-render canvas when mode toggles so fill/strokes update immediately.
  useEffect(() => {
    scheduleRenderRef.current();
  }, [captureMode]);

  // While recording, the overlay window must be cursor-transparent so clicks
  // reach the live desktop. The HUD region is kept interactive via a Rust-side
  // cursor-position poller that toggles set_ignore_cursor_events dynamically.
  useEffect(() => {
    const isRecording = phase === "recording" || phase === "stopping";
    if (!isRecording || !info) {
      void setOverlayPassthrough(null).catch(() => {});
      return;
    }
    const selected = committedRef.current;
    if (!selected) return;
    const hud = computeHudRect(selected, window.innerWidth, window.innerHeight);
    const px = info.origin_x + Math.round(hud.left * info.scale);
    const py = info.origin_y + Math.round(hud.top * info.scale);
    const pw = Math.max(1, Math.round(hud.width * info.scale));
    const ph = Math.max(1, Math.round(hud.height * info.scale));
    void setOverlayPassthrough([px, py, pw, ph]).catch(() => {});
    return () => {
      void setOverlayPassthrough(null).catch(() => {});
    };
  }, [phase, info]);

  const onDown = (e: React.MouseEvent) => {
    if (phase !== "selecting") return;
    committedRef.current = null;
    startRef.current = { x: e.clientX, y: e.clientY };
    curRef.current = { x: e.clientX, y: e.clientY };
    scheduleRenderRef.current();
  };

  const onMove = (e: React.MouseEvent) => {
    if (phase !== "selecting") return;
    curRef.current = { x: e.clientX, y: e.clientY };
    scheduleRenderRef.current();
  };

  const onUp = () => {
    if (phase !== "selecting") return;
    const start = startRef.current;
    const cur = curRef.current;
    if (!start || !cur) {
      startRef.current = null;
      scheduleRenderRef.current();
      return;
    }

    const x = Math.min(start.x, cur.x);
    const y = Math.min(start.y, cur.y);
    const w = Math.max(1, Math.abs(cur.x - start.x));
    const h = Math.max(1, Math.abs(cur.y - start.y));

    startRef.current = null;

    if (w > 4 && h > 4) {
      const rect: Rect = { x, y, w, h };
      committedRef.current = rect;
      if (captureModeRef.current === "screenshot") {
        void submit(rect.x, rect.y, rect.w, rect.h);
      } else {
        beginRecord(rect);
      }
    }

    scheduleRenderRef.current();
  };

  const handleCancel = useCallback(() => {
    void cancelCapture();
  }, []);

  if (!info) {
    return <div style={{ width: "100vw", height: "100vh", background: "transparent" }} />;
  }

  const selectedRect = committedRef.current || getSelection();
  const showPendingImage = captureMode === "screenshot" && phase === "selecting";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        cursor: phase === "selecting" ? "crosshair" : "default",
        background: captureMode === "record" ? "transparent" : "#000",
        userSelect: "none",
      }}
      onMouseDown={onDown}
      onMouseMove={onMove}
      onMouseUp={onUp}
    >
      {showPendingImage && (
        <img
          src={pendingSrc}
          alt=""
          draggable={false}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "fill",
            pointerEvents: "none",
            userSelect: "none",
          }}
        />
      )}
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, pointerEvents: "none" }} />

      {phase === "selecting" && (
        <CaptureModeBar
          mode={captureMode}
          onModeChange={setCaptureMode}
          onCancel={handleCancel}
        />
      )}

      {phase === "countdown" && countdownValue > 0 && (
        <CountdownOverlay
          seconds={countdownValue}
          rect={committedRef.current || undefined}
          onSkip={beginRecordingAfterCountdown}
          onComplete={beginRecordingAfterCountdown}
        />
      )}

      {(phase === "recording" || phase === "stopping") && recordingId && selectedRect && (
        <RecordingHud
          recordingId={recordingId}
          onStop={handleStopRecording}
          onCancel={handleCancelRecording}
          width={recordingW}
          height={recordingH}
          format={recordingFormat}
          stopping={phase === "stopping"}
          rect={selectedRect}
          viewportW={window.innerWidth}
          viewportH={window.innerHeight}
        />
      )}

      {recordingError && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            padding: "10px 20px",
            borderRadius: 4,
            background: "var(--error)",
            color: "#fff",
            fontSize: 13,
            fontFamily: "var(--font-mono)",
            zIndex: 10001,
          }}
        >
          Recording failed: {recordingError}
        </div>
      )}
    </div>
  );
}
