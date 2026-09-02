// ============================================================
// Vortex accent layer — luminous spiral arms + core + shockwave.
// Additive, sky-masked. This is the "living" heart of the sky.
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
uniform float uOpacity;
uniform float uSupernova;  // 1 → 0 decay, drives expanding ring
uniform float uFlow;

void main() {
  float mask = texture2D(uMask, vUv).r;
  if (mask < 0.03) discard;

  vec2 ap = vec2(uAspect, 1.0);
  vec2 p = (vUv - uVortexCenter) * ap;
  float r = length(p);
  float ang = atan(p.y, p.x);
  float rad = max(uVortexRadius, 0.0001);
  float fall = exp(-r / (rad * 0.85));

  // ---- logarithmic spiral arms, wound tighter near the core ----
  float spin = uTime * (0.25 + 0.8 * uVortexStrength) * uVortexDir;
  float arms = sin(ang * 2.0 - (r / rad) * 5.2 + spin);
  arms = pow(0.5 + 0.5 * arms, 4.5);
  float arms2 = sin(ang * 2.0 + 3.14159 - (r / rad) * 5.2 + spin * 0.8);
  arms2 = pow(0.5 + 0.5 * arms2, 6.0) * 0.6;

  // turbulent modulation flowing along the arms (polar domain warp)
  vec2 pol = vec2(cos(ang), sin(ang)) * r;
  float turb = fbm(pol * 6.0 + vec2(uTime * 0.06, -uTime * 0.04) * uVortexDir);
  float turb2 = fbm(pol * 13.0 - turb * 2.0 + uTime * 0.03);

  float armMask = (arms + arms2) * fall * (0.35 + 0.65 * clamp(turb + 0.45, 0.0, 1.0))
                * (0.25 + 0.75 * uVortexStrength);

  vec3 armCol = mix(vec3(0.32, 0.50, 1.00), vec3(1.00, 0.82, 0.44), clamp(fall * 1.2, 0.0, 1.0));

  // ---- molten core ----
  float core = exp(-r * r / (rad * rad * 0.020)) * (0.35 + 0.65 * uVortexStrength);
  float coreFlicker = 0.85 + 0.15 * sin(uTime * 2.3 + turb2 * 6.0);
  core *= coreFlicker;
  vec3 coreCol = vec3(1.00, 0.94, 0.78);

  float a = (armMask * 0.40 + core * 0.42) * uOpacity * smoothstep(0.03, 0.4, mask);
  vec3 col = armCol * armMask * 0.40 + coreCol * core * 0.42;

  // ---- supernova shockwave rings ----
  if (uSupernova > 0.001) {
    float prog = 1.0 - uSupernova;              // 0 → 1 as energy decays
    float ringR = prog * 1.45 * (0.6 + uAspect * 0.4);
    float ring = exp(-pow((r - ringR) * 8.0, 2.0)) * uSupernova;
    float ring2 = exp(-pow((r - ringR * 0.62) * 12.0, 2.0)) * uSupernova * 0.5;
    float flash = exp(-r * r / (rad * rad * 0.05)) * pow(uSupernova, 2.0);
    col += vec3(1.00, 0.90, 0.66) * (ring * 1.15 + ring2 * 0.8 + flash * 1.6);
    a += (ring * 0.85 + ring2 * 0.5 + flash * 0.9) * uOpacity * smoothstep(0.03, 0.4, mask);
  }

  gl_FragColor = vec4(col, a);
}
