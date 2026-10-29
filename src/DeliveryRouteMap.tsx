import { useEffect, useMemo } from 'react'
import { MapPin } from 'lucide-react'
import L from 'leaflet'
import { Circle, MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet'
import type { DeliveryItem, DeliveryLocationPoint } from './lib/deliveryData'

const courierIcon = L.divIcon({ className: 'delivery-courier-marker', html: '<span></span>', iconSize: [24, 24], iconAnchor: [12, 12] })
const formatLocationTime = (value?: string) => value ? new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : 'Belum ada pembaruan'

function MapViewport({ points }: { points: DeliveryLocationPoint[] }) {
  const map = useMap()
  useEffect(() => {
    if (!points.length) return
    if (points.length > 1) map.fitBounds(points.map((point) => [point.latitude, point.longitude]), { padding: [28, 28], maxZoom: 16 })
    else map.setView([points[0].latitude, points[0].longitude], 15)
  }, [map, points])
  return null
}

export function DeliveryRouteMap({ item }: { item: DeliveryItem }) {
  const points = useMemo(() => {
    if (item.locationHistory?.length) return item.locationHistory
    if (item.latitude != null && item.longitude != null) {
      return [{ latitude: item.latitude, longitude: item.longitude, recordedAt: item.updatedAt ?? new Date().toISOString() }]
    }
    return []
  }, [item])
  const latest = points[points.length - 1]

  return <section className="delivery-route-panel" aria-label={`Peta perjalanan ${item.detail}`}>
    <div className="delivery-route-heading"><div><p className="eyebrow">Perjalanan barang</p><h3>{item.detail}</h3><small>{points.length ? `${points.length} titik lokasi · terakhir ${formatLocationTime(latest?.recordedAt)}` : 'Menunggu lokasi kurir'}</small></div><span><MapPin size={15} /> {item.status ?? 'Lokasi'}</span></div>
    {latest ? <div className="delivery-route-map"><MapContainer key={item.id} center={[latest.latitude, latest.longitude]} zoom={15} scrollWheelZoom>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {points.length > 1 && <Polyline positions={points.map((point) => [point.latitude, point.longitude])} pathOptions={{ color: '#2774c8', weight: 5, opacity: 0.82 }} />}
      {latest.accuracy != null && <Circle center={[latest.latitude, latest.longitude]} radius={latest.accuracy} pathOptions={{ color: '#2774c8', fillColor: '#5b9be3', fillOpacity: 0.12, weight: 1 }} />}
      <Marker position={[latest.latitude, latest.longitude]} icon={courierIcon} title={`Lokasi kurir ${item.detail}`} />
      <MapViewport points={points} />
    </MapContainer></div> : <div className="delivery-route-empty"><MapPin size={20} /><span>Lokasi belum tersedia. Peta akan menampilkan titik setelah lokasi barang diperbarui.</span></div>}
    <p className="delivery-route-note">Jejak peta direkam per barang saat live tracking aktif. Alamat tujuan belum ditandai karena data order belum menyimpan koordinat tujuan.</p>
  </section>
}