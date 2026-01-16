import { useState, useEffect } from "react";
import { Form, Input, Button, Card, message, Avatar, Divider, Upload, UploadProps } from "antd";
import { UserOutlined, LockOutlined, SaveOutlined, UploadOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { userApi, uploadApi } from "@/api";
import { localStg } from "@/utils/storage";
import type { ChangePasswordRequest, UpdateProfileRequest } from "@/api/types";
import type { RcFile } from "antd/es/upload";
import { userSlice } from "@/store/slice/user";
import styles from "./index.module.css";

export const Component = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const userInfo = useSelector(userSlice.selectors.getUserInfo);
  const [loading, setLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [profileForm] = Form.useForm<UpdateProfileRequest>();
  const [passwordForm] = Form.useForm<ChangePasswordRequest>();
  
  useEffect(() => {
    // 从 Redux 获取用户信息
    if (userInfo) {
      profileForm.setFieldsValue({
        nickName: userInfo.nickName,
        headerImg: userInfo.headerImg,
      });
    } else {
      // 如果没有，尝试从 API 获取
      fetchUserInfo();
    }
  }, [userInfo]);

  const fetchUserInfo = async () => {
    try {
      const res = await userApi.getCurrentUser();
      if (res.code === 0 && res.data) {
        // 更新 Redux 中的用户信息
        dispatch(userSlice.actions.setUserInfo(res.data));
        profileForm.setFieldsValue({
          nickName: res.data.nickName,
          headerImg: res.data.headerImg,
        });
      }
    } catch (error) {
      console.error("获取用户信息失败:", error);
    }
  };

  const handleUpdateProfile = async (values: UpdateProfileRequest) => {
    setLoading(true);
    try {
      const res = await userApi.updateProfile(values);
      if (res.code === 0 && res.data) {
        message.success("更新成功");
        // 更新 Redux 中的用户信息
        dispatch(userSlice.actions.setUserInfo(res.data));
      }
    } catch (error: any) {
      console.error("更新失败:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (values: ChangePasswordRequest) => {
    setPasswordLoading(true);
    try {
      const res = await userApi.changePassword(values);
      if (res.code === 0) {
        message.success("密码修改成功，请重新登录");
        passwordForm.resetFields();
        // 延迟跳转，让用户看到成功消息
        setTimeout(() => {
          localStg.remove("token");
          dispatch(userSlice.actions.clearUserInfo());
          navigate("/login", { replace: true });
        }, 1500);
      }
    } catch (error: any) {
      console.error("修改密码失败:", error);
    } finally {
      setPasswordLoading(false);
    }
  };

  // 处理头像上传
  const handleAvatarUpload: UploadProps["customRequest"] = async ({ file, onSuccess, onError }) => {
    console.log("handleAvatarUpload 被调用", file);
    setUploading(true);
    try {
      const fileObj = file as RcFile;
      
      // 验证文件类型
      const isImage = fileObj.type?.startsWith("image/");
      if (!isImage) {
        message.error("只能上传图片文件！");
        onError?.(new Error("只能上传图片文件"));
        setUploading(false);
        return;
      }

      // 验证文件大小（限制为 5MB）
      const isLt5M = fileObj.size / 1024 / 1024 < 5;
      if (!isLt5M) {
        message.error("图片大小不能超过 5MB！");
        onError?.(new Error("图片大小不能超过 5MB"));
        setUploading(false);
        return;
      }

      console.log("开始上传文件", fileObj.name);
      // 上传文件
      const res = await uploadApi.uploadFile(fileObj);
      console.log("上传响应", res);
      if (res.code === 0 && res.data) {
        // 获取文件 URL（后端返回的 url 字段，格式为 uploads/file/filename）
        let fileUrl = res.data.url || res.data.filePath;
        
        // 如果 URL 不是完整路径，需要拼接 API 基础路径
        if (fileUrl && !fileUrl.startsWith("http")) {
          const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:7777";
          const API_PREFIX = import.meta.env.VITE_API_PREFIX || "/api";
          // 确保 URL 以 / 开头
          if (!fileUrl.startsWith("/")) {
            fileUrl = "/" + fileUrl;
          }
          // 拼接完整 URL（静态文件通过 API 前缀路径访问）
          fileUrl = `${BASE_URL}${API_PREFIX}${fileUrl}`;
        }
        
        // 更新表单字段
        profileForm.setFieldsValue({ headerImg: fileUrl });
        
        // 立即更新 Redux 中的用户信息（头像）
        if (userInfo) {
          dispatch(userSlice.actions.updateUserInfo({ headerImg: fileUrl }));
        }
        
        message.success("头像上传成功");
        onSuccess?.(res.data);
      } else {
        throw new Error(res.msg || "上传失败");
      }
    } catch (error: any) {
      console.error("上传失败:", error);
      message.error(error.message || "头像上传失败");
      onError?.(error);
    } finally {
      setUploading(false);
    }
  };

  // 上传前的验证（返回 true 让文件通过，实际验证和上传在 customRequest 中进行）
  const beforeUpload = (file: RcFile) => {
    const isImage = file.type?.startsWith("image/");
    if (!isImage) {
      message.error("只能上传图片文件！");
      return false;
    }
    const isLt5M = file.size / 1024 / 1024 < 5;
    if (!isLt5M) {
      message.error("图片大小不能超过 5MB！");
      return false;
    }
    return true; // 阻止自动上传，使用 customRequest
  };

  return (
    <div className={styles.profileContainer}>
      <Card title="个人信息" className={styles.profileCard}>
        <div className={styles.userInfoSection}>
          <div className={styles.avatarWrapper}>
            <Avatar
              src={userInfo?.headerImg}
              icon={!userInfo?.headerImg ? <UserOutlined /> : undefined}
              size={80}
              className={styles.avatar}
            />
            <Upload
              customRequest={handleAvatarUpload}
              beforeUpload={beforeUpload}
              showUploadList={false}
              accept="image/*"
              maxCount={1}
            >
              <Button
                type="primary"
                icon={<UploadOutlined />}
                loading={uploading}
                size="small"
                style={{ marginTop: 8 }}
              >
                上传头像
              </Button>
            </Upload>
          </div>
          <div className={styles.userInfo}>
            <div className={styles.username}>{userInfo?.username || "未知用户"}</div>
            <div className={styles.nickname}>{userInfo?.nickName || "未设置昵称"}</div>
          </div>
        </div>

        <Divider />

        <div className={styles.formSection}>
          <h3>修改昵称</h3>
          <Form form={profileForm} name="profile" onFinish={handleUpdateProfile} layout="vertical" className={styles.form}>
            <Form.Item
              name="nickName"
              label="昵称"
              rules={[
                { required: true, message: "请输入昵称" },
                { min: 2, message: "昵称长度不能少于2位" },
                { max: 20, message: "昵称长度不能超过20位" },
              ]}
            >
              <Input prefix={<UserOutlined />} placeholder="请输入昵称" />
            </Form.Item>


            <Form.Item>
              <Button type="primary" htmlType="submit" loading={loading} icon={<SaveOutlined />}>
                保存修改
              </Button>
            </Form.Item>
          </Form>
        </div>

        <Divider />

        <div className={styles.formSection}>
          <h3>修改密码</h3>
          <Form form={passwordForm} name="password" onFinish={handleChangePassword} layout="vertical" className={styles.form}>
            <Form.Item name="oldPassword" label="旧密码" rules={[{ required: true, message: "请输入旧密码" }]}>
              <Input.Password prefix={<LockOutlined />} placeholder="请输入旧密码" />
            </Form.Item>

            <Form.Item
              name="newPassword"
              label="新密码"
              rules={[
                { required: true, message: "请输入新密码" },
                { min: 6, message: "密码长度不能少于6位" },
                { max: 20, message: "密码长度不能超过20位" },
              ]}
            >
              <Input.Password prefix={<LockOutlined />} placeholder="请输入新密码" />
            </Form.Item>

            <Form.Item
              name="confirmPassword"
              label="确认新密码"
              dependencies={["newPassword"]}
              rules={[
                { required: true, message: "请确认新密码" },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue("newPassword") === value) {
                      return Promise.resolve();
                    }
                    return Promise.reject(new Error("两次输入的密码不一致"));
                  },
                }),
              ]}
            >
              <Input.Password prefix={<LockOutlined />} placeholder="请确认新密码" />
            </Form.Item>

            <Form.Item>
              <Button type="primary" htmlType="submit" loading={passwordLoading} icon={<SaveOutlined />}>
                修改密码
              </Button>
            </Form.Item>
          </Form>
        </div>
      </Card>
    </div>
  );
};
