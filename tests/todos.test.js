import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

let Store;
let Model;
let store;
let model;

const reload = async () => {
  vi.resetModules();
  ({ default: Store } = await import("../src/store.js"));
  ({ default: Model } = await import("../src/model.js"));
  store = new Store("test-todos");
  model = new Model(store);
};

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

describe("persistence", () => {
  it("persists todos across a reload", async () => {
    const onCreate = vi.fn();
    model.create("First", onCreate);
    model.create("Second");
    const id = onCreate.mock.calls[0][0][0].id;
    model.update(id, { completed: true });
    const before = vi.fn();
    model.read(before);

    await reload();

    const after = vi.fn();
    model.read(after);
    expect(after.mock.calls[0][0]).toEqual(before.mock.calls[0][0]);
    expect(after.mock.calls[0][0]).toHaveLength(2);
  });

  it("keeps IDs unique after a reload", async () => {
    model.create("Before reload");
    await reload();
    model.create("After reload");
    const onRead = vi.fn();
    model.read(onRead);
    const [first, second] = onRead.mock.calls[0][0];
    expect(first.id).not.toBe(second.id);
  });

  it("recovers from corrupt stored data", async () => {
    localStorage.setItem("test-todos", "not json");
    await reload();
    const onRead = vi.fn();
    model.read(onRead);
    expect(onRead).toHaveBeenCalledExactlyOnceWith([]);
  });
});
