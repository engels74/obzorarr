#!/usr/bin/env bash
set -euo pipefail
bun run test
bun run build
smoke_dir=$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/obzorarr-ci.XXXXXX")
trap 'rm -rf "$smoke_dir"' EXIT
DATABASE_PATH="$smoke_dir/obzorarr-smoke-test.db" bun run smoke:production
