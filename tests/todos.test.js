import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

let Store;
let Model;
let store;
let model;

beforeEach(async () => {
  localStorage.clear();
  vi.resetModules();
  ({ default: Store } = await import("../src/store.js"));
  ({ default: Model } = await import("../src/model.js"));
  store = new Store("test-todos");
  model = new Model(store);
});

describe("existing todo behavior", () => {
  it("starts with an empty list", () => {
    const onRead = vi.fn();
    model.read(onRead);
    expect(onRead).toHaveBeenCalledExactlyOnceWith([]);
  });

  it("creates trimmed titles, incomplete status, and distinct numeric IDs", () => {
    model.create("  First task  ");
    model.create("Second task");
    const onRead = vi.fn();
    model.read(onRead);
    const [first, second] = onRead.mock.calls[0][0];
    expect(first).toEqual({ id: expect.any(Number), title: "First task", completed: false });
    expect(second).toEqual({ id: expect.any(Number), title: "Second task", completed: false });
    expect(first.id).not.toBe(second.id);
  });

  it("edits and completes the requested item without changing its neighbor", () => {
    const onCreate = vi.fn();
    model.create("First", onCreate);
    model.create("Second");
    const id = onCreate.mock.calls[0][0][0].id;
    model.update(id, { title: "Updated", completed: true });
    const onRead = vi.fn();
    model.read(onRead);
    expect(onRead.mock.calls[0][0]).toEqual([
      { id, title: "Updated", completed: true },
      { id: expect.any(Number), title: "Second", completed: false },
    ]);
  });

  it("filters completed items and counts all items correctly", () => {
    const onCreate = vi.fn();
    model.create("Done", onCreate);
    model.create("Still working");
    const id = onCreate.mock.calls[0][0][0].id;
    model.update(id, { completed: true });
    const onRead = vi.fn();
    model.read({ completed: true }, onRead);
    expect(onRead).toHaveBeenCalledExactlyOnceWith([{ id, title: "Done", completed: true }]);
    const onCount = vi.fn();
    model.getCount(onCount);
    expect(onCount).toHaveBeenCalledExactlyOnceWith({ active: 1, completed: 1, total: 2 });
  });

  it("deletes only the requested item", () => {
    const onCreate = vi.fn();
    model.create("Remove me", onCreate);
    model.create("Keep me");
    model.remove(onCreate.mock.calls[0][0][0].id);
    const onRead = vi.fn();
    model.read(onRead);
    expect(onRead).toHaveBeenCalledExactlyOnceWith([
      { id: expect.any(Number), title: "Keep me", completed: false },
    ]);
  });
});

describe("undo and redo", () => {
  it("undoes create, update, and remove", () => {
    const onCreate = vi.fn();
    model.create("Task", onCreate);
    const id = onCreate.mock.calls[0][0][0].id;

    expect(model.canUndo()).toBe(true);
    expect(model.canRedo()).toBe(false);

    model.update(id, { completed: true });
    model.remove(id);

    const afterRemove = vi.fn();
    model.read(afterRemove);
    expect(afterRemove).toHaveBeenCalledExactlyOnceWith([]);

    expect(model.undo()).toBe(true);
    const afterUndoRemove = vi.fn();
    model.read(afterUndoRemove);
    expect(afterUndoRemove).toHaveBeenCalledExactlyOnceWith([
      { id, title: "Task", completed: true },
    ]);

    expect(model.undo()).toBe(true);
    const afterUndoComplete = vi.fn();
    model.read(afterUndoComplete);
    expect(afterUndoComplete).toHaveBeenCalledExactlyOnceWith([
      { id, title: "Task", completed: false },
    ]);

    expect(model.undo()).toBe(true);
    const afterUndoCreate = vi.fn();
    model.read(afterUndoCreate);
    expect(afterUndoCreate).toHaveBeenCalledExactlyOnceWith([]);
    expect(model.canUndo()).toBe(false);
  });

  it("redoes an undone change and clears redo after a new edit", () => {
    const onCreate = vi.fn();
    model.create("Original", onCreate);
    const id = onCreate.mock.calls[0][0][0].id;
    model.update(id, { title: "Changed" });

    expect(model.undo()).toBe(true);
    const afterUndo = vi.fn();
    model.read(afterUndo);
    expect(afterUndo).toHaveBeenCalledExactlyOnceWith([
      { id, title: "Original", completed: false },
    ]);
    expect(model.canRedo()).toBe(true);

    expect(model.redo()).toBe(true);
    const afterRedo = vi.fn();
    model.read(afterRedo);
    expect(afterRedo).toHaveBeenCalledExactlyOnceWith([{ id, title: "Changed", completed: false }]);

    expect(model.undo()).toBe(true);
    model.create("New branch");
    expect(model.canRedo()).toBe(false);
    expect(model.redo()).toBe(false);
  });

  it("returns false when there is nothing to undo or redo", () => {
    expect(model.canUndo()).toBe(false);
    expect(model.canRedo()).toBe(false);
    expect(model.undo()).toBe(false);
    expect(model.redo()).toBe(false);
  });
});

describe("persistence across reload", () => {
  async function reloadStoreAndModel(dbName = "test-todos") {
    vi.resetModules();
    ({ default: Store } = await import("../src/store.js"));
    ({ default: Model } = await import("../src/model.js"));
    store = new Store(dbName);
    model = new Model(store);
  }

  it("restores todos after a new Store instance with the same name", async () => {
    const onCreate = vi.fn();
    model.create("Survives reload", onCreate);
    const persistedId = onCreate.mock.calls[0][0][0].id;

    await reloadStoreAndModel();

    const onRead = vi.fn();
    model.read(onRead);
    expect(onRead).toHaveBeenCalledExactlyOnceWith([
      { id: persistedId, title: "Survives reload", completed: false },
    ]);
  });

  it("assigns new IDs above any restored todos", async () => {
    const onCreate = vi.fn();
    model.create("First");
    model.create("Second", onCreate);
    const maxPersistedId = onCreate.mock.calls[0][0][0].id;

    await reloadStoreAndModel();

    const onNewCreate = vi.fn();
    model.create("After reload", onNewCreate);
    expect(onNewCreate.mock.calls[0][0][0].id).toBeGreaterThan(maxPersistedId);
  });

  it("persists updates and removals across reload", async () => {
    const onKeepCreate = vi.fn();
    const onRemoveCreate = vi.fn();
    model.create("Keep", onKeepCreate);
    model.create("Remove me", onRemoveCreate);
    const keepId = onKeepCreate.mock.calls[0][0][0].id;
    const removeId = onRemoveCreate.mock.calls[0][0][0].id;
    model.update(keepId, { title: "Updated", completed: true });
    model.remove(removeId);

    await reloadStoreAndModel();

    const onRead = vi.fn();
    model.read(onRead);
    expect(onRead).toHaveBeenCalledExactlyOnceWith([
      { id: keepId, title: "Updated", completed: true },
    ]);
  });

  it("persists drop across reload", async () => {
    model.create("Gone after drop");
    model.removeAll();

    await reloadStoreAndModel();

    const onRead = vi.fn();
    model.read(onRead);
    expect(onRead).toHaveBeenCalledExactlyOnceWith([]);
  });
});
