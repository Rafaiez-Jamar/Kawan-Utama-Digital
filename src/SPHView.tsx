import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowRight, Check, Download, FilePlus2, Filter, FileText, PackageCheck, ShieldCheck, X } from 'lucide-react'
import './App.css'
import { loadWorkspaceRows, saveWorkspaceRow } from './lib/workspaceData'
import { storageKey as deliveryStorageKey } from './lib/deliveryData'
import type { DeliveryItem, DeliveryStatus } from './lib/deliveryData'
import { FormattedNumberInput } from './lib/FormattedNumberInput'

type SPHRole = 'sales' | 'product' | 'admin' | 'super-admin'
type SPHStatus = 'Pending' | 'WIN' | 'LOSE'
type SPHItem = { id: string; product: string; description: string; quantity: number; unitPrice: number }
type SPH = { id: string; number: string; customer: string; company: string; owner: string; ownerEmail?: string; requestId?: string; role: string; items: SPHItem[]; discount: number; paymentTerms: string; technicalNotes: string; status: SPHStatus; createdAt: string; wonAt?: string; reviewNote: string }

type SPHViewProps = { userName: string; userEmail: string; userRole: SPHRole }

const statusLabels: SPHStatus[] = ['Pending', 'WIN', 'LOSE']
const statusClass: Record<SPHStatus, string> = { Pending: 'sph-pending', WIN: 'sph-win', LOSE: 'sph-loss' }
const roleNames: Record<SPHRole, string> = { sales: 'Sales', product: 'Product', admin: 'Admin', 'super-admin': 'Super Admin' }

function formatCurrency(value: number) { return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value) }
function totalOf(sph: SPH) { return sph.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0) * (1 - sph.discount / 100) }
function normalizeStatus(status: unknown): SPHStatus {
  if (status === 'WIN') return 'WIN'
  if (status === 'LOSE' || status === 'LOSS') return 'LOSE'
  return 'Pending'
}
function normalizeSph(sph: SPH): SPH {
  return { ...sph, status: normalizeStatus(sph.status) }
}
function initials(name: string) { return name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase() }
function escapeHtml(value: string) { return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character) }
function matchPriceRequest(customer: string, company: string, product: string) {
  try {
    const workspace = JSON.parse(localStorage.getItem('kawan-product-workspace') ?? '{}') as { requests?: Array<{ id: string; customerName: string; partnership: string; productName: string }> }
    const normalize = (value: string) => value.trim().toLocaleLowerCase('id')
    return workspace.requests?.find((request) => normalize(request.customerName) === normalize(customer) && normalize(request.partnership) === normalize(company) && normalize(request.productName) === normalize(product))?.id
  } catch {
    return undefined
  }
}

