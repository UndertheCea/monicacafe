package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestParsePrefixes(t *testing.T) {
	cases := []struct {
		in      string
		want    []string
		wantErr bool
	}{
		{"", nil, false},
		{"10.0.0.0/8, 127.0.0.1 ,::1", []string{"10.0.0.0/8", "127.0.0.1/32", "::1/128"}, false},
		{"172.16.5.4/12", []string{"172.16.0.0/12"}, false},
		{"nginx", nil, true},
		{"10.0.0.0/33", nil, true},
	}
	for _, c := range cases {
		got, err := ParsePrefixes(c.in)
		if (err != nil) != c.wantErr {
			t.Errorf("ParsePrefixes(%q) err = %v", c.in, err)
			continue
		}
		if len(got) != len(c.want) {
			t.Errorf("ParsePrefixes(%q) = %v, want %v", c.in, got, c.want)
			continue
		}
		for i := range got {
			if got[i].String() != c.want[i] {
				t.Errorf("ParsePrefixes(%q)[%d] = %s, want %s", c.in, i, got[i], c.want[i])
			}
		}
	}
}

func TestClientIP(t *testing.T) {
	proxies, _ := ParsePrefixes("10.0.0.0/8,172.16.0.0/12,127.0.0.1")
	cases := []struct {
		name   string
		remote string
		xff    []string
		want   string
	}{
		{"direct client, no header", "203.0.113.7:5555", nil, "203.0.113.7"},
		{"untrusted peer can't spoof", "203.0.113.7:5555", []string{"1.2.3.4"}, "203.0.113.7"},
		{"behind nginx", "172.18.0.5:40000", []string{"198.51.100.2"}, "198.51.100.2"},
		{"nginx → frontend → backend", "172.18.0.6:40000", []string{"198.51.100.2, 172.18.0.5"}, "198.51.100.2"},
		{"client-supplied hop left of the real one is ignored", "172.18.0.5:1", []string{"1.2.3.4, 198.51.100.2"}, "198.51.100.2"},
		{"multiple header lines", "172.18.0.5:1", []string{"1.2.3.4", "198.51.100.2"}, "198.51.100.2"},
		{"trusted peer, no header", "127.0.0.1:9", nil, "127.0.0.1"},
		{"all hops trusted → leftmost", "10.0.0.1:1", []string{"10.0.0.3, 10.0.0.2"}, "10.0.0.3"},
		{"malformed hop stops the walk", "10.0.0.1:1", []string{"1.2.3.4, garbage"}, "10.0.0.1"},
		{"ipv6 client", "172.18.0.5:1", []string{" 2001:db8::1 "}, "2001:db8::1"},
		{"ipv4-mapped peer", "[::ffff:10.0.0.1]:1", []string{"198.51.100.2"}, "198.51.100.2"},
		{"remote without port", "198.51.100.9", nil, "198.51.100.9"},
		{"not an ip", "@", nil, ""},
	}
	for _, c := range cases {
		if got := ClientIP(c.remote, c.xff, proxies); got != c.want {
			t.Errorf("%s: ClientIP = %q, want %q", c.name, got, c.want)
		}
	}
}

func TestClientIPMiddleware(t *testing.T) {
	proxies, _ := ParsePrefixes("172.16.0.0/12")
	var got, remote string
	h := ClientIPMiddleware(proxies)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got, remote = ClientIPFrom(r.Context()), r.RemoteAddr
	}))
	req := httptest.NewRequest(http.MethodPost, "/graphql", nil)
	req.RemoteAddr = "172.18.0.5:1234"
	req.Header.Set("X-Forwarded-For", "198.51.100.2")
	h.ServeHTTP(httptest.NewRecorder(), req)
	if got != "198.51.100.2" || remote != "198.51.100.2:0" {
		t.Fatalf("ClientIPFrom = %q, RemoteAddr = %q", got, remote)
	}
}
