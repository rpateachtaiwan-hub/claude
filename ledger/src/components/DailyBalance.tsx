import { useMemo, useState } from 'react'
import { useLedger } from '../store/useLedger'
import { ANCHOR_DATE, balancePairs, dailyCheck, isBankAccount, pairKey, type DailyCheck } from '../core/dailyBalance'
import { formatTWD } from '../core/money'
import { downloadCSV, toCSV } from '../lib/csv'

const coLabel = (c: string) => c || '（未指定公司）'
type RowFilter = 'all' | 'break' | 'missing'

/**
 * 每日餘額核對（唯讀驗證頁）：銀行餘額一律由機器人（RPA）從網銀抓取寫入，不開放人工輸入，
 * 以確保驗證來源獨立於帳務資料。以起算日（2026/1/1）銀行餘額為錨點，加上之後每天匯入的銀行流水，
 * 推算每日日終餘額並與銀行帳戶餘額逐日比對；差額「新增」的那天就是匯入有問題的那天。
 */
export default function DailyBalance() {
  const { entries, accounts, dailyBalances } = useLedger()
  const today = new Date().toISOString().slice(0, 10)
  const bankCodes = useMemo(() => new Set(accounts.filter(isBankAccount).map((a) => a.code)), [accounts])
  const accName = (code: string) => accounts.find((a) => a.code === code)?.name ?? code

  // 只核對銀行科目（零用金等現金科目不列入）
  const balances = useMemo(() => dailyBalances.filter((b) => bankCodes.has(b.accountCode)), [dailyBalances, bankCodes])
  const pairs = useMemo(() => balancePairs(entries, balances, bankCodes), [entries, balances, bankCodes])
  const checks = useMemo(() => {
    const m = new Map<string, DailyCheck>()
    for (const p of pairs) m.set(pairKey(p), dailyCheck(entries, balances, p, today))
    return m
  }, [pairs, entries, balances, today])

  // 機器人狀態
  const robot = useMemo(() => {
    let lastRun = '', lastDate = '', manual = 0
    for (const b of balances) {
      if (b.source !== 'rpa') { manual++; continue }
      if (b.updatedAt > lastRun) lastRun = b.updatedAt
      if (b.date > lastDate) lastDate = b.date
    }
    return { lastRun, lastDate, manual }
  }, [balances])
  const yesterday = shiftDate(today, -1)
  const stale = robot.lastDate !== '' && robot.lastDate < yesterday

  const [sel, setSel] = useState<string>('')
  const [filter, setFilter] = useState<RowFilter>('all')
  const selCheck = sel ? checks.get(sel) : undefined
  const detailRows = useMemo(() => {
    if (!selCheck) return []
    const rows = [...selCheck.rows].reverse() // 新的在上
    if (filter === 'break') return rows.filter((r) => r.newDiff !== undefined && r.newDiff !== 0)
    if (filter === 'missing') return rows.filter((r) => r.bank === undefined)
    return rows
  }, [selCheck, filter])

  function exportDetail() {
    if (!selCheck) return
    const { pair, anchor } = selCheck
    const rows: (string | number)[][] = []
    if (anchor) rows.push([anchor.date, '', anchor.balance, anchor.balance, 0, '起算'])
    for (const r of selCheck.rows) rows.push([r.date, r.net, r.computed, r.bank ?? '', r.diff ?? '', r.newDiff ? r.newDiff : ''])
    downloadCSV(`每日餘額核對_${coLabel(pair.company)}_${accName(pair.accountCode)}`,
      toCSV(['日期', '當日淨變動', '系統推算餘額', '銀行帳戶餘額', '差額(推算−銀行)', '新增差異'], rows))
  }

  return (
    <div className="space-y-4">
      <div className="bg-brand-soft border border-brand-light/40 rounded-lg p-3 text-xs text-gray-600 leading-relaxed">
        以 <b>{ANCHOR_DATE.replace(/-/g, '/')} 的銀行餘額為起點</b>，加上之後每天匯入的銀行流水，推算各公司、各銀行帳戶的每日日終餘額，
        再與當天的<b>銀行帳戶餘額</b>比對。差額<b>「新增」</b>的那一天，就是那段期間的匯入有漏、重複或金額錯誤。
        總覽的「帳上起算餘額」另外檢查系統自開帳累計到起算日的餘額是否等於銀行，確保資產負債表的銀行存款正確。
        <br />※ 銀行餘額<b>由機器人每天自動從網銀抓取</b>，本頁僅供檢視、不開放人工輸入，確保驗證來源獨立於帳務資料。
        核對用網銀的「帳戶餘額」（可用餘額 ＝ 帳戶餘額 − 當日交換票 − 圈存 ＋ 透支額度，僅記錄）。只核對銀行科目，零用金等現金科目不列入。
      </div>

      <div className={`rounded-lg px-3 py-2 text-sm border ${!robot.lastRun ? 'text-gray-500 bg-white border-gray-200' : stale ? 'text-amber-800 bg-amber-50 border-amber-200' : 'text-gray-700 bg-white border-gray-200'}`}>
        {!robot.lastRun
          ? '機器人尚未寫入任何銀行餘額。'
          : <>機器人最後更新：<b>{fmtTime(robot.lastRun)}</b>，最新餘額日期：<b>{robot.lastDate}</b>
            {stale && <span className="ml-2">⚠ 昨天（{yesterday}）的餘額尚未寫入，請確認機器人是否正常執行。</span>}</>}
        {robot.manual > 0 && <span className="ml-2 text-xs text-gray-500">（另有 {robot.manual} 筆早期人工輸入的餘額，仍列入核對）</span>}
      </div>

      {/* 總覽 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <div className="px-4 pt-3 text-sm font-medium text-gray-700">核對總覽（點一列看逐日明細）</div>
        <table className="w-full min-w-[920px] text-sm">
          <thead><tr className="text-gray-500 text-xs">
            <th className="px-3 py-2 text-left">公司</th><th className="px-3 py-2 text-left">銀行科目</th>
            <th className="px-3 py-2 text-right">起算餘額（銀行）</th>
            <th className="px-3 py-2 text-right" title="系統自開帳累計到起算日的銀行科目餘額；應等於銀行起算餘額，不符代表起算日前的歷史資料或期初有誤">帳上起算餘額</th>
            <th className="px-3 py-2 text-left">最近核對日</th>
            <th className="px-3 py-2 text-right">推算 / 銀行</th><th className="px-3 py-2 text-right">差額</th>
            <th className="px-3 py-2 text-left">第一個差異日</th><th className="px-3 py-2 text-right">未填天數</th>
          </tr></thead>
          <tbody>
            {pairs.length === 0 && <tr><td colSpan={9} className="px-3 py-6 text-center text-gray-400">尚無銀行流水或餘額資料。</td></tr>}
            {pairs.map((p) => {
              const k = pairKey(p)
              const c = checks.get(k)!
              const d = c.latest?.diff
              return (
                <tr key={k} onClick={() => setSel(sel === k ? '' : k)}
                  className={`border-t border-gray-100 cursor-pointer hover:bg-brand-soft/50 ${sel === k ? 'bg-brand-soft' : ''}`}>
                  <td className="px-3 py-2 text-gray-700">{coLabel(p.company)}</td>
                  <td className="px-3 py-2 text-gray-600">{p.accountCode} {accName(p.accountCode)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {c.anchor
                      ? <>{formatTWD(c.anchor.balance)}{!c.anchorOnDate && <div className="text-[11px] text-amber-600">以 {c.anchor.date} 起算</div>}</>
                      : <span className="text-xs text-red-600">尚無 {ANCHOR_DATE} 餘額</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {c.anchorDiff === undefined ? <span className="text-gray-300">—</span>
                      : <>{formatTWD(c.bookAtAnchor!)}<div className={`text-[11px] ${c.anchorDiff === 0 ? 'text-green-600' : 'text-red-600 font-medium'}`}>{c.anchorDiff === 0 ? '✓ 與銀行相符' : `✗ 差 ${formatTWD(c.anchorDiff)}`}</div></>}
                  </td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{c.latest?.date ?? '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-xs text-gray-600">
                    {c.latest ? <>{formatTWD(c.latest.computed)}<br />{formatTWD(c.latest.bank!)}</> : '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {d === undefined ? <span className="text-gray-300">—</span> : d === 0 ? <span className="text-green-600">✓ 相符</span> : <span className="text-red-600 font-medium">✗ {formatTWD(d)}</span>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {c.firstBreak ? <span className="text-red-600">{c.firstBreak}{c.breakCount > 1 && <span className="text-xs text-gray-500">（共 {c.breakCount} 天）</span>}</span> : <span className="text-gray-300">—</span>}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums ${c.missingCount ? 'text-amber-600' : 'text-gray-300'}`}>{c.missingCount || '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* 逐日明細 */}
      {selCheck && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-medium text-gray-700">逐日明細：{coLabel(selCheck.pair.company)} · {selCheck.pair.accountCode} {accName(selCheck.pair.accountCode)}</div>
            <div className="flex gap-1 ml-auto text-xs">
              {([['all', '全部'], ['break', '新增差異日'], ['missing', '未填餘額日']] as [RowFilter, string][]).map(([f, l]) => (
                <button key={f} onClick={() => setFilter(f)} className={`px-2.5 py-1 rounded ${filter === f ? 'bg-brand text-white' : 'border border-gray-300 text-gray-600'}`}>{l}</button>
              ))}
              <button onClick={exportDetail} className="px-2.5 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50">⬇ 匯出</button>
            </div>
          </div>
          <div className="text-xs text-gray-500">「新增差異」≠ 0 的列：問題發生在上一個核對日之後、到該日為止的匯入資料中。</div>
          <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="sticky top-0"><tr className="bg-gray-50 text-gray-500 text-xs">
                <th className="px-3 py-2 text-left">日期</th><th className="px-3 py-2 text-right">當日淨變動</th>
                <th className="px-3 py-2 text-right">系統推算餘額</th><th className="px-3 py-2 text-right">銀行帳戶餘額</th>
                <th className="px-3 py-2 text-right">差額</th><th className="px-3 py-2 text-right">新增差異</th>
              </tr></thead>
              <tbody>
                {detailRows.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">{selCheck.anchor ? '沒有符合的日期。' : `機器人尚未寫入 ${ANCHOR_DATE} 的起算餘額。`}</td></tr>}
                {detailRows.map((r) => (
                  <tr key={r.date} className={`border-t border-gray-100 ${r.newDiff ? 'bg-red-50' : ''}`}>
                    <td className="px-3 py-1.5 text-gray-700">{r.date}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">{r.net ? formatTWD(r.net) : '—'}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{formatTWD(r.computed)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{r.bank !== undefined ? formatTWD(r.bank) : <span className="text-xs text-amber-600">未填</span>}</td>
                    <td className={`px-3 py-1.5 text-right tabular-nums ${r.diff === undefined ? 'text-gray-300' : r.diff === 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {r.diff === undefined ? '—' : r.diff === 0 ? '✓' : formatTWD(r.diff)}
                    </td>
                    <td className={`px-3 py-1.5 text-right tabular-nums ${r.newDiff ? 'text-red-700 font-semibold' : 'text-gray-300'}`}>{r.newDiff ? formatTWD(r.newDiff) : '—'}</td>
                  </tr>
                ))}
                {selCheck.anchor && filter === 'all' && (
                  <tr className="border-t border-gray-200 bg-gray-50 text-gray-500">
                    <td className="px-3 py-1.5">{selCheck.anchor.date}</td><td className="px-3 py-1.5 text-right">起算</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{formatTWD(selCheck.anchor.balance)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{formatTWD(selCheck.anchor.balance)}</td>
                    <td colSpan={2}></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function shiftDate(d: string, days: number): string {
  const t = new Date(`${d}T00:00:00Z`)
  t.setUTCDate(t.getUTCDate() + days)
  return t.toISOString().slice(0, 10)
}

function fmtTime(iso: string): string {
  const t = new Date(iso)
  if (Number.isNaN(t.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())} ${p(t.getHours())}:${p(t.getMinutes())}`
}
