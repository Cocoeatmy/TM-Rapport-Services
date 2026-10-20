"use client";

/**
 * La navigation de l'app iPhone : une barre en bas, comme les apps qu'on
 * connaît — Accueil, Planning, Nouveau projet, Projets, Profil.
 *
 * Elle n'existe QUE dans l'app Apple sur iPhone (`html[data-app="ios"]`,
 * posé au démarrage d'après l'identité « TMRapportApp/… (iOS) » que l'app
 * native donne à son navigateur). Safari, l'iPad et le Mac n'en voient rien.
 *
 * Elle ne refait rien : chaque bouton emprunte un chemin qui existe déjà.
 *  - Accueil / Planning / rubriques : les évènements que la page d'accueil
 *    écoute (`tm-go-home`, `tm-restore-view`) — pas de rechargement ; depuis
 *    une autre page, une navigation ordinaire vers « /?mode=… ».
 *  - « + » : la création de projet de l'en-tête (`tm-nouveau-projet`), pour
 *    les comptes qui ont le droit de créer ; un mot d'explication sinon.
 *  - Profil : le menu du profil existant (`tm-basculer-profil`).
 * Les droits ne sont pas décidés ici : chaque page et chaque route les
 * vérifient comme avant. Masquer une rubrique n'est que du confort.
 */
import { useEffect, useState, type CSSProperties } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Home, CalendarDays, Plus, FolderOpen, User, ChevronRight, X, CloudUpload, CloudOff, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useDroits } from "@/lib/use-droits";
import { compterEchecs, getQueue, isOnline, saisiesEnCoursDEnvoi } from "@/lib/offline";
import { countPendingUploads, countPermanentlyFailed, photosEnCoursDEnvoi } from "@/lib/idb-uploads";

/** Sommes-nous dans l'app iPhone ? (Attribut posé avant le premier rendu.) */
export function estAppIphone(): boolean {
  return typeof document !== "undefined" && document.documentElement.getAttribute("data-app") === "ios";
}

function useAppIphone(): boolean {
  const [oui, setOui] = useState(false);
  useEffect(() => { setOui(estAppIphone()); }, []);
  return oui;
}

/** Ouvre une rubrique de la page d'accueil, sans rechargement si on y est déjà. */
export function ouvrirRubrique(router: ReturnType<typeof useRouter>, pathname: string, mode: string) {
  if (pathname === "/") {
    if (mode === "dashboard") window.dispatchEvent(new CustomEvent("tm-go-home"));
    else window.dispatchEvent(new CustomEvent("tm-restore-view", { detail: { url: `/?mode=${mode}` } }));
    try {
      const url = new URL(window.location.href);
      if (mode === "dashboard") url.searchParams.delete("mode"); else url.searchParams.set("mode", mode);
      window.history.replaceState(window.history.state, "", url.pathname + url.search);
    } catch { /* l'adresse suivra au prochain changement de filtre */ }
    try { window.scrollTo({ top: 0 }); } catch { /* ignore */ }
    return;
  }
  router.push(mode === "dashboard" ? "/" : `/?mode=${mode}`);
}

/* Les rubriques, dans l'ordre de la barre d'onglets qu'elles remplacent. */
interface Rubrique { id: string; label: string; droit?: string; signal?: boolean; classique?: boolean; sous?: { mode: string; label: string }[]; mode?: string }
const RUBRIQUES: Rubrique[] = [
  /* La liste de tous les projets ouverts — ce qu'ouvrait « Planning » avant
     que celui-ci ne devienne l'agenda des rendez-vous. */
  { id: "en-cours", label: "Projets en cours", mode: "calendrier", droit: "projets.voir" },
  { id: "services", label: "Services", droit: "projets.voir", sous: [
    { mode: "mesures", label: "Mesures" }, { mode: "cmd", label: "Montages" },
    { mode: "services", label: "Services" }, { mode: "sav", label: "SAV" },
  ] },
  { id: "crm", label: "CRM", droit: "carnet.voir", sous: [
    { mode: "clients-contacts", label: "Contacts" }, { mode: "clients-entreprises", label: "Entreprises" },
    { mode: "clients-fournisseurs", label: "Fournisseurs" }, { mode: "clients-grossistes", label: "Grossistes" },
  ] },
  { id: "grossistes", label: "Grossistes", droit: "projets.voir", sous: [
    { mode: "grossistes", label: "Tous" }, { mode: "grossistes-bms", label: "BMS" }, { mode: "grossistes-dubat", label: "Dubat" },
    { mode: "grossistes-tema", label: "Tema Sàrl" }, { mode: "grossistes-matway", label: "MatWay" }, { mode: "grossistes-bringhen", label: "Bringhen" },
  ] },
  { id: "fournisseurs", label: "Fournisseurs", droit: "projets.voir", sous: [
    { mode: "fournisseurs", label: "Tous" }, { mode: "fournisseurs-duka", label: "Duka.ch" }, { mode: "fournisseurs-duscholux", label: "Duscholux" },
    { mode: "fournisseurs-kermi", label: "Kermi" }, { mode: "fournisseurs-koralle", label: "Koralle" }, { mode: "fournisseurs-nelo", label: "Nelo" },
    { mode: "fournisseurs-novellini", label: "Novellini" }, { mode: "fournisseurs-ronal", label: "Ronal" }, { mode: "fournisseurs-samo", label: "Samo" },
    { mode: "fournisseurs-vismaravetro", label: "Vismaravetro" },
  ] },
  /* Comme la barre d'onglets : Sanitaires et Rapport hors Signal, Chantiers en Signal. */
  { id: "sanitaires", label: "Sanitaires", mode: "sanitaires", droit: "projets.voir", classique: true },
  { id: "rapport", label: "Rapport", mode: "rapport", droit: "rapports.heures", classique: true },
  { id: "kanban", label: "Kanban", mode: "kanban", droit: "kanban.voir" },
  { id: "destockage", label: "Déstockage", mode: "destockage", droit: "stock.voir" },
  { id: "chantiers", label: "Chantiers PPE", mode: "chantiers", droit: "projets.voir", signal: true },
];

