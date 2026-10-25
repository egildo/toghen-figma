import type { Command, Response, WindowMode } from '../../shared/protocol.js';

type ResizeUiCommand = Extract<Command, { type: 'RESIZE_UI' }>;

/** Key in `figma.clientStorage`, which is per user rather than per file. */
export const WINDOW_SIZES_KEY = 'windowSizes';
/** Where a size was kept before the window had two; read once, as the narrow size. */
export const LEGACY_WINDOW_SIZE_KEY = 'windowSize';

export interface WindowSize {
  width: number;
  height: number;
}

export interface WindowSizes {
  mode: WindowMode;
  narrow: WindowSize;
  wide: WindowSize;
}

/**
 * Below this the tab strip wraps and the result surface has no room to be
 * anything but a header.
 */
export const MIN_WINDOW_SIZE: WindowSize = { width: 320, height: 320 };

/** The size a window that has never been resized opens at: the narrow one, which the design is drawn at. */
export const DEFAULT_WINDOW_SIZE: WindowSize = { width: 460, height: 720 };

/** The wide size until someone drags it: room for the Tokens browser's columns and a detail panel. */
export const DEFAULT_WIDE_SIZE: WindowSize = { width: 980, height: 620 };

const DEFAULT_SIZES: WindowSizes = { mode: 'narrow', narrow: DEFAULT_WINDOW_SIZE, wide: DEFAULT_WIDE_SIZE };

function clamp(size: WindowSize): WindowSize {
  return {
    width: Math.max(MIN_WINDOW_SIZE.width, Math.round(size.width)),
    height: Math.max(MIN_WINDOW_SIZE.height, Math.round(size.height)),
  };
}

const isSize = (value: unknown): value is WindowSize =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as WindowSize).width === 'number' &&
  typeof (value as WindowSize).height === 'number';

export async function RESIZE_UI(payload: ResizeUiCommand['payload']): Promise<void> {
  if ('mode' in payload) {
    // The switch: the other remembered size, and the mode stored with it.
    const sizes = { ...(await loadWindowSizes()), mode: payload.mode };
    const size = sizes[payload.mode];
    figma.ui.resize(size.width, size.height);
    await store(sizes);
    postToUi({ type: 'WINDOW_MODE', payload: { mode: payload.mode } });
    return;
  }

  const size = clamp(payload);
  figma.ui.resize(size.width, size.height);

  // Only at the end of a drag, and under the mode the window is in. Persisting
  // every frame would write to storage dozens of times for one gesture.
  if (payload.remember) {
    const sizes = await loadWindowSizes();
    await store({ ...sizes, [sizes.mode]: size });
  }
}

/**
 * The two sizes and the mode to open in, from a previous session.
 *
 * Stored per user rather than in the file: a window size is a property of the
 * screen someone is sitting at, not of the design system.
 */
export async function loadWindowSizes(): Promise<WindowSizes> {
  try {
    const stored: unknown = await figma.clientStorage.getAsync(WINDOW_SIZES_KEY);
    if (typeof stored === 'object' && stored !== null) {
      const sizes = stored as Partial<WindowSizes>;
      return {
        mode: sizes.mode === 'wide' ? 'wide' : 'narrow',
        narrow: isSize(sizes.narrow) ? clamp(sizes.narrow) : DEFAULT_WINDOW_SIZE,
        wide: isSize(sizes.wide) ? clamp(sizes.wide) : DEFAULT_WIDE_SIZE,
      };
    }
    const legacy: unknown = await figma.clientStorage.getAsync(LEGACY_WINDOW_SIZE_KEY);
    if (isSize(legacy)) return { ...DEFAULT_SIZES, narrow: clamp(legacy) };
  } catch {
    // A window size is never worth failing to open over.
  }
  return DEFAULT_SIZES;
}

async function store(sizes: WindowSizes): Promise<void> {
  try {
    await figma.clientStorage.setAsync(WINDOW_SIZES_KEY, sizes);
  } catch {
    // The window still resized; only the memory of it is lost.
  }
}

function postToUi(response: Response): void {
  figma.ui.postMessage(response);
}
