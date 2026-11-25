import { prisma } from '@/lib/db';
import type { AuthContext } from '@/lib/auth-helpers';
import { AGENT_DEFINITIONS } from './registry';
import { TOOLS } from './tools';

/**
 * Manajemen Agent Kantor Virtual (Wave 13) — helper server untuk
 * API kelola agent. Aturan yang dijaga di sini (bukan hanya di UI):
 *
 * - Siapa boleh mengelola: OWNER / ADMIN kantor, atau Super Admin.
 *   Karyawan/Manager/Supervisor TIDAK boleh — konfigurasi agent
 *   menentukan cara semua perintah dijalankan.
 * - Nama agent bawaan (Aria, Bima, Citra, Dian, Eko) tidak bisa dipakai
 *   untuk agent baru dan tidak bisa diubah namanya: `ensureAgents`
 *   men-seed nama-nama itu, jadi ganti nama akan membuat duplikat.
 * - Agent bawaan tidak bisa dihapus (hanya dinonaktifkan); agent yang
 *   sudah punya riwayat tugas/persetujuan juga tidak bisa dihapus
 *   (nonaktifkan saja) karena relasi tugas tidak boleh putus.
 * - `ensureAgents` sengaja create-only (lihat scheduler.ts): perubahan
 *   lewat UI adalah sumber kebenaran dan TIDAK boleh ditimpa seed.
 */

export const BUILTIN_AGENT_NAMES: string[] = AGENT_DEFINITIONS.map((d) => d.name);

export function isBuiltinAgent(name: string): boolean {
  return BUILTIN_AGENT_NAMES.some((n) => n.toLowerCase() === name.trim().toLowerCase());
}

/** 7 tool nyata yang boleh dipilih untuk seorang agent. */
export const MANAGEABLE_TOOLS: Array<{ key: string; name: string; description: string }> =
  Object.values(TOOLS).map((t) => ({ key: t.key, name: t.name, description: t.description }));

export function canManageAgents(ctx: AuthContext): boolean {
  return ctx.isSuperAdmin || ctx.role === 'OWNER' || ctx.role === 'ADMIN';
}

export interface AgentInput {
  name: string;
  role: string;
  description: string;
  avatarColor: string;
  skills: string[];
  tools: string[];
  systemInstructions: string;
  isEnabled: boolean;
}

export interface AgentInputResult {
  ok: boolean;
  data?: AgentInput;
  /** Pesan error Bahasa Indonesia untuk ditampilkan ke pengguna. */
  message?: string;
}

function parseStringArray(value: unknown): string[] | null {
  if (Array.isArray(value)) {
    return value.filter((v) => typeof v === 'string').map((v) => v.trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter((v) => typeof v === 'string').map((v) => v.trim()).filter(Boolean);
      }
    } catch {
      return null;
    }
    return value.split(',').map((v) => v.trim()).filter(Boolean);
  }
  return null;
}

/**
 * Validasi + normalisasi input form agent. `existing` dipakai untuk
 * PATCH: field yang tidak dikirim dipertahankan dari data lama.
 * `allowNameChange` false untuk agent bawaan (namanya kunci seed).
 */
