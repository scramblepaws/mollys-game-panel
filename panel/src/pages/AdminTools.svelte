<script lang="ts">
  const tools = [
    { icon: 'pixelarticons:crown', name: 'OP / Deop', desc: 'Grant or revoke operator status.' },
    { icon: 'pixelarticons:user-x', name: 'Ban / Unban', desc: 'Manage the ban list with reasons.' },
    { icon: 'pixelarticons:logout', name: 'Kick', desc: 'Disconnect a player with a message.' },
    { icon: 'pixelarticons:shield', name: 'Whitelist', desc: 'Add, remove, toggle the whitelist.' },
    { icon: 'pixelarticons:gamepad', name: 'Gamemode', desc: 'Set gamemode for any player.' },
    { icon: 'pixelarticons:sun', name: 'Time', desc: 'Set day, night, or a tick count.' },
    { icon: 'pixelarticons:cloud', name: 'Weather', desc: 'Clear, rain, thunder.' },
    { icon: 'pixelarticons:siren', name: 'Difficulty', desc: 'Peaceful to hard, per world.' }
  ]
</script>

<div class="page-head">
  <div>
    <h1>Admin Tools</h1>
    <p class="sub">Everything here executes over RCON in M3</p>
  </div>
  <span class="pill">M3</span>
</div>

<div class="tools">
  {#each tools as t (t.name)}
    <div class="card tool">
      <div class="tool-top">
        <iconify-icon icon={t.icon} width="20"></iconify-icon>
        <span class="tool-name">{t.name}</span>
      </div>
      <p class="tool-desc">{t.desc}</p>
      <span class="pill">M3</span>
    </div>
  {/each}
</div>
