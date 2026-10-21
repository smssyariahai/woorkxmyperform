import { cn } from '@/lib/utils';
import { Inbox, SearchX, AlertTriangle } from 'lucide-react';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} />;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand dark:bg-brand-900/30">
        {icon ?? <Inbox className="h-7 w-7" />}
      </div>
      <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-[13px] text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-danger">
        <AlertTriangle className="h-7 w-7" />
      </div>
      <h3 className="text-[15px] font-semibold text-ink">Terjadi kesalahan</h3>
      <p className="mt-1.5 max-w-sm text-[13px] text-muted">
        {message ?? 'Terjadi kesalahan. Silakan coba lagi.'}
      </p>
      {onRetry && (
        <button className="btn-secondary mt-5" onClick={onRetry}>
          Coba lagi
        </button>
      )}
    </div>
  );
}

export function NoResults({ onClear }: { onClear?: () => void }) {
  return (
    <EmptyState
      icon={<SearchX className="h-7 w-7" />}
      title="Tidak ada hasil"
      description="Coba ubah kata kunci atau filter pencarian Anda."
      action={
        onClear && (
          <button className="btn-secondary" onClick={onClear}>
            Bersihkan filter
          </button>
        )
      }
    />
  );
}
