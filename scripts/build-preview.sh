#!/usr/bin/env bash
set -euo pipefail
# Pages has one deployment per repository: retain main at /, place this branch at /preview/.
DEST="${RUNNER_TEMP:-/tmp}/hanja-preview-source"
mkdir -p "$DEST" _site/preview
git archive origin/main | tar -x -C "$DEST"
copy_app() {
  local src="$1" dest="$2"
  for f in index.html style.css hanja_data.js audioEngine.js speechEngine.js writingEngine.js script.js bookmarkStore.js sw.js manifest.webmanifest icon-192.png icon-512.png favicon.ico; do
    if [ -f "$src/$f" ]; then cp "$src/$f" "$dest/"; fi
  done
  if [ -d "$src/img" ]; then cp -r "$src/img" "$dest/"; fi
  npx -y tailwindcss@3.4.17 --content "$src/index.html,$src/script.js,$src/writingEngine.js" -o "$dest/tailwind-build.css" --minify
  local version="preview-$(git rev-parse --short HEAD)"
  if [ "$dest" = '_site' ]; then version="main-$(git rev-parse --short origin/main)"; fi
  sed -i "s/{{APP_VERSION}}/$version/g; s/{{COMMIT_DATE}}/$(date -u +%Y-%m-%dT%H:%M:%SZ)/g" "$dest/index.html" "$dest/script.js" "$dest/sw.js"
}
copy_app "$DEST" _site
copy_app . _site/preview
touch _site/.nojekyll
