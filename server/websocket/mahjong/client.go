package mahjong

import (
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"jiangyi.com/utils"
)

var mahjongUpgrader = websocket.Upgrader{
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

type MahjongClient struct {
	hub      *MahjongHub
	room     *MahjongRoom
	send     chan []byte
	UserID   string
	ClientID string
	Seat     int // 座位号 0-3
}

func ServeMahjongWS(hub *MahjongHub) gin.HandlerFunc {
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

		clientID := c.Query("clientId")

		conn, err := mahjongUpgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			log.Printf("[MahjongWS] upgrade failed: %v", err)
			return
		}

		room := hub.GetOrCreateRoom(roomID)

		client := &MahjongClient{
			hub:      hub,
			room:     room,
			send:     make(chan []byte, 256),
			UserID:   userID,
			ClientID: clientID,
			Seat:     -1,
		}

		seat := room.AssignSeat(client)
		if seat == -1 {
			// 房间已满，作为观战者
			msg, _ := buildMessage("error", ErrorData{Message: "房间已满"})
			conn.WriteMessage(websocket.TextMessage, msg)
			conn.Close()
			return
		}

		// 发送角色分配
		msg, _ := buildMessage("role_assigned", RoleAssignedData{Seat: seat})
		client.send <- msg

		// 广播房间状态
		if state := room.BuildRoomState(); state != nil {
			room.broadcastAll(state)
		}

		log.Printf("[MahjongWS] user %s joined room %s at seat %d", userID, roomID, seat)

		go client.writePump(conn)
		go client.readPump(conn)
	}
}

func (c *MahjongClient) readPump(conn *websocket.Conn) {
	defer func() {
		c.room.RemoveClient(c)
		conn.Close()

		if state := c.room.BuildRoomState(); state != nil {
			c.room.broadcastAll(state)
		}

		log.Printf("[MahjongWS] user %s left room %s", c.UserID, c.room.ID)
	}()

	conn.SetReadLimit(maxMessageSize * 1024)
	conn.SetReadDeadline(time.Now().Add(pongWait))
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("[MahjongWS] read error: %v", err)
			}
			break
		}
		c.room.HandleMessage(c, message)
	}
}

func (c *MahjongClient) writePump(conn *websocket.Conn) {
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
