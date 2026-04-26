#!/usr/bin/env bash
# Thin wrapper around validate_diagram.py so the skill can be invoked as
# `bash scripts/validate_diagram.sh <file-or-->`.
#
# Forwards all args to the Python validator. Requires python3 on PATH.

set -u
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec python3 "$here/validate_diagram.py" "$@"
