#!/bin/bash
# PostToolUse hook: auto-fix lint and formatting on files Claude writes/edits.
# Receives tool use JSON on stdin. Extracts the file path and runs
# eslint --fix + prettier --write on it.

set -euo pipefail

# Extract file path from the tool input JSON piped to stdin
FILE_PATH=$(jq -r '.tool_input.file_path // .tool_input.path // empty' 2>/dev/null)

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Only process files that eslint/prettier care about
case "$FILE_PATH" in
  *.ts|*.tsx|*.js|*.jsx|*.svelte|*.json|*.css|*.html|*.md)
    ;;
  *)
    exit 0
    ;;
esac

# Only run if the file actually exists
if [ ! -f "$FILE_PATH" ]; then
  exit 0
fi

# Run eslint --fix (only on lintable files)
case "$FILE_PATH" in
  *.ts|*.tsx|*.js|*.jsx|*.svelte)
    npx eslint --fix "$FILE_PATH" 2>/dev/null || true
    ;;
esac

# Run prettier --write
npx prettier --write "$FILE_PATH" 2>/dev/null || true

exit 0
