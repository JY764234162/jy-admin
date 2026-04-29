import { Button, Space, Tooltip, Dropdown, Badge } from "antd";
import {
  AlignLeftOutlined,
  AlignCenterOutlined,
  AppstoreOutlined,
  BgColorsOutlined,
  DownOutlined,
  PlayCircleOutlined,
} from "@ant-design/icons";
import type { ConnectionStatus } from "@/hooks/useYjsCollaboration";

interface LayoutPanelProps {
  connectionStatus: ConnectionStatus;
  isExecuting: boolean;
  onExecute: () => void;
  onDagreLayout: (direction: "TB" | "BT" | "LR" | "RL") => void;
  onGridLayout: () => void;
  onCircleLayout: () => void;
}

export function LayoutPanel({
  connectionStatus,
  isExecuting,
  onExecute,
  onDagreLayout,
  onGridLayout,
  onCircleLayout,
}: LayoutPanelProps) {
  return (
    <Space>
      {/* 协同编辑状态 */}
      <Space>
        <Badge
          status={
            connectionStatus === "connected"
              ? "success"
              : connectionStatus === "connecting"
                ? "processing"
                : "error"
          }
        />
        <span style={{ fontSize: 12 }}>
          {connectionStatus === "connected"
            ? "协同中"
            : connectionStatus === "connecting"
              ? "连接中..."
              : "连接断开"}
        </span>
      </Space>

      <div
        style={{
          width: "1px",
          height: "20px",
          background: "#d9d9d9",
          margin: "0 8px",
        }}
      />

      <Tooltip title="执行流程">
        <Button
          type="primary"
          icon={<PlayCircleOutlined />}
          onClick={onExecute}
          loading={isExecuting}
          size="small"
        >
          执行流程
        </Button>
      </Tooltip>

      <div
        style={{
          width: "1px",
          height: "20px",
          background: "#d9d9d9",
          margin: "0 8px",
        }}
      />

      <Dropdown
        menu={{
          items: [
            {
              key: "TB",
              label: "从上到下",
              icon: <AlignCenterOutlined rotate={90} />,
              onClick: () => onDagreLayout("TB"),
            },
            {
              key: "BT",
              label: "从下到上",
              icon: <AlignCenterOutlined rotate={-90} />,
              onClick: () => onDagreLayout("BT"),
            },
            {
              key: "LR",
              label: "从左到右",
              icon: <AlignLeftOutlined />,
              onClick: () => onDagreLayout("LR"),
            },
            {
              key: "RL",
              label: "从右到左",
              icon: <AlignLeftOutlined rotate={180} />,
              onClick: () => onDagreLayout("RL"),
            },
          ],
        }}
      >
        <Button size="small">
          层次布局 <DownOutlined />
        </Button>
      </Dropdown>

      <Tooltip title="网格排列">
        <Button icon={<AppstoreOutlined />} onClick={onGridLayout} size="small">
          网格布局
        </Button>
      </Tooltip>

      <Tooltip title="圆形排列">
        <Button
          icon={<BgColorsOutlined />}
          onClick={onCircleLayout}
          size="small"
        >
          圆形布局
        </Button>
      </Tooltip>
    </Space>
  );
}
