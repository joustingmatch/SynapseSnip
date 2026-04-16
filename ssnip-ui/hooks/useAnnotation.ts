import { useCallback, useRef } from "react";
import type { Annotation, TextAnnotationStyle, ToolKind } from "../types";
import { useAppStore } from "../store/appStore";

export function useAnnotationDrawing() {
  const tool = useAppStore((s) => s.tool);
  const color = useAppStore((s) => s.color);
  const thickness = useAppStore((s) => s.thickness);
  const blurStrength = useAppStore((s) => s.blurStrength);
  const addAnnotation = useAppStore((s) => s.addAnnotation);
  const drafting = useRef<Annotation | null>(null);
  const drawing = useRef(false);

  const start = useCallback(
    (x: number, y: number) => {
      drawing.current = true;
      const id = crypto.randomUUID();
      const a: Annotation = {
        id,
        tool: tool as ToolKind,
        color,
        thickness: tool === "blur" ? blurStrength : thickness,
        points: [{ x, y }],
      };
      drafting.current = a;
      return a;
    },
    [tool, color, thickness, blurStrength]
  );

  const move = useCallback((x: number, y: number) => {
    if (!drawing.current || !drafting.current) return null;
    drafting.current.points.push({ x, y });
    return drafting.current;
  }, []);

  const end = useCallback(() => {
    if (!drafting.current) return;
    const a = drafting.current;
    const last = a.points[a.points.length - 1];
    const first = a.points[0];
    const dx = Math.abs(last.x - first.x);
    const dy = Math.abs(last.y - first.y);
    const moved = dx > 1 || dy > 1;
    const drawable =
      a.tool === "pen" || a.tool === "highlighter" || a.tool === "eraser"
        ? a.points.length > 1
        : moved;

    if (!drawable) {
      drafting.current = null;
      drawing.current = false;
      return;
    }
    addAnnotation(a);
    drafting.current = null;
    drawing.current = false;
  }, [addAnnotation]);

  return { start, move, end, draft: drafting };
}

