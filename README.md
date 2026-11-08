# Duck Cubicle

A live pixel-art office for your AI agents, where nobody is okay.

Same idea as [Cubicle](https://github.com/caglarutkuguler/cubicle) (MIT): a working agent sits at its desk and types, one that needs you raises a hand, a finished one wanders to the lounge, and an errored one's screen goes red. Duck Cubicle adds people.

## What the chaos does

- **Rage.** An error makes the agent slam the keyboard, steam, swear at the screen and sometimes throw a printout across the room.
- **Blame and arguments.** After an error the agent often blames a coworker. Two agents meet in the aisle, trade insults, then someone **spits** (and sometimes hits), **shoves**, threatens to call HR, storms off for a smoke, or makes up and goes for a beer.
- **Drinking.** Idle agents hit the bar (beer, whisky, wine or vodka, depending on the agent). They toast, burp, stumble, slur their bubbles, drop bottles and eventually pass out on the sofa. Thirsty agents take sneaky swigs at their desk while "working". Empties pile up on the desk.
- **Mess.** Spit, broken glass, spilled beer, paper balls and empty bottles stay on the floor for a while.
- **Gossip.** Idle agents whisper about each other, and sometimes the subject walks in.
- **Waiting.** An agent that waits for you too long starts yelling, then flips you off.
- A running **gossip log** on the right narrates all of it.

Everything is driven by real events (errors, waiting, finishing) plus a background layer of office life.

## Run it

```sh
node bin/duck-cubicle.js            # http://127.0.0.1:3300
node bin/duck-cubicle.js --help
```

No dependencies, Node 18+.

- **Try it without agents:** open `http://127.0.0.1:3300/?demo` (built-in actors), or run `npm run fake`: it starts the server plus six fake Claude Code sessions that send real hook events (errors, approvals, finishing), in a throwaway HOME so your own `~/.duck-cubicle` stays untouched. To feed fake sessions into a server you run yourself: `HOME=/some/dir node scripts/fake-hooks.js` with the server on the same HOME.
- **Claude Code:** `node bin/duck-cubicle.js install-hooks` adds hooks to `~/.claude/settings.json` (it backs the file up first and leaves your own hooks alone; `uninstall-hooks` removes only ours). Restart your Claude Code sessions. Each session is an agent named after its folder; subagents get their own desk. The hook only records session id, folder, status and a short tool summary in `~/.duck-cubicle/claude-code.json`, and never touches the network.
- **Any other agent system:** `--source FILE.json` or `--source http://…` with `{ "company": "…", "agents": [{ "id", "name", "role", "status", "task", "error" }] }`. Status is `running`, `waiting`, `idle`, `error` or `paused`.

## Hosted page (dc.ducksoft.ai)

The public site is just static files from `public/` (GitHub Pages, see `.github/workflows/pages.yml`). It holds no agent data. In your browser it reads your own feed from a local bridge on `http://127.0.0.1:3300`, so task text and folder names never leave your computer and nobody else can see them:

```sh
npm i -g github:DonPedroDado/duck-cubicle
duck-cubicle install-hooks && duck-cubicle      # restart your Claude Code sessions
```

Then open the site. The bridge only lets `https://dc.ducksoft.ai` read the feed (change with `--allow-origin`), and only your own browser can change saved appearance; on the hosted page, looks are saved in the browser. Chrome may ask to allow access to your local network, and Safari blocks http requests from https pages, so use Chrome, Edge or Firefox. A different bridge port: `?bridge=4000`.

## Settings (⚙)

- **Office mood:** 0 Calm, 1 Realistic, 2 Chaos (default), 3 Pub brawl.
- **Language:** Uncensored, Bleeped (`f***`, with an optional bleep sound), or Cartoon (`#@%!`). The default is Bleeped.
- Sound effects, frame rate, animation, cards and log toggles, office name and logo.
- **Start a fight** and **Happy hour** buttons.
- **Appearance:** click ✎ on an agent's card to change name, hair, hair colour, skin, shirt, trousers or skirt, shoes, glasses, beard, a photo head, and their personality: drink of choice, temper, thirst and whether they spit. Export and import everything as JSON.
- Zoom with the wheel or +/−, drag to pan, click an agent to follow them.

Appearance is saved in `~/.duck-cubicle/appearance.json` (only a browser on the same machine can change it), or in the browser if there is no server.

## Change what they say

All dialogue is in `public/lines.json`: insults, comebacks, causes of arguments, toasts, burps, gossip and so on. `{name}` is the person being talked to. The `bad` list is what the censor modes hide. Reload the page after editing.

## Files

```
bin/duck-cubicle.js        server (serves public/, /api/feed, /api/appearance)
bin/duck-cubicle-hook.js   Claude Code hook
bin/install-hooks.js       install / uninstall the hook
scripts/fake-hooks.js      fake Claude Code sessions for demos
scripts/demo.js            server + fake sessions in a throwaway HOME (npm run fake)
public/index.html          page and styles
public/lines.json          everything they say
public/js/core.js          layout, walking routes, censor, log, sound
public/js/art.js           all pixel drawing (no image assets)
public/js/chaos.js         moods, the director, the scenes
public/js/app.js           feed, sprites, render loop, labels, cards, settings, appearance editor
```

MIT. Not affiliated with Cubicle, Paperclip or Anthropic.
