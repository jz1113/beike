import { useRef } from 'react';
import { motion, useMotionValue, useSpring } from 'motion/react';
import './TiltedCard.css';

const springValues = {
  damping: 24,
  stiffness: 210,
  mass: 0.72
};

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
  displayOverlayContent = false
}) {
  const ref = useRef(null);

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useSpring(0, springValues);
  const rotateY = useSpring(0, springValues);
  const scale = useSpring(1, springValues);
  const lift = useSpring(0, springValues);
  const opacity = useSpring(0);
  const rotateFigcaption = useSpring(0, {
    stiffness: 350,
    damping: 30,
    mass: 1
  });

  // Pointer movement is high frequency; keep this mutable value out of React
  // state so the card can follow the cursor without rerendering on every event.
  const lastY = useRef(0);

  function handlePointerMove(e) {
    if (!ref.current) return;
    if (e.pointerType === 'touch') return;

    const rect = ref.current.getBoundingClientRect();
    const offsetX = e.clientX - rect.left - rect.width / 2;
    const offsetY = e.clientY - rect.top - rect.height / 2;

    const rotationX = (offsetY / (rect.height / 2)) * -rotateAmplitude;
    const rotationY = (offsetX / (rect.width / 2)) * rotateAmplitude;

    rotateX.set(rotationX);
    rotateY.set(rotationY);

    x.set(e.clientX - rect.left);
    y.set(e.clientY - rect.top);

    const velocityY = offsetY - lastY.current;
    rotateFigcaption.set(-velocityY * 0.6);
    lastY.current = offsetY;
  }

  function handlePointerEnter(e) {
    if (e.pointerType === 'touch') return;
    scale.set(scaleOnHover);
    lift.set(-5);
    opacity.set(1);
  }

  function handlePointerLeave() {
    opacity.set(0);
    scale.set(1);
    lift.set(0);
    rotateX.set(0);
    rotateY.set(0);
    rotateFigcaption.set(0);
  }

  return (
    <figure
      ref={ref}
      className="tilted-card-figure"
      style={{
        height: containerHeight,
        width: containerWidth
      }}
      onPointerMove={handlePointerMove}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      {showMobileWarning && (
        <div className="tilted-card-mobile-alert">This effect is not optimized for mobile. Check on desktop.</div>
      )}

      <motion.div
        className="tilted-card-inner"
        style={{
          width: imageWidth,
          height: imageHeight,
          y: lift,
          rotateX,
          rotateY,
          scale,
          transformPerspective: 900
        }}
      >
        <motion.img
          src={imageSrc}
          alt={altText}
          draggable={false}
          className="tilted-card-img"
          style={{
            width: imageWidth,
            height: imageHeight
          }}
        />

        {displayOverlayContent && overlayContent && (
          <motion.div className="tilted-card-overlay">{overlayContent}</motion.div>
        )}
      </motion.div>

      {showTooltip && (
        <motion.figcaption
          className="tilted-card-caption"
          style={{
            x,
            y,
            opacity,
            rotate: rotateFigcaption
          }}
        >
          {captionText}
        </motion.figcaption>
      )}
    </figure>
  );
}
