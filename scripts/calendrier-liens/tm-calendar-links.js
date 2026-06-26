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

  // ── Fenêtre : passé proche → ~5 mois devant ────────────────────────────────
  const start = $.NSDate.dateWithTimeIntervalSinceNow(-3 * 86400);
  const end = $.NSDate.dateWithTimeIntervalSinceNow(150 * 86400);
  const pred = store.predicateForEventsWithStartDateEndDateCalendars(start, end, $());
  const events = store.eventsMatchingPredicate(pred);
  const count = events.count;

  // Types acceptés : Montage / Services / SAV / Garantie, éventuellement
  // préfixés par "PROV" (séparateur " : " ou " - "). Exclut Mesures, Visite, etc.
  const TYPE_RE = /^(?:PROV\s*[:\-]\s*)?(?:Montage|Services|SAV|Garantie)\b/i;
  let filled = 0;

  for (let i = 0; i < count; i++) {
    const ev = events.objectAtIndex(i);

    const title = ObjC.unwrap(ev.title) || '';
    if (!title) continue;
    if (!TYPE_RE.test(title)) continue;

    // URL déjà présente ? on saute.
    const abs = ObjC.unwrap(ev.URL ? ev.URL.absoluteString : $()) || '';
    if (abs) continue;

    // Extraire "TM-<chiffres>".
    const m = title.match(/TM-\d+/);
    if (!m) continue;
    const tm = m[0];

    // Récupérer le lien client.
    const reqURL = baseURL + '/api/share-link?format=text&key=' + apiKey + '&tm=' + tm;
    let link = '';
    try {
      link = app.doShellScript("/usr/bin/curl -fsS --max-time 20 '" + reqURL + "'");
    } catch (e) {
      link = '';
    }
    if (typeof link !== 'string' || link.indexOf('http') !== 0) continue;

    // Écrire l'URL et enregistrer.
    ev.URL = $.NSURL.URLWithString($(link.trim()));
    try {
      store.saveEventSpanCommitError(ev, 0 /* EKSpanThisEvent */, true, $());
      filled++;
    } catch (e) { /* ignore */ }
  }

  return 'RDV remplis: ' + filled + ' (sur ' + count + ' RDV dans la fenêtre)';
}
