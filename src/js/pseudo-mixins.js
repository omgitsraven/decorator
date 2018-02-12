/*
Due to a bug in A-Frame, components that were added as part of a mixin will not have their `remove` methods called.
This causes significant problems when an entity that needs to be deletable is assigned a `collision` component via a mixin,
but unfortunately the current sync system ONLY allows mixins for assigning components.
To work around this for the moment, this "pseudo-mixin" will apply components manually via `setAttribute` instead, which avoids the bug.
*/
AFRAME.registerComponent('moddeco-pseudo', {
	init: function(){
		this.el.setAttribute("collision","with","#lefthand,#righthand");
		this.el.setAttribute("collision","kinematic",true);
		this.el.setAttribute("grabbable","enabled",true);
	}
});