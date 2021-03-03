# meant to be used for development, not production
main:
	@echo 'Please pick a valid target: build|rebuild|shell'

build:
	docker build \
		--file Dockerfile.development \
		--tag 'gds-clusterconfig-to-sumologic-sync:latest' \
		.

rebuild:
	docker build \
		--no-cache \
		--file Dockerfile.development \
		--tag 'gds-clusterconfig-to-sumologic-sync:latest' \
		.

shell: build
	docker run \
		--interactive \
		--tty \
		--rm \
		--entrypoint "/bin/bash" \
		--env-file ".dev/env.sample" \
		--env "SUMOLOGIC_ACCESS_ID" \
		--env "SUMOLOGIC_ACCESS_KEY" \
		--workdir "/github/workspace" \
		--name "sample_action" \
		--mount "type=bind,source=$(shell pwd)/entrypoint.sh,target=/app/entrypoint.sh,readonly" \
		--mount "type=bind,source=$(shell pwd)/uploader,target=/app/uploader,readonly" \
		--mount "type=bind,source=$(shell pwd)/.dev/workdir,target=/github/workspace,readonly" \
		"gds-clusterconfig-to-sumologic-sync:latest"

.PHONY: main build rebuild shell

