import { t } from './i18n';

/**
 * Ekranı kaplayan bir pencere açar. Escape veya pencerenin dışına tıklama `dismissValue` ile kapatır.
 * `build`, içeriği doldurur ve seçim yapıldığında `close(value)` çağırır.
 */
export function openOverlay<T>(
  host: HTMLElement,
  dismissValue: T,
  build: (box: HTMLElement, close: (value: T) => void) => void,
): Promise<T> {
  return new Promise<T>((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    const box = document.createElement('div');
    box.className = 'dialog';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    overlay.append(box);

    const close = (value: T) => {
      document.removeEventListener('keydown', onKey);
      overlay.remove();
      resolve(value);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(dismissValue);
    };
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(dismissValue);
    });
    document.addEventListener('keydown', onKey);

    build(box, close);
    host.append(overlay);
    box.querySelector<HTMLElement>('button')?.focus();
  });
}

export function confirmDialog(host: HTMLElement, message: string): Promise<boolean> {
  return openOverlay<boolean>(host, false, (box, close) => {
    const p = document.createElement('p');
    p.textContent = message;
    const row = document.createElement('div');
    row.className = 'dialog-row';
    const no = document.createElement('button');
    no.type = 'button';
    no.className = 'btn';
    no.dataset.confirm = 'no';
    no.textContent = t('confirm.no');
    no.addEventListener('click', () => close(false));
    const yes = document.createElement('button');
    yes.type = 'button';
    yes.className = 'btn primary';
    yes.dataset.confirm = 'yes';
    yes.textContent = t('confirm.yes');
    yes.addEventListener('click', () => close(true));
    row.append(no, yes);
    box.append(p, row);
  });
}
