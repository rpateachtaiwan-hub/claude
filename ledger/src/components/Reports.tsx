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

  const pnl = profitAndLoss(entries, accounts, range)
  const bs = balanceSheet(entries, accounts, asOf)
  const cf = cashFlow(entries, accounts, range)

  // 依年的損益：各月損益總結
  const monthly = useMemo(() => {
    if (!(tab === 'pnl' && gran === 'year' && period)) return []
    return Array.from({ length: 12 }, (_, i) => {
      const mm = String(i + 1).padStart(2, '0')
      const r = profitAndLoss(entries, accounts, { from: `${period}-${mm}-01`, to: `${period}-${mm}-31` })
      return { month: `${period}-${mm}`, revenue: r.revenue, expense: r.expense, net: r.netIncome }
    }).filter((m) => m.revenue !== 0 || m.expense !== 0)
  }, [tab, gran, period, entries, accounts])

  function exportCsv() {
    if (tab === 'pnl') {
      const rows: (string | number)[][] = pnl.rows.map((r) => [r.code, r.name, r.category === 'revenue' ? '收入' : '費用', r.amount])
      rows.push(['', '收入合計', '', pnl.revenue], ['', '費用合計', '', pnl.expense], ['', '本期淨利', '', pnl.netIncome])
      if (monthly.length) {
        rows.push(['', '', '', ''], ['', '── 各月損益 ──', '', ''])
        monthly.forEach((m) => rows.push([m.month, `收入 ${m.revenue} / 費用 ${m.expense}`, '淨利', m.net]))
      }
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
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {([['pnl', '損益表'], ['bs', '資產負債表'], ['cf', '現金流量表']] as [Tab, string][]).map(([t, l]) => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-2 rounded-lg text-sm font-medium ${tab === t ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300 text-gray-600'}`}>{l}</button>
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

      {tab === 'pnl' && gran === 'year' && monthly.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-base font-bold text-gray-900">各月損益總結</h2>
          <p className="text-xs text-gray-400 mb-3">{period} 年 · 各月份小結</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 text-xs border-b border-gray-100">
                <th className="py-1.5 text-left">月份</th>
                <th className="py-1.5 text-right">收入</th>
                <th className="py-1.5 text-right">費用</th>
                <th className="py-1.5 text-right">損益</th>
              </tr>
            </thead>
            <tbody>
              {monthly.map((m) => (
                <tr key={m.month} className="border-b border-gray-50">
                  <td className="py-1.5 text-gray-700">{m.month.slice(5)} 月</td>
                  <td className="py-1.5 text-right tabular-nums text-gray-600">{formatTWD(m.revenue)}</td>
                  <td className="py-1.5 text-right tabular-nums text-gray-600">{formatTWD(m.expense)}</td>
                  <td className={`py-1.5 text-right tabular-nums font-medium ${m.net < 0 ? 'text-rose-600' : 'text-gray-900'}`}>{formatTWD(m.net)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-bold text-blue-700 border-t">
                <td className="py-2">全年合計</td>
                <td className="py-2 text-right tabular-nums">{formatTWD(pnl.revenue)}</td>
                <td className="py-2 text-right tabular-nums">{formatTWD(pnl.expense)}</td>
                <td className={`py-2 text-right tabular-nums ${pnl.netIncome < 0 ? 'text-rose-600' : ''}`}>{formatTWD(pnl.netIncome)}</td>
              </tr>
            </tfoot>
          </table>
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
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h2 className="text-base font-bold text-gray-900">{title}</h2>
      {subtitle && <p className="text-xs text-gray-400 mb-3">{subtitle}</p>}
      <div className="space-y-1">{children}</div>
    </div>
  )
}
function Section({ label, children }: { label: string; children: React.ReactNode }) {
  const arr = React.Children.toArray(children)
  return (
    <div className="pt-2">
      <div className="text-xs font-medium text-gray-400 uppercase">{label}</div>
      {arr.length ? arr : <div className="text-sm text-gray-300 py-1">—</div>}
    </div>
  )
}
function Row({ name, amount }: { name: string; amount: number }) {
  return (
    <div className="flex justify-between text-sm py-0.5">
      <span className="text-gray-700">{name}</span>
      <span className={`tabular-nums ${amount < 0 ? 'text-rose-600' : 'text-gray-800'}`}>{formatTWD(amount)}</span>
    </div>
  )
}
function Total({ name, amount, strong, highlight }: { name: string; amount: number; strong?: boolean; highlight?: boolean }) {
  return (
    <div className={`flex justify-between text-sm py-1.5 border-t mt-1 ${strong ? 'font-bold' : 'font-medium'} ${highlight ? 'text-blue-700' : 'text-gray-900'}`}>
      <span>{name}</span>
      <span className={`tabular-nums ${amount < 0 ? 'text-rose-600' : ''}`}>{formatTWD(amount)}</span>
    </div>
  )
}
