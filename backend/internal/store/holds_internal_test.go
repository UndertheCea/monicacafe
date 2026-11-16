package store

import (
	"errors"
	"reflect"
	"testing"
)

func TestHoldOrder(t *testing.T) {
	l := func(id string, q int) StockLine { return StockLine{VariantID: id, Quantity: q} }
	cases := []struct {
		name    string
		lines   []StockLine
		want    []int
		wantErr error
	}{
		{"empty", nil, []int{}, nil},
		{"one", []StockLine{l("b", 1)}, []int{0}, nil},
		{"sorted by variant id", []StockLine{l("c", 1), l("a", 2), l("b", 3)}, []int{1, 2, 0}, nil},
		{"same lines, other cart order, same lock order", []StockLine{l("b", 3), l("c", 1), l("a", 2)}, []int{2, 0, 1}, nil},
		{"duplicate option", []StockLine{l("a", 1), l("b", 1), l("a", 2)}, nil, ErrDuplicateLine},
		{"zero bags", []StockLine{l("a", 0)}, nil, errAnyHold},
		{"negative bags", []StockLine{l("a", 1), l("b", -1)}, nil, errAnyHold},
		{"most bags a hold allows", []StockLine{l("a", MaxHoldQuantity)}, []int{0}, nil},
		{"more bags than a hold allows", []StockLine{l("a", MaxHoldQuantity+1)}, nil, errAnyHold},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := holdOrder(tc.lines)
			switch {
			case tc.wantErr == errAnyHold:
				if err == nil {
					t.Fatalf("got %v, want an error", got)
				}
			case tc.wantErr != nil:
				if !errors.Is(err, tc.wantErr) {
					t.Fatalf("err = %v, want %v", err, tc.wantErr)
				}
			default:
				if err != nil || !reflect.DeepEqual(got, tc.want) {
					t.Fatalf("got %v, %v; want %v", got, err, tc.want)
				}
			}
		})
	}
}

var errAnyHold = errors.New("any error")
