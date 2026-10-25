import type { Chapter, ChapterContext } from "./types";

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
  duration: number;
  /** True = shown in the menu greyed out, waiting to be built. */
  locked?: boolean;
  create?: (ctx: ChapterContext) => Chapter;
}

export const CHAPTERS: ChapterDef[] = [
  {
    id: "chapter01",
    slot: "CHAPTER 01",
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
