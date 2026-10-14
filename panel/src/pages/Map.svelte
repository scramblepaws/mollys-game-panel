<script lang="ts">
  const markers = [
    { name: 'Molly', x: 36, y: 46 },
    { name: 'Juniper', x: 52, y: 62 },
    { name: 'Aspen', x: 68, y: 34 },
    { name: 'Rook', x: 22, y: 70 }
  ]
</script>

<div class="page-head">
  <div>
    <h1>Map</h1>
    <p class="sub">squaremap tiles · live positions</p>
  </div>
  <span class="pill">M5</span>
</div>

<div class="card map-frame">
  <span class="pill pill-pink map-tag">
    <iconify-icon icon="pixelarticons:map-pin" width="14"></iconify-icon> Live player markers
  </span>
  {#each markers as m (m.name)}
    <div class="marker" style={`left: ${m.x}%; top: ${m.y}%`}>
      <div class="marker-avatar">
        <span class="marker-ring"></span>
        <img src={`https://mc-heads.net/avatar/${m.name}/64`} alt={`${m.name} marker`} />
      </div>
      <span class="marker-label">{m.name}</span>
    </div>
  {/each}
  <span class="map-note">Interactive Leaflet map with squaremap tiles lands in M5</span>
</div>
