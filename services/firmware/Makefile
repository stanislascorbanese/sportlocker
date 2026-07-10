# SportLocker firmware — raccourcis de dev.
# Usage : make <cible>   (voir `make help`)

VENV ?= .venv
PY   := $(VENV)/bin/python
PIP  := $(VENV)/bin/pip

# Paramètres du mock local, surchargeables :
#   make demo DEMO_LOCKER=locker-3 ARGS="--slot-start-in 3600"
DEMO_SECRET ?= dev-secret-min-32-chars-xxxxxxxxxx
DEMO_DEVICE ?= dist-demo-001
DEMO_LOCKER ?= locker-demo-1
ARGS        ?=

.DEFAULT_GOAL := help
.PHONY: help install test lint typecheck check demo demo-replay demo-offline

help:  ## Affiche cette aide
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | \
	  awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

install:  ## Crée le venv et installe le package en mode dev
	python3.11 -m venv $(VENV) || python3 -m venv $(VENV)
	$(PIP) install -e ".[dev]" -q

test:  ## Suite pytest + couverture (cible >= 80%)
	$(PY) -m pytest tests/ --cov=src/sportlocker_firmware --cov-report=term-missing --cov-fail-under=80

lint:  ## Lint ruff
	$(VENV)/bin/ruff check src tests

typecheck:  ## Types mypy (strict)
	$(VENV)/bin/mypy src

check: lint typecheck test  ## lint + types + tests

demo:  ## Mock local QR->JWT->GPIO (sans Pi ni broker). ex: make demo ARGS="--offline"
	$(PY) -m sportlocker_firmware.tools.local_scan \
	  --secret "$(DEMO_SECRET)" --device "$(DEMO_DEVICE)" --locker "$(DEMO_LOCKER)" $(ARGS)

demo-replay:  ## Démo : rejoue le même QR -> anti-replay bloque le 2e scan
	@$(MAKE) demo ARGS="--replay"

demo-offline:  ## Démo : broker down + pas de cache -> refus (cache_miss_offline)
	@$(MAKE) demo ARGS="--offline --no-cache"
