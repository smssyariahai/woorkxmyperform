-- Drop foreign key EsignProfile.userId -> User.id (Phase 4, 2026-11-23).
-- EsignProfile adalah penyimpanan global per userId; pengguna tenant hanya
-- ada di master (PlatformUser) + mirror tenant, bukan di User legacy —
-- dengan FK, upsert PIN/tanda tangan pengguna tenant selalu gagal
-- (EsignProfile_userId_fkey). Kolom userId + unique index tetap ada;
-- tidak ada data yang dihapus, hanya constraint yang dilepas.
ALTER TABLE "EsignProfile" DROP CONSTRAINT "EsignProfile_userId_fkey";
