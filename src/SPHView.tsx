import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { ArrowRight, Check, Download, FilePlus2, Filter, FileText, MessageSquare, PackageCheck, Send, ShieldCheck, X } from 'lucide-react'
import * as XLSX from 'xlsx'
import './App.css'

type SPHRole = 'sales' | 'product' | 'delivery' | 'tech' | 'admin' | 'super-admin'
type SPHStatus = 'Draft' | 'Pending Product' | 'Pending Approval' | 'Approved' | 'Sent to Customer' | 'WIN' | 'LOSS' | 'Revision Required'
type SPHItem = { id: string; product: string; description: string; quantity: number; unitPrice: number; salesPrice?: number; costPrice?: number; margin?: number; marginPercent?: number; indent?: string; link?: string; distributor?: string }
type SPH = { id: string; number: string; customer: string; company: string; owner: string; role: string; items: SPHItem[]; discount: number; paymentTerms: string; technicalNotes: string; status: SPHStatus; createdAt: string; reviewNote: string }

type SPHViewProps = { userName: string; userRole: SPHRole }

const statusLabels: SPHStatus[] = ['Draft', 'Pending Product', 'Pending Approval', 'Approved', 'Sent to Customer', 'WIN', 'LOSS', 'Revision Required']
const statusClass: Record<SPHStatus, string> = { Draft: 'sph-draft', 'Pending Product': 'sph-pending', 'Pending Approval': 'sph-pending', Approved: 'sph-approved', 'Sent to Customer': 'sph-sent', WIN: 'sph-win', LOSS: 'sph-loss', 'Revision Required': 'sph-revision' }
const roleNames: Record<SPHRole, string> = { sales: 'Sales', product: 'Product', delivery: 'Delivery', tech: 'Tech', admin: 'Admin', 'super-admin': 'Super Admin' }
const seedSPH: SPH[] = [{ id: 'sph-001', number: 'SPH/2026/08/014', customer: 'Budi Santoso', company: 'PT Nusantara Energi', owner: 'Andi Wijaya', role: 'sales', items: [{ id: 'item-001', product: 'Panel Surya 550Wp', description: 'Panel monocrystalline untuk kebutuhan industri', quantity: 40, unitPrice: 2850000 }], discount: 5, paymentTerms: '50% DP, pelunasan setelah instalasi', technicalNotes: 'Garansi produk 12 tahun.', status: 'Pending Approval', createdAt: '2026-08-28', reviewNote: '' }]
 const emptyItem = (id: string): SPHItem => ({ id, product: '', description: '', quantity: 1, unitPrice: 0, salesPrice: 0, costPrice: 0, indent: '', link: '', distributor: '' })

function formatCurrency(value: number) { return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value) }
function totalOf(sph: SPH) { return sph.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0) * (1 - sph.discount / 100) }
function initials(name: string) { return name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase() }

