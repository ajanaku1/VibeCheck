import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { COLORS, SCENE_DURATIONS } from '../constants';
import { SERIF, INTER } from '../fonts';
import { AnimatedBackground } from '../components/AnimatedBackground';

const STATS = [
  { value: '47', label: 'Communities', enterFrame: 40 },
  { value: '1,283', label: 'Msgs / Day', enterFrame: 65 },
  { value: '99%', label: 'Uptime', enterFrame: 90 },
];

const CornerBracket: React.FC<{ position: 'tl' | 'tr' | 'bl' | 'br' }> = ({ position }) => {
  const isTop = position === 'tl' || position === 'tr';
  const isRight = position === 'tr' || position === 'br';
  const d = isTop ? 'M0 0L55 0L55 55' : 'M0 55L55 55L55 0';
  const style: React.CSSProperties = {
    position: 'absolute',
    width: 55,
    height: 55,
    top: isTop ? 0 : undefined,
    bottom: isTop ? undefined : 0,
    left: isRight ? undefined : 0,
    right: isRight ? 0 : undefined,
  };
  return (
    <div style={style}>
      <svg width="55" height="55" viewBox="0 0 55 55" fill="none">
        <path
          d={d}
          stroke={COLORS.accent}
          strokeWidth="2"
          strokeLinecap="square"
          style={{
            transform: isRight ? 'scaleX(-1)' : 'none',
            filter: `drop-shadow(0 0 6px ${COLORS.accent}60)`,
          }}
        />
      </svg>
    </div>
  );
};

export const Close: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const cornerOp = interpolate(spring({ frame: frame - 5, fps, config: { damping: 20, stiffness: 200 } }), [0, 0.3], [0, 1], { extrapolateRight: 'clamp' });

  const logoProg = spring({ frame: frame - 10, fps, config: { mass: 1.2, damping: 12, stiffness: 100 } });
  const logoScale = interpolate(logoProg, [0, 1], [0, 1]);
  const logoOp = interpolate(logoProg, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' });

  const gradientText = {
    background: `linear-gradient(135deg, ${COLORS.accentBright}, ${COLORS.accent}, ${COLORS.accentDim})`,
    backgroundClip: 'text',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  };

  const tagProg = spring({ frame: frame - 25, fps, config: { mass: 1, damping: 15, stiffness: 80 } });
  const tagOp = interpolate(tagProg, [0, 0.4], [0, 1], { extrapolateRight: 'clamp' });
  const tagY = interpolate(tagProg, [0, 1], [16, 0]);

  const hackathonOp = interpolate(spring({ frame: frame - 120, fps, config: { damping: 15, stiffness: 80 } }), [0, 0.4], [0, 1], { extrapolateRight: 'clamp' });

  const exitOp = interpolate(frame, [SCENE_DURATIONS.close - 60, SCENE_DURATIONS.close], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ background: COLORS.bg }}>
      <AnimatedBackground />
      <AbsoluteFill style={{ zIndex: 10 }}>
        <div style={{ position: 'absolute', inset: 0, opacity: cornerOp }}>
          <CornerBracket position="tl" />
          <CornerBracket position="tr" />
          <CornerBracket position="bl" />
          <CornerBracket position="br" />
        </div>

        <AbsoluteFill
          style={{
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            opacity: exitOp,
          }}
        >
          <div
            style={{
              width: 100,
              height: 100,
              borderRadius: 24,
              background: `linear-gradient(135deg, ${COLORS.accent}40, ${COLORS.accentDim}40)`,
              border: `2px solid ${COLORS.accent}44`,
              opacity: logoOp,
              transform: `scale(${logoScale})`,
              boxShadow: `0 0 50px ${COLORS.accent}30`,
              marginBottom: 24,
            }}
          />

          <div
            style={{
              fontFamily: SERIF,
              fontSize: 80,
              fontWeight: 400,
              ...gradientText,
              opacity: logoOp,
              marginBottom: 12,
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

          <div style={{ display: 'flex', gap: 60, marginBottom: 48 }}>
            {STATS.map((stat, i) => {
              const prog = spring({ frame: frame - stat.enterFrame, fps, config: { damping: 14, stiffness: 80 } });
              const op = interpolate(prog, [0, 0.4], [0, 1], { extrapolateRight: 'clamp' });
              const y = interpolate(prog, [0, 1], [16, 0]);
              return (
                <div
                  key={i}
                  style={{
                    textAlign: 'center',
                    opacity: op,
                    transform: `translateY(${y}px)`,
                  }}
                >
                  <div
                    style={{
                      fontFamily: SERIF,
                      fontSize: 48,
                      fontWeight: 400,
                      color: COLORS.accent,
                    }}
                  >
                    {stat.value}
                  </div>
                  <div
                    style={{
                      fontFamily: INTER,
                      fontSize: 16,
                      fontWeight: 500,
                      color: COLORS.muted,
                      marginTop: 4,
                    }}
                  >
                    {stat.label}
                  </div>
                </div>
              );
            })}
          </div>

          <div
            style={{
              fontFamily: INTER,
              fontSize: 18,
              fontWeight: 400,
              color: COLORS.muted,
              opacity: hackathonOp,
              letterSpacing: 2,
            }}
          >
            BUILT FOR CREATIVE MINDS JAM 2026
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
