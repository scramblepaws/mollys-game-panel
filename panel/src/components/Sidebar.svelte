<script lang="ts">
  import { NAV } from '../lib/nav'
  import type { PageId } from '../lib/nav'
  import UserCard from './UserCard.svelte'

  let {
    page,
    serverName,
    game,
    onleave,
    shaderOn,
    tiltOn,
    ontoggle
  }: {
    page: PageId
    serverName: string
    game: string
    onleave: () => void
    shaderOn: boolean
    tiltOn: boolean
    ontoggle: (k: 'shader' | 'tilt') => void
  } = $props()

  const items = $derived(NAV.filter((n) => n.id !== 'files' || game === 'minecraft'))
</script>

<aside>
  <button class="brand" onclick={onleave} title="Back to servers">
    <iconify-icon icon="pixelarticons:server" width="22"></iconify-icon>
    <span class="brand-name">{serverName}</span>
  </button>

  <nav>
    <button class="nav-item" onclick={onleave} title="Back to servers">
      <iconify-icon icon="pixelarticons:chevron-left" width="18"></iconify-icon>
      <span>All servers</span>
    </button>
    <div class="nav-sep"></div>
    {#each items as item (item.id)}
      <a class="nav-item" class:active={page === item.id} href={`#${item.id}`}>
        <iconify-icon icon={item.icon} width="18"></iconify-icon>
        <span>{item.label}</span>
      </a>
    {/each}
  </nav>

  <UserCard {shaderOn} {tiltOn} {ontoggle} onsignout={onleave} />
</aside>
