#!/bin/sh
# PersonalOS database backup (SPEC §5): pg_dump -> ../../backups/YYYY-MM-DD.sql.gz, newest 8 kept.
#   sh dashboard/launcher/backup.sh
# Reads SUPABASE_DB_URL from the root .env.local (the single line is parsed, the file is never sourced) and never prints it.
# The dump holds the auth schema, so backups/ is mode 700 and every file 600; this is checked and fixed on every run.
# Test hooks: BACKUP_ENV_FILE, BACKUP_DIR, PG_DUMP (path to a pg_dump), BACKUP_DATE (YYYY-MM-DD).
HERE="$(cd "$(dirname "$0")" && pwd)" || exit 1
ROOT="$(cd "$HERE/../.." && pwd)" || exit 1
ENV_FILE="${BACKUP_ENV_FILE:-$ROOT/.env.local}"
DIR="${BACKUP_DIR:-$ROOT/backups}"
KEEP=8

# launchd gives a minimal PATH.
PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
export PATH
umask 077

log() { printf '%s [backup] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }
die() { log "FAILED: $*"; exit 1; }

# 1. The folder and its files are private. Fix and say so, every run, before anything else can fail.
mkdir -p "$DIR" || die "cannot create $DIR"
fix_mode() { # path wanted
  cur="$(stat -f '%Lp' "$1" 2>/dev/null || stat -c '%a' "$1" 2>/dev/null)"
  if [ "$cur" != "$2" ]; then chmod "$2" "$1" && log "permissions on $(basename "$1") were $cur, set to $2"; fi
}
fix_mode "$DIR" 700
for f in "$DIR"/*.sql.gz; do [ -f "$f" ] && fix_mode "$f" 600; done

# 2. The connection string.
[ -f "$ENV_FILE" ] || die "$ENV_FILE not found. Add SUPABASE_DB_URL=... there (Supabase > Project Settings > Database > Connection string)."
URL="$(grep -E '^[[:space:]]*SUPABASE_DB_URL=' "$ENV_FILE" | tail -n 1 | sed -e 's/^[^=]*=//' -e 's/^"//' -e 's/"[[:space:]]*$//' -e "s/^'//" -e "s/'[[:space:]]*\$//")"
[ -n "$URL" ] || die "SUPABASE_DB_URL is not set in $ENV_FILE."
export SUPABASE_DB_URL="$URL"

# Replace the connection string (or the password in it) in anything we print.
redact() { awk 'BEGIN { u = ENVIRON["SUPABASE_DB_URL"] } { while (u != "" && (i = index($0, u)) > 0) $0 = substr($0, 1, i - 1) "<SUPABASE_DB_URL>" substr($0, i + length(u)); print }'; }

# 3. The newest installed pg_dump (a dump needs pg_dump at least as new as the server).
pick_pg_dump() {
  [ -n "$PG_DUMP" ] && { echo "$PG_DUMP"; return; }
  best=""; bestv=0
  for c in /opt/homebrew/opt/postgresql@*/bin/pg_dump /usr/local/opt/postgresql@*/bin/pg_dump /opt/homebrew/bin/pg_dump /usr/local/bin/pg_dump "$(command -v pg_dump 2>/dev/null)"; do
    [ -x "$c" ] || continue
    v="$("$c" --version 2>/dev/null | sed -n 's/.* \([0-9][0-9]*\)\..*/\1/p; s/.* \([0-9][0-9]*\)$/\1/p' | head -n 1)"
    [ -n "$v" ] || continue
    if [ "$v" -gt "$bestv" ]; then best="$c"; bestv="$v"; fi
  done
  echo "$best"
}
PGD="$(pick_pg_dump)"
[ -n "$PGD" ] && [ -x "$PGD" ] || die "pg_dump was not found. Run: brew install postgresql@17"

DATE="${BACKUP_DATE:-$(date +%Y-%m-%d)}"
FINAL="$DIR/$DATE.sql.gz"
TMP_SQL="$DIR/.$DATE.sql.tmp"
TMP_GZ="$DIR/.$DATE.sql.gz.tmp"
ERR="$DIR/.$DATE.err.tmp"
cleanup() { rm -f "$TMP_SQL" "$TMP_GZ" "$ERR"; }
trap cleanup EXIT

dump() { # extra pg_dump args
  rm -f "$TMP_SQL"
  "$PGD" "$@" --no-owner --no-privileges --file "$TMP_SQL" "$SUPABASE_DB_URL" 2>"$ERR"
}

log "dumping with $("$PGD" --version)"
if ! dump; then
  if grep -qi 'server version mismatch' "$ERR"; then
    sv="$(sed -n 's/.*server version: \([0-9][0-9]*\).*/\1/p' "$ERR" | head -n 1)"
    redact <"$ERR" | sed 's/^/  /'
    die "the newest pg_dump here is too old for the server. Run: brew install postgresql@${sv:-17}"
  fi
  if grep -qi 'permission denied' "$ERR"; then
    redact <"$ERR" | sed 's/^/  /'
    log "FALLBACK: permission errors on Supabase's internal schemas; dumping only --schema=public --schema=auth --schema=storage"
    dump --schema=public --schema=auth --schema=storage || { redact <"$ERR" | sed 's/^/  /'; die "pg_dump failed even with the schema fallback."; }
  else
    redact <"$ERR" | sed 's/^/  /'
    die "pg_dump failed."
  fi
fi

# 4. Compress, verify, then put it in place in one step: a failed run never leaves a partial or damaged backup.
[ -s "$TMP_SQL" ] || die "the dump is empty."
gzip -c "$TMP_SQL" >"$TMP_GZ" || die "gzip failed."
gzip -t "$TMP_GZ" || die "the compressed file did not verify."
[ -s "$TMP_GZ" ] || die "the compressed file is empty."
chmod 600 "$TMP_GZ"
mv -f "$TMP_GZ" "$FINAL" || die "could not write $FINAL"
log "wrote $FINAL ($(wc -c <"$FINAL" | tr -d ' ') bytes)"

# 5. Keep the newest $KEEP. Only names this script writes are ever deleted.
ls "$DIR" | grep -E '^[0-9]{4}-[0-9]{2}-[0-9]{2}\.sql\.gz$' | sort -r | tail -n +$((KEEP + 1)) | while read -r old; do
  rm -f "$DIR/$old" && log "removed old backup $old"
done
log "done"