export function SPHView({ userName, userRole }: SPHViewProps) {
  const [offerTab, setOfferTab] = useState<'rab' | 'sph'>('rab')
  const [sphList, setSphList] = useState<SPH[]>(() => { try { return JSON.parse(localStorage.getItem('kawan-sph') ?? 'null') ?? seedSPH } catch { return seedSPH } })
  const [rabList, setRabList] = useState<SPH[]>(() => { try { return JSON.parse(localStorage.getItem('kawan-rab') ?? 'null') ?? [] } catch { return [] } })
  const [showForm, setShowForm] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filter, setFilter] = useState<'All' | SPHStatus>('All')
  const [customer, setCustomer] = useState('')
  const [company, setCompany] = useState('')
  const [draftItems, setDraftItems] = useState<SPHItem[]>([emptyItem('draft-item-1')])
  const [discount, setDiscount] = useState(0)
  const [paymentTerms, setPaymentTerms] = useState('50% DP, pelunasan setelah instalasi')

  useEffect(() => { localStorage.setItem('kawan-sph', JSON.stringify(sphList)) }, [sphList])
  useEffect(() => { localStorage.setItem('kawan-rab', JSON.stringify(rabList)) }, [rabList])

  const sourceList = offerTab === 'rab' ? rabList : sphList
  const visibleList = useMemo(() => sourceList.filter((item) => (filter === 'All' || item.status === filter) && (userRole !== 'sales' || item.owner === userName || item.owner === 'Andi Wijaya')), [filter, sourceList, userName, userRole])
  const selected = sourceList.find((item) => item.id === selectedId) ?? null
  const canReview = userRole === 'product' || userRole === 'admin' || userRole === 'super-admin'
  const canApprove = userRole === 'admin' || userRole === 'super-admin'
  const canManageDocuments = userRole === 'admin' || userRole === 'super-admin' || userRole === 'sales'
  const counts = { total: sourceList.length, pending: sourceList.filter((item) => item.status === 'Pending Approval' || item.status === 'Pending Product').length, approved: sourceList.filter((item) => item.status === 'Approved' || item.status === 'Sent to Customer' || item.status === 'WIN').length, value: sourceList.reduce((sum, item) => sum + totalOf(item), 0) }

  useEffect(() => {
    const emptyTitle = document.querySelector<HTMLElement>('.sph-empty strong')
    const detailTitle = document.querySelector<HTMLElement>('.sph-detail-empty h2')
    const documentLabel = offerTab === 'rab' ? 'RAB B2B' : 'SPH'
    if (emptyTitle) emptyTitle.textContent = `Belum ada ${documentLabel}`
    if (detailTitle) detailTitle.textContent = `Pilih ${documentLabel} untuk melihat detail`
  }, [offerTab, visibleList.length])

  function createDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (draftItems.some((item) => !item.product.trim() || item.quantity < 1)) return
    const next: SPH = { id: `sph-${Date.now()}`, number: 'DRAFT', customer, company, owner: userName, role: userRole, items: draftItems.map((item, index) => ({ ...item, id: `item-${Date.now()}-${index}`, description: item.description || (offerTab === 'rab' ? 'RAB B2B' : 'Detail spesifikasi dari Sales'), unitPrice: offerTab === 'rab' ? item.salesPrice ?? 0 : item.unitPrice })), discount, paymentTerms, technicalNotes: '', status: 'Draft', createdAt: new Date().toISOString().slice(0, 10), reviewNote: '' }
    if (offerTab === 'rab') setRabList((current) => [next, ...current])
    else setSphList((current) => [next, ...current])
    setSelectedId(next.id); setShowForm(false); setCustomer(''); setCompany(''); setDraftItems([emptyItem(`draft-item-${Date.now()}`)]); setDiscount(0)
  }

  function updateActiveList(updater: (current: SPH[]) => SPH[]) {
    if (offerTab === 'rab') setRabList(updater)
    else setSphList(updater)
  }

  function moveStatus(id: string, status: SPHStatus, reviewNote = '') { updateActiveList((current) => current.map((item) => item.id === id ? { ...item, status, reviewNote } : item)) }
  function issueApproved(id: string) { updateActiveList((current) => current.map((item, index) => item.id === id ? { ...item, status: 'Approved', number: item.number === 'DRAFT' ? `SPH/2026/09/${String(15 + index).padStart(3, '0')}` : item.number } : item)) }

  function importRAB(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = (loadEvent) => {
      try {
        const workbook = XLSX.read(loadEvent.target?.result, { type: 'array', cellDates: true })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' })
        const headerIndex = rawRows.findIndex((row) => {
          const headers = row.map((value) => normalizeHeader(value))
          return headers.some((value) => value === 'namaproduk' || value === 'produk') &&
            headers.some((value) => value === 'unit' || value === 'qty' || value === 'quantity')
        })
        if (headerIndex < 0) {
          alert('Header RAB tidak ditemukan. Pastikan tabel memiliki kolom No, Nama Produk, Unit/Qty, Harga Jual, dan Harga Modal.')
          return
        }
        const headers = rawRows[headerIndex].map((value, index) => normalizeHeader(value) || `column${index}`)
        const rows = rawRows.slice(headerIndex + 1).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])))
        const imported = rows.flatMap((row, index) => {
          const values = row
          const product = String(values.namaproduk || values.produk || values.detailkebutuhan || '').trim()
          if (!product) return []
          const quantity = toNumber(values.unit || values.qty || values.quantity || values.jumlah) || 1
          const salesPrice = toNumber(values.hargajual || values.hargasatuan) || (toNumber(values.totalhargajual) / quantity)
          const costPrice = toNumber(values.hargamodal || values.modal) || (toNumber(values.totalhargamodal) / quantity)
          const margin = toNumber(values.margin) || salesPrice - costPrice
          const marginPercent = Number(String(values.persentasemargin || '').replace(',', '.').replace('%', '')) || (salesPrice ? (margin / salesPrice) * 100 : 0)
          return [{ id: `rab-${Date.now()}-${index}`, number: 'RAB-IMPORT', customer: String(values.customer || values.customername || 'Imported customer'), company: String(values.company || values.perusahaan || 'B2B'), owner: userName, role: userRole, items: [{ id: `rab-item-${Date.now()}-${index}`, product, description: '', quantity, unitPrice: salesPrice, salesPrice, costPrice, margin, marginPercent, indent: String(values.indent || ''), link: String(values.link || ''), distributor: String(values.disti || values.distributor || '') }], discount: 0, paymentTerms: 'Sesuai hasil kalkulasi RAB B2B', technicalNotes: '', status: 'Draft' as SPHStatus, createdAt: new Date().toISOString().slice(0, 10), reviewNote: '' }]
        })
        if (!imported.length) {
          alert('Tidak ada produk RAB yang terbaca. Pastikan file memiliki kolom Nama Produk, Qty, dan Harga Jual.')
          return
        }
        setRabList((current) => [...imported, ...current])
        alert(`${imported.length} item RAB berhasil diimpor.`)
      } catch (error) {
        console.error('Failed to import RAB:', error)
        alert('File RAB tidak dapat dibaca. Gunakan format .xlsx, .xls, atau .csv.')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  function normalizeHeader(value: unknown) { return String(value ?? '').toLowerCase().trim().replace(/[^a-z0-9]/g, '') }
  function toNumber(value: unknown) { return typeof value === 'number' ? value : Number(String(value ?? '').replace(/[^\d-]/g, '')) || 0 }

  function printSPH(sph: SPH) {
    const printWindow = window.open('', '_blank', 'width=900,height=700')
    if (!printWindow) return
    printWindow.document.write(`<html><head><title>${sph.number} - ${sph.company}</title><style>body{font:14px Arial;color:#202c3d;padding:48px;max-width:800px;margin:auto}header{border-bottom:3px solid #173a63;padding-bottom:20px;display:flex;justify-content:space-between}h1{font-size:24px;margin:34px 0 5px}h2{font-size:15px;color:#173a63;margin-top:28px}table{width:100%;border-collapse:collapse;margin-top:14px}th,td{text-align:left;padding:11px;border-bottom:1px solid #dfe7f0}th{background:#f0f6fd}.total{text-align:right;font-size:17px;font-weight:bold;margin-top:22px}.terms{line-height:1.6;color:#536579}.sign{margin-top:70px;text-align:right}</style></head><body><header><strong>KAWAN UTAMA DIGITAL</strong><span>${sph.number}</span></header><h1>Surat Penawaran Harga</h1><p>Kepada: <strong>${sph.customer}</strong><br/>${sph.company}</p><table><thead><tr><th>Produk</th><th>Deskripsi</th><th>Qty</th><th>Harga</th><th>Total</th></tr></thead><tbody>${sph.items.map((item) => `<tr><td>${item.product}</td><td>${item.description}</td><td>${item.quantity}</td><td>${formatCurrency(item.unitPrice)}</td><td>${formatCurrency(item.quantity * item.unitPrice)}</td></tr>`).join('')}</tbody></table><p class="total">Total penawaran: ${formatCurrency(totalOf(sph))}</p><h2>Syarat & Ketentuan</h2><p class="terms">Diskon: ${sph.discount}%<br/>Skema pembayaran: ${sph.paymentTerms}<br/>Harga berlaku sesuai masa penawaran dan ketersediaan produk.</p><div class="sign">Hormat kami,<br/><br/><br/><strong>Admin Kawan Utama Digital</strong></div></body></html>`)
    printWindow.document.close(); printWindow.focus(); printWindow.print()
  }

  function rabRows(projects: SPH[]) {
    let number = 0
    return projects.flatMap((project) => project.items.map((item) => {
      const salesPrice = item.salesPrice ?? item.unitPrice
      const costPrice = item.costPrice ?? 0
      const margin = item.margin ?? salesPrice - costPrice
      return {
        No: ++number,
        'Nama Produk': item.product,
        Unit: item.quantity,
        'Include PPN - Harga Jual': salesPrice,
        'Include PPN - Total Harga Jual': salesPrice * item.quantity,
        'Include PPN - Harga Modal': costPrice,
        'Include PPN - Total Harga Modal': costPrice * item.quantity,
        'Exclude PPN - Harga Jual': salesPrice / 1.11,
        'Exclude PPN - Total Harga Jual': (salesPrice / 1.11) * item.quantity,
        'Exclude PPN - Harga Modal': costPrice / 1.11,
        'Exclude PPN - Total Harga Modal': (costPrice / 1.11) * item.quantity,
        Margin: margin,
        'Total Margin': margin * item.quantity,
        'Persentase Margin': item.marginPercent ?? (salesPrice ? (margin / salesPrice) * 100 : 0),
        Indent: item.indent ?? '',
        Link: item.link ?? '',
        Disti: item.distributor ?? '',
      }
    }))
  }

  function exportRABExcel() {
    const rows = rabRows(visibleList)
    if (!rows.length) {
      alert('Belum ada data RAB untuk diekspor.')
      return
    }
    const worksheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'RAB B2B')
    XLSX.writeFile(workbook, `RAB-B2B-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  function exportRABPdf() {
    const rows = rabRows(visibleList)
    if (!rows.length) {
      alert('Belum ada data RAB untuk diekspor.')
      return
    }
    const printWindow = window.open('', '_blank', 'width=1200,height=800')
    if (!printWindow) return
    const numericHeaders = new Set(['Unit', 'Include PPN - Harga Jual', 'Include PPN - Total Harga Jual', 'Include PPN - Harga Modal', 'Include PPN - Total Harga Modal', 'Exclude PPN - Harga Jual', 'Exclude PPN - Total Harga Jual', 'Exclude PPN - Harga Modal', 'Exclude PPN - Total Harga Modal', 'Margin', 'Total Margin'])
    const formatNumber = (value: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(value)
    const formatCell = (header: string, value: string | number) => numericHeaders.has(header) ? formatNumber(Number(value)) : header === 'Persentase Margin' && value !== '' ? `${(Number(value) <= 1 ? Number(value) * 100 : Number(value)).toFixed(2).replace('.', ',')}%` : String(value ?? '')
    const body = rows.map((row) => `<tr>${['No', 'Nama Produk', 'Unit', 'Include PPN - Harga Jual', 'Include PPN - Total Harga Jual', 'Include PPN - Harga Modal', 'Include PPN - Total Harga Modal', 'Exclude PPN - Harga Jual', 'Exclude PPN - Total Harga Jual', 'Exclude PPN - Harga Modal', 'Exclude PPN - Total Harga Modal', 'Margin', 'Total Margin', 'Persentase Margin', 'Indent', 'Link', 'Disti'].map((header) => `<td>${header === 'Link' && row[header] ? `<a href="${row[header]}">-</a>` : formatCell(header, row[header])}</td>`).join('')}</tr>`).join('')
    const totals = rows.reduce<Record<string, number>>((result, row) => {
      numericHeaders.forEach((header) => { result[header] = (result[header] ?? 0) + Number(row[header] ?? 0) })
      return result
    }, {})
    totals['Persentase Margin'] = totals['Include PPN - Total Harga Jual'] ? (totals['Total Margin'] / totals['Include PPN - Total Harga Jual']) * 100 : 0
    const totalBody = `<tr class="total-row">${['No', 'Nama Produk', 'Unit', 'Include PPN - Harga Jual', 'Include PPN - Total Harga Jual', 'Include PPN - Harga Modal', 'Include PPN - Total Harga Modal', 'Exclude PPN - Harga Jual', 'Exclude PPN - Total Harga Jual', 'Exclude PPN - Harga Modal', 'Exclude PPN - Total Harga Modal', 'Margin', 'Total Margin', 'Persentase Margin', 'Indent', 'Link', 'Disti'].map((header) => `<td>${header === 'No' ? 'TOTAL' : numericHeaders.has(header) || header === 'Persentase Margin' ? formatCell(header, totals[header] ?? '') : ''}</td>`).join('')}</tr>`
    const groupedHeader = `<tr><th rowspan="2">No</th><th rowspan="2">Nama Produk</th><th rowspan="2">Unit</th><th colspan="4" class="include">Include PPN</th><th colspan="4" class="exclude">Exclude PPN</th><th rowspan="2">Margin</th><th rowspan="2">Total Margin</th><th rowspan="2">Persentase<br/>Margin</th><th rowspan="2">Indent</th><th rowspan="2">Link</th><th rowspan="2">Disti</th></tr><tr><th class="include">Harga Jual</th><th class="include">Total Harga Jual</th><th class="include modal">Harga Modal</th><th class="include modal">Total Harga Modal</th><th class="exclude">Harga Jual</th><th class="exclude">Total Harga Jual</th><th class="exclude modal">Modal</th><th class="exclude modal">Total Harga Modal</th></tr>`
    printWindow.document.write(`<html><head><title>RAB B2B</title><style>@page{size:landscape;margin:6mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:8px;color:#202c3d;margin:0}h1{font-size:14px;color:#173a63;margin:0 0 7px}table{width:100%;border-collapse:collapse;table-layout:fixed}tr{page-break-inside:avoid}th,td{border:1px solid #69737b;padding:3px 2px;font-size:8px;font-weight:400;white-space:nowrap;line-height:1.1;overflow:hidden;vertical-align:middle}th{background:#f3f3f3;font-size:8px;font-weight:700;text-align:center;height:24px;white-space:normal;overflow:visible}.include{background:#b8e2e6}.exclude,.modal{background:#ffe59a}td{text-align:right;height:27px}td:nth-child(1){text-align:center}td:nth-child(2){text-align:left;white-space:normal;overflow-wrap:anywhere}td:nth-child(3){text-align:center}td:nth-child(14){text-align:center}td:nth-child(15),td:nth-child(17){text-align:left;white-space:normal;overflow-wrap:anywhere}td:nth-child(16){text-align:center}.total-row{font-weight:bold;background:#fff4c7}.total-row td{height:29px;font-weight:700;white-space:nowrap}a{color:#2868a9;text-decoration:none}</style></head><body><h1>RAB B2B - Kawan Utama Digital</h1><table><colgroup><col style="width:3%"/><col style="width:16%"/><col style="width:3%"/><col style="width:6%"/><col style="width:6%"/><col style="width:6%"/><col style="width:6%"/><col style="width:6%"/><col style="width:6%"/><col style="width:6%"/><col style="width:6%"/><col style="width:6%"/><col style="width:6%"/><col style="width:5%"/><col style="width:6%"/><col style="width:3%"/><col style="width:4%"/></colgroup><thead>${groupedHeader}</thead><tbody>${body}${totalBody}</tbody></table><script>window.onload=function(){window.print()}</script></body></html>`)
    printWindow.document.close()
  }

  return <section className="sph-view dashboard-content"><div className="settings-header"><div><p className="eyebrow">Penawaran B2B</p><h1>{offerTab === 'rab' ? 'Kelola RAB B2B.' : 'Kelola SPH.'}</h1><p className="muted">{offerTab === 'rab' ? 'Susun kalkulasi produk, modal, dan margin sebelum penawaran diterbitkan.' : 'Buat, verifikasi, dan terbitkan dokumen penawaran harga untuk customer.'}</p></div><span className="access-note"><ShieldCheck size={17} /><span><strong>{roleNames[userRole]} access</strong><small>{userRole === 'sales' ? 'Draft & pantau pengajuan' : 'Review, edit, dan kelola penawaran'}</small></span></span></div><div className="offer-tabs"><button className={offerTab === 'rab' ? 'active' : ''} onClick={() => setOfferTab('rab')}>RAB B2B</button><button className={offerTab === 'sph' ? 'active' : ''} onClick={() => setOfferTab('sph')}>SPH</button></div><div className="sph-summary"><div><span>{offerTab === 'rab' ? 'Total RAB B2B' : 'Total SPH'}</span><strong>{counts.total}</strong><small>{offerTab === 'rab' ? 'Semua kalkulasi RAB' : 'Semua dokumen SPH'}</small></div><div><span>Perlu tindakan</span><strong>{counts.pending}</strong><small>Dalam antrean review</small></div><div><span>Approved</span><strong>{counts.approved}</strong><small>Siap diterbitkan</small></div><div><span>Nilai pipeline</span><strong>{formatCurrency(counts.value)}</strong><small>Nilai penawaran</small></div></div><div className="sph-toolbar">  <div className="sph-filters"><Filter size={15} />{['All', ...statusLabels].map((item) => <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item as 'All' | SPHStatus)}>{item === 'All' ? 'Semua' : item}</button>)}</div>{canManageDocuments &&     <div className="offer-actions">{offerTab === 'rab' && <><button type="button" className="rab-export-action" onClick={exportRABExcel}><Download size={16} /> Export Excel</button><button type="button" className="rab-export-action" onClick={exportRABPdf}><FileText size={16} /> Export PDF</button><label className="submit-button import-rab-button rab-import-action"><Download size={16} /> <span><strong>Import RAB Excel</strong><small>.xlsx, .xls, atau .csv</small></span><input type="file" accept=".xlsx,.xls,.csv" onChange={(event: ChangeEvent<HTMLInputElement>) => importRAB(event)} /></label></>}<button className="submit-button sph-new-button rab-create-action" onClick={() => setShowForm(true)}><FilePlus2 size={17} /> <span><strong>{offerTab === 'rab' ? 'Buat RAB Baru' : 'Buat SPH baru'}</strong><small>Isi langsung di aplikasi</small></span></button></div>}  </div>{offerTab === 'rab' ? <RABTable projects={visibleList} onSelect={setSelectedId} /> : <div className="sph-layout"><div className="sph-list">{visibleList.length ? visibleList.map((item) => <button className={`sph-row ${selectedId === item.id ? 'selected' : ''}`} key={item.id} onClick={() => setSelectedId(item.id)}><span className="sph-avatar"><FileText size={17} /></span><span className="sph-row-main"><strong>{item.company}</strong><small>{item.number} · {item.owner}</small></span><span className="sph-row-value"><strong>{formatCurrency(totalOf(item))}</strong><small>{item.createdAt}</small></span><span className={`sph-status ${statusClass[item.status]}`}>{item.status}</span><ArrowRight size={16} /></button>) : <div className="sph-empty"><FileText size={22} /><strong>Belum ada SPH</strong><small>Pengajuan yang sesuai filter akan muncul di sini.</small></div>}</div><div className="sph-detail">{selected ?   <SPHDetail sph={selected} canReview={canReview} canApprove={canApprove} onStatus={moveStatus} onApprove={issueApproved} onPrint={printSPH} documentName={offerTab === 'rab' ? 'RAB B2B' : 'SPH'} /> : <div className="sph-detail-empty"><PackageCheck size={25} /><h2>Pilih SPH untuk melihat detail</h2><p>Review rincian produk, approval, dan dokumen resmi dari panel ini.</p></div>}</div>  </div>}{showForm && <div className="modal-backdrop"><form className="sph-form" onSubmit={createDraft}><div className="modal-heading"><div><p className="eyebrow">Draft baru</p>  <h2>{offerTab === 'rab' ? 'Buat RAB B2B' : 'Buat Surat Penawaran Harga'}</h2></div><button type="button" className="icon-button" onClick={() => setShowForm(false)} aria-label="Tutup"><X size={19} /></button></div><div className="sph-form-grid"><label>Nama pelanggan<input value={customer} onChange={(event) => setCustomer(event.target.value)} required placeholder="Contoh: Budi Santoso" /></label><label>Perusahaan<input value={company} onChange={(event) => setCompany(event.target.value)} required placeholder="Contoh: PT Nusantara Energi" /></label>  <div className="sph-items-editor full-width"><div className="sph-items-editor-heading"><strong>Daftar barang</strong>  <button type="button" className="add-item-button" onClick={() => setDraftItems((items) => [...items, emptyItem(`draft-item-${Date.now()}`)])}><FilePlus2 size={14} /> Tambah Barang</button></div>{draftItems.map((item, index) => <div className="sph-item-editor" key={item.id}><span className="sph-item-number">{index + 1}</span><input value={item.product} onChange={(event) => setDraftItems((items) => items.map((current) => current.id === item.id ? { ...current, product: event.target.value } : current))} required placeholder="Nama produk" /><input value={item.description} onChange={(event) => setDraftItems((items) => items.map((current) => current.id === item.id ? { ...current, description: event.target.value } : current))} placeholder="Deskripsi / spesifikasi" /><input type="number" min="1" value={item.quantity} onChange={(event) => setDraftItems((items) => items.map((current) => current.id === item.id ? { ...current, quantity: Number(event.target.value) } : current))} required />  <input type="number" min="0" value={offerTab === 'rab' ? item.salesPrice ?? 0 : item.unitPrice} onChange={(event) => setDraftItems((items) => items.map((current) => current.id === item.id ? { ...current, unitPrice: Number(event.target.value), salesPrice: offerTab === 'rab' ? Number(event.target.value) : current.salesPrice } : current))} required placeholder={offerTab === 'rab' ? 'Harga jual incl. PPN' : 'Harga satuan'} />{offerTab === 'rab' && <div className="rab-item-fields"><label>Harga modal incl. PPN<input type="number" min="0" value={item.costPrice ?? 0} onChange={(event) => setDraftItems((items) => items.map((current) => current.id === item.id ? { ...current, costPrice: Number(event.target.value) } : current))} /></label><label>Margin<input type="number" min="0" value={item.margin ?? ((item.salesPrice ?? 0) - (item.costPrice ?? 0))} onChange={(event) => setDraftItems((items) => items.map((current) => current.id === item.id ? { ...current, margin: Number(event.target.value) } : current))} /></label><label>Margin %<input type="number" min="0" step="0.01" value={item.marginPercent ?? 0} onChange={(event) => setDraftItems((items) => items.map((current) => current.id === item.id ? { ...current, marginPercent: Number(event.target.value) } : current))} /></label><label>Indent<input value={item.indent ?? ''} onChange={(event) => setDraftItems((items) => items.map((current) => current.id === item.id ? { ...current, indent: event.target.value } : current))} /></label><label>Link<input type="url" value={item.link ?? ''} onChange={(event) => setDraftItems((items) => items.map((current) => current.id === item.id ? { ...current, link: event.target.value } : current))} /></label><label>Disti<input value={item.distributor ?? ''} onChange={(event) => setDraftItems((items) => items.map((current) => current.id === item.id ? { ...current, distributor: event.target.value } : current))} /></label><small>Exclude PPN otomatis: jual {formatCurrency((item.salesPrice ?? 0) / 1.11)} · modal {formatCurrency((item.costPrice ?? 0) / 1.11)}</small></div>}{draftItems.length > 1 && <button type="button" className="item-remove" onClick={() => setDraftItems((items) => items.filter((current) => current.id !== item.id))}><X size={14} /></button>}</div>)}</div><label>Diskon (%)<input type="number" min="0" max="100" value={discount} onChange={(event) => setDiscount(Number(event.target.value))} /></label><label className="full-width">Skema pembayaran<textarea value={paymentTerms} onChange={(event) => setPaymentTerms(event.target.value)} rows={3} /></label></div><div className="sph-form-total"><span>Estimasi nilai penawaran</span>  <strong>{formatCurrency(draftItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0) * (1 - discount / 100))}</strong></div><button className="submit-button" type="submit">Simpan draft <ArrowRight size={17} /></button></form></div>}</section>
}

