import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

let Store;
let Model;
let store;
let model;

beforeEach(async () => {
  localStorage.clear();
  vi.restoreAllMocks();
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

describe("persistence", () => {
  // Re-importing the module resets uniqueID, which simulates a page reload.
  const reload = async () => {
    vi.resetModules();
    ({ default: Store } = await import("../src/store.js"));
    return new Store("test-todos");
  };
  const all = (s) => {
    const cb = vi.fn();
    s.findAll(cb);
    return cb.mock.calls[0][0];
  };

  it("keeps title and completed state across a reload", async () => {
    const cb = vi.fn();
    store.save({ title: "Keep", completed: false }, cb);
    store.save({ completed: true }, undefined, cb.mock.calls[0][0][0].id);
    expect(all(await reload())).toEqual([
      { id: expect.any(Number), title: "Keep", completed: true },
    ]);
  });

  it("gives new todos ids above persisted ones after a reload", async () => {
    store.save({ title: "Old", completed: false });
    const [old] = all(store);
    const fresh = await reload();
    fresh.save({ title: "New", completed: false });
    const ids = all(fresh).map((t) => t.id);
    expect(new Set(ids).size).toBe(2);
    expect(ids[1]).toBeGreaterThan(old.id);
  });

  it("persists remove and drop", async () => {
    const cb = vi.fn();
    store.save({ title: "Gone", completed: false }, cb);
    store.save({ title: "Stays", completed: false });
    store.remove(cb.mock.calls[0][0][0].id);
    expect(all(await reload()).map((t) => t.title)).toEqual(["Stays"]);
    (await reload()).drop();
    expect(all(await reload())).toEqual([]);
  });

  it.each([
    "not json",
    "{}",
    "null",
    '{"todos":"x"}',
    '{"todos":[null]}',
    '{"todos":[{}]}',
    '{"todos":[{"id":"5","title":"t","completed":false}]}',
    '{"todos":[{"id":5,"title":7,"completed":false}]}',
    '{"todos":[{"id":9007199254740993,"title":"t","completed":false}]}',
    '{"todos":[{"id":9007199254740991,"title":"t","completed":false}]}',
    '{"todos":[{"id":0,"title":"t","completed":false}]}',
  ])("treats stored %s as empty", async (raw) => {
    localStorage.setItem("test-todos", raw);
    expect(all(await reload())).toEqual([]);
  });

  it("keeps later writes visible when only setItem throws", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    const s = await reload();
    const cb = vi.fn();
    s.save({ title: "A", completed: false }, cb);
    s.save({ title: "B", completed: false });
    s.remove(cb.mock.calls[0][0][0].id);
    expect(all(s).map((t) => t.title)).toEqual(["B"]);
    s.drop();
    expect(all(s)).toEqual([]);
  });

  it("keeps working when localStorage throws", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    const s = await reload();
    s.save({ title: "Memory", completed: false });
    expect(all(s)).toEqual([{ id: expect.any(Number), title: "Memory", completed: false }]);
  });
});
