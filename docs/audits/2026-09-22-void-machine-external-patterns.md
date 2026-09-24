---
title: "Void Machine : patterns externes retenus, adaptés ou refusés"
date: 2026-09-22
status: reference
author: Folpe + Claude
---

# Void Machine : patterns externes retenus, adaptés ou refusés

Trois projets ont déjà tranché des problèmes que Void Machine va rencontrer :
OpenClaw pour l'ouverture (canaux, plugins, routage), Hermes Agent pour la boucle
d'apprentissage, TypeSafe pour les décisions déterministes et bon marché. Ce document
extrait leurs mécanismes utiles, puis les confronte à la
[vision Machine](../VOID-MACHINE-VISION.md). Un pattern incompatible avec la vision
est refusé ici, même s'il est bon chez sa source.

**Statut : référence, pas décision.** Aucun pattern n'est éprouvé dans le noyau.
Conformément à l'[ADR du noyau neuf](../decisions-log/2026-09-19-void-machine-new-core-demonstrated-needs--873d1c5a-ef12-44c7-84dd-2fcd853b7ab8.md),
un pattern n'entre dans le noyau que sur un besoin démontré, par une ADR qui cite
son identifiant. Ce document n'autorise aucune implémentation.

## Sources figées

On ne relit pas les sources à chaque conception : on relit ce document, et on ne
retourne aux sources qu'en changeant le commit figé.

