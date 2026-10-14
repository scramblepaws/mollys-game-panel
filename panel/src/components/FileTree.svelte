<script lang="ts">
  import { listServerFiles } from '../lib/api'
  import type { FileEntry } from '../lib/api'
  import FileTree from './FileTree.svelte'

  let {
    serverName,
    entries,
    base = '',
    depth = 0,
    onopen
  }: {
    serverName: string
    entries: FileEntry[]
    base?: string
    depth?: number
    onopen: (path: string) => void
  } = $props()

  let children = $state<Record<string, FileEntry[]>>({})
  let open = $state<Record<string, boolean>>({})

  const fmtSize = (n: number) => (n >= 1024 * 1024 ? `${(n / (1024 * 1024)).toFixed(1)} MB` : n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`)

  function full(e: FileEntry) {
    return base ? `${base}/${e.name}` : e.name
  }

  async function toggle(e: FileEntry) {
    const f = full(e)
    open = { ...open, [f]: !open[f] }
    if (!children[f]) {
      try {
        const j = await listServerFiles(serverName, f)
        children = { ...children, [f]: j.entries }
      } catch {}
    }
  }

  function click(e: FileEntry) {
    if (e.dir) void toggle(e)
    else onopen(full(e))
  }
</script>

{#each entries as e (e.name)}
  <div>
    <button class="ft-item" style={`padding-left: ${depth * 14 + 8}px`} onclick={() => click(e)}>
      <iconify-icon
        icon={e.dir ? 'pixelarticons:folder' : 'pixelarticons:file'}
        width="14"
      ></iconify-icon>
      <span class="ft-name">{e.name}</span>
      {#if !e.dir && e.size > 0}
        <span class="ft-size">{fmtSize(e.size)}</span>
      {/if}
    </button>
    {#if e.dir && open[full(e)] && children[full(e)]}
      <FileTree
        {serverName}
        entries={children[full(e)]}
        base={full(e)}
        depth={depth + 1}
        {onopen}
      />
    {/if}
  </div>
{/each}
