'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/modal';
import {
  DEFAULT_PREFS,
  type AnnouncementPrefs,
} from '@/lib/pengumuman/preferences';
import {
  getPreferences,
  savePreferences,
} from '@/lib/pengumuman/client';

// Modal preferensi notifikasi pengumuman (bentuk kanonik WAVE03_DESIGN.md §3.2).
// Hanya toggle app/email untuk pengumuman biasa + mendesak. DND, ringtone,
// dan daftar 10 modul dari modal backup DI-DEFER (lihat MERGE_WAVE03.md).
// Perubahan disimpan otomatis tiap toggle (pola backup), tanpa tombol Simpan.

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
        checked ? 'bg-brand-600' : 'bg-slate-300'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

function ChannelRow({
  title,
  desc,
  app,
  email,
  onChange,
}: {
  title: string;
  desc: string;
  app: boolean;
  email: boolean;
  onChange: (channel: 'app' | 'email', value: boolean) => void;
}) {
  return (
    <div className="rounded-lg border border-line p-4">
      <p className="text-sm font-semibold text-ink">{title}</p>
      <p className="mt-0.5 text-xs text-muted">{desc}</p>
      <div className="mt-3 space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-ink">Notifikasi aplikasi</span>
          <Toggle
            checked={app}
            onChange={(v) => onChange('app', v)}
            label={`${title} — aplikasi`}
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-ink">Email</span>
          <Toggle
            checked={email}
            onChange={(v) => onChange('email', v)}
            label={`${title} — email`}
          />
        </div>
      </div>
    </div>
  );
}

export function NotificationPreferenceModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [prefs, setPrefs] = useState<AnnouncementPrefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getPreferences()
      .then((d) => setPrefs(d.preferences))
      .catch((e: any) => toast.error(e?.message || 'Gagal memuat preferensi.'))
      .finally(() => setLoading(false));
  }, [open ]);

  async function update(
    key: 'announcement' | 'announcementUrgent',
    channel: 'app' | 'email',
    value: boolean
  ) {
    const next: AnnouncementPrefs = {
      ...prefs,
      [key]: { ...prefs[key], [channel]: value },
    };
    setPrefs(next);
    setSaving(true);
    try {
      await savePreferences(next);
      toast.success('Preferensi disimpan.');
    } catch (e: any) {
      setPrefs(prefs);
      toast.error(e?.message || 'Gagal menyimpan preferensi.');
    } finally {
      setSaving(false);
    }
  }

  async function resetToDefault() {
    setSaving(true);
    try {
      const saved = await savePreferences(DEFAULT_PREFS);
      setPrefs(saved);
      toast.success('Preferensi direset ke default.');
    } catch (e: any) {
      toast.error(e?.message || 'Gagal mereset preferensi.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Preferensi Notifikasi">
      {loading ? (
        <p className="text-sm text-muted">Memuat preferensi…</p>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Atur kanal yang Anda terima untuk pengumuman. Email hanya dikirim
            bila kanal email di sini aktif — dan hanya bila pengumuman itu
            memang dikirim lewat email.
          </p>
          <ChannelRow
            title="Pengumuman biasa"
            desc="Prioritas normal dan penting."
            app={prefs.announcement.app}
            email={prefs.announcement.email}
            onChange={(c, v) => update('announcement', c, v)}
          />
          <ChannelRow
            title="Pengumuman mendesak"
            desc="Prioritas mendesak — email aktif secara default."
            app={prefs.announcementUrgent.app}
            email={prefs.announcementUrgent.email}
            onChange={(c, v) => update('announcementUrgent', c, v)}
          />
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              className="btn-ghost text-sm"
              onClick={resetToDefault}
              disabled={saving}
            >
              Reset ke Default
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
            >
              Tutup
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
