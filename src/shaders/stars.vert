// GPU star particles — orbit along the vortex flow field.
// Positions are advected in the vertex shader; zero CPU cost per frame.

attribute vec2  aBase;    // home position in uv space (0..1)
attribute float aSize;    // base point size (px)
attribute float aBright;  // intrinsic brightness 0..1
attribute float aPhase;   // random phase
attribute float aSpeed;   // twinkle speed
attribute float aDepth;   // 0.25..1 — parallax depth layer
attribute float aTint;    // 0 cool blue → 1 warm gold

uniform float uTime;
uniform float uAspect;
uniform float uScale;
uniform float uPixelRatio;
uniform vec2  uVortexCenter;
uniform float uVortexStrength;
uniform float uVortexRadius;
uniform float uVortexDir;
uniform float uSupernova;
uniform vec2  uParallax;

varying float vBright;
varying float vTint;
varying float vDepth;

void main() {
  vec2 uv = aBase;

  // ---- orbit the vortex: fast near core, slow at edges ----
  vec2 p = (uv - uVortexCenter) * vec2(uAspect, 1.0);
  float r = length(p);
  float rad = max(uVortexRadius, 0.0001);
  float fall = exp(-r / rad);
  float ang = uVortexDir * uTime * (0.035 + 0.85 * uVortexStrength * fall)
            + sin(uTime * 0.13 + aPhase * 6.2831) * 0.10 * fall * uVortexDir;
  p = rot(ang) * p;
  uv = uVortexCenter + p / vec2(uAspect, 1.0);

  // ---- global zoom (pinch) ----
  uv = (uv - vec2(0.5)) / max(uScale, 0.1) + vec2(0.5);

  // ---- parallax by depth ----
  uv += uParallax * (0.005 + aDepth * 0.017);

  // ---- twinkle + supernova boost ----
  float tw = 0.55 + 0.45 * sin(uTime * aSpeed + aPhase * 6.2831);
  vBright = aBright * (0.55 + 0.65 * tw) * (1.0 + uSupernova * 1.8 * fall);
  vTint = aTint;
  vDepth = aDepth;

  gl_Position = vec4(uv * 2.0 - 1.0, 0.0, 1.0);
  float s = aSize * (0.5 + aDepth * 0.9) * mix(1.0, uScale, 0.55);
  gl_PointSize = max(s * uPixelRatio * (0.7 + 0.45 * tw), 0.7);
}
