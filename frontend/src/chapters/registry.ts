import type { Chapter, ChapterContext } from "./types";
import { NicksHouseChapter } from "../../../chapters/chapter02";
import { NicksUnpackingChapter } from "../../../chapters/chapter02/unpacking";
import { CrowdAtGatsbysChapter } from "../../../chapters/chapter04";
import { CrashDriveChapter } from "../../../chapters/chapter06";
import { BoatsAgainstTheCurrentChapter } from "../../../chapters/chapter15";
import { GatsbysDissolutionChapter } from "../../../chapters/Gatsbys Dissolution";
import { CHAPTER_CATALOG, type ChapterCatalogEntry } from "./catalog";

export type ChapterDef = ChapterCatalogEntry & {
  create?: (ctx: ChapterContext) => Chapter;
};

export const CHAPTERS: ChapterDef[] = CHAPTER_CATALOG.map((chapter) => {
  if (chapter.id === "nicksHouse") return { ...chapter, create: (ctx) => new NicksHouseChapter(ctx) };
  if (chapter.id === "nicksHouseUnpacking") return { ...chapter, create: (ctx) => new NicksUnpackingChapter(ctx) };
  if (chapter.id === "crowdAtGatsbys") return { ...chapter, create: (ctx) => new CrowdAtGatsbysChapter(ctx) };
  if (chapter.id === "crashDrive") return { ...chapter, create: (ctx) => new CrashDriveChapter(ctx) };
  if (chapter.id === "boatsAgainst") return { ...chapter, create: (ctx) => new BoatsAgainstTheCurrentChapter(ctx) };
  if (chapter.id === "gatsbysDissolution") return { ...chapter, create: (ctx) => new GatsbysDissolutionChapter(ctx) };
  return chapter;
});
