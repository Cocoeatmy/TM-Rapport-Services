#!/bin/bash
# Installe (ou réinstalle) l'agent signalements → Rappels.
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
LABEL="com.tmrapport.rappels"
PLIST_DST="$HOME/Library/LaunchAgents/$LABEL.plist"
UID_NUM="$(id -u)"

if [ ! -f "$DIR/run-rappels.sh" ]; then
  echo "❌ Il manque run-rappels.sh."
  echo "   cp run-rappels.sh.template run-rappels.sh  puis renseigne la clé."
  exit 1
fi

# Permissions : exécutable + lisible par le seul propriétaire (contient la clé).
chmod 700 "$DIR/run-rappels.sh"

mkdir -p "$HOME/Library/LaunchAgents"
cp "$DIR/$LABEL.plist" "$PLIST_DST"

launchctl bootout "gui/$UID_NUM/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$UID_NUM" "$PLIST_DST"
launchctl enable "gui/$UID_NUM/$LABEL"

echo "✅ Agent installé : $LABEL"
echo "   Logs : /tmp/tm-rappels.log  (erreurs : /tmp/tm-rappels.err)"
echo
echo "👉 Lance un premier passage maintenant pour accepter l'autorisation Rappels :"
echo "   \"$DIR/run-rappels.sh\""
