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
