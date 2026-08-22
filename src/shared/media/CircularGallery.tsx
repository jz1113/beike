'use client';

import React, { useEffect, useRef } from 'react';
import { Camera, Mesh, Plane, Program, Renderer, Texture, Transform } from 'ogl';
import './CircularGallery.css';

export interface GalleryItem {
  image: string;
  text?: string;
  id?: string;
  data?: any;
}

export interface CircularGalleryProps {
  items: GalleryItem[];
  bend?: number;
  textColor?: string;
  borderRadius?: number;
  font?: string;
  fontUrl?: string;
  scrollSpeed?: number;
  scrollEase?: number;
  onItemClick?: (item: GalleryItem, index: number) => void;
  className?: string;
  style?: React.CSSProperties;
}

function debounce<T extends (...args: any[]) => void>(func: T, wait: number) {
  let timeout: any;
  return function (this: any, ...args: Parameters<T>) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

function lerp(p1: number, p2: number, t: number) {
  return p1 + (p2 - p1) * t;
}

function autoBind(instance: any) {
  const proto = Object.getPrototypeOf(instance);
  Object.getOwnPropertyNames(proto).forEach(key => {
    if (key !== 'constructor' && typeof instance[key] === 'function') {
      instance[key] = instance[key].bind(instance);
    }
  });
}

function getFontSize(font: string) {
  const match = font.match(/(\d+)px/);
  return match ? parseInt(match[1], 10) : 24;
}

function createTextTexture(gl: any, text: string, font = 'bold 24px system-ui, sans-serif', color = '#ffffff') {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) {
    const texture = new Texture(gl, { generateMipmaps: false });
    return { texture, width: 100, height: 40 };
  }

  context.font = font;
  const metrics = context.measureText(text);
  const textWidth = Math.ceil(metrics.width);
  const textHeight = Math.ceil(getFontSize(font) * 1.3);
  canvas.width = textWidth + 24;
  canvas.height = textHeight + 24;

  context.font = font;
  context.fillStyle = color;
  context.textBaseline = 'middle';
  context.textAlign = 'center';
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new Texture(gl, { generateMipmaps: false });
  texture.image = canvas;
  return { texture, width: canvas.width, height: canvas.height };
}

class Title {
  gl: any;
  plane: any;
  renderer: any;
  text: string;
  textColor: string;
  font: string;
  mesh: any;

  constructor({ gl, plane, renderer, text, textColor = '#ffffff', font = '24px system-ui, sans-serif' }: any) {
    autoBind(this);
    this.gl = gl;
    this.plane = plane;
    this.renderer = renderer;
    this.text = text || '';
    this.textColor = textColor;
    this.font = font;
    if (this.text) {
      this.createMesh();
    }
  }

