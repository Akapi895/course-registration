package controller

import (
	"strings"

	"github.com/Akapi895/course-registration/backend/internal/service"
	"github.com/gin-gonic/gin"
)

const claimsKey = "claims"

func AuthRequired(auth *service.AuthService) gin.HandlerFunc {
	return func(c *gin.Context) {
		token, ok := bearerToken(c.GetHeader("Authorization"))
		if !ok {
			failWithError(c, service.ErrUnauthorized)
			return
		}

		claims, err := auth.VerifyAccessToken(c.Request.Context(), token)
		if err != nil {
			failWithError(c, err)
			return
		}

		c.Set(claimsKey, claims)
		c.Next()
	}
}

func bearerToken(header string) (string, bool) {
	token, ok := strings.CutPrefix(header, "Bearer ")
	token = strings.TrimSpace(token)
	return token, ok && token != ""
}

func currentClaims(c *gin.Context) *service.Claims {
	claims, _ := c.Get(claimsKey)
	return claims.(*service.Claims)
}
