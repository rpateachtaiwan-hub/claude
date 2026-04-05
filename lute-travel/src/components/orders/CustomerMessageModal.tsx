import React, { useState, useEffect } from 'react'
import { useStaffStore } from '../../store/staffStore'
import { Order } from '../../types'
import { format, parseISO } from 'date-fns'

// ─── Types ─────────────────────────────────────────────────────────────────────
type Tab = 'email' | 'quickReply'
type EmailTemplate = 'standard' | 'guideChanged'
type Situation =
  | 'meetingBeforeTrip'
  | 'meetingSimple'
  | 'meetingDetailed'
  | 'cancellationRequest'
  | 'changeByClient'

interface Props {
  order: Order
  onClose: () => void
}

// ─── Quick reply definitions ────────────────────────────────────────────────────
const SITUATIONS: { value: Situation; label: string; note?: string }[] = [
  { value: 'meetingBeforeTrip',    label: '詢問集合位置（出發前幾天）' },
  { value: 'meetingSimple',        label: '詢問集合位置（簡單）',  note: '附上集合地點截圖 + 行程確認單' },
  { value: 'meetingDetailed',      label: '詢問集合位置（詳細地圖）', note: '附上 HOW TO FIND US 圖片 + 行程確認單' },
  { value: 'cancellationRequest',  label: '行程當天告知無法參加，要求退款' },
  { value: 'changeByClient',       label: '請客人自行更改出發日期' },
]

type Lang = 'zh' | 'en' | 'both'

// ─── Template generators ────────────────────────────────────────────────────────
function genQuickReply(sit: Situation, vars: Record<string, string>, lang: Lang): string {
  const ZH: Record<Situation, (v: Record<string, string>) => string> = {
    meetingBeforeTrip: () =>
`您好，
集合地點為捷運西門站5號出口外。
我們將於您預定行程前一天的下午6點左右，透過電子郵件寄送完整的集合資訊及導遊聯絡方式。
請注意，我們不會主動聯繫，麻煩您務必查收您的電子郵件以獲取相關資訊。
謝謝您`,
    meetingSimple: () =>
`您好，我們已確認該電子郵件已於昨天晚上發送至您提供的地址。
為方便起見，也透過此聊天室分享資訊。
請查看並告知是否一切順利。謝謝。`,
    meetingDetailed: (v) =>
`您好，我們已確認該電子郵件已於昨天晚上發送至您提供的地址。
為方便起見，也透過此聊天室分享資訊。

您的集合時間是：${v.meetingTime || '＿＿＿＿'}，集合地點為西門捷運站 5 號出口。
附上地圖連結給您參考
Google Map: https://maps.app.goo.gl/Bw95Tn7RH662ZtZh7

請查看並告知是否一切順利。謝謝您。`,
    cancellationRequest: () =>
`很遺憾您無法加入今天的行程。
根據 Klook 的取消政策：任何預訂的變更或修改（包括重新安排）皆須在行程的日期前至少 24 小時完成。
請注意：Klook 的 24 小時標準是以「行程日期」為準，而非出發時間。（往前推2天為最後取消日期）

除非屬於不可抗力因素（例如官方發布的颱風警報、地震，或需出示證明的突發疾病），否則在行程前一日或當日，我們通常無法接受變更、重新安排或取消，因為所有必要的安排與準備工作已經完成。

目前您的訂單已超過更改期限，如您能提供相關證明文件，我們將盡力協助您向平台申請特別處理；若無法提供，我們無法為您辦理取消，還請您理解與配合。`,
    changeByClient: (v) =>
`感謝您與我們聯繫。由於您的預訂仍在免費取消和更改期內，我們懇請您直接透過平台進行任何修改。
如果您遇到任何系統問題，請聯絡 Klook 客服。
您可以前往「帳戶」頁面，選擇「說明中心」，然後點擊右下角的聊天圖示進行聯絡。

提醒您，為避免超過 Klook 免費取消及更換日期的期限，請您於 ${v.deadline || '＿＿＿'} 完成操作，謝謝您。`,
  }

  const EN: Record<Situation, (v: Record<string, string>) => string> = {
    meetingBeforeTrip: () =>
`Hello,
The meet-up point is outside Exit 5 of MRT Ximen Station. We will send the full meeting details and the tour guide's contact information via email by around 6:00 PM the day before your scheduled trip.
Please note that we will not reach out proactively, so kindly make sure to check your email for the information. Thank you`,
    meetingSimple: () =>
`Hello, we have confirmed that the email was sent to the address you provided yesterday evening.
For your convenience, we are also sharing it here via this chat.
Please have a look and let us know if everything is in order for your tour.
Thank you.`,
    meetingDetailed: (v) =>
`Hello, We have confirmed that the email was sent to the address you provided yesterday evening.
For your convenience, we are also sharing it here via this chat.
Your meeting time is ${v.meetingTime || '______'} and the meeting point is Exit 5 of MRT Ximen Station outside.

You can also find the meeting point through the link below.
Google Map: https://maps.app.goo.gl/Bw95Tn7RH662ZtZh7

Please have a look and let us know if everything is in order for your tour.
Thank you.`,
    cancellationRequest: () =>
`We're sorry to hear that you are unable to join today's tour.

According to Klook's cancellation policy, any changes or modifications (including rescheduling) must be made at least 24 hours prior to the tour date.
Please note that Klook's 24-hour policy is based on the tour date, not the departure time. (The final cancellation deadline is two days before the tour date.)

Unless there are force majeure circumstances (such as official typhoon warnings, earthquakes, or sudden illness with valid documentation), changes, rescheduling, or cancellations are generally not accepted on the day before or the day of the tour, as all necessary arrangements and preparations have already been made.

As your booking has passed the deadline for changes, if you can provide supporting documentation, we will do our best to assist you in requesting a special exception from the platform.
Without such documentation, we may be unable to process a cancellation.
We appreciate your understanding and cooperation.`,
    changeByClient: (v) =>
`Thank you for contacting us.
Since your booking is still within the free cancellation and modification period, we kindly ask you to make any changes directly through the platform.
If you encounter any system issues, please contact Klook customer service.
You can go to the "Account" page, select the "Help Center," and click the chat icon at the bottom right to get in touch.

Please be reminded to complete the process by ${v.deadline || '______'} to avoid exceeding Klook's free cancellation and date change deadline. Thank you.`,
  }

  if (lang === 'zh') return ZH[sit](vars)
  if (lang === 'en') return EN[sit](vars)
  return ZH[sit](vars) + '\n\n──────────────────\n\n' + EN[sit](vars)
}