export function renderAnnotations(
  ctx: CanvasRenderingContext2D,
  annotations: Annotation[],
  draft: Annotation | null,
  options?: {
    mode?: "preview" | "final";
    blurStrength?: number;
    sourceImage?: CanvasImageSource | null;
    includeBlur?: boolean;
  }
) {
  const mode = options?.mode ?? "preview";
  const blurStrength = options?.blurStrength ?? 10;
  const sourceImage = options?.sourceImage ?? null;
  const includeBlur = options?.includeBlur ?? true;
  const FONT_FAMILIES: Record<TextAnnotationStyle["fontFamily"], string> = {
    sans: '"Hanken Grotesk", "Segoe UI", sans-serif',
    serif: '"Merriweather", "Georgia", serif',
    mono: '"JetBrains Mono", "Cascadia Mono", "Consolas", monospace',
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

  const resolveTextStyle = (annotation: Annotation): TextAnnotationStyle => {
    const style = annotation.textStyle;
    if (!style) {
      return {
        ...DEFAULT_TEXT_STYLE,
        fontSize: Math.max(14, 12 + annotation.thickness * 3),
      };
    }
    return {
      fontFamily: style.fontFamily ?? DEFAULT_TEXT_STYLE.fontFamily,
      fontSize: Math.max(12, style.fontSize ?? DEFAULT_TEXT_STYLE.fontSize),
      fontWeight: style.fontWeight ?? DEFAULT_TEXT_STYLE.fontWeight,
      lineHeight: Math.max(1.05, style.lineHeight ?? DEFAULT_TEXT_STYLE.lineHeight),
      letterSpacing: style.letterSpacing ?? DEFAULT_TEXT_STYLE.letterSpacing,
      align: style.align ?? DEFAULT_TEXT_STYLE.align,
      background: style.background ?? DEFAULT_TEXT_STYLE.background,
      uppercase: style.uppercase ?? DEFAULT_TEXT_STYLE.uppercase,
    };
  };

  const parseHexColor = (value: string) => {
    const hex = value.trim().replace("#", "");
    if (!/^[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(hex)) return null;
    const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
    return {
      r: Number.parseInt(full.slice(0, 2), 16),
      g: Number.parseInt(full.slice(2, 4), 16),
      b: Number.parseInt(full.slice(4, 6), 16),
    };
  };

  const readableTextColor = (value: string) => {
    const rgb = parseHexColor(value);
    if (!rgb) return "#f8fafc";
    const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
    return luminance > 0.56 ? "#111827" : "#f8fafc";
  };

  const toRgba = (value: string, alpha: number) => {
    const rgb = parseHexColor(value);
    if (!rgb) return `rgba(17,24,39,${alpha})`;
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
  };

  const roundedRect = (x: number, y: number, w: number, h: number, radius: number) => {
    const r = Math.max(0, Math.min(radius, Math.min(w, h) / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  };

  const measureTextWidth = (line: string, letterSpacing: number) => {
    if (!line.length) return 0;
    const base = ctx.measureText(line).width;
    return line.length > 1 ? base + (line.length - 1) * letterSpacing : base;
  };

  const drawLine = (line: string, x: number, y: number, letterSpacing: number) => {
    if (!line.length) return;
    if (Math.abs(letterSpacing) < 0.05 || line.length < 2) {
      ctx.fillText(line, x, y);
      return;
    }
    let cursor = x;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      ctx.fillText(char, cursor, y);
      cursor += ctx.measureText(char).width + letterSpacing;
    }
  };

  const normalizeRect = (a: Annotation) => {
    if (a.points.length < 2) return null;
    const p1 = a.points[0];
    const p2 = a.points[a.points.length - 1];
    const x = Math.min(p1.x, p2.x);
    const y = Math.min(p1.y, p2.y);
    const w = Math.abs(p2.x - p1.x);
    const h = Math.abs(p2.y - p1.y);
    if (w < 1 || h < 1) return null;
    return { x, y, w, h };
  };

  const drawBlurFromSource = (
    source: CanvasImageSource,
    x: number,
    y: number,
    w: number,
    h: number,
    strength: number
  ) => {
    const srcCanvas = document.createElement("canvas");
    srcCanvas.width = Math.max(1, Math.round(w));
    srcCanvas.height = Math.max(1, Math.round(h));
    const srcCtx = srcCanvas.getContext("2d");
    if (!srcCtx) return;

    srcCtx.drawImage(source, x, y, w, h, 0, 0, srcCanvas.width, srcCanvas.height);
    const blurScale = Math.max(2, Math.round(strength / 1.5));
    const tinyW = Math.max(1, Math.round(srcCanvas.width / blurScale));
    const tinyH = Math.max(1, Math.round(srcCanvas.height / blurScale));

    const tiny = document.createElement("canvas");
    tiny.width = tinyW;
    tiny.height = tinyH;
    const tinyCtx = tiny.getContext("2d");
    if (!tinyCtx) return;

    tinyCtx.imageSmoothingEnabled = true;
    srcCtx.imageSmoothingEnabled = true;

    // Multi-pass downsample/upsample gives a stable blur even when canvas filters are unavailable.
    tinyCtx.clearRect(0, 0, tinyW, tinyH);
    tinyCtx.drawImage(srcCanvas, 0, 0, srcCanvas.width, srcCanvas.height, 0, 0, tinyW, tinyH);
    srcCtx.clearRect(0, 0, srcCanvas.width, srcCanvas.height);
    srcCtx.drawImage(tiny, 0, 0, tinyW, tinyH, 0, 0, srcCanvas.width, srcCanvas.height);
    tinyCtx.clearRect(0, 0, tinyW, tinyH);
    tinyCtx.drawImage(srcCanvas, 0, 0, srcCanvas.width, srcCanvas.height, 0, 0, tinyW, tinyH);
    srcCtx.clearRect(0, 0, srcCanvas.width, srcCanvas.height);
    srcCtx.drawImage(tiny, 0, 0, tinyW, tinyH, 0, 0, srcCanvas.width, srcCanvas.height);

    ctx.drawImage(srcCanvas, x, y, w, h);
  };

  const applyBlurRect = (a: Annotation) => {
    const rect = normalizeRect(a);
    if (!rect) return;
    const strength = Math.max(2, Math.round(a.thickness || blurStrength));

    if (sourceImage) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(rect.x, rect.y, rect.w, rect.h);
      ctx.clip();
      drawBlurFromSource(sourceImage, rect.x, rect.y, rect.w, rect.h, strength);
      ctx.restore();
    }

    if (mode === "preview") {
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 1.25;
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
      ctx.restore();
    }
  };

  const all = draft ? [...annotations, draft] : annotations;
  for (const a of all) {
    ctx.save();
    ctx.strokeStyle = a.color;
    ctx.fillStyle = a.color;
    ctx.lineWidth = a.thickness;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (a.tool === "highlighter") ctx.globalAlpha = 0.35;
    if (a.tool === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "rgba(0,0,0,1)";
    }
    if (a.tool === "pen" || a.tool === "highlighter" || a.tool === "eraser") {
      ctx.beginPath();
      a.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
    } else if (a.tool === "rectangle" && a.points.length >= 2) {
      const [p1, p2] = [a.points[0], a.points[a.points.length - 1]];
      ctx.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
    } else if (a.tool === "ellipse" && a.points.length >= 2) {
      const [p1, p2] = [a.points[0], a.points[a.points.length - 1]];
      const cx = (p1.x + p2.x) / 2;
      const cy = (p1.y + p2.y) / 2;
      const rx = Math.abs(p2.x - p1.x) / 2;
      const ry = Math.abs(p2.y - p1.y) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (a.tool === "arrow" && a.points.length >= 2) {
      const p1 = a.points[0];
      const p2 = a.points[a.points.length - 1];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.hypot(dx, dy);
      if (len >= 1) {
        const ux = dx / len;
        const uy = dy / len;
        // Perpendicular unit vector (right-hand).
        const nx = -uy;
        const ny = ux;

        // Head scales with stroke weight but is capped so short arrows still
        // read as arrows rather than triangles with a nub. Min keeps fine
        // strokes usable; max prevents long distances from growing a huge head.
        const rawHead = 10 + a.thickness * 3.4;
        const headLen = Math.min(rawHead, Math.max(rawHead * 0.55, len * 0.45));
        const headHalfW = headLen * 0.42;

        // Concave back edge: the midpoint of the back is pulled forward toward
        // the tip, giving the head an ogee/barbed silhouette instead of a flat
        // triangle. A small notchDepth avoids the dated, paper-plane look.
        const notchDepth = headLen * 0.28;

        const tipX = p2.x;
        const tipY = p2.y;
        const baseCx = p2.x - ux * headLen;
        const baseCy = p2.y - uy * headLen;
        const leftX = baseCx + nx * headHalfW;
        const leftY = baseCy + ny * headHalfW;
        const rightX = baseCx - nx * headHalfW;
        const rightY = baseCy - ny * headHalfW;
        const notchX = baseCx + ux * notchDepth;
        const notchY = baseCy + uy * notchDepth;

        // Shaft stops at the notch so the head base covers the end cleanly;
        // no double-stroking at the tip, no visible seam.
        const shaftEndX = notchX;
        const shaftEndY = notchY;

        const drawArrowPath = () => {
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(shaftEndX, shaftEndY);
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(tipX, tipY);
          ctx.lineTo(leftX, leftY);
          ctx.lineTo(notchX, notchY);
          ctx.lineTo(rightX, rightY);
          ctx.closePath();
          ctx.fill();
        };

        // Halo pass: a soft dark outline under the arrow so it stays legible
        // on light, noisy, or color-matching screenshot backgrounds. Skipped
        // in preview mode while actively dragging would feel laggy; we draw
        // it in both modes but at lower opacity during preview.
        const haloAlpha = mode === "preview" ? 0.22 : 0.32;
        const haloExtra = Math.max(2, a.thickness * 0.6);
        ctx.save();
        ctx.strokeStyle = `rgba(0,0,0,${haloAlpha})`;
        ctx.fillStyle = `rgba(0,0,0,${haloAlpha})`;
        ctx.lineWidth = a.thickness + haloExtra;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        drawArrowPath();
        ctx.restore();

        // Main pass restores the annotation color from the outer ctx.save().
        ctx.lineJoin = "round";
        ctx.miterLimit = 2;
        drawArrowPath();
      }
    } else if (a.tool === "blur" && includeBlur) {
      applyBlurRect(a);
    } else if (a.tool === "text" && a.text && a.points.length) {
      const style = resolveTextStyle(a);
      const lines = (style.uppercase ? a.text.toUpperCase() : a.text).split("\n");
      const lineHeight = Math.round(style.fontSize * style.lineHeight);
      ctx.font = `${style.fontWeight} ${style.fontSize}px ${FONT_FAMILIES[style.fontFamily]}`;
      ctx.textBaseline = "top";
      const widths = lines.map((line) => measureTextWidth(line, style.letterSpacing));
      const maxWidth = widths.length ? Math.max(...widths) : 0;
      const padX = style.background === "none" ? 0 : Math.max(8, Math.round(style.fontSize * 0.35));
      const padY = style.background === "none" ? 0 : Math.max(6, Math.round(style.fontSize * 0.26));
      const totalHeight = lines.length * lineHeight;

      const anchor = a.points[0];
      const textLeft =
        style.align === "center"
          ? anchor.x - maxWidth / 2
          : style.align === "right"
          ? anchor.x - maxWidth
          : anchor.x;
      const textTop = anchor.y;

      let foreground = a.color;
      if (style.background === "solid") {
        foreground = readableTextColor(a.color);
        ctx.fillStyle = a.color;
        roundedRect(
          textLeft - padX,
          textTop - padY,
          maxWidth + padX * 2,
          totalHeight + padY * 2,
          Math.max(8, Math.round(style.fontSize * 0.34))
        );
        ctx.fill();
      } else if (style.background === "soft") {
        ctx.fillStyle = toRgba(a.color, mode === "preview" ? 0.2 : 0.16);
        roundedRect(
          textLeft - padX,
          textTop - padY,
          maxWidth + padX * 2,
          totalHeight + padY * 2,
          Math.max(8, Math.round(style.fontSize * 0.34))
        );
        ctx.fill();
      }

      ctx.fillStyle = foreground;
      lines.forEach((line, idx) => {
        const y = textTop + idx * lineHeight;
        const width = widths[idx] ?? 0;
        const x =
          style.align === "center"
            ? textLeft + (maxWidth - width) / 2
            : style.align === "right"
            ? textLeft + (maxWidth - width)
            : textLeft;
        drawLine(line, x, y, style.letterSpacing);
      });
    }
    ctx.restore();
  }
}
