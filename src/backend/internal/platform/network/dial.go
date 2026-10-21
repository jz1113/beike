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
	targets, err := dialableIPs(records)
	if err != nil {
		return nil, err
	}
	var last error
	for _, ip := range targets {
		conn, err := dialer.DialContext(ctx, networkName, net.JoinHostPort(ip.String(), port))
		if err == nil {
			return conn, nil
		}
		last = err
	}
	if last == nil {
		last = errors.New("DNS lookup failed for host")
	}
	return nil, last
}

// Public addresses are dialed IPv4 first. One unreachable record must not hide
// another that works, and any private address still rejects the whole name.
func dialableIPs(records []net.IPAddr) ([]net.IP, error) {
	if len(records) == 0 {
		return nil, errors.New("DNS lookup failed for host")
	}
	v4 := make([]net.IP, 0, len(records))
	v6 := make([]net.IP, 0)
	for _, record := range records {
		if PrivateIP(record.IP.String()) {
			return nil, errors.New("Resolved to private IP")
		}
		if record.IP.To4() != nil {
			v4 = append(v4, record.IP)
			continue
		}
		v6 = append(v6, record.IP)
	}
	return append(v4, v6...), nil
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
