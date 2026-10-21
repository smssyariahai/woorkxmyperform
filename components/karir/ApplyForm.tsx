'use client';

import { useState } from 'react';
import { UploadCloud, Send, CheckCircle2 } from 'lucide-react';

export function ApplyForm({ vacancyId, vacancyTitle }: { vacancyId: string; vacancyTitle: string }) {
  const [f, setF] = useState<any>({ name: '', phone: '', email: '', address: '', birthDate: '', education: '', experience: '', notes: '' });
  const [cv, setCv] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');

  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    if (f.name.trim().length < 3) { setErr('Nama lengkap minimal 3 karakter.'); return; }
    if (f.phone.replace(/\D/g, '').length < 9) { setErr('Nomor telepon/WhatsApp tidak valid.'); return; }
    if (cv && cv.size > 5 * 1024 * 1024) { setErr('Ukuran CV maksimal 5 MB.'); return; }
    setSending(true);
    try {
      const fd = new FormData();
      Object.entries(f).forEach(([k, v]) => fd.append(k, String(v || '')));
      if (cv) fd.append('cv', cv);
      const r = await fetch(`/api/public/vacancies/${vacancyId}/apply`, { method: 'POST', body: fd });
      const j = await r.json().catch(() => ({}));
      if (!j.success) throw new Error(j.message || 'Gagal mengirim lamaran.');
      setDone(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e: any) {
      setErr(e.message || 'Gagal mengirim lamaran. Coba lagi.');
    } finally {
      setSending(false);
    }
  }

  if (done) {
    return (
      <div className="card p-8 sm:p-10 text-center">
        <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600">
          <CheckCircle2 className="h-8 w-8" />
        </span>
        <h2 className="mt-4 text-xl font-bold text-ink">Lamaran terkirim!</h2>
        <p className="mt-2 text-[14px] text-muted max-w-md mx-auto">
          Terima kasih <b className="text-ink">{f.name}</b> telah melamar posisi <b className="text-ink">{vacancyTitle}</b>.
          Tim HR kami akan menghubungi Anda jika kualifikasi Anda sesuai. Semoga beruntung!
        </p>
      </div>
    );
  }

  const input = 'input';
  const label = 'label';
  return (
    <form onSubmit={submit} className="card p-6 sm:p-8">
      <h2 className="text-lg font-bold text-ink">Formulir Lamaran</h2>
      <p className="text-[13px] text-muted mt-1 mb-5">Lengkapi identitas profesional Anda dengan benar.</p>

      {err && <p className="mb-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-2.5 text-[13px] text-red-700 dark:text-red-300">{err}</p>}

      <div className="grid sm:grid-cols-2 gap-4">
        <label className="block"><span className={label}>Nama lengkap *</span>
          <input className={input} value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Sesuai KTP" /></label>
        <label className="block"><span className={label}>Telepon / WhatsApp *</span>
          <input className={input} value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="cth: 081234567890" inputMode="tel" /></label>
        <label className="block"><span className={label}>Email</span>
          <input type="email" className={input} value={f.email} onChange={(e) => set('email', e.target.value)} placeholder="nama@email.com" /></label>
        <label className="block"><span className={label}>Tanggal lahir</span>
          <input type="date" className={input} value={f.birthDate} onChange={(e) => set('birthDate', e.target.value)} /></label>
        <label className="block sm:col-span-2"><span className={label}>Alamat domisili</span>
          <input className={input} value={f.address} onChange={(e) => set('address', e.target.value)} placeholder="Kota / alamat lengkap" /></label>
        <label className="block sm:col-span-2"><span className={label}>Pendidikan terakhir</span>
          <input className={input} value={f.education} onChange={(e) => set('education', e.target.value)} placeholder="cth: S1 Manajemen, Universitas …" /></label>
        <label className="block sm:col-span-2"><span className={label}>Pengalaman kerja</span>
          <textarea className={input} rows={4} value={f.experience} onChange={(e) => set('experience', e.target.value)}
            placeholder="Ceritakan pengalaman kerja Anda yang relevan…" /></label>
        <label className="block sm:col-span-2"><span className={label}>Pesan untuk HR (opsional)</span>
          <textarea className={input} rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)}
            placeholder="Alasan melamar, ekspektasi gaji, tanggal bisa mulai, dll." /></label>

        <div className="sm:col-span-2">
          <span className={label}>Unggah CV (PDF/DOC/DOCX, maks 5 MB)</span>
          <label className="mt-1 flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line px-4 py-6 cursor-pointer hover:border-brand/50 transition-colors">
            <UploadCloud className="h-5 w-5 text-muted" />
            <span className="text-[13.5px] text-muted">{cv ? cv.name : 'Klik untuk memilih file CV'}</span>
            <input type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden" onChange={(e) => setCv(e.target.files?.[0] || null)} />
          </label>
        </div>
      </div>

      {/* honeypot anti-bot */}
      <input type="text" name="website" className="hidden" tabIndex={-1} autoComplete="off" />

      <button type="submit" disabled={sending} className="btn-primary w-full mt-6 !py-3">
        <Send className="h-4 w-4" /> {sending ? 'Mengirim lamaran…' : 'Kirim lamaran'}
      </button>
      <p className="text-[12px] text-muted text-center mt-3">Dengan mengirim, Anda menyetujui data digunakan untuk proses rekrutmen.</p>
    </form>
  );
}
