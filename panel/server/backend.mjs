import { execFile, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, closeSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { connect } from 'node:net'
import { cpus, freemem, platform, release, totalmem, userInfo } from 'node:os'
import { extname, isAbsolute, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = 8787
const MC_VERSION = '26.3'
const MODRINTH = 'https://api.modrinth.com/v2/search'
const SERVERS_DIR = fileURLToPath(new URL('../../servers/', import.meta.url))
const REGISTRY_FILE = fileURLToPath(new URL('./instances.json', import.meta.url))
const DIST_DIR = fileURLToPath(new URL('../dist/', import.meta.url))
const STEAMCMD_DIR = fileURLToPath(new URL('../../runtime/steamcmd/', import.meta.url))

const GAMES = {
  minecraft: {
    name: 'Minecraft Java',
    blurb: 'Plugins, datapacks, mods — the classic.',
    kind: 'minecraft',
    defaultPort: 25565
  },
  terraria: {
    name: 'Terraria',
    blurb: '2D sandbox adventure. Server files ~300 MB.',
    kind: 'steam',
    appid: '105600',
    defaultPort: 7777,
    exe: 'TerrariaServer.exe',
    stopCmd: 'exit',
    args: ['-port', '{port}', '-world', 'world.wld', '-autocreate', '2', '-maxplayers', '16']
  },
  valheim: {
    name: 'Valheim',
    blurb: 'Viking survival. Server files ~1.5 GB.',
    kind: 'steam',
    appid: '896660',
    defaultPort: 2456,
    exe: 'valheim_server.exe',
    args: ['-name', '{name}', '-port', '{port}', '-world', 'world', '-password', '{password}', '-public', '0'],
    needsPassword: true
  },
  palworld: {
    name: 'Palworld',
    blurb: 'Creature-collecting survival. Server files ~5 GB.',
    kind: 'steam',
    appid: '2394010',
    defaultPort: 8211,
    exe: 'PalServer.exe',
    args: ['-port={port}', '-players=16', '-publicport={port}']
  },
  cs2: {
    name: 'Counter-Strike 2',
    blurb: 'Tactical FPS. Server files ~35 GB.',
    kind: 'steam',
    appid: '730',
    defaultPort: 27015,
    exe: 'game/bin/win64/cs2.exe',
    supportsPlugins: true,
    stopCmd: 'quit',
    maps: ['de_dust2', 'de_mirage', 'de_inferno', 'de_nuke', 'de_overpass', 'de_ancient', 'de_anubis', 'de_vertigo', 'cs_office', 'cs_italy'],
    modes: { casual: [0, 0], competitive: [0, 1], armsrace: [1, 0], deathmatch: [1, 2] },
    args: ['-dedicated', '-port', '{port}', '+map', '{map}', '+game_type', '{type}', '+game_mode', '{mode}']
  }
}

function gameList() {
  return Object.entries(GAMES).map(([id, g]) => ({
    id,
    name: g.name,
    blurb: g.blurb,
    kind: g.kind,
    defaultPort: g.defaultPort,
    needsPassword: !!g.needsPassword,
    supportsPlugins: !!g.supportsPlugins,
    maps: g.maps ?? [],
    modes: g.modes ? Object.keys(g.modes) : []
  }))
}

async function ensureSteamCmd(onProgress = () => {}, signal = null) {
  const exe = join(STEAMCMD_DIR, 'steamcmd.exe')
  if (existsSync(exe)) return exe
  mkdirSync(STEAMCMD_DIR, { recursive: true })
  const zip = join(STEAMCMD_DIR, 'steamcmd.zip')
  const buf = await downloadWithProgress('https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip', onProgress, signal)
  writeFileSync(zip, buf)
  await expandZip(zip, STEAMCMD_DIR)
  try {
    unlinkSync(zip)
  } catch {}
  if (!existsSync(exe)) throw new Error('steamcmd extraction failed')
  return exe
}

function steamInstallOnce(exe, dir, appid, onProgress, signal = null) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(
      exe,
      ['+force_install_dir', dir, '+login', 'anonymous', '+app_update', String(appid), 'validate', '+quit'],
      { cwd: STEAMCMD_DIR, windowsHide: true }
    )
    installProcs.set(dir, child)
    const onAbort = () => child.kill()
    if (signal) {
      if (signal.aborted) {
        child.kill()
      } else {
        signal.addEventListener('abort', onAbort, { once: true })
      }
    }
    let out = ''
    let stall
    let lastBytes = 0
    let lastTs = 0
    let lastSpeed = 0
    const bump = () => {
      clearTimeout(stall)
      stall = setTimeout(() => {
        out += '\n[no output for 5 minutes — killing steamcmd]'
        child.kill()
      }, 5 * 60 * 1000)
    }
    bump()
    const onData = (d) => {
      out += d
      if (out.length > 8000) out = out.slice(-8000)
      const m = [...out.matchAll(/progress: ([\d.]+)(?:\s+\((\d+) \/ \d+\))?/g)].pop()
      if (m) {
        if (m[2]) {
          const now = Date.now()
          const bytes = Number(m[2])
          if (lastBytes && now > lastTs) {
            lastSpeed = Math.round((bytes - lastBytes) / ((now - lastTs) / 1000))
          }
          lastBytes = bytes
          lastTs = now
        }
        onProgress(Math.min(99, Number(m[1])), lastSpeed)
      }
      bump()
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.on('error', (err) => {
      clearTimeout(stall)
      if (signal) signal.removeEventListener('abort', onAbort)
      if (installProcs.get(dir) === child) installProcs.delete(dir)
      reject(err)
    })
    child.on('exit', () => {
      clearTimeout(stall)
      if (signal) signal.removeEventListener('abort', onAbort)
      if (installProcs.get(dir) === child) installProcs.delete(dir)
      resolvePromise(out)
    })
  })
}

async function runSteamInstall(exe, dir, appid, exeName, onProgress, signal = null) {
  const manifest = join(dir, 'steamapps', `appmanifest_${appid}.acf`)
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (signal?.aborted) throw new Error('cancelled')
    const out = await steamInstallOnce(exe, dir, appid, onProgress, signal)
    if (signal?.aborted) throw new Error('cancelled')
    let size = 0
    try {
      const m = readFileSync(manifest, 'utf8').match(/"SizeOnDisk"\s+"(\d+)"/)
      size = m ? Number(m[1]) : 0
    } catch {}
    if (size > 0 && !/Timed out waiting for update to start/.test(out) && existsSync(join(dir, exeName))) return
    await sleep(2000)
  }
  throw new Error('steam install failed after 3 attempts — try again')
}

function expandZip(zip, dest) {
  return new Promise((resolvePromise, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-Command', `Expand-Archive -Path '${zip}' -DestinationPath '${dest}' -Force`],
      { timeout: 300000, windowsHide: true },
      (err) => (err ? reject(err) : resolvePromise())
    )
  })
}

