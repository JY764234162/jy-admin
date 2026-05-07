import { CLIENT_ID_KEY, DEFAULT_CELL_SIZE } from "./constants";

export function getClientId(): string {
  let id = sessionStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

export function getCellSize(isMobile: boolean): number {
  if (!isMobile) return DEFAULT_CELL_SIZE;
  const available = Math.min(window.innerWidth - 20, 500);
  return Math.floor(available / 15);
}
