#!/bin/bash
# PreToolUse hook for Bash: if the command is a git commit, run lint + format checks first.
# If checks fail, deny the tool use so Claude fixes issues before committing.
# For non-commit commands, allow them through without checks.

set -euo pipefail

# Extract the bash command from the tool input JSON piped to stdin
COMMAND=$(jq -r '.tool_input.command // empty' 2>/dev/null)

if [ -z "$COMMAND" ]; then
  exit 0
fi

# Only gate on git commit commands
if ! echo "$COMMAND" | grep -qE '^\s*git\s+commit\b'; then
  exit 0
fi

# Run lint and format checks
ERRORS=""

if ! pnpm lint 2>&1; then
  ERRORS="${ERRORS}Lint check failed. "
fi

if ! pnpm format:check 2>&1; then
  ERRORS="${ERRORS}Format check failed. "
fi

if [ -n "$ERRORS" ]; then
  # Deny the commit with an explanation
  jq -n \
    --arg reason "$ERRORS Run 'pnpm lint:fix && pnpm format' to fix." \
    '{
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: $reason
      }
    }'
  exit 0
fi

# All checks passed — allow the commit
exit 0
