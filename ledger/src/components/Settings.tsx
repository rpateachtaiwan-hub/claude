import React, { useState } from 'react'
import { useLedger } from '../store/useLedger'
import { downloadCSV, toCSV } from '../lib/csv'
import { UNIFIED_PRESET_ACCOUNTS } from '../core/accounts'
import { findSimilarAccounts, ruleTargetIssues } from '../core/accountAudit'
import type { Account, Category } from '../core/types'

const CATS: Category[] = ['asset', 'liability', 'equity', 'revenue', 'expense']
const catZh: Record<Category, string> = { asset: '資產', liability: '負債', equity: '權益', revenue: '收入', expense: '費用' }

export default function Settings() {
  const { accounts, addAccount, addAccountsBulk, deleteAccount, aiConfig, setAiConfig, companies, addCompany, deleteCompany } = useLedger()

  async function applyPreset() {
    const have = new Set(accounts.map((a) => a.code))
    const toAdd = UNIFIED_PRESET_ACCOUNTS.filter((a) => !have.has(a.code))
    if (!toAdd.length) { alert('建議科目表的科目都已存在，未新增任何科目。'); return }
    if (!confirm(`將新增 ${toAdd.length} 個建議科目（不覆蓋你現有的同編號科目）。要套用嗎？`)) return
    await addAccountsBulk(toAdd)
    alert(`已新增 ${toAdd.length} 個科目。`)
  }
  const [editing, setEditing] = useState<Account | null>(null)
  const [adding, setAdding] = useState(false)
  const [newCompany, setNewCompany] = useState('')

  const [enabled, setEnabled] = useState(aiConfig.enabled)
  const [key, setKey] = useState(aiConfig.apiKey)
  const [model, setModel] = useState(aiConfig.model)
  const [saved, setSaved] = useState(false)

  return (
    <div className="w-full p-4 sm:p-6 space-y-6">
      {/* 公司 */}
      <section>
        <h2 className="text-sm font-bold text-gray-900 mb-2">公司</h2>
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <p className="text-xs text-gray-500">多公司帳務用。記一筆與匯入時可選擇所屬公司，報表可依公司檢視。</p>
          <div className="flex gap-2">
            <input value={newCompany} onChange={(e) => setNewCompany(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && newCompany.trim()) { addCompany(newCompany); setNewCompany('') } }}
              placeholder="輸入公司名稱…" className={`${inp} flex-1`} />
            <button onClick={() => { if (newCompany.trim()) { addCompany(newCompany); setNewCompany('') } }}
              className="px-4 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-dark whitespace-nowrap">新增</button>
          </div>
          {companies.length === 0 ? (
            <p className="text-xs text-gray-400">尚未建立公司。</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {companies.map((c) => (
                <span key={c} className="inline-flex items-center gap-1 bg-brand-soft text-brand-dark text-sm rounded-full pl-3 pr-2 py-1">
                  {c}
                  <button onClick={() => { if (confirm(`刪除公司「${c}」？（不影響已記錄的交易）`)) deleteCompany(c) }}
                    className="text-brand/60 hover:text-red-500">✕</button>
                </span>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Gemini 智慧判斷 */}
      <section>
        <h2 className="text-sm font-bold text-gray-900 mb-2">智慧分類（Google Gemini）</h2>
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <p className="text-xs text-gray-500 leading-relaxed">
            啟用後，「記一筆」與「明細→分類待分類」會用 Gemini 判斷科目。
            正式版的金鑰由<b>伺服器代理</b>保管（在 Netlify 設定 <code>GEMINI_API_KEY</code>），不會外洩到瀏覽器。
            下方的金鑰欄為<b>選填</b>，僅供本機開發備援。
          </p>
          <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={enabled} onChange={(e) => { setEnabled(e.target.checked); setSaved(false) }} />啟用 Gemini 智慧分類</label>
          <L t="模型"><input value={model} onChange={(e) => { setModel(e.target.value); setSaved(false) }} className={inp} placeholder="gemini-2.0-flash" /></L>
          <L t="Gemini API 金鑰（選填，本機備援）"><input type="password" value={key} onChange={(e) => { setKey(e.target.value); setSaved(false) }} className={inp} placeholder="正式版可留空" /></L>
          <div className="flex items-center gap-3">
            <button onClick={() => { setAiConfig({ enabled, apiKey: key.trim(), model: model.trim() || 'gemini-2.0-flash' }); setSaved(true) }}
              className="px-4 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-dark">儲存</button>
            <span className="text-xs text-gray-500">
              狀態：{aiConfig.enabled ? `✓ 已啟用（${aiConfig.model}）` : '已停用，使用預設分類'}{saved && ' · 已儲存'}
            </span>
          </div>
        </div>
      </section>

      {/* 科目表 */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-bold text-gray-900">科目表</h2>
          <div className="flex gap-3">
            <button onClick={applyPreset} className="text-sm text-brand hover:text-brand-dark">✦ 套用建議科目表（多公司）</button>
            <button onClick={() => downloadCSV('科目表', toCSV(['編號', '科目', '類別'], accounts.map((a) => [a.code, a.name, catZh[a.category]])))} className="text-sm text-gray-500 hover:text-gray-700">⬇ 匯出</button>
            <button onClick={() => setAdding(true)} className="text-sm text-brand hover:text-brand-dark">+ 新增科目</button>
          </div>
        </div>
        <div className="bg-brand-soft border border-brand-light/40 rounded-lg p-3 text-xs text-gray-600 leading-relaxed mb-2">
          <b>「類別」是會計五大分類</b>，決定科目出現在哪張報表、以及借貸方向：
          <br />· <b>資產</b>（現金、應收、設備…）、<b>負債</b>（應付、借款…）、<b>權益</b>（資本）→ <b>資產負債表</b>。
          <br />· <b>收入</b>、<b>費用</b> → <b>損益表</b>。
        </div>

        <AccountHealthCheck accounts={accounts} />
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="bg-gray-50 text-gray-500 text-xs">
              <th className="px-3 py-2 text-left">編號</th><th className="px-3 py-2 text-left">名稱</th>
              <th className="px-3 py-2 text-left">類別</th><th className="px-3 py-2 text-center">現金</th><th className="px-3 py-2 text-center w-16">操作</th>
            </tr></thead>
            <tbody>
              {[...accounts].sort((a, b) => a.code.localeCompare(b.code)).map((a) => (
                <tr key={a.code} className="border-t border-gray-100">
                  <td className="px-3 py-2 font-mono text-xs">{a.code}</td>
                  <td className="px-3 py-2 text-gray-800">{a.name}{a.isOpenItem ? ' 🔁' : ''}</td>
                  <td className="px-3 py-2 text-gray-500">{catZh[a.category]}</td>
                  <td className="px-3 py-2 text-center">{a.isCash ? '💵' : ''}</td>
                  <td className="px-3 py-2 text-center whitespace-nowrap">
                    <button onClick={() => setEditing(a)} className="text-gray-400 hover:text-brand mr-2" title="編輯">✎</button>
                    <button onClick={() => { if (confirm(`刪除科目「${a.name}」？（不影響已記錄的交易）`)) deleteAccount(a.code) }} className="text-gray-300 hover:text-red-500" title="刪除">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {(adding || editing) && <AccountModal account={editing} onClose={() => { setAdding(false); setEditing(null) }} onSave={addAccount} />}
    </div>
  )
}

/** 科目健檢：相近重複 + 智慧匯入規則目標語意檢查（對使用者真實科目表執行） */
function AccountHealthCheck({ accounts }: { accounts: Account[] }) {
  const similar = React.useMemo(() => findSimilarAccounts(accounts), [accounts])
  const ruleIssues = React.useMemo(() => ruleTargetIssues(accounts), [accounts])
  const [open, setOpen] = useState(true)

  if (!similar.length && !ruleIssues.length) {
    return <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg p-2.5 mb-2">✓ 科目健檢：無相近重複科目，智慧匯入規則目標全數相符。</div>
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-2 text-xs text-amber-900 space-y-2">
      <button onClick={() => setOpen((v) => !v)} className="font-bold">
        ⚠ 科目健檢：發現 {similar.length + ruleIssues.length} 個需要留意的項目 {open ? '▲' : '▼'}
      </button>
      {open && (
        <div className="space-y-2">
          {similar.length > 0 && (
            <div>
              <div className="font-medium mb-1">相近/重複科目（記帳會分散在兩處，建議擇一保留；先用明細「批次改科目」把交易移到保留者，再刪除另一個）：</div>
              {similar.map((p, i) => (
                <div key={i} className="pl-2">
                  ・「{p.a.code} {p.a.name}」與「{p.b.code} {p.b.name}」{p.reason === 'same-name' ? '名稱相同' : '名稱高度相近'}
                </div>
              ))}
            </div>
          )}
          {ruleIssues.length > 0 && (
            <div>
              <div className="font-medium mb-1">智慧匯入規則目標檢查（匯入時關鍵字會記到這些編號，請確認意義一致）：</div>
              {ruleIssues.map((r) => (
                <div key={r.code} className="pl-2">
                  {r.missing
                    ? <>・{r.code}（預期「{r.expectedName}」）<b>不存在</b>：關鍵字 {r.keywords.join('、')} 的規則會失效（落入待確認）。請按上方「套用建議科目表」補齊。</>
                    : <>・{r.code} 現名「{r.currentName}」，但匯入規則會把 <b>{r.keywords.join('、')}</b> 記到此編號（預期「{r.expectedName}」）。若意義不同，請改名此科目或告訴我調整規則。</>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function AccountModal({ account, onClose, onSave }: { account: Account | null; onClose: () => void; onSave: (a: Account) => void }) {
  const isEdit = !!account
  const [code, setCode] = useState(account?.code ?? '')
  const [name, setName] = useState(account?.name ?? '')
  const [category, setCategory] = useState<Category>(account?.category ?? 'expense')
  const [isCash, setIsCash] = useState(account?.isCash ?? false)
  const [isOpenItem, setIsOpenItem] = useState(account?.isOpenItem ?? false)

  function save() {
    const normalBalance = category === 'asset' || category === 'expense' ? 'debit' : 'credit'
    onSave({ code: code.trim(), name: name.trim(), category, normalBalance, isCash, isOpenItem, active: true })
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h3 className="font-bold text-sm">{isEdit ? '編輯科目' : '新增科目'}</h3>
          <button onClick={onClose} className="text-gray-400">✕</button>
        </div>
        <div className="p-5 space-y-3">
          <L t="編號"><input value={code} onChange={(e) => setCode(e.target.value)} className={inp} placeholder="例：6107" disabled={isEdit} /></L>
          <L t="名稱"><input value={name} onChange={(e) => setName(e.target.value)} className={inp} placeholder="例：保險費" /></L>
          <L t="類別">
            <select value={category} onChange={(e) => setCategory(e.target.value as Category)} className={inp}>
              {CATS.map((c) => <option key={c} value={c}>{catZh[c]}</option>)}
            </select>
          </L>
          <label className="flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" checked={isCash} onChange={(e) => setIsCash(e.target.checked)} />現金/銀行帳戶</label>
          <label className="flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" checked={isOpenItem} onChange={(e) => setIsOpenItem(e.target.checked)} />應收/應付（需沖銷）</label>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm">取消</button>
          <button onClick={save} disabled={!code || !name} className="px-3 py-1.5 rounded-lg bg-brand text-white text-sm disabled:bg-gray-200">儲存</button>
        </div>
      </div>
    </div>
  )
}

function L({ t, children }: { t: string; children: React.ReactNode }) {
  return <div><label className="block text-xs text-gray-500 mb-1">{t}</label>{children}</div>
}
const inp = 'w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand'
