<script lang="ts">
  import { onMount } from 'svelte'
  import { getActivity, getStats } from '../lib/api'
  import type { Activity, Stats } from '../lib/types'
  import { SERVER_NAME } from '../lib/config'

  let stats: Stats | null = $state(null)
  let activity: Activity[] = $state([])

  onMount(async () => {
    stats = await getStats()
    activity = await getActivity()
  })
</script>

<div class="page-head">
  <div>
    <h1>Dashboard</h1>
    <p class="sub">{SERVER_NAME} · live overview</p>
  </div>
  <span class="pill pill-good"><span class="dot-live"></span> Server online</span>
</div>

{#if stats}
  <div class="stats">
    <div class="card stat">
      <iconify-icon icon="pixelarticons:users" width="20"></iconify-icon>
      <div class="stat-num">{stats.online}<span class="stat-dim">/{stats.max}</span></div>
      <div class="stat-label">Players online</div>
    </div>
    <div class="card stat">
      <iconify-icon icon="pixelarticons:speed-fast" width="20"></iconify-icon>
      <div class="stat-num">{stats.tps}<span class="stat-dim">.0</span></div>
      <div class="stat-label">TPS</div>
    </div>
    <div class="card stat">
      <iconify-icon icon="pixelarticons:clock" width="20"></iconify-icon>
      <div class="stat-num">{stats.uptime}</div>
      <div class="stat-label">Uptime</div>
    </div>
    <div class="card stat">
      <iconify-icon icon="pixelarticons:earth" width="20"></iconify-icon>
      <div class="stat-num">{stats.worlds}</div>
      <div class="stat-label">Worlds</div>
    </div>
  </div>
{/if}

<div class="cols">
  <div class="card pad">
    <h2>Recent activity</h2>
    <ul class="feed">
      {#each activity as a}
        <li><span class="t">{a.time}</span><span>{a.text}</span></li>
      {/each}
    </ul>
  </div>
  <div class="card pad">
    <h2>Quick actions</h2>
    <div class="actions">
      <a class="btn btn-primary" href="#console">
        <iconify-icon icon="pixelarticons:terminal" width="16"></iconify-icon> Open console
      </a>
      <button class="btn btn-ghost" disabled>
        <iconify-icon icon="pixelarticons:reload" width="16"></iconify-icon> Restart server
      </button>
      <button class="btn btn-ghost" disabled>
        <iconify-icon icon="pixelarticons:archive" width="16"></iconify-icon> Backup now
      </button>
    </div>
    <p class="hint">Server actions are wired in M2–M3.</p>
  </div>
</div>
