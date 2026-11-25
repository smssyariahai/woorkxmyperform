// Importer katalog template AI-agent (WOORK VIRTUAL OFFICE 3.0 §12, Fase 4a).
//
// Sumber: repo publik https://github.com/msitarzewski/agency-agents
// (MIT, Copyright 2025 AgentLand Contributors — atribusi wajib di katalog).
//
// KEAMANAN — baca studi ~/workspace/woorkxmyperform-docs/STUDI_AGENCY_AGENTS_2026-11-23.md:
// - Repo di-clone DANGKAL ke /tmp (read-only) dan DIHAPUS setelah import.
//   TIDAK ADA file repo yang disalin ke repo WOORK.
// - Skrip repo (install.sh / convert.sh / lint-agents.sh / check-divisions.sh)
//   TIDAK PERNAH dijalankan — importer ini ditulis dari nol (TypeScript),
//   hanya membaca `divisions.json` + file `*.md` sebagai DATA.
// - Body Markdown template diperlakukan sebagai data TAK TEPERCAYA:
//   `systemInstructions` disimpan apa adanya untuk di-REVIEW sebelum install,
//   TIDAK PERNAH dieksekusi mentah sebagai instruksi sistem.
// - Parser frontmatter ditulis tangan (tidak ada library YAML di package.json;
//   hanya 5 field yang dikenal: name/description/color/emoji/vibe).
// - Clone /tmp hilang saat reset VM — importer HARUS clone ulang tiap sync
//   (by design, bukan bug).
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { masterPrisma } from '@/lib/tenant/master';

const execFileAsync = promisify(execFile);

export const CATALOG_REPO_URL = 'https://github.com/msitarzewski/agency-agents';

/** Atribusi MIT — wajib tampil di katalog (list + detail). */
export const CATALOG_ATTRIBUTION = {
  license: 'MIT',
  holder: 'AgentLand Contributors',
  year: 2025,
  source: CATALOG_REPO_URL,
} as const;

export interface CatalogSyncResult {
  commitHash: string;
  /** Jumlah file .md divisi yang ditemukan di repo (dihitung saat import). */
  totalFiles: number;
  /** Template yang berhasil di-upsert (aktif). */
  imported: number;
  created: number;
  updated: number;
  /** Template yang hilang dari repo → isActive=false (JANGAN dihapus). */
  deactivated: number;
  /** File dilewati (frontmatter tak lengkap / slug duplikat). */
  skipped: number;
  skippedSlugs: string[];
  /** Divisi repo yang ditemukan (id → jumlah template). */
  divisions: Record<string, number>;
  durationMs: number;
}

interface ParsedAgent {
  slug: string;
  name: string;
  category: string;
  description: string;
  expertise: string;
  personality: string;
  systemInstructions: string;
  deliverables: string[];
  workflows: { title: string; summary: string }[];
  suggestedDepartment: string;
  suggestedFloor: number | null;
}

/**
 * Pemetaan divisi repo → department + lantai WOORK (studi §4 + desain Fase 4).
 * - L2 Technology & Product: engineering, design, product, testing, security.
 * - L1 Business & Operations: marketing, sales, support.
 * - L3 Executive & Management: project-management (+ specialized eksekutif).
 * - Sisanya (academic, game-dev, gis, healthcare, paid-media, research,
 *   spatial): katalog saja ("Specialized", tanpa lantai default).
 *
 * CATATAN Finance: studi §4 mengusulkan finance → L3, TETAPI keputusan user
 * 2026-11-23 (terkunci) menetapkan Finance SATU ruangan di lantai 1.
 * Template finance memakai suggestedFloor 1 agar konsisten dengan
 * Department "Finance" yang sudah ada di L1. Bila keputusan berubah,
 * ubah pemetaan ini + Department-nya bersamaan.
 */
const DIVISION_PLACEMENT: Record<string, { department: string; floor: number | null }> = {
  engineering: { department: 'Engineering', floor: 2 },
  design: { department: 'UI/UX Design', floor: 2 },
  product: { department: 'Product Management', floor: 2 },
  testing: { department: 'Quality Assurance', floor: 2 },
  security: { department: 'DevOps & Infrastructure', floor: 2 },
  marketing: { department: 'Marketing', floor: 1 },
  sales: { department: 'Sales', floor: 1 },
  support: { department: 'Customer Service', floor: 1 },
  finance: { department: 'Finance', floor: 1 },
  'project-management': { department: 'Project Management', floor: 3 },
};

const SPECIALIZED_EXEC_KEYWORDS =
  /(cfo|chief-financial|chief-of-staff|chief-of-|legal|strateg|business|executive|\bceo\b|\bcoo\b)/;
const SPECIALIZED_CS_KEYWORDS = /(customer-service|customer|support|helpdesk)/;
const SPECIALIZED_HR_KEYWORDS = /(hr|human-resources|onboarding|recruit|talent)/;
const SPECIALIZED_OPS_KEYWORDS = /(operations|office|supply-chain|procurement|admin)/;

