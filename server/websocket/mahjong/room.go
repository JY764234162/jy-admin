package mahjong

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"strings"
	"sync"
	"time"
)

const (
	StatusWaiting = "waiting"
	StatusPlaying = "playing"
	StatusEnded   = "ended"
)

// MahjongPlayer 表示房间内的玩家
type MahjongPlayer struct {
	Client      *MahjongClient
	ClientID    string // 独立保存，断线后仍能识别重连
	UserID      string
	Hand        []Tile
	DiscardPile []Tile
	Melds       []Meld
	Score       int
	Ready       bool
	IsBot       bool
}

// MahjongRoom 麻将房间
type MahjongRoom struct {
	ID            string
	Players       [4]*MahjongPlayer // 固定4个座位
	Clients       map[*MahjongClient]bool
	Wall          []Tile            // 牌墙
	DiscardPile   []Tile            // 弃牌堆
	CurrentPlayer int               // 当前操作玩家
	Dealer        int               // 庄家
	Status        string
	Round         int
	Wind          string
	LastDiscarded *Tile             // 最后打出的牌
	PendingAction string            // 等待的动作: peng/gang/hu/none
	forfeitTimers map[string]*time.Timer // 掉线弃权计时器: clientID -> timer
	mu            sync.RWMutex
}

func NewMahjongRoom(id string) *MahjongRoom {
	return &MahjongRoom{
		ID:            id,
		Clients:       make(map[*MahjongClient]bool),
		forfeitTimers: make(map[string]*time.Timer),
		Status:        StatusWaiting,
		Wind:          "东",
		Round:         1,
		DiscardPile:   []Tile{},
	}
}

func (r *MahjongRoom) nextActivePlayer(from int) int {
	for i := 1; i <= 4; i++ {
		seat := (from + i) % 4
		if r.Players[seat] != nil {
			return seat
		}
	}
	return -1
}

// ========== 牌墙管理 ==========

func createDeck() []Tile {
	var deck []Tile
	suits := []string{"wan", "tong", "tiao"}
	for _, suit := range suits {
		for v := 1; v <= 9; v++ {
			for i := 0; i < 4; i++ {
				deck = append(deck, Tile{Suit: suit, Value: v, ID: fmt.Sprintf("%s-%d-%d", suit, v, i)})
			}
		}
	}
	// 字牌: 东南西北(1-4) 中发白(5-7)
	ziNames := []string{"东", "南", "西", "北", "中", "发", "白"}
	for v := 1; v <= 7; v++ {
		for i := 0; i < 4; i++ {
			deck = append(deck, Tile{Suit: "zi", Value: v, ID: fmt.Sprintf("zi-%d-%d-%s", v, i, ziNames[v-1])})
		}
	}
	rand.Seed(time.Now().UnixNano())
	rand.Shuffle(len(deck), func(i, j int) { deck[i], deck[j] = deck[j], deck[i] })
	return deck
}

// ========== 座位分配 ==========

func (r *MahjongRoom) AssignSeat(client *MahjongClient) int {
	r.mu.Lock()
	defer r.mu.Unlock()

	// 检查是否断线重连（不依赖 p.Client，因为 RemoveClient 会将其置为 nil）
	for i, p := range r.Players {
		if p != nil && p.ClientID == client.ClientID {
			p.Client = client
			p.IsBot = false
			client.Seat = i
			r.Clients[client] = true

			// 取消弃权计时器
			if timer, ok := r.forfeitTimers[client.ClientID]; ok {
				timer.Stop()
				delete(r.forfeitTimers, client.ClientID)
			}

			msg, _ := buildMessage("player_reconnected", PlayerReconnectedData{Player: i})
			r.broadcastAll(msg)
			return i
		}
	}

	for i := range r.Players {
		if r.Players[i] == nil {
			r.Players[i] = &MahjongPlayer{
				Client:      client,
				ClientID:    client.ClientID,
				UserID:      client.UserID,
				Hand:        []Tile{},
				DiscardPile: []Tile{},
				Melds:       []Meld{},
				Score:       0,
				Ready:       false,
				IsBot:       false,
			}
			client.Seat = i
			r.Clients[client] = true
			return i
		}
	}
	return -1
}

