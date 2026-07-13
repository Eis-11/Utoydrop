const fs = require("fs/promises");
const path = require("path");

class JsonRepository {
  constructor(filePath, fallback = []) {
    this.filePath = filePath;
    this.fallback = fallback;
    this.writeQueue = Promise.resolve();
  }

  async read() {
    try {
      const contents = await fs.readFile(this.filePath, "utf8");
      return JSON.parse(contents);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      const initialValue = typeof this.fallback === "function" ? await this.fallback() : this.fallback;
      await this.write(initialValue);
      return initialValue;
    }
  }

  async write(value) {
    const operation = async () => {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      const temporaryFile = `${this.filePath}.${process.pid}.tmp`;
      await fs.writeFile(temporaryFile, JSON.stringify(value, null, 2), "utf8");
      await fs.rename(temporaryFile, this.filePath);
      return value;
    };
    this.writeQueue = this.writeQueue.then(operation, operation);
    return this.writeQueue;
  }

  async update(updater) {
    const operation = async () => {
      let current;
      try {
        current = JSON.parse(await fs.readFile(this.filePath, "utf8"));
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        current = typeof this.fallback === "function" ? await this.fallback() : this.fallback;
      }
      const next = await updater(current);
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      const temporaryFile = `${this.filePath}.${process.pid}.tmp`;
      await fs.writeFile(temporaryFile, JSON.stringify(next, null, 2), "utf8");
      await fs.rename(temporaryFile, this.filePath);
      return next;
    };
    this.writeQueue = this.writeQueue.then(operation, operation);
    return this.writeQueue;
  }
}

module.exports = { JsonRepository };
