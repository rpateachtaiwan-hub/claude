import React, { useMemo, useState } from 'react'
import { useLedger } from '../store/useLedger'
import { accountDrilldown, balanceSheet, cashFlow, profitAndLoss, type DrillItem, type Pnl } from '../core/reports'
import { formatTWD } from '../core/money'
import { downloadCSV, toCSV } from '../lib/csv'
import Recon from './Recon'

type Tab = 'pnl' | 'bs' | 'cf' | 'recon'
type Gran = 'all' | 'year' | 'month'

/** 下鑽目標：month = 0–11 為矩陣的月欄、-1 為全年欄、undefined 為一般損益表列 */
type Drill = { code: string; name: string; month?: number }

export default function Reports() {
  const { entries: allEntries, accounts, companies } = useLedger()
  const [tab, setTab] = useState<Tab>('pnl')
  const [gran, setGran] = useState<Gran>('all')
  const [period, setPeriod] = useState('')
  const [zoom, setZoom] = useState(1)
  const [companyFilter, setCompanyFilter] = useState('')
  const [drill, setDrill] = useState<Drill | null>(null)
  React.useEffect(() => { setDrill(null) }, [tab, gran, period, companyFilter])

  const entries = useMemo(
    () => (companyFilter ? allEntries.filter((e) => e.company === companyFilter) : allEntries),
    [allEntries, companyFilter],
  )

  const { years, months } = useMemo(() => {
    const ys = new Set<string>(); const ms = new Set<string>()
    for (const e of allEntries) { ys.add(e.date.slice(0, 4)); ms.add(e.date.slice(0, 7)) }
    ys.add(String(new Date().getFullYear())) // 永遠可選當年
    return { years: [...ys].sort().reverse(), months: [...ms].sort().reverse() }
  }, [allEntries])

  const { range, asOf, label } = useMemo(() => {
    if (gran === 'year' && period) return { range: { from: `${period}-01-01`, to: `${period}-12-31` }, asOf: `${period}-12-31`, label: `${period} 年` }
    if (gran === 'month' && period) return { range: { from: `${period}-01`, to: `${period}-31` }, asOf: `${period}-31`, label: period }
    return { range: undefined, asOf: undefined, label: '全部期間' }
  }, [gran, period])

  const pnl = profitAndLoss(entries, accounts, range, true)
  const bs = balanceSheet(entries, accounts, asOf, true)
  const cf = cashFlow(entries, accounts, range, true)

  // 依年的損益矩陣（仿試算表：科目 × 12 月）
  const matrix = useMemo(() => {
    if (!(tab === 'pnl' && gran === 'year' && period)) return null
    const mm = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'))
    const per = mm.map((m) => profitAndLoss(entries, accounts, { from: `${period}-${m}-01`, to: `${period}-${m}-31` }, true))
    const annual = profitAndLoss(entries, accounts, { from: `${period}-01-01`, to: `${period}-12-31` }, true)
    const amt = (p: Pnl, code: string) => p.rows.find((r) => r.code === code)?.amount ?? 0
    const list = (cat: 'revenue' | 'expense') =>
      accounts.filter((a) => a.category === cat).map((a) => ({ code: a.code, name: a.name })).sort((a, b) => a.code.localeCompare(b.code))
    return { year: period, mm, per, annual, amt, revAccts: list('revenue'), expAccts: list('expense') }
  }, [tab, gran, period, entries, accounts])

  // 下鑽明細：依點擊目標決定期間（矩陣的某月/全年，或目前檢視的期間）
  const drillRange = useMemo(() => {
    if (!drill) return undefined
    if (matrix && drill.month !== undefined) {
      if (drill.month === -1) return { from: `${matrix.year}-01-01`, to: `${matrix.year}-12-31` }
      const m = String(drill.month + 1).padStart(2, '0')
      return { from: `${matrix.year}-${m}-01`, to: `${matrix.year}-${m}-31` }
    }
    return range
  }, [drill, matrix, range])
  const drillItems = useMemo(
    () => (drill ? accountDrilldown(entries, accounts, drill.code, drillRange) : []),
    [drill, entries, accounts, drillRange],
  )
  const drillTitle = drill
    ? `${drill.code} ${drill.name} · ${matrix && drill.month !== undefined
        ? (drill.month === -1 ? `${matrix.year} 全年` : `${matrix.year}/${String(drill.month + 1).padStart(2, '0')}`)
        : label}`
    : ''
  const accName = (code: string) => accounts.find((a) => a.code === code)?.name ?? code
  const toggleDrill = (code: string, name: string, month?: number) =>
    setDrill((d) => (d && d.code === code && d.month === month ? null : { code, name, month }))
  const drillPanel = drill
    ? <DrillPanel code={drill.code} title={drillTitle} items={drillItems} accName={accName} onClose={() => setDrill(null)} />
    : null

  function exportCsv() {
    if (tab === 'pnl' && matrix) {
      const mx = matrix
      const head = ['科目名稱', '編號', ...mx.mm.map((m) => `${mx.year}/${m}`), '全年']
      const rows: (string | number)[][] = []
      const line = (name: string, code: string, get: (p: Pnl) => number) =>
        rows.push([name, code, ...mx.per.map(get), get(mx.annual)])
      line('收入', '', (p) => p.revenue)
      mx.revAccts.forEach((r) => line(r.name, r.code, (p) => mx.amt(p, r.code)))
      line('成本', '', (p) => p.expense)
      mx.expAccts.forEach((r) => line(r.name, r.code, (p) => mx.amt(p, r.code)))
      line('稅前毛利', '', (p) => p.netIncome)
      rows.push(['毛利率', '', ...mx.per.map((p) => marginStr(p)), marginStr(mx.annual)])
      downloadCSV(`損益表_${label}`, toCSV(head, rows))
    } else if (tab === 'pnl') {
      const rows: (string | number)[][] = pnl.rows.map((r) => [r.code, r.name, r.category === 'revenue' ? '收入' : '費用', r.amount])
      rows.push(['', '收入合計', '', pnl.revenue], ['', '費用合計', '', pnl.expense], ['', '本期淨利', '', pnl.netIncome])
      downloadCSV(`損益表_${label}`, toCSV(['編號', '科目', '類別', '金額'], rows))
    } else if (tab === 'bs') {
      const rows: (string | number)[][] = []
      bs.assets.forEach((r) => rows.push(['資產', r.name, r.amount]))
      rows.push(['', '資產總計', bs.totalAssets])
      bs.liabilities.forEach((r) => rows.push(['負債', r.name, r.amount]))
      bs.equity.forEach((r) => rows.push(['權益', r.name, r.amount]))
      rows.push(['', '負債+權益', bs.totalLiabilities + bs.totalEquity])
      downloadCSV(`資產負債表_${label}`, toCSV(['分類', '科目', '金額'], rows))
    } else {
      const rows: (string | number)[][] = []
      cf.operating.forEach((r) => rows.push(['營業', r.name, r.amount]))
      cf.investing.forEach((r) => rows.push(['投資', r.name, r.amount]))
      cf.financing.forEach((r) => rows.push(['理財', r.name, r.amount]))
      rows.push(['', '本期淨變動', cf.netChange], ['', '期末現金', cf.endingCash])
      downloadCSV(`現金流量表_${label}`, toCSV(['活動', '科目', '金額'], rows))
    }
  }

  return (
    <div className="w-full p-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {([['pnl', '損益表'], ['bs', '資產負債表'], ['cf', '現金流量表'], ['recon', '銀行對帳']] as [Tab, string][]).map(([t, l]) => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-2 rounded-lg text-sm font-medium ${tab === t ? 'bg-brand text-white' : 'bg-white border border-gray-300 text-gray-600'}`}>{l}</button>
        ))}
        {tab !== 'recon' && <button onClick={exportCsv} className="ml-auto px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50">⬇ 匯出 Excel</button>}
      </div>

      {tab === 'recon' && <Recon />}

      {tab !== 'recon' && <div className="flex flex-wrap items-center gap-2 text-sm">
        {companies.length > 0 && (
          <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1.5 font-medium">
            <option value="">全部公司（合併）</option>
            {companies.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        {([['all', '全部'], ['year', '依年'], ['month', '依月']] as [Gran, string][]).map(([g, l]) => (
          <button key={g} onClick={() => { setGran(g); setPeriod(g === 'year' ? years[0] ?? '' : g === 'month' ? months[0] ?? '' : '') }}
            className={`px-3 py-1.5 rounded-lg text-sm ${gran === g ? 'bg-gray-800 text-white' : 'bg-white border border-gray-300 text-gray-600'}`}>{l}</button>
        ))}
        {gran === 'year' && (
          <select value={period} onChange={(e) => setPeriod(e.target.value)} className="border border-gray-300 rounded px-2 py-1.5">
            {years.map((y) => <option key={y} value={y}>{y} 年</option>)}
          </select>
        )}
        {gran === 'month' && (
          <select value={period} onChange={(e) => setPeriod(e.target.value)} className="border border-gray-300 rounded px-2 py-1.5">
            {months.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        )}

        {/* 放大 / 縮小 */}
        <div className="ml-auto flex items-center gap-1">
          <span className="text-xs text-gray-400 mr-1">縮放</span>
          <button onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)))} className="w-7 h-7 rounded border border-gray-300 text-gray-600 hover:bg-gray-50">－</button>
          <button onClick={() => setZoom(1)} className="px-2 h-7 rounded border border-gray-300 text-xs text-gray-600 hover:bg-gray-50 tabular-nums">{Math.round(zoom * 100)}%</button>
          <button onClick={() => setZoom((z) => Math.min(1.8, +(z + 0.1).toFixed(2)))} className="w-7 h-7 rounded border border-gray-300 text-gray-600 hover:bg-gray-50">＋</button>
        </div>
      </div>}

      {tab !== 'recon' && <div style={{ ['zoom' as keyof React.CSSProperties]: zoom } as React.CSSProperties}>
        {tab === 'pnl' && !matrix && (
          <Card title="損益表" subtitle={`${label} · 點科目列可展開分錄明細`}>
            <Section label="收入">{pnl.rows.filter((r) => r.category === 'revenue').map((r, i) => (
              <React.Fragment key={r.code}>
                <Row name={r.name} amount={r.amount} zebra={i % 2 === 1}
                  active={drill?.code === r.code && drill.month === undefined}
                  onClick={() => toggleDrill(r.code, r.name)} />
                {drill?.code === r.code && drill.month === undefined && drillPanel}
              </React.Fragment>
            ))}</Section>
            <Total name="收入合計" amount={pnl.revenue} />
            <Section label="費用 / 成本">{pnl.rows.filter((r) => r.category === 'expense').map((r, i) => (
              <React.Fragment key={r.code}>
                <Row name={r.name} amount={r.amount} zebra={i % 2 === 1}
                  active={drill?.code === r.code && drill.month === undefined}
                  onClick={() => toggleDrill(r.code, r.name)} />
                {drill?.code === r.code && drill.month === undefined && drillPanel}
              </React.Fragment>
            ))}</Section>
            <Total name="費用合計" amount={pnl.expense} />
            <Total name="本期淨利" amount={pnl.netIncome} strong highlight />
          </Card>
        )}

        {tab === 'pnl' && matrix && <PnlMatrix mx={matrix} drill={drill} onCell={toggleDrill} detail={drillPanel} />}

        {tab === 'bs' && (
          <Card title="資產負債表" subtitle={asOf ? `截至 ${asOf}` : '截至目前'}>
            <Section label="資產">{bs.assets.map((r, i) => <Row key={r.code} name={r.name} amount={r.amount} zebra={i % 2 === 1} />)}</Section>
            <Total name="資產總計" amount={bs.totalAssets} strong />
            <Section label="負債">{bs.liabilities.map((r, i) => <Row key={r.code} name={r.name} amount={r.amount} zebra={i % 2 === 1} />)}</Section>
            <Total name="負債合計" amount={bs.totalLiabilities} />
            <Section label="權益">{bs.equity.map((r, i) => <Row key={r.code} name={r.name} amount={r.amount} zebra={i % 2 === 1} />)}</Section>
            <Total name="權益合計" amount={bs.totalEquity} />
            <Total name="負債 + 權益" amount={bs.totalLiabilities + bs.totalEquity} strong highlight={bs.balanced} />
            {!bs.balanced && <p className="text-xs text-red-600 mt-1">⚠ 資產與負債+權益不相等，請檢查資料。</p>}
          </Card>
        )}

        {tab === 'cf' && (
          <Card title="現金流量表（直接法）" subtitle={label}>
            <Section label="營業活動">{cf.operating.map((r, i) => <Row key={r.code} name={r.name} amount={r.amount} zebra={i % 2 === 1} />)}</Section>
            <Total name="營業活動現金流" amount={cf.operatingTotal} />
            <Section label="投資活動">{cf.investing.map((r, i) => <Row key={r.code} name={r.name} amount={r.amount} zebra={i % 2 === 1} />)}</Section>
            <Total name="投資活動現金流" amount={cf.investingTotal} />
            <Section label="理財活動">{cf.financing.map((r, i) => <Row key={r.code} name={r.name} amount={r.amount} zebra={i % 2 === 1} />)}</Section>
            <Total name="理財活動現金流" amount={cf.financingTotal} />
            <Total name="本期現金淨變動" amount={cf.netChange} strong />
            <Total name="期末現金餘額" amount={cf.endingCash} strong highlight />
          </Card>
        )}
      </div>}
    </div>
  )
}

