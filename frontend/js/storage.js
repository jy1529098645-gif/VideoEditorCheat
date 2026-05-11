// Persistent storage layer — wraps localStorage with a single namespaced key
// All app state lives in `cheat-on-content:v1`

(function () {
  const KEY = 'cheat-on-content:v1';

  function read() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.error('storage.read failed', e);
      return null;
    }
  }

  function write(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      console.error('storage.write failed', e);
      return false;
    }
  }

  function clear() {
    localStorage.removeItem(KEY);
  }

  window.Storage = { read, write, clear, KEY };
})();
