import { useEffect, useState } from 'react'
import { ArrowUpRight, CalendarDays, CheckCircle2, Clock, FileText, Pencil, Save, ShieldCheck, Send, Trash2, AlertCircle } from 'lucide-react'
import { localApi } from './lib/localApi'

type MOMRecord = {
  id?: number
  created_by_email: string
  created_by_name: string
  status: 'DRAFT' | 'PUBLISHED'
  client_name: string
  meeting_date: string
  meeting_time: string
  summary: string
  notes: string
  action_items: string
  pic_name: string
  deadline: string
  created_at?: string
  updated_at?: string
  published_at?: string
}

type MOMViewProps = {
  userName: string
  userEmail: string
  userRole: 'sales' | 'product' | 'admin' | 'super-admin'
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message
  return 'Kesalahan tidak diketahui.'
}

export function MOMView({ userName, userEmail, userRole }: MOMViewProps) {
  const [momList, setMomList] = useState<MOMRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [draftLoaded, setDraftLoaded] = useState(false)
  const [formData, setFormData] = useState<MOMRecord>({
    created_by_email: userEmail,
    created_by_name: userName,
    status: 'DRAFT',
    client_name: '',
    meeting_date: new Date().toISOString().split('T')[0],
    meeting_time: '',
    summary: '',
    notes: '',
    action_items: '',
    pic_name: '',
    deadline: '',
  })
  const [lastSaved, setLastSaved] = useState<string | null>(null)
  const [isSavingDraft, setIsSavingDraft] = useState(false)

  // Load MOM list
  useEffect(() => {
    loadMOMList()
  }, [])

  // Auto-save draft every 30 seconds
  useEffect(() => {
    if (formData.status === 'PUBLISHED') return

    const interval = setInterval(() => {
      if (formData.client_name) {
        saveDraft()
      }
    }, 30000)

    return () => clearInterval(interval)
  }, [formData])

  // Load from localStorage if exists (restore draft)
  useEffect(() => {
    const savedDraft = localStorage.getItem(`mom-draft-${userEmail}`)
    if (savedDraft) {
      try {
        setFormData(JSON.parse(savedDraft))
      } catch (err) {
        console.error('Failed to load draft from localStorage:', err)
      }
    }
  }, [userEmail])

  // Auto-load the saved draft when the user's MOM list is fetched.
  useEffect(() => {
    if (userRole === 'sales' && momList.length > 0 && !draftLoaded && !formData.client_name) {
      const draft = momList.find(m => m.status === 'DRAFT')
      if (draft) {
        setFormData(draft)
        setShowForm(true)
        setDraftLoaded(true)
      }
    }
  }, [momList, userRole, draftLoaded, formData.client_name])

  async function loadMOMList() {
    try {
      const data = await localApi.mom<MOMRecord[]>()
      setMomList(data)
      setErrorMessage('')
    } catch (err) {
      console.error('Failed to load MOM:', err)
      setErrorMessage(`Gagal memuat data MOM: ${getErrorMessage(err)}`)
    } finally {
      setLoading(false)
    }
  }

  async function saveDraft() {
    if (!formData.client_name) return

    try {
      setIsSavingDraft(true)
      setErrorMessage('')
      let draft: MOMRecord = { ...formData, status: 'DRAFT' }
      if (formData.id) {
        await localApi.updateMom(formData.id, { ...draft, updated_at: new Date().toISOString() })
      } else {
        const data = await localApi.createMom<MOMRecord>({ ...draft, created_at: new Date().toISOString() })
        draft = { ...draft, id: data.id }
      }

      setFormData(draft)
      setMomList((current) => current.some((mom) => mom.id === draft.id)
        ? current.map((mom) => mom.id === draft.id ? draft : mom)
        : [draft, ...current])
      setLastSaved(new Date().toLocaleTimeString('id-ID'))
      window.setTimeout(() => setLastSaved(null), 2500)
    } catch (err) {
      console.error('Error saving draft:', err)
      setErrorMessage(`Gagal menyimpan draft: ${getErrorMessage(err)}`)
    } finally {
      setIsSavingDraft(false)
    }
  }

  async function publishMOM() {
    if (!formData.client_name) {
      alert('Mohon lengkapi nama client terlebih dahulu')
      return
    }

    try {
      setErrorMessage('')
      const publishedData = {
        ...formData,
        status: 'PUBLISHED',
        published_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      if (formData.id) {
        await localApi.updateMom(formData.id, publishedData)
      } else {
        await localApi.createMom<MOMRecord>(publishedData)
      }

      localStorage.removeItem(`mom-draft-${userEmail}`)

      setFormData({
        created_by_email: userEmail,
        created_by_name: userName,
        status: 'DRAFT',
        client_name: '',
        meeting_date: new Date().toISOString().split('T')[0],
        meeting_time: '',
        summary: '',
        notes: '',
        action_items: '',
        pic_name: '',
        deadline: '',
      })

      setShowForm(false)
      alert('MOM berhasil dipublikasikan!')
      loadMOMList()
    } catch (err) {
      console.error('Error publishing MOM:', err)
      setErrorMessage(`Gagal mempublikasikan MOM: ${getErrorMessage(err)}`)
    }
  }

  async function updatePublishedMOM() {
    if (!formData.id || formData.status !== 'PUBLISHED') {
      alert('Hanya MOM published yang bisa diedit')
      return
    }

    try {
      setErrorMessage('')
      await localApi.updateMom(formData.id, { ...formData, updated_at: new Date().toISOString() })

      alert('MOM berhasil diperbarui!')
      setShowForm(false)
      loadMOMList()
    } catch (err) {
      console.error('Error updating published MOM:', err)
      setErrorMessage(`Gagal memperbarui MOM: ${getErrorMessage(err)}`)
    }
  }

  async function deleteMOM(momId: number | undefined) {
    if (!momId) return

    if (!confirm('Yakin ingin menghapus MOM ini?')) return

    try {
      setErrorMessage('')
      await localApi.deleteMom(momId)
      alert('MOM berhasil dihapus!')
      setShowForm(false)
      loadMOMList()
    } catch (err) {
      console.error('Error deleting MOM:', err)
      setErrorMessage(`Gagal menghapus MOM: ${getErrorMessage(err)}`)
    }
  }

  function handleFormChange(field: keyof MOMRecord, value: string) {
    setFormData({ ...formData, [field]: value })
  }

  function handleNewMOM() {
    setFormData({
      created_by_email: userEmail,
      created_by_name: userName,
      status: 'DRAFT',
      client_name: '',
      meeting_date: new Date().toISOString().split('T')[0],
      meeting_time: '',
      summary: '',
      notes: '',
      action_items: '',
      pic_name: '',
      deadline: '',
    })
    localStorage.removeItem(`mom-draft-${userEmail}`)
    setShowForm(true)
    setDraftLoaded(true) // Prevent auto-load while user is creating new MOM
  }

  if (loading) {
    return (
      <section className="dashboard-content">
        <p className="muted">Loading MOM data...</p>
      </section>
    )
  }

  return (
    <section className="dashboard-content mom-view">
      <div className="mom-hero">
        <div className="mom-hero-copy">
          <p className="eyebrow">Minutes of Meeting <span> / </span> Workspace archive</p>
          <h1>Setiap percakapan<br /><em>punya arah.</em></h1>
          <p>{userRole === 'sales' ? 'Simpan keputusan, catatan, dan tindak lanjut dari setiap pertemuan.' : 'Baca perkembangan klien dan tindak lanjut terbaru dari tim sales.'}</p>
        </div>
        <div className="mom-hero-side">
          <span className="mom-role-mark"><ShieldCheck size={17} /> {userRole === 'sales' ? 'Sales' : userRole === 'product' ? 'Product' : userRole === 'admin' ? 'Admin' : 'Super Admin'}</span>
          {userRole === 'sales' && !showForm && (
            <button className="mom-create-button" onClick={handleNewMOM}><FileText size={17} /> Buat MOM Baru <ArrowUpRight size={16} /></button>
          )}
        </div>
        <div className="mom-hero-index" aria-hidden="true">MOM<span> / 01</span></div>
      </div>

      <div className="mom-overview-strip" aria-label="Ringkasan MOM">
        <div className="mom-stat"><span>Total laporan</span><strong>{momList.length.toString().padStart(2, '0')}</strong><small>Arsip workspace</small></div>
        <div className="mom-stat"><span>Published</span><strong>{momList.filter((mom) => mom.status === 'PUBLISHED').length.toString().padStart(2, '0')}</strong><small>Siap ditinjau tim</small></div>
        <div className="mom-stat"><span>Draft</span><strong>{momList.filter((mom) => mom.status === 'DRAFT').length.toString().padStart(2, '0')}</strong><small>Tersimpan untuk dilanjutkan</small></div>
        <div className="mom-auto-save"><span className="mom-live-dot" /> {userRole === 'sales' ? 'Draft tersimpan otomatis' : 'Arsip MOM terpublikasi'}</div>
      </div>

      {errorMessage && <p className="form-hint" role="alert" style={{ color: '#2868a9', justifyContent: 'flex-start', marginBottom: 16 }}>{errorMessage}</p>}

      {showForm && (userRole === 'sales' || (userRole === 'super-admin' && formData.status === 'PUBLISHED')) && (
        <div className="mom-form-wrap">
          <form className="create-user-panel mom-form-panel" onSubmit={(e) => { e.preventDefault(); publishMOM() }}>
            <div className="panel-heading">
              <div className="panel-icon">
                <FileText size={18} />
              </div>
              <div>
                <h2>
                  {formData.id ? 'Edit MOM Draft' : 'Buat MOM Baru'}
                </h2>
                <p>
                  {formData.status === 'DRAFT' ? (
                    <span style={{ color: '#397aca' }}>
                      <Clock size={14} style={{ display: 'inline', marginRight: '4px' }} />
                      Draft - Hanya Anda yang bisa melihat
                    </span>
                  ) : (
                    <span style={{ color: '#2868a9' }}>
                      <CheckCircle2 size={14} style={{ display: 'inline', marginRight: '4px' }} />
                      Published - Terlihat oleh tim lain
                    </span>
                  )}
                </p>
              </div>
            </div>

            <label>
              Nama Client
              <input
                value={formData.client_name}
                onChange={(e) => handleFormChange('client_name', e.target.value)}
                placeholder="e.g. PT Contoh Jaya"
                required
              />
            </label>

            <label>
              PIC (Penanggung Jawab)
              <input
                value={formData.pic_name}
                onChange={(e) => handleFormChange('pic_name', e.target.value)}
                placeholder="Nama orang yang bertanggung jawab"
              />
            </label>

            <label>
              Tanggal Pertemuan
              <input
                type="date"
                value={formData.meeting_date}
                onChange={(e) => handleFormChange('meeting_date', e.target.value)}
                required
              />
            </label>

            <label>
              Waktu Pertemuan
              <input
                type="time"
                value={formData.meeting_time}
                onChange={(e) => handleFormChange('meeting_time', e.target.value)}
              />
            </label>

            <label>
              Ringkasan Hasil Pertemuan
              <textarea
                value={formData.summary}
                onChange={(e) => handleFormChange('summary', e.target.value)}
                placeholder="Ringkas hasil diskusi dengan klien..."
                rows={4}
              />
            </label>

            <label>
              Action Items / Kesimpulan
              <textarea
                value={formData.action_items}
                onChange={(e) => handleFormChange('action_items', e.target.value)}
                placeholder="Tindak lanjut yang perlu dilakukan..."
                rows={3}
              />
            </label>

            <div className="form-actions">
              {formData.status === 'DRAFT' ? (
                <>
                  <button className="submit-button" type="button" onClick={() => saveDraft()} disabled={isSavingDraft || !formData.client_name}>
                    <Save size={16} /> Simpan Draft
                  </button>
                  <button className="submit-button" type="submit" style={{ backgroundColor: '#2868a9' }}>
                    <Send size={18} /> Publikasikan MOM
                  </button>
                </>
              ) : (userRole as string) === 'super-admin' ? (
                  <>
                    <button className="submit-button" type="button" onClick={() => updatePublishedMOM()} style={{ backgroundColor: '#2868a9' }}>
                      <Pencil size={16} /> Update MOM
                    </button>
                    <button className="cancel-button" type="button" onClick={() => deleteMOM(formData.id)}>
                      <Trash2 size={16} /> Hapus MOM
                    </button>
                  </>
                ) : null}
              <button className="cancel-button" type="button" onClick={() => setShowForm(false)}>
                Tutup
              </button>
              {lastSaved && (
                <small style={{ color: '#2868a9' }}>
                  <CheckCircle2 size={14} /> Draft tersimpan {lastSaved}
                </small>
              )}
            </div>

            {formData.status === 'DRAFT' && (
              <p className="form-hint">
                <AlertCircle size={14} /> Draft Anda otomatis tersimpan di perangkat ini (seperti WhatsApp). Tekan "Simpan Draft" untuk menyimpan ke database agar bisa diakses di perangkat lain. Tekan "Publikasikan MOM" untuk mengirim ke tim.
              </p>
            )}
          </form>
        </div>
      )}

      <div className="mom-list-wrap">
        <div className="users-panel mom-list-panel">
          <div className="mom-list-heading">
            <div>
              <p className="eyebrow">Meeting records</p>
              <h2>{userRole === 'sales' ? 'Arsip pertemuan saya' : 'Laporan dari tim sales'}</h2>
              <p>{momList.length} laporan tercatat di workspace</p>
            </div>
            <span className="mom-list-date"><CalendarDays size={16} /> {new Date().toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}</span>
          </div>

          {momList.length === 0 ? (
            <div className="mom-empty-state">
              <span><FileText size={22} /></span>
              <strong>Belum ada catatan pertemuan.</strong>
              <p>{userRole === 'sales' ? 'Buat MOM pertama untuk mulai mengarsipkan hasil diskusi.' : 'Laporan yang dipublikasikan tim sales akan muncul di sini.'}</p>
            </div>
          ) : (
            <div className="mom-table-scroll">
              <table className="users-table mom-table">
                <thead>
                  <tr><th>Client / topik</th><th>Tanggal pertemuan</th><th>Status</th><th>Dibuat oleh</th><th aria-label="Aksi" /></tr>
                </thead>
                <tbody>
                  {momList.map((mom) => (
                    <tr key={mom.id}>
                      <td><strong>{mom.client_name}</strong><small>{mom.summary || 'Catatan pertemuan'}</small></td>
                      <td><span className="mom-meeting-date">{new Date(mom.meeting_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</span>{mom.meeting_time && <small>{mom.meeting_time}</small>}</td>
                      <td><span className={`mom-status ${mom.status === 'DRAFT' ? 'is-draft' : 'is-published'}`}><span />{mom.status === 'DRAFT' ? 'Draft' : 'Published'}</span></td>
                      <td><span className="mom-author"><span>{mom.created_by_name?.trim()?.slice(0, 1).toUpperCase() || '?'}</span>{mom.created_by_name}</span></td>
                      <td><button className="mom-open-button" onClick={() => { setFormData(mom); setShowForm(true) }}>{mom.status === 'PUBLISHED' && userRole === 'super-admin' ? 'Edit / Lihat' : 'Lihat'} <ArrowUpRight size={15} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
