/**
 * Types minimaux de Leaflet partagés entre MapClient et MapPicker.
 *
 * On évite d'ajouter `@types/leaflet` (convention déjà adoptée dans le repo)
 * et on centralise ici pour qu'une seule `declare global` existe.
 */

export type LeafletLatLng = { lat: number; lng: number }
export type LeafletEvent<T = unknown> = { latlng: LeafletLatLng; target: T }

export type LeafletMarker = {
  setLatLng(latlng: [number, number]): LeafletMarker
  addTo(map: LeafletMap): LeafletMarker
  on(event: 'dragend', cb: (e: LeafletEvent<LeafletMarker>) => void): LeafletMarker
  getLatLng(): LeafletLatLng
  remove(): void
}

export type LeafletLayer = {
  addTo(map: LeafletMap): LeafletLayer
  bindPopup(html: string): LeafletLayer
}

export type LeafletControl = {
  addTo(map: LeafletMap): unknown
}

export type LeafletMap = {
  remove(): void
  setView(latlng: [number, number], zoom: number): LeafletMap
  fitBounds(b: unknown, opts?: unknown): void
  on(event: 'click', cb: (e: LeafletEvent) => void): LeafletMap
}

export type LeafletGlobal = {
  map(el: HTMLElement, opts?: Record<string, unknown>): LeafletMap
  tileLayer(url: string, opts: Record<string, unknown>): LeafletLayer
  marker(latlng: [number, number], opts: Record<string, unknown>): LeafletMarker
  circleMarker(latlng: [number, number], opts: Record<string, unknown>): LeafletLayer
  latLngBounds(coords: Array<[number, number]>): unknown
  Control: {
    Zoom: new (opts: Record<string, unknown>) => LeafletControl
  }
}

declare global {
  interface Window {
    L?: LeafletGlobal
  }
}
