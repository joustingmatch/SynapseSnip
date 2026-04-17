# AGENT OPERATING RULES (SynapseSnip)

Read this file first. Follow it exactly.

## Non-Negotiable Workflow

1. Implement the requested change.
2. Verify:
   - `npm run build`
   - Run `npm test` if tests or core logic changed.
3. For any shipped change, bump patch version in all 3 files to the SAME value:
   - `package.json`
   - `ssnip-core/tauri.conf.json`
   - `ssnip-core/Cargo.toml`
4. Commit and push:
   - `git add -A`
   - `git commit -m "<clear message>"`
   - `git push`

## Autonomy (Do Not Ask)

- Do not ask whether to run the workflow above.
- Execute end-to-end by default.
- Only ask when blocked by missing credentials, missing access, or unknown required target.
- Exception: ask before triggering the GitHub release workflow because it is slow.

## Safety Guardrails

- Never run destructive git/file commands unless explicitly requested:
  - `git reset --hard`
  - `git checkout -- <file>`
  - `git clean -fd`
  - `git push --force`
- Never delete or rewrite unrelated files.
- Respect `.gitignore`.
- Never commit build/vendor artifacts:
  - `node_modules/`
  - `dist/`
  - `ssnip-core/target/`
- Before committing, run `git status --short` and ensure only intended files are staged.
- If unexpected changes are present, stop and report them.
- Do not create or restore `ssnip-docs/` or design-doc files unless the user explicitly requests docs.
- Prefer code/config changes over documentation churn.

## Versioning Rules

- Keep version values identical across all 3 required files.
- Default to patch bumps (`x.y.Z`).
- Never bump only one version file.

## Update Banner Reality Check

- `git push` alone does NOT trigger in-app update notice.
- Notice appears only after a newer built version is installed and launched.

## Release Workflow Rule (Ask First)

- Before running release workflow, ask: `Run release workflow now? (takes ~10-25 min)`.
- Release workflow is manual-only via `workflow_dispatch`.
- Do not run release workflow unless user says yes.

## Release Workflow Steps (For Simple LLMs)

Use these exact steps:

1. Confirm clean state:
   - `git status --short`
2. Ensure version bump exists in all 3 files:
   - `package.json`
   - `ssnip-core/tauri.conf.json`
   - `ssnip-core/Cargo.toml`
3. Verify build:
   - `npm run build`
4. Commit and push:
   - `git add -A`
   - `git commit -m "chore(release): bump version to x.y.z"`
   - `git push`
5. Ask user if release workflow should run now.
6. If user says yes, trigger and report link:
   - `gh workflow run release.yml`
   - `gh run list --workflow release.yml --limit 1`
7. Tell user to wait for green status, then install latest GitHub Release build.
