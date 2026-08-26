import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate, Img, staticFile } from 'remotion';
import { COLORS } from '../constants';
import { INTER } from '../fonts';
import { AnimatedBackground } from '../components/AnimatedBackground';
import { EdgeArrow } from '../components/EdgeArrow';

const CALLOUTS = [
  { label: 'Community Temperature', side: 'left' as const, targetY: 200, enterFrame: 40 },
  { label: 'Active Members', side: 'right' as const, targetY: 280, enterFrame: 90 },
  { label: 'Member Archetypes', side: 'left' as const, targetY: 520, enterFrame: 140 },
  { label: 'Community Norms', side: 'right' as const, targetY: 680, enterFrame: 190 },
];

export const Dashboard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleProg = spring({ frame: frame - 5, fps, config: { damping: 15, stiffness: 80 } });
  const titleOp = interpolate(titleProg, [0, 0.4], [0, 1], { extrapolateRight: 'clamp' });
  const titleY = interpolate(titleProg, [0, 1], [-10, 0]);

  const phoneProg = spring({ frame: frame - 25, fps, config: { damping: 18, stiffness: 120 } });
  const phoneScale = interpolate(phoneProg, [0, 1], [1.05, 1]);
  const phoneOp = interpolate(phoneProg, [0, 0.4], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: COLORS.bg }}>
      <AnimatedBackground />
      <AbsoluteFill style={{ zIndex: 10 }}>
        <div
          style={{
            position: 'absolute',
            top: 30,
            left: 0,
            right: 0,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontFamily: INTER,
              fontSize: 40,
              fontWeight: 700,
              color: COLORS.white,
              opacity: titleOp,
              transform: `translateY(${titleY}px)`,
              letterSpacing: 2,
            }}
          >
            YOUR COMMAND CENTER
          </div>
        </div>

        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            opacity: phoneOp,
          }}
        >
          <div
            style={{
              width: 340,
              borderRadius: 40,
              overflow: 'hidden',
              border: `3px solid ${COLORS.border}`,
              boxShadow: `0 0 80px ${COLORS.accent}25`,
              transform: `scale(${phoneScale})`,
            }}
          >
            <Img src={staticFile('assets/dashboard.png')} style={{ width: '100%', display: 'block' }} />
          </div>
        </div>

        {CALLOUTS.map((c, i) => {
          const prog = spring({ frame: frame - c.enterFrame, fps, config: { damping: 18, stiffness: 155 } });
          const nextEnter = CALLOUTS[i + 1]?.enterFrame ?? 1000;
          const fadeOutProg = interpolate(frame, [nextEnter - 10, nextEnter + 5], [1, 0], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });
          return (
            <EdgeArrow
              key={i}
              label={c.label}
              side={c.side}
              targetY={c.targetY}
              progress={prog}
              fadeOut={fadeOutProg}
            />
          );
        })}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
