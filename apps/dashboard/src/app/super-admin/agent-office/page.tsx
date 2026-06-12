import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Agent Office — SportLocker',
}

/**
 * Agent Office — visualisation 3D de la flotte d'agents (réservé super-admin,
 * gardé par `super-admin/layout.tsx`).
 *
 * Le rendu est un fichier statique auto-contenu (`/public/agent-office.html`,
 * Three.js via CDN) affiché en iframe pour isoler son contexte WebGL du reste
 * du dashboard. En prod il tourne en mode « ambiant » (pas d'accès aux
 * transcripts Claude Code) ; le flux temps réel n'est branché qu'en local.
 */
export default function AgentOfficePage() {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-xl text-navy-900 dark:text-white">Agent Office</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-white/60">
          Visualisation de la flotte d&apos;agents — réservé aux super-admins.
        </p>
      </header>
      <iframe
        src="/agent-office.html"
        title="SportLocker Agent Office"
        className="block h-[calc(100vh-9rem)] w-full rounded-2xl border border-gray-200 bg-navy-900 dark:border-white/10"
      />
    </div>
  )
}
