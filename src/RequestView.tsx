import { useEffect, useState } from 'react'
import { MessageCircle, Send, CheckCircle2, Clock, AlertCircle, X } from 'lucide-react'
import { supabase } from './lib/supabase'

type RequestRecord = {
  id?: number
  title: string
  description: string
  status: 'PENDING' | 'IN_REVIEW' | 'ANSWERED'
  created_by_email: string
  created_by_name: string
  assigned_to?: string
  product_response?: string
  media_url?: string
  response_media_url?: string
  priority?: 'LOW' | 'MEDIUM' | 'HIGH'
  created_at?: string
  updated_at?: string
}

type RequestViewProps = {
  userName: string
  userEmail: string
  userRole: 'sales' | 'product' | 'admin' | 'super-admin'
}

type RequestMessage = {
  id: number
  request_id: number
  sender_name: string
  sender_email: string
  sender_role: 'sales' | 'product' | 'admin' | 'super-admin'
  message: string
  created_at: string
}

export function RequestView({ userName, userEmail, userRole }: RequestViewProps) {
  const [requestList, setRequestList] = useState<RequestRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState<RequestRecord | null>(null)
  const [formData, setFormData] = useState<RequestRecord>({
    title: '',
    description: '',
    status: 'PENDING',
    created_by_email: userEmail,
    created_by_name: userName,
  })
  const [responseText, setResponseText] = useState('')
  const [messages, setMessages] = useState<RequestMessage[]>([])
  const [messagesLoading, setMessagesLoading] = useState(false)

  // Load request list
  useEffect(() => {
    loadRequestList()
  }, [userEmail, userName, userRole])

  async function loadRequestList() {
    if (!supabase) {
      setLoading(false)
      return
    }

    try {
      let query = supabase.from('requests').select('*')

      // Filter based on role
      if (userRole === 'sales') {
        // Sales sees only their own requests
        query = query.eq('created_by_email', userEmail)
      } else if (userRole === 'product') {
        // Product sees all requests assigned to them or unassigned
        query = query.or(`assigned_to.eq.${userName},assigned_to.is.null`)
      } else if (userRole === 'admin') {
        // Admin sees all requests
        query = supabase.from('requests').select('*')
      } else {
        // Super Admin sees all requests
        query = supabase.from('requests').select('*')
      }

      const { data, error } = await query.order('created_at', { ascending: false })

      if (error) {
        console.error('Error loading requests:', error)
      } else {
        setRequestList(data || [])
      }
    } catch (err) {
      console.error('Failed to load requests:', err)
    } finally {
      setLoading(false)
    }
  }

  async function createRequest() {
    if (!formData.title || !formData.description) {
      alert('Mohon lengkapi judul dan deskripsi')
      return
    }

    if (!supabase) {
      alert('Supabase belum siap')
      return
    }

    try {
      const { data, error } = await supabase
        .from('requests')
        .insert([
          {
            ...formData,
            status: 'PENDING',
            created_at: new Date().toISOString(),
          },
        ])
        .select()
        .single()

      if (error) throw error

      setFormData({
        title: '',
        description: '',
        status: 'PENDING',
        created_by_email: userEmail,
        created_by_name: userName,
      })
      setShowForm(false)
      alert('Request berhasil dibuat!')
      if (data) {
        setRequestList((currentRequests) => [data, ...currentRequests])
      }
    } catch (err) {
      console.error('Error creating request:', err)
      alert('Gagal membuat request: ' + (err as Error).message)
    }
  }

  async function submitResponse(requestId: number) {
    if (!responseText.trim()) {
      alert('Mohon isi respons terlebih dahulu')
      return
    }

    if (!supabase) return

    try {
      const { error: messageError } = await supabase.from('request_messages').insert({
        request_id: requestId,
        sender_name: userName,
        sender_email: userEmail,
        sender_role: userRole,
        message: responseText.trim(),
      })

      if (messageError) throw messageError

      const { error } = await supabase.from('requests').update({
        product_response: userRole === 'product' ? responseText.trim() : selectedRequest?.product_response,
        status: userRole === 'sales' ? 'IN_REVIEW' : 'ANSWERED',
        updated_at: new Date().toISOString(),
      }).eq('id', requestId)

      if (error) throw error

      setResponseText('')
      await loadMessages(requestId)
      setSelectedRequest((current) => current ? {
        ...current,
        status: userRole === 'sales' ? 'IN_REVIEW' : 'ANSWERED',
        product_response: userRole === 'product' ? responseText.trim() : current.product_response,
      } : current)
      alert('Respons berhasil dikirim')
      loadRequestList()
    } catch (err) {
      console.error('Error submitting response:', err)
      alert('Gagal mengirim respons')
    }
  }

  async function loadMessages(requestId: number) {
    if (!supabase) return

    setMessagesLoading(true)
    try {
      const { data, error } = await supabase
        .from('request_messages')
        .select('*')
        .eq('request_id', requestId)
        .order('created_at', { ascending: true })

      if (error) throw error
      setMessages(data || [])
    } catch (err) {
      console.error('Error loading request messages:', err)
      setMessages([])
    } finally {
      setMessagesLoading(false)
    }
  }

  function selectRequest(request: RequestRecord) {
    setSelectedRequest(request)
    setResponseText('')
    if (request.id) void loadMessages(request.id)
  }

  const getStatusColor = (status: RequestRecord['status']) => {
    switch (status) {
      case 'PENDING':
        return { bg: '#fff3cd', text: '#856404' }
      case 'IN_REVIEW':
        return { bg: '#cce5ff', text: '#004085' }
      case 'ANSWERED':
        return { bg: '#d4edda', text: '#155724' }
      default:
        return { bg: '#f5f5f5', text: '#666' }
    }
  }

  const getStatusIcon = (status: RequestRecord['status']) => {
    switch (status) {
      case 'PENDING':
        return <Clock size={14} />
      case 'IN_REVIEW':
        return <AlertCircle size={14} />
      case 'ANSWERED':
        return <CheckCircle2 size={14} />
      default:
        return null
    }
  }

  if (loading) {
    return (
      <section className="dashboard-content">
        <p className="muted">Loading requests...</p>
      </section>
    )
  }

  return (
    <section className="dashboard-content">
      <div className="settings-header">
        <div>
          <p className="eyebrow">Request Management</p>
          <h1>Kelola Permintaan Produk.</h1>
          <p className="muted">
            {userRole === 'sales'
              ? 'Buat permintaan produk baru dan pantau status responsnya.'
              : userRole === 'product'
                ? 'Lihat dan respons permintaan dari tim Sales.'
                : 'Pantau seluruh permintaan dan kelola alur kerja.'}
          </p>
        </div>
      </div>

      {userRole === 'sales' && !showForm && (
        <button className="submit-button" onClick={() => setShowForm(true)} style={{ marginBottom: '2rem' }}>
          <MessageCircle size={18} /> Buat Request Baru
        </button>
      )}

      {showForm && userRole === 'sales' && (
        <div className="settings-grid" style={{ marginBottom: '2rem' }}>
          <form className="create-user-panel" onSubmit={(e) => { e.preventDefault(); createRequest() }}>
            <div className="panel-heading">
              <div className="panel-icon">
                <MessageCircle size={18} />
              </div>
              <div>
                <h2>Buat Request Baru</h2>
                <p>Jelaskan kebutuhan produk atau spesifikasi yang Anda butuhkan</p>
              </div>
            </div>

            <label>
              Judul Request
              <input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="e.g. Kemasan Custom untuk Produk Baru"
                required
              />
            </label>

            <label>
              Deskripsi Detail
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Jelaskan kebutuhan, spesifikasi, atau pertanyaan detail Anda..."
                rows={5}
                required
              />
            </label>

            <div className="form-actions">
              <button className="submit-button" type="submit">
                <Send size={18} /> Kirim Request
              </button>
              <button className="cancel-button" type="button" onClick={() => setShowForm(false)}>
                Batal
              </button>
            </div>
          </form>
        </div>
      )}

      {selectedRequest && (
        <div className="settings-grid" style={{ marginBottom: '2rem' }}>
          <div className="create-user-panel">
            <div className="panel-heading" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2>{selectedRequest.title}</h2>
                <p style={{ color: '#666', fontSize: '12px' }}>
                  dari {selectedRequest.created_by_name} • {new Date(selectedRequest.created_at || '').toLocaleDateString('id-ID')}
                </p>
              </div>
              <button
                onClick={() => setSelectedRequest(null)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  color: '#666',
                }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '12px', background: '#f5f8fc', borderRadius: '6px', marginBottom: '16px' }}>
              <p style={{ margin: '0 0 8px 0', fontSize: '12px', fontWeight: 600, color: '#666' }}>Deskripsi:</p>
              <p style={{ margin: 0, fontSize: '13px', lineHeight: '1.5', color: '#333' }}>
                {selectedRequest.description}
              </p>
            </div>

            <div style={{ display: 'grid', gap: '8px', marginBottom: '16px' }}>
              <p style={{ margin: 0, fontSize: '12px', fontWeight: 600, color: '#666' }}>
                Percakapan
              </p>
              {messagesLoading ? (
                <p className="muted">Memuat percakapan...</p>
              ) : messages.length > 0 || selectedRequest.product_response ? (
                <>
                  {selectedRequest.product_response && (
                    <div style={{ padding: '10px 12px', borderRadius: '8px', background: '#e8f5e9', border: '1px solid #d4edda' }}>
                      <small style={{ display: 'block', color: '#2e7d32', fontSize: '10px', marginBottom: '4px' }}>Respons Product sebelumnya</small>
                      <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.5, color: '#1b5e20' }}>{selectedRequest.product_response}</p>
                    </div>
                  )}
                  {messages.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        padding: '10px 12px',
                        borderRadius: '8px',
                        background: item.sender_email === userEmail ? '#eaf3fd' : '#f5f8fc',
                        border: '1px solid #edf1f5',
                      }}
                    >
                      <small style={{ display: 'block', color: '#68798a', fontSize: '10px', marginBottom: '4px' }}>
                        {item.sender_name} ({item.sender_role}) • {new Date(item.created_at).toLocaleString('id-ID')}
                      </small>
                      <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.5, color: '#333' }}>{item.message}</p>
                    </div>
                  ))}
                </>
              ) : (
                <p className="muted">Belum ada respons.</p>
              )}
            </div>

            {(userRole === 'sales' || userRole === 'product' || userRole === 'admin' || userRole === 'super-admin') && (
              <>
                <label style={{ marginBottom: '12px' }}>
                  Tulis Respons
                  <textarea
                    value={responseText}
                    onChange={(e) => setResponseText(e.target.value)}
                    placeholder={userRole === 'sales' ? 'Tulis pertanyaan atau tanggapan lanjutan...' : 'Berikan respons, rekomendasi, atau spesifikasi produk...'}
                    rows={4}
                  />
                </label>

                <div className="form-actions">
                  <button
                    className="submit-button"
                    onClick={() => submitResponse(selectedRequest.id!)}
                    style={{ backgroundColor: '#00b894' }}
                  >
                    <Send size={16} /> Kirim Pesan
                  </button>
                  <button className="cancel-button" onClick={() => setSelectedRequest(null)}>
                    Tutup
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="settings-grid">
        <div className="users-panel">
          <div className="panel-heading">
            <div className="panel-icon">
              <MessageCircle size={18} />
            </div>
            <div>
              <h2>
                {userRole === 'sales' ? 'Request Saya' : 'Daftar Request'}
              </h2>
              <p>{requestList.length} permintaan</p>
            </div>
          </div>

          {requestList.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>
              <p>Belum ada request</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '7px' }}>
              {requestList.map((request) => {
                const statusColor = getStatusColor(request.status)
                return (
                  <div
                    key={request.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      border: '1px solid #edf1f5',
                      borderRadius: '6px',
                      padding: '12px',
                      backgroundColor: '#fff',
                      cursor: 'pointer',
                    }}
                    onClick={() => {
                      selectRequest(request)
                    }}
                  >
                    <div style={{ display: 'grid', gap: '3px', flex: 1 }}>
                      <strong style={{ fontSize: '12px', color: 'var(--ink)' }}>
                        {request.title}
                      </strong>
                      <small style={{ color: '#8a98a6', fontSize: '10px' }}>
                        {request.created_by_name} • {new Date(request.created_at || '').toLocaleDateString('id-ID')}
                      </small>
                      {request.product_response && (
                        <small style={{ color: '#2e7d32', fontSize: '10px', marginTop: '2px' }}>
                          Respons Product: {request.product_response}
                        </small>
                      )}
                    </div>

                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '5px 8px',
                        borderRadius: '12px',
                        fontSize: '9px',
                        fontWeight: 700,
                        backgroundColor: statusColor.bg,
                        color: statusColor.text,
                        textTransform: 'capitalize',
                      }}
                    >
                      {getStatusIcon(request.status)}
                      {request.status}
                    </span>

                    {(userRole === 'product' || userRole === 'admin' || userRole === 'super-admin') ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          selectRequest(request)
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          border: 0,
                          borderRadius: '5px',
                          padding: '6px 8px',
                          color: '#2868a9',
                          background: '#eaf3fd',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: 600,
                        }}
                      >
                        <MessageCircle size={14} /> Respons
                      </button>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          selectRequest(request)
                        }}
                        style={{
                          border: 0,
                          borderRadius: '5px',
                          padding: '6px 8px',
                          color: '#2868a9',
                          background: '#eaf3fd',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: 600,
                        }}
                      >
                        Lihat Detail
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
