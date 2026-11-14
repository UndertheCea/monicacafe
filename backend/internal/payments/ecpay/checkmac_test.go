package ecpay

import "testing"

// NOTE: not yet checked against an official ECPay vector (docs unreachable offline);
// verify against ECPay's stage sandbox before go-live.
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

// TestCheckMacValueOfficialVector must hold ECPay's documented CheckMacValue
// example (inputs, HashKey/HashIV and the expected value), copied verbatim.
func TestCheckMacValueOfficialVector(t *testing.T) {
	t.Skip("ECPay docs unreachable from the build session on 2026-11-14; add the example from https://developers.ecpay.com.tw (CheckMacValue encryption mechanism) and remove this skip")
}

func TestDotNetEscape(t *testing.T) {
	if got := dotNetEscape("a b~(x)*!-_."); got != "a+b%7e(x)*!-_." {
		t.Fatal(got)
	}
}
