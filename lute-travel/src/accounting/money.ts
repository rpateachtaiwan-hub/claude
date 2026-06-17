// =============================================================================
// 金額工具 — 一律整數元 (TWD)，絕不使用浮點數運算
// =============================================================================

/** 驗證為安全整數，否則拋錯。用於所有金額入口。 */
export function assertInteger(value: number, label = '金額'): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || !Number.isSafeInteger(value)) {
    throw new MoneyError(`${label}必須為整數元，收到：${value}`)
  }
  return value
}

export class MoneyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MoneyError'
  }
}

/** 千分位顯示，如 1234567 → "1,234,567"。負數加前綴 -。 */
export function formatTWD(value: number): string {
  const sign = value < 0 ? '-' : ''
  const abs = Math.abs(value)
  return sign + abs.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

/** 帶幣別符號，如 1234567 → "NT$1,234,567"。 */
export function formatTWDSymbol(value: number): string {
  return 'NT$' + formatTWD(value)
}

/** 由 ISO 日期字串衍生會計期間 'YYYY-MM'。 */
export function periodOf(isoDate: string): string {
  return isoDate.slice(0, 7)
}
