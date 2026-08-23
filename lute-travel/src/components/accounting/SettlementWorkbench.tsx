// 沖銷工作台（核心）：選 AR/AP → 多選未沖清單 → 改每筆套用金額 → 輸入日期/銀行/手續費
//                      → 預覽自動產生的傳票 → 確認過帳
import React, { useMemo, useState } from 'react'
import { useAccountingStore } from '../../store/accountingStore'
import { buildSettlementDraft } from '../../accounting/engine'
import { formatTWD } from '../../accounting/money'
import type { OpenItemType, SettlementInput } from '../../accounting/types'

export default function SettlementWorkbench() {
  const { accounts, openItemsWithRemaining, postSettlement } = useAccountingStore()

  const [type, setType] = useState<OpenItemType>('AP')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [bankId, setBankId] = useState(() => accounts.find((a) => a.code === '1112')?.id ?? 0)
  const [feeAmount, setFeeAmount] = useState(0)
  const [feeId, setFeeId] = useState(() => accounts.find((a) => a.code === '614')?.id ?? 0)
  const [picked, setPicked] = useState<Record<number, number>>({}) // openItemId -> apply amount
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const items = openItemsWithRemaining().filter((o) => o.type === type && o.remaining > 0)
  const bankAccounts = accounts.filter((a) => a.category === 'asset' && a.code.startsWith('11'))
  const feeAccounts = accounts.filter((a) => a.category === 'expense')
  const accName = (id: number) => accounts.find((a) => a.id === id)?.name ?? `#${id}`
  const settlementType = type === 'AR' ? 'receipt' : 'payment'

  function toggle(id: number, remaining: number) {
    setPicked((p) => {
      const next = { ...p }
      if (id in next) delete next[id]
      else next[id] = remaining
      return next
    })
    setDone(null)
  }
  function setAmount(id: number, v: number) {
    setPicked((p) => ({ ...p, [id]: v }))
    setDone(null)
  }

  const allocations = Object.entries(picked).map(([k, v]) => ({ openItemId: Number(k), amount: v }))

  // 即時預覽傳票
  const preview = useMemo(() => {
    if (!allocations.length || !bankId) return null
    const input: SettlementInput = {
      settlementDate: date, type: settlementType, bankAccountId: bankId,
      feeAmount, feeAccountId: feeAmount > 0 ? feeId : null, allocations, note,
    }
    try {
      return { draft: buildSettlementDraft(input, openItemsWithRemaining()), input, err: null as string | null }
    } catch (e) {
      return { draft: null, input, err: e instanceof Error ? e.message : String(e) }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(allocations), date, bankId, feeAmount, feeId, settlementType, note])

  async function onPost() {
    if (!preview?.input) return
    setError(null)
    try {
      await postSettlement(preview.input)
      setDone(`已過帳：${type === 'AR' ? '收款' : '付款'}沖銷 共 ${formatTWD(preview.draft!.totalAmount)} 元`)
      setPicked({}); setFeeAmount(0); setNote('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 p-6">
      {/* 左：未沖清單 + 設定 */}
      <div className="lg:col-span-3 space-y-4">
        {/* AR/AP 切換 */}
        <div className="flex gap-2">
          {(['AP', 'AR'] as OpenItemType[]).map((t) => (
            <button key={t} onClick={() => { setType(t); setPicked({}); setDone(null) }}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${type === t ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
              {t === 'AP' ? '應付（付款沖銷）' : '應收（收款沖銷）'}
            </button>
          ))}
        </div>

        {/* 未沖清單 */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs">
                <th className="px-3 py-2.5 w-8"></th>
                <th className="px-3 py-2.5 text-left">代號 / 對象</th>
                <th className="px-3 py-2.5 text-left">摘要</th>
                <th className="px-3 py-2.5 text-right">未沖餘額</th>
                <th className="px-3 py-2.5 text-right w-36">本次套用</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-gray-400">無未沖項目</td></tr>
              )}
              {items.map((it) => {
                const checked = it.id in picked
                return (
                  <tr key={it.id} className={`border-t border-gray-100 ${checked ? 'bg-blue-50/50' : 'hover:bg-gray-50'}`}>
                    <td className="px-3 py-2.5 text-center">
                      <input type="checkbox" checked={checked} onChange={() => toggle(it.id, it.remaining)} />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-mono text-xs text-gray-900">{it.code}</div>
                      <div className="text-xs text-gray-500">{it.counterparty}</div>
                    </td>
                    <td className="px-3 py-2.5 text-gray-700">{it.description}</td>
                    <td className="px-3 py-2.5 text-right font-medium text-gray-900">{formatTWD(it.remaining)}</td>
                    <td className="px-3 py-2.5 text-right">
                      {checked ? (
                        <input type="number" value={picked[it.id]} min={1} max={it.remaining}
                          onChange={(e) => setAmount(it.id, Math.floor(Number(e.target.value) || 0))}
                          className="w-28 border border-gray-300 rounded px-2 py-1 text-right text-sm focus:ring-1 focus:ring-blue-500" />
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* 沖銷設定 */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 grid grid-cols-2 gap-3">
          <Field label="沖銷日期">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inp} />
          </Field>
          <Field label={type === 'AP' ? '付款銀行科目' : '收款銀行科目'}>
            <select value={bankId} onChange={(e) => setBankId(Number(e.target.value))} className={inp}>
              {bankAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
            </select>
          </Field>
          <Field label="銀行手續費">
            <input type="number" value={feeAmount} min={0} onChange={(e) => setFeeAmount(Math.floor(Number(e.target.value) || 0))} className={inp} />
          </Field>
          <Field label="手續費科目">
            <select value={feeId} onChange={(e) => setFeeId(Number(e.target.value))} className={inp} disabled={feeAmount === 0}>
              {feeAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
            </select>
          </Field>
          <Field label="備註" wide>
            <input value={note} onChange={(e) => setNote(e.target.value)} className={inp} placeholder="選填" />
          </Field>
        </div>
      </div>

      {/* 右：傳票預覽 + 過帳 */}
      <div className="lg:col-span-2">
        <div className="bg-white rounded-xl border border-gray-200 p-4 sticky top-4">
          <h3 className="text-sm font-bold text-gray-900 mb-3">傳票預覽</h3>

          {!allocations.length && <p className="text-sm text-gray-400 py-6 text-center">請從左側勾選要沖銷的項目</p>}

          {preview?.err && (
            <div className="text-sm text-red-600 bg-red-50 rounded-lg p-3 mb-3">{preview.err}</div>
          )}

          {preview?.draft && (
            <>
              <table className="w-full text-sm mb-3">
                <thead>
                  <tr className="text-gray-400 text-xs border-b border-gray-100">
                    <th className="py-1.5 text-left">科目</th>
                    <th className="py-1.5 text-right">借方</th>
                    <th className="py-1.5 text-right">貸方</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.draft.entry.lines.map((l, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      <td className="py-1.5 text-gray-700">
                        {accName(l.accountId)}
                        {l.openItemId != null && <span className="ml-1 text-[10px] text-blue-500">●沖</span>}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{l.debit ? formatTWD(l.debit) : ''}</td>
                      <td className="py-1.5 text-right tabular-nums">{l.credit ? formatTWD(l.credit) : ''}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-bold text-gray-900">
                    <td className="py-2">合計</td>
                    <td className="py-2 text-right tabular-nums">{formatTWD(preview.draft.entry.lines.reduce((s, l) => s + l.debit, 0))}</td>
                    <td className="py-2 text-right tabular-nums">{formatTWD(preview.draft.entry.lines.reduce((s, l) => s + l.credit, 0))}</td>
                  </tr>
                </tfoot>
              </table>
              <div className="text-xs text-green-600 mb-3">✓ 借貸平衡 · 沖銷總額 {formatTWD(preview.draft.totalAmount)}</div>
            </>
          )}

          {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg p-3 mb-3">{error}</div>}
          {done && <div className="text-sm text-green-700 bg-green-50 rounded-lg p-3 mb-3">{done}</div>}

          <button onClick={onPost} disabled={!preview?.draft}
            className="w-full px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400">
            確認過帳
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  )
}
const inp = 'w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500'
