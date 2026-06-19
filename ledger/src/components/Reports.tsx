import React, { useMemo, useState } from 'react'
import { useLedger } from '../store/useLedger'
import { balanceSheet, cashFlow, profitAndLoss } from '../core/reports'
import { formatTWD } from '../core/money'
import { downloadCSV, toCSV } from '../lib/csv'

type Tab = 'pnl' | 'bs' | 'cf'
type Gran = 'all' | 'year' | 'month'

export default function Reports() {
  const { entries, accounts } = useLedger()
  const [tab, setTab] = useState<Tab>('pnl')
  const [gran, setGran] = useState<Gran>('all')
  const [period, setPeriod] = useState('')

  const { years, months } = useMemo(() => {
    const ys = new Set<string>(); const ms = new Set<string>()
    for (const e of entries) { ys.add(e.date.slice(0, 4)); ms.add(e.date.slice(0, 7)) }
    return { years: [...ys].sort().reverse(), months: [...ms].sort().reverse() }
  }, [entries])

  // 依粒度決定日期範圍與 as-of
  const { range, asOf, label } = useMemo(() => {
    if (gran === 'year' && period) return { range: { from: `${period}-01-01`, to: `${period}-12-31` }, asOf: `${period}-12-31`, label: `${period} 年` }
    if (gran === 'month' && period) return { range: { from: `${period}-01`, to: `${period}-31` }, asOf: `${period}-31`, label: period }
    return { range: undefined, asOf: undefined, label: '全部期間' }
  }, [gran, period])

  const pnl = profitAndLoss(entries, accounts, range, true)
  const bs = balanceSheet(entries, accounts, asOf, true)
  const cf = cashFlow(entries, accounts, range, true)

  // 依年的損益：1~12 月矩陣（科目 × 月份）
  const matrix = useMemo(() => {
    if (!(tab === 'pnl' && gran === 'year' && period)) return null
    const mm = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'))
    const per = mm.map((m) => profitAndLoss(entries, accounts, { from: `${period}-${m}-01`, to: `${period}-${m}-31` }, true))
    const annual = profitAndLoss(entries, accounts, { from: `${period}-01-01`, to: `${period}-12-31` }, true)
    const amt = (p: typeof annual, code: string) => p.rows.find((r) => r.code === code)?.amount ?? 0
    const revAccts = annual.rows.filter((r) => r.category === 'revenue' && (amt(annual, r.code) !== 0))
    const expAccts = annual.rows.filter((r) => r.category === 'expense' && (amt(annual, r.code) !== 0))
    return { mm, per, annual, amt, revAccts, expAccts }
  }, [tab, gran, period, entries, accounts])

  function exportCsv() {
    if (tab === 'pnl' && matrix) {
      const mx = matrix
      const head = ['科目', ...mx.mm.map((m) => `${Number(m)}月`), '全年']
      const rows: (string | number)[][] = []
      const line = (name: string, get: (p: typeof mx.annual) => number) =>
        rows.push([name, ...mx.per.map(get), get(mx.annual)])
      mx.revAccts.forEach((r) => line(r.name, (p) => mx.amt(p, r.code)))
      line('收入合計', (p) => p.revenue)
      mx.expAccts.forEach((r) => line(r.name, (p) => mx.amt(p, r.code)))
      line('費用合計', (p) => p.expense)
      line('本期淨利', (p) => p.netIncome)
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
    <div className="w-full p-6 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {([['pnl', '損益表'], ['bs', '資產負債表'], ['cf', '現金流量表']] as [Tab, string][]).map(([t, l]) => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-2 rounded-lg text-sm font-medium ${tab === t ? 'bg-brand text-white' : 'bg-white border border-gray-300 text-gray-600'}`}>{l}</button>
        ))}
        <button onClick={exportCsv} className="ml-auto px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50">⬇ 匯出 Excel</button>
      </div>

      {/* 期間：全部 / 依年 / 依月 */}
      <div className="flex items-center gap-2 text-sm">
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
      </div>

      {tab === 'pnl' && (
        <Card title="損益表" subtitle={label}>
          <Section label="收入">{pnl.rows.filter((r) => r.category === 'revenue').map((r) => <Row key={r.code} name={r.name} amount={r.amount} />)}</Section>
          <Total name="收入合計" amount={pnl.revenue} />
          <Section label="費用 / 成本">{pnl.rows.filter((r) => r.category === 'expense').map((r) => <Row key={r.code} name={r.name} amount={r.amount} />)}</Section>
          <Total name="費用合計" amount={pnl.expense} />
          <Total name="本期淨利" amount={pnl.netIncome} strong highlight />
        </Card>
      )}

      {tab === 'pnl' && matrix && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-bold text-gray-900 mb-1">各月損益（1~12 月）</h2>
          <p className="text-xs text-gray-400 mb-4">{period} 年 · 左右可捲動</p>
          <div className="overflow-x-auto">
            <table className="text-sm border-collapse">
              <thead>
                <tr className="text-gray-400 text-xs border-b border-gray-200">
                  <th className="py-2 pr-4 text-left sticky left-0 bg-white min-w-[120px]">科目</th>
                  {matrix.mm.map((m) => <th key={m} className="py-2 px-3 text-right whitespace-nowrap min-w-[84px]">{Number(m)}月</th>)}
                  <th className="py-2 pl-3 text-right whitespace-nowrap min-w-[96px] font-bold text-gray-600">全年</th>
                </tr>
              </thead>
              <tbody>
                <MxSectionLabel cols={matrix.mm.length} label="收入" />
                {matrix.revAccts.map((r) => (
                  <MxRow key={r.code} name={r.name} vals={matrix.per.map((p) => matrix.amt(p, r.code))} total={matrix.amt(matrix.annual, r.code)} />
                ))}
                <MxRow name="收入合計" vals={matrix.per.map((p) => p.revenue)} total={matrix.annual.revenue} bold />
                <MxSectionLabel cols={matrix.mm.length} label="費用 / 成本" />
                {matrix.expAccts.map((r) => (
                  <MxRow key={r.code} name={r.name} vals={matrix.per.map((p) => matrix.amt(p, r.code))} total={matrix.amt(matrix.annual, r.code)} />
                ))}
                <MxRow name="費用合計" vals={matrix.per.map((p) => p.expense)} total={matrix.annual.expense} bold />
                <MxRow name="本期淨利" vals={matrix.per.map((p) => p.netIncome)} total={matrix.annual.netIncome} bold highlight />
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'bs' && (
        <Card title="資產負債表" subtitle={asOf ? `截至 ${asOf}` : '截至目前'}>
          <Section label="資產">{bs.assets.map((r) => <Row key={r.code} name={r.name} amount={r.amount} />)}</Section>
          <Total name="資產總計" amount={bs.totalAssets} strong />
          <Section label="負債">{bs.liabilities.map((r) => <Row key={r.code} name={r.name} amount={r.amount} />)}</Section>
          <Total name="負債合計" amount={bs.totalLiabilities} />
          <Section label="權益">{bs.equity.map((r) => <Row key={r.code} name={r.name} amount={r.amount} />)}</Section>
          <Total name="權益合計" amount={bs.totalEquity} />
          <Total name="負債 + 權益" amount={bs.totalLiabilities + bs.totalEquity} strong highlight={bs.balanced} />
          {!bs.balanced && <p className="text-xs text-red-600 mt-1">⚠ 資產與負債+權益不相等，請檢查資料。</p>}
        </Card>
      )}

      {tab === 'cf' && (
        <Card title="現金流量表（直接法）" subtitle={label}>
          <Section label="營業活動">{cf.operating.map((r) => <Row key={r.code} name={r.name} amount={r.amount} />)}</Section>
          <Total name="營業活動現金流" amount={cf.operatingTotal} />
          <Section label="投資活動">{cf.investing.map((r) => <Row key={r.code} name={r.name} amount={r.amount} />)}</Section>
          <Total name="投資活動現金流" amount={cf.investingTotal} />
          <Section label="理財活動">{cf.financing.map((r) => <Row key={r.code} name={r.name} amount={r.amount} />)}</Section>
          <Total name="理財活動現金流" amount={cf.financingTotal} />
          <Total name="本期現金淨變動" amount={cf.netChange} strong />
          <Total name="期末現金餘額" amount={cf.endingCash} strong highlight />
        </Card>
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
function Row({ name, amount }: { name: string; amount: number }) {
  return (
    <div className="flex justify-between text-sm py-2 border-b border-gray-50">
      <span className="text-gray-700">{name}</span>
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

// ── 1~12 月矩陣用的小元件 ──
function MxSectionLabel({ cols, label }: { cols: number; label: string }) {
  return (
    <tr>
      <td colSpan={cols + 2} className="pt-4 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wide sticky left-0 bg-white">{label}</td>
    </tr>
  )
}
function MxRow({ name, vals, total, bold, highlight }: { name: string; vals: number[]; total: number; bold?: boolean; highlight?: boolean }) {
  const cell = (v: number) => (v === 0 ? <span className="text-gray-300">0</span> : <span className={v < 0 ? 'text-rose-600' : ''}>{formatTWD(v)}</span>)
  return (
    <tr className={`border-b border-gray-50 ${bold ? 'font-semibold' : ''} ${highlight ? 'text-brand' : 'text-gray-700'}`}>
      <td className={`py-2 pr-4 text-left whitespace-nowrap sticky left-0 ${highlight ? 'bg-brand-soft' : 'bg-white'}`}>{name}</td>
      {vals.map((v, i) => <td key={i} className="py-2 px-3 text-right tabular-nums">{cell(v)}</td>)}
      <td className="py-2 pl-3 text-right tabular-nums font-bold">{cell(total)}</td>
    </tr>
  )
}
