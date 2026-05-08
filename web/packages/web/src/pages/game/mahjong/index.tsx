import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { Button, Spin } from "antd";
import { userSlice } from "@/store/slice/user";
import { layoutSlice } from "@/store/slice/layout";
import { useMahjongWebSocket } from "./useMahjongWebSocket";
import { NicknameSetup } from "./NicknameSetup";
import { GameLayout } from "./GameLayout";
import { DEFAULT_ROOM, NICKNAME_STORAGE_KEY } from "./constants";
import "./index.css";

export const Component = () => {
  const isMobile = useSelector(layoutSlice.selectors.getIsMobile);
  const userInfo = useSelector(userSlice.selectors.getUserInfo);
  const token = "";

  const savedNickname = localStorage.getItem(NICKNAME_STORAGE_KEY) || "";
  const [nickname, setNickname] = useState(() => {
    if (savedNickname) return savedNickname;
    return userInfo?.nickName || userInfo?.username || `玩家-${Math.floor(1000 + Math.random() * 9000)}`;
  });
  const [nicknameSet, setNicknameSet] = useState(() => !!savedNickname);

  const ws = useMahjongWebSocket(DEFAULT_ROOM, token, nickname);

  useEffect(() => {
    if (nicknameSet) {
      ws.connect();
    }
    return () => {
      ws.disconnect();
    };
  }, [ws.connect, ws.disconnect, nicknameSet]);

  if (!nicknameSet) {
    return (
      <NicknameSetup
        isMobile={isMobile}
        defaultNickname={nickname}
        onConfirm={(name) => {
          setNickname(name);
          setNicknameSet(true);
        }}
      />
    );
  }

  if (ws.connectionStatus === "connecting" || ws.connectionStatus === "idle") {
    return (
      <div className="mahjong-lobby">
        <Spin size="large" />
        <p style={{ color: "#666" }}>正在连接...</p>
      </div>
    );
  }

  if (ws.connectionStatus === "error") {
    return (
      <div className="mahjong-lobby">
        <p style={{ color: "#ff4d4f", fontSize: 18 }}>连接失败</p>
        <Button type="primary" onClick={ws.connect}>重新连接</Button>
      </div>
    );
  }

  if (!ws.roomState) return null;

  return (
    <GameLayout
      roomState={ws.roomState}
      mySeat={ws.mySeat}
      myHand={ws.myHand}
      isMobile={isMobile}
      onReady={ws.ready}
      onDiscard={ws.discard}
      onPeng={ws.peng}
      onGang={ws.gang}
      onHu={ws.hu}
      onPass={ws.pass}
    />
  );
};
