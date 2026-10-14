<script lang="ts">
  import { onMount } from 'svelte'
  import { getServerInfo, getServerLogs } from '../lib/api'
  import type { ServerInfo } from '../lib/types'

  let { serverName }: { serverName: string } = $props()

  let info = $state<ServerInfo | null>(null)
  let feed = $state<{ time: string; text: string }[]>([])
  let error = $state('')

  async function refresh() {
    try {
      info = await getServerInfo(serverName)
      error = ''
    } catch {
      error = 'Could not reach the panel backend.'
    }
    try {
      const logs = await getServerLogs(serverName)
      feed = logs.lines.slice(-8).reverse().map((l) => ({ time: l.time, text: l.text }))
    } catch {}
  }

  onMount(() => {
    void refresh()
    const t = setInterval(() => void refresh(), 4000)
    return () => clearInterval(t)
  })

  const fmtUptime = (s: number | null) => {
    if (s === null) return '—'
    if (s < 60) return `${s}s`
    if (s < 3600) return `${Math.floor(s / 60)}m`
    return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
  }
</script>

<div class="page-head">
  <div>
    <h1>Dashboard</h1>
    <p class="sub">{serverName} · live overview</p>
  </div>
  {#if info?.running}
    <span class="pill pill-good"><span class="dot-live"></span> running</span>
  {:else}
    <span class="pill">offline</span>
  {/if}
</div>

{#if error}
  <p class="hint err">{error}</p>
{/if}

{#if info && !info.running}
  <p class="hint">Server is offline — start it from the Servers page to see live data.</p>
{:else if info && info.running && info.rcon === 'off' && info.game === 'minecraft'}
  <p class="hint">Live player data needs RCON — restart this server from the panel once to enable it.</p>
{/if}

{#if info}
  <div class="stats">
    <div class="card stat">
      <iconify-icon icon="pixelarticons:users" width="20"></iconify-icon>
      <div class="stat-num">
        {info.online ?? '—'}<span class="stat-dim">/{info.max ?? '—'}</span>
      </div>
      <div class="stat-label">Players online</div>
    </div>
    <div class="card stat">
      <iconify-icon icon="pixelarticons:speed-fast" width="20"></iconify-icon>
      <div class="stat-num">{info.tps ? info.tps[0].toFixed(1) : '—'}</div>
      <div class="stat-label">TPS (1 min)</div>
    </div>
    <div class="card stat">
      <iconify-icon icon="pixelarticons:clock" width="20"></iconify-icon>
      <div class="stat-num">{fmtUptime(info.uptimeSeconds)}</div>
      <div class="stat-label">Uptime (panel)</div>
    </div>
    <div class="card stat">
      <iconify-icon icon="pixelarticons:earth" width="20"></iconify-icon>
      <div class="stat-num">{info.worlds}</div>
      <div class="stat-label">Worlds</div>
    </div>
  </div>
{:else}
  <div class="stats">
    {#each Array(4) as _, i (i)}
      <div class="card stat"><div class="skeleton sk-line" style="width: 60%"></div></div>
    {/each}
  </div>
{/if}

<div class="card pad">
  <h2>Recent activity</h2>
  {#if feed.length === 0}
    <p class="hint">No log output yet.</p>
  {:else}
    <ul class="feed">
      {#each feed as a, i (i)}
        <li><span class="t">{a.time}</span><span>{a.text}</span></li>
      {/each}
    </ul>
  {/if}
</div>
