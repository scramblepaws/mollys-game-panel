<script lang="ts">
  import { getShopDetail, installProject, searchShop } from '../lib/api'
  import type { ShopDetail, ShopItem } from '../lib/types'
  import { MC_VERSION } from '../lib/config'
  import { fade } from 'svelte/transition'
  import { popIn, popOut } from '../lib/transitions'

  type Filter = 'any' | 'plugin' | 'datapack'

  let { serverName }: { serverName: string } = $props()

  let query = $state('')
  let filter = $state<Filter>('any')
  let items: ShopItem[] = $state([])
  let loading = $state(false)
  let error = $state('')

  let openItem = $state<ShopItem | null>(null)
  let detail = $state<ShopDetail | null>(null)
  let detailLoading = $state(false)
  let detailError = $state('')
  let media = $state(0)
  let zoom = $state(false)
  let installing = $state(false)
  let installMsg = $state('')
  let installErr = $state('')

  let seq = 0
  let detailSeq = 0

  $effect(() => {
    const q = query
    const t = filter
    const id = setTimeout(() => void load(q, t), 250)
    return () => clearTimeout(id)
  })

  async function load(q: string, t: Filter) {
    const id = ++seq
    loading = true
    error = ''
    try {
      const res = await searchShop(q, t)
      if (id !== seq) return
      items = res
    } catch {
      if (id !== seq) return
      error = "Couldn't reach Modrinth — is the backend running? (npm run server)"
    } finally {
      if (id === seq) loading = false
    }
  }

  function openDetail(item: ShopItem) {
    openItem = item
    detail = null
    detailError = ''
    detailLoading = true
    media = 0
    zoom = false
    const id = ++detailSeq
    getShopDetail(item.slug)
      .then((d) => {
        if (id === detailSeq) detail = d
      })
      .catch(() => {
        if (id === detailSeq) detailError = "Couldn't load this project from Modrinth."
      })
      .finally(() => {
        if (id === detailSeq) detailLoading = false
      })
  }

  function step(dir: number) {
    if (!detail || detail.gallery.length === 0) return
    media = (media + dir + detail.gallery.length) % detail.gallery.length
  }

  function closeDetail() {
    zoom = false
    openItem = null
    installMsg = ''
    installErr = ''
  }

  async function install() {
    if (!detail || !openItem) return
    installing = true
    installMsg = ''
    installErr = ''
    try {
      const r = await installProject(serverName, detail.slug, openItem.type)
      installMsg = `Installed ${r.file} to ${serverName}`
    } catch (e) {
      installErr = e instanceof Error ? e.message : 'Install failed.'
    } finally {
      installing = false
    }
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (zoom) zoom = false
      else closeDetail()
      return
    }
    if (zoom && e.key === 'ArrowLeft') step(-1)
    if (zoom && e.key === 'ArrowRight') step(1)
  }

  const fmt = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : String(n)
  const date = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
</script>

<svelte:window onkeydown={onKey} />

<div class="page-head">
  <div>
    <h1>Plugin &amp; Datapack Shop</h1>
    <p class="sub">Live from the Modrinth API · filtered to Paper {MC_VERSION}</p>
  </div>
  <span class="pill">Install in M6</span>
</div>

<div class="toolbar">
  <label class="search">
    <iconify-icon icon="pixelarticons:search" width="16"></iconify-icon>
    <input placeholder="Search plugins and datapacks…" bind:value={query} />
  </label>
  <div class="seg">
    <button class="pill" class:pill-pink={filter === 'any'} onclick={() => (filter = 'any')}>All</button>
    <button class="pill" class:pill-pink={filter === 'plugin'} onclick={() => (filter = 'plugin')}>Plugins</button>
    <button class="pill" class:pill-pink={filter === 'datapack'} onclick={() => (filter = 'datapack')}
      >Datapacks</button
    >
  </div>
</div>

