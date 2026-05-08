import { CLIENT_ID_KEY } from "./constants";

export function getClientId(): string {
  let id = sessionStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

export function sameTile(a: { suit: string; value: number }, b: { suit: string; value: number }): boolean {
  return a.suit === b.suit && a.value === b.value;
}

export function getTileLabel(tile: { suit: string; value: number }): string {
  if (tile.suit === "zi") {
    const names = ["东", "南", "西", "北", "中", "发", "白"];
    return names[tile.value - 1] ?? "";
  }
  const suitNames: Record<string, string> = { wan: "万", tong: "筒", tiao: "条" };
  return `${tile.value}${suitNames[tile.suit] ?? ""}`;
}

export function canPeng(hand: { suit: string; value: number }[], tile: { suit: string; value: number }): boolean {
  return hand.filter((t) => sameTile(t, tile)).length >= 2;
}

export function canGang(hand: { suit: string; value: number }[], tile: { suit: string; value: number }): boolean {
  return hand.filter((t) => sameTile(t, tile)).length >= 3;
}
