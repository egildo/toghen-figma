import { onResponse, sendFromCommandLine } from './commandBus.js';
import { setState } from './state.js';

/**
 * The plugin's half of the bridge to the command line.
 *
 * A plugin cannot listen, but its UI is a web page and can open a socket. The command line listens on
 * a port the manifest names; this connects only when the person asks, with the pairing code the command
 * printed as its first message, and then relays: what comes in from the socket goes to the main thread
 * as if the screen had sent it, and every response the main thread posts goes to the socket as well as
 * to the screen. The state it keeps is what it has observed, event by event (R11).
 */
const URL = 'ws://localhost:3055';
const RETRY_MS = 1000;
/** The close code the command line gives a code it does not know. */
const REFUSED = 4001;

let socket = null;
let code = '';
let wanted = false;
let paired = false;
let retry = null;
let phase = 'off';

/** Records an observed event; a phase that goes on keeps the time it began. */
function observe(next) {
  if (next === phase) return;
  phase = next;
  setState({ commandLine: { phase, at: new Date().toISOString() } });
}

function open() {
  retry = null;
  if (!wanted) return;
  const ws = new WebSocket(URL);
  socket = ws;
  ws.onopen = () => ws.send(JSON.stringify({ pair: code }));
  ws.onmessage = (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch (_notJson) {
      return;
    }
    if (!paired) {
      if (message.paired) {
        paired = true;
        observe('paired');
      }
      return;
    }
    sendFromCommandLine(message);
  };
  ws.onclose = (event) => {
    if (socket !== ws) return;
    socket = null;
    const wasPaired = paired;
    paired = false;
    if (event.code === REFUSED) {
      wanted = false;
      code = '';
      observe('refused');
    } else if (wanted) {
      observe(wasPaired || phase === 'lost' ? 'lost' : 'unreachable');
      retry = setTimeout(open, RETRY_MS);
    }
  };
}

/** Connects, and keeps trying until the person disconnects or the command line refuses the code. */
export function connectCommandLine(pairingCode) {
  if (wanted) return;
  wanted = true;
  code = pairingCode;
  phase = 'off';
  observe('connecting');
  open();
}

export function disconnectCommandLine() {
  wanted = false;
  paired = false;
  code = '';
  if (retry) clearTimeout(retry);
  retry = null;
  const closing = socket;
  socket = null;
  if (closing) closing.close();
  observe('off');
}

export function initBridge() {
  onResponse((response) => {
    if (paired && socket && socket.readyState === 1) socket.send(JSON.stringify(response));
  });
}
