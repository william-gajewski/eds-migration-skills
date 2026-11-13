#!/usr/bin/env bash
# Builds the fictional workspace: each client's intake folder (work plan and roster) next to the
# project's git repository, so the skill can tell that intake/ is outside the repository.
set -eu
root=${1:?workspace root required}
inputs="$(dirname "$0")/inputs"

for client in atlas beacon; do
  mkdir -p "$root/projects/$client/intake"
  git init -q "$root/projects/$client/repository"
  cp "$inputs/$client-work-plan.md" "$root/projects/$client/intake/$client-work-plan.md"
  cp "$inputs/$client-roster.md" "$root/projects/$client/intake/$client-roster.md"
done
