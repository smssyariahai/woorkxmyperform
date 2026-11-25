// Kompresi foto client-side SEBELUM upload (Canvas API).
// - Resize: sisi terpanjang maksimal 2000px, pertahankan rasio aspek, tanpa crop.
// - Export JPEG/WebP dengan quality bertahap (0.9 -> 0.5) sampai di bawah batas.
// - Bila tetap di atas batas pada quality terendah, kembalikan blob terkecil
//   + flag overLimit agar UI menolak upload (server juga menolak).

const MAX_SIDE = 2000;

export interface CompressResult {
  blob: Blob;
  originalSize: number;
  compressedSize: number;
  wasCompressed: boolean;
  overLimit: boolean;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Gagal mengompres gambar.'))),
      type,
      quality
    );
  });
}

export async function compressImage(file: File, maxBytes: number): Promise<CompressResult> {
  const originalSize = file.size;
  // Format sumber dipertahankan bila JPEG/WebP; PNG diubah ke JPEG bila
  // perlu kompresi (tetap terbaca jelas). Bila file sudah kecil, lewati.
  const targetType = file.type === 'image/png' ? 'image/jpeg' : file.type || 'image/jpeg';
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas tidak tersedia di browser ini.');
    // Latar putih untuk JPEG (PNG transparan tidak jadi hitam).
    if (targetType === 'image/jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
    }
    ctx.drawImage(bitmap, 0, 0, width, height);

    const needsResize = scale < 1;
    let blob = await canvasToBlob(canvas, targetType, 0.92);
    let wasCompressed = needsResize || blob.size < originalSize;
    // Turunkan quality bertahap sampai di bawah batas.
    for (const q of [0.85, 0.75, 0.65, 0.55, 0.5]) {
      if (blob.size <= maxBytes) break;
      const next = await canvasToBlob(canvas, targetType, q);
      if (next.size < blob.size) blob = next;
      wasCompressed = true;
    }
    // Bila hasil kompresi justru lebih besar dari aslinya DAN aslinya sudah
    // di bawah batas, pakai file asli.
    if (blob.size > originalSize && originalSize <= maxBytes) {
      return {
        blob: file,
        originalSize,
        compressedSize: originalSize,
        wasCompressed: false,
        overLimit: false,
      };
    }
    return {
      blob,
      originalSize,
      compressedSize: blob.size,
      wasCompressed,
      overLimit: blob.size > maxBytes,
    };
  } finally {
    bitmap.close();
  }
}
