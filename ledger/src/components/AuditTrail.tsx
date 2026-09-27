import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useLedger } from '../store/useLedger'
import { formatTWD } from '../core/money'
import type { JournalEntry } from '../core/types'

interface AuditRow {
  id: number
  at: string
  actor: string | null
  table_name: string
  op: 'INSERT' | 'UPDATE' | 'DELETE'
  row_id: string | null
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
}

const OP_ZH: Record<string, { label: string; cls: string }> = {
  INSERT: { label: '新增', cls: 'text-green-700 bg-green-50' },
  UPDATE: { label: '修改', cls: 'text-brand bg-brand-soft' },
  DELETE: { label: '刪除', cls: 'text-red-700 bg-red-50' },
}
const TABLE_ZH: Record<string, string> = { entries: '交易', accounts: '科目', companies: '公司', rules: '規則/對帳點' }

/** 操作軌跡（稽核）檢視：讀 audit_log（DB 觸發器寫入，僅可讀）。刪除的交易可一鍵還原。 */
export default function AuditTrail() {
  const { addEntriesBulk, entries } = useLedger()
  const [rows, setRows] = useState<AuditRow[] | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading')
  const [q, setQ] = useState('')
  const [openId, setOpenId] = useState<number | null>(null)
  const [loadedAll, setLoadedAll] = useState(false)

  const load = React.useCallback(async (beforeId?: number) => {
    let query = supabase.from('audit_log').select('*').order('id', { ascending: false }).limit(200)
    if (beforeId) query = query.lt('id', beforeId)
    const { data, error } = await query
    if (error) { setState('missing'); return }
    setState('ready')
    setRows((prev) => (beforeId && prev ? [...prev, ...(data as AuditRow[])] : (data as AuditRow[])))
    if (!data || data.length < 200) setLoadedAll(true)
  }, [])
  useEffect(() => { load() }, [load])

  /** 交易列的摘要（entries 表的 data 欄是完整分錄） */
  function entryOf(r: AuditRow): JournalEntry | null {
    const src = (r.op === 'DELETE' ? r.old_data : r.new_data) as { data?: JournalEntry } | null
    return src?.data ?? null
  }
  function summary(r: AuditRow): string {
    if (r.table_name === 'entries') {
      const e = entryOf(r)
      if (e) {
        const amt = e.lines?.find((l) => l.debit > 0)?.debit ?? 0
        return `#${String(e.seq ?? 0).padStart(7, '0')} ${e.date} ${e.company ?? ''}「${e.description}」${formatTWD(amt)}`
      }
    }
    return r.row_id ?? ''
  }

  async function restore(r: AuditRow) {
    const e = entryOf(r)
    if (!e) return
    if (entries.some((x) => x.id === e.id)) { alert('這筆交易目前已存在（可能已被還原過）。'); return }
    if (!confirm(`還原被刪除的交易？\n${summary(r)}`)) return
    await addEntriesBulk([e])
    alert('✓ 已還原（保留原流水號）。')
  }

  const filtered = (rows ?? []).filter((r) => {
    if (!q.trim()) return true
    const kw = q.trim().toLowerCase()
    return `${r.actor ?? ''} ${r.table_name} ${r.op} ${r.row_id ?? ''} ${summary(r)}`.toLowerCase().includes(kw)
  })

  if (state === 'missing') {
    return (
      <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 leading-relaxed space-y-1">
        <b>操作軌跡需要一次性設定（約 1 分鐘）：</b>
        <div>到 Supabase Dashboard → SQL Editor → 貼上專案內 <b>supabase/audit.sql</b> 的內容執行一次。</div>
        <div>之後所有 新增/修改/刪除（含機器人寫入）都會留下：誰、何時、改了什麼（完整前後內容），刪除的交易並可在此一鍵還原。</div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 搜尋 操作者 / 流水號 / 摘要…"
          className="flex-1 min-w-[200px] border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
        <button onClick={() => { setLoadedAll(false); load() }} className="text-xs text-gray-400 hover:text-gray-600">↻ 重新整理</button>
      </div>
      {state === 'loading' && <p className="text-xs text-gray-400">載入中…</p>}
      {rows && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr className="bg-gray-50 text-gray-500 text-xs">
              <th className="px-3 py-2 text-left whitespace-nowrap">時間</th>
              <th className="px-3 py-2 text-left">操作者</th>
              <th className="px-3 py-2 text-left">動作</th>
              <th className="px-3 py-2 text-left">對象</th>
              <th className="px-3 py-2 text-left">內容</th>
              <th className="px-3 py-2 w-20"></th>
            </tr></thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400 text-xs">{q ? '查無符合紀錄' : '尚無紀錄（執行 audit.sql 之後的操作才會留下軌跡）'}</td></tr>}
              {filtered.map((r) => (
                <React.Fragment key={r.id}>
                  <tr className="border-t border-gray-100">
                    <td className="px-3 py-1.5 text-gray-500 text-xs whitespace-nowrap">{r.at.slice(0, 16).replace('T', ' ')}</td>
                    <td className="px-3 py-1.5 text-gray-600 text-xs">{r.actor === 'service_role' ? '🤖 機器人/服務' : r.actor ?? '—'}</td>
                    <td className="px-3 py-1.5"><span className={`text-[11px] rounded px-1.5 py-0.5 ${OP_ZH[r.op]?.cls ?? ''}`}>{OP_ZH[r.op]?.label ?? r.op}</span></td>
                    <td className="px-3 py-1.5 text-gray-500 text-xs whitespace-nowrap">{TABLE_ZH[r.table_name] ?? r.table_name}</td>
                    <td className="px-3 py-1.5 text-gray-700 text-xs">{summary(r)}</td>
                    <td className="px-3 py-1.5 text-right whitespace-nowrap">
                      <button onClick={() => setOpenId(openId === r.id ? null : r.id)} className="text-xs text-gray-400 hover:text-brand mr-2">{openId === r.id ? '收合' : '詳情'}</button>
                      {r.table_name === 'entries' && r.op === 'DELETE' && (
                        <button onClick={() => restore(r)} className="text-xs text-brand hover:text-brand-dark underline decoration-dotted">還原</button>
                      )}
                    </td>
                  </tr>
                  {openId === r.id && (
                    <tr><td colSpan={6} className="bg-gray-50 px-4 py-2">
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 text-[11px] font-mono">
                        {r.old_data && <div><div className="text-gray-400 mb-0.5">變更前</div><pre className="bg-white border border-gray-200 rounded p-2 overflow-x-auto max-h-48">{JSON.stringify(r.old_data, null, 1)}</pre></div>}
                        {r.new_data && <div><div className="text-gray-400 mb-0.5">變更後</div><pre className="bg-white border border-gray-200 rounded p-2 overflow-x-auto max-h-48">{JSON.stringify(r.new_data, null, 1)}</pre></div>}
                      </div>
                    </td></tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows && !loadedAll && !q && (
        <button onClick={() => load(rows[rows.length - 1]?.id)} className="text-xs text-brand hover:text-brand-dark">載入更早的紀錄…</button>
      )}
    </div>
  )
}
