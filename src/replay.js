import { LitElement, html, css } from 'lit-element';
import { wrapCss } from './misc';

import { tsToDate } from './pageutils';

import fasRefresh from '@fortawesome/fontawesome-free/svgs/solid/redo-alt.svg';
import fasFullscreen from '@fortawesome/fontawesome-free/svgs/solid/desktop.svg';
import fasUnfullscreen from '@fortawesome/fontawesome-free/svgs/solid/compress-arrows-alt.svg';

// ===========================================================================
class Replay extends LitElement
{
  constructor() {
    super();
    this.isLoading = false;
    this.replayUrl = "";
    this.replayTS = "";
    this.url = "";
    this.ts = "";
    this.title = "";

    this.showAuth = false;
    this.reauthWait = null;
  }

  static get properties() {
    return {
      collInfo: {type: Object },
      sourceUrl: { type: String },

      // external url set by parent
      url: { type: String },
      ts: { type: String },

      // actual replay url
      replayUrl: { type: String },
      replayTS: { type: String },
      title: { type: String },

      iframeUrl: { type: String },
      isLoading: { type: Boolean },

      showAuth: { type: Boolean },

      embed: { type: String },
      isFullscreen: { type: Boolean }
    }
  }

  firstUpdated() {
    window.addEventListener("message", (event) => this.onReplayMessage(event));
    navigator.serviceWorker.addEventListener("message", async (event) => {
      if (event.data.type === "authneeded" && this.collInfo && event.data.coll === this.collInfo.coll) {
        if (this.reauthWait) {
          await this.reauthWait;
        } else {
          this.showAuth = true;
        }
      }
    });

    this.addEventListener("fullscreenchange", (event) => {
      this.isFullscreen = !!document.fullscreenElement;
    });
  }

