import { frame, type init } from 'vgpu';
import type { AeroCamera, AeroResources, AeroState } from './aeroResources';
import type { AeroPaths } from './aeroPaths';
import { createAeroSimulation } from './aeroSimulation';
import { MATERIALS, FLOATS, FOCUS, SHARD_FOCUS, DEPTHS, FADE, LEVELS, MARKER_FLOATS, AeroSettings } from './aeroShardModel';
export function createAeroFrame(instance: Awaited<ReturnType<typeof init>>, state: AeroState, resources: AeroResources, pathState: AeroPaths, camera: AeroCamera, container: HTMLDivElement) {
  const { markerCounts, markerStarts } = pathState;
  const { cam, updateCamera } = camera;
  const simulate = createAeroSimulation(state, resources, pathState, camera, container);
  const render = (s: AeroSettings, dt: number, reduced: boolean) => {
    updateCamera(s);
    const shards = state.shards;
    resources.ensureCapacity(shards.length);
    simulate(s, dt, reduced);
    const { output, depths, upload, staging, shardBuffer, markerBuffer, markerData, scene, groupSize, groups, levels, frameParams, markerDraw, layerParams, spreadX, spreadY, mixParams, shadeParams, shardSolid, shardEdge, layerPasses, passes, finishParams, finish } = resources;
    if (state.order.length !== shards.length)
      state.order = shards.map((_, index) => index);
    const order = state.order;
    for (let i = 0; i < shards.length; i += 1)
      depths[i] += shards[i].level * 100;
    for (let i = 1; i < order.length; i += 1) {
      const value = order[i];
      const key = depths[value];
      let j = i - 1;
      while (j >= 0 && depths[order[j]] < key) {
        order[j + 1] = order[j];
        j -= 1;
      }
      order[j + 1] = value;
    }
    const counts = [0, 0, 0, 0, 0];
    for (let slot = 0; slot < order.length; slot += 1) {
      const from = order[slot] * FLOATS;
      const to = slot * FLOATS;
      counts[shards[order[slot]].level] += 1;
      for (let k = 0; k < FLOATS; k += 1)
        upload[to + k] = staging[from + k];
    }
    shardBuffer?.write(upload.subarray(0, shards.length * FLOATS));
    if (state.markerTotal > 0)
      markerBuffer?.write(markerData.subarray(0, state.markerTotal * MARKER_FLOATS));
    const starts = [0, 0, 0, 0, 0];
    let running = 0;
    for (let level = LEVELS - 1; level >= 0; level -= 1) {
      starts[level] = running;
      running += counts[level];
    }
    frameParams.set({
      view: [output.size[0], output.size[1], cam.focal, state.clock],
      eye: [cam.eye[0], cam.eye[1], cam.eye[2], FOCUS],
      forward: [cam.forward[0], cam.forward[1], cam.forward[2], s.depthOfField * output.size[1] * 0.03],
      right: [cam.right[0], cam.right[1], cam.right[2], output.size[1] * 0.05],
      up: [cam.up[0], cam.up[1], cam.up[2], s.lightMode ? 1 : 0],
      shard: [...s.shard, 0],
      accent: [...s.accent, 0],
      surface: s.material,
      marker: [
        s.markers,
        output.size[1] / Math.max(container.clientHeight, 1),
        4 * (output.size[1] / Math.max(container.clientHeight, 1)),
        FOCUS
      ]
    });
    passes.forEach(({ downParams, horizontalParams, verticalParams, source, level }) => {
      downParams.set({ texel: [0.5 / source.size[0], 0.5 / source.size[1], 0.75, 0.5] });
      horizontalParams.set({ texel: [1 / level.main.size[0], 0, 0, 0] });
      verticalParams.set({ texel: [0, 1 / level.main.size[1], 0, 0] });
    });
    const paper = s.paper ?? [0, 0, 0];
    const blooming = s.glow > 0.001 && !s.lightMode;
    finishParams.set({
      info: [s.grain, Math.floor(state.clock * 24), blooming ? s.glow : 0, 1.3],
      paper: [paper[0], paper[1], paper[2], s.paper ? 1 : 0],
      mode: [s.lightMode ? 1 : 0, s.vignette, 0, 0]
    });
    const coc = s.depthOfField * output.size[1] * 0.012;
    const cap = output.size[1] * 0.02;
    const plan = DEPTHS.map((depth, level) => {
      const sigma = Math.min(coc * Math.abs(1 - SHARD_FOCUS / depth), cap);
      const groupIndex = sigma >= 2.2 ? 1 : 0;
      const group = groups[groupIndex];
      const soft = sigma >= 0.45;
      if (soft && !group.softReady) {
        group.softReady = true;
        group.temp.resize(groupSize(group.scale));
        group.blurred.resize(groupSize(group.scale));
      }
      const size = group.layer.size;
      layerParams[level].set({
        view: [size[0], size[1], cam.focal * (size[0] / output.size[0]), level],
        look: [s.lightMode ? 0.5 : 0.7, 0, 0, 0]
      });
      const local = sigma * group.scale;
      spreadX[level].set({ texel: [1 / size[0], 0, local, 0] });
      spreadY[level].set({ texel: [0, 1 / size[1], local, 0] });
      mixParams[level].set({ info: [FADE[level], 0, 0, 0] });
      const step = Math.max(0.6, 1.4 * (size[0] / Math.max(container.clientWidth, 1)));
      const shadowStrength = s.material === MATERIALS.glass ? 0 : s.lightMode ? 0.32 : 0.62;
      shadeParams[level].set({ info: [step * 0.55, step * 0.85, shadowStrength, 0], more: [0.00045, 0, 0, 0] });
      return { group, groupIndex, soft };
    });
    frame(instance, current => {
      for (let level = LEVELS - 1; level >= 0; level -= 1) {
        const { group, groupIndex, soft } = plan[level];
        const steps = layerPasses[level][groupIndex];
        if (counts[level] > 0) {
          current.pass({ target: group.layer, clear: [0, 0, 0, 0], clearDepth: 1 }, pass => {
            pass.draw(shardSolid[level], { instances: counts[level], firstInstance: starts[level] });
            pass.draw(shardEdge[level], { instances: counts[level], firstInstance: starts[level] });
          });
          current.pass({ target: group.shaded, clear: [0, 0, 0, 0] }, pass => pass.draw(steps.shadow));
          if (soft) {
            current.pass({ target: group.temp, clear: [0, 0, 0, 0] }, pass => pass.draw(steps.blurX));
            current.pass({ target: group.blurred, clear: [0, 0, 0, 0] }, pass => pass.draw(steps.blurY));
          }
        }
        current.pass({ target: scene, clear: level === LEVELS - 1 ? [0, 0, 0, 0] : false }, pass => {
          if (markerCounts[level] > 0) {
            pass.draw(markerDraw, { instances: markerCounts[level], firstInstance: markerStarts[level] });
          }
          if (counts[level] > 0)
            pass.draw(soft ? steps.soft : steps.sharp);
        });
      }
      passes.forEach((pass, index) => {
        const level = levels[index];
        if (!blooming) {
          current.pass({ target: level.main, clear: [0, 0, 0, 0] }, () => { });
          return;
        }
        current.pass({ target: level.main, clear: [0, 0, 0, 0] }, p => p.draw(pass.down));
        current.pass({ target: level.spare, clear: [0, 0, 0, 0] }, p => p.draw(pass.horizontal));
        current.pass({ target: level.main, clear: [0, 0, 0, 0] }, p => p.draw(pass.vertical));
      });
      current.pass({ target: output, clear: [0, 0, 0, 0] }, pass => pass.draw(finish));
    });
  };
  return render;
}
