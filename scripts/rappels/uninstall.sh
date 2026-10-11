#!/bin/bash
# Désinstalle l'agent signalements → Rappels. Ne touche à aucun rappel déjà posé.
LABEL="com.tmrapport.rappels"
UID_NUM="$(id -u)"
launchctl bootout "gui/$UID_NUM/$LABEL" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/$LABEL.plist"
echo "🗑️  Agent désinstallé : $LABEL"
echo "   Les rappels déjà posés restent dans ta liste — à toi de les trier."
