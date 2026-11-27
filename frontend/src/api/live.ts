import { API_BASE, http } from "./http";
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

// In production the API is reached through this site's own /api (forwarded to the backend),
// but WebSockets can't be forwarded — VITE_LIVE_URL points straight at the backend.
const liveBase = () =>
  ((import.meta.env["VITE_LIVE_URL"] as string | undefined) || API_BASE || window.location.origin).replace(/\/$/, "");

/** A one-time pass (fetched with the sign-in cookie) proves who we are to the WebSocket. */
async function wsUrl() {
  const { ticket } = await http.post<{ ticket: string }>("/api/live/ticket");
  return `${liveBase().replace(/^http/, "ws")}/api/live?ticket=${encodeURIComponent(ticket)}`;
}

function refreshSoon() {
  // Several updates can arrive together (e.g. "signed" then "completed") — refresh once.
  window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => void contractApi.refresh(), 300);
}

let opening = false;

function retryLater() {
  retryTimer = window.setTimeout(() => void open(), retryMs);
  retryMs = Math.min(retryMs * 2, 30_000);
}

async function open() {
  if (!wanted || socket || opening) return;
  opening = true;
  let url: string;
  try {
    url = await wsUrl();
  } catch {
    opening = false;
    if (wanted) retryLater(); // signed out → the 401 handler takes over; otherwise try again
    return;
  }
  opening = false;
  if (!wanted || socket) return;
  const ws = new WebSocket(url);
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
    if (!wanted || e.code === 4403) return; // page not allowed
    // Reconnect with back-off (1s, 2s, 4s … max 30s), with a fresh pass each time.
    retryLater();
  };
}

export const liveUpdates = {
  start() {
    if (typeof window === "undefined") return;
    wanted = true;
    void open();
  },
  stop() {
    wanted = false;
    window.clearTimeout(retryTimer);
    window.clearTimeout(refreshTimer);
    socket?.close();
    socket = null;
  },
};
