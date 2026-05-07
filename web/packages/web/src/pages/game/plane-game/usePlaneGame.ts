import { useRef, useState, useEffect, useCallback } from 'react';
import type { Player, Bullet, Enemy, Particle, Star } from './types';
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  PLAYER_CONFIG,
  BULLET_CONFIG,
  ENEMY_CONFIG,
  PARTICLE_CONFIG,
  STAR_CONFIG,
  INITIAL_LIVES,
  SCORE_PER_ENEMY,
  TOUCH_SHOOT_INTERVAL,
} from './constants';
import { checkCollision } from './utils';

interface GameData {
  player: Player;
  bullets: Bullet[];
  enemies: Enemy[];
  particles: Particle[];
  stars: Star[];
  keys: Record<string, boolean>;
  score: number;
  lives: number;
  gameOver: boolean;
}

function createInitialPlayer(): Player {
  return {
    x: PLAYER_CONFIG.startX,
    y: PLAYER_CONFIG.startY,
    width: PLAYER_CONFIG.width,
    height: PLAYER_CONFIG.height,
    speed: PLAYER_CONFIG.speed,
    color: PLAYER_CONFIG.color,
  };
}

function createInitialStars(): Star[] {
  return Array.from({ length: STAR_CONFIG.count }, () => ({
    x: Math.random() * CANVAS_WIDTH,
    y: Math.random() * CANVAS_HEIGHT,
    size: Math.random() * 2,
    speed: Math.random() * (STAR_CONFIG.maxSpeed - STAR_CONFIG.minSpeed) + STAR_CONFIG.minSpeed,
  }));
}

function createInitialGameData(): GameData {
  return {
    player: createInitialPlayer(),
    bullets: [],
    enemies: [],
    particles: [],
    stars: createInitialStars(),
    keys: {},
    score: 0,
    lives: INITIAL_LIVES,
    gameOver: false,
  };
}

function createEnemy(): Enemy {
  return {
    x: Math.random() * (CANVAS_WIDTH - ENEMY_CONFIG.width),
    y: -ENEMY_CONFIG.height,
    width: ENEMY_CONFIG.width,
    height: ENEMY_CONFIG.height,
    speed: Math.random() * (ENEMY_CONFIG.maxSpeed - ENEMY_CONFIG.minSpeed) + ENEMY_CONFIG.minSpeed,
    color: ENEMY_CONFIG.color,
    health: ENEMY_CONFIG.health,
  };
}

function createParticles(x: number, y: number, color: string): Particle[] {
  return Array.from({ length: PARTICLE_CONFIG.count }, () => ({
    x,
    y,
    vx: (Math.random() - 0.5) * 4,
    vy: (Math.random() - 0.5) * 4,
    life: PARTICLE_CONFIG.life,
    maxLife: PARTICLE_CONFIG.life,
    size: Math.random() * 3 + 2,
    color,
  }));
}

