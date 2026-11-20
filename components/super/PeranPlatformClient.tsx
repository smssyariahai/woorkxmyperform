'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardTitle, Badge } from '@/components/ui/primitives';
import { Input } from '@/components/ui/input';
import { Search, KeyRound } from 'lucide-react';

interface PlatformRole {
  id: string;
  name: string;
  description: string | null;
  adminCount: number;
  permissions: string[];
}

interface PlatformAdmin {
  userId: string;
  userName: string;
  userEmail: string;
  userStatus: string;
  roleId: string;
  roleName: string;
  createdAt: string;
}

export function PeranPlatformClient() {
  const [roles, setRoles] = useState<PlatformRole[]>([]);
  const [admins, setAdmins] = useState<PlatformAdmin[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rr, aa] = await Promise.all([
        fetch('/api/super/platform-roles').then((r) => r.json()).catch(() => null),
        fetch('/api/super/platform-admins').then((r) => r.json()).catch(() => null),
      ]);
      if (rr?.success) setRoles(rr.data ?? []);
      else if (rr) throw new Error(rr.message);
      if (aa?.success) setAdmins(aa.data ?? []);
      else if (aa) throw new Error(aa.message);
    } catch (e: any) {
      toast.error(e.message || 'Gagal memuat role platform.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const q = query.trim().toLowerCase();
  const visibleRoles = roles.filter(
    (r) =>
      !q ||
      r.name.toLowerCase().includes(q) ||
      (r.description ?? '').toLowerCase().includes(q) ||
      admins.some((a) => a.roleId === r.id && (a.userName.toLowerCase().includes(q) || a.userEmail.toLowerCase().includes(q)))
  );

  return (
    <div className="max-w-[1400px] mx-auto space-y-5">
      <div>
        <h1 className="text-[22px] font-bold text-ink">Peran Platform</h1>
        <p className="text-sm text-muted">
          Daftar role platform dan siapa saja pemegang tiap role. Role platform hanya
          memberi permission lintas tenant (Admin WOORK) — terpisah dari role tenant.
          Administrator Pusat tidak tercantum di sini karena sudah punya akses penuh.
          Untuk membuat, mengubah, atau menugaskan role, gunakan halaman Admin WOORK.
        </p>
      </div>

      <div className="relative max-w-sm">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari role / pemegang…"
          className="!pl-9"
        />
      </div>

      {loading && <p className="text-[13px] text-muted">Memuat…</p>}

      {!loading && visibleRoles.length === 0 && (
        <p className="text-[13px] text-muted">
          {roles.length === 0
            ? 'Belum ada role platform. Buat role pertama di halaman Admin WOORK.'
            : 'Tidak ada role yang cocok dengan pencarian.'}
        </p>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        {visibleRoles.map((r) => {
          const holders = admins.filter((a) => a.roleId === r.id);
          return (
            <Card key={r.id} className="!p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[15px] font-bold text-ink inline-flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-brand" />
                    {r.name}
                  </p>
                  <p className="text-[12.5px] text-muted mt-0.5">{r.description ?? '—'}</p>
                </div>
                <Badge tone="blue">{r.permissions.length} permission</Badge>
              </div>
              <div className="mt-4">
                <p className="text-[12.5px] font-semibold text-ink">
                  Pemegang ({holders.length})
                </p>
                {holders.length === 0 ? (
                  <p className="text-[12.5px] text-muted mt-1">Belum ada pemegang role ini.</p>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {holders.map((a) => (
                      <li key={`${a.userId}-${a.roleId}`} className="flex flex-wrap items-center gap-2 text-[13px]">
                        <span className="font-medium text-ink">{a.userName}</span>
                        <span className="text-muted">{a.userEmail}</span>
                        {a.userStatus !== 'ACTIVE' && <Badge tone="gray">{a.userStatus}</Badge>}
                        <span className="text-muted text-[12px]">
                          sejak {new Date(a.createdAt).toLocaleDateString('id-ID')}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {r.permissions.length > 0 && (
                <div className="mt-4">
                  <p className="text-[12.5px] font-semibold text-ink">Permission</p>
                  <p className="text-[12px] text-muted mt-1 leading-relaxed">
                    {r.permissions.join(', ')}
                  </p>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <Card>
        <CardTitle>Catatan</CardTitle>
        <p className="text-[12.5px] text-muted leading-relaxed mt-1">
          Jumlah pemegang dihitung dari penugasan role platform yang aktif.
          Pencabutan atau penugasan baru berlaku segera karena permission platform
          dibaca dari database pada tiap request.
        </p>
      </Card>
    </div>
  );
}
