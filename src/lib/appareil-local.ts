"use client";

/**
 * Ce que cet appareil peut dire de lui-même, sans rien de personnel : sa
 * plateforme, son système, et — dans l'app Apple — la version de l'app que
 * le pont natif rapporte. Jamais de nom d'appareil, jamais d'identifiant
 * matériel.
 */
import { dansAppApple, demanderAuPont } from "./pont-apple";
import { versionAppDepuisAgent } from "./version-web";
import type { Logiciel, Plateforme, SuiviNatif } from "./appareils";

/** La plateforme, d'après le navigateur. Un iPad se présente parfois en « Mac » : le toucher le trahit. */
export function plateformeLocale(ua = typeof navigator !== "undefined" ? navigator.userAgent : "", toucher = typeof navigator !== "undefined" ? navigator.maxTouchPoints : 0): Plateforme {
  if (/iPad/.test(ua)) return "iPad";
  if (/iPhone|iPod/.test(ua)) return "iPhone";
  if (/Android/.test(ua)) return "Android";
  if (/Macintosh/.test(ua)) return toucher > 1 ? "iPad" : "Mac";
  if (/Windows/.test(ua)) return "Windows";
  if (/Linux/.test(ua)) return "Linux";
  return "autre";
}

/**
 * Le système, quand le navigateur le dit honnêtement : « iOS 18.1 »,
 * « Android 15 ». Les navigateurs de bureau figent leur numéro de système
 * (macOS se dit toujours 10.15.7) : on n'en déduit rien, null.
 */
export function systemeNavigateur(ua = typeof navigator !== "undefined" ? navigator.userAgent : ""): string | null {
  const ios = /(?:iPhone|iPad|iPod).*? OS (\d+)[_.](\d+)/.exec(ua);
  if (ios) return `iOS ${ios[1]}.${ios[2]}`;
  const android = /Android (\d+(?:\.\d+)?)/.exec(ua);
  if (android) return `Android ${android[1]}`;
  return null;
}

/**
 * Le logiciel qui fait tourner l'app ici : l'app Apple, l'app web posée sur
 * l'écran d'accueil, ou le navigateur, par son nom. Sert à distinguer sur la
 * page Appareils les deux accès d'un même téléphone.
 */
export function logicielLocal(ua = typeof navigator !== "undefined" ? navigator.userAgent : ""): Logiciel {
  if (/TMRapportApp\//.test(ua)) return "app-apple";
  try {
    const autonome = (typeof navigator !== "undefined" && (navigator as unknown as { standalone?: boolean }).standalone === true)
      || (typeof window !== "undefined" && window.matchMedia?.("(display-mode: standalone)").matches);
    if (autonome) return "ecran-accueil";
  } catch { /* ignore */ }
  if (/Edg\//.test(ua)) return "Edge";
  if (/Firefox\/|FxiOS/.test(ua)) return "Firefox";
  if (/Chrome\/|CriOS/.test(ua)) return "Chrome";
  if (/Safari\//.test(ua)) return "Safari";
  return "navigateur";
}

let natifEnCache: SuiviNatif | null | undefined;

/**
 * Ce que l'app Apple dit d'elle (version, build, système, modèle générique).
 * null dans un navigateur. Une ancienne app qui ne connaît que « coque » rend
 * les autres champs null — affichés « Non disponible ».
 */
export async function infosNatives(): Promise<SuiviNatif | null> {
  if (natifEnCache !== undefined) return natifEnCache;
  if (!dansAppApple()) {
    const agent = versionAppDepuisAgent(typeof navigator !== "undefined" ? navigator.userAgent : "");
    natifEnCache = agent ? { coque: agent, build: null, systeme: null, versionSysteme: null, modele: null } : null;
    return natifEnCache;
  }
  const r = await demanderAuPont<Record<string, unknown>>({ action: "version" }, 3000);
  const txt = (v: unknown) => (typeof v === "string" && v ? v.slice(0, 16) : null);
  const agent = versionAppDepuisAgent(navigator.userAgent);
  if (!r) return { coque: agent, build: null, systeme: null, versionSysteme: null, modele: null }; // pas mis en cache : on réessaiera
  natifEnCache = {
    coque: txt(r.coque) ?? agent,
    build: txt(r.build),
    systeme: txt(r.systeme),
    versionSysteme: txt(r.versionSysteme),
    modele: txt(r.modele),
  };
  return natifEnCache;
}
