import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { INTER } from './fonts';

type SubtitleEntry = {
  text: string;
  startFrame: number;
  endFrame: number;
};

type SceneEntry = { id: string; sceneOffset: number; scene: { id: string; audioDur: number } };

const generateSubtitleEntries = (
  sceneScripts: SceneEntry[],
): SubtitleEntry[] => {
  const entries: SubtitleEntry[] = [];

  const sceneTexts: Record<string, string[]> = {
    hook: ['What if you could feel the pulse of your community, anytime, anywhere?', 'VibeCheck watches your Telegram 24/7,', 'learning who your members are, how they interact,', 'and flagging the moment something feels off.', "It's community intelligence, automated."],
    contrast: ['Most creators fly blind.', 'You scroll through thousands of messages', 'hoping to catch problems before they escalate.', 'VibeCheck changes that.', 'It profiles every single member automatically.', 'It discovers your community norms by observing real behavior.', 'And it flags at-risk people before they go silent or drift away.', 'Proactive, not reactive.'],
    dashboard: ['Your command center, right in your pocket.', 'Open VibeCheck and see community temperature at a glance.', 'Active members, message volume,', 'norms your people actually agreed on.', 'Tap any member to see their archetype —', 'are they a leader, a contributor, a helper, or a lurker?', 'When something feels off, VibeCheck tells you first,', 'before you have to ask.'],
    alerts: ['Real-time anomaly detection that actually matters.', 'A top contributor goes silent for 72 hours.', 'Sentiment shifts from positive to frustrated.', 'A critical question gets asked four times with no answer.', 'VibeCheck catches every signal', 'and gives you actionable recommendations — not just raw data.', 'It tells you who to reach out to and what to say.'],
    pitch: ['VibeCheck is powered by Minds,', 'a persistent AI agent that lives inside your Telegram community.', 'It learns normal behavior patterns for every member.', 'It detects context-aware anomalies that generic tools miss.', 'No dashboards to check.', 'Just your community thriving,', 'because VibeCheck has your back around the clock.'],
    architecture: ["Here's how it works.", 'Telegram messages flow into the VibeCheck agent continuously.', 'The agent profiles each member, learns community norms,', 'and runs anomaly detection in real time.', 'Alerts push straight to your phone.', 'A weekly briefing keeps you ahead of community health trends.', 'From signal to insight, automatically.'],
    close: ['VibeCheck.', 'Know your community.', 'Never miss a signal.', 'Built for the Creative Minds Jam 2026.'],
  };

  for (const entry of sceneScripts) {
    const { sceneOffset, scene } = entry;
    const sentences = sceneTexts[scene.id] || [];
    const audioDur = scene.audioDur;
    const totalWords = sentences.join(' ').split(/\s+/).length;
    let cumulativeWords = 0;

    for (const sentence of sentences) {
      const wordCount = sentence.split(/\s+/).length;
      const startFrame = sceneOffset + Math.round((cumulativeWords / totalWords) * audioDur);
      const endFrame = sceneOffset + Math.round(((cumulativeWords + wordCount) / totalWords) * audioDur);
      entries.push({ text: sentence, startFrame, endFrame });
      cumulativeWords += wordCount;
    }
  }

  return entries;
};

export const Subtitles: React.FC<{
  entries: SceneEntry[];
}> = ({ entries }) => {
  const frame = useCurrentFrame();
  const subtitleEntries = generateSubtitleEntries(entries);
  const active = subtitleEntries.find((e) => frame >= e.startFrame && frame < e.endFrame);
  if (!active) return null;

  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', zIndex: 50, pointerEvents: 'none' }}>
      <div
        style={{
          background: 'rgba(0, 0, 0, 0.65)',
          borderRadius: 8,
          padding: '10px 24px',
          marginBottom: 60,
          maxWidth: 1400,
        }}
      >
        <div
          style={{
            fontFamily: INTER,
            fontSize: 28,
            fontWeight: 600,
            color: '#ffffff',
            textAlign: 'center',
            lineHeight: 1.4,
          }}
        >
          {active.text}
        </div>
      </div>
    </AbsoluteFill>
  );
};
