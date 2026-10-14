<script lang="ts">
  import { onMount } from 'svelte'
  import { getServerInfo, sendServerCommand } from '../lib/api'
  import type { ServerInfo } from '../lib/types'

  let { serverName }: { serverName: string } = $props()

  let info = $state<ServerInfo | null>(null)
  let q = $state('')
  let error = $state('')
  let actionError = $state('')

  async function refresh() {
    try {
      info = await getServerInfo(serverName)
      error = ''
    } catch {
      error = 'Could not reach the panel backend.'
    }
  }

  onMount(() => {
    void refresh()
    const t = setInterval(() => void refresh(), 5000)
    return () => clearInterval(t)
  })

  const names = $derived((info?.names ?? []).filter((n) => n.toLowerCase().includes(q.trim().toLowerCase())))
  const head = (name: string) => `https://mc-heads.net/avatar/${name}/72`

  async function kick(name: string) {
    actionError = ''
    try {
      await sendServerCommand(serverName, `kick ${name}`)
      await refresh()
    } catch (e) {
      actionError = e instanceof Error ? e.message : 'Kick failed.'
    }
  }
</script>

<div class="page-head">
  <div>
    <h1>Players</h1>
    <p class="sub">
      Online on {serverName} · {info?.online ?? '—'} of {info?.max ?? '—'}
    </p>
  </div>
</div>

{#if error}
  <p class="hint err">{error}</p>
{/if}
{#if actionError}
  <p class="hint err">{actionError}</p>
{/if}

{#if !info}
  <div class="player-grid">
    {#each Array(4) as _, i (i)}
      <div class="card pcard"><div class="skeleton sk-line" style="width: 70%"></div></div>
    {/each}
  </div>
{:else if !info.running}
  <div class="card pad">
    <p class="hint">Server is offline — start it from the Servers page to see who's online.</p>
  </div>
{:else if info.rcon === 'off'}
  <div class="card pad">
    <p class="hint">
      RCON isn't enabled on this server yet — restart it once from the panel and player data will show up
      here.
    </p>
  </div>
{:else}
  <div class="toolbar">
    <label class="search">
      <iconify-icon icon="pixelarticons:search" width="16"></iconify-icon>
      <input placeholder="Search players…" bind:value={q} />
    </label>
  </div>

  {#if names.length === 0}
    <div class="card pad">
      <p class="hint">{q ? 'No players match that search.' : 'Nobody online right now.'}</p>
    </div>
  {:else}
    <div class="player-grid">
      {#each names as n (n)}
        <div class="card pcard">
          <div class="pcard-head">
            <img src={head(n)} alt={`${n} head`} />
            <div class="pcard-id">
              <div class="pcard-name">{n}</div>
              <span class="pill pill-good"><span class="dot-live"></span> online</span>
            </div>
          </div>
          <div class="detail-actions">
            <button class="btn btn-ghost sm danger" onclick={() => kick(n)}>Kick</button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
{/if}