{#if error}
  <div class="card pad"><p class="hint">{error}</p></div>
{:else if items.length === 0}
  <div class="card pad">
    <p class="hint">{loading ? 'Searching Modrinth…' : 'Nothing found — try another search or filter.'}</p>
  </div>
{:else}
  <div class="shop-grid" class:dim={loading}>
    {#each items as item (item.slug)}
      <div
        class="card shop-card"
        role="button"
        tabindex="0"
        onclick={() => openDetail(item)}
        onkeydown={(e) => e.key === 'Enter' && openDetail(item)}
      >
        {#if item.icon}
          <div class="shop-banner"><img src={item.icon} alt="" /></div>
        {:else}
          <div class="shop-banner shop-banner-fallback">
            <iconify-icon
              icon={item.type === 'plugin' ? 'pixelarticons:plug' : 'pixelarticons:package'}
              width="32"
            ></iconify-icon>
          </div>
        {/if}
        <div class="shop-title-row">
          <span class="shop-name">{item.title}</span>
          <span class="pill">{item.type}</span>
        </div>
        <p class="shop-desc">{item.description}</p>
        <div class="shop-foot">
          <span class="shop-dl">{fmt(item.downloads)} downloads</span>
          <span class="shop-open"><iconify-icon icon="pixelarticons:chevron-right" width="16"></iconify-icon></span>
        </div>
      </div>
    {/each}
  </div>
{/if}

{#if openItem}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="modal-backdrop"
    role="presentation"
    transition:fade={{ duration: 140 }}
    onclick={(e) => e.target === e.currentTarget && closeDetail()}
  >
    <div class="detail" role="dialog" tabindex="-1" aria-modal="true" aria-label={openItem.title} in:popIn out:popOut>
      <button class="modal-close" onclick={closeDetail} aria-label="Close">
        <iconify-icon icon="pixelarticons:close" width="18"></iconify-icon>
      </button>

      {#if detailLoading}
        <div class="detail-top">
          <div class="skeleton" style="height: 118px; border-radius: 14px;"></div>
          <div class="skeleton sk-icon"></div>
        </div>
        <div class="detail-bottom">
          <div class="detail-info">
            <div class="skeleton sk-line" style="width: 88%"></div>
            <div class="skeleton sk-line" style="width: 70%"></div>
            <div class="skeleton sk-line" style="width: 80%"></div>
            <div class="skeleton sk-line" style="width: 52%"></div>
          </div>
          <div class="media">
            <div class="skeleton" style="height: 240px; border-radius: 14px;"></div>
            <div class="media-strip">
              <div class="skeleton" style="width: 84px; height: 47px; border-radius: 8px;"></div>
              <div class="skeleton" style="width: 84px; height: 47px; border-radius: 8px;"></div>
              <div class="skeleton" style="width: 84px; height: 47px; border-radius: 8px;"></div>
              <div class="skeleton" style="width: 84px; height: 47px; border-radius: 8px;"></div>
            </div>
          </div>
        </div>
      {:else if detailError}
        <p class="hint">{detailError}</p>
      {:else if detail}
        <div class="detail-top">
          <span class="detail-icon">
            {#if detail.icon}
              <img src={detail.icon} alt="" />
            {:else}
              <iconify-icon
                icon={openItem.type === 'plugin' ? 'pixelarticons:plug' : 'pixelarticons:package'}
                width="30"
              ></iconify-icon>
            {/if}
          </span>
          <div class="detail-banner">
            {#if detail.gallery.length > 0}
              <img src={detail.gallery[0].url} alt={detail.gallery[0].title || detail.title} />
            {:else}
              <div class="detail-banner-fallback"></div>
            {/if}
            <div class="detail-banner-title">
              <span class="detail-title">{detail.title}</span>
              <span class="pill">{openItem.type}</span>
            </div>
          </div>
        </div>

        <div class="detail-bottom">
          <div class="detail-info">
            <p class="detail-desc">{detail.description}</p>
            <div class="detail-meta">
              <span><span class="lbl">Author</span><b>{detail.author ?? '—'}</b></span>
              <span><span class="lbl">Downloads</span><b>{fmt(detail.downloads)}</b></span>
              <span><span class="lbl">Followers</span><b>{fmt(detail.followers)}</b></span>
              <span><span class="lbl">Updated</span><b>{date(detail.updated)}</b></span>
              <span><span class="lbl">License</span><b>{detail.license || '—'}</b></span>
            </div>
            <div class="detail-tags">
              {#each [...detail.categories, ...detail.loaders].slice(0, 8) as c (c)}
                <span class="pill">{c}</span>
              {/each}
            </div>
            <div class="detail-actions">
              <button class="btn btn-primary sm" disabled={installing} onclick={install}>
                <iconify-icon icon="pixelarticons:download" width="14"></iconify-icon>
                {installing ? 'Installing…' : `Install to ${serverName}`}
              </button>
              <a
                class="btn btn-ghost sm"
                href={`https://modrinth.com/project/${detail.slug}`}
                target="_blank"
                rel="noreferrer"
              >
                <iconify-icon icon="pixelarticons:external-link" width="14"></iconify-icon> Modrinth
              </a>
              {#if installMsg}<span class="hint good">{installMsg}</span>{/if}
              {#if installErr}<span class="hint err">{installErr}</span>{/if}
            </div>
          </div>

          {#if detail.gallery.length === 0}
            <div class="detail-gallery-missing">
              <div class="skeleton sk-line" style="width: 30%"></div>
              <iconify-icon icon="pixelarticons:image" width="22"></iconify-icon>
              <span>No gallery images</span>
              <div class="skeleton sk-line" style="width: 44%"></div>
            </div>
          {:else}
            <div class="media">
              <button class="media-main" onclick={() => (zoom = true)} aria-label="View larger">
                <img
                  src={detail.gallery[media]?.url ?? detail.gallery[0].url}
                  alt={detail.gallery[media]?.title || detail.title}
                />
              </button>
              {#if detail.gallery.length > 1}
                <div class="media-strip">
                  <button class="media-arrow" onclick={() => step(-1)} aria-label="Previous image">
                    <iconify-icon icon="pixelarticons:chevron-left" width="16"></iconify-icon>
                  </button>
                  <div class="media-thumbs">
                    {#each detail.gallery as g, i (g.url)}
                      <button
                        class:active={i === media}
                        onclick={() => (media = i)}
                        aria-label={`View image ${i + 1}`}
                        aria-pressed={i === media}
                      >
                        <img src={g.url} alt="" loading="lazy" />
                      </button>
                    {/each}
                  </div>
                  <button class="media-arrow" onclick={() => step(1)} aria-label="Next image">
                    <iconify-icon icon="pixelarticons:chevron-right" width="16"></iconify-icon>
                  </button>
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/if}
    </div>

    {#if zoom && detail && detail.gallery[media]}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div
        class="lightbox"
        role="presentation"
        transition:fade={{ duration: 140 }}
        onclick={(e) => e.target === e.currentTarget && (zoom = false)}
      >
        <button class="lightbox-close" onclick={() => (zoom = false)} aria-label="Close preview">
          <iconify-icon icon="pixelarticons:close" width="20"></iconify-icon>
        </button>
        {#if detail.gallery.length > 1}
          <button class="lightbox-arrow prev" onclick={() => step(-1)} aria-label="Previous image">
            <iconify-icon icon="pixelarticons:chevron-left" width="22"></iconify-icon>
          </button>
          <button class="lightbox-arrow next" onclick={() => step(1)} aria-label="Next image">
            <iconify-icon icon="pixelarticons:chevron-right" width="22"></iconify-icon>
          </button>
        {/if}
        <img
          src={detail.gallery[media].url}
          alt={detail.gallery[media].title || detail.title}
          in:popIn
          out:popOut
        />
        {#if detail.gallery.length > 1}
          <span class="lightbox-count">{media + 1} / {detail.gallery.length}</span>
        {/if}
      </div>
    {/if}
  </div>
{/if}
