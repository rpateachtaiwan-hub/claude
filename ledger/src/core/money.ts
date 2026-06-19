// 金額工具 — 一律整數元

export class MoneyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MoneyError'
  }
}

export function assertInteger(value: number, label = '金額'): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || !Number.isSafeInteger(value)) {
    throw new MoneyError(`${label}必須為整數元，收到：${value}`)
  }
  return value
}

/** 千分位，如 1234567 → "1,234,567" */
export function formatTWD(value: number): string {
  const sign = value < 0 ? '-' : ''
  return sign + Math.abs(value).toLocaleString('en-US', { maximumFractionDigits: 0 })
}

export function formatTWDSymbol(value: number): string {
  return 'NT$' + formatTWD(value)
}

export function periodOf(isoDate: string): string {
  return isoDate.slice(0, 7)
}
