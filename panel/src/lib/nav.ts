export const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: 'pixelarticons:home' },
  { id: 'players', label: 'Players', icon: 'pixelarticons:users' },
  { id: 'map', label: 'Map', icon: 'pixelarticons:map' },
  { id: 'worlds', label: 'Worlds', icon: 'pixelarticons:earth' },
  { id: 'console', label: 'Console', icon: 'pixelarticons:terminal' },
  { id: 'shop', label: 'Shop', icon: 'pixelarticons:shopping-cart' },
  { id: 'admin', label: 'Admin Tools', icon: 'pixelarticons:tools' }
] as const

export type PageId = (typeof NAV)[number]['id']
