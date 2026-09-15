// Ce composant projetait le budget d'une commune : abonnement mensuel par
// distributeur, revenu de locations reversé à 75 %, et subvention ANS/DETR
// dégressive selon la population.
//
// Les trois hypothèses sont tombées en septembre 2026 :
//   - les communes sortent du périmètre commercial (voir docs/CDC.md v2) ;
//   - SportLocker ne prélève plus de commission et ne reverse plus rien ;
//   - l'ANS ne finance plus les équipements sportifs de proximité, et une
//     subvention d'investissement ne couvre de toute façon jamais un
//     abonnement de fonctionnement.
//
// Le composant est conservé vide plutôt que supprimé, pour ne pas casser un
// import résiduel. Le dimensionnement honnête vit dans MiniSimulator.tsx.

export default function PriceCalculator() {
  return null
}
