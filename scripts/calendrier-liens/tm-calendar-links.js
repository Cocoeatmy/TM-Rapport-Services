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
  // 3e arg "force" : re-traite même les RDV déjà enrichis (pour appliquer un
  // nouveau format de notes). Le garde notesChanged/urlChanged évite les
  // écritures inutiles. Comportement normal (anti-boucle) si absent.
  const force = (argv[2] === 'force');

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

  // Types acceptés : Montage / Mesures / Services / SAV / Garantie, au SINGULIER
  // comme au PLURIEL (« Service - TM… » ou « Services - TM… »), éventuellement
  // préfixés par "PROV" (séparateur " : " ou " - "). Exclut Visite, etc.
  const TYPE_RE = /^(?:PROV\s*[:\-]\s*)?(Montages?|Mesures?|Services?|SAV|Garanties?)\b/i;
  // Sentinelle du bloc d'infos auto (doit correspondre à /api/share-link).
  const SENTINEL = '——— Infos projet (auto) ———';
  let filled = 0;

  for (let i = 0; i < count; i++) {
    const ev = events.objectAtIndex(i);

    const title = ObjC.unwrap(ev.title) || '';
    if (!title) continue;
    const tMatch = title.match(TYPE_RE);
    if (!tMatch) continue;
    // Normalise singulier/pluriel → forme canonique attendue par l'endpoint.
    const rawType = tMatch[1].toLowerCase();
    const type = rawType.indexOf('montage') === 0 ? 'montage'
      : rawType.indexOf('mesure') === 0 ? 'mesures'
      : rawType.indexOf('service') === 0 ? 'services'
      : rawType.indexOf('garantie') === 0 ? 'garantie'
      : 'sav';
    const wantsNotes = (type === 'montage' || type === 'mesures' || type === 'services' || type === 'sav');

    // Extraire "TM-<chiffres>".
    const m = title.match(/TM-\d+/);
    if (!m) continue;
    const tm = m[0];

    const curURL = ObjC.unwrap(ev.URL ? ev.URL.absoluteString : $()) || '';
    const curNotes = ObjC.unwrap(ev.notes) || '';
    const hasSentinel = curNotes.indexOf(SENTINEL) >= 0;

    // Synchro Notion → calendrier : pour les types À NOTES, on re-sollicite
    // TOUJOURS l'API et on compare (l'écriture n'a lieu que si URL/notes ont
    // changé, cf. plus bas → pas de boucle WatchPath). Ainsi une modif Notion
    // (contacts, cartons…) est répercutée sur un RDV déjà traité. On ne saute
    // que les types SANS notes (ex. Garantie) qui ont déjà une URL.
    if (!force && curURL && !wantsNotes) continue;
    void hasSentinel;

    // Récupérer lien + notes (JSON) selon le type.
    const reqURL = baseURL + '/api/share-link?key=' + apiKey + '&type=' + type + '&tm=' + tm;
    let raw = '';
    try {
      raw = app.doShellScript("/usr/bin/curl -fsS --max-time 20 '" + reqURL + "'");
    } catch (e) { raw = ''; }
    let data = null;
    try { data = JSON.parse(raw); } catch (e) { data = null; }
    if (!data || !data.ok || typeof data.link !== 'string' || data.link.indexOf('http') !== 0) continue;

    // ── URL de l'événement = Fiche de travail. ──
    // On (re)pose le lien si l'URL est vide OU si c'est déjà un de NOS liens
    // (même domaine : anciens /client/…, /f/…, /s/…). Une URL manuelle étrangère
    // (autre domaine) est préservée.
    const isOurLink = (curURL === '') || (curURL.indexOf(baseURL) === 0);
    const urlToSet = isOurLink ? data.link.trim() : curURL;
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
