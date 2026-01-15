import { Avatar, Dropdown, MenuProps } from "antd";
import { UserOutlined, LogoutOutlined, SettingOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { localStg } from "@/utils/storage";
import { loginApi } from "@/api";
import { message } from "antd";

interface UserAvatarProps {
  userInfo: StorageType.UserInfo | null;
}

export const UserAvatar = ({ userInfo }: UserAvatarProps) => {
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await loginApi.logout();
    } catch (error) {
      console.error("登出失败:", error);
    } finally {
      localStg.remove("token");
      localStg.remove("userInfo");
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

  const avatarUrl = userInfo?.headerImg || undefined;
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
