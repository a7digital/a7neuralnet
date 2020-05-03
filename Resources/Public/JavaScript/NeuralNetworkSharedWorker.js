class Client {
  constructor(port, manager) {
    this.port = port;
    this.receivers = [];
    this.messageId = 0;
    this.name = null;
    this.pingTimeout = null;
    this.canServe = null;
    this.starting = new Promise((resolve, reject) => {
      this.resolveStarting = resolve;
    });
    this.closing = new Promise((resolve, reject) => {
      this.resolveClosing = resolve;
    });
    /** @type {NetworkManager} */
    this.manager = manager;
  }
  request(data, timeout=1000) {
    data.id = this.messageId++;
    const receiver = new Receiver(data.id);
    this.receivers.push(receiver);
    this.port.postMessage(data);
    if (timeout)
      setTimeout(receiver.reject, timeout);
    this.closing.then(receiver.reject);
    return receiver.promise;
  }
  notify(data) {
    this.port.postMessage(data);
  }
  start() {
    this.port.addEventListener('message', (msgEvent) => {
      if (this._resolveResponse(msgEvent))
        return true;
      this._resolveRequest(msgEvent);
    });
    this.port.start();
    return this.starting;
  }
  _resolveRequest(msgEvent) {
    if (msgEvent.data === 'unregister-neural-network') {
      clearTimeout(this.pingTimeout);
      this.resolveClosing();
    } else if (msgEvent.data.type === 'evaluate') {
      this.manager.evaluate(msgEvent.data.input, this)
        .then(resultMsgEvent => this.notify({
          id: msgEvent.data.id,
          output: resultMsgEvent.data.output,
        }));
    } else if (msgEvent.data.type === 'register-neural-network') {
      this.name = msgEvent.data.nnName;
      this.canServe = msgEvent.data.canServe;
      this._ping();
      this.resolveStarting();
    }
  }
  _resolveResponse(messageEvent) {
    const messageData = messageEvent.data;
    let suitableReceiver = null;
    for (const receiver of this.receivers) {
      if (receiver.messageId === messageData.id) {
        suitableReceiver = receiver;
        break;
      }
    }
    if (suitableReceiver === null)
      return false;
    suitableReceiver.resolve(messageEvent);
    this.receivers = this.receivers.filter(rec => rec !== suitableReceiver);
    return true;
  }
  _ping() {
    this.request({ type: 'ping' }, 5000).then(() => {
      this.pingTimeout = setTimeout(this._ping.bind(this), 1000);
    }, () => {
      this.port.close();
      this.resolveClosing();
    });
  }
}

class NetworkManager {
  constructor() {
    /** @type {Client[]} */
    this.clients = [];
    /** @type {Client[]} */
    this.servers = [];
    /** @type {?Object} */
    this.currentEvaluation = null;
  }
  evaluate(data, client) {
    let resolve;
    const promise = new Promise(arg0 => {
      resolve = arg0;
    });
    const evaluation = {
      data: data,
      client: client,
      processing: promise,
      resolve: resolve,
    };
    if (this.currentEvaluation === null)
      this._evaluate(evaluation);
    else
      this.currentEvaluation.processing.then(() => this._evaluate(evaluation));
    return promise;
  }
  _evaluate(evaluation) {
    this.currentEvaluation = evaluation;
    this.selectServer(evaluation.client.name);
    const server = this.getServer(evaluation.client.name);
    if (server) {
      server.request({
        type: 'evaluate',
        input: evaluation.data,
      }).then(evaluation.resolve, () => this._evaluate(evaluation));
    } else {
      console.warn(`No server registered for evaluation of ${evaluation.client.name}`, {
        evaluation: evaluation,
        manager: this,
      });
      setTimeout(() => this._evaluate(evaluation), 1000);
    }
  }
  hasServer(name) {
    return this.servers.some(server => server.name === name);
  }
  getServer(name) {
    return this.servers.find(server => server.name === name);
  }
  addClient(event) {
    const client = new Client(event.ports[0], this);
    client.start()
      .then(() => this.clients.push(client))
      .then(() => {
        client.closing
          .then(() => this.clients = this.clients.filter(c => c !== client))
          .then(() => this.servers = this.servers.filter(c => c !== client));
      })
      .then(() => this.selectServer(client.name));
  }
  selectServer(name) {
    if (!this.hasServer(name)) {
      /** @type {?Client} */
      const server = this.clients.find(client => client.name === name && client.canServe);
      if (server !== undefined) {
        this.clients = this.clients.filter(client => client !== server);
        this.servers.push(server);
      }
      return true;
    } else {
      return false;
    }
  }
}

class Receiver {
  constructor(messageId) {
    this.messageId = messageId;
    this.promise = new Promise((yes, no) => {
      this.resolve = yes;
      this.reject = no;
    })
  }
}

const manager = new NetworkManager();

addEventListener('connect', (e) => {
  manager.addClient(e);
});