function placementFor(category: string, slug: string, name: string): { department: string; floor: number | null } {
  const direct = DIVISION_PLACEMENT[category];
  if (direct) return direct;
  if (category === 'specialized') {
    const hay = `${slug} ${name}`.toLowerCase();
    if (SPECIALIZED_EXEC_KEYWORDS.test(hay)) return { department: 'Executive', floor: 3 };
    if (SPECIALIZED_CS_KEYWORDS.test(hay)) return { department: 'Customer Service', floor: 1 };
    if (SPECIALIZED_HR_KEYWORDS.test(hay)) return { department: 'HR', floor: 1 };
    if (SPECIALIZED_OPS_KEYWORDS.test(hay)) return { department: 'Operations', floor: 1 };
  }
  return { department: 'Specialized', floor: null };
}

/** Parse frontmatter `--- ... ---` tulisan tangan (5 field yang dikenal). */
function parseFrontmatter(raw: string): Record<string, string> | null {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) return null;
  const out: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

/** Bersihkan judul seksi Markdown (hapus emoji + tanda baca depan). */
function cleanHeading(heading: string): string {
  return heading
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Bagi body Markdown menjadi seksi `## ` (judul bersih → isi). */
function splitSections(body: string): { title: string; content: string }[] {
  const parts = body.split(/^##\s+(.+)$/m);
  const sections: { title: string; content: string }[] = [];
  // parts[0] = teks sebelum seksi pertama; lalu pasangan [judul, isi, ...].
  for (let i = 1; i + 1 < parts.length; i += 2) {
    sections.push({ title: cleanHeading(parts[i]), content: parts[i + 1].trim() });
  }
  return sections;
}

/** Ambil judul sub-seksi `### ` di dalam satu seksi (untuk Deliverables). */
function subsectionTitles(content: string): string[] {
  const out: string[] = [];
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^###\s+(.+)$/);
    if (m) out.push(cleanHeading(m[1]));
  }
  return out;
}

function bulletLines(content: string): string[] {
  const out: string[] = [];
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^\s*[-*]\s+(.+)$/);
    if (m && m[1].trim().length > 0) out.push(m[1].trim());
  }
  return out;
}

function firstMeaningfulLine(content: string): string {
  for (const line of content.split(/\r?\n/)) {
    const t = line.trim();
    if (t && !t.startsWith('#') && !t.startsWith('```')) return t.replace(/^[-*]\s+/, '');
  }
  return '';
}

function parseAgentFile(raw: string, slug: string, category: string): ParsedAgent | null {
  const fm = parseFrontmatter(raw);
  if (!fm) return null;
  const name = (fm.name ?? '').trim();
  const description = (fm.description ?? '').trim();
  // Validasi: name + description wajib (SPEC §12: template harus divalidasi).
  if (!name || !description) return null;
  const body = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trim();
  const sections = splitSections(body);
  const titleHas = (s: { title: string }, ...words: string[]) =>
    words.some((w) => s.title.toLowerCase().includes(w));
  // Expertise: "Core Mission" bila ada; fallback "Core Competencies"/"Mission"/
  // "Expertise"/"Capabilities"; terakhir seksi substansial pertama (bukan
  // Identity / Communication Style / Critical Rules — itu bukan keahlian).
  // Sebagian file (mis. CFO) memakai kerangka "Framework", bukan "Mission".
  const mission =
    sections.find((s) => titleHas(s, 'core mission')) ??
    sections.find((s) => titleHas(s, 'core competenc', 'mission', 'expertise', 'capabilit')) ??
    sections.find(
      (s) =>
        !titleHas(s, 'identity', 'communication style', 'critical rules') && s.content.length >= 200,
    );
  // Deliverables: seksi "Deliverables" bila ada; fallback seksi "Output"/
  // "Templates" (judul sub-seksinya = daftar deliverable).
  const deliverablesSection =
    sections.find((s) => titleHas(s, 'deliverab')) ??
    sections.find((s) => titleHas(s, 'output', 'template'));
  let deliverables: string[] = [];
  if (deliverablesSection) {
    deliverables = subsectionTitles(deliverablesSection.content);
    if (deliverables.length === 0) deliverables = bulletLines(deliverablesSection.content);
    if (deliverables.length === 0) {
      const first = firstMeaningfulLine(deliverablesSection.content);
      if (first) deliverables = [first];
    }
  }
  const placement = placementFor(category, slug, name);
  return {
    slug,
    name,
    category,
    description,
    expertise: (mission?.content ?? '').slice(0, 8000),
    personality: (fm.vibe ?? '').trim(),
    systemInstructions: body,
    deliverables,
    // Garis besar alur kerja template: judul + ringkasan tiap seksi `## `.
    // Pemetaan strategy/runbooks.json (roster tim) menyusul saat orkestrasi §16.
    workflows: sections.map((s) => ({ title: s.title, summary: firstMeaningfulLine(s.content).slice(0, 300) })),
    suggestedDepartment: placement.department,
    suggestedFloor: placement.floor,
  };
}

