package twfmt

import "testing"

func TestContainsContactInfo(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want bool
	}{
		// Mobile numbers
		{"mobile plain", "訂購請打0912345678", true},
		{"mobile dashes", "0912-345-678", true},
		{"mobile spaces", "電話 0912 345 678 謝謝", true},
		{"mobile dots", "0912.345.678", true},
		{"mobile +886", "call +886 912 345 678", true},
		{"mobile +886 with 0", "+886-0912-345678", true},
		{"mobile 886 without plus", "886912345678", true},
		{"mobile full-width digits", "０９１２３４５６７８", true},
		{"mobile full-width with dashes", "０９１２－３４５－６７８", true},
		{"mobile after a price", "NT$450 0912345678", true},
		// Harder to dodge (#286)
		{"Chinese numeral phone", "零九一二 三四五 六七八", true},
		{"Chinese numeral phone with 〇", "〇九一二三四五六七八", true},
		{"circled digits", "09①②③④⑤⑥⑦⑧", true},
		{"ig search handle", "ig 搜尋 coffee.lab", true},
		{"bare @handle", "@roaster_tw", true},
		{"full-width @ handle", "官方帳號 ＠ｒｏａｓｔｅｒ", true},
		{"wechat id", "微信 wx12345", true},
		{"shopee search", "蝦皮搜尋 好咖啡", true},
		{"facebook search", "臉書搜尋 好咖啡烘焙", true},
		{"FB page", "FB 粉專：好咖啡", true},
		{"bracket dot domain", "example[.]com", true},
		{"paren dot domain", "example(.)com", true},
		{"dot word domain", "example dot com", true},
		{"obfuscated email via 小老鼠", "roaster 小老鼠 gmail", true},
		{"obfuscated email via [at]", "roaster [at] gmail", true},
		{"obfuscated email via (at) and dot", "roaster(at)gmail(dot)com", true},
		{"zero-width inside number", "0912​345​678", true},
		{"ig then dotted name", "IG coffee.lab", true},
		{"telegram search", "Telegram 搜尋 moni", true},
		{"false positive: altitude and harvest", "海拔 1900-2100 公尺，2024 年產季", false},
		{"false positive: lot number", "Lot 23-047", false},
		{"false positive: batch", "批次 0912", false},
		{"false positive: varieties", "SL28, SL34", false},
		{"false positive: region", "衣索比亞 古吉 罕貝拉", false},
		{"false positive: price weight", "NT$450 / 200g", false},
		{"false positive: coffee named 一號豆", "一號豆", false},
		{"false positive: 三重 處理", "三重 處理", false},
		{"false positive: gesha", "Gesha 藝伎 2023 年產季 海拔 1,950 公尺", false},
		{"false positive: numerals in prose", "三四五 六七八", false},
		{"false positive: fine line", "a fine line between sweet and tart", false},
		{"false positive: polka dot", "polka dot cup", false},
		// Landlines
		{"Taipei landline", "(02) 2345-6789", true},
		{"Taipei landline dashes", "02-2345-6789", true},
		{"Taichung landline", "04-2234-5678", true},
		{"Tainan landline", "06-234-5678", true},
		{"landline international", "+886-2-2345-6789", true},
		// Email
		{"email", "寄信到 roaster@gmail.com", true},
		{"email with spaces", "roaster @ gmail.com", true},
		{"email full-width at", "roaster＠gmail．com", true},
		// URLs and domains
		{"https url", "看 https://example.com/beans", true},
		{"http url without domain dot", "http://localhost", true},
		{"www", "www.example.org", true},
		{"bare .com", "到 mybeans.com 買", true},
		{"bare .com.tw", "官網 roastery.com.tw", true},
		{"lin.ee short link", "lin.ee/AbCdEf", true},
		{"bit.ly", "bit.ly/3xYz", true},
		{"full-width domain", "ｍｙｂｅａｎｓ．ｃｏｍ", true},
		{"spaced dot com", "mybeans dot com", true},
		{"ideographic full stop", "mybeans。com", true},
		// Social handles
		{"line id", "LINE ID: monica_cafe", true},
		{"line id no colon", "line id monica123", true},
		{"line colon", "LINE：monicacafe", true},
		{"line at", "line @abc123", true},
		{"ig colon", "IG: monica.roasts", true},
		{"ig id lower", "ig id monica.roasts", true},
		{"fb colon", "FB: monicacafe.tw", true},
		{"full-width line", "ＬＩＮＥ ＩＤ：ａｂｃ１２３", true},
		{"add me on line", "有興趣加我line", true},
		{"dm on ig", "私訊IG", true},
		{"add on 賴", "加賴聊", true},

		// False-positive guards: ordinary coffee text.
		{"altitude range", "1,900–2,200 m", false},
		{"altitude range ascii dash", "海拔 1900-2200 公尺", false},
		{"price", "NT$450", false},
		{"two prices", "NT$450 / NT$820", false},
		{"weight", "200 g", false},
		{"harvest year", "2024/25 產季", false},
		{"harvest range", "2023-2024", false},
		{"variety SL28", "SL28, SL34", false},
		{"Geisha 1931", "Geisha 1931", false},
		{"decimal", "粉水比 1:15，3.5 分鐘", false},
		{"decimal list", "0.5 0.8 1.2", false},
		{"date", "2024.09.12 烘焙", false},
		{"date with time", "2024-09-12 08:00 出貨", false},
		{"flavour words", "Jasmine, bergamot, lemon, honey, black tea", false},
		{"english line", "A fine line between sweet and sour", false},
		{"line of coffees", "Our espresso line includes three blends", false},
		{"big and fig", "Big body, fig and plum", false},
		{"abbreviation", "e.g. stone fruit, no.1 seller", false},
		{"lot number", "Lot 23, 1 kg bags", false},
		{"chinese description", "衣索比亞古吉，日曬處理，莓果與花香明顯", false},
		{"temperature", "92°C 水溫, 15 g 粉, 240 ml", false},
		{"increase", "增加甜感", false},
		{"empty", "", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := ContainsContactInfo(tt.in); got != tt.want {
				t.Errorf("ContainsContactInfo(%q) = %v, want %v", tt.in, got, tt.want)
			}
		})
	}
}
