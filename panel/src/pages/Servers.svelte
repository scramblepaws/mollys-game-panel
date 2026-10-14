<script lang="ts">
  import { onMount } from 'svelte'
  import {
    cancelInstall,
    createServer,
    deleteServer,
    getGames,
    getServerStatuses,
    getSettings,
    getSystem,
    getVersions,
    listServers,
    pickFolder,
    removeServerIcon,
    setServerIcon,
    setSettings,
    startInstance,
    stopInstance
  } from '../lib/api'
  import type { GameMeta, ServerInstance, SettingsInfo, SystemInfo } from '../lib/types'
  import { fade } from 'svelte/transition'
  import { popIn, popOut } from '../lib/transitions'
  import { GAME_ART } from '../lib/gameArt'
  import { fmtEta, fmtSpeed } from '../lib/format'

  let settingsOpen = $state(false)
  let settings = $state<SettingsInfo | null>(null)
  let pickingDir = $state(false)

  async function toggleSettings() {
    settingsOpen = !settingsOpen
    if (settingsOpen) {
      try {
        settings = await getSettings()
      } catch {}
    }
  }

  async function pickDefaultDir() {
    pickingDir = true
    try {
      const p = await pickFolder()
      if (p) settings = await setSettings(p)
    } catch {}
    finally {
      pickingDir = false
      void refreshSilent()
    }
  }

  async function resetDefaultDir() {
    try {
      settings = await setSettings('')
    } catch {}
    void refreshSilent()
  }

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
  let confirmDel = $state('')
  let statuses = $state<Record<string, 'online' | 'starting' | 'offline'>>({})
  let iconFail = $state<Record<string, boolean>>({})
  let artFail = $state<Record<string, boolean>>({})
  let iconV = $state<Record<string, number>>({})
  let iconFor = $state('')
  let fileInput: HTMLInputElement | null = $state(null)
  let sys = $state<SystemInfo | null>(null)

  let wizard = $state(false)
  let step = $state(1)
  let games = $state<GameMeta[]>([
    {
      id: 'minecraft',
      name: 'Minecraft Java',
      blurb: 'Plugins, datapacks, mods — the classic.',
      kind: 'minecraft',
      defaultPort: 25565,
      needsPassword: false
    }
  ])
  let game = $state('minecraft')
  let password = $state('')
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

  let memoryMb = $state(2048)
  let viewDistance = $state(10)
  let pvp = $state(true)
  let whitelist = $state(false)
  let csMap = $state('de_dust2')
  let csMode = $state('casual')
  let csPlugins = $state(false)

  const nameOk = $derived(/^[a-zA-Z0-9_-]{1,32}$/.test(name))
  const portOk = $derived(Number.isInteger(port) && port >= 1024 && port <= 65535)
  const maxOk = $derived(Number.isInteger(maxPlayers) && maxPlayers >= 1 && maxPlayers <= 500)
  const memOk = $derived(Number.isInteger(memoryMb) && memoryMb >= 512 && memoryMb <= 32768)
  const vdOk = $derived(Number.isInteger(viewDistance) && viewDistance >= 2 && viewDistance <= 32)
  const gameMeta = $derived(games.find((g) => g.id === game) ?? games[0])
  const passwordOk = $derived(!gameMeta?.needsPassword || password.length >= 5)
  const isMinecraft = $derived((gameMeta?.kind ?? 'minecraft') === 'minecraft')
  const isCs2 = $derived(game === 'cs2')

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
    void loadGames()
    const t = setInterval(() => void refreshStatuses(), 5000)
    const l = setInterval(() => void refreshSilent(), 3000)
    return () => {
      clearInterval(t)
      clearInterval(l)
    }
  })

  async function refreshSilent() {
    try {
      servers = await listServers()
    } catch {}
  }

  async function loadGames() {
    try {
      games = await getGames()
    } catch {}
  }

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
    game = 'minecraft'
    password = ''
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
    picking = false
    pickError = ''
    eula = false
    createError = ''
    busy = false
    memoryMb = 2048
    viewDistance = 10
    pvp = true
    whitelist = false
    csPlugins = false
  }

  function pickGame(g: GameMeta) {
    game = g.id
    port = g.defaultPort
    password = ''
    csMap = g.maps?.[0] ?? 'de_dust2'
    csMode = g.modes?.[0] ?? 'casual'
    if (g.kind === 'minecraft') {
      platform = 'paper'
      void loadVersions()
    } else {
      versions = []
      version = ''
    }
  }

  function pickPlatform(p: 'paper' | 'purpur' | 'vanilla') {
    platform = p
    void loadVersions()
  }

  function next() {
    if (step === 2 && isMinecraft && versions.length === 0) void loadVersions()
    step = Math.min(4, step + 1)
  }

  async function pickLocation() {
    picking = true
    pickError = ''
    try {
      const p = await pickFolder()
      if (p) location = p
    } catch {
      pickError = 'The Windows dialog failed — type the path manually instead.'
    } finally {
      picking = false
    }
  }

  async function create() {
    busy = true
    createError = ''
    try {
      await createServer({
        game,
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
        location: location.trim(),
        password,
        memoryMb,
        viewDistance,
        pvp,
        whitelist,
        map: csMap,
        gameMode: csMode,
        plugins: csPlugins
      })
      wizard = false
      void refreshSilent()
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

  async function remove(s: ServerInstance) {
    actionError = ''
    if (confirmDel !== s.name) {
      confirmDel = s.name
      setTimeout(() => {
        if (confirmDel === s.name) confirmDel = ''
      }, 3000)
      return
    }
    confirmDel = ''
    busyName = s.name
    try {
      await deleteServer(s.name)
      await refresh()
      await refreshStatuses()
    } catch (e) {
      actionError = e instanceof Error ? e.message : 'Delete failed.'
    } finally {
      busyName = ''
    }
  }

  function pickIcon(s: ServerInstance) {
    if (s.installing) return
    iconFor = s.name
    fileInput?.click()
  }

  async function onIconFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement
    const f = input.files?.[0]
    const target = iconFor
    iconFor = ''
    input.value = ''
    if (!f || !target) return
    actionError = ''
    try {
      await setServerIcon(target, await f.arrayBuffer())
      iconFail = { ...iconFail, [target]: false }
      iconV = { ...iconV, [target]: (iconV[target] ?? 0) + 1 }
    } catch (err) {
      actionError = err instanceof Error ? err.message : 'Icon upload failed.'
    }
  }

  async function removeIcon(s: ServerInstance) {
    actionError = ''
    try {
      await removeServerIcon(s.name)
      iconFail = { ...iconFail, [s.name]: false }
      iconV = { ...iconV, [s.name]: (iconV[s.name] ?? 0) + 1 }
    } catch (err) {
      actionError = err instanceof Error ? err.message : 'Could not remove icon.'
    }
  }

  let cancelBusy = $state('')

  async function stopInstall(s: ServerInstance) {
    cancelBusy = s.name
    actionError = ''
    try {
      await cancelInstall(s.name)
      void refreshSilent()
    } catch (err) {
      actionError = err instanceof Error ? err.message : 'Could not cancel the install.'
    } finally {
      cancelBusy = ''
    }
  }

  const statusOf = (s: ServerInstance): 'online' | 'starting' | 'offline' =>
    statuses[s.name] ?? (s.status === 'online' ? 'online' : s.status === 'starting' ? 'starting' : 'offline')
  const isOnline = (s: ServerInstance) => statusOf(s) === 'online'
  const isStarting = (s: ServerInstance) => statusOf(s) === 'starting'
  const gameLabel = (g: string) => (g ? g[0].toUpperCase() + g.slice(1) : '')
  const platformLabel = (p: string) => (p === 'unknown' ? 'Unknown' : p[0].toUpperCase() + p.slice(1))

  const runningCount = $derived(servers.filter((s) => isOnline(s)).length)
  const installingCount = $derived(servers.filter((s) => s.installing).length)
  const totalDisk = $derived(servers.reduce((sum, s) => sum + s.size, 0))

  const fmtSize = (n: number) =>
    n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(0)} MB` : `${Math.round(n / 1e3)} KB`
  const fmtRam = (n: number) => `${(n / 1e9).toFixed(1)} GB`
  const javaMajor = (v: string | null) => (v ? Number(v.split('.')[0]) : 0)

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (settingsOpen) settingsOpen = false
      else if (!busy) wizard = false
    }
  }

  function onDocDown(e: MouseEvent) {
    if (settingsOpen && e.target instanceof Element && !e.target.closest('.settings-wrap')) settingsOpen = false
  }
</script>

<svelte:window onkeydown={onKey} onmousedown={onDocDown} />

<input
  type="file"
  accept="image/png,image/jpeg,image/webp"
  style="display: none"
  bind:this={fileInput}
  onchange={onIconFile}
/>

  <div class="launcher">
  <div class="launcher-head">
    <div class="launcher-brand">
      <iconify-icon icon="pixelarticons:server" width="28"></iconify-icon>
      <div>
        <div class="launcher-title">Server Panel</div>
        <div class="launcher-sub">
          {servers.length} server{servers.length === 1 ? '' : 's'} · {runningCount} running{#if installingCount > 0} · {installingCount} installing{/if} · {fmtSize(totalDisk)} on disk
        </div>
      </div>
    </div>
    <div class="launcher-actions">
      <div class="settings-wrap">
        {#if settingsOpen}
          <div class="user-pop down">
            <label>
              <input type="checkbox" checked={shaderOn} onchange={() => ontoggle('shader')} />
              Animated background
            </label>
            <label>
              <input type="checkbox" checked={tiltOn} onchange={() => ontoggle('tilt')} />
              3D card tilt
            </label>
            <div class="settings-path">
              <div class="wiz-label">Default server files</div>
              <div class="mono">{settings?.serversDir ?? '…'}</div>
              <div class="settings-actions">
                <button class="btn btn-ghost sm" onclick={pickDefaultDir} disabled={pickingDir}>
                  <iconify-icon icon="pixelarticons:folder" width="13"></iconify-icon>
                  {pickingDir ? 'Waiting for dialog…' : 'Change…'}
                </button>
                {#if settings?.custom}
                  <button class="btn btn-ghost sm" onclick={resetDefaultDir}>Reset</button>
                {/if}
              </div>
            </div>
          </div>
        {/if}
        <button
          class="icon-btn"
          onclick={toggleSettings}
          title="Settings"
          aria-label="Settings"
        >
          <iconify-icon icon="pixelarticons:gear" width="16"></iconify-icon>
        </button>
      </div>
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
                <span
                  class="scard-icon"
                  class:pickable={!s.installing}
                  role="button"
                  tabindex={s.installing ? -1 : 0}
                  title={s.installing ? '' : 'Click to change icon'}
                  onclick={() => pickIcon(s)}
                  onkeydown={(e) => e.key === 'Enter' && pickIcon(s)}
                >
                  {#if s.installing}
                    {#if GAME_ART[s.game] && !artFail[s.game]}
                      <img
                        class:pixel={s.game !== 'minecraft'}
                        src={GAME_ART[s.game]}
                        alt=""
                        draggable="false"
                        onerror={() => (artFail = { ...artFail, [s.game]: true })}
                      />
                    {:else}
                      <iconify-icon icon="pixelarticons:loader" class="spin" width="24"></iconify-icon>
                    {/if}
                  {:else if !iconFail[s.name]}
                    <img
                      src={`/api/servers/${s.name}/icon?v=${iconV[s.name] ?? 0}`}
                      alt=""
                      onerror={() => (iconFail = { ...iconFail, [s.name]: true })}
                    />
                    <button
                      class="icon-x"
                      onclick={(e) => {
                        e.stopPropagation()
                        void removeIcon(s)
                      }}
                      title="Remove icon"
                      aria-label="Remove icon"
                    >
                      <iconify-icon icon="pixelarticons:close" width="10"></iconify-icon>
                    </button>
                  {:else}
                    <iconify-icon icon="pixelarticons:blocks" width="24"></iconify-icon>
                  {/if}
                </span>
                <div class="scard-id">
                  <div class="scard-name">{s.name}</div>
                  <div class="faint scard-sub">
                    {s.installing
                      ? 'Downloading…'
                      : s.failed
                        ? (s.errorMessage ?? 'Install failed')
                        : s.game !== 'minecraft'
                          ? gameLabel(s.game)
                          : `${platformLabel(s.platform)}${s.version ? ` ${s.version}` : ''}`}
                  </div>
                </div>
                {#if s.installing}
                  <span class="scard-pct">{s.installPercent}%</span>
                {:else if s.failed}
                  <span class="pill pill-bad">failed</span>
                {:else}
                  <span class="pill" class:pill-good={isOnline(s)}>
                    {#if isOnline(s)}<span class="dot-live"></span>{/if}
                    {#if isStarting(s)}<iconify-icon icon="pixelarticons:loader" class="spin" width="11"></iconify-icon>{/if}
                    {isOnline(s) ? 'running' : isStarting(s) ? 'starting up' : 'offline'}
                  </span>
                {/if}
              </div>
              {#if s.installing}
                <div class="scard-foot">
                  <div class="scard-install">
                    <div class="scard-bar">
                      <span style={`width: ${Math.min(100, Math.max(0, s.installPercent ?? 0))}%`}></span>
                    </div>
                    <div class="toast-meta">
                      <span class="faint">{s.installMessage}</span>
                      <span>
                        {#if s.etaSeconds != null}{fmtEta(s.etaSeconds)} left{/if}{#if s.speedBps != null} · {fmtSpeed(s.speedBps)}{/if}
                      </span>
                    </div>
                    <div class="detail-actions">
                      <button
                        class="btn btn-ghost sm danger"
                        disabled={cancelBusy === s.name}
                        onclick={() => stopInstall(s)}
                      >
                        <iconify-icon icon="pixelarticons:close" width="12"></iconify-icon>
                        {cancelBusy === s.name ? 'Stopping…' : 'Stop install'}
                      </button>
                    </div>
                  </div>
                </div>
              {:else if s.failed}
                <div class="scard-foot">
                  <div class="detail-actions">
                    <button
                      class="btn btn-ghost sm danger"
                      onclick={() => remove(s)}
                      disabled={busyName === s.name}
                    >
                      {confirmDel === s.name ? 'Confirm delete?' : 'Delete'}
                    </button>
                  </div>
                </div>
              {:else}
                <div class="scard-foot">
                  <div class="scard-meta">
                    {#if s.port}<span>port {s.port}</span>{/if}
                    <span>{fmtSize(s.size)}</span>
                    {#if s.game !== 'minecraft'}<span>{gameLabel(s.game)}</span>{/if}
                  </div>
                  <div class="detail-actions">
                    <button
                      class="btn btn-ghost sm"
                      onclick={() => act(s, 'start')}
                      disabled={isOnline(s) || isStarting(s) || busyName === s.name}>Start</button
                    >
                    <button
                      class="btn btn-ghost sm"
                      onclick={() => act(s, 'stop')}
                      disabled={(!isOnline(s) && !isStarting(s)) || busyName === s.name}>Kill</button
                    >
                    <button class="btn btn-primary sm" onclick={() => onenter(s)}>
                      <iconify-icon icon="pixelarticons:login" width="14"></iconify-icon> Enter
                    </button>
                    <button
                      class="btn btn-ghost sm danger"
                      onclick={() => remove(s)}
                      disabled={busyName === s.name}
                    >
                      {confirmDel === s.name ? 'Confirm delete?' : 'Delete'}
                    </button>
                  </div>
                </div>
              {/if}
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
        <span class:on={step >= 2}>2 Server</span>
        <span class:on={step >= 3}>3 Settings</span>
        <span class:on={step >= 4}>4 Review</span>
      </div>

      {#if step === 1}
        <p class="wiz-label">Pick a game</p>
        <div class="wiz-options wiz-scroll">
          {#each games as g (g.id)}
            <button
              class="wiz-option game-card"
              class:active={game === g.id}
              title={g.name}
              aria-label={g.name}
              onclick={() => pickGame(g)}
            >
              <span class="game-art">
                {#if GAME_ART[g.id] && !artFail[g.id]}
                  <img
                    class:pixel={g.id !== 'minecraft'}
                    src={GAME_ART[g.id]}
                    alt=""
                    draggable="false"
                    onerror={() => (artFail = { ...artFail, [g.id]: true })}
                  />
                {:else}
                  <iconify-icon icon="pixelarticons:blocks" width="22"></iconify-icon>
                {/if}
                {#if game === g.id}
                  <span class="game-check">
                    <iconify-icon icon="pixelarticons:check" width="12"></iconify-icon>
                  </span>
                {/if}
              </span>
            </button>
          {/each}
        </div>
      {:else if step === 2}
        {#if isMinecraft}
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
        {:else}
          <div class="wiz-option active">
            <b>{gameMeta?.name} — latest dedicated server</b>
            <span>
              Installed through Steam (anonymous) — no Steam account needed, but the download can take a while.
            </span>
          </div>
          {#if gameMeta?.supportsPlugins}
            <p class="hint">
              Plugin-ready — Metamod:Source + CounterStrikeSharp can be installed with it (option on the next step).
            </p>
          {/if}
        {/if}
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
        {#if gameMeta?.needsPassword}
          <div class="field">
            <label for="wiz-pass">Server password (min 5 characters)</label>
            <input id="wiz-pass" bind:value={password} />
            {#if password && password.length < 5}<p class="hint err">At least 5 characters.</p>{/if}
          </div>
        {/if}
        {#if isMinecraft}
          <div class="field">
            <label for="wiz-motd">MOTD (server list message)</label>
            <input id="wiz-motd" bind:value={motd} placeholder={`defaults to "${name || 'server name'}"`} />
          </div>
        {/if}
        <div class="field">
          <label for="wiz-loc">Storage location</label>
          <div class="loc-row">
            <input id="wiz-loc" bind:value={location} placeholder="defaults to the servers/ folder next to the panel" />
            <button class="btn btn-ghost sm" onclick={pickLocation} disabled={picking}>
              <iconify-icon icon="pixelarticons:folder" width="14"></iconify-icon>
              {picking ? 'Waiting for dialog…' : 'Browse…'}
            </button>
          </div>
          {#if pickError}<p class="hint err">{pickError}</p>{/if}
        </div>
        {#if isMinecraft}
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
          <div class="wiz-grid2">
            <div class="field">
              <label for="wiz-mem">Memory (MB)</label>
              <input id="wiz-mem" type="number" bind:value={memoryMb} min="512" max="32768" step="512" />
            </div>
            <div class="field">
              <label for="wiz-vd">View distance (chunks)</label>
              <input id="wiz-vd" type="number" bind:value={viewDistance} min="2" max="32" />
            </div>
          </div>
          {#if !memOk}<p class="hint err">Memory must be between 512 and 32768 MB.</p>{/if}
          {#if !vdOk}<p class="hint err">View distance must be between 2 and 32.</p>{/if}
          <div class="wiz-grid2">
            <label class="eula">
              <input type="checkbox" bind:checked={pvp} />
              <span>PvP enabled</span>
            </label>
            <label class="eula">
              <input type="checkbox" bind:checked={whitelist} />
              <span>Whitelist only</span>
            </label>
          </div>
        {/if}
        {#if isCs2}
          <div class="wiz-grid2">
            <div class="field">
              <label for="wiz-cs-map">Default map</label>
              <select id="wiz-cs-map" bind:value={csMap}>
                {#each gameMeta?.maps ?? ['de_dust2'] as m (m)}
                  <option value={m}>{m}</option>
                {/each}
              </select>
            </div>
            <div class="field">
              <label for="wiz-cs-mode">Game mode</label>
              <select id="wiz-cs-mode" bind:value={csMode}>
                {#each gameMeta?.modes ?? ['casual'] as m (m)}
                  <option value={m}>{m}</option>
                {/each}
              </select>
            </div>
          </div>
          <label class="eula">
            <input type="checkbox" bind:checked={csPlugins} />
            <span>
              Install plugin support —
              <a href="https://www.sourcemm.dev" target="_blank" rel="noreferrer">Metamod:Source</a>
              +
              <a href="https://github.com/roflmuffin/CounterStrikeSharp" target="_blank" rel="noreferrer"
                >CounterStrikeSharp</a
              >
            </span>
          </label>
        {/if}
      {:else}
        <div class="detail-meta">
          <span><span class="lbl">Name</span><b>{name}</b></span>
          <span><span class="lbl">Game</span><b>{gameMeta?.name}</b></span>
          {#if isMinecraft}
            <span><span class="lbl">Software</span><b>{platform}</b></span>
            <span><span class="lbl">Version</span><b>{version || '—'}</b></span>
          {/if}
          <span><span class="lbl">Port</span><b>{port}</b></span>
          {#if gameMeta?.needsPassword}
            <span><span class="lbl">Password</span><b>•••••</b></span>
          {/if}
          <span><span class="lbl">Storage</span><b>{location || 'default (servers/)'}</b></span>
          {#if isMinecraft}
            <span><span class="lbl">MOTD</span><b>{motd || name}</b></span>
            <span><span class="lbl">Max players</span><b>{maxPlayers}</b></span>
            <span><span class="lbl">Difficulty</span><b>{difficulty}</b></span>
            <span><span class="lbl">Gamemode</span><b>{gamemode}</b></span>
            <span><span class="lbl">Online mode</span><b>{onlineMode ? 'yes' : 'no'}</b></span>
            <span><span class="lbl">Memory</span><b>{memoryMb} MB</b></span>
            <span><span class="lbl">View distance</span><b>{viewDistance} chunks</b></span>
            <span><span class="lbl">PvP</span><b>{pvp ? 'on' : 'off'}</b></span>
            <span><span class="lbl">Whitelist</span><b>{whitelist ? 'on' : 'off'}</b></span>
          {/if}
          {#if isCs2}
            <span><span class="lbl">Map</span><b>{csMap}</b></span>
            <span><span class="lbl">Mode</span><b>{csMode}</b></span>
            <span><span class="lbl">Plugins</span><b>{csPlugins ? 'Metamod + CSSharp' : 'none'}</b></span>
          {/if}
        </div>
        {#if isMinecraft}
          <label class="eula">
            <input type="checkbox" bind:checked={eula} />
            <span>
              I accept the
              <a href="https://aka.ms/MinecraftEULA" target="_blank" rel="noreferrer">Minecraft EULA</a>
            </span>
          </label>
        {/if}
        {#if busy}
          <p class="hint">
            <iconify-icon icon="pixelarticons:loader" class="spin" width="14"></iconify-icon>
            Contacting the backend…
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
            disabled={(step === 2 && isMinecraft && !version) ||
              (step === 3 && (!nameOk || !portOk || !passwordOk || (isMinecraft && (!maxOk || !memOk || !vdOk))))}
            onclick={next}
          >
            Next
          </button>
        {:else}
          <button
            class="btn btn-primary sm"
            disabled={busy || !passwordOk || (isMinecraft && (!eula || !version))}
            onclick={create}
          >
            Create server
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}
