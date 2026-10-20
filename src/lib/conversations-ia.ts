/**
 * L'historique des conversations avec l'assistant IA, par utilisateur.
 *
 * L'assistant oubliait tout d'une question à l'autre : « et son adresse ? »
 * ne voulait rien dire, et fermer la fenêtre effaçait la conversation. Elle
 * est désormais gardée — chaque compte ne voit que les siennes — et la suite
 * d'une conversation est rendue au modèle, qui sait de quoi on parlait.
 *
 * Rangement : Redis, SANS expiration (ce n'est pas un cache).
 *   ia:convs:<e-mail>        la liste (id, titre, dates, nombre de messages)
 *   ia:conv:<e-mail>:<id>    les messages d'une conversation
 * Rien n'est jamais effacé automatiquement.
 */
import { redisGetJSON, redisSetJSONDurable } from "./redis-cache";

export interface MessageIa { role: "user" | "assistant"; texte: string; t: number }
export interface ConversationIa { id: string; titre: string; cree: number; maj: number; messages: MessageIa[] }
export interface ResumeConversation { id: string; titre: string; cree: number; maj: number; n: number }

const qui = (email: string) => email.trim().toLowerCase();
const CLE_LISTE = (email: string) => `ia:convs:${qui(email)}`;
const CLE_CONV = (email: string, id: string) => `ia:conv:${qui(email)}:${id}`;
const ID_VALIDE = /^[a-z0-9]{6,32}$/;

/** Un titre lisible : le début de la première question. */
export function titreDe(question: string): string {
  const t = question.replace(/\s+/g, " ").trim();
  return t.length > 60 ? `${t.slice(0, 57)}…` : t || "Conversation";
}

export async function listerConversations(email: string): Promise<ResumeConversation[]> {
  const l = await redisGetJSON<ResumeConversation[]>(CLE_LISTE(email)).catch(() => null);
  return (Array.isArray(l) ? l : []).sort((a, b) => b.maj - a.maj);
}

export async function lireConversation(email: string, id: string): Promise<ConversationIa | null> {
  if (!ID_VALIDE.test(id)) return null;
  const c = await redisGetJSON<ConversationIa>(CLE_CONV(email, id)).catch(() => null);
  return c && Array.isArray(c.messages) ? c : null;
}

/**
 * Ajoute une question et sa réponse. Sans identifiant (ou inconnu), une
 * nouvelle conversation commence. Rend l'identifiant de la conversation.
 */
export async function ajouterEchange(email: string, id: string | null, question: string, reponse: string): Promise<string> {
  const maintenant = Date.now();
  const existante = id ? await lireConversation(email, id) : null;
  const conv: ConversationIa = existante || {
    id: Math.random().toString(36).slice(2, 10) + maintenant.toString(36),
    titre: titreDe(question), cree: maintenant, maj: maintenant, messages: [],
  };
  conv.messages.push({ role: "user", texte: question, t: maintenant }, { role: "assistant", texte: reponse, t: Date.now() });
  conv.maj = Date.now();
  await redisSetJSONDurable(CLE_CONV(email, conv.id), conv);
  const liste = await listerConversations(email);
  const resume: ResumeConversation = { id: conv.id, titre: conv.titre, cree: conv.cree, maj: conv.maj, n: conv.messages.length };
  await redisSetJSONDurable(CLE_LISTE(email), [resume, ...liste.filter((x) => x.id !== conv.id)]);
  return conv.id;
}
