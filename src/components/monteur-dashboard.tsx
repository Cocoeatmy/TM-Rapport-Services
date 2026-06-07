"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { prefetchProject } from "@/lib/api-helpers";
import { Calendar, MapPin, Clock, ChevronRight, ChevronLeft, ChevronDown, ChevronUp, Box, Truck, Users, BarChart3, Navigation, Route, Ruler, Wrench, Settings, AlertTriangle, AlertCircle, FolderOpen, Receipt, ShieldAlert, CalendarDays, Archive, X, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getCollaboratorColor, getCollaboratorInitials } from "@/lib/collaborators";
import { COLLABORATEURS_LIST, TEAM_EXCLUDED_COLLABORATORS } from "@/lib/constants";
import type { Project } from "@/lib/notion";
import { PersonalStats } from "@/components/personal-stats";

// ─── Citations motivantes quotidiennes (365) ────────────────────────────────
const DAILY_QUOTES: string[] = [
  // 1–30 : Qualité & précision
  "La qualité n'est jamais un accident, c'est le résultat d'un effort intelligent.",
  "Le détail fait toute la différence.",
  "La précision d'aujourd'hui, c'est la satisfaction du client demain.",
  "Mieux vaut prendre le temps de bien faire que de devoir refaire.",
  "L'excellence est une habitude, pas un exploit.",
  "Le professionnalisme se voit dans les finitions.",
  "Soigne tes débuts autant que tes finitions.",
  "La qualité se souvient longtemps après que le prix soit oublié.",
  "Travailler vite c'est bien, travailler juste c'est mieux.",
  "Ce n'est pas le travail qui use, c'est le travail mal fait.",
  "Un travail sans faute, c'est un client sans doute.",
  "Le millimètre est l'ami de l'artisan.",
  "Pose-le bien la première fois, tu n'auras pas à y retourner.",
  "La précision n'est pas un luxe, c'est un standard.",
  "Chaque geste parfait est le fruit d'un geste raté appris.",
  "L'œil du professionnel voit ce que le client remarquera.",
  "Une belle pose commence par une bonne préparation.",
  "La rigueur d'aujourd'hui évite les retours de demain.",
  "Le client ne voit pas l'effort, il voit le résultat.",
  "Faire simple, faire bien, faire vite — dans cet ordre.",
  "Un chantier propre reflète un esprit ordonné.",
  "Ce que tu construis aujourd'hui tient debout pour des années.",
  "Le travail bien fait parle pour lui-même.",
  "La maîtrise vient de la répétition avec attention.",
  "Chaque cabine posée est une marque de ton expertise.",
  "Vise la perfection, accepte l'excellence.",
  "La précision est la politesse des artisans.",
  "Un bon outil bien utilisé vaut mieux que dix mal employés.",
  "La qualité ne se contrôle pas, elle se construit.",
  "Chaque vis serrée au bon couple, c'est une garantie de tenue.",
  // 31–60 : Attitude & motivation
  "Aujourd'hui, donne le meilleur de toi-même.",
  "Fais-le avec passion ou ne le fais pas du tout.",
  "L'attitude détermine l'altitude.",
  "La bonne humeur sur le chantier, ça s'installe aussi.",
  "Chaque journée est une nouvelle occasion de faire du bon travail.",
  "Commence bien ta journée et elle finira bien.",
  "Ton état d'esprit fait la moitié du travail.",
  "Un sourire au client vaut autant qu'un joint parfait.",
  "Le meilleur moment pour bien travailler, c'est maintenant.",
  "L'enthousiasme est contagieux — répands-le sur le chantier.",
  "Aujourd'hui est le bon jour pour faire du bon travail.",
  "Mets de l'énergie dans ce que tu fais, elle te reviendra.",
  "Un artisan heureux fait un travail remarquable.",
  "Chaque matin est une page blanche à remplir avec soin.",
  "Ne travaille pas pour finir la journée, travaille pour la réussir.",
  "L'optimisme est l'outil le plus léger et le plus puissant.",
  "Fais de ton mieux et laisse le reste suivre.",
  "La fierté de bien faire vaut mieux que la hâte de terminer.",
  "Un esprit positif produit un résultat positif.",
  "Aime ce que tu fais et fais-le bien.",
  "Chaque journée sans incident est une journée parfaite.",
  "La passion pour le métier est le meilleur des moteurs.",
  "La motivation vient de l'action, pas l'inverse.",
  "Commence avec intention, termine avec satisfaction.",
  "Le soleil se lève pour ceux qui se lèvent tôt.",
  "Un artisan passionné ne travaille jamais vraiment.",
  "Donne-toi à fond, même quand personne ne regarde.",
  "La constance dans l'effort, c'est la clé de tout.",
  "Ta manière de faire les petites choses révèle comment tu fais les grandes.",
  "Chaque journée bien travaillée est un cadeau que tu fais à demain.",
  // 61–90 : Savoir-faire & métier
  "Ton savoir-faire est ta signature.",
  "L'artisanat est un art qui se vit au quotidien.",
  "Un bon artisan ne blâme jamais ses outils.",
  "La fierté du métier, c'est ce qui nous distingue.",
  "Prends soin de tes outils, ils prendront soin de toi.",
  "Chaque outil a sa place, chaque geste a son sens.",
  "Le métier s'apprend en faisant, en ratant, en refaisant.",
  "L'expérience est une école qui ne ferme jamais.",
  "Un monteur qui aime son métier, ça se voit dès l'entrée.",
  "La technique sans amour du métier reste froide.",
  "Maîtriser son art, c'est transformer la contrainte en liberté.",
  "Le vrai professionnel rend le difficile facile.",
  "Chaque journée de travail enrichit ton bagage de compétences.",
  "L'habileté manuelle est une intelligence que les mains expriment.",
  "Un bon monteur laisse un chantier mieux qu'il ne l'a trouvé.",
  "Le savoir-faire s'acquiert mais la passion se porte.",
  "Connais ton métier, aime ton métier.",
  "La compétence s'affûte comme un outil : à force d'usage.",
  "Un vrai professionnel continue d'apprendre toute sa vie.",
  "Le métier est une fierté que personne ne peut t'enlever.",
  "Les mains habiles font les chantiers réussis.",
  "Un artisan reconnu le devient geste après geste.",
  "La technique parfaite naît d'une curiosité insatiable.",
  "Apprendre un nouveau tour de main, c'est grandir.",
  "Le talent c'est bien, le travail c'est tout.",
  "Chaque chantier t'enseigne quelque chose si tu restes attentif.",
  "Un monteur expérimenté voit la solution avant le problème.",
  "L'expertise ne tombe pas du ciel, elle se pose cabine après cabine.",
  "Sois le monteur dont tu aurais voulu être le client.",
  "La maîtrise du métier donne une liberté que rien d'autre ne procure.",
  // 91–120 : Persévérance & résilience
  "La persévérance transforme un chantier difficile en réussite.",
  "Chaque problème rencontré est une compétence gagnée.",
  "Petit à petit, le chantier se fait.",
  "La régularité bat le génie paresseux.",
  "Les obstacles sont des marches, pas des murs.",
  "Ce qui résiste renforce.",
  "Un chantier compliqué est une histoire mémorable.",
  "Quand c'est dur, souviens-toi pourquoi tu l'as commencé.",
  "La difficulté d'aujourd'hui forge le professionnel de demain.",
  "Chaque défi d'aujourd'hui est une victoire de demain.",
  "Rien de grand ne se fait sans effort.",
  "Tiens bon — les meilleurs chantiers ont leurs imprévus.",
  "Le courage, c'est continuer quand c'est difficile.",
  "Ne te laisse pas arrêter par ce que tu ne sais pas encore.",
  "Un problème n'est qu'une solution qui attend d'être trouvée.",
  "La fatigue du soir est la preuve d'une journée bien remplie.",
  "Chaque épreuve traverse, aucune ne dure.",
  "Le recul face à un problème, c'est souvent la meilleure avancée.",
  "Persist — la solution existe toujours.",
  "Tomber n'est pas échouer, rester à terre serait échouer.",
  "L'artisan tenace finit toujours par trouver la bonne cote.",
  "Quand la journée est longue, pense au résultat final.",
  "La ténacité est la force tranquille qui fait avancer.",
  "Un problème de chantier résolu te rend plus fort pour le prochain.",
  "La résistance fait partie du chemin, pas un détour.",
  "Chaque minute de difficulté porte une leçon.",
  "Ce qui ne te bloque pas te rend plus habile.",
  "La patience est une compétence technique à part entière.",
  "Un bon artisan ne panique pas, il réfléchit.",
  "La solution est toujours plus proche que le problème ne le laisse croire.",
  // 121–150 : Travail d'équipe
  "Le travail d'équipe multiplie les résultats.",
  "Confiance en soi, confiance en son équipe.",
  "Un bon binôme vaut mieux que deux solos.",
  "Ce qu'on fait ensemble dure plus longtemps.",
  "Partager une compétence, c'est la doubler.",
  "Ensemble on monte plus vite, seul on monte plus haut — ensemble on monte mieux.",
  "Un chantier réussi en équipe, c'est une fierté partagée.",
  "Aide ton collègue aujourd'hui, il t'aidera demain.",
  "L'équipe soudée traverse les chantiers les plus difficiles.",
  "Respect et entraide — les deux piliers de l'équipe.",
  "Un mot d'encouragement au bon moment change une journée.",
  "Chaque membre de l'équipe est un maillon indispensable.",
  "Le chef d'équipe qui tire vers le haut élève tout le monde.",
  "Communiquer sur le chantier, c'est déjà sécuriser le chantier.",
  "La solidarité entre collègues, ça ne se voit pas mais ça se ressent.",
  "Un collègue bien informé est un chantier bien coordonné.",
  "Partager ses astuces, c'est investir dans l'équipe entière.",
  "La force d'une équipe, c'est chacun à sa place.",
  "Reconnaître le travail des autres, c'est renforcer l'équipe.",
  "Un chantier se fait à plusieurs, même quand on y travaille seul.",
  "Savoir demander de l'aide est une compétence, pas une faiblesse.",
  "L'équipe qui communique est l'équipe qui performe.",
  "Être fiable pour ses collègues, c'est être professionnel.",
  "Ce que tu apportes à l'équipe se mesure en journées réussies.",
  "Un bon collègue laisse le chantier prêt pour le suivant.",
  "La bienveillance au travail est le ciment de la cohésion.",
  "Travailler ensemble réduit les erreurs de moitié.",
  "L'harmonie sur le chantier se ressent dans le résultat final.",
  "Un binôme efficace, c'est deux esprits concentrés sur une solution.",
  "La confiance entre collègues se construit montage après montage.",
  // 151–180 : Sécurité & organisation
  "La sécurité n'est pas une option, c'est une priorité.",
  "Un chantier organisé est un chantier sécurisé.",
  "Range ton espace de travail, range ta tête.",
  "La prévention coûte moins cher que l'accident.",
  "Un incident évité, c'est une journée préservée.",
  "Anticipe les risques avant qu'ils deviennent des problèmes.",
  "La sécurité de chacun est la responsabilité de tous.",
  "Un bon monteur rentre chez lui entier chaque soir.",
  "Vérifie deux fois, pose une fois.",
  "La prudence sur le chantier n'est pas de la lenteur.",
  "Un EPI bien porté, c'est un risque éliminé.",
  "L'organisation est la première des sécurités.",
  "Signale tout incident, même le plus petit — il protège le prochain.",
  "La routine de sécurité, c'est l'assurance de finir la journée.",
  "Un chantier rangé à la fin de la journée, c'est un départ facilité demain.",
  "Ne jamais couper au court sur la sécurité.",
  "L'ordre sur le chantier commence par l'ordre dans ses habitudes.",
  "Un environnement de travail propre réduit les accidents.",
  "Anticiper, c'est la meilleure des protections.",
  "Chaque mesure de sécurité respectée protège toute l'équipe.",
  "La check-list n'est pas une contrainte, c'est une protection.",
  "Un outil rangé est un outil qu'on retrouve et qui ne blesse pas.",
  "Prendre le temps de sécuriser, c'est gagner du temps à long terme.",
  "La vigilance est un outil qu'on affûte chaque jour.",
  "Zéro incident sur le chantier — l'objectif de chaque journée.",
  "La sécurité est le seul domaine où l'excès de prudence est une vertu.",
  "Connaître les risques, c'est déjà les réduire de moitié.",
  "Un professionnel sécurisé est un professionnel efficace.",
  "La discipline de sécurité est la marque du vrai artisan.",
  "Se protéger, c'est respecter sa famille qui attend à la maison.",
  // 181–210 : Client & service
  "Le respect du client commence par le respect de son espace.",
  "Un client satisfait en parle à deux, un client ravi en parle à dix.",
  "La confiance du client se gagne à chaque intervention.",
  "Laisse le chantier plus propre que tu ne l'as trouvé.",
  "Le client ne paie pas ta présence, il paie ton résultat.",
  "Un sourire et un bonjour, le premier outil du service client.",
  "La ponctualité, c'est respecter le temps de tout le monde.",
  "Un client informé est un client rassuré.",
  "Traite chaque maison comme si c'était la tienne.",
  "Le soin apporté aux détails, le client le remarque toujours.",
  "Un chantier fini à l'heure, c'est une promesse tenue.",
  "La relation client se joue aussi dans les petites attentions.",
  "Un bon artisan explique ce qu'il fait — ça rassure et ça valorise.",
  "Respecte les lieux de vie du client comme les tiens.",
  "La discrétion sur le chantier d'un particulier est une marque de respect.",
  "Le client se souvient de comment tu l'as traité, pas seulement de ce que tu as fait.",
  "Un chantier rendu propre est la meilleure des publicités.",
  "Répondre aux questions du client, c'est l'associer à la réussite.",
  "La confiance d'un client fidèle vaut mieux que dix clients ponctuels.",
  "Chaque interaction avec le client est une chance de briller.",
  "Annonce les délais honnêtement — mieux vaut une surprise positive.",
  "Un client bien accueilli oublie un léger retard.",
  "L'image de l'entreprise, c'est toi qui la portes sur le chantier.",
  "Le bouche-à-oreille se construit visite après visite.",
  "Ta présentation soignée rassure le client avant même de commencer.",
  "Un artisan poli et compétent — le combo imbattable.",
  "Écouter le client, c'est déjà résoudre la moitié du problème.",
  "La satisfaction client est la meilleure des récompenses.",
  "Dépasse les attentes du client sans lui promettre plus que ce que tu peux tenir.",
  "Un client heureux, c'est la meilleure fiche de paie.",
  // 211–240 : Croissance & apprentissage
  "Chaque journée est une opportunité d'apprendre quelque chose de nouveau.",
  "Le meilleur investissement reste l'amélioration de soi.",
  "Ne cesse jamais d'apprendre — le métier évolue avec toi.",
  "Ce que tu fais aujourd'hui prépare qui tu seras demain.",
  "L'erreur n'est pas un échec si elle t'enseigne quelque chose.",
  "Chaque question posée est un pas vers la maîtrise.",
  "La curiosité est le moteur du professionnel qui progresse.",
  "Apprendre d'un collègue expérimenté, c'est gagner des années.",
  "Observe, pratique, améliore — la boucle du progrès.",
  "Un bon artisan ne cesse jamais d'être un apprenti.",
  "La formation d'aujourd'hui est le résultat de demain.",
  "Accepte les remarques constructives — elles valent de l'or.",
  "Progresser d'1% par jour, c'est 37 fois meilleur en un an.",
  "Le savoir partagé est le savoir multiplié.",
  "Chaque nouveau chantier est une formation déguisée.",
  "L'apprentissage continu est le privilège de ceux qui restent humbles.",
  "La remise en question est le signe d'un esprit qui grandit.",
  "Ce que tu ne sais pas encore est une richesse à venir.",
  "Demande conseil — les meilleurs le font toujours.",
  "Ton expertise d'aujourd'hui est l'accumulation de tes curiosités passées.",
  "Chaque difficulté surmontée élargit ton horizon professionnel.",
  "Reste curieux, reste compétent.",
  "Apprendre une nouvelle technique, c'est ouvrir une nouvelle porte.",
  "L'humilité d'apprendre est la marque des grands professionnels.",
  "Investis dans ta formation comme dans tes outils.",
  "Chaque retour d'expérience est une mine d'or.",
  "La connaissance acquise ne pèse rien et vaut tout.",
  "Un artisan qui progresse élève toute l'équipe avec lui.",
  "La formation permanente, c'est l'assurance emploi du futur.",
  "Apprendre, c'est refuser de rester où tu en es.",
  // 241–270 : Discipline & régularité
  "La discipline est le pont entre les objectifs et les résultats.",
  "Ne compte pas les heures, fais que les heures comptent.",
  "La régularité bat le génie paresseux.",
  "Un chantier réussi commence dans la tête.",
  "Travaille dur en silence, laisse le résultat faire le bruit.",
  "La constance est la mère du succès.",
  "Montre-toi chaque jour, même quand la motivation manque.",
  "La routine bien construite libère l'esprit pour l'essentiel.",
  "Ce sont les petites habitudes quotidiennes qui font les grandes carrières.",
  "Un professionnel fait son travail même sans qu'on le surveille.",
  "La ponctualité est la première des disciplines.",
  "Fais ce que tu as dit que tu ferais — c'est la base.",
  "L'intégrité sur le chantier, c'est travailler pareil qu'on te regarde ou non.",
  "La régularité dans l'effort produit des résultats constants.",
  "Un bon monteur, c'est d'abord quelqu'un de fiable.",
  "L'auto-discipline, c'est le superpouvoir du professionnel.",
  "Ce que tu fais chaque jour te définit mieux que ce que tu fais parfois.",
  "La cohérence entre les mots et les actes — voilà le vrai professionnalisme.",
  "Tiens tes engagements envers ton équipe comme envers ton client.",
  "Chaque journée de travail sérieux s'additionne à la précédente.",
  "Un artisan organisé ne perd pas de temps à chercher ce qu'il a rangé.",
  "Fais d'abord ce qui est nécessaire, ensuite ce qui est possible.",
  "Le sérieux au quotidien construit une réputation solide.",
  "La méthode est l'alliée de l'efficacité.",
  "Un planning respecté est un client confiant.",
  "La discipline protège ta liberté — elle te libère du chaos.",
  "Commence par la tâche la plus difficile, le reste devient facile.",
  "Être professionnel, c'est être prévisible dans l'excellence.",
  "Ce qu'on fait régulièrement finit par nous définir.",
  "La rigueur quotidienne, c'est le respect de son propre travail.",
  // 271–300 : Fierté & sens du métier
  "Chaque chantier terminé est une fierté bâtie de tes mains.",
  "Un monteur fier de son travail, c'est un client qui revient.",
  "Ta réputation se construit projet après projet.",
  "Construire, c'est laisser une trace durable.",
  "L'artisanat est un art qui se vit au quotidien.",
  "Tes mains fabriquent ce que d'autres ne peuvent qu'imaginer.",
  "Le travail manuel est une noblesse trop souvent oubliée.",
  "Être artisan, c'est signer chaque ouvrage de sa fierté.",
  "Ce que tu poses durera des décennies — pense-y en le faisant.",
  "La cabine posée ce matin embellira une vie pour des années.",
  "Ton métier a un impact réel sur la vie quotidienne des gens.",
  "Rares sont ceux qui peuvent dire : j'ai bâti ça de mes mains.",
  "La satisfaction du travail accompli vaut tout.",
  "Chaque intervention bien réalisée est une petite victoire.",
  "Le sens du métier, c'est comprendre pourquoi ce qu'on fait compte.",
  "Derrière chaque cabine posée, il y a quelqu'un qui va en profiter chaque jour.",
  "Prends la mesure de ce que tu apportes — c'est plus que tu ne le crois.",
  "L'artisan est le lien entre le rêve du client et sa réalité.",
  "Porter son métier avec fierté, c'est le plus bel uniforme.",
  "Le résultat de tes mains, peu d'ordinateurs peuvent le reproduire.",
  "Construire, réparer, améliorer — un métier au service de la vie.",
  "La beauté d'un chantier bien exécuté est une œuvre d'art fonctionnelle.",
  "Ton travail améliore concrètement le quotidien des gens.",
  "Un artisan accompli est une ressource rare et précieuse.",
  "La valeur du travail bien fait est intemporelle.",
  "Ce n'est pas juste poser une cabine, c'est créer un espace de bien-être.",
  "Sois fier de ce que tu fais — peu de gens savent faire ce que tu sais.",
  "Ton expertise est un cadeau que tu offres à tes clients.",
  "L'artisan laisse toujours une trace — fais que la tienne soit belle.",
  "Chaque ouvrage achevé est une histoire de compétence et de soin.",
  // 301–330 : Énergie & vitalité
  "Bien commencer la journée, c'est déjà la réussir à moitié.",
  "Un monteur organisé, c'est un chantier maîtrisé.",
  "L'effort d'aujourd'hui construit le confort de demain.",
  "Un chantier propre, un esprit clair.",
  "La confiance se gagne millimètre par millimètre.",
  "Prends soin de toi pour prendre soin de ton travail.",
  "Un corps en forme, des gestes plus précis.",
  "Mange bien, dors bien — le chantier t'en remerciera.",
  "L'énergie que tu mets le matin se retrouve dans le résultat du soir.",
  "Une pause bien prise est une productivité regagnée.",
  "Respecte tes limites pour aller plus loin sur la durée.",
  "La santé est l'outil de base — entretiens-la.",
  "Un esprit reposé fait des mesures justes.",
  "Commence avec élan, maintiens le cap, finis en force.",
  "La fatigue s'anticipe — hydrate-toi, bois, respire.",
  "Un artisan qui prend soin de lui dure plus longtemps dans le métier.",
  "L'endurance professionnelle commence par l'hygiène de vie.",
  "Célèbre chaque fin de journée réussie — tu le mérites.",
  "La vitalité au travail commence par une bonne nuit de sommeil.",
  "Prends l'air à la pause — l'oxygène affûte l'esprit.",
  "Un corps en mouvement, un esprit en éveil.",
  "Prendre soin de soi, c'est prendre soin de ses clients.",
  "La récupération fait partie de la performance.",
  "Ménage ton dos aujourd'hui pour travailler demain.",
  "Un monteur en forme, c'est moins d'accidents et plus de qualité.",
  "Le bien-être au travail commence par les bonnes habitudes.",
  "L'énergie positive d'un artisan se voit dans son ouvrage.",
  "Gère ton énergie comme ton matériel — avec soin.",
  "Une journée bien commencée est une victoire sur la fatigue.",
  "Le professionnel durable prend soin de sa machine : lui-même.",
  // 331–365 : Citations universelles adaptées
  "Le succès, c'est la somme de petits efforts répétés chaque jour.",
  "L'excellence est le résultat cumulé de l'effort journalier.",
  "Chaque jour est une nouvelle chance d'être meilleur qu'hier.",
  "Ta valeur ne dépend pas de ce que tu produis vite, mais de ce que tu produis bien.",
  "Le vrai luxe, c'est un travail dont on peut être fier.",
  "Ne cherche pas à être le meilleur — cherche à être irréprochable.",
  "Ce qui se mesure s'améliore.",
  "L'amélioration continue n'a pas de ligne d'arrivée.",
  "Fais aujourd'hui ce que les autres remettent à demain.",
  "La chance sourit à ceux qui se préparent.",
  "Chaque matin apporte une page blanche — écris-y quelque chose de bien.",
  "Le travail est la seule monnaie qui garde toujours sa valeur.",
  "La réussite n'est pas une destination, c'est une façon de voyager.",
  "Travaille sur ce que tu contrôles, lâche ce que tu ne peux pas changer.",
  "La grandeur se cache dans les détails ordinaires.",
  "Ce que tu offres comme qualité aujourd'hui, tu le retrouves en réputation demain.",
  "La confiance vient du travail, pas des mots.",
  "Il n'y a pas de petits chantiers — il y a des petits efforts.",
  "Un professionnel prépare pendant que les autres improvident.",
  "L'habitude d'excellence est une seconde nature qui se cultive.",
  "Fais de chaque tâche un chef-d'œuvre miniature.",
  "Le temps consacré à bien faire n'est jamais du temps perdu.",
  "Ta réputation arrive avant toi sur le chantier.",
  "Sois la personne sur qui ton équipe peut compter.",
  "La cohérence est la marque des grands professionnels.",
  "Travaille avec tes mains, pense avec ta tête, agis avec ton cœur.",
  "Le premier pas vers l'excellence, c'est de décider de l'atteindre.",
  "Chaque outil bien rangé est une minute gagnée demain.",
  "Mets ton nom sur ton travail — et assure-toi d'en être fier.",
  "Le soin que tu mets dans ton travail dit tout de toi.",
  "L'art du monteur, c'est de rendre l'invisible parfait.",
  "Chaque chantier est une promesse — honore-la.",
  "Bien faire vaut mieux que beaucoup faire.",
  "Le professionnel qui ne s'améliore pas recule.",
  "Termine chaque journée en ayant fait de ton mieux — c'est tout ce qu'on te demande.",
];

/** Retourne une citation différente par jour et par prénom */
function getDailyQuote(firstName: string): string {
  const now = new Date();
  const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000);
  const nameHash = firstName.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return DAILY_QUOTES[(dayOfYear + nameHash) % DAILY_QUOTES.length];
}
// ────────────────────────────────────────────────────────────────────────────

// scale : facteur d'agrandissement CSS pour compenser le whitespace natif du fichier.
// BMS (418×120, ratio 3.5:1) = référence visuelle → scale 1.
// Dubat (1200×675) et Duka (1200×630) ont beaucoup de marge → scale 1.7.
// Logos carrés (Matway, Nelo, Samo, Ronal) → scale 1.5.
// whiteOnTransparent : logo blanc sur fond transparent → invisible avec mix-blend-multiply.
//   En mode clair : brightness(0) le rend noir. En dark : invert(1) le garde blanc.
const CLIENT_LOGOS: { prefix: string; logo: string; scale?: number; whiteOnTransparent?: boolean }[] = [
  { prefix: "getaz",      logo: "/logos/fournisseurs/BMS-Logo.png" },
  { prefix: "gétaz",      logo: "/logos/fournisseurs/BMS-Logo.png" },
  { prefix: "duka",       logo: "/logos/fournisseurs/duka.ch-logo.png",    scale: 1.3 },
  { prefix: "duscholux",  logo: "/logos/fournisseurs/Duscholux-logo.png",  scale: 1.3 },
  { prefix: "ronal",      logo: "/logos/fournisseurs/ronal-logo-v2.png",   scale: 1.5 },
  { prefix: "nelo",       logo: "/logos/fournisseurs/Nelo-logo.jpg",       scale: 1.5 },
  { prefix: "novellini",  logo: "/logos/fournisseurs/Novellini-logo.png",  scale: 1.2, whiteOnTransparent: true },
  { prefix: "samo",       logo: "/logos/fournisseurs/Samo-logo.jpg",       scale: 1.5 },
  { prefix: "dubat",      logo: "/logos/fournisseurs/Dubat-Logo.png",      scale: 1.3 },
  { prefix: "tema",       logo: "/logos/fournisseurs/Tema-Logo.png",       scale: 1.4 },
  { prefix: "matway",     logo: "/logos/fournisseurs/Matway-Logo.png",     scale: 1.5 },
  { prefix: "bringhen",   logo: "/logos/fournisseurs/Bringhen-logo.jpg" },
];

/** Supprime les accents pour comparaison tolérante (Gétaz ↔ getaz). */
function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Table de scale indexée par chemin de logo.
// Calculée une seule fois à partir de CLIENT_LOGOS.scale.
const LOGO_SCALE_MAP: Record<string, number> = Object.fromEntries(
  CLIENT_LOGOS.filter((c) => c.scale).map((c) => [c.logo, c.scale as number])
);

// Logos blancs sur fond transparent : nécessitent un filtre pour être visibles sur fond clair.
const LOGO_WHITE_SET = new Set(
  CLIENT_LOGOS.filter((c) => c.whiteOnTransparent).map((c) => c.logo)
);

function getClientLogo(projectName: string): string | null {
  // Double normalisation : NFC (forme précomposée) ET sans accents.
  const lowerNFC = projectName.toLowerCase().normalize("NFC");
  const lowerStripped = stripAccents(projectName.toLowerCase());
  const match = CLIENT_LOGOS.find((c) => {
    const prefixNFC = c.prefix.normalize("NFC");
    const prefixStripped = stripAccents(c.prefix);
    return lowerNFC.startsWith(prefixNFC) || lowerStripped.startsWith(prefixStripped);
  });
  return match ? match.logo : null;
}

/**
 * Retourne le logo uniquement si le titre du projet COMMENCE par un préfixe connu.
 * Les clients finaux et sanitaires n'ont pas de logo.
 */
function getBestLogo(projectName: string, _fournisseurs?: string[]): string | null {
  return getClientLogo(projectName);
}

/**
 * Boîte uniforme pour tous les logos.
 * overflow-visible : garantit que le logo n'est jamais coupé.
 * Le scale compense le whitespace natif de chaque fichier image.
 * marginRight dynamique : évite que le logo zoomé empiète sur le cercle d'initiales.
 */
function LogoImg({ src }: { src: string }) {
  const scale = LOGO_SCALE_MAP[src] ?? 1;
  const isWhite = LOGO_WHITE_SET.has(src);
  // Décalage droit pour compenser le débordement visuel du zoom sans clipper.
  const extraRight = scale > 1 ? Math.round((scale - 1) * 8) : 0;
  return (
    <span
      className="w-14 h-6 shrink-0 flex items-center justify-center overflow-visible"
      style={extraRight ? { marginRight: extraRight } : undefined}
    >
      <img
        src={src}
        alt=""
        style={scale !== 1 ? { transform: `scale(${scale})`, transformOrigin: "center" } : undefined}
        className={
          isWhite
            // Logo blanc : brightness(0) en mode clair (→ noir), invert en dark (→ blanc)
            ? "max-w-full max-h-full object-contain brightness-0 dark:brightness-100 dark:invert-0"
            // Logo coloré normal : multiply pour ignorer le fond blanc natif
            : "max-w-full max-h-full object-contain mix-blend-multiply dark:mix-blend-normal dark:invert"
        }
      />
    </span>
  );
}

// Get all working days (Mon-Fri) between start and end dates
function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getWorkingDays(startStr: string, endStr: string): string[] {
  const days: string[] = [];
  const start = new Date(startStr.split("T")[0] + "T12:00:00");
  const end = new Date(endStr.split("T")[0] + "T12:00:00");
  const current = new Date(start);
  while (current <= end) {
    const dow = current.getDay();
    if (dow !== 0 && dow !== 6) {
      days.push(formatLocalDate(current));
    }
    current.setDate(current.getDate() + 1);
  }
  return days;
}

// Get the effective date for a project (montage or mesures)
function getEffectiveDate(p: Project): string {
  return (p.dateMontage || p.dateMesures || "").split("T")[0];
}

// Check if a project spans a given date (considering multi-day projects, excluding weekends)
function projectSpansDate(p: Project, dateStr: string): boolean {
  const startRaw = getEffectiveDate(p);
  const endRaw = (p.dateMontageEnd || "").split("T")[0];
  if (!startRaw) return false;
  if (!endRaw) return startRaw === dateStr;
  return getWorkingDays(startRaw, endRaw).includes(dateStr);
}

// Check if a project is active during a date range (for week views)
function projectActiveDuringRange(p: Project, rangeStart: string, rangeEnd: string): boolean {
  const startRaw = getEffectiveDate(p);
  const endRaw = (p.dateMontageEnd || startRaw).split("T")[0];
  if (!startRaw) return false;
  return startRaw <= rangeEnd && endRaw >= rangeStart;
}

interface MonteurDashboardProps {
  userName: string;
  projects: Project[];
  isAdmin?: boolean;
  onNavigate?: (mode: string) => void;
  terminatedProjectsInit?: Project[];
  /** Mode CleanMyMac : masque la grille de boutons standard et affiche la zone widgets configurable */
  cmmMode?: boolean;
}

// --- Helper functions ---

function parseTimeToMinutes(raw: string): number {
  const match = raw.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return -1;
  return parseInt(match[1]) * 60 + parseInt(match[2]);
}

/** Extrait HH:MM depuis n'importe quel format :
 *  "08:30" → "08:30"
 *  "Cab1:08:30" → "08:30"
 *  "2026-04-27 Jean-Marc 08:30" → "08:30" (via dernier token)
 */
/** Parse un champ ofrTM qui peut contenir plusieurs numéros TM (séparés par \n, virgule ou ;).
 *  Retourne les numéros triés par ordre croissant (le plus petit d'abord = en haut). */
function parseTMNumbers(raw: string): string[] {
  if (!raw) return [];
  const parts = raw.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
  // Trie numériquement sur les chiffres du numéro (ex. TM-2600135 → 2600135)
  return parts.sort((a, b) => {
    const numA = parseInt(a.replace(/\D/g, ""), 10) || 0;
    const numB = parseInt(b.replace(/\D/g, ""), 10) || 0;
    return numA - numB;
  });
}

/** Retourne l'info arrivage (TM en priorité, sinon Grossiste) + la couleur d'urgence.
 *  Vert = 0-6 j · Orange = 7-9 j · Rouge ≥ 10 j depuis la date d'arrivage. */
function getArrivageInfo(p: { arrivageTM?: string | null; arrivageGrossiste?: string | null }): {
  date: string | null;
  label: string;
  colorClass: string;
  bgClass: string;
  days: number | null;
} | null {
  const raw = p.arrivageTM || p.arrivageGrossiste || null;
  if (!raw) return null;
  const label = p.arrivageTM ? "TM" : "Gross.";
  const date = raw.split("T")[0];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const arrival = new Date(date + "T00:00:00");
  const days = Math.floor((today.getTime() - arrival.getTime()) / 86400000);
  let colorClass: string;
  let bgClass: string;
  if (days < 0) {
    // Pas encore arrivé
    colorClass = "text-gray-500 dark:text-gray-400";
    bgClass = "bg-gray-100 dark:bg-gray-800";
  } else if (days <= 5) {
    colorClass = "text-green-700 dark:text-green-400";
    bgClass = "bg-green-100 dark:bg-green-900/30";
  } else if (days <= 9) {
    colorClass = "text-orange-700 dark:text-orange-400";
    bgClass = "bg-orange-100 dark:bg-orange-900/30";
  } else {
    colorClass = "text-red-700 dark:text-red-400";
    bgClass = "bg-red-100 dark:bg-red-900/30";
  }
  return { date, label, colorClass, bgClass, days };
}

function extractHHMM(s: string): string {
  const m = s.trim().match(/(\d{1,2}:\d{2})$/);
  return m ? m[1] : "";
}

/** Retourne true si le projet est un travail solo (pas de & ni "team"). */
function isSoloProject(p: Project, collabName: string): boolean {
  const c = (p.collaborateurs || "").trim();
  if (c.includes("&") || c.toLowerCase().includes("team")) return false;
  return c.toLowerCase().includes(collabName.toLowerCase());
}

/**
 * Retourne true si un fragment (après split "|") est au format nommé multi-jour :
 * "YYYY-MM-DD Prénom HH:MM" — 1er token = date ISO, dernier = HH:MM
 * Ces entrées représentent du travail INDIVIDUEL même sur un projet multi-personne.
 */
function isNamedEntry(part: string): boolean {
  const tokens = part.trim().split(/\s+/);
  return tokens.length >= 3 && /^\d{4}-\d{2}-\d{2}$/.test(tokens[0] || "");
}

/**
 * Calcule les minutes INDIVIDUELLES d'un collaborateur sur une plage de dates.
 *
 * Règles métier :
 *  - Projet solo → toutes les entrées comptent en individuel
 *  - Projet binôme/équipe + entrées nommées ("YYYY-MM-DD Prénom HH:MM") →
 *    chaque entrée compte pour la personne nommée (cabines séparées)
 *  - Projet binôme/équipe + entrée simple ou "Cab1:HH:MM" →
 *    entrée partagée = va dans Binômes, PAS en individuel
 *
 * Formats gérés :
 *  1. Simple      "08:30"
 *  2. Cabine      "Cab1:08:30 | Cab2:13:55"
 *  3. Multi-nommé "2026-04-27 Jean-Marc 08:30 | 2026-04-27 Miguel 09:00"
 */