export function SPHView({ userName, userEmail, userRole }: SPHViewProps) {
  const [sphList, setSphList] = useState<SPH[]>(() => {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem('kawan-sph') ?? 'null')
      return Array.isArray(parsed) ? parsed as SPH[] : []
    } catch {
      return []
    }
  })
  const [workspaceReady, setWorkspaceReady] = useState(false)
  const [syncError, setSyncError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filter, setFilter] = useState<'All' | SPHStatus>('All')
  const [customer, setCustomer] = useState(userName)
  const [company, setCompany] = useState('')
  const [draftItems, setDraftItems] = useState<SPHItem[]>([{ id: crypto.randomUUID(), product: '', description: '', quantity: 1, unitPrice: 0 }])
  const [discount, setDiscount] = useState(0)
  const [paymentTerms, setPaymentTerms] = useState('50% DP, pelunasan setelah instalasi')

  useEffect(() => {
    let active = true
    void loadWorkspaceRows(['sph']).then((rows) => {
      if (!active) return
      const remote = rows.map((row) => normalizeSph(row.payload as SPH))
      let local: SPH[] = []
      try {
        const parsed: unknown = JSON.parse(localStorage.getItem('kawan-sph') ?? '[]')
        if (Array.isArray(parsed)) local = (parsed as SPH[]).filter((item) => item.id !== 'sph-001').map(normalizeSph)
      } catch (error) {
        console.error('Data SPH lokal tidak dapat dibaca:', error)
      }
      const remoteIds = new Set(remote.map((item) => item.id))
      const allowedLocal = local.filter((item) => userRole !== 'sales' || item.ownerEmail?.toLowerCase() === userEmail.toLowerCase() || item.owner === userName)
      setSphList([...remote, ...allowedLocal.filter((item) => !remoteIds.has(item.id))])
      setWorkspaceReady(true)
    }).catch((error: unknown) => {
      if (!active) return
      const message = error instanceof Error ? error.message : 'Kesalahan tidak diketahui.'
      console.error('Gagal memuat SPH dari database lokal:', error)
      setSyncError(`Gagal memuat SPH dari database: ${message}`)
    })
    return () => { active = false }
  }, [userEmail, userName, userRole])

  useEffect(() => {
    try {
      localStorage.setItem('kawan-sph', JSON.stringify(sphList))
    } catch (error) {
      console.error('Gagal menyimpan SPH lokal:', error)
      setSyncError('SPH gagal disimpan di browser. Periksa ruang penyimpanan.')
    }
  }, [sphList])

  useEffect(() => {
    if (!workspaceReady) return
    let active = true
    const rows = sphList
      .filter((item) => item.id !== 'sph-001' && (userRole !== 'sales' || item.ownerEmail?.toLowerCase() === userEmail.toLowerCase() || item.owner === userName))
      .map((item) => ({
        module: 'sph' as const,
        record_id: item.id,
        owner_email: item.ownerEmail ?? (item.owner === userName ? userEmail : null),
        target_team: null,
        payload: { ...item, ownerEmail: item.ownerEmail ?? (item.owner === userName ? userEmail : undefined) },
      }))
    void Promise.all(rows.map(saveWorkspaceRow)).then(() => {
      if (active) setSyncError('')
    }).catch((error: unknown) => {
      if (!active) return
      const message = error instanceof Error ? error.message : 'Kesalahan tidak diketahui.'
      console.error('Gagal menyimpan SPH ke database lokal:', error)
      setSyncError(`Gagal menyinkronkan SPH: ${message}`)
    })
    return () => { active = false }
  }, [sphList, userEmail, userName, userRole, workspaceReady])

  const visibleList = useMemo(() => sphList.filter((item) => (filter === 'All' || item.status === filter) && (userRole !== 'sales' || item.ownerEmail?.toLowerCase() === userEmail.toLowerCase() || item.owner === userName)), [filter, sphList, userEmail, userName, userRole])
  const selected = sphList.find((item) => item.id === selectedId) ?? null
  const canSetOutcome = userRole === 'sales' || userRole === 'admin' || userRole === 'super-admin'
  const counts = { total: sphList.length, pending: sphList.filter((item) => item.status === 'Pending').length, won: sphList.filter((item) => item.status === 'WIN').length, lost: sphList.filter((item) => item.status === 'LOSE').length }

  function updateTrackingStatus(requestId: string | undefined, status: DeliveryStatus, message: string) {
    if (!requestId) return
    try {
      const orders = JSON.parse(localStorage.getItem(deliveryStorageKey) ?? '[]') as DeliveryItem[]
      const updated = orders.map((item) => item.sourceRequestId === requestId ? { ...item, status, updatedAt: new Date().toISOString(), timeline: [...(item.timeline ?? []), { team: userRole === 'product' ? 'Product' as const : userRole === 'sales' ? 'Sales' as const : 'Admin' as const, person: userName, message, at: new Date().toISOString() }] } : item)
      localStorage.setItem(deliveryStorageKey, JSON.stringify(updated))
      void Promise.all(updated.filter((item) => item.sourceRequestId === requestId).map((item) => saveWorkspaceRow({ module: 'delivery', record_id: item.id, owner_email: item.ownerEmail ?? userEmail, target_team: null, payload: item }))).catch((error: unknown) => setSyncError(error instanceof Error ? error.message : 'Tracking gagal diperbarui.'))
    } catch (error) {
      console.error('Gagal memperbarui tracking SPH:', error)
      setSyncError('SPH tersimpan, tetapi tracking gagal diperbarui.')
    }
  }

  function createDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draftItems.length || draftItems.some((item) => !item.product.trim() || item.quantity < 1 || item.unitPrice < 0)) return
    const next: SPH = { id: `sph-${crypto.randomUUID()}`, number: 'DRAFT', customer, company, owner: userName, ownerEmail: userEmail, requestId: matchPriceRequest(customer, company, draftItems[0].product), role: userRole, items: draftItems.map((item) => ({ ...item, description: item.description || 'Detail spesifikasi dari Sales' })), discount, paymentTerms, technicalNotes: '', status: 'Pending', createdAt: new Date().toISOString().slice(0, 10), reviewNote: '' }
    setSphList((current) => [next, ...current]); setSelectedId(next.id); setShowForm(false); setCustomer(userName); setCompany(''); setDraftItems([{ id: crypto.randomUUID(), product: '', description: '', quantity: 1, unitPrice: 0 }]); setDiscount(0)
    updateTrackingStatus(next.requestId, 'Proses Penawaran', 'Sales mulai menyiapkan penawaran SPH.')
  }

  function moveStatus(id: string, status: SPHStatus) {
    setSphList((current) => current.map((item) => {
      if (item.id !== id || item.status === 'WIN') return item
      const wonAt = status === 'WIN'
        ? new Date().toISOString()
        : undefined
      return { ...item, status, wonAt }
    }))
  }

  function printSPH(sph: SPH) {
    const printWindow = window.open('', '_blank', 'width=900,height=700')
    if (!printWindow) {
      window.alert('Izinkan pop-up browser untuk mencetak atau menyimpan SPH sebagai PDF.')
      return
    }
    const number = escapeHtml(sph.number)
    const company = escapeHtml(sph.company)
    const customer = escapeHtml(sph.customer)
    const paymentTerms = escapeHtml(sph.paymentTerms)
    const items = sph.items.map((item) => `<tr><td>${escapeHtml(item.product)}</td><td>${escapeHtml(item.description)}</td><td>${item.quantity}</td><td>${formatCurrency(item.unitPrice)}</td><td>${formatCurrency(item.quantity * item.unitPrice)}</td></tr>`).join('')
    printWindow.document.write(`<!doctype html><html lang="id"><head><meta charset="utf-8"><title>${number} - ${company}</title><style>*{box-sizing:border-box}body{font:14px Arial,sans-serif;color:#202c3d;padding:48px;max-width:900px;margin:0 auto}header{border-bottom:3px solid #173a63;padding-bottom:20px;display:flex;justify-content:space-between;color:#173a63}h1{font-size:24px;margin:34px 0 5px}h2{font-size:15px;color:#173a63;margin-top:28px}table{width:100%;border-collapse:collapse;margin-top:14px}th,td{text-align:left;padding:11px;border-bottom:1px solid #dfe7f0;vertical-align:top}th{background:#f0f6fd;color:#173a63}.total{text-align:right;font-size:17px;font-weight:bold;margin-top:22px}.terms{line-height:1.6;color:#536579}.sign{margin-top:70px;text-align:right}.print-hint{margin-top:30px;color:#8996a3;font-size:11px}@media print{body{padding:0}.print-hint{display:none}}</style></head><body><header><strong>KAWAN UTAMA DIGITAL</strong><span>${number}</span></header><h1>Surat Penawaran Harga</h1><p>Kepada: <strong>${customer}</strong><br/>${company}</p><table><thead><tr><th>Produk</th><th>Deskripsi</th><th>Qty</th><th>Harga satuan</th><th>Total</th></tr></thead><tbody>${items}</tbody></table><p class="total">Total penawaran: ${formatCurrency(totalOf(sph))}</p><h2>Syarat & Ketentuan</h2><p class="terms">Diskon: ${sph.discount}%<br/>Skema pembayaran: ${paymentTerms}<br/>Harga berlaku sesuai masa penawaran dan ketersediaan produk.</p><div class="sign">Hormat kami,<br/><br/><br/><strong>Admin Kawan Utama Digital</strong></div><p class="print-hint">Pilih “Save as PDF” pada dialog cetak untuk menyimpan dokumen ini.</p></body></html>`)
    printWindow.document.close()
    printWindow.focus()
    printWindow.print()
  }

  return (
    <section className="sph-view dashboard-content">
      <div className="settings-header"><div><p className="eyebrow">Sales quotation workflow</p><h1>Kelola penawaran harga.</h1><p className="muted">Buat SPH, lalu tandai hasil penawaran sebagai pending, win, atau lose.</p></div><span className="access-note"><ShieldCheck size={17} /><span><strong>{roleNames[userRole]} access</strong><small>{userRole === 'sales' ? 'Buat SPH & pantau hasil' : 'Pantau dan kelola hasil SPH'}</small></span></span></div>
      {syncError && <p className="delivery-storage-warning" role="alert">{syncError} Data lokal tetap ada di perangkat ini.</p>}
      {!workspaceReady && <p className="muted" role="status">Memuat SPH dari database...</p>}
      <div className="sph-summary"><div><span>Total SPH</span><strong>{counts.total}</strong><small>Semua penawaran</small></div><div><span>Pending</span><strong>{counts.pending}</strong><small>Menunggu keputusan</small></div><div><span>WIN</span><strong>{counts.won}</strong><small>Menambah progress Sales</small></div><div><span>LOSE</span><strong>{counts.lost}</strong><small>Penawaran tidak berhasil</small></div></div>
      <div className="sph-toolbar"><div className="sph-filters"><Filter size={15} /><button className={filter === 'All' ? 'active' : ''} onClick={() => setFilter('All')}>Semua</button>{statusLabels.map((item) => <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>{item}</button>)}</div>{userRole === 'sales' || userRole === 'super-admin' ? <button className="submit-button sph-new-button" onClick={() => { setCustomer(userName); setShowForm(true) }}><FilePlus2 size={16} /> Buat SPH baru</button> : null}</div>
      <div className="sph-layout"><div className="sph-list">{visibleList.length ? visibleList.map((item) => <div className={`sph-row ${selectedId === item.id ? 'selected' : ''}`} key={item.id}><button className="sph-row-select" type="button" onClick={() => setSelectedId(item.id)}><span className="sph-avatar"><FileText size={17} /></span><span className="sph-row-main"><strong>{item.company}</strong><small>{item.number} · {item.owner}</small></span><span className="sph-row-value"><strong>{formatCurrency(totalOf(item))}</strong><small>{item.createdAt}</small></span><span className={`sph-status ${statusClass[item.status]}`}>{item.status}</span><ArrowRight size={16} /></button>{canSetOutcome && (item.status === 'Pending' ? <div className="sph-row-actions" aria-label={`Ubah status SPH ${item.company}`}><button type="button" className="sph-outcome-button win" title="Tandai WIN" onClick={() => moveStatus(item.id, 'WIN')}><Check size={14} /> WIN</button><button type="button" className="sph-outcome-button lose" title="Tandai LOSE" onClick={() => moveStatus(item.id, 'LOSE')}><X size={14} /> LOSE</button></div> : <span className={`sph-outcome-label ${item.status === 'WIN' ? 'win' : 'lose'}`}>{item.status}</span>)}</div>) : <div className="sph-empty"><FileText size={22} /><strong>Belum ada SPH</strong><small>Pengajuan yang sesuai filter akan muncul di sini.</small></div>}</div><div className="sph-detail">{selected ? <SPHDetail sph={selected} onPrint={printSPH} /> : <div className="sph-detail-empty"><PackageCheck size={25} /><h2>Pilih SPH untuk melihat detail</h2><p>Pilih SPH untuk melihat rincian produk dan mengubah hasil penawaran.</p></div>}</div></div>
      {showForm && <div className="modal-backdrop"><form className="sph-form" onSubmit={createDraft}>
        <div className="modal-heading"><div><p className="eyebrow">SPH baru</p><h2>Buat Surat Penawaran Harga</h2></div><button type="button" className="icon-button" onClick={() => setShowForm(false)} aria-label="Tutup"><X size={19} /></button></div>
        <div className="sph-form-grid"><label>PIC<input value={customer} onChange={(event) => setCustomer(event.target.value)} required placeholder="Nama PIC" /></label><label>Customer<input value={company} onChange={(event) => setCompany(event.target.value)} required placeholder="Nama customer" /></label>
          <div className="full-width">{draftItems.map((item, index) => <fieldset className="product-rab-item" key={item.id}><div className="product-rab-item-heading"><strong>Produk {index + 1}</strong>{draftItems.length > 1 && <button type="button" className="table-action subtle" onClick={() => setDraftItems((current) => current.filter((entry) => entry.id !== item.id))}><X size={14} /> Hapus</button>}</div><div className="sph-form-grid"><label>Nama produk<input required value={item.product} onChange={(event) => setDraftItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, product: event.target.value } : entry))} /></label><label>Jumlah<input type="number" min="1" value={item.quantity} onChange={(event) => setDraftItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, quantity: Number(event.target.value) } : entry))} required /></label><label>Harga satuan<FormattedNumberInput min={0} value={item.unitPrice} onChange={(unitPrice) => setDraftItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, unitPrice } : entry))} required /></label></div></fieldset>)}<button className="secondary-button product-rab-add" type="button" onClick={() => setDraftItems((current) => [...current, { id: crypto.randomUUID(), product: '', description: '', quantity: 1, unitPrice: 0 }])}><FilePlus2 size={15} /> Tambah produk</button></div>
          <label>Diskon (%)<input type="number" min="0" max="100" value={discount} onChange={(event) => setDiscount(Number(event.target.value))} /></label><label className="full-width">Skema pembayaran<textarea value={paymentTerms} onChange={(event) => setPaymentTerms(event.target.value)} rows={3} /></label>
        </div>
        <div className="sph-form-total"><span>Estimasi nilai penawaran</span><strong>{formatCurrency(draftItems.reduce((total, item) => total + item.quantity * item.unitPrice, 0) * (1 - discount / 100))}</strong></div><button className="submit-button" type="submit">Simpan SPH <ArrowRight size={17} /></button>
      </form></div>}
    </section>
  )
}

