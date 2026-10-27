import nicksHouseManifest from "../../../chapters/chapter02/assets/manifest.json";
import crashDriveManifest from "../../../chapters/chapter06/assets/manifest.json";
import boatsAgainstManifest from "../../../chapters/chapter15/assets/manifest.json";

/** What the running chapter puts in the corner of the screen, and under it its controls. */
export interface ChapterHud {
  brand: string;
  sub: string;
  keys: { key: string; label: string }[];
}

export interface ChapterCatalogEntry {
  id: string;
  slot: string;
  name: string;
  blurb: string;
  command: string;
  how: string;
  duration: number | null;
  locked?: boolean;
  scene?: "valley" | "west-egg";
  firstPerson?: boolean;
  hud?: ChapterHud;
}

export const CHAPTER_CATALOG: ChapterCatalogEntry[] = [
  {
    id: "nicksHouse",
    slot: nicksHouseManifest.slot,
    name: nicksHouseManifest.name,
    blurb: nicksHouseManifest.blurb,
    command: nicksHouseManifest.command,
    how: nicksHouseManifest.how,
    duration: nicksHouseManifest.duration,
    locked: false,
    scene: "west-egg",
    firstPerson: true,
    hud: {
      brand: "NICK'S HOUSE",
      sub: "WEST EGG · 1922",
      keys: [
        { key: "WASD", label: "walk" },
        { key: "MOUSE", label: "look" },
        { key: "E", label: "trunk / carry" },
        { key: "ESC", label: "chapters" },
      ],
    },
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
    slot: crashDriveManifest.slot,
    name: crashDriveManifest.name,
    blurb: crashDriveManifest.blurb,
    command: crashDriveManifest.command,
    how: crashDriveManifest.how,
    duration: crashDriveManifest.duration,
    locked: false,
  },
  ...Array.from({ length: 4 }, (_, index): ChapterCatalogEntry => {
    const number = index + 7;
    return {
      id: `chapter${String(number).padStart(2, "0")}`,
      slot: `CHAPTER ${String(number).padStart(2, "0")}`,
      name: "????????",
      blurb: "An undecided chapter is waiting in the wings.",
      command: "...",
      how: "This Gatsby chapter is not available yet.",
      duration: 10,
      locked: true,
    };
  }),
  {
    id: "boatsAgainst",
    slot: boatsAgainstManifest.slot,
    name: boatsAgainstManifest.name,
    blurb: boatsAgainstManifest.blurb,
    command: boatsAgainstManifest.command,
    how: boatsAgainstManifest.how,
    duration: boatsAgainstManifest.duration,
    locked: false,
    scene: "west-egg",
    hud: {
      brand: "THE SOUND",
      sub: "CHAPTER XV · 1922",
      keys: [
        { key: "DRAG", label: "down to pull both oars" },
        { key: "DRAG", label: "up to recover" },
        { key: "DRAG", label: "aside to steer" },
        { key: "ESC", label: "chapters" },
        { key: "M", label: "mute" },
      ],
    },
  },
];
