import { useMemo, useState } from 'react';
import type { TestAttempt } from '../types/anatodrill';
import {
  buildFacebookShareUrl,
  buildTestResultShareText,
  buildThreadsShareUrl,
  buildXShareUrl,
  copyTestResultShareText,
  createTestResultShareCard,
  downloadTestResultShareCard,
} from '../lib/testShare';

interface TestResultShareProps {
  attempt: TestAttempt;
}

type ImageShareTarget = 'Instagram' | 'Facebook';

const IMAGE_SHARE_TARGET_URLS: Record<ImageShareTarget, string> = {
  Instagram: 'https://www.instagram.com/',
  Facebook: buildFacebookShareUrl(),
};

function openShareWindow(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function TestResultShare({ attempt }: TestResultShareProps) {
  const [includeName, setIncludeName] = useState(false);
  const [isSharingImage, setIsSharingImage] = useState(false);
  const [status, setStatus] = useState('');
  const shareText = useMemo(
    () => buildTestResultShareText(attempt, includeName),
    [attempt, includeName],
  );

  const copyShareText = async () => {
    try {
      await copyTestResultShareText(shareText);
      setStatus('共有文をコピーしました。');
    } catch (error) {
      console.warn('AnatoDrill share: copying share text failed.', error);
      setStatus('共有文をコピーできませんでした。');
    }
  };

  const shareImage = async (target: ImageShareTarget) => {
    setStatus('');
    setIsSharingImage(true);
    let file: File | null = null;

    try {
      file = createTestResultShareCard(attempt, includeName);
      const canShareFile =
        typeof navigator.share === 'function' &&
        (typeof navigator.canShare !== 'function' || navigator.canShare({ files: [file] }));

      if (canShareFile) {
        await navigator.share({
          title: 'AnatoDrill テスト結果',
          text: shareText,
          files: [file],
        });
        setStatus(`${target}への共有画面を開きました。`);
        return;
      }

      downloadTestResultShareCard(file);
      openShareWindow(IMAGE_SHARE_TARGET_URLS[target]);
      await copyTestResultShareText(shareText);
      setStatus(`結果画像を保存し、共有文をコピーしました。${target}で貼り付けてください。`);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setStatus('共有をキャンセルしました。');
      } else {
        console.warn('AnatoDrill share: sharing result image failed.', error);
        if (file) {
          downloadTestResultShareCard(file);
        }
        try {
          await copyTestResultShareText(shareText);
          setStatus('共有画面を開けなかったため、結果画像を保存し、共有文をコピーしました。');
        } catch (copyError) {
          console.warn('AnatoDrill share: fallback copy failed.', copyError);
          setStatus('共有画面を開けませんでした。結果画像は端末に保存しました。');
        }
      }
    } finally {
      setIsSharingImage(false);
    }
  };

  return (
    <section className="test-share-panel" aria-labelledby="test-share-heading">
      <div className="test-share-heading">
        <div>
          <p className="eyebrow">Share result</p>
          <h3 id="test-share-heading">テスト結果をシェア</h3>
        </div>
        <span className="privacy-badge">学籍番号は非掲載</span>
      </div>

      <label className="share-name-toggle">
        <input
          type="checkbox"
          checked={includeName}
          onChange={(event) => {
            setIncludeName(event.target.checked);
            setStatus('');
          }}
        />
        <span>
          <strong>氏名を掲載する</strong>
          <small>初期設定では氏名も掲載しません。</small>
        </span>
      </label>

      <div className="share-text-preview" aria-label="共有される本文">
        <span>共有文のプレビュー</span>
        <pre>{shareText}</pre>
      </div>

      <div className="sns-share-grid" aria-label="SNSを選択">
        <button
          type="button"
          className="sns-share-button x"
          onClick={() => {
            openShareWindow(buildXShareUrl(attempt, includeName));
            setStatus('Xの投稿画面を開きました。');
          }}
        >
          X
        </button>
        <button
          type="button"
          className="sns-share-button instagram"
          disabled={isSharingImage}
          onClick={() => void shareImage('Instagram')}
        >
          Instagram
        </button>
        <button
          type="button"
          className="sns-share-button facebook"
          disabled={isSharingImage}
          onClick={() => void shareImage('Facebook')}
        >
          Facebook
        </button>
        <button
          type="button"
          className="sns-share-button threads"
          onClick={() => {
            openShareWindow(buildThreadsShareUrl(attempt, includeName));
            setStatus('Threadsの投稿画面を開きました。');
          }}
        >
          Threads
        </button>
      </div>

      <div className="share-utility-row">
        <button type="button" className="secondary-button" onClick={() => void copyShareText()}>
          本文をコピー
        </button>
        <button
          type="button"
          className="secondary-button"
          onClick={() => {
            try {
              downloadTestResultShareCard(createTestResultShareCard(attempt, includeName));
              setStatus('点数入りの結果画像を保存しました。');
            } catch (error) {
              console.warn('AnatoDrill share: saving result image failed.', error);
              setStatus('結果画像を保存できませんでした。');
            }
          }}
        >
          結果画像を保存
        </button>
        <p>Instagram・Facebookでは、点数入りの画像を共有します。</p>
      </div>

      {status ? <p className="share-status" role="status">{status}</p> : null}
    </section>
  );
}
