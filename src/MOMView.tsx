import { useEffect, useState } from 'react'
import { CheckCircle2, ShieldCheck, Send, FileText, Clock, AlertCircle } from 'lucide-react'
import { supabase } from './lib/supabase'

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

export function MOMView({ userName, userEmail, userRole }: MOMViewProps) {
  const [momList, setMomList] = useState<MOMRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
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

  async function loadMOMList() {
    if (!supabase) {
      setLoading(false)
      return
    }

    try {
      let query = supabase.from('mom').select('*')

      // Filter based on role and status
      if (userRole === 'sales') {
        // Sales sees only their own MOM (both DRAFT and PUBLISHED)
        query = query.eq('created_by_email', userEmail)
      } else {
        // Product, Admin, and Super Admin see only PUBLISHED MOM
        // Even Super Admin cannot see DRAFT of others
        query = query.eq('status', 'PUBLISHED')
      }

      const { data, error } = await query.order('created_at', { ascending: false })

      if (error) {
        console.error('Error loading MOM:', error)
      } else {
        setMomList(data || [])
      }
    } catch (err) {
      console.error('Failed to load MOM:', err)
    } finally {
      setLoading(false)
    }
  }

  async function saveDraft() {
    if (!supabase || !formData.client_name) return

    try {
      setIsSavingDraft(true)

      // Always save to localStorage first (auto-save like WhatsApp)
      localStorage.setItem(`mom-draft-${userEmail}`, JSON.stringify(formData))

      // Save to Supabase if not already saved
      if (formData.id) {
        // Update existing draft
        await supabase
          .from('mom')
          .update({ ...formData, status: 'DRAFT', updated_at: new Date().toISOString() })
          .eq('id', formData.id)
      } else {
        // Create new draft in database
        const { data } = await supabase
          .from('mom')
          .insert([{ ...formData, status: 'DRAFT', created_at: new Date().toISOString() }])
          .select()

        if (data && data[0]) {
          setFormData({ ...formData, id: data[0].id })
        }
      }

      setLastSaved(new Date().toLocaleTimeString('id-ID'))
      setTimeout(() => setLastSaved(null), 2000)
    } catch (err) {
      console.error('Error saving draft:', err)
    } finally {
      setIsSavingDraft(false)
    }
  }

  async function publishMOM() {
    if (!formData.client_name) {
      alert('Mohon lengkapi nama client terlebih dahulu')
      return
    }

    if (!supabase) return

    try {
      const publishedData = {
        ...formData,
        status: 'PUBLISHED',
        published_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      if (formData.id) {
        // Update existing draft to published
        await supabase.from('mom').update(publishedData).eq('id', formData.id)
      } else {
        // Create and publish immediately
        await supabase.from('mom').insert([publishedData])
      }

      // Clear localStorage
      localStorage.removeItem(`mom-draft-${userEmail}`)

      // Reset form
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
      alert('Gagal mempublikasikan MOM')
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
  }

  if (loading) {
    return (
      <section className="dashboard-content">
        <p className="muted">Loading MOM data...</p>
      </section>
    )
  }

  return (
    <section className="dashboard-content">
      <div className="settings-header">
        <div>
          <p className="eyebrow">Minutes of Meeting</p>
          <h1>Kelola Hasil Pertemuan.</h1>
          <p className="muted">
            {userRole === 'sales'
              ? 'Catat hasil pertemuan dengan klien dan buat laporan MOM.'
              : 'Lihat dan tinjau laporan MOM dari tim sales.'}
          </p>
        </div>
        <span className="access-note">
          <ShieldCheck size={17} />
          <span>
            <strong>{userRole === 'sales' ? 'Sales' : userRole === 'product' ? 'Product' : userRole === 'admin' ? 'Admin' : 'Super Admin'}</strong>
            <small>Auto-save enabled</small>
          </span>
        </span>
      </div>

      {userRole === 'sales' && !showForm && (
        <button className="submit-button" onClick={handleNewMOM} style={{ marginBottom: '2rem' }}>
          <FileText size={18} /> Buat MOM Baru
        </button>
      )}

      {showForm && userRole === 'sales' && (
        <div className="settings-grid" style={{ marginBottom: '2rem' }}>
          <form className="create-user-panel" onSubmit={(e) => { e.preventDefault(); publishMOM() }}>
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
                    <span style={{ color: '#ff9500' }}>
                      <Clock size={14} style={{ display: 'inline', marginRight: '4px' }} />
                      Draft - Hanya Anda yang bisa melihat
                    </span>
                  ) : (
                    <span style={{ color: '#00b894' }}>
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
              Catatan Tambahan
              <textarea
                value={formData.notes}
                onChange={(e) => handleFormChange('notes', e.target.value)}
                placeholder="Catatan atau follow-up penting..."
                rows={3}
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

            <label>
              PIC (Penanggung Jawab)
              <input
                value={formData.pic_name}
                onChange={(e) => handleFormChange('pic_name', e.target.value)}
                placeholder="Nama orang yang bertanggung jawab"
              />
            </label>

            <label>
              Deadline
              <input
                type="date"
                value={formData.deadline}
                onChange={(e) => handleFormChange('deadline', e.target.value)}
              />
            </label>

            <div className="form-actions">
              <button className="submit-button" type="button" onClick={() => saveDraft()} disabled={isSavingDraft || !formData.client_name}>
                💾 Simpan Draft
              </button>
              <button className="submit-button" type="submit" style={{ backgroundColor: '#00b894' }}>
                <Send size={18} /> Publikasikan MOM
              </button>
              <button className="cancel-button" type="button" onClick={() => setShowForm(false)}>
                Batal
              </button>
              {lastSaved && (
                <small style={{ color: '#00b894' }}>
                  ✓ Draft tersimpan {lastSaved}
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

      <div className="settings-grid">
        <div className="users-panel">
          <div className="panel-heading">
            <div className="panel-icon">
              <FileText size={18} />
            </div>
            <div>
              <h2>
                {userRole === 'sales' ? 'MOM Saya' : 'MOM Published'}
              </h2>
              <p>
                {momList.length} laporan
              </p>
            </div>
          </div>

          {momList.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>
              <p>Belum ada MOM</p>
            </div>
          ) : (
            <table className="users-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Tanggal</th>
                  <th>Status</th>
                  <th>Dibuat oleh</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {momList.map((mom) => (
                  <tr key={mom.id}>
                    <td>
                      <strong>{mom.client_name}</strong>
                    </td>
                    <td>{new Date(mom.meeting_date).toLocaleDateString('id-ID')}</td>
                    <td>
                      <span
                        style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: '500',
                          backgroundColor: mom.status === 'DRAFT' ? '#fff3cd' : '#d4edda',
                          color: mom.status === 'DRAFT' ? '#856404' : '#155724',
                        }}
                      >
                        {mom.status}
                      </span>
                    </td>
                    <td>{mom.created_by_name}</td>
                    <td>
                      <button
                        onClick={() => {
                          setFormData(mom)
                          setShowForm(true)
                        }}
                        style={{ padding: '4px 8px', fontSize: '12px', cursor: 'pointer' }}
                      >
                        Lihat
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  )
}
