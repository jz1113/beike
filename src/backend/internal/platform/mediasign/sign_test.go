package mediasign

import "testing"

func TestCreateAndVerify(t *testing.T) {
	signature := Create("proxy-media-session", "secret", 3600)
	if !Verify("proxy-media-session", signature.Exp, signature.Sig, "secret") {
		t.Fatal("签名无法通过校验")
	}
	if Verify("proxy-media-session", signature.Exp, signature.Sig, "other") {
		t.Fatal("错误密钥不应通过")
	}
}
