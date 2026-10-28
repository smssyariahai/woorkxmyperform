# Backup GitHub

Backup otomatis kode WOORK SaaS ke repo `smssyariahai/woork-saas` (branch `main`).

- **Jadwal:** setiap hari pukul 00.00 WIB.
- **Jalur:** SSH (key khusus akun smssyariahai).
- **Isi backup:** seluruh file yang di-track git, termasuk aset biner (logo, ikon, foto kantor, video).
- **Tidak ikut backup (oleh `.gitignore`):** `.env`, `.wa-sessions/` (secret & sesi WhatsApp),
  `node_modules/`, `.next/` (bisa dibuat ulang lewat install + build), dan `uploads/` (data pelanggan).
- **Perilaku:** bila tidak ada perubahan kode, tidak ada push dan tidak ada commit kosong.
  Bila push ditolak karena ada perubahan dari pihak lain, job berhenti dan melapor —
  tidak pernah memakai `--force`.
