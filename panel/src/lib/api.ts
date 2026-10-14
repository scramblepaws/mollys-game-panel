import type {
  CreateServerPayload,
  GameMeta,
  InstallStatus,
  ServerInstance,
  ServerInfo,
  ServerLogs,
  SettingsInfo,
  ShopDetail,
  ShopItem,
  SystemInfo,
  WorldInfo
} from './types'

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

export async function getSettings(): Promise<SettingsInfo> {
  const res = await fetch('/api/settings')
  if (!res.ok) throw new Error(String(res.status))
  return (await res.json()) as SettingsInfo
}

export interface FileEntry {
  name: string
  dir: boolean
  size: number
}

export async function listServerFiles(name: string, path = ''): Promise<{ path: string; entries: FileEntry[] }> {
  const q = path ? `?path=${encodeURIComponent(path)}` : ''
  const res = await fetch(`/api/servers/${encodeURIComponent(name)}/files${q}`)
  if (!res.ok) throw new Error(String(res.status))
  return (await res.json()) as { path: string; entries: FileEntry[] }
}

export async function readServerFile(name: string, path: string): Promise<{ path: string; content: string }> {
  const res = await fetch(`/api/servers/${encodeURIComponent(name)}/file?path=${encodeURIComponent(path)}`)
  if (!res.ok) {
    const j = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(j?.error ?? String(res.status))
  }
  return (await res.json()) as { path: string; content: string }
}

export async function saveServerFile(name: string, path: string, content: string): Promise<void> {
  const res = await fetch(`/api/servers/${encodeURIComponent(name)}/file`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path, content })
  })
  if (!res.ok) {
    const j = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(j?.error ?? String(res.status))
  }
}

export async function setServerIcon(name: string, bytes: ArrayBuffer): Promise<void> {
  const res = await fetch(`/api/servers/${encodeURIComponent(name)}/icon`, {
    method: 'POST',
    body: bytes
  })
  if (!res.ok) {
    const j = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(j?.error ?? String(res.status))
  }
}

export async function removeServerIcon(name: string): Promise<void> {
  const res = await fetch(`/api/servers/${encodeURIComponent(name)}/icon`, { method: 'DELETE' })
  if (!res.ok) {
    const j = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(j?.error ?? String(res.status))
  }
}

export async function cancelInstall(name: string): Promise<void> {
  const res = await fetch(`/api/servers/${encodeURIComponent(name)}/install/cancel`, { method: 'POST' })
  if (!res.ok) {
    const j = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(j?.error ?? String(res.status))
  }
}

export async function setSettings(location: string): Promise<SettingsInfo> {
  const res = await fetch('/api/settings', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ location })
  })
  if (!res.ok) {
    const j = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(j?.error ?? String(res.status))
  }
  return (await res.json()) as SettingsInfo
}

export async function getGames(): Promise<GameMeta[]> {
  const res = await fetch('/api/games')
  if (!res.ok) throw new Error(String(res.status))
  return (await res.json()) as GameMeta[]
}

export async function getInstalls(): Promise<Record<string, InstallStatus>> {
  const res = await fetch('/api/installs')
  if (!res.ok) throw new Error(String(res.status))
  return (await res.json()) as Record<string, InstallStatus>
}

export async function getServerLogs(name: string): Promise<ServerLogs> {
  const res = await fetch(`/api/servers/${encodeURIComponent(name)}/logs`)
  if (!res.ok) throw new Error(String(res.status))
  return (await res.json()) as ServerLogs
}

export async function getServerInfo(name: string): Promise<ServerInfo> {
  const res = await fetch(`/api/servers/${encodeURIComponent(name)}/info`)
  if (!res.ok) throw new Error(String(res.status))
  return (await res.json()) as ServerInfo
}

export async function getServerWorlds(name: string): Promise<WorldInfo[]> {
  const res = await fetch(`/api/servers/${encodeURIComponent(name)}/worlds`)
  if (!res.ok) throw new Error(String(res.status))
  return (await res.json()) as WorldInfo[]
}

export async function deleteServer(name: string): Promise<void> {
  const res = await fetch(`/api/servers/${encodeURIComponent(name)}/delete`, { method: 'POST' })
  if (!res.ok) {
    const j = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(j?.error ?? String(res.status))
  }
}

export async function installProject(name: string, slug: string, type: string): Promise<{ file: string }> {
  const res = await fetch(`/api/servers/${encodeURIComponent(name)}/plugins`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ slug, type })
  })
  if (!res.ok) {
    const j = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(j?.error ?? String(res.status))
  }
  return (await res.json()) as { file: string }
}

export async function sendServerCommand(name: string, command: string): Promise<void> {
  const res = await fetch(`/api/servers/${encodeURIComponent(name)}/command`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ command })
  })
  if (!res.ok) {
    const j = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(j?.error ?? String(res.status))
  }
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

export async function getServerStatuses(): Promise<Record<string, 'online' | 'starting' | 'offline'>> {
  const res = await fetch('/api/servers/status')
  if (!res.ok) throw new Error(String(res.status))
  return (await res.json()) as Record<string, 'online' | 'starting' | 'offline'>
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