function genConfirmationEmail(
  type: EmailTemplate,
  tourDate: string,
  meetingTime: string,
  meetingPlace: string,
  guideName: string,
  guideMobile: string,
  subject: string,
): string {
  const date = tourDate ? (() => {
    try { return format(parseISO(tourDate), 'yyyy/M/d') } catch { return tourDate }
  })() : '______'

  const timePlace = `${meetingTime || '______'} ${meetingPlace}`

  if (type === 'standard') {
    return `${subject}

您好，
謝謝您預訂此商品服務，提供給您集合資訊。
Hello,
Thank you for your booking. Meeting information is provided to you.

導遊會在集合地點手持印有「R Day Tour」的紅色旗子，
再請您上車前，將您的訂單憑證(可用紙本或是手機出示)給我們的導遊確認。
The guide is holding a red flag with "R Day Tour" printed on it
Before boarding the bus(car), please show the Voucher NAME to tour guide for verification.

出發日期 Departure date：
${date}

集合時間地點 Pick up time & place：
${timePlace}
Google Map: https://maps.app.goo.gl/Bw95Tn7RH662ZtZh7

導遊 Tour guide：
Name: ${guideName || '______'}
Mobile: ${guideMobile || '______'}

如果您確認了此封信件，請回覆我們確認。謝謝
If you see this mail please give us a reply. Thank you.`
  }

  // guideChanged
  return `[Tour guide changed]

Hello,
Thank you for your booking. Meeting information is provided to you.

The guide is holding a red flag with "R Day Tour" printed on it
Before boarding the bus(car), please show the Voucher NAME to tour guide for verification.

Departure date :
${date}

Pick up time & place :
${timePlace}
Google Map: https://maps.app.goo.gl/Bw95Tn7RH662ZtZh7

Tour guide :
Name: ${guideName || '______'}
Mobile: ${guideMobile || '______'}

If you see this mail please give us a reply.
Thank you.`
}

