// ============================================================
// Shared noise library: simplex / FBM / curl / domain warping
// Prepended to every fragment shader by the material factory.
// ============================================================

#ifndef OCTAVES
#define OCTAVES 5
#endif

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

// Ashima 2D simplex noise
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                      -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x  = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

mat2 rot(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c);
}

// Fractal Brownian motion, octave count driven by quality tier
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 r = rot(0.63);
  for (int i = 0; i < OCTAVES; i++) {
    v += a * snoise(p);
    p = r * p * 2.03 + vec2(11.7, 5.3);
    a *= 0.5;
  }
  return v;
}

// Ridged fbm — sharp golden cloud filaments
float ridgeFbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 r = rot(0.77);
  for (int i = 0; i < OCTAVES; i++) {
    float n = 1.0 - abs(snoise(p));
    v += a * n * n;
    p = r * p * 2.07 + vec2(3.1, 7.7);
    a *= 0.5;
  }
  return v;
}

// 2D curl noise — divergence-free flow field for fluid motion
vec2 curl(vec2 p) {
  const float e = 0.09;
  float n1 = snoise(p + vec2(0.0, e));
  float n2 = snoise(p - vec2(0.0, e));
  float n3 = snoise(p + vec2(e, 0.0));
  float n4 = snoise(p - vec2(e, 0.0));
  return vec2(n1 - n2, n4 - n3) / (2.0 * e);
}

// ============================================================
// Van Gogh swirl warp: fast rotation near the vortex core,
// slow at the edges, with logarithmic spiral arms.
// ============================================================
vec2 swirlWarp(vec2 uv, vec2 center, float strength, float radius,
               float dir, float aspect, float t) {
  vec2 p = uv - center;
  p.x *= aspect;
  float r = length(p);
  float rad = max(radius, 0.0001);
  float fall = exp(-r / rad);
  // rigid-body-like core rotation + spiral arm winding
  float ang = dir * strength * fall * 4.8
            + dir * t * (0.05 + 0.55 * strength * fall)
            + dir * strength * rad * 0.85 / (r + rad * 0.5);
  p = rot(ang) * p;
  p.x /= aspect;
  return p + center;
}
