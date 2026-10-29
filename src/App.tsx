import { Component, useEffect, useState } from 'react'
import type { ChangeEvent, ErrorInfo, FormEvent, ReactNode } from 'react'
import { ArrowRight, BarChart3, Boxes, Camera, CheckCircle2, ChevronDown, CircleHelp, ClipboardCheck, Download, FileText, LayoutDashboard, LockKeyhole, LogOut, Menu, Package, Pencil, Send, ShieldCheck, Target, Trash2, Truck, UserRound, UsersRound, X } from 'lucide-react'
import logo from './assets/kawan-utama-digital.png'
import { AttendanceWorkspace } from './AttendanceWorkspace'
import { MOMView } from './MOMView'
import { SPHView } from './SPHView'
import { ProductWorkspace } from './ProductWorkspace'
import { DeliveryView } from './DeliveryView'
import { DeliveryDashboard } from './DeliveryDashboard'
import type { DeliveryPage } from './DeliveryView'
import { SalesTargetsView } from './SalesTargets'
import { localApi } from './lib/localApi'
import './App.css'

type Role = 'sales' | 'product' | 'delivery' | 'admin' | 'super-admin'
type UserRole = Role
type User = { id: string; name: string; email: string; role: Role; created_at?: string }
type NavItem = { label: string; icon: typeof LayoutDashboard }
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
function formatUserCreatedAt(value?: string) {
  if (!value) return 'Waktu dibuat belum tersedia'
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function initialsFromName(value?: string | null) {
  const safeName = typeof value === 'string' ? value.trim() : ''
  const initials = safeName
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  return initials || 'KU'
}

function isRole(value: unknown): value is Role {
  return roles.some((item) => item.value === value)
}

const roles: { value: Role; label: string; description: string }[] = [
  { value: 'sales', label: 'Sales', description: 'Kelola pelanggan dan penjualan' },
  { value: 'product', label: 'Product', description: 'Kelola katalog dan produk' },
  { value: 'delivery', label: 'Delivery', description: 'Kelola pengiriman dan pemenuhan pesanan' },
  { value: 'admin', label: 'Admin', description: 'Kelola operasional aplikasi' },
  { value: 'super-admin', label: 'Super Admin', description: 'Akses penuh ke seluruh sistem' },
]

const navByRole: Record<Role, NavItem[]> = {
  sales: [{ label: 'Dashboard', icon: LayoutDashboard }, { label: 'Absensi', icon: Camera }, { label: 'MOM', icon: BarChart3 }, { label: 'Request Harga', icon: Boxes }, { label: 'RAB', icon: FileText }, { label: 'Funnel', icon: BarChart3 }, { label: 'Order Tracking', icon: Package }, { label: 'SPH', icon: ArrowRight }],
  product: [{ label: 'Dashboard', icon: LayoutDashboard }, { label: 'Absensi', icon: Camera }, { label: 'Request Harga', icon: Boxes }, { label: 'RAB', icon: FileText }, { label: 'View MOM Terkait', icon: BarChart3 }, { label: 'Partnership', icon: UsersRound }],
  delivery: [{ label: 'Dashboard', icon: LayoutDashboard }, { label: 'Order Tracking', icon: Package }, { label: 'Absensi', icon: Camera }, { label: 'Request Inbox', icon: Boxes }, { label: 'Ambil Barang', icon: ClipboardCheck }, { label: 'Kirim Barang', icon: Send }, { label: 'Stok Barang', icon: Package }],
  admin: [{ label: 'Dashboard', icon: LayoutDashboard }, { label: 'Target Sales', icon: Target }, { label: 'Order Tracking', icon: Package }, { label: 'Absensi', icon: Camera }, { label: 'Delivery Monitor', icon: Truck }, { label: 'Audit MOM', icon: BarChart3 }, { label: 'SPH', icon: ShieldCheck }],
  'super-admin': [{ label: 'Dashboard', icon: LayoutDashboard }, { label: 'Target Sales', icon: Target }, { label: 'Order Tracking', icon: Package }, { label: 'Absensi', icon: Camera }, { label: 'MOM', icon: BarChart3 }, { label: 'Request Harga', icon: Boxes }, { label: 'Partnership', icon: UsersRound }, { label: 'RAB', icon: FileText }, { label: 'Delivery Monitor', icon: Truck }, { label: 'SPH', icon: ArrowRight }, { label: 'User Management', icon: UsersRound }],
}

class AppErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Dashboard render failed, showing safe fallback:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="login-page">
          <section className="login-panel" style={{ width: '100%' }}>
            <div className="login-inner">
              <div className="login-heading">
                <p className="eyebrow">Workspace error</p>
                <h2>Dashboard tidak bisa dimuat.</h2>
                <p className="muted">Silakan refresh halaman atau logout lalu login kembali.</p>
              </div>
              <button className="submit-button" type="button" onClick={() => window.location.reload()}>
                Refresh halaman
              </button>
            </div>
          </section>
        </main>
      )
    }
    return this.props.children
  }
}

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [role, setRole] = useState<Role>('super-admin')
  const [currentUserName, setCurrentUserName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginBusy, setLoginBusy] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeView, setActiveView] = useState('Overview')
  const [users, setUsers] = useState<User[]>([])
  const [editingUserId, setEditingUserId] = useState<string | null>(null)
  const [newUserName, setNewUserName] = useState('')
  const [newUserEmail, setNewUserEmail] = useState('')
  const [newUserPassword, setNewUserPassword] = useState('')
  const [newUserRole, setNewUserRole] = useState<UserRole>('sales')
  const [attendancePhoto, setAttendancePhoto] = useState('')
  const [attendanceRecordId, setAttendanceRecordId] = useState<string | null>(null)
  const [attendanceLocation, setAttendanceLocation] = useState<{ latitude: number; longitude: number; label: string } | null>(null)
  const [attendanceDone, setAttendanceDone] = useState(() => localStorage.getItem('kawan-attendance') ?? '')
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)
  const [isInstalled, setIsInstalled] = useState(false)
  const [currentDateTime, setCurrentDateTime] = useState(() => new Date())

  const activeRole = roles.find((item) => item.value === role) ?? roles[0]
  const safeUserName = currentUserName.trim() || 'User'

  function applyAuthUser(user: User | null) {
    if (!user || !roles.some((item) => item.value === user.role)) {
      setIsLoggedIn(false)
      return
    }

    const nextRole = user.role
    setCurrentUserName(user.name)
    setEmail(user.email)
    setRole(nextRole)
    setActiveView(navByRole[nextRole][0].label)
    setIsLoggedIn(true)
  }

  async function refreshUsers() {
    const data = await localApi.users()
    setUsers(data.filter((user) => isRole(user.role)).map((user) => ({ ...user, role: user.role as Role })))
  }

  async function manageUser(payload: Record<string, string>) {
    await localApi.manageUser(payload)
    await refreshUsers()
  }

  useEffect(() => {
    let active = true
    void localApi.session().then(({ user }) => {
      if (active) applyAuthUser(user)
    }).catch((error: unknown) => {
      if (!active) return
      if (!(error instanceof Error) || !error.message.includes('Sesi login diperlukan')) {
        console.error('Gagal memeriksa sesi lokal:', error)
      }
      applyAuthUser(null)
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!isLoggedIn || role !== 'super-admin') {
      setUsers([])
      return
    }
    void refreshUsers().catch((error: unknown) => {
      console.error('Gagal memuat daftar user:', error)
      window.alert(`Gagal memuat daftar user: ${error instanceof Error ? error.message : 'Kesalahan tidak diketahui'}`)
    })
  }, [isLoggedIn, role])

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
    setIsInstalled(standalone)
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as InstallPromptEvent)
    }
    const handleAppInstalled = () => { setIsInstalled(true); setInstallPrompt(null) }
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  useEffect(() => {
    if (!isLoggedIn) return
    const presenceEmail = email.trim().toLowerCase()
    const presenceSessionId = crypto.randomUUID()
    if (!presenceEmail) return
    const updatePresence = async (online: boolean) => {
      try {
        await localApi.updatePresence(presenceSessionId, online)
      } catch (error) {
        if (online) console.error('Gagal memperbarui status online:', error)
      }
    }
    void updatePresence(true)
    const heartbeat = window.setInterval(() => { void updatePresence(true) }, 30000)
    return () => { window.clearInterval(heartbeat); void updatePresence(false) }
  }, [currentUserName, email, isLoggedIn, role])

  useEffect(() => {
    if (!isLoggedIn || (role !== 'sales' && role !== 'super-admin')) return
    const attendanceEmail = email || `${currentUserName.toLowerCase().replace(/\s+/g, '.')}@kawanutama.com`
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)

    const loadTodayAttendance = async () => {
      try {
        const data = await localApi.attendance(startOfDay.toISOString(), new Date(startOfDay.getTime() + 86400000).toISOString())
        const record = data.find((item) => typeof item.user_email === 'string' && item.user_email.toLowerCase() === attendanceEmail.toLowerCase())
        if (!record) return
        const id = String(record.id)
        const photo = await localApi.attendancePhoto(id)
        const createdAt = String(record.created_at)
        setAttendancePhoto(photo.photo_data ?? '')
        setAttendanceRecordId(id)
        setAttendanceDone(createdAt)
        setAttendanceLocation(record.latitude != null && record.longitude != null ? { latitude: Number(record.latitude), longitude: Number(record.longitude), label: String(record.location_label ?? 'Lokasi tidak tersedia') } : null)
        localStorage.setItem(`kawan-attendance-${attendanceEmail.toLowerCase()}`, createdAt)
      } catch (error) {
        console.error('Gagal memuat absensi hari ini:', error)
        return
      }
    }

    void loadTodayAttendance()
  }, [currentUserName, email, isLoggedIn, role])

  useEffect(() => {
    const clockTimer = window.setInterval(() => setCurrentDateTime(new Date()), 30000)
    return () => window.clearInterval(clockTimer)
  }, [])

  async function installApp() {
    if (!installPrompt) {
      alert('Di iPhone/iPad: tekan tombol Share, lalu pilih Add to Home Screen. Di Chrome/Edge, buka menu browser lalu pilih Install Kawan Utama Digital.')
      return
    }
    await installPrompt.prompt()
    const choice = await installPrompt.userChoice
    if (choice.outcome === 'accepted') setIsInstalled(true)
    setInstallPrompt(null)
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoginError('')
    setLoginBusy(true)
    try {
      const { user } = await localApi.login(email.trim(), password)
      setCurrentUserName(user.name)
      setEmail(user.email)
      setRole(user.role)
      setActiveView(navByRole[user.role][0].label)
      setAttendancePhoto('')
      setAttendanceRecordId(null)
      setAttendanceLocation(null)
      setAttendanceDone(localStorage.getItem(`kawan-attendance-${user.email.toLowerCase()}`) ?? '')
      setIsLoggedIn(true)
      setPassword('')
    } catch (error) {
      console.error('Gagal login ke backend lokal:', error)
      setLoginError(error instanceof Error ? error.message : 'Email atau password tidak sesuai.')
    } finally {
      setLoginBusy(false)
    }
  }

  function resetUserForm() {
    setEditingUserId(null)
    setNewUserName('')
    setNewUserEmail('')
    setNewUserPassword('')
    setNewUserRole('sales')
  }

  async function handleUserSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      const action = editingUserId ? 'update-user' : 'create-user'
      await manageUser({
        action,
        ...(editingUserId ? { id: editingUserId } : {}),
        name: newUserName.trim(),
        email: newUserEmail.trim(),
        role: newUserRole,
        ...(newUserPassword ? { password: newUserPassword } : {}),
      })
      resetUserForm()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Kesalahan tidak diketahui'
      console.error('Gagal menyimpan user:', message)
      window.alert(`Gagal menyimpan user: ${message}`)
    }
  }

  function editUser(user: User) {
    setEditingUserId(user.id)
    setNewUserName(user.name)
    setNewUserEmail(user.email)
    setNewUserPassword('')
    setNewUserRole(user.role)
  }

  async function deleteUser(user: User) {
    if (user.role === 'super-admin' || user.email.toLowerCase() === email.toLowerCase()) {
      window.alert('Akun Super Admin atau akun yang sedang digunakan tidak dapat dihapus.')
      return
    }
    if (!window.confirm('Hapus user ini dari workspace?')) return
    try {
      await manageUser({ action: 'delete-user', id: user.id })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Kesalahan tidak diketahui'
      console.error('Gagal menghapus user:', message)
      window.alert(`Gagal menghapus user: ${message}`)
    }
  }

  async function handleAttendance(event: FormEvent<HTMLFormElement>): Promise<boolean> {
    event.preventDefault()
    if (!attendancePhoto) return false

    const payload = {
      photo_data: attendancePhoto,
    }

    if (attendanceRecordId !== null) {
      try {
        await localApi.updateAttendancePhoto(attendanceRecordId, attendancePhoto)
      } catch (error) {
        console.error('Gagal memperbarui foto absensi:', error)
        alert('Gagal memperbarui foto absensi: ' + (error instanceof Error ? error.message : 'Kesalahan tidak diketahui.'))
        return false
      }
      localStorage.setItem(`kawan-attendance-${email.toLowerCase()}`, attendanceDone)
      return true
    } else {
      const timestamp = new Date().toISOString()
      try {
        const data = await localApi.saveAttendance({
          ...payload,
          location_label: attendanceLocation?.label ?? 'Lokasi tidak tersedia',
          latitude: attendanceLocation?.latitude ?? null,
          longitude: attendanceLocation?.longitude ?? null,
          created_at: timestamp,
        })
        setAttendanceRecordId(data.id)
        setAttendanceDone(timestamp)
        localStorage.setItem(`kawan-attendance-${email.toLowerCase()}`, timestamp)
        return true
      } catch (error) {
        console.error('Gagal menyimpan absensi:', error)
        alert('Gagal menyimpan absensi: ' + (error instanceof Error ? error.message : 'Kesalahan tidak diketahui.'))
        return false
      }
    }
  }

  async function handleSignOut() {
    try {
      await localApi.logout()
    } catch (error) {
      console.error('Gagal logout:', error)
      window.alert(`Gagal logout: ${error instanceof Error ? error.message : 'Kesalahan tidak diketahui.'}`)
      return
    }
    setIsLoggedIn(false)
    setActiveView('Overview')
  }

  if (!isLoggedIn) {
    return (
      <AppErrorBoundary>
        <>
          <LoginScreen
            email={email}
            password={password}
            showPassword={showPassword}
            loginError={loginError}
            loginBusy={loginBusy}
            setEmail={setEmail}
            setPassword={setPassword}
            setShowPassword={setShowPassword}
            handleLogin={handleLogin}
          />
          <div className="login-install-wrap">
            {!isInstalled && (
              <button className="install-login-button" type="button" onClick={() => void installApp()}>
                <Download size={16} /> Install Kawan Utama Digital
              </button>
            )}
          </div>
        </>
      </AppErrorBoundary>
    )
  }

  return (
      <div className="app-shell">
        <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
          <div className="sidebar-topline">
            <a className="brand brand-sidebar" href="#top"><img className="brand-logo" src={logo} alt="Kawan Utama Digital" /></a>
            <button className="icon-button mobile-close" onClick={() => setMenuOpen(false)} aria-label="Close navigation"><X size={20} /></button>
          </div>
          <div className="workspace-switcher">
            <span className="workspace-avatar">KU</span>
            <span><small>Workspace</small><strong>Kawan Utama</strong></span>
            <ChevronDown size={16} />
          </div>
          <nav className="main-nav" aria-label="Main navigation">
            <p className="nav-label">Workspace</p>
            {navByRole[role].map((item) => {
              const Icon = item.icon
              return (
                <button className={`nav-item ${activeView === item.label ? 'active' : ''}`} key={item.label} onClick={() => { setActiveView(item.label); setMenuOpen(false) }}>
                  <Icon size={18} />{item.label}
                </button>
              )
            })}
          </nav>
          <div className="sidebar-bottom">
            <button className="nav-item"><CircleHelp size={18} /> Help center</button>
            <div className="profile-card">
              <span className="profile-avatar">{initialsFromName(currentUserName)}</span>
              <span><strong>{safeUserName}</strong><small>{activeRole.label}</small></span>
              <ChevronDown size={16} />
            </div>
          </div>
        </aside>

        <main className="dashboard" id="top">
          <header className="topbar">
            <button className="icon-button mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Open navigation"><Menu size={21} /></button>
            <div className="breadcrumb"><span>Workspace</span><span>/</span><strong>{activeView}</strong></div>
            <div className="topbar-actions">
              <span className="workspace-clock">
                <span>{currentDateTime.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                <strong>{currentDateTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</strong>
              </span>
              <span className="role-pill"><ShieldCheck size={15} /> {activeRole.label}</span>
              {!isInstalled && <button className="install-button" onClick={() => void installApp()}><Download size={15} /> Install app</button>}
              <button className="sign-out" onClick={() => void handleSignOut()}><LogOut size={16} /> Sign out</button>
            </div>
          </header>

          <AppErrorBoundary key={activeView}>
          {activeView === 'Target Sales' && (role === 'admin' || role === 'super-admin') ? (
            <SalesTargetsView />
          ) : activeView === 'User Management' && role === 'super-admin' ? (
            <SettingsView users={users} editingUserId={editingUserId} newUserName={newUserName} newUserEmail={newUserEmail} newUserPassword={newUserPassword} newUserRole={newUserRole} setNewUserName={setNewUserName} setNewUserEmail={setNewUserEmail} setNewUserPassword={setNewUserPassword} setNewUserRole={setNewUserRole} handleUserSubmit={handleUserSubmit} editUser={editUser} deleteUser={deleteUser} resetUserForm={resetUserForm} />
          ) : activeView === 'Order Tracking' ? (
            <DeliveryDashboard userName={safeUserName} userEmail={email} userRole={role} mode="list" />
          ) : ['Dashboard', 'Delivery Monitor', 'Request Inbox', 'Ambil Barang', 'Kirim Barang', 'Stok Barang'].includes(activeView) && (role === 'delivery' && activeView !== 'Dashboard' || activeView === 'Delivery Monitor' && (role === 'admin' || role === 'super-admin')) ? (
            <DeliveryView page={activeView as DeliveryPage} userEmail={email} />
          ) : activeView === 'Absensi' ? (
            <AttendanceWorkspace key={role} userName={safeUserName} photo={attendancePhoto} setPhoto={setAttendancePhoto} attendanceDone={attendanceDone} attendanceRecordId={attendanceRecordId} handleAttendance={handleAttendance} onLocationChange={setAttendanceLocation} userRole={role} />
          ) : (activeView === 'MOM' || activeView === 'Audit MOM' || activeView === 'View MOM Terkait') ? (
            <MOMView userName={safeUserName} userEmail={email} userRole={role as 'sales' | 'product' | 'admin' | 'super-admin'} />
          ) : (activeView === 'SPH' || activeView === 'Verifikasi SPH') ? (
            <SPHView userName={safeUserName} userEmail={email} userRole={role as 'sales' | 'product' | 'admin' | 'super-admin'} />
          ) : ['Dashboard', 'Funnel', 'Request Harga', 'Partnership', 'RAB'].includes(activeView) && (role === 'sales' || role === 'product' || role === 'super-admin') ? (
            activeView === 'Dashboard' ? <><ProductWorkspace userName={safeUserName} userEmail={email} userRole={role} page="Dashboard" onNavigate={setActiveView} /><DeliveryDashboard userName={safeUserName} userEmail={email} userRole={role} mode="preview" onNavigate={() => setActiveView('Order Tracking')} /></> : <ProductWorkspace userName={safeUserName} userEmail={email} userRole={role} page={activeView as 'Funnel' | 'Request Harga' | 'Partnership' | 'RAB'} />
          ) : activeView === 'Dashboard' ? (
            <DeliveryDashboard userName={safeUserName} userEmail={email} userRole={role} mode="preview" onNavigate={() => setActiveView('Order Tracking')} />
          ) : (
            <section className="dashboard-content">
              <div className="welcome-row">
                <div>
                  <p className="eyebrow">{currentDateTime.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
                  <h1>Good morning, {safeUserName.split(' ')[0] || 'there'}.</h1>
                  <p className="muted">Your workspace is ready when you are.</p>
                </div>
                <div className="access-note">
                  <ShieldCheck size={17} />
                  <span><strong>{activeRole.label}</strong><small>Ready for work</small></span>
                </div>
              </div>
            </section>
          )}
          </AppErrorBoundary>
        </main>
      </div>
  )
}

function LoginScreen({ email, password, showPassword, loginError, loginBusy, setEmail, setPassword, setShowPassword, handleLogin }: { email: string; password: string; showPassword: boolean; loginError: string; loginBusy: boolean; setEmail: (value: string) => void; setPassword: (value: string) => void; setShowPassword: (value: boolean) => void; handleLogin: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <main className="login-page">
      <section className="login-art" aria-label="Kawan Utama Digital">
        <div className="art-grid" />
        <div className="art-orbit orbit-one" />
        <div className="art-orbit orbit-two" />
        <a className="brand brand-light" href="#login"><img className="brand-logo brand-logo-light" src={logo} alt="Kawan Utama Digital" /></a>
        <div className="art-copy">
          <p className="eyebrow light">The workspace for better work</p>
          <h1>Make every<br /><em>move</em> matter.</h1>
          <p>One calm place to bring your people, products, and progress together.</p>
        </div>
        <div className="art-footer"><span>© 2026 Kawan Utama Digital</span><span>Built for teams who move forward <ArrowRight size={15} /></span></div>
      </section>
      <section className="login-panel" id="login">
        <div className="login-inner">
          <div className="mobile-brand"><a className="brand" href="#login"><img className="brand-logo" src={logo} alt="Kawan Utama Digital" /></a></div>
          <div className="login-heading">
            <p className="eyebrow">Welcome back</p>
            <h2>Sign in to your<br /><span>workspace.</span></h2>
            <p className="muted">Use your Kawan Utama Digital account to continue.</p>
          </div>
          <form onSubmit={handleLogin} className="login-form">
            <label htmlFor="email">Work email<input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" autoComplete="username" required /></label>
            <label htmlFor="password">Password<div className="password-wrap"><input id="password" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" autoComplete="current-password" required /><button type="button" className="show-password" onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Hide' : 'Show'}</button></div></label>
            {loginError && <p className="login-error" role="alert">{loginError}</p>}
            <button className="submit-button" type="submit" disabled={loginBusy}>{loginBusy ? 'Signing in...' : 'Sign in'} <ArrowRight size={18} /></button>
          </form>
          <p className="signup-note"><LockKeyhole size={14} /> Sign-in and access roles are managed by the local development server.</p>
        </div>
      </section>
    </main>
  )
}

export function AttendanceView({ userName, photo, setPhoto, attendanceDone, handleAttendance }: { userName: string; photo: string; setPhoto: (value: string) => void; attendanceDone: string; handleAttendance: (event: FormEvent<HTMLFormElement>) => void }) {
  function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = () => setPhoto(String(reader.result))
    reader.readAsDataURL(file)
  }

  const formattedTime = attendanceDone ? new Date(attendanceDone).toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'short' }) : ''
  const displayName = userName || 'User'

  return (
    <section className="attendance-view dashboard-content">
      <div className="settings-header">
        <div>
          <p className="eyebrow">Absensi Sales</p>
          <h1>Record your attendance.</h1>
          <p className="muted">Take a photo to record your arrival for today.</p>
        </div>
        <span className="access-note"><ShieldCheck size={17} /><span><strong>Sales access</strong><small>Name is recorded automatically</small></span></span>
      </div>
      <div className="attendance-grid">
        <form className="attendance-panel" onSubmit={handleAttendance}>
          <div className="panel-heading">
            <div className="panel-icon"><Camera size={18} /></div>
            <div><h2>Check-in attendance</h2><p>Photo and account name are required.</p></div>
          </div>
          <div className="attendance-user">
            <span className="profile-avatar">{initialsFromName(displayName)}</span>
            <span><small>Logged in as</small><strong>{displayName}</strong></span>
          </div>
          <label className="photo-upload">
            {photo ? <img src={photo} alt="Attendance preview" /> : <span><Camera size={28} /><strong>Take or upload a photo</strong><small>JPG or PNG, maximum 5 MB</small></span>}
            <input type="file" accept="image/*" capture="user" onChange={handlePhotoChange} required={!photo} />
          </label>
          <button className="submit-button" type="submit" disabled={!photo || Boolean(attendanceDone)}>{attendanceDone ? 'Attendance recorded' : 'Submit attendance'} <CheckCircle2 size={18} /></button>
        </form>
        <div className="attendance-status">
          {attendanceDone ? (
            <>
              <div className="status-icon"><CheckCircle2 size={24} /></div>
              <p className="eyebrow">Checked in</p>
              <h2>Attendance recorded.</h2>
              <p>{formattedTime}</p>
              <img className="attendance-photo" src={photo} alt="Submitted attendance" />
            </>
          ) : (
            <>
              <div className="empty-icon"><LayoutDashboard size={24} /></div>
              <h2>Not checked in yet</h2>
              <p>Your check-in status will appear here after you submit a photo.</p>
            </>
          )}
        </div>
      </div>
    </section>
  )
}

