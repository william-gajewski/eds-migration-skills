#!/usr/bin/env bash
set -eu
if [ "${1:-}" != "--scaffold" ]; then
  echo "Usage: $0 --scaffold" >&2
  exit 2
fi
bash "$(dirname "$0")/files/make-project.sh" "$(pwd)"
