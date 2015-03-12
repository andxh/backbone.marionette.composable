Marionette.ComposedView = Marionette.View.extend({
    // used as the prefix for sub view events
    // that are forwarded.
    subViewEventPrefix: "subview",

    // constructor
    constructor: function (options) {
        this._initSubViewStorage();
        this.options = _.extend({}, _.result(this, 'options'), _.isFunction(options) ? options.call(this) : options);
        this.subViews = _.result(this, "subViews");
        this._ensureSubViewProps();

        Marionette.View.prototype.constructor.apply(this, arguments);

        this.initRenderBuffer();
    },


    _ensureSubViewProps: function(){
        _.each(this.subViews,
            function(subView, outletName, subViews){
                if(!subView.options) subView.options = {};
                if(!subView.options.attributes) subView.options.attributes = {};
            }
        );
    },

    // Instead of inserting elements one by one into the page,
    // it's much more performant to insert elements into a document
    // fragment and then insert that document fragment into the page
    initRenderBuffer: function() {
        this.elBuffer = document.createDocumentFragment();
        this.$elBuffer = $(this.elBuffer);
        this._bufferedSubViews = [];
    },

    startBuffering: function() {
        this.initRenderBuffer();
        this.isBuffering = true;
    },

    endBuffering: function() {
        this.isBuffering = false;
        this.attachBuffer(this, this.elBuffer);
        this._triggerShowBufferedSubViews();
        this.initRenderBuffer();
    },

    _triggerShowBufferedSubViews: function () {
        if (this._isShown) {
            _.each(this._bufferedSubViews, function (subview) {
                Marionette.triggerMethod.call(subview, "show");
            });
            this._bufferedSubViews = [];
        }
    },


    // Override from `Marionette.View` to guarantee the `onShow` method
    // of sub views is called.
    onShowCalled: function() {
        this._subviews.each(function(subview) {
            Marionette.triggerMethod.call(subview, "show");
        });
    },

    // Internal method to trigger the before render callbacks
    // and events
    triggerBeforeRender: function() {
        this.triggerMethod("before:render", this);
        this.triggerMethod("model:before:render", this);
    },

    // Internal method to trigger the rendered callbacks and
    // events
    triggerRendered: function() {
        this.triggerMethod("render", this);
        this.triggerMethod("model:rendered", this);
    },


    // Render the view and all its subViews.
    render: function() {
        this.isDestroyed = false;
        this.triggerBeforeRender();

        this.startBuffering();

        this.destroySubViews();

        // our template
        var html = $(this._renderTemplate());
        this.$elBuffer.html(html);

        _.each(this.subViews,
            function(SubView, outletName) {
                this.addSubView(SubView, outletName);
            }, this);

        this.endBuffering();

        // Done after endBuffering so that the fragment has already been attached to this.$el
        this.bindUIElements();

        this.triggerRendered();
        return this;
    },

    _renderTemplate: function() {
        var data = {};
        if (this.serializeData) {
            data = this.serializeData();
        }
        data = this.mixinTemplateHelpers(data);

        var template = this.getTemplate();
        return Marionette.Renderer.render(template, data);
    },

    // Render the subview and add it to the
    // HTML fragment for the composed view.
    addSubView: function(SubView, outletName) {
        var subViewOptions = SubView.options;
        if (_.isFunction(subViewOptions)) {
            subViewOptions = subViewOptions.call(this, outletName);
        }
        subViewOptions = _.extend({}, subViewOptions, {outletName: outletName});

        // build the view
        if (!SubView.type) {
            throw("SubView type is required.");
        }
        // Allow type to be a function, for lazy connection to modules that may be loaded later than the ComposedView's declaration
        if (!_.isFunction(SubView.type) && _.isFunction(SubView.type.import)) {
            SubView.type = SubView.type.import.call(this);
        }
        var view = this.buildSubView(this.model, this.collection, SubView.type, subViewOptions);
        view.parentView = this;

        // set up the subview event forwarding
        this.addSubViewEventForwarding(view);

        // this view is about to be added
        this.triggerMethod("before:view:added", view);

        // Store the subview itself so we can properly access,
        // remove, and/or destroy it later
        this._subviews.add(view, outletName);

        // Render it and show it
        this.renderSubView(view, outletName);

        // call the "show" method if the composed view
        // has already been shown
        if (this._isShown && !this.isBuffering) {
            Marionette.triggerMethod.call(view, "show");
        }

        // this view was added
        this.triggerMethod("after:view:added", view);

        return view;
    },

    // Build a `subView` for a model and SubViewType.
    buildSubView: function(dataModel, dataCollection, SubViewType, subViewOptions) {
        var options = _.extend({model: dataModel, collection: dataCollection}, subViewOptions);

        // extend just this SVT
        if(!SubViewType.prototype._definedClassName) {
            SubViewType.prototype._definedClassName = SubViewType.prototype.className;
            SubViewType.prototype.className = function(){
                this.options = this.options || {};
                this.options.outletName = this.options.outletName || "";
                var protoClass = this.constructor.prototype._definedClassName || "",
                    classes = [this.options.outletName];
                if(_.isFunction(protoClass)){
                    protoClass = protoClass.apply(this, arguments);
                }

                classes = classes.concat(protoClass.split(/\s+/));
                return _.unique(classes).join(" ");
            };
        }

        return new SubViewType(options);
    },

    // Set up the subview event forwarding. Uses an "subview:"
    // prefix in front of all forwarded events.
    addSubViewEventForwarding: function(view) {
        var prefix = Marionette.getOption(this, "subViewEventPrefix");

        // Forward all subview events through the parent,
        // prepending "subview:" to the event name
        this.listenTo(view, "all", function() {
            var args = Array.prototype.slice.call(arguments),
                rootEvent = args[0],
                childEvents = this.getItemEvents();//this.normalizeMethods(this.getItemEvents());

            args[0] = prefix + ":" + rootEvent;
            args.splice(1, 0, view);

            // call collectionView itemEvent if defined
            if (typeof childEvents !== "undefined" && _.isFunction(childEvents[rootEvent])) {
                childEvents[rootEvent].apply(this, args);
            }

            Marionette.triggerMethod.apply(this, args);
        }, this);
    },

    // returns the value of childEvents depending on if a function
    getItemEvents: function() {
        if (_.isFunction(this.childEvents)) {
            return this.childEvents.call(this);
        }

        return this.childEvents;
    },

    // render the view
    renderSubView: function(view, outletName) {
        view.render();
        this.attachHtml(this, view, outletName);
    },


    // Remove the sub view and destroy it
    removeSubView: function(view) {

        // shut down the child view properly,
        // including events that the collection has from it
        if (view) {
            this.stopListening(view);

            // call 'destroy' or 'remove', depending on which is found
            if (view.destroy) {
                view.destroy();
            } else if (view.remove) {
                view.remove();
            }

            this._subviews.remove(view);

            // delete reference to parentView
            delete view.parentView;
        }

        this.triggerMethod("view:removed", view);
    },

    // helper to check if the collection is empty
    isEmpty: function(arrayLikeObject) {
        // check if we're empty now
        return !arrayLikeObject || arrayLikeObject.length === 0;
    },

    // You might need to override this if you've overridden appendHtml
    attachBuffer: function(view, buffer) {
        view.$el.append(buffer);
    },

    // Connect the HTML to the composed view's `el`.
    attachHtml: function(view, subView, outletName) {
        if (view.isBuffering) {
            // buffering happens on reset events and initial renders
            // in order to reduce the number of inserts into the
            // document, which are expensive.
            var outNode = view.elBuffer.querySelector("[outlet=\"" + outletName + "\"]");
            if (outNode && outNode.parentNode) {
                outNode.parentNode.replaceChild(subView.el, outNode);

                view._bufferedSubViews.push(subView);
            }
        } else {
            // If we've already rendered the main collection, just
            // append the new items directly into the element.
            view.$el.find("[outlet=\"" + outletName + "\"]").replaceWith(subView.el);
        }
    },

    // Internal method to set up the `_subviews` object for
    // storing all of the sub views
    _initSubViewStorage: function() {
        this._subviews = new Backbone.ChildViewContainer();
    },

    // gives access to subviews
    getSubview: function(outletName) {
        return this._subviews.findByCustom(outletName);
    },

    // shortcut to _.subviews.each()
    eachSubview: function(callback) {
        if (!callback || typeof callback !== "function") return;
        return this._subviews.each(callback);
    },

    // Handle cleanup and other closing needs for
    // the collection of views.
    destroy: function() {
        if (this.isDestroyed) { return; }

        this.triggerMethod("before:destroy");
        this.destroySubViews();
        this.triggerMethod("destroy:collection");

        Marionette.View.prototype.destroy.apply(this, arguments);
    },

    // Close the sub views that this composed view
    // is holding on to, if any
    destroySubViews: function() {
        this._subviews.each(function(subview) {
            this.removeSubView(subview);
        }, this);
    }
});

