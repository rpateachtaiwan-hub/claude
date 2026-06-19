import * as XLSX from 'xlsx'

/** 讀取上傳的 Excel/CSV 檔，回傳二維字串陣列（第一列為標題）。 */
export async function fileToRows(file: File): Promise<string[][]> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const json = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: '' })
  return json.map((row) => row.map((c) => String(c ?? '').trim()))
}
