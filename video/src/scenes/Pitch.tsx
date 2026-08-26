import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { COLORS } from '../constants';
import { INTER, MONO } from '../fonts';
import { AnimatedBackground } from '../components/AnimatedBackground';
import { GlassCard } from '../components/GlassCard';

const CARDS = [
  {
    label: 'PERSISTENT AGENT',
    text: 'Lives in your Telegram community 24/7. Always watching, always learning.',
    borderColor: COLORS.accent,
    enterFrame: 20,
  },
  {
    label: 'NORM LEARNING',
    text: 'Discovers behavioral patterns automatically. Knows what "normal" looks like for your community.',
    borderColor: COLORS.cyan,
    enterFrame: 100,
  },
  {
    label: 'CONTEXT-AWARE',
    text: 'Detects anomalies that actually matter. Silence, sentiment shifts, knowledge gaps.',
    borderColor: COLORS.purple,
    enterFrame: 180,
  },
];

export const Pitch: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleProg = spring({ frame: frame - 5, fps, config: { damping: 15, stiffness: 80 } });
  const titleOp = interpolate(titleProg, [0, 0.4], [0, 1], { extrapolateRight: 'clamp' });
  const titleY = interpolate(titleProg, [0, 1], [-10, 0]);

  return (
    <AbsoluteFill style={{ background: COLORS.bg }}>
      <AnimatedBackground />
      <AbsoluteFill style={{ zIndex: 10, padding: '60px 100px', flexDirection: 'column' }}>
        <div
          style={{
            fontFamily: INTER,
            fontSize: 40,
            fontWeight: 700,
            color: COLORS.white,
            opacity: titleOp,
            transform: `translateY(${titleY}px)`,
            letterSpacing: 2,
            textAlign: 'center',
            marginBottom: 60,
          }}
        >
          POWERED BY MINDS
        </div>

        <div style={{ display: 'flex', gap: 40, flex: 1, alignItems: 'center' }}>
          {CARDS.map((card, i) => {
            const prog = spring({ frame: frame - card.enterFrame, fps, config: { damping: 14, stiffness: 80 } });
            const op = interpolate(prog, [0, 0.4], [0, 1], { extrapolateRight: 'clamp' });
            const y = interpolate(prog, [0, 1], [24, 0]);
            const scale = interpolate(prog, [0, 1], [0.93, 1]);

            return (
              <div
                key={i}
                style={{
                  flex: 1,
                  opacity: op,
                  transform: `translateY(${y}px) scale(${scale})`,
                }}
              >
                <GlassCard
                  borderColor={`${card.borderColor}33`}
                  style={{ padding: '32px 28px', height: '100%' }}
                >
                  <div
                    style={{
                      fontFamily: MONO,
                      fontSize: 13,
                      fontWeight: 700,
                      color: card.borderColor,
                      letterSpacing: 2,
                      marginBottom: 16,
                    }}
                  >
                    {card.label}
                  </div>
                  <div
                    style={{
                      fontFamily: INTER,
                      fontSize: 18,
                      fontWeight: 500,
                      color: COLORS.offWhite,
                      lineHeight: 1.5,
                    }}
                  >
                    {card.text}
                  </div>
                </GlassCard>
              </div>
            );
          })}
        </div>

        <div
          style={{
            textAlign: 'center',
            marginTop: 40,
            fontFamily: INTER,
            fontSize: 18,
            color: COLORS.accent,
            letterSpacing: 2,
            opacity: interpolate(spring({ frame: frame - 260, fps, config: { damping: 15, stiffness: 80 } }), [0, 0.4], [0, 1], { extrapolateRight: 'clamp' }),
          }}
        >
          NO DASHBOARD TO CHECK. JUST YOUR COMMUNITY THRIVING.
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
