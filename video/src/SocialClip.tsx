import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from 'remotion';
import { COLORS, SOCIAL_DURATION } from './constants';
import { SERIF, INTER } from './fonts';
import { AnimatedBackground } from './components/AnimatedBackground';
import { GlowText } from './components/GlowText';

const VERTICAL_ORBS = [
  { baseX: 200, baseY: 300, size: 400, color: COLORS.accent, blur: 120, opacity: 0.12, speed: 0.006 },
  { baseX: 880, baseY: 1600, size: 360, color: COLORS.accentDim, blur: 110, opacity: 0.10, speed: 0.005 },
  { baseX: 540, baseY: 960, size: 480, color: COLORS.purple, blur: 140, opacity: 0.08, speed: 0.008 },
  { baseX: 100, baseY: 1400, size: 320, color: COLORS.cyan, blur: 100, opacity: 0.07, speed: 0.007 },
];

export const SocialClip: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = SOCIAL_DURATION;

  const exitOp = interpolate(frame, [dur - 20, dur], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ background: COLORS.bg }}>
      <AnimatedBackground orbs={VERTICAL_ORBS} />

      <AbsoluteFill
        style={{
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '80px 60px',
          zIndex: 10,
          opacity: exitOp,
        }}
      >
        <GlowText
          text="47"
          fontSize={140}
          color={COLORS.accent}
          delay={5}
          fontWeight={900}
          glowIntensity={1.5}
          style={{ marginBottom: 8 }}
        />
        <GlowText
          text="COMMUNITIES MONITORED"
          fontSize={28}
          color={COLORS.offWhite}
          delay={15}
          fontWeight={600}
          style={{ letterSpacing: 4, marginBottom: 80 }}
        />

        <div
          style={{
            width: 100,
            height: 100,
            borderRadius: 24,
            background: `linear-gradient(135deg, ${COLORS.accent}40, ${COLORS.accentDim}40)`,
            border: `2px solid ${COLORS.accent}44`,
            opacity: interpolate(
              spring({ frame: frame - 30, fps, config: { damping: 18, stiffness: 155 } }),
              [0, 0.4],
              [0, 1],
              { extrapolateRight: 'clamp' },
            ),
            boxShadow: `0 0 40px ${COLORS.accent}40`,
            marginBottom: 24,
          }}
        />

        <GlowText
          text="VibeCheck"
          fontSize={56}
          color={COLORS.white}
          delay={35}
          fontWeight={800}
          style={{ marginBottom: 16 }}
        />

        <GlowText
          text="Is your community healthy?"
          fontSize={32}
          color={COLORS.accent}
          delay={50}
          fontWeight={600}
          glowIntensity={0.8}
          style={{ textAlign: 'center', marginBottom: 60 }}
        />

        <GlowText
          text="Know Your Community"
          fontSize={22}
          color={COLORS.muted}
          delay={70}
          fontWeight={500}
          style={{ textAlign: 'center' }}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
