import { layoutSlice } from "@/store/slice/layout";
import { Layout as AntdLayout } from "antd";
import { memo } from "react";
import { useSelector } from "react-redux";
const { Footer } = AntdLayout;

export const GlobalFooter = memo(() => {
  const isMobile = useSelector(layoutSlice.selectors.getIsMobile);
  return (
    <Footer
      style={{
        textAlign: "center",
        padding: "0 16px",
        boxShadow: "0 1px 2px rgb(0, 21, 41, 0.08)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: isMobile ? "50px" : "unset",
      }}
    >
      前端技术学习实验室 ©{new Date().getFullYear()} Created by JiangYi
    </Footer>
  );
});
