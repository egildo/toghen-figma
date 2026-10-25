const listeners = new Set();

/**
 * Who sent the command that is running: the screen, or the command line through the bridge.
 *
 * A result says so on the surface (R6), and the answer is the most recent asker: both reach the
 * same main thread one command at a time, and a person at the screen does not click against a run
 * the command line is making.
 */
let asker = 'screen';
export const lastAsker = () => asker;

window.onmessage = (event) => {
  const response = event?.data?.pluginMessage;
  if (!response) return;
  listeners.forEach((fn) => {
    fn(response);
  });
};

export function send(command) {
  // Resizing the window is not a command whose result anyone attributes.
  if (command.type !== 'RESIZE_UI') asker = 'screen';
  parent.postMessage({ pluginMessage: command }, '*');
}

/** A command the command line sent through the socket, run exactly as the screen's own are. */
export function sendFromCommandLine(command) {
  asker = 'command line';
  parent.postMessage({ pluginMessage: command }, '*');
}

export function onResponse(handler) {
  listeners.add(handler);
  return () => listeners.delete(handler);
}
