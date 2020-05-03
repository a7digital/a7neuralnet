define(['ndarray', 'onnx'], function (ndarray, onnx) {
  class Receiver {
    constructor(messageId) {
      this.messageId = messageId;
      this.promise = new Promise((yes, no) => {
        this.resolve = yes;
        this.reject = no;
      })
    }
  }

  class NeuralNetwork {
    constructor(name, outputConfiguration) {
      this._isLoadingInitiated = false;
      this._resolveLoading = null;
      this._rejectLoading = null;
      this.loading = new Promise((yes, no) => {
        this._resolveLoading = yes;
        this._rejectLoading = no;
      });
      this.inferenceSession = new onnx.InferenceSession();
      this.name = name;
      this.loadModel = null;
      this._modelBlob = null;
      this._networkManager = new SharedWorker('/typo3conf/ext/a7neuralnet/Resources/Public/JavaScript/NeuralNetworkSharedWorker.js');
      this._networkManager.port.addEventListener('message', this._processNetworkManagerMessage.bind(this));
      this._networkManager.port.start();
      this._isRegisteredWithNetworkManager = false;
      this._receivers = [];
      this._messageId = 0;
      this._outputConfiguration = outputConfiguration;
      this._labelLoading = new Promise((yes, no) => {
        this._resolveLabelLoading = yes;
        this._rejectLabelLoading = no;
      });
      this._labels = null;
    }

    _processNetworkManagerMessage(messageEvent) {
      if (messageEvent.data.type === 'ping') {
        this._sendNetworkManagerMessage({id: messageEvent.data.id, type: "pong"});
      } else if (messageEvent.data.type === 'evaluate') {
        this._evaluateLocally(messageEvent.data.input)
          .then(result => this._sendNetworkManagerMessage({
            id: messageEvent.data.id,
            output: result,
          }));
      } else {
        const messageData = messageEvent.data;
        let suitableReceiver = null;
        for (const receiver of this._receivers) {
          if (receiver.messageId === messageData.id) {
            suitableReceiver = receiver;
            break;
          }
        }
        if (suitableReceiver === null)
          return;
        suitableReceiver.resolve(messageEvent);
        this._receivers = this._receivers.filter(rec => rec !== suitableReceiver);
      }
    }

    _sendNetworkManagerRequest(data, timeout=1000) {
      data.id = --this._messageId;
      const receiver = new Receiver(data.id);
      this._receivers.push(receiver);
      this._sendNetworkManagerMessage(data);
      if (timeout)
        setTimeout(receiver.reject, timeout);
      return receiver.promise;
    }

    _sendNetworkManagerMessage(data) {
      this._networkManager.port.postMessage(data);
    }

    /**
     * @param {Response} response
     */
    readModelHttpResponse(response) {
      return response.blob()
        .then((blob) => this.readModelBlob(blob));
    }

    readModelBlob(blob) {
      return this.inferenceSession.loadModel(blob)
        .then(this._resolveLoading, this._rejectLoading);
    }

    _registerWithNetworkManager(canEvaluate) {
      if (!this._isRegisteredWithNetworkManager) {
        this._sendNetworkManagerMessage({
          type: 'register-neural-network',
          nnName: this.name,
          canServe: canEvaluate,
        });
        this._isRegisteredWithNetworkManager = true;
      }
    }

    _evaluateLocally(input) {
      let getResult;
      if (this._isLoadingInitiated)
        getResult = this.loading
          .then(() => this.inferenceSession.run(input));
      else if (this.loadModel) {
        this._isLoadingInitiated = true;
        getResult = this.loadModel()
          .then(() => this.inferenceSession.loadModel(this._modelBlob))
          .then(this._resolveLoading, this._rejectLoading)
          .then(() => this.inferenceSession.run(input))
      }
      getResult.then(result => console.log(`${this.name} result`, result));
      return getResult
        .then(result => [...result.values()].map(entry => entry.data));
    }

    _loadLabels(url) {
      if (this._labels)
        return this._labelLoading;
      return fetch(url)
        .then(response => response.text())
        .then(text => {
          const labels = text.split('\n').filter(label => label.length > 0);
          this._labels = labels
          this._resolveLabelLoading(labels);
          return this._labels;
        })
    }

    _postprocess(outputs) {
      if (this._outputConfiguration) {
        if (this._outputConfiguration.type === 'multi-class') {
          return this._loadLabels(this._outputConfiguration.labels)
            .then(labels => outputs.map(output => labels.map((label, i) => [label, output[i]])))
            .then(itemLists => this._outputConfiguration.threshold !== undefined ? itemLists.map(items => items.filter(([_, value]) => value >= this._outputConfiguration.threshold)) : itemLists)
            .then(itemLists => {
              const dicts = [];
              for (const items of itemLists) {
                const dict = {};
                for (const [label, value] of items)
                  dict[label] = value;
                dicts.push(dict);
              }
              return dicts;
            });
        }
      }
      return new Promise(resolve => resolve(output));
    }

    evaluate(input) {
      this._registerWithNetworkManager(false);
      return this._sendNetworkManagerRequest({
          type: 'evaluate',
          input: input,
        }, null)
        .then(messageEvent => messageEvent.data.output)
        .then(this._postprocess.bind(this));
    }

    evaluateSingle(input) {
      return this.evaluate([input])
        .then(result => result[0]);
    }

    makeLoadable(url, progressCallback) {
      this.loadModel = () => {
        this._isLoadingInitiated = true;
        return caches.match(url).then((response) => {
          if (response !== undefined) {
            return this.readModelHttpResponse(response)
              .then(() => progressCallback(1));
          } else {
            return this._loadModelWithProgressBar(url, progressCallback);
          }
        }, error => {
          this._rejectLoading(error);
          progressCallback(1);
          return error;
        });
      };
      this._registerWithNetworkManager(true);
    }

    _loadModelWithProgressBar(url, progressCallback) {
      progressCallback(0);
      let lenTotal;
      return fetch(url)
        .then(response => {
          lenTotal = +response.headers.get('Content-Length');
          if (lenTotal === 0)
            progressCallback(null);
          return response.body;
        })
        .then(body => {
          const reader = body.getReader();
          let lenReceived = 0;
          return new ReadableStream({
            start(controller) {
              return pump();

              function pump() {
                return reader.read().then(({done, value}) => {
                  if (done) {
                    controller.close();
                    return;
                  }
                  lenReceived += value.byteLength;
                  if (lenTotal !== 0) {
                    progressCallback(lenReceived / lenTotal);
                  }
                  controller.enqueue(value);
                  return pump();
                });
              }
            }
          });
        })
        .then(stream => new Response(stream))
        .then(response => caches.open(url)
          .then(cache => cache.put(url, response.clone()))
          .then(() => response)
        )
        .then(response => response.blob())
        .then(blob => this.readModelBlob(blob))
        .then(() => progressCallback(1),
          error => {
            progressCallback(1);
            console.error(`Could not load neural network ${this.name}.`, error);
          });
    }
  }

  class ConvolutionalNeuralNetwork extends NeuralNetwork {
    constructor(name, outputConfiguration, imageWidth, imageHeight, channels=null, fillMode="fit-black", inputValueRange=null) {
      super(name, outputConfiguration);
      this.imageWidth = imageWidth;
      this.imageHeight = imageHeight;
      this.channels = channels ?? [ConvolutionalNeuralNetwork.CHANNEL_RED, ConvolutionalNeuralNetwork.CHANNEL_GREEN, ConvolutionalNeuralNetwork.CHANNEL_BLUE];
      this.fillMode = fillMode;
      this.inputValueRange = inputValueRange ?? [-1, 1];
    }
    evaluateImage(imageUri) {
      return this._toDataArray(imageUri)
        .then(data => this._toTensor(data))
        .then(tensor => this.evaluateSingle(tensor));
    }
    _toDataArray(imageUri) {
      const canvas = document.createElement('canvas');
      canvas.width = this.imageWidth;
      canvas.height = this.imageHeight;
      const canvasContext = canvas.getContext('2d');
      const img = new Image();
      img.crossOrigin = "anonymous";
      return (new Promise((yes, no) => {
        img.addEventListener('load', () => yes(img));
        img.addEventListener('error', err => no(`Unable to load image '${imageUri}'.`));
        img.src = imageUri;
      }))
        .then(img => {
          if (img.width === 0)  // probably SVG
            img.width = this.imageWidth;
          if (img.height === 0)  // probably SVG
            img.height = this.imageHeight;
          const scaling = Math.min(this.imageWidth / img.width, this.imageHeight / img.height);
          const newWidth = scaling * img.width;
          const newHeight = scaling * img.height;
          switch (this.fillMode) {
            case 'fit-black':
              canvasContext.fillStyle = "black";
              canvasContext.fillRect(0, 0, this.imageWidth, this.imageHeight);
              canvasContext.drawImage(img, 0, 0, img.width, img.height, (this.imageWidth - newWidth) / 2, (this.imageHeight - newHeight) / 2, newWidth, newHeight);
              break;
            default:
              throw new Error(`Fill mode ${this.fillMode} is not implemented.`);
          }
          return canvasContext;
        })
        .then(canvasContext => canvasContext.getImageData(0, 0, this.imageWidth, this.imageHeight).data);
    }
    _toTensor(data) {
      const dataFromImage = ndarray(new Float32Array(data), [this.imageWidth, this.imageHeight, 4]);
      const dataProcessed = ndarray(new Float32Array(this.imageWidth * this.imageHeight * this.channels.length), [this.imageHeight, this.imageWidth, this.channels.length]);

      ndarray.ops.divseq(dataFromImage, 255.0 / (this.inputValueRange[1] - this.inputValueRange[0]));
      ndarray.ops.addseq(dataFromImage, this.inputValueRange[0]);

      for (let newIndex in this.channels) {
        newIndex = +newIndex;
        const oldIndex = this.channels[newIndex];
        ndarray.ops.assign(dataProcessed.pick(null, null, newIndex), dataFromImage.pick(null, null, oldIndex));
      }

      return new onnx.Tensor(dataProcessed.data, 'float32', [1, 150, 150, this.channels.length]);
    }

    _broadcastRespond(channel, action, data, id) {
      if (action === 'evaluateImage') {
        this.evaluateImage(data)
          .then(result => channel.postMessage({
            id: id,
            result: result,
          }), error => channel.postMessage({
            id: id,
            error: `${error.toString()} @ ${error.filename}:${error.lineNumber} @ ${error.stack}`,
          }))
      } else {
        super._broadcastRespond(channel, action, data, id);
      }
    }
  }
  ConvolutionalNeuralNetwork.CHANNEL_RED = 0;
  ConvolutionalNeuralNetwork.CHANNEL_GREEN = 1;
  ConvolutionalNeuralNetwork.CHANNEL_BLUE = 2;
  ConvolutionalNeuralNetwork.CHANNEL_ALPHA = 3;

  return {
    NeuralNetwork: NeuralNetwork,
    ConvolutionalNeuralNetwork: ConvolutionalNeuralNetwork,
  };

});
