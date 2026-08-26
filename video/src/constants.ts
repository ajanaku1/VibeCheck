export const FPS = 30;
export const W = 1920;
export const H = 1080;

export const COLORS = {
  bg: '#0E0B10',
  bgCard: 'rgba(21, 18, 26, 0.65)',
  accent: '#D4A373',
  accentDim: '#A3B18A',
  accentBright: '#FDFBF7',
  white: '#F0EBE0',
  offWhite: '#B8A99A',
  muted: '#5A5347',
  border: 'rgba(212, 163, 115, 0.2)',
  red: '#E8614D',
  amber: '#D4A373',
  cyan: '#6FCF97',
  purple: '#C9A0DC',
};

export const SCENE_GAP = Math.round(1.5 * FPS);

export const AUDIO_DURATIONS = {
  hook: 443,
  contrast: 603,
  dashboard: 639,
  alerts: 611,
  pitch: 548,
  architecture: 563,
  close: 194,
};

export const SCENE_DURATIONS = {
  hook: AUDIO_DURATIONS.hook + SCENE_GAP,
  contrast: AUDIO_DURATIONS.contrast + SCENE_GAP,
  dashboard: AUDIO_DURATIONS.dashboard + SCENE_GAP,
  alerts: AUDIO_DURATIONS.alerts + SCENE_GAP,
  pitch: AUDIO_DURATIONS.pitch + SCENE_GAP,
  architecture: AUDIO_DURATIONS.architecture + SCENE_GAP,
  close: AUDIO_DURATIONS.close + SCENE_GAP,
};

export const CROSSFADE = 24;

export const TOTAL_FRAMES =
  Object.values(SCENE_DURATIONS).reduce((a, b) => a + b, 0) -
  CROSSFADE * (Object.keys(SCENE_DURATIONS).length - 1);

export const AUDIO_FILES: Record<keyof typeof SCENE_DURATIONS, string> = {
  hook: 'audio/hook.mp3',
  contrast: 'audio/contrast.mp3',
  dashboard: 'audio/dashboard.mp3',
  alerts: 'audio/alerts.mp3',
  pitch: 'audio/pitch.mp3',
  architecture: 'audio/architecture.mp3',
  close: 'audio/close.mp3',
};

export const SOCIAL_FPS = 30;
export const SOCIAL_W = 1080;
export const SOCIAL_H = 1920;
export const SOCIAL_DURATION = 10 * FPS;
