import Router from "./router";
import AppProvider from "./context/AppProvider";
import AntdProvider from "./context/AntdProvider";
import { useSelector } from "react-redux";
import { settingSlice } from "./store/slice/setting";
import { Watermark, WatermarkProps } from "antd";
import { AliveScope } from "@/components/KeepAlive";

import { useUpdateEffect } from "ahooks";
import { localStg } from "./utils/storage";
import "@/styles/index.css";
import "@/styles/scrollbar.scss";
import { ReactNode, useMemo } from "react";
const watermarkProps: WatermarkProps = {
  font: {
    fontSize: 16,
  },
  height: 128,
  offset: [12, 60],
  rotate: -15,
  width: 240,
  zIndex: 9999,
};

export default function App() {
  const settings = useSelector(settingSlice.selectors.getSettings);
  //持久化设置
  useUpdateEffect(() => {
    localStg.set("settings", settings);
  }, [settings]);

  const appContent: ReactNode = useMemo(() => {
    return settings.watermark.visible ? (
      <Watermark className="h-full" content={settings.watermark?.text} {...watermarkProps}>
        <AliveScope>
          <Router />
        </AliveScope>
      </Watermark>
    ) : (
      <AliveScope>
        <Router />
      </AliveScope>
    );
  }, [settings.watermark.visible]);

  return (
    <AntdProvider>
      <AppProvider>{appContent}</AppProvider>
    </AntdProvider>
  );
}
