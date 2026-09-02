import * as THREE from 'three'
import { QUALITY_PRESETS, type Quality } from '../state/store'
import type { SharedUniforms } from './VortexEffect'
import type { SkyMask } from './SkyShader'
import type { SceneLayer } from './SceneManager'
import starsVert from '../shaders/stars.vert?raw'
import starsFrag from '../shaders/stars.frag?raw'
import noiseGlsl from '../shaders/noise.glsl?raw'

const rand = (a: number, b: number) => a + Math.random() * (b - a)

/**
 * GPU star particles (3 000 – 12 000, quality adaptive).
 * Placement is rejection-sampled against the sky mask so no particle is
 * wasted on the landscape. Motion (vortex orbits, twinkle, zoom, parallax)
 * happens entirely in the vertex shader.
 */
export class StarField implements SceneLayer {
  readonly points: THREE.Points
  readonly material: THREE.ShaderMaterial
  private geometry: THREE.BufferGeometry
  private mask: SkyMask
  private count: number

  constructor(shared: SharedUniforms, mask: SkyMask) {
    this.mask = mask
    this.count = QUALITY_PRESETS.HIGH.stars
    this.material = new THREE.ShaderMaterial({
      vertexShader: noiseGlsl + starsVert,
      fragmentShader: starsFrag,
      uniforms: {
        ...shared,
        uPixelRatio: { value: 1 },
        uInvResolution: { value: new THREE.Vector2(1, 1) },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
    })
    this.geometry = this.buildGeometry(this.count)
    this.points = new THREE.Points(this.geometry, this.material)
    this.points.frustumCulled = false
  }

  private buildGeometry(count: number): THREE.BufferGeometry {
    const positions = new Float32Array(count * 3) // dummy (shader ignores it)
    const base = new Float32Array(count * 2)
    const size = new Float32Array(count)
    const bright = new Float32Array(count)
    const phase = new Float32Array(count)
    const speed = new Float32Array(count)
    const depth = new Float32Array(count)
    const tint = new Float32Array(count)

    let placed = 0
    let guard = 0
    const maxGuard = count * 40
    while (placed < count && guard < maxGuard) {
      guard++
      const u = Math.random()
      // bias toward the upper 85% of the frame where the sky lives
      const v = 0.02 + Math.pow(Math.random(), 0.72) * 0.98
      if (this.mask.sample(u, v) < 0.55) continue

      const mag = Math.pow(Math.random(), 2.2) // few bright, many faint
      base[placed * 2] = u
      base[placed * 2 + 1] = v
      size[placed] = rand(0.9, 1.5) + mag * 2.4
      bright[placed] = 0.18 + mag * 0.95
      phase[placed] = Math.random()
      speed[placed] = rand(0.4, 2.6)
      depth[placed] = rand(0.25, 1.0)
      const tr = Math.random()
      tint[placed] = tr < 0.55 ? rand(0, 0.25) : tr < 0.85 ? rand(0.25, 0.55) : rand(0.6, 1)
      placed++
    }

    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    g.setAttribute('aBase', new THREE.BufferAttribute(base, 2))
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1))
    g.setAttribute('aBright', new THREE.BufferAttribute(bright, 1))
    g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1))
    g.setAttribute('aSpeed', new THREE.BufferAttribute(speed, 1))
    g.setAttribute('aDepth', new THREE.BufferAttribute(depth, 1))
    g.setAttribute('aTint', new THREE.BufferAttribute(tint, 1))
    g.setDrawRange(0, placed)
    return g
  }

  rebuild(count: number) {
    if (count === this.geometry.drawRange.count) return
    this.count = count
    this.geometry.dispose()
    this.geometry = this.buildGeometry(count)
    this.points.geometry = this.geometry
  }

  update(_dt: number) {}

  setQuality(q: Quality) {
    this.rebuild(QUALITY_PRESETS[q].stars)
  }

  resize(w: number, h: number, pixelRatio: number) {
    this.material.uniforms.uPixelRatio.value = pixelRatio
    ;(this.material.uniforms.uInvResolution.value as THREE.Vector2).set(
      1 / Math.max(1, w * pixelRatio),
      1 / Math.max(1, h * pixelRatio),
    )
  }
}
