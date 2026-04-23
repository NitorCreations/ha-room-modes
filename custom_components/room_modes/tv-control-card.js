class TVControlCard extends HTMLElement {
  constructor() {
    super();
    this._config = {};
  }

  setConfig(config) {
    if (!config.sliders || !config.sliders.length) {
      throw new Error("You need to define at least one slider");
    }
    this._config = {
      tv_off_entity: null,
      tv_off_service: "automation.trigger",
      tv_off_service_data: { skip_condition: true },
      tv_off_label: "TV Off",
      ...config,
    };
  }

  connectedCallback() {
    requestAnimationFrame(() => {
      if (!this._sectionStylesInjected) {
        this._injectSectionStyles();
      }
      this._matchSiblingHeight();
    });
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._card) {
      this._renderBase();
    }
    this._updateState();
  }

  getCardSize() {
    return 6;
  }

  _renderBase() {
    const sliderCount = this._config.sliders.length;

    this.innerHTML = `
      <ha-card class="tv-control-card">
        <div class="tv-control-shell">
          ${this._config.tv_off_entity ? `
          <button class="tv-off-btn" type="button" aria-label="${this._config.tv_off_label}">
            <ha-icon icon="mdi:television-off"></ha-icon>
            <span class="tv-off-label">${this._config.tv_off_label}</span>
          </button>
          ` : ""}
          <div class="slider-group slider-count-${sliderCount}">
            ${this._config.sliders.map((s, i) => `
              <div class="slider-column" data-index="${i}">
                <div class="slider-track-wrap">
                  <div class="slider-fill" data-index="${i}"></div>
                  <input
                    type="range"
                    class="vertical-slider"
                    data-index="${i}"
                    min="0"
                    max="100"
                    value="0"
                    orient="vertical"
                  />
                </div>
                <div class="slider-value" data-index="${i}">0%</div>
                <div class="slider-label">${s.label || "Volume"}</div>
              </div>
            `).join("")}
          </div>
        </div>
      </ha-card>
    `;

    this._card = this.querySelector("ha-card");
    this._sliderTracks = this.querySelectorAll(".slider-track-wrap");

    // TV off button
    const tvOffBtn = this.querySelector(".tv-off-btn");
    if (tvOffBtn) {
      tvOffBtn.addEventListener("click", () => this._handleTvOff());
    }

    // Slider inputs
    this._sliders = this.querySelectorAll(".vertical-slider");
    this._fills = this.querySelectorAll(".slider-fill");
    this._values = this.querySelectorAll(".slider-value");

    for (const slider of this._sliders) {
      slider.addEventListener("input", (e) => {
        const idx = parseInt(e.target.dataset.index, 10);
        const value = parseInt(e.target.value, 10);
        this._fills[idx].style.height = `${value}%`;
        this._values[idx].textContent = `${value}%`;
        this._setVolume(idx, value);
      });
    }

    const style = document.createElement("style");
    style.textContent = `
      .tv-control-card {
        border: 1px solid rgba(127, 127, 127, 0.2);
        background: rgba(24, 26, 32, 0.96);
        box-shadow: 0 10px 24px rgba(0, 0, 0, 0.22);
      }
      .tv-control-shell {
        padding: 12px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
      }
      .tv-off-btn {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 10px 16px;
        border: 1px solid rgba(211, 47, 47, 0.35);
        border-radius: 12px;
        background: rgba(211, 47, 47, 0.12);
        color: #ff8a8a;
        cursor: pointer;
        font-family: var(--primary-font-family);
        font-size: 14px;
        font-weight: 600;
        transition: background 140ms ease, border-color 140ms ease;
      }
      .tv-off-btn:hover {
        background: rgba(211, 47, 47, 0.22);
        border-color: rgba(211, 47, 47, 0.5);
      }
      .tv-off-btn:active {
        background: rgba(211, 47, 47, 0.32);
      }
      .tv-off-btn ha-icon {
        --mdc-icon-size: 22px;
      }
      .slider-group {
        display: flex;
        gap: 20px;
        justify-content: center;
        width: 100%;
      }
      .slider-column {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
      }
      .slider-track-wrap {
        position: relative;
        width: 48px;
        height: 300px;
        border-radius: 24px;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.08);
        overflow: hidden;
        transition: height 200ms ease;
      }
      .slider-count-2 .slider-track-wrap {
        width: 40px;
      }
      .slider-count-3 .slider-track-wrap {
        width: 32px;
        border-radius: 16px;
      }
      .slider-count-3 {
        gap: 10px;
      }
      .slider-count-3 .slider-label {
        font-size: 10px;
      }
      .slider-fill {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 0%;
        background: linear-gradient(to top, rgba(111, 99, 255, 0.5), rgba(111, 99, 255, 0.25));
        border-radius: 24px;
        transition: height 80ms ease-out;
        pointer-events: none;
      }
      .vertical-slider {
        writing-mode: vertical-lr;
        direction: rtl;
        appearance: none;
        -webkit-appearance: none;
        width: 100%;
        height: 100%;
        margin: 0;
        padding: 0;
        background: transparent;
        cursor: pointer;
        position: relative;
        z-index: 1;
      }
      .vertical-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 48px;
        height: 6px;
        border-radius: 3px;
        background: rgba(255, 255, 255, 0.85);
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
        cursor: grab;
      }
      .vertical-slider::-moz-range-thumb {
        width: 48px;
        height: 6px;
        border-radius: 3px;
        border: none;
        background: rgba(255, 255, 255, 0.85);
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
        cursor: grab;
      }
      .vertical-slider::-webkit-slider-runnable-track {
        background: transparent;
      }
      .vertical-slider::-moz-range-track {
        background: transparent;
      }
      .slider-count-2 .vertical-slider::-webkit-slider-thumb {
        width: 40px;
      }
      .slider-count-2 .vertical-slider::-moz-range-thumb {
        width: 40px;
      }
      .slider-count-3 .vertical-slider::-webkit-slider-thumb {
        width: 32px;
      }
      .slider-count-3 .vertical-slider::-moz-range-thumb {
        width: 32px;
      }
      .slider-value {
        font-size: 13px;
        font-weight: 700;
        color: rgba(235, 237, 242, 0.72);
        font-family: var(--primary-font-family);
      }
      .slider-label {
        font-size: 12px;
        font-weight: 600;
        color: rgba(235, 237, 242, 0.55);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        font-family: var(--primary-font-family);
      }
    `;
    this._card.appendChild(style);
  }

  _matchSiblingHeight() {
    // Find the sibling section (room modes grid) and match our height to it
    if (!this._sliderTracks || !this._sliderTracks.length) return;
    let el = this;
    for (let i = 0; i < 20; i++) {
      el = el.parentElement || el.getRootNode()?.host;
      if (!el) break;
      if (el.classList?.contains("section")) {
        // Found our section wrapper — find sibling section
        const sibling = el.previousElementSibling || el.nextElementSibling;
        if (sibling && sibling.classList.contains("section")) {
          const setHeight = () => {
            const targetHeight = sibling.getBoundingClientRect().height;
            const cardHeight = this._card.getBoundingClientRect().height;
            const trackHeight = this._sliderTracks[0].getBoundingClientRect().height;
            const nonSlider = cardHeight - trackHeight;
            const h = `${Math.max(120, targetHeight - nonSlider)}px`;
            for (const track of this._sliderTracks) {
              track.style.height = h;
            }
          };
          setHeight();

          // Watch for resize changes
          if (!this._resizeObserver) {
            this._resizeObserver = new ResizeObserver(() => setHeight());
            this._resizeObserver.observe(sibling);
          }
        }
        break;
      }
    }
  }

  _updateState() {
    if (!this._sliders) return;

    for (let i = 0; i < this._config.sliders.length; i++) {
      const cfg = this._config.sliders[i];
      const stateObj = this._hass.states[cfg.entity];
      if (!stateObj) continue;

      const volume = stateObj.attributes.volume_level || 0;
      const pct = Math.round(volume * 100);
      this._sliders[i].value = pct;
      this._fills[i].style.height = `${pct}%`;
      this._values[i].textContent = `${pct}%`;
    }
  }

  _setVolume(index, pct) {
    const cfg = this._config.sliders[index];
    if (!cfg) return;
    this._hass.callService("media_player", "volume_set", {
      entity_id: cfg.entity,
      volume_level: pct / 100,
    });
  }

  _handleTvOff() {
    if (!this._config.tv_off_entity) return;
    const [domain, service] = this._config.tv_off_service.split(".");
    this._hass.callService(domain, service, {
      ...this._config.tv_off_service_data,
      entity_id: this._config.tv_off_entity,
    });
  }

  _injectSectionStyles() {
    // Walk up the DOM to find hui-sections-view and inject asymmetric column CSS
    const colRatio = this._config.section_columns || "5fr 1fr";
    let el = this;
    for (let i = 0; i < 20; i++) {
      el = el.parentElement || el.getRootNode()?.host;
      if (!el) break;
      if (el.tagName === "HUI-SECTIONS-VIEW") {
        const sr = el.shadowRoot;
        if (sr && !sr.querySelector("#tv-control-section-style")) {
          const s = document.createElement("style");
          s.id = "tv-control-section-style";
          s.textContent = `
            .wrapper {
              max-width: none !important;
              padding: 0 12px !important;
            }
            .content {
              grid-template-columns: ${colRatio} !important;
              gap: 12px !important;
            }
            .container {
              grid-template-columns: [content-start] ${colRatio} 0px !important;
              padding: 12px 0 !important;
            }
          `;
          sr.appendChild(s);
          this._sectionStylesInjected = true;
        }
        break;
      }
    }
  }

  disconnectedCallback() {
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
  }
}

customElements.define("tv-control-card", TVControlCard);
