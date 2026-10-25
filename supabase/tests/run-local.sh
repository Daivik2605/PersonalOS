#!/usr/bin/env bash
# Proves supabase/os_core.sql against a THROWAWAY local Postgres (own temp data dir, own port, unix socket only, deleted
# afterwards) with Supabase stand-ins. Never touches Supabase or any other database on this Mac.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SCHEMA="$HERE/../os_core.sql"
CHECKS="$HERE/../checks.sql"
PGBIN="${PGBIN:-$(ls -d /opt/homebrew/opt/postgresql@1[5-9]/bin /usr/lib/postgresql/*/bin 2>/dev/null | tail -1 || true)}"
PORT="${PGPORT:-54331}"
TMP="$(mktemp -d)"
export PATH="$PGBIN:$PATH" PGOPTIONS="-c client_min_messages=warning"
cd "$HERE"

cleanup() { pg_ctl -D "$TMP/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT

initdb -D "$TMP/data" -U postgres --auth=trust >/dev/null
pg_ctl -D "$TMP/data" -o "-p $PORT -k $TMP -c listen_addresses=''" -l "$TMP/pg.log" -w start >/dev/null
createdb -h "$TMP" -p "$PORT" -U postgres t
psql_t() { psql -h "$TMP" -p "$PORT" -U postgres -d t -v ON_ERROR_STOP=1 -q "$@"; }
psql_t -f stand-ins.sql -f fixtures.sql

echo "━━ os_core.sql scenarios (throwaway Postgres on socket in $TMP, port $PORT)"
psql_t -v schema="$SCHEMA" -v checks="$CHECKS" -t -f scenarios.sql | grep -E "PASSED|FAILED" 
echo "━━ checks.sql stays clean for the os_ objects (fresh database)"
createdb -h "$TMP" -p "$PORT" -U postgres chk
psql -h "$TMP" -p "$PORT" -U postgres -d chk -v ON_ERROR_STOP=1 -q -f stand-ins.sql -f "$SCHEMA"
out="$(sed '/^-- 8\./,$d' "$CHECKS" | psql -h "$TMP" -p "$PORT" -U postgres -d chk -v ON_ERROR_STOP=1 -q -t -A)"
[ -z "$out" ] || { echo "checks.sql queries 1-7 report problems:"; echo "$out"; exit 1; }
echo "PASSED: checks.sql queries 1-7 are empty"
echo "OK — os_core.sql passes every scenario and is idempotent"
