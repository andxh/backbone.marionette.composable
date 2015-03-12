//## Marionette.TableView
// Scrolling component that extends CompositeView rather than CollectionView to optimize ftscroller by
// pre-injecting the container divs in the template via serializeData.
Marionette.TableView = Marionette.CompositeView.extend({
    className: "TableView",
    
    template: function(data) {
        return data.scrollerPrepend + data.scrollerAppend;
    },

    serializeData: function() {
        // getPrependedHTML and getAppendedHTML's parameters are "exclude-", so we flip our scrolling options
        // Furthermore, we only allow scrolling in one direction, so y = !x;
        var disallowX = !this.options.scrollerOptions.scrollingX;

        return _.extend({
            scrollerPrepend: FTScroller.prototype.getPrependedHTML(disallowX, !disallowX),
            scrollerAppend: FTScroller.prototype.getAppendedHTML(disallowX, !disallowX, null, this.options.scrollerOptions.scrollbars)
        }, this.options);
    },

    constructor: function(options){
        // Completely overrides CompositeView constructor
        var initOptions = options || {};
        if (this.sort === void(0)){
            this.sort = initOptions.sort === void(0) ? true : initOptions.sort;
        }

        this._initChildViewStorage();

        Marionette.View.call(this, initOptions);

        this.initRenderBuffer();

        this.collections = this.collections || this.options.collections || [this.collection];

        this._headers = {};
        this._footers = {};

        this.options.scrollerOptions = this.options.scrollerOptions || {};
        _.defaults(this.options.scrollerOptions, this._defaultScrollerOptions());
    },

    // The "listen to all collections" work is now done in onRender;
    // Override this to prevent default behavior.
    _initialEvents: function() {

    },

    // Override CollectionView's isEmpty
    isEmpty: function(collection){
        console.debug(this.collections);
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

    onRender: function() {
        var i, c, collection;

        if (!this.scroller) this._createScroller();

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
            if (true) return;
            if (!collection.disableFetch) {
                silent = this.shouldCollectionFetchBeSilent(i);
                success = this.collectionFetchSuccess(i),
                collection.fetch({success: success, silent: silent});
            }
        }
    },

    onShow: function() {
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
    // Scroller
    //
    
    ,_defaultScrollerOptions: function() {
        var bIsTouch = ('ontouchstart' in document.documentElement);
        return {
            scrollbars: true,
            scrollingX: false,
            maxFlingDuration: 200,
            scrollResponseBoundary: 10,
            scrollBoundary: 10,
            disabledInputMethods: {
                mouse: bIsTouch,
                touch: !bIsTouch,
                pointer: true,
                focus: true,
                scroll: true
            }
        };
    }
    
    ,_createScroller: function() {
        this.options.scrollerOptions = this.options.scrollerOptions || {};
        this.scroller = new FTScroller(this.el, _.defaults(this.options.scrollerOptions, this._defaultScrollerOptions()));
        this.scroller.addEventListener("scrollstart", function() {
            if (Marionette.Controls) {
                Marionette.Controls.activeButton = null;
            }
        });
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
    ,viewForRowInSection: function(model, rowIndex, sectionIndex) {
        return this.getChildView(model);
    }

    // Return the View class to be instantiated and rendered for a particular section's header.
    // This is where subclasses should implement conditional logic such as not showing a header for an empty collection.
    ,viewForHeaderInSection: function(sectionIndex) {
        return void(0);
    }

    // Return a Model that will be passed to the section header
    ,modelForHeaderInSection: function(sectionIndex) {
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
