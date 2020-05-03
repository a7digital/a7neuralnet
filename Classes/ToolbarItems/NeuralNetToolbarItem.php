<?php
namespace A7digital\A7neuralnet\ToolbarItems;

use TYPO3\CMS\Backend\Toolbar\ToolbarItemInterface;
use TYPO3\CMS\Core\Page\PageRenderer;
use TYPO3\CMS\Core\Utility\GeneralUtility;
use TYPO3\CMS\Fluid\View\StandaloneView;

/***************************************************************
 *  Copyright notice
 *
 *  (c) 2020, a7digital GmbH
 *
 *  This script is part of the TYPO3 project. The TYPO3 project is
 *  free software; you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation; either version 2 of the License, or
 *  (at your option) any later version.
 *
 *  The GNU General Public License can be found at
 *  http://www.gnu.org/copyleft/gpl.html.
 *
 *  This script is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  This copyright notice MUST APPEAR in all copies of the script!
 ***************************************************************/

class NeuralNetToolbarItem implements ToolbarItemInterface
{
    public function __construct()
    {
        $this->getPageRenderer()->loadRequireJsModule('TYPO3/CMS/A7neuralnet/ToolbarIcon');
        $this->getPageRenderer()->addCssFile('EXT:a7neuralnet/Resources/Public/Style/a7neuralnetwork-toolbar.css');
    }

    /**
     * Returns current PageRenderer
     *
     * @return PageRenderer
     */
    protected function getPageRenderer()
    {
        return GeneralUtility::makeInstance(PageRenderer::class);
    }

    /**
     * @inheritDoc
     */
    public function checkAccess()
    {
        return true;
    }

    /**
     * @inheritDoc
     */
    public function getItem()
    {
        $view = $this->getFluidTemplateObject('NeuralNetToolbarItem.html');
        $config = $GLOBALS['TYPO3_CONF_VARS']['EXTCONF']['a7neuralnet'];
        $view->assignMultiple([
            'config' => $config,
            'configJson' => json_encode($config),
        ]);
        return $view->render();
    }

    /**
     * @inheritDoc
     */
    public function hasDropDown()
    {
        return false;
    }

    /**
     * @inheritDoc
     */
    public function getDropDown()
    {
        return null;
    }

    /**
     * @inheritDoc
     */
    public function getAdditionalAttributes()
    {
        return [];
    }

    /**
     * @inheritDoc
     */
    public function getIndex()
    {
        return 50;
    }

    /**
     * Returns a new standalone view, shorthand function
     *
     * @param string $filename Which templateFile should be used.
     *
     * @return StandaloneView
     * @throws \TYPO3\CMS\Extbase\Mvc\Exception\InvalidExtensionNameException
     */
    protected function getFluidTemplateObject(string $filename): StandaloneView
    {
        $view = GeneralUtility::makeInstance(StandaloneView::class);
        $view->setLayoutRootPaths(['EXT:a7neuralnet/Resources/Private/Layouts']);
        $view->setPartialRootPaths(['EXT:a7neuralnet/Resources/Private/Partials/ToolbarItems']);
        $view->setTemplateRootPaths(['EXT:a7neuralnet/Resources/Private/Templates/ToolbarItems']);

        $view->setTemplate($filename);

        $view->getRequest()->setControllerExtensionName('A7neuralnet');
        return $view;
    }
}
