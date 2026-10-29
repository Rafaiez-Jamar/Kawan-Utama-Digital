import { useEffect, useState } from 'react'
import { CalendarDays, Camera, CheckCircle2, Clock3, MapPin, RefreshCw, UserRound, XCircle } from 'lucide-react'
import { localApi } from './lib/localApi'
import './App.css'

type AttendanceRecord = { id: string; user_name: string; user_email: string; location_label: string | null; latitude: number | null; longitude: number | null; photo_data: string | null; created_at: string }
type AttendanceUser = { id: string; name: string; email: string; role: string }
type PresenceRecord = { session_id: string; user_name: string; user_email: string; role: string; login_at: string; last_seen: string; is_online: boolean }
type AttendanceMonitorPage = 'monitor' | 'recap'

function formatDate(value: string) {
  return new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value))
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(value))
}

export function AttendanceMonitor({ page }: { page: AttendanceMonitorPage }) {
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [users, setUsers] = useState<AttendanceUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [presence, setPresence] = useState<PresenceRecord[]>([])
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().getMonth())
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear())
  const todayRecords = records.filter((record) => new Date(record.created_at).toDateString() === new Date().toDateString())
  const presentByEmail = new Map<string, AttendanceRecord>()
  todayRecords.forEach((record) => {
    const email = record.user_email.toLowerCase()
    if (!presentByEmail.has(email)) presentByEmail.set(email, record)
  })
  const monitorUsers = users.map((user) => ({ user, record: presentByEmail.get(user.email.toLowerCase()) }))
  const availableYears = [...new Set([...records.map((record) => new Date(record.created_at).getFullYear()), new Date().getFullYear()])].sort((left, right) => right - left)
  const monthlyRecords = records.filter((record) => {
    const date = new Date(record.created_at)
    return date.getMonth() === selectedMonth && date.getFullYear() === selectedYear
  })
  const monthlySalesCount = new Set(monthlyRecords.map((record) => record.user_email.toLowerCase())).size
  const visibleRecords = page === 'monitor' ? todayRecords : monthlyRecords
  const selectedMonthLabel = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(new Date(selectedYear, selectedMonth, 1))

  async function loadRecords() {
    setLoading(true)
    setError('')
    const startDate = page === 'monitor'
      ? new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())
      : new Date(selectedYear, selectedMonth, 1)
    const endDate = page === 'monitor'
      ? new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + 1)
      : new Date(selectedYear, selectedMonth + 1, 1)
    let data: Array<Record<string, unknown>>
    try {
      data = await localApi.attendance(startDate.toISOString(), endDate.toISOString(), true)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Data absensi gagal dimuat.')
      setLoading(false)
      return
    }

    setRecords(data.map((record) => ({
      ...record,
      photo_data: typeof record.photo_data === 'string' ? record.photo_data : null,
    })) as AttendanceRecord[])
    if (page !== 'monitor') {
      setLoading(false)
      return
    }

    try {
      const [userData, presenceData] = await Promise.all([localApi.profiles(), localApi.presence()])
      setUsers(userData as AttendanceUser[])
      setPresence((presenceData as PresenceRecord[]).filter((item) => item.is_online && Date.now() - new Date(item.last_seen).getTime() < 90000))
    } catch (error) {
      setError(`Rekap absensi berhasil dimuat, tetapi monitor gagal dimuat: ${error instanceof Error ? error.message : 'Kesalahan tidak diketahui.'}`)
      setUsers([])
      setPresence([])
    }
    setLoading(false)
  }

  useEffect(() => {
    void loadRecords()
    if (page !== 'monitor') return
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadRecords()
    }, 60000)
    return () => window.clearInterval(timer)
  }, [page, selectedMonth, selectedYear])

  return (
    <section className={`attendance-monitor ${page === 'recap' ? 'attendance-monitor-recap' : 'attendance-monitor-live'}`}>
      <div className="settings-header">
        <div>
          <p className="eyebrow">{page === 'monitor' ? 'Live attendance' : 'Attendance records'}</p>
          <h1>{page === 'monitor' ? 'Monitor kehadiran.' : 'Rekap absensi.'}</h1>
          <p className="muted">{page === 'monitor' ? 'Pantau aktivitas tim dan check-in hari ini.' : 'Filter rekap foto absensi per bulan. Data bulan sebelumnya tetap tersimpan.'}</p>
        </div>
        <button className="capture-button monitor-refresh" onClick={() => void loadRecords()}><RefreshCw size={15} /> Refresh data</button>
      </div>

      {page === 'monitor' && (
        <div className="presence-panel">
          <div className="presence-heading">
            <div><p className="eyebrow">Live workspace</p><h2>User yang sedang aktif</h2></div>
            <span className="online-count">{presence.length} online</span>
          </div>
          {presence.length === 0 ? <p className="presence-empty">Belum ada user yang terdeteksi aktif.</p> : (
            <div className="presence-list">
              {presence.map((item) => <div className="presence-user" key={item.session_id}><span className="online-dot" /><span><strong>{item.user_name}</strong><small>{item.role} · terakhir aktif {formatTime(item.last_seen)}</small></span></div>)}
            </div>
          )}
        </div>
      )}

      {page === 'recap' && (
        <div className="attendance-recap-toolbar">
          <div><p className="eyebrow">Rekap bulanan</p><strong>{selectedMonthLabel}</strong></div>
          <div className="attendance-recap-filters">
            <label><span>Bulan</span><select value={selectedMonth} onChange={(event) => setSelectedMonth(Number(event.target.value))}>{Array.from({ length: 12 }, (_, month) => <option key={month} value={month}>{new Intl.DateTimeFormat('id-ID', { month: 'long' }).format(new Date(2026, month, 1))}</option>)}</select></label>
            <label><span>Tahun</span><select value={selectedYear} onChange={(event) => setSelectedYear(Number(event.target.value))}>{availableYears.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
          </div>
        </div>
      )}

      <div className="attendance-summary">
        {page === 'monitor' ? <>
          <div><span>Hadir hari ini</span><strong>{presentByEmail.size}</strong><small>Sudah check-in</small></div>
          <div><span>Belum hadir</span><strong>{Math.max(0, users.length - presentByEmail.size)}</strong><small>Belum ada check-in hari ini</small></div>
          <div><span>Tim online</span><strong>{presence.length}</strong><small>Aktif dalam 90 detik terakhir</small></div>
        </> : <>
          <div><span>{`Check-in ${selectedMonthLabel}`}</span><strong>{monthlyRecords.length}</strong><small>Sesuai filter bulan</small></div>
          <div><span>Sales check-in</span><strong>{monthlySalesCount}</strong><small>Sales unik di bulan terpilih</small></div>
        </>}
      </div>
      {loading ? <div className="monitor-empty">Memuat data absensi...</div> : error ? <div className="monitor-empty error">Gagal memuat rekap: {error}</div> : page === 'monitor' ? (
        monitorUsers.length === 0 ? <div className="monitor-empty"><UserRound size={24} /><strong>Daftar user belum tersedia</strong><small>Pastikan profil user sudah terdaftar.</small></div> : <div className="attendance-record-list">
          {monitorUsers.map(({ user, record }) => (
            <article className="attendance-record" key={user.id}>
              <div className="attendance-record-photo" aria-label={record?.photo_data ? `Foto absensi ${user.name}` : `Belum ada foto absensi ${user.name}`}>
                {record?.photo_data ? <img src={record.photo_data} alt={`Foto absensi ${user.name}`} /> : <UserRound size={25} />}
              </div>
              <div className="attendance-record-main">
                <div className="attendance-record-heading"><div><h2>{user.name}</h2><p>{user.email} · {user.role}</p></div><span className={`attendance-present ${record ? '' : 'is-absent'}`}>{record ? <><CheckCircle2 size={13} /> Hadir</> : <><XCircle size={13} /> Belum hadir</>}</span></div>
                {record ? <div className="attendance-meta"><span><CalendarDays size={14} /><strong>{formatDate(record.created_at)}</strong></span><span><Clock3 size={14} /><strong>{formatTime(record.created_at)}</strong></span><span><MapPin size={14} /><strong>{record.location_label || 'Lokasi tidak tersedia'}</strong></span></div> : <small className="attendance-absent-note">Belum ada check-in hari ini</small>}
                {record && record.latitude !== null && record.longitude !== null && <a className="attendance-coordinates" href={`https://www.google.com/maps?q=${record.latitude},${record.longitude}`} target="_blank" rel="noreferrer"><MapPin size={13} /> Maps · {record.latitude.toFixed(6)}, {record.longitude.toFixed(6)}</a>}
              </div>
              <span className="attendance-record-avatar"><UserRound size={16} /></span>
            </article>
          ))}
        </div>
      ) : visibleRecords.length === 0 ? (
        <div className="monitor-empty"><Camera size={24} /><strong>{`Belum ada check-in pada ${selectedMonthLabel}`}</strong><small>Pilih bulan lain untuk melihat arsip absensi.</small></div>
      ) : (
        <div className="attendance-record-list">
          {visibleRecords.map((record) => (
            <article className="attendance-record" key={record.id}>
              <div className="attendance-record-photo" aria-label={record.photo_data ? `Foto absensi ${record.user_name}` : `Foto absensi ${record.user_name} tidak tersedia`}>
                {record.photo_data ? <img src={record.photo_data} alt={`Foto absensi ${record.user_name}`} /> : <UserRound size={25} />}
              </div>
              <div className="attendance-record-main">
                <div className="attendance-record-heading"><div><h2>{record.user_name}</h2><p>{record.user_email}</p></div><span className="attendance-present">Hadir</span></div>
                <div className="attendance-meta"><span><CalendarDays size={14} /><strong>{formatDate(record.created_at)}</strong></span><span><Clock3 size={14} /><strong>{formatTime(record.created_at)}</strong></span><span><MapPin size={14} /><strong>{record.location_label || 'Lokasi tidak tersedia'}</strong></span></div>
                {record.latitude !== null && record.longitude !== null && <a className="attendance-coordinates" href={`https://www.google.com/maps?q=${record.latitude},${record.longitude}`} target="_blank" rel="noreferrer"><MapPin size={13} /> Maps · {record.latitude.toFixed(6)}, {record.longitude.toFixed(6)}</a>}
              </div>
              <span className="attendance-record-avatar"><UserRound size={16} /></span>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}