/**
 * 富文本编辑器核心类
 * 基于 contenteditable 实现
 */

import { SelectionHelper, SavedRange } from "./SelectionHelper";
import { CommandHistory } from "./History";
import { Command, FormatCommand } from "./Command";
import { PluginManager } from "./PluginManager";

export interface EditorOptions {
  placeholder?: string;
  onContentChange?: (html: string) => void;
  onSelectionChange?: () => void;
}

export class RichEditor {
  private container: HTMLElement;
  private history: CommandHistory;
  private options: EditorOptions;
  private contentChangeTimer: number | null = null;
  private historyRecordTimer: number | null = null;
  private pluginManager: PluginManager;
  private lastRecordedContent: string = "";

  constructor(container: HTMLElement, options: EditorOptions = {}) {
    this.container = container;
    this.options = options;
    this.history = new CommandHistory(100, container);
    this.pluginManager = new PluginManager(this);

    this.init();
  }

  /**
   * 初始化编辑器
   */
  private init(): void {
    // 设置 contenteditable
    this.container.contentEditable = "true";
    this.container.setAttribute("data-placeholder", this.options.placeholder || "");

    // 添加样式类
    this.container.classList.add("rich-editor-content");

    // 绑定事件
    this.bindEvents();

    // 设置默认样式
    this.setDefaultStyles();
  }

  /**
   * 绑定事件
   */
  private bindEvents(): void {
    // 内容变化事件（防抖）
    this.container.addEventListener("input", () => {
      // 记录历史（防抖 - 300ms，更快响应）
      if (this.historyRecordTimer) {
        clearTimeout(this.historyRecordTimer);
      }
      this.historyRecordTimer = window.setTimeout(() => {
        this.recordHistory();
      }, 300);

      // 触发内容变化回调（300ms）
      if (this.contentChangeTimer) {
        clearTimeout(this.contentChangeTimer);
      }
      this.contentChangeTimer = window.setTimeout(() => {
        this.handleContentChange();
      }, 300);
    });

    // 选择变化事件
    document.addEventListener("selectionchange", () => {
      if (this.container.contains(SelectionHelper.getSelection()?.anchorNode as Node)) {
        this.handleSelectionChange();
      }
    });

    // 粘贴事件处理
    this.container.addEventListener("paste", (e) => {
      this.handlePaste(e);
    });

    // 键盘事件
    this.container.addEventListener("keydown", (e) => {
      this.handleKeyDown(e);
    });

    // 处理拖拽悬停事件，更新光标位置
    this.container.addEventListener("dragover", (e) => {
      e.preventDefault();
      this.handleDragOver(e);
    });

    this.container.addEventListener("drop", (e) => {
      e.preventDefault();
      this.handleDrop(e);
    });

    // 处理链接点击
    this.container.addEventListener("click", (e) => {
      this.handleClick(e);
    });
  }

  /**
   * 记录历史快照
   */
  private recordHistory(): void {
    const content = this.container.innerHTML;
    if (content !== this.lastRecordedContent) {
      this.history.record(content);
      this.lastRecordedContent = content;
      console.log("📝 历史记录已保存，撤销栈大小:", this.history.getUndoCount());
    }
  }

  /**
   * 处理内容变化
   */
  private handleContentChange(): void {
    const html = this.getHTML();
    this.pluginManager.notifyContentChange(html);
    this.options.onContentChange?.(html);
  }

  /**
   * 处理选择变化
   */
  private handleSelectionChange(): void {
    const range = SelectionHelper.getRange();
    this.pluginManager.notifySelectionChange(range);
    this.options.onSelectionChange?.();
  }

  /**
   * 处理点击事件
   */
  private handleClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    
    // 检查是否点击了链接
    let linkElement: HTMLAnchorElement | null = null;
    if (target.tagName === "A") {
      linkElement = target as HTMLAnchorElement;
    } else {
      // 检查父元素是否是链接
      linkElement = target.closest("a");
    }

