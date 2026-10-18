import { useMemo, useState } from 'react'
import { useLedger } from '../store/useLedger'
import { ANCHOR_DATE, CASH_ACCOUNT_CODE, bankAccountChecks, dailyCheck, type DailyCheck } from '../core/dailyBalance'
import { formatTWD } from '../core/money'
import { downloadCSV, toCSV } from '../lib/csv'

type RowFilter = 'all' | 'break'

/**
 * 每日餘額核對（唯讀驗證頁）：每家公司各有一個台幣帳戶，各自對該公司的 112 銀行現金。
 * 期初餘額（2026/1/1，財務提供、固定於程式設定檔）＋ 之後該公司分錄在 112 的淨變動
 * = 系統推算餘額，與機器人從網銀抓回的同日銀行帳戶餘額比對。銀行餘額不開放人工輸入。
 */
export default function DailyBalance() {
  const { entries, accounts, companies, dailyBalances } = useLedger()
  const today = new Date().toISOString().slice(0, 10)
  const cashName = accounts.find((a) => a.code === CASH_ACCOUNT_CODE)?.name ?? '銀行現金'

  const balances = useMemo(() => dailyBalances.filter((b) => b.accountCode === CASH_ACCOUNT_CODE), [dailyBalances])
  const configs = useMemo(() => bankAccountChecks(companies), [companies])
  const checks = useMemo(() => {
    const m = new Map<string, DailyCheck>()
    for (const c of configs) if (c.company) m.set(c.accountNo, dailyCheck(entries, balances, c.company, c.opening, today))
    return m
  }, [configs, entries, balances, today])

  // 機器人狀態
  const robot = useMemo(() => {
    let lastRun = '', lastDate = ''
    for (const b of balances) {
      if (b.updatedAt > lastRun) lastRun = b.updatedAt
      if (b.date > lastDate) lastDate = b.date
    }
    return { lastRun, lastDate }
  }, [balances])
  const yesterday = shiftDate(today, -1)
  const stale = robot.lastDate !== '' && robot.lastDate < yesterday

  const [sel, setSel] = useState('')
  const [filter, setFilter] = useState<RowFilter>('all')
  const selCheck = sel ? checks.get(sel) : undefined
  const detailRows = useMemo(() => {
    if (!selCheck) return []
    const rows = [...selCheck.rows].reverse() // 新的在上
    return filter === 'break' ? rows.filter((r) => r.newDiff) : rows
  }, [selCheck, filter])

  function exportDetail() {
    if (!selCheck) return
    const rows: (string | number)[][] = [[ANCHOR_DATE, '', selCheck.opening, '', '', '期初']]
    for (const r of selCheck.rows) rows.push([r.date, r.net, r.computed, r.bank ?? '', r.diff ?? '', r.newDiff ? r.newDiff : ''])
    downloadCSV(`每日餘額核對_${selCheck.company}`,
      toCSV(['日期', '當日淨變動', '系統推算餘額', '銀行帳戶餘額', '差額(推算−銀行)', '新增差異'], rows))
  }

  return (
    <div className="space-y-4">
      <div className="bg-brand-soft border border-brand-light/40 rounded-lg p-3 text-xs text-gray-600 leading-relaxed">
        每家公司各有一個台幣帳戶，各自對該公司的 <b>{CASH_ACCOUNT_CODE} {cashName}</b>：
        以 <b>{ANCHOR_DATE.replace(/-/g, '/')} 的期初餘額為起點</b>，加上之後該公司每筆交易的 {CASH_ACCOUNT_CODE} 進出，
        算出系統推算餘額，再與機器人從網銀抓回的<b>同一天</b>該公司帳戶餘額比對；
        不符時點開公司看逐日明細，「新增差異」的那天就是匯入出問題的地方。
        <br />※ 期初餘額由財務提供、固定在系統設定中（網銀僅能查三個月內歷史餘額，無法由機器人補查）；
        銀行餘額由機器人每天自動抓取。本頁僅供檢視，不開放人工輸入。
      </div>

      <div className={`rounded-lg px-3 py-2 text-sm border ${!robot.lastRun ? 'text-gray-500 bg-white border-gray-200' : stale ? 'text-amber-800 bg-amber-50 border-amber-200' : 'text-gray-700 bg-white border-gray-200'}`}>
        {!robot.lastRun
          ? '機器人尚未寫入任何銀行餘額。'
          : <>機器人最後更新：<b>{fmtTime(robot.lastRun)}</b>，最新餘額日期：<b>{robot.lastDate}</b>
            {stale && <span className="ml-2">⚠ 昨天（{yesterday}）的餘額尚未寫入，請確認機器人是否正常執行。</span>}</>}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <div className="px-4 pt-3 text-sm font-medium text-gray-700">核對結果（點一列看逐日明細）</div>
        <table className="w-full min-w-[900px] text-sm">
          <thead><tr className="text-gray-500 text-xs">
            <th className="px-3 py-2 text-left">公司</th><th className="px-3 py-2 text-left">台幣帳號</th>
            <th className="px-3 py-2 text-right">{ANCHOR_DATE.replace(/-/g, '/')} 期初餘額</th>
            <th className="px-3 py-2 text-left">比對日</th>
            <th className="px-3 py-2 text-right">系統推算</th><th className="px-3 py-2 text-right">銀行（機器人）</th>
            <th className="px-3 py-2 text-right">差額</th><th className="px-3 py-2 text-left">第一個差異日</th>
          </tr></thead>
          <tbody>
            {configs.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-400">尚未設定任何台幣帳戶（openingBalances.mjs）。</td></tr>}
            {configs.map((cfg) => {
              const c = checks.get(cfg.accountNo)
              if (!c) {
                return (
                  <tr key={cfg.accountNo} className="border-t border-gray-100">
                    <td className="px-3 py-2 text-red-600">{cfg.configured}</td>
                    <td className="px-3 py-2 text-gray-600">{cfg.accountNo}</td>
                    <td colSpan={6} className="px-3 py-2 text-xs text-red-600">
                      設定的公司「{cfg.configured}」對不到系統公司清單，請修正 openingBalances.mjs 或在「設定 → 公司」確認名稱。
                    </td>
                  </tr>
                )
              }
              const d = c.latest?.diff
              return (
                <tr key={cfg.accountNo} onClick={() => setSel(sel === cfg.accountNo ? '' : cfg.accountNo)}
                  className={`border-t border-gray-100 cursor-pointer hover:bg-brand-soft/50 ${sel === cfg.accountNo ? 'bg-brand-soft' : ''}`}>
                  <td className="px-3 py-2 text-gray-700">{c.company}</td>
                  <td className="px-3 py-2 text-gray-600">{cfg.accountNo}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatTWD(c.opening)}
                    <div className={`text-[11px] ${c.anchorDiff === 0 ? 'text-green-600' : 'text-red-600'}`}
                      title="該公司 112 自開帳累計到起算日的帳上餘額是否等於期初餘額；不符代表起算日前的歷史資料或期初有誤，資產負債表的銀行現金會不正確">
                      {c.anchorDiff === 0 ? '✓ 帳上相符' : `✗ 帳上 ${formatTWD(c.bookAtAnchor)}`}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{c.latest?.date ?? '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.latest ? formatTWD(c.latest.computed) : '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.latest ? formatTWD(c.latest.bank!) : <span className="text-xs text-gray-400">尚無</span>}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {d === undefined ? <span className="text-gray-300">—</span> : d === 0 ? <span className="text-green-600">✓ 相符</span> : <span className="text-red-600 font-medium">✗ {formatTWD(d)}</span>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {c.firstBreak ? <span className="text-red-600">{c.firstBreak}{c.breakCount > 1 && <span className="text-xs text-gray-500">（共 {c.breakCount} 天）</span>}</span> : <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {selCheck && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-medium text-gray-700">逐日明細：{selCheck.company}（{CASH_ACCOUNT_CODE} {cashName}）</div>
            <div className="flex gap-1 ml-auto text-xs">
              {([['all', '全部'], ['break', '新增差異日']] as [RowFilter, string][]).map(([f, l]) => (
                <button key={f} onClick={() => setFilter(f)} className={`px-2.5 py-1 rounded ${filter === f ? 'bg-brand text-white' : 'border border-gray-300 text-gray-600'}`}>{l}</button>
              ))}
              <button onClick={exportDetail} className="px-2.5 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50">⬇ 匯出</button>
            </div>
          </div>
          <div className="text-xs text-gray-500">「新增差異」≠ 0 的列：問題發生在上一個有銀行餘額的日期之後、到該日為止的匯入資料中。沒有銀行餘額的日期只顯示系統推算。</div>
          <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="sticky top-0"><tr className="bg-gray-50 text-gray-500 text-xs">
                <th className="px-3 py-2 text-left">日期</th><th className="px-3 py-2 text-right">當日淨變動</th>
                <th className="px-3 py-2 text-right">系統推算餘額</th><th className="px-3 py-2 text-right">銀行帳戶餘額</th>
                <th className="px-3 py-2 text-right">差額</th><th className="px-3 py-2 text-right">新增差異</th>
              </tr></thead>
              <tbody>
                {detailRows.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">沒有符合的日期。</td></tr>}
                {detailRows.map((r) => (
                  <tr key={r.date} className={`border-t border-gray-100 ${r.newDiff ? 'bg-red-50' : ''}`}>
                    <td className="px-3 py-1.5 text-gray-700">{r.date}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">{r.net ? formatTWD(r.net) : '—'}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{formatTWD(r.computed)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{r.bank !== undefined ? formatTWD(r.bank) : <span className="text-gray-300">—</span>}</td>
                    <td className={`px-3 py-1.5 text-right tabular-nums ${r.diff === undefined ? 'text-gray-300' : r.diff === 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {r.diff === undefined ? '—' : r.diff === 0 ? '✓' : formatTWD(r.diff)}
                    </td>
                    <td className={`px-3 py-1.5 text-right tabular-nums ${r.newDiff ? 'text-red-700 font-semibold' : 'text-gray-300'}`}>{r.newDiff ? formatTWD(r.newDiff) : '—'}</td>
                  </tr>
                ))}
                {filter === 'all' && (
                  <tr className="border-t border-gray-200 bg-gray-50 text-gray-500">
                    <td className="px-3 py-1.5">{ANCHOR_DATE}</td><td className="px-3 py-1.5 text-right">期初</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{formatTWD(selCheck.opening)}</td>
                    <td colSpan={3}></td>
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
