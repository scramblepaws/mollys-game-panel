<script lang="ts">
  import { onMount } from 'svelte'
  import { listServerFiles, readServerFile, saveServerFile } from '../lib/api'
  import type { FileEntry } from '../lib/api'
  import FileTree from '../components/FileTree.svelte'

  let { serverName }: { serverName: string } = $props()

  let root = $state<FileEntry[]>([])
  let treeError = $state('')
  let selected = $state('')
  let content = $state('')
  let original = $state('')
  let loading = $state(false)
  let saving = $state(false)
  let openError = $state('')
  let saveMsg = $state('')
  let saveErr = $state('')
  let gutter: HTMLDivElement | null = $state(null)
  let ta: HTMLTextAreaElement | null = $state(null)

  const dirty = $derived(content !== original)
  const lineNumbers = $derived(Array.from({ length: content.split('\n').length }, (_, i) => i + 1).join('\n'))

  function syncScroll(e: Event) {
    const t = e.currentTarget as HTMLTextAreaElement
    if (gutter) gutter.scrollTop = t.scrollTop
  }

  async function loadRoot() {
    try {
      const j = await listServerFiles(serverName)
      root = j.entries
      treeError = ''
    } catch (e) {
      treeError = e instanceof Error ? e.message : 'Could not list files.'
    }
  }

  onMount(() => void loadRoot())

  async function open(path: string) {
    if (dirty && !window.confirm('Discard unsaved changes?')) return
    loading = true
    openError = ''
    saveMsg = ''
    saveErr = ''
    try {
      const j = await readServerFile(serverName, path)
      selected = path
      content = j.content
      original = j.content
      if (ta) ta.scrollTop = 0
      if (gutter) gutter.scrollTop = 0
    } catch (e) {
      openError = e instanceof Error ? e.message : 'Could not open file.'
    } finally {
      loading = false
    }
  }

  async function save() {
    if (!selected || saving) return
    saving = true
    saveErr = ''
    saveMsg = ''
    try {
      await saveServerFile(serverName, selected, content)
      original = content
      saveMsg = 'Saved.'
    } catch (e) {
      saveErr = e instanceof Error ? e.message : 'Save failed.'
    } finally {
      saving = false
    }
  }

  function onKey(e: KeyboardEvent) {
    if (e.ctrlKey && e.key.toLowerCase() === 's') {
      e.preventDefault()
      if (dirty) void save()
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="page-head">
  <div>
    <h1>Files</h1>
    <p class="sub">{serverName} · browse and edit server files</p>
  </div>
  <button class="btn btn-ghost sm" onclick={loadRoot}>
    <iconify-icon icon="pixelarticons:reload" width="14"></iconify-icon> Refresh
  </button>
</div>

<div class="files">
  <div class="card ftree">
    {#if treeError}
      <p class="hint err">{treeError}</p>
    {/if}
    {#if !treeError && root.length === 0}
      <p class="hint">This folder is empty.</p>
    {/if}
    <FileTree {serverName} entries={root} onopen={open} />
  </div>

  <div class="card feditor">
    {#if selected}
      <div class="fed-head">
        <span class="mono">{selected}{#if dirty} · unsaved{/if}</span>
        <button class="btn btn-primary sm" onclick={save} disabled={!dirty || saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      {#if openError}
        <p class="hint err fed-note">{openError}</p>
      {/if}
      {#if saveMsg}
        <p class="hint good fed-note">{saveMsg}</p>
      {/if}
      {#if saveErr}
        <p class="hint err fed-note">{saveErr}</p>
      {/if}
      {#if loading}
        <div class="fed-empty"><p class="hint">Loading…</p></div>
      {:else}
        <div class="fed-edit">
          <div class="fed-gutter" bind:this={gutter} aria-hidden="true">
            <pre>{lineNumbers}</pre>
          </div>
          <textarea class="fed-text" bind:this={ta} bind:value={content} spellcheck="false" onscroll={syncScroll}></textarea>
        </div>
      {/if}
    {:else}
      <div class="fed-empty">
        <iconify-icon icon="pixelarticons:file" width="28"></iconify-icon>
        <p class="hint">Pick a file from the tree to edit it.<br />Save with Ctrl+S.</p>
      </div>
    {/if}
  </div>
</div>
