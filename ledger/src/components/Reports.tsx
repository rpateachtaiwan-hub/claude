import React, { useState } from 'react'
import { useLedger } from '../store/useLedger'
import { balanceSheet, cashFlow, profitAndLoss } from '../core/reports'
import { formatTWD } from '../core/money'

type Tab = 'pnl' | 'bs' | 'cf'

export default function Reports() {
  const { entries, accounts } = useLedger()
  const [tab, setTab] = useState<Tab>('pnl')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const range = from || to ? { from: from || undefined, to: to || undefined } : undefined

  const pnl = profitAndLoss(entries, accounts, range)
  const bs = balanceSheet(entries, accounts, to || undefined)
  const cf = cashFlow(entries, accounts, range)

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {([['pnl', '損益表'], ['bs', '資產負債表'], ['cf', '現金流量表']] as [Tab, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-2 rounded-lg text-sm font-medium ${tab === t ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300 text-gray-600'}`}>{label}</button>
        ))}
        <div className="ml-auto flex items-center gap-1 text-xs text-gray-500">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border border-gray-300 rounded px-2 py-1" />
          <span>~</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border border-gray-300 rounded px-2 py-1" />
        </div>
      </div>

      {tab === 'pnl' && (
        <Card title="損益表" subtitle={rangeLabel(from, to)}>
          <Section label="收入">
            {pnl.rows.filter((r) => r.category === 'revenue').map((r) => <Row key={r.code} name={r.name} amount={r.amount} />)}
          </Section>
          <Total name="收入合計" amount={pnl.revenue} />
          <Section label="費用 / 成本">
            {pnl.rows.filter((r) => r.category === 'expense').map((r) => <Row key={r.code} name={r.name} amount={r.amount} />)}
          </Section>
          <Total name="費用合計" amount={pnl.expense} />
          <Total name="本期淨利" amount={pnl.netIncome} strong highlight />
        </Card>
      )}

      {tab === 'bs' && (
        <Card title="資產負債表" subtitle={to ? `截至 ${to}` : '截至目前'}>
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
        <Card title="現金流量表（直接法）" subtitle={rangeLabel(from, to)}>
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

function rangeLabel(from: string, to: string) {
  if (!from && !to) return '全部期間'
  return `${from || '最早'} ~ ${to || '最新'}`
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
