import { useEffect, useMemo, useState } from 'react'
import { BriefcaseBusiness, CalendarDays, CircleAlert, Download, Plus, Trash2 } from 'lucide-react'
import { deleteWorkspaceRow, loadWorkspaceRows, saveWorkspaceRow } from './lib/workspaceData'
import { FormattedNumberInput } from './lib/FormattedNumberInput'
import './App.css'

const stages = ['Prospek', 'Qualified', 'Penawaran', 'Negosiasi', 'Won', 'Lost'] as const
type FunnelStage = (typeof stages)[number]
type Opportunity = {
  id: string
  ownerName: string
  ownerEmail: string
  prospect: string
  company: string
  stage: FunnelStage
  amount: number
  probability: number
  targetClose: string
  nextAction: string
  createdAt: string
}

const defaultProbability: Record<FunnelStage, number> = {
  Prospek: 10,
  Qualified: 25,
  Penawaran: 50,
  Negosiasi: 75,
  Won: 100,
  Lost: 0,
}
const prospectLossAfterDays = 14
const currency = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })
const isFunnelStage = (value: unknown): value is FunnelStage => stages.includes(value as FunnelStage)
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character)

function isOpportunity(value: unknown): value is Opportunity {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<Opportunity>
  return typeof item.id === 'string'
    && typeof item.ownerName === 'string'
    && typeof item.ownerEmail === 'string'
    && typeof item.prospect === 'string'
    && typeof item.company === 'string'
    && isFunnelStage(item.stage)
    && typeof item.amount === 'number'
    && typeof item.probability === 'number'
    && typeof item.targetClose === 'string'
    && typeof item.nextAction === 'string'
}

function readLocalOpportunities(storageKey: string) {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter(isOpportunity) : []
  } catch {
    return []
  }
}

function ageLabel(createdAt: string) {
  const created = new Date(createdAt)
  if (Number.isNaN(created.getTime())) return 'Tanggal belum tersedia'
  const days = Math.max(0, Math.floor((new Date().getTime() - created.getTime()) / 86400000))
  if (days === 0) return 'Hari ini'
  return `${days} hari`
}

function expireProspects(items: Opportunity[], now: number) {
  return items.map((item) => {
    const ageInDays = Math.floor((now - new Date(item.createdAt).getTime()) / 86400000)
    return item.stage === 'Prospek' && Number.isFinite(ageInDays) && ageInDays >= prospectLossAfterDays
      ? { ...item, stage: 'Lost' as FunnelStage, probability: defaultProbability.Lost }
      : item
  })
}

function shortDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Tanggal belum tersedia' : new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
}

