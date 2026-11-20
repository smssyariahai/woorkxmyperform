'use client';

// Detail satu karyawan — /hr/detail/[id].
// Bagian yang dirender HANYA sejauh didukung field + relasi existing
// (HrEmployee + HrContract + HrCandidate asal). Yang tidak ada field-nya
// TIDAK dibuatkan bagian, melainkan dicatat di kotak "Belum tersedia"
// di bawah tiap seksi (lihat laporan implementasi Item 3).

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/primitives';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import {
  ArrowLeft, Pencil, Trash2, FileText, FileDown, Upload,
  User, Briefcase, FolderOpen, Settings2,
} from 'lucide-react';
import { toast } from 'sonner';
import { friendlyFetchError } from '@/lib/fetch-error';
import { EmployeeModal } from '@/components/hr/HrClient';
import {
  getEmployee,
  deleteEmployee,
  uploadContractFile,
  contractFileUrl,
  type HrEmployeeItem,
} from '@/lib/hr/client';

const EMP_STATUS: Record<string, { label: string; cls: string }> = {
  AKTIF: { label: 'Aktif', cls: 'badge-green' },
  CUTI: { label: 'Cuti', cls: 'badge-amber' },
  NONAKTIF: { label: 'Nonaktif', cls: 'badge' },
};
const CONTRACT_STATUS: Record<string, { label: string; cls: string }> = {
  AKTIF: { label: 'Aktif', cls: 'badge-green' },
  BERAKHIR: { label: 'Berakhir', cls: 'badge' },
  DIPUTUS: { label: 'Diputus', cls: 'badge-red' },
};

const tgl = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
const rupiah = (n?: number | null) =>
  n == null ? '—' : 'Rp ' + Number(n).toLocaleString('id-ID');

/** Umur / masa kerja dalam tahun + bulan, dari tanggal ISO. */
function durasi(s?: string | null): string {
  if (!s) return '—';
  const from = new Date(s);
  const now = new Date();
  let bulan = (now.getFullYear() - from.getFullYear()) * 12 + (now.getMonth() - from.getMonth());
  if (now.getDate() < from.getDate()) bulan -= 1;
  if (bulan < 0) return '—';
  const th = Math.floor(bulan / 12);
  const bl = bulan % 12;
  return th > 0 ? `${th} thn ${bl} bln` : `${bl} bln`;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2 py-1.5">
      <span className="text-muted w-36 shrink-0 text-[13px]">{label}</span>
      <span className="text-ink text-[13.5px] min-w-0 break-words">{value ?? '—'}</span>
    </div>
  );
}

function SectionTitle({ icon: Icon, title, hint }: any) {
  return (
    <div className="flex items-start gap-2.5 mb-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand dark:bg-brand-900/30">
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {hint && <p className="text-[12.5px] text-muted">{hint}</p>}
      </div>
    </div>
  );
}

/** Catatan kekurangan data — field yang diminta tapi tidak ada di model. */
function BelumTersedia({ items }: { items: string[] }) {
  return (
    <p className="mt-3 rounded-lg border border-dashed border-line bg-slate-50 dark:bg-slate-800/40 px-3 py-2 text-[12.5px] text-muted">
      Belum tersedia di data HR: {items.join(', ')} — field belum ada di model karyawan, jadi tidak bisa ditampilkan/diisi.
    </p>
  );
}