  createMesh() {
    const { texture, width, height } = createTextTexture(this.gl, this.text, this.font, this.textColor);
    const geometry = new Plane(this.gl);
    const program = new Program(this.gl, {
      vertex: `
        attribute vec3 position;
        attribute vec2 uv;
        uniform mat4 modelViewMatrix;
        uniform mat4 projectionMatrix;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragment: `
        precision highp float;
        uniform sampler2D tMap;
        varying vec2 vUv;
        void main() {
          vec4 color = texture2D(tMap, vUv);
          if (color.a < 0.05) discard;
          gl_FragColor = color;
        }
      `,
      uniforms: { tMap: { value: texture } },
      transparent: true
    });
    this.mesh = new Mesh(this.gl, { geometry, program });
    const aspect = width / height;
    const textHeight = this.plane.scale.y * 0.14;
    const textWidth = textHeight * aspect;
    this.mesh.scale.set(textWidth, textHeight, 1);
    this.mesh.position.y = -this.plane.scale.y * 0.5 - textHeight * 0.5 - 0.08;
    this.mesh.setParent(this.plane);
  }
}

class Media {
  extra: number;
  geometry: any;
  gl: any;
  image: string;
  index: number;
  length: number;
  renderer: any;
  scene: any;
  screen: any;
  text: string;
  viewport: any;
  bend: number;
  textColor: string;
  borderRadius: number;
  font: string;
  program: any;
  plane: any;
  title: any;
  speed: number = 0;
  isBefore: boolean = false;
  isAfter: boolean = false;
  widthTotal: number = 0;
  width: number = 0;
  x: number = 0;
  scale: number = 1;
  padding: number = 2;
  rawItem: GalleryItem;

  constructor({
    geometry,
    gl,
    image,
    index,
    length,
    renderer,
    scene,
    screen,
    text,
    viewport,
    bend,
    textColor,
    borderRadius = 0.05,
    font,
    rawItem
  }: any) {
    this.extra = 0;
    this.geometry = geometry;
    this.gl = gl;
    this.image = image;
    this.index = index;
    this.length = length;
    this.renderer = renderer;
    this.scene = scene;
    this.screen = screen;
    this.text = text;
    this.viewport = viewport;
    this.bend = bend;
    this.textColor = textColor;
    this.borderRadius = borderRadius;
    this.font = font;
    this.rawItem = rawItem;
    this.createShader();
    this.createMesh();
    this.createTitle();
    this.onResize();
  }

  createShader() {
    const texture = new Texture(this.gl, {
      generateMipmaps: true
    });
    this.program = new Program(this.gl, {
      depthTest: false,
      depthWrite: false,
      vertex: `
        precision highp float;
        attribute vec3 position;
        attribute vec2 uv;
        uniform mat4 modelViewMatrix;
        uniform mat4 projectionMatrix;
        uniform float uTime;
        uniform float uSpeed;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec3 p = position;
          p.z = (sin(p.x * 4.0 + uTime) * 1.2 + cos(p.y * 2.0 + uTime) * 1.2) * (0.08 + uSpeed * 0.4);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragment: `
        precision highp float;
        uniform vec2 uImageSizes;
        uniform vec2 uPlaneSizes;
        uniform sampler2D tMap;
        uniform float uBorderRadius;
        varying vec2 vUv;
        
        float roundedBoxSDF(vec2 p, vec2 b, float r) {
          vec2 d = abs(p) - b;
          return length(max(d, vec2(0.0))) + min(max(d.x, d.y), 0.0) - r;
        }
        
        void main() {
          vec2 ratio = vec2(
            min((uPlaneSizes.x / uPlaneSizes.y) / max((uImageSizes.x / max(uImageSizes.y, 1.0)), 0.001), 1.0),
            min((uPlaneSizes.y / uPlaneSizes.x) / max((uImageSizes.y / max(uImageSizes.x, 1.0)), 0.001), 1.0)
          );
          vec2 uv = vec2(
            vUv.x * ratio.x + (1.0 - ratio.x) * 0.5,
            vUv.y * ratio.y + (1.0 - ratio.y) * 0.5
          );
          vec4 color = texture2D(tMap, uv);
          
          float d = roundedBoxSDF(vUv - 0.5, vec2(0.5 - uBorderRadius), uBorderRadius);
          float edgeSmooth = 0.003;
          float alpha = 1.0 - smoothstep(-edgeSmooth, edgeSmooth, d);
          
          gl_FragColor = vec4(color.rgb, alpha);
        }
      `,
      uniforms: {
        tMap: { value: texture },
        uPlaneSizes: { value: [0, 0] },
        uImageSizes: { value: [0, 0] },
        uSpeed: { value: 0 },
        uTime: { value: 100 * Math.random() },
        uBorderRadius: { value: this.borderRadius }
      },
      transparent: true
    });

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = this.image;
    img.onload = () => {
      texture.image = img;
      this.program.uniforms.uImageSizes.value = [img.naturalWidth, img.naturalHeight];
    };
  }

  createMesh() {
    this.plane = new Mesh(this.gl, {
      geometry: this.geometry,
      program: this.program
    });
    this.plane.setParent(this.scene);
  }

  createTitle() {
    this.title = new Title({
      gl: this.gl,
      plane: this.plane,
      renderer: this.renderer,
      text: this.text,
      textColor: this.textColor,
      font: this.font
    });
  }

