#!/usr/bin/env bash
# Backup database WOORK SaaS (pg_dump) — dipanggil job backup GitHub harian.
# Output: database/woork_saas-YYYY-MM-DD.sql.gz + database/woork_saas-latest.sql.gz
# Rotasi: file bertanggal lebih dari 7 hari dihapus (latest selalu dipertahankan).
# Keluar non-zero bila dump gagal / tidak valid — JANGAN commit file rusak.
set -u
APP_DIR="/home/hatch/workspace/woork-saas"
DB_DIR="$APP_DIR/database"
DATE=$(date +%Y-%m-%d)
OUT="$DB_DIR/woork_saas-$DATE.sql.gz"
LATEST="$DB_DIR/woork_saas-latest.sql.gz"

# --- 1. Pastikan pg_dump tersedia (VM replacement menghapus /usr/bin) ---
ensure_pg_dump() {
  command -v pg_dump >/dev/null 2>&1 && return 0
  echo "pg_dump hilang — instal ulang postgresql-client-18 via PGDG..." >&2
  if [ ! -f /etc/apt/sources.list.d/pgdg.list ]; then
    curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/keyrings/postgresql.gpg \
      && chmod 644 /usr/share/keyrings/postgresql.gpg \
      && echo "deb [signed-by=/usr/share/keyrings/postgresql.gpg] http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
      || return 1
  fi
  apt-get update -o Dir::Etc::sourcelist=/etc/apt/sources.list.d/pgdg.list -o Dir::Etc::sourceparts=/dev/null -o APT::Get::List-Cleanup=0 -qq \
    && apt-get install -y -qq postgresql-client-18 \
    || return 1
  command -v pg_dump >/dev/null 2>&1
}
ensure_pg_dump || { echo "GAGAL: pg_dump tidak tersedia dan instalasi gagal." >&2; exit 1; }

# --- 2. Dump (DATABASE_URL dari .env, buang ?schema=public) ---
mkdir -p "$DB_DIR"
DB_URL=$(grep '^DATABASE_URL=' "$APP_DIR/.env" | cut -d= -f2- | tr -d '"' | sed 's/?[^?]*$//')
[ -n "$DB_URL" ] || { echo "GAGAL: DATABASE_URL tidak ditemukan di .env." >&2; exit 1; }
pg_dump "$DB_URL" --format=plain --no-owner --no-privileges 2>/tmp/db-backup-pgdump.err | gzip -6 > "$OUT"
DUMP_STATUS=${PIPESTATUS[0]}
if [ "$DUMP_STATUS" -ne 0 ]; then
  echo "GAGAL: pg_dump exit $DUMP_STATUS:" >&2
  tail -5 /tmp/db-backup-pgdump.err >&2
  rm -f "$OUT"
  exit 1
fi

# --- 3. Verifikasi dump ---
gzip -t "$OUT" || { echo "GAGAL: file gzip rusak." >&2; rm -f "$OUT"; exit 1; }
SIZE=$(stat -c%s "$OUT")
[ "$SIZE" -gt 100000 ] || { echo "GAGAL: dump terlalu kecil ($SIZE byte) — curiga kosong." >&2; rm -f "$OUT"; exit 1; }
COPY_TABLES=$(gzip -dc "$OUT" | grep -c '^COPY ')
[ "$COPY_TABLES" -ge 60 ] || { echo "GAGAL: hanya $COPY_TABLES tabel ter-dump (harap >= 60)." >&2; rm -f "$OUT"; exit 1; }
for T in Organization User Membership EsignDocument; do
  gzip -dc "$OUT" | grep -q "^COPY public.\"$T\" " || { echo "GAGAL: tabel $T tidak ada di dump." >&2; rm -f "$OUT"; exit 1; }
done

# --- 4. Latest + rotasi 7 hari ---
cp "$OUT" "$LATEST"
find "$DB_DIR" -name 'woork_saas-*.sql.gz' -type f -mtime +7 -delete

echo "OK: $OUT ($(numfmt --to=iec-i --suffix=B "$SIZE" 2>/dev/null || echo "$SIZE byte"), $COPY_TABLES tabel)"
