---
title: Admission budgetaire durable des evaluations
date: 2026-09-07
status: approved
author: Folpe + Codex
ticket:
related:
  - docs/EVAL-RUNBOOK.md
  - docs/specs/2026-09-07-mesurer-valeur-implement-autopilot.md
  - docs/plans/2026-09-07-mesurer-valeur-implement-autopilot-plan.md
---

# Admission budgetaire durable des evaluations

## Probleme constate

Le mainteneur doit pouvoir reprendre une evaluation sans reautoriser une depense
incertaine. `parsePilotApproval` valide un document, mais ne reserve rien.
`runDurableRuntimePilot` refuse sans autorite d'admission; cette autorite manque.
Le journal de `durable.ts` fournit deja verrou exclusif, identite immuable,
ecriture synchronisee avant effet et refus de rejouer une admission incertaine.
Il ne contient pas de politique monetaire.

Folpe a approuve cette politique le 2026-09-08. Cette approbation ne change
aucun comportement et n'autorise aucune depense ni aucun envoi de source privee.

## Alternatives

1. **Reservation conservative avec plafond d'execution verifie, recommandee.**
   Reserver une borne superieure avant chaque execution; refuser si cette borne
   ne peut pas etre imposee a tous ses appels et sous-agents. Le cout de cette
   garantie est de bloquer les runtimes sans capacite suffisante.
2. **Budget d'admission seulement.** Reserver une estimation, observer ensuite
   le cout et arreter les admissions suivantes. Plus de runtimes seraient
   utilisables, mais une execution pourrait depasser le budget total. Ce n'est
   pas un plafond de depense et ne doit jamais etre presente comme tel.
3. **Nouveau transport facturable controlant chaque appel.** Potentiellement
   plus precis, mais changer le transport peut changer la condition evaluee.
   Construire un proxy ou un nouveau runtime est hors de cette tranche.

## Contrat propose

- Une approbation humaine fraiche est liee au manifeste, a l'artefact, a la
  configuration, aux identites exactes d'execution et a la politique de budget.
  Un champ `approvedBy` ne prouve pas seul l'origine humaine du document : la
  provenance de l'approbation appartient a une frontiere de confiance explicite.
- Une approbation possede une seule archive d'autorite, sous une racine de
  confiance commune aux lanceurs. Changer de repertoire de resultats ne doit
  ni reinitialiser le budget ni autoriser une seconde campagne avec ce document.
- Les montants sont comptes en microdollars entiers : budget arrondi vers le
  bas, reservations vers le haut. Valeur invalide ou depassement numerique refuse.
- Chaque execution possede une reservation maximale declaree et immuable. La
  somme des reservations deja engagees et de la nouvelle reste sous le budget.
  Une estimation moyenne, un timeout ou un cout observe apres coup ne remplace
  jamais une borne superieure imposee a l'execution.
- La capacite de plafonnement doit couvrir les appels simultanes, les appels
  deja en vol et les sous-agents, avec ses limites documentees. Une simple option
  de CLI ou une assertion du worker ne constitue pas cette preuve.
- L'admission synchronise la reservation avant tout processus payant. Un echec
  de stockage, un verrou concurrent, une identite differente ou une capacite
  indisponible refuse l'execution. Aucun repli vers un autre modele ou runtime.
- La reservation reste consommee apres succes, echec ou interruption. Pas de
  remboursement automatique dans cette tranche, meme si le cout mesure est
  inferieur. Un cout inconnu reste inconnu et ne libere aucun credit.
- Une reservation incertaine n'est jamais rejouee. Une observation complete est
  reutilisee sans nouvelle reservation ni processus. Aucun verrou abandonne
  n'est supprime automatiquement.

## Frontieres et integration

Etendre le journal d'admission existant et son autorite, sans ajouter de second
controleur, de service de facturation ou de stockage concurrent du meme etat.
L'identite budgetaire entre dans l'identite de reprise; une archive historique
sans cette identite est inadmissible pour le nouveau chemin payant.

Le parseur actuel exige exactement 27 executions. Il ne sera pas detourne pour
autoriser un canary : le contrat de canary a une execution devra etre defini
separement avant tout lancement reel. L'evaluateur qualite, l'attestation de
l'artefact/runtime et l'autorisation d'export de source restent des gates distincts.

Le runbook ne constate actuellement aucun plafond dollar Codex verifie. Cette
spec ne pretend pas en ajouter un : tant que la capacite est absente, le chemin
reel reste bloque. Les tests locaux peuvent injecter une capacite controlee,
mais leur resultat n'est pas une certification du runtime payant.

## Preuves attendues avant livraison

TDD strict sur les decisions et tests d'integration sur le journal reel :

- reservation a la limite exacte acceptee; depassement refuse, arrondis conservateurs prouves ;
- deux lanceurs, une meme approbation, aucune double reservation/execution ;
- nouveau repertoire de resultats, aucun rechargement du budget ;
- interruption avant/apres reservation, credit conserve et aucun rejeu ;
- approbation, plafond, artefact ou configuration modifies, reprise refusee ;
- cout inconnu ou inferieur, aucun remboursement implicite ;
- erreur d'ecriture/synchronisation et capacite inconnue, aucun processus lance ;
- archive historique et approbation de 27 cellules presentee comme canary refuses.

Les tests de responsabilite deja presents dans `durable.test.ts` sont etendus
ou reutilises, pas dupliques dans une seconde suite equivalent au meme journal.
Verification ciblee puis gates integrees sur le candidat final. Aucun appel
payant, aucun changement de modele, aucune modification de secret ou lockfile.

## Auto-revue et gate humain

Le contrat distingue plafond impose, reservation et cout observe; aucune
autorisation historique n'est reutilisee. Il ne promet pas une capacite runtime
absente. La premiere livraison serait le controle local avec refus reel tant
que cette capacite manque, pas une campagne executable de bout en bout.

L'alternative 1 et ses refus conservateurs sont approuves. La decision est
`adr:f91fa744-be1d-485a-bbe1-935f410de8c4`. Le plan d'implementation est
[le plan budgetaire](../plans/2026-09-08-eval-durable-budget-admission-plan.md),
soumis a validation avant execution.
