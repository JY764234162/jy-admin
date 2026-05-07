export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 600;

export const PLAYER_CONFIG = {
  width: 50,
  height: 50,
  speed: 5,
  color: '#00ff00',
  startX: CANVAS_WIDTH / 2,
  startY: CANVAS_HEIGHT - 80,
} as const;

export const BULLET_CONFIG = {
  width: 4,
  height: 10,
  speed: 8,
  color: '#ffff00',
} as const;

export const ENEMY_CONFIG = {
  width: 40,
  height: 40,
  minSpeed: 2,
  maxSpeed: 4,
  color: '#ff0000',
  health: 1,
  spawnRate: 0.02,
} as const;

export const PARTICLE_CONFIG = {
  count: 15,
  life: 30,
} as const;

export const STAR_CONFIG = {
  count: 100,
  minSpeed: 0.2,
  maxSpeed: 0.7,
} as const;

export const INITIAL_LIVES = 3;
export const SCORE_PER_ENEMY = 10;
export const TOUCH_SHOOT_INTERVAL = 200; // ms
