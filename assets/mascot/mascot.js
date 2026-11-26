/*! Mascot v1.0
 *  A branded guide that opens a chat. Host-agnostic: it knows nothing about the page it lives on.
 *
 *    Mascot.init({ name, tagline, greeting, chips, tips, side, motion, brain, onEvent })   build it
 *    Mascot.tool(name, fn)        something the mascot can DO on the page          fn(args, ctx) -> any
 *    Mascot.use(skill | [skill])  something the mascot UNDERSTANDS                 { id, priority, match, run }
 *    Mascot.knowledge([{re,text,go,chips}])  plain question and answer entries
 *    Mascot.brains.http(url)      optional: hand unmatched messages to a server (an LLM) that can call tools back
 *    Mascot.open() / close() / toggle() / say() / highlight() / scrollTo() / destroy()
 *
 *  See README.md next to this file.
 */
(function (global) {
  'use strict';

  var reduce = !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);

  var DEFAULTS = {
    name: 'Buddy',
    tagline: 'Your guide. I can help you here.',
    greeting: 'Hi, I am {name}. What would you like to do?',
    placeholder: 'Ask me anything',
    fallback: 'I did not catch that. Try one of these.',
    chips: [],                // quick-reply buttons shown after a reply
    tips: [],                 // short nudges shown above the guide while the chat is closed
    tipDelay: 3500, tipEvery: 28000,
    side: 'right',            // 'right' | 'left'
    motion: null,             // { isOn(): boolean, set(on: boolean) }  -> shows a "Pause motion" button
    brain: null,              // async (ctx) => { reply, chips?, actions?: [{tool, args}] } | null   (used when no skill matches)
    cancelRe: /^(cancel|stop|never ?mind|exit|quit)/,
    radius: 20,               // chat corner radius in px
    notice: '',               // small print under the input, e.g. to say open questions go to an AI service
    logo: null,               // URL of a logo (SVG/PNG, about 2:1) shown on the badge. Without it the badge shows the first letter of the name
    host: null,               // anything you want skills to reach through ctx.host
    onEvent: null             // (name, data) => void, for analytics: open, close, message, skill, tool, fallback
  };

  var S = null;               // state of the live instance
  var pending = { skills: [], tools: {}, kb: [] };   // registrations made before init()

  /* ---------------------------------------------------------------- utilities */
  function el(tag, cls, txt){ var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function sleep(ms){ return new Promise(function (r) { setTimeout(r, reduce ? Math.min(ms, 40) : ms); }); }
  function lerp(a, b, t){ return a + (b - a) * t; }
  function c01(v){ return Math.max(0, Math.min(1, v)); }
  function px(v){ return v + 'px'; }
  function parseTpl(html){ return document.importNode(new DOMParser().parseFromString(html, 'text/html').body.firstElementChild, true); }
  function colorOf(root, name, fallback){
    var v = (getComputedStyle(root).getPropertyValue(name) || '').trim(), m;
    if ((m = v.match(/^#([0-9a-f]{3})$/i))) v = '#' + m[1].split('').map(function (c) { return c + c; }).join('');
    if ((m = v.match(/^#([0-9a-f]{6})$/i))) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
    if ((m = v.match(/rgba?\((\d+)[ ,]+(\d+)[ ,]+(\d+)/))) return [+m[1], +m[2], +m[3]];
    return fallback;
  }
  function scrub(t){ return String(t).replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '[email]').replace(/\+?\d[\d\s().-]{7,}\d/g, '[number]'); }
  function emit(name, data){ try { if (S && S.cfg.onEvent) S.cfg.onEvent(name, data || {}); } catch (e) {} }
  function calmNow(){ var m = S && S.cfg.motion; return reduce || (m ? !m.isOn() : false); }

  /* ---------------------------------------------------------------- markup */
  function logoMark(cfg){
    var u = String(cfg.logo || '').replace(/["<>&]/g, ''), ini = String(cfg.name || '?').charAt(0).toUpperCase().replace(/[<>&"]/g, '');
    var face = u ? '<image class="mx-mark" href="' + u + '" x="21" y="40" width="78" height="36"/>'
                 : '<text class="mx-initial" x="60" y="76" text-anchor="middle">' + ini + '</text>';
    return '<svg class="mx-char mx-logo" data-mood="idle" viewBox="0 0 120 120" aria-hidden="true">' +
      '<ellipse class="mx-ground" cx="60" cy="113" rx="30" ry="5"/>' +
      '<g class="mx-body"><circle class="mx-badge" cx="60" cy="58" r="54"/>' +
        '<circle class="mx-ring" cx="60" cy="58" r="49" fill="none" pathLength="100"/>' +
        face + '</g></svg>';
  }
  function SKELETON(cfg){ return SKEL_HEAD + logoMark(cfg) + SKEL_TAIL; }
  var SKEL_HEAD =
    '<div class="mx">' +
      '<button class="mx-bubble" type="button" tabindex="-1" aria-hidden="true"></button>' +
      '<div class="mx-morph" aria-hidden="true" inert>' +
        '<div class="mx-blob"></div>' +
        '<div class="mx-panel" role="dialog">' +
          '<header class="mx-head"><div><strong class="mx-title"></strong><span class="mx-tag"></span></div>' +
            '<div class="mx-tools"><button class="mx-motion" type="button" aria-pressed="false" hidden></button>' +
            '<button class="mx-close" type="button" aria-label="Close chat">&times;</button></div></header>' +
          '<div class="mx-msgs" aria-live="polite"></div>' +
          '<div class="mx-chips"></div>' +
          '<form class="mx-form"><label class="mx-sr"></label><input class="mx-input" autocomplete="off"><button type="submit">Send</button></form>' +
          '<p class="mx-note" hidden></p>' +
        '</div>' +
      '</div>' +
      '<button class="mx-fab" type="button" aria-expanded="false"><span class="mx-dot" aria-hidden="true"></span>';
  var SKEL_TAIL = '</button></div>';

  /* ---------------------------------------------------------------- the guide's life */
  function mood(m){ S.r.char.setAttribute('data-mood', m); }
  function blink(){ var l = S.r.char; l.classList.add('mx-blink'); setTimeout(function () { l.classList.remove('mx-blink'); }, 220); }

  function startLife(){
    (function loop(){ S.t.blink = setTimeout(function () { if (!S) return; if (!calmNow()){ blink(); if (Math.random() < .25) setTimeout(blink, 340); } loop(); }, 2400 + Math.random() * 3200); })();
    (function wig(){ S.t.wig = setTimeout(function () {
      if (!S) return;
      if (!S.open && !calmNow()){ S.r.char.classList.add('mx-wiggle'); setTimeout(function () { S && S.r.char.classList.remove('mx-wiggle'); }, 850); }
      wig();
    }, 8000 + Math.random() * 5000); })();
  }

  /* ---------------------------------------------------------------- spring morph: the chat pours out of the badge */
  function Spring(k, c){ this.x = 0; this.v = 0; this.t = 0; this.k = k; this.c = c; }
  Spring.prototype.step = function (dt){ var a = -this.k * (this.x - this.t) - this.c * this.v; this.v += a * dt; this.x += this.v * dt; };

  function mixColor(a, b, t){ return 'rgb(' + a.map(function (v, i) { return Math.round(lerp(v, b[i], t)); }).join(',') + ')'; }

  function render(){
    var r = S.r, m = S.m, left = S.cfg.side === 'left', R0 = m.R0, bw = m.bw, tail = 6;
    var W = r.morph.clientWidth, H = r.morph.clientHeight, fw = r.fab.offsetWidth, fh = r.fab.offsetHeight, size = Math.min(fw, fh) * .5;
    var cx = left ? fw / 2 : W - fw / 2, cy = H + 14 + fh / 2;                 /* the badge's centre, in the morph's own space */
    var L = lerp(cx - size / 2, 0, m.sx.x), Rt = lerp(cx + size / 2, W, m.sx.x), T = lerp(cy - size / 2, 0, m.sy.x), B = lerp(cy + size / 2, H, m.sy.x);
    var p = (m.sx.x + m.sy.x) / 2, pr = c01(p), bs = r.blob.style;
    var big = lerp(size / 2, R0, pr), small = lerp(size / 2, tail, pr);
    bs.left = px(L); bs.top = px(T); bs.width = px(Math.max(Rt - L, size)); bs.height = px(Math.max(B - T, size));
    bs.borderRadius = (left ? [big, big, big, small] : [big, big, small, big]).map(px).join(' ');
    bs.background = mixColor(m.from, m.to, c01((p - .12) / .5)); bs.opacity = c01(p * 12);
    r.morph.style.filter = 'drop-shadow(' + px(m.shx * (left ? -1 : 1) * pr) + ' ' + px(m.shy * pr) + ' ' + px(m.shb * pr) + ' ' + m.shadow + ')';
    var op = c01((p - .5) / .4), ps = r.panel.style, rr = Math.max(4, lerp(size / 2, R0 - bw, pr));
    ps.opacity = op; ps.transform = 'translateY(' + px(16 * (1 - op)) + ')'; ps.pointerEvents = op > .9 ? 'auto' : 'none';
    ps.clipPath = 'inset(' + [Math.max(0, T - bw), Math.max(0, W - Rt - bw), Math.max(0, H - B - bw), Math.max(0, L - bw)].map(px).join(' ') +
                  ' round ' + (left ? [rr, rr, rr, 4] : [rr, rr, 4, rr]).map(px).join(' ') + ')';
  }
  function tick(t){
    var m = S.m, dt = Math.min(Math.max((t - m.last) / 1000, 0), 1 / 30); m.last = t;
    for (var i = 0; i < 4; i++){ m.sx.step(dt / 4); m.sy.step(dt / 4); }
    var rest = Math.abs(m.sx.x - m.goal) < .0008 && Math.abs(m.sy.x - m.goal) < .0008 && Math.abs(m.sx.v) < .004 && Math.abs(m.sy.v) < .004;
    if (rest){ m.sx.x = m.sy.x = m.goal; m.sx.v = m.sy.v = 0; render(); m.raf = 0; if (!m.goal) S.r.morph.style.visibility = 'hidden'; return; }
    render(); m.raf = requestAnimationFrame(tick);
  }
  /* opening is a touch jelly (width leads, height lags and overshoots); closing is firmer and never rebounds past the badge */
  function springTo(g){
    var m = S.m, closing = g === 0; m.goal = g;
    m.sx.k = closing ? 260 : 210; m.sx.c = closing ? 31 : 21; m.sy.k = closing ? 240 : 170; m.sy.c = closing ? 29 : 16; m.sx.t = m.sy.t = g;
    S.r.morph.style.visibility = 'visible';
    if (reduce){ m.sx.x = m.sy.x = g; m.sx.v = m.sy.v = 0; render(); if (!g) S.r.morph.style.visibility = 'hidden'; return; }
    if (!m.raf){ m.last = performance.now(); m.raf = requestAnimationFrame(tick); }
  }
  function drops(inward){
    if (reduce) return;
    var r = S.r, fw = r.fab.offsetWidth, fh = r.fab.offsetHeight, dir = S.cfg.side === 'left' ? -1 : 1;
    for (var i = 0; i < 8; i++){
      var d = el('i', 'mx-drop'); d.style.left = px(fw / 2); d.style.top = px(fh / 2); S.root.insertBefore(d, r.fab);
      var dx = -dir * (20 + Math.random() * 150), dy = -(30 + Math.random() * 170), s2 = .5 + Math.random() * .7, dur = 650 + Math.random() * 300;
      var at = function (k, sc) { return 'translate(-50%,-50%) translate(' + (dx * k) + 'px,' + (dy * k) + 'px) scale(' + sc + ')'; };
      var kf = inward
        ? [{ transform: at(1, s2), opacity: 0 }, { transform: at(.75, s2), opacity: 1, offset: .25 }, { transform: at(0, .2), opacity: 0 }]
        : [{ transform: at(0, .3), opacity: 1 }, { transform: at(1, s2), opacity: .9, offset: .55 }, { transform: at(1.1, 0), opacity: 0 }];
      d.animate(kf, { duration: dur, delay: Math.random() * 120, easing: inward ? 'cubic-bezier(.5,0,.75,0)' : 'cubic-bezier(.16,1,.3,1)', fill: 'both' })
        .onfinish = (function (n) { return function () { n.remove(); }; })(d);
    }
  }
  function react(cls){
    var l = S.r.char; l.classList.remove('mx-pour', 'mx-suck'); void l.getBoundingClientRect(); l.classList.add(cls);
    setTimeout(function () { S && l.classList.remove(cls); }, 1000);
  }

  /* ---------------------------------------------------------------- chat plumbing */
  function scrollMsgs(){ S.r.msgs.scrollTop = S.r.msgs.scrollHeight; }
  function remember(role, text, priv){ S.history.push({ role: role, text: text, priv: priv != null ? priv : (!!S.flow || !!S.privTurn) });   /* priv: said inside a flow (names, emails), never sent to a brain */ if (S.history.length > 24) S.history.shift(); }
  function userMsg(t){ S.r.msgs.appendChild(el('div', 'mx-msg mx-user', t)); scrollMsgs(); remember('user', t); }   /* a turn that answers a flow stays private, including the reply to it */
  function act(t){
    var a = el('div', 'mx-msg mx-act'); a.appendChild(el('i', 'mx-act-dia')); a.appendChild(document.createTextNode(t));
    S.r.msgs.appendChild(a); scrollMsgs();
  }
  function chips(list){
    var box = S.r.chips; box.textContent = '';
    (list || []).forEach(function (c) { var b = el('button', 'mx-chip', c); b.type = 'button'; b.addEventListener('click', function () { send(c); }); box.appendChild(b); });
  }
  async function say(text, o){
    o = o || {}; var priv = !!S.flow || !!S.privTurn;                  /* decided when the reply is asked for, not when it finishes typing */
    var typing = el('div', 'mx-msg mx-bot mx-typing');
    for (var q = 0; q < 3; q++) typing.appendChild(document.createElement('span'));
    S.r.msgs.appendChild(typing); scrollMsgs(); mood('think');
    await sleep(o.fast ? 250 : 550 + Math.min(text.length * 3, 500));
    typing.remove();
    var m = el('div', 'mx-msg mx-bot'); S.r.msgs.appendChild(m); mood('talk');
    var words = text.split(' '), step = Math.max(16, Math.min(42, 1100 / words.length));
    for (var i = 0; i < words.length; i++){ m.textContent += (i ? ' ' : '') + words[i]; scrollMsgs(); await sleep(step); }
    if (o.link){
      var a = el('a', 'mx-link', o.link.label); a.href = o.link.href; a.target = '_blank'; a.rel = 'noopener';
      m.appendChild(document.createElement('br')); m.appendChild(a);
    }
    remember('bot', text, priv); mood(o.mood || 'idle');
    if (o.mood) setTimeout(function () { if (S && S.r.char.getAttribute('data-mood') === o.mood) mood('idle'); }, 2600);
    scrollMsgs();
  }

  /* ---------------------------------------------------------------- tools, skills, brain */
  function callTool(name, args, ctx){
    var fn = S.tools[name];
    if (!fn){ if (global.console) console.warn('[Mascot] unknown tool: ' + name); return Promise.resolve(); }
    emit('tool', { name: name, args: args });
    return Promise.resolve(fn(args || {}, ctx));
  }
  function makeCtx(text){
    var turn = S.turn, cfg = S.cfg;
    var ctx = {
      text: text, lower: text.toLowerCase(), name: cfg.name, host: cfg.host, history: S.history, defaults: cfg.chips,
      nameRe: new RegExp('\\b' + cfg.name.toLowerCase().replace(/[^a-z0-9]/g, '') + '\\b'),
      alive: function () { return turn === S.turn; },               /* false once the user has sent another message */
      say: say, act: act, chips: chips, mood: mood, sleep: sleep, reduce: reduce, isCalm: calmNow,
      tool: function (n, a) { return callTool(n, a, ctx); },
      setFlow: function (fn) { S.flow = fn; }, endFlow: function () { S.flow = null; }
    };
    return ctx;
  }
  async function runBrain(ctx){
    var out = null;
    try { out = S.cfg.brain ? await S.cfg.brain(ctx) : null; } catch (e) { out = null; }
    if (!out || !out.reply) return false;
    emit('brain', { reply: out.reply });
    var acts = out.actions || [];
    for (var i = 0; i < acts.length; i++) await ctx.tool(acts[i].tool, acts[i].args);
    await say(String(out.reply)); chips(out.chips || S.cfg.chips);
    return true;
  }
  async function handle(text){
    var ctx = makeCtx(text); emit('message', { text: text });
    S.privTurn = !!S.flow;                                       /* decided now, when the turn runs, not when it was queued */
    if (S.privTurn) for (var k = S.history.length - 1; k >= 0; k--) if (S.history[k].role === 'user' && S.history[k].text === text){ S.history[k].priv = true; break; }
    if (S.flow){
      if (S.cfg.cancelRe.test(ctx.lower)){ S.flow = null; await say('No problem. I dropped that. Anything else?'); chips(S.cfg.chips); return; }
      return S.flow(ctx);
    }
    var list = S.skills.slice().sort(function (a, b) { return (b.priority || 0) - (a.priority || 0); });
    for (var i = 0; i < list.length; i++){
      var sk = list[i], hit = typeof sk.match === 'function' ? sk.match(ctx) : sk.match.exec(ctx.lower);
      if (hit){ emit('skill', { id: sk.id }); return sk.run(ctx, hit); }
    }
    if (await runBrain(ctx)) return;
    emit('fallback', { text: text }); mood('think');
    await say(S.cfg.fallback); chips(S.cfg.chips);
  }
  function send(text){
    var t = String(text || '').trim(); if (!t) return;
    userMsg(t); chips([]); S.turn++;                          /* cancels any long-running skill (like a tour) at its next check */
    S.queue = S.queue.then(function () { return handle(t); }).catch(function (e) { if (global.console) console.error(e); });
  }

  /* ---------------------------------------------------------------- open / close */
  function setOpen(v){
    if (!S || v === S.open) return; S.open = v;
    var r = S.r;
    r.morph.setAttribute('aria-hidden', String(!v)); if (v) r.morph.removeAttribute('inert'); else r.morph.setAttribute('inert', '');
    r.fab.setAttribute('aria-expanded', String(v)); r.bubble.classList.remove('mx-show'); r.dot.hidden = true;
    react(v ? 'mx-pour' : 'mx-suck'); drops(!v); mood(v ? 'wow' : 'happy');
    setTimeout(function () { if (S && /wow|happy/.test(r.char.getAttribute('data-mood'))) mood('idle'); }, 900);
    springTo(v ? 1 : 0); emit(v ? 'open' : 'close');
    if (v){
      if (!S.greeted){
        S.greeted = true;
        say(S.cfg.greeting.replace(/\{name\}/g, S.cfg.name), { mood: 'happy' }).then(function () { chips(S.cfg.chips); });
      }
      setTimeout(function () { S && r.input.focus(); }, 480);
    } else r.fab.focus();
  }
  function syncMotion(){
    var m = S.cfg.motion, b = S.r.motionBtn; if (!m) return;
    var on = m.isOn(); b.setAttribute('aria-pressed', String(!on)); b.textContent = on ? 'Pause motion' : 'Resume motion';
  }

  /* ---------------------------------------------------------------- public API */
  var API = {
    init: function (config) {
      if (S) API.destroy();
      var cfg = Object.assign({}, DEFAULTS, config || {});
      var root = parseTpl(SKELETON(cfg)); if (cfg.side === 'left') root.classList.add('mx--left');
      var q = function (sel) { return root.querySelector(sel); };
      var r = { root: root, bubble: q('.mx-bubble'), morph: q('.mx-morph'), blob: q('.mx-blob'), panel: q('.mx-panel'), msgs: q('.mx-msgs'), chips: q('.mx-chips'),
                form: q('.mx-form'), input: q('.mx-input'), fab: q('.mx-fab'), dot: q('.mx-dot'), char: q('.mx-char'), motionBtn: q('.mx-motion'), closeBtn: q('.mx-close') };
      var uid = 'mx' + Math.random().toString(36).slice(2, 7);
      q('.mx-title').textContent = cfg.name; q('.mx-title').id = uid + '-t'; r.panel.setAttribute('aria-labelledby', uid + '-t');
      q('.mx-tag').textContent = cfg.tagline;
      var lab = q('.mx-form label'); lab.textContent = 'Message ' + cfg.name; lab.htmlFor = r.input.id = uid + '-i';
      r.input.placeholder = cfg.placeholder; var nt = root.querySelector('.mx-note'); if (cfg.notice){ nt.textContent = cfg.notice; nt.hidden = false; } r.fab.setAttribute('aria-label', 'Chat with ' + cfg.name);
      r.fab.setAttribute('aria-controls', uid + '-p'); r.panel.id = uid + '-p';
      document.body.appendChild(root);

      var cs = getComputedStyle(root), num = function (n, d) { var v = parseFloat(cs.getPropertyValue(n)); return isNaN(v) ? d : v; };
      var shCol = colorOf(root, '--mx-shadow', [16, 48, 42]), shadowCss = 'rgba(' + shCol.join(',') + ',' + num('--mx-sh-alpha', 1) + ')';
      S = { cfg: cfg, root: root, r: r, open: false, turn: 0, flow: null, queue: Promise.resolve(), greeted: false,
            history: [], skills: pending.skills.slice(), tools: Object.assign({}, pending.tools), t: {}, off: [],
            m: { sx: new Spring(210, 21), sy: new Spring(170, 16), raf: 0, last: 0, goal: 0,
                 from: colorOf(root, '--mx-body', [244, 196, 48]), to: colorOf(root, '--mx-paper', [236, 239, 233]),
                 shadow: shadowCss, bw: num('--mx-bw', 3), R0: num('--mx-r', cfg.radius), shx: num('--mx-sh-x', 9), shy: num('--mx-sh-y', 11), shb: num('--mx-sh-blur', 0) } };
      pending.kb.forEach(function (list) { API.knowledge(list); });

      /* built-in tools every skill can rely on */
      S.tools.open = function () { setOpen(true); };
      S.tools.close = function () { setOpen(false); };
      S.tools.motion = function (a) {
        var m = S.cfg.motion; if (!m) return; m.set(!!a.on); syncMotion();
        act(a.on ? 'Motion is back on' : 'Paused the motion');
      };

      var on = function (t, ev, fn, o) { t.addEventListener(ev, fn, o); S.off.push(function () { t.removeEventListener(ev, fn, o); }); };
      on(r.fab, 'click', function () { setOpen(!S.open); });
      on(r.fab, 'pointerenter', function () { if (r.char.getAttribute('data-mood') === 'idle') mood('happy'); });
      on(r.fab, 'pointerleave', function () { if (r.char.getAttribute('data-mood') === 'happy') mood('idle'); });
      on(r.closeBtn, 'click', function () { setOpen(false); });
      on(r.bubble, 'click', function () { setOpen(true); });
      on(global, 'keydown', function (e) { if (e.key === 'Escape' && S.open) setOpen(false); });
      on(global, 'resize', function () { if (S.m.goal) render(); });
      on(r.form, 'submit', function (e) { e.preventDefault(); var v = r.input.value; r.input.value = ''; send(v); });
            on(r.input, 'blur', function () { });
      if (cfg.motion){ r.motionBtn.hidden = false; on(r.motionBtn, 'click', function () { cfg.motion.set(!cfg.motion.isOn()); syncMotion(); }); syncMotion(); }

      render(); startLife();
      var tipI = 0, tip = function () {
        if (!S || S.open || calmNow() || !cfg.tips.length) return;
        r.bubble.textContent = cfg.tips[tipI++ % cfg.tips.length]; r.bubble.classList.add('mx-show');
        setTimeout(function () { S && r.bubble.classList.remove('mx-show'); }, 6000);
      };
      S.t.tip1 = setTimeout(tip, cfg.tipDelay); S.t.tip2 = setInterval(tip, cfg.tipEvery);
      return API;
    },

    /* things the mascot can do */
    tool: function (name, fn) { if (S) S.tools[name] = fn; else pending.tools[name] = fn; return API; },
    /* things the mascot understands: { id, priority (higher runs first), match: RegExp | (ctx) => truthy, run: async (ctx, match) } */
    use: function (skill) {
      (Array.isArray(skill) ? skill : [skill]).forEach(function (s) { if (S) S.skills.push(s); else pending.skills.push(s); });
      return API;
    },
    /* plain Q&A entries: { re, text, go?: sectionKey (calls the 'goto' tool), chips? } */
    knowledge: function (list) {
      if (!S){ pending.kb.push(list); return API; }
      list.forEach(function (e, i) {
        S.skills.push({ id: 'kb:' + (e.id || i), priority: 10, match: e.re, run: async function (ctx) {
          if (e.go) await ctx.tool('goto', { key: e.go });
          await ctx.say(e.text); ctx.chips(e.chips || ctx.defaults);
        } });
      });
      return API;
    },
    open: function () { setOpen(true); return API; },
    close: function () { setOpen(false); return API; },
    toggle: function () { setOpen(!(S && S.open)); return API; },
    say: function (t, o) { return S ? say(t, o) : Promise.resolve(); },
    /* helpers skills and tools can reuse */
    highlight: function (node) { node.classList.remove('mx-hl'); void node.offsetWidth; node.classList.add('mx-hl'); setTimeout(function () { node.classList.remove('mx-hl'); }, 2100); },
    scrollTo: function (node, opts) { node.scrollIntoView(Object.assign({ behavior: calmNow() ? 'auto' : 'smooth', block: 'start' }, opts || {})); },
    destroy: function () {
      if (!S) return;
      S.off.forEach(function (f) { f(); });
      Object.keys(S.t).forEach(function (k) { clearTimeout(S.t[k]); clearInterval(S.t[k]); });
      cancelAnimationFrame(S.m.raf); S.root.remove(); S = null;
    },
    brains: {
      /* Nothing said inside a flow, and no email address or phone number, leaves the browser. */
      /* POST { message, history, tools, page } to your server. Reply with { reply, chips?, actions?: [{ tool, args }] }. */
      /* opts.context: a function returning where the visitor is (section, demo state). Numbers and short keys only. */
      http: function (url, opts) {
        opts = opts || {};
        function ctxNow(o) { try { return o.context ? o.context() : undefined; } catch (e) { return undefined; } }
        return async function (ctx) {
          var ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, opts.timeout || 12000);
          try {
            var res = await fetch(url, { method: 'POST', signal: ctl.signal, headers: Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {}),
              body: JSON.stringify({ message: scrub(ctx.text), history: ctx.history.filter(function (h) { return !h.priv; }).slice(-10).map(function (h) { return { role: h.role, text: scrub(h.text) }; }), tools: Object.keys(S.tools), page: global.location.pathname, context: ctxNow(opts) }) });
            return res.ok ? await res.json() : null;
          } catch (e) { return null; } finally { clearTimeout(t); }
        };
      }
    }
  };

  global.Mascot = API;
})(window);
