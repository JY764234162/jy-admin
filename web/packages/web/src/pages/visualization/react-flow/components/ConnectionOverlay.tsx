import { Button, Spin } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import type { ConnectionStatus } from "@/hooks/useYjsCollaboration";

interface ConnectionOverlayProps {
  connectionStatus: ConnectionStatus;
  onReconnect: () => void;
}

export function ConnectionOverlay({
  connectionStatus,
  onReconnect,
}: ConnectionOverlayProps) {
  if (connectionStatus === "connected") return null;

  const overlayStyle: React.CSSProperties = {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(255, 255, 255, 0.85)",
    backdropFilter: "blur(4px)",
  };

  if (connectionStatus === "connecting" || connectionStatus === "idle") {
    return (
      <div style={overlayStyle}>
        <Spin size="large" />
        <p style={{ marginTop: 16, color: "#666", fontSize: 14 }}>
          正在连接协同服务...
        </p>
      </div>
    );
  }

  // error
  return (
    <div style={overlayStyle}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 48, color: "#ff4d4f", marginBottom: 16 }}>
          ⚠️
        </div>
        <h3 style={{ margin: "0 0 8px", color: "#333" }}>连接失败</h3>
        <p style={{ margin: "0 0 24px", color: "#666", fontSize: 14 }}>
          无法连接到协同编辑服务，请检查后重试
        </p>
        <Button type="primary" icon={<ReloadOutlined />} onClick={onReconnect}>
          重新连接
        </Button>
      </div>
    </div>
  );
}
