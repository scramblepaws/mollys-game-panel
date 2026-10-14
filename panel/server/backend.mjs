import { execFile, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { connect } from 'node:net'
import { cpus, freemem, platform, release, totalmem, userInfo } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = 8787
const MC_VERSION = '26.3'
const MODRINTH = 'https://api.modrinth.com/v2/search'
const SERVERS_DIR = fileURLToPath(new URL('../../servers/', import.meta.url))
const REGISTRY_FILE = fileURLToPath(new URL('./instances.json', import.meta.url))

const data = {
  '/api/health': { ok: true, service: 'panel-api' },
  '/api/dashboard': { online: 4, max: 20, tps: 20, uptime: '3d 7h', worlds: 3, version: 'Paper 26.3' },
  '/api/players': [
    { name: 'Molly', pronouns: 'She/her', ping: 12, gamemode: 'survival', world: 'Survival', x: 128, y: 64, z: -412, health: 17 },
    { name: 'Aspen', pronouns: 'They/them', ping: 31, gamemode: 'creative', world: 'Free Build', x: -2048, y: 4, z: 512, health: 20 },
    { name: 'Juniper', pronouns: 'She/they', ping: 22, gamemode: 'survival', world: 'Survival', x: -96, y: 71, z: 233, health: 14 },
    { name: 'Rook', pronouns: 'He/him', ping: 48, gamemode: 'creative', world: 'Redstone Testing', x: 40, y: 4, z: -88, health: 20 }
  ],
  '/api/worlds': [
    { id: 'world', name: 'Survival', kind: 'Vanilla terrain', difficulty: 'easy', border: 10000, players: 2, icon: 'pixelarticons:tree-pine' },
    { id: 'freebuild', name: 'Free Build', kind: 'Superflat · forced creative', difficulty: 'peaceful', border: 5000, players: 1, icon: 'pixelarticons:brush' },
    { id: 'redstone', name: 'Redstone Testing', kind: 'Superflat · forced creative', difficulty: 'peaceful', border: 500, players: 1, icon: 'pixelarticons:circuit-board' }
  ],
  '/api/activity': [
    { time: '19:05', text: 'Rook joined the game' },
    { time: '19:04', text: 'Aspen switched to Free Build (creative)' },
    { time: '19:01', text: 'Juniper joined the game' },
    { time: '18:58', text: 'Molly set time to day in Survival' },
    { time: '18:52', text: 'Backup completed (worlds · 412 MB)' }
  ],
  '/api/console': [
    { time: '19:02:11', level: 'info', text: 'Starting minecraft server version 26.3' },
    { time: '19:02:29', level: 'info', text: 'Preparing level "world"' },
    { time: '19:02:31', level: 'info', text: 'Done (20.114s)! For help, type "help"' },
    { time: '19:04:02', level: 'join', text: 'Molly joined the game' },
    { time: '19:04:19', level: 'warn', text: "Can't keep up! Running 2143ms behind" },
    { time: '19:05:44', level: 'join', text: 'Rook joined the game' }
  ]
}

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

const HEADERS = { 'user-agent': 'molly-panel/0.1 (local admin panel)' }

function dirSize(dir) {
  let total = 0
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    try {
      const p = join(dir, e.name)
      total += e.isDirectory() ? dirSize(p) : statSync(p).size
    } catch {}
  }
  return total
}

function parseProperties(file) {
  const out = {}
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const i = line.indexOf('=')
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
  return out
}

function portOpen(port) {
  return new Promise((resolve) => {
    const sock = connect({ host: '127.0.0.1', port })
    const done = (v) => {
      sock.destroy()
      resolve(v)
    }
    sock.setTimeout(400, () => done(false))
    sock.on('connect', () => done(true))
    sock.on('error', () => done(false))
  })
}

function readJson(req) {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (c) => {
      data += c
      if (data.length > 1e6) req.destroy()
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(data))
      } catch {
        resolve(null)
      }
    })
    req.on('error', () => resolve(null))
  })
}

