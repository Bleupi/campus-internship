// CI-only tools, built from source by the lint-workflows job in
// .github/workflows/pr-validation.yml (ADR-0035). go.sum pins each module's
// hash, checked against Go's public checksum database; Dependabot's gomod
// ecosystem proposes version updates. Not part of the pnpm workspace.
module campus-internship/ci-tools

go 1.26

tool github.com/rhysd/actionlint/cmd/actionlint

require (
	github.com/bmatcuk/doublestar/v4 v4.10.0 // indirect
	github.com/clipperhouse/uax29/v2 v2.7.0 // indirect
	github.com/fatih/color v1.19.0 // indirect
	github.com/mattn/go-colorable v0.1.14 // indirect
	github.com/mattn/go-isatty v0.0.20 // indirect
	github.com/mattn/go-runewidth v0.0.21 // indirect
	github.com/mattn/go-shellwords v1.0.12 // indirect
	github.com/rhysd/actionlint v1.7.12 // indirect
	github.com/robfig/cron/v3 v3.0.1 // indirect
	go.yaml.in/yaml/v4 v4.0.0-rc.3 // indirect
	golang.org/x/sync v0.20.0 // indirect
	golang.org/x/sys v0.42.0 // indirect
)
