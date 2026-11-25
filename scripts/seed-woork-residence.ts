// Seed WOORK STAFF RESIDENCE untuk WOORK.ID (Fase 5a — desain §1).
// 1 Residence + 4 Room (Kamar 1–4) + 16 Bed (K1-B1..K4-B4) + assign 16 agent.
// Urutan agent = urutan station (nama A–Z, sama dengan GET /api/kantor/office):
// Kamar 1 = 4 agent pertama, dst. bedIndex global 0–15 = urutan residenceBeds()
// (per kamar: baris utara dulu, kolom barat dulu).
// Idempotent: residence/room/bed hanya dibuat bila belum ada; assignment
// hanya dibuat bila agent BELUM punya assignment (tidak menimpa pindahan
// admin lewat API assignment). Tenant lain TIDAK di-seed (Fase 7).
//
// Jalankan: npx tsx scripts/seed-woork-residence.ts
import { getTenantClientForCode } from '../lib/tenant/resolver';
import { masterPrisma } from '../lib/tenant/master';

const TENANT_CODE = 'woork_t_7862d085';
const ORG_ID = 'cmwsycgq40000ftucekyc2us8';
const RESIDENCE_NAME = 'WOORK STAFF RESIDENCE';
const ROOM_NAMES = ['Kamar 1', 'Kamar 2', 'Kamar 3', 'Kamar 4'];

async function main(): Promise<void> {
  const client = await getTenantClientForCode(TENANT_CODE);

  let residence = await client.residence.findFirst({
    where: { name: RESIDENCE_NAME },
    select: { id: true },
  });
  if (!residence) {
    residence = await client.residence.create({
      data: { name: RESIDENCE_NAME, status: 'ACTIVE' },
      select: { id: true },
    });
    console.log(`[seed-residence] buat residence "${RESIDENCE_NAME}"`);
  } else {
    console.log(`[seed-residence] residence "${RESIDENCE_NAME}" sudah ada`);
  }

  const beds: { id: string; roomId: string; bedCode: string; bedIndex: number }[] = [];
  let roomsCreated = 0;
  let bedsCreated = 0;
  for (let r = 0; r < ROOM_NAMES.length; r++) {
    const roomName = ROOM_NAMES[r];
    let room = await client.residenceRoom.findFirst({
      where: { residenceId: residence.id, name: roomName },
      select: { id: true },
    });
    if (!room) {
      room = await client.residenceRoom.create({
        data: { residenceId: residence.id, name: roomName, floorNumber: 2, capacity: 4 },
        select: { id: true },
      });
      roomsCreated++;
      console.log(`[seed-residence] buat ${roomName}`);
    }
    for (let b = 0; b < 4; b++) {
      const bedIndex = r * 4 + b;
      const bedCode = `K${r + 1}-B${b + 1}`;
      let bed = await client.residenceBed.findFirst({
        where: { roomId: room.id, bedCode },
        select: { id: true, roomId: true, bedCode: true, bedIndex: true },
      });
      if (!bed) {
        bed = await client.residenceBed.create({
          data: { roomId: room.id, bedCode, bedIndex, status: 'AVAILABLE' },
          select: { id: true, roomId: true, bedCode: true, bedIndex: true },
        });
        bedsCreated++;
      }
      beds.push(bed);
    }
  }
  beds.sort((a, b) => a.bedIndex - b.bedIndex);

  const agents = await client.agent.findMany({
    where: { organizationId: ORG_ID, isEnabled: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
  console.log(`[seed-residence] agent aktif WOORK.ID: ${agents.length} (harap 16)`);
  if (agents.length !== 16) {
    console.log('[seed-residence] PERINGATAN: jumlah agent bukan 16 — assign sebanyak yang ada');
  }

  let assigned = 0;
  let alreadyAssigned = 0;
  let bedTaken = 0;
  for (let i = 0; i < Math.min(agents.length, beds.length); i++) {
    const agent = agents[i];
    const bed = beds[i];
    const existing = await client.agentResidenceAssignment.findUnique({
      where: { agentId: agent.id },
      select: { id: true, bedId: true },
    });
    if (existing) {
      alreadyAssigned++;
      continue;
    }
    const bedOccupied = await client.agentResidenceAssignment.findUnique({
      where: { bedId: bed.id },
      select: { id: true },
    });
    if (bedOccupied) {
      console.log(`[seed-residence] kasur ${bed.bedCode} sudah terisi — agent ${agent.name} dilewati`);
      bedTaken++;
      continue;
    }
    await client.agentResidenceAssignment.create({
      data: {
        agentId: agent.id,
        residenceId: residence.id,
        roomId: bed.roomId,
        bedId: bed.id,
        status: 'ACTIVE',
      },
    });
    assigned++;
    console.log(`[seed-residence] agent ${agent.name} → ${bed.bedCode}`);
  }

  console.log(
    `[seed-residence] SELESAI tenant ${TENANT_CODE}: kamar dibuat=${roomsCreated} kasur dibuat=${bedsCreated}, agent ditempatkan=${assigned} sudah=${alreadyAssigned} kasur-terisi=${bedTaken}`,
  );
  await client.$disconnect();
  await masterPrisma.$disconnect();
  process.exit(0);
}

main().catch(async (e) => {
  console.error('[seed-residence] GAGAL:', e?.message ?? e);
  try {
    await masterPrisma.$disconnect();
  } catch {
    /* abaikan */
  }
  process.exit(1);
});
