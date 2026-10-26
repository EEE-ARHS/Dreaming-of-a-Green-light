export const MYRTLE_Z = 148.5;
export const FINISH_Z = 176;

export type RoundPhase = "driving" | "impact" | "complete";
export type ViewMode = "chase" | "cockpit" | "crane";

export const VIEW_MODES: ViewMode[] = ["chase", "cockpit", "crane"];
export const VIEW_LABELS: Record<ViewMode, string> = {
  chase: "CHASE",
  cockpit: "AT THE WHEEL",
  crane: "THE LONG VIEW"
};

export const BEATS = [
  { z: 4, text: "The road from New York runs black through the Valley of Ashes.", hold: 3.2, done: false },
  { z: 40, text: "Gatsby's yellow car. Daisy beside him. The wheel is yours.", hold: 3.2, done: false },
  { z: 78, text: "Above Wilson's garage, the eyes of Doctor T. J. Eckleburg watch the road.", hold: 3.4, done: false },
];