// ===== 绘制函数 =====
function drawPlayer(ctx: CanvasRenderingContext2D, player: Player) {
  ctx.save();
  ctx.translate(player.x, player.y);

  ctx.fillStyle = player.color;
  ctx.beginPath();
  ctx.moveTo(0, -player.height / 2);
  ctx.lineTo(-player.width / 3, player.height / 2);
  ctx.lineTo(0, player.height / 3);
  ctx.lineTo(player.width / 3, player.height / 2);
  ctx.closePath();
  ctx.fill();

  ctx.shadowBlur = 20;
  ctx.shadowColor = player.color;
  ctx.fill();

  ctx.fillStyle = '#00cc00';
  ctx.beginPath();
  ctx.moveTo(-player.width / 2, 0);
  ctx.lineTo(-player.width / 4, player.height / 4);
  ctx.lineTo(-player.width / 6, 0);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(player.width / 2, 0);
  ctx.lineTo(player.width / 4, player.height / 4);
  ctx.lineTo(player.width / 6, 0);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawBullets(ctx: CanvasRenderingContext2D, bullets: Bullet[]) {
  for (const bullet of bullets) {
    ctx.save();
    ctx.fillStyle = bullet.color;
    ctx.shadowBlur = 10;
    ctx.shadowColor = bullet.color;
    ctx.fillRect(bullet.x - bullet.width / 2, bullet.y, bullet.width, bullet.height);
    ctx.restore();
  }
}

function drawEnemies(ctx: CanvasRenderingContext2D, enemies: Enemy[]) {
  for (const enemy of enemies) {
    ctx.save();
    ctx.translate(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2);

    ctx.fillStyle = enemy.color;
    ctx.shadowBlur = 15;
    ctx.shadowColor = enemy.color;
    ctx.beginPath();
    ctx.moveTo(0, enemy.height / 2);
    ctx.lineTo(-enemy.width / 3, -enemy.height / 2);
    ctx.lineTo(0, -enemy.height / 3);
    ctx.lineTo(enemy.width / 3, -enemy.height / 2);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#cc0000';
    ctx.fillRect(-enemy.width / 4, -enemy.height / 4, enemy.width / 2, enemy.height / 4);

    ctx.restore();
  }
}

function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[]) {
  for (const particle of particles) {
    const alpha = particle.life / particle.maxLife;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = particle.color;
    ctx.shadowBlur = 5;
    ctx.shadowColor = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawStars(ctx: CanvasRenderingContext2D, stars: Star[]) {
  ctx.fillStyle = '#ffffff';
  for (const star of stars) {
    ctx.globalAlpha = Math.random() * 0.8 + 0.2;
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ===== 更新函数 =====
function updatePlayer(data: GameData) {
  const { keys, player } = data;
  if (keys['arrowleft'] || keys['a']) {
    player.x = Math.max(player.width / 2, player.x - player.speed);
  }
  if (keys['arrowright'] || keys['d']) {
    player.x = Math.min(CANVAS_WIDTH - player.width / 2, player.x + player.speed);
  }
  if (keys['arrowup'] || keys['w']) {
    player.y = Math.max(player.height / 2, player.y - player.speed);
  }
  if (keys['arrowdown'] || keys['s']) {
    player.y = Math.min(CANVAS_HEIGHT - player.height / 2, player.y + player.speed);
  }
}

function updateBullets(data: GameData) {
  const { bullets, enemies } = data;
  for (let i = bullets.length - 1; i >= 0; i--) {
    const bullet = bullets[i];
    if (!bullet) continue;
    bullet.y -= bullet.speed;

    if (bullet.y < 0) {
      bullets.splice(i, 1);
      continue;
    }

    for (let j = enemies.length - 1; j >= 0; j--) {
      const enemy = enemies[j];
      if (!enemy) continue;
      if (checkCollision(bullet, enemy)) {
        data.particles.push(...createParticles(
          enemy.x + enemy.width / 2,
          enemy.y + enemy.height / 2,
          enemy.color
        ));
        data.score += SCORE_PER_ENEMY;
        bullets.splice(i, 1);
        enemies.splice(j, 1);
        break;
      }
    }
  }
}

function updateEnemies(data: GameData) {
  const { enemies, player } = data;
  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i];
    if (!enemy) continue;
    enemy.y += enemy.speed;

    if (checkCollision(enemy, player)) {
      data.particles.push(...createParticles(player.x, player.y, player.color));
      data.lives--;
      enemies.splice(i, 1);

      if (data.lives <= 0) {
        data.gameOver = true;
      }
      continue;
    }

    if (enemy.y > CANVAS_HEIGHT) {
      enemies.splice(i, 1);
    }
  }
}

function updateParticles(data: GameData) {
  const { particles } = data;
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    if (!p) continue;
    p.x += p.vx;
    p.y += p.vy;
    p.life--;
    if (p.life <= 0) {
      particles.splice(i, 1);
    }
  }
}

function updateStars(data: GameData) {
  for (const star of data.stars) {
    star.y += star.speed;
    if (star.y > CANVAS_HEIGHT) {
      star.y = 0;
      star.x = Math.random() * CANVAS_WIDTH;
    }
  }
}

// ===== 主 Hook =====
export function usePlaneGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataRef = useRef<GameData>(createInitialGameData());
  const rafRef = useRef<number>(0);
  const lastShootTimeRef = useRef<number>(0);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(INITIAL_LIVES);
  const [gameOver, setGameOver] = useState(false);

  // 同步 ref 中的游戏状态到 React state
  const syncState = useCallback(() => {
    const data = dataRef.current;
    setScore((prev) => (prev !== data.score ? data.score : prev));
    setLives((prev) => (prev !== data.lives ? data.lives : prev));
    setGameOver((prev) => (prev !== data.gameOver ? data.gameOver : prev));
  }, []);

  const restart = useCallback(() => {
    dataRef.current = createInitialGameData();
    setScore(0);
    setLives(INITIAL_LIVES);
    setGameOver(false);
  }, []);

  const shoot = useCallback(() => {
    const { player, gameOver: isOver } = dataRef.current;
    if (isOver) return;
    dataRef.current.bullets.push({
      x: player.x,
      y: player.y,
      width: BULLET_CONFIG.width,
      height: BULLET_CONFIG.height,
      speed: BULLET_CONFIG.speed,
      color: BULLET_CONFIG.color,
    });
  }, []);

  // 游戏主循环
  useEffect(() => {
    const loop = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      const data = dataRef.current;

      if (!data.gameOver) {
        ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        updateStars(data);
        drawStars(ctx, data.stars);

        updatePlayer(data);
        updateBullets(data);
        updateEnemies(data);
        updateParticles(data);

        if (Math.random() < ENEMY_CONFIG.spawnRate) {
          data.enemies.push(createEnemy());
        }

        drawBullets(ctx, data.bullets);
        drawEnemies(ctx, data.enemies);
        drawParticles(ctx, data.particles);
        drawPlayer(ctx, data.player);

        syncState();
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [syncState]);

  // 键盘事件
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      dataRef.current.keys[e.key.toLowerCase()] = true;
      if (e.key === ' ' && !dataRef.current.gameOver) {
        e.preventDefault();
        shoot();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      dataRef.current.keys[e.key.toLowerCase()] = false;
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, [shoot]);

  // 触摸事件处理器
  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const touch = e.touches[0];
    if (!touch) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_WIDTH / rect.width;
    const scaleY = CANVAS_HEIGHT / rect.height;

    touchStartRef.current = {
      x: (touch.clientX - rect.left) * scaleX,
      y: (touch.clientY - rect.top) * scaleY,
    };
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const touch = e.touches[0];
    if (!touch) return;
    const canvas = canvasRef.current;
    if (!canvas || !touchStartRef.current) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_WIDTH / rect.width;
    const scaleY = CANVAS_HEIGHT / rect.height;

    const currentX = (touch.clientX - rect.left) * scaleX;
    const currentY = (touch.clientY - rect.top) * scaleY;

    const player = dataRef.current.player;
    player.x = Math.max(player.width / 2, Math.min(CANVAS_WIDTH - player.width / 2, currentX));
    player.y = Math.max(player.height / 2, Math.min(CANVAS_HEIGHT - player.height / 2, currentY));

    const now = Date.now();
    if (now - lastShootTimeRef.current > TOUCH_SHOOT_INTERVAL) {
      shoot();
      lastShootTimeRef.current = now;
    }
  }, [shoot]);

  const handleTouchEnd = useCallback(() => {
    touchStartRef.current = null;
  }, []);

  return {
    canvasRef,
    score,
    lives,
    gameOver,
    restart,
    touchHandlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    },
  };
}
