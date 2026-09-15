---
title: Executer le lot approuve de six tickets
date: 2026-09-15
status: in-progress
spec: docs/specs/2026-09-15-approved-six-ticket-cluster.md
author: Folpe + Codex
high_risk: true
---

# Lot approuve, plan de coordination

Livrer exclusivement DEV-531, DEV-610, DEV-611, DEV-630, DEV-682 et DEV-645 dans develop. Ce plan ne constitue pas une preuve de livraison. Les accords du lot, de DEV-630 option 1 et de DEV-682 routage explicite sont acquis dans la spec liee ; ne pas les redemander. Le preflight corrige de PR380 est integre dans develop ; les preuves restent liees a son arbre verifie. Reobserver ensuite le SHA de base, la protection distante et les relations Linear. Le fournisseur conserve tout etat mutable ; ce plan porte seulement les dependances et les gates.

Deux workers maximum, chacun dans son worktree, coordinateur et place de revue independante conserves. Ne pas lancer deux implementations dont les fichiers possedes se recouvrent. Chaque worker execute void-implement, ne modifie aucune ref partagee et retourne des commits, preuves et revues avec leurs contextes. Aucun worker ne publie ou merge. Aucun secret, cle ou lockfile modifie ; aucun ajustement manuel de version.

## Handoff et organisation indicative

| Ordre | Unite | Dependances de coordination | Parallele admissible | Livraison |
| --- | --- | --- | --- | --- |
| 10 | DEV-531 | preflight et admission | DEV-610 | contrat de mouvement et skill dedie |
| 20 | DEV-610 | preflight et admission | DEV-531 | why et declarations du graphe |
| 30 | DEV-611 | DEV-610 integre et reobserve | DEV-630 | hook post-commit knowledge opt-in |
| 40 | DEV-630 | admission option 1 | DEV-611 | proposition de mise a jour par agent |
| 50 | DEV-682 | admission et ownership sans collision | preparation de revue seulement | routage doctrine et supersession |
| 60 | DEV-645 | admission et ownership sans collision | aucun par defaut | message de rollback honnete |

Le tableau suggere une organisation, sans imposer une priorite differente de Linear. Pour chaque admission CLI, fournir toutes les unites non terminees de progress.order avec leurs etats, priorites et relations natifs intacts ; ne pas filtrer le pool ni fabriquer dependsOn pour imposer une vague. La CLI choisit le cluster, les footprints ordonnent les collisions. Le programme limite un cluster a quatre unites : ne jamais admettre les six d'un coup.

Seule DEV-611 exige DEV-610 integre selon la spec approuvee. Formaliser cette dependance dans Linear si elle manque, puis relire les deux tickets et leurs relations avant admission ; blockedByOpen reste vrai tant que DEV-610 est ouvert. Si la relation ne peut etre enregistree et relue, arreter l'admission dependante. Reobserver chaque admission sur la base effectivement integree et controler le resultat CLI avant tout lease.

## Tranche DEV-531 : mouvement contextuel

- Objectif : livrer void-interface-motion, avec critere observable distinguant feedback fonctionnel (<250 ms par defaut) et sequence expressive ; appliquer le choix par interaction, y compris formulaire dans une landing.
- Ownership : packages/core/skills/void-interface-motion/ (nouveau, SKILL.md, .source, reference GSAP si utile), packages/core/skills/void-frontend-design/SKILL.md, void-ui-review/SKILL.md uniquement si contradiction constatee, tests de contrat dedies, docs/plans/skill-audits/void-interface-motion.md, plan et deux nouveaux ADR uniques. Declarer les assets generes necessaires dans ownership ; les produire sequentiellement si le programme ne declare pas reconcileOnly.
- AC : reduced-motion avec alternative reelle ; contenu accessible sans animation ; aucune propriete non composable dans un chemin chaud ; core agnostique de bibliotheque ; delegation explicite et recouvrement <30 % ; skill <=400 lignes, description <=200 caracteres selon le ticket ; deux decisions (regle contextuelle, sujet dedie) ; sources primaires verifiees avant recettes, distillation sans copie.
- TDD : souple pour prose, strict pour tests de contrat de non-contradiction. Commits test puis feat pour contrat et implementation.
- Gate : contrats, anti-bloat, references, audit sources, revue frontend/accessibilite et doctrine. Le coordinateur regenere et verifie le graphe et les assets sur l'union.

## Tranche DEV-610 : expliquer une cible avec declarations

