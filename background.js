/**
 * Gemini Summarizer - Universal Background Service Worker / Script
 * 
 * Microsoft Edge, Google Chrome, Opera, Brave, Vivaldi ve Mozilla Firefox ile %100 uyumludur.
 * YouTube videolarının transkript ve açıklamalarını doğrudan Gemini oturumuyla özetler.
 */

const browserAPI = (typeof browser !== "undefined" && browser.runtime) ? browser : chrome;

// Oturum ve token önbelleği
let sessionCache = {
  snlm0e: null,
  bl: "boq_assistant-bard-web-server_20260716.08_p0",
  sapisid: null,
  isLoggedIn: false,
  userEmail: null,
  lastUpdated: 0
};

let lastSummaryData = {
  text: "",
  sourceTitle: "",
  sourceUrl: "",
  type: "selection",
  summary: "",
  loading: false,
  error: null
};

// ============================================================================
// 1. SAĞ TIK MENÜLERİ
// ============================================================================

browserAPI.runtime.onInstalled.addListener(() => {
  if (browserAPI.sidePanel && browserAPI.sidePanel.setPanelBehavior) {
    browserAPI.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  }

  if (browserAPI.contextMenus) {
    browserAPI.contextMenus.removeAll(() => {
      // Seçili metin
      browserAPI.contextMenus.create({
        id: "gemini_sum_selection_sidepanel",
        title: "Gemini: Yan Panelde Özetle (Seçili Metin)",
        contexts: ["selection"]
      });

      browserAPI.contextMenus.create({
        id: "gemini_sum_selection_overlay",
        title: "Gemini: Sayfa Üzerinde Özetle (Seçili Metin)",
        contexts: ["selection"]
      });

      browserAPI.contextMenus.create({
        id: "gemini_separator_1",
        type: "separator",
        contexts: ["all"]
      });

      // YouTube Video Özeti (Sadece YouTube sayfalarında)
      browserAPI.contextMenus.create({
        id: "gemini_sum_youtube_overlay",
        title: "Gemini: YouTube Videosunu Sayfada Özetle",
        contexts: ["page"],
        documentUrlPatterns: ["*://*.youtube.com/watch*"]
      });

      browserAPI.contextMenus.create({
        id: "gemini_sum_youtube_sidepanel",
        title: "Gemini: YouTube Videosunu Yan Panelde Özetle",
        contexts: ["page"],
        documentUrlPatterns: ["*://*.youtube.com/watch*"]
      });

      // Genel Sayfa
      browserAPI.contextMenus.create({
        id: "gemini_sum_page_sidepanel",
        title: "Gemini: Tüm Sayfayı Yan Panelde Özetle",
        contexts: ["page"]
      });

      browserAPI.contextMenus.create({
        id: "gemini_sum_page_overlay",
        title: "Gemini: Tüm Sayfayı Sayfa Üzerinde Özetle",
        contexts: ["page"]
      });
    });
  }
});

async function openSidePanelOrSidebar(tabId) {
  if (browserAPI.sidePanel && browserAPI.sidePanel.open && tabId) {
    try {
      await browserAPI.sidePanel.open({ tabId });
      return true;
    } catch (e) {
      console.warn("sidePanel.open başarısız:", e);
    }
  }
  if (typeof browser !== "undefined" && browser.sidebarAction && browser.sidebarAction.open) {
    try {
      await browser.sidebarAction.open();
      return true;
    } catch (e) {
      console.warn("sidebarAction.open başarısız:", e);
    }
  }
  return false;
}

