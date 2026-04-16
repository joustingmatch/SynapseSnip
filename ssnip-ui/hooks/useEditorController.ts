import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useToast } from "../components/Toast";
import { useAppStore } from "../store/appStore";
import {
  attachSnip,
  closeSelfWindow,
  copyPngBytesToClipboard,
  forceDiscard,
  getSnip,
  getSnipPngBytes,
  releaseSnipRef,
  retainSnip,
  saveImage,
  storeSnipBytes,
} from "./useCapture";
import { renderAnnotations } from "./useAnnotation";
import { useKeyboardUndoRedo } from "./useHotkeys";
import type { Annotation, CaptureResult, Settings } from "../types";
import { DEFAULT_SETTINGS } from "../utils/defaultSettings";
import { formatFilename } from "../utils/filename";
import { applyTheme } from "../utils/theme";

type CropRect = { x: number; y: number; w: number; h: number };
type CaptureSnapshot = {
  capture: CaptureResult;
  annotations: Annotation[];
  refKey: string;
};

type EditorController = {
  capture: CaptureResult | null;
  showSettings: boolean;
  setShowSettings: (next: boolean) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onCrop: (rect: CropRect) => Promise<void>;
  onSaveAs: () => Promise<void>;
  onClose: () => Promise<void>;
};

function buildDefaultSavePath(settings: Settings | null): string {
  const ext = settings?.default_format || "png";
  const template = settings?.filename_template || "snip-{yyyy}{MM}{dd}-{HH}{mm}{ss}";
  const dir = (settings?.default_save_dir || "").replace(/[\\/]+$/, "");
  return dir
    ? `${dir}${dir.includes("\\") ? "\\" : "/"}${formatFilename(template, ext)}`
    : formatFilename(template, ext);
}

function normalizeSavePath(rawPath: string): string {
  if (!rawPath.startsWith("file://")) {
    return rawPath;
  }
  const url = new URL(rawPath);
  const decoded = decodeURIComponent(url.pathname);
  if (/^\/[A-Za-z]:\//.test(decoded)) {
    return decoded.slice(1);
  }
  return decoded;
}

function resolveFormatFromPath(path: string, fallback: string): string {
  const fileName = path.slice(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1);
  const match = fileName.match(/\.([^.]+)$/);
  return match?.[1]?.toLowerCase() || fallback.toLowerCase();
}

function ensurePathExtension(path: string, format: string): string {
  const normalized = normalizeSavePath(path);
  const fileName = normalized.slice(Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\")) + 1);
  if (/\.[^.]+$/.test(fileName)) {
    return normalized;
  }
  return `${normalized}.${format.toLowerCase()}`;
}

const CAPTURE_HISTORY_LIMIT = 20;
const EDITOR_AUTOSAVE_COPY_DELAY_MS = 300;

function parseEditorId(): string | null {
  const hash = window.location.hash;
  const query = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : "";
  return new URLSearchParams(query).get("id");
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "sync";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    image.src = src;
  });
}

async function loadImageFromBytes(bytes: Uint8Array): Promise<HTMLImageElement> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy.buffer], { type: "image/png" });
  const url = URL.createObjectURL(blob);
  try {
    return await loadImage(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) {
    throw new Error("Failed to export PNG bytes");
  }
  return new Uint8Array(await blob.arrayBuffer());
}

async function mergeCapture(
  capture: CaptureResult,
  annotations: Annotation[],
  blurStrength: number
): Promise<Uint8Array> {
  const canvas = document.createElement("canvas");
  canvas.width = capture.width;
  canvas.height = capture.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to create export canvas context");
  }

  const imageBytes = await getSnipPngBytes(capture.id);
  const image = await loadImageFromBytes(imageBytes);
  ctx.drawImage(image, 0, 0);
  renderAnnotations(ctx, annotations, null, {
    mode: "final",
    blurStrength,
    sourceImage: image,
  });
  return canvasToPngBytes(canvas);
}

