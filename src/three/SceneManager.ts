import * as THREE from 'three'
import { store, QUALITY_PRESETS, type Quality } from '../state/store'
import { VortexEffect } from './VortexEffect'
import { PostProcessing } from './PostProcessing'
import { generateSkyMask, SkyPlane, type SkyMask } from './SkyShader'
import { CloudPlane } from './CloudLayer'
import { StarField } from './StarField'
import quadVert from '../shaders/quad.vert?raw'
import vortexFragRaw from '../shaders/vortex.frag?raw'
import noiseGlsl from '../shaders/noise.glsl?raw'

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

export interface SceneLayer {
  update(dt: number): void
  setQuality(q: Quality): void
  resize?(w: number, h: number, pixelRatio: number): void
}

/**
 * Owns renderer, camera, the layer stack, post-processing and the frame loop.
 *
 * Layer order (depth test off, fullscreen ortho):
 *   renderOrder 0 — SkyPlane   (opaque: real photo + procedural sky composite)
 *   renderOrder 1 — CloudPlane (additive golden nebula)
 *   renderOrder 2 — VortexPlane(additive spiral arms + shockwave)
 *   renderOrder 3 — StarField  (additive GPU particles)
 */
export class SceneManager {
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10)
  readonly vortex = new VortexEffect()
  readonly post: PostProcessing
  readonly skyMask: SkyMask

  private clock = new THREE.Clock()
  private layers: SceneLayer[] = []
  private raf = 0
  private disposed = false
  private frameCount = 0
  private fpsAccum = 0
  private lowFpsTime = 0
  private introDone = false
  private firstFrameCb: (() => void) | null = null

  constructor(canvas: HTMLCanvasElement, photo: HTMLImageElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
    })
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    this.renderer.setClearColor(0x000000, 1)

    // ---- sky mask from the photograph (bright sky vs dark land) ----
    this.skyMask = generateSkyMask(photo)
    this.vortex.uniforms.uMask.value = this.skyMask.texture

    // ---- layers ----
    const sky = new SkyPlane(photo, this.skyMask.texture, this.vortex.uniforms)
    const clouds = new CloudPlane(this.vortex.uniforms)
    const vortexPlane = this.buildVortexPlane()
    const stars = new StarField(this.vortex.uniforms, this.skyMask)

    sky.mesh.renderOrder = 0
    clouds.mesh.renderOrder = 1
    vortexPlane.renderOrder = 2
    stars.points.renderOrder = 3

    this.scene.add(sky.mesh, clouds.mesh, vortexPlane, stars.points)
    this.layers = [sky, clouds, stars]

    this.post = new PostProcessing(this.renderer, this.scene, this.camera)

    this.applyQuality(store.perf.quality)
    this.resize()
    window.addEventListener('resize', this.resize)
  }

  private buildVortexPlane(): THREE.Mesh {
    const material = new THREE.ShaderMaterial({
      vertexShader: quadVert,
      fragmentShader: noiseGlsl + vortexFragRaw,
      uniforms: {
        ...this.vortex.uniforms,
        uOpacity: { value: 0.9 },
      },
      defines: { OCTAVES: QUALITY_PRESETS[store.perf.quality].octaves },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
    })
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material)
    mesh.frustumCulled = false
    return mesh
  }

  onFirstFrame(cb: () => void) {
    this.firstFrameCb = cb
  }

  start() {
    const loop = () => {
      if (this.disposed) return
      this.raf = requestAnimationFrame(loop)
      this.tick()
    }
    this.raf = requestAnimationFrame(loop)
  }

  private tick() {
    const dt = clamp(this.clock.getDelta(), 0.001, 0.05)
    const params = store.params

    // ---- FPS meter + adaptive quality ----
    this.frameCount++
    this.fpsAccum += dt
    if (this.fpsAccum >= 0.5) {
      const fps = this.frameCount / this.fpsAccum
      store.perf.fps = Math.round(fps)
      this.frameCount = 0
      this.fpsAccum = 0
      if (store.perf.autoQuality && this.introDone) {
        if (fps < 40) {
          this.lowFpsTime += 0.5
          if (this.lowFpsTime >= 2.5) {
            this.lowFpsTime = 0
            this.downgradeQuality()
          }
        } else {
          this.lowFpsTime = 0
        }
      }
    }

    this.vortex.setAspect(window.innerWidth / Math.max(window.innerHeight, 1))
    this.vortex.update(dt, params)
    this.vortex.writeBack(params)

    for (const l of this.layers) l.update(dt)
    this.post.update(dt)
    this.post.composer.render()

    if (!this.introDone) {
      this.introDone = true
      this.firstFrameCb?.()
      this.firstFrameCb = null
    }
  }

  private downgradeQuality() {
    const order: Quality[] = ['ULTRA', 'HIGH', 'MEDIUM', 'LOW']
    const i = order.indexOf(store.perf.quality)
    if (i < order.length - 1) this.applyQuality(order[i + 1])
  }

  applyQuality(quality: Quality) {
    const preset = QUALITY_PRESETS[quality]
    store.perf.quality = quality
    store.perf.starCount = preset.stars
    for (const l of this.layers) l.setQuality(quality)
    // vortex plane octaves
    const vortexMesh = this.scene.children.find(
      (c) => (c as THREE.Mesh).renderOrder === 2,
    ) as THREE.Mesh | undefined
    const vm = vortexMesh?.material as THREE.ShaderMaterial | undefined
    if (vm && vm.defines.OCTAVES !== preset.octaves) {
      vm.defines.OCTAVES = preset.octaves
      vm.needsUpdate = true
    }
    this.post.setQuality(quality)
    this.resize()
  }

  /** Star count override from the control panel. */
  setStarCount(count: number) {
    store.perf.starCount = clamp(Math.round(count), 1000, 12000)
    const stars = this.layers.find((l) => l instanceof StarField) as StarField | undefined
    stars?.rebuild(store.perf.starCount)
  }

  resize = () => {
    if (this.disposed) return
    const preset = QUALITY_PRESETS[store.perf.quality]
    const w = window.innerWidth
    const h = window.innerHeight
    const pr = Math.min(window.devicePixelRatio || 1, preset.pixelRatioCap)
    this.renderer.setPixelRatio(pr)
    this.renderer.setSize(w, h, false)
    this.post.resize(w, h)
    for (const l of this.layers) l.resize?.(w, h, pr)
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    window.removeEventListener('resize', this.resize)
    this.vortex.dispose()
    this.post.dispose()
    this.skyMask.texture.dispose()
    this.scene.traverse((obj) => {
      const o = obj as any
      o.geometry?.dispose?.()
      const mat = o.material
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
      else mat?.dispose?.()
    })
    this.renderer.dispose()
  }
}
