import SwiftUI
#if os(iOS)
import UIKit
#else
import AppKit
#endif

/// Les `alert()`, `confirm()` et `prompt()` du site.
///
/// Le site s'en sert vingt-sept fois — dont treize confirmations avant une
/// suppression. Une vue web d'application ne les affiche pas d'elle-même :
/// sans ce fichier, chaque `confirm()` répondrait « non » sans rien montrer,
/// et le bouton « Supprimer » semblerait ne rien faire.
@MainActor
enum Dialogues {

    static func alerte(_ message: String) async {
        #if os(iOS)
        await withCheckedContinuation { (suite: CheckedContinuation<Void, Never>) in
            let a = UIAlertController(title: nil, message: message, preferredStyle: .alert)
            a.addAction(UIAlertAction(title: "OK", style: .default) { _ in suite.resume() })
            guard presenter(a) else { suite.resume(); return }
        }
        #else
        let a = NSAlert()
        a.messageText = "TM Rapport"
        a.informativeText = message
        a.addButton(withTitle: "OK")
        a.runModal()
        #endif
    }

    static func confirmation(_ message: String) async -> Bool {
        #if os(iOS)
        return await withCheckedContinuation { (suite: CheckedContinuation<Bool, Never>) in
            let a = UIAlertController(title: nil, message: message, preferredStyle: .alert)
            a.addAction(UIAlertAction(title: "Annuler", style: .cancel) { _ in suite.resume(returning: false) })
            a.addAction(UIAlertAction(title: "OK", style: .default) { _ in suite.resume(returning: true) })
            guard presenter(a) else { suite.resume(returning: false); return }
        }
        #else
        let a = NSAlert()
        a.messageText = "TM Rapport"
        a.informativeText = message
        a.addButton(withTitle: "OK")
        a.addButton(withTitle: "Annuler")
        return a.runModal() == .alertFirstButtonReturn
        #endif
    }

    static func saisie(_ question: String, valeur: String?) async -> String? {
        #if os(iOS)
        return await withCheckedContinuation { (suite: CheckedContinuation<String?, Never>) in
            let a = UIAlertController(title: nil, message: question, preferredStyle: .alert)
            a.addTextField { $0.text = valeur }
            a.addAction(UIAlertAction(title: "Annuler", style: .cancel) { _ in suite.resume(returning: nil) })
            a.addAction(UIAlertAction(title: "OK", style: .default) { [weak a] _ in
                suite.resume(returning: a?.textFields?.first?.text ?? "")
            })
            guard presenter(a) else { suite.resume(returning: nil); return }
        }
        #else
        let a = NSAlert()
        a.messageText = "TM Rapport"
        a.informativeText = question
        let champ = NSTextField(frame: NSRect(x: 0, y: 0, width: 280, height: 24))
        champ.stringValue = valeur ?? ""
        a.accessoryView = champ
        a.addButton(withTitle: "OK")
        a.addButton(withTitle: "Annuler")
        a.window.initialFirstResponder = champ
        return a.runModal() == .alertFirstButtonReturn ? champ.stringValue : nil
        #endif
    }

    #if os(iOS)
    /// Présente par-dessus ce qui est à l'écran — y compris une feuille
    /// déjà ouverte (une fenêtre secondaire peut elle aussi demander une
    /// confirmation). Rend `false` s'il n'y a nulle part où présenter.
    @discardableResult
    static func presenter(_ controleur: UIViewController) -> Bool {
        guard let haut = controleurDuHaut() else { return false }
        if let pop = controleur.popoverPresentationController {
            pop.sourceView = haut.view
            pop.sourceRect = CGRect(x: haut.view.bounds.midX, y: haut.view.bounds.midY, width: 1, height: 1)
            pop.permittedArrowDirections = []
        }
        haut.present(controleur, animated: true)
        return true
    }

    static func controleurDuHaut() -> UIViewController? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let fenetre = scenes.flatMap(\.windows).first { $0.isKeyWindow } ?? scenes.first?.windows.first
        var haut = fenetre?.rootViewController
        while let suivant = haut?.presentedViewController, !suivant.isBeingDismissed { haut = suivant }
        return haut
    }
    #endif
}
