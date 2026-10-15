import React, { useEffect, useMemo, useState } from 'react'
import { useLedger } from '../store/useLedger'
import {
  ANCHOR_DATE, balancePairs, computedBalanceOn, dailyBalanceId, dailyCheck, dailyNet, pairKey, parseAmount, parseBalanceRows,
  type BalancePair, type DailyCheck,
} from '../core/dailyBalance'
import { formatTWD } from '../core/money'
import { downloadCSV, parseDelimited, toCSV } from '../lib/csv'
import { fileToRows } from '../lib/xlsx'

const coLabel = (c: string) => c || '（未指定公司）'
type RowFilter = 'all' | 'break' | 'missing'

/**
 * 每日可用餘額核對：以起算日（2026/1/1）銀行餘額為錨點，加上之後每天匯入的銀行流水，
 * 推算每日日終餘額，與每天輸入的銀行可用餘額逐日比對；差額「新增」的那天就是匯入有問題的那天。
 */
export default function DailyBalance() {
  const { entries, accounts, companies, dailyBalances, saveDailyBalances, deleteDailyBalances } = useLedger()
  const today = new Date().toISOString().slice(0, 10)
  const cashAccounts = useMemo(() => accounts.filter((a) => a.isCash), [accounts])
  const cashCodes = useMemo(() => new Set(cashAccounts.map((a) => a.code)), [cashAccounts])
  const accName = (code: string) => accounts.find((a) => a.code === code)?.name ?? code

  // 手動加入的核對帳戶（尚無流水也無餘額紀錄者，例如只想先填起算餘額）
  const [extraPairs, setExtraPairs] = useState<BalancePair[]>([])
  const pairs = useMemo(() => {
    const base = balancePairs(entries, dailyBalances, cashCodes)
    const seen = new Set(base.map(pairKey))
    return [...base, ...extraPairs.filter((p) => !seen.has(pairKey(p)))]
  }, [entries, dailyBalances, cashCodes, extraPairs])

  const checks = useMemo(() => {
    const m = new Map<string, DailyCheck>()
    for (const p of pairs) m.set(pairKey(p), dailyCheck(entries, dailyBalances, p, today))
    return m
  }, [pairs, entries, dailyBalances, today])
  const nets = useMemo(() => {
    const m = new Map<string, Map<string, number>>()
    for (const p of pairs) m.set(pairKey(p), dailyNet(entries, p))
    return m
  }, [pairs, entries])

  // ── 每日輸入 ──────────────────────────────────────────────────────────────
  const [date, setDate] = useState(today)
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState('')
  const existingOn = (p: BalancePair, d: string) => dailyBalances.find((b) => b.id === dailyBalanceId(p.company, p.accountCode, d))
  useEffect(() => {
    const next: Record<string, string> = {}
    for (const p of pairs) {
      const ex = existingOn(p, date)
      next[pairKey(p)] = ex ? String(ex.balance) : ''
    }
    setInputs(next)
  }, [date, pairs, dailyBalances]) // eslint-disable-line react-hooks/exhaustive-deps

  async function saveDay() {
    const upserts: { date: string; company: string; accountCode: string; balance: number }[] = []
    const removes: string[] = []
    for (const p of pairs) {
      const raw = inputs[pairKey(p)] ?? ''
      const ex = existingOn(p, date)
      const v = parseAmount(raw)
      if (raw.trim() === '') { if (ex) removes.push(ex.id); continue }
      if (v === null) { setMsg(`✗ ${coLabel(p.company)} ${accName(p.accountCode)}：「${raw}」不是數字`); return }
      if (!ex || ex.balance !== v) upserts.push({ date, company: p.company, accountCode: p.accountCode, balance: v })
    }
    if (!upserts.length && !removes.length) { setMsg('沒有變更。'); return }
    try {
      if (upserts.length) await saveDailyBalances(upserts)
      if (removes.length) await deleteDailyBalances(removes)
      setMsg(`✓ 已儲存 ${date}：更新 ${upserts.length} 筆${removes.length ? `、清除 ${removes.length} 筆` : ''}。`)
    } catch (e) {
      setMsg(`✗ 儲存失敗：${(e as Error).message}`)
    }
  }

  const [newCo, setNewCo] = useState('')
  const [newAcc, setNewAcc] = useState('')
  function addPair() {
    const acc = newAcc || cashAccounts[0]?.code
    if (!acc) return
    setExtraPairs((xs) => [...xs, { company: newCo, accountCode: acc }])
  }

  // ── 總覽 / 逐日明細 ───────────────────────────────────────────────────────
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

  // ── 批次匯入 ──────────────────────────────────────────────────────────────
  const [showImport, setShowImport] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [fileRows, setFileRows] = useState<string[][] | null>(null)
  const resolveAccount = (s: string) => {
    const t = s.trim()
    if (!t) return cashAccounts.length === 1 ? cashAccounts[0].code : undefined
    return (cashAccounts.find((a) => a.code === t) ?? cashAccounts.find((a) => a.name === t) ?? cashAccounts.find((a) => a.name.includes(t) || t.includes(a.name)))?.code
  }
  const parsed = useMemo(() => {
    const rows = fileRows ?? parseDelimited(pasteText)
    return rows.length ? parseBalanceRows(rows, resolveAccount, companies) : null
  }, [fileRows, pasteText, companies, cashAccounts]) // eslint-disable-line react-hooks/exhaustive-deps
  async function onFile(f: File | undefined) {
    if (!f) return
    setFileRows(await fileToRows(f))
  }
  async function doImport() {
    if (!parsed?.ok.length) return
    try {
      await saveDailyBalances(parsed.ok.map(({ date, company, accountCode, balance }) => ({ date, company, accountCode, balance })))
      setMsg(`✓ 已匯入 ${parsed.ok.length} 筆每日餘額。`)
      setPasteText(''); setFileRows(null); setShowImport(false)
    } catch (e) {
      setMsg(`✗ 匯入失敗：${(e as Error).message}`)
    }
  }

  const isAnchorDay = date === ANCHOR_DATE

  return (
    <div className="space-y-4">
      <div className="bg-brand-soft border border-brand-light/40 rounded-lg p-3 text-xs text-gray-600 leading-relaxed">
        以 <b>{ANCHOR_DATE.replace(/-/g, '/')} 的銀行餘額為起點</b>，加上之後每天匯入的銀行流水，推算各公司、各銀行帳戶的每日日終餘額，
        再與當天的<b>銀行帳戶餘額</b>比對。差額<b>「新增」</b>的那一天，就是那段期間的匯入有漏、重複或金額錯誤。
        每日核對不受起算日之前的歷史資料影響；總覽的「帳上起算餘額」另外檢查系統自開帳累計到起算日的餘額是否等於銀行，確保資產負債表的銀行存款正確。餘額請填<b>當日日終</b>數字（例如隔天早上看到的前一日餘額）。
        <br />※ 核對用的是網銀的<b>「帳戶餘額」</b>：「可用餘額」＝帳戶餘額 − 當日交換票 − 圈存 ＋ 透支額度，有圈存或透支時會與流水推算不同。
        標 <span className="text-[10px] px-1 rounded bg-violet-100 text-violet-700">RPA</span> 者為機器人自動填入。
      </div>

      {msg && <div className={`text-sm rounded-lg px-3 py-2 border ${msg.startsWith('✗') ? 'text-red-700 bg-red-50 border-red-200' : 'text-green-700 bg-green-50 border-green-200'}`}>{msg}</div>}

      {/* 每日輸入 */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">餘額日期（日終）</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inp} />
          </div>
          <div className="flex gap-1 text-xs">
            <button onClick={() => setDate(shiftDate(date, -1))} className={btnSm}>← 前一天</button>
            <button onClick={() => setDate(shiftDate(date, 1))} className={btnSm}>後一天 →</button>
            <button onClick={() => setDate(ANCHOR_DATE)} className={btnSm}>起算日</button>
          </div>
          <button onClick={() => setShowImport((v) => !v)} className={`${btnSm} ml-auto`}>{showImport ? '收合批次匯入' : '⇪ 批次匯入（補登歷史）'}</button>
        </div>
        {isAnchorDay && <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">這天是起算日：填入的餘額即為之後所有推算的起點。</div>}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead><tr className="bg-gray-50 text-gray-500 text-xs">
              <th className="px-3 py-2 text-left">公司</th><th className="px-3 py-2 text-left">銀行科目</th>
              <th className="px-3 py-2 text-right">當日淨變動</th><th className="px-3 py-2 text-right">系統推算餘額</th>
              <th className="px-3 py-2 text-right w-44">銀行帳戶餘額</th><th className="px-3 py-2 text-right">差額</th>
            </tr></thead>
            <tbody>
              {pairs.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">尚無銀行流水，請在下方加入要核對的公司與銀行科目。</td></tr>}
              {pairs.map((p) => {
                const k = pairKey(p)
                const c = checks.get(k)!
                const net = nets.get(k)!
                const anchorForDay = c.anchor && c.anchor.date <= date ? c.anchor : undefined
                const computed = isAnchorDay ? undefined : computedBalanceOn(net, anchorForDay, date)
                const v = parseAmount(inputs[k] ?? '')
                const diff = computed !== undefined && v !== null ? computed - v : null
                const ex = existingOn(p, date)
                return (
                  <tr key={k} className="border-t border-gray-100">
                    <td className="px-3 py-1.5 text-gray-700">{coLabel(p.company)}</td>
                    <td className="px-3 py-1.5 text-gray-600">{p.accountCode} {accName(p.accountCode)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{net.get(date) ? formatTWD(net.get(date)!) : '—'}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {computed !== undefined ? formatTWD(computed)
                        : <span className="text-xs text-gray-400">{isAnchorDay ? '（起算）' : '尚無起算餘額'}</span>}
                    </td>
                    <td className="px-3 py-1.5">
                      <input value={inputs[k] ?? ''} onChange={(e) => setInputs((s) => ({ ...s, [k]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === 'Enter') saveDay() }}
                        inputMode="numeric" placeholder="銀行 App 餘額" className={`${inp} text-right tabular-nums`} />
                      {ex && (ex.source === 'rpa' || (ex.available !== undefined && ex.available !== ex.balance)) && (
                        <div className="text-[11px] text-gray-500 text-right mt-0.5">
                          {ex.source === 'rpa' && <span className="px-1 rounded bg-violet-100 text-violet-700 mr-1">RPA</span>}
                          {ex.available !== undefined && ex.available !== ex.balance && <>可用 {formatTWD(ex.available)}</>}
                        </div>
                      )}
                    </td>
                    <td className={`px-3 py-1.5 text-right tabular-nums ${diff === null ? 'text-gray-300' : diff === 0 ? 'text-green-600' : 'text-red-600 font-medium'}`}>
                      {diff === null ? '—' : diff === 0 ? '✓' : formatTWD(diff)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <select value={newCo} onChange={(e) => setNewCo(e.target.value)} className="border border-gray-300 rounded px-2 py-1.5 text-xs">
            <option value="">（未指定公司）</option>
            {companies.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={newAcc} onChange={(e) => setNewAcc(e.target.value)} className="border border-gray-300 rounded px-2 py-1.5 text-xs">
            {cashAccounts.map((a) => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}
          </select>
          <button onClick={addPair} className={btnSm}>＋ 加入核對帳戶</button>
          <button onClick={saveDay} className="ml-auto px-4 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-dark">儲存 {date} 餘額</button>
        </div>
      </div>

      {showImport && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <div className="text-sm font-medium text-gray-700">批次匯入每日餘額</div>
          <div className="text-xs text-gray-500 leading-relaxed">
            從 Excel 複製貼上或上傳檔案，四欄：<b>日期、公司、銀行科目（代號或名稱）、餘額</b>，第一列可為標題。
            日期可用 2026/1/5 或民國 115/1/5；同一公司＋科目＋日期重複匯入會覆寫。
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input type="file" accept=".xlsx,.xls,.csv,.txt" onChange={(e) => onFile(e.target.files?.[0])} className="text-xs" />
            {fileRows && <button onClick={() => setFileRows(null)} className={btnSm}>改用貼上</button>}
          </div>
          {!fileRows && (
            <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={6}
              placeholder={'日期\t公司\t科目\t餘額\n2026/1/1\t菸酒\t1102\t1,234,567'}
              className="w-full border border-gray-300 rounded p-2 text-xs font-mono" />
          )}
          {parsed && (
            <div className="text-xs space-y-1">
              <div className="text-gray-600">可匯入 <b>{parsed.ok.length}</b> 筆{parsed.errors.length > 0 && <>，<span className="text-red-600">錯誤 {parsed.errors.length} 列</span></>}</div>
              {parsed.errors.slice(0, 10).map((e) => <div key={e} className="text-red-600">{e}</div>)}
              {parsed.errors.length > 10 && <div className="text-red-600">…另 {parsed.errors.length - 10} 列</div>}
            </div>
          )}
          <button onClick={doImport} disabled={!parsed?.ok.length} className="px-4 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-dark disabled:opacity-50">匯入</button>
        </div>
      )}

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
                      : <span className="text-xs text-red-600">未填 {ANCHOR_DATE} 餘額</span>}
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
              <button onClick={exportDetail} className={btnSm}>⬇ 匯出</button>
            </div>
          </div>
          <div className="text-xs text-gray-500">「新增差異」≠ 0 的列：問題發生在上一個核對日之後、到該日為止的匯入資料中。點日期可帶入上方輸入。</div>
          <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="sticky top-0"><tr className="bg-gray-50 text-gray-500 text-xs">
                <th className="px-3 py-2 text-left">日期</th><th className="px-3 py-2 text-right">當日淨變動</th>
                <th className="px-3 py-2 text-right">系統推算餘額</th><th className="px-3 py-2 text-right">銀行帳戶餘額</th>
                <th className="px-3 py-2 text-right">差額</th><th className="px-3 py-2 text-right">新增差異</th>
              </tr></thead>
              <tbody>
                {detailRows.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">{selCheck.anchor ? '沒有符合的日期。' : `請先填入 ${ANCHOR_DATE} 的起算餘額。`}</td></tr>}
                {detailRows.map((r) => (
                  <tr key={r.date} className={`border-t border-gray-100 ${r.newDiff ? 'bg-red-50' : ''}`}>
                    <td className="px-3 py-1.5"><button onClick={() => setDate(r.date)} className="text-brand hover:underline">{r.date}</button></td>
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

const inp = 'w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand'
const btnSm = 'px-2.5 py-1.5 rounded border border-gray-300 text-gray-600 text-xs hover:bg-gray-50'
