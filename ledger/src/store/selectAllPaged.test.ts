import { describe, it, expect, vi } from 'vitest'
import { selectAllPaged, type PageFetcher } from './useLedger'

/**
 * 回歸測試：2026-09 曾因 PostgREST 的 1000 筆上限，讓前端只載到最舊的 1000 筆分錄，
 * 5 月中以後的帳從報表整段消失且無人察覺（不報錯、只是少給資料）。
 * 這組測試鎖住分頁邏輯：一定要抓到「總筆數」為止。
 */

/** 造一個假的資料表，每頁最多回 cap 筆（模擬 max-rows 靜默截斷） */
function fakeTable(total: number, cap = 1000): { fetch: PageFetcher; calls: () => number } {
  let calls = 0
  const rows = Array.from({ length: total }, (_, i) => ({ id: i }))
  const fetch: PageFetcher = async (from, to, withCount) => {
    calls++
    const size = Math.min(to - from + 1, cap)
    return { data: rows.slice(from, from + size), error: null, count: withCount ? total : null }
  }
  return { fetch, calls: () => calls }
}

describe('selectAllPaged', () => {
  it('超過單頁上限時會continue抓完，不會被靜默截斷', async () => {
    const { fetch } = fakeTable(1446)
    const { data, error } = await selectAllPaged<{ id: number }>(fetch)
    expect(error).toBeNull()
    expect(data).toHaveLength(1446)
    expect(data![0].id).toBe(0)
    expect(data![1445].id).toBe(1445)
  })

  it('剛好等於一頁上限時不會漏抓也不會多抓', async () => {
    const { data } = await selectAllPaged<{ id: number }>(fakeTable(1000).fetch)
    expect(data).toHaveLength(1000)
  })

  it('資料量小於一頁時只打一次 API', async () => {
    const t = fakeTable(13)
    const { data } = await selectAllPaged<{ id: number }>(t.fetch)
    expect(data).toHaveLength(13)
    expect(t.calls()).toBe(1)
  })

  it('空表回傳空陣列而非 null', async () => {
    const { data, error } = await selectAllPaged<{ id: number }>(fakeTable(0).fetch)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('只在第一頁要求 count，後續頁不重複計算', async () => {
    const withCountFlags: boolean[] = []
    const base = fakeTable(2500)
    const spy: PageFetcher = (from, to, withCount) => {
      withCountFlags.push(withCount)
      return base.fetch(from, to, withCount)
    }
    await selectAllPaged<{ id: number }>(spy)
    expect(withCountFlags[0]).toBe(true)
    expect(withCountFlags.slice(1).every((f) => f === false)).toBe(true)
  })

  it('後端回錯誤時直接中止並把錯誤往上拋，不回傳半套資料', async () => {
    const boom: PageFetcher = async () => ({ data: null, error: new Error('boom'), count: null })
    const { data, error } = await selectAllPaged<{ id: number }>(boom)
    expect(data).toBeNull()
    expect(error).toBeInstanceOf(Error)
  })

  it('後端謊報 count 也不會無限迴圈（靠空頁收斂）', async () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ id: i }))
    const liar: PageFetcher = async (from, to, withCount) => ({
      data: rows.slice(from, to + 1),
      error: null,
      count: withCount ? 999999 : null, // 謊報總數
    })
    const fn = vi.fn(liar)
    const { data } = await selectAllPaged<{ id: number }>(fn)
    expect(data).toHaveLength(10)
    expect(fn.mock.calls.length).toBeLessThan(5)
  })
})
