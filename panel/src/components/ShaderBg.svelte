<script lang="ts">
  import { onMount } from 'svelte'

  let canvas: HTMLCanvasElement | undefined = $state()

  const VERT = `attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }`

  const FRAG = `
precision mediump float;
uniform vec2 u_res;
uniform float u_time;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = p * 2.03 + 17.0;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res.xy;
  float aspect = u_res.x / u_res.y;
  vec2 p = vec2(uv.x * aspect, uv.y) * 2.4;
  float t = u_time * 0.05;

  float n1 = fbm(p + vec2(t, -t * 0.6) + fbm(p * 1.6 + t * 0.3) * 0.9);
  float n2 = fbm(p * 1.3 + vec2(-t * 0.8, t * 0.5));

  vec3 base   = vec3(0.050, 0.027, 0.063);
  vec3 pink   = vec3(1.000, 0.373, 0.635);
  vec3 violet = vec3(0.520, 0.300, 0.950);

  vec3 col = base;
  col += pink   * pow(smoothstep(0.42, 1.0, n1), 2.6) * 0.50;
  col += violet * pow(smoothstep(0.50, 1.0, n2), 3.2) * 0.30;

  vec2 g = vec2(uv.x * aspect, uv.y);
  float d = distance(g, vec2(0.78 * aspect, 0.12));
  col *= 1.0 - clamp(d * d * 0.55, 0.0, 0.75);
  col *= 0.92 + 0.08 * noise(gl_FragCoord.xy * 0.7);

  gl_FragColor = vec4(col, 1.0);
}
`

  onMount(() => {
    const el = canvas
    if (!el) return
    const gl = el.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' })
    if (!gl) return

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)
      if (!s) return null
      gl.shaderSource(s, src)
      gl.compileShader(s)
      return s
    }

    const vs = compile(gl.VERTEX_SHADER, VERT)
    const fs = compile(gl.FRAGMENT_SHADER, FRAG)
    const prog = gl.createProgram()
    if (!vs || !fs || !prog) return
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    gl.useProgram(prog)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'p')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

    const uRes = gl.getUniformLocation(prog, 'u_res')
    const uTime = gl.getUniformLocation(prog, 'u_time')

    const dpr = Math.min(window.devicePixelRatio || 1, 1.25)
    const resize = () => {
      el.width = Math.floor(el.clientWidth * dpr)
      el.height = Math.floor(el.clientHeight * dpr)
      gl.viewport(0, 0, el.width, el.height)
    }
    resize()
    window.addEventListener('resize', resize)

    const start = performance.now()
    let raf = 0

    const render = (now: number) => {
      gl.uniform2f(uRes, el.width, el.height)
      gl.uniform1f(uTime, (now - start) / 1000)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }

    const loop = (now: number) => {
      render(now)
      raf = requestAnimationFrame(loop)
    }

    raf = requestAnimationFrame(loop)

    const onVis = () => {
      cancelAnimationFrame(raf)
      if (!document.hidden) raf = requestAnimationFrame(loop)
    }
    document.addEventListener('visibilitychange', onVis)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVis)
    }
  })
</script>

<canvas bind:this={canvas} class="shader" aria-hidden="true"></canvas>
