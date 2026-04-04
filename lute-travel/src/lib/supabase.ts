import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const hasSupabase = !!(SUPABASE_URL && SUPABASE_ANON_KEY)

// Use a placeholder URL when env vars are missing to prevent createClient crash
export const supabase = hasSupabase
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : createClient('https://placeholder.supabase.co', 'placeholder')

// ── Type mappers: snake_case (DB) ↔ camelCase (app) ──────────────────────────

export function dbToOrder(row: Record<string, unknown>): import('../types').Order {
  return {
    id:                 row.id as string,
    bookingRef:         row.booking_ref as string,
    orderDate:          (row.order_date as string) || '',
    tourDate:           (row.tour_date as string) || '',
    productCode:        (row.product_code as string) || '',
    totalPax:           (row.total_pax as number) || 0,
    adults:             (row.adults as number) || 0,
    infants:            (row.infants as number) || 0,
    platform:           (row.platform as string) || '',
    platformRevenue:    (row.platform_revenue as number) || 0,
    cashRevenue:        (row.cash_revenue as number) || 0,
    language:           (row.language as string) || '',
    status:             (row.status as 'active' | 'cancelled' | 'pending') || 'pending',
    statusNote:         (row.status_note as string) || undefined,
    meetingTime:        (row.meeting_time as string) || undefined,
    guideId:            (row.guide_id as string) || undefined,
    representativeName: (row.representative_name as string) || undefined,
    phone:              (row.phone as string) || undefined,
    email:              (row.email as string) || undefined,
    dropOffLocation:    (row.drop_off_location as string) || undefined,
    passengers:         [],
  }
}

export function orderToDb(o: import('../types').Order) {
  return {
    id:                  o.id,
    booking_ref:         o.bookingRef,
    order_date:          o.orderDate,
    tour_date:           o.tourDate,
    product_code:        o.productCode,
    total_pax:           o.totalPax,
    adults:              o.adults,
    infants:             o.infants,
    platform:            o.platform,
    platform_revenue:    o.platformRevenue,
    cash_revenue:        o.cashRevenue,
    language:            o.language,
    status:              o.status,
    status_note:         o.statusNote,
    meeting_time:        o.meetingTime,
    guide_id:            o.guideId,
    representative_name: o.representativeName,
    phone:               o.phone,
    email:               o.email,
    drop_off_location:   o.dropOffLocation,
  }
}

export function dbToPassenger(row: Record<string, unknown>): import('../types').Passenger {
  return {
    id:              row.id as string,
    orderRef:        row.order_ref as string,
    sequenceNo:      (row.sequence_no as number) || 0,
    passportName:    (row.passport_name as string) || '',
    dateOfBirth:     (row.date_of_birth as string) || '',
    passportNo:      (row.passport_no as string) || '',
    nationality:     (row.nationality as string) || undefined,
    kakaoId:         (row.kakao_id as string) || undefined,
    isRepresentative:(row.is_representative as boolean) || false,
  }
}
