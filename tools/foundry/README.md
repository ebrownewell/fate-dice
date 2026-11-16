# Local dev Foundry server

Browser-driven tests and fixture recording run against a local, licensed Foundry v13 server.
None of this ships with the module, and CI can't run it (it needs a license).

## One-time setup (macOS)

1. Download the **Node.js** build of Foundry v13 from foundryvtt.com (Purchased Licenses).
2. Unzip it to `~/foundry/v13`, then clear the download quarantine so macOS will load its native
   libraries: `xattr -dr com.apple.quarantine ~/foundry/v13`
3. Foundry 13 needs Node 20 to 22: `nvm install 22` and `echo 22 > ~/foundry/.nvmrc`.
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
8. `npm run foundry:setup`: enables the modules, creates a **Test GM** account for automation, and
   creates Players A, B and C with characters (20 HP, a longsword). The first run joins as
   Gamemaster to create Test GM, so make sure nobody is logged in as Gamemaster then.

The tests log in as **Test GM**, so you can stay logged in as Gamemaster while they run (the
"no GM connected" test skips itself if you are). Don't use the Player A/B/C accounts while tests run.

### Other systems

The same server has pf2e 7.12.2 (the last release for Foundry v13) and pf1 11.11 installed, with
worlds `fate-dice-pf2e` and `fate-dice-pf1`. Only one world runs at a time:

```sh
~/foundry/start.sh --world=fate-dice-pf2e   # then: npm run foundry:setup (first time)
npm run test:foundry                        # tests for other systems skip themselves
node tools/foundry/record-fixtures.js       # records fixtures for the running world's system
```

`npm run foundry:setup` also turns off pf2e's roll dialogs for the test users. Run each world's
tests after changing shared code. The first browser to load a freshly launched world is slow.

## Day to day

```sh
~/foundry/start.sh --world=fate-dice-dev   # start the server
npm run test:foundry                      # Quench batches + multi-client browser tests
node tools/foundry/record-fixtures.js     # re-record dnd5e chat-message fixtures (after a dnd5e update)
```

Set `FOUNDRY_URL` to point the tools at a different server.

## Foundry v14

The v14 line (`main`) has its own server so the two never share worlds:

- Foundry 14.370 in `~/foundry/v14`, data in `~/foundry/dev-data-v14`, started with
  `~/foundry/start-v14.sh --world=fate-dice-dnd5e` (or `fate-dice-pf2e`) on port 30002.
- It needs Node 24 (`nvm install 24`).
- Systems: dnd5e 6.1.0 and pf2e 8.7.0. pf1e doesn't support v14 yet.
- New worlds are made on the `/create` page in v14, not the old setup form.
- Point the tools at it with `FOUNDRY_URL=http://localhost:30002`, e.g.
  `FOUNDRY_URL=http://localhost:30002 npm run test:foundry`.

The v13 server loads the `foundry-v13` branch from a separate checkout (`../fate-dice-v13`, a git
worktree), so both lines can be tested at once.
