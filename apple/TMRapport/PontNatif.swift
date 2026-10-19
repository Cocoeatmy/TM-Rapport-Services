import Foundation
import WebKit

/// Le pont entre le site et l'application : `window.webkit.messageHandlers.tmCoffre`.
///
/// Le site s'en sert seulement s'il le trouve — dans un navigateur, il
/// n'existe pas, et rien ne change. Chaque message est une demande
/// `{ action, ... }`, et reçoit une réponse (une promesse côté JavaScript).
///
/// Seules les pages de TM Rapport, dans le cadre principal, y ont accès.
final class PontNatif: NSObject, WKScriptMessageHandlerWithReply {

    static let nom = "tmCoffre"

    let coffre: Coffre
    /// Le site signale ici ce qui attend encore (photos, saisies) : c'est ce
    /// qui décide s'il faut demander à iOS un moment en arrière-plan.
    var surEtat: (([String: Any]) -> Void)?

    private static let fileAttente = DispatchQueue(label: "tm.pont", qos: .userInitiated)

    init(coffre: Coffre) {
        self.coffre = coffre
    }

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage,
                               replyHandler: @escaping (Any?, String?) -> Void) {
        let hote = message.frameInfo.securityOrigin.host.lowercased()
        guard message.frameInfo.isMainFrame, Configuration.domainesInternes.contains(hote) else {
            replyHandler(nil, "refusé")
            return
        }
        guard let corps = message.body as? [String: Any], let action = corps["action"] as? String else {
            replyHandler(nil, "message illisible")
            return
        }
        // « version » lit l'appareil (UIKit) : réponse immédiate, sur le fil
        // principal, sans passer par la file des écritures.
        if action == "version" {
            replyHandler(Configuration.descriptionVersion(), nil)
            return
        }
        let coffre = self.coffre
        // Les écritures de fichiers ne bloquent pas l'interface, et passent
        // une par une, dans l'ordre d'arrivée : deux doubles successifs de la
        // file ne peuvent pas s'inverser.
        PontNatif.fileAttente.async { [weak self] in
            let (reponse, erreur) = PontNatif.traiter(action: action, corps: corps, coffre: coffre)
            DispatchQueue.main.async {
                if action == "etat", let e = corps["etat"] as? [String: Any] { self?.surEtat?(e) }
                replyHandler(reponse, erreur)
            }
        }
    }

    /// Sans état ni WebKit : testable tel quel.
    static func traiter(action: String, corps: [String: Any], coffre: Coffre) -> (Any?, String?) {
        switch action {

        case "version":
            return (Configuration.descriptionVersion(), nil)

        case "deposerPhoto":
            guard let id = corps["id"] as? String, let meta = corps["meta"] as? String,
                  let liste = corps["fichiers"] as? [[String: Any]] else { return (nil, "dépôt incomplet") }
            var fichiers: [Coffre.Fichier] = []
            for f in liste {
                guard let nom = f["nom"] as? String, let type = f["type"] as? String,
                      let b64 = f["base64"] as? String, let d = Data(base64Encoded: b64) else {
                    return (nil, "fichier illisible")
                }
                fichiers.append(.init(nom: nom, type: type, donnees: d))
            }
            do {
                let nouveau = try coffre.deposerPhoto(id: id, meta: meta, fichiers: fichiers)
                return (["ok": true, "nouveau": nouveau], nil)
            } catch {
                return (nil, "dépôt impossible : \(error)")
            }

        case "retirerPhoto":
            guard let id = corps["id"] as? String else { return (nil, "identifiant manquant") }
            do {
                try coffre.retirerPhoto(id: id, motif: corps["motif"] as? String ?? "confirme")
                return (["ok": true], nil)
            } catch {
                return (nil, "retrait impossible : \(error)")
            }

        case "local":
            guard let texte = corps["json"] as? String, let d = texte.data(using: .utf8) else {
                return (nil, "saisies illisibles")
            }
            do {
                try coffre.enregistrerLocal(d)
                return (["ok": true], nil)
            } catch {
                return (nil, "saisies impossibles : \(error)")
            }

        case "inventaire":
            let photos = coffre.photosEnAttente().map { ["id": $0.id, "meta": $0.meta] }
            let local = coffre.lireLocal().flatMap { String(data: $0, encoding: .utf8) }
            return (["photos": photos, "local": local.map { $0 as Any } ?? NSNull()], nil)

        case "photo":
            guard let id = corps["id"] as? String, let p = coffre.photo(id: id) else { return (nil, "introuvable") }
            return ([
                "meta": p.meta,
                "fichiers": p.fichiers.map { ["nom": $0.nom, "type": $0.type, "base64": $0.donnees.base64EncodedString()] },
            ], nil)

        case "etat":
            // Le site y joint ce qui attend chez lui ; on rend ce que garde le coffre.
            return (coffre.etat(), nil)

        default:
            return (nil, "action inconnue")
        }
    }
}
