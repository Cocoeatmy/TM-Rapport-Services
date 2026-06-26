#!/bin/bash
# Installe (ou réinstalle) l'agent calendrier → liens.
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
LABEL="com.tmrapport.calendar-links"
PLIST_DST="$HOME/Library/LaunchAgents/$LABEL.plist"
UID_NUM="$(id -u)"

# Permissions : exécutable + lisible par le seul propriétaire (contient la clé).
chmod 700 "$DIR/run-calendar-links.sh"

mkdir -p "$HOME/Library/LaunchAgents"
cp "$DIR/$LABEL.plist" "$PLIST_DST"

# Recharge propre.
launchctl bootout "gui/$UID_NUM/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$UID_NUM" "$PLIST_DST"
launchctl enable "gui/$UID_NUM/$LABEL"

echo "✅ Agent installé : $LABEL"
echo "   Logs : /tmp/tm-calendar-links.log  (erreurs : /tmp/tm-calendar-links.err)"
echo
echo "👉 Lance un premier passage maintenant pour accepter l'autorisation Calendrier :"
echo "   \"$DIR/run-calendar-links.sh\""
