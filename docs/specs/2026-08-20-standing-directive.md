---
title: La directive permanente, rejouée par le harnais au lieu d'être redite par l'utilisateur
date: 2026-08-20
status: approved
author: Folpe + Claude
ticket:
related:
  - docs/decisions-log/2026-08-20-a-rule-holds-where-it-is-re-evaluated--d9e2fd0a-805b-4559-a5d2-bdc5c170b33d.md
  - DEV-650
  - DEV-641
---

## Le problème, et sa mesure

Le mainteneur ajoute à presque chaque demande une consigne de cinq exigences : viser le
top 5 % de qualité, être optimal et efficient, poser des questions pour atteindre
l'objectif, lire les docs et rester dans les conventions, faire les choses dans les règles
de l'art sans jamais de rustine.

Quatre de ces cinq exigences sont **déjà écrites dans le harnais** :

| Exigence | Où elle est écrite | Où elle est rejouée |
| -- | -- | -- |
| Lire les docs et les conventions | `source-driven-development`, `PHILOSOPHY.md` § Anti-rustine | passe 3 du cycle `implement`, depuis la PR #259 |
| Pas de rustine | `PHILOSOPHY.md` § Anti-rustine | passe Review du cycle `implement`, depuis la PR #259 |
| Top 5 %, règles de l'art | `PHILOSOPHY.md` § « Ultra moderne, exceptionnel » | nulle part |
| Poser des questions | `brainstorm` | seulement si `brainstorm` est invoquée |
| Optimal et efficient | `PHILOSOPHY.md` § Performance, Wing Chun | nulle part |

Le texte existe, il est complet, il est bien écrit. Et il faut quand même le redire à chaque
tour. **La répétition est la mesure du défaut** : ce que l'utilisateur réinjecte à la main est
exactement ce que le harnais ne rejoue pas.

Les deux exigences qui *ont* un mécanisme ne l'ont que dans le cycle `implement`, lequel
s'invoque sur un ticket. Tout le travail conversationnel — le plus fréquent — n'a rien.
Entre les 38 mots du `SessionStart` et les 12 règles `PreToolUse` qui ne jugent qu'un diff,
aucun point ne repose la question « as-tu lu la convention ? » avant que l'intention soit prise.

## Ce que la spec décide

Les cinq exigences deviennent un **rappel rejoué par le harnais**, livré à tous les
consommateurs. Elles ne sont pas une préférence personnelle : quatre sur cinq sont la doctrine
du dépôt, et la cinquième en découle.

### Reformulées en gestes

Une instruction relue à chaque tour doit être exécutable **au moment où elle est relue**.
« Sois top 5 % » ne dit pas quoi faire au tour suivant ; « avant d'affirmer, va lire la
convention » se traduit en acte. Le contenu conserve les cinq exigences ; seule la forme change.

La rédaction exacte est un livrable du plan, pas de la spec. La contrainte de rédaction :
chaque ligne nomme un geste observable, aucune ne nomme une qualité.

### Rejoué où

`UserPromptSubmit` est le point d'ancrage : il tire à chaque tour de l'utilisateur, donc il
survit à une compaction, et il arrive **avant** que l'intention se transforme en écriture — là
où `PreToolUse` n'intervient qu'une fois la décision prise, quand il ne reste qu'à refuser.
Le harnais ne l'occupe pas aujourd'hui (mesuré sur `.claude/settings.json` : 13 `PreToolUse`,
3 `PostToolUse`, 1 `SessionStart`, 2 `Stop`, zéro `UserPromptSubmit`).

La cible est le LLM, jamais un lecteur humain. La concision n'est donc pas un critère de
qualité ici, seulement un coût — et il est dérisoire : cinq lignes par tour contre les
centaines d'appels d'outil d'une session. Ce qui compte est l'exactitude et l'actionnabilité.

### La parité Codex

Vérifiée dans la documentation officielle (`learn.chatgpt.com/docs/hooks`, consultée le
2026-08-20), et non dans celle de ce dépôt : **`UserPromptSubmit` existe chez Codex et peut
injecter du contexte**, par le même contrat que Claude Code —

```json
"hookSpecificOutput": { "hookEventName": "UserPromptSubmit", "additionalContext": "..." }
```

« That `additionalContext` text is added as extra developer context. » Le fichier
`.codex/hooks.json` place déjà ses événements sous une clé racine `hooks`, qui est la forme
attendue. **La parité est donc totale, sans dégradation à documenter ni branche à prévoir.**

Cette vérification a corrigé deux erreurs, l'une et l'autre instructives.

