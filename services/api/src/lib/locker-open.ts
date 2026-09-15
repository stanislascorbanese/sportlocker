/**
 * Ouverture d'un casier, et attente de la confirmation de la borne.
 *
 * Le protocole existe déjà et ne change pas : l'API publie un JWT device signé
 * sur `sportlocker/{distributorId}/cmd/open`, le firmware le vérifie hors ligne
 * puis republie un événement `door_unlocked` signé HMAC sur `.../event`.
 *
 * Ce qui manquait, c'est le lien retour : le parcours vacancier a besoin de
 * savoir *tout de suite* si la porte s'est ouverte, pour afficher un numéro de
 * casier plutôt qu'un écran d'attente. On tient donc un registre en mémoire des
 * ouvertures en cours, indexé par le `jti` du jeton — le firmware le renvoie
 * tel quel dans son événement, ce qui suffit à apparier sans état en base.
 *
 * Choix assumés :
 *
 *   - registre en mémoire du process. Une API répliquée verrait l'événement
 *     arriver sur une autre instance que celle qui a publié la commande, et le
 *     vacancier attendrait pour rien. Tant qu'il y a un seul process API c'est
 *     sans conséquence ; le jour où il y en a deux, ce registre passe par Redis
 *     pub/sub. C'est le genre de dette qu'on écrit noir sur blanc plutôt que
 *     de la découvrir en juillet.
 *
 *   - sans broker MQTT (tests, dev sans borne), l'ouverture est considérée
 *     comme faite. L'alternative — échouer — rendrait tout le parcours
 *     intestable sans matériel.
 */
import { randomBytes } from 'node:crypto'
import type { MqttClient } from 'mqtt'

import { signDeviceToken } from './jwt-device.js'

/** Délai au-delà duquel on considère que la borne n'a pas répondu. */
export const OPEN_TIMEOUT_MS = 8_000

type Waiter = {
  resolve: () => void
  timer: NodeJS.Timeout
}

const waiters = new Map<string, Waiter>()

/**
 * Appelé par le handler MQTT quand un `door_unlocked` valide arrive.
 * Retourne `true` si quelqu'un attendait cette ouverture — ce qui permet au
 * handler de ne pas s'alarmer de ne trouver aucune réservation : l'ouverture
 * venait d'un emprunt vacancier, pas du modèle historique.
 */
export function notifyDoorUnlocked(jti: string): boolean {
  const waiter = waiters.get(jti)
  if (!waiter) return false
  waiters.delete(jti)
  clearTimeout(waiter.timer)
  waiter.resolve()
  return true
}

/** Erreur levée quand la borne n'a pas confirmé l'ouverture à temps. */
export class LockerStuckError extends Error {
  constructor() {
    super('locker_stuck')
    this.name = 'LockerStuckError'
  }
}

export interface OpenLockerParams {
  /** Client MQTT du plugin, ou `null` quand le broker est désactivé. */
  client: MqttClient | null | undefined
  distributorId: string
  lockerId: string
  /**
   * Identifiant de l'ouverture. Il voyage dans le claim `reservationId` du
   * jeton : c'est le nom historique du champ côté firmware, et le firmware ne
   * l'interprète pas — il le recopie dans son événement. Le renommer imposerait
   * de reflasher les bornes pour un gain nul.
   */
  openingId: string
  timeoutMs?: number
}

export async function openLocker(params: OpenLockerParams): Promise<void> {
  const { client, distributorId, lockerId, openingId } = params
  const timeoutMs = params.timeoutMs ?? OPEN_TIMEOUT_MS

  // Pas de broker : dev sans borne, ou suite de tests. On considère l'ouverture
  // faite plutôt que de bloquer tout le parcours sur du matériel absent.
  if (!client) return

  const jti = randomBytes(16).toString('hex')
  const token = await signDeviceToken(
    { reservationId: openingId, lockerId, distributorId },
    // Le jeton ne sert qu'à cette ouverture-ci, dans les secondes qui suivent.
    // Une minute laisse de la marge pour une borne en 4G lente sans laisser
    // traîner un droit d'ouverture réutilisable.
    60,
    jti,
  )

  const confirmed = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      waiters.delete(jti)
      reject(new LockerStuckError())
    }, timeoutMs)
    // `unref` : un timer en attente ne doit pas retenir le process au shutdown.
    timer.unref?.()
    waiters.set(jti, { resolve, timer })
  })

  /**
   * Échec de publication, et rien d'autre.
   *
   * En qos 1, `publish` ne rappelle qu'une fois le message remis au broker : si
   * le broker est injoignable, mqtt.js met en file d'attente et ne rappelle
   * jamais. Attendre cet accusé *avant* d'attendre la borne laissait donc
   * `confirmed` rejeter au bout de huit secondes sans personne pour l'attraper,
   * et une rejection non gérée tue le process — une borne muette faisait tomber
   * l'API de tous les campings. Les deux attentes courent maintenant ensemble,
   * et le chronomètre de `confirmed` est le seul de l'opération.
   */
  const publishFailed = new Promise<never>((_resolve, reject) => {
    try {
      client.publish(
        `sportlocker/${distributorId}/cmd/open`,
        JSON.stringify({ token }),
        { qos: 1 },
        (err) => {
          if (err) reject(new LockerStuckError())
          // Sans erreur il n'y a rien à faire : on attend la borne, pas le broker.
        },
      )
    } catch {
      reject(new LockerStuckError())
    }
  })

  try {
    await Promise.race([confirmed, publishFailed])
  } finally {
    // Que l'ouverture ait réussi, expiré ou échoué à la publication, ce `jti`
    // n'attend plus personne.
    const waiter = waiters.get(jti)
    if (waiter) {
      clearTimeout(waiter.timer)
      waiters.delete(jti)
    }
  }
}

/** Réservé aux tests : vide le registre entre deux cas. */
export function __resetWaiters(): void {
  for (const waiter of waiters.values()) clearTimeout(waiter.timer)
  waiters.clear()
}
