package websocket

import (
	"log"
	"sync"
)

// Hub 管理所有 WebSocket 连接，按 roomId 分组
type Hub struct {
	rooms map[string]*Room
	mu    sync.RWMutex
}

// Room 表示一个协同编辑房间
type Room struct {
	ID      string
	clients map[*Client]bool
	mu      sync.RWMutex
	state   []byte
	stateMu sync.RWMutex
}

// Client 表示一个 WebSocket 连接
type Client struct {
	hub    *Hub
	room   *Room
	send   chan []byte
	userID string
}

// NewHub 创建新的 Hub
func NewHub() *Hub {
	return &Hub{
		rooms: make(map[string]*Room),
	}
}

// GetOrCreateRoom 获取或创建房间
func (h *Hub) GetOrCreateRoom(roomID string) *Room {
	h.mu.Lock()
	defer h.mu.Unlock()

	if room, ok := h.rooms[roomID]; ok {
		return room
	}

	room := &Room{
		ID:      roomID,
		clients: make(map[*Client]bool),
	}
	h.rooms[roomID] = room
	log.Printf("[WebSocket] 创建房间: %s", roomID)
	return room
}

// RemoveRoom 删除空房间
func (h *Hub) RemoveRoom(roomID string) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if room, ok := h.rooms[roomID]; ok {
		room.mu.Lock()
		clientCount := len(room.clients)
		room.mu.Unlock()

		if clientCount == 0 {
			delete(h.rooms, roomID)
			log.Printf("[WebSocket] 删除空房间: %s", roomID)
		}
	}
}

// Register 注册客户端到房间
func (r *Room) Register(client *Client) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.clients[client] = true
	log.Printf("[WebSocket] 用户 %s 加入房间 %s，当前人数: %d", client.userID, r.ID, len(r.clients))
}

// Unregister 从房间移除客户端
func (r *Room) Unregister(client *Client) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, ok := r.clients[client]; ok {
		delete(r.clients, client)
		close(client.send)
		log.Printf("[WebSocket] 用户 %s 离开房间 %s，当前人数: %d", client.userID, r.ID, len(r.clients))
	}
}

// Broadcast 广播消息给房间内所有其他客户端（排除发送者）
func (r *Room) Broadcast(sender *Client, message []byte) {
	r.mu.Lock()
	defer r.mu.Unlock()

	msgType := "UPDATE"
	if len(message) > 0 && message[0] == 0x01 {
		msgType = "STATE"
	}

	clientCount := 0
	for client := range r.clients {
		if client == sender {
			continue
		}
		select {
		case client.send <- message:
			clientCount++
		default:
			close(client.send)
			delete(r.clients, client)
		}
	}
	if clientCount > 0 {
		log.Printf("[WebSocket] 房间 %s 广播 %s 消息 (%d bytes) 给 %d 个客户端", r.ID, msgType, len(message), clientCount)
	}
}

// BroadcastToAll 广播给房间内所有客户端（包括发送者，用于同步初始状态）
func (r *Room) BroadcastToAll(message []byte) {
	r.mu.Lock()
	defer r.mu.Unlock()

	for client := range r.clients {
		select {
		case client.send <- message:
		default:
			close(client.send)
			delete(r.clients, client)
		}
	}
}

// GetClientCount 获取房间内客户端数量
func (r *Room) GetClientCount() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.clients)
}

// SetState 设置房间状态快照
func (r *Room) SetState(state []byte) {
	r.stateMu.Lock()
	defer r.stateMu.Unlock()
	r.state = state
}

// GetState 获取房间状态快照
func (r *Room) GetState() []byte {
	r.stateMu.RLock()
	defer r.stateMu.RUnlock()
	return r.state
}
