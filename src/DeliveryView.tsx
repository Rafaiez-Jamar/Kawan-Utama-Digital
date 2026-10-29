import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { ArrowRight, ClipboardCheck, ExternalLink, MapPin, Package, Send, Truck, X } from 'lucide-react'
import './App.css'
import { getStatus, itemIsValid, loadDeliveryItems, storageKey } from './lib/deliveryData'
import type { DeliveryItem, DeliveryLocationPoint, DeliveryStatus } from './lib/deliveryData'
import { loadDeliveryWorkspaceRows, loadWorkspaceRow, loadWorkspaceRows, saveWorkspaceRow } from './lib/workspaceData'
import { DeliveryRouteMap } from './DeliveryRouteMap'

export type DeliveryPage = 'Dashboard' | 'Delivery Monitor' | 'Request Inbox' | 'Ambil Barang' | 'Kirim Barang' | 'Stok Barang'
type InboxFilter = 'Semua' | DeliveryStatus

const pageTitle: Record<DeliveryPage, string> = {
  Dashboard: 'Dashboard Delivery',
  'Delivery Monitor': 'Delivery Monitor',
  'Request Inbox': 'Daftar order masuk',
  'Ambil Barang': 'Antrian pengambilan barang',
  'Kirim Barang': 'Antrian pengiriman barang',
  'Stok Barang': 'Daftar barang dan stok pengiriman',
}