if (browserAPI.contextMenus && browserAPI.contextMenus.onClicked) {
  browserAPI.contextMenus.onClicked.addListener(async (info, tab) => {
    if (!tab || !tab.id) return;

    if (info.menuItemId === "gemini_sum_selection_sidepanel") {
      await openSidePanelOrSidebar(tab.id);
      setTimeout(() => {
        browserAPI.runtime.sendMessage({
          action: "START_SUMMARY_FROM_SELECTION",
          text: info.selectionText,
          title: tab.title,
          url: tab.url
        }).catch(() => {});
      }, 400);

    } else if (info.menuItemId === "gemini_sum_selection_overlay") {
      browserAPI.tabs.sendMessage(tab.id, {
        action: "SHOW_OVERLAY_SUMMARY",
        text: info.selectionText,
        target: "selection"
      }).catch(err => console.warn("Mesaj iletilemedi:", err));

    } else if (info.menuItemId === "gemini_sum_youtube_overlay") {
      browserAPI.tabs.sendMessage(tab.id, {
        action: "SHOW_OVERLAY_SUMMARY",
        target: "youtube"
      }).catch(err => console.warn("Mesaj iletilemedi:", err));

    } else if (info.menuItemId === "gemini_sum_youtube_sidepanel") {
      await openSidePanelOrSidebar(tab.id);
      setTimeout(() => {
        browserAPI.runtime.sendMessage({
          action: "START_SUMMARY_FROM_YOUTUBE",
          tabId: tab.id,
          title: tab.title,
          url: tab.url
        }).catch(() => {});
      }, 400);

    } else if (info.menuItemId === "gemini_sum_page_sidepanel") {
      await openSidePanelOrSidebar(tab.id);
      setTimeout(() => {
        browserAPI.runtime.sendMessage({
          action: "START_SUMMARY_FROM_PAGE",
          tabId: tab.id,
          title: tab.title,
          url: tab.url
        }).catch(() => {});
      }, 400);

    } else if (info.menuItemId === "gemini_sum_page_overlay") {
      browserAPI.tabs.sendMessage(tab.id, {
        action: "SHOW_OVERLAY_SUMMARY",
        target: "page"
      }).catch(err => console.warn("Mesaj iletilemedi:", err));
    }
  });
}

// ============================================================================
// 2. GOOGLE GEMINI OTURUM & ÇEREZ YÖNETİMİ
// ============================================================================

async function makeSapisidHash(sapisid) {
  const ts = Math.floor(Date.now() / 1000);
  const encoder = new TextEncoder();
  const data = encoder.encode(`${ts} ${sapisid} https://gemini.google.com`);
  const hashBuffer = await crypto.subtle.digest("SHA-1", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  return `SAPISIDHASH ${ts}_${hashHex}`;
}

async function getGeminiSession(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && sessionCache.snlm0e && (now - sessionCache.lastUpdated < 20 * 60 * 1000)) {
    return sessionCache;
  }

  let sapisid = null;
  try {
    const cookie = await browserAPI.cookies.get({ url: "https://google.com", name: "SAPISID" })
                || await browserAPI.cookies.get({ url: "https://gemini.google.com", name: "SAPISID" })
                || await browserAPI.cookies.get({ url: "https://google.com", name: "__Secure-3PAPISID" })
                || await browserAPI.cookies.get({ url: "https://google.com", name: "__Secure-1PSID" });
    if (cookie && cookie.value) {
      sapisid = cookie.value;
    }
  } catch (err) {
    console.warn("Çerez okuma hatası:", err);
  }

  try {
    const res = await fetch("https://gemini.google.com/app", {
      method: "GET",
      credentials: "include",
      headers: {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });

    if (res.url.includes("accounts.google.com") || res.url.includes("ServiceLogin")) {
      sessionCache.isLoggedIn = false;
      sessionCache.snlm0e = null;
      throw new Error("NOT_LOGGED_IN");
    }

    const html = await res.text();
    const snlm0eMatch = html.match(/"SNlM0e":\s*"([^"]+)"/) || html.match(/WIZ_global_data\.SNlM0e\s*=\s*"([^"]+)"/);
    const snlm0e = snlm0eMatch ? snlm0eMatch[1] : null;

    const blMatch = html.match(/"cfb2h":\s*"([^"]+)"/) || html.match(/(boq_assistant-bard-web-server_[0-9a-zA-Z._]+)/);
    const bl = blMatch ? blMatch[1] : sessionCache.bl;

    const emailMatch = html.match(/"([a-zA-Z0-9._%+-]+@(?:gmail\.com|google\.com))"/);
    const userEmail = emailMatch ? emailMatch[1] : null;

    if (!snlm0e) {
      sessionCache.isLoggedIn = false;
      throw new Error("TOKEN_NOT_FOUND");
    }

    sessionCache = {
      snlm0e,
      bl,
      sapisid,
      isLoggedIn: true,
      userEmail,
      lastUpdated: now
    };

    return sessionCache;
  } catch (err) {
    if (err.message === "NOT_LOGGED_IN" || err.message === "TOKEN_NOT_FOUND") {
      throw err;
    }
    console.error("Gemini session hatası:", err);
    throw new Error("NETWORK_OR_SESSION_ERROR: " + err.message);
  }
}

