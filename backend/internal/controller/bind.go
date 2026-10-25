package controller

import (
	"bytes"
	"encoding/json"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/gin-gonic/gin/binding"
)

// bindJSON decodes the body into req, rejects fields outside allowed, and
// validates req with its binding tags. On failure it writes the response and
// returns false.
func bindJSON(c *gin.Context, allowed map[string]bool, req any) bool {
	body, err := c.GetRawData()
	if err != nil {
		fail(c, 400, "VALIDATION_ERROR", "Dữ liệu không hợp lệ")
		return false
	}

	var fields map[string]json.RawMessage
	// Unmarshal checks the entire body, including data after the first value.
	if json.Unmarshal(body, &fields) != nil {
		fail(c, 400, "VALIDATION_ERROR", "Dữ liệu không hợp lệ")
		return false
	}
	for name := range fields {
		if !allowed[name] {
			fail(c, 400, "VALIDATION_ERROR", "Trường không được phép cập nhật: "+name)
			return false
		}
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(req); err != nil {
		fail(c, 400, "VALIDATION_ERROR", "Dữ liệu không hợp lệ")
		return false
	}
	if err := binding.Validator.ValidateStruct(req); err != nil {
		fail(c, 400, "VALIDATION_ERROR", "Dữ liệu không hợp lệ")
		return false
	}
	return true
}

func parseID(c *gin.Context) (int64, bool) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		fail(c, 404, "NOT_FOUND", "Không tìm thấy dữ liệu")
		return 0, false
	}
	return id, true
}