- Objectif : ADR et invariants declares, trois relations decided_by/constrained_by/verified_by, commande void-harness why <cible>, provenance source+hash, confidence 1, absence explicite de decision et diagnostics de references pendantes.
- Ownership : packages/harness-graph/src/project/ : nouveaux extracteurs declarations et why avec tests ; extractors/filesystem.ts, extractors/types.ts, file-index.ts, project-evidence.ts, project-build-context.ts, graph-assembly.ts, index.ts et tests associes ; cache-codec.ts/tests si declarations persistees. CLI : commands/why.ts/tests nouveaux, main.ts/main.test.ts, commands/help.ts/help.test.ts, test/cli/why.test.ts. Docs : ARCHITECTURE.md, plan et nouvel ADR. Le plan worker borne la liste definitive avant lease ; signaler tout elargissement.
- AC : corpus ADR present entier couvert sans changer ses fichiers (209 observes, ne pas figer ce nombre) ; ADR sans affects reste isole ; supersedes conserve dans les donnees sans inventer une quatrieme relation ; contradictions exposees sans arbitrage ; doublons/frontmatter absent/YAML invalide et chemins pendants signales ; aucune promotion inferred/extracted ; anciennes requetes inchangees semantiquement.
- Securite/cache : admission bornee de .void/knowledge/invariants/*.yaml actuellement exclus, sans ouvrir tout .void ; chemins traversants et symlinks traites ; hash des declarations participant a l'identite et invalidation ; lecture bornee et diagnostics honnetes. Pas de dependance harness-graph vers le parseur CLI, qui ne conserve actuellement pas affects.
- TDD : strict. Slice initiale ADR affectant un fichier, why de bout en bout ; puis invariants et verifications ; puis erreurs/supersession/cache. Commits test/feat bisectables.
- Gate : extracteurs, corpus de requetes, invalidation, CLI reel, conformance projet ; revue architecture, CLI et securite ; architecture et ADR coherents.

## Tranche DEV-611 : regenerer apres le commit

- Objectif : installer/desinstaller explicitement un hook Git post-commit qui appelle la regeneration incrementale existante. Aucun staging, amend ni nouveau commit automatique ; aucun snapshot de l'index necessaire.
- Contrat visible : le commit est deja termine. Si knowledge change, le fichier versionne peut rester dirty ; le message le dit explicitement et invite a relire puis inclure cet artefact dans un commit humain ulterieur. Une panne est visible mais ne change jamais le succes du commit. Ne jamais annoncer que le commit precedent ou sa CI contient automatiquement le nouvel artefact.
- Compatibilite spec : docs/specs/2026-08-17-project-knowledge-system.md dit « au commit » sans imposer pre/post. Aucun conflit explicite avec post-commit ; son gate CI de fraicheur demeure distinct et peut refuser un artefact committe perime. Ne pas inventer une approbation d'un affaiblissement de ce gate.
- Ownership : packages/cli/src/lib/project-knowledge.ts/tests ; nouvel adaptateur lib/knowledge-hook.ts/tests ; nouvelle commande commands/knowledge-hook.ts/tests, main.ts/tests et commands/help.ts/tests ; test/cli/knowledge-hook.test.ts ; ARCHITECTURE.md et plan. Commande et noms definitifs fixes au contrat worker avant implementation. Aucun changement au checkpoint, programme ou hooks de session.
- AC : installation opt-in/reversible et idempotente ; hooks preexistants preserves, refus explicite d'une composition inconnue ; core.hooksPath/worktrees pris en compte sans effets sur autre depot ; aucun telechargement implicite ; hook <=100 lignes ; regeneration identique ne reecrit pas les octets ni le fichier ; echec et absence de .void visibles sans bloquer ; merge/rebase testes.
- Deja livre : void-checkpoint remplace .void/machine/checkpoint.md ; ne pas ressusciter session-handoff, .void/session/current.md ou plans/ACTIVE.md. DEV619 Done.
- TDD : strict, test Git reel puis feat. Gate : installation/desinstallation/coexistence, commit normal/vide, mtime inchange si contenu identique, echec, chemin avec espaces, worktree ; revue CLI et securite.

## Tranche DEV-630 : proposer une mise a jour

- Choix acquis : option 1. La notice de session instruit l'agent de proposer la mise a jour une fois par session, puis attendre un accord humain explicite avant toute execution. Un refus ne relance pas la question a chaque tour. Ni nouveau prompt interactif de hook ni commande nouvelle ni rappel gradue.
- Ownership : packages/hook-runner/src/freshness/notice.ts/tests et documentation du contexte de session ; wiring et tests de session seulement si necessaires au contrat. Pas de reimplementation du registre/cache ni update.ts.
- AC : proposition actionable seulement local en retard ; courant/en avance/marketplace/unknown restent silencieux ; absence d'ecriture avant accord ; refus respecte ; detection et budget de demarrage existants conserves ; information de changement majeur atteignable.
- TDD : strict sur sortie/integration de notice. Commits test puis feat. Gate : matrice des etats, conformance session Claude/Codex et preuve dans une vraie session d'un projet en retard. Un test de chaine de texte seul ne remplace pas cette preuve ; demander seulement l'interaction humaine manquante, pas un nouvel accord sur option 1.

## Tranche DEV-682 : reutiliser les sections de doctrine

- Choix acquis : routage semantique explicite vers les sections existantes, sans correspondance floue. Conserver marketplace sans rafraichissement additionnel ; rendre sa portee vraie par une nouvelle decision supersedante.
- Ownership : packages/core/skills/void-learn/SKILL.md, docs/PROJECT-DOCTRINE-FORMAT.md, tests de contrat dedies, nouvel ADR et plan. Aucun update.ts ni changement de contenu de doctrine utilisateur.
- AC : suivre le format ne cree pas un second titre equivalent ; mappings explicites et cas ambigus soumis a l'humain ; plus de dependance aux seuls titres exacts ; pas de nouvelles copies divergentes de liste ; comportement local/marketplace explique exactement ; aucun ADR accepte edite en place ; aucune ecriture doctrine sans accord.
- TDD : souple prose, strict contrats de routage. Commits test puis fix. Gate : exemples de sections existantes et ambiguite, references, decisions:check ; revue architecture et doctrine.

## Tranche DEV-645 : dire ce qui survit au rollback

- Objectif borne approuve : corriger la promesse de rollback integral et prouver les effets reels en echec. coEdited/doctor sont deja corriges ; conserver les empreintes conformement a l'ADR accepte, ne pas appliquer l'ancienne proposition de suppression des hashes.
- Ownership : packages/cli/src/commands/init.ts et init.test.ts, tests d'echec CLI pertinents, documentation du rollback et plan. Ne pas reouvrir local-install/manifeste/hydrate sauf contradiction nouvelle signalee au coordinateur.
- AC : message distingue ecritures transactionnelles annulees et migration de layout idempotente qui subsiste ; echec reproduit apres migration ; fichiers geres divergents toujours signales, personnalisation co-detendue et fichiers absents conservent leur comportement ; aucun mode special depot-harness.
- TDD : strict pour echec observable. Commit test reproduisant l'annonce trompeuse puis fix. Gate : test d'integration apres migration et echec, octets avant/apres observes, preuve consommateur reel ; revue CLI et silent-failure.

## Integration, revues et livraison

1. Avant chaque worker : complete unit/relations relues, preflight reel valide, empreinte declaree et sans collision, contrat/spec applicable relu. Les choix restants de syntaxe publique sont fixes dans le plan de l'unite ; un choix produit nouveau sort de l'execution autonome.
2. Chaque verif locale passe via cockpit task dans RUN, associee au worktree et au SHA. Pas de tests concurrents non attribues. Chaque worker rend commits, commandes/resultats, reviewEvidence/contextes, limites et blocker explicites. Aucune auto-certification implicite.
3. Integrer sequentiellement les ranges acceptes. Regenerer une seule fois par union les artefacts partages : core-assets, graphe/catalogue, registres de references, bundles et index derives par les commandes existantes. Le programme ne declare aucun reconcileOnly : les workers doivent donc declarer les derives qu'ils produisent et sont sequences si ces derives se recouvrent. Le coordinateur regenere encore depuis les sources integrees ; ne jamais omettre un fichier de la declaration pour obtenir du parallele.
4. Gates sur SHA exact : diff-check, pnpm lint/typecheck et pnpm verify via cockpit, controles de references/decisions/derive requis inclus, preuves consommateurs et sessions manuelles pertinentes. Echec signifie enquete, pas retry/timeout augmente/quarantaine.
5. Lecture independante fraiche du diff integre entier et preuves ; blockers corriges puis nouvelle verification pertinente. Publier une PR d'integration avec preuves et degradations explicites. CI verte ET a jour sur la tete et union relue avant le merge autorise vers develop ; utiliser le gate union-reviewed du programme, sans bypass ni auto-merge ponctuel.
6. Aucun merge/promotion du lot vers main, aucune publication npm par ce plan. La promotion anterieure #350 autorisee puis mergee est historique, pas une autorisation de promouvoir ce nouveau lot. Apres merge verifie, le coordinateur actualise le fournisseur ; les worktrees conservent les travaux sans nettoyage destructif.

## Controles de revue avant lancement

Le coordinateur fait relire ce plan de coordination et les footprints avant les leases ; les decisions deja approuvees restent acquises. Les checks humains deja portes par les tickets (session reelle, consommateur reel) sont des preuves de livraison, pas des accords inferes a partir d'une CI verte. Toute contradiction nouvelle avec une decision acceptee est remontee avant le changement dependant.
