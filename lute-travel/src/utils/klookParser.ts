import { v4 as uuid } from 'uuid'
import { Order, Passenger } from '../types'

const LANG_MAP: Record<string, string> = {
  english: '英語',
  japanese: '日文',
  chinese: '中文',
  mandarin: '中文',
  korean: '韓文',
  vietnamese: '越文',
}

function extract(text: string, pattern: RegExp): string {
  const m = text.match(pattern)
  return m ? m[1].trim() : ''
}

export function parseKlookEmail(rawText: string): Partial<Order> | null {
  // Strip CSV-style outer quotes per line
  const text = rawText
    .replace(/^"(.*)"$/gm, '$1')
    .replace(/^"/gm, '')
    .replace(/"$/gm, '')

  const lines = text.split('\n')

  const bookingRef = extract(text, /Booking reference ID:\s*(\S+)/)
  if (!bookingRef) return null

  // Tour name: line before "Package:"
  let tourName = ''
  const pkgIdx = lines.findIndex((l) => /^Package:\s+/i.test(l.trim()))
  if (pkgIdx > 0) {
    for (let i = pkgIdx - 1; i >= 0; i--) {
      const l = lines[i].trim()
      if (l && !l.startsWith('Klook') && !l.startsWith('Hey') && !l.includes('@')) {
        tourName = l
        break
      }
    }
  }

  const tourDate     = extract(text, /Date Request:\s*(\S+)/)
  const leadEmail    = extract(text, /Lead person email:\s*(\S+)/)
  const leadMobile   = extract(text, /Lead person mobile:\s*(\S+)/)
  const language     = extract(text, /Preferred language:\s*(.+)/)
  const dropOff      = extract(text, /Departure location:\s*(.+)/)

  // Language mapping
  const langMapped = LANG_MAP[language.toLowerCase()] ?? '英語'

  // Lead participant
  let repName = ''
  const leadM = text.match(/Lead participant:\s*\(([^)]+)\)\s*(.+)/)
  if (leadM) repName = `${leadM[1].trim()} ${leadM[2].trim()}`.replace(/^\w+\s/, leadM[2].trim().toUpperCase())

  // Participant counts
  const countM = text.match(/Participant:\s*(\d+)\s*x\s*Adult(?:[^,\n]*,\s*(\d+)\s*x\s*Child)?/i)
  const adults  = countM ? parseInt(countM[1]) : 0
  const infants = countM && countM[2] ? parseInt(countM[2]) : 0
  const totalPax = adults + infants

  // Individual passengers
  const pMap: Record<number, Partial<Passenger>> = {}
  for (const line of lines) {
    let m: RegExpMatchArray | null

    m = line.match(/Participant(\d+)\s+First name:\s*(.+)/i)
    if (m) { const n = +m[1]; pMap[n] = pMap[n] || { num: n }; pMap[n].passportName = m[2].trim().toUpperCase() }

    m = line.match(/Participant(\d+)\s+Last name:\s*(.+)/i)
    if (m) {
      const n = +m[1]; pMap[n] = pMap[n] || {}
      pMap[n].passportName = ((pMap[n].passportName || '') + ' ' + m[2].trim().toUpperCase()).trim()
    }

    m = line.match(/Participant(\d+)\s+Date of birth:\s*(.+)/i)
    if (m) { const n = +m[1]; pMap[n] = pMap[n] || {}; pMap[n].dateOfBirth = m[2].trim() }

    m = line.match(/Participant(\d+)\s+ID number\s*\(Passport\):\s*(.+)/i)
    if (m) { const n = +m[1]; pMap[n] = pMap[n] || {}; pMap[n].passportNo = m[2].trim() }
  }

  const nums = Object.keys(pMap).map(Number).sort((a, b) => a - b)
  const passengers: Passenger[] = nums.map((n, i) => ({
    id: uuid(),
    orderRef: `${bookingRef}=${String(n).padStart(2, '0')}/${totalPax}`,
    sequenceNo: n,
    passportName: pMap[n].passportName || '',
    dateOfBirth: pMap[n].dateOfBirth || '',
    passportNo: pMap[n].passportNo || '',
    isRepresentative: i === 0,
  }))

  return {
    id: uuid(),
    bookingRef,
    orderDate: new Date().toISOString().slice(0, 10),
    tourDate,
    productCode: tourName || '其他',
    totalPax,
    adults,
    infants,
    platform: 'KLOOK',
    platformRevenue: 0,
    cashRevenue: 0,
    language: langMapped,
    status: 'active',
    representativeName: repName || passengers[0]?.passportName || '',
    phone: leadMobile,
    email: leadEmail,
    dropOffLocation: dropOff,
    passengers,
  }
}
