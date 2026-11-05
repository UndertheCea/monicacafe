package middleware

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"net/netip"
	"strings"
)

// ParsePrefixes parses a comma-separated list of CIDRs or bare IPs (e.g.
// "10.0.0.0/8, 127.0.0.1"). An empty string yields no prefixes.
func ParsePrefixes(s string) ([]netip.Prefix, error) {
	var out []netip.Prefix
	for _, part := range strings.Split(s, ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		if !strings.Contains(part, "/") {
			a, err := netip.ParseAddr(part)
			if err != nil {
				return nil, fmt.Errorf("trusted proxies: %q is not an IP or CIDR", part)
			}
			a = a.Unmap()
			out = append(out, netip.PrefixFrom(a, a.BitLen()))
			continue
		}
		p, err := netip.ParsePrefix(part)
		if err != nil {
			return nil, fmt.Errorf("trusted proxies: %q is not an IP or CIDR", part)
		}
		out = append(out, p.Masked())
	}
	return out, nil
}

func trusted(a netip.Addr, proxies []netip.Prefix) bool {
	for _, p := range proxies {
		if p.Contains(a) {
			return true
		}
	}
	return false
}

func parseHost(remoteAddr string) (netip.Addr, bool) {
	host := remoteAddr
	if h, _, err := net.SplitHostPort(remoteAddr); err == nil {
		host = h
	}
	a, err := netip.ParseAddr(strings.TrimSpace(host))
	if err != nil {
		return netip.Addr{}, false
	}
	return a.Unmap().WithZone(""), true
}

// ClientIP returns the address of the client that made the request. The
// X-Forwarded-For header is only believed while the hop that set it is a
// trusted proxy: starting from the TCP peer, it walks the header right to left
// past trusted proxies and stops at the first untrusted address, so a client
// can't spoof its IP by sending the header itself. Returns "" when remoteAddr
// isn't an IP (e.g. a unix socket).
func ClientIP(remoteAddr string, xff []string, proxies []netip.Prefix) string {
	cur, ok := parseHost(remoteAddr)
	if !ok {
		return ""
	}
	var hops []string
	for _, h := range xff {
		hops = append(hops, strings.Split(h, ",")...)
	}
	for i := len(hops) - 1; i >= 0 && trusted(cur, proxies); i-- {
		next, ok := parseHost(hops[i])
		if !ok {
			break // a malformed hop: trust nothing further left of it
		}
		cur = next
	}
	return cur.String()
}

type clientIPKey struct{}

// ClientIPMiddleware resolves the client address once per request (see
// ClientIP), stores it in the context for rate limiting and rewrites
// r.RemoteAddr so access logs show it. It replaces chi's RealIP, which
// believes X-Forwarded-For from anyone.
func ClientIPMiddleware(proxies []netip.Prefix) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip := ClientIP(r.RemoteAddr, r.Header.Values("X-Forwarded-For"), proxies)
			if ip != "" {
				r = r.WithContext(context.WithValue(r.Context(), clientIPKey{}, ip))
				r.RemoteAddr = net.JoinHostPort(ip, "0")
			}
			next.ServeHTTP(w, r)
		})
	}
}

// ClientIPFrom returns the address stored by ClientIPMiddleware, or "".
func ClientIPFrom(ctx context.Context) string {
	ip, _ := ctx.Value(clientIPKey{}).(string)
	return ip
}

// WithClientIP stores ip in ctx (for tests and non-HTTP callers).
func WithClientIP(ctx context.Context, ip string) context.Context {
	return context.WithValue(ctx, clientIPKey{}, ip)
}
