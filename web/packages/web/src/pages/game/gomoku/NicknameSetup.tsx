import { useState } from "react";
import { Button, Card, Input } from "antd";
import { NICKNAME_STORAGE_KEY } from "./constants";

interface NicknameSetupProps {
  isMobile: boolean;
  defaultNickname: string;
  onConfirm: (nickname: string) => void;
}

export function NicknameSetup({ isMobile, defaultNickname, onConfirm }: NicknameSetupProps) {
  const [nickname, setNickname] = useState(defaultNickname);

  return (
    <div className="gomoku-lobby">
      <Card title="设置游戏昵称" style={{ width: isMobile ? "90%" : 320, maxWidth: 400 }}>
        <p style={{ color: "#666", fontSize: 14, marginBottom: 16 }}>
          请输入你在游戏中的显示名称
        </p>
        <Input
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="例如：小明"
          maxLength={12}
          style={{ marginBottom: 16 }}
        />
        <Button
          type="primary"
          block
          onClick={() => {
            const trimmed = nickname.trim();
            if (!trimmed) return;
            localStorage.setItem(NICKNAME_STORAGE_KEY, trimmed);
            onConfirm(trimmed);
          }}
        >
          开始游戏
        </Button>
      </Card>
    </div>
  );
}
