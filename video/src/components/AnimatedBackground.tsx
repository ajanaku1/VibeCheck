import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { COLORS } from '../constants';

type Orb = {
  baseX: number;
  baseY: number;
  size: number;
  color: string;
  blur: number;
  opacity: number;
  speed: number;
};

const DEFAULT_ORBS: Orb[] = [
  { baseX: 250, baseY: 200, size: 300, color: COLORS.accent, blur: 60, opacity: 0.08, speed: 0.006 },
  { baseX: 1550, baseY: 780, size: 260, color: COLORS.accentDim, blur: 50, opacity: 0.06, speed: 0.005 },
  { baseX: 960, baseY: 500, size: 350, color: COLORS.purple, blur: 70, opacity: 0.05, speed: 0.008 },
];

export const AnimatedBackground: React.FC<{ orbs?: Orb[] }> = ({ orbs = DEFAULT_ORBS }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      {orbs.map((orb, i) => {
        const x = orb.baseX + Math.sin(frame * orb.speed + i * 1.5) * 90;
        const y = orb.baseY + Math.cos(frame * orb.speed + i * 2.1) * 70;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x - orb.size / 2,
              top: y - orb.size / 2,
              width: orb.size,
              height: orb.size,
              borderRadius: '50%',
              background: orb.color,
              filter: `blur(${orb.blur}px)`,
              opacity: orb.opacity,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};
