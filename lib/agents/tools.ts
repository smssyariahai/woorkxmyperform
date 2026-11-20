import { prisma } from '@/lib/db';
import { formatBulanTahun, monthRange } from './month';

/**
 * Tool Registry — Master Prompt §11.
 * Setiap tool: input tervalidasi, output terukur, permission check implisit via orgId.
 * Semua tool di sini membaca data nyata dari database / layanan aplikasi.
 * Bila suatu integrasi belum tersedia, tool tersebut dihapus — bukan disimulasi.
 */
export interface ToolContext {
  organizationId: string;
  agentId: string;
  agentName: string;
  taskId: string;
}

export interface ToolDef {
  key: string;
  name: string;
  description: string;
  simulated: boolean;
  needsApproval: boolean;
  run: (ctx: ToolContext, args: Record<string, any>) => Promise<{ summary: string; data: any }>;
}

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export const TOOLS: Record<string, ToolDef> = {
  laporan_kinerja: {
    key: 'laporan_kinerja',
    name: 'Laporan kinerja',
    description: 'Hitung metrik operasional nyata dari database: percakapan, pesan, pelanggan, kampanye.',
    simulated: false,
    needsApproval: false,
    run: async (ctx) => {
      const org = ctx.organizationId;
      const today = startOfDay();
      const [convs, msgs, customers, campaigns, newCustomers] = await Promise.all([
        prisma.conversation.count({ where: { organizationId: org, createdAt: { gte: today } } }),
        prisma.conversationMessage.count({
          where: { conversation: { organizationId: org }, createdAt: { gte: today } },
        }),
        prisma.customer.count({ where: { organizationId: org } }),
        prisma.campaign.findMany({
          where: { organizationId: org },
          select: { id: true, name: true, status: true },
          take: 10,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.customer.count({ where: { organizationId: org, createdAt: { gte: today } } }),
      ]);
      const byStage = await prisma.customer.groupBy({
        by: ['stage'],
        where: { organizationId: org },
        _count: { id: true },
      });
      const data = {
        percakapan_hari_ini: convs,
        pesan_hari_ini: msgs,
        total_pelanggan: customers,
        pelanggan_baru_hari_ini: newCustomers,
        per_tahap: byStage.map((s) => ({ tahap: s.stage, jumlah: s._count.id })),
        kampanye_terakhir: campaigns.map((c) => ({ nama: c.name, status: c.status })),
      };
      const summary =
        `Hari ini: ${convs} percakapan, ${msgs} pesan, ${newCustomers} pelanggan baru. ` +
        `Total ${customers} pelanggan. Kampanye aktif: ${campaigns.filter((c) => c.status === 'SENDING' || c.status === 'SCHEDULED').length}.`;
      return { summary, data };
    },
  },

  rekap_keuangan: {
    key: 'rekap_keuangan',
    name: 'Rekap Tagihan WOORK',
    description:
      'Rekap tagihan langganan modul WOORK (Invoice + InvoiceItem) kantor ini per bulan. ' +
      'BUKAN laporan keuangan lengkap dan BUKAN rekap kas/pengeluaran operasional — ' +
      'aplikasi ini tidak punya data kas operasional, jadi jangan pernah menyajikannya sebagai laporan kas.',
    simulated: false,
    needsApproval: false, // persetujuan finansial ditangani di level tugas (intent requiresApproval: true)
    run: async (ctx, args) => {
      const now = new Date();
      const year = Number(args.year) || now.getFullYear();
      let month = Number(args.month) || now.getMonth() + 1;
      if (month < 1 || month > 12) month = now.getMonth() + 1;
      const periode = formatBulanTahun(year, month);
      const { start, end } = monthRange(year, month);
      // Invoice yang periodenya bersinggungan dengan bulan yang diminta.
      const invoices = await prisma.invoice.findMany({
        where: {
          organizationId: ctx.organizationId,
          periodStart: { lt: end },
          periodEnd: { gte: start },
        },
        include: { items: true },
        orderBy: { periodStart: 'asc' },
      });
      const aktif = invoices.filter((i) => i.status !== 'CANCELLED');
      const sum = (rows: { total: number }[]) => rows.reduce((a, r) => a + r.total, 0);
      const totalTagihan = sum(aktif);
      const totalLunas = sum(aktif.filter((i) => i.status === 'PAID'));
      const totalBelumLunas = sum(aktif.filter((i) => i.status === 'PENDING' || i.status === 'OVERDUE'));
      const perModulMap = new Map<string, { modul: string; jumlah_item: number; total: number }>();
      for (const inv of aktif) {
        for (const it of inv.items) {
          const key = it.moduleKey || it.description || 'Lainnya';
          const cur = perModulMap.get(key) ?? { modul: key, jumlah_item: 0, total: 0 };
          cur.jumlah_item += 1;
          cur.total += it.amount;
          perModulMap.set(key, cur);
        }
      }
      const data = {
        label: 'Rekap Tagihan WOORK',
        periode,
        year,
        month,
        total_tagihan: totalTagihan,
        total_lunas: totalLunas,
        total_belum_lunas: totalBelumLunas,
        jumlah_invoice: invoices.length,
        kosong: invoices.length === 0,
        per_modul: [...perModulMap.values()].sort((a, b) => b.total - a.total),
        invoices: invoices.map((i) => ({
          nomor: i.number,
          periode: `${i.periodStart.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })} – ${i.periodEnd.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}`,
          status: i.status,
          total: i.total,
          dibayar_pada: i.paidAt ? i.paidAt.toISOString() : null,
        })),
      };
      if (invoices.length === 0) {
        return {
          summary: `Tidak ada tagihan tercatat untuk ${periode}.`,
          data,
        };
      }
      const summary =
        `Rekap Tagihan WOORK ${periode}: ${invoices.length} invoice, total tagihan Rp ${totalTagihan.toLocaleString('id-ID')} ` +
        `(lunas Rp ${totalLunas.toLocaleString('id-ID')}, belum lunas Rp ${totalBelumLunas.toLocaleString('id-ID')}). ` +
        `Sumber: tagihan langganan modul WOORK kantor ini — bukan laporan kas operasional.`;
      return { summary, data };
    },
  },

  rekap_pelanggan: {
    key: 'rekap_pelanggan',
    name: 'Rekap pelanggan',
    description: 'Ambil komposisi pelanggan per tahap dan skor dari CRM.',
    simulated: false,
    needsApproval: false,
    run: async (ctx) => {
      const org = ctx.organizationId;
      const byStage = await prisma.customer.groupBy({
        by: ['stage'],
        where: { organizationId: org },
        _count: { id: true },
      });
      const byScore = await prisma.customer.groupBy({
        by: ['score'],
        where: { organizationId: org },
        _count: { id: true },
      });
      const top = await prisma.customer.findMany({
        where: { organizationId: org },
        select: { name: true, stage: true, score: true, lastMessageAt: true },
        orderBy: { lastMessageAt: 'desc' },
        take: 5,
      });
      const data = {
        per_tahap: byStage.map((s) => ({ tahap: s.stage, jumlah: s._count.id })),
        per_skor: byScore.map((s) => ({ skor: s.score ?? '-', jumlah: s._count.id })),
        terakhir_aktif: top,
      };
      return { summary: `CRM mencatat ${byStage.reduce((a, s) => a + s._count.id, 0)} pelanggan di ${byStage.length} tahap.`, data };
    },
  },

  status_kampanye: {
    key: 'status_kampanye',
    name: 'Status kampanye',
    description: 'Lihat kampanye broadcast dan progres pengirimannya.',
    simulated: false,
    needsApproval: false,
    run: async (ctx) => {
      const items = await prisma.campaign.findMany({
        where: { organizationId: ctx.organizationId },
        select: {
          id: true, name: true, status: true, createdAt: true,
          _count: { select: { recipients: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });
      const data = items.map((c) => ({ nama: c.name, status: c.status, penerima: c._count.recipients }));
      return { summary: `${items.length} kampanye terakhir dipantau.`, data };
    },
  },

  daftar_tugas: {
    key: 'daftar_tugas',
    name: 'Daftar tugas agent',
    description: 'Lihat tugas-tugas agent virtual berdasar status.',
    simulated: false,
    needsApproval: false,
    run: async (ctx, args) => {
      const where: any = { organizationId: ctx.organizationId };
      if (args.status) where.status = String(args.status).toUpperCase();
      if (args.agentName) {
        const ag = await prisma.agent.findFirst({
          where: { organizationId: ctx.organizationId, name: { equals: String(args.agentName), mode: 'insensitive' } },
        });
        if (ag) where.agentId = ag.id;
      }
      const items = await prisma.agentTask.findMany({
        where,
        include: { agent: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });
      const data = items.map((t) => ({
        judul: t.title, agent: t.agent?.name ?? '-', status: t.status,
        progres: t.progress, prioritas: t.priority,
      }));
      return { summary: `${items.length} tugas ditemukan.`, data };
    },
  },

  delegasi_tugas: {
    key: 'delegasi_tugas',
    name: 'Delegasi tugas',
    description: 'Buatkan subtask untuk agent lain (maksimal kedalaman delegasi 2).',
    simulated: false,
    needsApproval: false,
    run: async (ctx, args) => {
      const targetName = String(args.agentName || '');
      const title = String(args.title || 'Subtask');
      if (!targetName) throw new Error('agentName wajib diisi.');
      const target = await prisma.agent.findFirst({
        where: {
          organizationId: ctx.organizationId,
          name: { equals: targetName, mode: 'insensitive' },
          isEnabled: true,
        },
      });
      if (!target) throw new Error(`Agent "${targetName}" tidak ditemukan / nonaktif.`);
      const depth = Number(args.depth || 0);
      if (depth >= 2) throw new Error('Batas kedalaman delegasi tercapai (maks 2).');
      const sub = await prisma.agentTask.create({
        data: {
          organizationId: ctx.organizationId,
          title,
          description: String(args.description || `Didelegasikan oleh ${ctx.agentName}`),
          agentId: target.id,
          priority: 'NORMAL',
          status: 'QUEUED',
          inputPayload: JSON.stringify({ delegatedBy: ctx.agentName, depth: depth + 1 }),
        },
      });
      // catat pesan antar-agent (Master Prompt §6)
      const convId = `dlg-${ctx.taskId}`;
      await prisma.agentMessage.create({
        data: {
          organizationId: ctx.organizationId,
          conversationId: convId,
          senderAgentId: ctx.agentId,
          receiverAgentId: target.id,
          taskId: sub.id,
          content: `${ctx.agentName} → ${target.name}: ${title}`,
        },
      });
      return { summary: `Subtask "${title}" dibuat untuk ${target.name}.`, data: { subtaskId: sub.id } };
    },
  },

  status_sistem: {
    key: 'status_sistem',
    name: 'Status sistem',
    description: 'Pemeriksaan kesehatan nyata: koneksi database, sesi WhatsApp, uptime aplikasi, dan memori.',
    simulated: false,
    needsApproval: false,
    run: async (ctx) => {
      const checks: Array<{ layanan: string; status: string; detail?: string }> = [];
      // Database
      try {
        await prisma.$queryRaw`SELECT 1`;
        checks.push({ layanan: 'database', status: 'normal' });
      } catch (e: any) {
        checks.push({ layanan: 'database', status: 'error', detail: String(e?.message || e).slice(0, 120) });
      }
      // Sesi WhatsApp organisasi ini
      try {
        const { getSessionInfo } = await import('@/lib/wa/manager');
        const info = getSessionInfo(ctx.organizationId);
        checks.push({
          layanan: 'whatsapp',
          status: info.status === 'open' ? 'normal' : 'warning',
          detail: `status sesi: ${info.status}${info.phone ? ` (${info.phone})` : ''}`,
        });
      } catch (e: any) {
        checks.push({ layanan: 'whatsapp', status: 'error', detail: String(e?.message || e).slice(0, 120) });
      }
      // Aplikasi
      const memMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
      const upMin = Math.round(process.uptime() / 60);
      checks.push({ layanan: 'aplikasi', status: 'normal', detail: `uptime ${upMin} mnt, memori ${memMB} MB` });
      const bermasalah = checks.filter((c) => c.status !== 'normal');
      const summary = bermasalah.length === 0
        ? `Semua layanan normal (database OK, WhatsApp: ${checks.find((c) => c.layanan === 'whatsapp')?.detail}, uptime ${upMin} mnt).`
        : `Ditemukan ${bermasalah.length} masalah: ${bermasalah.map((c) => `${c.layanan} (${c.status}${c.detail ? ': ' + c.detail : ''})`).join('; ')}.`;
      return { summary, data: { mode: 'nyata', checks } };
    },
  },

};

export function getTool(key: string): ToolDef | undefined {
  return TOOLS[key];
}

/** Tool yang boleh dipakai agent (dari kolom tools di DB). */
export function allowedTools(toolKeys: string[]): ToolDef[] {
  try {
    const keys: string[] = Array.isArray(toolKeys) ? toolKeys : JSON.parse(toolKeys || '[]');
    return keys.map((k) => TOOLS[k]).filter(Boolean);
  } catch {
    return [];
  }
}