func (r *MahjongRoom) RemoveClient(client *MahjongClient) {
	r.mu.Lock()
	defer r.mu.Unlock()

	delete(r.Clients, client)

	if client.Seat >= 0 && client.Seat < 4 && r.Players[client.Seat] != nil {
		if r.Status == StatusPlaying {
			// 游戏中断线 → 先置 Client 为 nil，启动 10s 弃权计时器
			r.Players[client.Seat].Client = nil

			cid := client.ClientID
			seat := client.Seat
			if oldTimer, ok := r.forfeitTimers[cid]; ok {
				oldTimer.Stop()
			}

			r.forfeitTimers[cid] = time.AfterFunc(10*time.Second, func() {
				r.mu.Lock()
				defer r.mu.Unlock()

				delete(r.forfeitTimers, cid)

				if r.Players[seat] == nil || r.Players[seat].Client != nil {
					// 已经重连或已离开
					return
				}

				r.Players[seat].IsBot = true
				msg, _ := buildMessage("player_left", PlayerLeftData{Player: seat, IsBot: true})
				r.broadcastAll(msg)

				// 如果当前轮到该玩家，触发自动打牌
				if r.CurrentPlayer == seat && r.Status == StatusPlaying {
					go r.botPlay(seat)
				}
			})
		} else {
			r.Players[client.Seat] = nil
		}
	}
}

// ========== 游戏流程 ==========

func (r *MahjongRoom) StartGame() {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.Wall = createDeck()
	r.DiscardPile = []Tile{}
	r.LastDiscarded = nil
	r.Status = StatusPlaying

	// 发牌: 庄家14张，其余13张
	for i := 0; i < 4; i++ {
		if r.Players[i] == nil {
			continue
		}
		r.Players[i].Hand = []Tile{}
		r.Players[i].DiscardPile = []Tile{}
		r.Players[i].Melds = []Meld{}
		count := 13
		if i == r.Dealer {
			count = 14
		}
		r.Players[i].Hand = append([]Tile{}, r.Wall[:count]...)
		r.Wall = r.Wall[count:]
	}

	r.CurrentPlayer = r.Dealer

	// 给每个玩家发送完整手牌
	for i := 0; i < 4; i++ {
		if r.Players[i] == nil {
			continue
		}
		handMsg, _ := buildMessage("hand", HandData{Tiles: r.Players[i].Hand, Seat: i})
		r.sendToSeat(i, handMsg)
	}

	r.broadcastState()

	// 庄家是 bot，直接打牌（庄家已有14张，不需要摸牌）
	if r.Players[r.Dealer] != nil && r.Players[r.Dealer].IsBot {
		go func() {
			time.Sleep(1 * time.Second)
			r.mu.Lock()
			defer r.mu.Unlock()
			if r.Players[r.Dealer] != nil && r.Players[r.Dealer].IsBot {
				r.botDiscard(r.Dealer)
			}
		}()
	}
}

func (r *MahjongRoom) DrawTile(player int) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if len(r.Wall) == 0 {
		// 牌墙空了，流局
		r.Status = StatusEnded
		r.broadcastState()
		return
	}

	tile := r.Wall[0]
	r.Wall = r.Wall[1:]
	if r.Players[player] != nil {
		r.Players[player].Hand = append(r.Players[player].Hand, tile)
	}

	// 只给摸牌玩家发牌面
	yourDrawMsg, _ := buildMessage("your_draw", YourDrawData{Tile: tile, Player: player})
	r.sendToSeat(player, yourDrawMsg)

	// 广播有人摸牌（不暴露牌面）
	msg, _ := buildMessage("tile_drawn", TileDrawnData{Player: player})
	r.broadcastAll(msg)
	r.broadcastState()
}

