const emptyData = () => ({ todos: [] });

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

    const data = this._read();

    if (localStorage.getItem(name) === null) this._write(data);

    if (callback) callback(data);
  }

  /**
   * Reads the collection from localStorage, resetting it if the stored value
   * is not valid
   *
   * @returns {object} A freshly parsed copy of the collection
   */
  _read() {
    const raw = localStorage.getItem(this._dbName);

    if (raw === null) return emptyData();

    try {
      const data = JSON.parse(raw);

      if (data && Array.isArray(data.todos)) return data;
    } catch {
      // Fall through to the reset below
    }

    console.warn(`Store "${this._dbName}": invalid stored data, resetting to an empty list.`);
    this._write(emptyData());

    return emptyData();
  }

  /**
   * Writes the collection to localStorage
   *
   * @param {object} data The collection to store
   */
  _write(data) {
    localStorage.setItem(this._dbName, JSON.stringify(data));
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

    const { todos } = this._read();

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

    callback(this._read().todos);
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
    const data = this._read();
    const { todos } = data;

    // If an ID was actually given, find the item and update each property
    if (id) {
      for (let i = 0; i < todos.length; i++) {
        if (todos[i].id === id) {
          for (let key in updateData) todos[i][key] = updateData[key];

          break;
        }
      }

      this._write(data);

      if (callback) callback(this._read().todos);
    } else {
      // Generate an ID that is not already stored
      updateData.id = Math.max(0, ...todos.map((todo) => todo.id)) + 1;

      todos.push(updateData);
      this._write(data);

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
    const data = this._read();
    const { todos } = data;

    for (let i = 0; i < todos.length; i++) {
      if (todos[i].id === id) {
        todos.splice(i, 1);
        break;
      }
    }

    this._write(data);

    if (callback) callback(this._read().todos);
  }

  /**
   * Will drop all storage and start fresh
   *
   * @param {function} callback The callback to fire after dropping the data
   */
  drop(callback) {
    this._write(emptyData());

    if (callback) callback(this._read().todos);
  }
}

export default Store;
