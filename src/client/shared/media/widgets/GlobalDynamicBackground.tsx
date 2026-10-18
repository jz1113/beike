import React from 'react';
import { useAppTheme } from '@client/shared/hooks/useAppTheme';
import { AppBackgroundLayer } from '@client/shared/media/backgrounds/AppBackgroundLayer';

export const GlobalDynamicBackground: React.FC = React.memo(() => {
  const { isDark, backgroundStyle, backgroundStudios } = useAppTheme();
  const studio = backgroundStyle === 'clean' ? undefined : backgroundStudios[backgroundStyle];

  return (
    <div
      className="fixed inset-0 pointer-events-none overflow-hidden z-0 select-none"
      aria-hidden="true"
    >
      <AppBackgroundLayer
        style={backgroundStyle}
        isDark={isDark}
        studio={studio}
      />
    </div>
  );
});

export default GlobalDynamicBackground;
