# Cara Menjalankan WOORK SaaS di Laptop (Lokal)

Panduan singkat untuk menjalankan website WOORK SaaS di laptop sendiri.

## Yang dibutuhkan

1. **Node.js 20 LTS** — unduh di https://nodejs.org (pilih versi LTS)
2. **Docker Desktop** — unduh di https://www.docker.com/products/docker-desktop
   (untuk database PostgreSQL; alternatif: install PostgreSQL langsung)

Cek sudah terinstall:

```bash
node --version   # harusnya v20.x
docker --version
```

## Langkah-langkah

### 1. Buka folder project

Extract file zip ini, lalu buka terminal di dalam folder `woork-saas`.

### 2. Install dependency

```bash
npm install
```

(Tunggu sampai selesai, beberapa menit.)

### 3. Jalankan database PostgreSQL

```bash
docker run -d --name woork-postgres \
  -e POSTGRES_USER=woo \
  -e POSTGRES_PASSWORD=woo \
  -e POSTGRES_DB=woork_saas \
  -p 5432:5432 postgres:16-alpine
```

### 4. Buat file `.env`

```bash
cp .env.example .env
```

Lalu edit `.env` dan pastikan isinya seperti ini untuk lokal:

```
DATABASE_URL="postgresql://woo:woo@localhost:5432/woork_saas?schema=public"
AUTH_SECRET="ganti-dengan-string-acak-panjang"
NEXTAUTH_URL="http://localhost:3000"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

Untuk `AUTH_SECRET`, buat string acak dengan perintah:

```bash
openssl rand -base64 32
```

> Bagian `META_APP_ID` / `META_APP_SECRET` boleh dikosongkan — hanya
> dibutuhkan kalau mau coba login Facebook/Instagram.

### 5. Migrasi database

```bash
npx prisma migrate deploy
npx tsx prisma/sync-hr-permissions.ts
npx tsx prisma/sync-rbac.ts
```

> Dua perintah terakhir hanya perlu sekali — menyinkronkan katalog permission
> (modul HR, lalu seluruh role & permission sistem RBAC) ke database yang sudah
> ada. Aman dijalankan berulang.

> **Administrator Pusat**: setelah seed, jadikan satu akun sebagai Administrator
> Pusat agar bisa mengelola kantor. Contoh via database:
> `UPDATE "User" SET "isSuperAdmin" = true WHERE email = 'admin@woork.id';`
> Lalu login dengan akun tersebut dan buka menu **Administrator Pusat** di sidebar.

### 6. Isi data demo

```bash
npm run db:seed
```

### 7. Jalankan website

```bash
npm run dev
```

Buka di browser: **http://localhost:3000**

Login demo:

| Email | Password |
|---|---|
| admin@woork.id | password123 |
| supervisor@woork.id | password123 |
| agent@woork.id | password123 |

## Catatan

- **Kantor Virtual** ada di menu sidebar kiri → "Kantor Virtual".
- **WhatsApp**: sesi WA tidak ikut terbawa dalam zip. Untuk menghubungkan
  WhatsApp, buka menu **Saluran** lalu scan QR seperti biasa.
- Kalau port 3000 sudah dipakai aplikasi lain, jalankan dengan
  `npx next dev -p 3001` dan sesuaikan URL di `.env`.
- Untuk menghentikan: tekan `Ctrl+C` di terminal.