function SPHDetail({ sph, onPrint }: { sph: SPH; onPrint: (sph: SPH) => void }) {
  return <div><div className="sph-detail-head"><div><p className="eyebrow">{sph.number}</p><h2>{sph.company}</h2><p>{sph.customer} · Dibuat oleh {sph.owner}</p></div><span className={`sph-status ${statusClass[sph.status]}`}>{sph.status}</span></div><div className="sph-detail-section"><h3><FileText size={16} /> Rincian penawaran</h3><div className="sph-customer-line"><span className="sph-avatar">{initials(sph.customer)}</span><span><strong>{sph.customer}</strong><small>{sph.company}</small></span></div>{sph.items.map((item) => <div className="sph-item" key={item.product}><span><strong>{item.product}</strong><small>{item.description}</small></span><span>{item.quantity} × {formatCurrency(item.unitPrice)}</span></div>)}<div className="sph-total-line"><span>Diskon {sph.discount}%</span><strong>{formatCurrency(totalOf(sph))}</strong></div></div><div className="sph-detail-section"><h3><FileText size={16} /> Catatan & ketentuan</h3><p className="sph-note">{sph.technicalNotes || 'Tidak ada catatan teknis.'}</p><p className="sph-note"><strong>Pembayaran:</strong> {sph.paymentTerms}</p></div><button className="submit-button" onClick={() => onPrint(sph)}><Download size={16} /> Cetak / unduh PDF</button></div>
}
