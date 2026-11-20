'use client';

import { useEffect, useRef, useState } from 'react';
import { Plus, Search, UserPlus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { searchParticipants, type SelectedParticipant } from './client';

/**
 * Pemilih peserta: cari karyawan (nama + jabatan + divisi/cabang) via
 * GET /api/meet/search-participants, plus tambah tamu eksternal via
 * nama + email. Peserta dipilih tampil sebagai chip yang bisa dihapus.
 */
export function ParticipantPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: SelectedParticipant[];
  onChange: (next: SelectedParticipant[]) => void;
  disabled?: boolean;
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Awaited<ReturnType<typeof searchParticipants>>>([]);
  const [searching, setSearching] = useState(false);
  const [showGuestForm, setShowGuestForm] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    timer.current = window.setTimeout(async () => {
      try {
        setResults(await searchParticipants(q));
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Gagal mencari peserta.');
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [q]);

  function addInternal(p: { id: string; name: string; position?: string | null; department?: string | null; branch?: string | null }) {
    if (value.some((v) => v.userId === p.id)) {
      toast.error('Peserta ini sudah ditambahkan.');
      return;
    }
    onChange([...value, { userId: p.id, name: p.name, position: p.position, department: p.department, branch: p.branch }]);
    setQ('');
    setResults([]);
  }

  function addGuest() {
    if (!guestName.trim()) {
      toast.error('Nama tamu wajib diisi.');
      return;
    }
    if (guestEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail.trim())) {
      toast.error('Format email tamu tidak valid.');
      return;
    }
    onChange([
      ...value,
      { guestName: guestName.trim(), guestEmail: guestEmail.trim() || undefined, name: guestName.trim() },
    ]);
    setGuestName('');
    setGuestEmail('');
    setShowGuestForm(false);
  }

  return (
    <div>
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input
          className="pl-9"
          value={q}
          disabled={disabled}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari karyawan berdasarkan nama… (min. 2 huruf)"
        />
      </div>

      {searching && <p className="mt-1.5 text-xs text-slate-500">Mencari…</p>}
      {!searching && q.trim().length >= 2 && results.length === 0 && (
        <p className="mt-1.5 text-xs text-slate-500">Tidak ada karyawan yang cocok.</p>
      )}
      {results.length > 0 && (
        <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {results.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => addInternal(p)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-slate-50 disabled:opacity-50"
              >
                <span>
                  <span className="block text-sm font-medium text-slate-800">{p.name}</span>
                  <span className="block text-xs text-slate-500">
                    {[p.position, p.department, p.branch].filter(Boolean).join(' • ') || p.email || 'Karyawan'}
                  </span>
                </span>
                <Plus size={16} className="shrink-0 text-slate-400" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {value.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {value.map((p, i) => (
            <li
              key={`${p.userId ?? p.guestEmail ?? p.name}-${i}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 py-1 pl-3 pr-1.5 text-xs text-slate-700"
            >
              <span>
                {p.name}
                {!p.userId && <span className="text-slate-400"> (tamu)</span>}
                {p.position ? <span className="text-slate-400"> • {p.position}</span> : null}
              </span>
              {!disabled && (
                <button
                  type="button"
                  aria-label={`Hapus ${p.name}`}
                  onClick={() => onChange(value.filter((_, idx) => idx !== i))}
                  className="rounded-full p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                >
                  <X size={13} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2">
        {!showGuestForm ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => setShowGuestForm(true)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-800 disabled:opacity-50"
          >
            <UserPlus size={14} /> Tambah tamu eksternal (nama + email)
          </button>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Nama tamu *</span>
                <Input value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Nama tamu" maxLength={100} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Email tamu</span>
                <Input
                  type="email"
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  placeholder="tamu@contoh.com"
                  maxLength={150}
                />
              </label>
            </div>
            <div className="mt-2 flex justify-end gap-2">
              <button type="button" className="btn-secondary !py-1.5 !px-3 text-xs" onClick={() => setShowGuestForm(false)}>
                Batal
              </button>
              <button type="button" className="btn-primary !py-1.5 !px-3 text-xs" onClick={addGuest}>
                Tambah Tamu
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