func (r *MahjongRoom) doDiscard(player int, tile Tile) {
	if r.Players[player] == nil {
		return
	}
	// 从手牌移除
	for i, t := range r.Players[player].Hand {
		if t.ID == tile.ID {
			r.Players[player].Hand = append(r.Players[player].Hand[:i], r.Players[player].Hand[i+1:]...)
			break
		}
	}
	r.Players[player].DiscardPile = append(r.Players[player].DiscardPile, tile)
	r.DiscardPile = append(r.DiscardPile, tile)
	r.LastDiscarded = &tile

	msg, _ := buildMessage("tile_discarded", TileDiscardedData{Tile: tile, Player: player})
	r.broadcastAll(msg)

	// 检查其他玩家是否可以碰/杠/胡
	hasAction := false
	for i := 0; i < 4; i++ {
		if i == player || r.Players[i] == nil {
			continue
		}
		if r.canPeng(i, tile) || r.canGang(i, tile) || r.canHu(i, nil, &tile) {
			hasAction = true
			// 给玩家发送可行动作提示（简化版直接让他们可以请求）
		}
	}

	if !hasAction {
		// 无人可响应，轮到下一个活跃玩家摸牌
		r.LastDiscarded = nil
		next := r.nextActivePlayer(player)
		if next >= 0 {
			r.CurrentPlayer = next
			r.broadcastState()
			if r.Players[next] != nil && r.Players[next].IsBot {
				go r.botPlay(next)
			}
		}
	} else {
		// 有人能响应，延迟后让 bot 自动按优先级响应（胡>杠>碰），否则自动 pass
		go func(discardedTile Tile) {
			time.Sleep(2 * time.Second)
			r.mu.Lock()
			defer r.mu.Unlock()

			if r.LastDiscarded == nil || r.LastDiscarded.ID != discardedTile.ID {
				return // 已经有人手动响应了
			}

			// 胡优先级最高
			for i := 0; i < 4; i++ {
				if i == player || r.Players[i] == nil || !r.Players[i].IsBot {
					continue
				}
				if r.canHu(i, nil, r.LastDiscarded) {
					r.doHu(i, r.LastDiscarded)
					return
				}
			}
			// 杠
			for i := 0; i < 4; i++ {
				if i == player || r.Players[i] == nil || !r.Players[i].IsBot {
					continue
				}
				if r.canGang(i, *r.LastDiscarded) {
					r.doGang(i, *r.LastDiscarded)
					return
				}
			}
			// 碰
			for i := 0; i < 4; i++ {
				if i == player || r.Players[i] == nil || !r.Players[i].IsBot {
					continue
				}
				if r.canPeng(i, *r.LastDiscarded) {
					r.doPeng(i, *r.LastDiscarded)
					return
				}
			}

			// 没有 bot 能响应，所有人自动 pass
			r.LastDiscarded = nil
			next := r.nextActivePlayer(r.CurrentPlayer)
			if next >= 0 {
				r.CurrentPlayer = next
				r.broadcastState()
				if r.Players[next] != nil && r.Players[next].IsBot {
					go r.botPlay(next)
				}
			}
		}(*r.LastDiscarded)
	}
}

// ========== Bot 自动打牌 ==========

// botPlay 处理 bot 的完整回合：摸牌 → 检查自摸 → 打牌
func (r *MahjongRoom) botPlay(seat int) {
	time.Sleep(1 * time.Second)
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.Players[seat] == nil || !r.Players[seat].IsBot || r.Status != StatusPlaying || r.CurrentPlayer != seat {
		return
	}

	// 摸牌
	if len(r.Wall) == 0 {
		r.Status = StatusEnded
		r.broadcastState()
		return
	}

	drawn := r.Wall[0]
	r.Wall = r.Wall[1:]
	r.Players[seat].Hand = append(r.Players[seat].Hand, drawn)

	yourDrawMsg, _ := buildMessage("your_draw", YourDrawData{Tile: drawn, Player: seat})
	r.sendToSeat(seat, yourDrawMsg)

	tileDrawnMsg, _ := buildMessage("tile_drawn", TileDrawnData{Player: seat})
	r.broadcastAll(tileDrawnMsg)
	r.broadcastState()

	// 检查自摸胡
	if r.canHu(seat, &drawn, nil) {
		r.doHu(seat, nil)
		return
	}

	// 自动打牌
	r.botDiscard(seat)
}

