// lib/koperasi/perspectiveTransform.ts — port dari backup MyPerform
// (src/utils/perspectiveTransform.ts): homografi 4-titik + rotasi canvas,
// dipakai PhotoPerspectiveEditor untuk meluruskan foto KTP. Canvas murni.
export interface Point {
  x: number;
  y: number;
}

export interface QuadCorners {
  tl: Point; // Top-Left
  tr: Point; // Top-Right
  br: Point; // Bottom-Right
  bl: Point; // Bottom-Left
}

/**
 * Rotates an HTMLCanvasElement by the specified angle (90, -90, 180, 270)
 * and returns a new canvas.
 */
export function rotateCanvas(
  source: HTMLCanvasElement,
  angleDeg: 90 | -90 | 180 | 270
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const is90or270 = Math.abs(angleDeg) === 90 || Math.abs(angleDeg) === 270;
  canvas.width = is90or270 ? source.height : source.width;
  canvas.height = is90or270 ? source.width : source.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((angleDeg * Math.PI) / 180);
  ctx.drawImage(source, -source.width / 2, -source.height / 2);
  ctx.restore();

  return canvas;
}

/**
 * Rotates corner points when the canvas is rotated clockwise (90 deg)
 * or counter-clockwise (-90 deg).
 */
export function rotateCorners(
  corners: QuadCorners,
  origWidth: number,
  origHeight: number,
  clockwise: boolean
): QuadCorners {
  if (clockwise) {
    // 90 deg clockwise:
    // (x, y) -> (origHeight - 1 - y, x)
    // tl -> tr, tr -> br, br -> bl, bl -> tl
    const rot = (p: Point): Point => ({
      x: origHeight - 1 - p.y,
      y: p.x,
    });
    return {
      tl: rot(corners.bl),
      tr: rot(corners.tl),
      br: rot(corners.tr),
      bl: rot(corners.br),
    };
  } else {
    // 90 deg counter-clockwise:
    // (x, y) -> (y, origWidth - 1 - x)
    const rot = (p: Point): Point => ({
      x: p.y,
      y: origWidth - 1 - p.x,
    });
    return {
      tl: rot(corners.tr),
      tr: rot(corners.br),
      br: rot(corners.bl),
      bl: rot(corners.tl),
    };
  }
}

/**
 * Performs a 4-point projective homography perspective transformation
 * on a source canvas given 4 quadrilateral corner coordinates (tl, tr, br, bl),
 * producing an un-warped, rectified rectangular canvas.
 */
