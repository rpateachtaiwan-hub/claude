// CSV 匯出 / 貼上解析（支援 Excel 複製貼上＝Tab 分隔，或逗號 CSV）

function esc(v: string | number): string {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCSV(headers: string[], rows: (string | number)[][]): string {
  const lines = [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))]
  return lines.join('\n')
}

/** 觸發下載（加 BOM 讓 Excel 正確顯示中文）。 */
export function downloadCSV(filename: string, csv: string) {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** 解析貼上的表格文字：自動判斷 Tab 或逗號分隔，回傳二維陣列。 */
export function parseDelimited(text: string): string[][] {
  const clean = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
  if (!clean) return []
  const firstLine = clean.split('\n')[0]
  const delim = firstLine.includes('\t') ? '\t' : ','
  const rows: string[][] = []
  for (const line of clean.split('\n')) {
    if (line.trim() === '') continue
    rows.push(splitLine(line, delim))
  }
  return rows
}

function splitLine(line: string, delim: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (c === '"') inQuotes = false
      else cur += c
    } else if (c === '"') inQuotes = true
    else if (c === delim) { out.push(cur.trim()); cur = '' }
    else cur += c
  }
  out.push(cur.trim())
  return out
}

/** 把金額字串（可能含逗號、空白）轉成整數元。 */
export function parseAmount(s: string): number {
  const n = Math.round(Number(String(s).replace(/[,\s$NT元]/gi, '')) || 0)
  return Number.isFinite(n) ? n : 0
}

/** 正規化日期成 YYYY-MM-DD（支援 2026/01/03、2026-1-3 等）。 */
export function normalizeDate(s: string): string {
  const m = String(s).trim().match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/)
  if (!m) return s.trim()
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
}
