<script lang="ts">
  import { onMount } from 'svelte'
  import { getMe } from '../lib/api'

  let {
    shaderOn,
    tiltOn,
    ontoggle,
    onsignout = undefined,
    popDown = false
  }: {
    shaderOn: boolean
    tiltOn: boolean
    ontoggle: (k: 'shader' | 'tilt') => void
    onsignout?: () => void
    popDown?: boolean
  } = $props()

  let me = $state('')
  let avatarFail = $state(false)
  let settingsOpen = $state(false)

  const avatar = $derived(me ? `https://mc-heads.net/avatar/${me}/144` : '')

  onMount(async () => {
    try {
      const u = await getMe()
      me = u.name
    } catch {
      me = 'user'
    }
  })
</script>

<div class="user-card">
  {#if settingsOpen}
    <div class="user-pop" class:down={popDown}>
      <label>
        <input type="checkbox" checked={shaderOn} onchange={() => ontoggle('shader')} />
        Animated background
      </label>
      <label>
        <input type="checkbox" checked={tiltOn} onchange={() => ontoggle('tilt')} />
        3D card tilt
      </label>
    </div>
  {/if}
  {#if !avatarFail}
    <img class="user-avatar" src={avatar} alt="" onerror={() => (avatarFail = true)} />
  {:else}
    <span class="user-avatar-fallback">
      <iconify-icon icon="pixelarticons:user" width="16"></iconify-icon>
    </span>
  {/if}
  <div class="user-id">
    <div class="user-name">{me || '…'}</div>
    <div class="user-role">local owner</div>
  </div>
  <button
    class="icon-btn"
    onclick={() => (settingsOpen = !settingsOpen)}
    title="Settings"
    aria-label="Settings"
  >
    <iconify-icon icon="pixelarticons:gear" width="16"></iconify-icon>
  </button>
  {#if onsignout}
    <button class="icon-btn" onclick={onsignout} title="Sign out" aria-label="Sign out">
      <iconify-icon icon="pixelarticons:logout" width="16"></iconify-icon>
    </button>
  {/if}
</div>
