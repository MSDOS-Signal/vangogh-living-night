// ============================================================
// THE LIVING NIGHT — master sky composite
// Real photographic landscape + Van Gogh procedural sky,
// blended through an auto-generated sky mask.
// (noise.glsl is prepended before compilation)
// ============================================================

varying vec2 vUv;

uniform sampler2D uPhoto;
uniform sampler2D uMask;

uniform float uTime;
uniform vec2  uResolution;
uniform float uAspect;

uniform vec2  uVortexCenter;
uniform float uVortexStrength;
uniform float uVortexRadius;
uniform float uVortexDir;

uniform float uFlow;       // 0..1 flow energy
uniform float uScale;      // pinch zoom
uniform float uSkyActive;  // 0..1 master sky activation
uniform float uArtMode;    // 0 CLASSIC / 1 AZURE / 2 EMBER / 3 NOIR
uniform float uSupernova;  // 0..1 burst energy
uniform vec2  uParallax;   // subtle camera parallax
uniform float uStarGlow;   // procedural star intensity

// --- in-shader star field (follows the swirl) ---
vec3 starLayer(vec2 p, float density, float thresh, float t, float sharp, vec3 tint) {
  vec2 g = p * density;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  float h = hash21(id);
  vec3 col = vec3(0.0);
  if (h > thresh) {
    vec2 off = vec2(hash21(id + 17.31), hash21(id + 91.77)) - 0.5;
    float d = length(f - off * 0.66);
    float tw = 0.55 + 0.45 * sin(t * (1.2 + h * 4.5) + h * 43.7);
    float star = exp(-d * d * sharp) * tw;
    float mag = (h - thresh) / (1.0 - thresh);
    col = tint * star * (0.35 + 1.15 * mag * mag);
  }
  return col;
}

// --- art mode color grading ---
vec3 applyArtMode(vec3 c, float mode) {
  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  vec3 azure = mix(c, vec3(0.30, 0.52, 1.00) * lum * 2.0, 0.55);
  vec3 ember = mix(c, vec3(1.00, 0.60, 0.26) * lum * 2.0, 0.55);
  vec3 noir  = mix(c, vec3(0.86, 0.89, 0.96) * lum * 1.5, 0.82);
  vec3 outC = c;
  outC = mix(outC, azure, clamp(mode - 0.0, 0.0, 1.0) * clamp(2.0 - mode, 0.0, 1.0));
  outC = mix(outC, ember, clamp(mode - 1.0, 0.0, 1.0) * clamp(3.0 - mode, 0.0, 1.0));
  outC = mix(outC, noir,  clamp(mode - 2.0, 0.0, 1.0) * clamp(4.0 - mode, 0.0, 1.0));
  return outC;
}