export function validateAgentInput(
  body: any,
  opts?: { existing?: AgentInput | null; allowNameChange?: boolean }
): AgentInputResult {
  const existing = opts?.existing ?? null;
  const allowNameChange = opts?.allowNameChange ?? true;

  const pick = (key: string): unknown =>
    body && typeof body === 'object' && key in body ? body[key] : undefined;

  const rawName = pick('name');
  const name = typeof rawName === 'string' ? rawName.trim() : existing?.name ?? '';
  if (!name) return { ok: false, message: 'Nama agent wajib diisi.' };
  if (name.length > 50) return { ok: false, message: 'Nama agent maksimal 50 karakter.' };
  if (existing && !allowNameChange && name.toLowerCase() !== existing.name.toLowerCase()) {
    return { ok: false, message: 'Nama agent bawaan tidak bisa diubah.' };
  }

  const rawRole = pick('role');
  const role = typeof rawRole === 'string' ? rawRole.trim() : existing?.role ?? '';
  if (!role) return { ok: false, message: 'Peran/tugas agent wajib diisi.' };
  if (role.length > 100) return { ok: false, message: 'Peran maksimal 100 karakter.' };

  const rawDesc = pick('description');
  const description =
    typeof rawDesc === 'string' ? rawDesc.trim() : existing?.description ?? '';
  if (description.length > 300) return { ok: false, message: 'Deskripsi maksimal 300 karakter.' };

  const rawColor = pick('avatarColor');
  const avatarColor =
    typeof rawColor === 'string' ? rawColor.trim() : existing?.avatarColor ?? '#007AFD';
  if (!/^#[0-9a-fA-F]{6}$/.test(avatarColor)) {
    return { ok: false, message: 'Warna avatar harus kode hex, mis. #007AFD.' };
  }

  const rawSkills = pick('skills');
  const skills = rawSkills === undefined ? existing?.skills ?? [] : parseStringArray(rawSkills);
  if (skills === null) return { ok: false, message: 'Skills tidak valid.' };
  if (skills.length > 20) return { ok: false, message: 'Maksimal 20 skill.' };
  if (skills.some((s) => s.length > 50)) {
    return { ok: false, message: 'Tiap skill maksimal 50 karakter.' };
  }

  const rawTools = pick('tools');
  const tools = rawTools === undefined ? existing?.tools ?? [] : parseStringArray(rawTools);
  if (tools === null) return { ok: false, message: 'Daftar tool tidak valid.' };
  const known = new Set(Object.keys(TOOLS));
  if (tools.some((t) => !known.has(t))) {
    return { ok: false, message: 'Ada tool yang tidak dikenal.' };
  }

  const rawInstr = pick('systemInstructions');
  const systemInstructions =
    typeof rawInstr === 'string' ? rawInstr.trim() : existing?.systemInstructions ?? '';
  // Batas 8000 hanya untuk instruksi BARU dari form manual. Agent hasil
  // install katalog menyimpan systemInstructions template APA ADANYA
  // (bisa >8000, mis. 11.044 karakter) — memvalidasi ulang instruksi lama
  // yang tidak diubah akan memblokir SEMUA edit agent itu (warna, tools,
  // nama). Ditemukan 2026-11-23 saat install 9 agent divisi: PATCH warna
  // gagal 422 "Instruksi sistem maksimal 8000 karakter."
  if (typeof rawInstr === 'string' && systemInstructions.length > 8000) {
    return { ok: false, message: 'Instruksi sistem maksimal 8000 karakter.' };
  }

  const rawEnabled = pick('isEnabled');
  const isEnabled =
    typeof rawEnabled === 'boolean' ? rawEnabled : existing?.isEnabled ?? true;

  return {
    ok: true,
    data: { name, role, description, avatarColor, skills, tools, systemInstructions, isEnabled },
  };
}

/** Bentuk baris Agent DB menjadi input yang sudah dinormalisasi. */
export function agentRowToInput(row: {
  name: string;
  role: string;
  description: string | null;
  avatarColor: string | null;
  skills: string | null;
  tools: string | null;
  systemInstructions: string | null;
  isEnabled: boolean;
}): AgentInput {
  let skills: string[] = [];
  let tools: string[] = [];
  try {
    skills = JSON.parse(row.skills || '[]');
  } catch {
    skills = [];
  }
  try {
    tools = JSON.parse(row.tools || '[]');
  } catch {
    tools = [];
  }
  return {
    name: row.name,
    role: row.role,
    description: row.description ?? '',
    avatarColor: row.avatarColor ?? '#007AFD',
    skills: Array.isArray(skills) ? skills : [],
    tools: Array.isArray(tools) ? tools : [],
    systemInstructions: row.systemInstructions ?? '',
    isEnabled: row.isEnabled,
  };
}

/** Apakah agent ini sudah punya riwayat (tugas / persetujuan)? */
export async function agentHasHistory(
  organizationId: string,
  agentId: string
): Promise<boolean> {
  const [tasks, approvals] = await Promise.all([
    prisma.agentTask.count({ where: { organizationId, agentId } }),
    prisma.approval.count({ where: { organizationId, requestedByAgentId: agentId } }),
  ]);
  return tasks > 0 || approvals > 0;
}
