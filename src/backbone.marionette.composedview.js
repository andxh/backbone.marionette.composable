//## Marionette.ComposedView

Marionette.ComposedView = Marionette.View.extend({
    // used as the prefix for sub view events that are forwarded.
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


    // Internal method to trigger the before render callbacks and events
    triggerBeforeRender: function() {
        this.triggerMethod("before:render", this);
        this.triggerMethod("model:before:render", this);
    },


    // Internal method to trigger the rendered callbacks and events
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
                childEvents = this.normalizeMethods(this.getItemEvents());

            args[0] = prefix + ":" + rootEvent + ":" + view.options.outletName;
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
