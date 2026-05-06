package game

import (
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"
)

const (
	StatusWaiting = "waiting"
	StatusPlaying = "playing"
	StatusEnded   = "ended"
)

// ReconnectGracePeriod 断线后保留身份的时间窗口
const ReconnectGracePeriod = 30 * time.Second

// ForfeitGracePeriod 游戏进行中玩家断线后等待重连的时间，超时判负
const ForfeitGracePeriod = 10 * time.Second

// DisconnectInfo 断线玩家的身份快照，用于在宽限期内恢复
type DisconnectInfo struct {
	UserID string
	Color  string
	Ready  bool
	LeftAt time.Time
}

// GameRoom 游戏房间，持有棋盘状态和玩家信息
type GameRoom struct {
	ID      string
	mu      sync.RWMutex
	Clients map[*GameClient]bool

	// 棋盘状态
	Board       [15][15]int // 0=空, 1=黑, 2=白
	CurrentTurn int         // 1=黑, 2=白
	Status      string      // waiting | playing | ended
	Winner      int         // 0=无, 1=黑, 2=白
	WinningLine [][]int
	MoveHistory []MoveEntry

	// 玩家
	BlackPlayer *GameClient
	WhitePlayer *GameClient
	Spectators  map[*GameClient]bool

	// 顺序分配的显示编号
	NextUserNum int

	// 断线玩家快照（按 clientId 索引）
	DisconnectedPlayers map[string]*DisconnectInfo

	// 弃权计时器（按 clientId 索引），用于游戏中玩家断线后等待重连
	forfeitTimers map[string]*time.Timer

	// 待处理的请求
	PendingUndoRequestFrom    *GameClient // 谁发起的悔棋请求
	PendingRestartRequestFrom *GameClient // 谁发起的重开请求
}

// GameClient 游戏客户端
type GameClient struct {
	hub      *GameHub
	room     *GameRoom
	send     chan []byte
	UserID   string
	ClientID string // 浏览器 sessionStorage 生成的稳定标识，用于刷新重连
	Ready    bool
	Color    string // "black" | "white" | "spectator"
}

// AssignRole 分配角色：前两人为黑/白，之后为观战者；同时分配顺序显示名
// 若客户端 ClientID 在断线宽限期内能匹配到快照，则恢复原身份和槽位
func (r *GameRoom) AssignRole(client *GameClient) string {
	r.mu.Lock()
	defer r.mu.Unlock()

	// 优先尝试根据 ClientID 恢复断线身份
	if client.ClientID != "" {
		if info, ok := r.DisconnectedPlayers[client.ClientID]; ok {
			if time.Since(info.LeftAt) < ReconnectGracePeriod {
				restored := false
				if info.Color == "black" && r.BlackPlayer == nil {
					client.UserID = info.UserID
					client.Color = "black"
					client.Ready = info.Ready
					r.BlackPlayer = client
					r.Clients[client] = true
					restored = true
				} else if info.Color == "white" && r.WhitePlayer == nil {
					client.UserID = info.UserID
					client.Color = "white"
					client.Ready = info.Ready
					r.WhitePlayer = client
					r.Clients[client] = true
					restored = true
				} else if info.Color == "spectator" {
					client.UserID = info.UserID
					client.Color = "spectator"
					r.Spectators[client] = true
					r.Clients[client] = true
					restored = true
				}
				if restored {
					// 取消可能存在的弃权计时器
					if timer, hasTimer := r.forfeitTimers[client.ClientID]; hasTimer {
						timer.Stop()
						delete(r.forfeitTimers, client.ClientID)
						// 通知其他玩家：对手已重连
						if client.Color == "black" || client.Color == "white" {
							msg, _ := buildMessage("opponent_reconnected", OpponentReconnectedData{
								UserID: client.UserID,
								Color:  client.Color,
							})
							r.broadcastAll(msg)
						}
					}
					delete(r.DisconnectedPlayers, client.ClientID)
					return client.Color
				}
			}
			// 过期或槽位被占的快照清掉
			delete(r.DisconnectedPlayers, client.ClientID)
		}
	}

	// 检查槽位是否被宽限期内的断线玩家保留
	blackReserved := false
	whiteReserved := false
	for cid, info := range r.DisconnectedPlayers {
		if _, hasTimer := r.forfeitTimers[cid]; hasTimer {
			if info.Color == "black" {
				blackReserved = true
			} else if info.Color == "white" {
				whiteReserved = true
			}
		}
	}

	r.NextUserNum++
	client.UserID = fmt.Sprintf("用户%d", r.NextUserNum)

	if r.BlackPlayer == nil && !blackReserved {
		r.BlackPlayer = client
		client.Color = "black"
	} else if r.WhitePlayer == nil && !whiteReserved {
		r.WhitePlayer = client
		client.Color = "white"
	} else {
		r.Spectators[client] = true
		client.Color = "spectator"
	}
	r.Clients[client] = true

	return client.Color
}

