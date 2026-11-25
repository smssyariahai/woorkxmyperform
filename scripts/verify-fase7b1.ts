// Verifikasi Fase 7b1 — High UI + Admin Configuration.
// Cek statis (baca file, tanpa server): wiring Performance Settings +
// koreksi tafsir High UI + audit 14 submenu §27 (keberadaan file/route).
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = '/home/hatch/workspace/woorkxmyperform'
let pass = 0
let fail = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`PASS  ${name}`) } else { fail++; console.log(`FAIL  ${name} ${detail}`) }
}
const office = readFileSync(join(ROOT, 'components/kantor/Office3D.tsx'), 'utf8')

// --- 1. High UI = auto-hide Wave 16 (SPEC §21), BUKAN tombol Sembunyikan UI
check('High UI: konstanta HIGH_UI_KEY + HIGH_UI_HIDE_MS 3000 ada', office.includes("HIGH_UI_KEY = 'woork.kantorHighUi'") && office.includes('HIGH_UI_HIDE_MS = 3000'))
check('High UI: auto-hide terjadwal dari state highUi', office.includes('if (!highUi || interactingRef.current) return') && office.includes('setTimeout(() => { setControlsVisible(false) }, HIGH_UI_HIDE_MS)'))
check('High UI: tombol 👁 UI toggle highUi', office.includes('onClick={() => setHighUi(!highUi)}'))
check('High UI: komentar tafsir 5a yang salah sudah dikoreksi', !office.includes('tafsir "High UI" §10 sebagai sembunyikan UI') && office.includes('BUKAN "High UI" — High UI adalah mode auto-hide Wave 16'))
check('Hide UI manual tetap ada & terpisah (setUiHidden + Esc)', office.includes('setUiHidden(true)') && office.includes("if (event.key === 'Escape' && uiHidden)"))
check('Hide UI: overlayVisibility membedakan uiHidden vs highUi', office.includes("uiHidden ? 'invisible pointer-events-none opacity-0' : !highUi || controlsVisible"))

// --- 2. Performance Settings: kualitas grafis benar-benar dipakai Canvas
check('Performance: QUALITY_KEY + state quality (tinggi|rendah)', office.includes("QUALITY_KEY = 'woork.kantorQuality'") && office.includes("useState<'tinggi' | 'rendah'>"))
check('Performance: default tinggi, rendah bila localStorage=rendah', office.includes("localStorage.getItem(QUALITY_KEY) === 'rendah' ? 'rendah' : 'tinggi'"))
check('Performance: Canvas shadows dimatikan saat rendah', office.includes("shadows={quality !== 'rendah'}"))
check('Performance: Canvas dpr 1 saat rendah, [1,2] saat tinggi', office.includes("dpr={quality === 'rendah' ? 1 : [1, 2]}"))
check('Performance: tombol toggle ⚡ Kualitas/Ringan ada', office.includes("onClick={() => setQuality(quality === 'rendah' ? 'tinggi' : 'rendah')}"))
check('Performance: tidak ada lagi Canvas shadows/dpr hardcode', !office.includes('<Canvas shadows dpr={[1, 2]}'))

// --- 3. Audit §27: yang ADA harus ada file/route-nya
const exists = (p: string) => existsSync(join(ROOT, p))
check('Audit: Department Management ada', exists('components/office/DepartmentsClient.tsx') && exists('app/(dashboard)/admin-kantor/departments'))
check('Audit: Agent Catalog ada', exists('components/office/CatalogClient.tsx') && exists('app/(dashboard)/admin-kantor/catalog'))
check('Audit: Agent Assignment ada (API assign + install form)', exists('app/api/admin/departments/[id]/agents/route.ts') && readFileSync(join(ROOT, 'app/api/admin/departments/[id]/agents/route.ts'), 'utf8').includes('ASSIGN_AGENT_DEPARTMENT'))
check('Audit: Agent Appearance ada (AgentManager edit avatarColor)', readFileSync(join(ROOT, 'components/kantor/AgentManager.tsx'), 'utf8').includes('avatarColor: form.avatarColor'))
check('Audit: Briefing+Prayer settings ada (panel + API)', exists('app/api/kantor/briefing/settings/route.ts') && exists('app/api/kantor/prayer/settings/route.ts') && readFileSync(join(ROOT, 'components/kantor/KantorActivityPanels.tsx'), 'utf8').includes('Pengaturan Musala'))
check('Audit: Building/Floor/Room/Workstation TIDAK punya model DB (benar tidak dibangun)', !/model (VirtualOffice|Room|Workstation|Building|Floor) /.test(readFileSync(join(ROOT, 'prisma/tenant/schema.prisma'), 'utf8')))
const tenantSchema = readFileSync(join(ROOT, 'prisma/tenant/schema.prisma'), 'utf8')
const agentBlock = tenantSchema.slice(tenantSchema.indexOf('model Agent {'), tenantSchema.indexOf('model Agent {') + 2000)
check('Audit: AI Orchestration TIDAK punya model/field (benar tidak dibangun)', !tenantSchema.includes('model Orchestration') && !/^\s+model\s+String/m.test(agentBlock) && !agentBlock.includes('  model '))
check('Audit: menu admin-kantor TIDAK berisi submenu mati Virtual Office Management', !readFileSync(join(ROOT, 'lib/modular.ts'), 'utf8').includes('Virtual Office Management'))

console.log(`\n${pass} PASS, ${fail} FAIL`)
if (fail > 0) process.exit(1)
