package store_test

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/underthecea/monicacafe/backend/internal/store"
)

func TestShopFollows(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	suffix := fmt.Sprintf("%d", time.Now().UnixNano())

	err := s.InTx(ctx, func(tx *store.Store) error {
		shops := seedShops(t, ctx, tx, suffix, []struct {
			name              string
			published, drafts int
		}{{"a", 0, 0}, {"b", 0, 0}, {"c", 0, 0}})
		var users []string
		for i := range 2 {
			u, err := tx.CreateUser(ctx, fmt.Sprintf("fol-%s-%d@example.test", suffix, i), "x", "f")
			if err != nil {
				return err
			}
			users = append(users, u.ID)
		}

		steps := []struct {
			name   string
			follow bool
			user   int
			shop   int
		}{
			{"u0 follows a", true, 0, 0},
			{"u0 follows b", true, 0, 1},
			{"u0 follows a again (no-op)", true, 0, 0},
			{"u1 follows a", true, 1, 0},
			{"u1 follows c", true, 1, 2},
			{"u1 unfollows c", false, 1, 2},
			{"u1 unfollows c again (no-op)", false, 1, 2},
		}
		for _, st := range steps {
			var err error
			if st.follow {
				err = tx.FollowShop(ctx, users[st.user], shops[st.shop])
			} else {
				err = tx.UnfollowShop(ctx, users[st.user], shops[st.shop])
			}
			if err != nil {
				t.Fatalf("%s: %v", st.name, err)
			}
		}

		counts, err := tx.FollowerCountsByShopIDs(ctx, shops)
		if err != nil {
			return err
		}
		for i, want := range []int{2, 1, 0} {
			if counts[shops[i]] != want {
				t.Errorf("shop %d: %d followers, want %d", i, counts[shops[i]], want)
			}
		}
		if _, ok := counts[shops[2]]; ok {
			t.Error("unfollowed shop should be absent from the counts")
		}

		followed, err := tx.FollowedShopIDs(ctx, users[0], shops)
		if err != nil {
			return err
		}
		if !followed[shops[0]] || !followed[shops[1]] || followed[shops[2]] {
			t.Errorf("u0 follows %v", followed)
		}

		// Every row in one transaction shares now(), so order isn't checked
		// here (the GraphQL integration test covers most-recent-first).
		listCases := []struct {
			name          string
			user          int
			limit, offset int
			want          []int
			total         int
		}{
			{"all", 0, 10, 0, []int{0, 1}, 2},
			{"paged", 0, 1, 1, nil, 2},
			{"after unfollow", 1, 10, 0, []int{0}, 1},
		}
		for _, tc := range listCases {
			got, total, err := tx.FollowedShopsByUser(ctx, users[tc.user], tc.limit, tc.offset)
			if err != nil {
				t.Fatalf("%s: %v", tc.name, err)
			}
			wantLen := len(tc.want)
			if tc.want == nil {
				wantLen = tc.limit
			}
			if total != tc.total || len(got) != wantLen {
				t.Fatalf("%s: got %d shops (total %d), want %d (total %d)", tc.name, len(got), total, wantLen, tc.total)
			}
			ids := map[string]bool{}
			for _, sh := range got {
				ids[sh.ID] = true
			}
			for _, w := range tc.want {
				if !ids[shops[w]] {
					t.Errorf("%s: shop %d missing", tc.name, w)
				}
			}
		}

		if err := tx.FollowShop(ctx, users[0], "00000000-0000-0000-0000-000000000000"); !errors.Is(err, store.ErrInvalidReference) {
			t.Errorf("follow unknown shop: %v, want ErrInvalidReference", err)
		}
		return errRollback
	})
	if !errors.Is(err, errRollback) {
		t.Fatal(err)
	}
}
