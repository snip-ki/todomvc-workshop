let uniqueID = 1;

function readData(dbName) {
  const raw = localStorage.getItem(dbName);
  if (!raw) return null;
  return JSON.parse(raw);
}

function writeData(dbName, data) {
  localStorage.setItem(dbName, JSON.stringify(data));
}

function syncUniqueIdFromTodos(todos) {
  if (!todos.length) {
    uniqueID = 1;
    return;
  }

  uniqueID = Math.max(...todos.map((todo) => todo.id)) + 1;
}

function cloneTodos(todos) {
  return JSON.parse(JSON.stringify(todos));
}

/**
 * Creates a new client side storage object and will create an empty
 * collection if no collection already exists.
 *
 * @param {string} name The name of our DB we want to use
 * @param {function} callback Our fake DB uses callbacks because in
 * real life you probably would be making AJAX calls
 */
export class Store {
  constructor(name, callback) {
    this._dbName = name;
    this._undoStack = [];
    this._redoStack = [];
    this._historySuspended = false;

    let data = readData(name);
    if (!data) {
      data = { todos: [] };
      writeData(name, data);
    }

    syncUniqueIdFromTodos(data.todos);

    if (callback) callback(data);
  }

  _recordHistory() {
    if (this._historySuspended) return;

    const { todos } = readData(this._dbName);
    this._undoStack.push(cloneTodos(todos));
    this._redoStack = [];
  }

  _restoreTodos(todos, callback) {
    writeData(this._dbName, { todos: cloneTodos(todos) });
    syncUniqueIdFromTodos(todos);

    if (callback) callback(readData(this._dbName).todos);
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

    const { todos } = readData(this._dbName);

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

    callback(readData(this._dbName).todos);
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
    this._recordHistory();

    const data = readData(this._dbName);
    const { todos } = data;

    // If an ID was actually given, find the item and update each property
    if (id) {
      for (let i = 0; i < todos.length; i++) {
        if (todos[i].id === id) {
          for (let key in updateData) todos[i][key] = updateData[key];

          break;
        }
      }

      writeData(this._dbName, data);

      if (callback) callback(readData(this._dbName).todos);
    } else {
      // Generate an ID
      updateData.id = uniqueID++;

      todos.push(updateData);
      writeData(this._dbName, data);

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
    this._recordHistory();

    const data = readData(this._dbName);
    const { todos } = data;

    for (let i = 0; i < todos.length; i++) {
      if (todos[i].id === id) {
        todos.splice(i, 1);
        break;
      }
    }

    writeData(this._dbName, data);

    if (callback) callback(readData(this._dbName).todos);
  }

  /**
   * Will drop all storage and start fresh
   *
   * @param {function} callback The callback to fire after dropping the data
   */
  drop(callback) {
    this._recordHistory();

    writeData(this._dbName, { todos: [] });
    uniqueID = 1;

    if (callback) callback(readData(this._dbName).todos);
  }

  /**
   * Restores the previous todos snapshot, if any.
   *
   * @param {function} callback The callback to fire with restored todos
   * @returns {boolean} Whether an undo was performed
   */
  undo(callback) {
    if (!this._undoStack.length) {
      if (callback) callback(null);
      return false;
    }

    const current = readData(this._dbName).todos;
    this._redoStack.push(cloneTodos(current));
    const previous = this._undoStack.pop();
    this._restoreTodos(previous, callback);
    return true;
  }

  /**
   * Reapplies the next todos snapshot after an undo, if any.
   *
   * @param {function} callback The callback to fire with restored todos
   * @returns {boolean} Whether a redo was performed
   */
  redo(callback) {
    if (!this._redoStack.length) {
      if (callback) callback(null);
      return false;
    }

    const current = readData(this._dbName).todos;
    this._undoStack.push(cloneTodos(current));
    const next = this._redoStack.pop();
    this._restoreTodos(next, callback);
    return true;
  }

  canUndo() {
    return this._undoStack.length > 0;
  }

  canRedo() {
    return this._redoStack.length > 0;
  }
}

export default Store;
