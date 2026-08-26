import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { COLORS } from '../constants';
import { INTER, MONO } from '../fonts';
import { AnimatedBackground } from '../components/AnimatedBackground';

const BEFORE_ITEMS = [
  'Scroll through thousands of messages',
  'Miss early warning signs',
  'No member profiles',
  'Reactive, not proactive',
];

const AFTER_ITEMS = [
  'Automated community profiling',
  'Real-time anomaly detection',
  'Actionable weekly briefings',
  'Proactive member outreach',
];

const ItemRow: React.FC<{ items: string[]; color: string; prefix: string; baseDelay: number; fps: number; frame: number }> = ({
  items, color, prefix, baseDelay, fps, frame,
}) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
    {items.map((item, i) => {
      const prog = spring({ frame: frame - (baseDelay + i * 15), fps, config: { damping: 18, stiffness: 150 } });
      const op = interpolate(prog, [0, 0.4], [0, 1], { extrapolateRight: 'clamp' });
      const x = interpolate(prog, [0, 1], [prefix === '✗' ? -16 : 16, 0]);
      return (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            opacity: op,
            transform: `translateX(${x}px)`,
          }}
        >
          <div
            style={{
              fontFamily: MONO,
              fontSize: 18,
              fontWeight: 700,
              color,
              width: 24,
              textAlign: 'center',
            }}
          >
            {prefix}
          </div>
          <div style={{ fontFamily: INTER, fontSize: 20, color: COLORS.white, fontWeight: 500 }}>
            {item}
          </div>
        </div>
      );
    })}
  </div>
);

export const Contrast: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const dividerProg = spring({ frame: frame - 40, fps, config: { damping: 12, stiffness: 100 } });
  const dividerScale = interpolate(dividerProg, [0, 1], [0, 1]);

  const titleProg = spring({ frame: frame - 5, fps, config: { damping: 15, stiffness: 80 } });
  const titleOp = interpolate(titleProg, [0, 0.4], [0, 1], { extrapolateRight: 'clamp' });
  const titleY = interpolate(titleProg, [0, 1], [-10, 0]);

  return (
    <AbsoluteFill style={{ background: COLORS.bg }}>
      <AnimatedBackground />
      <AbsoluteFill style={{ zIndex: 10, padding: '60px 80px' }}>
        <div
          style={{
            fontFamily: INTER,
            fontSize: 36,
            fontWeight: 700,
            color: COLORS.white,
            textAlign: 'center',
            opacity: titleOp,
            transform: `translateY(${titleY}px)`,
            marginBottom: 60,
            letterSpacing: 3,
          }}
        >
          FROM CHAOS TO CLARITY
        </div>

        <div style={{ display: 'flex', flex: 1, position: 'relative' }}>
          <div style={{ flex: 1, paddingRight: 60 }}>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 14,
                fontWeight: 700,
                color: COLORS.red,
                letterSpacing: 3,
                marginBottom: 24,
              }}
            >
              BEFORE VIBECHECK
            </div>
            <ItemRow items={BEFORE_ITEMS} color={COLORS.red} prefix="✗" baseDelay={20} fps={fps} frame={frame} />
          </div>

          <div
            style={{
              width: 2,
              background: `linear-gradient(180deg, transparent, ${COLORS.accent}, transparent)`,
              transform: `scaleY(${dividerScale})`,
              transformOrigin: 'center',
              margin: '0 20px',
            }}
          />

          <div style={{ flex: 1, paddingLeft: 60 }}>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 14,
                fontWeight: 700,
                color: COLORS.accent,
                letterSpacing: 3,
                marginBottom: 24,
              }}
            >
              WITH VIBECHECK
            </div>
            <ItemRow items={AFTER_ITEMS} color={COLORS.accent} prefix="+" baseDelay={60} fps={fps} frame={frame} />
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
