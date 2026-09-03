import { useEffect, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { ArrowRight, BarChart3, Boxes, Camera, CheckCircle2, ChevronDown, CircleHelp, LayoutDashboard, LockKeyhole, LogOut, Menu, Pencil, Settings, ShieldCheck, Trash2, UserRound, UsersRound, X } from 'lucide-react'
import logo from './assets/kawan-utama-digital.png'
import { CameraAttendance } from './CameraAttendance'
import { MOMView } from './MOMView'
import { RequestView } from './RequestView'
import { supabase } from './lib/supabase'
import './App.css'

type Role = 'sales' | 'product' | 'admin' | 'super-admin'
type UserRole = Exclude<Role, 'super-admin'>
type User = { name: string; email: string; password: string; role: Role }
type NavItem = { label: string; icon: typeof LayoutDashboard }

const superAdmin: User = { name: 'Sarah Anderson', email: 'superadmin@kawanutama.com', password: 'Admin123!', role: 'super-admin' }
const roles: { value: Role; label: string; description: string }[] = [
  { value: 'sales', label: 'Sales', description: 'Kelola pelanggan dan penjualan' },
  { value: 'product', label: 'Product', description: 'Kelola katalog dan produk' },
  { value: 'admin', label: 'Admin', description: 'Kelola operasional aplikasi' },
  { value: 'super-admin', label: 'Super Admin', description: 'Akses penuh ke seluruh sistem' },
]
const navByRole: Record<Role, NavItem[]> = {
  sales: [{ label: 'Absensi', icon: LayoutDashboard }, { label: 'MOM', icon: BarChart3 }, { label: 'Request', icon: Boxes }, { label: 'SPH', icon: ArrowRight }],
  product: [{ label: 'Request', icon: Boxes }, { label: 'Verifikasi SPH', icon: ShieldCheck }, { label: 'View MOM Terkait', icon: BarChart3 }],
  admin: [{ label: 'Monitor & Rekap Absensi', icon: LayoutDashboard }, { label: 'Audit MOM', icon: BarChart3 }, { label: 'SPH', icon: ShieldCheck }, { label: 'User Management', icon: UsersRound }],
  'super-admin': [{ label: 'Absensi', icon: LayoutDashboard }, { label: 'MOM', icon: BarChart3 }, { label: 'Request', icon: Boxes }, { label: 'SPH', icon: ArrowRight }, { label: 'Verifikasi SPH', icon: ShieldCheck }, { label: 'View MOM Terkait', icon: BarChart3 }, { label: 'Monitor & Rekap Absensi', icon: LayoutDashboard }, { label: 'Audit MOM', icon: BarChart3 }, { label: 'User Management', icon: UsersRound }, { label: 'System settings', icon: Settings }],
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
  const [attendancePhoto, setAttendancePhoto] = useState('')
  const [attendanceLocation, setAttendanceLocation] = useState<{ latitude: number; longitude: number; label: string } | null>(null)
  const [attendanceDone, setAttendanceDone] = useState(() => localStorage.getItem('kawan-attendance') ?? '')
  const activeRole = roles.find((item) => item.value === role) ?? roles[0]

  // Load users from Supabase on component mount
  useEffect(() => {
    const loadUsers = async () => {
      if (!supabase) return
      try {
        const { data, error } = await supabase.from('users').select('*').order('created_at', { ascending: true })
        if (error) {
          console.error('Error loading users:', error)
        } else {
          setUsers(data || [])
        }
      } catch (err) {
        console.error('Failed to load users:', err)
      }
    }
    loadUsers()
  }, [])

  function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const account = [superAdmin, ...users].find((user) => user.email.toLowerCase() === email.toLowerCase() && user.password === password)
    if (account) {
      setCurrentUserName(account.name)
      setRole(account.role)
      setActiveView(navByRole[account.role][0].label)
      setIsLoggedIn(true)
    }
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
      alert('Supabase belum siap')
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
        setUsers(data || [])
      } else {
        // Create new user
        const { error } = await supabase.from('users').insert([
          { name: newUserName, email: newUserEmail, password: newUserPassword, role: newUserRole },
        ])

        if (error) {
          alert('Gagal membuat user: ' + error.message)
          return
        }

        // Reload users
        const { data } = await supabase.from('users').select('*').order('created_at', { ascending: true })
        setUsers(data || [])
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
    if (!supabase) return

    try {
      const { error } = await supabase.from('users').delete().eq('email', userEmail)

      if (error) {
        alert('Gagal hapus user: ' + error.message)
        return
      }

      // Reload users
      const { data } = await supabase.from('users').select('*').order('created_at', { ascending: true })
      setUsers(data || [])
    } catch (err) {
      console.error('Error deleting user:', err)
      alert('Terjadi kesalahan saat menghapus user')
    }
  }
  async function handleAttendance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!attendancePhoto) return

    if (!supabase) {
      alert('Supabase belum siap. Cek konfigurasi environment.')
      return
    }

    // Required fields based on attendance table schema
    const payload = {
      user_name: currentUserName,
      user_email: email || `${currentUserName.toLowerCase().replace(/\s+/g, '.')}@kawanutama.com`, // Fallback email if not available
      location_label: attendanceLocation?.label ?? 'Lokasi tidak tersedia',
      latitude: attendanceLocation?.latitude ?? null,
      longitude: attendanceLocation?.longitude ?? null,
      created_at: new Date().toISOString(),
    }

    console.log('📤 Submitting attendance payload:', payload)
    const { data, error } = await supabase.from('attendance').insert([payload])
    
    console.log('📥 Insert response - Data:', data, 'Error:', error)

    if (error) {
      console.error('❌ Supabase insert error:', error)
      alert('Gagal menyimpan absensi: ' + error.message)
      return
    }
    
    console.log('✅ Attendance saved successfully!')

    const timestamp = new Date().toISOString()
    setAttendanceDone(timestamp)
    localStorage.setItem('kawan-attendance', timestamp)
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
      {activeView === 'System settings' && role === 'super-admin' ? <SettingsView users={users} editingEmail={editingEmail} newUserName={newUserName} newUserEmail={newUserEmail} newUserPassword={newUserPassword} newUserRole={newUserRole} setNewUserName={setNewUserName} setNewUserEmail={setNewUserEmail} setNewUserPassword={setNewUserPassword} setNewUserRole={setNewUserRole} handleUserSubmit={handleUserSubmit} editUser={editUser} deleteUser={deleteUser} resetUserForm={resetUserForm} /> : activeView === 'Absensi' && (role === 'sales' || role === 'super-admin') ? <CameraAttendance userName={currentUserName} photo={attendancePhoto} setPhoto={setAttendancePhoto} attendanceDone={attendanceDone} handleAttendance={handleAttendance} onLocationChange={setAttendanceLocation} /> : (activeView === 'MOM' || activeView === 'Audit MOM' || activeView === 'View MOM Terkait') ? <MOMView userName={currentUserName} userEmail={email} userRole={role as 'sales' | 'product' | 'admin' | 'super-admin'} /> : activeView === 'Request' ? <RequestView userName={currentUserName} userEmail={email} userRole={role as 'sales' | 'product' | 'admin' | 'super-admin'} /> : <section className="dashboard-content"><div className="welcome-row"><div><p className="eyebrow">Friday, 28 August 2026</p><h1>Good morning, {currentUserName.split(' ')[0]}.</h1><p className="muted">Your workspace is ready when you are.</p></div><div className="access-note"><ShieldCheck size={17} /><span><strong>{activeRole.label} access</strong><small>Menu shown for your role</small></span></div></div><div className="empty-state"><div className="empty-icon"><LayoutDashboard size={24} /></div><h2>{activeView} is empty</h2><p>When your workspace has activity, you'll see it here.</p></div></section>}
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

function SettingsView({ users, editingEmail, newUserName, newUserEmail, newUserPassword, newUserRole, setNewUserName, setNewUserEmail, setNewUserPassword, setNewUserRole, handleUserSubmit, editUser, deleteUser, resetUserForm }: { users: User[]; editingEmail: string | null; newUserName: string; newUserEmail: string; newUserPassword: string; newUserRole: UserRole; setNewUserName: (value: string) => void; setNewUserEmail: (value: string) => void; setNewUserPassword: (value: string) => void; setNewUserRole: (value: UserRole) => void; handleUserSubmit: (event: FormEvent<HTMLFormElement>) => void; editUser: (user: User) => void; deleteUser: (email: string) => void; resetUserForm: () => void }) {
  return <section className="settings-view dashboard-content"><div className="settings-header"><div><p className="eyebrow">System settings</p><h1>Manage your team.</h1><p className="muted">Create and manage access for your Kawan Utama Digital workspace.</p></div><span className="access-note"><ShieldCheck size={17} /><span><strong>Super Admin only</strong><small>Full system access</small></span></span></div><div className="settings-grid"><form className="create-user-panel" onSubmit={handleUserSubmit}><div className="panel-heading"><div className="panel-icon"><UserRound size={18} /></div><div><h2>{editingEmail ? 'Edit user' : 'Create new user'}</h2><p>{editingEmail ? 'Update this team member’s access.' : 'Add a team member and assign their access role.'}</p></div></div><label>Full name<input value={newUserName} onChange={(event) => setNewUserName(event.target.value)} placeholder="e.g. Andi Wijaya" required /></label><label>Work email<input type="email" value={newUserEmail} onChange={(event) => setNewUserEmail(event.target.value)} placeholder="andi@company.com" required /></label><label>Temporary password<input type="password" value={newUserPassword} onChange={(event) => setNewUserPassword(event.target.value)} placeholder="Set an initial password" minLength={8} required /></label><label>Access role<select value={newUserRole} onChange={(event) => setNewUserRole(event.target.value as UserRole)}><option value="sales">Sales</option><option value="product">Product</option><option value="admin">Admin</option></select></label><div className="form-actions"><button className="submit-button" type="submit">{editingEmail ? 'Save changes' : 'Create user'} <ArrowRight size={18} /></button>{editingEmail && <button className="cancel-button" type="button" onClick={resetUserForm}>Cancel</button>}</div><p className="form-hint"><LockKeyhole size={14} /> User signs in with this email and password.</p></form><div className="users-panel"><div className="panel-heading"><div className="panel-icon"><UsersRound size={18} /></div><div><h2>Team members</h2><p>{users.length} user{users.length === 1 ? '' : 's'} created in this workspace.</p></div></div>{users.length === 0 ? <div className="users-empty"><UsersRound size={21} /><span>No team members yet.</span><small>Users you create will appear here.</small></div> : <div className="user-list">{users.map((user) => <div className="user-row" key={user.email}><span className="profile-avatar">{user.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</span><span><strong>{user.name}</strong><small>{user.email}</small></span><span className="user-role">{user.role}</span><span className="user-actions"><button type="button" onClick={() => editUser(user)} title="Edit user" aria-label={`Edit ${user.name}`}><Pencil size={14} /></button><button type="button" onClick={() => deleteUser(user.email)} title="Delete user" aria-label={`Delete ${user.name}`}><Trash2 size={14} /></button></span></div>)}</div>}</div></div></section>
}

export default App
