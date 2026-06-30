import { FormEvent, useState } from 'react';

interface EditorAccessGateProps {
  onUnlock: () => void;
  password: string;
}

export function EditorAccessGate({ onUnlock, password }: EditorAccessGateProps) {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (input === password) {
      setError('');
      onUnlock();
      return;
    }

    setError('パスワードが違います。');
  };

  return (
    <main className="editor-access-shell">
      <form className="editor-access-card" onSubmit={handleSubmit}>
        <p className="eyebrow">Editor Access</p>
        <h2>編集者用ページ</h2>
        <p>このページは教材編集者向けです。パスワードを入力してください。</p>

        <label>
          パスワード
          <input
            autoComplete="current-password"
            autoFocus
            onChange={(event) => setInput(event.target.value)}
            type="password"
            value={input}
          />
        </label>

        {error ? <p className="error-text">{error}</p> : null}

        <button className="primary-button" type="submit">
          開く
        </button>

        <p className="editor-access-note">
          静的サイト上の簡易保護です。編集出力は自動保存されないため、CSV を手動で反映してください。
        </p>
      </form>
    </main>
  );
}
