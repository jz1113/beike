package storage

import (
	"context"
	"encoding/xml"
	"errors"
	"fmt"
	"strings"

	"github.com/aliyun/alibabacloud-oss-go-sdk-v2/oss"
	"github.com/aliyun/alibabacloud-oss-go-sdk-v2/oss/signer"
)

// A trace belongs to one upload, including its sequential retries. Keep only the
// string to sign, never credentials, authorization headers, or uploaded content.
type ossSigningTrace struct {
	signer.Signer
	stringToSign string
}

func (trace *ossSigningTrace) Sign(ctx context.Context, signing *signer.SigningContext) error {
	err := trace.Signer.Sign(ctx, signing)
	trace.stringToSign = signing.StringToSign
	return err
}

func (trace *ossSigningTrace) explain(err error) error {
	var service *oss.ServiceError
	if !errors.As(err, &service) || service.Code != "SignatureDoesNotMatch" {
		return err
	}
	var detail struct {
		StringToSign string `xml:"StringToSign"`
	}
	if xml.Unmarshal(service.Snapshot, &detail) != nil || detail.StringToSign == "" || trace.stringToSign == "" {
		return err
	}
	server := strings.ReplaceAll(detail.StringToSign, "\r\n", "\n")
	if server == trace.stringToSign {
		return fmt.Errorf("签名核对：客户端与 OSS 的签名原文一致，请核对当前 AccessKey ID 对应的 Secret；%w", err)
	}
	return fmt.Errorf("签名核对：客户端与 OSS 的签名原文不一致，需检查签名配置及网络代理是否改写请求；%w", err)
}