// ─── Main Component ─────────────────────────────────────────────────────────────
export default function CustomerMessageModal({ order, onClose }: Props) {
  const { guides } = useStaffStore()
  const guide = guides.find(g => g.id === order.guideId)

  const [tab, setTab] = useState<Tab>('email')
  const [copied, setCopied] = useState(false)

  // ── Email tab state ──
  const [emailType, setEmailType] = useState<EmailTemplate>('standard')
  const [subject, setSubject] = useState(order.productCode || '')
  const [eMeetingTime, setEMeetingTime] = useState(order.meetingTime || '')
  const [eMeetingPlace, setEMeetingPlace] = useState('Exit 5 of MRT Ximen Station outside 捷運西門站5號出口外面')
  const [eGuideName, setEGuideName] = useState(
    guide ? `${guide.name}${guide.englishName ? ` ${guide.englishName}` : ''}` : ''
  )
  const [eGuideMobile, setEGuideMobile] = useState(guide?.phone || '')

  // ── Quick reply tab state ──
  const [situation, setSituation] = useState<Situation>('meetingBeforeTrip')
  const [lang, setLang] = useState<Lang>('both')
  const [vars, setVars] = useState<Record<string, string>>({
    meetingTime: order.meetingTime || '',
    deadline: '',
  })

  // Update guide fields when order.guideId changes
  useEffect(() => {
    const g = guides.find(g => g.id === order.guideId)
    if (g) {
      setEGuideName(`${g.name}${g.englishName ? ` ${g.englishName}` : ''}`)
      setEGuideMobile(g.phone || '')
    }
  }, [order.guideId, guides])

  const emailOutput = genConfirmationEmail(emailType, order.tourDate, eMeetingTime, eMeetingPlace, eGuideName, eGuideMobile, subject)
  const replyOutput = genQuickReply(situation, vars, lang)

  const output = tab === 'email' ? emailOutput : replyOutput

  function copy() {
    navigator.clipboard.writeText(output).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const sitMeta = SITUATIONS.find(s => s.value === situation)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-900">客服訊息</h2>
            <p className="text-xs text-gray-400 mt-0.5">訂單 {order.bookingRef}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500">✕</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b shrink-0 px-6">
          {([['email', '📧 行程確認信'], ['quickReply', '💬 常用回覆']] as [Tab, string][]).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)}
              className={`py-2.5 px-4 text-sm font-medium border-b-2 transition-colors ${
                tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >{label}</button>
          ))}
        </div>

        <div className="flex-1 overflow-hidden flex flex-col lg:flex-row min-h-0">
          {/* Left: Controls */}
          <div className="w-full lg:w-80 shrink-0 border-b lg:border-b-0 lg:border-r border-gray-200 overflow-y-auto px-5 py-4 space-y-4">
            {tab === 'email' && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">信件類型</label>
                  <div className="flex gap-2">
                    {([['standard', '標準確認信'], ['guideChanged', '導遊更換']] as [EmailTemplate, string][]).map(([t, l]) => (
                      <button key={t} onClick={() => setEmailType(t)}
                        className={`flex-1 py-1.5 text-xs rounded-lg border font-medium transition-colors ${
                          emailType === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                        }`}
                      >{l}</button>
                    ))}
                  </div>
                </div>
                <F label="信件主旨 / 商品名稱">
                  <input value={subject} onChange={e => setSubject(e.target.value)} className={inp} placeholder="如：11:15 野十夜九份 - ..." />
                </F>
                <F label="出發日期">
                  <input value={order.tourDate} disabled className={`${inp} bg-gray-50 text-gray-500`} />
                </F>
                <F label="集合時間">
                  <input value={eMeetingTime} onChange={e => setEMeetingTime(e.target.value)} className={inp} placeholder="08:15" />
                </F>
                <F label="集合地點">
                  <input value={eMeetingPlace} onChange={e => setEMeetingPlace(e.target.value)} className={inp} />
                </F>
                <F label="導遊姓名">
                  <input value={eGuideName} onChange={e => setEGuideName(e.target.value)} className={inp} placeholder="邱清燁 Kevin" />
                </F>
                <F label="導遊手機">
                  <input value={eGuideMobile} onChange={e => setEGuideMobile(e.target.value)} className={inp} placeholder="+886-963-390-780" />
                </F>
              </>
            )}

            {tab === 'quickReply' && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">情境</label>
                  <select value={situation} onChange={e => setSituation(e.target.value as Situation)} className={inp}>
                    {SITUATIONS.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                  {sitMeta?.note && (
                    <p className="mt-1.5 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                      📎 {sitMeta.note}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">語言</label>
                  <div className="flex gap-1">
                    {([['zh', '中文'], ['en', 'English'], ['both', '雙語']] as [Lang, string][]).map(([l, label]) => (
                      <button key={l} onClick={() => setLang(l)}
                        className={`flex-1 py-1.5 text-xs rounded-lg border font-medium transition-colors ${
                          lang === l ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                        }`}
                      >{label}</button>
                    ))}
                  </div>
                </div>

                {/* Dynamic variable fields by situation */}
                {situation === 'meetingDetailed' && (
                  <F label="集合時間">
                    <input value={vars.meetingTime} onChange={e => setVars(v => ({ ...v, meetingTime: e.target.value }))}
                      className={inp} placeholder="08:15" />
                  </F>
                )}
                {situation === 'changeByClient' && (
                  <F label="截止日期（請完成操作的期限）">
                    <input value={vars.deadline} onChange={e => setVars(v => ({ ...v, deadline: e.target.value }))}
                      className={inp} placeholder="例：2026/04/08 23:59" />
                  </F>
                )}
              </>
            )}
          </div>

          {/* Right: Preview + Copy */}
          <div className="flex-1 flex flex-col min-h-0 p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">預覽</span>
              <button onClick={copy}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  copied ? 'bg-green-100 text-green-700 border border-green-300' : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {copied ? '✓ 已複製' : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                    複製全文
                  </>
                )}
              </button>
            </div>
            <textarea
              readOnly
              value={output}
              className="flex-1 w-full border border-gray-200 rounded-lg px-3 py-3 text-sm text-gray-800 bg-gray-50 resize-none focus:outline-none font-mono leading-relaxed"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  )
}

const inp = 'w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500'
