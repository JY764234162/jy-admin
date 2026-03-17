import { useState, useMemo, useEffect, useCallback } from "react";
import { Card, Table, Select, Input, Button, Space, message, Tag } from "antd";
import { ReloadOutlined, PlusOutlined } from "@ant-design/icons";
import { fundValueEstimationEm, type FundGuZhiItem } from "@/api/fund/fund";
import { localStg } from "@/utils/storage";
import { useSelector } from "react-redux";
import { layoutSlice } from "@/store/slice/layout";

// const SYMBOL_OPTIONS = [
//   "全部",
//   "股票型",
//   "混合型",
//   "债券型",
//   "指数型",
//   "QDII",
//   "ETF联接",
//   "LOF",
//   "场内交易基金",
// ] as const;

function loadSelectedCodes(): string[] {
  const arr = localStg.get("fundSelectedCodes");
  return Array.isArray(arr) ? arr.filter((v: unknown) => typeof v === "string") : [];
}

export const Component = () => {
  // const [symbol, setSymbol] = useState<typeof SYMBOL_OPTIONS[number]>("全部");
  const [fundCodeInput, setFundCodeInput] = useState("");
  const [selectedCodes, setSelectedCodes] = useState<string[]>(() => loadSelectedCodes());
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<FundGuZhiItem[]>([]);
  const isMobile = useSelector(layoutSlice.selectors.getIsMobile);
  const [fundOptions, setFundOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [fundOptionsLoading, setFundOptionsLoading] = useState(true);

  // fundList 体积较大（~3MB+），延后到进入页面后再异步加载，避免把静态数据打进页面主 chunk
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setFundOptionsLoading(true);
        const mod = await import("./fundList");
        if (!mounted) return;
        const list = mod.default as Array<[string, string, string, string, string]>;
        setFundOptions(
          list.map((fundInfo) => ({
            label: `${fundInfo[0]}-${fundInfo[2]}`,
            value: fundInfo[0],
          }))
        );
      } finally {
        if (mounted) setFundOptionsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);


  useEffect(() => {
    localStg.set("fundSelectedCodes", selectedCodes);
  }, [selectedCodes]);

  const addCode = useCallback((code: string) => {
    const c = String(code).trim();
    if (!c) return;
    setSelectedCodes((prev) => (prev.includes(c) ? prev : [...prev, c]));
  }, []);

  const removeCode = useCallback((code: string) => {
    setSelectedCodes((prev) => prev.filter((c) => c !== code));
  }, []);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fundValueEstimationEm('全部');
      setData(list);
      message.success(`共加载 ${list.length} 条`);
    } catch (e) {
      message.error("加载失败，请检查网络或稍后重试");
      setData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const filteredData = useMemo(() => {
    if (selectedCodes.length === 0) return data;
    const set = new Set(selectedCodes);
    return data.filter((row) => set.has(String(row.基金代码)));
  }, [data, selectedCodes]);

  const columns = useMemo(() => {
    const common = [
      { title: "基金名称", dataIndex: "基金名称", key: "基金名称", ellipsis: true, },
      {
        title: "估算值",
        dataIndex: "估算数据-估算值",
        key: "估算值",
        width: 90,
        render: (v: number) => (v != null ? Number(v).toFixed(4) : "-"),
      },
      {
        title: "估算增长率",
        dataIndex: "估算数据-估算增长率",
        key: "估算增长率",
        width: 120,
        render: (v: number) => {
          if (v == null) return "-";
          const n = Number(v);
          const color = n >= 0 ? "#cf1322" : "#3f8600";
          return <span style={{ color }}>{(n * 100).toFixed(2)}%</span>;
        },
      },
      {
        title: "单位净值",
        dataIndex: "公布数据-单位净值",
        key: "单位净值",
        width: 90,
        render: (v: number) => (v != null ? Number(v).toFixed(4) : "-"),
      },
    ];

    if (isMobile) return common;

    return [
      { title: "序号", dataIndex: "序号", key: "序号", width: 100 },
      { title: "基金代码", dataIndex: "基金代码", key: "基金代码", width: 100 },
      ...common,
      {
        title: "日增长率",
        dataIndex: "公布数据-日增长率",
        key: "日增长率",
        width: 90,
        render: (v: number) => {
          if (v == null) return "-";
          const n = Number(v);
          const color = n >= 0 ? "#cf1322" : "#3f8600";
          return <span style={{ color }}>{(n * 100).toFixed(2)}%</span>;
        },
      },
      {
        title: "估算偏差",
        dataIndex: "估算偏差",
        key: "估算偏差",
        width: 90,
        render: (v: number) => (v != null ? Number(v).toFixed(4) : "-"),
      },
      { title: "估算日期", dataIndex: "估算日期", key: "估算日期", width: 150 },
    ];
  }, [isMobile]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);
  return (
    <div style={{ padding: 24 }}>
      <Card title="基金净值估算（东方财富）">
        <Space wrap style={{ marginBottom: 16 }}>
          {/* <Select
            value={symbol}
            onChange={setSymbol}
            options={SYMBOL_OPTIONS.map((s) => ({ label: s, value: s }))}
            style={{ width: 140 }}
          /> */}
          <Select
            placeholder="选择基金添加到自选"
            options={fundOptions}
            style={{ width: 280 }}
            showSearch
            optionFilterProp="label"
            loading={fundOptionsLoading}
            disabled={fundOptionsLoading}
            filterOption={(input, option) => {
              const kw = (input ?? "").trim().toLowerCase();
              if (!kw) return true;
              const label = String(option?.label ?? "").toLowerCase();
              const value = String(option?.value ?? "").toLowerCase();
              return label.includes(kw) || value.includes(kw);
            }}
            onChange={(v) => {
              if (v) addCode(String(v));
            }}
            allowClear
          />
          <Input
            placeholder="输入基金代码添加"
            value={fundCodeInput}
            onChange={(e) => setFundCodeInput(e.target.value)}
            onPressEnter={() => {
              addCode(fundCodeInput);
              setFundCodeInput("");
            }}
            style={{ width: 160 }}
          />
          <Button
            type="default"
            icon={<PlusOutlined />}
            onClick={() => {
              addCode(fundCodeInput);
              setFundCodeInput("");
            }}
          >
            添加
          </Button>
          <Button icon={<ReloadOutlined />} onClick={fetchList} loading={loading}>
            刷新
          </Button>
        </Space>
        {selectedCodes.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <span style={{ marginRight: 8 }}>自选基金：</span>
            {selectedCodes.map((c) => (
              <Tag
                key={c}
                closable
                onClose={() => removeCode(c)}
                style={{ marginBottom: 4 }}
              >
                {c}
              </Tag>
            ))}
          </div>
        )}
        <Table
          rowKey={(r) => r.基金代码 + (r.估算日期 ?? "")}
          loading={loading}
          dataSource={filteredData}
          columns={columns}
          scroll={isMobile ? { x: 400 } : { x: 1000 }}
          pagination={{
            showSizeChanger: true,
            showQuickJumper: true,
            defaultPageSize: 20,
            showTotal: (total) => `共 ${total} 条`,
          }}
        />
      </Card>
    </div>
  );
};
