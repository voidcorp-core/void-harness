import {
  BufferGeometry,
  CanvasTexture,
  Float32BufferAttribute,
  FogExp2,
  PointsMaterial,
  Points,
  Vector2,
} from 'three';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

/**
 * Minimal structural surface of the 3d-force-graph instance this module drives.
 * The real instance (ForceGraph3DInstance) is wider; we name only what we touch
 * so the boundary cast in graph.ts stays precise.
 */
export interface FxGraph {
  scene(): { fog: unknown; add(o: unknown): void };
  postProcessingComposer(): { addPass(p: unknown): void; setSize(w: number, h: number): void };
}

/** A soft radial-gradient sprite texture used for node glow halos. */
export function glowTexture(): CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  return new CanvasTexture(canvas);
}

/** Bloom glow + depth fog + a slow ambient particle field — the holographic void. */
export function addHologramFx(graph: FxGraph): void {
  const scene = graph.scene();
  scene.fog = new FogExp2(0x04060d, 0.0011);

  // Bloom: makes the unlit neon node/edge colors read as projected light.
  // UnrealBloomPass(resolution, strength, radius, threshold) — confirmed three@0.185.
  // Tuned for legibility: a softer strength + higher threshold keeps the graph
  // reading as a node-link structure rather than washing into one glowing blob.
  const bloom = new UnrealBloomPass(new Vector2(window.innerWidth, window.innerHeight), 0.55, 0.6, 0.22);
  const composer = graph.postProcessingComposer();
  composer.addPass(bloom);

  // Ambient dust/star field drifting in the background for parallax + life.
  // Deterministic index expression (render shell, not pure code) keeps the look stable.
  const count = 1400;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count * 3; i += 1) {
    positions[i] = (i % 7 === 0 ? -1 : 1) * (300 + ((i * 53) % 1400));
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
  const field = new Points(
    geo,
    new PointsMaterial({ color: 0x2a5a78, size: 1.1, transparent: true, opacity: 0.35, depthWrite: false }),
  );
  scene.add(field);

  const onResize = (): void => {
    bloom.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener('resize', onResize);
}
