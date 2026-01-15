package utils

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"jiangyi.com/global"
)

type CustomClaims struct {
	ID          uint
	Username    string
	NickName    string
	AuthorityId string
	BufferTime  int64
	jwt.RegisteredClaims
}

type JWT struct {
	SigningKey []byte
}

var (
	TokenExpired   = errors.New("Token is expired")
	TokenMalformed = errors.New("That's not even a token")
	TokenInvalid   = errors.New("Couldn't handle this token:")
)

func NewJWT() *JWT {
	return &JWT{
		SigningKey: []byte(global.JY_Config.JWT.SigningKey),
	}
}

// CreateToken 创建一个token
func (j *JWT) CreateToken(claims CustomClaims) (string, error) {
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(j.SigningKey)
}

// ParseToken 解析 token
func (j *JWT) ParseToken(authorization string) (*CustomClaims, error) {

	// 按标准 Bearer <token> 格式处理
	var tokenString string
	if len(authorization) > 7 && authorization[:7] == "Bearer " {
		tokenString = authorization[7:]
	} else {
		tokenString = authorization
	}

	token, err := jwt.ParseWithClaims(tokenString, &CustomClaims{}, func(token *jwt.Token) (i interface{}, e error) {
		return j.SigningKey, nil
	})
	if err != nil {
		switch {
		case errors.Is(err, jwt.ErrTokenMalformed):
			return nil, TokenMalformed
		case errors.Is(err, jwt.ErrTokenExpired), errors.Is(err, jwt.ErrTokenNotValidYet):
			return nil, TokenExpired
		default:
			return nil, TokenInvalid
		}
	}
	if token != nil {
		if claims, ok := token.Claims.(*CustomClaims); ok && token.Valid {
			return claims, nil
		} else {
			return nil, TokenInvalid
		}
	} else {
		return nil, TokenInvalid
	}
}

// CreateClaims 创建 Claims
func CreateClaims(baseClaims CustomClaims) CustomClaims {
	bf, _ := ParseDuration(global.JY_Config.JWT.BufferTime)
	ep, _ := ParseDuration(global.JY_Config.JWT.ExpiresTime)
	claims := CustomClaims{
		ID:          baseClaims.ID,
		Username:    baseClaims.Username,
		NickName:    baseClaims.NickName,
		AuthorityId: baseClaims.AuthorityId,
		BufferTime:  int64(bf / time.Second),
		RegisteredClaims: jwt.RegisteredClaims{
			Audience:  jwt.ClaimStrings{"GVA"},                   // 受众
			NotBefore: jwt.NewNumericDate(time.Now().Add(-1000)), // 签名生效时间
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(ep)),    // 过期时间
			Issuer:    global.JY_Config.JWT.Issuer,               // 签名的发行者
		},
	}
	return claims
}

// ParseDuration 解析时间
func ParseDuration(d string) (time.Duration, error) {
	return time.ParseDuration(d)
}
