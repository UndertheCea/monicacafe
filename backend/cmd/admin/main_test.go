package main

import "testing"

func TestParseArgs(t *testing.T) {
	cases := []struct {
		name    string
		args    []string
		want    command
		wantErr bool
	}{
		{"grant", []string{"grant", "Owner@Example.com "}, command{grant: true, email: "owner@example.com"}, false},
		{"revoke", []string{"revoke", "a@b.tw"}, command{email: "a@b.tw"}, false},
		{"no args", nil, command{}, true},
		{"missing email", []string{"grant"}, command{}, true},
		{"unknown command", []string{"promote", "a@b.tw"}, command{}, true},
		{"not an email", []string{"grant", "owner"}, command{}, true},
		{"extra args", []string{"grant", "a@b.tw", "x"}, command{}, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := parseArgs(tc.args)
			if (err != nil) != tc.wantErr {
				t.Fatalf("err = %v, wantErr %v", err, tc.wantErr)
			}
			if got != tc.want {
				t.Fatalf("got %+v, want %+v", got, tc.want)
			}
		})
	}
}
