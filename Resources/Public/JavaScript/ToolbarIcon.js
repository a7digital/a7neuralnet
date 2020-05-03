define(['TYPO3/CMS/A7neuralnet/NeuralNetworkManager'], function (nnm) {
  const toolbarIcon = document.querySelector('.a7neuralnet-toolbar');
  const settings = TYPO3.settings.a7neuralnet;
  for (const netName in settings.nets) {
    const netConfig = settings.nets[netName];
    const model = nnm.get(netName);
    model.makeLoadable(netConfig.url, writeLoadingProgress)
  }

  function writeLoadingProgress(progress) {
    if (progress === null)
      toolbarIcon.querySelector('progress').removeAttribute('value');
    else
      toolbarIcon.querySelector('progress').value = progress;
    if (progress === 1)
      toolbarIcon.classList.add('active')
  }
});
