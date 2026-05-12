export default function DistributorsPage() {
  return (
    <div className="space-y-4">
      <h2 className="font-display text-2xl">Distributeurs</h2>
      <p className="text-white/60">Liste paginée du parc — à brancher sur GET /v1/distributors</p>
      {/* TODO: table avec status, dernier heartbeat, commune, actions */}
    </div>
  )
}
