import { gsap } from 'gsap';

/** Minimal structural surface needed for the boot camera sweep. */
export interface IntroGraph {
  cameraPosition(
    pos: { x: number; y: number; z: number },
    lookAt: { x: number; y: number; z: number },
    ms: number,
  ): void;
}

const prefersReducedMotion = (): boolean =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** One-time boot sequence: a "SYSTEM ONLINE" overlay fades while the camera sweeps in. */
export function playIntro(graph: IntroGraph): void {
  const overlay = document.createElement('div');
  overlay.textContent = 'SYSTEM ONLINE';
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '50',
    display: 'grid',
    placeItems: 'center',
    background: 'radial-gradient(ellipse at center, rgba(4,6,13,0.6), #04060d)',
    color: '#36e0ff',
    font: "700 28px/1 Orbitron, monospace",
    letterSpacing: '0.4em',
    textShadow: '0 0 24px rgba(54,224,255,0.7)',
    pointerEvents: 'none',
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.append(overlay);

  if (prefersReducedMotion()) {
    overlay.remove();
    return;
  }
  graph.cameraPosition({ x: 0, y: 80, z: 900 }, { x: 0, y: 0, z: 0 }, 0);
  graph.cameraPosition({ x: 0, y: 0, z: 360 }, { x: 0, y: 0, z: 0 }, 1600);
  gsap.to(overlay, {
    opacity: 0,
    duration: 0.7,
    delay: 0.9,
    ease: 'power2.in',
    onComplete: () => {
      overlay.remove();
    },
  });
}
