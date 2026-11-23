// Normal builds use app.json unchanged. The app's browser tests (mobile/e2e) build a web copy that talks to a
// throw-away local server; they pass its address in PRANGAN_APP_E2E_API. Nothing else sets that variable.
module.exports = ({ config }) => (process.env.PRANGAN_APP_E2E_API
  ? { ...config, extra: { ...config.extra, apiUrl: process.env.PRANGAN_APP_E2E_API } }
  : config);
