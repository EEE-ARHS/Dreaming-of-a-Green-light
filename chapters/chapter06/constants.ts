import { MYRTLE_Z } from "../../frontend/src/world-constants";

export { MYRTLE_Z };
export const FINISH_Z = MYRTLE_Z + 27.5;

export type RoundPhase = "driving" | "impact" | "complete";
export const BEATS = [
  { z: 4, text: "“This is a valley of ashes—a fantastic farm where ashes grow like wheat into ridges and hills and grotesque gardens.”", hold: 4.2, done: false },
  { z: 138, text: "“Her voice is full of money.”", hold: 3.2, done: false },
  { z: 272, text: "“God knows what you’ve been doing, everything you’ve been doing.”", hold: 3.4, done: false },
  { z: 406, text: "“The eyes of Doctor T. J. Eckleburg are blue and gigantic—their retinas are one yard high.”", hold: 3.8, done: false },
  { z: 540, text: "“They were careless people, Tom and Daisy—they smashed up things and creatures and then retreated back into their money.”", hold: 4.4, done: false },
  { z: 590, text: "“So we drove on toward death through the cooling twilight.”", hold: 3.2, done: false },
];