// botDiscard bot 自动打出手牌最后一张
func (r *MahjongRoom) botDiscard(seat int) {
	if r.Players[seat] == nil || len(r.Players[seat].Hand) == 0 {
		return
	}
	discard := r.Players[seat].Hand[len(r.Players[seat].Hand)-1]
	r.doDiscard(seat, discard)
}

// ========== 碰/杠/胡判断 ==========

func (r *MahjongRoom) canPeng(player int, tile Tile) bool {
	if r.Players[player] == nil {
		return false
	}
	count := 0
	for _, t := range r.Players[player].Hand {
		if sameTile(t, tile) {
			count++
		}
	}
	return count >= 2
}

func (r *MahjongRoom) canGang(player int, tile Tile) bool {
	if r.Players[player] == nil {
		return false
	}
	count := 0
	for _, t := range r.Players[player].Hand {
		if sameTile(t, tile) {
			count++
		}
	}
	return count >= 3
}

func (r *MahjongRoom) canHu(player int, drawnTile *Tile, discardedTile *Tile) bool {
	if r.Players[player] == nil {
		return false
	}
	// 简化版胡牌判断
	tiles := make([]Tile, len(r.Players[player].Hand))
	copy(tiles, r.Players[player].Hand)
	if discardedTile != nil {
		tiles = append(tiles, *discardedTile)
	}
	return isWinningHand(tiles)
}

func sameTile(a, b Tile) bool {
	return a.Suit == b.Suit && a.Value == b.Value
}

// isWinningHand 判断是否为胡牌（简化版）
func isWinningHand(tiles []Tile) bool {
	if len(tiles) != 14 && len(tiles) != 11 && len(tiles) != 8 && len(tiles) != 5 && len(tiles) != 2 {
		// 标准胡牌手牌数: 14(正常), 11(碰1组), 8(碰2组), 5(碰3组), 2(碰4组+将)
		// 简化：只判断14张是否能胡
		if len(tiles) != 14 {
			return false
		}
	}

	// 统计各牌数量
	counts := make(map[string]int)
	for _, t := range tiles {
		key := fmt.Sprintf("%s-%d", t.Suit, t.Value)
		counts[key]++
	}

	// 尝试每种牌作为将
	keys := make([]string, 0, len(counts))
	for k := range counts {
		keys = append(keys, k)
	}

	for _, pairKey := range keys {
		if counts[pairKey] < 2 {
			continue
		}
		testCounts := make(map[string]int)
		for k, v := range counts {
			testCounts[k] = v
		}
		testCounts[pairKey] -= 2

		if canFormGroups(testCounts) {
			return true
		}
	}
	return false
}

func canFormGroups(counts map[string]int) bool {
	// 递归检查是否能组成刻子或顺子
	// 先找数量>0的牌
	var key string
	for k, v := range counts {
		if v > 0 {
			key = k
			break
		}
	}
	if key == "" {
		return true // 所有牌都处理完了
	}

	parts := strings.Split(key, "-")
	if len(parts) != 2 {
		return false
	}
	suit := parts[0]
	value := 0
	fmt.Sscanf(parts[1], "%d", &value)

	// 尝试刻子
	if counts[key] >= 3 {
		counts[key] -= 3
		if canFormGroups(counts) {
			return true
		}
		counts[key] += 3
	}

	// 尝试顺子（只能是万/筒/条）
	if suit != "zi" && value <= 7 {
		k1 := fmt.Sprintf("%s-%d", suit, value+1)
		k2 := fmt.Sprintf("%s-%d", suit, value+2)
		if counts[k1] > 0 && counts[k2] > 0 {
			counts[key]--
			counts[k1]--
			counts[k2]--
			if canFormGroups(counts) {
				return true
			}
			counts[key]++
			counts[k1]++
			counts[k2]++
		}
	}

	return false
}

