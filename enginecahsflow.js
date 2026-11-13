/* CASHFLOW UA — ігровий двигун. Чисті функції над станом гри (мутують переданий об'єкт). */
(function (G) {
  'use strict';
  const CF = {};
  const rnd = Math.random;
  const rint = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const r100 = (x) => Math.round(x / 100) * 100;
  const r10 = (x) => Math.round(x / 10) * 10;
  const uid6 = () => Math.random().toString(36).slice(2, 9);
  function randn() { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  const sp = (x) => Math.abs(Math.round(x)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  function fmt(n) { n = n || 0; if (CF.CUR === 'usd') { const v = n / (CF.FX || 45.5); return (v < -0.5 ? '−' : '') + '$' + sp(v); } return (n < -0.5 ? '−' : '') + sp(n) + ' ₴'; }
  function fmtUah(n) { n = n || 0; return (n < -0.5 ? '−' : '') + sp(n) + ' ₴'; }
  function fmtUsd(n) { n = Math.round(n || 0); return '$' + n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
  function pmt(P, apr, years) { const n = years * 12; if (!apr) return P / n; const r = apr / 12; return P * r / (1 - Math.pow(1 + r, -n)); }
  CF.CUR = 'usd'; CF.FX = 45.5; CF.fmt = fmt; CF.fmtUsd = fmtUsd; CF.fmtUah = fmtUah;
  CF.setCtx = function (g) { if (!g) return; CF.CUR = (g.rules && g.rules.cur) || 'usd'; CF.FX = (g.world && g.world.fx) || 45.5; };

  /* ---------- константи України (листопад 2026) ---------- */
  const K = {
    MINW: 8647,           // мінімальна зарплата 2026
    ESV: 1902,            // ЄСВ мінімальний (22% від мінімалки)
    EMP_TAX: 0.23,        // ПДФО 18% + військовий збір 5%
    FOP3: 0.06,           // 5% єдиний + 1% військовий збір
    INV_TAX: 0.23,        // податок на інвестдохід
    BANK_APR: 0.48,       // кредит готівкою, реальна ставка
    MICRO_M: 0.15,        // мікрокредит: 15% на місяць
    DEP_GUARANTEE: 600000,// гарантія ФГВФО
    KID: 5200,            // витрати на дитину / міс
    BIRTH_ONCE: 10320,    // допомога при народженні (одноразово)
    BIRTH_M: 860,         // допомога щомісяця 36 міс
    UNEMP: 6200,          // допомога центру зайнятості
    DMS: 2100, LIFE: 1300, KASKO: 2400, PROP: 0.0006,
    GYM: 1400, PSY: 6000,
  };
  CF.K = K;
  const MONTHS = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];
  CF.dateOf = (m) => MONTHS[(10 + m) % 12] + ' ' + (2026 + Math.floor((10 + m) / 12));

  /* ---------- активи ринку ---------- */
  const SYM = {
    SPX: { n: 'ETF S&P 500', kind: 'stock', mu: .007, sd: .045, p: 640, div: .012, unit: 'пай' },
    AI: { n: 'Фонд ШІ-чіпів', kind: 'stock', mu: .012, sd: .095, p: 260, div: 0, unit: 'пай' },
    GOLD: { n: 'Золото (ETF)', kind: 'stock', mu: .005, sd: .035, p: 380, div: 0, unit: 'пай' },
    BTC: { n: 'Bitcoin', kind: 'crypto', mu: .012, sd: .13, p: 78000, div: 0, unit: 'BTC' },
    ETH: { n: 'Ethereum', kind: 'crypto', mu: .01, sd: .16, p: 2600, div: 0, unit: 'ETH' },
    MEME: { n: 'Мемкоін $PAPUGA', kind: 'crypto', mu: -.05, sd: .30, p: 0.02, div: 0, unit: 'PAPUGA' },
  };
  CF.SYM = SYM;
  const TK = {
    AGRX: { n: 'УкрАгроХолдинг', sec: 'агросектор', div: 0 },
    DNTK: { n: 'ДніпроТех', sec: 'IT-розробка', div: 0 },
    NVLG: { n: 'НоваЛогістик', sec: 'логістика', div: 0 },
    DRNX: { n: 'ДронТех', sec: 'оборонка', div: 0 },
    MEDX: { n: 'МедФарм', sec: 'фармацевтика', div: 0 },
    ENRG: { n: 'ЕнергоСвіт', sec: 'енергетика, дивіденди', div: 0.12, pd: [[10, .35], [15, .3], [20, .25], [25, .1]] },
  };
  const PD = [[1, .02], [5, .15], [10, .2], [15, .18], [20, .17], [25, .13], [30, .1], [40, .04], [100, .01]];
  CF.TK = TK;
  function drawPrice(sym) { const pd = TK[sym].pd || PD; let r = rnd(), acc = 0; for (const [p, w] of pd) { acc += w; if (r <= acc) return p; } return pd[pd.length - 1][0]; }

  /* ---------- професії ---------- */
  // liabs: [назва, борг, платіж, тип, річна ставка]
  const PROF = [
    { id: 'dev', n: 'Програміст', sub: 'ФОП 3 група, аутсорс', emp: 'fop3', sal: 120000, housing: ['Оренда 1к квартири', 20000, 1], food: 18000, transport: 4500, comm: 2200, kids: 0, cash: 60000, ai: 45, aiRisk: .5, age: 27, car: 1, stress: 35,
      liabs: [['Авто в кредит', 520000, 14500, 'car', .16], ['Кредитна картка', 40000, 2000, 'card', .42]] },
    { id: 'doc', n: 'Лікар', sub: 'Комунальна лікарня', emp: 'emp', sal: 26000, partner: 18000, housing: ['Комуналка (своя квартира)', 3800, 0], food: 7000, transport: 1500, comm: 700, kids: 1, cash: 12000, ai: 15, aiRisk: .1, age: 34, car: 0, stress: 45,
      liabs: [['Іпотека «єОселя» 3%', 1300000, 7200, 'mortgage', .03], ['Кредитна картка', 15000, 750, 'card', .42]] },
    { id: 'teach', n: 'Вчитель', sub: 'Школа, 1,5 ставки', emp: 'emp', sal: 16500, partner: 15000, housing: ['Комуналка (своя квартира)', 3200, 0], food: 6500, transport: 1200, comm: 700, kids: 1, cash: 6000, ai: 20, aiRisk: .2, age: 31, car: 0, stress: 40,
      liabs: [['Іпотека «єОселя» 3%', 950000, 5300, 'mortgage', .03], ['Кредитна картка', 8000, 400, 'card', .42]] },
    { id: 'sales', n: 'Менеджер з продажу', sub: 'Сантехніка й опалення', emp: 'emp', sal: 38000, housing: ['Оренда 1к квартири', 11000, 1], food: 6500, transport: 1800, comm: 800, kids: 0, cash: 15000, ai: 25, aiRisk: .3, age: 26, car: 0, stress: 35,
      liabs: [['Кредитна картка', 20000, 1000, 'card', .42], ['Розстрочка на iPhone', 30000, 2500, 'inst', 0]] },
    { id: 'dir', n: 'Директор магазину', sub: 'Мережа будтоварів', emp: 'emp', sal: 58000, partner: 20000, housing: ['Оренда 2к квартири', 17000, 1], food: 12000, transport: 3500, comm: 1200, kids: 1, cash: 40000, ai: 35, aiRisk: .2, age: 35, car: 1, stress: 50,
      liabs: [['Авто в кредит', 380000, 10500, 'car', .17], ['Кредитна картка', 30000, 1500, 'card', .42]] },
    { id: 'plumb', n: 'Майстер-сантехнік', sub: 'ФОП 2 група', emp: 'fop2', sal: 48000, partner: 16000, housing: ['Оренда 2к квартири', 12000, 1], food: 9000, transport: 4500, comm: 900, kids: 2, cash: 25000, ai: 10, aiRisk: .05, age: 38, car: 1, stress: 35,
      liabs: [['Інструмент у кредит', 60000, 3000, 'inst', 0], ['Бус у кредит', 300000, 8500, 'car', .18]] },
    { id: 'acc', n: 'Бухгалтер', sub: 'Аутсорс-бухгалтерія', emp: 'emp', sal: 29000, partner: 15000, housing: ['Оренда 1к квартири', 12000, 1], food: 7500, transport: 1500, comm: 800, kids: 1, cash: 20000, ai: 30, aiRisk: .6, age: 33, car: 0, stress: 40,
      liabs: [['Кредитна картка', 10000, 500, 'card', .42]] },
    { id: 'smm', n: 'SMM-менеджер', sub: 'ФОП 3 група, фриланс', emp: 'fop3', sal: 36000, housing: ['Оренда смарт-квартири', 11000, 1], food: 8000, transport: 1200, comm: 1600, kids: 0, cash: 10000, ai: 40, aiRisk: .75, age: 24, car: 0, stress: 45,
      liabs: [['Розстрочка на MacBook', 45000, 3750, 'inst', 0]] },
    { id: 'truck', n: 'Далекобійник', sub: 'Міжнародні перевезення', emp: 'emp', sal: 52000, partner: 8000, housing: ['Комуналка (своя квартира)', 3600, 0], food: 10000, transport: 1000, comm: 800, kids: 2, cash: 30000, ai: 5, aiRisk: .35, age: 41, car: 1, stress: 40,
      liabs: [['Споживчий кредит', 80000, 4000, 'cons', .6]] },
    { id: 'taxi', n: 'Водій таксі', sub: 'ФОП 2 група, Bolt/Uklon', emp: 'fop2', sal: 38000, housing: ['Оренда кімнати', 8000, 1], food: 6000, transport: 5500, comm: 700, kids: 0, cash: 5000, ai: 10, aiRisk: .45, age: 29, car: 1, stress: 40,
      liabs: [['Авто в кредит', 250000, 8000, 'car', .2]] },
    { id: 'nurse', n: 'Медсестра', sub: 'Обласна лікарня', emp: 'emp', sal: 17000, housing: ['Живе з батьками (частка комуналки)', 2500, 0], food: 5500, transport: 1000, comm: 600, kids: 0, cash: 4000, ai: 10, aiRisk: .1, age: 25, car: 0, stress: 45,
      liabs: [['Кредитна картка', 6000, 300, 'card', .42]] },
    { id: 'law', n: 'Юрист', sub: 'Юридична фірма', emp: 'emp', sal: 68000, housing: ['Оренда 1к у центрі', 14000, 1], food: 10000, transport: 3000, comm: 1200, kids: 0, cash: 50000, ai: 35, aiRisk: .45, age: 30, car: 1, stress: 50,
      liabs: [['Авто в кредит', 450000, 12000, 'car', .16], ['Кредитна картка', 35000, 1750, 'card', .42]] },
  ];
  CF.PROF = PROF;
  const DREAMS = [
    { id: 'sea', n: 'Будинок біля моря в Одесі', cost: 12000000 },
    { id: 'world', n: 'Навколосвітня подорож з родиною', cost: 3500000 },
    { id: 'fund', n: 'Благодійний фонд для ветеранів', cost: 8000000 },
    { id: 'startup', n: 'Власний технологічний стартап', cost: 10000000 },
    { id: 'school', n: 'Приватна школа майбутнього', cost: 15000000 },
    { id: 'edu', n: 'Освіта дітей у найкращих університетах', cost: 6000000 },
  ];
  CF.DREAMS = DREAMS;

  /* ---------- поле ---------- */
  const RAT = ['pay', 'deal', 'spend', 'market', 'deal', 'luck', 'news', 'deal', 'gig', 'health', 'ai', 'pay', 'deal', 'psy', 'spend', 'market', 'deal', 'child', 'news', 'deal', 'charity', 'layoff', 'pay', 'deal', 'luck', 'market', 'deal', 'gig', 'deal', 'news', 'luck', 'ai'];
  const FAST = ['pay', 'ftdeal', 'dream', 'ftrisk', 'ftdeal', 'ftnews', 'ftdeal', 'charity', 'ftdeal', 'dream', 'pay', 'ftdeal', 'ftrisk', 'ftdeal', 'ftnews', 'ftdeal', 'dream', 'ftdeal', 'ftrisk', 'ftdeal'];
  CF.RAT = RAT; CF.FAST = FAST;
  CF.CELL = {
    pay: { n: 'Получка', ic: '$', c: 'pay' }, luck: { n: 'Удача', ic: '✧', c: 'luck' }, deal: { n: 'Можливість', ic: '◆', c: 'deal' }, spend: { n: 'Витрата', ic: '▼', c: 'spend' }, health: { n: 'Здоров\'я', ic: '✚', c: 'health' },
    market: { n: 'Ринок', ic: '⇅', c: 'market' }, news: { n: 'Новини', ic: '◉', c: 'news' }, gig: { n: 'Підробіток', ic: '⚡', c: 'gig' },
    psy: { n: 'Психологія', ic: '◎', c: 'psy' }, child: { n: 'Дитина', ic: '♥', c: 'child' }, charity: { n: 'Благодійність', ic: '✦', c: 'charity' },
    layoff: { n: 'Звільнення', ic: '✕', c: 'layoff' }, ai: { n: 'ШІ', ic: '⌬', c: 'ai' },
    ftdeal: { n: 'Бізнес', ic: '◆', c: 'deal' }, dream: { n: 'Мрія', ic: '★', c: 'dream' }, ftrisk: { n: 'Ризик', ic: '⚠', c: 'layoff' }, ftnews: { n: 'Новини', ic: '◉', c: 'news' },
  };

  /* ---------- допоміжні для гравця ---------- */
  const profOf = (p) => PROF.find((x) => x.id === p.prof) || PROF[0];
  CF.profOf = profOf;
  function L(g, text, kind, uid) { g.log = g.log || []; g.log.push({ t: Date.now(), m: g.world.m, text, kind: kind || 'info', uid: uid || null }); if (g.log.length > 90) g.log.splice(0, g.log.length - 90); }
  CF.L = L;
  const eff = (w, k) => (w.effects || []).find((e) => e.k === k);
  CF.eff = eff;
  function addEff(w, k, left, extra) { const e = eff(w, k); if (e) e.left = Math.max(e.left, left); else (w.effects = w.effects || []).push(Object.assign({ k, left }, extra || {})); }

  function taxOf(p, w) {
    const esv = r10(K.ESV * (w.mw || 1));
    if (p.track === 'fast') return 0;
    if (p.emp === 'emp') return p.unemp > 0 ? 0 : Math.round(p.sal * K.EMP_TAX);
    if (p.emp === 'fop3') return (p.unemp > 0 ? 0 : Math.round(p.sal * K.FOP3)) + esv;
    return r10(K.MINW * (w.mw || 1) * 0.3) + esv; // ФОП 2: єдиний 20% + військовий 10% мінімалки + ЄСВ
  }
  function salaryNow(p) {
    if (p.track === 'fast') return 0;
    if (p.unemp > 0) return 0;
    let s = p.sal; if (p.cut && p.cut.left > 0) s = Math.round(s * p.cut.k); return s;
  }
  function reVal(a, w) { return a.usd * (w.re / (a.reAt || 1)) * w.fx; }
  function bizVal(a) { return Math.max(a.cost * 0.45, a.cf * 20); }
  function assetValue(a, w) {
    switch (a.kind) {
      case 'stock': case 'crypto': return a.qty * w.px[a.sym] * w.fx;
      case 'tk': return a.qty * ((w.tk || {})[a.sym] || 0) * w.fx;
      case 're': case 'land': case 'newbuild': return reVal(a, w);
      case 'biz': return bizVal(a);
      case 'deposit': case 'bond': case 'loanout': return a.amt;
      case 'bondusd': return a.usd * w.fx;
      default: return 0;
    }
  }
  CF.assetValue = assetValue;
  function bizMult(a, w) {
    let m = 1;
    if (eff(w, 'blackout')) { if (a.power) m *= 1.6; else if (a.solar) m *= 1.3; else if (a.offline) m *= 0.65; }
    if (eff(w, 'lockdown')) { if (a.online) m *= 1.3; else if (a.offline) m *= 0.45; }
    if (eff(w, 'grantboom') && a.offline) m *= 1.0;
    return m;
  }
  function rentTax(p) { return p.emp === 'fop3' ? K.FOP3 : K.INV_TAX; }
  function assetIncome(a, w, p) {
    switch (a.kind) {
      case 're': { let r = a.rent * (eff(w, 'lockdown') ? 0.9 : 1) * (w.peace ? 1.15 : 1); return Math.round(r * (1 - rentTax(p)) - (a.maint || 0)); }
      case 'biz': return Math.round(a.cf * bizMult(a, w));
      case 'deposit': return Math.round(a.amt * a.rate / 12 * (1 - K.INV_TAX));
      case 'bond': return Math.round(a.amt * a.rate / 12);
      case 'bondusd': return Math.round(a.usd * a.rate / 12 * w.fx);
      case 'loanout': return Math.round(a.amt * a.rate);
      case 'tk': return TK[a.sym] && TK[a.sym].div ? Math.round(a.qty * TK[a.sym].div * w.fx * (1 - K.INV_TAX)) : 0;
      case 'stock': return SYM[a.sym].div ? Math.round(a.qty * w.px[a.sym] * w.fx * SYM[a.sym].div / 12 * (1 - K.INV_TAX)) : 0;
      default: return 0;
    }
  }
  CF.assetIncome = assetIncome;
  function insCost(p, w) {
    let c = 0; const it = [];
    if (p.ins.dms) { c += K.DMS; it.push(['ДМС (медичне страхування)', K.DMS]); }
    if (p.ins.life) { const lp = r10(K.LIFE * (1 + Math.max(0, p.age - 30) * 0.04)); c += lp; it.push(['Страхування життя', lp]); }
    if (p.ins.kasko && p.car) { c += K.KASKO; it.push(['КАСКО', K.KASKO]); }
    if (p.ins.prop) { const v = p.assets.filter((a) => a.kind === 're').reduce((s, a) => s + reVal(a, w), 0); const pc = r10(v * K.PROP); if (pc) { c += pc; it.push(['Страхування майна (з воєнними ризиками)', pc]); } }
    return { c, it };
  }
  CF.insCost = insCost;

  /* Фінансовий звіт (очікувані значення) */
  function statement(p, w) {
    const inc = [], pas = [], exp = [];
    const s = salaryNow(p);
    if (p.track !== 'fast') {
      if (p.unemp > 0) { if (p.emp === 'emp') inc.push(['Допомога по безробіттю', K.UNEMP]); }
      else inc.push([(p.emp === 'emp' ? 'Зарплата (брутто)' : 'Дохід ФОП') + (p.cut && p.cut.left > 0 ? ' — знижено' : ''), s]);
    }
    if (p.partner) inc.push(['Дохід партнера (на руки)', p.partner]);
    (p.gigs || []).forEach((gg) => inc.push(['Підробіток: ' + gg.n, Math.round(gg.a * (eff(w, 'digitax') ? 0.8 : 1))]));
    p.assets.forEach((a) => { const v = assetIncome(a, w, p); if (v) pas.push([a.n, v, a.id]); });
    if (p.kb && p.kb.length) pas.push(['Допомога на дітей від держави', p.kb.length * K.BIRTH_M]);
    const tx = taxOf(p, w); if (tx) exp.push([p.emp === 'emp' ? 'Податки (ПДФО 18% + ВЗ 5%)' : (p.emp === 'fop3' ? 'Податки ФОП (6% + ЄСВ)' : 'Податки ФОП 2 гр. + ЄСВ'), tx]);
    exp.push([p.base.housing[0], p.base.housing[1]]);
    exp.push(['Їжа та побут', p.base.food]);
    const tr = Math.round(p.base.transport * (eff(w, 'fuel') ? 1.2 : 1)); exp.push(['Транспорт / пальне', tr]);
    exp.push(['Зв\'язок, інтернет, підписки', p.base.comm]);
    if (p.kids) exp.push(['Діти (' + p.kids + ')', p.kids * p.base.kid]);
    p.liabs.forEach((l) => exp.push([l.n, l.pay, l.id]));
    const ic = insCost(p, w); ic.it.forEach((x) => exp.push(x));
    if (p.well.gym) exp.push(['Спортзал', K.GYM]);
    if (p.well.psy) exp.push(['Психотерапія (4 сесії)', K.PSY]);
    (p.recur || []).forEach((r) => exp.push([r.n, r.a]));
    const sum = (a) => a.reduce((x, y) => x + y[1], 0);
    const active = sum(inc), passive = sum(pas), out = sum(exp);
    const assets = p.assets.reduce((x, a) => x + assetValue(a, w), 0);
    const debt = p.liabs.reduce((x, l) => x + l.bal, 0);
    return { inc, pas, exp, active, passive, income: active + passive, out, cf: active + passive - out, assets, debt, net: assets + p.cash - debt };
  }
  CF.statement = statement;

  function bankDebt(p, kind) { return p.liabs.filter((l) => l.kind === kind).reduce((s, l) => s + l.bal, 0); }
  function bankLimit(p, w) { const st = statement(p, w); return Math.max(60000, Math.round(st.income * 6 / 5000) * 5000); }
  CF.bankLimit = bankLimit; CF.bankDebt = bankDebt;
  function takeLoan(p, amt, kind) {
    kind = kind || 'bank';
    const ex = p.liabs.find((l) => l.kind === kind);
    const rate = kind === 'micro' ? K.MICRO_M : K.BANK_APR / 12;
    if (ex) { ex.bal += amt; ex.pay = Math.round(ex.bal * rate); }
    else p.liabs.push({ id: 'l' + uid6(), n: kind === 'micro' ? 'Мікрокредит (15%/міс)' : 'Кредит готівкою (48% річних)', bal: amt, pay: Math.round(amt * rate), kind, apr: kind === 'micro' ? K.MICRO_M * 12 : K.BANK_APR });
    p.cash += amt;
  }
  CF.takeLoan = takeLoan;
  function ensureCash(g, p) {
    if (p.cash >= 0) return '';
    const need = Math.ceil(-p.cash / 5000) * 5000;
    const lim = bankLimit(p, g.world);
    if (bankDebt(p, 'bank') + need <= lim) { takeLoan(p, need, 'bank'); L(g, 'Не вистачило грошей — банк видав кредит готівкою ' + fmt(need) + ' під 48% річних.', 'bad', p.uid); return ' Не вистачило готівки: банк видав кредит ' + fmt(need) + '.'; }
    takeLoan(p, need, 'micro');
    L(g, 'Банк відмовив. Довелося взяти мікрокредит ' + fmt(need) + ' під 15% на місяць.', 'bad', p.uid);
    if (bankDebt(p, 'micro') > 300000) { bankrupt(g, p); return ' Борги стали непідйомними — банкрутство.'; }
    return ' Банк відмовив — мікрокредит ' + fmt(need) + ' під 15%/міс.';
  }
  CF.ensureCash = ensureCash;
  function spend(g, p, amt) { p.cash -= Math.round(amt); return ensureCash(g, p); }
  function bankrupt(g, p) {
    const old = profOf(p).n;
    const np = newPlayer(p.uid, pick(PROF).id, p.dream, p.av);
    np.bankruptcies = (p.bankruptcies || 0) + 1; np.joined = p.joined; np.cash = Math.round(np.cash * 0.3); np.stress = 70;
    Object.keys(p).forEach((k) => delete p[k]); Object.assign(p, np);
    L(g, 'БАНКРУТСТВО. Процедура банкрутства фізособи: майно продано, борги списано. Старт заново з професією «' + profOf(p).n + '» (була «' + old + '»).', 'bad', p.uid);
  }

  function medical(g, p, amt, dental) {
    let pay = amt, note = '';
    if (p.ins.dms) { const k = dental ? 0.5 : 0.8; pay = Math.round(amt * (1 - k)); note = ' ДМС покрило ' + Math.round(k * 100) + '% (' + fmt(amt - pay) + ').'; }
    return 'Рахунок ' + fmt(amt) + ', ви сплатили ' + fmt(pay) + '.' + note + spend(g, p, pay);
  }

  /* ---------- новий гравець / гра ---------- */
  function newPlayer(uid, profId, dream, av) {
    const pr = PROF.find((x) => x.id === profId) || pick(PROF);
    return {
      uid, prof: pr.id, emp: pr.emp, dream: dream || pick(DREAMS).id, pos: 0, track: 'rat', cash: pr.cash, sal: pr.sal,
      base: { housing: [pr.housing[0], pr.housing[1]], rent: pr.housing[2], food: pr.food, transport: pr.transport, comm: pr.comm, kid: K.KID },
      kids: pr.kids, partner: pr.partner || 0, kb: [], liabs: pr.liabs.map((l) => ({ id: 'l' + uid6(), n: l[0], bal: l[1], pay: l[2], kind: l[3], apr: l[4] })),
      assets: [], ins: { dms: 0, life: 0, kasko: 0, prop: 0 }, well: { gym: 0, psy: 0 }, health: 80, stress: pr.stress, ai: pr.ai, aiRisk: pr.aiRisk,
      av: av || null, unemp: 0, cut: null, charity: 0, gigs: [], recur: [], age: pr.age, car: pr.car, cpiAt: 1, months: 0, hist: [], ftGoal: 0, won: 0, gen: 0, joined: Date.now(),
    };
  }
  CF.newPlayer = newPlayer;
  CF.newWorld = function () {
    const px = {}; Object.keys(SYM).forEach((k) => { px[k] = SYM[k].p; });
    const tk = {}; Object.keys(TK).forEach((k) => { tk[k] = 10; });
    return { m: 0, fx: 45.5, rate: 16.5, cpi: 1, infl: 0.10, re: 1, mw: 1, px, tk, tkh: {}, effects: [], peace: 0, news: [], pxHist: { SPX: [px.SPX], AI: [px.AI], BTC: [px.BTC], fx: [45.5] } };
  };
  CF.newGame = function (hostUid, name) {
    return { v: 2, rules: { roll: 30, dec: 180, timers: 1, cur: 'usd', news: 'norm', voice: 1, loans: 1 }, ready: {}, trades: {}, deadline: null, paused: null, name: name || 'Нова гра', hostId: hostUid, status: 'lobby', createdAt: Date.now(), updatedAt: Date.now(), order: [], turn: 0, phase: 'roll', world: CF.newWorld(), players: {}, pending: null, pay: {}, log: [], winner: null, seq: 0, round: 0, last: null };
  };
  CF.startGame = function (g) {
    const ids = Object.keys(g.players).sort((a, b) => g.players[a].joined - g.players[b].joined);
    g.order = ids; g.turn = 0; g.status = 'active'; g.round = 1;
    L(g, 'Гра почалася. ' + CF.dateOf(0) + '. Курс ' + g.world.fx.toFixed(2) + ' ₴/$, облікова ставка НБУ ' + g.world.rate + '%. Хай щастить!', 'sys');
    beginTurn(g);
  };
  CF.curUid = (g) => g.order[g.turn % Math.max(1, g.order.length)];

  /* ---------- щомісячні процеси гравця ---------- */
  function beginTurn(g) {
    const uid = CF.curUid(g); const p = g.players[uid];
    if (!p) return;
    g.phase = 'roll'; g.pending = null; g.dice = null; g.tn = (g.tn || 0) + 1;
    g.deadline = g.rules && g.rules.timers ? Date.now() + (g.rules.roll || 30) * 1000 : null; g.paused = null;
  }
  CF.beginTurn = beginTurn;
  /* Получка: щомісячні процеси гравця (3 получки за коло, 12 = рік життя) */
  function payday(g, p) {
    const uid = p.uid; const w = g.world;
    const notes = [];
    // фактичні надходження: бізнес коливається
    const st = statement(p, w);
    let actual = st.cf;
    p.assets.forEach((a) => {
      if (a.kind === 'biz' && a.vol) { const exp = assetIncome(a, w, p); const real = Math.round(exp * (1 + randn() * a.vol * 0.6)); actual += real - exp; }
      if (a.kind === 're' && a.vac > 0) { actual -= Math.round(a.rent * (1 - rentTax(p))); a.vac--; notes.push(a.n + ': немає орендаря'); }
    });
    if (p.cut && p.cut.left > 0) { p.cut.left--; if (!p.cut.left) p.cut = null; }
    p.cash += actual;
    const pd = { m: w.m, inc: st.income, out: st.out, net: actual, cf: st.cf, notes };
    // амортизація кредитів
    p.liabs.forEach((l) => {
      if (l.kind === 'inst') l.bal -= l.pay;
      else if (l.kind === 'car' || l.kind === 'mortgage' || l.kind === 'biz' || l.kind === 'card' || l.kind === 'cons') { const i = l.bal * (l.apr || 0) / 12; l.bal -= Math.max(0, l.pay - i); }
    });
    const closed = p.liabs.filter((l) => l.bal <= 50);
    closed.forEach((l) => { notes.push('Виплачено повністю: ' + l.n + ' (+' + fmt(l.pay) + '/міс до потоку)'); L(g, 'Закрито кредит «' + l.n + '» — потік зріс на ' + fmt(l.pay) + '/міс.', 'good', uid); });
    p.liabs = p.liabs.filter((l) => l.bal > 50);
    p.liabs.forEach((l) => { l.bal = Math.round(l.bal); });
    // дитяча допомога
    if (p.kb && p.kb.length) p.kb = p.kb.map((x) => x - 1).filter((x) => x > 0);
    // безробіття
    if (p.unemp > 0) { p.unemp--; if (!p.unemp) { notes.push('Ви знову працюєте!'); L(g, 'Знайдено нову роботу — зарплата повертається.', 'good', uid); } }
    // підробітки
    (p.gigs || []).forEach((x) => { p.stress += x.s || 0; });
    // новобудова
    p.assets.forEach((a) => {
      if (a.kind === 'newbuild' && a.doneM != null && w.m >= a.doneM) { a.kind = 're'; a.rent = a.rentAfter; a.maint = a.maintAfter || 800; a.n = a.n.replace(' (будується)', ''); notes.push('Будинок здано! ' + a.n + ' приносить оренду.'); L(g, 'ЖК здано в експлуатацію: ' + a.n + ' — тепер це орендна квартира.', 'good', uid); }
    });
    // стрес та здоров'я
    const pressure = (p.unemp > 0 ? 6 : 0) + (st.cf < 0 ? 3 : 0) + (p.liabs.some((l) => l.kind === 'micro') ? 4 : 0) - (p.cash >= st.out * 3 ? 2 : 0) - (p.well.gym ? 2.5 : 0) - (p.well.psy ? 6 : 0) + (eff(w, 'blackout') && !p.gen ? 2 : 0) - (p.track === 'fast' ? 3 : 0);
    const ds = 0.1 * (40 - p.stress) + pressure + randn() * 2;
    p.stress = clamp(Math.round(p.stress + ds), 0, 100);
    const htarget = 82 - Math.max(0, p.age - 30) * 0.5 - (p.stress > 70 ? 15 : p.stress > 55 ? 6 : 0) + (p.well.gym ? 10 : 0);
    const dh = 0.06 * (htarget - p.health) + randn() * 1.5;
    p.health = clamp(Math.round(p.health + dh), 0, 100);
    // автоматичні наслідки
    if (p.stress >= 85 && rnd() < 0.35 && p.track === 'rat' && p.unemp === 0) {
      const lost = Math.round(salaryNow(p) * 0.3); p.cash -= lost; p.stress -= 15;
      notes.push('Вигорання: ви взяли лікарняний і втратили ' + fmt(lost)); L(g, 'Емоційне вигорання. Мінус ' + fmt(lost) + ' доходу цього місяця.', 'bad', uid);
    }
    if (p.health <= 25 && rnd() < 0.3) {
      const cost = 120000; let msg = 'Серйозна хвороба, госпіталізація. ';
      if (p.ins.life) { p.cash += 400000; msg += 'Страхування життя виплатило 400 000 ₴ за критичне захворювання. '; }
      msg += medical(g, p, cost); p.health = 55; notes.push(msg); L(g, msg, 'bad', uid);
    }
    pd.notes2 = ensureCash(g, p);
    p.months++;
    // історія
    const st2 = statement(p, w);
    p.hist = (p.hist || []).concat([{ m: w.m, cash: Math.round(p.cash), pas: st2.passive, out: st2.out, net: Math.round(st2.net) }]).slice(-48);
    p.paid = (p.paid || 0) + 1; if (p.paid % 12 === 0) p.age++;
    pd.t = Date.now(); pd.n = p.paid; pd.lines = { inc: st.inc.concat(st.pas.map((x) => [x[0], x[1]])), exp: st.exp.map((x) => [x[0], x[1]]) };
    g.pay = g.pay || {}; g.pay[uid] = pd;
    L(g, 'Получка: ' + (actual >= 0 ? '+' : '') + fmt(actual) + '.', actual >= 0 ? 'pay' : 'bad', uid);
    if (p.track === 'fast' && st2.passive >= p.ftGoal && !p.won) win(g, p, 'пасивний дохід ' + fmt(st2.passive) + '/міс');
    syncWorld(g);
  }
  CF.payday = payday;
  function syncWorld(g) {
    const ps = (g.order || []).map((u) => g.players[u]).filter(Boolean); if (!ps.length) return;
    const target = Math.floor(ps.reduce((s, p) => s + (p.paid || 0), 0) / ps.length);
    let guard = 0; while (g.world.m < target && guard++ < 6) advanceWorld(g);
  }

  CF.canExit = function (g, uid) { const p = g.players[uid]; if (!p || p.track !== 'rat') return false; const st = statement(p, g.world); return st.passive > 0 && st.passive >= st.out; };
  CF.exitRat = function (g) {
    const p = g.players[CF.curUid(g)]; const st = statement(p, g.world);
    p.track = 'fast'; p.pos = 0; p.ftGoal = Math.round((st.passive + 300000) / 10000) * 10000; p.unemp = 0; p.cut = null; p.gigs = [];
    L(g, 'ФІНАНСОВА СВОБОДА! Пасивний дохід ' + fmt(st.passive) + ' перевищив витрати ' + fmt(st.out) + '. Звільнився з найму й вийшов на Швидку доріжку. Ціль: ' + fmt(p.ftGoal) + '/міс або купити мрію.', 'win', p.uid);
    g.fx = { k: 'exit', uid: p.uid, t: Date.now() };
  };
  function win(g, p, how) {
    p.won = 1; if (!g.winner) g.winner = p.uid;
    L(g, 'ПЕРЕМОГА: ' + how + '!', 'win', p.uid); g.fx = { k: 'win', uid: p.uid, t: Date.now() };
  }

  /* ---------- світ (раз на коло = місяць) ---------- */
  function advanceWorld(g) {
    const w = g.world; w.m++;
    Object.keys(SYM).forEach((k) => {
      const s = SYM[k]; let r = s.mu + randn() * s.sd;
      if (k === 'MEME' && rnd() < 0.04) r = Math.log(rint(3, 8));
      if (eff(w, 'aiboom') && k === 'AI') r += 0.03;
      w.px[k] = Math.max(k === 'MEME' ? 0.0005 : 1, +(w.px[k] * Math.exp(r)).toFixed(k === 'MEME' ? 5 : 2));
    });
    w.re = +(w.re * Math.exp(0.003 + randn() * 0.012)).toFixed(4);
    w.fx = +(w.fx * Math.exp(0.0025 + randn() * 0.007)).toFixed(2);
    w.infl = +((w.infl || 0.1) + 0.03 * (0.07 - (w.infl || 0.1))).toFixed(4);
    const mi = w.infl / 12 + randn() * 0.002; w.cpi = +(w.cpi * (1 + mi)).toFixed(4);
    ['SPX', 'AI', 'BTC'].forEach((k) => { w.pxHist[k] = (w.pxHist[k] || []).concat([w.px[k]]).slice(-36); });
    w.pxHist.fx = (w.pxHist.fx || []).concat([w.fx]).slice(-36);
    w.effects = (w.effects || []).map((e) => Object.assign({}, e, { left: e.left - 1 })).filter((e) => e.left > 0);
    // раз на рік: інфляція і індексація
    if (w.m % 12 === 0) {
      Object.values(g.players).forEach((p) => {
        const inf = w.cpi / (p.cpiAt || 1) - 1; p.cpiAt = w.cpi;
        const b = p.base; b.food = r100(b.food * (1 + inf)); b.comm = r100(b.comm * (1 + inf)); b.transport = r100(b.transport * (1 + inf)); b.kid = r100(b.kid * (1 + inf));
        b.housing[1] = r100(b.housing[1] * (1 + inf * (b.rent ? 1.1 : 0.9)));
        let msg = 'Новий рік: ціни зросли на ' + (inf * 100).toFixed(1) + '%. Ваші витрати на життя проіндексовано.';
        p.assets.forEach((a) => { if (a.kind === 're') a.rent = r100(a.rent * (1 + inf * 0.8)); if (a.kind === 'biz') a.cf = r100(a.cf * (1 + inf * 0.7)); });
        if (p.partner) p.partner = r100(p.partner * (1 + inf));
        if (p.track === 'rat' && rnd() < 0.8) { const k = inf * (0.95 + rnd() * 0.5); p.sal = r100(p.sal * (1 + k)); msg += ' Зарплату підвищили на ' + (k * 100).toFixed(1) + '%. Оренда й прибутки бізнесів теж трохи зросли.'; }
        else if (p.track === 'rat') msg += ' Зарплату не підвищили — реальний дохід впав.';
        L(g, msg, 'sys', p.uid);
      });
    }
    const nf = { rare: 0.15, norm: 0.3, often: 0.5 }[(g.rules && g.rules.news) || 'norm'] || 0.3;
    if (rnd() < nf) applyNews(g, null);
    // ціни на швидкій оренді
    g.round = (g.round || 1) + 1;
  }
  CF.advanceWorld = advanceWorld;

  CF.endTurn = function (g) {
    if (g.pending && g.pending.offer) g.pending.offer = null;
    if (g.pending && !g.pending.done) { if (g.pending.owner !== CF.curUid(g) && g.players[g.pending.owner]) {} CF.choose(g, defKey(g), null, true); }
    g.pending = null; g.dice = null;
    const n = g.order.length; if (!n) return;
    g.turn = (g.turn + 1) % n;
    beginTurn(g);
  };

  /* ---------- кубики та рух ---------- */
  CF.roll = function (g, two) {
    const p = g.players[CF.curUid(g)];
    const fast = p.track === 'fast';
    const d = [rint(1, 6)]; if (fast || (two && p.charity > 0)) d.push(rint(1, 6));
    if (p.charity > 0) p.charity--;
    const board = fast ? FAST : RAT; const steps = d.reduce((a, b) => a + b, 0);
    const from = p.pos; let pays = 0;
    for (let s2 = 1; s2 <= steps; s2++) { const ps2 = (from + s2) % board.length; if (board[ps2] === 'pay') { payday(g, p); pays++; } }
    p.pos = (from + steps) % board.length;
    g.dice = { d, from, to: p.pos, t: Date.now(), uid: p.uid, pays };
    g.deadline = g.rules && g.rules.timers ? Date.now() + 1800 + (g.rules.dec || 180) * 1000 : null;
    const cell = board[p.pos];
    g.phase = 'card';
    if (!g.players[p.uid] || g.players[p.uid] !== p) return;
    if (cell === 'pay') { draw(g, 'pay'); return; }
    if (cell === 'deal') { g.pending = { deck: 'choose', id: 'choose', p: {}, uid: p.uid, owner: p.uid, done: false, priv: 1 }; return; }
    draw(g, cell);
  };

  /* ---------- картки ---------- */
  const DECKS = {};
  function deck(name, cards) { DECKS[name] = cards; cards.forEach((c) => { c.deck = name; }); }
  function ctx(g) { const uid = (g.pending && g.pending.owner) || CF.curUid(g); return { g, w: g.world, p: g.players[uid], uid }; }
  function draw(g, name) {
    const c = ctx(g); if (g.pending && g.pending.owner && g.pending.owner !== CF.curUid(g)) c.uid = g.pending.owner;
    const pool = DECKS[name].filter((x) => !x.cond || x.cond(c));
    let tot = pool.reduce((s, x) => s + (x.wt || 1), 0), r = rnd() * tot, card = pool[0];
    for (const x of pool) { r -= (x.wt || 1); if (r <= 0) { card = x; break; } }
    const params = card.draw ? card.draw(c) : {};
    g.pending = { deck: name, id: card.id, p: params || {}, uid: c.uid, owner: c.uid, offer: null, done: false, res: null, pub: card.pub ? 1 : 0, priv: card.priv ? 1 : 0 };
    if (card.auto) { CF.choose(g, 'ok', null, true); }
  }
  CF.draw = draw;
  function cardOf(pd) { if (!pd) return null; if (pd.id === 'choose') return CHOOSE; return (DECKS[pd.deck] || []).find((x) => x.id === pd.id); }
  function defKey(g) { const c = cardOf(g.pending); if (!c) return 'ok'; return c.def || 'pass'; }
  CF.view = function (g) {
    const pd = g.pending; const card = cardOf(pd); if (!card) return null;
    const c = ctx(g);
    if (!c.p) return null;
    const v = card.view(c, pd.p) || {};
    v.t = v.t || card.t; v.deck = pd.deck; v.done = pd.done; v.res = pd.res; v.tip = pd.tip; v.id = pd.id; v.owner = pd.owner; v.offer = pd.offer; v.pub = !!card.pub; v.priv = !!(card.priv || pd.priv); v.sellable = !!card.sellable; v.art = card.art || pd.deck; v.p = pd.p;
    if (pd.done) v.opts = [];
    return v;
  };
  CF.choose = function (g, key, input, silent) {
    const pd = g.pending; if (!pd || pd.done) return;
    const card = cardOf(pd); const c = ctx(g);
    if (pd.id === 'choose') { const own = pd.owner; draw(g, key === 'big' ? 'big' : 'small'); g.pending.owner = own; return; }
    let res = card.act(c, pd.p, key, input || {});
    if (res && typeof res === 'object' && res.redraw) { draw(g, res.redraw); return; }
    pd.done = true; pd.res = res || 'Готово.'; pd.key = key;
    pd.tip = card.tip || null;
    const ens = ensureCash(g, c.p); if (ens) pd.res += ens;
    if (!card.nolog) L(g, card.t + ': ' + pd.res, 'card', c.uid);
  };
  const CHOOSE = { t: 'Можливість', view: (c) => ({ text: 'Яку можливість шукаєте цього місяця? Малі угоди — до ~400 тис. ₴: акції, крипта, гаражі, вендинг. Великі — квартири, франшизи, бізнеси, часто з кредитом.', opts: [{ k: 'small', label: 'Мала угода' }, { k: 'big', label: 'Велика угода' }] }), act: () => '' , def: 'small' };

  // --- генератори типових карток
  const OK = [{ k: 'ok', label: 'Зрозуміло' }];
  function finOpts(c, P) {
    // P.price (UAH), P.fin: [{k,down,apr,y,n}]
    const out = [];
    (P.fin || [{ k: 'cash', down: 1 }]).forEach((f) => {
      const down = Math.round(P.price * f.down);
      const short = down - c.p.cash;
      const avail = bankLimit(c.p, c.w) - bankDebt(c.p, 'bank');
      let label = f.down >= 1 ? 'Купити за ' + fmt(down) : 'Внесок ' + Math.round(f.down * 100) + '% (' + fmt(down) + ') + ' + f.n;
      if (short > 0) label += ' · бракує ' + fmt(short) + ' → кредит готівкою';
      out.push({ k: 'buy:' + f.k, label: short > avail ? label.split(' · ')[0] + ' · бракує ' + fmt(short) + ', банк не дасть' : label, cls: 'pri', dis: short > avail });
    });
    out.push({ k: 'pass', label: 'Відмовитися' });
    return out;
  }
  function finRows(c, P, income) {
    const rows = [['Ціна', fmt(P.price) + (P.usd ? ' (' + fmtUsd(P.usd) + ')' : '')], ['Чистий дохід/міс', fmt(income)]];
    (P.fin || []).forEach((f) => { if (f.down < 1) { const loan = P.price * (1 - f.down); const pay = pmt(loan, f.apr, f.y); rows.push([f.n + ': платіж', fmt(pay) + '/міс · ' + Math.round(f.apr * 100) + '% · ' + f.y + ' р.']); rows.push(['Потік з кредитом', fmt(income - pay) + '/міс']); } });
    rows.push(['Окупність', income > 0 ? (P.price / income / 12).toFixed(1) + ' р.' : '—']);
    return rows;
  }
  function buyFin(c, P, key, mkAsset) {
    const fk = key.split(':')[1]; const f = (P.fin || [{ k: 'cash', down: 1 }]).find((x) => x.k === fk) || { k: 'cash', down: 1 };
    const down = Math.round(P.price * f.down);
    let extra = '';
    if (c.p.cash < down) { const need = Math.ceil((down - c.p.cash) / 5000) * 5000; takeLoan(c.p, need, 'bank'); extra = ' Взято кредит готівкою ' + fmt(need) + '.'; }
    c.p.cash -= down;
    const a = mkAsset(); a.id = 'a' + uid6(); a.m = c.w.m; c.p.assets.push(a);
    if (f.down < 1) { const loan = Math.round(P.price - down); const lid = 'l' + uid6(); c.p.liabs.push({ id: lid, n: f.n + ': ' + a.n, bal: loan, pay: Math.round(pmt(loan, f.apr, f.y)), kind: f.kind || 'mortgage', apr: f.apr, asset: a.id }); a.liab = lid; }
    return 'Куплено: ' + a.n + ' за ' + fmt(P.price) + '.' + extra;
  }
  function RE(id, d, o) {
    // o: {n, tag, usd:[min,max], rent:[min,max], maint, fin, text, kind}
    return Object.assign({ id, wt: o.wt || 1,
      t: o.t || o.n,
      draw: (c) => { const usd = r100(rint(o.usd[0], o.usd[1])); const rent = r100(rint(o.rent[0], o.rent[1])); return { usd, price: Math.round(usd * c.w.fx * c.w.re), rent, fin: o.fin }; },
      view: (c, P) => { const inc = Math.round(P.rent * (1 - rentTax(c.p)) - (o.maint || 0)); return { text: o.text, rows: finRows(c, P, o.kind === 'newbuild' ? 0 : inc).concat(o.kind === 'newbuild' ? [['Після здачі (≈' + o.build + ' міс)', 'оренда ~' + fmt(P.rent) + '/міс']] : []).concat([['Податок на оренду', Math.round(rentTax(c.p) * 100) + '% ' + (c.p.emp === 'fop3' ? '(ФОП 3 гр.)' : '(18% ПДФО + 5% ВЗ)')]]), opts: finOpts(c, P) }; },
      act: (c, P, k) => { if (k === 'pass') return 'Ви відмовились від угоди.'; return buyFin(c, P, k, () => o.kind === 'newbuild' ? { kind: 'newbuild', n: o.n + ' (будується)', tag: o.tag, usd: P.usd, reAt: c.w.re, rent: 0, doneM: c.w.m + o.build, rentAfter: P.rent, maintAfter: o.maint } : { kind: o.kind || 're', n: o.n, tag: o.tag, usd: P.usd, reAt: c.w.re, rent: o.kind === 'land' ? 0 : P.rent, maint: o.maint || 0 }); },
    }, d);
  }
  function BIZ(id, o) {
    return { id, wt: o.wt || 1, t: o.t || o.n, cond: o.cond,
      draw: (c) => { const cost = r10(rint(o.cost[0], o.cost[1]) * c.w.cpi); const cf = r100(rint(o.cf[0], o.cf[1]) * c.w.cpi); return { price: cost, cf, fin: o.fin, grant: !!eff(c.w, 'grant') }; },
      view: (c, P) => { const tmp = { kind: 'biz', cf: P.cf, offline: o.offline, online: o.online, power: o.power, solar: o.solar }; const inc = Math.round(P.cf * bizMult(tmp, c.w)); const rows = finRows(c, P, inc); rows.splice(2, 0, ['Ризик коливань', o.vol >= .4 ? 'високий' : o.vol >= .25 ? 'середній' : 'низький']); if (P.grant) rows.push(['Грант «Власна справа»', '−250 000 ₴ від ціни']); return { text: o.text, rows, opts: finOpts(c, P) }; },
      act: (c, P, k) => { if (k === 'pass') return 'Ви відмовились.'; let g0 = ''; if (P.grant) { P.price = Math.max(0, P.price - 250000); g0 = ' Державний грант покрив 250 000 ₴.'; } return buyFin(c, P, k, () => ({ kind: 'biz', n: o.n, tag: o.tag, cost: P.price, cf: P.cf, vol: o.vol, offline: o.offline, online: o.online, power: o.power, solar: o.solar, war: o.war, ai: o.ai })) + g0; },
    };
  }
  function STOCK(id, sym, o) {
    return { id, wt: o.wt || 1, t: o.t, cond: o.cond,
      draw: (c) => { if (o.mult) c.w.px[sym] = +(c.w.px[sym] * (o.mult[0] + rnd() * (o.mult[1] - o.mult[0]))).toFixed(sym === 'MEME' ? 5 : 2); return { sym }; },
      view: (c, P) => {
        const s = SYM[sym]; const price = c.w.px[sym] * c.w.fx; const own = c.p.assets.find((a) => (a.kind === 'stock' || a.kind === 'crypto') && a.sym === sym);
        const fee = s.kind === 'crypto' ? 0.01 : 0.005;
        const rows = [['Ціна', (sym === 'MEME' ? '$' + c.w.px[sym].toFixed(4) : fmtUsd(c.w.px[sym])) + ' = ' + fmt(price) + ' за ' + s.unit], ['Курс', c.w.fx.toFixed(2) + ' ₴/$'], ['Комісія', (fee * 100) + '%' + (s.kind === 'crypto' ? ' (біржа + P2P)' : ' (брокер)')]];
        if (own) rows.push(['У вас', (+own.qty.toFixed(6)) + ' ' + s.unit + ' · ' + fmt(own.qty * price)]);
        const opts = [{ k: 'buy', label: 'Купити', cls: 'pri' }]; if (own) opts.push({ k: 'sell', label: 'Продати все за цією ціною', cls: 'good' }); opts.push({ k: 'pass', label: 'Пропустити' });
        return { text: o.text, rows, opts, input: { k: 'sum', label: 'Сума покупки, ₴', max: Math.max(0, Math.floor(c.p.cash)), step: 1000, val: Math.min(Math.max(0, Math.floor(c.p.cash / 2 / 1000) * 1000), 50000) } };
      },
      act: (c, P, k, inp) => { if (k === 'pass') return 'Ви пропустили.'; if (k === 'sell') return sellSec(c.g, c.p, c.p.assets.find((a) => a.sym === sym).id); return buySec(c.g, c.p, sym, +inp.sum || 0); },
      tip: o.tip,
    };
  }
  const FLAV = {
    low: ['Слабкий квартальний звіт — інвестори масово продають.', 'Чутки про перевірку і штрафи обвалили котирування.', 'Великий фонд вийшов з акцій компанії.', 'Компанія втратила ключовий контракт.'],
    mid: ['Звичайний торговий день на біржі, без сюрпризів.', 'Аналітики радять «тримати». Ціна стабільна.', 'Компанія виплатила зарплати й закрила квартал у нуль.', 'Ринок чекає новин від НБУ.'],
    high: ['Рекордний прибуток і новий контракт з ЄС — акції злетіли.', 'Компанія оголосила викуп власних акцій.', 'Інвестори в ейфорії: про компанію пишуть усі медіа.', 'Чутки про поглинання великою корпорацією.'],
  };
  function TKCARD(id, sym) {
    return { id, wt: 2, t: sym + ' · ' + TK[sym].n, pub: 1, tk: sym, art: 'tk', def: 'pass',
      draw: (c) => { const price = drawPrice(sym); c.w.tk = c.w.tk || {}; c.w.tk[sym] = price; c.w.tkh = c.w.tkh || {}; c.w.tkh[sym] = (c.w.tkh[sym] || []).concat([{ m: c.w.m, p: price }]).slice(-40); const lvl = price <= 5 ? 'low' : price >= 30 ? 'high' : 'mid'; return { sym, price, flav: pick(FLAV[lvl]) }; },
      view: (c, P) => {
        const own = c.p.assets.find((a) => a.kind === 'tk' && a.sym === sym); const one = P.price * c.w.fx;
        const rows = [['Ціна за акцію', '$' + P.price + ' (' + fmtUah(one) + ')'], ['Галузь', TK[sym].sec]];
        if (TK[sym].div) rows.push(['Дивіденди', '$' + TK[sym].div + ' на акцію щомісяця']);
        if (own) rows.push(['У вас', own.qty + ' акцій']);
        const mx = Math.max(0, Math.floor(c.p.cash / (one * 1.005)));
        const opts = [{ k: 'buy', label: 'Купити акції', cls: 'pri', dis: mx < 1 }]; if (own) opts.push({ k: 'sell', label: 'Продати всі ' + own.qty + ' акцій по $' + P.price, cls: 'good' }); opts.push({ k: 'pass', label: 'Пропустити' });
        return { text: TK[sym].n + ' (' + sym + '). ' + P.flav + ' Продати свої акції ' + sym + ' за цією ціною можуть усі гравці.', rows, opts, input: { k: 'qty', label: 'Кількість акцій', max: mx, step: mx >= 100 ? 10 : 1, val: Math.min(mx, 100), unit: 'шт', each: one } };
      },
      act: (c, P, k, inp) => { if (k === 'pass') return 'Пропущено.'; if (k === 'sell') return sellTk(c.g, c.p, sym, P.price); const q = Math.floor(+inp.qty || 0); return buyTk(c.g, c.p, sym, P.price, q); },
      tip: 'Ціни на біржі мають свої закономірності. Хто їх помічає — заробляє.' };
  }
  function buyTk(g, p, sym, price, q) {
    if (q < 1) return 'Кількість не вказана.'; const one = price * g.world.fx; const cost = Math.round(q * one * 1.005);
    if (cost > p.cash) return 'Не вистачає грошей на ' + q + ' акцій.';
    p.cash -= cost; let a = p.assets.find((x) => x.kind === 'tk' && x.sym === sym);
    if (!a) { a = { id: 'a' + uid6(), kind: 'tk', sym, n: sym + ' · ' + TK[sym].n, qty: 0, cost: 0, m: g.world.m }; p.assets.push(a); }
    a.qty += q; a.cost += cost; return 'Куплено ' + q + ' акцій ' + sym + ' по $' + price + ' на ' + fmt(cost) + '.';
  }
  function sellTk(g, p, sym, price) {
    const a = p.assets.find((x) => x.kind === 'tk' && x.sym === sym); if (!a || !a.qty) return 'У вас немає акцій ' + sym + '.';
    const gross = a.qty * price * g.world.fx * 0.995; const profit = gross - a.cost; const tax = profit > 0 ? profit * K.INV_TAX : 0;
    p.cash += gross - tax; const q = a.qty; p.assets = p.assets.filter((x) => x.id !== a.id);
    return 'Продано ' + q + ' акцій ' + sym + ' по $' + price + ' за ' + fmt(gross) + '. ' + (profit >= 0 ? 'Прибуток ' + fmt(profit) + ', податок ' + fmt(tax) + '.' : 'Збиток ' + fmt(-profit) + '.');
  }
  CF.buyTk = buyTk; CF.sellTk = sellTk;
  function buySec(g, p, sym, sum) {
    sum = Math.floor(sum); if (sum <= 0) return 'Сума не вказана — нічого не куплено.';
    if (sum > p.cash) sum = Math.floor(p.cash);
    if (sum <= 0) return 'Немає вільних грошей.';
    const w = g.world; const s = SYM[sym]; const fee = s.kind === 'crypto' ? 0.01 : 0.005;
    const qty = sum * (1 - fee) / (w.px[sym] * w.fx);
    p.cash -= sum;
    let a = p.assets.find((x) => (x.kind === 'stock' || x.kind === 'crypto') && x.sym === sym);
    if (!a) { a = { id: 'a' + uid6(), kind: s.kind, sym, n: s.n, qty: 0, cost: 0, m: w.m }; p.assets.push(a); }
    a.qty += qty; a.cost += sum;
    return 'Куплено ' + (+qty.toFixed(sym === 'MEME' ? 0 : 4)) + ' ' + s.unit + ' «' + s.n + '» на ' + fmt(sum) + '.';
  }
  function sellSec(g, p, aid, frac) {
    const a = p.assets.find((x) => x.id === aid); if (!a) return 'Актив не знайдено.';
    frac = frac || 1; const w = g.world; const s = SYM[a.sym]; const fee = s.kind === 'crypto' ? 0.01 : 0.005;
    const q = a.qty * frac; const gross = q * w.px[a.sym] * w.fx; const proceeds = gross * (1 - fee); const cost = a.cost * frac;
    const profit = proceeds - cost; const tax = profit > 0 ? profit * K.INV_TAX : 0;
    p.cash += proceeds - tax; a.qty -= q; a.cost -= cost;
    if (frac >= 1 || a.qty < 1e-9) p.assets = p.assets.filter((x) => x.id !== aid);
    return 'Продано «' + s.n + '» за ' + fmt(proceeds) + '. ' + (profit >= 0 ? 'Прибуток ' + fmt(profit) + ', податок 23%: ' + fmt(tax) + '.' : 'Збиток ' + fmt(-profit) + '.');
  }
  CF.buySec = buySec; CF.sellSec = sellSec;
  function sellAsset(g, p, aid, price) {
    const a = p.assets.find((x) => x.id === aid); if (!a) return 'Актив не знайдено.';
    let msg = 'Продано «' + a.n + '» за ' + fmt(price) + '.';
    p.cash += price;
    if (a.liab) { const l = p.liabs.find((x) => x.id === a.liab); if (l) { p.cash -= l.bal; msg += ' Погашено кредит ' + fmt(l.bal) + '.'; p.liabs = p.liabs.filter((x) => x.id !== l.id); } }
    if ((a.kind === 're' || a.kind === 'land' || a.kind === 'newbuild') && (g.world.m - (a.m || 0)) < 36) { const tx = Math.round(price * 0.10); p.cash -= tx; msg += ' Володіли менше 3 років: ПДФО 5% + військовий збір 5% = ' + fmt(tx) + '.'; }
    p.assets = p.assets.filter((x) => x.id !== aid);
    return msg;
  }
  CF.sellAsset = sellAsset;
  function SPEND(id, o) {
    return { id, wt: o.wt || 1, t: o.t, cond: o.cond, def: o.opt ? 'pass' : 'ok',
      draw: (c) => ({ amt: typeof o.amt === 'function' ? o.amt(c) : r10(o.amt * c.w.cpi) }),
      view: (c, P) => ({ text: o.text, rows: [['Сума', fmt(P.amt)]].concat(o.rows ? o.rows(c, P) : []), opts: o.opt ? [{ k: 'ok', label: o.yes || 'Погодитись', cls: 'pri' }, { k: 'pass', label: o.no || 'Відмовитися' }] : [{ k: 'ok', label: 'Сплатити', cls: 'pri' }] }),
      act: (c, P, k) => {
        if (k === 'pass') { if (o.noStress) c.p.stress = clamp(c.p.stress + o.noStress, 0, 100); return o.noText || 'Ви втрималися від витрати.'; }
        let m = !P.amt ? '' : (o.medical ? medical(c.g, c.p, P.amt, o.dental) : (o.car && c.p.ins.kasko ? 'КАСКО покрило витрати.' : 'Сплачено ' + fmt(P.amt) + '.' + spend(c.g, c.p, P.amt)));
        if (o.stress) c.p.stress = clamp(c.p.stress + o.stress, 0, 100);
        if (o.health) c.p.health = clamp(c.p.health + o.health, 0, 100);
        if (o.then) m += ' ' + o.then(c, P);
        return m;
      }, tip: o.tip };
  }
  function EV(id, o) { return Object.assign({ id, def: 'ok', view: (c, P) => ({ text: typeof o.text === 'function' ? o.text(c, P) : o.text, rows: o.rows ? o.rows(c, P) : [], opts: o.opts ? o.opts(c, P) : OK, input: o.input ? o.input(c, P) : undefined }), act: o.act }, o); }
  const SUMIN = (c) => ({ k: 'sum', label: 'Сума, ₴', max: Math.max(0, Math.floor(c.p.cash / 1000) * 1000), step: 1000, val: Math.max(0, Math.min(Math.floor(c.p.cash / 2 / 1000) * 1000, 100000)) });

  /* ===== МАЛІ УГОДИ ===== */
  deck('small', [
    TKCARD('t_agrx', 'AGRX'), TKCARD('t_dntk', 'DNTK'), TKCARD('t_nvlg', 'NVLG'), TKCARD('t_drnx', 'DRNX'), TKCARD('t_medx', 'MEDX'), TKCARD('t_enrg', 'ENRG'),
    STOCK('s_spx_dip', 'SPX', { t: 'Корекція на ринку США', mult: [0.9, 0.95], text: 'Американський ринок просів на тлі новин про ставку ФРС. ETF на індекс S&P 500 (500 найбільших компаній США) подешевшав. Купити можна через брокера (Interactive Brokers, Freedom Finance).', tip: 'Довгостроково індекс S&P 500 у середньому зростав ~7% на рік з урахуванням інфляції, але бували падіння на 30–50%. Купуйте частинами.' }),
    STOCK('s_spx', 'SPX', { t: 'Регулярна інвестиція', text: 'Брокер нагадує: регулярні покупки індексного фонду щомісяця — найпростіша стратегія для зайнятої людини.', tip: 'Стратегія DCA — купувати на однакову суму щомісяця незалежно від ціни.' }),
    STOCK('s_ai_dip', 'AI', { t: 'ШІ-акції обвалилися', mult: [0.82, 0.9], text: 'Звіт найбільшого виробника ШІ-чіпів розчарував інвесторів. Фонд напівпровідникових компаній упав за день.', tip: 'Падіння після хайпу — не завжди знижка. Іноді це початок довгого спаду.' }),
    STOCK('s_ai_hype', 'AI', { t: 'Хайп навколо ШІ', mult: [1.06, 1.14], text: 'Усі говорять про нову модель штучного інтелекту. Фонд ШІ-чіпів б\'є рекорди. Колеги хваляться прибутками.', tip: 'Коли всі навколо купують — ризик купити на піку найвищий.' }),
    STOCK('s_gold', 'GOLD', { t: 'Золото як захист', text: 'Через війну на Близькому Сході та інфляцію інвестори купують золото. ETF на золото доступний у брокера.', tip: 'Золото не платить дивідендів, але часто росте в кризи.' }),
    STOCK('s_btc_dip', 'BTC', { t: 'Біткоїн просів', mult: [0.85, 0.93], text: 'Великі власники продали біткоїни, ціна впала. Купити можна на криптобіржі через P2P з карткою monobank/ПриватБанку.', tip: 'Криптовалюти можуть впасти на 50–80%. Вкладайте лише те, що готові втратити.' }),
    STOCK('s_eth', 'ETH', { t: 'Ethereum', text: 'Оновлення мережі Ethereum здешевило транзакції. Аналітики сперечаються, чи це привід для зростання.', tip: 'У 2026 в Україні діє оподаткування прибутку від віртуальних активів — 23%.' }),
    STOCK('s_meme', 'MEME', { t: 'Мемкоін у чаті', mult: [1.3, 2.2], text: 'Друг кидає в чат: «$PAPUGA полетить на Місяць, я вже х5!». Токен створили три тижні тому.', tip: '95%+ мемкоінів з часом втрачають майже всю вартість. Це лотерея, а не інвестиція.' }),
    EV('s_ovdp', { t: 'Військові ОВДП', wt: 1.4, draw: (c) => ({ rate: (c.w.rate + 0.5) / 100 }),
      text: (c, P) => 'Державні облігації можна купити в Дії чи monobank від 1 000 ₴. Дохідність ~' + (P.rate * 100).toFixed(1) + '% річних, відсотки не оподатковуються. Гроші працюють на оборону.',
      rows: (c, P) => [['Дохідність', (P.rate * 100).toFixed(1) + '% річних, без податку'], ['Дохід зі 100 000 ₴', fmt(100000 * P.rate / 12) + '/міс']],
      opts: () => [{ k: 'buy', label: 'Купити ОВДП', cls: 'pri' }, { k: 'pass', label: 'Пропустити' }], def: 'pass',
      input: SUMIN, act: (c, P, k, inp) => { if (k === 'pass') return 'Пропущено.'; const s = Math.min(Math.floor((+inp.sum || 0) / 1000) * 1000, Math.floor(c.p.cash / 1000) * 1000); if (s <= 0) return 'Сума не вказана.'; c.p.cash -= s; c.p.assets.push({ id: 'a' + uid6(), kind: 'bond', n: 'ОВДП ' + (P.rate * 100).toFixed(1) + '%', amt: s, rate: P.rate, m: c.w.m }); return 'Куплено ОВДП на ' + fmt(s) + '. Пасивний дохід +' + fmt(s * P.rate / 12) + '/міс.'; },
      tip: 'ОВДП — один з небагатьох легальних способів отримати пасивний дохід без податку в Україні.' }),
    EV('s_usdbond', { t: 'Валютні ОВДП', draw: () => ({ rate: 0.038 }),
      text: 'Облігації у доларах від Мінфіну, ~3,8% річних у валюті, без податку. Захищають від девальвації гривні.',
      rows: (c, P) => [['Дохідність', '3,8% у $'], ['Курс', c.w.fx.toFixed(2) + ' ₴/$']],
      opts: () => [{ k: 'buy', label: 'Купити', cls: 'pri' }, { k: 'pass', label: 'Пропустити' }], def: 'pass', input: SUMIN,
      act: (c, P, k, inp) => { if (k === 'pass') return 'Пропущено.'; const s = Math.min(Math.floor((+inp.sum || 0) / 1000) * 1000, Math.floor(c.p.cash / 1000) * 1000); if (s <= 0) return 'Сума не вказана.'; c.p.cash -= s; const usd = s / c.w.fx; let a = c.p.assets.find((x) => x.kind === 'bondusd'); if (!a) { a = { id: 'a' + uid6(), kind: 'bondusd', n: 'Валютні ОВДП 3,8%', usd: 0, rate: P.rate, m: c.w.m }; c.p.assets.push(a); } a.usd += usd; return 'Куплено валютних ОВДП на ' + fmtUsd(usd) + '.'; } }),
    EV('s_dep', { t: 'Депозит у банку', draw: (c) => ({ rate: (c.w.rate - 2.5) / 100 }),
      text: (c, P) => 'Банк пропонує строковий депозит у гривні під ' + (P.rate * 100).toFixed(1) + '% річних. З відсотків утримають 23% податку. Гарантія ФГВФО — до 600 000 ₴ в одному банку.',
      rows: (c, P) => [['Ставка', (P.rate * 100).toFixed(1) + '% річних'], ['Після податку', (P.rate * 77).toFixed(1) + '%'], ['Інфляція зараз', '≈' + Math.round((c.w.infl || 0.1) * 100) + '%']],
      opts: () => [{ k: 'buy', label: 'Відкрити депозит', cls: 'pri' }, { k: 'pass', label: 'Пропустити' }], def: 'pass', input: SUMIN,
      act: (c, P, k, inp) => { if (k === 'pass') return 'Пропущено.'; const s = Math.min(Math.floor((+inp.sum || 0) / 1000) * 1000, Math.floor(c.p.cash / 1000) * 1000); if (s <= 0) return 'Сума не вказана.'; c.p.cash -= s; c.p.assets.push({ id: 'a' + uid6(), kind: 'deposit', n: 'Депозит ' + (P.rate * 100).toFixed(1) + '%', amt: s, rate: P.rate, m: c.w.m }); return 'Відкрито депозит на ' + fmt(s) + '.'; },
      tip: 'Якщо ставка депозиту після податку нижча за інфляцію — гроші реально знецінюються.' }),
    RE('s_garage', {}, { n: 'Гараж на Сихові', tag: 'garage', usd: [7500, 10500], rent: [2000, 3000], maint: 150, fin: [{ k: 'cash', down: 1 }], text: 'Капітальний гараж у кооперативі. Здається під склад для інтернет-магазину. Попит стабільний.' }),
    RE('s_park', {}, { n: 'Паркомісце в ЖК', tag: 'garage', usd: [10000, 14000], rent: [2500, 3500], maint: 300, fin: [{ k: 'cash', down: 1 }], text: 'Підземний паркінг у новому ЖК — заодно й укриття. Мешканці охоче орендують.' }),
    RE('s_smart', {}, { n: 'Смарт-квартира 19 м²', tag: 'flat', usd: [23000, 29000], rent: [7000, 9000], maint: 700, fin: [{ k: 'cash', down: 1 }], text: 'Компактна квартира у Львові біля університету. Студенти та ВПО орендують цілий рік.' }),
    RE('s_stryi', {}, { n: '1к квартира у Стрию', tag: 'flat', usd: [27000, 33000], rent: [6500, 8500], maint: 700, fin: [{ k: 'cash', down: 1 }], text: 'Вторинка в райцентрі, потребує косметичного ремонту. Орендарі — переселенці, які працюють на місцевому підприємстві.' }),
    RE('s_land', {}, { kind: 'land', n: 'Ділянка 10 соток під Львовом', tag: 'land', usd: [11000, 17000], rent: [0, 0], fin: [{ k: 'cash', down: 1 }], text: 'Земля під забудову, поряд планують нову дорогу. Доходу не дає, але може подорожчати.' }),
    RE('s_newbuild', { cond: (c) => true }, { kind: 'newbuild', build: 18, n: 'Студія в новобудові', tag: 'newbuild', usd: [28000, 36000], rent: [8500, 11000], maint: 800, fin: [{ k: 'inst', down: 0.3, apr: 0, y: 2, n: 'розстрочка забудовника 0%', kind: 'inst' }, { k: 'cash', down: 1 }], text: 'ЖК на етапі котловану, ціна нижча за ринок на 25%. Ризик: забудовник може заморозити будівництво.' }),
    BIZ('s_vend', { n: 'Кавовий автомат у бізнес-центрі', tag: 'coffee', cost: [120000, 160000], cf: [5000, 8000], vol: .25, offline: 1, text: 'Вендинговий автомат з кавою в БЦ на 400 працівників. Оренда місця і зернова кава — включено в розрахунок.' }),
    BIZ('s_ev', { n: 'Зарядна станція для електромобілів', tag: 'auto', cost: [170000, 220000], cf: [6000, 9000], vol: .2, offline: 1, text: 'Швидка зарядна станція на 2 пости біля супермаркету. Кількість електроавто в Україні швидко зростає.' }),
    BIZ('s_gen', { n: 'Генератори в оренду', tag: 'power', cost: [130000, 180000], cf: [3000, 5000], vol: .3, power: 1, text: 'Парк з 6 генераторів і 4 зарядних станцій. У звичайні місяці дохід скромний, під час блекаутів — у рази більший.' }),
    BIZ('s_prom', { n: 'Інтернет-магазин на Prom', tag: 'shop', cost: [70000, 100000], cf: [3500, 6500], vol: .35, online: 1, text: 'Готовий магазин автотоварів з відгуками та складом у гаражі. Продажі через Prom і Rozetka.' }),
    BIZ('s_tg', { n: 'Telegram-канал оголошень', tag: 'media', cost: [50000, 80000], cf: [3000, 5000], vol: .4, online: 1, text: 'Локальний канал «Робота і оголошення Львів», 28 тис. підписників. Дохід — платні публікації.' }),
    BIZ('s_kiosk', { n: 'Кіоск кави біля зупинки', tag: 'coffee', cost: [280000, 360000], cf: [12000, 18000], vol: .35, offline: 1, text: 'Діючий кіоск «кава з собою» з бариста. Сезонність: взимку продажі вищі.' }),
    BIZ('s_tools', { n: 'Прокат будівельного інструменту', tag: 'tools', cost: [100000, 140000], cf: [5000, 7000], vol: .25, offline: 1, text: 'Перфоратори, бетономішалки, генератори в оренду майстрам. Попит зростає на відбудові.' }),
    BIZ('s_3d', { n: '3D-друк деталей для дронів', tag: 'drone', cost: [80000, 110000], cf: [5000, 8000], vol: .35, war: 1, text: 'Три 3D-принтери, замовлення від виробників FPV-дронів і волонтерів. Залежить від оборонного попиту.' }),
    EV('s_friend', { t: 'Друг просить позичити', draw: (c) => ({ amt: r10(50000 * c.w.cpi) }),
      text: (c, P) => 'Друг відкриває барбершоп і просить позичити ' + fmt(P.amt) + ' під 3% на місяць. Обіцяє повертати відсотки щомісяця.',
      rows: (c, P) => [['Сума', fmt(P.amt)], ['Дохід', fmt(P.amt * 0.03) + '/міс'], ['Ризик', 'Розписка без нотаріуса']],
      opts: (c, P) => [{ k: 'buy', label: 'Позичити', cls: 'pri', dis: c.p.cash < P.amt }, { k: 'pass', label: 'Відмовити' }], def: 'pass',
      act: (c, P, k) => { if (k === 'pass') { c.p.stress = clamp(c.p.stress + 3, 0, 100); return 'Ви відмовили. Друг трохи образився.'; } c.p.cash -= P.amt; c.p.assets.push({ id: 'a' + uid6(), kind: 'loanout', n: 'Позика другу (3%/міс)', amt: P.amt, rate: 0.03, m: c.w.m }); return 'Позичено ' + fmt(P.amt) + '.'; },
      tip: 'Позичаючи друзям, вирішіть наперед: чи готові ви втратити і гроші, і дружбу?' }),
  ]);

  /* ===== ВЕЛИКІ УГОДИ ===== */
  const MORT = (down, apr, y) => ({ k: 'mort', down, apr, y, n: 'іпотека ' + Math.round(apr * 100) + '%', kind: 'mortgage' });
  const BLOAN = (down, apr, y) => ({ k: 'bl', down, apr, y, n: 'кредит для бізнесу ' + Math.round(apr * 100) + '%', kind: 'biz' });
  deck('big', [
    RE('b_flat1', {}, { n: '1к квартира у Львові', tag: 'flat', usd: [62000, 74000], rent: [14000, 17500], maint: 1200, fin: [{ k: 'cash', down: 1 }, MORT(0.3, 0.17, 15)], text: 'Вторинка в Сихівському районі, 42 м², з ремонтом і орендарем. Іпотека з комерційною ставкою — подивіться, чи окупається.', wt: 1.3 }),
    RE('b_flat2', {}, { n: '2к у зданому ЖК', tag: 'flat', usd: [85000, 98000], rent: [19000, 24000], maint: 1600, fin: [{ k: 'cash', down: 1 }, MORT(0.3, 0.16, 15)], text: 'Новий будинок з генератором і укриттям. Попит від айтішників та релокованих компаній.' }),
    RE('b_house', {}, { n: 'Будинок під подобову оренду', tag: 'house', usd: [95000, 120000], rent: [40000, 55000], maint: 9000, fin: [{ k: 'cash', down: 1 }, MORT(0.4, 0.18, 10)], text: 'Котедж біля Брюховичів з сауною. Подобово на вихідні та свята. Дохід сезонний, потрібен менеджер.' }),
    RE('b_comm', {}, { n: 'Комерційне приміщення 60 м²', tag: 'commercial', usd: [75000, 95000], rent: [32000, 42000], maint: 2000, fin: [{ k: 'cash', down: 1 }, MORT(0.4, 0.18, 10)], text: 'Перший поверх на жвавій вулиці, орендар — аптека з договором на 3 роки.' }),
    RE('b_dohid', {}, { n: 'Прибутковий будинок: 4 смарт-квартири', tag: 'flat', usd: [140000, 165000], rent: [32000, 38000], maint: 3500, fin: [MORT(0.4, 0.16, 15), { k: 'cash', down: 1 }], text: 'Реконструйований будинок з 4 студіями під довгострокову оренду. Стабільний потік, але ремонти — за ваш рахунок.' }),
    RE('b_sklad', {}, { n: 'Склад 300 м² для маркетплейсів', tag: 'commercial', usd: [105000, 130000], rent: [45000, 58000], maint: 3000, fin: [MORT(0.4, 0.18, 10), { k: 'cash', down: 1 }], text: 'Склад біля окружної, орендар — логістична компанія для Rozetka та Epicentr. Бум e-commerce.' }),
    BIZ('b_coffee', { n: 'Франшиза кав\'ярні', tag: 'coffee', cost: [1150000, 1400000], cf: [42000, 60000], vol: .3, offline: 1, fin: [{ k: 'cash', down: 1 }, BLOAN(0.5, 0.2, 5)], text: 'Відома українська мережа кав\'ярень: паушальний внесок, обладнання, навчання. Роялті 5% уже враховано. Під час блекаутів без генератора дохід падає.' }),
    BIZ('b_pizza', { n: 'Франшиза піцерії з доставкою', tag: 'food', cost: [2300000, 2800000], cf: [80000, 105000], vol: .3, offline: 1, online: 1, fin: [BLOAN(0.5, 0.2, 5), { k: 'cash', down: 1 }], text: 'Піцерія з власною доставкою і генератором. Під час локдаунів доставка рятує.' }),
    BIZ('b_sto', { n: 'СТО на 2 пости', tag: 'auto', cost: [1700000, 2100000], cf: [62000, 82000], vol: .25, offline: 1, fin: [BLOAN(0.5, 0.19, 5), { k: 'cash', down: 1 }], text: 'Станція техобслуговування з досвідченими майстрами. Автопарк в Україні старіє — роботи вистачає.' }),
    BIZ('b_wash', { n: 'Автомийка самообслуговування', tag: 'auto', cost: [3000000, 3600000], cf: [90000, 120000], vol: .3, offline: 1, fin: [BLOAN(0.5, 0.19, 7), { k: 'cash', down: 1 }], text: '4 пости самообслуговування без персоналу. Дуже залежить від світла.' }),
    BIZ('b_santeh', { n: 'Магазин сантехніки біля новобудов', tag: 'shop', cost: [2000000, 2500000], cf: [65000, 90000], vol: .25, offline: 1, fin: [BLOAN(0.5, 0.2, 5), { k: 'cash', down: 1 }], text: 'Ви знаєте цей бізнес зсередини: товар, оренда, 2 продавці. Поруч здають три ЖК — ремонти на роки.' }),
    BIZ('b_fpv', { n: 'Частка 20% у виробництві FPV-дронів', tag: 'drone', cost: [1400000, 1800000], cf: [55000, 80000], vol: .45, war: 1, fin: [{ k: 'cash', down: 1 }], text: 'Українська оборонна компанія з державними контрактами через Brave1 і Prozorro. Високий дохід, але залежить від війни та контрактів.' }),
    BIZ('b_solar', { n: 'Сонячна станція 50 кВт', tag: 'power', cost: [1300000, 1600000], cf: [32000, 42000], vol: .15, solar: 1, fin: [BLOAN(0.3, 0.12, 7), { k: 'cash', down: 1 }], text: 'СЕС на даху складу, енергію купує сусідній бізнес. Пільговий кредит на енергонезалежність 12%. Не боїться блекаутів.' }),
    BIZ('b_vend6', { n: 'Мережа з 6 кавових автоматів', tag: 'coffee', cost: [600000, 720000], cf: [26000, 34000], vol: .25, offline: 1, fin: [{ k: 'cash', down: 1 }, BLOAN(0.5, 0.21, 3)], text: 'Автомати в лікарнях та університетах. Потрібно 2 години на тиждень на обслуговування.' }),
    BIZ('b_aischool', { n: 'Онлайн-школа «ШІ для бізнесу» (30%)', tag: 'edu', cost: [800000, 1000000], cf: [35000, 55000], vol: .4, online: 1, ai: 1, fin: [{ k: 'cash', down: 1 }], text: 'Курси з автоматизації для підприємців. Попит величезний, але конкуренція зростає щомісяця.' }),
    BIZ('b_laundry', { n: 'Пральня самообслуговування', tag: 'service', cost: [1000000, 1250000], cf: [36000, 46000], vol: .2, offline: 1, fin: [BLOAN(0.5, 0.2, 5), { k: 'cash', down: 1 }], text: 'Пральня біля гуртожитків, з генератором і Starlink. Стабільна, але вимагає контролю.' }),
  ]);

  /* ===== РИНОК ===== */
  function SELLOFFER(id, o) {
    return { id, wt: o.wt || 1, t: o.t, def: 'pass', pub: 1, match: o.match, price: o.price,
      draw: (c) => ({ k: o.k[0] + rnd() * (o.k[1] - o.k[0]) }),
      view: (c, P) => {
        const list = c.p.assets.filter(o.match);
        if (!list.length) return { text: o.text + '\n\nУ вас немає таких активів — подія вас не стосується.', rows: [], opts: [{ k: 'pass', label: 'Далі' }] };
        const opts = list.map((a) => ({ k: 'sell:' + a.id, label: 'Продати «' + a.n + '» за ' + fmt(o.price(a, c, P)), cls: 'good' })); opts.push({ k: 'pass', label: 'Не продавати' });
        return { text: o.text, rows: list.map((a) => [a.n, 'зараз ~' + fmt(assetValue(a, c.w)) + ' · дохід ' + fmt(assetIncome(a, c.w, c.p)) + '/міс']), opts };
      },
      act: (c, P, k) => { if (k === 'pass') return 'Ви нічого не продали.'; const aid = k.split(':')[1]; const a = c.p.assets.find((x) => x.id === aid); if (!a) return 'Актив не знайдено.'; if (a.kind === 'crypto' || a.kind === 'stock') return sellSec(c.g, c.p, aid); return sellAsset(c.g, c.p, aid, Math.round(o.price(a, c, P))); },
      tip: o.tip };
  }
  deck('market', [
    SELLOFFER('m_flat', { t: 'Покупець на квартиру', k: [1.1, 1.25], match: (a) => a.kind === 're' && (a.tag === 'flat'), price: (a, c, P) => reVal(a, c.w) * P.k, text: 'IT-компанія релокує команду до Львова. Покупець готовий заплатити вище ринку за квартиру з ремонтом.', tip: 'Продаючи нерухомість, яка була у власності менше 3 років, сплачується податок.' }),
    SELLOFFER('m_land', { t: 'Біля ділянки будують дорогу', k: [1.6, 2.2], match: (a) => a.kind === 'land', price: (a, c, P) => reVal(a, c.w) * P.k, text: 'Затвердили проєкт об\'їзної дороги. Забудовник скуповує ділянки поряд.' }),
    SELLOFFER('m_garage', { t: 'Попит на гаражі та паркінги', k: [1.2, 1.4], match: (a) => a.tag === 'garage', price: (a, c, P) => reVal(a, c.w) * P.k, text: 'Мешканці ЖК шукають паркомісця та сховища. Сусід пропонує хорошу ціну.' }),
    SELLOFFER('m_biz', { t: 'Інвестор купує бізнес', k: [24, 32], match: (a) => a.kind === 'biz', price: (a, c, P) => Math.max(a.cost * 0.6, a.cf * P.k), text: 'Інвестор з Варшави шукає діючий бізнес в Україні, оцінює за кратністю місячного прибутку.', tip: 'Малий бізнес зазвичай продають за 18–36 місячних прибутків.' }),
    SELLOFFER('m_comm', { t: 'Мережа шукає приміщення', k: [1.15, 1.3], match: (a) => a.tag === 'commercial' || a.tag === 'house', price: (a, c, P) => reVal(a, c.w) * P.k, text: 'Велика продуктова мережа розширюється і викуповує комерційні приміщення.' }),
    SELLOFFER('m_nb', { t: 'Перепродаж у новобудові', k: [1.15, 1.35], match: (a) => a.kind === 'newbuild', price: (a, c, P) => reVal(a, c.w) * P.k, text: 'Будівництво йде за графіком, ціни в ЖК зросли. Можна продати переуступкою.' }),
    SELLOFFER('m_crypto', { t: 'Крипторинок на піку', wt: .8, k: [1, 1], match: (a) => a.kind === 'crypto', price: (a, c) => a.qty * c.w.px[a.sym] * c.w.fx * 0.99, text: 'Біткоїн оновлює максимуми, в TikTok усі «криптоексперти». Може, час фіксувати прибуток?' }),
    EV('m_tenant', { t: 'Орендар з\'їхав', cond: (c) => c.p.assets.some((a) => a.kind === 're'), draw: (c) => { const a = pick(c.p.assets.filter((x) => x.kind === 're')); return { aid: a.id }; },
      text: (c, P) => { const a = c.p.assets.find((x) => x.id === P.aid); return 'Орендар квартири «' + (a ? a.n : '') + '» з\'їхав без попередження. Пошук нового займе 2 місяці, ріелтору — 50% місячної оренди.'; },
      act: (c, P) => { const a = c.p.assets.find((x) => x.id === P.aid); if (!a) return 'Нічого не сталося.'; a.vac = 2; return 'Два місяці без оренди. Комісія ріелтора: ' + fmt(a.rent / 2) + '.' + spend(c.g, c.p, a.rent / 2); } }),
    EV('m_rentup', { t: 'Оренда подорожчала', cond: (c) => c.p.assets.some((a) => a.kind === 're' && a.tag === 'flat'), text: 'Через приплив переселенців ціни на оренду у Львові зросли на 10%.', act: (c) => { let n = 0; c.p.assets.forEach((a) => { if (a.kind === 're' && a.tag === 'flat') { a.rent = r100(a.rent * 1.1); n++; } }); return 'Оренда ' + n + ' об\'єктів зросла на 10%.'; } }),
    EV('m_compet', { t: 'Конкурент поруч', cond: (c) => c.p.assets.some((a) => a.kind === 'biz' && (a.tag === 'coffee' || a.tag === 'food')), text: 'Навпроти відкрилась кав\'ярня великої мережі з агресивними знижками.', act: (c) => { const a = c.p.assets.find((x) => x.kind === 'biz' && (x.tag === 'coffee' || x.tag === 'food')); a.cf = r100(a.cf * 0.8); return '«' + a.n + '»: прибуток знизився на 20%.'; } }),
    EV('m_tax', { t: 'Податкова перевірка', cond: (c) => c.p.assets.some((a) => a.kind === 'biz'), draw: (c) => ({ amt: r10(rint(15000, 40000) * c.w.cpi) }), text: 'Податкова провела фактичну перевірку: РРО, оформлення працівників, ліцензії. Знайшли порушення.', rows: (c, P) => [['Штраф', fmt(P.amt)]], act: (c, P) => 'Сплачено штраф.' + spend(c.g, c.p, P.amt), tip: 'Офіційне оформлення працівників і ПРРО дешевші за штрафи.' }),
    EV('m_friend', { t: 'Друг і позика', cond: (c) => c.p.assets.some((a) => a.kind === 'loanout'), text: 'Друг з барбершопом вийшов на зв\'язок…', act: (c) => { const a = c.p.assets.find((x) => x.kind === 'loanout'); if (rnd() < 0.55) { c.p.cash += a.amt; c.p.assets = c.p.assets.filter((x) => x.id !== a.id); return 'Друг повернув усю суму ' + fmt(a.amt) + '. Дружба вціліла!'; } c.p.assets = c.p.assets.filter((x) => x.id !== a.id); c.p.stress = clamp(c.p.stress + 12, 0, 100); return 'Барбершоп закрився. Друг не може повернути ' + fmt(a.amt) + ' і перестав відповідати.'; } }),
    EV('m_missile', { t: 'Ракетний удар поруч', cond: (c) => c.p.assets.some((a) => a.kind === 're'), wt: .8, draw: (c) => { const a = pick(c.p.assets.filter((x) => x.kind === 're')); return { aid: a.id, amt: r100(reVal(a, c.w) * (0.06 + rnd() * 0.1)) }; },
      text: (c, P) => { const a = c.p.assets.find((x) => x.id === P.aid); return 'Вибуховою хвилею пошкоджено вікна, фасад і покрівлю об\'єкта «' + (a ? a.n : '') + '». Ніхто не постраждав.'; }, rows: (c, P) => [['Ремонт', fmt(P.amt)], ['Страхування майна', c.p.ins.prop ? 'є' : 'немає']],
      act: (c, P) => { c.p.stress = clamp(c.p.stress + 10, 0, 100); if (c.p.ins.prop) return 'Страховка з воєнними ризиками покрила ремонт ' + fmt(P.amt) + '.'; return 'Ремонт за власний рахунок: ' + fmt(P.amt) + '. Можна подати заяву на «єВідновлення», але виплата не скоро.' + spend(c.g, c.p, P.amt); }, tip: 'Страхування нерухомості з воєнними ризиками коштує ~0,5–1% вартості на рік.' }),
    EV('m_nbfreeze', { t: 'Забудовник заморозив будівництво', cond: (c) => c.p.assets.some((a) => a.kind === 'newbuild'), text: 'Забудовник ЖК не має коштів, будівництво стоїть. Інвестори створюють ініціативну групу.', act: (c) => { const a = c.p.assets.find((x) => x.kind === 'newbuild'); a.usd = Math.round(a.usd * 0.5); a.doneM = c.w.m + 30; c.p.stress = clamp(c.p.stress + 15, 0, 100); return '«' + a.n + '» знецінився вдвічі, здача відкладена на 2,5 роки.'; }, tip: 'Перед купівлею на котловані перевіряйте документи на землю, дозвіл ДАБІ та історію забудовника.' }),
    EV('m_osbb', { t: 'ОСББ збирає гроші', cond: (c) => c.p.assets.some((a) => a.kind === 're' && a.tag === 'flat'), draw: (c) => ({ n: c.p.assets.filter((a) => a.kind === 're' && a.tag === 'flat').length }), text: 'ОСББ вирішило облаштувати укриття та купити генератор для ліфтів і насосів. Внесок — 6 000 ₴ з квартири.', rows: (c, P) => [['Об\'єктів', P.n], ['Разом', fmt(P.n * 6000)]], act: (c, P) => 'Сплачено ' + fmt(P.n * 6000) + '.' + spend(c.g, c.p, P.n * 6000) }),
    EV('m_bump', { t: 'Ринок США на максимумах', text: 'Американські індекси оновили рекорди на сильних звітах компаній.', act: (c) => { c.w.px.SPX = +(c.w.px.SPX * 1.06).toFixed(2); c.w.px.AI = +(c.w.px.AI * 1.09).toFixed(2); return 'S&P 500 +6%, фонд ШІ +9%.'; } }),
    EV('m_split', { t: 'Спліт акцій', pub: 1, cond: (c) => Object.values(c.g.players).some((p) => p.assets.some((a) => a.kind === 'tk')), draw: (c) => { const held = []; Object.values(c.g.players).forEach((p) => p.assets.forEach((a) => { if (a.kind === 'tk') held.push(a.sym); })); const sym = pick(held); const rev = rnd() < 0.35; return { sym, rev }; },
      text: (c, P) => P.rev ? 'Зворотний спліт ' + P.sym + ' 1:2 — кількість акцій у всіх власників зменшилась удвічі.' : 'Спліт ' + P.sym + ' 2:1 — кожна акція перетворилась на дві. У всіх власників кількість подвоїлась.',
      act: (c, P) => { let n = 0; allP(c.g, (p) => p.assets.forEach((a) => { if (a.kind === 'tk' && a.sym === P.sym) { a.qty = P.rev ? Math.floor(a.qty / 2) : a.qty * 2; n++; } })); allP(c.g, (p) => { p.assets = p.assets.filter((a) => !(a.kind === 'tk' && a.qty < 1)); }); return (P.rev ? 'Зворотний спліт ' : 'Спліт ') + P.sym + ' застосовано до ' + n + ' гравців.'; } }),
    EV('m_bust', { t: 'Компанія збанкрутувала', wt: .3, pub: 1, cond: (c) => Object.values(c.g.players).some((p) => p.assets.some((a) => a.kind === 'tk')), draw: (c) => { const held = []; Object.values(c.g.players).forEach((p) => p.assets.forEach((a) => { if (a.kind === 'tk') held.push(a.sym); })); return { sym: pick(held) }; },
      text: (c, P) => P.sym + ': аудит виявив приховані борги, компанія оголосила банкрутство. Акції ' + P.sym + ' у всіх гравців знецінились.',
      act: (c, P) => { allP(c.g, (p) => { p.assets = p.assets.filter((a) => !(a.kind === 'tk' && a.sym === P.sym)); }); c.w.tk[P.sym] = 0.5; return 'Акції ' + P.sym + ' списано у всіх власників.'; }, tip: 'Не тримайте всі гроші в одній компанії.' }),
    EV('m_fxjump', { t: 'Гривня послабилася', text: 'НБУ дозволив курсу рухатися гнучкіше. Долар подорожчав.', act: (c) => { c.w.fx = +(c.w.fx * 1.025).toFixed(2); return 'Курс ' + c.w.fx.toFixed(2) + ' ₴/$. Доларові активи подорожчали в гривні, імпорт — теж.'; } }),
  ]);

  /* ===== ВИТРАТИ ===== */
  deck('spend', [
    SPEND('d_pothole', { t: 'Яма на дорозі', amt: 9500, car: 1, cond: (c) => c.p.car, text: 'Влетіли в яму на Городоцькій: диск, шина, розвал-сходження.' }),
    SPEND('d_boiler', { t: 'Зламався бойлер', amt: 7800, text: 'Бойлер потік, затопив сусідів знизу. Новий бойлер + дрібний ремонт у сусідів.' }),
    SPEND('d_wedding', { t: 'Весілля друга', amt: (c) => r10(200 * c.w.fx), text: 'Найкращий друг одружується. У конверт — $200, менше незручно.', stress: -3 }),
    SPEND('d_ecoflow', { t: 'Зарядна станція для дому', amt: 32000, cond: (c) => !c.p.gen, opt: 1, yes: 'Купити', no: 'Перетерпіти', noStress: 4, text: 'Енергетики попереджають про важку зиму. Зарядна станція з сонячною панеллю дозволить працювати з дому під час відключень.', then: (c) => { c.p.gen = 1; return 'Тепер блекаути менше впливають на ваш стрес.'; } }),
    SPEND('d_fine', { t: 'Штраф за перевищення', amt: 1700, cond: (c) => c.p.car, text: 'Камера автофіксації: +32 км/год. Штраф надійшов у Дію.' }),
    SPEND('d_ny', { t: 'Новорічні подарунки', amt: 7000, text: 'Подарунки рідним, корпоратив, стіл. Свята є свята.', stress: -4 }),
    SPEND('d_vac', { t: 'Відпустка в Карпатах', amt: 22000, opt: 1, yes: 'Поїхати', no: 'Не цього разу', noStress: 6, text: 'Тиждень у Яремчі: колиба, чани, гори. Колеги кажуть, ви виглядаєте втомленим.', stress: -18, health: 3 }),
    SPEND('d_iphone', { t: 'Новий iPhone', amt: 0, opt: 1, yes: 'Взяти в розстрочку', no: 'Старий ще працює', text: 'Вийшов новий iPhone. «Оплата частинами» на 10 місяців, перший платіж зараз.', rows: () => [['Розстрочка', '5 200 ₴/міс × 10']], then: (c) => { c.p.liabs.push({ id: 'l' + uid6(), n: 'Розстрочка на новий iPhone', bal: 52000, pay: 5200, kind: 'inst', apr: 0 }); c.p.stress = clamp(c.p.stress - 5, 0, 100); return 'Додано розстрочку 5 200 ₴/міс на 10 місяців.'; }, tip: 'Розстрочка на гаджети — це пасив: він забирає гроші з вашої кишені щомісяця.' }),
    SPEND('d_course', { t: 'Курс «Як стати мільйонером»', amt: 15000, opt: 1, yes: 'Оплатити курс', no: 'Пройти повз', text: 'Інфлюенсер на орендованому Lamborghini обіцяє пасивний дохід від $5 000 на місяць за 30 днів.', then: () => 'Курс виявився переказом очевидних речей і продажем наступного «VIP-рівня» за $2 000.', tip: 'Якщо хтось продає секрет багатства — його багатство, найімовірніше, з продажу курсів.' }),
    SPEND('d_washer', { t: 'Зламалася пральна машина', amt: 5200, text: 'Майстер каже: підшипник і насос. Ремонт дешевше за нову.' }),
    SPEND('d_screen', { t: 'Розбитий телефон', amt: 6400, text: 'Телефон вислизнув з кишені в маршрутці. Заміна екрану в сервісі.' }),
    SPEND('d_concert', { t: 'Концерт улюбленого гурту', amt: 3800, opt: 1, yes: 'Піти', no: 'Пропустити', text: 'Благодійний концерт на підтримку ЗСУ на «Арені Львів». Квитки на двох.', stress: -8 }),
    SPEND('d_utility', { t: 'Зимова комуналка', amt: 4200, text: 'Опалювальний сезон: новий тариф на тепло і світло. Квитанція більша, ніж ви чекали.' }),
    SPEND('d_vet', { t: 'Ветеринар для кота', amt: 4500, text: 'Кіт з\'їв дощик з ялинки. Операція в ветклініці.', stress: 3 }),
    SPEND('d_tires', { t: 'Зимова гума', amt: 16000, car: 1, cond: (c) => c.p.car, text: 'Старі шини вже лисі, а прогноз — ожеледиця. Комплект на 4 колеса.' }),
    SPEND('d_kidbd', { t: 'День народження дитини', amt: 6500, cond: (c) => c.p.kids > 0, text: 'Аніматор, торт, подарунок і 8 друзів з садочка.', stress: -2 }),
    SPEND('d_school', { t: 'Дитина йде до школи', amt: 14000, cond: (c) => c.p.kids > 0, text: 'Рюкзак, форма, ноутбук для дистанційки, «внесок у фонд класу».' }),
    SPEND('d_latte', { t: 'Латте-фактор', amt: 0, opt: 1, yes: 'Без кави — ніяк', no: 'Варитиму вдома', text: 'Кава з собою щоранку + обіди в кафе. Ви підрахували: це ~2 800 ₴ на місяць.', then: (c) => { c.p.recur = (c.p.recur || []).concat([{ n: 'Кава та обіди поза домом', a: 2800 }]); c.p.stress = clamp(c.p.stress - 3, 0, 100); return 'Нова щомісячна витрата 2 800 ₴.'; }, tip: '2 800 ₴ щомісяця, вкладені під 15% річних, за 10 років перетворюються на ~770 000 ₴.' }),
    SPEND('d_subs', { t: 'Підписки накопичилися', amt: 0, text: 'Netflix, YouTube Premium, Spotify, хмара, дві ШІ-підписки. Ви навіть не помітили, як їх стало сім.', then: (c) => { c.p.recur = (c.p.recur || []).concat([{ n: 'Підписки (7 сервісів)', a: 1100 }]); return 'Нова щомісячна витрата 1 100 ₴. Її можна скасувати в розділі «Життя».'; } }),
    SPEND('d_dentist_kid', { t: 'Брекети дитині', amt: 38000, medical: 1, dental: 1, cond: (c) => c.p.kids > 0, text: 'Ортодонт каже: зараз або ніколи.' }),
    SPEND('d_car_repair', { t: 'Ремонт авто', amt: 18500, car: 1, cond: (c) => c.p.car, text: 'Зчеплення та ГРМ. Майстер на СТО каже «повезло, що вчасно».' }),
    SPEND('d_fuel', { t: 'Подорожчало пальне', amt: 2500, cond: (c) => c.p.car, text: 'Через удари по НПЗ і дорогу нафту ціни на АЗС зросли.' }),
  ]);

  /* ===== ЗДОРОВ'Я ===== */
  deck('health', [
    EV('h_flu', { t: 'Грип', draw: (c) => ({ amt: r10(3500 * c.w.cpi) }), text: 'Температура 39, тиждень на лікарняному. Ліки, аналізи, лікар.', rows: (c, P) => [['Лікування', fmt(P.amt)]], act: (c, P) => { let m = medical(c.g, c.p, P.amt); c.p.health = clamp(c.p.health - 5, 0, 100); if (c.p.emp !== 'emp') { const l = Math.round(c.p.sal * 0.2); m += ' ФОП не отримує лікарняних: втрата доходу ' + fmt(l) + '.' + spend(c.g, c.p, l); } else m += ' Лікарняний оплачено.'; return m; } }),
    EV('h_teeth', { t: 'Зуби', draw: (c) => ({ amt: r10(28000 * c.w.cpi) }), text: 'Біль у зубі виявився запущеним каріесом. Потрібна імплантація.', rows: (c, P) => [['Імплант під ключ', fmt(P.amt)]], act: (c, P) => medical(c.g, c.p, P.amt, 1), tip: 'Профілактичний огляд у стоматолога двічі на рік у рази дешевший за лікування.' }),
    EV('h_back', { t: 'Біль у спині', draw: (c) => ({ amt: r10(9000 * c.w.cpi) }), text: 'Сидяча робота дала про себе знати: протрузія. МРТ, невролог, масажі.', rows: (c, P) => [['Лікування', fmt(P.amt)]], act: (c, P) => { c.p.health = clamp(c.p.health - 6, 0, 100); return medical(c.g, c.p, P.amt) + (c.p.well.gym ? '' : ' Лікар радить спорт.'); } }),
    EV('h_appendix', { t: 'Апендицит', draw: (c) => ({ amt: r10(38000 * c.w.cpi) }), text: 'Швидка вночі, екстрена операція. Формально безкоштовно, по факту — ліки, витратні матеріали, «подяка».', rows: (c, P) => [['Витрати', fmt(P.amt)]], act: (c, P) => { c.p.health = clamp(c.p.health - 10, 0, 100); return medical(c.g, c.p, P.amt); } }),
    EV('h_accident', { t: 'ДТП', wt: .7, draw: (c) => ({ amt: r10(65000 * c.w.cpi) }), text: 'Таксі, в якому ви їхали, потрапило в ДТП. Перелом руки, місяць у гіпсі.', rows: (c, P) => [['Лікування', fmt(P.amt)], ['Страхування життя', c.p.ins.life ? 'є' : 'немає']], act: (c, P) => { let m = ''; if (c.p.ins.life) { c.p.cash += 80000; m = 'Страхування від нещасного випадку виплатило 80 000 ₴. '; } c.p.health = clamp(c.p.health - 15, 0, 100); c.p.stress = clamp(c.p.stress + 8, 0, 100); m += medical(c.g, c.p, P.amt); if (c.p.emp !== 'emp') { c.p.cut = { left: 1, k: 0.3 }; m += ' Наступного місяця дохід ФОП впаде на 70%.'; } return m; } }),
    EV('h_checkup', { t: 'Чекап організму', draw: (c) => ({ amt: r10(6500 * c.w.cpi) }), text: 'Клініка пропонує повний чекап: аналізи, УЗД, кардіолог. Вчасно виявлені проблеми лікуються дешевше.', rows: (c, P) => [['Вартість', fmt(P.amt)]], opts: () => [{ k: 'ok', label: 'Пройти', cls: 'pri' }, { k: 'pass', label: 'Відкласти' }], def: 'pass', act: (c, P, k) => { if (k === 'pass') return 'Відкладено «на потім».'; c.p.health = clamp(c.p.health + 12, 0, 100); return 'Все під контролем. Здоров\'я +12.' + spend(c.g, c.p, c.p.ins.dms ? 0 : P.amt) + (c.p.ins.dms ? ' Покрито ДМС.' : ''); } }),
    EV('h_covid', { t: 'Вірус', draw: (c) => ({ amt: r10(8000 * c.w.cpi) }), text: 'Новий штам коронавірусу: два тижні слабкості, кашель, ПЛР-тести.', rows: (c, P) => [['Ліки та аналізи', fmt(P.amt)]], act: (c, P) => { c.p.health = clamp(c.p.health - 8, 0, 100); let m = medical(c.g, c.p, P.amt); if (c.p.emp !== 'emp') { const l = Math.round(c.p.sal * 0.3); m += ' Втрачено 30% доходу ФОП: ' + fmt(l) + '.' + spend(c.g, c.p, l); } return m; } }),
    EV('h_insomnia', { t: 'Безсоння', text: 'Тривожні новини, нічні тривоги, робота до ночі. Спите по 5 годин.', act: (c) => { c.p.health = clamp(c.p.health - 5, 0, 100); c.p.stress = clamp(c.p.stress + 8, 0, 100); return 'Здоров\'я −5, стрес +8.'; }, tip: 'Сон 7–8 годин — найдешевша інвестиція в продуктивність.' }),
    EV('h_heart', { t: 'Проблеми з серцем', wt: .5, cond: (c) => c.p.stress > 55 || c.p.age > 40, draw: (c) => ({ amt: r10(150000 * c.w.cpi) }), text: 'Хронічний стрес і перевтома: аритмія, госпіталізація, абляція.', rows: (c, P) => [['Лікування', fmt(P.amt)], ['Страхування життя', c.p.ins.life ? 'покриває критичні хвороби' : 'немає']], act: (c, P) => { let m = ''; if (c.p.ins.life) { c.p.cash += 400000; m = 'Страхування життя виплатило 400 000 ₴. '; } c.p.health = clamp(c.p.health - 20, 0, 100); return m + medical(c.g, c.p, P.amt); } }),
  ]);

  /* ===== ПСИХОЛОГІЯ ===== */
  deck('psy', [
    EV('p_therapist', { t: 'Психолог', draw: (c) => ({ amt: r10(6000 * c.w.cpi) }), text: 'Друг радить психотерапевтку: 4 сесії допоможуть розібратися з тривогою і рішеннями про гроші.', rows: (c, P) => [['4 сесії', fmt(P.amt)], ['Ваш стрес', c.p.stress + '/100']], opts: () => [{ k: 'ok', label: 'Записатися', cls: 'pri' }, { k: 'pass', label: 'Впораюся сам' }], def: 'pass', act: (c, P, k) => { if (k === 'pass') return 'Ви вирішили впоратися самостійно.'; c.p.stress = clamp(c.p.stress - 25, 0, 100); return 'Стрес −25.' + spend(c.g, c.p, P.amt); }, tip: 'Рішення під стресом — найдорожчі. Психічне здоров\'я впливає на фінанси напряму.' }),
    EV('p_casino', { t: 'Онлайн-казино', draw: (c) => ({ amt: r10(10000 * c.w.cpi) }), text: 'Реклама в Telegram: «Ліцензія КРАІЛ, бонус 200% на перший депозит». Колега каже, що виграв 40 000.', rows: (c, P) => [['Ставка', fmt(P.amt)]], opts: () => [{ k: 'ok', label: 'Спробувати', cls: 'bad' }, { k: 'pass', label: 'Ні, дякую', cls: 'pri' }], def: 'pass',
      act: (c, P, k) => { if (k === 'pass') return 'Ви не піддалися. Казино завжди у виграші.'; const r = rnd(); if (r < 0.72) { c.p.stress = clamp(c.p.stress + 12, 0, 100); return 'Програно все: ' + fmt(P.amt) + '. Хочеться «відігратися»…' + spend(c.g, c.p, P.amt); } if (r < 0.92) { c.p.stress += 6; return 'Програно половину.' + spend(c.g, c.p, P.amt / 2); } c.p.cash += P.amt * 1.5; return 'Виграш ' + fmt(P.amt * 1.5) + '! Саме так казино і затягує.'; }, tip: 'Ігрова залежність визнана хворобою. Якщо азарт не відпускає — «Лінія довіри» та психолог допоможуть.' }),
    EV('p_fomo', { t: 'FOMO', draw: (c) => { c.w.px.MEME = +(c.w.px.MEME * 1.8).toFixed(5); return {}; }, text: 'Всі в робочому чаті купують мемкоін $PAPUGA — за тиждень х3. Страшно пропустити.', rows: (c) => [['Ціна', '$' + c.w.px.MEME.toFixed(4)]], opts: () => [{ k: 'ok', label: 'Закинути 20 000 ₴', cls: 'bad' }, { k: 'pass', label: 'Пропустити хайп', cls: 'pri' }], def: 'pass', act: (c, P, k) => { if (k === 'pass') { c.p.stress = clamp(c.p.stress + 3, 0, 100); return 'Ви пропустили. Трохи заздрісно.'; } return buySec(c.g, c.p, 'MEME', Math.min(20000, Math.max(0, c.p.cash))); } }),
    EV('p_news', { t: 'Тривожні новини', text: 'Ви годинами гортаєте Telegram-канали. Тривога росте, працювати важко.', opts: () => [{ k: 'ok', label: 'Інформаційний детокс', cls: 'pri' }, { k: 'pass', label: 'Ще трохи погортаю' }], def: 'pass', act: (c, P, k) => { if (k === 'ok') { c.p.stress = clamp(c.p.stress - 6, 0, 100); return 'Ви лишили 2 перевірені джерела і вимкнули сповіщення. Стрес −6.'; } c.p.stress = clamp(c.p.stress + 10, 0, 100); return 'Стрес +10.'; } }),
    EV('p_family', { t: 'Розмова про гроші вдома', text: (c) => 'Партнер питає: «Що буде, якщо ти втратиш роботу? У нас є запас?»', act: (c) => { const st = statement(c.p, c.w); if (c.p.cash >= st.out * 3) { c.p.stress = clamp(c.p.stress - 6, 0, 100); return 'Подушка безпеки на ' + (c.p.cash / st.out).toFixed(1) + ' міс витрат — розмова пройшла спокійно. Стрес −6.'; } c.p.stress = clamp(c.p.stress + 14, 0, 100); return 'Запасу менше ніж на 3 місяці — сварка. Стрес +14.'; }, tip: 'Подушка безпеки — 3–6 місяців витрат на окремому рахунку.' }),
    EV('p_burnout', { t: 'Перевтома', text: (c) => c.p.stress >= 60 ? 'Ви працюєте на автоматі, все дратує. Ознаки вигорання.' : 'Ви помітили, що втомлюєтесь швидше, але ще в ресурсі.', act: (c) => { if (c.p.stress >= 60 && c.p.track === 'rat') { const l = Math.round(salaryNow(c.p) * 0.3); c.p.stress -= 10; return 'Тиждень лікарняного й зрив дедлайнів: втрата ' + fmt(l) + '.' + spend(c.g, c.p, l); } c.p.stress = clamp(c.p.stress - 3, 0, 100); return 'Ви вчасно взяли вихідний. Стрес −3.'; } }),
    EV('p_mentor', { t: 'Фінансовий консультант', draw: (c) => ({ amt: r10(3000 * c.w.cpi) }), text: 'Незалежний фінансовий консультант пропонує розібрати ваш бюджет за годину.', rows: (c, P) => [['Консультація', fmt(P.amt)]], opts: () => [{ k: 'ok', label: 'Записатися', cls: 'pri' }, { k: 'pass', label: 'Не треба' }], def: 'pass', act: (c, P, k) => { if (k === 'pass') return 'Пропущено.'; c.p.stress = clamp(c.p.stress - 5, 0, 100); return 'Порада: ' + adviceFor(c.p, c.w) + spend(c.g, c.p, P.amt); } }),
    EV('p_impulse', { t: 'Імпульсивні покупки', cond: (c) => c.p.stress > 45, draw: (c) => ({ amt: r10(rint(5000, 12000) * c.w.cpi) }), text: 'Важкий тиждень — ви «заслужили». Кошик на Rozetka сам себе не оформить.', rows: (c, P) => [['Покупки', fmt(P.amt)]], act: (c, P) => { c.p.stress = clamp(c.p.stress - 4, 0, 100); return 'Витрачено ' + fmt(P.amt) + '. Радість тривала два дні.' + spend(c.g, c.p, P.amt); }, tip: 'Правило 48 годин: відкладіть неплановану покупку на два дні.' }),
    EV('p_sport', { t: 'Спорт', cond: (c) => !c.p.well.gym, text: 'Колега кличе в спортзал. Абонемент 1 400 ₴/міс. Спорт знижує стрес і береже здоров\'я.', opts: () => [{ k: 'ok', label: 'Купити абонемент', cls: 'pri' }, { k: 'pass', label: 'Не зараз' }], def: 'pass', act: (c, P, k) => { if (k === 'pass') return 'Може, згодом.'; c.p.well.gym = 1; return 'Абонемент оформлено: −1 400 ₴/міс, стрес і здоров\'я покращуватимуться щомісяця.'; } }),
  ]);

  /* ===== ПІДРОБІТОК ===== */
  const GIGS = [
    { n: 'Таксі вечорами', a: 9000, s: 8, h: -3, cond: (p) => p.car },
    { n: 'Фриланс на Upwork', a: (p, w) => r100((p.ai >= 40 ? 420 : 180) * w.fx), s: 5 },
    { n: 'Репетиторство онлайн', a: 6500, s: 4 },
    { n: 'Монтаж сантехніки на вихідних', a: 12000, s: 7, h: -2 },
    { n: 'Доставка Glovo на велосипеді', a: 5500, s: 5, h: 2 },
    { n: 'SMM для знайомого бізнесу', a: 7000, s: 4 },
    { n: 'Налаштування ШІ-ботів для бізнесу', a: 15000, s: 5, cond: (p) => p.ai >= 50 },
  ];
  deck('gig', [EV('g_gig', { t: 'Підробіток', draw: (c) => { const l = GIGS.filter((x) => !x.cond || x.cond(c.p)); const gg = pick(l); const a = typeof gg.a === 'function' ? gg.a(c.p, c.w) : r100(gg.a * c.w.cpi); return { n: gg.n, a, s: gg.s, h: gg.h || 0 }; },
    text: (c, P) => 'Є можливість підзаробити: «' + P.n + '». Можна разово, а можна зробити регулярним — але це навантаження і стрес.',
    rows: (c, P) => [['Разово', '+' + fmt(P.a)], ['Регулярно', '+' + fmt(P.a * 0.8) + '/міс, стрес +' + Math.ceil(P.s / 2) + '/міс'], ['Активних підробітків', (c.p.gigs || []).length]],
    opts: (c) => [{ k: 'once', label: 'Взятися разово', cls: 'pri' }, { k: 'reg', label: 'Зробити регулярним', dis: (c.p.gigs || []).length >= 2 }, { k: 'pass', label: 'Відпочити' }], def: 'pass',
    act: (c, P, k) => { if (k === 'pass') { c.p.stress = clamp(c.p.stress - 3, 0, 100); return 'Ви відпочили. Стрес −3.'; } if (k === 'once') { c.p.cash += P.a; c.p.stress = clamp(c.p.stress + P.s, 0, 100); c.p.health = clamp(c.p.health + P.h, 0, 100); return 'Зароблено ' + fmt(P.a) + '. Стрес +' + P.s + '.'; } c.p.gigs = (c.p.gigs || []).concat([{ n: P.n, a: Math.round(P.a * 0.8), s: Math.ceil(P.s / 2) }]); return 'Новий регулярний дохід ' + fmt(P.a * 0.8) + '/міс.'; },
    tip: 'Підробіток — активний дохід. Вкладайте його, щоб створити пасивний.' })]);

  /* ===== ШІ ===== */
  deck('ai', [
    EV('ai_course', { t: 'Курс зі штучного інтелекту', draw: (c) => ({ amt: r10(12000 * c.w.cpi) }), text: 'Практичний курс: як автоматизувати свою роботу за допомогою ШІ-агентів. 6 тижнів по вечорах.', rows: (c, P) => [['Вартість', fmt(P.amt)], ['Ваш рівень ШІ', c.p.ai + '/100'], ['Ризик заміни професії', Math.round(c.p.aiRisk * 100) + '%']], opts: () => [{ k: 'ok', label: 'Пройти курс', cls: 'pri' }, { k: 'pass', label: 'Пропустити' }], def: 'pass', act: (c, P, k) => { if (k === 'pass') return 'Пропущено.'; c.p.ai = clamp(c.p.ai + 25, 0, 100); c.p.stress = clamp(c.p.stress + 3, 0, 100); return 'Навички ШІ +25 (тепер ' + c.p.ai + ').' + spend(c.g, c.p, P.amt); }, tip: 'ШІ замінить не людей, а людей, які не вміють ним користуватися.' }),
    EV('ai_rollout', { t: 'Компанія впроваджує ШІ', text: (c) => 'Керівництво впроваджує ШІ-агентів у роботу. Частину задач автоматизують. Ризик для вашої професії: ' + Math.round(c.p.aiRisk * 100) + '%, ваші навички ШІ: ' + c.p.ai + '/100.',
      act: (c) => { const p = c.p; if (p.track === 'fast') return 'Ви вже не в найманій роботі.'; const risk = p.aiRisk * (1 - p.ai / 100); if (rnd() < risk) { if (p.emp === 'emp') { p.unemp = 3; p.stress = clamp(p.stress + 18, 0, 100); return 'Вашу посаду скоротили. 3 місяці пошуку роботи, допомога центру зайнятості.'; } p.cut = { left: 3, k: 0.6 }; p.stress = clamp(p.stress + 12, 0, 100); return 'Клієнти перейшли на ШІ-інструменти: 3 місяці дохід −40%.'; } if (p.ai >= 50) { p.sal = r100(p.sal * 1.12); return 'Ви стали тим, хто впроваджує ШІ. Підвищення +12%!'; } return 'Цього разу вас не зачепило. Але варто прокачати навички.'; } }),
    EV('ai_biz', { t: 'Бізнес на ШІ', draw: (c) => ({ amt: r10(25000 * c.w.cpi), cf: r100(rint(7000, 12000) * c.w.cpi) }), text: (c) => c.p.ai >= 40 ? 'Ви вмієте налаштовувати ШІ-ботів. Малі бізнеси готові платити абонплату за бота, що відповідає клієнтам.' : 'Знайомий запускає сервіс ШІ-ботів для бізнесу. Щоб долучитися, потрібні навички ШІ від 40/100.',
      rows: (c, P) => [['Інвестиція', fmt(P.amt)], ['Дохід', '~' + fmt(P.cf) + '/міс'], ['Потрібно ШІ', '40+ (у вас ' + c.p.ai + ')']], opts: (c, P) => [{ k: 'ok', label: 'Запустити', cls: 'pri', dis: c.p.ai < 40 }, { k: 'pass', label: 'Пропустити' }], def: 'pass',
      act: (c, P, k) => { if (k === 'pass') return 'Пропущено.'; c.p.assets.push({ id: 'a' + uid6(), kind: 'biz', n: 'Сервіс ШІ-ботів', tag: 'ai', cost: P.amt, cf: P.cf, vol: .4, online: 1, ai: 1, m: c.w.m }); return 'Запущено. Новий дохід ~' + fmt(P.cf) + '/міс.' + spend(c.g, c.p, P.amt); } }),
    EV('ai_scam', { t: 'Дзвінок «служби безпеки банку»', draw: (c) => ({ amt: r10(25000 * c.w.cpi) }), text: 'Голос, дуже схожий на вашого менеджера банку, просить «перевести кошти на захищений рахунок». Це може бути дипфейк.', act: (c, P) => { if (c.p.ai >= 35) return 'Ви розпізнали синтезований голос і поклали слухавку. Банки ніколи не просять переказувати гроші.'; return 'Шахраї вкрали ' + fmt(P.amt) + '. Кіберполіція прийняла заяву.' + spend(c.g, c.p, Math.min(P.amt, Math.max(0, c.p.cash))); }, tip: 'Банк ніколи не просить код з SMS, CVV або переказати гроші «на безпечний рахунок».' }),
    EV('ai_sub', { t: 'ШІ-асистент для роботи', cond: (c) => !(c.p.recur || []).some((r) => r.n.indexOf('ШІ-асистент') === 0), text: 'Платна підписка на ШІ-асистента пришвидшує вашу роботу. 1 000 ₴/міс.', opts: () => [{ k: 'ok', label: 'Підключити', cls: 'pri' }, { k: 'pass', label: 'Не треба' }], def: 'pass', act: (c, P, k) => { if (k === 'pass') return 'Пропущено.'; c.p.recur = (c.p.recur || []).concat([{ n: 'ШІ-асистент (підписка)', a: 1000 }]); c.p.ai = clamp(c.p.ai + 10, 0, 100); if (c.p.track === 'rat') { c.p.sal = r100(c.p.sal * 1.05); return 'Продуктивність зросла: дохід +5%, ШІ +10.'; } return 'ШІ +10.'; } }),
    EV('ai_replace', { t: 'ШІ забирає частину роботи', cond: (c) => c.p.aiRisk >= 0.4 && c.p.track === 'rat', text: 'Генеративні моделі роблять частину ваших задач безкоштовно. Ринок ставок просідає.', act: (c) => { if (c.p.ai >= 55) return 'Ви вже працюєте разом з ШІ — ваш дохід не постраждав.'; c.p.sal = r100(c.p.sal * 0.9); return 'Ваш дохід знизився на 10%.'; } }),
  ]);

  /* ===== ДИТИНА / БЛАГОДІЙНІСТЬ / ЗВІЛЬНЕННЯ ===== */
  deck('child', [EV('c_baby', { t: 'Поповнення в родині', draw: (c) => ({ baby: c.p.kids < 3 && c.p.age < 45 && (c.p.partner || c.p.kids) && rnd() < 0.55 }), text: (c, P) => !P.baby ? 'Хрестини у друзів, ви — хрещений. Подарунок і стіл — 5 000 ₴.' : 'У вас народилася дитина! Держава виплачує допомогу: 10 320 ₴ одразу і 860 ₴ щомісяця 3 роки. Витрати на дитину — ~5 200 ₴/міс.', rows: (c, P) => !P.baby ? [] : [['Пакунок малюка, візок, ліжечко', fmt(25000)], ['Нові витрати', fmt(c.p.base.kid) + '/міс']],
    act: (c, P) => { if (!P.baby) return 'Витрачено 5 000 ₴ на подарунки.' + spend(c.g, c.p, 5000); c.p.kids++; c.p.kb = (c.p.kb || []).concat([36]); c.p.cash += K.BIRTH_ONCE; c.p.stress = clamp(c.p.stress + 6, 0, 100); return 'Вітаємо! Дітей: ' + c.p.kids + '.' + spend(c.g, c.p, 25000); }, tip: 'З народженням дитини варто подумати про страхування життя — це захист для родини.' })]);
  deck('charity', [EV('ch_give', { t: 'Благодійність', draw: (c) => ({ amt: r100(statement(c.p, c.w).income * 0.1) }), text: 'Донат на ЗСУ або благодійний фонд — 10% місячного доходу. Добро повертається: наступні 3 ходи можна кидати 2 кубики, а стрес знизиться.', rows: (c, P) => [['10% доходу', fmt(P.amt)]], opts: (c, P) => [{ k: 'ok', label: 'Задонатити ' + fmt(P.amt), cls: 'pri' }, { k: 'pass', label: 'Не цього разу' }], def: 'pass',
    act: (c, P, k) => { if (k === 'pass') return 'Ви не донатили цього місяця.'; c.p.charity = 3; c.p.stress = clamp(c.p.stress - 10, 0, 100); return 'Задоначено ' + fmt(P.amt) + '. 3 ходи з двома кубиками.' + spend(c.g, c.p, P.amt); }, tip: 'Благодійні внески до 4% річного доходу можна вказати в податковій знижці.' })]);
  deck('layoff', [EV('l_cut', { t: 'Звільнення', text: (c) => c.p.emp === 'emp' ? 'Компанія скорочує штат через падіння продажів. Пошук нової роботи займе 2 місяці. Держава платить допомогу по безробіттю.' : 'Ключовий клієнт пішов. 2 місяці без доходу, поки знайдете нових. ФОП не має допомоги по безробіттю.',
    act: (c) => { if (c.p.track === 'fast') return 'Вас це не стосується.'; c.p.unemp = 2; c.p.stress = clamp(c.p.stress + 15, 0, 100); return '2 місяці без зарплати.' + (c.p.cash < statement(c.p, c.w).out * 2 ? ' Подушки безпеки замало — доведеться позичати.' : ' Подушка безпеки рятує.'); }, tip: 'Саме для таких випадків потрібна подушка безпеки.' })]);

  deck('pay', [EV('pay_day', { t: 'Получка', art: 'money', def: 'ok', draw: (c) => { const pd = (c.g.pay || {})[c.uid] || {}; return { net: pd.net || 0, inc: pd.inc || 0, out: pd.out || 0, n: pd.n || 0 }; },
    text: (c, P) => 'День зарплати. Ви отримали всі доходи місяця і сплатили податки, кредити та витрати.',
    rows: (c, P) => [['Доходи', fmt(P.inc)], ['Витрати', fmt(P.out)], ['Залишок місяця', (P.net >= 0 ? '+' : '') + fmt(P.net)]],
    act: (c, P) => (P.net >= 0 ? 'Залишок місяця +' : 'Мінус за місяць ') + fmt(Math.abs(P.net)) + '.' })]);
  DECKS.pay[0].nolog = 1;

  deck('luck', [
    EV('u_bonus', { t: 'Квартальна премія', cond: (c) => c.p.track === 'rat' && c.p.unemp === 0 && c.p.emp === 'emp', draw: (c) => ({ amt: r100(c.p.sal * (0.3 + rnd() * 0.4) * 0.77) }), text: 'Ваш відділ перевиконав план. Керівник виписав премію.', rows: (c, P) => [['Премія на руки', fmt(P.amt)]], act: (c, P) => { c.p.cash += P.amt; c.p.stress = clamp(c.p.stress - 4, 0, 100); return 'Отримано ' + fmt(P.amt) + '.'; } }),
    EV('u_client', { t: 'Великий клієнт', cond: (c) => c.p.track === 'rat' && c.p.emp !== 'emp', draw: (c) => ({ amt: r100(c.p.sal * (0.4 + rnd() * 0.5)) }), text: 'Постійний клієнт привів друга з великим замовленням.', rows: (c, P) => [['Додатковий дохід', fmt(P.amt)]], act: (c, P) => { c.p.cash += P.amt; return 'Отримано ' + fmt(P.amt) + '.'; } }),
    EV('u_taxback', { t: 'Податкова знижка', draw: (c) => ({ amt: r100(rint(5000, 12000) * c.w.cpi) }), text: 'Ви подали декларацію і повернули частину ПДФО за навчання, лікування чи відсотки по іпотеці.', rows: (c, P) => [['Повернення', fmt(P.amt)]], act: (c, P) => { c.p.cash += P.amt; return 'На картку прийшло ' + fmt(P.amt) + '.'; }, tip: 'Податкова знижка — законний спосіб повернути 18% від частини витрат.' }),
    EV('u_olx', { t: 'Розібрали балкон', draw: (c) => ({ amt: r100(rint(2500, 7000) * c.w.cpi) }), text: 'Продали на OLX старий велосипед, крісло і коробку дисків.', rows: (c, P) => [['Виручка', fmt(P.amt)]], act: (c, P) => { c.p.cash += P.amt; return '+' + fmt(P.amt) + ' і більше місця вдома.'; } }),
    EV('u_gift', { t: 'Подарунок від рідних', draw: (c) => ({ amt: r100(rint(4000, 15000) * c.w.cpi) }), text: 'Бабуся передала конверт «на розвиток».', rows: (c, P) => [['Подарунок', fmt(P.amt)]], act: (c, P) => { c.p.cash += P.amt; c.p.stress = clamp(c.p.stress - 3, 0, 100); return '+' + fmt(P.amt) + '.'; } }),
    EV('u_raise', { t: 'Підвищення', cond: (c) => c.p.track === 'rat' && c.p.unemp === 0, wt: .7, text: 'Вашу роботу помітили. Пропонують нову посаду з більшою відповідальністю.', opts: () => [{ k: 'ok', label: 'Погодитись (+10% доходу, стрес +8)', cls: 'pri' }, { k: 'pass', label: 'Залишитись на місці' }], def: 'pass', act: (c, P, k) => { if (k === 'pass') return 'Ви залишились на поточній посаді.'; c.p.sal = r100(c.p.sal * 1.1); c.p.stress = clamp(c.p.stress + 8, 0, 100); return 'Дохід +10%.'; } }),
    EV('u_cashback', { t: 'Кешбек і бонуси', draw: (c) => ({ amt: r100(rint(800, 2500) * c.w.cpi) }), text: 'Банк нарахував кешбек за пів року.', rows: (c, P) => [['Кешбек', fmt(P.amt)]], act: (c, P) => { c.p.cash += P.amt; return '+' + fmt(P.amt) + '.'; } }),
  ]);

  /* ===== НОВИНИ (макро) ===== */
  const NEWS = [
    { id: 'blackout', wt: 1.4, t: 'Масовані удари по енергетиці', d: 'Росія атакувала ТЕС і підстанції. Графіки відключень до 12 годин на добу протягом 3 місяців.', f: (g) => { addEff(g.world, 'blackout', 3); g.world.re *= 0.97; allP(g, (p) => { p.stress = clamp(p.stress + (p.gen ? 3 : 9), 0, 100); }); return 'Офлайн-бізнеси без генераторів −35%, оренда генераторів ×1,6. Стрес у всіх зріс.'; } },
    { id: 'ports', wt: 1, t: 'Удари по портах і логістиці', d: 'Експорт через Одеські порти ускладнено. НБУ прогнозує недоотримання валютної виручки.', f: (g) => { g.world.fx *= 1.03; g.world.cpi *= 1.012; g.world.infl = Math.min(0.2, (g.world.infl || .1) + 0.01); return 'Гривня −3%, ціни +1,2%.'; } },
    { id: 'rateUp', wt: 1, t: 'НБУ підвищив облікову ставку', d: 'Через інфляційний тиск Нацбанк підняв ставку на 0,5 п.п.', f: (g) => { g.world.rate = +(g.world.rate + 0.5).toFixed(1); return 'Облікова ставка: ' + g.world.rate + '%. Нові депозити й ОВДП дохідніші, кредити — дорожчі.'; } },
    { id: 'rateDn', wt: .8, t: 'НБУ знизив облікову ставку', d: 'Інфляція сповільнилась, Нацбанк пом\'якшує політику.', f: (g) => { g.world.rate = +Math.max(8, g.world.rate - 0.5).toFixed(1); g.world.infl = Math.max(0.05, (g.world.infl || .1) - 0.01); return 'Облікова ставка: ' + g.world.rate + '%.'; } },
    { id: 'oil', wt: 1, t: 'Ескалація на Близькому Сході', d: 'Нафта дорожча за $100. Пальне в Україні дорожчає, світові ринки нервують.', f: (g) => { addEff(g.world, 'fuel', 6); g.world.px.SPX *= 0.96; g.world.px.GOLD *= 1.06; g.world.cpi *= 1.008; return 'Транспорт +20% на 6 міс, S&P 500 −4%, золото +6%.'; } },
    { id: 'pandemic', wt: .35, t: 'Новий штам вірусу — карантин', d: 'ВООЗ оголосила пандемію. В Україні — локдаун на 4 місяці для закладів харчування й розваг.', f: (g) => { addEff(g.world, 'lockdown', 4); const x = g.world.px; x.SPX *= 0.82; x.AI *= 0.85; x.BTC *= 0.75; x.ETH *= 0.7; allP(g, (p) => { p.health = clamp(p.health - 8, 0, 100); p.stress = clamp(p.stress + 10, 0, 100); }); return 'Офлайн-бізнеси −55%, онлайн +30%. Ринки впали. Здоров\'я −8 у всіх.'; } },
    { id: 'cryptoCrash', wt: .7, t: 'Банкрутство криптобіржі', d: 'Одна з найбільших бірж заморозила виведення коштів. Паніка на ринку.', f: (g) => { const x = g.world.px; x.BTC *= 0.62; x.ETH *= 0.55; x.MEME *= 0.3; return 'BTC −38%, ETH −45%, мемкоіни −70%.'; } },
    { id: 'cryptoBull', wt: .7, t: 'Бичачий ринок криптовалют', d: 'Великі фонди купують біткоїн для резервів. Схвалено нові крипто-ETF.', f: (g) => { const x = g.world.px; x.BTC *= 1.3; x.ETH *= 1.4; x.MEME *= 2; return 'BTC +30%, ETH +40%.'; } },
    { id: 'aiBubble', wt: .6, t: 'ШІ-бульбашка тріснула', d: 'Інвестори засумнівались в окупності дата-центрів. Технологічні акції обвалились.', f: (g) => { g.world.px.AI *= 0.65; g.world.px.SPX *= 0.88; return 'Фонд ШІ −35%, S&P 500 −12%.'; } },
    { id: 'aiBreak', wt: .8, t: 'Прорив ШІ-агентів', d: 'Нове покоління ШІ-агентів виконує роботу офісних працівників. Компанії масово переглядають штат.', f: (g) => { g.world.px.AI *= 1.25; g.world.px.SPX *= 1.05; addEff(g.world, 'aiboom', 4); const out = []; allP(g, (p) => { if (p.track !== 'rat') return; const risk = p.aiRisk * (1 - p.ai / 100) * 0.5; if (rnd() < risk) { if (p.emp === 'emp') p.unemp = Math.max(p.unemp, 2); else p.cut = { left: 2, k: 0.6 }; out.push(p.uid); L(g, 'ШІ забрав частину роботи: дохід під загрозою на 2 місяці.', 'bad', p.uid); } else if (p.ai >= 60) { p.sal = r100(p.sal * 1.08); L(g, 'Ваші навички ШІ в ціні: дохід +8%.', 'good', p.uid); } }); return 'Фонд ШІ +25%. Професії з високим ризиком постраждали.'; } },
    { id: 'talks', wt: .6, t: 'Переговори про припинення вогню', d: 'Міжнародні посередники оголосили новий раунд переговорів. Ринки реагують обережним оптимізмом.', f: (g) => { g.world.re *= 1.06; g.world.fx *= 0.985; allP(g, (p) => { p.stress = clamp(p.stress - 5, 0, 100); p.assets.forEach((a) => { if (a.war) a.cf = r100(a.cf * 0.92); }); }); return 'Нерухомість +6%, гривня зміцнилась. Оборонні бізнеси −8%.'; } },
    { id: 'ceasefire', wt: .15, once: 1, t: 'Режим припинення вогню', d: 'Сторони погодили режим тиші. Західні інвестори заходять в Україну, стартує програма відбудови.', f: (g) => { g.world.peace = 1; g.world.re *= 1.18; g.world.fx *= 0.96; allP(g, (p) => { p.stress = clamp(p.stress - 15, 0, 100); p.assets.forEach((a) => { if (a.war) a.cf = r100(a.cf * 0.6); }); }); return 'Нерухомість +18%, оренда +15%, гривня +4%. Оборонний бізнес −40%.'; } },
    { id: 'deval', wt: .7, t: 'Девальвація гривні', d: 'Попит на валюту зріс, НБУ відпустив курс.', f: (g) => { g.world.fx *= 1.06; g.world.cpi *= 1.01; return 'Курс +6%: ' + g.world.fx.toFixed(2) + ' ₴/$.'; } },
    { id: 'minw', wt: .5, t: 'Підвищення мінімальної зарплати', d: 'Уряд підвищив мінімалку. Для ФОП зросли ЄСВ та фіксовані податки.', f: (g) => { g.world.mw = +((g.world.mw || 1) * 1.1).toFixed(3); return 'ЄСВ і податки ФОП 2 гр. +10%.'; } },
    { id: 'digitax', wt: .5, t: 'Податок на цифрові платформи', d: 'Платформи (OLX, Bolt, Upwork) почали передавати дані податковій. Дохід від підробітків оподатковується.', f: (g) => { addEff(g.world, 'digitax', 120); return 'Підробітки −20%.'; } },
    { id: 'reBoom', wt: .7, t: 'Попит на житло у Львові', d: 'Переселенці та релоковані компанії збільшили попит на квартири.', f: (g) => { g.world.re *= 1.05; return 'Нерухомість +5%.'; } },
    { id: 'strike', wt: .8, t: 'Нічна атака на місто', d: 'Ракети і шахеди. Є руйнування в житловому секторі.', f: (g) => { allP(g, (p) => { p.stress = clamp(p.stress + 8, 0, 100); }); const owners = Object.values(g.players).filter((p) => p.assets.some((a) => a.kind === 're')); if (owners.length && rnd() < 0.5) { const p = pick(owners); const a = pick(p.assets.filter((x) => x.kind === 're')); const dmg = r100(reVal(a, g.world) * 0.08); if (p.ins.prop) L(g, 'Пошкоджено «' + a.n + '». Страховка покрила ' + fmt(dmg) + '.', 'info', p.uid); else { p.cash -= dmg; ensureCash(g, p); L(g, 'Пошкоджено «' + a.n + '». Ремонт ' + fmt(dmg) + ' за ваш рахунок.', 'bad', p.uid); } } return 'Стрес +8 у всіх.'; } },
    { id: 'grant', wt: .6, t: 'Гранти «Власна справа»', d: 'Уряд відновив програму грантів до 250 000 ₴ на відкриття бізнесу.', f: (g) => { addEff(g.world, 'grant', 4); return '4 місяці: великі бізнес-угоди дешевші на 250 000 ₴.'; } },
    { id: 'spxCrash', wt: .5, t: 'Рецесія в США', d: 'ВВП США скоротився два квартали поспіль. Світові ринки падають.', f: (g) => { const x = g.world.px; x.SPX *= 0.8; x.AI *= 0.75; x.BTC *= 0.8; x.GOLD *= 1.08; return 'S&P 500 −20%, ШІ −25%, BTC −20%, золото +8%.'; } },
    { id: 'spxRally', wt: .6, t: 'Ралі на ринку США', d: 'ФРС знизила ставку, інвестори купують акції.', f: (g) => { const x = g.world.px; x.SPX *= 1.07; x.AI *= 1.1; x.BTC *= 1.08; return 'S&P 500 +7%, ШІ +10%.'; } },
    { id: 'bankFail', wt: .4, t: 'Банк виведено з ринку', d: 'НБУ визнав один із банків неплатоспроможним. ФГВФО гарантує вклади до 600 000 ₴.', f: (g) => { allP(g, (p) => { p.assets.filter((a) => a.kind === 'deposit').forEach((a) => { if (a.amt > K.DEP_GUARANTEE && rnd() < 0.5) { const lost = a.amt - K.DEP_GUARANTEE; a.amt = K.DEP_GUARANTEE; L(g, 'Ваш банк ліквідовано: понад гарантовані 600 000 ₴ втрачено ' + fmt(lost) + '.', 'bad', p.uid); } }); }); return 'Вклади понад 600 000 ₴ в одному банку під ризиком.'; } },
    { id: 'itboom', wt: .6, t: 'Нові контракти для IT', d: 'Українські IT-компанії отримали великі замовлення з ЄС і США. Попит на розробників зростає.', f: (g) => { allP(g, (p) => { if (p.track === 'rat' && (p.prof === 'dev' || p.prof === 'smm')) { p.sal = r100(p.sal * 1.07); L(g, 'Ринок IT росте: ваш дохід +7%.', 'good', p.uid); } }); return 'Дохід айтівців +7%.'; } },
    { id: 'harvest', wt: .5, t: 'Рекордний врожай', d: 'Аграрії зібрали рекордний урожай, але логістика через порти обмежена.', f: (g) => { g.world.cpi *= 0.997; return 'Продукти трохи подешевшали.'; } },
    { id: 'reloc', wt: .6, t: 'Релокація бізнесу на захід', d: 'Ще кілька підприємств переїхали до Львівської області.', f: (g) => { g.world.re *= 1.03; return 'Нерухомість у Львові +3%, оренда в попиті.'; } },
    { id: 'tariff', wt: .6, t: 'Підвищення тарифів на електроенергію', d: 'Регулятор підняв тарифи для населення.', f: (g) => { allP(g, (p) => { if (!p.base.rent) p.base.housing[1] = r100(p.base.housing[1] * 1.08); }); g.world.cpi *= 1.004; return 'Комуналка власників житла +8%.'; } },
    { id: 'defcontracts', wt: .5, t: 'Нові оборонні контракти', d: 'Міноборони законтрактувало мільйон дронів на рік.', f: (g) => { allP(g, (p) => p.assets.forEach((a) => { if (a.war) a.cf = r100(a.cf * 1.1); })); return 'Оборонні бізнеси +10%.'; } },
    { id: 'euTalks', wt: .5, t: 'Прогрес у вступі до ЄС', d: 'Україна відкрила нові переговорні кластери з ЄС.', f: (g) => { g.world.re *= 1.03; g.world.fx *= 0.99; allP(g, (p) => { p.stress = clamp(p.stress - 3, 0, 100); }); return 'Нерухомість +3%, гривня трохи зміцніла.'; } },
    { id: 'euAid', wt: .7, t: 'Пакет допомоги від ЄС', d: 'ЄС погодив фінансування на 2026–2027 роки. Резерви НБУ зростають.', f: (g) => { g.world.fx *= 0.985; g.world.re *= 1.02; allP(g, (p) => { p.stress = clamp(p.stress - 3, 0, 100); }); return 'Гривня зміцнилась, нерухомість +2%.'; } },
  ];
  CF.NEWS = NEWS;
  function allP(g, f) { Object.values(g.players).forEach(f); }
  function applyNews(g, forced) {
    const w = g.world; const pool = NEWS.filter((n) => !(n.once && (w.news || []).some((x) => x.id === n.id)));
    let tot = pool.reduce((s, x) => s + x.wt, 0), r = rnd() * tot, n = pool[0];
    for (const x of pool) { r -= x.wt; if (r <= 0) { n = x; break; } }
    const eff2 = n.f(g);
    ['SPX', 'AI', 'GOLD', 'BTC', 'ETH'].forEach((k) => { w.px[k] = +(+w.px[k]).toFixed(2); }); w.px.MEME = +(+w.px.MEME).toFixed(5); w.fx = +w.fx.toFixed(2); w.re = +w.re.toFixed(4); w.cpi = +w.cpi.toFixed(4);
    w.news = (w.news || []).concat([{ id: n.id, t: n.t, d: n.d, e: eff2, m: w.m }]).slice(-12);
    L(g, 'НОВИНИ · ' + n.t + '. ' + eff2, 'news');
    return n;
  }
  deck('news', [EV('n_news', { t: 'Новини', draw: (c) => { const n = applyNews(c.g); return { t: n.t, d: n.d, e: c.w.news[c.w.news.length - 1].e }; }, view: (c, P) => ({ t: P.t, text: P.d, rows: [['Наслідки', P.e]], opts: OK }), act: () => 'Наслідки вже враховано для всіх гравців.' })]);
  DECKS.news[0].nolog = 1;

  /* ===== ШВИДКА ДОРІЖКА ===== */
  const FBIZ = (id, n, cost, cf, o) => ({ id, t: n, def: 'pass',
    draw: (c) => ({ price: r10(cost * (0.9 + rnd() * 0.2) * c.w.cpi), cf: r100(cf * (0.85 + rnd() * 0.3) * c.w.cpi) }),
    view: (c, P) => { const avail = bankLimit(c.p, c.w) - bankDebt(c.p, 'bank'); const opts = [0.05, 0.1, 0.25, 0.5, 1].map((sh) => { const pr = Math.round(P.price * sh); const short = pr - c.p.cash; return { k: 'sh:' + sh, label: (sh < 1 ? 'Частка ' + Math.round(sh * 100) + '%' : 'Купити повністю') + ' — ' + fmt(pr) + ' · +' + fmt(P.cf * sh) + '/міс' + (short > 0 ? (short > avail ? ' · не вистачає' : ' · з кредитом ' + fmt(Math.ceil(short / 5000) * 5000)) : ''), cls: 'pri', dis: short > avail }; }); opts.push({ k: 'pass', label: 'Відмовитися' }); return { text: o.text, rows: [['Вартість 100%', fmt(P.price)], ['Чистий прибуток 100%', fmt(P.cf) + '/міс'], ['Окупність', (P.price / P.cf / 12).toFixed(1) + ' р.'], ['Ризик', o.vol >= .35 ? 'високий' : 'помірний']], opts }; },
    act: (c, P, k) => { if (k === 'pass') return 'Ви відмовились.'; const sh = +k.split(':')[1]; const pr = Math.round(P.price * sh); let ex = ''; if (c.p.cash < pr) { const need = Math.ceil((pr - c.p.cash) / 5000) * 5000; takeLoan(c.p, need, 'bank'); ex = ' Кредит ' + fmt(need) + '.'; } c.p.cash -= pr; c.p.assets.push({ id: 'a' + uid6(), kind: 'biz', n: n + (sh < 1 ? ' (' + Math.round(sh * 100) + '%)' : ''), tag: 'ft', cost: pr, cf: Math.round(P.cf * sh), vol: o.vol || .2, offline: o.offline, solar: o.solar, war: o.war, ai: o.ai, m: c.w.m }); return 'Інвестовано ' + fmt(pr) + ' у «' + n + '».' + ex; } });
  deck('ftdeal', [
    FBIZ('f_mall', 'Частка у ТРЦ', 18000000, 420000, { text: 'Торговий центр у Львові з якірними орендарями. Захищений генераторами та укриттям.', offline: 1 }),
    FBIZ('f_wh', 'Логістичний комплекс', 26000000, 620000, { text: 'Сучасний склад класу А під маркетплейси й оборонну логістику.' }),
    FBIZ('f_ses', 'Сонячна електростанція 1 МВт', 30000000, 680000, { text: 'Наземна СЕС з батареями. Продаж енергії бізнесу за прямими договорами.', solar: 1 }),
    FBIZ('f_azs', 'Мережа з 5 АЗС', 60000000, 1350000, { text: 'Заправки на трасі Київ–Чоп з кафе та магазинами.', offline: 1 }),
    FBIZ('f_drone', 'Завод FPV-дронів', 15000000, 520000, { text: 'Виробник з держконтрактами на 2 роки вперед і експортними планами.', war: 1, vol: .4 }),
    FBIZ('f_it', 'ІТ-аутсорс компанія на 120 людей', 40000000, 1050000, { text: 'Стабільні клієнти з ЄС та США. Ризик: ШІ скорочує попит на аутсорс.', ai: 1, vol: .3 }),
    FBIZ('f_agro', 'Агрогосподарство 2 000 га', 50000000, 1000000, { text: 'Пшениця, соняшник, кукурудза. Залежить від врожаю і роботи портів.', vol: .35 }),
    FBIZ('f_clinic', 'Мережа приватних клінік', 35000000, 820000, { text: 'Три клініки з діагностикою. Попит на якісну медицину лише зростає.' }),
    FBIZ('f_hotel', 'Готель у Буковелі', 28000000, 640000, { text: 'Готель на 60 номерів біля підйомників. Сезонний, але прибутковий.', offline: 1, vol: .35 }),
    FBIZ('f_rebuild', 'Девелопмент: житловий квартал', 45000000, 950000, { text: 'Будівництво житла для програми «єОселя» в області.', vol: .3 }),
  ]);
  deck('ftrisk', [
    EV('fr_raid', { t: 'Рейдерська атака', cond: (c) => c.p.assets.some((a) => a.kind === 'biz'), text: 'Невідомі змінили власника вашого бізнесу в реєстрі через «чорного» нотаріуса.', opts: () => [{ k: 'ok', label: 'Найняти юристів (1 млн ₴)', cls: 'pri' }, { k: 'pass', label: 'Відпустити' }], def: 'ok', act: (c, P, k) => { const a = pick(c.p.assets.filter((x) => x.kind === 'biz')); if (k === 'ok') { const m = spend(c.g, c.p, 1000000); if (rnd() < 0.7) return 'Суд скасував реєстраційні дії. Бізнес повернуто.' + m; c.p.assets = c.p.assets.filter((x) => x.id !== a.id); return 'Суди тривають роками. «' + a.n + '» втрачено.' + m; } c.p.assets = c.p.assets.filter((x) => x.id !== a.id); return '«' + a.n + '» втрачено.'; } }),
    EV('fr_tax', { t: 'Податкова перевірка', text: 'Документальна перевірка всіх ваших компаній за 3 роки.', act: (c) => { const s = Math.round(Math.max(200000, c.p.cash * 0.1)); return 'Донараховано і сплачено ' + fmt(s) + '.' + spend(c.g, c.p, s); } }),
    EV('fr_divorce', { t: 'Розлучення', text: 'Шлюб не витримав. Майно ділять навпіл.', act: (c) => { const h = Math.round(Math.max(0, c.p.cash) * 0.3); c.p.cash -= h; c.p.stress = clamp(c.p.stress + 25, 0, 100); return 'Поділ майна: ви втратили ' + fmt(h) + ' готівки.'; } }),
    EV('fr_suit', { t: 'Судовий позов', text: 'Колишній партнер подав позов про частку в бізнесі.', act: (c) => { const a = Math.max(300000, Math.round(Math.max(0, c.p.cash) * 0.15)); return 'Мирова угода: ' + fmt(a) + '.' + spend(c.g, c.p, a); } }),
    EV('fr_strike', { t: 'Удар по об\'єкту', cond: (c) => c.p.assets.some((a) => a.kind === 'biz'), text: 'Ворожий удар пошкодив один з ваших об\'єктів.', act: (c) => { const a = pick(c.p.assets.filter((x) => x.kind === 'biz')); const d = Math.round(a.cost * 0.15); if (c.p.ins.prop) return '«' + a.n + '»: збитки ' + fmt(d) + ' покрила страховка.'; return '«' + a.n + '»: відновлення ' + fmt(d) + '.' + spend(c.g, c.p, d); } }),
    EV('fr_ok', { t: 'Спокійний місяць', text: 'Ваші керівники впоралися без вас. Ви провели місяць з родиною.', act: (c) => { c.p.stress = clamp(c.p.stress - 10, 0, 100); return 'Стрес −10.'; } }),
  ]);
  deck('ftnews', [EV('fn_news', { t: 'Новини', draw: (c) => { const n = applyNews(c.g); return { t: n.t, d: n.d, e: c.w.news[c.w.news.length - 1].e }; }, view: (c, P) => ({ t: P.t, text: P.d, rows: [['Наслідки', P.e]], opts: OK }), act: () => 'Наслідки вже враховано для всіх гравців.' })]);
  DECKS.ftnews[0].nolog = 1;
  deck('dream', [EV('dr_dream', { t: 'Мрія', draw: (c) => { const d = DREAMS.find((x) => x.id === c.p.dream) || DREAMS[0]; return { n: d.n, cost: Math.round(d.cost * c.w.cpi) }; }, text: (c, P) => 'Ваша мрія — «' + P.n + '». Зараз є можливість її здійснити.', rows: (c, P) => [['Вартість', fmt(P.cost)], ['Ваша готівка', fmt(c.p.cash)]],
    opts: (c, P) => [{ k: 'ok', label: 'Здійснити мрію', cls: 'pri', dis: c.p.cash < P.cost }, { k: 'pass', label: 'Ще не час' }], def: 'pass',
    act: (c, P, k) => { if (k === 'pass') return 'Мрія чекає.'; c.p.cash -= P.cost; win(c.g, c.p, 'здійснено мрію «' + P.n + '»'); return 'МРІЮ ЗДІЙСНЕНО: «' + P.n + '»!'; } })]);
  CF.DECKS = DECKS;
  ['small', 'big', 'ftdeal'].forEach((d) => DECKS[d].forEach((c) => { if (!c.tk) { c.priv = 1; c.sellable = 1; } }));
  DECKS.news[0].pub = 1; DECKS.ftnews[0].pub = 1;
  DECKS.market.forEach((c) => { if (c.id === 'm_bump' || c.id === 'm_fxjump') c.pub = 1; });
  // оновити старі ft-cards опис
  DECKS.ftdeal.forEach((c) => { c.def = 'pass'; });

  /* ---------- дії гравця поза карткою (банк, брокер, страховка) ---------- */
  CF.act = function (g, uid, a, x) {
    const p = g.players[uid]; const w = g.world; if (!p) return 'Немає гравця.';
    x = x || {};
    let m = '';
    switch (a) {
      case 'loan': { const amt = Math.floor((+x.amt || 0) / 5000) * 5000; if (amt <= 0) return 'Вкажіть суму.'; const lim = bankLimit(p, w) - bankDebt(p, 'bank'); if (amt > lim) return 'Банк схвалює максимум ' + fmt(Math.max(0, lim)) + '.'; takeLoan(p, amt, 'bank'); m = 'Отримано кредит ' + fmt(amt) + '. Платіж +' + fmt(amt * K.BANK_APR / 12) + '/міс.'; break; }
      case 'repay': { const l = p.liabs.find((y) => y.id === x.id); if (!l) return 'Кредит не знайдено.'; let amt = x.amt ? Math.min(+x.amt, l.bal) : l.bal; amt = Math.floor(amt); if (amt > p.cash) return 'Не вистачає готівки: потрібно ' + fmt(amt) + '.'; p.cash -= amt; l.bal -= amt; if (l.bal <= 50) { p.liabs = p.liabs.filter((y) => y.id !== l.id); const as = p.assets.find((z) => z.liab === l.id); if (as) as.liab = null; m = 'Погашено «' + l.n + '». Потік +' + fmt(l.pay) + '/міс.'; } else { if (l.kind === 'bank' || l.kind === 'micro' || l.kind === 'card') l.pay = Math.round(l.bal * (l.kind === 'micro' ? K.MICRO_M : (l.apr / 12 + (l.kind === 'card' ? 0.015 : 0)))); else l.pay = Math.round(l.pay * l.bal / (l.bal + amt)); m = 'Частково погашено ' + fmt(amt) + ' по «' + l.n + '».'; } break; }
      case 'buy': { if (!SYM[x.sym]) return 'Невідомий актив.'; m = buySec(g, p, x.sym, +x.sum || 0); break; }
      case 'sell': { m = sellSec(g, p, x.id, x.frac ? +x.frac : 1); break; }
      case 'dep': { const s = Math.floor(Math.min(+x.sum || 0, p.cash) / 1000) * 1000; if (s <= 0) return 'Вкажіть суму.'; const rate = (w.rate - 3) / 100; p.cash -= s; p.assets.push({ id: 'a' + uid6(), kind: 'deposit', n: 'Депозит ' + (rate * 100).toFixed(1) + '%', amt: s, rate, m: w.m }); m = 'Відкрито депозит ' + fmt(s) + ' під ' + (rate * 100).toFixed(1) + '%.'; break; }
      case 'bond': { const s = Math.floor(Math.min(+x.sum || 0, p.cash) / 1000) * 1000; if (s <= 0) return 'Вкажіть суму.'; const rate = (w.rate - 0.5) / 100; p.cash -= s; p.assets.push({ id: 'a' + uid6(), kind: 'bond', n: 'ОВДП ' + (rate * 100).toFixed(1) + '%', amt: s, rate, m: w.m }); m = 'Куплено ОВДП на ' + fmt(s) + '.'; break; }
      case 'close': { const as = p.assets.find((y) => y.id === x.id); if (!as) return 'Не знайдено.'; if (as.kind === 'deposit' || as.kind === 'bond') { const pen = as.kind === 'deposit' && (w.m - as.m) < 12 ? Math.round(as.amt * 0.01) : 0; p.cash += as.amt - pen; m = 'Закрито «' + as.n + '»: ' + fmt(as.amt - pen) + (pen ? ' (дострокове розірвання −1%)' : '') + '.'; } else if (as.kind === 'bondusd') { const v = as.usd * w.fx; p.cash += v; m = 'Продано валютні ОВДП: ' + fmt(v) + '.'; } else return 'Цей актив продається інакше.'; p.assets = p.assets.filter((y) => y.id !== as.id); break; }
      case 'urgent': { const as = p.assets.find((y) => y.id === x.id); if (!as) return 'Не знайдено.'; const price = Math.round(assetValue(as, w) * 0.7); m = 'Термінова продаж зі знижкою 30%. ' + sellAsset(g, p, as.id, price); break; }
      case 'ins': { const k = x.k; if (!(k in p.ins)) return 'Невідомий поліс.'; p.ins[k] = p.ins[k] ? 0 : 1; const nm = { dms: 'ДМС', life: 'страхування життя', kasko: 'КАСКО', prop: 'страхування майна' }[k]; m = (p.ins[k] ? 'Оформлено ' : 'Скасовано ') + nm + '.'; break; }
      case 'well': { const k = x.k; p.well[k] = p.well[k] ? 0 : 1; m = (p.well[k] ? 'Підключено: ' : 'Скасовано: ') + (k === 'gym' ? 'спортзал' : 'психотерапія') + '.'; break; }
      case 'quitgig': { p.gigs = (p.gigs || []).filter((_, i) => i !== +x.i); m = 'Підробіток припинено.'; break; }
      case 'quitrecur': { p.recur = (p.recur || []).filter((_, i) => i !== +x.i); m = 'Витрату скасовано.'; break; }
      default: return 'Невідома дія.';
    }
    const ens = ensureCash(g, p); if (ens) m += ens;
    L(g, m, 'act', uid);
    return m;
  };

  /* ---------- публічні пропозиції (для всіх, хто має актив) ---------- */
  CF.pubOffers = function (g, uid) {
    const pd = g.pending; if (!pd) return []; const card = cardOf(pd); const p = g.players[uid]; if (!card || !p) return [];
    const out = [];
    if (card.tk) { const a = p.assets.find((x) => x.kind === 'tk' && x.sym === card.tk); if (a && pd.p.price) out.push({ aid: a.id, label: 'Продати ' + a.qty + ' акцій ' + card.tk + ' по $' + pd.p.price, price: a.qty * pd.p.price * g.world.fx }); }
    if (card.match && card.price) { const c = { g, w: g.world, p, uid }; p.assets.filter(card.match).forEach((a) => out.push({ aid: a.id, label: 'Продати «' + a.n + '» за ' + fmt(card.price(a, c, pd.p)), price: card.price(a, c, pd.p) })); }
    return out;
  };
  CF.pubSell = function (g, uid, aid) {
    const pd = g.pending; if (!pd) return 'Пропозиція вже закрита.'; const card = cardOf(pd); const p = g.players[uid]; const a = p && p.assets.find((x) => x.id === aid); if (!card || !a) return 'Пропозиція недоступна.';
    let m;
    if (card.tk && a.kind === 'tk' && a.sym === card.tk) m = sellTk(g, p, a.sym, pd.p.price);
    else if (card.match && card.match(a)) m = (a.kind === 'crypto' || a.kind === 'stock') ? sellSec(g, p, aid) : sellAsset(g, p, aid, Math.round(card.price(a, { g, w: g.world, p, uid }, pd.p)));
    else return 'Цей актив не підходить.';
    L(g, m, 'act', uid); return m;
  };
  /* ---------- продаж можливості іншому гравцю ---------- */
  CF.offerDeal = function (g, from, to, price) {
    const pd = g.pending; if (!pd || pd.done || pd.owner !== from) return 'Немає угоди для продажу.'; if (!g.players[to] || to === from) return 'Оберіть гравця.';
    price = Math.max(0, Math.round(+price || 0)); pd.offer = { from, to, price, t: Date.now() };
    return 'Пропозицію надіслано.';
  };
  CF.cancelOffer = function (g) { if (g.pending) g.pending.offer = null; };
  CF.answerDeal = function (g, uid, yes) {
    const pd = g.pending; if (!pd || !pd.offer || pd.offer.to !== uid) return 'Пропозиція вже недійсна.';
    const o = pd.offer; pd.offer = null; const card = cardOf(pd);
    if (!yes) { L(g, 'Відмовився купити можливість «' + (card ? card.t : '') + '».', 'info', uid); return 'Ви відмовились.'; }
    const buyer = g.players[uid], seller = g.players[o.from];
    if (buyer.cash < o.price) return 'Не вистачає готівки.';
    buyer.cash -= o.price; seller.cash += o.price; pd.owner = uid;
    L(g, 'Купив у гравця можливість «' + (card ? card.t : '') + '» за ' + fmt(o.price) + '.', 'good', uid);
    return 'Угода ваша. Вирішуйте, що з нею робити.';
  };
  /* ---------- обмін між гравцями ---------- */
  function moveAsset(from, to, aid) {
    const a = from.assets.find((x) => x.id === aid); if (!a) return false;
    from.assets = from.assets.filter((x) => x.id !== aid); to.assets.push(a);
    if (a.liab) { const l = from.liabs.find((x) => x.id === a.liab); if (l) { from.liabs = from.liabs.filter((x) => x.id !== l.id); to.liabs.push(l); } }
    return true;
  }
  CF.propose = function (g, from, to, give, get, note) {
    if (!g.players[from] || !g.players[to] || from === to) return 'Оберіть гравця.';
    const id = 't' + uid6(); g.trades = g.trades || {};
    g.trades[id] = { id, from, to, give: { cash: Math.max(0, Math.round(+give.cash || 0)), assets: give.assets || [] }, get: { cash: Math.max(0, Math.round(+get.cash || 0)), assets: get.assets || [] }, note: String(note || '').slice(0, 200), t: Date.now(), status: 'open' };
    return 'Пропозицію надіслано.';
  };
  CF.tradeAnswer = function (g, uid, id, yes) {
    const tr = (g.trades || {})[id]; if (!tr || tr.status !== 'open') return 'Пропозиція вже закрита.';
    if (uid !== tr.to && !(uid === tr.from && !yes)) return 'Це не ваша пропозиція.';
    if (!yes) { g.trades[id] = null; return uid === tr.from ? 'Пропозицію скасовано.' : 'Ви відхилили пропозицію.'; }
    const A = g.players[tr.from], B = g.players[tr.to];
    if (A.cash < tr.give.cash) return 'У гравця-ініціатора вже не вистачає грошей.';
    if (B.cash < tr.get.cash) return 'Вам не вистачає грошей.';
    if (!tr.give.assets.every((id2) => A.assets.some((x) => x.id === id2)) || !tr.get.assets.every((id2) => B.assets.some((x) => x.id === id2))) return 'Частини активів уже немає — угода неможлива.';
    A.cash -= tr.give.cash; B.cash += tr.give.cash; B.cash -= tr.get.cash; A.cash += tr.get.cash;
    tr.give.assets.forEach((x) => moveAsset(A, B, x)); tr.get.assets.forEach((x) => moveAsset(B, A, x));
    g.trades[id] = null;
    L(g, 'Угода між гравцями укладена.' + (tr.note ? ' «' + tr.note + '»' : ''), 'good', uid);
    return 'Угоду укладено.';
  };
  /* ---------- перекличка, правила, банкір ---------- */
  CF.setReady = function (g, uid, v) { g.ready = g.ready || {}; g.ready[uid] = v ? Date.now() : null; };
  CF.setRules = function (g, r) { g.rules = Object.assign({}, g.rules || {}, r); if (g.deadline && !g.rules.timers) g.deadline = null; };
  CF.adjust = function (g, uid, amt, note) { const p = g.players[uid]; if (!p) return 'Немає гравця.'; p.cash += Math.round(+amt || 0); L(g, 'Банкір (хост): ' + (amt >= 0 ? '+' : '') + fmt(amt) + (note ? ' — ' + note : ''), 'sys', uid); return 'Готово.'; };
  CF.pause = function (g, on) { if (on && g.deadline && !g.paused) { g.paused = { left: Math.max(1000, g.deadline - Date.now()) }; g.deadline = null; } else if (!on && g.paused) { g.deadline = Date.now() + g.paused.left; g.paused = null; } };
  CF.timeout = function (g) {
    if (g.phase === 'roll') { CF.roll(g, false); L(g, 'Час вийшов — кубик кинуто автоматично.', 'sys', CF.curUid(g)); return 'roll'; }
    if (g.pending && g.pending.offer) g.pending.offer = null;
    L(g, 'Час на рішення вийшов.', 'sys', CF.curUid(g)); CF.endTurn(g); return 'end';
  };

  /* ---------- поради ---------- */
  function adviceFor(p, w) {
    const st = statement(p, w);
    if (p.liabs.some((l) => l.kind === 'micro')) return 'Мікрокредит під 15% на місяць — найдорожчі гроші. Закрийте його першим, навіть продавши щось.';
    if (p.liabs.some((l) => l.kind === 'bank')) return 'Кредит готівкою під 48% річних з\'їдає потік. Погасіть його раніше за будь-які інвестиції.';
    if (p.cash < st.out * 3) return 'Спершу подушка безпеки на 3–6 місяців витрат (' + fmt(st.out * 3) + '+). Без неї будь-яке звільнення чи хвороба — кредит.';
    if (!p.ins.dms && !p.ins.life && p.kids) return 'У вас діти, але немає страхування. Страхування життя за ~1 300 ₴/міс — захист родини.';
    if (p.aiRisk >= 0.4 && p.ai < 50) return 'Вашій професії загрожує ШІ. Курси з ШІ — найкраща інвестиція в себе зараз.';
    if (st.passive < st.out * 0.2) return 'Пасивний дохід покриває лише ' + Math.round(st.passive / st.out * 100) + '% витрат. Купуйте активи, що приносять гроші щомісяця: ОВДП, оренда, бізнес.';
    return 'Ви на правильному шляху. Диверсифікуйте: частина в гривні (ОВДП), частина в доларах, частина в нерухомості й бізнесі.';
  }
  CF.advice = adviceFor;
  CF.TIPS = [
    'Пасив — усе, що забирає гроші з вашої кишені щомісяця. Актив — усе, що їх приносить.',
    'Багаті купують активи. Середній клас купує пасиви, думаючи, що це активи.',
    'Подушка безпеки: 3–6 місяців витрат. В Україні під час війни краще 6.',
    'Кредит готівкою під 40–60% річних майже ніколи не окупається інвестиціями.',
    'ОВДП не оподатковуються, депозити — 23%. Порівнюйте дохідність після податку.',
    'Гарантія ФГВФО — 600 000 ₴ на одну людину в одному банку.',
    'Інфляція ~10% на рік: гроші «під матрацом» втрачають десяту частину щороку.',
    'Нерухомість у доларах захищає від девальвації, але не від ракет — подумайте про страховку.',
    'Іпотека під 16–18% рідко окупається орендою. «єОселя» 3–7% — інша справа.',
    'Бізнес оцінюють у 18–36 місячних прибутків.',
    'Не вкладайте в криптовалюту більше, ніж готові втратити.',
    'Продаж нерухомості, що була у власності менше 3 років, оподатковується.',
    'ФОП не має лікарняних і допомоги по безробіттю — подушка ще важливіша.',
    'ШІ-навички знижують ризик втратити роботу й відкривають нові підробітки.',
    'Розстрочка «0%» — теж борг. Вона зменшує ваш щомісячний потік.',
    'Стрес погіршує рішення й здоров\'я. Психотерапія й спорт — інвестиції.',
    'Благодійність до 4% доходу можна використати як податкову знижку.',
    'Мета гри: пасивний дохід більший за витрати. Тоді ви вільні.',
  ];

  G.CF = CF;
  if (typeof module !== 'undefined') module.exports = CF;
})(typeof window !== 'undefined' ? window : globalThis);
