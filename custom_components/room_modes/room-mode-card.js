class RoomModeCard extends HTMLElement {
  constructor() {
    super();
    this._drawerOpen = false;
  }

  setConfig(config) {
    if (!config.entity) {
      throw new Error("You need to define an entity");
    }
    this._config = {
      title: "",
      show_targets: true,
      ...config,
    };
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._card) {
      this._renderBase();
    }
    this._renderState();
  }

  getCardSize() {
    return 3;
  }

  _renderBase() {
    this.innerHTML = `
      <ha-card class="room-mode-card">
        <div class="room-mode-shell">
          <div class="room-mode-header">
            <div class="room-mode-head-main">
              <div class="room-mode-title"></div>
              <div class="room-mode-state-line">
                <span class="room-mode-state-text"></span>
              </div>
            </div>
            <div class="room-mode-header-actions">
              <button class="help-button icon-button" type="button" aria-label="Show documentation" hidden>
                <ha-icon icon="mdi:help-circle-outline"></ha-icon>
              </button>
              <button class="drawer-button icon-button" type="button" aria-label="Show action details">
                <ha-icon icon="mdi:chevron-down"></ha-icon>
              </button>
            </div>
          </div>
          <div class="room-mode-hero">
            <div class="room-mode-hero-icon-wrap">
              <ha-icon class="room-mode-hero-icon"></ha-icon>
            </div>
            <div class="room-mode-controls"></div>
          </div>
          <div class="room-mode-action-strip"></div>
          <div class="room-mode-drawer" hidden></div>
        </div>
        <dialog class="room-mode-help-dialog">
          <div class="help-dialog-header">
            <span class="help-dialog-title"></span>
            <button class="help-dialog-close icon-button" type="button" aria-label="Close">
              <ha-icon icon="mdi:close"></ha-icon>
            </button>
          </div>
          <div class="help-dialog-body"></div>
        </dialog>
      </ha-card>
    `;

    this._card = this.querySelector("ha-card");
    this._title = this.querySelector(".room-mode-title");
    this._stateText = this.querySelector(".room-mode-state-text");
    this._heroIcon = this.querySelector(".room-mode-hero-icon");
    this._drawerButton = this.querySelector(".drawer-button");
    this._actionStrip = this.querySelector(".room-mode-action-strip");
    this._controls = this.querySelector(".room-mode-controls");
    this._drawer = this.querySelector(".room-mode-drawer");
    this._helpButton = this.querySelector(".help-button");
    this._helpDialog = this.querySelector(".room-mode-help-dialog");
    this._helpDialogTitle = this.querySelector(".help-dialog-title");
    this._helpDialogBody = this.querySelector(".help-dialog-body");

    this._card.addEventListener("click", (event) => {
      if (event.target.closest(".room-mode-help-dialog")) {
        return;
      }

      const helpButton = event.target.closest(".help-button");
      if (helpButton) {
        event.stopPropagation();
        this._openHelp();
        return;
      }

      const controlButton = event.target.closest("[data-control-index]");
      if (controlButton) {
        event.stopPropagation();
        this._handleControl(controlButton);
        return;
      }

      const actionButton = event.target.closest("[data-action-type]");
      if (actionButton) {
        event.stopPropagation();
        this._handleActionButton(actionButton);
        return;
      }

      const drawerButton = event.target.closest(".drawer-button");
      if (drawerButton) {
        event.stopPropagation();
        this._drawerOpen = !this._drawerOpen;
        this._renderState();
        return;
      }

      this._handleRun();
    });

    this._helpDialog.addEventListener("click", (event) => {
      if (event.target.closest(".help-dialog-close")) {
        this._helpDialog.close();
        return;
      }
      if (event.target === this._helpDialog) {
        this._helpDialog.close();
      }
    });

    this._card.addEventListener("keydown", (event) => {
      if ((event.key === "Enter" || event.key === " ") && !event.target.closest("button")) {
        event.preventDefault();
        this._handleRun();
      }
    });

    const style = document.createElement("style");
    style.textContent = `
      .room-mode-card {
        cursor: pointer;
        border: 1px solid rgba(127, 127, 127, 0.2);
        background: rgba(24, 26, 32, 0.96);
        box-shadow: 0 10px 24px rgba(0, 0, 0, 0.22);
        transition: border-color 140ms ease, box-shadow 140ms ease, background 140ms ease, transform 140ms ease;
      }
      .room-mode-card:hover {
        transform: translateY(-1px);
      }
      .room-mode-card.mode-actionable {
        border-color: rgba(111, 99, 255, 0.6);
        box-shadow: 0 0 0 1px rgba(111, 99, 255, 0.18), 0 12px 26px rgba(46, 38, 122, 0.28);
        background: linear-gradient(180deg, rgba(58, 50, 132, 0.34), rgba(28, 29, 43, 0.96));
      }
      .room-mode-card.mode-enabled {
        border-color: rgba(56, 142, 60, 0.48);
        box-shadow: 0 0 0 1px rgba(56, 142, 60, 0.16), 0 10px 24px rgba(11, 45, 18, 0.24);
        background: linear-gradient(180deg, rgba(21, 58, 28, 0.52), rgba(22, 31, 24, 0.96));
      }
      .room-mode-card.mode-running {
        border-color: rgba(245, 124, 0, 0.55);
        box-shadow: 0 0 0 1px rgba(245, 124, 0, 0.18), 0 10px 24px rgba(77, 40, 5, 0.25);
        background: linear-gradient(180deg, rgba(78, 44, 11, 0.4), rgba(32, 25, 20, 0.96));
      }
      .room-mode-card.mode-failed {
        border-color: rgba(211, 47, 47, 0.52);
        box-shadow: 0 0 0 1px rgba(211, 47, 47, 0.16), 0 10px 24px rgba(72, 14, 14, 0.24);
        background: linear-gradient(180deg, rgba(73, 22, 22, 0.4), rgba(30, 23, 23, 0.96));
      }
      .room-mode-shell {
        padding: 12px;
        display: grid;
        gap: 8px;
        font-family: var(--primary-font-family);
      }
      .room-mode-header {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        align-items: start;
      }
      .room-mode-header-actions {
        display: flex;
        gap: 6px;
      }
      .room-mode-head-main {
        display: grid;
        gap: 2px;
      }
      .room-mode-title {
        font-size: 22px;
        font-weight: 700;
        line-height: 1.15;
      }
      .room-mode-state-line {
        min-height: 14px;
      }
      .room-mode-state-text {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      .room-mode-hero {
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 118px;
        position: relative;
      }
      .room-mode-hero-icon-wrap {
        width: 104px;
        height: 104px;
        border-radius: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.08);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
      }
      .room-mode-hero-icon {
        --mdc-icon-size: 64px;
        color: rgba(255, 255, 255, 0.92);
      }
      .room-mode-action-strip {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        justify-content: center;
        min-height: 30px;
      }
      .room-mode-drawer {
        display: grid;
        gap: 6px;
      }
      .step-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 8px;
        align-items: center;
        border-radius: 12px;
        padding: 8px 10px;
        background: rgba(255, 255, 255, 0.045);
        border: 1px solid rgba(255, 255, 255, 0.08);
      }
      .step-row.status-success {
        background: rgba(46, 125, 50, 0.2);
        border-color: rgba(70, 160, 76, 0.32);
      }
      .step-row.status-not_on {
        background: rgba(84, 74, 214, 0.22);
        border-color: rgba(117, 106, 255, 0.34);
      }
      .step-row.status-running {
        background: rgba(245, 124, 0, 0.2);
        border-color: rgba(255, 152, 54, 0.34);
      }
      .step-row.status-failed {
        background: rgba(211, 47, 47, 0.22);
        border-color: rgba(227, 87, 87, 0.34);
      }
      .step-label {
        min-width: 0;
        font-size: 14px;
        font-weight: 600;
      }
      .step-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        justify-content: end;
      }
      .icon-button {
        width: 30px;
        height: 30px;
        border: none;
        border-radius: 999px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: rgba(255, 255, 255, 0.08);
        color: rgba(235, 237, 242, 0.78);
        cursor: pointer;
        position: relative;
      }
      .action-button {
        border: 1px solid rgba(255, 255, 255, 0.1);
      }
      .action-button.status-success {
        background: rgba(64, 160, 70, 0.28);
        color: #8ae28f;
      }
      .action-button.status-not_on {
        background: rgba(97, 87, 240, 0.32);
        color: #c0bbff;
      }
      .action-button.status-failed {
        background: rgba(211, 47, 47, 0.3);
        color: #ffb1b1;
      }
      .action-button.status-running {
        background: rgba(245, 124, 0, 0.32);
        color: #ffd08e;
      }
      .action-button:disabled {
        opacity: 0.75;
        cursor: default;
      }
      .drawer-button.open {
        background: rgba(255, 255, 255, 0.14);
      }
      .drawer-button.open ha-icon {
        transform: rotate(180deg);
      }
      .drawer-button ha-icon {
        transition: transform 140ms ease;
      }
      .spinner {
        width: 14px;
        height: 14px;
        border: 2px solid currentColor;
        border-right-color: transparent;
        border-radius: 50%;
        animation: room-mode-spin 0.8s linear infinite;
      }
      .action-initial {
        font-size: 12px;
        font-weight: 700;
      }
      .status-success {
        color: #8ae28f;
      }
      .status-running {
        color: #ffd08e;
      }
      .status-failed {
        color: #ffb1b1;
      }
      .status-not_on {
        color: #d4d0ff;
      }
      .status-idle {
        color: rgba(235, 237, 242, 0.72);
      }
      .mode-actionable .room-mode-hero-icon-wrap {
        background: rgba(97, 87, 240, 0.18);
        border-color: rgba(151, 143, 255, 0.24);
      }
      .mode-enabled .room-mode-hero-icon-wrap {
        background: rgba(64, 160, 70, 0.18);
        border-color: rgba(138, 226, 143, 0.22);
      }
      .mode-running .room-mode-hero-icon-wrap {
        background: rgba(245, 124, 0, 0.18);
        border-color: rgba(255, 208, 142, 0.22);
      }
      .mode-failed .room-mode-hero-icon-wrap {
        background: rgba(211, 47, 47, 0.18);
        border-color: rgba(255, 177, 177, 0.2);
      }
      .room-mode-controls {
        position: absolute;
        right: 0;
        left: calc(50% + 52px);
        top: 0;
        bottom: 0;
        display: flex;
        flex-direction: column;
        gap: 8px;
        justify-content: center;
        align-items: center;
        pointer-events: none;
      }
      .room-mode-controls:empty {
        display: none;
      }
      .control-button {
        pointer-events: auto;
      }
      .control-button {
        height: 40px;
        min-width: 40px;
        padding: 0 14px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 999px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        background: rgba(255, 255, 255, 0.08);
        color: rgba(235, 237, 242, 0.85);
        cursor: pointer;
        font-size: 14px;
        font-weight: 600;
      }
      .control-button:active {
        background: rgba(255, 255, 255, 0.18);
      }
      .help-button[hidden] {
        display: none;
      }
      .room-mode-help-dialog {
        max-width: none;
        width: calc(100vw - 48px);
        max-height: calc(100vh - 48px);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 20px;
        background: rgba(24, 26, 32, 0.98);
        color: rgba(235, 237, 242, 0.92);
        padding: 0;
        box-shadow: 0 24px 48px rgba(0, 0, 0, 0.5);
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .room-mode-help-dialog:not([open]) {
        display: none;
      }
      .room-mode-help-dialog::backdrop {
        background: rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(4px);
      }
      .room-mode-help-dialog[open] {
        animation: help-dialog-in 200ms ease;
      }
      @keyframes help-dialog-in {
        from { opacity: 0; transform: scale(0.95) translateY(8px); }
        to { opacity: 1; transform: scale(1) translateY(0); }
      }
      .help-dialog-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 16px 12px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        flex-shrink: 0;
      }
      .help-dialog-title {
        font-size: 22px;
        font-weight: 700;
        line-height: 1.2;
      }
      .help-dialog-close {
        flex-shrink: 0;
      }
      .help-dialog-body {
        padding: 16px;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        overscroll-behavior: contain;
      }
      .help-dialog-body h1 {
        font-size: 26px;
        font-weight: 700;
        margin: 16px 0 8px;
        color: rgba(255, 255, 255, 0.95);
      }
      .help-dialog-body h1:first-child {
        margin-top: 0;
      }
      .help-dialog-body h2 {
        font-size: 22px;
        font-weight: 700;
        margin: 14px 0 6px;
        color: rgba(255, 255, 255, 0.92);
      }
      .help-dialog-body h2:first-child {
        margin-top: 0;
      }
      .help-dialog-body h3 {
        font-size: 19px;
        font-weight: 600;
        margin: 12px 0 4px;
        color: rgba(255, 255, 255, 0.88);
      }
      .help-dialog-body p {
        margin: 0 0 14px;
        line-height: 1.6;
        font-size: 18px;
        color: rgba(235, 237, 242, 0.82);
      }
      .help-dialog-body figure {
        margin: 12px 0;
      }
      .help-dialog-body img {
        max-width: 100%;
        border-radius: 12px;
        display: block;
      }
      .help-dialog-body figcaption {
        font-size: 15px;
        color: rgba(235, 237, 242, 0.55);
        margin-top: 6px;
        text-align: center;
      }
      .help-dialog-body ul {
        margin: 0 0 14px;
        padding-left: 24px;
        font-size: 18px;
        line-height: 1.6;
        color: rgba(235, 237, 242, 0.82);
      }
      .help-dialog-body li {
        margin-bottom: 4px;
      }
      .help-dialog-body a {
        color: #a5a0ff;
        text-decoration: none;
      }
      .help-dialog-body a:hover {
        text-decoration: underline;
      }
      .help-dialog-body strong {
        font-weight: 700;
        color: rgba(255, 255, 255, 0.95);
      }
      .help-columns {
        display: flex;
        gap: 20px;
        align-items: start;
        margin-bottom: 14px;
      }
      .help-columns-text {
        flex: 1;
        min-width: 0;
      }
      .help-columns-media {
        flex: 1;
        min-width: 0;
      }
      .help-columns-media img {
        width: 100%;
      }
      @keyframes room-mode-spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    `;
    this._card.appendChild(style);
  }

  _renderState() {
    const stateObj = this._hass.states[this._config.entity];
    if (!stateObj) {
      this._card.className = "room-mode-card mode-failed";
      this._title.textContent = this._config.title || "Room mode";
      this._stateText.textContent = "Entity missing";
      this._stateText.className = "room-mode-state-text status-failed";
      this._heroIcon.setAttribute("icon", "mdi:alert-circle-outline");
      this._actionStrip.innerHTML = "";
      this._drawer.hidden = true;
      this._drawer.innerHTML = "";
      return;
    }

    const attrs = stateObj.attributes || {};
    const steps = Array.isArray(attrs.steps) ? attrs.steps : [];
    const enabled = Boolean(attrs.enabled);
    const lastRunStatus = attrs.last_run_status || stateObj.state || "idle";
    const running = lastRunStatus === "running";

    this._card.className = `room-mode-card ${this._cardModeClass(enabled, lastRunStatus)}`;
    this._title.textContent =
      this._config.title || attrs.mode_name || stateObj.attributes.friendly_name || "Room mode";
    this._stateText.textContent = this._modeStateLabel(enabled, lastRunStatus);
    this._stateText.className = `room-mode-state-text ${this._statusClass(enabled, lastRunStatus)}`;
    this._heroIcon.setAttribute("icon", this._config.icon || attrs.icon || "mdi:button-cursor");
    this._actionStrip.innerHTML = this._renderActionStrip(steps, running);

    this._controls.innerHTML = this._renderControls();
    this._drawer.hidden = !this._drawerOpen;
    this._drawer.innerHTML = this._drawerOpen ? steps.map((step) => this._renderStep(step, running)).join("") : "";
    this._drawerButton.classList.toggle("open", this._drawerOpen);
    this._helpButton.hidden = !this._config.documentation;
  }

  _renderStep(step, running) {
    const actions = this._renderActions(step, running);
    return `
      <div class="step-row ${this._statusClass(false, step.status)}">
        <div class="step-label">${step.label}</div>
        <div class="step-actions">${actions}</div>
      </div>
    `;
  }

  _renderActionStrip(steps, running) {
    const icons = [];
    for (const step of steps) {
      const targets = Array.isArray(step.targets) ? step.targets : [];
      if (targets.length) {
        for (const target of targets) {
          icons.push(this._renderActionButton(step, target, running));
        }
      } else {
        icons.push(this._renderActionButton(step, null, running));
      }
    }
    return icons.join("");
  }

  _renderActions(step, running) {
    const targets = Array.isArray(step.targets) ? step.targets : [];
    if (targets.length) {
      return targets.map((target) => this._renderActionButton(step, target, running)).join("");
    }
    return this._renderActionButton(step, null, running);
  }

  _renderActionButton(step, target, running) {
    const status = target ? target.status : step.status;
    const icon = target?.icon || step.icon;
    const label = target?.label || step.label;
    const disabled = running || status === "running" || status === "success";
    const targetEntityId = target?.entity_id || "";
    const iconMarkup = status === "running"
      ? `<span class="spinner"></span>`
      : this._iconMarkup(icon, label);

    return `
      <button
        class="icon-button action-button status-${status}"
        type="button"
        title="${label}"
        aria-label="${label}"
        data-action-type="run-action"
        data-step="${step.id}"
        data-target="${targetEntityId}"
        ${disabled ? "disabled" : ""}
      >
        ${iconMarkup}
      </button>
    `;
  }

  _iconMarkup(icon, label) {
    if (icon) {
      return `<ha-icon icon="${icon}"></ha-icon>`;
    }
    const initial = (label || "?").trim().charAt(0).toUpperCase();
    return `<span class="action-initial">${initial}</span>`;
  }

  _renderControls() {
    const buttons = this._config.buttons;
    if (!Array.isArray(buttons) || !buttons.length) return "";
    return buttons
      .map(
        (btn, i) => `
      <button class="control-button" type="button" title="${btn.label || ""}" aria-label="${btn.label || ""}" data-control-index="${i}">
        ${btn.icon ? `<ha-icon icon="${btn.icon}"></ha-icon>` : `<span>${btn.label || ""}</span>`}
      </button>`
      )
      .join("");
  }

  _handleControl(button) {
    const index = parseInt(button.dataset.controlIndex, 10);
    const btn = this._config.buttons?.[index];
    if (!btn?.service) return;
    const [domain, service] = btn.service.split(".", 2);
    if (!domain || !service) return;
    this._hass.callService(domain, service, btn.service_data || {});
  }

  _openHelp() {
    const stateObj = this._hass.states[this._config.entity];
    const attrs = stateObj?.attributes || {};
    const title = this._config.title || attrs.mode_name || attrs.friendly_name || "Room mode";
    this._helpDialogTitle.textContent = title;
    this._helpDialogBody.innerHTML = this._parseDocumentation(this._config.documentation);
    this._helpDialog.showModal();
  }

  _parseDocumentation(md) {
    if (!md) return "";

    const esc = (s) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

    const fig = (src, alt, size) => {
      const style = size ? ` style="max-width:${size};width:fit-content"` : "";
      return `<figure class="help-figure"${style}><img src="${src}" alt="${alt}" loading="lazy">${alt ? `<figcaption>${alt}</figcaption>` : ""}</figure>`;
    };

    const inline = (text) => {
      let s = esc(text);
      s = s.replace(/!\[([^\]]*)\]\((\S+?)(?:\s+=(\S+?))?\)/g, (_, alt, src, size) => fig(src, alt, size));
      s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
      s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
      s = s.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>");
      return s;
    };

    const parseBlocks = (text) => {
      const blocks = text.split(/\n{2,}/);
      let html = "";
      for (const block of blocks) {
        const trimmed = block.trim();
        if (!trimmed) continue;

        const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
        if (headingMatch) {
          const level = headingMatch[1].length;
          html += `<h${level}>${inline(headingMatch[2])}</h${level}>`;
          continue;
        }

        const imgMatch = trimmed.match(/^!\[([^\]]*)\]\((\S+?)(?:\s+=(\S+?))?\)$/);
        if (imgMatch) {
          const alt = esc(imgMatch[1]);
          html += fig(imgMatch[2], alt, imgMatch[3]);
          continue;
        }

        const lines = trimmed.split("\n");
        if (lines.every((l) => /^\s*[-*]\s/.test(l))) {
          html += "<ul>";
          for (const line of lines) {
            html += `<li>${inline(line.replace(/^\s*[-*]\s+/, ""))}</li>`;
          }
          html += "</ul>";
          continue;
        }

        html += `<p>${inline(trimmed.replace(/\n/g, "<br>"))}</p>`;
      }
      return html;
    };

    let html = "";
    const parts = md.split(/\{columns\}|\{\/columns\}/);
    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 0) {
        html += parseBlocks(parts[i]);
      } else {
        const inner = parts[i];
        const imgRegex = /!\[([^\]]*)\]\((\S+?)(?:\s+=(\S+?))?\)/g;
        const images = [];
        let match;
        while ((match = imgRegex.exec(inner)) !== null) images.push(match);
        const textPart = inner.replace(/!\[([^\]]*)\]\((\S+?)(?:\s+=(\S+?))?\)/g, "").trim();
        const leftHtml = parseBlocks(textPart);
        let rightHtml = "";
        for (const m of images) {
          const alt = esc(m[1]);
          rightHtml += fig(m[2], alt, m[3]);
        }
        html += `<div class="help-columns"><div class="help-columns-text">${leftHtml}</div><div class="help-columns-media">${rightHtml}</div></div>`;
      }
    }

    return html;
  }

  _handleActionButton(button) {
    const modeId = this._modeId();
    const stepId = button.dataset.step;
    const targetEntityId = button.dataset.target;
    if (!modeId || !stepId) {
      return;
    }

    const payload = { mode: modeId, step: stepId };
    if (targetEntityId) {
      payload.target_entity_id = targetEntityId;
    }
    this._hass.callService("room_modes", "run_action", payload);
  }

  _handleRun() {
    const stateObj = this._hass.states[this._config.entity];
    const lastRunStatus = stateObj?.attributes?.last_run_status || stateObj?.state;
    if (lastRunStatus === "running") {
      return;
    }
    const modeId = this._modeId();
    if (!modeId) {
      return;
    }
    this._hass.callService("room_modes", "run_mode", { mode: modeId });
  }

  _modeId() {
    const stateObj = this._hass.states[this._config.entity];
    return this._config.mode || stateObj?.attributes?.mode_id;
  }

  _cardModeClass(enabled, lastRunStatus) {
    if (lastRunStatus === "running") {
      return "mode-running";
    }
    if (enabled) {
      return "mode-enabled";
    }
    if (lastRunStatus === "failed" || lastRunStatus === "partial") {
      return "mode-failed";
    }
    return "mode-actionable";
  }

  _modeStateLabel(enabled, lastRunStatus) {
    if (lastRunStatus === "running") {
      return "Running";
    }
    if (enabled) {
      return "Enabled";
    }
    if (lastRunStatus === "failed" || lastRunStatus === "partial") {
      return "Needs action";
    }
    return "Ready";
  }

  _statusClass(enabled, status) {
    if (enabled) {
      return "status-success";
    }
    return `status-${status || "idle"}`;
  }

  _formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  _capitalize(value) {
    if (!value) {
      return "";
    }
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  _statusLabel(value) {
    const labels = {
      idle: "Idle",
      pending: "Not run",
      running: "Running",
      success: "Success",
      partial: "Partial",
      failed: "Failed",
      skipped: "Blocked",
      not_on: "Not on",
    };
    return labels[value] || this._capitalize(value);
  }
}

customElements.define("room-mode-card", RoomModeCard);
