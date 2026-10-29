import { useState } from 'react'
import { Activity, CalendarDays, Camera } from 'lucide-react'
import type { FormEvent } from 'react'
import { AttendanceMonitor } from './AttendanceMonitor'
import { CameraAttendance } from './CameraAttendance'

type WorkspaceRole = 'sales' | 'product' | 'delivery' | 'admin' | 'super-admin'
type AttendanceTab = 'attendance' | 'monitor' | 'recap'

type AttendanceWorkspaceProps = {
  userName: string
  photo: string
  setPhoto: (value: string) => void
  attendanceDone: string
  attendanceRecordId: string | null
  handleAttendance: (event: FormEvent<HTMLFormElement>) => Promise<boolean>
  onLocationChange: (location: { latitude: number; longitude: number; label: string } | null) => void
  userRole: WorkspaceRole
}

export function AttendanceWorkspace({ userName, photo, setPhoto, attendanceDone, attendanceRecordId, handleAttendance, onLocationChange, userRole }: AttendanceWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<AttendanceTab>('attendance')

  if (userRole !== 'admin' && userRole !== 'super-admin') {
    return <CameraAttendance userName={userName} photo={photo} setPhoto={setPhoto} attendanceDone={attendanceDone} attendanceRecordId={attendanceRecordId} handleAttendance={handleAttendance} onLocationChange={onLocationChange} />
  }

  const tabs = [
    { id: 'attendance' as const, label: 'Absensi', icon: Camera },
    { id: 'monitor' as const, label: 'Monitor', icon: Activity },
    { id: 'recap' as const, label: 'Rekap', icon: CalendarDays },
  ]

  return (
    <section className="attendance-hub dashboard-content">
      <header className="attendance-hub-header">
        <div>
          <p className="eyebrow">Attendance workspace</p>
          <h1>Absensi & kehadiran.</h1>
          <p className="muted">Check-in, pantau tim, dan tinjau riwayat dalam satu tempat.</p>
        </div>
        <div className="attendance-hub-tabs" role="tablist" aria-label="Fitur absensi">
          {tabs.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                className={activeTab === tab.id ? 'active' : ''}
                onClick={() => setActiveTab(tab.id)}
              >
                <Icon size={16} /> {tab.label}
              </button>
            )
          })}
        </div>
      </header>

      {activeTab === 'attendance' ? (
        <CameraAttendance userName={userName} photo={photo} setPhoto={setPhoto} attendanceDone={attendanceDone} attendanceRecordId={attendanceRecordId} handleAttendance={handleAttendance} onLocationChange={onLocationChange} />
      ) : (
        <AttendanceMonitor page={activeTab === 'recap' ? 'recap' : 'monitor'} />
      )}
    </section>
  )
}