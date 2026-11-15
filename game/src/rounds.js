// Rounds: the match clock. A round is a 12 s buy phase, then up to 100 s of
// live play, then a short end card. First to 5 rounds takes the match (at
// most 9 rounds). Money is awarded for kills, plants, wins and losses, and
// the buy menu spends it between rounds.
export const BUY_SECONDS = 12;
export const ROUND_SECONDS = 100;
export const WIN_ROUNDS = 5;
export const MAX_ROUNDS = 9;
export const PRICES = { rifle: 2700, smg: 1500, grenade: 300, armor: 650, ammo: 150 };
export const AWARDS = { kill: 300, plant: 300, win: 900, loss: 500 };

export function createRounds() {
  const rounds = {
    phase: 'buy', // buy | live | over | matchover
    round: 1,
    scoreAtk: 0,
    scoreDef: 0,
    timer: BUY_SECONDS,
    endText: '',
    endSub: '',
    winner: null,
  };

  function startRound() {
    rounds.phase = 'buy';
    rounds.timer = BUY_SECONDS;
    rounds.endText = '';
    rounds.endSub = '';
    rounds.winner = null;
  }

  function startLive() {
    rounds.phase = 'live';
    rounds.timer = ROUND_SECONDS;
  }

  function endRound(winner, text, sub) {
    rounds.phase = 'over';
    rounds.timer = 4;
    rounds.winner = winner;
    rounds.endText = text;
    rounds.endSub = sub || '';
    if (winner === 'atk') rounds.scoreAtk += 1;
    else if (winner === 'def') rounds.scoreDef += 1;
  }

  function endMatch(winner) {
    rounds.phase = 'matchover';
    rounds.timer = 0;
    rounds.winner = winner;
    rounds.endText = winner === 'atk' ? 'Match won — Ember Yard is yours' : 'Match lost — the yard holds';
    rounds.endSub = `${rounds.scoreAtk} — ${rounds.scoreDef} after ${rounds.round} rounds`;
  }

  return {
    state: rounds,
    startRound,
    startLive,
    endRound,
    endMatch,
    resetMatch() {
      rounds.round = 1;
      rounds.scoreAtk = 0;
      rounds.scoreDef = 0;
      startRound();
    },
    nextRound() {
      rounds.round += 1;
      if (rounds.scoreAtk >= WIN_ROUNDS || rounds.scoreDef >= WIN_ROUNDS || rounds.round > MAX_ROUNDS) {
        endMatch(rounds.scoreAtk > rounds.scoreDef ? 'atk' : 'def');
      } else {
        startRound();
      }
    },
    // Tick the phase clock; returns 'live' when the buy phase ends, 'next'
    // when the end card is done, else null.
    tick(dt) {
      if (rounds.phase === 'buy') {
        rounds.timer -= dt;
        if (rounds.timer <= 0) {
          startLive();
          return 'live';
        }
      } else if (rounds.phase === 'over') {
        rounds.timer -= dt;
        if (rounds.timer <= 0) return 'next';
      }
      return null;
    },
  };
}
