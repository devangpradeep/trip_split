// Run before the app and styles load so a saved light theme paints immediately.
(() => {
  const storageKey = 'tripsplit:theme';
  const changeEvent = 'tripsplit:theme-change';
  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
  const root = document.documentElement;
  const validPreference = (value) => ['light', 'dark', 'system'].includes(value) ? value : 'dark';
  const getPreference = () => root.dataset.themePreference || 'dark';

  const apply = (preference) => {
    root.dataset.themePreference = preference;
    root.dataset.theme = preference === 'system' ? (systemTheme.matches ? 'dark' : 'light') : preference;
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.content = root.dataset.theme === 'dark' ? '#101114' : '#f5f4ef';
    window.dispatchEvent(new Event(changeEvent));
  };

  const setPreference = (value) => {
    const preference = validPreference(value);
    try {
      localStorage.setItem(storageKey, preference);
    } catch {
      // The selection still works for this session when storage is unavailable.
    }
    apply(preference);
  };

  const subscribe = (listener) => {
    window.addEventListener(changeEvent, listener);
    return () => window.removeEventListener(changeEvent, listener);
  };

  let initialPreference = 'dark';
  try {
    initialPreference = validPreference(localStorage.getItem(storageKey));
  } catch {
    // Default to the established dark appearance when storage is unavailable.
  }
  apply(initialPreference);

  systemTheme.addEventListener('change', () => {
    if (getPreference() === 'system') apply('system');
  });
  window.addEventListener('storage', (event) => {
    if (event.key === storageKey || event.key === null) apply(validPreference(event.newValue));
  });

  window.tripSplitTheme = { getPreference, setPreference, subscribe };
})();
