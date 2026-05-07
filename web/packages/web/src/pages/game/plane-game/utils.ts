import type { Rect } from './types';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './constants';

export function checkCollision(rect1: Rect, rect2: Rect): boolean {
  return (
    rect1.x < rect2.x + rect2.width &&
    rect1.x + rect1.width > rect2.x &&
    rect1.y < rect2.y + rect2.height &&
    rect1.y + rect1.height > rect2.y
  );
}

export function getResponsiveCanvasSize() {
  const maxWidth = window.innerWidth - 60;
  const maxHeight = window.innerHeight - 180;

  const aspectRatio = CANVAS_WIDTH / CANVAS_HEIGHT;
  let width = Math.min(CANVAS_WIDTH, maxWidth);
  let height = width / aspectRatio;

  if (height > maxHeight) {
    height = maxHeight;
    width = height * aspectRatio;
  }

  if (window.innerWidth <= 768) {
    const mobileMaxWidth = window.innerWidth - 30;
    const mobileMaxHeight = window.innerHeight - 120;
    width = Math.min(width, mobileMaxWidth);
    height = width / aspectRatio;

    if (height > mobileMaxHeight) {
      height = mobileMaxHeight;
      width = height * aspectRatio;
    }
  }

  return { width, height };
}
