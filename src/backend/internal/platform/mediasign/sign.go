// Package mediasign matches the Node HMAC used by image-proxy URLs.
package mediasign

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"strconv"
	"time"
)

type Signature struct {
	Exp int64  `json:"exp"`
	Sig string `json:"sig"`
}

func Create(rawURL, secret string, ttlSec int64) Signature {
	exp := time.Now().Unix() + ttlSec
	return Signature{Exp: exp, Sig: hex.EncodeToString(mac(rawURL, exp, secret))}
}

func Verify(rawURL string, exp int64, sig, secret string) bool {
	if rawURL == "" || sig == "" || secret == "" || exp < time.Now().Unix() {
		return false
	}
	got, err := hex.DecodeString(sig)
	if err != nil {
		return false
	}
	expected := mac(rawURL, exp, secret)
	return hmac.Equal(got, expected)
}

func mac(rawURL string, exp int64, secret string) []byte {
	hasher := hmac.New(sha256.New, []byte(secret))
	_, _ = hasher.Write([]byte(rawURL + "\n" + strconv.FormatInt(exp, 10)))
	return hasher.Sum(nil)
}
