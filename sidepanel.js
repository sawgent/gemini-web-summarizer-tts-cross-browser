/**
 * Gemini Summarizer - Cross-Browser Side Panel Script (YouTube & Sesli Okuma Destekli)
 */

const browserAPI = (typeof browser !== "undefined" && browser.runtime) ? browser : chrome;

document.addEventListener("DOMContentLoaded", () => {
  const sessionBadge = document.getElementById("session-badge");
  const badgeDot = document.getElementById("badge-dot");
  const badgeLabel = document.getElementById("badge-label");
  const loginAlert = document.getElementById("login-alert");

  const btnRefreshTab = document.getElementById("btn-refresh-tab");
  const segSelection = document.getElementById("seg-selection");
  const segPage = document.getElementById("seg-page");
  const segYoutube = document.getElementById("seg-youtube");

  const sourceTag = document.getElementById("source-tag");
  const sourceChars = document.getElementById("source-chars");
  const sourcePreview = document.getElementById("source-preview");

  const modeChips = document.querySelectorAll(".mode-chips .chip");
  const customPromptInput = document.getElementById("custom-prompt");
  const btnStartSummary = document.getElementById("btn-start-summary");
  const btnSummaryText = document.getElementById("btn-summary-text");
  const resultTitle = document.getElementById("result-title");

  const resultContent = document.getElementById("result-content");
  const btnSpeakResult = document.getElementById("btn-speak-result");
  const btnCopyResult = document.getElementById("btn-copy-result");
  const btnClearResult = document.getElementById("btn-clear-result");

  const qaContainer = document.getElementById("qa-container");
  const qaInput = document.getElementById("qa-input");
  const btnQaSend = document.getElementById("btn-qa-send");

  let currentSourceType = "selection";
  let currentSummaryMode = "bullet";
  let activeTabContent = {
    selectedText: "",
    pageText: "",
    isYouTube: false,
    ytData: null,
    title: "",
    url: ""
  };
  let currentRawSummary = "";
  let isSpeaking = false;

  // ==========================================================================
  // 1. OTURUM KONTROLÜ
  // ==========================================================================

  function checkSession() {
    badgeDot.className = "badge-dot";
    badgeLabel.textContent = "Kontrol Ediliyor...";

    browserAPI.runtime.sendMessage({ action: "CHECK_SESSION" }, (response) => {
      if (browserAPI.runtime.lastError || !response) {
        badgeDot.className = "badge-dot error";
        badgeLabel.textContent = "Bağlantı Hatası";
        return;
      }

      if (response.isLoggedIn) {
        badgeDot.className = "badge-dot active";
        badgeLabel.textContent = response.userEmail ? response.userEmail : "Oturum Açık";
        loginAlert.classList.add("hidden");
      } else {
        badgeDot.className = "badge-dot error";
        badgeLabel.textContent = "Giriş Yapılmadı";
        loginAlert.classList.remove("hidden");
      }
    });
  }

  sessionBadge.addEventListener("click", checkSession);

  // ==========================================================================
  // 2. AKTİF SEKMEDEN İÇERİK ÇEKME
  // ==========================================================================

  async function fetchActiveTabData() {
    try {
      const tabs = await browserAPI.tabs.query({ active: true, currentWindow: true });
      const tab = tabs && tabs[0];
      if (!tab || !tab.id) {
        sourcePreview.textContent = "Aktif sekme tespit edilemedi.";
        return;
      }

      const url = tab.url || "";
      if (url.startsWith("edge://") || url.startsWith("chrome://") || url.startsWith("about:") || url.startsWith("moz-extension://")) {
        sourcePreview.textContent = "Tarayıcı iç sayfalarında özetleme yapılamaz. Lütfen normal bir web sitesini açın.";
        return;
      }

      browserAPI.tabs.sendMessage(tab.id, { action: "GET_PAGE_DATA" }, (res) => {
        if (browserAPI.runtime.lastError || !res) {
          sourcePreview.textContent = "Sayfa içeriği okunamadı. Sayfayı yenileyip tekrar deneyebilirsiniz.";
          return;
        }

        activeTabContent = {
          selectedText: res.selectedText || "",
          pageText: res.pageText || "",
          isYouTube: Boolean(res.isYouTube),
          ytData: res.ytData || null,
          title: res.title || tab.title || "",
          url: res.url || tab.url || ""
        };

        if (activeTabContent.isYouTube && activeTabContent.ytData) {
          segYoutube.classList.remove("hidden");
          setSourceType("youtube");
        } else {
          segYoutube.classList.add("hidden");
          if (activeTabContent.selectedText && activeTabContent.selectedText.length > 5) {
            setSourceType("selection");
          } else {
            setSourceType("page");
          }
        }
      });
    } catch (e) {
      console.warn("Sekme verisi alınamadı:", e);
    }
  }

  function setSourceType(type) {
    currentSourceType = type;
    [segSelection, segPage, segYoutube].forEach(b => b.classList.remove("active"));

    if (type === "youtube") {
      segYoutube.classList.add("active");
      sourceTag.textContent = "📺 YouTube Videosu";
      resultTitle.textContent = "YouTube Video Özeti";
      btnSummaryText.textContent = "Videoyu Gemini ile Özetle";

      const yt = activeTabContent.ytData;
      if (yt) {
        sourceChars.textContent = yt.hasTranscript 
          ? `Transkript: ${yt.transcriptLength} karakter` 
          : "Açıklama Modu";
        sourcePreview.textContent = `▶ ${yt.title}\nKanal: ${yt.channel || 'Bilinmiyor'}\n${yt.hasTranscript ? '✓ Video konuşma metni (transkript) hazır.' : 'ℹ Altyazı bulunamadı, video açıklaması ve detayları üzerinden özetlenecek.'}`;
      } else {
        sourcePreview.textContent = "Video bilgileri alınıyor...";
      }

    } else if (type === "selection") {
      segSelection.classList.add("active");
      sourceTag.textContent = "Seçili Metin";
      resultTitle.textContent = "Gemini Özeti";
      btnSummaryText.textContent = "Gemini ile Özet Çıkart";
      const text = activeTabContent.selectedText;
      sourceChars.textContent = `${text ? text.length : 0} karakter`;
      sourcePreview.textContent = text ? text : "Sayfada seçili bir metin yok. Metin seçip 'Sekmeyi Tara' butonuna basabilir veya 'Tüm Sayfa' modunu kullanabilirsiniz.";

    } else {
      segPage.classList.add("active");
      sourceTag.textContent = "Tüm Sayfa";
      resultTitle.textContent = "Sayfa Özeti";
      btnSummaryText.textContent = "Sayfayı Gemini ile Özetle";
      const text = activeTabContent.pageText;
      sourceChars.textContent = `${text ? text.length : 0} karakter`;
      sourcePreview.textContent = text ? text : "Sayfa metni bulunamadı.";
    }
  }

  segSelection.addEventListener("click", () => setSourceType("selection"));
  segPage.addEventListener("click", () => setSourceType("page"));
  segYoutube.addEventListener("click", () => setSourceType("youtube"));
  btnRefreshTab.addEventListener("click", fetchActiveTabData);

  // ==========================================================================
  // 3. ÖZET BİÇİMİ SEÇİCİ
  // ==========================================================================

  modeChips.forEach(chip => {
    chip.addEventListener("click", () => {
      modeChips.forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      currentSummaryMode = chip.getAttribute("data-mode");
    });
  });

  // ==========================================================================
  // 4. ÖZETLEME İŞLEMİ
  // ==========================================================================

  btnStartSummary.addEventListener("click", () => {
    stopSpeaking();
    let textToSummarize = "";
    let modeToUse = currentSummaryMode;

    if (currentSourceType === "youtube") {
      textToSummarize = activeTabContent.ytData ? activeTabContent.ytData.fullText : "";
      modeToUse = "youtube";
    } else if (currentSourceType === "selection") {
      textToSummarize = activeTabContent.selectedText;
    } else {
      textToSummarize = activeTabContent.pageText;
    }

    if (!textToSummarize || textToSummarize.trim().length < 5) {
      alert("Özetlenecek içerik bulunamadı. Lütfen bir metin seçin veya sayfa yüklendikten sonra 'Sekmeyi Tara' butonuna tıklayın.");
      return;
    }

    executeSummary(textToSummarize, modeToUse, customPromptInput.value.trim());
  });

  function executeSummary(text, mode, customPrompt = "") {
    btnStartSummary.disabled = true;
    btnStartSummary.innerHTML = `
      <div class="spinner" style="width:16px;height:16px;border-width:2px;"></div>
      <span>Gemini Hazırlıyor...</span>
    `;

    resultContent.innerHTML = `
      <div class="loading-box">
        <div class="spinner"></div>
        <span>${mode === 'youtube' ? 'YouTube video transkripti analiz ediliyor...' : 'Google Gemini oturumunuz üzerinden özetleniyor...'}</span>
      </div>
    `;

    browserAPI.runtime.sendMessage(
      { action: "REQUEST_SUMMARY", text: text, mode: mode, customPrompt: customPrompt },
      (res) => {
        btnStartSummary.disabled = false;
        btnStartSummary.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L14.4 8.6L21 11L14.4 13.4L12 20L9.6 13.4L3 11L9.6 8.6L12 2Z"/>
          </svg>
          <span id="btn-summary-text">${currentSourceType === 'youtube' ? 'Videoyu Gemini ile Özetle' : 'Gemini ile Özet Çıkart'}</span>
        `;

        if (!res) {
          resultContent.innerHTML = `<div class="alert-box"><strong>Hata:</strong> Arka plan servisi yanıt vermedi.</div>`;
          return;
        }

        if (res.success && res.summary) {
          currentRawSummary = res.summary;
          resultContent.innerHTML = renderSimpleMarkdown(res.summary);
          qaContainer.classList.remove("hidden");
        } else {
          resultContent.innerHTML = `<div class="alert-box"><strong>Özetleme Başarısız:</strong><p>${res.error || 'Hata'}</p></div>`;
        }
      }
    );
  }

  // ==========================================================================
  // 5. SESLİ OKUMA (TEXT-TO-SPEECH) MOTORU
  // ==========================================================================

  function cleanForSpeech(text) {
    if (!text) return "";
    return text
      .replace(/^#+\s+/gm, "")
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/\*(.*?)\*/g, "$1")
      .replace(/```[\s\S]*?```/g, "Kod bloğu.")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/^\s*[\-\*•]\s+/gm, "")
      .replace(/^\s*\d+\.\s+/gm, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/[>#*_~`]/g, "")
      .trim();
  }

  function stopSpeaking() {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    isSpeaking = false;
    updateSpeakButtonUI(false);
  }

  function updateSpeakButtonUI(speaking) {
    if (speaking) {
      btnSpeakResult.style.color = "var(--accent-purple)";
      btnSpeakResult.setAttribute("title", "Okumayı Durdur");
      btnSpeakResult.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="4" width="4" height="16" rx="1"></rect>
          <rect x="14" y="4" width="4" height="16" rx="1"></rect>
        </svg>
      `;
    } else {
      btnSpeakResult.style.color = "";
      btnSpeakResult.setAttribute("title", "Sesli Oku");
      btnSpeakResult.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
        </svg>
      `;
    }
  }

  btnSpeakResult.addEventListener("click", () => {
    if (!("speechSynthesis" in window)) {
      alert("Tarayıcınız sesli okuma özelliğini (Web Speech API) desteklemiyor.");
      return;
    }

    if (isSpeaking || window.speechSynthesis.speaking) {
      stopSpeaking();
      return;
    }

    if (!currentRawSummary) {
      alert("Sesli okunacak bir özet bulunamadı.");
      return;
    }

    const speakText = cleanForSpeech(currentRawSummary);
    if (!speakText) return;

    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(speakText);
    utter.rate = 1.0;
    utter.pitch = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const trVoice = voices.find(v => v.lang.startsWith("tr"));
    if (trVoice) {
      utter.voice = trVoice;
      utter.lang = "tr-TR";
    } else {
      utter.lang = "tr-TR";
    }

    utter.onstart = () => {
      isSpeaking = true;
      updateSpeakButtonUI(true);
    };

    utter.onend = () => {
      isSpeaking = false;
      updateSpeakButtonUI(false);
    };

    utter.onerror = () => {
      isSpeaking = false;
      updateSpeakButtonUI(false);
    };

    window.speechSynthesis.speak(utter);
  });

  // ==========================================================================
  // 6. TAKİP SORUSU
  // ==========================================================================

  btnQaSend.addEventListener("click", sendFollowUpQuestion);
  qaInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendFollowUpQuestion();
  });

  function sendFollowUpQuestion() {
    const question = qaInput.value.trim();
    if (!question) return;

    let baseText = "";
    if (currentSourceType === "youtube") {
      baseText = activeTabContent.ytData ? activeTabContent.ytData.fullText : "";
    } else if (currentSourceType === "selection") {
      baseText = activeTabContent.selectedText;
    } else {
      baseText = activeTabContent.pageText;
    }

    qaInput.value = "";
    qaInput.disabled = true;
    btnQaSend.disabled = true;

    const qaBubble = document.createElement("div");
    qaBubble.style.marginTop = "14px";
    qaBubble.style.padding = "10px";
    qaBubble.style.borderRadius = "8px";
    qaBubble.style.background = "var(--bg-secondary)";
    qaBubble.style.borderLeft = "3px solid var(--accent-purple)";
    qaBubble.innerHTML = `<strong>Soru:</strong> ${question}<div class="qa-answer" style="margin-top:6px; color:var(--text-secondary);"><em>Gemini yanıtlıyor...</em></div>`;
    resultContent.appendChild(qaBubble);
    qaBubble.scrollIntoView({ behavior: "smooth" });

    browserAPI.runtime.sendMessage(
      { action: "REQUEST_SUMMARY", text: baseText, mode: "qa", customPrompt: question },
      (res) => {
        qaInput.disabled = false;
        btnQaSend.disabled = false;
        const answerEl = qaBubble.querySelector(".qa-answer");
        if (res && res.success && res.summary) {
          answerEl.innerHTML = renderSimpleMarkdown(res.summary);
        } else {
          answerEl.innerHTML = `<span style="color:var(--danger)">Cevap alınamadı: ${res?.error || 'Hata'}</span>`;
        }
      }
    );
  }

  // ==========================================================================
  // 7. KOPYALA & TEMİZLE
  // ==========================================================================

  btnCopyResult.addEventListener("click", () => {
    if (!currentRawSummary) return;
    navigator.clipboard.writeText(currentRawSummary).then(() => {
      btnCopyResult.style.color = "var(--success)";
      setTimeout(() => { btnCopyResult.style.color = ""; }, 1500);
    });
  });

  btnClearResult.addEventListener("click", () => {
    stopSpeaking();
    currentRawSummary = "";
    resultContent.innerHTML = `
      <div class="placeholder-state">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="1.5">
          <path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/>
        </svg>
        <p>Özetlemek istediğiniz metni seçin veya YouTube videosu açıkken <strong>Gemini ile Özet Çıkart</strong> butonuna tıklayın.</p>
      </div>
    `;
    qaContainer.classList.add("hidden");
  });

  // ==========================================================================
  // 8. ARKA PLAN TETİKLEYİCİLERİ
  // ==========================================================================

  browserAPI.runtime.onMessage.addListener((msg) => {
    if (msg.action === "START_SUMMARY_FROM_SELECTION") {
      activeTabContent.selectedText = msg.text || "";
      setSourceType("selection");
      executeSummary(msg.text, currentSummaryMode);
    } else if (msg.action === "START_SUMMARY_FROM_PAGE") {
      fetchActiveTabData().then(() => {
        setSourceType("page");
        if (activeTabContent.pageText) executeSummary(activeTabContent.pageText, currentSummaryMode);
      });
    } else if (msg.action === "START_SUMMARY_FROM_YOUTUBE") {
      fetchActiveTabData().then(() => {
        setSourceType("youtube");
        if (activeTabContent.ytData) executeSummary(activeTabContent.ytData.fullText, "youtube");
      });
    }
  });

  // ==========================================================================
  // 9. BASİT MARKDOWN PARSER
  // ==========================================================================

  function renderSimpleMarkdown(md) {
    if (!md) return "";
    let html = md
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/^### (.*$)/gim, "<h3>$1</h3>")
      .replace(/^## (.*$)/gim, "<h2>$1</h2>")
      .replace(/^# (.*$)/gim, "<h1>$1</h1>")
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/```([\s\S]*?)```/g, "<pre><code>$1</code></pre>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/^\> (.*$)/gim, "<blockquote>$1</blockquote>")
      .replace(/^\s*[\-\*]\s+(.*$)/gim, "<li>$1</li>")
      .replace(/^\s*\d+\.\s+(.*$)/gim, "<li>$1</li>");

    html = html.replace(/(<li>[\s\S]*?<\/li>)+/g, "<ul>$&</ul>");
    html = html.replace(/\n\n/g, "</p><p>");
    html = "<p>" + html + "</p>";
    return html.replace(/<p><\/p>/g, "").replace(/<p>\s*<\/p>/g, "");
  }

  checkSession();
  fetchActiveTabData();
});