export function warpPerspective(
  source: HTMLCanvasElement,
  corners: QuadCorners,
  maxOutputDim = 1800
): HTMLCanvasElement {
  const p0 = corners.tl;
  const p1 = corners.tr;
  const p2 = corners.br;
  const p3 = corners.bl;

  // Calculate target rectangular dimension based on corner Euclidean distances
  const dxTop = p1.x - p0.x;
  const dyTop = p1.y - p0.y;
  const wTop = Math.hypot(dxTop, dyTop);

  const dxBottom = p2.x - p3.x;
  const dyBottom = p2.y - p3.y;
  const wBottom = Math.hypot(dxBottom, dyBottom);

  const dxLeft = p3.x - p0.x;
  const dyLeft = p3.y - p0.y;
  const hLeft = Math.hypot(dxLeft, dyLeft);

  const dxRight = p2.x - p1.x;
  const dyRight = p2.y - p1.y;
  const hRight = Math.hypot(dxRight, dyRight);

  let outWidth = Math.round(Math.max(wTop, wBottom));
  let outHeight = Math.round(Math.max(hLeft, hRight));

  if (outWidth < 60) outWidth = 60;
  if (outHeight < 60) outHeight = 60;

  const maxDim = Math.max(outWidth, outHeight);
  if (maxDim > maxOutputDim) {
    const scale = maxOutputDim / maxDim;
    outWidth = Math.round(outWidth * scale);
    outHeight = Math.round(outHeight * scale);
  }

  // Heckbert Projective Mapping Coefficients: Unit Square -> Quad
  const x0 = p0.x, y0 = p0.y;
  const x1 = p1.x, y1 = p1.y;
  const x2 = p2.x, y2 = p2.y;
  const x3 = p3.x, y3 = p3.y;

  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const sx = x0 - x1 + x2 - x3;

  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const sy = y0 - y1 + y2 - y3;

  let a: number, b: number, c: number;
  let d: number, e: number, f: number;
  let g: number, h: number;

  const det = dx1 * dy2 - dx2 * dy1;

  if (Math.abs(sx) < 1e-5 && Math.abs(sy) < 1e-5) {
    // Affine
    a = x1 - x0;
    b = x3 - x0;
    c = x0;
    d = y1 - y0;
    e = y3 - y0;
    f = y0;
    g = 0;
    h = 0;
  } else if (Math.abs(det) < 1e-7) {
    // Degenerate fallback
    a = x1 - x0;
    b = x3 - x0;
    c = x0;
    d = y1 - y0;
    e = y3 - y0;
    f = y0;
    g = 0;
    h = 0;
  } else {
    g = (sx * dy2 - sy * dx2) / det;
    h = (dx1 * sy - dy1 * sx) / det;
    a = x1 - x0 + g * x1;
    b = x3 - x0 + h * x3;
    c = x0;
    d = y1 - y0 + g * y1;
    e = y3 - y0 + h * y3;
    f = y0;
  }

  const srcCtx = source.getContext('2d');
  if (!srcCtx) return source;

  const srcImageData = srcCtx.getImageData(0, 0, source.width, source.height);
  const srcData = srcImageData.data;
  const srcW = source.width;
  const srcH = source.height;

  const outCanvas = document.createElement('canvas');
  outCanvas.width = outWidth;
  outCanvas.height = outHeight;
  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) return source;

  const outImageData = outCtx.createImageData(outWidth, outHeight);
  const outData = outImageData.data;

  const denomW = outWidth > 1 ? outWidth - 1 : 1;
  const denomH = outHeight > 1 ? outHeight - 1 : 1;

  for (let y = 0; y < outHeight; y++) {
    const v = y / denomH;
    const v_b = b * v + c;
    const v_e = e * v + f;
    const v_h = h * v + 1;
    const rowOffset = y * outWidth * 4;

    for (let x = 0; x < outWidth; x++) {
      const u = x / denomW;
      const denom = g * u + v_h;
      let sxCoord = (a * u + v_b) / denom;
      let syCoord = (d * u + v_e) / denom;

      // Clamping bounds
      if (sxCoord < 0) sxCoord = 0;
      else if (sxCoord > srcW - 1) sxCoord = srcW - 1;
      if (syCoord < 0) syCoord = 0;
      else if (syCoord > srcH - 1) syCoord = srcH - 1;

      const px0 = Math.floor(sxCoord);
      const py0 = Math.floor(syCoord);
      const px1 = Math.min(px0 + 1, srcW - 1);
      const py1 = Math.min(py0 + 1, srcH - 1);

      const fx = sxCoord - px0;
      const fy = syCoord - py0;

      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;

      const idx00 = (py0 * srcW + px0) * 4;
      const idx10 = (py0 * srcW + px1) * 4;
      const idx01 = (py1 * srcW + px0) * 4;
      const idx11 = (py1 * srcW + px1) * 4;

      const outIdx = rowOffset + x * 4;

      outData[outIdx] = Math.round(
        w00 * srcData[idx00] + w10 * srcData[idx10] + w01 * srcData[idx01] + w11 * srcData[idx11]
      );
      outData[outIdx + 1] = Math.round(
        w00 * srcData[idx00 + 1] + w10 * srcData[idx10 + 1] + w01 * srcData[idx01 + 1] + w11 * srcData[idx11 + 1]
      );
      outData[outIdx + 2] = Math.round(
        w00 * srcData[idx00 + 2] + w10 * srcData[idx10 + 2] + w01 * srcData[idx01 + 2] + w11 * srcData[idx11 + 2]
      );
      outData[outIdx + 3] = 255;
    }
  }

  outCtx.putImageData(outImageData, 0, 0);
  return outCanvas;
}
