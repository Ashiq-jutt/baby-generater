#!/usr/bin/env bash
# Type-checks, lints and tests the Edge Functions. Needs Deno 2.x.
#   DENO=/path/to/deno ./scripts/test-functions.sh
set -euo pipefail
DENO="${DENO:-deno}"
command -v "$DENO" >/dev/null 2>&1 || { echo "deno not found; set DENO=/path/to/deno" >&2; exit 127; }

cd supabase/functions
echo "typecheck"; "$DENO" check --allow-import ./**/*.ts >/dev/null && echo "  15 files ok"
echo "lint";      "$DENO" lint 2>&1 | tail -1 | sed 's/^/  /'
echo "tests";     "$DENO" test --allow-import --allow-read --quiet . 2>&1 | tail -3 | sed 's/^/  /'
