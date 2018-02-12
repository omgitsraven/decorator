import {setLocalTransform} from './utils';

//just to spare garbage collection:
let localTransform = new AFRAME.THREE.Matrix4();
let avgPos = new AFRAME.THREE.Vector3();
let avgRot = new AFRAME.THREE.Quaternion();
let scaleVec = new AFRAME.THREE.Vector3();
let incrementMtx = new AFRAME.THREE.Matrix4();
let inverseMtx = new AFRAME.THREE.Matrix4();
let newObjMtx = new AFRAME.THREE.Matrix4();
let boundingBox = new AFRAME.THREE.Box3();
let boundingSize = new AFRAME.THREE.Vector3();
let boundingCenter = new AFRAME.THREE.Vector3();

let upVec = new AFRAME.THREE.Vector3(0,1,0);
let offsetVec = new AFRAME.THREE.Vector3();
let headJoint;
altspace.getThreeJSTrackingSkeleton().then(
	function(skeletonInfo){
		headJoint = skeletonInfo.getJoint('Head');
	}
);

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
		this.deletePrompting = false;

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
				if (this.deletePrompting) {
					this.deleteSelf();
				} else {
					this.el.setAttribute('collision', 'kinematic', false);
				}
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
			
			
			
			let self = this;
			function setVisibility(newVisibility){
				//to work around visibility not traversing on its own in altspace...
				//afaik, none of these objects should ever have any reason to be invisible besides this,
				//so I don't believe there's any reason to worry about clobbering values here.
				self.el.object3D.traverse(
					function(curChild){ curChild.visible = newVisibility; }
				);
			}
			
			if (this.grabbers.size == 2) {// deletion state change can only happen because of resizing, which can only happen if both hands are engaged
				
				boundingBox.setFromObject(this.el.object3D);
				boundingBox.getSize(boundingSize);
				boundingBox.getCenter(boundingCenter);
				let boundingRad = boundingSize.length()/2;
				let newDeletePrompting = (boundingRad < 0.1);//arbitrary; tune if it seems too big or small
				
				if (newDeletePrompting != this.deletePrompting) {
					this.deletePrompting = newDeletePrompting;
					if (this.deletePrompting) {
						deletionMessage.setAttribute("n-text","text","Drop to delete");
					} else {
						deletionMessage.setAttribute("n-text","text","");
						setVisibility(true);
					}
				}
				
				if (this.deletePrompting) {
					
					setVisibility( Math.round((Date.now()/100)%2) );
					
					if (headJoint) {
						newObjMtx.identity();
						newObjMtx.setPosition(boundingCenter);
						newObjMtx.lookAt(headJoint.position, boundingCenter, upVec);
						deletionMessage.object3D.matrix.identity();
						deletionMessage.object3D.applyMatrix(newObjMtx);
						let offsetVec = new AFRAME.THREE.Vector3(0,0,boundingRad);
						offsetVec.applyQuaternion(deletionMessage.object3D.quaternion);
						deletionMessage.object3D.position.add(offsetVec);
						deletionMessage.object3D.scale.setScalar(0.5);
					}
					
				}
				
			}
			
			
			
			
			
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
	},
	deleteSelf: function(){
		
		deletionMessage.setAttribute("n-text","text","");
		
		//is there already a method that takes care of this somewhere else?
		//this is hardcoded with the same things as in spawner#spawn, which is copied from sync-system#instantiate...
		//a more centralized way of approaching this might not be a bad idea,
		//but unless there's something I've missed, I think it'd be outside of the scope of this feature
		let myLongKey = this.el.id;
		let instanceSeparatorString = '-instance-';
		let myRealKey = myLongKey.substr(myLongKey.indexOf(instanceSeparatorString) + instanceSeparatorString.length);
		let syncSys = this.el.sceneEl.systems['sync-system'];
		syncSys.sceneRef.child('main-instance-'+myRealKey).remove();
		syncSys.instantiatedElementsRef.child('main').child(myRealKey).remove();
		
	}
});