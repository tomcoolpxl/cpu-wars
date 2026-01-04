/**
 * Shared constants for CPU Wars
 */

// Tank Identifiers
export const TANK_IDS = { P1: 'P1', P2: 'P2' };

// Arena Dimensions
export const GRID_WIDTH = 16;
export const GRID_HEIGHT = 10;

// Game Rules
export const INITIAL_HP = 3;
export const MAX_OPS_PER_TURN = 50;
export const BULLET_SPEED = 2;         // Tiles per turn
export const BULLET_MAX_RANGE = 40;
export const MAX_TURNS = 1000;         // Prevent infinite games

// Starting Positions
export const START_POSITIONS = {
    P1: { x: 0, y: 4, facing: 0 },    // East
    P2: { x: 15, y: 5, facing: 2 }    // West
};

// Direction mappings (0=E, 1=S, 2=W, 3=N)
export const DIRS = {
    0: { x: 1, y: 0 },   // East/Right
    1: { x: 0, y: 1 },   // South/Down
    2: { x: -1, y: 0 },  // West/Left
    3: { x: 0, y: -1 }   // North/Up
};

// Direction names for display
export const DIR_NAMES = ['E', 'S', 'W', 'N'];
