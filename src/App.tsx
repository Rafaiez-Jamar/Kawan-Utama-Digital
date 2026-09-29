import { useEffect, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { ArrowLeft, ArrowRight, BarChart3, Boxes, Camera, CheckCircle2, ChevronDown, CircleHelp, ClipboardCheck, FileText, Funnel, LayoutDashboard, LockKeyhole, LogOut, MapPin, Menu, Package, Pencil, Send, Settings, ShieldCheck, Target, Trash2, UserRound, UsersRound, X } from 'lucide-react'
import logo from './assets/kawan-utama-digital.png'
import { CameraAttendance } from './CameraAttendance'
import { MOMView } from './MOMView'
import { SPHView } from './SPHView'
import { FunnelView } from './FunnelView'
import { supabase } from './lib/supabase'
import './App.css'

type Role = 'sales' | 'product' | 'delivery' | 'tech' | 'admin' | 'super-admin'
type UserRole = Exclude<Role, 'super-admin'>
type User = { name: string; email: string; password: string; role: Role }
type NavItem = { label: string; icon: typeof LayoutDashboard }
type AttendanceRecord = { id: string; event: 'login' | 'photo'; userName: string; userEmail: string; role: Role; photo: string; locationLabel: string; latitude: number | null; longitude: number | null; createdAt: string; attendanceType?: 'Hadir' | 'Izin' | 'Cuti'; reason?: string }

const superAdmin: User = { name: 'Sarah Anderson', email: 'superadmin@kawanutama.com', password: 'Admin123!', role: 'super-admin' }
const roles: { value: Role; label: string; description: string }[] = [
  { value: 'sales', label: 'Sales', description: 'Kelola pelanggan dan penjualan' },
  { value: 'product', label: 'Product', description: 'Kelola katalog dan produk' },
  { value: 'delivery', label: 'Delivery', description: 'Kelola pengiriman dan pemenuhan pesanan' },
  { value: 'tech', label: 'Tech', description: 'Kelola kebutuhan teknis dan instalasi' },
  { value: 'admin', label: 'Admin', description: 'Kelola operasional aplikasi' },
  { value: 'super-admin', label: 'Super Admin', description: 'Akses penuh ke seluruh sistem' },
]
const navByRole: Record<Role, NavItem[]> = {
  sales: [{ label: 'Dashboard', icon: LayoutDashboard }, { label: 'Absensi', icon: LayoutDashboard }, { label: 'Project Funnel', icon: Funnel }, { label: 'Sales Target', icon: Target }, { label: 'MOM', icon: BarChart3 }, { label: 'Request Product', icon: Boxes }, { label: 'Request Partner', icon: Boxes }, { label: 'Request SPH', icon: ArrowRight }, { label: 'Penawaran B2B', icon: ArrowRight }],
  product: [{ label: 'Dashboard', icon: LayoutDashboard }, { label: 'Request Harga Partner', icon: Boxes }, { label: 'Input RAB', icon: Funnel }, { label: 'History Distributor', icon: BarChart3 }, { label: 'Project Funnel', icon: Funnel }, { label: 'Penawaran B2B', icon: Boxes }, { label: 'View MOM Terkait', icon: BarChart3 }],
  delivery: [{ label: 'Dashboard', icon: LayoutDashboard }, { label: 'Request Inbox', icon: Boxes }, { label: 'Ambil Barang', icon: ClipboardCheck }, { label: 'Kirim Barang', icon: Send }, { label: 'Stok Barang', icon: Package }, { label: 'Project Funnel', icon: Funnel }, { label: 'Penawaran B2B', icon: Boxes }],
  tech: [{ label: 'Dashboard', icon: LayoutDashboard }, { label: 'Request Inbox', icon: Boxes }, { label: 'Ticketing', icon: ClipboardCheck }, { label: 'Project Funnel', icon: Funnel }, { label: 'Penawaran B2B', icon: Boxes }],
  admin: [{ label: 'Dashboard', icon: LayoutDashboard }, { label: 'Delivery Monitor', icon: Package }, { label: 'Request Inbox', icon: Boxes }, { label: 'PO Vendor', icon: Package }, { label: 'Payment', icon: ClipboardCheck }, { label: 'Project Funnel', icon: Funnel }, { label: 'Sales Target', icon: Target }, { label: 'Rekap Login', icon: LayoutDashboard }, { label: 'Rekap Absensi', icon: ClipboardCheck }, { label: 'Audit MOM', icon: BarChart3 }, { label: 'Penawaran B2B', icon: ShieldCheck }, { label: 'User Management', icon: UsersRound }],
  'super-admin': [{ label: 'Dashboard', icon: LayoutDashboard }, { label: 'Delivery Monitor', icon: Package }, { label: 'PO Vendor', icon: Package }, { label: 'Payment', icon: ClipboardCheck }, { label: 'Project Funnel', icon: Funnel }, { label: 'Sales Target', icon: Target }, { label: 'MOM', icon: BarChart3 }, { label: 'Request Product', icon: Boxes }, { label: 'Request Partner', icon: Boxes }, { label: 'Request SPH', icon: ArrowRight }, { label: 'Penawaran B2B', icon: ArrowRight }, { label: 'View MOM Terkait', icon: BarChart3 }, { label: 'Rekap Login', icon: LayoutDashboard }, { label: 'Rekap Absensi', icon: ClipboardCheck }, { label: 'Audit MOM', icon: BarChart3 }, { label: 'User Management', icon: UsersRound }, { label: 'System settings', icon: Settings }],
}
type SalesTarget = { id: string; sales: string; period: string; amount: number }

function saveAttendanceRecord(record: AttendanceRecord) {
  const current = JSON.parse(localStorage.getItem('kawan-attendance-records') ?? '[]') as AttendanceRecord[]
  const next = [record, ...current].slice(0, 200)
  localStorage.setItem('kawan-attendance-records', JSON.stringify(next))
  window.dispatchEvent(new CustomEvent('attendance-records-updated', { detail: next }))
}

function saveLoginRecord(account: User) {
  const record = (latitude: number | null, longitude: number | null) => saveAttendanceRecord({ id: `attendance-${Date.now()}`, event: 'login', userName: account.name, userEmail: account.email, role: account.role, photo: '', locationLabel: latitude === null || longitude === null ? 'Lokasi tidak tersedia' : 'Koordinat GPS', latitude, longitude, createdAt: new Date().toISOString() })
  if (!navigator.geolocation) {
    record(null, null)
    return
  }
  navigator.geolocation.getCurrentPosition(
    (position) => record(position.coords.latitude, position.coords.longitude),
    () => record(null, null),
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
  )
}

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [role, setRole] = useState<Role>('super-admin')
  const [currentUserName, setCurrentUserName] = useState('Sarah Anderson')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeView, setActiveView] = useState('Overview')
  const [users, setUsers] = useState<User[]>([])
  const [editingEmail, setEditingEmail] = useState<string | null>(null)
  const [newUserName, setNewUserName] = useState('')
  const [newUserEmail, setNewUserEmail] = useState('')
  const [newUserPassword, setNewUserPassword] = useState('')
  const [newUserRole, setNewUserRole] = useState<UserRole>('sales')
  const [salesTargets, setSalesTargets] = useState<SalesTarget[]>(() => {
    try { return JSON.parse(localStorage.getItem('kawan-sales-targets') ?? '[]') as SalesTarget[] } catch { return [] }
  })
  const [attendancePhoto, setAttendancePhoto] = useState('')
  const [attendanceLocation, setAttendanceLocation] = useState<{ latitude: number; longitude: number; label: string } | null>(null)
  const [attendanceDone, setAttendanceDone] = useState(() => localStorage.getItem('kawan-attendance') ?? '')
  const activeRole = roles.find((item) => item.value === role) ?? roles[0]
  const saveUsersLocally = (nextUsers: User[]) => {
    localStorage.setItem('kawan-users', JSON.stringify(nextUsers))
    setUsers(nextUsers)
  }
  useEffect(() => { localStorage.setItem('kawan-sales-targets', JSON.stringify(salesTargets)) }, [salesTargets])

  // Load users from Supabase on component mount
  useEffect(() => {
    const loadUsers = async () => {
      const savedUsers = localStorage.getItem('kawan-users')
      if (!supabase) {
        if (savedUsers) setUsers(JSON.parse(savedUsers) as User[])
        return
      }
      try {
        const { data, error } = await supabase.from('users').select('*').order('created_at', { ascending: true })
        if (error) {
          console.error('Error loading users:', error)
          if (savedUsers) setUsers(JSON.parse(savedUsers) as User[])
        } else {
          const remoteUsers = (data || []) as User[]
          const localUsers = savedUsers ? JSON.parse(savedUsers) as User[] : []
          const mergedUsers = [...remoteUsers.filter((remoteUser) => !localUsers.some((localUser) => localUser.email.toLowerCase() === remoteUser.email.toLowerCase() && localUser.password)), ...localUsers]
          saveUsersLocally(mergedUsers)
        }
      } catch (err) {
        console.error('Failed to load users:', err)
        if (savedUsers) setUsers(JSON.parse(savedUsers) as User[])
      }
    }
    loadUsers()
  }, [])

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    let storedUsers: User[] = []
    try {
      storedUsers = JSON.parse(localStorage.getItem('kawan-users') ?? '[]') as User[]
    } catch (error) {
      console.error('Failed to read saved users:', error)
    }
    const availableUsers = [...users, ...storedUsers].filter((user, index, collection) => collection.findIndex((candidate) => candidate.email.toLowerCase() === user.email.toLowerCase()) === index)
    const normalizedEmail = email.trim().toLowerCase()
    const normalizedPassword = password.trim()
    let account = [superAdmin, ...availableUsers].find((user) => user.email.trim().toLowerCase() === normalizedEmail && String(user.password).trim() === normalizedPassword)
    if (!account && supabase) {
      const { data, error } = await supabase.from('users').select('*').ilike('email', normalizedEmail).maybeSingle()
      if (error) {
        console.error('Failed to find login account:', error)
      } else if (data && String(data.password ?? '').trim() === normalizedPassword) {
        account = data as User
        saveUsersLocally([...availableUsers.filter((user) => user.email.toLowerCase() !== account?.email.toLowerCase()), account])
      }
    }
    if (account) {
      setCurrentUserName(account.name)
      setRole(account.role)
      setActiveView('Dashboard')
      setIsLoggedIn(true)
      saveLoginRecord(account)
      return
    }
    alert('Email atau password salah. Pastikan akun sudah tersimpan dan data login sesuai.')
  }

  function resetUserForm() {
    setEditingEmail(null)
    setNewUserName('')
    setNewUserEmail('')
    setNewUserPassword('')
    setNewUserRole('sales')
  }

  async function handleUserSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) {
      const nextUser: User = { name: newUserName.trim(), email: newUserEmail.trim().toLowerCase(), password: newUserPassword, role: newUserRole }
      const nextUsers = editingEmail
        ? users.map((user) => user.email === editingEmail ? nextUser : user)
        : [...users, nextUser]
      saveUsersLocally(nextUsers)
      resetUserForm()
      return
    }

    try {
      if (editingEmail) {
        // Update existing user
        const { error } = await supabase
          .from('users')
          .update({ name: newUserName, email: newUserEmail, password: newUserPassword, role: newUserRole, updated_at: new Date().toISOString() })
          .eq('email', editingEmail)

        if (error) {
          alert('Gagal update user: ' + error.message)
          return
        }

        // Reload users
        const { data } = await supabase.from('users').select('*').order('created_at', { ascending: true })
        const remoteUsers = (data || []) as User[]
        saveUsersLocally([...remoteUsers, ...users.filter((user) => !remoteUsers.some((remoteUser) => remoteUser.email.toLowerCase() === user.email.toLowerCase()))])
      } else {
        // Create new user
        const submittedUser: User = { name: newUserName.trim(), email: newUserEmail.trim().toLowerCase(), password: newUserPassword.trim(), role: newUserRole }
        saveUsersLocally([...users.filter((user) => user.email.toLowerCase() !== submittedUser.email), submittedUser])
        const { error } = await supabase.from('users').insert([
          submittedUser,
        ])

        if (error) {
          alert('Gagal membuat user: ' + error.message)
          return
        }

        // Reload users
        const { data } = await supabase.from('users').select('*').order('created_at', { ascending: true })
        const remoteUsers = (data || []) as User[]
        saveUsersLocally([...remoteUsers, submittedUser, ...users.filter((user) => user.email !== submittedUser.email && !remoteUsers.some((remoteUser) => remoteUser.email.toLowerCase() === user.email.toLowerCase()))])
      }

      resetUserForm()
    } catch (err) {
      console.error('Error in handleUserSubmit:', err)
      alert('Terjadi kesalahan saat menyimpan user')
    }
  }

  function editUser(user: User) {
    setEditingEmail(user.email)
    setNewUserName(user.name)
    setNewUserEmail(user.email)
    setNewUserPassword(user.password)
    setNewUserRole(user.role as UserRole)
  }

  async function deleteUser(userEmail: string) {
    if (!window.confirm('Hapus user ini dari workspace?')) return
    if (!supabase) {
      saveUsersLocally(users.filter((user) => user.email !== userEmail))
      return
    }

    try {
      const { error } = await supabase.from('users').delete().eq('email', userEmail)

      if (error) {
        alert('Gagal hapus user: ' + error.message)
        return
      }

      // Reload users
      const { data } = await supabase.from('users').select('*').order('created_at', { ascending: true })
      saveUsersLocally(data || [])
    } catch (err) {
      console.error('Error deleting user:', err)
      alert('Terjadi kesalahan saat menghapus user')
    }
  }
  async function handleAttendance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!attendancePhoto) return
    const form = new FormData(event.currentTarget)
    const attendanceType = (String(form.get('attendanceType') || 'Hadir')) as AttendanceRecord['attendanceType']
    const reason = String(form.get('reason') || '').trim()
    if (attendanceType !== 'Hadir' && !reason) {
      alert('Isi alasan untuk Izin atau Cuti.')
      return
    }

    const payload = {
      user_name: currentUserName,
      user_email: email || `${currentUserName.toLowerCase().replace(/\s+/g, '.')}@kawanutama.com`, // Fallback email if not available
      location_label: attendanceLocation?.label ?? 'Lokasi tidak tersedia',
      latitude: attendanceLocation?.latitude ?? null,
      longitude: attendanceLocation?.longitude ?? null,
      attendance_type: attendanceType,
      reason,
      created_at: new Date().toISOString(),
    }

    const timestamp = new Date().toISOString()
    saveAttendanceRecord({ id: `attendance-${Date.now()}`, event: 'photo', userName: currentUserName, userEmail: payload.user_email, role, photo: attendancePhoto, locationLabel: payload.location_label, latitude: payload.latitude, longitude: payload.longitude, createdAt: timestamp, attendanceType, reason })

    if (supabase) {
      const { error } = await supabase.from('attendance').insert([payload])
      if (error) {
        console.error('Supabase insert error:', error)
        alert('Foto tersimpan di monitor lokal, tetapi sinkronisasi server gagal: ' + error.message)
      }
    }

    setAttendanceDone(timestamp)
    localStorage.setItem('kawan-attendance', timestamp)
    setAttendancePhoto('')
  }

  if (!isLoggedIn) return <LoginScreen email={email} password={password} showPassword={showPassword} setEmail={setEmail} setPassword={setPassword} setShowPassword={setShowPassword} handleLogin={handleLogin} role={role} setRole={setRole} />

  return <div className="app-shell">
    <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
      <div className="sidebar-topline"><a className="brand brand-sidebar" href="#top"><img className="brand-logo" src={logo} alt="Kawan Utama Digital" /></a><button className="icon-button mobile-close" onClick={() => setMenuOpen(false)} aria-label="Close navigation"><X size={20} /></button></div>
      <div className="workspace-switcher"><span className="workspace-avatar">KU</span><span><small>Workspace</small><strong>Kawan Utama</strong></span><ChevronDown size={16} /></div>
      <nav className="main-nav" aria-label="Main navigation"><p className="nav-label">Workspace</p>{navByRole[role].map((item) => { const Icon = item.icon; return <button className={`nav-item ${activeView === item.label ? 'active' : ''}`} key={item.label} onClick={() => { setActiveView(item.label); setMenuOpen(false) }}><Icon size={18} />{item.label}</button> })}</nav>
      <div className="sidebar-bottom"><button className="nav-item"><CircleHelp size={18} /> Help center</button><div className="profile-card"><span className="profile-avatar">SA</span><span><strong>Sarah Anderson</strong><small>{activeRole.label}</small></span><ChevronDown size={16} /></div></div>
    </aside>
    <main className="dashboard" id="top"><header className="topbar"><button className="icon-button mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Open navigation"><Menu size={21} /></button><div className="breadcrumb"><span>Workspace</span><span>/</span><strong>{activeView}</strong></div><div className="topbar-actions"><span className="role-pill"><ShieldCheck size={15} /> {activeRole.label}</span><button className="sign-out" onClick={() => setIsLoggedIn(false)}><LogOut size={16} /> Sign out</button></div></header>
      {activeView === 'Dashboard' ? <RoleDashboard userName={currentUserName} userRole={role} /> : activeView === 'Delivery Monitor' ? <DeliveryDashboard readOnly /> : activeView === 'Project Funnel' ? <FunnelView userName={currentUserName} userRole={role} /> : activeView === 'Dashboard Delivery' ? <DeliveryDashboard /> : activeView === 'Sales Target' ? <SalesTargetView userName={currentUserName} userRole={role} users={users} targets={salesTargets} setTargets={setSalesTargets} /> : (activeView === 'System settings' || activeView === 'User Management') && role === 'super-admin' ? <SettingsView users={users} editingEmail={editingEmail} newUserName={newUserName} newUserEmail={newUserEmail} newUserPassword={newUserPassword} newUserRole={newUserRole} setNewUserName={setNewUserName} setNewUserEmail={setNewUserEmail} setNewUserPassword={setNewUserPassword} setNewUserRole={setNewUserRole} handleUserSubmit={handleUserSubmit} editUser={editUser} deleteUser={deleteUser} resetUserForm={resetUserForm} /> : activeView === 'Rekap Login' ? <AttendanceMonitor mode="login" /> : activeView === 'Rekap Absensi' ? <AttendanceMonitor mode="photo" /> : activeView === 'Absensi' && role === 'sales' ? <CameraAttendance userName={currentUserName} photo={attendancePhoto} setPhoto={setAttendancePhoto} attendanceDone={attendanceDone} handleAttendance={handleAttendance} onLocationChange={setAttendanceLocation} /> : (activeView === 'MOM' || activeView === 'Audit MOM' || activeView === 'View MOM Terkait') ? <MOMView userName={currentUserName} userEmail={email} userRole={role} /> : activeView.startsWith('Request') ? <ProductRequestView userName={currentUserName} userRole={role} /> : ['Penawaran B2B', 'Request SPH', 'View RAB', 'Create SPH', 'Input RAB'].includes(activeView) ? <SPHView userName={currentUserName} userRole={role} /> : <section className="dashboard-content"><div className="welcome-row"><div><p className="eyebrow">Friday, 28 August 2026</p><h1>Good morning, {currentUserName.split(' ')[0]}.</h1><p className="muted">Your workspace is ready when you are.</p></div><div className="access-note"><ShieldCheck size={17} /><span><strong>{activeRole.label} access</strong><small>Menu shown for your role</small></span></div></div><div className="empty-state"><div className="empty-icon"><LayoutDashboard size={24} /></div><h2>{activeView} is empty</h2><p>When your workspace has activity, you’ll see it here.</p></div></section>}
    </main>
  </div>
}