const CS_PLUGIN_SOURCES = [
  { name: 'Metamod:Source', repo: 'alliedmodders/metamod-source', asset: /windows.*\.zip$/i },
  { name: 'CounterStrikeSharp', repo: 'roflmuffin/CounterStrikeSharp', asset: /with-runtime-windows.*\.zip$/i }
]

async function githubLatestAsset(repo, assetRe) {
  const r = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers: HEADERS })
  if (!r.ok) throw new Error(`github responded ${r.status} for ${repo}`)
  const j = await r.json()
  const a = (j.assets ?? []).find((x) => assetRe.test(x.name))
  if (!a) throw new Error(`no windows build in the latest ${repo} release`)
  return a.browser_download_url
}

function patchGameinfo(file) {
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    throw new Error('gameinfo.gi not found')
  }
  if (text.includes('csgo/addons/metamod')) return
  const lines = text.split(/\r?\n/)
  const i = lines.findIndex((l) => l.includes('Game_Language'))
  if (i === -1) throw new Error('could not find Game_Language in gameinfo.gi')
  lines.splice(i + 1, 0, '\t\t\tGame\tcsgo/addons/metamod')
  writeFileSync(file, lines.join('\r\n'))
}

async function installCsPlugins(dir, onProgress = () => {}, signal = null) {
  const csgo = join(dir, 'game', 'csgo')
  if (!existsSync(csgo)) throw new Error('game/csgo folder not found — is Counter-Strike 2 installed?')
  for (const p of CS_PLUGIN_SOURCES) {
    if (signal?.aborted) throw new Error('cancelled')
    onProgress(0, `Resolving ${p.name}…`)
    const url = await githubLatestAsset(p.repo, p.asset)
    const zip = join(dir, `.plugin-${p.repo.split('/')[1]}.zip`)
    const buf = await downloadWithProgress(url, (pct, spd) =>
      onProgress(pct, `Downloading ${p.name} — ${pct}%`, spd),
      signal
    )
    writeFileSync(zip, buf)
    onProgress(0, `Extracting ${p.name}…`)
    await expandZip(zip, csgo)
    try {
      unlinkSync(zip)
    } catch {}
  }
  onProgress(0, 'Patching gameinfo.gi…')
  patchGameinfo(join(csgo, 'gameinfo.gi'))
  onProgress(100, 'Plugins installed')
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8'
}

function serveStatic(pathname, res) {
  if (!existsSync(DIST_DIR)) {
    res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('panel/dist not found — run "npm run build" in the panel folder first.')
    return
  }
  const root = resolve(DIST_DIR)
  const rel = safeDecode(pathname).replace(/^\/+/, '')
  let file = resolve(root, rel)
  if (file !== root && !file.startsWith(root + sep)) {
    send(res, 403, { error: 'forbidden' })
    return
  }
  if (!existsSync(file) || !statSync(file).isFile()) {
    file = join(root, 'index.html')
  }
  const headers = { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' }
  headers['cache-control'] = file.includes(`${sep}assets${sep}`)
    ? 'public, max-age=31536000, immutable'
    : 'no-cache'
  res.writeHead(200, headers)
  res.end(readFileSync(file))
}

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

const HEADERS = { 'user-agent': 'molly-panel/0.1 (local admin panel)' }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function safeDecode(s) {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

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
      if (data.length > 5e6) req.destroy()
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(data))
      } catch {
        resolve(null)
      }
    })
    req.on('error', () => resolve(null))
    req.on('close', () => resolve(null))
  })
}

function readConfig() {
  try {
    const j = JSON.parse(readFileSync(REGISTRY_FILE, 'utf8'))
    if (Array.isArray(j)) return { defaultDir: null, roots: j.filter((x) => typeof x === 'string') }
    return {
      defaultDir: typeof j.defaultDir === 'string' && j.defaultDir ? j.defaultDir : null,
      roots: Array.isArray(j.roots) ? j.roots.filter((x) => typeof x === 'string') : []
    }
  } catch {
    return { defaultDir: null, roots: [] }
  }
}

function writeConfig(cfg) {
  writeFileSync(REGISTRY_FILE, JSON.stringify(cfg, null, 2))
}

function defaultDir() {
  return readConfig().defaultDir || SERVERS_DIR
}

function instanceRoots() {
  const cfg = readConfig()
  const def = cfg.defaultDir || SERVERS_DIR
  const roots = [def]
  for (const r of cfg.roots) {
    if (r !== def && existsSync(r)) roots.push(r)
  }
  return roots
}

function registerLocation(location) {
  const cfg = readConfig()
  const def = cfg.defaultDir || SERVERS_DIR
  if (location === def) return
  if (!cfg.roots.includes(location)) {
    cfg.roots.push(location)
    writeConfig(cfg)
  }
}

function safeRelPath(dir, rel) {
  const target = resolve(join(dir, rel))
  if (target !== dir && !target.startsWith(dir + sep)) return null
  return target
}

function findInstanceDir(name) {
  for (const root of instanceRoots()) {
    const dir = join(root, name)
    if (existsSync(dir)) return dir
  }
  return null
}

const running = new Map()
const installs = new Map()
const logs = new Map()
const startedAt = new Map()
const installProcs = new Map()
const installAbort = new Map()

