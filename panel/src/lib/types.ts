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
  platform: string
  version: string | null
  port: number
  path: string
  size: number
  created: string
  status: 'online' | 'offline' | 'installing' | 'starting' | 'failed'
  installing?: boolean
  installPercent?: number
  installMessage?: string
  etaSeconds?: number | null
  speedBps?: number | null
  failed?: boolean
  errorMessage?: string
}

export interface GameMeta {
  id: string
  name: string
  blurb: string
  kind: 'minecraft' | 'steam'
  defaultPort: number
  needsPassword: boolean
  supportsPlugins?: boolean
  maps?: string[]
  modes?: string[]
}

export interface InstallStatus {
  status: 'running' | 'done' | 'error'
  percent: number
  message: string
  game?: string
  dir?: string
  etaSeconds?: number | null
  speedBps?: number | null
}

export interface ServerLogs {
  running: boolean
  lines: ConsoleLine[]
}

export interface ServerInfo {
  name: string
  game: string
  running: boolean
  version: string | null
  worlds: number
  uptimeSeconds: number | null
  rcon: 'on' | 'off'
  online: number | null
  max: number | null
  names: string[]
  tps: [number, number, number] | null
}

export interface WorldInfo {
  name: string
  size: number
}

export interface CreateServerPayload {
  game: string
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
  password: string
  memoryMb: number
  viewDistance: number
  pvp: boolean
  whitelist: boolean
  map: string
  gameMode: string
  plugins: boolean
}

export interface SystemInfo {
  java: string | null
  os: string
  cpus: number
  memTotal: number
  memFree: number
}

export interface SettingsInfo {
  serversDir: string
  custom: boolean
}
