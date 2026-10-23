package controller

import (
	"strings"

	"github.com/Akapi895/course-registration/backend/internal/service"
	"github.com/gin-gonic/gin"
)

const principalKey = "principal"

func AuthRequired(auth *service.AuthService) gin.HandlerFunc {
	return func(c *gin.Context) {
		token, ok := bearerToken(c.GetHeader("Authorization"))
		if !ok {
			failWithError(c, service.ErrUnauthorized)
			return
		}

		principal, err := auth.VerifyAccessToken(c.Request.Context(), token)
		if err != nil {
			failWithError(c, err)
			return
		}

		c.Set(principalKey, principal)
		c.Next()
	}
}

func bearerToken(header string) (string, bool) {
	token, ok := strings.CutPrefix(header, "Bearer ")
	token = strings.TrimSpace(token)
	return token, ok && token != ""
}

func currentPrincipal(c *gin.Context) *service.Principal {
	p, _ := c.Get(principalKey)
	return p.(*service.Principal)
}
