//## ComplexView
//
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
