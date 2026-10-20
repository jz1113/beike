package network

import (
	"context"
	"errors"
	"net"
	"net/http"
	"strings"
	"time"
)

var blockedHosts = map[string]struct{}{
	"localhost": {}, "metadata.google.internal": {}, "metadata": {},
}

// safeTransport is shared so outbound keep-alive connections expire.
// A transport created per request never hits IdleConnTimeout and pins a TLS
// connection for each call.
var safeTransport = &http.Transport{
	DialContext:           dialPublicContext,
	MaxIdleConns:          64,
	MaxIdleConnsPerHost:   4,
	IdleConnTimeout:       90 * time.Second,
	TLSHandshakeTimeout:   10 * time.Second,
	ExpectContinueTimeout: 1 * time.Second,
}

func SafeClient() *http.Client {
	return &http.Client{Transport: safeTransport, CheckRedirect: safeRedirect}
}

func dialPublicContext(ctx context.Context, networkName, address string) (net.Conn, error) {
	dialer := &net.Dialer{Timeout: 10 * time.Second, KeepAlive: 30 * time.Second}
	return dialPublic(ctx, dialer, networkName, address)
}

func safeRedirect(request *http.Request, via []*http.Request) error {
	if len(via) >= 3 {
		return errors.New("stopped after 3 redirects")
	}
	if blockedHost(request.URL.Hostname()) {
		return errors.New("Host not allowed")
	}
	return nil
}

func dialPublic(ctx context.Context, dialer *net.Dialer, networkName, address string) (net.Conn, error) {
	host, port, err := net.SplitHostPort(address)
	if err != nil {
		return nil, err
	}
	if blockedHost(host) {
		return nil, errors.New("Host not allowed")
	}
	if parsed := net.ParseIP(host); parsed != nil {
		if PrivateIP(parsed.String()) {
			return nil, errors.New("Host not allowed")
		}
		return dialer.DialContext(ctx, networkName, address)
	}
	records, err := net.DefaultResolver.LookupIPAddr(ctx, host)
	if err != nil || len(records) == 0 {
		return nil, errors.New("DNS lookup failed for host")
	}
	for _, record := range records {
		if PrivateIP(record.IP.String()) {
			return nil, errors.New("Resolved to private IP")
		}
	}
	return dialer.DialContext(ctx, networkName, net.JoinHostPort(records[0].IP.String(), port))
}

func blockedHost(host string) bool {
	host = strings.ToLower(strings.Trim(host, "[]"))
	host = strings.TrimSuffix(host, ".")
	if host == "" || host == "0.0.0.0" {
		return true
	}
	_, blocked := blockedHosts[host]
	return blocked || PrivateIP(host)
}
