<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import gsap from 'gsap'
import landscapeUrl from '../assets/landscape.jpg'
import { store, sceneManagerRef, gestureMapperRef, type Quality } from '../state/store'
import { SceneManager } from '../three/SceneManager'
import { GestureMapper } from '../gesture/GestureMapper'

const canvasRef = ref<HTMLCanvasElement | null>(null)
let sceneManager: SceneManager | null = null
let mapper: GestureMapper | null = null

/** Heuristic GPU tier from the debug renderer string + screen + memory. */
function detectInitialQuality(): Quality {
  let rendererStr = ''
  try {
    const cv = document.createElement('canvas')
    const gl = (cv.getContext('webgl2') || cv.getContext('webgl')) as WebGLRenderingContext | null
    if (gl) {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info')
      rendererStr = dbg
        ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL))
        : String(gl.getParameter(gl.RENDERER))
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
  } catch {
    /* ignore — fall back to defaults */
  }
  store.perf.gpuTier = rendererStr ? rendererStr.replace(/\s*\((.*?)\)/, '').slice(0, 42) : 'unknown'

  const weak = /SwiftShader|llvmpipe|Basic Render|Mali-4|Adreno \(TM\) [0-4]\d\d|HD Graphics [0-4]\d{3}|UHD Graphics 6\d0/i
  const strong = /RTX|Radeon RX [5-9]|Apple M[1-9]|Arc A[5-9]|RX [6-7]\d{2}|GeForce (GTX 1[6-9]|RTX)/i
  const mobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)
  const mem = ((navigator as any).deviceMemory as number | undefined) ?? 8
  const pixels = window.screen.width * window.screen.height * Math.min(window.devicePixelRatio || 1, 2) ** 2

  if (weak.test(rendererStr) || mem <= 4) return 'LOW'
  if (mobile) return 'MEDIUM'
  if (strong.test(rendererStr) && mem >= 8) return pixels > 3_500_000 ? 'HIGH' : 'ULTRA'
  return 'HIGH'
}

function loadImage(): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load landscape photograph'))
    img.src = landscapeUrl
  })
}

function onMouseMove(e: MouseEvent) {
  if (!sceneManager || !store.params.autoMode || store.hand.detected) return
  const nx = (e.clientX / window.innerWidth) * 2 - 1
  const ny = -((e.clientY / window.innerHeight) * 2 - 1)
  sceneManager.vortex.target.parallax.set(nx * 0.6, ny * 0.4)
}

function onKeyDown(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement)?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') return
  if (e.code === 'KeyC') {
    store.ui.panelOpen = !store.ui.panelOpen
  } else if (e.code === 'KeyS') {
    mapper?.triggerSupernova()
  } else if (e.code === 'KeyA' && sceneManager) {
    store.params.autoMode = !store.params.autoMode
    if (store.params.autoMode) sceneManager.vortex.relaxToAuto()
  }
}

onMounted(async () => {
  store.loadingProgress = 0.08
  store.loadingLabel = 'READING THE LANDSCAPE...'
  store.perf.quality = detectInitialQuality()

  const img = await loadImage()
  store.loadingProgress = 0.45
  store.loadingLabel = 'CARVING THE SKY MASK...'
  // yield a frame so the loading UI paints before the heavy synchronous build;
  // fall back to a timer because rAF is paused in hidden/background tabs
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 120)
    requestAnimationFrame(() => {
      clearTimeout(timer)
      resolve()
    })
  })

  sceneManager = new SceneManager(canvasRef.value!, img)
  mapper = new GestureMapper(sceneManager.vortex)
  sceneManagerRef.value = sceneManager
  gestureMapperRef.value = mapper
  ;(window as any).__starryNight = { sceneManager, mapper, store }

  store.loadingProgress = 0.72
  store.loadingLabel = 'IGNITING THE STARS...'

  sceneManager.onFirstFrame(() => {
    store.loadingProgress = 0.9
    store.loadingLabel = 'THE NIGHT IS ALIVE'
  })
  sceneManager.start()
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('keydown', onKeyDown)
})

// cinematic intro: the sky awakens slowly once loading completes
watch(
  () => store.phase,
  (phase) => {
    if (phase === 'READY' && sceneManager) {
      gsap.to(sceneManager.vortex.target, {
        skyActive: 0.85,
        duration: 5.5,
        ease: 'sine.inOut',
      })
    }
  },
)

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('keydown', onKeyDown)
  sceneManager?.dispose()
  sceneManager = null
  mapper = null
  sceneManagerRef.value = null
  gestureMapperRef.value = null
})
</script>

<template>
  <canvas ref="canvasRef" class="scene" />
</template>

<style scoped>
.scene {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  z-index: 0;
}
</style>
