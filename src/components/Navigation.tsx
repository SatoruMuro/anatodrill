import type { ViewKey } from '../types/anatodrill';

interface NavigationProps {
  current: ViewKey;
  onNavigate: (view: ViewKey) => void;
  isDevMode?: boolean;
}

const items: Array<{ key: ViewKey; label: string }> = [
  { key: 'home', label: 'ホーム' },
  { key: 'drill', label: 'ドリル' },
  { key: 'review', label: '今日の復習' },
  { key: 'test', label: 'テスト' },
  { key: 'questions', label: '問題一覧' },
  { key: 'plates', label: '図版学習' },
  { key: 'history', label: '履歴・バックアップ' },
  { key: 'credits', label: '画像クレジット' },
];

const devItems: Array<{ key: ViewKey; label: string }> = [{ key: 'label_editor', label: 'ラベル作成' }];

export function Navigation({ current, onNavigate, isDevMode = false }: NavigationProps) {
  const visibleItems = isDevMode ? [...items, ...devItems] : items;

  return (
    <header className="app-header">
      <div className="brand-block">
        <div className="brand-mark" aria-hidden="true">
          AD
        </div>
        <div>
          <p className="eyebrow">Anatomy Terminology</p>
          <h1>AnatoDrill</h1>
        </div>
      </div>

      <nav className="main-nav" aria-label="メインナビゲーション">
        {visibleItems.map((item) => (
          <button
            className={item.key === current ? 'nav-button active' : 'nav-button'}
            key={item.key}
            type="button"
            onClick={() => onNavigate(item.key)}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </header>
  );
}
