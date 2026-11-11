import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { EngineClient, type EngineTransport } from '../../src/engine/engineClient';
import { LEVELS } from '../../src/engine/levels';

function fakeTransport() {
  const sent: string[] = [];
  let listener: (line: string) => void = () => {};
  const transport: EngineTransport = {
    post: (cmd) => sent.push(cmd),
    onLine: (cb) => {
      listener = cb;
    },
    terminate: vi.fn(),
  };
  return { transport, sent, emit: (line: string) => listener(line) };
}

describe('EngineClient', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test('init uci gönderir ve uciok gelince çözülür', async () => {
    const f = fakeTransport();
    const client = new EngineClient(f.transport);
    const p = client.init();
    expect(f.sent).toEqual(['uci']);
    f.emit('id name Stockfish');
    f.emit('uciok');
    await expect(p).resolves.toBeUndefined();
  });

  test('uciok gelmezse init 10 saniye sonra reddeder', async () => {
    const f = fakeTransport();
    const client = new EngineClient(f.transport);
    const p = client.init();
    const assertion = expect(p).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
  });

  test('bestMove doğru komutları sırayla gönderir', async () => {
    const f = fakeTransport();
    const client = new EngineClient(f.transport);
    const init = client.init();
    f.emit('uciok');
    await init;
    f.sent.length = 0;

    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const p = client.bestMove(fen, LEVELS.medium);
    expect(f.sent).toEqual([
      'setoption name Skill Level value 8',
      `position fen ${fen}`,
      'go movetime 400',
    ]);
    f.emit('info depth 5 score cp 20');
    f.emit('bestmove e2e4 ponder e7e5');
    await expect(p).resolves.toEqual({ from: 'e2', to: 'e4' });
  });

  test('terfi hamlesi çözümlenir', async () => {
    const f = fakeTransport();
    const client = new EngineClient(f.transport);
    const init = client.init();
    f.emit('uciok');
    await init;
    const p = client.bestMove('8/4P3/8/8/8/8/8/k6K w - - 0 1', LEVELS.easy);
    f.emit('bestmove e7e8q');
    await expect(p).resolves.toEqual({ from: 'e7', to: 'e8', promotion: 'q' });
  });

  test('hamle yoksa bestMove reddeder', async () => {
    const f = fakeTransport();
    const client = new EngineClient(f.transport);
    const init = client.init();
    f.emit('uciok');
    await init;
    const p = client.bestMove('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1', LEVELS.easy);
    const assertion = expect(p).rejects.toThrow();
    f.emit('bestmove (none)');
    await assertion;
  });

  test('dispose taşıyıcıyı kapatır', () => {
    const f = fakeTransport();
    const client = new EngineClient(f.transport);
    client.dispose();
    expect(f.transport.terminate).toHaveBeenCalled();
  });
});
