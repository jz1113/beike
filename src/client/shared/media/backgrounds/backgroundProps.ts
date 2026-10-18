import type { AeroShardsProps } from '@client/shared/media/widgets/backgrounds/AeroShards';
import type { BeamsProps } from '@client/shared/media/widgets/backgrounds/Beams';
import type { GalaxyDirection, GalaxyProps } from '@client/shared/media/widgets/backgrounds/Galaxy';
import type { LightRaysProps, RaysOrigin } from '@client/shared/media/widgets/backgrounds/LightRays';
import type { ParticlesDrift, ParticlesHoverEffect, ParticlesProps, ParticlesShape } from '@client/shared/media/widgets/backgrounds/Particles';
import type { AppBackgroundStyle } from './backgroundCatalog';
import {
  isDynamicStyle,
  normalizeStudio,
  type StudioRenderContext,
  type StudioValues,
} from './studio';

type DotShape = 'circle' | 'square';

export type BackgroundWidgetProps =
  | { kind: 'shards'; props: AeroShardsProps }
  | { kind: 'beams'; props: BeamsProps }
  | { kind: 'rays'; props: LightRaysProps }
  | { kind: 'dots'; props: {
      dotSize: number;
      gap: number;
      baseColor: string;
      activeColor: string;
      proximity: number;
      strength: number;
      bounce: number;
      tension: number;
      returnDuration: number;
      shockRadius: number;
      shockStrength: number;
      swell: number;
      stretch: number;
      glow: number;
      shape: DotShape;
      fade: number;
      opacity: number;
      intro: boolean;
      mouseInteraction: boolean;
      clickShock: boolean;
      dpr?: number;
    } }
  | { kind: 'galaxy'; props: GalaxyProps }
  | { kind: 'particles'; props: ParticlesProps };

function num(values: StudioValues, key: string) {
  const value = values[key];
  return typeof value === 'number' ? value : 0;
}

function text(values: StudioValues, key: string) {
  const value = values[key];
  return typeof value === 'string' ? value : '';
}

function flag(values: StudioValues, key: string) {
  return values[key] === true;
}

function motion(ctx: StudioRenderContext, enabled: boolean) {
  return ctx.mode !== 'thumb' && enabled;
}

function pixelRatio(ctx: StudioRenderContext) {
  return ctx.mode === 'live' ? undefined : 1;
}

function countFor(value: number, ctx: StudioRenderContext) {
  if (ctx.mode === 'thumb') return Math.max(30, Math.round(value * 0.22));
  if (ctx.mode === 'stage') return Math.max(60, Math.round(value * 0.62));
  return Math.round(value);
}

function shardLight(values: StudioValues, isDark: boolean) {
  const appearance = text(values, 'appearance');
  if (appearance === 'light') return true;
  if (appearance === 'dark') return false;
  return !isDark;
}

