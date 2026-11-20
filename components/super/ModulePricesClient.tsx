'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/primitives';
import { Field, Input } from '@/components/ui/input';
import { formatIDR } from '@/lib/modular';

const MODULE_LABELS: Record<string, { label: string; desc: string }> = {
  chat: { label: 'Chat', desc: 'Inbox, CRM, Broadcast, Saluran, Bot' },
  hris: { label: 'HRIS', desc: 'HR, Kantor Virtual, Divisi, E-Sign' },
  audit: { label: 'Audit Trail Log', desc: 'Audit' },
};

export function ModulePricesClient() {
  const [rows, setRows] = useState<any[]>([]);
  const [draft, setDraft] = useState<Record<string, { monthly: string; yearly: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const r = await fetch('/api/super/module-prices');
    const j = await r.json();
    if (!j.success) { toast.error(j.message || 'Gagal memuat harga.'); return; }
    setRows(j.data);
    const d: Record<string, { monthly: string; yearly: string }> = {};
    for (const row of j.data) d[row.moduleKey] = { monthly: String(row.monthlyPerUser), yearly: String(row.yearlyPerUser) };
    setDraft(d);
  }

  useEffect(() => {
    load();
  }, []);

  async function save(key: string) {
    const d = draft[key];
    if (!d) return;
    const monthlyPerUser = Number(d.monthly);
    const yearlyPerUser = Number(d.yearly);
    if (!Number.isInteger(monthlyPerUser) || monthlyPerUser < 0 || !Number.isInteger(yearlyPerUser) || yearlyPerUser < 0) {
      toast.error('Harga harus angka bulat >= 0.');
      return;
    }
    setBusy(key);
    try {
      const r = await fetch('/api/super/module-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moduleKey: key, monthlyPerUser, yearlyPerUser }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success(`Harga modul ${MODULE_LABELS[key]?.label ?? key} disimpan.`);
      load();
    } catch (e: any) {
      toast.error(e.message || 'Gagal menyimpan harga.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="max-w-[720px] mx-auto space-y-5">
      <div>
        <h1 className="text-[22px] font-bold text-ink">Harga Modul</h1>
        <p className="text-sm text-muted">
          Harga langganan per modul, per pengguna. Dashboard & Setting selalu ikut tanpa biaya.
          Harga baru hanya berlaku untuk langganan dan invoice baru — harga langganan yang
          sudah berjalan tidak berubah.
        </p>
      </div>

      <div className="space-y-4">
        {rows.map((row) => {
          const meta = MODULE_LABELS[row.moduleKey] ?? { label: row.moduleKey, desc: '' };
          const d = draft[row.moduleKey] ?? { monthly: '', yearly: '' };
          return (
            <Card key={row.moduleKey} className="!p-5 space-y-4">
              <div>
                <h2 className="text-[16px] font-bold text-ink">{meta.label}</h2>
                <p className="text-[12.5px] text-muted">{meta.desc}</p>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Harga bulanan / user">
                  <Input
                    type="number"
                    min={0}
                    value={d.monthly}
                    onChange={(e) => setDraft({ ...draft, [row.moduleKey]: { ...d, monthly: e.target.value } })}
                  />
                </Field>
                <Field label="Harga tahunan / user">
                  <Input
                    type="number"
                    min={0}
                    value={d.yearly}
                    onChange={(e) => setDraft({ ...draft, [row.moduleKey]: { ...d, yearly: e.target.value } })}
                  />
                </Field>
              </div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-[12.5px] text-muted">
                  Saat ini: <b className="text-ink">{formatIDR(row.monthlyPerUser)}/bln</b> ·{' '}
                  <b className="text-ink">{formatIDR(row.yearlyPerUser)}/thn</b>
                </p>
                <button onClick={() => save(row.moduleKey)} disabled={busy === row.moduleKey} className="btn-primary !py-2 text-[13px]">
                  {busy === row.moduleKey ? 'Menyimpan…' : 'Simpan Harga'}
                </button>
              </div>
            </Card>
          );
        })}
        {rows.length === 0 && (
          <Card><p className="text-sm text-muted text-center py-8">Memuat harga…</p></Card>
        )}
      </div>
    </div>
  );
}
