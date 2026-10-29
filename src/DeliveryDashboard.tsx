import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { ArrowRight, Check, CircleAlert, Clock3, ExternalLink, FileText, MapPin, Package, Send, Truck, X } from 'lucide-react'
import 'leaflet/dist/leaflet.css'
import { DeliveryRouteMap } from './DeliveryRouteMap'
import { getStatus, itemIsValid, loadDeliveryItems, storageKey } from './lib/deliveryData'
import type { DeliveryItem, DeliveryLocationPoint, DeliveryStatus, DeliveryTeam, DeliveryTimelineEntry } from './lib/deliveryData'
import { loadDeliveryWorkspaceRows, loadWorkspaceRow, saveWorkspaceRow } from './lib/workspaceData'
import { calculateRabLine } from './lib/rabCalculations'

type DeliveryDashboardProps = { userName: string; userEmail: string; userRole: 'sales' | 'product' | 'delivery' | 'admin' | 'super-admin'; mode?: 'preview' | 'list'; onNavigate?: () => void }
type RabDocument = { id: string; requestId: string; productName: string; quantity: number; priceExclTax: number; priceInclTax: number; updatedAt: string }
type SphDocument = { id: string; requestId?: string; number: string; customer: string; company: string; status: string; items: Array<{ product: string; quantity: number; unitPrice: number }> }

const stages: DeliveryStatus[] = ['Request Harga', 'RAB', 'Proses Penawaran', 'Request Penawaran', 'PO Internal', 'Proses PO Internal', 'Proses Surat Jalan', 'Proses Pengambilan Barang', 'Proses Pengiriman Barang', 'Proses Invoice', 'Proses Payment', 'Selesai']
const stageTeams: Record<DeliveryStatus, DeliveryTeam> = { 'Request Harga': 'Sales', RAB: 'Product', 'Proses Penawaran': 'Sales', 'Request Penawaran': 'Sales', 'PO Internal': 'Admin', 'Proses PO Internal': 'Admin', 'Proses Surat Jalan': 'Delivery', 'Proses Pengambilan Barang': 'Delivery', 'Proses Pengiriman Barang': 'Delivery', 'Proses Invoice': 'Admin', 'Proses Payment': 'Admin', Selesai: 'Admin', 'Menunggu Product': 'Product', 'Diproses Product': 'Product', 'Menunggu Sales': 'Sales', 'Menunggu Admin': 'Admin', 'Menunggu surat jalan': 'Delivery', 'Menunggu diambil': 'Delivery', 'Dalam perjalanan': 'Delivery', 'Terkirim': 'Delivery' }
const legacyStage: Partial<Record<DeliveryStatus, DeliveryStatus>> = { 'Menunggu Product': 'RAB', 'Diproses Product': 'RAB', 'Menunggu Sales': 'Proses Penawaran', 'Menunggu Admin': 'PO Internal', 'Menunggu surat jalan': 'Proses Surat Jalan', 'Menunggu diambil': 'Proses Pengambilan Barang', 'Dalam perjalanan': 'Proses Pengiriman Barang', Terkirim: 'Proses Invoice' }
const workflowStage = (status: DeliveryStatus) => stages.includes(status) ? status : legacyStage[status] ?? 'Request Harga'
const errorMessage = (error: unknown) => error instanceof Error
  ? error.message
  : error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
    ? error.message
    : 'Kesalahan tidak diketahui.'
