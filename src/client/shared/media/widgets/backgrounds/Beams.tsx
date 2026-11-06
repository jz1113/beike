'use client';

import { useEffect, useRef } from 'react';

import './Beams.css';

import { FIELD, COMPOSITE, INTRO_SECONDS, MAX_FIELD_PIXELS, clamp, link } from './beamsRenderer';
import type { BeamsProps, Settings } from './beamsRenderer';
export type { BeamsProps } from './beamsRenderer';

export const Beams = ({
  color = '#ffffff',
  beamWidth = 140,
  rotation = 30,
  speed = 1,
  waveLength = 233,
  depth = 1,
  sharpness = 0.6,
  twist = 0,
  fillLight = 0.3,
  glow = 0.6,
  brightness = 1.6,
  variation = 0,
  grain = 0.35,
  quality = 0.75,
  mouseInteraction = true,
  mouseStrength = 1,
  intro = true,
  fade = 0,
  opacity = 1,
  lightMode = false,
  backgroundColor,
  paused = false,
  dpr,
  className = '',
  style,
  ...rest
}: BeamsProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wakeRef = useRef<(() => void) | null>(null);
  const settings: Settings = {
    color: String(color),
    beamWidth: Math.max(8, beamWidth),
    rotation,
    speed,
    waveLength: Math.max(20, waveLength),
    depth: Math.max(0, depth),
    sharpness: clamp(sharpness, 0, 1),
    twist: clamp(twist, 0, 2),
    fillLight: clamp(fillLight, 0, 1.5),
    glow: Math.max(0, glow),
    brightness: Math.max(0, brightness),
    variation: Number(variation) || 0,
    grain: Math.max(0, grain),
    quality: clamp(quality, 0.25, 1),
    mouseInteraction,
    mouseStrength: Math.max(0, mouseStrength),
    intro,
    fade: clamp(fade, 0, 1),
    opacity: clamp(opacity, 0, 1),
    lightMode,
    paused,
    dpr
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
      stencil: false,
      powerPreference: 'high-performance'
    });
    if (!container || !canvas || !gl) return undefined;

    const floatTargets = !!gl.getExtension('EXT_color_buffer_float');
    const fieldProgram = link(gl, FIELD);
    const compositeProgram = link(gl, COMPOSITE);
    if (!fieldProgram || !compositeProgram) return undefined;

    const buffer = gl.createBuffer();
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    let texture: WebGLTexture | null = null;
    const framebuffer = gl.createFramebuffer();
    const target = { width: 0, height: 0 };
    const sizeTarget = (width: number, height: number) => {
      if (target.width === width && target.height === height) return;
      target.width = width;
      target.height = height;
      if (texture) gl.deleteTexture(texture);
      texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      const levels = Math.floor(Math.log2(Math.max(width, height))) + 1;
      gl.texStorage2D(gl.TEXTURE_2D, levels, floatTargets ? gl.RGBA16F : gl.RGBA8, width, height);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    };

    const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const colorCache = new Map<string, number[]>();
    const toLinear = (value: string): number[] => {
      const cached = colorCache.get(value);
      if (cached) return cached;
      let rgb = [1, 1, 1];
      if (probe) {
        probe.clearRect(0, 0, 1, 1);
        probe.fillStyle = '#ffffff';
        probe.fillStyle = value;
        probe.fillRect(0, 0, 1, 1);
        const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
        rgb = [r, g, b].map(v => Math.pow(v / 255, 2.2));
      }
      colorCache.set(value, rgb);
      return rgb;
    };

    const view = { width: 1, height: 1, fieldWidth: 1, fieldHeight: 1 };
    const pointer = { x: 0, y: 0, inside: false };
    const state = {
      clock: 0,
      intro: settingsRef.current.intro && !reduce ? 0 : 1,
      reach: 0,
      x: 0,
      y: 0,
      lightY: 0
    };
    let raf = 0;
    let last = 0;
    let visible = true;

    const render = () => {
      const s = settingsRef.current;
      const presence = state.intro * state.intro * state.intro * (state.intro * (state.intro * 6 - 15) + 10);
      gl.bindVertexArray(vao);
      sizeTarget(view.fieldWidth, view.fieldHeight);

      const angle = (s.rotation * Math.PI) / 180;
      const sweep = (1 - presence) * -9;
      const reach = state.reach * s.mouseStrength;
      const f = fieldProgram.uniforms;
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.viewport(0, 0, target.width, target.height);
      gl.useProgram(fieldProgram.program);
      gl.uniform2f(f.uView, view.width, view.height);
      gl.uniform2f(f.uScale, view.width / target.width, view.height / target.height);
      gl.uniform2f(f.uTurn, Math.cos(angle), Math.sin(angle));
      gl.uniform1f(f.uTime, (state.clock * 0.12) % 289);
      gl.uniform1f(f.uWidth, s.beamWidth);
      gl.uniform1f(f.uWave, s.waveLength);
      gl.uniform1f(f.uDepth, s.depth);
      gl.uniform1f(f.uRough, 0.55 - s.sharpness * 0.5);
      gl.uniform1f(f.uSeed, s.variation);
      gl.uniform1f(f.uTwist, s.twist);
      gl.uniform1f(f.uFill, s.fillLight);
      gl.uniform3f(f.uLight, 0, 3 + sweep + state.lightY * reach, 10);
      gl.uniform1f(f.uCamera, view.height * 1.866);
      gl.uniform4f(f.uPointer, state.x, view.height - state.y, reach, Math.max(view.height, view.width) * 0.28);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.generateMipmap(gl.TEXTURE_2D);

      const c = compositeProgram.uniforms;
      const tint = toLinear(s.color);
      const tone = 0.2126 * tint[0] + 0.7152 * tint[1] + 0.0722 * tint[2];
      const shadeDepth = Math.min(1, 0.18 / Math.max(tone, 0.001));
      const ink = tint.map(v => Math.pow(Math.min(1, v * shadeDepth), 1 / 2.2));
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(compositeProgram.program);
      gl.uniform2f(c.uResolution, canvas.width, canvas.height);
      gl.uniform3fv(c.uColor, tint);
      gl.uniform3fv(c.uInk, ink);
      gl.uniform1f(c.uGain, s.brightness);
      gl.uniform1f(c.uGlow, s.glow);
      gl.uniform1f(c.uPresence, presence);
      gl.uniform1f(c.uGrain, s.grain * 1.75);
      gl.uniform1f(c.uFade, s.fade);
      gl.uniform1f(c.uOpacity, s.opacity);
      gl.uniform1f(c.uLightMode, s.lightMode ? 1 : 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(c.uField, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const frame = (now: number) => {
      raf = 0;
      if (!visible || document.hidden) return;
      const s = settingsRef.current;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      const moving = !s.paused && !reduce;
      if (moving) state.clock += dt * s.speed;
      if (!s.intro || reduce) state.intro = 1;
      else if (state.intro < 1) state.intro = Math.min(1, state.intro + dt / INTRO_SECONDS);

      const engaged = s.mouseInteraction && pointer.inside && !reduce;
      if (engaged && state.reach < 0.01) {
        state.x = pointer.x;
        state.y = pointer.y;
      }
      const follow = 1 - Math.exp(-dt * 7);
      state.x += (pointer.x - state.x) * follow;
      state.y += (pointer.y - state.y) * follow;
      state.reach += ((engaged ? 1 : 0) - state.reach) * (1 - Math.exp(-dt * (engaged ? 3.2 : 1.8)));
      const turn = (s.rotation * Math.PI) / 180;
      const offsetX = state.x - view.width / 2;
      const offsetY = view.height / 2 - state.y;
      const along = -Math.sin(turn) * offsetX + Math.cos(turn) * offsetY;
      state.lightY = clamp((along / (view.height * 0.5)) * 3, -4, 4);
      render();

      const settling =
        state.intro < 1 ||
        Math.abs((engaged ? 1 : 0) - state.reach) > 0.002 ||
        Math.abs(pointer.x - state.x) + Math.abs(pointer.y - state.y) > 0.3;
      if (moving || settling) raf = requestAnimationFrame(frame);
      else last = 0;
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
      let fieldScale = s.quality * ratio;
      if (width * height * fieldScale * fieldScale > MAX_FIELD_PIXELS) {
        fieldScale = Math.sqrt(MAX_FIELD_PIXELS / (width * height));
      }
      view.fieldWidth = Math.max(1, Math.round(width * fieldScale));
      view.fieldHeight = Math.max(1, Math.round(height * fieldScale));
      if (!raf) render();
      wake();
    };

    const onPointerMove = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      pointer.x = event.clientX - rect.left;
      pointer.y = event.clientY - rect.top;
      pointer.inside = pointer.x >= 0 && pointer.y >= 0 && pointer.x <= rect.width && pointer.y <= rect.height;
      wake();
    };

    const onPointerLeave = () => {
      pointer.inside = false;
      wake();
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
    document.documentElement.addEventListener('pointerleave', onPointerLeave);
    document.addEventListener('visibilitychange', onVisibility);
    resize();

    let lastQuality = settingsRef.current.quality;
    let lastDpr = settingsRef.current.dpr;
    wakeRef.current = () => {
      const s = settingsRef.current;
      if (s.quality !== lastQuality || s.dpr !== lastDpr) {
        lastQuality = s.quality;
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
      document.documentElement.removeEventListener('pointerleave', onPointerLeave);
      document.removeEventListener('visibilitychange', onVisibility);
      if (texture) gl.deleteTexture(texture);
      gl.deleteFramebuffer(framebuffer);
      gl.deleteProgram(fieldProgram.program);
      gl.deleteProgram(compositeProgram.program);
      gl.deleteBuffer(buffer);
      gl.deleteVertexArray(vao);
    };
  }, []);

  useEffect(() => {
    wakeRef.current?.();
  });

  return (
    <div
      ref={containerRef}
      className={`beams-container${className ? ` ${className}` : ''}`}
      style={backgroundColor ? { background: backgroundColor, ...style } : style}
      {...rest}
    >
      <canvas ref={canvasRef} className="beams-canvas" aria-hidden="true" />
    </div>
  );
};

export default Beams;
