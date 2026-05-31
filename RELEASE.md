# Release checklist

Package name: **`@dvrosalesm/agentio`** (scoped to npm user/org `dvrosalesm`).

## One-time npm setup

### 1. Scope

- The package publishes under **`@dvrosalesm`**. If your npm username is `dvrosalesm`, no separate org is required — your user scope is created on first publish.
- If CI uses a different npm account, that account must be `dvrosalesm` or a member of the `@dvrosalesm` org with publish rights.

### 2. Choose authentication (pick one)

**Option A — Trusted publishing (recommended)**

1. After the first manual publish (or create the package on npm), open **@dvrosalesm/agentio** → **Settings** → **Trusted publishing**.
2. Add a publisher:
   - Provider: GitHub Actions
   - Repository: `dvrosalesm/agentio` (or your fork)
   - Workflow file: `publish.yml`
3. OIDC provenance uses `id-token: write` in the workflow; `NPM_TOKEN` is optional when trusted publishing is set up.

**Option B — Automation token**

1. npm → **Access Tokens** → **Generate New Token** → type **Automation** (for CI).
2. GitHub → **Settings → Secrets and variables → Actions** → `NPM_TOKEN` (must belong to `dvrosalesm` or an org member who can publish).
3. The [publish workflow](.github/workflows/publish.yml) uses this secret.

### 3. Align `package.json` metadata

- `version` matches the git tag / GitHub release (e.g. tag `v0.1.0` → version `0.1.0`).
- `repository`, `bugs`, and `homepage` URLs match your GitHub remote.

## Before each release

1. Update `version` in `package.json` and add a section to `CHANGELOG.md`.
2. Run locally:
   ```bash
   npm run build
   npm run pack:check
   npm run example
   ```
3. Commit, tag, and push:
   ```bash
   git tag v0.1.0
   git push origin main
   git push origin v0.1.0
   ```

## Publish to npm

### Automated (GitHub Release)

1. GitHub: **Releases → Draft a new release** → tag `v0.1.0` → **Publish release**.
2. **Publish to npm** runs `npm publish --provenance --access public`.

Manual trigger: **Actions → Publish to npm → Run workflow**.

### Manual (local)

```bash
npm login   # as dvrosalesm
npm publish --access public
```

Dry run:

```bash
npm run pack:check
# tarball: dvrosalesm-agentio-<version>.tgz
```

## What gets published

The `files` field in `package.json` limits the tarball to:

- `dist/` (built on `prepack` / `prepublishOnly`)
- `README.md`, `LICENSE`, `CHANGELOG.md`

`src/`, `examples/`, and tests are not included. `dist/` is gitignored but built before pack/publish.

## Troubleshooting

### `E404` on publish

- **`npm whoami`** in CI must be `dvrosalesm` (or a user with publish access to `@dvrosalesm`).
- **Trusted publishing** must be configured on `@dvrosalesm/agentio` for the same GitHub repo/workflow.
- Re-run the workflow after fixing auth (no version bump if `0.1.0` never published).

### Other errors

| Error | Fix |
|-------|-----|
| `402 Payment Required` | Use `publishConfig.access: public` or `npm publish --access public`. |
| Version already exists | Bump `version` in `package.json`. |
| `NPM_TOKEN` missing in CI | Add secret or use trusted publishing. |
