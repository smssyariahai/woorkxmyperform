# WOORK — Omnichannel CRM & Customer Management Platform

Platform CRM omnichannel profesional untuk mengelola WhatsApp, Instagram, Facebook,
pelanggan, lead, follow up, broadcast, bot automation, tim, dan audit dalam satu workspace.

**Stack:** Next.js 14 (App Router) · TypeScript · Tailwind CSS · Prisma ORM ·
PostgreSQL · Auth.js (NextAuth v5) · Zod · React Hook Form · Recharts · Lucide Icons

---

## 1. Install dependency

```bash
npm install
```

## 2. Setup PostgreSQL

Buat database PostgreSQL (contoh via Docker):

```bash
docker run -d --name woork-postgres \
  -e POSTGRES_USER=woo -e POSTGRES_PASSWORD=woo \
  -e POSTGRES_DB=woork_saas -p 5432:5432 postgres:16-alpine
```

## 3. Setup environment

```bash
cp .env.example .env
```

Isi `.env`:

| Variable | Keterangan |
|---|---|
| `DATABASE_URL` | Connection string PostgreSQL |
| `AUTH_SECRET` | String acak ≥ 32 karakter (`openssl rand -base64 32`) |
| `NEXTAUTH_URL` | URL publik aplikasi, mis. `http://localhost:3000` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Opsional — untuk login Google |
| `NEXT_PUBLIC_GOOGLE_ENABLED` | `1` untuk menampilkan tombol Google |

## 4. Prisma migrate

```bash
npx prisma migrate dev
```

Untuk production:

```bash
npx prisma migrate deploy
```

## 5. Prisma seed (data demo)

```bash
npm run db:seed
```

Akun demo:

| Email | Password | Role |
|---|---|---|
| admin@woork.id | password123 | Owner |
| supervisor@woork.id | password123 | Supervisor |
| agent@woork.id | password123 | Agent |

## 6. Menjalankan development server

```bash
npm run dev
```

Buka http://localhost:3000

## 7. Build production

```bash
npm run build
npm start
```

---

## Fitur

- **Landing page** + Login / Register / Lupa password / Onboarding 4 langkah
- **Dashboard** — statistik, grafik percakapan, pipeline lead, aktivitas, performa tim
- **Inbox omnichannel** — daftar percakapan, thread chat, panel info pelanggan,
  filter (Semua/Belum dibaca/Woo/Tim), ambil alih percakapan, polling real-time-ready
- **CRM** — tabel pelanggan (search/filter/sort/pagination), detail pelanggan
  3 kolom (profil, timeline, aksi), catatan, follow up, deals
- **Kanban Lead** — drag & drop antar tahap, tersimpan ke PostgreSQL + activity log
- **Bot & Automation** — builder visual (Trigger → Condition → Action), toggle aktif
- **Broadcast** — wizard 6 langkah, kirim campaign, statistik terkirim/dibaca
- **Saluran** — kartu WhatsApp/Instagram/Facebook/Website Chat + webhook URL
- **Audit Log** — seluruh aktivitas penting tercatat di PostgreSQL + filter
- **Tim & Role** — undang anggota, ubah role (Owner/Admin/Supervisor/Agent/Viewer),
  nonaktifkan, hapus — dengan RBAC permission
- **Pengaturan** — workspace, profil, ubah password, sesi aktif
- **Keamanan** — bcrypt hashing, session JWT http-only cookie, validasi Zod,
  multi-tenant (semua query difilter `organizationId`), audit trail

## Struktur

```
app/
  (marketing)/          landing page
  (auth)/               login, register, forgot/reset password
  (dashboard)/          dashboard, inbox, crm, bot, broadcast, channels, audit, settings
  onboarding/           onboarding 4 langkah
  api/                  REST API (customers, conversations, leads, followups,
                        campaigns, channels, audit, team, settings, bot, ...)
components/
  ui/                   design system (button, input, modal, badge, ...)
  layout/               AppShell, Sidebar, Topbar
  inbox/ crm/ bot/ broadcast/ channels/ audit/ settings/
lib/
  auth.ts               NextAuth config (credentials + Google)
  permissions.ts        RBAC roles & permissions
  audit.ts              helper audit log
  ai.ts                 abstraksi AI (mock, siap diganti OpenAI/Gemini)
  realtime.ts           abstraksi real-time (polling, siap diganti WebSocket)
prisma/
  schema.prisma         30+ model
  seed.ts               data demo
```

## Catatan

- Mode WhatsApp default adalah simulasi. Untuk pengiriman asli, hubungkan channel
  via menu **Saluran** dan pasang webhook.
- Layanan AI (`lib/ai.ts`) memakai mock — ganti implementasinya dengan
  OpenAI/Gemini tanpa mengubah UI.
- Real-time memakai polling 8 detik di Inbox — arsitektur siap diganti
  WebSocket via `lib/realtime.ts`.
