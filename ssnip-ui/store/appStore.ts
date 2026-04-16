import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type {
  Annotation,
  CaptureMode,
  Settings,
  Snip,
  TextAnnotationStyle,
  ToolKind,
} from "../types";
import { applyTheme } from "../utils/theme";

type ToolStyle = { color: string; thickness: number };

const INITIAL_TOOL_STYLES: Record<ToolKind, ToolStyle> = {
  cursor: { color: "#ff3b30", thickness: 4 },
  pen: { color: "#ff3b30", thickness: 5 },
  highlighter: { color: "#ffd60a", thickness: 14 },
  text: { color: "#ff3b30", thickness: 5 },
  rectangle: { color: "#ff3b30", thickness: 5 },
  ellipse: { color: "#ff3b30", thickness: 5 },
  arrow: { color: "#ff3b30", thickness: 6 },
  eraser: { color: "#000000", thickness: 16 },
  blur: { color: "#ffffff", thickness: 14 },
  crop: { color: "#60a5fa", thickness: 3 },
};

const DEFAULT_TEXT_STYLE: TextAnnotationStyle = {
  fontFamily: "sans",
  fontSize: 24,
  fontWeight: 700,
  lineHeight: 1.24,
  letterSpacing: 0,
  align: "left",
  background: "none",
  uppercase: false,
};

interface AppState {
  mode: CaptureMode;
  tool: ToolKind;
  color: string;
  thickness: number;
  blurStrength: number;
  textStyle: TextAnnotationStyle;
  isTypingText: boolean;
  pendingTextCommit: (() => void) | null;
  toolStyles: Record<ToolKind, ToolStyle>;
  editingSnip: Snip | null;
  annotations: Annotation[];
  redoStack: Annotation[];
  settings: Settings | null;
  showSettings: boolean;
  countdown: number;
  setMode: (m: CaptureMode) => void;
  setTool: (t: ToolKind) => void;
  setColor: (c: string) => void;
  setThickness: (n: number) => void;
  setBlurStrength: (n: number) => void;
  setTextStyle: (patch: Partial<TextAnnotationStyle>) => void;
  setIsTypingText: (isTyping: boolean) => void;
  setPendingTextCommit: (fn: (() => void) | null) => void;
  flushPendingText: () => void;
  openEditor: (snip: Snip) => void;
  closeEditor: () => void;
  addAnnotation: (a: Annotation) => void;
  undo: () => void;
  redo: () => void;
  clearAnnotations: () => void;
  setSettings: (s: Settings) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  setShowSettings: (b: boolean) => void;
  setCountdown: (n: number) => void;
}

let saveTimeout: ReturnType<typeof setTimeout> | null = null;

export const useAppStore = create<AppState>((set, get) => ({
  mode: "rect",
  tool: "pen",
  color: INITIAL_TOOL_STYLES.pen.color,
  thickness: INITIAL_TOOL_STYLES.pen.thickness,
  blurStrength: 10,
  textStyle: DEFAULT_TEXT_STYLE,
  isTypingText: false,
  pendingTextCommit: null,
  toolStyles: INITIAL_TOOL_STYLES,
  editingSnip: null,
  annotations: [],
  redoStack: [],
  settings: null,
  showSettings: false,
  countdown: 0,
  setMode: (m) => set({ mode: m }),
  setTool: (t) =>
    set((s) => {
      const style = s.toolStyles[t];
      return {
        tool: t,
        color: style.color,
        thickness: style.thickness,
      };
    }),
  setColor: (c) =>
    set((s) => ({
      color: c,
      toolStyles: {
        ...s.toolStyles,
        [s.tool]: { ...s.toolStyles[s.tool], color: c },
      },
    })),
  setThickness: (n) =>
    set((s) => ({
      thickness: n,
      toolStyles: {
        ...s.toolStyles,
        [s.tool]: { ...s.toolStyles[s.tool], thickness: n },
      },
    })),
  setBlurStrength: (n) => set({ blurStrength: n }),
  setTextStyle: (patch) =>
    set((s) => ({
      textStyle: { ...s.textStyle, ...patch },
    })),
  setIsTypingText: (isTypingText) => set({ isTypingText }),
  setPendingTextCommit: (fn) => set({ pendingTextCommit: fn }),
  flushPendingText: () => {
    const fn = get().pendingTextCommit;
    if (fn) fn();
  },
  openEditor: (snip) => set({ editingSnip: snip, annotations: [], redoStack: [] }),
  closeEditor: () => set({ editingSnip: null, annotations: [], redoStack: [] }),
  addAnnotation: (a) =>
    set((s) => ({ annotations: [...s.annotations, a], redoStack: [] })),
  undo: () =>
    set((s) => {
      if (!s.annotations.length) return s;
      const next = s.annotations.slice(0, -1);
      const popped = s.annotations[s.annotations.length - 1];
      return { annotations: next, redoStack: [...s.redoStack, popped] };
    }),
  redo: () =>
    set((s) => {
      if (!s.redoStack.length) return s;
      const next = s.redoStack.slice(0, -1);
      const popped = s.redoStack[s.redoStack.length - 1];
      return { redoStack: next, annotations: [...s.annotations, popped] };
    }),
  clearAnnotations: () => set({ annotations: [], redoStack: [] }),
  setSettings: (s) => set({ settings: s }),
  updateSettings: (patch) => {
    const { settings } = get();
    if (!settings) return;
    const next = { ...settings, ...patch };
    set({ settings: next });

    if (patch.theme) {
      applyTheme(patch.theme);
    }

    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
      try {
        await invoke("save_settings", { settings: next });
      } catch (e) {
        console.error("Failed to save settings:", e);
      }
    }, 400);
  },
  setShowSettings: (b) => set({ showSettings: b }),
  setCountdown: (n) => set({ countdown: n }),
}));
