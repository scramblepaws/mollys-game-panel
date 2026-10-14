<script lang="ts">
  import { onMount } from 'svelte'
  import { fade } from 'svelte/transition'
  import { popIn } from './lib/transitions'
  import Sidebar from './components/Sidebar.svelte'
  import ShaderBg from './components/ShaderBg.svelte'
  import Dashboard from './pages/Dashboard.svelte'
  import Servers from './pages/Servers.svelte'
  import Players from './pages/Players.svelte'
  import Worlds from './pages/Worlds.svelte'
  import Files from './pages/Files.svelte'
  import Console from './pages/Console.svelte'
  import Shop from './pages/Shop.svelte'
  import { NAV } from './lib/nav'
  import type { PageId } from './lib/nav'
  import { listServers } from './lib/api'
  import type { ServerInstance } from './lib/types'

  function fromHash(): PageId {
    const h = location.hash.slice(1)
    return NAV.some((n) => n.id === h) ? (h as PageId) : 'dashboard'
  }

  let page = $state<PageId>(fromHash())
  let server = $state<ServerInstance | null>(null)
  let shaderOn = $state(localStorage.getItem('panel.shader') !== '0')
  let tiltOn = $state(localStorage.getItem('panel.tilt') !== '0')

  window.addEventListener('hashchange', () => (page = fromHash()))

  onMount(() => {
    const saved = localStorage.getItem('panel.server')
    if (saved) {
      listServers()
        .then((list) => {
          const s = list.find((i) => i.name === saved)
          if (s) server = s
        })
        .catch(() => {})
    }
  })

  function enter(s: ServerInstance) {
    server = s
    localStorage.setItem('panel.server', s.name)
    if (page === 'files' && s.game !== 'minecraft') page = 'dashboard'
  }

  function leave() {
    server = null
    localStorage.removeItem('panel.server')
  }

  function toggleVisual(k: 'shader' | 'tilt') {
    if (k === 'shader') {
      shaderOn = !shaderOn
      localStorage.setItem('panel.shader', shaderOn ? '1' : '0')
    } else {
      tiltOn = !tiltOn
      localStorage.setItem('panel.tilt', tiltOn ? '1' : '0')
      if (!tiltOn) {
        resetCard(active)
        active = null
      }
    }
  }

  const TILT = '.card, .detail-top, .detail-info, .model-panel, .media-main, .media-thumbs button, .search, .seg button, .tab, .wiz-option:not(.game-card)'
  let active: HTMLElement | null = null

  function resetCard(el: HTMLElement | null) {
    if (!el) return
    el.style.transition = ''
    el.style.transform = ''
    el.style.willChange = ''
  }

  function tiltFor(card: HTMLElement, e: PointerEvent) {
    const r = card.getBoundingClientRect()
    const k = Math.min(1, 420 / Math.max(r.width, r.height, 1))
    const px = (e.clientX - r.left) / r.width - 0.5
    const py = (e.clientY - r.top) / r.height - 0.5
    const rx = (-py * 7 * k).toFixed(2)
    const ry = (px * 7 * k).toFixed(2)
    const lift = (4 * k).toFixed(2)
    const scale = (1 + 0.02 * k).toFixed(4)
    card.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-${lift}px) scale(${scale})`
  }

  function onMove(e: PointerEvent) {
    if (e.pointerType !== 'mouse' || !tiltOn) return
    const t = e.target as HTMLElement | null
    const card = t && typeof t.closest === 'function' ? (t.closest(TILT) as HTMLElement | null) : null

    if (!card) {
      if (active) {
        const r = active.getBoundingClientRect()
        const inside =
          e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
        if (inside) {
          tiltFor(active, e)
          return
        }
        resetCard(active)
        active = null
      }
      return
    }

    if (card !== active) {
      resetCard(active)
      active = card
      card.style.willChange = 'transform'
      card.style.transition = 'transform 80ms linear, box-shadow 0.3s, border-color 0.3s'
    }
    tiltFor(card, e)
  }

  function onOut(e: PointerEvent) {
    if (!e.relatedTarget) {
      resetCard(active)
      active = null
    }
  }
</script>

<svelte:window onpointermove={onMove} onpointerout={onOut} />

{#if shaderOn}
  <ShaderBg />
{/if}
<div class="scene-grid"></div>

{#if !server}
  <div in:fade={{ duration: 180 }}>
    <Servers onenter={enter} {shaderOn} {tiltOn} ontoggle={toggleVisual} />
  </div>
{:else}
  <div class="shell" in:fade={{ duration: 180 }}>
    <Sidebar {page} serverName={server.name} game={server.game} onleave={leave} {shaderOn} {tiltOn} ontoggle={toggleVisual} />
    <main>
      {#key page}
        <div in:popIn>
          {#if page === 'dashboard'}
            <Dashboard serverName={server.name} />
          {:else if page === 'players'}
            <Players serverName={server.name} />
          {:else if page === 'worlds'}
            <Worlds serverName={server.name} />
          {:else if page === 'files'}
            <Files serverName={server.name} />
          {:else if page === 'console'}
            <Console serverName={server.name} />
          {:else if page === 'shop'}
            <Shop serverName={server.name} />
          {/if}
        </div>
      {/key}
    </main>
  </div>
{/if}
