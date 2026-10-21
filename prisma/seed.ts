// Seed demo WOORK — Organisasi "WOORK Demo" + data realistis
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const PASSWORD = 'password123';

async function main() {
  console.log('Seeding WOORK demo…');

  // Bersihkan data demo lama
  const existing = await prisma.organization.findUnique({ where: { slug: 'woork-demo' } });
  if (existing) {
    await prisma.organization.delete({ where: { id: existing.id } });
    console.log('Data demo lama dihapus.');
  }

  const org = await prisma.organization.create({
    data: {
      name: 'WOORK Demo',
      slug: 'woork-demo',
      industry: 'Retail',
      teamSize: '6-20',
      subscription: { create: { plan: 'PROFESSIONAL', status: 'ACTIVE' } },
    },
  });

  // Roles & permissions (duplikat ringan dari lib/auth agar seed mandiri)
  const { ROLE_PERMISSIONS } = await import('../lib/permissions');
  const permKeys = [...new Set(Object.values(ROLE_PERMISSIONS).flat())];
  for (const key of permKeys) {
    await prisma.permission.upsert({ where: { key }, update: {}, create: { key } });
  }
  const roleIds: Record<string, string> = {};
  for (const [roleName, perms] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await prisma.role.create({
      data: { organizationId: org.id, name: roleName, isSystem: true },
    });
    roleIds[roleName] = role.id;
    for (const p of perms) {
      const perm = await prisma.permission.findUniqueOrThrow({ where: { key: p } });
      await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: perm.id } });
    }
  }

  // Lead & deal stages
  const leadStageNames: Array<[string, string]> = [
    ['Baru', '#087BFF'], ['Dihubungi', '#8B5CF6'], ['Terkualifikasi', '#22C55E'],
    ['Proposal', '#F59E0B'], ['Negosiasi', '#F97316'], ['Menang', '#16A34A'], ['Kalah', '#EF4444'],
  ];
  const leadStages: Record<string, string> = {};
  for (const [i, [n, c]] of leadStageNames.entries()) {
    const s = await prisma.leadStage.create({
      data: { organizationId: org.id, name: n, color: c, order: i },
    });
    leadStages[n] = s.id;
  }
  const dealStages: Record<string, string> = {};
  for (const [i, n] of ['Prospek', 'Kualifikasi', 'Penawaran', 'Negosiasi', 'Closing'].entries()) {
    const s = await prisma.dealStage.create({ data: { organizationId: org.id, name: n, order: i } });
    dealStages[n] = s.id;
  }

  // Channels
  const channelIds: Record<string, string> = {};
  for (const [type, name] of [['WHATSAPP', 'WhatsApp'], ['INSTAGRAM', 'Instagram'], ['FACEBOOK', 'Facebook'], ['WEBSITE', 'Website Chat']]) {
    const ch = await prisma.channel.create({
      data: { organizationId: org.id, type, name, status: type === 'WEBSITE' ? 'DISCONNECTED' : 'CONNECTED' },
    });
    channelIds[type] = ch.id;
    if (type !== 'WEBSITE') {
      await prisma.channelAccount.create({
        data: {
          organizationId: org.id,
          channelId: ch.id,
          displayName: `${name} Demo`,
          status: 'CONNECTED',
          connectedAt: new Date(),
          lastTestAt: new Date(),
          lastTestOk: true,
        },
      });
    }
  }

  // Users
  const pw = await bcrypt.hash(PASSWORD, 12);
  const users: Record<string, string> = {};
  for (const [email, name, role] of [
    ['admin@woork.id', 'Budi Santoso', 'OWNER'],
    ['supervisor@woork.id', 'Sinta Maharani', 'SUPERVISOR'],
    ['agent@woork.id', 'Riko Pratama', 'AGENT'],
  ] as const) {
    const u = await prisma.user.create({ data: { name, email, password: pw } });
    users[email] = u.id;
    await prisma.membership.create({
      data: { userId: u.id, organizationId: org.id, roleId: roleIds[role] },
    });
  }
  const adminId = users['admin@woork.id'];
  const agentId = users['agent@woork.id'];

  // Customers
  const customerData = [
    { name: 'Bu Sari', phone: '62812000001', company: 'Toko Kue Sari', stage: 'Terkualifikasi', score: 'Tinggi', business: 'Toko kue', interest: 'Pesanan online', budget: null },
    { name: 'Bu Rina', phone: '62812000002', company: null, stage: 'Dihubungi', score: 'Sedang', business: null, interest: 'Paket Basic', budget: null },
    { name: 'Pak Andi', phone: '62812000003', company: 'Andi Elektronik', stage: 'Negosiasi', score: 'Tinggi', business: 'Toko elektronik', interest: 'Pembelian 20 unit', budget: 'Rp 50 juta' },
    { name: 'Toko Maju', phone: '62812000004', company: 'Toko Maju Jaya', stage: 'Proposal', score: 'Sedang', business: 'Kelontong', interest: 'Paket Pro', budget: 'Rp 5 juta/bulan' },
    { name: 'Dewi', phone: '62812000005', company: null, stage: 'Baru', score: null, business: null, interest: null, budget: null },
    { name: 'Pak Joko', phone: '62812000006', company: 'Joko Furniture', stage: 'Pelanggan', score: 'Tinggi', business: 'Furniture', interest: 'Paket Enterprise', budget: 'Rp 20 juta/bulan' },
  ] as const;

  const customers: Record<string, string> = {};
  const channelTypes = ['WHATSAPP', 'INSTAGRAM', 'WHATSAPP', 'FACEBOOK', 'WHATSAPP', 'WHATSAPP'];
  for (const [i, c] of customerData.entries()) {
    const cust = await prisma.customer.create({
      data: {
        organizationId: org.id,
        name: c.name,
        phone: c.phone,
        company: c.company,
        stage: c.stage,
        score: c.score,
        business: c.business,
        interest: c.interest,
        budget: c.budget,
        ownerId: i % 2 === 0 ? adminId : agentId,
        source: 'WhatsApp',
        lastMessageAt: new Date(Date.now() - i * 3600_000),
      },
    });
    customers[c.name] = cust.id;

    // conversation per customer
    const conv = await prisma.conversation.create({
      data: {
        organizationId: org.id,
        customerId: cust.id,
        channelId: channelIds[channelTypes[i]],
        channelType: channelTypes[i],
        status: i < 2 ? 'OPEN' : 'NEW',
        assignedTo: i === 2 || i === 3 ? 'TEAM' : 'WOO',
        assigneeId: i === 2 || i === 3 ? agentId : null,
        lastMessageAt: new Date(Date.now() - i * 3600_000),
      },
    });
    if (i === 2 || i === 3) {
      await prisma.customer.update({ where: { id: cust.id }, data: { unreadCount: 2 } });
    }

    // pesan demo
    const msgs: Array<[string, string]> = [
      ['CUSTOMER', 'Halo, saya mau tanya-tanya dulu boleh?'],
      ['WOO', `Halo ${c.name.split(' ')[0]}! Tentu boleh. Ada yang bisa saya bantu?`],
    ];
    if (c.name === 'Pak Andi') {
      msgs.push(['CUSTOMER', 'Kalau beli 20 unit ada diskon khusus?']);
      msgs.push(['WOO', 'Ada Pak! Untuk pembelian di atas 10 unit kami beri harga khusus. Boleh saya hubungkan ke tim sales?']);
    }
    for (const [j, [sender, body]] of msgs.entries()) {
      await prisma.conversationMessage.create({
        data: {
          conversationId: conv.id,
          senderType: sender,
          body,
          createdAt: new Date(Date.now() - (i * 3600_000 + (msgs.length - j) * 120_000)),
        },
      });
    }
  }

  // Thread Bu Sari — persis sesuai desain referensi
  const sariConv = await prisma.conversation.findFirst({
    where: { customerId: customers['Bu Sari'] },
  });
  if (sariConv) {
    await prisma.conversationMessage.deleteMany({ where: { conversationId: sariConv.id } });
    const base = new Date('2026-10-07T09:42:00+07:00').getTime();
    const sariMsgs: Array<[string, string, number]> = [
      ['CUSTOMER', 'Halo, saya mau tanya paket Pro', 0],
      ['WOO', 'Halo Bu Sari! Paket Pro cocok untuk usaha yang sedang berkembang. Boleh tahu usaha ibu apa?', 1],
      ['CUSTOMER', 'Toko kue, mau terima pesanan online', 12],
      ['WOO', 'Siap, saya catat ya, Bu. Ada target anggaran per bulan?', 15],
      ['SYSTEM', 'Lead tercatat: Bu Sari, tahap Terkualifikasi', 16],
    ];
    for (const [sender, body, min] of sariMsgs) {
      await prisma.conversationMessage.create({
        data: {
          conversationId: sariConv.id,
          senderType: sender,
          body,
          createdAt: new Date(base + (min as number) * 60_000),
        },
      });
    }
    await prisma.conversation.update({
      where: { id: sariConv.id },
      data: { lastMessageAt: new Date(base + 16 * 60_000) },
    });
  }

  // Lead Bu Sari
  await prisma.lead.create({
    data: {
      organizationId: org.id,
      customerId: customers['Bu Sari'],
      stageId: leadStages['Terkualifikasi'],
      ownerId: agentId,
      score: 'Tinggi',
      source: 'WhatsApp',
    },
  });
  await prisma.lead.create({
    data: {
      organizationId: org.id,
      customerId: customers['Pak Andi'],
      stageId: leadStages['Negosiasi'],
      ownerId: adminId,
      value: 50000000,
      score: 'Tinggi',
    },
  });

  // Follow up
  await prisma.followUp.create({
    data: {
      organizationId: org.id,
      customerId: customers['Bu Sari'],
      assignedToId: agentId,
      scheduledAt: new Date(Date.now() + 2 * 24 * 3600_000),
      notes: 'Tanyakan keputusan paket Pro',
    },
  });

  // Bot flow demo
  const flow = await prisma.botFlow.create({
    data: {
      organizationId: org.id,
      name: 'Auto-balas info harga',
      description: 'Otomatis membalas pesan yang menanyakan harga',
      isActive: true,
    },
  });
  const nodes = [
    { type: 'TRIGGER', name: 'Pelanggan mengirim pesan', config: {}, order: 0 },
    { type: 'CONDITION', name: 'Berisi kata "harga"', config: { keyword: 'harga' }, order: 1 },
    { type: 'ACTION', name: 'Kirim info paket', config: { reply: 'Halo! Berikut info paket kami: Basic Rp149rb/bln, Pro Rp399rb/bln, Enterprise hubungi tim kami.' }, order: 2 },
    { type: 'ACTION', name: 'Teruskan ke tim (jika tidak cocok)', config: { fallback: true }, order: 3 },
  ];
  for (const n of nodes) {
    await prisma.botNode.create({
      data: {
        flowId: flow.id,
        type: n.type,
        name: n.name,
        config: JSON.stringify(n.config),
        order: n.order,
      },
    });
  }

  // Campaign demo
  await prisma.campaign.create({
    data: {
      organizationId: org.id,
      name: 'Promo Paket Pro Oktober',
      channelType: 'WHATSAPP',
      message: 'Halo! Ada promo khusus Paket Pro bulan ini — diskon 20% untuk 50 pendaftar pertama.',
      status: 'DRAFT',
      createdById: adminId,
    },
  });

  // Audit demo
  await prisma.auditLog.create({
    data: {
      organizationId: org.id,
      userId: adminId,
      action: 'UPDATE_LEAD',
      module: 'CRM',
      description: 'Mengubah Bu Sari dari Dihubungi → Terkualifikasi',
      ipAddress: '127.0.0.1',
    },
  });

  // Notifikasi demo
  await prisma.notification.create({
    data: {
      organizationId: org.id,
      userId: adminId,
      type: 'LEAD',
      title: 'Lead baru: Bu Sari',
      body: 'Woo mengkualifikasi Bu Sari dari percakapan WhatsApp.',
    },
  });

  console.log('Seed selesai!');
  console.log('Login demo: admin@woork.id / password123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
