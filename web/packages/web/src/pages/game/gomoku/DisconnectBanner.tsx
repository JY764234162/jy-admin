import { useEffect, useState } from "react";
import { Alert } from "antd";

interface DisconnectBannerProps {
  userId: string;
  color: string;
  graceEndsAt: number;
}

export function DisconnectBanner({ userId, color, graceEndsAt }: DisconnectBannerProps) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const remaining = Math.max(0, Math.ceil((graceEndsAt - now) / 1000));
  const colorText = color === "black" ? "黑方" : color === "white" ? "白方" : "对手";

  return (
    <Alert
      type="warning"
      showIcon
      message={`${colorText} (${userId}) 已掉线,等待重连...`}
      description={`${remaining}s 内未重连将判负`}
      style={{ marginBottom: 12 }}
    />
  );
}
