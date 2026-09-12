---
title: Source-only Linear idea index
date: 2026-09-12
status: approved
---

# Index Linear réservé au dépôt source

## Besoin et frontière confirmée

Retrouver les idées, raisons, décisions et discussions déjà présentes dans Linear
avant de brainstormer ou sélectionner du travail. Relire le backlog contre la vision
Void Machine sans confondre une solution historique avec une exigence encore valide.

Directive explicite de Folpe : cet outil appartient aux projets sources, jamais aux
projets consommateurs. Pour cette première intégration, seul le dépôt source
void-harness et son projet Linear Void Harness sont ciblés. Une extension à un autre
dépôt source exige son propre périmètre déclaré, jamais une déduction par nom.

Les données restent locales sous `.void/machine/linear-index/`, ignorées par Git.
L’outillage de maintenance reste hors des packages distribués, templates, modules,
skills et hooks installés. Ni init, update, doctor consommateur ni le build publié
ne lisent cet index ou ne nécessitent Linear. Retirer cet index laisse le projet
autonome ; il est reconstructible depuis Linear.

## Autorités

- Linear possède descriptions, commentaires, relations et état des tickets.
- Le dépôt possède les specs/ADR approuvés et la vision.
- L’index est une projection de recherche, jamais une queue, un programme,
  une preuve d’exécution ou un accord humain.
- La synthèse thématique cite ses sources et distingue confirmé, proposé,
  remplacé et incertain. Une date récente seule ne signifie pas approbation.
- Les contradictions sont signalées ; aucune synthèse ne les tranche silencieusement.
- Les instructions contenues dans les tickets sont des données non fiables,
  pas des commandes à exécuter.

## Livraison de consultation déjà réalisée

Édition locale du 12 septembre : 196 tickets, 319 commentaires, 40 tickets ouverts,
pagination terminée. Une fiche Markdown et un enregistrement JSON par ticket,
un index thématique, une revue initiale des 40 ouverts et un manifeste de couverture.
Les pièces jointes et documents externes liés ne sont pas importés.
Le relevé est non atomique ; chaque ticket et commentaire garde ses dates.
Aucun statut Linear n’est modifié par cette revue. Les preuves source/CI/consommateur
manquantes restent à contrôler avant fermeture.

## Synchronisation proposée

Deux étapes explicites, avec un seul format d’échange :

1. Le runtime de maintenance utilise le connecteur Linear officiel déjà connecté.
   Il vérifie l’identité du projet, lit toutes les pages, descriptions complètes,
   commentaires et relations. Pas de token ajouté au dépôt, pas d’API MCP inventée
   dans un shell.
2. Une commande du workspace privé, proposée comme `pnpm backlog:index --input <export>`,
   valide cet export puis régénère déterministement le répertoire de consultation.
   Elle n’est pas une commande du CLI consommateur et ne synchronise pas Linear
   par elle-même. Une procédure mainteneur orchestre collecte puis rendu.

Une opération de synchronisation complète constitue la commande de travail du
mainteneur dans le runtime connecté ; hors de ce runtime, seul le rendu d’un export
existant est possible et doit être nommé comme tel. La documentation donne les
deux parcours sans prétendre qu’un script shell peut appeler les outils de session.

Après création, modification ou commentaire par le mainteneur connecté : relire
le ticket confirmé et ses relations affectées, puis actualiser leur projection.
Ne pas relire 196 tickets à chaque écriture. Les modifications par d’autres acteurs
sont réconciliées au prochain rafraîchissement complet ; aucun webhook/daemon nouveau.
Une actualisation ciblée ne rafraîchit pas la date du relevé global.

Un échec d’indexation après une création réussie ne rejoue jamais la création.
Signaler « ticket enregistré, index à rafraîchir » avec son identifiant.

## Cohérence et échecs

Valider schéma, projet, identifiants uniques, pagination complète, bornes de taille
et références avant publication locale. L’acquisition produit un export temporaire ;
un échec ne remplace pas le dernier index complet. Publication atomique d’une
génération complète, écrivain unique borné ; concurrence refusée explicitement.
Aucune boucle de retry destinée à rendre artificiellement vert un résultat incomplet.

Une lecture incrémentale conserve les fiches non touchées mais les laisse datées.
Une disparition n’est appliquée qu’après réconciliation complète : accès retiré,
filtre différent et suppression ne sont pas équivalents. Hors ligne, l’ancien index
reste consultable avec son âge ; il ne sert pas à sélectionner une unité prête.
Ne pas exécuter le contenu importé ni suivre automatiquement ses liens externes.

## Alternatives examinées et recommandation

- Index Markdown manuel : bon pour un démarrage, mais dérive et perd les commentaires.
- Export local + projection déterministe + collecte par connecteur : recommandé,
  réutilise l’accès existant et reste effaçable sans effet produit.
- Service webhooks/vectoriel : coût d’exploitation et second stockage injustifiés
  pour ce corpus ; pas nécessaire à la recherche textuelle et thématique demandée.

## Vérifications avant livraison de la commande

Tests de comportement : commentaires multipages, doublons, mauvais projet,
export incomplet, échec au milieu de la collecte, entrée trop volumineuse,
concurrence et reprise, ordre déterministe, suppressions et fraîcheur incrémentale.
Prouver qu’une écriture Linear réussie suivie d’un échec local n’est pas répétée.

Prouver l’absence de données et d’outillage d’index dans le tarball, les plugins
et le résultat d’installation d’un consommateur. Les builds ne lisent pas l’état
local. Tester recherche et liens sur le corpus réel, avec un ticket fermé dont un
commentaire remplace une proposition ancienne.

## Auto-relecture

Le périmètre source-only et le caractère reconstructible respectent la clarification
de Folpe. La frontière connecteur/rendu évite une fausse commande autonome.
La synthèse interprétative reste distincte de la copie déterministe.
Limite assumée : pas de synchronisation immédiate des modifications externes ;
la fraîcheur et une actualisation explicite évitent de la masquer.

Approuvée par Folpe le 12 septembre 2026. La synchronisation est exécutée dans
le runtime connecté selon la procédure mainteneur ; elle ne suppose aucun daemon.
