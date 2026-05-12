export default function MaintenancePage() {
  return (
    <div className="space-y-4">
      <h2 className="font-display text-2xl">Tickets de maintenance</h2>
      <p className="text-white/60">Tickets ouverts par sévérité, ETA, technicien assigné</p>
      {/* TODO: kanban open / in_progress / resolved */}
    </div>
  )
}
