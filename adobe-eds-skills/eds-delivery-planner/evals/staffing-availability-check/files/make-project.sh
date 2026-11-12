#!/usr/bin/env bash
set -eu
root=${1:?workspace root required}
inputs="$(dirname "$0")/inputs"

mkdir -p "$root/projects/atlas/intake" "$root/projects/atlas/repository"
mkdir -p "$root/projects/beacon/intake" "$root/projects/beacon/repository"
cp "$inputs/atlas-work-plan.md" "$root/projects/atlas/intake/atlas-work-plan.md"
cp "$inputs/atlas-roster.md" "$root/projects/atlas/intake/atlas-roster.md"
cp "$inputs/beacon-work-plan.md" "$root/projects/beacon/intake/beacon-work-plan.md"
cp "$inputs/beacon-roster.md" "$root/projects/beacon/intake/beacon-roster.md"