const formatUpdatedAt = (value?: string) => value ? new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : 'Belum ada pembaruan'
export function DeliveryDashboard({ userName, userEmail, userRole, mode = 'preview', onNavigate }: DeliveryDashboardProps) {
  const [initialData] = useState(loadDeliveryItems)
  const [items, setItems] = useState<DeliveryItem[]>(initialData.items)
  const [workspaceReady, setWorkspaceReady] = useState(false)
  const [error, setError] = useState(initialData.error)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [waybill, setWaybill] = useState('')
  const [blockerNote, setBlockerNote] = useState('')
  const [productProgress, setProductProgress] = useState('')
  const [rabDocuments, setRabDocuments] = useState<RabDocument[]>(() => {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem('kawan-product-workspace') ?? '{}')
      if (!parsed || typeof parsed !== 'object' || !('rab' in parsed) || !Array.isArray(parsed.rab)) return []
      return parsed.rab as RabDocument[]
    } catch { return [] }
  })
  const [sphDocuments, setSphDocuments] = useState<SphDocument[]>(() => {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem('kawan-sph') ?? '[]')
      return Array.isArray(parsed) ? parsed as SphDocument[] : []
    } catch { return [] }
  })
  const [liveLocation, setLiveLocation] = useState(false)
  const watchId = useRef<number | null>(null)
  const lastLocationEventAt = useRef(0)
  const lastLocationUpdateAt = useRef(0)
  const itemsRef = useRef(items)
  const dirtyOrders = useRef(new Map<string, string>())
    const canProductUpdate = userRole === 'product'
    const canDeliveryUpdate = userRole === 'delivery'
  const canSalesUpdate = userRole === 'sales'
    const canAdminUpdate = userRole === 'admin'
  const canUpdate = canProductUpdate || canDeliveryUpdate || canSalesUpdate || canAdminUpdate
  const isListPage = mode === 'list'
  const selected = items.find((item) => item.id === selectedId) ?? null
  const relatedRabs = selected?.sourceRequestId ? rabDocuments.filter((document) => document.requestId === selected.sourceRequestId) : []
  const relatedSphs = selected ? sphDocuments.filter((document) => {
    if (document.requestId && selected.sourceRequestId) return document.requestId === selected.sourceRequestId
    const normalize = (value: string) => value.trim().toLocaleLowerCase('id')
    return normalize(document.customer) === normalize(selected.customer)
      && normalize(document.company) === normalize(selected.partnership ?? '')
      && document.items.some((item) => normalize(item.product) === normalize(selected.detail))
  }) : []
  const rabReady = relatedRabs.length > 0
  const sphReady = relatedSphs.some((document) => ['Pending', 'Pending Approval', 'Approved', 'Sent to Customer', 'WIN'].includes(document.status))
  const canHandOffToSales = Boolean(selected?.productProgress?.trim()) && (!selected?.sourceRequestId || rabReady && sphReady)
  const sphApproved = !selected?.sourceRequestId || relatedSphs.some((document) => ['Approved', 'Sent to Customer', 'WIN'].includes(document.status))
  const sortedItems = useMemo(() => [...items].sort((left, right) => (right.updatedAt ?? '').localeCompare(left.updatedAt ?? '')), [items])
  const stats = [
    { label: 'Request Harga', count: items.filter((item) => workflowStage(getStatus(item)) === 'Request Harga').length },
    { label: 'Menunggu RAB', count: items.filter((item) => workflowStage(getStatus(item)) === 'RAB').length },
    { label: 'Proses penawaran', count: items.filter((item) => ['Proses Penawaran', 'Request Penawaran'].includes(workflowStage(getStatus(item)))).length },
    { label: 'Proses order', count: items.filter((item) => ['PO Internal', 'Proses PO Internal', 'Proses Surat Jalan', 'Proses Pengambilan Barang', 'Proses Pengiriman Barang'].includes(workflowStage(getStatus(item)))).length },
    { label: 'Invoice / payment', count: items.filter((item) => ['Proses Invoice', 'Proses Payment'].includes(workflowStage(getStatus(item)))).length },
  ]

  useEffect(() => {
    itemsRef.current = items
  }, [items])

  useEffect(() => {
    let active = true
    void loadDeliveryWorkspaceRows(['delivery', 'sph', 'rab']).then((rows) => {
      if (!active) return
      const localById = new Map(initialData.items.map((item) => [item.id, item]))
      const deliveryRows = rows.filter((row) => row.module === 'delivery').map((row) => {
        const item = row.payload as DeliveryItem
        const local = localById.get(item.id)
        return local ? { ...item, proofPhoto: local.proofPhoto, locationHistory: local.locationHistory } : item
      })
      const remoteRabs = rows.filter((row) => row.module === 'rab').map((row) => row.payload as RabDocument)
      const remoteSphs = rows.filter((row) => row.module === 'sph').map((row) => row.payload as SphDocument)
      const localRabs = (() => {
        try {
          const parsed: unknown = JSON.parse(localStorage.getItem('kawan-product-workspace') ?? '{}')
          return parsed && typeof parsed === 'object' && 'rab' in parsed && Array.isArray(parsed.rab) ? parsed.rab as RabDocument[] : []
        } catch { return [] }
      })()
      const localSphs = (() => {
        try {
          const parsed: unknown = JSON.parse(localStorage.getItem('kawan-sph') ?? '[]')
          return Array.isArray(parsed) ? parsed as SphDocument[] : []
        } catch { return [] }
      })()
      const rabIds = new Set(remoteRabs.map((item) => item.id))
      const sphIds = new Set(remoteSphs.map((item) => item.id))
      setRabDocuments([...remoteRabs, ...localRabs.filter((item) => !rabIds.has(item.id))])
      setSphDocuments([...remoteSphs, ...localSphs.filter((item) => !sphIds.has(item.id))])
      const knownIds = new Set(deliveryRows.map((item) => item.id))
      const approvedOrders = rows
        .filter((row) => row.module === 'sph')
        .map((row) => row.payload as { id: string; customer: string; owner: string; ownerEmail?: string; requestId?: string; status: string; items: Array<{ id: string; product: string; quantity: number }> })
        .filter((order) => !order.requestId && ['Approved', 'Sent to Customer', 'WIN'].includes(order.status))
        .flatMap((order) => order.items.map((item) => ({
          id: `sph-${order.id}-${item.id}`,
          customer: order.customer,
          sales: order.owner,
          detail: item.product,
          qty: item.quantity,
          pickedUp: false,
          shipped: false,
          origin: 'Gudang Kawan Utama',
          destination: order.customer,
          ownerEmail: order.ownerEmail ?? null,
          status: 'Menunggu Product' as DeliveryStatus,
        })))
      const knownAllIds = new Set([...knownIds, ...initialData.items.map((item) => item.id)])
      const newOrders = approvedOrders.filter((item) => !knownAllIds.has(item.id))
      setItems([...deliveryRows, ...initialData.items.filter((item) => !knownIds.has(item.id)), ...newOrders])
      setWorkspaceReady(true)
      setError(initialData.error)
    }).catch((reason: unknown) => {
      if (!active) return
      setError(reason instanceof Error ? reason.message : 'Data Delivery gagal dimuat.')
    })
    return () => { active = false }
  }, [initialData])

  useEffect(() => {
    if (!workspaceReady) return
    let active = true
    const changedItems = items.filter((item) => dirtyOrders.current.get(item.id) === item.updatedAt)
    const writableItems = userRole === 'sales'
      ? changedItems.filter((item) => item.ownerEmail?.toLowerCase() === userEmail.toLowerCase())
      : changedItems
    if (!writableItems.length) return
    void Promise.all(writableItems.map((item) => saveWorkspaceRow({
      module: 'delivery',
      record_id: item.id,
      owner_email: item.ownerEmail ?? userEmail,
      target_team: null,
      payload: item,
    }))).then(() => {
      if (!active) return
      writableItems.forEach((item) => {
        if (dirtyOrders.current.get(item.id) === item.updatedAt) dirtyOrders.current.delete(item.id)
      })
      setError(null)
    }).catch((reason: unknown) => {
      if (active) setError(`Progres Delivery gagal disimpan: ${errorMessage(reason)}`)
    })
    return () => { active = false }
  }, [items, userEmail, userRole, workspaceReady])

  useEffect(() => {
    if (!workspaceReady) return
    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      void loadDeliveryWorkspaceRows(['delivery', 'rab', 'sph']).then((rows) => {
        const currentById = new Map(itemsRef.current.map((item) => [item.id, item]))
        const remote = rows.filter((row) => row.module === 'delivery').map((row) => {
          const item = row.payload as DeliveryItem
          const current = currentById.get(item.id)
          return current ? { ...item, proofPhoto: current.proofPhoto, locationHistory: current.locationHistory } : item
        })
        setRabDocuments(rows.filter((row) => row.module === 'rab').map((row) => row.payload as RabDocument))
        setSphDocuments(rows.filter((row) => row.module === 'sph').map((row) => row.payload as SphDocument))
        setItems((current) => {
          const remoteIds = new Set(remote.map((item) => item.id))
          const merged = [...remote, ...current.filter((item) => !remoteIds.has(item.id))]
          return JSON.stringify(current) === JSON.stringify(merged) ? current : merged
        })
      }).catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : 'Pembaruan Delivery gagal dimuat.')
      })
    }, 60000)
    return () => window.clearInterval(intervalId)
  }, [workspaceReady])

  useEffect(() => {
    const syncItems = (event: StorageEvent) => {
      if (event.key !== storageKey || !event.newValue) return
      try {
        const parsed: unknown = JSON.parse(event.newValue)
        if (Array.isArray(parsed) && parsed.every(itemIsValid)) setItems(parsed)
      } catch {
        setError('Pembaruan Delivery dari tab lain tidak dapat dibaca.')
      }
    }
    window.addEventListener('storage', syncItems)
    return () => window.removeEventListener('storage', syncItems)
  }, [])

  useEffect(() => () => {
    if (watchId.current !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchId.current)
  }, [])

  function canEditSelectedOrder(item: DeliveryItem) {
    const status = getStatus(item)
    if (userRole === 'admin') return status === 'Menunggu Admin' || ['Request Penawaran', 'PO Internal', 'Proses PO Internal', 'Proses Invoice', 'Proses Payment'].includes(status)
    if (userRole === 'sales') return item.ownerEmail?.toLowerCase() === userEmail.toLowerCase() && (status === 'Menunggu Sales' || status === 'RAB' || status === 'Proses Penawaran')
    if (userRole === 'product') return status === 'Menunggu Product' || status === 'Diproses Product' || status === 'Request Harga'
    return userRole === 'delivery' && ['Menunggu surat jalan', 'Menunggu diambil', 'Dalam perjalanan', 'Proses Surat Jalan', 'Proses Pengambilan Barang', 'Proses Pengiriman Barang'].includes(status)
  }

  function updateItem(id: string, changes: Partial<DeliveryItem>, message?: string, team?: DeliveryTeam) {
    const at = new Date().toISOString()
    const updateTeam = team ?? (userRole === 'super-admin' || userRole === 'admin' ? 'Admin' : userRole === 'product' ? 'Product' : userRole === 'sales' ? 'Sales' : 'Delivery')
    const updatedItems = itemsRef.current.map((item) => {
      if (item.id !== id) return item
      const timeline: DeliveryTimelineEntry[] = message
        ? [...(item.timeline ?? []), { team: updateTeam, person: userName, message, at }]
        : item.timeline ?? []
      return { ...item, ...changes, timeline, updatedAt: at }
    })
    itemsRef.current = updatedItems
    const changedItem = updatedItems.find((item) => item.id === id)
    if (changedItem) dirtyOrders.current.set(id, at)
    setItems(updatedItems)
    if (!initialData.canPersist) return
    try {
      localStorage.setItem(storageKey, JSON.stringify(updatedItems))
    } catch {
      setError('Data Delivery gagal disimpan di browser.')
    }
  }

  function submitWaybill(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected || !waybill.trim() || !['Menunggu surat jalan', 'Proses Surat Jalan'].includes(getStatus(selected))) return
    updateItem(selected.id, { waybill: waybill.trim(), status: 'Proses Pengambilan Barang' }, `Surat jalan ${waybill.trim()} dibuat.`)
  }

  function saveBlocker(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected || !canEditSelectedOrder(selected)) return
    updateItem(selected.id, { blockedReason: blockerNote.trim() || undefined }, blockerNote.trim() ? `Kendala dicatat: ${blockerNote.trim()}` : 'Catatan kendala dihapus.')
  }

  function saveProductUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected || getStatus(selected) !== 'Diproses Product' || !productProgress.trim()) return
    updateItem(selected.id, { productProgress: productProgress.trim() }, `Update Product: ${productProgress.trim()}`)
  }

  function toggleLiveLocation() {
    if (!selected) return
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current)
      watchId.current = null
      setLiveLocation(false)
      updateItem(selected.id, {}, 'Pelacakan lokasi kurir dihentikan.')
      return
    }
    if (!navigator.geolocation) {
      window.alert('Browser ini tidak mendukung pelacakan lokasi.')
      return
    }
    watchId.current = navigator.geolocation.watchPosition((position) => {
      if (Date.now() - lastLocationUpdateAt.current < 10000) return
      lastLocationUpdateAt.current = Date.now()
      const currentLocation = `Koordinat ${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)}`
      const addEvent = Date.now() - lastLocationEventAt.current > 60000
      if (addEvent) lastLocationEventAt.current = Date.now()
      const locationPoint: DeliveryLocationPoint = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        recordedAt: new Date().toISOString(),
        accuracy: position.coords.accuracy,
      }
      const latestOrder = itemsRef.current.find((item) => item.id === selected.id)
      const locationHistory = [...(latestOrder?.locationHistory ?? []), locationPoint].slice(-500)
      updateItem(selected.id, { latitude: position.coords.latitude, longitude: position.coords.longitude, currentLocation, locationHistory }, addEvent ? `Posisi kurir diperbarui: ${currentLocation}` : undefined)
    }, (reason) => {
      setLiveLocation(false)
      watchId.current = null
      setError(`Lokasi tidak tersedia: ${reason.message}`)
    }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 })
    setLiveLocation(true)
    updateItem(selected.id, {}, 'Pelacakan lokasi kurir dimulai.')
  }

  function closeDetails() {
    if (watchId.current !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchId.current)
    watchId.current = null
    setLiveLocation(false)
    setSelectedId(null)
  }

  async function openDetails(item: DeliveryItem) {
    setBlockerNote(item.blockedReason ?? '')
    setWaybill(item.waybill ?? '')
    setProductProgress(item.productProgress ?? '')
    setSelectedId(item.id)
    try {
      const row = await loadWorkspaceRow('delivery', item.id)
      if (!row) throw new Error('Pesanan tidak ditemukan di database.')
      const fullItem = row.payload as DeliveryItem
      const updatedItems = itemsRef.current.map((current) => current.id === item.id ? fullItem : current)
      itemsRef.current = updatedItems
      setItems(updatedItems)
    } catch (reason) {
      setError(`Detail pesanan gagal dimuat: ${errorMessage(reason)}`)
    }
  }

  function uploadProof(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!selected || !file) return
    if (file.size > 1024 * 1024) {
      window.alert('Ukuran foto maksimal 1 MB.')
      event.target.value = ''
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string' && selected) {
        updateItem(selected.id, { proofPhoto: reader.result, shipped: true, status: 'Proses Invoice' }, 'Bukti pengiriman disimpan; pesanan dilanjutkan ke proses invoice.')
        if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current)
        watchId.current = null
        setLiveLocation(false)
        closeDetails()
      }
    }
    reader.onerror = () => window.alert('Foto bukti pengiriman gagal dibaca.')
    reader.readAsDataURL(file)
  }

  const displayedItems = isListPage ? sortedItems : sortedItems.slice(0, 5)

  return <section className={`delivery-dashboard-widget ${isListPage ? 'delivery-dashboard-list-page' : ''}`}>
    <div className="delivery-dashboard-heading"><div><p className="eyebrow">Order tracking</p><h2>{isListPage ? 'Semua order tracking' : 'Alur pesanan'}</h2><p>{isListPage ? 'Pantau progres pesanan dari seluruh tim.' : 'Request harga → RAB → penawaran → PO → pengiriman → invoice → payment'}</p></div><span><Truck size={17} /> Semua tim</span></div>
    {error && <p className="delivery-storage-warning" role="alert">{error}</p>}
    {!workspaceReady && <p className="muted" role="status">Memuat progres pesanan...</p>}
    <div className="delivery-dashboard-stats">{stats.map((stat) => <article key={stat.label}><span>{stat.label}</span><strong>{stat.count}</strong></article>)}</div>
    <div className="delivery-dashboard-orders">
      <div className="delivery-dashboard-list-heading"><h3>Pesanan aktif dan riwayat</h3><span>{items.length} pesanan</span></div>
      {displayedItems.length ? displayedItems.map((item) => {
        const status = getStatus(item)
        const currentStage = workflowStage(status)
        return <button type="button" className="delivery-dashboard-row" key={item.id} onClick={() => void openDetails(item)}>
          <span className="delivery-order-icon"><Package size={17} /></span>
          <span className="delivery-dashboard-order-main"><strong>{item.detail}</strong><small>{item.customer} · {item.sales} · {item.qty} pcs</small><small>Penanggung jawab: Tim {stageTeams[currentStage]}</small>{currentStage === 'Proses Pengiriman Barang' && item.currentLocation && <small className="delivery-live-location"><MapPin size={12} /> Lokasi kurir: {item.currentLocation}</small>}{item.productProgress && <small>{item.productProgress}</small>}{item.blockedReason && <small className="delivery-blocked-label"><CircleAlert size={12} /> Kendala: {item.blockedReason}</small>}</span>
          <span className="delivery-dashboard-order-status"><span className={`delivery-status-chip ${currentStage === 'Selesai' ? 'complete' : currentStage === 'Proses Pengiriman Barang' ? 'transit' : ''}`}>{currentStage}</span><small><Clock3 size={12} /> {formatUpdatedAt(item.updatedAt)}</small></span>
          <ArrowRight size={15} />
        </button>
      }) : <p className="delivery-empty">Belum ada pesanan yang masuk ke alur Delivery.</p>}
      {!isListPage && sortedItems.length > 5 && <button className="delivery-see-more" type="button" onClick={onNavigate}>Lihat lebih banyak <ArrowRight size={15} /></button>}
    </div>

    {selected && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDetails() }}><section className="delivery-detail-modal delivery-tracking-detail" role="dialog" aria-modal="true" aria-labelledby="delivery-tracking-title">
      <div className="modal-heading"><div><p className="eyebrow">{selected.id}</p><h2 id="delivery-tracking-title">{selected.detail}</h2><p>{selected.customer} · {selected.qty} pcs · Sales: {selected.sales}</p></div><button type="button" className="icon-button" onClick={closeDetails} aria-label="Tutup detail"><X size={19} /></button></div>
      <div className="delivery-stage-track" aria-label={`Status pesanan: ${workflowStage(getStatus(selected))}`}>{stages.map((stage, index) => {
        const currentIndex = stages.indexOf(workflowStage(getStatus(selected)))
        return <div className={index < currentIndex ? 'complete' : index === currentIndex ? 'current' : ''} key={stage}><i /><span>{stage}<small>Tim {stageTeams[stage]}</small></span></div>
      })}</div>
      <DeliveryRouteMap item={selected} />
      <dl className="delivery-detail-info"><div><dt>Dari</dt><dd>{selected.origin ?? 'Gudang Kawan Utama'}</dd></div><div><dt>Tujuan</dt><dd>{selected.destination ?? selected.customer}</dd></div><div><dt>Surat jalan</dt><dd>{selected.waybill ?? 'Belum diinput'}</dd></div><div><dt>Lokasi terakhir</dt><dd>{selected.currentLocation ?? 'Belum diperbarui'}</dd></div><div><dt>Update terakhir</dt><dd>{formatUpdatedAt(selected.updatedAt)}</dd></div></dl>
      {selected.latitude != null && selected.longitude != null && <a className="delivery-map-link" href={`https://www.google.com/maps?q=${selected.latitude},${selected.longitude}`} target="_blank" rel="noreferrer"><MapPin size={15} /> Buka lokasi di peta <ExternalLink size={13} /></a>}
      <section className="delivery-documents"><h3>Data pesanan & berkas</h3>{selected.requestAttachmentUrl && <a className="product-attachment" href={selected.requestAttachmentUrl} download={selected.requestAttachmentName} target="_blank" rel="noreferrer"><Package size={16} /><span><strong>{selected.requestAttachmentName}</strong><small>Lampiran dari Sales</small></span><ExternalLink size={14} /></a>}<div className="delivery-document-checks"><span className={rabReady ? 'ready' : ''}><Check size={14} /> RAB {rabReady ? 'tersedia' : 'belum tersedia'}</span><span className={sphReady ? 'ready' : ''}><Check size={14} /> SPH {sphReady ? 'siap' : 'belum siap'}</span></div>{relatedRabs.map((document) => <div className="delivery-document-row" key={document.id}><FileText size={15} /><span><strong>RAB · {document.productName}</strong><small>{document.quantity} pcs · Excl. {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(calculateRabLine({ quantity: document.quantity, salePriceInclPpn: document.priceInclTax, modalPriceInclPpn: 0 }).saleTotalExclPpn)} · Incl. {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(document.quantity * document.priceInclTax)}</small></span></div>)}{relatedSphs.map((document) => <div className="delivery-document-row" key={document.id}><FileText size={15} /><span><strong>SPH · {document.number}</strong><small>{document.items.map((item) => `${item.product} (${item.quantity} pcs)`).join(', ')} · ${document.status}</small></span></div>)}</section>
      {selected.blockedReason && <p className="delivery-blocked-note"><CircleAlert size={16} /><span><strong>Kendala</strong>{selected.blockedReason}</span></p>}
      {selected.proofPhoto && <img className="delivery-proof-photo" src={selected.proofPhoto} alt="Foto bukti pengiriman" />}
      <section className="delivery-event-history"><h3>Riwayat proses</h3>{(selected.timeline ?? []).length ? [...(selected.timeline ?? [])].reverse().map((entry, index) => <article key={`${entry.at}-${index}`}><span>{entry.team}</span><div><strong>{entry.message}</strong><small>{entry.person} · {formatUpdatedAt(entry.at)}</small></div></article>) : <p>Belum ada catatan proses.</p>}</section>
      {canUpdate && <div className="delivery-dashboard-actions">
        {canProductUpdate && getStatus(selected) === 'Request Harga' && rabReady && <button className="submit-button" type="button" onClick={() => updateItem(selected.id, { status: 'RAB' }, 'RAB tersedia untuk pesanan ini.') }><Check size={16} /> Tandai RAB tersedia</button>}
        {canSalesUpdate && getStatus(selected) === 'RAB' && <button className="submit-button" type="button" onClick={() => updateItem(selected.id, { status: 'Proses Penawaran' }, 'Sales mulai menyiapkan penawaran.') }><FileText size={16} /> Mulai proses penawaran</button>}
        {canSalesUpdate && getStatus(selected) === 'Proses Penawaran' && <button className="submit-button" type="button" onClick={() => updateItem(selected.id, { status: 'Request Penawaran' }, 'Penawaran diajukan untuk diproses.') }><Send size={16} /> Ajukan penawaran</button>}
        {canAdminUpdate && getStatus(selected) === 'Request Penawaran' && <button className="submit-button" type="button" onClick={() => updateItem(selected.id, { status: 'PO Internal' }, 'Penawaran masuk ke proses PO internal.') }><Check size={16} /> Proses PO internal</button>}
        {canAdminUpdate && getStatus(selected) === 'PO Internal' && <button className="submit-button" type="button" onClick={() => updateItem(selected.id, { status: 'Proses PO Internal' }, 'Proses PO internal dimulai.') }><FileText size={16} /> Proses PO internal</button>}
        {canAdminUpdate && getStatus(selected) === 'Proses PO Internal' && <button className="submit-button" type="button" onClick={() => updateItem(selected.id, { status: 'Proses Surat Jalan' }, 'PO internal selesai; surat jalan dapat diproses.') }><Truck size={16} /> Lanjut ke surat jalan</button>}
        {canDeliveryUpdate && getStatus(selected) === 'Proses Surat Jalan' && <form className="delivery-waybill-form" onSubmit={submitWaybill}><strong>Proses surat jalan</strong><input value={waybill} onChange={(event) => setWaybill(event.target.value)} placeholder="Contoh: SJ/2026/001" required /><button className="submit-button" type="submit">Simpan & lanjut ke pengambilan <ArrowRight size={16} /></button></form>}
        {canDeliveryUpdate && getStatus(selected) === 'Proses Pengambilan Barang' && <button className="submit-button" type="button" onClick={() => updateItem(selected.id, { pickedUp: true, status: 'Proses Pengiriman Barang' }, 'Barang sudah diambil untuk dikirim.') }><Check size={16} /> Konfirmasi barang diambil</button>}
        {canDeliveryUpdate && getStatus(selected) === 'Proses Pengiriman Barang' && <button className="secondary-button" type="button" onClick={toggleLiveLocation}>{liveLocation ? <X size={15} /> : <MapPin size={15} />}{liveLocation ? 'Hentikan live location' : 'Mulai live location kurir'}</button>}
        {canDeliveryUpdate && getStatus(selected) === 'Proses Pengiriman Barang' && <label className="submit-button delivery-proof-upload"><Send size={15} /> Simpan bukti pengiriman<input type="file" accept="image/*" onChange={uploadProof} /></label>}
        {canAdminUpdate && getStatus(selected) === 'Proses Invoice' && <button className="submit-button" type="button" onClick={() => updateItem(selected.id, { status: 'Proses Payment' }, 'Invoice selesai; proses payment dimulai.') }><FileText size={16} /> Selesaikan invoice, mulai payment</button>}
        {canAdminUpdate && getStatus(selected) === 'Proses Payment' && <button className="submit-button" type="button" onClick={() => updateItem(selected.id, { status: 'Selesai' }, 'Payment selesai; pesanan ditutup.') }><Check size={16} /> Tandai payment selesai</button>}
        {canProductUpdate && getStatus(selected) === 'Menunggu Product' && <button className="submit-button" type="button" onClick={() => updateItem(selected.id, { status: 'Diproses Product' }, 'Product mulai menyiapkan data dan berkas pesanan.')}><Package size={16} /> Mulai proses Product</button>}
        {canProductUpdate && getStatus(selected) === 'Diproses Product' && <form className="delivery-product-update" onSubmit={saveProductUpdate}><label htmlFor="delivery-product-progress">Update pekerjaan Product</label><textarea id="delivery-product-progress" value={productProgress} onChange={(event) => setProductProgress(event.target.value)} rows={2} placeholder="Contoh: cek spesifikasi monitor dan konfirmasi stok 10 pcs" /><button className="secondary-button" type="submit" disabled={!productProgress.trim()}>Simpan update kerja</button><p className="delivery-doc-hint">Handoff ke Sales aktif setelah RAB tersedia dan SPH berstatus siap.</p><button className="submit-button" type="button" disabled={!canHandOffToSales} onClick={() => updateItem(selected.id, { status: 'Menunggu Sales' }, 'Product menyelesaikan pemeriksaan dan menyerahkan pesanan ke Sales.')}><Send size={15} /> Kirim ke Sales</button></form>}
        {canSalesUpdate && getStatus(selected) === 'Menunggu Sales' && <button className="submit-button" type="button" onClick={() => updateItem(selected.id, { status: 'Menunggu Admin' }, 'Sales menerima data dan meneruskan pesanan ke Admin.') }><Check size={16} /> Data diterima Sales, teruskan ke Admin</button>}
        {canAdminUpdate && getStatus(selected) === 'Menunggu Admin' && <><p className="delivery-doc-hint">{selected.sourceRequestId ? 'Delivery dibuka setelah RAB lengkap dan SPH disetujui.' : 'Periksa dokumen sebelum meneruskan pesanan.'}</p><button className="submit-button" type="button" disabled={Boolean(selected.sourceRequestId) && (!rabReady || !sphApproved)} onClick={() => updateItem(selected.id, { status: 'Menunggu surat jalan' }, 'Admin menyetujui pesanan untuk diproses Delivery.')}><Check size={16} /> Setujui, teruskan ke Delivery</button></>}
        {canDeliveryUpdate && getStatus(selected) === 'Menunggu surat jalan' && <form className="delivery-waybill-form" onSubmit={submitWaybill}><strong>Siapkan surat jalan</strong><input value={waybill} onChange={(event) => setWaybill(event.target.value)} placeholder="Contoh: SJ/2026/001" required /><button className="submit-button" type="submit">Teruskan ke pengambilan <ArrowRight size={16} /></button></form>}
        {canDeliveryUpdate && getStatus(selected) === 'Menunggu diambil' && <button className="submit-button" type="button" onClick={() => updateItem(selected.id, { pickedUp: true, status: 'Dalam perjalanan' }, 'Kurir mengonfirmasi barang sudah diambil.') }><Check size={16} /> Konfirmasi barang diambil</button>}
        {canDeliveryUpdate && getStatus(selected) === 'Dalam perjalanan' && <button className="secondary-button" type="button" onClick={toggleLiveLocation}>{liveLocation ? <X size={15} /> : <MapPin size={15} />}{liveLocation ? 'Hentikan live location' : 'Mulai live location kurir'}</button>}
        {canDeliveryUpdate && getStatus(selected) === 'Dalam perjalanan' && <label className="submit-button delivery-proof-upload"><Send size={15} /> Selesaikan dengan bukti terkirim<input type="file" accept="image/*" onChange={uploadProof} /></label>}
        {getStatus(selected) === 'Selesai' && <span className="delivery-complete-label"><Check size={15} /> Pesanan selesai</span>}
        {canEditSelectedOrder(selected) && <form className="delivery-blocker-form" onSubmit={saveBlocker}><label htmlFor="delivery-blocker">Catatan kendala</label><textarea id="delivery-blocker" value={blockerNote} onChange={(event) => setBlockerNote(event.target.value)} rows={2} placeholder="Tulis penyebab tertahan, atau kosongkan untuk menghapus" /><button className="secondary-button" type="submit">Simpan kendala</button></form>}
      </div>}
    </section></div>}
  </section>
}