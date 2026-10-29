import { Fragment, useEffect, useMemo, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { ArrowRight, Bell, Building2, Check, ChevronDown, Download, ExternalLink, FileImage, FileText, Package, Paperclip, Plus, RotateCcw, Search, Send, ShieldCheck, Trash2, X } from 'lucide-react'
import './App.css'
import { deleteWorkspaceRow, loadWorkspaceRows, saveWorkspaceRow } from './lib/workspaceData'
import { localApi } from './lib/localApi'
import { storageKey as deliveryStorageKey } from './lib/deliveryData'
import type { DeliveryItem } from './lib/deliveryData'
import { FormattedNumberInput } from './lib/FormattedNumberInput'
import { calculateRabDocument, calculateRabLine } from './lib/rabCalculations'
import type { RabDocumentCalculationInput } from './lib/rabCalculations'
import { SalesFunnelSheet } from './SalesFunnelSheet'
import { SalesTargetProgress } from './SalesTargets'

type WorkspaceRole = 'sales' | 'product' | 'admin' | 'super-admin'
type WorkspacePage = 'Dashboard' | 'Funnel' | 'Request Harga' | 'Partnership' | 'RAB'
type RequestStatus = 'Request Harga' | 'Menunggu Product' | 'RAB tersedia' | 'Ditolak'
type StockStatus = 'Ready' | 'Limited' | 'Indent' | 'Kosong'
type PriceRequestProduct = { id: string; productName: string; quantity: number }
type PriceRequest = {
  id: string
  customerName: string
  partnership: string
  productName: string
  description: string
  quantity: number
  products?: PriceRequestProduct[]
  ownerName: string
  ownerEmail: string
  status: RequestStatus
  reviewNote: string
  attachmentName: string
  attachmentUrl: string
  createdAt: string
  acceptedAt?: string
}
type RabItem = {
  id: string
  requestId: string
  productName: string
  unit?: string
  quantity: number
  priceExclTax: number
  priceInclTax: number
  priceModalExclTax?: number
  priceModalInclTax?: number
  cashback?: number
  ongkir?: number
  platformFeePadiManual?: number
  archivedAt?: string
  trashedAt?: string
  stock: StockStatus | number
  productUrl: string
  distributor?: string
  businessType?: 'B2B' | 'B2G'
  number?: string
  ownerName: string
  ownerEmail: string
  createdAt: string
  updatedAt: string
}
type RabEdit = Pick<RabItem, 'productName' | 'unit' | 'quantity' | 'priceExclTax' | 'priceInclTax' | 'priceModalExclTax' | 'priceModalInclTax' | 'stock' | 'productUrl' | 'distributor'>
type RabDraft = RabEdit & { id?: string }
type RabDocumentFees = Pick<RabDocumentCalculationInput, 'cashback' | 'ongkir' | 'platformFeePadiManual'>
type WorkspaceData = { requests: PriceRequest[]; rab: RabItem[] }

const storageKey = 'kawan-product-workspace'
const emptyWorkspace: WorkspaceData = { requests: [], rab: [] }
const money = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value)
const percentage = (value: number) => `${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(value)}%`
const rabModalInclTax = (item: RabItem | RabDraft) => item.priceModalInclTax ?? 0
const rabLine = (item: RabItem | RabDraft) => calculateRabLine({
  quantity: item.quantity,
  salePriceInclPpn: item.priceInclTax,
  modalPriceInclPpn: rabModalInclTax(item),
})
const rabSaleExclTax = (item: RabItem | RabDraft) => rabLine(item).saleUnitExclPpn
const rabModalExclTax = (item: RabItem | RabDraft) => rabLine(item).modalUnitExclPpn
const rabMargin = (item: RabItem | RabDraft) => rabLine(item).totalMargin
const rabMarginUnit = (item: RabItem | RabDraft) => rabLine(item).marginUnit
const rabMarginPercentage = (item: RabItem | RabDraft) => rabLine(item).marginPercentage
const dateLabel = (value: string) => new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value))
const dateTimeLabel = (value?: string) => value ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Belum diterima'
function requestAgeDays(value: string) {
  const createdAt = new Date(value)
  if (Number.isNaN(createdAt.getTime())) return null
  const createdDay = new Date(createdAt.getFullYear(), createdAt.getMonth(), createdAt.getDate()).getTime()
  const today = new Date()
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  return Math.max(0, Math.floor((todayStart - createdDay) / 86400000))
}
function requestAcceptedAt(request: PriceRequest, rabItems: RabItem[]) {
  return request.acceptedAt ?? rabItems
    .filter((item) => item.requestId === request.id)
    .map((item) => item.createdAt)
    .sort()[0]
}
const dateSearchLabels = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.toLocaleLowerCase('id')
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = String(date.getFullYear())
  return [
    value,
    dateLabel(value),
    new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(date),
    `${day}/${month}/${year}`,
    `${day}-${month}-${year}`,
  ].join(' ').toLocaleLowerCase('id')
}
const stockLabel = (value: RabItem['stock']): StockStatus => typeof value === 'number' ? value > 0 ? 'Ready' : 'Kosong' : value
const requestIsPending = (status: RequestStatus) => status === 'Request Harga' || status === 'Menunggu Product'
const requestStatusLabel = (status: RequestStatus) => status === 'Menunggu Product' ? 'Request Harga' : status
function nextRabNumber(type: 'B2B' | 'B2G', createdAt: string, existing: RabItem[]) {
  const date = new Date(createdAt)
  const dateCode = `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getFullYear()).slice(-2)}`
  const prefix = `${type}/`
  const next = existing.reduce((maximum, item) => {
    const match = item.number?.match(new RegExp(`^${prefix}(\\d+)-${dateCode}$`))
    return match ? Math.max(maximum, Number(match[1])) : maximum
  }, 0) + 1
  return `${type}/${String(next).padStart(3, '0')}-${dateCode}`
}
function formatRabNumber(value: string) {
  const legacy = value.match(/^(B2B|B2G)\/(\d+)\/(\d{2})(\d{2})(\d{2})$/)
  return legacy ? `${legacy[1]}/${legacy[2].padStart(3, '0')}-${legacy[3]}-${legacy[4]}-${legacy[5]}` : value
}
function rabDocumentKey(item: RabItem) {
  const type = item.businessType ?? (item.number?.startsWith('B2G/') ? 'B2G' : 'B2B')
  return `${type}:${item.requestId || item.id}`
}
function rabNumbersByDocument(items: RabItem[]) {
  const documents = new Map<string, RabItem[]>()
  items.forEach((item) => documents.set(rabDocumentKey(item), [...(documents.get(rabDocumentKey(item)) ?? []), item]))
  const assigned: RabItem[] = []
  const numbers = new Map<string, string>()
  for (const [key, documentItems] of [...documents.entries()].sort((left, right) => left[1][0].createdAt.localeCompare(right[1][0].createdAt))) {
    const firstItem = documentItems[0]
    const type = firstItem.businessType ?? (firstItem.number?.startsWith('B2G/') ? 'B2G' : 'B2B')
    const number = documentItems.find((item) => item.number)?.number ?? nextRabNumber(type, firstItem.createdAt, assigned)
    numbers.set(key, formatRabNumber(number))
    assigned.push(...documentItems.map((item) => ({ ...item, number, businessType: type })))
  }
  return numbers
}
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character)
const errorMessage = (error: unknown) => error instanceof Error
  ? error.message
  : error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
    ? error.message
    : 'Kesalahan tidak diketahui.'
const belongsToUser = (ownerEmail: string | undefined, userEmail: string) => typeof ownerEmail === 'string'
  && ownerEmail.toLowerCase() === userEmail.toLowerCase()

function readWorkspace(): WorkspaceData {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as Partial<WorkspaceData> | null
    return { requests: parsed?.requests ?? [], rab: parsed?.rab ?? [] }
  } catch {
    return emptyWorkspace
  }
}

