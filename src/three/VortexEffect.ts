import gsap from 'gsap'
import * as THREE from 'three'
import type { SceneParams } from '../state/store'

export interface SharedUniforms {
  uTime: { value: number }
  uAspect: { value: number }
  uScale: { value: number }
  uParallax: { value: THREE.Vector2 }
  uVortexCenter: { value: THREE.Vector2 }
  uVortexStrength: { value: number }
  uVortexRadius: { value: number }
  uVortexDir: { value: number }
  uFlow: { value: number }
  uSkyActive: { value: number }
  uSupernova: { value: number }
  uArtMode: { value: number }
  uMask: { value: THREE.Texture | null }
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const damp = (cur: number, target: number, lambda: number, dt: number) =>
  cur + (target - cur) * (1 - Math.exp(-lambda * dt))

/**
 * Authoritative, smoothed vortex state.
 * GestureMapper (or autonomous drift) writes loose targets; this class
 * damps them and publishes ONE shared uniform set referenced by the
 * sky / cloud / vortex / star materials.
 */
export class VortexEffect {
  readonly uniforms: SharedUniforms

  target = {
    center: new THREE.Vector2(0.5, 0.55),
    strength: 0.5,
    radius: 0.34,
    direction: 1,
    flow: 0.42,
    scale: 1,
    skyActive: 0,
    timeScale: 1,
    parallax: new THREE.Vector2(0, 0),
  }

  supernovaEnergy = 0
  private time = 0
  private aspect = 1
  private lastAutoVortex = 0
  private autoVortexTween: gsap.core.Tween | null = null
  private burst = { add: 0 }
  private pulseTween: gsap.core.Tween | null = null
  private supernovaTween: gsap.core.Tween | null = null

  constructor() {
    const u = (value: any) => ({ value })
    this.uniforms = {
      uTime: u(0),
      uAspect: u(1),
      uScale: u(1),
      uParallax: u(new THREE.Vector2()),
      uVortexCenter: u(new THREE.Vector2(0.5, 0.55)),
      uVortexStrength: u(0.5),
      uVortexRadius: u(0.34),
      uVortexDir: u(1),
      uFlow: u(0.42),
      uSkyActive: u(0),
      uSupernova: u(0),
      uArtMode: u(0),
      uMask: u(null),
    }
  }

  setAspect(a: number) {
    this.aspect = a
  }

  /** Pull targets back to calm defaults (hand lost / auto mode). */
  relaxToAuto() {
    const t = this.target
    t.strength = 0.5
    t.radius = 0.34
    t.direction = 1
    t.flow = 0.42
    t.scale = 1
    t.timeScale = 1
    t.parallax.set(0, 0)
  }

  /** One-shot supernova burst (two-hand spread / UI trigger). */
  triggerSupernova() {
    this.supernovaTween?.kill()
    this.supernovaEnergy = 1
    this.supernovaTween = gsap.to(this, {
      supernovaEnergy: 0,
      duration: 2.8,
      ease: 'power2.out',
    })
    this.burst.add = 0
    gsap.timeline()
      .to(this.burst, { add: 1.3, duration: 0.5, ease: 'power2.out' })
      .to(this.burst, { add: 0, duration: 3.5, ease: 'sine.inOut' })
  }

  /** Short directional pulse (swipe gestures). */
  pulse(dir: number) {
    this.pulseTween?.kill()
    this.target.direction = dir
    const base = this.target.strength
    this.pulseTween = gsap.timeline()
      .to(this.target, { strength: Math.min(base + 0.65, 2), duration: 0.35, ease: 'power2.out' })
      .to(this.target, { strength: base, duration: 1.4, ease: 'sine.inOut' }) as any
  }

  update(dt: number, params: SceneParams) {
    // FIST freeze: timeScale target 0 → time stops advancing smoothly
    params.timeScale = damp(params.timeScale, this.target.timeScale, 6, dt)
    this.time += dt * clamp(params.timeScale, 0, 2)

    // ---- autonomous drift (AUTO MODE): slow lissajous + 30s vortex ----
    if (params.autoMode) {
      const t = this.time
      this.target.center.x = 0.5 + 0.10 * Math.sin(t * 0.045) + 0.03 * Math.sin(t * 0.13)
      this.target.center.y = 0.55 + 0.055 * Math.cos(t * 0.037) + 0.02 * Math.cos(t * 0.11)
      if (t - this.lastAutoVortex > 30 && !params.paused) {
        this.lastAutoVortex = t
        this.autoVortexTween?.kill()
        this.autoVortexTween = gsap.timeline()
          .to(this.target, { strength: 1.15, flow: 0.8, radius: 0.42, duration: 4.5, ease: 'sine.inOut' })
          .to(this.target, { strength: 0.5, flow: 0.42, radius: 0.34, duration: 6.5, ease: 'sine.inOut' }) as any
      }
    }

    // ---- damp everything toward targets ----
    const t = this.target
    const c = this.uniforms.uVortexCenter.value as THREE.Vector2
    c.x = damp(c.x, clamp(t.center.x, 0.05, 0.95), 5.0, dt)
    c.y = damp(c.y, clamp(t.center.y, 0.10, 0.95), 5.0, dt)

    const u = this.uniforms
    u.uVortexStrength.value = damp(u.uVortexStrength.value, clamp(t.strength + this.burst.add, 0, 2.6), 4.5, dt)
    u.uVortexRadius.value = damp(u.uVortexRadius.value, clamp(t.radius, 0.05, 0.8), 4, dt)
    u.uVortexDir.value = damp(u.uVortexDir.value, clamp(t.direction, -1, 1), 3, dt)
    u.uFlow.value = damp(u.uFlow.value, clamp(t.flow, 0, 1), 4, dt)
    u.uScale.value = damp(u.uScale.value, clamp(t.scale, 0.6, 2.2), 5, dt)
    u.uSkyActive.value = clamp(damp(u.uSkyActive.value, clamp(t.skyActive, 0, 1), 2.0, dt), 0, 1)
    u.uSupernova.value = this.supernovaEnergy

    const par = u.uParallax.value as THREE.Vector2
    par.x = damp(par.x, clamp(t.parallax.x, -1, 1), 3, dt)
    par.y = damp(par.y, clamp(t.parallax.y, -1, 1), 3, dt)

    u.uTime.value = this.time
    u.uAspect.value = this.aspect
    u.uArtMode.value = params.artMode
  }

  /** Copy smoothed values back to the store for HUD readouts. */
  writeBack(params: SceneParams) {
    const c = this.uniforms.uVortexCenter.value as THREE.Vector2
    params.vortexCenter.x = c.x
    params.vortexCenter.y = c.y
    params.vortexStrength = this.uniforms.uVortexStrength.value
    params.vortexRadius = this.uniforms.uVortexRadius.value
    params.vortexDirection = this.uniforms.uVortexDir.value
    params.flow = this.uniforms.uFlow.value
    params.scale = this.uniforms.uScale.value
    params.skyActive = this.uniforms.uSkyActive.value
    params.supernova = this.supernovaEnergy
    const p = this.uniforms.uParallax.value as THREE.Vector2
    params.parallax.x = p.x
    params.parallax.y = p.y
  }

  dispose() {
    this.autoVortexTween?.kill()
    this.pulseTween?.kill()
    this.supernovaTween?.kill()
    gsap.killTweensOf(this)
    gsap.killTweensOf(this.target)
    gsap.killTweensOf(this.burst)
  }
}
