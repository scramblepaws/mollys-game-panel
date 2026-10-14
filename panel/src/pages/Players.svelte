<script lang="ts">
  import { onMount } from 'svelte'
  import { getPlayers } from '../lib/api'
  import type { Player } from '../lib/types'
  import { fade } from 'svelte/transition'
  import { popIn, popOut } from '../lib/transitions'
  import PlayerModel from '../components/PlayerModel.svelte'

  type Mode = 'all' | 'survival' | 'creative'
  type Tab = 'overview' | 'admin'

  let players: Player[] = $state([])
  let q = $state('')
  let mode = $state<Mode>('all')
  let sel = $state<Player | null>(null)
  let tab = $state<Tab>('overview')

  const actions = [
    { icon: 'pixelarticons:crown', label: 'OP' },
    { icon: 'pixelarticons:gamepad', label: 'Gamemode' },
    { icon: 'pixelarticons:map-pin', label: 'Teleport' },
    { icon: 'pixelarticons:eye', label: 'Spectate' },
    { icon: 'pixelarticons:logout', label: 'Kick' },
    { icon: 'pixelarticons:user-x', label: 'Ban' },
    { icon: 'pixelarticons:trash', label: 'Clear items' },
    { icon: 'pixelarticons:shield', label: 'Whitelist' }
  ]

  onMount(async () => {
    players = await getPlayers()
  })

  const filtered = $derived(
    players.filter(
      (p) => (mode === 'all' || p.gamemode === mode) && p.name.toLowerCase().includes(q.trim().toLowerCase())
    )
  )

  const avgPing = $derived(
    players.length ? Math.round(players.reduce((s, p) => s + p.ping, 0) / players.length) : 0
  )
  const inSurvival = $derived(players.filter((p) => p.gamemode === 'survival').length)
  const inCreative = $derived(players.filter((p) => p.gamemode === 'creative').length)

  const pingClass = (ping: number) =>
    ping < 40 ? 'ping ping-good' : ping < 80 ? 'ping ping-warn' : 'ping ping-bad'
  const head = (name: string) => `https://mc-heads.net/avatar/${name}/72`

  function openPlayer(p: Player) {
    sel = p
    tab = 'overview'
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') sel = null
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="page-head">
  <div>
    <h1>Players</h1>
    <p class="sub">{players.length} online · session history arrives with Plan in M7</p>
  </div>
</div>

<div class="stats">
  <div class="card stat">
    <iconify-icon icon="pixelarticons:users" width="20"></iconify-icon>
    <div class="stat-num">{players.length}</div>
    <div class="stat-label">Online now</div>
  </div>
  <div class="card stat">
    <iconify-icon icon="pixelarticons:signal" width="20"></iconify-icon>
    <div class="stat-num">{avgPing}<span class="stat-dim">ms</span></div>
    <div class="stat-label">Average ping</div>
  </div>
  <div class="card stat">
    <iconify-icon icon="pixelarticons:tree-pine" width="20"></iconify-icon>
    <div class="stat-num">{inSurvival}</div>
    <div class="stat-label">In survival</div>
  </div>
  <div class="card stat">
    <iconify-icon icon="pixelarticons:brush" width="20"></iconify-icon>
    <div class="stat-num">{inCreative}</div>
    <div class="stat-label">In creative</div>
  </div>
</div>

<div class="toolbar">
  <label class="search">
    <iconify-icon icon="pixelarticons:search" width="16"></iconify-icon>
    <input placeholder="Search players…" bind:value={q} />
  </label>
  <div class="seg">
    <button class="pill" class:pill-pink={mode === 'all'} onclick={() => (mode = 'all')}>All</button>
    <button class="pill" class:pill-pink={mode === 'survival'} onclick={() => (mode = 'survival')}>Survival</button>
    <button class="pill" class:pill-pink={mode === 'creative'} onclick={() => (mode = 'creative')}>Creative</button>
  </div>
</div>

{#if filtered.length === 0}
  <div class="card pad"><p class="hint">No players match — clear the search or switch filter.</p></div>
{:else}
  <div class="player-grid">
    {#each filtered as p (p.name)}
      <div
        class="card pcard"
        role="button"
        tabindex="0"
        onclick={() => openPlayer(p)}
        onkeydown={(e) => e.key === 'Enter' && openPlayer(p)}
      >
        <div class="pcard-head">
          <img src={head(p.name)} alt={`${p.name} head`} />
          <div class="pcard-id">
            <div class="pcard-name">{p.name}</div>
            {#if p.pronouns}
              <span class="pill pill-pink">{p.pronouns}</span>
            {:else}
              <span class="pcard-sub">no pronouns set</span>
            {/if}
          </div>
          <span class={pingClass(p.ping) + ' pcard-ping'}><span class="dot"></span>{p.ping}ms</span>
        </div>
        <div class="hp"><span style={`width: ${(p.health / 20) * 100}%`}></span></div>
        <div class="pcard-meta">
          <span class="pill">{p.gamemode}</span>
          <span class="faint">{p.world}</span>
        </div>
        <div class="pcard-meta">
          <span class="mono faint">{p.x} {p.y} {p.z}</span>
          <span class="hpnum"><iconify-icon icon="pixelarticons:heart" width="12"></iconify-icon>{p.health}/20</span>
        </div>
      </div>
    {/each}
  </div>
{/if}

{#if sel}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="modal-backdrop"
    role="presentation"
    transition:fade={{ duration: 140 }}
    onclick={(e) => e.target === e.currentTarget && (sel = null)}
  >
    <div class="detail profile" role="dialog" tabindex="-1" aria-modal="true" aria-label={sel.name} in:popIn out:popOut>
      <button class="modal-close" onclick={() => (sel = null)} aria-label="Close">
        <iconify-icon icon="pixelarticons:close" width="18"></iconify-icon>
      </button>

      <div class="profile-grid">
        <div class="model-panel">
          <PlayerModel name={sel.name} />
        </div>

        <div class="profile-main">
          <div class="detail-title-row">
            <span class="detail-title">{sel.name}</span>
            {#if sel.pronouns}<span class="pill pill-pink">{sel.pronouns}</span>{/if}
            <span class={pingClass(sel.ping) + ' profile-ping'}><span class="dot"></span>{sel.ping}ms</span>
          </div>

          <div class="tabs">
            <button class="tab" class:active={tab === 'overview'} onclick={() => (tab = 'overview')}>Overview</button>
            <button class="tab" class:active={tab === 'admin'} onclick={() => (tab = 'admin')}>Admin</button>
          </div>

          {#if tab === 'overview'}
            <div class="detail-meta">
              <span><span class="lbl">Gamemode</span><b>{sel.gamemode}</b></span>
              <span><span class="lbl">World</span><b>{sel.world}</b></span>
              <span><span class="lbl">Position</span><b>{sel.x} {sel.y} {sel.z}</b></span>
              <span><span class="lbl">Health</span><b>{sel.health} / 20</b></span>
            </div>
            <div class="hp big"><span style={`width: ${(sel.health / 20) * 100}%`}></span></div>
            <div class="inv-grid">
              {#each Array.from({ length: 27 }) as _, i (i)}
                <span class="slot"></span>
              {/each}
            </div>
            <p class="hint">Read-only inventory arrives with the bridge in M3</p>
          {:else}
            <div class="admin-grid">
              {#each actions as a (a.label)}
                <button class="btn btn-ghost sm" disabled>
                  <iconify-icon icon={a.icon} width="14"></iconify-icon> {a.label}
                </button>
              {/each}
            </div>
            <p class="hint">Admin actions execute over RCON in M3</p>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}
