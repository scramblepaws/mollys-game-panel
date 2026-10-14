export interface Player {
  name: string
  pronouns: string | null
  ping: number
  gamemode: 'survival' | 'creative' | 'spectator'
  world: string
  x: number
  y: number
  z: number
  health: number
}

export interface World {
  id: string
  name: string
  kind: string
  difficulty: 'easy' | 'peaceful'
  border: number
  players: number
  icon: string
}

export interface Stats {
  online: number
  max: number
  tps: number
  uptime: string
  worlds: number
  version: string
}

export interface Activity {
  time: string
  text: string
}

export interface ShopItem {
  slug: string
  title: string
  description: string
  type: 'plugin' | 'datapack'
  downloads: number
  icon: string | null
}

export interface GalleryImage {
  url: string
  title: string
  featured: boolean
}

export interface ShopDetail {
  slug: string
  title: string
  description: string
  icon: string | null
  downloads: number
  followers: number
  categories: string[]
  loaders: string[]
  license: string | null
  published: string
  updated: string
  author: string | null
  gallery: GalleryImage[]
}

export interface ConsoleLine {
  time: string
  level: 'info' | 'warn' | 'join' | 'leave'
  text: string
}

export interface ServerInstance {
  name: string
  game: string
  platform: 'paper' | 'purpur' | 'vanilla' | 'unknown'
  version: string | null
  port: number
  path: string
  size: number
  created: string
  status: 'online' | 'offline'
}

export interface CreateServerPayload {
  name: string
  platform: 'paper' | 'purpur' | 'vanilla'
  version: string
  port: number
  eula: boolean
  motd: string
  maxPlayers: number
  difficulty: 'peaceful' | 'easy' | 'normal' | 'hard'
  gamemode: 'survival' | 'creative' | 'adventure'
  onlineMode: boolean
  location: string
}

export interface SystemInfo {
  java: string | null
  os: string
  cpus: number
  memTotal: number
  memFree: number
}
