//## Marionette.Control

/**
 * Support definition of a base "control" class having a core set of css styles.
 * Allow subviews based on that control to add additional classes via space-delimited
 * options.attributes.class.
 *
 * E.g. /demo/control_button.js
 */
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

