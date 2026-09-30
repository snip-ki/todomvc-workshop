let uniqueID = 1;
/* HOT MODULE SPECIFIC
 * Since hot reload blows away class instances, the fallback copy is
 * moved outside of the class.
 */
// Used only when localStorage throws (private mode, quota).
const fallback = {};

// Names whose last localStorage write failed; localStorage is stale for them.
const degraded = new Set();

// Safe positive ids only: save/update treats id 0 as "no id", and ids at or
// above 2^53 - 1 break the id + 1 seed in the constructor.
const isTodo = (t) =>
  Number.isSafeInteger(t?.id) &&
  t.id > 0 &&
  t.id < Number.MAX_SAFE_INTEGER &&
  typeof t.title === "string" &&
  typeof t.completed === "boolean";

const load = (name) => {
  let raw = fallback[name];
  if (!degraded.has(name)) {
    try {
      raw = localStorage.getItem(name);
    } catch {
      // raw stays the in-memory copy.
    }
  }

  try {
    const data = JSON.parse(raw);
    // One wrongly shaped entry discards the whole list.
    if (Array.isArray(data?.todos) && data.todos.every(isTodo)) return data;
  } catch {
    // Corrupt data falls through to the empty list; the Store constructor persists it.
  }

  return { todos: [] };
};

const persist = (name, data) => {
  const json = JSON.stringify(data);
  fallback[name] = json;

  try {
    localStorage.setItem(name, json);
    degraded.delete(name);
  } catch {
    degraded.add(name);
    // The in-memory copy above keeps the page working.
  }
};

/**
 * Creates a new client side storage object backed by localStorage and will
 * create an empty collection if no collection already exists.
 *
 * @param {string} name The name of our DB we want to use
 * @param {function} callback Our fake DB uses callbacks because in
 * real life you probably would be making AJAX calls
 */
export class Store {
  constructor(name, callback) {
    this._dbName = name;

    const data = load(name);
    for (const { id } of data.todos) uniqueID = Math.max(uniqueID, id + 1);
    persist(name, data);

    if (callback) callback(data);
  }

  /**
   * Finds items based on a query given as a JS object
   *
   * @param {object} query The query to match against (i.e. {foo: 'bar'})
   * @param {function} callback   The callback to fire when the query has
   * completed running
   *
   * @example
   * db.find({foo: 'bar', hello: 'world'}, function (data) {
   *   // data will return any items that have foo: bar and
   *   // hello: world in their properties
   * })
   */
  find(query, callback) {
    if (!callback) return;

    const { todos } = load(this._dbName);

    callback(
      todos.filter((todo) => {
        for (let q in query) {
          if (query[q] !== todo[q]) return false;
        }

        return true;
      }),
    );
  }

  /**
   * Will retrieve all data from the collection
   *
   * @param {function} callback The callback to fire upon retrieving data
   */
  findAll(callback) {
    if (!callback) return;

    callback(load(this._dbName).todos);
  }

  /**
   * Will save the given data to the DB. If no item exists it will create a new
   * item, otherwise it'll simply update an existing item's properties
   *
   * @param {object} updateData The data to save back into the DB
   * @param {function} callback The callback to fire after saving
   * @param {number} id An optional param to enter an ID of an item to update
   */
  save(updateData, callback, id) {
    const data = load(this._dbName);
    const { todos } = data;

    // If an ID was actually given, find the item and update each property
    if (id) {
      for (let i = 0; i < todos.length; i++) {
        if (todos[i].id === id) {
          for (let key in updateData) todos[i][key] = updateData[key];

          break;
        }
      }

      persist(this._dbName, data);

      if (callback) callback(load(this._dbName).todos);
    } else {
      // Generate an ID
      updateData.id = uniqueID++;

      todos.push(updateData);
      persist(this._dbName, data);

      if (callback) callback([updateData]);
    }
  }

  /**
   * Will remove an item from the Store based on its ID
   *
   * @param {number} id The ID of the item you want to remove
   * @param {function} callback The callback to fire after saving
   */
  remove(id, callback) {
    const data = load(this._dbName);
    const { todos } = data;

    for (let i = 0; i < todos.length; i++) {
      if (todos[i].id === id) {
        todos.splice(i, 1);
        break;
      }
    }

    persist(this._dbName, data);

    if (callback) callback(load(this._dbName).todos);
  }

  /**
   * Will drop all storage and start fresh
   *
   * @param {function} callback The callback to fire after dropping the data
   */
  drop(callback) {
    persist(this._dbName, { todos: [] });

    if (callback) callback(load(this._dbName).todos);
  }
}

export default Store;