export function HrDetailClient({ id }: { id: string }) {
  const router = useRouter();
  const [item, setItem] = useState<HrEmployeeItem | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [showEdit, setShowEdit] = useState(false);
  const [uploading, setUploading] = useState('');
  const [deleting, setDeleting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState('');

  async function load() {
    setLoading(true);
    setErr('');
    try {
      const d = await getEmployee(id);
      setItem(d.item);
      setCanManage(!!d.canManage);
    } catch (e: any) {
      setErr(friendlyFetchError(e, 'Gagal memuat detail karyawan.'));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function remove() {
    if (!item) return;
    if (!confirm(`Hapus karyawan "${item.name}"? Kontrak terkait ikut terhapus.`)) return;
    setDeleting(true);
    try {
      await deleteEmployee(item.id);
      toast.success(`Karyawan "${item.name}" dihapus.`);
      router.push('/hr/detail');
    } catch (e: any) {
      toast.error(friendlyFetchError(e, 'Gagal menghapus.'));
      setDeleting(false);
    }
  }

  function pickFile(contractId: string) {
    setUploadTarget(contractId);
    fileRef.current?.click();
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !uploadTarget) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('File harus PDF.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Ukuran maksimal 10MB.');
      return;
    }
    setUploading(uploadTarget);
    try {
      await uploadContractFile(uploadTarget, file);
      toast.success('File kontrak berhasil diunggah.');
      await load();
    } catch (err: any) {
      toast.error(friendlyFetchError(err, 'Gagal mengunggah file.'));
    } finally {
      setUploading('');
    }
  }

  if (loading) {
    return (
      <div className="w-full min-w-0 max-w-[1400px] mx-auto space-y-4">
        <Skeleton className="h-10 w-64" />
        <Card><div className="space-y-3"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-5 w-full" /><Skeleton className="h-5 w-1/2" /></div></Card>
      </div>
    );
  }
  if (err || !item) {
    return (
      <div className="w-full min-w-0 max-w-[1400px] mx-auto space-y-4">
        <Link href="/hr/detail" className="btn-secondary w-fit"><ArrowLeft className="h-4 w-4" /> Kembali ke daftar</Link>
        <Card><ErrorState message={err || 'Karyawan tidak ditemukan.'} onRetry={load} /></Card>
      </div>
    );
  }

  const e = item;
  const contracts = e.contracts ?? [];
  const activeContract = contracts.find((c) => c.status === 'AKTIF');
  const initials = e.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="w-full min-w-0 max-w-[1400px] mx-auto space-y-4 sm:space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/hr/detail" className="btn-secondary !px-2.5"><ArrowLeft className="h-4 w-4" /></Link>
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand text-white text-[15px] font-bold">
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg sm:text-xl font-bold text-ink truncate">{e.name}</h1>
          <p className="text-[13px] text-muted">
            <span className="font-mono">{e.employeeNo}</span>
            {' · '}{e.position}{e.department ? ` · ${e.department}` : ''}
          </p>
        </div>
        <span className={EMP_STATUS[e.status]?.cls || 'badge'}>{EMP_STATUS[e.status]?.label || e.status}</span>
        {canManage && (
          <>
            <button onClick={() => setShowEdit(true)} className="btn-secondary">
              <Pencil className="h-4 w-4" /> Ubah
            </button>
            <button onClick={remove} disabled={deleting} className="btn-ghost text-red-600">
              <Trash2 className="h-4 w-4" /> {deleting ? 'Menghapus…' : 'Hapus'}
            </button>
          </>
        )}
      </div>

      {/* ---------- Data Personal ---------- */}
      <Card>
        <SectionTitle icon={User} title="Data Personal" hint="Sesuai data karyawan di HR." />
        <div className="grid sm:grid-cols-2 gap-x-8">
          <Row label="Nama lengkap" value={e.name} />
          <Row label="NIK (KTP)" value={e.nik ? <span className="font-mono">{e.nik}</span> : '—'} />
          <Row label="Tanggal lahir" value={e.birthDate ? `${tgl(e.birthDate)} (${durasi(e.birthDate)})` : '—'} />
          <Row label="Telepon" value={e.phone || '—'} />
          <Row label="Email" value={e.email || '—'} />
          <Row label="Alamat" value={e.address || '—'} />
        </div>
        <BelumTersedia items={['tempat lahir', 'jenis kelamin', 'status pernikahan', 'foto profil']} />
      </Card>

      {/* ---------- Data Pekerjaan ---------- */}
      <Card>
        <SectionTitle icon={Briefcase} title="Data Pekerjaan" />
        <div className="grid sm:grid-cols-2 gap-x-8">
          <Row label="No. karyawan" value={<span className="font-mono">{e.employeeNo}</span>} />
          <Row label="Jabatan" value={e.position} />
          <Row label="Departemen" value={e.department || '—'} />
          <Row label="Tanggal bergabung" value={`${tgl(e.joinDate)} (${durasi(e.joinDate)})`} />
          <Row label="Status karyawan" value={<span className={EMP_STATUS[e.status]?.cls || 'badge'}>{EMP_STATUS[e.status]?.label || e.status}</span>} />
          <Row
            label="Kontrak aktif"
            value={
              activeContract
                ? `${activeContract.type} · ${activeContract.contractNo} (${tgl(activeContract.startDate)} – ${activeContract.endDate ? tgl(activeContract.endDate) : '∞'})`
                : 'Tidak ada kontrak aktif'
            }
          />
          <Row label="Gaji pokok (kontrak aktif)" value={rupiah(activeContract?.salary)} />
        </div>
        <BelumTersedia items={['cabang', 'atasan langsung']} />
      </Card>

      {/* ---------- Dokumen Karyawan ---------- */}
      <Card>
        <SectionTitle
          icon={FolderOpen}
          title="Dokumen Karyawan"
          hint="Satu-satunya dokumen karyawan yang tersimpan di sistem adalah file kontrak (HrContract.fileUrl)."
        />
        {contracts.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-7 w-7" />}
            title="Belum ada kontrak"
            description="Dokumen kontrak muncul di sini setelah kontrak dibuat untuk karyawan ini."
          />
        ) : (
          <div className="divide-y divide-line/70">
            {contracts.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-muted">
                  <FileText className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-semibold text-ink">
                    Kontrak {c.type} — <span className="font-mono">{c.contractNo}</span>
                  </p>
                  <p className="text-[12.5px] text-muted">
                    {c.position} · {tgl(c.startDate)} – {c.endDate ? tgl(c.endDate) : '∞'}
                    {' · '}{c.fileUrl ? 'File tersedia' : 'Belum ada file'}
                  </p>
                </div>
                <span className={CONTRACT_STATUS[c.status]?.cls || 'badge'}>{CONTRACT_STATUS[c.status]?.label || c.status}</span>
                {c.fileUrl ? (
                  <a href={contractFileUrl(c.id)} target="_blank" rel="noreferrer" className="btn-secondary !py-1.5 !px-3 text-[12.5px]">
                    <FileDown className="h-3.5 w-3.5" /> Unduh PDF
                  </a>
                ) : null}
                {canManage && (
                  <button
                    onClick={() => pickFile(c.id)}
                    disabled={uploading === c.id}
                    className="btn-secondary !py-1.5 !px-3 text-[12.5px]"
                  >
                    <Upload className="h-3.5 w-3.5" /> {uploading === c.id ? 'Mengunggah…' : c.fileUrl ? 'Ganti file' : 'Unggah file'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        <BelumTersedia items={['KTP (hanya nomor NIK berupa teks)', 'Kartu Keluarga', 'ijazah', 'NPWP']} />
        <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={onFileChange} />
      </Card>

      {/* ---------- Informasi Administrasi HR ---------- */}
      <Card>
        <SectionTitle icon={Settings2} title="Informasi Administrasi HR" hint="Asal data, pencatatan, dan riwayat kontrak." />
        <div className="grid sm:grid-cols-2 gap-x-8">
          <Row label="Berasal dari kandidat" value={e.candidate ? `${e.candidate.name} (${e.candidate.stage})` : 'Input manual (bukan dari kandidat)'} />
          {e.candidate && <Row label="Lowongan dilamar" value={e.candidate.vacancy?.title || '—'} />}
          {e.candidate && <Row label="Sumber kandidat" value={e.candidate.source || '—'} />}
          {e.candidate && <Row label="Tanggal melamar" value={tgl(e.candidate.appliedAt)} />}
          <Row label="Dibuat oleh" value={e.createdBy?.name || '—'} />
          <Row label="Dibuat pada" value={tgl(e.createdAt)} />
          <Row label="Terakhir diubah" value={tgl(e.updatedAt)} />
        </div>

        <h3 className="mt-4 mb-2 text-[13.5px] font-semibold text-ink">Riwayat kontrak</h3>
        {contracts.length === 0 ? (
          <p className="text-[13px] text-muted">Belum ada kontrak.</p>
        ) : (
          <div className="table-wrap !border !rounded-xl overflow-hidden">
            <table className="table">
              <thead>
                <tr><th>No. Kontrak</th><th>Jenis</th><th>Jabatan</th><th>Periode</th><th>Gaji</th><th>Status</th></tr>
              </thead>
              <tbody>
                {contracts.map((c) => (
                  <tr key={c.id}>
                    <td className="font-mono text-[13px]">{c.contractNo}</td>
                    <td><span className={c.type === 'PKWTT' ? 'badge-green' : 'badge-blue'}>{c.type}</span></td>
                    <td className="text-muted">{c.position}</td>
                    <td className="text-muted text-[13px]">{tgl(c.startDate)} – {c.endDate ? tgl(c.endDate) : '∞'}</td>
                    <td className="text-muted">{rupiah(c.salary)}</td>
                    <td><span className={CONTRACT_STATUS[c.status]?.cls || 'badge'}>{CONTRACT_STATUS[c.status]?.label || c.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {contracts.some((c) => c.notes) && (
          <div className="mt-3 space-y-1">
            {contracts.filter((c) => c.notes).map((c) => (
              <p key={c.id} className="text-[12.5px] text-muted">
                <span className="font-mono text-ink">{c.contractNo}</span>: {c.notes}
              </p>
            ))}
          </div>
        )}
        <BelumTersedia items={['riwayat jabatan', 'riwayat mutasi', 'riwayat status', 'catatan administrasi karyawan']} />
        <p className="mt-2 text-[12.5px] text-muted">
          Proksi riwayat jabatan: kolom Jabatan pada tiap kontrak di atas (HrContract.position per periode kontrak).
        </p>
      </Card>

      <EmployeeModal
        open={showEdit}
        initial={item}
        onClose={() => setShowEdit(false)}
        onSaved={load}
      />
    </div>
  );
}