| Préfixe | Source | Référence figée | Posture de la source |
| --- | --- | --- | --- |
| OC | [OpenClaw](https://github.com/openclaw/openclaw) | `0a5b5381a26b` (2026-09-22) | Assistant local-first, mono-utilisateur, multi-canal, tout est plugin |
| HE | [Hermes Agent](https://github.com/NousResearch/hermes-agent) | `fde4997f580c` (2026-09-22) et [documentation](https://hermes-agent.nousresearch.com/docs/) | Agent personnel mono-tenant, auto-améliorant, runtime complet |
| TS | [TypeSafe, System One Models et Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev) | Article lu le 2026-09-22 et [adapter](https://github.com/typesafe-ai/system-one-adapter-python) `e1d4cc938204` | Modèle de décision, pas un agent : état en entrée, valeur typée et probabilité calibrée en sortie |

## Le filtre principal : ce que la Machine ne reconstruit pas

OpenClaw et Hermes sont des **runtimes**. La vision (§2, §7) interdit de reconstruire
ce que le runtime natif fait déjà : boucle de raisonnement, mémoire conversationnelle,
compaction, checkpoint textuel, ordonnanceur de sous-agents. Une bonne partie de
leurs meilleurs mécanismes tombe donc hors du noyau. Ils restent valables pour un
projet consommateur qui construit son propre agent (dernière section).

TypeSafe n'est pas un runtime mais un composant de décision. C'est la source la plus
directement compatible avec le noyau, qui « peut demander à un modèle de proposer une
décision » et « valide les transitions de façon déterministe » (§3).

## Patterns candidats pour le noyau

Format : mécanisme, rattachement à la vision, condition d'adoption.

**TS-1 - Décision typée plutôt que texte.** Quand le noyau consulte un modèle (route,
décomposition, classement d'une attente), la réponse est une valeur d'un ensemble
fermé défini à l'avance, avec une probabilité. Le flux reste en code ; le modèle ne
remplit que les nœuds flous. Vision §3 et §6 (éliminer les routes inadmissibles,
comparer les restantes). Adopter dès la première décision de routage confiée à un
modèle. Réalisable avec les sorties structurées de n'importe quel fournisseur.

**TS-2 - Seuil de confiance comme branche.** Sous un seuil, la décision n'est pas
exécutée : elle devient une attente avec cause, responsable et action (principe
« aucune attente silencieuse »), ou part vers une route plus capable. Condition :
des probabilités calibrées. Une confiance auto-déclarée par un LLM ne l'est pas ; il
faut alors mesurer le seuil sur des résultats observés (§10).

**TS-3 - Questions décomposées.** Plusieurs questions indépendantes posées en
parallèle et combinées en code, plutôt qu'un seul prompt qui porte toute la logique.
Selon les évaluations publiées par TypeSafe (à confirmer hors vendeur), le flux en
code bat le raisonnement en chaîne unique. Adopter pour toute admission multi-critère.

**TS-4 - Vérificateur rapide.** Un classifieur bon marché juge une sortie, une trace
ou une entrée avant qu'elle ne produise un effet. Vision §6 (vérification
indépendante par une autre configuration admissible). Adopter devant un effet externe.

**OC-3 - Routage déclaratif, premier match gagnant.** Des règles ordonnées, du plus
spécifique au plus général, avec un repli explicite. C'est la « politique explicite et
simple » que la vision demande avant toute adaptation (§6). Rejeter la table de
bindings éditable en interface tant qu'un seul utilisateur configure.

**OC-2 - Planification unifiée.** Une seule primitive pour l'instant, l'intervalle et
l'expression cron (union discriminée `at | every | cron`), configuration séparée de
l'état d'exécution, décalage intégré pour éviter les pics, **enum fermée des causes
d'échec**, primitive de réveil. L'enum fermée sert directement « l'explication des
arrêts » (§3). Adopter quand la Machine lancera des missions non déclenchées par un
humain.

**OC-4 - Identité à deux niveaux.** Un identifiant de mission immuable, et une clé
composite reconstructible pour retrouver une session native dont l'identifiant
externe a changé. Parents explicites pour les sous-missions. Vision §8 (identités et
références des sessions natives). Adopter dès le registre d'exécution.

**HE-2 - Journal d'exécution adapté.** Chez Hermes, un store de trajectoires complet.
Pour la Machine, uniquement ce que le §8 autorise : route choisie, configuration,
coût, résultat, références des preuves, cause d'arrêt. **Jamais l'historique
conversationnel**, qui appartient au runtime (§7, §9). C'est la matière première de
l'apprentissage opérationnel (§10).

**HE-3 - Configuration épinglée par catégorie de tâche.** Les tâches internes
(résumé, titre, classement) pointent vers une configuration économique fixe,
indépendamment de la route de la mission. Vision §6 (extraction simple, configuration
économique) et §12 (budgets).

## Patterns candidats pour les adaptateurs

**OC-6 - Runtime et modèle interchangeables.** Déjà acté par la vision (§4, §5) :
ajouter un runtime demande un adaptateur et ses tests, pas une modification du noyau.
OpenClaw sert d'exemple de découpage (le modèle et le harnais d'agent sont des plugins),
pas de dépendance.

**OC-7 - Entrée non fiable par défaut.** Tout message entrant d'un tiers est non
fiable ; un expéditeur inconnu doit être appairé explicitement ; les outils ne
s'exécutent sur l'hôte que pour la session principale, sinon en isolation. Vision §13
(ne pas annoncer une action contrôlée qu'un autre outil peut contourner). Obligatoire
dès qu'un canal reçoit des messages extérieurs.

**OC-5 - Capacité = dossier `SKILL.md`.** Déjà le format du harnais, partagé avec
Claude Code, Codex, Hermes et le standard agentskills.io. Aucun changement.

## Apprentissage : ce qui est repris de Hermes, et ce qui ne l'est pas

La vision (§10) fixe une boucle d'apprentissage **opérationnel** : observation,
hypothèse, politique candidate, évaluation, adoption bornée, surveillance, retour
arrière. Elle interdit qu'une adaptation automatique modifie permissions, doctrine,
vision ou garanties.

**HE-5 - Création de skills sous validation, adaptée.** Hermes fait écrire une skill
par l'agent après une tâche non triviale, avec un linter consultatif et, en option,
une mise en attente de chaque écriture relue en diff (`skills.write_approval`). Pour la
Machine, une skill est de la doctrine : elle ne s'écrit **jamais** sans validation
humaine. Le mécanisme existe déjà côté harnais (`void-learn` : proposer, attendre le
oui, écrire). Ce qui mérite d'être repris : **la détection du moment** (fin d'une
tâche non triviale réussie) et **la relecture en diff** d'une proposition complète.

**Ce qui peut s'adapter sans humain** : uniquement les politiques de §10 (choix de
configuration par catégorie, allocation de contexte, concurrence, reprise), versionnées,
bornées et réversibles, jugées sur des résultats observés et jamais par le modèle seul.

## Refusés pour la Machine

| Pattern | Source | Raison du refus |
| --- | --- | --- |
| Compression de contexte maison, tête protégée pour le cache | HE | Compaction native du runtime (§2, §7) |
| Mémoire bornée injectée en snapshot par session | HE | Mémoire conversationnelle parallèle (§2, §8) |
| Apprendre depuis une source vers une skill base de connaissance | HE | Production de contenu, pas orchestration ; relève d'une spécialité |
| Curator autonome qui réécrit ou archive des skills | HE | Adaptation automatique de la doctrine (§10) |
| Passerelle multi-canal et applications compagnons | OC | Présentation et canaux, hors noyau ; un adaptateur le jour d'un besoin démontré |
| Stockage d'état en fichiers JSON dans le dossier utilisateur | OC | Registre minimal et propriétaire unique (§8, §11) |
| Jev comme dépendance du noyau | TS | Agnosticisme fournisseur (§5) ; voir ci-dessous |

## Jev comme fournisseur

Les patterns TS-1 à TS-4 valent sans Jev. Le modèle lui-même est à évaluer par un
adaptateur, pas à adopter. Faits au 2026-09-22 : accès anticipé ; service hébergé aux
États-Unis ; vitesse, coût et qualité mesurés et publiés par le vendeur ; le vendeur
indique ne pas pouvoir prouver que son tarif n'est pas subventionné ; 255 choix au
plus par décision. Pour garder la porte ouverte, écrire les nœuds de décision contre
un contrat typé que l'adapter open source de TypeSafe sait aussi servir avec un LLM
classique.

## Pour un projet consommateur qui construit son propre agent

Les refus ci-dessus concernent la Machine, qui délègue aux runtimes. Un produit qui
embarque son propre runtime agentique n'a pas cette contrainte. Il se place d'abord sur
trois axes, puis choisit :

| Axe | Pôle ouvert | Pôle fermé |
| --- | --- | --- |
| Ouverture | Surface d'outils et de canaux large (OpenClaw) | Surface fermée, sorties typées (TypeSafe) |
| Apprentissage | L'agent écrit ses skills et sa mémoire (Hermes) | Comportement versionné et relu |
| Coût | Génération et raisonnement longs | Décision en un appel |

Règle par défaut : **des tiers ou des clients payants dans la boucle, pôle fermé sur
les trois axes**, et l'apprentissage passe par une validation humaine ; jamais
d'apprentissage qui traverse les données de deux clients. Outil personnel : pôle
ouvert autorisé. Les patterns HE-1 (compression compatible cache), HE-6 (mémoire
bornée, erreur au dépassement plutôt que compaction silencieuse) et HE-7 (source vers
skill indexée) redeviennent alors candidats.

## Maintenance

- Changer un commit figé impose de relire le diff des zones citées et de mettre à jour
  les patterns concernés dans la même modification.
- Une adoption dans le noyau se fait par ADR dans `docs/decisions-log/`, qui cite
  l'identifiant et le besoin démontré. Ce document reste une référence et ne porte pas
  de statut d'adoption.
- Ajouter une source : un préfixe, une ligne dans la table, et le même filtre par la
  vision.
