import React, { useState } from 'react'

const SOURCES = ['/logo.png', '/logo.jpg', '/logo.jpeg', '/logo.svg']

/**
 * 顯示品牌 Logo。依序嘗試 public/logo.png → .jpg → .jpeg → .svg；
 * 都沒有時顯示以品牌色重繪的 SVG 版本。
 */
export default function Logo({ height = 34 }: { height?: number }) {
  const [idx, setIdx] = useState(0)
  if (idx < SOURCES.length) {
    return <img src={SOURCES[idx]} alt="ROUTOR" style={{ height }} onError={() => setIdx(idx + 1)} />
  }
  return (
    <div className="flex items-center gap-2.5" style={{ height }}>
      <svg width={height} height={height} viewBox="0 0 48 48" fill="none" aria-label="ROUTOR">
        <defs>
          <linearGradient id="rg" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
            <stop stopColor="#5B93E8" />
            <stop offset="1" stopColor="#1F569F" />
          </linearGradient>
        </defs>
        <path d="M10 6h18a11 11 0 0 1 4 21l9 15h-11l-8-14h-3v14H10V6Zm9 9v6h7a3 3 0 0 0 0-6h-7Z" fill="url(#rg)" />
        <path d="M30 33l3 5 6-2-9-3Z" fill="#E2483D" />
      </svg>
      <div className="leading-none">
        <div className="font-extrabold tracking-tight text-ink text-[17px]">ROUTOR</div>
        <div className="text-[9px] text-gray-400 tracking-wide">Move the Route Forward</div>
      </div>
    </div>
  )
}

