'use client';

import Link from 'next/link';
import { CalendarDays, Clock, Users, Video } from 'lucide-react';
import { Badge } from '@/components/ui/primitives';
import { formatTanggalJam } from '@/lib/pengumuman/client';
import {
  MEETING_STATUS_LABEL,
  MEETING_TYPE_LABEL,
  formatDurasi,
  shortMeetingId,
  type MeetingItem,
} from './client';

export const MEETING_STATUS_TONE: Record<string, 'green' | 'amber' | 'blue' | 'red' | 'gray'> = {
  DRAFT: 'gray',
  SCHEDULED: 'blue',
  ONGOING: 'green',
  COMPLETED: 'gray',
  CANCELLED: 'red',
};

/** Kartu baris meeting untuk daftar upcoming / recent / riwayat. */
export function MeetingCard({
  meeting,
  showJoin = true,
}: {
  meeting: MeetingItem;
  showJoin?: boolean;
}) {
  const canJoin = meeting.status === 'SCHEDULED' || meeting.status === 'ONGOING';
  return (
    <div className="rounded-xl border border-slate-200 p-4 hover:border-slate-300 hover:shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/meet/${meeting.id}`} className="text-sm font-semibold text-slate-800 hover:underline">
            {meeting.title}
          </Link>
          <p className="mt-0.5 text-xs text-slate-500">
            ID: {shortMeetingId(meeting.id)}
            {meeting.hostName ? ` • Host: ${meeting.hostName}` : ''}
            {meeting.meetingType ? ` • ${MEETING_TYPE_LABEL[meeting.meetingType] ?? meeting.meetingType}` : ''}
          </p>
        </div>
        <Badge tone={MEETING_STATUS_TONE[meeting.status] ?? 'gray'}>
          {MEETING_STATUS_LABEL[meeting.status] ?? meeting.status}
        </Badge>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1">
          <CalendarDays size={13} /> {formatTanggalJam(meeting.startsAt)}
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock size={13} /> {formatDurasi(meeting.startsAt, meeting.endsAt)}
        </span>
        <span className="inline-flex items-center gap-1">
          <Users size={13} /> {meeting.participantCount ?? meeting.participants?.length ?? 0} peserta
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {showJoin && canJoin && (
          <Link
            href={`/meet/room/${meeting.id}`}
            className="btn-primary inline-flex items-center gap-1.5 !py-1.5 !px-3 text-xs"
          >
            <Video size={14} /> Join
          </Link>
        )}
        <Link href={`/meet/${meeting.id}`} className="btn-secondary inline-flex items-center gap-1.5 !py-1.5 !px-3 text-xs">
          Detail
        </Link>
      </div>
    </div>
  );
}
