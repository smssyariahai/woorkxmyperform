'use client';

import { Instagram, Facebook, ArrowLeftRight } from 'lucide-react';
import { Modal } from '@/components/ui/modal';

function IgIcon({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center justify-center rounded-full bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600 text-white ${className ?? 'h-10 w-10'}`}>
      <Instagram className="h-5 w-5" />
    </span>
  );
}

function FbIcon({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center justify-center rounded-full bg-[#1877F2] text-white ${className ?? 'h-10 w-10'}`}>
      <Facebook className="h-5 w-5" />
    </span>
  );
}

export function MetaConnectModal({
  open,
  onClose,
  channel,
}: {
  open: boolean;
  onClose: () => void;
  channel: 'INSTAGRAM' | 'FACEBOOK' | null;
}) {
  if (!channel) return null;
  const isIg = channel === 'INSTAGRAM';

  function login(provider: 'facebook' | 'instagram') {
    // redirect penuh ke OAuth Meta
    window.location.href = `/api/channels/meta/login?provider=${provider}`;
  }

  return (
    <Modal open={open} onClose={onClose} title="">
      <div className="px-2 py-4 text-center">
        <div className="flex items-center justify-center gap-3">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand text-white text-[20px] font-bold">
            W
          </span>
          <ArrowLeftRight className="h-5 w-5 text-muted" />
          {isIg ? <IgIcon className="h-12 w-12" /> : <FbIcon className="h-12 w-12" />}
        </div>
        <h3 className="mt-4 text-[18px] font-bold text-ink">
          Connect WOORK with {isIg ? 'Instagram' : 'Facebook'}
        </h3>
        <p className="mx-auto mt-1.5 max-w-[340px] text-[13.5px] text-muted">
          {isIg
            ? 'Sync Instagram DMs automatically so your team can reply from one inbox.'
            : 'Sync Facebook Page messages automatically so your team can reply from one inbox.'}
        </p>
        <div className="mx-auto mt-6 max-w-[340px] space-y-2.5">
          <button
            onClick={() => login('instagram')}
            className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-line bg-white px-4 py-3 text-[14px] font-semibold text-ink shadow-sm transition hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700"
          >
            <Instagram className="h-5 w-5 text-pink-600" />
            Log in directly with Instagram
          </button>
          <button
            onClick={() => login('facebook')}
            className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-line bg-white px-4 py-3 text-[14px] font-semibold text-ink shadow-sm transition hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700"
          >
            <Facebook className="h-5 w-5 text-[#1877F2]" />
            Log in via Facebook
          </button>
        </div>
        <p className="mx-auto mt-4 max-w-[340px] text-[11.5px] text-muted">
          Dengan menghubungkan, Anda menyetujui WOORK mengakses pesan Halaman/Akun Bisnis Anda via Meta.
        </p>
      </div>
    </Modal>
  );
}