  update(scroll: any, direction: string) {
    this.plane.position.x = this.x - scroll.current - this.extra;

    const x = this.plane.position.x;
    const H = this.viewport.width / 2;

    if (this.bend === 0) {
      this.plane.position.y = 0;
      this.plane.rotation.z = 0;
    } else {
      const B_abs = Math.abs(this.bend);
      const R = (H * H + B_abs * B_abs) / (2 * B_abs);
      const effectiveX = Math.min(Math.abs(x), H);

      const arc = R - Math.sqrt(Math.max(0, R * R - effectiveX * effectiveX));
      if (this.bend > 0) {
        this.plane.position.y = -arc;
        this.plane.rotation.z = -Math.sign(x) * Math.asin(effectiveX / R);
      } else {
        this.plane.position.y = arc;
        this.plane.rotation.z = Math.sign(x) * Math.asin(effectiveX / R);
      }
    }

    this.speed = scroll.current - scroll.last;
    this.program.uniforms.uTime.value += 0.03;
    this.program.uniforms.uSpeed.value = this.speed;

    const planeOffset = this.plane.scale.x / 2;
    const viewportOffset = this.viewport.width / 2;
    this.isBefore = this.plane.position.x + planeOffset < -viewportOffset;
    this.isAfter = this.plane.position.x - planeOffset > viewportOffset;
    if (direction === 'right' && this.isBefore) {
      this.extra -= this.widthTotal;
      this.isBefore = this.isAfter = false;
    }
    if (direction === 'left' && this.isAfter) {
      this.extra += this.widthTotal;
      this.isBefore = this.isAfter = false;
    }
  }

  onResize({ screen, viewport }: any = {}) {
    if (screen) this.screen = screen;
    if (viewport) {
      this.viewport = viewport;
      if (this.plane.program.uniforms.uViewportSizes) {
        this.plane.program.uniforms.uViewportSizes.value = [this.viewport.width, this.viewport.height];
      }
    }
    this.scale = (this.screen?.height || 800) / 1400;
    this.plane.scale.y = ((this.viewport?.height || 10) * (780 * this.scale)) / (this.screen?.height || 800);
    this.plane.scale.x = ((this.viewport?.width || 10) * (620 * this.scale)) / (this.screen?.width || 1200);
    this.plane.program.uniforms.uPlaneSizes.value = [this.plane.scale.x, this.plane.scale.y];
    this.padding = 1.6;
    this.width = this.plane.scale.x + this.padding;
    this.widthTotal = this.width * this.length;
    this.x = this.width * this.index;
  }
}

class App {
  container: HTMLElement;
  scrollSpeed: number;
  scroll: { ease: number; current: number; target: number; last: number; position?: number };
  onCheckDebounce: any;
  renderer: any;
  gl: any;
  camera: any;
  scene: any;
  planeGeometry: any;
  medias: Media[] = [];
  mediasImages: GalleryItem[] = [];
  screen: any;
  viewport: any;
  isDown: boolean = false;
  start: number = 0;
  raf: number = 0;
  onItemClick?: (item: GalleryItem, index: number) => void;
  dragDistance: number = 0;
  startX: number = 0;
  startY: number = 0;
  isRendering: boolean = true;
  disposed: boolean = false;

  boundOnResize: any;
  boundOnWheel: any;
  boundOnTouchDown: any;
  boundOnTouchMove: any;
  boundOnTouchUp: any;
  boundOnKeyDown: any;

  constructor(
    container: HTMLElement,
    {
      items,
      bend = 2.5,
      textColor = '#ffffff',
      borderRadius = 0.05,
      font = 'bold 24px system-ui, sans-serif',
      scrollSpeed = 2,
      scrollEase = 0.06,
      onItemClick
    }: any = {}
  ) {
    this.container = container;
    this.scrollSpeed = scrollSpeed;
    this.scroll = { ease: scrollEase, current: 0, target: 0, last: 0 };
    this.onItemClick = onItemClick;
    this.onCheckDebounce = debounce(this.onCheck.bind(this), 200);
    this.createRenderer();
    this.createCamera();
    this.createScene();
    this.onResize();
    this.createGeometry();
    this.createMedias(items, bend, textColor, borderRadius, font);
    this.update();
    this.addEventListeners();
  }

  createRenderer() {
    this.renderer = new Renderer({
      alpha: true,
      antialias: true,
      dpr: Math.min(window.devicePixelRatio || 1, 2)
    });
    this.gl = this.renderer.gl;
    this.gl.clearColor(0, 0, 0, 0);
    this.container.appendChild(this.gl.canvas);
  }

  createCamera() {
    this.camera = new Camera(this.gl);
    this.camera.fov = 45;
    this.camera.position.z = 20;
  }

  createScene() {
    this.scene = new Transform();
  }

  createGeometry() {
    this.planeGeometry = new Plane(this.gl, {
      heightSegments: 40,
      widthSegments: 80
    });
  }

