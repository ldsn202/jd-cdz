#!/bin/bash
# POSIX entry kept for manual use; the single implementation lives in setup-parsers.mjs.
set -euo pipefail
cd "$(dirname "$0")/.."
exec node scripts/setup-parsers.mjs
