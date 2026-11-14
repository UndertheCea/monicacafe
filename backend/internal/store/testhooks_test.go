package store

// RawDB exposes the store's connection (or transaction) to the external
// store_test package, for tests that need SQL the store doesn't offer, such
// as a stand-in table for Stage 2 order lines (#278).
func (s *Store) RawDB() DB { return s.db }
