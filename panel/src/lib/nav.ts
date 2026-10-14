export const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: 'pixelarticons:home' },
  { id: 'players', label: 'Players', icon: 'pixelarticons:users' },
  { id: 'worlds', label: 'Worlds', icon: 'pixelarticons:earth' },
  { id: 'files', label: 'Files', icon: 'pixelarticons:folder' },
  { id: 'console', label: 'Console', icon: 'pixelarticons:terminal' },
  { id: 'shop', label: 'Shop', icon: 'pixelarticons:shopping-cart' }
] as const

export type PageId = (typeof NAV)[number]['id']
