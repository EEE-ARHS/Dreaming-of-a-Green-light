import { CHAPTER_CATALOG } from "./catalog";

export const CHAPTER_OPTIONS = CHAPTER_CATALOG.map((chapter) => ({
  id: chapter.id,
  slot: chapter.slot,
  name: chapter.name,
  description: chapter.blurb,
  command: chapter.command,
  locked: chapter.locked ?? true,
  firstPerson: chapter.firstPerson ?? false,
  hud: chapter.hud,
}));
