# Local dev Foundry server

Browser-driven tests and fixture recording run against a local, licensed Foundry v13 server.
None of this ships with the module, and CI can't run it (it needs a license).

## One-time setup (macOS)

1. Download the **Node.js** build of Foundry v13 from foundryvtt.com → Purchased Licenses.
2. Unzip it to `~/foundry/v13`, then clear the download quarantine so macOS will load its native
   libraries: `xattr -dr com.apple.quarantine ~/foundry/v13`
3. Foundry 13 needs Node 20–22: `nvm install 22` and `echo 22 > ~/foundry/.nvmrc`.
4. Install into `~/foundry/dev-data/Data`:
   - `systems/dnd5e`: dnd5e 5.3.3 (`gh release download release-5.3.3 -R foundryvtt/dnd5e`)
   - `modules/quench`: Quench (`gh release download v0.10.0 -R Ethaks/FVTT-Quench`, use `dist/`)
   - `modules/fate-dice`: a symlink to this repo
5. Create `~/foundry/start.sh`:

   ```sh
   #!/usr/bin/env bash
   set -euo pipefail
   export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"
   cd "$(dirname "$0")"; nvm use --silent
   exec node v13/main.js --dataPath="$HOME/foundry/dev-data" --port=30001 --noupnp --noupdate "$@"
   ```

6. Run `~/foundry/start.sh`, open http://localhost:30001, enter your license key and accept the EULA.
7. Create the world `fate-dice-dev` (dnd5e) and restart with `~/foundry/start.sh --world=fate-dice-dev`.
8. `npm run foundry:setup`: enables the modules and creates Player A / Player B with characters.

## Day to day

```sh
~/foundry/start.sh --world=fate-dice-dev   # start the server
npm run test:foundry                      # Quench batches + multi-client browser tests
node tools/foundry/record-fixtures.js     # re-record dnd5e chat-message fixtures (after a dnd5e update)
```

Set `FOUNDRY_URL` to point the tools at a different server.
