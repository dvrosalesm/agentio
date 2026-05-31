# Release checklist

## One-time npm setup

### 1. Create the scoped package on npm

- Sign in at [npmjs.com](https://www.npmjs.com/).
- Create or join the **`@agentio`** organization (required for `@agentio/core`).
- Ensure your account can publish to that scope.

### 2. Choose authentication (pick one)

**Option A — Trusted publishing (recommended)**

1. Open **@agentio/core** on npm → **Settings** → **Trusted publishing**.
2. Add a publisher:
   - Provider: GitHub Actions
   - Repository: your GitHub repo (e.g. `dvrosalesm/agentio` or `agentio-hq/agentio`)
   - Workflow file: `publish.yml`
   - Environment: (leave empty unless you use GitHub Environments)
3. You do **not** need `NPM_TOKEN` in GitHub when this is configured; provenance is signed via OIDC (`id-token: write` in the workflow).

**Option B — Automation token**

1. npm → **Access Tokens** → **Generate New Token** → type **Automation** (for CI).
2. In GitHub: **Settings → Secrets and variables → Actions** → add `NPM_TOKEN` with that value.
3. The [publish workflow](.github/workflows/publish.yml) uses this secret.

### 3. Align `package.json` metadata

- `version` matches the git tag / GitHub release (e.g. tag `v0.1.0` → version `0.1.0`).
- `repository`, `bugs`, and `homepage` URLs match your real GitHub remote.

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

1. On GitHub: **Releases → Draft a new release** → choose tag `v0.1.0` → **Publish release**.
2. The **Publish to npm** workflow runs on `release: published` and runs `npm publish --provenance --access public`.

You can also trigger it manually: **Actions → Publish to npm → Run workflow**.

### Manual (local)

```bash
npm login
npm publish --access public
```

Dry run without publishing:

```bash
npm run pack:check
# or: npm pack && tar -tzf agentio-core-*.tgz
```

## What gets published

The `files` field in `package.json` limits the tarball to:

- `dist/` (built on `prepack` / `prepublishOnly`)
- `README.md`, `LICENSE`, `CHANGELOG.md`

`src/`, `examples/`, and tests are not included. `dist/` is gitignored but built before pack/publish.

## Troubleshooting

| Error | Fix |
|-------|-----|
| `402 Payment Required` / scope access | Use `publishConfig.access: public` or `npm publish --access public`. |
| `403 Forbidden` on `@agentio` | Join the org or publish under a scope you own (change `name` in `package.json`). |
| Version already exists | Bump `version` in `package.json`; npm does not allow republishing the same version. |
| `NPM_TOKEN` missing in CI | Add the secret or switch to trusted publishing (Option A). |
