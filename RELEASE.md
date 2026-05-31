# Release checklist

## Before publish

1. Update version in `package.json` and `CHANGELOG.md`.
2. `npm run build` — clean compile, no stale `dist/` artifacts.
3. `npm pack --dry-run` — confirm tarball contains `dist/`, `README.md`, `LICENSE`, `CHANGELOG.md`.
4. Smoke test: `npm run example` and `send` / tool invocation.

## Publish to npm

Scoped package requires the `@agentio` org (or change `name` in `package.json`).

```bash
npm login
npm publish --access public
```

Dry run without publishing:

```bash
npm pack
# inspect agentio-core-<version>.tgz
```

## Git tag (optional)

```bash
git tag v0.1.0
git push origin v0.1.0
```

Update `CHANGELOG.md` link and `package.json` `repository` URL to match your remote.