Marionette.Control = Marionette.ItemView.extend({
    controlClassName: "",
    className: function() {
        // allow subView definition to override controlClassName
        if (this.options.attributes && this.options.attributes.controlClassName) {
            this.controlClassName = this.options.attributes.controlClassName;
        }

        // compile list of unique classes passed via options.attributes.class
        var classes = [this.controlClassName];
        if (this.options.attributes && this.options.attributes.class) {
            classes = classes.concat(this.options.attributes.class.split(/\s+/));
        }
        return _.unique(classes).join(" ");
    },

    serializeData: function() {
        return this.options;
    }
});


// ComplexView
// -----------

// A combination of ComposedView (above) and Marionette.LayoutView (mostly copied in, with changes to prototype calls).
// Used for views that have subViews whose types are known at design and render time,
// and regions whose views will be changed dynamically.
Marionette.ComplexView = Marionette.ComposedView.extend({
    regionClass: Marionette.Region,

    // Ensure the regions are available when the `initialize` method
    // is called.
    constructor: function (options) {
        options = options || {};

        this._firstRender = true;
        this._initializeRegions(options);

        Marionette.ComposedView.prototype.constructor.call(this, options);
    },

    // Layout's render will use the existing region objects the
    // first time it is called. Subsequent calls will destroy the
    // views that the regions are showing and then reset the `el`
    // for the regions to the newly rendered DOM elements.
    render: function(){

        if (this.isDestroyed){
            // a previously destroy layout means we need to
            // completely re-initialize the regions
            this._initializeRegions();
        }
        if (this._firstRender) {
            // if this is the first render, don't do anything to
            // reset the regions
            this._firstRender = false;
        } else if (!this.isDestroyed){
            // If this is not the first render call, then we need to
            // re-initializing the `el` for each region
            this._reInitializeRegions();
        }

        return Marionette.ComposedView.prototype.render.apply(this, arguments);
    },

    // Handle closing regions, and then destroy the view itself.
    destroy: function () {
        if (this.isDestroyed){ return; }
        this.regionManager.destroy();
        Marionette.ComposedView.prototype.destroy.apply(this, arguments);
    },

    // Add a single region, by name, to the layout
    addRegion: function(name, definition){
        var regions = {};
        regions[name] = definition;
        return this._buildRegions(regions)[name];
    },

    // Add multiple regions as a {name: definition, name2: def2} object literal
    addRegions: function(regions){
        this.regions = _.extend({}, this.regions, regions);
        return this._buildRegions(regions);
    },

    // Remove a single region from the Layout, by name
    removeRegion: function(name){
        delete this.regions[name];
        return this.regionManager.removeRegion(name);
    },

    // Provides alternative access to regions
    // Accepts the region name
    // getRegion('main')
    getRegion: function(region) {
        return this.regionManager.get(region);
    },

    // internal method to build regions
    _buildRegions: function(regions){
        var that = this;

        var defaults = {
            regionClass: Marionette.getOption(this, "regionClass"),
            parentEl: function(){ return that.$el; }
        };

        return this.regionManager.addRegions(regions, defaults);
    },

    // Internal method to initialize the regions that have been defined in a
    // `regions` attribute on this layout.
    _initializeRegions: function (options) {
        var regions;
        this._initRegionManager();

        if (_.isFunction(this.regions)) {
            regions = this.regions(options);
        } else {
            regions = this.regions || {};
        }

        this.addRegions(regions);
    },

    // Internal method to re-initialize all of the regions by updating the `el` that
    // they point to
    _reInitializeRegions: function(){
        this.regionManager.destroyRegions();
        this.regionManager.each(function(region){
            region.reset();
        });
    },

    // Internal method to initialize the region manager
    // and all regions in it
    _initRegionManager: function(){
        this.regionManager = new Marionette.RegionManager();

        this.listenTo(this.regionManager, "add:region", function(name, region){
            this[name] = region;
            this.trigger("add:region", name, region);
        });

        this.listenTo(this.regionManager, "remove:region", function(name, region){
            delete this[name];
            this.trigger("remove:region", name, region);
        });
    }
});

