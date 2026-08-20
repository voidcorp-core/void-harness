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
- **Aucune distinction méta / consommateur** dans les mécanismes : ce qui diffère est la taille
  de la part du projet, pas la règle.

## Contradictions relevées

Aucune à ce jour. Une demande qui contredit un arbitrage ci-dessus se note ici avec les deux
formulations, et se tranche avec Folpe — jamais en silence.
