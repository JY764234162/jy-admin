package mahjong

import "sync"

type MahjongHub struct {
	mu    sync.RWMutex
	rooms map[string]*MahjongRoom
}

func NewMahjongHub() *MahjongHub {
	return &MahjongHub{
		rooms: make(map[string]*MahjongRoom),
	}
}

func (h *MahjongHub) GetOrCreateRoom(roomID string) *MahjongRoom {
	h.mu.Lock()
	defer h.mu.Unlock()

	if room, ok := h.rooms[roomID]; ok {
		return room
	}
	room := NewMahjongRoom(roomID)
	h.rooms[roomID] = room
	return room
}

func (h *MahjongHub) RemoveRoom(roomID string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.rooms, roomID)
}