function getIndividualHoursForCollab(
  projects: Project[],
  collabName: string,
  fromStr: string,
  toStr: string,
): number {
  let totalMinutes = 0;
  const lc = collabName.toLowerCase();

  for (const p of projects) {
    const collab = (p.collaborateurs || "").trim();
    if (!collab.toLowerCase().includes(lc)) continue;

    const isMulti = collab.includes("&") || collab.toLowerCase().includes("team");
    const ha = p.heureArrivee || "";
    const hd = p.heureDepart || "";
    if (!ha && !hd) continue;

    if (ha.includes("|") || hd.includes("|")) {
      const arrParts = ha.split("|").map((s) => s.trim()).filter(Boolean);
      const depParts = hd.split("|").map((s) => s.trim()).filter(Boolean);
      const maxLen = Math.max(arrParts.length, depParts.length);

      for (let i = 0; i < maxLen; i++) {
        const aPart = arrParts[i] || "";
        const dPart = depParts[i] || "";

        // Format Cabine "Cab1:08:30" → entrée partagée si multi-personne
        if (/^Cab\d+:/i.test(aPart) || /^Cab\d+:/i.test(dPart)) {
          if (isMulti) continue; // partagé → Binômes
          const dateStr = p.dateMontage?.split("T")[0] || "";
          if (fromStr && dateStr < fromStr) continue;
          if (toStr && dateStr > toStr) continue;
          const arrMin = parseTimeToMinutes(extractHHMM(aPart));
          const depMin = parseTimeToMinutes(extractHHMM(dPart));
          if (arrMin >= 0 && depMin >= 0 && depMin > arrMin) totalMinutes += depMin - arrMin;
          continue;
        }

        // Format nommé "YYYY-MM-DD Prénom HH:MM" → individuel
        if (isNamedEntry(aPart) || isNamedEntry(dPart)) {
          const aTokens = aPart.split(/\s+/);
          const dTokens = dPart.split(/\s+/);
          const aDate = isNamedEntry(aPart) ? aTokens[0] : "";
          const dDate = isNamedEntry(dPart) ? dTokens[0] : "";
          const entryDate = aDate || dDate || p.dateMontage?.split("T")[0] || "";
          const entryCollab = aTokens.slice(1, -1).join(" ") || dTokens.slice(1, -1).join(" ") || "";
          // Si l'entrée a un nom explicite, vérifier que c'est bien ce collaborateur
          if (entryCollab && !entryCollab.toLowerCase().includes(lc)) continue;
          if (fromStr && entryDate < fromStr) continue;
          if (toStr && entryDate > toStr) continue;
          const arrMin = parseTimeToMinutes(aTokens[aTokens.length - 1] || "");
          const depMin = parseTimeToMinutes(dTokens[dTokens.length - 1] || "");
          if (arrMin >= 0 && depMin >= 0 && depMin > arrMin) totalMinutes += depMin - arrMin;
          continue;
        }

        // Entrée simple sans nom au sein d'un multi-jour → partagé si multi-personne
        if (isMulti) continue; // partagé → Binômes
        const aTokens = aPart.split(/\s+/);
        const dTokens = dPart.split(/\s+/);
        const entryDate = p.dateMontage?.split("T")[0] || "";
        if (fromStr && entryDate < fromStr) continue;
        if (toStr && entryDate > toStr) continue;
        const arrMin = parseTimeToMinutes(aTokens[aTokens.length - 1] || "");
        const depMin = parseTimeToMinutes(dTokens[dTokens.length - 1] || "");
        if (arrMin >= 0 && depMin >= 0 && depMin > arrMin) totalMinutes += depMin - arrMin;
      }
    } else {
      // Format simple (une seule entrée)
      if (isMulti) continue; // binôme sur cabine commune → Binômes
      const dateStr = p.dateMontage?.split("T")[0] || "";
      if (fromStr && dateStr < fromStr) continue;
      if (toStr && dateStr > toStr) continue;
      const arrMin = parseTimeToMinutes(extractHHMM(ha) || ha);
      const depMin = parseTimeToMinutes(extractHHMM(hd) || hd);
      if (arrMin >= 0 && depMin >= 0 && depMin > arrMin) totalMinutes += depMin - arrMin;
    }
  }
  return totalMinutes;
}

/** Garde la même signature pour la compatibilité avec les anciens appels. */
function getHoursForCollabInRange(
  projects: Project[],
  collabName: string,
  fromStr: string,
  toStr: string,
  soloOnly = false,
): number {
  if (soloOnly) return getIndividualHoursForCollab(projects, collabName, fromStr, toStr);
  // mode "all" : heures individuelles + binômes (utilisé pour les stats globales)
  return getIndividualHoursForCollab(projects, collabName, fromStr, toStr);
}

// Garde la compatibilité avec les anciens appels (semaine courante).
function getWeeklyHoursForCollab(projects: Project[], collabName: string): number {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return getHoursForCollabInRange(
    projects, collabName,
    monday.toISOString().split("T")[0],
    sunday.toISOString().split("T")[0],
  );
}

function getDateRangeForFilter(
  filter: "semaine" | "mois" | "annee" | "custom",
  customFrom?: string,
  customTo?: string,
  customMonth?: string, // "YYYY-MM"
  customYear?: string,  // "YYYY"
): { fromStr: string; toStr: string; label: string } {
  const today = new Date();
  if (filter === "semaine") {
    const dayOfWeek = today.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(today);
    monday.setDate(today.getDate() + mondayOffset);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return {
      fromStr: monday.toISOString().split("T")[0],
      toStr: sunday.toISOString().split("T")[0],
      label: "Cette semaine",
    };
  }
  if (filter === "mois") {
    const [y, m] = customMonth ? customMonth.split("-").map(Number) : [today.getFullYear(), today.getMonth() + 1];
    const firstDay = new Date(y, m - 1, 1);
    const lastDay = new Date(y, m, 0);
    const monthName = firstDay.toLocaleDateString("fr-CH", { month: "long", year: "numeric" });
    return {
      fromStr: firstDay.toISOString().split("T")[0],
      toStr: lastDay.toISOString().split("T")[0],
      label: monthName.charAt(0).toUpperCase() + monthName.slice(1),
    };
  }
  if (filter === "annee") {
    const y = customYear ? parseInt(customYear) : today.getFullYear();
    return {
      fromStr: `${y}-01-01`,
      toStr: `${y}-12-31`,
      label: `Année ${y}`,
    };
  }
  // custom
  return {
    fromStr: customFrom || "",
    toStr: customTo || "",
    label: customFrom && customTo ? `${customFrom} → ${customTo}` : "Plage personnalisée",
  };
}

function fmtMin(min: number): string {
  if (min <= 0) return "0h 00min";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${m.toString().padStart(2, "0")}min`;
}

function getTodayStr() {
  return new Date().toISOString().split("T")[0];
}

/** Retourne la couleur du point de statut rapport ou null si rien à afficher.
 *  - green  : rapport clôturé
 *  - orange : rapport commencé mais pas clôturé (jour J uniquement)
 *  - red    : rapport absent (jour J ou jours passés)
 *  - null   : projet futur → rien */
function getReportDot(project: Project, projectDateStr: string): "green" | "orange" | "red" | null {
  const todayStr = getTodayStr();
  if (!projectDateStr || projectDateStr > todayStr) return null;
  const cloture =
    (project.rapportDeMontage || "").toLowerCase().includes("clôt") ||
    (project.rapportDeMontage || "").toLowerCase().includes("clot");
  if (cloture) return "green";
  if (projectDateStr === todayStr) {
    const started = !!(project.rapportMonteur || project.heureArrivee);
    return started ? "orange" : "red";
  }
  return "red";
}

function getWeekEndStr() {
  const today = new Date();
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 14);
  return weekEnd.toISOString().split("T")[0];
}

function getThisWeekEndStr() {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
  const sunday = new Date(today);
  sunday.setDate(today.getDate() + daysUntilSunday);
  return sunday.toISOString().split("T")[0];
}

function formatDay(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("fr-CH", { weekday: "short", day: "2-digit", month: "short" });
}

/**
 * Affichage de la date d'un projet en tenant compte des projets multi-jours.
 * - Projet mono-jour : "Mar. 26 avr."
 * - Projet multi-jours (ex. 28-30 avril) : "Mar. 28 → Jeu. 30 avr."
 * Le badge "3j" affiché à côté complète l'info, mais le texte lui-même doit
 * déjà montrer la plage — sinon on pense que c'est un rendez-vous d'un jour.
 */
function formatProjectDate(project: Project): string {
  const startRaw = project.dateMontage || project.dateMesures || "";
  if (!startRaw) return "---";
  const endRaw = project.dateMontageEnd || "";
  const startDay = startRaw.split("T")[0];
  const endDay = endRaw.split("T")[0];
  if (!endDay || endDay === startDay) return formatDay(startRaw);
  return `${formatDay(startRaw)} → ${formatDay(endRaw)}`;
}

/** Supprime les diacritiques : "Loïc" → "loic", insensible à la casse. */
function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function matchesCollaborator(fieldValue: string, name: string): boolean {
  if (!fieldValue) return false;
  // Les projets attribués à une "Team …" (ex: "Team TM") sont considérés
  // comme assignés à TOUS les monteurs individuels : ils doivent
  // apparaître dans chaque dashboard personnel, pas seulement dans la
  // section "Binômes & Teams".
  // Exception : les collaborateurs de TEAM_EXCLUDED_COLLABORATORS (ex: admin)
  // ne reçoivent pas les montages Team.
  if (fieldValue.toLowerCase().includes("team")) {
    const firstName = norm(name.split(" ")[0]);
    const excluded = TEAM_EXCLUDED_COLLABORATORS.some((e) => norm(e) === firstName);
    return !excluded;
  }
  const n = norm(name);
  return fieldValue.split("&").some((part) => {
    const trimmed = norm(part.trim());
    // Exact match on the part or the part contains the name as a distinct word
    return trimmed === n || trimmed.split(/\s+/).some((word) => word === n);
  });
}

function getProjectsForCollaborator(projects: Project[], name: string) {
  return projects.filter((p) => {
    const source = getProjectSource(p);
    // For mesures projects, only match mesuresTraiteePar
    if (source === "mesures") {
      return matchesCollaborator(p.mesuresTraiteePar || "", name);
    }
    // For montage/services/sav, only match collaborateurs
    return matchesCollaborator(p.collaborateurs || "", name);
  });
}

function getProjectSource(p: any): string {
  return (p as any)._source || "montage";
}

function countCabinesBySource(projects: Project[], collabName?: string) {
  const counts: Record<string, number> = {};
  for (const p of projects) {
    const source = getProjectSource(p);
    const cab = p.nbCabines || 0;
    // If in binôme/team, divide cabines by number of collaborateurs
    const collabNames = (p.collaborateurs || "").split(" & ").map((n) => n.trim()).filter(Boolean);
    const divisor = (collabName && source === "montage" && collabNames.length > 1) ? collabNames.length : 1;
    counts[source] = (counts[source] || 0) + Math.round(cab / divisor);
  }
  return counts;
}

function formatCabinesSummary(counts: Record<string, number>): string {
  const labels: Record<string, string> = { montage: "montage", mesures: "mesures", services: "services", sav: "SAV" };
  return Object.entries(counts)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${v} ${labels[k] || k}`)
    .join(" · ");
}

// --- Route planning button ---

