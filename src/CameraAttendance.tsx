import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Camera, CheckCircle2, CircleAlert, Clock3, MapPin, ShieldCheck } from 'lucide-react'
import './App.css'

type CameraAttendanceProps = { userName: string; photo: string; setPhoto: (value: string) => void; attendanceDone: string; attendanceRecordId: string | null; handleAttendance: (event: FormEvent<HTMLFormElement>) => Promise<boolean>; onLocationChange: (location: { latitude: number; longitude: number; label: string } | null) => void }
type LocationInfo = { latitude: number; longitude: number; accuracy: number; label: string }

async function getLocationLabel(latitude: number, longitude: number) {
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&lat=${latitude}&lon=${longitude}`)
    if (!response.ok) throw new Error('Reverse geocoding failed')

    const data = await response.json() as { name?: string; display_name?: string; address?: Record<string, string> }
    const address = data.address ?? {}
    const road = address.road || address.pedestrian
    const displayParts = (data.display_name ?? '').split(',').map((part) => part.trim()).filter(Boolean)
    const roadIndex = road ? displayParts.findIndex((part) => part.toLocaleLowerCase('id').includes(road.toLocaleLowerCase('id'))) : -1
    const roadSegment = roadIndex >= 0 ? displayParts[roadIndex] : ''
    const houseNumberFromDisplay = roadIndex >= 0
      ? [displayParts[roadIndex - 1], displayParts[roadIndex + 1]].find((part) => part && /^(?:no\.?\s*)?\d+[a-z]?(?:[-/]\d+[a-z]?)?$/i.test(part))
        || roadSegment.match(/\bno\.?\s*(\d+[a-z]?(?:[-/]\d+[a-z]?)?)\s*$/i)?.[1]
      : undefined
    const houseNumber = address.house_number || address.street_number || houseNumberFromDisplay
    const street = [houseNumber, road].filter(Boolean).join(' ')
    const locality = address.neighbourhood || address.village || address.suburb || address.city_district
    const city = address.city || address.town || address.village || address.municipality
    const parts = [street, locality, city].filter((part, index, all): part is string => Boolean(part) && all.findIndex((candidate) => candidate?.toLocaleLowerCase('id') === part?.toLocaleLowerCase('id')) === index)

    return parts.length ? parts.join(', ') : `Koordinat ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
  } catch {
    return 'Alamat sekitar tidak ditemukan'
  }
}

