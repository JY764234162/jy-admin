import { memo, type CSSProperties } from "react";
import MDEditor from "@uiw/react-md-editor";
import styles from "./index.module.css";

/**
 * 按"块"切分 markdown 文本
 *
 * 切分规则：
 *  - 默认以空行作为块边界
 *  - 处于围栏代码块 (``` 或 ~~~) 内部时，空行不视为边界
 *
 * 流式 append-only 场景下，本函数保证：
 *  - 已完结块的索引与内容不变 → 配合 React.memo 不再重新渲染/重新解析
 *  - 仅末尾"正在生长的块"内容会持续变化
 *
 * 这样把"整段 markdown 重解析"从 O(n × chunk 数) 降到 O(末块大小 × chunk 数)。
 */
function splitMarkdownBlocks(content: string): string[] {
  if (!content) return [];

  const lines = content.split("\n");
  const blocks: string[] = [];
  let buffer: string[] = [];
  let inFence = false;

  const flush = () => {
    if (buffer.length > 0) {
      blocks.push(buffer.join("\n"));
      buffer = [];
    }
  };

  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
    }
    if (!inFence && line.trim() === "" && buffer.length > 0) {
      flush();
      continue;
    }
    buffer.push(line);
  }
  flush();
  return blocks;
}

const innerMarkdownStyle: CSSProperties = {
  background: "transparent",
  fontSize: 14,
  maxWidth: "100%",
  overflowX: "hidden",
  wordBreak: "break-word", 
  overflowWrap: "anywhere",
};

/**
 * 真正负责调用 MDEditor.Markdown 的最内层组件
 * 单独 memo 一层，确保 freeze 状态变化时不会触发底层 markdown 重新解析。
 */
const InnerMarkdown = memo(
  ({ source }: { source: string }) => (
    <MDEditor.Markdown source={source} style={innerMarkdownStyle} />
  ),
  (prev, next) => prev.source === next.source
);
InnerMarkdown.displayName = "InnerMarkdown";

interface BlockProps {
  source: string;
  /** 是否为已完结块：true 时启用 content-visibility 优化 */
  freeze: boolean;
}

const MarkdownBlock = memo(
  ({ source, freeze }: BlockProps) => (
    <div className={freeze ? styles.markdownBlockFrozen : styles.markdownBlockLive}>
      <InnerMarkdown source={source} />
    </div>
  ),
  (prev, next) => prev.source === next.source && prev.freeze === next.freeze
);
MarkdownBlock.displayName = "MarkdownBlock";

interface StreamingMarkdownProps {
  /** 当前消息累积的完整 markdown 文本 */
  content: string;
  /** 是否仍在流式生成中 */
  streaming: boolean;
}

const StreamingMarkdownInner: React.FC<StreamingMarkdownProps> = ({ content, streaming }) => {
  // 流式结束后整段一次性渲染（仅一次完整 markdown 解析），外层加 content-visibility 让历史消息可被跳过
  if (!streaming) {
    return (
      <div data-color-mode="light" className={styles.markdownDone}>
        <InnerMarkdown source={content} />
      </div>
    );
  }

  // 流式过程中按块拆分；最后一块在生长，前面的块全部冻结
  const blocks = splitMarkdownBlocks(content);
  const lastIdx = blocks.length - 1;

  return (
    <div data-color-mode="light">
      {blocks.map((block, i) => (
        // append-only 切块保证：旧块索引和内容都不变；新块只会追加在末尾。
        // 因此使用 index 作为 key 是安全的，且能让 React.memo 命中。
        <MarkdownBlock key={i} source={block} freeze={i < lastIdx} />
      ))}
    </div>
  );
};

export const StreamingMarkdown = memo(StreamingMarkdownInner);
