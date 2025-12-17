export function computeWpm(correctChars: number, durationMs: number): number {
  if (!Number.isFinite(correctChars) || !Number.isFinite(durationMs)) return 0
  if (durationMs <= 0) return 0
  const minutes = durationMs / 60000
  return (correctChars / 5) / minutes
}

export function computeUnproductivePercent(
  typedKeystrokes: number,
  incorrect: number,
  collateral: number,
  backspaces: number,
): number {
  if (!Number.isFinite(typedKeystrokes) || typedKeystrokes <= 0) return 0
  return ((incorrect + collateral + backspaces) / typedKeystrokes) * 100
}

