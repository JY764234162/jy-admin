import { Button, Modal, Space } from "antd";
import type { GameStatus, UserRole } from "./types";

interface GameControlsProps {
  role: UserRole;
  status: GameStatus;
  pendingUndoFrom: string | null;
  pendingRestartFrom: string | null;
  onUndo: () => void;
  onRespondUndo: (accept: boolean) => void;
  onSurrender: () => void;
  onRestart: () => void;
  onRespondRestart: (accept: boolean) => void;
}

export function GameControls({
  role,
  status,
  pendingUndoFrom,
  pendingRestartFrom,
  onUndo,
  onRespondUndo,
  onSurrender,
  onRestart,
  onRespondRestart,
}: GameControlsProps) {
  if (role === "spectator") {
    return (
      <div style={{ textAlign: "center", color: "#999", padding: 16 }}>
        观战模式，无法操作
      </div>
    );
  }

  if (status === "waiting") {
    return (
      <div style={{ textAlign: "center", color: "#999", padding: 16 }}>
        等待对手加入...
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* 游戏进行中 */}
      {status === "playing" && (
        <Space direction="vertical" style={{ width: "100%" }}>
          <Button block onClick={onUndo}>
            悔棋
          </Button>
          <Button block danger onClick={() => {
            Modal.confirm({
              title: "确认认输？",
              content: "认输后将直接判负",
              okText: "确认",
              cancelText: "取消",
              onOk: onSurrender,
            });
          }}>
            认输
          </Button>
        </Space>
      )}

      {/* 游戏结束 */}
      {status === "ended" && (
        <Button type="primary" block onClick={onRestart}>
          重新开始
        </Button>
      )}

      {/* 悔棋请求弹窗 */}
      {pendingUndoFrom && (
        <Modal
          open={true}
          title="悔棋请求"
          okText="同意"
          cancelText="拒绝"
          onOk={() => onRespondUndo(true)}
          onCancel={() => onRespondUndo(false)}
          closable={false}
          maskClosable={false}
        >
          <p>对手 {pendingUndoFrom} 请求悔棋，是否同意？</p>
        </Modal>
      )}

      {/* 重新开始请求弹窗 */}
      {pendingRestartFrom && (
        <Modal
          open={true}
          title="重新开始请求"
          okText="同意"
          cancelText="拒绝"
          onOk={() => onRespondRestart(true)}
          onCancel={() => onRespondRestart(false)}
          closable={false}
          maskClosable={false}
        >
          <p>对手 {pendingRestartFrom} 请求重新开始，是否同意？</p>
        </Modal>
      )}
    </div>
  );
}
