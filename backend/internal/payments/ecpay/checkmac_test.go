package ecpay

import (
	"strings"
	"testing"
)

func TestCheckMacRoundTrip(t *testing.T) {
	p := map[string]string{
		"TradeDesc": "促銷方案", "PaymentType": "aio", "MerchantTradeDate": "2013/03/12 15:30:23",
		"MerchantTradeNo": "ecpay20130312153023", "MerchantID": "3002607", "ReturnURL": "https://www.ecpay.com.tw/receive.php",
		"ItemName": "Apple iphone 7 手機殼", "TotalAmount": "1000", "ChoosePayment": "ALL", "EncryptType": "1",
	}
	got := CheckMacValue(p, "pwFHCqoQZGmho4w6", "EkRm7iFT261dpevs")
	if len(got) != 64 || got != CheckMacValue(p, "pwFHCqoQZGmho4w6", "EkRm7iFT261dpevs") {
		t.Fatal("not deterministic 64-hex")
	}
	p["CheckMacValue"] = got
	if !Verify(p, "pwFHCqoQZGmho4w6", "EkRm7iFT261dpevs") {
		t.Fatal("verify failed")
	}
	p["TotalAmount"] = "1"
	if Verify(p, "pwFHCqoQZGmho4w6", "EkRm7iFT261dpevs") {
		t.Fatal("tamper not detected")
	}
}

// officialParams is ECPay's documented CheckMacValue example (developers.ecpay.com.tw,
// 全方位金流 › 檢查碼機制), with the stage merchant's HashKey / HashIV.
func officialParams() map[string]string {
	return map[string]string{
		"ChoosePayment": "ALL", "EncryptType": "1", "ItemName": "Apple iphone 15", "MerchantID": "3002607",
		"MerchantTradeDate": "2023/03/12 15:30:23", "MerchantTradeNo": "ecpay20230312153023", "PaymentType": "aio",
		"ReturnURL": "https://www.ecpay.com.tw/receive.php", "TotalAmount": "30000", "TradeDesc": "促銷方案",
	}
}

const (
	officialKey = "pwFHCqoQZGmho4w6"
	officialIV  = "EkRm7iFT261dpevs"
	officialMac = "6C51C9E6888DE861FD62FB1DD17029FC742634498FD813DC43D4243B5685B840"
)

func TestCheckMacValueOfficialVector(t *testing.T) {
	if got := CheckMacValue(officialParams(), officialKey, officialIV); got != officialMac {
		t.Fatalf("CheckMacValue = %s, want ECPay's documented %s", got, officialMac)
	}
}

func TestVerifyOfficialVector(t *testing.T) {
	cases := []struct {
		name   string
		mutate func(p map[string]string)
		want   bool
	}{
		{"documented value", func(p map[string]string) { p["CheckMacValue"] = officialMac }, true},
		{"lowercase value", func(p map[string]string) { p["CheckMacValue"] = strings.ToLower(officialMac) }, true},
		{"missing value", func(p map[string]string) {}, false},
		{"tampered amount", func(p map[string]string) { p["CheckMacValue"] = officialMac; p["TotalAmount"] = "3000" }, false},
		{"extra field", func(p map[string]string) { p["CheckMacValue"] = officialMac; p["CustomField1"] = "x" }, false},
		{"wrong key", func(p map[string]string) { p["CheckMacValue"] = CheckMacValue(p, "wrong", officialIV) }, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			p := officialParams()
			tc.mutate(p)
			if got := Verify(p, officialKey, officialIV); got != tc.want {
				t.Fatalf("Verify = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestDotNetEscape(t *testing.T) {
	if got := dotNetEscape("a b~(x)*!-_."); got != "a+b%7e(x)*!-_." {
		t.Fatal(got)
	}
}