function parseLogLine(raw) {
  const text = String(raw).replace(/\x1b\[[0-9;]*m/g, '').replace(/\r/g, '')
  if (!text.trim()) return null
  let level = 'info'
  if (/\b(WARN|WARNING|ERROR|SEVERE|FATAL)\b/.test(text)) level = 'warn'
  if (/joined the game/.test(text)) level = 'join'
  if (/left the game/.test(text)) level = 'leave'
  const m = text.match(/\[?(\d{1,2}:\d{2}:\d{2})\]?/)
  const body = text.replace(/^\[\d{1,2}:\d{2}:\d{2}\]\s*/, '')
  return { time: m ? m[1] : '', level, text: body.slice(0, 500) }
}

function pushLog(name, raw) {
  const line = parseLogLine(raw)
  if (!line) return
  const st = logs.get(name) ?? { lines: [], partial: '' }
  st.lines.push(line)
  if (st.lines.length > 400) st.lines.splice(0, st.lines.length - 400)
  logs.set(name, st)
}

function feedLog(name, chunk) {
  const st = logs.get(name) ?? { lines: [], partial: '' }
  st.partial += String(chunk)
  const parts = st.partial.split(/\r?\n/)
  st.partial = parts.pop() ?? ''
  logs.set(name, st)
  for (const p of parts) pushLog(name, p)
}

function tailFile(file, bytes = 262144) {
  try {
    const size = statSync(file).size
    const start = Math.max(0, size - bytes)
    const fd = openSync(file, 'r')
    const buf = Buffer.alloc(size - start)
    readSync(fd, buf, 0, buf.length, start)
    closeSync(fd)
    return buf.toString('utf8').split(/\r?\n/).slice(-300)
  } catch {
    return null
  }
}

function serverLogs(name) {
  const captured = logs.get(name)?.lines ?? []
  if (captured.length) return captured
  const dir = findInstanceDir(name)
  if (!dir) return []
  const raw = tailFile(join(dir, 'logs', 'latest.log'))
  if (!raw) return []
  return raw.map((l) => parseLogLine(l)).filter(Boolean)
}

function rconExec(port, password, command, timeoutMs = 6000) {
  return new Promise((resolvePromise, reject) => {
    const sock = connect({ host: '127.0.0.1', port })
    let buf = Buffer.alloc(0)
    let authed = false
    let out = ''
    let settled = false
    let settle = null
    const done = (err, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      sock.destroy()
      if (err) reject(err)
      else resolvePromise(value)
    }
    const timer = setTimeout(() => done(new Error('rcon timeout')), timeoutMs)
    const send = (id, type, body) => {
      const b = Buffer.from(body, 'utf8')
      const pkt = Buffer.alloc(14 + b.length)
      pkt.writeInt32LE(pkt.length - 4, 0)
      pkt.writeInt32LE(id, 4)
      pkt.writeInt32LE(type, 8)
      b.copy(pkt, 12)
      sock.write(pkt)
    }
    sock.on('error', (err) => done(err))
    sock.on('connect', () => send(1, 3, password))
    sock.on('data', (d) => {
      buf = Buffer.concat([buf, d])
      for (;;) {
        if (buf.length < 4) return
        const len = buf.readInt32LE(0)
        if (len < 10 || buf.length < 4 + len) return
        const id = buf.readInt32LE(4)
        const type = buf.readInt32LE(8)
        const body = buf.subarray(12, 4 + len - 2).toString('utf8')
        buf = buf.subarray(4 + len)
        if (!authed) {
          if (id === -1) return done(new Error('rcon auth failed'))
          authed = true
          send(2, 2, command)
          continue
        }
        if (id === 2 && type === 0) {
          if (!body && !out) return done(null, '')
          out += body
          clearTimeout(settle)
          settle = setTimeout(() => done(null, out), 150)
        }
      }
    })
  })
}

function ensureRcon(dir) {
  const markerPath = join(dir, '.panel.json')
  let marker = {}
  try {
    marker = JSON.parse(readFileSync(markerPath, 'utf8'))
  } catch {}
  if (marker.rcon?.port && marker.rcon?.password) return marker.rcon
  const props = (() => {
    try {
      return parseProperties(join(dir, 'server.properties'))
    } catch {
      return {}
    }
  })()
  const port = Number(props['server-port'] ?? marker.port ?? 25565)
  const rconPort = port + 100 <= 65535 ? port + 100 : port - 100
  const password = randomBytes(9).toString('hex')
  const file = join(dir, 'server.properties')
  let text = existsSync(file) ? readFileSync(file, 'utf8') : ''
  const setProp = (t, k, v) => {
    const re = new RegExp(`^${k}=.*$`, 'm')
    if (re.test(t)) return t.replace(re, `${k}=${v}`)
    const sep = !t || t.endsWith('\n') ? '' : '\n'
    return `${t}${sep}${k}=${v}\n`
  }
  text = setProp(text, 'enable-rcon', 'true')
  text = setProp(text, 'rcon.port', String(rconPort))
  text = setProp(text, 'rcon.password', password)
  writeFileSync(file, text)
  marker.rcon = { port: rconPort, password }
  writeFileSync(markerPath, JSON.stringify(marker, null, 2))
  return marker.rcon
}

function instanceGame(dir) {
  let marker = {}
  try {
    marker = JSON.parse(readFileSync(join(dir, '.panel.json'), 'utf8'))
  } catch {}
  return { marker, game: marker.game && marker.game !== 'minecraft' ? marker.game : 'minecraft' }
}

async function serverInfo(name) {
  const dir = findInstanceDir(name)
  if (!dir) throw new Error('unknown server')
  const { marker, game } = instanceGame(dir)
  let worlds = 0
  try {
    worlds = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && /^world($|_)/.test(e.name)).length
  } catch {}
  const uptime = startedAt.get(name)
  const out = {
    name,
    game,
    running: running.has(name),
    version: marker.version ?? null,
    worlds,
    uptimeSeconds: uptime ? Math.round((Date.now() - uptime) / 1000) : null,
    rcon: 'off',
    online: null,
    max: null,
    names: [],
    tps: null
  }
  if (game !== 'minecraft') return out
  try {
    const rcon = ensureRcon(dir)
    const listOut = await rconExec(rcon.port, rcon.password, 'list')
    const m = listOut.match(/There are (\d+) of a max of (\d+) players online:?\s*(.*)/i)
    if (m) {
      out.online = Number(m[1])
      out.max = Number(m[2])
      out.names = m[3]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    }
    const tpsOut = await rconExec(rcon.port, rcon.password, 'tps')
    const tm = tpsOut.replace(/§./g, '').match(/([\d.]+),\s*([\d.]+),\s*([\d.]+)/)
    if (tm) out.tps = [Number(tm[1]), Number(tm[2]), Number(tm[3])]
    out.rcon = 'on'
  } catch {}
  return out
}

