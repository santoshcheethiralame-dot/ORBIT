import React from 'react';

export const SpaceBackground = () => (
  <div className="fixed inset-0 z-[-1] bg-ink pointer-events-none" aria-hidden="true">
    <div
      className="absolute inset-0 opacity-[0.025]"
      style={{
        backgroundImage:
          'linear-gradient(rgba(255,255,255,0.7) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.7) 1px, transparent 1px)',
        backgroundSize: '64px 64px',
        maskImage: 'radial-gradient(ellipse at 50% 0%, black 0%, transparent 75%)',
        WebkitMaskImage: 'radial-gradient(ellipse at 50% 0%, black 0%, transparent 75%)',
      }}
    />
  </div>
);