export function SalesFunnelSheet({ ownerName, ownerEmail, weeklyView = false, readOnly = false }: { ownerName: string; ownerEmail: string; weeklyView?: boolean; readOnly?: boolean }) {
  const storageKey = `kawan-sales-funnel-${ownerEmail.toLowerCase()}`
  const [opportunities, setOpportunities] = useState<Opportunity[]>(() => readLocalOpportunities(storageKey))
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [syncError, setSyncError] = useState('')

  useEffect(() => {
    const next = expireProspects(opportunities, Date.now())
    if (next.some((item, index) => item !== opportunities[index])) setOpportunities(next)
  }, [opportunities])

  useEffect(() => {
    const nextMidnight = new Date()
    nextMidnight.setHours(24, 0, 0, 0)
    const timer = window.setTimeout(() => {
      const next = expireProspects(opportunities, Date.now())
      if (next.some((item, index) => item !== opportunities[index])) setOpportunities(next)
    }, nextMidnight.getTime() - Date.now() + 1000)
    return () => window.clearTimeout(timer)
  }, [opportunities])

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(opportunities))
    } catch (error) {
      console.error('Gagal menyimpan Sales Funnel di browser:', error)
      setSyncError('Penyimpanan lokal penuh; perubahan mungkin belum tersimpan.')
    }
  }, [opportunities, storageKey])

  const openOpportunities = useMemo(() => opportunities.filter((item) => item.stage !== 'Won' && item.stage !== 'Lost'), [opportunities])
  const pipelineValue = openOpportunities.reduce((total, item) => total + item.amount, 0)
  const weightedForecast = openOpportunities.reduce((total, item) => total + item.amount * item.probability / 100, 0)
  const wonValue = opportunities.filter((item) => item.stage === 'Won').reduce((total, item) => total + item.amount, 0)
  const stageCounts = stages.map((stage) => ({ stage, count: opportunities.filter((item) => item.stage === stage).length }))
  const weekStart = new Date()
  weekStart.setHours(0, 0, 0, 0)
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7))
  const nextWeekStart = new Date(weekStart)
  nextWeekStart.setDate(nextWeekStart.getDate() + 7)
  const weeklyOpportunities = opportunities.filter((item) => {
    const createdAt = new Date(item.createdAt).getTime()
    return Number.isFinite(createdAt) && createdAt >= weekStart.getTime() && createdAt < nextWeekStart.getTime()
  })
  const weeklyOpenValue = weeklyOpportunities.filter((item) => item.stage !== 'Won' && item.stage !== 'Lost').reduce((total, item) => total + item.amount, 0)
  const weeklyWonValue = weeklyOpportunities.filter((item) => item.stage === 'Won').reduce((total, item) => total + item.amount, 0)
  const weekLabel = `${shortDate(weekStart.toISOString())} - ${shortDate(new Date(nextWeekStart.getTime() - 86400000).toISOString())}`

  useEffect(() => {
    let active = true
    void loadWorkspaceRows(['funnel']).then((rows) => {
      if (!active) return
      const remote = rows
        .filter((row) => row.module === 'funnel' && row.owner_email?.toLowerCase() === ownerEmail.toLowerCase())
        .map((row) => row.payload)
        .filter(isOpportunity)
      const local = readLocalOpportunities(storageKey)
      const remoteIds = new Set(remote.map((item) => item.id))
      const merged = [...remote, ...local.filter((item) => !remoteIds.has(item.id))]
      setOpportunities(merged)
      try {
        localStorage.setItem(storageKey, JSON.stringify(merged))
        setSyncError('')
      } catch (storageError) {
        console.error('Gagal menyimpan Sales Funnel di browser:', storageError)
        setSyncError('Penyimpanan browser penuh; data tetap dicoba simpan ke server lokal.')
      }
      setLoading(false)
      setReady(true)
    }).catch((error: unknown) => {
      if (!active) return
      console.error('Gagal memuat Sales Funnel:', error)
      setSyncError(`Data belum tersinkron ke server lokal: ${error instanceof Error ? error.message : 'kesalahan tidak diketahui'}`)
      setLoading(false)
      setReady(true)
    })
    return () => { active = false }
  }, [ownerEmail, storageKey])

  function commitOpportunities(next: Opportunity[]) {
    setOpportunities(next)
  }

  useEffect(() => {
    if (!ready) return
    const timer = window.setTimeout(() => {
      void Promise.all(opportunities.map((item) => saveWorkspaceRow({
        module: 'funnel',
        record_id: item.id,
        owner_email: ownerEmail,
        target_team: null,
        payload: item,
      }))).then(() => setSyncError('')).catch((error: unknown) => {
        console.error('Gagal menyinkronkan Sales Funnel:', error)
        setSyncError(`Gagal menyinkronkan ke server lokal: ${error instanceof Error ? error.message : 'kesalahan tidak diketahui'}`)
      })
    }, 500)
    return () => window.clearTimeout(timer)
  }, [opportunities, ownerEmail, ready])

  function addOpportunity() {
    const item: Opportunity = {
      id: `opportunity-${crypto.randomUUID()}`,
      ownerName,
      ownerEmail,
      prospect: ownerName,
      company: '',
      stage: 'Prospek',
      amount: 0,
      probability: defaultProbability.Prospek,
      targetClose: '',
      nextAction: '',
      createdAt: new Date().toISOString(),
    }
    commitOpportunities([item, ...opportunities])
  }

  function updateOpportunity<K extends keyof Opportunity>(id: string, key: K, value: Opportunity[K]) {
    commitOpportunities(opportunities.map((item) => item.id === id ? { ...item, [key]: value } : item))
  }

  function updateStage(id: string, stage: FunnelStage) {
    commitOpportunities(opportunities.map((item) => item.id === id ? { ...item, stage, probability: defaultProbability[stage] } : item))
  }

  async function removeOpportunity(id: string) {
    commitOpportunities(opportunities.filter((item) => item.id !== id))
    try {
      await deleteWorkspaceRow('funnel', id)
    } catch (error) {
      console.error('Gagal menghapus peluang funnel:', error)
      setSyncError(`Gagal menghapus dari database lokal: ${error instanceof Error ? error.message : 'kesalahan tidak diketahui'}`)
    }
  }

  function exportPDF() {
    const printWindow = window.open('', '_blank', 'width=1100,height=800')
    if (!printWindow) {
      window.alert('Izinkan pop-up browser untuk mencetak atau menyimpan Funnel sebagai PDF.')
      return
    }

    const rows = opportunities.map((item) => `<tr><td><strong>${escapeHtml(item.prospect || 'Belum diisi')}</strong><small>${escapeHtml(item.company || 'Customer belum diisi')}</small></td><td class="num">${currency.format(item.amount)}</td><td class="num">${item.probability}%</td><td class="num">${currency.format(item.amount * item.probability / 100)}</td><td>${escapeHtml(item.targetClose ? shortDate(item.targetClose) : 'Belum diatur')}</td><td>${escapeHtml(item.stage)}</td><td>${escapeHtml(ageLabel(item.createdAt))}<small>${escapeHtml(shortDate(item.createdAt))}</small></td><td>${escapeHtml(item.nextAction || 'Belum ada')}</td></tr>`).join('')
    const summary = weeklyView
      ? `<section class="summary"><div><span>Pekan berjalan</span><strong>${weekLabel}</strong></div><div><span>Opportunity baru</span><strong>${weeklyOpportunities.length}</strong></div><div><span>Nilai pipeline baru</span><strong>${currency.format(weeklyOpenValue)}</strong></div><div><span>Won pekan ini</span><strong>${currency.format(weeklyWonValue)}</strong></div></section>`
      : `<section class="summary"><div><span>Peluang aktif</span><strong>${openOpportunities.length}</strong></div><div><span>Nilai pipeline</span><strong>${currency.format(pipelineValue)}</strong></div><div><span>Forecast berbobot</span><strong>${currency.format(weightedForecast)}</strong></div><div><span>Nilai Won</span><strong>${currency.format(wonValue)}</strong></div></section>`
    const stageSummary = stageCounts.map(({ stage, count }) => `<span>${escapeHtml(stage)} <strong>${count}</strong></span>`).join('')
    const title = weeklyView ? 'Rekap Funnel Sales Pekan Ini' : 'Rekap Funnel Sales'
    const exportedAt = new Intl.DateTimeFormat('id-ID', { dateStyle: 'long', timeStyle: 'short' }).format(new Date())

    printWindow.document.write(`<!doctype html><html lang="id"><head><meta charset="utf-8"><title>${title} - ${escapeHtml(ownerName)}</title><style>
      *{box-sizing:border-box}body{margin:0;padding:28px;color:#202c3d;font:11px Arial,sans-serif}header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:14px;border-bottom:3px solid #173a63}header strong{color:#173a63;font-size:15px;letter-spacing:.6px}header span{color:#718096;font-size:10px}h1{margin:22px 0 5px;color:#173a63;font-size:22px}.sub{margin:0 0 18px;color:#718096}.summary{display:grid;grid-template-columns:repeat(4,1fr);margin-bottom:16px;border:1px solid #dfe7f0}.summary div{display:grid;gap:6px;padding:10px 12px;border-right:1px solid #dfe7f0}.summary div:last-child{border:0}.summary span{color:#718096;font-size:9px}.summary strong{color:#202c3d;font-size:13px}.stages{display:flex;flex-wrap:wrap;gap:7px;margin:0 0 14px}.stages span{padding:6px 8px;border:1px solid #dfe7f0;border-radius:4px;color:#536579;font-size:9px}.stages strong{margin-left:5px;color:#2868a9}table{width:100%;border-collapse:collapse}th,td{padding:8px 7px;border-bottom:1px solid #dfe7f0;text-align:left;vertical-align:top}th{color:#173a63;background:#f0f6fd;font-size:8px;text-transform:uppercase}td{font-size:9px}td strong,td small{display:block}td small{margin-top:4px;color:#718096;font-size:8px;line-height:1.35}.num{text-align:right;white-space:nowrap}.footer{margin-top:16px;color:#8796a6;font-size:8px}@media print{@page{size:A4 landscape;margin:12mm}body{padding:0}tr{break-inside:avoid}}
    </style></head><body><header><strong>KAWAN UTAMA DIGITAL · SALES</strong><span>${escapeHtml(ownerName)} · ${escapeHtml(ownerEmail)}</span></header><h1>${title}</h1><p class="sub">${weeklyView ? `Periode ${weekLabel}` : 'Seluruh opportunity funnel'} · Diekspor ${exportedAt}</p>${summary}<div class="stages">${stageSummary}</div><table><thead><tr><th>PIC / Customer</th><th class="num">Nilai potensi</th><th class="num">Probabilitas</th><th class="num">Forecast</th><th>Target closing</th><th>Tahap</th><th>Umur / dibuat</th><th>Tindak lanjut</th></tr></thead><tbody>${rows || '<tr><td colspan="8">Belum ada opportunity.</td></tr>'}</tbody></table><p class="footer">Prospek yang masih pada tahap Prospek otomatis menjadi Lost setelah 14 hari. Forecast per baris = nilai potensi × probabilitas.</p></body></html>`)
    printWindow.document.close()
    printWindow.focus()
    printWindow.print()
  }

  return (
    <section className={`sales-funnel-sheet ${readOnly ? 'sales-funnel-read-only' : ''}`}>
      <div className="sales-sheet-heading">
        <div>
          <p className="eyebrow">Sales pipeline</p>
          <h2>{weeklyView ? 'Funnel & rekap pekan ini' : 'Funnel penjualan saya'}</h2>
          <p>{weeklyView ? 'Ringkasan opportunity baru pekan ini; seluruh funnel tetap bisa diperbarui.' : readOnly ? 'Ringkasan opportunity dan forecast penjualan.' : 'Perbarui peluang, tahap, dan target closing. Forecast dihitung otomatis.'}</p>
        </div>
        <div className="sales-sheet-actions"><button className="secondary-button" type="button" onClick={exportPDF}><Download size={15} /> Ekspor PDF</button>{!readOnly && <button className="submit-button sales-sheet-add" type="button" onClick={addOpportunity}><Plus size={16} /> Tambah peluang</button>}</div>
      </div>

      {syncError && <p className="sales-sheet-error" role="alert"><CircleAlert size={14} />{syncError}</p>}

      {weeklyView && <section className="sales-sheet-weekly"><div><span><CalendarDays size={14} /> Pekan berjalan</span><strong>{weekLabel}</strong></div><article><span>Opportunity baru</span><strong>{weeklyOpportunities.length}</strong></article><article><span>Nilai pipeline baru</span><strong>{currency.format(weeklyOpenValue)}</strong></article><article><span>Won pekan ini</span><strong>{currency.format(weeklyWonValue)}</strong></article></section>}

      <div className="sales-sheet-metrics">
        <article><span>Peluang aktif</span><strong>{openOpportunities.length}</strong><small>Tidak termasuk Won / Lost</small></article>
        <article><span>Nilai pipeline</span><strong>{currency.format(pipelineValue)}</strong><small>Total peluang aktif</small></article>
        <article><span>Forecast berbobot</span><strong>{currency.format(weightedForecast)}</strong><small>Nilai × probabilitas tahap</small></article>
        <article><span>Nilai Won</span><strong>{currency.format(wonValue)}</strong><small>Akumulasi peluang berhasil</small></article>
      </div>

      <div className="sales-sheet-stage-strip" aria-label="Jumlah peluang per tahap">
        {stageCounts.map(({ stage, count }) => <div key={stage}><span>{stage}</span><strong>{count}</strong></div>)}
      </div>

      <div className="sales-sheet-table-wrap">
        <table className="sales-sheet-table">
          <thead><tr><th>PIC</th><th>Customer</th><th>Nilai potensi</th><th>Probabilitas</th><th>Forecast</th><th>Target closing</th><th>Tahap</th><th>Umur / dibuat</th><th>Tindak lanjut</th><th aria-label="Aksi" /></tr></thead>
          <tbody>
            {opportunities.map((item) => (
              <tr key={item.id}>
                <td><input aria-label="PIC" value={item.prospect} placeholder="Nama PIC" disabled={readOnly} onChange={(event) => updateOpportunity(item.id, 'prospect', event.target.value)} /></td>
                <td><input aria-label="Customer" value={item.company} placeholder="Nama customer" disabled={readOnly} onChange={(event) => updateOpportunity(item.id, 'company', event.target.value)} /></td>
                <td><FormattedNumberInput aria-label="Nilai potensi" className="sales-sheet-number" min={0} step={100000} value={item.amount} disabled={readOnly} onChange={(amount) => updateOpportunity(item.id, 'amount', Math.max(0, amount))} /></td>
                <td><div className="sales-sheet-probability"><input aria-label="Probabilitas" type="number" min="0" max="100" value={item.probability} disabled={readOnly} onChange={(event) => updateOpportunity(item.id, 'probability', Math.min(100, Math.max(0, Number(event.target.value) || 0)))} /><span>%</span></div></td>
                <td className="sales-sheet-formula">{currency.format(item.amount * item.probability / 100)}</td>
                <td><input aria-label="Target closing" type="date" value={item.targetClose} disabled={readOnly} onChange={(event) => updateOpportunity(item.id, 'targetClose', event.target.value)} /></td>
                <td><select aria-label="Tahap funnel" value={item.stage} disabled={readOnly} onChange={(event) => updateStage(item.id, event.target.value as FunnelStage)}>{stages.map((stage) => <option key={stage} value={stage}>{stage}</option>)}</select></td>
                <td className="sales-sheet-age"><strong>{ageLabel(item.createdAt)}</strong><small>{shortDate(item.createdAt)}</small></td>
                <td><input aria-label="Tindak lanjut" value={item.nextAction} placeholder="Catatan berikutnya" disabled={readOnly} onChange={(event) => updateOpportunity(item.id, 'nextAction', event.target.value)} /></td>
                <td>{!readOnly && <button className="sales-sheet-delete" type="button" title="Hapus peluang" aria-label={`Hapus peluang ${item.prospect || item.company || ''}`} onClick={() => void removeOpportunity(item.id)}><Trash2 size={15} /></button>}</td>
              </tr>
            ))}
            {!opportunities.length && <tr><td className="sales-sheet-empty" colSpan={10}>{loading ? 'Memuat funnel...' : <><BriefcaseBusiness size={19} /> Belum ada peluang. Tambahkan baris pertama untuk mulai mengisi funnel.</>}</td></tr>}
          </tbody>
          {opportunities.length > 0 && <tfoot><tr><th colSpan={2}>Total / forecast</th><th>{currency.format(pipelineValue)}</th><th /><th>{currency.format(weightedForecast)}</th><th colSpan={5} /></tr></tfoot>}
        </table>
      </div>
      <p className="sales-sheet-footnote">{readOnly ? 'Edit opportunity di menu Funnel.' : 'Forecast per baris = nilai potensi × probabilitas. Mengubah tahap mengisi probabilitas awal; probabilitas tetap bisa disesuaikan.'}</p>
    </section>
  )
}