#!/usr/bin/env bash
# `claude plugin eval --scaffold` runs this with no arguments, from the run's working directory.
set -eu
bash "$(dirname "$0")/files/make-project.sh" "$(pwd)"