type UserManagementProps = { users: User[]; editingUserId: string | null; newUserName: string; newUserEmail: string; newUserPassword: string; newUserRole: UserRole; setNewUserName: (value: string) => void; setNewUserEmail: (value: string) => void; setNewUserPassword: (value: string) => void; setNewUserRole: (value: UserRole) => void; handleUserSubmit: (event: FormEvent<HTMLFormElement>) => void; editUser: (user: User) => void; deleteUser: (user: User) => void; resetUserForm: () => void }

function SettingsView({ users, editingUserId, newUserName, newUserEmail, newUserPassword, newUserRole, setNewUserName, setNewUserEmail, setNewUserPassword, setNewUserRole, handleUserSubmit, editUser, deleteUser, resetUserForm }: UserManagementProps) {
  const editing = editingUserId !== null
  return (
    <section className="settings-view dashboard-content">
      <div className="settings-header">
        <div>
          <p className="eyebrow">User Management</p>
          <h1>Manage your team.</h1>
          <p className="muted">Super Admin mengelola akun dan akses seluruh tim.</p>
        </div>
        <span className="access-note"><ShieldCheck size={17} /><span><strong>Super Admin</strong><small>Manage all workspace users</small></span></span>
      </div>
      <div className="settings-grid">
        <form className="create-user-panel" onSubmit={handleUserSubmit}>
          <div className="panel-heading">
            <div className="panel-icon"><UserRound size={18} /></div>
            <div><h2>{editing ? 'Edit user' : 'Create new user'}</h2><p>{editing ? 'Kosongkan password jika tidak ingin menggantinya.' : 'Buat akun lokal dan atur role.'}</p></div>
          </div>
          <label>Full name<input value={newUserName} onChange={(event) => setNewUserName(event.target.value)} placeholder="e.g. Andi Wijaya" required /></label>
          <label>Work email<input type="email" value={newUserEmail} onChange={(event) => setNewUserEmail(event.target.value)} placeholder="andi@company.com" required /></label>
          <label>{editing ? 'Password baru (opsional)' : 'Temporary password'}<input type="password" value={newUserPassword} onChange={(event) => setNewUserPassword(event.target.value)} placeholder={editing ? 'Kosongkan jika tidak diubah' : 'Set an initial password'} minLength={8} required={!editing} /></label>
          <label>Access role<select value={newUserRole} onChange={(event) => setNewUserRole(event.target.value as UserRole)}><option value="sales">Sales</option><option value="product">Product</option><option value="delivery">Delivery</option><option value="admin">Admin</option><option value="super-admin">Super Admin</option></select></label>
          <div className="form-actions">
            <button className="submit-button" type="submit">{editing ? 'Save changes' : 'Create user'} <ArrowRight size={18} /></button>
            {editing && <button className="cancel-button" type="button" onClick={resetUserForm}>Cancel</button>}
          </div>
          <p className="form-hint"><LockKeyhole size={14} /> Password disimpan sebagai hash di database lokal dan tidak ditampilkan.</p>
        </form>

        <div className="users-panel">
          <div className="panel-heading">
            <div className="panel-icon"><UsersRound size={18} /></div>
            <div><h2>Team members</h2><p>{users.length} user{users.length === 1 ? '' : 's'} created in this workspace.</p></div>
          </div>
          {users.length === 0 ? (
            <div className="users-empty"><UsersRound size={21} /><span>No team members yet.</span><small>Akun lokal akan muncul di sini.</small></div>
          ) : (
            <div className="user-list">
              {users.map((user) => (
                <div className="user-row" key={user.id}>
                  <span className="profile-avatar">{initialsFromName(user.name)}</span>
                  <span><strong>{user.name}</strong><small>{user.email}</small></span>
                  <span className="user-role">{user.role}</span>
                  <span className="user-created-at">Dibuat {formatUserCreatedAt(user.created_at)}</span>
                  <span className="user-actions">
                    <button type="button" onClick={() => editUser(user)} title="Edit user" aria-label={`Edit ${user.name}`}><Pencil size={14} /></button>
                    <button type="button" onClick={() => deleteUser(user)} title="Delete user" aria-label={`Delete ${user.name}`}><Trash2 size={14} /></button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

export default App
