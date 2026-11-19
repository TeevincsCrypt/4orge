#!/usr/bin/env bash
# Apply the Supabase migration to a throw-away local Postgres and verify RLS.
set -euo pipefail
cd "$(dirname "$0")/../.."
PGBIN=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | tail -1)
DATA=$(mktemp -d)
trap 'su postgres -c "$PGBIN/pg_ctl -D $DATA stop -m fast" >/dev/null 2>&1 || true; rm -rf "$DATA"' EXIT
chown postgres "$DATA"
su postgres -c "$PGBIN/initdb -D $DATA -A trust" >/dev/null
su postgres -c "$PGBIN/pg_ctl -D $DATA -o '-p 5499 -k /tmp' -l $DATA/log start -w" >/dev/null
su postgres -c "psql -h /tmp -p 5499 -v ON_ERROR_STOP=1 -q -f tests/sql/rls-check.sql postgres"
