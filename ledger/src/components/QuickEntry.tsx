import React, { useEffect, useMemo, useState } from 'react'
import { useLedger } from '../store/useLedger'
import { composeEntry } from '../core/suggest'
import { classifyWithGemini } from '../core/ai'
import { formatTWD } from '../core/money'
import type { QuickInput } from '../core/types'

export default function QuickEntry() {
  const { accounts, preview, commit, aiConfig } = useLedger()
  const today = new Date().toISOString().slice(0, 10)

  const [date, setDate] = useState(today)
  const [direction, setDirection] = useState<'in' | 'out'>('out')
  const [amount, setAmount] = useState(0)
  const [description, setDescription] = useState('')
  const [counterparty, setCounterparty] = useState('')
  const [cashAccountCode, setCashAccountCode] = useState('1102')
  const [accrual, setAccrual] = useState(false)
  const [override, setOverride] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [ai, setAi] = useState<{ accountCode: string; reason: string } | null>(null)
  const [aiLoading, setAiLoading] = useState(false)

  const cashAccounts = accounts.filter((a) => a.isCash)
  const accName = (code: string) => accounts.find((a) => a.code === code)?.name ?? code
  const categoryAccounts = accounts.filter((a) => !a.isCash && !a.isOpenItem)

  const input: QuickInput = useMemo(
    () => ({ date, amount, description, counterparty: counterparty || undefined, direction, cashAccountCode, accrual }),
    [date, amount, description, counterparty, direction, cashAccountCode, accrual],
  )

  const fallback = useMemo(() => (amount > 0 ? preview(input) : null), [input, amount, preview])

  // 改摘要/方向/對象/應計時，清除手動選擇 → 重新跟隨建議
  useEffect(() => { setOverride(null) }, [description, direction, counterparty, accrual])

  // Gemini 判斷（有金鑰時）；debounce 避免每打一字就呼叫
  useEffect(() => {
    if (!aiConfig.apiKey || amount <= 0 || !description.trim()) { setAi(null); return }
    let cancelled = false
    setAiLoading(true)
    const t = setTimeout(async () => {
      const r = await classifyWithGemini(input, accounts, aiConfig)
      if (!cancelled) { setAi(r); setAiLoading(false) }
    }, 600)
    return () => { cancelled = true; clearTimeout(t) }
  }, [description, counterparty, direction, amount, accrual, aiConfig, accounts]) // eslint-disable-line react-hooks/exhaustive-deps

  const suggestedCode = ai?.accountCode ?? fallback?.accountCode
  const chosen = override ?? suggestedCode ?? ''
  const previewEntry = amount > 0 && chosen ? composeEntry(input, chosen) : null
  const corrected = override != null && !!suggestedCode && override !== suggestedCode

  const badge = aiLoading
    ? { cls: 'bg-gray-200 text-gray-600', text: '✦ Gemini 判斷中…' }
    : ai
      ? { cls: 'bg-brand text-white', text: '✦ Gemini 建議' }
      : { cls: 'bg-gray-200 text-gray-600', text: aiConfig.apiKey ? '預設建議（Gemini 無回應）' : '預設建議' }
  const reasonText = ai ? `Gemini：${ai.reason}` : fallback?.reason ?? ''

  async function onSubmit() {
    if (amount <= 0 || !description || !chosen) return
    await commit(input, chosen)
    setToast(`已記一筆：${direction === 'in' ? '收入' : '支出'} ${formatTWD(amount)} → ${accName(chosen)}`)
    setAmount(0); setDescription(''); setCounterparty(''); setOverride(null); setAi(null)
    setTimeout(() => setToast(null), 4000)
  }

  return (
    <div className="w-full p-6 space-y-4">
      <div className="flex gap-2">
        <button onClick={() => setDirection('out')}
          className={`flex-1 py-2.5 rounded-lg text-sm font-medium ${direction === 'out' ? 'bg-accent text-white' : 'bg-white border border-gray-300 text-gray-600'}`}>支出（付錢）</button>
        <button onClick={() => setDirection('in')}
          className={`flex-1 py-2.5 rounded-lg text-sm font-medium ${direction === 'in' ? 'bg-brand text-white' : 'bg-white border border-gray-300 text-gray-600'}`}>收入（收錢）</button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="日期"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inp} /></Field>
          <Field label="金額">
            <input type="number" value={amount || ''} min={0} placeholder="0" autoFocus
              onChange={(e) => setAmount(Math.floor(Number(e.target.value) || 0))} className={`${inp} text-right text-lg font-semibold`} />
          </Field>
          <Field label="摘要（買了什麼 / 收什麼錢）" wide>
            <input value={description} onChange={(e) => setDescription(e.target.value)} className={inp} placeholder="例：中油加油、客戶尾款、辦公室租金" />
          </Field>
          <Field label="對象（廠商/客戶，選填）"><input value={counterparty} onChange={(e) => setCounterparty(e.target.value)} className={inp} placeholder="例：春天廣告社" /></Field>
          <Field label={accrual ? '（應計，不影響現金）' : '收/付款帳戶'}>
            <select value={cashAccountCode} onChange={(e) => setCashAccountCode(e.target.value)} className={inp} disabled={accrual}>
              {cashAccounts.map((a) => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}
            </select>
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={accrual} onChange={(e) => setAccrual(e.target.checked)} />
          這是「{direction === 'in' ? '應收（還沒收到錢）' : '應付（還沒付錢）'}」——之後再收/付款
        </label>
      </div>

      {previewEntry && (
        <div className="bg-brand-soft border border-brand-light/40 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <span className={`px-2 py-0.5 rounded-full text-[11px] ${badge.cls}`}>{badge.text}</span>
            <span className="text-gray-600">{reasonText}</span>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">分類科目（不對的話直接改）</label>
            <select value={chosen} onChange={(e) => setOverride(e.target.value)}
              className={`${inp} ${corrected ? 'ring-1 ring-accent' : ''}`}>
              {categoryAccounts.map((a) => <option key={a.code} value={a.code}>{a.code} {a.name}（{catZh(a.category)}）</option>)}
            </select>
          </div>

          <table className="w-full text-sm bg-white rounded-lg overflow-hidden">
            <thead><tr className="text-gray-400 text-xs border-b"><th className="py-1.5 px-2 text-left">科目</th><th className="py-1.5 px-2 text-right">借方</th><th className="py-1.5 px-2 text-right">貸方</th></tr></thead>
            <tbody>
              {previewEntry.lines.map((l, i) => (
                <tr key={i} className="border-b border-gray-50">
                  <td className="py-1.5 px-2 text-gray-700">{accName(l.accountCode)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{l.debit ? formatTWD(l.debit) : ''}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{l.credit ? formatTWD(l.credit) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <button onClick={onSubmit} className="w-full py-2.5 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-dark">確認記帳</button>
        </div>
      )}

      {toast && <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">{toast}</div>}
    </div>
  )
}

function catZh(c: string) {
  return ({ asset: '資產', liability: '負債', equity: '權益', revenue: '收入', expense: '費用' } as Record<string, string>)[c] ?? c
}
function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <div className={wide ? 'col-span-2' : ''}><label className="block text-xs text-gray-500 mb-1">{label}</label>{children}</div>
}
const inp = 'w-full border border-gray-300 rounded px-2.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand'
