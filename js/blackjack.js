'use strict';
/* Блэкджек. Потому что редактор «с блэкджеком и палитрами» обязан его иметь.
   Правила обычные: дилер берёт до 17, блэкджек платит 3 к 2, можно удвоить ставку.
   Деньги игрушечные и при желании дюпаются. */
(function (NPR) {
  const { el } = NPR.util;
  const KEY = 'npr.blackjack';
  const SUITS = ['♠', '♥', '♦', '♣'], RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  let money = 1000;
  try { money = Math.max(0, +localStorage.getItem(KEY) || 1000); } catch (e) { /* начинаем с тысячи */ }
  const save = () => { try { localStorage.setItem(KEY, String(money)); } catch (e) { /* не страшно */ } };

  /* Сумма руки: туз считается за 11, пока это не перебор. */
  function score(hand) {
    let sum = 0, aces = 0;
    for (const c of hand) { if (c.r === 'A') { aces++; sum += 11; } else sum += 'JQK'.includes(c.r) || c.r === '10' ? 10 : +c.r; }
    while (sum > 21 && aces--) sum -= 10;
    return sum;
  }
  NPR.blackjackScore = score;

  NPR.blackjack = function () {
    let deck = [], player = [], dealer = [], bet = 0, phase = 'bet', note = 'Сделайте ставку';
    const draw = () => {
      if (deck.length < 15) { deck = []; for (const s of SUITS) for (const r of RANKS) deck.push({ s, r }); for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; } }
      return deck.pop();
    };
    const box = el('div', { class: 'bj' });
    const card = (c, hidden) => el('span', { class: 'card' + (hidden ? ' back' : c.s === '♥' || c.s === '♦' ? ' red' : '') }, hidden ? '' : c.r + c.s);
    const btn = (text, fn, cls) => { const b = el('button', { type: 'button', class: cls || '' }, text); b.addEventListener('click', fn); return b; };

    function finish(mult, text) { // mult — сколько ставок вернуть игроку
      money += Math.round(bet * mult);
      note = text; phase = 'bet'; save(); paint();
    }
    function stand() {
      while (score(dealer) < 17) dealer.push(draw());
      const p = score(player), d = score(dealer);
      if (d > 21) finish(2, `У дилера перебор (${d}). Вы выиграли ${bet}`);
      else if (p > d) finish(2, `${p} против ${d}. Вы выиграли ${bet}`);
      else if (p === d) finish(1, `Ничья: ${p}. Ставка возвращена`);
      else finish(0, `${p} против ${d}. Ставка ${bet} ушла дилеру`);
    }
    function deal(amount) {
      amount = Math.floor(amount);
      if (!(amount > 0)) { note = 'Ставка должна быть больше нуля'; return paint(); }
      if (amount > money) { note = 'Столько нет. Нажмите «Дюп денег»'; return paint(); }
      bet = amount; money -= bet;
      player = [draw(), draw()]; dealer = [draw(), draw()];
      phase = 'play'; note = 'Ваш ход';
      const pb = score(player) === 21, db = score(dealer) === 21;
      if (pb && db) return finish(1, 'Блэкджек у обоих. Ничья');
      if (pb) return finish(2.5, `Блэкджек! Выигрыш ${Math.round(bet * 1.5)}`);
      if (db) return finish(0, 'У дилера блэкджек');
      paint();
    }
    function hit() {
      player.push(draw());
      if (score(player) > 21) finish(0, `Перебор: ${score(player)}. Ставка ${bet} ушла дилеру`);
      else if (score(player) === 21) stand();
      else paint();
    }
    function double() {
      if (money < bet) { note = 'На удвоение не хватает денег'; return paint(); }
      money -= bet; bet *= 2;
      player.push(draw());
      if (score(player) > 21) finish(0, `Перебор: ${score(player)}. Ставка ${bet} ушла дилеру`); else stand();
    }

    const betInput = el('input', { type: 'number', min: 1, value: 100, inputmode: 'numeric', 'aria-label': 'Ставка' });
    betInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); deal(+betInput.value); } });
    function paint() {
      const playing = phase === 'play';
      box.replaceChildren(
        el('div', { class: 'bank' }, el('span', null, 'Банк: ' + money.toLocaleString('ru')),
          btn('Дюп денег', () => { money = money > 0 ? money * 2 : 1000; note = 'Деньги из воздуха. Экономика игры разрушена'; save(); paint(); })),
        el('div', { class: 'hand' }, el('span', { class: 'who' }, 'Дилер' + (dealer.length && !playing ? ': ' + score(dealer) : '')), ...dealer.map((c, i) => card(c, playing && i === 1))),
        el('div', { class: 'hand' }, el('span', { class: 'who' }, 'Вы' + (player.length ? ': ' + score(player) : '')), ...player.map((c) => card(c))),
        el('p', { class: 'msg', role: 'status' }, note),
        playing
          ? el('div', { class: 'acts' }, btn('Ещё карту', hit, 'primary'), btn('Хватит', stand), player.length === 2 ? btn('Удвоить', double) : null)
          : el('div', { class: 'acts' }, el('label', null, 'Ставка ', betInput), btn('Раздать', () => deal(+betInput.value), 'primary'), btn('Ва-банк', () => { betInput.value = money; deal(money); })));
    }
    paint();
    NPR.dialog({ title: 'Блэкджек', okLabel: 'Закрыть', noCancel: true, fields: [{ type: 'node', node: box }] });
    NPR.blackjack.test = { deal, hit, stand, state: () => ({ money, bet, phase, player, dealer, note }) };
  };
})(window.NPR);
