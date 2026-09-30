import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

let Store;
let Model;
let store;
let model;

async function loadApp() {
  vi.resetModules();
  ({ default: Store } = await import("../src/store.js"));
  ({ default: Model } = await import("../src/model.js"));
  store = new Store("test-todos");
  model = new Model(store);
}

function readAll() {
  const onRead = vi.fn();
  model.read(onRead);
  return onRead.mock.calls[0][0];
}

beforeEach(async () => {
  localStorage.clear();
  vi.restoreAllMocks();
  await loadApp();
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
    expect(onCount).toHaveBeenCalledExactlyOnceWith({
      active: 1,
      completed: 1,
      total: 2,
      deleted: 0,
    });
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

describe("persistence across reloads", () => {
  it("keeps created, edited, and completed todos after a reload", async () => {
    const onCreate = vi.fn();
    model.create("First", onCreate);
    model.create("Second");
    const id = onCreate.mock.calls[0][0][0].id;
    model.update(id, { title: "Updated", completed: true });

    await loadApp();

    expect(readAll()).toEqual([
      { id, title: "Updated", completed: true },
      { id: expect.any(Number), title: "Second", completed: false },
    ]);
  });

  it("does not reuse stored IDs for todos created after a reload", async () => {
    model.create("One");
    model.create("Two");

    await loadApp();
    model.create("Three");

    const ids = readAll().map((todo) => todo.id);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
  });

  it("keeps deletions and cleared completed todos after a reload", async () => {
    const onCreate = vi.fn();
    model.create("Delete me", onCreate);
    model.create("Complete me", onCreate);
    model.create("Keep me");
    const [deleteId, completeId] = onCreate.mock.calls.map((call) => call[0][0].id);
    model.remove(deleteId);
    model.update(completeId, { completed: true });
    model.read({ completed: true }, (done) => done.forEach((todo) => model.remove(todo.id)));

    await loadApp();

    expect(readAll()).toEqual([{ id: expect.any(Number), title: "Keep me", completed: false }]);
  });

  it("resets corrupt stored data to an empty list and warns", async () => {
    localStorage.setItem("test-todos", "{bad");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await loadApp();

    expect(readAll()).toEqual([]);
    expect(warn).toHaveBeenCalledOnce();
    expect(JSON.parse(localStorage.getItem("test-todos"))).toEqual({ todos: [] });
  });
});

describe("restoring deleted todos", () => {
  function readDeleted() {
    const onRead = vi.fn();
    model.readDeleted(onRead);
    return onRead.mock.calls[0][0];
  }

  function createAll(...titles) {
    return titles.map((title) => {
      const onCreate = vi.fn();
      model.create(title, onCreate);
      return onCreate.mock.calls[0][0][0].id;
    });
  }

  it("moves a deleted todo to the trash instead of removing it", () => {
    const [id] = createAll("Deleted", "Kept");
    model.update(id, { completed: true });
    model.remove(id);

    expect(readAll().map((todo) => todo.title)).toEqual(["Kept"]);
    const onCompleted = vi.fn();
    model.read({ completed: true }, onCompleted);
    expect(onCompleted).toHaveBeenCalledExactlyOnceWith([]);
    expect(readDeleted()).toEqual([{ id, title: "Deleted", completed: true, deleted: true }]);
    const onCount = vi.fn();
    model.getCount(onCount);
    expect(onCount).toHaveBeenCalledExactlyOnceWith({
      active: 1,
      completed: 0,
      total: 1,
      deleted: 1,
    });
  });

  it("restores a todo with its id, title, completed state, and position", () => {
    const [, id] = createAll("First", "Second", "Third");
    model.update(id, { completed: true });
    model.remove(id);
    model.restore(id);

    expect(readAll()).toEqual([
      { id: expect.any(Number), title: "First", completed: false },
      { id, title: "Second", completed: true, deleted: false },
      { id: expect.any(Number), title: "Third", completed: false },
    ]);
    expect(readDeleted()).toEqual([]);
  });

  it("moves cleared completed todos to the trash", () => {
    const [done, alsoDone] = createAll("Done", "Also done", "Open");
    model.update(done, { completed: true });
    model.update(alsoDone, { completed: true });
    model.read({ completed: true }, (todos) => todos.forEach((todo) => model.remove(todo.id)));

    expect(readAll().map((todo) => todo.title)).toEqual(["Open"]);
    expect(readDeleted().map((todo) => todo.id)).toEqual([done, alsoDone]);
  });

  it("purges single todos and empties the trash permanently", () => {
    const [first, second, third] = createAll("First", "Second", "Third");
    model.remove(first);
    model.remove(second);
    model.purge(first);

    expect(readDeleted().map((todo) => todo.id)).toEqual([second]);

    const onEmpty = vi.fn();
    model.purgeDeleted(onEmpty);

    expect(onEmpty).toHaveBeenCalledOnce();
    expect(readDeleted()).toEqual([]);
    expect(readAll().map((todo) => todo.id)).toEqual([third]);
    expect(JSON.parse(localStorage.getItem("test-todos")).todos).toHaveLength(1);
  });

  it("keeps the trash across reloads and restores after a reload", async () => {
    const [id] = createAll("Come back");
    model.remove(id);

    await loadApp();

    expect(readDeleted().map((todo) => todo.id)).toEqual([id]);
    model.restore(id);
    expect(readAll()).toEqual([{ id, title: "Come back", completed: false, deleted: false }]);
  });

  it("never gives a new todo the id of a todo in the trash", async () => {
    const [id] = createAll("Only one");
    model.remove(id);

    await loadApp();
    const [newId] = createAll("New");

    expect(newId).not.toBe(id);
  });

  it("treats stored todos without a deleted flag as live", async () => {
    localStorage.setItem(
      "test-todos",
      JSON.stringify({ todos: [{ id: 1, title: "Old", completed: false }] }),
    );

    await loadApp();

    expect(readAll()).toEqual([{ id: 1, title: "Old", completed: false }]);
    expect(readDeleted()).toEqual([]);
  });
});

describe("deleted view in the UI", () => {
  const markup = `
    <section class="todoapp">
      <input class="new-todo" />
      <main class="main">
        <div class="toggle-all-container">
          <input class="toggle-all" type="checkbox" />
          <label class="toggle-all-label"></label>
        </div>
        <ul class="todo-list"></ul>
      </main>
      <footer class="footer">
        <span class="todo-count"></span>
        <ul class="filters">
          <li><a href="#/" class="selected">All</a></li>
          <li><a href="#/active">Active</a></li>
          <li><a href="#/completed">Completed</a></li>
          <li><a href="#/deleted">Deleted</a></li>
        </ul>
        <button class="clear-completed"></button>
        <button class="empty-trash">Empty trash</button>
      </footer>
    </section>`;

  let controller;

  beforeEach(async () => {
    document.body.innerHTML = markup;
    const { default: Template } = await import("../src/template.js");
    const { default: View } = await import("../src/view.js");
    const { default: Controller } = await import("../src/controller.js");
    controller = new Controller(model, new View(new Template()));
  });

  const titles = () =>
    [...document.querySelectorAll(".todo-list li label")].map((label) => label.textContent);
  const click = (selector) => document.querySelector(selector).click();

  it("deletes with the destroy button and restores from the deleted view", () => {
    model.create("Keep");
    model.create("Bring back");
    controller.setView("#/");

    click(".todo-list li:first-child .destroy");
    expect(titles()).toEqual(["Keep"]);

    controller.setView("#/deleted");
    expect(titles()).toEqual(["Bring back"]);
    expect(document.querySelector(".toggle-all-container").style.display).toBe("none");
    expect(document.querySelector(".empty-trash").style.display).toBe("block");

    click(".todo-list .restore");
    expect(titles()).toEqual([]);

    controller.setView("#/");
    expect(titles()).toEqual(["Bring back", "Keep"]);
    expect(document.querySelector(".empty-trash").style.display).toBe("none");
  });

  it("keeps the footer visible when every todo is in the trash", () => {
    model.create("Last one");
    controller.setView("#/");

    click(".todo-list .destroy");

    expect(document.querySelector(".footer").style.display).toBe("block");
  });

  it("empties the trash from the deleted view", () => {
    model.create("Gone");
    controller.setView("#/");
    click(".todo-list .destroy");
    controller.setView("#/deleted");

    click(".empty-trash");

    expect(titles()).toEqual([]);
    expect(document.querySelector(".footer").style.display).toBe("none");
  });

  it("permanently deletes a todo whose title is edited to empty", () => {
    model.create("Edit me");
    controller.setView("#/");

    const [id] = readAll().map((todo) => todo.id);
    controller.editItemSave(id, "   ");

    expect(readAll()).toEqual([]);
    const onRead = vi.fn();
    model.readDeleted(onRead);
    expect(onRead).toHaveBeenCalledExactlyOnceWith([]);
  });
});
