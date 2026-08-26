import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate, Img, staticFile } from 'remotion';
import { COLORS } from '../constants';
import { SERIF, INTER } from '../fonts';
import { AnimatedBackground } from '../components/AnimatedBackground';

export const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoProg = spring({ frame: frame - 10, fps, config: { mass: 1.2, damping: 12, stiffness: 100 } });
  const logoScale = interpolate(logoProg, [0, 1], [0, 1]);
  const logoOp = interpolate(logoProg, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' });

  const tagProg = spring({ frame: frame - 40, fps, config: { mass: 1, damping: 15, stiffness: 80 } });
  const tagOp = interpolate(tagProg, [0, 0.4], [0, 1], { extrapolateRight: 'clamp' });
  const tagY = interpolate(tagProg, [0, 1], [20, 0]);

  const subProg = spring({ frame: frame - 65, fps, config: { mass: 1, damping: 15, stiffness: 80 } });
  const subOp = interpolate(subProg, [0, 0.4], [0, 1], { extrapolateRight: 'clamp' });
  const subY = interpolate(subProg, [0, 1], [16, 0]);

  return (
    <AbsoluteFill style={{ background: COLORS.bg }}>
      <AnimatedBackground />
      <AbsoluteFill
        style={{
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 10,
        }}
      >
        <Img
          src={staticFile('assets/dashboard.png')}
          style={{
            width: 120,
            height: 120,
            borderRadius: 28,
            opacity: logoOp,
            transform: `scale(${logoScale})`,
            boxShadow: `0 0 60px ${COLORS.accent}40`,
            marginBottom: 32,
          }}
        />
        <div
          style={{
            fontFamily: SERIF,
            fontSize: 88,
            fontWeight: 400,
            color: COLORS.white,
            opacity: logoOp,
            textShadow: `0 0 40px ${COLORS.accent}30`,
            marginBottom: 16,
          }}
        >
          VibeCheck
        </div>
        <div
          style={{
            fontFamily: INTER,
            fontSize: 28,
            fontWeight: 500,
            color: COLORS.offWhite,
            opacity: tagOp,
            transform: `translateY(${tagY}px)`,
            letterSpacing: 4,
            marginBottom: 48,
          }}
        >
          KNOW YOUR COMMUNITY
        </div>
        <div
          style={{
            fontFamily: INTER,
            fontSize: 20,
            fontWeight: 400,
            color: COLORS.accent,
            opacity: subOp,
            transform: `translateY(${subY}px)`,
            fontStyle: 'italic',
          }}
        >
          "The pulse of your community, always on."
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