export function DeliveryView({ page, userEmail }: { page: DeliveryPage; userEmail: string }) {
  const readOnly = page === 'Delivery Monitor'
  const [initialData] = useState(loadDeliveryItems)
  const [items, setItems] = useState<DeliveryItem[]>(initialData.items)
  const canPersist = useRef(initialData.canPersist)
  const [workspaceReady, setWorkspaceReady] = useState(false)
  const [storageError, setStorageError] = useState(initialData.error)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [waybill, setWaybill] = useState('')
  const [inboxFilter, setInboxFilter] = useState<InboxFilter>('Semua')
  const selected = items.find((item) => item.id === selectedId) ?? null
  const pendingProduct = useMemo(() => items.filter((item) => getStatus(item) === 'Menunggu Product' || getStatus(item) === 'Diproses Product'), [items])
    const pendingWaybill = useMemo(() => items.filter((item) => getStatus(item) === 'Menunggu surat jalan'), [items])
    const pendingPickup = useMemo(() => items.filter((item) => getStatus(item) === 'Menunggu diambil'), [items])
    const inTransit = useMemo(() => items.filter((item) => getStatus(item) === 'Dalam perjalanan'), [items])
    const completed = useMemo(() => items.filter((item) => getStatus(item) === 'Terkirim'), [items])
  const displayedItems = page === 'Ambil Barang' ? pendingPickup : page === 'Kirim Barang' ? inTransit : page === 'Stok Barang' ? items.filter((item) => !item.shipped) : items
  const inboxFilters: { value: InboxFilter; label: string; count: number; isNew?: boolean }[] = [
    { value: 'Semua', label: 'Semua', count: items.length },
    { value: 'Menunggu Product', label: 'Menunggu Product', count: items.filter((item) => getStatus(item) === 'Menunggu Product').length, isNew: pendingProduct.length > 0 },
    { value: 'Diproses Product', label: 'Diproses Product', count: items.filter((item) => getStatus(item) === 'Diproses Product').length },
    { value: 'Menunggu Sales', label: 'Menunggu Sales', count: items.filter((item) => getStatus(item) === 'Menunggu Sales').length },
    { value: 'Menunggu Admin', label: 'Menunggu Admin', count: items.filter((item) => getStatus(item) === 'Menunggu Admin').length },
    { value: 'Menunggu surat jalan', label: 'Menunggu surat jalan', count: pendingWaybill.length, isNew: pendingWaybill.length > 0 },
    { value: 'Menunggu diambil', label: 'Menunggu diambil', count: pendingPickup.length },
    { value: 'Dalam perjalanan', label: 'Dalam perjalanan', count: inTransit.length },
    { value: 'Terkirim', label: 'Terkirim', count: completed.length },
  ]
  const visibleItems = page === 'Request Inbox' && inboxFilter !== 'Semua'
    ? items.filter((item) => getStatus(item) === inboxFilter)
    : displayedItems

  useEffect(() => {
    let active = true
    const loadRows = readOnly
      ? loadDeliveryWorkspaceRows(['delivery', 'sph'])
      : loadWorkspaceRows(['delivery', 'sph'])
    void loadRows.then((rows) => {
      if (!active) return
      const localById = new Map(initialData.items.map((item) => [item.id, item]))
      const deliveryRows = rows.filter((row) => row.module === 'delivery').map((row) => {
        const item = row.payload as DeliveryItem
        const local = localById.get(item.id)
        return readOnly && local ? { ...item, proofPhoto: local.proofPhoto, locationHistory: local.locationHistory } : item
      })
      const knownIds = new Set(deliveryRows.map((item) => item.id))
      const fromApprovedSPH = rows
        .filter((row) => row.module === 'sph')
        .map((row) => row.payload as { id: string; customer: string; owner: string; ownerEmail?: string; status: string; items: Array<{ id: string; product: string; quantity: number }> })
        .filter((order) => ['Approved', 'Sent to Customer', 'WIN'].includes(order.status))
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
          status: 'Menunggu surat jalan' as DeliveryStatus,
        })))
      const cloudIds = new Set([...knownIds, ...initialData.items.map((item) => item.id)])
      const newOrders = fromApprovedSPH.filter((item) => !cloudIds.has(item.id))
      const merged = [...deliveryRows, ...initialData.items.filter((item) => !knownIds.has(item.id)), ...newOrders]
      setItems(merged)
      setWorkspaceReady(true)
      setStorageError(initialData.error)
    }).catch((error: unknown) => {
      if (!active) return
      const message = error instanceof Error ? error.message : 'Kesalahan tidak diketahui.'
      console.error('Gagal memuat data Delivery dari database lokal:', error)
      setStorageError(`Gagal memuat data dari database: ${message}`)
    })
    return () => { active = false }
  }, [initialData, readOnly, userEmail])

  useEffect(() => {
    if (!workspaceReady || !canPersist.current) return
    try {
      localStorage.setItem(storageKey, JSON.stringify(items))
    } catch (error) {
      console.error('Gagal menyimpan data pengiriman:', error)
      canPersist.current = false
      window.alert('Data pengiriman gagal disimpan. Penyimpanan browser mungkin penuh.')
    }
  }, [items, workspaceReady])

  useEffect(() => {
    if (!workspaceReady || readOnly) return
    let active = true
    void Promise.all(items.map((item) => saveWorkspaceRow({
      module: 'delivery',
      record_id: item.id,
      owner_email: item.ownerEmail ?? userEmail,
      target_team: null,
      payload: item,
    }))).then(() => {
      if (active) setStorageError(null)
    }).catch((error: unknown) => {
      if (!active) return
      const message = error instanceof Error ? error.message : 'Kesalahan tidak diketahui.'
      console.error('Gagal menyimpan data Delivery ke database lokal:', error)
      setStorageError(`Gagal menyinkronkan data ke database: ${message}`)
    })
    return () => { active = false }
  }, [items, readOnly, userEmail, workspaceReady])

  useEffect(() => {
    const syncDeliveryItems = (event: StorageEvent) => {
      if (event.key !== storageKey || event.newValue === null) return
      try {
        const parsed: unknown = JSON.parse(event.newValue)
        if (!Array.isArray(parsed) || !parsed.every(itemIsValid)) throw new Error('Format data pengiriman tidak valid.')
        setItems(parsed)
        canPersist.current = true
        setStorageError(null)
      } catch (error) {
        console.error('Gagal menyinkronkan data pengiriman:', error)
        setStorageError('Data pengiriman dari tab lain tidak dapat dibaca.')
      }
    }
    window.addEventListener('storage', syncDeliveryItems)
    return () => window.removeEventListener('storage', syncDeliveryItems)
  }, [])

  function updateItem(id: string, changes: Partial<DeliveryItem>) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...changes, status: getStatus({ ...item, ...changes }), updatedAt: new Date().toISOString() } : item))
  }

  async function openOrder(item: DeliveryItem) {
    setSelectedId(item.id)
    if (!readOnly) return
    try {
      const row = await loadWorkspaceRow('delivery', item.id)
      if (!row) throw new Error('Pesanan tidak ditemukan di database.')
      const fullItem = row.payload as DeliveryItem
      setItems((current) => current.map((existing) => existing.id === item.id ? fullItem : existing))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Kesalahan tidak diketahui.'
      setStorageError(`Detail pesanan gagal dimuat: ${message}`)
    }
  }

  function submitWaybill(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected || getStatus(selected) !== 'Menunggu surat jalan' || !waybill.trim()) return
    updateItem(selected.id, { waybill: waybill.trim() })
    setWaybill('')
  }

  async function locate(item: DeliveryItem) {
    if (!navigator.geolocation) {
      window.alert('Browser ini tidak mendukung pelacakan lokasi.')
      return
    }
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000 }))
      const currentLocation = `Koordinat ${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)}`
      const locationPoint: DeliveryLocationPoint = { latitude: position.coords.latitude, longitude: position.coords.longitude, recordedAt: new Date().toISOString(), accuracy: position.coords.accuracy }
      updateItem(item.id, { latitude: position.coords.latitude, longitude: position.coords.longitude, currentLocation, locationHistory: [...(item.locationHistory ?? []), locationPoint].slice(-500) })
    } catch (error) {
      console.error('Gagal memperbarui lokasi pengiriman:', error)
      window.alert(error instanceof GeolocationPositionError ? `Lokasi tidak tersedia: ${error.message}` : 'Gagal mendapatkan lokasi perangkat.')
    }
  }

  function setDeliveryProof(item: DeliveryItem, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    if (file.size > 1024 * 1024) {
      window.alert('Ukuran foto maksimal 1 MB agar dapat tersimpan di browser.')
      event.target.value = ''
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        window.alert('Foto bukti pengiriman gagal dibaca.')
        return
      }
      updateItem(item.id, { proofPhoto: reader.result, shipped: true })
      setSelectedId(null)
    }
    reader.onerror = () => window.alert('Foto bukti pengiriman gagal dibaca.')
    reader.readAsDataURL(file)
  }

  const openMap = (item: DeliveryItem) => {
    if (item.latitude == null || item.longitude == null) return
    window.open(`https://www.google.com/maps?q=${item.latitude},${item.longitude}`, '_blank', 'noopener,noreferrer')
  }

  return <section className="delivery-view dashboard-content">
    <div className="settings-header"><div><p className="eyebrow">{readOnly ? 'Monitor pengiriman' : 'Operasional pengiriman'}</p><h1>{pageTitle[page]}.</h1><p className="muted">Kelola order, surat jalan, pengambilan, dan bukti barang terkirim.</p></div><span className="access-note"><Truck size={17} /><span><strong>{readOnly ? 'View-only' : 'Delivery access'}</strong><small>{readOnly ? 'Pantau progres tanpa mengubah data' : 'Data lama Delivery tetap digunakan'}</small></span></span></div>
    {storageError && <p className="delivery-storage-warning" role="alert">Data pengiriman tidak diubah karena gagal dibaca/disimpan: {storageError}</p>}

    <div className="delivery-summary">
      <article><span>Perlu surat jalan</span><strong>{pendingWaybill.length}</strong><small>Order masuk</small></article>
      <article><span>Perlu diambil</span><strong>{pendingPickup.length}</strong><small>Menunggu pengambilan</small></article>
      <article><span>Dalam perjalanan</span><strong>{inTransit.length}</strong><small>Belum terkirim</small></article>
      <article><span>Terkirim</span><strong>{completed.length}</strong><small>Selesai dikirim</small></article>
    </div>

    {page === 'Request Inbox' && <div className="delivery-inbox-filters" role="tablist" aria-label="Filter status pesanan">
      {inboxFilters.map((filter) => <button key={filter.value} type="button" role="tab" aria-selected={inboxFilter === filter.value} className={`${inboxFilter === filter.value ? 'active' : ''} ${filter.isNew ? 'has-new-orders' : ''}`} onClick={() => setInboxFilter(filter.value)}>
        <span>{filter.label}{filter.isNew && <i aria-label="Ada order baru" />}</span><strong>{filter.count}</strong>
      </button>)}
    </div>}

    {page === 'Dashboard' && <div className="delivery-panels">
      <section className="delivery-panel"><h2>Order perlu diproses</h2>{pendingWaybill.slice(0, 5).map((item) => <DeliveryOrderRow key={item.id} item={item} onOpen={() => void openOrder(item)} />)}{pendingWaybill.length === 0 && <p className="delivery-empty">Belum ada order baru.</p>}</section>
      <section className="delivery-panel"><h2>Dalam perjalanan</h2>{inTransit.slice(0, 5).map((item) => <DeliveryOrderRow key={item.id} item={item} onOpen={() => void openOrder(item)} />)}{inTransit.length === 0 && <p className="delivery-empty">Belum ada barang dalam perjalanan.</p>}</section>
    </div>}

    {page !== 'Dashboard' && <section className="delivery-panel delivery-orders"><div className="delivery-panel-heading"><h2>{page === 'Kirim Barang' ? 'Siap dikirim' : page === 'Ambil Barang' ? 'Menunggu diambil' : page === 'Stok Barang' ? 'Barang yang belum terkirim' : page === 'Delivery Monitor' ? 'Semua pengiriman' : 'Inbox pengiriman'}</h2><span>{visibleItems.length} order</span></div>
      {visibleItems.length ? <div className="delivery-order-list">{visibleItems.map((item) => <DeliveryOrderRow key={item.id} item={item} onOpen={() => void openOrder(item)} />)}</div> : <p className="delivery-empty">{page === 'Request Inbox' && inboxFilter === 'Semua' ? 'Belum ada order baru masuk.' : 'Tidak ada order di tahap ini.'}</p>}
    </section>}

    {selected && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedId(null) }}><section className="delivery-detail-modal" role="dialog" aria-modal="true" aria-labelledby="delivery-detail-title">
      <div className="modal-heading"><div><p className="eyebrow">{selected.id}</p><h2 id="delivery-detail-title">{selected.detail}</h2></div><button type="button" className="icon-button" onClick={() => setSelectedId(null)} aria-label="Tutup detail"><X size={19} /></button></div>
      <dl className="delivery-detail-info"><div><dt>Pelanggan</dt><dd>{selected.customer}</dd></div><div><dt>Sales</dt><dd>{selected.sales}</dd></div><div><dt>Jumlah barang</dt><dd>{selected.qty} unit</dd></div><div><dt>Status</dt><dd>{getStatus(selected)}</dd></div><div><dt>Dari</dt><dd>{selected.origin ?? 'Gudang Kawan Utama'}</dd></div><div><dt>Tujuan</dt><dd>{selected.destination ?? selected.customer}</dd></div><div><dt>Surat jalan</dt><dd>{selected.waybill ?? 'Belum diinput'}</dd></div><div><dt>Lokasi sekarang</dt><dd>{selected.currentLocation ?? 'Belum terdeteksi'}</dd></div></dl>
      <DeliveryRouteMap item={selected} />
      {selected.latitude != null && selected.longitude != null && <button type="button" className="delivery-map-link" onClick={() => openMap(selected)}><MapPin size={15} /> Buka lokasi di peta <ExternalLink size={13} /></button>}
      {selected.proofPhoto && <img className="delivery-proof-photo" src={selected.proofPhoto} alt="Foto bukti pengiriman" />}
      {!readOnly && <div className="delivery-detail-actions">
        {!selected.waybill && <form className="delivery-waybill-form" onSubmit={submitWaybill}><strong>Input nomor surat jalan</strong><input value={waybill} onChange={(event) => setWaybill(event.target.value)} placeholder="Contoh: SJ/2026/001" required /><button className="submit-button" type="submit">Simpan surat jalan <ArrowRight size={16} /></button></form>}
        {selected.waybill && !selected.pickedUp && <button className="submit-button" type="button" onClick={() => updateItem(selected.id, { pickedUp: true })}><ClipboardCheck size={16} /> Konfirmasi barang diambil</button>}
        {selected.pickedUp && !selected.shipped && <div className="delivery-send-actions"><button className="secondary-button" type="button" onClick={() => void locate(selected)}><MapPin size={15} /> Perbarui lokasi</button><label className="submit-button delivery-proof-upload"><Send size={15} /> Upload bukti terkirim<input type="file" accept="image/*" onChange={(event) => setDeliveryProof(selected, event)} /></label></div>}
      </div>}
      {selected.updatedAt && <small className="delivery-updated">Update terakhir {new Date(selected.updatedAt).toLocaleString('id-ID')}</small>}
    </section></div>}
  </section>
}

function DeliveryOrderRow({ item, onOpen }: { item: DeliveryItem; onOpen: () => void }) {
  return <button type="button" className="delivery-order-row" onClick={onOpen}>
    <span className="delivery-order-icon"><Package size={17} /></span>
    <span className="delivery-order-main"><strong>{item.detail}</strong><small>{item.customer} · {item.sales} · {item.qty} unit</small></span>
    <span className={`delivery-status-chip ${item.shipped ? 'complete' : item.pickedUp ? 'transit' : ''}`}>{getStatus(item)}</span>
    <ArrowRight size={15} />
  </button>
}