function LoginScreen({ email, password, showPassword, setEmail, setPassword, setShowPassword, handleLogin, role, setRole }: { email: string; password: string; showPassword: boolean; setEmail: (value: string) => void; setPassword: (value: string) => void; setShowPassword: (value: boolean) => void; handleLogin: (event: FormEvent<HTMLFormElement>) => void; role: Role; setRole: (value: Role) => void }) {
  return <main className="login-page"><section className="login-art" aria-label="Kawan Utama Digital"><div className="art-grid" /><div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" /><a className="brand brand-light" href="#login"><img className="brand-logo brand-logo-light" src={logo} alt="Kawan Utama Digital" /></a><div className="art-copy"><p className="eyebrow light">The workspace for better work</p><h1>Make every<br /><em>move</em> matter.</h1><p>One calm place to bring your people, products, and progress together.</p></div><div className="art-footer"><span>© 2026 Kawan Utama Digital</span><span>Built for teams who move forward <ArrowRight size={15} /></span></div></section><section className="login-panel" id="login"><div className="login-inner"><div className="mobile-brand"><a className="brand" href="#login"><img className="brand-logo" src={logo} alt="Kawan Utama Digital" /></a></div><div className="login-heading"><p className="eyebrow">Welcome back</p><h2>Sign in to your<br /><span>workspace.</span></h2><p className="muted">Use your Kawan Utama Digital account to continue.</p></div><form onSubmit={handleLogin} className="login-form"><label htmlFor="email">Work email<input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" required /></label><label htmlFor="password">Password<div className="password-wrap"><input id="password" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" required /><button type="button" className="show-password" onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Hide' : 'Show'}</button></div></label><div className="form-options"><label className="remember"><input type="checkbox" /> <span>Remember me</span></label><a href="#help">Forgot password?</a></div><button className="submit-button" type="submit">Sign in <ArrowRight size={18} /></button></form><div className="demo-access"><div className="demo-heading"><span>Preview access</span><span>Choose a role to preview</span></div><div className="role-list">{roles.map((item) => <button key={item.value} className={`role-option ${role === item.value ? 'selected' : ''}`} onClick={() => setRole(item.value)} type="button"><span className="role-icon"><UserRound size={17} /></span><span><strong>{item.label}</strong><small>{item.description}</small></span><span className="role-radio" /></button>)}</div></div><p className="no-register"><LockKeyhole size={14} /> Access is managed by your Super Admin</p></div></section></main>
}

