import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { COLORS } from '../constants';
import { INTER, MONO } from '../fonts';
import { AnimatedBackground } from '../components/AnimatedBackground';

const COLUMNS = [
  {
    title: 'TELEGRAM',
    icon: '💬',
    items: ['Community messages', 'Member interactions', 'Real-time feed'],
    color: COLORS.cyan,
    enterFrame: 20,
  },
  {
    title: 'VIBECHECK AGENT',
    icon: '🧠',
    items: ['Profile members', 'Learn community norms', 'Detect anomalies'],
    color: COLORS.accent,
    enterFrame: 80,
  },
  {
    title: 'YOUR PHONE',
    icon: '📱',
    items: ['Real-time alerts', 'Weekly briefing', 'Actionable insights'],
    color: COLORS.purple,
    enterFrame: 140,
  },
];

export const Architecture: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleProg = spring({ frame: frame - 5, fps, config: { damping: 15, stiffness: 80 } });
  const titleOp = interpolate(titleProg, [0, 0.4], [0, 1], { extrapolateRight: 'clamp' });
  const titleY = interpolate(titleProg, [0, 1], [-10, 0]);

  const bottomOp = interpolate(spring({ frame: frame - 200, fps, config: { damping: 15, stiffness: 80 } }), [0, 0.4], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: COLORS.bg }}>
      <AnimatedBackground />
      <AbsoluteFill style={{ zIndex: 10, padding: '60px 80px', flexDirection: 'column' }}>
        <div
          style={{
            fontFamily: INTER,
            fontSize: 36,
            fontWeight: 700,
            color: COLORS.white,
            opacity: titleOp,
            transform: `translateY(${titleY}px)`,
            letterSpacing: 2,
            textAlign: 'center',
            marginBottom: 60,
          }}
        >
          HOW IT WORKS
        </div>

        <div style={{ display: 'flex', flex: 1, alignItems: 'center', gap: 0 }}>
          {COLUMNS.map((col, i) => {
            const prog = spring({ frame: frame - col.enterFrame, fps, config: { damping: 14, stiffness: 80 } });
            const op = interpolate(prog, [0, 0.4], [0, 1], { extrapolateRight: 'clamp' });
            const y = interpolate(prog, [0, 1], [20, 0]);
            const scale = interpolate(prog, [0, 1], [0.95, 1]);

            const arrowProg = spring({ frame: frame - (col.enterFrame + 40), fps, config: { damping: 20, stiffness: 120 } });
            const arrowOp = interpolate(arrowProg, [0, 0.4], [0, 1], { extrapolateRight: 'clamp' });

            return (
              <React.Fragment key={i}>
                <div
                  style={{
                    flex: 1,
                    opacity: op,
                    transform: `translateY(${y}px) scale(${scale})`,
                  }}
                >
                  <div
                    style={{
                      background: COLORS.bgCard,
                      border: `1px solid ${col.color}33`,
                      borderRadius: 16,
                      padding: '28px 24px',
                      textAlign: 'center',
                    }}
                  >
                    <div
                      style={{
                        width: 64,
                        height: 64,
                        borderRadius: 16,
                        background: `${col.color}22`,
                        border: `1px solid ${col.color}44`,
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        fontSize: 28,
                        margin: '0 auto 16px',
                      }}
                    >
                      {col.icon}
                    </div>
                    <div
                      style={{
                        fontFamily: MONO,
                        fontSize: 14,
                        fontWeight: 700,
                        color: col.color,
                        letterSpacing: 2,
                        marginBottom: 16,
                      }}
                    >
                      {col.title}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {col.items.map((item, j) => (
                        <div
                          key={j}
                          style={{
                            fontFamily: INTER,
                            fontSize: 16,
                            color: COLORS.offWhite,
                            lineHeight: 1.4,
                          }}
                        >
                          {j > 0 && (
                            <div
                              style={{
                                width: 4,
                                height: 4,
                                borderRadius: '50%',
                                background: col.color,
                                margin: '0 auto 6px',
                                opacity: 0.5,
                              }}
                            />
                          )}
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {i < COLUMNS.length - 1 && (
                  <div
                    style={{
                      width: 60,
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      opacity: arrowOp,
                    }}
                  >
                    <svg width="40" height="16" viewBox="0 0 40 16" fill="none">
                      <path
                        d="M0 8H32M32 8L24 1M32 8L24 15"
                        stroke={COLORS.accent}
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ filter: `drop-shadow(0 0 4px ${COLORS.accent}60)` }}
                      />
                    </svg>
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>

        <div
          style={{
            textAlign: 'center',
            marginTop: 40,
            fontFamily: INTER,
            fontSize: 18,
            color: COLORS.muted,
            opacity: bottomOp,
            letterSpacing: 3,
          }}
        >
          FROM SIGNAL TO INSIGHT
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
