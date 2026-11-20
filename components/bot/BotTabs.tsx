'use client';

import { useState } from 'react';
import { BotClient } from '@/components/bot/BotClient';
import { BotAiOwner } from '@/components/bot/BotAiOwner';
import { BotAiAdmin } from '@/components/bot/BotAiAdmin';
import { cn } from '@/lib/utils';
import { GitBranch, Sparkles, Settings2 } from 'lucide-react';

/** Tab Bot & Automation: Flow (existing) + AI & Kredit (baru). */
export function BotTabs({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const [tab, setTab] = useState<'flow' | 'ai'>('flow');

  return (
    <div>
      <div className="sticky top-0 z-10 bg-canvas/95 backdrop-blur border-b border-line">
        <div className="flex gap-1">
          <button
            onClick={() => setTab('flow')}
            className={cn(
              'inline-flex items-center gap-2 px-4 py-3 text-[13.5px] font-semibold border-b-2 -mb-px transition-colors',
              tab === 'flow' ? 'border-brand text-brand' : 'border-transparent text-muted hover:text-ink'
            )}
          >
            <GitBranch className="h-4 w-4" /> Flow Automation
          </button>
          <button
            onClick={() => setTab('ai')}
            className={cn(
              'inline-flex items-center gap-2 px-4 py-3 text-[13.5px] font-semibold border-b-2 -mb-px transition-colors',
              tab === 'ai' ? 'border-brand text-brand' : 'border-transparent text-muted hover:text-ink'
            )}
          >
            {isSuperAdmin ? <Settings2 className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
            {isSuperAdmin ? 'AI & Kredit Global' : 'AI & Kredit'}
          </button>
        </div>
      </div>
      {tab === 'flow' ? (
        <BotClient />
      ) : isSuperAdmin ? (
        <BotAiAdmin />
      ) : (
        <BotAiOwner />
      )}
    </div>
  );
}
