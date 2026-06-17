.PHONY: dev skills stop logs help

# ── Colours ───────────────────────────────────────────────────────────────────
CYAN  := \033[0;36m
RESET := \033[0m

# ── Remote services (already on fly.io) ──────────────────────────────────────
#   Indexer / Bazaar API  → https://ledgerforge-indexer.fly.dev
#   Facilitator           → https://ledgerforge-facilitator.fly.dev

# ── Targets ───────────────────────────────────────────────────────────────────

## Start only the Next.js dashboard (connects to live fly.io backend)
dev:
	@echo "$(CYAN)→ Starting dashboard on http://localhost:3000$(RESET)"
	cd dashboard && npm run dev

## Start dashboard + all local skill servers (port 3005 mantle, 3003 spawn)
skills:
	@echo "$(CYAN)→ Starting dashboard + skill servers$(RESET)"
	@mkdir -p .logs
	cd agents && npm run mantle-server > ../.logs/mantle-skills.log 2>&1 & echo $$! > ../.logs/mantle-skills.pid
	cd agents && npm run spawn-server  > ../.logs/spawn-skills.log  2>&1 & echo $$! > ../.logs/spawn-skills.pid
	@echo "$(CYAN)  Mantle skills → http://localhost:3005/health$(RESET)"
	@echo "$(CYAN)  Spawn  skills → http://localhost:3003/health$(RESET)"
	@echo "$(CYAN)  Logs in .logs/ — run 'make stop' to kill skill servers$(RESET)"
	cd dashboard && npm run dev

## Kill background skill servers started by `make skills`
stop:
	@for pid_file in .logs/*.pid; do \
		[ -f "$$pid_file" ] || continue; \
		pid=$$(cat "$$pid_file"); \
		kill "$$pid" 2>/dev/null && echo "Killed $$pid_file (pid $$pid)" || true; \
		rm "$$pid_file"; \
	done
	@echo "$(CYAN)Skill servers stopped.$(RESET)"

## Tail logs from skill servers
logs:
	@tail -f .logs/*.log 2>/dev/null || echo "No log files found. Run 'make skills' first."

## Show this help
help:
	@echo ""
	@echo "  $(CYAN)make dev$(RESET)     — dashboard only  (indexer + facilitator on fly.io)"
	@echo "  $(CYAN)make skills$(RESET)  — dashboard + local skill servers (ports 3005, 3003)"
	@echo "  $(CYAN)make stop$(RESET)    — kill background skill servers"
	@echo "  $(CYAN)make logs$(RESET)    — tail skill server logs"
	@echo ""
	@echo "  Remote services (no local setup needed):"
	@echo "    Bazaar API   → https://ledgerforge-indexer.fly.dev"
	@echo "    Facilitator  → https://ledgerforge-facilitator.fly.dev"
	@echo ""
