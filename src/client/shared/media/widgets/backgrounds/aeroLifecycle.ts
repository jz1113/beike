import { init } from 'vgpu';
import { createAeroCamera, createAeroResources, createAeroState } from './aeroResources';
import { createAeroPaths } from './aeroPaths';
import { createAeroFrame } from './aeroFrame';
import { CANVAS, PLACEMENTS, FOCUS, LEVELS, INTRO_SECONDS, MAX_RINGS, RING_SECONDS, prefersReduced, createShards, AeroSettings } from './aeroShardModel';
export function mountAeroShards(container: HTMLDivElement, settingsRef: {
  current: AeroSettings;
}, onErrorRef: {
  current?: (error: Error) => void;
}) {
  const canvas = document.createElement('canvas');
  canvas.className = CANVAS;
  container.appendChild(canvas);
  let disposed = false;
  let gpu: Awaited<ReturnType<typeof init>> | null = null;
  let raf = 0;
  const cleanups: Array<() => void> = [];
  const fail = (error: unknown) => {
    if (disposed)
      return;
    disposed = true;
    cancelAnimationFrame(raf);
    gpu?.dispose();
    gpu = null;
    onErrorRef.current?.(error instanceof Error ? error : new Error(String(error)));
  };
  const start = async () => {
    if (typeof navigator === 'undefined' || !('gpu' in navigator))
      throw new Error('WebGPU is not available');
    const instance = await init({ powerPreference: 'high-performance' });
    gpu = instance;
    if (disposed) {
      instance.dispose();
      return;
    }
    cleanups.push(instance.onError(fail));
    const format = (navigator as Navigator & {
      gpu: {
        getPreferredCanvasFormat(): string;
      };
    }).gpu.getPreferredCanvasFormat();
    const resources = await createAeroResources(instance, canvas, container, settingsRef, format);
    if (disposed)
      return;
    const { sizeFor, output, scene, groups, groupSize, levels, levelSize, layerPasses } = resources;
    const state = createAeroState(settingsRef.current);
    const pathState = createAeroPaths(state);
    const { paths } = pathState;
    const camera = createAeroCamera(state, resources);
    const { cam, updateCamera, ray, rayAt } = camera;
    const render = createAeroFrame(instance, state, resources, pathState, camera, container);
    const resize = () => {
      const next = sizeFor();
      if (next[0] === output.size[0] && next[1] === output.size[1])
        return;
      output.resize(next);
      scene.resize(next);
      groups.forEach(group => {
        group.layer.resize(groupSize(group.scale));
        group.shaded.resize(groupSize(group.scale));
        if (group.softReady) {
          group.temp.resize(groupSize(group.scale));
          group.blurred.resize(groupSize(group.scale));
        }
      });
      levels.forEach((level, index) => {
        level.main.resize(levelSize(index));
        level.spare.resize(levelSize(index));
      });
      layerPasses.forEach(list => list.forEach((item, index) => item.shadow.set({ depthMap: groups[index].layer.depth })));
      state.quiet = 0;
    };
    const sizes = new ResizeObserver(resize);
    sizes.observe(container);
    cleanups.push(() => sizes.disconnect());
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (!state.visible || document.hidden) {
        state.last = now;
        return;
      }
      const s = settingsRef.current;
      const dt = state.last ? Math.min((now - state.last) / 1000, 0.05) : 0;
      state.last = now;
      const reduced = prefersReduced();
      state.clock += dt;
      if (state.introAt < 0)
        state.introAt = state.clock;
      if (state.shards.length !== s.count) {
        state.shards = createShards(s.count, 1337);
        state.order = [];
      }
      const moving = !s.paused && !reduced;
      if (moving) {
        for (let level = 0; level < LEVELS; level += 1) {
          state.travel[level] = (state.travel[level] + (dt * s.speed * 0.09) / paths[level].length) % 1;
        }
        state.roll += dt * s.speed * 1.0;
        state.twist += dt * s.speed * 0.08;
        state.drift += dt * s.speed;
      }
      const goal = PLACEMENTS.map((_, index) => (index === s.placement ? 1 : 0));
      let settling = false;
      const decay = Math.exp(-4 * dt);
      for (let index = 0; index < 4; index += 1) {
        const offset = state.weights[index] - goal[index];
        const momentum = state.weightVelocity[index] + 4 * offset;
        state.weights[index] = goal[index] + (offset + momentum * dt) * decay;
        state.weightVelocity[index] = (state.weightVelocity[index] - 4 * momentum * dt) * decay;
        if (Math.abs(state.weights[index] - goal[index]) > 0.0005)
          settling = true;
      }
      if (!settling) {
        state.weights = goal;
        state.weightVelocity = [0, 0, 0, 0];
      }
      const engaged = s.mouseInteraction && state.inside && !reduced;
      state.presence += ((engaged ? 1 : 0) - state.presence) * (1 - Math.exp(-dt / 0.25));
      const lean = engaged ? s.parallax : 0;
      const targetYaw = (state.pointer[0] - 0.5) * lean * 0.14;
      const targetPitch = (state.pointer[1] - 0.5) * lean * 0.08;
      state.yawVelocity += (38 * (targetYaw - state.yaw) - 11 * state.yawVelocity) * dt;
      state.pitchVelocity += (38 * (targetPitch - state.pitch) - 11 * state.pitchVelocity) * dt;
      state.yaw += state.yawVelocity * dt;
      state.pitch += state.pitchVelocity * dt;
      const leaning = Math.abs(targetYaw - state.yaw) + Math.abs(targetPitch - state.pitch) > 1e-4 ||
        Math.abs(state.yawVelocity) + Math.abs(state.pitchVelocity) > 1e-4;
      if (state.pressAt >= 0 &&
        state.pressPoint &&
        s.holdToGather &&
        !reduced &&
        state.clock - state.pressAt > 0.18) {
        if (!state.holding) {
          state.holding = true;
          updateCamera(s);
          rayAt(state.pressPoint[0], state.pressPoint[1]);
          const travelTo = FOCUS / Math.max(ray[0] * cam.forward[0] + ray[1] * cam.forward[1] + ray[2] * cam.forward[2], 0.2);
          state.gatherCenter = [
            cam.eye[0] + ray[0] * travelTo,
            cam.eye[1] + ray[1] * travelTo,
            cam.eye[2] + ray[2] * travelTo
          ];
          state.reach = 0;
        }
        state.hold = Math.min(1, state.hold + dt / 0.5);
        state.reach = Math.min(state.reach + dt * 0.5, 0.55);
        const reach = (0.22 + state.reach) / s.scale;
        for (const shard of state.shards) {
          if (shard.joined || shard.level > 2)
            continue;
          const gx = shard.position[0] - state.gatherCenter[0];
          const gy = shard.position[1] - state.gatherCenter[1];
          if (gx * gx + gy * gy < reach * reach)
            shard.joined = true;
        }
      }
      else if (state.hold > 0) {
        state.hold = Math.max(0, state.hold - dt / 0.3);
        if (state.hold === 0) {
          for (const shard of state.shards)
            shard.joined = false;
        }
      }
      for (const ring of state.rings)
        ring.age += dt;
      state.rings = state.rings.filter(ring => ring.age < RING_SECONDS);
      if (moving)
        state.markerDrift += dt * s.speed * 0.045;
      const flashing = state.shards.some(shard => shard.flash > 0.01 || Math.abs(shard.tiltVelocity) > 0.01 || Math.abs(shard.tilt) > 0.01);
      const transient = settling ||
        leaning ||
        flashing ||
        state.presence > 0.002 ||
        state.rings.length > 0 ||
        state.hold > 0 ||
        (s.intro && !reduced && state.clock - state.introAt < INTRO_SECONDS + 0.5);
      if (state.seen !== s || transient || moving)
        state.quiet = 0;
      else
        state.quiet += 1;
      state.seen = s;
      if (state.quiet > 30)
        return;
      resize();
      render(s, dt, reduced);
    };
    const local = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      return {
        point: [
          (event.clientX - rect.left) / Math.max(rect.width, 1),
          (event.clientY - rect.top) / Math.max(rect.height, 1)
        ],
        inside: event.clientX >= rect.left &&
          event.clientX <= rect.right &&
          event.clientY >= rect.top &&
          event.clientY <= rect.bottom
      };
    };
    const onMove = (event: PointerEvent) => {
      const hit = local(event);
      state.inside = hit.inside;
      if (hit.inside)
        state.pointer = hit.point;
    };
    const onLeave = () => {
      state.inside = false;
    };
    const onDown = (event: PointerEvent) => {
      const s = settingsRef.current;
      if (event.button !== 0 || prefersReduced() || !s.mouseInteraction)
        return;
      if (event.target instanceof Element &&
        event.target.closest('a, button, input, textarea, select, label, [role="button"]'))
        return;
      const hit = local(event);
      if (!hit.inside)
        return;
      state.pointer = hit.point;
      state.pressAt = state.clock;
      state.pressPoint = hit.point;
    };
    const onUp = () => {
      const s = settingsRef.current;
      if (state.pressAt < 0)
        return;
      if (!state.holding && s.pulseOnClick && state.pressPoint) {
        const aspect = output.size[0] / Math.max(output.size[1], 1);
        state.rings.push({
          x: (state.pressPoint[0] * 2 - 1) * aspect,
          y: 1 - state.pressPoint[1] * 2,
          age: 0
        });
        if (state.rings.length > MAX_RINGS)
          state.rings.shift();
      }
      if (state.holding) {
        for (const shard of state.shards) {
          if (shard.joined)
            shard.tiltVelocity += 9 * shard.sign;
        }
      }
      state.pressAt = -1;
      state.holding = false;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    document.documentElement.addEventListener('pointerleave', onLeave);
    cleanups.push(() => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      document.documentElement.removeEventListener('pointerleave', onLeave);
    });
    const visibility = new IntersectionObserver(entries => {
      state.visible = entries.some(entry => entry.isIntersecting);
    });
    visibility.observe(container);
    cleanups.push(() => visibility.disconnect());
    raf = requestAnimationFrame(tick);
  };
  start().catch(fail);
  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    cleanups.forEach(cleanup => cleanup());
    gpu?.dispose();
    canvas.remove();
  };
}
