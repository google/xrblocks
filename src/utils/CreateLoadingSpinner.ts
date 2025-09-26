class LoadingSpinner extends HTMLElement {
  private static style = `
    /* Styles for the wrapper that covers the screen */
    .wrapper {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.1);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 9999;
      transition: visibility 0s, opacity 0.2s linear;
    }

    /* The spinning circle */
    .spinner {
      border: 8px solid rgba(255, 255, 255, 0.3);
      border-left-color: #ffffff;
      border-radius: 50%;
      width: 60px;
      height: 60px;
      animation: spin 1s linear infinite;
    }

    /* The animation is safely scoped inside the shadow DOM */
    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }`;
  private static innerHTML = `
    <style>
      ${LoadingSpinner.style}
    </style>
    <div class="wrapper">
      <div class="spinner"></div>
    </div>
  `;

  connectedCallback() {
    const shadowRoot = this.attachShadow({mode: 'open'});
    shadowRoot.innerHTML = LoadingSpinner.innerHTML;
  }
}
customElements.define('xb-blocks-loading-spinner', LoadingSpinner);

// Creates a new Loading spinner and attaches it to document.body.
export function createLoadingSpinner() {
  return document.body.appendChild(
      document.createElement('xb-blocks-loading-spinner'));
}
