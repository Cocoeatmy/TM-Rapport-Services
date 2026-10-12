/**
 * /sav/<token>  → Rapport SAV (PDF) du projet.
 *
 * Lien COURT pour les notes des RDV du calendrier et les rappels. `token` =
 * base64url de l'id Notion du projet (le même que /client/<token>). La
 * signature HMAC est calculée ici, côté serveur. Route publique (middleware).
 *
 * Page, et non plus redirection sèche : dans un navigateur, `LienDocument`
 * redirige aussitôt et rien ne change ; mais l'app installée s'ouvre en
 * fenêtre autonome, sans barre d'adresse ni flèche retour, et le PDF s'y
 * affichait sans aucun moyen d'en sortir. Voir `LienDocument`.
 */
import { LienDocument } from "@/components/lien-document";
import { signSav } from "@/lib/doc-link";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let id = "";
  try { id = Buffer.from(token, "base64url").toString("utf8"); } catch {}
  if (!id) {
    return (
      <main style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
        <p>Lien invalide.</p>
      </main>
    );
  }
  const url = `/api/sav/${encodeURIComponent(id)}?s=${signSav(id)}`;
  return <LienDocument url={url} titre="Rapport SAV" projetId={id} />;
}
