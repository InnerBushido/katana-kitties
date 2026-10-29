import * as THREE from 'three';

/*
  THE HOLD RING — a circle that fills round a kitten while she holds a button,
  for a thing that must not happen on one press. Richard, Oct 2026: "let's
  make it that the player needs to stand next to the scroll and hold the
  action/jump button for 1 second before they complete the level. We can have
  a circular bar appearing around them that is shown over all of the
  environment so that the player can see it, also make it billboard towards
  the camera properly."

  OVER EVERYTHING: no depth test and a render order past the island's, so a
  roof or a cane between her and the lens does not hide the one thing she is
  waiting on.

  BILLBOARDED PER LENS, in `onBeforeRender`. In split screen one mesh is drawn
  by up to four cameras in a frame, so turning it once in an update faces it at
  one of them and leaves it edge-on to the rest. three.js builds the model-view
  matrix AFTER `onBeforeRender`, so composing `matrixWorld` there with the
  camera's own rotation faces it at whichever lens is drawing it — and it is
  composed in the WORLD, not as a local rotation, because the island it hangs
  off is turned (`_w`), and a local copy of the camera's rotation would come
  out turned by the island's.

  The fill is a fragment-shader sweep from twelve o'clock, clockwise as she
  sees it, over a dim track of the whole circle so she can see how far is
  left.
*/

const VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const FRAG = /* glsl */`
uniform vec3 uColor;
uniform float uFill;
uniform float uAlpha;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  // the band: inner 0.74 to outer 1.0 of the quad, soft by one fwidth
  float aa = fwidth(r) * 1.5;
  float band = smoothstep(0.74 - aa, 0.74, r) * (1.0 - smoothstep(1.0 - aa, 1.0, r));
  if (band <= 0.0) discard;
  // 0 at twelve o'clock, running clockwise to 1
  float a = atan(p.x, p.y) / 6.28318530718;
  if (a < 0.0) a += 1.0;
  float on = step(a, uFill);
  vec3 c = mix(uColor * 0.28, uColor, on);
  gl_FragColor = vec4(c, band * uAlpha * mix(0.55, 1.0, on));
}`;

export class HoldRing {
  /**
   * @param {THREE.Object3D} parent  what it hangs off (any transform)
   * @param {number} radius          world units, outer edge
   */
  constructor(parent, radius = 1.25) {
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0xffffff) }, uFill: { value: 0 }, uAlpha: { value: 1 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), this.mat);
    this.mesh.renderOrder = 1000;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.at = new THREE.Vector3();
    const one = new THREE.Vector3(1, 1, 1);
    this.mesh.onBeforeRender = (_r, _s, camera) => {
      this.mesh.matrixWorld.compose(this.at, camera.quaternion, one);
    };
    parent.add(this.mesh);
  }

  /** Show it at WORLD point `at`, `fill` of the way round (0..1), in `color`; null hides it. */
  set(at, fill, color) {
    if (!at || !(fill > 0)) { this.mesh.visible = false; return; }
    this.at.set(at.x, at.y, at.z);
    this.mat.uniforms.uFill.value = Math.min(1, fill);
    this.mat.uniforms.uColor.value.set(color);
    this.mesh.visible = true;
  }

  dispose() {
    this.mesh.parent?.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}
