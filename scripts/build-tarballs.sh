#!/bin/bash
# Build and package all stacks as tarballs for GitHub releases

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REGISTRY_DIR="$(dirname "$SCRIPT_DIR")"
STACKS_DIR="$REGISTRY_DIR/catalog/stacks"
OUTPUT_DIR="$REGISTRY_DIR/dist/stacks"

# Clean and create output directory
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

echo "Building stack tarballs..."
echo ""

for stack_dir in "$STACKS_DIR"/*/; do
  stack_name=$(basename "$stack_dir")

  # Skip special directories
  if [[ "$stack_name" == "_archive" || "$stack_name" == "README.md" ]]; then
    continue
  fi

  # Check for manifest
  if [[ ! -f "$stack_dir/manifest.json" ]]; then
    echo "  Skipping $stack_name (no manifest.json)"
    continue
  fi

  echo "Building $stack_name..."

  # Get version from manifest
  version=$(jq -r '.version // "1.0.0"' "$stack_dir/manifest.json")

  # Create temp build directory
  build_dir=$(mktemp -d)

  # Copy essential files
  cp "$stack_dir/manifest.json" "$build_dir/"

  # Copy package.json if exists
  [[ -f "$stack_dir/package.json" ]] && cp "$stack_dir/package.json" "$build_dir/"

  # Copy .env.example if exists
  [[ -f "$stack_dir/.env.example" ]] && cp "$stack_dir/.env.example" "$build_dir/"

  # Build if there's a build script
  if [[ -f "$stack_dir/package.json" ]]; then
    # Check if node_modules exists, if not install
    if [[ ! -d "$stack_dir/node_modules" ]]; then
      echo "  Installing dependencies..."
      (cd "$stack_dir" && npm install --production=false 2>/dev/null) || true
    fi

    # Check if there's a build script
    if jq -e '.scripts.build' "$stack_dir/package.json" > /dev/null 2>&1; then
      echo "  Running build..."
      (cd "$stack_dir" && npm run build 2>/dev/null) || echo "  Warning: build failed"
    fi

    # Copy dist/ if it exists (built output)
    if [[ -d "$stack_dir/dist" ]]; then
      cp -r "$stack_dir/dist" "$build_dir/"
    fi

    # Copy src/ if no dist (for tsx/ts-node stacks)
    if [[ ! -d "$stack_dir/dist" && -d "$stack_dir/src" ]]; then
      cp -r "$stack_dir/src" "$build_dir/"
      [[ -f "$stack_dir/tsconfig.json" ]] && cp "$stack_dir/tsconfig.json" "$build_dir/"
    fi
  fi

  # Copy Python files if exists
  if [[ -f "$stack_dir/requirements.txt" ]]; then
    cp "$stack_dir/requirements.txt" "$build_dir/"
  fi
  if [[ -d "$stack_dir/python" ]]; then
    cp -r "$stack_dir/python" "$build_dir/"
  fi

  # Create tarball
  tarball_name="${stack_name}-${version}.tar.gz"
  (cd "$build_dir" && tar -czf "$OUTPUT_DIR/$tarball_name" .)

  # Get size
  size=$(du -h "$OUTPUT_DIR/$tarball_name" | cut -f1)
  echo "  Created $tarball_name ($size)"

  # Cleanup
  rm -rf "$build_dir"
done

echo ""
echo "Tarballs created in: $OUTPUT_DIR"
echo ""
echo "To upload to GitHub releases:"
echo "  gh release create stacks-v1.0.0 $OUTPUT_DIR/*.tar.gz --title 'Stack Packages v1.0.0'"
