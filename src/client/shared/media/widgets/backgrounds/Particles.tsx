'use client';

import { useEffect, useRef } from 'react';
import './Particles.css';

import { SHAPES, EFFECTS, DRIFTS, MAX_COUNT, MAX_LINES, MAX_BURSTS, INTRO_SECONDS, BURST_SECONDS, PARTICLE_VERTEX, PARTICLE_FRAGMENT, LINE_VERTEX, LINE_FRAGMENT, clamp, link } from './particlesRenderer';
import type { ParticlesProps, Settings, Burst } from './particlesRenderer';
export type { ParticlesShape, ParticlesHoverEffect, ParticlesDrift, ParticlesProps } from './particlesRenderer';
import { createParticleSimulation } from './particleSimulation';

const Particles = ({
  particleCount = 200,
  particleSpread = 10,
  speed = 0.1,
  particleColors = ['#ffffff'],
  moveParticlesOnHover = true,
  particleHoverFactor = 1,
  alphaParticles = false,
  particleBaseSize = 100,
  sizeRandomness = 1,
  cameraDistance = 20,
  disableRotation = false,
  pixelRatio,
  shape = 'circle',
  glow = 0.5,
  twinkle = 0.3,
  depthOfField = 0,
  connections = false,
  connectionDistance = 110,
  hoverEffect = 'parallax',
  hoverRadius = 140,
  clickBurst = true,
  drift = 'none',
  driftSpeed = 1,
  variation = 0,
  intro = true,
  opacity = 1,
  lightMode = false,
  paused = false,
  className = '',
  style
}: ParticlesProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wakeRef = useRef<(() => void) | null>(null);
  const palette = (Array.isArray(particleColors) ? particleColors : [particleColors as unknown as string])
    .filter(Boolean)
    .map(String);
  const settings: Settings = {
    count: clamp(Math.round(particleCount), 1, MAX_COUNT),
    spread: Math.max(0.1, particleSpread),
    speed,
    colors: palette.length ? palette : ['#ffffff'],
    mouse: moveParticlesOnHover,
    hoverFactor: Math.max(0, particleHoverFactor),
    soft: alphaParticles,
    size: Math.max(0, particleBaseSize),
    randomness: Math.max(0, sizeRandomness),
    camera: Math.max(1, cameraDistance),
    rotate: !disableRotation,
    dpr: pixelRatio,
    shape: SHAPES[shape] ?? 0,
    glow: Math.max(0, glow),
    twinkle: clamp(twinkle, 0, 1),
    depthOfField: Math.max(0, depthOfField),
    connections,
    connectionDistance: Math.max(10, connectionDistance),
    hoverEffect: EFFECTS[hoverEffect] ?? 0,
    hoverRadius: Math.max(20, hoverRadius),
    clickBurst,
    drift: DRIFTS[drift] ?? 0,
    driftSpeed,
    variation: Math.max(0, Math.round(variation)),
    intro,
    opacity: clamp(opacity, 0, 1),
    lightMode,
    paused
  };
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    const gl = canvas?.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false
    });
    if (!container || !canvas || !gl) return undefined;

    const dots = link(gl, PARTICLE_VERTEX, PARTICLE_FRAGMENT);
    const lines = link(gl, LINE_VERTEX, LINE_FRAGMENT);
    if (!dots || !lines) return undefined;

    const corners = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, corners);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    const positionBuffer = gl.createBuffer();
    const randomBuffer = gl.createBuffer();
    const colorBuffer = gl.createBuffer();
    const dotVao = gl.createVertexArray();
    gl.bindVertexArray(dotVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, corners);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const attach = (buffer: WebGLBuffer | null, location: number, width: number) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, width, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(location, 1);
    };
    attach(positionBuffer, 1, 3);
    attach(randomBuffer, 2, 4);
    attach(colorBuffer, 3, 3);

    const lineBuffer = gl.createBuffer();
    const lineData = new Float32Array(MAX_LINES * 8);
    const lineVao = gl.createVertexArray();
    gl.bindVertexArray(lineVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, corners);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, lineBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, lineData.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 32, 16);
    gl.vertexAttribDivisor(2, 1);
    gl.bindVertexArray(null);

    const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const cache = new Map<string, number[]>();
    const parse = (value: string): number[] => {
      const cached = cache.get(value);
      if (cached) return cached;
      let rgb = [1, 1, 1];
      if (probe) {
        probe.clearRect(0, 0, 1, 1);
        probe.fillStyle = '#ffffff';
        probe.fillStyle = value;
        probe.fillRect(0, 0, 1, 1);
        const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
        rgb = [r / 255, g / 255, b / 255];
      }
      cache.set(value, rgb);
      return rgb;
    };
    const ink = (rgb: number[]): number[] => {
      const linear = rgb.map(v => Math.pow(v, 2.2));
      const tone = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
      const depth = Math.min(1, 0.06 / Math.max(tone, 0.0001));
      return linear.map(v => Math.pow(v * depth, 1 / 2.2));
    };

    const view = { width: 1, height: 1, ratio: 1 };
    const pointer = { x: 0, y: 0, sx: 0, sy: 0, nx: 0, ny: 0, inside: false, active: 0 };
    const state = {
      clock: 0,
      spin: 0,
      travel: 0,
      offsetX: 0,
      offsetY: 0,
      reveal: settingsRef.current.intro && !reduce ? 0 : 1
    };
    const bursts: Burst[] = [];
    const packedBursts = new Float32Array(MAX_BURSTS * 4);
    const cloud = {
      key: '',
      count: 0,
      positions: new Float32Array(0),
      randoms: new Float32Array(0),
      colors: new Float32Array(0)
    };
    const screen = {
      x: new Float32Array(0),
      y: new Float32Array(0),
      ahead: new Float32Array(0),
      alpha: new Float32Array(0)
    };
    let raf = 0;
    let last = 0;
    let visible = true;

    const { rebuild, rotationOf, offsetOf, buildLines } = createParticleSimulation({
      gl, positionBuffer, randomBuffer, colorBuffer, parse, ink, view, pointer, state, bursts, cloud, screen, lineData,
    });

    const render = () => {
      const s = settingsRef.current;
      rebuild(s);
      const matrix = rotationOf(s);
      const [ox, oy, oz] = offsetOf();
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

      if (s.connections) {
        const lineCount = buildLines(s, matrix);
        if (lineCount) {
          gl.useProgram(lines.program);
          gl.bindVertexArray(lineVao);
          gl.bindBuffer(gl.ARRAY_BUFFER, lineBuffer);
          gl.bufferSubData(gl.ARRAY_BUFFER, 0, lineData.subarray(0, lineCount * 8));
          gl.uniform2f(lines.uniforms.uView, view.width, view.height);
          gl.uniform1f(lines.uniforms.uRatio, view.ratio);
          gl.uniform1f(lines.uniforms.uWidth, 1);
          gl.uniform1f(lines.uniforms.uOpacity, s.opacity);
          gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, lineCount);
        }
      }

      const u = dots.uniforms;
      let burstCount = 0;
      for (let i = bursts.length - 1; i >= 0 && burstCount < MAX_BURSTS; i--) {
        packedBursts.set([bursts[i].x, bursts[i].y, bursts[i].age / BURST_SECONDS, 1], burstCount * 4);
        burstCount++;
      }
      gl.useProgram(dots.program);
      gl.bindVertexArray(dotVao);
      gl.uniformMatrix3fv(u.uRotation, false, matrix);
      gl.uniform3f(u.uOffset, ox, oy, oz);
      gl.uniform1f(u.uSpread, s.spread);
      gl.uniform1f(u.uTime, state.clock);
      gl.uniform1f(u.uCamera, s.camera);
      gl.uniform1f(u.uAspect, view.width / view.height);
      gl.uniform2f(u.uView, view.width, view.height);
      gl.uniform1f(u.uRatio, view.ratio);
      gl.uniform1f(u.uSize, s.size);
      gl.uniform1f(u.uRandomness, s.randomness);
      gl.uniform1f(u.uBlur, s.depthOfField * 14);
      gl.uniform1f(u.uFocus, s.camera + 14);
      gl.uniform1f(u.uGlow, s.lightMode ? s.glow * 0.3 : s.glow);
      gl.uniform1f(u.uTwinkle, s.twinkle);
      gl.uniform1i(u.uShape, s.shape);
      gl.uniform1i(u.uDrift, s.drift);
      gl.uniform1f(u.uTravel, state.travel);
      gl.uniform4f(u.uPointer, pointer.sx, pointer.sy, pointer.active, s.hoverRadius);
      gl.uniform1i(u.uEffect, s.hoverEffect);
      gl.uniform1f(u.uStrength, s.hoverFactor);
      gl.uniform4fv(u.uBursts, packedBursts);
      gl.uniform1i(u.uBurstCount, burstCount);
      gl.uniform1f(u.uReveal, state.reveal);
      gl.uniform1f(u.uSoft, s.soft ? 0.2 : 0);
      gl.uniform1f(u.uShimmer, s.lightMode ? 0 : 1);
      gl.uniform1f(u.uOpacity, s.opacity);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, cloud.count);
      gl.bindVertexArray(null);
    };

    const frame = (now: number) => {
      raf = 0;
      if (!visible || document.hidden) return;
      const s = settingsRef.current;
      const dt = last ? clamp((now - last) / 1000, 0.0005, 0.05) : 1 / 60;
      last = now;
      if (s.paused) {
        state.reveal = 1;
        render();
        last = 0;
        return;
      }
      const motion = reduce ? 0 : 1;
      const pace = dt * s.speed * motion;
      state.clock += pace;
      if (s.rotate) state.spin += pace * 0.6;
      state.travel += dt * s.driftSpeed * motion * (s.drift === 3 ? 6 : 0.9);

      const engaged = s.mouse && pointer.inside && !reduce;
      const follow = 1 - Math.exp(-dt / 0.35);
      const parallax = engaged && s.hoverEffect === 0 ? s.hoverFactor : 0;
      state.offsetX += (-pointer.nx * parallax - state.offsetX) * follow;
      state.offsetY += (-pointer.ny * parallax - state.offsetY) * follow;
      pointer.sx += (pointer.x - pointer.sx) * (1 - Math.exp(-dt / 0.06));
      pointer.sy += (pointer.y - pointer.sy) * (1 - Math.exp(-dt / 0.06));
      pointer.active += ((engaged ? 1 : 0) - pointer.active) * (1 - Math.exp(-dt / 0.2));

      for (let i = bursts.length - 1; i >= 0; i--) {
        bursts[i].age += dt;
        if (bursts[i].age >= BURST_SECONDS) bursts.splice(i, 1);
      }

      if (!s.intro || reduce) state.reveal = 1;
      else if (state.reveal < 1) state.reveal = Math.min(1, state.reveal + dt / INTRO_SECONDS);

      render();
      raf = requestAnimationFrame(frame);
    };

    const wake = () => {
      if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame);
    };

    const resize = () => {
      const s = settingsRef.current;
      const width = Math.max(1, container.clientWidth);
      const height = Math.max(1, container.clientHeight);
      const ratio = Math.min(s.dpr || window.devicePixelRatio || 1, 2);
      view.width = width;
      view.height = height;
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      view.ratio = canvas.width / width;
      render();
      wake();
    };

    const locate = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const wasInside = pointer.inside;
      pointer.inside = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;
      pointer.x = x;
      pointer.y = rect.height - y;
      pointer.nx = (x / Math.max(1, rect.width)) * 2 - 1;
      pointer.ny = -((y / Math.max(1, rect.height)) * 2 - 1);
      if (pointer.inside && !wasInside) {
        pointer.sx = pointer.x;
        pointer.sy = pointer.y;
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      locate(event);
      if (!settingsRef.current.paused) wake();
    };

    const onPointerDown = (event: PointerEvent) => {
      const s = settingsRef.current;
      locate(event);
      if (!pointer.inside || !s.clickBurst || s.paused || reduce) return;
      bursts.push({ x: pointer.x, y: pointer.y, age: 0 });
      if (bursts.length > MAX_BURSTS) bursts.shift();
      wake();
    };

    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') pointer.inside = false;
    };

    const onPointerLeave = () => {
      pointer.inside = false;
    };

    const onVisibility = () => {
      last = 0;
      wake();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    const intersection = new IntersectionObserver(entries => {
      visible = entries.some(entry => entry.isIntersecting);
      if (visible) {
        last = 0;
        wake();
      }
    });
    intersection.observe(container);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('pointerup', onPointerUp, { passive: true });
    window.addEventListener('pointercancel', onPointerUp, { passive: true });
    document.documentElement.addEventListener('pointerleave', onPointerLeave);
    document.addEventListener('visibilitychange', onVisibility);
    resize();

    let lastDpr = settingsRef.current.dpr;
    wakeRef.current = () => {
      const s = settingsRef.current;
      if (s.dpr !== lastDpr) {
        lastDpr = s.dpr;
        resize();
        return;
      }
      if (!raf) render();
      wake();
    };

    return () => {
      cancelAnimationFrame(raf);
      wakeRef.current = null;
      resizeObserver.disconnect();
      intersection.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      document.documentElement.removeEventListener('pointerleave', onPointerLeave);
      document.removeEventListener('visibilitychange', onVisibility);
      gl.deleteProgram(dots.program);
      gl.deleteProgram(lines.program);
      [corners, positionBuffer, randomBuffer, colorBuffer, lineBuffer].forEach(buffer => gl.deleteBuffer(buffer));
      gl.deleteVertexArray(dotVao);
      gl.deleteVertexArray(lineVao);
    };
  }, []);

  useEffect(() => {
    wakeRef.current?.();
  });

  return (
    <div ref={containerRef} className={`particles-container${className ? ` ${className}` : ''}`} style={style}>
      <canvas ref={canvasRef} className="particles-canvas" aria-hidden="true" />
    </div>
  );
};

export default Particles;