function RABTable({ projects, onSelect }: { projects: SPH[]; onSelect: (id: string) => void }) {
  const rows = projects.flatMap((project) => project.items.map((item) => ({ project, item })))
  return <div className="rab-table-wrap"><table className="rab-table"><thead><tr><th>No</th><th>Nama Produk</th><th>Unit</th><th colSpan={2}>Include PPN<br />Harga Jual / Total</th><th colSpan={2}>Include PPN<br />Harga Modal / Total</th><th colSpan={2}>Exclude PPN<br />Harga Jual / Total</th><th colSpan={2}>Exclude PPN<br />Modal / Total</th><th>Margin</th><th>Total Margin</th><th>Persentase Margin</th><th>Indent</th><th>Link</th><th>Disti</th></tr></thead><tbody>{rows.map(({ project, item }, index) => <tr key={`${project.id}-${item.id}`} onClick={() => onSelect(project.id)}><td>{index + 1}</td><td>{item.product}</td><td>{item.quantity}</td><td>{formatCurrency(item.salesPrice ?? item.unitPrice)}</td><td>{formatCurrency((item.salesPrice ?? item.unitPrice) * item.quantity)}</td><td>{formatCurrency(item.costPrice ?? 0)}</td><td>{formatCurrency((item.costPrice ?? 0) * item.quantity)}</td><td>{formatCurrency((item.salesPrice ?? item.unitPrice) / 1.11)}</td><td>{formatCurrency(((item.salesPrice ?? item.unitPrice) / 1.11) * item.quantity)}</td><td>{formatCurrency((item.costPrice ?? 0) / 1.11)}</td><td>{formatCurrency(((item.costPrice ?? 0) / 1.11) * item.quantity)}</td><td>{formatCurrency(item.margin ?? ((item.salesPrice ?? item.unitPrice) - (item.costPrice ?? 0)))}</td><td>{formatCurrency((item.margin ?? ((item.salesPrice ?? item.unitPrice) - (item.costPrice ?? 0))) * item.quantity)}</td><td>{item.marginPercent ? `${item.marginPercent}%` : '-'}</td><td>{item.indent || '-'}</td><td>{item.link ? <a href={item.link} target="_blank" rel="noreferrer">Link</a> : '-'}</td><td>{item.distributor || '-'}</td></tr>)}</tbody><tfoot><tr><td colSpan={2}>Total</td><td>{rows.reduce((sum, row) => sum + row.item.quantity, 0)}</td><td colSpan={2}>{formatCurrency(rows.reduce((sum, row) => sum + (row.item.salesPrice ?? row.item.unitPrice) * row.item.quantity, 0))}</td><td colSpan={2}>{formatCurrency(rows.reduce((sum, row) => sum + (row.item.costPrice ?? 0) * row.item.quantity, 0))}</td><td colSpan={11}>Total margin: {formatCurrency(rows.reduce((sum, row) => sum + (row.item.margin ?? 0) * row.item.quantity, 0))}</td></tr></tfoot></table>{!rows.length && <div className="sph-empty"><FileText size={22} /><strong>Belum ada RAB B2B</strong><small>Import Excel atau buat RAB baru untuk mulai.</small></div>}</div>
}