export function AttendanceView({ userName, photo, setPhoto, attendanceDone, handleAttendance }: { userName: string; photo: string; setPhoto: (value: string) => void; attendanceDone: string; handleAttendance: (event: FormEvent<HTMLFormElement>) => void }) {
  function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => setPhoto(String(reader.result)); reader.readAsDataURL(file) }
  const formattedTime = attendanceDone ? new Date(attendanceDone).toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'short' }) : ''
  return <section className="attendance-view dashboard-content"><div className="settings-header"><div><p className="eyebrow">Absensi Sales</p><h1>Record your attendance.</h1><p className="muted">Take a photo to record your arrival for today.</p></div><span className="access-note"><ShieldCheck size={17} /><span><strong>Sales access</strong><small>Name is recorded automatically</small></span></span></div><div className="attendance-grid"><form className="attendance-panel" onSubmit={handleAttendance}><div className="panel-heading"><div className="panel-icon"><Camera size={18} /></div><div><h2>Check-in attendance</h2><p>Photo and account name are required.</p></div></div><div className="attendance-user"><span className="profile-avatar">{userName.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</span><span><small>Logged in as</small><strong>{userName}</strong></span></div><label className="photo-upload">{photo ? <img src={photo} alt="Attendance preview" /> : <span><Camera size={28} /><strong>Take or upload a photo</strong><small>JPG or PNG, maximum 5 MB</small></span>}<input type="file" accept="image/*" capture="user" onChange={handlePhotoChange} required={!photo} /></label><button className="submit-button" type="submit" disabled={!photo || Boolean(attendanceDone)}>{attendanceDone ? 'Attendance recorded' : 'Submit attendance'} <CheckCircle2 size={18} /></button></form><div className="attendance-status">{attendanceDone ? <><div className="status-icon"><CheckCircle2 size={24} /></div><p className="eyebrow">Checked in</p><h2>Attendance recorded.</h2><p>{formattedTime}</p><img className="attendance-photo" src={photo} alt="Submitted attendance" /></> : <><div className="empty-icon"><LayoutDashboard size={24} /></div><h2>Not checked in yet</h2><p>Your check-in status will appear here after you submit a photo.</p></>}</div></div></section>
}

