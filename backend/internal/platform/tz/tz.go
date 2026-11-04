// Package tz provides Asia/Taipei (UTC+8) helpers. Storage is always UTC.
package tz

import "time"

// Taipei is a fixed UTC+8 zone (Taiwan has no DST), avoiding a tzdata dependency.
var Taipei = time.FixedZone("Asia/Taipei", 8*60*60)

func ToTaipei(t time.Time) time.Time { return t.In(Taipei) }