function SPHDetail({ sph, canReview, canApprove, onStatus, onApprove, onPrint, documentName }: { sph: SPH; canReview: boolean; canApprove: boolean; onStatus: (id: string, status: SPHStatus, note?: string) => void; onApprove: (id: string) => void; onPrint: (sph: SPH) => void; documentName: string }) {
  const [note, setNote] = useState(sph.reviewNote)
  return <div><div className="sph-detail-head"><div><p className="eyebrow">{documentName} · {sph.number}</p><h2>{sph.company}</h2><p>{sph.customer} · Dibuat oleh {sph.owner}</p></div><span className={`sph-status ${statusClass[sph.status]}`}>{sph.status}</span></div><div className="sph-detail-section"><h3><FileText size={16} /> Rincian penawaran</h3><div className="sph-customer-line"><span className="sph-avatar">{initials(sph.customer)}</span><span><strong>{sph.customer}</strong><small>{sph.company}</small></span></div>{sph.items.map((item) => <div className="sph-item" key={item.product}><span><strong>{item.product}</strong><small>{item.description}</small></span><span>{item.quantity} × {formatCurrency(item.unitPrice)}</span></div>)}<div className="sph-total-line"><span>Diskon {sph.discount}%</span><strong>{formatCurrency(totalOf(sph))}</strong></div></div><div className="sph-detail-section"><h3><MessageSquare size={16} /> Catatan & ketentuan</h3><p className="sph-note">{sph.technicalNotes || 'Belum ada catatan teknis dari Product.'}</p><p className="sph-note"><strong>Pembayaran:</strong> {sph.paymentTerms}</p></div>{canReview && (sph.status === 'Draft' || sph.status === 'Pending Product' || sph.status === 'Revision Required') && <div className="sph-review-box"><h3><PackageCheck size={16} /> Verifikasi Product</h3><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Tambahkan catatan spesifikasi, garansi, atau revisi..." rows={3} /><button className="capture-button" onClick={() => onStatus(sph.id, 'Pending Approval', note)}><Check size={16} /> Validasi & teruskan ke Admin</button></div>}{canApprove && (sph.status === 'Pending Approval' || sph.status === 'Revision Required') && <div className="sph-review-box approval"><h3><ShieldCheck size={16} /> Approval Admin</h3><p>Periksa margin, diskon, dan skema pembayaran sebelum menerbitkan nomor resmi.</p><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Catatan approval atau revisi..." rows={2} /><div className="sph-action-row"><button className="capture-button" onClick={() => onStatus(sph.id, 'Revision Required', note)}><MessageSquare size={16} /> Minta revisi</button><button className="submit-button" onClick={() => onApprove(sph.id)}><Check size={16} /> Approve & terbitkan</button></div></div>}{(sph.status === 'Approved' || sph.status === 'Sent to Customer' || sph.status === 'WIN' || sph.status === 'LOSS') && <div className="sph-action-row"><button className="submit-button" onClick={() => onPrint(sph)}><Download size={16} /> Cetak / unduh PDF</button>{sph.status === 'Approved' && <button className="capture-button" onClick={() => onStatus(sph.id, 'Sent to Customer')}><Send size={16} /> Kirim ke customer</button>}{sph.status === 'Sent to Customer' && <><button className="capture-button" onClick={() => onStatus(sph.id, 'WIN')}><Check size={16} /> Tandai WIN</button><button className="retake-button" onClick={() => onStatus(sph.id, 'LOSS')}><X size={16} /> Tandai LOSS</button></>}</div>}</div>
}