// RemoveClient 移除客户端
func (r *GameRoom) RemoveClient(client *GameClient) {
	r.mu.Lock()
	defer r.mu.Unlock()

	delete(r.Clients, client)
	delete(r.Spectators, client)

	wasPlayer := false
	var leaverColor int
	if r.BlackPlayer == client {
		r.BlackPlayer = nil
		wasPlayer = true
		leaverColor = 1
	} else if r.WhitePlayer == client {
		r.WhitePlayer = nil
		wasPlayer = true
		leaverColor = 2
	}
	close(client.send)

	// 为本次断线保存身份快照，用于宽限期内重连恢复
	if client.ClientID != "" && client.UserID != "" {
		r.DisconnectedPlayers[client.ClientID] = &DisconnectInfo{
			UserID: client.UserID,
			Color:  client.Color,
			Ready:  client.Ready,
			LeftAt: time.Now(),
		}
	}

	// 游戏进行中玩家离开
	if wasPlayer && r.Status == StatusPlaying {
		if client.ClientID != "" {
			// 有 ClientID：启动弃权计时器，等待重连
			leaverID := client.UserID
			leaverColorStr := client.Color
			cid := client.ClientID
			msg, _ := buildMessage("opponent_disconnected", OpponentDisconnectedData{
				UserID:       leaverID,
				Color:        leaverColorStr,
				GraceSeconds: int(ForfeitGracePeriod / time.Second),
			})
			r.broadcastAll(msg)
			timer := time.AfterFunc(ForfeitGracePeriod, func() {
				r.handleForfeit(cid)
			})
			r.forfeitTimers[cid] = timer
		} else {
			// 无 ClientID：立即判负（旧客户端兼容）
			var winner int
			if leaverColor == 1 {
				winner = 2
			} else {
				winner = 1
			}
			r.Status = StatusEnded
			r.Winner = winner
			msg, _ := buildMessage("game_over", GameOverData{
				Winner: winner,
				Reason: "opponent_left",
			})
			r.broadcastAll(msg)
		}
	}

	// 玩家全部离开 → 重置房间到 waiting 状态，便于下次开局
	if r.BlackPlayer == nil && r.WhitePlayer == nil {
		// 取消所有未触发的弃权计时器
		for cid, timer := range r.forfeitTimers {
			timer.Stop()
			delete(r.forfeitTimers, cid)
		}
		r.Board = [15][15]int{}
		r.CurrentTurn = 1
		r.Status = StatusWaiting
		r.Winner = 0
		r.WinningLine = nil
		r.MoveHistory = nil
		r.PendingUndoRequestFrom = nil
		r.PendingRestartRequestFrom = nil
		r.NextUserNum = 0
		// 房间重置时清空所有断线快照，避免身份串号
		r.DisconnectedPlayers = make(map[string]*DisconnectInfo)
		// 观战者也清空准备状态
		for spec := range r.Spectators {
			spec.Ready = false
		}
	}
}

