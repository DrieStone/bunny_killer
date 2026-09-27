#!/bin/zsh
# Run the sprite-gen skill tool with SPRITE_AI_KEY pulled from ~/.zshrc (never printed).
if [[ -z "$SPRITE_AI_KEY" ]]; then
  eval "$(grep -E '^[[:space:]]*export[[:space:]]+SPRITE_AI_KEY=' ~/.zshrc | tail -1)"
fi
exec node /Users/jsweet/.claude/skills/sprite-gen/sprite-gen.js "$@"