function AttendanceMonitor({ mode }: { mode: 'login' | 'photo' }) {
  const [records, setRecords] = useState<AttendanceRecord[]>([])

  useEffect(() => {
    const loadRecords = () => {
      try {
        setRecords(JSON.parse(localStorage.getItem('kawan-attendance-records') ?? '[]') as AttendanceRecord[])
      } catch (error) {
        console.error('Failed to load attendance records:', error)
      }
    }
    loadRecords()
    window.addEventListener('attendance-records-updated', loadRecords)
    window.addEventListener('storage', loadRecords)
    return () => {
      window.removeEventListener('attendance-records-updated', loadRecords)
      window.removeEventListener('storage', loadRecords)
    }
  }, [])

  const isToday = (record: AttendanceRecord) => {
    const date = new Date(record.createdAt)
    const now = new Date()
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate()
  }
  const todayRecords = records.filter(isToday)
  const todayLogins = Array.from(new Map(todayRecords.filter((record) => record.event === 'login').map((record) => [record.userEmail, record])).values())
  const todayPhotos = todayRecords.filter((record) => record.event === 'photo')
  const visibleRecords = records.filter((record) => record.event === mode)
  const visibleTodayRecords = todayRecords.filter((record) => record.event === mode)
  const title = mode === 'login' ? 'Rekap login.' : 'Rekap absensi.'
  const activityLabel = mode === 'login' ? 'login' : 'absensi'

  return <section className="dashboard-content attendance-monitor"><div className="settings-header"><div><p className="eyebrow">{mode === 'login' ? 'Monitor Login' : 'Monitor Absensi'}</p><h1>{title}</h1><p className="muted">Pantau {activityLabel} secara terpisah dari aktivitas lainnya.</p></div><span className="access-note"><ShieldCheck size={17} /><span><strong>Admin monitoring</strong><small>{visibleRecords.length} aktivitas tercatat</small></span></span></div><div className="attendance-today-summary"><div><span>{mode === 'login' ? 'Login hari ini' : 'Absensi hari ini'}</span><strong>{mode === 'login' ? todayLogins.length : todayPhotos.length}</strong><small>{visibleTodayRecords.length ? visibleTodayRecords.map((record) => record.userName).join(', ') : `Belum ada ${activityLabel} hari ini`}</small></div><div><span>Total {mode === 'login' ? 'login' : 'absensi'}</span><strong>{visibleRecords.length}</strong><small>Seluruh periode tersimpan</small></div></div><div className="attendance-monitor-table">{visibleRecords.length ? <table><thead><tr><th>Aktivitas</th><th>Foto</th><th>User</th><th>Role</th><th>Tipe</th><th>Waktu</th><th>Lokasi / Alasan</th></tr></thead><tbody>{visibleRecords.map((record) => <tr key={record.id}><td><span className={`attendance-event ${record.event}`}>{record.event === 'photo' ? 'Foto absensi' : 'Login'}</span></td><td>{record.photo ? <img className="monitor-photo" src={record.photo} alt={`Foto ${record.userName}`} /> : <span className="no-photo">-</span>}</td><td><strong>{record.userName}</strong><small>{record.userEmail}</small></td><td><span className="user-role">{record.role}</span></td><td>{record.attendanceType ?? '-'}</td><td>{new Date(record.createdAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</td><td><span className="monitor-location"><MapPin size={14} />{record.locationLabel}</span><small>{record.reason || (record.latitude !== null && record.longitude !== null ? `${record.latitude.toFixed(6)}, ${record.longitude.toFixed(6)}` : 'Koordinat belum tersedia')}</small></td></tr>)}</tbody></table> : <div className="sph-empty"><MapPin size={24} /><strong>Belum ada data {activityLabel}</strong><small>Aktivitas {activityLabel} baru akan muncul di sini.</small></div>}</div></section>
}

type DeliveryStatus = 'Menunggu surat jalan' | 'Menunggu diambil' | 'Dalam perjalanan' | 'Terkirim'
type DeliveryItem = { id: string; customer: string; sales: string; detail: string; qty: number; pickedUp: boolean; shipped: boolean; status?: DeliveryStatus; waybill?: string; proofPhoto?: string; currentLocation?: string; origin?: string; destination?: string; latitude?: number; longitude?: number; updatedAt?: string }

function RoleDashboard({ userName, userRole }: { userName: string; userRole: Role }) {
  if (userRole === 'delivery') return <DeliveryDashboard />
  const read = <T,>(key: string, fallback: T): T => {
    try { return JSON.parse(localStorage.getItem(key) ?? JSON.stringify(fallback)) as T } catch { return fallback }
  }
  const projects = read<Array<{ sales: string; status: string; items: Array<{ total: number }> }>>('kawan-funnel-projects', [])
  const rab = read<Array<{ status: string; items: Array<{ salesPrice?: number; unitPrice: number }> }>>('kawan-rab', [])
  const tickets = read<unknown[]>('kawan-tech-tickets', [])
  const salesProjects = projects.filter((project) => userRole !== 'sales' || project.sales.toLowerCase() === userName.split(' ')[0].toLowerCase())
  const wonValue = salesProjects.filter((project) => project.status === 'Closing / WIN').reduce((sum, project) => sum + project.items.reduce((itemSum, item) => itemSum + Number(item.total || 0), 0), 0)
  const cards = userRole === 'sales'
    ? [['Actual Closing / WIN', formatDashboardCurrency(wonValue)], ['Total Project', String(salesProjects.length)], ['Pengajuan RAB', String(salesProjects.filter((project) => project.status === 'Pengajuan RAB').length)], ['Negosiasi', String(salesProjects.filter((project) => project.status === 'Negosiasi').length)]]
    : userRole === 'product'
      ? [['Total RAB', String(rab.length)], ['Pending Product', String(rab.filter((item) => item.status === 'Pending Product').length)], ['Approved', String(rab.filter((item) => item.status === 'Approved').length)]]
      : userRole === 'tech'
        ? [['Tiket Teknis', String(tickets.length)], ['Project Aktif', String(projects.filter((project) => project.status !== 'Closing / WIN' && project.status !== 'Lost').length)]]
        : [['Total Project', String(projects.length)], ['Closing / WIN', String(projects.filter((project) => project.status === 'Closing / WIN').length)], ['Total RAB', String(rab.length)], ['Tiket Teknis', String(tickets.length)]]
  return <section className="dashboard-content role-dashboard"><div className="welcome-row"><div><p className="eyebrow">{userRole === 'sales' ? 'Sales Dashboard' : `${userRole.charAt(0).toUpperCase()}${userRole.slice(1)} Dashboard`}</p><h1>Welcome back, {userName.split(' ')[0]}.</h1><p className="muted">Ringkasan data terhubung dari modul Funnel, RAB, dan operasional.</p></div><span className="access-note"><ShieldCheck size={17} /><span><strong>{userRole}</strong><small>Live workspace data</small></span></span></div><div className="role-dashboard-grid">{cards.map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</div><div className="role-dashboard-panel"><h2>Status operasional</h2><p>Data akan mengikuti perubahan pada menu terkait secara otomatis saat dashboard dibuka kembali.</p></div></section>
}

function formatDashboardCurrency(value: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value)
}

type ProductRequest = { id: number; type: string; text: string; image: string; attachmentName?: string; attachmentType?: string; createdBy: string; targetTeam: 'product' | 'tech' | 'delivery' | 'admin'; createdAt: string; status: 'PENDING' | 'APPROVED' | 'REJECTED'; reviewedBy?: string; reviewNote?: string }

function ProductRequestView({ userName, userRole }: { userName: string; userRole: Role }) {
  const [requests, setRequests] = useState<ProductRequest[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('kawan-product-requests') ?? '[]') as Array<Partial<ProductRequest> & Pick<ProductRequest, 'id' | 'type' | 'text' | 'image' | 'createdBy' | 'createdAt' | 'status'>>
      return saved.map((request) => ({ ...request, targetTeam: request.targetTeam ?? 'product' })) as ProductRequest[]
    } catch { return [] }
  })
  const [type, setType] = useState('Harga / Ketersediaan Produk')
  const [targetTeam, setTargetTeam] = useState<ProductRequest['targetTeam']>('product')
  const [text, setText] = useState('')
  const [image, setImage] = useState('')
  const [attachmentName, setAttachmentName] = useState('')
  const [attachmentType, setAttachmentType] = useState('')
  const [previewRequest, setPreviewRequest] = useState<ProductRequest | null>(null)
  const [editingRequestId, setEditingRequestId] = useState<number | null>(null)
  const isProductTeam = userRole === 'product'
  const saveRequests = (next: ProductRequest[]) => {
    setRequests(next)
    localStorage.setItem('kawan-product-requests', JSON.stringify(next))
  }
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!text.trim()) return
    const nextRequest = { id: editingRequestId ?? Date.now(), type, text: text.trim(), image, attachmentName, attachmentType, createdBy: userName, targetTeam, createdAt: editingRequestId ? requests.find((request) => request.id === editingRequestId)?.createdAt ?? new Date().toISOString() : new Date().toISOString(), status: 'PENDING' as const }
    saveRequests(editingRequestId ? requests.map((request) => request.id === editingRequestId ? { ...request, ...nextRequest } : request) : [nextRequest, ...requests])
    setText('')
    setImage('')
    setAttachmentName('')
    setAttachmentType('')
    setEditingRequestId(null)
    alert('Request berhasil dikirim ke Product Team.')
  }
  const teamLabel = (team: ProductRequest['targetTeam']) => ({ product: 'Product Team', tech: 'Tech Team', delivery: 'Delivery Team', admin: 'Admin' })[team]
  const canReviewRequests = userRole !== 'sales' && userRole !== 'super-admin'
  const visibleRequests = requests.filter((request) => userRole === 'sales' ? request.createdBy === userName : userRole === 'super-admin' ? true : request.targetTeam === userRole)
  function handleAttachment(file: File | undefined) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => { setImage(String(reader.result)); setAttachmentName(file.name); setAttachmentType(file.type || 'application/octet-stream') }
    reader.readAsDataURL(file)
  }
  function editRequest(request: ProductRequest) {
    setEditingRequestId(request.id)
    setType(request.type)
    setTargetTeam(request.targetTeam)
    setText(request.text)
    setImage(request.image)
    setAttachmentName(request.attachmentName ?? '')
    setAttachmentType(request.attachmentType ?? '')
  }
  function deleteRequest(request: ProductRequest) {
    if (!confirm(`Hapus request "${request.type}"?`)) return
    saveRequests(requests.filter((item) => item.id !== request.id))
    if (editingRequestId === request.id) setEditingRequestId(null)
  }
  return <section className="dashboard-content request-view"><div className="settings-header"><div><p className="eyebrow">{canReviewRequests ? `${teamLabel(userRole as ProductRequest['targetTeam'])} Inbox` : 'Request Product'}</p><h1>{canReviewRequests ? 'Review request yang ditujukan ke tim kamu.' : 'Ajukan request ke tim tujuan.'}</h1><p className="muted">{canReviewRequests ? 'Request masuk berdasarkan pilihan tujuan dari pengirim.' : 'Pilih tujuan request agar langsung diterima tim yang sesuai.'}</p></div></div>{userRole !== 'product' && userRole !== 'tech' && userRole !== 'delivery' && userRole !== 'admin' && <form className="create-user-panel" onSubmit={submit}><label>Ditujukan ke tim<select value={targetTeam} onChange={(event) => setTargetTeam(event.target.value as ProductRequest['targetTeam'])}><option value="product">Product Team</option><option value="tech">Tech Team</option><option value="delivery">Delivery Team</option><option value="admin">Admin</option></select></label><label>Jenis request<select value={type} onChange={(event) => setType(event.target.value)}><option>Harga / Ketersediaan Produk</option><option>Request Produk Baru</option><option>Request Partner / Distributor</option><option>Request SPH</option></select></label><label>Detail request<textarea value={text} onChange={(event) => setText(event.target.value)} rows={6} placeholder="Tulis kebutuhan atau pertanyaan..." required /></label><label>Lampiran gambar atau file<input type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt" onChange={(event) => handleAttachment(event.target.files?.[0])} /></label>{image && attachmentType.startsWith('image/') && <img className="request-image-preview" src={image} alt="Lampiran request" />}<button className="submit-button" type="submit">{editingRequestId ? 'Simpan perubahan' : `Kirim ke ${teamLabel(targetTeam)}`} <Send size={17} /></button>{editingRequestId && <button className="cancel-button" type="button" onClick={() => { setEditingRequestId(null); setText(''); setImage(''); setAttachmentName(''); setAttachmentType('') }}>Batal edit</button>}</form>}<div className="request-list">{visibleRequests.map((request) => <article className="request-card" key={request.id}><div><span className={`request-status ${request.status.toLowerCase()}`}>{request.status}</span><h2>{request.type}</h2><p>{request.text}</p><small>Tujuan: {teamLabel(request.targetTeam)}</small><small>Dibuat oleh {request.createdBy} · {new Date(request.createdAt).toLocaleString('id-ID')}</small>{request.reviewNote && <small>Catatan: {request.reviewNote}</small>}</div>{request.image && <button type="button" className="attachment-button" onClick={() => setPreviewRequest(request)}>{request.attachmentType?.startsWith('image/') ? <img src={request.image} alt={`Lampiran ${request.attachmentName ?? 'request'}`} /> : <span><FileText size={22} /><small>{request.attachmentName ?? 'Buka lampiran'}</small></span>}</button>}<div className="request-actions">{((userRole === 'sales' && request.createdBy === userName && request.status === 'PENDING') || userRole === 'super-admin') && <button className="edit-request-button" type="button" onClick={() => editRequest(request)}>Edit</button>}{((userRole === 'sales' && request.createdBy === userName) || canReviewRequests || userRole === 'super-admin') && <button className="cancel-button" type="button" onClick={() => deleteRequest(request)}>Hapus</button>}{canReviewRequests && request.status === 'PENDING' && <><button className="submit-button" type="button" onClick={() => saveRequests(requests.map((item) => item.id === request.id ? { ...item, status: 'APPROVED', reviewedBy: userName, reviewNote: `Request disetujui ${teamLabel(userRole as ProductRequest['targetTeam'])}.` } : item))}>Approve</button><button className="cancel-button" type="button" onClick={() => saveRequests(requests.map((item) => item.id === request.id ? { ...item, status: 'REJECTED', reviewedBy: userName, reviewNote: `Request ditolak ${teamLabel(userRole as ProductRequest['targetTeam'])}.` } : item))}>Tolak</button></>}</div></article>)}</div>{previewRequest && <div className="attachment-modal" role="dialog" aria-modal="true" onClick={() => setPreviewRequest(null)}><div className="attachment-modal-content" onClick={(event) => event.stopPropagation()}><button type="button" className="icon-button attachment-close" onClick={() => setPreviewRequest(null)} aria-label="Tutup preview"><X size={18} /></button><h2>{previewRequest.attachmentName ?? 'Lampiran request'}</h2>{previewRequest.attachmentType?.startsWith('image/') ? <img src={previewRequest.image} alt={previewRequest.attachmentName ?? 'Preview lampiran'} /> : previewRequest.attachmentType === 'application/pdf' ? <iframe src={previewRequest.image} title={previewRequest.attachmentName ?? 'Preview PDF'} /> : <><p>File siap dicek atau diunduh.</p><a className="submit-button" href={previewRequest.image} download={previewRequest.attachmentName}>Buka / download file</a></>}</div></div>}</section>
}

