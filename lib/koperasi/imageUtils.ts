// lib/koperasi/imageUtils.ts — port dari backup MyPerform
// (src/components/koperasi/imageUtils.ts): utilitas gambar modul
// keanggotaan. Foto dari galeri/kamera diperkecil dulu di sisi klien
// sebelum dikirim ke server, supaya foto HP (bisa puluhan MB) tidak
// membengkakkan penyimpanan.

export function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('File gambar tidak bisa dibaca.'));
      img.src = String(reader.result || '');
    };
    reader.onerror = () => reject(new Error('File gambar tidak bisa dibaca.'));
    reader.readAsDataURL(file);
  });
}

export function imageToDataUrl(
  img: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement,
  maxDim: number,
  mime: 'image/jpeg' | 'image/png',
  quality = 0.82
): string {
  const w =
    (img as any).videoWidth || (img as any).naturalWidth || (img as any).width || 0;
  const h =
    (img as any).videoHeight || (img as any).naturalHeight || (img as any).height || 0;
  if (!w || !h) throw new Error('Ukuran gambar tidak dikenali.');
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas tidak tersedia di perangkat ini.');
  if (mime === 'image/jpeg') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(img as any, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL(mime, mime === 'image/jpeg' ? quality : undefined);
}

export async function downscaleFileToJpeg(file: File, maxDim = 1280): Promise<string> {
  const img = await loadImageFromFile(file);
  return imageToDataUrl(img, maxDim, 'image/jpeg', 0.82);
}

export async function downscaleFileToPng(file: File, maxDim = 600): Promise<string> {
  const img = await loadImageFromFile(file);
  return imageToDataUrl(img, maxDim, 'image/png');
}

// Putar foto 90° searah jarum jam (untuk foto kamera yang landscape).
// Dipakai tombol "Putar 90°" pada foto yang sudah tersimpan di form.
export async function rotateImageDataUrl(dataUrl: string): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error('Foto tidak bisa dibaca.'));
    im.src = dataUrl;
  });
  const canvas = document.createElement('canvas');
  canvas.width = img.height;
  canvas.height = img.width;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas tidak tersedia di perangkat ini.');
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  return canvas.toDataURL('image/jpeg', 0.82);
}
