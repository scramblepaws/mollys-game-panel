<script lang="ts">
  import { onMount } from 'svelte'
  import { IdleAnimation, SkinViewer } from 'skinview3d'

  let { name }: { name: string } = $props()
  let canvas: HTMLCanvasElement | undefined = $state()

  onMount(() => {
    if (!canvas) return
    const viewer = new SkinViewer({
      canvas,
      width: 240,
      height: 300,
      pixelRatio: 'match-device',
      skin: `/api/skin/${encodeURIComponent(name)}`
    })
    viewer.animation = new IdleAnimation()
    viewer.autoRotate = true
    viewer.autoRotateSpeed = 0.6
    viewer.controls.enableZoom = false
    viewer.controls.enablePan = false
    return () => viewer.dispose()
  })
</script>

<canvas bind:this={canvas}></canvas>
