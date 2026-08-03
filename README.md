# @blyou/whatwg-url

a zero-dependency, WHATWG URL & URLSearchParams implementation for DOM-less ES2023 environments.

## Testing

### Unit tests

```sh
pnpm test
```

### Web Platform Tests (WPT)

This project integrates the official [web-platform-tests](https://github.com/web-platform-tests/wpt) URL test suite to verify spec compliance.

WPT test data is **not** committed to this repository. Instead, a lightweight script downloads only the 4 required JSON data files from the WPT repository on demand:

```sh
# Download WPT URL test data (urltestdata, setters, percent-encoding, toascii)
pnpm fetch:wpt

# Run WPT tests against the built dist (builds first, then tests)
pnpm test:wpt
```

`test:wpt` chains `fetch:wpt` → `build` → `vitest run tests/wpt-tests`, so it is fully self-contained.

The downloaded files land in `tests/wpt-resources/` (git-ignored). To upgrade the test data, update the `WPT_REF` constant in `scripts/fetch-wpt-resources.mjs` and re-run `pnpm fetch:wpt`.
