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

func SafeClient() *http.Client {
	dialer := &net.Dialer{Timeout: 10 * time.Second}
	return &http.Client{Transport: &http.Transport{DialContext: func(ctx context.Context, networkName, address string) (net.Conn, error) {
		return dialPublic(ctx, dialer, networkName, address)
	}}, CheckRedirect: func(request *http.Request, via []*http.Request) error {
		if len(via) >= 3 {
			return errors.New("stopped after 3 redirects")
		}
		if blockedHost(request.URL.Hostname()) {
			return errors.New("Host not allowed")
		}
		return nil
	}}
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
