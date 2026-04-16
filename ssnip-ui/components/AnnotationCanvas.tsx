import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSnipSrc } from "../hooks/useCapture";
import { useAppStore } from "../store/appStore";
import { renderAnnotations, useAnnotationDrawing } from "../hooks/useAnnotation";
import type { CaptureResult, TextAnnotationStyle } from "../types";

interface Props {
  capture: CaptureResult;
  onCrop?: (rect: { x: number; y: number; w: number; h: number }) => void;
}

type Rect = { x: number; y: number; w: number; h: number };
type TextDraft = {
  anchor: { x: number; y: number };
  value: string;
  color: string;
  thickness: number;
  textStyle: TextAnnotationStyle;
};

type ViewportMetrics = {
  scrollLeft: number;
  scrollTop: number;
  clientWidth: number;
  clientHeight: number;
};

const MIN_ZOOM = 1;
const MAX_ZOOM = 8;
const SNAP_TOLERANCE = 0.04;

const FONT_FAMILIES: Record<TextAnnotationStyle["fontFamily"], string> = {
  sans: '"Hanken Grotesk", "Segoe UI", sans-serif',
  serif: '"Merriweather", "Georgia", serif',
  mono: '"JetBrains Mono", "Cascadia Mono", "Consolas", monospace',
};

