import React from 'react';
import { AbsoluteFill, staticFile, interpolate } from 'remotion';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { Audio } from 'remotion';
import {
  SCENE_DURATIONS,
  AUDIO_DURATIONS,
  AUDIO_FILES,
  CROSSFADE,
  FPS,
  COLORS,
} from './constants';
import { Hook } from './scenes/Hook';
import { Contrast } from './scenes/Contrast';
import { Dashboard } from './scenes/Dashboard';
import { Alerts } from './scenes/Alerts';
import { Pitch } from './scenes/Pitch';
import { Architecture } from './scenes/Architecture';
import { Close } from './scenes/Close';
import { Subtitles } from './Subtitles';

const SceneAudio: React.FC<{
  src: string;
  audioDuration: number;
  sceneDuration: number;
}> = ({ src, audioDuration, sceneDuration }) => (
  <Audio
    src={staticFile(src)}
    volume={(f) => {
      const fadeIn = interpolate(f, [0, Math.round(FPS * 0.3)], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
      const fadeOut = interpolate(
        f,
        [audioDuration - FPS, audioDuration],
        [1, 0],
        { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
      );
      return Math.min(fadeIn, fadeOut);
    }}
  />
);

const scenes = [
  { id: 'hook', Component: Hook, dur: SCENE_DURATIONS.hook, audioDur: AUDIO_DURATIONS.hook },
  { id: 'contrast', Component: Contrast, dur: SCENE_DURATIONS.contrast, audioDur: AUDIO_DURATIONS.contrast },
  { id: 'dashboard', Component: Dashboard, dur: SCENE_DURATIONS.dashboard, audioDur: AUDIO_DURATIONS.dashboard },
  { id: 'alerts', Component: Alerts, dur: SCENE_DURATIONS.alerts, audioDur: AUDIO_DURATIONS.alerts },
  { id: 'pitch', Component: Pitch, dur: SCENE_DURATIONS.pitch, audioDur: AUDIO_DURATIONS.pitch },
  { id: 'architecture', Component: Architecture, dur: SCENE_DURATIONS.architecture, audioDur: AUDIO_DURATIONS.architecture },
  { id: 'close', Component: Close, dur: SCENE_DURATIONS.close, audioDur: AUDIO_DURATIONS.close },
] as const;

export const MainVideo: React.FC = () => {
  const transition = linearTiming({ durationInFrames: CROSSFADE });

  let sceneOffset = 0;
  const subtitleEntries = scenes.flatMap((scene) => {
    const entry = { id: scene.id, sceneOffset, scene };
    sceneOffset += scene.dur - CROSSFADE;
    return entry;
  });

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg }}>
      <TransitionSeries>
        {scenes.flatMap((scene, i) => {
          const elements = [
            <TransitionSeries.Sequence key={scene.id} durationInFrames={scene.dur}>
              <scene.Component />
              <SceneAudio
                src={AUDIO_FILES[scene.id as keyof typeof AUDIO_FILES]}
                audioDuration={scene.audioDur}
                sceneDuration={scene.dur}
              />
            </TransitionSeries.Sequence>,
          ];
          if (i < scenes.length - 1) {
            elements.push(
              <TransitionSeries.Transition
                key={`t-${scene.id}`}
                presentation={fade()}
                timing={transition}
              />,
            );
          }
          return elements;
        })}
      </TransitionSeries>

      <Subtitles entries={subtitleEntries} />
    </AbsoluteFill>
  );
};