// ============================================================================
// 3. GEMINI API İSTEK ÇAĞRISI
// ============================================================================

function extractGeminiResponseText(rawText) {
  let finalResult = "";
  const lines = rawText.split("\n");

  for (const line of lines) {
    if (!line.includes('"wrb.fr"') || line.length < 120) continue;
    try {
      const arr = JSON.parse(line);
      const innerStr = arr[0]?.[2];
      if (!innerStr || innerStr.length < 30) continue;
      const inner = JSON.parse(innerStr);
      if (Array.isArray(inner) && inner[4]) {
        for (const part of inner[4]) {
          if (Array.isArray(part) && Array.isArray(part[1])) {
            for (const t of part[1]) {
              if (typeof t === "string" && t.trim().length > 0) {
                finalResult = t;
              }
            }
          }
        }
      }
    } catch (e) {}
  }

  finalResult = finalResult.replace(/```(?:python|javascript|text)\?code_(?:reference|stdout)&code_event_index=\d+\n[\s\S]*?```\n?/g, "");
  return finalResult.trim();
}

function buildPrompt(text, mode = "bullet", customPrompt = "") {
  let instruction = "";

  // YouTube Videosu Algılama
  if (text.startsWith("[YOUTUBE_VIDEO]") || mode === "youtube") {
    instruction = "Sen profesyonel bir YouTube video analiz asistanısın. Aşağıda başlığı, kanalı ve transkripti (konuşma dökümü) veya açıklaması verilen YouTube videosunun Türkçe olarak kapsamlı, akıcı ve net bir özetini hazırla.\n\n"
      + "Lütfen şu yapıyı kullan:\n"
      + "1. 🎯 **Videonun Ana Teması:** Videonun ne hakkında olduğunu ve temel amacını 1-2 cümleyle açıkla.\n"
      + "2. 📌 **Önemli Konu Başlıkları ve Anlatılanlar:** Konuşulan ana argümanları, kritik detayları ve adımları maddeler halinde açıkla (varsa transkriptteki kronolojik akışı koruyarak).\n"
      + "3. 💡 **Kilit Çıkarımlar (Takeaways):** İzleyicinin bu videodan alması gereken en değerli pratik bilgileri/sonuçları listele.";
  } else {
    switch (mode) {
      case "concise":
        instruction = "Aşağıdaki metni Türkçe olarak 2-3 cümlelik çok net, vurucu ve öz bir paragraf halinde özetle.";
        break;
      case "detailed":
        instruction = "Aşağıdaki metni Türkçe olarak kapsamlı, ana ve alt başlıklar altında tüm önemli argüman ve detayları kapsayacak şekilde detaylıca özetle.";
        break;
      case "keypoints":
        instruction = "Aşağıdaki metnin ana fikrini ve en kritik 3-5 çıkarımını Türkçe olarak özetle.";
        break;
      case "qa":
        instruction = `Aşağıdaki içeriğe dayanarak şu soruyu doğrudan ve net bir şekilde yanıtla: "${customPrompt}"`;
        break;
      case "bullet":
      default:
        instruction = "Aşağıdaki metnin en önemli noktalarını Türkçe olarak maddeler (bullet points) halinde, açık, anlaşılır ve akıcı bir şekilde özetle.";
        break;
    }
  }

  if (customPrompt && mode !== "qa") {
    instruction += ` Ayrıca şu kullanıcı talimatına özellikle dikkat et: "${customPrompt}"`;
  }

  const maxChars = 35000;
  const cleanText = text.length > maxChars ? text.substring(0, maxChars) + "\n\n[...Metin uzunluk nedeniyle sınırlandırıldı...]" : text;
  return `${instruction}\n\n--- İÇERİK ---\n${cleanText}`;
}

