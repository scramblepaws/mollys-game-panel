<script lang="ts">
  import { onMount } from 'svelte'
  import { getWorlds } from '../lib/api'
  import type { World } from '../lib/types'

  let worlds: World[] = $state([])

  onMount(async () => {
    worlds = await getWorlds()
  })
</script>

<div class="page-head">
  <div>
    <h1>Worlds</h1>
    <p class="sub">Two groups: survival · creative (separate inventories &amp; ender chests)</p>
  </div>
  <span class="pill">M4</span>
</div>

<div class="world-grid">
  {#each worlds as w (w.id)}
    <div class="card world-card">
      <div class="world-top">
        <span class="world-icon"><iconify-icon icon={w.icon} width="20"></iconify-icon></span>
        <div>
          <div class="world-name">{w.name}</div>
          <div class="world-kind">{w.kind}</div>
        </div>
      </div>
      <div class="world-meta">
        <span class="pill" class:pill-pink={w.difficulty === 'peaceful'}>{w.difficulty}</span>
        <span class="pill">border {w.border}</span>
      </div>
      <div class="world-stats">
        <span><b>{w.players}</b> playing</span>
        <span><b>{w.id}</b> id</span>
      </div>
      <button class="btn btn-ghost" disabled>Switch world</button>
    </div>
  {/each}
</div>
