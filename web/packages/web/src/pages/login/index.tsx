import { useState, useEffect } from "react";
import { Form, Input, Button, Checkbox, message, Divider, Card, Spin } from "antd";
import { EyeInvisibleOutlined, EyeTwoTone, UserOutlined, LockOutlined, ReloadOutlined } from "@ant-design/icons";
import { useNavigate, useLocation } from "react-router-dom";
import styles from "./styles.module.css";
import { SwitchThemeButton } from "@/components/SwitchThemeButton";
import logo from "@/assets/logo.svg";
import { SvgIcon } from "@/components/SvgIcon";
import WaveBg from "./waveBg";
import { loginApi } from "@/api";
import { localStg } from "@/utils/storage";
import type { CaptchaResponse } from "@/api/types";
import { initConstantRoute } from "@/store/slice/route";
import { store } from "@/store";
import { userSlice, getCurrentUserInfo } from "@/store/slice/user";

interface LoginFormValues {
  username: string;
  password: string;
  code?: string;
  code_id?: string;
  remember: boolean;
}

export const Component = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const [captchaLoading, setCaptchaLoading] = useState(false);
  const [captchaData, setCaptchaData] = useState<CaptchaResponse | null>(null);
  const [passwordForm] = Form.useForm<LoginFormValues>();

  // 获取登录后要跳转的页面（从 location.state 或默认首页）
  const getRedirectPath = () => {
    const state = location.state as { from?: { pathname?: string } } | null;
    return state?.from?.pathname || "/home";
  };

  // 获取验证码
  const fetchCaptcha = async () => {
    setCaptchaLoading(true);
    try {
      const res = await loginApi.getCaptcha();
      if (res.code === 0 && res.data) {
        setCaptchaData(res.data);
        passwordForm.setFieldsValue({ code_id: res.data.captchaId });
      }
    } catch (error) {
      console.error("获取验证码失败:", error);
    } finally {
      setCaptchaLoading(false);
    }
  };

  // 初始化时获取验证码和填充记住的密码
  useEffect(() => {
    fetchCaptcha();

    // 从本地存储读取记住的用户名和密码
    const remembered = localStg.get("rememberMe");
    if (remembered) {
      passwordForm.setFieldsValue({
        username: remembered.username,
        password: remembered.password,
        remember: true,
      });
    }
  }, []);

  // 密码登录
  const handlePasswordLogin = async (values: LoginFormValues) => {
    setLoading(true);
    try {
      const res = await loginApi.login({
        username: values.username,
        password: values.password,
        code: values.code,
        code_id: values.code_id || captchaData?.captchaId || "",
      });

      if (res.code === 0 && res.data) {
        // 存储 token
        localStg.set("token", res.data.token);
        // 将用户信息存储到 Redux（会自动同步到 localStorage）
        store.dispatch(userSlice.actions.setUserInfo(res.data.user));

        // 处理"记住我"功能
        if (values.remember) {
          // 如果勾选了"记住我"，保存用户名和密码
          localStg.set("rememberMe", {
            username: values.username,
            password: values.password,
          });
        } else {
          // 如果未勾选，清除保存的密码
          localStg.remove("rememberMe");
        }

        message.success("登录成功！");
        // 获取用户信息和菜单权限
        await store.dispatch(getCurrentUserInfo());
        // 初始化路由（会根据权限过滤）
        await store.dispatch(initConstantRoute());
        // 跳转到之前尝试访问的页面或首页
        const redirectPath = getRedirectPath();
        navigate(redirectPath, { replace: true });
      }
    } catch (error: any) {
      // 登录失败后刷新验证码
      fetchCaptcha();
      passwordForm.setFieldsValue({ code: "" });
    } finally {
      setLoading(false);
    }
  };

  // 快速登录（角色）
  // const handleQuickLogin = (role: "super" | "admin" | "user") => {
  //   setLoading(true);
  //   setTimeout(() => {
  //     const roleMap = {
  //       super: "超级管理员",
  //       admin: "管理员",
  //       user: "普通用户",
  //     };
  //     message.success(`以${roleMap[role]}身份登录成功！`);
  //     navigate("/home");
  //     setLoading(false);
  //   }, 500);
  // };

  return (
    <div className={styles.loginContainer}>
      <WaveBg />

      {/* 登录卡片 */}
      <Card className={styles.loginCard} title={null} styles={{ body: { padding: 0 } }}>
        {/* 头部 */}
        <div className={styles.header}>
          <div className={`${styles.logoSection} text-[var(--ant-color-primary)]`}>
            <div>
              <SvgIcon icon={logo} size={36} className="fill-[var(--ant-color-primary)]" />
            </div>
            <span className="text-xl font-semibold">JiangYi 管理系统</span>
          </div>
          <div className={styles.headerActions}>
            <SwitchThemeButton />
          </div>
        </div>

        {/* 登录表单 */}
        <Form
          form={passwordForm}
          name="passwordLogin"
          onFinish={handlePasswordLogin}
          autoComplete="off"
          size="large"
          initialValues={{ remember: true, username: "admin", password: "123456" }}
        >
          <div className="text-base font-bold my-4 text-[var(--ant-color-primary)]">密码登录</div>

          <Form.Item name="username" rules={[{ required: true, message: "请输入用户名" }]}>
            <Input prefix={<UserOutlined />} placeholder="请输入用户名" />
          </Form.Item>

          <Form.Item name="password" rules={[{ required: true, message: "请输入密码" }]}>
            <Input.Password
              prefix={<LockOutlined />}
              iconRender={(visible) => (visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />)}
              placeholder="请输入密码"
            />
          </Form.Item>

          {captchaData?.openCaptcha && (
            <Form.Item>
              <div className="flex gap-2 items-center">
                <Form.Item name="code" noStyle rules={[{ required: true, message: "请输入验证码" }]}>
                  <Input placeholder="请输入验证码" className="flex-1" />
                </Form.Item>
                <Spin spinning={captchaLoading} className="flex items-center gap-1">
                  {captchaData.picPath && (
                    <img
                      src={captchaData.picPath}
                      alt="验证码"
                      className="h-10 cursor-pointer border border-gray-300 rounded"
                      onClick={fetchCaptcha}
                    />
                  )}
                </Spin>
              </div>
              <Form.Item name="code_id" noStyle>
                <Input type="hidden" />
              </Form.Item>
            </Form.Item>
          )}

          <div className={styles.formOptions}>
            <Form.Item name="remember" valuePropName="checked" className="m-0">
              <Checkbox>记住我</Checkbox>
            </Form.Item>
            <a href="#">忘记密码?</a>
          </div>

          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading}>
              确认
            </Button>
          </Form.Item>
        </Form>

        {/* 注册按钮 */}
        <div className={styles.switchButtons}>
          <Button
            type="default"
            onClick={() => {
              navigate("/register");
            }}
          >
            注册账号
          </Button>
        </div>

        {/* 其他账号登录 */}
        {/* <Divider className="text-sm">其他账号登录</Divider>

        <div className={styles.roleButtons}>
          <Button type="primary" onClick={() => handleQuickLogin("super")} loading={loading}>
            超级管理员
          </Button>
          <Button type="primary" onClick={() => handleQuickLogin("admin")} loading={loading}>
            管理员
          </Button>
          <Button type="primary" onClick={() => handleQuickLogin("user")} loading={loading}>
            普通用户
          </Button>
        </div> */}
      </Card>
    </div>
  );
};