`docs/CODEX.md` affirme que Codex reflète quatre événements (`PreToolUse`, `PostToolUse`,
`SessionStart`, `Stop`). La documentation officielle en expose **onze**, dont `UserPromptSubmit`,
`PreCompact`, `PostCompact`, `PermissionRequest`, `SubagentStart` et `SubagentStop`. Le harnais
s'est privé d'ancrages en croyant qu'ils n'existaient pas : corriger ce fichier est un livrable
du plan, et l'inventaire complet alimente DEV-650.

Une source secondaire consultée au passage affirmait que `PreToolUse` n'intercepte que Bash chez
Codex — ce qui aurait signifié que le plancher d'enforcement ne s'applique à aucune écriture de
fichier. La documentation officielle dit l'inverse : « PreToolUse can intercept Bash, file edits
performed through `apply_patch`, MCP tool calls, and other local function tools », et les
matchers acceptent `apply_patch`, `Edit` et `Write`. Le plancher fonctionne. C'est exactement
l'écart qui justifie de lire la source officielle plutôt qu'un billet : la version fausse aurait
ouvert un chantier d'urgence sur un problème inexistant.

À noter pour DEV-650 : `PostCompact` existe chez Codex mais n'accepte que les champs de sortie
communs, sans `additionalContext`. Réinjecter la doctrine au moment précis où une compaction
vient de l'effacer n'est donc pas possible par ce canal ; `UserPromptSubmit` couvre le besoin,
puisqu'il tire au premier tour qui suit.

### La cinquième ligne : autosuffisance d'abord, question ensuite

Première rédaction : la ligne était conditionnée à la présence d'un humain, avec « humain
présent » pour défaut. C'était le mauvais sens. **Le harnais est autosuffisant par défaut ;
l'humain est un bonus, jamais une dépendance.** Un harnais qui a besoin qu'on lui réponde pour
avancer n'est pas un harnais, c'est un assistant.

L'ordre juste, qui vaut partout et ne dépend d'aucun marqueur :

1. **Résoudre.** L'ambiguïté se lève d'abord par les moyens du harnais — la convention du
   dépôt, la décision déjà écrite, la doc officielle de la version installée, le code voisin.
   C'est la même exigence que « lire avant d'affirmer », appliquée à une question au lieu d'une
   affirmation.
2. **Nommer.** Si elle subsiste, avancer **sous hypothèse explicite**, consignée dans la sortie.
   L'incertitude n'est jamais avalée ; elle est rendue lisible par celui qui relira.
3. **Demander** seulement quand l'ambiguïté est irréductible *et* qu'il y a quelqu'un.

**Ce qui est interdit dans tous les cas : bloquer sur une question.** C'est le seul
comportement que cette ligne existe pour empêcher.

Ainsi formulée, la ligne n'a plus besoin d'être conditionnée : elle est vraie pour une session
conversationnelle comme pour un worker `autopilot` sans interlocuteur. Le marqueur « humain
présent » devient une information de rendu — à qui la question est posée — et non une condition
d'avancement.

Les cinq exigences s'appliquent donc sans condition, worker compris.

## Ce que la spec ne décide pas

* La rédaction exacte des cinq lignes (plan).
* La correction de `docs/CODEX.md`, qui documente quatre des onze événements de Codex (plan).
* L'emplacement des règles de `PHILOSOPHY.md` en général : c'est DEV-650, dont cette spec est
  un cas particulier, traité en premier parce qu'il est mesuré et qu'il fait mal tous les jours.
* Le taux d'activation des skills (1 % mesuré sur un vrai projet). Problème voisin, cause
  distincte, ne pas mélanger.

## Comment on saura que ça marche

Le signal est comportemental et il n'a pas besoin d'être instrumenté : **le jour où
l'utilisateur n'ajoute plus la consigne, le harnais la porte.** Tant qu'il l'ajoute, elle n'est
pas rejouée assez bien, ou pas au bon endroit.

Aucune métrique de substitution n'est inventée ici. Compter les injections mesurerait que le
hook tire, jamais qu'il agit — et un chiffre qui monte sans que rien ne change est exactement
le genre de preuve creuse que ce dépôt refuse ailleurs.

Deux vérifications mécaniques accompagnent quand même la livraison, parce qu'elles portent sur
des faits et non sur un effet :

1. le rappel est présent au tour N d'une session longue comme au tour 1, compaction comprise ;
2. un worker sans humain ne s'arrête jamais pour poser une question.

## Mode TDD

Souple pour la rédaction du rappel, qui est du texte. **Strict pour le hook** : c'est du code
d'enforcement chargé chez chaque consommateur, et le harnais tient ses hooks sous test comme le
reste. Le budget de la règle 5 de l'anti-bloat s'applique — 100 lignes.

## Risque principal

Un rappel permanent qui ne changerait rien serait pire que rien : il ajouterait un coût par
tour et donnerait l'illusion que la question est réglée, ce qui fermerait DEV-650 par erreur.
D'où la formulation en gestes plutôt qu'en qualités, et le signal comportemental comme seul
juge.
