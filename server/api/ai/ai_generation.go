package ai

import (
	"sync"
	"sync/atomic"
)

// generationTask 代表一个正在后台进行的 AI 生成任务
// 前端断开 SSE 后，该任务继续运行，把内容实时保存到 DB
// 前端重连时，先返回已累积内容，再注册为观察者继续接收新 chunk
type generationTask struct {
	conversationID uint
	assistantMsgID uint
	content        atomic.Value // string，当前已累积的完整内容
	subscribers    sync.Map     // key: chan string, value: struct{}
	done           chan struct{}
	err            atomic.Value // error
	finished       int32        // 0=进行中, 1=已完成
}

var generationTasks sync.Map // key: uint(conversationID), value: *generationTask

// startGenerationTask 创建并注册一个新的后台生成任务
func startGenerationTask(conversationID, assistantMsgID uint) *generationTask {
	task := &generationTask{
		conversationID: conversationID,
		assistantMsgID: assistantMsgID,
		done:           make(chan struct{}),
	}
	task.content.Store("")
	task.err.Store(error(nil))
	generationTasks.Store(conversationID, task)
	return task
}

// getGenerationTask 获取正在进行的生成任务
func getGenerationTask(conversationID uint) (*generationTask, bool) {
	taskI, ok := generationTasks.Load(conversationID)
	if !ok {
		return nil, false
	}
	task := taskI.(*generationTask)
	// 如果任务已经标记为完成，视为不存在
	if atomic.LoadInt32(&task.finished) == 1 {
		return nil, false
	}
	return task, true
}

// updateContent 原子更新已累积内容
func (t *generationTask) updateContent(content string) {
	t.content.Store(content)
}

// getContent 原子读取已累积内容
func (t *generationTask) getContent() string {
	v := t.content.Load()
	if v == nil {
		return ""
	}
	return v.(string)
}

// notifySubscribers 向所有观察者发送 chunk（非阻塞）
func (t *generationTask) notifySubscribers(chunk string) {
	t.subscribers.Range(func(key, value interface{}) bool {
		ch := key.(chan string)
		select {
		case ch <- chunk:
		default:
		}
		return true
	})
}

// addSubscriber 注册观察者
func (t *generationTask) addSubscriber(ch chan string) {
	t.subscribers.Store(ch, struct{}{})
}

// removeSubscriber 注销观察者
func (t *generationTask) removeSubscriber(ch chan string) {
	t.subscribers.Delete(ch)
}

// finish 标记任务完成，关闭 done 通道，从全局 map 中移除
func (t *generationTask) finish(err error) {
	if atomic.CompareAndSwapInt32(&t.finished, 0, 1) {
		if err != nil {
			t.err.Store(err)
		}
		close(t.done)
		generationTasks.Delete(t.conversationID)
	}
}

// isFinished 返回任务是否已完成
func (t *generationTask) isFinished() bool {
	return atomic.LoadInt32(&t.finished) == 1
}

// getError 获取任务错误（如果有）
func (t *generationTask) getError() error {
	v := t.err.Load()
	if v == nil {
		return nil
	}
	err, _ := v.(error)
	return err
}
