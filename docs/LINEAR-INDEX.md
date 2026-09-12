# Index des idées Linear du dépôt source

**Maintenance du dépôt source void-harness uniquement.** Ni commande, ni index,
ni accès Linear ne sont installés chez les consommateurs. Le workspace racine est
privé ; les scripts restent hors des packages, plugins et assets distribués.

[Ouvrir l’index local](../.void/machine/linear-index/INDEX.md).
Une génération possède toutes ses fiches et son état JSON ; ouvrir son INDEX
permet de parcourir un instantané cohérent pendant une actualisation concurrente.
Les clones ne reçoivent pas les données Linear : reconstruire via le connecteur.

## Synchroniser dans le runtime connecté

Demander : « Synchronise l’index Linear du dépôt source », ou « Actualise l’index
pour DEV-452 ». Le mainteneur exécute cette procédure avec les outils Linear de
sa session, puis la commande de rendu ci-dessous. Il n’existe aucun service de
surveillance en arrière-plan.

1. Vérifier le projet par son identifiant
   `e17b2f59-54b2-46aa-bb69-0c21434819f3` (Void Harness).
   Un nom ressemblant ne suffit pas. Ne jamais changer de projet en cas d’échec.
2. Pour un relevé complet, appeler `list_issues` sur ce projet sans filtre
   d’état, d’assignation ou de date ; parcourir toutes les pages.
   Inclure les tickets fermés et annulés, qui conservent les arbitrages.
3. Pour chaque ticket, `get_issue` avec relations, puis `list_comments` sur
   toutes les pages. Conserver les corps complets, les auteurs, réponses, citations
   et dates. Les listes de tickets peuvent tronquer les descriptions : elles ne
   remplacent pas la lecture complète. Les pièces jointes ne sont pas importées.
4. Refuser une page manquante, un projet étranger, une erreur d’accès ou un
   résultat tronqué. Ne pas sceller un export partiel comme complet.
5. Écrire les données intermédiaires exclusivement sous
   `.void/machine/linear-index/imports/`, puis l’export complet dans
   `.void/machine/linear-export.json`, dans le format ci-dessous.
   Ces deux emplacements sont ignorés par une règle versionnée du dépôt source.
   Les trois indicateurs de couverture sont des attestations de la collecte
   observée, pas des valeurs à inventer pour faire accepter le rendu.
6. Exécuter `pnpm backlog:index --input <export.json> --check`, puis la même
   commande sans `--check`. Lire le résultat et ouvrir le nouvel index.
   Un échec de collecte ou de rendu laisse la dernière génération publiée intacte.

Le connecteur est utilisé par le runtime, pas par un script shell. La commande
locale ne contacte pas Linear et ne prétend jamais certifier sa fraîcheur distante.
Ne pas ajouter de token ou de SDK au projet pour remplacer cet accès.

## Après une écriture Linear

Après toute création, modification ou commentaire réussi dans ce projet source :

- conserver l’identifiant renvoyé par Linear ;
- lire la génération publiée (digest dans le commentaire en tête de INDEX.md) ;
- relire le ticket et ses commentaires complets ;
- si les relations ont changé, relire aussi les tickets affectés, en comparant
  anciennes et nouvelles relations ;
- exporter en mode `incremental` avec le `baseDigest` lu avant ces lectures ;
- exécuter le rendu. Il conserve les autres fiches et leur date d’observation.

C’est une étape du parcours mainteneur lié depuis le README du dépôt source,
pas un hook installé chez les consommateurs. Une écriture faite dans une autre
session ou dans l’interface Linear sera vue au prochain relevé complet.

Les fichiers gérés AGENTS.md, CLAUDE.md et .gitignore restent ceux du harnais
installé. Le point d’entrée README et le fichier `.void/.gitignore` appartiennent
au dépôt source ; cette séparation conserve la protection des assets livrés.

**Si l’écriture réussit et le rendu échoue : ne jamais rejouer l’écriture.**
Rapporter « ticket enregistré, index à rafraîchir », l’identifiant et la cause.
Réparer uniquement la projection. Un digest concurrent invalide l’export ciblé :
relire la nouvelle génération et les tickets concernés avant un nouvel export.

