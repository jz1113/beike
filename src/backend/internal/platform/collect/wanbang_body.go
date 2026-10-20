package collect

import (
	"context"
	"errors"
	"net/http"
)

func collectionContextResult(ctx context.Context) Result {
	if errors.Is(ctx.Err(), context.DeadlineExceeded) {
		return failureResult(http.StatusGatewayTimeout, "采集请求已超时，请稍后重试")
	}
	return failureResult(499, "采集已取消")
}

func wanbangBodyFailure(err wanbangBodyError) collectionFailure {
	message := "万邦采集接口返回非 JSON 响应，请稍后重试"
	switch err.kind {
	case "empty":
		message = "万邦采集接口返回空响应，请稍后重试"
	case "tooLarge":
		message = "万邦采集接口响应超过 8 MiB 限制"
	}
	return collectionFailure{error: message, status: http.StatusBadGateway, stop: true}
}