function DeliveryDashboard({ readOnly = false }: { readOnly?: boolean }) {
  const [items, setItems] = useState<DeliveryItem[]>(() => {
    try {
      const saved = localStorage.getItem('kawan-delivery-items')
      if (saved) return JSON.parse(saved) as DeliveryItem[]
      const projects = JSON.parse(localStorage.getItem('kawan-funnel-projects') ?? '[]') as Array<{ id: number; customer: string; sales: string; items: Array<{ id: number; detail: string; qty: number }> }>
      const funnelItems = projects.flatMap((project) => project.items.map((item) => ({ id: `funnel-${project.id}-${item.id}`, customer: project.customer, sales: project.sales, detail: item.detail, qty: item.qty, pickedUp: false, shipped: false, origin: 'Gudang Kawan Utama', destination: project.customer, status: 'Menunggu surat jalan' as DeliveryStatus })))
      const sphList = JSON.parse(localStorage.getItem('kawan-sph') ?? '[]') as Array<{ id: string; customer: string; owner: string; status: string; items: Array<{ id: string; product: string; quantity: number }> }>
      const approvedOrders = sphList.filter((order) => ['Approved', 'Sent to Customer', 'WIN'].includes(order.status)).flatMap((order) => order.items.map((item) => ({ id: `sph-${order.id}-${item.id}`, customer: order.customer, sales: order.owner, detail: item.product, qty: item.quantity, pickedUp: false, shipped: false, origin: 'Gudang Kawan Utama', destination: order.customer, status: 'Menunggu surat jalan' as DeliveryStatus })))
      return [...funnelItems, ...approvedOrders]
    } catch (error) {
      console.error('Failed to load delivery items:', error)
      return []
    }
  })

  const [waybill, setWaybill] = useState('')
  const [proofPhoto, setProofPhoto] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = items.find((item) => item.id === selectedId) ?? null
  useEffect(() => { localStorage.setItem('kawan-delivery-items', JSON.stringify(items)) }, [items])
  const updateItem = (id: string, changes: Partial<DeliveryItem>) => setItems((current) => current.map((item) => item.id === id ? { ...item, ...changes, updatedAt: new Date().toISOString() } : item))
  const locate = (id: string) => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition((position) => updateItem(id, { latitude: position.coords.latitude, longitude: position.coords.longitude, currentLocation: `Koordinat ${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)}` }), () => undefined, { enableHighAccuracy: true, maximumAge: 0, timeout: 8000 })
  }
  const pendingWaybill = items.filter((item) => !item.waybill)
  const pendingPickup = items.filter((item) => item.waybill && !item.pickedUp)
  const inTransit = items.filter((item) => item.pickedUp && !item.shipped)
  const completed = items.filter((item) => item.shipped)
  useEffect(() => {
    if (!inTransit.length || !navigator.geolocation) return undefined
    const watchId = navigator.geolocation.watchPosition((position) => {
      const item = inTransit[0]
      updateItem(item.id, { latitude: position.coords.latitude, longitude: position.coords.longitude, currentLocation: `Koordinat ${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)}` })
    }, () => undefined, { enableHighAccuracy: true, maximumAge: 30000 })
    return () => navigator.geolocation.clearWatch(watchId)
  }, [inTransit.length])
  const submitWaybill = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (!selected || !waybill.trim()) return; updateItem(selected.id, { waybill: waybill.trim(), status: 'Menunggu diambil' }); setWaybill('') }
  const markShipped = (item: DeliveryItem, photo: string) => { if (!photo) return; updateItem(item.id, { shipped: true, status: 'Terkirim', proofPhoto: photo }); setProofPhoto('') }
  const [previewDelivery, setPreviewDelivery] = useState('')
  const renderCard = (item: DeliveryItem) => { const timeline = [{ label: 'Packed', done: Boolean(item.waybill) }, { label: 'Shipped', done: item.pickedUp }, { label: 'In Transit', done: item.pickedUp && !item.shipped }, { label: 'Delivered', done: item.shipped }]; return <article className="delivery-card" key={item.id}><div className="delivery-card-top"><span className="delivery-card-status">{item.shipped ? 'Delivered' : item.pickedUp ? 'In Transit' : item.waybill ? 'Shipped' : 'Waiting'}</span><strong>{item.customer}</strong></div><div className="delivery-route"><span><small>From</small><strong>{item.origin ?? 'Gudang Kawan Utama'}</strong></span><ArrowRight size={16} /><span><small>To</small><strong>{item.destination ?? item.customer}</strong></span></div><p>{item.detail}</p><small>Sales {item.sales} · QTY {item.qty}</small><div className="delivery-card-meta"><span>{item.currentLocation ? `Lokasi sekarang: ${item.currentLocation}` : 'Lokasi sekarang belum terdeteksi'}</span><span>{item.waybill ? `No. surat jalan: ${item.waybill}` : 'Surat jalan belum ada'}</span></div><div className="delivery-timeline">{timeline.map((step) => <span className={step.done ? 'done' : ''} key={step.label}><i />{step.label}</span>)}</div>{item.proofPhoto && <button type="button" className="delivery-proof-preview" onClick={() => setPreviewDelivery(item.proofPhoto ?? '')}><img src={item.proofPhoto} alt="Bukti pengiriman" /><span>Lihat foto bukti</span></button>}{item.updatedAt && <small>Update terakhir {new Date(item.updatedAt).toLocaleString('id-ID')}</small>}{!readOnly && <div className="delivery-card-actions">{!item.waybill && <button className="export-button" onClick={() => setSelectedId(item.id)}>Input surat jalan</button>}{item.waybill && !item.pickedUp && <button className="export-button" onClick={() => updateItem(item.id, { pickedUp: true, status: 'Dalam perjalanan' })}>Barang diambil</button>}{item.pickedUp && !item.shipped && <><button className="export-button" onClick={() => locate(item.id)}>Update lokasi</button><label className="delivery-photo-button">Foto bukti<input type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => markShipped(item, String(reader.result)); reader.readAsDataURL(file) }} /></label></>}</div>}</article> }
  const renderCards = (list: DeliveryItem[]) => list.length ? <div className="delivery-card-grid">{list.map(renderCard)}</div> : <div className="delivery-empty">Tidak ada order di tahap ini.</div>
  const renderTrackingTable = () => items.length ? <div className="delivery-table-wrap"><table className="delivery-tracking-table"><thead><tr><th>Order / Barang</th><th>From</th><th>To</th><th>Status</th><th>Lokasi sekarang</th><th>Surat jalan</th><th>Update</th><th>Bukti</th><th>Aksi</th></tr></thead><tbody>{items.map((item) => <tr key={item.id} onClick={() => setSelectedId(item.id)}><td><button type="button" className="delivery-order-link"><strong>{item.customer}</strong><small>{item.detail} · QTY {item.qty}</small></button></td><td>{item.origin ?? 'Gudang Kawan Utama'}</td><td>{item.destination ?? item.customer}</td><td><span className="delivery-table-status">{item.shipped ? 'Delivered' : item.pickedUp ? 'In Transit' : item.waybill ? 'Shipped' : 'Waiting'}</span></td><td>{item.currentLocation ?? 'Belum terdeteksi'}</td><td>{item.waybill ?? '-'}</td><td>{item.updatedAt ? new Date(item.updatedAt).toLocaleString('id-ID') : '-'}</td><td onClick={(event) => event.stopPropagation()}>{item.proofPhoto ? <button type="button" className="delivery-proof-link" onClick={() => setPreviewDelivery(item.proofPhoto ?? '')}>Lihat foto</button> : '-'}</td><td onClick={(event) => event.stopPropagation()}>{!readOnly && <div className="delivery-table-actions">{!item.waybill && <button onClick={() => setSelectedId(item.id)}>Surat jalan</button>}{item.waybill && !item.pickedUp && <button onClick={() => updateItem(item.id, { pickedUp: true, status: 'Dalam perjalanan' })}>Ambil</button>}{item.pickedUp && !item.shipped && <><button onClick={() => locate(item.id)}>Lokasi</button><label>Foto<input type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => markShipped(item, String(reader.result)); reader.readAsDataURL(file) }} /></label></>}</div>}</td></tr>)}</tbody></table></div> : <div className="delivery-empty">Tidak ada order delivery.</div>
  const renderDetailPage = () => {
    if (!selected) return null
    const status = selected.shipped ? 'Terkirim' : selected.pickedUp ? 'Dalam perjalanan' : selected.waybill ? 'Menunggu diambil' : 'Menunggu surat jalan'
    const timeline = [
      { label: 'Order dibuat', done: true },
      { label: 'Surat jalan', done: Boolean(selected.waybill) },
      { label: 'Diambil', done: selected.pickedUp },
      { label: 'Terkirim', done: selected.shipped },
    ]
    return <section className="dashboard-content delivery-detail-page">
      <button type="button" className="delivery-back-button" onClick={() => setSelectedId(null)}><ArrowLeft size={16} /> Kembali ke daftar pengiriman</button>
      <div className="delivery-detail-page-heading"><div><p className="eyebrow">Detail product & tracking</p><h1>{selected.detail}</h1><p className="muted">Pantau perjalanan barang dari lokasi awal sampai tujuan.</p></div><span className="delivery-detail-status">{status}</span></div>
      <div className="delivery-detail-route"><div><span>Dari</span><strong>{selected.origin ?? 'Gudang Kawan Utama'}</strong></div><ArrowRight size={20} /><div><span>Lokasi terkini</span><strong>{selected.currentLocation ?? 'Belum terdeteksi'}</strong></div><ArrowRight size={20} /><div><span>Tujuan</span><strong>{selected.destination ?? selected.customer}</strong></div></div>
      <div className="delivery-detail-page-grid"><article><h2>Informasi barang</h2><dl><div><dt>Nama barang</dt><dd>{selected.detail}</dd></div><div><dt>Qty</dt><dd>{selected.qty} unit</dd></div><div><dt>Customer</dt><dd>{selected.customer}</dd></div><div><dt>Sales</dt><dd>{selected.sales}</dd></div><div><dt>No. surat jalan</dt><dd>{selected.waybill ?? 'Belum tersedia'}</dd></div><div><dt>Update terakhir</dt><dd>{selected.updatedAt ? new Date(selected.updatedAt).toLocaleString('id-ID') : 'Belum ada update'}</dd></div></dl></article><article><h2>Progress pengiriman</h2><div className="delivery-detail-timeline">{timeline.map((step) => <div className={step.done ? 'done' : ''} key={step.label}><i /> <span>{step.label}</span></div>)}</div><div className="delivery-current-location"><MapPin size={18} /><span><small>Lokasi terkini</small><strong>{selected.currentLocation ?? 'Belum ada update lokasi'}</strong></span></div>{selected.proofPhoto && <button type="button" className="delivery-detail-photo" onClick={() => setPreviewDelivery(selected.proofPhoto ?? '')}><img src={selected.proofPhoto} alt="Foto bukti pengiriman" /><span>Lihat foto bukti pengiriman</span></button>}</article></div>
      {!readOnly && <div className="delivery-detail-actions">{!selected.waybill && <form className="delivery-waybill-form" onSubmit={submitWaybill}><strong>Input surat jalan</strong><input value={waybill} onChange={(event) => setWaybill(event.target.value)} placeholder="Nomor surat jalan" required /><button className="submit-button" type="submit">Simpan</button></form>}{selected.waybill && !selected.pickedUp && <button className="export-button" onClick={() => updateItem(selected.id, { pickedUp: true, status: 'Dalam perjalanan' })}>Konfirmasi barang diambil</button>}{selected.pickedUp && !selected.shipped && <><button className="export-button" onClick={() => locate(selected.id)}><MapPin size={14} /> Update lokasi</button><label className="delivery-photo-button">Upload foto terkirim<input type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => markShipped(selected, String(reader.result)); reader.readAsDataURL(file) }} /></label></>}</div>}
      {previewDelivery && <div className="attachment-modal" role="dialog" aria-modal="true" onClick={() => setPreviewDelivery('')}><div className="attachment-modal-content" onClick={(event) => event.stopPropagation()}><button type="button" className="icon-button attachment-close" onClick={() => setPreviewDelivery('')} aria-label="Tutup foto"><X size={18} /></button><h2>Foto bukti pengiriman</h2><img src={previewDelivery} alt="Foto bukti pengiriman" /></div></div>}
    </section>
  }
  if (selected) return renderDetailPage()
  return <section className="dashboard-content delivery-dashboard"><div className="settings-header"><div><p className="eyebrow">{readOnly ? 'Delivery Monitor' : 'Delivery Operations'}</p><h1>{readOnly ? 'Pantau pengiriman.' : 'Delivery dashboard.'}</h1><p className="muted">{readOnly ? 'Mode view-only untuk memantau status, lokasi, dan foto bukti.' : 'Fokus pada status order, lokasi terakhir, dan bukti pengiriman.'}</p></div><span className="access-note"><Package size={17} /><span><strong>{readOnly ? 'View only' : 'Delivery workspace'}</strong><small>{items.length} order tercatat</small></span></span></div><div className="delivery-summary"><article><span>Surat jalan</span><strong>{pendingWaybill.length}</strong><small>Belum siap diproses</small></article><article><span>Siap diambil</span><strong>{pendingPickup.length}</strong><small>Menunggu driver</small></article><article><span>Berjalan</span><strong>{inTransit.length}</strong><small>Lokasi sedang dipantau</small></article><article><span>Selesai</span><strong>{completed.length}</strong><small>Bukti sudah tersedia</small></article></div>{!readOnly && selected && <form className="delivery-waybill-form" onSubmit={submitWaybill}><strong>Surat jalan: {selected.detail}</strong><input value={waybill} onChange={(event) => setWaybill(event.target.value)} placeholder="Nomor surat jalan" required /><button className="submit-button" type="submit">Simpan surat jalan</button></form>}<div className="delivery-stage"><section><h2>Daftar tracking pengiriman</h2>{renderTrackingTable()}</section></div>{selected && <div className="delivery-detail-panel"><div className="delivery-detail-heading"><div><p className="eyebrow">Detail pengiriman</p><h2>{selected.detail}</h2></div><button type="button" className="icon-button" onClick={() => setSelectedId(null)} aria-label="Tutup detail"><X size={18} /></button></div><div className="delivery-detail-grid"><div><span>Customer</span><strong>{selected.customer}</strong></div><div><span>Dari</span><strong>{selected.origin ?? 'Gudang Kawan Utama'}</strong></div><div><span>Dikirim ke</span><strong>{selected.destination ?? selected.customer}</strong></div><div><span>QTY / Sales</span><strong>{selected.qty} unit · {selected.sales}</strong></div><div><span>Status</span><strong>{selected.shipped ? 'Delivered' : selected.pickedUp ? 'In Transit' : selected.waybill ? 'Shipped' : 'Waiting'}</strong></div><div><span>Lokasi terakhir</span><strong>{selected.currentLocation ?? 'Belum terdeteksi'}</strong></div><div><span>Nomor surat jalan</span><strong>{selected.waybill ?? 'Belum tersedia'}</strong></div><div><span>Update terakhir</span><strong>{selected.updatedAt ? new Date(selected.updatedAt).toLocaleString('id-ID') : 'Belum ada update'}</strong></div></div>{selected.proofPhoto ? <button type="button" className="delivery-detail-photo" onClick={() => setPreviewDelivery(selected.proofPhoto ?? '')}><img src={selected.proofPhoto} alt="Foto bukti pengiriman" /><span>Buka foto bukti pengiriman</span></button> : <p className="delivery-detail-empty">Foto bukti belum tersedia.</p>}</div>}{previewDelivery && <div className="attachment-modal" role="dialog" aria-modal="true" onClick={() => setPreviewDelivery('')}><div className="attachment-modal-content" onClick={(event) => event.stopPropagation()}><button type="button" className="icon-button attachment-close" onClick={() => setPreviewDelivery('')} aria-label="Tutup foto"><X size={18} /></button><h2>Foto bukti pengiriman</h2><img src={previewDelivery} alt="Foto bukti pengiriman" /></div></div>}</section>
}

