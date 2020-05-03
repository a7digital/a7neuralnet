<?php

if (TYPO3_MODE=="BE" )   {
    $GLOBALS['TYPO3_CONF_VARS']['EXTCONF']['a7neuralnet'] = [
        'nets' => []
    ];
    $GLOBALS['TYPO3_CONF_VARS']['BE']['toolbarItems'][1586179421] = \A7digital\A7neuralnet\ToolbarItems\NeuralNetToolbarItem::class;
    $iconRegistry = \TYPO3\CMS\Core\Utility\GeneralUtility::makeInstance(\TYPO3\CMS\Core\Imaging\IconRegistry::class);
    $iconRegistry->registerIcon(
        'a7neuralnet-toolbar-icon',
        \TYPO3\CMS\Core\Imaging\IconProvider\SvgIconProvider::class,
        ['source' => 'EXT:a7neuralnet/Resources/Public/Image/toolbar-icon.svg']
    );

    $pageRenderer = \TYPO3\CMS\Core\Utility\GeneralUtility::makeInstance(\TYPO3\CMS\Core\Page\PageRenderer::class);
    $pageRenderer->addRequireJsConfiguration(
        [
            'paths' => [
                'ndarray' => '../typo3conf/ext/a7neuralnet/Resources/Public/JavaScript/ndarray.min',
                'onnx' => '../typo3conf/ext/a7neuralnet/Resources/Public/JavaScript/onnx.min',
            ],
            'shim' => [
                'ndarray' => ['exports' => 'ndarray' ],
                'onnx' => [
                    'deps' => ['ndarray'],
                    'exports' => 'onnx',
                ],
            ],
        ]
    );
}
