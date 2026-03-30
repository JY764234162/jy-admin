import React from "react";
import { useDispatch, useSelector } from "react-redux";
import { Typography, Card, Alert, Space, Button, Divider } from "antd";
import { incremented, decremented, reset, fetchRandomData, RootState, AppDispatch } from "./state/redux";

import "./style.css";
import { Provider } from "react-redux";
import { store } from "./state/redux";

const { Title, Paragraph, Text } = Typography;

const StateManagement = () => {
  // Redux
  const reduxState = useSelector((state: RootState) => state);
  const dispatch = useDispatch<AppDispatch>();

  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", padding: "20px" }}>
      <Title level={2}>状态管理演示</Title>

      <Alert
        type="info"
        message="什么是状态管理？"
        description="状态管理是前端应用中管理和维护应用状态的方法。在 React 生态中，有多种状态管理方案，如 Redux、Zustand、Jotai 等，它们各有特点，适用于不同的场景。"
        showIcon
        style={{ marginBottom: "20px" }}
      />

      <Space direction="vertical" style={{ width: "100%" }}>
        <Card title="Redux 状态管理">
          <Space direction="vertical" style={{ width: "100%" }}>
            <div className="state-card">
              <Paragraph>
                <Text strong>当前计数: </Text>
                <Text>{reduxState.value}</Text>
              </Paragraph>
              <Space>
                <Button onClick={() => dispatch(incremented())}>增加</Button>
                <Button onClick={() => dispatch(decremented())}>减少</Button>
                <Button onClick={() => dispatch(reset())}>重置</Button>
              </Space>
            </div>

            <Divider />

            <div className="state-card">
              <Paragraph>
                <Text strong>异步数据: </Text>
                <Text>{reduxState.loading ? "加载中..." : reduxState.asyncData !== null ? `${reduxState.asyncData}` : "无数据"}</Text>
              </Paragraph>
              {reduxState.error && <Paragraph className="error-message">{reduxState.error}</Paragraph>}
              <Button onClick={() => dispatch(fetchRandomData())} disabled={reduxState.loading} type="primary">
                获取异步数据
              </Button>
            </div>
          </Space>
        </Card>

        <Card title="Redux 特点">
          <Paragraph>
            <Text strong>Redux 的异步处理：</Text>
          </Paragraph>
          <ul className="feature-list">
            <li>
              <Text strong>createAsyncThunk: </Text>
              使用 createAsyncThunk 处理异步，结合 extraReducers 处理不同状态（pending/fulfilled/rejected）
            </li>
            <li>
              <Text strong>单一数据源: </Text>
              整个应用的状态存储在单一的 store 中，便于管理和调试
            </li>
            <li>
              <Text strong>可预测性: </Text>
              状态变更通过纯函数（reducer）完成，变更过程可追溯
            </li>
          </ul>
        </Card>
      </Space>
    </div>
  );
};

export const Component = () => {
  return (
    <Provider store={store}>
      <StateManagement />
    </Provider>
  );
};
