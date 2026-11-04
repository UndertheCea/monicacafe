package main

import (
	"log"

	"github.com/underthecea/monicacafe/backend/internal/platform/config"
)

func main() {
	cfg := config.Load()
	log.Printf("worker starting, connecting to %s", cfg.DatabaseURL)
	// River job queue lands here in stage 2.
	select {}
}
