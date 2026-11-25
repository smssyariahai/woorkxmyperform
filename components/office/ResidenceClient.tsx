'use client';

// Staff Residence Management (Fase 7) — satu halaman admin mess:
// Pengaturan | Kamar | Kasur | Penempatan | Jadwal Istirahat.
// Pola visual mengikuti DepartmentsClient (Card, Field, Input, toast).
// Submenu spec §16 yang TIDAK punya konsumen nyata (Building Layout, Sleep
// Animation Settings, Building Navigation, Residence Lighting, Demo Mode
// Settings) sengaja TIDAK dibuat — lihat desain FASE7 §0.
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardTitle } from '@/components/ui/primitives';
import { Field } from '@/components/ui/input';
import { Input } from '@/components/ui/input';
import { BedDouble, Pencil, Trash2, Bot, Plus, Moon, DoorOpen } from 'lucide-react';

const TABS = [
  { key: 'pengaturan', label: 'Pengaturan' },
  { key: 'kamar', label: 'Kamar' },
  { key: 'kasur', label: 'Kasur' },
  { key: 'penempatan', label: 'Penempatan Agent' },
  { key: 'jadwal', label: 'Jadwal Istirahat' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

const TYPE_LABEL: Record<string, string> = { NIGHT: 'Tidur malam', REST: 'Istirahat', BREAK: 'Istirahat singkat' };

export function ResidenceClient({ perms, canManage }: { perms: string[]; canManage: boolean }) {
  const [tab, setTab] = useState<TabKey>('pengaturan');
  const [data, setData] = useState<any>(null);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [schedAgents, setSchedAgents] = useState<any[]>([]);
  const [schedDivisions, setSchedDivisions] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [settingsForm, setSettingsForm] = useState({ name: '', status: 'ACTIVE' });
  const [renameRoom, setRenameRoom] = useState<any>(null);
  const [renameName, setRenameName] = useState('');
  const [placeSel, setPlaceSel] = useState<Record<string, string>>({});
  const [moveSel, setMoveSel] = useState<Record<string, string>>({});
  const [schedModal, setSchedModal] = useState<null | 'add' | 'edit'>(null);
  const [schedSel, setSchedSel] = useState<any>(null);
  const [schedForm, setSchedForm] = useState({
    targetKind: 'agent' as 'agent' | 'division',
    targetId: '',
    startTime: '22:00',
    endTime: '06:00',
    scheduleType: 'NIGHT',
    enabled: true,
  });

  const can = (...ks: string[]) => perms.includes('*') || ks.some((k) => perms.includes(k));
  const canView = can('DEPARTMENTS_VIEW');

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/kantor/residence');
    const j = await r.json();
    if (j.success) {
      setData(j.data);
      if (j.data.residence) {
        setSettingsForm({ name: j.data.residence.name, status: j.data.residence.status });
      }
    } else {
      toast.error(j.message || 'Gagal memuat mess.');
    }
    const rs = await fetch('/api/admin/kantor/residence/schedules');
    const js = await rs.json();
    if (js.success) {
      setSchedules(js.data.schedules ?? []);
      setSchedAgents(js.data.agents ?? []);
      setSchedDivisions(js.data.divisions ?? []);
    }
    setLoaded(true);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!loaded) {
    return (
      <div className="max-w-[1200px] mx-auto space-y-5">
        <p className="text-sm text-muted">Memuat mess…</p>
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="max-w-[1200px] mx-auto space-y-5">
        <Card><p className="text-sm text-muted text-center py-8">Anda tidak memiliki akses ke manajemen mess.</p></Card>
      </div>
    );
  }

  const residence = data?.residence ?? null;
  const rooms = data?.rooms ?? [];
  const unassignedAgents = data?.unassignedAgents ?? [];
  const allBeds = rooms.flatMap((r: any) => r.beds.map((b: any) => ({ ...b, roomName: r.name, roomId: r.id })));
  const emptyBeds = allBeds.filter((b: any) => !b.occupant && b.status === 'AVAILABLE');

  async function activate() {
    setBusy(true);
    try {
      const r = await fetch('/api/admin/kantor/residence/activate', { method: 'POST' });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success('Mess diaktifkan.');
      load();
    } catch (e: any) {
      toast.error(e.message || 'Gagal mengaktifkan mess.');
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings() {
    if (!settingsForm.name.trim()) { toast.error('Nama mess wajib diisi.'); return; }
    setBusy(true);
    try {
      const r = await fetch('/api/admin/kantor/residence', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: settingsForm.name.trim(), status: settingsForm.status }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success('Pengaturan mess disimpan.');
      load();
    } catch (e: any) {
      toast.error(e.message || 'Gagal menyimpan.');
    } finally {
      setBusy(false);
    }
  }

  async function submitRename() {
    if (renameName.trim().length < 1 || renameName.trim().length > 50) {
      toast.error('Nama kamar 1–50 karakter.');
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/kantor/residence/rooms/${renameRoom.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: renameName.trim() }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success('Nama kamar diubah.');
      setRenameRoom(null);
      load();
    } catch (e: any) {
      toast.error(e.message || 'Gagal mengubah nama kamar.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleBed(bed: any) {
    const next = bed.status === 'MAINTENANCE' ? 'AVAILABLE' : 'MAINTENANCE';
    try {
      const r = await fetch(`/api/admin/kantor/residence/beds/${bed.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success(`Kasur ${bed.bedCode} ${next === 'MAINTENANCE' ? 'masuk maintenance.' : 'kembali tersedia.'}`);
      load();
    } catch (e: any) {
      toast.error(e.message || 'Gagal mengubah status kasur.');
    }
  }

  async function placeAgent(bedId: string) {
    const agentId = placeSel[bedId];
    if (!agentId) return;
    try {
      const r = await fetch('/api/admin/kantor/residence/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, bedId }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success(`${j.data.assignment.agentName} ditempatkan ke ${j.data.assignment.bedCode}.`);
      setPlaceSel((s) => ({ ...s, [bedId]: '' }));
      load();
    } catch (e: any) {
      toast.error(e.message || 'Gagal menempatkan agent.');
    }
  }

  async function moveAgent(bed: any) {
    const targetBedId = moveSel[bed.id];
    if (!targetBedId) return;
    try {
      const r = await fetch('/api/admin/kantor/residence/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: bed.occupant.id, bedId: targetBedId }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success(`${j.data.assignment.agentName} pindah ke ${j.data.assignment.bedCode}.`);
      setMoveSel((s) => ({ ...s, [bed.id]: '' }));
      load();
    } catch (e: any) {
      toast.error(e.message || 'Gagal memindahkan agent.');
    }
  }

  function openSchedAdd() {
    setSchedSel(null);
    setSchedForm({ targetKind: 'agent', targetId: '', startTime: '22:00', endTime: '06:00', scheduleType: 'NIGHT', enabled: true });
    setSchedModal('add');
  }

  function openSchedEdit(s: any) {
    setSchedSel(s);
    setSchedForm({
      targetKind: s.agentId ? 'agent' : 'division',
      targetId: s.agentId ?? s.divisionId ?? '',
      startTime: s.startTime,
      endTime: s.endTime,
      scheduleType: s.scheduleType,
      enabled: s.enabled !== false,
    });
    setSchedModal('edit');
  }

  async function submitSched() {
    if (!schedForm.targetId) { toast.error('Pilih agent atau divisi.'); return; }
    setBusy(true);
    try {
      const body = {
        agentId: schedForm.targetKind === 'agent' ? schedForm.targetId : null,
        divisionId: schedForm.targetKind === 'division' ? schedForm.targetId : null,
        startTime: schedForm.startTime,
        endTime: schedForm.endTime,
        scheduleType: schedForm.scheduleType,
        enabled: schedForm.enabled,
      };
      const url = schedModal === 'add'
        ? '/api/admin/kantor/residence/schedules'
        : `/api/admin/kantor/residence/schedules/${schedSel.id}`;
      const r = await fetch(url, {
        method: schedModal === 'add' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success(schedModal === 'add' ? 'Jadwal ditambahkan.' : 'Jadwal diperbarui.');
      setSchedModal(null);
      load();
    } catch (e: any) {
      toast.error(e.message || 'Gagal menyimpan jadwal.');
    } finally {
      setBusy(false);
    }
  }

  async function removeSched(s: any) {
    const target = s.agent?.name ?? s.division?.name ?? '';
    if (!confirm(`Hapus jadwal ${TYPE_LABEL[s.scheduleType] ?? s.scheduleType} ${s.startTime}–${s.endTime} untuk ${target}?`)) return;
    try {
      const r = await fetch(`/api/admin/kantor/residence/schedules/${s.id}`, { method: 'DELETE' });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success('Jadwal dihapus.');
      load();
    } catch (e: any) {
      toast.error(e.message || 'Gagal menghapus jadwal.');
    }
  }

  return (
    <div className="max-w-[1200px] mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-ink">Staff Residence Management</h1>
          <p className="text-sm text-muted">Mess karyawan — kamar, kasur, penempatan agent, dan jadwal istirahat.</p>
        </div>
        {residence && (
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${residence.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-danger'}`}>
            {residence.status === 'ACTIVE' ? 'Mess aktif' : 'Mess nonaktif'}
          </span>
        )}
      </div>

      {!residence ? (
        <Card>
          <div className="text-center py-8 space-y-3">
            <BedDouble className="h-8 w-8 mx-auto text-muted" />
            <p className="text-sm text-muted">Mess belum diaktifkan untuk perusahaan ini.</p>
            {canManage && (
              <button onClick={activate} disabled={busy} className="btn-primary !py-2 text-[13px] disabled:opacity-50">
                {busy ? 'Mengaktifkan…' : 'Aktifkan Mess'}
              </button>
            )}
          </div>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`rounded-full px-3 py-1.5 text-[12.5px] font-semibold ${tab === t.key ? 'bg-brand text-white' : 'bg-slate-100 text-ink hover:bg-slate-200'}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'pengaturan' && (
            <Card className="!p-5 space-y-4">
              <CardTitle>Pengaturan Mess</CardTitle>
              <div className="grid sm:grid-cols-3 gap-3">
                <div className="rounded-btn bg-slate-50 px-3 py-2">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Kamar</p>
                  <p className="text-[18px] font-bold text-ink">{rooms.length}</p>
                </div>
                <div className="rounded-btn bg-slate-50 px-3 py-2">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Kasur</p>
                  <p className="text-[18px] font-bold text-ink">{allBeds.length}</p>
                </div>
                <div className="rounded-btn bg-slate-50 px-3 py-2">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Penghuni</p>
                  <p className="text-[18px] font-bold text-ink">{allBeds.filter((b: any) => b.occupant).length} / {allBeds.length}</p>
                </div>
              </div>
              <Field label="Nama mess">
                <Input value={settingsForm.name} onChange={(e) => setSettingsForm({ ...settingsForm, name: e.target.value })} disabled={!canManage} />
              </Field>
              <Field label="Status">
                <select
                  value={settingsForm.status}
                  onChange={(e) => setSettingsForm({ ...settingsForm, status: e.target.value })}
                  className="input"
                  disabled={!canManage}
                >
                  <option value="ACTIVE">Aktif</option>
                  <option value="INACTIVE">Nonaktif</option>
                </select>
              </Field>
              {canManage && (
                <div className="flex justify-end">
                  <button onClick={saveSettings} disabled={busy} className="btn-primary !py-2 text-[13px] disabled:opacity-50">
                    {busy ? 'Menyimpan…' : 'Simpan Pengaturan'}
                  </button>
                </div>
              )}
            </Card>
          )}

          {tab === 'kamar' && (
            <div className="grid sm:grid-cols-2 gap-4">
              {rooms.map((r: any) => (
                <Card key={r.id} className="!p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-btn bg-violet-50 text-violet-600 dark:bg-violet-900/30">
                        <DoorOpen className="h-5 w-5" />
                      </span>
                      <div>
                        <p className="text-[15px] font-bold text-ink">{r.name}</p>
                        <p className="text-[12px] text-muted">Lantai {r.floorNumber} · Kapasitas {r.beds.length} kasur</p>
                      </div>
                    </div>
                    {canManage && (
                      <button
                        onClick={() => { setRenameRoom(r); setRenameName(r.name); }}
                        title="Ubah nama kamar"
                        className="rounded-btn p-2 text-muted hover:bg-slate-100 hover:text-ink"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <div className="mt-3 border-t border-line pt-3">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Kasur di kamar ini</p>
                    <ul className="mt-1.5 space-y-1">
                      {r.beds.map((b: any) => (
                        <li key={b.id} className="flex items-center justify-between gap-2 text-[13px]">
                          <span className="text-ink">{b.bedCode}</span>
                          <span className="text-muted text-[12px]">
                            {b.occupant ? b.occupant.name : b.status === 'MAINTENANCE' ? 'Maintenance' : 'Kosong'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </Card>
              ))}
              {rooms.length === 0 && (
                <Card><p className="text-sm text-muted text-center py-8">Belum ada kamar di mess ini.</p></Card>
              )}
            </div>
          )}

          {tab === 'kasur' && (
            <Card className="!p-5 space-y-3">
              <CardTitle>Kasur</CardTitle>
              {rooms.map((r: any) => (
                <div key={r.id}>
                  <p className="text-[12px] font-bold uppercase tracking-wide text-muted mt-2">{r.name}</p>
                  <ul className="mt-1 divide-y divide-line">
                    {r.beds.map((b: any) => (
                      <li key={b.id} className="flex items-center justify-between gap-2 py-2 text-[13px]">
                        <span className="inline-flex items-center gap-2 text-ink">
                          <BedDouble className="h-4 w-4 text-muted" /> {b.bedCode}
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${b.status === 'MAINTENANCE' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                            {b.status === 'MAINTENANCE' ? 'Maintenance' : 'Tersedia'}
                          </span>
                        </span>
                        <span className="inline-flex items-center gap-2">
                          <span className="text-muted text-[12px]">{b.occupant ? `Ditempati ${b.occupant.name}` : 'Kosong'}</span>
                          {canManage && (
                            <button
                              onClick={() => toggleBed(b)}
                              disabled={!!b.occupant && b.status !== 'MAINTENANCE'}
                              title={b.occupant ? 'Pindahkan penghuni dulu sebelum maintenance' : 'Ubah status kasur'}
                              className="rounded-btn px-2.5 py-1.5 text-[12px] font-semibold bg-slate-100 text-ink hover:bg-slate-200 disabled:opacity-50"
                            >
                              {b.status === 'MAINTENANCE' ? 'Aktifkan lagi' : 'Maintenance'}
                            </button>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </Card>
          )}

          {tab === 'penempatan' && (
            <div className="grid sm:grid-cols-2 gap-4">
              {rooms.map((r: any) => (
                <Card key={r.id} className="!p-5">
                  <p className="text-[15px] font-bold text-ink">{r.name}</p>
                  <p className="text-[12px] text-muted">Lantai {r.floorNumber} · {r.beds.filter((b: any) => b.occupant).length}/{r.beds.length} terisi</p>
                  <ul className="mt-3 space-y-2">
                    {r.beds.map((b: any) => (
                      <li key={b.id} className="rounded-btn bg-slate-50 px-3 py-2">
                        <div className="flex items-center justify-between gap-2 text-[13px]">
                          <span className="inline-flex items-center gap-1.5 text-ink">
                            <Bot className="h-3.5 w-3.5 text-muted" /> {b.bedCode}
                          </span>
                          <span className="text-muted text-[12px]">
                            {b.occupant ? b.occupant.name : b.status === 'MAINTENANCE' ? 'Maintenance' : 'Kosong'}
                          </span>
                        </div>
                        {canManage && !b.occupant && b.status === 'AVAILABLE' && unassignedAgents.length > 0 && (
                          <div className="mt-2 flex gap-2">
                            <select
                              value={placeSel[b.id] ?? ''}
                              onChange={(e) => setPlaceSel((s) => ({ ...s, [b.id]: e.target.value }))}
                              className="input !py-1.5 text-[12.5px] flex-1 min-w-0"
                            >
                              <option value="">Tempatkan agent…</option>
                              {unassignedAgents.map((a: any) => (
                                <option key={a.id} value={a.id}>{a.name}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => placeAgent(b.id)}
                              disabled={!placeSel[b.id]}
                              className="btn-primary !py-1.5 text-[12.5px] shrink-0 disabled:opacity-50"
                            >
                              Tempatkan
                            </button>
                          </div>
                        )}
                        {canManage && b.occupant && emptyBeds.length > 0 && (
                          <div className="mt-2 flex gap-2">
                            <select
                              value={moveSel[b.id] ?? ''}
                              onChange={(e) => setMoveSel((s) => ({ ...s, [b.id]: e.target.value }))}
                              className="input !py-1.5 text-[12.5px] flex-1 min-w-0"
                            >
                              <option value="">Pindah ke kasur…</option>
                              {emptyBeds.map((eb: any) => (
                                <option key={eb.id} value={eb.id}>{eb.bedCode} ({eb.roomName})</option>
                              ))}
                            </select>
                            <button
                              onClick={() => moveAgent(b)}
                              disabled={!moveSel[b.id]}
                              className="btn-primary !py-1.5 text-[12.5px] shrink-0 disabled:opacity-50"
                            >
                              Pindah
                            </button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </Card>
              ))}
              {unassignedAgents.length > 0 && (
                <Card className="!p-5">
                  <p className="text-[15px] font-bold text-ink">Agent tanpa kasur</p>
                  <p className="text-[12.5px] text-muted mt-1">{unassignedAgents.map((a: any) => a.name).join(', ')}</p>
                </Card>
              )}
            </div>
          )}

          {tab === 'jadwal' && (
            <Card className="!p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle>Jadwal Istirahat</CardTitle>
                {canManage && (
                  <button onClick={openSchedAdd} className="btn-primary !py-2 text-[13px]">
                    <Plus className="h-4 w-4" /> Tambah Jadwal
                  </button>
                )}
              </div>
              <p className="text-[12.5px] text-muted">
                Jadwal otomatis dibaca scheduler istirahat (Fase 5c). Satu jadwal untuk satu agent atau satu divisi.
              </p>
              {schedules.length === 0 ? (
                <p className="text-sm text-muted text-center py-6">Belum ada jadwal istirahat. Jadwal default akan diisi dari pilihan jam tidur (Fase 5c).</p>
              ) : (
                <ul className="divide-y divide-line">
                  {schedules.map((s: any) => (
                    <li key={s.id} className="flex items-center justify-between gap-2 py-2.5 text-[13px]">
                      <span className="inline-flex items-center gap-2 text-ink">
                        <Moon className="h-4 w-4 text-muted" />
                        <span className="font-semibold">{s.agent?.name ?? s.division?.name ?? '—'}</span>
                        <span className="text-muted">{s.agent ? 'Agent' : 'Divisi'}</span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold">{TYPE_LABEL[s.scheduleType] ?? s.scheduleType}</span>
                        <span className="text-muted">{s.startTime}–{s.endTime} WIB</span>
                        {!s.enabled && (
                          <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-danger">Nonaktif</span>
                        )}
                      </span>
                      {canManage && (
                        <span className="inline-flex gap-1 shrink-0">
                          <button
                            onClick={() => openSchedEdit(s)}
                            title="Edit jadwal"
                            className="rounded-btn p-2 text-muted hover:bg-slate-100 hover:text-ink"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => removeSched(s)}
                            title="Hapus jadwal"
                            className="rounded-btn p-2 text-muted hover:bg-red-50 hover:text-danger"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </>
      )}

      {renameRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-brand-900/45" onClick={() => setRenameRoom(null)} />
          <div className="relative card w-full max-w-md p-6 shadow-pop space-y-4">
            <CardTitle>Ubah Nama Kamar</CardTitle>
            <Field label="Nama kamar *">
              <Input value={renameName} onChange={(e) => setRenameName(e.target.value)} placeholder="cth: Kamar 1" maxLength={50} />
            </Field>
            <p className="text-[12px] text-muted">Kapasitas kamar mengikuti jumlah kasur ({renameRoom.beds?.length ?? 0} kasur) dan tidak bisa diubah.</p>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setRenameRoom(null)} className="btn-ghost !py-2 text-[13px]">Batal</button>
              <button onClick={submitRename} disabled={busy} className="btn-primary !py-2 text-[13px]">
                {busy ? 'Menyimpan…' : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {schedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-brand-900/45" onClick={() => setSchedModal(null)} />
          <div className="relative card w-full max-w-md p-6 shadow-pop space-y-4 max-h-[90vh] overflow-y-auto">
            <CardTitle>{schedModal === 'add' ? 'Tambah Jadwal Istirahat' : 'Edit Jadwal Istirahat'}</CardTitle>
            <Field label="Untuk">
              <div className="flex gap-2">
                <select
                  value={schedForm.targetKind}
                  onChange={(e) => setSchedForm({ ...schedForm, targetKind: e.target.value as 'agent' | 'division', targetId: '' })}
                  className="input w-32 shrink-0"
                >
                  <option value="agent">Agent</option>
                  <option value="division">Divisi</option>
                </select>
                <select
                  value={schedForm.targetId}
                  onChange={(e) => setSchedForm({ ...schedForm, targetId: e.target.value })}
                  className="input flex-1 min-w-0"
                >
                  <option value="">— Pilih —</option>
                  {(schedForm.targetKind === 'agent' ? schedAgents : schedDivisions).map((t: any) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Mulai (WIB) *">
                <Input type="time" value={schedForm.startTime} onChange={(e) => setSchedForm({ ...schedForm, startTime: e.target.value })} />
              </Field>
              <Field label="Selesai (WIB) *">
                <Input type="time" value={schedForm.endTime} onChange={(e) => setSchedForm({ ...schedForm, endTime: e.target.value })} />
              </Field>
            </div>
            <Field label="Tipe">
              <select
                value={schedForm.scheduleType}
                onChange={(e) => setSchedForm({ ...schedForm, scheduleType: e.target.value })}
                className="input"
              >
                <option value="NIGHT">Tidur malam</option>
                <option value="REST">Istirahat</option>
                <option value="BREAK">Istirahat singkat</option>
              </select>
            </Field>
            <label className="flex items-center gap-2 text-[13px] text-ink cursor-pointer">
              <input
                type="checkbox"
                checked={schedForm.enabled}
                onChange={(e) => setSchedForm({ ...schedForm, enabled: e.target.checked })}
                className="h-4 w-4"
              />
              Jadwal aktif
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setSchedModal(null)} className="btn-ghost !py-2 text-[13px]">Batal</button>
              <button onClick={submitSched} disabled={busy} className="btn-primary !py-2 text-[13px]">
                {busy ? 'Menyimpan…' : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
