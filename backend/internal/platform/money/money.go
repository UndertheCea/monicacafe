// Package money handles TWD amounts as whole NT$ integers.
package money

import (
	"fmt"
	"io"
)

// TWD is a whole-dollar New Taiwan Dollar amount (no decimals).
type TWD int64

func (t TWD) String() string { return fmt.Sprintf("NT$%d", int64(t)) }

// Add returns the sum, erroring on overflow.
func (t TWD) Add(o TWD) (TWD, error) {
	s := t + o
	if (o > 0 && s < t) || (o < 0 && s > t) {
		return 0, fmt.Errorf("money: overflow")
	}
	return s, nil
}

// MarshalGQL implements graphql.Marshaler for gqlgen scalar TWD.
func (t TWD) MarshalGQL(w io.Writer) {
	fmt.Fprint(w, int64(t))
}

// UnmarshalGQL implements graphql.Unmarshaler for gqlgen scalar TWD.
func (t *TWD) UnmarshalGQL(v any) error {
	switch n := v.(type) {
	case int64:
		*t = TWD(n)
	case int32:
		*t = TWD(n)
	case int:
		*t = TWD(n)
	case float64:
		*t = TWD(int64(n))
	default:
		return fmt.Errorf("TWD must be a number, got %T", v)
	}
	return nil
}
