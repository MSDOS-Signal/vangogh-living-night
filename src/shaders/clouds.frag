// ============================================================
// Golden nebula cloud layer — additive, sky-masked.
// Clouds flow along the vortex curl field.
// (noise.glsl is prepended before compilation)
// ============================================================

varying vec2 vUv;

uniform sampler2D uMask;

uniform float uTime;
uniform float uAspect;
uniform vec2  uVortexCenter;
uniform float uVortexStrength;
uniform float uVortexRadius;
uniform float uVortexDir;
uniform float uFlow;
uniform float uScale;
uniform float uOpacity;
uniform float uSupernova;
uniform float uArtMode;

void main() {
  float mask = texture2D(uMask, vUv).r;
  if (mask < 0.03) discard;

  vec2 ap = vec2(uAspect, 1.0);
  vec2 suv = (vUv - vec2(0.5)) / max(uScale, 0.1) + vec2(0.5);

  // clouds ride a slightly faster, wider swirl than the base sky
  vec2 w = swirlWarp(suv, uVortexCenter, uVortexStrength * 1.12,
                     uVortexRadius * 1.15, uVortexDir, uAspect, uTime * 1.15);
  w += curl(w * ap * 2.1 + vec2(uTime * 0.02, -uTime * 0.013))
     * (0.05 + 0.13 * uFlow);

  float n  = fbm(w * ap * 2.7 + vec2(uTime * 0.026, -uTime * 0.010));
  float n2 = fbm(w * ap * 5.9 - n * 1.5 + vec2(-uTime * 0.015, 0.0));
  float filaments = ridgeFbm(w * ap * 3.6 + n2 * 1.1 + vec2(uTime * 0.008, 0.0));

  // stretched brush-stroke bands along the flow
  float streaks = sin((n * 4.6 + n2 * 2.2 + filaments * 1.4 + uTime * 0.10) * 3.14159);
  streaks = pow(0.5 + 0.5 * streaks, 3.2);

  // filaments (ridged, 0..1) form the cloud bodies; signed fbm adds billowing
  // detail. Remap the signed fbm to 0..1 so coverage isn't pinned near zero.
  float cov = filaments * 0.70 + clamp(n * 0.5 + 0.5, 0.0, 1.0) * 0.30;
  float cover = smoothstep(0.26, 0.70, cov) * (0.35 + 0.65 * streaks);

  vec3 gold = vec3(1.00, 0.70, 0.20);
  vec3 pale = vec3(1.00, 0.87, 0.50);
  vec3 col = mix(gold, pale, clamp(n2 * 0.55 + 0.12, 0.0, 1.0));

  // art mode tinting
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, vec3(0.35, 0.58, 1.00) * lum * 1.8,
            clamp(uArtMode, 0.0, 1.0) * clamp(2.0 - uArtMode, 0.0, 1.0) * 0.6);
  col = mix(col, vec3(1.00, 0.55, 0.24) * lum * 1.9,
            clamp(uArtMode - 1.0, 0.0, 1.0) * clamp(3.0 - uArtMode, 0.0, 1.0) * 0.6);
  col = mix(col, vec3(0.90, 0.92, 0.98) * lum * 1.4,
            clamp(uArtMode - 2.0, 0.0, 1.0) * clamp(4.0 - uArtMode, 0.0, 1.0) * 0.7);

  float a = cover * (0.34 + 0.48 * uFlow) * uOpacity * smoothstep(0.03, 0.45, mask);

  // vortex eye glow + supernova flash
  vec2 vp = (vUv - uVortexCenter) * ap;
  float vr = length(vp);
  float rad = max(uVortexRadius, 0.0001);
  a += exp(-vr * vr / (rad * rad * 0.06)) * uVortexStrength * 0.06 * uOpacity;
  a *= 1.0 + uSupernova * 1.2;
  a = clamp(a, 0.0, 1.0);
  col = mix(col, vec3(1.0, 0.92, 0.72), uSupernova * 0.5);

  gl_FragColor = vec4(col, a);
}
