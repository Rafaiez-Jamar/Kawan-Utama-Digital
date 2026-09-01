import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Camera, CheckCircle2, CircleAlert, MapPin, ShieldCheck } from 'lucide-react'
import './App.css'

type CameraAttendanceProps = { userName: string; photo: string; setPhoto: (value: string) => void; attendanceDone: string; handleAttendance: (event: FormEvent<HTMLFormElement>) => void; onLocationChange: (location: { latitude: number; longitude: number; label: string } | null) => void }
type LocationInfo = { latitude: number; longitude: number; label: string }

async function getLocationLabel(latitude: number, longitude: number) {
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`)
    if (!response.ok) throw new Error('Reverse geocoding failed')

    const data = await response.json() as { display_name?: string }
    const placeName = data.display_name?.trim()

    if (!placeName) {
      return `Koordinat ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
    }

    return placeName.split(',').slice(0, 4).join(', ')
  } catch {
    return `Koordinat ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
  }
}

export function CameraAttendance({ userName, photo, setPhoto, attendanceDone, handleAttendance, onLocationChange }: CameraAttendanceProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraError, setCameraError] = useState('')
  const [location, setLocation] = useState<LocationInfo | null>(null)
  const [locationError, setLocationError] = useState('')

  useEffect(() => {
    let mounted = true
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'user' }, audio: false }).then((stream) => {
      if (!mounted) { stream.getTracks().forEach((track) => track.stop()); return }
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
    }).catch(() => setCameraError('Akses kamera ditolak atau kamera tidak tersedia.'))

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = position.coords.latitude
        const longitude = position.coords.longitude
        const fallbackLocation = { latitude, longitude, label: 'Mencari nama lokasi...' }

        setLocation(fallbackLocation)

        void getLocationLabel(latitude, longitude).then((label) => {
          if (!mounted) return
          const nextLocation = { latitude, longitude, label }
          setLocation(nextLocation)
          onLocationChange(nextLocation)
        })
      },
      () => {
        setLocationError('Lokasi tidak dapat diakses. Izinkan Location untuk melanjutkan.')
        onLocationChange(null)
      }
    )

    return () => {
      mounted = false
      streamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [onLocationChange])

  function capturePhoto() {
    const video = videoRef.current
    if (!video || video.readyState < 2) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)
    setPhoto(canvas.toDataURL('image/jpeg', 0.86))
  }

  const canSubmit = Boolean(photo && !attendanceDone)
  const formattedTime = attendanceDone ? new Date(attendanceDone).toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'short' }) : ''
  const locationText = location ? location.label : locationError || 'Getting your current location...'

  return <section className="attendance-view dashboard-content"><div className="settings-header"><div><p className="eyebrow">Absensi Sales</p><h1>Record your attendance.</h1><p className="muted">Take a live camera photo to record your arrival.</p></div><span className="access-note"><ShieldCheck size={17} /><span><strong>Camera-only check-in</strong><small>Time and location are recorded</small></span></span></div><div className="attendance-grid"><form className="attendance-panel" onSubmit={handleAttendance}><div className="panel-heading"><div className="panel-icon"><Camera size={18} /></div><div><h2>Check-in attendance</h2><p>Photo, name, time, and location are required.</p></div></div><div className="attendance-user"><span className="profile-avatar">{userName.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</span><span><small>Logged in as</small><strong>{userName}</strong></span></div><div className="camera-frame">{photo ? <img src={photo} alt="Captured attendance" /> : <video ref={videoRef} autoPlay muted playsInline />}</div>{cameraError ? <p className="camera-message error"><CircleAlert size={14} />{cameraError}</p> : !photo && <button className="capture-button" type="button" onClick={capturePhoto}><Camera size={17} /> Capture photo</button>}<div className={`location-status ${location ? 'ready' : 'waiting'}`}><MapPin size={15} /><span>{locationText}</span></div>{photo && <button className="retake-button" type="button" onClick={() => setPhoto('')}>Retake photo</button>}<button className="submit-button" type="submit" disabled={!canSubmit}>{attendanceDone ? 'Attendance recorded' : 'Submit attendance'} <CheckCircle2 size={18} /></button></form><div className="attendance-status">{attendanceDone ? <><div className="status-icon"><CheckCircle2 size={24} /></div><p className="eyebrow">Checked in</p><h2>Attendance recorded.</h2><p>{formattedTime}</p>{location && <p className="recorded-location"><MapPin size={13} /> {locationText}</p>}<img className="attendance-photo" src={photo} alt="Submitted attendance" /></> : <><div className="empty-icon"><MapPin size={24} /></div><h2>Not checked in yet</h2><p>Your live photo, time, and current location will be recorded here.</p></>}</div></div></section>
}
