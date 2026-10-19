#!/usr/bin/env bash
# Runs the real migrations into a throwaway database and executes both SQL
# suites. Needs only a local Postgres 15+; no Docker, no Supabase running.
#
#   ./scripts/test-db.sh
set -euo pipefail
DB="${1:-bc_test}"

dropdb --if-exists "$DB"
createdb "$DB"
psql -q -d "$DB" -v ON_ERROR_STOP=1 -f supabase/tests/harness.sql

# the cron migration needs pg_cron and pg_net, which a plain local Postgres
# does not have. It is applied on the real project, not in this harness.
for f in supabase/migrations/*.sql; do
  case "$f" in *_cron.sql) continue;; esac
  printf '  migrate %-44s' "$(basename "$f")"
  if psql -q -d "$DB" -v ON_ERROR_STOP=1 -f "$f" >/tmp/mig.log 2>&1; then
    echo "ok"
  else echo "FAILED"; tail -5 /tmp/mig.log; exit 1; fi
done

echo
echo "RLS isolation suite"
psql -d "$DB" -f supabase/tests/rls.test.sql > /tmp/rls.log 2>&1 || true
grep -E "PASS:|FAIL" /tmp/rls.log | sed 's/^.*NOTICE:  /  /'
LEAKS=$(grep -cE "^ *[1-9][0-9]* *$" <(grep -A2 "sees_other" /tmp/rls.log) || true)
echo "  cross-user rows visible: $(grep -A2 'sees_other' /tmp/rls.log | grep -cE '^ +[1-9]' || echo 0)"

dropdb --if-exists "${DB}_l"; createdb "${DB}_l"
psql -q -d "${DB}_l" -v ON_ERROR_STOP=1 -f supabase/tests/harness.sql
for f in supabase/migrations/*.sql; do
  case "$f" in *_cron.sql) continue;; esac
  psql -q -d "${DB}_l" -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>&1
done
echo
echo "Ledger behaviour suite"
psql -d "${DB}_l" -f supabase/tests/ledger.test.sql > /tmp/led.log 2>&1 || true
grep -E "PASS:|FAIL" /tmp/led.log | sed 's/^.*NOTICE:  /  /'
DRIFT=$(psql -d "${DB}_l" -t -A -c "select count(*) from reconcile_ledger();")
echo "  ledger drift rows: $DRIFT"

echo
if grep -q "FAIL" /tmp/rls.log /tmp/led.log || [ "$DRIFT" != "0" ]; then
  echo "SOME CHECKS FAILED"; exit 1
fi
echo "all database checks passed"
dropdb --if-exists "$DB"; dropdb --if-exists "${DB}_l"
