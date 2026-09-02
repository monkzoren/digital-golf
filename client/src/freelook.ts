// Free look on the game canvas: drag to orbit, wheel or pinch to zoom.
// Shared by the game (main.ts) and the editor's test play (editor.ts), which
// both read the putt from a primary-button drag on the same canvas. The
// caller says when a primary press is a putt; everything else — the right
// or middle button, a primary drag while the ball is rolling or it is not
// your turn, a second finger — turns the camera instead.
import { orbitLook, zoomLook } from './render3d';

export interface FreeLookOpts {
  /** the canvas is showing play right now (not a menu screen) */
  enabled: () => boolean;
  /** a primary-button press starts a putt, so leave it alone */
  leftIsAim: () => boolean;
  /** a second finger landed: drop the putt in progress (nothing fires) */
  cancelAim: () => void;
}

const YAW_PER_PX = 0.0065;
const PITCH_PER_PX = 0.0045;
const WHEEL_STEP = 1.12;

export function bindFreeLook(canvas: HTMLCanvasElement, opts: FreeLookOpts) {
  const touches = new Map<number, { x: number; y: number }>();
  let orbitId: number | null = null; // the mouse button (or lone finger) turning the view
  let last = { x: 0, y: 0 };
  let pinchDist = 0;

  const mid = () => {
    let x = 0, y = 0;
    for (const t of touches.values()) { x += t.x; y += t.y; }
    return { x: x / touches.size, y: y / touches.size };
  };
  const span = () => {
    const [a, b] = [...touches.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  canvas.addEventListener('pointerdown', e => {
    if (!opts.enabled()) return;
    if (e.pointerType === 'touch') {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) {
        // two fingers: the putt (if one was being read) is off — orbit + pinch
        opts.cancelAim();
        orbitId = null;
        last = mid();
        pinchDist = span();
        claim(e);
      } else if (touches.size === 1 && !opts.leftIsAim()) {
        orbitId = e.pointerId;
        last = { x: e.clientX, y: e.clientY };
        claim(e);
      }
      return;
    }
    if (e.button === 0 && opts.leftIsAim()) return;
    if (e.button > 2) return;
    orbitId = e.pointerId;
    last = { x: e.clientX, y: e.clientY };
    claim(e);
  });
  // This pointer is a look: the putt readers (registered before or after
  // us — the editor wires its own on first open) must not see it.
  function claim(e: PointerEvent) {
    e.preventDefault(); // no middle-click autoscroll, no text selection
    e.stopImmediatePropagation();
    canvas.setPointerCapture(e.pointerId);
  }

  canvas.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch' && touches.has(e.pointerId)) {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size >= 2) {
        const m = mid();
        orbitLook((m.x - last.x) * YAW_PER_PX, (m.y - last.y) * PITCH_PER_PX);
        last = m;
        const d = span();
        if (d > 1 && pinchDist > 1) zoomLook(pinchDist / d);
        pinchDist = d;
        return;
      }
    }
    if (e.pointerId !== orbitId) return;
    orbitLook((e.clientX - last.x) * YAW_PER_PX, (e.clientY - last.y) * PITCH_PER_PX);
    last = { x: e.clientX, y: e.clientY };
  });

  const end = (e: PointerEvent) => {
    if (e.pointerType === 'touch') {
      touches.delete(e.pointerId);
      // lifting one of two fingers: the other keeps orbiting, never putts
      if (touches.size === 1) { const [id] = touches.keys(); orbitId = id; last = { ...touches.get(id)! }; }
    }
    if (e.pointerId === orbitId) orbitId = null;
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  canvas.addEventListener('wheel', e => {
    if (!opts.enabled()) return;
    e.preventDefault();
    zoomLook(e.deltaY > 0 ? WHEEL_STEP : 1 / WHEEL_STEP);
  }, { passive: false });
}
