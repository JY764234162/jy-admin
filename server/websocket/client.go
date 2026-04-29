package websocket

import (
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"jiangyi.com/utils"
)

const (
	// 写入超时
	writeWait = 10 * time.Second
	// 读取超时（Ping 间隔的 2 倍）
	pongWait = 60 * time.Second
	// Ping 发送间隔
	pingPeriod = (pongWait * 9) / 10
	// 发送缓冲区大小
	sendBufferSize = 256
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		// 开发环境允许所有来源
		return true
	},
}

// NewClient 创建新的 WebSocket 客户端
func NewClient(hub *Hub, room *Room, userID string) *Client {
	return &Client{
		hub:    hub,
		room:   room,
		send:   make(chan []byte, sendBufferSize),
		userID: userID,
	}
}

// ReadPump 从 WebSocket 读取消息并广播
func (c *Client) ReadPump() {
	defer func() {
		c.room.Unregister(c)
		c.hub.RemoveRoom(c.room.ID)
	}()

	// 设置读取超时和 Pong 处理器
	// 注意：这里不直接设置 c.conn，因为 c 结构体中没有 conn 字段
	// 连接管理在 Handler 中完成
}

// WritePump 向 WebSocket 写入消息
func (c *Client) WritePump(conn *websocket.Conn) {
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
				// Hub 关闭了 channel
				conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			// 写入二进制消息（Yjs 使用二进制协议）
			if err := conn.WriteMessage(websocket.BinaryMessage, message); err != nil {
				log.Printf("[WebSocket] 写入消息失败: %v", err)
				return
			}

		case <-ticker.C:
			conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				log.Printf("[WebSocket] Ping 失败: %v", err)
				return
			}
		}
	}
}

// ServeWS 处理 WebSocket 连接
func ServeWS(hub *Hub) gin.HandlerFunc {
	return func(c *gin.Context) {
		roomID := c.Param("roomId")
		if roomID == "" {
			c.JSON(400, gin.H{"code": 400, "msg": "roomId 不能为空"})
			return
		}

		// 获取用户 ID（优先从 JWT token，否则从查询参数）
		userID := c.Query("userId")
		token := c.Query("token")
		if token != "" {
			j := utils.NewJWT()
			if claims, err := j.ParseToken(token); err == nil {
				userID = claims.Username
			}
		}
		if claims, exists := c.Get("claims"); exists {
			if customClaims, ok := claims.(*utils.CustomClaims); ok {
				userID = customClaims.Username
			}
		}
		if userID == "" {
			userID = "anonymous"
		}

		// 升级 HTTP 到 WebSocket
		conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			log.Printf("[WebSocket] 升级连接失败: %v", err)
			return
		}

		// 获取或创建房间
		room := hub.GetOrCreateRoom(roomID)
		log.Printf("[WebSocket] 用户 %s 进入房间 %s", userID, roomID)

		// 创建客户端
		client := NewClient(hub, room, userID)
		room.Register(client)

		// 启动读写 goroutine（必须先启动，否则 send 可能阻塞）
		go client.WritePump(conn)

		// 发送房间当前状态快照（如果有）
		if state := room.GetState(); state != nil {
			select {
			case client.send <- append([]byte{0x01}, state...):
				log.Printf("[WebSocket] 向用户 %s 发送房间 %s 状态快照 (%d bytes)", userID, roomID, len(state))
			default:
				log.Printf("[WebSocket] 用户 %s 发送缓冲区满，跳过状态快照", userID)
			}
		}

		// 读取循环
		defer func() {
			room.Unregister(client)
			hub.RemoveRoom(roomID)
			conn.Close()
		}()

		conn.SetReadDeadline(time.Now().Add(pongWait))
		conn.SetPongHandler(func(string) error {
			conn.SetReadDeadline(time.Now().Add(pongWait))
			return nil
		})

		for {
			_, message, err := conn.ReadMessage()
			if err != nil {
				if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
					log.Printf("[WebSocket] 连接异常关闭: %v", err)
				}
				break
			}

			if len(message) > 0 && message[0] == 0x01 {
				log.Printf("[WebSocket] 用户 %s 发送 STATE 消息 (%d bytes)", userID, len(message))
				room.SetState(message[1:])
				room.Broadcast(client, message)
			} else {
				log.Printf("[WebSocket] 用户 %s 发送 UPDATE 消息 (%d bytes)", userID, len(message))
				room.Broadcast(client, message)
			}
		}
	}
}
