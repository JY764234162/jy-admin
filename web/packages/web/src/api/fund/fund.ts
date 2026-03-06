/**
 * 东方财富-净值估算接口（前端直连，开发环境通过 Vite 代理 /api-fund 避免 CORS）
 * 生产环境需在 Nginx 中代理 /api-fund 到 https://api.fund.eastmoney.com
 */

/** 开发环境由 Vite 代理，生产环境需在 Nginx 中代理 /api-fund 到 https://api.fund.eastmoney.com */
const FUND_API_BASE = "/api-fund";

/** 解析百分比字符串如 "4.94%" -> 0.0494，"---" -> null */
function parsePercent(s: string): number | null {
  if (!s || s === "---" || s === "--") return null;
  const m = s.replace(/%/g, "").trim();
  const n = parseFloat(m);
  return Number.isNaN(n) ? null : n / 100;
}

const SYMBOL_MAP: Record<string, number> = {
  全部: 1,
  股票型: 2,
  混合型: 3,
  债券型: 4,
  指数型: 5,
  QDII: 6,
  ETF联接: 7,
  LOF: 8,
  场内交易基金: 9,
};

export interface FundGuZhiItem {
  序号: number;
  基金代码: string;
  基金名称: string;
  "估算数据-估算值": number | null;
  "估算数据-估算增长率": number | null;
  "公布数据-单位净值": number | null;
  "公布数据-日增长率": number | null;
  估算偏差: number | null;
  单位净值: number | null;
  估算日期: string;
}

export async function fundValueEstimationEm(symbol: keyof typeof SYMBOL_MAP = "全部"): Promise<FundGuZhiItem[]> {
  const type = SYMBOL_MAP[symbol] ?? 1;
  const url = `${FUND_API_BASE}/FundGuZhi/GetFundGZList`;
  const params = new URLSearchParams({
    type: String(type),
    sort: "3",
    orderType: "desc",
    canbuy: "0",
    pageIndex: "1",
    pageSize: "30000",
    _: String(Date.now()),
  });
  const res = await fetch(`${url}?${params}`, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/81.0.4044.138 Safari/537.36",
      Referer: "https://fund.eastmoney.com/",
    },
  });
  const json = await res.json();
  const list = json?.Data?.list ?? [];
  // 东方财富接口返回具名字段：bzdm=基金代码, jjjc=基金名称, gsz=估算值, gszzl=估算增长率,
  // dwjz=单位净值, jzzzl=日增长率, Rate=估算偏差, gzrq=估算日期
  const rows: FundGuZhiItem[] = list.map((row: Record<string, unknown>, i: number) => ({
    序号: i + 1,
    基金代码: String(row.bzdm ?? row.FCODE ?? ""),
    基金名称: String(row.jjjc ?? row.SHORTNAME ?? ""),
    "估算数据-估算值": row.gsz != null ? Number(row.gsz) : null,
    "估算数据-估算增长率": row.gszzl != null ? parsePercent(String(row.gszzl)) : null,
    "公布数据-单位净值": row.dwjz != null ? Number(row.dwjz) : null,
    "公布数据-日增长率": row.jzzzl != null ? parsePercent(String(row.jzzzl)) : null,
    估算偏差: row.Rate != null ? parsePercent(String(row.Rate)) : null,
    单位净值: row.dwjz != null ? Number(row.dwjz) : null,
    估算日期: String(row.gzrq ?? ""),
  }));
  return rows;
}
