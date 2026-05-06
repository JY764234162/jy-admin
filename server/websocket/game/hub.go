package game

import (
	"sync"
	"time"
)

// GameHub 管理所有游戏房间
type GameHub struct {
	rooms map[string]*GameRoom
	mu    sync.RWMutex
}

func NewGameHub() *GameHub {
	return &GameHub{
		rooms: make(map[string]*GameRoom),
	}
}

func (h *GameHub) GetOrCreateRoom(roomID string) *GameRoom {
	h.mu.Lock()
	defer h.mu.Unlock()

	if room, ok := h.rooms[roomID]; ok {
		return room
	}

	room := &GameRoom{
		ID:                  roomID,
		Clients:             make(map[*GameClient]bool),
		Spectators:          make(map[*GameClient]bool),
		MoveHistory:         []MoveEntry{},
		Status:              StatusWaiting,
		CurrentTurn:         1,
		DisconnectedPlayers: make(map[string]*DisconnectInfo),
		forfeitTimers:       make(map[string]*time.Timer),
	}
	h.rooms[roomID] = room
	return room
}

func (h *GameHub) RemoveRoom(roomID string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.rooms, roomID)
}
