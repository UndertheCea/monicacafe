// Package search expands a buyer's search words into the other ways sellers
// write the same thing (#269): Taiwanese Chinese and English names of regions,
// varieties, processes and tasting notes, alternative spellings, and the
// simplified-character forms buyers type on a mainland keyboard.
//
// The table is curated, not exhaustive: it covers terms Taiwan roasters
// commonly write one way and buyers search the other. Origin countries and
// processing methods already match in both languages through their reference
// tables; the country entries here only add the mainland names (肯尼亚 for
// 肯亞). A word expands to at most MaxAlternatives patterns, so the search
// query's cost stays bounded.
package search

import (
	"strings"
	"unicode"
)

// MaxAlternatives caps how many alternatives one search word expands to
// (the word itself included).
const MaxAlternatives = 8

// groups lists the terms that mean the same thing. Every member expands to
// the whole group. Each group stays at most MaxAlternatives - 1 long so the
// typed word (when it isn't a member verbatim) still fits.
var groups = [][]string{
	// Regions.
	{"Yirgacheffe", "Yirgachefe", "耶加雪菲", "耶加雪啡"},
	{"Guji", "古吉"},
	{"Sidamo", "Sidama", "西達摩", "西達馬"},
	{"Hambela", "罕貝拉"},
	{"Harrar", "Harar", "哈拉"},
	{"Limu", "利姆"},
	{"Huila", "薇拉"},
	{"Nariño", "Narino", "納里尼奧", "娜玲珠"},
	{"Cauca", "考卡"},
	{"Antigua", "安提瓜"},
	{"Huehuetenango", "薇薇特南果"},
	{"Boquete", "波奎特"},
	{"Tarrazú", "Tarrazu", "塔拉珠"},
	{"Kona", "可娜"},
	{"Mandheling", "曼特寧"},
	{"Nyeri", "涅里"},
	{"Kirinyaga", "基里尼亞加"},
	{"Cerrado", "喜拉朵"},
	{"Alishan", "阿里山"},
	{"Yunnan", "雲南"},
	// Mainland names of origin countries (the Taiwanese ones are in origin_countries).
	{"Ethiopia", "衣索比亞", "埃塞俄比亞"},
	{"Kenya", "肯亞", "肯尼亞"},
	{"Rwanda", "盧安達", "盧旺達"},
	{"Burundi", "蒲隆地", "布隆迪"},
	{"Tanzania", "坦尚尼亞", "坦桑尼亞"},
	{"Guatemala", "瓜地馬拉", "危地馬拉"},
	{"Honduras", "宏都拉斯", "洪都拉斯"},
	{"Costa Rica", "哥斯大黎加", "哥斯達黎加"},
	{"Yemen", "葉門", "也門"},
	{"Indonesia", "印尼", "印度尼西亞"},
	// Varieties (coffee_varieties has English names only).
	{"Geisha", "Gesha", "瑰夏", "藝伎", "藝妓"},
	{"Bourbon", "波旁"},
	{"Typica", "鐵比卡", "帝比卡"},
	{"Caturra", "卡杜拉"},
	{"Catuai", "Catuaí", "卡杜艾"},
	{"Pacamara", "帕卡馬拉"},
	{"Heirloom", "原生種"},
	{"Sidra", "希爪"},
	{"Maragogype", "Maragogipe", "象豆"},
	{"Mokka", "Mocha", "摩卡"},
	// Processes not covered by processing_methods' own two names.
	{"Anaerobic", "厭氧"},
	{"Washed", "水洗"},
	{"Natural", "日曬"},
	// Tasting notes.
	{"Jasmine", "茉莉", "茉莉花"},
	{"Bergamot", "佛手柑"},
	{"Citrus", "柑橘"},
	{"Lemon", "檸檬"},
	{"Orange", "柳橙", "柳丁"},
	{"Berry", "Berries", "莓果"},
	{"Blueberry", "藍莓"},
	{"Strawberry", "草莓"},
	{"Peach", "桃子", "水蜜桃"},
	{"Chocolate", "巧克力"},
	{"Caramel", "焦糖"},
	{"Floral", "花香"},
	{"Honey", "蜂蜜"},
	{"Grape", "葡萄"},
	{"Apple", "蘋果"},
	{"Cherry", "櫻桃"},
	{"Mango", "芒果"},
	{"Passionfruit", "百香果"},
	{"Lychee", "Litchi", "荔枝"},
	{"Plum", "李子"},
	{"Rose", "玫瑰"},
	{"Nutty", "Nuts", "堅果"},
}

