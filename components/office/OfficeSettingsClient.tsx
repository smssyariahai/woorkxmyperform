'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardTitle } from '@/components/ui/primitives';
import { Field } from '@/components/ui/input';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Globe2, ImagePlus, Trash2, Loader2 } from 'lucide-react';

const MODULES = [
  { key: 'inbox', label: 'Inbox' },
  { key: 'crm', label: 'CRM' },
  { key: 'hr', label: 'HR & Rekrutmen' },
  { key: 'broadcast', label: 'Broadcast' },
  { key: 'bot', label: 'Bot' },
  { key: 'kantor', label: 'Kantor Virtual' },
  { key: 'channels', label: 'Saluran' },
];

export function OfficeSettingsClient() {
  const [name, setName] = useState('');
  const [industry, setIndustry] = useState('');
  const [teamSize, setTeamSize] = useState('');
  const [modules, setModules] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [tagline, setTagline] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [website, setWebsite] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState<'logo' | 'cover' | null>(null);
  const [siteUrl, setSiteUrl] = useState<string | null>(null);
  const [subdomain, setSubdomain] = useState('');
  const [subdomainLocked, setSubdomainLocked] = useState(false);
  const [canChangeSubdomain, setCanChangeSubdomain] = useState(false);
  const [subSaving, setSubSaving] = useState(false);
  const [counts, setCounts] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/office');
    const j = await r.json();
    if (j.success) {
      setName(j.data.name);
      setIndustry(j.data.industry ?? '');
      setTeamSize(j.data.teamSize ?? '');
      setModules(j.data.modules);
      setCounts(j.data.counts);
      setDescription(j.data.description ?? '');
      setTagline(j.data.tagline ?? '');
      setPhone(j.data.phone ?? '');
      setEmail(j.data.email ?? '');
      setAddress(j.data.address ?? '');
      setWebsite(j.data.website ?? '');
      setLogoUrl(j.data.logoUrl ?? null);
      setCoverUrl(j.data.coverUrl ?? null);
      setSiteUrl(j.data.siteUrl ?? null);
      setSubdomain(j.data.subdomain ?? '');
      setSubdomainLocked(!!j.data.subdomainLocked);
      setCanChangeSubdomain(!!j.data.canChangeSubdomain);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function toggleModule(key: string) {
    setModules((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  async function uploadBranding(kind: 'logo' | 'cover', file: File) {
    setUploading(kind);
    try {
      const fd = new FormData();
      fd.append(kind, file);
      const r = await fetch('/api/admin/office/branding', { method: 'POST', body: fd });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success(kind === 'logo' ? 'Logo diperbarui.' : 'Cover diperbarui.');
      load();
    } catch (e: any) {
      toast.error(e.message || 'Gagal mengunggah.');
    } finally {
      setUploading(null);
    }
  }

  async function removeBranding(kind: 'logo' | 'cover') {
    if (!confirm(`Hapus ${kind === 'logo' ? 'logo' : 'cover'} kantor?`)) return;
    try {
      const r = await fetch('/api/admin/office/branding', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success('Dihapus.');
      load();
    } catch (e: any) {
      toast.error(e.message || 'Gagal menghapus.');
    }
  }

  async function save() {
    if (!name.trim()) { toast.error('Nama kantor tidak boleh kosong.'); return; }
    setSaving(true);
    try {
      const r = await fetch('/api/admin/office', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), industry, teamSize, modules, description, tagline, phone, email, address, website }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success('Pengaturan kantor disimpan.');
    } catch (e: any) {
      toast.error(e.message || 'Gagal menyimpan.');
    } finally {
      setSaving(false);
    }
  }

  async function saveSubdomain() {
    const v = subdomain.trim().toLowerCase();
    if (!v) { toast.error('Subdomain tidak boleh kosong.'); return; }
    if (!confirm(`Ubah subdomain menjadi ${v}.xsramazys.dev?\n\nPerhatian: subdomain hanya dapat diubah 1 kali.`)) return;
    setSubSaving(true);
    try {
      const r = await fetch('/api/admin/office/subdomain', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subdomain: v }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      setSubdomain(j.data.subdomain);
      setSiteUrl(j.data.siteUrl);
      setSubdomainLocked(!!j.data.locked);
      toast.success(`Subdomain diubah ke ${j.data.siteUrl.replace('https://', '')}`);
    } catch (e: any) {
      toast.error(e.message || 'Gagal mengubah subdomain.');
    } finally {
      setSubSaving(false);
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[900px] mx-auto space-y-5">
      <div>
        <h1 className="text-[22px] font-bold text-ink">Pengaturan Kantor</h1>
        <p className="text-sm text-muted">Profil dan modul yang aktif di kantor ini.</p>
        {siteUrl && (
          <a href={siteUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-[13.5px] font-medium text-brand hover:underline">
            <Globe2 className="h-4 w-4" /> Situs publik: {siteUrl.replace('https://', '')}
          </a>
        )}
      </div>

      <Card>
        <CardTitle>Subdomain Situs Publik</CardTitle>
        <p className="mt-1 text-[12.5px] text-muted">
          Alamat situs publik kantor Anda. Hanya <b>Owner</b> yang dapat mengubah, dan hanya <b>1 kali</b>.
        </p>
        <div className="mt-3 flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex-1">
            <Field label="Subdomain">
              <div className="flex items-center gap-1.5">
                <Input
                  value={subdomain}
                  onChange={(e) => setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  placeholder="namakantor"
                  className="!w-48"
                  disabled={!canChangeSubdomain || subdomainLocked}
                />
                <span className="text-[13px] text-muted whitespace-nowrap">.xsramazys.dev</span>
              </div>
            </Field>
          </div>
          {canChangeSubdomain && !subdomainLocked && (
            <button onClick={saveSubdomain} disabled={subSaving} className="btn-primary !py-2 text-[13px] shrink-0">
              {subSaving ? 'Menyimpan…' : 'Simpan Subdomain'}
            </button>
          )}
        </div>
        {subdomainLocked && (
          <p className="mt-2 text-[12.5px] font-medium text-amber-600">
            Jatah perubahan subdomain sudah digunakan — hubungi Administrator Pusat bila perlu diubah.
          </p>
        )}
        {!canChangeSubdomain && (
          <p className="mt-2 text-[12.5px] text-muted">Hanya Owner yang dapat mengubah subdomain.</p>
        )}
      </Card>

      <Card>
        <CardTitle>Profil Kantor</CardTitle>
        <div className="mt-4 grid sm:grid-cols-2 gap-4">
          <Field label="Nama kantor *">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Industri">
            <Input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="cth: Teknologi" />
          </Field>
          <Field label="Ukuran tim">
            <Input value={teamSize} onChange={(e) => setTeamSize(e.target.value)} placeholder="cth: 11–50" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Deskripsi publik (tampil di situs kantor)">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder="Ceritakan tentang kantor Anda — ditampilkan di halaman publik subdomain."
                className="input !h-auto resize-y"
              />
            </Field>
          </div>
        </div>
        {counts && (
          <div className="mt-4 flex flex-wrap gap-4 text-[12.5px] text-muted">
            <span>{counts.memberships} pengguna</span>
            <span>{counts.departments} divisi</span>
            <span>{counts.roles} role</span>
            <span>{counts.customers} pelanggan</span>
          </div>
        )}
      </Card>

      <Card>
        <CardTitle>Identitas Visual</CardTitle>
        <p className="text-[12.5px] text-muted mt-1">Logo dan gambar cover tampil di situs publik kantor. Maksimal 2MB (PNG/JPG/WEBP/SVG).</p>
        <div className="mt-4 grid sm:grid-cols-2 gap-4">
          {/* Logo */}
          <div className="rounded-btn border border-line p-4">
            <p className="text-[13px] font-semibold text-ink mb-2">Logo</p>
            <div className="flex items-center gap-3">
              <div className="h-16 w-16 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden shrink-0 border border-line">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt="Logo" className="h-full w-full object-contain" />
                ) : (
                  <ImagePlus className="h-6 w-6 text-muted" />
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="btn-secondary !py-1.5 !px-3 text-[12.5px] cursor-pointer inline-flex items-center gap-1.5">
                  {uploading === 'logo' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
                  {logoUrl ? 'Ganti' : 'Unggah'}
                  <input
                    type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden"
                    disabled={uploading !== null}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadBranding('logo', f); e.target.value = ''; }}
                  />
                </label>
                {logoUrl && (
                  <button onClick={() => removeBranding('logo')} className="text-[12px] text-red-600 hover:underline inline-flex items-center gap-1">
                    <Trash2 className="h-3 w-3" /> Hapus
                  </button>
                )}
              </div>
            </div>
          </div>
          {/* Cover */}
          <div className="rounded-btn border border-line p-4">
            <p className="text-[13px] font-semibold text-ink mb-2">Cover / Hero</p>
            <div className="flex items-center gap-3">
              <div className="h-16 w-28 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden shrink-0 border border-line">
                {coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={coverUrl} alt="Cover" className="h-full w-full object-cover" />
                ) : (
                  <ImagePlus className="h-6 w-6 text-muted" />
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="btn-secondary !py-1.5 !px-3 text-[12.5px] cursor-pointer inline-flex items-center gap-1.5">
                  {uploading === 'cover' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
                  {coverUrl ? 'Ganti' : 'Unggah'}
                  <input
                    type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden"
                    disabled={uploading !== null}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadBranding('cover', f); e.target.value = ''; }}
                  />
                </label>
                {coverUrl && (
                  <button onClick={() => removeBranding('cover')} className="text-[12px] text-red-600 hover:underline inline-flex items-center gap-1">
                    <Trash2 className="h-3 w-3" /> Hapus
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
        {siteUrl && (
          <a href={siteUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-[13px] text-brand hover:underline">
            <Globe2 className="h-4 w-4" /> Pratinjau situs publik
          </a>
        )}
      </Card>

      <Card>
        <CardTitle>Kontak & Identitas Publik</CardTitle>
        <p className="text-[12.5px] text-muted mt-1">Tampil di halaman situs publik kantor.</p>
        <div className="mt-4 grid sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Field label="Tagline (slogan singkat)">
              <Input value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="cth: Menghubungkan talenta terbaik dengan peluang terbaik" />
            </Field>
          </div>
          <Field label="Telepon / WhatsApp">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="cth: 6281234567890" />
          </Field>
          <Field label="Email">
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="cth: info@kantor.id" />
          </Field>
          <Field label="Alamat">
            <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="cth: Jl. Sudirman No. 1, Jakarta" />
          </Field>
          <Field label="Website">
            <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="cth: kantor.id" />
          </Field>
        </div>
      </Card>

      <Card>
        <CardTitle>Modul Aktif</CardTitle>
        <p className="text-[12.5px] text-muted mt-1">Modul yang tidak aktif tidak akan bisa dipakai di kantor ini.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {MODULES.map((m) => (
            <button
              key={m.key}
              onClick={() => toggleModule(m.key)}
              className={cn(
                'rounded-btn border px-3.5 py-2 text-[13px] font-medium transition-colors',
                modules.includes(m.key)
                  ? 'border-brand bg-brand-50 text-brand-700 dark:bg-brand-900/30'
                  : 'border-line text-muted hover:border-brand/40'
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="mt-5 flex justify-end">
          <button onClick={save} disabled={saving} className="btn-primary !py-2 text-[13px]">
            {saving ? 'Menyimpan…' : 'Simpan Perubahan'}
          </button>
        </div>
      </Card>
    </div>
  );
}
