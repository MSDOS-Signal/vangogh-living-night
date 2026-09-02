import * as THREE from 'three'
import { QUALITY_PRESETS, type Quality } from '../state/store'
import type { SharedUniforms } from './VortexEffect'
import type { SceneLayer } from './SceneManager'
import quadVert from '../shaders/quad.vert?raw'
import cloudsFragRaw from '../shaders/clouds.frag?raw'
import noiseGlsl from '../shaders/noise.glsl?raw'

/**
 * Alpha-blended golden nebula layer flowing along the vortex curl field.
 * Normal (src-alpha) blending lets saturated gold clouds replace the blue sky
 * locally instead of additively washing it toward lavender.
 */
export class CloudPlane implements SceneLayer {
  readonly mesh: THREE.Mesh
  readonly material: THREE.ShaderMaterial

  constructor(shared: SharedUniforms) {
    this.material = new THREE.ShaderMaterial({
      vertexShader: quadVert,
      fragmentShader: noiseGlsl + cloudsFragRaw,
      uniforms: {
        ...shared,
        uOpacity: { value: 1.0 },
      },
      defines: { OCTAVES: QUALITY_PRESETS.HIGH.octaves },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NormalBlending,
    })
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material)
    this.mesh.frustumCulled = false
  }

  update(_dt: number) {}

  setQuality(q: Quality) {
    const oct = QUALITY_PRESETS[q].octaves
    if (this.material.defines.OCTAVES !== oct) {
      this.material.defines.OCTAVES = oct
      this.material.needsUpdate = true
    }
  }
}