    if (linkElement && linkElement.href) {
      // 如果按住 Ctrl/Cmd 键，或者点击事件带有特殊标记，打开链接
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        window.open(linkElement.href, "_blank");
      } else {
        // 普通点击时，显示提示（可选）
        e.preventDefault();
        // 可以添加一个提示，告诉用户按 Ctrl/Cmd + 点击来打开链接
        const shouldOpen = confirm(`要打开链接吗？\n${linkElement.href}\n\n提示：按住 Ctrl/Cmd 并点击可直接打开链接`);
        if (shouldOpen) {
          window.open(linkElement.href, "_blank");
        }
      }
    }
  }

  /**
   * 处理粘贴事件
   */
  private handlePaste(e: ClipboardEvent): void {
    e.preventDefault();
    
    const clipboardData = e.clipboardData;
    if (!clipboardData) {
      return;
    }

    // 优先检查是否有图片文件
    const items = clipboardData.items;
    if (items && items.length > 0) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        
        // 检查是否是图片类型
        if (item && item.type.indexOf("image") !== -1) {
          const file = item.getAsFile();
          if (file) {
            // 粘贴图片（历史记录由 insertImage 方法内部处理）
            this.insertImageFromFile(file);
            return;
          }
        }
      }
    }

    // 如果没有图片，检查 files（某些浏览器可能使用这种方式）
    const files = clipboardData.files;
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file && file.type.startsWith("image/")) {
          // 粘贴图片（历史记录由 insertImage 方法内部处理）
          this.insertImageFromFile(file);
          return;
        }
      }
    }

    // 如果没有图片，处理文本内容
    // 优先获取纯文本
    const text = clipboardData.getData("text/plain");
    if (text) {
      SelectionHelper.insertText(text);
      this.handleContentChange();
      // 粘贴后立即记录历史
      setTimeout(() => this.recordHistory(), 0);
      return;
    }

    // 如果有 HTML，进行清理后插入
    const html = clipboardData.getData("text/html");
    if (html) {
      const cleaned = this.cleanHTML(html);
      SelectionHelper.insertHTML(cleaned);
      this.handleContentChange();
      // 粘贴后立即记录历史
      setTimeout(() => this.recordHistory(), 0);
    }
  }

  /**
   * 处理键盘事件
   */
  private handleKeyDown(e: KeyboardEvent): void {
    // Ctrl/Cmd + Z: 撤销
    if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
      e.preventDefault();
      this.undo();
      return;
    }

    // Ctrl/Cmd + Shift + Z: 重做
    if ((e.ctrlKey || e.metaKey) && e.key === "z" && e.shiftKey) {
      e.preventDefault();
      this.redo();
      return;
    }

    // Ctrl/Cmd + Y: 重做
    if ((e.ctrlKey || e.metaKey) && e.key === "y") {
      e.preventDefault();
      this.redo();
      return;
    }

    // Tab: 插入缩进
    if (e.key === "Tab") {
      e.preventDefault();
      SelectionHelper.insertText("    "); // 4个空格
      return;
    }
  }

  /**
   * 处理拖拽悬停事件，更新光标位置
   */
  private handleDragOver(e: DragEvent): void {
    // 根据鼠标位置更新光标位置
    const x = e.clientX;
    const y = e.clientY;

    // 获取鼠标位置对应的文本位置
    let range: Range | null = null;

    // 尝试使用 caretRangeFromPoint（WebKit/Blink）
    if (document.caretRangeFromPoint) {
      range = document.caretRangeFromPoint(x, y);
    }
    // 尝试使用 caretPositionFromPoint（Firefox）
    else if ((document as any).caretPositionFromPoint) {
      const caretPos = (document as any).caretPositionFromPoint(x, y);
      if (caretPos) {
        range = document.createRange();
        range.setStart(caretPos.offsetNode, caretPos.offset);
        range.collapse(true);
      }
    }
    // 降级方案：使用 elementFromPoint
    else {
      const element = document.elementFromPoint(x, y);
      if (element && this.container.contains(element)) {
        // 尝试找到最近的文本节点
        const textNode = this.findNearestTextNode(element, x, y);
        if (textNode) {
          range = document.createRange();
          range.setStart(textNode, 0);
          range.collapse(true);
        }
      }
    }

    // 更新选择范围
    if (range && this.container.contains(range.startContainer)) {
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
  }

  /**
   * 查找最近的文本节点
   */
  private findNearestTextNode(element: Node, x: number, y: number): Text | null {
    if (element.nodeType === Node.TEXT_NODE) {
      return element as Text;
    }

    if (element.nodeType === Node.ELEMENT_NODE) {
      const el = element as HTMLElement;
      const rect = el.getBoundingClientRect();
      
      // 如果鼠标在元素内，查找子节点
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        for (let i = 0; i < el.childNodes.length; i++) {
          const child = el.childNodes[i];
          if (!child) continue;
          const childRect = child.nodeType === Node.ELEMENT_NODE
            ? (child as HTMLElement).getBoundingClientRect()
            : this.getTextNodeRect(child as Text);

          if (x >= childRect.left && x <= childRect.right &&
              y >= childRect.top && y <= childRect.bottom) {
            const found = this.findNearestTextNode(child, x, y);
            if (found) return found;
          }
        }
        
        // 如果没找到，返回第一个文本节点
        const walker = document.createTreeWalker(
          el,
          NodeFilter.SHOW_TEXT,
          null
        );
        const firstTextNode = walker.nextNode();
        return firstTextNode as Text | null;
      }
    }

    return null;
  }

  /**
   * 获取文本节点的边界矩形
   */
  private getTextNodeRect(textNode: Text): DOMRect {
    try {
      const range = document.createRange();
      range.selectNodeContents(textNode);
      return range.getBoundingClientRect();
    } catch (error) {
      // 如果失败，返回父元素的矩形
      const parent = textNode.parentElement;
      return parent ? parent.getBoundingClientRect() : new DOMRect();
    }
  }

  /**
   * 处理拖拽文件
   */
  private handleDrop(e: DragEvent): void {
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) {
      return;
    }

    // 在 drop 时再次更新光标位置，确保使用最新的位置
    this.handleDragOver(e);

    const file = files[0];
    if (file && file.type.startsWith("image/")) {
      this.insertImageFromFile(file);
    }
  }

  /**
   * 从文件插入图片
   */
  private insertImageFromFile(file: File): void {
    // 验证文件类型
    if (!file.type.startsWith("image/")) {
      console.warn("文件不是图片类型:", file.type);
      return;
    }

    // 验证文件大小（限制为 10MB）
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      console.warn("图片文件过大，最大支持 10MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (dataUrl) {
        // insertImage 方法内部会处理历史记录
        this.insertImage(dataUrl, file.name || "粘贴的图片");
      }
    };
    reader.onerror = () => {
      console.error("读取图片文件失败");
    };
    reader.readAsDataURL(file);
  }

  /**
   * 执行格式化命令
   */
  format(format: string, value?: any): void {
    const command = new FormatCommand(format, value);
    this.history.execute(command);
    this.handleContentChange();
  }

  /**
   * 加粗
   */
  bold(): void {
    this.format("bold");
  }

  /**
   * 斜体
   */
  italic(): void {
    this.format("italic");
  }

  /**
   * 下划线
   */
  underline(): void {
    this.format("underline");
  }

  /**
   * 删除线
   */
  strikethrough(): void {
    this.format("strikeThrough");
  }

  /**
   * 设置字体大小
   */
  fontSize(size: number): void {
    this.format("fontSize", size);
  }

  /**
   * 设置字体颜色
   */
  fontColor(color: string): void {
    this.format("foreColor", color);
  }

  /**
   * 设置背景色
   */
  backgroundColor(color: string): void {
    this.format("backColor", color);
  }

  /**
   * 设置对齐方式
   */
  align(alignment: "left" | "center" | "right" | "justify"): void {
    this.format("justify" + alignment.charAt(0).toUpperCase() + alignment.slice(1));
  }

  /**
   * 插入有序列表
   */
  insertOrderedList(): void {
    this.format("insertOrderedList");
  }

  /**
   * 插入无序列表
   */
  insertUnorderedList(): void {
    this.format("insertUnorderedList");
  }

  /**
   * 插入引用
   */
  formatBlock(tag: string): void {
    this.format("formatBlock", `<${tag}>`);
  }

  /**
   * 插入链接
   */
  createLink(url: string): void {
    if (SelectionHelper.hasSelection()) {
      this.format("createLink", url);
    } else {
      // 如果没有选择，插入链接文本
      SelectionHelper.insertHTML(`<a href="${url}">${url}</a>`);
    }
  }

  /**
   * 插入图片
   */
  insertImage(src: string, alt: string = ""): void {
    const img = `<img src="${src}" alt="${alt}" style="max-width: 100%; height: auto;" />`;
    SelectionHelper.insertHTML(img);
    this.handleContentChange();
    // 插入图片后记录历史
    setTimeout(() => {
      this.recordHistory();
    }, 0);
  }

  /**
   * 插入表格
   */
  insertTable(rows: number, cols: number): void {
    let tableHTML = "<table border='1' style='border-collapse: collapse; width: 100%;'>";
    for (let i = 0; i < rows; i++) {
      tableHTML += "<tr>";
      for (let j = 0; j < cols; j++) {
        tableHTML += "<td>&nbsp;</td>";
      }
      tableHTML += "</tr>";
    }
    tableHTML += "</table>";
    
    SelectionHelper.insertHTML(tableHTML);
    this.handleContentChange();
  }

  /**
   * 撤销
   */
  undo(): void {
    console.log("⬅️ 执行撤销，当前撤销栈大小:", this.history.getUndoCount());
    
    // 先清除定时器并立即记录当前状态
    if (this.historyRecordTimer) {
      clearTimeout(this.historyRecordTimer);
      this.historyRecordTimer = null;
    }
    this.recordHistory();
    
    // 执行撤销
    if (this.history.undo()) {
      console.log("✅ 撤销成功，剩余撤销栈大小:", this.history.getUndoCount());
      this.handleContentChange();
    } else {
      console.log("❌ 撤销失败，没有可撤销的内容");
    }
  }

  /**
   * 重做
   */
  redo(): void {
    // 先清除定时器
    if (this.historyRecordTimer) {
      clearTimeout(this.historyRecordTimer);
      this.historyRecordTimer = null;
    }
    
    // 执行重做
    if (this.history.redo()) {
      this.handleContentChange();
    }
  }

  /**
   * 是否可以撤销
   */
  canUndo(): boolean {
    return this.history.canUndo();
  }

  /**
   * 是否可以重做
   */
  canRedo(): boolean {
    return this.history.canRedo();
  }

  /**
   * 获取 HTML 内容
   */
  getHTML(): string {
    return this.container.innerHTML;
  }

  /**
   * 设置 HTML 内容
   */
  setHTML(html: string): void {
    this.container.innerHTML = html;
    this.handleContentChange();
    // 延迟记录初始状态
    setTimeout(() => {
      this.recordHistory();
    }, 100);
  }

  /**
   * 获取纯文本内容
   */
  getText(): string {
    return this.container.textContent || "";
  }

  /**
   * 清空内容
   */
  clear(): void {
    this.container.innerHTML = "";
    this.history.clear();
    this.handleContentChange();
  }

  /**
   * 聚焦
   */
  focus(): void {
    this.container.focus();
  }

  /**
   * 失焦
   */
  blur(): void {
    this.container.blur();
  }

  /**
   * 检查格式状态
   */
  queryCommandState(command: string): boolean {
    return SelectionHelper.queryCommandState(command);
  }

  /**
   * 查找文本
   */
  findText(searchText: string, caseSensitive: boolean = false): number {
    if (!searchText) {
      return 0;
    }

    const text = this.getText();
    const searchRegex = new RegExp(
      searchText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      caseSensitive ? "g" : "gi"
    );
    const matches = text.match(searchRegex);
    return matches ? matches.length : 0;
  }

  /**
   * 查找并高亮文本
   */
  findAndHighlight(searchText: string, caseSensitive: boolean = false): boolean {
    if (!searchText) {
      return false;
    }

    // 清除之前的高亮
    this.clearHighlight();

    const container = this.container;
    const walker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_TEXT,
      null
    );

    const textNodes: Text[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) {
      textNodes.push(node as Text);
    }

    let found = false;
    const searchRegex = new RegExp(
      searchText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      caseSensitive ? "g" : "gi"
    );

    textNodes.forEach((textNode) => {
      const text = textNode.textContent || "";
      const matches = text.match(searchRegex);
      if (matches) {
        found = true;
        const parent = textNode.parentNode;
        if (!parent) return;

        const parts: (string | HTMLElement)[] = [];
        let lastIndex = 0;

        matches.forEach((match) => {
          const index = text.indexOf(match, lastIndex);
          if (index > lastIndex) {
            parts.push(text.substring(lastIndex, index));
          }
          const mark = document.createElement("mark");
          mark.style.backgroundColor = "#ffeb3b";
          mark.textContent = match;
          parts.push(mark);
          lastIndex = index + match.length;
        });

        if (lastIndex < text.length) {
          parts.push(text.substring(lastIndex));
        }

        const fragment = document.createDocumentFragment();
        parts.forEach((part) => {
          if (typeof part === "string") {
            fragment.appendChild(document.createTextNode(part));
          } else {
            fragment.appendChild(part);
          }
        });

        parent.replaceChild(fragment, textNode);
      }
    });

    return found;
  }

  /**
   * 清除高亮
   */
  clearHighlight(): void {
    const marks = this.container.querySelectorAll("mark");
    marks.forEach((mark) => {
      const parent = mark.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(mark.textContent || ""), mark);
        parent.normalize();
      }
    });
  }

  /**
   * 替换文本
   */
  replaceText(searchText: string, replaceText: string, replaceAll: boolean = false): number {
    if (!searchText) {
      return 0;
    }

    let count = 0;
    const container = this.container;
    const walker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_TEXT,
      null
    );

    const textNodes: Text[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) {
      textNodes.push(node as Text);
    }

    const searchRegex = new RegExp(
      searchText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "g"
    );

    textNodes.forEach((textNode) => {
      const text = textNode.textContent || "";
      if (searchRegex.test(text)) {
        const newText = replaceAll
          ? text.replace(searchRegex, replaceText)
          : text.replace(searchRegex, replaceText);
        
        if (newText !== text) {
          textNode.textContent = newText;
          count++;
          if (!replaceAll) {
            return;
          }
        }
      }
    });

    if (count > 0) {
      this.handleContentChange();
    }

    return count;
  }

  /**
   * 清理 HTML（移除危险标签和属性）
   */
  private cleanHTML(html: string): string {
    const div = document.createElement("div");
    div.innerHTML = html;

    // 移除 script 标签
    const scripts = div.querySelectorAll("script");
    scripts.forEach((script) => script.remove());

    // 移除事件处理器属性
    const allElements = div.querySelectorAll("*");
    allElements.forEach((el) => {
      Array.from(el.attributes).forEach((attr) => {
        if (attr.name.startsWith("on")) {
          el.removeAttribute(attr.name);
        }
      });
    });

    return div.innerHTML;
  }

  /**
   * 设置默认样式
   */
  private setDefaultStyles(): void {
    if (!this.container.style.minHeight) {
      this.container.style.minHeight = "200px";
    }
  }

  /**
   * 获取插件管理器
   */
  getPluginManager(): PluginManager {
    return this.pluginManager;
  }

  /**
   * 销毁编辑器
   */
  destroy(): void {
    if (this.contentChangeTimer) {
      clearTimeout(this.contentChangeTimer);
    }
    this.container.contentEditable = "false";
    this.history.clear();
    this.pluginManager.destroy();
  }
}

