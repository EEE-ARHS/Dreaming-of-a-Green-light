export const ROOM_HALF = 4;
export const ROOM_HEIGHT = 3;
export const DOOR_HALF = 1.15;
export const DOOR_HEIGHT = 2.3;
export const THRESHOLD_Z = -ROOM_HALF - 0.45;
export const CARRY_Y = 0.9;

export interface BelongingSpec {
  id: string;
  name: string;
  kind: "crate" | "suitcase" | "lamp" | "books" | "hatbox";
  size: number;
  carPosition: [number, number, number];
  housePosition: [number, number, number];
  story: string;
}

export const BELONGINGS: BelongingSpec[] = [
  { id: "moving-crate", name: "Moving crate", kind: "crate", size: 0.82, carPosition: [-1.2, 0.42, 1.05], housePosition: [-1.4, 0.42, 1.1], story: "Nick's books, carefully packed for the move." },
  { id: "leather-suitcase", name: "Leather suitcase", kind: "suitcase", size: 0.68, carPosition: [0.45, 0.36, 1.0], housePosition: [-0.25, 0.34, 0.45], story: "A worn suitcase. Nick brought little from the Midwest." },
  { id: "reading-lamp", name: "Brass reading lamp", kind: "lamp", size: 0.52, carPosition: [1.45, 0.3, 1.1], housePosition: [2.8, 0.32, -0.15], story: "A brass lamp for the quiet evenings after the parties." },
  { id: "letters", name: "Box of letters", kind: "books", size: 0.55, carPosition: [-1.8, 0.28, 0.45], housePosition: [-2.4, 0.55, -2.7], story: "Letters from home. Nick has not opened them yet." },
  { id: "hatbox", name: "Hatbox", kind: "hatbox", size: 0.58, carPosition: [0.95, 0.29, 0.38], housePosition: [1.5, 0.3, 0.85], story: "A hatbox wrapped in brown paper and twine." },
  { id: "picture-frame", name: "Small picture frame", kind: "crate", size: 0.48, carPosition: [-0.6, 0.25, 0.25], housePosition: [2.85, 1.55, -3.82], story: "A modest print, meant for the wall above Nick's desk." },
  { id: "keepsakes", name: "Tin of keepsakes", kind: "suitcase", size: 0.46, carPosition: [1.72, 0.24, 0.35], housePosition: [0.6, 0.28, -1.2], story: "A few small keepsakes, packed away for the journey east." },
];
