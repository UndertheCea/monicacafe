package config

import "testing"

func TestDefaultsAndOverride(t *testing.T) {
	t.Setenv("PORT", "")
	if Load().Port != "4000" || Load().Locale != "zh-TW" {
		t.Fatal("bad defaults")
	}
	t.Setenv("PORT", "9000")
	if Load().Port != "9000" {
		t.Fatal("override failed")
	}
}

func TestValidate(t *testing.T) {
	dev := Config{AppEnv: "development", JWTAccessSecret: defaultAccessSecret, JWTRefreshSecret: defaultRefreshSecret}
	if err := dev.Validate(); err != nil {
		t.Fatalf("development config should validate: %v", err)
	}
	prod := dev
	prod.AppEnv = "production"
	if err := prod.Validate(); err == nil {
		t.Fatal("production with default secrets must fail")
	}
	prod.JWTAccessSecret = "0123456789abcdef0123456789abcdef-a"
	prod.JWTRefreshSecret = "0123456789abcdef0123456789abcdef-r"
	if err := prod.Validate(); err != nil {
		t.Fatalf("production with strong secrets should validate: %v", err)
	}
	prod.JWTRefreshSecret = prod.JWTAccessSecret
	if err := prod.Validate(); err == nil {
		t.Fatal("identical secrets must fail")
	}
}

func TestCORSOrigins(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want []string
	}{
		{"empty", "", nil},
		{"single", "http://localhost:3000", []string{"http://localhost:3000"}},
		{"list with spaces", "http://localhost, http://localhost:3000", []string{"http://localhost", "http://localhost:3000"}},
		{"trailing slash and blanks", "https://monicafe.tw/,, ", []string{"https://monicafe.tw"}},
		{"dedupe", "http://a.tw,http://a.tw/", []string{"http://a.tw"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := Config{CORSOrigin: tt.in}.CORSOrigins()
			if len(got) != len(tt.want) {
				t.Fatalf("CORSOrigins(%q) = %v, want %v", tt.in, got, tt.want)
			}
			for i := range got {
				if got[i] != tt.want[i] {
					t.Fatalf("CORSOrigins(%q) = %v, want %v", tt.in, got, tt.want)
				}
			}
		})
	}
}
