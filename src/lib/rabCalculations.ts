export type RabTransactionType = 'B2B' | 'B2G'

export type RabCalculationItemInput = {
  quantity: number
  salePriceInclPpn: number
  modalPriceInclPpn: number
}

export type RabDocumentCalculationInput = {
  transactionType: RabTransactionType
  items: RabCalculationItemInput[]
  cashback?: number
  ongkir?: number
  platformFeePadiManual?: number
}

export type RabLineCalculation = {
  saleTotalInclPpn: number
  modalTotalInclPpn: number
  saleUnitExclPpn: number
  saleTotalExclPpn: number
  modalUnitExclPpn: number
  modalTotalExclPpn: number
  marginUnit: number
  totalMargin: number
  marginPercentage: number
}

export type RabDocumentCalculation = {
  lines: RabLineCalculation[]
  subtotalSaleExclPpn: number
  subtotalModalExclPpn: number
  subtotalMargin: number
  subtotalMarginPercentage: number
  pph22: number
  platformFeePadi: number
  cashback: number
  ongkir: number
  finalTotalMarginNonRestitusi: number
  finalPercentageMargin: number
}

const PPN_DIVISOR = 1.11

function validateAmount(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} harus berupa angka nol atau lebih.`)
  }
}

export function calculateRabLine(item: RabCalculationItemInput): RabLineCalculation {
  validateAmount(item.quantity, 'Qty')
  validateAmount(item.salePriceInclPpn, 'Harga jual include PPN')
  validateAmount(item.modalPriceInclPpn, 'Harga modal include PPN')

  const saleUnitExclPpn = item.salePriceInclPpn / PPN_DIVISOR
  const modalUnitExclPpn = item.modalPriceInclPpn / PPN_DIVISOR
  const marginUnit = saleUnitExclPpn - modalUnitExclPpn

  return {
    saleTotalInclPpn: item.salePriceInclPpn * item.quantity,
    modalTotalInclPpn: item.modalPriceInclPpn * item.quantity,
    saleUnitExclPpn,
    saleTotalExclPpn: saleUnitExclPpn * item.quantity,
    modalUnitExclPpn,
    modalTotalExclPpn: modalUnitExclPpn * item.quantity,
    marginUnit,
    totalMargin: marginUnit * item.quantity,
    marginPercentage: saleUnitExclPpn > 0 ? marginUnit / saleUnitExclPpn * 100 : 0,
  }
}

export function calculateRabDocument(input: RabDocumentCalculationInput): RabDocumentCalculation {
  const cashback = input.cashback ?? 0
  const ongkir = input.ongkir ?? 0
  const platformFeePadiManual = input.platformFeePadiManual ?? 0
  validateAmount(cashback, 'Cashback')
  validateAmount(ongkir, 'Ongkir')
  validateAmount(platformFeePadiManual, 'Fee platform manual')

  const lines = input.items.map(calculateRabLine)
  const subtotalSaleExclPpn = lines.reduce((total, line) => total + line.saleTotalExclPpn, 0)
  const subtotalModalExclPpn = lines.reduce((total, line) => total + line.modalTotalExclPpn, 0)
  const subtotalMargin = subtotalSaleExclPpn - subtotalModalExclPpn
  const pph22 = input.transactionType === 'B2G' ? subtotalSaleExclPpn * 0.015 : 0
  const firstPlatformThreshold = 100_000_000
  const secondPlatformThreshold = 1_000_000_000
  const firstThresholdTolerance = Number.EPSILON * Math.max(subtotalSaleExclPpn, firstPlatformThreshold) * 4
  const secondThresholdTolerance = Number.EPSILON * Math.max(subtotalSaleExclPpn, secondPlatformThreshold) * 4
  const platformFeeRate = subtotalSaleExclPpn < firstPlatformThreshold - firstThresholdTolerance
    ? 0.015
    : subtotalSaleExclPpn <= secondPlatformThreshold + secondThresholdTolerance
      ? 0.01
      : 0.005
  const platformFeePadi = input.transactionType === 'B2G'
    ? subtotalSaleExclPpn * platformFeeRate
    : platformFeePadiManual
  const finalTotalMarginNonRestitusi = subtotalMargin - cashback - pph22 - platformFeePadi - ongkir

  return {
    lines,
    subtotalSaleExclPpn,
    subtotalModalExclPpn,
    subtotalMargin,
    subtotalMarginPercentage: subtotalSaleExclPpn > 0 ? subtotalMargin / subtotalSaleExclPpn * 100 : 0,
    pph22,
    platformFeePadi,
    cashback,
    ongkir,
    finalTotalMarginNonRestitusi,
    finalPercentageMargin: subtotalSaleExclPpn > 0 ? finalTotalMarginNonRestitusi / subtotalSaleExclPpn * 100 : 0,
  }
}
