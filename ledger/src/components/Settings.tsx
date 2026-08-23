import React, { useState } from 'react'
import { useLedger } from '../store/useLedger'
import { useAuth } from '../auth/useAuth'
import { hasSupabase } from '../lib/supabase'
import { adminUsersCall, type ManagedUser } from '../lib/adminApi'
import { downloadCSV, toCSV } from '../lib/csv'
import { UNIFIED_PRESET_ACCOUNTS } from '../core/accounts'
import { findSimilarAccounts, ruleTargetIssues, structuralIssues } from '../core/accountAudit'
import type { Account, Category } from '../core/types'

const CATS: Category[] = ['asset', 'liability', 'equity', 'revenue', 'expense']
const catZh: Record<Category, string> = { asset: '資產', liability: '負債', equity: '權益', revenue: '收入', expense: '費用' }

export default function Settings() {
  const { accounts, entries, addAccount, updateAccount, addAccountsBulk, deleteAccount, aiConfig, setAiConfig, companies, addCompany, deleteCompany } = useLedger()

  async function saveAccount(a: Account) {
    if (!editing) { await addAccount(a); return }
    if (editing.code !== a.code) {
      const refs = entries.filter((e) => e.lines.some((l) => l.accountCode === editing.code)).length
      const msg = refs > 0
        ? `編號 ${editing.code} → ${a.code}：將同步更新 ${refs} 筆交易與相關對帳點的科目編號。確定？`
        : `編號 ${editing.code} → ${a.code}：目前沒有交易引用此科目，直接改編號。確定？`
      if (!confirm(msg)) return
    }
    await updateAccount(editing.code, a)
  }

  async function applyPreset() {
    // 同編號或同名稱（去空白/符號）皆視為已存在——使用者改過編號的科目（如 應收帳款 1141→1123）不會被重複加回
    const haveCode = new Set(accounts.map((a) => a.code))
    const normName = (s: string) => s.replace(/[\s/／\-‐（）()]/g, '')
    const haveName = new Set(accounts.map((a) => normName(a.name)))
    const toAdd = UNIFIED_PRESET_ACCOUNTS.filter((a) => !haveCode.has(a.code) && !haveName.has(normName(a.name)))
    if (!toAdd.length) { alert('建議科目表的科目都已存在（含同名稱不同編號者），未新增任何科目。'); return }
    if (!confirm(`將新增 ${toAdd.length} 個建議科目（不覆蓋你現有的同編號或同名稱科目）。要套用嗎？`)) return
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
      {hasSupabase && <UserSecurity />}

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

      {(adding || editing) && <AccountModal account={editing} onClose={() => { setAdding(false); setEditing(null) }} onSave={saveAccount} />}
    </div>
  )
}

