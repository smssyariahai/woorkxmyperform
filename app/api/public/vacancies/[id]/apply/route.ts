import { prisma } from '@/lib/db';
import { apiOk, apiErr } from '@/lib/utils';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

const MAX_CV_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

/** Throttle sederhana: maks 10 lamaran per jam per IP. */
const hits = new Map<string, number[]>();
function throttled(ip: string): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 3600_000);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > 10;
}

/**
 * POST /api/public/vacancies/[id]/apply — kirim lamaran (publik, multipart).
 * Field: name*, phone*, email, address, birthDate, education, experience,
 *        notes, website (honeypot — harus kosong), cv (file PDF/DOC/DOCX ≤5MB).
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || (req as any).ip || 'unknown';
    if (throttled(ip)) return apiErr('Terlalu banyak percobaan. Coba lagi nanti.', 429);

    const vacancy = await prisma.hrVacancy.findFirst({
      where: { id: params.id, status: 'OPEN' },
      select: { id: true, organizationId: true, title: true },
    });
    if (!vacancy) return apiErr('Lowongan tidak ditemukan atau sudah ditutup.', 404);

    const form = await req.formData();
    if (String(form.get('website') || '').trim() !== '') {
      return apiErr('Pengiriman ditolak.', 400); // honeypot
    }

    const name = String(form.get('name') || '').trim();
    const phone = String(form.get('phone') || '').trim();
    if (name.length < 3) return apiErr('Nama lengkap minimal 3 karakter.', 422);
    if (phone.replace(/\D/g, '').length < 9) return apiErr('Nomor telepon/WhatsApp tidak valid.', 422);

    const email = String(form.get('email') || '').trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return apiErr('Format email tidak valid.', 422);
    }

    // --- CV ---
    let cvUrl: string | null = null;
    let cvName: string | null = null;
    const cv = form.get('cv');
    if (cv && typeof cv !== 'string' && cv.size > 0) {
      if (cv.size > MAX_CV_BYTES) return apiErr('Ukuran CV maksimal 5 MB.', 422);
      if (!ALLOWED_MIME.includes(cv.type)) {
        return apiErr('Format CV harus PDF, DOC, atau DOCX.', 422);
      }
      const dir = join(process.cwd(), 'uploads', 'cv');
      await mkdir(dir, { recursive: true });
      const ext = (cv.name.split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'pdf';
      const stored = `${randomUUID()}.${ext}`;
      const buf = Buffer.from(await cv.arrayBuffer());
      await writeFile(join(dir, stored), buf);
      cvName = cv.name.slice(0, 120);
      // path sementara; dilengkapi dengan id kandidat setelah dibuat
      cvUrl = `uploads:${stored}`;
    }

    const birthRaw = String(form.get('birthDate') || '').trim();
    const candidate = await prisma.hrCandidate.create({
      data: {
        organizationId: vacancy.organizationId,
        vacancyId: vacancy.id,
        name,
        email: email || null,
        phone,
        address: String(form.get('address') || '').trim() || null,
        birthDate: birthRaw ? new Date(birthRaw) : null,
        education: String(form.get('education') || '').trim() || null,
        experience: String(form.get('experience') || '').trim() || null,
        source: 'Website Karir',
        stage: 'LAMARAN',
        notes: String(form.get('notes') || '').trim() || null,
        cvUrl,
        cvName,
      },
      select: { id: true },
    });

    return apiOk({ ok: true });
  } catch (e) {
    console.error('[public-apply]', e);
    return apiErr('Gagal mengirim lamaran. Coba lagi.', 500);
  }
}