// ========== 消息处理 ==========

func (r *MahjongRoom) HandleMessage(client *MahjongClient, raw []byte) {
	r.mu.Lock()
	defer r.mu.Unlock()

	var msg Message
	if err := json.Unmarshal(raw, &msg); err != nil {
		return
	}

	seat := client.Seat
	if seat < 0 || seat >= 4 || r.Players[seat] == nil {
		return
	}

	switch msg.Type {
	case "ready":
		r.Players[seat].Ready = true
		r.broadcastState()
		// 检查是否4人都准备了
		allReady := true
		playerCount := 0
		for _, p := range r.Players {
			if p != nil {
				playerCount++
				if !p.Ready {
					allReady = false
				}
			}
		}
		if allReady && playerCount >= 2 {
			go r.StartGame()
		}

	case "discard":
		if r.Status != StatusPlaying || r.CurrentPlayer != seat {
			return
		}
		var data DiscardData
		json.Unmarshal(msg.Data, &data)
		r.doDiscard(seat, data.Tile)

	case "peng":
		if r.LastDiscarded == nil {
			return
		}
		var data PengData
		json.Unmarshal(msg.Data, &data)
		if !r.canPeng(seat, data.Tile) {
			return
		}
		// 执行碰
		r.doPeng(seat, data.Tile)

	case "gang":
		if r.LastDiscarded == nil {
			return
		}
		var data GangData
		json.Unmarshal(msg.Data, &data)
		if !r.canGang(seat, data.Tile) {
			return
		}
		// 执行杠
		r.doGang(seat, data.Tile)

	case "hu":
		if r.LastDiscarded == nil && seat != r.CurrentPlayer {
			return
		}
		var discarded *Tile
		if r.LastDiscarded != nil {
			discarded = r.LastDiscarded
		}
		if r.canHu(seat, nil, discarded) {
			r.doHu(seat, discarded)
		}

		case "pass":
			// 过，轮到下一个活跃玩家
			r.LastDiscarded = nil
			next := r.nextActivePlayer(r.CurrentPlayer)
			if next >= 0 {
				r.CurrentPlayer = next
				r.broadcastState()
				if r.Players[next] != nil && r.Players[next].IsBot {
					go r.botPlay(next)
				}
			}
		}
	}

func (r *MahjongRoom) doPeng(player int, tile Tile) {
	removed := 0
	newHand := r.Players[player].Hand[:0]
	for _, t := range r.Players[player].Hand {
		if removed < 2 && sameTile(t, tile) {
			removed++
			continue
		}
		newHand = append(newHand, t)
	}
	r.Players[player].Hand = newHand
	r.Players[player].Melds = append(r.Players[player].Melds, Meld{
		Type:  "peng",
		Tiles: []Tile{tile, tile, tile},
		From:  r.CurrentPlayer,
	})

	msg, _ := buildMessage("peng", PengResultData{Tile: tile, Player: player, Meld: r.Players[player].Melds[len(r.Players[player].Melds)-1]})
	r.broadcastAll(msg)

	// 碰后由该玩家打牌
	r.LastDiscarded = nil
	r.CurrentPlayer = player
	r.broadcastState()

	if r.Players[player] != nil && r.Players[player].IsBot {
		go func() {
			time.Sleep(1 * time.Second)
			r.mu.Lock()
			defer r.mu.Unlock()
			if r.Players[player] != nil && r.Players[player].IsBot {
				r.botDiscard(player)
			}
		}()
	}
}

