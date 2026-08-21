# Demandes formulées

Ce que Folpe a demandé, et où ça en est. Une demande n'est cochée que lorsqu'elle est
**livrée ou explicitement close** — pas quand un ticket a été ouvert pour elle.

Le tracker porte le travail ; ce fichier porte la **demande**, qui est plus fine et vit plus
longtemps qu'un ticket : une contrainte, une préférence, un arbitrage, une exigence de niveau.
Une session qui reprend relit ce fichier pour vérifier que rien n'est resté en route.

Relire en entier à chaque reprise de session, et à chaque fois qu'une nouvelle demande
contredit une ancienne — c'est le seul moment où l'arbitrage est possible.

---

## Ouvert

- [ ] **Chantier 2 de doctrine** — auditer chaque règle de `PHILOSOPHY.md` en trois colonnes
      (mécanisme déclaré / mécanisme réel / mécanisable), en tenant qu'une skill n'applique rien.
      Demandé le 2026-08-20, **explicitement conditionné à la validation du chantier 1**, qui est
      livré depuis (#259). Rien n'a été fait depuis. → DEV-650
- [ ] **Step 1 de la directive permanente** — spec et plan approuvés (#261), exécution non lancée.
- [ ] **Le dogfood d'un consommateur ancien** — six projets sur huit n'ont ni manifeste ni receipt
      et partent sur la route marketplace, celle que le code décrit comme « materialised nothing,
      and reported success ». Folpe a dit vouloir le faire lui-même ; à confirmer.
- [ ] **Trancher la dépendance DEV-650 → DEV-612** — prérequis de fait écrit en commentaire,
      relation native `blocks` non posée. Question laissée ouverte dans le ticket.
- [ ] **Audit externe du 2026-08-20** — reçu, calibration vérifiée sur quatre affirmations, quatre
      exactes. Deux blocants sécurité confirmés ligne à ligne → DEV-653, DEV-654. Le reste est à
      vérifier item par item avant d'être ouvert : un audit assisté par IA se traite comme une
      liste de pistes datées, pas comme un constat.
- [ ] **Divergence règle / enforcement sur les descriptions** — `CLAUDE.md` exige ≤ 200 caractères,
      `scripts/anti-bloat-check.sh:89` applique 512, et le gate passe au vert. Mesuré : `learn` =
      428, `merge` = 215. Un gate qui ment est pire qu'un gate absent.
- [ ] **Budget de contexte au plafond fournisseur** — 41 descriptions core totalisent ~7 894
      caractères, contre une borne annoncée à 8 000 côté Codex. À mesurer contre la source
      officielle avant d'agir.
- [ ] **Préfixer toutes les skills en `void-`** — décidé le 2026-08-20, chantier commité en WIP sur
      `folpe/prefixe-void-sur-les-skills` (`1d6d21b`), **non mergeable en l'état** : `init` échoue.
      Voir la décision every-shipped-skill-carries-the-void-prefix. → DEV-658
- [ ] **`voidharness` comme commande**, alignée sur le paquet npm ; `vh` reste l'alias,
      `void-harness` est conservé puis retiré à une majeure. → DEV-659
- [ ] **Formaliser cette file** pour tous les consommateurs — ce fichier existe ici et à la main.
      → DEV-652

## Livré

- [x] **Conseiller le prochain ticket** — DEV-641 recommandé, puis dépriorisé au profit des bugs
      remontés en cours de session.
- [x] **Débloquer `void-music`** — `--force`, après avoir prouvé qu'aucun fichier managé n'avait
      été édité à la main.
- [x] **Un update ne doit plus se bloquer sur un receipt amputé** — DEV-643, PR #255 puis #257
      (qui annule une régression introduite par #255).
- [x] **Le verdict d'invocation ne doit accuser que les skills du harnais** — DEV-644, PR #256.
- [x] **Vérifier que les skills d'un projet ne sont jamais écrasées ni supprimées** — vérifié sur
      un vrai projet ; deux défauts trouvés (DEV-646, et la régression corrigée par #257).
- [x] **L'anti-rustine devient une passe du cycle** — chantier 1, PR #259.
- [x] **`PROJECT-DOCTRINE.md` du dépôt méta** — traité : il n'a pas à être rempli ici, et le vrai
      défaut est le gabarit chargé à chaque session (DEV-649). PR #260 fermée.
- [x] **Sauvegarder la vision produit** — `docs/VISION.md`.
- [x] **La directive permanente doit être portée par le harnais** — spec et plan, PR #261.

## Arbitrages rendus, à ne pas rouvrir

- **`PHILOSOPHY.md` peut être supprimé** s'il est intégralement porté ailleurs. Rien n'est gardé
  par ancienneté.
- **Le harnais est autosuffisant ; l'humain est un bonus.** Aucune règle ne suppose qu'il y a
  quelqu'un pour répondre. Ne jamais bloquer sur une question.
- **`main` reste un merge humain**, quelle que soit l'autonomie atteinte sur `develop`.
- **Le harnais est destiné au LLM, pas à un lecteur humain.** Pour un artefact chargé en
  contexte, la concision est un coût et non un critère ; l'exactitude et l'actionnabilité
  décident.
- **Toute skill livrée porte le préfixe `void-`.** Décidé le 2026-08-20 : il fait coexister nos
  skills avec celles du projet et du runtime, empêche le masquage silencieux, et rend le harnais
  énumérable en tapant `/void`. Amende la règle 8 de `CLAUDE.md`.
- **Le canal plugin est écarté** pour distribuer les skills : un plugin par runtime, et une
  dépendance de distribution contraire à la promesse `npx` libre et sans compte.
- **Aucune distinction méta / consommateur** dans les mécanismes : ce qui diffère est la taille
  de la part du projet, pas la règle.

## Contradictions relevées

Aucune à ce jour. Une demande qui contredit un arbitrage ci-dessus se note ici avec les deux
formulations, et se tranche avec Folpe — jamais en silence.
