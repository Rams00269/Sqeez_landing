/* Squeez skills for the Mascot. Everything Squeez-specific lives here, so mascot.js stays reusable.
 * To teach the mascot something new: add an entry to SKILLS (it understands) and, if it needs to act on the page, a tool (it does).
 * The page exposes window.SqueezPage (demo loop, rules dial, motion). The numbers and answers come from the Squeez requirement documents. */
(function () {
  'use strict';
  var M = window.Mascot, page = window.SqueezPage;
  if (!M || !page) return;

  /* ------------------------------------------------------------ tools: what the mascot can DO */
  var SECTIONS = {
    top:    { sel: '#top',     label: 'the top' },
    how:    { sel: '#how',     label: 'How it works' },
    rules:  { sel: '#control', label: 'Your rules' },
    where:  { sel: '#where',   label: 'Where guests book' },
    around: { sel: '.around',  label: 'The rest of the job' },
    talk:   { sel: '#talk',    label: 'the walkthrough section' }
  };

  M.tool('goto', async function (a, ctx) {                       /* { key } */
    var S = SECTIONS[a.key]; if (!S) return;
    var node = document.querySelector(S.sel);
    if (a.key === 'top') window.scrollTo({ top: 0, behavior: ctx.isCalm() ? 'auto' : 'smooth' });
    else { M.scrollTo(node); M.highlight(node.querySelector('h2') || node); }
    ctx.act('Scrolled to ' + S.label);
    await ctx.sleep(900);
  });
  M.tool('setRules', function (a) { return page.setRules(a.floor, a.auto, a.offer); });       /* { floor, auto, offer } */
  M.tool('restartDemo', function () { page.restart(); });
  M.tool('approve', function () { return page.approve(); });
  M.tool('confetti', async function (a, ctx) {
    for (var i = 0; i < 8; i++) { page.popAt(innerWidth * (.1 + Math.random() * .8), innerHeight * (.15 + Math.random() * .6), 14); await ctx.sleep(160); }
  });

  /* ------------------------------------------------------------ helpers */
  function parseRules(l) {
    var p = { f: null, a: null, o: null }, m;
    if ((m = l.match(/(?:floor|minimum|min)\D{0,18}?(\d{1,3})/))) p.f = +m[1];
    if ((m = l.match(/(?:auto[- ]?approv\w*|automatic\w*|auto)\D{0,18}?(\d{1,3})/))) p.a = +m[1];
    if ((m = l.match(/(?:guest offers?|offers?|bids?|offering)\D{0,12}?(\d{1,3})/))) p.o = +m[1];
    return p;
  }
  var NAV = [
    [/\b(top|hero|start of|beginning)\b/, 'top'], [/\bhow\b/, 'how'], [/\b(rules|dial|control)\b/, 'rules'],
    [/\b(where|surface|channel)\b/, 'where'], [/\b(around|features?|rest)\b/, 'around'], [/\b(contact|talk|bottom|end|footer)\b/, 'talk']
  ];

  /* ------------------------------------------------------------ skills: what the mascot UNDERSTANDS (higher priority runs first) */
  var SKILLS = [
    { id: 'stop', priority: 100, match: /^(stop|cancel|end|quit)( the)? tour|stop talking|^stop$|^enough$/,
      run: async function (ctx) { await ctx.say('Stopped. What next?', { fast: true }); ctx.chips(ctx.defaults); } },

    { id: 'rules', priority: 95,
      match: function (ctx) { var p = parseRules(ctx.lower); return p.f != null || p.a != null || p.o != null; },
      run: async function (ctx) {
        var p = parseRules(ctx.lower);
        await ctx.tool('goto', { key: 'rules' });
        var c = page.rules(), notes = [];
        var cl = function (v) { if (v > 40) { notes.push('The dial stops at $40.'); return 40; } return v; };
        var f = cl(p.f == null ? c.f : p.f), a = cl(p.a == null ? c.a : p.a), o = cl(p.o == null ? c.o : p.o);
        if (f > a) {
          if (p.a == null) { a = f; notes.push('I moved auto-approve up to match your floor.'); }
          else if (p.f == null) { f = a; notes.push('I moved your floor down to match auto-approve.'); }
          else { a = f; notes.push('Auto-approve cannot sit below the floor, so I made them equal.'); }
        }
        var parts = [];
        if (f !== c.f) parts.push('floor $' + f); if (a !== c.a) parts.push('auto-approve $' + a); if (o !== c.o) parts.push('guest offer $' + o);
        ctx.act(parts.length ? 'Set ' + parts.join(', ') : 'Left the dial as it was');
        await ctx.tool('setRules', { floor: f, auto: a, offer: o });
        await ctx.say(page.verdict() + (notes.length ? ' ' + notes.join(' ') : ''), { mood: 'happy' });
        ctx.chips(['Set floor to 5', 'Guest offers 35', 'Auto-approve at 12', 'Give me a tour']);
      } },

    { id: 'motion-off', priority: 90,
      match: /(pause|stop|freeze|turn off|calm|quiet|reduce)\b.*\b(motion|animations?|anim|moving|movement)|calm mode|too much motion/,
      run: async function (ctx) { await ctx.tool('motion', { on: false }); await ctx.say('Paused. The page and I are holding still. Say resume when you want it back.'); ctx.chips(ctx.defaults); } },

    { id: 'motion-on', priority: 89,
      match: /(resume|unpause|turn on|start|play|bring back|enable)\b.*\b(motion|animations?|anim)/,
      run: async function (ctx) { await ctx.tool('motion', { on: true }); await ctx.say('Motion is back. Everything is moving again.'); ctx.chips(ctx.defaults); } },

    { id: 'tour', priority: 85, match: /\btour\b|show me around|walk me through the page|guide me/,
      run: async function (ctx) {
        await ctx.say('Quick tour. Say stop any time.', { fast: true });
        var steps = [
          ['top', null, 'This is the problem. A tee time nobody books is worth nothing once it plays. Watch the sheet: offers keep arriving and rules decide what happens.'],
          ['how', null, 'Guests bid into windows you open, never into your live tee sheet. You say yes, or your rules do.'],
          ['rules', function () { return ctx.tool('setRules', { floor: 10, auto: 24, offer: 17 }); }, 'I set your floor to $10 and auto-approve at $24. A $17 offer lands in the middle, so it waits for your yes. Try the sliders yourself.'],
          ['where', null, 'One set of rules. Your own page, loyalty programme sites, the Squeez apps and your concierge all follow it.'],
          ['around', null, 'And the rest of the job: waitlist, split the cost, no-show fees, a chatbot, one list of transactions, and yield suggestions.'],
          ['talk', null, 'That is the tour. Want a walkthrough on your own tee sheet?']
        ];
        for (var i = 0; i < steps.length; i++) {
          if (!ctx.alive()) return;
          await ctx.tool('goto', { key: steps[i][0] });
          if (steps[i][1]) await steps[i][1]();
          if (!ctx.alive()) return;
          await ctx.say(steps[i][2]); await ctx.sleep(700);
        }
        ctx.chips(['Book a walkthrough', 'Run the demo', 'Try my own rules']);
      } },

    { id: 'approve', priority: 80, match: /\b(approve|accept)\b/,
      run: async function (ctx) {
        await ctx.tool('goto', { key: 'top' });
        var r = await ctx.tool('approve');
        if (r === 'filled') { ctx.act('Approved the 4:10 offer'); await ctx.say('Done. The 4:10 time is booked and the guest has been told.', { mood: 'happy' }); }
        else if (r === 'done') await ctx.say('That one is already settled. The next offer arrives in a few seconds.');
        else if (r === 'auto') await ctx.say('That offer is above your auto-approve line, so your rules already said yes. Nothing for me to do.');
        else if (r === 'wait') await ctx.say('That offer is below your floor, so it went to the waitlist. Nothing to approve.');
        else await ctx.say('No offer is waiting right now. One arrives every few seconds, so ask me again in a moment.');
        ctx.chips(ctx.defaults);
      } },

    { id: 'walkthrough', priority: 75, match: /walkthrough|book (a|me)|schedule|talk to (a |someone|sales|the team)|contact|get started|sign ?up|demo call/,
      run: async function (ctx) {
        var step = 0, d = {};
        ctx.setFlow(async function (c) {
          var t = c.text;
          if (step === 0) { d.name = t.slice(0, 60); step = 1; await c.say('Nice to meet you, ' + d.name + '. Which venue is this for?'); return; }
          if (step === 1) { d.venue = t.slice(0, 80); step = 2; await c.say('And the best email for the walkthrough?'); return; }
          if (!/^\S+@\S+\.\S+$/.test(t)) { await c.say('That does not look like an email. Try name@venue.com, or say cancel.'); return; }
          c.endFlow(); await c.tool('goto', { key: 'talk' });
          await c.say('Thanks, ' + d.name + '. I have ' + d.venue + ' and ' + t + '. This page is not connected to a calendar yet, so I have not sent anything. Finish on the booking page and mention ' + d.venue + '.',
            { mood: 'happy', link: { label: 'Open the booking page', href: 'https://trysqueez.com' } });
          c.chips(c.defaults);
        });
        await ctx.say('Happy to. I need three things: your name, your venue and an email. What should I call you?');
      } },

    { id: 'demo', priority: 70, match: /\bdemo\b|tee sheet|live sheet|replay|restart/,
      run: async function (ctx) {
        await ctx.tool('goto', { key: 'top' }); await ctx.tool('restartDemo'); ctx.act('Restarted the live demo');
        await ctx.say('Watch the 4:10 row. Offers keep arriving and your rules decide. Some wait for a yes, some are approved for you, some go to the waitlist. Say approve and I will say yes for you.', { mood: 'wow' });
        ctx.chips(['Approve it', 'Try my own rules', 'Give me a tour']);
      } },

    { id: 'what-is-squeez', priority: 65,
      match: /how (does|do|it|squeez)\b.*work|how it works|explain (it|squeez)|what is squeez|what does squeez|what's squeez|what squeez/,
      run: async function (ctx) {
        await ctx.tool('goto', { key: 'how' });
        await ctx.say('Squeez helps a venue sell time that would otherwise go unused. Guests name a price on top of the green fee for a window you open. You approve it, or your rules do. Live tee times are never shown to guests.');
        ctx.chips(ctx.defaults);
      } },

    { id: 'rules-intro', priority: 60, match: /(my own rules|the dial|slider|try .*rules)/,
      run: async function (ctx) {
        await ctx.tool('goto', { key: 'rules' }); await ctx.tool('setRules', { floor: 10, auto: 24, offer: 17 });
        await ctx.say('This is your control panel. Tell me numbers and I will move the sliders, for example: set floor to 15, auto-approve at 30, guest offers 20.');
        ctx.chips(['Set floor to 15', 'Auto-approve at 30', 'Guest offers 8']);
      } },

    { id: 'navigate', priority: 55, match: /\b(go|take me|jump|scroll|show|open|head)\b/,
      run: async function (ctx) {
        for (var i = 0; i < NAV.length; i++) if (NAV[i][0].test(ctx.lower)) { await ctx.tool('goto', { key: NAV[i][1] }); await ctx.say('There you go.', { fast: true }); ctx.chips(ctx.defaults); return; }
        await ctx.say('I can jump to: the top, how it works, your rules, where guests book, the rest of the job, or the walkthrough section. Which one?');
        ctx.chips(['Take me to how it works', 'Take me to your rules', 'Take me to the walkthrough']);
      } },

    { id: 'celebrate', priority: 50, match: /celebrate|confetti|surprise|party|fireworks|something fun/,
      run: async function (ctx) {
        ctx.mood('happy'); await ctx.tool('confetti'); ctx.act('Threw a little confetti');
        await ctx.say('Squeezed. Every tee time you fill is one you would have lost. Want to see how it works?', { mood: 'happy' }); ctx.chips(ctx.defaults);
      } },

    { id: 'about-me', priority: 45, match: function (ctx) { return /joke|lemon|who are you|your name|squeezed/.test(ctx.lower) || ctx.lower.replace(/[^a-z0-9 ]/g, '').trim() === ctx.name.toLowerCase(); },
      run: async function (ctx) {
        await ctx.say('I am ' + ctx.name + '. Why did the lemon quit? It was tired of being squeezed. At Squeez it is the empty tee times that get squeezed, not the lemons.', { mood: 'happy' });
        ctx.chips(ctx.defaults);
      } },

    { id: 'capabilities', priority: 40, match: /what can you do|help|abilit|capabilit|commands|what do you do/,
      run: async function (ctx) {
        await ctx.say('I can explain Squeez, run the live demo, approve the offer for you, set the rules dial from your numbers, give you a tour, jump to any section, pause the motion, take a walkthrough request, or throw confetti.');
        ctx.chips(ctx.defaults);
      } },

    { id: 'greeting', priority: 35, match: /^(hi|hello|hey|yo|sup|hola)\b/,
      run: async function (ctx) { await ctx.say('Hello. I am ' + ctx.name + '. What would you like to see?', { mood: 'happy' }); ctx.chips(ctx.defaults); } }
  ];
  M.use(SKILLS);

  /* ------------------------------------------------------------ knowledge: plain Q&A from the Squeez requirement documents */
  M.knowledge([
    { re: /waitlist|wait list/, go: 'around', text: 'Offers below your floor become waitlist entries. The free waitlist ranks lowest. A paid Preferred waitlist (golf today) ranks above it, and Squeez requests rank above both. The final call is always the venue’s.' },
    { re: /split|group pay|friends pay|share the cost/, go: 'around', text: 'One person books and pays first. Friends get a link and pay their share with no account. An unpaid share never holds the tee time.' },
    { re: /no[- ]?show|short[- ]?show|cancel fee/, go: 'around', text: 'You can charge the whole party for a no-show, or only the missing players for a short-show. It needs a card saved at booking. The clock may mark a booking as arrived on its own, but it never charges anyone.' },
    { re: /chat ?bot|ai assistant|voice ?bot/, go: 'around', text: 'Every venue can have a chatbot that answers from its own website pages and uploaded documents. Questions it cannot answer land in a queue so you can write the answer once.' },
    { re: /loyalty|miles|points|aadvantage|brand|member/, go: 'where', text: 'Loyalty programmes get their own storefront where members spend miles or points at your course. The course owns the price and the programme only reads it. Closed offers show only to eligible members, never publicly.' },
    { re: /concierge|hotel/, go: 'where', text: 'Hotel concierges book for their guests from inventory you set aside for them. You can also make a venue visible to concierges only.' },
    { re: /yield|dynamic pric|suggest/, go: 'around', text: 'Squeez suggests prices and holds. Each move can be set to: you decide, suggest and you approve, or do it automatically inside limits you set, like a minimum price.' },
    { re: /pay(ment)?s?\b|gateway|freedompay|fiserv|3ds|3-d secure|card/, text: 'Venues connect their own payment gateway, such as FreedomPay or Fiserv, and guests can be asked for a 3-D Secure check. Saving a card for no-show fees needs a gateway that can store cards, which today is FreedomPay.' },
    { re: /integrat|foreup|club ?caddie|lightspeed|pos\b|booking provider|connect/, text: 'Squeez connects to your booking provider, for example ForeUp, Club Caddie or Lightspeed, so bookings land in the system you already use.' },
    { re: /price|pricing|cost|how much|plan|subscription|commission/, text: 'I do not have pricing on this page, and I would rather not guess. A walkthrough will cover it for your venue.', chips: ['Book a walkthrough', 'How does it work?'] },
    { re: /who is it for|who is this for|which venues|restaurant|spa|wellness|golf/, text: 'Squeez is built around perishable inventory: tee times first, and also tables, rooms and spa treatments. Anything that is worth nothing once its time passes.' }
  ]);
})();
