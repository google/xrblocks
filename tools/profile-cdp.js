export class Cdp {
  constructor(input, output, timeoutMs) {
    this.input = input;
    this.timeoutMs = timeoutMs;
    this.nextId = 0;
    this.pending = new Map();
    this.error = null;
    this.onEvent = null;
    let buffer = '';
    output.setEncoding('utf8');
    output.on('data', (chunk) => {
      buffer += chunk;
      try {
        let boundary;
        while ((boundary = buffer.indexOf('\0')) !== -1) {
          const message = JSON.parse(buffer.slice(0, boundary));
          buffer = buffer.slice(boundary + 1);
          this.receive(message);
        }
      } catch (error) {
        this.fail(error);
      }
    });
    input.on('error', (error) => this.fail(error));
    output.on('error', (error) => this.fail(error));
    output.on('end', () =>
      this.fail(new Error('Chrome closed the DevTools pipe.'))
    );
  }

  wait(key, label, timeoutMs = this.timeoutMs) {
    if (this.error) return Promise.reject(this.error);
    if (this.pending.has(key)) {
      return Promise.reject(new Error(`Already waiting for ${label}.`));
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(key);
        reject(new Error(`Timed out waiting for ${label}.`));
      }, timeoutMs);
      this.pending.set(key, {resolve, reject, timer, label});
    });
  }

  waitFor(method, sessionId) {
    return this.wait(`event:${method}:${sessionId ?? ''}`, method);
  }

  send(method, params = {}, sessionId, timeoutMs = this.timeoutMs) {
    const id = ++this.nextId;
    const response = this.wait(`request:${id}`, method, timeoutMs);
    if (!this.error) {
      this.input.write(
        JSON.stringify({id, method, params, sessionId}) + '\0',
        (error) => {
          if (error) this.fail(error);
        }
      );
    }
    return response;
  }

  receive(message) {
    const key =
      message.id === undefined
        ? `event:${message.method}:${message.sessionId ?? ''}`
        : `request:${message.id}`;
    const request = this.pending.get(key);
    if (request) {
      this.pending.delete(key);
      clearTimeout(request.timer);
      if (message.error) {
        request.reject(new Error(`${request.label}: ${message.error.message}`));
      } else {
        request.resolve(message.result ?? message.params);
      }
    }
    if (message.method) {
      this.onEvent?.(message.method, message.params, message.sessionId);
    }
  }

  fail(error) {
    this.error ??= error;
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(this.error);
    }
    this.pending.clear();
  }
}