function lightInstances() {
  const out = []
  for (const root of instanceRoots()) {
    for (const e of readdirSync(root, { withFileTypes: true })) {
      if (!e.isDirectory()) continue
      if (installs.get(e.name)?.status === 'running') continue
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
  let marker = {}
  try {
    marker = JSON.parse(readFileSync(join(dir, '.panel.json'), 'utf8'))
  } catch {}
  const game = marker.game && marker.game !== 'minecraft' ? marker.game : 'minecraft'

  let cmd
  let args
  if (game === 'minecraft') {
    const jars = readdirSync(dir).filter((f) => f.endsWith('.jar'))
    const jar = jars.includes('paper.jar') ? 'paper.jar' : jars.includes('purpur.jar') ? 'purpur.jar' : jars[0]
    if (!jar) {
      send(res, 400, { error: 'no server jar found' })
      return
    }
    const mem = Number(marker.memoryMb) || 2048
    cmd = resolveJava()
    args = [`-Xms${mem}M`, `-Xmx${mem}M`, '-jar', jar, 'nogui']
  } else {
    const cfg = GAMES[game]
    if (!cfg) {
      send(res, 400, { error: 'unknown game for this server' })
      return
    }
    const exePath = join(dir, cfg.exe)
    if (!existsSync(exePath)) {
      send(res, 400, { error: 'server files missing — reinstall this server' })
      return
    }
    const cs = cfg.modes?.[marker.gameMode] ?? [0, 0]
    cmd = exePath
    args = cfg.args.map((a) =>
      a
        .replaceAll('{port}', String(marker.port ?? ''))
        .replaceAll('{name}', String(marker.name ?? name))
        .replaceAll('{password}', String(marker.password ?? ''))
        .replaceAll('{map}', String(marker.map ?? cfg.maps?.[0] ?? 'de_dust2'))
        .replaceAll('{type}', String(cs[0]))
        .replaceAll('{mode}', String(cs[1]))
    )
  }

  try {
    const child = spawn(cmd, args, { cwd: dir, windowsHide: true })
    running.set(name, child)
    startedAt.set(name, Date.now())
    pushLog(name, `Starting ${cmd}`)
    child.stdout.on('data', (d) => feedLog(name, d))
    child.stderr.on('data', (d) => feedLog(name, d))
    child.on('exit', (code) => {
      running.delete(name)
      startedAt.delete(name)
      pushLog(name, `Process exited (code ${code})`)
    })
    child.on('error', (err) => {
      running.delete(name)
      startedAt.delete(name)
      pushLog(name, `Failed to start: ${err.message}`)
    })
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
  const dir = findInstanceDir(name)
  const game = dir ? instanceGame(dir).game : 'minecraft'
  const stopCmd = game === 'minecraft' ? 'stop' : GAMES[game]?.stopCmd
  if (stopCmd) {
    try {
      child.stdin.write(stopCmd + '\n')
    } catch {}
    pushLog(name, `Panel: sending "${stopCmd}"`)
    setTimeout(() => {
      if (running.get(name) === child) child.kill()
    }, 20000)
  } else {
    pushLog(name, 'Panel: this game has no console stop — killing process')
    child.kill()
  }
  send(res, 200, { ok: true })
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
    const cmd = [
      'Add-Type -AssemblyName System.Windows.Forms | Out-Null;',
      'Add-Type -AssemblyName System.Drawing | Out-Null;',
      'Add-Type -TypeDefinition @"',
      'using System;',
      'using System.Runtime.InteropServices;',
      '[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]',
      'public struct COMDLG_FILTERSPEC { public IntPtr pszName; public IntPtr pszSpec; }',
      '[ComImport, Guid("DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7")]',
      'public class FileOpenDialog { }',
      '[ComImport, Guid("42f85136-db7e-439c-85f1-e4075d135fc8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]',
      'public interface IFileOpenDialog {',
      '  [PreserveSig] int Show(IntPtr parent);',
      '  void SetFileTypes(uint cFileTypes, [MarshalAs(UnmanagedType.LPArray, SizeParamIndex = 0)] COMDLG_FILTERSPEC[] rgFilterSpec);',
      '  void SetFileTypeIndex(uint iFileType);',
      '  void GetFileTypeIndex(out uint piFileType);',
      '  void Advise(IntPtr pfde, out uint pdwCookie);',
      '  void Unadvise(uint dwCookie);',
      '  void SetOptions(uint fos);',
      '  void GetOptions(out uint pfos);',
      '  void SetDefaultFolder(IntPtr psi);',
      '  void SetFolder(IntPtr psi);',
      '  void GetFolder(out IntPtr ppsi);',
      '  void GetCurrentSelection(out IntPtr ppsi);',
      '  void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string pszName);',
      '  void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string pszName);',
      '  void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string pszTitle);',
      '  void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string pszText);',
      '  void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string pszLabel);',
      '  void GetResult(out IntPtr ppsi);',
      '  void AddPlace(IntPtr psi, uint fdap);',
      '  void SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)] string pszDefaultExtension);',
      '  void Close(int hr);',
      '  void SetClientGuid(ref Guid guid);',
      '  void ClearClientData();',
      '  void SetFilter(IntPtr pFilter);',
      '  void GetResults(out IntPtr ppenum);',
      '  void GetSelectedItems(out IntPtr ppsai);',
      '}',
      '[ComImport, Guid("43826d1e-e718-42ee-bc55-a1e261c37bfe"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]',
      'public interface IShellItem {',
      '  void BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);',
      '  void GetParent(out IntPtr ppsi);',
      '  void GetDisplayName(uint sigdnName, out IntPtr ppszName);',
      '  void GetAttributes(uint sfgaoMask, out uint psfgaoAttribs);',
      '  void Compare(IntPtr psi, uint hint, out int piOrder);',
      '}',
      'public class Win32Shell {',
      '  public static string PickFolder(IntPtr owner, string title) {',
      '    var dlg = (IFileOpenDialog)new FileOpenDialog();',
      '    dlg.SetOptions(0x00000060);',
      '    dlg.SetTitle(title);',
      '    if (dlg.Show(owner) != 0) return null;',
      '    IntPtr psi;',
      '    dlg.GetResult(out psi);',
      '    var item = (IShellItem)Marshal.GetObjectForIUnknown(psi);',
      '    IntPtr psz;',
      '    item.GetDisplayName(0x80058000, out psz);',
      '    string path = Marshal.PtrToStringUni(psz);',
      '    Marshal.FreeCoTaskMem(psz);',
      '    Marshal.ReleaseComObject(item);',
      '    Marshal.Release(psi);',
      '    return path;',
      '  }',
      '}',
      '"@;',
      '$owner = New-Object System.Windows.Forms.Form;',
      '$owner.TopMost = $true;',
      '$owner.ShowInTaskbar = $false;',
      '$owner.Size = New-Object System.Drawing.Size(1,1);',
      "$owner.StartPosition = 'CenterScreen';",
      '$owner.Show();',
      '$p = [Win32Shell]::PickFolder($owner.Handle, \'Choose where this server should be stored\');',
      '$owner.Close();',
      'if ($p) { Write-Output $p }'
    ].join('\n')
    execFile(
      'powershell.exe',
      ['-NoProfile', '-STA', '-Command', cmd],
      { timeout: 300000, windowsHide: true },
      (err, stdout) => (err ? reject(err) : resolvePromise(String(stdout).trim() || null))
    )
  })
}

const sizeCache = new Map()
function dirSizeCached(dir) {
  const c = sizeCache.get(dir)
  if (c && Date.now() - c.ts < 30000) return c.size
  const size = dirSize(dir)
  sizeCache.set(dir, { size, ts: Date.now() })
  return size
}

async function listInstances() {
  const out = []
  for (const root of instanceRoots()) {
    for (const e of readdirSync(root, { withFileTypes: true })) {
      if (!e.isDirectory()) continue
      const inst = installs.get(e.name)
      if (inst?.status === 'running') {
        out.push({
          name: e.name,
          game: inst.game ?? 'minecraft',
          platform: inst.game ?? 'minecraft',
          version: null,
          port: 0,
          path: join(root, e.name),
          size: 0,
          created: inst.started ? new Date(inst.started).toISOString() : null,
          status: 'installing',
          installing: true,
          installPercent: inst.percent,
          installMessage: inst.message,
          etaSeconds: inst.etaSeconds ?? null,
          speedBps: inst.speedBps ?? null
        })
        continue
      }
      if (inst?.status === 'error') {
        out.push({
          name: e.name,
          game: inst.game ?? 'minecraft',
          platform: inst.game ?? 'minecraft',
          version: null,
          port: inst.port ?? 0,
          path: join(root, e.name),
          size: 0,
          created: inst.started ? new Date(inst.started).toISOString() : null,
          status: 'failed',
          failed: true,
          errorMessage: inst.message
        })
        continue
      }
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
        game: marker.game ?? 'minecraft',
        platform:
          marker.game && marker.game !== 'minecraft'
            ? marker.game
            : marker.platform ??
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
        size: dirSizeCached(dir),
        created: statSync(dir).birthtime.toISOString(),
        status: port
          ? (await portOpen(port))
            ? 'online'
            : running.has(e.name)
              ? 'starting'
              : 'offline'
          : running.has(e.name)
            ? 'starting'
            : 'offline'
      })
    }
  }
  for (const [n, inst] of installs) {
    if (inst.status !== 'error') continue
    if (out.some((i) => i.name === n)) continue
    out.push({
      name: n,
      game: inst.game ?? 'minecraft',
      platform: inst.game ?? 'minecraft',
      version: null,
      port: inst.port ?? 0,
      path: '',
      size: 0,
      created: inst.started ? new Date(inst.started).toISOString() : null,
      status: 'failed',
      failed: true,
      errorMessage: inst.message
    })
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

async function downloadWithProgress(url, onProgress = () => {}, signal = null) {
  let lastErr
  for (let attempt = 1; attempt <= 3; attempt++) {
    const ctrl = new AbortController()
    const onAbort = () => ctrl.abort(new Error('cancelled'))
    if (signal) {
      if (signal.aborted) throw new Error('cancelled')
      signal.addEventListener('abort', onAbort, { once: true })
    }
    try {
      const r = await fetch(url, { headers: HEADERS, signal: ctrl.signal })
      if (!r.ok) throw new Error(`download failed (${r.status})`)
      if (!r.body) throw new Error('download returned no body')
      const total = Number(r.headers.get('content-length') ?? 0)
      const chunks = []
      let got = 0
      let lastBytes = 0
      let lastTs = Date.now()
      let speedBps = 0
      let stall = setTimeout(() => ctrl.abort(new Error('download stalled — connection too slow?')), 30000)
      const bump = () => {
        clearTimeout(stall)
        stall = setTimeout(() => ctrl.abort(new Error('download stalled — connection too slow?')), 30000)
      }
      for await (const chunk of r.body) {
        chunks.push(chunk)
        got += chunk.length
        bump()
        const now = Date.now()
        const dt = (now - lastTs) / 1000
        if (dt >= 0.5) {
          speedBps = Math.round((got - lastBytes) / dt)
          lastBytes = got
          lastTs = now
        }
        if (total) onProgress(Math.min(99, Math.round((got / total) * 100)), speedBps)
      }
      clearTimeout(stall)
      return Buffer.concat(chunks)
    } catch (err) {
      lastErr = err
      if (signal?.aborted) throw new Error('cancelled')
      if (attempt < 3) await sleep(2000)
    } finally {
      if (signal) signal.removeEventListener('abort', onAbort)
    }
  }
  throw lastErr
}

async function runInstall(job) {
  const { name, dir } = job
  const ctrl = new AbortController()
  installAbort.set(dir, ctrl)
  const report = (percent, message, speedBps = null) => {
    const prev = installs.get(name) ?? {}
    let etaSeconds = null
    if (percent > 1 && percent < 99 && prev.started) {
      etaSeconds = Math.round(((Date.now() - prev.started) / 1000) * ((100 - percent) / percent))
    }
    installs.set(name, { ...prev, name, status: 'running', percent, message, etaSeconds, speedBps })
  }
  try {
    if (job.game !== 'minecraft') {
      const cfg = GAMES[job.game]
      mkdirSync(dir, { recursive: true })
      registerLocation(job.location)
      report(0, 'Downloading SteamCMD (first time only)…')
      const steam = await ensureSteamCmd((pct, spd) => report(pct, `Downloading SteamCMD — ${pct}%`, spd), ctrl.signal)
      report(0, `Installing ${cfg.name} — this can take a while…`)
      await runSteamInstall(steam, dir, cfg.appid, cfg.exe, (pct, spd) =>
        report(pct, `Installing ${cfg.name} — ${pct}%`, spd),
        ctrl.signal
      )
      writeFileSync(
        join(dir, '.panel.json'),
        JSON.stringify(
          {
            game: job.game,
            appid: cfg.appid,
            port: job.port,
            name: job.name,
            password: job.password,
            map: job.map,
            gameMode: job.gameMode,
            plugins: job.plugins,
            created: new Date().toISOString()
          },
          null,
          2
        )
      )
      if (job.plugins && cfg.supportsPlugins) {
        try {
          await installCsPlugins(dir, report, ctrl.signal)
        } catch (err) {
          registerLocation(job.location)
          installs.set(name, {
            ...installs.get(name),
            name,
            status: 'error',
            percent: 0,
            etaSeconds: null,
            message: `Server installed, but plugin setup failed: ${err?.message ?? err}`
          })
          return
        }
      }
    } else {
      report(0, 'Finding download…')
      const url =
        job.platform === 'paper'
          ? await paperDownloadUrl(job.version)
          : job.platform === 'purpur'
            ? purpurDownloadUrl(job.version)
            : await vanillaDownloadUrl(job.version)
      const jarName = job.platform === 'purpur' ? 'purpur.jar' : job.platform === 'paper' ? 'paper.jar' : 'server.jar'
      mkdirSync(dir, { recursive: true })
      registerLocation(job.location)
      const buf = await downloadWithProgress(url, (pct, spd) =>
        report(pct, `Downloading ${job.platform} ${job.version} — ${pct}%`, spd),
        ctrl.signal
      )
      writeFileSync(join(dir, jarName), buf)
      writeFileSync(join(dir, 'eula.txt'), `eula=${job.eula}\n`)
      writeFileSync(
        join(dir, 'server.properties'),
        [
          `motd=${job.motd}`,
          `server-port=${job.port}`,
          `max-players=${job.maxPlayers}`,
          `difficulty=${job.difficulty}`,
          `gamemode=${job.gamemode}`,
          `online-mode=${job.onlineMode}`,
          `pvp=${job.pvp}`,
          `white-list=${job.whitelist}`,
          `view-distance=${job.viewDistance}`,
          `simulation-distance=${job.viewDistance}`,
          ''
        ].join('\n')
      )
      const mem = Number(job.memoryMb) || 2048
      const java = resolveJava()
      writeFileSync(
        join(dir, 'start.cmd'),
        `@echo off\r\ntitle ${job.name}\r\ncd /d "%~dp0"\r\n"${java}" -Xms${mem}M -Xmx${mem}M -jar ${jarName} nogui\r\npause\r\n`
      )
      writeFileSync(
        join(dir, '.panel.json'),
        JSON.stringify(
          { game: 'minecraft', platform: job.platform, version: job.version, port: job.port, memoryMb: mem, created: new Date().toISOString() },
          null,
          2
        )
      )
      ensureRcon(dir)
    }
    registerLocation(job.location)
    installs.set(name, { ...installs.get(name), name, status: 'done', percent: 100, etaSeconds: null, message: 'Installed' })
  } catch (err) {
    if (!installs.has(name)) return
    installs.set(name, { ...installs.get(name), name, status: 'error', percent: 0, etaSeconds: null, speedBps: null, message: String(err?.message ?? err) })
  } finally {
    installAbort.delete(dir)
  }
}

async function createInstance(req, res) {
  const body = await readJson(req)
  const name = String(body?.name ?? '')
  const game = GAMES[body?.game] ? body.game : 'minecraft'
  const password = String(body?.password ?? '').slice(0, 32)
  const platform = ['paper', 'vanilla', 'purpur'].includes(body?.platform) ? body.platform : 'paper'
  const version = String(body?.version ?? '')
  const port = Number(body?.port ?? 0)
  const eula = !!body?.eula
  const motd = String(body?.motd ?? '').replace(/[\\\r\n]/g, ' ').slice(0, 60) || name
  const maxPlayers = Number(body?.maxPlayers ?? 20)
  const difficulty = ['peaceful', 'easy', 'normal', 'hard'].includes(body?.difficulty) ? body.difficulty : 'easy'
  const gamemode = ['survival', 'creative', 'adventure'].includes(body?.gamemode) ? body.gamemode : 'survival'
  const onlineMode = body?.onlineMode !== false
  const rawLocation = String(body?.location ?? '').trim()
  const memoryMb = Number(body?.memoryMb ?? 2048)
  const viewDistance = Number(body?.viewDistance ?? 10)
  const pvp = body?.pvp !== false
  const whitelist = body?.whitelist === true
  const map = String(body?.map ?? '').trim() || 'de_dust2'
  const gameMode = GAMES.cs2.modes[body?.gameMode] ? body.gameMode : 'casual'
  const plugins = body?.plugins === true

  if (!/^[a-zA-Z0-9_-]{1,32}$/.test(name)) {
    send(res, 400, { error: 'name must be 1-32 letters, numbers, dashes or underscores' })
    return
  }
  if (game === 'minecraft' && !/^[\w.-]{1,20}$/.test(version)) {
    send(res, 400, { error: 'invalid version' })
    return
  }
  if (game !== 'minecraft' && GAMES[game].needsPassword && password.length < 5) {
    send(res, 400, { error: 'password must be at least 5 characters' })
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
  if (!Number.isInteger(memoryMb) || memoryMb < 512 || memoryMb > 32768) {
    send(res, 400, { error: 'memory must be between 512 and 32768 MB' })
    return
  }
  if (!Number.isInteger(viewDistance) || viewDistance < 2 || viewDistance > 32) {
    send(res, 400, { error: 'view distance must be between 2 and 32' })
    return
  }
  if (game === 'cs2' && !/^[a-z0-9_]{1,32}$/i.test(map)) {
    send(res, 400, { error: 'invalid map name' })
    return
  }
  if (rawLocation && !isAbsolute(rawLocation)) {
    send(res, 400, { error: 'storage location must be an absolute path' })
    return
  }
  const location = rawLocation ? resolve(rawLocation) : defaultDir()

  const dir = join(location, name)
  if (existsSync(dir)) {
    send(res, 400, { error: 'a server with that name already exists' })
    return
  }
  if (installs.get(name)?.status === 'running') {
    send(res, 400, { error: 'this server is already being installed' })
    return
  }

  const existing = await listInstances()
  const clash =
    existing.find((i) => i.port === port) ??
    [...installs.values()].find((i) => i.status === 'running' && i.port === port)
  if (clash) {
    send(res, 400, { error: `port ${port} is already used by "${clash.name}"` })
    return
  }

  installs.set(name, { name, game, dir, status: 'running', percent: 0, message: 'Starting…', port, started: Date.now() })
  send(res, 200, { ok: true })
  void runInstall({
    name,
    game,
    platform,
    version,
    port,
    eula,
    motd,
    maxPlayers,
    difficulty,
    gamemode,
    onlineMode,
    password,
    memoryMb,
    viewDistance,
    pvp,
    whitelist,
    map,
    gameMode,
    plugins,
    dir,
    location
  }).catch(() => {})
}

async function installProject(name, req, res) {
  const dir = findInstanceDir(name)
  if (!dir) {
    send(res, 404, { error: 'unknown server' })
    return
  }
  const { marker, game } = instanceGame(dir)
  if (game !== 'minecraft') {
    send(res, 400, { error: 'plugins are only supported for Minecraft servers' })
    return
  }
  if (running.has(name)) {
    send(res, 400, { error: 'stop the server first — plugins load on restart' })
    return
  }
  const body = await readJson(req)
  const slug = String(body?.slug ?? '').trim()
  const type = body?.type === 'datapack' ? 'datapack' : 'plugin'
  if (!/^[\w-]{1,64}$/.test(slug)) {
    send(res, 400, { error: 'bad project slug' })
    return
  }
  try {
    const version = String(marker.version ?? MC_VERSION)
    const loaders = type === 'datapack' ? ['datapack'] : ['paper', 'purpur', 'spigot', 'bukkit']
    const params = new URLSearchParams({
      loaders: JSON.stringify(loaders),
      game_versions: JSON.stringify([version])
    })
    const r = await fetch(`https://api.modrinth.com/v2/project/${encodeURIComponent(slug)}/version?${params}`, {
      headers: HEADERS
    })
    if (!r.ok) throw new Error(`modrinth responded ${r.status}`)
    const versions = await r.json()
    const v = versions[0]
    const file = v?.files?.find((f) => f.primary) ?? v?.files?.[0]
    if (!file?.url) throw new Error(`no ${type} build available for ${version}`)
    const target = type === 'datapack' ? join(dir, 'world', 'datapacks') : join(dir, 'plugins')
    mkdirSync(target, { recursive: true })
    const fname = String(file.filename).replace(/[^\w.-]/g, '_')
    const buf = await downloadWithProgress(file.url)
    writeFileSync(join(target, fname), buf)
    send(res, 200, { ok: true, file: fname, path: target })
  } catch (err) {
    send(res, 502, { error: String(err?.message ?? err) })
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

async function route(req, res) {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const host = String(req.headers.host ?? '')
  if (!/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(host)) {
    send(res, 403, { error: 'forbidden' })
    return
  }
  if (req.method === 'POST') {
    const ct = String(req.headers['content-type'] ?? '')
    const len = Number(req.headers['content-length'] ?? 0)
    if (ct && len > 0 && !ct.startsWith('application/json') && !url.pathname.endsWith('/icon')) {
      send(res, 415, { error: 'unsupported content type' })
      return
    }
  }
  if (url.pathname.startsWith('/api/servers/') && url.pathname.endsWith('/icon')) {
    const name = safeDecode(url.pathname.slice('/api/servers/'.length, -'/icon'.length))
    if (!/^[a-zA-Z0-9_-]{1,32}$/.test(name)) {
      send(res, 400, { error: 'bad name' })
      return
    }
    const dir = findInstanceDir(name)
    if (!dir) {
      send(res, 404, { error: 'unknown server' })
      return
    }
    const iconPath = join(dir, 'server-icon.png')
    const ps = (p) => p.replace(/'/g, "''")
    if (req.method === 'POST') {
      const chunks = []
      let total = 0
      let aborted = false
      req.on('data', (c) => {
        total += c.length
        if (total > 10e6) {
          aborted = true
          req.destroy()
          return
        }
        chunks.push(c)
      })
      req.on('end', () => {
        if (aborted) return
        const buf = Buffer.concat(chunks)
        const isPng = buf.length > 4 && buf[0] === 0x89 && buf[1] === 0x50
        const isJpeg = buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff
        const isWebp = buf.length > 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP'
        if (!(isPng || isJpeg || isWebp)) {
          send(res, 415, { error: 'not an image (use png, jpg or webp)' })
          return
        }
        const tmp = join(dir, '.icon-upload')
        try {
          writeFileSync(tmp, buf)
        } catch (err) {
          send(res, 502, { error: `could not save upload: ${err?.message ?? err}` })
          return
        }
        const cmd = [
          'Add-Type -AssemblyName System.Drawing;',
          `$src=[System.Drawing.Image]::FromFile('${ps(tmp)}');`,
          '$bmp=New-Object System.Drawing.Bitmap(64,64);',
          '$g=[System.Drawing.Graphics]::FromImage($bmp);',
          '$g.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic;',
          '$g.DrawImage($src,0,0,64,64);',
          '$g.Dispose();',
          '$src.Dispose();',
          `$bmp.Save('${ps(iconPath)}',[System.Drawing.Imaging.ImageFormat]::Png);`,
          '$bmp.Dispose();',
          `Remove-Item '${ps(tmp)}'`
        ].join(' ')
        execFile('powershell.exe', ['-NoProfile', '-STA', '-Command', cmd], { timeout: 30000, windowsHide: true }, (err) => {
          try {
            if (existsSync(tmp)) unlinkSync(tmp)
          } catch {}
          if (err) {
            send(res, 502, { error: 'could not process the image' })
            return
          }
          send(res, 200, { ok: true })
        })
      })
      return
    }
    if (req.method === 'DELETE') {
      try {
        if (existsSync(iconPath)) unlinkSync(iconPath)
      } catch (err) {
        send(res, 502, { error: `could not remove icon: ${err?.message ?? err}` })
        return
      }
      send(res, 200, { ok: true })
      return
    }
    if (dir && existsSync(iconPath)) {
      res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-cache' })
      res.end(readFileSync(iconPath))
    } else {
      send(res, 404, { error: 'no icon' })
    }
    return
  }
  if (url.pathname === '/api/fs/pick') {
    try {
      send(res, 200, { path: await pickFolder() })
    } catch (err) {
      send(res, 502, { error: String(err?.message ?? err) })
    }
    return
  }
  if (url.pathname === '/api/games') {
    send(res, 200, gameList())
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
  if (url.pathname === '/api/settings') {
    if (req.method === 'POST') {
      const body = await readJson(req)
      const raw = String(body?.location ?? '').trim()
      const cfg = readConfig()
      if (!raw) {
        cfg.defaultDir = null
        writeConfig(cfg)
        send(res, 200, { serversDir: SERVERS_DIR, custom: false })
        return
      }
      if (!isAbsolute(raw)) {
        send(res, 400, { error: 'storage location must be an absolute path' })
        return
      }
      const abs = resolve(raw)
      try {
        mkdirSync(abs, { recursive: true })
      } catch (err) {
        send(res, 502, { error: `could not create folder: ${err?.message ?? err}` })
        return
      }
      cfg.defaultDir = abs
      writeConfig(cfg)
      send(res, 200, { serversDir: abs, custom: true })
      return
    }
    const cur = defaultDir()
    send(res, 200, { serversDir: cur, custom: cur !== SERVERS_DIR })
    return
  }
  if (url.pathname === '/api/installs') {
    send(res, 200, Object.fromEntries(installs))
    return
  }
  if (url.pathname === '/api/servers/status') {
    const list = lightInstances()
    const entries = await Promise.all(
      list.map(async (i) => {
        const open = i.port ? await portOpen(i.port) : false
        const st = open ? 'online' : running.has(i.name) ? 'starting' : 'offline'
        return [i.name, st]
      })
    )
    send(res, 200, Object.fromEntries(entries))
    return
  }
  if (
    url.pathname.startsWith('/api/servers/') &&
    (url.pathname.endsWith('/start') || url.pathname.endsWith('/stop'))
  ) {
    const suffix = url.pathname.endsWith('/start') ? '/start' : '/stop'
    const name = safeDecode(url.pathname.slice('/api/servers/'.length, -suffix.length))
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
  if (
    url.pathname.startsWith('/api/servers/') &&
    (url.pathname.endsWith('/logs') || url.pathname.endsWith('/command'))
  ) {
    const suffix = url.pathname.endsWith('/logs') ? '/logs' : '/command'
    const name = safeDecode(url.pathname.slice('/api/servers/'.length, -suffix.length))
    if (!/^[a-zA-Z0-9_-]{1,32}$/.test(name)) {
      send(res, 400, { error: 'bad name' })
      return
    }
    if (suffix === '/logs') {
      send(res, 200, { running: running.has(name), lines: serverLogs(name) })
      return
    }
    if (req.method !== 'POST') {
      send(res, 405, { error: 'POST only' })
      return
    }
    const body = await readJson(req)
    const command = String(body?.command ?? '').trim().slice(0, 200)
    if (!command) {
      send(res, 400, { error: 'empty command' })
      return
    }
    const child = running.get(name)
    if (child) {
      try {
        child.stdin.write(command + '\n')
      } catch (err) {
        send(res, 502, { error: String(err) })
        return
      }
      pushLog(name, `> ${command}`)
      send(res, 200, { ok: true })
      return
    }
    const cmdDir = findInstanceDir(name)
    if (cmdDir && instanceGame(cmdDir).game === 'minecraft') {
      try {
        const rcon = ensureRcon(cmdDir)
        const out = await rconExec(rcon.port, rcon.password, command)
        pushLog(name, `> ${command}`)
        if (out.trim()) pushLog(name, `rcon: ${out.trim()}`)
        send(res, 200, { ok: true })
      } catch {
        send(res, 400, { error: 'server is not running and RCON is unreachable' })
      }
      return
    }
    send(res, 400, { error: 'server is not running under the panel' })
    return
  }
  if (url.pathname.startsWith('/api/servers/') && url.pathname.endsWith('/files')) {
    const name = safeDecode(url.pathname.slice('/api/servers/'.length, -'/files'.length))
    if (!/^[a-zA-Z0-9_-]{1,32}$/.test(name)) {
      send(res, 400, { error: 'bad name' })
      return
    }
    const dir = findInstanceDir(name)
    if (!dir) {
      send(res, 404, { error: 'unknown server' })
      return
    }
    const rel = String(url.searchParams.get('path') ?? '').replace(/\\/g, '/')
    const target = safeRelPath(dir, rel)
    if (!target) {
      send(res, 403, { error: 'forbidden' })
      return
    }
    const entries = []
    try {
      for (const e of readdirSync(target, { withFileTypes: true })) {
        if (e.name.startsWith('.')) continue
        const isDir = e.isDirectory()
        let size = 0
        if (!isDir) {
          try {
            size = statSync(join(target, e.name)).size
          } catch {}
        }
        entries.push({ name: e.name, dir: isDir, size })
      }
    } catch (err) {
      send(res, 502, { error: `could not read folder: ${err?.message ?? err}` })
      return
    }
    entries.sort((a, b) => b.dir - a.dir || a.name.localeCompare(b.name, undefined, { numeric: true }))
    send(res, 200, { path: rel, entries })
    return
  }
  if (url.pathname.startsWith('/api/servers/') && url.pathname.endsWith('/file')) {
    const name = safeDecode(url.pathname.slice('/api/servers/'.length, -'/file'.length))
    if (!/^[a-zA-Z0-9_-]{1,32}$/.test(name)) {
      send(res, 400, { error: 'bad name' })
      return
    }
    const dir = findInstanceDir(name)
    if (!dir) {
      send(res, 404, { error: 'unknown server' })
      return
    }
    if (req.method === 'POST') {
      const body = await readJson(req)
      const rel = String(body?.path ?? '').replace(/\\/g, '/')
      const content = String(body?.content ?? '')
      if (content.length > 2_000_000) {
        send(res, 413, { error: 'file too large to save' })
        return
      }
      const target = safeRelPath(dir, rel)
      if (!target) {
        send(res, 403, { error: 'forbidden' })
        return
      }
      try {
        writeFileSync(target, content)
      } catch (err) {
        send(res, 502, { error: `could not save: ${err?.message ?? err}` })
        return
      }
      send(res, 200, { ok: true })
      return
    }
    const rel = String(url.searchParams.get('path') ?? '').replace(/\\/g, '/')
    const target = safeRelPath(dir, rel)
    if (!target) {
      send(res, 403, { error: 'forbidden' })
      return
    }
    if (!existsSync(target) || !statSync(target).isFile()) {
      send(res, 404, { error: 'no such file' })
      return
    }
    if (statSync(target).size > 1_000_000) {
      send(res, 413, { error: 'file too large to edit' })
      return
    }
    const buf = readFileSync(target)
    if (buf.includes(0)) {
      send(res, 415, { error: 'this is a binary file' })
      return
    }
    send(res, 200, { path: rel, content: buf.toString('utf8') })
    return
  }
  if (url.pathname.startsWith('/api/servers/') && url.pathname.endsWith('/worlds')) {
    const name = safeDecode(url.pathname.slice('/api/servers/'.length, -'/worlds'.length))
    if (!/^[a-zA-Z0-9_-]{1,32}$/.test(name)) {
      send(res, 400, { error: 'bad name' })
      return
    }
    const dir = findInstanceDir(name)
    if (!dir) {
      send(res, 404, { error: 'unknown server' })
      return
    }
    const out = []
    try {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (!e.isDirectory() || !/^world($|_)/.test(e.name)) continue
        out.push({ name: e.name, size: dirSize(join(dir, e.name)) })
      }
    } catch {}
    send(res, 200, out)
    return
  }
  if (url.pathname.startsWith('/api/servers/') && url.pathname.endsWith('/info')) {
    const name = safeDecode(url.pathname.slice('/api/servers/'.length, -'/info'.length))
    if (!/^[a-zA-Z0-9_-]{1,32}$/.test(name)) {
      send(res, 400, { error: 'bad name' })
      return
    }
    try {
      send(res, 200, await serverInfo(name))
    } catch (err) {
      send(res, 404, { error: String(err?.message ?? err) })
    }
    return
  }
  if (url.pathname.startsWith('/api/servers/') && url.pathname.endsWith('/install/cancel')) {
    const name = safeDecode(url.pathname.slice('/api/servers/'.length, -'/install/cancel'.length))
    if (!/^[a-zA-Z0-9_-]{1,32}$/.test(name)) {
      send(res, 400, { error: 'bad name' })
      return
    }
    if (req.method !== 'POST') {
      send(res, 405, { error: 'POST only' })
      return
    }
    const inst = installs.get(name)
    if (!inst || inst.status !== 'running') {
      send(res, 400, { error: 'no install in progress for this server' })
      return
    }
    if (inst.dir) {
      const child = installProcs.get(inst.dir)
      if (child) {
        try {
          child.kill()
        } catch {}
        installProcs.delete(inst.dir)
      }
      const ctrl = installAbort.get(inst.dir)
      if (ctrl) ctrl.abort()
      installs.delete(name)
      try {
        rmSync(inst.dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
      } catch {}
    } else {
      installs.delete(name)
    }
    send(res, 200, { ok: true })
    return
  }
  if (url.pathname.startsWith('/api/servers/') && url.pathname.endsWith('/plugins')) {
    const name = safeDecode(url.pathname.slice('/api/servers/'.length, -'/plugins'.length))
    if (!/^[a-zA-Z0-9_-]{1,32}$/.test(name)) {
      send(res, 400, { error: 'bad name' })
      return
    }
    if (req.method !== 'POST') {
      send(res, 405, { error: 'POST only' })
      return
    }
    await installProject(name, req, res)
    return
  }
  if (url.pathname.startsWith('/api/servers/') && url.pathname.endsWith('/delete')) {
    const name = safeDecode(url.pathname.slice('/api/servers/'.length, -'/delete'.length))
    if (!/^[a-zA-Z0-9_-]{1,32}$/.test(name)) {
      send(res, 400, { error: 'bad name' })
      return
    }
    if (req.method !== 'POST') {
      send(res, 405, { error: 'POST only' })
      return
    }
    const dir = findInstanceDir(name)
    if (!dir && !installs.has(name)) {
      send(res, 404, { error: 'unknown server' })
      return
    }
    const child = running.get(name)
    if (child) {
      child.kill()
      running.delete(name)
    }
    startedAt.delete(name)
    if (dir) {
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
      } catch (err) {
        send(res, 502, { error: `could not delete folder: ${err?.message ?? err}` })
        return
      }
    }
    logs.delete(name)
    installs.delete(name)
    send(res, 200, { ok: true })
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
    await handleSkin(safeDecode(url.pathname.slice('/api/skin/'.length)), res)
    return
  }
  if (url.pathname.startsWith('/api/shop/project/')) {
    await handleProject(safeDecode(url.pathname.slice('/api/shop/project/'.length)), res)
    return
  }
  if (url.pathname === '/api/shop') {
    await handleShop(url, res)
    return
  }
  if (url.pathname === '/api/health') {
    send(res, 200, { ok: true, service: 'panel-api' })
    return
  }
  if (url.pathname.startsWith('/api/')) {
    send(res, 404, { error: 'not found' })
    return
  }
  serveStatic(url.pathname, res)
}

createServer((req, res) => {
  route(req, res).catch((err) => {
    try {
      send(res, 500, { error: String(err?.message ?? err) })
    } catch {}
  })
}).listen(PORT, '127.0.0.1', () => {
  console.log(`panel → http://127.0.0.1:${PORT}`)
})
