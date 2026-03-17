import React, { useTransition, useDeferredValue, useState, useMemo } from "react";
import { Typography, Card, Alert, Space, Input, Tag, Divider } from "antd";

const { Title, Paragraph, Text } = Typography;

// 模拟重型列表渲染（每条都有一定计算量）
const HeavyList = React.memo(({ query }: { query: string }) => {
  const items = useMemo(() => {
    const list = Array.from({ length: 30000 }, (_, i) => `Item ${i + 1} - ${query}`);
    return list;
  }, [query]);

  return (
    <div
      style={{
        maxHeight: 200,
        overflow: "auto",
        border: "1px solid #d9d9d9",
        borderRadius: 6,
        padding: 8,
      }}
    >
      {items.map((item, i) => (
        <div key={i} style={{ padding: "2px 0" }}>
          {item}
        </div>
      ))}
    </div>
  );
});

// useTransition 演示：Tab 切换时保持输入框响应
const TabContent = ({ tab }: { tab: string }) => {
  const items = useMemo(() => Array.from({ length: 100000 }, (_, i) => `${tab} - 内容 ${i + 1}`), [tab]);
  return (
    <div style={{ maxHeight: 150, overflow: "auto" }}>
      {items.map((item, i) => (
        <div key={i}>{item}</div>
      ))}
    </div>
  );
};

const UseTransitionDemo = () => {
  const [tab, setTab] = useState("tab1");
  const [isPending, startTransition] = useTransition();

  const handleTabChange = (newTab: string) => {
    startTransition(() => {
      setTab(newTab);
    });
  };

  return (
    <Card title="useTransition 演示" style={{ marginTop: 16 }}>
      <Paragraph type="secondary">切换 Tab 时，输入框不会卡顿，因为 Tab 内容更新被标记为低优先级。</Paragraph>
      <Space direction="vertical" style={{ width: "100%" }}>
        <div>
          <Text strong>试试在输入框中快速打字，同时切换 Tab：</Text>
          <Input placeholder="输入时不应卡顿" style={{ marginTop: 8 }} />
        </div>
        <div>
          <Space>
            {["tab1", "tab2", "tab3"].map((t) => (
              <Tag key={t} color={tab === t ? "blue" : "default"} style={{ cursor: "pointer" }} onClick={() => handleTabChange(t)}>
                {t}
              </Tag>
            ))}
          </Space>
          {isPending && <Tag color="orange">过渡中...</Tag>}
        </div>
        <div style={{ opacity: isPending ? 0.6 : 1, transition: "opacity 0.2s" }}>
          <TabContent tab={tab} />
        </div>
      </Space>
    </Card>
  );
};

const UseDeferredValueDemo = () => {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);

  return (
    <Card title="useDeferredValue 演示" style={{ marginTop: 16 }}>
      <Paragraph type="secondary">输入时，输入框即时更新；重型列表用「延后的值」渲染，避免输入卡顿。</Paragraph>
      <Space direction="vertical" style={{ width: "100%" }}>
        <Input placeholder="输入筛选关键词（如 abc）" value={query} onChange={(e) => setQuery(e.target.value)} />
        <Text type="secondary">
          当前输入: &quot;{query}&quot; | 列表筛选: &quot;{deferredQuery}&quot;（可能有延迟）
        </Text>
        <HeavyList query={deferredQuery} />
      </Space>
    </Card>
  );
};

export const Component = () => {
  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", padding: "20px" }}>
      <Title level={2}>useTransition 与 useDeferredValue 演示</Title>

      <Alert
        type="info"
        message="React 18 并发特性"
        description="useTransition 和 useDeferredValue 都是 React 18 的并发 API，用于在 heavy 更新时保持 UI 的响应性。前者包装状态更新，后者包装值并返回其「延后」版本。"
        showIcon
        style={{ marginBottom: "20px" }}
      />

      <Space direction="vertical" style={{ width: "100%" }}>
        <UseTransitionDemo />
        <UseDeferredValueDemo />

        <Card title="使用说明">
          <Paragraph>
            <Text strong>useTransition：</Text>
          </Paragraph>
          <ul>
            <li>将状态更新包裹在 startTransition 中，标记为「可中断」的低优先级更新</li>
            <li>isPending 表示是否有过渡正在进行</li>
            <li>适合：Tab 切换、路由切换、筛选项变化等场景</li>
          </ul>

          <Divider />

          <Paragraph>
            <Text strong>useDeferredValue：</Text>
          </Paragraph>
          <ul>
            <li>接收一个值，返回该值的「延后」版本，React 会先渲染旧值再更新</li>
            <li>适合：输入框 + 重型列表联动，输入即时响应，列表延迟更新</li>
            <li>与 useMemo/useTransition 组合可进一步优化</li>
          </ul>
        </Card>
      </Space>
    </div>
  );
};