// handleForfeit 弃权计时器到期触发，未重连的玩家判负
func (r *GameRoom) handleForfeit(clientID string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	info, exists := r.DisconnectedPlayers[clientID]
	if !exists {
		// 已经重连了
		return
	}
	delete(r.forfeitTimers, clientID)

	if r.Status != StatusPlaying {
		// 游戏已经不在进行中
		delete(r.DisconnectedPlayers, clientID)
		return
	}

	var winner int
	switch info.Color {
	case "black":
		winner = 2
	case "white":
		winner = 1
	default:
		delete(r.DisconnectedPlayers, clientID)
		return
	}

	r.Status = StatusEnded
	r.Winner = winner
	msg, _ := buildMessage("game_over", GameOverData{
		Winner: winner,
		Reason: "opponent_left",
	})
	r.broadcastAll(msg)

	delete(r.DisconnectedPlayers, clientID)
}

// PlayerCount 返回玩家数量（不含观战者）
func (r *GameRoom) PlayerCount() int {
	count := 0
	if r.BlackPlayer != nil {
		count++
	}
	if r.WhitePlayer != nil {
		count++
	}
	return count
}

// HandleReady 处理准备/取消准备
func (r *GameRoom) HandleReady(client *GameClient, ready bool) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if client.Color == "spectator" {
		return
	}

	client.Ready = ready
	msg, _ := buildMessage("ready_changed", ReadyChangedData{
		UserID: client.UserID,
		Ready:  ready,
		Color:  client.Color,
	})
	r.broadcastAll(msg)

	// 检查是否双方都准备好了
	if r.BlackPlayer != nil && r.WhitePlayer != nil &&
		r.BlackPlayer.Ready && r.WhitePlayer.Ready &&
		r.Status == StatusWaiting {
		r.Status = StatusPlaying
		r.CurrentTurn = 1
		msg, _ = buildMessage("game_start", map[string]int{"currentTurn": 1})
		r.broadcastAll(msg)
	}
}

// HandleMove 处理落子
func (r *GameRoom) HandleMove(client *GameClient, row, col int) {
	r.mu.Lock()
	defer r.mu.Unlock()

	// 验证
	if r.Status != StatusPlaying {
		r.sendError(client, "游戏未在进行中")
		return
	}
	if client.Color != "black" && client.Color != "white" {
		r.sendError(client, "观战者不能落子")
		return
	}
	expectedColor := ""
	if r.CurrentTurn == 1 {
		expectedColor = "black"
	} else {
		expectedColor = "white"
	}
	if client.Color != expectedColor {
		r.sendError(client, "不是你的回合")
		return
	}
	if row < 0 || row >= 15 || col < 0 || col >= 15 {
		r.sendError(client, "位置越界")
		return
	}
	if r.Board[row][col] != 0 {
		r.sendError(client, "该位置已有棋子")
		return
	}

	// 落子
	player := r.CurrentTurn
	r.Board[row][col] = player
	r.MoveHistory = append(r.MoveHistory, MoveEntry{Row: row, Col: col, Player: player})

	// 切换回合
	if r.CurrentTurn == 1 {
		r.CurrentTurn = 2
	} else {
		r.CurrentTurn = 1
	}

	// 广播落子
	msg, _ := buildMessage("move_made", MoveMadeData{Row: row, Col: col, Player: player})
	r.broadcastAll(msg)

	// 检查胜负
	if won, line := r.checkWin(row, col, player); won {
		r.Status = StatusEnded
		r.Winner = player
		r.WinningLine = line
		msg, _ = buildMessage("game_over", GameOverData{
			Winner:      player,
			Reason:      "five_in_row",
			WinningLine: line,
		})
		r.broadcastAll(msg)
	}

	// 检查平局（棋盘满了）
	if r.Status == StatusPlaying && len(r.MoveHistory) == 15*15 {
		r.Status = StatusEnded
		msg, _ = buildMessage("game_over", GameOverData{
			Winner: 0,
			Reason: "draw",
		})
		r.broadcastAll(msg)
	}
}

