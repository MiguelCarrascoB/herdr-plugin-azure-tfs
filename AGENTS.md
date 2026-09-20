# Agent notes

- Use conventional commit messages (`feat:`, `fix:`, `docs:`, `chore:`, `test:`).
- Keep the plugin zero-dependency: Node standard library only.
- Never commit secrets; TFS credentials live in `$HERDR_PLUGIN_CONFIG_DIR/.env`.
- Treat `herdr-plugin.toml` as a contract: unique dot-free ids, commands as
  argv arrays, link-handler patterns as Rust regexes.
