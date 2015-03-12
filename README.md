# Backbone.Marionette.Composable
Composable is a set of <a href="http://fingerprintplay.com">Fingerprint</a> extensions to <a href="https://github.com/marionettejs/backbone.marionette">Backbone Marionette</a>.

## About

Composable is inspired by view and functionality composition patterns from iOS. 
We wanted to be able to encapsulate various levels of display styling and functionality as components (e.g. buttons), and then include them declaratively in other views, like Interface Builder. 
We wanted to be able to push and pop views, like UINavigationController. 
And we wanted to be able to have lists composed of multiple sections with their own optional headers and footers, like UITableView.


## Composable Extensions

### ComposedView
Allows for using a json-style subview declaration and "outlet" hooks in templates. This makes it possible to write and use simple controls like "Button".

[ComposedView](#ComposedView) adds a `subViews` property whose keys match to "outlets" in its template.

*Example:*
```
var Control_Button = Marionette.ItemView.extend({
  // ...
});

var SomeView = ComposedView.extend({
  template: '<div outlet="toggleButton"></div>'
  subViews: {
    toggleButton: { 
      type: Control_Button
      //...
    }
  }
  // ...
});

```

#### Why not just use LayoutView?

1. Most composed views do not need the region management overhead of LayoutView. Once created and added, the subviews are not replaced.
2. LayoutView's pattern of instantiating and showing subviews in onRender is disorganized. The overall view's declaration is split between the Layout's prototype and the contents of its onRender. This makes onRender seem like, "once you've rendered, render some more."
3. Adding subviews in LayoutView's onRender is potentially performance-expensive, since the LayoutView's element is de-buffered (moved from the documentFragment to the DOM) before onRender happens. [ComposedView](#ComposedView) instead follows the rendering pattern laid out in CollectionView: all subviews are rendered and buffered before the parent/container element is attached to the DOM.

#### Subviews
A subview can be any kind of Marionette View, including ComposedView or ComplexView.

##### Including in Templates
ComposedView uses the selector `'[outlet="<outlet name>"]'`. We typically use `<div outlet="<outlet name>">`, but the element tag is not important. The element is completely replaced by the result of the subview's render().

##### Subview events
Subview events follow the event bubbling pattern, `subview:<event>:<outlet name>`. Handlers work accordingly:
```
onSubviewClickToggleButton: function(subview) {
  this.getSubview("toggleButton") === subview; // true
}
```

###ComplexView
[ComplexView](#ComplexView) adds Region functionality to the mix, essentially pairing ComposedView and LayoutView.

*Example:*
```
ComplexView.extend({
  template: '<div class="leftSideRegion"></div><div outlet="toggleButton"></div><div class="rightSideRegion"></div>',
  
  subViews: {
    toggleButton: { 
      type: Martionette.Control_Button
      //...
    }
  },
  
  regions: {
    leftSideRegion: ">.leftSideRegion",
    rightSideRegion: ">.rightSideRegion"
  }
  // ...
});
```


###Control
[Control](#Control) is intended as the base for controls like *Button*. Control makes it possible to specify additional class values in the subview declaration **that do not override the base class's `controlClassName`**. This makes the following possible:

```
ComposedView.extend({
  subViews: {
    greenButton: {
      type: Marionette.Control_Button,
      options: {
        labelText: "Green!",
        attributes: {
          class: "green wide rounded"
        }
      }
    },
    redButton: {
      type: Marionette.Control_Button,
      options: {
        labelText: "Red!",
        attributes: {
          class: "red tall flat"
        }
      }
    }
  }
});
```
*resulting in, perhaps:*
```
<div class="control-button green wide rounded">Green!</div>
<div class="control-button red tall flat">Red!</div>
```

### TableView
Our version of UITableView. Allows for specifying multiple sections in a list, with optional header and footer in each section.

### NavController
Our version of UINavigationController. Provides view hierarchy management and presentation animation via pushView/popView/presentModal.