async function cropCapture(capture: CaptureResult, rect: CropRect): Promise<CaptureResult> {
  const x = Math.max(0, Math.floor(rect.x));
  const y = Math.max(0, Math.floor(rect.y));
  const w = Math.max(1, Math.floor(rect.w));
  const h = Math.max(1, Math.floor(rect.h));
  const maxW = Math.max(1, capture.width - x);
  const maxH = Math.max(1, capture.height - y);
  const cw = Math.min(w, maxW);
  const ch = Math.min(h, maxH);

  const imageBytes = await getSnipPngBytes(capture.id);
  const src = await loadImageFromBytes(imageBytes);
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to create crop canvas context");
  }
  ctx.drawImage(src, x, y, cw, ch, 0, 0, cw, ch);
  const id = await storeSnipBytes(await canvasToPngBytes(canvas));
  return { id, width: cw, height: ch };
}

export function useEditorController(): EditorController {
  const [snipId, setSnipId] = useState<string | null>(parseEditorId);
  const [capture, setCapture] = useState<CaptureResult | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [captureUndo, setCaptureUndo] = useState<CaptureSnapshot[]>([]);
  const [captureRedo, setCaptureRedo] = useState<CaptureSnapshot[]>([]);
  const captureUndoRef = useRef<CaptureSnapshot[]>([]);
  const captureRedoRef = useRef<CaptureSnapshot[]>([]);

  const annotations = useAppStore((s) => s.annotations);
  const redoStack = useAppStore((s) => s.redoStack);
  const blurStrength = useAppStore((s) => s.blurStrength);
  const showSettings = useAppStore((s) => s.showSettings);
  const setShowSettings = useAppStore((s) => s.setShowSettings);
  const isTypingText = useAppStore((s) => s.isTypingText);
  const clearAnnotations = useAppStore((s) => s.clearAnnotations);
  const undoAnnotation = useAppStore((s) => s.undo);
  const redoAnnotation = useAppStore((s) => s.redo);
  const setColor = useAppStore((s) => s.setColor);
  const setThickness = useAppStore((s) => s.setThickness);
  const toast = useToast();

  const setAnnotations = useCallback((list: Annotation[]) => {
    useAppStore.setState({ annotations: list, redoStack: [] });
  }, []);

  const persistMergedCapture = useCallback(
    async (targetCapture: CaptureResult, targetAnnotations: Annotation[], rawPath: string) => {
      const merged = await mergeCapture(targetCapture, targetAnnotations, blurStrength);
      const mergedId = await storeSnipBytes(merged);
      const fallbackFormat = settings?.default_format || "png";
      const normalizedPath = ensurePathExtension(rawPath, fallbackFormat);
      const chosenExt = resolveFormatFromPath(normalizedPath, fallbackFormat);
      try {
        await saveImage(mergedId, normalizedPath, chosenExt);
        return normalizedPath;
      } finally {
        await forceDiscard(mergedId);
      }
    },
    [blurStrength, settings?.default_format]
  );

  const retainSnapshot = useCallback(async (nextCapture: CaptureResult, nextAnnotations: Annotation[]) => {
    const refKey = `capture-history-${crypto.randomUUID()}`;
    await retainSnip(nextCapture.id, refKey);
    return { capture: nextCapture, annotations: nextAnnotations, refKey };
  }, []);

  const discardSnapshots = useCallback(async (snapshots: CaptureSnapshot[]) => {
    await Promise.allSettled(snapshots.map((snapshot) => forceDiscard(snapshot.capture.id)));
  }, []);

  const pushUndoSnapshot = useCallback(async (snapshot: CaptureSnapshot) => {
    const next = [...captureUndoRef.current, snapshot];
    const evicted = next.length > CAPTURE_HISTORY_LIMIT ? next.shift() ?? null : null;
    captureUndoRef.current = next;
    setCaptureUndo(next);
    if (evicted) {
      await forceDiscard(evicted.capture.id);
    }
  }, []);

  const pushRedoSnapshot = useCallback(async (snapshot: CaptureSnapshot) => {
    const next = [snapshot, ...captureRedoRef.current];
    const evicted = next.length > CAPTURE_HISTORY_LIMIT ? next.pop() ?? null : null;
    captureRedoRef.current = next;
    setCaptureRedo(next);
    if (evicted) {
      await forceDiscard(evicted.capture.id);
    }
  }, []);

  const onUndo = useCallback(() => {
    void (async () => {
      if (annotations.length > 0) {
        undoAnnotation();
        return;
      }

      if (!capture || captureUndoRef.current.length === 0) {
        return;
      }

      const prev = captureUndoRef.current[captureUndoRef.current.length - 1];
      const redoSnapshot = await retainSnapshot(capture, annotations);
      await attachSnip(prev.capture.id);
      await releaseSnipRef(prev.refKey);
      setCaptureUndo((history) => {
        const next = history.slice(0, -1);
        captureUndoRef.current = next;
        return next;
      });
      await pushRedoSnapshot(redoSnapshot);
      setCapture(prev.capture);
      setAnnotations(prev.annotations);
    })();
  }, [annotations, capture, pushRedoSnapshot, retainSnapshot, setAnnotations, undoAnnotation]);

  const onRedo = useCallback(() => {
    void (async () => {
      if (redoStack.length > 0) {
        redoAnnotation();
        return;
      }

      if (!capture || captureRedoRef.current.length === 0) {
        return;
      }

      const next = captureRedoRef.current[0];
      const undoSnapshot = await retainSnapshot(capture, annotations);
      await attachSnip(next.capture.id);
      await releaseSnipRef(next.refKey);
      setCaptureRedo((history) => {
        const remaining = history.slice(1);
        captureRedoRef.current = remaining;
        return remaining;
      });
      await pushUndoSnapshot(undoSnapshot);
      setCapture(next.capture);
      setAnnotations(next.annotations);
    })();
  }, [annotations, capture, pushUndoSnapshot, redoAnnotation, redoStack.length, retainSnapshot, setAnnotations]);

  const onSaveAs = useCallback(async () => {
    if (!capture) return;

    useAppStore.getState().flushPendingText();
    const currentAnnotations = useAppStore.getState().annotations;

    if (settings?.auto_copy && currentAnnotations.length > 0) {
      try {
        const bytes = await mergeCapture(capture, currentAnnotations, blurStrength);
        await copyPngBytesToClipboard(bytes);
      } catch (err) {
        console.error("auto-copy edited image failed", err);
      }
    }

    const defaultPath = buildDefaultSavePath(settings);

    let path: string | null = null;
    try {
      path = await save({
        defaultPath,
        filters: [
          { name: "PNG", extensions: ["png"] },
          { name: "JPG", extensions: ["jpg", "jpeg"] },
          { name: "BMP", extensions: ["bmp"] },
        ],
      });
    } catch (err) {
      toast.error(`Save dialog failed: ${String(err)}`);
      return;
    }

    if (!path) return;

    try {
      await persistMergedCapture(capture, currentAnnotations, path);
      toast.success("Snip saved");
    } catch (err) {
      toast.error(`Save failed: ${String(err)}`);
    }
  }, [blurStrength, capture, persistMergedCapture, settings, toast]);

  const onClose = useCallback(async () => {
    if (capture && settings?.auto_copy) {
      useAppStore.getState().flushPendingText();
      const currentAnnotations = useAppStore.getState().annotations;
      const hasEdits = currentAnnotations.length > 0 || captureUndoRef.current.length > 0;
      if (hasEdits) {
        try {
          const bytes = await mergeCapture(capture, currentAnnotations, blurStrength);
          await copyPngBytesToClipboard(bytes);
        } catch (err) {
          console.error("auto-copy edited image on close failed", err);
        }
      }
    }
    if (capture) {
      await forceDiscard(capture.id);
    }
    await closeSelfWindow();
  }, [blurStrength, capture, settings]);

  const onCrop = useCallback(
    async (rect: CropRect) => {
      if (!capture) {
        return;
      }

      useAppStore.getState().flushPendingText();
      const currentAnnotations = useAppStore.getState().annotations;
      const previousCapture = capture;
      const previousRedo = captureRedoRef.current;
      const undoSnapshot = await retainSnapshot(previousCapture, currentAnnotations);

      try {
        const nextCapture = await cropCapture(previousCapture, rect);
        await attachSnip(nextCapture.id);
        await pushUndoSnapshot(undoSnapshot);
        captureRedoRef.current = [];
        setCaptureRedo(() => []);
        await discardSnapshots(previousRedo);
        clearAnnotations();
        setCapture(nextCapture);
      } catch (error) {
        await releaseSnipRef(undoSnapshot.refKey);
        throw error;
      }
    },
    [capture, clearAnnotations, discardSnapshots, pushUndoSnapshot, retainSnapshot]
  );

  useKeyboardUndoRedo(onUndo, onRedo);

  useEffect(() => {
    captureUndoRef.current = captureUndo;
  }, [captureUndo]);

  useEffect(() => {
    captureRedoRef.current = captureRedo;
  }, [captureRedo]);

  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }

      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void onSaveAs();
        return;
      }

      if (e.key === "Escape" && !showSettings && !isTypingText) {
        e.preventDefault();
        void onClose();
      }
    };

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [isTypingText, onClose, onSaveAs, showSettings]);

  useEffect(() => {
    let alive = true;

    void discardSnapshots([...captureUndoRef.current, ...captureRedoRef.current]);
    clearAnnotations();
    setCapture(null);
    captureUndoRef.current = [];
    captureRedoRef.current = [];
    setCaptureUndo([]);
    setCaptureRedo([]);
    setShowSettings(false);

    if (!snipId) {
      return;
    }

    getSnip(snipId)
      .then((snip) => {
        if (alive) {
          setCapture(snip);
        }
      })
      .catch(() => {
        void closeSelfWindow();
      });

    invoke<Settings>("load_settings")
      .then((loaded) => {
        if (!alive) {
          return;
        }
        setSettings(loaded);
        setColor(loaded.pen_color);
        setThickness(loaded.pen_thickness);
        applyTheme(loaded.theme);
      })
      .catch(() => {
        if (!alive) {
          return;
        }
        setSettings(DEFAULT_SETTINGS);
        setColor(DEFAULT_SETTINGS.pen_color);
        setThickness(DEFAULT_SETTINGS.pen_thickness);
        applyTheme(DEFAULT_SETTINGS.theme);
      });

    return () => {
      alive = false;
    };
  }, [clearAnnotations, discardSnapshots, setColor, setShowSettings, setThickness, snipId]);

  useEffect(() => {
    if (!capture) {
      return;
    }
    void attachSnip(capture.id);
  }, [capture]);

  useEffect(() => {
    if (!capture) return;
    if (!settings?.auto_copy) return;

    let timer: number | null = null;
    let generation = 0;

    const schedule = () => {
      if (timer !== null) window.clearTimeout(timer);
      const myGen = ++generation;
      timer = window.setTimeout(async () => {
        timer = null;
        const state = useAppStore.getState();
        state.flushPendingText();
        const latestAnnotations = useAppStore.getState().annotations;
        const hasEdits =
          latestAnnotations.length > 0 || captureUndoRef.current.length > 0;
        if (!hasEdits) return;
        try {
          const bytes = await mergeCapture(
            capture,
            latestAnnotations,
            useAppStore.getState().blurStrength
          );
          if (myGen !== generation) return;
          await copyPngBytesToClipboard(bytes);
        } catch (err) {
          console.error("live auto-copy failed", err);
        }
      }, EDITOR_AUTOSAVE_COPY_DELAY_MS);
    };

    const initialHasEdits =
      useAppStore.getState().annotations.length > 0 ||
      captureUndoRef.current.length > 0;
    if (initialHasEdits) schedule();

    let lastAnnotations = useAppStore.getState().annotations;
    const unsubscribe = useAppStore.subscribe((state) => {
      if (state.annotations !== lastAnnotations) {
        lastAnnotations = state.annotations;
        schedule();
      }
    });

    return () => {
      generation++;
      if (timer !== null) window.clearTimeout(timer);
      unsubscribe();
    };
  }, [capture, settings?.auto_copy]);

  useEffect(() => {
    const unlisten = listen<string>("snip-reload", (event) => {
      setSnipId(event.payload);
    });

    return () => {
      void unlisten.then((cleanup) => cleanup());
    };
  }, []);

  const canUndo = useMemo(
    () => annotations.length > 0 || captureUndo.length > 0,
    [annotations.length, captureUndo.length]
  );
  const canRedo = useMemo(
    () => redoStack.length > 0 || captureRedo.length > 0,
    [captureRedo.length, redoStack.length]
  );

  return {
    capture,
    showSettings,
    setShowSettings,
    canUndo,
    canRedo,
    onUndo,
    onRedo,
    onCrop,
    onSaveAs,
    onClose,
  };
}
