#!/usr/bin/env bash
# Proves backup.sh + docs/RESTORE.md end to end on a THROWAWAY local Postgres (temp data dir, unix socket, deleted afterwards):
# build a database with the Supabase stand-ins and os_core.sql, back it up with the real backup.sh and a real pg_dump,
# restore the file into a second database with the exact steps from RESTORE.md, and compare every table's row count.
# Never touches Supabase or any other database on this Mac.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /opt/homebrew/opt/postgresql@1[5-9]/bin /usr/lib/postgresql/*/bin 2>/dev/null | tail -1 || true)}"
PORT="${PGPORT:-54332}"
TMP="$(mktemp -d)"
export PATH="$PGBIN:$PATH" PGOPTIONS="-c client_min_messages=warning"
cleanup() { pg_ctl -D "$TMP/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT

initdb -D "$TMP/data" -U postgres --auth=trust >/dev/null
pg_ctl -D "$TMP/data" -o "-p $PORT -k $TMP -c listen_addresses=''" -l "$TMP/pg.log" -w start >/dev/null
psql_db() { db="$1"; shift; psql -h "$TMP" -p "$PORT" -U postgres -d "$db" -v ON_ERROR_STOP=1 -q "$@"; }

echo "━━ building a source database (stand-ins + os_core.sql + some rows)"
createdb -h "$TMP" -p "$PORT" -U postgres src
psql_db src -f "$HERE/stand-ins.sql" -f "$HERE/fixtures.sql" -f "$ROOT/supabase/os_core.sql"
psql_db src -c "insert into auth.users(id) values ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222');" \
            -c "create table public.restore_probe(id int primary key, note text); insert into public.restore_probe select g, 'row ' || g from generate_series(1, 250) g;"

echo "━━ backup.sh with the real pg_dump"
ENVF="$TMP/.env.local"; BK="$TMP/backups"
# libpq URI with the socket directory percent-encoded as the host.
echo "SUPABASE_DB_URL=postgresql://postgres@$(printf '%s' "$TMP" | sed 's#/#%2F#g'):$PORT/src" > "$ENVF"
BACKUP_ENV_FILE="$ENVF" BACKUP_DIR="$BK" PG_DUMP="$PGBIN/pg_dump" BACKUP_DATE=2026-10-25 sh "$ROOT/dashboard/launcher/backup.sh"
FILE="$BK/2026-10-25.sql.gz"
[ -s "$FILE" ] || { echo "FAILED: no backup file"; exit 1; }
[ "$(stat -f '%Lp' "$BK" 2>/dev/null || stat -c '%a' "$BK")" = 700 ] || { echo "FAILED: backups/ is not 700"; exit 1; }
[ "$(stat -f '%Lp' "$FILE" 2>/dev/null || stat -c '%a' "$FILE")" = 600 ] || { echo "FAILED: backup file is not 600"; exit 1; }
echo "PASSED: backup file written, folder 700, file 600"

echo "━━ restoring with the steps from docs/RESTORE.md"
# RESTORE.md step: the roles the dump's policies refer to (a plain Postgres has none of Supabase's roles).
psql_db postgres -c "do \$\$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end \$\$;"
createdb -h "$TMP" -p "$PORT" -U postgres restored
gunzip -c "$FILE" | psql -h "$TMP" -p "$PORT" -U postgres -d restored -v ON_ERROR_STOP=1 -q -o /dev/null

echo "━━ comparing"
counts() {
  psql_db "$1" -At -c "select table_schema || '.' || table_name from information_schema.tables where table_type = 'BASE TABLE' and table_schema in ('public','auth') order by 1" |
  while read -r t; do printf '%s %s\n' "$t" "$(psql_db "$1" -At -c "select count(*) from $t")"; done
}
counts src > "$TMP/src.txt"; counts restored > "$TMP/restored.txt"
diff "$TMP/src.txt" "$TMP/restored.txt" || { echo "FAILED: row counts differ"; exit 1; }
grep -q 'public.restore_probe 250' "$TMP/restored.txt" && grep -q 'auth.users 2' "$TMP/restored.txt" || { echo "FAILED: probe rows missing"; exit 1; }
views_src="$(psql_db src -At -c "select count(*) from information_schema.views where table_schema = 'public' and table_name like 'os\_%'")"
views_dst="$(psql_db restored -At -c "select count(*) from information_schema.views where table_schema = 'public' and table_name like 'os\_%'")"
[ "$views_src" = "$views_dst" ] && [ "$views_src" -gt 0 ] || { echo "FAILED: os_ views differ ($views_src vs $views_dst)"; exit 1; }
echo "PASSED: restored database matches ($(wc -l < "$TMP/restored.txt" | tr -d ' ') tables, $views_dst os_ views)"
cat "$TMP/restored.txt"
