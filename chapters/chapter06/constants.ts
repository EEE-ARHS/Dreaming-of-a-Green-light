import { MYRTLE_Z } from "../../frontend/src/world-constants";

export { MYRTLE_Z };
export const FINISH_Z = MYRTLE_Z + 27.5;

export type RoundPhase = "driving" | "impact" | "complete";
export const BEATS = [
  { z: 4, text: "The road from New York runs black through the Valley of Ashes.", hold: 3.2, done: false },
  { z: 138, text: "Gatsby's yellow car. Daisy beside him. The wheel is yours.", hold: 3.2, done: false },
  { z: 272, text: "Her voice was full of money, the Valley's ash swallowing every sound.", hold: 3.4, done: false },
  { z: 406, text: "Above the road, the eyes of Doctor T. J. Eckleburg watched everything.", hold: 3.4, done: false },
  { z: 540, text: "They were careless people, Tom and Daisy—they smashed things up.", hold: 3.6, done: false },
];
