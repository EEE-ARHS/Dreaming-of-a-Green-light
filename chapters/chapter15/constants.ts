/** Chapter XV camera, ocean, and environmental tuning. */

export const CAMERA_BEHIND = 6.4;
export const CAMERA_HEIGHT = 2.3;
export const CAMERA_AIM = 10;
export const CAMERA_AIM_HEIGHT = 0.75;
export const CAMERA_FOV = 55;
export const CAMERA_RATE = 2.6;
export const ENDING_BEHIND = 15;
export const ENDING_HEIGHT = 8.5;
export const ENDING_SECONDS = 7.5;

export const WATER_WIDTH = 260;
export const WATER_LENGTH = 420;
export const WATER_SEGMENTS_X = 60;
export const WATER_SEGMENTS_Z = 88;
export const STAR_COUNT = 420;
export const STAR_RADIUS = 520;

export const RIPPLE_COUNT = 22;
export const RIPPLE_LIFE = 2.8;
export const SPRAY_COUNT = 110;
/** Seconds between bow-wave ripples while the boat is carrying way. */
export const WAKE_INTERVAL = 0.55;

export interface Beat {
  /** Fires once the boat has come this near the light, in metres. */
  distance: number;
  text: string;
  hold: number;
  done: boolean;
}

export const BEATS: Beat[] = [
  { distance: 126, text: "The sail lifts in the night wind. Behind you the last windows of West Egg, ahead a single green light.", hold: 5, done: false },
  { distance: 106, text: "There is nothing on the Sound but the wind, and the wind is the only sound there is.", hold: 4.4, done: false },
  { distance: 90, text: "The green light at the end of Daisy's dock has burned all summer. It has not moved.", hold: 4.4, done: false },
  { distance: 74, text: "The current leans hard against the hull now. Keep the yacht on course.", hold: 3.6, done: false },
  { distance: 58, text: "The light draws back as though it resented the reach of the hand.", hold: 4.4, done: false },
];