async function callGeminiApi({ text, mode = "bullet", customPrompt = "", isRetry = false }) {
  if (!text || text.trim().length === 0) {
    throw new Error("Özetlenecek metin boş olamaz.");
  }

  const session = await getGeminiSession(isRetry);
  const prompt = buildPrompt(text, mode, customPrompt);

  const inner = new Array(80).fill(null);
  inner[0] = [prompt, 0, null, null, null, null, 0];
  inner[1] = ["tr"];
  inner[2] = ["", "", "", null, null, null, null, null, null, ""];
  inner[6] = [0];
  inner[7] = 1;
  inner[10] = 1;
  inner[11] = 0;
  inner[17] = [[4]];
  inner[18] = 0;
  inner[27] = 1;
  inner[30] = [4];
  inner[41] = [2];
  inner[53] = 0;
  inner[59] = crypto.randomUUID();
  inner[61] = [];
  inner[68] = 1;
  inner[79] = 1;

  const outer = [null, JSON.stringify(inner)];
  const bodyParams = new URLSearchParams();
  bodyParams.append("f.req", JSON.stringify(outer));
  if (session.snlm0e) {
    bodyParams.append("at", session.snlm0e);
  }

  const reqid = Math.floor(Date.now() % 1000000);
  const url = `https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate?bl=${encodeURIComponent(session.bl)}&hl=tr&_reqid=${reqid}&rt=c`;

  const headers = {
    "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
    "Origin": "https://gemini.google.com",
    "Referer": "https://gemini.google.com/app",
    "X-Same-Domain": "1"
  };

  if (session.sapisid) {
    try {
      headers["Authorization"] = await makeSapisidHash(session.sapisid);
    } catch (e) {
      console.warn("Authorization header oluşturulamadı:", e);
    }
  }

  const resp = await fetch(url, {
    method: "POST",
    headers: headers,
    body: bodyParams.toString(),
    credentials: "include"
  });

  if (!resp.ok) {
    if ((resp.status === 401 || resp.status === 403 || resp.status === 405) && !isRetry) {
      console.log("Token yenileniyor...");
      return await callGeminiApi({ text, mode, customPrompt, isRetry: true });
    }
    throw new Error(`Gemini servisi hata kodu döndürdü: HTTP ${resp.status}`);
  }

  const responseText = await resp.text();
  const summary = extractGeminiResponseText(responseText);

  if (!summary) {
    if (!isRetry) {
      return await callGeminiApi({ text, mode, customPrompt, isRetry: true });
    }
    throw new Error("Gemini geçerli bir özet yanıtı üretemedi. Lütfen gemini.google.com sekmesinde Google oturumunuzun açık olduğunu kontrol edin.");
  }

  return summary;
}

// ============================================================================
// 4. MESAJ İLETİŞİMİ
// ============================================================================

browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "CHECK_SESSION") {
    getGeminiSession(false)
      .then(session => {
        sendResponse({
          success: true,
          isLoggedIn: session.isLoggedIn,
          userEmail: session.userEmail
        });
      })
      .catch(err => {
        sendResponse({
          success: false,
          isLoggedIn: false,
          error: err.message
        });
      });
    return true;
  }

  if (request.action === "REQUEST_SUMMARY") {
    callGeminiApi({
      text: request.text,
      mode: request.mode || "bullet",
      customPrompt: request.customPrompt || ""
    })
      .then(summary => {
        lastSummaryData = {
          text: request.text,
          summary: summary,
          mode: request.mode,
          timestamp: Date.now()
        };
        sendResponse({ success: true, summary: summary });
      })
      .catch(err => {
        sendResponse({
          success: false,
          error: err.message || "Bilinmeyen bir hata oluştu."
        });
      });
    return true;
  }

  if (request.action === "GET_LAST_SUMMARY") {
    sendResponse({ success: true, data: lastSummaryData });
    return true;
  }

  if (request.action === "OPEN_SIDE_PANEL") {
    const tabId = sender.tab ? sender.tab.id : undefined;
    openSidePanelOrSidebar(tabId)
      .then(success => sendResponse({ success }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});