// checkWin 检查五连
func (r *GameRoom) checkWin(row, col, player int) (bool, [][]int) {
	directions := [4][2]int{{0, 1}, {1, 0}, {1, 1}, {1, -1}}

	for _, dir := range directions {
		count := 1
		line := [][]int{{row, col}}

		// 正方向
		for i := 1; i < 5; i++ {
			nr, nc := row+dir[0]*i, col+dir[1]*i
			if nr < 0 || nr >= 15 || nc < 0 || nc >= 15 || r.Board[nr][nc] != player {
				break
			}
			count++
			line = append(line, []int{nr, nc})
		}
		// 反方向
		for i := 1; i < 5; i++ {
			nr, nc := row-dir[0]*i, col-dir[1]*i
			if nr < 0 || nr >= 15 || nc < 0 || nc >= 15 || r.Board[nr][nc] != player {
				break
			}
			count++
			line = append(line, []int{nr, nc})
		}

		if count >= 5 {
			return true, line
		}
	}
	return false, nil
}

// HandleUndoRequest 处理悔棋请求
func (r *GameRoom) HandleUndoRequest(client *GameClient) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.Status != StatusPlaying {
		r.sendError(client, "游戏未在进行中")
		return
	}
	if len(r.MoveHistory) == 0 {
		r.sendError(client, "没有可以悔的棋")
		return
	}
	if client.Color != "black" && client.Color != "white" {
		return
	}

	r.PendingUndoRequestFrom = client

	// 发给对手
	opponent := r.getOpponent(client)
	if opponent != nil {
		msg, _ := buildMessage("undo_requested", UndoRequestedData{From: client.UserID})
		r.sendToClient(opponent, msg)
	}
}

// HandleUndoResponse 处理悔棋响应
func (r *GameRoom) HandleUndoResponse(client *GameClient, accept bool) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.PendingUndoRequestFrom == nil {
		return
	}

	if accept && len(r.MoveHistory) > 0 {
		// 撤销最后一步
		lastMove := r.MoveHistory[len(r.MoveHistory)-1]
		r.MoveHistory = r.MoveHistory[:len(r.MoveHistory)-1]
		r.Board[lastMove.Row][lastMove.Col] = 0
		r.CurrentTurn = lastMove.Player
	}

	r.PendingUndoRequestFrom = nil

	msg, _ := buildMessage("undo_result", UndoResultData{
		Accepted:    accept,
		Board:       r.Board,
		MoveHistory: r.MoveHistory,
		CurrentTurn: r.CurrentTurn,
	})
	r.broadcastAll(msg)
}

// HandleSurrender 处理认输
func (r *GameRoom) HandleSurrender(client *GameClient) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.Status != StatusPlaying {
		return
	}
	if client.Color != "black" && client.Color != "white" {
		return
	}

	var winner int
	if client.Color == "black" {
		winner = 2
	} else {
		winner = 1
	}
	r.Status = StatusEnded
	r.Winner = winner

	msg, _ := buildMessage("player_surrendered", PlayerSurrenderedData{Player: winner})
	r.broadcastAll(msg)

	msg, _ = buildMessage("game_over", GameOverData{
		Winner: winner,
		Reason: "surrender",
	})
	r.broadcastAll(msg)
}

// HandleRestartRequest 处理重新开始请求
func (r *GameRoom) HandleRestartRequest(client *GameClient) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.Status != StatusEnded {
		r.sendError(client, "游戏未结束，无法重新开始")
		return
	}
	if client.Color != "black" && client.Color != "white" {
		return
	}

	r.PendingRestartRequestFrom = client

	opponent := r.getOpponent(client)
	if opponent != nil {
		msg, _ := buildMessage("restart_requested", RestartRequestedData{From: client.UserID})
		r.sendToClient(opponent, msg)
	}
}