export function buildBackgroundProps(
  style: AppBackgroundStyle,
  studio: StudioValues | undefined,
  ctx: StudioRenderContext,
): BackgroundWidgetProps | null {
  if (!isDynamicStyle(style)) return null;
  const values = normalizeStudio(style, studio);
  const dpr = pixelRatio(ctx);
  const lightMode = !ctx.isDark;

  if (style === 'shards') {
    return {
      kind: 'shards',
      props: {
        lightMode: shardLight(values, ctx.isDark),
        accentColor: text(values, 'accentColor'),
        shardColor: text(values, 'shardColor'),
        backgroundColor: 'transparent',
        placement: text(values, 'placement') as AeroShardsProps['placement'],
        material: text(values, 'material') as AeroShardsProps['material'],
        markers: text(values, 'markers') as AeroShardsProps['markers'],
        count: countFor(num(values, 'count'), ctx),
        shardSize: num(values, 'shardSize'),
        spread: num(values, 'spread'),
        twist: num(values, 'twist'),
        billow: num(values, 'billow'),
        speed: num(values, 'speed'),
        scale: num(values, 'scale'),
        depthOfField: num(values, 'depthOfField'),
        glow: num(values, 'glow'),
        grain: num(values, 'grain'),
        vignette: num(values, 'vignette'),
        intro: motion(ctx, flag(values, 'intro')),
        mouseInteraction: motion(ctx, flag(values, 'cursor')),
        mouseStrength: num(values, 'cursorStrength'),
        pulseOnClick: motion(ctx, flag(values, 'pulseOnClick')),
        holdToGather: motion(ctx, flag(values, 'holdToGather')),
        parallax: num(values, 'parallax'),
        dpr,
      },
    };
  }

  if (style === 'beams') {
    return {
      kind: 'beams',
      props: {
        lightMode,
        color: text(values, 'color'),
        backgroundColor: 'transparent',
        beamWidth: num(values, 'beamWidth'),
        rotation: num(values, 'rotation'),
        speed: num(values, 'speed'),
        waveLength: num(values, 'waveLength'),
        depth: num(values, 'depth'),
        sharpness: num(values, 'sharpness'),
        twist: num(values, 'twist'),
        fillLight: num(values, 'fillLight'),
        glow: num(values, 'glow'),
        brightness: num(values, 'brightness'),
        variation: num(values, 'variation'),
        grain: num(values, 'grain'),
        quality: ctx.mode === 'thumb' ? 0.4 : ctx.mode === 'stage' ? 0.6 : 0.75,
        mouseInteraction: motion(ctx, flag(values, 'mouseInteraction')),
        mouseStrength: num(values, 'mouseStrength'),
        intro: motion(ctx, flag(values, 'intro')),
        fade: num(values, 'fade'),
        opacity: num(values, 'opacity'),
        dpr,
      },
    };
  }

  if (style === 'rays') {
    return {
      kind: 'rays',
      props: {
        lightMode,
        raysOrigin: text(values, 'raysOrigin') as RaysOrigin,
        raysColor: text(values, 'raysColor'),
        raysSpeed: num(values, 'raysSpeed'),
        lightSpread: num(values, 'lightSpread'),
        rayLength: num(values, 'rayLength'),
        rayDensity: num(values, 'rayDensity'),
        tilt: num(values, 'tilt'),
        raySharpness: num(values, 'raySharpness'),
        glow: num(values, 'glow'),
        haze: num(values, 'haze'),
        atmosphere: num(values, 'atmosphere'),
        intensity: num(values, 'intensity'),
        fadeDistance: num(values, 'fadeDistance'),
        saturation: num(values, 'saturation'),
        followMouse: motion(ctx, flag(values, 'followMouse')),
        mouseInfluence: ctx.mode === 'thumb' ? 0 : num(values, 'mouseInfluence'),
        cursorShadow: motion(ctx, flag(values, 'cursorShadow')),
        clickPulse: motion(ctx, flag(values, 'clickPulse')),
        noiseAmount: num(values, 'noiseAmount'),
        distortion: num(values, 'distortion'),
        pulsating: flag(values, 'pulsating'),
        intro: motion(ctx, flag(values, 'intro')),
        opacity: num(values, 'opacity'),
        maxDevicePixelRatio: ctx.mode === 'live' ? 2 : 1,
      },
    };
  }

  if (style === 'dots') {
    const proximity = num(values, 'proximity');
    const shockRadius = num(values, 'shockRadius');
    const shockStrength = num(values, 'shockStrength');
    return {
      kind: 'dots',
      props: {
        dotSize: num(values, 'dotSize'),
        gap: num(values, 'gap'),
        baseColor: text(values, 'baseColor'),
        activeColor: text(values, 'activeColor'),
        proximity: ctx.mode === 'thumb' ? Math.min(proximity, 48) : proximity,
        strength: num(values, 'strength'),
        bounce: num(values, 'bounce'),
        tension: num(values, 'tension'),
        returnDuration: num(values, 'returnDuration'),
        shockRadius: ctx.mode === 'thumb' ? Math.min(shockRadius, 80) : shockRadius,
        shockStrength: ctx.mode === 'thumb' ? Math.min(shockStrength, 2) : shockStrength,
        swell: num(values, 'swell'),
        stretch: num(values, 'stretch'),
        glow: num(values, 'glow'),
        shape: text(values, 'shape') as DotShape,
        fade: num(values, 'fade'),
        opacity: num(values, 'opacity'),
        intro: motion(ctx, flag(values, 'intro')),
        mouseInteraction: motion(ctx, flag(values, 'mouseInteraction')),
        clickShock: motion(ctx, flag(values, 'clickShock')),
        dpr,
      },
    };
  }

  if (style === 'galaxy') {
    const density = num(values, 'density');
    return {
      kind: 'galaxy',
      props: {
        lightMode,
        transparent: true,
        backgroundColor: 'transparent',
        starColors: [text(values, 'starColor'), text(values, 'starColorAlt')],
        hueShift: num(values, 'hueShift'),
        saturation: num(values, 'saturation'),
        density: ctx.mode === 'thumb' ? Math.max(0.15, density * 0.55) : density,
        glowIntensity: num(values, 'glowIntensity'),
        starSize: num(values, 'starSize'),
        flareIntensity: num(values, 'flareIntensity'),
        twinkleIntensity: num(values, 'twinkleIntensity'),
        starSpeed: num(values, 'starSpeed'),
        speed: num(values, 'speed'),
        rotationSpeed: num(values, 'rotationSpeed'),
        layers: num(values, 'layers'),
        direction: text(values, 'direction') as GalaxyDirection,
        repulsionStrength: num(values, 'repulsionStrength'),
        mouseInteraction: motion(ctx, flag(values, 'mouseInteraction')),
        mouseRepulsion: motion(ctx, flag(values, 'mouseRepulsion')),
        clickWarp: motion(ctx, flag(values, 'clickWarp')),
        intro: motion(ctx, flag(values, 'intro')),
        opacity: num(values, 'opacity'),
        dpr,
      },
    };
  }

  return {
    kind: 'particles',
    props: {
      lightMode,
      particleColors: [text(values, 'color'), text(values, 'colorAlt')],
      shape: text(values, 'shape') as ParticlesShape,
      particleCount: countFor(num(values, 'particleCount'), ctx),
      particleSpread: num(values, 'particleSpread'),
      particleBaseSize: num(values, 'particleBaseSize'),
      sizeRandomness: num(values, 'sizeRandomness'),
      speed: num(values, 'speed'),
      glow: num(values, 'glow'),
      twinkle: num(values, 'twinkle'),
      depthOfField: num(values, 'depthOfField'),
      drift: text(values, 'drift') as ParticlesDrift,
      driftSpeed: num(values, 'driftSpeed'),
      connections: ctx.mode !== 'thumb' && flag(values, 'connections'),
      connectionDistance: num(values, 'connectionDistance'),
      moveParticlesOnHover: motion(ctx, flag(values, 'moveParticlesOnHover')),
      hoverEffect: text(values, 'hoverEffect') as ParticlesHoverEffect,
      particleHoverFactor: num(values, 'particleHoverFactor'),
      hoverRadius: num(values, 'hoverRadius'),
      clickBurst: motion(ctx, flag(values, 'clickBurst')),
      alphaParticles: flag(values, 'alphaParticles'),
      cameraDistance: num(values, 'cameraDistance'),
      disableRotation: flag(values, 'disableRotation'),
      variation: num(values, 'variation'),
      intro: motion(ctx, flag(values, 'intro')),
      opacity: num(values, 'opacity'),
      pixelRatio: dpr,
    },
  };
}
