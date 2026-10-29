export type DeliveryStatus = 'Request Harga' | 'RAB' | 'Proses Penawaran' | 'Request Penawaran' | 'PO Internal' | 'Proses PO Internal' | 'Proses Surat Jalan' | 'Proses Pengambilan Barang' | 'Proses Pengiriman Barang' | 'Proses Invoice' | 'Proses Payment' | 'Selesai' | 'Menunggu Product' | 'Diproses Product' | 'Menunggu Sales' | 'Menunggu Admin' | 'Menunggu surat jalan' | 'Menunggu diambil' | 'Dalam perjalanan' | 'Terkirim'
export type DeliveryTeam = 'Sales' | 'Product' | 'Admin' | 'Delivery'
export type DeliveryTimelineEntry = { team: DeliveryTeam; person: string; message: string; at: string }
export type DeliveryLocationPoint = { latitude: number; longitude: number; recordedAt: string; accuracy?: number }

export type DeliveryItem = {
  id: string
  customer: string
  sales: string
  detail: string
  qty: number
  pickedUp: boolean
  shipped: boolean
  status?: DeliveryStatus
  waybill?: string
  proofPhoto?: string
  currentLocation?: string
  origin?: string
  destination?: string
  blockedReason?: string
  ownerEmail?: string | null
  sourceRequestId?: string
  partnership?: string
  requestAttachmentName?: string
  requestAttachmentUrl?: string
  productProgress?: string
  timeline?: DeliveryTimelineEntry[]
  createdAt?: string
  latitude?: number
  longitude?: number
  locationHistory?: DeliveryLocationPoint[]
  updatedAt?: string
}

export const storageKey = 'kawan-delivery-items'
const salesWorkflowStatuses: DeliveryStatus[] = ['Request Harga', 'RAB', 'Proses Penawaran', 'Request Penawaran', 'PO Internal', 'Proses PO Internal', 'Proses Surat Jalan', 'Proses Pengambilan Barang', 'Proses Pengiriman Barang', 'Proses Invoice', 'Proses Payment', 'Selesai']
export const getStatus = (item: DeliveryItem): DeliveryStatus => item.status && salesWorkflowStatuses.includes(item.status)
  ? item.status
  : item.shipped ? 'Terkirim' : item.pickedUp ? 'Dalam perjalanan' : item.waybill ? 'Menunggu diambil' : item.status === 'Menunggu Product' || item.status === 'Diproses Product' ? item.status : item.status ?? 'Menunggu surat jalan'

export const itemIsValid = (value: unknown): value is DeliveryItem => {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<DeliveryItem>
  return typeof item.id === 'string' && typeof item.customer === 'string' && typeof item.sales === 'string' && typeof item.detail === 'string' && typeof item.qty === 'number' && typeof item.pickedUp === 'boolean' && typeof item.shipped === 'boolean'
}

export function loadDeliveryItems(): { items: DeliveryItem[]; canPersist: boolean; error: string | null } {
  try {
    const saved = localStorage.getItem(storageKey)
    let existingItems: DeliveryItem[] = []
    if (saved !== null) {
      const parsed: unknown = JSON.parse(saved)
      if (!Array.isArray(parsed) || !parsed.every(itemIsValid)) throw new Error('Format data pengiriman tidak valid.')
      existingItems = parsed
    }

    const projects = JSON.parse(localStorage.getItem('kawan-funnel-projects') ?? '[]') as Array<{ id: number; customer: string; sales: string; items: Array<{ id: number; detail: string; qty: number }> }>
    const fromFunnel = projects.flatMap((project) => project.items.map((item) => ({
      id: `funnel-${project.id}-${item.id}`,
      customer: project.customer,
      sales: project.sales,
      detail: item.detail,
      qty: item.qty,
      pickedUp: false,
      shipped: false,
      origin: 'Gudang Kawan Utama',
      destination: project.customer,
      status: 'Menunggu Product' as DeliveryStatus,
    })))
    const sphList = JSON.parse(localStorage.getItem('kawan-sph') ?? '[]') as Array<{ id: string; requestId?: string; customer: string; owner: string; status: string; items: Array<{ id: string; product: string; quantity: number }> }>
    const fromApprovedSPH = sphList
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
        status: 'Menunggu Product' as DeliveryStatus,
      })))
    const knownIds = new Set(existingItems.map((item) => item.id))
    const newOrders = [...fromFunnel, ...fromApprovedSPH].filter((item) => !knownIds.has(item.id))
    return { items: [...existingItems, ...newOrders], canPersist: true, error: null }
  } catch (error) {
    console.error('Gagal memuat data pengiriman:', error)
    return { items: [], canPersist: false, error: error instanceof Error ? error.message : 'Data pengiriman tidak dapat dibaca.' }
  }
}