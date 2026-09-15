# Imprimés

Deux PDF, générés depuis les mêmes données que le site.

## Fiche technique

Le document qu'on laisse après une visite et qu'on tend sur un salon. Deux
pages A4 : le produit et ses spécifications, puis les tarifs, les engagements
et ce qui reste à la charge du camping.

```bash
python3 scripts/imprimes/fiche-technique.py --sortie ~/SportLocker-Docs/Documents
```

Les faits viennent de `apps/web/src/data/produit.json`, **le même fichier que
lit le site**. Modifier un prix ou une cote met donc à jour la page `/la-borne`,
la page `/tarifs` et le PDF d'un seul coup. C'est délibéré : trois documents qui
divergeaient est exactement ce qui a fait perdre un an au projet.

## Autocollant de borne

Le seul mode d'emploi que le vacancier lira jamais, en A6, à coller sur la porte
du compartiment technique à hauteur d'yeux. Un fichier par borne, avec son QR
code et son numéro de série.

```bash
python3 scripts/imprimes/autocollant-borne.py --serial SL-001 --site "Camping des Dunes"
python3 scripts/imprimes/autocollant-borne.py --serial SL-002 --gratuit
```

`--gratuit` n'est à utiliser que si le camping ne facture pas le prêt : c'est
lui qui décide, et une promesse de gratuité fausse se retourne à l'accueil.

Impression conseillée : adhésif polymère mat, pelliculage anti-UV. Le QR est
généré en correction d'erreur haute — il reste lisible abîmé, ce qui évite un
déplacement en pleine saison.

## Dépendances

```bash
pip install reportlab "qrcode[pil]"
```
