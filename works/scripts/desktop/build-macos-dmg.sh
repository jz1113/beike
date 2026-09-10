#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/../../.."
npm run tauri:build -- --bundles app
stage=$(mktemp -d "${TMPDIR:-/tmp}/beike-dmg.XXXXXX")
trap 'rm -rf "$stage"' EXIT
product=$(node -p "JSON.parse(require('fs').readFileSync('desktop/tauri.conf.json','utf8')).productName")
version=$(node -p "JSON.parse(require('fs').readFileSync('desktop/tauri.conf.json','utf8')).version")
arch=$(uname -m)
mkdir -p desktop/target/release/bundle/dmg
ditto "desktop/target/release/bundle/macos/$product.app" "$stage/$product.app"
ln -s /Applications "$stage/Applications"
output="desktop/target/release/bundle/dmg/${product}_${version}_${arch}.dmg"
hdiutil create -volname "$product" -srcfolder "$stage" -ov -format UDZO "$output"
hdiutil verify "$output"
echo "DMG: $output"
