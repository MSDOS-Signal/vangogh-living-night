// Star sprite: soft core + halo, tinted, sky-masked.
// Rendered with premultiplied additive blending (ONE, ONE).

precision highp float;

uniform sampler2D uMask;
uniform vec2 uInvResolution; // 1.0 / drawing-buffer size

varying float vBright;
varying float vTint;
varying float vDepth;

void main() {
  vec2 d = gl_PointCoord - 0.5;
  float dist = dot(d, d);
  if (dist > 0.25) discard;

  // sky mask in screen space — stars never burn the landscape
  float mask = texture2D(uMask, gl_FragCoord.xy * uInvResolution).r;
  if (mask < 0.04) discard;

  float core = exp(-dist * 44.0);
  float halo = exp(-dist * 21.0) * 0.24;

  vec3 cool  = vec3(0.60, 0.75, 1.00);
  vec3 white = vec3(0.97, 0.98, 1.00);
  vec3 warm  = vec3(1.00, 0.79, 0.46);
  vec3 col = mix(mix(cool, white, 0.42), warm, vTint);

  float a = (core + halo) * vBright * 0.72 * smoothstep(0.04, 0.4, mask);
  gl_FragColor = vec4(col * a, a);
}