function readRegistry() {
  try {
    const j = JSON.parse(readFileSync(REGISTRY_FILE, 'utf8'))
    return Array.isArray(j) ? j.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

function writeRegistry(roots) {
  writeFileSync(REGISTRY_FILE, JSON.stringify(roots, null, 2))
}

function instanceRoots() {
  const roots = [SERVERS_DIR]
  for (const r of readRegistry()) {
    if (r !== SERVERS_DIR && existsSync(r)) roots.push(r)
  }
  return roots
}

function findInstanceDir(name) {
  for (const root of instanceRoots()) {
    const dir = join(root, name)
    if (existsSync(dir)) return dir
  }
  return null
}

const running = new Map()

function lightInstances() {
  const out = []
  for (const root of instanceRoots()) {
    for (const e of readdirSync(root, { withFileTypes: true })) {
      if (!e.isDirectory()) continue
      const dir = join(root, e.name)
      let marker = {}
      try {
        marker = JSON.parse(readFileSync(join(dir, '.panel.json'), 'utf8'))
      } catch {}
      let props = {}
      try {
        props = parseProperties(join(dir, 'server.properties'))
      } catch {}
      out.push({ name: e.name, port: Number(marker.port ?? props['server-port'] ?? 0) })
    }
  }
  return out
}

function startInstance(name, res) {
  const dir = findInstanceDir(name)
  if (!dir) {
    send(res, 404, { error: 'unknown server' })
    return
  }
  if (running.has(name)) {
    send(res, 400, { error: 'already running' })
    return
  }
  const jars = readdirSync(dir).filter((f) => f.endsWith('.jar'))
  const jar = jars.includes('paper.jar') ? 'paper.jar' : jars.includes('purpur.jar') ? 'purpur.jar' : jars[0]
  if (!jar) {
    send(res, 400, { error: 'no server jar found' })
    return
  }
  try {
    const child = spawn(resolveJava(), ['-Xms2G', '-Xmx2G', '-jar', jar, 'nogui'], {
      cwd: dir,
      windowsHide: true
    })
    running.set(name, child)
    child.stdout.on('data', () => {})
    child.stderr.on('data', () => {})
    child.on('exit', () => running.delete(name))
    child.on('error', () => running.delete(name))
    send(res, 200, { ok: true })
  } catch (err) {
    send(res, 502, { error: String(err) })
  }
}

function stopInstance(name, res) {
  const child = running.get(name)
  if (!child) {
    send(res, 400, { error: 'not started by the panel' })
    return
  }
  try {
    child.stdin.write('stop\n')
    send(res, 200, { ok: true })
  } catch (err) {
    send(res, 502, { error: String(err) })
  }
}

function resolveJava() {
  const roots = [
    fileURLToPath(new URL('../../runtime/', import.meta.url)),
    'C:\\Program Files\\Eclipse Adoptium',
    'C:\\Program Files\\Java'
  ]
  const candidates = []
  for (const root of roots) {
    if (!existsSync(root)) continue
    for (const d of readdirSync(root, { withFileTypes: true })) {
      if (!d.isDirectory()) continue
      const exe = join(root, d.name, 'bin', 'java.exe')
      if (existsSync(exe)) {
        const m = d.name.match(/(\d+)/)
        candidates.push({ major: m ? Number(m[1]) : 0, exe })
      }
    }
  }
  if (candidates.length === 0) return 'java'
  candidates.sort((a, b) => b.major - a.major)
  return candidates[0].exe
}

function javaVersion() {
  return new Promise((resolvePromise) => {
    execFile(resolveJava(), ['-version'], { timeout: 5000, windowsHide: true }, (_err, stdout, stderr) => {
      const out = String(stderr || stdout)
      const m = out.match(/version "([^"]+)"/)
      resolvePromise(m ? m[1] : null)
    })
  })
}

function pickFolder() {
  return new Promise((resolvePromise, reject) => {
    execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-STA',
        '-Command',
        "Add-Type -AssemblyName System.Windows.Forms | Out-Null; $d = New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description = 'Choose where this server should be stored'; if ($d.ShowDialog() -eq 'OK') { Write-Output $d.SelectedPath }"
      ],
      { timeout: 180000, windowsHide: true },
      (err, stdout) => (err ? reject(err) : resolvePromise(String(stdout).trim() || null))
    )
  })
}