function DailyRouteButton({ projects }: { projects: Project[] }) {
  const [showPicker, setShowPicker] = useState(false);

  const addresses = projects
    .map((p) => p.adresseChantier)
    .filter(Boolean);

  if (addresses.length === 0) return null;

  const buildGoogleMapsUrl = () => {
    // First address is destination, rest are waypoints
    const encoded = addresses.map((a) => encodeURIComponent(a));
    if (encoded.length === 1) {
      return `https://www.google.com/maps/dir/?api=1&destination=${encoded[0]}`;
    }
    const destination = encoded[encoded.length - 1];
    const waypoints = encoded.slice(0, -1).join("|");
    return `https://www.google.com/maps/dir/?api=1&destination=${destination}&waypoints=${waypoints}`;
  };

  const buildGoogleMapsDeepLink = () => {
    const encoded = addresses.map((a) => encodeURIComponent(a));
    if (encoded.length === 1) {
      return `comgooglemaps://?daddr=${encoded[0]}`;
    }
    // Google Maps app supports waypoints via the URL scheme
    return `comgooglemaps://?daddr=${encoded.join("+to:")}`;
  };

  const buildWazeUrl = () => {
    // Waze only supports single destination, use first address
    const addr = encodeURIComponent(addresses[0]);
    return `waze://?q=${addr}&navigate=yes`;
  };

  const buildWazeFallback = () => {
    const addr = encodeURIComponent(addresses[0]);
    return `https://waze.com/ul?q=${addr}&navigate=yes`;
  };

  const openApp = (app: "google" | "waze") => {
    setShowPicker(false);
    if (app === "google") {
      window.location.href = buildGoogleMapsDeepLink();
      setTimeout(() => {
        window.open(buildGoogleMapsUrl(), "_blank");
      }, 500);
    } else {
      window.location.href = buildWazeUrl();
      setTimeout(() => {
        window.open(buildWazeFallback(), "_blank");
      }, 500);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setShowPicker(!showPicker)}
        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 active:scale-[0.98] transition-all"
      >
        <Route className="w-4 h-4" />
        Itinéraire du jour ({addresses.length} arrêt{addresses.length > 1 ? "s" : ""})
      </button>
      {showPicker && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowPicker(false)} />
          <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 p-1">
            <button
              onClick={() => openApp("google")}
              className="w-full text-left text-sm px-3 py-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 text-gray-700 dark:text-gray-300"
            >
              <MapPin className="w-4 h-4 text-red-500" />
              Google Maps
            </button>
            <button
              onClick={() => openApp("waze")}
              className="w-full text-left text-sm px-3 py-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 text-gray-700 dark:text-gray-300"
            >
              <Navigation className="w-4 h-4 text-cyan-500" />
              Waze
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// --- Project card used in both views ---

function ProjectRow({ project, colors }: { project: Project; colors: { bg: string; text: string; dot: string } }) {
  const source = getProjectSource(project);
  const isMesure = source === "mesures";
  const collabField = isMesure ? (project.mesuresTraiteePar || "") : (project.collaborateurs || "");
  const collabNames = collabField.split(" & ").map((n) => n.trim()).filter(Boolean);
  const isTeam = collabNames.length >= 5 || collabField.toLowerCase().includes("team");
  const teamLabel = isTeam ? "Team" : collabNames.length === 2 ? "Binôme" : collabNames.length === 3 ? "Trio" : collabNames.length === 4 ? "Quatuor" : "";
  const logo = getClientLogo(project.projet);
  const projectDateStr = (project.dateMontage || project.dateMesures || "").split("T")[0];
  const reportDot = getReportDot(project, projectDateStr);

  return (
    <Link
      key={project.id}
      href={`/projet/${project.id}?mode=dashboard`}
      onMouseEnter={() => prefetchProject(project.id)}
      onTouchStart={() => prefetchProject(project.id)}
      className="flex items-center gap-2 glass-card rounded-xl px-3 py-2 hover:bg-white/80 dark:hover:bg-white/10 transition-all"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          {reportDot && (
            <span className={`w-2 h-2 rounded-full shrink-0 ${reportDot === "green" ? "bg-green-500" : reportDot === "orange" ? "bg-orange-400" : "bg-red-500"}`} />
          )}
          {project.ofrTM && (
            <span className="text-[10px] font-mono text-gray-400 dark:text-gray-500">{project.ofrTM}</span>
          )}
          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${isMesure ? "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300" : "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300"}`}>
            {isMesure ? "Mesures" : "Montages"}
          </span>
          {teamLabel && (
            <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${isTeam ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
              {teamLabel}
            </span>
          )}
        </div>
        <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 line-clamp-3 sm:line-clamp-2 mt-0.5">{project.projet}</p>
        {project.nomChantier && project.nomChantier !== project.projet && (
          <p className="text-[10px] text-gray-500 dark:text-gray-400 line-clamp-2 sm:line-clamp-1 mt-0">{project.nomChantier}</p>
        )}
        {project.adresseChantier && (
          <div className="flex items-center gap-1 mt-0.5 text-[10px] text-gray-500 dark:text-gray-400">
            <MapPin className="w-3 h-3 shrink-0" />
            <span className="line-clamp-3 sm:line-clamp-1">{project.adresseChantier}</span>
          </div>
        )}
        <div className="flex items-center gap-1 mt-1">
          {collabNames.length >= 1 && (
            <div className="flex -space-x-1">
              {collabNames.map((n) => (
                <span key={n} className="w-5 h-5 rounded-full text-[7px] font-bold flex items-center justify-center border border-white dark:border-gray-800"
                  style={{ backgroundColor: getCollaboratorColor(n).bg, color: getCollaboratorColor(n).text }}>
                  {getCollaboratorInitials(n)}
                </span>
              ))}
            </div>
          )}
          {logo && <LogoImg src={logo} />}
        </div>
      </div>
      <Badge variant="outline" className="text-[10px] shrink-0">{project.nbCabines || 0} cab.</Badge>
      <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 shrink-0" />
    </Link>
  );
}

function WeekProjectRow({ project }: { project: Project }) {
  const date = project.dateMontage || project.dateMesures || "";
  const source = getProjectSource(project);
  const isMesure = source === "mesures";
  const collabField = isMesure ? (project.mesuresTraiteePar || "") : (project.collaborateurs || "");
  const collabNames = collabField.split(" & ").map((n) => n.trim()).filter(Boolean);
  const isTeam = collabNames.length >= 5 || collabField.toLowerCase().includes("team");
  const teamLabel = isTeam ? "Team" : collabNames.length === 2 ? "Binôme" : collabNames.length === 3 ? "Trio" : collabNames.length === 4 ? "Quatuor" : "";
  const logo = getClientLogo(project.projet);
  // Largeur plus grande quand on affiche une plage de dates, pour ne pas
  // tronquer le "Mar. 28 → Jeu. 30 avr.".
  const isMultiDay = !!project.dateMontageEnd && project.dateMontageEnd.split("T")[0] !== (project.dateMontage || "").split("T")[0];
  const projectDateStr = (project.dateMontage || project.dateMesures || "").split("T")[0];
  const reportDot = getReportDot(project, projectDateStr);

  return (
    <Link
      href={`/projet/${project.id}?mode=dashboard`}
      onMouseEnter={() => prefetchProject(project.id)}
      onTouchStart={() => prefetchProject(project.id)}
      className="flex items-center gap-2 glass-card rounded-xl px-3 py-2 hover:bg-white/80 dark:hover:bg-white/10 transition-all"
    >
      {/* Plage de dates : empilées verticalement quand le projet est
          sur plusieurs jours, pour éviter d'occuper trop de largeur. */}
      <div className="text-[10px] font-mono text-gray-500 dark:text-gray-400 shrink-0 w-16 leading-tight">
        {(() => {
          const startRaw = project.dateMontage || project.dateMesures || "";
          const endRaw = project.dateMontageEnd || "";
          const startDay = startRaw.split("T")[0];
          const endDay = endRaw.split("T")[0];
          if (!startRaw) return <div>---</div>;
          if (!endDay || endDay === startDay) return <div>{formatDay(startRaw)}</div>;
          return (
            <div className="flex flex-col">
              <span>{formatDay(startRaw)}</span>
              <span className="text-gray-400 dark:text-gray-500">↓</span>
              <span>{formatDay(endRaw)}</span>
            </div>
          );
        })()}
        {date.includes("T") && (
          <div className="text-[9px] text-blue-500 font-semibold mt-0.5">
            {new Date(date).toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" })}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          {reportDot && (
            <span className={`w-2 h-2 rounded-full shrink-0 ${reportDot === "green" ? "bg-green-500" : reportDot === "orange" ? "bg-orange-400" : "bg-red-500"}`} />
          )}
          {project.ofrTM && (
            <span className="text-[10px] font-mono text-gray-400 dark:text-gray-500">{project.ofrTM}</span>
          )}
          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${isMesure ? "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300" : "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300"}`}>
            {isMesure ? "Mesures" : "Montages"}
          </span>
          {teamLabel && (
            <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${isTeam ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
              {teamLabel}
            </span>
          )}
        </div>
        <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 line-clamp-3 sm:line-clamp-2 mt-0.5">{project.projet}</p>
        {project.nomChantier && project.nomChantier !== project.projet && (
          <p className="text-[10px] text-gray-500 dark:text-gray-400 line-clamp-2 sm:line-clamp-1 mt-0">{project.nomChantier}</p>
        )}
        <div className="flex items-center gap-1 mt-0.5">
          {collabNames.length >= 1 && (
            <div className="flex -space-x-1">
              {collabNames.map((n) => (
                <span key={n} className="w-5 h-5 rounded-full text-[7px] font-bold flex items-center justify-center border border-white dark:border-gray-800"
                  style={{ backgroundColor: getCollaboratorColor(n).bg, color: getCollaboratorColor(n).text }}>
                  {getCollaboratorInitials(n)}
                </span>
              ))}
            </div>
          )}
          {logo && <LogoImg src={logo} />}
        </div>
      </div>
      <Badge variant="outline" className="text-[10px] shrink-0">{project.nbCabines || 0} cab.</Badge>
      <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 shrink-0" />
    </Link>
  );
}

// --- Admin view ---

const DEFAULT_DASH_ORDER = [
  "mesures-today", "today", "services-today", "sav-today",
  "week", "active", "emplacement-cabines", "rapports-attente",
  "sav-non-traites", "soucis-en-cours", "dossiers-en-cours", "a-facturer",
  "calendrier", "archives", "arrivage", "sav-historique", "soucis-historique", "mesures-sans-commande",
  "__empty__", // Case vide — taquin pour faciliter les déplacements
];

function AdminDashboard({ projects, userName, onNavigate, terminatedProjectsInit = [], cmmMode = false }: { projects: Project[]; userName: string; onNavigate?: (mode: string) => void; terminatedProjectsInit?: Project[]; cmmMode?: boolean }) {
  const firstName = userName.split(" ")[0];
  const [expandedCollabs, setExpandedCollabs] = useState<Record<string, boolean>>({});
  const toggleCollab = (name: string) => setExpandedCollabs((prev) => ({ ...prev, [name]: !prev[name] }));

  // ── Helpers réorganisation ─────────────────────────────────────────────────
  // Sauvegarde locale (immédiate) + serveur (multi-plateforme)
  const saveDashOrder = (order: string[]) => {
    // 1. localStorage pour la réactivité immédiate
    try { localStorage.setItem(`tm-dashboard-order-${userName}`, JSON.stringify(order)); } catch {}
    // 2. Persistance serveur (Notion) — fire-and-forget, pas bloquant
    const slug = encodeURIComponent(userName);
    fetch(`/api/preferences/dashboard-order/${slug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order }),
    }).catch(() => {/* silencieux, localStorage reste le fallback */});
  };

  const reorderDash = (srcId: string, dstId: string) => {
    if (srcId === dstId) return;
    setButtonOrder(prev => {
      const arr = [...prev];
      const si = arr.indexOf(srcId);
      const di = arr.indexOf(dstId);
      if (si < 0 || di < 0) return prev;
      // Swap the two buttons (échange simple des positions)
      [arr[si], arr[di]] = [arr[di], arr[si]];
      saveDashOrder(arr);
      return arr;
    });
  };

  const cancelLongPress = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  };

  const exitEditMode = () => {
    setIsEditMode(false);
    setDragSrcId(null);
    setDragOverId(null);
    touchDragIdRef.current = null;
  };
  const [showWeekProjects, setShowWeekProjects] = useState(false);
  const [showSummaryPanel, setShowSummaryPanel] = useState<"today" | "week" | "active" | "rdv-a-fixer" | "rdv-fixe" | "mesures-today" | "sav-today" | "services-today" | "emplacement-cabines" | "rapports-attente" | "sav-non-traites" | "soucis-en-cours" | "dossiers-en-cours" | "a-facturer" | "calendrier" | "sav-historique" | "soucis-historique" | "mesures-sans-commande" | null>(null);
  const [calendarMonth, setCalendarMonth] = useState<{ year: number; month: number }>(() => { const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() }; });
  const [calendarSelectedDay, setCalendarSelectedDay] = useState<string | null>(null);
  const [userActivities, setUserActivities] = useState<Record<string, string>>({});
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent));
  }, []);

  // ── Météo (Open-Meteo, géolocalisation) ──────────────────────────────────
  const [weather, setWeather] = useState<{
    temp: number;
    code: number;
    desc: string;
    icon: string;
    city: string;
  } | null>(null);

  useEffect(() => {
    const WMO_ICON: Record<number, string> = {
      0: "☀️", 1: "🌤️", 2: "⛅", 3: "🌥️",
      45: "🌫️", 48: "🌫️",
      51: "🌦️", 53: "🌦️", 55: "🌧️",
      61: "🌧️", 63: "🌧️", 65: "🌧️",
      71: "❄️", 73: "❄️", 75: "❄️", 77: "❄️",
      80: "🌦️", 81: "🌦️", 82: "⛈️",
      85: "❄️", 86: "❄️",
      95: "⛈️", 96: "⛈️", 99: "⛈️",
    };
    const WMO_DESC: Record<number, string> = {
      0: "Ciel dégagé", 1: "Peu nuageux", 2: "Partiellement nuageux", 3: "Couvert",
      45: "Brouillard", 48: "Brouillard givrant",
      51: "Bruine légère", 53: "Bruine", 55: "Bruine forte",
      61: "Pluie légère", 63: "Pluie", 65: "Forte pluie",
      71: "Neige légère", 73: "Neige", 75: "Forte neige", 77: "Grésil",
      80: "Averses légères", 81: "Averses", 82: "Fortes averses",
      85: "Averses de neige", 86: "Fortes averses de neige",
      95: "Orage", 96: "Orage avec grêle", 99: "Orage violent",
    };
    const getReverseGeoCity = async (lat: number, lon: number): Promise<string> => {
      try {
        const r = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=fr`,
          { headers: { "Accept-Language": "fr" } }
        );
        const d = await r.json();
        return d?.address?.city || d?.address?.town || d?.address?.village || d?.address?.municipality || "";
      } catch { return ""; }
    };
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;
        try {
          const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weathercode&timezone=auto`;
          const r = await fetch(url);
          const d = await r.json();
          const temp = Math.round(d.current?.temperature_2m ?? 0);
          const code = d.current?.weathercode ?? 0;
          const city = await getReverseGeoCity(lat, lon);
          setWeather({
            temp,
            code,
            desc: WMO_DESC[code] ?? "–",
            icon: WMO_ICON[code] ?? "🌡️",
            city,
          });
        } catch {}
      },
      () => {}
    );
  }, []);

  // Heures de travail — filtre et projets terminés
  const [selectedMonteurStats, setSelectedMonteurStats] = useState<string>("");
  const [workFilter, setWorkFilter] = useState<"semaine" | "mois" | "annee" | "custom">("semaine");
  const [workMonth, setWorkMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [workYear, setWorkYear] = useState<string>(() => String(new Date().getFullYear()));
  const [workFrom, setWorkFrom] = useState("");
  const [workTo, setWorkTo] = useState("");
  const [terminatedProjects, setTerminatedProjects] = useState<Project[]>(() => terminatedProjectsInit);
  const [terminatedLoading, setTerminatedLoading] = useState(false);
  const [archivesCount, setArchivesCount] = useState<number | null>(null);

  // ── Animation ouverture/fermeture panneau ─────────────────────────────────
  // Les boutons s'effacent + se replient (opacity + max-height simultanés).
  // Le header apparaît en simple fondu — pas de déplacement.
  // Swipe-to-close
  const swipeTouchStartY = useRef<number>(0);
  const headerButtonRef = useRef<HTMLButtonElement>(null);

  const openPanel = (id: typeof showSummaryPanel, e?: React.MouseEvent<HTMLButtonElement>) => {
    if (isEditMode) return;
    if (showSummaryPanel === id) { closePanel(); return; }
    setShowSummaryPanel(id);
  };

  const closePanel = () => {
    setShowSummaryPanel(null);
  };

  // ── Widgets CMM configurables ─────────────────────────────────────────────
  const [cmmWidgets, setCmmWidgets] = useState<string[]>([]);
  const [cmmConfigOpen, setCmmConfigOpen] = useState(false);
  useEffect(() => {
    if (!cmmMode) return;
    try {
      const saved = localStorage.getItem(`tm-cmm-widgets-${userName}`);
      if (saved) setCmmWidgets(JSON.parse(saved));
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Réorganisation boutons style iOS ──────────────────────────────────────
  const [isEditMode, setIsEditMode] = useState(false);
  // On initialise avec l'ordre par défaut pour éviter un écart SSR/client.
  // useEffect :
  //   1. Applique immédiatement localStorage (cache rapide)
  //   2. Fetch le serveur (source de vérité multi-plateforme)
  //   3. Si le serveur a un ordre différent → met à jour + synchro localStorage
  const [buttonOrder, setButtonOrder] = useState<string[]>([...DEFAULT_DASH_ORDER]);
  useEffect(() => {
    // Étape 1 : localStorage (instantané)
    let localOrder: string[] | null = null;
    try {
      const saved = localStorage.getItem(`tm-dashboard-order-${userName}`);
      if (saved) {
        const parsed: string[] = JSON.parse(saved);
        const valid = parsed.filter((id: string) => DEFAULT_DASH_ORDER.includes(id));
        const missing = DEFAULT_DASH_ORDER.filter(id => !valid.includes(id));
        localOrder = [...valid, ...missing];
        setButtonOrder(localOrder);
      }
    } catch {}

    // Étape 2 : serveur (Notion) — source de vérité cross-device
    const slug = encodeURIComponent(userName);
    fetch(`/api/preferences/dashboard-order/${slug}`)
      .then(r => r.json())
      .then((data: { order: string[] | null }) => {
        if (!Array.isArray(data?.order)) return;
        const valid = data.order.filter((id: string) => DEFAULT_DASH_ORDER.includes(id));
        const missing = DEFAULT_DASH_ORDER.filter(id => !valid.includes(id));
        const serverOrder = [...valid, ...missing];
        // Met à jour l'UI + synchro localStorage si différent du cache local
        setButtonOrder(serverOrder);
        try { localStorage.setItem(`tm-dashboard-order-${userName}`, JSON.stringify(serverOrder)); } catch {}
      })
      .catch(() => {/* localStorage reste utilisé si le serveur est inaccessible */});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [dragSrcId, setDragSrcId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchDragIdRef = useRef<string | null>(null);

  // ── Édition inline État SAV ───────────────────────────────────────────────
  const [editingSavId, setEditingSavId] = useState<string | null>(null);
  const [savEtatOverride, setSavEtatOverride] = useState<Record<string, string>>({});
  const SAV_ETAT_OPTIONS = [
    "Aucun SAV", "A contacter", "Contact sans réponse",
    "Attente news", "En cours de traitement", "RDV fixé", "Terminé",
  ];
  const SAV_ETAT_COLORS: Record<string, string> = {
    "Aucun SAV":              "bg-gray-100 text-gray-500",
    "A contacter":            "bg-red-100 text-red-700",
    "Contact sans réponse":   "bg-orange-100 text-orange-700",
    "Attente news":           "bg-yellow-100 text-yellow-700",
    "En cours de traitement": "bg-blue-100 text-blue-700",
    "RDV fixé":               "bg-green-100 text-green-700",
    "Terminé":                "bg-gray-200 text-gray-600",
  };
  const updateSavEtat = async (projectId: string, newEtat: string) => {
    setSavEtatOverride(prev => ({ ...prev, [projectId]: newEtat }));
    setEditingSavId(null);
    try {
      await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ etatSAV: newEtat }),
      });
    } catch {}
  };

  // ── Tris "RDV à fixer" — un config par catégorie (clé = titre) ──────────
  type RdvSortKey = "date" | "days" | "cabines" | "localite";
  type RdvSortDir = "asc" | "desc";
  const [rdvSortConfig, setRdvSortConfig] = useState<Record<string, { key: RdvSortKey; dir: RdvSortDir }>>({});
  const toggleRdvSort = (catKey: string, key: RdvSortKey) => {
    setRdvSortConfig(prev => {
      const cur = prev[catKey] || { key: "date", dir: "asc" };
      return {
        ...prev,
        [catKey]: cur.key === key
          ? { key, dir: cur.dir === "asc" ? "desc" : "asc" }
          : { key, dir: "asc" },
      };
    });
  };

  // Filtres panneaux
  const [soucisFilterYear, setSoucisFilterYear] = useState("");
  const [soucisFilterCause, setSoucisFilterCause] = useState("");
  const [soucisFilterFrom, setSoucisFilterFrom] = useState("");
  const [soucisFilterTo, setSoucisFilterTo] = useState("");
  const [savFilterYear, setSavFilterYear] = useState("");
  const [savFilterCause, setSavFilterCause] = useState("");
  const [savFilterFrom, setSavFilterFrom] = useState("");
  const [savFilterTo, setSavFilterTo] = useState("");
  const [mesuresFilterYear, setMesuresFilterYear] = useState("");
  const [mesuresFilterFrom, setMesuresFilterFrom] = useState("");
  const [mesuresFilterTo, setMesuresFilterTo] = useState("");
  const [dossiersFilterYear, setDossiersFilterYear] = useState("");
  const [dossiersFilterType, setDossiersFilterType] = useState("");
  const [dossiersFilterFrom, setDossiersFilterFrom] = useState("");
  const [dossiersFilterTo, setDossiersFilterTo] = useState("");

  // Guard offline : le SW retourne [] comme fallback quand il n'a pas de cache.
  // On refuse d'écraser un state existant avec un tableau vide quand on est hors-ligne.
  const safeSetData = <T,>(setter: React.Dispatch<React.SetStateAction<T[]>>, data: unknown) => {
    if (!Array.isArray(data)) return;
    if (data.length === 0 && !navigator.onLine) return;
    setter(data as T[]);
  };

  // Tous les projets actifs (non-Terminé, non-Annulé) pour les stats globales
  // (ex. "Projets en cours" = 209 projets, pas seulement les 80 de l'onglet CMD).
  const [allActiveProjects, setAllActiveProjects] = useState<Project[]>([]);
  useEffect(() => {
    fetch("/api/projects/all-active")
      .then((r) => r.json())
      .then((data) => safeSetData(setAllActiveProjects, data))
      .catch(() => {});
  }, []);

  // Mesures terminées sans commande — route dédiée
  const [mesuresSansCommandeData, setMesuresSansCommandeData] = useState<Project[]>([]);
  const [mesuresSansCommandeLoading, setMesuresSansCommandeLoading] = useState(false);
  useEffect(() => {
    setMesuresSansCommandeLoading(true);
    fetch("/api/projects/mesures-sans-commande")
      .then(r => r.json())
      .then(data => safeSetData(setMesuresSansCommandeData, data))
      .catch(() => {})
      .finally(() => setMesuresSansCommandeLoading(false));
  }, []);

  // Mesures terminées annulées — route dédiée
  const [mesuresAnnuleesData, setMesuresAnnuleesData] = useState<Project[]>([]);
  const [mesuresAnnuleesLoading, setMesuresAnnuleesLoading] = useState(false);
  useEffect(() => {
    setMesuresAnnuleesLoading(true);
    fetch("/api/projects/mesures-annulees")
      .then(r => r.json())
      .then(data => safeSetData(setMesuresAnnuleesData, data))
      .catch(() => {})
      .finally(() => setMesuresAnnuleesLoading(false));
  }, []);

  // Sous-vue du panel Mesures : "commande" | "annulees"
  const [mesuresSubView, setMesuresSubView] = useState<"commande" | "annulees">("commande");

  // Sync terminatedProjects depuis la prop quand page.tsx finit de fetch
  // (utile si le cache localStorage était vide au premier rendu)
  useEffect(() => {
    if (terminatedProjectsInit.length > 0 && terminatedProjects.length === 0) {
      setTerminatedProjects(terminatedProjectsInit);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminatedProjectsInit.length]);

  // Fallback : si la prop est toujours vide (cache froid + prop pas encore reçue),
  // on fetch directement — ne sera exécuté que si la prop reste à [] après 1 s.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (terminatedProjects.length > 0 || terminatedLoading) return;
      setTerminatedLoading(true);
      fetch("/api/projects/cmd-termine").then(r => r.json()).catch(() => []).then((cmd) => {
        const all = Array.isArray(cmd) ? cmd : [];
        const seen = new Set<string>();
        setTerminatedProjects(all.filter((p: Project) => p?.id && !seen.has(p.id) && seen.add(p.id)));
      }).finally(() => setTerminatedLoading(false));
    }, 1000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Charge le total de TOUS les projets Notion pour afficher le bon count sur le bouton Archives
  useEffect(() => {
    fetch("/api/projects/all")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setArchivesCount(data.length); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/user-activity")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          const map: Record<string, string> = {};
          data.forEach((a: any) => { map[a.name] = a.lastSeen; });
          setUserActivities(map);
        }
      })
      .catch(() => {});
  }, []);
  const todayStr = getTodayStr();
  const weekEndStr = getWeekEndStr();
  const thisWeekEndStr = getThisWeekEndStr();

  // Build per-collaborator data
  const collabData = COLLABORATEURS_LIST.map((name) => {
    const colors = getCollaboratorColor(name);
    const myProjects = getProjectsForCollaborator(projects, name);
    const getD = (p: Project) => p.dateMontage || p.dateMesures || "";
    const todayProjects = myProjects.filter((p) => projectSpansDate(p, todayStr));
    const thisWeekProjects = myProjects
      .filter((p) => {
        if (todayProjects.includes(p)) return false;
        return projectActiveDuringRange(p, todayStr, thisWeekEndStr);
      })
      .sort((a, b) => getD(a).localeCompare(getD(b)));
    const nextWeekProjects = myProjects
      .filter((p) => {
        if (todayProjects.includes(p) || thisWeekProjects.includes(p)) return false;
        return projectActiveDuringRange(p, thisWeekEndStr, weekEndStr);
      })
      .sort((a, b) => getD(a).localeCompare(getD(b)));
    const allUpcoming = [...todayProjects, ...thisWeekProjects, ...nextWeekProjects];
    const cabinesBySource = countCabinesBySource(allUpcoming, name);
    const totalCabines = Object.values(cabinesBySource).reduce((s, v) => s + v, 0);
    const cabinesSummary = formatCabinesSummary(cabinesBySource);
    return { name, colors, myProjects, todayProjects, thisWeekProjects, nextWeekProjects, totalCabines, cabinesSummary };
  });

  // Build per-binôme/team data.
  // On inclut ici :
  //   - les binômes/trios/quatuors écrits avec "&" (ex: "Claudio & Loïc")
  //   - les équipes nommées via un label contenant "team"
  //     (ex: "Team TM") même s'il n'y a pas de "&" — sinon ces
  //     projets ne remontaient jamais dans la section BINÔMES & TEAMS.
  const binomeMap: Record<string, Project[]> = {};
  projects.forEach((p) => {
    const collab = p.collaborateurs || "";
    const isAmpCollab = collab.includes("&");
    const isTeamLabel = collab.toLowerCase().includes("team");
    if (!isAmpCollab && !isTeamLabel) return;
    // Check if project is active within next 2 weeks
    if (!projectActiveDuringRange(p, todayStr, weekEndStr)) return;
    if (!binomeMap[collab]) binomeMap[collab] = [];
    binomeMap[collab].push(p);
  });
  const binomeData = Object.entries(binomeMap)
    .map(([teamName, teamProjects]) => {
      const names = teamName.split(" & ").map((n) => n.trim());
      const isBinome = names.length === 2;
      const isTeam = names.length >= 5 || teamName.toLowerCase().includes("team");
      const getD = (p: Project) => p.dateMontage || p.dateMesures || "";
      const todayP = teamProjects.filter((p) => projectSpansDate(p, todayStr));
      const thisWeekP = teamProjects.filter((p) => { if (todayP.includes(p)) return false; return projectActiveDuringRange(p, todayStr, thisWeekEndStr); })
        .sort((a, b) => getD(a).localeCompare(getD(b)));
      const nextWeekP = teamProjects.filter((p) => { if (todayP.includes(p) || thisWeekP.includes(p)) return false; return projectActiveDuringRange(p, thisWeekEndStr, weekEndStr); })
        .sort((a, b) => getD(a).localeCompare(getD(b)));
      const totalCabines = teamProjects.reduce((sum, p) => sum + (p.nbCabines || 0), 0);
      return { teamName, names, isBinome, isTeam, todayProjects: todayP, thisWeekProjects: thisWeekP, nextWeekProjects: nextWeekP, totalCabines };
    })
    .filter((b) => b.todayProjects.length > 0 || b.thisWeekProjects.length > 0 || b.nextWeekProjects.length > 0);

  // Summary stats — depuis que les projets Team apparaissent aussi dans
  // la section de chaque monteur individuel (pour qu'ils les voient tous),
  // on doit dédupliquer par project.id pour ne pas compter N fois les
  // cabines d'une Team dans les totaux globaux.
  const seenWeekIds = new Set<string>();
  const uniqueWeekProjects: Project[] = [];
  collabData.forEach((c) => {
    [...c.todayProjects, ...c.thisWeekProjects, ...c.nextWeekProjects].forEach((p) => {
      if (!seenWeekIds.has(p.id)) { seenWeekIds.add(p.id); uniqueWeekProjects.push(p); }
    });
  });
  // Dédupliquer les projets du jour par id
  const uniqueTodayProjects = Array.from(
    new Map(collabData.flatMap((c) => c.todayProjects).map((p) => [p.id, p])).values()
  );
  const totalProjectsToday = uniqueTodayProjects.length;
  // Décomposition par type pour l'affichage du texte
  const todayMontages = uniqueTodayProjects.filter((p) => {
    const src = getProjectSource(p);
    return src !== "mesures" && !(p.typeServices || []).some((t: string) => t === "Services" || t.includes("Services"));
  }).length;
  const todayMesures = uniqueTodayProjects.filter((p) => getProjectSource(p) === "mesures").length;
  const todayServices = uniqueTodayProjects.filter((p) =>
    (p.typeServices || []).some((t: string) => t === "Services" || t.includes("Services"))
  ).length;
  const todayGaranties = uniqueTodayProjects.filter((p) =>
    (p.typeServices || []).some((t: string) => t.toLowerCase().includes("garantie"))
  ).length;
  // Texte composite ex: "2 mesures · 1 montage · 1 service prévu(s) aujourd'hui"
  const todayParts: string[] = [];
  if (todayMesures > 0) todayParts.push(`${todayMesures} mesure${todayMesures > 1 ? "s" : ""}`);
  if (todayMontages > 0) todayParts.push(`${todayMontages} montage${todayMontages > 1 ? "s" : ""}`);
  if (todayServices > 0) todayParts.push(`${todayServices} service${todayServices > 1 ? "s" : ""}`);
  const todayLabel = todayParts.length > 0
    ? `${todayParts.join(" · ")} prévu${totalProjectsToday > 1 ? "s" : ""} aujourd'hui`
    : "Aucun projet prévu aujourd'hui";
  const totalCabinesWeek = uniqueWeekProjects.reduce((s, p) => s + (p.nbCabines || 0), 0);
  // Tous les projets futurs (sans limite des 14 jours) — pour le panel "à venir"
  const allFutureProjects = projects
    .filter((p) => projectActiveDuringRange(p, todayStr, "2099-12-31"))
    .filter((p, i, arr) => arr.findIndex((x) => x.id === p.id) === i)
    .sort((a, b) =>
      ((a.dateMontage || a.dateMesures || "").split("T")[0])
        .localeCompare((b.dateMontage || b.dateMesures || "").split("T")[0])
    );
  // Cabines au-delà des 14 prochains jours (semaines à venir)
  const totalCabinesFutureWeeks = allFutureProjects
    .filter((p) => ((p.dateMontage || p.dateMesures || "").split("T")[0]) > weekEndStr)
    .reduce((s, p) => s + (p.nbCabines || 0), 0);
  // Agrégation par source de projet (montage/mesures/services/sav)
  // depuis la liste dédupliquée — évite de compter une Team N fois.
  const allWeekCabinesBySource: Record<string, number> = {};
  uniqueWeekProjects.forEach((p) => {
    const src = getProjectSource(p);
    allWeekCabinesBySource[src] = (allWeekCabinesBySource[src] || 0) + (p.nbCabines || 0);
  });
  const weekSummary = formatCabinesSummary(allWeekCabinesBySource);
  const busyToday = collabData.filter((c) => c.todayProjects.length > 0).length;

  // ── Stats hebdomadaires : semaine courante vs semaine précédente ──────────────
  // On fusionne projets actifs + terminés (dédupliqués par id) pour couvrir
  // à la fois les projets encore en cours ET ceux déjà marqués "Terminé".
  const allProjectsForStats = useMemo(() => {
    const seen = new Set<string>();
    const all: Project[] = [];
    for (const p of [...projects, ...terminatedProjects]) {
      if (!seen.has(p.id)) { seen.add(p.id); all.push(p); }
    }
    return all;
  }, [projects, terminatedProjects]);

  // Bornes de la semaine courante (Lundi → Dimanche)
  const thisWeekBounds = useMemo(() => {
    const today = new Date();
    const dow = today.getDay();
    const mon = new Date(today);
    mon.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    return {
      start: mon.toISOString().split("T")[0],
      end:   sun.toISOString().split("T")[0],
    };
  }, []);

  // Bornes de la semaine précédente
  const prevWeekBounds = useMemo(() => {
    const today = new Date();
    const dow = today.getDay();
    const thisMon = new Date(today);
    thisMon.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
    const prevMon = new Date(thisMon);
    prevMon.setDate(thisMon.getDate() - 7);
    const prevSun = new Date(prevMon);
    prevSun.setDate(prevMon.getDate() + 6);
    return {
      start: prevMon.toISOString().split("T")[0],
      end:   prevSun.toISOString().split("T")[0],
    };
  }, []);

  const inRange = (dateStr: string | null | undefined, start: string, end: string) => {
    if (!dateStr) return false;
    const d = dateStr.split("T")[0];
    return d >= start && d <= end;
  };

  const weekStats = useMemo(() => {
    const calc = (start: string, end: string) => {
      // Montages : dateMontage dans la plage, source != mesures
      const montages = allProjectsForStats.filter((p) =>
        (p as any)._source !== "mesures" &&
        !(p.typeServices || []).some((t: string) => t === "Services" || t.includes("Services")) &&
        inRange(p.dateMontage, start, end)
      );
      // Mesures : dateMesures dans la plage
      const mesures = allProjectsForStats.filter((p) =>
        inRange(p.dateMesures, start, end)
      );
      // Services : typeServices contient "Services" et dateMontage dans la plage
      const services = allProjectsForStats.filter((p) =>
        (p.typeServices || []).some((t: string) => t === "Services" || t.includes("Services")) &&
        inRange(p.dateMontage, start, end)
      );
      return {
        montages: montages.length,
        montagesCabines: montages.reduce((s, p) => s + (p.nbCabines || 0), 0),
        mesures: mesures.length,
        mesuresCabines: mesures.reduce((s, p) => s + (p.nbCabines || 0), 0),
        services: services.length,
        servicesCabines: services.reduce((s, p) => s + (p.nbCabines || 0), 0),
      };
    };
    return {
      cur:  calc(thisWeekBounds.start, thisWeekBounds.end),
      prev: calc(prevWeekBounds.start, prevWeekBounds.end),
    };
  }, [allProjectsForStats, thisWeekBounds, prevWeekBounds]);

  // Mesures aujourd'hui
  const mesuresTodayProjects = projects.filter((p) => (p as any)._source === "mesures" && (p.dateMesures || "").split("T")[0] === todayStr);
  const mesuresTodayCount = mesuresTodayProjects.length;
  const mesuresTodayCabines = mesuresTodayProjects.reduce((s, p) => s + (p.nbCabines || 0), 0);

  // Services du jour — on filtre par typeServices (pas _source) car un projet peut
  // être dédupliqué en "montage" si son État-CMD est actif, même s'il est aussi un service.
  const servicesTodayProjects = projects.filter((p) =>
    (p.typeServices || []).some((t) => t === "Services" || t.includes("Services")) &&
    (p.dateMontage || "").split("T")[0] === todayStr
  );
  const servicesTodayCount = servicesTodayProjects.length;
  const servicesTodayCabines = servicesTodayProjects.reduce((s, p) => s + (p.nbCabines || 0), 0);

  // SAV aujourd'hui : etatSAV = "RDV fixé" ET dateRDVSAV = aujourd'hui
  // On ne filtre pas par _source (dédupliqué), on se base sur les champs métier directement.
  const savTodayProjects = projects.filter(
    (p) => p.etatSAV === "RDV fixé" && (p.dateRDVSAV || "").split("T")[0] === todayStr
  );
  const savTodayCount = savTodayProjects.length;

  // Emplacement cabines : projets avec le champ "Emplacement de cabine" renseigné
  const emplacementCabinesProjects = projects.filter((p) =>
    p.etatCMD === "Cabine à aller chercher" || p.etatCMD === "Récéptionné - RDV à fixer"
  );
  const emplacementCabinesCount = emplacementCabinesProjects.length;
  const emplacementDepotTMCabines = emplacementCabinesProjects
    .filter((p) => p.emplacementCabine === "Dépôt TM")
    .reduce((s, p) => s + (p.nbCabines || 0), 0);
  const emplacementAutresCabines = emplacementCabinesProjects
    .filter((p) => p.emplacementCabine !== "Dépôt TM")
    .reduce((s, p) => s + (p.nbCabines || 0), 0);

  // Rapports en attente : projets montage dont la date est passée ou aujourd'hui
  // et dont le rapport n'est pas clôturé
  const rapportsAttenteProjects = projects.filter((p) => {
    const src = (p as any)._source;
    if (src === "mesures" || src === "sav") return false;
    const dateStr = (p.dateMontage || "").split("T")[0];
    if (!dateStr || dateStr > todayStr) return false;
    const cloture = (p.rapportDeMontage || "").toLowerCase().includes("clôt") ||
                    (p.rapportDeMontage || "").toLowerCase().includes("clot");
    return !cloture;
  }).sort((a, b) => ((b.dateMontage || "").split("T")[0]).localeCompare((a.dateMontage || "").split("T")[0]));
  const rapportsAttenteCount = rapportsAttenteProjects.length;

  // SAV non traités : tous les SAV actifs (pas terminés/annulés)
  const savNonTraitesProjects = projects.filter((p) =>
    (p as any)._source === "sav" &&
    p.etatSAV !== "Terminé" &&
    p.etatSAV !== "Annulé"
  ).sort((a, b) => (a.projet || "").localeCompare(b.projet || ""));
  const savNonTraitesCount = savNonTraitesProjects.length;

  // Soucis en cours : projets dont l'État - CMD est "Soucis montage"
  const soucisEnCoursProjects = projects.filter((p) => p.etatCMD === "Soucis montage")
    .sort((a, b) => ((a.dateMontage || "").split("T")[0]).localeCompare((b.dateMontage || "").split("T")[0]));
  const soucisEnCoursCount = soucisEnCoursProjects.length;

  // Mesures terminées sans commande — données chargées via la route dédiée
  const mesuresSansCommandeProjects = mesuresSansCommandeData;
  const mesuresSansCommandeCount = mesuresSansCommandeProjects.length;

  // SAV historique : tous les projets dont la case "SAV" est cochée (actifs + terminés)
  const allSavProjects = [...projects, ...terminatedProjects]
    .filter((p, i, arr) => arr.findIndex((x) => x.id === p.id) === i)
    .filter((p) => p.sav === true)
    .sort((a, b) => {
      const da = (a.dateMontage || a.dateRDVSAV || "").split("T")[0];
      const db = (b.dateMontage || b.dateRDVSAV || "").split("T")[0];
      return db.localeCompare(da); // plus récent en premier
    });
  const allSavCount = allSavProjects.length;

  // Soucis montage historique : tous les projets avec soucisMontage = true (actifs + terminés)
  const allSoucisProjects = [...projects, ...terminatedProjects]
    .filter((p, i, arr) => arr.findIndex((x) => x.id === p.id) === i)
    .filter((p) => p.soucisMontage === true)
    .sort((a, b) => {
      const da = (a.dateMontage || "").split("T")[0];
      const db = (b.dateMontage || "").split("T")[0];
      return db.localeCompare(da);
    });
  const allSoucisCount = allSoucisProjects.length;

  // À facturer : projets dont la propriété "Facturations" = "A facturer"
  // Les projets facturables ont souvent etatCMD = "Terminé" → absents de
  // `projects` (actifs uniquement) → on cherche aussi dans terminatedProjects.
  const aFacturerProjects = [...projects, ...terminatedProjects]
    .filter((p, i, arr) => arr.findIndex((x) => x.id === p.id) === i) // déduplique
    .filter((p) => p.facturations === "A facturer")
    .sort((a, b) => ((a.dateOffre || "") > (b.dateOffre || "") ? -1 : 1));
  const aFacturerCount = aFacturerProjects.length;

  // Dossiers en cours : TOUS les projets dont État-CMD n'est pas Annulé ou Terminé.
  // On utilise allActiveProjects (endpoint /api/projects/all-active) qui retourne
  // tous les statuts hors Terminé/Annulé — contrairement à `projects` qui ne
  // couvre que les statuts CMD spécifiques (≈80 projets sur 209).
  const dossiersEnCoursProjects = allActiveProjects
    .filter((p) => p.etatCMD !== "Annulé" && p.etatCMD !== "Terminé")
    .sort((a, b) => {
      const da = a.dateOffre || "";
      const db = b.dateOffre || "";
      if (!da && !db) return 0;
      if (!da) return 1;  // sans date → en bas
      if (!db) return -1;
      return db.localeCompare(da); // décroissant : plus récent en premier
    });
  const dossiersEnCoursCount = dossiersEnCoursProjects.length;
  const dossiersEnCoursCabines = dossiersEnCoursProjects.reduce((sum, p) => sum + (p.nbCabines || 0), 0);

  // ── renderCard : rendu d'un bouton dashboard par son ID ───────────────────
  // Défini avant le return pour être partagé entre la grille standard (non-CMM)
  // et la zone de widgets configurable (thème CleanMyMac).
  const renderCard = (id: string): React.ReactNode => {
    switch (id) {
      case "mesures-today": return (
        <button onClick={(e) => openPanel("mesures-today", e)} className="relative glass-card rounded-2xl p-2 sm:p-4 flex flex-col items-center hover:shadow-lg active:scale-95 transition-all w-full h-full">
          <span className="absolute top-0 left-0 w-8 h-8 rounded-tl-2xl rounded-br-xl bg-cyan-100/80 dark:bg-cyan-900/30 flex items-center justify-center"><Ruler className="w-4 h-4 text-cyan-500 dark:text-cyan-400" /></span>
          <p className="text-lg sm:text-2xl font-bold text-cyan-600 dark:text-cyan-400">{mesuresTodayCount}</p>
          <p className="text-[10px] sm:text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 leading-tight text-center">Mesures aujourd&apos;hui</p>
          <p className="text-[9px] sm:text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{mesuresTodayCabines} cab.</p>
        </button>
      );
      case "today": return (
        <button onClick={(e) => openPanel("today", e)} className="relative glass-card rounded-2xl p-2 sm:p-4 flex flex-col items-center hover:shadow-lg active:scale-95 transition-all w-full h-full">
          <span className="absolute top-0 left-0 w-8 h-8 rounded-tl-2xl rounded-br-xl bg-blue-100/80 dark:bg-blue-900/30 flex items-center justify-center"><Wrench className="w-4 h-4 text-blue-500 dark:text-blue-400" /></span>
          <p className="text-lg sm:text-2xl font-bold text-blue-600 dark:text-blue-400">{todayMontages}</p>
          <p className="text-[10px] sm:text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 leading-tight text-center">Montages aujourd&apos;hui</p>
          <p className="text-[9px] sm:text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 invisible" aria-hidden="true">0 cab.</p>
        </button>
      );
      case "services-today": return (
        <button onClick={(e) => openPanel("services-today", e)} className="relative glass-card rounded-2xl p-2 sm:p-4 flex flex-col items-center hover:shadow-lg active:scale-95 transition-all w-full h-full">
          <span className="absolute top-0 left-0 w-8 h-8 rounded-tl-2xl rounded-br-xl bg-violet-100/80 dark:bg-violet-900/30 flex items-center justify-center"><Settings className="w-4 h-4 text-violet-500 dark:text-violet-400" /></span>
          <p className="text-lg sm:text-2xl font-bold text-violet-600 dark:text-violet-400">{servicesTodayCount}</p>
          <p className="text-[10px] sm:text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 leading-tight text-center">Services aujourd&apos;hui</p>
          <p className="text-[9px] sm:text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{servicesTodayCabines} cab.</p>
        </button>
      );
      case "sav-today": return (
        <button onClick={(e) => openPanel("sav-today", e)} className="relative glass-card rounded-2xl p-2 sm:p-4 flex flex-col items-center hover:shadow-lg active:scale-95 transition-all w-full h-full">
          <span className="absolute top-0 left-0 w-8 h-8 rounded-tl-2xl rounded-br-xl bg-red-100/80 dark:bg-red-900/30 flex items-center justify-center"><AlertTriangle className="w-4 h-4 text-red-500 dark:text-red-400" /></span>
          <p className="text-lg sm:text-2xl font-bold text-red-600 dark:text-red-400">{savTodayCount}</p>
          <p className="text-[10px] sm:text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 leading-tight text-center">SAV aujourd&apos;hui</p>
          <p className="text-[9px] sm:text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 invisible" aria-hidden="true">0 cab.</p>
        </button>
      );
      case "week": return (
        <button onClick={(e) => openPanel("week", e)} className="relative glass-card rounded-2xl p-2 sm:p-4 flex flex-col items-center hover:shadow-lg active:scale-95 transition-all w-full h-full">
          <span className="absolute top-0 left-0 w-8 h-8 rounded-tl-2xl rounded-br-xl bg-emerald-100/80 dark:bg-emerald-900/30 flex items-center justify-center"><Box className="w-4 h-4 text-emerald-500 dark:text-emerald-400" /></span>
          <p className="text-lg sm:text-2xl font-bold text-emerald-600 dark:text-emerald-400">{totalCabinesWeek}</p>
          <p className="text-[10px] sm:text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 leading-tight text-center">Cabines cette semaine</p>
          {totalCabinesFutureWeeks > 0
            ? <p className="text-[7px] sm:text-[9px] text-emerald-500 dark:text-emerald-400 mt-0.5 font-medium">+{totalCabinesFutureWeeks} à venir</p>
            : <p className="text-[9px] sm:text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 invisible" aria-hidden="true">0 cab.</p>
          }
        </button>
      );
      case "active": return (
        <button onClick={(e) => openPanel("active", e)} className="relative glass-card rounded-2xl p-2 sm:p-4 flex flex-col items-center hover:shadow-lg active:scale-95 transition-all w-full h-full">
          <span className="absolute top-0 left-0 w-8 h-8 rounded-tl-2xl rounded-br-xl bg-amber-100/80 dark:bg-amber-900/30 flex items-center justify-center"><Users className="w-4 h-4 text-amber-500 dark:text-amber-400" /></span>
          <p className="text-lg sm:text-2xl font-bold text-amber-600 dark:text-amber-400">{busyToday}</p>
          <p className="text-[10px] sm:text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 leading-tight text-center">Monteurs actifs</p>
          <p className="text-[9px] sm:text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 invisible" aria-hidden="true">0 cab.</p>
        </button>
      );
      case "emplacement-cabines": return (
        <button onClick={(e) => openPanel("emplacement-cabines", e)} className="relative glass-card rounded-2xl p-2 sm:p-4 flex flex-col items-center hover:shadow-lg active:scale-95 transition-all w-full h-full">
          <span className="absolute top-0 left-0 w-8 h-8 rounded-tl-2xl rounded-br-xl bg-sky-100/80 dark:bg-sky-900/30 flex items-center justify-center"><MapPin className="w-4 h-4 text-sky-500 dark:text-sky-400" /></span>
          <p className="text-lg sm:text-2xl font-bold text-sky-600 dark:text-sky-400">{emplacementCabinesCount}</p>
          <p className="text-[10px] sm:text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 leading-tight text-center">Emplacement cabines</p>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap justify-center">
            <p className="text-[7px] sm:text-[9px] text-sky-500 dark:text-sky-400 leading-tight">À chercher : <span className="font-semibold">{emplacementAutresCabines}</span></p>
            <span className="text-gray-300 dark:text-gray-600 text-[7px]">·</span>
            <p className="text-[7px] sm:text-[9px] text-amber-500 dark:text-amber-400 leading-tight">Dépôt TM : <span className="font-semibold">{emplacementDepotTMCabines}</span></p>
          </div>
        </button>
      );
      case "rapports-attente": return (
        <button onClick={(e) => openPanel("rapports-attente", e)} className="relative glass-card rounded-2xl p-2 sm:p-4 flex flex-col items-center hover:shadow-lg active:scale-95 transition-all w-full h-full">
          <span className="absolute top-0 left-0 w-8 h-8 rounded-tl-2xl rounded-br-xl bg-orange-100/80 dark:bg-orange-900/30 flex items-center justify-center"><Clock className="w-4 h-4 text-orange-500 dark:text-orange-400" /></span>
          <p className="text-lg sm:text-2xl font-bold text-orange-600 dark:text-orange-400">{rapportsAttenteCount}</p>
          <p className="text-[10px] sm:text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 leading-tight text-center">Rapports en attente</p>
          <p className="text-[9px] sm:text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 invisible" aria-hidden="true">0 cab.</p>
        </button>
      );
      case "sav-non-traites": return (
        <button onClick={(e) => openPanel("sav-non-traites", e)} className="relative glass-card rounded-2xl p-2 sm:p-4 flex flex-col items-center hover:shadow-lg active:scale-95 transition-all w-full h-full">
          <span className="absolute top-0 left-0 w-8 h-8 rounded-tl-2xl rounded-br-xl bg-rose-100/80 dark:bg-rose-900/30 flex items-center justify-center"><ShieldAlert className="w-4 h-4 text-rose-500 dark:text-rose-400" /></span>
          <p className="text-lg sm:text-2xl font-bold text-rose-600 dark:text-rose-400">{savNonTraitesCount}</p>
          <p className="text-[10px] sm:text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 leading-tight text-center">SAV non traités</p>
          <p className="text-[9px] sm:text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 invisible" aria-hidden="true">0 cab.</p>
        </button>
      );
      case "soucis-en-cours": return (
        <button onClick={(e) => openPanel("soucis-en-cours", e)} className="relative glass-card rounded-2xl p-2 sm:p-4 flex flex-col items-center hover:shadow-lg active:scale-95 transition-all w-full h-full">
          <span className="absolute top-0 left-0 w-8 h-8 rounded-tl-2xl rounded-br-xl bg-red-100/80 dark:bg-red-900/30 flex items-center justify-center"><AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" /></span>
          <p className="text-lg sm:text-2xl font-bold text-red-700 dark:text-red-400">{soucisEnCoursCount}</p>
          <p className="text-[10px] sm:text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 leading-tight text-center">Soucis en cours</p>
          <p className="text-[9px] sm:text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 invisible" aria-hidden="true">0 cab.</p>
        </button>
      );
      case "dossiers-en-cours": return (
        <button onClick={(e) => openPanel("dossiers-en-cours", e)} className="relative glass-card rounded-2xl p-2 sm:p-4 flex flex-col items-center hover:shadow-lg active:scale-95 transition-all w-full h-full">
          <span className="absolute top-0 left-0 w-8 h-8 rounded-tl-2xl rounded-br-xl bg-indigo-100/80 dark:bg-indigo-900/30 flex items-center justify-center"><FolderOpen className="w-4 h-4 text-indigo-500 dark:text-indigo-400" /></span>
          <p className="text-lg sm:text-2xl font-bold text-indigo-600 dark:text-indigo-400">{dossiersEnCoursCount || "…"}</p>
          <p className="text-[10px] sm:text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 leading-tight text-center">Projets en cours</p>
          <p className="text-[9px] sm:text-[10px] text-indigo-400 dark:text-indigo-500 mt-0.5">{dossiersEnCoursCabines ? `${dossiersEnCoursCabines} cab.` : ""}</p>
        </button>
      );
      case "a-facturer": return (
        <button onClick={(e) => openPanel("a-facturer", e)} className="relative glass-card rounded-2xl p-2 sm:p-4 flex flex-col items-center hover:shadow-lg active:scale-95 transition-all w-full h-full">
          <span className="absolute top-0 left-0 w-8 h-8 rounded-tl-2xl rounded-br-xl bg-yellow-100/80 dark:bg-yellow-900/30 flex items-center justify-center"><Receipt className="w-4 h-4 text-yellow-600 dark:text-yellow-400" /></span>
          <p className="text-lg sm:text-2xl font-bold text-yellow-600 dark:text-yellow-400">{aFacturerCount}</p>
          <p className="text-[10px] sm:text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 leading-tight text-center">À facturer</p>
          <p className="text-[9px] sm:text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 invisible" aria-hidden="true">0 cab.</p>
        </button>
      );
      case "calendrier": return (
        <button onClick={(e) => { openPanel("calendrier", e); setCalendarSelectedDay(null); }} className="relative glass-card rounded-2xl p-2 sm:p-4 flex flex-col items-center hover:shadow-lg active:scale-95 transition-all w-full h-full">
          <span className="absolute top-0 left-0 w-8 h-8 rounded-tl-2xl rounded-br-xl bg-violet-100/80 dark:bg-violet-900/30 flex items-center justify-center"><CalendarDays className="w-4 h-4 text-violet-500 dark:text-violet-400" /></span>
          <p className="text-lg sm:text-2xl font-bold text-violet-600 dark:text-violet-400">{collabData.flatMap(c => [...c.todayProjects, ...c.thisWeekProjects, ...c.nextWeekProjects]).filter((p, i, a) => a.findIndex(x => x.id === p.id) === i).length}</p>
          <p className="text-[10px] sm:text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 leading-tight text-center">Calendrier</p>
          <p className="text-[9px] sm:text-[10px] text-violet-400 dark:text-violet-500 mt-0.5">Tous RDV</p>
        </button>
      );
      case "archives": return (
        <button onClick={() => onNavigate?.("archives")} className={`relative glass-card rounded-2xl p-2 sm:p-4 flex flex-col items-center hover:shadow-lg active:scale-95 transition-all w-full h-full ${showSummaryPanel !== null ? "opacity-40 scale-[0.97]" : ""}`}>
          <span className="absolute top-0 left-0 w-8 h-8 rounded-tl-2xl rounded-br-xl bg-amber-100/80 dark:bg-amber-900/30 flex items-center justify-center"><Archive className="w-4 h-4 text-amber-600 dark:text-amber-400" /></span>
          <p className="text-lg sm:text-2xl font-bold text-amber-600 dark:text-amber-400">
            {archivesCount === null ? <span className="animate-pulse text-base">…</span> : archivesCount}
          </p>
          <p className="text-[10px] sm:text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 leading-tight text-center">Archives</p>
          <p className="text-[9px] sm:text-[10px] text-amber-400 dark:text-amber-500 mt-0.5">Clôturés</p>
        </button>
      );
      case "arrivage": return (
        <button onClick={() => onNavigate?.("arrivage")} className={`relative glass-card rounded-2xl p-2 sm:p-4 flex flex-col items-center hover:shadow-lg active:scale-95 transition-all w-full h-full ${showSummaryPanel !== null ? "opacity-40 scale-[0.97]" : ""}`}>
          <span className="absolute top-0 left-0 w-8 h-8 rounded-tl-2xl rounded-br-xl bg-sky-100/80 dark:bg-sky-900/30 flex items-center justify-center"><Truck className="w-4 h-4 text-sky-600 dark:text-sky-400" /></span>
          <p className="text-lg sm:text-2xl font-bold text-sky-600 dark:text-sky-400">
            {(projects.filter(p => ["Cabines à recevoir","Livraison partielle","Cabine à aller chercher"].includes((p as any).etatCMD || ""))).length || "—"}
          </p>
          <p className="text-[10px] sm:text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 leading-tight text-center">Arrivage</p>
          <p className="text-[9px] sm:text-[10px] text-sky-400 dark:text-sky-500 mt-0.5">Cabines</p>
        </button>
      );
      case "sav-historique": return (
        <button onClick={(e) => openPanel("sav-historique", e)} className="relative glass-card rounded-2xl p-2 sm:p-4 flex flex-col items-center hover:shadow-lg active:scale-95 transition-all w-full h-full">
          <span className="absolute top-0 left-0 w-8 h-8 rounded-tl-2xl rounded-br-xl bg-red-100/80 dark:bg-red-900/30 flex items-center justify-center"><ShieldAlert className="w-4 h-4 text-red-500 dark:text-red-400" /></span>
          <p className="text-lg sm:text-2xl font-bold text-red-600 dark:text-red-400">{terminatedLoading ? <span className="animate-pulse text-base">…</span> : allSavCount}</p>
          <p className="text-[10px] sm:text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 leading-tight text-center">SAV</p>
          <p className="text-[9px] sm:text-[10px] text-red-400 dark:text-red-500 mt-0.5">Tous</p>
        </button>
      );
      case "soucis-historique": return (
        <button onClick={(e) => openPanel("soucis-historique", e)} className="relative glass-card rounded-2xl p-2 sm:p-4 flex flex-col items-center hover:shadow-lg active:scale-95 transition-all w-full h-full">
          <span className="absolute top-0 left-0 w-8 h-8 rounded-tl-2xl rounded-br-xl bg-orange-100/80 dark:bg-orange-900/30 flex items-center justify-center"><AlertTriangle className="w-4 h-4 text-orange-500 dark:text-orange-400" /></span>
          <p className="text-lg sm:text-2xl font-bold text-orange-600 dark:text-orange-400">{terminatedLoading ? <span className="animate-pulse text-base">…</span> : allSoucisCount}</p>
          <p className="text-[10px] sm:text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 leading-tight text-center">Soucis montage</p>
          <p className="text-[9px] sm:text-[10px] text-orange-400 dark:text-orange-500 mt-0.5">Tous</p>
        </button>
      );
      case "mesures-sans-commande": return (
        <button onClick={(e) => openPanel("mesures-sans-commande", e)} className="relative glass-card rounded-2xl p-2 sm:p-4 flex flex-col items-center hover:shadow-lg active:scale-95 transition-all w-full h-full">
          <span className="absolute top-0 left-0 w-8 h-8 rounded-tl-2xl rounded-br-xl bg-cyan-100/80 dark:bg-cyan-900/30 flex items-center justify-center"><Ruler className="w-4 h-4 text-cyan-500 dark:text-cyan-400" /></span>
          <p className="text-lg sm:text-2xl font-bold text-cyan-600 dark:text-cyan-400">{mesuresSansCommandeLoading ? <span className="animate-pulse text-base">…</span> : mesuresSansCommandeCount}</p>
          <p className="text-[10px] sm:text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 leading-tight text-center">Mesures</p>
          <p className="text-[9px] sm:text-[10px] text-cyan-400 dark:text-cyan-500 mt-0.5">Non commandées</p>
        </button>
      );
      default: return null;
    }
  };

  return (
    <div className="mb-6 space-y-4">
      {/* En-tête de bienvenue */}
      <div className="glass-card rounded-2xl p-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-lg font-bold text-blue-600 dark:text-blue-400 shrink-0">
            {getCollaboratorInitials(firstName)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 dark:text-gray-100">Bonjour {firstName} 👋</p>
            <p className="text-xs font-medium text-blue-500 dark:text-blue-400 capitalize">
              {new Date().toLocaleDateString("fr-CH", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 italic mt-0.5 leading-snug">&quot;{getDailyQuote(firstName)}&quot;</p>
          </div>
          {/* Météo + cabines — colonne droite */}
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            {/* Widget météo */}
            {weather ? (
              <div className="text-right">
                <p className="text-xl leading-none">{weather.icon}</p>
                <p className="text-base font-bold text-gray-800 dark:text-gray-100 leading-tight">{weather.temp}°</p>
                <p className="text-[9px] text-gray-400 dark:text-gray-500 leading-tight max-w-[72px] text-right">{weather.desc}</p>
                {weather.city && <p className="text-[8px] text-gray-300 dark:text-gray-600 leading-tight">{weather.city}</p>}
              </div>
            ) : (
              <span className="text-xl animate-pulse">🌡️</span>
            )}
            {/* Cabines semaine */}
            <button onClick={() => setShowWeekProjects(!showWeekProjects)} className="text-right hover:opacity-70 transition-opacity">
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{totalCabinesWeek}</p>
              <p className="text-[10px] text-gray-400 dark:text-gray-500">cab. cette sem. ▾</p>
              {weekSummary && <p className="text-[9px] text-gray-400 mt-0.5">{weekSummary}</p>}
            </button>
          </div>
        </div>

        {/* ── Résumé du jour ── */}
        {!cmmMode && (
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 flex gap-3 items-start">
          {/* Liste verticale services du jour */}
          <div className="flex-1 space-y-1.5">
            {([
              { label: "Montage",  count: todayMontages,  color: "text-orange-500 dark:text-orange-400",       panel: "today" as const },
              { label: "Mesure",   count: todayMesures,   color: "text-cyan-600 dark:text-cyan-400",           panel: "mesures-today" as const },
              { label: "SAV",      count: savTodayCount,  color: "text-red-600 dark:text-red-400",             panel: "sav-today" as const },
              { label: "Service",  count: todayServices,  color: "text-violet-600 dark:text-violet-400",       panel: "services-today" as const },
              { label: "Garantie", count: todayGaranties, color: "text-emerald-600 dark:text-emerald-400",     panel: null as null },
            ]).map(({ label, count, color, panel }) => (
              <button
                key={label}
                onClick={panel ? (e) => openPanel(panel, e as React.MouseEvent<HTMLButtonElement>) : undefined}
                className={`flex items-center justify-between w-full ${panel ? "hover:opacity-70 active:scale-95 transition-all" : "cursor-default"}`}
              >
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  <span className={`font-bold ${count > 0 ? color : "text-gray-300 dark:text-gray-600"} mr-1`}>{count}</span>
                  {`${label}${label !== "SAV" && count !== 1 ? "s" : ""} prévu${count !== 1 ? "s" : ""} aujourd'hui`}
                </span>
                {panel && count > 0 && <span className="text-[9px] text-gray-300 dark:text-gray-600">›</span>}
              </button>
            ))}
          </div>
        </div>
        )}

        {/* ── Barre stats hebdomadaires ── */}
        {(() => {
          const cur = weekStats.cur;
          const prev = weekStats.prev;
          const StatCell = ({ label, curVal, curCab, prevVal, color }: {
            label: string; curVal: number; curCab: number; prevVal: number; color: string;
          }) => {
            const diff = curVal - prevVal;
            const trend = diff > 0 ? "↑" : diff < 0 ? "↓" : "=";
            const trendColor = diff > 0 ? "text-emerald-500" : diff < 0 ? "text-red-400" : "text-gray-400";
            return (
              <div className="flex-1 min-w-0 text-center">
                <p className={`text-[10px] font-semibold uppercase tracking-wider mb-1 ${color}`}>{label}</p>
                <p className="text-xl font-bold text-gray-900 dark:text-gray-100 leading-none">{curVal}</p>
                {curCab > 0 && <p className="text-[10px] text-gray-400">{curCab} cab.</p>}
                <div className="flex items-center justify-center gap-0.5 mt-1">
                  <span className={`text-[10px] font-semibold ${trendColor}`}>{trend}{Math.abs(diff) > 0 ? Math.abs(diff) : ""}</span>
                  <span className="text-[9px] text-gray-400">vs sem. préc. ({prevVal})</span>
                </div>
              </div>
            );
          };
          return (
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
              <div className="flex items-stretch gap-2">
                <StatCell label="Mesures" curVal={cur.mesures} curCab={cur.mesuresCabines} prevVal={prev.mesures} color="text-cyan-600 dark:text-cyan-400" />
                <div className="w-px bg-gray-100 dark:bg-gray-700 self-stretch" />
                <StatCell label="Projets" curVal={cur.montages} curCab={0} prevVal={prev.montages} color="text-orange-500 dark:text-orange-400" />
                <div className="w-px bg-gray-100 dark:bg-gray-700 self-stretch" />
                <StatCell label="Cabines" curVal={cur.montagesCabines} curCab={0} prevVal={prev.montagesCabines} color="text-orange-400 dark:text-orange-300" />
                <div className="w-px bg-gray-100 dark:bg-gray-700 self-stretch" />
                <StatCell label="Services" curVal={cur.services} curCab={cur.servicesCabines} prevVal={prev.services} color="text-violet-500 dark:text-violet-400" />
              </div>
            </div>
          );
        })()}

        {showWeekProjects && (() => {
          const allWeekProjects = collabData
            .flatMap((c) => [...c.todayProjects, ...c.thisWeekProjects, ...c.nextWeekProjects])
            .filter((p, i, arr) => arr.findIndex((x) => x.id === p.id) === i)
            .sort((a, b) => (a.dateMontage || "").localeCompare(b.dateMontage || ""));
          return (
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 space-y-1.5">
              {(() => {
                let lastDay = "";
                return allWeekProjects.flatMap((p) => {
                  const dayKey = (p.dateMontage || p.dateMesures || "").split("T")[0];
                  const items: React.ReactNode[] = [];
                  if (dayKey !== lastDay) {
                    items.push(
                      <div key={`sep-${dayKey}-${p.id}`} className="flex items-center gap-2 pt-1 first:pt-0">
                        <div className="flex-1 h-px bg-gray-200/80 dark:bg-gray-700/60" />
                        <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium shrink-0 px-1">
                          {dayKey ? new Date(dayKey + "T12:00:00").toLocaleDateString("fr-CH", { weekday: "short", day: "numeric", month: "short" }) : ""}
                        </span>
                        <div className="flex-1 h-px bg-gray-200/80 dark:bg-gray-700/60" />
                      </div>
                    );
                    lastDay = dayKey;
                  }
                  const source = getProjectSource(p);
                  const isMesure = source === "mesures";
                  const collabField = isMesure ? (p.mesuresTraiteePar || p.collaborateurs || "") : (p.collaborateurs || "");
                  const names = collabField.split(" & ").map((n) => n.trim()).filter(Boolean);
                  const logo = getClientLogo(p.projet);
                  const typeBadge = <span className={`text-[8px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${isMesure ? "bg-cyan-100 text-cyan-700" : "bg-orange-100 text-orange-700"}`}>{isMesure ? "Mesures" : "Montages"}</span>;
                  items.push(
                    isIOS ? (
                    <Link key={p.id} href={`/projet/${p.id}?mode=dashboard`}
                      className="block px-2 py-1.5 rounded-lg hover:bg-white/60 dark:hover:bg-white/5 transition-colors text-xs">
                      <div className="flex-1 min-w-0">
                        {p.ofrTM && <span className="text-[9px] font-mono text-gray-400">{p.ofrTM}</span>}
                        <p className="text-xs text-gray-900 dark:text-gray-100 line-clamp-3 sm:line-clamp-2">{p.projet}</p>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          {typeBadge}
                          {logo && <LogoImg src={logo} />}
                          <div className="flex -space-x-1 shrink-0">
                            {names.slice(0, 3).map((n) => (
                              <span key={n} className="w-5 h-5 rounded-full text-[7px] font-bold flex items-center justify-center border border-white dark:border-gray-800"
                                style={{ backgroundColor: getCollaboratorColor(n).bg, color: getCollaboratorColor(n).text }}>
                                {getCollaboratorInitials(n)}
                              </span>
                            ))}
                          </div>
                          <Badge variant="outline" className="text-[10px] shrink-0 ml-auto">{p.nbCabines || 0} cab.</Badge>
                        </div>
                      </div>
                    </Link>
                    ) : (
                    <Link key={p.id} href={`/projet/${p.id}?mode=dashboard`}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/60 dark:hover:bg-white/5 transition-colors text-xs">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 flex-wrap">
                          {p.ofrTM && <span className="text-[9px] font-mono text-gray-400">{p.ofrTM}</span>}
                          {typeBadge}
                        </div>
                        <p className="text-xs text-gray-900 dark:text-gray-100 line-clamp-3 sm:line-clamp-2">{p.projet}</p>
                      </div>
                      {logo && <LogoImg src={logo} />}
                      <div className="flex -space-x-1 shrink-0">
                        {names.slice(0, 3).map((n) => (
                          <span key={n} className="w-5 h-5 rounded-full text-[7px] font-bold flex items-center justify-center border border-white dark:border-gray-800"
                            style={{ backgroundColor: getCollaboratorColor(n).bg, color: getCollaboratorColor(n).text }}>
                            {getCollaboratorInitials(n)}
                          </span>
                        ))}
                      </div>
                      <Badge variant="outline" className="text-[10px] shrink-0">{p.nbCabines || 0} cab.</Badge>
                    </Link>
                    )
                  );
                  return items;
                });
              })()}
            </div>
          );
        })()}

        {/* ── CMM Planning Row ─────────────────────────────────────────────── */}
        {cmmMode && (() => {
          const tomorrowD = new Date(); tomorrowD.setDate(tomorrowD.getDate() + 1);
          const tomorrowStr = tomorrowD.toISOString().split("T")[0];
          const afterTomorrowD = new Date(); afterTomorrowD.setDate(afterTomorrowD.getDate() + 2);
          const afterTomorrowStr = afterTomorrowD.toISOString().split("T")[0];

          const micaelData = collabData.find(c => c.name === firstName);
          const micaelTomorrowProjects = micaelData
            ? micaelData.myProjects.filter(p => projectSpansDate(p, tomorrowStr))
            : [];

          const collabTodayList = collabData.filter(c => c.todayProjects.length > 0);
          const collabTomorrowList = collabData
            .map(c => ({ ...c, tomorrowProjects: c.myProjects.filter(p => projectSpansDate(p, tomorrowStr)) }))
            .filter(c => c.tomorrowProjects.length > 0);
          const collabAfterList = collabData
            .map(c => ({
              ...c,
              futureProjects: c.myProjects
                .filter(p => projectActiveDuringRange(p, afterTomorrowStr, "2099-12-31"))
                .sort((a, b) => (a.dateMontage || a.dateMesures || "").localeCompare(b.dateMontage || b.dateMesures || "")),
            }))
            .filter(c => c.futureProjects.length > 0);

          const tomorrowLabel = new Date(tomorrowStr + "T12:00").toLocaleDateString("fr-CH", { weekday: "short", day: "numeric", month: "short" });

          const cardCls = "flex-shrink-0 min-w-[160px] flex-1 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-3 space-y-2";
          const titleCls = "text-[10px] font-semibold uppercase tracking-widest text-white/40";
          const subtitleCls = "text-[9px] text-white/25 -mt-1";
          const emptyMsg = (msg: string) => <p className="text-[10px] text-white/20 italic">{msg}</p>;

          const svcItems = [
            { label: "Montage",  count: todayMontages,  color: "text-orange-400",  panel: "today" as const },
            { label: "Mesure",   count: todayMesures,   color: "text-cyan-400",    panel: "mesures-today" as const },
            { label: "SAV",      count: savTodayCount,  color: "text-red-400",     panel: "sav-today" as const },
            { label: "Service",  count: todayServices,  color: "text-violet-400",  panel: "services-today" as const },
            { label: "Garantie", count: todayGaranties, color: "text-emerald-400", panel: null as null },
          ];

          return (
            <div className="mt-3 pt-3 border-t border-white/10 flex gap-2 overflow-x-auto pb-1">
              {/* 1 – Services Micael */}
              <div className={cardCls}>
                <p className={titleCls}>Services Micael</p>
                <div className="space-y-0.5">
                  {svcItems.map(({ label, count, color, panel }) => (
                    <button
                      key={label}
                      onClick={panel ? (e) => openPanel(panel, e as React.MouseEvent<HTMLButtonElement>) : undefined}
                      className={`flex items-center gap-1.5 w-full text-left ${panel && count > 0 ? "hover:opacity-70 active:scale-95 transition-all" : "cursor-default"}`}
                    >
                      <span className={`text-xs font-bold ${count > 0 ? color : "text-white/20"}`}>{count}</span>
                      <span className="text-[10px] text-white/50">
                        {`${label}${label !== "SAV" && count !== 1 ? "s" : ""} prévu${count !== 1 ? "s" : ""} aujourd'hui`}
                      </span>
                      {panel && count > 0 && <span className="text-white/30 ml-auto text-xs">›</span>}
                    </button>
                  ))}
                </div>
              </div>

              {/* 2 – Planning Micael J+1 */}
              <div className={cardCls}>
                <p className={titleCls}>Planning Micael J+1</p>
                <p className={subtitleCls}>{tomorrowLabel}</p>
                {micaelTomorrowProjects.length === 0
                  ? emptyMsg("Aucun projet demain")
                  : <div className="space-y-1">
                      {micaelTomorrowProjects.map(p => (
                        <p key={p.id} className="text-[10px] text-white/60 truncate">
                          {p.nomChantier || p.projet}
                        </p>
                      ))}
                    </div>
                }
              </div>

              {/* 3 – Planning Collaborateurs Aujourd'hui */}
              <div className={cardCls}>
                <p className={titleCls}>Planning Collaborateurs</p>
                <p className={subtitleCls}>Aujourd'hui</p>
                {collabTodayList.length === 0
                  ? emptyMsg("Personne planifié")
                  : <div className="space-y-1">
                      {collabTodayList.map(c => (
                        <div key={c.name} className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c.colors.dot }} />
                          <span className="text-[10px] font-medium text-white/65 truncate">{c.name}</span>
                          <span className="text-[9px] text-white/30 ml-auto flex-shrink-0">{c.todayProjects.length}p</span>
                        </div>
                      ))}
                    </div>
                }
              </div>

              {/* 4 – Planning Collaborateurs J+1 */}
              <div className={cardCls}>
                <p className={titleCls}>Planning Collaborateurs</p>
                <p className={subtitleCls}>{tomorrowLabel}</p>
                {collabTomorrowList.length === 0
                  ? emptyMsg("Aucun RDV demain")
                  : <div className="space-y-1">
                      {collabTomorrowList.map(c => (
                        <div key={c.name} className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c.colors.dot }} />
                          <span className="text-[10px] font-medium text-white/65 truncate">{c.name}</span>
                          <span className="text-[9px] text-white/30 ml-auto flex-shrink-0">{c.tomorrowProjects.length}p</span>
                        </div>
                      ))}
                    </div>
                }
              </div>

              {/* 5 – Planning Collaborateurs Après J+1 */}
              <div className={cardCls}>
                <p className={titleCls}>Après J+1</p>
                <p className={subtitleCls}>Tous les RDV fixés</p>
                {collabAfterList.length === 0
                  ? emptyMsg("Aucun RDV à venir")
                  : <div className="space-y-1 max-h-28 overflow-y-auto">
                      {collabAfterList.flatMap(c =>
                        c.futureProjects.slice(0, 4).map(p => {
                          const dateStr = (p.dateMontage || p.dateMesures || "").split("T")[0];
                          const dateLbl = dateStr
                            ? new Date(dateStr + "T12:00").toLocaleDateString("fr-CH", { day: "numeric", month: "short" })
                            : "";
                          return (
                            <div key={`${c.name}-${p.id}`} className="flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: c.colors.dot }} />
                              <span className="text-[9px] text-white/35 flex-shrink-0 w-10">{dateLbl}</span>
                              <span className="text-[9px] text-white/50 truncate">{c.name}</span>
                            </div>
                          );
                        })
                      )}
                    </div>
                }
              </div>
            </div>
          );
        })()}
      </div>

      {/* Summary cards — réorganisables style iOS (masquées en mode CMM) */}
      {!cmmMode && (() => {
        // renderCard est défini dans le scope du composant juste avant ce return JSX.
        // La case "__empty__" (zone de dépôt drag-and-drop) est gérée inline ici.
        return (
          // Wrapper : efface + replie simultanément — pas de séquence décalée
          <div
            className="space-y-2 overflow-hidden"
            style={{
              opacity: showSummaryPanel && !isEditMode ? 0 : 1,
              maxHeight: showSummaryPanel && !isEditMode ? 0 : 9999,
              transition: "opacity 180ms ease, max-height 260ms ease",
              pointerEvents: showSummaryPanel && !isEditMode ? "none" : undefined,
            }}
          >
            {/* Barre mode édition */}
            {isEditMode && (
              <div className="flex items-center justify-between px-1 py-1.5 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
                <p className="text-[11px] text-blue-600 dark:text-blue-300 font-medium pl-1">
                  ✦ Maintenez un bouton pour le déplacer
                </p>
                <button
                  onClick={exitEditMode}
                  className="text-[11px] font-bold px-3 py-1.5 rounded-full bg-blue-600 text-white hover:bg-blue-700 active:scale-95 transition-all"
                >
                  Terminer
                </button>
              </div>
            )}
            <div className={`grid grid-cols-2 sm:grid-cols-6 gap-1.5 sm:gap-3 ${isEditMode ? "select-none" : ""}`}>
              {buttonOrder.map(id => {
                const isDragging = dragSrcId === id;
                const isOver = dragOverId === id && dragSrcId !== id;
                return (
                  <div
                    key={id}
                    data-btn-id={id}
                    draggable={isEditMode}
                    className={[
                      "relative",
                      isEditMode && id !== "__empty__" ? "dash-edit-wiggle" : "",
                      isDragging ? "dash-dragging" : "",
                      isOver ? "dash-drag-over" : "",
                    ].filter(Boolean).join(" ")}
                    onMouseDown={() => {
                      cancelLongPress();
                      if (!isEditMode) {
                        longPressTimer.current = setTimeout(() => setIsEditMode(true), 500);
                      }
                    }}
                    onMouseUp={cancelLongPress}
                    onMouseLeave={cancelLongPress}
                    onTouchStart={(e) => {
                      cancelLongPress();
                      if (!isEditMode) {
                        longPressTimer.current = setTimeout(() => {
                          setIsEditMode(true);
                          touchDragIdRef.current = id;
                          setDragSrcId(id);
                        }, 500);
                      } else {
                        touchDragIdRef.current = id;
                        setDragSrcId(id);
                      }
                    }}
                    onTouchMove={(e) => {
                      cancelLongPress();
                      if (!isEditMode || !touchDragIdRef.current) return;
                      e.preventDefault();
                      const touch = e.touches[0];
                      const el = document.elementFromPoint(touch.clientX, touch.clientY);
                      const btnEl = el?.closest?.("[data-btn-id]") as HTMLElement | null;
                      const hoverId = btnEl?.dataset?.btnId ?? null;
                      // Juste le feedback visuel — le swap se fait au touchEnd
                      if (hoverId && hoverId !== touchDragIdRef.current) {
                        setDragOverId(hoverId);
                      }
                    }}
                    onTouchEnd={(e) => {
                      cancelLongPress();
                      // Reorder uniquement au relâchement (une seule fois, propre)
                      if (touchDragIdRef.current && dragOverId && touchDragIdRef.current !== dragOverId) {
                        reorderDash(touchDragIdRef.current, dragOverId);
                      }
                      touchDragIdRef.current = null;
                      setDragSrcId(null);
                      setDragOverId(null);
                    }}
                    onDragStart={(e) => {
                      setDragSrcId(id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      if (dragOverId !== id) setDragOverId(id);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragSrcId && dragSrcId !== id) reorderDash(dragSrcId, id);
                      setDragSrcId(null);
                      setDragOverId(null);
                    }}
                    onDragEnd={() => {
                      setDragSrcId(null);
                      setDragOverId(null);
                    }}
                  >
                    {id === "__empty__" ? (
                      isEditMode ? (
                        <div className={`w-full h-full min-h-[80px] sm:min-h-[100px] rounded-2xl border-2 border-dashed flex flex-col items-center justify-center transition-all ${dragOverId === "__empty__" ? "border-blue-400 bg-blue-50/50 dark:bg-blue-900/20" : "border-gray-300/60 dark:border-gray-600/40 bg-gray-50/30 dark:bg-gray-800/10"}`}>
                          <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium select-none">Déposer ici</span>
                        </div>
                      ) : null
                    ) : renderCard(id)}
                    {/* Icône réorganisation en mode édition (pas sur la case vide) */}
                    {isEditMode && id !== "__empty__" && (
                      <span className="absolute top-1.5 right-1.5 z-20 text-gray-400/70 dark:text-gray-500/70 text-[14px] leading-none pointer-events-none select-none">⠿</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* RDV buttons — thèmes normaux uniquement (non-CMM) */}
      {!cmmMode && (
      <div
        className="overflow-hidden"
        style={{
          opacity: showSummaryPanel ? 0 : 1,
          maxHeight: showSummaryPanel ? 0 : 9999,
          transition: "opacity 180ms ease, max-height 260ms ease",
          pointerEvents: showSummaryPanel ? "none" : undefined,
        }}
      >
      <div className="grid grid-cols-2 gap-3">
        {(() => {
          const rdvAFixerStatuses = ["Livraison partielle", "Cabine à aller chercher", "Récéptionné - RDV à fixer", "Montage partiel"];
          const mesuresAFixerStatuses = ["Pas contacté", "Contact sans réponse"];
          const savAFixerStatuses = ["A contacter", "Contact sans réponse", "Attente news", "En cours de traitement"];
          const rdvAFixerProjects = projects.filter((p) =>
            rdvAFixerStatuses.includes(p.etatCMD) ||
            (p.etatCMD === "En attente de mesures" && mesuresAFixerStatuses.includes(p.etatMesures)) ||
            ((p as any)._source === "sav" && savAFixerStatuses.includes(p.etatSAV))
          );
          const montagesRdvCab = rdvAFixerProjects.filter((p) => { const src = (p as any)._source; return src === "cmd" || src === "montage" || !src; }).reduce((s, p) => s + (p.nbCabines || 0), 0);
          const mesuresRdvCab = rdvAFixerProjects.filter((p) => (p as any)._source === "mesures").reduce((s, p) => s + (p.nbCabines || 0), 0);
          const servicesRdvCab = rdvAFixerProjects.filter((p) => (p as any)._source === "services").reduce((s, p) => s + (p.nbCabines || 0), 0);
          const savRdvCab = rdvAFixerProjects.filter((p) => (p as any)._source === "sav").reduce((s, p) => s + (p.nbCabines || 0), 0);
          return (
            <button onClick={(e) => openPanel("rdv-a-fixer", e)} className="glass-card rounded-2xl p-4 text-center hover:shadow-lg active:scale-95 transition-all">
              <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{rdvAFixerProjects.length}</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">RDV à fixer</p>
              <div className="text-center mt-1.5 space-y-0.5">
                {montagesRdvCab > 0 && <p className="text-[9px] text-gray-400 dark:text-gray-500">Montages: {montagesRdvCab} cab.</p>}
                {mesuresRdvCab > 0 && <p className="text-[9px] text-gray-400 dark:text-gray-500">Mesures: {mesuresRdvCab} cab.</p>}
                {servicesRdvCab > 0 && <p className="text-[9px] text-gray-400 dark:text-gray-500">Services: {servicesRdvCab} cab.</p>}
                {savRdvCab > 0 && <p className="text-[9px] text-gray-400 dark:text-gray-500">SAV: {savRdvCab} cab.</p>}
              </div>
            </button>
          );
        })()}
        {(() => {
          const rdvFixeProjects = projects.filter((p) => p.etatCMD === "RDV - fixé" || p.etatMesures === "RDV - Fixé");
          const montagesFixeCab = rdvFixeProjects.filter((p) => { const src = (p as any)._source; return src === "cmd" || src === "montage" || !src; }).reduce((s, p) => s + (p.nbCabines || 0), 0);
          const mesuresFixeCab = rdvFixeProjects.filter((p) => (p as any)._source === "mesures").reduce((s, p) => s + (p.nbCabines || 0), 0);
          const servicesFixeCab = rdvFixeProjects.filter((p) => (p as any)._source === "services" || (p as any)._source === "sav").reduce((s, p) => s + (p.nbCabines || 0), 0);
          return (
            <button onClick={(e) => openPanel("rdv-fixe", e)} className="glass-card rounded-2xl p-4 text-center hover:shadow-lg active:scale-95 transition-all">
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">{rdvFixeProjects.length}</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">RDV fixé</p>
              <div className="text-center mt-1.5 space-y-0.5">
                {montagesFixeCab > 0 && <p className="text-[9px] text-gray-400 dark:text-gray-500">Montages: {montagesFixeCab} cab.</p>}
                {mesuresFixeCab > 0 && <p className="text-[9px] text-gray-400 dark:text-gray-500">Mesures: {mesuresFixeCab} cab.</p>}
                {servicesFixeCab > 0 && <p className="text-[9px] text-gray-400 dark:text-gray-500">Services: {servicesFixeCab} cab.</p>}
              </div>
            </button>
          );
        })()}
      </div>
      </div>
      )}

      {/* ── Widgets configurables CleanMyMac ─────────────────────────────────
          Uniquement visibles en cmmMode. L'utilisateur choisit quels widgets
          afficher via un panneau ⚙ — sélection persistée dans localStorage. */}
      {cmmMode && (() => {
        const WIDGET_LABELS: Record<string, string> = {
          "mesures-today":       "Mesures aujourd'hui",
          "today":               "Montages aujourd'hui",
          "services-today":      "Services aujourd'hui",
          "sav-today":           "SAV aujourd'hui",
          "week":                "Cabines cette semaine",
          "active":              "Monteurs actifs",
          "emplacement-cabines": "Emplacement cabines",
          "rapports-attente":    "Rapports en attente",
          "sav-non-traites":     "SAV non traités",
          "soucis-en-cours":     "Soucis en cours",
          "dossiers-en-cours":   "Projets en cours",
          "a-facturer":          "À facturer",
          "calendrier":          "Calendrier",
          "archives":            "Archives",
          "arrivage":            "Arrivage cabines",
          "sav-historique":      "Historique SAV",
          "soucis-historique":   "Historique soucis",
          "mesures-sans-commande": "Mesures non commandées",
        };
        const ALL_WIDGET_IDS = DEFAULT_DASH_ORDER.filter(id => id !== "__empty__");

        const toggleWidget = (id: string) => {
          const next = cmmWidgets.includes(id)
            ? cmmWidgets.filter(w => w !== id)
            : [...cmmWidgets, id];
          setCmmWidgets(next);
          try { localStorage.setItem(`tm-cmm-widgets-${userName}`, JSON.stringify(next)); } catch {}
        };

        return (
          <div className="space-y-2">
            {/* En-tête widgets avec bouton config */}
            <div className="flex items-center justify-between px-1">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-white/30">
                Widgets
              </p>
              <button
                onClick={() => setCmmConfigOpen(v => !v)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
                  cmmConfigOpen
                    ? "bg-violet-500/30 text-violet-300 ring-1 ring-violet-500/40"
                    : "bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60"
                }`}
                title="Configurer les widgets"
              >
                <Settings className="w-3 h-3" />
                Configurer
              </button>
            </div>

            {/* Panneau de configuration */}
            {cmmConfigOpen && (
              <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-3 space-y-1">
                <p className="text-[10px] text-white/40 mb-2 px-1">
                  Sélectionnez les widgets à afficher sur votre accueil
                </p>
                <div className="grid grid-cols-2 gap-1">
                  {ALL_WIDGET_IDS.map(id => {
                    const active = cmmWidgets.includes(id);
                    return (
                      <button
                        key={id}
                        onClick={() => toggleWidget(id)}
                        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-[11px] font-medium transition-all text-left ${
                          active
                            ? "bg-violet-500/25 text-violet-200 ring-1 ring-violet-500/30"
                            : "bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60"
                        }`}
                      >
                        <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center flex-shrink-0 transition-colors ${
                          active ? "bg-violet-500 border-violet-400" : "border-white/20"
                        }`}>
                          {active && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </span>
                        <span className="line-clamp-1">{WIDGET_LABELS[id] || id}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Grille de widgets actifs */}
            {cmmWidgets.length > 0 && (
              <div className={`grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-3`}>
                {cmmWidgets.map(id => (
                  <div key={id} className="relative">
                    {renderCard(id)}
                  </div>
                ))}
              </div>
            )}

            {/* Placeholder si aucun widget sélectionné */}
            {cmmWidgets.length === 0 && !cmmConfigOpen && (
              <div className="flex flex-col items-center justify-center py-8 gap-2 text-white/20">
                <Settings className="w-8 h-8" />
                <p className="text-xs text-center">
                  Appuyez sur <span className="font-semibold text-white/30">Configurer</span> pour ajouter des widgets
                </p>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── En-tête panneau actif ─────────────────────────────────────────── */}
      {/* Apparaît quand un panneau est ouvert : bouton compact "retour" + label */}
      {showSummaryPanel && (() => {
        const panelMeta: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
          "mesures-today":        { label: "Mesures aujourd'hui",    color: "text-cyan-600 dark:text-cyan-400",     bg: "bg-cyan-100/80 dark:bg-cyan-900/30",     icon: <Ruler className="w-4 h-4 text-cyan-500 dark:text-cyan-400" /> },
          "today":                { label: "Montages aujourd'hui",   color: "text-blue-600 dark:text-blue-400",     bg: "bg-blue-100/80 dark:bg-blue-900/30",     icon: <Wrench className="w-4 h-4 text-blue-500 dark:text-blue-400" /> },
          "services-today":       { label: "Services aujourd'hui",   color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-100/80 dark:bg-violet-900/30", icon: <Settings className="w-4 h-4 text-violet-500 dark:text-violet-400" /> },
          "sav-today":            { label: "SAV aujourd'hui",        color: "text-red-600 dark:text-red-400",       bg: "bg-red-100/80 dark:bg-red-900/30",       icon: <AlertTriangle className="w-4 h-4 text-red-500 dark:text-red-400" /> },
          "week":                 { label: "Cabines cette semaine",  color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-100/80 dark:bg-emerald-900/30", icon: <Box className="w-4 h-4 text-emerald-500 dark:text-emerald-400" /> },
          "active":               { label: "Monteurs actifs",        color: "text-amber-600 dark:text-amber-400",   bg: "bg-amber-100/80 dark:bg-amber-900/30",   icon: <Users className="w-4 h-4 text-amber-500 dark:text-amber-400" /> },
          "emplacement-cabines":  { label: "Emplacement cabines",    color: "text-sky-600 dark:text-sky-400",       bg: "bg-sky-100/80 dark:bg-sky-900/30",       icon: <MapPin className="w-4 h-4 text-sky-500 dark:text-sky-400" /> },
          "rapports-attente":     { label: "Rapports en attente",    color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-100/80 dark:bg-orange-900/30", icon: <Clock className="w-4 h-4 text-orange-500 dark:text-orange-400" /> },
          "sav-non-traites":      { label: "SAV non traités",        color: "text-rose-600 dark:text-rose-400",     bg: "bg-rose-100/80 dark:bg-rose-900/30",     icon: <ShieldAlert className="w-4 h-4 text-rose-500 dark:text-rose-400" /> },
          "soucis-en-cours":      { label: "Soucis en cours",        color: "text-red-700 dark:text-red-400",       bg: "bg-red-100/80 dark:bg-red-900/30",       icon: <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" /> },
          "dossiers-en-cours":    { label: "Projets en cours",       color: "text-indigo-600 dark:text-indigo-400", bg: "bg-indigo-100/80 dark:bg-indigo-900/30", icon: <FolderOpen className="w-4 h-4 text-indigo-500 dark:text-indigo-400" /> },
          "a-facturer":           { label: "À facturer",             color: "text-yellow-600 dark:text-yellow-400", bg: "bg-yellow-100/80 dark:bg-yellow-900/30", icon: <Receipt className="w-4 h-4 text-yellow-600 dark:text-yellow-400" /> },
          "calendrier":           { label: "Calendrier",             color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-100/80 dark:bg-violet-900/30", icon: <CalendarDays className="w-4 h-4 text-violet-500 dark:text-violet-400" /> },
          "sav-historique":       { label: "SAV — Tous",             color: "text-red-600 dark:text-red-400",       bg: "bg-red-100/80 dark:bg-red-900/30",       icon: <ShieldAlert className="w-4 h-4 text-red-500 dark:text-red-400" /> },
          "soucis-historique":    { label: "Soucis montage — Tous",  color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-100/80 dark:bg-orange-900/30", icon: <AlertTriangle className="w-4 h-4 text-orange-500 dark:text-orange-400" /> },
          "mesures-sans-commande":{ label: "Mesures non commandées", color: "text-cyan-600 dark:text-cyan-400",     bg: "bg-cyan-100/80 dark:bg-cyan-900/30",     icon: <Ruler className="w-4 h-4 text-cyan-500 dark:text-cyan-400" /> },
          "arrivage":             { label: "Arrivage cabines",       color: "text-sky-600 dark:text-sky-400",       bg: "bg-sky-100/80 dark:bg-sky-900/30",       icon: <Truck className="w-4 h-4 text-sky-600 dark:text-sky-400" /> },
          "rdv-a-fixer":          { label: "RDV à fixer",            color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-100/80 dark:bg-orange-900/30", icon: <Calendar className="w-4 h-4 text-orange-500 dark:text-orange-400" /> },
          "rdv-fixe":             { label: "RDV fixé",               color: "text-green-600 dark:text-green-400",   bg: "bg-green-100/80 dark:bg-green-900/30",   icon: <Calendar className="w-4 h-4 text-green-500 dark:text-green-400" /> },
        };
        const meta = panelMeta[showSummaryPanel];
        if (!meta) return null;
        return (
          <button
            ref={headerButtonRef}
            onClick={closePanel}
            onTouchStart={(e) => { swipeTouchStartY.current = e.touches[0].clientY; }}
            onTouchEnd={(e) => {
              const dy = e.changedTouches[0].clientY - swipeTouchStartY.current;
              if (dy > 60) closePanel();
            }}
            className="w-full glass-card rounded-2xl px-4 py-3 flex items-center gap-3 hover:shadow-md active:scale-[0.99] transition-all animate-in fade-in duration-200"
          >
            <ChevronLeft className="w-5 h-5 text-gray-400 dark:text-gray-500 shrink-0" />
            <span className={`w-8 h-8 rounded-xl ${meta.bg} flex items-center justify-center shrink-0`}>
              {meta.icon}
            </span>
            <span className={`text-sm font-semibold ${meta.color} flex-1 text-left truncate`}>{meta.label}</span>
            <X className="w-4 h-4 text-gray-300 dark:text-gray-600 shrink-0" />
          </button>
        );
      })()}

      {/* Summary panel */}
      {showSummaryPanel && (() => {
        /* ── CALENDRIER ───────────────────────────────────────────── */
        if (showSummaryPanel === "calendrier") {
          const todayStr2 = getTodayStr();
          const allCalProjects = [...projects, ...terminatedProjects]
            .filter((p, i, arr) => arr.findIndex(x => x.id === p.id) === i)
            .filter(p => p.dateMontage || p.dateMesures);

          // Build day map for the displayed month (± 1 month buffer)
          const { year, month } = calendarMonth;
          const firstOfMonth = new Date(year, month, 1);
          const lastOfMonth = new Date(year, month + 1, 0);
          const dayMap: Record<string, Project[]> = {};
          for (const p of allCalProjects) {
            const startRaw = (p.dateMontage || p.dateMesures || "").split("T")[0];
            if (!startRaw) continue;
            const endRaw = (p.dateMontageEnd || "").split("T")[0];
            const days = endRaw && endRaw > startRaw ? getWorkingDays(startRaw, endRaw) : [startRaw];
            for (const d of days) {
              if (d < firstOfMonth.toISOString().split("T")[0] || d > lastOfMonth.toISOString().split("T")[0]) continue;
              if (!dayMap[d]) dayMap[d] = [];
              dayMap[d].push(p);
            }
          }

          // Grid: Mon=0 … Sun=6
          const firstDayWeekday = (firstOfMonth.getDay() + 6) % 7; // shift Sun=0→6
          const daysInMonth = lastOfMonth.getDate();
          const totalCells = Math.ceil((firstDayWeekday + daysInMonth) / 7) * 7;
          const cells: (number | null)[] = [
            ...Array(firstDayWeekday).fill(null),
            ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
            ...Array(totalCells - firstDayWeekday - daysInMonth).fill(null),
          ];

          const monthLabel = firstOfMonth.toLocaleDateString("fr-CH", { month: "long", year: "numeric" });
          const DAY_HEADERS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

          return (
            <div className="glass-card rounded-2xl p-4 space-y-4">
              {/* Header navigation */}
              <div className="flex items-center justify-between gap-2">
                <button onClick={() => { setCalendarMonth(m => { const d = new Date(m.year, m.month - 1, 1); return { year: d.getFullYear(), month: d.getMonth() }; }); setCalendarSelectedDay(null); }} className="w-8 h-8 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 flex items-center justify-center transition-colors shrink-0">
                  <ChevronLeft className="w-4 h-4 text-gray-500" />
                </button>
                <div className="flex items-center gap-2 flex-1 justify-center">
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 capitalize">{monthLabel}</p>
                  <input
                    type="month"
                    value={`${year}-${String(month + 1).padStart(2, "0")}`}
                    onChange={(e) => {
                      const [y, mo] = e.target.value.split("-").map(Number);
                      if (y && mo) { setCalendarMonth({ year: y, month: mo - 1 }); setCalendarSelectedDay(null); }
                    }}
                    className="text-[10px] text-gray-500 dark:text-gray-400 bg-transparent border-none outline-none cursor-pointer w-5 opacity-50 hover:opacity-100 transition-opacity"
                    title="Aller à un mois"
                  />
                </div>
                <button onClick={() => { setCalendarMonth(m => { const d = new Date(m.year, m.month + 1, 1); return { year: d.getFullYear(), month: d.getMonth() }; }); setCalendarSelectedDay(null); }} className="w-8 h-8 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 flex items-center justify-center transition-colors shrink-0">
                  <ChevronRight className="w-4 h-4 text-gray-500" />
                </button>
              </div>

              {/* Day headers */}
              <div className="grid grid-cols-7 gap-1.5">
                {DAY_HEADERS.map(d => (
                  <div key={d} className="text-center text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase py-1.5">{d}</div>
                ))}
              </div>

              {/* Calendar grid */}
              <div className="grid grid-cols-7 gap-1.5">
                {cells.map((day, idx) => {
                  if (!day) return <div key={`empty-${idx}`} className="min-h-[64px]" />;
                  const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                  const dayProjects = dayMap[dateStr] || [];
                  const isToday = dateStr === todayStr2;
                  const isPast = dateStr < todayStr2;
                  const isSelected = calendarSelectedDay === dateStr;
                  const hasProjects = dayProjects.length > 0;

                  // Unique collaborators
                  const collabsOnDay = Array.from(new Set(
                    dayProjects.flatMap(p => {
                      const src = getProjectSource(p);
                      const field = src === "mesures" ? (p.mesuresTraiteePar || p.collaborateurs || "") : (p.collaborateurs || "");
                      return field.split(/[\s&,]+/).map(s => s.trim()).filter(Boolean);
                    })
                  ));

                  return (
                    <button
                      key={dateStr}
                      onClick={() => hasProjects ? setCalendarSelectedDay(isSelected ? null : dateStr) : undefined}
                      className={[
                        "relative flex flex-col items-start justify-start p-2 min-h-[64px] rounded-2xl transition-all text-left",
                        hasProjects ? "cursor-pointer hover:scale-[1.03] active:scale-95 shadow-sm" : "cursor-default",
                        isToday ? "bg-violet-100 dark:bg-violet-900/40 ring-2 ring-violet-400" : "",
                        isSelected ? "bg-violet-200 dark:bg-violet-800/50 ring-2 ring-violet-500 shadow-lg" : "",
                        !isToday && !isSelected && hasProjects ? "bg-white/80 dark:bg-white/8 hover:bg-violet-50 dark:hover:bg-violet-900/20" : "",
                        !isToday && !isSelected && !hasProjects ? "bg-white/30 dark:bg-white/3" : "",
                        isPast && !isToday ? "opacity-50" : "",
                      ].join(" ")}
                    >
                      {/* Day number */}
                      <span className={`text-sm font-bold leading-none mb-1.5 ${isToday ? "text-violet-700 dark:text-violet-300" : hasProjects ? "text-gray-800 dark:text-gray-100" : "text-gray-400 dark:text-gray-600"}`}>{day}</span>

                      {/* Collaborator avatars */}
                      {collabsOnDay.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {collabsOnDay.slice(0, 4).map(n => (
                            <span key={n} className="w-5 h-5 rounded-full text-[7px] font-bold flex items-center justify-center border-2 border-white dark:border-gray-800 shadow-sm"
                              style={{ backgroundColor: getCollaboratorColor(n).bg, color: getCollaboratorColor(n).text }}>
                              {getCollaboratorInitials(n).charAt(0)}
                            </span>
                          ))}
                          {collabsOnDay.length > 4 && (
                            <span className="w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-600 text-[7px] text-gray-500 dark:text-gray-300 font-bold flex items-center justify-center border-2 border-white dark:border-gray-800">
                              +{collabsOnDay.length - 4}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Project count badge */}
                      {hasProjects && (
                        <span className={`absolute top-1.5 right-1.5 text-[9px] font-bold px-1 py-0.5 rounded-full leading-none ${isSelected ? "bg-violet-500 text-white" : isToday ? "bg-violet-400 text-white" : "bg-violet-100 text-violet-600 dark:bg-violet-900/50 dark:text-violet-300"}`}>
                          {dayProjects.length}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="flex flex-wrap gap-2 pt-1 border-t border-gray-100 dark:border-gray-700">
                {collabData.filter(c => c.myProjects.length > 0).map(c => (
                  <div key={c.name} className="flex items-center gap-1">
                    <span className="w-4 h-4 rounded-full text-[7px] font-bold flex items-center justify-center"
                      style={{ backgroundColor: c.colors.bg, color: c.colors.text }}>
                      {getCollaboratorInitials(c.name).charAt(0)}
                    </span>
                    <span className="text-[9px] text-gray-500 dark:text-gray-400">{c.name.split(" ")[0]}</span>
                  </div>
                ))}
              </div>

              {/* Selected day detail */}
              {calendarSelectedDay && dayMap[calendarSelectedDay] && (
                <div className="space-y-2 border-t border-gray-100 dark:border-gray-700 pt-3">
                  <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {new Date(calendarSelectedDay + "T12:00:00").toLocaleDateString("fr-CH", { weekday: "long", day: "numeric", month: "long" })}
                    <span className="ml-2 text-violet-500">· {dayMap[calendarSelectedDay].length} intervention{dayMap[calendarSelectedDay].length > 1 ? "s" : ""}</span>
                  </p>
                  <div className="space-y-1.5">
                    {dayMap[calendarSelectedDay].map(p => {
                      const src = getProjectSource(p);
                      const isMesure = src === "mesures";
                      const collabField = isMesure ? (p.mesuresTraiteePar || p.collaborateurs || "") : (p.collaborateurs || "");
                      const names = collabField.split(/[\s&]+/).map(n => n.trim()).filter(Boolean);
                      const logo = getClientLogo(p.projet);
                      return (
                        <Link key={p.id} href={`/projet/${p.id}?mode=dashboard`}
                          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/60 dark:bg-white/5 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors">
                          <div className="flex -space-x-1 shrink-0">
                            {names.slice(0, 3).map(n => (
                              <span key={n} className="w-6 h-6 rounded-full text-[8px] font-bold flex items-center justify-center border border-white dark:border-gray-800"
                                style={{ backgroundColor: getCollaboratorColor(n).bg, color: getCollaboratorColor(n).text }}>
                                {getCollaboratorInitials(n)}
                              </span>
                            ))}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1 mb-0.5">
                              {p.ofrTM && <span className="text-[9px] font-mono text-gray-400">{p.ofrTM}</span>}
                              <span className={`text-[8px] font-semibold px-1.5 py-0.5 rounded-full ${isMesure ? "bg-cyan-100 text-cyan-700" : "bg-orange-100 text-orange-700"}`}>{isMesure ? "Mesures" : "Montages"}</span>
                            </div>
                            <p className="text-xs text-gray-900 dark:text-gray-100 line-clamp-3 sm:line-clamp-1">{p.projet}</p>
                          </div>
                          {logo && <LogoImg src={logo} />}
                          <Badge variant="outline" className="text-[10px] shrink-0">{p.nbCabines || 0} cab.</Badge>
                          <ChevronRight className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        }
        /* ── FIN CALENDRIER ───────────────────────────────────────── */

        let panelProjects: Project[] = [];
        let panelTitle = "";

        if (showSummaryPanel === "today") {
          panelTitle = "Montages aujourd'hui";
          panelProjects = collabData
            .flatMap((c) => c.todayProjects)
            .filter((p, i, arr) => arr.findIndex((x) => x.id === p.id) === i)
            .filter((p) => {
              const src = (p as any)._source || "montage";
              // Exclure les mesures et les SAV — ils ont leurs propres boutons
              return src !== "mesures" && src !== "sav";
            });
        } else if (showSummaryPanel === "week") {
          panelTitle = "RDV à venir";
          panelProjects = allFutureProjects;
        } else if (showSummaryPanel === "active") {
          return (
            <div className="space-y-3">
              {/* Per-collaborator planning */}
              {collabData.map((collab) => {
                if (collab.myProjects.length === 0) return null;
                const isExpanded = expandedCollabs[collab.name] ?? false;
                return (
                  <div key={collab.name} className="glass-card rounded-2xl overflow-hidden">
                    <button onClick={() => toggleCollab(collab.name)} className="w-full flex items-center gap-3 p-4 hover:bg-white/40 dark:hover:bg-white/5 transition-colors">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0" style={{ backgroundColor: collab.colors.bg, color: collab.colors.text }}>
                        {getCollaboratorInitials(collab.name)}
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <p className="font-semibold text-gray-900 dark:text-gray-100">{collab.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {collab.todayProjects.length > 0 ? `${collab.todayProjects.length} montage${collab.todayProjects.length > 1 ? "s" : ""} aujourd'hui` : "Aucun montage aujourd'hui"}
                          {collab.cabinesSummary ? ` · ${collab.cabinesSummary}` : ""}
                        </p>
                      </div>
                      {(() => {
                        const collabLower = collab.name.toLowerCase();
                        const lastSeen = Object.entries(userActivities).find(([name]) => {
                          const nameLower = name.toLowerCase();
                          const nameFirst = nameLower.split(" ")[0];
                          return nameLower.includes(collabLower) || collabLower.includes(nameFirst) || nameFirst === collabLower;
                        })?.[1];
                        if (!lastSeen) return <span className="text-[9px] text-gray-300 dark:text-gray-600 shrink-0 text-right">Jamais<br/>connecté</span>;
                        const d = new Date(lastSeen);
                        const diff = Date.now() - d.getTime();
                        const isRecent = diff < 3600000;
                        const isToday = d.toDateString() === new Date().toDateString();
                        const palette = isRecent ? "bg-emerald-100/70 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" : isToday ? "bg-blue-100/70 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" : "bg-gray-100 text-gray-500 dark:bg-slate-700/40 dark:text-slate-400";
                        return <div className={`text-[9px] shrink-0 text-right px-1.5 py-1 rounded-lg mr-2 ${palette}`}><p className="font-medium">{d.toLocaleDateString("fr-CH", { day: "2-digit", month: "short" })}</p><p>{d.toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" })}</p></div>;
                      })()}
                      {collab.todayProjects.length > 0 && <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse shrink-0" />}
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
                    </button>
                    {isExpanded && (
                      <div className="px-4 pb-4 space-y-3">
                        {collab.todayProjects.length > 0 && (
                          <div>
                            <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1"><Calendar className="w-3 h-3" />Aujourd'hui ({collab.todayProjects.length})</p>
                            <div className="space-y-1.5">{collab.todayProjects.map((p) => <ProjectRow key={p.id} project={p} colors={collab.colors} />)}</div>
                            <div className="mt-2"><DailyRouteButton projects={collab.todayProjects} /></div>
                          </div>
                        )}
                        {collab.thisWeekProjects.length > 0 && (
                          <div>
                            <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1"><Clock className="w-3 h-3" />Cette semaine ({collab.thisWeekProjects.length})</p>
                            <div className="space-y-1.5">{collab.thisWeekProjects.map((p) => <WeekProjectRow key={p.id} project={p} />)}</div>
                          </div>
                        )}
                        {collab.nextWeekProjects.length > 0 && (
                          <div>
                            <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1"><Calendar className="w-3 h-3" />Semaine prochaine ({collab.nextWeekProjects.length})</p>
                            <div className="space-y-1.5">{collab.nextWeekProjects.map((p) => <WeekProjectRow key={p.id} project={p} />)}</div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {/* Binômes & Teams */}
              {binomeData.length > 0 && (
                <>
                  <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mt-2"><Users className="w-3.5 h-3.5" />Binômes & Teams</p>
                  {binomeData.map((team) => {
                    const isExpanded = expandedCollabs[`team-${team.teamName}`] ?? false;
                    return (
                      <div key={team.teamName} className="glass-card rounded-2xl overflow-hidden">
                        <button onClick={() => toggleCollab(`team-${team.teamName}`)} className="w-full flex items-center gap-3 p-4 hover:bg-white/40 dark:hover:bg-white/5 transition-colors">
                          <div className="flex -space-x-2 shrink-0">
                            {team.names.map((n) => (
                              <div key={n} className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold border-2 border-white dark:border-gray-800" style={{ backgroundColor: getCollaboratorColor(n).bg, color: getCollaboratorColor(n).text }}>{getCollaboratorInitials(n)}</div>
                            ))}
                          </div>
                          <div className="flex-1 min-w-0 text-left">
                            <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{team.names.join(" & ")}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{team.todayProjects.length > 0 ? `${team.todayProjects.length} montage${team.todayProjects.length > 1 ? "s" : ""} aujourd'hui` : "Pas de montage aujourd'hui"}{" · "}{team.totalCabines} cab.</p>
                          </div>
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${team.isTeam ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>{team.isTeam ? "Team" : team.names.length === 2 ? "Binôme" : team.names.length === 3 ? "Trio" : "Équipe"}</span>
                          {team.todayProjects.length > 0 && <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse shrink-0" />}
                          {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
                        </button>
                        {isExpanded && (
                          <div className="px-4 pb-4 space-y-3">
                            {team.todayProjects.length > 0 && <div><p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1"><Calendar className="w-3 h-3" />Aujourd'hui ({team.todayProjects.length})</p><div className="space-y-1.5">{team.todayProjects.map((p) => <ProjectRow key={p.id} project={p} colors={getCollaboratorColor(team.names[0])} />)}</div></div>}
                            {team.thisWeekProjects.length > 0 && <div><p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1"><Clock className="w-3 h-3" />Cette semaine ({team.thisWeekProjects.length})</p><div className="space-y-1.5">{team.thisWeekProjects.map((p) => <WeekProjectRow key={p.id} project={p} />)}</div></div>}
                            {team.nextWeekProjects.length > 0 && <div><p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1"><Calendar className="w-3 h-3" />Semaine prochaine ({team.nextWeekProjects.length})</p><div className="space-y-1.5">{team.nextWeekProjects.map((p) => <WeekProjectRow key={p.id} project={p} />)}</div></div>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              )}

              {/* Heures de travail */}
              {(() => {
                const allProjects = [...projects, ...terminatedProjects];
                const { fromStr, toStr, label } = getDateRangeForFilter(workFilter, workFrom, workTo, workMonth, workYear);
                const soloData = COLLABORATEURS_LIST.map((name) => ({
                  name, colors: getCollaboratorColor(name),
                  minutes: getIndividualHoursForCollab(allProjects, name, fromStr, toStr),
                })).filter((c) => c.minutes > 0);
                const groupMap = new Map<string, number>();
                for (const p of allProjects) {
                  const collab = (p.collaborateurs || "").trim();
                  if (!collab || (!collab.includes("&") && !collab.toLowerCase().includes("team"))) continue;
                  const ha = p.heureArrivee || ""; const hd = p.heureDepart || "";
                  if (!ha && !hd) continue;
                  let mins = 0;
                  if (ha.includes("|") || hd.includes("|")) {
                    const arrParts = ha.split("|").map((s: string) => s.trim()).filter(Boolean);
                    const depParts = hd.split("|").map((s: string) => s.trim()).filter(Boolean);
                    for (let i = 0; i < Math.max(arrParts.length, depParts.length); i++) {
                      const aPart = arrParts[i] || ""; const dPart = depParts[i] || "";
                      if (isNamedEntry(aPart) || isNamedEntry(dPart)) continue;
                      const aTime = extractHHMM(aPart) || aPart.split(/\s+/).at(-1) || "";
                      const dTime = extractHHMM(dPart) || dPart.split(/\s+/).at(-1) || "";
                      const entryDate = p.dateMontage?.split("T")[0] || "";
                      if (fromStr && entryDate < fromStr) continue;
                      if (toStr && entryDate > toStr) continue;
                      const a = parseTimeToMinutes(aTime); const d = parseTimeToMinutes(dTime);
                      if (a >= 0 && d >= 0 && d > a) mins += d - a;
                    }
                  } else {
                    const dateStr = p.dateMontage?.split("T")[0] || "";
                    if (fromStr && dateStr < fromStr) continue;
                    if (toStr && dateStr > toStr) continue;
                    const a = parseTimeToMinutes(extractHHMM(ha) || ha);
                    const d = parseTimeToMinutes(extractHHMM(hd) || hd);
                    if (a >= 0 && d >= 0 && d > a) mins += d - a;
                  }
                  if (mins > 0) groupMap.set(collab, (groupMap.get(collab) || 0) + mins);
                }
                const groupData = Array.from(groupMap.entries()).sort((a, b) => b[1] - a[1]);
                const hasData = soloData.length > 0 || groupData.length > 0;
                const currentYear = new Date().getFullYear();
                const years = Array.from({ length: 4 }, (_, i) => currentYear - i);
                return (
                  <div className="glass-card rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1"><Clock className="w-3 h-3" />Heures de travail</p>
                      {terminatedLoading && <span className="text-[10px] text-gray-400 animate-pulse">Chargement...</span>}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(["semaine", "mois", "annee", "custom"] as const).map((f) => (
                        <button key={f} onClick={() => setWorkFilter(f)} className={`text-[10px] font-medium px-2.5 py-1 rounded-full border transition-colors ${workFilter === f ? "bg-blue-600 text-white border-blue-600" : "border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-blue-300"}`}>
                          {f === "semaine" ? "Semaine" : f === "mois" ? "Mois" : f === "annee" ? "Année" : "Plage"}
                        </button>
                      ))}
                    </div>
                    {workFilter === "mois" && <input type="month" value={workMonth} onChange={(e) => setWorkMonth(e.target.value)} className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 px-2.5 py-1.5" />}
                    {workFilter === "annee" && <div className="flex flex-wrap gap-1.5">{years.map((y) => <button key={y} onClick={() => setWorkYear(String(y))} className={`text-xs px-3 py-1 rounded-full border transition-colors ${workYear === String(y) ? "bg-blue-600 text-white border-blue-600" : "border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-blue-300"}`}>{y}</button>)}</div>}
                    {workFilter === "custom" && <div className="grid grid-cols-2 gap-2"><div><p className="text-[10px] text-gray-400 mb-0.5">Du</p><input type="date" value={workFrom} onChange={(e) => setWorkFrom(e.target.value)} className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 px-2 py-1.5" /></div><div><p className="text-[10px] text-gray-400 mb-0.5">Au</p><input type="date" value={workTo} onChange={(e) => setWorkTo(e.target.value)} className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 px-2 py-1.5" /></div></div>}
                    <p className="text-[10px] text-gray-400 -mb-1">{label}</p>
                    {!hasData ? <p className="text-xs text-gray-400 text-center py-2">Aucune heure enregistrée sur cette période</p> : (
                      <>
                        {soloData.length > 0 && (<><p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Individuel</p>{soloData.map((c) => <div key={c.name} className="flex items-center justify-between"><div className="flex items-center gap-2"><div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0" style={{ backgroundColor: c.colors.bg, color: c.colors.text }}>{getCollaboratorInitials(c.name)}</div><span className="text-sm text-gray-700 dark:text-gray-300">{c.name}</span></div><span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{fmtMin(c.minutes)}</span></div>)}</>)}
                        {groupData.length > 0 && (<><p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mt-1">Binômes & Équipes</p>{groupData.map(([name, mins]) => { const names = name.split("&").map((n: string) => n.trim()); return <div key={name} className="flex items-center justify-between"><div className="flex items-center gap-2"><div className="flex -space-x-1.5">{names.slice(0, 4).map((n: string) => { const c = getCollaboratorColor(n); return <div key={n} className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 border border-white dark:border-slate-800" style={{ backgroundColor: c.dot, color: "#fff" }}>{getCollaboratorInitials(n)}</div>; })}</div><span className="text-sm text-gray-700 dark:text-gray-300">{name}</span></div><span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{fmtMin(mins)}</span></div>; })}</>)}
                      </>
                    )}
                  </div>
                );
              })()}

              {/* Stats monteur */}
              <div className="glass-card rounded-2xl p-4 space-y-3">
                <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1">
                  <BarChart3 className="w-3 h-3" />Stats monteur
                </p>
                <select
                  value={selectedMonteurStats}
                  onChange={(e) => setSelectedMonteurStats(e.target.value)}
                  className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 px-3 py-1.5"
                >
                  <option value="">-- Choisir un monteur --</option>
                  {COLLABORATEURS_LIST.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
                {selectedMonteurStats && (
                  <PersonalStats
                    userName={selectedMonteurStats}
                    projects={[...projects.filter((p: any) => p._source === "montage" || !p._source), ...terminatedProjects]}
                  />
                )}
              </div>
            </div>
          );
        } else if (showSummaryPanel === "mesures-today") {
          panelTitle = "Mesures aujourd'hui";
          panelProjects = mesuresTodayProjects
            .sort((a, b) => ((a.dateMesures || "").split("T")[0]).localeCompare((b.dateMesures || "").split("T")[0]));
        } else if (showSummaryPanel === "sav-today") {
          panelTitle = "SAV aujourd'hui";
          panelProjects = savTodayProjects
            .sort((a, b) => (a.projet || "").localeCompare(b.projet || ""));
        } else if (showSummaryPanel === "services-today") {
          panelTitle = "Services aujourd'hui";
          panelProjects = servicesTodayProjects
            .sort((a, b) => (a.projet || "").localeCompare(b.projet || ""));
        } else if (showSummaryPanel === "emplacement-cabines") {
          panelTitle = "Emplacement cabines";
          panelProjects = emplacementCabinesProjects.sort((a, b) => {
            const ea = a.emplacementCabine || "";
            const eb = b.emplacementCabine || "";
            // "Dépôt TM" toujours en dernier
            if (ea === "Dépôt TM" && eb !== "Dépôt TM") return 1;
            if (ea !== "Dépôt TM" && eb === "Dépôt TM") return -1;
            return ea.localeCompare(eb);
          });
        } else if (showSummaryPanel === "rapports-attente") {
          /* ── RAPPORTS EN ATTENTE ─────────────────────────────── */
          return (
            <div className="glass-card rounded-2xl p-4 space-y-1.5">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                Rapports en attente ({rapportsAttenteProjects.length})
              </p>
              {rapportsAttenteProjects.length > 0 && (
                <div className="hidden sm:flex items-center gap-2 px-2 pb-1.5 text-[9px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                  <span className="w-20 shrink-0">Date montage</span>
                  <span className="w-20 shrink-0">N° OFR TM</span>
                  <span className="flex-1">Projet</span>
                  <span className="w-14 text-right">Cab.</span>
                </div>
              )}
              {rapportsAttenteProjects.length === 0 && (
                <p className="text-sm text-gray-400 py-2 text-center">Tous les rapports sont clôturés 🎉</p>
              )}
              {rapportsAttenteProjects.map((p, idx) => {
                const dateStr = (p.dateMontage || p.dateMesures || "").split("T")[0];
                const names = (p.collaborateurs || "").split(" & ").map((n: string) => n.trim()).filter(Boolean);
                const rowBg = idx % 2 === 0 ? "bg-orange-50/50 dark:bg-orange-950/20" : "bg-orange-100/40 dark:bg-orange-900/15";
                const logo = getClientLogo(p.projet);
                const isOld = dateStr && dateStr < todayStr;
                return (
                  <Link key={p.id} href={`/projet/${p.id}?mode=dashboard`}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-orange-200/60 dark:hover:bg-orange-800/30 transition-colors text-xs ${rowBg}`}>
                    <span className={`w-20 shrink-0 font-mono text-[10px] tabular-nums ${isOld ? "text-red-500 dark:text-red-400 font-semibold" : "text-gray-500 dark:text-gray-400"}`}>
                      {dateStr ? new Date(dateStr + "T12:00:00").toLocaleDateString("fr-CH", { day: "2-digit", month: "short", year: "2-digit" }) : "---"}
                    </span>
                    <span className="w-20 shrink-0 flex flex-col justify-center gap-px">
                      {parseTMNumbers(p.ofrTM || "").length > 0
                        ? parseTMNumbers(p.ofrTM || "").map((tm, i) => (
                            <span key={i} className="font-mono text-xs leading-tight text-gray-600 dark:text-gray-300 truncate">{tm}</span>
                          ))
                        : <span className="font-mono text-xs text-gray-400">---</span>
                      }
                    </span>
                    <span className="flex-1 min-w-0 text-xs text-gray-900 dark:text-gray-100 line-clamp-3 sm:line-clamp-2">{p.projet}</span>
                    {logo && <LogoImg src={logo} />}
                    <div className="flex -space-x-1 shrink-0">
                      {names.slice(0, 3).map((n: string) => (
                        <span key={n} className="w-5 h-5 rounded-full text-[7px] font-bold flex items-center justify-center border border-white dark:border-gray-800"
                          style={{ backgroundColor: getCollaboratorColor(n).bg, color: getCollaboratorColor(n).text }}>
                          {getCollaboratorInitials(n)}
                        </span>
                      ))}
                    </div>
                    <Badge variant="outline" className="text-[10px] shrink-0">{p.nbCabines || 0} cab.</Badge>
                  </Link>
                );
              })}
            </div>
          );
        } else if (showSummaryPanel === "sav-non-traites") {
          panelTitle = "SAV non traités";
          panelProjects = savNonTraitesProjects;
        } else if (showSummaryPanel === "soucis-en-cours") {
          panelTitle = "Soucis en cours";
          panelProjects = soucisEnCoursProjects;
        } else if (showSummaryPanel === "dossiers-en-cours") {
          /* ── PROJETS EN COURS ─────────────────────────────────── */
          const dossiersYears = Array.from(new Set(
            dossiersEnCoursProjects.map(p => (p.dateOffre || p.dateMontage || "").split("T")[0].slice(0, 4)).filter(Boolean)
          )).sort((a, b) => b.localeCompare(a));
          const dossiersTypes = Array.from(new Set(
            dossiersEnCoursProjects.flatMap(p => p.typeServices || []).filter(Boolean)
          )).sort();
          const hasDossiersFilter = !!(dossiersFilterYear || dossiersFilterType || dossiersFilterFrom || dossiersFilterTo);
          const filteredDossiers = dossiersEnCoursProjects.filter(p => {
            const dateStr = (p.dateOffre || p.dateMontage || "").split("T")[0];
            if (dossiersFilterYear && !dateStr.startsWith(dossiersFilterYear)) return false;
            if (dossiersFilterType && !(p.typeServices || []).some(t => t.includes(dossiersFilterType))) return false;
            if (dossiersFilterFrom && dateStr < dossiersFilterFrom) return false;
            if (dossiersFilterTo && dateStr > dossiersFilterTo) return false;
            return true;
          });

          // Tri par dateOffre desc
          const sortedDossiers = [...filteredDossiers].sort((a, b) =>
            ((b.dateOffre || "z").split("T")[0]).localeCompare((a.dateOffre || "z").split("T")[0])
          );

          return (
            <div className="glass-card glass-panel rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Projets en cours ({filteredDossiers.length}{hasDossiersFilter ? ` / ${dossiersEnCoursProjects.length}` : ""})
                </p>
              </div>

              {/* Filtres */}
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1">
                  <button onClick={() => setDossiersFilterYear("")}
                    className={`text-[10px] px-2.5 py-1 rounded-full border transition-colors ${!dossiersFilterYear ? "bg-indigo-600 text-white border-indigo-600" : "border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-indigo-300"}`}>
                    Tout
                  </button>
                  {dossiersYears.map(y => (
                    <button key={y} onClick={() => setDossiersFilterYear(dossiersFilterYear === y ? "" : y)}
                      className={`text-[10px] px-2.5 py-1 rounded-full border transition-colors ${dossiersFilterYear === y ? "bg-indigo-600 text-white border-indigo-600" : "border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-indigo-300"}`}>
                      {y}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  {dossiersTypes.length > 0 && (
                    <select value={dossiersFilterType} onChange={e => setDossiersFilterType(e.target.value)}
                      className="text-[10px] px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-slate-700 text-gray-700 dark:text-gray-300 flex-1 min-w-[120px]">
                      <option value="">Tous types</option>
                      {dossiersTypes.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  )}
                  <input type="date" value={dossiersFilterFrom} onChange={e => setDossiersFilterFrom(e.target.value)}
                    className="text-[10px] px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-slate-700 text-gray-600 dark:text-gray-300 w-32" />
                  <input type="date" value={dossiersFilterTo} onChange={e => setDossiersFilterTo(e.target.value)}
                    className="text-[10px] px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-slate-700 text-gray-600 dark:text-gray-300 w-32" />
                  {hasDossiersFilter && (
                    <button onClick={() => { setDossiersFilterYear(""); setDossiersFilterType(""); setDossiersFilterFrom(""); setDossiersFilterTo(""); }}
                      className="text-[10px] px-2.5 py-1 rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300 hover:bg-red-200 transition-colors">
                      Effacer
                    </button>
                  )}
                </div>
              </div>

              {/* Liste triée par date offre desc, groupée par mois */}
              {sortedDossiers.length === 0 && <p className="text-sm text-gray-400 py-2 text-center">Aucun projet sur cette période</p>}
              {(() => {
                let lastMonthKey = "";
                let colorIdx = 0;
                return sortedDossiers.flatMap((p) => {
                  const monthKey = p.dateOffre ? p.dateOffre.slice(0, 7) : "";
                  const items: React.ReactNode[] = [];
                  if (monthKey !== lastMonthKey) {
                    const monthLbl = monthKey
                      ? new Date(monthKey + "-15T12:00:00").toLocaleDateString("fr-CH", { month: "long", year: "numeric" })
                      : "Sans date d'offre";
                    items.push(
                      <div key={`month-${monthKey || "none"}`} className="flex items-center gap-2 pt-2 pb-0.5">
                        <div className="flex-1 h-px bg-indigo-200/70 dark:bg-indigo-700/40" />
                        <span className="text-[10px] font-semibold text-indigo-500 dark:text-indigo-400 shrink-0 px-1.5 capitalize">{monthLbl}</span>
                        <div className="flex-1 h-px bg-indigo-200/70 dark:bg-indigo-700/40" />
                      </div>
                    );
                    lastMonthKey = monthKey;
                    colorIdx = 0;
                  }
                  const collabField = p.collaborateurs || "";
                  const names = collabField.split(" & ").map((n: string) => n.trim()).filter(Boolean);
                  const rowBg = colorIdx % 2 === 0 ? "bg-indigo-50/50 dark:bg-indigo-950/20" : "bg-indigo-100/40 dark:bg-indigo-900/15";
                  colorIdx++;
                  const dateOffreStr = p.dateOffre ? new Date(p.dateOffre + "T12:00:00").toLocaleDateString("fr-CH", { day: "2-digit", month: "short", year: "2-digit" }) : "---";
                  items.push(
                    <Link key={p.id} href={`/projet/${p.id}?mode=dashboard`}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-indigo-200/60 dark:hover:bg-indigo-800/30 transition-colors text-xs ${rowBg}`}>
                      <span className="w-20 shrink-0 flex flex-col justify-center gap-px">
                        {parseTMNumbers(p.ofrTM || "").length > 0
                          ? parseTMNumbers(p.ofrTM || "").map((tm, i) => (
                              <span key={i} className="font-mono text-xs leading-tight text-gray-600 dark:text-gray-300 truncate">{tm}</span>
                            ))
                          : <span className="font-mono text-xs text-gray-400">---</span>
                        }
                      </span>
                      <span className="w-24 shrink-0 font-mono text-indigo-600 dark:text-indigo-400 hidden sm:block text-[10px]">{dateOffreStr}</span>
                      <span className="flex-1 min-w-0 text-xs text-gray-900 dark:text-gray-100 line-clamp-3 sm:line-clamp-1">{p.projet}</span>
                      {(p.typeServices || []).slice(0, 1).map(ts => (
                        <span key={ts} className="shrink-0 text-[8px] font-semibold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 hidden sm:inline-flex">{ts}</span>
                      ))}
                      {(() => { const logo = getClientLogo(p.projet); return logo ? (
                        <LogoImg src={logo} />
                      ) : null; })()}
                      <div className="flex -space-x-1 shrink-0">
                        {names.slice(0, 3).map((n: string) => (
                          <span key={n} className="w-5 h-5 rounded-full text-[7px] font-bold flex items-center justify-center border border-white dark:border-gray-800"
                            style={{ backgroundColor: getCollaboratorColor(n).bg, color: getCollaboratorColor(n).text }}>
                            {getCollaboratorInitials(n)}
                          </span>
                        ))}
                      </div>
                      <Badge variant="outline" className="text-[10px] shrink-0">{p.nbCabines || 0} cab.</Badge>
                    </Link>
                  );
                  return items;
                });
              })()}
            </div>
          );
        } else if (showSummaryPanel === "a-facturer") {
          panelTitle = "À facturer";
          panelProjects = aFacturerProjects;
        } else if (showSummaryPanel === "rdv-a-fixer") {
          /**
           * Extrait le NPA (4 chiffres) depuis adresseChantier ou le nom du projet.
           * Le NPA est la première séquence de 4 chiffres trouvée.
           */
          const extractNPA = (addr: string, projectName?: string): string => {
            for (const text of [addr, projectName]) {
              if (!text) continue;
              const m = text.match(/\b(\d{4})\b/);
              if (m) return m[1];
            }
            return "9999"; // trie en dernier si pas de NPA
          };

          // Split into 3 categories
          const montageStatuses = ["Livraison partielle", "Cabine à aller chercher", "Récéptionné - RDV à fixer", "Montage partiel"];
          const mesuresStatuses = ["Pas contacté", "Contact sans réponse"];

          const montageProjects = projects.filter((p) => montageStatuses.includes(p.etatCMD))
            .sort((a, b) => {
              const da = (a.arrivageTM || a.arrivageGrossiste || "z").split("T")[0];
              const db = (b.arrivageTM || b.arrivageGrossiste || "z").split("T")[0];
              return da.localeCompare(db);
            });

          const mesuresProjects = projects.filter((p) => p.etatCMD === "En attente de mesures" && mesuresStatuses.includes(p.etatMesures))
            .sort((a, b) => ((a.dateMesuresRecue || a.dateMesures || "z").split("T")[0]).localeCompare((b.dateMesuresRecue || b.dateMesures || "z").split("T")[0]));

          // "Services à planifier" = uniquement les projets dont au moins un typeService
          // est "Services" ou commence par "Service" (ex. "Services + Démontage").
          const servicesProjects = projects.filter((p) =>
            montageStatuses.includes(p.etatCMD) &&
            p.typeServices &&
            p.typeServices.some((t) => t.toLowerCase().startsWith("service"))
          ).sort((a, b) => ((a.dateDemandeProjet || a.dateMontage || "z").split("T")[0]).localeCompare((b.dateDemandeProjet || b.dateMontage || "z").split("T")[0]));

          // SAV à contacter
          const savAFixerStatuses2 = ["A contacter", "Contact sans réponse", "Attente news", "En cours de traitement"];
          const savAFixerProjects = projects.filter(
            (p) => (p as any)._source === "sav" && savAFixerStatuses2.includes(p.etatSAV)
          ).sort((a, b) => (a.projet || "").localeCompare(b.projet || ""));

          // Remove services from montage list to avoid duplicates
          const pureMontageProjets = montageProjects.filter((p) => !servicesProjects.some((s) => s.id === p.id));

          const totalCount = pureMontageProjets.length + mesuresProjects.length + servicesProjects.length + savAFixerProjects.length;

          /** Calcule J+x depuis une date ISO et retourne label + classe couleur */
          const getDaysBadge = (dateStr: string): { label: string; colorClass: string; bgClass: string; days: number } | null => {
            if (!dateStr) return null;
            const days = Math.floor((Date.now() - new Date(dateStr + "T12:00:00").getTime()) / 86_400_000);
            if (days < 0) return null;
            const colorClass = days <= 5 ? "text-green-600 dark:text-green-400" : days <= 9 ? "text-orange-500 dark:text-orange-400" : "text-red-500 dark:text-red-400";
            const bgClass    = days <= 5 ? "bg-green-50 dark:bg-green-900/20"   : days <= 9 ? "bg-orange-50 dark:bg-orange-900/20"   : "bg-red-50 dark:bg-red-900/20";
            return { label: `J+${days}`, colorClass, bgClass, days };
          };

          /** Retourne la date de référence (YYYY-MM-DD) d'un projet selon le champ actif. */
          const getRefDate = (p: Project, field?: "dateMesuresRecue" | "dateDemandeProjet" | "dateSAVRecu" | "arrivageTM"): string => {
            if (field === "dateMesuresRecue") return (p.dateMesuresRecue || p.dateMesures || "").split("T")[0];
            if (field === "dateDemandeProjet") return (p.dateDemandeProjet || p.dateMontage || "").split("T")[0];
            if (field === "dateSAVRecu")       return (p.dateSAVRecu || "").split("T")[0];
            if (field === "arrivageTM")        return (p.arrivageTM || p.arrivageGrossiste || "").split("T")[0];
            return (p.dateMesures || p.dateMontage || "").split("T")[0];
          };

          const renderCategory = (title: string, color: string, bgColor: string, categoryProjects: Project[], dateLabel?: string, useDateField?: "dateMesuresRecue" | "dateDemandeProjet" | "dateSAVRecu" | "arrivageTM", showDaysBadge?: boolean) => {
            if (categoryProjects.length === 0) return null;

            // ── Tri ────────────────────────────────────────────────────────────
            const curSort = rdvSortConfig[title] || { key: "date" as RdvSortKey, dir: "asc" as RdvSortDir };
            const sortedProjects = [...categoryProjects].sort((a, b) => {
              if (curSort.key === "cabines") {
                const diff = (a.nbCabines || 0) - (b.nbCabines || 0);
                return curSort.dir === "asc" ? diff : -diff;
              }
              if (curSort.key === "localite") {
                const na = extractNPA(a.adresseChantier, a.projet);
                const nb = extractNPA(b.adresseChantier, b.projet);
                const cmp = na.localeCompare(nb);
                return curSort.dir === "asc" ? cmp : -cmp;
              }
              // "date" : plus ancienne en premier (asc) ; "days" : J+ le plus bas en premier (asc = date desc)
              const da = getRefDate(a, useDateField) || "9999-99-99";
              const db = getRefDate(b, useDateField) || "9999-99-99";
              const cmp = da.localeCompare(db);
              if (curSort.key === "days") return curSort.dir === "asc" ? -cmp : cmp;
              return curSort.dir === "asc" ? cmp : -cmp;
            });

            // ── Boutons de tri ─────────────────────────────────────────────────
            const sortBtns: { key: RdvSortKey; label: string }[] = [
              { key: "date",    label: "Date" },
              { key: "days",    label: "J+x" },
              { key: "cabines", label: "Cab." },
            ];

            return (
              <div key={title} className="mb-4">
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg mb-1.5 ${bgColor}`}>
                  <span className={`text-[12px] font-bold ${color} shrink-0`}>{title}</span>
                  {/* Boutons de tri texte */}
                  <div className="flex items-center gap-1 ml-2">
                    {sortBtns.map(({ key, label }) => {
                      const active = curSort.key === key;
                      const arrow = active ? (curSort.dir === "asc" ? " ↑" : " ↓") : "";
                      return (
                        <button
                          key={key}
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleRdvSort(title, key); }}
                          className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-md transition-colors whitespace-nowrap ${
                            active
                              ? "bg-white/80 dark:bg-white/20 shadow-sm " + color
                              : "bg-white/30 dark:bg-white/10 text-gray-500 dark:text-gray-400 hover:bg-white/60 dark:hover:bg-white/15"
                          }`}
                        >
                          {label}{arrow}
                        </button>
                      );
                    })}
                    {/* Bouton tri par NPA (localité) */}
                    {(() => {
                      const active = curSort.key === "localite";
                      return (
                        <button
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleRdvSort(title, "localite"); }}
                          title={`Trier par NPA${active ? (curSort.dir === "asc" ? " ↑" : " ↓") : ""}`}
                          className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-md transition-colors ${
                            active
                              ? "bg-white/80 dark:bg-white/20 shadow-sm " + color
                              : "bg-white/30 dark:bg-white/10 text-gray-500 dark:text-gray-400 hover:bg-white/60 dark:hover:bg-white/15"
                          }`}
                        >
                          <MapPin className="w-2.5 h-2.5" />
                          {active && <span className="text-[9px] font-bold">{curSort.dir === "asc" ? "↑" : "↓"}</span>}
                        </button>
                      );
                    })()}
                  </div>
                  <div className="ml-auto flex items-center gap-1 shrink-0">
                    <span className="text-[10px] font-semibold bg-white/60 dark:bg-white/10 px-2 py-0.5 rounded-full">
                      {categoryProjects.length} projet{categoryProjects.length > 1 ? "s" : ""}
                    </span>
                    <span className="text-[10px] font-semibold bg-white/60 dark:bg-white/10 px-2 py-0.5 rounded-full">
                      {categoryProjects.reduce((sum, p) => sum + (p.nbCabines || 0), 0)} cab.
                    </span>
                  </div>
                </div>
                {dateLabel && (
                  <div className="hidden sm:flex items-center gap-2 px-2 py-0.5 mb-1 text-[9px] font-semibold text-gray-400 uppercase tracking-wider">
                    <span className="w-16 shrink-0">{dateLabel}</span>
                  </div>
                )}
                {sortedProjects.map((p, idx) => {
                  const isMesure = p.etatMesures && mesuresStatuses.includes(p.etatMesures);
                  const collabField = isMesure ? (p.mesuresTraiteePar || p.collaborateurs || "") : (p.collaborateurs || "");
                  const names = collabField.split(" & ").map((n) => n.trim()).filter(Boolean);
                  const date = getRefDate(p, useDateField);
                  const rowBg = idx % 2 === 0 ? "bg-blue-50/60 dark:bg-blue-950/20" : "bg-blue-100/60 dark:bg-blue-900/20";
                  const arrivage = getArrivageInfo(p);
                  const dateStr = date ? new Date(date + "T12:00:00").toLocaleDateString("fr-CH", { day: "2-digit", month: "short" }) : "---";
                  const tmNumbers = parseTMNumbers(p.ofrTM || "");
                  const tsColors: Record<string, string> = {
                    "Montages": "bg-orange-100 text-orange-700", "Montage": "bg-orange-100 text-orange-700",
                    "Mesures": "bg-cyan-100 text-cyan-700", "Services": "bg-emerald-100 text-emerald-700",
                    "SAV": "bg-red-100 text-red-700", "Livraison": "bg-amber-100 text-amber-700",
                    "Dépannage": "bg-pink-100 text-pink-700", "Démontage": "bg-rose-100 text-rose-700",
                    "Remplacement": "bg-indigo-100 text-indigo-700",
                  };
                  const tsParts = (p.typeServices || []).flatMap((ts) =>
                    ts.includes("+") ? ts.split("+").map((s) => s.trim()) : [ts]
                  ).filter(Boolean);
                  const logoImg = (() => { const logo = getClientLogo(p.projet); return logo ? (
                    <LogoImg src={logo} />
                  ) : null; })();

                  // Badge J+x (uniquement si showDaysBadge et date de référence connue)
                  const daysBadge = showDaysBadge ? getDaysBadge(date) : null;

                  if (isIOS) {
                    return (
                      <Link key={p.id} href={`/projet/${p.id}?mode=dashboard`}
                        className={`block px-2 py-1.5 rounded-lg hover:bg-blue-200/60 dark:hover:bg-blue-800/30 transition-colors text-xs ${rowBg}`}>
                        <div className="flex items-start gap-2">
                          <span className="w-20 shrink-0 flex flex-col justify-center gap-px pt-0.5">
                            {tmNumbers.length > 0
                              ? tmNumbers.map((tm, i) => (
                                  <span key={i} className="font-mono text-xs leading-tight text-gray-600 dark:text-gray-300 truncate">{tm}</span>
                                ))
                              : <span className="font-mono text-xs text-gray-400">---</span>
                            }
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="block text-xs font-semibold text-gray-900 dark:text-gray-100 line-clamp-3 sm:line-clamp-2 leading-tight">{p.projet}</span>
                            {p.nomChantier && p.nomChantier !== p.projet && (
                              <span className="block text-[10px] text-gray-400 dark:text-gray-500 line-clamp-1 leading-tight">{p.nomChantier}</span>
                            )}
                          </span>
                          {/* J+x badge iOS — affiché en haut à droite */}
                          {daysBadge && (
                            <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${daysBadge.bgClass} ${daysBadge.colorClass}`}>
                              {dateStr} {daysBadge.label}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 ml-[5.5rem] flex-wrap">
                          {tsParts.length > 0 && (
                            <span className={`text-[8px] font-semibold px-1.5 py-0.5 rounded-full ${tsColors[tsParts[0]] || "bg-gray-100 text-gray-600"}`}>
                              {tsParts[0]}
                            </span>
                          )}
                          {logoImg && <span className="shrink-0">{logoImg}</span>}
                          {names.length > 0 && (
                            <div className="flex -space-x-1 shrink-0">
                              {names.slice(0, 3).map((n) => (
                                <span key={n} className="w-5 h-5 rounded-full text-[7px] font-bold flex items-center justify-center border border-white dark:border-gray-800"
                                  style={{ backgroundColor: getCollaboratorColor(n).bg, color: getCollaboratorColor(n).text }}>{getCollaboratorInitials(n)}</span>
                              ))}
                            </div>
                          )}
                          <Badge variant="outline" className="text-[10px] shrink-0 ml-auto">{p.nbCabines || 0} cab.</Badge>
                        </div>
                      </Link>
                    );
                  }

                  return (
                    <Link key={p.id} href={`/projet/${p.id}?mode=dashboard`}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-blue-200/60 dark:hover:bg-blue-800/30 transition-colors text-xs ${rowBg}`}>
                      {/* Colonne date + J+x (desktop) */}
                      <span className="hidden sm:flex items-center gap-1 w-28 shrink-0">
                        <span className="text-gray-400 font-mono">{dateStr}</span>
                        {daysBadge && (
                          <span className={`text-[9px] font-bold px-1 py-0.5 rounded-full ${daysBadge.bgClass} ${daysBadge.colorClass}`}>
                            {daysBadge.label}
                          </span>
                        )}
                      </span>
                      <span className="w-20 shrink-0 flex flex-col justify-center gap-px">
                        {tmNumbers.length > 0
                          ? tmNumbers.map((tm, i) => (
                              <span key={i} className="font-mono text-xs leading-tight text-gray-600 dark:text-gray-300 truncate">{tm}</span>
                            ))
                          : <span className="font-mono text-xs text-gray-400">---</span>
                        }
                      </span>
                      <span className="w-20 shrink-0 font-mono text-gray-500 dark:text-gray-400 truncate hidden sm:block">{p.servMesuresFournisseurs || "---"}</span>
                      <span className="w-20 shrink-0 font-mono text-gray-500 dark:text-gray-400 truncate hidden sm:block">{p.servCmdFournisseurs || "---"}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-xs font-semibold text-gray-900 dark:text-gray-100 leading-tight line-clamp-3 sm:line-clamp-1">{p.projet}</span>
                        {p.nomChantier && p.nomChantier !== p.projet && (
                          <span className="block text-[10px] text-gray-400 dark:text-gray-500 line-clamp-1 leading-tight hidden sm:block">{p.nomChantier}</span>
                        )}
                      </span>

                      {/* COL arrivage — visible sm+ */}
                      <span className="hidden sm:flex w-28 shrink-0 justify-end">
                        {arrivage ? (
                          <span
                            title={`Arrivage ${arrivage.label} : ${new Date(arrivage.date! + "T12:00:00").toLocaleDateString("fr-CH", { day: "2-digit", month: "short" })}${arrivage.days !== null && arrivage.days >= 0 ? ` (J+${arrivage.days})` : ""}`}
                            className={`inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap ${arrivage.bgClass} ${arrivage.colorClass}`}
                          >
                            <span>{arrivage.label}</span>
                            <span>{new Date(arrivage.date! + "T12:00:00").toLocaleDateString("fr-CH", { day: "2-digit", month: "short" })}</span>
                            {arrivage.days !== null && arrivage.days >= 0 && <span className="opacity-75">J+{arrivage.days}</span>}
                          </span>
                        ) : null}
                      </span>

                      {/* COL type service */}
                      <span className="w-20 shrink-0 flex justify-end">
                        {tsParts.length > 0 ? (
                          <span className={`text-[8px] font-semibold px-1.5 py-0.5 rounded-full truncate max-w-full ${tsColors[tsParts[0]] || "bg-gray-100 text-gray-600"}`}>
                            {tsParts[0]}
                          </span>
                        ) : null}
                      </span>

                      {/* COL logo */}
                      <span className="w-8 shrink-0 flex justify-center">{logoImg}</span>

                      {/* COL cabines — visible sm+ */}
                      <Badge variant="outline" className="hidden sm:flex text-[10px] shrink-0 w-12 justify-center">{p.nbCabines || 0} cab.</Badge>
                    </Link>
                  );
                })}
              </div>
            );
          };

          return (
            <div className="glass-card rounded-2xl p-4">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">RDV à fixer ({totalCount})</p>
              {renderCategory("Mesures à relever", "text-cyan-700 dark:text-cyan-300", "bg-cyan-50 dark:bg-cyan-900/20", mesuresProjects, "Reçue le", "dateMesuresRecue", true)}
              {renderCategory("Montages à planifier", "text-orange-700 dark:text-orange-300", "bg-orange-50 dark:bg-orange-900/20", pureMontageProjets, "Arrivage", "arrivageTM")}
              {renderCategory("Services à planifier", "text-emerald-700 dark:text-emerald-300", "bg-emerald-50 dark:bg-emerald-900/20", servicesProjects, "Reçue le", "dateDemandeProjet")}
              {renderCategory("SAV à contacter", "text-red-700 dark:text-red-300", "bg-red-50 dark:bg-red-900/20", savAFixerProjects, "SAV reçu le", "dateSAVRecu", true)}
              {totalCount === 0 && <p className="text-sm text-gray-400 py-2">Aucun projet</p>}
            </div>
          );
        } else if (showSummaryPanel === "rdv-fixe") {
          panelTitle = "RDV fixé";
          panelProjects = projects
            .filter((p) => p.etatCMD === "RDV - fixé" || p.etatMesures === "RDV - Fixé")
            .sort((a, b) => ((a.dateMontage || a.dateMesures || "z").split("T")[0]).localeCompare((b.dateMontage || b.dateMesures || "z").split("T")[0]));
        } else if (showSummaryPanel === "mesures-sans-commande") {
          /* ── MESURES — vue double (à commander / annulées) ──────── */
          const isAnnulees = mesuresSubView === "annulees";
          const rawList = isAnnulees ? mesuresAnnuleesData : mesuresSansCommandeProjects;
          const displayLoading = isAnnulees ? mesuresAnnuleesLoading : mesuresSansCommandeLoading;
          // Filtrage mesures
          const displayList = rawList.filter(p => {
            const dateStr = (p.dateMesures || "").split("T")[0];
            if (mesuresFilterYear && !dateStr.startsWith(mesuresFilterYear)) return false;
            if (mesuresFilterFrom && dateStr < mesuresFilterFrom) return false;
            if (mesuresFilterTo && dateStr > mesuresFilterTo) return false;
            return true;
          });
          const mesuresYears = Array.from(new Set(
            rawList.map(p => (p.dateMesures || "").split("T")[0].slice(0, 4)).filter(Boolean)
          )).sort((a, b) => b.localeCompare(a));
          const hasMesuresFilter = !!(mesuresFilterYear || mesuresFilterFrom || mesuresFilterTo);
          const hoverClass    = isAnnulees ? "hover:bg-red-200/60 dark:hover:bg-red-800/30" : "hover:bg-blue-200/60 dark:hover:bg-blue-800/30";
          const arrowClass    = isAnnulees ? "group-hover:text-red-400" : "group-hover:text-cyan-400";
          const dateClass     = isAnnulees ? "text-red-600 dark:text-red-400" : "text-cyan-700 dark:text-cyan-300";

          const renderMesureRow = (p: Project, idx: number) => {
            const dateStr    = (p.dateMesures || "").split("T")[0];
            const traitePar  = p.mesuresTraiteePar || "";
            const traitColors = traitePar ? getCollaboratorColor(traitePar) : null;
            const logo       = getBestLogo(p.projet, p.fournisseurs || []);
            const dateLabel  = dateStr
              ? new Date(dateStr + "T12:00:00").toLocaleDateString("fr-CH", { day: "2-digit", month: "short", year: "2-digit" })
              : "—";
            const tmNums = parseTMNumbers(p.ofrTM || "");
            const title = p.projet || p.nomChantier || "—";
            const subtitle = p.nomChantier && p.nomChantier !== p.projet ? p.nomChantier : null;
            const rowBg = isAnnulees
              ? (idx % 2 === 0 ? "bg-red-50/50 dark:bg-red-950/20" : "bg-red-100/40 dark:bg-red-900/15")
              : (idx % 2 === 0 ? "bg-blue-50/60 dark:bg-blue-950/20" : "bg-blue-100/60 dark:bg-blue-900/20");

            return (
              <Link key={p.id} href={`/projet/${p.id}?mode=dashboard`}
                className={`block sm:flex sm:items-center sm:gap-3 px-2 py-1.5 rounded-lg ${rowBg} ${hoverClass} transition-colors group`}>

                {/* ── Mobile : layout bloc ── */}
                <div className="sm:hidden">
                  {/* Ligne 1 : date + OFR + logo + avatar + chevron */}
                  <div className="flex items-center gap-2">
                    <span className={`text-[11px] font-semibold tabular-nums shrink-0 ${dateClass}`}>{dateLabel}</span>
                    <span className="flex-1 min-w-0">
                      {tmNums.length > 0 ? (
                        <span className="font-mono text-[10px] text-gray-500 dark:text-gray-400 truncate block">{tmNums[0]}</span>
                      ) : <span className="font-mono text-[10px] text-gray-300">—</span>}
                    </span>
                    {logo && <LogoImg src={logo} />}
                    {traitePar && traitColors && (
                      <span className="w-5 h-5 rounded-full text-[7px] font-bold flex items-center justify-center shrink-0"
                        style={{ backgroundColor: traitColors.bg, color: traitColors.text }}>
                        {getCollaboratorInitials(traitePar)}
                      </span>
                    )}
                    <ChevronRight className={`w-3.5 h-3.5 text-gray-300 ${arrowClass} transition-colors shrink-0`} />
                  </div>
                  {/* Ligne 2 : titre */}
                  <div className="flex items-center gap-1.5 mt-1">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 line-clamp-3">{title}</p>
                      {subtitle && <p className="text-[10px] text-gray-400 dark:text-gray-500 line-clamp-1">{subtitle}</p>}
                    </div>
                  </div>
                </div>

                {/* ── Desktop : layout flex original ── */}
                <div className="hidden sm:contents">
                  <div className="w-24 shrink-0">
                    <span className={`text-[11px] font-semibold tabular-nums ${dateClass}`}>{dateLabel}</span>
                  </div>
                  <div className="w-24 shrink-0">
                    {tmNums.length > 0 ? (
                      <div className="flex flex-col gap-px">
                        {tmNums.slice(0, 2).map((tm, i) => (
                          <span key={i} className="font-mono text-[10px] text-gray-600 dark:text-gray-300 leading-tight truncate">{tm}</span>
                        ))}
                      </div>
                    ) : <span className="font-mono text-[10px] text-gray-300">—</span>}
                  </div>
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 line-clamp-1">{title}</p>
                      {subtitle && <p className="text-[10px] text-gray-400 dark:text-gray-500 line-clamp-1">{subtitle}</p>}
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-1.5 justify-end">
                    {logo && <LogoImg src={logo} />}
                    {traitePar && traitColors && (
                      <span className="w-5 h-5 rounded-full text-[7px] font-bold flex items-center justify-center shrink-0"
                        style={{ backgroundColor: traitColors.bg, color: traitColors.text }}>
                        {getCollaboratorInitials(traitePar)}
                      </span>
                    )}
                  </div>
                  <ChevronRight className={`w-3.5 h-3.5 text-gray-300 ${arrowClass} transition-colors shrink-0`} />
                </div>
              </Link>
            );
          };

          return (
            <div className="glass-card glass-panel rounded-2xl p-4 space-y-3">
              {/* Switcher */}
              <div className="flex items-center gap-2">
                <div className="flex bg-gray-100 dark:bg-gray-800 rounded-xl p-1.5 gap-1.5 flex-1">
                  <button
                    type="button"
                    onClick={() => setMesuresSubView("commande")}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-[11px] font-semibold transition-colors touch-manipulation select-none ${!isAnnulees ? "bg-white dark:bg-gray-700 text-cyan-700 dark:text-cyan-300 shadow-sm" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"}`}>
                    <Ruler className="w-3 h-3" />
                    À commander
                    <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold ${!isAnnulees ? "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300" : "bg-gray-200 dark:bg-gray-700 text-gray-500"}`}>
                      {mesuresSansCommandeLoading ? "…" : mesuresSansCommandeCount}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMesuresSubView("annulees")}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-[11px] font-semibold transition-colors touch-manipulation select-none ${isAnnulees ? "bg-white dark:bg-gray-700 text-red-600 dark:text-red-400 shadow-sm" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"}`}>
                    <AlertCircle className="w-3 h-3" />
                    Annulées
                    <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold ${isAnnulees ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" : "bg-gray-200 dark:bg-gray-700 text-gray-500"}`}>
                      {mesuresAnnuleesLoading ? "…" : mesuresAnnuleesData.length}
                    </span>
                  </button>
                </div>
                {displayLoading && <span className="text-[10px] text-gray-400 animate-pulse shrink-0">Chargement…</span>}
              </div>

              {/* Filtres */}
              <div className="flex flex-wrap gap-1 items-center">
                <button onClick={() => setMesuresFilterYear("")}
                  className={`text-[10px] px-2.5 py-1 rounded-full border transition-colors ${!mesuresFilterYear ? "bg-cyan-600 text-white border-cyan-600" : "border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-cyan-300"}`}>
                  Tout
                </button>
                {mesuresYears.map(y => (
                  <button key={y} onClick={() => setMesuresFilterYear(mesuresFilterYear === y ? "" : y)}
                    className={`text-[10px] px-2.5 py-1 rounded-full border transition-colors ${mesuresFilterYear === y ? "bg-cyan-600 text-white border-cyan-600" : "border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-cyan-300"}`}>
                    {y}
                  </button>
                ))}
                <input type="date" value={mesuresFilterFrom} onChange={e => setMesuresFilterFrom(e.target.value)}
                  className="text-[10px] px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-slate-700 text-gray-600 dark:text-gray-300 w-28 ml-1" />
                <input type="date" value={mesuresFilterTo} onChange={e => setMesuresFilterTo(e.target.value)}
                  className="text-[10px] px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-slate-700 text-gray-600 dark:text-gray-300 w-28" />
                {hasMesuresFilter && (
                  <button onClick={() => { setMesuresFilterYear(""); setMesuresFilterFrom(""); setMesuresFilterTo(""); }}
                    className="text-[10px] px-2.5 py-1 rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300 hover:bg-red-200 transition-colors">
                    Effacer
                  </button>
                )}
              </div>

              {/* Column headers */}
              {displayList.length > 0 && (
                <div className="hidden sm:flex items-center gap-3 px-2 text-[9px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700 pb-1.5">
                  <span className="w-24 shrink-0">Date mesures</span>
                  <span className="w-24 shrink-0">N° OFR TM</span>
                  <span className="flex-1">Projet</span>
                  <span className="w-28 shrink-0 text-right">Traitée par</span>
                </div>
              )}

              {/* Rows groupés par mois avec séparateur */}
              <div className="space-y-0.5">
                {(() => {
                  let lastMonthKey = "";
                  let rowIdx = 0;
                  return displayList.flatMap((p) => {
                    const monthKey = (p.dateMesures || "").split("T")[0].slice(0, 7);
                    const items: React.ReactNode[] = [];
                    if (monthKey !== lastMonthKey) {
                      const monthLabel = monthKey
                        ? new Date(monthKey + "-15T12:00:00").toLocaleDateString("fr-CH", { month: "long", year: "numeric" })
                        : "Sans date";
                      items.push(
                        <div key={`sep-${monthKey || "none"}-${p.id}`} className="flex items-center gap-2 pt-2 pb-0.5">
                          <div className="flex-1 h-px bg-cyan-200/70 dark:bg-cyan-700/40" />
                          <span className="text-[10px] font-semibold text-cyan-600 dark:text-cyan-400 shrink-0 px-1.5 capitalize">{monthLabel}</span>
                          <div className="flex-1 h-px bg-cyan-200/70 dark:bg-cyan-700/40" />
                        </div>
                      );
                      lastMonthKey = monthKey;
                    }
                    items.push(renderMesureRow(p, rowIdx++));
                    return items;
                  });
                })()}
              </div>

              {displayList.length === 0 && !displayLoading && (
                <p className="text-sm text-gray-400 py-4 text-center">
                  {isAnnulees ? "Aucune mesure terminée sur projet annulé" : "Toutes les mesures ont été commandées 🎉"}
                </p>
              )}
            </div>
          );
        } else if (showSummaryPanel === "sav-historique") {
          /* ── SAV HISTORIQUE (coche SAV = true) ─────────────────── */
          const DONE_STATES = ["Terminé", "Annulé", "Rapport clôturé"];
          const ETAT_SAV_COLORS: Record<string, string> = {
            "A contacter":            "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
            "Contact sans réponse":   "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
            "Attente news":           "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
            "En cours de traitement": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
            "RDV fixé":               "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
            "Terminé":                "bg-gray-100 text-gray-500 dark:bg-gray-700/40 dark:text-gray-400",
            "Annulé":                 "bg-gray-100 text-gray-400 dark:bg-gray-700/40 dark:text-gray-500",
            "Rapport clôturé":        "bg-gray-100 text-gray-400 dark:bg-gray-700/40 dark:text-gray-500",
            "RDV - fixé":             "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
            "Soucis montage":         "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
            "Livraison partielle":    "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
            "Montage partiel":        "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
          };

          // Années disponibles
          const savYears = Array.from(new Set(
            allSavProjects.map(p => (p.dateMontage || p.dateRDVSAV || "").split("T")[0].slice(0, 4)).filter(Boolean)
          )).sort((a, b) => b.localeCompare(a));

          // Causes SAV disponibles
          const savAllCauses = Array.from(new Set(allSavProjects.map(p => p.causeSAV).filter(Boolean)));

          // Filtrage
          const filteredSavProjects = allSavProjects.filter(p => {
            const dateStr = (p.dateMontage || p.dateRDVSAV || "").split("T")[0];
            if (savFilterYear && !dateStr.startsWith(savFilterYear)) return false;
            if (savFilterCause && p.causeSAV !== savFilterCause) return false;
            if (savFilterFrom && dateStr < savFilterFrom) return false;
            if (savFilterTo && dateStr > savFilterTo) return false;
            return true;
          });

          const savEnCours  = filteredSavProjects.filter(p => !DONE_STATES.includes(p.etatCMD));
          const savTermines = filteredSavProjects.filter(p =>  DONE_STATES.includes(p.etatCMD));

          // Stats % par marque
          const allMontageAllSav = [...projects, ...terminatedProjects]
            .filter((p, i, arr) => arr.findIndex(x => x.id === p.id) === i)
            .filter(p => { const src = (p as any)._source; return src !== "mesures" && src !== "sav"; });
          const savBrandList = Array.from(new Set(allSavProjects.flatMap(p => p.fournisseurs).filter(Boolean)));
          const savBrandStats = savBrandList.map(brand => {
            const savCab = filteredSavProjects
              .filter(p => p.fournisseurs.includes(brand))
              .reduce((s, p) => s + (p.nbCabines || 0), 0);
            const totalCab = allMontageAllSav
              .filter(p => p.fournisseurs.includes(brand))
              .reduce((s, p) => s + (p.nbCabines || 0), 0);
            const rate = totalCab > 0 ? Math.round(savCab / totalCab * 100) : 0;
            return { brand, savCab, totalCab, rate };
          }).filter(b => b.totalCab > 0).sort((a, b) => b.rate - a.rate);

          const hasSavFilter = !!(savFilterYear || savFilterCause || savFilterFrom || savFilterTo);

          const renderSavRow = (p: Project) => {
            const dateStr  = (p.dateMontage || "").split("T")[0];
            const names    = (p.collaborateurs || "").split(/[\s&]+/).map((n: string) => n.trim()).filter(Boolean);
            const logo     = getClientLogo(p.projet);
            const statusLabel = p.etatSAV || p.etatCMD || "—";
            return (
              <Link key={p.id} href={`/projet/${p.id}?mode=dashboard`}
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors group">
                <span className="text-[10px] text-gray-400 font-mono w-16 shrink-0 tabular-nums">
                  {dateStr ? new Date(dateStr + "T12:00:00").toLocaleDateString("fr-CH", { day: "2-digit", month: "short", year: "2-digit" }) : "—"}
                </span>
                <div className="flex -space-x-1 shrink-0">
                  {names.slice(0, 2).map((n: string) => (
                    <span key={n} className="w-6 h-6 rounded-full text-[8px] font-bold flex items-center justify-center border border-white dark:border-gray-800"
                      style={{ backgroundColor: getCollaboratorColor(n).bg, color: getCollaboratorColor(n).text }}>
                      {getCollaboratorInitials(n)}
                    </span>
                  ))}
                </div>
                <div className="flex-1 min-w-0">
                  {p.ofrTM && <p className="text-[9px] font-mono text-gray-400 leading-none mb-0.5">{p.ofrTM}</p>}
                  <p className="text-xs text-gray-900 dark:text-gray-100 line-clamp-3 sm:line-clamp-1 font-medium">{p.projet}</p>
                  {p.causeSAV && <p className="text-[10px] text-gray-400 mt-0.5">Cause SAV : {p.causeSAV}</p>}
                </div>
                {logo && <LogoImg src={logo} />}
                <span className={`text-[9px] font-semibold px-2 py-1 rounded-full shrink-0 whitespace-nowrap ${ETAT_SAV_COLORS[statusLabel] || "bg-gray-100 text-gray-500"}`}>
                  {statusLabel}
                </span>
                <Badge variant="outline" className="text-[10px] shrink-0">{p.nbCabines || 0} cab.</Badge>
                <ChevronRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-red-400 transition-colors shrink-0" />
              </Link>
            );
          };

          return (
            <div className="glass-card rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  SAV — coche cochée ({filteredSavProjects.length}{hasSavFilter ? ` / ${allSavCount}` : ""})
                </p>
                {terminatedLoading && <span className="text-[10px] text-gray-400 animate-pulse">Chargement…</span>}
              </div>

              {/* Stats % par marque */}
              {savBrandStats.length > 0 && (
                <div className="flex flex-wrap gap-1.5 py-2 border-y border-red-100 dark:border-red-900/30">
                  {savBrandStats.map(b => (
                    <div key={b.brand} className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] ${b.rate >= 20 ? "bg-red-50 dark:bg-red-900/20" : b.rate >= 10 ? "bg-orange-50 dark:bg-orange-900/20" : "bg-green-50 dark:bg-green-900/20"}`}>
                      <span className="font-medium text-gray-700 dark:text-gray-300 truncate max-w-[80px]">{b.brand}</span>
                      <span className={`font-bold tabular-nums ${b.rate >= 20 ? "text-red-600 dark:text-red-400" : b.rate >= 10 ? "text-orange-600 dark:text-orange-400" : "text-green-600 dark:text-green-400"}`}>{b.rate}%</span>
                      <span className="text-gray-400 dark:text-gray-500">{b.savCab}/{b.totalCab}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Filtres */}
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1">
                  <button onClick={() => setSavFilterYear("")}
                    className={`text-[10px] px-2.5 py-1 rounded-full border transition-colors ${!savFilterYear ? "bg-red-600 text-white border-red-600" : "border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-red-300"}`}>
                    Tout
                  </button>
                  {savYears.map(y => (
                    <button key={y} onClick={() => setSavFilterYear(savFilterYear === y ? "" : y)}
                      className={`text-[10px] px-2.5 py-1 rounded-full border transition-colors ${savFilterYear === y ? "bg-red-600 text-white border-red-600" : "border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-red-300"}`}>
                      {y}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  {savAllCauses.length > 0 && (
                    <select value={savFilterCause} onChange={e => setSavFilterCause(e.target.value)}
                      className="text-[10px] px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-slate-700 text-gray-700 dark:text-gray-300 flex-1 min-w-[120px]">
                      <option value="">Toutes causes SAV</option>
                      {savAllCauses.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  )}
                  <input type="date" value={savFilterFrom} onChange={e => setSavFilterFrom(e.target.value)}
                    className="text-[10px] px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-slate-700 text-gray-600 dark:text-gray-300 w-32" />
                  <input type="date" value={savFilterTo} onChange={e => setSavFilterTo(e.target.value)}
                    className="text-[10px] px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-slate-700 text-gray-600 dark:text-gray-300 w-32" />
                  {hasSavFilter && (
                    <button onClick={() => { setSavFilterYear(""); setSavFilterCause(""); setSavFilterFrom(""); setSavFilterTo(""); }}
                      className="text-[10px] px-2.5 py-1 rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300 hover:bg-red-200 transition-colors">
                      Effacer
                    </button>
                  )}
                </div>
              </div>

              {savEnCours.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg mb-1.5 bg-red-50 dark:bg-red-900/20">
                    <span className="text-[12px] font-bold text-red-700 dark:text-red-300">En cours ({savEnCours.length})</span>
                  </div>
                  <div className="space-y-0.5">{savEnCours.map(renderSavRow)}</div>
                </div>
              )}
              {savTermines.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg mb-1.5 bg-gray-50 dark:bg-gray-700/30">
                    <span className="text-[12px] font-bold text-gray-500 dark:text-gray-400">Terminés / Clôturés ({savTermines.length})</span>
                  </div>
                  <div className="space-y-0.5">{savTermines.map(renderSavRow)}</div>
                </div>
              )}
              {filteredSavProjects.length === 0 && <p className="text-sm text-gray-400 py-2 text-center">Aucun SAV sur cette période</p>}
            </div>
          );
        } else if (showSummaryPanel === "soucis-historique") {
          /* ── SOUCIS MONTAGE HISTORIQUE ──────────────────────────── */
          const CAUSE_COLORS: Record<string, string> = {
            "Problème produit": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
            "Erreur de montage": "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
            "Problème chantier": "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
            "Problème livraison": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
            "Manque d'info": "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
            "Client": "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
          };

          // Années disponibles
          const soucisYears = Array.from(new Set(
            allSoucisProjects.map(p => (p.dateMontage || "").split("T")[0].slice(0, 4)).filter(Boolean)
          )).sort((a, b) => b.localeCompare(a));

          // Causes disponibles
          const soucisAllCauses = Array.from(new Set(allSoucisProjects.map(p => p.causeSoucis).filter(Boolean)));

          // Filtrage
          const filteredSoucisProjects = allSoucisProjects.filter(p => {
            const dateStr = (p.dateMontage || "").split("T")[0];
            if (soucisFilterYear && !dateStr.startsWith(soucisFilterYear)) return false;
            if (soucisFilterCause && p.causeSoucis !== soucisFilterCause) return false;
            if (soucisFilterFrom && dateStr < soucisFilterFrom) return false;
            if (soucisFilterTo && dateStr > soucisFilterTo) return false;
            return true;
          });

          const soucisActifs = filteredSoucisProjects.filter(p => p.etatCMD !== "Terminé" && p.etatCMD !== "Annulé" && p.etatCMD !== "Rapport clôturé");
          const soucisTermines = filteredSoucisProjects.filter(p => p.etatCMD === "Terminé" || p.etatCMD === "Annulé" || p.etatCMD === "Rapport clôturé");

          // Stats % par marque (fournisseur)
          const allMontageAll = [...projects, ...terminatedProjects]
            .filter((p, i, arr) => arr.findIndex(x => x.id === p.id) === i)
            .filter(p => {
              const src = (p as any)._source;
              return src !== "mesures" && src !== "sav";
            });
          // Appliquer le même filtre date/année que les soucis au dénominateur
          const allMontageFiltered = allMontageAll.filter(p => {
            const dateStr = (p.dateMontage || "").split("T")[0];
            if (soucisFilterYear && !dateStr.startsWith(soucisFilterYear)) return false;
            if (soucisFilterFrom && dateStr < soucisFilterFrom) return false;
            if (soucisFilterTo && dateStr > soucisFilterTo) return false;
            return true;
          });
          const brandList = Array.from(new Set(allSoucisProjects.flatMap(p => p.fournisseurs).filter(Boolean)));
          const brandStats = brandList.map(brand => {
            const soucisCab = filteredSoucisProjects
              .filter(p => p.fournisseurs.includes(brand))
              .reduce((s, p) => s + (p.nbCabines || 0), 0);
            const totalCab = allMontageFiltered
              .filter(p => p.fournisseurs.includes(brand))
              .reduce((s, p) => s + (p.nbCabines || 0), 0);
            const rate = totalCab > 0 ? Math.round(soucisCab / totalCab * 100) : 0;
            return { brand, soucisCab, totalCab, rate };
          }).filter(b => b.totalCab > 0).sort((a, b) => b.rate - a.rate);

          const hasFilter = !!(soucisFilterYear || soucisFilterCause || soucisFilterFrom || soucisFilterTo);

          const renderSoucisRow = (p: Project) => {
            const dateStr = (p.dateMontage || "").split("T")[0];
            const names = (p.collaborateurs || "").split(/[\s&]+/).map((n: string) => n.trim()).filter(Boolean);
            const logo = getClientLogo(p.projet);
            return (
              <Link key={p.id} href={`/projet/${p.id}?mode=dashboard`}
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl hover:bg-white/60 dark:hover:bg-white/5 transition-colors">
                <div className="flex -space-x-1 shrink-0">
                  {names.slice(0, 2).map((n: string) => (
                    <span key={n} className="w-6 h-6 rounded-full text-[8px] font-bold flex items-center justify-center border border-white dark:border-gray-800"
                      style={{ backgroundColor: getCollaboratorColor(n).bg, color: getCollaboratorColor(n).text }}>
                      {getCollaboratorInitials(n)}
                    </span>
                  ))}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    {p.ofrTM && <span className="text-[9px] font-mono text-gray-400">{p.ofrTM}</span>}
                    {dateStr && <span className="text-[9px] text-gray-400">{new Date(dateStr + "T12:00:00").toLocaleDateString("fr-CH", { day: "2-digit", month: "short", year: "2-digit" })}</span>}
                  </div>
                  <p className="text-xs text-gray-900 dark:text-gray-100 line-clamp-3 sm:line-clamp-1 font-medium">{p.projet}</p>
                  {p.causeSoucis && <p className="text-[10px] text-gray-400 mt-0.5">Cause : {p.causeSoucis}</p>}
                </div>
                {logo && <LogoImg src={logo} />}
                {p.causeSoucis && (
                  <span className={`text-[9px] font-semibold px-2 py-1 rounded-full shrink-0 whitespace-nowrap hidden sm:inline-flex ${CAUSE_COLORS[p.causeSoucis] || "bg-orange-100 text-orange-700"}`}>{p.causeSoucis}</span>
                )}
                <Badge variant="outline" className="text-[10px] shrink-0">{p.nbCabines || 0} cab.</Badge>
                <ChevronRight className="w-3.5 h-3.5 text-gray-300 shrink-0" />
              </Link>
            );
          };

          return (
            <div className="glass-card rounded-2xl p-4 space-y-3">
              {/* Header */}
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Soucis montage ({filteredSoucisProjects.length}{hasFilter ? ` / ${allSoucisCount}` : ""})
                </p>
                {terminatedLoading && <span className="text-[10px] text-gray-400 animate-pulse">Chargement…</span>}
              </div>

              {/* Stats % par marque */}
              {brandStats.length > 0 && (
                <div className="flex flex-wrap gap-1.5 py-2 border-y border-orange-100 dark:border-orange-900/30">
                  {brandStats.map(b => (
                    <div key={b.brand} className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] ${b.rate >= 20 ? "bg-red-50 dark:bg-red-900/20" : b.rate >= 10 ? "bg-orange-50 dark:bg-orange-900/20" : "bg-green-50 dark:bg-green-900/20"}`}>
                      <span className="font-medium text-gray-700 dark:text-gray-300 truncate max-w-[80px]">{b.brand}</span>
                      <span className={`font-bold tabular-nums ${b.rate >= 20 ? "text-red-600 dark:text-red-400" : b.rate >= 10 ? "text-orange-600 dark:text-orange-400" : "text-green-600 dark:text-green-400"}`}>{b.rate}%</span>
                      <span className="text-gray-400 dark:text-gray-500">{b.soucisCab}/{b.totalCab}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Filtres */}
              <div className="space-y-2">
                {/* Années */}
                <div className="flex flex-wrap gap-1">
                  <button onClick={() => setSoucisFilterYear("")}
                    className={`text-[10px] px-2.5 py-1 rounded-full border transition-colors ${!soucisFilterYear ? "bg-orange-600 text-white border-orange-600" : "border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-orange-300"}`}>
                    Tout
                  </button>
                  {soucisYears.map(y => (
                    <button key={y} onClick={() => setSoucisFilterYear(soucisFilterYear === y ? "" : y)}
                      className={`text-[10px] px-2.5 py-1 rounded-full border transition-colors ${soucisFilterYear === y ? "bg-orange-600 text-white border-orange-600" : "border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-orange-300"}`}>
                      {y}
                    </button>
                  ))}
                </div>
                {/* Cause + plage date */}
                <div className="flex flex-wrap gap-2 items-center">
                  <select value={soucisFilterCause} onChange={e => setSoucisFilterCause(e.target.value)}
                    className="text-[10px] px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-slate-700 text-gray-700 dark:text-gray-300 flex-1 min-w-[120px]">
                    <option value="">Toutes causes</option>
                    {soucisAllCauses.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <input type="date" value={soucisFilterFrom} onChange={e => setSoucisFilterFrom(e.target.value)}
                    className="text-[10px] px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-slate-700 text-gray-600 dark:text-gray-300 w-32" placeholder="Du" />
                  <input type="date" value={soucisFilterTo} onChange={e => setSoucisFilterTo(e.target.value)}
                    className="text-[10px] px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-slate-700 text-gray-600 dark:text-gray-300 w-32" placeholder="Au" />
                  {hasFilter && (
                    <button onClick={() => { setSoucisFilterYear(""); setSoucisFilterCause(""); setSoucisFilterFrom(""); setSoucisFilterTo(""); }}
                      className="text-[10px] px-2.5 py-1 rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300 hover:bg-red-200 transition-colors">
                      Effacer
                    </button>
                  )}
                </div>
              </div>

              {/* Liste */}
              {soucisActifs.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg mb-1.5 bg-orange-50 dark:bg-orange-900/20">
                    <span className="text-[12px] font-bold text-orange-700 dark:text-orange-300">En cours ({soucisActifs.length})</span>
                  </div>
                  <div className="space-y-0.5">{soucisActifs.map(renderSoucisRow)}</div>
                </div>
              )}
              {soucisTermines.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg mb-1.5 bg-gray-50 dark:bg-gray-700/30">
                    <span className="text-[12px] font-bold text-gray-500 dark:text-gray-400">Résolus ({soucisTermines.length})</span>
                  </div>
                  <div className="space-y-0.5">{soucisTermines.map(renderSoucisRow)}</div>
                </div>
              )}
              {filteredSoucisProjects.length === 0 && <p className="text-sm text-gray-400 py-2 text-center">Aucun soucis sur cette période</p>}
            </div>
          );
        }

        const isRdvAFixer = false; // rdv-a-fixer has its own return above
        const isDossiersEnCours = (showSummaryPanel as string) === "dossiers-en-cours";
        const isAFacturer = showSummaryPanel === "a-facturer";
        const isEmplacementCabines = showSummaryPanel === "emplacement-cabines";
        const dateLabel = "Date";

        return (
          <div className="glass-card rounded-2xl p-4 space-y-1.5">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{panelTitle} ({panelProjects.length})</p>
            {panelProjects.length > 0 && (
              <div className="flex items-center gap-2 px-2 py-1 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700 mb-1">
                {isRdvAFixer && <span className="w-16 shrink-0">{dateLabel}</span>}
                <span className="w-20 shrink-0">N° OFR TM</span>
                {isEmplacementCabines && <span className="w-28 shrink-0">Emplacement</span>}
                {isEmplacementCabines && <span className="w-24 shrink-0">Arrivage</span>}
                {isDossiersEnCours && <span className="w-24 shrink-0 hidden sm:block">Date offre</span>}
                {isAFacturer && <span className="w-28 shrink-0 hidden sm:block">Date</span>}
                {!isEmplacementCabines && !isAFacturer && <span className="w-20 shrink-0 hidden sm:block">N° Mes. Fourn.</span>}
                {!isEmplacementCabines && !isAFacturer && <span className="w-20 shrink-0 hidden sm:block">N° CMD Fourn.</span>}
                <span className="flex-1">Projet</span>
                {showSummaryPanel === "sav-non-traites" && <span className="w-32 shrink-0 hidden sm:block">État SAV</span>}
                <span className="w-14 text-right">Cabines</span>
              </div>
            )}
            {panelProjects.length === 0 && <p className="text-sm text-gray-400 py-2">Aucun projet</p>}

            {/* Projets en cours : liste triée par Date Offre décroissante avec séparateurs par mois */}
            {isDossiersEnCours && (() => {
              let lastMonthKey = "";
              let colorIdx = 0;
              return panelProjects.flatMap((p) => {
                const monthKey = p.dateOffre ? p.dateOffre.slice(0, 7) : "";
                const items: React.ReactNode[] = [];
                if (monthKey !== lastMonthKey) {
                  const monthLabel = monthKey
                    ? new Date(monthKey + "-15T12:00:00").toLocaleDateString("fr-CH", { month: "long", year: "numeric" })
                    : "Sans date d'offre";
                  items.push(
                    <div key={`month-${monthKey || "none"}`} className="flex items-center gap-2 pt-2 pb-0.5">
                      <div className="flex-1 h-px bg-indigo-200/70 dark:bg-indigo-700/40" />
                      <span className="text-[10px] font-semibold text-indigo-500 dark:text-indigo-400 shrink-0 px-1.5 capitalize">{monthLabel}</span>
                      <div className="flex-1 h-px bg-indigo-200/70 dark:bg-indigo-700/40" />
                    </div>
                  );
                  lastMonthKey = monthKey;
                  colorIdx = 0;
                }
                const collabField = p.collaborateurs || "";
                const names = collabField.split(" & ").map((n) => n.trim()).filter(Boolean);
                const rowBg = colorIdx % 2 === 0 ? "bg-indigo-50/50 dark:bg-indigo-950/20" : "bg-indigo-100/40 dark:bg-indigo-900/15";
                colorIdx++;
                const dateOffreStr = p.dateOffre ? new Date(p.dateOffre + "T12:00:00").toLocaleDateString("fr-CH", { day: "2-digit", month: "short", year: "2-digit" }) : "---";
                items.push(
                  <Link key={p.id} href={`/projet/${p.id}?mode=dashboard`}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-indigo-200/60 dark:hover:bg-indigo-800/30 transition-colors text-xs ${rowBg}`}>
                    <span className="w-20 shrink-0 flex flex-col justify-center gap-px">
                      {parseTMNumbers(p.ofrTM || "").length > 0
                        ? parseTMNumbers(p.ofrTM || "").map((tm, i) => (
                            <span key={i} className="font-mono text-xs leading-tight text-gray-600 dark:text-gray-300 truncate">{tm}</span>
                          ))
                        : <span className="font-mono text-xs text-gray-400">---</span>
                      }
                    </span>
                    <span className="w-24 shrink-0 font-mono text-indigo-600 dark:text-indigo-400 hidden sm:block">{dateOffreStr}</span>
                    <span className="w-20 shrink-0 font-mono text-gray-500 dark:text-gray-400 truncate hidden sm:block">{p.servMesuresFournisseurs || "---"}</span>
                    <span className="w-20 shrink-0 font-mono text-gray-500 dark:text-gray-400 truncate hidden sm:block">{p.servCmdFournisseurs || "---"}</span>
                    <span className="flex-1 min-w-0 text-xs text-gray-900 dark:text-gray-100 line-clamp-3 sm:line-clamp-1">{p.projet}</span>
                    {(() => { const logo = getClientLogo(p.projet); return logo ? (
                      <LogoImg src={logo} />
                    ) : null; })()}
                    <div className="flex -space-x-1 shrink-0">
                      {names.slice(0, 3).map((n) => (
                        <span key={n} className="w-5 h-5 rounded-full text-[7px] font-bold flex items-center justify-center border border-white dark:border-gray-800"
                          style={{ backgroundColor: getCollaboratorColor(n).bg, color: getCollaboratorColor(n).text }}>
                          {getCollaboratorInitials(n)}
                        </span>
                      ))}
                    </div>
                    <Badge variant="outline" className="text-[10px] shrink-0">{p.nbCabines || 0} cab.</Badge>
                  </Link>
                );
                return items;
              });
            })()}

            {/* À facturer : triés par date montage (ou mesures si montage vide), du plus récent au plus ancien */}
            {isAFacturer && (() => {
              // Date effective : dateMontage en priorité, sinon dateMesures
              const getEffDate = (p: Project) =>
                (p.dateMontage || "").split("T")[0] || (p.dateMesures || "").split("T")[0];
              const getEffLabel = (p: Project) =>
                (p.dateMontage || "").split("T")[0] ? "Montage" : "Mesures";

              const sorted = [...panelProjects].sort((a, b) => {
                const da = getEffDate(a);
                const db = getEffDate(b);
                if (!da && !db) return 0;
                if (!da) return 1;  // sans date → fin
                if (!db) return -1;
                return db.localeCompare(da); // plus récent en premier
              });

              let lastMonthKey = "";
              let colorIdx = 0;
              return sorted.flatMap((p) => {
                const effDate = getEffDate(p);
                const monthKey = effDate ? effDate.slice(0, 7) : "";
                const items: React.ReactNode[] = [];
                if (monthKey !== lastMonthKey) {
                  const monthLabel = monthKey
                    ? new Date(monthKey + "-15T12:00:00").toLocaleDateString("fr-CH", { month: "long", year: "numeric" })
                    : "Sans date";
                  items.push(
                    <div key={`month-${monthKey || "none"}`} className="flex items-center gap-2 pt-2 pb-0.5">
                      <div className="flex-1 h-px bg-yellow-200/70 dark:bg-yellow-700/40" />
                      <span className="text-[10px] font-semibold text-yellow-600 dark:text-yellow-400 shrink-0 px-1.5 capitalize">{monthLabel}</span>
                      <div className="flex-1 h-px bg-yellow-200/70 dark:bg-yellow-700/40" />
                    </div>
                  );
                  lastMonthKey = monthKey;
                  colorIdx = 0;
                }
                const collabField = p.collaborateurs || "";
                const names = collabField.split(" & ").map((n) => n.trim()).filter(Boolean);
                const rowBg = colorIdx % 2 === 0 ? "bg-yellow-50/50 dark:bg-yellow-950/20" : "bg-yellow-100/40 dark:bg-yellow-900/15";
                colorIdx++;
                const effLabel = getEffLabel(p);
                const effDateStr = effDate
                  ? new Date(effDate + "T12:00:00").toLocaleDateString("fr-CH", { day: "2-digit", month: "short", year: "2-digit" })
                  : "---";
                items.push(
                  <Link key={p.id} href={`/projet/${p.id}?mode=dashboard`}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-yellow-200/60 dark:hover:bg-yellow-800/30 transition-colors text-xs ${rowBg}`}>
                    <span className="w-20 shrink-0 flex flex-col justify-center gap-px">
                      {parseTMNumbers(p.ofrTM || "").length > 0
                        ? parseTMNumbers(p.ofrTM || "").map((tm, i) => (
                            <span key={i} className="font-mono text-xs leading-tight text-gray-600 dark:text-gray-300 truncate">{tm}</span>
                          ))
                        : <span className="font-mono text-xs text-gray-400">---</span>
                      }
                    </span>
                    <span className="w-28 shrink-0 flex flex-col gap-px hidden sm:flex">
                      <span className="font-mono text-yellow-600 dark:text-yellow-400">{effDateStr}</span>
                      <span className="text-[9px] text-gray-400">{effLabel}</span>
                    </span>
                    <span className="flex-1 min-w-0 text-xs text-gray-900 dark:text-gray-100 line-clamp-3 sm:line-clamp-1">{p.projet}</span>
                    {(() => { const logo = getClientLogo(p.projet); return logo ? (
                      <LogoImg src={logo} />
                    ) : null; })()}
                    <div className="flex -space-x-1 shrink-0">
                      {names.slice(0, 3).map((n) => (
                        <span key={n} className="w-5 h-5 rounded-full text-[7px] font-bold flex items-center justify-center border border-white dark:border-gray-800"
                          style={{ backgroundColor: getCollaboratorColor(n).bg, color: getCollaboratorColor(n).text }}>
                          {getCollaboratorInitials(n)}
                        </span>
                      ))}
                    </div>
                    <Badge variant="outline" className="text-[10px] shrink-0">{p.nbCabines || 0} cab.</Badge>
                  </Link>
                );
                return items;
              });
            })()}

            {/* RDV à fixer : liste simple avec colonne date */}
            {isRdvAFixer && panelProjects.map((p, idx) => {
              const isMesure = p.etatMesures === "RDV - Fixé";
              const collabField = isMesure ? (p.mesuresTraiteePar || p.collaborateurs || "") : (p.collaborateurs || "");
              const names = collabField.split(" & ").map((n) => n.trim()).filter(Boolean);
              const date = (p.dateMesures || "").split("T")[0];
              const rowBg = idx % 2 === 0
                ? "bg-blue-50/60 dark:bg-blue-950/20"
                : "bg-blue-100/60 dark:bg-blue-900/20";
              return (
                <Link key={p.id} href={`/projet/${p.id}?mode=dashboard`}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-blue-200/60 dark:hover:bg-blue-800/30 transition-colors text-xs ${rowBg}`}>
                  <span className="text-gray-400 font-mono w-16 shrink-0">
                    {date ? new Date(date + "T12:00:00").toLocaleDateString("fr-CH", { day: "2-digit", month: "short" }) : "---"}
                  </span>
                  <span className="w-20 shrink-0 font-mono text-gray-600 dark:text-gray-300 truncate">{p.ofrTM || "---"}</span>
                  <span className="w-20 shrink-0 font-mono text-gray-500 dark:text-gray-400 truncate hidden sm:block">{p.servMesuresFournisseurs || "---"}</span>
                  <span className="w-20 shrink-0 font-mono text-gray-500 dark:text-gray-400 truncate hidden sm:block">{p.servCmdFournisseurs || "---"}</span>
                  <span className="flex-1 min-w-0 text-xs text-gray-900 dark:text-gray-100 line-clamp-3 sm:line-clamp-2">{p.projet}</span>
                  {p.typeServices && p.typeServices.length > 0 && p.typeServices.flatMap((ts) => {
                    // Split "Démontage + Montage" into separate badges
                    const parts = ts.includes("+") ? ts.split("+").map((s) => s.trim()) : [ts];
                    return parts.map((part) => {
                      const tsColors: Record<string, string> = {
                        "Montages": "bg-orange-100 text-orange-700",
                        "Montage": "bg-orange-100 text-orange-700",
                        "Mesures": "bg-cyan-100 text-cyan-700",
                        "Services": "bg-emerald-100 text-emerald-700",
                        "SAV": "bg-red-100 text-red-700",
                        "Livraison": "bg-amber-100 text-amber-700",
                        "Dépannage": "bg-pink-100 text-pink-700",
                        "Démontage": "bg-rose-100 text-rose-700",
                        "Remplacement": "bg-indigo-100 text-indigo-700",
                      };
                      return <span key={part} className={`shrink-0 text-[8px] font-semibold px-1.5 py-0.5 rounded-full ${tsColors[part] || "bg-gray-100 text-gray-600"}`}>{part}</span>;
                    });
                  })}
                  {(() => { const logo = getClientLogo(p.projet); return logo ? (
                    <LogoImg src={logo} />
                  ) : null; })()}
                  {p.dateMontageEnd && (() => { const days = getWorkingDays(p.dateMontage || "", p.dateMontageEnd); return days.length > 1 ? (
                    <span className="shrink-0 text-[8px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">{days.length}j</span>
                  ) : null; })()}
                  <Badge variant="outline" className="text-[10px] shrink-0">{p.nbCabines || 0} cab.</Badge>
                </Link>
              );
            })}

            {/* Emplacement cabines : groupé par emplacement, Dépôt TM en dernier */}
            {isEmplacementCabines && (() => {
              // Palette de couleurs par emplacement
              const EMPL_COLORS: Record<string, { badge: string; header: string }> = {
                "Dépôt TM":                { badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",    header: "bg-amber-600 dark:bg-amber-700" },
                "Sur chantier":            { badge: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",    header: "bg-green-700 dark:bg-green-800" },
                "Getaz Yverdon":           { badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",        header: "bg-blue-700 dark:bg-blue-800" },
                "Getaz Bussigny":          { badge: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",header: "bg-indigo-700 dark:bg-indigo-800" },
                "Getaz Payerne":           { badge: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",            header: "bg-sky-700 dark:bg-sky-800" },
                "Dubat Villars-ste-Croix": { badge: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",header: "bg-purple-700 dark:bg-purple-800" },
                "Dubat Yverdon":           { badge: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",header: "bg-violet-700 dark:bg-violet-800" },
                "Chez sanitaire":          { badge: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",        header: "bg-teal-700 dark:bg-teal-800" },
                "Matway":                  { badge: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",header: "bg-orange-600 dark:bg-orange-700" },
                "Saneo Orbe":              { badge: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300",        header: "bg-cyan-700 dark:bg-cyan-800" },
                "Saneo Lonay":             { badge: "bg-lime-100 text-lime-700 dark:bg-lime-900/40 dark:text-lime-300",        header: "bg-lime-700 dark:bg-lime-800" },
                "Saneo - Givisiez":        { badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300", header: "bg-emerald-700 dark:bg-emerald-800" },
                "Sanitas Villars-sur-Glâne":{ badge: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",      header: "bg-rose-700 dark:bg-rose-800" },
                "Tema La Chaux-de-Fonds":  { badge: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-300", header: "bg-fuchsia-700 dark:bg-fuchsia-800" },
                "Sylroc Diffusion SA":     { badge: "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300",        header: "bg-pink-700 dark:bg-pink-800" },
              };
              const getEmplColor = (e: string) => EMPL_COLORS[e] ?? { badge: "bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-300", header: "bg-[#1e3a5f]" };

              const emplacementMap: Record<string, Project[]> = {};
              panelProjects.forEach((p) => {
                const key = p.emplacementCabine || "Sans emplacement";
                if (!emplacementMap[key]) emplacementMap[key] = [];
                emplacementMap[key].push(p);
              });
              const sortedKeys = Object.keys(emplacementMap).sort((a, b) => {
                if (a === "Dépôt TM") return 1;
                if (b === "Dépôt TM") return -1;
                return a.localeCompare(b);
              });
              return sortedKeys.map((empl) => {
                const groupProjects = emplacementMap[empl];
                const { header } = getEmplColor(empl);
                return (
                  <div key={empl} className="mb-1">
                    <div className={`flex items-center gap-2 px-3 py-2 mt-3 mb-1 rounded-lg shadow-sm ${header}`}>
                      <span className="text-[12px] font-bold text-white truncate">{empl}</span>
                      <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full font-semibold bg-white/20 text-white shrink-0">
                        {groupProjects.length} projet{groupProjects.length > 1 ? "s" : ""} · {groupProjects.reduce((s, p) => s + (p.nbCabines || 0), 0)} cab.
                      </span>
                    </div>
                    {[...groupProjects].sort((a, b) => {
                      const da = (a.arrivageTM || a.arrivageGrossiste || "");
                      const db = (b.arrivageTM || b.arrivageGrossiste || "");
                      if (!da && !db) return 0;
                      if (!da) return 1;
                      if (!db) return -1;
                      return da.localeCompare(db); // plus ancienne en premier = plus urgente
                    }).map((p, idx) => {
                      const rowBg = idx % 2 === 0
                        ? "bg-white/60 dark:bg-slate-800/40"
                        : "bg-blue-50/40 dark:bg-blue-950/15";
                      const emplacements = p.emplacementCabine ? p.emplacementCabine.split(", ") : [];
                      const arrivage = getArrivageInfo(p);
                      return (
                        <Link key={p.id} href={`/projet/${p.id}?mode=dashboard`}
                          className={`flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-blue-200/60 dark:hover:bg-blue-800/30 transition-colors text-xs ${rowBg}`}>
                          <span className="w-20 shrink-0 flex flex-col justify-center gap-px">
                            {parseTMNumbers(p.ofrTM || "").length > 0
                              ? parseTMNumbers(p.ofrTM || "").map((tm, i) => (
                                  <span key={i} className="font-mono text-xs leading-tight text-gray-600 dark:text-gray-300 truncate">{tm}</span>
                                ))
                              : <span className="font-mono text-xs text-gray-400">---</span>
                            }
                          </span>
                          <span className="w-28 shrink-0 flex flex-col gap-0.5">
                            {emplacements.length > 0
                              ? emplacements.map((e) => (
                                  <span key={e} className={`text-[9px] font-semibold px-1.5 py-0.5 rounded truncate ${getEmplColor(e).badge}`}>{e}</span>
                                ))
                              : <span className="text-[10px] text-gray-400">—</span>
                            }
                          </span>
                          {/* Arrivage date + J+ badge — juste après Emplacement */}
                          <span className="w-24 shrink-0 flex flex-col items-start gap-0.5">
                            {arrivage ? (
                              <>
                                <span className={`text-[9px] font-mono tabular-nums ${arrivage.colorClass}`}>
                                  {arrivage.label} {new Date(arrivage.date + "T12:00:00").toLocaleDateString("fr-CH", { day: "2-digit", month: "short" })}
                                </span>
                                {arrivage.days !== null && arrivage.days >= 0 && (
                                  <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${arrivage.bgClass} ${arrivage.colorClass}`}>
                                    J+{arrivage.days}
                                  </span>
                                )}
                              </>
                            ) : null}
                          </span>
                          <span className="flex-1 min-w-0 text-xs text-gray-900 dark:text-gray-100 line-clamp-3 sm:line-clamp-2">{p.projet}</span>
                          {(() => { const logo = getClientLogo(p.projet); return logo ? (
                            <LogoImg src={logo} />
                          ) : null; })()}
                          <Badge variant="outline" className="text-[10px] shrink-0">{p.nbCabines || 0} cab.</Badge>
                        </Link>
                      );
                    })}
                  </div>
                );
              });
            })()}

            {/* Autres panels : groupé par jour avec séparateurs */}
            {!isRdvAFixer && !isDossiersEnCours && !isAFacturer && !isEmplacementCabines && (() => {
              const todayStr = new Date().toISOString().split("T")[0];
              const now = new Date();
              const weekEnd = new Date(now);
              weekEnd.setDate(weekEnd.getDate() + (7 - weekEnd.getDay()));
              const weekEndStr = weekEnd.toISOString().split("T")[0];

              // Build a map of dateKey → projects, expanding multi-day projects
              const isSavPanel = showSummaryPanel === "sav-non-traites";
              const dayMap: Record<string, Project[]> = {};
              panelProjects.forEach((p) => {
                // For SAV panel: group by date SAV received, not montage date
                if (isSavPanel) {
                  const savDate = (p.dateSAVRecu || "").split("T")[0];
                  if (!savDate) {
                    if (!dayMap["no-date"]) dayMap["no-date"] = [];
                    dayMap["no-date"].push(p);
                  } else {
                    if (!dayMap[savDate]) dayMap[savDate] = [];
                    dayMap[savDate].push(p);
                  }
                  return;
                }
                const startDate = (p.dateMontage || p.dateMesures || "").split("T")[0];
                if (!startDate) {
                  if (!dayMap["no-date"]) dayMap["no-date"] = [];
                  dayMap["no-date"].push(p);
                  return;
                }
                const endDate = (p.dateMontageEnd || "").split("T")[0];
                if (endDate && endDate > startDate) {
                  // Multi-day: add to each working day
                  const days = getWorkingDays(startDate, endDate);
                  days.forEach((d) => {
                    if (!dayMap[d]) dayMap[d] = [];
                    dayMap[d].push(p);
                  });
                } else {
                  // Single day
                  if (!dayMap[startDate]) dayMap[startDate] = [];
                  dayMap[startDate].push(p);
                }
              });

              // Sort days and build grouped array
              const sortedDays = Object.keys(dayMap).sort((a, b) => a === "no-date" ? 1 : b === "no-date" ? -1 : a.localeCompare(b));
              const grouped = sortedDays.map((dateKey) => {
                const d = dateKey !== "no-date" ? new Date(dateKey + "T12:00:00") : null;
                const label = d ? d.toLocaleDateString("fr-CH", { weekday: "long", day: "numeric", month: "long" }) : "Date non définie";
                return {
                  dateKey,
                  dateLabel: label.charAt(0).toUpperCase() + label.slice(1),
                  isToday: dateKey === todayStr,
                  isThisWeek: dateKey >= todayStr && dateKey <= weekEndStr,
                  projects: dayMap[dateKey],
                };
              });

              return grouped.map((group) => (
                <div key={group.dateKey} className="mb-1">
                  <div className={`flex items-center gap-2 px-3 py-2 mt-3 mb-1 rounded-lg shadow-sm ${
                    group.isToday
                      ? "bg-green-600 dark:bg-green-700"
                      : group.isThisWeek
                        ? "bg-[#1e3a5f] dark:bg-[#1e3a5f]"
                        : "bg-slate-500 dark:bg-slate-600"
                  }`}>
                    <span className="text-[12px] font-bold text-white">
                      {group.isToday ? "📍 Aujourd'hui" : group.dateLabel}
                    </span>
                    <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full font-semibold bg-white/20 text-white">
                      {group.projects.length} projet{group.projects.length > 1 ? "s" : ""} · {group.projects.reduce((s, p) => s + (p.nbCabines || 0), 0)} cab.
                    </span>
                  </div>
                  {group.projects.map((p, idx) => {
                    const isMesure = showSummaryPanel === "mesures-today" || (p as any)._source === "mesures" || p.etatMesures === "RDV - Fixé";
                    const collabField = isMesure ? (p.mesuresTraiteePar || p.collaborateurs || "") : (p.collaborateurs || "");
                    const names = collabField.split(" & ").map((n) => n.trim()).filter(Boolean);
                    const rowBg = idx % 2 === 0
                      ? "bg-white/60 dark:bg-slate-800/40"
                      : "bg-blue-50/40 dark:bg-blue-950/15";
                    const bestLogo = getBestLogo(p.projet, p.fournisseurs || []);
                    return (
                      <Link key={p.id} href={`/projet/${p.id}?mode=dashboard`}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-blue-200/60 dark:hover:bg-blue-800/30 transition-colors text-xs ${rowBg}`}>
                        <span className="w-20 shrink-0 flex flex-col justify-center gap-px">
                        {parseTMNumbers(p.ofrTM || "").length > 0
                          ? parseTMNumbers(p.ofrTM || "").map((tm, i) => (
                              <span key={i} className="font-mono text-xs leading-tight text-gray-600 dark:text-gray-300 truncate">{tm}</span>
                            ))
                          : <span className="font-mono text-xs text-gray-400">---</span>
                        }
                      </span>
                        <span className="w-20 shrink-0 font-mono text-gray-500 dark:text-gray-400 truncate hidden sm:block">{p.servMesuresFournisseurs || "---"}</span>
                        <span className="w-20 shrink-0 font-mono text-gray-500 dark:text-gray-400 truncate hidden sm:block">{p.servCmdFournisseurs || "---"}</span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-xs font-semibold text-gray-900 dark:text-gray-100 line-clamp-3 sm:line-clamp-2">{p.projet}</span>
                          {p.nomChantier && p.nomChantier !== p.projet && (
                            <span className="block text-[10px] text-gray-400 dark:text-gray-500 line-clamp-1 mt-0">{p.nomChantier}</span>
                          )}
                        </span>
                        {(showSummaryPanel === "rdv-fixe") && (
                          <span className="flex items-center gap-1 shrink-0">
                            {isMesure ? (
                              <span className="text-[8px] font-semibold px-1.5 py-0.5 rounded-full bg-cyan-100 text-cyan-700">Mesures</span>
                            ) : (
                              (p.typeServices && p.typeServices.length > 0) ? p.typeServices.flatMap((ts) => {
                                const parts = ts.includes("+") ? ts.split("+").map((s) => s.trim()) : [ts];
                                return parts.map((part) => {
                                  const tsColors: Record<string, string> = {
                                    "Montages": "bg-orange-100 text-orange-700",
                                    "Montage": "bg-orange-100 text-orange-700",
                                    "Services": "bg-emerald-100 text-emerald-700",
                                    "SAV": "bg-red-100 text-red-700",
                                    "Livraison": "bg-amber-100 text-amber-700",
                                    "Dépannage": "bg-pink-100 text-pink-700",
                                    "Démontage": "bg-rose-100 text-rose-700",
                                    "Remplacement": "bg-indigo-100 text-indigo-700",
                                  };
                                  return <span key={part} className={`text-[8px] font-semibold px-1.5 py-0.5 rounded-full ${tsColors[part] || "bg-gray-100 text-gray-600"}`}>{part}</span>;
                                });
                              }) : (
                                <span className="text-[8px] font-semibold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700">Montages</span>
                              )
                            )}
                            {/* Initiales collaborateurs */}
                            {names.length > 0 && (
                              <span className="flex -space-x-1">
                                {names.slice(0, 3).map((n) => (
                                  <span key={n} className="w-5 h-5 rounded-full text-[7px] font-bold flex items-center justify-center border border-white dark:border-gray-800"
                                    style={{ backgroundColor: getCollaboratorColor(n).bg, color: getCollaboratorColor(n).text }}>
                                    {getCollaboratorInitials(n)}
                                  </span>
                                ))}
                              </span>
                            )}
                          </span>
                        )}
                        {/* Logo fournisseur/grossiste — placé avant les initiales */}
                        {bestLogo && (
                          <LogoImg src={bestLogo} />
                        )}
                        {/* Initiales collaborateurs — visibles sur toutes les vues du rendu générique */}
                        {(showSummaryPanel === "week" || showSummaryPanel === "today" || showSummaryPanel === "mesures-today" || showSummaryPanel === "sav-today" || showSummaryPanel === "services-today") && names.length > 0 && (
                          <div className="flex -space-x-1 shrink-0">
                            {names.slice(0, 3).map((n) => (
                              <span key={n} className="w-5 h-5 rounded-full text-[7px] font-bold flex items-center justify-center border border-white dark:border-gray-800"
                                style={{ backgroundColor: getCollaboratorColor(n).bg, color: getCollaboratorColor(n).text }}>
                                {getCollaboratorInitials(n)}
                              </span>
                            ))}
                          </div>
                        )}
                        {p.dateMontageEnd && (() => { const days = getWorkingDays(p.dateMontage || "", p.dateMontageEnd); return days.length > 1 ? (
                          <span className="shrink-0 text-[8px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">{days.length}j</span>
                        ) : null; })()}
                        {/* État SAV inline edit + J+x badge — visible uniquement dans le panel SAV non traités */}
                        {showSummaryPanel === "sav-non-traites" && (() => {
                          const currentEtat = savEtatOverride[p.id] ?? p.etatSAV ?? "";
                          const isTermine = currentEtat === "Terminé";
                          // Calcul J+x depuis dateSAVRecu
                          const savRecuStr = (p.dateSAVRecu || "").split("T")[0];
                          let jPlusDays: number | null = null;
                          if (savRecuStr) {
                            const savDate = new Date(savRecuStr + "T12:00:00");
                            const refDate = isTermine ? savDate : new Date();
                            jPlusDays = Math.floor((refDate.getTime() - savDate.getTime()) / (1000 * 60 * 60 * 24));
                          }
                          const jPlusBadgeClass = jPlusDays === null ? "" :
                            jPlusDays <= 5 ? "bg-green-100 text-green-700" :
                            jPlusDays <= 11 ? "bg-orange-100 text-orange-700" :
                            "bg-red-100 text-red-700";
                          if (editingSavId === p.id) {
                            return (
                              <div className="shrink-0 flex items-center gap-1 relative z-10" onClick={e => e.preventDefault()}>
                                {jPlusDays !== null && (
                                  <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${jPlusBadgeClass}`}>J+{jPlusDays}</span>
                                )}
                                <select
                                  autoFocus
                                  value={currentEtat}
                                  onChange={e => updateSavEtat(p.id, e.target.value)}
                                  onBlur={() => setEditingSavId(null)}
                                  className="text-[10px] px-2 py-1 rounded-lg border border-blue-300 bg-white dark:bg-slate-700 text-gray-700 dark:text-gray-200 shadow-md outline-none"
                                >
                                  {SAV_ETAT_OPTIONS.map(opt => (
                                    <option key={opt} value={opt}>{opt}</option>
                                  ))}
                                </select>
                              </div>
                            );
                          }
                          return (
                            <div className="shrink-0 flex items-center gap-1" onClick={e => e.preventDefault()}>
                              {jPlusDays !== null && (
                                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${jPlusBadgeClass}`}>J+{jPlusDays}</span>
                              )}
                              <button
                                type="button"
                                onClick={e => { e.preventDefault(); setEditingSavId(p.id); }}
                                className={`shrink-0 text-[9px] font-semibold px-2 py-1 rounded-full whitespace-nowrap hover:opacity-80 transition-opacity ${SAV_ETAT_COLORS[currentEtat] || "bg-gray-100 text-gray-400"}`}
                              >
                                {currentEtat || "—"}
                              </button>
                            </div>
                          );
                        })()}
                        <Badge variant="outline" className="text-[10px] shrink-0">{p.nbCabines || 0} cab.</Badge>
                      </Link>
                    );
                  })}
                </div>
              ));
            })()}
          </div>
        );
      })()}

      {/* (Heures de travail et Stats monteur déplacés dans le panel Monteurs actifs) */}
      {false && (() => {
        const allProjects = [...projects, ...terminatedProjects];
        const { fromStr, toStr, label } = getDateRangeForFilter(workFilter, workFrom, workTo, workMonth, workYear);

        // --- Individuel : heures perso (solo + cabines nommées sur projets multi) ---
        const soloData = COLLABORATEURS_LIST.map((name) => ({
          name,
          colors: getCollaboratorColor(name),
          minutes: getIndividualHoursForCollab(allProjects, name, fromStr, toStr),
        })).filter((c) => c.minutes > 0);

        // --- Binômes / Équipes : uniquement les entrées partagées (non nommées) ---
        // Entrées nommées ("YYYY-MM-DD Prénom HH:MM") → déjà comptées en Individuel
        const groupMap = new Map<string, number>();
        for (const p of allProjects) {
          const collab = (p.collaborateurs || "").trim();
          if (!collab || (!collab.includes("&") && !collab.toLowerCase().includes("team"))) continue;
          const ha = p.heureArrivee || "";
          const hd = p.heureDepart || "";
          if (!ha && !hd) continue;
          let mins = 0;
          if (ha.includes("|") || hd.includes("|")) {
            const arrParts = ha.split("|").map(s => s.trim()).filter(Boolean);
            const depParts = hd.split("|").map(s => s.trim()).filter(Boolean);
            for (let i = 0; i < Math.max(arrParts.length, depParts.length); i++) {
              const aPart = arrParts[i] || "";
              const dPart = depParts[i] || "";
              // Entrée nommée → va en Individuel, pas ici
              if (isNamedEntry(aPart) || isNamedEntry(dPart)) continue;
              const aTime = extractHHMM(aPart) || aPart.split(/\s+/).at(-1) || "";
              const dTime = extractHHMM(dPart) || dPart.split(/\s+/).at(-1) || "";
              const entryDate = p.dateMontage?.split("T")[0] || "";
              if (fromStr && entryDate < fromStr) continue;
              if (toStr && entryDate > toStr) continue;
              const a = parseTimeToMinutes(aTime);
              const d = parseTimeToMinutes(dTime);
              if (a >= 0 && d >= 0 && d > a) mins += d - a;
            }
          } else {
            // Entrée simple (une seule heure pour tout le binôme) → Binômes
            const dateStr = p.dateMontage?.split("T")[0] || "";
            if (fromStr && dateStr < fromStr) continue;
            if (toStr && dateStr > toStr) continue;
            const a = parseTimeToMinutes(extractHHMM(ha) || ha);
            const d = parseTimeToMinutes(extractHHMM(hd) || hd);
            if (a >= 0 && d >= 0 && d > a) mins += d - a;
          }
          if (mins > 0) groupMap.set(collab, (groupMap.get(collab) || 0) + mins);
        }
        const groupData = Array.from(groupMap.entries()).sort((a, b) => b[1] - a[1]);

        const hasData = soloData.length > 0 || groupData.length > 0;

        const currentYear = new Date().getFullYear();
        const years = Array.from({ length: 4 }, (_, i) => currentYear - i);
        return (
          <div className="glass-card rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Heures de travail
              </p>
              {terminatedLoading && <span className="text-[10px] text-gray-400 animate-pulse">Chargement...</span>}
            </div>

            {/* Filtres */}
            <div className="flex flex-wrap gap-1.5">
              {(["semaine", "mois", "annee", "custom"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setWorkFilter(f)}
                  className={`text-[10px] font-medium px-2.5 py-1 rounded-full border transition-colors ${
                    workFilter === f
                      ? "bg-blue-600 text-white border-blue-600"
                      : "border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-blue-300"
                  }`}
                >
                  {f === "semaine" ? "Semaine" : f === "mois" ? "Mois" : f === "annee" ? "Année" : "Plage"}
                </button>
              ))}
            </div>

            {/* Contrôles selon le filtre */}
            {workFilter === "mois" && (
              <input
                type="month"
                value={workMonth}
                onChange={(e) => setWorkMonth(e.target.value)}
                className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 px-2.5 py-1.5"
              />
            )}
            {workFilter === "annee" && (
              <div className="flex flex-wrap gap-1.5">
                {years.map((y) => (
                  <button
                    key={y}
                    onClick={() => setWorkYear(String(y))}
                    className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                      workYear === String(y)
                        ? "bg-blue-600 text-white border-blue-600"
                        : "border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-blue-300"
                    }`}
                  >
                    {y}
                  </button>
                ))}
              </div>
            )}
            {workFilter === "custom" && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[10px] text-gray-400 mb-0.5">Du</p>
                  <input
                    type="date"
                    value={workFrom}
                    onChange={(e) => setWorkFrom(e.target.value)}
                    className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 px-2 py-1.5"
                  />
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 mb-0.5">Au</p>
                  <input
                    type="date"
                    value={workTo}
                    onChange={(e) => setWorkTo(e.target.value)}
                    className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 px-2 py-1.5"
                  />
                </div>
              </div>
            )}

            {/* Résultats */}
            <p className="text-[10px] text-gray-400 -mb-1">{label}</p>

            {!hasData ? (
              <p className="text-xs text-gray-400 text-center py-2">Aucune heure enregistrée sur cette période</p>
            ) : (
              <>
                {/* --- Section Individuel --- */}
                {soloData.length > 0 && (
                  <>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Individuel</p>
                    {soloData.map((c) => (
                      <div key={c.name} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                            style={{ backgroundColor: c.colors.bg, color: c.colors.text }}
                          >
                            {getCollaboratorInitials(c.name)}
                          </div>
                          <span className="text-sm text-gray-700 dark:text-gray-300">{c.name}</span>
                        </div>
                        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{fmtMin(c.minutes)}</span>
                      </div>
                    ))}
                  </>
                )}

                {/* --- Section Binômes & Équipes (travail en groupe uniquement) --- */}
                {groupData.length > 0 && (
                  <>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mt-1">Binômes & Équipes</p>
                    {groupData.map(([name, mins]) => {
                      const names = name.split("&").map(n => n.trim());
                      return (
                        <div key={name} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="flex -space-x-1.5">
                              {names.slice(0, 4).map((n) => {
                                const c = getCollaboratorColor(n);
                                return (
                                  <div key={n} className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 border border-white dark:border-slate-800"
                                    style={{ backgroundColor: c.dot, color: "#fff" }}>
                                    {getCollaboratorInitials(n)}
                                  </div>
                                );
                              })}
                            </div>
                            <span className="text-sm text-gray-700 dark:text-gray-300">{name}</span>
                          </div>
                          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{fmtMin(mins)}</span>
                        </div>
                      );
                    })}
                  </>
                )}
              </>
            )}
          </div>
        );
      })()}
    </div>
  );
}

// --- Main component ---

// ─── Dashboard collaborateur (non-admin) ─────────────────────────────────────
function CollaborateurDashboard({ userName, projects }: { userName: string; projects: Project[] }) {
  const firstName = userName.split(" ")[0];
  const colors = getCollaboratorColor(firstName);
  const todayStr = getTodayStr();
  const weekEndStr = getWeekEndStr();
  const thisWeekEndStr = getThisWeekEndStr();

  // ── État ──────────────────────────────────────────────────────────────────
  type CollabPanel = "mesures-today" | "montages-today" | "sav-today" | "services-today" |
    "rapports-attente" | "projets-en-cours" | "emplacement-cabines";
  const [showPanel, setShowPanel] = useState<CollabPanel | null>(null);
  const [allActiveProjects, setAllActiveProjects] = useState<Project[]>([]);
  const [loadingActive, setLoadingActive] = useState(false);

  useEffect(() => {
    setLoadingActive(true);
    fetch("/api/projects/all-active")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setAllActiveProjects(data); })
      .catch(() => {})
      .finally(() => setLoadingActive(false));
  }, []);

  // ── Mes projets ───────────────────────────────────────────────────────────
  const myProjects = projects.filter((p) => {
    const source = getProjectSource(p);
    if (source === "mesures") return matchesCollaborator(p.mesuresTraiteePar || "", firstName);
    return matchesCollaborator(p.collaborateurs || "", firstName);
  });
  const getDate = (p: Project) => p.dateMontage || p.dateMesures || "";

  const todayProjects = myProjects.filter((p) => projectSpansDate(p, todayStr));
  const thisWeekProjects = myProjects
    .filter((p) => { if (todayProjects.includes(p)) return false; return projectActiveDuringRange(p, todayStr, thisWeekEndStr); })
    .sort((a, b) => getDate(a).localeCompare(getDate(b)));
  const nextWeekProjects = myProjects
    .filter((p) => { if (todayProjects.includes(p) || thisWeekProjects.includes(p)) return false; return projectActiveDuringRange(p, thisWeekEndStr, weekEndStr); })
    .sort((a, b) => getDate(a).localeCompare(getDate(b)));

  const allUpcoming = [...todayProjects, ...thisWeekProjects, ...nextWeekProjects];
  const myCabinesBySource = countCabinesBySource(allUpcoming, firstName);
  const totalCabines = Object.values(myCabinesBySource).reduce((s, v) => s + v, 0);
  const mySummary = formatCabinesSummary(myCabinesBySource);

  // ── Stats boutons filtrés (mes projets uniquement) ─────────────────────────
  const mesuresTodayMine = myProjects.filter((p) =>
    (p as any)._source === "mesures" && (p.dateMesures || "").split("T")[0] === todayStr
  );
  const montagesTodayMine = myProjects.filter((p) =>
    (p as any)._source === "montage" && projectSpansDate(p, todayStr)
  );
  const servicesTodayMine = myProjects.filter((p) =>
    (p as any)._source === "services" && (p.dateMontage || "").split("T")[0] === todayStr
  );
  const savTodayMine = myProjects.filter((p) =>
    p.etatSAV === "RDV fixé" && (p.dateRDVSAV || "").split("T")[0] === todayStr
  );
  const rapportsAttenteMine = myProjects.filter((p) => {
    const src = (p as any)._source;
    if (src === "mesures" || src === "sav") return false;
    const dateStr = (p.dateMontage || "").split("T")[0];
    if (!dateStr || dateStr > todayStr) return false;
    const cloture = (p.rapportDeMontage || "").toLowerCase().includes("clôt") ||
                    (p.rapportDeMontage || "").toLowerCase().includes("clot");
    return !cloture;
  }).sort((a, b) => ((b.dateMontage || "").split("T")[0]).localeCompare((a.dateMontage || "").split("T")[0]));

  // ── Projets en cours — TOUS (exception) ───────────────────────────────────
  const dossiersEnCoursTous = allActiveProjects
    .filter((p) => p.etatCMD !== "Annulé" && p.etatCMD !== "Terminé")
    .sort((a, b) => {
      const da = a.dateOffre || ""; const db = b.dateOffre || "";
      if (!da && !db) return 0; if (!da) return 1; if (!db) return -1;
      return db.localeCompare(da);
    });
  const dossiersEnCoursCount = dossiersEnCoursTous.length;
  const dossiersEnCoursCabines = dossiersEnCoursTous.reduce((sum, p) => sum + (p.nbCabines || 0), 0);

  // ── Emplacement cabines — TOUS (exception) ────────────────────────────────
  const emplacementAll = projects.filter((p) =>
    p.etatCMD === "Cabine à aller chercher" || p.etatCMD === "Récéptionné - RDV à fixer"
  );
  const emplacementCount = emplacementAll.length;
  const emplacementDepotTM = emplacementAll.filter((p) => p.emplacementCabine === "Dépôt TM").reduce((s, p) => s + (p.nbCabines || 0), 0);
  const emplacementAutres = emplacementAll.filter((p) => p.emplacementCabine !== "Dépôt TM").reduce((s, p) => s + (p.nbCabines || 0), 0);

  if (myProjects.length === 0) return null;

  const togglePanel = (panel: CollabPanel) => setShowPanel((prev) => prev === panel ? null : panel);

  const btnCls = (panel: CollabPanel, ring: string) =>
    `relative glass-card rounded-2xl p-2 sm:p-3 flex flex-col items-center hover:shadow-lg active:scale-95 transition-all w-full h-full ${
      showPanel === panel
        ? `ring-2 ring-offset-2 ${ring} shadow-xl scale-[1.04] z-10`
        : showPanel !== null ? "opacity-40 scale-[0.97]" : ""
    }`;

  const panelHeader = (icon: React.ReactNode, label: string, color: string, count?: number) => (
    <div className="flex items-center justify-between mb-3">
      <p className={`text-sm font-semibold ${color} flex items-center gap-1.5`}>
        {icon} {label}
        {count !== undefined && <span className="text-xs font-normal text-gray-400">({count})</span>}
      </p>
      <button onClick={() => setShowPanel(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
        <X className="w-4 h-4" />
      </button>
    </div>
  );

  const emptyMsg = (msg: string) => (
    <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">{msg}</p>
  );

  const projectList = (list: Project[]) => (
    <div className="space-y-1.5">
      {list.map((p) => <ProjectRow key={p.id} project={p} colors={colors} />)}
    </div>
  );

  const weekSeparator = (projects: Project[]) => {
    let lastDay = "";
    return projects.flatMap((p) => {
      const dayKey = (p.dateMontage || p.dateMesures || "").split("T")[0];
      const items: React.ReactNode[] = [];
      if (dayKey !== lastDay && lastDay !== "") {
        items.push(
          <div key={`sep-${dayKey}`} className="flex items-center gap-2 pt-1">
            <div className="flex-1 h-px bg-gray-200/80 dark:bg-gray-700/60" />
            <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium shrink-0 px-1">
              {dayKey ? new Date(dayKey + "T12:00:00").toLocaleDateString("fr-CH", { weekday: "short", day: "numeric", month: "short" }) : ""}
            </span>
            <div className="flex-1 h-px bg-gray-200/80 dark:bg-gray-700/60" />
          </div>
        );
      }
      lastDay = dayKey;
      items.push(<WeekProjectRow key={p.id} project={p} />);
      return items;
    });
  };

  return (
    <div className="mb-6 space-y-4">
      {/* En-tête */}
      <div className="glass-card rounded-2xl p-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold"
            style={{ backgroundColor: colors.bg, color: colors.text }}>
            {getCollaboratorInitials(firstName)}
          </div>
          <div className="flex-1">
            <p className="font-semibold text-gray-900 dark:text-gray-100">Bonjour {firstName} 👋</p>
            <p className="text-xs font-medium text-blue-500 dark:text-blue-400 capitalize">
              {new Date().toLocaleDateString("fr-CH", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {todayProjects.length > 0
                ? `${todayProjects.length} intervention${todayProjects.length > 1 ? "s" : ""} aujourd'hui`
                : "Aucune intervention aujourd'hui"}
            </p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 italic mt-0.5 leading-tight">"{getDailyQuote(firstName)}"</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold" style={{ color: colors.text }}>{totalCabines}</p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500">cab. à venir</p>
            {mySummary && <p className="text-[9px] text-gray-400 mt-0.5">{mySummary}</p>}
          </div>
        </div>
      </div>

      {/* ── Boutons stats ── */}
      <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
        {/* Mesures aujourd'hui */}
        <button onClick={() => togglePanel("mesures-today")} className={btnCls("mesures-today", "ring-cyan-400")}>
          <span className="absolute top-0 left-0 w-7 h-7 rounded-tl-2xl rounded-br-xl bg-cyan-100/80 dark:bg-cyan-900/30 flex items-center justify-center">
            <Ruler className="w-3.5 h-3.5 text-cyan-500 dark:text-cyan-400" />
          </span>
          <p className="text-lg sm:text-2xl font-bold text-cyan-600 dark:text-cyan-400 mt-1">{mesuresTodayMine.length}</p>
          <p className="text-[8px] sm:text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 leading-tight text-center">Mesures<br/>aujourd'hui</p>
          <p className="text-[7px] sm:text-[9px] text-gray-400 dark:text-gray-500 mt-0.5">{mesuresTodayMine.reduce((s, p) => s + (p.nbCabines || 0), 0)} cab.</p>
        </button>

        {/* Montages aujourd'hui */}
        <button onClick={() => togglePanel("montages-today")} className={btnCls("montages-today", "ring-blue-400")}>
          <span className="absolute top-0 left-0 w-7 h-7 rounded-tl-2xl rounded-br-xl bg-blue-100/80 dark:bg-blue-900/30 flex items-center justify-center">
            <Wrench className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
          </span>
          <p className="text-lg sm:text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">{montagesTodayMine.length}</p>
          <p className="text-[8px] sm:text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 leading-tight text-center">Montages<br/>aujourd'hui</p>
          <p className="text-[7px] sm:text-[9px] text-gray-400 dark:text-gray-500 mt-0.5 invisible" aria-hidden="true">0</p>
        </button>

        {/* SAV aujourd'hui */}
        <button onClick={() => togglePanel("sav-today")} className={btnCls("sav-today", "ring-red-400")}>
          <span className="absolute top-0 left-0 w-7 h-7 rounded-tl-2xl rounded-br-xl bg-red-100/80 dark:bg-red-900/30 flex items-center justify-center">
            <AlertTriangle className="w-3.5 h-3.5 text-red-500 dark:text-red-400" />
          </span>
          <p className="text-lg sm:text-2xl font-bold text-red-600 dark:text-red-400 mt-1">{savTodayMine.length}</p>
          <p className="text-[8px] sm:text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 leading-tight text-center">SAV<br/>aujourd'hui</p>
          <p className="text-[7px] sm:text-[9px] text-gray-400 dark:text-gray-500 mt-0.5 invisible" aria-hidden="true">0</p>
        </button>

        {/* Services aujourd'hui */}
        <button onClick={() => togglePanel("services-today")} className={btnCls("services-today", "ring-violet-400")}>
          <span className="absolute top-0 left-0 w-7 h-7 rounded-tl-2xl rounded-br-xl bg-violet-100/80 dark:bg-violet-900/30 flex items-center justify-center">
            <Settings className="w-3.5 h-3.5 text-violet-500 dark:text-violet-400" />
          </span>
          <p className="text-lg sm:text-2xl font-bold text-violet-600 dark:text-violet-400 mt-1">{servicesTodayMine.length}</p>
          <p className="text-[8px] sm:text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 leading-tight text-center">Services<br/>aujourd'hui</p>
          <p className="text-[7px] sm:text-[9px] text-gray-400 dark:text-gray-500 mt-0.5">{servicesTodayMine.reduce((s, p) => s + (p.nbCabines || 0), 0)} cab.</p>
        </button>

        {/* Rapports en attente */}
        <button onClick={() => togglePanel("rapports-attente")} className={btnCls("rapports-attente", "ring-orange-400")}>
          <span className="absolute top-0 left-0 w-7 h-7 rounded-tl-2xl rounded-br-xl bg-orange-100/80 dark:bg-orange-900/30 flex items-center justify-center">
            <Clock className="w-3.5 h-3.5 text-orange-500 dark:text-orange-400" />
          </span>
          <p className="text-lg sm:text-2xl font-bold text-orange-600 dark:text-orange-400 mt-1">{rapportsAttenteMine.length}</p>
          <p className="text-[8px] sm:text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 leading-tight text-center">Rapports<br/>en attente</p>
          <p className="text-[7px] sm:text-[9px] text-gray-400 dark:text-gray-500 mt-0.5 invisible" aria-hidden="true">0</p>
        </button>

        {/* Projets en cours — TOUS */}
        <button onClick={() => togglePanel("projets-en-cours")} className={btnCls("projets-en-cours", "ring-indigo-400")}>
          <span className="absolute top-0 left-0 w-7 h-7 rounded-tl-2xl rounded-br-xl bg-indigo-100/80 dark:bg-indigo-900/30 flex items-center justify-center">
            <FolderOpen className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
          </span>
          <p className="text-lg sm:text-2xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">
            {loadingActive ? <span className="animate-pulse text-base">…</span> : dossiersEnCoursCount}
          </p>
          <p className="text-[8px] sm:text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 leading-tight text-center">Projets<br/>en cours</p>
          <p className="text-[7px] sm:text-[9px] text-indigo-400 dark:text-indigo-500 mt-0.5">{dossiersEnCoursCabines ? `${dossiersEnCoursCabines} cab.` : <span className="invisible">0</span>}</p>
        </button>

        {/* Emplacement cabines — TOUS */}
        <button onClick={() => togglePanel("emplacement-cabines")} className={btnCls("emplacement-cabines", "ring-sky-400")}>
          <span className="absolute top-0 left-0 w-7 h-7 rounded-tl-2xl rounded-br-xl bg-sky-100/80 dark:bg-sky-900/30 flex items-center justify-center">
            <MapPin className="w-3.5 h-3.5 text-sky-500 dark:text-sky-400" />
          </span>
          <p className="text-lg sm:text-2xl font-bold text-sky-600 dark:text-sky-400 mt-1">{emplacementCount}</p>
          <p className="text-[8px] sm:text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 leading-tight text-center">Emplacement<br/>cabines</p>
          <div className="flex flex-col items-center mt-0.5">
            <p className="text-[7px] sm:text-[9px] text-sky-500 leading-tight">À cherch. : <span className="font-semibold">{emplacementAutres}</span></p>
            <p className="text-[7px] sm:text-[9px] text-amber-500 leading-tight">Dépôt TM : <span className="font-semibold">{emplacementDepotTM}</span></p>
          </div>
        </button>
      </div>

      {/* ── Panneau détail ── */}
      {showPanel && (
        <div className="glass-card rounded-2xl p-4 space-y-2">
          {showPanel === "mesures-today" && (
            <>
              {panelHeader(<Ruler className="w-4 h-4" />, "Mesures aujourd'hui", "text-cyan-700 dark:text-cyan-300")}
              {mesuresTodayMine.length === 0 ? emptyMsg("Aucune mesure aujourd'hui") : projectList(mesuresTodayMine)}
            </>
          )}
          {showPanel === "montages-today" && (
            <>
              {panelHeader(<Wrench className="w-4 h-4" />, "Montages aujourd'hui", "text-blue-700 dark:text-blue-300")}
              {montagesTodayMine.length === 0 ? emptyMsg("Aucun montage aujourd'hui") : projectList(montagesTodayMine)}
            </>
          )}
          {showPanel === "sav-today" && (
            <>
              {panelHeader(<AlertTriangle className="w-4 h-4" />, "SAV aujourd'hui", "text-red-700 dark:text-red-300")}
              {savTodayMine.length === 0 ? emptyMsg("Aucun SAV aujourd'hui") : projectList(savTodayMine)}
            </>
          )}
          {showPanel === "services-today" && (
            <>
              {panelHeader(<Settings className="w-4 h-4" />, "Services aujourd'hui", "text-violet-700 dark:text-violet-300")}
              {servicesTodayMine.length === 0 ? emptyMsg("Aucun service aujourd'hui") : projectList(servicesTodayMine)}
            </>
          )}
          {showPanel === "rapports-attente" && (
            <>
              {panelHeader(<Clock className="w-4 h-4" />, "Rapports en attente", "text-orange-700 dark:text-orange-300", rapportsAttenteMine.length)}
              {rapportsAttenteMine.length === 0 ? emptyMsg("Aucun rapport en attente 🎉") : projectList(rapportsAttenteMine)}
            </>
          )}
          {showPanel === "projets-en-cours" && (
            <>
              {panelHeader(<FolderOpen className="w-4 h-4" />, "Projets en cours", "text-indigo-700 dark:text-indigo-300", dossiersEnCoursCount)}
              {loadingActive
                ? <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
                : dossiersEnCoursTous.length === 0
                  ? emptyMsg("Aucun projet en cours")
                  : <div className="space-y-1.5 max-h-96 overflow-y-auto">{dossiersEnCoursTous.map((p) => <ProjectRow key={p.id} project={p} colors={colors} />)}</div>
              }
            </>
          )}
          {showPanel === "emplacement-cabines" && (
            <>
              {panelHeader(<MapPin className="w-4 h-4" />, "Emplacement cabines", "text-sky-700 dark:text-sky-300", emplacementCount)}
              {emplacementAll.length === 0 ? emptyMsg("Aucune cabine à placer") : (() => {
                // Même palette de couleurs que la vue admin
                const EMPL_COLORS: Record<string, { badge: string; header: string }> = {
                  "Dépôt TM":                { badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",    header: "bg-amber-600 dark:bg-amber-700" },
                  "Sur chantier":            { badge: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",    header: "bg-green-700 dark:bg-green-800" },
                  "Getaz Yverdon":           { badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",        header: "bg-blue-700 dark:bg-blue-800" },
                  "Getaz Bussigny":          { badge: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",header: "bg-indigo-700 dark:bg-indigo-800" },
                  "Getaz Payerne":           { badge: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",            header: "bg-sky-700 dark:bg-sky-800" },
                  "Dubat Villars-ste-Croix": { badge: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",header: "bg-purple-700 dark:bg-purple-800" },
                  "Dubat Yverdon":           { badge: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",header: "bg-violet-700 dark:bg-violet-800" },
                  "Chez sanitaire":          { badge: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",        header: "bg-teal-700 dark:bg-teal-800" },
                  "Matway":                  { badge: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",header: "bg-orange-600 dark:bg-orange-700" },
                  "Saneo Orbe":              { badge: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300",        header: "bg-cyan-700 dark:bg-cyan-800" },
                  "Saneo Lonay":             { badge: "bg-lime-100 text-lime-700 dark:bg-lime-900/40 dark:text-lime-300",        header: "bg-lime-700 dark:bg-lime-800" },
                  "Saneo - Givisiez":        { badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300", header: "bg-emerald-700 dark:bg-emerald-800" },
                  "Sanitas Villars-sur-Glâne":{ badge: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",      header: "bg-rose-700 dark:bg-rose-800" },
                  "Tema La Chaux-de-Fonds":  { badge: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-300", header: "bg-fuchsia-700 dark:bg-fuchsia-800" },
                  "Sylroc Diffusion SA":     { badge: "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300",        header: "bg-pink-700 dark:bg-pink-800" },
                };
                const getEmplColor = (e: string) => EMPL_COLORS[e] ?? { badge: "bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-300", header: "bg-[#1e3a5f]" };

                // Grouper par emplacement
                const emplacementMap: Record<string, typeof emplacementAll> = {};
                emplacementAll.forEach((p) => {
                  const key = p.emplacementCabine || "Sans emplacement";
                  if (!emplacementMap[key]) emplacementMap[key] = [];
                  emplacementMap[key].push(p);
                });
                const sortedKeys = Object.keys(emplacementMap).sort((a, b) => {
                  if (a === "Dépôt TM") return 1;
                  if (b === "Dépôt TM") return -1;
                  return a.localeCompare(b);
                });

                return (
                  <div>
                    {sortedKeys.map((empl) => {
                      const groupProjects = emplacementMap[empl];
                      const { header } = getEmplColor(empl);
                      return (
                        <div key={empl} className="mb-1">
                          <div className={`flex items-center gap-2 px-3 py-2 mt-3 mb-1 rounded-lg shadow-sm ${header}`}>
                            <span className="text-[12px] font-bold text-white truncate">{empl}</span>
                            <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full font-semibold bg-white/20 text-white shrink-0">
                              {groupProjects.length} projet{groupProjects.length > 1 ? "s" : ""} · {groupProjects.reduce((s, p) => s + (p.nbCabines || 0), 0)} cab.
                            </span>
                          </div>
                          {[...groupProjects].sort((a, b) => {
                            const da = (a.arrivageTM || a.arrivageGrossiste || "");
                            const db = (b.arrivageTM || b.arrivageGrossiste || "");
                            if (!da && !db) return 0;
                            if (!da) return 1;
                            if (!db) return -1;
                            return da.localeCompare(db);
                          }).map((p, idx) => {
                            const rowBg = idx % 2 === 0 ? "bg-white/60 dark:bg-slate-800/40" : "bg-blue-50/40 dark:bg-blue-950/15";
                            const emplacements = p.emplacementCabine ? p.emplacementCabine.split(", ") : [];
                            const arrivage = getArrivageInfo(p);
                            return (
                              <a key={p.id} href={`/projet/${p.id}?mode=dashboard`}
                                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-blue-200/60 dark:hover:bg-blue-800/30 transition-colors text-xs ${rowBg}`}>
                                <span className="w-20 shrink-0 flex flex-col justify-center gap-px">
                                  {parseTMNumbers(p.ofrTM || "").length > 0
                                    ? parseTMNumbers(p.ofrTM || "").map((tm, i) => (
                                        <span key={i} className="font-mono text-xs leading-tight text-gray-600 dark:text-gray-300 truncate">{tm}</span>
                                      ))
                                    : <span className="font-mono text-xs text-gray-400">---</span>
                                  }
                                </span>
                                <span className="w-28 shrink-0 flex flex-col gap-0.5">
                                  {emplacements.length > 0
                                    ? emplacements.map((e) => (
                                        <span key={e} className={`text-[9px] font-semibold px-1.5 py-0.5 rounded truncate ${getEmplColor(e).badge}`}>{e}</span>
                                      ))
                                    : <span className="text-[10px] text-gray-400">—</span>
                                  }
                                </span>
                                <span className="w-24 shrink-0 flex flex-col items-start gap-0.5">
                                  {arrivage ? (
                                    <>
                                      <span className={`text-[9px] font-mono tabular-nums ${arrivage.colorClass}`}>
                                        {arrivage.label} {new Date(arrivage.date + "T12:00:00").toLocaleDateString("fr-CH", { day: "2-digit", month: "short" })}
                                      </span>
                                      {arrivage.days !== null && arrivage.days >= 0 && (
                                        <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${arrivage.bgClass} ${arrivage.colorClass}`}>
                                          J+{arrivage.days}
                                        </span>
                                      )}
                                    </>
                                  ) : null}
                                </span>
                                <span className="flex-1 min-w-0 text-xs text-gray-900 dark:text-gray-100 line-clamp-2">{p.projet}</span>
                                {(() => { const logo = getClientLogo(p.projet); return logo ? (
                                  <LogoImg src={logo} />
                                ) : null; })()}
                                <span className="text-[10px] border border-gray-200 dark:border-gray-600 rounded-full px-1.5 py-0.5 shrink-0 text-gray-600 dark:text-gray-300">
                                  {p.nbCabines || 0} cab.
                                </span>
                              </a>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </>
          )}
        </div>
      )}

      {/* Aujourd'hui */}
      {todayProjects.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" /> Aujourd'hui
          </p>
          <div className="space-y-2">
            {todayProjects.map((p) => <ProjectRow key={p.id} project={p} colors={colors} />)}
          </div>
          <div className="mt-3"><DailyRouteButton projects={todayProjects} /></div>
        </div>
      )}

      {/* Cette semaine */}
      {thisWeekProjects.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" /> Cette semaine
          </p>
          <div className="space-y-1.5">{weekSeparator(thisWeekProjects)}</div>
        </div>
      )}

      {/* Semaine prochaine */}
      {nextWeekProjects.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" /> Semaine prochaine
          </p>
          <div className="space-y-1.5">{weekSeparator(nextWeekProjects)}</div>
        </div>
      )}
    </div>
  );
}

export function MonteurDashboard({ userName, projects, isAdmin, onNavigate, terminatedProjectsInit = [], cmmMode = false }: MonteurDashboardProps) {
  // Admin view: show all collaborators
  if (isAdmin) {
    return <AdminDashboard projects={projects} userName={userName} onNavigate={onNavigate} terminatedProjectsInit={terminatedProjectsInit} cmmMode={cmmMode} />;
  }

  // Collaborateur (non-admin) view
  return <CollaborateurDashboard userName={userName} projects={projects} />;
}
