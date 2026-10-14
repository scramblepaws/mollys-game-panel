<script lang="ts">
  import { onMount } from 'svelte'
  import {
    createServer,
    getServerStatuses,
    getSystem,
    getVersions,
    listServers,
    pickFolder,
    startInstance,
    stopInstance
  } from '../lib/api'
  import type { ServerInstance, SystemInfo } from '../lib/types'
  import { fade } from 'svelte/transition'
  import { popIn, popOut } from '../lib/transitions'
  import UserCard from '../components/UserCard.svelte'

  let {
    onenter,
    shaderOn,
    tiltOn,
    ontoggle
  }: {
    onenter: (s: ServerInstance) => void
    shaderOn: boolean
    tiltOn: boolean
    ontoggle: (k: 'shader' | 'tilt') => void
  } = $props()

  let servers: ServerInstance[] = $state([])
  let loading = $state(true)
  let listError = $state('')
  let actionError = $state('')
  let busyName = $state('')
  let statuses = $state<Record<string, boolean>>({})
  let iconFail = $state<Record<string, boolean>>({})
  let sys = $state<SystemInfo | null>(null)

  let wizard = $state(false)
  let step = $state(1)
  let name = $state('')
  let port = $state(25565)
  let platform = $state<'paper' | 'purpur' | 'vanilla'>('paper')
  let versions: string[] = $state([])
  let version = $state('')
  let versionsLoading = $state(false)
  let versionsError = $state('')
  let motd = $state('')
  let maxPlayers = $state(20)
  let difficulty = $state<'peaceful' | 'easy' | 'normal' | 'hard'>('easy')
  let gamemode = $state<'survival' | 'creative' | 'adventure'>('survival')
  let onlineMode = $state(true)
  let location = $state('')
  let picking = $state(false)
  let pickError = $state('')
  let eula = $state(false)
  let busy = $state(false)
  let createError = $state('')

  const nameOk = $derived(/^[a-zA-Z0-9_-]{1,32}$/.test(name))
  const portOk = $derived(Number.isInteger(port) && port >= 1024 && port <= 65535)
  const maxOk = $derived(Number.isInteger(maxPlayers) && maxPlayers >= 1 && maxPlayers <= 500)

  async function refresh() {
    loading = true
    listError = ''
    try {
      servers = await listServers()
    } catch {
      listError = "Couldn't reach the backend — start it with npm run server."
    } finally {
      loading = false
    }
  }

  onMount(() => {
    void refresh()
    void loadSystem()
    const t = setInterval(() => void refreshStatuses(), 5000)
    return () => clearInterval(t)
  })

  async function loadSystem() {
    try {
      sys = await getSystem()
    } catch {}
  }

  async function loadVersions() {
    versionsLoading = true
    versionsError = ''
    version = ''
    try {
      versions = await getVersions(platform)
      version = versions[0] ?? ''
    } catch {
      versionsError = 'Could not fetch the version list — check the backend and your connection.'
    } finally {
      versionsLoading = false
    }
  }

  function openWizard() {
    wizard = true
    step = 1
    name = ''
    port = 25565
    platform = 'paper'
    versions = []
    version = ''
    versionsError = ''
    motd = ''
    maxPlayers = 20
    difficulty = 'easy'
    gamemode = 'survival'
    onlineMode = true
    location = ''
    pickError = ''
    picking = false
    eula = false
    createError = ''
    busy = false
  }

  function pickPlatform(p: 'paper' | 'purpur' | 'vanilla') {
    platform = p
    void loadVersions()
  }

  function next() {
    if (step === 2 && versions.length === 0) void loadVersions()
    step = Math.min(4, step + 1)
  }

  async function pickLocation() {
    picking = true
    pickError = ''
    try {
      const p = await pickFolder()
      if (p) location = p
    } catch {
      pickError = 'The folder picker failed — type the path manually instead.'
    } finally {
      picking = false
    }
  }

  async function create() {
    busy = true
    createError = ''
    try {
      await createServer({
        name,
        platform,
        version,
        port,
        eula,
        motd,
        maxPlayers,
        difficulty,
        gamemode,
        onlineMode,
        location: location.trim()
      })
      wizard = false
      await refresh()
    } catch (e) {
      createError = e instanceof Error ? e.message : 'Something went wrong.'
    } finally {
      busy = false
    }
  }

  async function refreshStatuses() {
    try {
      statuses = await getServerStatuses()
    } catch {}
  }

  async function act(s: ServerInstance, action: 'start' | 'stop') {
    busyName = s.name
    actionError = ''
    try {
      if (action === 'start') await startInstance(s.name)
      else await stopInstance(s.name)
      await refreshStatuses()
    } catch (e) {
      actionError = e instanceof Error ? e.message : 'Action failed.'
    } finally {
      busyName = ''
    }
  }

  const isOnline = (s: ServerInstance) => statuses[s.name] ?? s.status === 'online'
  const platformLabel = (p: string) => (p === 'unknown' ? 'Unknown' : p[0].toUpperCase() + p.slice(1))

  const runningCount = $derived(servers.filter((s) => isOnline(s)).length)
  const totalDisk = $derived(servers.reduce((sum, s) => sum + s.size, 0))

  const fmtSize = (n: number) =>
    n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(0)} MB` : `${Math.round(n / 1e3)} KB`
  const fmtRam = (n: number) => `${(n / 1e9).toFixed(1)} GB`
  const javaMajor = (v: string | null) => (v ? Number(v.split('.')[0]) : 0)

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape' && !busy) wizard = false
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="launcher">
  <div class="launcher-head">
    <div class="launcher-brand">
      <iconify-icon icon="pixelarticons:server" width="28"></iconify-icon>
      <div>
        <div class="launcher-title">Server Panel</div>
        <div class="launcher-sub">
          {servers.length} server{servers.length === 1 ? '' : 's'} · {runningCount} running · {fmtSize(totalDisk)} on disk
        </div>
      </div>
    </div>
    <div class="launcher-actions">
      <UserCard {shaderOn} {tiltOn} {ontoggle} popDown />
      <button class="btn btn-primary" onclick={openWizard}>
        <iconify-icon icon="pixelarticons:plus" width="15"></iconify-icon> New server
      </button>
    </div>
  </div>

  {#if actionError}
    <p class="hint err">{actionError}</p>
  {/if}

  <div class="launcher-body">
    <div>
      {#if loading}
        <div class="card pad"><p class="hint">Scanning servers folder…</p></div>
      {:else if listError}
        <div class="card pad"><p class="hint">{listError}</p></div>
      {:else if servers.length === 0}
        <div class="card pad empty-state">
          <iconify-icon icon="pixelarticons:server" width="34"></iconify-icon>
          <p class="empty-title">No servers installed yet</p>
          <p class="hint">Create one and the panel downloads the jar for you — it lands in <span class="mono">servers/&lt;name&gt;/</span>.</p>
          <button class="btn btn-primary" onclick={openWizard}>
            <iconify-icon icon="pixelarticons:plus" width="15"></iconify-icon> Create your first server
          </button>
        </div>
      {:else}
        <div class="server-grid">
          {#each servers as s (s.name)}
            <div class="card scard" class:online={isOnline(s)}>
              <div class="scard-top">
                <span class="scard-icon">
                  {#if !iconFail[s.name]}
                    <img
                      src={`/api/servers/${s.name}/icon`}
                      alt=""
                      onerror={() => (iconFail = { ...iconFail, [s.name]: true })}
                    />
                  {:else}
                    <iconify-icon icon="pixelarticons:blocks" width="24"></iconify-icon>
                  {/if}
                </span>
                <div class="scard-id">
                  <div class="scard-name">{s.name}</div>
                  <div class="faint">{platformLabel(s.platform)}{s.version ? ` ${s.version}` : ''}</div>
                </div>
                <span class="pill" class:pill-good={isOnline(s)}>
                  {#if isOnline(s)}<span class="dot-live"></span>{/if}
                  {isOnline(s) ? 'running' : 'offline'}
                </span>
              </div>
              <div class="scard-foot">
                <div class="detail-actions">
                  <button
                    class="btn btn-ghost sm"
                    onclick={() => act(s, 'start')}
                    disabled={isOnline(s) || busyName === s.name}>Start</button
                  >
                  <button
                    class="btn btn-ghost sm"
                    onclick={() => act(s, 'stop')}
                    disabled={!isOnline(s) || busyName === s.name}>Kill</button
                  >
                  <button class="btn btn-primary sm" onclick={() => onenter(s)}>
                    <iconify-icon icon="pixelarticons:login" width="14"></iconify-icon> Enter
                  </button>
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <div class="launcher-rail">
      <div class="card pad">
        <h2>System</h2>
        {#if sys}
          <span class="stat-row"><span class="lbl">Java</span><b>{sys.java ?? 'not found'}</b></span>
          {#if sys.java && javaMajor(sys.java) >= 25}
            <span class="sys-note good">
              <iconify-icon icon="pixelarticons:check" width="15"></iconify-icon>
              Java 25+ — servers can start
            </span>
          {:else}
            <span class="sys-note warn">
              <iconify-icon icon="pixelarticons:warning-diamond" width="15"></iconify-icon>
              Paper 26.3 needs Java 25
            </span>
          {/if}
          <span class="stat-row"><span class="lbl">OS</span><b>{sys.os}</b></span>
          <span class="stat-row"><span class="lbl">CPU cores</span><b>{sys.cpus}</b></span>
          <span class="stat-row">
            <span class="lbl">RAM</span>
            <b>{fmtRam(sys.memTotal - sys.memFree)} / {fmtRam(sys.memTotal)}</b>
          </span>
          <div class="hp big">
            <span style={`width: ${((sys.memTotal - sys.memFree) / sys.memTotal) * 100}%`}></span>
          </div>
        {:else}
          <div class="skeleton sk-line" style="width: 70%"></div>
          <div class="skeleton sk-line" style="width: 50%"></div>
        {/if}
      </div>

      <div class="card pad">
        <h2>Tips</h2>
        <ul class="tips">
          <li>Drop a <span class="mono">server-icon.png</span> into a server folder to change its card icon.</li>
          <li><b>Kill</b> is graceful — the server saves and stops.</li>
          <li>Servers can live on any drive via the wizard's <b>Storage location</b>.</li>
        </ul>
      </div>
    </div>
  </div>
</div>

{#if wizard}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="modal-backdrop"
    role="presentation"
    transition:fade={{ duration: 140 }}
    onclick={(e) => e.target === e.currentTarget && !busy && (wizard = false)}
  >
    <div class="detail wizard" role="dialog" tabindex="-1" aria-modal="true" aria-label="New server" in:popIn out:popOut>
      <button class="modal-close" onclick={() => !busy && (wizard = false)} aria-label="Close">
        <iconify-icon icon="pixelarticons:close" width="18"></iconify-icon>
      </button>

      <div class="detail-title-row">
        <span class="detail-title">New server</span>
      </div>

      <div class="wiz-steps">
        <span class:on={step >= 1}>1 Game</span>
        <span class:on={step >= 2}>2 Version</span>
        <span class:on={step >= 3}>3 Settings</span>
        <span class:on={step >= 4}>4 Review</span>
      </div>

      {#if step === 1}
        <p class="wiz-label">Game</p>
        <div class="wiz-options">
          <div class="wiz-option active">
            <b>Minecraft Java</b>
            <span>The only game wired up so far — more later.</span>
          </div>
        </div>
        <p class="wiz-label">Server software</p>
        <div class="wiz-options">
          <button class="wiz-option" class:active={platform === 'paper'} onclick={() => pickPlatform('paper')}>
            <b>Paper</b>
            <span>Plugins, performance — the standard for friend servers.</span>
          </button>
          <button class="wiz-option" class:active={platform === 'purpur'} onclick={() => pickPlatform('purpur')}>
            <b>Purpur</b>
            <span>Paper fork with extra gameplay and config options.</span>
          </button>
          <button class="wiz-option" class:active={platform === 'vanilla'} onclick={() => pickPlatform('vanilla')}>
            <b>Vanilla</b>
            <span>Pure Mojang server. No plugins, no patches.</span>
          </button>
        </div>
      {:else if step === 2}
        <div class="field">
          <label for="wiz-version">Version — {platform}</label>
          {#if versionsLoading}
            <p class="hint">Fetching versions…</p>
          {:else if versionsError}
            <p class="hint err">{versionsError}</p>
            <button class="btn btn-ghost sm" onclick={loadVersions}>Retry</button>
          {:else}
            <select id="wiz-version" bind:value={version}>
              {#each versions as v (v)}
                <option value={v}>{v}</option>
              {/each}
            </select>
          {/if}
        </div>
        <p class="hint">Newest first — {versions.length || '—'} releases available.</p>
      {:else if step === 3}
        <div class="wiz-grid2">
          <div class="field">
            <label for="wiz-name">Server name</label>
            <input id="wiz-name" bind:value={name} placeholder="survival" autocomplete="off" />
          </div>
          <div class="field">
            <label for="wiz-port">Port</label>
            <input id="wiz-port" type="number" bind:value={port} min="1024" max="65535" />
          </div>
        </div>
        {#if name && !nameOk}<p class="hint err">Name: letters, numbers, dashes and underscores only.</p>{/if}
        {#if !portOk}<p class="hint err">Port must be between 1024 and 65535.</p>{/if}
        <div class="field">
          <label for="wiz-motd">MOTD (server list message)</label>
          <input id="wiz-motd" bind:value={motd} placeholder={`defaults to "${name || 'server name'}"`} />
        </div>
        <div class="field">
          <label for="wiz-loc">Storage location</label>
          <div class="loc-row">
            <input id="wiz-loc" bind:value={location} placeholder="defaults to the servers/ folder next to the panel" />
            <button class="btn btn-ghost sm" onclick={pickLocation} disabled={picking}>
              <iconify-icon icon="pixelarticons:folder" width="14"></iconify-icon>
              {picking ? 'Picking…' : 'Browse…'}
            </button>
          </div>
          {#if pickError}<p class="hint err">{pickError}</p>{/if}
        </div>
        <div class="wiz-grid2">
          <div class="field">
            <label for="wiz-max">Max players</label>
            <input id="wiz-max" type="number" bind:value={maxPlayers} min="1" max="500" />
          </div>
          <div class="field">
            <label for="wiz-diff">Difficulty</label>
            <select id="wiz-diff" bind:value={difficulty}>
              <option value="peaceful">peaceful</option>
              <option value="easy">easy</option>
              <option value="normal">normal</option>
              <option value="hard">hard</option>
            </select>
          </div>
        </div>
        {#if !maxOk}<p class="hint err">Max players must be between 1 and 500.</p>{/if}
        <div class="wiz-grid2">
          <div class="field">
            <label for="wiz-mode">Default gamemode</label>
            <select id="wiz-mode" bind:value={gamemode}>
              <option value="survival">survival</option>
              <option value="creative">creative</option>
              <option value="adventure">adventure</option>
            </select>
          </div>
          <label class="eula">
            <input type="checkbox" bind:checked={onlineMode} />
            <span>Online mode (require Mojang accounts)</span>
          </label>
        </div>
      {:else}
        <div class="detail-meta">
          <span><span class="lbl">Name</span><b>{name}</b></span>
          <span><span class="lbl">Game</span><b>Minecraft Java</b></span>
          <span><span class="lbl">Software</span><b>{platform}</b></span>
          <span><span class="lbl">Version</span><b>{version || '—'}</b></span>
          <span><span class="lbl">Port</span><b>{port}</b></span>
          <span><span class="lbl">Storage</span><b>{location || 'default (servers/)'}</b></span>
          <span><span class="lbl">MOTD</span><b>{motd || name}</b></span>
          <span><span class="lbl">Max players</span><b>{maxPlayers}</b></span>
          <span><span class="lbl">Difficulty</span><b>{difficulty}</b></span>
          <span><span class="lbl">Gamemode</span><b>{gamemode}</b></span>
          <span><span class="lbl">Online mode</span><b>{onlineMode ? 'yes' : 'no'}</b></span>
        </div>
        <label class="eula">
          <input type="checkbox" bind:checked={eula} />
          <span>
            I accept the
            <a href="https://aka.ms/MinecraftEULA" target="_blank" rel="noreferrer">Minecraft EULA</a>
          </span>
        </label>
        {#if busy}
          <p class="hint">
            <iconify-icon icon="pixelarticons:loader" class="spin" width="14"></iconify-icon>
            Downloading {platform} {version} — this can take a minute…
          </p>
        {:else if createError}
          <p class="hint err">{createError}</p>
        {/if}
      {/if}

      <div class="detail-foot">
        <button class="btn btn-ghost sm" disabled={step === 1 || busy} onclick={() => (step -= 1)}>Back</button>
        {#if step < 4}
          <button
            class="btn btn-primary sm"
            disabled={(step === 2 && !version) || (step === 3 && (!nameOk || !portOk || !maxOk))}
            onclick={next}
          >
            Next
          </button>
        {:else}
          <button class="btn btn-primary sm" disabled={!eula || busy || !version} onclick={create}>
            Create server
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}
