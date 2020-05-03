define(['TYPO3/CMS/A7neuralnet/NeuralNetwork'], function (nn) {
  class Manager {
    constructor() {
      this._nets = [];
    }
    addConfig(netConfig) {
      let netAvailable = false;
      for (const net of this._nets) {
        if (net.name === netConfig.name) {
          netAvailable = true;
          break;
        }
      }
      if (!netAvailable) {
        let net;
        switch (netConfig.type) {
          case 'feed-forward':
            net = new nn.NeuralNetwork(netConfig.name, netConfig.output);
            break;
          case 'convolutional':
            net = new nn.ConvolutionalNeuralNetwork(netConfig.name, netConfig.output, netConfig.input.width, netConfig.input.height, netConfig.input.channels, netConfig.input.fillMode, netConfig.input.valueRange);
            break;
          default:
            throw new Error(`Unknown net type "${netConfig.type}"!`);
        }
        this._nets.push(net);
      }
    }

    getAll() {
      return [...this._nets];
    }

    /**
     * @param {string} name The name of the neural net to be loaded
     * @returns {?nn.NeuralNetwork}
     */
    get(name) {
      for (const net of this._nets)
        if (net.name === name)
          return net;
      return null;
    }
  }

  const settings = TYPO3.settings.a7neuralnet;
  const manager = new Manager();
  for (const netName in settings.nets) {
    const netConfig = settings.nets[netName];
    netConfig.name = netName;
    manager.addConfig(netConfig);
  }
  return manager;
});
