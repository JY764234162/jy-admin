import type { AIConversation } from "@/api/ai";

const MS_DAY = 86_400_000;

/** 本地自然日 0 点 */
function startOfLocalDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

const GROUP_ORDER = ["0-今天", "1-昨天", "2-一周", "3-一月", "4-更早"] as const;

const GROUP_TITLE: Record<(typeof GROUP_ORDER)[number], string> = {
  "0-今天": "今天",
  "1-昨天": "昨天",
  "2-一周": "一周",
  "3-一月": "一月",
  "4-更早": "更早",
};

/**
 * 按最近活跃时间（优先 updatedAt）分桶：今天 / 昨天 / 7 天内 / 30 天内 / 更早。
 * 返回值带数字前缀，便于 Conversations 按字符串序稳定排列分组。
 */
export function getConversationTimeGroupKey(session: Pick<AIConversation, "updatedAt" | "createdAt">): (typeof GROUP_ORDER)[number] {
  const raw = session.updatedAt || session.createdAt;
  const t = new Date(raw).getTime();
  if (Number.isNaN(t)) return "4-更早";

  const startToday = startOfLocalDay(new Date());
  const startYesterday = startToday - MS_DAY;
  const weekStart = startToday - 7 * MS_DAY;
  const monthStart = startToday - 30 * MS_DAY;

  if (t >= startToday) return "0-今天";
  if (t >= startYesterday) return "1-昨天";
  if (t >= weekStart) return "2-一周";
  if (t >= monthStart) return "3-一月";
  return "4-更早";
}

/** 移动端 Select：`options` 分组结构（保持与会话列表接口顺序一致） */
export function buildSessionSelectGroups(
  sessions: AIConversation[]
): { label: string; options: { label: string; value: string }[] }[] {
  const buckets: Record<(typeof GROUP_ORDER)[number], { label: string; value: string }[]> = {
    "0-今天": [],
    "1-昨天": [],
    "2-一周": [],
    "3-一月": [],
    "4-更早": [],
  };

  for (const s of sessions) {
    const k = getConversationTimeGroupKey(s);
    buckets[k].push({ label: s.title || "新对话", value: s.ID.toString() });
  }

  return GROUP_ORDER.filter((k) => buckets[k].length > 0).map((k) => ({
    label: GROUP_TITLE[k],
    options: buckets[k],
  }));
}
