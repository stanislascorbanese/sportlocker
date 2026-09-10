import { BorneFlow } from './BorneFlow'

/**
 * La borne. C'est l'écran qu'ouvre le QR code collé dessus.
 *
 * `serial` est le numéro de série imprimé sur la machine (SL-001). Il n'est pas
 * secret : il désigne un objet public, et rien ne se déclenche sans le couple
 * séjour + nom que seul un client de l’établissement connaît.
 */
export default async function BornePage({ params }: { params: Promise<{ serial: string }> }) {
  const { serial } = await params
  return <BorneFlow serial={decodeURIComponent(serial)} />
}
