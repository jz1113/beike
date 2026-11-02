package sales

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"

	"beike.local/cloud/src/backend/internal/platform/media"
	"beike.local/cloud/src/backend/internal/platform/network"
)

func fetchAssetGridOriginal(ctx context.Context, source string) ([]byte, error) {
	return fetchAssetGridWithClients(ctx, source, network.SafeClient(), network.SafeClientIPv6First())
}

// Some dual-stack CDNs accept IPv4 connections but stall while transferring the
// image. Retry the existing result over a separate IPv6-first connection instead
// of repeatedly downloading it over the same stalled IPv4 route. Both clients
// validate every DNS address and redirect; neither bypasses the public-IP guard.
func fetchAssetGridWithClients(ctx context.Context, source string, primary, alternate *http.Client) ([]byte, error) {
	u, err := url.Parse(source)
	if err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" || u.User != nil {
		return nil, errors.New("图片地址无效")
	}
	var data []byte
	for index, client := range []*http.Client{primary, alternate} {
		budget := 20 * time.Second
		if index == 1 {
			budget = 60 * time.Second
		}
		attempt, cancel := context.WithTimeout(ctx, budget)
		var retry bool
		data, retry, err = fetchAssetGridAttempt(attempt, source, client)
		cancel()
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		if err == nil || !retry {
			return data, err
		}
	}
	return nil, err
}

func fetchAssetGridAttempt(ctx context.Context, source string, client *http.Client) ([]byte, bool, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, source, nil)
	if err != nil {
		return nil, false, errors.New("图片地址无效")
	}
	for key, value := range media.RemoteMediaHeaders(source, "image/*") {
		req.Header.Set(key, value)
	}
	res, err := client.Do(req)
	if err != nil {
		return nil, true, errors.New("原图下载连接失败或超时，请继续补全以重试原图")
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, res.StatusCode >= 500 || res.StatusCode == 429,
			fmt.Errorf("远程图片下载失败（HTTP %d）", res.StatusCode)
	}
	if res.ContentLength > assetGridMaxBytes {
		return nil, false, originalImageSizeError{assetGridMaxBytes}
	}
	data, err := io.ReadAll(io.LimitReader(res.Body, assetGridMaxBytes+1))
	if err != nil {
		return nil, true, errors.New("原图下载中断或超时，请继续补全以重试原图")
	}
	if len(data) > assetGridMaxBytes {
		return nil, false, originalImageSizeError{assetGridMaxBytes}
	}
	if len(data) == 0 {
		return nil, true, errors.New("原图为空")
	}
	return data, false, nil
}
