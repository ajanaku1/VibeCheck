import { loadFont } from '@remotion/google-fonts/Inter';
import { loadFont as loadMono } from '@remotion/google-fonts/JetBrainsMono';
import { loadFont as loadSerif } from '@remotion/google-fonts/DMSerifDisplay';

export const { fontFamily: INTER } = loadFont('normal', {
  weights: ['400', '500', '600', '700', '800', '900'],
  subsets: ['latin'],
});

export const { fontFamily: MONO } = loadMono('normal', {
  weights: ['400', '600', '700'],
  subsets: ['latin'],
});

export const { fontFamily: SERIF } = loadSerif('normal', {
  weights: ['400'],
  subsets: ['latin'],
});