// HandleRestartResponse 处理重新开始响应
func (r *GameRoom) HandleRestartResponse(client *GameClient, accept bool) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.PendingRestartRequestFrom == nil {
		return
	}

	r.PendingRestartRequestFrom = nil

	if !accept {
		return
	}

	// 重置棋盘
	r.Board = [15][15]int{}
	r.CurrentTurn = 1
	r.Status = StatusWaiting
	r.Winner = 0
	r.WinningLine = nil
	r.MoveHistory = nil
	if r.BlackPlayer != nil {
		r.BlackPlayer.Ready = false
	}
	if r.WhitePlayer != nil {
		r.WhitePlayer.Ready = false
	}

	msg, _ := buildMessage("game_restart", GameRestartData{
		RoomID:      r.ID,
		Board:       r.Board,
		CurrentTurn: 1,
		Status:      StatusWaiting,
		Players:     r.buildPlayersData(),
	})
	r.broadcastAll(msg)
}

// BuildRoomState 构建完整房间状态
func (r *GameRoom) BuildRoomState() []byte {
	r.mu.RLock()
	defer r.mu.RUnlock()

	data := RoomStateData{
		RoomID:      r.ID,
		Board:       r.Board,
		CurrentTurn: r.CurrentTurn,
		Status:      r.Status,
		MoveHistory: r.MoveHistory,
		Winner:      r.Winner,
		Players:     r.buildPlayersData(),
	}
	msg, err := buildMessage("room_state", data)
	if err != nil {
		return nil
	}
	return msg
}

func (r *GameRoom) buildPlayersData() PlayersData {
	var black, white *PlayerInfo
	if r.BlackPlayer != nil {
		black = &PlayerInfo{UserID: r.BlackPlayer.UserID, Ready: r.BlackPlayer.Ready}
	}
	if r.WhitePlayer != nil {
		white = &PlayerInfo{UserID: r.WhitePlayer.UserID, Ready: r.WhitePlayer.Ready}
	}
	return PlayersData{Black: black, White: white}
}

func (r *GameRoom) getOpponent(client *GameClient) *GameClient {
	if client.Color == "black" && r.WhitePlayer != nil {
		return r.WhitePlayer
	}
	if client.Color == "white" && r.BlackPlayer != nil {
		return r.BlackPlayer
	}
	return nil
}

func (r *GameRoom) broadcastAll(message []byte) {
	for client := range r.Clients {
		select {
		case client.send <- message:
		default:
			log.Printf("[GameRoom] client %s send buffer full, dropping", client.UserID)
		}
	}
}

func (r *GameRoom) sendToClient(client *GameClient, message []byte) {
	select {
	case client.send <- message:
	default:
		log.Printf("[GameRoom] client %s send buffer full, dropping", client.UserID)
	}
}

func (r *GameRoom) sendError(client *GameClient, message string) {
	msg, _ := buildMessage("error", ErrorData{Message: message})
	r.sendToClient(client, msg)
}

// HandleMessage 分发客户端消息
func (r *GameRoom) HandleMessage(client *GameClient, raw []byte) {
	var msg Message
	if err := json.Unmarshal(raw, &msg); err != nil {
		log.Printf("[GameRoom] invalid message: %v", err)
		return
	}

	switch msg.Type {
	case "ready":
		r.HandleReady(client, true)
	case "unready":
		r.HandleReady(client, false)
	case "move":
		var data MoveData
		if err := json.Unmarshal(msg.Data, &data); err != nil {
			return
		}
		r.HandleMove(client, data.Row, data.Col)
	case "undo_request":
		r.HandleUndoRequest(client)
	case "undo_response":
		var data UndoResponseData
		if err := json.Unmarshal(msg.Data, &data); err != nil {
			return
		}
		r.HandleUndoResponse(client, data.Accept)
	case "surrender":
		r.HandleSurrender(client)
	case "restart_request":
		r.HandleRestartRequest(client)
	case "restart_response":
		var data RestartResponseData
		if err := json.Unmarshal(msg.Data, &data); err != nil {
			return
		}
		r.HandleRestartResponse(client, data.Accept)
	}
}
