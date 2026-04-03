export default function ProfitBadge({ value }: { value?: number }) {
  if (value === undefined || value === null) return <span className="text-gray-400">-</span>
  const pos = value >= 0
  return (
    <span className={`font-semibold tabular-nums ${pos ? 'text-green-600' : 'text-red-500'}`}>
      {pos ? '+' : ''}{value.toLocaleString()}
    </span>
  )
}