// Subclasses bindUIElements() to check for this.fui[]; for each matching entry
// of this.fui in this.ui, the DOM element for the ui entry will be cached
// as this.fui[name] (--> this.ui[name][0])
// ex.
// ui: {
//     container: ">.main-container",
//     buttons: ">.main-container .button"
// },
//
// fui: [ "container" ]
//
// Per above, `this.fui.container` will be referenced to `this.ui.container[0]`,
// while `this.ui.buttons` will be excluded (e.g. selectors that select
// multiple elements should be left out of the `fui` array)
//
var originalBindUIElements = Marionette.View.prototype.bindUIElements;
Marionette.View.prototype.bindUIElements = function() {
    originalBindUIElements.apply(this, arguments);
    var i, fui;
    if (this.ui && this.fui) {
        fui = {};
        for (i = 0; i < this.fui.length; ++i) {
            if (this.ui[this.fui[i]]) {
                fui[this.fui[i]] = this.ui[this.fui[i]][0];
            }
        }
        this.fui = fui;
    }
};


//## GenericCollectionView
var bIsTouch = ('ontouchstart' in document.documentElement);

var scrollOptions = {
    scrollbars: true,
    scrollingX: false,
    maxFlingDuration: 200,
    scrollResponseBoundary: 10,
    scrollBoundary: 10,
    bounceDecelerationBezier: new CubicBezier(0.5,0,0.5,1),
    bounceBezier: new CubicBezier(0.5,0,0.5,1),

    // disable unneeded events
    disabledInputMethods: {
        mouse: bIsTouch,
        touch: !bIsTouch,
        pointer: true,
        focus: true,
        scroll: true
    }
};