/** 使用者與安全：使用者清單（列出/建立/改權限/重設密碼/刪除，經 Netlify Function 以 service_role 執行）＋修改自己的密碼。 */
function UserSecurity() {
  const { email, role, updatePassword, createUser } = useAuth()

  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [pwMsg, setPwMsg] = useState<string | null>(null)

  const [users, setUsers] = useState<ManagedUser[] | null>(null)
  const [callerId, setCallerId] = useState('')
  const [apiState, setApiState] = useState<'loading' | 'ready' | 'unavailable' | 'forbidden'>('loading')
  const [listMsg, setListMsg] = useState<string | null>(null)

  const [newEmail, setNewEmail] = useState('')
  const [newPw, setNewPw] = useState('Routor@2026')
  const [newRole, setNewRole] = useState<'admin' | 'viewer'>('admin')
  const [addMsg, setAddMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const loadUsers = React.useCallback(async () => {
    const r = await adminUsersCall<{ users: ManagedUser[]; callerId: string }>('list')
    if (r.ok && r.data) {
      setUsers(r.data.users.sort((a, b) => a.email.localeCompare(b.email)))
      setCallerId(r.data.callerId)
      setApiState('ready')
    } else if (r.unavailable) setApiState('unavailable')
    else if (r.error?.includes('僅管理員')) setApiState('forbidden')
    else { setApiState('unavailable'); setListMsg(r.error ?? null) }
  }, [])
  React.useEffect(() => { loadUsers() }, [loadUsers])

  async function changePw() {
    setPwMsg(null)
    if (pw1.length < 6) { setPwMsg('密碼至少 6 個字元。'); return }
    if (pw1 !== pw2) { setPwMsg('兩次輸入的密碼不一致。'); return }
    setBusy(true)
    const err = await updatePassword(pw1)
    setBusy(false)
    setPwMsg(err ? `變更失敗：${err}` : '✓ 密碼已變更。')
    if (!err) { setPw1(''); setPw2('') }
  }

  async function addUser() {
    setAddMsg(null)
    if (!newEmail.trim() || newPw.length < 6) { setAddMsg('請輸入 Email，密碼至少 6 字元。'); return }
    setBusy(true)
    if (apiState === 'ready') {
      const r = await adminUsersCall('create', { email: newEmail.trim(), password: newPw, role: newRole })
      setBusy(false)
      if (r.ok) { setAddMsg(`✓ 已建立 ${newEmail.trim()}（${newRole === 'viewer' ? '檢視者' : '管理員'}），可直接以預設密碼登入。`); setNewEmail(''); loadUsers() }
      else setAddMsg(`建立失敗：${r.error}`)
    } else {
      // API 未設定時退回 signUp（受專案「信箱驗證」設定影響）
      const err = await createUser(newEmail, newPw)
      setBusy(false)
      if (!err) setAddMsg(`✓ 已建立 ${newEmail.trim()}，可用預設密碼登入。`)
      else if (err === 'NEEDS_CONFIRM') setAddMsg(`已建立 ${newEmail.trim()}，但需先點信箱驗證信才能登入。`)
      else setAddMsg(`建立失敗：${err}`)
    }
  }

  async function setUserRole(u: ManagedUser, r: 'admin' | 'viewer') {
    const res = await adminUsersCall('setRole', { userId: u.id, role: r })
    if (!res.ok) alert(res.error)
    loadUsers()
  }
  async function resetUserPw(u: ManagedUser) {
    const pw = prompt(`為 ${u.email} 設定新密碼（至少 6 字元）：`, 'Routor@2026')
    if (!pw) return
    const res = await adminUsersCall('setPassword', { userId: u.id, password: pw })
    alert(res.ok ? `✓ 已重設 ${u.email} 的密碼。請提醒對方登入後自行變更。` : `失敗：${res.error}`)
  }
  async function deleteUser(u: ManagedUser) {
    if (!confirm(`確定刪除使用者 ${u.email}？此動作無法復原（其記過的帳仍會保留）。`)) return
    const res = await adminUsersCall('delete', { userId: u.id })
    if (!res.ok) alert(res.error)
    loadUsers()
  }

  const fmtTime = (iso: string | null) => (iso ? iso.slice(0, 16).replace('T', ' ') : '—')

  return (
    <section>
      <h2 className="text-sm font-bold text-gray-900 mb-2">使用者與安全</h2>
      <div className="space-y-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <div className="text-sm font-medium text-gray-700">修改我的密碼<span className="ml-2 text-xs text-gray-400">{email}</span></div>
          <div className="grid grid-cols-2 gap-2 max-w-md">
            <input type="password" value={pw1} onChange={(e) => setPw1(e.target.value)} placeholder="新密碼" autoComplete="new-password" className={inp} />
            <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="再輸入一次" autoComplete="new-password" className={inp} />
          </div>
          <button onClick={changePw} disabled={busy || !pw1 || !pw2} className="px-4 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-dark disabled:opacity-50">變更密碼</button>
          {pwMsg && <p className={`text-xs ${pwMsg.startsWith('✓') ? 'text-green-700' : 'text-red-600'}`}>{pwMsg}</p>}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-gray-700">使用者清單</div>
            {apiState === 'ready' && <button onClick={loadUsers} className="text-xs text-gray-400 hover:text-gray-600">↻ 重新整理</button>}
          </div>

          {apiState === 'loading' && <p className="text-xs text-gray-400">載入中…</p>}

          {apiState === 'forbidden' && (
            <p className="text-xs text-violet-700 bg-violet-50 border border-violet-200 rounded p-2">你是「檢視者」，僅管理員可管理使用者。</p>
          )}

          {apiState === 'unavailable' && (
            <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 leading-relaxed space-y-1">
              <b>使用者清單需要一次性設定（約 2 分鐘）：</b>
              <div>1. Supabase Dashboard → Settings → API → 複製 <b>service_role</b> 金鑰（secret）</div>
              <div>2. Netlify → Site configuration → Environment variables → 新增 <b>SUPABASE_SERVICE_ROLE_KEY</b> ＝ 該金鑰</div>
              <div>3. Netlify → Deploys → Trigger deploy 重新部署一次</div>
              <div>完成後此處會出現完整清單（權限/重設密碼/刪除）。service_role 只存在伺服器端，不會進到瀏覽器。</div>
              {listMsg && <div className="text-red-600">{listMsg}</div>}
            </div>
          )}

          {apiState === 'ready' && users && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead><tr className="bg-gray-50 text-gray-500 text-xs">
                  <th className="px-3 py-2 text-left">使用者帳號</th>
                  <th className="px-3 py-2 text-left">權限</th>
                  <th className="px-3 py-2 text-left">建立時間</th>
                  <th className="px-3 py-2 text-left">最後登入</th>
                  <th className="px-3 py-2 text-center">重設密碼</th>
                  <th className="px-3 py-2 text-center">刪除</th>
                </tr></thead>
                <tbody>
                  {users.map((u) => {
                    const self = u.id === callerId
                    return (
                      <tr key={u.id} className="border-t border-gray-100">
                        <td className="px-3 py-2 text-gray-800">{u.email}{self && <span className="ml-1 text-[10px] text-brand bg-brand-soft rounded px-1">你</span>}</td>
                        <td className="px-3 py-2">
                          <select value={u.role} disabled={self} title={self ? '不可變更自己的權限' : ''}
                            onChange={(e) => setUserRole(u, e.target.value as 'admin' | 'viewer')}
                            className="border border-gray-300 rounded px-1.5 py-1 text-xs disabled:opacity-50 disabled:bg-gray-50">
                            <option value="admin">管理員</option>
                            <option value="viewer">檢視者(唯讀)</option>
                          </select>
                        </td>
                        <td className="px-3 py-2 text-gray-500 text-xs whitespace-nowrap">{fmtTime(u.createdAt)}</td>
                        <td className="px-3 py-2 text-gray-500 text-xs whitespace-nowrap">{fmtTime(u.lastSignInAt)}</td>
                        <td className="px-3 py-2 text-center"><button onClick={() => resetUserPw(u)} className="text-gray-400 hover:text-brand" title="重設此人密碼">🔑</button></td>
                        <td className="px-3 py-2 text-center">
                          <button onClick={() => deleteUser(u)} disabled={self} title={self ? '不可刪除自己' : '刪除使用者'}
                            className="text-gray-300 hover:text-red-500 disabled:opacity-30">✕</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {(apiState === 'ready' || apiState === 'unavailable') && (
            <div className="border-t border-gray-100 pt-3 space-y-2">
              <div className="text-xs font-medium text-gray-600">新增使用者</div>
              <div className="flex flex-wrap gap-2 items-center">
                <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="email@example.com" className={`${inp} max-w-[220px]`} />
                <input value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="預設密碼" className={`${inp} max-w-[150px]`} />
                {apiState === 'ready' && (
                  <select value={newRole} onChange={(e) => setNewRole(e.target.value as 'admin' | 'viewer')} className="border border-gray-300 rounded px-2 py-2 text-sm">
                    <option value="admin">管理員</option>
                    <option value="viewer">檢視者(唯讀)</option>
                  </select>
                )}
                <button onClick={addUser} disabled={busy || !newEmail} className="px-4 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-dark disabled:opacity-50">建立帳號</button>
              </div>
              {addMsg && <p className={`text-xs leading-relaxed ${addMsg.startsWith('✓') ? 'text-green-700' : 'text-amber-700'}`}>{addMsg}</p>}
              <p className="text-[11px] text-gray-400 leading-relaxed">
                「檢視者」要真正唯讀，需在 Supabase SQL Editor 執行一次 <b>supabase/roles.sql</b>（未執行前僅為標記）。目前登入者：{role === 'admin' ? '管理員' : '檢視者'}。
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

/** 科目健檢：相近重複 + 智慧匯入規則目標語意檢查（對使用者真實科目表執行） */
function AccountHealthCheck({ accounts }: { accounts: Account[] }) {
  const similar = React.useMemo(() => findSimilarAccounts(accounts), [accounts])
  const ruleIssues = React.useMemo(() => ruleTargetIssues(accounts), [accounts])
  const structural = React.useMemo(() => structuralIssues(accounts), [accounts])
  const [open, setOpen] = useState(true)

  if (!similar.length && !ruleIssues.length && !structural.length) {
    return <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg p-2.5 mb-2">✓ 科目健檢：無相近重複科目、應收/應付/現金結構完整、智慧匯入規則目標全數相符。</div>
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-2 text-xs text-amber-900 space-y-2">
      <button onClick={() => setOpen((v) => !v)} className="font-bold">
        ⚠ 科目健檢：發現 {similar.length + ruleIssues.length + structural.length} 個需要留意的項目 {open ? '▲' : '▼'}
      </button>
      {open && (
        <div className="space-y-2">
          {structural.length > 0 && (
            <div>
              <div className="font-medium mb-1 text-red-700">結構性問題（會使功能失效，請優先處理）：</div>
              {structural.map((s, i) => <div key={i} className="pl-2 text-red-700">・{s}</div>)}
            </div>
          )}
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
                  {r.expectedName ? (
                    <>
                      ・找不到名為「<b>{r.expectedName}</b>」的科目：關鍵字 <b>{r.keywords.join('、')}</b> 的規則將失效（該類交易落入待確認）。
                      {r.currentName && <>（原編號 {r.code} 現為「{r.currentName}」）</>}
                      處理：新增/改名一個科目為「{r.expectedName}」（編號隨意），或告訴我要對應到你的哪個科目。
                    </>
                  ) : (
                    <>・規則目標編號 <b>{r.code}</b> 不存在於科目表：關鍵字 <b>{r.keywords.join('、')}</b> 的規則將失效。請補建該編號科目，或告訴我新的對應編號。</>
                  )}
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
          <L t="編號">
            <input value={code} onChange={(e) => setCode(e.target.value)} className={inp} placeholder="例：6107" />
            {isEdit && <p className="text-[11px] text-gray-400 mt-0.5">可修改編號：儲存時會自動把引用此科目的交易與對帳點一併改到新編號。</p>}
          </L>
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
