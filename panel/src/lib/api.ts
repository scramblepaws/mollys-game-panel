import * as mock from './mock'
import type {
  Activity,
  ConsoleLine,
  CreateServerPayload,
  Player,
  ServerInstance,
  ShopDetail,
  ShopItem,
  Stats,
  SystemInfo,
  World
} from './types'

async function get<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(path)
    if (!res.ok) throw new Error(String(res.status))
    return (await res.json()) as T
  } catch {
    return fallback
  }
}

export const getStats = (): Promise<Stats> => get('/api/dashboard', mock.stats)
export const getPlayers = (): Promise<Player[]> => get('/api/players', mock.players)
export const getWorlds = (): Promise<World[]> => get('/api/worlds', mock.worlds)
export const getActivity = (): Promise<Activity[]> => get('/api/activity', mock.activity)
export const getConsole = (): Promise<ConsoleLine[]> => get('/api/console', mock.consoleLines)

export async function searchShop(query: string, type: 'any' | 'plugin' | 'datapack'): Promise<ShopItem[]> {
  const params = new URLSearchParams({ q: query, type })
  const res = await fetch(`/api/shop?${params}`)
  if (!res.ok) throw new Error(String(res.status))
  return (await res.json()) as ShopItem[]
}

export async function getShopDetail(slug: string): Promise<ShopDetail> {
  const res = await fetch(`/api/shop/project/${encodeURIComponent(slug)}`)
  if (!res.ok) throw new Error(String(res.status))
  return (await res.json()) as ShopDetail
}

export async function listServers(): Promise<ServerInstance[]> {
  const res = await fetch('/api/servers')
  if (!res.ok) throw new Error(String(res.status))
  return (await res.json()) as ServerInstance[]
}

export async function getVersions(platform: 'paper' | 'purpur' | 'vanilla'): Promise<string[]> {
  const res = await fetch(`/api/versions/${platform}`)
  if (!res.ok) throw new Error(String(res.status))
  return (await res.json()) as string[]
}

export async function pickFolder(): Promise<string | null> {
  const res = await fetch('/api/fs/pick')
  if (!res.ok) throw new Error(String(res.status))
  const j = (await res.json()) as { path: string | null }
  return j.path
}

export async function getMe(): Promise<{ name: string }> {
  const res = await fetch('/api/me')
  if (!res.ok) throw new Error(String(res.status))
  return (await res.json()) as { name: string }
}

export async function getSystem(): Promise<SystemInfo> {
  const res = await fetch('/api/system')
  if (!res.ok) throw new Error(String(res.status))
  return (await res.json()) as SystemInfo
}

export async function getServerStatuses(): Promise<Record<string, boolean>> {
  const res = await fetch('/api/servers/status')
  if (!res.ok) throw new Error(String(res.status))
  return (await res.json()) as Record<string, boolean>
}

async function serverAction(name: string, action: 'start' | 'stop'): Promise<void> {
  const res = await fetch(`/api/servers/${encodeURIComponent(name)}/${action}`, { method: 'POST' })
  if (!res.ok) {
    const j = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(j?.error ?? String(res.status))
  }
}

export const startInstance = (name: string) => serverAction(name, 'start')
export const stopInstance = (name: string) => serverAction(name, 'stop')

export async function createServer(payload: CreateServerPayload): Promise<void> {
  const res = await fetch('/api/servers', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  })
  if (!res.ok) {
    const j = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(j?.error ?? String(res.status))
  }
}
