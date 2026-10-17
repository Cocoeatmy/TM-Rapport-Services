/**
 * Les autorisations : ce que l'écran d'administration lit et enregistre.
 *
 * La route est elle-même soumise au droit qu'elle administre
 * (`administration.droits`). Un administrateur l'a toujours ; un responsable
 * ne l'a pas, et ne peut donc pas s'octroyer des droits en passant par
 * l'adresse directement.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAllUsers } from "@/lib/auth";
import { exigerDroit, lireReglages, ecrireReglages, oublierCache } from "@/lib/droits-serveur";
import {
  TOUS_LES_DROITS,
  droitsEffectifs,
  resumeChangement,
  type Niveau,
  type Perimetre,
  type Profil,
  type Reglages,
} from "@/lib/droits";

export const dynamic = "force-dynamic";

const NIVEAUX: Niveau[] = ["oui", "lecture", "non"];
const PERIMETRES: Perimetre[] = ["siens", "siens-stricts", "tous"];
/* « administrateur » n'est pas un profil qu'on attribue ici : il découle du
   rôle du compte, qui se change dans la gestion des comptes. Le proposer dans
   cet écran ouvrirait un second chemin vers les pleins pouvoirs. */
const PROFILS_ATTRIBUABLES: Profil[] = ["responsable", "collaborateur"];

function niveauValide(v: unknown): v is Niveau {
  return typeof v === "string" && NIVEAUX.includes(v as Niveau);
}

/** Ne garde que des identifiants connus et des niveaux connus. */
function nettoyerDroits(brut: unknown): Record<string, Niveau> {
  const out: Record<string, Niveau> = {};
  if (!brut || typeof brut !== "object") return out;
  for (const [id, v] of Object.entries(brut as Record<string, unknown>)) {
    if (TOUS_LES_DROITS.includes(id) && niveauValide(v)) out[id] = v;
  }
  return out;
}

export async function GET() {
  const v = await exigerDroit("administration.droits");
  if ("refus" in v) return v.refus;

  const [reglages, comptes] = await Promise.all([lireReglages(true), getAllUsers()]);

  return NextResponse.json({
    reglages,
    comptes: comptes
      .map((c) => ({
        email: c.email,
        nom: c.name,
        role: c.role,
        ...droitsEffectifs(c.email, c.role === "admin" ? "admin" : "monteur", reglages),
      }))
      /* L'administrateur en tête : c'est la ligne qu'on vérifie en premier. */
      .sort((a, b) => (a.role === b.role ? a.nom.localeCompare(b.nom) : a.role === "admin" ? -1 : 1)),
  });
}

/**
 * Enregistre les réglages d'UN compte, ou les réglages généraux d'un profil.
 *
 * Corps attendu :
 *   { cible: "compte", email, profil?, droits?, perimetre? }
 *   { cible: "profil", profil, droits?, perimetre? }
 *   { cible: "reinitialiser", email }
 */
export async function PUT(request: NextRequest) {
  const v = await exigerDroit("administration.droits");
  if ("refus" in v) return v.refus;
  const auteur = v.user;

  let corps: Record<string, unknown>;
  try {
    corps = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête illisible" }, { status: 400 });
  }

  const cible = corps.cible;
  const comptes = await getAllUsers();

  const ok = await ecrireReglages((actuels) => {
    const suivants: Reglages = {
      version: 1,
      profils: { ...(actuels.profils || {}) },
      comptes: { ...(actuels.comptes || {}) },
      historique: [...(actuels.historique || [])],
    };
    const tracer = (sujet: string, resume: string) =>
      suivants.historique.push({
        quand: new Date().toISOString(),
        qui: auteur.name || auteur.email,
        cible: sujet,
        resume,
      });

    if (cible === "reinitialiser") {
      const email = String(corps.email || "").toLowerCase();
      if (!email || !suivants.comptes[email]) return null;
      const profilGarde = suivants.comptes[email].profil;
      delete suivants.comptes[email];
      if (profilGarde) suivants.comptes[email] = { profil: profilGarde };
      tracer(email, "Autorisations personnelles effacées : retour aux réglages généraux");
      return suivants;
    }

    if (cible === "compte") {
      const email = String(corps.email || "").toLowerCase();
      const compte = comptes.find((c) => c.email.toLowerCase() === email);
      if (!compte) return null;
      /* Un administrateur garde tout : on refuse d'enregistrer des
         restrictions qui, de toute façon, ne s'appliqueraient pas — mieux
         vaut un refus franc qu'un écran qui ment. */
      if (compte.role === "admin") return null;

      const avant = droitsEffectifs(email, "monteur", actuels);
      const existant = suivants.comptes[email] || {};
      const maj = { ...existant };

      if (typeof corps.profil === "string" && PROFILS_ATTRIBUABLES.includes(corps.profil as Profil)) {
        if (maj.profil !== corps.profil) tracer(email, `Profil : ${maj.profil || "collaborateur"} → ${corps.profil}`);
        maj.profil = corps.profil as Profil;
      }
      if (corps.droits !== undefined) maj.droits = nettoyerDroits(corps.droits);
      if (typeof corps.perimetre === "string" && PERIMETRES.includes(corps.perimetre as Perimetre)) {
        maj.perimetre = corps.perimetre as Perimetre;
      }
      suivants.comptes[email] = maj;

      const apres = droitsEffectifs(email, "monteur", suivants);
      for (const id of TOUS_LES_DROITS) {
        const a = avant.droits[id].niveau;
        const b = apres.droits[id].niveau;
        if (a !== b) tracer(email, resumeChangement(id, a, b));
      }
      if (avant.perimetre !== apres.perimetre) {
        tracer(email, `Projets visibles : ${avant.perimetre === "siens" ? "les siens" : "tous"} → ${apres.perimetre === "siens" ? "les siens" : "tous"}`);
      }
      return suivants;
    }

    if (cible === "profil") {
      const profil = corps.profil;
      if (typeof profil !== "string" || !PROFILS_ATTRIBUABLES.includes(profil as Profil)) return null;
      const p = profil as Profil;
      const existant = suivants.profils[p] || {};
      suivants.profils[p] = {
        ...existant,
        ...(corps.droits !== undefined ? { droits: nettoyerDroits(corps.droits) } : {}),
        ...(typeof corps.perimetre === "string" && PERIMETRES.includes(corps.perimetre as Perimetre)
          ? { perimetre: corps.perimetre as Perimetre }
          : {}),
      };
      tracer(p, "Réglages généraux du profil modifiés");
      return suivants;
    }

    return null;
  });

  if (!ok) {
    return NextResponse.json(
      { error: "Enregistrement impossible. Rien n'a été modifié." },
      { status: 400 },
    );
  }
  oublierCache();
  return NextResponse.json({ ok: true });
}
