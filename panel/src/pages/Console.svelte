<script lang="ts">
  import { onMount } from 'svelte'
  import { getServerLogs, sendServerCommand } from '../lib/api'
  import type { ConsoleLine } from '../lib/types'

  let { serverName }: { serverName: string } = $props()

  let lines: ConsoleLine[] = $state([])
  let running = $state(false)
  let error = $state('')
  let command = $state('')
  let sending = $state(false)
  let body: HTMLDivElement | null = $state(null)
  let stick = true

  async function refresh() {
    try {
      const j = await getServerLogs(serverName)
      running = j.running
      lines = j.lines
      error = ''
    } catch {
      error = 'Could not reach the panel backend.'
    }
  }

  onMount(() => {
    void refresh()
    const t = setInterval(() => void refresh(), 2000)
    return () => clearInterval(t)
  })

  $effect(() => {
    lines
    if (body && stick) body.scrollTop = body.scrollHeight
  })

  function onScroll() {
    if (!body) return
    stick = body.scrollHeight - body.scrollTop - body.clientHeight < 40
  }

  async function send() {
    const cmd = command.trim()
    if (!cmd || sending) return
    sending = true
    try {
      await sendServerCommand(serverName, cmd)
      command = ''
      stick = true
      await refresh()
    } catch (e) {
      error = e instanceof Error ? e.message : 'Command failed.'
    } finally {
      sending = false
    }
  }
</script>

<div class="page-head">
  <div>
    <h1>Console</h1>
    <p class="sub">Live output from <b>{serverName}</b> — commands go straight to the server.</p>
  </div>
  <span class="pill" class:pill-good={running}>
    {#if running}<span class="dot-live"></span>{/if}
    {running ? 'running' : 'offline'}
  </span>
</div>

{#if error}
  <p class="hint err">{error}</p>
{/if}

<div class="card console">
  <div class="console-body" bind:this={body} onscroll={onScroll}>
    {#if lines.length === 0}
      <p class="hint">No output yet — start the server from the Servers page.</p>
    {/if}
    {#each lines as l, i (i)}
      <div class="cline {l.level}"><span class="t">{l.time}</span><span>{l.text}</span></div>
    {/each}
  </div>
  <div class="console-input">
    <input
      placeholder={running ? 'Type a command and press Enter…' : 'Start the server to send commands'}
      bind:value={command}
      disabled={!running || sending}
      onkeydown={(e) => e.key === 'Enter' && send()}
    />
    <button class="btn btn-primary" disabled={!running || sending || !command.trim()} onclick={send}>
      <iconify-icon icon="pixelarticons:send" width="15"></iconify-icon> Send
    </button>
  </div>
</div>