function SalesTargetView({ userName, userRole, users, targets, setTargets }: { userName: string; userRole: Role; users: User[]; targets: SalesTarget[]; setTargets: (targets: SalesTarget[]) => void }) {
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7))
  const [targetSales, setTargetSales] = useState('')
  const [targetAmount, setTargetAmount] = useState('')
  const salesUsers = users.filter((user) => user.role === 'sales')
  const visibleSales = userRole === 'sales' ? [{ name: userName }] : salesUsers.map((user) => ({ name: user.name }))
  const projects = (() => {
    try { return JSON.parse(localStorage.getItem('kawan-funnel-projects') ?? '[]') as Array<{ sales: string; closing: string; status: string; items: Array<{ total: number }> }> } catch { return [] }
  })()
  const achievedFor = (sales: string) => projects.filter((project) => project.sales.toLowerCase() === sales.split(' ')[0].toLowerCase() && project.status === 'Closing / WIN' && project.closing.startsWith(period)).reduce((sum, project) => sum + project.items.reduce((itemSum, item) => itemSum + Number(item.total || 0), 0), 0)
  const formatCurrency = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value)
  const saveTarget = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (userRole === 'sales' || !targetSales || Number(targetAmount) <= 0) return
    const next: SalesTarget = { id: `${targetSales}-${period}`, sales: targetSales, period, amount: Number(targetAmount) }
    setTargets([...targets.filter((target) => target.id !== next.id), next])
    setTargetAmount('')
  }
  return <section className="dashboard-content sales-target-view"><div className="settings-header"><div><p className="eyebrow">Sales Performance</p><h1>Sales target bulanan.</h1><p className="muted">Realisasi hanya menghitung project Funnel berstatus Closing / WIN pada bulan yang dipilih.</p></div><label className="target-period">Periode<input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} /></label></div>{userRole === 'admin' || userRole === 'super-admin' ? <form className="target-form" onSubmit={saveTarget}><label>Sales<select value={targetSales} onChange={(event) => setTargetSales(event.target.value)} required><option value="">Pilih sales</option>{salesUsers.map((user) => <option key={user.email} value={user.name}>{user.name}</option>)}</select></label><label>Target bulanan<input type="number" min="1" value={targetAmount} onChange={(event) => setTargetAmount(event.target.value)} placeholder="500000000" required /></label><button className="submit-button" type="submit">Simpan target</button></form> : null}<div className="target-grid">{visibleSales.map((sales) => { const saved = targets.find((target) => target.sales === sales.name && target.period === period); const target = saved?.amount ?? 0; const achieved = achievedFor(sales.name); const progress = target > 0 ? achieved / target * 100 : 0; const status = target === 0 ? 'Belum diset' : progress >= 100 ? 'In target' : progress >= 50 ? 'On track' : 'Out of target'; const statusClass = target === 0 ? 'target-unset' : progress >= 100 ? 'target-achieved' : progress >= 50 ? 'target-progress' : 'target-behind'; return <article className="target-card" key={sales.name}><div><strong>{sales.name}</strong><span className={`target-status ${statusClass}`}>{status}</span></div><small>Target: {formatCurrency(target)}</small><strong>Achieved: {formatCurrency(achieved)}</strong><div className="target-progress-track"><span className={statusClass} style={{ width: `${Math.min(progress, 100)}%` }} /></div><span className="target-percent">{target ? `${progress.toFixed(1)}%` : 'Belum ada target'}</span></article>})}</div></section>
}

