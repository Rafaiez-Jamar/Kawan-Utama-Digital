import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent, DragEvent, FormEvent } from 'react'
import { CalendarDays, Download, Filter, LayoutGrid, Pencil, Plus, Search, Table2, Trash2, X } from 'lucide-react'
import * as XLSX from 'xlsx'
import './Funnel.css'
import logo from './assets/kawan-utama-digital.png'

type FunnelRole = 'sales' | 'product' | 'delivery' | 'tech' | 'admin' | 'super-admin'
type FunnelStatus = 'Prospek' | 'Pengajuan RAB' | 'Negosiasi' | 'Closing / WIN' | 'Lost'
type FunnelItem = { id: number; detail: string; qty: number; total: number; margin: number }
type FunnelProject = { id: number; customer: string; sales: string; closing: string; status: FunnelStatus; statusReason: string; items: FunnelItem[] }
type NewItem = { id: number; detail: string; qty: string; total: string; margin: string }

const statuses: FunnelStatus[] = ['Prospek', 'Pengajuan RAB', 'Negosiasi', 'Closing / WIN', 'Lost']
const initialProjects: FunnelProject[] = [
  { id: 1, customer: 'Diskominfo', sales: 'RINA', closing: '2026-09-30', status: 'Pengajuan RAB', statusReason: '', items: [{ id: 1, detail: 'Sony FX30 Digital Cinema Camera', qty: 2, total: 68000000, margin: 12500000 }] },
  { id: 2, customer: 'Puskesmas Cipayung', sales: 'BUDI', closing: '2026-10-15', status: 'Negosiasi', statusReason: '', items: [{ id: 2, detail: 'SanDisk Extreme PRO 1TB', qty: 10, total: 18500000, margin: 3200000 }] },
  { id: 3, customer: 'Dinas Kesehatan Jakarta', sales: 'ANI', closing: '2026-09-25', status: 'Prospek', statusReason: '', items: [{ id: 3, detail: 'Video conference kit', qty: 1, total: 42000000, margin: 8000000 }] },
  { id: 4, customer: 'DPK BPJS', sales: 'RINA', closing: '2026-08-31', status: 'Closing / WIN', statusReason: '', items: [{ id: 4, detail: 'Professional lighting package', qty: 4, total: 31200000, margin: 6100000 }] },
]

const money = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value)
const projectValue = (project: FunnelProject) => project.items.reduce((sum, item) => sum + item.total, 0)
const projectMargin = (project: FunnelProject) => project.items.reduce((sum, item) => sum + item.margin, 0)

