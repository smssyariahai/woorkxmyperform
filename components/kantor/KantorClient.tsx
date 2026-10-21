'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Building2 } from 'lucide-react';
import { CommandBar } from './CommandBar';
import { AgentGrid, AgentDetailModal, type Agent } from './AgentGrid';
import { TaskManager, type AgentTask } from './TaskManager';
import { ApprovalPanel, type Approval } from './ApprovalPanel';
import { OfficeLive } from './OfficeLive';
import { LiveFeed } from './LiveFeed';
import { OfficeHud } from './OfficeHud';

const AGENT_EVENT_NAMES = [
  'agent.connected',
  'agent.status_changed',
  'agent.activity_updated',
  'task.created',
  'task.queued',
  'task.started',
  'task.progress',
  'task.waiting_approval',
  'task.completed',
  'task.failed',
  'task.cancelled',
];

export function KantorClient({ isAdmin }: { isAdmin: boolean }) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [selected, setSelected] = useState<Agent | null>(null);

  const loadAgents = useCallback(async () => {
    try {
      const r = await fetch('/api/agents');
      const j = await r.json();
      if (j.success) setAgents(j.data);
    } catch {}
  }, []);

  const loadTasks = useCallback(async () => {
    try {
      const r = await fetch('/api/agent-tasks');
      const j = await r.json();
      if (j.success) setTasks(j.data);
    } catch {}
  }, []);

  const loadApprovals = useCallback(async () => {
    try {
      const r = await fetch('/api/approvals');
      const j = await r.json();
      if (j.success) setApprovals(j.data);
    } catch {}
  }, []);

  const refreshAll = useCallback(() => {
    loadAgents();
    loadTasks();
    loadApprovals();
  }, [loadAgents, loadTasks, loadApprovals]);

  useEffect(() => {
    refreshAll();
    const es = new EventSource('/api/realtime');
    const onEvent = () => {
      // event agent/tugas apa pun → refresh ringan
      loadAgents();
      loadTasks();
      loadApprovals();
    };
    AGENT_EVENT_NAMES.forEach((n) => es.addEventListener(n, onEvent as EventListener));
    es.onerror = () => {
      /* EventSource reconnect otomatis */
    };
    const poll = setInterval(refreshAll, 15000); // fallback polling
    return () => {
      AGENT_EVENT_NAMES.forEach((n) => es.removeEventListener(n, onEvent as EventListener));
      es.close();
      clearInterval(poll);
    };
  }, [refreshAll, loadAgents, loadTasks, loadApprovals]);

  function handleCommand(reply: string) {
    toast.success(reply, { duration: 3500 });
    // refresh cepat agar status baru langsung terlihat
    setTimeout(refreshAll, 800);
  }

  return (
    <div className="pg">
      <div className="flex items-center gap-3 mb-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-white">
          <Building2 className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-[20px] font-bold text-ink">Kantor Virtual</h1>
          <p className="text-[12.5px] text-muted -mt-0.5">
            AI Agent yang bekerja mandiri — beri perintah, pantau status real-time.
          </p>
        </div>
        <span className="badge-green !text-[11px] ml-auto hidden sm:inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          {agents.filter((a) => a.isEnabled).length} agent online
        </span>
      </div>

      <OfficeHud refreshKey={agents.length + tasks.length + approvals.length} />

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2 space-y-4">
          <OfficeLive agents={agents} tasks={tasks} onSelect={setSelected} isAdmin={isAdmin} />
          <LiveFeed tasks={tasks} />
          <CommandBar onCommand={handleCommand} onRefresh={refreshAll} />
          <AgentGrid agents={agents} onSelect={setSelected} />
        </div>
        <div className="space-y-4">
          <ApprovalPanel items={approvals} onRefresh={refreshAll} />
          <TaskManager tasks={tasks} onRefresh={refreshAll} />
        </div>
      </div>

      <AgentDetailModal
        agent={selected}
        onClose={() => setSelected(null)}
        onUpdated={loadAgents}
        isAdmin={isAdmin}
      />
    </div>
  );
}