  onFullscreenToggle() {
    if (!this.isFullscreen) {
      this.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }

  doSetIframeUrl() {
    this.iframeUrl = this.url ? `${this.collInfo.replayPrefix}/${this.ts || ""}mp_/${this.url}` : "";
  }

  updated(changedProperties) {
    if (changedProperties.has("sourceUrl") || changedProperties.has("collInfo")) {
      this.isAuthable = (this.sourceUrl.startsWith("googledrive://") && 
        this.collInfo && this.collInfo.onDemand);

      this.reauthWait = null;
    }

    if (this.url && 
        ((this.replayUrl != this.url) || (this.replayTS != this.ts)) &&
        (changedProperties.has("url") || changedProperties.has("ts"))) {

      this.replayUrl = this.url;
      this.replayTS = this.ts;
      this.doSetIframeUrl();
    }

    if (this.iframeUrl && changedProperties.has("iframeUrl")) {
      this.waitForLoad();
    }

    if (this.replayUrl && changedProperties.has("replayUrl")) {
      const data = {
        url: this.replayUrl,
        ts: this.replayTS,
      };
  
      this.dispatchEvent(new CustomEvent("coll-tab-nav", {detail: {replaceLoc: true, data}}));
    }

    if (this.embed && window.parent !== window && changedProperties.has("title")) {
      window.parent.postMessage({
        title: this.title,
        url: this.replayUrl,
        ts: this.replayTS
      }, '*');
    }
  }

  onReplayMessage(event) {
    const iframe = this.renderRoot.querySelector("iframe");

    if (iframe && event.source === iframe.contentWindow) {
      if (event.data.wb_type === "load" || event.data.wb_type === "replace-url") {
        this.replayTS = event.data.ts;
        this.replayUrl = event.data.url;
        this.title = event.data.title || this.title;
        this.clearLoading();

        if (event.data.icons) {
          const icons = event.data.icons;
          this.dispatchEvent(new CustomEvent("replay-favicons", {bubbles: true, composed: true, detail: {icons}}));
        }
      } else if (event.data.wb_type === "title") {
        this.title = event.data.title;
      }
    }
  }

  onSubmit(event) {
    event.preventDefault();
    const value = this.renderRoot.querySelector("input").value;
    //this.replayUrl = value;
    this.url = value;
    return false;
  }

  onRefresh(event, forceReload) {
    if (event) {
      event.preventDefault();
    }
    
    if (this.isLoading && !forceReload) {
      return;
    }

    const iframe = this.renderRoot.querySelector("iframe");

    if (iframe) {
      this.waitForLoad();
      iframe.contentWindow.location.reload();
    }
  }

  waitForLoad() {
    this.isLoading = true;
    this._loadPoll = window.setInterval(() => {
      const iframe = this.renderRoot.querySelector("iframe");
      if (!iframe || !iframe.contentDocument || !iframe.contentWindow || 
        (iframe.contentDocument.readyState === "complete" && !iframe.contentWindow._WBWombat)) {
          this.clearLoading();
      }
    }, 5000);
  }

  clearLoading() {
    this.isLoading = false;
    if (this._loadPoll) {
      window.clearInterval(this._loadPoll);
      this._loadPoll = null;
    }
  }

  static get styles() {
    return wrapCss(css`
      host: {
        display: flex;
      }

      iframe {
        width: 100vw;
        #height: calc(100vh - 150px);
        height: 100%;
        border: 0px;
      }

      .replay-bar {
        padding: 1em;
        max-width: none;
        border-bottom: solid .1rem #97989A;
        width: 100%;
        background-color: white;
      }

      .embed-bar {
        padding: 0.25em;
        max-width: none;
        border-bottom: solid .1rem #97989A;
        text-align: center;
        height: 44px;
      }

      input#url {
        border-radius: 4px;
      }

      .intro-panel {
        min-width: 40%;
        display: flex;
        flex-direction: column;
        margin: auto;
      }

      .intro-panel .panel-heading {
        font-size: 1.0em;
      }

      .intro-panel .panel-block {
        padding: 1.0em;
        flex-direction: column;
      }

      #datetime {
        position: absolute;
        right: 1em;
        z-index: 10;
        background: linear-gradient(90deg, rgba(255, 255, 255, 0), #FFF 15%, #FFF);
        margin: 5px 0.75em 5px 0;
        line-height: 2;
      }

      .is-borderless {
        border: 0px;
      }

      .modal {
        top: 174px;
      }

    `);
  }

  render() {
    return html`
    ${this.embed !== "replayonly" ? html`
    <div class="replay-bar">
      <form @submit="${this.onSubmit}">
        <div class="field has-addons">
          <a id="fullscreen" class="button is-borderless" @click="${this.onFullscreenToggle}">
            <span class="icon is-small">
              <fa-icon size="1.0em" class="has-text-grey" .svg="${this.isFullscreen ? fasUnfullscreen : fasFullscreen}"></fa-icon>
            </span>
          </a>
          <button id="refresh" class="button is-borderless ${this.isLoading ? 'is-loading' : ''}" @click="${this.onRefresh}">
            <span class="icon is-small">
              ${!this.isLoading ? html`
              <fa-icon size="1.0em" class="has-text-grey" .svg="${fasRefresh}"></fa-icon>
              ` : ``}
            </span>
          </button>
          <p class="control is-expanded">
            <input id="url" class="input" type="text" .value="${this.replayUrl}" placeholder="https://... Enter a URL to replay from the archive here">
          </p>
          <p id="datetime" class="control is-hidden-mobile">${tsToDate(this.replayTS).toLocaleString()}</p>
        </div>
      </form>
    </div>` : html`
    `}

    ${this.iframeUrl ? html`
    <iframe @message="${this.onReplayMessage}" allow="autoplay 'self'; fullscreen"
    src="${this.iframeUrl}"></iframe>
    ` : html`
      <nav class="panel intro-panel">
        <p class="panel-heading">Replay Web Page</p>
        <div class="panel-block">
          <p>Enter a URL above to replay it from the web archive!</p>
          <p>(Check out the <a href="#view=pages">Pages</a> or <a href="#view=resources">Page Resources</a> to find URLs in this archive.)</p>
        </div>
      </nav>
    `}

    ${this.isAuthable ? html`
    <div class="modal ${this.showAuth ? 'is-active' : ''}">
      <div class="modal-background"></div>
        <div class="modal-card">
          <header class="modal-card-head">
          <p class="modal-card-title">Auth Needed</p>
            <button class="delete" aria-label="close" @click="${(e) => this.showAuth = false}"></button>
          </header>
          <section class="modal-card-body">
            <div class="container has-text-centered">
            <wr-gdrive .sourceUrl=${this.sourceUrl} .state="${this.showAuth ? 'trymanual' : 'implicitonly'}" .reauth="${true}" @load-ready=${this.onReAuthed}/>
            </div>
          </section>
        </div>
    </div>
    ` : ``}
    `;
  }

  onReAuthed(event) {
    this.reauthWait = (async () => {
      const headers = event.detail.headers;

      const resp = await fetch(`/wabac/api/${this.collInfo.coll}/updateAuth`, { 
        method: 'POST',
        body: JSON.stringify({headers})
      });

      if (this.showAuth) {
        this.onRefresh(null, true);
        this.showAuth = false;
      }
    })();
  }
}

customElements.define("wr-coll-replay", Replay);

export { Replay };