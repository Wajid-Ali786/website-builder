document.addEventListener("DOMContentLoaded", () => {
  /* ---------- refs & state ---------- */
  const iframe = document.getElementById("preview");
  const deviceWrapper = document.getElementById("device-wrapper");
  const AUTOSAVE_KEY = "wb_builder_draft_v1";

  let currentTheme = "#4361ee";
  let selectedElement = null;
  let selectedElements = new Set();
  let history = [],
    historyIndex = -1;
  let isRestoring = false;
  let autosaveTimer = null;

  /* ---------- helpers ---------- */
  const qsAll = (s, root = document) =>
    Array.from((root || document).querySelectorAll(s));
  const safeDoc = () => iframe && iframe.contentDocument;
  const log = (...a) => console.log("[WB]", ...a);

  /* ---------- prop-panel tiny helpers ---------- */
  function getCS(el, prop) {
    try {
      return iframe.contentWindow.getComputedStyle(el)[prop];
    } catch {
      return "";
    }
  }
  function vNice(v) {
    // empty-out useless computed values
    if (!v) return "";
    const s = String(v);
    return s === "auto" || s === "normal" ? "" : s;
  }
  function debounce(fn, ms = 150) {
    let t;
    return (...a) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...a), ms);
    };
  }
  function byId(id) {
    return document.getElementById(id);
  }

  /* ---------- stylesheet helpers (centralized styles per element) ---------- */
  // Ensure iframe has a <style id="wb-styles"> in its head and return it
  function ensureIframeStyleSheet() {
    try {
      const doc = safeDoc();
      if (!doc) return null;
      let s = doc.getElementById("wb-styles");
      if (!s) {
        s = doc.createElement("style");
        s.id = "wb-styles";
        doc.head.appendChild(s);
      }
      return s;
    } catch (e) {
      console.warn("ensureIframeStyleSheet", e);
      return null;
    }
  }

  // Build selector for an element (use data-wb-id for specificity)
  function selectorForElement(el) {
    if (!el) return null;
    const id = el.getAttribute && el.getAttribute("data-wb-id");
    if (id) return `[data-wb-id="${id}"]`;
    // fallback: assign an id then return selector
    const gen = generateWBId ? generateWBId() : "wb-auto-" + Date.now();
    el.setAttribute && el.setAttribute("data-wb-id", gen);
    return `[data-wb-id="${gen}"]`;
  }

  // Update (or add) CSS rules for a given element. stylesObj keys are CSS property names in camelCase or kebab-case.
  function setElementCssRules(el, stylesObj) {
    try {
      if (!el || !stylesObj) return;
      const sheetNode = ensureIframeStyleSheet();
      if (!sheetNode) return;
      // normalize styles -> "prop: value;"
      const rules = Object.entries(stylesObj)
        .map(([k, v]) => {
          if (v === null || v === undefined || v === "") return "";
          // convert camelCase to kebab-case
          const prop = k.replace(/([A-Z])/g, "-$1").toLowerCase();
          return `${prop}: ${v};`;
        })
        .filter(Boolean)
        .join(" ");
      if (!rules) return;
      const selector = selectorForElement(el);
      // update textContent: remove existing rule for selector then append new one
      const txt = sheetNode.textContent || "";
      // regex to remove existing block
      const cleaned = txt.replace(
        new RegExp(
          selector.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&") + "\\s*\\{[^}]*\\}",
          "g"
        ),
        ""
      );
      sheetNode.textContent = cleaned.trim() + `\n${selector} { ${rules} }`;
    } catch (err) {
      console.warn("setElementCssRules", err);
    }
  }

  // Remove rules for element (used on delete if you want)
  function removeElementCssRules(el) {
    try {
      const sheetNode = ensureIframeStyleSheet();
      if (!sheetNode) return;
      const selector = selectorForElement(el);
      const txt = sheetNode.textContent || "";
      const cleaned = txt.replace(
        new RegExp(
          selector.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&") + "\\s*\\{[^}]*\\}",
          "g"
        ),
        ""
      );
      sheetNode.textContent = cleaned.trim();
    } catch (e) {
      console.warn("removeElementCssRules", e);
    }
  }

  /* ---------- Style presets & helpers ---------- */
  const STYLE_PRESETS = {
    h1: [
      {
        id: "h1-hero",
        label: "Hero",
        styles: {
          fontSize: "42px",
          fontWeight: "700",
          color: currentTheme,
          textAlign: "center",
          margin: "12px 0",
        },
      },
      {
        id: "h1-clean",
        label: "Clean",
        styles: {
          fontSize: "32px",
          fontWeight: "600",
          color: "#222",
          textAlign: "left",
          margin: "8px 0",
        },
      },
    ],
    button: [
      {
        id: "btn-primary",
        label: "Primary",
        styles: {
          backgroundColor: currentTheme,
          color: "#fff",
          padding: "12px 20px",
          borderRadius: "8px",
          fontWeight: "700",
          textDecoration: "none",
          display: "inline-block",
        },
      },
      {
        id: "btn-outline",
        label: "Outline",
        styles: {
          backgroundColor: "transparent",
          color: currentTheme,
          border: "2px solid " + currentTheme,
          padding: "10px 18px",
          borderRadius: "8px",
        },
      },
    ],
    section: [
      {
        id: "sec-card",
        label: "Card",
        styles: {
          padding: "30px",
          background: "#fff",
          boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
          borderRadius: "12px",
        },
      },
      {
        id: "sec-hero",
        label: "Hero Block",
        styles: {
          padding: "60px 20px",
          background: "#f8f9fa",
          textAlign: "center",
          borderRadius: "12px",
        },
      },
    ],
    div: [
      {
        id: "div-container",
        label: "Container",
        styles: {
          padding: "20px",
          border: "1px solid #e9ecef",
          borderRadius: "10px",
        },
      },
    ],
  };

  function applyPresetToElement(el, preset) {
    if (!el || !preset || !preset.styles) return;
    Object.entries(preset.styles).forEach(([k, v]) => {
      try {
        el.style[k] = v;
      } catch (e) {}
    });
    // ensure theme-based colors update
    if (el.classList && el.classList.contains("btn")) {
      // keep class but update inline colors for preview
      el.style.backgroundColor = el.style.backgroundColor || "";
    }
    refreshCodePreview();
    pushHistory("apply-preset:" + (preset.id || "preset"));
    buildStructureTree();
  }

  function setInlineStyle(el, prop, value) {
    if (!el) return;
    try {
      el.style[prop] = value;
    } catch (e) {}
  }

  /* ---------- UI wiring ---------- */
  qsAll(".tab").forEach((tab) =>
    tab.addEventListener("click", () => {
      qsAll(".tab").forEach((t) => t.classList.remove("active"));
      qsAll(".tab-content").forEach((c) => c.classList.remove("active"));
      tab.classList.add("active");
      const id = `${tab.dataset.tab}-tab`;
      const el = document.getElementById(id);
      if (el) el.classList.add("active");
    })
  );

  qsAll(".color-option").forEach((o) =>
    o.addEventListener("click", function () {
      qsAll(".color-option").forEach((x) => x.classList.remove("active"));
      this.classList.add("active");
      currentTheme = this.dataset.color;
      applyThemeToIframe();
      scheduleAutosave();
    })
  );

  qsAll("[data-device]").forEach((btn) =>
    btn.addEventListener("click", function () {
      qsAll("[data-device]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      deviceWrapper.classList.remove("desktop", "tablet", "mobile");
      deviceWrapper.classList.add(btn.dataset.device);
    })
  );

  const previewReset = document.getElementById("preview-reset");
  if (previewReset)
    previewReset.addEventListener("click", () => {
      qsAll("[data-device]").forEach((b) => b.classList.remove("active"));
      const d = document.querySelector('[data-device="desktop"]');
      if (d) d.classList.add("active");
      deviceWrapper.classList.remove("tablet", "mobile");
      deviceWrapper.classList.add("desktop");
    });

  /* ---------- apply theme ---------- */
  function applyThemeToIframe() {
    try {
      const doc = safeDoc();
      if (!doc) return;
      doc.documentElement.style.setProperty("--primary", currentTheme);
      doc.querySelectorAll(".btn, button, a").forEach((el) => {
        if (el.classList.contains("btn") || el.tagName.toLowerCase() === "a")
          el.style.backgroundColor = currentTheme;
      });
    } catch (e) {
      console.warn(e);
    }
    refreshCodePreview();
  }

  /* ---------- history & autosave ---------- */
  function pushHistory(label = "") {
    if (isRestoring) return;
    try {
      const doc = safeDoc();
      if (!doc) return;
      const root = doc.getElementById("designRoot") || doc.body;
      if (!root) return;
      if (historyIndex < history.length - 1)
        history = history.slice(0, historyIndex + 1);
      history.push({
        html: root.innerHTML,
        theme: currentTheme,
        ts: Date.now(),
        label,
      });
      historyIndex = history.length - 1;
      if (history.length > 80) {
        history.shift();
        historyIndex = history.length - 1;
      }
      updateHistoryButtons();
      scheduleAutosave();
    } catch (e) {
      console.warn("pushHistory", e);
    }
  }

  function restoreFromHistory(idx) {
    if (idx < 0 || idx >= history.length) return;
    isRestoring = true;
    const snap = history[idx];
    const doc = safeDoc();
    if (!doc) {
      isRestoring = false;
      return;
    }
    const root = doc.getElementById("designRoot") || doc.body;
    root.innerHTML = snap.html;
    currentTheme = snap.theme || currentTheme;
    try {
      doc.documentElement.style.setProperty("--primary", currentTheme);
    } catch (e) {}
    selectedElements.clear();
    selectedElement = null;
    refreshCodePreview();
    updateElementCountSafely();
    updateSelectedInfo();
    buildStructureTree();
    setTimeout(() => (isRestoring = false), 30);
  }

  function undo() {
    if (historyIndex > 0) {
      historyIndex--;
      restoreFromHistory(historyIndex);
      updateHistoryButtons();
    }
  }
  function redo() {
    if (historyIndex < history.length - 1) {
      historyIndex++;
      restoreFromHistory(historyIndex);
      updateHistoryButtons();
    }
  }
  function updateHistoryButtons() {
    const u = document.getElementById("undo-btn"),
      r = document.getElementById("redo-btn");
    if (!u || !r) return;
    u.disabled = historyIndex <= 0;
    r.disabled = historyIndex >= history.length - 1;
    u.style.opacity = u.disabled ? 0.5 : 1;
    r.style.opacity = r.disabled ? 0.5 : 1;
  }

  function scheduleAutosave(delay = 1000) {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      try {
        const doc = safeDoc();
        if (!doc) return;
        const root = doc.getElementById("designRoot") || doc.body;
        localStorage.setItem(
          AUTOSAVE_KEY,
          JSON.stringify({
            html: root.innerHTML,
            theme: currentTheme,
            ts: Date.now(),
          })
        );
        log("autosave: saved draft");
      } catch (e) {
        console.warn("autosave", e);
      }
    }, delay);
  }

  function loadAutosaveIfExists() {
    try {
      const raw = localStorage.getItem(AUTOSAVE_KEY);
      if (!raw) return false;
      const payload = JSON.parse(raw);
      const doc = safeDoc();
      if (!doc) return false;
      const root = doc.getElementById("designRoot") || doc.body;
      if (root && payload.html) {
        root.innerHTML = payload.html;
        currentTheme = payload.theme || currentTheme;
        try {
          doc.documentElement.style.setProperty("--primary", currentTheme);
        } catch (e) {}
        refreshCodePreview();
        updateElementCountSafely();
        buildStructureTree();
        pushHistory("restore-auto");
        log("autosave: restored");
        return true;
      }
    } catch (e) {
      console.warn("loadAutosaveIfExists", e);
    }
    return false;
  }

  /* ---------- selection & properties ---------- */
  function selectElement(el, additive = false) {
    const doc = safeDoc();
    if (!doc || !el) return;
    const root = doc.getElementById("designRoot") || doc.body;
    if (el === root) return;

    if (!additive) {
      selectedElements.forEach((x) =>
        x.classList.remove("selected", "selected-multi")
      );
      selectedElements.clear();
      selectedElement = null;
    }

    if (additive && selectedElements.has(el)) {
      el.classList.remove("selected", "selected-multi");
      selectedElements.delete(el);
    } else {
      el.classList.add("selected", "selected-multi");
      selectedElements.add(el);
      if (!selectedElement) selectedElement = el;
    }

    if (selectedElements.size === 1) {
      selectedElements.forEach((x) => {
        x.classList.remove("selected-multi");
        x.classList.add("selected");
        selectedElement = x;
      });
    } else
      selectedElements.forEach((x) => {
        x.classList.remove("selected");
        x.classList.add("selected-multi");
      });

    updateSelectedInfo();
    updatePropertiesPanel();
    // highlight tree if exists
    try {
      const id = el.getAttribute && el.getAttribute("data-wb-id");
      if (id) {
        const container = document.getElementById("structure-tree");
        if (container) {
          const node = container.querySelector(`li[data-wb-id="${id}"]`);
          if (node) highlightTreeItem(node);
        }
      }
    } catch (e) {}
  }

  function updateSelectedInfo() {
    const info = document.getElementById("selected-info");
    if (!info) return;
    const count = selectedElements.size;
    if (count === 0) {
      info.textContent = "No element selected";
      const t = document.getElementById("tag-input");
      if (t) t.value = "";
    } else if (count === 1) {
      const el = Array.from(selectedElements)[0];
      info.innerHTML = `Selected: &lt;${el.tagName.toLowerCase()}&gt;`;
      const t = document.getElementById("tag-input");
      if (t) t.value = el.tagName.toLowerCase();
    } else {
      info.textContent = `Selected: ${count} elements`;
      const t = document.getElementById("tag-input");
      if (t) t.value = "";
    }
  }

  function updateElementCountSafely() {
    try {
      const doc = safeDoc();
      if (!doc) return;
      const root = doc.getElementById("designRoot") || doc.body;
      const c = root.querySelectorAll("*").length;
      const el = document.getElementById("element-count");
      if (el) el.textContent = c;
    } catch (e) {}
  }

  function refreshCodePreview() {
    try {
      const doc = safeDoc();
      if (!doc) return;
      const root = doc.getElementById("designRoot") || doc.body;
      const el = document.getElementById("html-code");
      if (el) el.textContent = root.innerHTML;
    } catch (e) {}
  }

  /* ---------- updatePropertiesPanel (Elementor-like) ---------- */
  function updatePropertiesPanel() {
    const contentContainer = document.getElementById("properties-content");
    const styleContainer = document.getElementById("properties-style");
    const advContainer = document.getElementById("properties-advanced");

    if (!contentContainer || !styleContainer || !advContainer) return;

    // no selection
    if (!selectedElement) {
      contentContainer.innerHTML =
        "<p>Select an element to edit its properties</p>";
      styleContainer.innerHTML =
        '<div class="wb-acc"><div class="wb-acc-header">Style</div><div class="wb-acc-body"><p>No element selected</p></div></div>';
      advContainer.innerHTML =
        '<div class="wb-acc"><div class="wb-acc-header">Advanced</div><div class="wb-acc-body"><p>No element selected</p></div></div>';
      return;
    }

    const el = selectedElement;
    const tag = el.tagName.toLowerCase();
    const cs = iframe.contentWindow.getComputedStyle(el);

    // ----- CONTENT -----
    let contentHTML = `<div class="wb-group">
      <label>ID</label><input id="prop-id" type="text" value="${el.id || ""}">
      <label>Class</label><input id="prop-class" type="text" value="${
        el.className || ""
      }">
    </div>`;

    if (
      [
        "p",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "span",
        "li",
        "a",
        "button",
        "div",
      ].includes(tag)
    ) {
      contentHTML += `<div class="wb-group"><label>Text</label><textarea id="prop-text" rows="3">${
        el.textContent || ""
      }</textarea></div>`;
    }
    if (tag === "img") {
      contentHTML += `<div class="wb-group"><label>Image URL</label><input id="prop-src" type="text" value="${
        el.getAttribute("src") || ""
      }"><label>Alt text</label><input id="prop-alt" type="text" value="${
        el.getAttribute("alt") || ""
      }"></div>`;
    }
    if (tag === "a") {
      contentHTML += `<div class="wb-group"><label>Href</label><input id="prop-href" type="text" value="${
        el.getAttribute("href") || ""
      }"></div>`;
    }
    contentContainer.innerHTML = contentHTML;

    // ----- STYLE (accordion sections) -----
    styleContainer.innerHTML = `
    <div class="wb-acc" data-acc="typography">
      <div class="wb-acc-header">Typography <button class="btn-sm" id="open-typography" style="margin-left:8px">Open</button></div>
      <div class="wb-acc-body">
        <div class="wb-group"><label>Font size</label><input id="prop-font-size" placeholder="e.g., 24px" value="${
          el.style.fontSize || cs.fontSize || ""
        }"></div>
        <div class="wb-group"><label>Font weight</label><select id="prop-font-weight"><option value="">(default)</option><option>300</option><option>400</option><option>500</option><option>600</option><option>700</option></select></div>
        <div class="wb-group"><label>Text color</label><input id="prop-color" type="color"></div>
      </div>
    </div>

    <div class="wb-acc" data-acc="layout">
      <div class="wb-acc-header">Layout</div>
      <div class="wb-acc-body">
        <div class="wb-group"><label>Display</label><select id="prop-display"><option value="">(keep)</option><option>block</option><option>inline-block</option><option>flex</option><option>grid</option></select></div>
        <div class="wb-group"><label>Width</label><input id="prop-width" placeholder="e.g., 100%, 400px" value="${
          el.style.width || cs.width || ""
        }"></div>
      </div>
    </div>

    <div class="wb-acc" data-acc="spacing">
      <div class="wb-acc-header">Spacing</div>
      <div class="wb-acc-body">
        <div class="wb-group">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div class="wb-group-title">Margin</div>
            <button class="sep-link locked" id="margin-link" title="Link/Unlink margin"><i class="fas fa-link"></i></button>
          </div>
          <div class="spacing-row">
            <div class="spacing-sides">
              <input id="margin-top" placeholder="top" value="${
                cs.marginTop || ""
              }">
              <input id="margin-right" placeholder="right" value="${
                cs.marginRight || ""
              }">
              <input id="margin-bottom" placeholder="bottom" value="${
                cs.marginBottom || ""
              }">
              <input id="margin-left" placeholder="left" value="${
                cs.marginLeft || ""
              }">
            </div>
          </div>
        </div>

        <div class="wb-group">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div class="wb-group-title">Padding</div>
            <button class="sep-link locked" id="padding-link" title="Link/Unlink padding"><i class="fas fa-link"></i></button>
          </div>
          <div class="spacing-row">
            <div class="spacing-sides">
              <input id="padding-top" placeholder="top" value="${
                cs.paddingTop || ""
              }">
              <input id="padding-right" placeholder="right" value="${
                cs.paddingRight || ""
              }">
              <input id="padding-bottom" placeholder="bottom" value="${
                cs.paddingBottom || ""
              }">
              <input id="padding-left" placeholder="left" value="${
                cs.paddingLeft || ""
              }">
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="wb-acc" data-acc="background">
      <div class="wb-acc-header">Background & Border</div>
      <div class="wb-acc-body">
        <div class="wb-group"><label>Background color</label><input id="prop-bg-color" type="color"></div>
        <div class="wb-group"><label>Border radius</label><input id="prop-border-radius" placeholder="e.g., 8px" value="${
          el.style.borderRadius || cs.borderRadius || ""
        }"></div>
        <div class="wb-group"><label>Box shadow</label><input id="prop-box-shadow" placeholder="e.g., 0 6px 24px rgba(0,0,0,.12)" value="${
          el.style.boxShadow || cs.boxShadow || ""
        }"></div>
      </div>
    </div>
  `;

    // ----- ADVANCED -----
    advContainer.innerHTML = `
    <div class="wb-acc">
      <div class="wb-acc-header">Responsive</div>
      <div class="wb-acc-body">
        <div class="wb-group responsive-hide"><input type="checkbox" id="adv-hide-desktop"><label> Hide on Desktop</label></div>
        <div class="wb-group responsive-hide"><input type="checkbox" id="adv-hide-tablet"> <label>Hide on Tablet</label></div>
        <div class="wb-group responsive-hide"><input type="checkbox" id="adv-hide-mobile"> <label>Hide on Mobile</label></div>
      </div>
    </div>

    <div class="wb-acc">
      <div class="wb-acc-header">Position</div>
      <div class="wb-acc-body">
        <div class="wb-group"><label>Position</label><select id="adv-position"><option value="">static</option><option value="relative">relative</option><option value="absolute">absolute</option><option value="fixed">fixed</option></select></div>
        <div class="wb-group"><label>Top / Right / Bottom / Left</label><input id="adv-pos-values" placeholder="e.g., top:10px right:0"></div>
        <div class="wb-group"><label>Z-index</label><input id="adv-zindex" placeholder="e.g., 10"></div>
      </div>
    </div>

    <div class="wb-acc">
      <div class="wb-acc-header">Custom CSS</div>
      <div class="wb-acc-body">
        <div class="wb-group"><textarea id="adv-custom-css" rows="3" placeholder="e.g., transform: rotate(1deg);"></textarea></div>
      </div>
    </div>
  `;

    // ----- set current simple values for color pickers and selects -----
    try {
      if (document.getElementById("prop-color"))
        document.getElementById("prop-color").value = rgbToHex(cs.color);
    } catch (e) {}
    try {
      if (document.getElementById("prop-bg-color"))
        document.getElementById("prop-bg-color").value = rgbToHex(
          cs.backgroundColor
        );
    } catch (e) {}
    try {
      if (document.getElementById("prop-font-weight"))
        document.getElementById("prop-font-weight").value =
          el.style.fontWeight || cs.fontWeight || "";
    } catch (e) {}
    try {
      if (document.getElementById("prop-display"))
        document.getElementById("prop-display").value =
          el.style.display || cs.display || "";
    } catch (e) {}
    try {
      if (document.getElementById("adv-position"))
        document.getElementById("adv-position").value =
          el.style.position || cs.position || "";
    } catch (e) {}
    try {
      if (document.getElementById("adv-zindex"))
        document.getElementById("adv-zindex").value = el.style.zIndex || "";
    } catch (e) {}

   // accordion toggles (after you set styleContainer.innerHTML and advContainer.innerHTML)
styleContainer.querySelectorAll(".wb-acc-header").forEach((h) => {
  h.addEventListener("click", () => h.closest(".wb-acc").classList.toggle("open"));
});
advContainer.querySelectorAll(".wb-acc-header").forEach((h) => {
  h.addEventListener("click", () => h.closest(".wb-acc").classList.toggle("open"));
});

// Typography "Open" button
const openTyp = document.getElementById("open-typography");
if (openTyp) {
  openTyp.addEventListener("click", () => {
    const modal = document.getElementById("typography-modal");
    if (!modal) return;
    // (populate fields if you want, then…)
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
  });
}


    // ----- wire content inputs (live -> debounced) -----
    const deb = (fn, ms = 120) => {
      let t;
      return (...a) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...a), ms);
      };
    };

    document.getElementById("prop-id")?.addEventListener("blur", () => {
      el.id = document.getElementById("prop-id").value;
      pushHistory("set-id");
    });
    document.getElementById("prop-class")?.addEventListener("blur", () => {
      el.className = document.getElementById("prop-class").value;
      pushHistory("set-class");
    });
    document.getElementById("prop-text")?.addEventListener(
      "input",
      deb(() => {
        el.textContent = document.getElementById("prop-text").value;
        refreshCodePreview();
      }, 120)
    );

    document.getElementById("prop-src")?.addEventListener("change", () => {
      el.src = document.getElementById("prop-src").value;
      pushHistory("img-src");
      refreshCodePreview();
    });
    document.getElementById("prop-alt")?.addEventListener("change", () => {
      el.alt = document.getElementById("prop-alt").value;
      pushHistory("img-alt");
      refreshCodePreview();
    });
    document.getElementById("prop-href")?.addEventListener("change", () => {
      el.href = document.getElementById("prop-href").value;
      pushHistory("anchor-href");
      refreshCodePreview();
    });

    // ----- wire style inputs (live) -----
    const applyStyle = deb(() => {
      const map = {
        "prop-font-size": "font-size",
        "prop-font-weight": "font-weight",
        "prop-color": "color",
        "prop-bg-color": "background-color",
        "prop-border-radius": "border-radius",
        "prop-box-shadow": "box-shadow",
        "prop-width": "width",
        "prop-display": "display",
      };
      const styleChanges = {};
      Object.keys(map).forEach((id) => {
        const n = document.getElementById(id);
        if (n && n.value !== "") styleChanges[map[id]] = n.value;
      });
      setElementCssRules(el, styleChanges);
      Object.entries(styleChanges).forEach(([k, v]) => {
        try {
          el.style.setProperty(k, v);
        } catch {}
      });
      refreshCodePreview();
    }, 160);

    [
      "prop-font-size",
      "prop-font-weight",
      "prop-color",
      "prop-bg-color",
      "prop-border-radius",
      "prop-box-shadow",
      "prop-width",
      "prop-display",
    ].forEach((id) => {
      document.getElementById(id)?.addEventListener("input", applyStyle);
      document.getElementById(id)?.addEventListener("change", applyStyle);
    });

    // ----- spacing widgets wiring -----
    const linkToggle = (btnId, inputs, cssPrefix) => {
      let linked = true;
      const btn = document.getElementById(btnId);
      if (!btn) return;
      btn.classList.add("locked");
      btn.addEventListener("click", () => {
        linked = !linked;
        btn.classList.toggle("locked", linked);
        btn.innerHTML = linked
          ? '<i class="fas fa-link"></i>'
          : '<i class="fas fa-unlink"></i>';
        if (linked) {
          // copy top to others
          inputs[1].value = inputs[0].value;
          inputs[2].value = inputs[0].value;
          inputs[3].value = inputs[0].value;
          // apply immediately
          const sc = {};
          sc[cssPrefix] = inputs[0].value;
          setElementCssRules(el, sc);
          el.style.setProperty(cssPrefix, inputs[0].value);
          refreshCodePreview();
        }
      });
      // each input
      inputs.forEach((inp, idx) => {
        inp.addEventListener("input", () => {
          if (linked) {
            inputs.forEach((i) => (i.value = inp.value));
            setElementCssRules(el, { [cssPrefix]: inp.value });
            el.style.setProperty(cssPrefix, inp.value);
          } else {
            const sides = ["top", "right", "bottom", "left"];
            const styleObj = {};
            styleObj[`${cssPrefix}-${sides[idx]}`] = inp.value;
            setElementCssRules(el, styleObj);
            el.style.setProperty(`${cssPrefix}-${sides[idx]}`, inp.value);
          }
          refreshCodePreview();
        });
        inp.addEventListener("change", () =>
          pushHistory("spacing-" + cssPrefix)
        );
      });
    };

    // margin inputs
    const mTop = document.getElementById("margin-top"),
      mRight = document.getElementById("margin-right"),
      mBottom = document.getElementById("margin-bottom"),
      mLeft = document.getElementById("margin-left");
    linkToggle("margin-link", [mTop, mRight, mBottom, mLeft], "margin");

    // padding inputs
    const pTop = document.getElementById("padding-top"),
      pRight = document.getElementById("padding-right"),
      pBottom = document.getElementById("padding-bottom"),
      pLeft = document.getElementById("padding-left");
    linkToggle("padding-link", [pTop, pRight, pBottom, pLeft], "padding");

    // ----- advanced controls wiring -----
    document.getElementById("adv-position")?.addEventListener("change", (e) => {
      el.style.position = e.target.value || "";
      pushHistory("position");
      refreshCodePreview();
    });
    document
      .getElementById("adv-pos-values")
      ?.addEventListener("change", (e) => {
        const txt = e.target.value || "";
        txt.split(/\s+/).forEach((pair) => {
          const [k, v] = pair.split(":");
          if (k && v)
            try {
              el.style.setProperty(k.trim(), v.trim());
            } catch {}
        });
        pushHistory("pos-values");
        refreshCodePreview();
      });
    document.getElementById("adv-zindex")?.addEventListener("change", (e) => {
      el.style.zIndex = e.target.value || "";
      pushHistory("z-index");
      refreshCodePreview();
    });
    document
      .getElementById("adv-custom-css")
      ?.addEventListener("change", (e) => {
        const css = e.target.value || ""; // naive apply
        css.split(";").forEach((pair) => {
          const [k, v] = pair.split(":");
          if (k && v)
            try {
              el.style.setProperty(k.trim(), v.trim());
            } catch {}
        });
        pushHistory("custom-css");
        refreshCodePreview();
      });

    // ----- responsive visibility toggles -----
    ["desktop", "tablet", "mobile"].forEach((dev) => {
      const cb = document.getElementById("adv-hide-" + dev);
      if (!cb) return;
      cb.checked = !!selectedElement.dataset["hide" + dev];
      cb.addEventListener("change", () => {
        if (cb.checked) selectedElement.dataset["hide" + dev] = "1";
        else delete selectedElement.dataset["hide" + dev];
        pushHistory("visibility-" + dev);
        refreshCodePreview();
      });
    });
  }







  function applyProperties() {
    const applyTo = selectedElements.size
      ? Array.from(selectedElements)
      : selectedElement
      ? [selectedElement]
      : [];
    if (!applyTo.length) return;
    applyTo.forEach((node) => {
      try {
        const text = document.getElementById("prop-text")?.value ?? "";
        const id = document.getElementById("prop-id")?.value ?? "";
        const cls = document.getElementById("prop-class")?.value ?? "";
        node.textContent = text;
        node.id = id;
        node.className = cls;
        if (node.tagName.toLowerCase() === "img") {
          const s = document.getElementById("prop-src")?.value ?? "";
          const a = document.getElementById("prop-alt")?.value ?? "";
          node.src = s;
          node.alt = a;
        }
        if (node.tagName.toLowerCase() === "a") {
          const h = document.getElementById("prop-href")?.value ?? "";
          node.href = h;
        }
        node.style.backgroundColor =
          document.getElementById("prop-bg-color")?.value ?? "";
        node.style.color = document.getElementById("prop-color")?.value ?? "";
        node.style.padding =
          document.getElementById("prop-padding")?.value ?? "";
        node.style.margin = document.getElementById("prop-margin")?.value ?? "";
      } catch (e) {}
    });
    refreshCodePreview();
    pushHistory("apply-props");
    buildStructureTree();
  }

  /* ---------- add elements & components ---------- */
  qsAll(".element-btn").forEach((btn) =>
    btn.addEventListener("click", () => {
      addElement(btn.dataset.tag);
      pushHistory("add:" + btn.dataset.tag);
    })
  );
  qsAll("button[data-component]").forEach((btn) =>
    btn.addEventListener("click", () => {
      addComponent(btn.dataset.component);
      pushHistory("component:" + btn.dataset.component);
    })
  );

  function ensureWBIds(doc) {
    try {
      if (!doc) return;
      Array.from(doc.querySelectorAll("*")).forEach((n) => {
        if (n.nodeType !== 1) return;
        const tag = n.tagName.toLowerCase();
        if (tag === "script" || tag === "style") return;
        if (!n.hasAttribute("data-wb-id"))
          n.setAttribute(
            "data-wb-id",
            "wb-" +
              Date.now().toString(36) +
              "-" +
              Math.floor(Math.random() * 99999)
          );
      });
    } catch (e) {
      console.warn(e);
    }
  }

  function addElement(tag) {
    const doc = safeDoc();
    if (!doc) return;
    const root = doc.getElementById("designRoot") || doc.body;
    const el = doc.createElement(tag);
    switch (tag) {
      case "img":
        el.src = "https://placehold.co/800x400?text=Image+Placeholder";
        el.alt = "Placeholder image";
        el.style.maxWidth = "100%";
        el.style.display = "block";
        el.style.borderRadius = "8px";
        break;
      case "a":
        el.href = "https://example.com";
        el.textContent = "Example Link";
        el.className = "btn";
        break;
      case "button":
        el.textContent = "Click Me";
        el.className = "btn";
        break;
      case "ul":
      case "ol":
        for (let i = 1; i <= 3; i++) {
          const li = doc.createElement("li");
          li.textContent = "Item " + i;
          el.appendChild(li);
        }
        break;
      case "h1":
        el.textContent = "Heading 1";
        break;
      case "h2":
        el.textContent = "Heading 2";
        break;
      case "p":
        el.textContent = "Lorem ipsum dolor sit amet...";
        break;
      case "section":
        {
          const h2 = doc.createElement("h2");
          h2.textContent = "Section Title";
          const p = doc.createElement("p");
          p.textContent = "Section content...";
          el.append(h2, p);
          el.style.padding = "30px";
          el.style.margin = "20px 0";
          el.style.background = "#f8f9fa";
          el.style.borderRadius = "12px";
        }
        break;
      case "footer":
        el.innerHTML = "&copy; " + new Date().getFullYear() + " My Website.";
        el.style.padding = "30px";
        el.style.marginTop = "40px";
        el.style.background = "#343a40";
        el.style.color = "white";
        el.style.textAlign = "center";
        el.style.borderRadius = "12px";
        break;
      case "div":
        el.style.padding = "20px";
        el.style.margin = "15px 0";
        el.style.border = "2px dashed #e9ecef";
        el.style.borderRadius = "12px";
        el.textContent = "Container content";
        break;
    }
    if (selectedElement && selectedElement !== root)
      selectedElement.appendChild(el);
    else root.appendChild(el);
    ensureWBIds(doc);
    ensureIframeStyleSheet();
    selectElement(el, false);
    refreshCodePreview();
    updateElementCountSafely();
    buildStructureTree();
  }

  function addComponent(component) {
    const doc = safeDoc();
    if (!doc) return;
    const root = doc.getElementById("designRoot") || doc.body;
    let html = "";
    if (component === "hero")
      html = `<section style="padding:80px 20px;text-align:center;background:#f8f9fa;border-radius:12px;"><h1>Welcome</h1><p style="max-width:600px;margin:20px auto;font-size:1.1rem;">Hero text.</p><a href="#" class="btn">Get Started</a></section>`;
    if (component === "nav")
      html = `<nav style="display:flex;justify-content:space-between;padding:20px;background:#f8f9fa;border-radius:12px;margin-bottom:30px;"><div style="font-weight:bold;font-size:1.2rem">Logo</div><ul style="display:flex;gap:20px;list-style:none"><li><a href='#'>Home</a></li><li><a href='#'>About</a></li></ul></nav>`;
    if (component === "contact")
      html = `<section style="padding:40px;background:#f8f9fa;border-radius:12px;"><h2>Contact Us</h2><form style="display:grid;gap:12px;max-width:600px"><input placeholder="Name"><input placeholder="Email"><textarea placeholder="Message"></textarea><button class="btn">Send</button></form></section>`;
    if (component === "pricing")
      html =
        `<section style="display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin:40px 0;">` +
        Array(3)
          .fill(0)
          .map(
            (_, i) =>
              `<div style="padding:20px;background:white;border-radius:12px;text-align:center;"><h3>Plan ${
                i + 1
              }</h3><p style="font-size:1.5rem">$${
                (i + 1) * 9
              }.99</p><a href="#" class="btn">Choose</a></div>`
          )
          .join("") +
        `</section>`;
    const tmp = doc.createElement("div");
    tmp.innerHTML = html;
    root.appendChild(tmp);
    ensureWBIds(doc);
    ensureIframeStyleSheet();
    refreshCodePreview();
    updateElementCountSafely();
    buildStructureTree();
  }

  /* ---------- wrap / delete / clear / change-tag ---------- */
  const wrapBtn = document.getElementById("wrap-btn");
  if (wrapBtn)
    wrapBtn.addEventListener("click", () => {
      const doc = safeDoc();
      if (!doc) return;
      if (!selectedElements.size) return;
      const arr = Array.from(selectedElements).sort((a, b) =>
        a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING ? 1 : -1
      );
      const wrapper = doc.createElement("div");
      wrapper.style.padding = "12px";
      wrapper.style.border = "1px dashed #dfe6ff";
      wrapper.style.borderRadius = "8px";
      const first = arr[0];
      first.parentNode.insertBefore(wrapper, first);
      arr.forEach((x) => wrapper.appendChild(x));
      selectedElements.clear();
      selectedElements.add(wrapper);
      selectedElement = wrapper;
      updateSelectedInfo();
      refreshCodePreview();
      updateElementCountSafely();
      pushHistory("wrap");
      buildStructureTree();
    });

  const deleteBtn = document.getElementById("delete-btn");
  if (deleteBtn)
    deleteBtn.addEventListener("click", () => {
      const doc = safeDoc();
      if (!doc) return;
      if (selectedElements.size) {
        selectedElements.forEach(
          (x) => x.parentNode && x.parentNode.removeChild(x)
        );
        selectedElements.clear();
        selectedElement = null;
      } else if (selectedElement) {
        selectedElement.parentNode &&
          selectedElement.parentNode.removeChild(selectedElement);
        selectedElement = null;
      }
      updateSelectedInfo();
      refreshCodePreview();
      updateElementCountSafely();
      pushHistory("delete");
      buildStructureTree();
    });

  const clearBtn = document.getElementById("clear-btn");
  if (clearBtn)
    clearBtn.addEventListener("click", () => {
      const doc = safeDoc();
      if (!doc) return;
      const root = doc.getElementById("designRoot") || doc.body;
      root.innerHTML = `<h1>Welcome to Website Builder</h1><p>Click on elements to select them. Use the left panel to add new elements.</p>`;
      selectedElements.clear();
      selectedElement = null;
      updateSelectedInfo();
      refreshCodePreview();
      updateElementCountSafely();
      pushHistory("clear");
      buildStructureTree();
    });

  const changeTagBtn = document.getElementById("change-tag");
  if (changeTagBtn)
    changeTagBtn.addEventListener("click", () => {
      const newTag = document.getElementById("tag-input")?.value.trim();
      if (!newTag || !/^[a-z][a-z0-9]*$/i.test(newTag)) return;
      const doc = safeDoc();
      if (!doc) return;
      if (selectedElements.size > 1) {
        const arr = Array.from(selectedElements);
        selectedElements.clear();
        arr.forEach((old) => {
          const node = doc.createElement(newTag);
          while (old.firstChild) node.appendChild(old.firstChild);
          Array.from(old.attributes).forEach((a) =>
            node.setAttribute(a.name, a.value)
          );
          old.parentNode.replaceChild(node, old);
          selectedElements.add(node);
        });
        selectedElement = Array.from(selectedElements)[0] || null;
        updateSelectedInfo();
        refreshCodePreview();
        pushHistory("change-tag-multi");
        buildStructureTree();
      } else if (selectedElement) {
        const old = selectedElement;
        const node = doc.createElement(newTag);
        while (old.firstChild) node.appendChild(old.firstChild);
        Array.from(old.attributes).forEach((a) =>
          node.setAttribute(a.name, a.value)
        );
        old.parentNode.replaceChild(node, old);
        selectElement(node, false);
        refreshCodePreview();
        pushHistory("change-tag");
        buildStructureTree();
      }
    });

  /* ---------- copy/download ---------- */
  const copyBtn = document.getElementById("copy-code");
  if (copyBtn)
    copyBtn.addEventListener("click", function () {
      const code = document.getElementById("html-code")?.textContent ?? "";
      navigator.clipboard.writeText(code).then(() => {
        const orig = this.innerHTML;
        this.innerHTML = '<i class="fas fa-check"></i> Copied!';
        setTimeout(() => (this.innerHTML = orig), 1400);
      });
    });

  const downloadBtn = document.getElementById("download-btn");
  if (downloadBtn) downloadBtn.addEventListener("click", downloadHTML);
  const dh = document.getElementById("download-html");
  if (dh) dh.addEventListener("click", downloadHTML);
  function downloadHTML() {
    const doc = safeDoc();
    if (!doc) return;
    const root = doc.getElementById("designRoot") || doc.body;
    const darker = getDarkerColor(currentTheme);

    // get stylesheet content from iframe
    const styleNode = doc.getElementById("wb-styles");
    const stylesText = styleNode ? styleNode.textContent : "";

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Website</title>
  <style>
    :root { --primary: ${currentTheme}; --primary-dark: ${darker}; }
    /* builder base styles (keep minimal) */
    body { font-family: 'Segoe UI', sans-serif; padding:20px; max-width:1200px; margin:0 auto; color:#333; background:#fff; }
    .btn { background: var(--primary); color:#fff; padding:12px 20px; border-radius:8px; text-decoration:none; display:inline-block; }
    .btn:hover { background: var(--primary-dark); }
    ${stylesText || ""}
  </style>
</head>
<body>
  ${root.innerHTML}
</body>
</html>`;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "my-website.html";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  /* ---------- utilities ---------- */
  function rgbToHex(rgb) {
    if (!rgb || rgb === "transparent" || rgb.indexOf("rgba(0, 0, 0, 0)") !== -1)
      return "#ffffff";
    const m = rgb.match(/\d+/g);
    if (!m || m.length < 3) return "#000000";
    return (
      "#" +
      (
        (1 << 24) +
        (parseInt(m[0]) << 16) +
        (parseInt(m[1]) << 8) +
        parseInt(m[2])
      )
        .toString(16)
        .slice(1)
    );
  }
  function getDarkerColor(hex) {
    try {
      let r = parseInt(hex.slice(1, 3), 16),
        g = parseInt(hex.slice(3, 5), 16),
        b = parseInt(hex.slice(5, 7), 16);
      r = Math.max(0, r - 30);
      g = Math.max(0, g - 30);
      b = Math.max(0, b - 30);
      return (
        "#" +
        r.toString(16).padStart(2, "0") +
        g.toString(16).padStart(2, "0") +
        b.toString(16).padStart(2, "0")
      );
    } catch (e) {
      return hex;
    }
  }

  /* ---------- resizers ---------- */
  function initResizers() {
    const rL = document.getElementById("resizer-left"),
      rR = document.getElementById("resizer-right");
    const leftPanel = document.querySelector(".left-panel"),
      rightPanel = document.querySelector(".right-panel");
    if (!leftPanel || !rightPanel) {
      log("resizers: panels missing");
      return;
    }
    const start = (e, which) => {
      e.preventDefault();
      const startX = e.clientX ?? (e.touches && e.touches[0].clientX);
      const leftW = leftPanel.getBoundingClientRect().width,
        rightW = rightPanel.getBoundingClientRect().width;
      const move = (me) => {
        const cur = me.clientX ?? (me.touches && me.touches[0].clientX);
        const dx = cur - startX;
        if (which === "left")
          leftPanel.style.width = Math.max(160, leftW + dx) + "px";
        else rightPanel.style.width = Math.max(160, rightW - dx) + "px";
      };
      const up = () => {
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", up);
        document.removeEventListener("touchmove", move);
        document.removeEventListener("touchend", up);
        document.body.style.cursor = "";
      };
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
      document.addEventListener("touchmove", move, { passive: false });
      document.addEventListener("touchend", up);
      document.body.style.cursor = "col-resize";
    };
    if (rL) {
      rL.addEventListener("mousedown", (e) => start(e, "left"));
      rL.addEventListener("touchstart", (e) => start(e, "left"), {
        passive: false,
      });
    }
    if (rR) {
      rR.addEventListener("mousedown", (e) => start(e, "right"));
      rR.addEventListener("touchstart", (e) => start(e, "right"), {
        passive: false,
      });
    }
  }

  initResizers();

  /* ---------- structure panel & context menu ---------- */
  let wbIdCounter = Date.now() % 1000000;
  function genWBId() {
    return "wb-" + wbIdCounter++;
  }
  function assignIdsRecursively(node) {
    if (!node || node.nodeType !== 1) return;
    node.setAttribute("data-wb-id", genWBId());
    Array.from(node.children).forEach((c) => assignIdsRecursively(c));
  }
  function ensureWBIds(doc) {
    if (!doc) return;
    Array.from(doc.querySelectorAll("*")).forEach((n) => {
      if (n.nodeType !== 1) return;
      const tag = n.tagName.toLowerCase();
      if (tag === "script" || tag === "style") return;
      if (!n.hasAttribute("data-wb-id"))
        n.setAttribute("data-wb-id", genWBId());
    });
  }

  function buildStructureTree() {
    const doc = safeDoc();
    if (!doc) return;
    const root = doc.getElementById("designRoot") || doc.body;
    ensureWBIds(doc);
    const container = document.getElementById("structure-tree");
    if (!container) return;
    container.innerHTML = "";
    const ul = document.createElement("ul");
    renderNodeToTree(root, ul, doc);
    container.appendChild(ul);
  }

  function renderNodeToTree(node, parentUl, doc) {
    Array.from(node.children).forEach((child) => {
      if (child.nodeType !== 1) return;

      const li = document.createElement("li");
      const id = child.getAttribute("data-wb-id") || genWBId();
      child.setAttribute("data-wb-id", id);
      li.dataset.wbId = id;

      const tag = child.tagName.toLowerCase();
      // show only tag (and a short meta with id or first class if present) — no content text
      const meta =
        (child.id ? `#${child.id}` : "") +
        (child.className ? ` .${String(child.className).split(" ")[0]}` : "");
      li.innerHTML = `<div class="structure-item"><div><strong>&lt;${tag}&gt;</strong> <span class="meta">${meta}</span></div></div>`;

      // clicking selects element in preview
      li.addEventListener("click", (e) => {
        e.stopPropagation();
        selectElementById(li.dataset.wbId);
        highlightTreeItem(li);
      });

      // right-click for context menu
      li.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        showContextMenu(e.clientX, e.clientY, li.dataset.wbId);
      });

      parentUl.appendChild(li);

      // recursively render children (keep nesting)
      const children = Array.from(child.children).filter(
        (c) => c.nodeType === 1
      );
      if (children.length) {
        const sub = document.createElement("ul");
        renderNodeToTree(child, sub, doc);
        parentUl.appendChild(sub);
      }
    });
  }

  function highlightTreeItem(liNode) {
    const container = document.getElementById("structure-tree");
    if (!container) return;
    container
      .querySelectorAll("li")
      .forEach((li) => li.classList.remove("tree-selected"));
    liNode.classList.add("tree-selected");
  }

  function selectElementById(wbId) {
    const doc = safeDoc();
    if (!doc) return;
    const el = doc.querySelector(`[data-wb-id="${wbId}"]`);
    if (!el) return;
    try {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (e) {}
    selectElement(el, false);
    updateSelectedInfo();
    updatePropertiesPanel();
  }

  const contextMenu = document.getElementById("wb-context-menu");
  let contextTargetWbId = null;
  function showContextMenu(pageX, pageY, wbId) {
    if (!contextMenu) return console.warn("No wb-context-menu element found");
    contextTargetWbId = wbId;
    contextMenu.style.left = pageX + 4 + "px";
    contextMenu.style.top = pageY + 4 + "px";
    contextMenu.style.display = "flex";
    contextMenu.focus && contextMenu.focus();
  }
  function hideContextMenu() {
    contextTargetWbId = null;
    if (contextMenu) contextMenu.style.display = "none";
  }

  if (contextMenu)
    contextMenu.addEventListener("click", (ev) => {
      const btn = ev.target.closest("button");
      if (!btn) return;
      const action = btn.dataset.action;
      if (!action || !contextTargetWbId) {
        hideContextMenu();
        return;
      }
      const doc = safeDoc();
      if (!doc) {
        hideContextMenu();
        return;
      }
      const node = doc.querySelector(`[data-wb-id="${contextTargetWbId}"]`);
      if (!node) {
        hideContextMenu();
        return;
      }
      if (action === "select") {
        selectElement(node, false);
        updateSelectedInfo();
      } else if (action === "delete") {
        node.parentNode && node.parentNode.removeChild(node);
        pushHistory("delete");
        refreshCodePreview();
        updateElementCountSafely();
        buildStructureTree();
      } else if (action === "duplicate") {
        const clone = node.cloneNode(true);
        assignIdsRecursively(clone);
        node.parentNode.insertBefore(clone, node.nextSibling);
        pushHistory("duplicate");
        refreshCodePreview();
        updateElementCountSafely();
        buildStructureTree();
      } else if (action === "wrap") {
        const wrapper = doc.createElement("div");
        wrapper.style.padding = "12px";
        wrapper.style.border = "1px dashed #dfe6ff";
        wrapper.style.borderRadius = "8px";
        node.parentNode.insertBefore(wrapper, node);
        wrapper.appendChild(node);
        assignIdsRecursively(wrapper);
        pushHistory("wrap");
        refreshCodePreview();
        updateElementCountSafely();
        buildStructureTree();
      } else if (action === "edit-tag") {
        const newTag = prompt(
          "Change tag (e.g., div, section, h2):",
          node.tagName.toLowerCase()
        );
        if (newTag && /^[a-z][a-z0-9]*$/i.test(newTag)) {
          const replacement = doc.createElement(newTag);
          while (node.firstChild) replacement.appendChild(node.firstChild);
          Array.from(node.attributes).forEach((a) =>
            replacement.setAttribute(a.name, a.value)
          );
          node.parentNode.replaceChild(replacement, node);
          assignIdsRecursively(replacement);
          pushHistory("change-tag");
          refreshCodePreview();
          updateElementCountSafely();
          buildStructureTree();
        }
      }
      setTimeout(() => {
        hideContextMenu();
      }, 40);
    });

  document.addEventListener("click", (e) => {
    if (contextMenu && contextMenu.contains(e.target) === false)
      hideContextMenu();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hideContextMenu();
  });

  function enableIframeContextMenu() {
    const doc = safeDoc();
    if (!doc) return;
    const root = doc.getElementById("designRoot") || doc.body;
    doc.addEventListener("contextmenu", function (e) {
      if (!root || !root.contains(e.target)) return;
      e.preventDefault();
      ensureWBIds(doc);
      const id = e.target.getAttribute("data-wb-id") || "";
      const rect = iframe.getBoundingClientRect();
      const pageX = rect.left + e.clientX,
        pageY = rect.top + e.clientY;
      showContextMenu(pageX, pageY, id);
    });
  }

  /* ---------- observe tree changes ---------- */
  let treeUpdateTimer = null;
  function scheduleTreeBuild(delay = 120) {
    clearTimeout(treeUpdateTimer);
    treeUpdateTimer = setTimeout(() => buildStructureTree(), delay);
  }
  function observeDesignRoot() {
    const doc = safeDoc();
    if (!doc) return;
    const root = doc.getElementById("designRoot") || doc.body;
    if (!root) return;
    const mo = new MutationObserver(() => scheduleTreeBuild(80));
    mo.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });
    window._wb = window._wb || {};
    window._wb._structureMO = mo;
  }

  /* ---------- iframe events: robust selection & dblclick ---------- */
  /* ---------- iframe events: robust selection & dblclick (handles already-loaded iframe) ---------- */
  function onIframeReady() {
    try {
      log("iframe ready (handler)");
    } catch (e) {}
    const doc = safeDoc();
    if (!doc) return;

    // apply current theme variable
    try {
      doc.documentElement.style.setProperty("--primary", currentTheme);
    } catch (e) {}

    // make body focusable for key handling
    if (doc.body) {
      doc.body.setAttribute("tabindex", "-1");
      doc.body.style.outline = "none";
    }

    const root = doc.getElementById("designRoot") || doc.body;

    function getTargetElement(e) {
      let t = e.target;
      if (!t) return null;
      if (t.nodeType === 3) t = t.parentNode;
      if (!root || !root.contains(t)) return null;
      if (t === root) return null;
      return t;
    }

    // Attempt auto-restore (if present)
    const restored = loadAutosaveIfExists();
    if (!restored) pushHistory("initial");

    // Use pointerdown for selection (works for touch + mouse)
    doc.addEventListener(
      "pointerdown",
      (e) => {
        const target = getTargetElement(e);
        if (!target) return;
        // if editing, don't steal focus
        if (target.isContentEditable) return;
        const additive = !!(e.shiftKey || e.metaKey);
        selectElement(target, additive);
        try {
          doc.body.focus();
        } catch (err) {}
      },
      true
    );

    // Prevent anchors from navigating while editing
    doc.addEventListener(
      "click",
      (e) => {
        const target = getTargetElement(e);
        if (!target) return;
        const anchor = target.closest ? target.closest("a") : null;
        if (anchor) e.preventDefault();
      },
      true
    );

    // Double-click inline edit
    doc.addEventListener(
      "dblclick",
      (e) => {
        const target = getTargetElement(e);
        if (!target) return;

        const editableTags = [
          "P",
          "H1",
          "H2",
          "H3",
          "H4",
          "H5",
          "H6",
          "SPAN",
          "DIV",
          "A",
          "LI",
          "BUTTON",
        ];

        if (!editableTags.includes(target.tagName)) return;

        target.setAttribute("contenteditable", "true");
        target.focus();

        // Place cursor at end
        const range = doc.createRange();
        range.selectNodeContents(target);
        range.collapse(false);
        const sel = doc.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);

        function commitEdit(ev) {
          // Finish editing ONLY on Enter (without Shift)
          if (ev.key === "Enter" && !ev.shiftKey) {
            ev.preventDefault();
            target.removeAttribute("contenteditable");
            target.removeEventListener("keydown", commitEdit);

            selectElement(target, false);
            refreshCodePreview();
            pushHistory("inline-edit");
            buildStructureTree();
          }
        }

        // ✅ Only listen for Enter key
        target.addEventListener("keydown", commitEdit);
      },
      true
    );

    // Delete / Backspace handling
    doc.addEventListener("keydown", (e) => {
      if ((e.key === "Delete" || e.key === "Backspace") && selectedElement) {
        const active = doc.activeElement;
        if (active && active.isContentEditable) return;
        selectedElement.remove();
        selectedElement = null;
        selectedElements.clear();
        updateSelectedInfo();
        refreshCodePreview();
        updateElementCountSafely();
        pushHistory("delete-key");
        buildStructureTree();
      }
    });

    // Ensure tree IDs exist, build tree, enable iframe right-click context menu, observe mutations
    ensureWBIds(doc);
    ensureIframeStyleSheet();
    buildStructureTree();
    enableIframeContextMenu();
    observeDesignRoot();
    initResizers();
    updateHistoryButtons();
    refreshCodePreview();
    updateElementCountSafely();
  }

  // Attach handler robustly: if iframe already loaded, call immediately; otherwise listen for load.
  // Also add a small fallback check timeout for edge cases.
  if (iframe) {
    if (
      iframe.contentDocument &&
      (iframe.contentDocument.readyState === "complete" ||
        iframe.contentDocument.readyState === "interactive")
    ) {
      // call async to ensure other setup has completed
      setTimeout(onIframeReady, 20);
    } else {
      iframe.addEventListener("load", onIframeReady);
      // fallback: if load doesn't fire, try again after 300ms
      setTimeout(() => {
        try {
          if (
            iframe.contentDocument &&
            (iframe.contentDocument.readyState === "complete" ||
              iframe.contentDocument.readyState === "interactive")
          )
            onIframeReady();
        } catch (e) {}
      }, 300);
    }
  }

  /* ---------- undo/redo wiring ---------- */
  document.getElementById("undo-btn")?.addEventListener("click", undo);
  document.getElementById("redo-btn")?.addEventListener("click", redo);
  document.addEventListener("keydown", (e) => {
    const z = e.key === "z" || e.key === "Z",
      y = e.key === "y" || e.key === "Y",
      mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    if (mod && z && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if (mod && (y || (z && e.shiftKey))) {
      e.preventDefault();
      redo();
    }
  });

  /* ---------- expose debug helpers ---------- */
  window._wb = window._wb || {};
  Object.assign(window._wb, {
    pushHistory,
    undo,
    redo,
    loadAutosaveIfExists,
    selectedElements,
  });

  /* ---------- init right-panel tabs + typography modal close/apply ---------- */
  function initElementorPanel() {
    // tabs
    document.querySelectorAll("#right-panel .tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document
          .querySelectorAll("#right-panel .tab-btn")
          .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const tab = btn.dataset.tab;
        document
          .querySelectorAll("#right-panel .prop-tab")
          .forEach((t) => t.classList.add("hidden"));
        document.getElementById("prop-tab-" + tab).classList.remove("hidden");
        // refresh panel after switching
        updatePropertiesPanel && updatePropertiesPanel();
      });
    });

    // color picker (global)
    document
      .querySelectorAll("#global-color-picker .color-option")
      .forEach((opt) => {
        opt.addEventListener("click", function () {
          document
            .querySelectorAll("#global-color-picker .color-option")
            .forEach((o) => o.classList.remove("active"));
          this.classList.add("active");
          currentTheme = this.dataset.color;
          try {
            applyTheme();
          } catch (e) {}
          try {
            scheduleAutosave && scheduleAutosave(400);
          } catch (e) {}
        });
      });

    // typography modal buttons
    const modal = document.getElementById("typography-modal");
    document
      .getElementById("typography-close")
      ?.addEventListener("click", () => {
        modal.classList.add("hidden");
        modal.setAttribute("aria-hidden", "true");
      });
    document
      .getElementById("typography-cancel")
      ?.addEventListener("click", () => {
        modal.classList.add("hidden");
        modal.setAttribute("aria-hidden", "true");
      });

    // apply from modal
    document
      .getElementById("typography-apply")
      ?.addEventListener("click", () => {
        if (!selectedElement) return;
        const map = {
          "tb-font-family": "font-family",
          "tb-font-size": "font-size",
          "tb-font-weight": "font-weight",
          "tb-line-height": "line-height",
          "tb-letter-spacing": "letter-spacing",
          "tb-text-transform": "text-transform",
          "tb-color": "color",
        };
        const styleChanges = {};
        Object.keys(map).forEach((id) => {
          const inp = document.getElementById(id);
          if (inp && inp.value !== "") styleChanges[map[id]] = inp.value;
        });
        setElementCssRules(selectedElement, styleChanges);
        Object.entries(styleChanges).forEach(([k, v]) => {
          try {
            selectedElement.style.setProperty(k, v);
          } catch {}
        });
        refreshCodePreview();
        pushHistory("typography-apply");
        modal.classList.add("hidden");
        modal.setAttribute("aria-hidden", "true");
      });

    // open modal by clicking the "Open" button (if panel generated after selection)
    // updatePropertiesPanel attaches handler to that button when it creates the DOM
  };
  

  initElementorPanel();
  console.log("[WB] initElementorPanel()");

  log("script ready");
});
