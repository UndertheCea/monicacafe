// Package ecpay implements ECPay (綠界) request signing. Stdlib only.
// Deferred to stage 3 (checkout). Parked here for future use.
package ecpay

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"net/url"
	"sort"
	"strings"
)

// CheckMacValue computes the SHA256 CheckMacValue for the given params.
// Any existing "CheckMacValue" key is ignored.
func CheckMacValue(params map[string]string, hashKey, hashIV string) string {
	keys := make([]string, 0, len(params))
	for k := range params {
		if k != "CheckMacValue" {
			keys = append(keys, k)
		}
	}
	sort.Slice(keys, func(i, j int) bool { return strings.ToLower(keys[i]) < strings.ToLower(keys[j]) })
	var b strings.Builder
	b.WriteString("HashKey=" + hashKey)
	for _, k := range keys {
		b.WriteString("&" + k + "=" + params[k])
	}
	b.WriteString("&HashIV=" + hashIV)
	enc := strings.ToLower(dotNetEscape(b.String()))
	sum := sha256.Sum256([]byte(enc))
	return strings.ToUpper(hex.EncodeToString(sum[:]))
}

// Verify checks params["CheckMacValue"] in constant time.
func Verify(params map[string]string, hashKey, hashIV string) bool {
	got := strings.ToUpper(params["CheckMacValue"])
	want := CheckMacValue(params, hashKey, hashIV)
	return subtle.ConstantTimeCompare([]byte(got), []byte(want)) == 1
}

// dotNetEscape mimics .NET HttpUtility.UrlEncode as ECPay requires.
func dotNetEscape(s string) string {
	s = url.QueryEscape(s)
	return strings.NewReplacer("~", "%7e", "%2D", "-", "%5F", "_", "%2E", ".", "%21", "!", "%2A", "*", "%28", "(", "%29", ")").Replace(s)
}
