/* ===== 要約Bot — URL安定化＋片手操作改善 =====
   手順は1つだけ：
   1) 下の PROXY_ENDPOINT に、GASをデプロイしたURLを貼る
================================================ */

const PROXY_ENDPOINT = "https://script.google.com/macros/s/AKfycbzmc-X0WjvFLaAeoNTBEqEa7d4hjhQzWtu0RxIcVlXng1h7tN0VB_l2ZIjkwlvamP-5/exec";

const qs = sel => document.querySelector(sel);
const qsa = sel => Array.from(document.querySelectorAll(sel));

const state = {
  busy: false,
};

window.addEventListener('DOMContentLoaded', () => {
  // タブ切替
  qsa('.yb-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      qsa('.yb-tab').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      const tab = btn.dataset.tab;
      qsa('.yb-panel').forEach(p => {
        p.classList.toggle('is-hidden', p.dataset.panel !== tab);
      });
    });
  });

  // URL→要約
  qs('#fetchUrlBtn')?.addEventListener('click', handleUrlSummarize);
  // ペースト→要約
  qs('#summarizePasteBtn')?.addEventListener('click', handlePasteSummarize);
  // 下部バー：コピー／クリア
  qs('#copyBtn')?.addEventListener('click', copyOutput);
  qs('#clearBtn')?.addEventListener('click', clearAll);

  // PWA（任意）：サービスワーカー登録
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
  }
});

/* ========== 共通UI ========== */

function setBusy(val, msg="") {
  state.busy = val;
  const btns = qsa('button');
  btns.forEach(b => b.disabled = val && !b.classList.contains('yb-btn-plain'));
  setStatus(msg);
}
function setStatus(msg) {
  qs('#status').textContent = msg || "";
}

function getOptions() {
  const length = document.querySelector('input[name="length"]:checked')?.value || 'short';
  const custom = qs('#customLength')?.value?.trim();
  const style = document.querySelector('input[name="style"]:checked')?.value || 'friendly';

  let targetChars = null;
  if (length === 'custom' && custom) {
    targetChars = Math.max(10, parseInt(custom, 10) || 0);
  } else if (length === 'short') targetChars = 100;
  else if (length === 'medium') targetChars = 300;
  else if (length === 'long') targetChars = 750;

  return { length, targetChars, style };
}

/* ========== URL処理：直→プロキシの自動切替 ========== */

async function handleUrlSummarize() {
  const url = qs('#urlInput').value.trim();
  if (!url) { setStatus("URLを入力してください。"); return; }

  setBusy(true, "取得中…");
  try {
    const html = await fetchWithFallback(url);
    if (!html) throw new Error("本文の取得に失敗しました。");

    // ページのテキスト抽出（超シンプル）
    const text = extractReadableText(html).slice(0, 200000); // 安全上の上限
    await runSummarization(text);
  } catch (e) {
    console.error(e);
    setStatus("要約に失敗しました。本文を貼り付けてください。");
  } finally {
    setBusy(false);
  }
}

async function fetchWithFallback(targetUrl) {
  // 1) 直接取得
  try {
    const res = await fetch(targetUrl, { mode: 'cors' });
    if (res.ok) return await res.text();
    // CORSやブロック系はここに来ないこともある
  } catch (_) {
    // ネットワーク/ CORS 例外は握りつぶして次へ
  }

  // 2) プロキシに自動切替（ユーザー操作不要）
  if (!PROXY_ENDPOINT || PROXY_ENDPOINT.startsWith("<<<")) {
    throw new Error("プロキシ未設定");
  }
  const proxied = new URL(PROXY_ENDPOINT);
  proxied.searchParams.set("url", targetUrl);

  const res2 = await fetch(proxied.toString(), { mode: 'cors' });
  if (!res2.ok) throw new Error("プロキシ取得失敗");
  return await res2.text();
}

/* ====== 超簡易の本文抽出（見出し＋本文テキスト優先） ====== */
function extractReadableText(html) {
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    // 不要セクション削除
    doc.querySelectorAll('script,style,nav,footer,form,header,aside').forEach(el=>el.remove());
    const parts = [];
    doc.querySelectorAll('h1,h2,h3,p,article,section,main,li').forEach(el=>{
      const t = (el.innerText || "").trim();
      if (t && t.length > 1) parts.push(t);
    });
    return parts.join('\n');
  } catch {
    return html;
  }
}

/* ========== ペースト要約 ========== */
async function handlePasteSummarize() {
  const text = qs('#pasteInput').value.trim();
  if (!text) { setStatus("本文を貼り付けてください。"); return; }
  setBusy(true, "要約中…");
  try {
    await runSummarization(text);
  } catch (e) {
    console.error(e);
    setStatus("要約に失敗しました。");
  } finally {
    setBusy(false);
  }
}

/* ========== クリップボード／クリア ========== */
async function copyOutput() {
  const out = qs('#output').value;
  if (!out) return;
  try {
    await navigator.clipboard.writeText(out);
    setStatus("コピーしました。");
  } catch {
    setStatus("コピーに失敗しました。");
  }
}
function clearAll() {
  qs('#urlInput').value = "";
  qs('#pasteInput').value = "";
  qs('#output').value = "";
  setStatus("クリアしました。");
}

/* ========== 要約呼び出し（既存エンジンに丸投げ） ========== */
/* ここが重要：ユーザーのご要望どおり
   「投げられた文字列を一旦全部解釈 → 要約 → 語尾などはAI生成に任せる」
   をプロンプトで完結させる。 */

function buildPrompt(sourceText, opts){
  const { style, targetChars } = opts;

  // スタイル指示（差分は控えめ。語尾はAI裁量。）
  const styleLine =
    style === 'bullets'  ? "・箇条書きで要点のみを列挙してください。" :
    style === 'business' ? "丁寧だが簡潔なビジネス文体で、断定を避けつつ要点を明確にしてください。" :
                           "フレンドリーな自然体の日本語で、やさしく簡潔にまとめてください。";

  const lenLine = targetChars
    ? `全体でおおむね ${targetChars} 文字以内に収めてください。`
    : "長さ指定はUIの選択に従ってください。";

  // ここで「まず解釈→要約」を徹底
  return [
    "あなたは要約アシスタントです。以下の原文をまず全体把握し、論旨・主張・根拠・結論・注意点の順で最短経路でまとめてください。",
    "出力は必ず日本語。固有名詞や数値は保持し、推測や創作はしないでください。",
    styleLine,
    lenLine,
    "語尾や表現はAIの裁量に任せます（敬語・常体は文脈に合わせて自然に）。",
    "―― 原文ここから ――",
    sourceText,
    "―― 原文ここまで ――"
  ].join("\n");
}

/* 既存の要約エンジンが window.summarize にある想定。
   無い場合はエラーメッセージを出すだけ（安全）。*/
async function runSummarization(sourceText){
  const opts = getOptions();
  const prompt = buildPrompt(sourceText, opts);

  if (typeof window.summarize !== "function") {
    qs('#output').value = "";
    setStatus("要約エンジンが未設定です。既存のsummarize関数に接続してください。");
    return;
  }

  setStatus("要約中…");
  const resultText = await window.summarize(prompt, opts); // 既存実装をそのまま利用
  qs('#output').value = (resultText || "").trim();
  setStatus("完了");
}