export function AnnotationCanvas({ capture, onCrop }: Props) {
  const annotations = useAppStore((s) => s.annotations);
  const tool = useAppStore((s) => s.tool);
  const addAnnotation = useAppStore((s) => s.addAnnotation);
  const color = useAppStore((s) => s.color);
  const thickness = useAppStore((s) => s.thickness);
  const blurStrength = useAppStore((s) => s.blurStrength);
  const textStyle = useAppStore((s) => s.textStyle);
  const setIsTypingText = useAppStore((s) => s.setIsTypingText);
  const setPendingTextCommit = useAppStore((s) => s.setPendingTextCommit);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const sourceImgRef = useRef<HTMLImageElement | null>(null);
  const committedCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const committedDirtyRef = useRef(true);
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const textMeasureCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const { start, move, end, draft } = useAnnotationDrawing();

  const [textDraft, setTextDraft] = useState<TextDraft | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [spacePan, setSpacePan] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [fitScale, setFitScale] = useState(1);
  const [viewportMetrics, setViewportMetrics] = useState<ViewportMetrics>({
    scrollLeft: 0,
    scrollTop: 0,
    clientWidth: 0,
    clientHeight: 0,
  });

  const drawingRef = useRef(false);
  const panStartRef = useRef<{
    x: number;
    y: number;
    scrollLeft: number;
    scrollTop: number;
    viewport: HTMLDivElement;
  } | null>(null);
  const shiftRef = useRef(false);
  const spaceRef = useRef(false);
  const cropDraftRef = useRef<Rect | null>(null);
  const zoomRef = useRef(1);

  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

  const readViewportMetrics = useCallback((): ViewportMetrics => {
    const viewport = viewportRef.current;
    return {
      scrollLeft: viewport?.scrollLeft ?? 0,
      scrollTop: viewport?.scrollTop ?? 0,
      clientWidth: viewport?.clientWidth ?? 0,
      clientHeight: viewport?.clientHeight ?? 0,
    };
  }, []);

  const updateViewportMetrics = useCallback(() => {
    const next = readViewportMetrics();
    setViewportMetrics((prev) =>
      prev.scrollLeft === next.scrollLeft &&
      prev.scrollTop === next.scrollTop &&
      prev.clientWidth === next.clientWidth &&
      prev.clientHeight === next.clientHeight
        ? prev
        : next
    );
  }, [readViewportMetrics]);

  const updateFitScale = useCallback(() => {
    const hostW = window.innerWidth;
    const hostH = window.innerHeight;
    const reserveW = 180;
    const reserveH = 220;
    const availW = Math.max(1, hostW - reserveW);
    const availH = Math.max(1, hostH - reserveH);
    const next = Math.min(1, availW / capture.width, availH / capture.height);
    setFitScale((prev) => (Math.abs(prev - next) < 0.0005 ? prev : next));
  }, [capture.height, capture.width]);

  useEffect(() => {
    setZoom(1);
    zoomRef.current = 1;
    updateFitScale();
    updateViewportMetrics();
    window.addEventListener("resize", updateFitScale);
    window.addEventListener("resize", updateViewportMetrics);
    return () => {
      window.removeEventListener("resize", updateFitScale);
      window.removeEventListener("resize", updateViewportMetrics);
    };
  }, [updateFitScale, updateViewportMetrics]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    updateViewportMetrics();
    const handleScroll = () => updateViewportMetrics();
    viewport.addEventListener("scroll", handleScroll);
    return () => viewport.removeEventListener("scroll", handleScroll);
  }, [capture.id, updateViewportMetrics]);

  useEffect(() => {
    committedCanvasRef.current = null;
    committedDirtyRef.current = true;
  }, [capture.id]);

  const renderedW = Math.max(1, Math.round(capture.width * fitScale * zoom));
  const renderedH = Math.max(1, Math.round(capture.height * fitScale * zoom));
  const viewportBaseW = Math.max(1, Math.round(capture.width * fitScale));
  const viewportBaseH = Math.max(1, Math.round(capture.height * fitScale));
  const canvasScale = fitScale * zoom;

  const getMeasureContext = useCallback(() => {
    if (!textMeasureCanvasRef.current) {
      textMeasureCanvasRef.current = document.createElement("canvas");
    }
    return textMeasureCanvasRef.current.getContext("2d");
  }, []);

  const measureLineWidth = useCallback(
    (line: string, letterSpacing: number, font: string) => {
      const ctx = getMeasureContext();
      if (!ctx || !line.length) {
        return 0;
      }
      ctx.font = font;
      const base = ctx.measureText(line).width;
      return line.length > 1 ? base + (line.length - 1) * letterSpacing : base;
    },
    [getMeasureContext]
  );

  const measureTextBlock = useCallback(
    (nextDraft: TextDraft, scale: number, mode: "annotation" | "textarea") => {
      const normalizedValue = nextDraft.value.replace(/\r/g, "");
      const displayValue = nextDraft.textStyle.uppercase ? normalizedValue.toUpperCase() : normalizedValue;
      const lines = displayValue.split("\n");
      const fontSize = nextDraft.textStyle.fontSize * scale;
      const letterSpacing = nextDraft.textStyle.letterSpacing * scale;
      const lineHeight = Math.round(nextDraft.textStyle.fontSize * nextDraft.textStyle.lineHeight * scale);
      const font = `${nextDraft.textStyle.fontWeight} ${fontSize}px ${FONT_FAMILIES[nextDraft.textStyle.fontFamily]}`;
      const widths = lines.map((line) => measureLineWidth(line, letterSpacing, font));
      const maxWidth = widths.length ? Math.max(...widths) : 0;
      const textPadX =
        mode === "annotation"
          ? nextDraft.textStyle.background === "none"
            ? 0
            : Math.max(8, Math.round(fontSize * 0.35))
          : Math.max(8, Math.round(fontSize * 0.32));
      const textPadY =
        mode === "annotation"
          ? nextDraft.textStyle.background === "none"
            ? 0
            : Math.max(6, Math.round(fontSize * 0.26))
          : Math.max(6, Math.round(fontSize * 0.22));
      const minWidth = Math.max(160, Math.round(fontSize * 4.5));
      const minHeight = Math.max(lineHeight + textPadY * 2, Math.round(fontSize * 1.9));
      return {
        lineHeight,
        maxWidth,
        textPadX,
        textPadY,
        width: Math.max(minWidth, Math.ceil(maxWidth + textPadX * 2)),
        height: Math.max(minHeight, Math.ceil(lines.length * lineHeight + textPadY * 2)),
        minWidth,
        minHeight,
      };
    },
    [measureLineWidth]
  );

  const commitText = useCallback(() => {
    const nextDraft = textDraft;
    const value = nextDraft?.value.replace(/\r/g, "") ?? "";
    if (nextDraft && value.trim()) {
      const metrics = measureTextBlock(nextDraft, 1, "annotation");
      const textLeft =
        nextDraft.textStyle.align === "center"
          ? nextDraft.anchor.x - metrics.maxWidth / 2
          : nextDraft.textStyle.align === "right"
          ? nextDraft.anchor.x - metrics.maxWidth
          : nextDraft.anchor.x;

      addAnnotation({
        id: crypto.randomUUID(),
        tool: "text",
        color: nextDraft.color,
        thickness: nextDraft.thickness,
        points: [nextDraft.anchor],
        text: value,
        textStyle: nextDraft.textStyle,
        rect: {
          x: Math.round(textLeft - metrics.textPadX),
          y: Math.round(nextDraft.anchor.y - metrics.textPadY),
          width: Math.round(metrics.maxWidth + metrics.textPadX * 2),
          height: Math.round(value.split("\n").length * metrics.lineHeight + metrics.textPadY * 2),
        },
      });
    }
    setTextDraft(null);
    setIsTypingText(false);
  }, [addAnnotation, measureTextBlock, setIsTypingText, textDraft]);

  const cancelText = useCallback(() => {
    setTextDraft(null);
    setIsTypingText(false);
  }, [setIsTypingText]);

  const startTextDraft = useCallback(
    (anchor: { x: number; y: number }) => {
      setTextDraft({
        anchor,
        value: "",
        color,
        thickness,
        textStyle,
      });
      setIsTypingText(true);
    },
    [color, setIsTypingText, textStyle, thickness]
  );

  useEffect(() => () => setIsTypingText(false), [setIsTypingText]);

  useEffect(() => {
    setPendingTextCommit(commitText);
    return () => setPendingTextCommit(null);
  }, [commitText, setPendingTextCommit]);

  useEffect(() => {
    if (!textDraft) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (textAreaRef.current?.contains(event.target as Node)) {
        return;
      }
      commitText();
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [commitText, textDraft]);

  const rebuildCommittedLayer = useCallback(() => {
    let layer = committedCanvasRef.current;
    if (!layer) {
      layer = document.createElement("canvas");
      committedCanvasRef.current = layer;
    }
    if (layer.width !== capture.width) layer.width = capture.width;
    if (layer.height !== capture.height) layer.height = capture.height;

    const ctx = layer.getContext("2d");
    if (!ctx) {
      return;
    }

    ctx.clearRect(0, 0, capture.width, capture.height);
    renderAnnotations(ctx, annotations, null, {
      mode: "preview",
      blurStrength,
      sourceImage: sourceImgRef.current,
      includeBlur: true,
    });
    committedDirtyRef.current = false;
  }, [annotations, blurStrength, capture.height, capture.width]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, capture.width, capture.height);
    if (committedDirtyRef.current) {
      rebuildCommittedLayer();
    }
    if (committedCanvasRef.current) {
      ctx.drawImage(committedCanvasRef.current, 0, 0);
    }

    if (draft.current) {
      renderAnnotations(ctx, [], draft.current, {
        mode: "preview",
        blurStrength,
        sourceImage: sourceImgRef.current,
        includeBlur: true,
      });
    }

    const cropRect = cropDraftRef.current;
    if (cropRect) {
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(0, 0, capture.width, capture.height);
      ctx.clearRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h);
      ctx.strokeStyle = "#60a5fa";
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 4]);
      ctx.strokeRect(cropRect.x + 0.5, cropRect.y + 0.5, cropRect.w, cropRect.h);
      ctx.restore();
    }
  }, [blurStrength, capture.height, capture.width, draft, rebuildCommittedLayer]);

  useEffect(() => {
    committedDirtyRef.current = true;
    redraw();
  }, [annotations, redraw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const targetW = Math.max(1, Math.round(renderedW * dpr));
    const targetH = Math.max(1, Math.round(renderedH * dpr));
    if (canvas.width !== targetW) canvas.width = targetW;
    if (canvas.height !== targetH) canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const sx = (renderedW * dpr) / capture.width;
      const sy = (renderedH * dpr) / capture.height;
      ctx.setTransform(sx, 0, 0, sy, 0, 0);
    }
    redraw();
  }, [capture.height, capture.width, redraw, renderedH, renderedW]);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      sourceImgRef.current = img;
      committedDirtyRef.current = true;
      redraw();
    };
    img.src = getSnipSrc(capture.id);
    return () => {
      sourceImgRef.current = null;
    };
  }, [capture.id, redraw]);

  const applyZoomAtPoint = useCallback(
    (rawZoom: number, clientX: number, clientY: number) => {
      const viewport = viewportRef.current;
      let nextZoom = rawZoom;
      if (Math.abs(nextZoom - 1) < SNAP_TOLERANCE) nextZoom = 1;
      if (!viewport) {
        setZoom(nextZoom);
        return;
      }

      const prevZoom = zoomRef.current;
      if (Math.abs(nextZoom - prevZoom) < 0.0001) return;

      const rect = viewport.getBoundingClientRect();
      const vx = clamp(clientX - rect.left, 0, rect.width);
      const vy = clamp(clientY - rect.top, 0, rect.height);

      const prevRenderedW = Math.max(1, capture.width * fitScale * prevZoom);
      const prevRenderedH = Math.max(1, capture.height * fitScale * prevZoom);
      const nextRenderedW = Math.max(1, capture.width * fitScale * nextZoom);
      const nextRenderedH = Math.max(1, capture.height * fitScale * nextZoom);

      const rx = (viewport.scrollLeft + vx) / prevRenderedW;
      const ry = (viewport.scrollTop + vy) / prevRenderedH;

      zoomRef.current = nextZoom;
      setZoom(nextZoom);

      requestAnimationFrame(() => {
        const nextViewport = viewportRef.current;
        if (!nextViewport) return;
        nextViewport.scrollLeft = clamp(
          rx * nextRenderedW - vx,
          0,
          Math.max(0, nextViewport.scrollWidth - nextViewport.clientWidth)
        );
        nextViewport.scrollTop = clamp(
          ry * nextRenderedH - vy,
          0,
          Math.max(0, nextViewport.scrollHeight - nextViewport.clientHeight)
        );
        updateViewportMetrics();
      });
    },
    [capture.height, capture.width, fitScale, updateViewportMetrics]
  );

  const resetZoom = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      setZoom(1);
      return;
    }
    zoomRef.current = 1;
    setZoom(1);
    requestAnimationFrame(() => {
      const nextViewport = viewportRef.current;
      if (!nextViewport) return;
      nextViewport.scrollLeft = Math.max(0, (nextViewport.scrollWidth - nextViewport.clientWidth) / 2);
      nextViewport.scrollTop = Math.max(0, (nextViewport.scrollHeight - nextViewport.clientHeight) / 2);
      updateViewportMetrics();
    });
  }, [updateViewportMetrics]);

  useEffect(() => {
    const isEditable = (target: EventTarget | null) => {
      const element = target as HTMLElement | null;
      return !!element && (element.tagName === "INPUT" || element.tagName === "TEXTAREA" || element.isContentEditable);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Shift") shiftRef.current = true;

      if (event.key === "Escape" && cropDraftRef.current) {
        cropDraftRef.current = null;
        drawingRef.current = false;
        redraw();
      }

      if (isEditable(event.target)) {
        return;
      }

      if (event.code === "Space" && !spaceRef.current) {
        spaceRef.current = true;
        setSpacePan(true);
        event.preventDefault();
      }

      if (!event.ctrlKey && !event.metaKey && !event.altKey) {
        const viewport = viewportRef.current;
        const rect = viewport?.getBoundingClientRect();
        const centerX = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
        const centerY = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;

        if (event.key === "+" || event.key === "=") {
          applyZoomAtPoint(clamp(zoomRef.current * 1.2, MIN_ZOOM, MAX_ZOOM), centerX, centerY);
          event.preventDefault();
        } else if (event.key === "-" || event.key === "_") {
          applyZoomAtPoint(clamp(zoomRef.current / 1.2, MIN_ZOOM, MAX_ZOOM), centerX, centerY);
          event.preventDefault();
        } else if (event.key === "0") {
          resetZoom();
          event.preventDefault();
        }
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Shift") shiftRef.current = false;
      if (event.code === "Space") {
        spaceRef.current = false;
        setSpacePan(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [applyZoomAtPoint, redraw, resetZoom]);

  useEffect(() => {
    if (tool !== "crop") {
      cropDraftRef.current = null;
    }
    if (tool !== "text") {
      cancelText();
    }
    if (tool !== "cursor") {
      setIsPanning(false);
      panStartRef.current = null;
    }
  }, [cancelText, tool]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const factor = event.deltaY < 0 ? 1.1 : 0.9;
      const nextZoom = clamp(zoomRef.current * factor, MIN_ZOOM, MAX_ZOOM);
      applyZoomAtPoint(nextZoom, event.clientX, event.clientY);
    };
    viewport.addEventListener("wheel", handleWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleWheel);
  }, [applyZoomAtPoint]);

  const toImgCoordsFromClient = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const nx = ((clientX - rect.left) * capture.width) / Math.max(1, rect.width);
    const ny = ((clientY - rect.top) * capture.height) / Math.max(1, rect.height);
    return {
      x: clamp(nx, 0, capture.width),
      y: clamp(ny, 0, capture.height),
    };
  };

  const beginPan = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const viewport = viewportRef.current;
    if (!viewport) return false;
    event.currentTarget.setPointerCapture(event.pointerId);
    panStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
      viewport,
    };
    setIsPanning(true);
    return true;
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button === 1 || (event.button === 0 && spaceRef.current)) {
      event.preventDefault();
      beginPan(event);
      return;
    }
    if (event.button !== 0) return;

    if (tool === "cursor") {
      beginPan(event);
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    const point = toImgCoordsFromClient(event.clientX, event.clientY);

    if (tool === "text") {
      startTextDraft(point);
      return;
    }

    if (textDraft) {
      commitText();
    }

    if (tool === "crop") {
      cropDraftRef.current = { x: point.x, y: point.y, w: 0, h: 0 };
      drawingRef.current = true;
      redraw();
      return;
    }

    drawingRef.current = true;
    start(point.x, point.y);
    redraw();
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (panStartRef.current) {
      const startPan = panStartRef.current;
      startPan.viewport.scrollLeft = startPan.scrollLeft - (event.clientX - startPan.x);
      startPan.viewport.scrollTop = startPan.scrollTop - (event.clientY - startPan.y);
      updateViewportMetrics();
      return;
    }

    if (!drawingRef.current) return;
    const point = toImgCoordsFromClient(event.clientX, event.clientY);

    if (tool === "crop" && cropDraftRef.current) {
      const startCrop = cropDraftRef.current;
      cropDraftRef.current = {
        x: Math.min(startCrop.x, point.x),
        y: Math.min(startCrop.y, point.y),
        w: Math.abs(point.x - startCrop.x),
        h: Math.abs(point.y - startCrop.y),
      };
      redraw();
      return;
    }

    if (shiftRef.current && (tool === "rectangle" || tool === "ellipse" || tool === "arrow" || tool === "blur")) {
      const activeDraft = draft.current;
      if (activeDraft && activeDraft.points[0]) {
        const startPoint = activeDraft.points[0];
        const dx = point.x - startPoint.x;
        const dy = point.y - startPoint.y;
        if (tool === "arrow") {
          const angle = Math.atan2(dy, dx);
          const snap = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
          const length = Math.hypot(dx, dy);
          move(startPoint.x + Math.cos(snap) * length, startPoint.y + Math.sin(snap) * length);
        } else {
          const side = Math.max(Math.abs(dx), Math.abs(dy));
          move(startPoint.x + Math.sign(dx || 1) * side, startPoint.y + Math.sign(dy || 1) * side);
        }
        redraw();
        return;
      }
    }

    move(point.x, point.y);
    redraw();
  };

  const finishInteraction = () => {
    if (panStartRef.current) {
      setIsPanning(false);
      panStartRef.current = null;
      return;
    }
    if (tool === "cursor") {
      setIsPanning(false);
      return;
    }

    if (!drawingRef.current) return;
    drawingRef.current = false;

    if (tool === "crop") {
      const cropRect = cropDraftRef.current;
      cropDraftRef.current = null;
      if (cropRect && cropRect.w > 4 && cropRect.h > 4 && onCrop) {
        onCrop({
          x: Math.round(cropRect.x),
          y: Math.round(cropRect.y),
          w: Math.round(cropRect.w),
          h: Math.round(cropRect.h),
        });
      }
      redraw();
      return;
    }

    end();
    redraw();
  };

  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    finishInteraction();
  };

  const onPointerCancel = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    finishInteraction();
  };

  const onTextareaKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelText();
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      commitText();
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      commitText();
    }
  };

  const textAreaLayout = useMemo(() => {
    if (!textDraft) {
      return null;
    }

    const metrics = measureTextBlock(textDraft, canvasScale, "textarea");
    const left = textDraft.anchor.x * canvasScale - viewportMetrics.scrollLeft;
    const top = textDraft.anchor.y * canvasScale - viewportMetrics.scrollTop;
    const maxWidth = Math.max(48, viewportMetrics.clientWidth - left - 12);
    const maxHeight = Math.max(40, viewportMetrics.clientHeight - top - 12);
    const width = Math.max(48, Math.min(metrics.width, maxWidth));
    const height = Math.max(40, Math.min(metrics.height, maxHeight));
    return {
      left,
      top,
      width,
      height,
      padX: metrics.textPadX,
      padY: metrics.textPadY,
      overflowX: metrics.width > maxWidth ? "auto" : "hidden",
      overflowY: metrics.height > maxHeight ? "auto" : "hidden",
    };
  }, [canvasScale, measureTextBlock, textDraft, viewportMetrics]);

  const cursor =
    isPanning
      ? "grabbing"
      : spacePan
      ? "grab"
      : tool === "cursor"
      ? "grab"
      : tool === "text"
      ? "text"
      : tool === "eraser"
      ? "cell"
      : "crosshair";

  return (
    <div className="relative inline-block overflow-visible">
      <div className="fixed bottom-8 right-8 z-[150] flex items-center rounded border border-white/10 bg-black/40 p-1 opacity-60 transition-opacity hover:opacity-100">
        <button
          type="button"
          onClick={() => {
            const viewport = viewportRef.current;
            const rect = viewport?.getBoundingClientRect();
            const centerX = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
            const centerY = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
            applyZoomAtPoint(clamp(zoomRef.current / 1.2, MIN_ZOOM, MAX_ZOOM), centerX, centerY);
          }}
          className="flex h-10 w-10 items-center justify-center rounded text-white/80 transition-all hover:bg-white/10 hover:text-white active:scale-90"
          title="Zoom out"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12" /></svg>
        </button>
        <button
          type="button"
          onClick={resetZoom}
          className="flex h-10 items-center justify-center rounded px-4 text-[12px] font-black uppercase tracking-tighter text-white/90 transition-all hover:bg-white/10 active:scale-95"
          title="Reset zoom"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          onClick={() => {
            const viewport = viewportRef.current;
            const rect = viewport?.getBoundingClientRect();
            const centerX = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
            const centerY = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
            applyZoomAtPoint(clamp(zoomRef.current * 1.2, MIN_ZOOM, MAX_ZOOM), centerX, centerY);
          }}
          className="flex h-10 w-10 items-center justify-center rounded text-white/80 transition-all hover:bg-white/10 hover:text-white active:scale-90"
          title="Zoom in"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        </button>
      </div>

      <div
        ref={viewportRef}
        className="relative max-h-[85vh] max-w-full overflow-auto rounded border border-[var(--border-default)] scrollbar-hide"
        style={{ width: viewportBaseW, height: viewportBaseH }}
      >
        <div style={{ width: renderedW, height: renderedH }} className="relative">
          <img
            src={getSnipSrc(capture.id)}
            alt=""
            className="pointer-events-none block h-full w-full select-none rounded"
            draggable={false}
          />
          <canvas
            ref={canvasRef}
            className="absolute inset-0 h-full w-full rounded"
            style={{ cursor, touchAction: "none" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
          />
        </div>

        {textDraft && textAreaLayout ? (
          <textarea
            ref={textAreaRef}
            autoFocus
            value={textDraft.value}
            wrap="off"
            spellCheck={false}
            onFocus={() => setIsTypingText(true)}
            onBlur={() => setIsTypingText(false)}
            onChange={(event) => setTextDraft((prev) => (prev ? { ...prev, value: event.target.value } : prev))}
            onKeyDown={onTextareaKeyDown}
            className="absolute rounded border border-[var(--accent)]/35 bg-transparent text-transparent caret-white focus:border-[var(--accent)]"
            style={{
              left: textAreaLayout.left,
              top: textAreaLayout.top,
              width: textAreaLayout.width,
              height: textAreaLayout.height,
              padding: `${textAreaLayout.padY}px ${textAreaLayout.padX}px`,
              color: textDraft.color,
              fontFamily: FONT_FAMILIES[textDraft.textStyle.fontFamily],
              fontSize: textDraft.textStyle.fontSize * canvasScale,
              fontWeight: textDraft.textStyle.fontWeight,
              lineHeight: String(textDraft.textStyle.lineHeight),
              letterSpacing: `${textDraft.textStyle.letterSpacing * canvasScale}px`,
              textAlign: textDraft.textStyle.align,
              textTransform: textDraft.textStyle.uppercase ? "uppercase" : "none",
              overflowX: textAreaLayout.overflowX as "auto" | "hidden",
              overflowY: textAreaLayout.overflowY as "auto" | "hidden",
              resize: "none",
              whiteSpace: "pre",
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
