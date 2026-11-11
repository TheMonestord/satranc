import type { MoveRequest, PieceType } from '../core/types';
import type { LevelConfig } from './levels';

/** Motorla satır satır konuşmanın soyutlaması; testlerde sahtesi kullanılır. */
export interface EngineTransport {
  post(cmd: string): void;
  onLine(cb: (line: string) => void): void;
  terminate(): void;
}

const INIT_TIMEOUT_MS = 10_000;

export class EngineClient {
  private pending: { resolve: (m: MoveRequest) => void; reject: (e: Error) => void } | null = null;
  private onReady: (() => void) | null = null;

  constructor(private transport: EngineTransport) {
    transport.onLine((line) => this.handleLine(line));
  }

  static createWorkerTransport(url: string): EngineTransport {
    const worker = new Worker(url);
    let listener: (line: string) => void = () => {};
    worker.onmessage = (ev: MessageEvent) => {
      if (typeof ev.data === 'string') listener(ev.data);
    };
    return {
      post: (cmd) => worker.postMessage(cmd),
      onLine: (cb) => {
        listener = cb;
      },
      terminate: () => worker.terminate(),
    };
  }

  init(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.onReady = null;
        reject(new Error('Satranç motoru zamanında yanıt vermedi'));
      }, INIT_TIMEOUT_MS);
      this.onReady = () => {
        clearTimeout(timer);
        this.onReady = null;
        resolve();
      };
      this.transport.post('uci');
    });
  }

  bestMove(fen: string, cfg: LevelConfig): Promise<MoveRequest> {
    if (this.pending) {
      this.pending.reject(new Error('Yeni hamle istendi'));
      this.pending = null;
      this.transport.post('stop');
    }
    return new Promise<MoveRequest>((resolve, reject) => {
      this.pending = { resolve, reject };
      this.transport.post(`setoption name Skill Level value ${cfg.skill}`);
      this.transport.post(`position fen ${fen}`);
      this.transport.post(`go movetime ${cfg.moveTimeMs}`);
    });
  }

  dispose(): void {
    if (this.pending) {
      this.pending.reject(new Error('Motor kapatıldı'));
      this.pending = null;
    }
    this.transport.terminate();
  }

  private handleLine(line: string): void {
    if (line === 'uciok') {
      this.onReady?.();
      return;
    }
    if (!line.startsWith('bestmove') || !this.pending) return;
    const { resolve, reject } = this.pending;
    this.pending = null;
    const match = /^bestmove ([a-h][1-8])([a-h][1-8])([qrbn])?/.exec(line);
    if (!match) {
      reject(new Error('Motor hamle bulamadı'));
      return;
    }
    const move: MoveRequest = { from: match[1], to: match[2] };
    if (match[3]) move.promotion = match[3] as PieceType;
    resolve(move);
  }
}
