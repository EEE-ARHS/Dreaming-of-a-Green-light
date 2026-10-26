import type { Chapter, ChapterContext } from "./types";
import { NicksHouseChapter } from "../../../chapters/chapter02";
import { CrashDriveChapter } from "../../../chapters/chapter06";
import { CHAPTER_CATALOG, type ChapterCatalogEntry } from "./catalog";

export type ChapterDef = ChapterCatalogEntry & {
  create?: (ctx: ChapterContext) => Chapter;
};

export const CHAPTERS: ChapterDef[] = CHAPTER_CATALOG.map((chapter) => {
  if (chapter.id === "nicksHouse") return { ...chapter, create: (ctx) => new NicksHouseChapter(ctx) };
  if (chapter.id === "crashDrive") return { ...chapter, create: (ctx) => new CrashDriveChapter(ctx) };
  return chapter;
});