  createMedias(items: GalleryItem[], bend = 2.5, textColor: string, borderRadius: number, font: string) {
    const galleryItems = items && items.length ? items : [];
    if (galleryItems.length === 0) return;

    // Multiply items for smooth looping
    const multiplier = galleryItems.length < 5 ? 4 : galleryItems.length < 8 ? 3 : 2;
    let expanded: GalleryItem[] = [];
    for (let i = 0; i < multiplier; i++) {
      expanded = expanded.concat(galleryItems);
    }
    this.mediasImages = expanded;

    this.medias = this.mediasImages.map((data, index) => {
      return new Media({
        geometry: this.planeGeometry,
        gl: this.gl,
        image: data.image,
        index,
        length: this.mediasImages.length,
        renderer: this.renderer,
        scene: this.scene,
        screen: this.screen,
        text: data.text,
        viewport: this.viewport,
        bend,
        textColor,
        borderRadius,
        font,
        rawItem: data
      });
    });
  }

  onTouchDown(e: any) {
    this.isDown = true;
    this.scroll.position = this.scroll.current;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    this.start = clientX;
    this.startX = clientX;
    this.startY = clientY;
    this.dragDistance = 0;
  }

  onTouchMove(e: any) {
    if (!this.isDown) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const deltaX = clientX - this.startX;
    const deltaY = clientY - this.startY;
    this.dragDistance = Math.hypot(deltaX, deltaY);

    const distance = (this.start - clientX) * (this.scrollSpeed * 0.025);
    this.scroll.target = (this.scroll.position || 0) + distance;
    this.wakeUp();
  }

  wakeUp() {
    if (!this.isRendering && !this.disposed) {
      this.isRendering = true;
      this.raf = window.requestAnimationFrame(this.update.bind(this));
    }
  }

  onTouchUp() {
    if (this.isDown && this.dragDistance < 6 && this.onItemClick && this.medias.length > 0) {
      // Find closest centered media item
      let closest: Media | null = null;
      let minDistance = Infinity;
      this.medias.forEach(m => {
        const d = Math.abs(m.plane.position.x);
        if (d < minDistance) {
          minDistance = d;
          closest = m;
        }
      });
      if (closest) {
        this.onItemClick((closest as any).rawItem, (closest as any).index);
      }
    }
    this.isDown = false;
    this.onCheck();
    this.wakeUp();
  }

  onWheel(e: any) {
    const delta = e.deltaY || e.wheelDelta || e.detail;
    this.scroll.target += (delta > 0 ? this.scrollSpeed : -this.scrollSpeed) * 0.25;
    this.onCheckDebounce();
    this.wakeUp();
  }