function SettingsView({ users, editingEmail, newUserName, newUserEmail, newUserPassword, newUserRole, setNewUserName, setNewUserEmail, setNewUserPassword, setNewUserRole, handleUserSubmit, editUser, deleteUser, resetUserForm }: { users: User[]; editingEmail: string | null; newUserName: string; newUserEmail: string; newUserPassword: string; newUserRole: UserRole; setNewUserName: (value: string) => void; setNewUserEmail: (value: string) => void; setNewUserPassword: (value: string) => void; setNewUserRole: (value: UserRole) => void; handleUserSubmit: (event: FormEvent<HTMLFormElement>) => void; editUser: (user: User) => void; deleteUser: (email: string) => void; resetUserForm: () => void }) {
  return <section className="settings-view dashboard-content"><div className="settings-header"><div><p className="eyebrow">System settings</p><h1>Manage your team.</h1><p className="muted">Create and manage access for your Kawan Utama Digital workspace.</p></div><span className="access-note"><ShieldCheck size={17} /><span><strong>Super Admin only</strong><small>Full system access</small></span></span></div><div className="settings-grid"><form className="create-user-panel" onSubmit={handleUserSubmit}><div className="panel-heading"><div className="panel-icon"><UserRound size={18} /></div><div><h2>{editingEmail ? 'Edit user' : 'Create new user'}</h2><p>{editingEmail ? 'Update this team member’s access.' : 'Add a team member and assign their access role.'}</p></div></div><label>Full name<input value={newUserName} onChange={(event) => setNewUserName(event.target.value)} placeholder="e.g. Andi Wijaya" required /></label><label>Work email<input type="email" value={newUserEmail} onChange={(event) => setNewUserEmail(event.target.value)} placeholder="andi@company.com" required /></label><label>Temporary password<input type="password" value={newUserPassword} onChange={(event) => setNewUserPassword(event.target.value)} placeholder="Set an initial password" minLength={8} required /></label><label>Access role<select value={newUserRole} onChange={(event) => setNewUserRole(event.target.value as UserRole)}>{roles.filter((item) => item.value !== 'super-admin').map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label><div className="form-actions"><button className="submit-button" type="submit">{editingEmail ? 'Save changes' : 'Create user'} <ArrowRight size={18} /></button>{editingEmail && <button className="cancel-button" type="button" onClick={resetUserForm}>Cancel</button>}</div><p className="form-hint"><LockKeyhole size={14} /> User signs in with this email and password.</p></form><div className="users-panel"><div className="panel-heading"><div className="panel-icon"><UsersRound size={18} /></div><div><h2>Team members</h2><p>{users.length} user{users.length === 1 ? '' : 's'} created in this workspace.</p></div></div>{users.length === 0 ? <div className="users-empty"><UsersRound size={21} /><span>No team members yet.</span><small>Users you create will appear here.</small></div> : <div className="user-list">{users.map((user) => <div className="user-row" key={user.email}><span className="profile-avatar">{user.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</span><span><strong>{user.name}</strong><small>{user.email}</small></span><span className="user-role">{roles.find((item) => item.value === user.role)?.label ?? user.role}</span><span className="user-actions"><button type="button" onClick={() => editUser(user)} title="Edit user" aria-label={`Edit ${user.name}`}><Pencil size={14} /></button><button type="button" onClick={() => deleteUser(user.email)} title="Delete user" aria-label={`Delete ${user.name}`}><Trash2 size={14} /></button></span></div>)}</div>}</div></div></section>
}

export default App
