// Buat meeting langsung (Start Meeting Now) — POST /api/meet via helper.
'use client';

import { useState } from 'react';
import { Video } from 'lucide-react';
import { toast } from 'sonner';
import { CreatedMeetingCard, MeetingForm } from '@/components/meet/MeetingForm';
import { createMeeting, type MeetingInput, type MeetingItem } from '@/components/meet/client';

export default function MeetNewPage() {
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<MeetingItem | null>(null);

  async function handleSubmit(input: MeetingInput) {
    setSubmitting(true);
    try {
      const meeting = await createMeeting(input);
      setCreated(meeting);
      toast.success('Meeting berhasil dibuat.');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Gagal membuat meeting.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-800 text-white">
          <Video size={22} />
        </span>
        <div>
          <h1 className="text-lg font-bold text-slate-800">New Meeting</h1>
          <p className="text-xs text-slate-500">
            Buat meeting dan mulai sekarang — undang peserta, lalu bagikan tautan undangannya.
          </p>
        </div>
      </div>

      {created ? (
        <CreatedMeetingCard meeting={created} mode="now" />
      ) : (
        <MeetingForm mode="now" submitting={submitting} onSubmit={handleSubmit} />
      )}
    </div>
  );
}
