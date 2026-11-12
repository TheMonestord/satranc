import { clearHistory, listHistory, type HistoryEntry } from '../game/storage';
import { confirmDialog, openOverlay } from './dialog';
import { getLang, t } from './i18n';
import { resultText } from './resultText';

function describeMode(e: HistoryEntry): string {
  return e.mode === 'local' ? t('history.mode.local') : t('history.mode.ai', { level: t(`level.${e.level}`) });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(getLang() === 'tr' ? 'tr-TR' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

/** Bitmiş oyunların listesini gösterir: tarih, tür, sonuç, hamle sayısı ve PGN kopyalama. */
export async function showHistory(host: HTMLElement, copy: (text: string) => Promise<boolean>): Promise<void> {
  const entries = await listHistory();
  return openOverlay<void>(host, undefined, (box, close) => {
    box.classList.add('history');
    const render = (items: HistoryEntry[]) => {
      box.replaceChildren();
      const title = document.createElement('h2');
      title.textContent = t('history.title');
      box.append(title);

      if (items.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'history-empty';
        empty.textContent = t('history.empty');
        box.append(empty);
      } else {
        const list = document.createElement('ul');
        list.className = 'history-list';
        for (const e of items) {
          const li = document.createElement('li');
          li.className = 'history-item';
          const info = document.createElement('div');
          const head = document.createElement('div');
          head.className = 'history-result';
          head.textContent = resultText(e.result);
          const meta = document.createElement('div');
          meta.className = 'history-meta';
          meta.textContent = [formatDate(e.date), describeMode(e), t('history.moves', { count: String(e.moves) })].join(' · ');
          info.append(head, meta);
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'btn';
          btn.dataset.history = 'copy';
          btn.textContent = t('history.copy');
          btn.addEventListener('click', async () => {
            btn.textContent = t((await copy(e.pgn)) ? 'toast.copied' : 'toast.copyFailed');
          });
          li.append(info, btn);
          list.append(li);
        }
        box.append(list);
      }

      const row = document.createElement('div');
      row.className = 'dialog-row';
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.className = 'btn';
      clear.dataset.history = 'clear';
      clear.textContent = t('history.clear');
      clear.disabled = items.length === 0;
      clear.addEventListener('click', async () => {
        if (!(await confirmDialog(host, t('history.confirmClear')))) return;
        await clearHistory();
        render([]);
      });
      const done = document.createElement('button');
      done.type = 'button';
      done.className = 'btn primary';
      done.dataset.history = 'close';
      done.textContent = t('settings.close');
      done.addEventListener('click', () => close());
      row.append(clear, done);
      box.append(row);
    };
    render(entries);
  });
}
