import { Avatar, Dropdown, MenuProps } from "antd";
import { UserOutlined, LogoutOutlined, SettingOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { localStg } from "@/utils/storage";
import { getImageUrl } from "@/utils/image";
import { loginApi } from "@/api";
import { message } from "antd";
import { userSlice } from "@/store/slice/user";

export const UserAvatar = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const userInfo = useSelector(userSlice.selectors.getUserInfo);

  const handleLogout = async () => {
    try {
      await loginApi.logout();
    } catch (error) {
      console.error("登出失败:", error);
    } finally {
      localStg.remove("token");
      dispatch(userSlice.actions.clearUserInfo());
      message.success("已退出登录");
      navigate("/login", { replace: true });
    }
  };

  const menuItems: MenuProps["items"] = [
    {
      key: "profile",
      label: "个人信息",
      icon: <UserOutlined />,
      onClick: () => {
        navigate("/profile");
      },
    },
    {
      type: "divider",
    },
    {
      key: "logout",
      label: "退出登录",
      icon: <LogoutOutlined />,
      onClick: handleLogout,
    },
  ];

  const avatarUrl = getImageUrl(userInfo?.headerImg);
  const displayName = userInfo?.nickName || userInfo?.username || "用户";

  return (
    <Dropdown menu={{ items: menuItems }} placement="bottomRight">
      <div style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "0 8px" }}>
        <Avatar src={avatarUrl} icon={!avatarUrl ? <UserOutlined /> : undefined} size="default" />
        <span style={{ fontSize: 14 }}>{displayName}</span>
      </div>
    </Dropdown>
  );
};
