import { describe, it, expect } from 'vitest'
import { normalizeDate, parseAmount } from './csv'

describe('normalizeDate', () => {
  it('yyyy/mm/dd', () => expect(normalizeDate('2026/01/06')).toBe('2026-01-06'))
  it('ISO', () => expect(normalizeDate('2026-1-6')).toBe('2026-01-06'))
  it('yy/mm/dd 含星期尾綴', () => expect(normalizeDate('26/01/06(Tue)')).toBe('2026-01-06'))
  it('8 碼 yyyymmdd', () => expect(normalizeDate('20260601')).toBe('2026-06-01'))
  it('yy 展開', () => expect(normalizeDate('99/12/31')).toBe('1999-12-31'))
  it('無法辨識回傳空', () => expect(normalizeDate('—')).toBe(''))
  it('空字串', () => expect(normalizeDate('')).toBe(''))
})

describe('parseAmount', () => {
  it('千分位', () => expect(parseAmount('6,031')).toBe(6031))
  it('含符號', () => expect(parseAmount('NT$ 1,200')).toBe(1200))
  it('空值', () => expect(parseAmount('')).toBe(0))
})
