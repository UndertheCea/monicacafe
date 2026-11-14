package twfmt

import (
	"regexp"
	"strings"
	"unicode"

	"golang.org/x/text/unicode/norm"
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
	s = normalise(s)
	if emailRe.MatchString(s) || urlRe.MatchString(s) || domainRe.MatchString(s) ||
		spacedDomainRe.MatchString(s) || hasPhoneNumber(s) || hasSocialHandle(s) {
		return true
	}
	// Phone numbers written in Chinese numerals ("零九一二 三四五 六七八").
	// Only checked on the digit form so "三重 處理" or "一號豆" stay clear.
	if d := numeralsToDigits(s); d != s && hasPhoneNumber(d) {
		return true
	}
	return false
}

// isBlankLooking reports letters that render as nothing: Hangul fillers, the Braille
// blank and the Khmer inherent vowels. Text made of them looks empty.
func isBlankLooking(r rune) bool {
	switch r {
	case 0x115F, 0x1160, 0x3164, 0xFFA0, 0x2800, 0x17B4, 0x17B5:
		return true
	}
	return false
}

// HasBlankLookingRune reports whether s contains a letter that renders blank
// (U+3164, U+2800 and friends). Callers refuse such text in names and comments.
func HasBlankLookingRune(s string) bool {
	for _, r := range s {
		if isBlankLooking(r) {
			return true
		}
	}
	return false
}

var obfuscatedDotRe = regexp.MustCompile(`\s*[\[\(\{<]\s*(?:\.|dot|點)\s*[\]\)\}>]\s*|\s+dot\s+`)
var obfuscatedAtRe = regexp.MustCompile(`\s*[\[\(\{<]\s*at\s*[\]\)\}>]\s*|\s*小老鼠\s*`)

// normalise prepares text for matching: NFKC (full-width forms, circled and
// other compatibility digits), lower case, invisible and blank characters
// dropped, 。 as a dot, and the usual obfuscations of "." and "@" undone.
func normalise(s string) string {
	s = norm.NFKC.String(s)
	var b strings.Builder
	b.Grow(len(s))
	for _, r := range s {
		switch {
		case r == 0x3000:
			r = ' '
		case r == 0x3002: // 。 as in "foo。com"
			r = '.'
		case unicode.Is(unicode.Cf, r) || isBlankLooking(r):
			continue
		}
		b.WriteRune(unicode.ToLower(r))
	}
	s = b.String()
	s = obfuscatedDotRe.ReplaceAllString(s, ".")
	s = obfuscatedAtRe.ReplaceAllString(s, "@")
	return s
}

var numeralDigits = map[rune]rune{
	'零': '0', '〇': '0', '一': '1', '二': '2', '三': '3', '四': '4',
	'五': '5', '六': '6', '七': '7', '八': '8', '九': '9',
}

// numeralsToDigits maps the Chinese numerals 零〇一二三四五六七八九 to digits.
func numeralsToDigits(s string) string {
	return strings.Map(func(r rune) rune {
		if d, ok := numeralDigits[r]; ok {
			return d
		}
		return r
	}, s)
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

// More ways to name a platform and send people there (#286). Bare "line" is
// left to the id / colon forms above, so "fine line" stays fine.
const platforms = `ig|instagram|fb|facebook|臉書|微信|威信|wechat|weixin|蝦皮|shopee|telegram|whatsapp|threads|小紅書|賴|line`

var (
	// "蝦皮搜尋 好咖啡", "ig 搜尋 coffee.lab", "臉書搜尋 …"
	searchRe = regexp.MustCompile(`(?:` + strings.ReplaceAll(platforms, "|line", "") + `)\s*(?:上|裡|內)?\s*(?:搜尋|搜索|搜|查詢|找)`)
	// "@roaster_tw" on its own: an @ in front of a handle-like word.
	bareHandleRe = regexp.MustCompile(`(?:^|[^a-z0-9._%+-])@[a-z0-9._]{3,}`)
	// "ig coffee.lab", "line moni_123": a platform then a token with a dot,
	// underscore or digit in it.
	nameThenHandleRe = regexp.MustCompile(`(?:^|[^a-z0-9])(?:` + platforms + `)\s*[:=@]?\s*[a-z][a-z0-9]*[._0-9][a-z0-9._]*`)
	// "FB 粉專：好咖啡", "臉書粉絲專頁", "粉專：…"
	pageRe = regexp.MustCompile(`(?:fb|facebook|臉書|ig|instagram)\s*(?:粉專|粉絲專頁|粉絲團|專頁)|粉專\s*[:=]\s*\S`)
	// "微信 wx12345", "wechat: abc123", or a bare "wx12345".
	wechatRe = regexp.MustCompile(`(?:微信|威信|wechat|weixin)\s*(?:號|id|帳號)?\s*[:=]?\s*[a-z0-9_-]*\d[a-z0-9_-]{3,}|(?:^|[^a-z0-9])wx[a-z0-9_-]*\d[a-z0-9_-]*`)
	// "roaster @ gmail": a mail provider after an @ (an obfuscated email).
	providerRe = regexp.MustCompile(`[a-z0-9._%+-]+\s*@\s*(?:gmail|yahoo|hotmail|outlook|icloud|msn|proton(?:mail)?|qq|163|pchome|livemail)\b`)
)

func hasSocialHandle(s string) bool {
	return handleIDRe.MatchString(s) || handleSepRe.MatchString(s) || handleAtRe.MatchString(s) || addMeRe.MatchString(s) ||
		searchRe.MatchString(s) || bareHandleRe.MatchString(s) || nameThenHandleRe.MatchString(s) ||
		pageRe.MatchString(s) || wechatRe.MatchString(s) || providerRe.MatchString(s)
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