function createScroller() {
    this.options.scrollerOptions = this.options.scrollerOptions || {};
    this.scroller = new FTScroller(this.el, _.defaults(this.options.scrollerOptions, scrollOptions));
    this.scroller.addEventListener("scrollstart", function() {
        Hub.Controls.activeButton = null;
    });
}

// GenericCollection.View extends CompositeView rather than CollectionView so that we can optimize ftscroller by
// pre-injecting the container divs in the template via serializeData.
GenericCollectionView = Marionette.CompositeView.extend({
    template: Handlebars.templates.GenericCollection,
    className: "GenericCollection",

    constructor: function(options){
        // Completely overrides CompositeView constructor
        var initOptions = options || {};
        if (this.sort === void(0)){
            this.sort = initOptions.sort === void(0) ? true : initOptions.sort;
        }

        this._initChildViewStorage();

        Marionette.View.apply(this, arguments);

        this.initRenderBuffer();

        this.collections = this.collections || this.options.collections || [this.collection];

        this._headers = {};
        this._footers = {};

        this.options.scrollerOptions = this.options.scrollerOptions || {};
        _.defaults(this.options.scrollerOptions, scrollOptions);
    },

// PERFORMANCE // Override _initialEvents
// PERFORMANCE // The "listen to all collections" work is now done in onRender
    _initialEvents: function() {

    },

    // Override CollectionView's isEmpty
    isEmpty: function(collection){
        var collections = this.collections || [], empty = true, i, c;

        for (i = 0, c = collections.length; i<c; i++) {
            if (collections[i].length > 0) {
                empty = false;
                break;
            }
        }
        return empty;
    },

    childViewContainer: function() {
        if (this.$el.find(".ftscroller_x").length) return ">.ftscroller_container >.ftscroller_x";
        if (this.$el.find(".ftscroller_y").length) return ">.ftscroller_container >.ftscroller_y";
        return ">.ftscroller_container";
    },

    sizeToFit: function(bottomOffset) {
        this.el.style.height = (Hub.Options.screenHeight - $el.offset().top - (bottomOffset || 0)) + "px";

        if (this.scroller) {
            this.scroller.updateDimensions();
        }
    },

    serializeData: function() {

        // getPrependedHTML and getAppendedHTML's parameters are "exclude-", so we flip our scrolling options
        // Furthermore, we only allow scrolling in one direction, so y = !x;
        var disallowX = !this.options.scrollerOptions.scrollingX;

        return _.extend({
            prependedScrollerHtml: FTScroller.prototype.getPrependedHTML(disallowX, !disallowX),
            appendedScrollerHtml: FTScroller.prototype.getAppendedHTML(disallowX, !disallowX, null, this.options.scrollerOptions.scrollbars)
        }, this.options);
    },

    onRender: function() {
        var i, c, collection;

        if (!this.scroller) createScroller.call(this);

        // PERFORMANCE //
        if (!this._hasRenderedOnce) {
            this._hasRenderedOnce = true;
            for (i = 0, c = this.collections.length; i<c; i++){
                collection = this.collections[i];
                this.listenTo(collection, "add", this._onCollectionAdd);
                this.listenTo(collection, "remove", this._onCollectionRemove);
                this.listenTo(collection, "reset", this._renderChildren);
            }
        }

        // invoke fetch on each collection
        var silent, success;
        for (i = 0, c = this.collections.length; i<c; i++) {
            collection = this.collections[i];
            if (!collection.disableFetch) {
                silent = this.shouldCollectionFetchBeSilent(i);
                success = this.collectionFetchSuccess(i),
                    collection.fetch({success: success, silent: silent});
            }
        }
    },

    onShow: function() {
        this.listenTo(Hub.vent, "OnScreen", function() {
            if(this.scroller) {
                this.scroller.updateDimensions();
            }
        });

        if(this.scroller) {
            dispatchLater(_.bind(this.scroller.updateDimensions, this));
        }
    },

    onDestroy: function() {
        if (this.scroller && this.scroller.destroy) {
            this.scroller.destroy();
            this.scroller = null;
        }
    }


    //
    // Sectionable
    //

    ,_onCollectionAdd: function(item, collection, options) {
        var sectionIndex = this.collections.indexOf(collection),
            headerView, headerIndex, header, childView, itemIndex, footerView, footerIndex, footer;

        this.destroyEmptyView();

        headerView = (!!collection._headerId) ? false : this.viewForHeaderInSection(sectionIndex);
        footerView = (!!collection._footerId) ? false : this.viewForFooterInSection(sectionIndex);

        // _indexOfCollectionItem takes into account the headers and footers;
        itemIndex = this._indexOfCollectionItem(collection, item);

        if (headerView) {
            headerIndex = itemIndex -1;
            this._addHeader(collection, sectionIndex, headerView, headerIndex);
        }

        childView = this.viewForRowInSection(item, itemIndex, sectionIndex);
        this.addChild(item, childView, itemIndex);

        if (footerView) {
            footerIndex = itemIndex + 1;
            this._addFooter(collection, sectionIndex, footerView, footerIndex);
        }
    }

    ,_onCollectionRemove: function(item) {
        var collection = item.collection,
            sectionIndex;
        if (collection.length === 0) {
            sectionIndex = this.collections.indexOf(collection);

            if (!this.viewForHeaderInSection(sectionIndex)) {
                this.removeChildView(this._headers[collection._headerId]);
                delete this._headers[collection._headerId];
            }

            if (!this.viewForFooterInSection(sectionIndex)) {
                this.removeChildView(this._footers[collection._footerId]);
                delete this._footers[collection._footerId];
            }
        }
        this.removeChildView(this.children.findByModel(item));
    }


    // Override CompositeView's showCollection method as an entry point for handling multiple collections,
    // section headers and footers.
    ,showCollection: function(){
        var sections = this.collections,
            total = 0,
            sectionIndex, section, c, HeaderView, ItemView, FooterView,
            si, sc, sModels, sModel;

        for(sectionIndex = 0, c = sections.length; sectionIndex < c; sectionIndex++) {
            section = sections[sectionIndex];

            // Add a header
            HeaderView = this.viewForHeaderInSection(sectionIndex);
            if (HeaderView) {
                this._addHeader(section, sectionIndex, HeaderView, total);
                total += 1;
            }

            // add childViews for each item in the section
            for (si = 0, sModels = section.models, sc = sModels.length; si < sc; si++) {
                sModel = sModels[si];
                ItemView = this.viewForRowInSection(sModel, si, sectionIndex);
                this.addChild(sModel, ItemView, total);
                total += 1;
            }

            FooterView = this.viewForFooterInSection(sectionIndex);
            if (FooterView) {
                this._addFooter(section, sectionIndex, FooterView, total);
                total += 1;
            }
        }
    }

    ,_addHeader: function(section, sectionIndex, view, index) {
        var id = section._headerId || (section._headerId = _.uniqueId('h'));
        this._headers[id] = this.addChild(this.modelForHeaderInSection(sectionIndex), view, index);
    }

    ,_addFooter: function(section, sectionIndex, view, index) {
        var id = section._footerId || (section._footerId = _.uniqueId('f'));
        this._footers[id] = this.addChild(this.modelForFooterInSection(sectionIndex), view, index);
    }

    // Assign parentView property to each child view when it is attached
    ,attachHtml: function(collectionView, childView, index) {
        Marionette.CompositeView.prototype.attachHtml.apply(this, arguments);
        childView.parentView = this;
    }

    ,_totalLength: function() {
        var sections = this.collections,
            total = 0,
            sectionIndex, c;

        for(sectionIndex = 0, c = sections.length; sectionIndex < c; sectionIndex++) {
            total += this.viewForHeaderInSection(sectionIndex) ? 1 : 0;
            total += sections[sectionIndex].length;
            total += this.viewForFooterInSection(sectionIndex) ? 1 : 0;
        }

        return total;
    }

    ,_indexOfCollectionItem: function(collection, item) {
        var collectionIndex = this.collections.indexOf(collection),
            sectionIndex, finalIndex = 0, sections = this.collections;
        for (sectionIndex = 0; sectionIndex<collectionIndex; sectionIndex++) {
            finalIndex += this.viewForHeaderInSection(sectionIndex) ? 1 : 0;
            finalIndex += sections[sectionIndex].length;
            finalIndex += this.viewForFooterInSection(sectionIndex) ? 1 : 0;
        }

        finalIndex += this.viewForHeaderInSection(collectionIndex) ? 1 : 0;
        finalIndex += collection.indexOf(item);

        return finalIndex;
    }

    // Return the View class to be instantiated and rendered for a particular row in a section.
    ,viewForRowInSection: function(model, row, section) {
        return this.getChildView(model);
    }

    // Return the View class to be instantiated and rendered for a particular section's header.
    // This is where subclasses should implement conditional logic such as not showing a header for an empty collection.
    ,viewForHeaderInSection: function(sectionIndex) {
        return void(0);
    }

    // Return a Model that will be passed to the section header
    ,modelForHeaderInSection: function(sectionsIndex) {
        return new Backbone.Model();
    }

    // Return the View class to be instantiated and rendered for a particular section's footer.
    ,viewForFooterInSection: function(sectionIndex) {
        return void(0);
    }

    // Return a Model that will be passed to the section header
    ,modelForFooterInSection: function(sectionIndex) {
        // Override
        return new Backbone.Model();
    }

    ,shouldCollectionFetchBeSilent: function(collectionIndex) {
        // Subclasses may choose to make the fetch triggered in onRender be silent. This is intended to be used in
        // conjunction with collectionFetchSuccess to allow for more control on persistance and view refresh.
        return false;
    }

    ,collectionFetchSuccess: function(collectionIndex) {
        // Subclasses may return a function to be called on success of the fetch triggered in onRender.
        return void(0);
    }
});


