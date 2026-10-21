# Atribusi Lisensi — Modul Kantor Virtual

Sebagian konsep dan potongan kode pada modul Kantor Virtual WOORK diadaptasi dari
proyek open-source berikut, sesuai ketentuan lisensinya:

## ruang — 3D virtual office + mission control

- Repository: https://github.com/yugienugraha/ruang
- Lisensi: **MIT License** — Copyright (c) 2026 yugienugraha

Teks lisensi MIT:

> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all
> copies or substantial portions of the Software.

## Bagian yang diadaptasi

- `components/kantor/agent-look.ts` — fungsi hash FNV-1a + palet warna deterministik
  per agent (`hashName`, `agentLook`), diadaptasi dari `src/agents.ts`.
- `components/kantor/Office3D/*` — pola scene Three.js prosedural (karakter blocky
  dengan animasi berbasis status, furnitur prosedural, label terproyeksi, kontrol
  kamera orbit), terinspirasi dari `src/pages/Office3D.tsx`, `src/scene3d/props.tsx`,
  dan `src/office3d-layout.ts`. Ditulis ulang agar kompatibel dengan arsitektur
  WOORK (Next.js 14, React 18, data real per tenant).
- Prinsip "status hanya dari kerja yang teratribusi" diadopsi dari
  `server/mission-control.ts` — tidak ada aktivitas simulasi di WOORK.

Setiap file yang memuat adaptasi langsung mencantumkan komentar atribusi
ke repository di atas.
