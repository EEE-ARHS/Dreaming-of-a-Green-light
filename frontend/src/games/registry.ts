import type { MiniGame, MiniGameContext } from "./types";
import { CrashDriveGame, id as crashId } from "../../../minigames/crash-drive";
import { NicksHouseGame, id as nicksId } from "../../../minigames/nicks-house";
import crashManifest from "../../../minigames/crash-drive/assets/manifest.json";
import nicksManifest from "../../../minigames/nicks-house/assets/manifest.json";

/**
 * The microgame lineup, WarioWare style. Each entry declares itself so the menu
 * and the shell can build everything from one list; a new game is one entry plus
 * one class that satisfies `MiniGame`.
 */
export interface MiniGameDef {
  id: string;
  slot: string; // e.g. "MICROGAME 01"
  name: string;
  blurb: string;
  command: string;
  how: string;
  duration: number;
  /** True = shown in the menu greyed out, waiting to be built. */
  locked?: boolean;
  create?: (ctx: MiniGameContext) => MiniGame;
}

export const MINI_GAMES: MiniGameDef[] = [
  {
    id: "game01",
    slot: "MICROGAME 01",
    name: "????????",
    blurb: "An undecided chapter is waiting in the wings.",
    command: "...",
    how: "This Gatsby microgame is not available yet.",
    duration: 26,
    locked: true,
  },
  {
    id: "game02",
    slot: nicksManifest.slot,
    name: nicksManifest.name,
    blurb: nicksManifest.blurb,
    command: nicksManifest.command,
    how: nicksManifest.how,
    duration: nicksManifest.duration,
    create: (ctx) => new NicksHouseGame(ctx),
  },
  {
    id: "game03",
    slot: "MICROGAME 03",
    name: "????????",
    blurb: "An undecided chapter is waiting in the wings.",
    command: "...",
    how: "This Gatsby microgame is not available yet.",
    duration: 26,
    locked: true,
  },
  {
    id: "game04",
    slot: "MICROGAME 04",
    name: "????????",
    blurb: "An undecided chapter is waiting in the wings.",
    command: "...",
    how: "This Gatsby microgame is not available yet.",
    duration: 26,
    locked: true,
  },
  {
    id: "game05",
    slot: "MICROGAME 05",
    name: "????????",
    blurb: "An undecided chapter is waiting in the wings.",
    command: "...",
    how: "This Gatsby microgame is not available yet.",
    duration: 26,
    locked: true,
  },
  {
    id: crashId,
    slot: crashManifest.slot,
    name: crashManifest.name,
    blurb: crashManifest.blurb,
    command: crashManifest.command,
    how: crashManifest.how,
    duration: crashManifest.duration,
    create: (ctx) => new CrashDriveGame(ctx),
  },
  {
    id: "game07",
    slot: "MICROGAME 07",
    name: "????????",
    blurb: "An undecided chapter is waiting in the wings.",
    command: "...",
    how: "This Gatsby microgame is not available yet.",
    duration: 26,
    locked: true,
  },
  {
    id: "game08",
    slot: "MICROGAME 08",
    name: "????????",
    blurb: "An undecided chapter is waiting in the wings.",
    command: "...",
    how: "This Gatsby microgame is not available yet.",
    duration: 26,
    locked: true,
  },
  {
    id: "game09",
    slot: "MICROGAME 09",
    name: "????????",
    blurb: "An undecided chapter is waiting in the wings.",
    command: "...",
    how: "This Gatsby microgame is not available yet.",
    duration: 26,
    locked: true,
  },
  {
    id: "game10",
    slot: "MICROGAME 10",
    name: "????????",
    blurb: "An undecided chapter is waiting in the wings.",
    command: "...",
    how: "This Gatsby microgame is not available yet.",
    duration: 26,
    locked: true,
  },
];
