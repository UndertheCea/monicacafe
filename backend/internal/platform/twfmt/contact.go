package twfmt

import (
	"regexp"
	"strings"
	"unicode"
)

// ContainsContactInfo reports whether s looks like it carries personal contact
// details or a way off the platform (#225): a Taiwan mobile or landline
// number, an email address, a URL or bare domain, or a LINE / Instagram /
// Facebook handle. Sellers and buyers meet on the site; comments and
// descriptions can't be used to move a sale elsewhere.
//
// Full-width letters, digits and punctuation (０９１２, ＬＩＮＥ, ＠, ．) count
// like their ASCII forms, and separators inside numbers (spaces, dashes, dots,
// brackets) are ignored. Ordinary coffee text must not trip it: altitudes
// ("1,900–2,200 m"), prices ("NT$450"), weights, harvest years ("2024/25"),
// variety names ("SL28", "Geisha 1931") and decimals are all fine.
func ContainsContactInfo(s string) bool {
	s = foldWidth(s)
	return emailRe.MatchString(s) || urlRe.MatchString(s) || domainRe.MatchString(s) ||
		spacedDomainRe.MatchString(s) || hasPhoneNumber(s) || hasSocialHandle(s)
}

// foldWidth maps full-width ASCII forms (U+FF01–FF5E) and the ideographic
// space and full stop to ASCII, and lower-cases the result.
func foldWidth(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	for _, r := range s {
		switch {
		case r >= 0xFF01 && r <= 0xFF5E:
			r -= 0xFEE0
		case r == 0x3000:
			r = ' '
		case r == 0x3002: // 。 as in "foo。com"
			r = '.'
		}
		b.WriteRune(unicode.ToLower(r))
	}
	return b.String()
}

// Top-level domains worth flagging as a bare "name.tld". A list, not [a-z]{2,},
// so that "e.g." or "no.1" never count; country and generic domains a Taiwan
// seller would plausibly use, plus the link shorteners (lin.ee, bit.ly, t.me).
const tlds = `com|net|org|tw|hk|cn|jp|io|me|cc|co|info|biz|shop|store|app|xyz|link|ly|gl|ee|page|site|online|top|vip|club|asia`

var (
	emailRe = regexp.MustCompile(`[a-z0-9._%+-]+\s?@\s?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}`)
	urlRe   = regexp.MustCompile(`(?:https?|ftp)\s?:\s?//|\bwww\s?\.\s?[a-z0-9-]`)
	// foo.com, foo.com.tw, lin.ee/abc, shop.example.co
	domainRe = regexp.MustCompile(`\b[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:` + tlds + `)\b`)
	// "foo . com", "foo dot com", "foo 點 com"
	spacedDomainRe = regexp.MustCompile(`\b[a-z0-9][a-z0-9-]+\s*(?:\.|\bdot\b|點)\s*(?:com|net|org|tw)\b`)
)

// Social handles. "line" alone is an English word ("a fine line"), so a handle
// needs an "id", a colon or an @ after the network's name, or a Chinese "add
// me on …" before it.
var (
	socialNets  = `line|ig|fb|instagram|facebook|wechat|telegram|whatsapp|threads|賴`
	handleIDRe  = regexp.MustCompile(`(?:^|[^a-z0-9])(?:` + socialNets + `)\s*(?:id|帳號|帳戶|號)\s*[:=]?\s*@?[a-z0-9._-]{2,}`)
	handleSepRe = regexp.MustCompile(`(?:^|[^a-z0-9])(?:` + socialNets + `)\s*[:=]\s*@?[a-z0-9._-]{2,}`)
	handleAtRe  = regexp.MustCompile(`(?:^|[^a-z0-9])(?:` + socialNets + `)\s*@\s?[a-z0-9._-]{2,}`)
	addMeRe     = regexp.MustCompile(`(?:加|私訊|私|密|聯絡|聯繫)\s*(?:我|好友)?\s*的?\s*(?:line|ig|fb|instagram|facebook|wechat|微信|臉書|賴)`)
)

func hasSocialHandle(s string) bool {
	return handleIDRe.MatchString(s) || handleSepRe.MatchString(s) || handleAtRe.MatchString(s) || addMeRe.MatchString(s)
}

// digitRun is a run of digit groups joined by phone-style separators: a space,
// dash, dot or bracket (at most two in a row). Commas, slashes and en dashes
// are not separators, so "1,900–2,200" or "2024/25" stay apart.
var digitRun = regexp.MustCompile(`\+?\d+(?:[ \-.()]{1,2}\d+)*`)

var digitGroup = regexp.MustCompile(`\d+`)

// hasPhoneNumber looks for a Taiwan phone number among consecutive digit
// groups of each run: "0912-345-678", "+886 912 345 678", "(02) 2345-6789".
// Every window of whole groups is tried, so a price or year written just
// before the number ("NT$450 0912…") doesn't hide it.
func hasPhoneNumber(s string) bool {
	for _, run := range digitRun.FindAllString(s, -1) {
		groups := digitGroup.FindAllString(run, -1)
		for i := range groups {
			n := ""
			for j := i; j < len(groups) && len(n) < 13; j++ {
				n += groups[j]
				if isTaiwanPhone(n) {
					return true
				}
			}
		}
	}
	return false
}

// isTaiwanPhone reports whether a digits-only string is a Taiwan mobile
// (09 + 8 digits) or landline (0 + area code 2–8 + 7–8 digits), in national
// form or international form (886 without the leading 0, or 886 0…).
func isTaiwanPhone(n string) bool {
	if rest, ok := strings.CutPrefix(n, "886"); ok {
		n = "0" + strings.TrimPrefix(rest, "0")
	}
	if len(n) < 9 || n[0] != '0' {
		return false
	}
	switch {
	case n[1] == '9':
		return len(n) == 10
	case n[1] >= '2' && n[1] <= '8':
		return len(n) == 9 || len(n) == 10
	}
	return false
}
