//## Marionette.NavController

Marionette.NavController = Marionette.View.extend({

    // Extending views should make sure to retain the "NavController" class
    // or sliding transitions may not work properly.
    className: "NavController",

    ui: {
        mainContainer: ">.main-container",
        leftView: ">.main-container >.left-view",
        middleView: ">.main-container >.middle-view",
        rightView: ">.main-container >.right-view",
        modalContainer: ">.modal-container"
    },

    fui: ["mainContainer", "leftView", "middleView", "rightView", "modalContainer"],
    
    TRANSITION_CLASSES: "slide-left slide-right",

    // ## Marionette.View Overrides

    /**
     * ### NavController Constructor
     *
     * Creates a new NavController instance. Input argument `options` is an
     * object that takes any of the keys:
     *
     * * `hidesNavBar`: *boolean* Sets default nav bar visibility setting for
     *      child views Overrided by child view options (default: `false`).
     * * `hidesBackButton`: *boolean* Sets default nav bar back button visibility
     *      setting for child views Overrided by child view options (default: `false`).
     * * `showsCloseButton`: *boolean* Sets default nav bar close button visibility
     *      setting for child views. Overrided by child view options (default: `false`).
     * * `disableNavBarTransition`: *boolean* If `true`, NavBar will stay static
     *      during transitions. Overrided by child view options (default: `false`).
     * * `bIsPopup`: *boolean* If `true`, the `.main-container` div will be
     *      wrapped by a `.panel` div (for non-fullscreen NavControllers).
     *      Extending views should provide a style for this element.
     */
    constructor: function(options) {
        options = options || {};
        this.viewStack = [];
        this.popStack = [];
        this.bIsTransitionActive = false;
        Marionette.View.prototype.constructor.call(this, options);

        // Create NavBar instance and listen to its events; each NavController
        // instance has a single NavBar instance.
        this.navBar = new Marionette.Controls.NavBar({ outletName: "navBar" });
        this.listenTo(this.navBar, "Back:navBar", this.onNavBarBack);
        this.listenTo(this.navBar, "Close:navBar", this.onNavBarClose);

        // Handle non-fullscreen NavController instances (`bIsPopup == true`).
        if (options.bIsPopup) {

            // Update `ui` selectors. `fui` does not need to be updated because
            // this is all happening prior to `bindUIElements()`, which is called
            // in `render()`.
            this.ui = {
                mainContainer: ">.panel >.main-container",
                leftView: ">.panel >.main-container >.left-view",
                middleView: ">.panel >.main-container >.middle-view",
                rightView: ">.panel >.main-container >.right-view",
                modalContainer: ">.modal-container"
            };
        }
    },

    /**
     * ### render
     *
     * Override Marionette.View render method to handle rendering manually.
     * Super's method is never called.
     */
    render: function() {
        this.isDestroyed = false;
        if (!this.options.bIsPopup) {
            this.el.innerHTML = '<div class="main-container"><div class="left-view"></div><div class="middle-view"></div><div class="right-view"></div></div><div class="modal-container"></div>';

        } else {
            this.el.innerHTML = '<div class="panel"><div class="main-container"><div class="left-view"></div><div class="middle-view"></div><div class="right-view"></div></div></div><div class="modal-container"></div>';
        }

        // Bind `ui` selectors; also caches DOM elements specified in `fui`,
        // render the NavBar and call `this.onRender()`.
        this.bindUIElements();
        this.navBar.render();
        this.onRender && this.onRender();

        // If `setRootView()` was called prior to rendering the NavController
        // instance, push that view into the stack now.
        if (this.pendingRootView) {
            this.changeRoot(this.pendingRootView.view, this.pendingRootView.bSlideToRight, this.pendingRootView.loadingTemplate);
            this.pendingRootView = null;
        }
        return this;
    },

    /**
     * ### destroy
     *
     * Override Marionette.View destroy method to free NavController-specific
     * objects. Calls super method.
     */
    destroy: function() {
        this.loadingEl && this.loadingEl.parentNode && this.loadingEl.parentNode.removeChild(this.loadingEl);
        this.loadingEl = null;

        if (this.navBarClone && this.navBarClone.parentNode) {
            this.navBarClone.parentNode.removeChild(this.navBarClone);
        }
        this.navBarClone = null;

        if (this.navBar && this.navBar.destroy) {
            this.navBar.destroy();
        }
        this.navBar = null;

        if (this.modalView && this.modalView.destroy) {
            this.modalView.destroy();
        }
        this.modalView = null;

        this._purgeViewStack();
        this._purgePopStack();
        this.stopListening();
        Marionette.View.prototype.destroy.apply(this, arguments);
    },

    // ## Public Methods ##

    /**
     * ### isRendered
     *
     * Returns whether this view the NavController has been rendered or not.
     *
     * @this NavController
     * @returns {boolean}
     */
    isRendered: function() {
        return (!this.isDestroyed && typeof this.ui.mainContainer !== "string");
    },

    /**
     * ### setRootView
     *
     * Sets root view of NavController. If NavController has not yet been rendered,
     * the view will be stored until NavController instance is rendered.
     *
     * @this NavController
     * @param {Marionette.View} view The view to set as root view. Required.
     * @param {boolean} bSlideToRight Default transition direction is left.
     *  If `true`, transition direction will be reversed (default: `false`).
     * @param {string} loadingTemplate Optionally specify HTML string to display
     *  while view transitions in. A classname of `.navControllerLoading` will
     *  be added to the resulting element `this.loadingEl` (default: `undefined`).
     */
    setRootView: function(view, bSlideToRight, loadingTemplate) {
        if (!this.isRendered()) {
            this.pendingRootView = {
                view: view,
                bSlideToRight: bSlideToRight,
                loadingTemplate: loadingTemplate
            };
            return this;
        }
        return this.changeRoot.apply(this, arguments);
    },

    /**
     * ### changeRoot
     *
     * Changes the root (top-level) view and sets `bIsNewRoot` which causes
     * all other views in the stack to be destroyed when new view finishes
     * transitioning in.
     *
     * @this NavController
     * @param {Marionette.View} view The view to set as root view. Required.
     * @param {boolean} bSlideToRight Default transition direction is left.
     *  If `true`, transition direction will be reversed (default: `false`).
     * @param {string} loadingTemplate Optionally specify HTML string to display
     *  while view transitions in. A classname of `.navControllerLoading` will
     *  be added to the resulting element `this.loadingEl` (default: `undefined`).
     */
    changeRoot: function(view, bSlideToRight, loadingTemplate) {
        if (this.isDestroyed) return;
        if (!this.hasRootView) {
            return this._renderInitialView(view);
        }
        this.dismissModalView();
        this.bIsNewRoot = true;
        return this.pushView(view, bSlideToRight, loadingTemplate);
    },

    /**
     * ### pushView
     *
     * Pushes a view instance onto the stack and initiates the transition animation
     * as well as other related functionality.
     *
     * @this NavController
     * @param {Marionette.View} inboundView The view to push onto the stack. Required.
     * @param {boolean} bSlideToRight Default transition direction is left.
     *      If `true`, transition direction will be reversed (default: `false`).
     * @param {string} loadingTemplate Optionally specify HTML string to display
     *      while view transitions in. A classname of `.navControllerLoading` will
     *      be added to the resulting element `this.loadingEl` (default: `undefined`).
     */
    pushView: function(inboundView, bSlideToRight, loadingTemplate) {
        if (this.isDestroyed || this.bIsTransitionActive) return;
        if (!this.hasRootView) {
            return this._renderInitialView(inboundView);
        }
        this.bIsTransitionActive = true;

        // Setup variables for the method to use for sliding, and the inbound
        // and outbound elements depending on the animation slide direction.
        var slideMethod, inboundEl,
            outboundEl = this.fui.middleView;
        if (bSlideToRight) {
            slideMethod = this._applyClassSlideRight;
            inboundEl = this.fui.leftView;
        } else {
            slideMethod = this._applyClassSlideLeft;
            inboundEl = this.fui.rightView;
        }

        // Setup proper NavBar CSS class for inbound/outbound containers, depending
        // on individual (view) and global (NavController) NavBar options.
        this._adjustElementsForNavBar(inboundEl, inboundView, outboundEl);

        // Clone NavBar and append to outbound element (if needed). NavBar
        // clone is recycled when possible.
        if (!this.currentView.options.disableNavBarTransition && !this.options.disableNavBarTransition) {
            if (!this.navBarClone || this.navBar.bStateChanged) {
                this._cloneNavBarForOutView(outboundEl);
            } else {
                this._appendNavBarCloneToOutboundEl(outboundEl);
            }
        }

        // Setup NavBar for inbound element, show both sides, and append
        // inbound view to the correct element.
        this._initNavBarForNextView(inboundView, inboundEl);
        outboundEl.style.display = "block";
        inboundEl.style.display = "block";

        // Begin the transition animation and call the transition completion
        // listener for platforms we're not supporting transitions for (non-WebKit).
        if (loadingTemplate) {
            // A loadingTemplate was specified; show it, and then initiate slide
            // transition animation with the loadingTemplate immediately.
            if (!this.loadingEl) {
                this.loadingEl = document.createElement("div");
            }
            this.loadingEl.className = "navControllerLoading";
            this.loadingEl.innerHTML = loadingTemplate;
            inboundEl.appendChild(this.loadingEl);

            slideMethod.call(this);

            requestAnimationFrame(_.bind(function(){
                requestAnimationFrame(_.bind(function(){

                    this.loadingEl && this.loadingEl.parentNode && this.loadingEl.parentNode.removeChild(this.loadingEl);
                    this.loadingEl = null;

                    this._renderAndAppendToEl.call(this, inboundView, inboundEl);

                    // Ensure `onSlideTransitionEnd()` is called on platforms that are
                    // not WebKit-based (they won't receive webkitTransitionEnd events).
                    if (!(navigator.userAgent.toLowerCase().indexOf("webkit") !== -1)) {
                        requestAnimationFrame(_.bind(this._onSlideTransitionEnd, this));
                    }
                }, this));
            }, this));

        } else {
            // No loading template was specified; remove from DOM if a loading
            // element exists and free the reference.
            this.loadingEl && this.loadingEl.parentNode && this.loadingEl.parentNode.removeChild(this.loadingEl);
            this.loadingEl = null;

            this._renderAndAppendToEl.call(this, inboundView, inboundEl);

            // Initiate the slide transition, or call the completion listener
            // without slide transition for non-WebKit platforms.
            if ((navigator.userAgent.toLowerCase().indexOf("webkit") !== -1)) {
                requestAnimationFrame(_.bind(slideMethod, this));
            } else {
                requestAnimationFrame(_.bind(this._onSlideTransitionEnd, this));
            }
        }

        // Set reference to the currently active view and push onto the view stack;
        // If this view exists in the stack, it will be moved to the end of the stack
        // to avoid duplicate view references.
        this.currentView = inboundView;
        var indexOfView = this.viewStack.indexOf(inboundView);
        this.viewStack.push((indexOfView > -1) ? this.viewStack.splice(indexOfView, 1)[0] : inboundView);
        return this;
    },

    /**
     * ### popView
     *
     * Removes one or more views from the end of the stack and initiates a transition
     * to the view to be at the end of the stack. If stack contains less than
     * two views, the NavController instance will be destroyed.
     *
     * @this NavController
     * @param {integer} distance The amount of views to pop from the stack (default: 1).
     */
    popView: function(distance) {
        if (this.isDestroyed) return;
        distance = distance || 1;
        if (this.viewStack.length < 2 || !this.currentView) {
            return this.popToClose();
        }

        if ((this.viewStack.length - distance) < 0) {
            console.log("Cannot pop to distance (" + distance + "). View stack index out of range.");
            return this;
        }

        // Push all views past distance into the popStack (to be destroyed after
        // transition completes) and initiate a new transition via `pushView()`.
        var i, nextView = this.viewStack[this.viewStack.length - 1 - distance];

        for (i = this.viewStack.length-distance; i < this.viewStack.length; ++i) {
            this.popStack.push(this.viewStack[i]);
        }
        return this.pushView(nextView, true);
    },

    /**
     * ### popToClose
     *
     * Destroys the NavController instance.
     *
     * @this NavController
     */
    popToClose: function() {
        if (this.isDestroyed) return;
        this.destroy();
    },

    /**
     * ### presentModalView
     *
     * Renders and displays a view above all other views in the stack, inserting
     * into the `.modal-container` element.
     *
     * @this NavController
     * @param {Marionette.View} view The view to display in the modal layer.
     */
    presentModalView: function(view) {
        if (this.isDestroyed) return;
        view.navController = this;
        this.modalView = view;
        this._renderAndAppendToEl(view, this.fui.modalContainer);
        this.fui.modalContainer.style.display = "block";
        Marionette.triggerMethod.call(view, "show");

        this.listenTo(view, "destroy", function() {
            view.navController = null;
            this.fui.modalContainer.style.display = "none";
            this.modalView = null;
        });
        return this;
    },

    /**
     * ### dismissModalView
     *
     * Destroy any view in the modal layer and hide the `.modal-container` element
     * so views in the NavController's stack can be interacted with.
     *
     * @this NavController
     */
    dismissModalView: function() {
        if (this.isDestroyed) return;
        if (this.modalView && this.modalView.destroy) {
            this.modalView.destroy();
        }
        this.modalView = null;
        this.fui.modalContainer.innerHTML = "";
        this.fui.modalContainer.style.display = "none";
        return this;
    },

    /**
     * ### setNavTitle
     *
     * Explicity sets NavBar title. It is recommended that child views specify
     * their own NavBar options via `childView.options`.
     *
     * @this NavController
     * @param {string} title The title to appear on the NavBar.
     */
    setNavTitle: function(title) {
        if (this.isDestroyed) return;
        this.navBar && this.navBar.setTitle(title);
    },

    /**
     * ### setNavStyle
     *
     * Sets the style to use for the NavBar.
     *
     * @this NavController
     * @param {string} navStyle Style as specified in `NavBar.navStyles`.
     */
    setNavStyle: function(navStyle) {
        if (this.isDestroyed) return;
        this.navBar && this.navBar.setStyle(navStyle);
    },

    /**
     * ### getNavBar
     *
     * Returns the NavBar instance.
     *
     * @this NavController
     * @returns {Controls.NavBar|*}
     */
    getNavBar: function() {
        return this.navBar;
    },


    /**
     * ### onNavBarBack
     *
     * Event handler for NavBar "Back" event. Also triggers delegate method
     * on current child view if it has `onNavBarBack` implemented. If not
     * implemented or implementing function returns falsey, `popView()` will
     * be called.
     *
     * @this NavController
     */
    onNavBarBack: function() {
        var viewHandler = this.currentView.onNavBarBack;
        if(!viewHandler || (viewHandler && !viewHandler())){
            this.popView();
        }
    },

    /**
     * ### onNavBarClose
     *
     * Event handler for NavBar "Close" event. Also triggers delegate method
     * on current child view if it has `onNavBarClose` implemented. If not
     * implemented or implementing function returns falsey, `popToClose()` will
     * be called.
     */
    onNavBarClose: function() {
        var viewHandler = this.currentView.onNavBarClose;
        if(!viewHandler || (viewHandler && !viewHandler())){
            this.popToClose();
        }
    },

    // ## Private Methods
    // Each private method references a local function in this module.

    /**
     * ### addTransitionEndListener
     *
     * `this._addTransitionEndListener()`
     * Adds transition (completion) listener to the `.main-container` element
     * (`this.ui.mainContainer`).
     *
     * @this NavController
     */
    _addTransitionEndListener: function _addTransitionEndListener() {
        if (!(navigator.userAgent.toLowerCase().indexOf("webkit") !== -1)) return;

        // Using 'on' instead of 'one' because child view animations might trigger
        // the event listener (which checks for this case), get removed automatically,
        // and cause the NavController to get "stuck" on subsequent transitions.
        this.ui.mainContainer.on("transitionend webkitTransitionEnd", _.bind(this._onSlideTransitionEnd, this));
    },

    /**
     * ### cloneNavBarForOutView
     *
     * `this._cloneNavBarForOutView()`:
     * Removes existing navBar clone element and creates a new one; appends to
     * specified element.
     *
     * @this NavController
     * @param {DOM-element} outEl The element to append the NavBar clone to.
     */
    _cloneNavBarForOutView: function _cloneNavBarForOutView(outEl) {
        if (this.navBarClone && this.navBarClone.parentNode) {
            this.navBarClone.parentNode.removeChild(this.navBarClone);
        }
        this.navBarClone = this.navBar.el.cloneNode(true);
        outEl.appendChild(this.navBarClone);
    },

    /**
     * ### appendNavBarCloneToOutboundEl
     *
     * `this._appendNavBarCloneToOutboundEl()`:
     * Appends NavBar clone element to specified element; recycles existing instance
     * or creates new if non-existing.
     *
     * @this NavController
     * @param {DOM-element} outEl The element to append the NavBar clone to.
     */
    _appendNavBarCloneToOutboundEl: function _appendNavBarCloneToOutboundEl(outEl) {
        if (!this.navBarClone) {
            return this._cloneNavBarForOutView(outEl);
        }
        if (this.navBarClone.parentNode) {
            this.navBarClone.parentNode.removeChild(this.navBarClone);
        }
        outEl.appendChild(this.navBarClone);
    },

    /**
     * ### initNavBarForNextView
     *
     * `this._initNavBarForNextView()`:
     * Initializes NavBar state for an inbound view (the one that will be sliding
     * into focus).
     *
     * @this NavController
     * @param {Marionette.View} view The view to initialize NavBar for.
     * @param {DOM-element} inboundEl The DOM element to append the NavBar.
     */
    _initNavBarForNextView: function _initNavBarForNextView(view, inboundEl) {
        // When NavBar transitions are disabled, the NavBar element should be a
        // sibling to the `.main-container` element so it can appear to be static
        // while the transition takes place.
        if (view.options.disableNavBarTransition || this.options.disableNavBarTransition) {
            Marionette.Utils.insertAfterEl(this.navBar.el, this.fui.mainContainer);
        } else {
            inboundEl.appendChild(this.navBar.el);
        }

        this.setNavTitle(view.title || this.navBar.options.title || "");
        this.navBar.setHidesBackButton(view.options.hidesBackButton || this.options.hidesBackButton);
        this.navBar.setShowsCloseButton(view.options.showsCloseButton || this.options.showsCloseButton);

        if (view.options.hidesNavBar || this.options.hidesNavBar) {
            this.navBar.el.style.display = "none";
            Marionette.Utils.removeClass(inboundEl, "with-navbar");
            Marionette.Utils.removeClass(view.el, "navBarIsShown");
        } else {
            this.navBar.el.style.display = "block";
            Marionette.Utils.addClass(inboundEl, "with-navbar");
            Marionette.Utils.addClass(view.el, "navBarIsShown");
        }
    },

    /**
     * ### renderInitialView
     *
     * `this._renderInitialView()`:
     * Handles rendering of initial (root) view without transition animations.
     *
     * @this NavController
     * @param {Marionette.View} view The view to render and set as root.
     */
    _renderInitialView: function _renderInitialView(view) {
        // Purge the view stack (purge all views) and set up the NavController to
        // display the left-side element; append view's element to it.
        var inboundEl = this.fui.middleView;
        this._purgeViewStack();
        this._renderAndAppendToEl(view, inboundEl);

        // Append real navBar to the inbound DOM element (the NavBar clone gets
        // appended to the outbound element elsewhere).
        this._initNavBarForNextView(view, inboundEl);
        this.navBar.bStateChanged = false;

        this.hasRootView = true;
        this.currentView = view;
        this.viewStack.push(view);
        requestAnimationFrame(_.bind(function() {
            Marionette.triggerMethod.call(this, "show");
        }, view));
        return this;
    },

    /**
     * ### renderAndAppendToEl
     *
     * `this._renderAndAppendToEl()`:
     * Renders specified view (if not already rendered) and appends it to specified
     * parent element.
     *
     * @this NavController
     * @param {Marionette.View} view The unrendered view to render and append to
     *      the specified element.
     * @param {DOM-element} parentEl The element to append the rendered view to.
     */
    _renderAndAppendToEl: function _renderAndAppendToEl(view, parentEl) {
        parentEl = parentEl || this.fui.leftView;
        view.navController = this;

        // Only render if the view has not been previously rendered.
        if (!view.el.parentNode) {
            view.render();

            // This flag is checked in the transition completion listener to know
            // if "onShow" should be called on this view after transition concludes.
            this.bNewlyRenderedChild = true;
        }

        // Prepend the view's element to the specified parent element instead
        // of appending in case a loading element is already present (appending
        // would cover the loading element), then make sure the view is visible.
        Marionette.Utils.prependChild(parentEl, view.el);
        view.el.style.display = "block";
    },

    /**
     * ### hideInactiveViews
     *
     * `this._hideInactiveViews()`:
     * Hides all views in the stack that are not the current view as well as the
     * currently off-screen container element.
     *
     * @this NavController
     */
    _hideInactiveViews: function _hideInactiveViews() {
        var i;
        for (i=0; i < this.viewStack.length; ++i) {
            if (this.viewStack[i] !== this.currentView) {
                this.viewStack[i].el.style.display = "none";
            }
        }

        this.fui.leftView.style.display = "none";
        this.fui.rightView.style.display = "none";
    },

    /**
     * ### adjustElementsForNavBar
     *
     * `this._adjustElementsForNavBar()`:
     * Adds or removes 'with-navbar' class to left/right-view containers based on
     * the inbound view's options. This class adjusts the height of the container
     * to make room for a NavBar.
     *
     * @this NavController
     * @param {DOM-element} inboundEl The current inbound element.
     * @param {Marionette.View} inboundView The inbound view instance.
     * @param {DOM-element} outboundEl Optional. The current outbound element.
     */
    _adjustElementsForNavBar: function _adjustElementsForNavBar(inboundEl, inboundView, outboundEl) {
        if (outboundEl) {
            if (this.currentView.options.hidesNavBar || this.options.hidesNavBar) {
                Marionette.Utils.removeClass(outboundEl, "with-navbar");
            } else {
                Marionette.Utils.addClass(outboundEl, "with-navbar");
            }
        }

        if (inboundView.options.hidesNavBar || this.options.hidesNavBar) {
            Marionette.Utils.removeClass(inboundEl, "with-navbar");
        } else {
            Marionette.Utils.addClass(inboundEl, "with-navbar");
        }
    },

    /**
     * ### applyClassSlideLeft
     *
     * `this._applyClassSlideLeft()`:
     * Begins slide transition in the left direction.
     *
     * @this NavController
     */
    _applyClassSlideLeft: function _applyClassSlideLeft() {
        this._addTransitionEndListener();

        requestAnimationFrame(_.bind(function() {
            Marionette.Utils.updateElementClass(this.fui.mainContainer, this.TRANSITION_CLASSES.split(" "), ["slide-left"]);
        }, this));
    },

    /**
     * ### applyClassSlideRight
     *
     * `this._applyClassSlideRight()`:
     * Begins slide transition in the right(hand) direction.
     *
     * @this NavController
     */
    _applyClassSlideRight: function _applyClassSlideRight() {
        this._addTransitionEndListener();

        requestAnimationFrame(_.bind(function() {
            Marionette.Utils.updateElementClass(this.fui.mainContainer, this.TRANSITION_CLASSES.split(" "), ["slide-right"]);
        }, this));
    },

    /**
     * ### purgePopStack
     *
     * `this._purgePopStack()`:
     * Destroys all views in `this.popStack` array and resets its length to zero.
     *
     * @this NavController
     */
    _purgePopStack: function _purgePopStack() {
        var i, indexOfViewInStack = -1;
        for (i = this.popStack.length - 1; i >= 0; --i) {
            // Remove from `this.viewStack` array before destroying.
            indexOfViewInStack = this.viewStack.indexOf(this.popStack[i]);
            if (indexOfViewInStack > -1) {
                this.viewStack.splice(indexOfViewInStack, 1);
            }
            this.popStack[i].destroy();
        }
        this.popStack.length = 0;
    },

    /**
     * ### purgeViewStack
     *
     * `this._purgeViewStack()`:
     * Destroys all views in the viewStack[]; optionally, a view can be excluded.
     *
     * @this NavController
     * @param {Marionette.View} viewToKeep Optionally prevent destroy/removal of
     *      this view.
     */
    _purgeViewStack: function _purgeViewStack(viewToKeep) {
        var inboundEl = this.fui.leftView,
            outboundEl = this.fui.rightView,
            i;

        for (i = this.viewStack.length - 1; i >= 0; --i) {
            if (viewToKeep !== this.viewStack[i]) {
                this.viewStack[i].destroy();
            }
        }
        inboundEl.innerHTML = "";
        outboundEl.innerHTML = "";
        this.viewStack.length = 0;
        this.hasRootView = false;
        this.currentView = null;

        // When preserving a view, add it to the `.left-side` element similar to
        // `renderInitialView()` behavior.
        if (viewToKeep) {
            inboundEl.appendChild(viewToKeep.el);
            this._initNavBarForNextView(viewToKeep, inboundEl);
            this.viewStack.push(viewToKeep);
            this.currentView = viewToKeep;
            this.hasRootView = true;
        }
    },

    // ## Local Functions

    /**
     * ### onSlideTransitionEnd
     *
     * Event handler for `transitionend`/`webkitTransitionEnd` events. For platforms
     * that we are not using CSS transitions, this function will be called directly.
     *
     * @this NavController
     * @param {object} e Event data for CSS
     */

    _onSlideTransitionEnd: function _onSlideTransitionEnd(e) {
        if (e) {
            e.stopPropagation();
            if (e.target.className.indexOf("main-container") < 0) {
                return;
            }
        }
        if (!this.bIsTransitionActive) return;

        // If the transition ended as a result of setting a new root view, destroy
        // all views except for the new root view.
        if (this.bIsNewRoot) {
            this._purgeViewStack(this.currentView);
            this.bIsNewRoot = null;
        }

        this._hideInactiveViews();
        this._purgePopStack();

        // Clone NavBar for next push; if the next transition doesn't change NavBar
        // options, we can recycle the NavBar clone later.
        if (this.navBarClone && this.navBarClone.parentNode) {
            this.navBarClone.parentNode.removeChild(this.navBarClone);
        }
        this.navBarClone = this.navBar.el.cloneNode(true);
        this.navBar.bStateChanged = false;

        // change DOM ownership
        while (this.fui.leftView.lastChild || this.fui.rightView.lastChild) {
            this.fui.middleView.appendChild(this.fui.leftView.lastChild || this.fui.rightView.lastChild);
        }

        // Adjust middleView's height for NavBar option.
        if (this.currentView.options.hidesNavBar || this.options.hidesNavBar) {
            Marionette.Utils.removeClass(this.fui.middleView, "with-navbar");
        } else {
            Marionette.Utils.addClass(this.fui.middleView, "with-navbar");
        }

        Marionette.Utils.removeClass(this.fui.mainContainer, this.TRANSITION_CLASSES);

        // Trigger show on the inbound view only after the transition is complete;
        // this should help make transitions smoother for views that have heavy
        // onShow methods; we only need to do this if the view was rendered in
        // conjunction with this transition.
        if (this.bNewlyRenderedChild) {
            Marionette.triggerMethod.call(this.currentView, "show");
        }
        this.bNewlyRenderedChild = false;

        // Since we used `on()` (as opposed to `off()`) to add the listener, the
        // event listener needs to be removed manually.
        this.ui.mainContainer.off("transitionend webkitTransitionEnd");
        this.bIsTransitionActive = false;
    }
});
