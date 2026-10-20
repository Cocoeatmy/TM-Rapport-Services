/**
 * Les réponses que le moteur donne LUI-MÊME, sans modèle :
 *  - « à qui appartient ce numéro ? » — la réponse ne dépend que de la
 *    recherche, et ne doit dépendre d'aucun quota ;
 *  - le résumé des résultats quand le service IA est saturé.
 *
 * Jamais d'invention : plusieurs fiches → on les nomme toutes ; une fiche à
 * un chiffre près → on le dit ; rien trouvé → on dit OÙ l'on a cherché, et
 * si une source n'a pas pu être lue, on ne conclut pas.
 */
import type { DocRecherche, Resultat } from "./moteur";
import { afficherTelephone } from "./telephone";

export interface ContexteReponse {
  couverture: string;
  nonLues: string[];
  voitCarnet: boolean;
  dossiersDe: (d: DocRecherche) => DocRecherche[];
  resoudre: (id: string) => DocRecherche | undefined;
}

/** Le singulier d'une source : « la base Contacts ». */
const base = (source: string) => (source === "Projets" ? "la base des projets" : `la base ${source}`);

function detailsFiche(d: DocRecherche, ctx: ContexteReponse, numero: string): string[] {
  const out: string[] = [];
  const relies = [...new Set(d.liens.map(ctx.resoudre).filter((x): x is DocRecherche => !!x && x.source !== "Projets").map((x) => x.titre))];
  if (relies.length) out.push(`- **Relié à** : ${relies.slice(0, 6).join(", ")}`);
  for (const [k, v] of d.champs) {
    if (/t[ée]l|phone|portable|natel|mobile|e-?mail|pr[ée]nom|nom de famille/i.test(k)) continue;
    out.push(`- **${k}** : ${v}`);
    if (out.length >= 6) break;
  }
  if (d.emails.length) out.push(`- **E-mail** : ${d.emails.join(", ")}`);
  const autres = [...new Set(d.tels.filter((t) => t.e164 !== numero).map((t) => `${afficherTelephone(t.e164)} (${t.colonne})`))];
  if (autres.length) out.push(`- **Autres numéros** : ${autres.join(", ")}`);
  const dossiers = ctx.dossiersDe(d);
  if (dossiers.length) {
    out.push(`- **Dossiers liés** (${dossiers.length}) : ${dossiers.slice(0, 5).map((x) => x.titre).join(" ; ")}${dossiers.length > 5 ? " ; …" : ""}`);
  }
  return out;
}

export function reponseTelephone(numeros: string[], resultats: Resultat[], ctx: ContexteReponse): string {
  const blocs: string[] = [];
  for (const n of numeros) {
    const affiche = afficherTelephone(n);
    const exacts = resultats.filter((r) => r.doc.tels.some((t) => t.e164 === n));
    const fiches = exacts.filter((r) => r.doc.source !== "Projets");
    const notes = exacts.filter((r) => r.doc.source === "Projets");
    const voisins = resultats.filter((r) => r.voisin?.demande === n);
    const lignes: string[] = [];

    if (fiches.length === 1) {
      const d = fiches[0].doc;
      const col = d.tels.find((t) => t.e164 === n)?.colonne;
      lignes.push(`Le **${affiche}** appartient à **${d.titre}**, enregistré dans ${base(d.source)}${col ? ` (colonne « ${col} »)` : ""}.`);
      lignes.push(...detailsFiche(d, ctx, n));
    } else if (fiches.length > 1) {
      lignes.push(`Le **${affiche}** figure sur **${fiches.length} fiches** — je ne peux pas désigner un seul propriétaire :`);
      for (const r of fiches) lignes.push(`- **${r.doc.titre}** (${base(r.doc.source)}, ${r.doc.tels.find((t) => t.e164 === n)?.colonne})`);
    }
    if (notes.length > 0) {
      lignes.push(`${fiches.length ? "Il est aussi noté" : `Le **${affiche}** est noté`} sur ${notes.length > 1 ? `${notes.length} dossiers` : "le dossier"} :`);
      for (const r of notes.slice(0, 8)) lignes.push(`- **${r.doc.titre}** (colonne « ${r.doc.tels.find((t) => t.e164 === n)?.colonne} »)`);
    }
    if (exacts.length === 0 && voisins.length > 0) {
      lignes.push(`Aucune fiche ne porte exactement le **${affiche}**.`);
      lignes.push(`Numéro très proche — **un seul chiffre diffère**, à vérifier :`);
      for (const r of voisins.slice(0, 5)) {
        lignes.push(`- **${afficherTelephone(r.voisin!.trouve)}** : **${r.doc.titre}** (${base(r.doc.source)})`);
      }
      if (voisins.length === 1 && voisins[0].doc.source !== "Projets") lignes.push(...detailsFiche(voisins[0].doc, ctx, voisins[0].voisin!.trouve));
    }
    if (exacts.length === 0 && voisins.length === 0) {
      lignes.push(`Je n'ai trouvé le **${affiche}** nulle part.`);
      lignes.push(`Recherche faite dans : ${ctx.couverture}.`);
    }
    blocs.push(lignes.join("\n"));
  }
  if (!ctx.voitCarnet) blocs.push("Le carnet d'adresses (contacts, entreprises, fournisseurs) n'est pas ouvert à ton compte : seuls les projets ont été cherchés.");
  if (ctx.nonLues.length) blocs.push(`⚠ Sources pas encore lues : ${ctx.nonLues.join(", ")} — je ne peux pas affirmer qu'un numéro n'y figure pas. Réessaie dans une minute.`);
  return blocs.join("\n\n");
}

/** Quand le service IA ne répond pas : ce que la recherche a trouvé, tel quel. */
export function resumeResultats(resultats: Resultat[], ctx: ContexteReponse, motif: string): string {
  if (resultats.length === 0) {
    return `${motif}\n\nLa recherche n'a rien trouvé dans : ${ctx.couverture}.`;
  }
  const lignes: string[] = [];
  for (const [i, r] of resultats.slice(0, 10).entries()) {
    lignes.push(`- **${r.doc.titre}** (${base(r.doc.source)}${r.exact ? "" : r.approche ? ", ressemblance à vérifier" : ""})`);
    // Les trois premières fiches hors projets : de quoi agir sans le modèle.
    if (i < 3 && r.doc.source !== "Projets") {
      for (const l of detailsFiche(r.doc, ctx, "").slice(0, 5)) lignes.push(`  ${l}`);
    }
  }
  return `${motif} Voici ce que la recherche a trouvé :\n${lignes.join("\n")}`;
}
