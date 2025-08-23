document.addEventListener("DOMContentLoaded", function () {
  const iframe = document.getElementById("preview");
  const deviceWrapper = document.getElementById("device-wrapper");
  let selectedElement = null;
  let selectedElementId = null;
  let currentTheme = "#4361ee";
  let selectedElements = new Set(); // stores DOM nodes inside iframe
  let history = [];
  let historyIndex = -1;
  let isUserInteracting = false;

  // Initialize tabs
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", function () {
      document
        .querySelectorAll(".tab")
        .forEach((t) => t.classList.remove("active"));
      document
        .querySelectorAll(".tab-content")
        .forEach((c) => c.classList.remove("active"));

      this.classList.add("active");
      document
        .getElementById(`${this.dataset.tab}-tab`)
        .classList.add("active");
    });
  });

  // Initialize color picker
  document.querySelectorAll(".color-option").forEach((option) => {
    option.addEventListener("click", function () {
      document
        .querySelectorAll(".color-option")
        .forEach((o) => o.classList.remove("active"));
      this.classList.add("active");
      currentTheme = this.dataset.color;
      applyTheme();
    });
  });

  // Device toggles
  document.querySelectorAll("[data-device]").forEach((btn) => {
    btn.addEventListener("click", function () {
      document
        .querySelectorAll("[data-device]")
        .forEach((b) => b.classList.remove("active"));
      this.classList.add("active");
      const device = this.dataset.device;
      deviceWrapper.classList.remove("desktop", "tablet", "mobile");
      deviceWrapper.classList.add(device);
    });
  });

  // Apply theme function — sets CSS variable inside iframe and updates inline fallbacks
  function applyTheme() {
    try {
      const doc = iframe.contentDocument;
      if (doc && doc.documentElement) {
        doc.documentElement.style.setProperty("--primary", currentTheme);
        // also update inline button/bg colors (fallback for older templates)
        doc.querySelectorAll(".btn, button, a").forEach((btn) => {
          if (
            btn.tagName.toLowerCase() === "a" ||
            btn.classList.contains("btn")
          ) {
            btn.style.backgroundColor = currentTheme;
            // adjust hover via inline style is not trivial — rely on CSS var + getDarkerColor for exported file
          }
        });
      }
    } catch (e) {
      // cross-origin won't happen because srcdoc is same-origin
      console.warn(e);
    }
    refreshCodePreview();
  }

  // Wait for iframe to load
  iframe.addEventListener("load", function () {
    const doc = iframe.contentDocument;
    const designRoot = doc.getElementById("designRoot");

    // Ensure iframe root has CSS var set
    try {
      doc.documentElement.style.setProperty("--primary", currentTheme);
    } catch (e) {}

    // Make body focusable for key events
    doc.body.setAttribute("tabindex", "-1");
    doc.body.focus();

    // Selection handling
    doc.addEventListener(
      "click",
      function (e) {
        e.stopPropagation();
        if (
          designRoot &&
          designRoot.contains(e.target) &&
          e.target !== designRoot
        ) {
          const additive = !!(e.shiftKey || e.metaKey);
          selectElement(e.target, additive);
        }
      },
      true
    );

    // Delete key handling
    doc.addEventListener("keydown", function (e) {
      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        selectedElement &&
        selectedElement !== designRoot
      ) {
        selectedElement.remove();
        selectedElement = null;
        selectedElementId = null;
        updateSelectedInfo();
        refreshCodePreview();
        updateElementCount();
      }
    });
  });

  // Preview reset button
  document
    .getElementById("preview-reset")
    .addEventListener("click", function () {
      deviceWrapper.classList.remove("tablet", "mobile");
      deviceWrapper.classList.add("desktop");
      document
        .querySelectorAll("[data-device]")
        .forEach((b) => b.classList.remove("active"));
      document.querySelector('[data-device="desktop"]').classList.add("active");
    });

  // Add element buttons
  document.querySelectorAll(".element-btn").forEach((btn) => {
    btn.addEventListener("click", function () {
      const tag = this.getAttribute("data-tag");
      addElement(tag);
      pushHistory("add:" + tag);
    });
  });

  // Add component buttons
  document.querySelectorAll("button[data-component]").forEach((btn) => {
    btn.addEventListener("click", function () {
      const component = this.getAttribute("data-component");
      addComponent(component);
      pushHistory("component:" + component);
    });
  });

  // Wrap button
  document.getElementById("wrap-btn").addEventListener("click", function () {
    const doc = iframe.contentDocument;
    const designRoot = doc.getElementById("designRoot");
    if (selectedElements.size === 0) return;
    const wrapper = doc.createElement("div");
    wrapper.style.padding = "12px";
    wrapper.style.border = "1px dashed #dfe6ff";
    wrapper.style.borderRadius = "8px";
    // append selected elements to wrapper in DOM order
    const elementsArray = Array.from(selectedElements);
    // sort by position in DOM to preserve order
    elementsArray.sort((a, b) => {
      const pos = a.compareDocumentPosition(b);
      // keep original order (if a precedes b, return -1)
      return pos & Node.DOCUMENT_POSITION_PRECEDING ? 1 : -1;
    });
    // Insert wrapper before first selected element
    const firstEl = elementsArray[0];
    firstEl.parentNode.insertBefore(wrapper, firstEl);
    elementsArray.forEach((el) => wrapper.appendChild(el));
    // clear & select wrapper
    selectedElements.clear();
    selectedElements.add(wrapper);
    selectedElement = wrapper;
    updateSelectedInfo();
    refreshCodePreview();
    updateElementCount();
    pushHistory("wrap");
  });

  // Delete button
  document.getElementById("delete-btn").addEventListener("click", function () {
    const doc = iframe.contentDocument;
    if (selectedElements.size > 0) {
      selectedElements.forEach((el) => {
        if (el && el.parentNode) el.parentNode.removeChild(el);
      });
      selectedElements.clear();
      selectedElement = null;
      updateSelectedInfo();
      refreshCodePreview();
      updateElementCount();
      pushHistory("delete");
    } else if (selectedElement) {
      // fallback (shouldn't normally happen)
      selectedElement.remove();
      selectedElement = null;
      updateSelectedInfo();
      refreshCodePreview();
      updateElementCount();
      pushHistory("delete");
    }
  });

  // Clear button
  document.getElementById("clear-btn").addEventListener("click", function () {
    const doc = iframe.contentDocument;
    const designRoot = doc.getElementById("designRoot");
    designRoot.innerHTML =
      "<h1>Welcome to Website Builder</h1><p>Click on elements to select them. Use the left panel to add new elements.</p>";
    selectedElements.clear();
    selectedElement = null;
    updateSelectedInfo();
    refreshCodePreview();
    updateElementCount();
    pushHistory("clear"); // <-- added
  });

  // Change tag button
  document.getElementById("change-tag").addEventListener("click", function () {
    const newTag = document.getElementById("tag-input").value.trim();
    if (!newTag || !/^[a-z][a-z0-9]*$/i.test(newTag)) return;
    const doc = iframe.contentDocument;

    // If multi-select, change each selected
    if (selectedElements.size > 1) {
      const arr = Array.from(selectedElements);
      selectedElements.clear();
      arr.forEach((oldEl) => {
        const newEl = doc.createElement(newTag);
        // move children and attributes
        while (oldEl.firstChild) newEl.appendChild(oldEl.firstChild);
        Array.from(oldEl.attributes).forEach((attr) =>
          newEl.setAttribute(attr.name, attr.value)
        );
        oldEl.parentNode.replaceChild(newEl, oldEl);
        selectedElements.add(newEl);
      });
      // pick primary
      selectedElement = Array.from(selectedElements)[0] || null;
      updateSelectedInfo();
      refreshCodePreview();
      pushHistory("change-tag-multi");
    } else if (selectedElement) {
      // single element change
      const el = selectedElement;
      const newEl = doc.createElement(newTag);
      while (el.firstChild) newEl.appendChild(el.firstChild);
      Array.from(el.attributes).forEach((attr) =>
        newEl.setAttribute(attr.name, attr.value)
      );
      el.parentNode.replaceChild(newEl, el);
      selectElement(newEl);
      refreshCodePreview();
      pushHistory("change-tag");
    }
  });

  // Download (header) button
  document
    .getElementById("download-btn")
    .addEventListener("click", function () {
      downloadHTML();
    });

  // Download HTML button (in properties)
  document
    .getElementById("download-html")
    .addEventListener("click", function () {
      downloadHTML();
    });

  // Copy code button
  document.getElementById("copy-code").addEventListener("click", function () {
    const code = document.getElementById("html-code").textContent;
    navigator.clipboard.writeText(code).then(() => {
      const originalText = this.innerHTML;
      this.innerHTML = '<i class="fas fa-check"></i> Copied!';
      setTimeout(() => {
        this.innerHTML = originalText;
      }, 1600);
    });
  });

  // Download HTML helper
  function downloadHTML() {
    const doc = iframe.contentDocument;
    const designRoot = doc.getElementById("designRoot");
    const darker = getDarkerColor(currentTheme);
    const htmlContent = `<!DOCTYPE html>
<html>
<head>
    <title>My Website</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        :root { --primary: ${currentTheme}; --primary-dark: ${darker}; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; padding: 20px; max-width: 1200px; margin: 0 auto; color: #333; background: #fff; }
        .btn { background: var(--primary); color: white; padding: 12px 20px; border: none; border-radius: 8px; cursor: pointer; display: inline-block; text-decoration:none; font-weight:600; transition: background 220ms; }
        .btn:hover { background: var(--primary-dark); }
        h1,h2,h3,h4,h5{ color: var(--primary); margin-top:0; }
        img{ max-width:100%; height:auto; border-radius:6px; }
        a{ color: var(--primary); }
    </style>
</head>
<body>
    ${designRoot.innerHTML}
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: "text/html" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "my-website.html";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Function to add a new element
  function addElement(tag) {
    const doc = iframe.contentDocument;
    const designRoot = doc.getElementById("designRoot");

    const el = doc.createElement(tag);

    switch (tag) {
      case "img":
        el.src = "https://placehold.co/800x400?text=Image+Placeholder";
        el.alt = "Placeholder image";
        el.style.display = "block";
        el.style.maxWidth = "100%";
        el.style.borderRadius = "8px";
        break;
      case "a":
        el.href = "https://example.com";
        el.textContent = "Example Link";
        el.className = "btn";
        el.setAttribute("role", "link");
        break;
      case "button":
        el.textContent = "Click Me";
        el.className = "btn";
        break;
      case "ul":
      case "ol":
        for (let i = 1; i <= 3; i++) {
          const li = doc.createElement("li");
          li.textContent = `Item ${i}`;
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
        el.textContent =
          "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor.";
        break;
      case "section":
        const h2 = doc.createElement("h2");
        h2.textContent = "Section Title";
        const p = doc.createElement("p");
        p.textContent =
          "Section content goes here. You can edit this text with the properties panel.";
        el.append(h2, p);
        el.style.padding = "30px";
        el.style.margin = "20px 0";
        el.style.background = "#f8f9fa";
        el.style.borderRadius = "12px";
        break;
      case "footer":
        el.innerHTML =
          "&copy; " +
          new Date().getFullYear() +
          " My Website. All rights reserved.";
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

    if (selectedElement && selectedElement !== designRoot) {
      selectedElement.appendChild(el);
    } else {
      designRoot.appendChild(el);
    }

    selectElement(el);
    refreshCodePreview();
    updateElementCount();
  }

  // Function to add a component
  function addComponent(component) {
    const doc = iframe.contentDocument;
    const designRoot = doc.getElementById("designRoot");

    let html = "";

    switch (component) {
      case "hero":
        html = `
                            <section style="padding: 80px 20px; text-align: center; background: #f8f9fa; border-radius: 12px;">
                                <h1>Welcome to Our Website</h1>
                                <p style="max-width: 600px; margin: 20px auto; font-size: 1.2rem;">
                                    This is a hero section. You can customize it with your own content.
                                </p>
                                <a href="#" class="btn">Get Started</a>
                            </section>
                        `;
        break;
      case "nav":
        html = `
                            <nav style="display: flex; justify-content: space-between; align-items: center; padding: 20px; background: #f8f9fa; border-radius: 12px; margin-bottom: 30px;">
                                <div style="font-weight: bold; font-size: 1.5rem;">Logo</div>
                                <ul style="display: flex; list-style: none; gap: 20px;">
                                    <li><a href="#">Home</a></li>
                                    <li><a href="#">About</a></li>
                                    <li><a href="#">Services</a></li>
                                    <li><a href="#">Contact</a></li>
                                </ul>
                            </nav>
                        `;
        break;
      case "contact":
        html = `
                            <section style="padding: 40px; background: #f8f9fa; border-radius: 12px;">
                                <h2>Contact Us</h2>
                                <form style="display: grid; gap: 15px; max-width: 600px;">
                                    <input type="text" placeholder="Your Name" style="padding: 12px; border: 1px solid #ddd; border-radius: 6px;">
                                    <input type="email" placeholder="Your Email" style="padding: 12px; border: 1px solid #ddd; border-radius: 6px;">
                                    <textarea placeholder="Your Message" rows="4" style="padding: 12px; border: 1px solid #ddd; border-radius: 6px;"></textarea>
                                    <button type="submit" class="btn">Send Message</button>
                                </form>
                            </section>
                        `;
        break;
      case "pricing":
        html = `
                            <section style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin: 40px 0;">
                                <div style="padding: 30px; background: white; border-radius: 12px; box-shadow: 0 5px 15px rgba(0,0,0,0.08); text-align: center;">
                                    <h3>Basic</h3>
                                    <p style="font-size: 2rem; margin: 20px 0;">$9.99<span style="font-size: 1rem;">/month</span></p>
                                    <ul style="list-style: none; padding: 0; margin: 20px 0;">
                                        <li>Feature 1</li>
                                        <li>Feature 2</li>
                                        <li>Feature 3</li>
                                    </ul>
                                    <a href="#" class="btn">Get Started</a>
                                </div>
                                <div style="padding: 30px; background: white; border-radius: 12px; box-shadow: 0 5px 15px rgba(0,0,0,0.08); text-align: center;">
                                    <h3>Pro</h3>
                                    <p style="font-size: 2rem; margin: 20px 0;">$19.99<span style="font-size: 1rem;">/month</span></p>
                                    <ul style="list-style: none; padding: 0; margin: 20px 0;">
                                        <li>Feature 1</li>
                                        <li>Feature 2</li>
                                        <li>Feature 3</li>
                                        <li>Feature 4</li>
                                    </ul>
                                    <a href="#" class="btn">Get Started</a>
                                </div>
                                <div style="padding: 30px; background: white; border-radius: 12px; box-shadow: 0 5px 15px rgba(0,0,0,0.08); text-align: center;">
                                    <h3>Enterprise</h3>
                                    <p style="font-size: 2rem; margin: 20px 0;">$29.99<span style="font-size: 1rem;">/month</span></p>
                                    <ul style="list-style: none; padding: 0; margin: 20px 0;">
                                        <li>Feature 1</li>
                                        <li>Feature 2</li>
                                        <li>Feature 3</li>
                                        <li>Feature 4</li>
                                        <li>Feature 5</li>
                                    </ul>
                                    <a href="#" class="btn">Get Started</a>
                                </div>
                            </section>
                        `;
        break;
    }

    const tempDiv = doc.createElement("div");
    tempDiv.innerHTML = html;

    if (selectedElement && selectedElement !== designRoot) {
      selectedElement.appendChild(tempDiv);
    } else {
      designRoot.appendChild(tempDiv);
    }

    refreshCodePreview();
    updateElementCount();
  }

  // Function to select an element
  // Modified selectElement allowing additive (multi-select)
  function selectElement(element, additive = false) {
    const doc = iframe.contentDocument;
    const designRoot = doc.getElementById("designRoot");
    if (!element || element === designRoot) return;

    // If not additive, clear previous selections
    if (!additive) {
      selectedElements.forEach((el) =>
        el.classList.remove("selected", "selected-multi")
      );
      selectedElements.clear();
      selectedElement = null;
    }

    // If element already selected and additive => toggle off
    if (additive && selectedElements.has(element)) {
      element.classList.remove("selected", "selected-multi");
      selectedElements.delete(element);
    } else {
      // mark element
      element.classList.add("selected", "selected-multi");
      selectedElements.add(element);
      // set primary selectedElement if not set
      if (!selectedElement) selectedElement = element;
    }

    // If we have only one selected element, keep the 'selected' class on it as the primary
    if (selectedElements.size === 1) {
      selectedElements.forEach((el) => {
        el.classList.remove("selected-multi");
        el.classList.add("selected");
        selectedElement = el;
      });
    } else {
      // multiple selected — ensure they have 'selected-multi' not the solid 'selected' outline
      selectedElements.forEach((el) => {
        el.classList.remove("selected");
        el.classList.add("selected-multi");
      });
    }

    updateSelectedInfo();
    updatePropertiesPanel();
  }

  // Update selected info display
  function updateSelectedInfo() {
    const infoEl = document.getElementById("selected-info");
    const count = selectedElements.size;
    if (count === 0) {
      infoEl.textContent = "No element selected";
      document.getElementById("tag-input").value = "";
    } else if (count === 1) {
      const el = Array.from(selectedElements)[0];
      infoEl.innerHTML = `Selected: &lt;${el.tagName.toLowerCase()}&gt;`;
      document.getElementById("tag-input").value = el.tagName.toLowerCase();
    } else {
      infoEl.textContent = `Selected: ${count} elements`;
      document.getElementById("tag-input").value = "";
    }
  }

  // Update element count
  function updateElementCount() {
    const doc = iframe.contentDocument;
    const designRoot = doc.getElementById("designRoot");
    const count = designRoot.querySelectorAll("*").length;
    document.getElementById("element-count").textContent = count;
  }

  // Update properties panel
  function updatePropertiesPanel() {
    const propsPanel = document.getElementById("properties-content");

    if (!selectedElement) {
      propsPanel.innerHTML = "<p>Select an element to edit its properties</p>";
      return;
    }

    let html = `
                    <h3><i class="fas fa-edit"></i> Edit ${selectedElement.tagName.toLowerCase()}</h3>
                    <label>Text Content:</label>
                    <textarea id="prop-text" rows="3">${
                      selectedElement.textContent
                    }</textarea>
                    
                    <label>ID:</label>
                    <input type="text" id="prop-id" value="${
                      selectedElement.id
                    }">
                    
                    <label>Class:</label>
                    <input type="text" id="prop-class" value="${
                      selectedElement.className
                    }">
                `;

    if (selectedElement.tagName.toLowerCase() === "img") {
      html += `
                        <label>Image Source:</label>
                        <input type="text" id="prop-src" value="${selectedElement.src}">
                        
                        <label>Alt Text:</label>
                        <input type="text" id="prop-alt" value="${selectedElement.alt}">
                    `;
    }

    if (selectedElement.tagName.toLowerCase() === "a") {
      html += `
                        <label>Link URL:</label>
                        <input type="text" id="prop-href" value="${selectedElement.href}">
                    `;
    }

    html += `
                    <h3><i class="fas fa-paint-brush"></i> Styles</h3>
                    <label>Background Color:</label>
                    <input type="color" id="prop-bg-color" value="#ffffff">
                    
                    <label>Text Color:</label>
                    <input type="color" id="prop-color" value="#000000">
                    
                    <label>Padding:</label>
                    <input type="text" id="prop-padding" placeholder="e.g., 10px">
                    
                    <label>Margin:</label>
                    <input type="text" id="prop-margin" placeholder="e.g., 10px">
                    
                    <button id="apply-props" class="btn-success" style="margin-top: 10px; width: 100%;"><i class="fas fa-check"></i> Apply Properties</button>
                `;

    propsPanel.innerHTML = html;

    const computedStyle =
      iframe.contentWindow.getComputedStyle(selectedElement);
    document.getElementById("prop-bg-color").value = rgbToHex(
      computedStyle.backgroundColor
    );
    document.getElementById("prop-color").value = rgbToHex(computedStyle.color);
    document.getElementById("prop-padding").value = computedStyle.padding;
    document.getElementById("prop-margin").value = computedStyle.margin;

    document
      .getElementById("apply-props")
      .addEventListener("click", applyProperties);
  }

  // Convert RGB to Hex
  function rgbToHex(rgb) {
    if (!rgb || rgb === "rgba(0, 0, 0, 0)" || rgb === "transparent")
      return "#ffffff";

    const rgbValues = rgb.match(/\d+/g);
    if (!rgbValues || rgbValues.length < 3) return "#000000";

    return (
      "#" +
      (
        (1 << 24) +
        (parseInt(rgbValues[0]) << 16) +
        (parseInt(rgbValues[1]) << 8) +
        parseInt(rgbValues[2])
      )
        .toString(16)
        .slice(1)
    );
  }

  // Get darker color for hover states
  function getDarkerColor(hex) {
    let r = parseInt(hex.slice(1, 3), 16);
    let g = parseInt(hex.slice(3, 5), 16);
    let b = parseInt(hex.slice(5, 7), 16);

    r = Math.max(0, r - 30);
    g = Math.max(0, g - 30);
    b = Math.max(0, b - 30);

    return (
      "#" +
      r.toString(16).padStart(2, "0") +
      g.toString(16).padStart(2, "0") +
      b.toString(16).padStart(2, "0")
    );
  }

  // Apply properties from panel to element
  function applyProperties() {
    if (selectedElements.size === 0 && !selectedElement) return;

    const applyTo = selectedElements.size
      ? Array.from(selectedElements)
      : [selectedElement];

    applyTo.forEach((selected) => {
      selected.textContent = document.getElementById("prop-text").value;
      selected.id = document.getElementById("prop-id").value;
      selected.className = document.getElementById("prop-class").value;

      if (selected.tagName.toLowerCase() === "img") {
        selected.src = document.getElementById("prop-src").value;
        selected.alt = document.getElementById("prop-alt").value;
      }
      if (selected.tagName.toLowerCase() === "a") {
        selected.href = document.getElementById("prop-href").value;
      }

      selected.style.backgroundColor =
        document.getElementById("prop-bg-color").value;
      selected.style.color = document.getElementById("prop-color").value;
      selected.style.padding = document.getElementById("prop-padding").value;
      selected.style.margin = document.getElementById("prop-margin").value;
    });

    refreshCodePreview();
    pushHistory("apply-props");
  }

  // Refresh code preview
  function refreshCodePreview() {
    const doc = iframe.contentDocument;
    const designRoot = doc.getElementById("designRoot");
    document.getElementById("html-code").textContent = designRoot.innerHTML;
  }

  // push current snapshot into history (call after each user action that mutates designRoot)
  function pushHistory(label = "") {
    if (isUserInteracting) return;
    try {
      const doc = iframe.contentDocument;
      const designRoot = doc.getElementById("designRoot");
      // trim future if we undid some steps
      if (historyIndex < history.length - 1)
        history = history.slice(0, historyIndex + 1);
      history.push({
        html: designRoot.innerHTML,
        timestamp: Date.now(),
        label,
      });
      historyIndex = history.length - 1;
      // optional: limit history length
      if (history.length > 60)
        history.shift(), (historyIndex = history.length - 1);
      updateHistoryButtons();
    } catch (e) {
      console.warn("pushHistory failed", e);
    }
  }

  function restoreFromHistory(idx) {
    if (idx < 0 || idx >= history.length) return;
    const snapshot = history[idx];
    const doc = iframe.contentDocument;
    const designRoot = doc.getElementById("designRoot");
    isUserInteracting = true;
    designRoot.innerHTML = snapshot.html;
    // clear selections (nodes changed)
    selectedElements.clear();
    selectedElement = null;
    updateSelectedInfo();
    refreshCodePreview();
    updateElementCount();
    // slight delay to let iframe reflow then re-enable
    setTimeout(() => {
      isUserInteracting = false;
    }, 40);
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
    const undoBtn = document.getElementById("undo-btn");
    const redoBtn = document.getElementById("redo-btn");
    if (!undoBtn || !redoBtn) return;
    undoBtn.disabled = historyIndex <= 0;
    redoBtn.disabled = historyIndex >= history.length - 1;
    undoBtn.style.opacity = undoBtn.disabled ? 0.5 : 1;
    redoBtn.style.opacity = redoBtn.disabled ? 0.5 : 1;
  }

  // ---------- Panel Resizers ----------
  function initResizers() {
    const resizerLeft = document.getElementById("resizer-left");
    const resizerRight = document.getElementById("resizer-right");
    const leftPanel = document.querySelector(".left-panel");
    const rightPanel = document.querySelector(".right-panel");
    const centerPanel = document.querySelector(".center-panel");

    function startDrag(e, which) {
      e.preventDefault();
      const startX = e.clientX || (e.touches && e.touches[0].clientX);
      const leftStart = leftPanel.getBoundingClientRect().width;
      const rightStart = rightPanel.getBoundingClientRect().width;

      function onMove(moveEvent) {
        const currentX =
          moveEvent.clientX ||
          (moveEvent.touches && moveEvent.touches[0].clientX);
        const dx = currentX - startX;
        if (which === "left") {
          const newLeft = Math.max(180, leftStart + dx); // set min width
          leftPanel.style.width = newLeft + "px";
        } else if (which === "right") {
          const newRight = Math.max(180, rightStart - dx); // moving left reduces right panel
          rightPanel.style.width = newRight + "px";
        }
      }

      function endDrag() {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", endDrag);
        document.removeEventListener("touchmove", onMove);
        document.removeEventListener("touchend", endDrag);
      }

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", endDrag);
      document.addEventListener("touchmove", onMove, { passive: true });
      document.addEventListener("touchend", endDrag);
    }

    if (resizerLeft) {
      resizerLeft.addEventListener("mousedown", (e) => startDrag(e, "left"));
      resizerLeft.addEventListener("touchstart", (e) => startDrag(e, "left"), {
        passive: true,
      });
    }
    if (resizerRight) {
      resizerRight.addEventListener("mousedown", (e) => startDrag(e, "right"));
      resizerRight.addEventListener(
        "touchstart",
        (e) => startDrag(e, "right"),
        { passive: true }
      );
    }
  }

  // Undo / Redo buttons
  document.getElementById("undo-btn").addEventListener("click", undo);
  document.getElementById("redo-btn").addEventListener("click", redo);

  // Keyboard shortcuts on parent window
  document.addEventListener("keydown", function (e) {
    const z = e.key === "z" || e.key === "Z";
    const y = e.key === "y" || e.key === "Y";
    const isMod = e.ctrlKey || e.metaKey;
    if (!isMod) return;
    if (isMod && z && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if (isMod && (y || (z && e.shiftKey))) {
      e.preventDefault();
      redo();
    }
  });
});
