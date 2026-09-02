import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import type { Quality } from '../state/store'

/**
 * Cinematic final pass: restrained chromatic aberration (radial),
 * vignette, animated film grain and a gentle filmic curve.
 */
const FinalGradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uGrain: { value: 0.05 },
    uVignette: { value: 0.34 },
    uCA: { value: 0.0016 },
    uSat: { value: 1.16 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uGrain;
    uniform float uVignette;
    uniform float uCA;
    uniform float uSat;
    varying vec2 vUv;

    void main() {
      vec2 d = vUv - 0.5;
      float r2 = dot(d, d);

      // radial chromatic aberration, subtle, grows toward corners
      vec2 off = d * uCA * (0.35 + r2 * 2.2);
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - off).b;

      // gentle saturation lift — enriches the blues/golds, leaves near-white untouched
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSat);

      // vignette
      col *= 1.0 - uVignette * smoothstep(0.30, 0.92, length(d) * 1.18);

      // animated film grain
      float g = fract(sin(dot(vUv * uResolution + fract(uTime) * 911.0,
                              vec2(12.9898, 78.233))) * 43758.5453);
      col += (g - 0.5) * uGrain;

      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }
  `,
}

export class PostProcessing {
  readonly composer: EffectComposer
  private bloom: UnrealBloomPass
  private finalPass: ShaderPass
  private time = 0

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    this.composer = new EffectComposer(renderer)
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.52, 0.62, 0.72)
    this.finalPass = new ShaderPass(FinalGradeShader)
    this.composer.addPass(new RenderPass(scene, camera))
    this.composer.addPass(this.bloom)
    this.composer.addPass(this.finalPass)
    this.composer.addPass(new OutputPass())
  }

  setQuality(q: Quality) {
    switch (q) {
      case 'LOW':
        this.bloom.enabled = false
        this.finalPass.uniforms.uGrain.value = 0.04
        this.finalPass.uniforms.uCA.value = 0.0010
        break
      case 'MEDIUM':
        this.bloom.enabled = true
        this.bloom.strength = 0.45
        this.finalPass.uniforms.uGrain.value = 0.045
        this.finalPass.uniforms.uCA.value = 0.0013
        break
      case 'HIGH':
        this.bloom.enabled = true
        this.bloom.strength = 0.52
        this.finalPass.uniforms.uGrain.value = 0.05
        this.finalPass.uniforms.uCA.value = 0.0016
        break
      case 'ULTRA':
        this.bloom.enabled = true
        this.bloom.strength = 0.58
        this.bloom.radius = 0.7
        this.finalPass.uniforms.uGrain.value = 0.055
        this.finalPass.uniforms.uCA.value = 0.0018
        break
    }
  }

  update(dt: number) {
    this.time += dt
    this.finalPass.uniforms.uTime.value = this.time
  }

  resize(w: number, h: number) {
    this.composer.setSize(w, h)
    this.bloom.setSize(w, h)
    ;(this.finalPass.uniforms.uResolution.value as THREE.Vector2).set(
      Math.max(1, w),
      Math.max(1, h),
    )
  }

  dispose() {
    for (const p of this.composer.passes) p.dispose?.()
    this.composer.dispose?.()
  }
}
