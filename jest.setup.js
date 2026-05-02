// jest.setup.js — global test setup

// Use a simple inline mock for AsyncStorage since the jest mock file
// is not shipped in all versions of the package.
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = {};
  const AsyncStorageMock = {
    getItem: jest.fn((key) => Promise.resolve(store[key] ?? null)),
    setItem: jest.fn((key, value) => {
      store[key] = value;
      return Promise.resolve();
    }),
    removeItem: jest.fn((key) => {
      delete store[key];
      return Promise.resolve();
    }),
    clear: jest.fn(() => {
      Object.keys(store).forEach((k) => delete store[k]);
      return Promise.resolve();
    }),
    getAllKeys: jest.fn(() => Promise.resolve(Object.keys(store))),
    multiGet: jest.fn((keys) =>
      Promise.resolve(keys.map((k) => [k, store[k] ?? null])),
    ),
    multiSet: jest.fn((pairs) => {
      pairs.forEach(([k, v]) => { store[k] = v; });
      return Promise.resolve();
    }),
    multiRemove: jest.fn((keys) => {
      keys.forEach((k) => delete store[k]);
      return Promise.resolve();
    }),
  };
  return AsyncStorageMock;
});
