# Plan: persist todos across reloads

## Context

Primary user: a person using the todo app in one browser profile. Todos live in the in-memory `memoryStorage` object in `src/store.js` and disappear on reload. The change moves that storage to `localStorage`.

## Decided approach

1. In `src/store.js`, read and write the serialized `{ todos: [] }` document through `localStorage`, keyed by the store name (`"workshop-todos"` in the app).
2. Seed `uniqueID` from the highest stored id plus one when a `Store` is constructed. Today `uniqueID` restarts at 1 on every page load and would collide with persisted todos.
3. If the stored value is missing, is not valid JSON, has no `todos` array, or has any entry that is not a todo, start with `{ todos: [] }`. A todo has a positive integer `id` below 2^53 - 1, a string `title`, and a boolean `completed`. One bad entry discards the whole list. The `Store` constructor writes the empty list back right away, so corrupt data is replaced when the page loads. This is accepted data loss for a workshop app.
4. If `localStorage` throws on read or write (for example private mode or quota), keep working from an in-memory copy for that page load.
5. Tests run under jsdom (`vite.config.js`), which provides `localStorage`. Tests use it directly. The `Store` constructor signature does not change. Each test clears `localStorage` in `beforeEach`. `vi.resetModules()` in the existing `beforeEach` resets `uniqueID`, which simulates a page reload.

## Non-goals

- No backend, sync, or live updates across tabs.
- No change to the `Store` public API (`find`, `findAll`, `save`, `remove`, `drop`).
- No change to view, template, or controller code.
- No storage versioning or migration.
- No injectable storage parameter.

## AC / DoD matrix

| Acceptance criterion                                                                   | Definition of done (evidence)                                                                                                                                                                         |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A todo saved through one `Store` survives a reload with its title and completed state. | A test creates a `Store`, saves and updates a todo, builds a second `Store` with the same name after `vi.resetModules()`, and `findAll` returns the same title and completed value.                   |
| A todo created after a reload gets an id that no persisted todo has.                   | A test saves a todo, simulates a reload, saves another todo, and asserts the two ids differ and the new id is greater than the old one.                                                               |
| Removing a todo and calling `drop` persist across a reload.                            | A test removes one todo and drops another store, reloads, and asserts the removed todo is absent and the dropped store is empty.                                                                      |
| Corrupt or wrongly shaped stored data does not crash the app.                          | Tests store `"not json"` and `"{}"` under the store name, construct a `Store`, and `findAll` returns `[]`.                                                                                            |
| A `localStorage` failure does not crash the app.                                       | A test makes `localStorage.getItem` and `setItem` throw, and `save` then `findAll` still work within the same page load.                                                                              |
| The existing behavior tests still pass.                                                | `npm test` passes, including every test in `tests/todos.test.js` that existed before this change.                                                                                                     |
| The feature works in the browser.                                                      | Manual check on http://127.0.0.1:5173: add, edit, complete, and delete todos, reload, and the list matches. Record the result in the PR description.                                                  |
| The change is clean under the repo checks.                                             | `npm run verify` reports no formatting, lint, test, or build errors in files this change touches. The starter `README.md` and `.agents/README.md` already fail the format check and are out of scope. |

## Steps

1. Add the failing tests from the matrix to `tests/todos.test.js` and add `localStorage.clear()` to `beforeEach`.
2. Implement the `src/store.js` change until the tests pass.
3. Run `npm test`.
4. Run the browser check.
5. Run `npm run verify`.
