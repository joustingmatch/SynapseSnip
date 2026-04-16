import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useAppStore } from "../store/appStore";

export function useGlobalHotkey(onTrigger: () => void) {
  useEffect(() => {
    const un = listen<string>("hotkey-triggered", () => onTrigger());
    return () => {
      un.then((f) => f());
    };
  }, [onTrigger]);
}

export function useKeyboardUndoRedo(undo: () => void, redo: () => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (useAppStore.getState().isTypingText) return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        redo();
      } else if (ctrl && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
      } else if (ctrl && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo]);
}
