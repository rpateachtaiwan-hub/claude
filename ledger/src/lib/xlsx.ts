import * as XLSX from 'xlsx'

/** 讀取上傳的 Excel/CSV 檔，回傳二維字串陣列（第一列為標題）。日期欄轉成 ISO 字串。 */
export async function fileToRows(file: File): Promise<string[][]> {
  const buf = await file.arrayBuffer()
  // CSV/TXT 必須自行以 UTF-8 解碼：SheetJS 對「無 BOM 的 UTF-8」會誤判為 latin1 而變亂碼。
  // TextDecoder 會自動剝除 BOM，有無 BOM 皆正確。Excel 二進位格式維持原路徑。
  const isText = /\.(csv|txt)$/i.test(file.name)
  const wb = isText
    ? XLSX.read(new TextDecoder('utf-8').decode(buf), { type: 'string', cellDates: true })
    : XLSX.read(buf, { type: 'array', cellDates: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const json = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    raw: false,
    defval: '',
    dateNF: 'yyyy-mm-dd', // 日期型儲存格輸出為 2026-01-03
  })
  return json.map((row) => row.map(cellToString))
}

function cellToString(c: unknown): string {
  if (c instanceof Date) {
    const y = c.getFullYear()
    const m = String(c.getMonth() + 1).padStart(2, '0')
    const d = String(c.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  return String(c ?? '').trim()
}
