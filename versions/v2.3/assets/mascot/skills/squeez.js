/* Squeez skills for the Mascot. Everything Squeez-specific lives here, so mascot.js stays reusable.
 * To teach the mascot something new: add an entry to SKILLS (what it understands) and, if it must act on the page, a tool (what it does).
 * The page exposes window.SqueezPage. All answers come from the public Squeez site (trysqueez.com); where the site is silent, the mascot says so. */
(function () {
  'use strict';
  var M = window.Mascot, page = window.SqueezPage;
  if (!M || !page) return;
  var SITE = 'https://www.trysqueez.com';

  /* ------------------------------------------------------------ tools: what the mascot can DO */
  var SECTIONS = {
    top:     { sel: '#top',     label: 'the top' },
    what:    { sel: '#what',    label: 'What we are' },
    who:     { sel: '#who',     label: 'Who it’s for' },
    live:    { sel: '#live',    label: 'Where it’s live' },
    believe: { sel: '#believe', label: 'What we believe' },
    talk:    { sel: '#talk',    label: 'Partner with Squeez' }
  };
  M.tool('goto', async function (a, ctx) {                       /* { key } */
    var S = SECTIONS[a.key]; if (!S) return;
    var node = document.querySelector(S.sel);
    if (a.key === 'top') window.scrollTo({ top: 0, behavior: ctx.isCalm() ? 'auto' : 'smooth' });
    else { M.scrollTo(node); M.highlight(node.querySelector('h2, h3') || node); }
    ctx.act('Scrolled to ' + S.label);
    await ctx.sleep(1000);
  });
  M.tool('redeem', function () { return page.redeem(); });          /* the member moment: "Use my points" */
  M.tool('restartMoment', function () { page.restart(); });
  M.tool('audience', function (a) { page.audience(a.key); });       /* { key: 'loyalty' | 'experience' | 'strategic' | null } */

  var NAV = [
    [/\b(top|hero|start of|beginning)\b/, 'top'], [/\b(what we are|new way)\b/, 'what'], [/\b(who|venn)\b/, 'who'],
    [/\b(live|golf|dining|where)\b/, 'live'], [/\b(believe|belief|values)\b/, 'believe'], [/\b(contact|partner|talk|bottom|end|footer)\b/, 'talk']
  ];

  /* ------------------------------------------------------------ skills: what the mascot UNDERSTANDS (higher priority runs first) */
  var SKILLS = [
    { id: 'stop', priority: 100, match: /^(stop|cancel|end|quit)( the)? tour|stop talking|^stop$|^enough$/,
      run: async function (ctx) { await ctx.say('Stopped. What next?', { fast: true }); ctx.chips(ctx.defaults); } },

    { id: 'motion-off', priority: 90,
      match: /(pause|stop|freeze|turn off|calm|quiet|reduce)\b.*\b(motion|animations?|anim|moving|movement)|calm mode|too much motion/,
      run: async function (ctx) { await ctx.tool('motion', { on: false }); await ctx.say('Paused. Everything is holding still. Say resume when you want the motion back.'); ctx.chips(ctx.defaults); } },

    { id: 'motion-on', priority: 89,
      match: /(resume|unpause|turn on|start|play|bring back|enable)\b.*\b(motion|animations?|anim)/,
      run: async function (ctx) { await ctx.tool('motion', { on: true }); await ctx.say('Motion is back on.'); ctx.chips(ctx.defaults); } },

    { id: 'tour', priority: 85, match: /\btour\b|show me around|walk me through|guide me/,
      run: async function (ctx) {
        await ctx.say('A short tour. Say stop at any time.', { fast: true });
        var steps = [
          ['top', null, 'Squeez connects loyalty programs with sought-after experiences. A member’s points become a moment, and the two words every member wants to hear are: You’re in.'],
          ['what', null, 'A new way in. Loyalty members are looking for access to experiences, and Squeez helps loyalty brands unlock it.'],
          ['who', function () { return ctx.tool('audience', { key: 'loyalty' }); }, 'For loyalty programs and brands: more relevance and value for their members.'],
          ['who', function () { return ctx.tool('audience', { key: 'experience' }); }, 'And for experience partners: new reach and revenue.'],
          ['live', null, 'Golf is live: the weekend tee time, secured with points. Dining is coming soon: the tables that look fully booked online.'],
          ['believe', null, 'What we believe: loyalty should feel like being known, belonging should open doors, and every point earned should become a moment worth telling.'],
          ['talk', null, 'That is the tour. If you would like to explore a partnership, I can start that for you.']
        ];
        for (var i = 0; i < steps.length; i++) {
          if (!ctx.alive()) return;
          await ctx.tool('goto', { key: steps[i][0] });
          if (steps[i][1]) await steps[i][1]();
          if (!ctx.alive()) return;
          await ctx.say(steps[i][2]); await ctx.sleep(600);
        }
        ctx.chips(['Explore a partnership', 'How does a member get in?', 'Who is Squeez for?']);
      } },

    { id: 'member-moment', priority: 80,
      match: /get in\b|gets in\b|you.?re in|redeem|use (my )?points|member moment|show me the moment|how does (a|the) member|points (become|turn)/,
      run: async function (ctx) {
        await ctx.tool('goto', { key: 'top' }); await ctx.tool('restartMoment'); await ctx.sleep(900);
        var r = await ctx.tool('redeem');
        ctx.act(r === 'done' ? 'The sample is already confirmed' : 'Used the sample member’s points');
        await ctx.say('That is the moment. A member picks a weekend tee time, uses their points, and hears the two words: You’re in. The times and points here are an illustration.', { mood: 'happy' });
        ctx.chips(['Who is Squeez for?', 'Golf and dining', 'Explore a partnership']);
      } },

    { id: 'partnership', priority: 75,
      match: /partnership|become a partner|be a partner|partner with|contact|get started|talk to|reach out|\binvest(ing)?\b|sign ?up|work with you|\bjoin\b/,
      run: async function (ctx) {
        var step = 0, d = {};
        ctx.setFlow(async function (c) {
          var t = c.text;
          if (step === 0) { d.name = t.slice(0, 60); step = 1; await c.say('Lovely to meet you, ' + d.name + '. Which organization are you with?'); return; }
          if (step === 1) { d.org = t.slice(0, 80); step = 2; await c.say('And are you a loyalty program, an experience partner, or an investor?'); return; }
          if (step === 2) { d.role = t.slice(0, 60); step = 3; await c.say('What is the best email to reach you on?'); return; }
          if (!/^\S+@\S+\.\S+$/.test(t)) { await c.say('That does not look like an email. Try name@company.com, or say cancel.'); return; }
          c.endFlow(); await c.tool('goto', { key: 'talk' });
          await c.say('Thank you, ' + d.name + '. I have ' + d.org + ' (' + d.role + ') and ' + t + '. This page is not connected to the partnerships inbox yet, so I have not sent anything. Please finish on the contact page and mention ' + d.org + '.',
            { mood: 'happy', link: { label: 'Explore a partnership', href: SITE + '/contact' } });
          c.chips(c.defaults);
        });
        await ctx.say('I would be glad to. Three quick questions, then I will point you to the right place. What should I call you?');
      } },

    { id: 'audience-loyalty', priority: 78, match: /loyalty (program|programme|brand)s?|for brands|airline|hotel group/,
      run: async function (ctx) {
        await ctx.tool('goto', { key: 'who' }); await ctx.tool('audience', { key: 'loyalty' });
        await ctx.say('For loyalty programs and brands: Squeez connects loyalty points to bookable experiences, so brands bring more relevance and value to their members.', { link: { label: 'For loyalty programs', href: SITE + '/loyalty-programs' } });
        ctx.chips(['For experience partners', 'Golf and dining', 'Explore a partnership']);
      } },

    { id: 'audience-experience', priority: 77, match: /experience partners?|operator|venue|course|club\b|restaurant|for partners/,
      run: async function (ctx) {
        await ctx.tool('goto', { key: 'who' }); await ctx.tool('audience', { key: 'experience' });
        await ctx.say('For experience partners: operators unlock new reach and revenue, with loyalty members who are looking for access to experiences like yours.', { link: { label: 'For experience partners', href: SITE + '/experience-partners' } });
        ctx.chips(['For loyalty programs', 'Golf and dining', 'Explore a partnership']);
      } },

    { id: 'audience-strategic', priority: 76, match: /strategic|investor/,
      run: async function (ctx) {
        await ctx.tool('goto', { key: 'who' }); await ctx.tool('audience', { key: 'strategic' });
        await ctx.say('Strategic partners and investors are coming soon on the site. If that is you, I can start a conversation.');
        ctx.chips(['Explore a partnership', 'Who is Squeez for?']);
      } },

    { id: 'who-for', priority: 66, match: /who (is|are)\b.*\b(for|squeez)|who it.?s for|who.*for\b|audience/,
      run: async function (ctx) {
        await ctx.tool('goto', { key: 'who' });
        await ctx.say('Squeez is for loyalty programs and brands, and for experience partners. Strategic partners and investors are coming soon. Pick a tab on the page, or ask me about any of them.');
        ctx.chips(['Loyalty programs', 'Experience partners', 'Explore a partnership']);
      } },

    { id: 'live', priority: 65, match: /golf|dining|\blive\b|where.*(live|available)|what.*(available|live)|more to follow/,
      run: async function (ctx) {
        await ctx.tool('goto', { key: 'live' });
        await ctx.say('Golf is live: the weekend tee time, secured with points. Dining is coming soon: the tables that look fully booked online. More to follow.');
        ctx.chips(['How does a member get in?', 'Who is Squeez for?', 'Explore a partnership']);
      } },

    { id: 'believe', priority: 60, match: /believe|values|mission|philosoph/,
      run: async function (ctx) {
        await ctx.tool('goto', { key: 'believe' });
        await ctx.say('Loyalty should feel like being known. Belonging should open doors. And every point earned should become a moment worth telling.');
        ctx.chips(ctx.defaults);
      } },

    { id: 'local-luxury', priority: 58, match: /local luxury/,
      run: async function (ctx) {
        await ctx.say('Local Luxury™ is part of the Squeez family, and it has its own page on the company site.', { link: { label: 'Local Luxury™', href: SITE + '/local-luxury' } });
        ctx.chips(ctx.defaults);
      } },

    { id: 'navigate', priority: 55, match: /\b(go|take me|jump|scroll|show|open|head)\b/,
      run: async function (ctx) {
        for (var i = 0; i < NAV.length; i++) if (NAV[i][0].test(ctx.lower)) { await ctx.tool('goto', { key: NAV[i][1] }); await ctx.say('There you go.', { fast: true }); ctx.chips(ctx.defaults); return; }
        await ctx.say('I can take you to: the top, what we are, who it is for, where it is live, what we believe, or the partnership section. Which one?');
        ctx.chips(['Take me to who it is for', 'Take me to where it is live', 'Take me to the partnership section']);
      } },

    { id: 'about-me', priority: 45, match: function (ctx) { return /who are you|your name|are you (a )?(bot|ai|real)/.test(ctx.lower) || ctx.lower.replace(/[^a-z0-9 ]/g, '').trim() === ctx.name.toLowerCase(); },
      run: async function (ctx) {
        await ctx.say('I am ' + ctx.name + ', a guide for this page. I follow a script of what Squeez has published, so I will tell you plainly when I do not know something.', { mood: 'happy' });
        ctx.chips(ctx.defaults);
      } },

    { id: 'capabilities', priority: 40, match: /what can you do|help\b|abilit|capabilit|commands|what do you do/,
      run: async function (ctx) {
        await ctx.say('I can show you how a member gets in, explain who Squeez is for, tell you where it is live, take you on a short tour, jump to any section, pause the motion, or start a partnership conversation.');
        ctx.chips(ctx.defaults);
      } },

    { id: 'greeting', priority: 35, match: /^(hi|hello|hey|yo|hola|good (morning|afternoon|evening))\b/,
      run: async function (ctx) { await ctx.say('Hello. I am ' + ctx.name + '. What would you like to see?', { mood: 'happy' }); ctx.chips(ctx.defaults); } }
  ];
  M.use(SKILLS);

  /* ------------------------------------------------------------ knowledge: answers taken from the public Squeez site */
  M.knowledge([
    { re: /what is squeez|what does squeez|what.?s squeez|about squeez|tell me about (squeez|you)|what do you do as/, go: 'what',
      text: 'Squeez connects loyalty programs with sought-after experiences, giving members more meaningful ways to use their points while creating new revenue opportunities for experience partners.' },
    { re: /points|rewards?|miles/, go: 'top',
      text: 'Members use their loyalty points toward bookable experiences. Golf is live today, with dining coming soon. The aim is to make loyalty more rewarding and access more attainable.' },
    { re: /tampa|where are you based|headquarter|location|address|florida/,
      text: 'Squeez, Inc. is based in Tampa, Florida.' },
    { re: /price|pricing|cost|how much|fee|commission|revenue share|terms/,
      text: 'I do not have commercial terms, and I would rather not guess. The partnerships team can walk you through them.', chips: ['Explore a partnership', 'Who is Squeez for?'] },
    { re: /press|media|news|journalist/,
      text: 'There is a Press & media page on the company site.', chips: ['Explore a partnership', 'Give me a tour'] },
    { re: /career|jobs?|hiring/,
      text: 'I do not have information on open roles. The Company page on the site is the best place to look.', chips: ['Give me a tour', 'Explore a partnership'] }
  ]);
})();
