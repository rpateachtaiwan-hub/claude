import React, { useState } from 'react'
import { useStore } from '../store/useStore'
import { parseKlookEmail } from '../utils/klookParser'
import { Order } from '../types'

export default function ImportModal() {
  const { modalState, closeModal, openAddWithPrefill } = useStore()
  const [text, setText] = useState('')
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)

  if (modalState !== 'import') return null

  function handleParse() {
    setResult(null)
    if (!text.trim()) { setResult({ ok: false, msg: '請先貼上訂單確認信內容' }); return }
    const parsed = parseKlookEmail(text)
    if (!parsed || !parsed.bookingRef) {
      setResult({ ok: false, msg: '解析失敗：找不到訂單編號。請確認貼上完整的 Klook 訂單確認信。' })
      return
    }
    // Fill into edit modal
    setResult({ ok: true, msg: `✅ 成功解析訂單 ${parsed.bookingRef}，共 ${parsed.passengers?.length ?? 0} 位旅客。請確認資料後儲存。` })
    // Short delay then open order modal pre-filled
    setTimeout(() => {
      closeModal()
      openAddWithPrefill(parsed)
      setText('')
      setResult(null)
    }, 1200)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-bold text-gray-900">匯入 Klook 訂單</h2>
            <p className="text-xs text-gray-500 mt-0.5">貼上 Klook 訂單確認信內容，自動解析旅客資料</p>
          </div>
          <button onClick={closeModal} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500">
            ✕
          </button>
        </div>

        {/* Instructions */}
        <div className="mx-6 mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700 space-y-1">
          <p className="font-semibold">使用方式</p>
          <p>1. 開啟 Klook 後台的訂單確認信</p>
          <p>2. 全選（Ctrl+A）並複製信件全文</p>
          <p>3. 貼入下方文字框後點「解析並匯入」</p>
          <p>4. 系統自動填入新增訂單表單，確認後儲存</p>
        </div>

        {/* Textarea */}
        <div className="px-6 py-4 flex-1 flex flex-col min-h-0">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Klook 訂單確認信原文
          </label>
          <textarea
            value={text}
            onChange={(e) => { setText(e.target.value); setResult(null) }}
            className="flex-1 min-h-[220px] border border-gray-300 rounded-lg px-3 py-2.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none bg-gray-50 text-gray-800"
            placeholder={`Klook has confirmed an order for Yehliu & Jiufen & Shifen Day Tour...
Booking reference ID: AWB862233
Date Request: 2026-03-23
Lead participant: (MRS)cecile mejares
Lead person email: cecilemejares@yahoo.com
Lead person mobile: 63-9228220719
Participant: 10 x Adult, 1 x Child(0-3)
Preferred language: English
Departure location: MRT Ximen Station Exit 5
Participant1 First name: cecile
Participant1 Last name: mejares
...`}
          />
          {result && (
            <div className={`mt-2 px-3 py-2 rounded text-sm ${result.ok ? 'bg-green-100 text-green-700 border border-green-300' : 'bg-red-100 text-red-700 border border-red-300'}`}>
              {result.msg}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-between items-center">
          <button
            onClick={() => { setText(''); setResult(null) }}
            className="text-sm text-gray-500 hover:text-gray-700 underline"
          >
            清除
          </button>
          <div className="flex gap-2">
            <button onClick={closeModal} className="px-4 py-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50">
              取消
            </button>
            <button
              onClick={handleParse}
              disabled={!text.trim()}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-40 font-medium flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
              解析並匯入
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
