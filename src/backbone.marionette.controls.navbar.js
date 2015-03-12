
// ## Marionette.Controls.NavBar
//
// Navigation bar component to be used with Marionette.NavController.
//
// - options.`title` *String* The text to display as the title.
// - options.`hidesBackButton` *boolean* If true, the Back button is not shown. *default*: false
// - options.`showsCloseButton` *boolean* If true, the Close button is shown. *default*: false
// - options.`showsStatus` *boolean* If true, the status area is shown. *default*: false

// emits "Back" when the Back button is tapped

Marionette.Controls = Marionette.Controls || {};

Marionette.Controls.NavBar = Marionette.View.extend({
    className: "NavBar",

    navStyles: {
        white: "navBarWhite"
    },

    ui: {
        genericButton: '>.header >.genericButton',
        backButton: '>.header >.backButton',
        backButtonLabel: ">.header >.backButton >.label > span",
        closeButton: '>.header >.closeButton',
        title: ">.header >.label > span",
        status: ">.header >.status"
    },
    
    template: function(titleText) {
        return '<div class="header"><div class="backButton genericButton back small"><div class="icon"></div><div class="label"><span>Back</span></div></div><div class="label"><span>'+(titleText || "")+'</span></div><div class="status"></div><div class="closeButton genericButton"><div class="icon"></div></div></div>';
    },

    events: function() {
        var e = {
            'buttonClick @ui.backButton': 'onClickBackButton',
            'buttonClick @ui.closeButton': 'onClickCloseButton'
        };
        
        if ('ontouchstart' in document.documentElement) {
            e['touchstart @ui.genericButton'] = 'onGenericButtonDown';
            e['touchend @ui.genericButton'] = 'onGenericButtonUp';
            e['touchmove @ui.genericButton'] = 'onGenericButtonMove';
        } else {
            e['mousedown @ui.genericButton'] = 'onGenericButtonDown';
            e['mouseup @ui.genericButton'] = 'onGenericButtonUp';
            e['mousemove @ui.genericButton'] = 'onGenericButtonMove';
            e['mouseover @ui.genericButton'] = 'onGenericButtonMove';
            e['mouseout @ui.genericButton'] = 'onGenericButtonMove';
        }
        return e;
    },

    render: function() {
        this.isDestroyed = false;
        this.el.innerHTML = this.template(this.options.title);
        this.bindUIElements();
        this.onRender();
        return this;
    },

    onRender: function () {
        if(this.options.hidesBackButton) this.setHidesBackButton(this.options.hidesBackButton);
        this.setShowsCloseButton(this.options.showsCloseButton);
        this.setShowsStatus(this.options.showsStatus);
    },

    // ### options accessors
    setHidesBackButton: function(bHides) {
        this.options.hidesBackButton = bHides;
        if(bHides){
            Marionette.Utils.addClass(this.ui.backButton[0], "hidden");
        } else {
            Marionette.Utils.removeClass(this.ui.backButton[0], "hidden");
        }
        this.bStateChanged = true;
    },

    setShowsCloseButton: function(bShows)  {
        if(bShows) {
            Marionette.Utils.removeClass(this.ui.closeButton[0], "hidden");
        } else {
            Marionette.Utils.addClass(this.ui.closeButton[0], "hidden");
        }
        this.bStateChanged = true;
    },

    setShowsStatus: function(bShows) {
        if(bShows) {
            Marionette.Utils.removeClass(this.ui.status[0], "hidden");
        } else {
            Marionette.Utils.addClass(this.ui.status[0], "hidden");
        }
        this.bStateChanged = true;
    },

    setTitle: function(title) {
        this.options.title = title;
        this.ui.title[0].innerHTML = title;
        this.bStateChanged = true;
    },

    setStyle: function(navStyle) {
        if(navStyle){
            if(this.navStyles[navStyle]){
                Marionette.Utils.addClass(this.el, this.navStyles[navStyle]);
            }
        } else {
            var styles = _.values(this.navStyles);
            Marionette.Utils.removeClass(this.el, styles.join(" "));
        }
        this.bStateChanged = true;
    },

    setBackButtonLabel: function(labelText) {
        this.ui.backButtonLabel[0].innerHTML = labelText || "";
    },

    getStatusEl: function() {
        return this.ui.status[0];
    },

    getBackButtonEl: function() {
        return this.ui.backButton[0];
    },

    // ### Button Methods
    
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
    
    onGenericButtonDown: function(e) {
        this._fixEvent(e);
        var $target = $(e.target);
        Marionette.Controls.activeButton = $target;
        Marionette.Utils.addClass(e.target, "pressed");
    },
    
    onGenericButtonUp: function(e) {
        this._fixEvent(e);
        var target = $(e.target);
        if (Marionette.Controls.activeButton && Marionette.Controls.activeButton.is(target)) {
            Marionette.Controls.activeButton = null;
            target.trigger('buttonClick');
        }
        Marionette.Utils.removeClass(e.target, "pressed");
    },
    onGenericButtonMove: function(e) {
        this._fixEvent(e);
        var target = $(e.target),
            r = target[0].getBoundingClientRect(),
            bIn = (e.clientX > r.left && e.clientX < (r.left + r.width) && e.clientY > r.top && e.clientY < (r.top + r.height));

        if (Marionette.Controls.activeButton && Marionette.Controls.activeButton.is(target) && bIn) {
            Marionette.Utils.addClass(e.target, "pressed");
        } else {
            Marionette.Utils.removeClass(e.target, "pressed");
        }
    },

    // ### Button handlers
    onClickBackButton: function(){
        this.trigger("Back:" + this.options.outletName);
    },

    onClickCloseButton: function() {
        this.trigger("Close:" + this.options.outletName);
    }
});
