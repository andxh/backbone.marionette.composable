// ## Marionette.Controls.Button

Marionette.Controls = Marionette.Controls || {};

// Reset active button when document is clicked or touched
$(document).on(("ontouchstart" in document.documentElement) ? "touchend" : "mouseup", function(){
    Marionette.Controls.activeButton = null;
});

Marionette.Controls.Button = Marionette.Control.extend({
    controlClassName: "genericButton",

    events: function () {
        var bIsTouch = ('ontouchstart' in document.documentElement);
        
        function buttonTouchEvent() {
            this.touchstart = "onEventDown";
            this.touchend = "onEventUp";
            this.touchmove = "onEventMove";

            this.mouseover = "onEventMove";
            this.mouseout = "onEventMove";
        }

        function buttonMouseEvent() {
            this.mousedown = "onEventDown";
            this.mouseup = "onEventUp";
            this.mousemove = "onEventMove";

            this.mouseover = "onEventMove";
            this.mouseout = "onEventMove";
        }
        return bIsTouch ? new buttonTouchEvent() : new buttonMouseEvent();
    },

    ui: {
        // PERFORMANCE //
        // Intentionally blank. Manually selected as needed.
    },

    render: function(){
        this.isDestroyed = false;
        this.el.innerHTML = '<div class="icon"></div><div class="label"><span>' + (this.options.labelText || "") + '</span></div>';
        this.onRender();
        return this;
    },

    setEnabled: function(enabled) {
        if (enabled) {
            Marionette.Utils.removeClass(this.el, "disabled");
            this.disabled = false;
        } else {
            Marionette.Utils.addClass(this.el, "disabled");
            this.disabled = true;
        }
    },

    setLabelText: function(text) {
        this.$(".label>span")[0].innerHTML = text;
    },

    showPressed: function()
    {
        if (Marionette.Controls.activeButton == this && this.bIn) {
            Marionette.Utils.addClass(this.el, "pressed");
        } else {
            Marionette.Utils.removeClass(this.el, "pressed");
        }
    },

    onRender: function() {
        if (this.el.className.indexOf("disabled") !== -1) {
            this.setEnabled(false);
        }
    },
    
    _fixEvent: function(e) {
        e.preventDefault();
        if (e.changedTouches && e.changedTouches.length > 0) {
            e.clientX = e.changedTouches[0].clientX;
            e.clientY = e.changedTouches[0].clientY;
        } else if (e.originalEvent.changedTouches && e.originalEvent.changedTouches.length > 0) {
            e.clientX = e.originalEvent.changedTouches[0].clientX;
            e.clientY = e.originalEvent.changedTouches[0].clientY;
        }
        return e;
    },

    onEventDown: function(evt)
    {
        if (this.disabled) return;
        this._fixEvent(evt);
        Marionette.Controls.activeButton = this;
        this.bIn = true;
        this.showPressed();
    },

    onEventUp: function(evt)
    {
        if (this.disabled) return;
        var bClicked = (Marionette.Controls.activeButton == this && this.bIn);
        this._fixEvent(evt);
        Marionette.Controls.activeButton = null;
        this.bIn = false;
        this.showPressed();

        if (bClicked) {
            this.trigger("click");
        }
    },

    onEventMove: function(evt)
    {
        if (this.disabled) return;
        this._fixEvent(evt);
        var r = this.el.getBoundingClientRect();
        this.bIn = (evt.clientX > r.left && evt.clientX < (r.left + r.width) && evt.clientY > r.top && evt.clientY < (r.top + r.height));
        this.showPressed();
    }
});
