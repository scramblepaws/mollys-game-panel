<script lang="ts">
  import { onMount } from 'svelte'
  import { getConsole } from '../lib/api'
  import type { ConsoleLine } from '../lib/types'

  let lines: ConsoleLine[] = $state([])

  onMount(async () => {
    lines = await getConsole()
  })
</script>

<div class="page-head">
  <div>
    <h1>Console</h1>
    <p class="sub">Live server output · stdin + RCON wiring in M3</p>
  </div>
  <span class="pill">M3</span>
</div>

<div class="card console">
  <div class="console-body">
    {#each lines as l}
      <div class="cline {l.level}"><span class="t">{l.time}</span><span>{l.text}</span></div>
    {/each}
  </div>
  <div class="console-input">
    <input placeholder="Send a command to the server… (M3)" disabled />
    <button class="btn btn-primary" disabled>
      <iconify-icon icon="pixelarticons:send" width="15"></iconify-icon> Send
    </button>
  </div>
</div>
