#!/bin/bash
# Dev-mode data (what ./dev.sh uses): settings.json, profiles/, private/, backups/, favicons*/ in the repo folder.
#   tools/dev_data.sh backup           save a snapshot to ~/Documents/pushdeck-dev-data-backup/<time>
#   tools/dev_data.sh blank            back up first, then reset to a fresh-install state (default settings, starter profiles only)
#   tools/dev_data.sh restore [name]   put a snapshot back (the newest one unless you give its name)
# Stop dev mode first (this refuses to run while the daemon is up). Never touches the installed app's data.
set -e
cd "$(dirname "$0")/.."
ROOT="$PWD"; BK=~/Documents/pushdeck-dev-data-backup
ITEMS=(settings.json profiles private backups favicons favicons2 favicons3)
lsof -nP -iTCP:8472 -sTCP:LISTEN >/dev/null 2>&1 && { echo "Dev mode (or the app) is running on port 8472. Stop it first."; exit 1; }
backup() {
  local d="$BK/$(date +%Y%m%d-%H%M%S)"; mkdir -p "$d"
  for i in "${ITEMS[@]}"; do [ -e "$i" ] && cp -R "$i" "$d/"; done
  echo "saved snapshot: $d" >&2; echo "$d"
}
case "$1" in
  backup) backup >/dev/null ;;
  blank)
    backup >/dev/null
    rm -rf settings.json private backups favicons favicons2 favicons3
    git checkout -- profiles; git clean -fdq -- profiles   # the starter profiles exactly as committed
    echo "blank: default settings, starter profiles, no saved sign-ins. Start ./dev.sh to test." ;;
  restore)
    SRC="$BK/${2:-$(ls -1 "$BK" | sort | tail -1)}"
    [ -d "$SRC" ] || { echo "No snapshot found in $BK"; exit 1; }
    rm -rf "${ITEMS[@]}"
    for i in "${ITEMS[@]}"; do [ -e "$SRC/$i" ] && cp -R "$SRC/$i" .; done
    echo "restored from $SRC" ;;
  *) sed -n '2,6p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