export function CameraAttendance({ userName, photo, setPhoto, attendanceDone, attendanceRecordId, handleAttendance, onLocationChange }: CameraAttendanceProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const mountedRef = useRef(false)
  const [cameraError, setCameraError] = useState('')
  const [location, setLocation] = useState<LocationInfo | null>(null)
  const [locationError, setLocationError] = useState('')
  const [isLocating, setIsLocating] = useState(false)
  const [isRetaking, setIsRetaking] = useState(false)
  const [savedPhoto, setSavedPhoto] = useState(() => attendanceRecordId ? photo : '')
  const [isSaving, setIsSaving] = useState(false)
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>(() => window.matchMedia('(orientation: landscape)').matches ? 'landscape' : 'portrait')

  useEffect(() => {
    if (attendanceRecordId && photo && !isRetaking) setSavedPhoto(photo)
  }, [attendanceRecordId, isRetaking, photo])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(orientation: landscape)')
    const syncDeviceOrientation = () => {
      if (!photo) setOrientation(mediaQuery.matches ? 'landscape' : 'portrait')
    }
    syncDeviceOrientation()
    mediaQuery.addEventListener('change', syncDeviceOrientation)
    return () => mediaQuery.removeEventListener('change', syncDeviceOrientation)
  }, [photo])

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError('Browser ini tidak mendukung lokasi. Izinkan Location di pengaturan browser.')
      onLocationChange(null)
      return
    }

    setIsLocating(true)
    setLocationError('')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!mountedRef.current) return
        const latitude = position.coords.latitude
        const longitude = position.coords.longitude
        const accuracy = position.coords.accuracy
        setLocation({ latitude, longitude, accuracy, label: 'Mencari alamat terdekat...' })

        const labelPromise = accuracy > 100
          ? Promise.resolve('Nama tempat tidak ditampilkan karena akurasi lokasi rendah.')
          : getLocationLabel(latitude, longitude)
        void labelPromise.then((label) => {
          if (!mountedRef.current) return
          const nextLocation = { latitude, longitude, accuracy, label }
          setLocation(nextLocation)
          onLocationChange(nextLocation)
          setIsLocating(false)
        })
      },
      (error) => {
        if (!mountedRef.current) return
        const message = error.code === error.PERMISSION_DENIED
          ? 'Izin lokasi ditolak. Aktifkan Location untuk situs ini di pengaturan browser.'
          : error.code === error.TIMEOUT
            ? 'Lokasi belum ditemukan. Coba ambil ulang.'
            : 'Lokasi tidak tersedia. Periksa pengaturan lokasi perangkat.'
        setLocationError(message)
        setIsLocating(false)
        onLocationChange(null)
      },
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 }
    )
  }, [onLocationChange])

  useEffect(() => {
    let mounted = true
    mountedRef.current = true
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'user' }, audio: false }).then((stream) => {
      if (!mounted) { stream.getTracks().forEach((track) => track.stop()); return }
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
    }).catch(() => setCameraError('Akses kamera ditolak atau kamera tidak tersedia.'))

    requestLocation()

    return () => {
      mounted = false
      mountedRef.current = false
      streamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [requestLocation])

  useEffect(() => {
    if (photo || !videoRef.current || !streamRef.current || (attendanceRecordId && !isRetaking)) return
    videoRef.current.srcObject = streamRef.current
    void videoRef.current.play().catch(() => setCameraError('Kamera gagal dimulai ulang. Coba muat ulang halaman.'))
  }, [attendanceRecordId, isRetaking, photo])

  function capturePhoto() {
    const video = videoRef.current
    if (!video || video.readyState < 2) return
    const sourceWidth = video.videoWidth
    const sourceHeight = video.videoHeight
    if (!sourceWidth || !sourceHeight) return

    const targetRatio = orientation === 'portrait' ? 3 / 4 : 4 / 3
    let cropWidth = sourceWidth
    let cropHeight = sourceHeight
    let cropX = 0
    let cropY = 0

    if (sourceWidth / sourceHeight > targetRatio) {
      cropWidth = sourceHeight * targetRatio
      cropX = (sourceWidth - cropWidth) / 2
    } else {
      cropHeight = sourceWidth / targetRatio
      cropY = (sourceHeight - cropHeight) / 2
    }

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(cropWidth)
    canvas.height = Math.round(cropHeight)
    canvas.getContext('2d')?.drawImage(video, cropX, cropY, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height)
    setPhoto(canvas.toDataURL('image/jpeg', 0.86))
  }

  async function submitAttendance(event: FormEvent<HTMLFormElement>) {
    setIsSaving(true)
    try {
      const saved = await handleAttendance(event)
      if (saved) {
        if (attendanceRecordId) setSavedPhoto(photo)
        setIsRetaking(false)
      }
    } finally {
      setIsSaving(false)
    }
  }

  function startRetake() {
    setIsRetaking(true)
    setPhoto('')
  }

  const canSubmit = Boolean(photo && (!attendanceRecordId || isRetaking) && !isSaving)
  const displayedPhoto = attendanceRecordId && !isRetaking ? savedPhoto || photo : photo || savedPhoto
  const showCamera = !attendanceRecordId || isRetaking
  const formattedTime = attendanceDone ? new Date(attendanceDone).toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'short' }) : ''
  const locationText = location ? location.label : locationError || 'Getting your current location...'

  return (
    <section className="attendance-view">
      <div className="attendance-heading-row">
        <div>
          <p className="eyebrow">Absensi Sales</p>
          <h1>Absensi harian</h1>
          <p className="muted">Ambil foto langsung untuk mencatat kehadiran.</p>
        </div>
        <span className="attendance-security"><ShieldCheck size={17} /><span><strong>Foto dan lokasi tercatat</strong><small>{attendanceRecordId ? 'Check-in hari ini sudah tersimpan' : 'Periksa foto sebelum mengirim'}</small></span></span>
      </div>

      <div className="attendance-workspace-grid">
        <form className="attendance-capture-panel" onSubmit={(event) => void submitAttendance(event)}>
          <div className="attendance-panel-topline">
            <span><Camera size={17} /> Foto kehadiran</span>
            <small>{attendanceRecordId ? 'SUDAH CHECK-IN' : 'LANGKAH 1 / 1'}</small>
          </div>
          <div className="attendance-user">
            <span className="profile-avatar">{userName.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</span>
            <span><small>Nama user</small><strong>{userName}</strong></span>
          </div>
          <div className="attendance-format-note"><span>Format foto otomatis</span><strong>{orientation === 'portrait' ? 'Potret · menyesuaikan layar' : 'Lanskap · menyesuaikan layar'}</strong></div>
          <div className={`camera-frame is-${orientation} ${photo || displayedPhoto ? 'has-photo' : ''}`}>
            {showCamera
              ? photo ? <img src={photo} alt="Preview foto absensi" /> : <video ref={videoRef} autoPlay muted playsInline />
              : displayedPhoto ? <img src={displayedPhoto} alt="Foto absensi tersimpan" /> : <div className="attendance-photo-empty"><Camera size={24} /><strong>Foto tersimpan tidak tersedia</strong><small>Ambil foto pengganti untuk memperbarui check-in hari ini.</small></div>}
            {showCamera && !photo && !cameraError && <span className="camera-guide" aria-hidden="true"><i /><i /><i /><i /></span>}
            <span className="camera-format-badge">{orientation === 'portrait' ? 'POTRET · 3:4' : 'LANSKAP · 4:3'}</span>
          </div>
          {cameraError && <p className="camera-message error"><CircleAlert size={14} />{cameraError}</p>}
          <div className="attendance-action-row">
            <div className="attendance-camera-actions">
              {attendanceRecordId && !isRetaking && <button className="retake-button" type="button" onClick={startRetake}><Camera size={15} /> Ganti foto check-in</button>}
              {showCamera && !photo && !cameraError && <button className="capture-button" type="button" onClick={capturePhoto}><Camera size={17} /> Ambil foto</button>}
              {showCamera && photo && <div className="attendance-retake-group"><button className="retake-button" type="button" onClick={() => setPhoto('')}><Camera size={15} /> Ambil ulang foto</button>{attendanceRecordId && <small>Foto tersimpan belum berubah sampai pengganti disimpan.</small>}</div>}
            </div>
            {showCamera && <button className="submit-button" type="submit" disabled={!canSubmit}>{isSaving ? 'Menyimpan...' : attendanceRecordId ? 'Simpan foto pengganti' : 'Kirim absensi'} <CheckCircle2 size={18} /></button>}
          </div>
          {attendanceRecordId && isRetaking && <p className="attendance-retake-location-note"><MapPin size={13} /> Lokasi check-in awal tetap tersimpan dan tidak berubah.</p>}
        </form>

        <aside className="attendance-side-column">
          <section className="attendance-location-panel">
            <div className="attendance-side-heading"><span className="attendance-side-icon"><MapPin size={17} /></span><span><strong>Location check</strong><small>Used to verify your check-in</small></span></div>
            <div className={`location-status ${location ? 'ready' : 'waiting'}`}>
              <MapPin size={15} />
              <span>
                {location ? <>
                  <strong className="location-coordinates">{location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}</strong>
                  <small className="location-accuracy">Akurasi GPS sekitar ±{Math.round(location.accuracy)} m</small>
                  <span className="location-address"><strong>Alamat sekitar (perkiraan):</strong> {location.label}</span>
                  {location.accuracy > 100 && <small role="status">Lokasi meleset lebih dari 100 m. Coba ambil ulang atau aktifkan Location Services pada perangkat.</small>}
                </> : locationText}
              </span>
            </div>
            <button className="secondary-button" type="button" onClick={requestLocation} disabled={isLocating}>
              <MapPin size={15} /> {isLocating ? 'Mencari lokasi...' : 'Ambil ulang lokasi'}
            </button>
            {location && <a className="attendance-map-link" href={`https://maps.google.com/?q=${location.latitude},${location.longitude}`} target="_blank" rel="noreferrer">View on map <MapPin size={13} /></a>}
          </section>

          <section className={`attendance-status ${attendanceDone ? 'is-complete' : 'is-pending'}`}>
            {attendanceDone ? (
              <>
                <div className="status-icon"><CheckCircle2 size={24} /></div>
                <p className="eyebrow">Sudah check-in</p>
                <h2>Absensi tercatat</h2>
                <p className="attendance-recorded-time"><Clock3 size={14} /> {formattedTime}</p>
                {location && <p className="recorded-location"><MapPin size={13} /> {locationText}</p>}
                {displayedPhoto ? <img className="attendance-photo" src={displayedPhoto} alt="Foto absensi tersimpan" /> : <div className="attendance-photo-empty is-compact"><Camera size={18} /><span>Foto check-in belum tersedia</span></div>}
              </>
            ) : (
              <>
                <div className="empty-icon"><Clock3 size={22} /></div>
                <p className="eyebrow">Status hari ini</p>
                <h2>Belum check-in</h2>
                <p>Foto, waktu, dan lokasi akan tercatat setelah absensi dikirim.</p>
              </>
            )}
          </section>
        </aside>
      </div>
    </section>
  )
}
