import React, { useEffect, useMemo, useState } from 'react'
import { useLedger } from '../store/useLedger'
import { formatTWD } from '../core/money'
import AccountCombo from './AccountCombo'

const DEFAULT_COMPANY = '菸酒'

export default function QuickEntry() {
  const { accounts, companies, postJournal } = useLedger()
  const today = new Date().toISOString().slice(0, 10)
  const sortedAccounts = useMemo(() => [...accounts].sort((a, b) => a.code.localeCompare(b.code)), [accounts])
  const accName = (code: string) => accounts.find((a) => a.code === code)?.name ?? code

  const [date, setDate] = useState(today)
  const [company, setCompany] = useState(() => localStorage.getItem('ql-last-company') || DEFAULT_COMPANY)
  const [description, setDescription] = useState('')
  const [debitCode, setDebitCode] = useState('')
  const [creditCode, setCreditCode] = useState('')
  const [amount, setAmount] = useState(0)
  const [voucherNo, setVoucherNo] = useState('')
  const [note, setNote] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  // 公司清單載入後，若目前選擇不在清單中，預設「菸酒」（若無則第一間）
  useEffect(() => {
    if (!companies.length) return
    if (!companies.includes(company)) setCompany(companies.includes(DEFAULT_COMPANY) ? DEFAULT_COMPANY : companies[0])
  }, [companies]) // eslint-disable-line react-hooks/exhaustive-deps

  const canSubmit = amount > 0 && !!debitCode && !!creditCode && !!description.trim()
  const sameAcct = debitCode && creditCode && debitCode === creditCode

  async function onSubmit() {
    setErr(null)
    if (!canSubmit) { setErr('請填寫摘要、借方、貸方與金額。'); return }
    if (sameAcct) { setErr('借方與貸方不可為同一科目。'); return }
    try {
      await postJournal({
        date, company: company || undefined, description: description.trim(),
        debitCode, creditCode, amount,
        voucherNo: voucherNo.trim() || undefined, note: note.trim() || undefined,
      })
      if (company) localStorage.setItem('ql-last-company', company)
      setToast(`已記一筆：借 ${accName(debitCode)} / 貸 ${accName(creditCode)}　${formatTWD(amount)}`)
      setDescription(''); setDebitCode(''); setCreditCode(''); setAmount(0); setVoucherNo(''); setNote('')
      setTimeout(() => setToast(null), 4000)
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
  }

  return (
    <div className="w-full p-4 sm:p-6 space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Field label="日期">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inp} />
          </Field>
          <Field label="公司">
            {companies.length ? (
              <select value={company} onChange={(e) => setCompany(e.target.value)} className={inp}>
                {companies.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            ) : (
              <p className="text-xs text-amber-600">尚未建立公司，請先到「設定 → 公司」新增。</p>
            )}
          </Field>
          <Field label="摘要" wide>
            <input value={description} onChange={(e) => setDescription(e.target.value)} className={inp} placeholder="這筆交易的說明" />
          </Field>
          <Field label="借方科目">
            <AccountCombo accounts={sortedAccounts} value={debitCode} onChange={setDebitCode} placeholder="搜尋借方科目…" />
          </Field>
          <Field label="貸方科目">
            <AccountCombo accounts={sortedAccounts} value={creditCode} onChange={setCreditCode} placeholder="搜尋貸方科目…" />
          </Field>
          <Field label="金額">
            <input type="number" value={amount || ''} min={0} placeholder="0"
              onChange={(e) => setAmount(Math.floor(Number(e.target.value) || 0))} className={`${inp} text-right font-semibold`} />
          </Field>
          <Field label="憑證編號（選填）">
            <input value={voucherNo} onChange={(e) => setVoucherNo(e.target.value)} className={inp} placeholder="發票/憑證號碼" />
          </Field>
          <Field label="備註（選填）" wide>
            <input value={note} onChange={(e) => setNote(e.target.value)} className={inp} placeholder="補充說明" />
          </Field>
        </div>

        {sameAcct && <p className="text-xs text-accent">借方與貸方不可為同一科目。</p>}

        {canSubmit && !sameAcct && (
          <table className="w-full text-sm bg-brand-soft rounded-lg overflow-hidden">
            <thead><tr className="text-gray-400 text-xs border-b border-brand-light/30"><th className="py-1.5 px-2 text-left">科目</th><th className="py-1.5 px-2 text-right">借方</th><th className="py-1.5 px-2 text-right">貸方</th></tr></thead>
            <tbody>
              <tr className="border-b border-white/60"><td className="py-1.5 px-2 text-gray-700">{accName(debitCode)}</td><td className="py-1.5 px-2 text-right tabular-nums">{formatTWD(amount)}</td><td></td></tr>
              <tr><td className="py-1.5 px-2 text-gray-700">{accName(creditCode)}</td><td></td><td className="py-1.5 px-2 text-right tabular-nums">{formatTWD(amount)}</td></tr>
            </tbody>
          </table>
        )}

        {err && <div className="text-sm text-red-600 bg-red-50 rounded p-2">{err}</div>}

        <button onClick={onSubmit} disabled={!canSubmit || !!sameAcct}
          className="w-full py-2.5 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-dark disabled:opacity-50">確認記帳</button>
      </div>

      {toast && <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">{toast}</div>}
    </div>
  )
}

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <div className={wide ? 'sm:col-span-2' : ''}><label className="block text-xs text-gray-500 mb-1">{label}</label>{children}</div>
}
const inp = 'w-full border border-gray-300 rounded px-2.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand'
