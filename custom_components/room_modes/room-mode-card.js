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
              <button class="drawer-button icon-button" type="button" aria-label="Show action details">
                <ha-icon icon="mdi:chevron-down"></ha-icon>
              </button>
            </div>
          </div>
          <div class="room-mode-hero">
            <div class="room-mode-hero-icon-wrap">
              <ha-icon class="room-mode-hero-icon"></ha-icon>
            </div>
          </div>
          <div class="room-mode-action-strip"></div>
          <div class="room-mode-drawer" hidden></div>
        </div>
      </ha-card>
    `;

    this._card = this.querySelector("ha-card");
    this._title = this.querySelector(".room-mode-title");
    this._stateText = this.querySelector(".room-mode-state-text");
    this._heroIcon = this.querySelector(".room-mode-hero-icon");
    this._drawerButton = this.querySelector(".drawer-button");
    this._actionStrip = this.querySelector(".room-mode-action-strip");
    this._drawer = this.querySelector(".room-mode-drawer");

    this._card.addEventListener("click", (event) => {
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

    this._drawer.hidden = !this._drawerOpen;
    this._drawer.innerHTML = this._drawerOpen ? steps.map((step) => this._renderStep(step, running)).join("") : "";
    this._drawerButton.classList.toggle("open", this._drawerOpen);
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
