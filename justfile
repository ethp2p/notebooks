default:
    @just --list

install:
    bun install

fetch date="":
    bun run --cwd observatory fetch {{ if date == "" { "" } else { "--date " + date } }}

manifest:
    bun run --cwd observatory manifest

dev:
    bun run --cwd site dev

build:
    just manifest && bun run --cwd site build

typecheck:
    bun run --cwd site typecheck && bun run --cwd observatory typecheck

lint:
    bun run --cwd site lint

test:
    bun run --cwd site test && bun run --cwd observatory test

test-e2e:
    bun run --cwd site test:e2e

verify:
    just typecheck && just lint && just test

upload:
    bun run --cwd observatory upload

clean:
    rm -rf build site/dist