## Format d’export version 1

Exemple de relevé vide (uniquement valide si la collecte confirme un projet vide) :

```json
{
  "schemaVersion": 1,
  "projectId": "e17b2f59-54b2-46aa-bb69-0c21434819f3",
  "mode": "full",
  "capturedAt": "2026-09-12T12:00:00.000Z",
  "coverage": {
    "issuesComplete": true,
    "commentsComplete": true,
    "unfiltered": true
  },
  "issues": [],
  "removals": []
}
```

Chaque issue porte `id` (DEV-N), `projectId`, `title`, `status`, `updatedAt`,
`description`, `relations` et `comments`. Description absente confirmée :
chaîne vide ; champ manquant : export refusé. Relations : tableaux d’identifiants
pour `blocks`, `blockedBy`, `relatedTo`, `duplicateOf`, `parent`.
Normaliser l’objet Linear duplicateOf en tableau et parentId en relation parent.
Un ticket lié hors corpus reste un lien Linear, pas une fausse fiche locale.

Chaque commentaire porte `id`, `body`, `author` (nom ou « inconnu »),
`createdAt`, `updatedAt`, et éventuellement `parentId`, `quotedText`.
Normaliser les valeurs absentes à une chaîne vide. En mode incremental,
`issuesComplete` signifie que chaque ticket demandé est complet, pas que
l’inventaire global a été refait. Ajouter `baseDigest` ; `removals` reste vide.

Un relevé complet qui omet un ancien ticket exige une entrée de `removals`
avec son `id` et un motif vérifié : `confirmed-deleted` ou
`moved-out-of-project`. Un accès refusé n’est aucun de ces motifs.
Les limites sont 32 MiB par export, 10 000 tickets, 10 000 commentaires par ticket
et 200 000 caractères par corps. Dépassement : arrêt explicite, jamais troncature.

## Consultation et synthèse

```sh
pnpm backlog:index --input .void/machine/linear-export.json
rg -n -i 'autonom|retrait|désinstall' .void/machine/linear-index/generations
```

Chercher de préférence dans la génération pointée par INDEX.md ; les générations
antérieures sont conservées pour la reprise et ne représentent pas l’état courant.
Les corps importés sont rendus en texte échappé. Les thèmes sont des pistes lexicales,
pas des arbitrages automatiques. La revue humaine reste séparée du rendu et doit
citer les tickets/commentaires, indiquer sa date et signaler les contradictions.

La [revue initiale](../.void/machine/linear-index/REVIEW.md) du 12 septembre conserve
les propositions sur 40 tickets ouverts ; elle n’est pas remise à jour par le rendu.
Le retrait propre est confirmé dans DEV-452 et DEV-453, avec précédents DEV-631
et DEV-609. L’index n’accorde jamais une permission et ne ferme aucun ticket.

## Reprise et limites

La commande de maintenance requiert un système fournissant les primitives POSIX
de lecture non bloquante sans suivi de liens et fsync de répertoire. Le parcours
a été éprouvé sur macOS ; une plateforme sans ces primitives est refusée.
Cette limitation ne change pas la compatibilité des consommateurs du harnais.

Un fichier .writer existant bloque immédiatement. Lire son PID, vérifier qu’aucun
écrivain n’est actif et archiver manuellement ce verrou avant reprise ; ne jamais
le voler sur un simple timeout. Les répertoires .pending-* ou .publish-* non
référencés sont des résidus locaux, jamais servis. Les générations publiées sont
vérifiées à la réutilisation ; une corruption provoque un arrêt.

Une ancienne édition manuelle INDEX.md n’est pas écrasée : l’archiver explicitement
avant la première génération. Supprimer tout l’index est possible hors écriture ;
il n’est jamais l’unique propriétaire d’une décision ou d’un effet externe.

La projection est non atomique côté Linear ; une date d’observation ne certifie
pas l’absence de modification ultérieure. Vérifier Linear avant toute action.

[Spécification approuvée](specs/2026-09-12-source-linear-index.md).
