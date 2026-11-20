// components/koperasi/PhotoPerspectiveEditor.tsx — port dari backup MyPerform
// (src/components/PhotoPerspectiveEditor.tsx, 1088 baris): editor perspektif
// canvas murni — geser 4 sudut + titik tengah sisi, zoom/pinch, putar,
// reset, lalu warp via lib/koperasi/perspectiveTransform. Dipakai lewat
// KtpPerspectiveCropModal untuk meluruskan foto KTP.
'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { 
  RotateCw, 
  RotateCcw, 
  Maximize2, 
  Check, 
  X, 
  Sparkles,
  ZoomIn,
  ZoomOut,
  Move
} from 'lucide-react';
import { 
  Point, 
  QuadCorners, 
  rotateCanvas, 
  rotateCorners, 
  warpPerspective 
} from '@/lib/koperasi/perspectiveTransform';

interface PhotoPerspectiveEditorProps {
  initialImageBase64: string;
  onCancel: () => void;
  onConfirm: (warpedBase64: string) => void;
}

export type DragHandle = 'tl' | 'tr' | 'br' | 'bl' | 'top' | 'right' | 'bottom' | 'left';

export const PhotoPerspectiveEditor: React.FC<PhotoPerspectiveEditorProps> = ({
  initialImageBase64,
  onCancel,
  onConfirm
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const magnifierCanvasRef = useRef<HTMLCanvasElement>(null);

  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [corners, setCorners] = useState<QuadCorners | null>(null);
  const [activeHandle, setActiveHandle] = useState<DragHandle | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // Zoom & Pan state
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const isPanningRef = useRef<boolean>(false);
  const panStartRef = useRef<{ clientX: number; clientY: number; panX: number; panY: number }>({ clientX: 0, clientY: 0, panX: 0, panY: 0 });

  // Mobile touch gestures (pinch zoom & single finger pan)
  const pinchRef = useRef<{
    startDist: number;
    startZoom: number;
    startPan: { x: number; y: number };
    midX: number;
    midY: number;
  } | null>(null);
  const singleTouchPanRef = useRef<{ clientX: number; clientY: number; panX: number; panY: number } | null>(null);

  // References for tracking drag delta on side handles and requestAnimationFrame throttling
  const initialCornersRef = useRef<QuadCorners | null>(null);
  const initialPointerRef = useRef<Point | null>(null);
  const rafRef = useRef<number | null>(null);
  const latestPtRef = useRef<Point | null>(null);

  const [magnifier, setMagnifier] = useState<{
    show: boolean;
    cornerName: string;
  } | null>(null);

  // Memoize data URL representation of canvas to prevent severe lag during coordinate drag
  const imageHref = useMemo(() => {
    if (!canvas) return '';
    return canvas.toDataURL('image/jpeg', 0.88);
  }, [canvas]);

  // Clean up RAF on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  // Initialize canvas and default corners from imageBase64
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const c = document.createElement('canvas');
      // Limit initial working size to 1800px to maintain peak responsiveness
      let w = img.naturalWidth || img.width;
      let h = img.naturalHeight || img.height;
      const maxDim = Math.max(w, h);
      if (maxDim > 1800) {
        const scale = 1800 / maxDim;
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }

      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);
      }

      setCanvas(c);

      // Default corners: 5% inset from boundaries for convenient grabbing
      const insetX = Math.round(w * 0.05);
      const insetY = Math.round(h * 0.05);
      setCorners({
        tl: { x: insetX, y: insetY },
        tr: { x: w - insetX, y: insetY },
        br: { x: w - insetX, y: h - insetY },
        bl: { x: insetX, y: h - insetY }
      });
    };
    img.src = initialImageBase64;
  }, [initialImageBase64]);

  // Reset corners to 4% inset
  const handleResetCorners = () => {
    if (!canvas) return;
    const w = canvas.width;
    const h = canvas.height;
    const insetX = Math.round(w * 0.04);
    const insetY = Math.round(h * 0.04);
    setCorners({
      tl: { x: insetX, y: insetY },
      tr: { x: w - insetX, y: insetY },
      br: { x: w - insetX, y: h - insetY },
      bl: { x: insetX, y: h - insetY }
    });
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Rotate 90 degrees clockwise or counter-clockwise
  const handleRotate = (clockwise: boolean) => {
    if (!canvas || !corners) return;
    const rotated = rotateCanvas(canvas, clockwise ? 90 : -90);
    const newCorners = rotateCorners(corners, canvas.width, canvas.height, clockwise);
    setCanvas(rotated);
    setCorners(newCorners);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Zoom controls
  const handleZoomIn = () => {
    setZoom(prev => Math.min(5, Math.round((prev + 0.3) * 100) / 100));
  };

  const handleZoomOut = () => {
    setZoom(prev => {
      const next = Math.max(1, Math.round((prev - 0.3) * 100) / 100);
      if (next <= 1.02) setPan({ x: 0, y: 0 });
      return next;
    });
  };

  const handleResetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Convert pointer screen event to canvas coordinates, accounting for CSS zoom and pan transforms
  const getCanvasCoords = useCallback((clientX: number, clientY: number): Point | null => {
    if (!svgRef.current || !canvas) return null;
    const svg = svgRef.current;
    try {
      const ctm = svg.getScreenCTM();
      if (ctm) {
        const pt = svg.createSVGPoint();
        pt.x = clientX;
        pt.y = clientY;
        const target = pt.matrixTransform(ctm.inverse());
        return {
          x: Math.round(Math.max(0, Math.min(canvas.width, target.x))),
          y: Math.round(Math.max(0, Math.min(canvas.height, target.y)))
        };
      }
    } catch {
      // Fallback below
    }

    const rect = svg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    let x = (clientX - rect.left) * scaleX;
    let y = (clientY - rect.top) * scaleY;

    if (x < 0) x = 0;
    if (x > canvas.width) x = canvas.width;
    if (y < 0) y = 0;
    if (y > canvas.height) y = canvas.height;

    return { x: Math.round(x), y: Math.round(y) };
  }, [canvas]);

  // Calculate midpoint of a quadrilateral side
  const getSideMidpoint = (c: QuadCorners, side: 'top' | 'right' | 'bottom' | 'left'): Point => {
    switch (side) {
      case 'top':
        return { x: Math.round((c.tl.x + c.tr.x) / 2), y: Math.round((c.tl.y + c.tr.y) / 2) };
      case 'right':
        return { x: Math.round((c.tr.x + c.br.x) / 2), y: Math.round((c.tr.y + c.br.y) / 2) };
      case 'bottom':
        return { x: Math.round((c.bl.x + c.br.x) / 2), y: Math.round((c.bl.y + c.br.y) / 2) };
      case 'left':
        return { x: Math.round((c.tl.x + c.bl.x) / 2), y: Math.round((c.tl.y + c.bl.y) / 2) };
    }
  };

  // Draw magnified loupe preview
  const updateMagnifier = useCallback((point: Point, handleKey: DragHandle) => {
    if (!canvas || !magnifierCanvasRef.current) return;
    const magCanvas = magnifierCanvasRef.current;
    const magCtx = magCanvas.getContext('2d');
    if (!magCtx) return;

    const size = 100;
    if (magCanvas.width !== size) {
      magCanvas.width = size;
      magCanvas.height = size;
    }

    const zoomFactor = 2.4;
    const srcRadius = (size / 2) / zoomFactor;

    magCtx.clearRect(0, 0, size, size);
    magCtx.save();

    // Circular clip
    magCtx.beginPath();
    magCtx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
    magCtx.clip();

    // Draw zoomed canvas slice
    magCtx.imageSmoothingEnabled = true;
    magCtx.drawImage(
      canvas,
      point.x - srcRadius,
      point.y - srcRadius,
      srcRadius * 2,
      srcRadius * 2,
      0,
      0,
      size,
      size
    );

    // Crosshair target in magnifier
    magCtx.strokeStyle = '#10b981';
    magCtx.lineWidth = 1.5;
    magCtx.beginPath();
    magCtx.moveTo(size / 2 - 14, size / 2);
    magCtx.lineTo(size / 2 + 14, size / 2);
    magCtx.moveTo(size / 2, size / 2 - 14);
    magCtx.lineTo(size / 2, size / 2 + 14);
    magCtx.stroke();

    // Center target dot
    magCtx.fillStyle = '#ef4444';
    magCtx.beginPath();
    magCtx.arc(size / 2, size / 2, 3, 0, Math.PI * 2);
    magCtx.fill();

    magCtx.restore();

    // Border around magnifier
    magCtx.strokeStyle = '#059669';
    magCtx.lineWidth = 2.5;
    magCtx.beginPath();
    magCtx.arc(size / 2, size / 2, size / 2 - 1.5, 0, Math.PI * 2);
    magCtx.stroke();

    const handleLabels: Record<DragHandle, string> = {
      tl: 'Pojok 1 (Kiri Atas)',
      tr: 'Pojok 2 (Kanan Atas)',
      br: 'Pojok 3 (Kanan Bawah)',
      bl: 'Pojok 4 (Kiri Bawah)',
      top: 'Sisi Atas',
      right: 'Sisi Kanan',
      bottom: 'Sisi Bawah',
      left: 'Sisi Kiri'
    };

    setMagnifier(prev => {
      const name = handleLabels[handleKey];
      if (prev && prev.show && prev.cornerName === name) {
        return prev;
      }
      return {
        show: true,
        cornerName: name
      };
    });
  }, [canvas]);

  // Pointer drag event handlers with pointer capture for handles
  const handlePointerDown = (handleKey: DragHandle, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    setActiveHandle(handleKey);

    const pt = getCanvasCoords(e.clientX, e.clientY);
    if (pt && corners) {
      initialCornersRef.current = { ...corners };
      initialPointerRef.current = pt;

      if (handleKey === 'tl' || handleKey === 'tr' || handleKey === 'br' || handleKey === 'bl') {
        updateMagnifier(corners[handleKey], handleKey);
      } else {
        const mid = getSideMidpoint(corners, handleKey);
        updateMagnifier(mid, handleKey);
      }
    }
  };

  // High performance RAF-throttled move handler
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!activeHandle || !corners || !initialCornersRef.current || !initialPointerRef.current || !canvas) return;
    e.preventDefault();
    e.stopPropagation();

    const pt = getCanvasCoords(e.clientX, e.clientY);
    if (!pt) return;

    latestPtRef.current = pt;

    if (rafRef.current !== null) return;

    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const targetPt = latestPtRef.current;
      if (!targetPt || !initialCornersRef.current || !initialPointerRef.current || !canvas) return;

      const W = canvas.width;
      const H = canvas.height;
      const initCorners = initialCornersRef.current;
      const initPt = initialPointerRef.current;

      // 1. Moving a single corner
      if (activeHandle === 'tl' || activeHandle === 'tr' || activeHandle === 'br' || activeHandle === 'bl') {
        setCorners(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            [activeHandle]: targetPt
          };
        });
        updateMagnifier(targetPt, activeHandle);
        return;
      }

      // 2. Moving an entire edge/side
      const totalDx = targetPt.x - initPt.x;
      const totalDy = targetPt.y - initPt.y;

      if (activeHandle === 'top') {
        const { tl, tr, bl, br } = initCorners;
        const minDx = -Math.min(tl.x, tr.x);
        const maxDx = W - Math.max(tl.x, tr.x);
        const clampedDx = Math.max(minDx, Math.min(maxDx, totalDx));

        const minDy = -Math.min(tl.y, tr.y);
        const bottomLimitY = Math.min(bl.y, br.y) - 25;
        const maxDy = bottomLimitY - Math.max(tl.y, tr.y);
        const clampedDy = Math.max(minDy, Math.min(maxDy, totalDy));

        const newTl = { x: Math.round(tl.x + clampedDx), y: Math.round(tl.y + clampedDy) };
        const newTr = { x: Math.round(tr.x + clampedDx), y: Math.round(tr.y + clampedDy) };

        setCorners(prev => (prev ? { ...prev, tl: newTl, tr: newTr } : prev));
        updateMagnifier({ x: Math.round((newTl.x + newTr.x) / 2), y: Math.round((newTl.y + newTr.y) / 2) }, 'top');
      } else if (activeHandle === 'bottom') {
        const { tl, tr, bl, br } = initCorners;
        const minDx = -Math.min(bl.x, br.x);
        const maxDx = W - Math.max(bl.x, br.x);
        const clampedDx = Math.max(minDx, Math.min(maxDx, totalDx));

        const topLimitY = Math.max(tl.y, tr.y) + 25;
        const minDy = topLimitY - Math.min(bl.y, br.y);
        const maxDy = H - Math.max(bl.y, br.y);
        const clampedDy = Math.max(minDy, Math.min(maxDy, totalDy));

        const newBl = { x: Math.round(bl.x + clampedDx), y: Math.round(bl.y + clampedDy) };
        const newBr = { x: Math.round(br.x + clampedDx), y: Math.round(br.y + clampedDy) };

        setCorners(prev => (prev ? { ...prev, bl: newBl, br: newBr } : prev));
        updateMagnifier({ x: Math.round((newBl.x + newBr.x) / 2), y: Math.round((newBl.y + newBr.y) / 2) }, 'bottom');
      } else if (activeHandle === 'left') {
        const { tl, tr, bl, br } = initCorners;
        const minDx = -Math.min(tl.x, bl.x);
        const rightLimitX = Math.min(tr.x, br.x) - 25;
        const maxDx = rightLimitX - Math.max(tl.x, bl.x);
        const clampedDx = Math.max(minDx, Math.min(maxDx, totalDx));

        const minDy = -Math.min(tl.y, bl.y);
        const maxDy = H - Math.max(tl.y, bl.y);
        const clampedDy = Math.max(minDy, Math.min(maxDy, totalDy));

        const newTl = { x: Math.round(tl.x + clampedDx), y: Math.round(tl.y + clampedDy) };
        const newBl = { x: Math.round(bl.x + clampedDx), y: Math.round(bl.y + clampedDy) };

        setCorners(prev => (prev ? { ...prev, tl: newTl, bl: newBl } : prev));
        updateMagnifier({ x: Math.round((newTl.x + newBl.x) / 2), y: Math.round((newTl.y + newBl.y) / 2) }, 'left');
      } else if (activeHandle === 'right') {
        const { tl, tr, bl, br } = initCorners;
        const leftLimitX = Math.max(tl.x, bl.x) + 25;
        const minDx = leftLimitX - Math.min(tr.x, br.x);
        const maxDx = W - Math.max(tr.x, br.x);
        const clampedDx = Math.max(minDx, Math.min(maxDx, totalDx));

        const minDy = -Math.min(tr.y, br.y);
        const maxDy = H - Math.max(tr.y, br.y);
        const clampedDy = Math.max(minDy, Math.min(maxDy, totalDy));

        const newTr = { x: Math.round(tr.x + clampedDx), y: Math.round(tr.y + clampedDy) };
        const newBr = { x: Math.round(br.x + clampedDx), y: Math.round(br.y + clampedDy) };

        setCorners(prev => (prev ? { ...prev, tr: newTr, br: newBr } : prev));
        updateMagnifier({ x: Math.round((newTr.x + newBr.x) / 2), y: Math.round((newTr.y + newBr.y) / 2) }, 'right');
      }
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (activeHandle) {
      try {
        (e.target as Element).releasePointerCapture(e.pointerId);
      } catch {
        // Safe ignore
      }
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      setActiveHandle(null);
      setMagnifier(null);
      initialCornersRef.current = null;
      initialPointerRef.current = null;
    }
  };

  // Mouse wheel zoom (Laptop)
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
    setZoom(prevZoom => {
      const nextZoom = Math.min(5, Math.max(1, prevZoom * zoomFactor));
      if (nextZoom <= 1.02) {
        setPan({ x: 0, y: 0 });
        return 1;
      }
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const mouseX = e.clientX - rect.left - rect.width / 2;
        const mouseY = e.clientY - rect.top - rect.height / 2;
        const ratio = nextZoom / prevZoom;
        setPan(prevPan => ({
          x: Math.round(mouseX - (mouseX - prevPan.x) * ratio),
          y: Math.round(mouseY - (mouseY - prevPan.y) * ratio)
        }));
      }
      return Math.round(nextZoom * 100) / 100;
    });
  };

  // Mouse drag pan on background (Laptop)
  const handleStagePointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return;
    if (activeHandle) return;
    if (e.button !== 0) return;

    isPanningRef.current = true;
    panStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      panX: pan.x,
      panY: pan.y
    };
  };

  const handleStagePointerMove = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return;
    if (!isPanningRef.current) return;

    const dx = e.clientX - panStartRef.current.clientX;
    const dy = e.clientY - panStartRef.current.clientY;
    setPan({
      x: Math.round(panStartRef.current.panX + dx),
      y: Math.round(panStartRef.current.panY + dy)
    });
  };

  const handleStagePointerUp = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return;
    isPanningRef.current = false;
  };

  // Touch handlers for Mobile / HP: 1-finger pan & 2-finger pinch-to-zoom
  const handleTouchStart = (e: React.TouchEvent) => {
    if (activeHandle) return;

    if (e.touches.length === 2) {
      singleTouchPanRef.current = null;
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      pinchRef.current = {
        startDist: dist,
        startZoom: zoom,
        startPan: { ...pan },
        midX: (t1.clientX + t2.clientX) / 2,
        midY: (t1.clientY + t2.clientY) / 2
      };
    } else if (e.touches.length === 1) {
      pinchRef.current = null;
      singleTouchPanRef.current = {
        clientX: e.touches[0].clientX,
        clientY: e.touches[0].clientY,
        panX: pan.x,
        panY: pan.y
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (activeHandle) return;

    if (e.touches.length === 2 && pinchRef.current && containerRef.current) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const currentDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      if (pinchRef.current.startDist > 0) {
        const scaleRatio = currentDist / pinchRef.current.startDist;
        const nextZoom = Math.min(5, Math.max(1, pinchRef.current.startZoom * scaleRatio));

        const rect = containerRef.current.getBoundingClientRect();
        const currentMidX = (t1.clientX + t2.clientX) / 2 - rect.left - rect.width / 2;
        const currentMidY = (t1.clientY + t2.clientY) / 2 - rect.top - rect.height / 2;
        const startMidX = pinchRef.current.midX - rect.left - rect.width / 2;
        const startMidY = pinchRef.current.midY - rect.top - rect.height / 2;

        const zoomRatio = nextZoom / pinchRef.current.startZoom;
        const newPanX = currentMidX - (startMidX - pinchRef.current.startPan.x) * zoomRatio;
        const newPanY = currentMidY - (startMidY - pinchRef.current.startPan.y) * zoomRatio;

        setZoom(Math.round(nextZoom * 100) / 100);
        setPan({ x: Math.round(newPanX), y: Math.round(newPanY) });
      }
    } else if (e.touches.length === 1 && singleTouchPanRef.current) {
      const dx = e.touches[0].clientX - singleTouchPanRef.current.clientX;
      const dy = e.touches[0].clientY - singleTouchPanRef.current.clientY;
      setPan({
        x: Math.round(singleTouchPanRef.current.panX + dx),
        y: Math.round(singleTouchPanRef.current.panY + dy)
      });
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length < 2) {
      pinchRef.current = null;
    }
    if (e.touches.length === 0) {
      singleTouchPanRef.current = null;
      if (zoom <= 1.02) {
        setZoom(1);
        setPan({ x: 0, y: 0 });
      }
    }
  };

  // Confirm perspective transformation and proceed to OCR
  const handleApplyCropAndExtract = () => {
    if (!canvas || !corners || isProcessing) return;
    setIsProcessing(true);

    // Brief timeout so UI renders processing state smoothly
    setTimeout(() => {
      try {
        const warped = warpPerspective(canvas, corners, 1400);
        const warpedDataUrl = warped.toDataURL('image/jpeg', 0.84);
        onConfirm(warpedDataUrl);
      } catch (err) {
        console.error('Perspective warp failed:', err);
        // Fallback: use canvas directly if warp fails for any unforeseen reason
        onConfirm(canvas.toDataURL('image/jpeg', 0.82));
      } finally {
        setIsProcessing(false);
      }
    }, 50);
  };

  if (!canvas || !corners) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-500">
        <div className="w-9 h-9 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mb-3"></div>
        <p className="text-sm font-medium">Menyiapkan foto...</p>
      </div>
    );
  }

  const { tl, tr, br, bl } = corners;
  const W = canvas.width;
  const H = canvas.height;

  // Mask path: outer canvas box minus the quadrilateral cutout (even-odd fill rule)
  const maskPath = `M 0 0 L ${W} 0 L ${W} ${H} L 0 ${H} Z M ${tl.x} ${tl.y} L ${bl.x} ${bl.y} L ${br.x} ${br.y} L ${tr.x} ${tr.y} Z`;
  const quadPoints = `${tl.x},${tl.y} ${tr.x},${tr.y} ${br.x},${br.y} ${bl.x},${bl.y}`;

  // Handle sizes scaled to resolution
  const hitRadius = Math.max(28, Math.round(Math.min(W, H) * 0.055));
  const pinRadius = Math.max(13, Math.round(Math.min(W, H) * 0.026));
  const pillW = Math.max(30, Math.round(pinRadius * 2.5));
  const pillH = Math.max(14, Math.round(pinRadius * 1.1));
  const strokeW = Math.max(3.5, Math.round(Math.min(W, H) * 0.007));

  const cornerItems: { key: DragHandle; pt: Point; label: string }[] = [
    { key: 'tl', pt: tl, label: '1' },
    { key: 'tr', pt: tr, label: '2' },
    { key: 'br', pt: br, label: '3' },
    { key: 'bl', pt: bl, label: '4' }
  ];

  const sideItems: {
    key: 'top' | 'right' | 'bottom' | 'left';
    p1: Point;
    p2: Point;
    mid: Point;
    angle: number;
    label: string;
  }[] = [
    {
      key: 'top',
      p1: tl,
      p2: tr,
      mid: { x: Math.round((tl.x + tr.x) / 2), y: Math.round((tl.y + tr.y) / 2) },
      angle: Math.atan2(tr.y - tl.y, tr.x - tl.x) * (180 / Math.PI),
      label: 'Sisi Atas'
    },
    {
      key: 'right',
      p1: tr,
      p2: br,
      mid: { x: Math.round((tr.x + br.x) / 2), y: Math.round((tr.y + br.y) / 2) },
      angle: Math.atan2(br.y - tr.y, br.x - tr.x) * (180 / Math.PI),
      label: 'Sisi Kanan'
    },
    {
      key: 'bottom',
      p1: bl,
      p2: br,
      mid: { x: Math.round((bl.x + br.x) / 2), y: Math.round((bl.y + br.y) / 2) },
      angle: Math.atan2(br.y - bl.y, br.x - bl.x) * (180 / Math.PI),
      label: 'Sisi Bawah'
    },
    {
      key: 'left',
      p1: tl,
      p2: bl,
      mid: { x: Math.round((tl.x + bl.x) / 2), y: Math.round((tl.y + bl.y) / 2) },
      angle: Math.atan2(bl.y - tl.y, bl.x - tl.x) * (180 / Math.PI),
      label: 'Sisi Kiri'
    }
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0 space-y-0 sm:space-y-2">
      {/* Main Interactive Stage with native Zoom & Pan */}
      <div 
        ref={containerRef}
        className="relative w-full flex-1 min-h-[260px] bg-slate-950 rounded-none sm:rounded-xl overflow-hidden border-0 sm:border border-slate-800 flex items-center justify-center select-none touch-none cursor-grab active:cursor-grabbing"
        onWheel={handleWheel}
        onPointerDown={handleStagePointerDown}
        onPointerMove={handleStagePointerMove}
        onPointerUp={handleStagePointerUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* SVG Drawing Canvas & Handles */}
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="xMidYMid meet"
          style={{
            transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
            transformOrigin: 'center center',
            willChange: 'transform'
          }}
          className="w-full h-full max-h-[calc(100vh-140px)] sm:max-h-[70vh] object-contain block touch-none pointer-events-auto"
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {/* Base Image (Memoized URL to prevent re-encoding lag) */}
          <image 
            href={imageHref} 
            width={W} 
            height={H} 
            preserveAspectRatio="none"
          />

          {/* Darkened mask outside crop area */}
          <path
            d={maskPath}
            fill="rgba(15, 23, 42, 0.65)"
            fillRule="evenodd"
          />

          {/* Clear High-Contrast Grid Guidelines inside quadrilateral */}
          <g stroke="rgba(0, 0, 0, 0.6)" strokeWidth={strokeW * 0.8}>
            <line
              x1={(tl.x + bl.x) / 2}
              y1={(tl.y + bl.y) / 2}
              x2={(tr.x + br.x) / 2}
              y2={(tr.y + br.y) / 2}
            />
            <line
              x1={(tl.x + tr.x) / 2}
              y1={(tl.y + tr.y) / 2}
              x2={(bl.x + br.x) / 2}
              y2={(bl.y + br.y) / 2}
            />
          </g>
          {/* White dashed foreground lines */}
          <g stroke="#ffffff" strokeWidth={strokeW * 0.45} strokeDasharray="5,4" strokeOpacity="0.95">
            <line
              x1={(tl.x + bl.x) / 2}
              y1={(tl.y + bl.y) / 2}
              x2={(tr.x + br.x) / 2}
              y2={(tr.y + br.y) / 2}
            />
            <line
              x1={(tl.x + tr.x) / 2}
              y1={(tl.y + tr.y) / 2}
              x2={(bl.x + br.x) / 2}
              y2={(bl.y + br.y) / 2}
            />
          </g>

          {/* High-Contrast Quadrilateral Border */}
          <polygon
            points={quadPoints}
            fill="rgba(16, 185, 129, 0.12)"
            stroke="rgba(0, 0, 0, 0.85)"
            strokeWidth={strokeW * 1.8}
            strokeLinejoin="round"
          />
          <polygon
            points={quadPoints}
            fill="none"
            stroke="#10b981"
            strokeWidth={strokeW * 1.1}
            strokeLinejoin="round"
          />

          {/* Invisible thick line hit targets for dragging whole edges */}
          {sideItems.map(({ key, p1, p2 }) => (
            <line
              key={`edge-hit-${key}`}
              x1={p1.x}
              y1={p1.y}
              x2={p2.x}
              y2={p2.y}
              stroke="transparent"
              strokeWidth={hitRadius * 1.5}
              className="cursor-grab active:cursor-grabbing"
              onPointerDown={(e) => handlePointerDown(key, e)}
              onPointerUp={handlePointerUp}
            />
          ))}

          {/* 4 Side Midpoint Drag Handles (Pills) */}
          {sideItems.map(({ key, mid, angle }) => {
            const isActive = activeHandle === key;
            return (
              <g
                key={`side-handle-${key}`}
                transform={`translate(${mid.x}, ${mid.y}) rotate(${angle})`}
                className="cursor-grab active:cursor-grabbing"
              >
                {/* Touch hit area for the side pill */}
                <rect
                  x={-hitRadius * 1.3}
                  y={-hitRadius * 1.0}
                  width={hitRadius * 2.6}
                  height={hitRadius * 2.0}
                  fill="transparent"
                  onPointerDown={(e) => handlePointerDown(key, e)}
                  onPointerUp={handlePointerUp}
                />

                {/* Glowing ring when active */}
                {isActive && (
                  <rect
                    x={-pillW / 2 - 4}
                    y={-pillH / 2 - 4}
                    width={pillW + 8}
                    height={pillH + 8}
                    rx={(pillH + 8) / 2}
                    fill="none"
                    stroke="#34d399"
                    strokeWidth={strokeW * 1.5}
                    opacity="0.9"
                  />
                )}

                {/* Dark casing border for high contrast */}
                <rect
                  x={-pillW / 2 - 1.5}
                  y={-pillH / 2 - 1.5}
                  width={pillW + 3}
                  height={pillH + 3}
                  rx={(pillH + 3) / 2}
                  fill="#0f172a"
                  opacity="0.75"
                />

                {/* Visible Pill Handle */}
                <rect
                  x={-pillW / 2}
                  y={-pillH / 2}
                  width={pillW}
                  height={pillH}
                  rx={pillH / 2}
                  fill={isActive ? '#10b981' : '#ffffff'}
                  stroke={isActive ? '#ffffff' : '#059669'}
                  strokeWidth={strokeW * 1.1}
                  onPointerDown={(e) => handlePointerDown(key, e)}
                  onPointerUp={handlePointerUp}
                />

                {/* 2 Grip Dash Lines inside Pill */}
                <line
                  x1={-pillW * 0.18}
                  y1={-pillH * 0.28}
                  x2={-pillW * 0.18}
                  y2={pillH * 0.28}
                  stroke={isActive ? '#ffffff' : '#059669'}
                  strokeWidth={strokeW * 0.9}
                  strokeLinecap="round"
                  pointerEvents="none"
                />
                <line
                  x1={pillW * 0.18}
                  y1={-pillH * 0.28}
                  x2={pillW * 0.18}
                  y2={pillH * 0.28}
                  stroke={isActive ? '#ffffff' : '#059669'}
                  strokeWidth={strokeW * 0.9}
                  strokeLinecap="round"
                  pointerEvents="none"
                />
              </g>
            );
          })}

          {/* 4 Corner Pins */}
          {cornerItems.map(({ key, pt, label }) => {
            const isActive = activeHandle === key;
            return (
              <g key={key} className="cursor-grab active:cursor-grabbing">
                {/* Large invisible touch hit area */}
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={hitRadius}
                  fill="transparent"
                  onPointerDown={(e) => handlePointerDown(key, e)}
                  onPointerUp={handlePointerUp}
                />

                {/* Pulsing ring on active */}
                {isActive && (
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={pinRadius * 2.2}
                    fill="none"
                    stroke="#34d399"
                    strokeWidth={strokeW * 1.5}
                    opacity="0.8"
                  />
                )}

                {/* Dark casing circle for high contrast */}
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={pinRadius + 2}
                  fill="#0f172a"
                  opacity="0.75"
                />

                {/* Visible Pin Circle */}
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={pinRadius}
                  fill={isActive ? '#10b981' : '#ffffff'}
                  stroke={isActive ? '#ffffff' : '#059669'}
                  strokeWidth={strokeW * 1.2}
                  onPointerDown={(e) => handlePointerDown(key, e)}
                  onPointerUp={handlePointerUp}
                />

                {/* Center target dot */}
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={pinRadius * 0.35}
                  fill={isActive ? '#ffffff' : '#059669'}
                  pointerEvents="none"
                />

                {/* Corner Number Badge */}
                <text
                  x={pt.x}
                  y={pt.y - pinRadius * 1.4}
                  textAnchor="middle"
                  fill="#ffffff"
                  stroke="#0f172a"
                  strokeWidth={3.5}
                  paintOrder="stroke"
                  fontSize={Math.max(12, pinRadius * 1.1)}
                  fontWeight="bold"
                  pointerEvents="none"
                >
                  {label}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Floating Zoom & Pan Controls */}
        <div className="absolute top-2.5 left-2.5 z-20 flex items-center gap-1 bg-slate-900/85 backdrop-blur-md px-2 py-1.5 rounded-xl border border-slate-700/60 shadow-lg text-white text-xs">
          <button
            type="button"
            onClick={handleZoomOut}
            disabled={zoom <= 1}
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800 transition active:scale-95 cursor-pointer text-slate-200"
            title="Perkecil (Zoom Out)"
          >
            <ZoomOut size={14} />
          </button>
          
          <button
            type="button"
            onClick={handleResetZoom}
            className="px-2 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 font-mono text-[11px] font-bold text-emerald-400 cursor-pointer transition"
            title="Klik untuk reset zoom (100%)"
          >
            {Math.round(zoom * 100)}%
          </button>

          <button
            type="button"
            onClick={handleZoomIn}
            disabled={zoom >= 5}
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800 transition active:scale-95 cursor-pointer text-slate-200"
            title="Perbesar (Zoom In)"
          >
            <ZoomIn size={14} />
          </button>

          {(zoom > 1 || pan.x !== 0 || pan.y !== 0) && (
            <button
              type="button"
              onClick={handleResetZoom}
              className="ml-0.5 px-2 py-1 rounded-lg bg-emerald-600/80 hover:bg-emerald-600 text-white font-bold text-[10px] cursor-pointer transition shadow-xs"
              title="Reset Posisi & Zoom"
            >
              Reset
            </button>
          )}
        </div>

        {/* Floating Helper Tip */}
        <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
          <div className="bg-slate-900/75 backdrop-blur-md px-2.5 py-1 rounded-full border border-slate-700/50 shadow-md text-[10px] text-slate-300 font-medium flex items-center gap-1.5 whitespace-nowrap">
            <Move size={11} className="text-emerald-400 shrink-0" />
            <span>{zoom > 1 ? 'Geser gambar untuk navigasi sudut' : 'Scroll mouse / cubit 2 jari untuk zoom'}</span>
          </div>
        </div>

        {/* Floating Magnifier / Loupe */}
        <div 
          className={`absolute top-2.5 right-2.5 pointer-events-none transition-opacity duration-150 z-20 ${
            magnifier?.show ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div className="bg-slate-900/90 backdrop-blur-md p-1.5 rounded-2xl shadow-2xl border border-emerald-500/50 flex flex-col items-center">
            <canvas 
              ref={magnifierCanvasRef} 
              className="rounded-xl w-[90px] h-[90px] sm:w-[100px] sm:h-[100px] block" 
            />
            <span className="text-[10px] font-bold text-emerald-300 mt-1 text-center px-1">
              {magnifier?.cornerName || 'Perbesar Sudut'}
            </span>
          </div>
        </div>
      </div>

      {/* Editor Toolbars */}
      <div className="space-y-2 shrink-0 p-2.5 sm:p-0 bg-white sm:bg-transparent border-t border-slate-200/80 sm:border-t-0">
        {/* Secondary Tool actions (Rotate, Reset) */}
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => handleRotate(false)}
              className="px-2.5 py-1.5 sm:px-3 sm:py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg sm:rounded-xl text-xs font-bold flex items-center gap-1.5 transition active:scale-95 cursor-pointer shadow-2xs"
              title="Putar 90 derajat ke kiri"
            >
              <RotateCcw size={14} className="text-emerald-700" />
              <span>Putar Kiri</span>
            </button>

            <button
              type="button"
              onClick={() => handleRotate(true)}
              className="px-2.5 py-1.5 sm:px-3 sm:py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg sm:rounded-xl text-xs font-bold flex items-center gap-1.5 transition active:scale-95 cursor-pointer shadow-2xs"
              title="Putar 90 derajat ke kanan"
            >
              <RotateCw size={14} className="text-emerald-700" />
              <span>Putar Kanan</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleResetCorners}
            className="px-2.5 py-1.5 sm:px-3 sm:py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg sm:rounded-xl text-xs font-bold flex items-center gap-1.5 transition active:scale-95 cursor-pointer shadow-2xs"
            title="Kembalikan titik ke sudut foto semula"
          >
            <Maximize2 size={13} className="text-amber-700" />
            <span>Reset Sudut</span>
          </button>
        </div>

        {/* Primary Action Buttons */}
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isProcessing}
            className="px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-100 text-xs sm:text-sm font-semibold transition cursor-pointer flex items-center justify-center gap-1.5 shrink-0"
          >
            <X size={15} />
            <span>Ganti Foto</span>
          </button>

          <button
            type="button"
            onClick={handleApplyCropAndExtract}
            disabled={isProcessing}
            className="flex-1 sm:flex-initial px-4 py-2 sm:px-5 sm:py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-teal-800 text-white text-xs sm:text-sm font-bold shadow-md hover:shadow-lg transition active:scale-98 cursor-pointer flex items-center justify-center gap-1.5 group disabled:opacity-50"
          >
            {isProcessing ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Memproses...</span>
              </>
            ) : (
              <>
                <Sparkles size={15} className="text-amber-200 group-hover:rotate-12 transition-transform" />
                <span>Potong & Ekstrak OCR</span>
                <Check size={15} className="text-emerald-200 ml-0.5" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
