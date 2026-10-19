#!/usr/bin/env bash
# The quote engine runs in two places: the app (lib/quote.ts) and the edge
# function (supabase/functions/_shared/quote.ts). They MUST agree, or the
# params hash the client sends will never match the one the server stored.
#
# One canonical file, copied. `--check` fails if they have drifted.
set -euo pipefail
SRC="lib/quote.ts"
DST="supabase/functions/_shared/quote.ts"
HEADER='// GENERATED from lib/quote.ts by scripts/sync-quote.sh. Do not edit.
// The client and the server must compute the same params hash.
'

build() { printf '%s\n' "$HEADER"; sed 's|from "./types"|from "./types.ts"|' "$SRC"; }

if [ "${1:-}" = "--check" ]; then
  if ! diff -q <(build) "$DST" >/dev/null 2>&1; then
    echo "quote engine has drifted: run scripts/sync-quote.sh" >&2
    exit 1
  fi
  echo "quote engine in sync"
else
  build > "$DST"
  sed 's|from "./quote"|from "./quote.ts"|; s|from "./catalogue"|from "./catalogue.ts"|' \
    lib/types.ts > supabase/functions/_shared/types.ts
  echo "synced $SRC -> $DST"
fi
