#!/bin/bash
# Update stack manifests to use new command format

cd "$(dirname "$0")/.."

for stackdir in catalog/stacks/*/; do
  name=$(basename "$stackdir")
  manifest="${stackdir}manifest.json"

  # Skip archive and non-stack dirs
  if [[ "$name" == "_archive" || "$name" == "README.md" ]]; then
    continue
  fi

  if [[ ! -f "$manifest" ]]; then
    continue
  fi

  # Check if it has dist directory (Node stack with build)
  if [[ -d "${stackdir}dist" ]]; then
    echo "Updating $name to use node dist/index.js"
    tmp=$(mktemp)
    jq '. + {runtime: "node", command: ["node", "dist/index.js"]}' "$manifest" > "$tmp" && mv "$tmp" "$manifest"
  elif [[ -d "${stackdir}src" ]]; then
    # Has src but no dist - use npx tsx
    echo "Updating $name to use npx tsx src/index.ts"
    tmp=$(mktemp)
    jq '. + {runtime: "node", command: ["npx", "tsx", "src/index.ts"]}' "$manifest" > "$tmp" && mv "$tmp" "$manifest"
  fi
done

echo "Done updating manifests"