async function listInstances() {
  const out = []
  for (const root of instanceRoots()) {
    for (const e of readdirSync(root, { withFileTypes: true })) {
      if (!e.isDirectory()) continue
      const dir = join(root, e.name)
      let marker = {}
      try {
        marker = JSON.parse(readFileSync(join(dir, '.panel.json'), 'utf8'))
      } catch {}
      let props = {}
      try {
        props = parseProperties(join(dir, 'server.properties'))
      } catch {}
      const port = Number(marker.port ?? props['server-port'] ?? 0)
      const jars = readdirSync(dir).filter((f) => f.endsWith('.jar'))
      out.push({
        name: e.name,
        game: 'minecraft',
        platform:
          marker.platform ??
          (jars.some((j) => j.includes('paper'))
            ? 'paper'
            : jars.some((j) => j.includes('purpur'))
              ? 'purpur'
              : jars.length
                ? 'vanilla'
                : 'unknown'),
        version: marker.version ?? null,
        port,
        path: dir,
        size: dirSize(dir),
        created: statSync(dir).birthtime.toISOString(),
        status: port ? ((await portOpen(port)) ? 'online' : 'offline') : 'offline'
      })
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

async function paperVersions() {
  const r = await fetch('https://fill.papermc.io/v3/projects/paper', { headers: HEADERS })
  if (!r.ok) throw new Error(`paper api responded ${r.status}`)
  const j = await r.json()
  const out = []
  for (const group of Object.values(j.versions)) {
    for (const v of group) if (!v.includes('-')) out.push(v)
  }
  return out
}

async function paperDownloadUrl(version) {
  const r = await fetch(
    `https://fill.papermc.io/v3/projects/paper/versions/${encodeURIComponent(version)}/builds/latest`,
    { headers: HEADERS }
  )
  if (!r.ok) throw new Error(`paper build responded ${r.status}`)
  const j = await r.json()
  const d = j.downloads?.['server:default'] ?? Object.values(j.downloads ?? {})[0]
  if (!d?.url) throw new Error('no paper download found')
  return d.url
}

async function purpurVersions() {
  const r = await fetch('https://api.purpurmc.org/v2/purpur', { headers: HEADERS })
  if (!r.ok) throw new Error(`purpur api responded ${r.status}`)
  const j = await r.json()
  return [...j.versions].reverse()
}

function purpurDownloadUrl(version) {
  return `https://api.purpurmc.org/v2/purpur/${encodeURIComponent(version)}/latest/download`
}

async function vanillaManifest() {
  const r = await fetch('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json', { headers: HEADERS })
  if (!r.ok) throw new Error(`mojang responded ${r.status}`)
  return await r.json()
}

async function vanillaVersions() {
  const j = await vanillaManifest()
  return j.versions.filter((v) => v.type === 'release').map((v) => v.id)
}

async function vanillaDownloadUrl(version) {
  const j = await vanillaManifest()
  const entry = j.versions.find((v) => v.id === version)
  if (!entry) throw new Error('version not found')
  const vj = await (await fetch(entry.url, { headers: HEADERS })).json()
  const url = vj.downloads?.server?.url
  if (!url) throw new Error('no server download for this version')
  return url
}

async function createInstance(req, res) {
  const body = await readJson(req)
  const name = String(body?.name ?? '')
  const platform = ['paper', 'vanilla', 'purpur'].includes(body?.platform) ? body.platform : 'paper'
  const version = String(body?.version ?? '')
  const port = Number(body?.port ?? 0)
  const eula = !!body?.eula
  const motd = String(body?.motd ?? '').replace(/[\r\n]/g, ' ').slice(0, 60) || name
  const maxPlayers = Number(body?.maxPlayers ?? 20)
  const difficulty = ['peaceful', 'easy', 'normal', 'hard'].includes(body?.difficulty) ? body.difficulty : 'easy'
  const gamemode = ['survival', 'creative', 'adventure'].includes(body?.gamemode) ? body.gamemode : 'survival'
  const onlineMode = body?.onlineMode !== false
  const rawLocation = String(body?.location ?? '').trim()

  if (!/^[a-zA-Z0-9_-]{1,32}$/.test(name)) {
    send(res, 400, { error: 'name must be 1-32 letters, numbers, dashes or underscores' })
    return
  }
  if (!/^[\w.-]{1,20}$/.test(version)) {
    send(res, 400, { error: 'invalid version' })
    return
  }
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    send(res, 400, { error: 'port must be between 1024 and 65535' })
    return
  }
  if (!Number.isInteger(maxPlayers) || maxPlayers < 1 || maxPlayers > 500) {
    send(res, 400, { error: 'max players must be between 1 and 500' })
    return
  }
  if (rawLocation && !isAbsolute(rawLocation)) {
    send(res, 400, { error: 'storage location must be an absolute path' })
    return
  }
  const location = rawLocation ? resolve(rawLocation) : SERVERS_DIR

  const dir = join(location, name)
  if (existsSync(dir)) {
    send(res, 400, { error: 'a server with that name already exists' })
    return
  }

  const existing = await listInstances()
  const clash = existing.find((i) => i.port === port)
  if (clash) {
    send(res, 400, { error: `port ${port} is already used by "${clash.name}"` })
    return
  }

  try {
    const url =
      platform === 'paper'
        ? await paperDownloadUrl(version)
        : platform === 'purpur'
          ? purpurDownloadUrl(version)
          : await vanillaDownloadUrl(version)
    const jarName = platform === 'purpur' ? 'purpur.jar' : platform === 'paper' ? 'paper.jar' : 'server.jar'
    mkdirSync(dir, { recursive: true })
    const buf = Buffer.from(await (await fetch(url, { headers: HEADERS })).arrayBuffer())
    writeFileSync(join(dir, jarName), buf)
    writeFileSync(join(dir, 'eula.txt'), `eula=${eula}\n`)
    writeFileSync(
      join(dir, 'server.properties'),
      [
        `motd=${motd}`,
        `server-port=${port}`,
        `max-players=${maxPlayers}`,
        `difficulty=${difficulty}`,
        `gamemode=${gamemode}`,
        `online-mode=${onlineMode}`,
        'view-distance=10',
        'simulation-distance=10',
        ''
      ].join('\n')
    )
    writeFileSync(
      join(dir, 'start.cmd'),
      `@echo off\r\ntitle ${name}\r\ncd /d "%~dp0"\r\njava -Xms2G -Xmx2G -jar ${jarName} nogui\r\npause\r\n`
    )
    writeFileSync(
      join(dir, '.panel.json'),
      JSON.stringify({ platform, version, port, created: new Date().toISOString() }, null, 2)
    )
    if (location !== SERVERS_DIR) {
      const reg = readRegistry()
      if (!reg.includes(location)) writeRegistry([...reg, location])
    }
    send(res, 200, { ok: true })
  } catch (err) {
    send(res, 502, { error: String(err) })
  }
}

async function handleSkin(name, res) {
  try {
    const r = await fetch(`https://mc-heads.net/skin/${encodeURIComponent(name)}`, { headers: HEADERS })
    if (!r.ok) throw new Error(`mc-heads responded ${r.status}`)
    const buf = Buffer.from(await r.arrayBuffer())
    res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=3600' })
    res.end(buf)
  } catch (err) {
    send(res, 502, { error: String(err) })
  }
}

async function handleProject(slug, res) {
  try {
    const pr = await fetch(`https://api.modrinth.com/v2/project/${encodeURIComponent(slug)}`, { headers: HEADERS })
    if (!pr.ok) throw new Error(`modrinth responded ${pr.status}`)
    const p = await pr.json()

    let author = null
    if (p.team) {
      try {
        const tr = await fetch(`https://api.modrinth.com/v2/team/${p.team}/members`, { headers: HEADERS })
        if (tr.ok) {
          const members = await tr.json()
          author = (members.find((m) => m.role === 'Owner') ?? members[0])?.user?.username ?? null
        }
      } catch {}
    }

    send(res, 200, {
      slug: p.slug,
      title: p.title,
      description: p.description,
      icon: p.icon_url,
      downloads: p.downloads,
      followers: p.followers,
      categories: p.categories ?? [],
      loaders: p.loaders ?? [],
      license: p.license?.name ?? null,
      published: p.published,
      updated: p.updated,
      author,
      gallery: (p.gallery ?? []).map((g) => ({ url: g.url, title: g.title ?? '', featured: !!g.featured }))
    })
  } catch (err) {
    send(res, 502, { error: String(err) })
  }
}

async function handleShop(url, res) {
  const q = url.searchParams.get('q') ?? ''
  const type = url.searchParams.get('type') ?? 'any'
  const facets =
    type === 'plugin'
      ? [
          ['all_project_types:plugin'],
          [`versions:${MC_VERSION}`],
          ['categories:paper', 'categories:bukkit', 'categories:spigot', 'categories:purpur']
        ]
      : type === 'datapack'
        ? [['all_project_types:datapack'], [`versions:${MC_VERSION}`]]
        : [['all_project_types:plugin', 'all_project_types:datapack'], [`versions:${MC_VERSION}`]]
  const params = new URLSearchParams({
    query: q,
    limit: '24',
    index: q ? 'relevance' : 'downloads',
    facets: JSON.stringify(facets)
  })

  try {
    const r = await fetch(`${MODRINTH}?${params}`, {
      headers: { 'user-agent': 'molly-panel/0.1 (local admin panel)' }
    })
    if (!r.ok) throw new Error(`modrinth responded ${r.status}`)
    const json = await r.json()
    const hits = json.hits.map((h) => {
      const all = h.all_project_types ?? []
      const kind =
        type !== 'any' ? type : all.includes('plugin') ? 'plugin' : all.includes('datapack') ? 'datapack' : h.project_type
      return {
        slug: h.slug ?? h.project_id,
        title: h.title,
        description: h.description,
        type: kind,
        downloads: h.downloads,
        icon: h.icon_url
      }
    })
    send(res, 200, hits)
  } catch (err) {
    send(res, 502, { error: String(err) })
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  if (url.pathname.startsWith('/api/servers/') && url.pathname.endsWith('/icon')) {
    const name = decodeURIComponent(url.pathname.slice('/api/servers/'.length, -'/icon'.length))
    if (!/^[a-zA-Z0-9_-]{1,32}$/.test(name)) {
      send(res, 400, { error: 'bad name' })
      return
    }
    const dir = findInstanceDir(name)
    if (dir && existsSync(join(dir, 'server-icon.png'))) {
      res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-cache' })
      res.end(readFileSync(join(dir, 'server-icon.png')))
    } else {
      send(res, 404, { error: 'no icon' })
    }
    return
  }
  if (url.pathname === '/api/fs/pick') {
    try {
      send(res, 200, { path: await pickFolder() })
    } catch (err) {
      send(res, 502, { error: String(err) })
    }
    return
  }
  if (url.pathname === '/api/me') {
    send(res, 200, { name: userInfo().username })
    return
  }
  if (url.pathname === '/api/system') {
    send(res, 200, {
      java: await javaVersion(),
      os: `${platform()} ${release()}`,
      cpus: cpus().length,
      memTotal: totalmem(),
      memFree: freemem()
    })
    return
  }
  if (url.pathname === '/api/servers/status') {
    const list = lightInstances()
    const entries = await Promise.all(
      list.map(async (i) => [i.name, i.port ? await portOpen(i.port) : false])
    )
    send(res, 200, Object.fromEntries(entries))
    return
  }
  if (
    url.pathname.startsWith('/api/servers/') &&
    (url.pathname.endsWith('/start') || url.pathname.endsWith('/stop'))
  ) {
    const suffix = url.pathname.endsWith('/start') ? '/start' : '/stop'
    const name = decodeURIComponent(url.pathname.slice('/api/servers/'.length, -suffix.length))
    if (!/^[a-zA-Z0-9_-]{1,32}$/.test(name)) {
      send(res, 400, { error: 'bad name' })
      return
    }
    if (req.method !== 'POST') {
      send(res, 405, { error: 'POST only' })
      return
    }
    if (suffix === '/start') startInstance(name, res)
    else stopInstance(name, res)
    return
  }
  if (url.pathname === '/api/servers' && req.method === 'POST') {
    await createInstance(req, res)
    return
  }
  if (url.pathname === '/api/servers') {
    try {
      send(res, 200, await listInstances())
    } catch (err) {
      send(res, 502, { error: String(err) })
    }
    return
  }
  if (url.pathname === '/api/versions/paper') {
    try {
      send(res, 200, await paperVersions())
    } catch (err) {
      send(res, 502, { error: String(err) })
    }
    return
  }
  if (url.pathname === '/api/versions/purpur') {
    try {
      send(res, 200, await purpurVersions())
    } catch (err) {
      send(res, 502, { error: String(err) })
    }
    return
  }
  if (url.pathname === '/api/versions/vanilla') {
    try {
      send(res, 200, await vanillaVersions())
    } catch (err) {
      send(res, 502, { error: String(err) })
    }
    return
  }
  if (url.pathname.startsWith('/api/skin/')) {
    await handleSkin(decodeURIComponent(url.pathname.slice('/api/skin/'.length)), res)
    return
  }
  if (url.pathname.startsWith('/api/shop/project/')) {
    await handleProject(decodeURIComponent(url.pathname.slice('/api/shop/project/'.length)), res)
    return
  }
  if (url.pathname === '/api/shop') {
    await handleShop(url, res)
    return
  }
  const body = data[url.pathname]
  if (!body) {
    send(res, 404, { error: 'not found' })
    return
  }
  send(res, 200, body)
}).listen(PORT, '127.0.0.1', () => {
  console.log(`panel api → http://127.0.0.1:${PORT}`)
})
