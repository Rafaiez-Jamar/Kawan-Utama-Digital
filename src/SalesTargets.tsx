import { useEffect, useMemo, useState } from 'react'
import { Check, Target } from 'lucide-react'
import { localApi } from './lib/localApi'
import type { SalesTarget, SalesTargetProgress } from './lib/localApi'

function monthPeriod() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  return { start: start.toISOString(), end: end.toISOString(), label: new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(now) }
}

function formatRupiah(value: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value)
}

export function SalesTargetProgress({ userEmail }: { userEmail: string }) {
  const period = useMemo(() => monthPeriod(), [])
  const [progress, setProgress] = useState<SalesTargetProgress | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void localApi.salesTarget(period.start, period.end).then((data) => {
      if (active) setProgress(data)
    }).catch((reason: unknown) => {
      if (!active) return
      const message = reason instanceof Error ? reason.message : 'Kesalahan tidak diketahui.'
      console.error('Gagal memuat progress target Sales:', reason)
      setError(message)
    })
    return () => { active = false }
  }, [period.end, period.start, userEmail])

  if (error) return <section className="sales-target-card" role="alert"><p className="sales-target-error">Progress target gagal dimuat: {error}</p></section>
  if (!progress) return <section className="sales-target-card" role="status">Memuat target Sales...</section>

  const percentage = progress.target > 0 ? (progress.achieved / progress.target) * 100 : 0
  const color = percentage >= 100 ? 'green' : percentage >= 50 ? 'yellow' : 'red'
  const visualPercentage = Math.min(100, Math.max(0, percentage))

  return (
    <section className="sales-target-card" aria-label="Progress target penjualan bulanan">
      <div className="sales-target-heading">
        <span className="sales-target-icon"><Target size={18} /></span>
        <div><p className="eyebrow">Target penjualan · {period.label}</p><h2>Progress bulanan</h2></div>
      </div>
      <div className="sales-target-values">
        <div><small>Nilai SPH WIN</small><strong>{formatRupiah(progress.achieved)}</strong></div>
        <div><small>Target bulan ini</small><strong>{progress.target > 0 ? formatRupiah(progress.target) : 'Belum diatur'}</strong></div>
        <b className={`sales-target-percent ${color}`}>{progress.target > 0 ? `${Math.floor(percentage)}%` : '—'}</b>
      </div>
      <div className={`sales-target-track ${color}`} role="progressbar" aria-label="Progress target bulanan" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(visualPercentage)}>
        <span style={{ width: `${visualPercentage}%` }} />
      </div>
      <p className="sales-target-caption">{progress.target > 0 ? percentage >= 100 ? 'Target bulanan tercapai. Pertahankan performa!' : `Capaian dihitung dari total nilai SPH berstatus WIN pada ${period.label}.` : 'Hubungi Admin atau Super Admin untuk mengatur target bulanan.'}</p>
    </section>
  )
}

export function SalesTargetsView() {
  const period = useMemo(() => monthPeriod(), [])
  const [targets, setTargets] = useState<SalesTarget[]>([])
  const [values, setValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let active = true
    void localApi.salesTargets(period.start, period.end).then((data) => {
      if (!active) return
      if (!Array.isArray(data)) throw new Error('Respons daftar target Sales tidak valid.')
      setTargets(data)
      setValues(Object.fromEntries(data.map((item) => [item.id, String(item.target)])))
      setLoading(false)
    }).catch((reason: unknown) => {
      if (!active) return
      const message = reason instanceof Error ? reason.message : 'Kesalahan tidak diketahui.'
      console.error('Gagal memuat target Sales:', reason)
      setError(message)
      setLoading(false)
    })
    return () => { active = false }
  }, [period.end, period.start])

  async function saveTarget(item: SalesTarget) {
    const rawTarget = values[item.id]?.trim() ?? ''
    const target = Number(rawTarget)
    if (!rawTarget || !Number.isFinite(target) || target < 0 || target > 1_000_000_000_000_000) {
      setError(`Nominal target untuk ${item.name} tidak valid.`)
      return
    }
    setSavingId(item.id)
    setError('')
    setNotice('')
    try {
      const saved = await localApi.updateSalesTarget(item.id, target)
      setTargets((current) => current.map((row) => row.id === saved.id ? { ...row, target: saved.target } : row))
      setValues((current) => ({ ...current, [saved.id]: String(saved.target) }))
      setNotice(`Target ${saved.name} berhasil disimpan.`)
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Kesalahan tidak diketahui.'
      console.error('Gagal menyimpan target Sales:', reason)
      setError(`Gagal menyimpan target ${item.name}: ${message}`)
    } finally {
      setSavingId('')
    }
  }

  return (
    <section className="sales-targets-view dashboard-content">
      <div className="sales-targets-header">
        <div><p className="eyebrow">Pengelolaan penjualan · {period.label}</p><h1>Target Sales.</h1><p className="muted">Atur target nominal bulanan setiap Sales. Capaian berasal dari total SPH berstatus WIN pada bulan berjalan.</p></div>
        <span className="access-note"><Target size={17} /><span><strong>Admin access</strong><small>Target per Sales</small></span></span>
      </div>
      {error && <p className="sales-target-alert" role="alert">{error}</p>}
      {notice && <p className="sales-target-notice" role="status">{notice}</p>}
      <div className="sales-targets-panel">
        <div className="sales-targets-panel-head"><div><h2>Daftar Sales</h2><p>Target dan nilai SPH WIN bulan ini</p></div><span>{targets.length} Sales</span></div>
        {loading ? <p className="sales-target-empty" role="status">Memuat daftar Sales...</p> : targets.length === 0 ? <p className="sales-target-empty">Belum ada akun dengan role Sales.</p> : (
          <div className="sales-targets-list">
            {targets.map((item) => (
              <article className="sales-target-row" key={item.id}>
                <div className="sales-target-person"><strong>{item.name}</strong><small>{item.email}</small><span>Capaian bulan ini: {formatRupiah(item.achieved)}</span></div>
                <label className="sales-target-input">Target bulanan (Rp)<input type="number" min="0" max="1000000000000000" step="100000" required value={values[item.id] ?? ''} onChange={(event) => setValues((current) => ({ ...current, [item.id]: event.target.value }))} /></label>
                <button className="sales-target-save" type="button" disabled={savingId === item.id} onClick={() => void saveTarget(item)}>{savingId === item.id ? 'Menyimpan...' : <><Check size={15} /> Simpan</>}</button>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
