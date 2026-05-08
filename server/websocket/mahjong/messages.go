package mahjong

import "encoding/json"

// 基础消息信封
type Message struct {
	Type string          `json:"type"`
	Data json.RawMessage `json:"data,omitempty"`
}

// ========== 客户端→服务端 ==========

type ReadyData struct{}

type DiscardData struct {
	Tile Tile `json:"tile"`
}

type PengData struct {
	Tile Tile `json:"tile"`
}

type GangData struct {
	Tile Tile `json:"tile"`
}

type HuData struct{}

type PassData struct{}

// ========== 服务端→客户端 ==========

type Tile struct {
	Suit  string `json:"suit"`  // "wan" | "tong" | "tiao" | "zi"
	Value int    `json:"value"` // 1-9
	ID    string `json:"id"`
}

type Meld struct {
	Type  string `json:"type"`  // "peng" | "gang" | "chi"
	Tiles []Tile `json:"tiles"`
	From  int    `json:"from"`  // 来源玩家座位号
}

type PlayerInfo struct {
	UserID      string `json:"userId"`
	Seat        int    `json:"seat"`
	HandCount   int    `json:"handCount"`
	DiscardPile []Tile `json:"discardPile"`
	Melds       []Meld `json:"melds"`
	Score       int    `json:"score"`
	Ready       bool   `json:"ready"`
	IsBot       bool   `json:"isBot"`
}

type RoomStateData struct {
	RoomID        string       `json:"roomId"`
	Players       []PlayerInfo `json:"players"`
	CurrentPlayer int          `json:"currentPlayer"`
	Dealer        int          `json:"dealer"`
	Status        string       `json:"status"` // waiting | playing | ended
	DiscardPile   []Tile       `json:"discardPile"`
	WallTiles     int          `json:"wallTiles"`
	Round         int          `json:"round"`
	Wind          string       `json:"wind"`
}

type RoleAssignedData struct {
	Seat int `json:"seat"`
}

type HandData struct {
	Tiles []Tile `json:"tiles"`
	Seat  int    `json:"seat"`
}

type YourDrawData struct {
	Tile   Tile `json:"tile"`
	Player int  `json:"player"`
}

type TileDrawnData struct {
	Player int `json:"player"`
}

type TileDiscardedData struct {
	Tile   Tile `json:"tile"`
	Player int  `json:"player"`
}

type PengResultData struct {
	Tile   Tile `json:"tile"`
	Player int  `json:"player"`
	Meld   Meld `json:"meld"`
}

type GangResultData struct {
	Tile   Tile `json:"tile"`
	Player int  `json:"player"`
	Meld   Meld `json:"meld"`
}

type HuResultData struct {
	Player int    `json:"player"`
	Tiles  []Tile `json:"tiles"`
	HuType string `json:"huType"`
	Score  int    `json:"score"`
}

type TurnChangedData struct {
	CurrentPlayer int `json:"currentPlayer"`
}

type GameOverData struct {
	Scores []int `json:"scores"`
}

type PlayerLeftData struct {
	Player int  `json:"player"`
	IsBot  bool `json:"isBot"`
}

type PlayerReconnectedData struct {
	Player int `json:"player"`
}

type ErrorData struct {
	Message string `json:"message"`
}

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
