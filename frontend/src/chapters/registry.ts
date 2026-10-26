import type { Chapter, ChapterContext } from "./types";
import { NicksHouseChapter } from "../../../chapters/chapter02";
import { CrashDriveChapter } from "../../../chapters/chapter06";
/**
 * The chapter lineup. Each entry declares itself so the menu
 * and the shell can build everything from one list; a new chapter is one entry plus
 * one class that satisfies `Chapter`.
 */
export interface ChapterDef {
  id: string;
  slot: string; // e.g. "CHAPTER 01"
  name: string;
  blurb: string;
  command: string;
  how: string;
  duration: number | null;
  /** True = shown in the menu greyed out, waiting to be built. */
  locked?: boolean;
  create?: (ctx: ChapterContext) => Chapter;
  scene?: "valley" | "west-egg";
  firstPerson?: boolean;
}

export const CHAPTERS: ChapterDef[] = [
  {
    id: "nicksHouse",
    slot: "CHAPTER 01",
    name: "NICK'S HOUSE",
    blurb: "Nick has finally brought his things home to West Egg. Unpack the car and carry each belonging inside at your own pace.",
    command: "WELCOME HOME",
    how: "WASD to walk · mouse to look · click and drag each belonging from the car through the front door.",
    duration: null,
    create: (ctx) => new NicksHouseChapter(ctx),
    scene: "west-egg",
    firstPerson: true,
  },
  {
    id: "chapter02",
    slot: "CHAPTER 02",
    name: "????????",
    blurb: "An undecided chapter is waiting in the wings.",
    command: "...",
    how: "This Gatsby chapter is not available yet.",
    duration: 10,
    locked: true,
  },
  {
    id: "chapter03",
    slot: "CHAPTER 03",
    name: "????????",
    blurb: "An undecided chapter is waiting in the wings.",
    command: "...",
    how: "This Gatsby chapter is not available yet.",
    duration: 10,
    locked: true,
  },
  {
    id: "chapter04",
    slot: "CHAPTER 04",
    name: "????????",
    blurb: "An undecided chapter is waiting in the wings.",
    command: "...",
    how: "This Gatsby chapter is not available yet.",
    duration: 10,
    locked: true,
  },
  {
    id: "chapter05",
    slot: "CHAPTER 05",
    name: "????????",
    blurb: "An undecided chapter is waiting in the wings.",
    command: "...",
    how: "This Gatsby chapter is not available yet.",
    duration: 10,
    locked: true,
  },
  {
    id: "crashDrive",
    slot: "CHAPTER 06",
    name: "THE VALLEY OF ASHES",
    blurb: "The road from New York runs black through the Valley. Steer the yellow car through the crossing.",
    command: "KEEP YOUR EYES ON THE ROAD",
    how: "W / ↑ accelerate · S / ↓ brake · A right · D left · ← / → steer · SPACE skid · C view",
    duration: 16,
    create: (ctx) => new CrashDriveChapter(ctx),
  },
  {
    id: "chapter07",
    slot: "CHAPTER 07",
    name: "????????",
    blurb: "An undecided chapter is waiting in the wings.",
    command: "...",
    how: "This Gatsby chapter is not available yet.",
    duration: 10,
    locked: true,
  },
  {
    id: "chapter08",
    slot: "CHAPTER 08",
    name: "????????",
    blurb: "An undecided chapter is waiting in the wings.",
    command: "...",
    how: "This Gatsby chapter is not available yet.",
    duration: 10,
    locked: true,
  },
  {
    id: "chapter09",
    slot: "CHAPTER 09",
    name: "????????",
    blurb: "An undecided chapter is waiting in the wings.",
    command: "...",
    how: "This Gatsby chapter is not available yet.",
    duration: 10,
    locked: true,
  },
  {
    id: "chapter10",
    slot: "CHAPTER 10",
    name: "????????",
    blurb: "An undecided chapter is waiting in the wings.",
    command: "...",
    how: "This Gatsby chapter is not available yet.",
    duration: 10,
    locked: true,
  },
];
