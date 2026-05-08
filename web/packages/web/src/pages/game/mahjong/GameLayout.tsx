import { useState, useMemo } from "react";
import { Button, Card, Tag } from "antd";
import type { RoomState, Tile } from "./types";
import { canPeng, canGang, sameTile } from "./utils";
import { PlayerInfo } from "./PlayerInfo";
import { DiscardArea } from "./DiscardArea";
import { HandArea } from "./HandArea";
import { ActionPanel } from "./ActionPanel";

interface GameLayoutProps {
  roomState: RoomState;
  mySeat: number;
  myHand: Tile[];
  isMobile: boolean;
  onReady: () => void;
  onDiscard: (tile: Tile) => void;
  onPeng: (tile: Tile) => void;
  onGang: (tile: Tile) => void;
  onHu: () => void;
  onPass: () => void;
}

export function GameLayout({
  roomState,
  mySeat,
  myHand,
  isMobile,
  onReady,
  onDiscard,
  onPeng,
  onGang,
  onHu,
  onPass,
}: GameLayoutProps) {
  const [selectedTile, setSelectedTile] = useState<Tile | null>(null);

  const playersMap = useMemo(() => {
    const map = new Map<number, RoomState["players"][number]>();
    for (const p of roomState.players) {
      map.set(p.seat, p);
    }
    return map;
  }, [roomState.players]);

  const otherSeats = useMemo(() => {
    const seats: number[] = [];
    for (let i = 1; i <= 3; i++) {
      seats.push((mySeat + i) % 4);
    }
    return seats;
  }, [mySeat]);

  const lastDiscarded = roomState.discardPile[roomState.discardPile.length - 1];
  const isMyTurn = roomState.currentPlayer === mySeat && roomState.status === "playing";
  const canRespond = lastDiscarded !== undefined && roomState.currentPlayer !== mySeat && roomState.status === "playing";

  const canPengNow = canRespond && canPeng(myHand, lastDiscarded);
  const canGangNow = canRespond && canGang(myHand, lastDiscarded);
  const canHuNow = canRespond;
  const canDiscardNow = isMyTurn && selectedTile !== null && !canRespond;

  const handleDiscard = () => {
    if (selectedTile) {
      onDiscard(selectedTile);
      setSelectedTile(null);
    }
  };

  const handlePeng = () => {
    if (lastDiscarded) onPeng(lastDiscarded);
  };

  const handleGang = () => {
    if (lastDiscarded) onGang(lastDiscarded);
  };

  const me = playersMap.get(mySeat);

  return (
    <div
      className="mahjong-container"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: isMobile ? "8px" : "16px",
        gap: isMobile ? 8 : 16,
        minHeight: "calc(100vh - 100px)",
      }}
    >
      {/* 顶部：其他玩家 */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: isMobile ? 6 : 12,
          width: "100%",
          maxWidth: 800,
        }}
      >
        {otherSeats.map((seat) => (
          <PlayerInfo
            key={seat}
            player={playersMap.get(seat)}
            isCurrent={roomState.currentPlayer === seat}
            isMe={false}
            isDealer={roomState.dealer === seat}
            isMobile={isMobile}
          />
        ))}
      </div>

      {/* 中间：弃牌堆和状态 */}
      <div style={{ width: "100%", maxWidth: 800, display: "flex", flexDirection: "column", gap: 8 }}>
        <Card size="small" style={{ textAlign: "center" }}>
          <div style={{ fontSize: isMobile ? 14 : 16, fontWeight: 600 }}>
            {roomState.status === "waiting" && (
              <span>
                等待玩家准备...
                {me && !me.ready && (
                  <Button type="primary" size="small" onClick={onReady} style={{ marginLeft: 12 }}>
                    准备
                  </Button>
                )}
                {me && me.ready && (
                  <Tag color="green" style={{ marginLeft: 12 }}>已准备</Tag>
                )}
              </span>
            )}
            {roomState.status === "playing" && (
              <span>
                第{roomState.round}局 · {roomState.wind}风 · 牌墙剩余{roomState.wallTiles}张
                {isMyTurn && <Tag color="blue" style={{ marginLeft: 8 }}>你的回合</Tag>}
              </span>
            )}
            {roomState.status === "ended" && <span style={{ color: "#cf1322" }}>游戏结束</span>}
          </div>
        </Card>
        <DiscardArea discardPile={roomState.discardPile} isMobile={isMobile} />
      </div>

      {/* 底部：自己 */}
      <div style={{ width: "100%", maxWidth: 800, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <PlayerInfo
            player={me}
            isCurrent={isMyTurn}
            isMe={true}
            isDealer={roomState.dealer === mySeat}
            isMobile={isMobile}
          />
        </div>

        {roomState.status === "playing" && (
          <>
            <HandArea
              hand={myHand}
              selectedTile={selectedTile}
              onSelect={setSelectedTile}
              isMobile={isMobile}
            />
            <ActionPanel
              canDiscard={canDiscardNow}
              canPeng={canPengNow}
              canGang={canGangNow}
              canHu={canHuNow}
              onDiscard={handleDiscard}
              onPeng={handlePeng}
              onGang={handleGang}
              onHu={onHu}
              onPass={onPass}
              isMobile={isMobile}
            />
          </>
        )}
      </div>
    </div>
  );
}
