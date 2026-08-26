import React from 'react';
import { interpolate } from 'remotion';
import { COLORS } from '../constants';
import { INTER } from '../fonts';

export const EdgeArrow: React.FC<{
  label: string;
  side: 'left' | 'right' | 'top' | 'bottom';
  targetX?: number;
  targetY?: number;
  progress: number;
  fadeOut: number;
}> = ({ label, side, targetX = 960, targetY = 540, progress, fadeOut }) => {
  const op = interpolate(progress * fadeOut, [0, 0.3], [0, 1], {
    extrapolateRight: 'clamp',
  });
  const lineLen = interpolate(progress, [0, 1], [0, 1]);

  const margin = 40;
  let x1: number, y1: number, x2: number, y2: number;
  let labelX: number, labelY: number;
  const textAnchor = side === 'right' ? 'start' : side === 'left' ? 'end' : 'middle';

  switch (side) {
    case 'left':
      x1 = margin; y1 = targetY; x2 = 280; y2 = targetY;
      labelX = margin - 10; labelY = targetY;
      break;
    case 'right':
      x1 = 1920 - margin; y1 = targetY; x2 = 1640; y2 = targetY;
      labelX = 1920 - margin + 10; labelY = targetY;
      break;
    case 'top':
      x1 = targetX; y1 = margin + 60; x2 = targetX; y2 = 200;
      labelX = targetX; labelY = margin + 40;
      break;
    case 'bottom':
      x1 = targetX; y1 = 1000; x2 = targetX; y2 = 860;
      labelX = targetX; labelY = 1010;
      break;
  }

  const currentX2 = interpolate(lineLen, [0, 1], [x1, x2]);
  const currentY2 = interpolate(lineLen, [0, 1], [y1, y2]);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        opacity: op,
        pointerEvents: 'none' as const,
      }}
    >
      <svg width={1920} height={1080} style={{ position: 'absolute', top: 0, left: 0 }}>
        <defs>
          <marker
            id={`arrowhead-${side}`}
            markerWidth="10"
            markerHeight="7"
            refX="10"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill={COLORS.accent} />
          </marker>
        </defs>
        <line
          x1={x1}
          y1={y1}
          x2={currentX2}
          y2={currentY2}
          stroke={COLORS.accent}
          strokeWidth={3}
          markerEnd={lineLen > 0.5 ? `url(#arrowhead-${side})` : undefined}
          style={{ filter: `drop-shadow(0 0 6px ${COLORS.accent})` }}
        />
      </svg>

      <div
        style={{
          position: 'absolute',
          left: side === 'right' ? undefined : labelX,
          right: side === 'right' ? margin - 10 : undefined,
          top: labelY - (side === 'left' || side === 'right' ? 18 : 0),
          transform: side === 'top' || side === 'bottom' ? 'translateX(-50%)' : undefined,
          fontFamily: INTER,
          fontSize: 26,
          fontWeight: 700,
          color: COLORS.accent,
          background: `${COLORS.bg}d9`,
          padding: '10px 20px',
          borderRadius: 10,
          border: `1px solid ${COLORS.accent}40`,
          whiteSpace: 'nowrap',
          backdropFilter: 'blur(8px)',
          textShadow: `0 0 12px ${COLORS.accent}60`,
          textAlign: textAnchor === 'end' ? 'right' : textAnchor === 'start' ? 'left' : 'center',
        }}
      >
        {label}
      </div>
    </div>
  );
};
