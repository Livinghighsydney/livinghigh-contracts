import { API_BASE } from "./http";
import { contractApi } from "./contracts";
import { templateApi } from "./templates";

/**
 * Live updates: the backend pushes "contract.updated" over a WebSocket the moment a contract
 * changes (tenant opened/signed, sent, archived…). We then refresh the contract list. No polling.
 */
let socket: WebSocket | null = null;
let wanted = false;
let retryMs = 1000;
let retryTimer: number | undefined;
let refreshTimer: number | undefined;

const wsUrl = () => API_BASE.replace(/^http/, "ws") + "/api/live";

function refreshSoon() {
  // Several updates can arrive together (e.g. "signed" then "completed") — refresh once.
  window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => void contractApi.refresh(), 300);
}

function open() {
  if (!wanted || socket) return;
  const ws = new WebSocket(wsUrl()); // the session cookie is sent with the handshake
  socket = ws;
  ws.onopen = () => {
    retryMs = 1000;
    refreshSoon(); // catch anything that changed while we were disconnected
    void templateApi.refresh();
  };
  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(String(e.data)) as { type?: string };
      if (msg.type === "contract.updated") refreshSoon();
      else if (msg.type === "templates.updated") void templateApi.refresh(); // a template was saved/added/removed
    } catch {
      /* ignore */
    }
  };
  ws.onclose = (e) => {
    socket = null;
    if (!wanted || e.code === 4401 || e.code === 4403) return; // signed out / not allowed
    // Reconnect with back-off (1s, 2s, 4s … max 30s).
    retryTimer = window.setTimeout(open, retryMs);
    retryMs = Math.min(retryMs * 2, 30_000);
  };
}

export const liveUpdates = {
  start() {
    if (typeof window === "undefined") return;
    wanted = true;
    open();
  },
  stop() {
    wanted = false;
    window.clearTimeout(retryTimer);
    window.clearTimeout(refreshTimer);
    socket?.close();
    socket = null;
  },
};
