document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", function () {
    const tab = this.dataset.tab;
    document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tool-section").forEach((s) => s.classList.remove("active"));
    this.classList.add("active");
    document.getElementById(tab).classList.add("active");
  });
});

(function () {
  const canvas = document.getElementById("starsCanvas");
  const ctx = canvas.getContext("2d");
  let W, H, stars = [], shooters = [], nebulaPoints = [];

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
    buildStars();
    buildNebula();
  }

  function buildStars() {
    stars = [];
    const density = (W * H) / 4200;
    for (let i = 0; i < density; i++) {
      const tier = Math.random();
      stars.push({
        x: Math.random() * W, y: Math.random() * H,
        r: tier < 0.65 ? Math.random() * 0.8 + 0.15 : tier < 0.9 ? Math.random() * 1.3 + 0.6 : Math.random() * 2.2 + 1.2,
        baseA: tier < 0.65 ? Math.random() * 0.35 + 0.08 : tier < 0.9 ? Math.random() * 0.5 + 0.2 : Math.random() * 0.65 + 0.35,
        speed: Math.random() * 0.006 + 0.001,
        phase: Math.random() * Math.PI * 2,
        hue: Math.random() < 0.15 ? (Math.random() < 0.5 ? 200 : 40) : 0,
        spike: tier > 0.9 && Math.random() < 0.4,
      });
    }
  }

  function buildNebula() {
    nebulaPoints = [
      { x: W * 0.12, y: H * 0.18, r: W * 0.28, hue: 270, a: 0.055 },
      { x: W * 0.82, y: H * 0.75, r: W * 0.22, hue: 240, a: 0.045 },
      { x: W * 0.55, y: H * 0.35, r: W * 0.18, hue: 300, a: 0.03 },
      { x: W * 0.3, y: H * 0.8, r: W * 0.2, hue: 260, a: 0.035 },
      { x: W * 0.9, y: H * 0.2, r: W * 0.15, hue: 220, a: 0.025 },
    ];
  }

  function spawnShooter() {
    const angle = Math.PI / 6 + (Math.random() * Math.PI) / 8;
    const speed = 7 + Math.random() * 9;
    shooters.push({
      x: Math.random() * W * 1.2 - W * 0.1, y: Math.random() * H * 0.4,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      len: 80 + Math.random() * 120, alpha: 0.9,
      fade: 0.012 + Math.random() * 0.008, r: 0.8 + Math.random() * 0.7,
    });
  }

  function drawSpike(x, y, r, a) {
    const s = r * 3.5;
    ctx.save();
    ctx.globalAlpha = a * 0.55;
    const gH = ctx.createLinearGradient(x - s, y, x + s, y);
    gH.addColorStop(0, "transparent");
    gH.addColorStop(0.5, `rgba(220,200,255,${a})`);
    gH.addColorStop(1, "transparent");
    ctx.strokeStyle = gH;
    ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(x - s, y); ctx.lineTo(x + s, y); ctx.stroke();
    const gV = ctx.createLinearGradient(x, y - s, x, y + s);
    gV.addColorStop(0, "transparent");
    gV.addColorStop(0.5, `rgba(220,200,255,${a})`);
    gV.addColorStop(1, "transparent");
    ctx.strokeStyle = gV;
    ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x, y + s); ctx.stroke();
    ctx.restore();
  }

  let t = 0, nextShoot = 180 + Math.random() * 240;

  function draw() {
    ctx.clearRect(0, 0, W, H);
    t++;
    nebulaPoints.forEach((n) => {
      const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
      g.addColorStop(0, `hsla(${n.hue},75%,42%,${n.a})`);
      g.addColorStop(0.45, `hsla(${n.hue},65%,35%,${n.a * 0.4})`);
      g.addColorStop(1, "transparent");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.fill();
    });
    stars.forEach((s) => {
      const tw = 0.5 + 0.5 * Math.sin(t * s.speed * 60 + s.phase);
      const a = s.baseA * (0.55 + 0.45 * tw);
      if (s.r > 1.5) {
        const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 5);
        const col = s.hue === 200 ? "rgba(130,190,255," : s.hue === 40 ? "rgba(255,220,120," : "rgba(200,170,255,";
        g.addColorStop(0, col + a * 0.45 + ")"); g.addColorStop(1, "transparent");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 5, 0, Math.PI * 2); ctx.fill();
      }
      const col = s.hue === 200 ? `rgba(160,210,255,${a})` : s.hue === 40 ? `rgba(255,230,150,${a})` : `rgba(215,195,255,${a})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
      if (s.spike && tw > 0.7) drawSpike(s.x, s.y, s.r, a * tw);
    });
    if (t >= nextShoot) { spawnShooter(); nextShoot = t + 200 + Math.random() * 300; }
    shooters.forEach((sh) => {
      const tailX = sh.x - Math.cos(Math.atan2(sh.vy, sh.vx)) * sh.len;
      const tailY = sh.y - Math.sin(Math.atan2(sh.vy, sh.vx)) * sh.len;
      const g = ctx.createLinearGradient(tailX, tailY, sh.x, sh.y);
      g.addColorStop(0, "transparent");
      g.addColorStop(0.6, `rgba(200,180,255,${sh.alpha * 0.3})`);
      g.addColorStop(1, `rgba(240,230,255,${sh.alpha})`);
      ctx.beginPath(); ctx.moveTo(tailX, tailY); ctx.lineTo(sh.x, sh.y);
      ctx.strokeStyle = g; ctx.lineWidth = sh.r; ctx.lineCap = "round"; ctx.stroke();
      const hg = ctx.createRadialGradient(sh.x, sh.y, 0, sh.x, sh.y, 6);
      hg.addColorStop(0, `rgba(255,255,255,${sh.alpha})`); hg.addColorStop(1, "transparent");
      ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(sh.x, sh.y, 6, 0, Math.PI * 2); ctx.fill();
      sh.x += sh.vx; sh.y += sh.vy; sh.alpha -= sh.fade;
    });
    shooters = shooters.filter((sh) => sh.alpha > 0 && sh.x < W + 200 && sh.y < H + 200);
    requestAnimationFrame(draw);
  }

  resize();
  draw();
  window.addEventListener("resize", resize);
})();

function copyText(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    btn.textContent = "✓ اتنسخ";
    btn.classList.add("copied");
    setTimeout(() => { btn.textContent = "نسخ"; btn.classList.remove("copied"); }, 2000);
  });
}

const iconUp = `🔼`;
const iconDown = `🔽`;
const iconEdit = `✏️`;
const iconDel = `🗑️`;

(function () {
  let state = [];
  let editingId = null;
  let currentType = null;

  const modal = document.getElementById("cv2Modal");
  const modalTitle = document.getElementById("cv2ModalTitle");
  const modalBody = document.getElementById("cv2ModalBody");
  const modalSave = document.getElementById("cv2ModalSave");
  const cv2List = document.getElementById("cv2List");
  const cv2Preview = document.getElementById("cv2Preview");
  const cv2Code = document.getElementById("cv2Code");
  const cv2CopyBtn = document.getElementById("cv2CopyBtn");

  const typeNames = {
    text: { label: "📝 نص" },
    actionRow: { label: "🔘 أزرار" },
    select: { label: "📋 قائمة" },
    separator: { label: "➖ فاصل" },
    media: { label: "🖼️ صورة" },
    section: { label: "📌 Section" },
  };

  const styleOptions = ["Primary", "Secondary", "Success", "Danger"];

  function uid() {
    return Math.random().toString(36).slice(2, 8);
  }

  function openModal(type, existingData) {
    currentType = type;
    editingId = existingData ? existingData.id : null;
    modalTitle.textContent = (editingId ? "عدّل" : "ضيف") + " — " + typeNames[type].label;

    if (type === "text") {
      modalBody.innerHTML = `
        <div class="control-group">
          <label>النص</label>
          <textarea id="mfContent" rows="4" placeholder="محتوى الـ TextDisplay...">${existingData ? escHtml(existingData.content) : ""}</textarea>
        </div>`;
    } else if (type === "separator") {
      modalBody.innerHTML = `<p style="color:var(--text-muted);font-size:.9rem;padding:8px 0">الفاصل مفيش له إعدادات.</p>`;
    } else if (type === "media") {
      modalBody.innerHTML = `
        <div class="control-group">
          <label>رابط الصورة</label>
          <input id="mfUrl" type="text" placeholder="https://..." value="${existingData ? escHtml(existingData.url) : ""}" />
        </div>`;
    } else if (type === "section") {
      modalBody.innerHTML = `
        <div class="control-group">
          <label>النص</label>
          <textarea id="mfSectionContent" rows="3" placeholder="نص الـ Section...">${existingData ? escHtml(existingData.content) : ""}</textarea>
        </div>
        <div class="control-group">
          <label>رابط الصورة الجانبية</label>
          <input id="mfThumb" type="text" placeholder="https://..." value="${existingData ? escHtml(existingData.thumbUrl) : ""}" />
        </div>`;
    } else if (type === "actionRow") {
      const btns = existingData ? existingData.buttons : [{ id: uid(), label: "زر", style: "Primary" }];
      modalBody.innerHTML = `
        <span class="mf-section-label">الأزرار (لحد 5)</span>
        <div id="mfBtnList"></div>
        <button class="mf-add-btn" id="mfAddBtn">+ زر جديد</button>`;
      const list = document.getElementById("mfBtnList");
      btns.forEach((b) => appendBtnRow(list, b));
      document.getElementById("mfAddBtn").onclick = () => {
        if (list.children.length < 5) appendBtnRow(list, { id: uid(), label: "زر", style: "Primary" });
      };
    } else if (type === "select") {
      const opts = existingData ? existingData.options : [{ label: "خيار 1", value: "option_1" }];
      modalBody.innerHTML = `
        <div class="control-group">
          <label>Custom ID</label>
          <input id="mfSelId" type="text" placeholder="my_select" value="${existingData ? escHtml(existingData.customId) : ""}" />
        </div>
        <div class="control-group">
          <label>Placeholder</label>
          <input id="mfSelPlaceholder" type="text" placeholder="اختر من القائمة..." value="${existingData ? escHtml(existingData.placeholder) : ""}" />
        </div>
        <span class="mf-section-label">الخيارات</span>
        <div id="mfOptList"></div>
        <button class="mf-add-btn" id="mfAddOpt">+ خيار جديد</button>`;
      const list = document.getElementById("mfOptList");
      opts.forEach((o) => appendOptRow(list, o));
      document.getElementById("mfAddOpt").onclick = () => appendOptRow(list, { label: "", value: "" });
    }

    modal.classList.add("open");
  }

  function appendBtnRow(container, btn) {
    const div = document.createElement("div");
    div.className = "mf-row";
    div.innerHTML = `
      <input class="mf-btn-id" type="text" placeholder="custom_id" value="${escHtml(btn.id)}" />
      <input class="mf-btn-label" type="text" placeholder="النص" value="${escHtml(btn.label)}" />
      <select class="mf-btn-style">${styleOptions.map((s) => `<option value="${s}"${s === btn.style ? " selected" : ""}>${s}</option>`).join("")}</select>
      <button class="mf-remove">✕</button>`;
    div.querySelector(".mf-remove").onclick = () => div.remove();
    container.appendChild(div);
  }

  function appendOptRow(container, opt) {
    const div = document.createElement("div");
    div.className = "mf-row";
    div.style.gridTemplateColumns = "1fr 1fr auto";
    div.innerHTML = `
      <input class="mf-opt-label" type="text" placeholder="النص" value="${escHtml(opt.label)}" />
      <input class="mf-opt-value" type="text" placeholder="القيمة" value="${escHtml(opt.value)}" dir="ltr" />
      <button class="mf-remove">✕</button>`;
    div.querySelector(".mf-remove").onclick = () => div.remove();
    container.appendChild(div);
  }

  function collectData() {
    const type = currentType;
    if (type === "text") {
      return { content: document.getElementById("mfContent").value || "نص" };
    } else if (type === "separator") {
      return {};
    } else if (type === "media") {
      return { url: document.getElementById("mfUrl").value };
    } else if (type === "section") {
      return {
        content: document.getElementById("mfSectionContent").value || "نص",
        thumbUrl: document.getElementById("mfThumb").value,
      };
    } else if (type === "actionRow") {
      const rows = document.querySelectorAll("#mfBtnList .mf-row");
      const buttons = [...rows].map((r) => ({
        id: r.querySelector(".mf-btn-id").value || uid(),
        label: r.querySelector(".mf-btn-label").value || "زر",
        style: r.querySelector(".mf-btn-style").value,
      }));
      return { buttons: buttons.length ? buttons : [{ id: uid(), label: "زر", style: "Primary" }] };
    } else if (type === "select") {
      const rows = document.querySelectorAll("#mfOptList .mf-row");
      const options = [...rows].map((r) => ({
        label: r.querySelector(".mf-opt-label").value || "خيار",
        value: r.querySelector(".mf-opt-value").value || "value",
      }));
      return {
        customId: document.getElementById("mfSelId").value || "my_select",
        placeholder: document.getElementById("mfSelPlaceholder").value || "اختر...",
        options: options.length ? options : [{ label: "خيار", value: "value" }],
      };
    }
    return {};
  }

  modalSave.onclick = () => {
    const data = collectData();
    if (editingId) {
      const idx = state.findIndex((i) => i.id === editingId);
      if (idx !== -1) state[idx].data = data;
    } else {
      state.push({ id: uid(), type: currentType, data });
    }
    modal.classList.remove("open");
    render();
  };

  document.getElementById("cv2ModalClose").onclick = () => modal.classList.remove("open");
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.remove("open"); });

  document.querySelectorAll(".palette-btn").forEach((btn) => {
    btn.addEventListener("click", () => openModal(btn.dataset.type));
  });

  function render() {
    renderList();
    renderPreview();
    renderCode();
  }

  function renderList() {
    if (!state.length) {
      cv2List.innerHTML = '<div class="cv2-empty-list">اضغط على المكون اللي عايزه</div>';
      return;
    }
    cv2List.innerHTML = state.map((item, i) => {
      const meta = typeNames[item.type];
      let preview = "";
      if (item.type === "text") preview = item.data.content.slice(0, 30);
      else if (item.type === "actionRow") preview = item.data.buttons.map((b) => b.label).join(" · ");
      else if (item.type === "select") preview = item.data.placeholder;
      else if (item.type === "media") preview = item.data.url ? "صورة" : "بدون رابط";
      else if (item.type === "section") preview = item.data.content.slice(0, 25);
      return `<div class="cv2-item" data-id="${item.id}">
        <div class="cv2-item-info">
          <span class="cv2-item-name">${meta.label}</span>
          ${preview ? `<span class="cv2-item-preview">${escHtml(preview)}</span>` : ""}
        </div>
        <div class="cv2-item-actions">
          ${i > 0 ? `<button class="cv2-item-btn" data-action="up" data-id="${item.id}" title="لفوق">${iconUp}</button>` : ""}
          ${i < state.length - 1 ? `<button class="cv2-item-btn" data-action="down" data-id="${item.id}" title="لتحت">${iconDown}</button>` : ""}
          <button class="cv2-item-btn" data-action="edit" data-id="${item.id}" title="تعديل">${iconEdit}</button>
          <button class="cv2-item-btn del" data-action="del" data-id="${item.id}" title="حذف">${iconDel}</button>
        </div>
      </div>`;
    }).join("");
  }

  cv2List.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const { action, id } = btn.dataset;
    const idx = state.findIndex((i) => i.id === id);
    if (action === "del") {
      state.splice(idx, 1);
    } else if (action === "up" && idx > 0) {
      [state[idx - 1], state[idx]] = [state[idx], state[idx - 1]];
    } else if (action === "down" && idx < state.length - 1) {
      [state[idx], state[idx + 1]] = [state[idx + 1], state[idx]];
    } else if (action === "edit") {
      openModal(state[idx].type, { id, ...state[idx].data });
    }
    if (action !== "edit") render();
  });

  function renderPreview() {
    if (!state.length) {
      cv2Preview.innerHTML = '<div class="dc-empty-hint">ضيف مكونات الأول</div>';
      return;
    }
    const styleToClass = { Primary: "dc-btn-primary", Secondary: "dc-btn-secondary", Success: "dc-btn-success", Danger: "dc-btn-danger" };
    cv2Preview.innerHTML = state.map((item) => {
      if (item.type === "text") {
        return `<div class="dc-text-display">${escHtml(item.data.content)}</div>`;
      } else if (item.type === "separator") {
        return `<div class="dc-separator"></div>`;
      } else if (item.type === "actionRow") {
        const btns = item.data.buttons.map((b) => `<button class="dc-btn ${styleToClass[b.style] || "dc-btn-primary"}">${escHtml(b.label)}</button>`).join("");
        return `<div class="dc-action-row">${btns}</div>`;
      } else if (item.type === "select") {
        return `<div class="dc-select"><span>${escHtml(item.data.placeholder)}</span><svg width="16" height="16" viewBox="0 0 16 16"><path fill="currentColor" d="M4.427 7.427l3.396 3.396a.25.25 0 00.354 0l3.396-3.396A.25.25 0 0011.396 7H4.604a.25.25 0 00-.177.427z"/></svg></div>`;
      } else if (item.type === "media") {
        return item.data.url ? `<div class="dc-media-gallery"><img src="${escHtml(item.data.url)}" /></div>` : "";
      } else if (item.type === "section") {
        return `<div class="dc-section"><div class="dc-section-text">${escHtml(item.data.content)}</div>${item.data.thumbUrl ? `<img class="dc-section-thumb" src="${escHtml(item.data.thumbUrl)}" />` : ""}</div>`;
      }
      return "";
    }).join("");
    cv2Preview.querySelectorAll("img").forEach(img => img.addEventListener("error", () => img.remove(), { once: true }));
  }

  function renderCode() {
    if (!state.length) {
      cv2Code.textContent = "ضيف مكونات الأول عشان يتولد الكود";
      return;
    }
    const imports = buildImports();
    let chain = "const container = new ContainerBuilder()";
    state.forEach((item) => { chain += buildChainPart(item); });
    chain += `\n\nmessage.channel.send({\n  components: [container],\n  flags: MessageFlags.IsComponentsV2\n})`;
    cv2Code.textContent = imports + "\n\n" + chain;
  }

  function buildImports() {
    const needed = new Set(["ContainerBuilder", "MessageFlags"]);
    state.forEach((item) => {
      if (item.type === "actionRow") { needed.add("ButtonBuilder"); needed.add("ButtonStyle"); }
      if (item.type === "select") { needed.add("StringSelectMenuBuilder"); }
      if (item.type === "media") { needed.add("MediaGalleryItemBuilder"); }
    });
    return `const { ${[...needed].sort().join(", ")} } = require("discord.js")`;
  }

  function buildChainPart(item) {
    if (item.type === "text") {
      return `\n  .addTextDisplayComponents(text =>\n    text.setContent("${esc(item.data.content)}")\n  )`;
    } else if (item.type === "separator") {
      return `\n  .addSeparatorComponents(sep => sep)`;
    } else if (item.type === "actionRow") {
      const btnsCode = item.data.buttons.map((b) =>
        `      new ButtonBuilder()\n        .setCustomId("${esc(b.id)}")\n        .setLabel("${esc(b.label)}")\n        .setStyle(ButtonStyle.${b.style})`
      ).join(",\n");
      return `\n  .addActionRowComponents(row =>\n    row.setComponents(\n${btnsCode}\n    )\n  )`;
    } else if (item.type === "select") {
      const optsCode = item.data.options.map((o) =>
        `        { label: "${esc(o.label)}", value: "${esc(o.value)}" }`
      ).join(",\n");
      return `\n  .addActionRowComponents(row =>\n    row.setComponents(\n      new StringSelectMenuBuilder()\n        .setCustomId("${esc(item.data.customId)}")\n        .setPlaceholder("${esc(item.data.placeholder)}")\n        .addOptions([\n${optsCode}\n        ])\n    )\n  )`;
    } else if (item.type === "media") {
      return `\n  .addMediaGalleryComponents(media =>\n    media.addItems(\n      new MediaGalleryItemBuilder().setURL("${esc(item.data.url)}")\n    )\n  )`;
    } else if (item.type === "section") {
      return `\n  .addSectionComponents(section =>\n    section\n      .addTextDisplayComponents(text =>\n        text.setContent("${esc(item.data.content)}")\n      )\n      .setThumbnailAccessory(img =>\n        img.setURL("${esc(item.data.thumbUrl)}")\n      )\n  )`;
    }
    return "";
  }

  function esc(str) { return String(str || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r/g, "\\r").replace(/\n/g, "\\n").replace(/\t/g, "\\t"); }
  function escHtml(str) {
    return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  cv2CopyBtn.onclick = () => copyText(cv2Code.textContent, cv2CopyBtn);
})();

(function () {
  const fields = {
    url: document.getElementById("whUrl"),
    username: document.getElementById("whUsername"),
    title: document.getElementById("whTitle"),
    desc: document.getElementById("whDesc"),
    color: document.getElementById("whColor"),
    colorPicker: document.getElementById("whColorPicker"),
    footer: document.getElementById("whFooter"),
    image: document.getElementById("whImage"),
  };

  const preview = {
    name: document.getElementById("whPreviewName"),
    title: document.getElementById("whPreviewTitle"),
    desc: document.getElementById("whPreviewDesc"),
    img: document.getElementById("whPreviewImg"),
    footer: document.getElementById("whPreviewFooter"),
    bar: document.getElementById("whEmbedBar"),
  };

  const status = document.getElementById("whStatus");
  const sendBtn = document.getElementById("whSendBtn");

  function hexToInt(hex) {
    return parseInt(hex.replace("#", ""), 16);
  }

  function updatePreview() {
    const username = document.createTextNode(fields.username.value || "ThailandBot");
    const botBadge = document.createElement("span");
    botBadge.className = "dc-bot-badge";
    botBadge.textContent = "BOT";
    preview.name.replaceChildren(username, document.createTextNode(" "), botBadge);
    preview.title.textContent = fields.title.value || "";
    preview.desc.textContent = fields.desc.value || "";
    preview.footer.textContent = fields.footer.value || "";
    const color = fields.color.value || "#AA00FF";
    preview.bar.style.background = color;
    const img = fields.image.value.trim();
    if (img) { preview.img.src = img; preview.img.style.display = "block"; }
    else { preview.img.style.display = "none"; }
  }

  fields.colorPicker.addEventListener("input", () => {
    fields.color.value = fields.colorPicker.value.toUpperCase();
    updatePreview();
  });

  fields.color.addEventListener("input", () => {
    const val = fields.color.value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(val)) fields.colorPicker.value = val;
    updatePreview();
  });

  Object.values(fields).forEach((f) => {
    if (f && f !== fields.colorPicker && f !== fields.color) f.addEventListener("input", updatePreview);
  });

  updatePreview();

  sendBtn.addEventListener("click", async () => {
    const url = fields.url.value.trim();
    let parsedWebhook;
    try { parsedWebhook = new URL(url); } catch { parsedWebhook = null; }
    if (!parsedWebhook || parsedWebhook.protocol !== "https:" || parsedWebhook.hostname !== "discord.com" || parsedWebhook.username || parsedWebhook.password || parsedWebhook.search || parsedWebhook.hash || !/^\/api\/webhooks\/\d{17,20}\/[A-Za-z0-9._-]+\/?$/.test(parsedWebhook.pathname)) {
      showStatus("error", "حط رابط Webhook رسمي من discord.com/api/webhooks بشكل صحيح");
      return;
    }
    const title = fields.title.value.trim();
    const description = fields.desc.value.trim();
    const footer = fields.footer.value.trim();
    let imageUrl = "";
    if (fields.image.value.trim()) {
      try {
        const parsedImage = new URL(fields.image.value.trim());
        if (parsedImage.protocol !== "https:" || parsedImage.username || parsedImage.password) throw new Error("HTTPS image URL required");
        imageUrl = parsedImage.toString();
      } catch {
        showStatus("error", "رابط الصورة لازم يكون HTTPS صحيح");
        return;
      }
    }
    if (!title && !description && !footer && !imageUrl) {
      showStatus("error", "اكتب عنوان أو وصف أو Footer أو أضف صورة قبل الإرسال");
      return;
    }
    const color = hexToInt(fields.color.value || "#AA00FF");
    const body = {
      username: fields.username.value.trim() || undefined,
      embeds: [{
        title: title || undefined,
        description: description || undefined,
        color,
        image: imageUrl ? { url: imageUrl } : undefined,
        footer: footer ? { text: footer } : undefined,
      }],
    };
    sendBtn.textContent = "بيتبعت...";
    sendBtn.disabled = true;
    try {
      const res = await fetch(parsedWebhook.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok || res.status === 204) {
        showStatus("success", "اتبعت بنجاح!");
      } else {
        const json = await res.json().catch(() => ({}));
        showStatus("error", `خطأ ${res.status}: ${json.message || "فشل الإرسال"}`);
      }
    } catch (e) {
      showStatus("error", "في مشكلة في الاتصال — اتأكد من الـ URL");
    }
    sendBtn.textContent = "ابعت للـ Webhook ↗";
    sendBtn.disabled = false;
  });

  function showStatus(type, msg) {
    status.className = "wh-status " + type;
    status.textContent = msg;
  }
})();