void main() {
  vec2 uv = vUv;
  float mask = texture2D(uMask, uv).r;
  vec3 photo = texture2D(uPhoto, uv).rgb;

  // ---------- sky-domain uv (zoom + parallax, ground stays fixed) ----------
  vec2 suv = (uv - vec2(0.5)) / max(uScale, 0.1) + vec2(0.5);
  suv += uParallax * 0.012;

  // ---------- Van Gogh swirl + curl flow + domain warping ----------
  vec2 ap = vec2(uAspect, 1.0);
  vec2 wuv = swirlWarp(suv, uVortexCenter, uVortexStrength, uVortexRadius,
                       uVortexDir, uAspect, uTime);
  vec2 cw = curl(wuv * ap * 2.6 + vec2(uTime * 0.015, -uTime * 0.010))
          * (0.035 + 0.10 * uFlow);
  vec2 duv = wuv + cw;

  float n1 = fbm(duv * ap * 2.2 + vec2(0.0, uTime * 0.008));
  float n2 = fbm(duv * ap * 4.6 + n1 * 1.7 + vec2(uTime * 0.013, 0.0));
  float n3 = ridgeFbm(duv * ap * 3.1 - n2 * 0.9 + vec2(-uTime * 0.02, uTime * 0.006));

  // contour bands of the warped field → Van Gogh brush strokes
  float vr0 = length((duv - uVortexCenter) * ap);
  float bands = sin((n1 * 6.5 + n2 * 3.2 + vr0 * 8.5 - uTime * 0.12) * 3.14159);
  bands = pow(0.5 + 0.5 * bands, 2.4);
  float streak = bands * (0.30 + 0.70 * smoothstep(0.15, 0.85, n2 + 0.4));

  // ---------- base sky gradient ----------
  vec3 zenith  = vec3(0.020, 0.027, 0.078);
  vec3 midSky  = vec3(0.050, 0.055, 0.170);
  vec3 horizon = vec3(0.098, 0.094, 0.230);
  float h = clamp((uv.y - 0.16) / 0.80, 0.0, 1.0);
  vec3 skyCol = mix(horizon, midSky, smoothstep(0.0, 0.45, h));
  skyCol = mix(skyCol, zenith, smoothstep(0.45, 1.0, h));

  // ---------- flowing strokes ----------
  vec3 strokeBlue = vec3(0.11, 0.21, 0.70);
  vec3 strokeGold = vec3(0.92, 0.70, 0.28);
  skyCol += strokeBlue * streak * (0.17 + 0.33 * (n2 + 0.5));
  skyCol += strokeGold * pow(streak, 4.0) * (0.45 + 0.75 * n3) * (0.24 + 0.46 * uFlow);

  // ---------- milky way band ----------
  vec2 mp = rot(0.40) * ((suv - vec2(0.52, 0.56)) * ap);
  float band = exp(-pow(mp.y * 1.30 + mp.x * 0.10, 2.0) * 5.0);
  float dust = fbm(wuv * ap * 3.3 + n1 * 0.7 + vec2(uTime * 0.010, 0.0));
  float milky = band * (0.30 + 0.70 * clamp(dust + 0.45, 0.0, 1.0)) * (0.5 + 0.5 * streak);
  skyCol += mix(vec3(0.20, 0.33, 0.84), vec3(0.88, 0.72, 0.40), clamp(dust + 0.5, 0.0, 1.0))
          * milky * 0.26;

  // ---------- warm nebula underpainting (CloudPlane carries the visible gold) ----------
  float goldField = pow(clamp(n3, 0.0, 1.0), 2.0);
  skyCol += vec3(0.85, 0.58, 0.22) * goldField * (0.14 + 0.20 * uFlow);

  // ---------- procedural stars riding the swirl ----------
  float st = uTime * 1.1;
  skyCol += starLayer(duv * ap, 170.0, 0.9870, st, 900.0, vec3(0.95, 0.96, 1.00)) * uStarGlow;
  skyCol += starLayer(duv * ap, 64.0,  0.9780, st * 0.8, 380.0, vec3(1.00, 0.88, 0.66)) * uStarGlow;
  skyCol += starLayer(duv * ap, 26.0,  0.9620, st * 1.3, 160.0, vec3(0.78, 0.85, 1.00)) * uStarGlow * 1.4;

  // ---------- vortex core glow ----------
  vec2 vp = (uv - uVortexCenter) * ap;
  float vr = length(vp);
  float rad = max(uVortexRadius, 0.0001);
  float core = exp(-vr * vr / (rad * rad * 0.09)) * (0.18 + 0.8 * uVortexStrength);
  skyCol += mix(vec3(0.40, 0.55, 1.00), vec3(0.98, 0.86, 0.56), 0.45) * core * 0.20;

  // ---------- supernova shockwave ----------
  float ringR = (1.0 - uSupernova) * 1.35;
  float ring = exp(-pow((vr - ringR) * 7.5, 2.0)) * uSupernova;
  skyCol += vec3(1.00, 0.88, 0.62) * ring * 1.35;
  skyCol *= 1.0 + uSupernova * 0.7 * exp(-vr * 2.2);

  // ---------- warm horizon glow (town light bleed) ----------
  float hglow = mask * exp(-pow((uv.y - 0.20) * 5.5, 2.0));
  skyCol += vec3(0.55, 0.38, 0.18) * hglow * 0.16;

  // ---------- art mode ----------
  skyCol = applyArtMode(skyCol, uArtMode);

  // ---------- composite with the real photograph ----------
  float m = clamp(mask * uSkyActive, 0.0, 1.0);
  vec3 photoDim = photo * (1.0 - m * 0.90);
  vec3 col = mix(photoDim, skyCol, m);
  // faint sky bleed onto treetops / roofs at the mask edge
  col += skyCol * 0.07 * smoothstep(0.02, 0.55, mask) * (1.0 - mask) * uSkyActive;
  // town lights keep their warmth, gently boosted
  col += photo * smoothstep(0.55, 0.9, dot(photo, vec3(0.33))) * (1.0 - mask) * 0.10;

  gl_FragColor = vec4(col, 1.0);
}
