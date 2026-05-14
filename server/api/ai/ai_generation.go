package ai

import (
	"context"
	"sync"
)

// generationTask 代表一个正在后台进行的 AI 生成任务
// 前端断开 SSE 后，该任务继续运行，把内容实时保存到 DB
// 前端重连时，通过 signal 通道的 close+recreate 模式广播通知
// 无 atomic.Value，无 sync.Map 订阅者 channel，从根本上消除 panic 和丢 chunk
type generationTask struct {
	mu             sync.Mutex
	conversationID uint
	assistantMsgID uint
	content        []byte        // 当前已累积的完整内容（用 []byte 让 append 摊销 O(1)，避免 string += 的 O(n²)）
	done           bool          // 是否已完成
	err            error         // 完成时的错误（如果有）
	signal         chan struct{} // close+recreate 广播 "有新内容" 或 "已完成"
}

var generationTasks sync.Map // key: uint(conversationID), value: *generationTask

// startGenerationTask 创建并注册一个新的后台生成任务
func startGenerationTask(conversationID, assistantMsgID uint) *generationTask {
	task := &generationTask{
		conversationID: conversationID,
		assistantMsgID: assistantMsgID,
		signal:         make(chan struct{}),
	}
	generationTasks.Store(conversationID, task)
	return task
}

// getGenerationTask 获取生成任务（包括已完成的）
func getGenerationTask(conversationID uint) (*generationTask, bool) {
	v, ok := generationTasks.Load(conversationID)
	if !ok {
		return nil, false
	}
	return v.(*generationTask), true
}

// append 追加内容并广播通知所有等待者
func (t *generationTask) append(chunk string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.done {
		return
	}
	t.content = append(t.content, chunk...)
	old := t.signal
	t.signal = make(chan struct{})
	close(old)
}

// finish 标记任务完成，广播通知，并从全局 map 中移除
func (t *generationTask) finish(err error) {
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.done {
		return
	}
	t.done = true
	t.err = err
	generationTasks.Delete(t.conversationID)
	close(t.signal)
}

// getContent 读取当前已累积内容
func (t *generationTask) getContent() string {
	t.mu.Lock()
	defer t.mu.Unlock()
	return string(t.content)
}

// contentLen 当前累积内容的字节长度
func (t *generationTask) contentLen() int {
	t.mu.Lock()
	defer t.mu.Unlock()
	return len(t.content)
}

// isDone 返回任务是否已完成
func (t *generationTask) isDone() bool {
	t.mu.Lock()
	defer t.mu.Unlock()
	return t.done
}

// getErr 获取任务错误
func (t *generationTask) getErr() error {
	t.mu.Lock()
	defer t.mu.Unlock()
	return t.err
}

// wait 等待新内容或 context 取消（客户端断开）
func (t *generationTask) wait(ctx context.Context) error {
	t.mu.Lock()
	sig := t.signal
	t.mu.Unlock()
	select {
	case <-sig:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}
