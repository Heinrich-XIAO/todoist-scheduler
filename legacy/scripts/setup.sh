#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"
uv sync
mkdir -p "$ROOT_DIR/data"

echo "Setup complete."
echo "Next:"
echo "  ./scripts/update.sh"
