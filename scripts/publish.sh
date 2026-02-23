#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

target_branch="${1:-gh-pages}"
target_remote="${2:-origin}"

node scripts/build.js

tmp_index="$(mktemp)"
trap 'rm -f "$tmp_index"' EXIT

export GIT_INDEX_FILE="$tmp_index"
git read-tree --empty
git add --all --force dist

tree_id="$(git write-tree --prefix=dist)"
commit_message="Deploy $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
commit_id="$(printf '%s\n' "$commit_message" | git commit-tree "$tree_id")"

git push --force "$target_remote" "$commit_id:refs/heads/$target_branch"

echo "Published dist/ to ${target_remote}/${target_branch} (force-updated)."
