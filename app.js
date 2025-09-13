// ボタンと要素の取得
const textInput = document.getElementById("textInput");
const urlInput = document.getElementById("urlInput");
const pdfInput = document.getElementById("pdfInput");
const lengthSelect = document.getElementById("lengthSelect");
const customLength = document.getElementById("customLength");
const styleSelect = document.getElementById("styleSelect");
const summaryOutput = document.getElementById("summaryOutput");
const copyBtn = document.getElementById("copyBtn");
const clearBtn = document.getElementById("clearBtn");

// カスタム長さの表示切替
lengthSelect.addEventListener("change", () => {
  if (lengthSelect.value === "custom") {
    customLength.style.display = "inline-block";
  } else {
    customLength.style.display = "none";
  }
});

// コピー機能
copyBtn.addEventListener("click", () => {
  const text = summaryOutput.innerText;
  if (text) {
    navigator.clipboard.writeText(text).then(() => {
      alert("要約をコピーしました");
    });
  }
});

// クリア機能
clearBtn.addEventListener("click", () => {
  textInput.value = "";
  urlInput.value = "";
  pdfInput.value = "";
  summaryOutput.innerText = "ここに要約が表示されます";
});

// 仮の要約処理（ダミー）
function generateSummary() {
  const inputText = textInput.value || urlInput.value || "PDF（未実装）";
  if (!inputText) {
    summaryOutput.innerText = "入力がありません";
    return;
  }

  const length = lengthSelect.value;
  const style = styleSelect.value;

  summaryOutput.innerText =
    `【ダミー要約】\n長さ: ${length}\nスタイル: ${style}\n\n本文:\n${inputText.substring(0, 100)}...`;
}
