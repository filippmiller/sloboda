import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import api from '@/services/api'
import { Loader2, MapPin, User } from 'lucide-react'

// Fix for default marker icons in Leaflet
if (L.Icon && L.Icon.Default && L.Icon.Default.prototype) {
  delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  })
}

// Custom marker icon with SLOBODA colors
const customIcon = L.divIcon({
  className: 'custom-marker',
  html: `
    <div class="relative">
      <div class="w-8 h-8 rounded-full bg-accent border-2 border-white shadow-lg flex items-center justify-center">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
          <circle cx="12" cy="10" r="3"/>
        </svg>
      </div>
    </div>
  `,
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32],
})

interface Member {
  id: number
  name: string
  city: string | null
  latitude: number
  longitude: number
  avatar_url: string | null
}

export default function Map() {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadMembers()
  }, [])

  const loadMembers = async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await api.get('/user/map/members')
      setMembers(res.data.data || [])
    } catch (err: unknown) {
      console.error('Error loading map members:', err)
      setError('Failed to load members')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 size={32} className="animate-spin text-accent" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <MapPin size={48} className="text-text-muted" />
        <p className="text-text-secondary">{error}</p>
      </div>
    )
  }

  if (members.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <MapPin size={48} className="text-text-muted" />
        <p className="text-text-secondary">Пока нет участников на карте</p>
      </div>
    )
  }

  // Calculate center based on members (default to Russia center)
  const avgLat = members.reduce((sum, m) => sum + m.latitude, 0) / members.length
  const avgLng = members.reduce((sum, m) => sum + m.longitude, 0) / members.length
  const center: [number, number] = [avgLat || 55.7558, avgLng || 37.6173]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-display text-text">Карта сообщества</h1>
          <p className="text-text-secondary mt-1">
            {members.length} {members.length === 1 ? 'участник' : members.length < 5 ? 'участника' : 'участников'} на карте
          </p>
        </div>
      </div>

      <div className="bg-bg-card border border-border rounded-lg overflow-hidden shadow-lg">
        <MapContainer
          center={center}
          zoom={4}
          className="h-[600px] w-full"
          scrollWheelZoom={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {members.map((member) => (
            <Marker
              key={member.id}
              position={[member.latitude, member.longitude]}
              icon={customIcon}
            >
              <Popup>
                <div className="p-2 min-w-[160px]">
                  <div className="flex items-center gap-3 mb-2">
                    {member.avatar_url ? (
                      <img
                        src={member.avatar_url}
                        alt={member.name}
                        className="w-10 h-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center">
                        <User size={20} className="text-accent" />
                      </div>
                    )}
                    <div className="flex-1">
                      <h3 className="font-semibold text-text text-sm">{member.name}</h3>
                      {member.city && (
                        <p className="text-xs text-text-secondary">{member.city}</p>
                      )}
                    </div>
                  </div>
                  <Link
                    to={`/profile/${member.id}`}
                    className="block text-center text-xs text-accent hover:underline"
                  >
                    Открыть профиль
                  </Link>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      <div className="bg-bg-card border border-border rounded-lg p-4">
        <p className="text-sm text-text-secondary">
          💡 <strong>Совет:</strong> Вы можете настроить своё отображение на карте в{' '}
          <Link to="/profile" className="text-accent hover:underline">
            настройках профиля
          </Link>
          .
        </p>
      </div>
    </div>
  )
}
