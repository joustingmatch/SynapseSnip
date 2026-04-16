import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type ToastVariant = "success" | "error";

type ToastItem = {
  id: string;
  message: string;
  variant: ToastVariant;
  exiting?: boolean;
};

type ToastApi = {
  success: (message: string) => void;
  error: (message: string) => void;
};

const TOAST_LIFETIME_MS = 4000;

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Record<string, number>>({});

  const dismiss = useCallback((id: string) => {
    // Mark as exiting for animation
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, exiting: true } : t))
    );

    // Actually remove after animation
    const timer = window.setTimeout(() => {
      const toastTimer = timersRef.current[id];
      if (toastTimer) {
        window.clearTimeout(toastTimer);
        delete timersRef.current[id];
      }
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 250);

    return () => window.clearTimeout(timer);
  }, []);

  const push = useCallback(
    (variant: ToastVariant, message: string) => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev, { id, message, variant }]);
      timersRef.current[id] = window.setTimeout(() => dismiss(id), TOAST_LIFETIME_MS);
    },
    [dismiss]
  );

  useEffect(
    () => () => {
      for (const timer of Object.values(timersRef.current)) {
        window.clearTimeout(timer);
      }
      timersRef.current = {};
    },
    []
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => push("success", message),
      error: (message) => push("error", message),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div 
        className="fixed right-4 top-4 z-[300] flex flex-col gap-2 pointer-events-none"
      >
        {toasts.map((toast) => (
          <button
            key={toast.id}
            type="button"
            onClick={() => dismiss(toast.id)}
            className={`pointer-events-auto ${toast.exiting ? 'toast-exit' : 'toast-enter'}`}
            style={{
              padding: '12px 16px',
              borderRadius: 'var(--radius-lg)',
              background: 'var(--bg-secondary)',
              border: `1px solid ${toast.variant === 'error' ? 'var(--error)' : 'var(--border-default)'}`,
              textAlign: 'left',
              minWidth: '240px',
              fontFamily: 'var(--font-mono)',
            }}
          >
            <div 
              className="flex items-center gap-2"
            >
              <div
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: toast.variant === 'error' ? 'var(--error)' : 'var(--success)',
                }}
              />
              <span 
                className="text-xs font-medium"
                style={{ color: 'var(--text-secondary)' }}
              >
                {toast.message}
              </span>
            </div>
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
