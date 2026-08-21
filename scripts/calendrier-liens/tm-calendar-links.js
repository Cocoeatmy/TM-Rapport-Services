// Remplit le champ URL des RDV du calendrier avec le lien client TM Rapport,
// via EventKit (API calendrier d'Apple) — requêtes indexées, ne pilote PAS
// Calendar.app → aucun ralentissement de l'app, même avec des milliers de RDV.
//
// Usage : osascript -l JavaScript tm-calendar-links.js "<BASE_URL>" "<SHARE_LINK_KEY>"
//
// Ne traite que les RDV dont le titre commence par un préfixe autorisé
// (Montage / Services / SAV / Garantie, et variantes "PROV - …"), qui
// contiennent un n° TM, et dont l'URL est encore vide.

function run(argv) {
  ObjC.import('EventKit');
  ObjC.import('Foundation');

  if (argv.length < 2) return 'args manquants';
  const baseURL = argv[0];
  const apiKey = argv[1];

  const app = Application.currentApplication();
  app.includeStandardAdditions = true;

  const store = $.EKEventStore.alloc.init;
  const EVENT = 0; // EKEntityTypeEvent
  const FULL = 3;  // EKAuthorizationStatusAuthorized / FullAccess (lecture+écriture)

  // ── Accès ───────────────────────────────────────────────────────────────────
  // On lit d'abord le statut (synchrone, fiable). Le callback async de la
  // demande d'accès est capricieux sous JXA : on le déclenche seulement si le
  // statut est "non déterminé", et on détecte l'octroi en re-sondant le statut
  // (pas en se fiant au callback).
  const rl = $.NSRunLoop.currentRunLoop;
  // Number(...) : le pont ObjC renvoie un objet, pas un nombre JS → on coerce.
  let status = Number($.EKEventStore.authorizationStatusForEntityType(EVENT));

  if (status !== FULL) {
    if (store.requestFullAccessToEventsWithCompletion) {
      store.requestFullAccessToEventsWithCompletion(() => {});
    } else {
      store.requestAccessToEntityTypeCompletion(EVENT, () => {});
    }
    let spins = 0;
    while (status !== FULL && spins < 1200) { // ~60 s le temps du clic utilisateur
      rl.runModeBeforeDate($.NSDefaultRunLoopMode, $.NSDate.dateWithTimeIntervalSinceNow(0.05));
      status = Number($.EKEventStore.authorizationStatusForEntityType(EVENT));
      spins++;
    }
  }
  if (status !== FULL) return 'ACCES CALENDRIER REFUSE (statut ' + status + ')';

  // ── Calendriers CalDAV uniquement (exclut locaux, abonnements, anniversaires) ─
  const CALDAV = 1; // EKCalendarTypeCalDAV
  const allCals = store.calendarsForEntityType(EVENT);
  const caldav = $.NSMutableArray.alloc.init;
  for (let c = 0; c < allCals.count; c++) {
    const cal = allCals.objectAtIndex(c);
    if (Number(cal.type) === CALDAV) caldav.addObject(cal);
  }
  if (caldav.count === 0) return 'aucun calendrier CalDAV';

  // ── Fenêtre : aujourd'hui 00:00 → ~5 mois devant (pas de passé) ──────────────
  const start = $.NSCalendar.currentCalendar.startOfDayForDate($.NSDate.date);
  const end = $.NSDate.dateWithTimeIntervalSinceNow(150 * 86400);
  const pred = store.predicateForEventsWithStartDateEndDateCalendars(start, end, caldav);
  const events = store.eventsMatchingPredicate(pred);
  const count = events.count;

  // Types acceptés : Montage / Mesures / Services / SAV / Garantie, éventuellement
  // préfixés par "PROV" (séparateur " : " ou " - "). Exclut Visite, etc.
  const TYPE_RE = /^(?:PROV\s*[:\-]\s*)?(Montage|Mesures|Services|SAV|Garantie)\b/i;
  // Sentinelle du bloc d'infos auto (doit correspondre à /api/share-link).
  const SENTINEL = '——— Infos projet (auto) ———';
  let filled = 0;

  for (let i = 0; i < count; i++) {
    const ev = events.objectAtIndex(i);

    const title = ObjC.unwrap(ev.title) || '';
    if (!title) continue;
    const tMatch = title.match(TYPE_RE);
    if (!tMatch) continue;
    const type = tMatch[1].toLowerCase(); // montage|mesures|services|sav|garantie
    const wantsNotes = (type === 'montage' || type === 'mesures' || type === 'services');

    // Extraire "TM-<chiffres>".
    const m = title.match(/TM-\d+/);
    if (!m) continue;
    const tm = m[0];

    const curURL = ObjC.unwrap(ev.URL ? ev.URL.absoluteString : $()) || '';
    const curNotes = ObjC.unwrap(ev.notes) || '';
    const hasSentinel = curNotes.indexOf(SENTINEL) >= 0;

    // Déjà traité ? URL présente ET (pas de notes attendues OU bloc déjà là).
    // Évite de re-solliciter l'API et la boucle WatchPath après écriture.
    if (curURL && (!wantsNotes || hasSentinel)) continue;

    // Récupérer lien + notes (JSON) selon le type.
    const reqURL = baseURL + '/api/share-link?key=' + apiKey + '&type=' + type + '&tm=' + tm;
    let raw = '';
    try {
      raw = app.doShellScript("/usr/bin/curl -fsS --max-time 20 '" + reqURL + "'");
    } catch (e) { raw = ''; }
    let data = null;
    try { data = JSON.parse(raw); } catch (e) { data = null; }
    if (!data || !data.ok || typeof data.link !== 'string' || data.link.indexOf('http') !== 0) continue;

    // ── URL : posée seulement si vide (préserve une URL saisie à la main). ──
    const urlToSet = curURL || data.link.trim();
    const urlChanged = (urlToSet !== curURL);

    // ── Notes : remplace le bloc auto sans toucher aux notes manuelles. ──
    const autoBlock = (typeof data.notes === 'string') ? data.notes : '';
    let userPart = curNotes;
    const si = curNotes.indexOf(SENTINEL);
    if (si >= 0) userPart = curNotes.slice(0, si);
    userPart = userPart.replace(/\s+$/, '');
    let newNotes = curNotes;
    if (autoBlock) {
      newNotes = userPart ? (userPart + '\n\n' + autoBlock) : autoBlock;
    } else if (si >= 0) {
      newNotes = userPart; // plus de bloc attendu → on retire l'ancien
    }
    const notesChanged = (newNotes !== curNotes);

    if (!urlChanged && !notesChanged) continue; // rien à écrire

    if (urlChanged) ev.URL = $.NSURL.URLWithString($(urlToSet));
    if (notesChanged) ev.notes = $(newNotes);
    try {
      store.saveEventSpanCommitError(ev, 0 /* EKSpanThisEvent */, true, $());
      filled++;
    } catch (e) { /* ignore */ }
  }

  return 'RDV enrichis: ' + filled + ' (sur ' + count + ' RDV dans la fenêtre)';
}