function marginStr(p: Pnl): string {
  return p.revenue > 0 ? `${((p.netIncome / p.revenue) * 100).toFixed(1)}%` : '—'
}

// ── 依年損益矩陣（仿試算表）──────────────────────────────────────────────────
type Mx = {
  year: string
  mm: string[]
  per: Pnl[]
  annual: Pnl
  amt: (p: Pnl, code: string) => number
  revAccts: { code: string; name: string }[]
  expAccts: { code: string; name: string }[]
}

function PnlMatrix({ mx, drill, onCell, detail }: {
  mx: Mx
  drill: Drill | null
  onCell: (code: string, name: string, month: number) => void
  detail: React.ReactNode
}) {
  const numCell = (v: number) =>
    v === 0 ? <span className="text-gray-300">0</span> : <span className={v < 0 ? 'text-rose-600' : ''}>{formatTWD(v)}</span>

  const td = 'border border-gray-200 px-2 py-1.5 text-right tabular-nums whitespace-nowrap'
  const clickTd = `${td} cursor-pointer hover:bg-white/80`
  const activeTd = 'ring-2 ring-brand ring-inset bg-white'
  const nameTd = 'border border-gray-200 px-2 py-1.5 text-left whitespace-nowrap sticky left-0'
  const codeTd = 'border border-gray-200 px-2 py-1.5 text-center text-gray-400'
  const colSpan = mx.mm.length + 3

  const acctRow = (r: { code: string; name: string }, rowBg: string) => (
    <React.Fragment key={r.code}>
      <tr className={`${rowBg} text-gray-700`}>
        <td className={`${nameTd} ${rowBg.split(' ')[0]}`}>{r.name}</td>
        <td className={codeTd}>{r.code}</td>
        {mx.per.map((p, i) => (
          <td key={i} title="點擊展開此月分錄明細" onClick={() => onCell(r.code, r.name, i)}
            className={`${clickTd} ${drill?.code === r.code && drill.month === i ? activeTd : ''}`}>
            {numCell(mx.amt(p, r.code))}
          </td>
        ))}
        <td title="點擊展開全年分錄明細" onClick={() => onCell(r.code, r.name, -1)}
          className={`${clickTd} font-semibold ${drill?.code === r.code && drill.month === -1 ? activeTd : ''}`}>
          {numCell(mx.amt(mx.annual, r.code))}
        </td>
      </tr>
      {drill?.code === r.code && (
        <tr><td colSpan={colSpan} className="border border-gray-200 bg-brand-soft/30 p-2">{detail}</td></tr>
      )}
    </React.Fragment>
  )

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <h2 className="text-base font-bold text-gray-900 mb-1">損益表 · {mx.year} 年（1~12 月）</h2>
      <p className="text-xs text-gray-400 mb-3">左右可捲動；右上可放大/縮小；<b>點任一數字</b>可展開該科目該月的分錄明細</p>
      <div className="overflow-x-auto">
        <table className="text-xs border-collapse">
          <thead>
            <tr className="bg-brand-soft text-gray-600">
              <th className={`${nameTd} bg-brand-soft min-w-[150px] z-10`}>科目名稱</th>
              <th className="border border-gray-200 px-2 py-1.5 text-center min-w-[56px]">編號</th>
              {mx.mm.map((m) => <th key={m} className="border border-gray-200 px-2 py-1.5 text-right whitespace-nowrap min-w-[80px]">{mx.year}/{m}</th>)}
              <th className="border border-gray-200 px-2 py-1.5 text-right whitespace-nowrap min-w-[90px]">全年</th>
            </tr>
          </thead>
          <tbody>
            {/* 收入 */}
            <tr className="bg-brand text-white font-semibold">
              <td className={`${nameTd} bg-brand`}>收入</td>
              <td className="border border-brand-dark/30"></td>
              {mx.per.map((p, i) => <td key={i} className={td}>{p.revenue === 0 ? 0 : formatTWD(p.revenue)}</td>)}
              <td className={td}>{formatTWD(mx.annual.revenue)}</td>
            </tr>
            {mx.revAccts.map((r) => acctRow(r, 'bg-brand-soft'))}
            {/* 成本 */}
            <tr className="bg-brand text-white font-semibold">
              <td className={`${nameTd} bg-brand`}>成本</td>
              <td className="border border-brand-dark/30"></td>
              {mx.per.map((p, i) => <td key={i} className={td}>{p.expense === 0 ? 0 : formatTWD(p.expense)}</td>)}
              <td className={td}>{formatTWD(mx.annual.expense)}</td>
            </tr>
            {mx.expAccts.map((r) => acctRow(r, 'bg-amber-50'))}
            {/* 稅前毛利 */}
            <tr className="bg-brand-light/30 font-bold text-gray-900">
              <td className={`${nameTd} bg-brand-light/30`}>稅前毛利</td>
              <td className="border border-gray-200"></td>
              {mx.per.map((p, i) => <td key={i} className={td}>{numCell(p.netIncome)}</td>)}
              <td className={td}>{numCell(mx.annual.netIncome)}</td>
            </tr>
            {/* 毛利率 */}
            <tr className="bg-brand-soft text-gray-700">
              <td className={`${nameTd} bg-brand-soft`}>毛利率</td>
              <td className="border border-gray-200"></td>
              {mx.per.map((p, i) => <td key={i} className={td}>{marginStr(p)}</td>)}
              <td className={td}>{marginStr(mx.annual)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** 下鑽明細面板：列出構成報表數字的分錄，合計必等於被點擊的數字。 */
function DrillPanel({ code, title, items, accName, onClose }: {
  code: string
  title: string
  items: DrillItem[]
  accName: (code: string) => string
  onClose: () => void
}) {
  const total = items.reduce((s, it) => s + it.amount, 0)
  const fmtSeq = (n?: number) => (typeof n === 'number' ? `#${String(n).padStart(5, '0')}` : '—')
  return (
    <div className="bg-white border border-brand-light/60 rounded-lg my-1 shadow-sm text-left" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-100">
        <span className="text-xs font-semibold text-brand-dark">{title} · {items.length} 筆 · 合計 {formatTWD(total)}</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xs whitespace-nowrap">✕ 收合</button>
      </div>
      {items.length === 0 ? (
        <div className="px-3 py-3 text-xs text-gray-400">此期間沒有分錄。</div>
      ) : (
        <div className="max-h-72 overflow-y-auto overflow-x-auto">
          <table className="w-full min-w-[560px] text-xs">
            <thead><tr className="text-gray-400 bg-gray-50">
              <th className="px-2 py-1.5 text-left whitespace-nowrap">日期</th>
              <th className="px-2 py-1.5 text-left">流水號</th>
              <th className="px-2 py-1.5 text-left">公司</th>
              <th className="px-2 py-1.5 text-left">摘要</th>
              <th className="px-2 py-1.5 text-left">對方科目</th>
              <th className="px-2 py-1.5 text-left">類型</th>
              <th className="px-2 py-1.5 text-right">金額</th>
            </tr></thead>
            <tbody>
              {items.map(({ entry: e, amount }, i) => {
                const other = e.lines.find((l) => l.accountCode !== code)
                return (
                  <tr key={e.id} className={`border-t border-gray-100 ${i % 2 ? 'bg-gray-50/60' : ''}`}>
                    <td className="px-2 py-1.5 text-gray-500 whitespace-nowrap">{e.date}</td>
                    <td className="px-2 py-1.5 text-gray-400 tabular-nums whitespace-nowrap">{fmtSeq(e.seq)}</td>
                    <td className="px-2 py-1.5 text-gray-600 whitespace-nowrap">{e.company ?? '—'}</td>
                    <td className="px-2 py-1.5 text-gray-700">{e.description}{e.needsReview && <span className="ml-1 text-amber-600">⚠</span>}</td>
                    <td className="px-2 py-1.5 text-gray-500 whitespace-nowrap">{other ? accName(other.accountCode) : '—'}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      {e.source === 'accrual'
                        ? <span className="text-[10px] text-amber-700 bg-amber-50 rounded px-1">應計</span>
                        : e.source === 'settlement'
                          ? <span className="text-[10px] text-brand bg-brand-soft rounded px-1">沖銷</span>
                          : <span className="text-[10px] text-gray-400">現金</span>}
                    </td>
                    <td className={`px-2 py-1.5 text-right tabular-nums ${amount < 0 ? 'text-rose-600' : 'text-gray-800'}`}>{formatTWD(amount)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-base font-bold text-gray-900">{title}</h2>
      {subtitle && <p className="text-xs text-gray-400 mb-2">{subtitle}</p>}
      <div>{children}</div>
    </div>
  )
}
function Section({ label, children }: { label: string; children: React.ReactNode }) {
  const arr = React.Children.toArray(children)
  return (
    <div className="pt-5">
      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{label}</div>
      {arr.length ? arr : <div className="text-sm text-gray-300 py-2">—</div>}
    </div>
  )
}
function Row({ name, amount, zebra, onClick, active }: { name: string; amount: number; zebra?: boolean; onClick?: () => void; active?: boolean }) {
  return (
    <div onClick={onClick} title={onClick ? '點擊展開分錄明細' : undefined}
      className={`flex justify-between text-sm py-2 px-2 -mx-2 rounded ${zebra ? 'bg-brand-soft/50' : ''} ${onClick ? 'cursor-pointer hover:bg-brand-soft' : ''} ${active ? 'bg-brand-soft ring-1 ring-brand-light' : ''}`}>
      <span className="text-gray-700">{onClick && <span className={`mr-1 text-[10px] ${active ? 'text-brand' : 'text-gray-300'}`}>{active ? '▾' : '▸'}</span>}{name}</span>
      <span className={`tabular-nums ${amount < 0 ? 'text-rose-600' : 'text-gray-800'}`}>{formatTWD(amount)}</span>
    </div>
  )
}
function Total({ name, amount, strong, highlight }: { name: string; amount: number; strong?: boolean; highlight?: boolean }) {
  return (
    <div className={`flex justify-between text-sm py-3 border-t-2 border-gray-200 mt-1 ${strong ? 'font-bold' : 'font-medium'} ${highlight ? 'text-brand' : 'text-gray-900'}`}>
      <span>{name}</span>
      <span className={`tabular-nums ${amount < 0 ? 'text-rose-600' : ''}`}>{formatTWD(amount)}</span>
    </div>
  )
}