/** Kumpulkan semua file .md di bawah satu direktori divisi (rekursif —
// game-development punya subdirektori engine). */
async function collectMdFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await collectMdFiles(p)));
    else if (e.isFile() && e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

/**
 * Sinkronkan katalog template dari repo agency-agents ke master DB.
 * Clone dangkal ke /tmp, parse sebagai data, upsert by slug, nonaktifkan
 * template yang hilang dari repo, lalu hapus clone. TIDAK PERNAH menjalankan
 * skrip repo dan TIDAK PERNAH menyalin file repo ke repo WOORK.
 */
export async function syncAgentCatalog(): Promise<CatalogSyncResult> {
  const startedAt = Date.now();
  const workdir = await mkdtemp(join(tmpdir(), 'agency-agents-'));
  try {
    await execFileAsync('git', ['clone', '--depth', '1', CATALOG_REPO_URL, workdir], {
      timeout: 120_000,
    });
    const { stdout: headOut } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
      cwd: workdir,
      timeout: 15_000,
    });
    const commitHash = headOut.trim();

    const divisionsRaw = await readFile(join(workdir, 'divisions.json'), 'utf-8');
    const divisionsJson = JSON.parse(divisionsRaw) as {
      divisions: Record<string, { label: string; icon: string; color: string }>;
    };
    const divisionIds = Object.keys(divisionsJson.divisions ?? {});
    if (divisionIds.length === 0) throw new Error('divisions.json tidak memuat divisi.');

    const parsed: ParsedAgent[] = [];
    const skippedSlugs: string[] = [];
    const seenSlugs = new Set<string>();
    const divisionsCount: Record<string, number> = {};
    let totalFiles = 0;

    for (const division of divisionIds) {
      const files = await collectMdFiles(join(workdir, division));
      divisionsCount[division] = 0;
      for (const file of files) {
        totalFiles += 1;
        const slug = file.split('/').pop()!.replace(/\.md$/, '');
        if (seenSlugs.has(slug)) {
          skippedSlugs.push(slug);
          continue;
        }
        seenSlugs.add(slug);
        const raw = await readFile(file, 'utf-8');
        const agent = parseAgentFile(raw, slug, division);
        if (!agent) {
          skippedSlugs.push(slug);
          continue;
        }
        parsed.push(agent);
        divisionsCount[division] += 1;
      }
    }

    const existing = await masterPrisma.agentTemplate.findMany({ select: { slug: true } });
    const existingSlugs = new Set(existing.map((t) => t.slug));
    let created = 0;
    let updated = 0;
    for (const a of parsed) {
      const isNew = !existingSlugs.has(a.slug);
      await masterPrisma.agentTemplate.upsert({
        where: { slug: a.slug },
        create: {
          slug: a.slug,
          name: a.name,
          category: a.category,
          description: a.description,
          expertise: a.expertise,
          personality: a.personality,
          systemInstructions: a.systemInstructions,
          deliverables: JSON.stringify(a.deliverables),
          workflows: JSON.stringify(a.workflows),
          requiredTools: null,
          suggestedDepartment: a.suggestedDepartment,
          suggestedFloor: a.suggestedFloor,
          templateVersion: commitHash,
          isActive: true,
        },
        update: {
          name: a.name,
          category: a.category,
          description: a.description,
          expertise: a.expertise,
          personality: a.personality,
          systemInstructions: a.systemInstructions,
          deliverables: JSON.stringify(a.deliverables),
          workflows: JSON.stringify(a.workflows),
          suggestedDepartment: a.suggestedDepartment,
          suggestedFloor: a.suggestedFloor,
          templateVersion: commitHash,
          isActive: true,
        },
      });
      if (isNew) created += 1;
      else updated += 1;
    }

    // Template yang hilang dari repo → nonaktif (JANGAN dihapus: instance
    // yang sudah terpasang harus tetap jalan).
    const importedSlugs = new Set(parsed.map((a) => a.slug));
    const gone = [...existingSlugs].filter((s) => !importedSlugs.has(s));
    let deactivated = 0;
    if (gone.length > 0) {
      const res = await masterPrisma.agentTemplate.updateMany({
        where: { slug: { in: gone }, isActive: true },
        data: { isActive: false },
      });
      deactivated = res.count;
    }

    return {
      commitHash,
      totalFiles,
      imported: parsed.length,
      created,
      updated,
      deactivated,
      skipped: skippedSlugs.length,
      skippedSlugs: skippedSlugs.slice(0, 50),
      divisions: divisionsCount,
      durationMs: Date.now() - startedAt,
    };
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
}
