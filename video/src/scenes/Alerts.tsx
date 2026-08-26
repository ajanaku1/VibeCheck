import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate, Img, staticFile } from 'remotion';
import { COLORS } from '../constants';
import { INTER, MONO } from '../fonts';
import { AnimatedBackground } from '../components/AnimatedBackground';

const ALERT_CARDS = [
  {
    title: 'Silence Anomaly',
    member: '@alex_codes',
    detail: 'No activity for 72 hours (was 8 msgs/day)',
    severity: 'medium',
    enterFrame: 40,
  },
  {
    title: 'Sentiment Shift',
    member: '@sarah_dev',
    detail: 'Positive to frustrated over 3 days',
    severity: 'high',
    enterFrame: 100,
  },
  {
    title: 'Knowledge Gap',
    member: '@multiple',
    detail: 'Deployment question asked 4 times without answer',
    severity: 'low',
    enterFrame: 160,
  },
];

const SeverityColor: Record<string, string> = {
  high: COLORS.red,
  medium: COLORS.amber,
  low: COLORS.cyan,
};

export const Alerts: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleProg = spring({ frame: frame - 5, fps, config: { damping: 15, stiffness: 80 } });
  const titleOp = interpolate(titleProg, [0, 0.4], [0, 1], { extrapolateRight: 'clamp' });

  const phoneProg = spring({ frame: frame - 15, fps, config: { damping: 18, stiffness: 120 } });
  const phoneScale = interpolate(phoneProg, [0, 1], [1.05, 1]);
  const phoneOp = interpolate(phoneProg, [0, 0.4], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: COLORS.bg }}>
      <AnimatedBackground />
      <AbsoluteFill style={{ zIndex: 10, padding: '50px 80px', flexDirection: 'row', alignItems: 'center', gap: 60 }}>
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontFamily: INTER,
              fontSize: 40,
              fontWeight: 700,
              color: COLORS.white,
              opacity: titleOp,
              letterSpacing: 2,
              marginBottom: 40,
            }}
          >
            REAL-TIME ALERTS
          </div>

          {ALERT_CARDS.map((card, i) => {
            const prog = spring({ frame: frame - card.enterFrame, fps, config: { damping: 14, stiffness: 80 } });
            const op = interpolate(prog, [0, 0.4], [0, 1], { extrapolateRight: 'clamp' });
            const x = interpolate(prog, [0, 1], [-20, 0]);

            return (
              <div
                key={i}
                style={{
                  opacity: op,
                  transform: `translateX(${x}px)`,
                  background: COLORS.bgCard,
                  border: `1px solid ${COLORS.border}`,
                  borderLeft: `4px solid ${SeverityColor[card.severity]}`,
                  borderRadius: 12,
                  padding: '18px 24px',
                  marginBottom: 16,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: SeverityColor[card.severity], letterSpacing: 1 }}>
                    {card.title}
                  </div>
                  <div style={{ fontFamily: INTER, fontSize: 16, fontWeight: 600, color: COLORS.white }}>
                    {card.member}
                  </div>
                </div>
                <div style={{ fontFamily: INTER, fontSize: 15, color: COLORS.offWhite, lineHeight: 1.5 }}>
                  {card.detail}
                </div>
              </div>
            );
          })}

          <div
            style={{
              fontFamily: INTER,
              fontSize: 16,
              color: COLORS.accent,
              fontStyle: 'italic',
              marginTop: 8,
              opacity: interpolate(spring({ frame: frame - 220, fps, config: { damping: 15, stiffness: 80 } }), [0, 0.4], [0, 1], { extrapolateRight: 'clamp' }),
            }}
          >
            Actionable recommendations, not just raw data
          </div>
        </div>

        <div
          style={{
            width: 300,
            borderRadius: 40,
            overflow: 'hidden',
            border: `3px solid ${COLORS.border}`,
            boxShadow: `0 0 60px ${COLORS.accent}20`,
            transform: `scale(${phoneScale})`,
            opacity: phoneOp,
          }}
        >
          <Img src={staticFile('assets/alerts.png')} style={{ width: '100%', display: 'block' }} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
