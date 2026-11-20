// Pengaturan TAL Tim Saya — porting src/pages/TalTimSayaPengaturan.tsx.
// Atur atasan langsung (menulis UserEmployment.managerId) + grant kustom
// (TalTeamVisibility) + kewajiban TAL anggota (TalUserObligation).
// Hanya canManage (§5.3). Setiap perubahan WAJIB disertai alasan —
// alasan ditulis ke TalAuditLog oleh server.
'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Settings2 } from 'lucide-react';

interface SettingsUser {
  id: string;
  email: string;
  nama: string;
  divisi: string;
  posisi: string;
  role: string;
  isActive: boolean;
  manajerAtasanId: string;
}

interface Grant {
  id: string;
  viewerId: string;
  viewerNama: string;
  targetId: string;
  targetNama: string;
}

interface Obligation {
  id: string;
  userId: string;
  daily: boolean;
  weekly: boolean;
  monthly: boolean;
}

async function apiJson(path: string, init?: RequestInit) {
  const res = await fetch(path, init);
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.error || j?.message || `Permintaan ${path} gagal (${res.status})`);
  // Respons API dibungkus { success, data } (apiOk) — buka bungkusnya dulu.
  return j.data ?? j;
}

export default function TalTimSayaPengaturanPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [users, setUsers] = useState<SettingsUser[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [obligations, setObligations] = useState<Record<string, Obligation>>({});
  const [managerDraft, setManagerDraft] = useState<Record<string, string>>({});
  const [obligationDraft, setObligationDraft] = useState<Record<string, { daily: boolean; weekly: boolean; monthly: boolean }>>({});
  const [grantViewer, setGrantViewer] = useState('');
  const [grantTarget, setGrantTarget] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState('');
  const [notice, setNotice] = useState('');

  const loadSettings = useCallback(async () => {
    const s = await apiJson('/api/tal/team/settings');
    setUsers(s.users || []);
    setGrants(s.grants || []);
    const obl: Record<string, Obligation> = {};
    for (const o of s.obligations || []) obl[o.userId] = o;
    setObligations(obl);
    const draft: Record<string, string> = {};
    const od: Record<string, { daily: boolean; weekly: boolean; monthly: boolean }> = {};
    for (const u of s.users || []) {
      draft[u.id] = u.manajerAtasanId || '';
      const o = obl[u.id];
      od[u.id] = o ? { daily: o.daily, weekly: o.weekly, monthly: o.monthly } : { daily: true, weekly: true, monthly: true };
    }
    setManagerDraft(draft);
    setObligationDraft(od);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        await loadSettings();
      } catch (e: any) {
        setError(e?.message || 'Gagal memuat Pengaturan TAL Tim Saya.');
      } finally {
        setLoading(false);
      }
    })();
  }, [loadSettings]);

  const needReason = () => {
    if (!reason.trim()) {
      alert('Alasan wajib diisi — perubahan pengaturan dicatat di audit log TAL.');
      return false;
    }
    return true;
  };

  const saveManager = async (userId: string) => {
    if (!needReason()) return;
    try {
      setSaving(`manager-${userId}`);
      await apiJson('/api/tal/team/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'manager', userId, managerId: managerDraft[userId] || null, reason }),
      });
      setNotice('Atasan berhasil disimpan.');
      await loadSettings();
    } catch (e: any) {
      alert(e?.message || 'Gagal menyimpan atasan.');
    } finally {
      setSaving('');
    }
  };

  const addGrant = async () => {
    if (!grantViewer || !grantTarget) {
      alert('Pilih dulu siapa yang melihat dan TAL siapa.');
      return;
    }
    if (!needReason()) return;
    try {
      setSaving('grant');
      await apiJson('/api/tal/team/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'grant', viewerId: grantViewer, targetId: grantTarget, reason }),
      });
      setGrantViewer('');
      setGrantTarget('');
      setNotice('Akses kustom berhasil ditambahkan.');
      await loadSettings();
    } catch (e: any) {
      alert(e?.message || 'Gagal menyimpan akses kustom.');
    } finally {
      setSaving('');
    }
  };

  const deleteGrant = async (id: string) => {
    if (!needReason()) return;
    if (!window.confirm('Hapus akses kustom ini?')) return;
    try {
      await apiJson(`/api/tal/team/settings?grantId=${encodeURIComponent(id)}&reason=${encodeURIComponent(reason)}`, {
        method: 'DELETE',
      });
      setNotice('Akses kustom berhasil dihapus.');
      await loadSettings();
    } catch (e: any) {
      alert(e?.message || 'Gagal menghapus akses.');
    }
  };

  const saveObligation = async (userId: string) => {
    if (!needReason()) return;
    try {
      setSaving(`obligation-${userId}`);
      const d = obligationDraft[userId] || { daily: true, weekly: true, monthly: true };
      await apiJson('/api/tal/team/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'obligation', userId, ...d, reason }),
      });
      setNotice('Kewajiban TAL berhasil disimpan.');
      await loadSettings();
    } catch (e: any) {
      alert(e?.message || 'Gagal menyimpan kewajiban.');
    } finally {
      setSaving('');
    }
  };

  if (loading) return <div className="p-6 text-sm text-slate-500">Memuat Pengaturan TAL Tim Saya...</div>;

  const activeUsers = users.filter((u) => u.isActive);

  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <Link href="/tal/tal-tim-saya" className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline mb-2">
          <ArrowLeft size={14} /> Kembali ke TAL Tim Saya
        </Link>
        {error ? (
          <div className="text-sm text-red-600">{error}</div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <Settings2 size={18} className="text-slate-700" />
              <h1 className="text-lg font-bold text-slate-900">Pengaturan TAL Tim Saya</h1>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Hanya Administrator yang bisa membuka halaman ini. Setiap perubahan dicatat di audit log TAL beserta
              alasannya.
            </p>
          </>
        )}
      </div>

      {!error && (
        <div className="px-4 py-3 space-y-6">
          {notice && (
            <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              {notice}
            </div>
          )}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Alasan perubahan (wajib — dicatat di audit log)
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Contoh: Rotasi atasan per SK ... / Penyesuaian struktur tim"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <section>
            <h3 className="text-sm font-semibold text-slate-900 mb-1">Atasan Langsung</h3>
            <p className="text-xs text-slate-500 mb-2">
              Pilih atasan langsung tiap karyawan. Tim terbentuk otomatis dari rantai atasan ini (atasan melihat TAL
              bawahannya, hanya lihat).
            </p>
            <div className="divide-y divide-slate-100">
              {users.map((u) => (
                <div key={u.id} className="py-2 flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-slate-900 truncate">{u.nama}</span>
                    <span className="block text-xs text-slate-500 truncate">
                      {u.email}
                      {u.isActive ? '' : ' · Nonaktif'}
                      {u.divisi ? ` · ${u.divisi}` : ''}
                    </span>
                  </span>
                  <select
                    value={managerDraft[u.id] ?? ''}
                    onChange={(e) => setManagerDraft((d) => ({ ...d, [u.id]: e.target.value }))}
                    className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white max-w-[220px]"
                  >
                    <option value="">— Tanpa atasan —</option>
                    {activeUsers
                      .filter((a) => a.id !== u.id)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.nama}
                        </option>
                      ))}
                  </select>
                  <button
                    onClick={() => saveManager(u.id)}
                    disabled={saving === `manager-${u.id}`}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-600 text-white disabled:opacity-50"
                  >
                    {saving === `manager-${u.id}` ? 'Menyimpan...' : 'Simpan'}
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-slate-900 mb-1">Akses Kustom (di luar hirarki)</h3>
            <p className="text-xs text-slate-500 mb-2">Pilih siapa yang boleh melihat TAL siapa, di luar hubungan atasan-bawahan.</p>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <select
                value={grantViewer}
                onChange={(e) => setGrantViewer(e.target.value)}
                className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white"
              >
                <option value="">Siapa yang melihat...</option>
                {activeUsers.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nama}
                  </option>
                ))}
              </select>
              <span className="text-xs text-slate-500">boleh melihat TAL</span>
              <select
                value={grantTarget}
                onChange={(e) => setGrantTarget(e.target.value)}
                className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white"
              >
                <option value="">TAL siapa...</option>
                {activeUsers.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nama}
                  </option>
                ))}
              </select>
              <button
                onClick={addGrant}
                disabled={saving === 'grant'}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-600 text-white disabled:opacity-50"
              >
                {saving === 'grant' ? 'Menyimpan...' : 'Tambah Akses'}
              </button>
            </div>
            <div className="divide-y divide-slate-100">
              {grants.length === 0 && <div className="text-sm text-slate-400 py-1.5">Belum ada akses kustom.</div>}
              {grants.map((g) => (
                <div key={g.id} className="py-1.5 flex items-center justify-between gap-3">
                  <span className="text-sm text-slate-700">
                    <b>{g.viewerNama}</b> <span className="text-slate-400">boleh melihat TAL</span>{' '}
                    <b>{g.targetNama}</b>
                  </span>
                  <button onClick={() => deleteGrant(g.id)} className="text-xs font-semibold text-red-600 hover:underline shrink-0">
                    Hapus
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-slate-900 mb-1">Kewajiban TAL Anggota</h3>
            <p className="text-xs text-slate-500 mb-2">
              Tentukan siapa yang wajib membuat TAL harian / mingguan / bulanan. Bila belum diatur, default semua
              wajib (keputusan brief §5.6).
            </p>
            <div className="divide-y divide-slate-100">
              {users.map((u) => {
                const d = obligationDraft[u.id] || { daily: true, weekly: true, monthly: true };
                return (
                  <div key={u.id} className="py-2 flex flex-wrap items-center gap-3">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-slate-900 truncate">{u.nama}</span>
                      <span className="block text-xs text-slate-500 truncate">{u.email}</span>
                    </span>
                    {(
                      [
                        ['daily', 'Harian'],
                        ['weekly', 'Mingguan'],
                        ['monthly', 'Bulanan'],
                      ] as const
                    ).map(([key, label]) => (
                      <label key={key} className="flex items-center gap-1 text-xs text-slate-700">
                        <input
                          type="checkbox"
                          checked={d[key]}
                          onChange={(e) =>
                            setObligationDraft((prev) => ({ ...prev, [u.id]: { ...d, [key]: e.target.checked } }))
                          }
                        />
                        {label}
                      </label>
                    ))}
                    <button
                      onClick={() => saveObligation(u.id)}
                      disabled={saving === `obligation-${u.id}`}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-600 text-white disabled:opacity-50"
                    >
                      {saving === `obligation-${u.id}` ? 'Menyimpan...' : 'Simpan'}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
