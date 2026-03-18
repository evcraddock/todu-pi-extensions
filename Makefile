DEV_CONFIG := ./config/dev.todu.yaml
DEV_CLI := todu --config $(DEV_CONFIG)

.PHONY: dev dev-stop dev-status dev-logs dev-tail dev-daemon-status dev-cli check pre-pr help

SOCKET := ./.overmind.sock

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

dev: ## Start the dev environment (daemonized)
	@if [ ! -f $(DEV_CONFIG) ]; then \
		echo "Creating $(DEV_CONFIG) from template..."; \
		cp $(DEV_CONFIG).template $(DEV_CONFIG); \
	fi
	@if [ -S $(SOCKET) ] && overmind ps -s $(SOCKET) > /dev/null 2>&1; then \
		echo "Dev environment already running"; \
	else \
		rm -f $(SOCKET); \
		overmind start -f Procfile.dev -s $(SOCKET) -D; \
	fi
	@attempts=0; \
	until [ -S $(SOCKET) ] && $(DEV_CLI) daemon status > /dev/null 2>&1; do \
		attempts=$$((attempts + 1)); \
		if [ $$attempts -ge 20 ]; then \
			echo "Dev environment failed to become ready"; \
			overmind ps -s $(SOCKET) || true; \
			exit 1; \
		fi; \
		sleep 1; \
	done
	@overmind ps -s $(SOCKET)

dev-stop: ## Stop the dev environment
	@if [ -S $(SOCKET) ]; then overmind quit -s $(SOCKET) || true; fi
	@rm -f $(SOCKET)
	@tmux list-sessions 2>/dev/null | grep overmind | cut -d: -f1 | xargs -r -n1 tmux kill-session -t 2>/dev/null || true

dev-status: ## Check if dev environment is running
	@if [ -S $(SOCKET) ] && overmind ps -s $(SOCKET) > /dev/null 2>&1; then \
		echo "running"; \
	else \
		echo "stopped"; \
	fi

dev-logs: ## Stream all logs (Ctrl+C to stop)
	overmind echo -s $(SOCKET)

dev-tail: ## Show last 100 lines of logs (non-blocking)
	@if [ -S $(SOCKET) ]; then \
		for pane in $$(tmux -S $(SOCKET) list-panes -a -F '#{pane_id}' 2>/dev/null); do \
			tmux -S $(SOCKET) capture-pane -p -t "$$pane" -S -100 2>/dev/null; \
		done; \
	else \
		echo "Dev environment not running"; \
	fi

dev-daemon-status: ## Show isolated dev daemon status
	$(DEV_CLI) daemon status

dev-cli: ## Run a todu command against the isolated dev config (usage: make dev-cli CMD="daemon status")
	@test -n "$(CMD)" || (echo "Usage: make dev-cli CMD=\"daemon status\"" && exit 1)
	$(DEV_CLI) $(CMD)

check: ## Run linting, type checking, and tests
	npm run lint && npm run typecheck && npm test

pre-pr: ## Run pre-PR checks
	./scripts/pre-pr.sh
