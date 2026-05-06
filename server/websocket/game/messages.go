package game

import "encoding/json"

// 基础消息信封
type Message struct {
	Type string          `json:"type"`
	Data json.RawMessage `json:"data,omitempty"`
}

// ========== 客户端→服务端 ==========

type MoveData struct {
	Row int `json:"row"`
	Col int `json:"col"`
}

type UndoResponseData struct {
	Accept bool `json:"accept"`
}

type RestartResponseData struct {
	Accept bool `json:"accept"`
}

// ========== 服务端→客户端 ==========

type PlayerInfo struct {
	UserID string `json:"userId"`
	Ready  bool   `json:"ready"`
}

type RoomStateData struct {
	RoomID      string          `json:"roomId"`
	Board       [15][15]int     `json:"board"`
	Players     PlayersData     `json:"players"`
	Spectators  []SpectatorInfo `json:"spectators"`
	CurrentTurn int             `json:"currentTurn"`
	Status      string          `json:"status"`
	MoveHistory []MoveEntry     `json:"moveHistory"`
	Winner      int             `json:"winner"`
}

type PlayersData struct {
	Black *PlayerInfo `json:"black"`
	White *PlayerInfo `json:"white"`
}

type SpectatorInfo struct {
	UserID string `json:"userId"`
}

type MoveEntry struct {
	Row    int `json:"row"`
	Col    int `json:"col"`
	Player int `json:"player"`
}

type RoleAssignedData struct {
	Color string `json:"color"` // "black" | "white" | "spectator"
}

type UserJoinedData struct {
	UserID       string `json:"userId"`
	Role         string `json:"role"`
	PlayerCount  int    `json:"playerCount"`
	SpectatorCount int  `json:"spectatorCount"`
}

type UserLeftData struct {
	UserID       string `json:"userId"`
	PlayerCount  int    `json:"playerCount"`
	SpectatorCount int  `json:"spectatorCount"`
}

type ReadyChangedData struct {
	UserID string `json:"userId"`
	Ready  bool   `json:"ready"`
	Color  string `json:"color"`
}

type MoveMadeData struct {
	Row    int `json:"row"`
	Col    int `json:"col"`
	Player int `json:"player"`
}

type GameOverData struct {
	Winner      int      `json:"winner"`
	Reason      string   `json:"reason"`
	WinningLine [][]int  `json:"winningLine"`
}

type ErrorData struct {
	Message string `json:"message"`
}

type UndoRequestedData struct {
	From string `json:"from"`
}

type UndoResultData struct {
	Accepted    bool        `json:"accepted"`
	Board       [15][15]int `json:"board"`
	MoveHistory []MoveEntry `json:"moveHistory"`
	CurrentTurn int         `json:"currentTurn"`
}

type PlayerSurrenderedData struct {
	Player int `json:"player"`
}

type RestartRequestedData struct {
	From string `json:"from"`
}

type GameRestartData struct {
	RoomID      string          `json:"roomId"`
	Board       [15][15]int     `json:"board"`
	Players     PlayersData     `json:"players"`
	Spectators  []SpectatorInfo `json:"spectators"`
	CurrentTurn int             `json:"currentTurn"`
	Status      string          `json:"status"`
}

type OpponentDisconnectedData struct {
	UserID         string `json:"userId"`
	Color          string `json:"color"`
	GraceSeconds   int    `json:"graceSeconds"`
}

type OpponentReconnectedData struct {
	UserID string `json:"userId"`
	Color  string `json:"color"`
}

// buildMessage 将消息类型和数据序列化为 JSON 字节
func buildMessage(msgType string, data interface{}) ([]byte, error) {
	msg := Message{Type: msgType}
	if data != nil {
		raw, err := json.Marshal(data)
		if err != nil {
			return nil, err
		}
		msg.Data = raw
	}
	return json.Marshal(msg)
}
