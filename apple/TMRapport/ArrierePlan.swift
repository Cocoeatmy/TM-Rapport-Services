import Foundation
#if os(iOS)
import UIKit
import BackgroundTasks
#else
import AppKit
#endif

/// Envoyer ce qui attend, même quand on ne regarde plus l'application.
///
/// Ce qu'Apple permet, et rien de plus — il faut le dire franchement :
/// - en quittant l'app, iOS accorde une trentaine de secondes : l'envoi en
///   cours a le temps de finir ;
/// - ensuite, iOS réveille l'app quand IL le juge bon (réseau, batterie,
///   habitudes) : quelques minutes ou quelques heures plus tard. Ce n'est pas
///   une synchronisation permanente, et aucune app ne peut en promettre une ;
/// - une app fermée de force par l'utilisateur n'est plus réveillée avant
///   qu'il ne la rouvre. Rien n'est perdu pour autant : tout est dans la file
///   du site et dans le coffre, et part à la réouverture.
@MainActor
enum ArrierePlan {

    /// Envoi « de fond » : iOS le lance quand le réseau est là.
    static let idEnvoi = "TM.TM-Rapport.envoi"
    /// Réveil court et plus fréquent, selon l'usage de l'app.
    static let idReveil = "TM.TM-Rapport.reveil"

    #if os(iOS)
    private static var tacheFermeture: UIBackgroundTaskIdentifier = .invalid

    /// À faire avant la fin du lancement (AppDelegate).
    static func enregistrer() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: idEnvoi, using: .main) { tache in
            executer(tache)
        }
        BGTaskScheduler.shared.register(forTaskWithIdentifier: idReveil, using: .main) { tache in
            executer(tache)
        }
    }

    /// Demande à iOS un prochain réveil — seulement s'il reste quelque chose.
    static func programmer() {
        let envoi = BGProcessingTaskRequest(identifier: idEnvoi)
        envoi.requiresNetworkConnectivity = true
        envoi.requiresExternalPower = false
        envoi.earliestBeginDate = Date(timeIntervalSinceNow: 5 * 60)
        let reveil = BGAppRefreshTaskRequest(identifier: idReveil)
        reveil.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
        do { try BGTaskScheduler.shared.submit(envoi) } catch { journal("programmation envoi impossible : \(error)") }
        do { try BGTaskScheduler.shared.submit(reveil) } catch { journal("programmation réveil impossible : \(error)") }
    }

    private static func executer(_ tache: BGTask) {
        var termine = false
        let finir: (Bool) -> Void = { ok in
            guard !termine else { return }
            termine = true
            tache.setTaskCompleted(success: ok)
        }
        let travail = Task { @MainActor in
            let etat = await Navigateur.principal.synchroniser(raison: "arriere-plan", delai: 25)
            if etat == nil || Navigateur.principal.resteAEnvoyer > 0 { programmer() }
            finir(etat != nil)
        }
        tache.expirationHandler = {
            travail.cancel()
            Task { @MainActor in
                programmer()
                finir(false)
            }
        }
    }

    /// L'app passe en arrière-plan : on termine l'envoi en cours, puis on
    /// demande un réveil s'il reste quelque chose.
    static func auDepart() {
        guard tacheFermeture == .invalid else { return }
        tacheFermeture = UIApplication.shared.beginBackgroundTask(withName: "TM Rapport — envoi") {
            Task { @MainActor in
                programmer()
                terminerFermeture()
            }
        }
        Task { @MainActor in
            let etat = await Navigateur.principal.synchroniser(raison: "depart", delai: 22)
            if etat == nil || Navigateur.principal.resteAEnvoyer > 0 { programmer() }
            terminerFermeture()
        }
    }

    private static func terminerFermeture() {
        guard tacheFermeture != .invalid else { return }
        UIApplication.shared.endBackgroundTask(tacheFermeture)
        tacheFermeture = .invalid
    }
    #endif

    /// Retour au premier plan : on relance aussitôt.
    static func auRetour() {
        Task { @MainActor in await Navigateur.principal.synchroniser(raison: "retour") }
    }

    #if os(macOS)
    /// Quitter le Mac : une dernière tentative d'envoi ; et si quelque chose
    /// reste, on le dit — c'est gardé, et partira à la prochaine ouverture.
    static func avantDeQuitter(_ repondre: @escaping (Bool) -> Void) {
        Task { @MainActor in
            await Navigateur.principal.synchroniser(raison: "quitter", delai: 8)
            let reste = Navigateur.principal.resteAEnvoyer
            guard reste > 0 else { repondre(true); return }
            let a = NSAlert()
            a.messageText = "Des éléments ne sont pas encore envoyés"
            a.informativeText = "\(reste) élément(s) attendent le serveur. Ils restent enregistrés sur ce Mac et partiront à la prochaine ouverture de TM Rapport."
            a.addButton(withTitle: "Quitter")
            a.addButton(withTitle: "Rester")
            repondre(a.runModal() == .alertFirstButtonReturn)
        }
    }
    #endif

    private static func journal(_ t: String) {
        if Configuration.diagnostic { print("[TMRapport] ARRIÈRE-PLAN \(t)"); fflush(stdout) }
    }
}
