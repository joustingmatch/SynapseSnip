# SynapseSnip Agent Rules

These rules apply to any AI/LLM making changes in this repository.

## Core Workflow (Required)

1. Make the requested code changes.
2. Run verification:
   - `npm run build`
   - If tests were touched: `npm test`
3. If the change is intended to be shipped, bump patch version in all three files to the same value:
   - `package.json`
   - `ssnip-core/tauri.conf.json`
   - `ssnip-core/Cargo.toml`
4. Commit and push:
   - `git add -A`
   - `git commit -m "<clear message>"`
   - `git push`

## Versioning Rule

- Never bump only one version file.
- Always keep all three versions identical.
- Use patch bumps by default (`x.y.Z`).

## Safety Rules

- Do not delete or rewrite unrelated files.
- Do not commit `node_modules`, `dist`, or `ssnip-core/target`.
- Respect `.gitignore`.

## Update Banner Context

The in-app update banner appears when a newly installed app version differs from the last seen version.
`git push` alone does not trigger it.