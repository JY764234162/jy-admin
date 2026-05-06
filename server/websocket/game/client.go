package game

import (
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"jiangyi.com/utils"
)

var gameUpgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 512
)

// ServeGameWS 返回处理游戏 WebSocket 的 gin.HandlerFunc
func ServeGameWS(hub *GameHub) gin.HandlerFunc {
	return func(c *gin.Context) {
		roomID := c.Param("roomId")
		if roomID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "缺少房间号"})
			return
		}

		// 优先使用前端传入的昵称，其次从 JWT 解析
		userID := c.Query("nickname")
		if userID == "" {
			token := c.Query("token")
			if token != "" {
				j := utils.NewJWT()
				if claims, err := j.ParseToken(token); err == nil {
					userID = claims.NickName
					if userID == "" {
						userID = claims.Username
					}
				}
			}
		}
		if userID == "" {
			userID = "匿名玩家"
		}

		// clientId 用于刷新重连时恢复身份（前端 sessionStorage 生成）
		clientID := c.Query("clientId")

		conn, err := gameUpgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			log.Printf("[GameWS] upgrade failed: %v", err)
			return
		}

		room := hub.GetOrCreateRoom(roomID)

		client := &GameClient{
			hub:      hub,
			room:     room,
			send:     make(chan []byte, 256),
			UserID:   userID,
			ClientID: clientID,
		}

		// 分配角色
		role := room.AssignRole(client)

		// 发送角色分配（仅给加入者）
		msg, _ := buildMessage("role_assigned", RoleAssignedData{Color: role})
		client.send <- msg

		// 广播完整房间状态（让所有人都能看到新加入的玩家）
		if state := room.BuildRoomState(); state != nil {
			room.broadcastAll(state)
		}

		// 广播用户加入事件
		joinMsg, _ := buildMessage("user_joined", UserJoinedData{
			UserID:         userID,
			Role:           role,
			PlayerCount:    room.PlayerCount(),
			SpectatorCount: len(room.Spectators),
		})
		room.broadcastAll(joinMsg)

		log.Printf("[GameWS] user %s joined room %s as %s", userID, roomID, role)

		go client.writePump(conn)
		go client.readPump(conn)
	}
}

func (c *GameClient) readPump(conn *websocket.Conn) {
	defer func() {
		c.room.RemoveClient(c)
		conn.Close()

		// 广播完整房间状态（让剩余玩家看到玩家列表更新）
		if state := c.room.BuildRoomState(); state != nil {
			c.room.broadcastAll(state)
		}

		// 广播用户离开
		leaveMsg, _ := buildMessage("user_left", UserLeftData{
			UserID:         c.UserID,
			PlayerCount:    c.room.PlayerCount(),
			SpectatorCount: len(c.room.Spectators),
		})
		c.room.broadcastAll(leaveMsg)

		log.Printf("[GameWS] user %s left room %s", c.UserID, c.room.ID)
	}()

	conn.SetReadLimit(maxMessageSize * 1024) // 512KB
	conn.SetReadDeadline(time.Now().Add(pongWait))
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("[GameWS] read error: %v", err)
			}
			break
		}

		c.room.HandleMessage(c, message)
	}
}

func (c *GameClient) writePump(conn *websocket.Conn) {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			if err := conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}

		case <-ticker.C:
			conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
