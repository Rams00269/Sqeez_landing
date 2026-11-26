# Mascot

A lemon with eyes that opens a chat. The chat pours out of the lemon on a spring and is sucked back in on close.
`mascot.js` and `mascot.css` know nothing about any page. All page knowledge lives in a skills file (`skills/squeez.js`).

```
assets/mascot/
  mascot.css          look and feel, every class prefixed mx-, themed with --mx-* tokens
  mascot.js           lemon, spring morph, chat engine, plug-in points   (window.Mascot)
  skills/squeez.js    everything Squeez-specific: tools, skills, answers
```

## Drop it into a page

```html
<link rel="stylesheet" href="assets/mascot/mascot.css">
<script src="assets/mascot/mascot.js"></script>
<script src="assets/mascot/skills/squeez.js"></script>   <!-- or your own skills file -->
<script>
  Mascot.init({ name: 'Squizzle', tagline: 'Your Squeez guide.', chips: ['Run the demo', 'Give me a tour'] });
</script>
```

## Rename it

Change `name` in `Mascot.init`. The header, greeting, labels and the "who are you" answer all read from it.

## Config

| Option | What it does |
|---|---|
| `name`, `tagline`, `greeting`, `placeholder`, `fallback` | Copy. `{name}` works inside `greeting`. |
| `chips` | Quick-reply buttons shown after replies. |
| `tips`, `tipDelay`, `tipEvery` | Nudges above the lemon while the chat is closed. |
| `side` | `'right'` (default) or `'left'`. |
| `motion` | `{ isOn(), set(on) }` shows a Pause motion button and lets skills pause the page. |
| `brain` | Async function used when no skill matches. See below. |
| `onEvent(name, data)` | Analytics: `open`, `close`, `message`, `skill`, `tool`, `brain`, `fallback`. |
| `host` | Anything you want skills to reach as `ctx.host`. |

## Resize and re-theme (CSS only)

```css
.mx { --mx-size: 140px; --mx-w: 440px; --mx-h: 640px;      /* sizes */
      --mx-body: #7bd389; --mx-accent: #6d28d9; }           /* colours: --mx-body, --mx-paper, --mx-head, --mx-ink ... */
```

## Teach it something

A **tool** is something it can do. A **skill** is something it understands and routes to tools.

```js
Mascot.tool('openPricing', (args, ctx) => { location.hash = '#pricing'; });

Mascot.use({
  id: 'pricing',
  priority: 70,                       // higher runs first
  match: /pricing|how much/,          // RegExp, or (ctx) => truthy
  run: async (ctx) => {
    await ctx.tool('openPricing');
    await ctx.say('Here is the pricing.', { mood: 'happy' });
    ctx.chips(ctx.defaults);
  }
});

Mascot.knowledge([{ re: /refund/, text: 'Refunds go back to the original card.', go: 'how' }]);
```

`ctx` gives you: `say`, `act` (a small "did this" line), `chips`, `mood`, `sleep`, `tool`, `alive()` (false once the user sends a new message, use it to stop long sequences), `setFlow` / `endFlow` (multi-turn questions), `history`, `name`, `host`.

## Connect a real model

Without a `brain`, unmatched messages get the `fallback` line. To hand them to an LLM, point the mascot at a server you control:

```js
Mascot.init({ brain: Mascot.brains.http('/api/mascot') });
```

The server receives `{ message, history, tools, page }` and replies with:

```json
{ "reply": "Moved your floor to $15.", "chips": ["Run the demo"], "actions": [{ "tool": "setRules", "args": { "floor": 15, "auto": 30, "offer": 20 } }] }
```

`actions` run in order through the registered tools, so the model can drive the page the same way the skills do.
Keep the model's API key on the server. Never put it in the page.

## Accessibility

Real buttons and a labelled dialog, focus moves into the chat on open and back to the lemon on close (Esc closes), live region for replies, and `prefers-reduced-motion` turns the spring and animations off.
