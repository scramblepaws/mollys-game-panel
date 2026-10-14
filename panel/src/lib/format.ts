export const fmtEta = (s: number) => {
  if (s < 60) return `~${Math.max(1, s)}s`
  if (s < 3600) return `~${Math.round(s / 60)}m`
  return `~${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m`
}

export const fmtSpeed = (bps: number) => {
  if (bps < 1024) return `${Math.round(bps)} B/s`
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(0)} KB/s`
  return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`
}
