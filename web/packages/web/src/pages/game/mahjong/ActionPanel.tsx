import { Button, Space } from "antd";

interface ActionPanelProps {
  canDiscard: boolean;
  canPeng: boolean;
  canGang: boolean;
  canHu: boolean;
  onDiscard: () => void;
  onPeng: () => void;
  onGang: () => void;
  onHu: () => void;
  onPass: () => void;
  isMobile: boolean;
}

export function ActionPanel({
  canDiscard,
  canPeng,
  canGang,
  canHu,
  onDiscard,
  onPeng,
  onGang,
  onHu,
  onPass,
  isMobile,
}: ActionPanelProps) {
  const size = isMobile ? "small" : "middle";

  return (
    <div
      className="mahjong-action-panel"
      style={{
        padding: isMobile ? 8 : 12,
        background: "#fff",
        borderRadius: 8,
        border: "1px solid #eee",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <Space wrap>
        {canDiscard && (
          <Button type="primary" size={size} onClick={onDiscard}>
            打牌
          </Button>
        )}
        {canPeng && (
          <Button type="primary" danger size={size} onClick={onPeng}>
            碰
          </Button>
        )}
        {canGang && (
          <Button type="primary" danger size={size} onClick={onGang}>
            杠
          </Button>
        )}
        {canHu && (
          <Button type="primary" danger size={size} onClick={onHu} style={{ background: "#cf1322", borderColor: "#cf1322" }}>
            胡
          </Button>
        )}
        {(canPeng || canGang || canHu) && (
          <Button size={size} onClick={onPass}>
            过
          </Button>
        )}
      </Space>
    </div>
  );
}