  onKeyDown(e: KeyboardEvent) {
    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        this.scroll.target += this.scrollSpeed * 6;
        this.onCheckDebounce();
        this.wakeUp();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        this.scroll.target -= this.scrollSpeed * 6;
        this.onCheckDebounce();
        this.wakeUp();
        break;
      case 'Home':
        e.preventDefault();
        this.scroll.target = 0;
        this.onCheckDebounce();
        this.wakeUp();
        break;
    }
  }

  onCheck() {
    if (!this.medias || !this.medias[0]) return;
    const width = this.medias[0].width;
    const itemIndex = Math.round(Math.abs(this.scroll.target) / width);
    const item = width * itemIndex;
    this.scroll.target = this.scroll.target < 0 ? -item : item;
  }

  onResize() {
    if (!this.container) return;
    this.screen = {
      width: this.container.clientWidth || 800,
      height: this.container.clientHeight || 560
    };
    if (this.renderer) {
      this.renderer.setSize(this.screen.width, this.screen.height);
    }
    if (this.camera) {
      this.camera.perspective({
        aspect: this.screen.width / Math.max(this.screen.height, 1)
      });
      const fov = (this.camera.fov * Math.PI) / 180;
      const height = 2 * Math.tan(fov / 2) * this.camera.position.z;
      const width = height * this.camera.aspect;
      this.viewport = { width, height };
    }
    if (this.medias) {
      this.medias.forEach(media => media.onResize({ screen: this.screen, viewport: this.viewport }));
    }
    this.wakeUp();
  }

  update() {
    if (this.disposed) return;
    this.scroll.current = lerp(this.scroll.current, this.scroll.target, this.scroll.ease);
    const direction = this.scroll.current > this.scroll.last ? 'right' : 'left';
    if (this.medias) {
      this.medias.forEach(media => media.update(this.scroll, direction));
    }
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render({ scene: this.scene, camera: this.camera });
    }
    this.scroll.last = this.scroll.current;

    // 🌟 智能休眠机制：当画面静止且用户未按住时，自动停止 RAF 循环，彻底释放 GPU
    const delta = Math.abs(this.scroll.target - this.scroll.current);
    if (delta < 0.0005 && !this.isDown) {
      this.scroll.current = this.scroll.target;
      this.isRendering = false;
      return;
    }

    this.raf = window.requestAnimationFrame(this.update.bind(this));
  }

  addEventListeners() {
    this.boundOnResize = this.onResize.bind(this);
    this.boundOnWheel = this.onWheel.bind(this);
    this.boundOnTouchDown = this.onTouchDown.bind(this);
    this.boundOnTouchMove = this.onTouchMove.bind(this);
    this.boundOnTouchUp = this.onTouchUp.bind(this);
    this.boundOnKeyDown = this.onKeyDown.bind(this);

    window.addEventListener('resize', this.boundOnResize);
    
    if (this.container) {
      this.container.addEventListener('wheel', this.boundOnWheel, { passive: true });
      this.container.addEventListener('mousedown', this.boundOnTouchDown);
      this.container.addEventListener('touchstart', this.boundOnTouchDown, { passive: true });
      this.container.addEventListener('keydown', this.boundOnKeyDown);
    }

    window.addEventListener('mousemove', this.boundOnTouchMove);
    window.addEventListener('mouseup', this.boundOnTouchUp);
    window.addEventListener('touchmove', this.boundOnTouchMove, { passive: true });
    window.addEventListener('touchend', this.boundOnTouchUp);
  }

  destroy() {
    this.disposed = true;
    this.isRendering = false;
    window.cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.boundOnResize);
    
    if (this.container) {
      this.container.removeEventListener('wheel', this.boundOnWheel);
      this.container.removeEventListener('mousedown', this.boundOnTouchDown);
      this.container.removeEventListener('touchstart', this.boundOnTouchDown);
      this.container.removeEventListener('keydown', this.boundOnKeyDown);
    }

    window.removeEventListener('mousemove', this.boundOnTouchMove);
    window.removeEventListener('mouseup', this.boundOnTouchUp);
    window.removeEventListener('touchmove', this.boundOnTouchMove);
    window.removeEventListener('touchend', this.boundOnTouchUp);

    try {
      if (this.renderer?.gl?.canvas?.parentNode === this.container) {
        this.container.removeChild(this.renderer.gl.canvas);
      }
    } catch {}
    try {
      this.renderer?.gl?.getExtension('WEBGL_lose_context')?.loseContext();
    } catch {}
  }
}

export const CircularGallery: React.FC<CircularGalleryProps> = ({
  items = [],
  bend = 2.5,
  textColor = '#1e293b',
  borderRadius = 0.05,
  font = 'bold 24px system-ui, -apple-system, sans-serif',
  scrollSpeed = 2,
  scrollEase = 0.06,
  onItemClick,
  className = '',
  style
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !items || items.length === 0) return;

    let app: App;
    try {
      app = new App(container, {
        items,
        bend,
        textColor,
        borderRadius,
        font,
        scrollSpeed,
        scrollEase,
        onItemClick
      });
    } catch (e) {
      console.warn('CircularGallery WebGL init failed:', e);
    }

    return () => {
      if (app) app.destroy();
    };
  }, [items, bend, textColor, borderRadius, font, scrollSpeed, scrollEase, onItemClick]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onCleanup = () => {
      const canvas = container.querySelector('canvas');
      if (canvas) {
        try {
          canvas.getContext('webgl')?.getExtension('WEBGL_lose_context')?.loseContext();
          canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();
        } catch {
          /* ignore */
        }
      }
    };

    window.addEventListener('azhuo:memory-cleanup', onCleanup);
    return () => window.removeEventListener('azhuo:memory-cleanup', onCleanup);
  }, []);

  return (
    <div
      className={`circular-gallery ${className}`.trim()}
      ref={containerRef}
      tabIndex={0}
      role="region"
      aria-label="3D Circular image gallery. Drag or scroll to browse assets."
      style={style}
    />
  );
};

export default CircularGallery;
