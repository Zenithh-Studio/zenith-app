#!/usr/bin/env bash
set -euo pipefail
# Run locally AFTER authenticating the GitHub CLI. Preserves all modular commits.
# Usage: bash scripts/publish-github.sh [owner/repo]
cd "$(dirname "$0")/.."
command -v gh >/dev/null || { echo 'Install GitHub CLI: https://cli.github.com/'; exit 1; }
command -v git >/dev/null || { echo 'Git is required'; exit 1; }
gh auth status >/dev/null || { echo 'Please run: gh auth login'; exit 1; }
REPO="${1:-$(gh api user --jq '.login')/znith-desktop}"
if git remote get-url origin >/dev/null 2>&1; then
  echo 'Remote origin already exists. Refusing to overwrite it.'
  exit 1
fi
git branch -M main
# Private by default; use GitHub settings to change visibility later.
gh repo create "$REPO" --private --source . --remote origin --push
printf 'Published %s with %s commits.\n' "$REPO" "$(git rev-list --count HEAD)"
