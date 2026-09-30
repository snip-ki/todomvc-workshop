/**
 * Creates a new Model instance and hooks up the storage.
 * @constructor
 * @param {object} storage A reference to the client side storage class
 */
class Model {
  constructor(storage) {
    this.storage = storage;
  }

  /**
   * Creates a new todo model
   *
   * @param {string} [title] The title of the task
   * @param {function} [callback] The callback to fire after the model is created
   */
  create(title, callback) {
    title = title || "";

    const newItem = {
      title: title.trim(),
      completed: false,
    };

    this.storage.save(newItem, callback);
  }

  /**
   * Finds and returns a model in storage. If no query is given it'll simply
   * return everything. If you pass in a string or number it'll look that up as
   * the ID of the model to find. Lastly, you can pass it an object to match
   * against.
   *
   * @param {string|number|object} [query] A query to match models against
   * @param {function} [callback] The callback to fire after the model is found
   *
   * @example
   * model.read(1, func) // Will find the model with an ID of 1
   * model.read('1') // Same as above
   * //Below will find a model with foo equalling bar and hello equalling world.
   * model.read({ foo: 'bar', hello: 'world' })
   */
  read(query, callback) {
    const queryType = typeof query;

    if (queryType === "function") {
      callback = query;
      query = undefined;
    }

    const live = (todos) => {
      if (callback) callback(todos.filter((todo) => !todo.deleted));
    };

    if (query === undefined) {
      this.storage.findAll(live);
    } else if (queryType === "string" || queryType === "number") {
      this.storage.find({ id: parseInt(query, 10) }, live);
    } else {
      this.storage.find(query, live);
    }
  }

  /**
   * Returns all todos that were deleted and can still be restored
   *
   * @param {function} callback The callback to fire with the deleted todos
   */
  readDeleted(callback) {
    this.storage.findAll((todos) => callback(todos.filter((todo) => todo.deleted)));
  }

  /**
   * Updates a model by giving it an ID, data to update, and a callback to fire when
   * the update is complete.
   *
   * @param {number} id The id of the model to update
   * @param {object} data The properties to update and their new value
   * @param {function} callback The callback to fire when the update is complete.
   */
  update(id, data, callback) {
    this.storage.save(data, callback, id);
  }

  /**
   * Moves a model to the trash, from where it can be restored
   *
   * @param {number} id The ID of the model to remove
   * @param {function} callback The callback to fire when the removal is complete.
   */
  remove(id, callback) {
    this.update(id, { deleted: true }, callback);
  }

  /**
   * Brings a deleted model back with its original id, title and completed state
   *
   * @param {number} id The ID of the model to restore
   * @param {function} callback The callback to fire when the restore is complete.
   */
  restore(id, callback) {
    this.update(id, { deleted: false }, callback);
  }

  /**
   * Permanently removes a model from storage
   *
   * @param {number} id The ID of the model to purge
   * @param {function} callback The callback to fire when the removal is complete.
   */
  purge(id, callback) {
    this.storage.remove(id, callback);
  }

  /**
   * Permanently removes every deleted model from storage
   *
   * @param {function} callback The callback to fire when the trash is empty.
   */
  purgeDeleted(callback) {
    this.readDeleted((todos) => {
      for (let todo of todos) this.storage.remove(todo.id);
      if (callback) callback();
    });
  }

  /**
   * WARNING: Will remove ALL data from storage.
   *
   * @param {function} callback The callback to fire when the storage is wiped.
   */
  removeAll(callback) {
    this.storage.drop(callback);
  }

  /**
   * Returns a count of all todos
   */
  getCount(callback) {
    if (!callback) return;

    const stats = {
      active: 0,
      completed: 0,
      total: 0,
      deleted: 0,
    };

    this.storage.findAll((data) => {
      for (let todo of data) {
        if (todo.deleted) {
          stats.deleted++;
          continue;
        }

        if (todo.completed) stats.completed++;
        else stats.active++;

        stats.total++;
      }

      callback(stats);
    });
  }
}

export default Model;