//## NavController

var TRANSITION_CLASSES = "slide-left slide-right";

NavController = Marionette.View.extend({

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
     * * `modalOverlayOptions` *object* For popup-style NavControllers, this
     *      object will be passed into the ModalOverlay constructor.
     * * `bHideModalOverlay` *boolean* For popup-style NavControllers, setting thisFile
     *      to `true` will hide the modal overlay element (default: `false`).
     */
    constructor: function(options) {
        options = options || {};
        this.viewStack = [];
        this.popStack = [];
        this.bIsTransitionActive = false;
        Marionette.View.prototype.constructor.call(this, options);

        // Create NavBar instance and listen to its events; each NavController
        // instance has a single NavBar instance.
        this.navBar = new Hub.Controls.NavBar({ outletName: "navBar" });
        this.listenTo(this.navBar, "Back:navBar", this.onNavBarBack);
        this.listenTo(this.navBar, "Close:navBar", this.onNavBarClose);

        // Handle non-fullscreen NavController instances (`bIsPopup == true`).
        if (options.bIsPopup) {

            // Create Controls.ModalOverlay instance. Listen to its "destroy"
            // event and destroy the NavController instance when triggered.
            var modalOverlayOptions = options.modalOverlayOptions || {};
            modalOverlayOptions.outletName = "modalOverlay";
            this.modalOverlay = new Hub.Controls.ModalOverlay(modalOverlayOptions);
            this.listenTo(this.modalOverlay, "click:modalOverlay", this.destroy);

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

        // Listen to hardware back button events (calls `popView()` if the
        // NavBar's back button is available).
        this.listenTo(Hub.vent, "onBackButton", function() {
            var nb = this.navBar;
            if (!this.destroyOnDeviceBack &&
                (this.preventBackButton ||
                    this.options.hidesBackButton ||
                    (nb && nb.options.hidesBackButton)
                    )
                ) {
                return;
            }
            this.popView();
            gbHandledBackButton = true;
        });
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

            if (!this.options.bHideModalOverlay) {
                this.modalOverlay.render();
                Hub.Utils.prependChild(this.el, this.modalOverlay.el);
                Marionette.triggerMethod.call(this.modalOverlay, "show");
            }
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

        if (this.modalOverlay) {
            this.modalOverlay.destroy();
        }
        this.modalOverlay = null;

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
                    if (!Hub.Utils.isWebKit()) {
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
            if (Hub.Utils.isWebKit()) {
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
        if (!Hub.Utils.isWebKit()) return;

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
            Hub.Utils.insertAfterEl(this.navBar.el, this.fui.mainContainer);
        } else {
            inboundEl.appendChild(this.navBar.el);
        }

        this.setNavTitle(view.title || this.navBar.options.title || "");
        this.navBar.setHidesBackButton(view.options.hidesBackButton || this.options.hidesBackButton);
        this.navBar.setShowsCloseButton(view.options.showsCloseButton || this.options.showsCloseButton);

        if (view.options.hidesNavBar || this.options.hidesNavBar) {
            this.navBar.el.style.display = "none";
            Hub.Utils.removeClass(inboundEl, "with-navbar");
            Hub.Utils.removeClass(view.el, "navBarIsShown");
        } else {
            this.navBar.el.style.display = "block";
            Hub.Utils.addClass(inboundEl, "with-navbar");
            Hub.Utils.addClass(view.el, "navBarIsShown");
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
        Hub.Utils.prependChild(parentEl, view.el);
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
                Hub.Utils.removeClass(outboundEl, "with-navbar");
            } else {
                Hub.Utils.addClass(outboundEl, "with-navbar");
            }
        }

        if (inboundView.options.hidesNavBar || this.options.hidesNavBar) {
            Hub.Utils.removeClass(inboundEl, "with-navbar");
        } else {
            Hub.Utils.addClass(inboundEl, "with-navbar");
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
            Hub.Utils.updateElementClass(this.fui.mainContainer, TRANSITION_CLASSES.split(" "), ["slide-left"]);
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
            Hub.Utils.updateElementClass(this.fui.mainContainer, TRANSITION_CLASSES.split(" "), ["slide-right"]);
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
            Hub.Utils.removeClass(this.fui.middleView, "with-navbar");
        } else {
            Hub.Utils.addClass(this.fui.middleView, "with-navbar");
        }

        Hub.Utils.removeClass(this.fui.mainContainer, TRANSITION_CLASSES);

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