func (r *MahjongRoom) doGang(player int, tile Tile) {
	removed := 0
	newHand := r.Players[player].Hand[:0]
	for _, t := range r.Players[player].Hand {
		if removed < 3 && sameTile(t, tile) {
			removed++
			continue
		}
		newHand = append(newHand, t)
	}
	r.Players[player].Hand = newHand
	r.Players[player].Melds = append(r.Players[player].Melds, Meld{
		Type:  "gang",
		Tiles: []Tile{tile, tile, tile, tile},
		From:  r.CurrentPlayer,
	})

	msg, _ := buildMessage("gang", GangResultData{Tile: tile, Player: player, Meld: r.Players[player].Melds[len(r.Players[player].Melds)-1]})
	r.broadcastAll(msg)

	// 杠后摸一张牌
	if len(r.Wall) > 0 {
		newTile := r.Wall[0]
		r.Wall = r.Wall[1:]
		r.Players[player].Hand = append(r.Players[player].Hand, newTile)
		drawMsg, _ := buildMessage("your_draw", YourDrawData{Tile: newTile, Player: player})
		r.sendToSeat(player, drawMsg)
	}

	r.LastDiscarded = nil
	r.CurrentPlayer = player
	r.broadcastState()

	if r.Players[player] != nil && r.Players[player].IsBot {
		go func() {
			time.Sleep(1 * time.Second)
			r.mu.Lock()
			defer r.mu.Unlock()
			if r.Players[player] != nil && r.Players[player].IsBot {
				r.botDiscard(player)
			}
		}()
	}
}

func (r *MahjongRoom) doHu(player int, discarded *Tile) {
	huTiles := make([]Tile, len(r.Players[player].Hand))
	copy(huTiles, r.Players[player].Hand)
	if discarded != nil {
		huTiles = append(huTiles, *discarded)
	}

	// 简化计分
	score := 1
	if player == r.Dealer {
		score = 2
	}
	for _, p := range r.Players {
		if p != nil {
			if p == r.Players[player] {
				p.Score += score * 3
			} else {
				p.Score -= score
			}
		}
	}

	msg, _ := buildMessage("hu", HuResultData{
		Player: player,
		Tiles:  huTiles,
		HuType: "平胡",
		Score:  score,
	})
	r.broadcastAll(msg)

	scores := make([]int, 4)
	for i, p := range r.Players {
		if p != nil {
			scores[i] = p.Score
		}
	}
	overMsg, _ := buildMessage("game_over", GameOverData{Scores: scores})
	r.broadcastAll(overMsg)

	r.Status = StatusEnded
	r.broadcastState()
}

// ========== 状态广播 ==========

func (r *MahjongRoom) BuildRoomState() []byte {
	players := make([]PlayerInfo, 0, 4)
	for i, p := range r.Players {
		if p == nil {
			continue
		}
		pi := PlayerInfo{
			UserID:      p.UserID,
			Seat:        i,
			HandCount:   len(p.Hand),
			DiscardPile: p.DiscardPile,
			Melds:       p.Melds,
			Score:       p.Score,
			Ready:       p.Ready,
			IsBot:       p.IsBot,
		}
		players = append(players, pi)
	}

	state := RoomStateData{
		RoomID:        r.ID,
		Players:       players,
		CurrentPlayer: r.CurrentPlayer,
		Dealer:        r.Dealer,
		Status:        r.Status,
		DiscardPile:   r.DiscardPile,
		WallTiles:     len(r.Wall),
		Round:         r.Round,
		Wind:          r.Wind,
	}
	data, _ := buildMessage("room_state", state)
	return data
}

func (r *MahjongRoom) broadcastAll(data []byte) {
	for client := range r.Clients {
		select {
		case client.send <- data:
		default:
		}
	}
}

func (r *MahjongRoom) sendToSeat(seat int, data []byte) {
	for client := range r.Clients {
		if client.Seat == seat {
			select {
			case client.send <- data:
			default:
			}
			break
		}
	}
}

func (r *MahjongRoom) broadcastState() {
	data := r.BuildRoomState()
	r.broadcastAll(data)
}