// index maps a member's lookup key to its group.
var index = func() map[string][]string {
	m := map[string][]string{}
	for _, g := range groups {
		for _, term := range g {
			m[key(term)] = g
		}
	}
	return m
}()

// Expand returns the alternatives for one search word: the word itself first,
// then its traditional-character form when it differs, then the other members
// of its synonym group. Alternatives are distinct case-insensitively and at
// most MaxAlternatives long.
func Expand(word string) []string {
	out := []string{word}
	seen := map[string]bool{strings.ToLower(word): true}
	addAlt := func(s string) {
		if k := strings.ToLower(s); !seen[k] && len(out) < MaxAlternatives {
			seen[k] = true
			out = append(out, s)
		}
	}
	folded := Traditional(word)
	addAlt(folded)
	for _, term := range index[key(folded)] {
		addAlt(term)
	}
	return out
}

// key normalises a term for lookup: traditional characters, lower case,
// accents dropped, and spaces, hyphens, apostrophes and trailing
// punctuation removed ("Yirga-Cheffe," and "yirgacheffe" are one key).
func key(s string) string {
	var b strings.Builder
	for _, r := range Traditional(s) {
		if f, ok := accentFold[r]; ok {
			r = f
		}
		switch {
		case unicode.IsSpace(r), unicode.IsPunct(r):
			continue
		}
		b.WriteRune(unicode.ToLower(r))
	}
	return b.String()
}

var accentFold = map[rune]rune{
	'á': 'a', 'à': 'a', 'â': 'a', 'ä': 'a', 'ã': 'a',
	'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e',
	'í': 'i', 'ì': 'i', 'î': 'i', 'ï': 'i',
	'ó': 'o', 'ò': 'o', 'ô': 'o', 'ö': 'o', 'õ': 'o',
	'ú': 'u', 'ù': 'u', 'û': 'u', 'ü': 'u',
	'ñ': 'n', 'ç': 'c',
	'Á': 'a', 'É': 'e', 'Í': 'i', 'Ó': 'o', 'Ú': 'u', 'Ñ': 'n',
}

// Traditional replaces the simplified characters that coffee listings use
// with their traditional forms. Characters not in the table are kept.
func Traditional(s string) string {
	if !strings.ContainsFunc(s, func(r rune) bool { _, ok := simplified[r]; return ok }) {
		return s
	}
	rs := []rune(s)
	for i, r := range rs {
		if t, ok := simplified[r]; ok {
			rs[i] = t
		}
	}
	return string(rs)
}

// simplified → traditional, limited to characters found in coffee names,
// origins, processes and tasting notes. Only one-to-one mappings are listed
// (发 → 發 is safe here because 髮 never describes coffee).
var simplified = map[rune]rune{
	'亚': '亞', '尔': '爾', '达': '達', '马': '馬', '伦': '倫', '罗': '羅',
	'萨': '薩', '苏': '蘇', '门': '門', '乌': '烏', '卢': '盧', '维': '維',
	'纳': '納', '兰': '蘭', '种': '種', '处': '處', '厌': '厭', '晒': '曬',
	'浅': '淺', '风': '風', '柠': '檸', '苹': '蘋', '樱': '櫻', '坚': '堅',
	'红': '紅', '艺': '藝', '铁': '鐵', '庄': '莊', '园': '園', '发': '發',
	'产': '產', '区': '區', '国': '國', '级': '級', '叶': '葉', '贝': '貝',
	'诺': '諾', '泽': '澤', '圣': '聖', '岛': '島', '蓝': '藍', '酿': '釀',
	'轻': '輕', '杂': '雜', '态': '態', '浓': '濃', '层': '層', '丽': '麗',
	'热': '熱', '带': '帶', '东': '東', '宁': '寧', '云': '雲', '奥': '奧',
}
