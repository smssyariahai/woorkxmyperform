#!/bin/bash
# Backup database master WOORK (woork_master) — standalone, TIDAK di-wire ke cron.
# Dipakai manual / oleh provisioning engine saat backup registry master.
# Dump ke file sementara, verifikasi, lalu pindah atomik ke
# woork_master-latest.sql. Bila DB sedang down atau dump tidak lengkap,
# keluar dengan exit non-zero + pesan, dan file lama TIDAK ditimpa.
set -u
DOCS="$HOME/workspace/woorkxmyperform-docs"
APP="$HOME/workspace/woorkxmyperform"
LATEST="$DOCS/db-restore/woork_master-latest.sql"
TMP="/tmp/woork-master-dump-backup.sql"
DB_URL=$(python3 -c "print([l.split('=',1)[1].strip().strip('\"') for l in open('$APP/.env') if l.startswith('MASTER_DATABASE_URL=')][0])" 2>/dev/null)
[ -n "${DB_URL:-}" ] || { echo "backup-master: MASTER_DATABASE_URL tidak ditemukan di .env" >&2; exit 1; }
pg_dump "$DB_URL" -f "$TMP" 2>/dev/null || { echo "backup-master: pg_dump gagal (database down?)" >&2; exit 1; }
grep -q "PostgreSQL database dump complete" "$TMP" || { echo "backup-master: footer dump tidak lengkap" >&2; exit 1; }
grep -q '^COPY public."Tenant"' "$TMP" || { echo "backup-master: tabel Tenant tidak ada di dump" >&2; exit 1; }
TABLES=$(grep -c "CREATE TABLE public" "$TMP")
[ "$TABLES" -ge 7 ] || { echo "backup-master: hanya $TABLES tabel di dump (minimal 7)" >&2; exit 1; }
chmod 600 "$TMP"
mv "$TMP" "$LATEST"
echo "backup-master: OK ($TABLES tabel) -> $LATEST"
