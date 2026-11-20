'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardTitle, Badge } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { Input, Field } from '@/components/ui/input';
import { Skeleton, ErrorState } from '@/components/ui/states';
import { Modal } from '@/components/ui/modal';
import { MessageCircle, Instagram, Facebook, Globe, Plug, Copy, Check, QrCode, Unplug, RefreshCw } from 'lucide-react';
import { MetaConnectModal } from './MetaConnectModal';
import { MetaPagePicker } from './MetaPagePicker';

interface ChannelInfo {
  id: string;
  type: string;
  name: string;
  status: string;
  accounts: Array<{ id: string; displayName: string; status: string; connectedAt: string | null }>;
}

const META: Record<string, { icon: any; color: string; desc: string }> = {
  WHATSAPP: { icon: MessageCircle, color: '#22C55E', desc: 'Kirim & terima pesan WhatsApp Business.' },
  INSTAGRAM: { icon: Instagram, color: '#C13584', desc: 'Kelola DM Instagram dalam satu inbox.' },
  FACEBOOK: { icon: Facebook, color: '#1877F2', desc: 'Terima pesan dari Halaman Facebook.' },
  WEBSITE: { icon: Globe, color: '#087BFF', desc: 'Widget chat untuk website Anda.' },
};

export function ChannelsClient() {
  const searchParams = useSearchParams();
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState<ChannelInfo | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [externalId, setExternalId] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  // Meta OAuth (Facebook/Instagram ala Pancake)
  const [metaChannel, setMetaChannel] = useState<'INSTAGRAM' | 'FACEBOOK' | null>(null);
  const [metaPick, setMetaPick] = useState(false);
  // WhatsApp QR pairing
  const [waOpen, setWaOpen] = useState(false);
  const [waMode, setWaMode] = useState<'pair' | 'manage'>('pair');
  const [waStatus, setWaStatus] = useState('');
  const [waQr, setWaQr] = useState<string | null>(null);
  const [waPhone, setWaPhone] = useState<string | null>(null);
  const [waBusy, setWaBusy] = useState(false);

  const webhookUrl = typeof window !== 'undefined' ? `${window.location.origin}/api/webhooks/meta` : '';

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await fetch('/api/channels');
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      setChannels(j.data);
    } catch (e: any) {
      setError(e.message || 'Gagal memuat channel.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // kembalian dari OAuth Meta: tampilkan pemilih Halaman / error
  useEffect(() => {
    if (searchParams.get('metapick') === '1') {
      setMetaPick(true);
      // bersihkan query agar refresh tidak membuka lagi
      window.history.replaceState(null, '', window.location.pathname);
    }
    const metaErr = searchParams.get('meta_error');
    if (metaErr) {
      toast.error(metaErr);
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [searchParams]);

  // ---- WhatsApp QR pairing ----
  const pollWa = useCallback(async () => {
    try {
      const r = await fetch('/api/channels/whatsapp/qr');
      const j = await r.json();
      if (!j.success) return 'error';
      setWaStatus(j.data.status);
      setWaQr(j.data.qr);
      setWaPhone(j.data.phone);
      return j.data.status as string;
    } catch {
      return 'error';
    }
  }, []);

  useEffect(() => {
    if (!waOpen) return;
    let alive = true;
    let timer: ReturnType<typeof setInterval>;
    const check = async () => {
      const s = await pollWa();
      // pada mode pairing: otomatis tutup saat sudah terhubung
      if (waMode === 'pair' && s === 'open' && alive) {
        toast.success('WhatsApp terhubung.');
        setWaOpen(false);
        load();
        if (timer) clearInterval(timer);
      }
    };
    check();
    timer = setInterval(check, 2500);
    return () => {
      alive = false;
      if (timer) clearInterval(timer);
    };
  }, [waOpen, waMode, pollWa, load]);

  async function openWaPairing() {
    setWaMode('pair');
    setWaOpen(true);
    setWaStatus('connecting');
    setWaQr(null);
    setWaPhone(null);
    setWaBusy(true);
    try {
      const r = await fetch('/api/channels/whatsapp/session', { method: 'POST' });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      pollWa();
    } catch (e: any) {
      toast.error(e.message || 'Gagal memulai pairing.');
      setWaOpen(false);
    } finally {
      setWaBusy(false);
    }
  }

  async function disconnectWa() {
    setWaBusy(true);
    try {
      const r = await fetch('/api/channels/whatsapp/session', { method: 'DELETE' });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success('Sesi WhatsApp diputuskan.');
      setWaOpen(false);
      load();
    } catch (e: any) {
      toast.error(e.message || 'Gagal memutuskan sesi.');
    } finally {
      setWaBusy(false);
    }
  }

  async function connect() {
    if (!connecting || busy) return;
    setBusy(true);
    try {
      const r = await fetch('/api/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: connecting.type, displayName, externalId }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success(`${connecting.name} terhubung.`);
      setConnecting(null);
      setDisplayName('');
      setExternalId('');
      load();
    } catch (e: any) {
      toast.error(e.message || 'Gagal menghubungkan.');
    } finally {
      setBusy(false);
    }
  }

  function copyWebhook() {
    navigator.clipboard.writeText(webhookUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="max-w-[1400px] mx-auto space-y-5">
      <div>
        <h1 className="text-[22px] font-bold text-ink">Saluran</h1>
        <p className="text-sm text-muted">Hubungkan channel komunikasi agar semua chat pelanggan masuk ke satu inbox.</p>
      </div>

      <Card className="!p-4 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[220px]">
          <p className="text-[13px] font-semibold text-ink">Webhook URL</p>
          <p className="text-[12px] text-muted break-all">{webhookUrl}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={copyWebhook}>
          {copied ? <Check className="h-4 w-4 text-wa" /> : <Copy className="h-4 w-4" />}
          {copied ? 'Tersalin' : 'Salin'}
        </Button>
      </Card>

      {loading ? (
        <div className="grid sm:grid-cols-2 gap-4">
          <Skeleton className="h-52 w-full" />
          <Skeleton className="h-52 w-full" />
        </div>
      ) : error ? (
        <div className="card"><ErrorState message={error} onRetry={load} /></div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {channels.map((c) => {
            const m = META[c.type] ?? META.WEBSITE;
            const connected = c.status === 'CONNECTED';
            return (
              <Card key={c.id}>
                <div className="flex items-start gap-4">
                  <span
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white"
                    style={{ background: m.color }}
                  >
                    <m.icon className="h-6 w-6" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <CardTitle>{c.name}</CardTitle>
                      <Badge tone={connected ? 'green' : 'gray'}>
                        {connected ? 'Terhubung' : 'Belum terhubung'}
                      </Badge>
                    </div>
                    <p className="mt-1 text-[13px] text-muted">{m.desc}</p>
                    {connected && c.accounts[0] && (
                      <p className="mt-2 text-[12.5px] text-muted">
                        {c.accounts[0].displayName}
                        {c.accounts[0].connectedAt &&
                          ` · terhubung ${new Date(c.accounts[0].connectedAt).toLocaleDateString('id-ID')}`}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <Button
                    variant={connected ? 'secondary' : 'primary'}
                    size="sm"
                    onClick={() => {
                      if (c.type === 'WHATSAPP') {
                        if (connected) {
                          // kelola: tampilkan status tanpa pairing ulang
                          setWaMode('manage');
                          setWaStatus('');
                          setWaQr(null);
                          setWaPhone(null);
                          pollWa().then(() => setWaOpen(true));
                        } else {
                          openWaPairing();
                        }
                      } else if (c.type === 'INSTAGRAM' || c.type === 'FACEBOOK') {
                        // selalu via OAuth Meta ala Pancake (hubungkan maupun hubungkan ulang)
                        setMetaChannel(c.type as 'INSTAGRAM' | 'FACEBOOK');
                      } else {
                        setConnecting(c);
                        setDisplayName(`${c.name} — ${new Date().getFullYear()}`);
                      }
                    }}
                  >
                    <Plug className="h-4 w-4" />
                    {connected ? 'Kelola' : 'Hubungkan'}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={!!connecting} onClose={() => setConnecting(null)} title={`Hubungkan ${connecting?.name}`}>
        <div className="space-y-4">
          <Field label="Nama tampilan">
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Contoh: WhatsApp CS Utama" />
          </Field>
          <Field label="ID eksternal / Nomor" optional>
            <Input value={externalId} onChange={(e) => setExternalId(e.target.value)} placeholder="Contoh: 62812xxxxxxx" />
          </Field>
          <p className="text-[12.5px] text-muted rounded-xl bg-canvas border border-line p-3">
            Untuk koneksi produksi (Meta Cloud API), masukkan kredensial resmi lalu pasang webhook URL di atas
            pada dashboard Meta. Mode demo langsung menandai channel sebagai terhubung.
          </p>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setConnecting(null)}>Batal</button>
            <Button onClick={connect} loading={busy}>Hubungkan</Button>
          </div>
        </div>
      </Modal>

      {/* WhatsApp QR pairing */}
      <Modal open={waOpen} onClose={() => setWaOpen(false)} title="Hubungkan WhatsApp">
        <div className="space-y-4 text-center">
          {waMode === 'manage' ? (
            <>
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-wa/15 text-wa">
                <MessageCircle className="h-8 w-8" />
              </div>
              <div>
                <p className="text-[15px] font-bold text-ink">
                  {waStatus === 'open' ? 'WhatsApp terhubung' : 'Memeriksa status…'}
                </p>
                {waPhone && <p className="mt-1 text-[13px] text-muted">Nomor: +{waPhone}</p>}
              </div>
              <div className="flex justify-center gap-2">
                <button className="btn-secondary" onClick={() => setWaOpen(false)}>Tutup</button>
                <Button variant="danger" onClick={disconnectWa} loading={waBusy}>
                  <Unplug className="h-4 w-4" /> Putuskan
                </Button>
              </div>
            </>
          ) : waStatus === 'open' ? (
            <>
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-wa/15 text-wa">
                <Check className="h-8 w-8" />
              </div>
              <p className="text-[15px] font-bold text-ink">WhatsApp terhubung!</p>
              {waPhone && <p className="text-[13px] text-muted">Nomor: +{waPhone}</p>}
            </>
          ) : waQr ? (
            <>
              <div className="mx-auto w-fit rounded-2xl border border-line bg-white p-3">
                <img src={waQr} alt="QR WhatsApp" className="h-[280px] w-[280px]" />
              </div>
              <div className="text-left rounded-xl bg-canvas border border-line p-3">
                <p className="text-[13px] font-semibold text-ink mb-1.5">Cara menghubungkan:</p>
                <ol className="text-[12.5px] text-muted space-y-1 list-decimal list-inside">
                  <li>Buka WhatsApp di HP Anda</li>
                  <li>Ketuk ⋮ → <b>Perangkat tertaut</b> → <b>Tautkan perangkat</b></li>
                  <li>Arahkan kamera ke kode QR di atas</li>
                </ol>
              </div>
              <p className="text-[12px] text-muted flex items-center justify-center gap-1.5">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Menunggu scan… QR diperbarui otomatis
              </p>
            </>
          ) : (
            <>
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-canvas">
                <QrCode className="h-8 w-8 text-muted animate-pulse" />
              </div>
              <p className="text-[13.5px] text-muted">
                {waStatus === 'connecting' || waBusy ? 'Menyiapkan sesi WhatsApp…' : 'Memuat…'}
              </p>
            </>
          )}
        </div>
      </Modal>
      {/* Dialog login Meta ala Pancake */}
      <MetaConnectModal
        open={!!metaChannel}
        onClose={() => setMetaChannel(null)}
        channel={metaChannel}
      />

      {/* Pilih Halaman setelah OAuth */}
      <MetaPagePicker
        open={metaPick}
        onClose={() => setMetaPick(false)}
        onDone={() => {
          setMetaPick(false);
          load();
        }}
      />
    </div>
  );
}
