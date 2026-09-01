// Default SpacetimeDB address (same scheme as Digital Tennis):
// - Vite dev server: SpacetimeDB runs separately on :3000.
// - Anything else (the nginx container): SAME ORIGIN — nginx proxies /v1.
const defaultUri = (import.meta as any).env?.DEV
  ? `ws://${location.hostname}:3000`
  : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
const envUri: string | undefined = (import.meta as any).env?.VITE_SPACETIMEDB_URI;
const pageIsLocal = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
const envPointsLocal = !!envUri && /\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(envUri);
const usableEnvUri = envUri && !(envPointsLocal && !pageIsLocal) ? envUri : undefined;
export const SPACETIMEDB_URI = usableEnvUri ?? defaultUri;
export const DATABASE_NAME = (import.meta as any).env?.VITE_DATABASE_NAME ?? 'digital-golf';

export const MAX_PLAYERS = 8;

// Ball colours — index = player.color. Mirrors N_COLORS in the module.
export const COLORS = [
  '#ff4b4b', '#4b8bff', '#ffd60a', '#43e97b', '#ff8a3d', '#c77dff',
  '#3de3ff', '#ff5fb8', '#a4ff3d', '#ffffff', '#8d99b5', '#ff9d9d',
];
export const COLOR_NAMES = [
  'RED', 'BLUE', 'GOLD', 'GREEN', 'ORANGE', 'PURPLE',
  'CYAN', 'PINK', 'LIME', 'WHITE', 'STEEL', 'ROSE',
];

export const EMOTES = ['👍', '😂', '😱', '🔥', '💀', '🎉'];

// Lobby / phase constants — mirror spacetimedb/src/index.ts.
export const L_OPEN = 0;
export const L_RUNNING = 1;
export const L_FINISHED = 2;
export const PH_LOBBY = 0;
export const PH_INTRO = 1;
export const PH_PLAY = 2;
export const PH_RESULTS = 3;
export const PH_FINAL = 4;
export const EV = {
  NONE: 0, SHOT: 1, WALL: 2, BUMPER: 3, JUMP: 4, TELE: 5, WATER: 6, HOLED: 7, LAND: 8, BOOST: 9, RESET: 10,
} as const;
