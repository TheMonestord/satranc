import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, test } from 'vitest';
import { GameManager, type Opponent } from '../../src/game/gameManager';
import { clearGame, loadGame, saveGame } from '../../src/game/storage';
import { writeRawGame } from './rawGame';
import type { MoveEvent, MoveRequest } from '../../src/core/types';

/** Sıradaki hamleleri sırayla veren sahte rakip. */
function scripted(...moves: string[]) {
  const calls: string[] = [];
  const opponent: Opponent = {
    bestMove: async (fen) => {
      calls.push(fen);
      const m = moves.shift();
      if (!m) throw new Error('sahte rakibin hamlesi kalmadı');
      return { from: m.slice(0, 2), to: m.slice(2, 4) } as MoveRequest;
    },
  };
  return { opponent, calls };
}

const noDelay = async () => {};
const neverBlunder = () => 0.99;

function make(opponent: Opponent | null) {
  const gm = new GameManager({ opponent, rng: neverBlunder, delay: noDelay });
  const events: MoveEvent[] = [];
  gm.on('move', (ev) => events.push(ev));
  return { gm, events };
}

/** Rakibin hamlesi dahil bekleyen işlerin bitmesini bekler. */
async function settle(gm: GameManager) {
  for (let i = 0; i < 50 && gm.state().thinking; i++) await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

describe('GameManager', () => {
  beforeEach(async () => {
    await clearGame();
  });

  test('iki kişilik modda taraflar sırayla oynar ve her hamle kaydedilir', async () => {
    const { gm, events } = make(null);
    await gm.start({ mode: 'local', level: 'easy', playerColor: 'w' });
    expect(await gm.tryMove({ from: 'e2', to: 'e4' })).not.toBeNull();
    expect(await gm.tryMove({ from: 'e7', to: 'e5' })).not.toBeNull();
    expect(events.map((e) => e.san)).toEqual(['e4', 'e5']);
    expect(gm.state().history).toEqual(['e4', 'e5']);
    const saved = await loadGame();
    expect(saved?.mode).toBe('local');
    expect(saved?.pgn).toContain('e4 e5');
  });

  test('geçersiz hamle null döner', async () => {
    const { gm, events } = make(null);
    await gm.start({ mode: 'local', level: 'easy', playerColor: 'w' });
    expect(await gm.tryMove({ from: 'e2', to: 'e5' })).toBeNull();
    expect(events).toHaveLength(0);
  });

  test('bilgisayara karşı: oyuncunun hamlesinden sonra rakip oynar', async () => {
    const { opponent } = scripted('e7e5');
    const { gm, events } = make(opponent);
    const states: boolean[] = [];
    gm.on('state', (s) => states.push(s.thinking));
    await gm.start({ mode: 'ai', level: 'hard', playerColor: 'w' });
    await gm.tryMove({ from: 'e2', to: 'e4' });
    await settle(gm);
    expect(events.map((e) => e.san)).toEqual(['e4', 'e5']);
    expect(states).toContain(true);
    expect(gm.state().thinking).toBe(false);
    expect(gm.state().turn).toBe('w');
  });

  test('bilgisayara karşı: sıra rakipteyken oyuncu oynayamaz', async () => {
    let release: (m: MoveRequest) => void = () => {};
    const opponent: Opponent = {
      bestMove: () => new Promise<MoveRequest>((r) => (release = r)),
    };
    const { gm } = make(opponent);
    await gm.start({ mode: 'ai', level: 'hard', playerColor: 'w' });
    await gm.tryMove({ from: 'e2', to: 'e4' });
    expect(gm.state().thinking).toBe(true);
    expect(await gm.tryMove({ from: 'e7', to: 'e5' })).toBeNull();
    release({ from: 'e7', to: 'e5' });
    await settle(gm);
    expect(gm.state().history).toEqual(['e4', 'e5']);
  });

  test('oyuncu siyahsa ilk hamleyi rakip yapar', async () => {
    const { opponent } = scripted('d2d4');
    const { gm, events } = make(opponent);
    await gm.start({ mode: 'ai', level: 'hard', playerColor: 'b' });
    await settle(gm);
    expect(events.map((e) => e.san)).toEqual(['d4']);
    expect(gm.state().turn).toBe('b');
  });

  test('oyun bittikten sonra hamle kabul edilmez', async () => {
    const { gm } = make(null);
    await gm.start({ mode: 'local', level: 'easy', playerColor: 'w' });
    for (const m of ['f2f3', 'e7e5', 'g2g4', 'd8h4']) {
      await gm.tryMove({ from: m.slice(0, 2), to: m.slice(2, 4) });
    }
    expect(gm.state().result).toEqual({ kind: 'checkmate', winner: 'b' });
    expect(await gm.tryMove({ from: 'a2', to: 'a3' })).toBeNull();
  });

  test('geri alma: bilgisayara karşı iki yarım hamle', async () => {
    const { opponent } = scripted('e7e5');
    const { gm } = make(opponent);
    await gm.start({ mode: 'ai', level: 'hard', playerColor: 'w' });
    await gm.tryMove({ from: 'e2', to: 'e4' });
    await settle(gm);
    gm.undo();
    expect(gm.state().history).toEqual([]);
    expect(gm.state().turn).toBe('w');
  });

  test('geri alma: iki kişilik modda bir yarım hamle', async () => {
    const { gm } = make(null);
    await gm.start({ mode: 'local', level: 'easy', playerColor: 'w' });
    await gm.tryMove({ from: 'e2', to: 'e4' });
    await gm.tryMove({ from: 'e7', to: 'e5' });
    gm.undo();
    expect(gm.state().history).toEqual(['e4']);
  });

  test('pes: bilgisayara karşı oyuncu kaybeder', async () => {
    const { opponent } = scripted();
    const { gm } = make(opponent);
    await gm.start({ mode: 'ai', level: 'hard', playerColor: 'w' });
    gm.resign();
    expect(gm.state().result).toEqual({ kind: 'resigned', winner: 'b' });
    expect(await gm.tryMove({ from: 'e2', to: 'e4' })).toBeNull();
  });

  test('pes: iki kişilik modda sırası olan kaybeder', async () => {
    const { gm } = make(null);
    await gm.start({ mode: 'local', level: 'easy', playerColor: 'w' });
    await gm.tryMove({ from: 'e2', to: 'e4' });
    gm.resign();
    expect(gm.state().result).toEqual({ kind: 'resigned', winner: 'w' });
  });

  test('rakip yokken bilgisayara karşı oyun başlatılamaz, iki kişilik başlar', async () => {
    const { gm } = make(null);
    await expect(gm.start({ mode: 'ai', level: 'easy', playerColor: 'w' })).rejects.toThrow();
    await expect(gm.start({ mode: 'local', level: 'easy', playerColor: 'w' })).resolves.toBeUndefined();
  });

  test('kayıt yoksa resume false döner', async () => {
    const { gm } = make(null);
    expect(await gm.resume()).toBe(false);
  });

  test('kayıtlı oyun geri yüklenir', async () => {
    await saveGame({ pgn: '1. e4 e5 2. Nf3', mode: 'local', level: 'easy', playerColor: 'w' });
    const { gm } = make(null);
    expect(await gm.resume()).toBe(true);
    expect(gm.state().history).toEqual(['e4', 'e5', 'Nf3']);
    expect(gm.state().turn).toBe('b');
  });

  test('sıra rakipteyken kaydedilmiş oyun geri yüklenince rakipten hamle istenir', async () => {
    await saveGame({ pgn: '1. e4', mode: 'ai', level: 'hard', playerColor: 'w' });
    const { opponent, calls } = scripted('e7e5');
    const { gm, events } = make(opponent);
    expect(await gm.resume()).toBe(true);
    await settle(gm);
    expect(calls).toHaveLength(1);
    expect(events.map((e) => e.san)).toEqual(['e5']);
    expect(gm.state().turn).toBe('w');
  });

  test('bozuk PGN içeren kayıt atlanır ve silinir', async () => {
    await saveGame({ pgn: 'xx yy zz', mode: 'local', level: 'easy', playerColor: 'w' });
    const { gm } = make(null);
    expect(await gm.resume()).toBe(false);
    expect(gm.state().history).toEqual([]);
    expect(await loadGame()).toBeNull();
  });

  test('biçimi bozuk kayıt atlanır', async () => {
    await writeRawGame('çöp');
    const { gm } = make(null);
    expect(await gm.resume()).toBe(false);
  });

  test('bilgisayar modundaki kayıt rakip yokken geri yüklenmez', async () => {
    await saveGame({ pgn: '1. e4', mode: 'ai', level: 'hard', playerColor: 'w' });
    const { gm } = make(null);
    expect(await gm.resume()).toBe(false);
  });

  test('rakip iki kez hata verirse oyun kilitlenmez ve durum bunu bildirir', async () => {
    const opponent: Opponent = { bestMove: async () => { throw new Error('motor çöktü'); } };
    const { gm } = make(opponent);
    await gm.start({ mode: 'ai', level: 'hard', playerColor: 'w' });
    await gm.tryMove({ from: 'e2', to: 'e4' });
    await settle(gm);
    expect(gm.state().thinking).toBe(false);
    expect(gm.state().opponentFailed).toBe(true);
  });

  test('yeni oyun başlatmak düşünen rakibin eski hamlesini yok sayar', async () => {
    let release: (m: MoveRequest) => void = () => {};
    const opponent: Opponent = {
      bestMove: () => new Promise<MoveRequest>((r) => (release = r)),
    };
    const { gm } = make(opponent);
    await gm.start({ mode: 'ai', level: 'hard', playerColor: 'w' });
    await gm.tryMove({ from: 'e2', to: 'e4' });
    const stale = release;
    await gm.start({ mode: 'local', level: 'easy', playerColor: 'w' });
    stale({ from: 'e7', to: 'e5' });
    await new Promise((r) => setTimeout(r, 0));
    expect(gm.state().history).toEqual([]);
    expect(gm.state().thinking).toBe(false);
  });
});
