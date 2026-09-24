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

/** 正規化日期成 YYYY-MM-DD；無法辨識時回傳空字串。
 *  支援年在前：2026/01/06、2026-1-6、26/01/06(Tue) 等（可含星期等尾綴）。 */
export function normalizeDate(s: string): string {
  const t = String(s).trim()
  if (!t) return ''
  // 8 碼緊湊格式 yyyymmdd（如銀行下載 20260601）
  const c = t.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (c && +c[2] >= 1 && +c[2] <= 12 && +c[3] >= 1 && +c[3] <= 31) return `${c[1]}-${c[2]}-${c[3]}`
  // 年在前：yyyy 或 yy，後接 月 / 日，容許後方有 (Tue) 之類尾綴
  const m = t.match(/(\d{2,4})[/.\-](\d{1,2})[/.\-](\d{1,2})/)
  if (m) {
    let y = m[1]
    if (y.length <= 2) y = (Number(y) >= 70 ? '19' : '20') + y.padStart(2, '0')
    const mo = Number(m[2])
    const d = Number(m[3])
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    }
  }
  // Excel 序列日期（純數字，1900 起算）
  if (/^\d{4,5}(\.\d+)?$/.test(t)) {
    const serial = Math.floor(Number(t))
    const ms = (serial - 25569) * 86400 * 1000 // 25569 = 1970-01-01 的序號
    const d = new Date(ms)
    if (!isNaN(d.getTime())) {
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
    }
  }
  return ''
}
