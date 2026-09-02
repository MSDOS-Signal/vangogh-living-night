import * as THREE from 'three'
import { QUALITY_PRESETS, type Quality } from '../state/store'
import type { SharedUniforms } from './VortexEffect'
import type { SceneLayer } from './SceneManager'
import quadVert from '../shaders/quad.vert?raw'
import skyFragRaw from '../shaders/sky.frag?raw'
import noiseGlsl from '../shaders/noise.glsl?raw'

export interface SkyMask {
  texture: THREE.DataTexture
  /** mask samples row-major, row 0 = image TOP, 0..255 */
  data: Uint8Array
  width: number
  height: number
  /** sample mask in uv space (y up). returns 0..1 */
  sample(u: number, v: number): number
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/**
 * Automatically derives the sky mask from the photograph:
 * the sky is luminous (galaxies, stars, twilight), the land is a dark
 * silhouette with small point lights. Luminance threshold + separable
 * box blur kills the town-light speckles while keeping the sky region.
 */
export function generateSkyMask(img: HTMLImageElement): SkyMask {
  const W = 192
  const H = Math.max(2, Math.round((W * img.naturalHeight) / img.naturalWidth))
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const ctx = cv.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, W, H)
  const px = ctx.getImageData(0, 0, W, H).data

  // 1) luminance threshold
  let field = new Float32Array(W * H)
  for (let i = 0; i < W * H; i++) {
    const r = px[i * 4] / 255
    const g = px[i * 4 + 1] / 255
    const b = px[i * 4 + 2] / 255
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
    field[i] = smoothstep(0.10, 0.30, lum)
  }

  // 2) separable box blur ×2 — removes isolated bright specks (town lights)
  const blur = (src: Float32Array, radius: number) => {
    const tmp = new Float32Array(W * H)
    const out = new Float32Array(W * H)
    const norm = 1 / (radius * 2 + 1)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let s = 0
        for (let k = -radius; k <= radius; k++) {
          s += src[y * W + Math.min(W - 1, Math.max(0, x + k))]
        }
        tmp[y * W + x] = s * norm
      }
    }
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let s = 0
        for (let k = -radius; k <= radius; k++) {
          s += tmp[Math.min(H - 1, Math.max(0, y + k)) * W + x]
        }
        out[y * W + x] = s * norm
      }
    }
    return out
  }
  field = blur(field, 2)
  field = blur(field, 2)

  // 3) feather edges, force bottom strip to ground
  const data = new Uint8Array(W * H)
  for (let y = 0; y < H; y++) {
    const rowFade = smoothstep(0.0, 0.10, y / H) // y=0 is image TOP → keep sky
    for (let x = 0; x < W; x++) {
      const v = smoothstep(0.35, 0.62, field[y * W + x]) * rowFade
      data[y * W + x] = Math.round(v * 255)
    }
  }

  // DataTexture rows must be bottom-up: flip while copying
  const flipped = new Uint8Array(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      flipped[(H - 1 - y) * W + x] = data[y * W + x]
    }
  }

  const texture = new THREE.DataTexture(flipped, W, H, THREE.RedFormat)
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.needsUpdate = true

  return {
    texture,
    data,
    width: W,
    height: H,
    sample(u: number, v: number) {
      const x = Math.min(W - 1, Math.max(0, Math.round(u * (W - 1))))
      const yImg = Math.min(H - 1, Math.max(0, Math.round((1 - v) * (H - 1))))
      return data[yImg * W + x] / 255
    },
  }
}

/**
 * Opaque fullscreen composite: real photograph ground + procedural
 * Van Gogh sky, blended through the mask.
 */
export class SkyPlane implements SceneLayer {
  readonly mesh: THREE.Mesh
  readonly material: THREE.ShaderMaterial

  constructor(photo: HTMLImageElement, mask: THREE.Texture, shared: SharedUniforms) {
    const photoTex = new THREE.Texture(photo)
    photoTex.colorSpace = THREE.SRGBColorSpace
    photoTex.needsUpdate = true

    this.material = new THREE.ShaderMaterial({
      vertexShader: quadVert,
      fragmentShader: noiseGlsl + skyFragRaw,
      uniforms: {
        ...shared,
        uPhoto: { value: photoTex },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uStarGlow: { value: 0.85 },
      },
      defines: { OCTAVES: QUALITY_PRESETS.HIGH.octaves },
      depthTest: false,
      depthWrite: false,
    })

    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material)
    this.mesh.frustumCulled = false
  }

  update(_dt: number) {
    // all animation flows through shared uniforms
  }

  setQuality(q: Quality) {
    const oct = QUALITY_PRESETS[q].octaves
    if (this.material.defines.OCTAVES !== oct) {
      this.material.defines.OCTAVES = oct
      this.material.needsUpdate = true
    }
  }

  resize(w: number, h: number) {
    ;(this.material.uniforms.uResolution.value as THREE.Vector2).set(w, h)
  }
}
