import { useEffect, useRef } from 'react';
import './TiltedCard.css';

const REST = { rotateX: 0, rotateY: 0, scale: 1, lift: 0, opacity: 0, x: 0, y: 0, captionRotation: 0 };

export default function TiltedCard({
  imageSrc,
  altText = 'Tilted card image',
  captionText = '',
  containerHeight = '300px',
  containerWidth = '100%',
  imageHeight = '300px',
  imageWidth = '300px',
  scaleOnHover = 1.1,
  rotateAmplitude = 14,
  showMobileWarning = true,
  showTooltip = true,
  overlayContent = null,
  displayOverlayContent = false,
}) {
  const figureRef = useRef(null);
  const innerRef = useRef(null);
  const captionRef = useRef(null);
  const targetRef = useRef({ ...REST });
  const currentRef = useRef({ ...REST });
  const frameRef = useRef(0);
  const lastYRef = useRef(0);

  useEffect(() => () => window.cancelAnimationFrame(frameRef.current), []);

  const animate = () => {
    if (frameRef.current) return;
    const frame = () => {
      const current = currentRef.current;
      const target = targetRef.current;
      let moving = false;
      for (const key of Object.keys(REST)) {
        const delta = target[key] - current[key];
        if (Math.abs(delta) > 0.01) {
          current[key] += delta * 0.22;
          moving = true;
        } else current[key] = target[key];
      }
      if (innerRef.current) {
        innerRef.current.style.transform = `translateY(${current.lift}px) rotateX(${current.rotateX}deg) rotateY(${current.rotateY}deg) scale(${current.scale})`;
      }
      if (captionRef.current) {
        captionRef.current.style.transform = `translate(${current.x}px, ${current.y}px) rotate(${current.captionRotation}deg)`;
        captionRef.current.style.opacity = String(current.opacity);
      }
      frameRef.current = moving ? window.requestAnimationFrame(frame) : 0;
    };
    frameRef.current = window.requestAnimationFrame(frame);
  };

  const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const handlePointerMove = (event) => {
    if (!figureRef.current || event.pointerType === 'touch' || reducedMotion()) return;
    const rect = figureRef.current.getBoundingClientRect();
    const offsetX = event.clientX - rect.left - rect.width / 2;
    const offsetY = event.clientY - rect.top - rect.height / 2;
    targetRef.current.rotateX = (offsetY / (rect.height / 2)) * -rotateAmplitude;
    targetRef.current.rotateY = (offsetX / (rect.width / 2)) * rotateAmplitude;
    targetRef.current.x = event.clientX - rect.left;
    targetRef.current.y = event.clientY - rect.top;
    targetRef.current.captionRotation = -(offsetY - lastYRef.current) * 0.6;
    lastYRef.current = offsetY;
    animate();
  };
  const handlePointerEnter = (event) => {
    if (event.pointerType === 'touch' || reducedMotion()) return;
    targetRef.current.scale = scaleOnHover;
    targetRef.current.lift = -5;
    targetRef.current.opacity = 1;
    animate();
  };
  const handlePointerLeave = () => {
    targetRef.current = { ...REST };
    animate();
  };

  return (
    <figure
      ref={figureRef}
      className="tilted-card-figure"
      style={{ height: containerHeight, width: containerWidth }}
      onPointerMove={handlePointerMove}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onPointerCancel={handlePointerLeave}
    >
      {showMobileWarning && <div className="tilted-card-mobile-alert">This effect is not optimized for mobile. Check on desktop.</div>}
      <div ref={innerRef} className="tilted-card-inner" style={{ width: imageWidth, height: imageHeight }}>
        <img src={imageSrc} alt={altText} draggable={false} className="tilted-card-img" style={{ width: imageWidth, height: imageHeight }} />
        {displayOverlayContent && overlayContent && <div className="tilted-card-overlay">{overlayContent}</div>}
      </div>
      {showTooltip && <figcaption ref={captionRef} className="tilted-card-caption">{captionText}</figcaption>}
    </figure>
  );
}
