<script lang="ts">
  import { onMount } from 'svelte'
  import { getServerWorlds } from '../lib/api'
  import type { WorldInfo } from '../lib/types'

  let { serverName }: { serverName: string } = $props()

  let worlds = $state<WorldInfo[]>([])
  let loading = $state(true)
  let error = $state('')

  onMount(async () => {
    try {
      worlds = await getServerWorlds(serverName)
      error = ''
    } catch {
      error = "Couldn't reach the panel backend."
    } finally {
      loading = false
    }
  })

  const fmtSize = (n: number) =>
    n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(0)} MB` : `${Math.round(n / 1e3)} KB`
  const label = (n: string) => (n.includes('nether') ? 'Nether' : n.includes('end') ? 'The End' : 'Overworld')
</script>

<div class="page-head">
  <div>
    <h1>Worlds</h1>
    <p class="sub">World folders on disk for {serverName}</p>
  </div>
  <span class="pill">{worlds.length} folder{worlds.length === 1 ? '' : 's'}</span>
</div>

{#if error}
  <p class="hint err">{error}</p>
{/if}

{#if loading}
  <div class="world-grid">
    {#each Array(3) as _, i (i)}
      <div class="card pad"><div class="skeleton sk-line" style="width: 60%"></div></div>
    {/each}
  </div>
{:else if worlds.length === 0}
  <div class="card pad">
    <p class="hint">No world folders yet — start the server once and it generates the overworld.</p>
  </div>
{:else}
  <div class="world-grid">
    {#each worlds as w (w.name)}
      <div class="card pad">
        <div class="world-row">
          <iconify-icon icon="pixelarticons:earth" width="20"></iconify-icon>
          <div>
            <div class="world-name">{w.name}</div>
            <div class="world-kind">{label(w.name)} · {fmtSize(w.size)}</div>
          </div>
        </div>
      </div>
    {/each}
  </div>
  <p class="hint">Modern Minecraft keeps the Nether and End inside each world folder as dimensions.</p>
{/if}
