// Marionette.Utils
// various utility functions.
//

Marionette.Utils = {
    addClass: function(el, classNameStr) {
        var cn = el.className;
        var re = new RegExp("\\s*(" + classNameStr.replace(/ /g, "|") + ")\\s*", "gim");
        el.className = cn.replace(re, " ").replace(/^\s\s*/, '').replace(/\s\s*$/, '') + " " + classNameStr;
    },
    
    removeClass: function(el, classNameStr) {
        var cn = el.className;
        var re = new RegExp("\\s*(" + classNameStr.replace(/ /g, "|") + ")\\s*", "gim");
        el.className = cn.replace(re, " ").replace(/^\s\s*/, '').replace(/\s\s*$/, ''); // also trims blank characters beginning/end of string
    },
    
    updateElementClass: function(element, removeNames, addNames) {
        var cn = element.className;
        var re = new RegExp("\\s*(" + removeNames.join("|") + ")\\s*", "gim");
        element.className = cn.replace(re,"") + " " + addNames.join(" ");
    },
    
    insertAfterEl: function(element, afterElement) {
        afterElement.parentNode.insertBefore(element, afterElement.nextSibling);
    },
    
    prependChild: function(parentEl, childEl) {
        parentEl.insertBefore(childEl, parentEl.firstChild);
    }
};

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

// From http://dbaron.org/log/20100309-faster-timeouts
// Only add setZeroTimeout to the window object, and hide everything
    // else in a closure.
(function() {
    var timeouts = [];
    var messageName = "zero-timeout-message";

    // Like setTimeout, but only takes a function argument.  There's
    // no time argument (always zero) and no arguments (you have to
    // use a closure).
    function setZeroTimeout(fn) {
        timeouts.push(fn);
        window.postMessage(messageName, "*");
    }

    function handleMessage(event) {
        if (event.source == window && event.data == messageName) {
            event.stopPropagation();
            if (timeouts.length > 0) {
                var fn = timeouts.shift();
                fn();
            }
        }
    }

    window.addEventListener("message", handleMessage, true);

    // Add the one thing we want added to the window object.
    window.dispatchLater = setZeroTimeout;
})();