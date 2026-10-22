/**
 * Gemini Summarizer - Content Script
 * 
 * 1. Sayfadaki seçili metni ve ana sayfa içeriğini temiz bir şekilde ayıklar.
 * 2. YOUTUBE DESTEĞİ: Açık olan YouTube videosunun başlığını, kanalını,
 *    açıklamasını ve varsa tam transkriptini (konuşma dökümünü) otomatik çeker.
 *    YouTube video sayfasına yerel "Gemini ile Özetle" butonu ekler.
 * 3. Sayfa üzerinde zarif, sürüklenebilir bir özet paneli (Overlay Modal) sunar.
 * 4. Metin seçildiğinde beliren hızlı özetleme düğmesini yönetir.
 * 5. Tüm stilleri Shadow DOM ile izole ederek sayfa stillerinin bozulmasını engeller.
 */

(() => {
  const browserAPI = (typeof browser !== "undefined" && browser.runtime) ? browser : chrome;
  if (window.__GEMINI_SUMMARIZER_LOADED__) return;
  window.__GEMINI_SUMMARIZER_LOADED__ = true;

  // ==========================================================================
  // 1. YOUTUBE VİDEO VE TRANSKRİPT AYIKLAMA
  // ==========================================================================

  function isYouTubeWatchPage() {
    return window.location.hostname.includes("youtube.com") && window.location.pathname.startsWith("/watch");
  }

  function decodeHtmlEntities(str) {
    if (!str) return "";
    const txt = document.createElement("textarea");
    txt.innerHTML = str;
    return txt.value;
  }

  /**
   * YouTube sayfa kaynağından timedtext (altyazı / transkript) bağlantısını bulur.
   */
  function findCaptionUrlsFromHtml() {
    const html = document.documentElement.innerHTML;
    const urls = [];
    const regex = /"baseUrl"\s*:\s*"(https:[^"]+api\/timedtext[^"]+)"/g;
    let match;
    while ((match = regex.exec(html)) !== null) {
      let clean = match[1].replace(/\\u0026/g, "&").replace(/\\/g, "");
      urls.push(clean);
    }
    return urls;
  }

  /**
   * YouTube altyazı XML dosyasını çekip metne dönüştürür.
   */
  async function fetchTranscriptFromUrl(url) {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const xml = await res.text();
      const textMatches = xml.match(/<text[^>]*>([\s\S]*?)<\/text>/g);
      if (!textMatches || textMatches.length === 0) return null;

      const lines = textMatches.map(m => {
        const content = m.replace(/<text[^>]*>/, "").replace(/<\/text>/, "");
        return decodeHtmlEntities(content.trim());
      }).filter(Boolean);

      return lines.join(" ");
    } catch (e) {
      console.warn("Transkript çekilemedi:", e);
      return null;
    }
  }

  /**
   * YouTube video bilgilerini ve transkriptini derler.
   */
  async function extractYouTubeVideoData() {
    if (!isYouTubeWatchPage()) return null;

    // 1. Video Başlığı
    const titleEl = document.querySelector("h1.ytd-watch-metadata yt-formatted-string") 
                 || document.querySelector("#title h1")
                 || document.querySelector("h1.title");
    const title = titleEl ? titleEl.innerText.trim() : document.title.replace(" - YouTube", "").trim();

    // 2. Kanal Adı
    const channelEl = document.querySelector("#owner #channel-name yt-formatted-string a")
                   || document.querySelector("#owner #channel-name")
                   || document.querySelector("ytd-channel-name yt-formatted-string");
    const channel = channelEl ? channelEl.innerText.trim() : "";

    // 3. Açıklama
    const descEl = document.querySelector("#description-inline-expander")
                || document.querySelector("#description")
                || document.querySelector("#info-contents");
    const description = descEl ? descEl.innerText.trim() : "";

    // 4. Transkript Arama
    let transcript = null;
    const captionUrls = findCaptionUrlsFromHtml();
    
    if (captionUrls && captionUrls.length > 0) {
      // Tercihen Türkçe veya İngilizce, yoksa ilk sıradaki
      const trUrl = captionUrls.find(u => u.includes("lang=tr")) 
                 || captionUrls.find(u => u.includes("lang=en")) 
                 || captionUrls[0];
      transcript = await fetchTranscriptFromUrl(trUrl);
    }

    // 5. Birleştirilmiş Metin
    let fullText = `[YOUTUBE_VIDEO]\n`;
    fullText += `Video Başlığı: ${title}\n`;
    if (channel) fullText += `Kanal: ${channel}\n`;
    fullText += `Video URL: ${window.location.href}\n\n`;

    if (transcript && transcript.length > 100) {
      fullText += `--- VİDEO KONUŞMA DÖKÜMÜ (TRANSKRİPT) ---\n${transcript}`;
    } else if (description) {
      fullText += `--- VİDEO AÇIKLAMASI VE DETAYLARI ---\n${description}`;
    } else {
      fullText += `--- VİDEO HAKKINDA ---\nBu videonun doğrudan metin dökümü bulunmamaktadır. Lütfen başlık ve URL üzerinden genel özet çıkarınız.`;
    }

    return {
      isYouTube: true,
      title: title,
      channel: channel,
      hasTranscript: Boolean(transcript),
      transcriptLength: transcript ? transcript.length : 0,
      fullText: fullText
    };
  }

  /**
   * YouTube video altına şık 'Gemini ile Özetle' butonu yerleştirir.
   */
  function injectYouTubeButton() {
    if (!isYouTubeWatchPage()) return;
    if (document.getElementById("gemini-yt-action-btn")) return;

    // Hedef yerleşim: Like / Share / Download butonlarının yanı
    const actionsBar = document.querySelector("#top-row #actions #top-level-buttons-computed")
                    || document.querySelector("#top-row #actions")
                    || document.querySelector("#above-the-fold #owner");

    if (!actionsBar) return;

    const btn = document.createElement("button");
    btn.id = "gemini-yt-action-btn";
    btn.className = "yt-spec-button-shape-next yt-spec-button-shape-next--tonal yt-spec-button-shape-next--mono yt-spec-button-shape-next--size-m";
    btn.style.cssText = `
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-left: 8px;
      padding: 0 14px;
      height: 36px;
      border-radius: 18px;
      background: linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(147, 51, 234, 0.15) 100%);
      border: 1px solid rgba(147, 51, 234, 0.3);
      color: #9333ea;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      vertical-align: middle;
      transition: all 0.2s ease;
      z-index: 10;
    `;
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" fill="url(#gemini-sparkle-btn)">
        <path d="M12 2L14.4 8.6L21 11L14.4 13.4L12 20L9.6 13.4L3 11L9.6 8.6L12 2Z"/>
        <defs>
          <linearGradient id="gemini-sparkle-btn" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#38bdf8" />
            <stop offset="100%" stop-color="#c084fc" />
          </linearGradient>
        </defs>
      </svg>
      <span>Gemini ile Özetle</span>
    `;

    btn.addEventListener("mouseenter", () => {
      btn.style.background = "linear-gradient(135deg, rgba(99, 102, 241, 0.25) 0%, rgba(147, 51, 234, 0.25) 100%)";
      btn.style.transform = "scale(1.03)";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.background = "linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(147, 51, 234, 0.15) 100%)";
      btn.style.transform = "scale(1)";
    });

    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      btn.innerHTML = `<span>Transkript taranıyor...</span>`;
      const ytData = await extractYouTubeVideoData();
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16" fill="url(#gemini-sparkle-btn)"><path d="M12 2L14.4 8.6L21 11L14.4 13.4L12 20L9.6 13.4L3 11L9.6 8.6L12 2Z"/></svg>
        <span>Gemini ile Özetle</span>
      `;

      if (ytData && ytData.fullText) {
        openModalWithText(ytData.fullText, "youtube", ytData.title);
      } else {
        alert("Video içeriği okunamadı. Lütfen video yüklendikten sonra tekrar deneyin.");
      }
    });

    actionsBar.appendChild(btn);
  }

  // YouTube tek sayfa gezinmelerini dinle
  window.addEventListener("yt-navigate-finish", () => {
    setTimeout(injectYouTubeButton, 1000);
  });
  setInterval(() => {
    if (isYouTubeWatchPage() && !document.getElementById("gemini-yt-action-btn")) {
      injectYouTubeButton();
    }
  }, 2000);

  // ==========================================================================
  // 2. METİN AYIKLAMA (STANDART WEB SAYFALARI)
  // ==========================================================================

  function getSelectedText() {
    const sel = window.getSelection();
    return sel ? sel.toString().trim() : "";
  }

  function extractPageContent() {
    const mainSelectors = [
      "article",
      "main",
      "[role='main']",
      "#main-content",
      "#content",
      ".main-content",
      ".post-content",
      ".article-content",
      ".entry-content"
    ];

    let targetElement = null;
    for (const sel of mainSelectors) {
      const el = document.querySelector(sel);
      if (el && el.innerText && el.innerText.trim().length > 300) {
        targetElement = el;
        break;
      }
    }

    if (!targetElement) targetElement = document.body;
    if (!targetElement) return "";

    const clone = targetElement.cloneNode(true);
    const noiseSelectors = [
      "script", "style", "noscript", "iframe", "svg", "canvas",
      "nav", "header", "footer", "aside", "[role='navigation']",
      "[role='banner']", "[role='complementary']", ".nav", ".header",
      ".footer", ".sidebar", ".ad", ".ads", ".advertisement",
      ".social-share", ".comments", "#comments"
    ];

    noiseSelectors.forEach(sel => {
      clone.querySelectorAll(sel).forEach(el => el.remove());
    });

    let rawText = clone.innerText || clone.textContent || "";
    rawText = rawText.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    return rawText;
  }

  // ==========================================================================
  // 3. BASİT MARKDOWN FORMATLAYICI
  // ==========================================================================

  function renderSimpleMarkdown(md) {
    if (!md) return "";
    let html = md
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
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

  // ==========================================================================
  // 4. SAYFA ÜZERİNDE KAYAN PANEL (IN-PAGE OVERLAY MODAL)
  // ==========================================================================

  let modalHost = null;
  let shadowRoot = null;
  let quickButton = null;

  function initShadowHost() {
    if (modalHost) return;

    modalHost = document.createElement("div");
    modalHost.id = "gemini-edge-summarizer-root";
    modalHost.style.position = "absolute";
    modalHost.style.top = "0";
    modalHost.style.left = "0";
    modalHost.style.zIndex = "2147483647";
    document.documentElement.appendChild(modalHost);

    shadowRoot = modalHost.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = `
      * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
      .gemini-quick-btn {
        position: absolute; display: none; align-items: center; gap: 6px;
        background: #1e1b4b; color: #ffffff; padding: 6px 12px; border-radius: 20px;
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25); cursor: pointer; font-size: 13px;
        font-weight: 500; border: 1px solid rgba(139, 92, 246, 0.4); z-index: 2147483647;
        transition: transform 0.15s ease; user-select: none;
      }
      .gemini-quick-btn:hover { background: #312e81; transform: scale(1.05); }
      .gemini-quick-btn svg { width: 16px; height: 16px; fill: #a78bfa; }

      .gemini-modal {
        position: fixed; width: 450px; max-width: calc(100vw - 32px); max-height: 82vh;
        background: #ffffff; color: #1f2937; border-radius: 14px;
        box-shadow: 0 12px 36px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(0, 0, 0, 0.08);
        display: none; flex-direction: column; overflow: hidden; z-index: 2147483647;
        resize: both; min-width: 320px; min-height: 250px; animation: geminiFadeIn 0.2s ease-out;
      }
      @media (prefers-color-scheme: dark) {
        .gemini-modal { background: #18181b; color: #f4f4f5; box-shadow: 0 12px 36px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1); }
      }
      @keyframes geminiFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

      .gemini-header {
        display: flex; align-items: center; justify-content: space-between; padding: 10px 14px;
        background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%); color: #ffffff; cursor: move; user-select: none;
      }
      .gemini-title { display: flex; align-items: center; gap: 8px; font-size: 13.5px; font-weight: 600; }
      .gemini-title svg { width: 18px; height: 18px; fill: #c084fc; }
      .gemini-header-actions { display: flex; align-items: center; gap: 6px; }
      .gemini-header-btn {
        background: transparent; border: none; color: rgba(255, 255, 255, 0.8);
        cursor: pointer; padding: 4px; border-radius: 6px; display: flex; align-items: center;
      }
      .gemini-header-btn:hover { background: rgba(255, 255, 255, 0.2); color: #ffffff; }

      .gemini-modes { display: flex; gap: 6px; padding: 8px 12px; background: rgba(0, 0, 0, 0.03); border-bottom: 1px solid rgba(0, 0, 0, 0.06); }
      @media (prefers-color-scheme: dark) { .gemini-modes { background: rgba(255, 255, 255, 0.03); border-bottom: 1px solid rgba(255, 255, 255, 0.06); } }
      .gemini-mode-chip {
        border: 1px solid rgba(0, 0, 0, 0.12); background: #ffffff; color: #4b5563;
        font-size: 11.5px; padding: 4px 10px; border-radius: 12px; cursor: pointer;
      }
      @media (prefers-color-scheme: dark) { .gemini-mode-chip { background: #27272a; color: #a1a1aa; border-color: rgba(255,255,255,0.1); } }
      .gemini-mode-chip.active { background: #4f46e5; color: #ffffff; border-color: #4f46e5; font-weight: 500; }

      .gemini-body { padding: 14px; overflow-y: auto; flex: 1; font-size: 13.5px; line-height: 1.65; }
      .gemini-body p { margin-bottom: 10px; }
      .gemini-body h1, .gemini-body h2, .gemini-body h3 { margin: 12px 0 6px 0; font-weight: 600; color: #111827; }
      @media (prefers-color-scheme: dark) { .gemini-body h1, .gemini-body h2, .gemini-body h3 { color: #f9fafb; } }
      .gemini-body ul { margin: 8px 0 12px 20px; }
      .gemini-body li { margin-bottom: 4px; }
      .gemini-body strong { font-weight: 600; color: #6366f1; }

      .gemini-loading { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 30px 20px; gap: 12px; color: #6b7280; }
      .gemini-spinner {
        width: 30px; height: 30px; border: 3px solid rgba(139, 92, 246, 0.2);
        border-top-color: #7c3aed; border-radius: 50%; animation: geminiSpin 0.8s linear infinite;
      }
      @keyframes geminiSpin { to { transform: rotate(360deg); } }

      .gemini-error { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; padding: 12px; border-radius: 8px; font-size: 13px; }
      @media (prefers-color-scheme: dark) { .gemini-error { background: #450a0a; border-color: #7f1d1d; color: #fecaca; } }

      .gemini-footer {
        display: flex; align-items: center; justify-content: space-between; padding: 8px 14px;
        background: rgba(0, 0, 0, 0.03); border-top: 1px solid rgba(0, 0, 0, 0.06); font-size: 11.5px; color: #6b7280;
      }
      @media (prefers-color-scheme: dark) { .gemini-footer { background: rgba(255, 255, 255, 0.03); border-top: 1px solid rgba(255, 255, 255, 0.06); color: #9ca3af; } }
      .gemini-footer-actions { display: flex; gap: 6px; }
      .gemini-btn-sm {
        background: #ffffff; border: 1px solid rgba(0, 0, 0, 0.15); color: #374151;
        padding: 4px 8px; border-radius: 6px; cursor: pointer; font-size: 11.5px;
      }
      @media (prefers-color-scheme: dark) { .gemini-btn-sm { background: #27272a; border-color: rgba(255,255,255,0.15); color: #e4e4e7; } }
    `;

    shadowRoot.appendChild(style);

    // Hızlı seçim butonu
    quickButton = document.createElement("div");
    quickButton.className = "gemini-quick-btn";
    quickButton.innerHTML = `
      <svg viewBox="0 0 24 24"><path d="M12 2L14.4 8.6L21 11L14.4 13.4L12 20L9.6 13.4L3 11L9.6 8.6L12 2Z"/></svg>
      <span>Özetle</span>
    `;
    shadowRoot.appendChild(quickButton);

    quickButton.addEventListener("click", (e) => {
      e.stopPropagation();
      const text = getSelectedText();
      if (text) openModalWithText(text, "selection");
      quickButton.style.display = "none";
    });

    // Modal
    const modal = document.createElement("div");
    modal.className = "gemini-modal";
    modal.id = "gemini-floating-modal";
    modal.innerHTML = `
      <div class="gemini-header" id="gemini-drag-handle">
        <div class="gemini-title">
          <svg viewBox="0 0 24 24"><path d="M12 2L14.4 8.6L21 11L14.4 13.4L12 20L9.6 13.4L3 11L9.6 8.6L12 2Z"/></svg>
          <span id="gemini-modal-title">Gemini Sayfa Özeti</span>
        </div>
        <div class="gemini-header-actions">
          <button class="gemini-header-btn" id="gemini-btn-open-sidebar" title="Yan Panelde Aç">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M4 4h16v16H4V4zm2 2v12h9V6H6zm11 0v12h3V6h-3z"/></svg>
          </button>
          <button class="gemini-header-btn" id="gemini-btn-close" title="Kapat">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>
      </div>
      <div class="gemini-modes">
        <button class="gemini-mode-chip active" data-mode="bullet">Maddeli</button>
        <button class="gemini-mode-chip" data-mode="concise">Kısa</button>
        <button class="gemini-mode-chip" data-mode="detailed">Detaylı</button>
        <button class="gemini-mode-chip" data-mode="keypoints">Ana Fikir</button>
      </div>
      <div class="gemini-body" id="gemini-content-area">
        <div class="gemini-loading">
          <div class="gemini-spinner"></div>
          <span>Gemini oturumunuz üzerinden özet hazırlanıyor...</span>
        </div>
      </div>
      <div class="gemini-footer">
        <span id="gemini-status-text">Doğrudan Gemini Oturumu</span>
        <div class="gemini-footer-actions">
          <button class="gemini-btn-sm" id="gemini-btn-speak" title="Sesli Oku / Durdur">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
            </svg>
            <span id="gemini-speak-label">Dinle</span>
          </button>
          <button class="gemini-btn-sm" id="gemini-btn-copy">Kopyala</button>
          <button class="gemini-btn-sm" id="gemini-btn-retry">Yenile</button>
        </div>
      </div>
    `;

    shadowRoot.appendChild(modal);
    setupModalEvents(modal);
  }

  // ==========================================================================
  // 5. MODAL ETKİLEŞİMLERİ
  // ==========================================================================

  let currentSourceText = "";
  let currentTargetMode = "bullet";

  function setupModalEvents(modal) {
    const dragHandle = modal.querySelector("#gemini-drag-handle");
    const closeBtn = modal.querySelector("#gemini-btn-close");
    const copyBtn = modal.querySelector("#gemini-btn-copy");
    const retryBtn = modal.querySelector("#gemini-btn-retry");
    const speakBtn = modal.querySelector("#gemini-btn-speak");
    const speakLabel = modal.querySelector("#gemini-speak-label");
    let isModalSpeaking = false;

    function stopModalSpeech() {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      isModalSpeaking = false;
      if (speakLabel) speakLabel.textContent = "Dinle";
      if (speakBtn) speakBtn.style.color = "";
    }

    if (speakBtn) {
      speakBtn.addEventListener("click", () => {
        if (!('speechSynthesis' in window)) {
          alert("Tarayıcınız sesli okuma özelliğini desteklemiyor.");
          return;
        }

        if (isModalSpeaking || window.speechSynthesis.speaking) {
          stopModalSpeech();
          return;
        }

        const content = modal.querySelector("#gemini-content-area");
        if (!content || !content.innerText) return;

        const cleanSpeech = content.innerText
          .replace(/[#*_~`]/g, "")
          .replace(/^[>\-•]\s+/gm, "")
          .trim();

        if (!cleanSpeech) return;

        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(cleanSpeech);
        utter.rate = 1.0;
        utter.lang = "tr-TR";

        const voices = window.speechSynthesis.getVoices();
        const trVoice = voices.find(v => v.lang.startsWith("tr"));
        if (trVoice) utter.voice = trVoice;

        utter.onstart = () => {
          isModalSpeaking = true;
          if (speakLabel) speakLabel.textContent = "Durdur";
          speakBtn.style.color = "#4f46e5";
        };

        utter.onend = () => {
          isModalSpeaking = false;
          if (speakLabel) speakLabel.textContent = "Dinle";
          speakBtn.style.color = "";
        };

        utter.onerror = () => {
          isModalSpeaking = false;
          if (speakLabel) speakLabel.textContent = "Dinle";
          speakBtn.style.color = "";
        };

        window.speechSynthesis.speak(utter);
      });
    }
    const sidePanelBtn = modal.querySelector("#gemini-btn-open-sidebar");
    const modeChips = modal.querySelectorAll(".gemini-mode-chip");

    closeBtn.addEventListener("click", () => { stopModalSpeech(); modal.style.display = "none"; });

    copyBtn.addEventListener("click", () => {
      const content = modal.querySelector("#gemini-content-area");
      if (content.innerText) {
        navigator.clipboard.writeText(content.innerText).then(() => {
          copyBtn.textContent = "Kopyalandı!";
          setTimeout(() => (copyBtn.textContent = "Kopyala"), 2000);
        });
      }
    });

    retryBtn.addEventListener("click", () => {
      if (currentSourceText) requestSummaryForModal(currentSourceText, currentTargetMode);
    });

    sidePanelBtn.addEventListener("click", () => {
      browserAPI.runtime.sendMessage({ action: "OPEN_SIDE_PANEL" });
    });

    modeChips.forEach(chip => {
      chip.addEventListener("click", () => {
        modeChips.forEach(c => c.classList.remove("active"));
        chip.classList.add("active");
        currentTargetMode = chip.getAttribute("data-mode");
        if (currentSourceText) requestSummaryForModal(currentSourceText, currentTargetMode);
      });
    });

    // Sürükleme
    let isDragging = false;
    let startX = 0, startY = 0;
    let modalStartX = 0, modalStartY = 0;

    dragHandle.addEventListener("mousedown", (e) => {
      if (e.target.closest("button")) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = modal.getBoundingClientRect();
      modalStartX = rect.left;
      modalStartY = rect.top;
      modal.style.right = "auto";
      modal.style.bottom = "auto";
      modal.style.left = `${modalStartX}px`;
      modal.style.top = `${modalStartY}px`;
      e.preventDefault();
    });

    window.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      modal.style.left = `${Math.max(10, modalStartX + (e.clientX - startX))}px`;
      modal.style.top = `${Math.max(10, modalStartY + (e.clientY - startY))}px`;
    });

    window.addEventListener("mouseup", () => { isDragging = false; });
  }

  function openModalWithText(text, type = "selection", customTitle = "") {
    initShadowHost();
    currentSourceText = text;

    const modal = shadowRoot.querySelector("#gemini-floating-modal");
    const modalTitle = shadowRoot.querySelector("#gemini-modal-title");
    
    if (type === "youtube") {
      modalTitle.textContent = customTitle ? `📺 ${customTitle.substring(0, 32)}...` : "📺 YouTube Video Özeti";
    } else {
      modalTitle.textContent = "Gemini Sayfa Özeti";
    }

    modal.style.display = "flex";
    if (!modal.style.left) {
      modal.style.top = "24px";
      modal.style.right = "24px";
    }

    requestSummaryForModal(text, currentTargetMode);
  }

  function requestSummaryForModal(text, mode) {
    const contentArea = shadowRoot.querySelector("#gemini-content-area");
    const statusText = shadowRoot.querySelector("#gemini-status-text");

    contentArea.innerHTML = `
      <div class="gemini-loading">
        <div class="gemini-spinner"></div>
        <span>Gemini oturumunuz üzerinden özet hazırlanıyor...</span>
      </div>
    `;
    statusText.textContent = "Bağlanıyor...";

    browserAPI.runtime.sendMessage(
      { action: "REQUEST_SUMMARY", text: text, mode: mode },
      (response) => {
        if (!response) {
          contentArea.innerHTML = `<div class="gemini-error">Arka plan servisi yanıt vermedi. Lütfen sayfayı yenileyin.</div>`;
          statusText.textContent = "Bağlantı hatası";
          return;
        }

        if (response.success && response.summary) {
          contentArea.innerHTML = renderSimpleMarkdown(response.summary);
          statusText.textContent = "Özet başarıyla oluşturuldu";
        } else {
          contentArea.innerHTML = `<div class="gemini-error">${response.error || 'Hata oluştu'}</div>`;
          statusText.textContent = "Hata";
        }
      }
    );
  }

  // ==========================================================================
  // 6. METİN SEÇİMİ BUTONU
  // ==========================================================================

  document.addEventListener("mouseup", (e) => {
    if (modalHost && modalHost.contains(e.target)) return;
    if (isYouTubeWatchPage() && e.target.closest("#gemini-yt-action-btn")) return;

    setTimeout(() => {
      const selected = getSelectedText();
      if (selected && selected.length >= 15) {
        initShadowHost();
        const sel = window.getSelection();
        if (sel.rangeCount > 0) {
          const rect = sel.getRangeAt(0).getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            quickButton.style.display = "flex";
            quickButton.style.top = `${window.scrollY + rect.top - 36}px`;
            quickButton.style.left = `${window.scrollX + rect.left + rect.width / 2 - 40}px`;
            return;
          }
        }
      }
      if (quickButton) quickButton.style.display = "none";
    }, 50);
  });

  document.addEventListener("mousedown", (e) => {
    if (modalHost && modalHost.contains(e.target)) return;
    if (quickButton && e.target !== quickButton && !quickButton.contains(e.target)) {
      quickButton.style.display = "none";
    }
  });

  // ==========================================================================
  // 7. MESAJLAŞMA (YAN PANEL VE ARKA PLAN)
  // ==========================================================================

  browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "GET_PAGE_DATA") {
      (async () => {
        let ytData = null;
        if (isYouTubeWatchPage()) {
          ytData = await extractYouTubeVideoData();
        }

        sendResponse({
          success: true,
          selectedText: getSelectedText(),
          pageText: extractPageContent(),
          isYouTube: Boolean(ytData),
          ytData: ytData,
          title: document.title,
          url: window.location.href
        });
      })();
      return true; // Asenkron cevap
    }

    if (request.action === "SHOW_OVERLAY_SUMMARY") {
      (async () => {
        let targetText = "";
        let customTitle = "";

        if (request.target === "youtube") {
          const ytData = await extractYouTubeVideoData();
          targetText = ytData ? ytData.fullText : "";
          customTitle = ytData ? ytData.title : "";
        } else if (request.target === "selection") {
          targetText = request.text || getSelectedText();
        } else {
          targetText = extractPageContent();
        }

        if (!targetText || targetText.length < 5) {
          alert("Özetlenecek içerik bulunamadı.");
          return;
        }

        openModalWithText(targetText, request.target, customTitle);
        sendResponse({ success: true });
      })();
      return true;
    }
  });

  // Sayfa ilk yüklendiğinde YouTube butonunu dene
  if (isYouTubeWatchPage()) {
    setTimeout(injectYouTubeButton, 1200);
  }
})();
