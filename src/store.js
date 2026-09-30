/* Fallback used only when localStorage is unavailable or a write fails
 * (private mode, quota exceeded, disabled storage). Holds the serialized
 * collection so the current session keeps working. localStorage itself
 * survives hot reload, so nothing else needs to live outside the class.
 */
const memoryStorage = {};

function read(name) {
  let json = memoryStorage[name];

  if (json === undefined) {
    try {
      json = localStorage.getItem(name);
    } catch {
      return { todos: [] };
    }
  }

  try {
    const data = JSON.parse(json);
    if (data && Array.isArray(data.todos)) return data;
  } catch {
    // Missing or corrupt value: treat as empty.
  }

  return { todos: [] };
}

function write(name, data) {
  const json = JSON.stringify(data);

  try {
    localStorage.setItem(name, json);
    delete memoryStorage[name];
  } catch {
    memoryStorage[name] = json;
  }
}

/**
 * Creates a new client side storage object backed by localStorage. A missing,
 * corrupt, or unavailable collection reads as empty.
 *
 * @param {string} name The name of our DB we want to use
 * @param {function} callback Our fake DB uses callbacks because in
 * real life you probably would be making AJAX calls
 */
export class Store {
  constructor(name, callback) {
    this._dbName = name;

    if (callback) callback(read(name));
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

    const { todos } = read(this._dbName);

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

    callback(read(this._dbName).todos);
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
    const data = read(this._dbName);
    const { todos } = data;

    // If an ID was actually given, find the item and update each property
    if (id) {
      for (let i = 0; i < todos.length; i++) {
        if (todos[i].id === id) {
          for (let key in updateData) todos[i][key] = updateData[key];

          break;
        }
      }

      write(this._dbName, data);

      if (callback) callback(todos);
    } else {
      // Generate an ID that can't collide with items saved in earlier sessions
      updateData.id = todos.reduce((max, todo) => Math.max(max, todo.id), 0) + 1;

      todos.push(updateData);
      write(this._dbName, data);

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
    const data = read(this._dbName);
    const { todos } = data;

    for (let i = 0; i < todos.length; i++) {
      if (todos[i].id === id) {
        todos.splice(i, 1);
        break;
      }
    }

    write(this._dbName, data);

    if (callback) callback(todos);
  }

  /**
   * Will drop all storage and start fresh
   *
   * @param {function} callback The callback to fire after dropping the data
   */
  drop(callback) {
    write(this._dbName, { todos: [] });

    if (callback) callback([]);
  }
}

export default Store;