export function ProductWorkspace({ userName, userEmail, userRole, page, onNavigate }: { userName: string; userEmail: string; userRole: WorkspaceRole; page: WorkspacePage; onNavigate?: (page: 'Request Harga' | 'Partnership') => void }) {
  const [data, setData] = useState(readWorkspace)
  const [workspaceReady, setWorkspaceReady] = useState(false)
  const [syncError, setSyncError] = useState('')
  const [showRequestForm, setShowRequestForm] = useState(false)
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null)
  const [editingRabId, setEditingRabId] = useState<string | null>(null)
  const [rabEdit, setRabEdit] = useState<RabEdit>({ productName: '', unit: 'pcs', quantity: 1, priceExclTax: 0, priceInclTax: 0, priceModalExclTax: 0, priceModalInclTax: 0, stock: 'Ready', productUrl: '', distributor: '' })
  const [reviewNote, setReviewNote] = useState('')
  const [requestForm, setRequestForm] = useState({ customerName: userName, partnership: '', products: [{ id: crypto.randomUUID(), productName: '', quantity: 1 }] as PriceRequestProduct[], description: '', file: null as File | null })
  const [rabForm, setRabForm] = useState<RabDraft[]>([{ productName: '', unit: 'pcs', quantity: 1, priceExclTax: 0, priceInclTax: 0, priceModalExclTax: 0, priceModalInclTax: 0, stock: 'Ready', productUrl: '', distributor: '' }])
  const [rabBusinessType, setRabBusinessType] = useState<'B2B' | 'B2G'>('B2B')
  const [rabFees, setRabFees] = useState<RabDocumentFees>({ cashback: 0, ongkir: 0, platformFeePadiManual: 0 })
  const [rabMonth, setRabMonth] = useState('')
  const [rabSearch, setRabSearch] = useState('')
  const [rabView, setRabView] = useState<'active' | 'archive' | 'trash'>('active')
  const [deletingRabIds, setDeletingRabIds] = useState<Set<string>>(() => new Set())
  const isProduct = userRole === 'product' || userRole === 'admin' || userRole === 'super-admin'
  const selectedRequest = data.requests.find((item) => item.id === selectedRequestId) ?? null
  const rabFormCalculation = calculateRabDocument({
    transactionType: rabBusinessType,
    items: rabForm.map((item) => ({
      quantity: item.quantity,
      salePriceInclPpn: item.priceInclTax,
      modalPriceInclPpn: rabModalInclTax(item),
    })),
    ...rabFees,
  })
  const visibleRequests = data.requests.filter((item) => isProduct || belongsToUser(item.ownerEmail, userEmail))
  const visibleRab = data.rab.filter((item) => isProduct || belongsToUser(item.ownerEmail, userEmail))
  const rabDocuments = [...visibleRab.reduce((groups, item) => {
    const key = rabDocumentKey(item)
    groups.set(key, [...(groups.get(key) ?? []), item])
    return groups
  }, new Map<string, RabItem[]>()).values()]
    .map((items) => ({ items, createdAt: items[0].createdAt, key: rabDocumentKey(items[0]) }))
    .filter((document) => {
      const archived = Boolean(document.items[0].archivedAt)
      const trashed = Boolean(document.items[0].trashedAt)
      if (rabView === 'active' && (archived || trashed)) return false
      if (rabView === 'archive' && (!archived || trashed)) return false
      if (rabView === 'trash' && !trashed) return false
      const date = new Date(document.createdAt)
      const monthMatches = !rabMonth || (!Number.isNaN(date.getTime()) && `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` === rabMonth)
      const search = rabSearch.trim().toLocaleLowerCase('id')
      const searchMatches = !search || document.items.some((item) => {
        const request = data.requests.find((candidate) => candidate.id === item.requestId)
        return `${dateSearchLabels(item.createdAt)} ${item.number ?? ''} ${item.productName} ${item.ownerName} ${request?.customerName ?? ''} ${request?.partnership ?? ''}`.toLocaleLowerCase('id').includes(search)
      })
      return monthMatches && searchMatches
    })
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  const filteredRab = rabDocuments.flatMap((document) => document.items)
  const rabRowNumbers = new Map(filteredRab.map((item, index) => [item.id, index + 1]))
  const rabSubtotalItems = filteredRab.map((item) => rabLine(item))
  const rabOverallSubtotal = {
    saleInclPpn: filteredRab.reduce((total, item) => total + item.quantity * item.priceInclTax, 0),
    modalInclPpn: filteredRab.reduce((total, item) => total + item.quantity * rabModalInclTax(item), 0),
    saleExclPpn: rabSubtotalItems.reduce((total, line) => total + line.saleTotalExclPpn, 0),
    modalExclPpn: rabSubtotalItems.reduce((total, line) => total + line.modalTotalExclPpn, 0),
    margin: rabSubtotalItems.reduce((total, line) => total + line.totalMargin, 0),
  }
  const rabOverallMarginPercentage = rabOverallSubtotal.saleExclPpn > 0
    ? rabOverallSubtotal.margin / rabOverallSubtotal.saleExclPpn * 100
    : 0
  const rabByOwner = useMemo(() => {
    const groups = new Map<string, RabItem[]>()
    visibleRab.filter((item) => !item.archivedAt && !item.trashedAt).forEach((item) => {
      const ownerKey = item.ownerEmail.trim().toLowerCase() || item.ownerName.trim().toLowerCase()
      groups.set(ownerKey, [...(groups.get(ownerKey) ?? []), item])
    })
    return [...groups.entries()]
      .map(([key, items]) => ({ key, ownerName: items[0].ownerName, items }))
      .sort((a, b) => a.ownerName.localeCompare(b.ownerName, 'id'))
  }, [visibleRab])
  const partnerships = useMemo(() => {
    const companies = new Map<string, { name: string; requests: number; latest: string }>()
    visibleRequests.forEach((item) => {
      const partnership = typeof item.partnership === 'string' ? item.partnership.trim() : ''
      if (!partnership) return
      const existing = companies.get(partnership)
      if (!existing || existing.latest < item.createdAt) companies.set(partnership, { name: partnership, requests: (existing?.requests ?? 0) + 1, latest: item.createdAt })
      else existing.requests += 1
    })
    return [...companies.values()].sort((a, b) => b.latest.localeCompare(a.latest))
  }, [visibleRequests])
  const notifications = useMemo(() => {
    if (isProduct) return data.requests.filter((item) => requestIsPending(item.status))
    return visibleRequests.filter((item) => !requestIsPending(item.status))
  }, [data.requests, isProduct, visibleRequests])

  useEffect(() => {
    let active = true
    void loadWorkspaceRows(['product-requests', 'rab']).then(async (rows) => {
      if (!active) return
      const requests = rows.filter((row) => row.module === 'product-requests').map((row) => row.payload as PriceRequest)
      const rab = rows.filter((row) => row.module === 'rab').map((row) => row.payload as RabItem)
      const local = readWorkspace()
      const requestIds = new Set(requests.map((item) => item.id))
      const rabIds = new Set(rab.map((item) => item.id))
      const merged = {
        requests: [...requests, ...local.requests.filter((item) => !requestIds.has(item.id))],
        rab: [...rab, ...local.rab.filter((item) => !rabIds.has(item.id))],
      }
      setData(merged)
      setWorkspaceReady(true)
    }).catch((error: unknown) => {
      if (!active) return
      console.error('Gagal memuat data Request Harga/RAB dari server lokal:', error)
      setSyncError(`Gagal memuat data dari database lokal: ${errorMessage(error)}`)
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(data))
    } catch (error) {
      console.error('Gagal menyimpan workspace Product di browser:', error)
      window.alert('Data tidak dapat disimpan. Ruang penyimpanan browser mungkin penuh.')
    }
  }, [data])

  useEffect(() => {
    if (!workspaceReady) return
    let active = true
    const requestsToSync = userRole === 'sales'
      ? data.requests.filter((request) => belongsToUser(request.ownerEmail, userEmail))
      : data.requests
    const rabToSync = (userRole === 'sales'
      ? data.rab.filter((item) => belongsToUser(item.ownerEmail, userEmail))
      : data.rab).filter((item) => !deletingRabIds.has(item.id))
    void Promise.all([
      ...requestsToSync.map((request) => saveWorkspaceRow({
        module: 'product-requests',
        record_id: request.id,
        owner_email: request.ownerEmail,
        target_team: 'product',
        payload: request,
      })),
      ...rabToSync.map((item) => saveWorkspaceRow({
        module: 'rab',
        record_id: item.id,
        owner_email: item.ownerEmail,
        target_team: null,
        payload: item,
      })),
    ]).then(() => {
      if (active) setSyncError('')
    }).catch((error: unknown) => {
      if (!active) return
      const message = errorMessage(error)
      console.error('Gagal menyimpan data Request Harga/RAB ke database lokal:', error)
      setSyncError(`Gagal menyinkronkan Request Harga/RAB: ${message}`)
    })
    return () => { active = false }
  }, [data, deletingRabIds, userEmail, userRole, workspaceReady])
  useEffect(() => {
    const syncData = (event: StorageEvent) => { if (event.key === storageKey) setData(readWorkspace()) }
    window.addEventListener('storage', syncData)
    return () => window.removeEventListener('storage', syncData)
  }, [])

  function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const file = requestForm.file
    if (!requestForm.products.length || requestForm.products.some((item) => !item.productName.trim() || !Number.isFinite(item.quantity) || item.quantity < 1)) return
    if (file && file.size > 1024 * 1024) {
      window.alert('Ukuran lampiran maksimal 1 MB agar dapat tersimpan di browser.')
      return
    }
    const create = (attachmentUrl = '') => {
      const createdAt = new Date().toISOString()
      const request: PriceRequest = {
        id: `request-${crypto.randomUUID()}`,
        customerName: requestForm.customerName.trim(),
        partnership: requestForm.partnership.trim(),
        productName: requestForm.products[0].productName.trim(),
        description: requestForm.description.trim(),
        quantity: requestForm.products[0].quantity,
        products: requestForm.products.map((item) => ({ ...item, productName: item.productName.trim() })),
        ownerName: userName,
        ownerEmail: userEmail,
        status: 'Request Harga',
        reviewNote: '',
        attachmentName: file?.name ?? '',
        attachmentUrl,
        createdAt,
      }
      const trackedOrders: DeliveryItem[] = request.products!.map((product) => ({
        id: `request-${request.id}-${product.id}`,
        sourceRequestId: request.id,
        customer: request.customerName,
        partnership: request.partnership,
        sales: request.ownerName,
        ownerEmail: request.ownerEmail,
        detail: product.productName,
        qty: product.quantity,
        pickedUp: false,
        shipped: false,
        status: 'Request Harga',
        requestAttachmentName: request.attachmentName,
        requestAttachmentUrl: request.attachmentUrl,
        origin: 'Gudang Kawan Utama',
        destination: request.customerName,
        createdAt,
        updatedAt: createdAt,
        timeline: [{ team: 'Sales', person: userName, message: 'Pesanan dibuat dan dikirim ke Product.', at: createdAt }],
      }))
      setData((current) => ({ ...current, requests: [request, ...current.requests] }))
      try {
        const currentOrders = JSON.parse(localStorage.getItem(deliveryStorageKey) ?? '[]') as DeliveryItem[]
        if (!Array.isArray(currentOrders)) throw new Error('Format data tracking tidak valid.')
        const trackedIds = new Set(trackedOrders.map((item) => item.id))
        localStorage.setItem(deliveryStorageKey, JSON.stringify([...trackedOrders, ...currentOrders.filter((item) => !trackedIds.has(item.id))]))
      } catch (error) {
        console.error('Gagal menyimpan tracking pesanan:', error)
        setSyncError('Request tersimpan, tetapi tracking pesanan gagal disimpan di browser.')
      }
      void Promise.all(trackedOrders.map((trackedOrder) => saveWorkspaceRow({ module: 'delivery', record_id: trackedOrder.id, owner_email: request.ownerEmail, target_team: 'product', payload: trackedOrder }))).catch((error: unknown) => {
        console.error('Gagal membuat tracking pesanan di database lokal:', error)
        setSyncError(`Request tersimpan, tetapi tracking pesanan gagal disinkronkan: ${errorMessage(error)}`)
      })
      setSelectedRequestId(request.id)
      setShowRequestForm(false)
      setRequestForm({ customerName: userName, partnership: '', products: [{ id: crypto.randomUUID(), productName: '', quantity: 1 }], description: '', file: null })
    }
    if (!file) {
      create()
      return
    }
    const reader = new FileReader()
    reader.onload = () => create(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => window.alert('Lampiran gagal dibaca. Coba pilih file lain.')
    reader.readAsDataURL(file)
  }

  async function createRab(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedRequest || !isProduct || ![rabFees.cashback, rabFees.ongkir, rabFees.platformFeePadiManual].every((value) => value !== undefined && Number.isFinite(value) && value >= 0) || rabForm.some((item) => !item.productName.trim() || ![item.quantity, item.priceInclTax, rabModalInclTax(item)].every(Number.isFinite) || item.quantity < 1 || item.priceInclTax < 0 || rabModalInclTax(item) < 0)) return
    const now = new Date().toISOString()
    const existingItems = data.rab.filter((item) => item.requestId === selectedRequest.id)
    const previousBusinessType = existingItems[0]?.businessType ?? (existingItems[0]?.number?.startsWith('B2G/') ? 'B2G' : existingItems[0]?.number?.startsWith('B2B/') ? 'B2B' : undefined)
    const businessType = rabBusinessType
    let documentNumber = previousBusinessType === businessType ? existingItems[0]?.number : undefined
    if (!documentNumber) {
      try {
        const nextNumber = await localApi.nextRabNumber(rabBusinessType, now.slice(0, 10))
        documentNumber = nextNumber.number
      } catch (error) {
        setSyncError(`Nomor RAB server belum tersedia; memakai nomor lokal sementara. ${errorMessage(error)}`)
      }
    }
    documentNumber ??= nextRabNumber(rabBusinessType, now, data.rab)
    const rabItems: RabItem[] = rabForm.map((draft) => {
      const existing = draft.id ? existingItems.find((item) => item.id === draft.id) : undefined
      return {
        ...draft,
        id: draft.id ?? `rab-${crypto.randomUUID()}`,
        requestId: selectedRequest.id,
        productName: draft.productName.trim(),
        priceExclTax: rabSaleExclTax(draft),
        priceModalExclTax: rabModalExclTax(draft),
        unit: draft.unit?.trim() || 'pcs',
        productUrl: draft.productUrl.trim(),
        distributor: draft.distributor?.trim() ?? '',
        businessType,
        number: documentNumber,
        archivedAt: undefined,
        trashedAt: undefined,
        cashback: rabFees.cashback ?? 0,
        ongkir: rabFees.ongkir ?? 0,
        platformFeePadiManual: rabFees.platformFeePadiManual ?? 0,
        ownerName: selectedRequest.ownerName,
        ownerEmail: selectedRequest.ownerEmail,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      }
    })
    setData((current) => ({
      requests: current.requests.map((item) => item.id === selectedRequest.id ? { ...item, status: 'RAB tersedia', acceptedAt: item.acceptedAt ?? now, reviewNote: '' } : item),
      rab: [...rabItems, ...current.rab.filter((item) => item.requestId !== selectedRequest.id)],
    }))
    try {
      const orders = JSON.parse(localStorage.getItem(deliveryStorageKey) ?? '[]') as DeliveryItem[]
      const updatedOrders = orders.map((order) => order.sourceRequestId === selectedRequest.id ? { ...order, status: 'RAB' as const, updatedAt: now } : order)
      localStorage.setItem(deliveryStorageKey, JSON.stringify(updatedOrders))
      void Promise.all(updatedOrders.filter((order) => order.sourceRequestId === selectedRequest.id).map((order) => saveWorkspaceRow({ module: 'delivery', record_id: order.id, owner_email: order.ownerEmail ?? userEmail, target_team: null, payload: order }))).catch((error: unknown) => setSyncError(`RAB tersimpan, tetapi tracking gagal diperbarui: ${errorMessage(error)}`))
    } catch (error) {
      console.error('Gagal memperbarui status tracking setelah membuat RAB:', error)
      setSyncError('RAB tersimpan, tetapi status tracking gagal diperbarui.')
    }
    setRabForm(rabItems.map((item) => ({ ...item, stock: stockLabel(item.stock) })))
  }

  function updateRabDraft(index: number, changes: Partial<RabDraft>) {
    setRabForm((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item))
  }

  function saveRabChanges(item: RabItem) {
    const { quantity, priceExclTax, priceInclTax, stock } = rabEdit
    if (![quantity, priceInclTax, rabModalInclTax(rabEdit)].every(Number.isFinite) || quantity < 1 || priceInclTax < 0 || rabModalInclTax(rabEdit) < 0 || (isProduct && !rabEdit.productName.trim())) return
    const allowedChanges = isProduct
      ? rabEdit
      : { quantity, priceExclTax, priceInclTax, stock }
    setData((current) => ({ ...current, rab: current.rab.map((row) => row.id === item.id ? { ...row, ...allowedChanges, priceExclTax: rabSaleExclTax(rabEdit), priceModalExclTax: rabModalExclTax(rabEdit), updatedAt: new Date().toISOString() } : row) }))
    setEditingRabId(null)
  }

  function updateRabDocument(items: RabItem[], changes: Partial<Pick<RabItem, 'archivedAt' | 'trashedAt'>>) {
    const itemIds = new Set(items.map((item) => item.id))
    setData((current) => ({
      ...current,
      rab: current.rab.map((item) => itemIds.has(item.id) ? { ...item, ...changes, updatedAt: new Date().toISOString() } : item),
    }))
  }

  function archiveRabDocument(items: RabItem[]) {
    const archivedAt = new Date().toISOString()
    updateRabDocument(items, { archivedAt, trashedAt: undefined })
  }

  function moveRabDocumentToTrash(items: RabItem[]) {
    updateRabDocument(items, { trashedAt: new Date().toISOString() })
  }

  function restoreRabDocument(items: RabItem[]) {
    updateRabDocument(items, { archivedAt: undefined, trashedAt: undefined })
  }

  async function permanentlyDeleteRabDocument(items: RabItem[]) {
    const documentName = items[0]?.number ?? items[0]?.productName ?? 'RAB ini'
    if (!window.confirm(`Hapus permanen ${documentName}? Tindakan ini tidak dapat dibatalkan.`)) return

    const itemIds = new Set(items.map((item) => item.id))
    const deletedIds = new Set<string>()
    setDeletingRabIds((current) => new Set([...current, ...itemIds]))
    for (const item of items) {
      try {
        await deleteWorkspaceRow('rab', item.id)
        deletedIds.add(item.id)
      } catch (error) {
        console.error(`Gagal menghapus permanen item RAB ${item.id}:`, error)
        setSyncError(`Penghapusan permanen berhenti setelah ${deletedIds.size} dari ${items.length} item. ${errorMessage(error)}`)
        break
      }
    }
    setData((current) => ({ ...current, rab: current.rab.filter((item) => !deletedIds.has(item.id)) }))
    setDeletingRabIds((current) => new Set([...current].filter((id) => !itemIds.has(id))))
    if (deletedIds.size === items.length) setSyncError('')
  }

  function updateRequestStatus(status: RequestStatus) {
    if (!selectedRequest || !isProduct) return
    setData((current) => ({ ...current, requests: current.requests.map((item) => item.id === selectedRequest.id ? { ...item, status, reviewNote: reviewNote.trim() } : item) }))
    setReviewNote('')
  }

  function printRab(items: RabItem[]) {
    const printWindow = window.open('', '_blank', 'width=900,height=700')
    if (!printWindow) {
      window.alert('Izinkan pop-up browser untuk mencetak atau menyimpan RAB sebagai PDF.')
      return
    }

    const ownerName = escapeHtml(items[0].ownerName)
    const documentItemsByKey = new Map<string, RabItem[]>()
    items.forEach((item) => documentItemsByKey.set(rabDocumentKey(item), [...(documentItemsByKey.get(rabDocumentKey(item)) ?? []), item]))
    const documentGroups = [...documentItemsByKey.entries()]
    const rabNumbers = rabNumbersByDocument(data.rab)
    const singleItemType = items[0].businessType ?? (items[0].number?.startsWith('B2G/') ? 'B2G' : 'B2B')
    const singleDocumentNumber = rabNumbers.get(rabDocumentKey(items[0]))
      ?? formatRabNumber(items[0].number ?? nextRabNumber(singleItemType, items[0].createdAt, data.rab))
    const rabNumber = documentGroups.length === 1 ? singleDocumentNumber : `REKAP RAB · ${new Date().toLocaleDateString('id-ID')}`
    const latestItem = items.reduce((latest, item) => item.createdAt > latest.createdAt ? item : latest, items[0])
    const latestDocumentNumber = rabNumbers.get(rabDocumentKey(latestItem))
      ?? formatRabNumber(latestItem.number ?? nextRabNumber(latestItem.businessType ?? 'B2B', latestItem.createdAt, data.rab))
    const documentCodesHtml = documentGroups.length > 1 ? `<section class="doc-codes"><span>Nomor RAB terbaru</span><strong>${escapeHtml(latestDocumentNumber)}</strong></section>` : ''
    const isSingleRab = documentGroups.length === 1
    const request = isSingleRab ? data.requests.find((candidate) => candidate.id === items[0].requestId) : null
    const documentTitle = isSingleRab ? 'Rencana Anggaran Biaya' : 'Rekap Rencana Anggaran Biaya'
    const documentSubtitle = request
      ? `Rincian anggaran untuk ${escapeHtml(request.customerName)} · ${escapeHtml(request.partnership)}`
      : isSingleRab
        ? `Rincian anggaran: ${escapeHtml(items[0].productName)}`
        : `Seluruh RAB milik ${ownerName}`
    const exportSubtotal = {
      saleInclPpn: items.reduce((total, item) => total + item.quantity * item.priceInclTax, 0),
      modalInclPpn: items.reduce((total, item) => total + item.quantity * rabModalInclTax(item), 0),
      saleExclPpn: items.reduce((total, item) => total + rabLine(item).saleTotalExclPpn, 0),
      modalExclPpn: items.reduce((total, item) => total + rabLine(item).modalTotalExclPpn, 0),
      margin: items.reduce((total, item) => total + rabLine(item).totalMargin, 0),
    }
    const exportMarginPercentage = exportSubtotal.saleExclPpn > 0
      ? exportSubtotal.margin / exportSubtotal.saleExclPpn * 100
      : 0
    const exportSubtotalRow = `<tr class="subtotal-row"><td></td><td colspan="2"></td><td></td><td></td><td class="num">${money(exportSubtotal.saleInclPpn)}</td>${isProduct ? `<td></td><td class="num">${money(exportSubtotal.modalInclPpn)}</td>` : ''}<td></td><td class="num">${money(exportSubtotal.saleExclPpn)}</td>${isProduct ? `<td></td><td class="num">${money(exportSubtotal.modalExclPpn)}</td><td></td><td class="num">${money(exportSubtotal.margin)}</td><td class="num">${percentage(exportMarginPercentage)}</td>` : ''}<td colspan="3"></td></tr>`
    let pdfRowNumber = 0
    const rows = documentGroups.map(([, documentItems]) => {
      const detailRows = documentItems.map((item) => {
        pdfRowNumber += 1
        const request = data.requests.find((candidate) => candidate.id === item.requestId)
        const customerName = escapeHtml(request?.customerName || item.ownerName)
        const productName = escapeHtml(item.productName)
        const line = rabLine(item)
        const totalSaleExclTax = line.saleTotalExclPpn
        const totalSaleInclTax = item.quantity * item.priceInclTax
        const totalItemModalExclTax = line.modalTotalExclPpn
        const totalItemModalInclTax = item.quantity * rabModalInclTax(item)
        const link = item.productUrl ? `<a href="${escapeHtml(item.productUrl)}">Buka</a>` : '—'
        const age = requestAgeDays(item.createdAt)
        const includeCostCells = isProduct ? `<td class="num tax-cell">${money(rabModalInclTax(item))}</td><td class="num tax-cell">${money(totalItemModalInclTax)}</td>` : ''
        const excludeCostCells = isProduct ? `<td class="num tax-cell">${money(rabModalExclTax(item))}</td><td class="num tax-cell">${money(totalItemModalExclTax)}</td>` : ''
        const marginCells = isProduct ? `<td class="num">${money(line.marginUnit)}</td><td class="num">${money(line.totalMargin)}</td><td class="num">${percentage(line.marginPercentage)}</td>` : ''
        return `<tr><td>${pdfRowNumber}</td><td><strong>${customerName}</strong><div class="age">${age === null ? '—' : `${age} hari`}</div></td><td class="offer-cell"><strong>${productName}</strong></td><td class="qty">${item.quantity}</td><td class="num">${money(item.priceInclTax)}</td><td class="num">${money(totalSaleInclTax)}</td>${includeCostCells}<td class="num">${money(line.saleUnitExclPpn)}</td><td class="num">${money(totalSaleExclTax)}</td>${excludeCostCells}${marginCells}<td>${stockLabel(item.stock)}</td><td>${link}</td><td>${escapeHtml(item.distributor || '—')}</td></tr>`
      }).join('')
      return detailRows
    }).join('') + exportSubtotalRow

    const internalHeaders = isProduct
      ? '<th rowspan="2">Margin</th><th rowspan="2">Total Margin</th><th rowspan="2">Persentase Margin</th>'
      : ''
    const includeHeaderSpan = isProduct ? 4 : 2
    const excludeHeaderSpan = isProduct ? 4 : 2
    const exportColumnWidths = isProduct
      ? ['4%', '9%', '12%', '4%', ...Array(8).fill('5%'), '5%', '5%', '5%', '5%', '5%', '6%']
      : ['4%', '10%', '25%', '5%', ...Array(4).fill('8%'), '8%', '8%', '8%']
    const exportColumnGroup = `<colgroup>${exportColumnWidths.map((width) => `<col style="width:${width}">`).join('')}</colgroup>`
    printWindow.document.write(`<!doctype html><html lang="id"><head><meta charset="utf-8"><title>${rabNumber} - ${ownerName}</title><style>
      *{box-sizing:border-box}body{font:9px Arial,sans-serif;color:#202c3d;margin:0;padding:28px}header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:18px;border-bottom:3px solid #173a63}header strong{color:#173a63;font-size:17px;letter-spacing:1px}header span{color:#687b8e;font-size:12px}h1{margin:28px 0 5px;color:#173a63;font-size:24px}.subtitle{margin:0 0 22px;color:#718096}.meta{display:grid;grid-template-columns:1fr 1fr;gap:12px 28px;padding:15px;border:1px solid #dfe7f0;background:#f8fbff}.meta div{display:grid;gap:4px}.meta span{color:#718096;font-size:10px;text-transform:uppercase}.meta strong{font-size:12px}.doc-codes{display:grid;gap:5px;margin-top:14px;padding:11px 14px;border-left:3px solid #397aca;background:#f4f8fd}.doc-codes span{color:#718096;font-size:9px;text-transform:uppercase}.doc-codes strong{color:#173a63;font-size:11px;line-height:1.5;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;margin-top:22px}th,td{padding:5px 3px;border:1px solid #dfe7f0;text-align:left;vertical-align:top}th{background:#f0f6fd;color:#173a63;font-size:7px;text-transform:uppercase}td{font-size:7px}td.num,th.num{text-align:right;white-space:nowrap}.sign{margin:48px 10px 0 0;text-align:right;line-height:1.5}.print-hint{margin-top:24px;color:#8996a3;font-size:10px}@media print{@page{size:landscape;margin:10mm}body{padding:0}.print-hint{display:none}}
    </style></head><body><header><strong>KAWAN UTAMA DIGITAL</strong><span>${escapeHtml(rabNumber)}</span></header><h1>${documentTitle}</h1><p class="subtitle">${documentSubtitle}</p><section class="meta"><div><span>Nama user</span><strong>${ownerName}</strong></div><div><span>Jumlah RAB</span><strong>${items.length} item</strong></div><div><span>Tanggal ekspor</span><strong>${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</strong></div></section>${documentCodesHtml}<table>${exportColumnGroup}<thead><tr><th rowspan="2">No</th><th rowspan="2">PIC + Umur RAB</th><th rowspan="2">Penawaran Produk</th><th rowspan="2">Qty</th><th class="tax-group tax-incl" colspan="${includeHeaderSpan}">Include PPN</th><th class="tax-group tax-excl" colspan="${excludeHeaderSpan}">Exclude PPN</th>${internalHeaders}<th rowspan="2">Indent</th><th rowspan="2">Link</th><th rowspan="2">Disti</th></tr><tr><th class="tax-incl">Harga jual</th><th class="tax-incl ${isProduct ? '' : 'tax-incl-end'}">Total jual</th>${isProduct ? '<th class="tax-incl">Harga modal</th><th class="tax-incl tax-incl-end">Total modal</th>' : ''}<th class="tax-excl">Harga jual</th><th class="tax-excl ${isProduct ? '' : 'tax-excl-end'}">Total jual</th>${isProduct ? '<th class="tax-excl">Harga modal</th><th class="tax-excl tax-excl-end">Total modal</th>' : ''}</tr></thead><tbody>${rows}</tbody></table><div class="sign">Hormat kami,<br><br><br><strong>${ownerName}</strong><br>Kawan Utama Digital</div><p class="print-hint">Pilih “Save as PDF” pada dialog cetak untuk menyimpan dokumen ini.</p></body></html>`)
    printWindow.document.close()
    const printStyle = printWindow.document.createElement('style')
    printStyle.textContent = `table{table-layout:fixed;border-collapse:collapse;width:100%}th,td{padding:5px 4px;line-height:1.35;border:1px solid #d5e0eb;vertical-align:middle;overflow-wrap:anywhere}th{background:#f0f6fd;color:#173a63;font-size:7px;text-align:left}th.tax-group{text-align:center}.num{white-space:nowrap;text-align:right}td{font-size:7px}td.num{font-size:6.5px}th:nth-child(4),td:nth-child(4),.qty{text-align:center;white-space:nowrap}.offer-cell{white-space:normal;overflow-wrap:anywhere;word-break:normal;line-height:1.4}.age{margin-top:4px;color:#718096;font-size:7px}.subtotal-row td{background:#f0f6fd;font-weight:700;color:#173a63}.summary-row td{padding:0}.rab-summary{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:6px;padding:8px;background:#f8fbff}.rab-summary span{display:grid;gap:3px;color:#718096;font-size:6px}.rab-summary strong{color:#173a63;font-size:7px}@media print{.rab-summary{grid-template-columns:repeat(6,minmax(0,1fr))}}`
    printWindow.document.head.append(printStyle)
    printWindow.focus()
    printWindow.print()
  }

  const pageTitle: Record<WorkspacePage, string> = { Dashboard: 'Ringkasan kebutuhan harga', Funnel: 'Funnel penjualan', 'Request Harga': 'Request harga dari Sales', Partnership: 'Daftar partnership', RAB: 'RAB penjualan' }
  const openRequest = (request: PriceRequest) => {
    const existingItems = data.rab.filter((item) => item.requestId === request.id)
    const documentFees = existingItems[0]
    setSelectedRequestId(request.id)
    setRabBusinessType(existingItems[0]?.businessType ?? 'B2B')
    setRabFees({
      cashback: documentFees?.cashback ?? 0,
      ongkir: documentFees?.ongkir ?? 0,
      platformFeePadiManual: documentFees?.platformFeePadiManual ?? 0,
    })
    setRabForm(existingItems.length
      ? existingItems.map((item) => ({ ...item, unit: item.unit ?? 'pcs', priceModalExclTax: rabModalExclTax(item), priceModalInclTax: rabModalInclTax(item), stock: stockLabel(item.stock), distributor: item.distributor ?? '' }))
      : (request.products ?? [{ id: crypto.randomUUID(), productName: request.productName, quantity: request.quantity }]).map((product) => ({ productName: product.productName, unit: 'pcs', quantity: product.quantity, priceExclTax: 0, priceInclTax: 0, priceModalExclTax: 0, priceModalInclTax: 0, stock: 'Ready' as StockStatus, productUrl: '', distributor: '' })))
  }

  return <section className="product-workspace dashboard-content">
    <div className="settings-header">
      <div><p className="eyebrow">{isProduct ? 'Product workspace' : 'Sales workspace'}</p><h1>{pageTitle[page]}.</h1><p className="muted">{isProduct ? 'Tinjau permintaan Sales dan siapkan harga, stok, serta informasi produk.' : 'Ajukan kebutuhan harga dan pantau RAB pelanggan.'}</p></div>
      <span className="access-note"><ShieldCheck size={17} /><span><strong>{isProduct ? 'Product access' : 'Sales access'}</strong><small>{isProduct ? 'Kelola data produk dan RAB' : page === 'Funnel' ? 'Edit opportunity dan pantau rekap pekan ini' : 'Edit RAB terbatas: qty dan harga jual'}</small></span></span>
    </div>
    {syncError && <p className="delivery-storage-warning" role="alert">{syncError} Data lokal tetap ada di perangkat ini.</p>}
    {!workspaceReady && <p className="muted" role="status">Memuat data Request Harga/RAB dari database...</p>}

    {page === 'Dashboard' && <div className="product-dashboard">
      {userRole === 'sales' && <SalesTargetProgress userEmail={userEmail} />}
      <div className="product-metrics">
        <button className="product-metric-button" type="button" onClick={() => onNavigate?.('Request Harga')}><span>Request harga</span><strong>{visibleRequests.length}</strong><small>{isProduct ? `${data.requests.filter((item) => requestIsPending(item.status)).length} menunggu ditinjau` : 'Buka daftar request'}</small></button>
        <div><span>RAB tersedia</span><strong>{visibleRab.length}</strong><small>Rincian harga penjualan</small></div>
      </div>
      {userRole === 'sales' && <SalesFunnelSheet ownerName={userName} ownerEmail={userEmail} readOnly />}
      <div className="product-dashboard-grid">
        <section className="product-panel"><div className="product-panel-heading"><span><FileText size={17} /><strong>Request harga terbaru</strong></span><small>{visibleRequests.length} request</small></div>
          {visibleRequests.slice(0, 3).map((item) => <button className="product-activity-row" key={item.id} onClick={() => openRequest(item)}><span className="product-activity-icon"><Package size={16} /></span><span><strong>{item.productName}</strong><small>{item.partnership} · {item.ownerName}</small></span><span className={`request-status ${item.status === 'RAB tersedia' ? 'ready' : item.status === 'Ditolak' ? 'rejected' : ''}`}>{requestStatusLabel(item.status)}</span></button>)}
          {!visibleRequests.length && <p className="product-empty">Belum ada request harga.</p>}
          {visibleRequests.length > 3 && <button className="product-see-more" type="button" onClick={() => onNavigate?.('Request Harga')}>Lihat lebih banyak <ArrowRight size={14} /></button>}
        </section>
        <section className="product-panel"><div className="product-panel-heading"><span><Bell size={17} /><strong>Notifikasi</strong></span><small>{notifications.length} terbaru</small></div>
          {notifications.slice(0, 3).map((item) => <button className="product-notification" key={item.id} onClick={() => openRequest(item)}><span className="notification-dot" /><span><strong>{isProduct ? 'Request baru perlu ditinjau' : item.status === 'RAB tersedia' ? 'RAB Anda sudah tersedia' : 'Request membutuhkan revisi'}</strong><small>{item.productName} · {dateLabel(item.createdAt)}</small>{item.reviewNote && <small>{item.reviewNote}</small>}</span></button>)}
          {!notifications.length && <p className="product-empty">Belum ada notifikasi baru.</p>}
          {notifications.length > 3 && <button className="product-see-more" type="button" onClick={() => onNavigate?.('Request Harga')}>Lihat lebih banyak <ArrowRight size={14} /></button>}
        </section>
      </div>
    </div>}

    {page === 'Funnel' && userRole === 'sales' && <SalesFunnelSheet ownerName={userName} ownerEmail={userEmail} weeklyView />}

    {page === 'Request Harga' && <div className="product-section">
      <div className="product-toolbar"><p className="muted">{isProduct ? 'Pilih permintaan untuk melihat detail dan memasukkan item ke RAB.' : 'Kirim detail kebutuhan produk dalam bentuk teks, gambar, atau dokumen.'}</p>{!isProduct && <button className="submit-button product-primary-button" onClick={() => { setRequestForm((current) => ({ ...current, customerName: userName })); setShowRequestForm(true) }}><Plus size={16} /> Buat request harga</button>}</div>
      <div className="product-request-layout">
        <div className="product-panel product-request-list">{visibleRequests.map((item) => <button className={`product-request-row ${selectedRequestId === item.id ? 'selected' : ''}`} key={item.id} onClick={() => openRequest(item)}><span className="product-activity-icon"><Package size={16} /></span><span><strong>{(item.products ?? [{ productName: item.productName }]).map((product) => product.productName).join(', ')}</strong><small>{item.partnership} · {item.ownerName}</small><small>Dibuat {dateTimeLabel(item.createdAt)} · {requestAgeDays(item.createdAt) ?? '—'} hari berjalan</small><small>Diterima {dateTimeLabel(requestAcceptedAt(item, data.rab))}</small></span><span className={`request-status ${item.status === 'RAB tersedia' ? 'ready' : item.status === 'Ditolak' ? 'rejected' : ''}`}>{requestStatusLabel(item.status)}</span></button>)}{!visibleRequests.length && <p className="product-empty">Belum ada request harga.</p>}</div>
        <div className="product-panel product-request-detail">{selectedRequest ? <><div className="product-detail-heading"><div><p className="eyebrow">{selectedRequest.id}</p><h2>{selectedRequest.partnership}</h2><p>PIC: {selectedRequest.customerName}</p></div><span className={`request-status ${selectedRequest.status === 'RAB tersedia' ? 'ready' : selectedRequest.status === 'Ditolak' ? 'rejected' : ''}`}>{requestStatusLabel(selectedRequest.status)}</span></div>
          <dl className="product-detail-meta"><div><dt>Nama user</dt><dd>{selectedRequest.ownerName}</dd></div><div><dt>Dibuat</dt><dd>{dateTimeLabel(selectedRequest.createdAt)}</dd></div><div><dt>Umur request</dt><dd>{requestAgeDays(selectedRequest.createdAt) ?? '—'} hari</dd></div><div><dt>Diterima</dt><dd>{dateTimeLabel(requestAcceptedAt(selectedRequest, data.rab))}</dd></div><div><dt>PIC</dt><dd>{selectedRequest.customerName}</dd></div><div><dt>Customer</dt><dd>{selectedRequest.partnership}</dd></div></dl>
          {(selectedRequest.products ?? [{ productName: selectedRequest.productName, quantity: selectedRequest.quantity }]).map((product, index) => <p className="product-request-description" key={`${product.productName}-${index}`}><strong>{product.productName}</strong> · {product.quantity} unit</p>)}
          {selectedRequest.description && <p className="product-request-description">{selectedRequest.description}</p>}
          {selectedRequest.attachmentUrl && <a className="product-attachment" href={selectedRequest.attachmentUrl} download={selectedRequest.attachmentName} target="_blank" rel="noreferrer"><FileImage size={17} /><span><strong>{selectedRequest.attachmentName}</strong><small>Lihat / unduh lampiran</small></span><ExternalLink size={15} /></a>}
          {selectedRequest.reviewNote && <p className="review-note"><strong>Catatan Product:</strong> {selectedRequest.reviewNote}</p>}
          {isProduct && <form className="product-rab-form" onSubmit={createRab}>
            <div className="product-rab-form-heading"><h3><Package size={17} /> {selectedRequest.status === 'RAB tersedia' ? 'Kelola RAB' : 'Input ke RAB'}</h3><small>{rabForm.length} jenis barang</small></div>
            {rabForm.map((item, index) => <fieldset className="product-rab-item" key={item.id ?? `new-${index}`}>
              <div className="product-rab-item-heading"><strong>Barang {index + 1}</strong>{rabForm.length > 1 && <button className="table-action subtle" type="button" onClick={() => setRabForm((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X size={14} /> Hapus</button>}</div>
              <div className="product-form-grid">
                <label>Nama produk<input required value={item.productName} onChange={(event) => updateRabDraft(index, { productName: event.target.value })} /></label>
                <label>Qty<input required type="number" min="1" step="1" value={item.quantity} onChange={(event) => updateRabDraft(index, { quantity: Number(event.target.value) })} /></label>
                <label>Harga jual (include PPN)<FormattedNumberInput required min={0} value={item.priceInclTax} onChange={(priceInclTax) => updateRabDraft(index, { priceInclTax })} /></label>
                <label>Harga modal (include PPN)<FormattedNumberInput required min={0} value={rabModalInclTax(item)} onChange={(priceModalInclTax) => updateRabDraft(index, { priceModalInclTax })} /></label>
                <label>Harga jual (exclude PPN, otomatis)<FormattedNumberInput min={0} value={rabSaleExclTax(item)} readOnly /></label>
                <label>Harga modal (exclude PPN, otomatis)<FormattedNumberInput min={0} value={rabModalExclTax(item)} readOnly /></label>
                <label>Indent<span className="rab-status-select" data-status={stockLabel(item.stock)}><select required value={stockLabel(item.stock)} onChange={(event) => updateRabDraft(index, { stock: event.target.value as StockStatus })}>{(['Ready', 'Limited', 'Indent', 'Kosong'] as StockStatus[]).map((status) => <option key={status}>{status}</option>)}</select><ChevronDown size={14} aria-hidden="true" /></span></label>
                <label>Disti<input value={item.distributor ?? ''} onChange={(event) => updateRabDraft(index, { distributor: event.target.value })} placeholder="Nama distributor" /></label>
                <label className="product-form-wide">Link produk<input type="url" value={item.productUrl} onChange={(event) => updateRabDraft(index, { productUrl: event.target.value })} placeholder="https://" /></label>
              </div>
              <div className="product-rab-calculation"><span>Margin/unit <strong>{money(rabMarginUnit(item))}</strong></span><span>Total margin <strong>{money(rabMargin(item))}</strong></span><span>Persentase margin <strong>{percentage(rabMarginPercentage(item))}</strong></span></div>
            </fieldset>)}
            <label className="rab-document-type-control"><span>Jenis dokumen RAB</span><span className="rab-status-select rab-document-select"><select value={rabBusinessType} onChange={(event) => setRabBusinessType(event.target.value as 'B2B' | 'B2G')}><option value="B2B">B2B</option><option value="B2G">B2G</option></select><ChevronDown size={14} aria-hidden="true" /></span></label>
            <div className="product-form-grid">
              <label>Cashback<FormattedNumberInput min={0} value={rabFees.cashback ?? 0} onChange={(cashback) => setRabFees((current) => ({ ...current, cashback }))} /></label>
              <label>Ongkir<FormattedNumberInput min={0} value={rabFees.ongkir ?? 0} onChange={(ongkir) => setRabFees((current) => ({ ...current, ongkir }))} /></label>
              <label>Fee platform PaDi {rabBusinessType === 'B2B' ? '(manual)' : '(otomatis)'}<FormattedNumberInput min={0} value={rabBusinessType === 'B2G' ? rabFormCalculation.platformFeePadi : rabFees.platformFeePadiManual ?? 0} readOnly={rabBusinessType === 'B2G'} onChange={(platformFeePadiManual) => setRabFees((current) => ({ ...current, platformFeePadiManual }))} /></label>
              <label>PPh 22 (otomatis)<FormattedNumberInput min={0} value={rabFormCalculation.pph22} readOnly /></label>
            </div>
            <div className="product-rab-calculation">
              <span>Subtotal jual excl PPN <strong>{money(rabFormCalculation.subtotalSaleExclPpn)}</strong></span>
              <span>Subtotal modal excl PPN <strong>{money(rabFormCalculation.subtotalModalExclPpn)}</strong></span>
              <span>Total margin <strong>{money(rabFormCalculation.subtotalMargin)}</strong></span>
              <span>Persentase margin <strong>{percentage(rabFormCalculation.subtotalMarginPercentage)}</strong></span>
              <span>Margin bersih non-restitusi <strong>{money(rabFormCalculation.finalTotalMarginNonRestitusi)}</strong></span>
              <span>Persentase margin akhir <strong>{percentage(rabFormCalculation.finalPercentageMargin)}</strong></span>
            </div>
            <button className="secondary-button product-rab-add" type="button" onClick={() => setRabForm((current) => [...current, { productName: '', unit: 'pcs', quantity: 1, priceExclTax: 0, priceInclTax: 0, priceModalExclTax: 0, priceModalInclTax: 0, stock: 'Ready', productUrl: '', distributor: '' }])}><Plus size={15} /> Tambah jenis barang</button>
            <button className="submit-button" type="submit"><Check size={16} /> Simpan {rabForm.length} barang ke RAB</button>
          </form>}
          {isProduct && requestIsPending(selectedRequest.status) && <div className="product-review-actions"><input aria-label="Catatan untuk sales" placeholder="Catatan revisi (opsional)" value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} /><button type="button" className="secondary-button" onClick={() => updateRequestStatus('Ditolak')}>Minta revisi</button></div>}
        </> : <p className="product-empty">Pilih request untuk melihat detail.</p>}</div>
      </div>
    </div>}

    {page === 'Partnership' && <div className="product-panel partnership-list"><div className="product-panel-heading"><span><Building2 size={17} /><strong>Daftar partnership</strong></span><small>{partnerships.length} perusahaan</small></div>{partnerships.map((item) => <div className="partnership-row" key={item.name}><span className="partnership-mark">{item.name.slice(0, 1).toUpperCase()}</span><span><strong>{item.name}</strong><small>{item.requests} request harga</small></span><small>Terakhir: {dateLabel(item.latest)}</small></div>)}{!partnerships.length && <p className="product-empty">Daftar partnership akan terbentuk saat Sales mengirim request harga.</p>}</div>}

    {page === 'RAB' && <div className="product-panel product-rab-table-wrap">
      <div className="product-panel-heading"><span><Package size={17} /><strong>{rabView === 'active' ? 'Data RAB' : rabView === 'archive' ? 'Penyimpanan RAB' : 'Trash RAB'}</strong></span><small>{rabDocuments.length} dokumen · {filteredRab.length} item</small></div>
      <div className="rab-view-tabs" role="group" aria-label="Tampilan RAB">
        <button type="button" aria-pressed={rabView === 'active'} className={rabView === 'active' ? 'active' : ''} onClick={() => setRabView('active')}>Data RAB</button>
        <button type="button" aria-pressed={rabView === 'archive'} className={rabView === 'archive' ? 'active' : ''} onClick={() => setRabView('archive')}>Penyimpanan RAB</button>
        <button type="button" aria-pressed={rabView === 'trash'} className={rabView === 'trash' ? 'active' : ''} onClick={() => setRabView('trash')}>Trash</button>
      </div>
      <div className="rab-filter-bar">
        <label className="rab-month-filter"><span>Bulan RAB</span><input type="month" value={rabMonth} onChange={(event) => setRabMonth(event.target.value)} /></label>
        <label className="rab-search-filter"><span>Cari berdasarkan tanggal atau data</span><span className="rab-search-input"><Search size={16} aria-hidden="true" /><input type="search" value={rabSearch} onChange={(event) => setRabSearch(event.target.value)} placeholder="Contoh: 19/10/2026, PIC, customer, produk" /></span></label>
        {(rabMonth || rabSearch) && <button className="rab-filter-reset" type="button" onClick={() => { setRabMonth(''); setRabSearch('') }}>Reset filter</button>}
      </div>
      {rabView === 'active' && rabByOwner.length > 0 && <div className="rab-export-users" aria-label="Ekspor RAB per user">{rabByOwner.map((group) => <div className="rab-export-user" key={group.key}><span><strong>{group.ownerName}</strong><small>{group.items.length} RAB</small></span><button className="table-action" type="button" onClick={() => printRab(group.items)}><Download size={14} /> Ekspor semua RAB</button></div>)}</div>}
      {rabDocuments.length ? <div className="product-table-scroll"><table className="product-rab-table">
        <thead><tr><th rowSpan={2}>No</th><th rowSpan={2}>PIC + Umur RAB</th><th className="rab-offer-heading" rowSpan={2}>Penawaran Produk</th><th className="rab-qty-heading" rowSpan={2}>Qty</th><th className="rab-tax-group rab-tax-incl" colSpan={isProduct ? 4 : 2}>Include PPN</th><th className="rab-tax-group rab-tax-excl" colSpan={isProduct ? 4 : 2}>Exclude PPN</th>{isProduct && <><th rowSpan={2}>Margin</th><th rowSpan={2}>Total Margin</th><th rowSpan={2}>Persentase Margin</th></>}<th rowSpan={2}>Indent</th><th rowSpan={2}>Link</th><th rowSpan={2}>Disti</th><th rowSpan={2}>Aksi</th></tr><tr><th className="rab-tax-incl rab-tax-incl-start">Harga jual</th><th className={`rab-tax-incl ${isProduct ? '' : 'rab-tax-incl-end'}`}>Total jual</th>{isProduct && <><th className="rab-tax-incl">Harga modal</th><th className="rab-tax-incl rab-tax-incl-end">Total modal</th></>}<th className="rab-tax-excl rab-tax-excl-start">Harga jual</th><th className={`rab-tax-excl ${isProduct ? '' : 'rab-tax-excl-end'}`}>Total jual</th>{isProduct && <><th className="rab-tax-excl">Harga modal</th><th className="rab-tax-excl rab-tax-excl-end">Total modal</th></>}</tr></thead>
        <tbody>{rabDocuments.map((document, documentIndex) => {
        const items = document.items
        const firstItem = items[0]
        const request = data.requests.find((candidate) => candidate.id === firstItem.requestId)
        const previousMonth = documentIndex > 0 ? new Date(rabDocuments[documentIndex - 1].createdAt).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }) : ''
        const currentMonth = new Date(document.createdAt).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
        const showMonthHeading = currentMonth !== previousMonth
        return <Fragment key={document.key}>
          {showMonthHeading && <tr className="rab-month-heading-row"><th colSpan={isProduct ? 19 : 12}>{currentMonth}</th></tr>}
          {items.map((item, index) => {
              const isEditing = editingRabId === item.id
              const rowData = isEditing ? rabEdit : item
              const totalSaleInclTax = rowData.quantity * rowData.priceInclTax
              const rowCalculation = rabLine(rowData)
              const totalSaleExclTax = rowCalculation.saleTotalExclPpn
              const totalModalInclTax = rowData.quantity * rabModalInclTax(rowData)
              const totalModalExclTax = rowCalculation.modalTotalExclPpn
              const age = requestAgeDays(item.createdAt)
              return <tr key={item.id}>
                <td>{rabRowNumbers.get(item.id)}</td>
                <td><strong>{request?.customerName || '—'}</strong><small className="rab-age">{age === null ? 'Umur tidak tersedia' : `${age} hari`}</small></td>
                <td className="rab-offer-cell">{isEditing && isProduct ? <input aria-label="Penawaran produk" value={rabEdit.productName} onChange={(event) => setRabEdit({ ...rabEdit, productName: event.target.value })} required /> : <strong>{item.productName}</strong>}</td>
                <td className="rab-qty-cell">{isEditing ? <input aria-label="Qty" type="number" min="1" step="1" value={rabEdit.quantity} onChange={(event) => setRabEdit({ ...rabEdit, quantity: Number(event.target.value) })} required /> : item.quantity}</td>
                {isEditing ? <>
                  <td className="rab-tax-incl rab-tax-incl-start"><FormattedNumberInput aria-label="Harga jual include PPN" min={0} value={rabEdit.priceInclTax} onChange={(priceInclTax) => setRabEdit({ ...rabEdit, priceInclTax })} required /></td>
                  <td className={`rab-tax-incl ${isProduct ? '' : 'rab-tax-incl-end'}`}>{money(totalSaleInclTax)}</td>
                  {isProduct && <><td className="rab-tax-incl"><FormattedNumberInput aria-label="Harga modal include PPN" min={0} value={rabModalInclTax(rabEdit)} onChange={(priceModalInclTax) => setRabEdit({ ...rabEdit, priceModalInclTax })} required /></td><td className="rab-tax-incl rab-tax-incl-end">{money(totalModalInclTax)}</td></>}
                  <td className="rab-tax-excl rab-tax-excl-start"><FormattedNumberInput aria-label="Harga jual exclude PPN (otomatis)" min={0} value={rabSaleExclTax(rabEdit)} readOnly /></td>
                  <td className={`rab-tax-excl ${isProduct ? '' : 'rab-tax-excl-end'}`}>{money(totalSaleExclTax)}</td>
                  {isProduct && <><td className="rab-tax-excl"><FormattedNumberInput aria-label="Harga modal exclude PPN (otomatis)" min={0} value={rabModalExclTax(rabEdit)} readOnly /></td><td className="rab-tax-excl rab-tax-excl-end">{money(totalModalExclTax)}</td><td>{money(rowCalculation.marginUnit)}</td><td>{money(rowCalculation.totalMargin)}</td><td>{percentage(rowCalculation.marginPercentage)}</td></>}
                  <td><span className="rab-status-select" data-status={stockLabel(rabEdit.stock)}><select aria-label="Status indent" value={stockLabel(rabEdit.stock)} onChange={(event) => setRabEdit({ ...rabEdit, stock: event.target.value as StockStatus })}>{(['Ready', 'Limited', 'Indent', 'Kosong'] as StockStatus[]).map((status) => <option key={status}>{status}</option>)}</select><ChevronDown size={14} aria-hidden="true" /></span></td>
                  <td>{isProduct ? <input aria-label="Link produk" type="url" value={rabEdit.productUrl} onChange={(event) => setRabEdit({ ...rabEdit, productUrl: event.target.value })} /> : item.productUrl ? <a href={item.productUrl} target="_blank" rel="noreferrer">Buka</a> : '—'}</td>
                  <td>{isProduct ? <input aria-label="Distributor" value={rabEdit.distributor ?? ''} onChange={(event) => setRabEdit({ ...rabEdit, distributor: event.target.value })} /> : item.distributor || '—'}</td>
                  <td><button className="table-action" type="button" onClick={() => saveRabChanges(item)}>Simpan</button><button className="table-action subtle" type="button" onClick={() => setEditingRabId(null)}>Batal</button></td>
                </> : <>
                  <td className="rab-tax-incl rab-tax-incl-start">{money(item.priceInclTax)}</td><td className={`rab-tax-incl ${isProduct ? '' : 'rab-tax-incl-end'}`}>{money(totalSaleInclTax)}</td>{isProduct && <><td className="rab-tax-incl">{money(rabModalInclTax(item))}</td><td className="rab-tax-incl rab-tax-incl-end">{money(totalModalInclTax)}</td></>}
                  <td className="rab-tax-excl rab-tax-excl-start">{money(rowCalculation.saleUnitExclPpn)}</td><td className={`rab-tax-excl ${isProduct ? '' : 'rab-tax-excl-end'}`}>{money(totalSaleExclTax)}</td>{isProduct && <><td className="rab-tax-excl">{money(rowCalculation.modalUnitExclPpn)}</td><td className="rab-tax-excl rab-tax-excl-end">{money(totalModalExclTax)}</td><td>{money(rowCalculation.marginUnit)}</td><td>{money(rowCalculation.totalMargin)}</td><td>{percentage(rowCalculation.marginPercentage)}</td></>}<td>{stockLabel(item.stock)}</td>
                  <td>{item.productUrl ? <a href={item.productUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Buka</a> : '—'}</td><td>{item.distributor || '—'}</td>
                  <td>
                    {rabView !== 'trash' && <button className="table-action" type="button" onClick={() => { setRabEdit({ productName: item.productName, unit: item.unit ?? 'pcs', quantity: item.quantity, priceExclTax: item.priceExclTax, priceInclTax: item.priceInclTax, priceModalExclTax: rabModalExclTax(item), priceModalInclTax: rabModalInclTax(item), stock: stockLabel(item.stock), productUrl: item.productUrl, distributor: item.distributor ?? '' }); setEditingRabId(item.id) }}>Edit</button>}
                    {index === 0 && <button className="table-action" type="button" aria-label="Ekspor RAB PDF" title="Ekspor RAB PDF" onClick={() => printRab(items)}><Download size={14} /></button>}
                    {index === 0 && rabView === 'active' && <button className="table-action subtle" type="button" aria-label="Sembunyikan RAB ke penyimpanan" title="Simpan ke Penyimpanan RAB" onClick={() => archiveRabDocument(items)}><X size={14} /></button>}
                    {index === 0 && rabView === 'archive' && <><button className="table-action subtle" type="button" aria-label="Pulihkan RAB" title="Pulihkan RAB" onClick={() => restoreRabDocument(items)}><RotateCcw size={14} /></button><button className="table-action subtle" type="button" aria-label="Pindahkan RAB ke Trash" title="Pindahkan ke Trash" onClick={() => moveRabDocumentToTrash(items)}><Trash2 size={14} /></button></>}
                    {index === 0 && rabView === 'trash' && <><button className="table-action subtle" type="button" aria-label="Pulihkan RAB" title="Pulihkan RAB" onClick={() => restoreRabDocument(items)}><RotateCcw size={14} /></button><button className="table-action subtle" type="button" aria-label="Hapus RAB permanen" title="Hapus permanen" onClick={() => void permanentlyDeleteRabDocument(items)}><Trash2 size={14} /></button></>}
                  </td>
                </>}
              </tr>
            })}
        </Fragment>
      })}<tr className="rab-subtotal-row">
          <td></td><td colSpan={2}></td><td></td><td></td><td>{money(rabOverallSubtotal.saleInclPpn)}</td>
          {isProduct && <><td></td><td>{money(rabOverallSubtotal.modalInclPpn)}</td></>}
          <td></td><td>{money(rabOverallSubtotal.saleExclPpn)}</td>
          {isProduct && <><td></td><td>{money(rabOverallSubtotal.modalExclPpn)}</td><td></td><td>{money(rabOverallSubtotal.margin)}</td><td>{percentage(rabOverallMarginPercentage)}</td></>}
          <td colSpan={3}></td><td></td>
        </tr></tbody></table></div> : <p className="product-empty">{rabView === 'active' ? 'RAB aktif belum tersedia. Request harga yang diproses Product akan tampil di sini.' : rabView === 'archive' ? 'Belum ada RAB di Penyimpanan RAB.' : 'Trash RAB kosong.'}</p>}
    </div>}

    {showRequestForm && <div className="modal-backdrop"><form className="product-request-form" onSubmit={submitRequest}><div className="modal-heading"><div><p className="eyebrow">Sales request</p><h2>Request harga produk</h2></div><button type="button" className="icon-button" onClick={() => setShowRequestForm(false)} aria-label="Tutup"><X size={19} /></button></div><div className="product-form-grid"><label>PIC<input required value={requestForm.customerName} onChange={(event) => setRequestForm({ ...requestForm, customerName: event.target.value })} placeholder="Nama PIC" /></label><label>Customer<input required value={requestForm.partnership} onChange={(event) => setRequestForm({ ...requestForm, partnership: event.target.value })} placeholder="Nama customer" /></label><div className="product-form-wide">{requestForm.products.map((product, index) => <div className="product-rab-item" key={product.id}><div className="product-rab-item-heading"><strong>Produk {index + 1}</strong>{requestForm.products.length > 1 && <button className="table-action subtle" type="button" onClick={() => setRequestForm((current) => ({ ...current, products: current.products.filter((item) => item.id !== product.id) }))}><X size={14} /> Hapus</button>}</div><div className="product-form-grid"><label>Nama produk<input required value={product.productName} onChange={(event) => setRequestForm((current) => ({ ...current, products: current.products.map((item) => item.id === product.id ? { ...item, productName: event.target.value } : item) }))} /></label><label>Jumlah<input required type="number" min="1" value={product.quantity} onChange={(event) => setRequestForm((current) => ({ ...current, products: current.products.map((item) => item.id === product.id ? { ...item, quantity: Number(event.target.value) } : item) }))} /></label></div></div>)}<button className="secondary-button product-rab-add" type="button" onClick={() => setRequestForm((current) => ({ ...current, products: [...current.products, { id: crypto.randomUUID(), productName: '', quantity: 1 }] }))}><Plus size={15} /> Tambah produk</button></div><label className="product-form-wide">Detail request<textarea value={requestForm.description} onChange={(event) => setRequestForm({ ...requestForm, description: event.target.value })} rows={4} placeholder="Tulis spesifikasi, kebutuhan harga, atau catatan untuk Product" /></label><label className="product-form-wide product-file-input"><Paperclip size={16} /> Lampiran gambar / dokumen<input type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" onChange={(event: ChangeEvent<HTMLInputElement>) => setRequestForm({ ...requestForm, file: event.target.files?.[0] ?? null })} /><small>{requestForm.file ? requestForm.file.name : 'Maksimal 1 MB'}</small></label></div><button className="submit-button" type="submit"><Send size={16} /> Kirim request</button></form></div>}
  </section>
}