export function FunnelView({ userName, userRole }: { userName: string; userRole: FunnelRole }) {
  const [projects, setProjects] = useState<FunnelProject[]>(() => {
    try {
      const saved = localStorage.getItem('kawan-funnel-projects')
      return saved ? JSON.parse(saved) as FunnelProject[] : initialProjects
    } catch (error) {
      console.error('Failed to load funnel projects:', error)
      return initialProjects
    }
  })
  const [mode, setMode] = useState<'table' | 'kanban'>('table')
  const [search, setSearch] = useState('')
  const [salesFilter, setSalesFilter] = useState('All sales')
  const [statusFilter, setStatusFilter] = useState('All status')
  const [monthFilter, setMonthFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [draggedId, setDraggedId] = useState<number | null>(null)
  const [form, setForm] = useState({ sales: '', customer: '', closing: '', status: 'Prospek' as FunnelStatus, statusReason: '', items: [{ id: Date.now(), detail: '', qty: '1', total: '', margin: '' }] as NewItem[] })

  useEffect(() => {
    localStorage.setItem('kawan-funnel-projects', JSON.stringify(projects))
  }, [projects])

  const visibleProjects = useMemo(() => projects.filter((project) => {
    const ownProject = userRole === 'sales' ? project.sales.toLowerCase() === userName.split(' ')[0].toLowerCase() : true
    return ownProject &&
      (salesFilter === 'All sales' || project.sales === salesFilter) &&
      (statusFilter === 'All status' || project.status === statusFilter) &&
      (!monthFilter || project.closing.startsWith(monthFilter)) &&
      (!search || `${project.customer} ${project.sales} ${project.items.map((item) => item.detail).join(' ')}`.toLowerCase().includes(search.toLowerCase()))
  }), [projects, userName, userRole, salesFilter, statusFilter, monthFilter, search])

  const totalValue = visibleProjects.reduce((sum, project) => sum + projectValue(project), 0)
  const totalMargin = visibleProjects.reduce((sum, project) => sum + projectMargin(project), 0)
  const salesGroups = useMemo(() => {
    const groups = new Map<string, FunnelProject[]>()
    visibleProjects.forEach((project) => {
      const group = groups.get(project.sales) ?? []
      group.push(project)
      groups.set(project.sales, group)
    })
    return Array.from(groups.entries())
  }, [visibleProjects])

  function updateStatus(id: number, status: FunnelStatus) {
    setProjects((current) => current.map((project) => project.id === id ? { ...project, status } : project))
  }

  function openNewForm() {
    setEditingId(null)
    setForm({ sales: userName.split(' ')[0].toUpperCase(), customer: '', closing: '', status: 'Prospek', statusReason: '', items: [{ id: Date.now(), detail: '', qty: '1', total: '', margin: '' }] })
    setShowForm(true)
  }

  function openEditForm(project: FunnelProject) {
    setEditingId(project.id)
    setForm({ sales: project.sales, customer: project.customer, closing: project.closing, status: project.status, statusReason: project.statusReason ?? '', items: project.items.map((item) => ({ id: item.id, detail: item.detail, qty: String(item.qty), total: String(item.total), margin: String(item.margin) })) })
    setShowForm(true)
  }

  function deleteProject(id: number) {
    if (!window.confirm('Hapus project funnel ini?')) return
    setProjects((current) => current.filter((project) => project.id !== id))
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const project: FunnelProject = {
      id: editingId ?? Date.now(),
      customer: form.customer,
      sales: form.sales.trim().toUpperCase(),
      closing: form.closing,
      status: form.status,
      statusReason: form.statusReason.trim(),
      items: form.items.map((item) => ({ id: item.id, detail: item.detail, qty: Number(item.qty), total: Number(item.total), margin: Number(item.margin) })),
    }
    setProjects((current) => editingId === null ? [project, ...current] : current.map((currentProject) => currentProject.id === editingId ? { ...project, sales: currentProject.sales } : currentProject))
    setForm({ sales: userName.split(' ')[0].toUpperCase(), customer: '', closing: '', status: 'Prospek', statusReason: '', items: [{ id: Date.now(), detail: '', qty: '1', total: '', margin: '' }] })
    setEditingId(null)
    setShowForm(false)
  }

  function exportCsv() {
    const rows: string[][] = [['Sales', 'No', 'Customer Name', 'Detail Kebutuhan', 'QTY', 'Total', 'Est Margin', 'Timeline Closing', 'Status']]
    let projectIndex = 0
    salesGroups.forEach(([sales, projects]) => {
      projects.forEach((project) => {
        project.items.forEach((item, itemIndex) => rows.push([sales, itemIndex === 0 ? String(projectIndex + 1) : '', project.customer, item.detail, String(item.qty), String(item.total), String(item.margin), itemIndex === 0 ? project.closing : '', itemIndex === 0 ? project.status : '']))
        projectIndex += 1
      })
      const salesTotal = projects.reduce((sum, project) => sum + projectValue(project), 0)
      rows.push(['', '', '', 'TOTAL', '', String(salesTotal), '', '', ''])
    })
    rows.push(['', '', '', '', '', '', '', '', ''], ['', '', '', 'GRAND TOTAL', '', String(totalValue), '', '', ''])
    const csv = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(',')).join('\n')
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    link.download = 'project-funnel.csv'
    link.click()
    URL.revokeObjectURL(link.href)
  }

  function importExcel(event: ChangeEvent<HTMLInputElement>) {
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
          const normalized = row.map((value) => normalizeHeader(value))
          return normalized.some((value) => value.includes('customername') || value === 'customer') &&
            normalized.some((value) => value.includes('detailkebutuhan') || value === 'detail')
        })
        if (headerIndex < 0) {
          alert('Header Excel tidak ditemukan. Gunakan kolom Sales, Customer Name, Detail Kebutuhan, QTY, Total, Est Margin, Timeline Closing, dan Status.')
          return
        }
        const headers = rawRows[headerIndex].map((value, index) => normalizeHeader(value) || `column-${index}`)
        const rows = rawRows.slice(headerIndex + 1).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])))
        const imported: FunnelProject[] = []
        let currentProject: FunnelProject | null = null

        rows.forEach((row, index) => {
          const values = row
          const customer = String(values.customername || values.customer || '').trim() || currentProject?.customer || ''
          const sales = String(values.sales || '').trim().toUpperCase() || currentProject?.sales || 'UNKNOWN'
          const detail = String(values.detailkebutuhan || values.detail || values.namaproduk || '').trim()
          if (!customer && !detail) return
          const projectKey = `${sales}|${customer}`
          if (!currentProject || `${currentProject.sales}|${currentProject.customer}` !== projectKey) {
            currentProject = { id: Date.now() + index, customer: customer || 'Imported customer', sales, closing: parseImportedDate(values.timelineclosing || values.closing), status: normalizeStatus(values.status), statusReason: String(values.alasan || values.statusreason || values.reason || '').trim(), items: [] }
            imported.push(currentProject)
          }
          currentProject.items.push({ id: Date.now() + index, detail: detail || 'Imported item', qty: toNumber(values.qty), total: toNumber(values.total || values.totalhargajual), margin: toNumber(values.estmargin || values.margin || values.totalmargin) })
        })

        if (!imported.length) {
          alert('Tidak ada baris Funnel yang terbaca. Pastikan header Excel memakai Sales, Customer Name, Detail Kebutuhan, QTY, Total, Est Margin, Timeline Closing, dan Status.')
          return
        }
        setProjects((current) => [...imported, ...current])
        alert(`${imported.length} project berhasil diimpor ke Project Funnel.`)
      } catch (error) {
        console.error('Failed to import funnel Excel:', error)
        alert('File Excel tidak dapat dibaca. Pastikan formatnya .xlsx, .xls, atau .csv.')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  function toNumber(value: unknown) {
    if (typeof value === 'number') return value
    return Number(String(value ?? '').replace(/[^\d-]/g, '')) || 0
  }

  function normalizeHeader(value: unknown) {
    return String(value ?? '').toLowerCase().trim().replace(/[^a-z0-9]/g, '')
  }

  function parseImportedDate(value: unknown) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10)
    const parsed = new Date(String(value ?? ''))
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10)
  }

  function normalizeStatus(value: unknown): FunnelStatus {
    const status = String(value ?? '').trim().toLowerCase()
    return statuses.find((item) => item.toLowerCase() === status) ?? 'Prospek'
  }

  function handleDrop(event: DragEvent<HTMLDivElement>, status: FunnelStatus) {
    event.preventDefault()
    if (draggedId !== null) updateStatus(draggedId, status)
    setDraggedId(null)
  }

  return <section className="funnel-view dashboard-content">
    <div className="print-brand"><img src={logo} alt="Kawan Utama Digital" /></div>
    <div className="funnel-heading"><div><p className="eyebrow">Project Funnel</p><h1>Turn opportunities into wins.</h1><p className="muted">Track customer projects, item requirements, and estimated margin in one place.</p></div><button className="submit-button funnel-add" onClick={openNewForm}><Plus size={17} /> New project</button></div>
    <div className="funnel-summary"><div><span>Total project value</span><strong>{money(totalValue)}</strong><small>{visibleProjects.length} visible projects</small></div><div><span>Total estimated margin</span><strong className="margin-value">{money(totalMargin)}</strong><small>Based on current filters</small></div><div className="funnel-view-toggle"><button className={mode === 'table' ? 'active' : ''} onClick={() => setMode('table')}><Table2 size={16} /> Table view</button><button className={mode === 'kanban' ? 'active' : ''} onClick={() => setMode('kanban')}><LayoutGrid size={16} /> Kanban</button></div></div>
    <div className="funnel-toolbar"><label className="funnel-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search customer or item..." /></label><label><span>Sales</span><select value={salesFilter} onChange={(event) => setSalesFilter(event.target.value)}><option>All sales</option>{['RINA', 'BUDI', 'ANI'].map((sales) => <option key={sales}>{sales}</option>)}</select></label><label><span>Status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>All status</option>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label><label><span>Closing month</span><input type="month" value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)} /></label><label className="import-button"><span>Import Excel</span><input type="file" accept=".xlsx,.xls,.csv" onChange={importExcel} /></label><button className="export-button" onClick={exportCsv}><Download size={15} /> Export Excel</button><button className="export-button" onClick={() => window.print()}>PDF</button></div>
    {mode === 'table' ? <div className="funnel-table-wrap"><table className="funnel-table"><thead><tr><th>Sales</th><th>No</th><th>Customer Name</th><th>Detail Kebutuhan</th><th>QTY</th><th>Total</th><th>Est Margin</th><th>Timeline Closing</th><th>Status</th><th /></tr></thead><tbody>    {salesGroups.flatMap(([sales, projects]) => [...projects.flatMap((project) => project.items.map((item, index) => <tr key={`${project.id}-${item.id}`}><td>{index === 0 && <strong className="sales-cell">{project.sales}</strong>}</td>    <td>{index === 0 && visibleProjects.findIndex((visibleProject) => visibleProject.id === project.id) + 1}</td><td>{index === 0 && <div className="project-cell"><strong>{project.customer}</strong></div>}</td><td>{item.detail}</td><td>{item.qty}</td><td>{money(item.total)}</td><td className="margin-cell">{money(item.margin)}</td><td>{index === 0 && <span className="date-cell"><CalendarDays size={14} />{new Date(`${project.closing}T00:00:00`).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}</span>}</td><td>{index === 0 && <div className="status-cell"><span className={`status-select status-${project.status.toLowerCase().replaceAll(' ', '-')}`}>{project.status}</span>{project.statusReason && <small className="status-reason">{project.statusReason}</small>}</div>}</td><td>{index === 0 && <span className="row-actions"><button className="row-edit" title="Edit project" onClick={() => openEditForm(project)}><Pencil size={14} /></button><button className="row-delete" title="Delete project" onClick={() => deleteProject(project.id)}><Trash2 size={15} /></button></span>}</td></tr>)), <tr className="sales-subtotal-row" key={`subtotal-${sales}`}><td colSpan={5}>SUBTOTAL {sales}</td><td>{money(projects.reduce((sum, project) => sum + projectValue(project), 0))}</td><td colSpan={4}></td></tr>])}<tr className="sales-grand-total-row"><td colSpan={5}>TOTAL</td><td>{money(totalValue)}</td><td colSpan={4}></td></tr></tbody></table>{visibleProjects.length === 0 && <div className="funnel-empty"><Filter size={20} /><strong>No projects match these filters.</strong><span>Try changing the search or filter selection.</span></div>}<div className="funnel-totals"><div><span>Total Project Value</span><strong>{money(totalValue)}</strong></div><div><span>Total Est Margin</span><strong className="margin-value">{money(totalMargin)}</strong></div></div></div> : <div className="kanban-board">{statuses.map((status) => <div className="kanban-column" key={status} onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop(event, status)}><div className="kanban-column-heading"><strong>{status}</strong><span>{visibleProjects.filter((project) => project.status === status).length}</span></div>{visibleProjects.filter((project) => project.status === status).map((project) => <article className="kanban-card" draggable onDragStart={() => setDraggedId(project.id)} key={project.id}><div className="kanban-card-top"><span>{project.sales}</span><span className="kanban-card-actions"><button title="Edit project" onClick={() => openEditForm(project)}><Pencil size={14} /></button><button title="Delete project" onClick={() => deleteProject(project.id)}><Trash2 size={14} /></button></span></div><h3>{project.customer}</h3><p>{project.items[0].detail}{project.items.length > 1 ? ` +${project.items.length - 1} items` : ''}</p><div><strong>{money(projectValue(project))}</strong><span>{money(projectMargin(project))} margin</span></div></article>)}</div>)}</div>}
    {showForm && <div className="modal-backdrop" onMouseDown={() => setShowForm(false)}><form className="funnel-form" onSubmit={handleSubmit} onMouseDown={(event) => event.stopPropagation()}><div className="form-modal-heading"><div><p className="eyebrow">{editingId ? 'Edit project funnel' : 'New project funnel'}</p><h2>{editingId ? 'Edit customer opportunity' : 'Add a customer opportunity'}</h2></div><button type="button" onClick={() => setShowForm(false)} aria-label="Close"><X size={18} /></button></div><div className="funnel-form-grid"><label>Sales name<input value={form.sales} onChange={(event) => setForm({ ...form, sales: event.target.value })} placeholder="Nama sales" required /></label><label>Customer name<input value={form.customer} onChange={(event) => setForm({ ...form, customer: event.target.value })} placeholder="Ketik nama customer" required /></label><label>Timeline closing<input type="date" value={form.closing} onChange={(event) => setForm({ ...form, closing: event.target.value })} required /></label><label>Status<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as FunnelStatus })}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label></div><label className="funnel-status-reason">Alasan / catatan status<textarea value={form.statusReason} onChange={(event) => setForm({ ...form, statusReason: event.target.value })} placeholder="Contoh: menunggu validasi harga, spesifikasi, atau konfirmasi customer" rows={3} /></label><div className="item-entry-list">{form.items.map((item, index) => <div className="item-entry" key={item.id}><strong>Item {index + 1}</strong><label>Detail kebutuhan<input value={item.detail} onChange={(event) => setForm({ ...form, items: form.items.map((current) => current.id === item.id ? { ...current, detail: event.target.value } : current) })} placeholder="e.g. Sony FX30 Digital Cinema Camera" required /></label><label>QTY<input type="number" min="1" value={item.qty} onChange={(event) => setForm({ ...form, items: form.items.map((current) => current.id === item.id ? { ...current, qty: event.target.value } : current) })} required /></label><label>Total<input type="number" min="0" value={item.total} onChange={(event) => setForm({ ...form, items: form.items.map((current) => current.id === item.id ? { ...current, total: event.target.value } : current) })} placeholder="0" required /></label><label>Est margin<input type="number" min="0" value={item.margin} onChange={(event) => setForm({ ...form, items: form.items.map((current) => current.id === item.id ? { ...current, margin: event.target.value } : current) })} placeholder="0" required /></label>{form.items.length > 1 && <button type="button" className="item-remove" onClick={() => setForm({ ...form, items: form.items.filter((current) => current.id !== item.id) })}><Trash2 size={14} /> Remove</button>}</div>)}<button type="button" className="add-item-button" onClick={() => setForm({ ...form, items: [...form.items, { id: Date.now(), detail: '', qty: '1', total: '', margin: '' }] })}><Plus size={14} /> Tambah Barang</button></div><div className="funnel-form-total"><span>Project starts in <strong>{form.status}</strong></span><span>Value <strong>{money(form.items.reduce((sum, item) => sum + Number(item.total || 0), 0))}</strong></span></div><button className="submit-button" type="submit">{editingId ? 'Save changes' : 'Save project'} <Plus size={16} /></button></form></div>}
  </section>
}
