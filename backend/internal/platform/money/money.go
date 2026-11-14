// Package money handles TWD amounts as whole NT$ integers.
package money

import (
	"encoding/json"
	"fmt"
	"io"
	"math"
	"strconv"
)

// Max is the largest amount the API accepts (NT$10,000,000). Nothing sold on
// the site costs more; the cap keeps quantity × price far from int64 overflow.
const Max TWD = 10_000_000

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

// UnmarshalGQL implements graphql.Unmarshaler for gqlgen scalar TWD. It
// refuses fractions (never truncates), negatives and amounts above Max.
func (t *TWD) UnmarshalGQL(v any) error {
	var n int64
	switch x := v.(type) {
	case int64:
		n = x
	case int32:
		n = int64(x)
	case int:
		n = int64(x)
	case float64:
		if math.IsNaN(x) || math.IsInf(x, 0) || x != math.Trunc(x) {
			return fmt.Errorf("TWD must be a whole number of NT$, got %v", x)
		}
		if x < 0 || x > float64(Max) {
			return fmt.Errorf("TWD must be between 0 and %d", int64(Max))
		}
		n = int64(x)
	case json.Number:
		i, err := strconv.ParseInt(string(x), 10, 64)
		if err != nil {
			return fmt.Errorf("TWD must be a whole number of NT$, got %q", string(x))
		}
		n = i
	case string:
		i, err := strconv.ParseInt(x, 10, 64)
		if err != nil {
			return fmt.Errorf("TWD must be a whole number of NT$, got %q", x)
		}
		n = i
	default:
		return fmt.Errorf("TWD must be a number, got %T", v)
	}
	if n < 0 || n > int64(Max) {
		return fmt.Errorf("TWD must be between 0 and %d", int64(Max))
	}
	*t = TWD(n)
	return nil
}
