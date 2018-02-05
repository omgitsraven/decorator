import {setLocalTransform} from './utils';

//just to spare garbage collection:
let localTransform = new AFRAME.THREE.Matrix4();
let avgPos = new AFRAME.THREE.Vector3();
let avgRot = new AFRAME.THREE.Quaternion();
let scaleVec = new AFRAME.THREE.Vector3();
let incrementMtx = new AFRAME.THREE.Matrix4();
let inverseMtx = new AFRAME.THREE.Matrix4();
let newObjMtx = new AFRAME.THREE.Matrix4();

AFRAME.registerComponent('grabbable', {
	dependencies: ['sync'],
	schema: {
		enabled: {default: true}
	},
	init: function()
	{
		this.grabbers = new Set();
		this.lastLocalTransform = new AFRAME.THREE.Matrix4();
		this.refreshGrab = false;

		// pre-bound event handlers
		this._hoverStart = this.hoverStart.bind(this);
		this._pickup = this.pickup.bind(this);
		this._drop = this.drop.bind(this);
		this._hoverEnd = this.hoverEnd.bind(this);

		this.sync = this.el.components.sync;
		if(this.sync.isConnected)
			this.spawnPickup();
		else
			this.el.addEventListener('connected', this.spawnPickup.bind(this));
	},
	update: function()
	{
		if(this.data.enabled){
			this.el.addEventListener('collision-start', this._hoverStart);
			this.el.addEventListener('collision-end', this._hoverEnd);
		}
		else {
			this.el.removeEventListener('collision-start', this._hoverStart);
			this.el.removeEventListener('collision-end', this._hoverEnd);
		}
	},
	hoverStart: function({detail: hand})
	{
		hand.addEventListener('gripdown', this._pickup);
	},
	pickup: function({detail: hand})
	{
		this.grabbers.add(hand);

		this.el.setAttribute('collision', 'kinematic', true);
		hand.addEventListener('gripup', this._drop);
		this.refreshGrab = true;
	},
	drop: function({detail: hand})
	{
		if(this.grabbers.size)
		{
			this.grabbers.delete(hand);
			this.refreshGrab = true;
			if(!this.grabbers.size){
				this.el.setAttribute('collision', 'kinematic', false);
			}
		}
	},
	hoverEnd: function({detail: hand})
	{
		hand.removeEventListener('gripdown', this._pickup);
	},
	tick: function()
	{
		if(this.grabbers.size)
		{
			if (this.grabbers.size == 1) {//one-handed
				let grabber = this.grabbers.values().next().value;
				localTransform.copy(grabber.object3D.matrix);
			} else {//two-handed
				let curGrabbers = this.grabbers.values();
				let grabA = curGrabbers.next().value;
				let grabB = curGrabbers.next().value;
				avgPos.copy(grabA.object3D.position).lerp(grabB.object3D.position,0.5);
				avgRot.copy(grabA.object3D.quaternion).slerp(grabB.object3D.quaternion,0.5);
				let scaleAmt = grabA.object3D.position.distanceTo(grabB.object3D.position);
				scaleVec.set(scaleAmt,scaleAmt,scaleAmt);
				localTransform.compose(avgPos,avgRot,scaleVec);
			}
			
			inverseMtx.getInverse(this.el.object3D.parent.matrixWorld);
			localTransform.premultiply(inverseMtx);
			
			if (this.refreshGrab) {
				//don't interpolate across hand-number changes;
				//this is how passing between hands works smoothly
				//(& also how first frame prepares for subsequent frames)
				this.lastLocalTransform.copy(localTransform);
				this.refreshGrab = false;
			}
			
			incrementMtx.copy(localTransform);
			inverseMtx.getInverse(this.lastLocalTransform);
			incrementMtx.multiply(inverseMtx);
			this.el.object3D.updateMatrix();
			newObjMtx.copy(this.el.object3D.matrix);
			newObjMtx.premultiply(incrementMtx);
			
			setLocalTransform(this.el, newObjMtx);
			
			this.lastLocalTransform.copy(localTransform);
		}
	},
	spawnPickup: function()
	{
		let self = this,
			syncSys = this.el.sceneEl.systems['sync-system'];

		self.sync.dataRef.child('spawnClient').on('value', checkSpawnClient);
		function checkSpawnClient(snapshot)
		{
			if(snapshot.val() === syncSys.clientId){
				self.sync.dataRef.child('grabber').on('value', assignGrabHand);
			}
		}

		function assignGrabHand(snapshot)
		{
			if(!snapshot.val()) return;
			
			let hand = document.getElementById(snapshot.val());
			console.log(snapshot.val(), hand);
			self.pickup({detail: hand});
			self.sync.dataRef.child('spawnClient').remove();
			self.sync.dataRef.child('grabber').remove();
		}
	}
});