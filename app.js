// 要素取得
const textInput = document.getElementById("textInput");
const urlInput = document.getElementById("urlInput");
const pdfInput = document.getElementById("pdfInput");
const lengthSelect = document.getElementById("lengthSelect");
const customLength = document.getElementById("customLength");
const styleSelect = document.getElementById("styleSelect");
const summaryOutput = document.getElementById("summaryOutput");
const copyBtn = document.getElementById("copyBtn");
const clearBtn = document.getElementById("clearBtn");

// カスタム長さのUI切替
lengthSelect.addEventListener("change", () => {
  if (lengthSelect.value === "custom") {
    customLength.style.display = "inline-block";
    customLength.focus();
  } else {
    customLength.style.display = "none";
  }
});

// コピー
copyBtn.addEventListener("click", () => {
  const text = summaryOutput.innerText || "";
  if (!text.trim()) return;
  navigator.clipboard.writeText(text).then(() => {
    alert("要約をコピーしました");
  });
});

// クリア
clearBtn.addEventListener("click", () => {
  textInput.value = "";
  urlInput.value = "";
  if (pdfInput) pdfInput.value = "";
  summaryOutput.innerText = "ここに要約が表示されます";
});

// ====== 要約処理 ======

/** 文字数ターゲットの決定 */
function targetLength() {
  const map = { short: 90, medium: 300, long: 700 };
  if (lengthSelect.value === "custom") {
    const v = parseInt(customLength.value, 10);
    return isNaN(v) || v <= 0 ? 200 : Math.min(2000, v);
  }
  return map[lengthSelect.value] || 200;
}

/** 文の分割（簡易） */
function splitSentences(text) {
  const t = text
    .replace(/\s+/g, " ")
    .replace(/([。．！？!?\n\r]+)/g, "$1|")
    .split("|")
    .map(s => s.trim())
    .filter(Boolean);
  return t;
}

/** 粗い重要度順抽出 */
function pickKeySentences(sentences, maxChars) {
  const used = new Set();
  const result = [];
  let total = 0;

  const scored = sentences.map(s => {
    const len = s.length;
    const keywordScore = (s.match(/[A-Za-z0-9一-龥]{2,}/g) || []).length;
    const score = keywordScore - len / 200;
    return { s, score };
  }).sort((a, b) => b.score - a.score);

  for (const { s } of scored) {
    const sig = s.replace(/\s/g, "");
    if (used.has(sig)) continue;
    if (total + s.length > maxChars) continue;
    result.push(s);
    used.add(sig);
    total += s.length;
    if (total >= maxChars) break;
  }

  if (result.length === 0) {
    let buf = "";
    for (const s of sentences) {
      if (buf.length + s.length > maxChars) break;
      buf += (buf ? " " : "") + s;
    }
    return buf ? [buf] : [];
  }
  return result;
}

/** 出力スタイル */
function renderByStyle(lines, style) {
  const joined = lines.join(" ");
  switch (style) {
    case "bullet":
      return lines.map(l => `・${l}`).join("\n");
    case "friendly":
      return `かんたん要約：\n${joined}\n\n（必要なら「長さ」を調整してね）`;
    case "business":
      return `要約（業務向け）：\n${joined}`;
    default:
      return joined;
  }
}

/** HTML → テキスト */
function htmlToText(html) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    ["script","style","noscript","iframe","nav","footer"].forEach(sel =>
      doc.querySelectorAll(sel).forEach(el => el.remove())
    );
    const text = doc.body ? doc.body.innerText : doc.documentElement.innerText;
    return (text || "").replace(/\n{3,}/g, "\n\n").trim();
  } catch {
    return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }
}

/** PDF → テキスト（PDF.js 使用） */
async function extractPdfText(file) {
  // 読み込み
  const buf = await file.arrayBuffer();
  // Worker不要の組込みビルドを利用（CDN読み込み済み）
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;

  let all = "";
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const strings = content.items.map(it => ("str" in it ? it.str : "")).filter(Boolean);
    const text = strings.join(" ").replace(/\s+/g, " ").trim();
    if (text) all += (all ? "\n" : "") + text;
  }
  return all.trim();
}

/** メイン：要約を生成 */
async function generateSummary() {
  summaryOutput.innerText = "要約中…";

  const plain = (textInput.value || "").trim();
  const pdfFile = pdfInput && pdfInput.files && pdfInput.files[0];
  const url = (urlInput.value || "").trim();

  try {
    let sourceText = "";

    if (plain) {
      sourceText = plain;

    } else if (pdfFile) {
      try {
        sourceText = await extractPdfText(pdfFile);
        if (!sourceText) {
          summaryOutput.innerText = "PDFから本文が取得できませんでした。スキャン画像の可能性があります。";
          return;
        }
      } catch (e) {
        console.error(e);
        summaryOutput.innerText = "PDFの読み取りに失敗しました。別のPDFでお試しください。";
        return;
      }

    } else if (url) {
      try {
        const res = await fetch(url, { mode: "cors" });
        const html = await res.text();
        sourceText = htmlToText(html);
        if (!sourceText) throw new Error("no text");
      } catch (e) {
        summaryOutput.innerText =
          "URLの本文取得に失敗しました（サイトの制限/CORSの可能性）。\n→ ページ内容をコピーしてペーストしてください。";
        return;
      }

    } else {
      summaryOutput.innerText = "入力がありません。テキストをペーストするか、URLまたはPDFを指定してください。";
      return;
    }

    const maxChars = targetLength();
    const sentences = splitSentences(sourceText);
    const picked = pickKeySentences(sentences, maxChars);
    const styled = renderByStyle(picked, styleSelect.value);

    summaryOutput.innerText = styled || "内容が短すぎるため要約できませんでした。";

  } catch (err) {
    console.error(err);
    summaryOutput.innerText = "要約に失敗しました。もう一度お試しください。";
  }
}

// グローバル公開（index.html の onclick から呼ぶため）
window.generateSummary = generateSummary;
