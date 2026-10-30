import nicksHouseManifest from "../../../chapters/chapter02/assets/unpacking-manifest.json";
import nicksHouseGardenManifest from "../../../chapters/chapter02/assets/manifest.json";
import crowdAtGatsbysManifest from "../../../chapters/chapter04/assets/manifest.json";
import crashDriveManifest from "../../../chapters/chapter06/assets/manifest.json";
import boatsAgainstManifest from "../../../chapters/chapter15/assets/manifest.json";
import gatsbysDissolutionManifest from "../../../chapters/Gatsbys Dissolution/assets/manifest.json";

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
  locked?: boolean;
  scene?: "valley" | "west-egg";
  firstPerson?: boolean;
  hud?: ChapterHud;
}

export const CHAPTER_CATALOG: ChapterCatalogEntry[] = [
  {
    id: "nicksHouseUnpacking",
    slot: nicksHouseManifest.slot,
    name: nicksHouseManifest.name,
    blurb: nicksHouseManifest.blurb,
    command: nicksHouseManifest.command,
    how: nicksHouseManifest.how,
    locked: false,
    scene: "west-egg",
    firstPerson: true,
    hud: {
      brand: "NICK'S HOUSE",
      sub: "CHAPTER I · WEST EGG",
      keys: [
        { key: "WASD / ARROWS", label: "walk" },
        { key: "MOUSE / I J K L", label: "look" },
        { key: "E", label: "trunk / carry" },
        { key: "ESC", label: "chapters" },
      ],
    },
  },
  {
    id: crowdAtGatsbysManifest.id,
    slot: crowdAtGatsbysManifest.slot,
    name: crowdAtGatsbysManifest.name,
    blurb: crowdAtGatsbysManifest.blurb,
    command: crowdAtGatsbysManifest.command,
    how: crowdAtGatsbysManifest.how,
    locked: false,
    scene: "west-egg",
    firstPerson: true,
    hud: {
      brand: "NICK AT GATSBY'S",
      sub: "CHAPTER IV · WEST EGG",
      keys: [
        { key: "WASD / ARROWS", label: "step through crowd" },
        { key: "MOUSE", label: "look" },
        { key: "HOLD + DRAG", label: "drag and throw a guest" },
        { key: "ESC", label: "chapters" },
      ],
    },
  },
  {
    id: "crashDrive",
    slot: crashDriveManifest.slot,
    name: crashDriveManifest.name,
    blurb: crashDriveManifest.blurb,
    command: crashDriveManifest.command,
    how: crashDriveManifest.how,
    locked: false,
  },
  {
    id: "nicksHouse",
    slot: nicksHouseGardenManifest.slot,
    name: nicksHouseGardenManifest.name,
    blurb: nicksHouseGardenManifest.blurb,
    command: nicksHouseGardenManifest.command,
    how: nicksHouseGardenManifest.how,
    locked: false,
    scene: "west-egg",
    firstPerson: true,
    hud: {
      brand: "THE VISIT",
      sub: "CHAPTER VII · WEST EGG",
      keys: [
        { key: "WASD / ARROWS", label: "walk" },
        { key: "MOUSE / I J K L", label: "look" },
        { key: "LEFT CLICK", label: "pick up / place daisies" },
        { key: "ESC", label: "chapters" },
      ],
    },
  },
  {
    id: "boatsAgainst",
    slot: boatsAgainstManifest.slot,
    name: boatsAgainstManifest.name,
    blurb: boatsAgainstManifest.blurb,
    command: boatsAgainstManifest.command,
    how: boatsAgainstManifest.how,
    locked: false,
    scene: "west-egg",
    hud: {
      brand: "THE SOUND",
      sub: "CHAPTER XV · 1922",
      keys: [
        { key: "W / S", label: "accelerate / brake" },
        { key: "A / D", label: "steer left / right" },
        { key: "ESC", label: "chapters" },
        { key: "M", label: "mute" },
      ],
    },
  },
  {
    id: gatsbysDissolutionManifest.id,
    slot: gatsbysDissolutionManifest.slot,
    name: gatsbysDissolutionManifest.name,
    blurb: gatsbysDissolutionManifest.blurb,
    command: gatsbysDissolutionManifest.command,
    how: gatsbysDissolutionManifest.how,
    locked: false,
    scene: "west-egg",
    hud: {
      brand: "THE POOL",
      sub: "CHAPTER XVI · WEST EGG",
      keys: [
        { key: "MOUSE", label: "aim" },
        { key: "LEFT CLICK", label: "fire once" },
        { key: "ESC", label: "chapters" },
      ],
    },
  },
];