export function NavigationIos() {
  const actif = useAppIphone();
  const router = useRouter();
  const pathname = usePathname() || "/";
  const params = useSearchParams();
  const { mes, peut } = useDroits();
  const [projetsOuvert, setProjetsOuvert] = useState(false);
  const [groupe, setGroupe] = useState<string | null>(null);
  const [signal, setSignal] = useState(false);
  const [modeCourant, setModeCourant] = useState<string>("dashboard");
  /* Le menu du profil est ouvert : seul « Profil » est actif, et tout autre
     bouton le referme avant d'ouvrir sa page. */
  const [profilOuvert, setProfilOuvert] = useState(false);
  useEffect(() => {
    const suivre = (e: Event) => setProfilOuvert(!!(e as CustomEvent<{ ouvert: boolean }>).detail?.ouvert);
    window.addEventListener("tm-profil-etat", suivre);
    return () => window.removeEventListener("tm-profil-etat", suivre);
  }, []);
  const fermerProfil = () => { window.dispatchEvent(new CustomEvent("tm-fermer-profil")); };

  /* Barre repliée en descendant, dépliée en remontant ou près du haut.
     Écoute en phase de capture : certaines pages défilent dans leur propre
     zone, pas dans la fenêtre. */
  const [replie, setReplie] = useState(false);
  useEffect(() => {
    if (!actif) return;
    const derniers = new WeakMap<object, number>();
    const surDefilement = (ev: Event) => {
      const cible = ev.target;
      if (!cible || (cible instanceof Element && cible.closest("[data-nav-ios], .tm-chatbot-panneau, [role='dialog']"))) return;
      const y = cible === document || cible === document.documentElement ? window.scrollY : (cible as Element).scrollTop;
      const avant = derniers.get(cible) ?? y;
      derniers.set(cible, y);
      if (y < 40) { setReplie(false); return; }
      if (y - avant > 6) setReplie(true);
      else if (avant - y > 6) setReplie(false);
    };
    document.addEventListener("scroll", surDefilement, { capture: true, passive: true });
    return () => document.removeEventListener("scroll", surDefilement, { capture: true } as EventListenerOptions);
  }, [actif]);
  /* Changer de page : la barre revient entière (ajusté pendant le rendu,
     sans effet — la règle de React pour un état dérivé d'une prop). */
  const clePage = `${pathname}?${params?.toString() || ""}`;
  const [pageVue, setPageVue] = useState(clePage);
  if (pageVue !== clePage) { setPageVue(clePage); setReplie(false); }

  useEffect(() => {
    if (!actif) return;
    const lire = () => setSignal(document.documentElement.getAttribute("data-ui") === "signal");
    lire();
    const obs = new MutationObserver(lire);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-ui"] });
    return () => obs.disconnect();
  }, [actif]);

  /* Le bouton actif suit la rubrique ouverte (adresse de la page d'accueil). */
  useEffect(() => { setModeCourant(params?.get("mode") || "dashboard"); }, [params, pathname]);

  /* Clavier ouvert : la barre s'efface, pour ne jamais couvrir un champ. */
  useEffect(() => {
    if (!actif) return;
    const champ = (el: EventTarget | null) => {
      const e = el as HTMLElement | null;
      return !!e && (e.tagName === "INPUT" || e.tagName === "TEXTAREA" || e.tagName === "SELECT" || e.isContentEditable)
        && !(e as HTMLInputElement).type?.match(/^(checkbox|radio|button|submit|file|range|color)$/);
    };
    const entree = (ev: FocusEvent) => { if (champ(ev.target)) document.documentElement.classList.add("tm-clavier"); };
    const sortie = () => setTimeout(() => {
      if (!champ(document.activeElement)) document.documentElement.classList.remove("tm-clavier");
    }, 50);
    document.addEventListener("focusin", entree);
    document.addEventListener("focusout", sortie);
    return () => { document.removeEventListener("focusin", entree); document.removeEventListener("focusout", sortie); };
  }, [actif]);

  if (!actif) return null;

  const aller = (mode: string) => { fermerProfil(); setProjetsOuvert(false); setGroupe(null); ouvrirRubrique(router, pathname, mode); };
  /* Une feuille ouverte (Projets ou Profil) : c'est elle, et elle seule, qui est active. */
  const feuille = projetsOuvert || profilOuvert;
  const surAccueil = pathname === "/";
  /* Feuille Projets ouverte : c'est elle, et elle seule, qui est active. */
  const est = (m: string) => !feuille && surAccueil && modeCourant === m;
  const projetsActif = surAccueil && modeCourant !== "dashboard";
  const surPlanning = pathname.startsWith("/planning");
  /* Avant la réponse des droits, on attend : un « + » qui s'ouvrirait puis
     se refuserait serait pire qu'un instant d'hésitation. */
  const peutCreer = !!mes && peut("projets.creer");
  /* Le bouton qui représente la barre repliée : l'actif, sinon Accueil. */
  const actifs = {
    accueil: est("dashboard"),
    planning: surPlanning && !feuille,
    projets: projetsOuvert || (projetsActif && !surPlanning && !profilOuvert),
    profil: profilOuvert,
  };
  const repr = (Object.keys(actifs) as (keyof typeof actifs)[]).find((k) => actifs[k]) || "accueil";
  const marqueRepr = (k: keyof typeof actifs) => (repr === k ? " is-repr" : "");
  const replieeVisible = replie && !feuille;
  const rubriques = RUBRIQUES.filter((r) =>
    (!r.droit || peut(r.droit, "lecture")) && (!r.signal || signal) && (!r.classique || !signal));

  const nouveauProjet = () => {
    fermerProfil();
    setProjetsOuvert(false);
    if (!peutCreer) {
      toast("La création de projets est réservée aux comptes autorisés.", { id: "tm-nouveau-projet" });
      return;
    }
    window.dispatchEvent(new CustomEvent("tm-nouveau-projet"));
  };

  return (
    <>
      {projetsOuvert && (
        <div className="tm-ios-feuille" role="dialog" aria-modal="true" aria-label="Projets" data-nav-ios>
          <div className="tm-ios-voile" onClick={() => { setProjetsOuvert(false); setGroupe(null); }} aria-hidden="true" />
          <div className="tm-ios-feuille-corps">
            <div className="tm-ios-feuille-tete">
              <span>Projets</span>
              <button type="button" aria-label="Fermer" onClick={() => { setProjetsOuvert(false); setGroupe(null); }}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <ul className="tm-ios-liste">
              {rubriques.map((r) => {
                const ouvert = groupe === r.id;
                const actifRubrique = surAccueil && (r.mode ? modeCourant === r.mode
                  : (r.sous || []).some((s) => modeCourant === s.mode || modeCourant === `${s.mode}-termine`));
                return (
                  <li key={r.id}>
                    <button type="button" className={`tm-ios-rubrique${actifRubrique ? " is-actif" : ""}`}
                      aria-expanded={r.sous ? ouvert : undefined}
                      onClick={() => (r.sous ? setGroupe(ouvert ? null : r.id) : aller(r.mode!))}>
                      <span>{r.label}</span>
                      <ChevronRight className={`w-4 h-4 tm-ios-chevron${ouvert ? " is-ouvert" : ""}`} />
                    </button>
                    {ouvert && r.sous && (
                      <div className="tm-ios-sous">
                        {r.sous.map((s) => (
                          <button key={s.mode} type="button"
                            className={`tm-ios-puce${surAccueil && (modeCourant === s.mode || modeCourant === `${s.mode}-termine`) ? " is-actif" : ""}`}
                            onClick={() => aller(s.mode)}>
                            {s.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      <nav id="tm-ios-barre" className={`tm-ios-barre glass-header${replieeVisible ? " is-replie" : ""}`} aria-label="Navigation principale" data-nav-ios
        /* Repliée, la barre n'est qu'un rond : le toucher la déplie, il
           n'ouvre rien. */
        onClickCapture={(e) => { if (replieeVisible) { e.preventDefault(); e.stopPropagation(); setReplie(false); } }}>
        <button type="button" style={{ "--i": 0 } as CSSProperties} className={`tm-ios-onglet${actifs.accueil ? " is-actif" : ""}${marqueRepr("accueil")}`} onClick={() => aller("dashboard")}>
          <Home className="w-6 h-6" /><span>Accueil</span>
        </button>
        <button type="button" style={{ "--i": 1 } as CSSProperties} className={`tm-ios-onglet${actifs.planning ? " is-actif" : ""}${marqueRepr("planning")}`}
          onClick={() => { fermerProfil(); setProjetsOuvert(false); setGroupe(null); if (!surPlanning) router.push("/planning"); }}>
          <CalendarDays className="w-6 h-6" /><span>Planning</span>
        </button>
        <button type="button" style={{ "--i": 2 } as CSSProperties} className={`tm-ios-onglet tm-ios-plus${peutCreer ? "" : " is-inactif"}`}
          aria-label="Nouveau projet" onClick={nouveauProjet}>
          <span className="tm-ios-plus-rond"><Plus className="w-6 h-6" /></span>
        </button>
        <button type="button" style={{ "--i": 3 } as CSSProperties} className={`tm-ios-onglet${actifs.projets ? " is-actif" : ""}${marqueRepr("projets")}`}
          aria-expanded={projetsOuvert} onClick={() => { fermerProfil(); setProjetsOuvert((v) => !v); setGroupe(null); }}>
          <FolderOpen className="w-6 h-6" /><span>Projets</span>
        </button>
        <button type="button" style={{ "--i": 4 } as CSSProperties} className={`tm-ios-onglet${actifs.profil ? " is-actif" : ""}${marqueRepr("profil")}`} aria-expanded={profilOuvert}
          onClick={() => { setProjetsOuvert(false); window.dispatchEvent(new CustomEvent("tm-basculer-profil")); }}>
          <User className="w-6 h-6" /><span>Profil</span>
        </button>
      </nav>
    </>
  );
}

/**
 * L'état de la synchro, en une pastille — dans l'app iPhone seulement, à la
 * place du gros nuage. Rien quand tout est parti. Elle LIT les files ; elle
 * ne touche pas au moteur. Un appui ouvre le détail du bandeau existant.
 */
export function IndicateurSynchro() {
  const actif = useAppIphone();
  const [etat, setEtat] = useState<{ attente: number; echecs: number; enCours: boolean; enLigne: boolean }>({ attente: 0, echecs: 0, enCours: false, enLigne: true });

  useEffect(() => {
    if (!actif) return;
    let vivant = true;
    const lire = async () => {
      let photos = 0, echecsPhotos = 0;
      try { photos = await countPendingUploads(); } catch { /* ignore */ }
      try { echecsPhotos = await countPermanentlyFailed(); } catch { /* ignore */ }
      if (!vivant) return;
      setEtat({
        attente: getQueue().length + photos,
        echecs: compterEchecs() + echecsPhotos,
        enCours: saisiesEnCoursDEnvoi() || photosEnCoursDEnvoi(),
        enLigne: isOnline(),
      });
    };
    lire();
    const t = setInterval(lire, 3000);
    const evts = ["tm-offline-queued", "tm-pending-upload-added", "tm-pending-upload-removed", "tm-file-modifiee", "online", "offline", "tm-upload-permanently-failed"];
    evts.forEach((e) => window.addEventListener(e, lire));
    return () => { vivant = false; clearInterval(t); evts.forEach((e) => window.removeEventListener(e, lire)); };
  }, [actif]);

  if (!actif) return null;
  const { attente, echecs, enCours, enLigne } = etat;
  if (enLigne && attente === 0 && echecs === 0 && !enCours) return null;

  const ton = echecs > 0 ? "is-erreur" : !enLigne ? "is-horsligne" : attente > 0 ? "is-attente" : "is-encours";
  const libelle = echecs > 0 ? `${echecs} envoi${echecs > 1 ? "s" : ""} en échec`
    : !enLigne ? `Hors ligne${attente > 0 ? ` — ${attente} en attente` : ""}`
    : enCours ? `Synchronisation en cours${attente > 0 ? ` — ${attente} en attente` : ""}`
    : `${attente} en attente d'envoi`;

  return (
    <button type="button" className={`tm-ios-synchro ${ton}`} aria-label={libelle} title={libelle}
      onClick={() => { try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch { /* ignore */ } window.dispatchEvent(new CustomEvent("tm-ouvrir-synchro")); }}>
      {echecs > 0 ? <AlertTriangle className="w-4 h-4" />
        : !enLigne ? <CloudOff className="w-4 h-4" />
        : enCours ? <Loader2 className="w-4 h-4 animate-spin" />
        : <CloudUpload className="w-4 h-4" />}
      {(attente > 0 || echecs > 0) && <b>{echecs > 0 ? echecs : attente}</b>}
    </button>
  );
}
