import React from 'react';
import { interpolate } from 'remotion';
import { COLORS } from '../constants';
import { INTER } from '../fonts';

export const FloatingCallout: React.FC<{
  text: string;
  subtext?: string;
  opacity: number;
  scale: number;
  color?: string;
  style?: React.CSSProperties;
}> = ({ text, subtext, opacity, scale, color, style }) => (
  <div
    style={{
      position: 'absolute',
      opacity,
      transform: `scale(${scale})`,
      background: `${COLORS.bg}e0`,
      border: `2px solid ${color ?? COLORS.accent}`,
      borderRadius: 12,
      padding: '12px 20px',
      maxWidth: 400,
      backdropFilter: 'blur(8px)',
      zIndex: 10,
      ...style,
    }}
  >
    <div
      style={{
        fontFamily: INTER,
        fontSize: 20,
        fontWeight: 700,
        color: color ?? COLORS.accent,
      }}
    >
      {text}
    </div>
    {subtext && (
      <div
        style={{
          fontFamily: INTER,
          fontSize: 14,
          color: COLORS.offWhite,
          marginTop: 4,
        }}
      >
        {subtext}
      </div>
    )}
  </div>
);
