(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('three')) :
  typeof define === 'function' && define.amd ? define(['exports', 'three'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.HexMap = {}, global.THREE));
})(this, (function (exports, three) { 'use strict';

  // src/rendering/SurfaceHexMap.ts
  var _changeEvent = { type: "change" };
  var _startEvent = { type: "start" };
  var _endEvent = { type: "end" };
  var _ray = new three.Ray();
  var _plane = new three.Plane();
  var _TILT_LIMIT = Math.cos(70 * three.MathUtils.DEG2RAD);
  var _v = new three.Vector3();
  var _twoPI = 2 * Math.PI;
  var _STATE = {
    NONE: -1,
    ROTATE: 0,
    DOLLY: 1,
    PAN: 2,
    TOUCH_ROTATE: 3,
    TOUCH_PAN: 4,
    TOUCH_DOLLY_PAN: 5,
    TOUCH_DOLLY_ROTATE: 6
  };
  var _EPS = 1e-6;
  var OrbitControls = class extends three.Controls {
    /**
     * Constructs a new controls instance.
     *
     * @param {Object3D} object - The object that is managed by the controls.
     * @param {?HTMLElement} domElement - The HTML element used for event listeners.
     */
    constructor(object, domElement = null) {
      super(object, domElement);
      this.state = _STATE.NONE;
      this.target = new three.Vector3();
      this.cursor = new three.Vector3();
      this.minDistance = 0;
      this.maxDistance = Infinity;
      this.minZoom = 0;
      this.maxZoom = Infinity;
      this.minTargetRadius = 0;
      this.maxTargetRadius = Infinity;
      this.minPolarAngle = 0;
      this.maxPolarAngle = Math.PI;
      this.minAzimuthAngle = -Infinity;
      this.maxAzimuthAngle = Infinity;
      this.enableDamping = false;
      this.dampingFactor = 0.05;
      this.enableZoom = true;
      this.zoomSpeed = 1;
      this.enableRotate = true;
      this.rotateSpeed = 1;
      this.keyRotateSpeed = 1;
      this.enablePan = true;
      this.panSpeed = 1;
      this.screenSpacePanning = true;
      this.keyPanSpeed = 7;
      this.zoomToCursor = false;
      this.autoRotate = false;
      this.autoRotateSpeed = 2;
      this.keys = { LEFT: "ArrowLeft", UP: "ArrowUp", RIGHT: "ArrowRight", BOTTOM: "ArrowDown" };
      this.mouseButtons = { LEFT: three.MOUSE.ROTATE, MIDDLE: three.MOUSE.DOLLY, RIGHT: three.MOUSE.PAN };
      this.touches = { ONE: three.TOUCH.ROTATE, TWO: three.TOUCH.DOLLY_PAN };
      this.target0 = this.target.clone();
      this.position0 = this.object.position.clone();
      this.zoom0 = this.object.zoom;
      this._cursorStyle = "auto";
      this._domElementKeyEvents = null;
      this._lastPosition = new three.Vector3();
      this._lastQuaternion = new three.Quaternion();
      this._lastTargetPosition = new three.Vector3();
      this._quat = new three.Quaternion().setFromUnitVectors(object.up, new three.Vector3(0, 1, 0));
      this._quatInverse = this._quat.clone().invert();
      this._spherical = new three.Spherical();
      this._sphericalDelta = new three.Spherical();
      this._scale = 1;
      this._panOffset = new three.Vector3();
      this._rotateStart = new three.Vector2();
      this._rotateEnd = new three.Vector2();
      this._rotateDelta = new three.Vector2();
      this._panStart = new three.Vector2();
      this._panEnd = new three.Vector2();
      this._panDelta = new three.Vector2();
      this._dollyStart = new three.Vector2();
      this._dollyEnd = new three.Vector2();
      this._dollyDelta = new three.Vector2();
      this._dollyDirection = new three.Vector3();
      this._mouse = new three.Vector2();
      this._performCursorZoom = false;
      this._pointers = [];
      this._pointerPositions = {};
      this._controlActive = false;
      this._onPointerMove = onPointerMove.bind(this);
      this._onPointerDown = onPointerDown.bind(this);
      this._onPointerUp = onPointerUp.bind(this);
      this._onContextMenu = onContextMenu.bind(this);
      this._onMouseWheel = onMouseWheel.bind(this);
      this._onKeyDown = onKeyDown.bind(this);
      this._onTouchStart = onTouchStart.bind(this);
      this._onTouchMove = onTouchMove.bind(this);
      this._onMouseDown = onMouseDown.bind(this);
      this._onMouseMove = onMouseMove.bind(this);
      this._interceptControlDown = interceptControlDown.bind(this);
      this._interceptControlUp = interceptControlUp.bind(this);
      if (this.domElement !== null) {
        this.connect(this.domElement);
      }
      this.update();
    }
    /**
     * Defines the visual representation of the cursor.
     *
     * @type {('auto'|'grab')}
     * @default 'auto'
     */
    set cursorStyle(type) {
      this._cursorStyle = type;
      if (type === "grab") {
        this.domElement.style.cursor = "grab";
      } else {
        this.domElement.style.cursor = "auto";
      }
    }
    get cursorStyle() {
      return this._cursorStyle;
    }
    connect(element) {
      super.connect(element);
      this.domElement.addEventListener("pointerdown", this._onPointerDown);
      this.domElement.addEventListener("pointercancel", this._onPointerUp);
      this.domElement.addEventListener("contextmenu", this._onContextMenu);
      this.domElement.addEventListener("wheel", this._onMouseWheel, { passive: false });
      const document2 = this.domElement.getRootNode();
      document2.addEventListener("keydown", this._interceptControlDown, { passive: true, capture: true });
      this.domElement.style.touchAction = "none";
    }
    disconnect() {
      this.domElement.removeEventListener("pointerdown", this._onPointerDown);
      this.domElement.ownerDocument.removeEventListener("pointermove", this._onPointerMove);
      this.domElement.ownerDocument.removeEventListener("pointerup", this._onPointerUp);
      this.domElement.removeEventListener("pointercancel", this._onPointerUp);
      this.domElement.removeEventListener("wheel", this._onMouseWheel);
      this.domElement.removeEventListener("contextmenu", this._onContextMenu);
      this.stopListenToKeyEvents();
      const document2 = this.domElement.getRootNode();
      document2.removeEventListener("keydown", this._interceptControlDown, { capture: true });
      this.domElement.style.touchAction = "";
    }
    dispose() {
      this.disconnect();
    }
    /**
     * Get the current vertical rotation, in radians.
     *
     * @return {number} The current vertical rotation, in radians.
     */
    getPolarAngle() {
      return this._spherical.phi;
    }
    /**
     * Get the current horizontal rotation, in radians.
     *
     * @return {number} The current horizontal rotation, in radians.
     */
    getAzimuthalAngle() {
      return this._spherical.theta;
    }
    /**
     * Returns the distance from the camera to the target.
     *
     * @return {number} The distance from the camera to the target.
     */
    getDistance() {
      return this.object.position.distanceTo(this.target);
    }
    /**
     * Adds key event listeners to the given DOM element.
     * `window` is a recommended argument for using this method.
     *
     * @param {HTMLElement} domElement - The DOM element
     */
    listenToKeyEvents(domElement) {
      domElement.addEventListener("keydown", this._onKeyDown);
      this._domElementKeyEvents = domElement;
    }
    /**
     * Removes the key event listener previously defined with `listenToKeyEvents()`.
     */
    stopListenToKeyEvents() {
      if (this._domElementKeyEvents !== null) {
        this._domElementKeyEvents.removeEventListener("keydown", this._onKeyDown);
        this._domElementKeyEvents = null;
      }
    }
    /**
     * Save the current state of the controls. This can later be recovered with `reset()`.
     */
    saveState() {
      this.target0.copy(this.target);
      this.position0.copy(this.object.position);
      this.zoom0 = this.object.zoom;
    }
    /**
     * Reset the controls to their state from either the last time the `saveState()`
     * was called, or the initial state.
     */
    reset() {
      this.target.copy(this.target0);
      this.object.position.copy(this.position0);
      this.object.zoom = this.zoom0;
      this.object.updateProjectionMatrix();
      this.dispatchEvent(_changeEvent);
      this.update();
      this.state = _STATE.NONE;
    }
    /**
     * Programmatically pan the camera.
     *
     * @param {number} deltaX - The horizontal pan amount in pixels.
     * @param {number} deltaY - The vertical pan amount in pixels.
     */
    pan(deltaX, deltaY) {
      this._pan(deltaX, deltaY);
      this.update();
    }
    /**
     * Programmatically dolly in (zoom in for perspective camera).
     *
     * @param {number} dollyScale - The dolly scale factor.
     */
    dollyIn(dollyScale) {
      this._dollyIn(dollyScale);
      this.update();
    }
    /**
     * Programmatically dolly out (zoom out for perspective camera).
     *
     * @param {number} dollyScale - The dolly scale factor.
     */
    dollyOut(dollyScale) {
      this._dollyOut(dollyScale);
      this.update();
    }
    /**
     * Programmatically rotate the camera left (around the vertical axis).
     *
     * @param {number} angle - The rotation angle in radians.
     */
    rotateLeft(angle) {
      this._rotateLeft(angle);
      this.update();
    }
    /**
     * Programmatically rotate the camera up (around the horizontal axis).
     *
     * @param {number} angle - The rotation angle in radians.
     */
    rotateUp(angle) {
      this._rotateUp(angle);
      this.update();
    }
    update(deltaTime = null) {
      const position = this.object.position;
      _v.copy(position).sub(this.target);
      _v.applyQuaternion(this._quat);
      this._spherical.setFromVector3(_v);
      if (this.autoRotate && this.state === _STATE.NONE) {
        this._rotateLeft(this._getAutoRotationAngle(deltaTime));
      }
      if (this.enableDamping) {
        this._spherical.theta += this._sphericalDelta.theta * this.dampingFactor;
        this._spherical.phi += this._sphericalDelta.phi * this.dampingFactor;
      } else {
        this._spherical.theta += this._sphericalDelta.theta;
        this._spherical.phi += this._sphericalDelta.phi;
      }
      let min = this.minAzimuthAngle;
      let max = this.maxAzimuthAngle;
      if (isFinite(min) && isFinite(max)) {
        if (min < -Math.PI) min += _twoPI;
        else if (min > Math.PI) min -= _twoPI;
        if (max < -Math.PI) max += _twoPI;
        else if (max > Math.PI) max -= _twoPI;
        if (min <= max) {
          this._spherical.theta = Math.max(min, Math.min(max, this._spherical.theta));
        } else {
          this._spherical.theta = this._spherical.theta > (min + max) / 2 ? Math.max(min, this._spherical.theta) : Math.min(max, this._spherical.theta);
        }
      }
      this._spherical.phi = Math.max(this.minPolarAngle, Math.min(this.maxPolarAngle, this._spherical.phi));
      this._spherical.makeSafe();
      if (this.enableDamping === true) {
        this.target.addScaledVector(this._panOffset, this.dampingFactor);
      } else {
        this.target.add(this._panOffset);
      }
      this.target.sub(this.cursor);
      this.target.clampLength(this.minTargetRadius, this.maxTargetRadius);
      this.target.add(this.cursor);
      let zoomChanged = false;
      if (this.zoomToCursor && this._performCursorZoom || this.object.isOrthographicCamera) {
        this._spherical.radius = this._clampDistance(this._spherical.radius);
      } else {
        const prevRadius = this._spherical.radius;
        this._spherical.radius = this._clampDistance(this._spherical.radius * this._scale);
        zoomChanged = prevRadius != this._spherical.radius;
      }
      _v.setFromSpherical(this._spherical);
      _v.applyQuaternion(this._quatInverse);
      position.copy(this.target).add(_v);
      this.object.lookAt(this.target);
      if (this.enableDamping === true) {
        this._sphericalDelta.theta *= 1 - this.dampingFactor;
        this._sphericalDelta.phi *= 1 - this.dampingFactor;
        this._panOffset.multiplyScalar(1 - this.dampingFactor);
      } else {
        this._sphericalDelta.set(0, 0, 0);
        this._panOffset.set(0, 0, 0);
      }
      if (this.zoomToCursor && this._performCursorZoom) {
        let newRadius = null;
        if (this.object.isPerspectiveCamera) {
          const prevRadius = _v.length();
          newRadius = this._clampDistance(prevRadius * this._scale);
          const radiusDelta = prevRadius - newRadius;
          this.object.position.addScaledVector(this._dollyDirection, radiusDelta);
          this.object.updateMatrixWorld();
          zoomChanged = !!radiusDelta;
        } else if (this.object.isOrthographicCamera) {
          const mouseBefore = new three.Vector3(this._mouse.x, this._mouse.y, 0);
          mouseBefore.unproject(this.object);
          const prevZoom = this.object.zoom;
          this.object.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.object.zoom / this._scale));
          this.object.updateProjectionMatrix();
          zoomChanged = prevZoom !== this.object.zoom;
          const mouseAfter = new three.Vector3(this._mouse.x, this._mouse.y, 0);
          mouseAfter.unproject(this.object);
          this.object.position.sub(mouseAfter).add(mouseBefore);
          this.object.updateMatrixWorld();
          newRadius = _v.length();
        } else {
          console.warn("WARNING: OrbitControls.js encountered an unknown camera type - zoom to cursor disabled.");
          this.zoomToCursor = false;
        }
        if (newRadius !== null) {
          if (this.screenSpacePanning) {
            this.target.set(0, 0, -1).transformDirection(this.object.matrix).multiplyScalar(newRadius).add(this.object.position);
          } else {
            _ray.origin.copy(this.object.position);
            _ray.direction.set(0, 0, -1).transformDirection(this.object.matrix);
            if (Math.abs(this.object.up.dot(_ray.direction)) < _TILT_LIMIT) {
              this.object.lookAt(this.target);
            } else {
              _plane.setFromNormalAndCoplanarPoint(this.object.up, this.target);
              _ray.intersectPlane(_plane, this.target);
            }
          }
        }
      } else if (this.object.isOrthographicCamera) {
        const prevZoom = this.object.zoom;
        this.object.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.object.zoom / this._scale));
        if (prevZoom !== this.object.zoom) {
          this.object.updateProjectionMatrix();
          zoomChanged = true;
        }
      }
      this._scale = 1;
      this._performCursorZoom = false;
      if (zoomChanged || this._lastPosition.distanceToSquared(this.object.position) > _EPS || 8 * (1 - this._lastQuaternion.dot(this.object.quaternion)) > _EPS || this._lastTargetPosition.distanceToSquared(this.target) > _EPS) {
        this.dispatchEvent(_changeEvent);
        this._lastPosition.copy(this.object.position);
        this._lastQuaternion.copy(this.object.quaternion);
        this._lastTargetPosition.copy(this.target);
        return true;
      }
      return false;
    }
    _getAutoRotationAngle(deltaTime) {
      if (deltaTime !== null) {
        return _twoPI / 60 * this.autoRotateSpeed * deltaTime;
      } else {
        return _twoPI / 60 / 60 * this.autoRotateSpeed;
      }
    }
    _getZoomScale(delta) {
      const normalizedDelta = Math.abs(delta * 0.01);
      return Math.pow(0.95, this.zoomSpeed * normalizedDelta);
    }
    _rotateLeft(angle) {
      this._sphericalDelta.theta -= angle;
    }
    _rotateUp(angle) {
      this._sphericalDelta.phi -= angle;
    }
    _panLeft(distance, objectMatrix) {
      _v.setFromMatrixColumn(objectMatrix, 0);
      _v.multiplyScalar(-distance);
      this._panOffset.add(_v);
    }
    _panUp(distance, objectMatrix) {
      if (this.screenSpacePanning === true) {
        _v.setFromMatrixColumn(objectMatrix, 1);
      } else {
        _v.setFromMatrixColumn(objectMatrix, 0);
        _v.crossVectors(this.object.up, _v);
      }
      _v.multiplyScalar(distance);
      this._panOffset.add(_v);
    }
    // deltaX and deltaY are in pixels; right and down are positive
    _pan(deltaX, deltaY) {
      const element = this.domElement;
      if (this.object.isPerspectiveCamera) {
        const position = this.object.position;
        _v.copy(position).sub(this.target);
        let targetDistance = _v.length();
        targetDistance *= Math.tan(this.object.fov / 2 * Math.PI / 180);
        this._panLeft(2 * deltaX * targetDistance / element.clientHeight, this.object.matrix);
        this._panUp(2 * deltaY * targetDistance / element.clientHeight, this.object.matrix);
      } else if (this.object.isOrthographicCamera) {
        this._panLeft(deltaX * (this.object.right - this.object.left) / this.object.zoom / element.clientWidth, this.object.matrix);
        this._panUp(deltaY * (this.object.top - this.object.bottom) / this.object.zoom / element.clientHeight, this.object.matrix);
      } else {
        console.warn("WARNING: OrbitControls.js encountered an unknown camera type - pan disabled.");
        this.enablePan = false;
      }
    }
    _dollyOut(dollyScale) {
      if (this.object.isPerspectiveCamera || this.object.isOrthographicCamera) {
        this._scale /= dollyScale;
      } else {
        console.warn("WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled.");
        this.enableZoom = false;
      }
    }
    _dollyIn(dollyScale) {
      if (this.object.isPerspectiveCamera || this.object.isOrthographicCamera) {
        this._scale *= dollyScale;
      } else {
        console.warn("WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled.");
        this.enableZoom = false;
      }
    }
    _updateZoomParameters(x, y) {
      if (!this.zoomToCursor) {
        return;
      }
      this._performCursorZoom = true;
      const rect = this.domElement.getBoundingClientRect();
      const dx = x - rect.left;
      const dy = y - rect.top;
      const w = rect.width;
      const h = rect.height;
      this._mouse.x = dx / w * 2 - 1;
      this._mouse.y = -(dy / h) * 2 + 1;
      this._dollyDirection.set(this._mouse.x, this._mouse.y, 1).unproject(this.object).sub(this.object.position).normalize();
    }
    _clampDistance(dist) {
      return Math.max(this.minDistance, Math.min(this.maxDistance, dist));
    }
    //
    // event callbacks - update the object state
    //
    _handleMouseDownRotate(event) {
      this._rotateStart.set(event.clientX, event.clientY);
    }
    _handleMouseDownDolly(event) {
      this._updateZoomParameters(event.clientX, event.clientX);
      this._dollyStart.set(event.clientX, event.clientY);
    }
    _handleMouseDownPan(event) {
      this._panStart.set(event.clientX, event.clientY);
    }
    _handleMouseMoveRotate(event) {
      this._rotateEnd.set(event.clientX, event.clientY);
      this._rotateDelta.subVectors(this._rotateEnd, this._rotateStart).multiplyScalar(this.rotateSpeed);
      const element = this.domElement;
      this._rotateLeft(_twoPI * this._rotateDelta.x / element.clientHeight);
      this._rotateUp(_twoPI * this._rotateDelta.y / element.clientHeight);
      this._rotateStart.copy(this._rotateEnd);
      this.update();
    }
    _handleMouseMoveDolly(event) {
      this._dollyEnd.set(event.clientX, event.clientY);
      this._dollyDelta.subVectors(this._dollyEnd, this._dollyStart);
      if (this._dollyDelta.y > 0) {
        this._dollyOut(this._getZoomScale(this._dollyDelta.y));
      } else if (this._dollyDelta.y < 0) {
        this._dollyIn(this._getZoomScale(this._dollyDelta.y));
      }
      this._dollyStart.copy(this._dollyEnd);
      this.update();
    }
    _handleMouseMovePan(event) {
      this._panEnd.set(event.clientX, event.clientY);
      this._panDelta.subVectors(this._panEnd, this._panStart).multiplyScalar(this.panSpeed);
      this._pan(this._panDelta.x, this._panDelta.y);
      this._panStart.copy(this._panEnd);
      this.update();
    }
    _handleMouseWheel(event) {
      this._updateZoomParameters(event.clientX, event.clientY);
      if (event.deltaY < 0) {
        this._dollyIn(this._getZoomScale(event.deltaY));
      } else if (event.deltaY > 0) {
        this._dollyOut(this._getZoomScale(event.deltaY));
      }
      this.update();
    }
    _handleKeyDown(event) {
      let needsUpdate = false;
      switch (event.code) {
        case this.keys.UP:
          if (event.ctrlKey || event.metaKey || event.shiftKey) {
            if (this.enableRotate) {
              this._rotateUp(_twoPI * this.keyRotateSpeed / this.domElement.clientHeight);
            }
          } else {
            if (this.enablePan) {
              this._pan(0, this.keyPanSpeed);
            }
          }
          needsUpdate = true;
          break;
        case this.keys.BOTTOM:
          if (event.ctrlKey || event.metaKey || event.shiftKey) {
            if (this.enableRotate) {
              this._rotateUp(-_twoPI * this.keyRotateSpeed / this.domElement.clientHeight);
            }
          } else {
            if (this.enablePan) {
              this._pan(0, -this.keyPanSpeed);
            }
          }
          needsUpdate = true;
          break;
        case this.keys.LEFT:
          if (event.ctrlKey || event.metaKey || event.shiftKey) {
            if (this.enableRotate) {
              this._rotateLeft(_twoPI * this.keyRotateSpeed / this.domElement.clientHeight);
            }
          } else {
            if (this.enablePan) {
              this._pan(this.keyPanSpeed, 0);
            }
          }
          needsUpdate = true;
          break;
        case this.keys.RIGHT:
          if (event.ctrlKey || event.metaKey || event.shiftKey) {
            if (this.enableRotate) {
              this._rotateLeft(-_twoPI * this.keyRotateSpeed / this.domElement.clientHeight);
            }
          } else {
            if (this.enablePan) {
              this._pan(-this.keyPanSpeed, 0);
            }
          }
          needsUpdate = true;
          break;
      }
      if (needsUpdate) {
        event.preventDefault();
        this.update();
      }
    }
    _handleTouchStartRotate(event) {
      if (this._pointers.length === 1) {
        this._rotateStart.set(event.pageX, event.pageY);
      } else {
        const position = this._getSecondPointerPosition(event);
        const x = 0.5 * (event.pageX + position.x);
        const y = 0.5 * (event.pageY + position.y);
        this._rotateStart.set(x, y);
      }
    }
    _handleTouchStartPan(event) {
      if (this._pointers.length === 1) {
        this._panStart.set(event.pageX, event.pageY);
      } else {
        const position = this._getSecondPointerPosition(event);
        const x = 0.5 * (event.pageX + position.x);
        const y = 0.5 * (event.pageY + position.y);
        this._panStart.set(x, y);
      }
    }
    _handleTouchStartDolly(event) {
      const position = this._getSecondPointerPosition(event);
      const dx = event.pageX - position.x;
      const dy = event.pageY - position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      this._dollyStart.set(0, distance);
    }
    _handleTouchStartDollyPan(event) {
      if (this.enableZoom) this._handleTouchStartDolly(event);
      if (this.enablePan) this._handleTouchStartPan(event);
    }
    _handleTouchStartDollyRotate(event) {
      if (this.enableZoom) this._handleTouchStartDolly(event);
      if (this.enableRotate) this._handleTouchStartRotate(event);
    }
    _handleTouchMoveRotate(event) {
      if (this._pointers.length == 1) {
        this._rotateEnd.set(event.pageX, event.pageY);
      } else {
        const position = this._getSecondPointerPosition(event);
        const x = 0.5 * (event.pageX + position.x);
        const y = 0.5 * (event.pageY + position.y);
        this._rotateEnd.set(x, y);
      }
      this._rotateDelta.subVectors(this._rotateEnd, this._rotateStart).multiplyScalar(this.rotateSpeed);
      const element = this.domElement;
      this._rotateLeft(_twoPI * this._rotateDelta.x / element.clientHeight);
      this._rotateUp(_twoPI * this._rotateDelta.y / element.clientHeight);
      this._rotateStart.copy(this._rotateEnd);
    }
    _handleTouchMovePan(event) {
      if (this._pointers.length === 1) {
        this._panEnd.set(event.pageX, event.pageY);
      } else {
        const position = this._getSecondPointerPosition(event);
        const x = 0.5 * (event.pageX + position.x);
        const y = 0.5 * (event.pageY + position.y);
        this._panEnd.set(x, y);
      }
      this._panDelta.subVectors(this._panEnd, this._panStart).multiplyScalar(this.panSpeed);
      this._pan(this._panDelta.x, this._panDelta.y);
      this._panStart.copy(this._panEnd);
    }
    _handleTouchMoveDolly(event) {
      const position = this._getSecondPointerPosition(event);
      const dx = event.pageX - position.x;
      const dy = event.pageY - position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      this._dollyEnd.set(0, distance);
      this._dollyDelta.set(0, Math.pow(this._dollyEnd.y / this._dollyStart.y, this.zoomSpeed));
      this._dollyOut(this._dollyDelta.y);
      this._dollyStart.copy(this._dollyEnd);
      const centerX = (event.pageX + position.x) * 0.5;
      const centerY = (event.pageY + position.y) * 0.5;
      this._updateZoomParameters(centerX, centerY);
    }
    _handleTouchMoveDollyPan(event) {
      if (this.enableZoom) this._handleTouchMoveDolly(event);
      if (this.enablePan) this._handleTouchMovePan(event);
    }
    _handleTouchMoveDollyRotate(event) {
      if (this.enableZoom) this._handleTouchMoveDolly(event);
      if (this.enableRotate) this._handleTouchMoveRotate(event);
    }
    // pointers
    _addPointer(event) {
      this._pointers.push(event.pointerId);
    }
    _removePointer(event) {
      delete this._pointerPositions[event.pointerId];
      for (let i = 0; i < this._pointers.length; i++) {
        if (this._pointers[i] == event.pointerId) {
          this._pointers.splice(i, 1);
          return;
        }
      }
    }
    _isTrackingPointer(event) {
      for (let i = 0; i < this._pointers.length; i++) {
        if (this._pointers[i] == event.pointerId) return true;
      }
      return false;
    }
    _trackPointer(event) {
      let position = this._pointerPositions[event.pointerId];
      if (position === void 0) {
        position = new three.Vector2();
        this._pointerPositions[event.pointerId] = position;
      }
      position.set(event.pageX, event.pageY);
    }
    _getSecondPointerPosition(event) {
      const pointerId = event.pointerId === this._pointers[0] ? this._pointers[1] : this._pointers[0];
      return this._pointerPositions[pointerId];
    }
    //
    _customWheelEvent(event) {
      const mode = event.deltaMode;
      const newEvent = {
        clientX: event.clientX,
        clientY: event.clientY,
        deltaY: event.deltaY
      };
      switch (mode) {
        case 1:
          newEvent.deltaY *= 16;
          break;
        case 2:
          newEvent.deltaY *= 100;
          break;
      }
      if (event.ctrlKey && !this._controlActive) {
        newEvent.deltaY *= 10;
      }
      return newEvent;
    }
  };
  function onPointerDown(event) {
    if (this.enabled === false) return;
    if (this._pointers.length === 0) {
      this.domElement.setPointerCapture(event.pointerId);
      this.domElement.ownerDocument.addEventListener("pointermove", this._onPointerMove);
      this.domElement.ownerDocument.addEventListener("pointerup", this._onPointerUp);
    }
    if (this._isTrackingPointer(event)) return;
    this._addPointer(event);
    if (event.pointerType === "touch") {
      this._onTouchStart(event);
    } else {
      this._onMouseDown(event);
    }
    if (this._cursorStyle === "grab") {
      this.domElement.style.cursor = "grabbing";
    }
  }
  function onPointerMove(event) {
    if (this.enabled === false) return;
    if (event.pointerType === "touch") {
      this._onTouchMove(event);
    } else {
      this._onMouseMove(event);
    }
  }
  function onPointerUp(event) {
    this._removePointer(event);
    switch (this._pointers.length) {
      case 0:
        this.domElement.releasePointerCapture(event.pointerId);
        this.domElement.ownerDocument.removeEventListener("pointermove", this._onPointerMove);
        this.domElement.ownerDocument.removeEventListener("pointerup", this._onPointerUp);
        this.dispatchEvent(_endEvent);
        this.state = _STATE.NONE;
        if (this._cursorStyle === "grab") {
          this.domElement.style.cursor = "grab";
        }
        break;
      case 1:
        const pointerId = this._pointers[0];
        const position = this._pointerPositions[pointerId];
        this._onTouchStart({ pointerId, pageX: position.x, pageY: position.y });
        break;
    }
  }
  function onMouseDown(event) {
    let mouseAction;
    switch (event.button) {
      case 0:
        mouseAction = this.mouseButtons.LEFT;
        break;
      case 1:
        mouseAction = this.mouseButtons.MIDDLE;
        break;
      case 2:
        mouseAction = this.mouseButtons.RIGHT;
        break;
      default:
        mouseAction = -1;
    }
    switch (mouseAction) {
      case three.MOUSE.DOLLY:
        if (this.enableZoom === false) return;
        this._handleMouseDownDolly(event);
        this.state = _STATE.DOLLY;
        break;
      case three.MOUSE.ROTATE:
        if (event.ctrlKey || event.metaKey || event.shiftKey) {
          if (this.enablePan === false) return;
          this._handleMouseDownPan(event);
          this.state = _STATE.PAN;
        } else {
          if (this.enableRotate === false) return;
          this._handleMouseDownRotate(event);
          this.state = _STATE.ROTATE;
        }
        break;
      case three.MOUSE.PAN:
        if (event.ctrlKey || event.metaKey || event.shiftKey) {
          if (this.enableRotate === false) return;
          this._handleMouseDownRotate(event);
          this.state = _STATE.ROTATE;
        } else {
          if (this.enablePan === false) return;
          this._handleMouseDownPan(event);
          this.state = _STATE.PAN;
        }
        break;
      default:
        this.state = _STATE.NONE;
    }
    if (this.state !== _STATE.NONE) {
      this.dispatchEvent(_startEvent);
    }
  }
  function onMouseMove(event) {
    switch (this.state) {
      case _STATE.ROTATE:
        if (this.enableRotate === false) return;
        this._handleMouseMoveRotate(event);
        break;
      case _STATE.DOLLY:
        if (this.enableZoom === false) return;
        this._handleMouseMoveDolly(event);
        break;
      case _STATE.PAN:
        if (this.enablePan === false) return;
        this._handleMouseMovePan(event);
        break;
    }
  }
  function onMouseWheel(event) {
    if (this.enabled === false || this.enableZoom === false || this.state !== _STATE.NONE) return;
    event.preventDefault();
    this.dispatchEvent(_startEvent);
    this._handleMouseWheel(this._customWheelEvent(event));
    this.dispatchEvent(_endEvent);
  }
  function onKeyDown(event) {
    if (this.enabled === false) return;
    this._handleKeyDown(event);
  }
  function onTouchStart(event) {
    this._trackPointer(event);
    switch (this._pointers.length) {
      case 1:
        switch (this.touches.ONE) {
          case three.TOUCH.ROTATE:
            if (this.enableRotate === false) return;
            this._handleTouchStartRotate(event);
            this.state = _STATE.TOUCH_ROTATE;
            break;
          case three.TOUCH.PAN:
            if (this.enablePan === false) return;
            this._handleTouchStartPan(event);
            this.state = _STATE.TOUCH_PAN;
            break;
          default:
            this.state = _STATE.NONE;
        }
        break;
      case 2:
        switch (this.touches.TWO) {
          case three.TOUCH.DOLLY_PAN:
            if (this.enableZoom === false && this.enablePan === false) return;
            this._handleTouchStartDollyPan(event);
            this.state = _STATE.TOUCH_DOLLY_PAN;
            break;
          case three.TOUCH.DOLLY_ROTATE:
            if (this.enableZoom === false && this.enableRotate === false) return;
            this._handleTouchStartDollyRotate(event);
            this.state = _STATE.TOUCH_DOLLY_ROTATE;
            break;
          default:
            this.state = _STATE.NONE;
        }
        break;
      default:
        this.state = _STATE.NONE;
    }
    if (this.state !== _STATE.NONE) {
      this.dispatchEvent(_startEvent);
    }
  }
  function onTouchMove(event) {
    this._trackPointer(event);
    switch (this.state) {
      case _STATE.TOUCH_ROTATE:
        if (this.enableRotate === false) return;
        this._handleTouchMoveRotate(event);
        this.update();
        break;
      case _STATE.TOUCH_PAN:
        if (this.enablePan === false) return;
        this._handleTouchMovePan(event);
        this.update();
        break;
      case _STATE.TOUCH_DOLLY_PAN:
        if (this.enableZoom === false && this.enablePan === false) return;
        this._handleTouchMoveDollyPan(event);
        this.update();
        break;
      case _STATE.TOUCH_DOLLY_ROTATE:
        if (this.enableZoom === false && this.enableRotate === false) return;
        this._handleTouchMoveDollyRotate(event);
        this.update();
        break;
      default:
        this.state = _STATE.NONE;
    }
  }
  function onContextMenu(event) {
    if (this.enabled === false) return;
    event.preventDefault();
  }
  function interceptControlDown(event) {
    if (event.key === "Control") {
      this._controlActive = true;
      const document2 = this.domElement.getRootNode();
      document2.addEventListener("keyup", this._interceptControlUp, { passive: true, capture: true });
    }
  }
  function interceptControlUp(event) {
    if (event.key === "Control") {
      this._controlActive = false;
      const document2 = this.domElement.getRootNode();
      document2.removeEventListener("keyup", this._interceptControlUp, { passive: true, capture: true });
    }
  }
  var Sky = class _Sky extends three.Mesh {
    /**
     * Constructs a new skydome.
     */
    constructor() {
      const shader = _Sky.SkyShader;
      const material = new three.ShaderMaterial({
        name: shader.name,
        uniforms: three.UniformsUtils.clone(shader.uniforms),
        vertexShader: shader.vertexShader,
        fragmentShader: shader.fragmentShader,
        side: three.BackSide,
        depthWrite: false
      });
      super(new three.BoxGeometry(1, 1, 1), material);
      this.isSky = true;
    }
  };
  Sky.SkyShader = {
    name: "SkyShader",
    uniforms: {
      "turbidity": { value: 2 },
      "rayleigh": { value: 1 },
      "mieCoefficient": { value: 5e-3 },
      "mieDirectionalG": { value: 0.8 },
      "sunPosition": { value: new three.Vector3() },
      "up": { value: new three.Vector3(0, 1, 0) },
      "cloudScale": { value: 2e-4 },
      "cloudSpeed": { value: 1e-4 },
      "cloudCoverage": { value: 0.4 },
      "cloudDensity": { value: 0.4 },
      "cloudElevation": { value: 0.5 },
      "showSunDisc": { value: 1 },
      "time": { value: 0 }
    },
    vertexShader: (
      /* glsl */
      `
		uniform vec3 sunPosition;
		uniform float rayleigh;
		uniform float turbidity;
		uniform float mieCoefficient;
		uniform vec3 up;

		varying vec3 vWorldPosition;
		varying vec3 vSunDirection;
		varying float vSunfade;
		varying vec3 vBetaR;
		varying vec3 vBetaM;
		varying float vSunE;

		// constants for atmospheric scattering
		const float e = 2.71828182845904523536028747135266249775724709369995957;
		const float pi = 3.141592653589793238462643383279502884197169;

		// wavelength of used primaries, according to preetham
		const vec3 lambda = vec3( 680E-9, 550E-9, 450E-9 );
		// this pre-calculation replaces older TotalRayleigh(vec3 lambda) function:
		// (8.0 * pow(pi, 3.0) * pow(pow(n, 2.0) - 1.0, 2.0) * (6.0 + 3.0 * pn)) / (3.0 * N * pow(lambda, vec3(4.0)) * (6.0 - 7.0 * pn))
		const vec3 totalRayleigh = vec3( 5.804542996261093E-6, 1.3562911419845635E-5, 3.0265902468824876E-5 );

		// mie stuff
		// K coefficient for the primaries
		const float v = 4.0;
		const vec3 K = vec3( 0.686, 0.678, 0.666 );
		// MieConst = pi * pow( ( 2.0 * pi ) / lambda, vec3( v - 2.0 ) ) * K
		const vec3 MieConst = vec3( 1.8399918514433978E14, 2.7798023919660528E14, 4.0790479543861094E14 );

		// earth shadow hack
		// cutoffAngle = pi / 1.95;
		const float cutoffAngle = 1.6110731556870734;
		const float steepness = 1.5;
		const float EE = 1000.0;

		float sunIntensity( float zenithAngleCos ) {
			zenithAngleCos = clamp( zenithAngleCos, -1.0, 1.0 );
			return EE * max( 0.0, 1.0 - pow( e, -( ( cutoffAngle - acos( zenithAngleCos ) ) / steepness ) ) );
		}

		vec3 totalMie( float T ) {
			float c = ( 0.2 * T ) * 10E-18;
			return 0.434 * c * MieConst;
		}

		void main() {

			vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
			vWorldPosition = worldPosition.xyz;

			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
			gl_Position.z = gl_Position.w; // set z to camera.far

			vSunDirection = normalize( sunPosition );

			vSunE = sunIntensity( dot( vSunDirection, up ) );

			vSunfade = 1.0 - clamp( 1.0 - exp( ( sunPosition.y / 450000.0 ) ), 0.0, 1.0 );

			float rayleighCoefficient = rayleigh - ( 1.0 * ( 1.0 - vSunfade ) );

			// extinction (absorption + out scattering)
			// rayleigh coefficients
			vBetaR = totalRayleigh * rayleighCoefficient;

			// mie coefficients
			vBetaM = totalMie( turbidity ) * mieCoefficient;

		}`
    ),
    fragmentShader: (
      /* glsl */
      `
		varying vec3 vWorldPosition;
		varying vec3 vSunDirection;
		varying vec3 vBetaR;
		varying vec3 vBetaM;
		varying float vSunE;

		uniform float mieDirectionalG;
		uniform vec3 up;
		uniform float cloudScale;
		uniform float cloudSpeed;
		uniform float cloudCoverage;
		uniform float cloudDensity;
		uniform float cloudElevation;
		uniform float showSunDisc;
		uniform float time;

		// Cloud noise functions
		float hash( vec2 p ) {
			return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453123 );
		}

		float noise( vec2 p ) {
			vec2 i = floor( p );
			vec2 f = fract( p );
			f = f * f * ( 3.0 - 2.0 * f );
			float a = hash( i );
			float b = hash( i + vec2( 1.0, 0.0 ) );
			float c = hash( i + vec2( 0.0, 1.0 ) );
			float d = hash( i + vec2( 1.0, 1.0 ) );
			return mix( mix( a, b, f.x ), mix( c, d, f.x ), f.y );
		}

		float fbm( vec2 p ) {
			float value = 0.0;
			float amplitude = 0.5;
			for ( int i = 0; i < 5; i ++ ) {
				value += amplitude * noise( p );
				p *= 2.0;
				amplitude *= 0.5;
			}
			return value;
		}

		// constants for atmospheric scattering
		const float pi = 3.141592653589793238462643383279502884197169;

		const float n = 1.0003; // refractive index of air
		const float N = 2.545E25; // number of molecules per unit volume for air at 288.15K and 1013mb (sea level -45 celsius)

		// optical length at zenith for molecules
		const float rayleighZenithLength = 8.4E3;
		const float mieZenithLength = 1.25E3;
		// 66 arc seconds -> degrees, and the cosine of that
		const float sunAngularDiameterCos = 0.999956676946448443553574619906976478926848692873900859324;

		// 3.0 / ( 16.0 * pi )
		const float THREE_OVER_SIXTEENPI = 0.05968310365946075;
		// 1.0 / ( 4.0 * pi )
		const float ONE_OVER_FOURPI = 0.07957747154594767;

		float rayleighPhase( float cosTheta ) {
			return THREE_OVER_SIXTEENPI * ( 1.0 + pow( cosTheta, 2.0 ) );
		}

		float hgPhase( float cosTheta, float g ) {
			float g2 = pow( g, 2.0 );
			float inverse = 1.0 / pow( 1.0 - 2.0 * g * cosTheta + g2, 1.5 );
			return ONE_OVER_FOURPI * ( ( 1.0 - g2 ) * inverse );
		}

		void main() {

			vec3 direction = normalize( vWorldPosition - cameraPosition );

			// optical length
			// cutoff angle at 90 to avoid singularity in next formula.
			float zenithAngle = acos( max( 0.0, dot( up, direction ) ) );
			float inverse = 1.0 / ( cos( zenithAngle ) + 0.15 * pow( 93.885 - ( ( zenithAngle * 180.0 ) / pi ), -1.253 ) );
			float sR = rayleighZenithLength * inverse;
			float sM = mieZenithLength * inverse;

			// combined extinction factor
			vec3 Fex = exp( -( vBetaR * sR + vBetaM * sM ) );

			// in scattering
			float cosTheta = dot( direction, vSunDirection );

			float rPhase = rayleighPhase( cosTheta * 0.5 + 0.5 );
			vec3 betaRTheta = vBetaR * rPhase;

			float mPhase = hgPhase( cosTheta, mieDirectionalG );
			vec3 betaMTheta = vBetaM * mPhase;

			vec3 Lin = pow( vSunE * ( ( betaRTheta + betaMTheta ) / ( vBetaR + vBetaM ) ) * ( 1.0 - Fex ), vec3( 1.5 ) );
			Lin *= mix( vec3( 1.0 ), pow( vSunE * ( ( betaRTheta + betaMTheta ) / ( vBetaR + vBetaM ) ) * Fex, vec3( 1.0 / 2.0 ) ), clamp( pow( 1.0 - dot( up, vSunDirection ), 5.0 ), 0.0, 1.0 ) );

			// nightsky
			float theta = acos( direction.y ); // elevation --> y-axis, [-pi/2, pi/2]
			float phi = atan( direction.z, direction.x ); // azimuth --> x-axis [-pi/2, pi/2]
			vec2 uv = vec2( phi, theta ) / vec2( 2.0 * pi, pi ) + vec2( 0.5, 0.0 );
			vec3 L0 = vec3( 0.1 ) * Fex;

			// composition + solar disc
			float sundisc = smoothstep( sunAngularDiameterCos, sunAngularDiameterCos + 0.00002, cosTheta ) * showSunDisc;
			L0 += ( vSunE * 19000.0 * Fex ) * sundisc;

			vec3 texColor = ( Lin + L0 ) * 0.04 + vec3( 0.0, 0.0003, 0.00075 );

			// Clouds
			if ( direction.y > 0.0 && cloudCoverage > 0.0 ) {

				// Project to cloud plane (higher elevation = clouds appear lower/closer)
				float elevation = mix( 1.0, 0.1, cloudElevation );
				vec2 cloudUV = direction.xz / ( direction.y * elevation );
				cloudUV *= cloudScale;
				cloudUV += time * cloudSpeed;

				// Multi-octave noise for fluffy clouds
				float cloudNoise = fbm( cloudUV * 1000.0 );
				cloudNoise += 0.5 * fbm( cloudUV * 2000.0 + 3.7 );
				cloudNoise = cloudNoise * 0.5 + 0.5;

				// Apply coverage threshold
				float cloudMask = smoothstep( 1.0 - cloudCoverage, 1.0 - cloudCoverage + 0.3, cloudNoise );

				// Fade clouds near horizon (adjusted by elevation)
				float horizonFade = smoothstep( 0.0, 0.1 + 0.2 * cloudElevation, direction.y );
				cloudMask *= horizonFade;

				// Cloud lighting based on sun position
				float sunInfluence = dot( direction, vSunDirection ) * 0.5 + 0.5;
				float daylight = max( 0.0, vSunDirection.y * 2.0 );

				// Base cloud color affected by atmosphere
				vec3 atmosphereColor = Lin * 0.04;
				vec3 cloudColor = mix( vec3( 0.3 ), vec3( 1.0 ), daylight );
				cloudColor = mix( cloudColor, atmosphereColor + vec3( 1.0 ), sunInfluence * 0.5 );
				cloudColor *= vSunE * 0.00002;

				// Blend clouds with sky
				texColor = mix( texColor, cloudColor, cloudMask * cloudDensity );

			}

			gl_FragColor = vec4( texColor, 1.0 );

			#include <tonemapping_fragment>
			#include <colorspace_fragment>

		}`
    )
  };

  // src/EventEmitter.ts
  var EventEmitter = class {
    constructor() {
      this.listeners = {};
    }
    on(event, listener) {
      var _a;
      ((_a = this.listeners)[event] || (_a[event] = [])).push(listener);
      return this;
    }
    off(event, listener) {
      if (!this.listeners[event]) return this;
      if (!listener) {
        delete this.listeners[event];
        return this;
      }
      this.listeners[event] = this.listeners[event].filter((l) => l !== listener);
      return this;
    }
    emit(event, payload) {
      const list = this.listeners[event];
      if (!list || list.length === 0) return;
      for (const listener of list.slice()) {
        listener(payload);
      }
    }
    removeAllListeners(event) {
      if (event === void 0) this.listeners = {};
      else delete this.listeners[event];
      return this;
    }
  };

  // src/world/semantic/SurfaceCompileProfile.ts
  var SURFACE_RENDER_CHUNK_SIZE = 16;
  var SURFACE_SAMPLES_PER_TILE_INTERVAL = 4;
  var SURFACE_FIELD_CORE_SIZE = SURFACE_RENDER_CHUNK_SIZE * SURFACE_SAMPLES_PER_TILE_INTERVAL;
  var SURFACE_FIELD_GUTTER_TEXELS = 1;
  var SURFACE_FIELD_TEXTURE_SIZE = SURFACE_FIELD_CORE_SIZE + SURFACE_FIELD_GUTTER_TEXELS * 2;
  var SURFACE_FIELD_TEXEL_COUNT = SURFACE_FIELD_TEXTURE_SIZE * SURFACE_FIELD_TEXTURE_SIZE;
  var SURFACE_INFLUENCE_RADIUS_TILES = 2;
  var SURFACE_EFFECTIVE_WINDOW_SIZE = SURFACE_RENDER_CHUNK_SIZE + SURFACE_INFLUENCE_RADIUS_TILES * 2;
  var SURFACE_MAX_WATER_BODY_COUNT = 255;
  var SURFACE_CANONICAL_HEX_SIZE = 1;
  var SURFACE_TEXTURE_PAGE_LAYERS = 128;
  var SURFACE_WATER_COVERAGE_THRESHOLD = 128;
  var SURFACE_NARROW_RIVER_MAX_WIDTH_QUANTIZED = 24;
  var SURFACE_VEGETATION_COORDINATE_SCALE = 1024;
  var SURFACE_MAX_VEGETATION_SEEDS = SURFACE_RENDER_CHUNK_SIZE * SURFACE_RENDER_CHUNK_SIZE * 10;
  var SURFACE_COMPILER_REVISION = 3;
  var SURFACE_COMPILE_PROFILE_VERSION = 1;
  var SURFACE_COMPILE_PROFILE_V1 = Object.freeze({
    renderChunkSize: SURFACE_RENDER_CHUNK_SIZE,
    samplesPerTileInterval: SURFACE_SAMPLES_PER_TILE_INTERVAL,
    gutterTexels: SURFACE_FIELD_GUTTER_TEXELS,
    influenceRadiusTiles: SURFACE_INFLUENCE_RADIUS_TILES,
    textureLayerSize: SURFACE_FIELD_TEXTURE_SIZE,
    pageLayers: SURFACE_TEXTURE_PAGE_LAYERS,
    waterCoverageThreshold: SURFACE_WATER_COVERAGE_THRESHOLD,
    narrowRiverMaximumWidthQuantized: SURFACE_NARROW_RIVER_MAX_WIDTH_QUANTIZED,
    vegetationCoordinateScale: SURFACE_VEGETATION_COORDINATE_SCALE,
    maximumVegetationSeeds: SURFACE_MAX_VEGETATION_SEEDS
  });

  // src/world/semantic/SurfaceLattice.ts
  function assertFiniteCoordinate(name, value) {
    if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite`);
  }
  function assertHexSize(value) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new RangeError("surface lattice hexSize must be finite and positive");
    }
  }
  function surfaceColumnStagger(column) {
    if (!Number.isSafeInteger(column)) {
      throw new RangeError("surface lattice column must be a safe integer");
    }
    return column - Math.floor(column / 2) * 2 === 0 ? 0.5 : 0;
  }
  function surfaceStagger(u) {
    assertFiniteCoordinate("surface u", u);
    const column = Math.floor(u);
    if (!Number.isSafeInteger(column)) {
      throw new RangeError("surface lattice column exceeds the safe integer range");
    }
    const amount = u - column;
    const first = surfaceColumnStagger(column);
    if (amount === 0) return first;
    const second = surfaceColumnStagger(column + 1);
    return first + (second - first) * amount;
  }
  function surfaceToWorld(u, v, hexSize = SURFACE_CANONICAL_HEX_SIZE) {
    assertFiniteCoordinate("surface u", u);
    assertFiniteCoordinate("surface v", v);
    assertHexSize(hexSize);
    return Object.freeze({
      x: 1.5 * hexSize * u,
      z: Math.sqrt(3) * hexSize * (v + surfaceStagger(u))
    });
  }
  function worldToSurface(x, z, hexSize = SURFACE_CANONICAL_HEX_SIZE) {
    assertFiniteCoordinate("surface world x", x);
    assertFiniteCoordinate("surface world z", z);
    assertHexSize(hexSize);
    const u = x / (1.5 * hexSize);
    return Object.freeze({
      u,
      v: z / (Math.sqrt(3) * hexSize) - surfaceStagger(u)
    });
  }
  function surfaceLatticeTexelLocalCoordinate(physicalX, physicalY) {
    if (!Number.isInteger(physicalX) || physicalX < 0 || physicalX >= SURFACE_FIELD_TEXTURE_SIZE || !Number.isInteger(physicalY) || physicalY < 0 || physicalY >= SURFACE_FIELD_TEXTURE_SIZE) {
      throw new RangeError("surface lattice physical texel lies outside the field layer");
    }
    return Object.freeze({
      u: -0.5 + (physicalX - SURFACE_FIELD_GUTTER_TEXELS + 0.5) / SURFACE_SAMPLES_PER_TILE_INTERVAL,
      v: -0.5 + (physicalY - SURFACE_FIELD_GUTTER_TEXELS + 0.5) / SURFACE_SAMPLES_PER_TILE_INTERVAL
    });
  }
  function surfaceLatticeTexelWorldCoordinate(physicalX, physicalY) {
    const coordinate = surfaceLatticeTexelLocalCoordinate(physicalX, physicalY);
    return surfaceToWorld(coordinate.u, coordinate.v);
  }
  function surfaceFieldTexelCoordinate(localU, localV) {
    assertFiniteCoordinate("surface localU", localU);
    assertFiniteCoordinate("surface localV", localV);
    return Object.freeze({
      u: (localU + 0.5) * SURFACE_SAMPLES_PER_TILE_INTERVAL - 0.5 + SURFACE_FIELD_GUTTER_TEXELS,
      v: (localV + 0.5) * SURFACE_SAMPLES_PER_TILE_INTERVAL - 0.5 + SURFACE_FIELD_GUTTER_TEXELS
    });
  }
  function surfaceLatticeIndex(physicalX, physicalY) {
    if (!Number.isInteger(physicalX) || physicalX < 0 || physicalX >= SURFACE_FIELD_TEXTURE_SIZE || !Number.isInteger(physicalY) || physicalY < 0 || physicalY >= SURFACE_FIELD_TEXTURE_SIZE) {
      throw new RangeError("surface lattice texel lies outside the field layer");
    }
    return physicalX * SURFACE_FIELD_TEXTURE_SIZE + physicalY;
  }
  function surfacePointOwnerRenderChunk(u, v) {
    assertFiniteCoordinate("surface u", u);
    assertFiniteCoordinate("surface v", v);
    const chunkX = Math.floor((u + 0.5) / SURFACE_RENDER_CHUNK_SIZE);
    const chunkY = Math.floor((v + 0.5) / SURFACE_RENDER_CHUNK_SIZE);
    if (!Number.isSafeInteger(chunkX) || !Number.isSafeInteger(chunkY)) {
      throw new RangeError("surface owner render chunk exceeds the safe integer range");
    }
    return Object.freeze({ chunkX, chunkY });
  }
  var SURFACE_LATTICE_TEST_VECTORS = Object.freeze([
    Object.freeze({ u: 0, v: 0, x: 0, z: Math.sqrt(3) / 2 }),
    Object.freeze({ u: 1, v: 0, x: 1.5, z: 0 }),
    Object.freeze({ u: -1, v: 0, x: -1.5, z: 0 }),
    Object.freeze({ u: -2, v: -3, x: -3, z: -2.5 * Math.sqrt(3) })
  ]);

  // src/world/semantic/WorldSemanticCatalog.ts
  var SubstrateClass = /* @__PURE__ */ ((SubstrateClass4) => {
    SubstrateClass4[SubstrateClass4["Sediment"] = 0] = "Sediment";
    SubstrateClass4[SubstrateClass4["Soil"] = 1] = "Soil";
    SubstrateClass4[SubstrateClass4["Sand"] = 2] = "Sand";
    SubstrateClass4[SubstrateClass4["Rock"] = 3] = "Rock";
    SubstrateClass4[SubstrateClass4["Permafrost"] = 4] = "Permafrost";
    return SubstrateClass4;
  })(SubstrateClass || {});
  var WORLD_BIOME_BASIS = Object.freeze([
    "temperate",
    "dry",
    "cold",
    "alpine"
  ]);
  var WORLD_SUBSTRATE_CATALOG = Object.freeze([
    Object.freeze({ id: "sediment", class: 0 /* Sediment */ }),
    Object.freeze({ id: "soil", class: 1 /* Soil */ }),
    Object.freeze({ id: "sand", class: 2 /* Sand */ }),
    Object.freeze({ id: "rock", class: 3 /* Rock */ }),
    Object.freeze({ id: "permafrost", class: 4 /* Permafrost */ })
  ]);
  var WORLD_VEGETATION_PROFILE_CATALOG = Object.freeze([
    Object.freeze({ id: "none", species: Object.freeze([]) }),
    Object.freeze({
      id: "warm-palm-mix",
      species: Object.freeze([
        Object.freeze({ species: "palm", weight: 204 }),
        Object.freeze({ species: "oak", weight: 51 })
      ])
    }),
    Object.freeze({
      id: "cold-pinia-mix",
      species: Object.freeze([
        Object.freeze({ species: "pinia", weight: 204 }),
        Object.freeze({ species: "oak", weight: 51 })
      ])
    }),
    Object.freeze({
      id: "temperate-oak-mix",
      species: Object.freeze([
        Object.freeze({ species: "oak", weight: 178 }),
        Object.freeze({ species: "pinia", weight: 51 }),
        Object.freeze({ species: "palm", weight: 26 })
      ])
    })
  ]);
  var WORLD_SUBSTRATE_CATALOG_IDENTITY = Object.freeze({
    id: "three-hex-map/substrate-v1",
    contentHash: "471edc137e2d634b36a2fa7452a9b72ef204258648b681b4357e72abad4d1561"
  });
  var WORLD_VEGETATION_CATALOG_IDENTITY = Object.freeze({
    id: "three-hex-map/vegetation-v1",
    contentHash: "aa515fb7c895c1bd600b464119a9599e4963c466fcb35281f6824ce8911283ef"
  });

  // src/world/semantic/WorldSemanticFormat.ts
  var WORLD_SEMANTIC_CHUNK_SIZE = 32;
  var WORLD_SEMANTIC_CHUNK_TILE_COUNT = WORLD_SEMANTIC_CHUNK_SIZE * WORLD_SEMANTIC_CHUNK_SIZE;
  var WORLD_CHUNK_FORMAT_VERSION = 2;
  var HYDROLOGY_REGION_FORMAT_VERSION = 2;
  var BASE_SEMANTIC_CHUNK_REVISION = 0;
  var HYDROLOGY_REGION_SIZE = 128;
  var HYDROLOGY_REGION_REVISION = 0;
  var HYDROLOGY_COORDINATE_SCALE = 16;
  var HYDROLOGY_MACRO_CELL_SIZE = 16;
  var HYDROLOGY_INFINITE_BASIN_SIZE = 2048;
  var HYDROLOGY_MACRO_CELLS_PER_INFINITE_BASIN = HYDROLOGY_INFINITE_BASIN_SIZE / HYDROLOGY_MACRO_CELL_SIZE;
  var FULL_SEMANTIC_CHUNK_BOUNDS = Object.freeze({
    minX: 0,
    minY: 0,
    maxXExclusive: WORLD_SEMANTIC_CHUNK_SIZE,
    maxYExclusive: WORLD_SEMANTIC_CHUNK_SIZE
  });
  var FULL_HYDROLOGY_REGION_BOUNDS = Object.freeze({
    minX: 0,
    minY: 0,
    maxXExclusive: HYDROLOGY_REGION_SIZE,
    maxYExclusive: HYDROLOGY_REGION_SIZE
  });
  function assertSafeInteger(name, value) {
    if (!Number.isSafeInteger(value)) throw new RangeError(`${name} must be a safe integer`);
  }
  function assertSemanticChunkKey(value) {
    if (!value || typeof value !== "object") throw new TypeError("semantic chunk key must be an object");
    if (Object.getOwnPropertyNames(value).some((name) => name !== "chunkX" && name !== "chunkY")) {
      throw new TypeError("semantic chunk key contains unknown fields");
    }
    assertSafeInteger("semantic chunkX", value.chunkX);
    assertSafeInteger("semantic chunkY", value.chunkY);
    const originX = value.chunkX * WORLD_SEMANTIC_CHUNK_SIZE;
    const originY = value.chunkY * WORLD_SEMANTIC_CHUNK_SIZE;
    if (originX > Number.MAX_SAFE_INTEGER || originX + WORLD_SEMANTIC_CHUNK_SIZE - 1 < Number.MIN_SAFE_INTEGER || originY > Number.MAX_SAFE_INTEGER || originY + WORLD_SEMANTIC_CHUNK_SIZE - 1 < Number.MIN_SAFE_INTEGER) {
      throw new RangeError("semantic chunk key exceeds the safe integer tile range");
    }
  }
  function assertHydrologyRegionKey(value) {
    if (!value || typeof value !== "object") throw new TypeError("hydrology region key must be an object");
    if (Object.getOwnPropertyNames(value).some((name) => name !== "regionX" && name !== "regionY")) {
      throw new TypeError("hydrology region key contains unknown fields");
    }
    assertSafeInteger("hydrology regionX", value.regionX);
    assertSafeInteger("hydrology regionY", value.regionY);
    const originX = value.regionX * HYDROLOGY_REGION_SIZE;
    const originY = value.regionY * HYDROLOGY_REGION_SIZE;
    if (originX > Number.MAX_SAFE_INTEGER || originX + HYDROLOGY_REGION_SIZE - 1 < Number.MIN_SAFE_INTEGER || originY > Number.MAX_SAFE_INTEGER || originY + HYDROLOGY_REGION_SIZE - 1 < Number.MIN_SAFE_INTEGER) {
      throw new RangeError("hydrology region key exceeds the safe integer tile range");
    }
  }
  function assertHydrologyRegionLocalBounds(value) {
    if (!value || typeof value !== "object") throw new TypeError("hydrology region bounds must be an object");
    const allowed = /* @__PURE__ */ new Set(["minX", "minY", "maxXExclusive", "maxYExclusive"]);
    if (Object.getOwnPropertyNames(value).some((name) => !allowed.has(name))) {
      throw new TypeError("hydrology region bounds contain unknown fields");
    }
    for (const [name, coordinate] of [
      ["minX", value.minX],
      ["minY", value.minY],
      ["maxXExclusive", value.maxXExclusive],
      ["maxYExclusive", value.maxYExclusive]
    ]) {
      if (!Number.isInteger(coordinate) || coordinate < 0 || coordinate > HYDROLOGY_REGION_SIZE) {
        throw new RangeError(
          `hydrology region bounds ${name} must be an integer between 0 and ${HYDROLOGY_REGION_SIZE}`
        );
      }
    }
    if (value.minX >= value.maxXExclusive || value.minY >= value.maxYExclusive) {
      throw new RangeError("hydrology region bounds must contain at least one tile");
    }
  }
  function assertLocalTileBounds(value) {
    if (!value || typeof value !== "object") throw new TypeError("local tile bounds must be an object");
    const allowed = /* @__PURE__ */ new Set(["minX", "minY", "maxXExclusive", "maxYExclusive"]);
    if (Object.getOwnPropertyNames(value).some((name) => !allowed.has(name))) {
      throw new TypeError("local tile bounds contain unknown fields");
    }
    for (const [name, coordinate] of [
      ["minX", value.minX],
      ["minY", value.minY],
      ["maxXExclusive", value.maxXExclusive],
      ["maxYExclusive", value.maxYExclusive]
    ]) {
      if (!Number.isInteger(coordinate) || coordinate < 0 || coordinate > WORLD_SEMANTIC_CHUNK_SIZE) {
        throw new RangeError(`local tile bounds ${name} must be an integer between 0 and ${WORLD_SEMANTIC_CHUNK_SIZE}`);
      }
    }
    if (value.minX >= value.maxXExclusive || value.minY >= value.maxYExclusive) {
      throw new RangeError("local tile bounds must contain at least one tile");
    }
  }
  function semanticChunkCoordinate(tileCoordinate) {
    assertSafeInteger("semantic tile coordinate", tileCoordinate);
    return Math.floor(tileCoordinate / WORLD_SEMANTIC_CHUNK_SIZE);
  }
  function hydrologyRegionCoordinate(tileCoordinate) {
    assertSafeInteger("hydrology tile coordinate", tileCoordinate);
    return Math.floor(tileCoordinate / HYDROLOGY_REGION_SIZE);
  }
  function semanticChunkLocalIndex(localX, localY) {
    if (!Number.isInteger(localX) || localX < 0 || localX >= WORLD_SEMANTIC_CHUNK_SIZE || !Number.isInteger(localY) || localY < 0 || localY >= WORLD_SEMANTIC_CHUNK_SIZE) {
      throw new RangeError(`semantic local coordinates must be integers between 0 and ${WORLD_SEMANTIC_CHUNK_SIZE - 1}`);
    }
    return localX * WORLD_SEMANTIC_CHUNK_SIZE + localY;
  }
  function locateSemanticTile(tileX, tileY) {
    assertSafeInteger("semantic tileX", tileX);
    assertSafeInteger("semantic tileY", tileY);
    const chunkX = semanticChunkCoordinate(tileX);
    const chunkY = semanticChunkCoordinate(tileY);
    const localX = tileX - chunkX * WORLD_SEMANTIC_CHUNK_SIZE;
    const localY = tileY - chunkY * WORLD_SEMANTIC_CHUNK_SIZE;
    return {
      key: { chunkX, chunkY },
      localX,
      localY,
      index: semanticChunkLocalIndex(localX, localY)
    };
  }
  function semanticChunkOrigin(key2) {
    assertSemanticChunkKey(key2);
    return {
      x: key2.chunkX * WORLD_SEMANTIC_CHUNK_SIZE,
      y: key2.chunkY * WORLD_SEMANTIC_CHUNK_SIZE
    };
  }
  function hydrologyRegionOrigin(key2) {
    assertHydrologyRegionKey(key2);
    return {
      x: key2.regionX * HYDROLOGY_REGION_SIZE,
      y: key2.regionY * HYDROLOGY_REGION_SIZE
    };
  }
  function localBoundsContain(bounds, localX, localY) {
    return localX >= bounds.minX && localX < bounds.maxXExclusive && localY >= bounds.minY && localY < bounds.maxYExclusive;
  }
  function positiveIntegerModulo(value, modulus) {
    if (!Number.isSafeInteger(value)) throw new RangeError("modulo value must be a safe integer");
    if (!Number.isSafeInteger(modulus) || modulus <= 0) {
      throw new RangeError("modulo modulus must be a positive safe integer");
    }
    return value - Math.floor(value / modulus) * modulus;
  }

  // src/world/WorldGeneratorVersion.ts
  var WORLD_GENERATOR_VERSION = 8;

  // src/world/semantic/WorldDescriptorV2.ts
  var WORLD_DESCRIPTOR_FORMAT_VERSION = 2;
  function assertSeed(value) {
    if (typeof value !== "string" && typeof value !== "number") {
      throw new TypeError("v2 procedural world seed must be a string or number");
    }
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new RangeError("v2 numeric world seed must be finite");
    }
  }
  function assertDimension(name, value) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new RangeError(`v2 world ${name} must be a positive safe integer`);
    }
  }
  function assertToroidalDimensions(width, height) {
    assertDimension("width", width);
    assertDimension("height", height);
    if (width < WORLD_SEMANTIC_CHUNK_SIZE || height < WORLD_SEMANTIC_CHUNK_SIZE || positiveIntegerModulo(width, WORLD_SEMANTIC_CHUNK_SIZE) !== 0 || positiveIntegerModulo(height, WORLD_SEMANTIC_CHUNK_SIZE) !== 0) {
      throw new RangeError(
        `v2 toroidal world dimensions must be multiples of ${WORLD_SEMANTIC_CHUNK_SIZE} and at least ${WORLD_SEMANTIC_CHUNK_SIZE}`
      );
    }
  }
  function baseDescriptor() {
    return {
      descriptorVersion: WORLD_DESCRIPTOR_FORMAT_VERSION,
      semanticChunkFormatVersion: WORLD_CHUNK_FORMAT_VERSION,
      hydrologyRegionFormatVersion: HYDROLOGY_REGION_FORMAT_VERSION,
      biomeBasis: WORLD_BIOME_BASIS,
      substrateCatalog: WORLD_SUBSTRATE_CATALOG_IDENTITY,
      vegetationCatalog: WORLD_VEGETATION_CATALOG_IDENTITY
    };
  }
  function createWorldDescriptorV2(options) {
    if (!options || typeof options !== "object") throw new TypeError("v2 world descriptor options are required");
    const base = baseDescriptor();
    if (options.sourceKind === "static") {
      if (typeof options.sourceContentHash !== "string" || !/^[a-f0-9]{64}$/.test(options.sourceContentHash)) {
        throw new TypeError("v2 static world sourceContentHash must be a lowercase SHA-256 hex string");
      }
      assertDimension("width", options.topology.width);
      assertDimension("height", options.topology.height);
      if (options.topology.kind === "toroidal") {
        assertToroidalDimensions(options.topology.width, options.topology.height);
      } else if (options.topology.kind !== "bounded") {
        throw new TypeError("v2 static world topology is invalid");
      }
      return Object.freeze({
        ...base,
        sourceKind: "static",
        sourceContentHash: options.sourceContentHash,
        topology: options.topology.kind,
        width: options.topology.width,
        height: options.topology.height
      });
    }
    assertSeed(options.seed);
    const topology = options.topology ?? { kind: "infinite" };
    if (topology.kind === "infinite") {
      return Object.freeze({
        ...base,
        sourceKind: "procedural-infinite",
        seed: String(options.seed),
        generatorVersion: WORLD_GENERATOR_VERSION,
        topology: "infinite"
      });
    }
    if (topology.kind !== "toroidal") throw new TypeError("v2 procedural world topology is invalid");
    assertToroidalDimensions(topology.width, topology.height);
    return Object.freeze({
      ...base,
      sourceKind: "procedural-toroidal",
      seed: String(options.seed),
      generatorVersion: WORLD_GENERATOR_VERSION,
      topology: "toroidal",
      width: topology.width,
      height: topology.height
    });
  }
  function catalogIdentityMatches(value, expected) {
    return Boolean(value && typeof value === "object" && Object.getOwnPropertyNames(value).sort().join(",") === "contentHash,id" && value.id === expected.id && value.contentHash === expected.contentHash);
  }
  function assertWorldDescriptorV2(value) {
    if (!value || typeof value !== "object") throw new TypeError("v2 world descriptor must be an object");
    const descriptor = value;
    if (descriptor.descriptorVersion !== WORLD_DESCRIPTOR_FORMAT_VERSION) {
      throw new TypeError(`unsupported v2 world descriptor format ${String(descriptor.descriptorVersion)}`);
    }
    if (descriptor.semanticChunkFormatVersion !== WORLD_CHUNK_FORMAT_VERSION || descriptor.hydrologyRegionFormatVersion !== HYDROLOGY_REGION_FORMAT_VERSION) {
      throw new TypeError("v2 world descriptor contains unsupported semantic or hydrology formats");
    }
    if (!Array.isArray(descriptor.biomeBasis) || descriptor.biomeBasis.length !== WORLD_BIOME_BASIS.length || descriptor.biomeBasis.some((value2, index2) => value2 !== WORLD_BIOME_BASIS[index2])) {
      throw new TypeError("v2 world descriptor biome basis does not match this build");
    }
    if (!catalogIdentityMatches(descriptor.substrateCatalog, WORLD_SUBSTRATE_CATALOG_IDENTITY) || !catalogIdentityMatches(descriptor.vegetationCatalog, WORLD_VEGETATION_CATALOG_IDENTITY)) {
      throw new TypeError("v2 world descriptor semantic catalog identity does not match this build");
    }
    const commonFields = [
      "descriptorVersion",
      "sourceKind",
      "semanticChunkFormatVersion",
      "hydrologyRegionFormatVersion",
      "biomeBasis",
      "substrateCatalog",
      "vegetationCatalog",
      "topology"
    ];
    const assertFields = (variantFields) => {
      const allowed = /* @__PURE__ */ new Set([...commonFields, ...variantFields]);
      if (Object.getOwnPropertyNames(descriptor).some((name) => !allowed.has(name))) {
        throw new TypeError("v2 world descriptor contains unknown or deprecated fields");
      }
    };
    if (descriptor.sourceKind === "procedural-infinite") {
      assertFields(["seed", "generatorVersion"]);
      assertSeed(descriptor.seed);
      if (typeof descriptor.seed !== "string" || descriptor.generatorVersion !== WORLD_GENERATOR_VERSION || descriptor.topology !== "infinite" || "width" in descriptor || "height" in descriptor) {
        throw new TypeError("v2 infinite world descriptor is invalid");
      }
      return;
    }
    if (descriptor.sourceKind === "procedural-toroidal") {
      assertFields(["seed", "generatorVersion", "width", "height"]);
      assertSeed(descriptor.seed);
      if (typeof descriptor.seed !== "string" || descriptor.generatorVersion !== WORLD_GENERATOR_VERSION || descriptor.topology !== "toroidal") {
        throw new TypeError("v2 toroidal world descriptor is invalid");
      }
      assertToroidalDimensions(descriptor.width, descriptor.height);
      return;
    }
    if (descriptor.sourceKind === "static") {
      assertFields(["sourceContentHash", "width", "height"]);
      if (typeof descriptor.sourceContentHash !== "string" || !/^[a-f0-9]{64}$/.test(descriptor.sourceContentHash) || descriptor.topology !== "bounded" && descriptor.topology !== "toroidal") {
        throw new TypeError("v2 static world descriptor is invalid");
      }
      if (descriptor.topology === "toroidal") {
        assertToroidalDimensions(descriptor.width, descriptor.height);
      } else {
        assertDimension("width", descriptor.width);
        assertDimension("height", descriptor.height);
      }
      return;
    }
    throw new TypeError("v2 world descriptor sourceKind is invalid");
  }
  function serializeWorldDescriptorV2(descriptor) {
    assertWorldDescriptorV2(descriptor);
    const common = [
      descriptor.descriptorVersion,
      descriptor.sourceKind,
      descriptor.semanticChunkFormatVersion,
      descriptor.hydrologyRegionFormatVersion,
      [...descriptor.biomeBasis],
      [descriptor.substrateCatalog.id, descriptor.substrateCatalog.contentHash],
      [descriptor.vegetationCatalog.id, descriptor.vegetationCatalog.contentHash],
      descriptor.topology
    ];
    if (descriptor.sourceKind === "procedural-infinite") {
      return JSON.stringify([...common, descriptor.seed, descriptor.generatorVersion, null, null]);
    }
    if (descriptor.sourceKind === "procedural-toroidal") {
      return JSON.stringify([
        ...common,
        descriptor.seed,
        descriptor.generatorVersion,
        descriptor.width,
        descriptor.height
      ]);
    }
    return JSON.stringify([
      ...common,
      descriptor.sourceContentHash,
      null,
      descriptor.width,
      descriptor.height
    ]);
  }
  function worldDescriptorsV2Equal(first, second) {
    return serializeWorldDescriptorV2(first) === serializeWorldDescriptorV2(second);
  }
  function canonicalizeSemanticChunkKey(descriptor, key2) {
    assertWorldDescriptorV2(descriptor);
    if (!Number.isSafeInteger(key2?.chunkX) || !Number.isSafeInteger(key2?.chunkY)) {
      throw new RangeError("semantic chunk key must use safe integer coordinates");
    }
    if (descriptor.topology !== "toroidal") {
      assertSemanticChunkKey(key2);
      return { chunkX: key2.chunkX, chunkY: key2.chunkY };
    }
    const chunksX = descriptor.width / WORLD_SEMANTIC_CHUNK_SIZE;
    const chunksY = descriptor.height / WORLD_SEMANTIC_CHUNK_SIZE;
    const canonical = {
      chunkX: positiveIntegerModulo(key2.chunkX, chunksX),
      chunkY: positiveIntegerModulo(key2.chunkY, chunksY)
    };
    assertSemanticChunkKey(canonical);
    return canonical;
  }
  function canonicalizeHydrologyRegionKey(descriptor, key2) {
    assertWorldDescriptorV2(descriptor);
    if (!Number.isSafeInteger(key2?.regionX) || !Number.isSafeInteger(key2?.regionY)) {
      throw new RangeError("hydrology region key must use safe integer coordinates");
    }
    if (descriptor.topology !== "toroidal") {
      assertHydrologyRegionKey(key2);
      return { regionX: key2.regionX, regionY: key2.regionY };
    }
    const regionsX = Math.ceil(descriptor.width / HYDROLOGY_REGION_SIZE);
    const regionsY = Math.ceil(descriptor.height / HYDROLOGY_REGION_SIZE);
    const canonical = {
      regionX: positiveIntegerModulo(key2.regionX, regionsX),
      regionY: positiveIntegerModulo(key2.regionY, regionsY)
    };
    assertHydrologyRegionKey(canonical);
    return canonical;
  }

  // src/world/semantic/SurfaceDependency.ts
  function assertNonNegativeRevision(name, value) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError(`${name} must be a non-negative safe integer`);
    }
  }
  function assertPositiveVersion(name, value) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new RangeError(`${name} must be a positive safe integer`);
    }
  }
  function assertRenderChunkKey(value) {
    if (!value || typeof value !== "object" || Object.getOwnPropertyNames(value).some((name) => name !== "chunkX" && name !== "chunkY") || !Number.isSafeInteger(value.chunkX) || !Number.isSafeInteger(value.chunkY)) {
      throw new TypeError("render chunk key must contain safe integer coordinates");
    }
    const originX = value.chunkX * SURFACE_RENDER_CHUNK_SIZE;
    const originY = value.chunkY * SURFACE_RENDER_CHUNK_SIZE;
    const endX = originX + SURFACE_RENDER_CHUNK_SIZE - 1;
    const endY = originY + SURFACE_RENDER_CHUNK_SIZE - 1;
    if (originX > Number.MAX_SAFE_INTEGER || endX < Number.MIN_SAFE_INTEGER || originY > Number.MAX_SAFE_INTEGER || endY < Number.MIN_SAFE_INTEGER) {
      throw new RangeError("render chunk key exceeds the safe integer tile range");
    }
  }
  function canonicalizeRenderChunkKey(descriptor, key2) {
    serializeWorldDescriptorV2(descriptor);
    assertRenderChunkKey(key2);
    if (descriptor.topology === "toroidal") {
      return Object.freeze({
        chunkX: positiveIntegerModulo(key2.chunkX, descriptor.width / SURFACE_RENDER_CHUNK_SIZE),
        chunkY: positiveIntegerModulo(key2.chunkY, descriptor.height / SURFACE_RENDER_CHUNK_SIZE)
      });
    }
    if (descriptor.topology === "bounded") {
      const originX = key2.chunkX * SURFACE_RENDER_CHUNK_SIZE;
      const originY = key2.chunkY * SURFACE_RENDER_CHUNK_SIZE;
      if (originX < 0 || originY < 0 || originX >= descriptor.width || originY >= descriptor.height) {
        throw new RangeError("render chunk key lies outside the bounded world");
      }
    }
    return Object.freeze({ chunkX: key2.chunkX, chunkY: key2.chunkY });
  }
  function assertCanonicalSemanticDependencies(values) {
    if (!Array.isArray(values)) throw new TypeError("surface semantic dependencies must be an array");
    for (let index2 = 0; index2 < values.length; index2 += 1) {
      const dependency = values[index2];
      if (!dependency || typeof dependency !== "object" || Object.getOwnPropertyNames(dependency).some((name) => name !== "key" && name !== "baseRevision" && name !== "deltaRevision")) {
        throw new TypeError("surface semantic dependency is invalid");
      }
      assertSemanticChunkKey(dependency.key);
      assertNonNegativeRevision("semantic base revision", dependency.baseRevision);
      assertNonNegativeRevision("semantic delta revision", dependency.deltaRevision);
      if (index2 > 0) {
        const previous = values[index2 - 1].key;
        if (previous.chunkX > dependency.key.chunkX || previous.chunkX === dependency.key.chunkX && previous.chunkY >= dependency.key.chunkY) {
          throw new TypeError("surface semantic dependencies must be strictly ordered");
        }
      }
    }
  }
  function assertCanonicalHydrologyDependencies(values) {
    if (!Array.isArray(values)) throw new TypeError("surface hydrology dependencies must be an array");
    for (let index2 = 0; index2 < values.length; index2 += 1) {
      const dependency = values[index2];
      if (!dependency || typeof dependency !== "object" || Object.getOwnPropertyNames(dependency).some((name) => name !== "key" && name !== "baseRevision" && name !== "features")) {
        throw new TypeError("surface hydrology dependency is invalid");
      }
      assertHydrologyRegionKey(dependency.key);
      assertNonNegativeRevision("hydrology base revision", dependency.baseRevision);
      if (!Array.isArray(dependency.features)) {
        throw new TypeError("surface hydrology feature dependencies must be an array");
      }
      for (let featureIndex = 0; featureIndex < dependency.features.length; featureIndex += 1) {
        const feature = dependency.features[featureIndex];
        if (!feature || typeof feature.featureId !== "string" || Object.getOwnPropertyNames(feature).some((name) => name !== "featureId" && name !== "revision")) {
          throw new TypeError("surface hydrology feature dependency is invalid");
        }
        assertPositiveVersion("hydrology feature revision", feature.revision);
        if (featureIndex > 0 && dependency.features[featureIndex - 1].featureId.localeCompare(feature.featureId) >= 0) {
          throw new TypeError("surface hydrology feature dependencies must be strictly ordered");
        }
      }
      if (index2 > 0) {
        const previous = values[index2 - 1].key;
        if (previous.regionX > dependency.key.regionX || previous.regionX === dependency.key.regionX && previous.regionY >= dependency.key.regionY) {
          throw new TypeError("surface hydrology dependencies must be strictly ordered");
        }
      }
    }
  }
  function assertSurfaceDependencyKey(value) {
    if (!value || typeof value !== "object") throw new TypeError("surface dependency key must be an object");
    const key2 = value;
    const allowedFields = /* @__PURE__ */ new Set([
      "worldIdentity",
      "renderKey",
      "compilerRevision",
      "compileProfileVersion",
      "semanticChunks",
      "hydrologyRegions"
    ]);
    if (Object.getOwnPropertyNames(key2).some((name) => !allowedFields.has(name)) || typeof key2.worldIdentity !== "string" || key2.worldIdentity.length === 0) {
      throw new TypeError("surface dependency key header is invalid");
    }
    assertRenderChunkKey(key2.renderKey);
    assertPositiveVersion("surface compiler revision", key2.compilerRevision);
    assertPositiveVersion("surface compile profile version", key2.compileProfileVersion);
    assertCanonicalSemanticDependencies(key2.semanticChunks);
    assertCanonicalHydrologyDependencies(key2.hydrologyRegions);
  }
  function createSurfaceDependencyBinding(snapshot, renderKey, options = {}) {
    if (!options || typeof options !== "object" || Object.getOwnPropertyNames(options).some((name) => name !== "compilerRevision" && name !== "compileProfileVersion" && name !== "hydrologyFeatureIds") || options.hydrologyFeatureIds !== void 0 && !(options.hydrologyFeatureIds instanceof Set)) {
      throw new TypeError("surface dependency binding options are invalid");
    }
    const canonicalRenderKey = canonicalizeRenderChunkKey(snapshot.descriptor, renderKey);
    const compilerRevision = options.compilerRevision ?? SURFACE_COMPILER_REVISION;
    const compileProfileVersion = options.compileProfileVersion ?? SURFACE_COMPILE_PROFILE_VERSION;
    assertPositiveVersion("surface compiler revision", compilerRevision);
    assertPositiveVersion("surface compile profile version", compileProfileVersion);
    if (snapshot.worldIdentity !== serializeWorldDescriptorV2(snapshot.descriptor)) {
      throw new TypeError("effective snapshot world identity is inconsistent with its descriptor");
    }
    const semanticChunks = Object.freeze(snapshot.semanticChunks.map((chunk) => Object.freeze({
      key: Object.freeze(canonicalizeSemanticChunkKey(snapshot.descriptor, chunk.base.key)),
      baseRevision: chunk.base.revision,
      deltaRevision: chunk.delta?.revision ?? 0
    })));
    const hydrologyRegions = Object.freeze(snapshot.hydrologyRegions.map((region) => Object.freeze({
      key: Object.freeze(canonicalizeHydrologyRegionKey(snapshot.descriptor, region.base.key)),
      baseRevision: region.base.revision,
      features: Object.freeze(region.featureDeltas.filter((feature) => !options.hydrologyFeatureIds || options.hydrologyFeatureIds.has(feature.featureId)).map((feature) => Object.freeze({
        featureId: feature.featureId,
        revision: feature.revision
      })))
    })));
    const dependencyKey2 = Object.freeze({
      worldIdentity: snapshot.worldIdentity,
      renderKey: canonicalRenderKey,
      compilerRevision,
      compileProfileVersion,
      semanticChunks,
      hydrologyRegions
    });
    assertSurfaceDependencyKey(dependencyKey2);
    return Object.freeze({
      effectiveRevision: snapshot.effectiveRevision,
      dependencyKey: dependencyKey2
    });
  }
  function surfaceDependencyKeysEqual(first, second) {
    assertSurfaceDependencyKey(first);
    assertSurfaceDependencyKey(second);
    if (first === second) return true;
    if (first.worldIdentity !== second.worldIdentity || first.renderKey.chunkX !== second.renderKey.chunkX || first.renderKey.chunkY !== second.renderKey.chunkY || first.compilerRevision !== second.compilerRevision || first.compileProfileVersion !== second.compileProfileVersion || first.semanticChunks.length !== second.semanticChunks.length || first.hydrologyRegions.length !== second.hydrologyRegions.length) return false;
    for (let index2 = 0; index2 < first.semanticChunks.length; index2 += 1) {
      const left = first.semanticChunks[index2];
      const right = second.semanticChunks[index2];
      if (left.key.chunkX !== right.key.chunkX || left.key.chunkY !== right.key.chunkY || left.baseRevision !== right.baseRevision || left.deltaRevision !== right.deltaRevision) return false;
    }
    for (let index2 = 0; index2 < first.hydrologyRegions.length; index2 += 1) {
      const left = first.hydrologyRegions[index2];
      const right = second.hydrologyRegions[index2];
      if (left.key.regionX !== right.key.regionX || left.key.regionY !== right.key.regionY || left.baseRevision !== right.baseRevision || left.features.length !== right.features.length) return false;
      for (let featureIndex = 0; featureIndex < left.features.length; featureIndex += 1) {
        if (left.features[featureIndex].featureId !== right.features[featureIndex].featureId || left.features[featureIndex].revision !== right.features[featureIndex].revision) return false;
      }
    }
    return true;
  }
  function serializeSurfaceDependencyKey(key2) {
    assertSurfaceDependencyKey(key2);
    return JSON.stringify([
      key2.worldIdentity,
      [key2.renderKey.chunkX, key2.renderKey.chunkY],
      key2.compilerRevision,
      key2.compileProfileVersion,
      key2.semanticChunks.map((dependency) => [
        dependency.key.chunkX,
        dependency.key.chunkY,
        dependency.baseRevision,
        dependency.deltaRevision
      ]),
      key2.hydrologyRegions.map((dependency) => [
        dependency.key.regionX,
        dependency.key.regionY,
        dependency.baseRevision,
        dependency.features.map((feature) => [feature.featureId, feature.revision])
      ])
    ]);
  }
  function cloneSurfaceDependencyKey(key2) {
    assertSurfaceDependencyKey(key2);
    return Object.freeze({
      worldIdentity: key2.worldIdentity,
      renderKey: Object.freeze({ ...key2.renderKey }),
      compilerRevision: key2.compilerRevision,
      compileProfileVersion: key2.compileProfileVersion,
      semanticChunks: Object.freeze(key2.semanticChunks.map((dependency) => Object.freeze({
        key: Object.freeze({ ...dependency.key }),
        baseRevision: dependency.baseRevision,
        deltaRevision: dependency.deltaRevision
      }))),
      hydrologyRegions: Object.freeze(key2.hydrologyRegions.map((dependency) => Object.freeze({
        key: Object.freeze({ ...dependency.key }),
        baseRevision: dependency.baseRevision,
        features: Object.freeze(dependency.features.map((feature) => Object.freeze({ ...feature })))
      })))
    });
  }
  function assertSurfaceRequestToken(value) {
    if (!value || typeof value !== "object") throw new TypeError("surface request token must be an object");
    const token = value;
    if (Object.getOwnPropertyNames(token).some((name) => name !== "sessionEpoch" && name !== "renderChunkGeneration")) {
      throw new TypeError("surface request token contains unknown fields");
    }
    assertPositiveVersion("surface request sessionEpoch", token.sessionEpoch);
    assertPositiveVersion("surface request renderChunkGeneration", token.renderChunkGeneration);
  }
  function renderKeyString(key2) {
    return `${key2.chunkX},${key2.chunkY}`;
  }
  var SurfaceRequestTracker = class {
    constructor(descriptor, sessionEpoch) {
      this.descriptor = descriptor;
      this.sessionEpoch = sessionEpoch;
      this.currentByRenderKey = /* @__PURE__ */ new Map();
      this.nextGeneration = 0;
      this.disposed = false;
      this.worldIdentity = serializeWorldDescriptorV2(descriptor);
      assertPositiveVersion("surface request sessionEpoch", sessionEpoch);
    }
    get activeRequestCount() {
      return this.currentByRenderKey.size;
    }
    issue(renderKey) {
      if (this.disposed) throw new Error("surface request tracker has been disposed");
      const canonical = canonicalizeRenderChunkKey(this.descriptor, renderKey);
      if (this.nextGeneration >= Number.MAX_SAFE_INTEGER) {
        throw new RangeError("surface request generation space is exhausted");
      }
      this.nextGeneration += 1;
      const token = Object.freeze({
        sessionEpoch: this.sessionEpoch,
        renderChunkGeneration: this.nextGeneration
      });
      this.currentByRenderKey.set(renderKeyString(canonical), token);
      return token;
    }
    issueRequest(snapshot, renderKey, options = {}) {
      if (snapshot.worldIdentity !== this.worldIdentity) {
        throw new TypeError("cannot issue a surface request for another world identity");
      }
      const binding = createSurfaceDependencyBinding(snapshot, renderKey, options);
      return Object.freeze({
        ...binding,
        requestToken: this.issue(renderKey)
      });
    }
    current(renderKey) {
      if (this.disposed) return void 0;
      const canonical = canonicalizeRenderChunkKey(this.descriptor, renderKey);
      return this.currentByRenderKey.get(renderKeyString(canonical));
    }
    isCurrent(renderKey, token) {
      assertSurfaceRequestToken(token);
      const current = this.current(renderKey);
      return current !== void 0 && current.sessionEpoch === token.sessionEpoch && current.renderChunkGeneration === token.renderChunkGeneration;
    }
    canAccept(renderKey, result, currentBinding) {
      assertSurfaceRequestToken(result.requestToken);
      assertNonNegativeRevision("surface result effective revision", result.effectiveRevision);
      assertNonNegativeRevision("current effective revision", currentBinding.effectiveRevision);
      assertSurfaceDependencyKey(result.dependencyKey);
      assertSurfaceDependencyKey(currentBinding.dependencyKey);
      const canonical = canonicalizeRenderChunkKey(this.descriptor, renderKey);
      if (result.dependencyKey.renderKey.chunkX !== canonical.chunkX || result.dependencyKey.renderKey.chunkY !== canonical.chunkY || currentBinding.dependencyKey.renderKey.chunkX !== canonical.chunkX || currentBinding.dependencyKey.renderKey.chunkY !== canonical.chunkY || result.dependencyKey.worldIdentity !== this.worldIdentity || currentBinding.dependencyKey.worldIdentity !== this.worldIdentity || result.effectiveRevision > currentBinding.effectiveRevision) return false;
      return this.isCurrent(canonical, result.requestToken) && surfaceDependencyKeysEqual(result.dependencyKey, currentBinding.dependencyKey);
    }
    release(renderKey, token) {
      if (!this.isCurrent(renderKey, token)) return false;
      const canonical = canonicalizeRenderChunkKey(this.descriptor, renderKey);
      return this.currentByRenderKey.delete(renderKeyString(canonical));
    }
    dispose() {
      this.disposed = true;
      this.currentByRenderKey.clear();
    }
  };

  // src/rendering/WorldRenderDemandPlanner.ts
  function assertRadius(name, value) {
    if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be finite and non-negative`);
  }
  function distanceToChunk(centerX, centerY, chunkX, chunkY) {
    const minX = chunkX * SURFACE_RENDER_CHUNK_SIZE - 0.5;
    const minY = chunkY * SURFACE_RENDER_CHUNK_SIZE - 0.5;
    const maxX = minX + SURFACE_RENDER_CHUNK_SIZE;
    const maxY = minY + SURFACE_RENDER_CHUNK_SIZE;
    const dx = centerX < minX ? minX - centerX : centerX > maxX ? centerX - maxX : 0;
    const dy = centerY < minY ? minY - centerY : centerY > maxY ? centerY - maxY : 0;
    return Math.hypot(dx, dy);
  }
  function planWorldRenderDemand(options) {
    if (!options || typeof options !== "object" || !options.descriptor || !Number.isFinite(options.centerX) || !Number.isFinite(options.centerY) || options.centerX < Number.MIN_SAFE_INTEGER || options.centerX > Number.MAX_SAFE_INTEGER || options.centerY < Number.MIN_SAFE_INTEGER || options.centerY > Number.MAX_SAFE_INTEGER) {
      throw new TypeError("world render demand plan options are invalid");
    }
    assertRadius("visibleRadiusTiles", options.visibleRadiusTiles);
    assertRadius("prefetchRadiusTiles", options.prefetchRadiusTiles);
    assertRadius("lod1DistanceTiles", options.lod1DistanceTiles);
    assertRadius("lod2DistanceTiles", options.lod2DistanceTiles);
    if (options.prefetchRadiusTiles < options.visibleRadiusTiles || options.lod2DistanceTiles < options.lod1DistanceTiles) {
      throw new RangeError("world render demand radii must be monotonically increasing");
    }
    const radius = options.prefetchRadiusTiles;
    const minChunkX = Math.floor((options.centerX - radius) / SURFACE_RENDER_CHUNK_SIZE);
    const minChunkY = Math.floor((options.centerY - radius) / SURFACE_RENDER_CHUNK_SIZE);
    const maxChunkX = Math.floor((options.centerX + radius) / SURFACE_RENDER_CHUNK_SIZE);
    const maxChunkY = Math.floor((options.centerY + radius) / SURFACE_RENDER_CHUNK_SIZE);
    const byCanonical = /* @__PURE__ */ new Map();
    for (let rawX = minChunkX; rawX <= maxChunkX; rawX += 1) {
      for (let rawY = minChunkY; rawY <= maxChunkY; rawY += 1) {
        const distance = distanceToChunk(options.centerX, options.centerY, rawX, rawY);
        if (distance > radius) continue;
        let key2;
        try {
          key2 = canonicalizeRenderChunkKey(options.descriptor, { chunkX: rawX, chunkY: rawY });
        } catch (reason) {
          if (options.descriptor.topology === "bounded" && reason instanceof RangeError) continue;
          throw reason;
        }
        const lane = distance <= options.visibleRadiusTiles ? "visible" : "prefetch";
        const lod = distance < options.lod1DistanceTiles ? 0 : distance < options.lod2DistanceTiles ? 1 : 2;
        const serialized = `${key2.chunkX},${key2.chunkY}`;
        const existing = byCanonical.get(serialized);
        if (existing && existing.distance <= distance) continue;
        byCanonical.set(serialized, Object.freeze({
          key: Object.freeze(key2),
          lod,
          lane,
          priority: distance,
          distance
        }));
      }
    }
    return Object.freeze([...byCanonical.values()].sort((first, second) => first.distance - second.distance || first.key.chunkX - second.key.chunkX || first.key.chunkY - second.key.chunkY).map(({ distance: _distance, ...demand }) => Object.freeze(demand)));
  }
  var LIGHTING_STATE_FIELDS = /* @__PURE__ */ new Set([
    "uniformRevision",
    "sunDirection",
    "sunRadiance",
    "skyDiffuseIrradiance",
    "groundDiffuseIrradiance",
    "specularEnvironment",
    "environmentRevision",
    "exposure"
  ]);
  function assertExactFields(value, allowed, name) {
    if (Object.getOwnPropertyNames(value).some((field2) => !allowed.has(field2))) {
      throw new TypeError(`${name} contains unknown fields`);
    }
  }
  function cloneVector(value, name, normalize = false) {
    if (!value || typeof value !== "object") throw new TypeError(`${name} is invalid`);
    assertExactFields(value, /* @__PURE__ */ new Set(["x", "y", "z"]), name);
    if (![value.x, value.y, value.z].every(Number.isFinite)) throw new RangeError(`${name} must be finite`);
    const length = Math.hypot(value.x, value.y, value.z);
    if (normalize && !(length > 0)) throw new RangeError(`${name} must be non-zero`);
    const scale = normalize ? 1 / length : 1;
    return Object.freeze({ x: value.x * scale, y: value.y * scale, z: value.z * scale });
  }
  function cloneLinearRgb(value, name) {
    if (!value || typeof value !== "object") throw new TypeError(`${name} is invalid`);
    assertExactFields(value, /* @__PURE__ */ new Set(["r", "g", "b"]), name);
    if (![value.r, value.g, value.b].every((channel) => Number.isFinite(channel) && channel >= 0)) {
      throw new RangeError(`${name} channels must be finite and non-negative`);
    }
    return Object.freeze({ r: value.r, g: value.g, b: value.b });
  }
  function cloneEnvironment(value) {
    if (!value || typeof value !== "object") throw new TypeError("lighting environment handle is invalid");
    assertExactFields(value, /* @__PURE__ */ new Set(["identity", "texture"]), "lighting environment handle");
    if (typeof value.identity !== "string" || value.identity.length === 0 || value.texture !== null && !(value.texture instanceof three.Texture)) {
      throw new TypeError("lighting environment handle is invalid");
    }
    return Object.freeze({ identity: value.identity, texture: value.texture });
  }
  function createLightingState(value) {
    if (!value || typeof value !== "object") throw new TypeError("lighting state is invalid");
    assertExactFields(value, LIGHTING_STATE_FIELDS, "lighting state");
    if (!Number.isSafeInteger(value.uniformRevision) || value.uniformRevision < 0 || !Number.isSafeInteger(value.environmentRevision) || value.environmentRevision < 0) {
      throw new RangeError("lighting revisions must be non-negative safe integers");
    }
    if (!Number.isFinite(value.exposure) || value.exposure <= 0) {
      throw new RangeError("lighting exposure must be finite and positive");
    }
    return Object.freeze({
      uniformRevision: value.uniformRevision,
      sunDirection: cloneVector(value.sunDirection, "lighting sunDirection", true),
      sunRadiance: cloneLinearRgb(value.sunRadiance, "lighting sunRadiance"),
      skyDiffuseIrradiance: cloneLinearRgb(
        value.skyDiffuseIrradiance,
        "lighting skyDiffuseIrradiance"
      ),
      groundDiffuseIrradiance: cloneLinearRgb(
        value.groundDiffuseIrradiance,
        "lighting groundDiffuseIrradiance"
      ),
      specularEnvironment: cloneEnvironment(value.specularEnvironment),
      environmentRevision: value.environmentRevision,
      exposure: value.exposure
    });
  }
  var DEFAULT_LIGHTING_STATE = createLightingState({
    uniformRevision: 0,
    sunDirection: { x: 0.45, y: 0.8, z: 0.4 },
    sunRadiance: { r: 1.9, g: 1.75, b: 1.5 },
    skyDiffuseIrradiance: { r: 0.32, g: 0.42, b: 0.55 },
    groundDiffuseIrradiance: { r: 0.08, g: 0.07, b: 0.055 },
    specularEnvironment: { identity: "analytic-sky-v1", texture: null },
    environmentRevision: 0,
    exposure: 0.65
  });
  function copyColor(target, source) {
    target.setRGB(source.r, source.g, source.b);
  }
  var LightingStateController = class {
    constructor(initial = DEFAULT_LIGHTING_STATE) {
      this.uniformBindings = /* @__PURE__ */ new Set();
      this.rendererBindings = /* @__PURE__ */ new Set();
      this.sceneBindings = /* @__PURE__ */ new Set();
      this.disposed = false;
      this.current = createLightingState(initial);
    }
    get state() {
      return this.current;
    }
    publish(nextValue, expectedUniformRevision) {
      this.assertReady();
      if (!Number.isSafeInteger(expectedUniformRevision) || expectedUniformRevision < 0) {
        throw new RangeError("expected lighting revision must be a non-negative safe integer");
      }
      if (this.current.uniformRevision !== expectedUniformRevision) {
        throw new RangeError("lighting state compare-and-swap revision conflict");
      }
      const next = createLightingState(nextValue);
      if (next.uniformRevision !== expectedUniformRevision + 1) {
        throw new RangeError("lighting uniformRevision must increase by exactly one");
      }
      if (next.environmentRevision < this.current.environmentRevision) {
        throw new RangeError("lighting environmentRevision cannot decrease");
      }
      if (next.environmentRevision === this.current.environmentRevision && (next.specularEnvironment.identity !== this.current.specularEnvironment.identity || next.specularEnvironment.texture !== this.current.specularEnvironment.texture)) {
        throw new TypeError("lighting environment changes require a new environmentRevision");
      }
      this.current = next;
      for (const binding of this.uniformBindings) this.updateUniformBinding(binding.publicBinding, next);
      for (const binding of this.rendererBindings) this.updateRenderer(binding.publicBinding.renderer, next);
      for (const binding of this.sceneBindings) this.updateSceneBinding(binding.publicBinding, next);
      return next;
    }
    bindUniforms() {
      this.assertReady();
      const sunDirection = new three.Uniform(new three.Vector3());
      const sunRadiance = new three.Uniform(new three.Color());
      const skyDiffuseIrradiance = new three.Uniform(new three.Color());
      const groundDiffuseIrradiance = new three.Uniform(new three.Color());
      const mutable = {};
      const publicBinding = {
        sunDirection,
        sunRadiance,
        skyDiffuseIrradiance,
        groundDiffuseIrradiance,
        get released() {
          return mutable.released;
        },
        release: () => {
          if (mutable.released) return false;
          mutable.released = true;
          this.uniformBindings.delete(mutable);
          return true;
        }
      };
      mutable.publicBinding = Object.freeze(publicBinding);
      mutable.released = false;
      this.updateUniformBinding(mutable.publicBinding, this.current);
      this.uniformBindings.add(mutable);
      return mutable.publicBinding;
    }
    bindRenderer(renderer) {
      this.assertReady();
      if (!renderer || typeof renderer !== "object") throw new TypeError("lighting renderer is invalid");
      const mutable = {};
      const publicBinding = {
        renderer,
        get released() {
          return mutable.released;
        },
        release: () => {
          if (mutable.released) return false;
          mutable.released = true;
          this.rendererBindings.delete(mutable);
          return true;
        }
      };
      mutable.publicBinding = Object.freeze(publicBinding);
      mutable.released = false;
      this.updateRenderer(renderer, this.current);
      this.rendererBindings.add(mutable);
      return mutable.publicBinding;
    }
    bindScene(scene) {
      this.assertReady();
      if (!(scene instanceof three.Scene)) throw new TypeError("lighting scene is invalid");
      if ([...this.sceneBindings].some((binding) => binding.publicBinding.scene === scene)) {
        throw new TypeError("lighting scene already has a shared environment binding");
      }
      const sunLight = new three.DirectionalLight(16777215, 1);
      sunLight.name = "surface-v2-sun";
      const hemisphereLight = new three.HemisphereLight(16777215, 16777215, 1);
      hemisphereLight.name = "surface-v2-environment-diffuse";
      const mutable = {};
      const publicBinding = {
        scene,
        sunLight,
        hemisphereLight,
        get released() {
          return mutable.released;
        },
        release: () => {
          if (mutable.released) return false;
          mutable.released = true;
          this.sceneBindings.delete(mutable);
          scene.remove(sunLight, hemisphereLight);
          if (scene.environment === this.current.specularEnvironment.texture) {
            scene.environment = mutable.previousEnvironment;
          }
          return true;
        }
      };
      mutable.publicBinding = Object.freeze(publicBinding);
      mutable.previousEnvironment = scene.environment;
      mutable.released = false;
      this.updateSceneBinding(mutable.publicBinding, this.current);
      scene.add(sunLight, hemisphereLight);
      this.sceneBindings.add(mutable);
      return mutable.publicBinding;
    }
    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      for (const binding of this.uniformBindings) binding.released = true;
      for (const binding of this.rendererBindings) binding.released = true;
      for (const binding of [...this.sceneBindings]) binding.publicBinding.release();
      this.uniformBindings.clear();
      this.rendererBindings.clear();
      this.sceneBindings.clear();
    }
    get stats() {
      return Object.freeze({
        state: this.disposed ? "disposed" : "ready",
        uniformRevision: this.current.uniformRevision,
        environmentRevision: this.current.environmentRevision,
        uniformBindings: this.uniformBindings.size,
        rendererBindings: this.rendererBindings.size,
        sceneBindings: this.sceneBindings.size
      });
    }
    updateUniformBinding(binding, state) {
      binding.sunDirection.value.set(
        state.sunDirection.x,
        state.sunDirection.y,
        state.sunDirection.z
      );
      copyColor(binding.sunRadiance.value, state.sunRadiance);
      copyColor(binding.skyDiffuseIrradiance.value, state.skyDiffuseIrradiance);
      copyColor(binding.groundDiffuseIrradiance.value, state.groundDiffuseIrradiance);
    }
    updateRenderer(renderer, state) {
      renderer.toneMapping = three.ACESFilmicToneMapping;
      renderer.toneMappingExposure = state.exposure;
      renderer.outputColorSpace = three.SRGBColorSpace;
    }
    updateSceneBinding(binding, state) {
      copyColor(binding.sunLight.color, state.sunRadiance);
      binding.sunLight.intensity = 1;
      binding.sunLight.position.set(
        state.sunDirection.x * 100,
        state.sunDirection.y * 100,
        state.sunDirection.z * 100
      );
      copyColor(binding.hemisphereLight.color, state.skyDiffuseIrradiance);
      copyColor(binding.hemisphereLight.groundColor, state.groundDiffuseIrradiance);
      binding.hemisphereLight.intensity = 1;
      binding.scene.environment = state.specularEnvironment.texture;
    }
    assertReady() {
      if (this.disposed) throw new TypeError("lighting state controller is disposed");
    }
  };

  // src/world/semantic/SparseSemanticDelta.ts
  var SemanticOverrideField = /* @__PURE__ */ ((SemanticOverrideField2) => {
    SemanticOverrideField2[SemanticOverrideField2["Substrate"] = 1] = "Substrate";
    SemanticOverrideField2[SemanticOverrideField2["MacroHeight"] = 2] = "MacroHeight";
    SemanticOverrideField2[SemanticOverrideField2["BiomeWeights"] = 4] = "BiomeWeights";
    SemanticOverrideField2[SemanticOverrideField2["VegetationDensity"] = 8] = "VegetationDensity";
    SemanticOverrideField2[SemanticOverrideField2["VegetationProfile"] = 16] = "VegetationProfile";
    return SemanticOverrideField2;
  })(SemanticOverrideField || {});
  function assertPositiveRevision(name, value) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new RangeError(`${name} must be a positive safe integer`);
    }
  }
  function assertUint8(name, value) {
    if (!Number.isInteger(value) || value < 0 || value > 255) {
      throw new RangeError(`${name} must be a Uint8 value`);
    }
  }
  function assertUint16(name, value) {
    if (!Number.isInteger(value) || value < 0 || value > 65535) {
      throw new RangeError(`${name} must be a Uint16 value`);
    }
  }
  function assertBiomeWeights(value) {
    if (!Array.isArray(value) || value.length !== 4) {
      throw new TypeError("semantic biomeWeights must contain exactly four values");
    }
    for (const weight of value) assertUint8("semantic biome weight", weight);
    if (value[0] + value[1] + value[2] + value[3] !== 255) {
      throw new RangeError("semantic biomeWeights must sum to 255");
    }
  }
  function assertTileOverride(value) {
    if (!value || typeof value !== "object") throw new TypeError("semantic tile override must be an object");
    const allowedFields = /* @__PURE__ */ new Set([
      "localX",
      "localY",
      "substrateClass",
      "macroHeight",
      "biomeWeights",
      "vegetationDensity",
      "vegetationProfile"
    ]);
    if (Object.getOwnPropertyNames(value).some((name) => !allowedFields.has(name))) {
      throw new TypeError("semantic tile override contains unknown fields");
    }
    const index2 = semanticChunkLocalIndex(value.localX, value.localY);
    let mask = 0;
    if (value.substrateClass !== void 0) {
      if (!Number.isInteger(value.substrateClass) || value.substrateClass < 0 || value.substrateClass >= WORLD_SUBSTRATE_CATALOG.length) {
        throw new RangeError("semantic substrate override is not in the frozen catalog");
      }
      mask |= 1 /* Substrate */;
    }
    if (value.macroHeight !== void 0) {
      assertUint16("semantic macroHeight override", value.macroHeight);
      mask |= 2 /* MacroHeight */;
    }
    if (value.biomeWeights !== void 0) {
      assertBiomeWeights(value.biomeWeights);
      mask |= 4 /* BiomeWeights */;
    }
    if (value.vegetationDensity !== void 0) {
      assertUint8("semantic vegetationDensity override", value.vegetationDensity);
      mask |= 8 /* VegetationDensity */;
    }
    if (value.vegetationProfile !== void 0) {
      if (!Number.isInteger(value.vegetationProfile) || value.vegetationProfile < 0 || value.vegetationProfile >= WORLD_VEGETATION_PROFILE_CATALOG.length) {
        throw new RangeError("semantic vegetationProfile override is not in the frozen catalog");
      }
      mask |= 16 /* VegetationProfile */;
    }
    if (mask === 0) throw new TypeError("semantic tile override must replace at least one authority field");
    return { index: index2, mask };
  }
  function createSparseSemanticDelta(options) {
    if (!options || typeof options !== "object") throw new TypeError("sparse semantic delta options are required");
    assertSemanticChunkKey(options.key);
    assertPositiveRevision("semantic delta revision", options.revision);
    if (!Array.isArray(options.overrides) || options.overrides.length === 0 || options.overrides.length > WORLD_SEMANTIC_CHUNK_TILE_COUNT) {
      throw new RangeError("sparse semantic delta must contain between 1 and 1024 tile overrides");
    }
    const sorted = options.overrides.map((override) => ({
      override,
      ...assertTileOverride(override)
    })).sort((first, second) => first.index - second.index);
    for (let index2 = 1; index2 < sorted.length; index2 += 1) {
      if (sorted[index2 - 1].index === sorted[index2].index) {
        throw new TypeError("sparse semantic delta contains duplicate tile coordinates");
      }
    }
    const count = sorted.length;
    const indices = new Uint16Array(count);
    const masks = new Uint8Array(count);
    const substrateClass = new Uint8Array(count);
    const macroHeight = new Uint16Array(count);
    const biomeWeights = new Uint8Array(count * 4);
    const vegetationDensity = new Uint8Array(count);
    const vegetationProfile = new Uint8Array(count);
    for (let offset = 0; offset < count; offset += 1) {
      const { override, index: index2, mask } = sorted[offset];
      indices[offset] = index2;
      masks[offset] = mask;
      if (mask & 1 /* Substrate */) substrateClass[offset] = override.substrateClass;
      if (mask & 2 /* MacroHeight */) macroHeight[offset] = override.macroHeight;
      if (mask & 4 /* BiomeWeights */) {
        biomeWeights.set(override.biomeWeights, offset * 4);
      }
      if (mask & 8 /* VegetationDensity */) {
        vegetationDensity[offset] = override.vegetationDensity;
      }
      if (mask & 16 /* VegetationProfile */) {
        vegetationProfile[offset] = override.vegetationProfile;
      }
    }
    const delta = Object.freeze({
      key: Object.freeze({ ...options.key }),
      revision: options.revision,
      indices,
      masks,
      substrateClass,
      macroHeight,
      biomeWeights,
      vegetationDensity,
      vegetationProfile
    });
    assertSparseSemanticDelta(delta);
    return delta;
  }
  function assertSparseSemanticDelta(value) {
    if (!value || typeof value !== "object") throw new TypeError("sparse semantic delta must be an object");
    const delta = value;
    const allowedFields = /* @__PURE__ */ new Set([
      "key",
      "revision",
      "indices",
      "masks",
      "substrateClass",
      "macroHeight",
      "biomeWeights",
      "vegetationDensity",
      "vegetationProfile"
    ]);
    if (Object.getOwnPropertyNames(delta).some((name) => !allowedFields.has(name))) {
      throw new TypeError("sparse semantic delta contains unknown fields");
    }
    assertSemanticChunkKey(delta.key);
    assertPositiveRevision("semantic delta revision", delta.revision);
    if (!(delta.indices instanceof Uint16Array) || delta.indices.length === 0 || delta.indices.length > WORLD_SEMANTIC_CHUNK_TILE_COUNT) {
      throw new TypeError("semantic delta indices must be a non-empty Uint16Array");
    }
    const count = delta.indices.length;
    if (!(delta.masks instanceof Uint8Array) || delta.masks.length !== count || !(delta.substrateClass instanceof Uint8Array) || delta.substrateClass.length !== count || !(delta.macroHeight instanceof Uint16Array) || delta.macroHeight.length !== count || !(delta.biomeWeights instanceof Uint8Array) || delta.biomeWeights.length !== count * 4 || !(delta.vegetationDensity instanceof Uint8Array) || delta.vegetationDensity.length !== count || !(delta.vegetationProfile instanceof Uint8Array) || delta.vegetationProfile.length !== count) {
      throw new TypeError("semantic delta column lengths are inconsistent");
    }
    for (let offset = 0; offset < count; offset += 1) {
      const index2 = delta.indices[offset];
      const mask = delta.masks[offset];
      if (index2 >= WORLD_SEMANTIC_CHUNK_TILE_COUNT || offset > 0 && index2 <= delta.indices[offset - 1] || mask === 0 || (mask & -32) !== 0) {
        throw new TypeError("semantic delta indices or masks are not canonical");
      }
      if (mask & 1 /* Substrate */) {
        if (delta.substrateClass[offset] >= WORLD_SUBSTRATE_CATALOG.length) {
          throw new RangeError("semantic delta substrate class is not in the frozen catalog");
        }
      } else if (delta.substrateClass[offset] !== 0) {
        throw new TypeError("unused semantic substrate columns must be zero");
      }
      if (!(mask & 2 /* MacroHeight */) && delta.macroHeight[offset] !== 0) {
        throw new TypeError("unused semantic height columns must be zero");
      }
      const biomeOffset = offset * 4;
      if (mask & 4 /* BiomeWeights */) {
        assertBiomeWeights(Array.from(delta.biomeWeights.subarray(biomeOffset, biomeOffset + 4)));
      } else if (delta.biomeWeights[biomeOffset] !== 0 || delta.biomeWeights[biomeOffset + 1] !== 0 || delta.biomeWeights[biomeOffset + 2] !== 0 || delta.biomeWeights[biomeOffset + 3] !== 0) {
        throw new TypeError("unused semantic biome columns must be zero");
      }
      if (!(mask & 8 /* VegetationDensity */) && delta.vegetationDensity[offset] !== 0) {
        throw new TypeError("unused semantic vegetation density columns must be zero");
      }
      if (mask & 16 /* VegetationProfile */) {
        if (delta.vegetationProfile[offset] >= WORLD_VEGETATION_PROFILE_CATALOG.length) {
          throw new RangeError("semantic delta vegetation profile is not in the frozen catalog");
        }
      } else if (delta.vegetationProfile[offset] !== 0) {
        throw new TypeError("unused semantic vegetation profile columns must be zero");
      }
    }
  }
  function cloneSparseSemanticDelta(delta) {
    assertSparseSemanticDelta(delta);
    const clone = Object.freeze({
      key: Object.freeze({ ...delta.key }),
      revision: delta.revision,
      indices: delta.indices.slice(),
      masks: delta.masks.slice(),
      substrateClass: delta.substrateClass.slice(),
      macroHeight: delta.macroHeight.slice(),
      biomeWeights: delta.biomeWeights.slice(),
      vegetationDensity: delta.vegetationDensity.slice(),
      vegetationProfile: delta.vegetationProfile.slice()
    });
    assertSparseSemanticDelta(clone);
    return clone;
  }
  function sparseSemanticDeltaOverrideOffset(delta, tileIndex) {
    if (!(delta?.indices instanceof Uint16Array)) {
      throw new TypeError("semantic delta lookup requires canonical Uint16 indices");
    }
    if (!Number.isInteger(tileIndex) || tileIndex < 0 || tileIndex >= WORLD_SEMANTIC_CHUNK_TILE_COUNT) {
      throw new RangeError("semantic delta lookup index is outside the chunk");
    }
    let low = 0;
    let high = delta.indices.length - 1;
    while (low <= high) {
      const middle = low + high >>> 1;
      const candidate = delta.indices[middle];
      if (candidate === tileIndex) return middle;
      if (candidate < tileIndex) low = middle + 1;
      else high = middle - 1;
    }
    return -1;
  }
  function sparseSemanticDeltaByteLength(delta) {
    assertSparseSemanticDelta(delta);
    return delta.indices.byteLength + delta.masks.byteLength + delta.substrateClass.byteLength + delta.macroHeight.byteLength + delta.biomeWeights.byteLength + delta.vegetationDensity.byteLength + delta.vegetationProfile.byteLength;
  }

  // src/world/noise.ts
  var UINT32_MAX = 4294967295;
  function seedToUint32(seed) {
    const text = String(seed);
    let hash = 2166136261;
    for (let index2 = 0; index2 < text.length; index2 += 1) {
      hash ^= text.charCodeAt(index2);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }
  function randomGridValue(seed, x, y) {
    let hash = seed ^ Math.imul(x, 521288629) ^ Math.imul(y, 1597334677);
    hash = Math.imul(hash ^ hash >>> 15, 739982445);
    hash = Math.imul(hash ^ hash >>> 12, 695872825);
    return ((hash ^ hash >>> 15) >>> 0) / UINT32_MAX;
  }
  var smooth = (value) => value * value * (3 - 2 * value);
  var lerp = (from, to, amount) => from + (to - from) * amount;
  function positiveModulo(value, modulus) {
    return (value % modulus + modulus) % modulus;
  }
  function valueNoise2D(seed, x, y) {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const tx = smooth(x - x0);
    const ty = smooth(y - y0);
    const top = lerp(randomGridValue(seed, x0, y0), randomGridValue(seed, x0 + 1, y0), tx);
    const bottom = lerp(randomGridValue(seed, x0, y0 + 1), randomGridValue(seed, x0 + 1, y0 + 1), tx);
    return lerp(top, bottom, ty);
  }
  function fractalNoise2D(seed, x, y, octaves) {
    let amplitude = 1;
    let frequency = 1;
    let total = 0;
    let normalization = 0;
    for (let octave = 0; octave < octaves; octave += 1) {
      total += valueNoise2D(seed + Math.imul(octave, 2654435769) >>> 0, x * frequency, y * frequency) * amplitude;
      normalization += amplitude;
      amplitude *= 0.5;
      frequency *= 2;
    }
    return total / normalization;
  }
  function periodicValueNoise2D(seed, x, y, periodX, periodY) {
    const px = Math.max(1, Math.round(periodX));
    const py = Math.max(1, Math.round(periodY));
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const tx = smooth(x - x0);
    const ty = smooth(y - y0);
    const sample = (gx, gy) => randomGridValue(
      seed,
      positiveModulo(gx, px),
      positiveModulo(gy, py)
    );
    const top = lerp(sample(x0, y0), sample(x0 + 1, y0), tx);
    const bottom = lerp(sample(x0, y0 + 1), sample(x0 + 1, y0 + 1), tx);
    return lerp(top, bottom, ty);
  }
  function periodicFractalNoise2D(seed, normalizedX, normalizedY, cellsX, cellsY, octaves) {
    const baseCellsX = Math.max(1, Math.round(cellsX));
    const baseCellsY = Math.max(1, Math.round(cellsY));
    let amplitude = 1;
    let frequency = 1;
    let total = 0;
    let normalization = 0;
    for (let octave = 0; octave < octaves; octave += 1) {
      const periodX = baseCellsX * frequency;
      const periodY = baseCellsY * frequency;
      total += periodicValueNoise2D(
        seed + Math.imul(octave, 2654435769) >>> 0,
        normalizedX * periodX,
        normalizedY * periodY,
        periodX,
        periodY
      ) * amplitude;
      normalization += amplitude;
      amplitude *= 0.5;
      frequency *= 2;
    }
    return total / normalization;
  }

  // src/world/WorldStyleProfile.ts
  var field = (salt, openScale, toroidalScale, octaves, minimumToroidalCells) => Object.freeze({
    salt,
    openScale,
    toroidalScale,
    octaves,
    minimumToroidalCells
  });
  var WORLD_STYLE_PROFILE = Object.freeze({
    generatorVersion: WORLD_GENERATOR_VERSION,
    fields: Object.freeze({
      warpX: field(1374496523, 0.018, 0.022, 3, 2),
      warpY: field(1757159915, 0.018, 0.022, 3, 2),
      continent: field(0, 0.052, 0.052, 5, 2),
      detail: field(2738958700, 0.145, 0.145, 3, 3),
      ridge: field(2654435769, 0.032, 0.032, 4, 2),
      valley: field(2135587861, 0.024, 0.024, 3, 2),
      roughness: field(2496678331, 0.31, 0.31, 3, 4),
      moisture: field(3355524772, 0.08, 0.08, 4, 2),
      temperature: field(2911926141, 0.035, 0.035, 3, 2),
      forestPatch: field(1291169091, 0.026, 0.026, 3, 2),
      lakePatch: field(374761393, 0.021, 0.021, 3, 2),
      openWarpAmplitude: 15,
      toroidalWarpAmplitude: 0.12,
      continentWeight: 0.72,
      detailWeight: 0.16,
      landMaskStart: 0.38,
      landMaskEnd: 0.68,
      ridgeExponent: 2.35,
      ridgeWeight: 0.27,
      valleyMaskStart: 0.34,
      valleyMaskEnd: 0.7,
      valleyExponent: 3.1,
      valleyWeight: 0.075,
      elevationBias: 0.01,
      moistureNoiseWeight: 0.86,
      moistureValleyWeight: 0.18,
      moistureRidgeWeight: 0.08,
      temperatureNoiseMinimum: 0.18,
      temperatureNoiseWeight: 0.74,
      temperatureLatitudeWeight: 0.82,
      temperatureElevationStart: 0.55,
      temperatureElevationWeight: 0.8,
      temperatureLatitudeNoiseWeight: 0.18,
      boundedEdgePower: 3,
      boundedEdgeFalloff: 0.58
    }),
    terrain: Object.freeze({
      seaLevel: 0.43,
      mountainElevation: 0.7,
      mountainRidge: 0.2,
      mountainPeakElevation: 0.82,
      snowTemperature: 0.18,
      tundraTemperature: 0.34,
      sandTemperature: 0.68,
      sandMoisture: 0.42,
      hillElevation: 0.57,
      climateTransition: 0.08
    }),
    relief: Object.freeze({
      shoreline: 0,
      staticMountain: 1,
      staticHill: 0.22,
      plainMinimum: 0.018,
      plainMaximum: 0.11,
      plainElevationScale: 0.1,
      plainRoughnessScale: 0.025,
      valleyDepth: 0.035,
      hillElevationStart: 0.55,
      hillElevationEnd: 0.72,
      hillScale: 0.22,
      hillMinimum: 0.13,
      hillMaximum: 0.38,
      mountainElevationStart: 0.66,
      mountainElevationSpan: 0.25,
      mountainMinimum: 0.36,
      mountainPower: 1.35,
      mountainScale: 0.78,
      mountainRidgeScale: 0.22,
      mountainMaximum: 1.25
    }),
    vegetation: Object.freeze({
      moistureStart: 0.36,
      moistureFull: 0.7,
      temperatureMinimum: 0.18,
      temperatureMaximum: 0.9,
      temperatureTransition: 0.12,
      densityScale: 1,
      maximumDensity: 0.72,
      neutralDensity: 0.45,
      patchStart: 0.38,
      patchFull: 0.72,
      patchMinimum: 0.22,
      ridgePenalty: 0.72,
      roughnessPenalty: 0.18,
      placementThreshold: 0.24,
      placementJitter: 0.08,
      placementSalt: 668265263,
      palmTemperature: 0.67,
      piniaTemperature: 0.4
    }),
    lakes: Object.freeze({
      minimumElevation: 0.455,
      maximumElevation: 0.63,
      minimumMoisture: 0.56,
      fullMoisture: 0.8,
      valleyStart: 0.03,
      valleyFull: 0.35,
      patchStart: 0.4,
      patchFull: 0.72,
      minimumPotential: 0.18,
      minimumNeighbors: 1,
      placementScale: 0.65,
      placementSalt: 1821285621
    })
  });
  var finite = (name, value) => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new TypeError(`${name} must be a finite number`);
    }
    return value;
  };
  var positive = (name, value) => {
    const number = finite(name, value);
    if (number <= 0) throw new RangeError(`${name} must be positive`);
    return number;
  };
  var nonNegative = (name, value) => {
    const number = finite(name, value);
    if (number < 0) throw new RangeError(`${name} must be non-negative`);
    return number;
  };
  var unitInterval = (name, value) => {
    const number = finite(name, value);
    if (number < 0 || number > 1) throw new RangeError(`${name} must be between 0 and 1`);
    return number;
  };
  function assertFiniteNumbers(value, path) {
    for (const [name, candidate] of Object.entries(value)) {
      const key2 = path ? `${path}.${name}` : name;
      if (typeof candidate === "number") finite(key2, candidate);
      else if (candidate && typeof candidate === "object") assertFiniteNumbers(candidate, key2);
    }
  }
  function assertWorldStyleProfile(value) {
    if (!value || typeof value !== "object") throw new TypeError("world style profile must be an object");
    const profile = value;
    if (profile.generatorVersion !== WORLD_GENERATOR_VERSION) {
      throw new RangeError("world style profile generatorVersion is unsupported");
    }
    if (!profile.fields || !profile.terrain || !profile.relief || !profile.vegetation || !profile.lakes) {
      throw new TypeError("world style profile groups are required");
    }
    assertFiniteNumbers(profile, "");
    const noiseFieldNames = [
      "warpX",
      "warpY",
      "continent",
      "detail",
      "ridge",
      "valley",
      "roughness",
      "moisture",
      "temperature",
      "forestPatch",
      "lakePatch"
    ];
    for (const name of noiseFieldNames) {
      const candidate = profile.fields[name];
      if (!candidate || typeof candidate !== "object") {
        throw new TypeError(`fields.${name} must be a noise field profile`);
      }
      const noise = candidate;
      positive(`fields.${name}.openScale`, noise.openScale);
      positive(`fields.${name}.toroidalScale`, noise.toroidalScale);
      if (!Number.isInteger(noise.octaves) || noise.octaves <= 0) {
        throw new RangeError(`fields.${name}.octaves must be a positive integer`);
      }
      if (!Number.isInteger(noise.minimumToroidalCells) || noise.minimumToroidalCells <= 0) {
        throw new RangeError(`fields.${name}.minimumToroidalCells must be a positive integer`);
      }
      if (!Number.isSafeInteger(noise.salt)) throw new RangeError(`fields.${name}.salt must be a safe integer`);
    }
    const nonNegativeFieldNames = [
      "openWarpAmplitude",
      "toroidalWarpAmplitude",
      "continentWeight",
      "detailWeight",
      "ridgeWeight",
      "valleyWeight",
      "moistureNoiseWeight",
      "moistureValleyWeight",
      "moistureRidgeWeight",
      "temperatureNoiseMinimum",
      "temperatureNoiseWeight",
      "temperatureLatitudeWeight",
      "temperatureElevationStart",
      "temperatureElevationWeight",
      "temperatureLatitudeNoiseWeight",
      "boundedEdgeFalloff"
    ];
    for (const name of nonNegativeFieldNames) nonNegative(`fields.${name}`, profile.fields[name]);
    finite("fields.elevationBias", profile.fields.elevationBias);
    unitInterval("fields.landMaskStart", profile.fields.landMaskStart);
    unitInterval("fields.landMaskEnd", profile.fields.landMaskEnd);
    unitInterval("fields.valleyMaskStart", profile.fields.valleyMaskStart);
    unitInterval("fields.valleyMaskEnd", profile.fields.valleyMaskEnd);
    if (!(profile.fields.landMaskStart < profile.fields.landMaskEnd) || !(profile.fields.valleyMaskStart < profile.fields.valleyMaskEnd)) {
      throw new RangeError("world style field mask thresholds must be ordered");
    }
    positive("fields.ridgeExponent", profile.fields.ridgeExponent);
    positive("fields.valleyExponent", profile.fields.valleyExponent);
    positive("fields.boundedEdgePower", profile.fields.boundedEdgePower);
    const terrain = profile.terrain;
    const terrainNames = [
      "seaLevel",
      "mountainElevation",
      "mountainRidge",
      "mountainPeakElevation",
      "snowTemperature",
      "tundraTemperature",
      "sandTemperature",
      "sandMoisture",
      "hillElevation",
      "climateTransition"
    ];
    for (const name of terrainNames) unitInterval(`terrain.${name}`, terrain[name]);
    positive("terrain.climateTransition", terrain.climateTransition);
    if (!(finite("terrain.mountainElevation", terrain.mountainElevation) < finite("terrain.mountainPeakElevation", terrain.mountainPeakElevation))) {
      throw new RangeError("terrain mountain thresholds must be ordered");
    }
    if (!(finite("terrain.snowTemperature", terrain.snowTemperature) < finite("terrain.tundraTemperature", terrain.tundraTemperature))) {
      throw new RangeError("terrain temperature thresholds must be ordered");
    }
    const relief = profile.relief;
    for (const [name, candidate] of Object.entries(relief)) {
      if (finite(`relief.${name}`, candidate) < 0) {
        throw new RangeError("relief heights and scales must be non-negative");
      }
    }
    positive("relief.mountainElevationSpan", relief.mountainElevationSpan);
    positive("relief.mountainPower", relief.mountainPower);
    positive("relief.mountainScale", relief.mountainScale);
    unitInterval("relief.mountainElevationStart", relief.mountainElevationStart);
    unitInterval("relief.hillElevationStart", relief.hillElevationStart);
    unitInterval("relief.hillElevationEnd", relief.hillElevationEnd);
    if (!(relief.hillElevationStart < relief.hillElevationEnd) || !(relief.plainMinimum <= relief.plainMaximum) || !(relief.hillMinimum <= relief.hillMaximum) || !(relief.plainMaximum < relief.hillMinimum)) {
      throw new RangeError("relief plain and hill ranges must be ordered");
    }
    if (finite("relief.mountainMinimum", relief.mountainMinimum) > finite("relief.mountainMaximum", relief.mountainMaximum)) {
      throw new RangeError("relief mountain range must be ordered");
    }
    if (relief.staticHill < relief.hillMinimum || relief.staticHill > relief.hillMaximum || relief.staticMountain < relief.mountainMinimum || relief.staticMountain > relief.mountainMaximum) {
      throw new RangeError("static relief heights must stay inside their terrain ranges");
    }
    const lakes = profile.lakes;
    unitInterval("lakes.minimumElevation", lakes.minimumElevation);
    unitInterval("lakes.maximumElevation", lakes.maximumElevation);
    unitInterval("lakes.minimumMoisture", lakes.minimumMoisture);
    unitInterval("lakes.fullMoisture", lakes.fullMoisture);
    unitInterval("lakes.valleyStart", lakes.valleyStart);
    unitInterval("lakes.valleyFull", lakes.valleyFull);
    unitInterval("lakes.patchStart", lakes.patchStart);
    unitInterval("lakes.patchFull", lakes.patchFull);
    unitInterval("lakes.minimumPotential", lakes.minimumPotential);
    unitInterval("lakes.placementScale", lakes.placementScale);
    if (!Number.isInteger(lakes.minimumNeighbors) || lakes.minimumNeighbors < 1 || lakes.minimumNeighbors > 6) {
      throw new RangeError("lakes.minimumNeighbors must be an integer between 1 and 6");
    }
    if (!(finite("lakes.minimumElevation", lakes.minimumElevation) < finite("lakes.maximumElevation", lakes.maximumElevation)) || !(lakes.minimumMoisture < lakes.fullMoisture) || !(lakes.valleyStart < lakes.valleyFull) || !(lakes.patchStart < lakes.patchFull)) {
      throw new RangeError("lake thresholds must be ordered");
    }
    unitInterval("vegetation.moistureStart", profile.vegetation.moistureStart);
    unitInterval("vegetation.moistureFull", profile.vegetation.moistureFull);
    unitInterval("vegetation.maximumDensity", profile.vegetation.maximumDensity);
    unitInterval("vegetation.neutralDensity", profile.vegetation.neutralDensity);
    unitInterval("vegetation.temperatureMinimum", profile.vegetation.temperatureMinimum);
    unitInterval("vegetation.temperatureMaximum", profile.vegetation.temperatureMaximum);
    unitInterval("vegetation.temperatureTransition", profile.vegetation.temperatureTransition);
    positive("vegetation.temperatureTransition", profile.vegetation.temperatureTransition);
    unitInterval("vegetation.patchStart", profile.vegetation.patchStart);
    unitInterval("vegetation.patchFull", profile.vegetation.patchFull);
    unitInterval("vegetation.patchMinimum", profile.vegetation.patchMinimum);
    unitInterval("vegetation.ridgePenalty", profile.vegetation.ridgePenalty);
    unitInterval("vegetation.roughnessPenalty", profile.vegetation.roughnessPenalty);
    unitInterval("vegetation.placementThreshold", profile.vegetation.placementThreshold);
    unitInterval("vegetation.placementJitter", profile.vegetation.placementJitter);
    unitInterval("vegetation.palmTemperature", profile.vegetation.palmTemperature);
    unitInterval("vegetation.piniaTemperature", profile.vegetation.piniaTemperature);
    positive("vegetation.densityScale", profile.vegetation.densityScale);
    if (!(profile.vegetation.moistureStart < profile.vegetation.moistureFull) || !(profile.vegetation.temperatureMinimum < profile.vegetation.temperatureMaximum) || !(profile.vegetation.patchStart < profile.vegetation.patchFull)) {
      throw new RangeError("vegetation suitability thresholds must be ordered");
    }
    if (profile.vegetation.neutralDensity > profile.vegetation.maximumDensity) {
      throw new RangeError("vegetation neutral density must not exceed maximum density");
    }
    if (profile.vegetation.placementThreshold <= profile.vegetation.placementJitter * 0.5 || profile.vegetation.placementThreshold > profile.vegetation.maximumDensity + profile.vegetation.placementJitter * 0.5) {
      throw new RangeError("vegetation placement threshold must reject zero density and intersect the density range");
    }
    if (!(profile.vegetation.piniaTemperature < profile.vegetation.palmTemperature)) {
      throw new RangeError("vegetation temperature thresholds must be ordered");
    }
    if (!Number.isSafeInteger(profile.vegetation.placementSalt) || !Number.isSafeInteger(profile.lakes.placementSalt)) {
      throw new RangeError("world style placement salts must be safe integers");
    }
  }
  assertWorldStyleProfile(WORLD_STYLE_PROFILE);

  // src/world/LandformSampler.ts
  var LANDFORM_SEA_LEVEL = WORLD_STYLE_PROFILE.terrain.seaLevel;
  var clamp01 = (value) => Math.max(0, Math.min(1, value));
  var smoothstep = (edge0, edge1, value) => {
    const t = clamp01((value - edge0) / (edge1 - edge0));
    return t * t * (3 - 2 * t);
  };
  function assertDimension2(name, value) {
    if (!Number.isInteger(value) || value < 2) {
      throw new RangeError(`landform ${name} must be an integer >= 2`);
    }
  }
  function resolveDomain(domain) {
    const resolved = domain ?? { topology: "infinite" };
    if (resolved.topology !== "infinite") {
      assertDimension2("width", resolved.width);
      assertDimension2("height", resolved.height);
    }
    return { ...resolved };
  }
  function composeSample(continent, detail, ridgeNoise, valleyNoise, roughness, moistureNoise, temperatureNoise, forestPatch, lakePatch, latitude, edgeFalloff, profile) {
    const fields = profile.fields;
    const landMask = smoothstep(fields.landMaskStart, fields.landMaskEnd, continent);
    const ridge = Math.pow(1 - Math.abs(ridgeNoise * 2 - 1), fields.ridgeExponent) * landMask;
    const valley = Math.pow(1 - Math.abs(valleyNoise * 2 - 1), fields.valleyExponent) * smoothstep(fields.valleyMaskStart, fields.valleyMaskEnd, continent);
    const elevation = continent * fields.continentWeight + detail * fields.detailWeight + ridge * fields.ridgeWeight - valley * fields.valleyWeight + fields.elevationBias - edgeFalloff;
    const moisture = clamp01(moistureNoise * fields.moistureNoiseWeight + valley * fields.moistureValleyWeight - ridge * fields.moistureRidgeWeight);
    const temperature = clamp01(latitude === void 0 ? fields.temperatureNoiseMinimum + temperatureNoise * fields.temperatureNoiseWeight - Math.max(0, elevation - fields.temperatureElevationStart) * fields.temperatureElevationWeight : 1 - latitude * fields.temperatureLatitudeWeight - Math.max(0, elevation - fields.temperatureElevationStart) * fields.temperatureElevationWeight + (temperatureNoise - 0.5) * fields.temperatureLatitudeNoiseWeight);
    return {
      elevation,
      continentalness: continent,
      ridge,
      valley,
      roughness: clamp01(roughness),
      moisture,
      temperature,
      forestPatch: clamp01(forestPatch),
      lakePatch: clamp01(lakePatch)
    };
  }
  function sampleOpenLandform(seed, x, y, domain, profile) {
    const fields = profile.fields;
    const open = (field2, sampleX, sampleY) => fractalNoise2D(seed ^ field2.salt, sampleX * field2.openScale, sampleY * field2.openScale, field2.octaves);
    const warpX = (open(fields.warpX, x, y) - 0.5) * fields.openWarpAmplitude;
    const warpY = (open(fields.warpY, x, y) - 0.5) * fields.openWarpAmplitude;
    const wx = x + warpX;
    const wy = y + warpY;
    const continent = open(fields.continent, wx, wy);
    const detail = open(fields.detail, wx, wy);
    const ridgeNoise = open(fields.ridge, wx, wy);
    const valleyNoise = open(fields.valley, wx, wy);
    const rough = open(fields.roughness, wx, wy);
    const moisture = open(fields.moisture, wx, wy);
    const temperature = open(fields.temperature, wx, wy);
    const forestPatch = open(fields.forestPatch, wx, wy);
    const lakePatch = open(fields.lakePatch, wx, wy);
    if (domain.topology === "infinite") {
      return composeSample(
        continent,
        detail,
        ridgeNoise,
        valleyNoise,
        rough,
        moisture,
        temperature,
        forestPatch,
        lakePatch,
        void 0,
        0,
        profile
      );
    }
    const nx = x / (domain.width - 1) * 2 - 1;
    const ny = y / (domain.height - 1) * 2 - 1;
    const edge = Math.max(Math.abs(nx), Math.abs(ny));
    return composeSample(
      continent,
      detail,
      ridgeNoise,
      valleyNoise,
      rough,
      moisture,
      temperature,
      forestPatch,
      lakePatch,
      Math.abs(ny),
      Math.pow(edge, fields.boundedEdgePower) * fields.boundedEdgeFalloff,
      profile
    );
  }
  function sampleToroidalLandform(seed, x, y, domain, profile) {
    const fields = profile.fields;
    const nx = x / domain.width;
    const ny = y / domain.height;
    const periodic = (field2, u, v) => periodicFractalNoise2D(
      seed ^ field2.salt,
      u,
      v,
      Math.max(field2.minimumToroidalCells, Math.round(domain.width * field2.toroidalScale)),
      Math.max(field2.minimumToroidalCells, Math.round(domain.height * field2.toroidalScale)),
      field2.octaves
    );
    const warpX = (periodic(fields.warpX, nx, ny) - 0.5) * fields.toroidalWarpAmplitude;
    const warpY = (periodic(fields.warpY, nx, ny) - 0.5) * fields.toroidalWarpAmplitude;
    const wx = nx + warpX;
    const wy = ny + warpY;
    const continent = periodic(fields.continent, wx, wy);
    const detail = periodic(fields.detail, wx, wy);
    const ridgeNoise = periodic(fields.ridge, wx, wy);
    const valleyNoise = periodic(fields.valley, wx, wy);
    const rough = periodic(fields.roughness, wx, wy);
    const moisture = periodic(fields.moisture, wx, wy);
    const temperature = periodic(fields.temperature, wx, wy);
    const forestPatch = periodic(fields.forestPatch, wx, wy);
    const lakePatch = periodic(fields.lakePatch, wx, wy);
    const latitude = 0.5 + 0.5 * Math.cos(ny * Math.PI * 2);
    return composeSample(
      continent,
      detail,
      ridgeNoise,
      valleyNoise,
      rough,
      moisture,
      temperature,
      forestPatch,
      lakePatch,
      latitude,
      0,
      profile
    );
  }
  function createLandformSamplerForProfile(options, profile) {
    if (!options || typeof options !== "object") throw new TypeError("landform sampler options are required");
    if (typeof options.seed !== "string" && typeof options.seed !== "number") {
      throw new TypeError("landform seed must be a string or number");
    }
    if (typeof options.seed === "number" && !Number.isFinite(options.seed)) {
      throw new RangeError("numeric landform seed must be finite");
    }
    assertWorldStyleProfile(profile);
    const numericSeed = seedToUint32(options.seed);
    const domain = resolveDomain(options.domain);
    return {
      numericSeed,
      domain,
      sample(x, y) {
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          throw new RangeError("landform coordinates must be finite numbers");
        }
        return domain.topology === "toroidal" ? sampleToroidalLandform(numericSeed, x, y, domain, profile) : sampleOpenLandform(numericSeed, x, y, domain, profile);
      }
    };
  }

  // src/world/WorldSurfaceResolver.ts
  var isWater = (type) => type === "sea" || type === "coastal";
  var clamp012 = (value) => Math.max(0, Math.min(1, value));
  var smoothstep2 = (edge0, edge1, value) => {
    const t = clamp012((value - edge0) / (edge1 - edge0));
    return t * t * (3 - 2 * t);
  };
  var modulo = (value, period) => (value % period + period) % period;
  function assertTileCoordinates(x, y) {
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) {
      throw new RangeError("world surface coordinates must be safe integers");
    }
  }
  function normalizeCoordinates(domain, x, y) {
    assertTileCoordinates(x, y);
    if (domain.topology === "infinite") return { x, y };
    if (domain.topology === "toroidal") {
      return { x: modulo(x, domain.width), y: modulo(y, domain.height) };
    }
    return x >= 0 && x < domain.width && y >= 0 && y < domain.height ? { x, y } : void 0;
  }
  function classifyTerrain(sample, profile) {
    const terrain = profile.terrain;
    if (sample.elevation < terrain.seaLevel) return "sea";
    if (sample.elevation > terrain.mountainElevation && sample.ridge > terrain.mountainRidge || sample.elevation > terrain.mountainPeakElevation) return "mountain";
    if (sample.temperature < terrain.snowTemperature) return "snow";
    if (sample.temperature < terrain.tundraTemperature) return "tundra";
    if (sample.temperature > terrain.sandTemperature && sample.moisture < terrain.sandMoisture) return "sand";
    return "land";
  }
  function generatedRelief(sample, profile) {
    const relief = profile.relief;
    if (sample.elevation < profile.terrain.seaLevel) return relief.shoreline;
    const landElevation = Math.max(0, sample.elevation - profile.terrain.seaLevel);
    const plain = relief.plainMinimum + landElevation * relief.plainElevationScale + sample.roughness * relief.plainRoughnessScale - sample.valley * relief.valleyDepth;
    const hill = smoothstep2(relief.hillElevationStart, relief.hillElevationEnd, sample.elevation) * relief.hillScale;
    const mountainT = Math.max(
      0,
      (sample.elevation - relief.mountainElevationStart) / relief.mountainElevationSpan
    );
    const mountain = Math.pow(mountainT, relief.mountainPower) * relief.mountainScale + sample.ridge * clamp012(mountainT) * relief.mountainRidgeScale;
    return Math.max(
      relief.shoreline,
      Math.min(relief.mountainMaximum, plain + hill + mountain)
    );
  }
  function biomeWeightsFor(type, sample, profile) {
    if (isWater(type)) return Object.freeze({ temperate: 0, dry: 0, cold: 0, alpine: 0 });
    const terrain = profile.terrain;
    const transition = terrain.climateTransition;
    const cold = 1 - smoothstep2(
      terrain.snowTemperature - transition,
      terrain.tundraTemperature + transition,
      sample.temperature
    );
    const dry = smoothstep2(
      terrain.sandTemperature - transition,
      terrain.sandTemperature + transition,
      sample.temperature
    ) * (1 - smoothstep2(
      terrain.sandMoisture - transition,
      terrain.sandMoisture + transition,
      sample.moisture
    ));
    const alpine = clamp012(Math.max(
      type === "mountain" ? 0.7 : 0,
      smoothstep2(
        terrain.mountainElevation - transition,
        terrain.mountainPeakElevation,
        sample.elevation
      ) * (0.45 + sample.ridge * 0.55)
    ));
    const temperate = Math.max(0.02, (1 - cold) * (1 - dry) * (1 - alpine));
    const sum = temperate + dry + cold + alpine;
    return Object.freeze({
      temperate: temperate / sum,
      dry: dry / sum,
      cold: cold / sum,
      alpine: alpine / sum
    });
  }
  function biomeFor(type, weights) {
    if (type === "sea" || type === "coastal") return type === "coastal" ? "coast" : "ocean";
    const weighted = [
      ["temperate", weights.temperate],
      ["dry", weights.dry],
      ["cold", weights.cold],
      ["alpine", weights.alpine]
    ];
    return weighted.reduce((best, candidate) => candidate[1] > best[1] ? candidate : best)[0];
  }
  function vegetationDensityFor(type, sample, profile) {
    if (isWater(type) || type === "mountain" || type === "snow") return 0;
    const vegetation = profile.vegetation;
    const moisture = smoothstep2(vegetation.moistureStart, vegetation.moistureFull, sample.moisture);
    const cold = smoothstep2(
      vegetation.temperatureMinimum - vegetation.temperatureTransition,
      vegetation.temperatureMinimum + vegetation.temperatureTransition,
      sample.temperature
    );
    const heat = 1 - smoothstep2(
      vegetation.temperatureMaximum - vegetation.temperatureTransition,
      vegetation.temperatureMaximum + vegetation.temperatureTransition,
      sample.temperature
    );
    const patch = vegetation.patchMinimum + (1 - vegetation.patchMinimum) * smoothstep2(vegetation.patchStart, vegetation.patchFull, sample.forestPatch);
    const slope = clamp012(1 - sample.ridge * vegetation.ridgePenalty - sample.roughness * vegetation.roughnessPenalty);
    return Math.min(
      vegetation.maximumDensity,
      moisture * cold * heat * patch * slope * vegetation.densityScale
    );
  }
  function lakePotentialFor(type, sample, profile) {
    if (isWater(type) || type === "mountain" || type === "snow") return 0;
    const lakes = profile.lakes;
    const elevation = smoothstep2(lakes.minimumElevation, lakes.minimumElevation + 0.035, sample.elevation) * (1 - smoothstep2(lakes.maximumElevation - 0.05, lakes.maximumElevation, sample.elevation));
    const moisture = smoothstep2(lakes.minimumMoisture, lakes.fullMoisture, sample.moisture);
    const valley = smoothstep2(lakes.valleyStart, lakes.valleyFull, sample.valley);
    const patch = smoothstep2(lakes.patchStart, lakes.patchFull, sample.lakePatch);
    return clamp012(elevation * moisture * valley * patch);
  }
  function vegetationKindFor(sample, profile) {
    return sample.temperature > profile.vegetation.palmTemperature ? "palm" : sample.temperature < profile.vegetation.piniaTemperature ? "pinia" : "oak";
  }
  function sampleSurface(sampler, profile, x, y) {
    const landform = Object.freeze({ ...sampler.sample(x, y) });
    const baseTerrain = classifyTerrain(landform, profile);
    const biomeWeights = biomeWeightsFor(baseTerrain, landform, profile);
    const biome = biomeFor(baseTerrain, biomeWeights);
    const vegetationDensity = vegetationDensityFor(baseTerrain, landform, profile);
    const lakePotential = lakePotentialFor(baseTerrain, landform, profile);
    return Object.freeze({
      baseTerrain,
      relief: generatedRelief(landform, profile),
      biome,
      biomeWeights,
      vegetationDensity,
      vegetationKind: vegetationDensity > 0 ? vegetationKindFor(landform, profile) : void 0,
      lakePotential,
      landform
    });
  }
  var FrozenWorldSurfaceResolver = class {
    constructor(options) {
      if (!options || typeof options !== "object") throw new TypeError("world surface resolver options are required");
      this.seed = String(options.seed);
      this.profile = options.profile ?? WORLD_STYLE_PROFILE;
      this.sampler = createLandformSamplerForProfile({ seed: options.seed, domain: options.domain }, this.profile);
      this.domain = Object.freeze({ ...this.sampler.domain });
    }
    sampleGenerated(x, y) {
      const point = normalizeCoordinates(this.domain, x, y);
      if (!point) throw new RangeError("world surface coordinate is outside the generated domain");
      return sampleSurface(this.sampler, this.profile, point.x, point.y);
    }
  };
  function createWorldSurfaceResolver(options) {
    return new FrozenWorldSurfaceResolver(options);
  }

  // src/world/semantic/BaseSemanticChunk.ts
  var BIOME_CHANNELS = 4;
  var CLIMATE_CHANNELS = 2;
  var SERIALIZED_MAGIC = 843273026;
  var SERIALIZED_HEADER_BYTES = 40;
  var SUBSTRATE_BYTES = WORLD_SEMANTIC_CHUNK_TILE_COUNT;
  var MACRO_HEIGHT_BYTES = WORLD_SEMANTIC_CHUNK_TILE_COUNT * Uint16Array.BYTES_PER_ELEMENT;
  var BIOME_WEIGHT_BYTES = WORLD_SEMANTIC_CHUNK_TILE_COUNT * BIOME_CHANNELS;
  var CLIMATE_BYTES = WORLD_SEMANTIC_CHUNK_TILE_COUNT * CLIMATE_CHANNELS;
  var VEGETATION_DENSITY_BYTES = WORLD_SEMANTIC_CHUNK_TILE_COUNT;
  var VEGETATION_PROFILE_BYTES = WORLD_SEMANTIC_CHUNK_TILE_COUNT;
  var BASE_SEMANTIC_CHUNK_PAYLOAD_BYTES = SUBSTRATE_BYTES + MACRO_HEIGHT_BYTES + BIOME_WEIGHT_BYTES + CLIMATE_BYTES + VEGETATION_DENSITY_BYTES + VEGETATION_PROFILE_BYTES;
  var BASE_SEMANTIC_CHUNK_SERIALIZED_BYTES = SERIALIZED_HEADER_BYTES + BASE_SEMANTIC_CHUNK_PAYLOAD_BYTES;
  function assertArray(name, value, type, length) {
    if (!(value instanceof type) || value.length !== length) {
      throw new TypeError(`${name} must be a ${type.name} of length ${length}`);
    }
  }
  function assertRevision(value) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError("semantic chunk revision must be a non-negative safe integer");
    }
  }
  function assertInvalidTileIsZero(chunk, index2) {
    const biomeOffset = index2 * BIOME_CHANNELS;
    const climateOffset = index2 * CLIMATE_CHANNELS;
    if (chunk.substrateClass[index2] !== 0 || chunk.macroHeight[index2] !== 0 || chunk.biomeWeights[biomeOffset] !== 0 || chunk.biomeWeights[biomeOffset + 1] !== 0 || chunk.biomeWeights[biomeOffset + 2] !== 0 || chunk.biomeWeights[biomeOffset + 3] !== 0 || chunk.climate[climateOffset] !== 0 || chunk.climate[climateOffset + 1] !== 0 || chunk.vegetationDensity[index2] !== 0 || chunk.vegetationProfile[index2] !== 0) {
      throw new TypeError("semantic chunk data outside validBounds must be zero-filled");
    }
  }
  function assertBaseSemanticChunk(value) {
    if (!value || typeof value !== "object") throw new TypeError("base semantic chunk must be an object");
    const chunk = value;
    const allowedFields = /* @__PURE__ */ new Set([
      "key",
      "revision",
      "validBounds",
      "substrateClass",
      "macroHeight",
      "biomeWeights",
      "climate",
      "vegetationDensity",
      "vegetationProfile"
    ]);
    if (Object.getOwnPropertyNames(chunk).some((name) => !allowedFields.has(name))) {
      throw new TypeError("base semantic chunk contains fields outside the v2 authority format");
    }
    assertSemanticChunkKey(chunk.key);
    assertRevision(chunk.revision);
    assertLocalTileBounds(chunk.validBounds);
    assertArray("substrateClass", chunk.substrateClass, Uint8Array, WORLD_SEMANTIC_CHUNK_TILE_COUNT);
    assertArray("macroHeight", chunk.macroHeight, Uint16Array, WORLD_SEMANTIC_CHUNK_TILE_COUNT);
    assertArray("biomeWeights", chunk.biomeWeights, Uint8Array, WORLD_SEMANTIC_CHUNK_TILE_COUNT * BIOME_CHANNELS);
    assertArray("climate", chunk.climate, Uint8Array, WORLD_SEMANTIC_CHUNK_TILE_COUNT * CLIMATE_CHANNELS);
    assertArray("vegetationDensity", chunk.vegetationDensity, Uint8Array, WORLD_SEMANTIC_CHUNK_TILE_COUNT);
    assertArray("vegetationProfile", chunk.vegetationProfile, Uint8Array, WORLD_SEMANTIC_CHUNK_TILE_COUNT);
    for (let localX = 0; localX < WORLD_SEMANTIC_CHUNK_SIZE; localX += 1) {
      for (let localY = 0; localY < WORLD_SEMANTIC_CHUNK_SIZE; localY += 1) {
        const index2 = semanticChunkLocalIndex(localX, localY);
        if (!localBoundsContain(chunk.validBounds, localX, localY)) {
          assertInvalidTileIsZero(chunk, index2);
          continue;
        }
        if (chunk.substrateClass[index2] >= WORLD_SUBSTRATE_CATALOG.length) {
          throw new TypeError("semantic chunk contains an unknown substrate class");
        }
        if (chunk.vegetationProfile[index2] >= WORLD_VEGETATION_PROFILE_CATALOG.length) {
          throw new TypeError("semantic chunk contains an unknown vegetation profile");
        }
        const biomeOffset = index2 * BIOME_CHANNELS;
        const weightSum = chunk.biomeWeights[biomeOffset] + chunk.biomeWeights[biomeOffset + 1] + chunk.biomeWeights[biomeOffset + 2] + chunk.biomeWeights[biomeOffset + 3];
        if (weightSum !== 255) {
          throw new TypeError("semantic chunk biome weights must sum to 255 for every valid tile");
        }
      }
    }
  }
  function baseSemanticChunkTransferables(chunk) {
    assertBaseSemanticChunk(chunk);
    const buffers = /* @__PURE__ */ new Set();
    for (const array of [
      chunk.substrateClass,
      chunk.macroHeight,
      chunk.biomeWeights,
      chunk.climate,
      chunk.vegetationDensity,
      chunk.vegetationProfile
    ]) {
      if (!(array.buffer instanceof ArrayBuffer)) {
        throw new TypeError("base semantic chunk arrays must use transferable ArrayBuffer storage");
      }
      buffers.add(array.buffer);
    }
    return [...buffers];
  }
  var BaseSemanticChunkView = class {
    constructor(chunk) {
      this.chunk = chunk;
      assertBaseSemanticChunk(chunk);
    }
    getTile(localX, localY) {
      return readValidatedBaseSemanticTile(this.chunk, localX, localY);
    }
  };
  function readValidatedBaseSemanticTile(chunk, localX, localY) {
    const index2 = semanticChunkLocalIndex(localX, localY);
    if (!localBoundsContain(chunk.validBounds, localX, localY)) {
      throw new RangeError("semantic tile lies outside the chunk validBounds");
    }
    const biomeOffset = index2 * BIOME_CHANNELS;
    const climateOffset = index2 * CLIMATE_CHANNELS;
    const originX = chunk.key.chunkX * WORLD_SEMANTIC_CHUNK_SIZE;
    const originY = chunk.key.chunkY * WORLD_SEMANTIC_CHUNK_SIZE;
    return Object.freeze({
      x: originX + localX,
      y: originY + localY,
      substrateClass: chunk.substrateClass[index2],
      macroHeight: chunk.macroHeight[index2] / 65535,
      biomeWeights: Object.freeze([
        chunk.biomeWeights[biomeOffset] / 255,
        chunk.biomeWeights[biomeOffset + 1] / 255,
        chunk.biomeWeights[biomeOffset + 2] / 255,
        chunk.biomeWeights[biomeOffset + 3] / 255
      ]),
      temperature: chunk.climate[climateOffset] / 255,
      moisture: chunk.climate[climateOffset + 1] / 255,
      vegetationDensity: chunk.vegetationDensity[index2] / 255,
      vegetationProfile: chunk.vegetationProfile[index2]
    });
  }
  function serializeBaseSemanticChunk(chunk) {
    assertBaseSemanticChunk(chunk);
    const buffer = new ArrayBuffer(BASE_SEMANTIC_CHUNK_SERIALIZED_BYTES);
    const view = new DataView(buffer);
    view.setUint32(0, SERIALIZED_MAGIC, true);
    view.setUint16(4, WORLD_CHUNK_FORMAT_VERSION, true);
    view.setUint16(6, SERIALIZED_HEADER_BYTES, true);
    view.setFloat64(8, chunk.key.chunkX, true);
    view.setFloat64(16, chunk.key.chunkY, true);
    view.setFloat64(24, chunk.revision, true);
    view.setUint8(32, chunk.validBounds.minX);
    view.setUint8(33, chunk.validBounds.minY);
    view.setUint8(34, chunk.validBounds.maxXExclusive);
    view.setUint8(35, chunk.validBounds.maxYExclusive);
    view.setUint32(36, BASE_SEMANTIC_CHUNK_PAYLOAD_BYTES, true);
    let offset = SERIALIZED_HEADER_BYTES;
    new Uint8Array(buffer, offset, SUBSTRATE_BYTES).set(chunk.substrateClass);
    offset += SUBSTRATE_BYTES;
    for (let index2 = 0; index2 < chunk.macroHeight.length; index2 += 1) {
      view.setUint16(offset + index2 * Uint16Array.BYTES_PER_ELEMENT, chunk.macroHeight[index2], true);
    }
    offset += MACRO_HEIGHT_BYTES;
    new Uint8Array(buffer, offset, BIOME_WEIGHT_BYTES).set(chunk.biomeWeights);
    offset += BIOME_WEIGHT_BYTES;
    new Uint8Array(buffer, offset, CLIMATE_BYTES).set(chunk.climate);
    offset += CLIMATE_BYTES;
    new Uint8Array(buffer, offset, VEGETATION_DENSITY_BYTES).set(chunk.vegetationDensity);
    offset += VEGETATION_DENSITY_BYTES;
    new Uint8Array(buffer, offset, VEGETATION_PROFILE_BYTES).set(chunk.vegetationProfile);
    return buffer;
  }
  function deserializeBaseSemanticChunk(buffer) {
    if (!(buffer instanceof ArrayBuffer) || buffer.byteLength !== BASE_SEMANTIC_CHUNK_SERIALIZED_BYTES) {
      throw new TypeError(`serialized base semantic chunk must contain ${BASE_SEMANTIC_CHUNK_SERIALIZED_BYTES} bytes`);
    }
    const view = new DataView(buffer);
    if (view.getUint32(0, true) !== SERIALIZED_MAGIC || view.getUint16(4, true) !== WORLD_CHUNK_FORMAT_VERSION || view.getUint16(6, true) !== SERIALIZED_HEADER_BYTES || view.getUint32(36, true) !== BASE_SEMANTIC_CHUNK_PAYLOAD_BYTES) {
      throw new TypeError("serialized base semantic chunk header is invalid or unsupported");
    }
    const key2 = {
      chunkX: view.getFloat64(8, true),
      chunkY: view.getFloat64(16, true)
    };
    const revision = view.getFloat64(24, true);
    const validBounds = {
      minX: view.getUint8(32),
      minY: view.getUint8(33),
      maxXExclusive: view.getUint8(34),
      maxYExclusive: view.getUint8(35)
    };
    let offset = SERIALIZED_HEADER_BYTES;
    const substrateClass = new Uint8Array(SUBSTRATE_BYTES);
    substrateClass.set(new Uint8Array(buffer, offset, SUBSTRATE_BYTES));
    offset += SUBSTRATE_BYTES;
    const macroHeight = new Uint16Array(WORLD_SEMANTIC_CHUNK_TILE_COUNT);
    for (let index2 = 0; index2 < macroHeight.length; index2 += 1) {
      macroHeight[index2] = view.getUint16(offset + index2 * Uint16Array.BYTES_PER_ELEMENT, true);
    }
    offset += MACRO_HEIGHT_BYTES;
    const biomeWeights = new Uint8Array(BIOME_WEIGHT_BYTES);
    biomeWeights.set(new Uint8Array(buffer, offset, BIOME_WEIGHT_BYTES));
    offset += BIOME_WEIGHT_BYTES;
    const climate = new Uint8Array(CLIMATE_BYTES);
    climate.set(new Uint8Array(buffer, offset, CLIMATE_BYTES));
    offset += CLIMATE_BYTES;
    const vegetationDensity = new Uint8Array(VEGETATION_DENSITY_BYTES);
    vegetationDensity.set(new Uint8Array(buffer, offset, VEGETATION_DENSITY_BYTES));
    offset += VEGETATION_DENSITY_BYTES;
    const vegetationProfile = new Uint8Array(VEGETATION_PROFILE_BYTES);
    vegetationProfile.set(new Uint8Array(buffer, offset, VEGETATION_PROFILE_BYTES));
    const chunk = Object.freeze({
      key: Object.freeze(key2),
      revision,
      validBounds: Object.freeze(validBounds),
      substrateClass,
      macroHeight,
      biomeWeights,
      climate,
      vegetationDensity,
      vegetationProfile
    });
    assertBaseSemanticChunk(chunk);
    return chunk;
  }

  // src/world/semantic/generateBaseSemanticChunk.ts
  function clampUnit(value) {
    if (!Number.isFinite(value)) throw new RangeError("semantic generator received a non-finite normalized value");
    return Math.max(0, Math.min(1, value));
  }
  function quantizeUint8(value) {
    return Math.floor(clampUnit(value) * 255 + 0.5);
  }
  function quantizeMacroHeight(value) {
    return Math.floor(clampUnit(value) * 65535 + 0.5);
  }
  function substrateFor(sample) {
    switch (sample.baseTerrain) {
      case "sea":
      case "coastal":
        return 0 /* Sediment */;
      case "sand":
        return 2 /* Sand */;
      case "mountain":
        return 3 /* Rock */;
      case "tundra":
      case "snow":
        return 4 /* Permafrost */;
      case "land":
        return 1 /* Soil */;
      default:
        throw new TypeError(`semantic generator cannot map terrain ${String(sample.baseTerrain)} to substrate`);
    }
  }
  function fallbackBiomeIndex(substrate) {
    switch (substrate) {
      case 2 /* Sand */:
        return 1;
      case 4 /* Permafrost */:
        return 2;
      case 3 /* Rock */:
        return 3;
      default:
        return 0;
    }
  }
  function quantizeBiomeWeights(sample, substrate) {
    const weights = [
      sample.biomeWeights.temperate,
      sample.biomeWeights.dry,
      sample.biomeWeights.cold,
      sample.biomeWeights.alpine
    ];
    if (weights.some((value) => !Number.isFinite(value) || value < 0)) {
      throw new RangeError("semantic generator received invalid biome weights");
    }
    const sum = weights.reduce((total, value) => total + value, 0);
    if (sum <= 0) {
      const fallback = [0, 0, 0, 0];
      fallback[fallbackBiomeIndex(substrate)] = 255;
      return fallback;
    }
    const scaled = weights.map((value) => value / sum * 255);
    const quantized = scaled.map((value) => Math.floor(value));
    let remaining = 255 - quantized.reduce((total, value) => total + value, 0);
    const order = scaled.map((value, index2) => ({ index: index2, remainder: value - quantized[index2] })).sort((first, second) => second.remainder - first.remainder || first.index - second.index);
    for (let index2 = 0; index2 < order.length && remaining > 0; index2 += 1, remaining -= 1) {
      quantized[order[index2].index] += 1;
    }
    return quantized;
  }
  function vegetationProfileFor(sample, density) {
    if (density === 0 || sample.vegetationKind === void 0) return 0;
    switch (sample.vegetationKind) {
      case "palm":
        return 1;
      case "pinia":
        return 2;
      case "oak":
        return 3;
    }
  }
  function assertResolverMatches(resolver, descriptor) {
    if (!resolver || resolver.seed !== descriptor.seed || resolver.domain.topology !== descriptor.topology || descriptor.topology === "toroidal" && (resolver.domain.topology !== "toroidal" || resolver.domain.width !== descriptor.width || resolver.domain.height !== descriptor.height)) {
      throw new TypeError("world surface resolver does not match the v2 semantic chunk request");
    }
  }
  function validBoundsForInfiniteChunk(origin) {
    const minX = Math.max(0, Number.MIN_SAFE_INTEGER - origin.x);
    const minY = Math.max(0, Number.MIN_SAFE_INTEGER - origin.y);
    const maxXExclusive = Math.min(WORLD_SEMANTIC_CHUNK_SIZE, Number.MAX_SAFE_INTEGER - origin.x + 1);
    const maxYExclusive = Math.min(WORLD_SEMANTIC_CHUNK_SIZE, Number.MAX_SAFE_INTEGER - origin.y + 1);
    return Object.freeze({ minX, minY, maxXExclusive, maxYExclusive });
  }
  function requireProceduralDescriptor(value) {
    assertWorldDescriptorV2(value);
    if (value.sourceKind === "static") {
      throw new TypeError("static v2 descriptors cannot be evaluated by the procedural semantic generator");
    }
    return value;
  }
  function createSemanticChunkSurfaceResolver(descriptor) {
    const candidate = requireProceduralDescriptor(descriptor);
    return createWorldSurfaceResolver({
      seed: candidate.seed,
      domain: candidate.topology === "toroidal" ? { topology: "toroidal", width: candidate.width, height: candidate.height } : { topology: "infinite" }
    });
  }
  function generateBaseSemanticChunk(options) {
    if (!options || typeof options !== "object") {
      throw new TypeError("base semantic chunk generation options are required");
    }
    return generateBaseSemanticChunkWithResolver(options, createSemanticChunkSurfaceResolver(options.descriptor));
  }
  function generateBaseSemanticChunkWithResolver(options, resolver) {
    if (!options || typeof options !== "object") {
      throw new TypeError("base semantic chunk generation options are required");
    }
    const descriptor = requireProceduralDescriptor(options.descriptor);
    const key2 = canonicalizeSemanticChunkKey(descriptor, options.key);
    const origin = semanticChunkOrigin(key2);
    const validBounds = descriptor.topology === "infinite" ? validBoundsForInfiniteChunk(origin) : FULL_SEMANTIC_CHUNK_BOUNDS;
    assertResolverMatches(resolver, descriptor);
    const substrateClass = new Uint8Array(WORLD_SEMANTIC_CHUNK_TILE_COUNT);
    const macroHeight = new Uint16Array(WORLD_SEMANTIC_CHUNK_TILE_COUNT);
    const biomeWeights = new Uint8Array(WORLD_SEMANTIC_CHUNK_TILE_COUNT * 4);
    const climate = new Uint8Array(WORLD_SEMANTIC_CHUNK_TILE_COUNT * 2);
    const vegetationDensity = new Uint8Array(WORLD_SEMANTIC_CHUNK_TILE_COUNT);
    const vegetationProfile = new Uint8Array(WORLD_SEMANTIC_CHUNK_TILE_COUNT);
    for (let localX = 0; localX < WORLD_SEMANTIC_CHUNK_SIZE; localX += 1) {
      for (let localY = 0; localY < WORLD_SEMANTIC_CHUNK_SIZE; localY += 1) {
        const index2 = semanticChunkLocalIndex(localX, localY);
        if (!localBoundsContain(validBounds, localX, localY)) continue;
        const sample = resolver.sampleGenerated(origin.x + localX, origin.y + localY);
        const substrate = substrateFor(sample);
        const weights = quantizeBiomeWeights(sample, substrate);
        const density = quantizeUint8(sample.vegetationDensity);
        substrateClass[index2] = substrate;
        macroHeight[index2] = quantizeMacroHeight(sample.landform.elevation);
        const biomeOffset = index2 * 4;
        biomeWeights[biomeOffset] = weights[0];
        biomeWeights[biomeOffset + 1] = weights[1];
        biomeWeights[biomeOffset + 2] = weights[2];
        biomeWeights[biomeOffset + 3] = weights[3];
        const climateOffset = index2 * 2;
        climate[climateOffset] = quantizeUint8(sample.landform.temperature);
        climate[climateOffset + 1] = quantizeUint8(sample.landform.moisture);
        vegetationDensity[index2] = density;
        vegetationProfile[index2] = vegetationProfileFor(sample, density);
      }
    }
    const chunk = Object.freeze({
      key: Object.freeze(key2),
      revision: BASE_SEMANTIC_CHUNK_REVISION,
      validBounds,
      substrateClass,
      macroHeight,
      biomeWeights,
      climate,
      vegetationDensity,
      vegetationProfile
    });
    assertBaseSemanticChunk(chunk);
    return chunk;
  }

  // src/world/semantic/MacroDrainageGraph.ts
  var OCEAN_BODY_ID = "hydrology:ocean:v1";
  var HYDROLOGY_MIN_RIVER_DISCHARGE_CLASS = 1;
  var HYDROLOGY_MAX_DISCHARGE_CLASS = 15;
  var HYDROLOGY_MAX_MACRO_NODES = 16384;
  var HYDROLOGY_SEA_LEVEL = quantizeMacroHeight(LANDFORM_SEA_LEVEL);
  var HYDROLOGY_MIN_EXPLICIT_LAKE_COMPONENT_NODES = 128;
  var HYDROLOGY_MIN_EXPLICIT_LAKE_DISTANCE = 8;
  var DrainageMinHeap = class _DrainageMinHeap {
    constructor() {
      this.entries = [];
    }
    push(entry) {
      this.entries.push(entry);
      let index2 = this.entries.length - 1;
      while (index2 > 0) {
        const parent = Math.floor((index2 - 1) / 2);
        if (!_DrainageMinHeap.less(entry, this.entries[parent])) break;
        this.entries[index2] = this.entries[parent];
        index2 = parent;
      }
      this.entries[index2] = entry;
    }
    pop() {
      const first = this.entries[0];
      const last = this.entries.pop();
      if (!first || !last || this.entries.length === 0) return first;
      let index2 = 0;
      while (true) {
        const left = index2 * 2 + 1;
        if (left >= this.entries.length) break;
        const right = left + 1;
        const child = right < this.entries.length && _DrainageMinHeap.less(this.entries[right], this.entries[left]) ? right : left;
        if (!_DrainageMinHeap.less(this.entries[child], last)) break;
        this.entries[index2] = this.entries[child];
        index2 = child;
      }
      this.entries[index2] = last;
      return first;
    }
    static less(first, second) {
      return first.drainageLevel < second.drainageLevel || first.drainageLevel === second.drainageLevel && (first.distance < second.distance || first.distance === second.distance && first.nodeIndex < second.nodeIndex);
    }
  };
  var STABLE_ID_SEEDS = [2166136261, 2654435769, 2246822507, 3266489909];
  function hashText(value, initial) {
    let hash = initial >>> 0;
    for (let index2 = 0; index2 < value.length; index2 += 1) {
      hash ^= value.charCodeAt(index2);
      hash = Math.imul(hash, 16777619);
      hash ^= hash >>> 13;
    }
    return hash >>> 0;
  }
  function createStableHydrologyId(namespace, parts) {
    if (!/^[a-z][a-z0-9-]*$/.test(namespace)) {
      throw new TypeError("hydrology ID namespace must use lowercase ASCII words");
    }
    const canonical = JSON.stringify(parts);
    const digest = STABLE_ID_SEEDS.map((seed) => hashText(canonical, seed).toString(16).padStart(8, "0")).join("");
    return `${namespace}:${digest}`;
  }
  function assertMacroHeight(value) {
    if (!Number.isInteger(value) || value < 0 || value > 65535) {
      throw new RangeError("macro height source must return a Uint16 value");
    }
  }
  function assertBasinKey(value) {
    if (!value || !Number.isSafeInteger(value.basinX) || !Number.isSafeInteger(value.basinY) || Object.getOwnPropertyNames(value).some((name) => name !== "basinX" && name !== "basinY")) {
      throw new TypeError("infinite hydrology requires a safe-integer basin key");
    }
    const originX = value.basinX * HYDROLOGY_INFINITE_BASIN_SIZE;
    const originY = value.basinY * HYDROLOGY_INFINITE_BASIN_SIZE;
    if (originX > Number.MAX_SAFE_INTEGER || originX + HYDROLOGY_INFINITE_BASIN_SIZE - 1 < Number.MIN_SAFE_INTEGER || originY > Number.MAX_SAFE_INTEGER || originY + HYDROLOGY_INFINITE_BASIN_SIZE - 1 < Number.MIN_SAFE_INTEGER) {
      throw new RangeError("hydrology basin lies outside the safe integer tile domain");
    }
  }
  function createProceduralMacroHeightSource(descriptor) {
    const resolver = createSemanticChunkSurfaceResolver(descriptor);
    return Object.freeze({
      sampleMacroHeight(tileX, tileY) {
        if (!Number.isSafeInteger(tileX) || !Number.isSafeInteger(tileY)) {
          throw new RangeError("macro height coordinates must be safe integers");
        }
        return quantizeMacroHeight(resolver.sampleGenerated(tileX, tileY).landform.elevation);
      }
    });
  }
  function dimensionsFor(options) {
    const descriptor = options.descriptor;
    if (descriptor.topology === "infinite") {
      assertBasinKey(options.basin);
      return {
        topology: "infinite-basin",
        originX: options.basin.basinX * HYDROLOGY_INFINITE_BASIN_SIZE,
        originY: options.basin.basinY * HYDROLOGY_INFINITE_BASIN_SIZE,
        width: HYDROLOGY_INFINITE_BASIN_SIZE,
        height: HYDROLOGY_INFINITE_BASIN_SIZE,
        wrapX: false,
        wrapY: false,
        graphParts: [serializeWorldDescriptorV2(descriptor), options.basin.basinX, options.basin.basinY]
      };
    }
    if (options.basin !== void 0) {
      throw new TypeError("finite hydrology graphs do not accept an infinite basin key");
    }
    return {
      topology: descriptor.topology,
      originX: 0,
      originY: 0,
      width: descriptor.width,
      height: descriptor.height,
      wrapX: descriptor.topology === "toroidal",
      wrapY: descriptor.topology === "toroidal",
      graphParts: [serializeWorldDescriptorV2(descriptor)]
    };
  }
  function resolveHeightSource(options) {
    if (options.macroHeightSource) return options.macroHeightSource;
    if (options.descriptor.sourceKind === "static") {
      throw new TypeError("static hydrology graph generation requires an explicit immutable macro height source");
    }
    return createProceduralMacroHeightSource(options.descriptor);
  }
  function nodeCoordinate(origin, size, grid) {
    return Math.min(origin + size - 1, origin + grid * HYDROLOGY_MACRO_CELL_SIZE + Math.floor(HYDROLOGY_MACRO_CELL_SIZE / 2));
  }
  function neighborIndices(node, columns, rows, wrapX, wrapY) {
    const result = /* @__PURE__ */ new Set();
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        if (dx === 0 && dy === 0) continue;
        let x = node.gridX + dx;
        let y = node.gridY + dy;
        if (wrapX) x = positiveIntegerModulo(x, columns);
        if (wrapY) y = positiveIntegerModulo(y, rows);
        if (x < 0 || x >= columns || y < 0 || y >= rows) continue;
        const index2 = x * rows + y;
        if (index2 !== node.gridX * rows + node.gridY) result.add(index2);
      }
    }
    return [...result];
  }
  function buildNeighborTable(nodes, columns, rows, wrapX, wrapY) {
    return nodes.map((node) => neighborIndices(node, columns, rows, wrapX, wrapY));
  }
  function lowerNodeFirst(nodes, first, second) {
    return nodes[first].macroHeight - nodes[second].macroHeight || first - second;
  }
  function selectExplicitLake(component, componentId, componentByNode, outletIngressIndex, nodes, neighbors, distances) {
    if (component.length < HYDROLOGY_MIN_EXPLICIT_LAKE_COMPONENT_NODES) return void 0;
    const queue = [];
    distances[outletIngressIndex] = 0;
    queue.push(outletIngressIndex);
    let maximumDistance = 0;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const index2 = queue[cursor];
      const distance = distances[index2];
      maximumDistance = Math.max(maximumDistance, distance);
      for (const candidateIndex of neighbors[index2]) {
        if (componentByNode[candidateIndex] !== componentId || distances[candidateIndex] >= 0) continue;
        distances[candidateIndex] = distance + 1;
        queue.push(candidateIndex);
      }
    }
    if (maximumDistance < HYDROLOGY_MIN_EXPLICIT_LAKE_DISTANCE) {
      for (const index2 of component) distances[index2] = -1;
      return void 0;
    }
    const minimumDistance = Math.max(
      HYDROLOGY_MIN_EXPLICIT_LAKE_DISTANCE,
      Math.ceil(maximumDistance * 2 / 3)
    );
    let selected;
    let selectedIsLocalMinimum = false;
    for (const index2 of component) {
      if (distances[index2] < minimumDistance) continue;
      const isLocalMinimum = neighbors[index2].every(
        (candidateIndex) => componentByNode[candidateIndex] !== componentId || nodes[candidateIndex].macroHeight >= nodes[index2].macroHeight
      );
      if (selected === void 0 || isLocalMinimum && !selectedIsLocalMinimum || isLocalMinimum === selectedIsLocalMinimum && (nodes[index2].macroHeight < nodes[selected].macroHeight || nodes[index2].macroHeight === nodes[selected].macroHeight && (distances[index2] > distances[selected] || distances[index2] === distances[selected] && index2 < selected))) {
        selected = index2;
        selectedIsLocalMinimum = isLocalMinimum;
      }
    }
    for (const index2 of component) distances[index2] = -1;
    return selected;
  }
  function selectDrainageRoots(nodes, neighbors) {
    var _a;
    const componentByNode = new Int32Array(nodes.length);
    componentByNode.fill(-1);
    const components = [];
    for (let start = 0; start < nodes.length; start += 1) {
      if (nodes[start].macroHeight < HYDROLOGY_SEA_LEVEL || componentByNode[start] >= 0) continue;
      const componentId = components.length;
      const component = [start];
      componentByNode[start] = componentId;
      for (let cursor = 0; cursor < component.length; cursor += 1) {
        const index2 = component[cursor];
        for (const candidateIndex of neighbors[index2]) {
          if (nodes[candidateIndex].macroHeight < HYDROLOGY_SEA_LEVEL || componentByNode[candidateIndex] >= 0) continue;
          componentByNode[candidateIndex] = componentId;
          component.push(candidateIndex);
        }
      }
      components.push(component);
    }
    const roots = /* @__PURE__ */ new Set();
    const distances = new Int32Array(nodes.length);
    distances.fill(-1);
    for (let componentId = 0; componentId < components.length; componentId += 1) {
      const component = components[componentId];
      const outletCandidates = /* @__PURE__ */ new Set();
      for (const index2 of component) {
        nodes[index2].included = true;
        for (const candidateIndex of neighbors[index2]) {
          if (nodes[candidateIndex].macroHeight < HYDROLOGY_SEA_LEVEL) {
            outletCandidates.add(candidateIndex);
          }
        }
      }
      if (outletCandidates.size === 0) {
        roots.add([...component].sort((first, second) => lowerNodeFirst(nodes, first, second))[0]);
        continue;
      }
      const outletIndex = [...outletCandidates].sort((first, second) => lowerNodeFirst(nodes, first, second))[0];
      const outletIngressIndex = neighbors[outletIndex].filter((index2) => componentByNode[index2] === componentId).sort((first, second) => lowerNodeFirst(nodes, first, second))[0];
      if (outletIngressIndex === void 0) {
        throw new Error("selected hydrology outlet does not touch its land component");
      }
      roots.add(outletIndex);
      nodes[outletIndex].included = true;
      ((_a = nodes[outletIndex]).outletIngressIndices ?? (_a.outletIngressIndices = /* @__PURE__ */ new Set())).add(outletIngressIndex);
      const lakeIndex = selectExplicitLake(
        component,
        componentId,
        componentByNode,
        outletIngressIndex,
        nodes,
        neighbors,
        distances
      );
      if (lakeIndex !== void 0) roots.add(lakeIndex);
    }
    if (roots.size === 0) {
      const oceanIndex = nodes.map((_, index2) => index2).sort((first, second) => lowerNodeFirst(nodes, first, second))[0];
      roots.add(oceanIndex);
      nodes[oceanIndex].included = true;
    }
    return roots;
  }
  function assignDrainage(nodes, columns, rows, wrapX, wrapY) {
    const neighbors = buildNeighborTable(nodes, columns, rows, wrapX, wrapY);
    const seedIndices = selectDrainageRoots(nodes, neighbors);
    const queue = new DrainageMinHeap();
    let settled = 0;
    for (let index2 = 0; index2 < nodes.length; index2 += 1) {
      const node = nodes[index2];
      if (node.macroHeight >= HYDROLOGY_SEA_LEVEL || seedIndices.has(index2)) continue;
      node.drainageLevel = HYDROLOGY_SEA_LEVEL;
      node.distanceToTerminal = 0;
      node.terminalIndex = index2;
      node.drainageRank = 0;
      node.settled = true;
      settled += 1;
    }
    for (const index2 of seedIndices) {
      const node = nodes[index2];
      node.isDrainageRoot = true;
      node.drainageLevel = node.macroHeight < HYDROLOGY_SEA_LEVEL ? HYDROLOGY_SEA_LEVEL : node.macroHeight;
      node.distanceToTerminal = 0;
      node.terminalIndex = index2;
      node.drainageRank = 0;
      queue.push({ nodeIndex: index2, drainageLevel: node.drainageLevel, distance: 0 });
    }
    while (settled < nodes.length) {
      const entry = queue.pop();
      if (!entry) throw new Error("macro drainage priority flood did not reach every node");
      const node = nodes[entry.nodeIndex];
      if (node.settled || node.drainageLevel !== entry.drainageLevel || node.distanceToTerminal !== entry.distance) continue;
      node.settled = true;
      settled += 1;
      const candidateIndices = node.outletIngressIndices ?? neighbors[entry.nodeIndex];
      for (const candidateIndex of candidateIndices) {
        const candidate = nodes[candidateIndex];
        if (candidate.settled || candidate.isDrainageRoot || candidate.macroHeight < HYDROLOGY_SEA_LEVEL) continue;
        const candidateLevel = Math.max(candidate.macroHeight, node.drainageLevel);
        const candidateDistance = node.distanceToTerminal + 1;
        const priorParent = candidate.downstreamIndex;
        const better = candidate.drainageLevel === void 0 || candidateLevel < candidate.drainageLevel || candidateLevel === candidate.drainageLevel && (candidateDistance < candidate.distanceToTerminal || candidateDistance === candidate.distanceToTerminal && entry.nodeIndex < priorParent);
        if (!better) continue;
        candidate.drainageLevel = candidateLevel;
        candidate.distanceToTerminal = candidateDistance;
        candidate.downstreamIndex = entry.nodeIndex;
        candidate.terminalIndex = node.terminalIndex;
        candidate.drainageRank = node.drainageRank + 1;
        queue.push({ nodeIndex: candidateIndex, drainageLevel: candidateLevel, distance: candidateDistance });
      }
    }
  }
  function freezeGraph(graphId, dimensions, nodes) {
    const includedIndices = nodes.map((_, index2) => index2).filter((index2) => nodes[index2].included);
    const terminals = [];
    const terminalByIndex = /* @__PURE__ */ new Map();
    for (const index2 of includedIndices) {
      const node = nodes[index2];
      if (node.downstreamIndex !== void 0) continue;
      const kind = node.macroHeight < HYDROLOGY_SEA_LEVEL ? "ocean" : "lake";
      const terminal = Object.freeze({
        nodeId: node.nodeId,
        bodyId: kind === "ocean" ? OCEAN_BODY_ID : createStableHydrologyId("lake", [graphId, node.nodeId]),
        kind,
        level: kind === "ocean" ? HYDROLOGY_SEA_LEVEL : node.macroHeight
      });
      terminalByIndex.set(index2, terminal);
      terminals.push(terminal);
    }
    const byRankDescending = [...includedIndices].sort((first, second) => nodes[second].drainageRank - nodes[first].drainageRank || first - second);
    for (const index2 of byRankDescending) {
      const node = nodes[index2];
      if (node.downstreamIndex !== void 0) {
        nodes[node.downstreamIndex].accumulatedFlow += node.accumulatedFlow;
      }
    }
    const frozenNodeByIndex = /* @__PURE__ */ new Map();
    const frozenNodes = includedIndices.map((index2) => {
      const node = nodes[index2];
      const terminal = terminalByIndex.get(node.terminalIndex);
      if (!terminal) throw new Error("macro drainage node resolved an unknown terminal");
      const frozen = Object.freeze({
        nodeId: node.nodeId,
        x: node.x,
        y: node.y,
        macroHeight: node.macroHeight,
        drainageLevel: node.drainageLevel,
        downstreamNodeId: node.downstreamIndex === void 0 ? void 0 : nodes[node.downstreamIndex].nodeId,
        terminalBodyId: terminal.bodyId,
        drainageRank: node.drainageRank,
        dischargeClass: Math.min(
          HYDROLOGY_MAX_DISCHARGE_CLASS,
          Math.floor(Math.log2(node.accumulatedFlow))
        ),
        accumulatedFlow: node.accumulatedFlow
      });
      frozenNodeByIndex.set(index2, frozen);
      return frozen;
    });
    const edges = [];
    for (const index2 of includedIndices) {
      const upstream = frozenNodeByIndex.get(index2);
      const downstreamIndex = nodes[index2].downstreamIndex;
      if (downstreamIndex === void 0) continue;
      const downstream = frozenNodeByIndex.get(downstreamIndex);
      if (!downstream) throw new Error("macro drainage edge resolved an excluded downstream node");
      const terminalIndex = nodes[index2].terminalIndex;
      edges.push(Object.freeze({
        edgeId: createStableHydrologyId("drainage-edge", [graphId, upstream.nodeId, downstream.nodeId]),
        riverId: createStableHydrologyId("river", [graphId, nodes[terminalIndex].nodeId]),
        upstreamNodeId: upstream.nodeId,
        downstreamNodeId: downstream.nodeId,
        terminalBodyId: upstream.terminalBodyId,
        dischargeClass: upstream.dischargeClass
      }));
    }
    const graph = Object.freeze({
      graphId,
      topology: dimensions.topology,
      originX: dimensions.originX,
      originY: dimensions.originY,
      width: dimensions.width,
      height: dimensions.height,
      wrapX: dimensions.wrapX,
      wrapY: dimensions.wrapY,
      nodes: Object.freeze(frozenNodes),
      edges: Object.freeze(edges),
      terminals: Object.freeze(terminals.sort((first, second) => first.nodeId.localeCompare(second.nodeId)))
    });
    assertMacroDrainageGraph(graph);
    return graph;
  }
  function buildMacroDrainageGraph(options) {
    if (!options || typeof options !== "object") throw new TypeError("macro drainage graph options are required");
    assertWorldDescriptorV2(options.descriptor);
    const dimensions = dimensionsFor(options);
    const columns = Math.ceil(dimensions.width / HYDROLOGY_MACRO_CELL_SIZE);
    const rows = Math.ceil(dimensions.height / HYDROLOGY_MACRO_CELL_SIZE);
    const nodeCount = columns * rows;
    if (!Number.isSafeInteger(nodeCount) || nodeCount <= 0 || nodeCount > HYDROLOGY_MAX_MACRO_NODES) {
      throw new RangeError(
        `macro drainage graph requires ${nodeCount} nodes; format limit is ${HYDROLOGY_MAX_MACRO_NODES}`
      );
    }
    const graphId = createStableHydrologyId("drainage-graph", dimensions.graphParts);
    const source = resolveHeightSource(options);
    const nodes = [];
    for (let gridX = 0; gridX < columns; gridX += 1) {
      for (let gridY = 0; gridY < rows; gridY += 1) {
        const x = nodeCoordinate(dimensions.originX, dimensions.width, gridX);
        const y = nodeCoordinate(dimensions.originY, dimensions.height, gridY);
        if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) continue;
        const macroHeight = source.sampleMacroHeight(x, y);
        assertMacroHeight(macroHeight);
        nodes.push({
          nodeId: createStableHydrologyId("drainage-node", [graphId, gridX, gridY]),
          x,
          y,
          macroHeight,
          gridX,
          gridY,
          accumulatedFlow: 1
        });
      }
    }
    if (nodes.length !== nodeCount) {
      throw new RangeError("hydrology macro nodes cannot be represented at this safe-integer boundary");
    }
    assignDrainage(nodes, columns, rows, dimensions.wrapX, dimensions.wrapY);
    return freezeGraph(graphId, dimensions, nodes);
  }
  function assertMacroDrainageGraph(value) {
    if (!value || typeof value !== "object") throw new TypeError("macro drainage graph must be an object");
    const graph = value;
    const allowed = /* @__PURE__ */ new Set([
      "graphId",
      "topology",
      "originX",
      "originY",
      "width",
      "height",
      "wrapX",
      "wrapY",
      "nodes",
      "edges",
      "terminals"
    ]);
    if (Object.getOwnPropertyNames(graph).some((name) => !allowed.has(name))) {
      throw new TypeError("macro drainage graph contains unknown fields");
    }
    if (typeof graph.graphId !== "string" || !["infinite-basin", "bounded", "toroidal"].includes(graph.topology) || !Number.isInteger(graph.originX) || !Number.isInteger(graph.originY) || !Number.isSafeInteger(graph.width) || graph.width <= 0 || !Number.isSafeInteger(graph.height) || graph.height <= 0 || graph.originX > Number.MAX_SAFE_INTEGER || graph.originX + graph.width - 1 < Number.MIN_SAFE_INTEGER || graph.originY > Number.MAX_SAFE_INTEGER || graph.originY + graph.height - 1 < Number.MIN_SAFE_INTEGER || typeof graph.wrapX !== "boolean" || typeof graph.wrapY !== "boolean" || !Array.isArray(graph.nodes) || graph.nodes.length === 0 || graph.nodes.length > HYDROLOGY_MAX_MACRO_NODES || !Array.isArray(graph.edges) || !Array.isArray(graph.terminals)) {
      throw new TypeError("macro drainage graph header is invalid");
    }
    const nodes = /* @__PURE__ */ new Map();
    for (const node of graph.nodes) {
      if (!node || typeof node.nodeId !== "string" || nodes.has(node.nodeId) || !Number.isSafeInteger(node.x) || !Number.isSafeInteger(node.y) || !Number.isInteger(node.macroHeight) || node.macroHeight < 0 || node.macroHeight > 65535 || !Number.isInteger(node.drainageLevel) || node.drainageLevel < 0 || node.drainageLevel > 65535 || !Number.isInteger(node.drainageRank) || node.drainageRank < 0 || !Number.isInteger(node.dischargeClass) || node.dischargeClass < 0 || node.dischargeClass > HYDROLOGY_MAX_DISCHARGE_CLASS || !Number.isSafeInteger(node.accumulatedFlow) || node.accumulatedFlow <= 0 || typeof node.terminalBodyId !== "string") {
        throw new TypeError("macro drainage graph contains an invalid or duplicate node");
      }
      nodes.set(node.nodeId, node);
    }
    const terminalNodes = /* @__PURE__ */ new Set();
    const bodyKinds = /* @__PURE__ */ new Map();
    for (const terminal of graph.terminals) {
      const node = nodes.get(terminal?.nodeId);
      if (!node || node.downstreamNodeId !== void 0 || terminalNodes.has(terminal.nodeId) || terminal.kind !== "ocean" && terminal.kind !== "lake" || typeof terminal.bodyId !== "string" || terminal.bodyId !== node.terminalBodyId || !Number.isInteger(terminal.level) || terminal.level < 0 || terminal.level > 65535 || terminal.kind === "ocean" && terminal.bodyId !== OCEAN_BODY_ID || terminal.kind === "lake" && terminal.bodyId === OCEAN_BODY_ID) {
        throw new TypeError("macro drainage graph contains an invalid terminal");
      }
      const priorKind = bodyKinds.get(terminal.bodyId);
      if (priorKind && priorKind !== terminal.kind) {
        throw new TypeError("macro drainage graph reuses a body ID for different kinds");
      }
      bodyKinds.set(terminal.bodyId, terminal.kind);
      terminalNodes.add(terminal.nodeId);
    }
    if (terminalNodes.size === 0) throw new TypeError("macro drainage graph must contain a terminal");
    for (const node of graph.nodes) {
      if (node.downstreamNodeId === void 0) {
        if (node.drainageRank !== 0 || !terminalNodes.has(node.nodeId)) {
          throw new TypeError("macro drainage terminal node is not declared or has nonzero rank");
        }
        continue;
      }
      const downstream = nodes.get(node.downstreamNodeId);
      if (!downstream || downstream.drainageRank >= node.drainageRank || downstream.drainageLevel > node.drainageLevel || downstream.terminalBodyId !== node.terminalBodyId || downstream.dischargeClass < node.dischargeClass) {
        throw new TypeError("macro drainage downstream edge violates rank, terminal, or discharge invariants");
      }
    }
    const edgeIds = /* @__PURE__ */ new Set();
    for (const edge of graph.edges) {
      const upstream = nodes.get(edge?.upstreamNodeId);
      const downstream = nodes.get(edge?.downstreamNodeId);
      if (!upstream || !downstream || upstream.downstreamNodeId !== downstream.nodeId || typeof edge.edgeId !== "string" || edgeIds.has(edge.edgeId) || typeof edge.riverId !== "string" || edge.terminalBodyId !== upstream.terminalBodyId || edge.dischargeClass !== upstream.dischargeClass) {
        throw new TypeError("macro drainage graph contains an invalid or duplicate edge");
      }
      edgeIds.add(edge.edgeId);
    }
    if (graph.edges.length !== graph.nodes.length - graph.terminals.length) {
      throw new TypeError("macro drainage graph does not serialize every downstream relation exactly once");
    }
  }

  // src/world/semantic/EffectiveSurfaceWindow.ts
  var HYDROLOGY_MAX_HALF_WIDTH_TILES = 255 / (HYDROLOGY_COORDINATE_SCALE * 2);
  var HYDROLOGY_REQUIREMENT_RADIUS_TILES = Math.ceil(
    HYDROLOGY_MAX_HALF_WIDTH_TILES + SURFACE_INFLUENCE_RADIUS_TILES
  );
  var FEATURE_ID_PATTERN = /^[a-z][a-z0-9-]*:[a-f0-9]{32}$/;
  function semanticKey(value) {
    return `${value.chunkX},${value.chunkY}`;
  }
  function hydrologyKey(value) {
    return `${value.regionX},${value.regionY}`;
  }
  function compareSemanticKeys(first, second) {
    return first.chunkX - second.chunkX || first.chunkY - second.chunkY;
  }
  function compareHydrologyKeys(first, second) {
    return first.regionX - second.regionX || first.regionY - second.regionY;
  }
  function renderOrigin(key2) {
    return {
      x: key2.chunkX * SURFACE_RENDER_CHUNK_SIZE,
      y: key2.chunkY * SURFACE_RENDER_CHUNK_SIZE
    };
  }
  function canonicalReadCoordinate(descriptor, coordinate, axis) {
    if (!Number.isInteger(coordinate)) throw new RangeError("surface window tile coordinate must be an integer");
    if (descriptor.topology === "toroidal") {
      return positiveIntegerModulo(coordinate, axis === "x" ? descriptor.width : descriptor.height);
    }
    if (descriptor.topology === "bounded") {
      const maximum = (axis === "x" ? descriptor.width : descriptor.height) - 1;
      return Math.max(0, Math.min(maximum, coordinate));
    }
    return Math.max(Number.MIN_SAFE_INTEGER, Math.min(Number.MAX_SAFE_INTEGER, coordinate));
  }
  function surfaceSemanticChunkRequirements(descriptor, renderKey) {
    const key2 = canonicalizeRenderChunkKey(descriptor, renderKey);
    const origin = renderOrigin(key2);
    const chunkXs = /* @__PURE__ */ new Set();
    const chunkYs = /* @__PURE__ */ new Set();
    for (let local = -SURFACE_INFLUENCE_RADIUS_TILES; local < SURFACE_RENDER_CHUNK_SIZE + SURFACE_INFLUENCE_RADIUS_TILES; local += 1) {
      chunkXs.add(semanticChunkCoordinate(canonicalReadCoordinate(descriptor, origin.x + local, "x")));
      chunkYs.add(semanticChunkCoordinate(canonicalReadCoordinate(descriptor, origin.y + local, "y")));
    }
    const result = [];
    for (const chunkX of chunkXs) for (const chunkY of chunkYs) {
      result.push(Object.freeze(canonicalizeSemanticChunkKey(descriptor, { chunkX, chunkY })));
    }
    return Object.freeze(result.sort(compareSemanticKeys));
  }
  function surfaceHydrologyRegionRequirements(descriptor, renderKey) {
    const key2 = canonicalizeRenderChunkKey(descriptor, renderKey);
    const origin = renderOrigin(key2);
    const regionXs = /* @__PURE__ */ new Set();
    const regionYs = /* @__PURE__ */ new Set();
    for (let local = -HYDROLOGY_REQUIREMENT_RADIUS_TILES; local < SURFACE_RENDER_CHUNK_SIZE + HYDROLOGY_REQUIREMENT_RADIUS_TILES; local += 1) {
      regionXs.add(hydrologyRegionCoordinate(canonicalReadCoordinate(descriptor, origin.x + local, "x")));
      regionYs.add(hydrologyRegionCoordinate(canonicalReadCoordinate(descriptor, origin.y + local, "y")));
    }
    const result = [];
    for (const regionX of regionXs) for (const regionY of regionYs) {
      result.push(Object.freeze(canonicalizeHydrologyRegionKey(descriptor, { regionX, regionY })));
    }
    return Object.freeze(result.sort(compareHydrologyKeys));
  }
  function assertExactDependencies(snapshot, key2) {
    const semantic = surfaceSemanticChunkRequirements(snapshot.descriptor, key2);
    const hydrology = surfaceHydrologyRegionRequirements(snapshot.descriptor, key2);
    if (snapshot.semanticChunks.length !== semantic.length || snapshot.semanticChunks.some((chunk, index2) => semanticKey(chunk.base.key) !== semanticKey(semantic[index2]))) {
      throw new TypeError("effective surface window requires the exact semantic chunk dependency set");
    }
    if (snapshot.hydrologyRegions.length !== hydrology.length || snapshot.hydrologyRegions.some((region, index2) => hydrologyKey(region.base.key) !== hydrologyKey(hydrology[index2]))) {
      throw new TypeError("effective surface window requires the exact hydrology region dependency set");
    }
  }
  function validCoreBounds(descriptor, key2) {
    if (descriptor.topology === "toroidal") {
      return Object.freeze({
        minX: 0,
        minY: 0,
        maxXExclusive: SURFACE_RENDER_CHUNK_SIZE,
        maxYExclusive: SURFACE_RENDER_CHUNK_SIZE
      });
    }
    const origin = renderOrigin(key2);
    const validX = [];
    const validY = [];
    for (let local = 0; local < SURFACE_RENDER_CHUNK_SIZE; local += 1) {
      const x = origin.x + local;
      const y = origin.y + local;
      if (Number.isSafeInteger(x) && (descriptor.topology !== "bounded" || x >= 0 && x < descriptor.width)) {
        validX.push(local);
      }
      if (Number.isSafeInteger(y) && (descriptor.topology !== "bounded" || y >= 0 && y < descriptor.height)) {
        validY.push(local);
      }
    }
    if (validX.length === 0 || validY.length === 0) {
      throw new RangeError("render chunk does not contain any valid world tiles");
    }
    return Object.freeze({
      minX: validX[0],
      minY: validY[0],
      maxXExclusive: validX[validX.length - 1] + 1,
      maxYExclusive: validY[validY.length - 1] + 1
    });
  }
  function acquireBuffer(byteLength, allocator, acquired) {
    const buffer = allocator?.acquire(byteLength) ?? new ArrayBuffer(byteLength);
    if (!(buffer instanceof ArrayBuffer) || buffer.byteLength !== byteLength) {
      throw new TypeError("surface window buffer allocator returned an invalid buffer");
    }
    acquired.push(buffer);
    return buffer;
  }
  function uint8Array(length, allocator, acquired) {
    return new Uint8Array(acquireBuffer(length, allocator, acquired));
  }
  function uint16Array(length, allocator, acquired) {
    return new Uint16Array(acquireBuffer(length * Uint16Array.BYTES_PER_ELEMENT, allocator, acquired));
  }
  function float64Array(length, allocator, acquired) {
    return new Float64Array(acquireBuffer(length * Float64Array.BYTES_PER_ELEMENT, allocator, acquired));
  }
  function copyUint8Array(source, allocator, acquired) {
    const result = uint8Array(source.length, allocator, acquired);
    result.set(source);
    return result;
  }
  function copyUint16Array(source, allocator, acquired) {
    const result = uint16Array(source.length, allocator, acquired);
    result.set(source);
    return result;
  }
  function releaseUnusedArray(value, allocator, acquired) {
    if (!(value.buffer instanceof ArrayBuffer)) return;
    const index2 = acquired.lastIndexOf(value.buffer);
    if (index2 >= 0) acquired.splice(index2, 1);
    allocator?.release([value.buffer]);
  }
  function copySemanticWindow(snapshot, key2, allocator, acquired) {
    const tileCount = SURFACE_EFFECTIVE_WINDOW_SIZE * SURFACE_EFFECTIVE_WINDOW_SIZE;
    const substrateClass = uint8Array(tileCount, allocator, acquired);
    const macroHeight = uint16Array(tileCount, allocator, acquired);
    const biomeWeights = uint8Array(tileCount * 4, allocator, acquired);
    const climate = uint8Array(tileCount * 2, allocator, acquired);
    const vegetationDensity = uint8Array(tileCount, allocator, acquired);
    const vegetationProfile = uint8Array(tileCount, allocator, acquired);
    const origin = renderOrigin(key2);
    for (let windowX = 0; windowX < SURFACE_EFFECTIVE_WINDOW_SIZE; windowX += 1) {
      const tileX = canonicalReadCoordinate(
        snapshot.descriptor,
        origin.x + windowX - SURFACE_INFLUENCE_RADIUS_TILES,
        "x"
      );
      for (let windowY = 0; windowY < SURFACE_EFFECTIVE_WINDOW_SIZE; windowY += 1) {
        const tileY = canonicalReadCoordinate(
          snapshot.descriptor,
          origin.y + windowY - SURFACE_INFLUENCE_RADIUS_TILES,
          "y"
        );
        const location = locateSemanticTile(tileX, tileY);
        const chunk = snapshot.getSemanticChunk(location.key);
        const baseIndex = semanticChunkLocalIndex(location.localX, location.localY);
        const deltaOffset = chunk.delta ? sparseSemanticDeltaOverrideOffset(chunk.delta, baseIndex) : -1;
        const mask = deltaOffset >= 0 ? chunk.delta.masks[deltaOffset] : 0;
        const windowIndex2 = windowX * SURFACE_EFFECTIVE_WINDOW_SIZE + windowY;
        substrateClass[windowIndex2] = mask & 1 /* Substrate */ ? chunk.delta.substrateClass[deltaOffset] : chunk.base.substrateClass[baseIndex];
        macroHeight[windowIndex2] = mask & 2 /* MacroHeight */ ? chunk.delta.macroHeight[deltaOffset] : chunk.base.macroHeight[baseIndex];
        const sourceBiomeOffset = mask & 4 /* BiomeWeights */ ? deltaOffset * 4 : baseIndex * 4;
        const sourceBiome = mask & 4 /* BiomeWeights */ ? chunk.delta.biomeWeights : chunk.base.biomeWeights;
        biomeWeights.set(sourceBiome.subarray(sourceBiomeOffset, sourceBiomeOffset + 4), windowIndex2 * 4);
        climate.set(chunk.base.climate.subarray(baseIndex * 2, baseIndex * 2 + 2), windowIndex2 * 2);
        vegetationDensity[windowIndex2] = mask & 8 /* VegetationDensity */ ? chunk.delta.vegetationDensity[deltaOffset] : chunk.base.vegetationDensity[baseIndex];
        vegetationProfile[windowIndex2] = mask & 16 /* VegetationProfile */ ? chunk.delta.vegetationProfile[deltaOffset] : chunk.base.vegetationProfile[baseIndex];
      }
    }
    return { substrateClass, macroHeight, biomeWeights, climate, vegetationDensity, vegetationProfile };
  }
  function nearestWrappedCoordinate(value, reference, period) {
    return value + Math.floor((reference - value) / period + 0.5) * period;
  }
  function localizePointsIfRelevant(descriptor, rawPoints, origin, expansion, sourceOrigin, allocator, acquired) {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let previousX = origin.x + SURFACE_RENDER_CHUNK_SIZE / 2;
    let previousY = origin.y + SURFACE_RENDER_CHUNK_SIZE / 2;
    for (let index2 = 0; index2 < rawPoints.length; index2 += 2) {
      let x = sourceOrigin ? sourceOrigin.x + rawPoints[index2] / HYDROLOGY_COORDINATE_SCALE : rawPoints[index2];
      let y = sourceOrigin ? sourceOrigin.y + rawPoints[index2 + 1] / HYDROLOGY_COORDINATE_SCALE : rawPoints[index2 + 1];
      if (descriptor.topology === "toroidal") {
        x = nearestWrappedCoordinate(x, previousX, descriptor.width);
        y = nearestWrappedCoordinate(y, previousY, descriptor.height);
      }
      const localX = x - origin.x;
      const localY = y - origin.y;
      minX = Math.min(minX, localX);
      minY = Math.min(minY, localY);
      maxX = Math.max(maxX, localX);
      maxY = Math.max(maxY, localY);
      previousX = x;
      previousY = y;
    }
    if (maxX + expansion < FIELD_MIN || minX - expansion > FIELD_MAX || maxY + expansion < FIELD_MIN || minY - expansion > FIELD_MAX) return void 0;
    const result = float64Array(rawPoints.length, allocator, acquired);
    previousX = origin.x + SURFACE_RENDER_CHUNK_SIZE / 2;
    previousY = origin.y + SURFACE_RENDER_CHUNK_SIZE / 2;
    for (let index2 = 0; index2 < rawPoints.length; index2 += 2) {
      let x = sourceOrigin ? sourceOrigin.x + rawPoints[index2] / HYDROLOGY_COORDINATE_SCALE : rawPoints[index2];
      let y = sourceOrigin ? sourceOrigin.y + rawPoints[index2 + 1] / HYDROLOGY_COORDINATE_SCALE : rawPoints[index2 + 1];
      if (descriptor.topology === "toroidal") {
        x = nearestWrappedCoordinate(x, previousX, descriptor.width);
        y = nearestWrappedCoordinate(y, previousY, descriptor.height);
      }
      result[index2] = x - origin.x;
      result[index2 + 1] = y - origin.y;
      previousX = x;
      previousY = y;
    }
    return result;
  }
  var FIELD_MIN = surfaceLatticeTexelLocalCoordinate(0, 0).u;
  var FIELD_MAX = surfaceLatticeTexelLocalCoordinate(
    SURFACE_FIELD_TEXTURE_SIZE - 1,
    SURFACE_FIELD_TEXTURE_SIZE - 1
  ).u;
  function maximumSurfaceFeatureWidth(values) {
    let maximum = 0;
    for (const value of values) maximum = Math.max(maximum, value);
    return maximum;
  }
  function collectHydrology(snapshot, key2, allocator, acquired) {
    const origin = renderOrigin(key2);
    const deltaById = /* @__PURE__ */ new Map();
    for (const region of snapshot.hydrologyRegions) {
      for (const delta of region.featureDeltas) deltaById.set(delta.featureId, delta);
    }
    const dependencyFeatureIds = /* @__PURE__ */ new Set();
    const rivers = [];
    const lakes = [];
    for (const region of snapshot.hydrologyRegions) {
      const bodyProfiles = new Map(region.base.bodies.map((body) => [body.bodyId, body.profileIndex]));
      const regionOrigin = hydrologyRegionOrigin(region.base.key);
      for (const segment of region.base.rivers) {
        const expansion = maximumSurfaceFeatureWidth(segment.widthProfile) / (HYDROLOGY_COORDINATE_SCALE * 2) + SURFACE_INFLUENCE_RADIUS_TILES;
        const points = localizePointsIfRelevant(
          snapshot.descriptor,
          segment.controlPoints,
          origin,
          expansion,
          regionOrigin,
          allocator,
          acquired
        );
        if (!points) continue;
        const suppressor = deltaById.get(segment.riverId);
        if (suppressor) {
          dependencyFeatureIds.add(suppressor.featureId);
          releaseUnusedArray(points, allocator, acquired);
          continue;
        }
        rivers.push(Object.freeze({
          kind: "river",
          featureKey: segment.segmentId,
          bodyId: segment.riverId,
          revision: 0,
          profileIndex: bodyProfiles.get(segment.riverId) ?? segment.dischargeClass,
          controlPoints: points,
          widthProfile: copyUint8Array(segment.widthProfile, allocator, acquired),
          levelProfile: copyUint16Array(segment.levelProfile, allocator, acquired)
        }));
      }
      for (const lake of region.base.lakes) {
        const points = localizePointsIfRelevant(
          snapshot.descriptor,
          lake.boundaryPoints,
          origin,
          SURFACE_INFLUENCE_RADIUS_TILES,
          regionOrigin,
          allocator,
          acquired
        );
        if (!points) continue;
        const suppressor = deltaById.get(lake.bodyId);
        if (suppressor) {
          dependencyFeatureIds.add(suppressor.featureId);
          releaseUnusedArray(points, allocator, acquired);
          continue;
        }
        lakes.push(Object.freeze({
          kind: "lake",
          featureKey: lake.lakeId,
          bodyId: lake.bodyId,
          revision: 0,
          profileIndex: lake.profileIndex,
          boundaryPoints: points,
          level: lake.level
        }));
      }
    }
    for (const delta of deltaById.values()) {
      if (delta.kind === "tombstone") continue;
      const sourcePoints = delta.kind === "river" ? delta.controlPoints : delta.boundaryPoints;
      const expansion = delta.kind === "river" ? maximumSurfaceFeatureWidth(delta.widthProfile) / (HYDROLOGY_COORDINATE_SCALE * 2) + SURFACE_INFLUENCE_RADIUS_TILES : SURFACE_INFLUENCE_RADIUS_TILES;
      const points = localizePointsIfRelevant(
        snapshot.descriptor,
        sourcePoints,
        origin,
        expansion,
        void 0,
        allocator,
        acquired
      );
      if (!points) continue;
      dependencyFeatureIds.add(delta.featureId);
      if (delta.kind === "river") {
        rivers.push(Object.freeze({
          kind: "river",
          featureKey: delta.featureId,
          bodyId: delta.featureId,
          revision: delta.revision,
          profileIndex: Math.min(255, delta.dischargeClass),
          controlPoints: points,
          widthProfile: copyUint8Array(delta.widthProfile, allocator, acquired),
          levelProfile: copyUint16Array(delta.levelProfile, allocator, acquired)
        }));
      } else {
        lakes.push(Object.freeze({
          kind: "lake",
          featureKey: delta.featureId,
          bodyId: delta.featureId,
          revision: delta.revision,
          profileIndex: delta.profileIndex,
          boundaryPoints: points,
          level: delta.level
        }));
      }
    }
    rivers.sort((first, second) => first.featureKey.localeCompare(second.featureKey));
    lakes.sort((first, second) => first.featureKey.localeCompare(second.featureKey));
    return Object.freeze({
      rivers: Object.freeze(rivers),
      lakes: Object.freeze(lakes),
      dependencyFeatureIds
    });
  }
  function assertValidBounds(value) {
    if (!value || typeof value !== "object" || Object.getOwnPropertyNames(value).some((name) => name !== "minX" && name !== "minY" && name !== "maxXExclusive" && name !== "maxYExclusive") || !Number.isInteger(value.minX) || !Number.isInteger(value.minY) || !Number.isInteger(value.maxXExclusive) || !Number.isInteger(value.maxYExclusive) || value.minX < 0 || value.minY < 0 || value.maxXExclusive > SURFACE_RENDER_CHUNK_SIZE || value.maxYExclusive > SURFACE_RENDER_CHUNK_SIZE || value.minX >= value.maxXExclusive || value.minY >= value.maxYExclusive) {
      throw new RangeError("effective surface window validBounds are invalid");
    }
  }
  function assertFeatureId(name, value) {
    if (typeof value !== "string" || !FEATURE_ID_PATTERN.test(value) || value === OCEAN_BODY_ID) {
      throw new TypeError(`${name} must be a stable non-ocean feature ID`);
    }
  }
  function assertPoints(name, value, minimumPairs) {
    if (!(value instanceof Float64Array) || value.length < minimumPairs * 2 || value.length % 2 !== 0) {
      throw new TypeError(`${name} must contain the required Float64 coordinate pairs`);
    }
    for (const coordinate of value) {
      if (!Number.isFinite(coordinate) || !Number.isInteger(coordinate * HYDROLOGY_COORDINATE_SCALE)) {
        throw new RangeError(`${name} must use exact localized 1/${HYDROLOGY_COORDINATE_SCALE}-tile coordinates`);
      }
    }
  }
  function assertRiver(value) {
    if (!value || value.kind !== "river" || Object.getOwnPropertyNames(value).some((name) => ![
      "kind",
      "featureKey",
      "bodyId",
      "revision",
      "profileIndex",
      "controlPoints",
      "widthProfile",
      "levelProfile"
    ].includes(name))) throw new TypeError("effective surface river is invalid");
    assertFeatureId("surface river featureKey", value.featureKey);
    assertFeatureId("surface river bodyId", value.bodyId);
    if (!Number.isSafeInteger(value.revision) || value.revision < 0 || !Number.isInteger(value.profileIndex) || value.profileIndex < 0 || value.profileIndex > 255) {
      throw new RangeError("effective surface river metadata is invalid");
    }
    assertPoints("surface river controlPoints", value.controlPoints, 2);
    const count = value.controlPoints.length / 2;
    if (!(value.widthProfile instanceof Uint8Array) || value.widthProfile.length !== count || value.widthProfile.some((width) => width === 0) || !(value.levelProfile instanceof Uint16Array) || value.levelProfile.length !== count) {
      throw new TypeError("effective surface river profiles are invalid");
    }
    for (let index2 = 1; index2 < value.levelProfile.length; index2 += 1) {
      if (value.levelProfile[index2] > value.levelProfile[index2 - 1]) {
        throw new TypeError("effective surface river level must not rise downstream");
      }
    }
  }
  function assertLake(value) {
    if (!value || value.kind !== "lake" || Object.getOwnPropertyNames(value).some((name) => ![
      "kind",
      "featureKey",
      "bodyId",
      "revision",
      "profileIndex",
      "boundaryPoints",
      "level"
    ].includes(name))) throw new TypeError("effective surface lake is invalid");
    assertFeatureId("surface lake featureKey", value.featureKey);
    assertFeatureId("surface lake bodyId", value.bodyId);
    if (!Number.isSafeInteger(value.revision) || value.revision < 0 || !Number.isInteger(value.profileIndex) || value.profileIndex < 0 || value.profileIndex > 255 || !Number.isInteger(value.level) || value.level < 0 || value.level > 65535) {
      throw new RangeError("effective surface lake metadata is invalid");
    }
    assertPoints("surface lake boundaryPoints", value.boundaryPoints, 3);
  }
  function assertTransferableEffectiveWindow(value) {
    if (!value || typeof value !== "object") throw new TypeError("effective surface window must be an object");
    const window2 = value;
    const allowed = /* @__PURE__ */ new Set([
      "worldIdentity",
      "effectiveRevision",
      "key",
      "dependencyKey",
      "validBounds",
      "substrateClass",
      "macroHeight",
      "biomeWeights",
      "climate",
      "vegetationDensity",
      "vegetationProfile",
      "rivers",
      "lakes"
    ]);
    if (Object.getOwnPropertyNames(window2).some((name) => !allowed.has(name)) || typeof window2.worldIdentity !== "string" || window2.worldIdentity.length === 0 || !Number.isSafeInteger(window2.effectiveRevision) || window2.effectiveRevision < 0 || !window2.key || Object.getOwnPropertyNames(window2.key).some((name) => name !== "chunkX" && name !== "chunkY") || !Number.isSafeInteger(window2.key.chunkX) || !Number.isSafeInteger(window2.key.chunkY) || window2.dependencyKey.worldIdentity !== window2.worldIdentity || window2.dependencyKey.renderKey.chunkX !== window2.key.chunkX || window2.dependencyKey.renderKey.chunkY !== window2.key.chunkY) {
      throw new TypeError("effective surface window identity is invalid");
    }
    assertSurfaceDependencyKey(window2.dependencyKey);
    assertValidBounds(window2.validBounds);
    const count = SURFACE_EFFECTIVE_WINDOW_SIZE * SURFACE_EFFECTIVE_WINDOW_SIZE;
    if (!(window2.substrateClass instanceof Uint8Array) || window2.substrateClass.length !== count || !(window2.macroHeight instanceof Uint16Array) || window2.macroHeight.length !== count || !(window2.biomeWeights instanceof Uint8Array) || window2.biomeWeights.length !== count * 4 || !(window2.climate instanceof Uint8Array) || window2.climate.length !== count * 2 || !(window2.vegetationDensity instanceof Uint8Array) || window2.vegetationDensity.length !== count || !(window2.vegetationProfile instanceof Uint8Array) || window2.vegetationProfile.length !== count || !Array.isArray(window2.rivers) || !Array.isArray(window2.lakes)) {
      throw new TypeError("effective surface window column lengths are invalid");
    }
    for (let index2 = 0; index2 < count; index2 += 1) {
      const biomeOffset = index2 * 4;
      if (window2.substrateClass[index2] >= WORLD_SUBSTRATE_CATALOG.length || window2.vegetationProfile[index2] >= WORLD_VEGETATION_PROFILE_CATALOG.length || window2.biomeWeights[biomeOffset] + window2.biomeWeights[biomeOffset + 1] + window2.biomeWeights[biomeOffset + 2] + window2.biomeWeights[biomeOffset + 3] !== 255) {
        throw new TypeError("effective surface window semantic values are invalid");
      }
    }
    for (const river of window2.rivers) assertRiver(river);
    for (const lake of window2.lakes) assertLake(lake);
    const featureRevisions = new Map(window2.dependencyKey.hydrologyRegions.flatMap((region) => region.features.map((feature) => [feature.featureId, feature.revision])));
    for (const feature of [...window2.rivers, ...window2.lakes]) {
      if (feature.revision > 0 && featureRevisions.get(feature.bodyId) !== feature.revision) {
        throw new TypeError("effective surface feature revision is missing from the dependency key");
      }
    }
    for (let index2 = 1; index2 < window2.rivers.length; index2 += 1) {
      if (window2.rivers[index2 - 1].featureKey.localeCompare(window2.rivers[index2].featureKey) >= 0) {
        throw new TypeError("effective surface rivers must be strictly ordered");
      }
    }
    for (let index2 = 1; index2 < window2.lakes.length; index2 += 1) {
      if (window2.lakes[index2 - 1].featureKey.localeCompare(window2.lakes[index2].featureKey) >= 0) {
        throw new TypeError("effective surface lakes must be strictly ordered");
      }
    }
  }
  function createTransferableEffectiveWindow(snapshot, renderKey, options = {}) {
    if (!options || typeof options !== "object" || Object.getOwnPropertyNames(options).some((name) => name !== "bufferAllocator") || options.bufferAllocator !== void 0 && (typeof options.bufferAllocator.acquire !== "function" || typeof options.bufferAllocator.release !== "function")) {
      throw new TypeError("effective surface window options are invalid");
    }
    const acquired = [];
    try {
      const key2 = canonicalizeRenderChunkKey(snapshot.descriptor, renderKey);
      assertExactDependencies(snapshot, key2);
      const semantic = copySemanticWindow(snapshot, key2, options.bufferAllocator, acquired);
      const hydrology = collectHydrology(snapshot, key2, options.bufferAllocator, acquired);
      const binding = createSurfaceDependencyBinding(snapshot, key2, {
        hydrologyFeatureIds: hydrology.dependencyFeatureIds
      });
      const window2 = Object.freeze({
        worldIdentity: snapshot.worldIdentity,
        effectiveRevision: snapshot.effectiveRevision,
        key: key2,
        dependencyKey: binding.dependencyKey,
        validBounds: validCoreBounds(snapshot.descriptor, key2),
        ...semantic,
        rivers: hydrology.rivers,
        lakes: hydrology.lakes
      });
      assertWindowWithoutDescriptor(window2);
      return window2;
    } catch (reason) {
      if (acquired.length > 0) options.bufferAllocator?.release(acquired);
      throw reason;
    }
  }
  function assertWindowWithoutDescriptor(window2) {
    assertValidBounds(window2.validBounds);
    const count = SURFACE_EFFECTIVE_WINDOW_SIZE * SURFACE_EFFECTIVE_WINDOW_SIZE;
    if (window2.substrateClass.length !== count || window2.macroHeight.length !== count || window2.biomeWeights.length !== count * 4 || window2.climate.length !== count * 2 || window2.vegetationDensity.length !== count || window2.vegetationProfile.length !== count) {
      throw new TypeError("effective surface window has inconsistent semantic columns");
    }
    for (const river of window2.rivers) assertRiver(river);
    for (const lake of window2.lakes) assertLake(lake);
  }
  function effectiveSurfaceWindowTransferables(window2) {
    assertWindowWithoutDescriptor(window2);
    const candidates = [
      window2.substrateClass.buffer,
      window2.macroHeight.buffer,
      window2.biomeWeights.buffer,
      window2.climate.buffer,
      window2.vegetationDensity.buffer,
      window2.vegetationProfile.buffer
    ];
    for (const river of window2.rivers) {
      candidates.push(river.controlPoints.buffer, river.widthProfile.buffer, river.levelProfile.buffer);
    }
    for (const lake of window2.lakes) candidates.push(lake.boundaryPoints.buffer);
    if (candidates.some((buffer) => !(buffer instanceof ArrayBuffer))) {
      throw new TypeError("effective surface window buffers must be transferable ArrayBuffers");
    }
    const buffers = candidates;
    if (new Set(buffers).size !== buffers.length) {
      throw new TypeError("effective surface window must own distinct transferable buffers");
    }
    return Object.freeze(buffers);
  }

  // src/world/semantic/HydrologyRegion.ts
  var HYDROLOGY_MAX_REGION_RIVERS = 512;
  var HYDROLOGY_MAX_REGION_PORTS = 128;
  var HYDROLOGY_MAX_REGION_LAKES = 64;
  var HYDROLOGY_MAX_REGION_MOUTHS = 64;
  var HYDROLOGY_MAX_REGION_BODIES = 255;
  var HYDROLOGY_MAX_REGION_CONTROL_POINTS = 2048;
  function assertId(name, value) {
    if (typeof value !== "string" || !/^[a-z][a-z0-9-]*:[a-f0-9]{32}$|^hydrology:ocean:v1$/.test(value)) {
      throw new TypeError(`${name} must be a stable hydrology ID`);
    }
  }
  function assertUint162(name, value) {
    if (!Number.isInteger(value) || value < 0 || value > 65535) {
      throw new RangeError(`${name} must be a Uint16 value`);
    }
  }
  function assertUint82(name, value) {
    if (!Number.isInteger(value) || value < 0 || value > 255) {
      throw new RangeError(`${name} must be a Uint8 value`);
    }
  }
  function assertQuantizedCoordinate(name, value) {
    if (!Number.isInteger(value) || value < 0 || value > HYDROLOGY_REGION_SIZE * HYDROLOGY_COORDINATE_SCALE) {
      throw new RangeError(`${name} lies outside the hydrology region coordinate domain`);
    }
  }
  function assertEndpoint(value) {
    if (!value || !["source", "confluence", "boundary", "mouth"].includes(value.kind) || typeof value.connectionId !== "string" || Object.getOwnPropertyNames(value).some((name) => name !== "kind" && name !== "connectionId")) {
      throw new TypeError("river segment contains an invalid endpoint");
    }
  }
  function assertProfileArrays(segment) {
    if (!(segment.controlPoints instanceof Int16Array) || segment.controlPoints.length < 4 || segment.controlPoints.length % 2 !== 0) {
      throw new TypeError("river controlPoints must contain at least two Int16 coordinate pairs");
    }
    const pointCount = segment.controlPoints.length / 2;
    if (!(segment.widthProfile instanceof Uint8Array) || segment.widthProfile.length !== pointCount || !(segment.levelProfile instanceof Uint16Array) || segment.levelProfile.length !== pointCount) {
      throw new TypeError("river profiles must contain one value per control point");
    }
    for (let index2 = 0; index2 < segment.controlPoints.length; index2 += 2) {
      assertQuantizedCoordinate("river x", segment.controlPoints[index2]);
      assertQuantizedCoordinate("river y", segment.controlPoints[index2 + 1]);
    }
    for (let index2 = 1; index2 < segment.levelProfile.length; index2 += 1) {
      if (segment.levelProfile[index2] > segment.levelProfile[index2 - 1]) {
        throw new TypeError("river level profile must not rise downstream");
      }
    }
    if (segment.widthProfile.some((width) => width === 0)) {
      throw new TypeError("river width profile must remain positive");
    }
  }
  function assertHydrologyRegion(value) {
    if (!value || typeof value !== "object") throw new TypeError("hydrology region must be an object");
    const region = value;
    const allowed = /* @__PURE__ */ new Set([
      "key",
      "revision",
      "validBounds",
      "boundaryPorts",
      "rivers",
      "lakes",
      "mouths",
      "bodies"
    ]);
    if (Object.getOwnPropertyNames(region).some((name) => !allowed.has(name))) {
      throw new TypeError("hydrology region contains unknown or derived fields");
    }
    assertHydrologyRegionKey(region.key);
    if (region.revision !== HYDROLOGY_REGION_REVISION) {
      throw new TypeError(`base hydrology region revision must be ${HYDROLOGY_REGION_REVISION}`);
    }
    assertHydrologyRegionLocalBounds(region.validBounds);
    if (!Array.isArray(region.boundaryPorts) || region.boundaryPorts.length > HYDROLOGY_MAX_REGION_PORTS || !Array.isArray(region.rivers) || region.rivers.length > HYDROLOGY_MAX_REGION_RIVERS || !Array.isArray(region.lakes) || region.lakes.length > HYDROLOGY_MAX_REGION_LAKES || !Array.isArray(region.mouths) || region.mouths.length > HYDROLOGY_MAX_REGION_MOUTHS || !Array.isArray(region.bodies) || region.bodies.length > HYDROLOGY_MAX_REGION_BODIES) {
      throw new RangeError("hydrology region exceeds a frozen feature budget");
    }
    const bodies = /* @__PURE__ */ new Map();
    for (const body of region.bodies) {
      assertId("hydrology bodyId", body?.bodyId);
      if (bodies.has(body.bodyId) || !["ocean", "lake", "river"].includes(body.kind)) {
        throw new TypeError("hydrology region contains a duplicate or invalid body");
      }
      assertUint82("hydrology body profileIndex", body.profileIndex);
      if (body.kind === "ocean" !== (body.bodyId === OCEAN_BODY_ID)) {
        throw new TypeError("reserved ocean body identity is inconsistent");
      }
      bodies.set(body.bodyId, body);
    }
    const portIds = /* @__PURE__ */ new Set();
    const portConnections = /* @__PURE__ */ new Map();
    const portConnectionCounts = /* @__PURE__ */ new Map();
    for (const port of region.boundaryPorts) {
      assertId("hydrology portId", port?.portId);
      assertId("hydrology port connectionId", port.connectionId);
      assertId("hydrology port edgeId", port.edgeId);
      assertId("hydrology port riverId", port.riverId);
      assertId("hydrology port bodyId", port.bodyId);
      if (portIds.has(port.portId) || !["west", "east", "north", "south"].includes(port.side) || port.flow !== "in" && port.flow !== "out") {
        throw new TypeError("hydrology region contains a duplicate or invalid boundary port");
      }
      assertQuantizedCoordinate("hydrology port x", port.x);
      assertQuantizedCoordinate("hydrology port y", port.y);
      if (port.side === "west" && port.x !== region.validBounds.minX * HYDROLOGY_COORDINATE_SCALE || port.side === "east" && port.x !== region.validBounds.maxXExclusive * HYDROLOGY_COORDINATE_SCALE || port.side === "north" && port.y !== region.validBounds.minY * HYDROLOGY_COORDINATE_SCALE || port.side === "south" && port.y !== region.validBounds.maxYExclusive * HYDROLOGY_COORDINATE_SCALE) {
        throw new TypeError("hydrology port does not lie on its declared region boundary");
      }
      if (!Number.isInteger(port.flowX) || port.flowX < -127 || port.flowX > 127 || !Number.isInteger(port.flowY) || port.flowY < -127 || port.flowY > 127) {
        throw new RangeError("hydrology port flow must use signed normalized bytes");
      }
      assertUint82("hydrology port width", port.width);
      assertUint162("hydrology port level", port.level);
      if (!Number.isInteger(port.dischargeClass) || port.dischargeClass < 0 || port.dischargeClass > HYDROLOGY_MAX_DISCHARGE_CLASS) {
        throw new RangeError("hydrology port discharge class is invalid");
      }
      const riverBody = bodies.get(port.riverId);
      if (!riverBody || riverBody.kind !== "river" || port.bodyId !== port.riverId) {
        throw new TypeError("hydrology port does not reference its river body");
      }
      const previous = portConnections.get(port.connectionId);
      if (previous && (previous.edgeId !== port.edgeId || previous.riverId !== port.riverId || previous.level !== port.level || previous.width !== port.width || previous.dischargeClass !== port.dischargeClass || previous.flow === port.flow || previous.flowX !== port.flowX || previous.flowY !== port.flowY)) {
        throw new TypeError("matching hydrology ports disagree on their connection contract");
      }
      portConnections.set(port.connectionId, port);
      portConnectionCounts.set(port.connectionId, (portConnectionCounts.get(port.connectionId) ?? 0) + 1);
      portIds.add(port.portId);
    }
    const segmentIds = /* @__PURE__ */ new Set();
    const boundaryEndpointCounts = /* @__PURE__ */ new Map();
    const mouthEndpoints = /* @__PURE__ */ new Map();
    let controlPointCount = 0;
    for (const segment of region.rivers) {
      assertId("riverId", segment?.riverId);
      assertId("river segmentId", segment.segmentId);
      assertId("river edgeId", segment.edgeId);
      if (segmentIds.has(segment.segmentId) || bodies.get(segment.riverId)?.kind !== "river" || !Number.isInteger(segment.dischargeClass) || segment.dischargeClass < 0 || segment.dischargeClass > HYDROLOGY_MAX_DISCHARGE_CLASS) {
        throw new TypeError("hydrology region contains a duplicate or invalid river segment");
      }
      assertProfileArrays(segment);
      assertEndpoint(segment.entry);
      assertEndpoint(segment.exit);
      if (segment.entry.kind === "mouth" || segment.exit.kind === "source") {
        throw new TypeError("river segment endpoint direction is topologically invalid");
      }
      if (segment.entry.kind === "boundary" && !portConnections.has(segment.entry.connectionId) || segment.exit.kind === "boundary" && !portConnections.has(segment.exit.connectionId)) {
        throw new TypeError("river boundary endpoint does not reference a serialized port");
      }
      for (const endpoint of [segment.entry, segment.exit]) {
        if (endpoint.kind === "boundary") {
          boundaryEndpointCounts.set(
            endpoint.connectionId,
            (boundaryEndpointCounts.get(endpoint.connectionId) ?? 0) + 1
          );
        }
      }
      if (segment.exit.kind === "mouth") {
        if (mouthEndpoints.has(segment.exit.connectionId)) {
          throw new TypeError("multiple river segments claim the same mouth endpoint");
        }
        mouthEndpoints.set(segment.exit.connectionId, {
          riverId: segment.riverId,
          x: segment.controlPoints[segment.controlPoints.length - 2],
          y: segment.controlPoints[segment.controlPoints.length - 1],
          width: segment.widthProfile[segment.widthProfile.length - 1],
          level: segment.levelProfile[segment.levelProfile.length - 1]
        });
      }
      controlPointCount += segment.controlPoints.length / 2;
      segmentIds.add(segment.segmentId);
    }
    if (controlPointCount > HYDROLOGY_MAX_REGION_CONTROL_POINTS) {
      throw new RangeError("hydrology region exceeds the frozen control-point budget");
    }
    for (const [connectionId, portCount] of portConnectionCounts) {
      if (boundaryEndpointCounts.get(connectionId) !== portCount) {
        throw new TypeError("hydrology boundary ports and segment endpoints are not one-to-one");
      }
    }
    const lakeIds = /* @__PURE__ */ new Set();
    for (const lake of region.lakes) {
      assertId("lakeId", lake?.lakeId);
      assertId("lake bodyId", lake.bodyId);
      if (lakeIds.has(lake.lakeId) || bodies.get(lake.bodyId)?.kind !== "lake" || !(lake.boundaryPoints instanceof Int16Array) || lake.boundaryPoints.length < 6 || lake.boundaryPoints.length % 2 !== 0) {
        throw new TypeError("hydrology region contains a duplicate or invalid lake");
      }
      for (let index2 = 0; index2 < lake.boundaryPoints.length; index2 += 2) {
        assertQuantizedCoordinate("lake x", lake.boundaryPoints[index2]);
        assertQuantizedCoordinate("lake y", lake.boundaryPoints[index2 + 1]);
      }
      assertUint162("lake level", lake.level);
      assertUint82("lake profileIndex", lake.profileIndex);
      lakeIds.add(lake.lakeId);
    }
    const mouthIds = /* @__PURE__ */ new Set();
    for (const mouth of region.mouths) {
      assertId("river mouthId", mouth?.mouthId);
      assertId("river mouth riverId", mouth.riverId);
      assertId("river mouth targetBodyId", mouth.targetBodyId);
      if (mouthIds.has(mouth.mouthId) || bodies.get(mouth.riverId)?.kind !== "river" || !bodies.has(mouth.targetBodyId) || mouth.targetBodyId === mouth.riverId) {
        throw new TypeError("hydrology region contains a duplicate or invalid river mouth");
      }
      assertQuantizedCoordinate("river mouth x", mouth.x);
      assertQuantizedCoordinate("river mouth y", mouth.y);
      assertUint82("river mouth width", mouth.width);
      assertUint162("river mouth level", mouth.level);
      const endpoint = mouthEndpoints.get(mouth.mouthId);
      if (!endpoint || endpoint.riverId !== mouth.riverId || endpoint.x !== mouth.x || endpoint.y !== mouth.y || endpoint.width !== mouth.width || endpoint.level !== mouth.level) {
        throw new TypeError("river mouth does not match its terminal segment endpoint");
      }
      mouthIds.add(mouth.mouthId);
    }
    if (mouthIds.size !== mouthEndpoints.size) {
      throw new TypeError("hydrology region contains a mouth endpoint without a mouth feature");
    }
  }
  function assertMatchingHydrologyPorts(first, second) {
    if (!first || !second || first.portId === second.portId || first.connectionId !== second.connectionId || first.edgeId !== second.edgeId || first.riverId !== second.riverId || first.bodyId !== second.bodyId || first.width !== second.width || first.level !== second.level || first.dischargeClass !== second.dischargeClass || first.flowX !== second.flowX || first.flowY !== second.flowY || first.flow === second.flow) {
      throw new TypeError("hydrology boundary ports do not form one matching graph crossing");
    }
  }
  function hydrologyRegionTransferables(region) {
    assertHydrologyRegion(region);
    const buffers = /* @__PURE__ */ new Set();
    for (const river of region.rivers) {
      for (const array of [river.controlPoints, river.widthProfile, river.levelProfile]) {
        if (!(array.buffer instanceof ArrayBuffer)) {
          throw new TypeError("hydrology river arrays must use transferable ArrayBuffer storage");
        }
        buffers.add(array.buffer);
      }
    }
    for (const lake of region.lakes) {
      if (!(lake.boundaryPoints.buffer instanceof ArrayBuffer)) {
        throw new TypeError("hydrology lake arrays must use transferable ArrayBuffer storage");
      }
      buffers.add(lake.boundaryPoints.buffer);
    }
    return [...buffers];
  }
  function hydrologyRegionVectorBytes(region) {
    assertHydrologyRegion(region);
    let bytes = 0;
    for (const river of region.rivers) {
      bytes += river.controlPoints.byteLength + river.widthProfile.byteLength + river.levelProfile.byteLength;
    }
    for (const lake of region.lakes) bytes += lake.boundaryPoints.byteLength;
    return bytes;
  }

  // src/world/semantic/HydrologySpatialIndex.ts
  var HYDROLOGY_SPATIAL_BIN_SIZE = 16;
  function riverBounds(feature) {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let maximumWidth = 0;
    for (let index2 = 0; index2 < feature.controlPoints.length; index2 += 2) {
      minX = Math.min(minX, feature.controlPoints[index2] / HYDROLOGY_COORDINATE_SCALE);
      minY = Math.min(minY, feature.controlPoints[index2 + 1] / HYDROLOGY_COORDINATE_SCALE);
      maxX = Math.max(maxX, feature.controlPoints[index2] / HYDROLOGY_COORDINATE_SCALE);
      maxY = Math.max(maxY, feature.controlPoints[index2 + 1] / HYDROLOGY_COORDINATE_SCALE);
      maximumWidth = Math.max(maximumWidth, feature.widthProfile[index2 / 2] / HYDROLOGY_COORDINATE_SCALE);
    }
    const radius = maximumWidth / 2;
    return { minX: minX - radius, minY: minY - radius, maxXExclusive: maxX + radius, maxYExclusive: maxY + radius };
  }
  function lakeBounds(feature) {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (let index2 = 0; index2 < feature.boundaryPoints.length; index2 += 2) {
      minX = Math.min(minX, feature.boundaryPoints[index2] / HYDROLOGY_COORDINATE_SCALE);
      minY = Math.min(minY, feature.boundaryPoints[index2 + 1] / HYDROLOGY_COORDINATE_SCALE);
      maxX = Math.max(maxX, feature.boundaryPoints[index2] / HYDROLOGY_COORDINATE_SCALE);
      maxY = Math.max(maxY, feature.boundaryPoints[index2 + 1] / HYDROLOGY_COORDINATE_SCALE);
    }
    return { minX, minY, maxXExclusive: maxX, maxYExclusive: maxY };
  }
  function mouthBounds(feature) {
    const radius = feature.width / HYDROLOGY_COORDINATE_SCALE / 2;
    const x = feature.x / HYDROLOGY_COORDINATE_SCALE;
    const y = feature.y / HYDROLOGY_COORDINATE_SCALE;
    return { minX: x - radius, minY: y - radius, maxXExclusive: x + radius, maxYExclusive: y + radius };
  }
  function intersects(first, second) {
    return first.minX < second.maxXExclusive && first.maxXExclusive > second.minX && first.minY < second.maxYExclusive && first.maxYExclusive > second.minY;
  }
  function assertQueryBounds(query, valid) {
    if (!query || !Number.isFinite(query.minX) || !Number.isFinite(query.minY) || !Number.isFinite(query.maxXExclusive) || !Number.isFinite(query.maxYExclusive) || query.minX >= query.maxXExclusive || query.minY >= query.maxYExclusive || query.minX < valid.minX || query.minY < valid.minY || query.maxXExclusive > valid.maxXExclusive || query.maxYExclusive > valid.maxYExclusive) {
      throw new RangeError("hydrology spatial query bounds must lie inside region validBounds");
    }
  }
  var HydrologyRegionSpatialIndex = class {
    constructor(region) {
      this.region = region;
      assertHydrologyRegion(region);
      this.binsX = Math.ceil(region.validBounds.maxXExclusive / HYDROLOGY_SPATIAL_BIN_SIZE);
      this.binsY = Math.ceil(region.validBounds.maxYExclusive / HYDROLOGY_SPATIAL_BIN_SIZE);
      const features = [
        ...region.rivers.map((feature) => ({ kind: "river", feature })),
        ...region.lakes.map((feature) => ({ kind: "lake", feature })),
        ...region.mouths.map((feature) => ({ kind: "mouth", feature }))
      ];
      if (features.length > 65535) {
        throw new RangeError("hydrology spatial index feature count exceeds Uint16 addressing");
      }
      const bounds = features.map((candidate) => candidate.kind === "river" ? riverBounds(candidate.feature) : candidate.kind === "lake" ? lakeBounds(candidate.feature) : mouthBounds(candidate.feature));
      const bins = Array.from({ length: this.binsX * this.binsY }, () => []);
      for (let featureIndex = 0; featureIndex < features.length; featureIndex += 1) {
        const featureBounds = bounds[featureIndex];
        const minBinX = Math.max(0, Math.floor(featureBounds.minX / HYDROLOGY_SPATIAL_BIN_SIZE));
        const minBinY = Math.max(0, Math.floor(featureBounds.minY / HYDROLOGY_SPATIAL_BIN_SIZE));
        const maxBinX = Math.min(this.binsX - 1, Math.floor(featureBounds.maxXExclusive / HYDROLOGY_SPATIAL_BIN_SIZE));
        const maxBinY = Math.min(this.binsY - 1, Math.floor(featureBounds.maxYExclusive / HYDROLOGY_SPATIAL_BIN_SIZE));
        for (let binX = minBinX; binX <= maxBinX; binX += 1) {
          for (let binY = minBinY; binY <= maxBinY; binY += 1) {
            bins[binX * this.binsY + binY].push(featureIndex);
          }
        }
      }
      this.offsets = new Uint32Array(bins.length + 1);
      let entryCount = 0;
      for (let index2 = 0; index2 < bins.length; index2 += 1) {
        this.offsets[index2] = entryCount;
        entryCount += bins[index2].length;
      }
      this.offsets[bins.length] = entryCount;
      this.entries = new Uint16Array(entryCount);
      let cursor = 0;
      for (const bin of bins) for (const entry of bin) this.entries[cursor++] = entry;
      this.features = Object.freeze(features);
      this.featureBounds = Object.freeze(bounds);
      this.byteLength = this.offsets.byteLength + this.entries.byteLength;
    }
    query(query) {
      assertQueryBounds(query, this.region.validBounds);
      const minBinX = Math.floor(query.minX / HYDROLOGY_SPATIAL_BIN_SIZE);
      const minBinY = Math.floor(query.minY / HYDROLOGY_SPATIAL_BIN_SIZE);
      const maxBinX = Math.min(this.binsX - 1, Math.floor(query.maxXExclusive / HYDROLOGY_SPATIAL_BIN_SIZE));
      const maxBinY = Math.min(this.binsY - 1, Math.floor(query.maxYExclusive / HYDROLOGY_SPATIAL_BIN_SIZE));
      const matches = /* @__PURE__ */ new Set();
      for (let binX = minBinX; binX <= maxBinX; binX += 1) {
        for (let binY = minBinY; binY <= maxBinY; binY += 1) {
          const binIndex = binX * this.binsY + binY;
          for (let cursor = this.offsets[binIndex]; cursor < this.offsets[binIndex + 1]; cursor += 1) {
            const featureIndex = this.entries[cursor];
            if (intersects(query, this.featureBounds[featureIndex])) matches.add(featureIndex);
          }
        }
      }
      return Object.freeze([...matches].sort((first, second) => first - second).map((index2) => this.features[index2]));
    }
    queryTile(localX, localY, output) {
      if (!Number.isInteger(localX) || !Number.isInteger(localY) || localX < this.region.validBounds.minX || localX >= this.region.validBounds.maxXExclusive || localY < this.region.validBounds.minY || localY >= this.region.validBounds.maxYExclusive) {
        throw new RangeError("hydrology tile query must lie inside region validBounds");
      }
      if (!Array.isArray(output)) throw new TypeError("hydrology tile query output must be a reusable array");
      output.length = 0;
      const binX = Math.floor(localX / HYDROLOGY_SPATIAL_BIN_SIZE);
      const binY = Math.floor(localY / HYDROLOGY_SPATIAL_BIN_SIZE);
      const binIndex = binX * this.binsY + binY;
      const tileBounds = {
        minX: localX,
        minY: localY,
        maxXExclusive: localX + 1,
        maxYExclusive: localY + 1
      };
      for (let cursor = this.offsets[binIndex]; cursor < this.offsets[binIndex + 1]; cursor += 1) {
        const featureIndex = this.entries[cursor];
        if (intersects(tileBounds, this.featureBounds[featureIndex])) output.push(this.features[featureIndex]);
      }
    }
  };

  // src/world/semantic/DerivedHydrologyRaster.ts
  var HydrologyWaterKind = /* @__PURE__ */ ((HydrologyWaterKind2) => {
    HydrologyWaterKind2[HydrologyWaterKind2["None"] = 0] = "None";
    HydrologyWaterKind2[HydrologyWaterKind2["Ocean"] = 1] = "Ocean";
    HydrologyWaterKind2[HydrologyWaterKind2["Lake"] = 2] = "Lake";
    HydrologyWaterKind2[HydrologyWaterKind2["River"] = 3] = "River";
    return HydrologyWaterKind2;
  })(HydrologyWaterKind || {});
  function assertBounds(bounds, region) {
    if (!bounds || !Number.isInteger(bounds.minX) || !Number.isInteger(bounds.minY) || !Number.isInteger(bounds.maxXExclusive) || !Number.isInteger(bounds.maxYExclusive) || bounds.minX < region.validBounds.minX || bounds.minY < region.validBounds.minY || bounds.maxXExclusive > region.validBounds.maxXExclusive || bounds.maxYExclusive > region.validBounds.maxYExclusive || bounds.minX >= bounds.maxXExclusive || bounds.minY >= bounds.maxYExclusive) {
      throw new RangeError("derived hydrology raster bounds must lie inside region validBounds");
    }
  }
  function pointInLake(x, y, lake) {
    let inside = false;
    const points = lake.boundaryPoints;
    for (let current = 0, previous = points.length - 2; current < points.length; previous = current, current += 2) {
      const currentX = points[current];
      const currentY = points[current + 1];
      const previousX = points[previous];
      const previousY = points[previous + 1];
      const crosses = currentY > y !== previousY > y && x < (previousX - currentX) * (y - currentY) / (previousY - currentY) + currentX;
      if (crosses) inside = !inside;
    }
    return inside;
  }
  function riverHit(x, y, segment) {
    let best;
    const points = segment.controlPoints;
    for (let index2 = 0; index2 < points.length - 2; index2 += 2) {
      const startX = points[index2];
      const startY = points[index2 + 1];
      const endX = points[index2 + 2];
      const endY = points[index2 + 3];
      const dx = endX - startX;
      const dy = endY - startY;
      const lengthSquared = dx * dx + dy * dy;
      if (lengthSquared === 0) continue;
      const amount = Math.max(0, Math.min(1, ((x - startX) * dx + (y - startY) * dy) / lengthSquared));
      const nearestX = startX + dx * amount;
      const nearestY = startY + dy * amount;
      const distance = Math.hypot(x - nearestX, y - nearestY);
      const width = segment.widthProfile[index2 / 2] + (segment.widthProfile[index2 / 2 + 1] - segment.widthProfile[index2 / 2]) * amount;
      const coverage = Math.max(0, Math.min(255, Math.round((width / 2 + HYDROLOGY_COORDINATE_SCALE / 2 - distance) / HYDROLOGY_COORDINATE_SCALE * 255)));
      if (coverage === 0) continue;
      const length = Math.sqrt(lengthSquared);
      const candidate = {
        coverage,
        distance,
        level: Math.round(segment.levelProfile[index2 / 2] + (segment.levelProfile[index2 / 2 + 1] - segment.levelProfile[index2 / 2]) * amount),
        flowX: Math.round(dx / length * 127),
        flowY: Math.round(dy / length * 127),
        segment
      };
      if (!best || candidate.coverage > best.coverage || candidate.coverage === best.coverage && (candidate.segment.dischargeClass > best.segment.dischargeClass || candidate.segment.dischargeClass === best.segment.dischargeClass && candidate.segment.segmentId < best.segment.segmentId)) {
        best = candidate;
      }
    }
    return best;
  }
  function deriveHydrologyRaster(region, options) {
    assertHydrologyRegion(region);
    if (!options || typeof options !== "object") throw new TypeError("derived hydrology raster options are required");
    const bounds = options.bounds ?? region.validBounds;
    assertBounds(bounds, region);
    const width = bounds.maxXExclusive - bounds.minX;
    const height = bounds.maxYExclusive - bounds.minY;
    const tileCount = width * height;
    if (!(options.macroHeight instanceof Uint16Array) || options.macroHeight.length !== tileCount) {
      throw new TypeError(`derived hydrology macroHeight must be a Uint16Array of length ${tileCount}`);
    }
    const spatialIndex = options.spatialIndex ?? new HydrologyRegionSpatialIndex(region);
    if (spatialIndex.region !== region) {
      throw new TypeError("hydrology spatial index belongs to a different region snapshot");
    }
    const bodyLookup = new Map(region.bodies.map((body, index2) => [body.bodyId, index2 + 1]));
    const oceanIndex = bodyLookup.get(OCEAN_BODY_ID);
    if (!oceanIndex) throw new TypeError("hydrology region body palette does not contain the reserved ocean body");
    const coverage = new Uint8Array(tileCount);
    const kind = new Uint8Array(tileCount);
    const level = new Uint16Array(tileCount);
    const flow = new Int8Array(tileCount * 2);
    const bodyIndex = new Uint8Array(tileCount);
    const candidates = [];
    for (let localX = bounds.minX; localX < bounds.maxXExclusive; localX += 1) {
      for (let localY = bounds.minY; localY < bounds.maxYExclusive; localY += 1) {
        const rasterX = localX - bounds.minX;
        const rasterY = localY - bounds.minY;
        const index2 = rasterX * height + rasterY;
        spatialIndex.queryTile(localX, localY, candidates);
        const pointX = (localX + 0.5) * HYDROLOGY_COORDINATE_SCALE;
        const pointY = (localY + 0.5) * HYDROLOGY_COORDINATE_SCALE;
        let bestRiver;
        let bestLake;
        for (const candidate of candidates) {
          if (candidate.kind === "river") {
            const hit = riverHit(pointX, pointY, candidate.feature);
            if (hit && (!bestRiver || hit.coverage > bestRiver.coverage || hit.coverage === bestRiver.coverage && (hit.segment.dischargeClass > bestRiver.segment.dischargeClass || hit.segment.dischargeClass === bestRiver.segment.dischargeClass && hit.segment.segmentId < bestRiver.segment.segmentId))) {
              bestRiver = hit;
            }
          } else if (candidate.kind === "lake" && pointInLake(pointX, pointY, candidate.feature) && (!bestLake || candidate.feature.bodyId < bestLake.bodyId)) {
            bestLake = candidate.feature;
          }
        }
        if (bestRiver) {
          const paletteIndex = bodyLookup.get(bestRiver.segment.riverId);
          if (!paletteIndex) throw new TypeError("river raster hit has no body palette entry");
          coverage[index2] = bestRiver.coverage;
          kind[index2] = 3 /* River */;
          level[index2] = bestRiver.level;
          flow[index2 * 2] = bestRiver.flowX;
          flow[index2 * 2 + 1] = bestRiver.flowY;
          bodyIndex[index2] = paletteIndex;
        } else if (bestLake) {
          const paletteIndex = bodyLookup.get(bestLake.bodyId);
          if (!paletteIndex) throw new TypeError("lake raster hit has no body palette entry");
          coverage[index2] = 255;
          kind[index2] = 2 /* Lake */;
          level[index2] = bestLake.level;
          bodyIndex[index2] = paletteIndex;
        } else if (options.macroHeight[index2] < HYDROLOGY_SEA_LEVEL) {
          coverage[index2] = 255;
          kind[index2] = 1 /* Ocean */;
          level[index2] = HYDROLOGY_SEA_LEVEL;
          bodyIndex[index2] = oceanIndex;
        }
      }
    }
    return Object.freeze({
      bounds: Object.freeze({ ...bounds }),
      width,
      height,
      coverage,
      kind,
      level,
      flow,
      bodyIndex,
      bodies: region.bodies
    });
  }
  function derivedHydrologyRasterTransferables(raster) {
    return [
      raster.coverage.buffer,
      raster.kind.buffer,
      raster.level.buffer,
      raster.flow.buffer,
      raster.bodyIndex.buffer
    ];
  }

  // src/world/semantic/SurfaceHalfFloat.ts
  function roundToNearestEven(value) {
    const lower = Math.floor(value);
    const fraction = value - lower;
    if (fraction > 0.5 || fraction === 0.5 && lower % 2 !== 0) return lower + 1;
    return lower;
  }
  function encodeFloat16(value) {
    if (Number.isNaN(value)) return 32256;
    const sign = value < 0 || Object.is(value, -0) ? 32768 : 0;
    const magnitude = Math.abs(value);
    if (magnitude === Number.POSITIVE_INFINITY) return sign | 31744;
    if (magnitude === 0) return sign;
    if (magnitude < 2 ** -14) {
      const subnormal = roundToNearestEven(magnitude / 2 ** -24);
      return subnormal >= 1024 ? sign | 1024 : sign | subnormal;
    }
    let exponent = Math.floor(Math.log2(magnitude));
    if (exponent > 15) return sign | 31744;
    let significand = roundToNearestEven(magnitude / 2 ** (exponent - 10));
    if (significand === 2048) {
      exponent += 1;
      significand = 1024;
      if (exponent > 15) return sign | 31744;
    }
    return sign | exponent + 15 << 10 | significand - 1024;
  }
  function decodeFloat16(bits) {
    if (!Number.isInteger(bits) || bits < 0 || bits > 65535) {
      throw new RangeError("binary16 bits must be a Uint16 value");
    }
    const sign = bits & 32768 ? -1 : 1;
    const exponent = bits >>> 10 & 31;
    const fraction = bits & 1023;
    if (exponent === 0) {
      if (fraction === 0) return sign < 0 ? -0 : 0;
      return sign * fraction * 2 ** -24;
    }
    if (exponent === 31) return fraction === 0 ? sign * Number.POSITIVE_INFINITY : Number.NaN;
    return sign * (1 + fraction / 1024) * 2 ** (exponent - 15);
  }
  function quantizeFloat16(value) {
    return decodeFloat16(encodeFloat16(value));
  }

  // src/world/semantic/SurfacePresentationCompiler.ts
  var CompiledVegetationSpecies = /* @__PURE__ */ ((CompiledVegetationSpecies2) => {
    CompiledVegetationSpecies2[CompiledVegetationSpecies2["Grass"] = 0] = "Grass";
    CompiledVegetationSpecies2[CompiledVegetationSpecies2["Palm"] = 1] = "Palm";
    CompiledVegetationSpecies2[CompiledVegetationSpecies2["Pinia"] = 2] = "Pinia";
    CompiledVegetationSpecies2[CompiledVegetationSpecies2["Oak"] = 3] = "Oak";
    return CompiledVegetationSpecies2;
  })(CompiledVegetationSpecies || {});
  var WATER_INTERSECTION_SCALE = 65536;
  var UINT32_SCALE = 4294967296;
  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }
  function fieldSampleIndices(localU, localV) {
    const coordinate = surfaceFieldTexelCoordinate(localU, localV);
    const x0 = clamp(Math.floor(coordinate.u), 0, SURFACE_FIELD_TEXTURE_SIZE - 2);
    const y0 = clamp(Math.floor(coordinate.v), 0, SURFACE_FIELD_TEXTURE_SIZE - 2);
    return {
      indices: [
        surfaceLatticeIndex(x0, y0),
        surfaceLatticeIndex(x0 + 1, y0),
        surfaceLatticeIndex(x0, y0 + 1),
        surfaceLatticeIndex(x0 + 1, y0 + 1)
      ],
      amountX: clamp(coordinate.u - x0, 0, 1),
      amountY: clamp(coordinate.v - y0, 0, 1)
    };
  }
  function bilinear(values, amountX, amountY) {
    const top = values[0] + (values[1] - values[0]) * amountX;
    const bottom = values[2] + (values[3] - values[2]) * amountX;
    return top + (bottom - top) * amountY;
  }
  function sampleField(field2, channel, localU, localV) {
    const sample = fieldSampleIndices(localU, localV);
    const values = sample.indices.map((index2) => channel === "coverage" ? field2.waterCoverage[index2] : decodeFloat16(channel === "ground" ? field2.groundHeight[index2] : field2.shorelineDistance[index2]));
    return bilinear(values, sample.amountX, sample.amountY);
  }
  function quantizedWaterVertex(builder, x, y) {
    const quantizedX = Math.round(x * WATER_INTERSECTION_SCALE);
    const quantizedY = Math.round(y * WATER_INTERSECTION_SCALE);
    const key2 = `${quantizedX},${quantizedY}`;
    const existing = builder.vertexByKey.get(key2);
    if (existing !== void 0) return existing;
    const index2 = builder.coordinates.length / 2;
    builder.coordinates.push(
      -0.5 + quantizedX / (WATER_INTERSECTION_SCALE * SURFACE_SAMPLES_PER_TILE_INTERVAL),
      -0.5 + quantizedY / (WATER_INTERSECTION_SCALE * SURFACE_SAMPLES_PER_TILE_INTERVAL)
    );
    builder.vertexByKey.set(key2, index2);
    return index2;
  }
  function waterIntersection(first, second) {
    const difference = second.coverage - first.coverage;
    const amount = difference === 0 ? 0.5 : clamp((SURFACE_WATER_COVERAGE_THRESHOLD - first.coverage) / difference, 0, 1);
    return {
      x: first.x + (second.x - first.x) * amount,
      y: first.y + (second.y - first.y) * amount,
      coverage: SURFACE_WATER_COVERAGE_THRESHOLD
    };
  }
  function clipTriangleToWater(corners) {
    const output = [];
    for (let index2 = 0; index2 < corners.length; index2 += 1) {
      const current = corners[index2];
      const next = corners[(index2 + 1) % corners.length];
      const currentInside = current.coverage >= SURFACE_WATER_COVERAGE_THRESHOLD;
      const nextInside = next.coverage >= SURFACE_WATER_COVERAGE_THRESHOLD;
      if (currentInside) output.push(current);
      if (currentInside !== nextInside) output.push(waterIntersection(current, next));
    }
    return output;
  }
  function addWaterPolygon(builder, polygon) {
    if (polygon.length < 3) return;
    const first = quantizedWaterVertex(builder, polygon[0].x, polygon[0].y);
    for (let index2 = 1; index2 < polygon.length - 1; index2 += 1) {
      const second = quantizedWaterVertex(builder, polygon[index2].x, polygon[index2].y);
      const third = quantizedWaterVertex(builder, polygon[index2 + 1].x, polygon[index2 + 1].y);
      if (first !== second && second !== third && first !== third) {
        builder.indices.push(first, second, third);
      }
    }
  }
  function coverageAtGridPoint(field2, x, y) {
    return sampleField(
      field2,
      "coverage",
      -0.5 + x / SURFACE_SAMPLES_PER_TILE_INTERVAL,
      -0.5 + y / SURFACE_SAMPLES_PER_TILE_INTERVAL
    );
  }
  function compileCoverageMesh(field2) {
    const builder = { coordinates: [], indices: [], vertexByKey: /* @__PURE__ */ new Map() };
    const intervals = SURFACE_RENDER_CHUNK_SIZE * SURFACE_SAMPLES_PER_TILE_INTERVAL;
    const row = Array.from({ length: intervals + 1 }, () => 0);
    const nextRow = Array.from({ length: intervals + 1 }, () => 0);
    for (let y = 0; y <= intervals; y += 1) row[y] = coverageAtGridPoint(field2, 0, y);
    for (let x = 0; x < intervals; x += 1) {
      for (let y = 0; y <= intervals; y += 1) nextRow[y] = coverageAtGridPoint(field2, x + 1, y);
      for (let y = 0; y < intervals; y += 1) {
        const topLeft = { x, y, coverage: row[y] };
        const bottomLeft = { x, y: y + 1, coverage: row[y + 1] };
        const topRight = { x: x + 1, y, coverage: nextRow[y] };
        const bottomRight = { x: x + 1, y: y + 1, coverage: nextRow[y + 1] };
        addWaterPolygon(builder, clipTriangleToWater([topLeft, bottomLeft, bottomRight]));
        addWaterPolygon(builder, clipTriangleToWater([topLeft, bottomRight, topRight]));
      }
      for (let y = 0; y <= intervals; y += 1) row[y] = nextRow[y];
    }
    if (builder.coordinates.length / 2 > 65535) {
      throw new RangeError("compiled water coverage mesh exceeds Uint16 vertex addressing");
    }
    return Object.freeze({
      surfaceUv: new Float32Array(builder.coordinates),
      indices: new Uint16Array(builder.indices)
    });
  }
  function maximumRiverWidth(river) {
    let maximum = 0;
    for (const width of river.widthProfile) maximum = Math.max(maximum, width);
    return maximum;
  }
  function riverPointWidth(river, index2) {
    return river.widthProfile[index2] / HYDROLOGY_COORDINATE_SCALE * Math.sqrt(3) / 2;
  }
  function compileSweepMesh(rivers) {
    const builder = { coordinates: [], indices: [], vertexByKey: /* @__PURE__ */ new Map() };
    const featureKeys = [];
    for (const river of rivers) {
      if (maximumRiverWidth(river) > SURFACE_NARROW_RIVER_MAX_WIDTH_QUANTIZED) continue;
      featureKeys.push(river.featureKey);
      const pointCount = river.controlPoints.length / 2;
      const left = [];
      const right = [];
      for (let index2 = 0; index2 < pointCount; index2 += 1) {
        const current = surfaceToWorld(
          river.controlPoints[index2 * 2],
          river.controlPoints[index2 * 2 + 1]
        );
        const previous = surfaceToWorld(
          river.controlPoints[Math.max(0, index2 - 1) * 2],
          river.controlPoints[Math.max(0, index2 - 1) * 2 + 1]
        );
        const next = surfaceToWorld(
          river.controlPoints[Math.min(pointCount - 1, index2 + 1) * 2],
          river.controlPoints[Math.min(pointCount - 1, index2 + 1) * 2 + 1]
        );
        let tangentX = next.x - previous.x;
        let tangentZ = next.z - previous.z;
        const length = Math.hypot(tangentX, tangentZ);
        if (!(length > 0)) throw new TypeError("narrow river sweep contains a zero-length join");
        tangentX /= length;
        tangentZ /= length;
        const halfWidth = riverPointWidth(river, index2);
        const leftSurface = worldToSurface(
          current.x - tangentZ * halfWidth,
          current.z + tangentX * halfWidth
        );
        const rightSurface = worldToSurface(
          current.x + tangentZ * halfWidth,
          current.z - tangentX * halfWidth
        );
        left.push(quantizedWaterVertex(
          builder,
          (leftSurface.u + 0.5) * SURFACE_SAMPLES_PER_TILE_INTERVAL,
          (leftSurface.v + 0.5) * SURFACE_SAMPLES_PER_TILE_INTERVAL
        ));
        right.push(quantizedWaterVertex(
          builder,
          (rightSurface.u + 0.5) * SURFACE_SAMPLES_PER_TILE_INTERVAL,
          (rightSurface.v + 0.5) * SURFACE_SAMPLES_PER_TILE_INTERVAL
        ));
      }
      for (let index2 = 0; index2 < pointCount - 1; index2 += 1) {
        if (left[index2] === right[index2] || left[index2 + 1] === right[index2 + 1]) continue;
        builder.indices.push(
          left[index2],
          right[index2],
          right[index2 + 1],
          left[index2],
          right[index2 + 1],
          left[index2 + 1]
        );
      }
    }
    if (builder.coordinates.length / 2 > 65535) {
      throw new RangeError("compiled narrow river sweep exceeds Uint16 vertex addressing");
    }
    return Object.freeze({
      mesh: Object.freeze({
        surfaceUv: new Float32Array(builder.coordinates),
        indices: new Uint16Array(builder.indices)
      }),
      featureKeys: Object.freeze(featureKeys)
    });
  }
  function coreCoverageState(field2) {
    const intervals = SURFACE_RENDER_CHUNK_SIZE * SURFACE_SAMPLES_PER_TILE_INTERVAL;
    let any = false;
    let full = true;
    for (let x = 0; x <= intervals; x += 1) {
      for (let y = 0; y <= intervals; y += 1) {
        const coverage = coverageAtGridPoint(field2, x, y);
        if (coverage >= SURFACE_WATER_COVERAGE_THRESHOLD) any = true;
        else full = false;
      }
    }
    return { any, full };
  }
  function compileWaterGeometry(window2, field2, waterBodies) {
    const state = coreCoverageState(field2);
    if (!state.any) return Object.freeze({ kind: "none" });
    if (state.full) return Object.freeze({ kind: "full" });
    const riverByBody = /* @__PURE__ */ new Map();
    for (const river of window2.rivers) {
      const values = riverByBody.get(river.bodyId) ?? [];
      values.push(river);
      riverByBody.set(river.bodyId, values);
    }
    const narrowOnly = waterBodies.length > 0 && waterBodies.every((body) => {
      const rivers = riverByBody.get(body.bodyId);
      return body.kind === "river" && rivers?.length && rivers.every((river) => maximumRiverWidth(river) <= SURFACE_NARROW_RIVER_MAX_WIDTH_QUANTIZED);
    });
    if (narrowOnly && window2.rivers.length === 1) {
      const sweep = compileSweepMesh(window2.rivers);
      if (sweep.mesh.indices.length === 0) {
        throw new TypeError("narrow-river surface field produced no sweep geometry");
      }
      return Object.freeze({ kind: "sweep", ...sweep });
    }
    const mesh = compileCoverageMesh(field2);
    if (mesh.indices.length === 0) {
      throw new TypeError("wet surface field produced no coverage geometry");
    }
    return Object.freeze({ kind: "coverage", mesh });
  }
  function hashString(value) {
    let hash = 2166136261;
    for (let index2 = 0; index2 < value.length; index2 += 1) {
      hash ^= value.charCodeAt(index2);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }
  function mixHash(seed, value) {
    let mixed = (seed ^ value) >>> 0;
    mixed = Math.imul(mixed ^ mixed >>> 16, 2146121005);
    mixed = Math.imul(mixed ^ mixed >>> 15, 2221713035);
    return (mixed ^ mixed >>> 16) >>> 0;
  }
  function mixSafeCoordinate(seed, coordinate) {
    const magnitude = Math.abs(coordinate);
    const low = magnitude % UINT32_SCALE;
    const high = Math.floor(magnitude / UINT32_SCALE);
    let hash = mixHash(seed, low);
    hash = mixHash(hash, high);
    return mixHash(hash, coordinate < 0 ? 4294967295 : 0);
  }
  function candidateHash(worldHash, globalX, globalY, candidate) {
    let hash = mixSafeCoordinate(worldHash, globalX);
    hash = mixSafeCoordinate(hash, globalY);
    return mixHash(hash, candidate);
  }
  function unitRandom(value) {
    return value / UINT32_SCALE;
  }
  function speciesForProfile(weights, random) {
    let cursor = Math.floor(random * 255);
    for (const value of weights) {
      if (cursor < value.weight) {
        return value.species === "palm" ? 1 /* Palm */ : value.species === "pinia" ? 2 /* Pinia */ : 3 /* Oak */;
      }
      cursor -= value.weight;
    }
    return 3 /* Oak */;
  }
  function pushSeed(output, field2, window2, tileX, tileY, candidateIndex, tree, worldHash) {
    const globalX = window2.key.chunkX * SURFACE_RENDER_CHUNK_SIZE + tileX;
    const globalY = window2.key.chunkY * SURFACE_RENDER_CHUNK_SIZE + tileY;
    if (!Number.isSafeInteger(globalX) || !Number.isSafeInteger(globalY)) {
      throw new RangeError("vegetation candidate world coordinates must be safe integers");
    }
    const randomKey = candidateHash(worldHash, globalX, globalY, candidateIndex);
    const randomX = mixHash(randomKey, 2738958700);
    const randomY = mixHash(randomKey, 3355524772);
    const localU = tileX + (unitRandom(randomX) - 0.5) * 0.84;
    const localV = tileY + (unitRandom(randomY) - 0.5) * 0.84;
    const coverage = sampleField(field2, "coverage", localU, localV) / 255;
    if (coverage > 0.125) return;
    const groundHeight = sampleField(field2, "ground", localU, localV);
    const groundU = sampleField(field2, "ground", localU + 0.25, localV) - sampleField(field2, "ground", localU - 0.25, localV);
    const groundV = sampleField(field2, "ground", localU, localV + 0.25) - sampleField(field2, "ground", localU, localV - 0.25);
    const slope = Math.hypot(groundU, groundV) * 2;
    if (slope > (tree ? 0.18 : 0.35)) return;
    const shore = sampleField(field2, "shore", localU, localV);
    const shoreFactor = clamp((shore + 0.1) / 0.9, 0, 1);
    const semanticIndex = (tileX + SURFACE_INFLUENCE_RADIUS_TILES) * SURFACE_EFFECTIVE_WINDOW_SIZE + tileY + SURFACE_INFLUENCE_RADIUS_TILES;
    const density = window2.vegetationDensity[semanticIndex] / 255;
    const acceptance = density * shoreFactor * (tree ? 0.42 : 1);
    if (unitRandom(mixHash(randomKey, 2911926141)) >= acceptance) return;
    const profileIndex = window2.vegetationProfile[semanticIndex];
    const profile = WORLD_VEGETATION_PROFILE_CATALOG[profileIndex];
    if (!profile || profile.species.length === 0) return;
    output.push({
      tileIndex: tileX * SURFACE_RENDER_CHUNK_SIZE + tileY,
      candidateIndex,
      randomKey,
      localU,
      localV,
      groundHeight,
      species: tree ? speciesForProfile(profile.species, unitRandom(mixHash(randomKey, 2654435769))) : 0 /* Grass */,
      scale: 160 + (mixHash(randomKey, 1013904242) & 95),
      rotation: mixHash(randomKey, 3668340011) & 65535
    });
  }
  function compileVegetationSeeds(window2, field2) {
    const records = [];
    const worldHash = hashString(window2.worldIdentity);
    for (let tileX = window2.validBounds.minX; tileX < window2.validBounds.maxXExclusive; tileX += 1) {
      for (let tileY = window2.validBounds.minY; tileY < window2.validBounds.maxYExclusive; tileY += 1) {
        for (let candidate = 0; candidate < 8; candidate += 1) {
          pushSeed(records, field2, window2, tileX, tileY, candidate, false, worldHash);
        }
        for (let candidate = 8; candidate < 10; candidate += 1) {
          pushSeed(records, field2, window2, tileX, tileY, candidate, true, worldHash);
        }
      }
    }
    if (records.length > SURFACE_MAX_VEGETATION_SEEDS) {
      throw new RangeError("compiled surface exceeds the vegetation seed budget");
    }
    records.sort((first, second) => first.tileIndex - second.tileIndex || first.candidateIndex - second.candidateIndex);
    const count = records.length;
    const tileIndex = new Uint16Array(count);
    const candidateIndex = new Uint8Array(count);
    const randomKey = new Uint32Array(count);
    const surfaceCoordinates = new Int16Array(count * 2);
    const groundHeight = new Uint16Array(count);
    const species = new Uint8Array(count);
    const scale = new Uint8Array(count);
    const rotation = new Uint16Array(count);
    for (let index2 = 0; index2 < count; index2 += 1) {
      const record = records[index2];
      tileIndex[index2] = record.tileIndex;
      candidateIndex[index2] = record.candidateIndex;
      randomKey[index2] = record.randomKey;
      surfaceCoordinates[index2 * 2] = Math.round(record.localU * SURFACE_VEGETATION_COORDINATE_SCALE);
      surfaceCoordinates[index2 * 2 + 1] = Math.round(record.localV * SURFACE_VEGETATION_COORDINATE_SCALE);
      groundHeight[index2] = Math.max(0, Math.min(65535, Math.round(record.groundHeight * 65535)));
      species[index2] = record.species;
      scale[index2] = record.scale;
      rotation[index2] = record.rotation;
    }
    return Object.freeze({
      tileIndex,
      candidateIndex,
      randomKey,
      surfaceCoordinates,
      groundHeight,
      species,
      scale,
      rotation
    });
  }
  function waterGeometryByteLength(value) {
    return value.kind === "coverage" || value.kind === "sweep" ? value.mesh.surfaceUv.byteLength + value.mesh.indices.byteLength : 0;
  }
  function vegetationSeedsByteLength(value) {
    return value.tileIndex.byteLength + value.candidateIndex.byteLength + value.randomKey.byteLength + value.surfaceCoordinates.byteLength + value.groundHeight.byteLength + value.species.byteLength + value.scale.byteLength + value.rotation.byteLength;
  }
  function surfacePresentationTransferables(waterGeometry, vegetationSeeds) {
    const result = [];
    if (waterGeometry.kind === "coverage" || waterGeometry.kind === "sweep") {
      result.push(waterGeometry.mesh.surfaceUv.buffer);
      result.push(waterGeometry.mesh.indices.buffer);
    }
    result.push(
      vegetationSeeds.tileIndex.buffer,
      vegetationSeeds.candidateIndex.buffer,
      vegetationSeeds.randomKey.buffer,
      vegetationSeeds.surfaceCoordinates.buffer,
      vegetationSeeds.groundHeight.buffer,
      vegetationSeeds.species.buffer,
      vegetationSeeds.scale.buffer,
      vegetationSeeds.rotation.buffer
    );
    return Object.freeze(result);
  }

  // src/world/semantic/SurfaceCompiler.ts
  var SQRT_THREE = Math.sqrt(3);
  var TEXEL_ANTIALIAS_DISTANCE = SQRT_THREE / SURFACE_SAMPLES_PER_TILE_INTERVAL / 2;
  var SHORE_DISTANCE_LIMIT = SURFACE_INFLUENCE_RADIUS_TILES;
  var SHORE_SEARCH_TEXELS = Math.ceil(
    SHORE_DISTANCE_LIMIT / (1.5 / SURFACE_SAMPLES_PER_TILE_INTERVAL)
  ) + 2;
  var SURFACE_WORK_MARGIN_TEXELS = SHORE_SEARCH_TEXELS;
  var SURFACE_WORK_SIZE = SURFACE_FIELD_TEXTURE_SIZE + SURFACE_WORK_MARGIN_TEXELS * 2;
  var SURFACE_WORK_TEXEL_COUNT = SURFACE_WORK_SIZE * SURFACE_WORK_SIZE;
  var RIVER_SURFACE_INSET = 128 / 65535;
  var RIVER_MAX_INCISE = 3072 / 65535;
  var RIVER_MIN_BED_DEPTH = 384 / 65535;
  var RIVER_MAX_BED_DEPTH = 1280 / 65535;
  var validatedCompiledChunks = /* @__PURE__ */ new WeakSet();
  function clamp2(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }
  function windowIndex(x, y) {
    return x * SURFACE_EFFECTIVE_WINDOW_SIZE + y;
  }
  function gridIndex(x, y, size) {
    return x * size + y;
  }
  function workLocalCoordinate(x, y) {
    return {
      u: -0.5 + (x - SURFACE_WORK_MARGIN_TEXELS - SURFACE_FIELD_GUTTER_TEXELS + 0.5) / SURFACE_SAMPLES_PER_TILE_INTERVAL,
      v: -0.5 + (y - SURFACE_WORK_MARGIN_TEXELS - SURFACE_FIELD_GUTTER_TEXELS + 0.5) / SURFACE_SAMPLES_PER_TILE_INTERVAL
    };
  }
  function sampleWindowChannel(values, localU, localV, channels, channel) {
    const sampleU = clamp2(
      localU,
      -SURFACE_INFLUENCE_RADIUS_TILES,
      SURFACE_RENDER_CHUNK_SIZE + SURFACE_INFLUENCE_RADIUS_TILES - 1
    );
    const sampleV = clamp2(
      localV,
      -SURFACE_INFLUENCE_RADIUS_TILES,
      SURFACE_RENDER_CHUNK_SIZE + SURFACE_INFLUENCE_RADIUS_TILES - 1
    );
    let tileX = Math.floor(sampleU);
    let tileY = Math.floor(sampleV);
    let amountX = sampleU - tileX;
    let amountY = sampleV - tileY;
    if (tileX === SURFACE_RENDER_CHUNK_SIZE + SURFACE_INFLUENCE_RADIUS_TILES - 1) {
      tileX -= 1;
      amountX = 1;
    }
    if (tileY === SURFACE_RENDER_CHUNK_SIZE + SURFACE_INFLUENCE_RADIUS_TILES - 1) {
      tileY -= 1;
      amountY = 1;
    }
    const x0 = tileX + SURFACE_INFLUENCE_RADIUS_TILES;
    const y0 = tileY + SURFACE_INFLUENCE_RADIUS_TILES;
    const first = values[windowIndex(x0, y0) * channels + channel];
    const second = values[windowIndex(x0 + 1, y0) * channels + channel];
    const third = values[windowIndex(x0, y0 + 1) * channels + channel];
    const fourth = values[windowIndex(x0 + 1, y0 + 1) * channels + channel];
    const top = first + (second - first) * amountX;
    const bottom = third + (fourth - third) * amountX;
    return top + (bottom - top) * amountY;
  }
  function nearestWindowIndex(localU, localV) {
    const x = Math.floor(localU + 0.5) + SURFACE_INFLUENCE_RADIUS_TILES;
    const y = Math.floor(localV + 0.5) + SURFACE_INFLUENCE_RADIUS_TILES;
    if (x < 0 || y < 0 || x >= SURFACE_EFFECTIVE_WINDOW_SIZE || y >= SURFACE_EFFECTIVE_WINDOW_SIZE) {
      throw new RangeError("surface compiler nearest semantic sample exceeds the effective halo");
    }
    return windowIndex(x, y);
  }
  function preparePoints(points) {
    const result = new Float64Array(points.length);
    for (let index2 = 0; index2 < points.length; index2 += 2) {
      const world = surfaceToWorld(points[index2], points[index2 + 1]);
      result[index2] = world.x;
      result[index2 + 1] = world.z;
    }
    return result;
  }
  function prepareRivers(values) {
    return values.map((value) => Object.freeze({ ...value, worldPoints: preparePoints(value.controlPoints) }));
  }
  function prepareLakes(values) {
    return values.map((value) => Object.freeze({ ...value, worldPoints: preparePoints(value.boundaryPoints) }));
  }
  function coverageForSignedDistance(signedDistance) {
    return clamp2(Math.floor((0.5 + signedDistance / (TEXEL_ANTIALIAS_DISTANCE * 2)) * 255 + 0.5), 0, 255);
  }
  function riverCandidate(x, z, river) {
    let best;
    let bestSignedDistance = Number.NEGATIVE_INFINITY;
    for (let index2 = 0; index2 < river.worldPoints.length - 2; index2 += 2) {
      const startX = river.worldPoints[index2];
      const startZ = river.worldPoints[index2 + 1];
      const dx = river.worldPoints[index2 + 2] - startX;
      const dz = river.worldPoints[index2 + 3] - startZ;
      const lengthSquared = dx * dx + dz * dz;
      if (lengthSquared === 0) continue;
      const amount = clamp2(((x - startX) * dx + (z - startZ) * dz) / lengthSquared, 0, 1);
      const nearestX = startX + dx * amount;
      const nearestZ = startZ + dz * amount;
      const distance = Math.hypot(x - nearestX, z - nearestZ);
      const width = river.widthProfile[index2 / 2] + (river.widthProfile[index2 / 2 + 1] - river.widthProfile[index2 / 2]) * amount;
      const halfWidth = width / HYDROLOGY_COORDINATE_SCALE * SQRT_THREE / 2;
      const signedDistance = halfWidth - distance;
      if (signedDistance < bestSignedDistance) continue;
      const length = Math.sqrt(lengthSquared);
      bestSignedDistance = signedDistance;
      best = {
        coverage: coverageForSignedDistance(signedDistance),
        rank: 3,
        kind: 3 /* River */,
        bodyId: river.bodyId,
        profileIndex: river.profileIndex,
        level: (river.levelProfile[index2 / 2] + (river.levelProfile[index2 / 2 + 1] - river.levelProfile[index2 / 2]) * amount) / 65535,
        flowX: dx / length,
        flowY: dz / length,
        centerX: nearestX,
        centerZ: nearestZ,
        halfWidth
      };
    }
    return best?.coverage ? best : void 0;
  }
  function pointInPolygon(x, z, points) {
    let inside = false;
    for (let current = 0, previous = points.length - 2; current < points.length; previous = current, current += 2) {
      const currentX = points[current];
      const currentZ = points[current + 1];
      const previousX = points[previous];
      const previousZ = points[previous + 1];
      const crosses = currentZ > z !== previousZ > z && x < (previousX - currentX) * (z - currentZ) / (previousZ - currentZ) + currentX;
      if (crosses) inside = !inside;
    }
    return inside;
  }
  function polygonDistance(x, z, points) {
    let bestSquared = Number.POSITIVE_INFINITY;
    for (let current = 0, previous = points.length - 2; current < points.length; previous = current, current += 2) {
      const startX = points[previous];
      const startZ = points[previous + 1];
      const dx = points[current] - startX;
      const dz = points[current + 1] - startZ;
      const lengthSquared = dx * dx + dz * dz;
      const amount = lengthSquared === 0 ? 0 : clamp2(((x - startX) * dx + (z - startZ) * dz) / lengthSquared, 0, 1);
      const offsetX = x - (startX + dx * amount);
      const offsetZ = z - (startZ + dz * amount);
      bestSquared = Math.min(bestSquared, offsetX * offsetX + offsetZ * offsetZ);
    }
    return Math.sqrt(bestSquared);
  }
  function surfaceLakeCandidate(x, z, lake) {
    const distance = polygonDistance(x, z, lake.worldPoints);
    const signedDistance = pointInPolygon(x, z, lake.worldPoints) ? distance : -distance;
    const coverage = coverageForSignedDistance(signedDistance);
    if (coverage === 0) return void 0;
    return {
      coverage,
      rank: 4,
      kind: 2 /* Lake */,
      bodyId: lake.bodyId,
      profileIndex: lake.profileIndex,
      level: lake.level / 65535,
      flowX: 0,
      flowY: 0
    };
  }
  function candidateWins(candidate, current) {
    return !current || candidate.coverage > current.coverage || candidate.coverage === current.coverage && (candidate.rank > current.rank || candidate.rank === current.rank && candidate.bodyId < current.bodyId);
  }
  function sampleMacroGroundAtWorld(window2, worldX, worldZ) {
    const local = worldToSurface(worldX, worldZ);
    return sampleWindowChannel(window2.macroHeight, local.u, local.v, 1, 0) / 65535;
  }
  function deriveRiverSurfaceLevel(window2, localGround, candidate) {
    const centerX = candidate.centerX;
    const centerZ = candidate.centerZ;
    const halfWidth = candidate.halfWidth;
    const normalX = -candidate.flowY;
    const normalZ = candidate.flowX;
    const terrainCeiling = Math.min(
      localGround,
      sampleMacroGroundAtWorld(window2, centerX, centerZ),
      sampleMacroGroundAtWorld(window2, centerX + normalX * halfWidth, centerZ + normalZ * halfWidth),
      sampleMacroGroundAtWorld(window2, centerX - normalX * halfWidth, centerZ - normalZ * halfWidth)
    );
    return clamp2(
      candidate.level,
      Math.max(0, terrainCeiling - RIVER_MAX_INCISE),
      Math.max(0, terrainCeiling - RIVER_SURFACE_INSET)
    );
  }
  function fieldGradient(ground, worldX, worldZ, physicalX, physicalY, size) {
    const leftX = Math.max(0, physicalX - 1);
    const rightX = Math.min(size - 1, physicalX + 1);
    const topY = Math.max(0, physicalY - 1);
    const bottomY = Math.min(size - 1, physicalY + 1);
    const left = gridIndex(leftX, physicalY, size);
    const right = gridIndex(rightX, physicalY, size);
    const top = gridIndex(physicalX, topY, size);
    const bottom = gridIndex(physicalX, bottomY, size);
    const horizontalDistance = Math.hypot(worldX[right] - worldX[left], worldZ[right] - worldZ[left]);
    const verticalDistance = Math.hypot(worldX[bottom] - worldX[top], worldZ[bottom] - worldZ[top]);
    const horizontal = horizontalDistance > 0 ? (ground[right] - ground[left]) / horizontalDistance : 0;
    const vertical = verticalDistance > 0 ? (ground[bottom] - ground[top]) / verticalDistance : 0;
    return Math.hypot(horizontal, vertical);
  }
  function oceanCandidate(groundHeight, slope) {
    const seaLevel = HYDROLOGY_SEA_LEVEL / 65535;
    const difference = seaLevel - groundHeight;
    let coverage;
    if (difference === 0) coverage = 127;
    else if (slope <= 1e-9) coverage = difference > 0 ? 255 : 0;
    else coverage = coverageForSignedDistance(difference / slope);
    if (coverage === 0) return void 0;
    return {
      coverage,
      rank: 5,
      kind: 1 /* Ocean */,
      bodyId: OCEAN_BODY_ID,
      profileIndex: 0,
      level: seaLevel,
      flowX: 0,
      flowY: 0
    };
  }
  function computeShoreDistances(coverage, worldX, worldZ, size) {
    const wet = new Uint8Array(size * size);
    const boundaryByX = Array.from(
      { length: size },
      () => []
    );
    for (let index2 = 0; index2 < wet.length; index2 += 1) wet[index2] = coverage[index2] >= 128 ? 1 : 0;
    for (let x = 0; x < size; x += 1) {
      for (let y = 0; y < size; y += 1) {
        const index2 = gridIndex(x, y, size);
        let boundary = false;
        if (x > 0 && wet[gridIndex(x - 1, y, size)] !== wet[index2]) boundary = true;
        if (x + 1 < size && wet[gridIndex(x + 1, y, size)] !== wet[index2]) boundary = true;
        if (y > 0 && wet[gridIndex(x, y - 1, size)] !== wet[index2]) boundary = true;
        if (y + 1 < size && wet[gridIndex(x, y + 1, size)] !== wet[index2]) boundary = true;
        if (boundary) boundaryByX[x].push(y);
      }
    }
    const result = new Float64Array(size * size);
    for (let x = 0; x < size; x += 1) {
      for (let y = 0; y < size; y += 1) {
        const index2 = gridIndex(x, y, size);
        let bestSquared = Number.POSITIVE_INFINITY;
        const minX = Math.max(0, x - SHORE_SEARCH_TEXELS);
        const maxX = Math.min(size - 1, x + SHORE_SEARCH_TEXELS);
        for (let candidateX = minX; candidateX <= maxX; candidateX += 1) {
          for (const candidateY of boundaryByX[candidateX]) {
            if (Math.abs(candidateY - y) > SHORE_SEARCH_TEXELS) continue;
            const candidateIndex = gridIndex(candidateX, candidateY, size);
            if (wet[candidateIndex] === wet[index2]) continue;
            const dx = worldX[candidateIndex] - worldX[index2];
            const dz = worldZ[candidateIndex] - worldZ[index2];
            bestSquared = Math.min(bestSquared, dx * dx + dz * dz);
          }
        }
        const distance = Number.isFinite(bestSquared) ? Math.max(0, Math.sqrt(bestSquared) - TEXEL_ANTIALIAS_DISTANCE) : SHORE_DISTANCE_LIMIT;
        result[index2] = (wet[index2] ? -1 : 1) * Math.min(SHORE_DISTANCE_LIMIT, distance);
      }
    }
    return result;
  }
  function quantizeWeights(values) {
    const total = values.reduce((sum, value) => sum + Math.max(0, value), 0);
    if (!(total > 0)) return [255, 0, 0, 0];
    const scaled = values.map((value) => Math.max(0, value) / total * 255);
    const quantized = scaled.map(Math.floor);
    let remaining = 255 - quantized.reduce((sum, value) => sum + value, 0);
    const order = scaled.map((value, index2) => ({ index: index2, remainder: value - quantized[index2] })).sort((first, second) => second.remainder - first.remainder || first.index - second.index);
    for (let index2 = 0; index2 < remaining; index2 += 1) quantized[order[index2].index] += 1;
    return quantized;
  }
  function materialWeights(window2, localU, localV, slope, shoreDistance) {
    const values = [0, 1, 2, 3].map((channel) => sampleWindowChannel(window2.biomeWeights, localU, localV, 4, channel) / 255);
    const climateTemperature = sampleWindowChannel(window2.climate, localU, localV, 2, 0) / 255;
    const climateMoisture = sampleWindowChannel(window2.climate, localU, localV, 2, 1) / 255;
    const substrate = window2.substrateClass[nearestWindowIndex(localU, localV)];
    if (substrate < 0 || substrate >= WORLD_SUBSTRATE_CATALOG.length) {
      throw new RangeError("surface compiler encountered an invalid substrate class");
    }
    if (substrate === 0 /* Sediment */) values[1] += 0.2;
    else if (substrate === 1 /* Soil */) values[0] += 0.15;
    else if (substrate === 2 /* Sand */) values[1] += 0.45;
    else if (substrate === 3 /* Rock */) values[3] += 0.5;
    else if (substrate === 4 /* Permafrost */) values[2] += 0.5;
    const steepness = clamp2(slope * 8, 0, 1);
    const shoreInfluence = clamp2(1 - Math.abs(shoreDistance) / SHORE_DISTANCE_LIMIT, 0, 1);
    values[3] += steepness * 0.6;
    values[1] += shoreInfluence * 0.25;
    values[0] += climateMoisture * (1 - steepness) * 0.12;
    values[2] += (1 - climateTemperature) * 0.12;
    return quantizeWeights(values);
  }
  function fieldByteLength(field2) {
    return field2.groundHeight.byteLength + field2.materialWeights.byteLength + field2.waterLevel.byteLength + field2.waterDepth.byteLength + field2.shorelineDistance.byteLength + field2.flow.byteLength + field2.waterCoverage.byteLength + field2.waterKind.byteLength + field2.waterProfile.byteLength + field2.waterBodyIndex.byteLength;
  }
  function updateChecksum(hash, values) {
    const bytes = new Uint8Array(values.buffer, values.byteOffset, values.byteLength);
    for (const value of bytes) {
      hash ^= value;
      hash = Math.imul(hash, 16777619);
    }
    return hash;
  }
  function updateChecksumText(hash, value) {
    for (const character of value) {
      const code = character.charCodeAt(0);
      hash ^= code & 255;
      hash = Math.imul(hash, 16777619);
      hash ^= code >>> 8;
      hash = Math.imul(hash, 16777619);
    }
    return hash;
  }
  function surfaceChecksum(field2, bodies, waterGeometry, vegetationSeeds) {
    let hash = 2166136261;
    for (const values of [
      field2.groundHeight,
      field2.materialWeights,
      field2.waterLevel,
      field2.waterDepth,
      field2.shorelineDistance,
      field2.flow,
      field2.waterCoverage,
      field2.waterKind,
      field2.waterProfile,
      field2.waterBodyIndex
    ]) hash = updateChecksum(hash, values);
    for (const body of bodies) {
      hash = updateChecksumText(hash, `${body.bodyId}\0${body.kind}\0`);
    }
    hash = updateChecksumText(hash, `${waterGeometry.kind}\0`);
    if (waterGeometry.kind === "coverage" || waterGeometry.kind === "sweep") {
      hash = updateChecksum(hash, waterGeometry.mesh.surfaceUv);
      hash = updateChecksum(hash, waterGeometry.mesh.indices);
    }
    if (waterGeometry.kind === "sweep") {
      for (const featureKey of waterGeometry.featureKeys) {
        hash = updateChecksumText(hash, `${featureKey}\0`);
      }
    }
    for (const values of [
      vegetationSeeds.tileIndex,
      vegetationSeeds.candidateIndex,
      vegetationSeeds.randomKey,
      vegetationSeeds.surfaceCoordinates,
      vegetationSeeds.groundHeight,
      vegetationSeeds.species,
      vegetationSeeds.scale,
      vegetationSeeds.rotation
    ]) hash = updateChecksum(hash, values);
    return (hash >>> 0).toString(16).padStart(8, "0");
  }
  function compileSurfaceChunk(window2) {
    assertTransferableEffectiveWindow(window2);
    if (window2.dependencyKey.compilerRevision !== SURFACE_COMPILER_REVISION || window2.dependencyKey.compileProfileVersion !== SURFACE_COMPILE_PROFILE_VERSION) {
      throw new TypeError("effective surface window uses an unsupported compiler or profile revision");
    }
    const rivers = prepareRivers(window2.rivers);
    const lakes = prepareLakes(window2.lakes);
    const ground = new Float64Array(SURFACE_WORK_TEXEL_COUNT);
    const worldX = new Float64Array(SURFACE_WORK_TEXEL_COUNT);
    const worldZ = new Float64Array(SURFACE_WORK_TEXEL_COUNT);
    for (let physicalX = 0; physicalX < SURFACE_WORK_SIZE; physicalX += 1) {
      for (let physicalY = 0; physicalY < SURFACE_WORK_SIZE; physicalY += 1) {
        const index2 = gridIndex(physicalX, physicalY, SURFACE_WORK_SIZE);
        const local = workLocalCoordinate(physicalX, physicalY);
        const world = surfaceToWorld(local.u, local.v);
        worldX[index2] = world.x;
        worldZ[index2] = world.z;
        ground[index2] = sampleWindowChannel(window2.macroHeight, local.u, local.v, 1, 0) / 65535;
      }
    }
    const workCoverage = new Uint8Array(SURFACE_WORK_TEXEL_COUNT);
    const workWaterKind = new Uint8Array(SURFACE_WORK_TEXEL_COUNT);
    const workWaterProfile = new Uint8Array(SURFACE_WORK_TEXEL_COUNT);
    const workWaterLevel = new Float64Array(SURFACE_WORK_TEXEL_COUNT);
    const workFlow = new Float64Array(SURFACE_WORK_TEXEL_COUNT * 2);
    const workRiverBedDepth = new Float64Array(SURFACE_WORK_TEXEL_COUNT);
    const workBodyIds = new Array(SURFACE_WORK_TEXEL_COUNT);
    for (let physicalX = 0; physicalX < SURFACE_WORK_SIZE; physicalX += 1) {
      for (let physicalY = 0; physicalY < SURFACE_WORK_SIZE; physicalY += 1) {
        const index2 = gridIndex(physicalX, physicalY, SURFACE_WORK_SIZE);
        let best;
        for (const river of rivers) {
          const candidate = riverCandidate(worldX[index2], worldZ[index2], river);
          if (candidate && candidateWins(candidate, best)) best = candidate;
        }
        for (const lake of lakes) {
          const candidate = surfaceLakeCandidate(worldX[index2], worldZ[index2], lake);
          if (candidate && candidateWins(candidate, best)) best = candidate;
        }
        const ocean = oceanCandidate(
          ground[index2],
          fieldGradient(ground, worldX, worldZ, physicalX, physicalY, SURFACE_WORK_SIZE)
        );
        if (ocean && candidateWins(ocean, best)) best = ocean;
        if (!best) continue;
        let level = best.level;
        if (best.kind === 3 /* River */) {
          level = deriveRiverSurfaceLevel(window2, ground[index2], best);
          workRiverBedDepth[index2] = RIVER_MIN_BED_DEPTH + clamp2(best.halfWidth / 4, 0, 1) * (RIVER_MAX_BED_DEPTH - RIVER_MIN_BED_DEPTH);
        }
        workCoverage[index2] = best.coverage;
        workWaterKind[index2] = best.kind;
        workWaterProfile[index2] = best.profileIndex;
        workWaterLevel[index2] = level;
        workFlow[index2 * 2] = best.flowX;
        workFlow[index2 * 2 + 1] = best.flowY;
        workBodyIds[index2] = best.bodyId;
      }
    }
    for (let index2 = 0; index2 < SURFACE_WORK_TEXEL_COUNT; index2 += 1) {
      if (workWaterKind[index2] !== 3 /* River */ || workCoverage[index2] === 0) continue;
      const channelAmount = workCoverage[index2] / 255;
      const channelGround = workWaterLevel[index2] - workRiverBedDepth[index2] * channelAmount;
      ground[index2] = Math.min(ground[index2], channelGround);
    }
    const shore = computeShoreDistances(workCoverage, worldX, worldZ, SURFACE_WORK_SIZE);
    const bodyDefinitions = /* @__PURE__ */ new Map();
    for (let physicalX = 0; physicalX < SURFACE_FIELD_TEXTURE_SIZE; physicalX += 1) {
      for (let physicalY = 0; physicalY < SURFACE_FIELD_TEXTURE_SIZE; physicalY += 1) {
        const workIndex = gridIndex(
          physicalX + SURFACE_WORK_MARGIN_TEXELS,
          physicalY + SURFACE_WORK_MARGIN_TEXELS,
          SURFACE_WORK_SIZE
        );
        if (workCoverage[workIndex] === 0) continue;
        const bodyId = workBodyIds[workIndex];
        const kind = workWaterKind[workIndex] === 3 /* River */ ? "river" : workWaterKind[workIndex] === 2 /* Lake */ ? "lake" : "ocean";
        const previous = bodyDefinitions.get(bodyId);
        if (previous && previous.kind !== kind) {
          throw new TypeError("surface compiler found conflicting water body metadata");
        }
        bodyDefinitions.set(bodyId, Object.freeze({ bodyId, kind }));
      }
    }
    const waterBodies = Object.freeze([...bodyDefinitions.values()].sort((first, second) => first.bodyId.localeCompare(second.bodyId)));
    if (waterBodies.length > SURFACE_MAX_WATER_BODY_COUNT) {
      throw new RangeError("compiled surface chunk exceeds the 255-body palette budget");
    }
    const paletteById = new Map(waterBodies.map((body, index2) => [body.bodyId, index2 + 1]));
    const field2 = Object.freeze({
      groundHeight: new Uint16Array(SURFACE_FIELD_TEXEL_COUNT),
      materialWeights: new Uint8Array(SURFACE_FIELD_TEXEL_COUNT * 4),
      waterLevel: new Uint16Array(SURFACE_FIELD_TEXEL_COUNT),
      waterDepth: new Uint16Array(SURFACE_FIELD_TEXEL_COUNT),
      shorelineDistance: new Uint16Array(SURFACE_FIELD_TEXEL_COUNT),
      flow: new Int8Array(SURFACE_FIELD_TEXEL_COUNT * 2),
      waterCoverage: new Uint8Array(SURFACE_FIELD_TEXEL_COUNT),
      waterKind: new Uint8Array(SURFACE_FIELD_TEXEL_COUNT),
      waterProfile: new Uint8Array(SURFACE_FIELD_TEXEL_COUNT),
      waterBodyIndex: new Uint8Array(SURFACE_FIELD_TEXEL_COUNT)
    });
    let minGroundHeight = Number.POSITIVE_INFINITY;
    let maxGroundHeight = Number.NEGATIVE_INFINITY;
    let minWaterLevel = Number.POSITIVE_INFINITY;
    let maxWaterLevel = Number.NEGATIVE_INFINITY;
    let hasWater = false;
    for (let physicalX = 0; physicalX < SURFACE_FIELD_TEXTURE_SIZE; physicalX += 1) {
      for (let physicalY = 0; physicalY < SURFACE_FIELD_TEXTURE_SIZE; physicalY += 1) {
        const index2 = surfaceLatticeIndex(physicalX, physicalY);
        const workX = physicalX + SURFACE_WORK_MARGIN_TEXELS;
        const workY = physicalY + SURFACE_WORK_MARGIN_TEXELS;
        const workIndex = gridIndex(workX, workY, SURFACE_WORK_SIZE);
        const local = surfaceLatticeTexelLocalCoordinate(physicalX, physicalY);
        field2.groundHeight[index2] = encodeFloat16(ground[workIndex]);
        field2.shorelineDistance[index2] = encodeFloat16(shore[workIndex]);
        field2.waterCoverage[index2] = workCoverage[workIndex];
        field2.waterKind[index2] = workWaterKind[workIndex];
        field2.waterProfile[index2] = workWaterProfile[workIndex];
        const slope = fieldGradient(ground, worldX, worldZ, workX, workY, SURFACE_WORK_SIZE);
        field2.materialWeights.set(
          materialWeights(window2, local.u, local.v, slope, shore[workIndex]),
          index2 * 4
        );
        if (workCoverage[workIndex] > 0) {
          const level = workWaterLevel[workIndex];
          const depth = Math.max(0, level - ground[workIndex]) * workCoverage[workIndex] / 255;
          field2.waterLevel[index2] = encodeFloat16(level);
          field2.waterDepth[index2] = encodeFloat16(depth);
          field2.flow[index2 * 2] = Math.round(clamp2(workFlow[workIndex * 2], -1, 1) * 127);
          field2.flow[index2 * 2 + 1] = Math.round(clamp2(workFlow[workIndex * 2 + 1], -1, 1) * 127);
          field2.waterBodyIndex[index2] = paletteById.get(workBodyIds[workIndex]);
        }
        minGroundHeight = Math.min(minGroundHeight, decodeFloat16(field2.groundHeight[index2]));
        maxGroundHeight = Math.max(maxGroundHeight, decodeFloat16(field2.groundHeight[index2]));
        if (workCoverage[workIndex] >= 128) {
          const level = decodeFloat16(field2.waterLevel[index2]);
          minWaterLevel = Math.min(minWaterLevel, level);
          maxWaterLevel = Math.max(maxWaterLevel, level);
          hasWater = true;
        }
      }
    }
    const bounds = Object.freeze({
      validTiles: Object.freeze({ ...window2.validBounds }),
      minGroundHeight,
      maxGroundHeight,
      hasWater,
      minWaterLevel: hasWater ? minWaterLevel : 0,
      maxWaterLevel: hasWater ? maxWaterLevel : 0
    });
    const waterGeometry = compileWaterGeometry(window2, field2, waterBodies);
    const vegetationSeeds = compileVegetationSeeds(window2, field2);
    const byteLength = fieldByteLength(field2) + waterGeometryByteLength(waterGeometry) + vegetationSeedsByteLength(vegetationSeeds);
    const dependencyKey2 = cloneSurfaceDependencyKey(window2.dependencyKey);
    const chunk = Object.freeze({
      key: Object.freeze({ ...window2.key }),
      dependencyKey: dependencyKey2,
      effectiveRevision: window2.effectiveRevision,
      bounds,
      field: field2,
      waterBodies,
      waterGeometry,
      vegetationSeeds,
      byteLength,
      contentChecksum: surfaceChecksum(field2, waterBodies, waterGeometry, vegetationSeeds)
    });
    assertCompiledSurfaceChunk(chunk);
    validatedCompiledChunks.add(chunk);
    return chunk;
  }
  function assertField(field2) {
    if (!field2 || typeof field2 !== "object" || Object.getOwnPropertyNames(field2).some((name) => ![
      "groundHeight",
      "materialWeights",
      "waterLevel",
      "waterDepth",
      "shorelineDistance",
      "flow",
      "waterCoverage",
      "waterKind",
      "waterProfile",
      "waterBodyIndex"
    ].includes(name)) || !(field2.groundHeight instanceof Uint16Array) || field2.groundHeight.length !== SURFACE_FIELD_TEXEL_COUNT || !(field2.materialWeights instanceof Uint8Array) || field2.materialWeights.length !== SURFACE_FIELD_TEXEL_COUNT * 4 || !(field2.waterLevel instanceof Uint16Array) || field2.waterLevel.length !== SURFACE_FIELD_TEXEL_COUNT || !(field2.waterDepth instanceof Uint16Array) || field2.waterDepth.length !== SURFACE_FIELD_TEXEL_COUNT || !(field2.shorelineDistance instanceof Uint16Array) || field2.shorelineDistance.length !== SURFACE_FIELD_TEXEL_COUNT || !(field2.flow instanceof Int8Array) || field2.flow.length !== SURFACE_FIELD_TEXEL_COUNT * 2 || !(field2.waterCoverage instanceof Uint8Array) || field2.waterCoverage.length !== SURFACE_FIELD_TEXEL_COUNT || !(field2.waterKind instanceof Uint8Array) || field2.waterKind.length !== SURFACE_FIELD_TEXEL_COUNT || !(field2.waterProfile instanceof Uint8Array) || field2.waterProfile.length !== SURFACE_FIELD_TEXEL_COUNT || !(field2.waterBodyIndex instanceof Uint8Array) || field2.waterBodyIndex.length !== SURFACE_FIELD_TEXEL_COUNT) {
      throw new TypeError("compiled surface field layout is invalid");
    }
  }
  function assertBounds2(bounds) {
    if (!bounds || typeof bounds !== "object" || Object.getOwnPropertyNames(bounds).some((name) => ![
      "validTiles",
      "minGroundHeight",
      "maxGroundHeight",
      "hasWater",
      "minWaterLevel",
      "maxWaterLevel"
    ].includes(name)) || !bounds.validTiles || !Number.isFinite(bounds.minGroundHeight) || !Number.isFinite(bounds.maxGroundHeight) || bounds.minGroundHeight > bounds.maxGroundHeight || typeof bounds.hasWater !== "boolean" || !Number.isFinite(bounds.minWaterLevel) || !Number.isFinite(bounds.maxWaterLevel) || bounds.minWaterLevel > bounds.maxWaterLevel || !Number.isInteger(bounds.validTiles.minX) || !Number.isInteger(bounds.validTiles.minY) || !Number.isInteger(bounds.validTiles.maxXExclusive) || !Number.isInteger(bounds.validTiles.maxYExclusive) || bounds.validTiles.minX < 0 || bounds.validTiles.minY < 0 || bounds.validTiles.maxXExclusive > SURFACE_RENDER_CHUNK_SIZE || bounds.validTiles.maxYExclusive > SURFACE_RENDER_CHUNK_SIZE || bounds.validTiles.minX >= bounds.validTiles.maxXExclusive || bounds.validTiles.minY >= bounds.validTiles.maxYExclusive) {
      throw new TypeError("compiled surface bounds are invalid");
    }
  }
  function assertWaterMesh(mesh) {
    if (!mesh || typeof mesh !== "object" || Object.getOwnPropertyNames(mesh).some((name) => name !== "surfaceUv" && name !== "indices") || !(mesh.surfaceUv instanceof Float32Array) || mesh.surfaceUv.length < 6 || mesh.surfaceUv.length % 2 !== 0 || !(mesh.indices instanceof Uint16Array) || mesh.indices.length < 3 || mesh.indices.length % 3 !== 0) {
      throw new TypeError("compiled water mesh layout is invalid");
    }
    const vertexCount = mesh.surfaceUv.length / 2;
    for (const coordinate of mesh.surfaceUv) {
      if (!Number.isFinite(coordinate)) throw new TypeError("compiled water mesh coordinates must be finite");
    }
    for (let index2 = 0; index2 < mesh.indices.length; index2 += 3) {
      const first = mesh.indices[index2];
      const second = mesh.indices[index2 + 1];
      const third = mesh.indices[index2 + 2];
      if (first >= vertexCount || second >= vertexCount || third >= vertexCount || first === second || second === third || first === third) {
        throw new TypeError("compiled water mesh indices are invalid");
      }
      const ax = mesh.surfaceUv[first * 2];
      const ay = mesh.surfaceUv[first * 2 + 1];
      const bx = mesh.surfaceUv[second * 2];
      const by = mesh.surfaceUv[second * 2 + 1];
      const cx = mesh.surfaceUv[third * 2];
      const cy = mesh.surfaceUv[third * 2 + 1];
      if (Math.abs((bx - ax) * (cy - ay) - (by - ay) * (cx - ax)) <= 1e-9) {
        throw new TypeError("compiled water mesh contains a degenerate logical triangle");
      }
    }
  }
  function assertWaterGeometry(value) {
    if (!value || typeof value !== "object") throw new TypeError("compiled water geometry is invalid");
    if (value.kind === "none" || value.kind === "full") {
      if (Object.getOwnPropertyNames(value).some((name) => name !== "kind")) {
        throw new TypeError("shared compiled water geometry contains unknown fields");
      }
      return;
    }
    if (value.kind !== "coverage" && value.kind !== "sweep") {
      throw new TypeError("compiled water geometry kind is invalid");
    }
    const allowed = value.kind === "coverage" ? /* @__PURE__ */ new Set(["kind", "mesh"]) : /* @__PURE__ */ new Set(["kind", "mesh", "featureKeys"]);
    if (Object.getOwnPropertyNames(value).some((name) => !allowed.has(name))) {
      throw new TypeError("compiled water geometry contains unknown fields");
    }
    assertWaterMesh(value.mesh);
    if (value.kind === "sweep") {
      if (!Array.isArray(value.featureKeys) || value.featureKeys.length === 0 || value.featureKeys.some((key2, index2) => typeof key2 !== "string" || key2.length === 0 || index2 > 0 && value.featureKeys[index2 - 1].localeCompare(key2) >= 0)) {
        throw new TypeError("compiled water sweep feature keys are invalid");
      }
    }
  }
  function assertVegetationSeeds(value) {
    if (!value || typeof value !== "object" || Object.getOwnPropertyNames(value).some((name) => ![
      "tileIndex",
      "candidateIndex",
      "randomKey",
      "surfaceCoordinates",
      "groundHeight",
      "species",
      "scale",
      "rotation"
    ].includes(name)) || !(value.tileIndex instanceof Uint16Array) || !(value.candidateIndex instanceof Uint8Array) || !(value.randomKey instanceof Uint32Array) || !(value.surfaceCoordinates instanceof Int16Array) || !(value.groundHeight instanceof Uint16Array) || !(value.species instanceof Uint8Array) || !(value.scale instanceof Uint8Array) || !(value.rotation instanceof Uint16Array)) {
      throw new TypeError("compiled vegetation seed layout is invalid");
    }
    const count = value.tileIndex.length;
    if (count > SURFACE_MAX_VEGETATION_SEEDS || value.candidateIndex.length !== count || value.randomKey.length !== count || value.surfaceCoordinates.length !== count * 2 || value.groundHeight.length !== count || value.species.length !== count || value.scale.length !== count || value.rotation.length !== count) {
      throw new TypeError("compiled vegetation seed columns have inconsistent lengths");
    }
    let previousIdentity = -1;
    for (let index2 = 0; index2 < count; index2 += 1) {
      const identity = value.tileIndex[index2] * 10 + value.candidateIndex[index2];
      const species = value.species[index2];
      if (value.tileIndex[index2] >= SURFACE_RENDER_CHUNK_SIZE * SURFACE_RENDER_CHUNK_SIZE || value.candidateIndex[index2] >= 10 || identity <= previousIdentity || species < 0 /* Grass */ || species > 3 /* Oak */ || value.candidateIndex[index2] < 8 !== (species === 0 /* Grass */) || value.scale[index2] < 160) {
        throw new TypeError("compiled vegetation seed values are invalid");
      }
      previousIdentity = identity;
    }
  }
  function assertCompiledSurfaceChunk(value) {
    if (!value || typeof value !== "object") throw new TypeError("compiled surface chunk must be an object");
    const chunk = value;
    if (Object.getOwnPropertyNames(chunk).some((name) => ![
      "key",
      "dependencyKey",
      "effectiveRevision",
      "bounds",
      "field",
      "waterBodies",
      "waterGeometry",
      "vegetationSeeds",
      "byteLength",
      "contentChecksum"
    ].includes(name))) throw new TypeError("compiled surface chunk contains unknown fields");
    assertSurfaceDependencyKey(chunk.dependencyKey);
    if (chunk.key.chunkX !== chunk.dependencyKey.renderKey.chunkX || chunk.key.chunkY !== chunk.dependencyKey.renderKey.chunkY || chunk.dependencyKey.compilerRevision !== SURFACE_COMPILER_REVISION || chunk.dependencyKey.compileProfileVersion !== SURFACE_COMPILE_PROFILE_VERSION || !Number.isSafeInteger(chunk.effectiveRevision) || chunk.effectiveRevision < 0) {
      throw new TypeError("compiled surface chunk identity is invalid");
    }
    assertBounds2(chunk.bounds);
    assertField(chunk.field);
    if (!Array.isArray(chunk.waterBodies) || chunk.waterBodies.length > SURFACE_MAX_WATER_BODY_COUNT) {
      throw new RangeError("compiled surface body palette exceeds its frozen budget");
    }
    const bodyIds = /* @__PURE__ */ new Set();
    for (const body of chunk.waterBodies) {
      if (!body || typeof body.bodyId !== "string" || bodyIds.has(body.bodyId) || !["ocean", "lake", "river"].includes(body.kind) || body.kind === "ocean" !== (body.bodyId === OCEAN_BODY_ID) || Object.getOwnPropertyNames(body).some((name) => name !== "bodyId" && name !== "kind")) {
        throw new TypeError("compiled surface body palette is invalid");
      }
      bodyIds.add(body.bodyId);
    }
    for (let index2 = 1; index2 < chunk.waterBodies.length; index2 += 1) {
      if (chunk.waterBodies[index2 - 1].bodyId.localeCompare(chunk.waterBodies[index2].bodyId) >= 0) {
        throw new TypeError("compiled surface body palette must be strictly ordered");
      }
    }
    assertWaterGeometry(chunk.waterGeometry);
    assertVegetationSeeds(chunk.vegetationSeeds);
    let minGroundHeight = Number.POSITIVE_INFINITY;
    let maxGroundHeight = Number.NEGATIVE_INFINITY;
    let minWaterLevel = Number.POSITIVE_INFINITY;
    let maxWaterLevel = Number.NEGATIVE_INFINITY;
    let hasWater = false;
    for (let index2 = 0; index2 < SURFACE_FIELD_TEXEL_COUNT; index2 += 1) {
      const materialOffset = index2 * 4;
      if (chunk.field.materialWeights[materialOffset] + chunk.field.materialWeights[materialOffset + 1] + chunk.field.materialWeights[materialOffset + 2] + chunk.field.materialWeights[materialOffset + 3] !== 255) {
        throw new TypeError("compiled surface material weights must sum to 255");
      }
      const coverage = chunk.field.waterCoverage[index2];
      const kind = chunk.field.waterKind[index2];
      const bodyIndex = chunk.field.waterBodyIndex[index2];
      const groundHeight = decodeFloat16(chunk.field.groundHeight[index2]);
      const waterLevel = decodeFloat16(chunk.field.waterLevel[index2]);
      const waterDepth = decodeFloat16(chunk.field.waterDepth[index2]);
      const shoreDistance = decodeFloat16(chunk.field.shorelineDistance[index2]);
      if (coverage === 0 !== (kind === 0 /* None */ && bodyIndex === 0) || coverage > 0 && (kind < 1 /* Ocean */ || kind > 3 /* River */ || bodyIndex === 0 || bodyIndex > chunk.waterBodies.length) || coverage === 0 && (waterLevel !== 0 || waterDepth !== 0 || chunk.field.waterProfile[index2] !== 0 || chunk.field.flow[index2 * 2] !== 0 || chunk.field.flow[index2 * 2 + 1] !== 0) || !Number.isFinite(groundHeight) || groundHeight < 0 || groundHeight > 1 || !Number.isFinite(waterLevel) || waterLevel < 0 || waterLevel > 1 || !Number.isFinite(waterDepth) || waterDepth < 0 || !Number.isFinite(shoreDistance) || Math.abs(shoreDistance) > SHORE_DISTANCE_LIMIT + 0.01) {
        throw new TypeError("compiled surface field contains invalid texel data");
      }
      if (coverage > 0) {
        const body = chunk.waterBodies[bodyIndex - 1];
        const expectedKind = kind === 1 /* Ocean */ ? "ocean" : kind === 2 /* Lake */ ? "lake" : "river";
        if (body.kind !== expectedKind) {
          throw new TypeError("compiled surface texel disagrees with its water body palette");
        }
      }
      minGroundHeight = Math.min(minGroundHeight, groundHeight);
      maxGroundHeight = Math.max(maxGroundHeight, groundHeight);
      if (coverage >= 128) {
        minWaterLevel = Math.min(minWaterLevel, waterLevel);
        maxWaterLevel = Math.max(maxWaterLevel, waterLevel);
        hasWater = true;
      }
    }
    if (chunk.bounds.minGroundHeight !== minGroundHeight || chunk.bounds.maxGroundHeight !== maxGroundHeight || chunk.bounds.hasWater !== hasWater || chunk.bounds.minWaterLevel !== (hasWater ? minWaterLevel : 0) || chunk.bounds.maxWaterLevel !== (hasWater ? maxWaterLevel : 0)) {
      throw new TypeError("compiled surface bounds do not match the field payload");
    }
    if (chunk.byteLength !== fieldByteLength(chunk.field) + waterGeometryByteLength(chunk.waterGeometry) + vegetationSeedsByteLength(chunk.vegetationSeeds) || chunk.contentChecksum !== surfaceChecksum(
      chunk.field,
      chunk.waterBodies,
      chunk.waterGeometry,
      chunk.vegetationSeeds
    )) {
      throw new TypeError("compiled surface chunk byte length or checksum is invalid");
    }
  }
  function assertCompiledSurfaceChunkOnce(value) {
    if (validatedCompiledChunks.has(value)) return;
    assertCompiledSurfaceChunk(value);
    validatedCompiledChunks.add(value);
  }
  function bilinear2(values, amountX, amountY) {
    const top = values[0] + (values[1] - values[0]) * amountX;
    const bottom = values[2] + (values[3] - values[2]) * amountX;
    return top + (bottom - top) * amountY;
  }
  function sampleCompiledSurfaceChunk(chunk, localU, localV) {
    assertCompiledSurfaceChunkOnce(chunk);
    if (!Number.isFinite(localU) || !Number.isFinite(localV) || localU < chunk.bounds.validTiles.minX - 0.5 || localU >= chunk.bounds.validTiles.maxXExclusive - 0.5 || localV < chunk.bounds.validTiles.minY - 0.5 || localV >= chunk.bounds.validTiles.maxYExclusive - 0.5) {
      throw new RangeError("compiled surface query lies outside the chunk valid domain");
    }
    const texel = surfaceFieldTexelCoordinate(localU, localV);
    const x0 = Math.floor(texel.u);
    const y0 = Math.floor(texel.v);
    const amountX = texel.u - x0;
    const amountY = texel.v - y0;
    if (x0 < 0 || y0 < 0 || x0 + 1 >= SURFACE_FIELD_TEXTURE_SIZE || y0 + 1 >= SURFACE_FIELD_TEXTURE_SIZE) {
      throw new RangeError("compiled surface query exceeds the field gutter");
    }
    const indices = [
      surfaceLatticeIndex(x0, y0),
      surfaceLatticeIndex(x0 + 1, y0),
      surfaceLatticeIndex(x0, y0 + 1),
      surfaceLatticeIndex(x0 + 1, y0 + 1)
    ];
    const interpolationWeights = [
      (1 - amountX) * (1 - amountY),
      amountX * (1 - amountY),
      (1 - amountX) * amountY,
      amountX * amountY
    ];
    const groundHeight = bilinear2(
      indices.map((index2) => decodeFloat16(chunk.field.groundHeight[index2])),
      amountX,
      amountY
    );
    const shorelineDistance = bilinear2(
      indices.map((index2) => decodeFloat16(chunk.field.shorelineDistance[index2])),
      amountX,
      amountY
    );
    const waterCoverage = bilinear2(
      indices.map((index2) => chunk.field.waterCoverage[index2] / 255),
      amountX,
      amountY
    );
    let wetWeight = 0;
    let waterLevel = 0;
    let waterDepth = 0;
    let flowX = 0;
    let flowY = 0;
    let selected = -1;
    let selectedWeight = -1;
    for (let index2 = 0; index2 < indices.length; index2 += 1) {
      const texelIndex = indices[index2];
      const weight = interpolationWeights[index2];
      const coverageWeight = weight * chunk.field.waterCoverage[texelIndex] / 255;
      wetWeight += coverageWeight;
      waterLevel += decodeFloat16(chunk.field.waterLevel[texelIndex]) * coverageWeight;
      waterDepth += decodeFloat16(chunk.field.waterDepth[texelIndex]) * weight;
      flowX += chunk.field.flow[texelIndex * 2] / 127 * coverageWeight;
      flowY += chunk.field.flow[texelIndex * 2 + 1] / 127 * coverageWeight;
      if (coverageWeight > selectedWeight || coverageWeight === selectedWeight && texelIndex < (selected < 0 ? Number.POSITIVE_INFINITY : indices[selected])) {
        selected = index2;
        selectedWeight = coverageWeight;
      }
    }
    if (wetWeight > 0) waterLevel /= wetWeight;
    const flowLength = Math.hypot(flowX, flowY);
    if (flowLength > 0) {
      flowX /= flowLength;
      flowY /= flowLength;
    }
    const selectedIndex = selected >= 0 ? indices[selected] : indices[0];
    const bodyIndex = selectedWeight > 0 ? chunk.field.waterBodyIndex[selectedIndex] : 0;
    const material = [0, 1, 2, 3].map((channel) => bilinear2(
      indices.map((index2) => chunk.field.materialWeights[index2 * 4 + channel] / 255),
      amountX,
      amountY
    ));
    return Object.freeze({
      groundHeight,
      materialWeights: Object.freeze(material),
      waterLevel,
      waterDepth,
      shorelineDistance,
      flow: Object.freeze([flowX, flowY]),
      waterCoverage,
      waterKind: bodyIndex > 0 ? chunk.field.waterKind[selectedIndex] : 0 /* None */,
      waterProfile: bodyIndex > 0 ? chunk.field.waterProfile[selectedIndex] : 0,
      waterBody: bodyIndex > 0 ? chunk.waterBodies[bodyIndex - 1] : void 0
    });
  }
  function compiledSurfaceChunkTransferables(chunk) {
    assertCompiledSurfaceChunkOnce(chunk);
    const candidates = [
      chunk.field.groundHeight.buffer,
      chunk.field.materialWeights.buffer,
      chunk.field.waterLevel.buffer,
      chunk.field.waterDepth.buffer,
      chunk.field.shorelineDistance.buffer,
      chunk.field.flow.buffer,
      chunk.field.waterCoverage.buffer,
      chunk.field.waterKind.buffer,
      chunk.field.waterProfile.buffer,
      chunk.field.waterBodyIndex.buffer,
      ...surfacePresentationTransferables(chunk.waterGeometry, chunk.vegetationSeeds)
    ];
    if (candidates.some((buffer) => !(buffer instanceof ArrayBuffer))) {
      throw new TypeError("compiled surface chunk buffers must be transferable ArrayBuffers");
    }
    const buffers = candidates;
    if (new Set(buffers).size !== buffers.length) {
      throw new TypeError("compiled surface field must own distinct transferable buffers");
    }
    return Object.freeze(buffers);
  }

  // src/rendering/SurfaceTexturePool.ts
  var SURFACE_VALUES_TEXTURE_CHANNELS = 4;
  var SURFACE_MATERIAL_TEXTURE_CHANNELS = 4;
  var SURFACE_FLOW_TEXTURE_CHANNELS = 2;
  var SURFACE_WATER_TEXTURE_CHANNELS = 3;
  var SURFACE_GPU_BYTES_PER_TEXEL = 17;
  var SURFACE_GPU_LAYER_BYTES = SURFACE_FIELD_TEXEL_COUNT * SURFACE_GPU_BYTES_PER_TEXEL;
  var SURFACE_GPU_PAGE_BYTES = SURFACE_GPU_LAYER_BYTES * SURFACE_TEXTURE_PAGE_LAYERS;
  var SURFACE_TEXTURE_FORMAT_V1 = Object.freeze({
    values: Object.freeze({
      channels: SURFACE_VALUES_TEXTURE_CHANNELS,
      internalFormat: "RGBA16F",
      fields: Object.freeze(["groundHeight", "waterLevel", "waterDepth", "shorelineDistance"])
    }),
    material: Object.freeze({
      channels: SURFACE_MATERIAL_TEXTURE_CHANNELS,
      internalFormat: "RGBA8",
      fields: Object.freeze(["material0", "material1", "material2", "material3"])
    }),
    flow: Object.freeze({
      channels: SURFACE_FLOW_TEXTURE_CHANNELS,
      internalFormat: "RG8_SNORM",
      fields: Object.freeze(["flowX", "flowY"])
    }),
    water: Object.freeze({
      channels: SURFACE_WATER_TEXTURE_CHANNELS,
      internalFormat: "RGB8",
      fields: Object.freeze(["waterCoverage", "waterKind", "waterProfile"])
    })
  });
  var nextSurfaceTexturePoolId = 1;
  function assertOptions(options) {
    if (!options || typeof options !== "object" || Object.getOwnPropertyNames(options).some((name) => name !== "gpuBudgetBytes")) {
      throw new TypeError("surface texture pool options are invalid");
    }
    if (!Number.isSafeInteger(options.gpuBudgetBytes) || options.gpuBudgetBytes < 0) {
      throw new RangeError("surface texture pool gpuBudgetBytes must be a non-negative safe integer");
    }
  }
  function assertRenderKey(key2) {
    if (!key2 || typeof key2 !== "object" || Object.getOwnPropertyNames(key2).some((name) => name !== "chunkX" && name !== "chunkY") || !Number.isSafeInteger(key2.chunkX) || !Number.isSafeInteger(key2.chunkY)) {
      throw new TypeError("surface texture allocation requires a canonical render chunk key");
    }
  }
  function renderKeyString2(key2) {
    return `${key2.chunkX},${key2.chunkY}`;
  }
  function assertSlotHandle(value) {
    if (!value || typeof value !== "object" || Object.getOwnPropertyNames(value).some((name) => ![
      "poolId",
      "pageIndex",
      "layerIndex",
      "generation"
    ].includes(name)) || !Number.isSafeInteger(value.poolId) || value.poolId <= 0 || !Number.isInteger(value.pageIndex) || value.pageIndex < 0 || !Number.isInteger(value.layerIndex) || value.layerIndex < 0 || value.layerIndex >= SURFACE_TEXTURE_PAGE_LAYERS || !Number.isSafeInteger(value.generation) || value.generation <= 0) {
      throw new TypeError("surface texture slot handle is invalid");
    }
  }
  function configureTexture(texture, name, internalFormat, format, type) {
    texture.name = name;
    texture.internalFormat = internalFormat;
    texture.format = format;
    texture.type = type;
    texture.wrapS = three.ClampToEdgeWrapping;
    texture.wrapT = three.ClampToEdgeWrapping;
    texture.magFilter = three.NearestFilter;
    texture.minFilter = three.NearestFilter;
    texture.generateMipmaps = false;
    texture.flipY = false;
    texture.unpackAlignment = 1;
    texture.colorSpace = three.NoColorSpace;
    return texture;
  }
  function createPage(pageIndex) {
    const valuesData = new Uint16Array(
      SURFACE_FIELD_TEXEL_COUNT * SURFACE_TEXTURE_PAGE_LAYERS * SURFACE_VALUES_TEXTURE_CHANNELS
    );
    const materialData = new Uint8Array(
      SURFACE_FIELD_TEXEL_COUNT * SURFACE_TEXTURE_PAGE_LAYERS * SURFACE_MATERIAL_TEXTURE_CHANNELS
    );
    const flowData = new Int8Array(
      SURFACE_FIELD_TEXEL_COUNT * SURFACE_TEXTURE_PAGE_LAYERS * SURFACE_FLOW_TEXTURE_CHANNELS
    );
    const waterData = new Uint8Array(
      SURFACE_FIELD_TEXEL_COUNT * SURFACE_TEXTURE_PAGE_LAYERS * SURFACE_WATER_TEXTURE_CHANNELS
    );
    return {
      pageIndex,
      valuesData,
      materialData,
      flowData,
      waterData,
      valuesTexture: configureTexture(new three.DataArrayTexture(
        valuesData,
        SURFACE_FIELD_TEXTURE_SIZE,
        SURFACE_FIELD_TEXTURE_SIZE,
        SURFACE_TEXTURE_PAGE_LAYERS
      ), `surface-values-page-${pageIndex}`, "RGBA16F", three.RGBAFormat, three.HalfFloatType),
      materialTexture: configureTexture(new three.DataArrayTexture(
        materialData,
        SURFACE_FIELD_TEXTURE_SIZE,
        SURFACE_FIELD_TEXTURE_SIZE,
        SURFACE_TEXTURE_PAGE_LAYERS
      ), `surface-material-page-${pageIndex}`, "RGBA8", three.RGBAFormat, three.UnsignedByteType),
      flowTexture: configureTexture(new three.DataArrayTexture(
        flowData,
        SURFACE_FIELD_TEXTURE_SIZE,
        SURFACE_FIELD_TEXTURE_SIZE,
        SURFACE_TEXTURE_PAGE_LAYERS
      ), `surface-flow-page-${pageIndex}`, "RG8_SNORM", three.RGFormat, three.ByteType),
      waterTexture: configureTexture(new three.DataArrayTexture(
        waterData,
        SURFACE_FIELD_TEXTURE_SIZE,
        SURFACE_FIELD_TEXTURE_SIZE,
        SURFACE_TEXTURE_PAGE_LAYERS
      ), `surface-water-page-${pageIndex}`, "RGB8", three.RGBFormat, three.UnsignedByteType),
      slots: Array.from({ length: SURFACE_TEXTURE_PAGE_LAYERS }, () => ({
        generation: 1,
        retired: false,
        uploaded: false
      }))
    };
  }
  function pageTextures(page) {
    return [page.valuesTexture, page.materialTexture, page.flowTexture, page.waterTexture];
  }
  function textureTexelOffset(layerIndex, x, y, channels) {
    return (layerIndex * SURFACE_FIELD_TEXEL_COUNT + y * SURFACE_FIELD_TEXTURE_SIZE + x) * channels;
  }
  function packCompiledLayer(page, layerIndex, chunk) {
    for (let y = 0; y < SURFACE_FIELD_TEXTURE_SIZE; y += 1) {
      for (let x = 0; x < SURFACE_FIELD_TEXTURE_SIZE; x += 1) {
        const source = x * SURFACE_FIELD_TEXTURE_SIZE + y;
        const valuesOffset = textureTexelOffset(layerIndex, x, y, SURFACE_VALUES_TEXTURE_CHANNELS);
        page.valuesData[valuesOffset] = chunk.field.groundHeight[source];
        page.valuesData[valuesOffset + 1] = chunk.field.waterLevel[source];
        page.valuesData[valuesOffset + 2] = chunk.field.waterDepth[source];
        page.valuesData[valuesOffset + 3] = chunk.field.shorelineDistance[source];
        const materialOffset = textureTexelOffset(layerIndex, x, y, SURFACE_MATERIAL_TEXTURE_CHANNELS);
        const sourceMaterialOffset = source * SURFACE_MATERIAL_TEXTURE_CHANNELS;
        page.materialData[materialOffset] = chunk.field.materialWeights[sourceMaterialOffset];
        page.materialData[materialOffset + 1] = chunk.field.materialWeights[sourceMaterialOffset + 1];
        page.materialData[materialOffset + 2] = chunk.field.materialWeights[sourceMaterialOffset + 2];
        page.materialData[materialOffset + 3] = chunk.field.materialWeights[sourceMaterialOffset + 3];
        const flowOffset = textureTexelOffset(layerIndex, x, y, SURFACE_FLOW_TEXTURE_CHANNELS);
        page.flowData[flowOffset] = chunk.field.flow[source * SURFACE_FLOW_TEXTURE_CHANNELS];
        page.flowData[flowOffset + 1] = chunk.field.flow[source * SURFACE_FLOW_TEXTURE_CHANNELS + 1];
        const waterOffset = textureTexelOffset(layerIndex, x, y, SURFACE_WATER_TEXTURE_CHANNELS);
        page.waterData[waterOffset] = chunk.field.waterCoverage[source];
        page.waterData[waterOffset + 1] = chunk.field.waterKind[source];
        page.waterData[waterOffset + 2] = chunk.field.waterProfile[source];
      }
    }
  }
  function markLayerUpdate(page, layerIndex) {
    for (const texture of pageTextures(page)) {
      texture.addLayerUpdate(layerIndex);
      texture.needsUpdate = true;
    }
  }
  function forgetLayerUpdate(page, layerIndex) {
    for (const texture of pageTextures(page)) texture.layerUpdates.delete(layerIndex);
  }
  var SurfaceTexturePool = class {
    constructor(options) {
      this.pages = [];
      this.activeByRenderKey = /* @__PURE__ */ new Map();
      this.stateValue = "ready";
      this.contextGenerationValue = 1;
      this.contextRestoreCount = 0;
      this.logicalUploadCount = 0;
      this.logicalUploadByteCount = 0;
      this.staleUploadRejectCount = 0;
      this.staleReleaseRejectCount = 0;
      assertOptions(options);
      if (nextSurfaceTexturePoolId > Number.MAX_SAFE_INTEGER) {
        throw new RangeError("surface texture pool identity space is exhausted");
      }
      this.poolId = nextSurfaceTexturePoolId;
      nextSurfaceTexturePoolId += 1;
      this.gpuBudgetBytes = options.gpuBudgetBytes;
      this.maxPages = Math.floor(this.gpuBudgetBytes / SURFACE_GPU_PAGE_BYTES);
    }
    get state() {
      return this.stateValue;
    }
    allocate(key2) {
      this.assertReady("allocate");
      assertRenderKey(key2);
      const keyString7 = renderKeyString2(key2);
      if (this.activeByRenderKey.has(keyString7)) {
        throw new TypeError("render chunk already owns a surface texture slot");
      }
      let page;
      let layerIndex = -1;
      for (const candidate of this.pages) {
        const candidateLayer = candidate.slots.findIndex((slot2) => !slot2.retired && !slot2.handle);
        if (candidateLayer >= 0) {
          page = candidate;
          layerIndex = candidateLayer;
          break;
        }
      }
      if (!page) {
        if (this.pages.length >= this.maxPages) {
          throw new RangeError("surface texture pool GPU page budget is exhausted");
        }
        page = createPage(this.pages.length);
        this.pages.push(page);
        layerIndex = 0;
      }
      const slot = page.slots[layerIndex];
      const handle = Object.freeze({
        poolId: this.poolId,
        pageIndex: page.pageIndex,
        layerIndex,
        generation: slot.generation
      });
      slot.handle = handle;
      slot.key = Object.freeze({ ...key2 });
      slot.uploaded = false;
      this.activeByRenderKey.set(keyString7, handle);
      return handle;
    }
    upload(handle, chunk) {
      assertSlotHandle(handle);
      const resolved = this.resolveCurrent(handle);
      if (!resolved) {
        this.staleUploadRejectCount += 1;
        return false;
      }
      this.assertReady("upload");
      assertCompiledSurfaceChunk(chunk);
      if (chunk.key.chunkX !== resolved.slot.key.chunkX || chunk.key.chunkY !== resolved.slot.key.chunkY) {
        throw new TypeError("compiled surface chunk does not match its reserved texture slot");
      }
      packCompiledLayer(resolved.page, handle.layerIndex, chunk);
      resolved.slot.uploaded = true;
      markLayerUpdate(resolved.page, handle.layerIndex);
      this.logicalUploadCount += 1;
      this.logicalUploadByteCount += SURFACE_GPU_LAYER_BYTES;
      return true;
    }
    release(handle) {
      assertSlotHandle(handle);
      this.assertNotDisposed();
      const resolved = this.resolveCurrent(handle);
      if (!resolved) {
        this.staleReleaseRejectCount += 1;
        return false;
      }
      this.activeByRenderKey.delete(renderKeyString2(resolved.slot.key));
      forgetLayerUpdate(resolved.page, handle.layerIndex);
      resolved.slot.handle = void 0;
      resolved.slot.key = void 0;
      resolved.slot.uploaded = false;
      if (resolved.slot.generation === Number.MAX_SAFE_INTEGER) {
        resolved.slot.retired = true;
      } else {
        resolved.slot.generation += 1;
      }
      return true;
    }
    isCurrent(handle) {
      assertSlotHandle(handle);
      if (this.stateValue === "disposed") return false;
      return Boolean(this.resolveCurrent(handle));
    }
    getBinding(handle) {
      assertSlotHandle(handle);
      this.assertReady("bind");
      const resolved = this.resolveCurrent(handle);
      if (!resolved) throw new RangeError("surface texture slot handle is stale");
      if (!resolved.slot.uploaded) throw new TypeError("surface texture slot has not received a compiled field");
      return Object.freeze({
        slot: handle,
        valuesTexture: resolved.page.valuesTexture,
        materialTexture: resolved.page.materialTexture,
        flowTexture: resolved.page.flowTexture,
        waterTexture: resolved.page.waterTexture
      });
    }
    handleContextLost() {
      this.assertNotDisposed();
      if (this.stateValue === "lost") return;
      this.stateValue = "lost";
      for (const page of this.pages) {
        for (const texture of pageTextures(page)) texture.clearLayerUpdates();
      }
    }
    handleContextRestored() {
      this.assertNotDisposed();
      if (this.stateValue !== "lost") {
        throw new TypeError("surface texture context can only restore from the lost state");
      }
      if (this.contextGenerationValue === Number.MAX_SAFE_INTEGER) {
        throw new RangeError("surface texture context generation space is exhausted");
      }
      this.stateValue = "ready";
      this.contextGenerationValue += 1;
      this.contextRestoreCount += 1;
      for (const page of this.pages) {
        let hasUpdates = false;
        for (let layerIndex = 0; layerIndex < page.slots.length; layerIndex += 1) {
          if (!page.slots[layerIndex].uploaded) continue;
          for (const texture of pageTextures(page)) texture.addLayerUpdate(layerIndex);
          hasUpdates = true;
        }
        if (hasUpdates) for (const texture of pageTextures(page)) texture.needsUpdate = true;
      }
    }
    clear() {
      this.assertNotDisposed();
      const handles = [...this.activeByRenderKey.values()];
      for (const handle of handles) this.release(handle);
    }
    dispose() {
      if (this.stateValue === "disposed") return;
      this.clear();
      for (const page of this.pages) {
        for (const texture of pageTextures(page)) texture.dispose();
      }
      this.pages.length = 0;
      this.activeByRenderKey.clear();
      this.stateValue = "disposed";
    }
    get stats() {
      let reusableSlots = 0;
      let uploadedSlots = 0;
      let pendingLayerUploads = 0;
      for (const page of this.pages) {
        for (const slot of page.slots) {
          if (!slot.retired && !slot.handle) reusableSlots += 1;
          if (slot.uploaded) uploadedSlots += 1;
        }
        const textures = pageTextures(page);
        for (let layerIndex = 0; layerIndex < SURFACE_TEXTURE_PAGE_LAYERS; layerIndex += 1) {
          if (textures.some((texture) => texture.layerUpdates.has(layerIndex))) {
            pendingLayerUploads += 1;
          }
        }
      }
      const residentBytes = this.pages.length * SURFACE_GPU_PAGE_BYTES;
      return Object.freeze({
        state: this.stateValue,
        contextGeneration: this.contextGenerationValue,
        contextRestores: this.contextRestoreCount,
        pageCount: this.pages.length,
        textureCount: this.pages.length * 4,
        capacitySlots: this.pages.length * SURFACE_TEXTURE_PAGE_LAYERS,
        reusableSlots,
        allocatedSlots: this.activeByRenderKey.size,
        uploadedSlots,
        cpuBytes: residentBytes,
        gpuBytes: residentBytes,
        gpuBudgetBytes: this.gpuBudgetBytes,
        gpuBudgetRemainingBytes: this.gpuBudgetBytes - residentBytes,
        pendingLayerUploads,
        pendingUploadBytes: pendingLayerUploads * SURFACE_GPU_LAYER_BYTES,
        logicalUploads: this.logicalUploadCount,
        logicalUploadBytes: this.logicalUploadByteCount,
        staleUploadRejects: this.staleUploadRejectCount,
        staleReleaseRejects: this.staleReleaseRejectCount
      });
    }
    resolveCurrent(handle) {
      if (handle.poolId !== this.poolId) return void 0;
      const page = this.pages[handle.pageIndex];
      const slot = page?.slots[handle.layerIndex];
      if (!page || !slot || slot.generation !== handle.generation || !slot.handle) return void 0;
      return { page, slot };
    }
    assertReady(operation) {
      this.assertNotDisposed();
      if (this.stateValue !== "ready") {
        throw new TypeError(`surface texture pool cannot ${operation} while the WebGL context is lost`);
      }
    }
    assertNotDisposed() {
      if (this.stateValue === "disposed") throw new TypeError("surface texture pool is disposed");
    }
  };

  // src/rendering/SurfaceFogTexturePool.ts
  var SURFACE_FOG_TEXTURE_SIZE = 16;
  var SURFACE_FOG_LAYER_BYTES = SURFACE_FOG_TEXTURE_SIZE * SURFACE_FOG_TEXTURE_SIZE;
  var SURFACE_FOG_PAGE_BYTES = SURFACE_FOG_LAYER_BYTES * SURFACE_TEXTURE_PAGE_LAYERS;
  function assertOptions2(options) {
    if (!options || typeof options !== "object" || Object.getOwnPropertyNames(options).some((name) => name !== "surfacePool" && name !== "gpuBudgetBytes") || !(options.surfacePool instanceof SurfaceTexturePool)) {
      throw new TypeError("surface fog texture pool options are invalid");
    }
    if (!Number.isSafeInteger(options.gpuBudgetBytes) || options.gpuBudgetBytes < 0) {
      throw new RangeError("surface fog texture pool gpuBudgetBytes must be a non-negative safe integer");
    }
  }
  function assertHandle(handle) {
    if (!handle || typeof handle !== "object" || Object.getOwnPropertyNames(handle).some((name) => ![
      "poolId",
      "pageIndex",
      "layerIndex",
      "generation"
    ].includes(name)) || !Number.isSafeInteger(handle.poolId) || handle.poolId <= 0 || !Number.isInteger(handle.pageIndex) || handle.pageIndex < 0 || !Number.isInteger(handle.layerIndex) || handle.layerIndex < 0 || handle.layerIndex >= SURFACE_TEXTURE_PAGE_LAYERS || !Number.isSafeInteger(handle.generation) || handle.generation <= 0) {
      throw new TypeError("surface fog texture slot handle is invalid");
    }
  }
  function handlesEqual(first, second) {
    return first.poolId === second.poolId && first.pageIndex === second.pageIndex && first.layerIndex === second.layerIndex && first.generation === second.generation;
  }
  function createPage2(pageIndex) {
    const data = new Uint8Array(SURFACE_FOG_PAGE_BYTES);
    const texture = new three.DataArrayTexture(
      data,
      SURFACE_FOG_TEXTURE_SIZE,
      SURFACE_FOG_TEXTURE_SIZE,
      SURFACE_TEXTURE_PAGE_LAYERS
    );
    texture.name = `surface-fog-page-${pageIndex}`;
    texture.internalFormat = "R8";
    texture.format = three.RedFormat;
    texture.type = three.UnsignedByteType;
    texture.wrapS = three.ClampToEdgeWrapping;
    texture.wrapT = three.ClampToEdgeWrapping;
    texture.magFilter = three.NearestFilter;
    texture.minFilter = three.NearestFilter;
    texture.generateMipmaps = false;
    texture.flipY = false;
    texture.unpackAlignment = 1;
    texture.colorSpace = three.NoColorSpace;
    return {
      pageIndex,
      data,
      texture,
      layers: Array.from({ length: SURFACE_TEXTURE_PAGE_LAYERS }, () => ({ uploaded: false }))
    };
  }
  function handleKey(handle) {
    return `${handle.poolId}/${handle.pageIndex}/${handle.layerIndex}/${handle.generation}`;
  }
  var SurfaceFogTexturePool = class {
    constructor(options) {
      this.pages = [];
      this.activeHandles = /* @__PURE__ */ new Map();
      this.stateValue = "ready";
      this.contextGenerationValue = 1;
      this.contextRestoreCount = 0;
      this.logicalUploadCount = 0;
      this.staleUploadRejectCount = 0;
      this.staleReleaseRejectCount = 0;
      assertOptions2(options);
      this.surfacePool = options.surfacePool;
      this.gpuBudgetBytes = options.gpuBudgetBytes;
      this.maxPages = Math.floor(this.gpuBudgetBytes / SURFACE_FOG_PAGE_BYTES);
    }
    get state() {
      return this.stateValue;
    }
    isCompanionOf(surfacePool) {
      return this.surfacePool === surfacePool;
    }
    upload(handle, fog) {
      assertHandle(handle);
      if (!(fog instanceof Uint8Array) || fog.length !== SURFACE_FOG_LAYER_BYTES) {
        throw new TypeError("surface fog upload must contain one 16x16 R8 layer");
      }
      if (!this.surfacePool.isCurrent(handle)) {
        this.staleUploadRejectCount += 1;
        return false;
      }
      if (this.surfacePool.state !== "ready") {
        throw new TypeError("surface fog upload requires its surface texture pool to be ready");
      }
      this.assertReady("upload");
      const page = this.ensurePage(handle.pageIndex);
      const layer = page.layers[handle.layerIndex];
      if (layer.handle && !handlesEqual(layer.handle, handle)) {
        if (this.surfacePool.isCurrent(layer.handle)) {
          throw new TypeError("surface fog layer is already owned by another current slot generation");
        }
        this.activeHandles.delete(handleKey(layer.handle));
      }
      const offset = handle.layerIndex * SURFACE_FOG_LAYER_BYTES;
      page.data.set(fog, offset);
      layer.handle = Object.freeze({ ...handle });
      layer.uploaded = true;
      this.activeHandles.set(handleKey(handle), layer.handle);
      page.texture.addLayerUpdate(handle.layerIndex);
      page.texture.needsUpdate = true;
      this.logicalUploadCount += 1;
      return true;
    }
    getBinding(handle) {
      assertHandle(handle);
      this.assertReady("bind");
      if (this.surfacePool.state !== "ready") {
        throw new TypeError("surface fog binding requires its surface texture pool to be ready");
      }
      const page = this.pages[handle.pageIndex];
      const layer = page?.layers[handle.layerIndex];
      if (!page || !layer?.handle || !handlesEqual(layer.handle, handle) || !layer.uploaded || !this.surfacePool.isCurrent(handle)) {
        throw new RangeError("surface fog texture slot handle is stale or has no uploaded layer");
      }
      return Object.freeze({ slot: handle, texture: page.texture });
    }
    release(handle) {
      assertHandle(handle);
      this.assertNotDisposed();
      const page = this.pages[handle.pageIndex];
      const layer = page?.layers[handle.layerIndex];
      if (!page || !layer?.handle || !handlesEqual(layer.handle, handle)) {
        this.staleReleaseRejectCount += 1;
        return false;
      }
      page.texture.layerUpdates.delete(handle.layerIndex);
      this.activeHandles.delete(handleKey(handle));
      layer.handle = void 0;
      layer.uploaded = false;
      return true;
    }
    handleContextLost() {
      this.assertNotDisposed();
      if (this.stateValue === "lost") return;
      this.stateValue = "lost";
      for (const page of this.pages) page?.texture.clearLayerUpdates();
    }
    handleContextRestored() {
      this.assertNotDisposed();
      if (this.stateValue !== "lost") {
        throw new TypeError("surface fog texture context can only restore from the lost state");
      }
      if (this.surfacePool.state !== "ready") {
        throw new TypeError("surface fog texture context restores after its surface texture pool");
      }
      if (this.contextGenerationValue === Number.MAX_SAFE_INTEGER) {
        throw new RangeError("surface fog context generation space is exhausted");
      }
      this.stateValue = "ready";
      this.contextGenerationValue += 1;
      this.contextRestoreCount += 1;
      this.pruneReleasedSurfaceSlots();
      for (const page of this.pages) {
        if (!page) continue;
        let changed = false;
        for (let index2 = 0; index2 < page.layers.length; index2 += 1) {
          if (!page.layers[index2].uploaded) continue;
          page.texture.addLayerUpdate(index2);
          changed = true;
        }
        if (changed) page.texture.needsUpdate = true;
      }
    }
    pruneReleasedSurfaceSlots() {
      this.assertNotDisposed();
      let released = 0;
      for (const handle of [...this.activeHandles.values()]) {
        if (this.surfacePool.isCurrent(handle)) continue;
        if (this.release(handle)) released += 1;
      }
      return released;
    }
    dispose() {
      if (this.stateValue === "disposed") return;
      for (const page of this.pages) page?.texture.dispose();
      this.pages.length = 0;
      this.activeHandles.clear();
      this.stateValue = "disposed";
    }
    get stats() {
      let pageCount = 0;
      let uploadedLayers = 0;
      let pendingLayerUploads = 0;
      for (const page of this.pages) {
        if (!page) continue;
        pageCount += 1;
        for (let index2 = 0; index2 < page.layers.length; index2 += 1) {
          if (page.layers[index2].uploaded) uploadedLayers += 1;
          if (page.texture.layerUpdates.has(index2)) pendingLayerUploads += 1;
        }
      }
      const residentBytes = pageCount * SURFACE_FOG_PAGE_BYTES;
      return Object.freeze({
        state: this.stateValue,
        contextGeneration: this.contextGenerationValue,
        contextRestores: this.contextRestoreCount,
        pageCount,
        activeLayers: this.activeHandles.size,
        uploadedLayers,
        cpuBytes: residentBytes,
        gpuBytes: residentBytes,
        gpuBudgetBytes: this.gpuBudgetBytes,
        pendingLayerUploads,
        logicalUploads: this.logicalUploadCount,
        logicalUploadBytes: this.logicalUploadCount * SURFACE_FOG_LAYER_BYTES,
        staleUploadRejects: this.staleUploadRejectCount,
        staleReleaseRejects: this.staleReleaseRejectCount
      });
    }
    ensurePage(pageIndex) {
      let page = this.pages[pageIndex];
      if (page) return page;
      const pageCount = this.pages.reduce((count, candidate) => count + (candidate ? 1 : 0), 0);
      if (pageCount >= this.maxPages) {
        throw new RangeError("surface fog texture pool GPU page budget is exhausted");
      }
      page = createPage2(pageIndex);
      this.pages[pageIndex] = page;
      return page;
    }
    assertReady(operation) {
      this.assertNotDisposed();
      if (this.stateValue !== "ready") {
        throw new TypeError(`surface fog texture pool cannot ${operation} while the WebGL context is lost`);
      }
    }
    assertNotDisposed() {
      if (this.stateValue === "disposed") throw new TypeError("surface fog texture pool is disposed");
    }
  };
  var SURFACE_GROUND_LOD_GRID_STEPS = Object.freeze([1, 2, 4]);
  var SURFACE_GROUND_BOUNDARY_INTERVALS = SURFACE_RENDER_CHUNK_SIZE * SURFACE_SAMPLES_PER_TILE_INTERVAL;
  var SURFACE_SEAM_GUARD_TILES = 1 / (SURFACE_SAMPLES_PER_TILE_INTERVAL * SURFACE_RENDER_CHUNK_SIZE);
  function guardedSurfaceCoordinate(value) {
    if (value === -0.5) return value - SURFACE_SEAM_GUARD_TILES;
    if (value === SURFACE_RENDER_CHUNK_SIZE - 0.5) {
      return value + SURFACE_SEAM_GUARD_TILES;
    }
    return value;
  }
  function createGuardedSurfaceCoordinates(source) {
    if (source.length < 2 || source.length % 2 !== 0) {
      throw new TypeError("surface coordinates must contain uv pairs");
    }
    const guarded = new Float32Array(source.length);
    for (let index2 = 0; index2 < source.length; index2 += 2) {
      const u = Number(source[index2]);
      const v = Number(source[index2 + 1]);
      if (!Number.isFinite(u) || !Number.isFinite(v)) {
        throw new RangeError("surface coordinates must be finite");
      }
      guarded[index2] = guardedSurfaceCoordinate(u);
      guarded[index2 + 1] = guardedSurfaceCoordinate(v);
    }
    return guarded;
  }
  function pointKey(point) {
    return `${point.x},${point.y}`;
  }
  function assertLod(lod) {
    if (lod !== 0 && lod !== 1 && lod !== 2) {
      throw new RangeError("surface ground LOD must be 0, 1 or 2");
    }
  }
  function vertex(builder, point, hexSize) {
    const key2 = pointKey(point);
    const existing = builder.vertexByPoint.get(key2);
    if (existing !== void 0) return existing;
    const u = -0.5 + point.x / SURFACE_SAMPLES_PER_TILE_INTERVAL;
    const v = -0.5 + point.y / SURFACE_SAMPLES_PER_TILE_INTERVAL;
    const world = surfaceToWorld(
      guardedSurfaceCoordinate(u),
      guardedSurfaceCoordinate(v),
      hexSize
    );
    const index2 = builder.positions.length / 3;
    builder.positions.push(world.x, 0, world.z);
    builder.surfaceCoordinates.push(u, v);
    builder.vertexByPoint.set(key2, index2);
    return index2;
  }
  function addTriangle(builder, first, second, third, hexSize) {
    let firstIndex = vertex(builder, first, hexSize);
    let secondIndex = vertex(builder, second, hexSize);
    let thirdIndex = vertex(builder, third, hexSize);
    const ax = builder.positions[firstIndex * 3];
    const az = builder.positions[firstIndex * 3 + 2];
    const bx = builder.positions[secondIndex * 3];
    const bz = builder.positions[secondIndex * 3 + 2];
    const cx = builder.positions[thirdIndex * 3];
    const cz = builder.positions[thirdIndex * 3 + 2];
    const normalY = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    if (Math.abs(normalY) <= Number.EPSILON) {
      throw new TypeError(`surface ground topology produced a degenerate triangle: ${pointKey(first)} / ${pointKey(second)} / ${pointKey(third)}`);
    }
    if (normalY < 0) {
      [secondIndex, thirdIndex] = [thirdIndex, secondIndex];
    }
    builder.indices.push(firstIndex, secondIndex, thirdIndex);
  }
  function worldPoint(point, hexSize) {
    const coordinate = surfaceToWorld(
      -0.5 + point.x / SURFACE_SAMPLES_PER_TILE_INTERVAL,
      -0.5 + point.y / SURFACE_SAMPLES_PER_TILE_INTERVAL,
      hexSize
    );
    return { x: coordinate.x, y: coordinate.z };
  }
  function determinant(first, second, third) {
    return (second.x - first.x) * (third.y - first.y) - (second.y - first.y) * (third.x - first.x);
  }
  function pointInOrOnTriangle(point, first, second, third, orientation) {
    return orientation * determinant(first, second, point) >= -1e-12 && orientation * determinant(second, third, point) >= -1e-12 && orientation * determinant(third, first, point) >= -1e-12;
  }
  function addQuad(builder, minX, minY, size, hexSize) {
    const topLeft = { x: minX, y: minY };
    const topRight = { x: minX + size, y: minY };
    const bottomLeft = { x: minX, y: minY + size };
    const bottomRight = { x: minX + size, y: minY + size };
    addTriangle(builder, topLeft, bottomLeft, bottomRight, hexSize);
    addTriangle(builder, topLeft, bottomRight, topRight, hexSize);
  }
  function addUniformGrid(builder, step, hexSize) {
    for (let x = 0; x < SURFACE_GROUND_BOUNDARY_INTERVALS; x += step) {
      for (let y = 0; y < SURFACE_GROUND_BOUNDARY_INTERVALS; y += step) {
        addQuad(builder, x, y, step, hexSize);
      }
    }
  }
  function sidePoints(start, end, step) {
    const distance = Math.max(Math.abs(end.x - start.x), Math.abs(end.y - start.y));
    if (distance % step !== 0) {
      throw new TypeError("surface transition side is not aligned to its LOD step");
    }
    const count = distance / step;
    const deltaX = count === 0 ? 0 : (end.x - start.x) / count;
    const deltaY = count === 0 ? 0 : (end.y - start.y) / count;
    return Object.freeze(Array.from({ length: count + 1 }, (_, index2) => Object.freeze({
      x: start.x + deltaX * index2,
      y: start.y + deltaY * index2
    })));
  }
  function stitchSide(builder, outer, inner, hexSize) {
    const polygon = [...outer, ...inner.slice().reverse()];
    const projected = polygon.map((point) => worldPoint(point, hexSize));
    const logical = polygon.map((point) => ({ x: point.x, y: point.y }));
    let signedArea = 0;
    let logicalSignedArea = 0;
    for (let index2 = 0; index2 < projected.length; index2 += 1) {
      const next = projected[(index2 + 1) % projected.length];
      const logicalNext = logical[(index2 + 1) % logical.length];
      signedArea += projected[index2].x * next.y - projected[index2].y * next.x;
      logicalSignedArea += logical[index2].x * logicalNext.y - logical[index2].y * logicalNext.x;
    }
    if (Math.abs(signedArea) <= Number.EPSILON) {
      throw new TypeError("surface transition side has no area");
    }
    const orientation = Math.sign(signedArea);
    const logicalOrientation = Math.sign(logicalSignedArea);
    const remaining = polygon.map((_, index2) => index2);
    while (remaining.length > 3) {
      let clipped = false;
      for (let cursor = 0; cursor < remaining.length; cursor += 1) {
        const previous = remaining[(cursor + remaining.length - 1) % remaining.length];
        const current = remaining[cursor];
        const next = remaining[(cursor + 1) % remaining.length];
        if (orientation * determinant(projected[previous], projected[current], projected[next]) <= 1e-12) {
          continue;
        }
        if (logicalOrientation * determinant(logical[previous], logical[current], logical[next]) <= 1e-12) {
          continue;
        }
        let containsPoint = false;
        for (const candidate of remaining) {
          if (candidate === previous || candidate === current || candidate === next) continue;
          if (pointInOrOnTriangle(
            projected[candidate],
            projected[previous],
            projected[current],
            projected[next],
            orientation
          )) {
            containsPoint = true;
            break;
          }
        }
        if (containsPoint) continue;
        addTriangle(builder, polygon[previous], polygon[current], polygon[next], hexSize);
        remaining.splice(cursor, 1);
        clipped = true;
        break;
      }
      if (!clipped) {
        throw new TypeError("surface transition side cannot be triangulated without overlap");
      }
    }
    addTriangle(
      builder,
      polygon[remaining[0]],
      polygon[remaining[1]],
      polygon[remaining[2]],
      hexSize
    );
  }
  function addTransitionGrid(builder, step, hexSize) {
    const maximum = SURFACE_GROUND_BOUNDARY_INTERVALS;
    const innerMaximum = maximum - step;
    for (let x = step; x < innerMaximum; x += step) {
      for (let y = step; y < innerMaximum; y += step) addQuad(builder, x, y, step, hexSize);
    }
    const sides = [
      [
        sidePoints({ x: 0, y: 0 }, { x: maximum, y: 0 }, 1),
        sidePoints({ x: step, y: step }, { x: innerMaximum, y: step }, step)
      ],
      [
        sidePoints({ x: maximum, y: 0 }, { x: maximum, y: maximum }, 1),
        sidePoints({ x: innerMaximum, y: step }, { x: innerMaximum, y: innerMaximum }, step)
      ],
      [
        sidePoints({ x: maximum, y: maximum }, { x: 0, y: maximum }, 1),
        sidePoints({ x: innerMaximum, y: innerMaximum }, { x: step, y: innerMaximum }, step)
      ],
      [
        sidePoints({ x: 0, y: maximum }, { x: 0, y: 0 }, 1),
        sidePoints({ x: step, y: innerMaximum }, { x: step, y: step }, step)
      ]
    ];
    for (const [outer, inner] of sides) stitchSide(builder, outer, inner, hexSize);
  }
  function createSurfaceGroundGeometry(lod, hexSize = 1, heightScale = 1) {
    assertLod(lod);
    if (!Number.isFinite(hexSize) || hexSize <= 0) {
      throw new RangeError("surface ground hexSize must be finite and positive");
    }
    if (!Number.isFinite(heightScale) || heightScale <= 0) {
      throw new RangeError("surface ground heightScale must be finite and positive");
    }
    const builder = {
      positions: [],
      surfaceCoordinates: [],
      indices: [],
      vertexByPoint: /* @__PURE__ */ new Map()
    };
    const step = SURFACE_GROUND_LOD_GRID_STEPS[lod];
    if (step === 1) addUniformGrid(builder, step, hexSize);
    else addTransitionGrid(builder, step, hexSize);
    const geometry = new three.BufferGeometry();
    geometry.name = `surface-ground-lod-${lod}`;
    const position = new three.BufferAttribute(new Float32Array(builder.positions), 3);
    geometry.setAttribute("position", position);
    geometry.setAttribute("surfaceUv", new three.BufferAttribute(new Float32Array(builder.surfaceCoordinates), 2));
    geometry.setIndex(new three.BufferAttribute(new Uint16Array(builder.indices), 1));
    const horizontalBounds = new three.Box3().setFromBufferAttribute(position);
    geometry.boundingBox = new three.Box3(
      new three.Vector3(horizontalBounds.min.x, 0, horizontalBounds.min.z),
      new three.Vector3(horizontalBounds.max.x, heightScale, horizontalBounds.max.z)
    );
    geometry.boundingBox.getBoundingSphere(geometry.boundingSphere = new three.Sphere());
    const byteLength = geometry.getAttribute("position").array.byteLength + geometry.getAttribute("surfaceUv").array.byteLength + geometry.getIndex().array.byteLength;
    const info = Object.freeze({
      lod,
      interiorGridStep: step,
      vertexCount: builder.positions.length / 3,
      triangleCount: builder.indices.length / 3,
      byteLength
    });
    geometry.userData.surfaceGround = info;
    return geometry;
  }
  function getSurfaceGroundGeometryInfo(geometry) {
    const info = geometry?.userData?.surfaceGround;
    if (!info || info.lod !== 0 && info.lod !== 1 && info.lod !== 2 || info.interiorGridStep !== SURFACE_GROUND_LOD_GRID_STEPS[info.lod] || !Number.isInteger(info.vertexCount) || info.vertexCount <= 0 || !Number.isInteger(info.triangleCount) || info.triangleCount <= 0 || !Number.isSafeInteger(info.byteLength) || info.byteLength <= 0) {
      throw new TypeError("buffer geometry is not a valid surface ground geometry");
    }
    return info;
  }
  var SurfaceGroundGeometryPool = class {
    constructor(hexSize = 1, heightScale = 1) {
      this.hexSize = hexSize;
      this.heightScale = heightScale;
      this.geometries = /* @__PURE__ */ new Map();
      this.disposed = false;
      if (!Number.isFinite(hexSize) || hexSize <= 0) {
        throw new RangeError("surface ground geometry pool hexSize must be finite and positive");
      }
      if (!Number.isFinite(heightScale) || heightScale <= 0) {
        throw new RangeError("surface ground geometry pool heightScale must be finite and positive");
      }
    }
    get(lod) {
      if (this.disposed) throw new TypeError("surface ground geometry pool is disposed");
      assertLod(lod);
      let geometry = this.geometries.get(lod);
      if (!geometry) {
        geometry = createSurfaceGroundGeometry(lod, this.hexSize, this.heightScale);
        this.geometries.set(lod, geometry);
      }
      return geometry;
    }
    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      for (const geometry of this.geometries.values()) geometry.dispose();
      this.geometries.clear();
    }
    get stats() {
      let vertexCount = 0;
      let triangleCount = 0;
      let byteLength = 0;
      for (const geometry of this.geometries.values()) {
        const info = getSurfaceGroundGeometryInfo(geometry);
        vertexCount += info.vertexCount;
        triangleCount += info.triangleCount;
        byteLength += info.byteLength;
      }
      return Object.freeze({
        state: this.disposed ? "disposed" : "ready",
        geometryCount: this.geometries.size,
        vertexCount,
        triangleCount,
        byteLength
      });
    }
  };

  // src/rendering/SurfaceVisualShader.ts
  var SURFACE_VISUAL_PHASE_PERIOD = 192;
  var SURFACE_VISUAL_GRID_GLSL = (
    /* glsl */
    `
vec2 surfaceRoundedAxial(vec2 worldPosition) {
    float q = worldPosition.x / 1.5;
    float r = worldPosition.y / 1.7320508075688772 - 0.5 - q * 0.5;
    vec3 cube = vec3(q, -q - r, r);
    vec3 rounded = floor(cube + vec3(0.5));
    vec3 difference = abs(rounded - cube);
    if (difference.x > difference.y && difference.x > difference.z) {
        rounded.x = -rounded.y - rounded.z;
    } else if (difference.y > difference.z) {
        rounded.y = -rounded.x - rounded.z;
    } else {
        rounded.z = -rounded.x - rounded.y;
    }
    return vec2(rounded.x, rounded.z);
}

float surfaceHexBorderDistance(vec2 worldPosition) {
    vec2 axial = surfaceRoundedAxial(worldPosition);
    vec2 center = vec2(
        axial.x * 1.5,
        1.7320508075688772 * (axial.y + axial.x * 0.5 + 0.5)
    );
    vec2 local = abs(worldPosition - center);
    return max(0.0, min(
        0.8660254037844386 - local.y,
        0.8660254037844386 - (0.8660254037844386 * local.x + 0.5 * local.y)
    ));
}

float surfaceHexGridCoverage(vec2 worldPosition, float width) {
    float distanceToBorder = surfaceHexBorderDistance(worldPosition);
    float antialiasWidth = max(fwidth(distanceToBorder), 0.0005);
    return 1.0 - smoothstep(width, width + antialiasWidth, distanceToBorder);
}
`
  );

  // src/rendering/SurfacePresentationStyle.ts
  var DEFAULT_SURFACE_PRESENTATION_STYLE = Object.freeze({
    gridVisible: true,
    terrainDetailStrength: 1,
    waterWaveAmplitude: 1,
    waterWaveSpeed: 1,
    coastalWaveOpacity: 1,
    treesVisible: true,
    grassVisible: true,
    grassWindStrength: 1
  });
  var STYLE_FIELDS = Object.freeze(Object.keys(DEFAULT_SURFACE_PRESENTATION_STYLE));
  function assertUnitInterval(name, value) {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new RangeError(`${name} must be finite and between 0 and 1`);
    }
  }
  function assertRange(name, value, maximum) {
    if (!Number.isFinite(value) || value < 0 || value > maximum) {
      throw new RangeError(`${name} must be finite and between 0 and ${maximum}`);
    }
  }
  function createSurfacePresentationStyle(values = {}) {
    if (!values || typeof values !== "object" || Array.isArray(values) || Object.getOwnPropertyNames(values).some((name) => !STYLE_FIELDS.includes(name))) {
      throw new TypeError("surface presentation style is invalid");
    }
    const style = { ...DEFAULT_SURFACE_PRESENTATION_STYLE, ...values };
    if (typeof style.gridVisible !== "boolean" || typeof style.treesVisible !== "boolean" || typeof style.grassVisible !== "boolean") {
      throw new TypeError("surface presentation visibility values must be booleans");
    }
    assertRange("terrainDetailStrength", style.terrainDetailStrength, 2);
    assertRange("waterWaveAmplitude", style.waterWaveAmplitude, 4);
    assertRange("waterWaveSpeed", style.waterWaveSpeed, 4);
    assertUnitInterval("coastalWaveOpacity", style.coastalWaveOpacity);
    assertRange("grassWindStrength", style.grassWindStrength, 6);
    return Object.freeze(style);
  }

  // src/rendering/GroundLayer.ts
  var SURFACE_GROUND_NORMAL_SAMPLE_OFFSET = SURFACE_FIELD_GUTTER_TEXELS / (SURFACE_SAMPLES_PER_TILE_INTERVAL * 2);
  var SURFACE_GROUND_DEFAULT_MATERIAL_PALETTE = Object.freeze([
    6262078,
    13806952,
    11451328,
    6907746
  ]);
  var GROUND_VERTEX_SHADER = (
    /* glsl */
    `
in vec2 surfaceUv;

uniform sampler2DArray uSurfaceValues;
uniform float uLayer;
uniform float uHeightScale;
uniform float uHexSize;
uniform vec2 uChunkSurfacePhase;

out vec2 vSurfaceUv;
out vec2 vLogicalWorldXZ;
out vec3 vWorldNormal;
out float vGroundHeight;
out float vShoreDistance;

#include <fog_pars_vertex>

const float SURFACE_SAMPLES_PER_TILE = ${SURFACE_SAMPLES_PER_TILE_INTERVAL.toFixed(1)};
const float SURFACE_FIELD_MAX_TEXEL = 65.0;
const float SQRT_THREE = 1.7320508075688772;

float surfaceStagger(float u) {
    float column = floor(u);
    float amount = u - column;
    float parity = mod(mod(column, 2.0) + 2.0, 2.0);
    float first = parity < 0.5 ? 0.5 : 0.0;
    float second = 0.5 - first;
    return mix(first, second, amount);
}

vec2 surfaceWorld(vec2 localSurface) {
    return vec2(
        1.5 * localSurface.x,
        SQRT_THREE * (localSurface.y + surfaceStagger(localSurface.x))
    );
}

vec2 surfaceFieldCoordinate(vec2 localSurface) {
    return (localSurface + vec2(0.5)) * SURFACE_SAMPLES_PER_TILE + vec2(0.5);
}

vec4 sampleSurfaceValues(vec2 localSurface) {
    vec2 coordinate = clamp(surfaceFieldCoordinate(localSurface), vec2(0.0), vec2(SURFACE_FIELD_MAX_TEXEL));
    ivec2 first = ivec2(floor(coordinate));
    ivec2 second = min(first + ivec2(1), ivec2(65));
    vec2 amount = coordinate - vec2(first);
    vec4 top = mix(
        texelFetch(uSurfaceValues, ivec3(first.x, first.y, int(uLayer)), 0),
        texelFetch(uSurfaceValues, ivec3(second.x, first.y, int(uLayer)), 0),
        amount.x
    );
    vec4 bottom = mix(
        texelFetch(uSurfaceValues, ivec3(first.x, second.y, int(uLayer)), 0),
        texelFetch(uSurfaceValues, ivec3(second.x, second.y, int(uLayer)), 0),
        amount.x
    );
    return mix(top, bottom, amount.y);
}

void main() {
    vec4 surfaceValues = sampleSurfaceValues(surfaceUv);
    float groundHeight = surfaceValues.r * uHeightScale;
    // One physical gutter texel on either side supports a symmetric central
    // difference at the ownership boundary. Adjacent chunks therefore sample
    // the exact same two global positions and publish identical normals.
    float delta = ${SURFACE_GROUND_NORMAL_SAMPLE_OFFSET.toFixed(4)};
    vec2 lower = surfaceUv - vec2(delta);
    vec2 upper = surfaceUv + vec2(delta);
    float leftHeight = sampleSurfaceValues(vec2(lower.x, surfaceUv.y)).r * uHeightScale;
    float rightHeight = sampleSurfaceValues(vec2(upper.x, surfaceUv.y)).r * uHeightScale;
    float topHeight = sampleSurfaceValues(vec2(surfaceUv.x, lower.y)).r * uHeightScale;
    float bottomHeight = sampleSurfaceValues(vec2(surfaceUv.x, upper.y)).r * uHeightScale;
    vec2 leftWorld = surfaceWorld(vec2(lower.x, surfaceUv.y));
    vec2 rightWorld = surfaceWorld(vec2(upper.x, surfaceUv.y));
    vec2 topWorld = surfaceWorld(vec2(surfaceUv.x, lower.y));
    vec2 bottomWorld = surfaceWorld(vec2(surfaceUv.x, upper.y));
    vec3 tangentU = vec3(rightWorld.x - leftWorld.x, rightHeight - leftHeight, rightWorld.y - leftWorld.y);
    vec3 tangentV = vec3(bottomWorld.x - topWorld.x, bottomHeight - topHeight, bottomWorld.y - topWorld.y);
    vWorldNormal = normalize(mat3(modelMatrix) * normalize(cross(tangentV, tangentU)));
    vSurfaceUv = surfaceUv;
    vLogicalWorldXZ = surfaceWorld(uChunkSurfacePhase + surfaceUv) * uHexSize;
    vGroundHeight = surfaceValues.r;
    vShoreDistance = surfaceValues.a;
    vec3 displaced = vec3(position.x, groundHeight, position.z);
    vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
}
`
  );
  var GROUND_FRAGMENT_SHADER = (
    /* glsl */
    `
uniform sampler2DArray uSurfaceMaterial;
uniform sampler2DArray uFogTexture;
uniform float uLayer;
uniform bool uFogEnabled;
uniform vec4 uValidBounds;
uniform vec3 uMaterialPalette[4];
uniform float uHexSize;
uniform vec3 uGridColor;
uniform float uGridWidth;
uniform float uGridOpacity;
uniform float uDetailStrength;
uniform vec3 uSunDirection;
uniform vec3 uSunRadiance;
uniform vec3 uSkyDiffuseIrradiance;
uniform vec3 uGroundDiffuseIrradiance;

in vec2 vSurfaceUv;
in vec2 vLogicalWorldXZ;
in vec3 vWorldNormal;
in float vGroundHeight;
in float vShoreDistance;
out vec4 groundOutputColor;
#define gl_FragColor groundOutputColor

#include <fog_pars_fragment>

const float SURFACE_SAMPLES_PER_TILE = ${SURFACE_SAMPLES_PER_TILE_INTERVAL.toFixed(1)};
const float SURFACE_FIELD_MAX_TEXEL = 65.0;

vec2 surfaceFieldCoordinate(vec2 localSurface) {
    return (localSurface + vec2(0.5)) * SURFACE_SAMPLES_PER_TILE + vec2(0.5);
}

vec4 sampleSurfaceMaterial(vec2 localSurface) {
    vec2 coordinate = clamp(surfaceFieldCoordinate(localSurface), vec2(0.0), vec2(SURFACE_FIELD_MAX_TEXEL));
    ivec2 first = ivec2(floor(coordinate));
    ivec2 second = min(first + ivec2(1), ivec2(65));
    vec2 amount = coordinate - vec2(first);
    vec4 top = mix(
        texelFetch(uSurfaceMaterial, ivec3(first.x, first.y, int(uLayer)), 0),
        texelFetch(uSurfaceMaterial, ivec3(second.x, first.y, int(uLayer)), 0),
        amount.x
    );
    vec4 bottom = mix(
        texelFetch(uSurfaceMaterial, ivec3(first.x, second.y, int(uLayer)), 0),
        texelFetch(uSurfaceMaterial, ivec3(second.x, second.y, int(uLayer)), 0),
        amount.x
    );
    return mix(top, bottom, amount.y);
}

${SURFACE_VISUAL_GRID_GLSL}

float surfaceVisualHash(vec2 point, float period) {
    vec2 wrapped = mod(mod(point, period) + period, period);
    return fract(sin(dot(wrapped, vec2(127.1, 311.7))) * 43758.5453123);
}

float surfaceVisualNoise(vec2 point, float period) {
    vec2 cell = floor(point);
    vec2 amount = fract(point);
    vec2 smoothAmount = amount * amount * (3.0 - 2.0 * amount);
    float first = mix(
        surfaceVisualHash(cell, period),
        surfaceVisualHash(cell + vec2(1.0, 0.0), period),
        smoothAmount.x
    );
    float second = mix(
        surfaceVisualHash(cell + vec2(0.0, 1.0), period),
        surfaceVisualHash(cell + vec2(1.0, 1.0), period),
        smoothAmount.x
    );
    return mix(first, second, smoothAmount.y);
}

void main() {
    vec2 minimum = uValidBounds.xy - vec2(0.5);
    vec2 maximum = uValidBounds.zw - vec2(0.5);
    if (vSurfaceUv.x < minimum.x || vSurfaceUv.y < minimum.y
        || vSurfaceUv.x >= maximum.x || vSurfaceUv.y >= maximum.y) discard;

    vec4 weights = sampleSurfaceMaterial(vSurfaceUv);
    float weightSum = max(dot(weights, vec4(1.0)), 0.0001);
    vec3 albedo = (uMaterialPalette[0] * weights.r
        + uMaterialPalette[1] * weights.g
        + uMaterialPalette[2] * weights.b
        + uMaterialPalette[3] * weights.a) / weightSum;
    vec2 visualSurface = vec2(
        vLogicalWorldXZ.x / max(uHexSize * 1.5, 0.0001),
        vLogicalWorldXZ.y / max(uHexSize * 1.7320508075688772, 0.0001)
    );
    float broadDetail = surfaceVisualNoise(
        vec2(visualSurface.x + visualSurface.y, visualSurface.y - visualSurface.x) * 0.5,
        ${Math.round(SURFACE_VISUAL_PHASE_PERIOD / 2).toFixed(1)}
    );
    float fineDetail = surfaceVisualNoise(
        vec2(visualSurface.x * 2.0 + visualSurface.y, visualSurface.y * 2.0 - visualSurface.x),
        ${SURFACE_VISUAL_PHASE_PERIOD.toFixed(1)}
    );
    vec2 grainCoordinate = vec2(
        visualSurface.x * 3.0 + visualSurface.y,
        visualSurface.y * 3.0 - visualSurface.x
    ) * 4.0;
    float grain = surfaceVisualHash(floor(grainCoordinate), ${SURFACE_VISUAL_PHASE_PERIOD.toFixed(1)});
    float pixelSpan = max(length(dFdx(visualSurface)), length(dFdy(visualSurface)));
    float grainVisibility = 1.0 - smoothstep(0.035, 0.16, pixelSpan);
    float materialDetail = mix(0.82, 1.16, broadDetail) * mix(0.92, 1.08, fineDetail)
        * mix(1.0, mix(0.82, 1.18, grain), grainVisibility);
    vec4 normalizedWeights = weights / weightSum;
    vec3 climateTint = normalizedWeights.r * vec3(0.96, 1.05, 0.94)
        + normalizedWeights.g * vec3(1.12, 1.02, 0.84)
        + normalizedWeights.b * vec3(0.91, 0.98, 1.08)
        + normalizedWeights.a * vec3(0.88, 0.90, 0.92);
    albedo *= mix(vec3(1.0), materialDetail * climateTint, uDetailStrength);
    float shoreBand = (1.0 - smoothstep(0.04, 0.75, max(vShoreDistance, 0.0)))
        * step(0.0, vShoreDistance);
    albedo = mix(albedo, vec3(0.66, 0.57, 0.36) * mix(0.9, 1.1, fineDetail), shoreBand * 0.34);
    float snow = normalizedWeights.a * smoothstep(0.72, 0.94, vGroundHeight)
        * smoothstep(0.38, 0.72, broadDetail);
    albedo = mix(albedo, vec3(0.9, 0.93, 0.95), snow * 0.7);
    vec3 normal = normalize(vWorldNormal);
    float sunAmount = max(dot(normal, normalize(uSunDirection)), 0.0);
    float skyAmount = normal.y * 0.5 + 0.5;
    vec3 irradiance = uSunRadiance * sunAmount
        + uSkyDiffuseIrradiance * skyAmount
        + uGroundDiffuseIrradiance * (1.0 - skyAmount);
    vec3 linearColor = albedo * irradiance;
    if (uFogEnabled) {
        ivec2 fogCoordinate = ivec2(clamp(floor(vSurfaceUv + vec2(0.5)), vec2(0.0), vec2(15.0)));
        float visibility = texelFetch(uFogTexture, ivec3(fogCoordinate, int(uLayer)), 0).r;
        linearColor = mix(vec3(0.018, 0.022, 0.027), linearColor, visibility);
    }
    float grid = surfaceHexGridCoverage(vLogicalWorldXZ / uHexSize, uGridWidth);
    linearColor = mix(linearColor, uGridColor, grid * uGridOpacity);
    gl_FragColor = vec4(linearColor, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
}
`
  );
  function keyString(key2) {
    assertRenderKey2(key2);
    return `${key2.chunkX},${key2.chunkY}`;
  }
  function assertRenderKey2(key2) {
    if (!key2 || typeof key2 !== "object" || Object.getOwnPropertyNames(key2).some((name) => name !== "chunkX" && name !== "chunkY") || !Number.isSafeInteger(key2.chunkX) || !Number.isSafeInteger(key2.chunkY)) {
      throw new TypeError("GroundLayer render chunk key is invalid");
    }
  }
  function assertLod2(lod) {
    if (lod !== 0 && lod !== 1 && lod !== 2) throw new RangeError("ground chunk LOD must be 0, 1 or 2");
  }
  function assertLease(lease) {
    if (!lease || typeof lease !== "object" || typeof lease.isCurrent !== "function" || typeof lease.release !== "function" || lease.released || !lease.isCurrent()) {
      throw new TypeError("GroundLayer requires a current resident surface lease");
    }
    assertCompiledSurfaceChunk(lease.chunk);
    assertSurfaceRequestToken(lease.requestToken);
    if (lease.effectiveRevision !== lease.chunk.effectiveRevision || !surfaceDependencyKeysEqual(lease.dependencyKey, lease.chunk.dependencyKey)) {
      throw new TypeError("GroundLayer lease identity does not match its compiled chunk");
    }
  }
  function freezeMount(chunk) {
    return Object.freeze({
      key: chunk.key,
      mesh: chunk.mesh,
      slot: chunk.slot,
      lod: chunk.lod,
      effectiveRevision: chunk.lease.effectiveRevision
    });
  }
  var GroundLayer = class {
    constructor(options) {
      this.root = new three.Group();
      this.chunks = /* @__PURE__ */ new Map();
      this.materials = /* @__PURE__ */ new Map();
      this.style = DEFAULT_SURFACE_PRESENTATION_STYLE;
      this.floatingOriginX = 0;
      this.floatingOriginZ = 0;
      this.stateValue = "ready";
      if (!options || typeof options !== "object" || Object.getOwnPropertyNames(options).some((name) => ![
        "surfaceTexturePool",
        "fogTexturePool",
        "lighting",
        "geometryPool",
        "hexSize",
        "heightScale",
        "materialPalette"
      ].includes(name)) || !(options.surfaceTexturePool instanceof SurfaceTexturePool) || options.fogTexturePool !== void 0 && !(options.fogTexturePool instanceof SurfaceFogTexturePool) || options.geometryPool !== void 0 && !(options.geometryPool instanceof SurfaceGroundGeometryPool) || !(options.lighting instanceof LightingStateController)) {
        throw new TypeError("GroundLayer options are invalid");
      }
      if (options.surfaceTexturePool.state !== "ready" || options.fogTexturePool?.state === "disposed" || options.fogTexturePool?.state === "lost" || options.lighting.stats.state !== "ready") {
        throw new TypeError("GroundLayer dependencies must be ready");
      }
      if (options.fogTexturePool && !options.fogTexturePool.isCompanionOf(options.surfaceTexturePool)) {
        throw new TypeError("GroundLayer fog pool must accompany its surface texture pool");
      }
      if (options.geometryPool?.stats.state === "disposed") {
        throw new TypeError("GroundLayer geometry pool must be ready");
      }
      this.hexSize = options.hexSize ?? 1;
      this.heightScale = options.heightScale ?? 1;
      if (!Number.isFinite(this.hexSize) || this.hexSize <= 0 || !Number.isFinite(this.heightScale) || this.heightScale <= 0) {
        throw new RangeError("GroundLayer scales must be finite and positive");
      }
      const palette = options.materialPalette ?? SURFACE_GROUND_DEFAULT_MATERIAL_PALETTE;
      if (!Array.isArray(palette) || palette.length !== 4) {
        throw new TypeError("GroundLayer material palette must contain exactly four colors");
      }
      this.palette = Object.freeze(palette.map((value) => new three.Color(value)));
      this.surfaceTexturePool = options.surfaceTexturePool;
      this.fogTexturePool = options.fogTexturePool;
      this.lighting = options.lighting;
      this.geometryPool = options.geometryPool ?? new SurfaceGroundGeometryPool(this.hexSize, this.heightScale);
      this.ownsGeometryPool = options.geometryPool === void 0;
      this.root.name = "surface-ground-layer-v2";
      this.root.matrixAutoUpdate = true;
    }
    get state() {
      return this.stateValue;
    }
    setStyle(style) {
      this.assertNotDisposed();
      const validated = createSurfacePresentationStyle(style);
      this.style = validated;
      for (const page of this.materials.values()) {
        page.material.uniforms.uGridOpacity.value = validated.gridVisible ? 0.46 : 0;
        page.material.uniforms.uDetailStrength.value = validated.terrainDetailStrength;
      }
    }
    mount(lease, lod) {
      this.assertReady();
      assertLease(lease);
      assertLod2(lod);
      const key2 = lease.chunk.key;
      const serialized = keyString(key2);
      const existing = this.chunks.get(serialized);
      if (existing) {
        if (existing.lease === lease) throw new TypeError("surface lease is already mounted");
        if (existing.lease.released) {
          throw new TypeError("GroundLayer mounted lease was released outside its owner");
        }
        if (!this.surfaceTexturePool.upload(existing.slot, lease.chunk)) {
          throw new RangeError("GroundLayer texture slot became stale during replacement");
        }
        const previous = existing.lease;
        existing.lease = lease;
        if (existing.lod !== lod) {
          existing.lod = lod;
          existing.mesh.geometry = this.geometryPool.get(lod);
        }
        previous.release();
        return freezeMount(existing);
      }
      const slot = this.surfaceTexturePool.allocate(key2);
      try {
        if (!this.surfaceTexturePool.upload(slot, lease.chunk)) {
          throw new RangeError("GroundLayer texture slot became stale during initial upload");
        }
        const binding = this.surfaceTexturePool.getBinding(slot);
        const material = this.materialForBinding(binding);
        const mesh = new three.Mesh(this.geometryPool.get(lod), material.material);
        mesh.name = `surface-ground-${serialized}`;
        mesh.matrixAutoUpdate = true;
        const chunk = {
          key: Object.freeze({ ...key2 }),
          keyString: serialized,
          mesh,
          slot,
          lease,
          lod,
          hasFog: false
        };
        mesh.onBeforeRender = () => this.prepareDraw(chunk, material.material);
        this.positionChunk(chunk);
        this.chunks.set(serialized, chunk);
        this.root.add(mesh);
        return freezeMount(chunk);
      } catch (reason) {
        this.surfaceTexturePool.release(slot);
        throw reason;
      }
    }
    setLod(key2, lod) {
      this.assertReady();
      assertLod2(lod);
      const chunk = this.chunks.get(keyString(key2));
      if (!chunk) return false;
      if (chunk.lod === lod) return false;
      chunk.lod = lod;
      chunk.mesh.geometry = this.geometryPool.get(lod);
      return true;
    }
    uploadFog(key2, fog) {
      this.assertReady();
      if (!this.fogTexturePool) throw new TypeError("GroundLayer has no dynamic fog texture pool");
      if (!(fog instanceof Uint8Array) || fog.length !== SURFACE_FOG_LAYER_BYTES) {
        throw new TypeError("GroundLayer fog update must contain one 16x16 R8 layer");
      }
      const chunk = this.chunks.get(keyString(key2));
      if (!chunk) return false;
      if (!this.fogTexturePool.upload(chunk.slot, fog)) return false;
      chunk.hasFog = true;
      const fogBinding = this.fogTexturePool.getBinding(chunk.slot);
      const material = this.materials.get(chunk.slot.pageIndex);
      if (!material) throw new TypeError("GroundLayer material page is missing");
      material.material.uniforms.uFogTexture.value = fogBinding.texture;
      return true;
    }
    setFloatingOrigin(worldX, worldZ) {
      this.assertNotDisposed();
      if (!Number.isFinite(worldX) || !Number.isFinite(worldZ)) {
        throw new RangeError("GroundLayer floating origin must be finite");
      }
      this.floatingOriginX = worldX;
      this.floatingOriginZ = worldZ;
      for (const chunk of this.chunks.values()) this.positionChunk(chunk);
    }
    unmount(key2) {
      this.assertNotDisposed();
      const serialized = keyString(key2);
      const chunk = this.chunks.get(serialized);
      if (!chunk) return false;
      this.chunks.delete(serialized);
      this.root.remove(chunk.mesh);
      chunk.mesh.onBeforeRender = () => void 0;
      if (chunk.hasFog) this.fogTexturePool?.release(chunk.slot);
      this.surfaceTexturePool.release(chunk.slot);
      chunk.lease.release();
      return true;
    }
    handleContextLost() {
      this.assertNotDisposed();
      if (this.stateValue === "lost") return;
      this.fogTexturePool?.handleContextLost();
      this.surfaceTexturePool.handleContextLost();
      this.stateValue = "lost";
    }
    handleContextRestored() {
      this.assertNotDisposed();
      if (this.stateValue !== "lost") {
        throw new TypeError("GroundLayer context can only restore from the lost state");
      }
      this.surfaceTexturePool.handleContextRestored();
      this.fogTexturePool?.handleContextRestored();
      for (const page of this.materials.values()) page.material.needsUpdate = true;
      this.stateValue = "ready";
    }
    dispose() {
      if (this.stateValue === "disposed") return;
      for (const key2 of [...this.chunks.values()].map((chunk) => chunk.key)) this.unmount(key2);
      for (const page of this.materials.values()) {
        page.lighting.release();
        page.material.dispose();
      }
      this.materials.clear();
      if (this.ownsGeometryPool) this.geometryPool.dispose();
      this.root.removeFromParent();
      this.stateValue = "disposed";
    }
    get stats() {
      const lodCounts = [0, 0, 0];
      let foggedChunks = 0;
      for (const chunk of this.chunks.values()) {
        lodCounts[chunk.lod] += 1;
        if (chunk.hasFog) foggedChunks += 1;
      }
      const geometry = this.geometryPool.stats;
      return Object.freeze({
        state: this.stateValue,
        mountedChunks: this.chunks.size,
        lod0Chunks: lodCounts[0],
        lod1Chunks: lodCounts[1],
        lod2Chunks: lodCounts[2],
        foggedChunks,
        materialPages: this.materials.size,
        geometryBytes: geometry.byteLength,
        geometryVertices: geometry.vertexCount,
        geometryTriangles: geometry.triangleCount
      });
    }
    materialForBinding(binding) {
      let page = this.materials.get(binding.slot.pageIndex);
      if (page) return page;
      const lighting = this.lighting.bindUniforms();
      const material = new three.ShaderMaterial({
        name: `surface-ground-page-${binding.slot.pageIndex}`,
        glslVersion: three.GLSL3,
        vertexShader: GROUND_VERTEX_SHADER,
        fragmentShader: GROUND_FRAGMENT_SHADER,
        uniforms: {
          uSurfaceValues: new three.Uniform(binding.valuesTexture),
          uSurfaceMaterial: new three.Uniform(binding.materialTexture),
          uFogTexture: new three.Uniform(null),
          uLayer: new three.Uniform(0),
          uHeightScale: new three.Uniform(this.heightScale),
          uHexSize: new three.Uniform(this.hexSize),
          uChunkSurfacePhase: new three.Uniform(new three.Vector2()),
          uFogEnabled: new three.Uniform(false),
          uValidBounds: new three.Uniform(new three.Vector4(0, 0, 16, 16)),
          uMaterialPalette: new three.Uniform(this.palette),
          uGridColor: new three.Uniform(new three.Color(3353124)),
          uGridWidth: new three.Uniform(0.032),
          uGridOpacity: new three.Uniform(this.style.gridVisible ? 0.46 : 0),
          uDetailStrength: new three.Uniform(this.style.terrainDetailStrength),
          uSunDirection: lighting.sunDirection,
          uSunRadiance: lighting.sunRadiance,
          uSkyDiffuseIrradiance: lighting.skyDiffuseIrradiance,
          uGroundDiffuseIrradiance: lighting.groundDiffuseIrradiance,
          fogColor: new three.Uniform(new three.Color()),
          fogNear: new three.Uniform(1),
          fogFar: new three.Uniform(1e3)
        },
        side: three.DoubleSide,
        depthWrite: true,
        depthTest: true,
        transparent: false,
        fog: true,
        toneMapped: true
      });
      page = Object.freeze({ material, lighting });
      this.materials.set(binding.slot.pageIndex, page);
      return page;
    }
    prepareDraw(chunk, material) {
      if (!this.surfaceTexturePool.isCurrent(chunk.slot) || chunk.lease.released) {
        chunk.mesh.visible = false;
        return;
      }
      chunk.mesh.visible = true;
      material.uniforms.uLayer.value = chunk.slot.layerIndex;
      material.uniforms.uFogEnabled.value = chunk.hasFog;
      const originX = chunk.key.chunkX * SURFACE_RENDER_CHUNK_SIZE;
      const originY = chunk.key.chunkY * SURFACE_RENDER_CHUNK_SIZE;
      material.uniforms.uChunkSurfacePhase.value.set(
        (originX % SURFACE_VISUAL_PHASE_PERIOD + SURFACE_VISUAL_PHASE_PERIOD) % SURFACE_VISUAL_PHASE_PERIOD,
        (originY % SURFACE_VISUAL_PHASE_PERIOD + SURFACE_VISUAL_PHASE_PERIOD) % SURFACE_VISUAL_PHASE_PERIOD
      );
      const bounds = chunk.lease.chunk.bounds.validTiles;
      material.uniforms.uValidBounds.value.set(
        bounds.minX,
        bounds.minY,
        bounds.maxXExclusive,
        bounds.maxYExclusive
      );
      material.uniformsNeedUpdate = true;
    }
    positionChunk(chunk) {
      const surfaceX = chunk.key.chunkX * SURFACE_RENDER_CHUNK_SIZE;
      const surfaceY = chunk.key.chunkY * SURFACE_RENDER_CHUNK_SIZE;
      if (!Number.isSafeInteger(surfaceX) || !Number.isSafeInteger(surfaceY)) {
        throw new RangeError("GroundLayer render origin exceeds the safe integer domain");
      }
      chunk.mesh.position.set(
        1.5 * this.hexSize * surfaceX - this.floatingOriginX,
        0,
        Math.sqrt(3) * this.hexSize * surfaceY - this.floatingOriginZ
      );
      chunk.mesh.updateMatrix();
      chunk.mesh.updateMatrixWorld();
      const info = getSurfaceGroundGeometryInfo(chunk.mesh.geometry);
      if (info.lod !== chunk.lod) throw new TypeError("GroundLayer mounted the wrong shared LOD geometry");
    }
    assertReady() {
      this.assertNotDisposed();
      if (this.stateValue !== "ready") throw new TypeError("GroundLayer cannot mutate while context is lost");
    }
    assertNotDisposed() {
      if (this.stateValue === "disposed") throw new TypeError("GroundLayer is disposed");
    }
  };
  var VEGETATION_COLORS = Object.freeze({
    [0 /* Grass */]: Object.freeze([0.86, 1, 0.78]),
    [1 /* Palm */]: Object.freeze([1, 0.98, 0.8]),
    [2 /* Pinia */]: Object.freeze([0.8, 0.95, 0.85]),
    [3 /* Oak */]: Object.freeze([0.92, 1, 0.82])
  });
  var VEGETATION_VERTEX_SHADER = (
    /* glsl */
    `
in vec3 color;

uniform float uTime;
uniform float uWindStrength;
uniform bool uGrass;

out vec3 vWorldNormal;
out vec3 vVertexColor;
out float vHeight;

#include <fog_pars_vertex>

void main() {
    vec3 localPosition = position;
    if (uGrass) {
        localPosition.x += sin(uTime * 1.7 + position.y * 4.0)
            * position.y * 0.035 * uWindStrength;
    }
    vec4 instancePosition = instanceMatrix * vec4(localPosition, 1.0);
    vec4 worldPosition = modelMatrix * instancePosition;
    vWorldNormal = normalize(mat3(modelMatrix * instanceMatrix) * normal);
    vVertexColor = color;
    vHeight = clamp(position.y, 0.0, 1.0);
    vec4 mvPosition = viewMatrix * worldPosition;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
}
`
  );
  var VEGETATION_FRAGMENT_SHADER = (
    /* glsl */
    `
uniform vec3 uAlbedo;
uniform vec3 uSunDirection;
uniform vec3 uSunRadiance;
uniform vec3 uSkyDiffuseIrradiance;
uniform vec3 uGroundDiffuseIrradiance;

in vec3 vWorldNormal;
in vec3 vVertexColor;
in float vHeight;
out vec4 vegetationOutputColor;
#define gl_FragColor vegetationOutputColor

#include <fog_pars_fragment>

void main() {
    vec3 normal = normalize(vWorldNormal);
    float sunAmount = max(dot(normal, normalize(uSunDirection)), 0.0);
    float skyAmount = normal.y * 0.5 + 0.5;
    vec3 irradiance = uSunRadiance * sunAmount
        + uSkyDiffuseIrradiance * skyAmount
        + uGroundDiffuseIrradiance * (1.0 - skyAmount);
    vec3 albedo = uAlbedo * vVertexColor * mix(0.82, 1.08, vHeight);
    gl_FragColor = vec4(albedo * irradiance, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
}
`
  );
  function keyString2(key2) {
    if (!key2 || !Number.isSafeInteger(key2.chunkX) || !Number.isSafeInteger(key2.chunkY)) {
      throw new TypeError("VegetationLayer render chunk key is invalid");
    }
    return `${key2.chunkX},${key2.chunkY}`;
  }
  function assertLod3(lod) {
    if (lod !== 0 && lod !== 1 && lod !== 2) {
      throw new RangeError("vegetation chunk LOD must be 0, 1 or 2");
    }
  }
  function createGrassGeometry() {
    const geometry = new three.BufferGeometry();
    geometry.name = "surface-vegetation-grass";
    geometry.setAttribute("position", new three.BufferAttribute(new Float32Array([
      -0.5,
      0,
      0,
      0.5,
      0,
      0,
      0.34,
      1,
      0,
      -0.34,
      1,
      0,
      0,
      0,
      -0.5,
      0,
      0,
      0.5,
      0,
      1,
      0.34,
      0,
      1,
      -0.34
    ]), 3));
    geometry.setAttribute("normal", new three.BufferAttribute(new Float32Array([
      0,
      0,
      1,
      0,
      0,
      1,
      0,
      0,
      1,
      0,
      0,
      1,
      1,
      0,
      0,
      1,
      0,
      0,
      1,
      0,
      0,
      1,
      0,
      0
    ]), 3));
    geometry.setAttribute("color", new three.BufferAttribute(new Float32Array([
      0.11,
      0.3,
      0.06,
      0.11,
      0.3,
      0.06,
      0.31,
      0.62,
      0.13,
      0.31,
      0.62,
      0.13,
      0.11,
      0.3,
      0.06,
      0.11,
      0.3,
      0.06,
      0.31,
      0.62,
      0.13,
      0.31,
      0.62,
      0.13
    ]), 3));
    geometry.setIndex(new three.BufferAttribute(new Uint16Array([
      0,
      1,
      2,
      0,
      2,
      3,
      4,
      5,
      6,
      4,
      6,
      7
    ]), 1));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }
  function colorGeometry(geometry, color) {
    const count = geometry.getAttribute("position").count;
    const values = new Float32Array(count * 3);
    for (let index2 = 0; index2 < count; index2 += 1) values.set(color, index2 * 3);
    geometry.setAttribute("color", new three.BufferAttribute(values, 3));
    return geometry;
  }
  function mergeVegetationGeometry(name, parts) {
    const mergeParts = parts.map((part) => part.index ? part.toNonIndexed() : part);
    try {
      const attributeNames = ["position", "normal", "color"];
      const vertexCount = mergeParts.reduce((total, part) => {
        const position = part.getAttribute("position");
        if (!position || position.itemSize !== 3) {
          throw new TypeError(`${name} vegetation part has invalid positions`);
        }
        return total + position.count;
      }, 0);
      const geometry = new three.BufferGeometry();
      for (const attributeName of attributeNames) {
        const values = new Float32Array(vertexCount * 3);
        let offset = 0;
        for (const part of mergeParts) {
          const attribute = part.getAttribute(attributeName);
          if (!attribute || attribute.itemSize !== 3 || attribute.count !== part.getAttribute("position").count) {
            geometry.dispose();
            throw new TypeError(`${name} vegetation part has invalid ${attributeName}`);
          }
          for (let index2 = 0; index2 < attribute.count; index2 += 1) {
            values[offset++] = attribute.getX(index2);
            values[offset++] = attribute.getY(index2);
            values[offset++] = attribute.getZ(index2);
          }
        }
        geometry.setAttribute(attributeName, new three.BufferAttribute(values, 3));
      }
      geometry.name = name;
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      return geometry;
    } finally {
      for (const part of /* @__PURE__ */ new Set([...parts, ...mergeParts])) part.dispose();
    }
  }
  function createSpeciesGeometry(species) {
    if (species === 0 /* Grass */) return createGrassGeometry();
    const trunkHeight = species === 1 /* Palm */ ? 1.45 : 0.78;
    const trunk = colorGeometry(
      new three.CylinderGeometry(0.11, 0.16, trunkHeight, 6, 1),
      [0.3, 0.17, 0.07]
    );
    trunk.translate(0, trunkHeight * 0.5, 0);
    if (species === 1 /* Palm */) {
      const crown2 = colorGeometry(new three.ConeGeometry(0.82, 0.42, 7, 1), [0.2, 0.52, 0.12]);
      crown2.rotateX(Math.PI);
      crown2.translate(0, 1.56, 0);
      return mergeVegetationGeometry("surface-vegetation-palm", [trunk, crown2]);
    }
    if (species === 2 /* Pinia */) {
      const lower = colorGeometry(new three.ConeGeometry(0.68, 1.15, 7, 1), [0.08, 0.31, 0.13]);
      lower.translate(0, 0.96, 0);
      const upper = colorGeometry(new three.ConeGeometry(0.48, 0.92, 7, 1), [0.11, 0.4, 0.16]);
      upper.translate(0, 1.46, 0);
      return mergeVegetationGeometry("surface-vegetation-pinia", [trunk, lower, upper]);
    }
    const crown = colorGeometry(new three.DodecahedronGeometry(0.72, 0), [0.19, 0.46, 0.11]);
    crown.scale(1, 0.82, 1);
    crown.translate(0, 1.16, 0);
    return mergeVegetationGeometry("surface-vegetation-oak", [trunk, crown]);
  }
  function geometryByteLength(geometry) {
    let total = geometry.getIndex()?.array.byteLength ?? 0;
    for (const attribute of Object.values(geometry.attributes)) total += attribute.array.byteLength;
    return total;
  }
  function retainedAtLod(species, randomKey, lod) {
    if (lod === 0) return true;
    if (species === 0 /* Grass */) return lod === 1 && (randomKey & 1) === 0;
    return lod === 1 || (randomKey & 1) === 0;
  }
  function visibleInstanceCount(chunk) {
    return chunk.species.reduce((sum, value) => sum + value.mesh.count, 0);
  }
  function freezeMount2(chunk) {
    return Object.freeze({
      key: chunk.key,
      group: chunk.group,
      lod: chunk.lod,
      candidateCount: chunk.seeds.tileIndex.length,
      visibleInstanceCount: visibleInstanceCount(chunk)
    });
  }
  var VegetationLayer = class {
    constructor(options) {
      this.root = new three.Group();
      this.chunks = /* @__PURE__ */ new Map();
      this.geometries = /* @__PURE__ */ new Map();
      this.materials = /* @__PURE__ */ new Map();
      this.position = new three.Vector3();
      this.rotation = new three.Quaternion();
      this.scale = new three.Vector3();
      this.matrix = new three.Matrix4();
      this.up = new three.Vector3(0, 1, 0);
      this.floatingOriginX = 0;
      this.floatingOriginZ = 0;
      this.time = 0;
      this.style = DEFAULT_SURFACE_PRESENTATION_STYLE;
      this.stateValue = "ready";
      if (!options || typeof options !== "object" || Object.getOwnPropertyNames(options).some((name) => ![
        "surfaceTexturePool",
        "lighting",
        "hexSize",
        "heightScale"
      ].includes(name)) || !(options.surfaceTexturePool instanceof SurfaceTexturePool) || !(options.lighting instanceof LightingStateController) || options.surfaceTexturePool.state !== "ready" || options.lighting.stats.state !== "ready") {
        throw new TypeError("VegetationLayer options are invalid or not ready");
      }
      this.hexSize = options.hexSize ?? 1;
      this.heightScale = options.heightScale ?? 1;
      if (!Number.isFinite(this.hexSize) || this.hexSize <= 0 || !Number.isFinite(this.heightScale) || this.heightScale <= 0) {
        throw new RangeError("VegetationLayer scales must be finite and positive");
      }
      this.surfaceTexturePool = options.surfaceTexturePool;
      this.lighting = options.lighting;
      this.root.name = "surface-vegetation-layer-v2";
    }
    mount(chunk, ground) {
      this.assertReady();
      assertCompiledSurfaceChunk(chunk);
      assertLod3(ground.lod);
      if (chunk.key.chunkX !== ground.key.chunkX || chunk.key.chunkY !== ground.key.chunkY || !this.surfaceTexturePool.isCurrent(ground.slot)) {
        throw new TypeError("VegetationLayer requires the current matching ground mount");
      }
      const serialized = keyString2(chunk.key);
      const group = new three.Group();
      group.name = `surface-vegetation-${serialized}`;
      const bySpecies = /* @__PURE__ */ new Map();
      for (let index2 = 0; index2 < chunk.vegetationSeeds.species.length; index2 += 1) {
        const species = chunk.vegetationSeeds.species[index2];
        const indices = bySpecies.get(species) ?? [];
        indices.push(index2);
        bySpecies.set(species, indices);
      }
      const speciesInstances = [];
      for (const species of [
        0 /* Grass */,
        1 /* Palm */,
        2 /* Pinia */,
        3 /* Oak */
      ]) {
        const indices = bySpecies.get(species);
        if (!indices?.length) continue;
        const mesh = new three.InstancedMesh(
          this.geometryForSpecies(species),
          this.materialForSpecies(species).material,
          indices.length
        );
        mesh.name = `surface-vegetation-species-${species}-${serialized}`;
        mesh.instanceMatrix.setUsage(three.DynamicDrawUsage);
        mesh.renderOrder = 2;
        group.add(mesh);
        speciesInstances.push(Object.freeze({
          species,
          mesh,
          seedIndices: Object.freeze(indices)
        }));
      }
      const mounted = {
        key: Object.freeze({ ...chunk.key }),
        keyString: serialized,
        group,
        seeds: chunk.vegetationSeeds,
        species: Object.freeze(speciesInstances),
        lod: ground.lod
      };
      this.updateInstances(mounted);
      this.positionChunk(mounted);
      const previous = this.chunks.get(serialized);
      if (previous) this.removeChunk(previous);
      this.chunks.set(serialized, mounted);
      this.root.add(group);
      return freezeMount2(mounted);
    }
    setLod(key2, lod) {
      this.assertReady();
      assertLod3(lod);
      const chunk = this.chunks.get(keyString2(key2));
      if (!chunk || chunk.lod === lod) return false;
      chunk.lod = lod;
      this.updateInstances(chunk);
      return true;
    }
    setTime(seconds) {
      this.assertReady();
      if (!Number.isFinite(seconds) || seconds < 0) {
        throw new RangeError("vegetation time must be finite and non-negative");
      }
      this.time = seconds;
      for (const value of this.materials.values()) value.material.uniforms.uTime.value = seconds;
    }
    setStyle(style) {
      this.assertNotDisposed();
      const validated = createSurfacePresentationStyle(style);
      const visibilityChanged = validated.grassVisible !== this.style.grassVisible || validated.treesVisible !== this.style.treesVisible;
      this.style = validated;
      for (const value of this.materials.values()) {
        value.material.uniforms.uWindStrength.value = validated.grassWindStrength;
      }
      if (visibilityChanged) {
        for (const chunk of this.chunks.values()) this.updateInstances(chunk);
      }
    }
    setFloatingOrigin(worldX, worldZ) {
      this.assertNotDisposed();
      if (!Number.isFinite(worldX) || !Number.isFinite(worldZ)) {
        throw new RangeError("VegetationLayer floating origin must be finite");
      }
      this.floatingOriginX = worldX;
      this.floatingOriginZ = worldZ;
      for (const chunk of this.chunks.values()) this.positionChunk(chunk);
    }
    unmount(key2) {
      this.assertNotDisposed();
      const serialized = keyString2(key2);
      const chunk = this.chunks.get(serialized);
      if (!chunk) return false;
      this.chunks.delete(serialized);
      this.removeChunk(chunk);
      return true;
    }
    handleContextLost() {
      this.assertNotDisposed();
      this.stateValue = "lost";
    }
    handleContextRestored() {
      this.assertNotDisposed();
      if (this.stateValue !== "lost") {
        throw new TypeError("VegetationLayer context can only restore from lost");
      }
      for (const material of this.materials.values()) material.material.needsUpdate = true;
      for (const chunk of this.chunks.values()) {
        for (const species of chunk.species) species.mesh.instanceMatrix.needsUpdate = true;
      }
      this.stateValue = "ready";
    }
    dispose() {
      if (this.stateValue === "disposed") return;
      for (const chunk of this.chunks.values()) this.removeChunk(chunk);
      this.chunks.clear();
      for (const value of this.materials.values()) {
        value.lighting.release();
        value.material.dispose();
      }
      for (const geometry of this.geometries.values()) geometry.dispose();
      this.materials.clear();
      this.geometries.clear();
      this.root.removeFromParent();
      this.stateValue = "disposed";
    }
    get stats() {
      let candidateCount = 0;
      let visible = 0;
      let grass = 0;
      let trees = 0;
      let meshes = 0;
      for (const chunk of this.chunks.values()) {
        candidateCount += chunk.seeds.tileIndex.length;
        for (const species of chunk.species) {
          meshes += 1;
          visible += species.mesh.count;
          if (species.species === 0 /* Grass */) grass += species.mesh.count;
          else trees += species.mesh.count;
        }
      }
      let bytes = 0;
      for (const geometry of this.geometries.values()) bytes += geometryByteLength(geometry);
      return Object.freeze({
        state: this.stateValue,
        mountedChunks: this.chunks.size,
        instancedMeshes: meshes,
        candidateCount,
        visibleInstanceCount: visible,
        grassInstances: grass,
        treeInstances: trees,
        geometryBytes: bytes
      });
    }
    geometryForSpecies(species) {
      let geometry = this.geometries.get(species);
      if (!geometry) {
        geometry = createSpeciesGeometry(species);
        this.geometries.set(species, geometry);
      }
      return geometry;
    }
    materialForSpecies(species) {
      let value = this.materials.get(species);
      if (value) return value;
      const lighting = this.lighting.bindUniforms();
      const material = new three.ShaderMaterial({
        name: `surface-vegetation-material-${species}`,
        glslVersion: three.GLSL3,
        vertexShader: VEGETATION_VERTEX_SHADER,
        fragmentShader: VEGETATION_FRAGMENT_SHADER,
        uniforms: {
          uTime: new three.Uniform(this.time),
          uWindStrength: new three.Uniform(this.style.grassWindStrength),
          uGrass: new three.Uniform(species === 0 /* Grass */),
          uAlbedo: new three.Uniform(new three.Vector3(...VEGETATION_COLORS[species])),
          uSunDirection: lighting.sunDirection,
          uSunRadiance: lighting.sunRadiance,
          uSkyDiffuseIrradiance: lighting.skyDiffuseIrradiance,
          uGroundDiffuseIrradiance: lighting.groundDiffuseIrradiance,
          fogColor: new three.Uniform(new three.Color()),
          fogNear: new three.Uniform(1),
          fogFar: new three.Uniform(1e3)
        },
        side: three.DoubleSide,
        depthWrite: true,
        depthTest: true,
        transparent: false,
        fog: true,
        toneMapped: true
      });
      value = Object.freeze({ material, lighting });
      this.materials.set(species, value);
      return value;
    }
    updateInstances(chunk) {
      for (const value of chunk.species) {
        let outputIndex = 0;
        for (const seedIndex of value.seedIndices) {
          if (value.species === 0 /* Grass */ ? !this.style.grassVisible : !this.style.treesVisible) continue;
          if (!retainedAtLod(value.species, chunk.seeds.randomKey[seedIndex], chunk.lod)) continue;
          const localU = chunk.seeds.surfaceCoordinates[seedIndex * 2] / SURFACE_VEGETATION_COORDINATE_SCALE;
          const localV = chunk.seeds.surfaceCoordinates[seedIndex * 2 + 1] / SURFACE_VEGETATION_COORDINATE_SCALE;
          const world = surfaceToWorld(localU, localV, this.hexSize);
          this.position.set(
            world.x,
            chunk.seeds.groundHeight[seedIndex] / 65535 * this.heightScale,
            world.z
          );
          this.rotation.setFromAxisAngle(
            this.up,
            chunk.seeds.rotation[seedIndex] / 65535 * Math.PI * 2
          );
          const randomScale = chunk.seeds.scale[seedIndex] / 255;
          const baseScale = value.species === 0 /* Grass */ ? this.hexSize * 0.34 : this.hexSize * 0.86;
          this.scale.setScalar(baseScale * randomScale);
          this.matrix.compose(this.position, this.rotation, this.scale);
          value.mesh.setMatrixAt(outputIndex, this.matrix);
          outputIndex += 1;
        }
        value.mesh.count = outputIndex;
        value.mesh.instanceMatrix.needsUpdate = true;
        value.mesh.computeBoundingBox();
        value.mesh.computeBoundingSphere();
      }
    }
    positionChunk(chunk) {
      const surfaceX = chunk.key.chunkX * SURFACE_RENDER_CHUNK_SIZE;
      const surfaceY = chunk.key.chunkY * SURFACE_RENDER_CHUNK_SIZE;
      if (!Number.isSafeInteger(surfaceX) || !Number.isSafeInteger(surfaceY)) {
        throw new RangeError("VegetationLayer render origin exceeds the safe integer domain");
      }
      chunk.group.position.set(
        1.5 * this.hexSize * surfaceX - this.floatingOriginX,
        0,
        Math.sqrt(3) * this.hexSize * surfaceY - this.floatingOriginZ
      );
      chunk.group.updateMatrix();
      chunk.group.updateMatrixWorld();
    }
    removeChunk(chunk) {
      this.root.remove(chunk.group);
      for (const species of chunk.species) species.mesh.dispose();
      chunk.group.clear();
    }
    assertReady() {
      this.assertNotDisposed();
      if (this.stateValue !== "ready") {
        throw new TypeError("VegetationLayer cannot mutate while context is lost");
      }
    }
    assertNotDisposed() {
      if (this.stateValue === "disposed") throw new TypeError("VegetationLayer is disposed");
    }
  };
  var WATER_VERTEX_SHADER = (
    /* glsl */
    `
in vec2 surfaceUv;

uniform sampler2DArray uSurfaceValues;
uniform sampler2DArray uSurfaceFlow;
uniform sampler2DArray uSurfaceWater;
uniform float uLayer;
uniform float uHeightScale;
uniform float uHexSize;
uniform float uTime;
uniform float uWaveAmplitude;
uniform float uWaveSpeed;
uniform vec2 uChunkSurfacePhase;

out vec2 vSurfaceUv;
out vec2 vFlow;
out float vDepth;
out float vShoreDistance;
out vec3 vWaterWorldPosition;
out vec2 vLogicalWorldXZ;
out vec2 vVisualSurface;

#include <fog_pars_vertex>

const float SURFACE_SAMPLES_PER_TILE = ${SURFACE_SAMPLES_PER_TILE_INTERVAL.toFixed(1)};
const float SURFACE_FIELD_MAX_TEXEL = 65.0;
const float TWO_PI = 6.283185307179586;
const float SQRT_THREE = 1.7320508075688772;

float surfaceStagger(float u) {
    float column = floor(u);
    float amount = u - column;
    float parity = mod(mod(column, 2.0) + 2.0, 2.0);
    float first = parity < 0.5 ? 0.5 : 0.0;
    float second = 0.5 - first;
    return mix(first, second, amount);
}

vec2 surfaceWorld(vec2 localSurface) {
    return vec2(
        1.5 * localSurface.x,
        SQRT_THREE * (localSurface.y + surfaceStagger(localSurface.x))
    );
}

vec2 surfaceFieldCoordinate(vec2 localSurface) {
    return (localSurface + vec2(0.5)) * SURFACE_SAMPLES_PER_TILE + vec2(0.5);
}

vec4 sampleBilinear(sampler2DArray source, vec2 localSurface) {
    vec2 coordinate = clamp(surfaceFieldCoordinate(localSurface), vec2(0.0), vec2(SURFACE_FIELD_MAX_TEXEL));
    ivec2 first = ivec2(floor(coordinate));
    ivec2 second = min(first + ivec2(1), ivec2(65));
    vec2 amount = coordinate - vec2(first);
    vec4 top = mix(
        texelFetch(source, ivec3(first.x, first.y, int(uLayer)), 0),
        texelFetch(source, ivec3(second.x, first.y, int(uLayer)), 0),
        amount.x
    );
    vec4 bottom = mix(
        texelFetch(source, ivec3(first.x, second.y, int(uLayer)), 0),
        texelFetch(source, ivec3(second.x, second.y, int(uLayer)), 0),
        amount.x
    );
    return mix(top, bottom, amount.y);
}

float sampleCoverageWeightedWaterLevel(vec2 localSurface, float fallbackLevel) {
    vec2 coordinate = clamp(surfaceFieldCoordinate(localSurface), vec2(0.0), vec2(SURFACE_FIELD_MAX_TEXEL));
    ivec2 first = ivec2(floor(coordinate));
    ivec2 second = min(first + ivec2(1), ivec2(65));
    vec2 amount = coordinate - vec2(first);
    vec4 interpolation = vec4(
        (1.0 - amount.x) * (1.0 - amount.y),
        amount.x * (1.0 - amount.y),
        (1.0 - amount.x) * amount.y,
        amount.x * amount.y
    );
    vec4 coverage = vec4(
        texelFetch(uSurfaceWater, ivec3(first.x, first.y, int(uLayer)), 0).r,
        texelFetch(uSurfaceWater, ivec3(second.x, first.y, int(uLayer)), 0).r,
        texelFetch(uSurfaceWater, ivec3(first.x, second.y, int(uLayer)), 0).r,
        texelFetch(uSurfaceWater, ivec3(second.x, second.y, int(uLayer)), 0).r
    );
    vec4 level = vec4(
        texelFetch(uSurfaceValues, ivec3(first.x, first.y, int(uLayer)), 0).g,
        texelFetch(uSurfaceValues, ivec3(second.x, first.y, int(uLayer)), 0).g,
        texelFetch(uSurfaceValues, ivec3(first.x, second.y, int(uLayer)), 0).g,
        texelFetch(uSurfaceValues, ivec3(second.x, second.y, int(uLayer)), 0).g
    );
    vec4 coveredInterpolation = interpolation * coverage;
    float totalCoverage = dot(coveredInterpolation, vec4(1.0));
    return totalCoverage > 0.000001
        ? dot(coveredInterpolation, level) / totalCoverage
        : fallbackLevel;
}

void main() {
    vec4 values = sampleBilinear(uSurfaceValues, surfaceUv);
    float waterLevel = sampleCoverageWeightedWaterLevel(surfaceUv, values.g);
    vec2 flow = sampleBilinear(uSurfaceFlow, surfaceUv).rg;
    ivec2 categoricalCoordinate = ivec2(clamp(
        floor(surfaceFieldCoordinate(surfaceUv) + vec2(0.5)),
        vec2(0.0),
        vec2(SURFACE_FIELD_MAX_TEXEL)
    ));
    vec3 waterClass = texelFetch(
        uSurfaceWater,
        ivec3(categoricalCoordinate, int(uLayer)),
        0
    ).rgb * 255.0;
    float waterKind = waterClass.g;
    float waterProfile = waterClass.b;
    float animationTime = uTime * uWaveSpeed;
    vec2 globalSurface = uChunkSurfacePhase + surfaceUv;
    float profilePhase = waterProfile / 255.0;
    float oceanWave = sin(globalSurface.x * TWO_PI / 64.0 + animationTime * 1.1)
        * cos(globalSurface.y * TWO_PI / 96.0 - animationTime * 0.83) * 0.012;
    float lakeWave = sin((globalSurface.x + globalSurface.y) * TWO_PI / 48.0
        + animationTime * 0.65) * 0.004;
    float riverX = sin(globalSurface.x * TWO_PI / 32.0 - animationTime * sign(flow.x) * 1.8);
    float riverY = sin(globalSurface.y * TWO_PI / 32.0 - animationTime * sign(flow.y) * 1.8);
    float flowWeight = max(abs(flow.x) + abs(flow.y), 0.0001);
    float riverWave = (riverX * abs(flow.x) + riverY * abs(flow.y)) / flowWeight * 0.003;
    float wave = waterKind > 2.5 ? riverWave : waterKind > 1.5 ? lakeWave : oceanWave;
    wave *= mix(0.85, 1.15, profilePhase);
    wave *= smoothstep(0.0, 0.12, values.b) * smoothstep(0.02, 0.35, -values.a);
    wave *= uWaveAmplitude;
    vSurfaceUv = surfaceUv;
    vFlow = flow;
    vDepth = values.b;
    vShoreDistance = values.a;
    vLogicalWorldXZ = surfaceWorld(globalSurface) * uHexSize;
    vVisualSurface = globalSurface;
    vec3 displaced = vec3(position.x, waterLevel * uHeightScale + wave * uHeightScale, position.z);
    vWaterWorldPosition = (modelMatrix * vec4(displaced, 1.0)).xyz;
    vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
}
`
  );
  var WATER_FRAGMENT_SHADER = (
    /* glsl */
    `
uniform sampler2DArray uSurfaceWater;
uniform float uLayer;
uniform vec4 uValidBounds;
uniform vec3 uSunDirection;
uniform vec3 uSunRadiance;
uniform vec3 uSkyDiffuseIrradiance;
uniform vec3 uGroundDiffuseIrradiance;
uniform float uTime;
uniform float uWaveAmplitude;
uniform float uWaveSpeed;
uniform float uFoamOpacity;
uniform float uHexSize;
uniform vec3 uGridColor;
uniform float uGridWidth;
uniform float uGridOpacity;

in vec2 vSurfaceUv;
in vec2 vFlow;
in float vDepth;
in float vShoreDistance;
in vec3 vWaterWorldPosition;
in vec2 vLogicalWorldXZ;
in vec2 vVisualSurface;
out vec4 waterOutputColor;
#define gl_FragColor waterOutputColor

#include <fog_pars_fragment>

${SURFACE_VISUAL_GRID_GLSL}

float surfaceWaterHash(vec2 point) {
    vec2 wrapped = mod(mod(point, ${SURFACE_VISUAL_PHASE_PERIOD.toFixed(1)})
        + ${SURFACE_VISUAL_PHASE_PERIOD.toFixed(1)}, ${SURFACE_VISUAL_PHASE_PERIOD.toFixed(1)});
    return fract(sin(dot(wrapped, vec2(127.1, 311.7))) * 43758.5453123);
}

float surfaceWaterNoise(vec2 point) {
    vec2 cell = floor(point);
    vec2 amount = fract(point);
    vec2 smoothAmount = amount * amount * (3.0 - 2.0 * amount);
    return mix(
        mix(surfaceWaterHash(cell), surfaceWaterHash(cell + vec2(1.0, 0.0)), smoothAmount.x),
        mix(surfaceWaterHash(cell + vec2(0.0, 1.0)), surfaceWaterHash(cell + vec2(1.0)), smoothAmount.x),
        smoothAmount.y
    );
}

vec2 surfaceWaterFieldCoordinate(vec2 localSurface) {
    return (localSurface + vec2(0.5)) * ${SURFACE_SAMPLES_PER_TILE_INTERVAL.toFixed(1)} + vec2(0.5);
}

void main() {
    float animationTime = uTime * uWaveSpeed;
    vec2 minimum = uValidBounds.xy - vec2(0.5);
    vec2 maximum = uValidBounds.zw - vec2(0.5);
    if (vSurfaceUv.x < minimum.x || vSurfaceUv.y < minimum.y
        || vSurfaceUv.x >= maximum.x || vSurfaceUv.y >= maximum.y) discard;
    ivec2 categoricalCoordinate = ivec2(clamp(
        floor(surfaceWaterFieldCoordinate(vSurfaceUv) + vec2(0.5)),
        vec2(0.0),
        vec2(65.0)
    ));
    vec3 waterClass = texelFetch(
        uSurfaceWater,
        ivec3(categoricalCoordinate, int(uLayer)),
        0
    ).rgb * 255.0;
    float waterKind = waterClass.g;
    float waterProfile = waterClass.b;
    float depthAmount = smoothstep(0.008, 0.11, vDepth);
    vec3 shallow = waterKind > 2.5 ? vec3(0.08, 0.34, 0.37)
        : waterKind > 1.5 ? vec3(0.065, 0.32, 0.29) : vec3(0.045, 0.30, 0.34);
    vec3 deep = waterKind > 2.5 ? vec3(0.012, 0.085, 0.12)
        : waterKind > 1.5 ? vec3(0.008, 0.065, 0.095) : vec3(0.004, 0.028, 0.09);
    float riverAmount = step(2.5, waterKind);
    float lakeAmount = step(1.5, waterKind) - riverAmount;
    float oceanAmount = 1.0 - lakeAmount - riverAmount;
    float waveStrength = (oceanAmount * 0.15 + lakeAmount * 0.065
        + riverAmount * 0.04) * uWaveAmplitude;
    float waveX = cos(vVisualSurface.x * 0.41 + animationTime * 1.35)
        + 0.55 * cos((vVisualSurface.x + vVisualSurface.y) * 0.73 - animationTime * 0.86);
    float waveY = sin(vVisualSurface.y * 0.37 - animationTime * 1.08)
        + 0.5 * sin((vVisualSurface.y - vVisualSurface.x) * 0.81 + animationTime * 0.72);
    vec3 flowNormal = normalize(vec3(
        -waveX * waveStrength - vFlow.y * 0.09,
        1.0,
        -waveY * waveStrength + vFlow.x * 0.09
    ));
    vec3 viewDirection = normalize(cameraPosition - vWaterWorldPosition);
    float fresnel = pow(1.0 - max(dot(flowNormal, viewDirection), 0.0), 5.0);
    vec3 halfDirection = normalize(viewDirection + normalize(uSunDirection));
    float sunAmount = pow(max(dot(flowNormal, halfDirection), 0.0), 64.0);
    float shoreDepth = max(-vShoreDistance, 0.0);
    float shoreMask = 1.0 - smoothstep(0.035, 0.32, shoreDepth);
    float foamNoise = surfaceWaterNoise(vVisualSurface * 2.0 - vec2(0.0, animationTime * 0.18));
    float foamBand = smoothstep(0.64, 0.94,
        sin(shoreDepth * 34.0 - animationTime * 2.1 + foamNoise * 2.4) * 0.5 + 0.5);
    float foam = shoreMask * max(
        1.0 - smoothstep(0.0, 0.055, shoreDepth),
        foamBand * 0.72
    );
    vec3 environment = uSkyDiffuseIrradiance * (0.24 + fresnel * 0.76)
        + uGroundDiffuseIrradiance * 0.08;
    float profileTint = waterProfile / 255.0;
    vec3 bodyColor = mix(shallow, deep, depthAmount)
        * mix(vec3(0.94, 1.0, 1.04), vec3(1.04, 0.98, 0.92), profileTint);
    float rippleLight = mix(0.9, 1.1, surfaceWaterNoise(
        vec2(vVisualSurface.x + vVisualSurface.y, vVisualSurface.y - vVisualSurface.x)
            + vec2(animationTime * 0.22, -animationTime * 0.16)
    ));
    vec3 linearColor = bodyColor * (vec3(0.42) + environment * 0.78) * rippleLight
        + uSunRadiance * sunAmount * 0.72
        + vec3(0.82, 0.92, 0.9) * foam * 0.68 * uFoamOpacity;
    float waveCrest = smoothstep(0.72, 1.65, abs(waveX + waveY) * uWaveAmplitude);
    linearColor += vec3(0.12, 0.22, 0.3) * waveCrest * (0.25 + oceanAmount * 0.75);
    linearColor = mix(linearColor, uSkyDiffuseIrradiance * 1.05, fresnel * 0.26);
    float grid = surfaceHexGridCoverage(vLogicalWorldXZ / uHexSize, uGridWidth);
    linearColor = mix(linearColor, uGridColor, grid * uGridOpacity);
    gl_FragColor = vec4(linearColor, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
}
`
  );
  function keyString3(key2) {
    if (!key2 || !Number.isSafeInteger(key2.chunkX) || !Number.isSafeInteger(key2.chunkY)) {
      throw new TypeError("WaterLayer render chunk key is invalid");
    }
    return `${key2.chunkX},${key2.chunkY}`;
  }
  function assertLod4(lod) {
    if (lod !== 0 && lod !== 1 && lod !== 2) throw new RangeError("water chunk LOD must be 0, 1 or 2");
  }
  function createCompiledWaterGeometry(source, hexSize, heightScale) {
    const vertexCount = source.surfaceUv.length / 2;
    const guardedSurfaceUv = createGuardedSurfaceCoordinates(source.surfaceUv);
    const positions = new Float32Array(vertexCount * 3);
    for (let index2 = 0; index2 < vertexCount; index2 += 1) {
      const coordinate = surfaceToWorld(
        guardedSurfaceUv[index2 * 2],
        guardedSurfaceUv[index2 * 2 + 1],
        hexSize
      );
      positions[index2 * 3] = coordinate.x;
      positions[index2 * 3 + 2] = coordinate.z;
    }
    const geometry = new three.BufferGeometry();
    geometry.name = "surface-water-compiled";
    geometry.setAttribute("position", new three.BufferAttribute(positions, 3));
    geometry.setAttribute("surfaceUv", new three.BufferAttribute(source.surfaceUv, 2));
    geometry.setIndex(new three.BufferAttribute(source.indices, 1));
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox ?? new three.Box3();
    geometry.boundingBox = new three.Box3(
      new three.Vector3(bounds.min.x, -heightScale * 0.02, bounds.min.z),
      new three.Vector3(bounds.max.x, heightScale * 1.02, bounds.max.z)
    );
    geometry.boundingBox.getBoundingSphere(geometry.boundingSphere = new three.Sphere());
    geometry.userData.surfaceWaterByteLength = positions.byteLength + source.surfaceUv.byteLength + source.indices.byteLength;
    return geometry;
  }
  function freezeMount3(chunk) {
    return Object.freeze({
      key: chunk.key,
      kind: chunk.kind,
      mesh: chunk.mesh,
      slot: chunk.slot,
      lod: chunk.lod
    });
  }
  var WaterLayer = class {
    constructor(options) {
      this.root = new three.Group();
      this.chunks = /* @__PURE__ */ new Map();
      this.materials = /* @__PURE__ */ new Map();
      this.style = DEFAULT_SURFACE_PRESENTATION_STYLE;
      this.floatingOriginX = 0;
      this.floatingOriginZ = 0;
      this.time = 0;
      this.stateValue = "ready";
      if (!options || typeof options !== "object" || Object.getOwnPropertyNames(options).some((name) => ![
        "surfaceTexturePool",
        "lighting",
        "geometryPool",
        "hexSize",
        "heightScale"
      ].includes(name)) || !(options.surfaceTexturePool instanceof SurfaceTexturePool) || !(options.lighting instanceof LightingStateController) || !(options.geometryPool instanceof SurfaceGroundGeometryPool) || options.surfaceTexturePool.state !== "ready" || options.lighting.stats.state !== "ready" || options.geometryPool.stats.state !== "ready") {
        throw new TypeError("WaterLayer options are invalid or not ready");
      }
      this.hexSize = options.hexSize ?? 1;
      this.heightScale = options.heightScale ?? 1;
      if (!Number.isFinite(this.hexSize) || this.hexSize <= 0 || !Number.isFinite(this.heightScale) || this.heightScale <= 0) {
        throw new RangeError("WaterLayer scales must be finite and positive");
      }
      this.surfaceTexturePool = options.surfaceTexturePool;
      this.lighting = options.lighting;
      this.geometryPool = options.geometryPool;
      this.root.name = "surface-water-layer-v2";
    }
    setStyle(style) {
      this.assertNotDisposed();
      const validated = createSurfacePresentationStyle(style);
      this.style = validated;
      for (const page of this.materials.values()) {
        const uniforms = page.material.uniforms;
        uniforms.uGridOpacity.value = validated.gridVisible ? 0.52 : 0;
        uniforms.uWaveAmplitude.value = validated.waterWaveAmplitude;
        uniforms.uWaveSpeed.value = validated.waterWaveSpeed;
        uniforms.uFoamOpacity.value = validated.coastalWaveOpacity;
      }
    }
    mount(chunk, ground) {
      this.assertReady();
      assertCompiledSurfaceChunk(chunk);
      assertLod4(ground.lod);
      if (chunk.key.chunkX !== ground.key.chunkX || chunk.key.chunkY !== ground.key.chunkY || !this.surfaceTexturePool.isCurrent(ground.slot)) {
        throw new TypeError("WaterLayer requires the current matching ground mount");
      }
      const serialized = keyString3(chunk.key);
      const binding = this.surfaceTexturePool.getBinding(ground.slot);
      let geometry;
      let ownsGeometry = false;
      if (chunk.waterGeometry.kind === "full") geometry = this.geometryPool.get(ground.lod);
      else if (chunk.waterGeometry.kind === "coverage" || chunk.waterGeometry.kind === "sweep") {
        geometry = createCompiledWaterGeometry(chunk.waterGeometry.mesh, this.hexSize, this.heightScale);
        ownsGeometry = true;
      }
      const materialPage = geometry ? this.materialForBinding(binding) : void 0;
      const mesh = geometry && materialPage ? new three.Mesh(geometry, materialPage.material) : null;
      const mounted = {
        key: Object.freeze({ ...chunk.key }),
        keyString: serialized,
        slot: ground.slot,
        kind: chunk.waterGeometry.kind,
        mesh,
        ownsGeometry,
        lod: ground.lod
      };
      if (mesh && materialPage) {
        mesh.name = `surface-water-${chunk.waterGeometry.kind}-${serialized}`;
        mesh.renderOrder = 1;
        mesh.onBeforeRender = () => this.prepareDraw(mounted, chunk, materialPage.material);
        this.positionChunk(mounted);
      }
      const previous = this.chunks.get(serialized);
      if (previous) this.removeChunk(previous);
      this.chunks.set(serialized, mounted);
      if (mesh) this.root.add(mesh);
      return freezeMount3(mounted);
    }
    setLod(key2, lod) {
      this.assertReady();
      assertLod4(lod);
      const chunk = this.chunks.get(keyString3(key2));
      if (!chunk || chunk.lod === lod) return false;
      chunk.lod = lod;
      if (chunk.kind === "full" && chunk.mesh) chunk.mesh.geometry = this.geometryPool.get(lod);
      return true;
    }
    setTime(seconds) {
      this.assertReady();
      if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError("water time must be finite and non-negative");
      this.time = seconds;
    }
    setFloatingOrigin(worldX, worldZ) {
      this.assertNotDisposed();
      if (!Number.isFinite(worldX) || !Number.isFinite(worldZ)) {
        throw new RangeError("WaterLayer floating origin must be finite");
      }
      this.floatingOriginX = worldX;
      this.floatingOriginZ = worldZ;
      for (const chunk of this.chunks.values()) this.positionChunk(chunk);
    }
    unmount(key2) {
      this.assertNotDisposed();
      const serialized = keyString3(key2);
      const chunk = this.chunks.get(serialized);
      if (!chunk) return false;
      this.chunks.delete(serialized);
      this.removeChunk(chunk);
      return true;
    }
    handleContextLost() {
      this.assertNotDisposed();
      this.stateValue = "lost";
    }
    handleContextRestored() {
      this.assertNotDisposed();
      if (this.stateValue !== "lost") throw new TypeError("WaterLayer context can only restore from lost");
      for (const page of this.materials.values()) page.material.needsUpdate = true;
      this.stateValue = "ready";
    }
    dispose() {
      if (this.stateValue === "disposed") return;
      for (const chunk of this.chunks.values()) this.removeChunk(chunk);
      this.chunks.clear();
      for (const page of this.materials.values()) {
        page.lighting.release();
        page.material.dispose();
      }
      this.materials.clear();
      this.root.removeFromParent();
      this.stateValue = "disposed";
    }
    get stats() {
      let visibleMeshes = 0;
      let fullPatches = 0;
      let coverageMeshes = 0;
      let sweepMeshes = 0;
      let uniqueGeometryBytes = 0;
      for (const chunk of this.chunks.values()) {
        if (chunk.mesh) visibleMeshes += 1;
        if (chunk.kind === "full") fullPatches += 1;
        if (chunk.kind === "coverage") coverageMeshes += 1;
        if (chunk.kind === "sweep") sweepMeshes += 1;
        if (chunk.ownsGeometry && chunk.mesh) {
          uniqueGeometryBytes += Number(chunk.mesh.geometry.userData.surfaceWaterByteLength ?? 0);
        }
      }
      return Object.freeze({
        state: this.stateValue,
        mountedChunks: this.chunks.size,
        visibleMeshes,
        fullPatches,
        coverageMeshes,
        sweepMeshes,
        uniqueGeometryBytes,
        materialPages: this.materials.size
      });
    }
    materialForBinding(binding) {
      let page = this.materials.get(binding.slot.pageIndex);
      if (page) return page;
      const lighting = this.lighting.bindUniforms();
      const material = new three.ShaderMaterial({
        name: `surface-water-page-${binding.slot.pageIndex}`,
        glslVersion: three.GLSL3,
        vertexShader: WATER_VERTEX_SHADER,
        fragmentShader: WATER_FRAGMENT_SHADER,
        uniforms: {
          uSurfaceValues: new three.Uniform(binding.valuesTexture),
          uSurfaceFlow: new three.Uniform(binding.flowTexture),
          uSurfaceWater: new three.Uniform(binding.waterTexture),
          uLayer: new three.Uniform(0),
          uHeightScale: new three.Uniform(this.heightScale),
          uHexSize: new three.Uniform(this.hexSize),
          uTime: new three.Uniform(0),
          uWaveAmplitude: new three.Uniform(this.style.waterWaveAmplitude),
          uWaveSpeed: new three.Uniform(this.style.waterWaveSpeed),
          uFoamOpacity: new three.Uniform(this.style.coastalWaveOpacity),
          uChunkSurfacePhase: new three.Uniform(new three.Vector2()),
          uValidBounds: new three.Uniform(new three.Vector4(0, 0, 16, 16)),
          uGridColor: new three.Uniform(new three.Color(1847602)),
          uGridWidth: new three.Uniform(0.032),
          uGridOpacity: new three.Uniform(this.style.gridVisible ? 0.52 : 0),
          uSunDirection: lighting.sunDirection,
          uSunRadiance: lighting.sunRadiance,
          uSkyDiffuseIrradiance: lighting.skyDiffuseIrradiance,
          uGroundDiffuseIrradiance: lighting.groundDiffuseIrradiance,
          fogColor: new three.Uniform(new three.Color()),
          fogNear: new three.Uniform(1),
          fogFar: new three.Uniform(1e3)
        },
        side: three.DoubleSide,
        transparent: false,
        depthWrite: true,
        depthTest: true,
        fog: true,
        toneMapped: true
      });
      page = Object.freeze({ material, lighting });
      this.materials.set(binding.slot.pageIndex, page);
      return page;
    }
    prepareDraw(mounted, chunk, material) {
      if (!this.surfaceTexturePool.isCurrent(mounted.slot) || !mounted.mesh) {
        if (mounted.mesh) mounted.mesh.visible = false;
        return;
      }
      mounted.mesh.visible = true;
      material.uniforms.uLayer.value = mounted.slot.layerIndex;
      material.uniforms.uTime.value = this.time;
      const originX = mounted.key.chunkX * SURFACE_RENDER_CHUNK_SIZE;
      const originY = mounted.key.chunkY * SURFACE_RENDER_CHUNK_SIZE;
      material.uniforms.uChunkSurfacePhase.value.set(
        (originX % SURFACE_VISUAL_PHASE_PERIOD + SURFACE_VISUAL_PHASE_PERIOD) % SURFACE_VISUAL_PHASE_PERIOD,
        (originY % SURFACE_VISUAL_PHASE_PERIOD + SURFACE_VISUAL_PHASE_PERIOD) % SURFACE_VISUAL_PHASE_PERIOD
      );
      const bounds = chunk.bounds.validTiles;
      material.uniforms.uValidBounds.value.set(
        bounds.minX,
        bounds.minY,
        bounds.maxXExclusive,
        bounds.maxYExclusive
      );
      material.uniformsNeedUpdate = true;
    }
    positionChunk(chunk) {
      if (!chunk.mesh) return;
      const surfaceX = chunk.key.chunkX * SURFACE_RENDER_CHUNK_SIZE;
      const surfaceY = chunk.key.chunkY * SURFACE_RENDER_CHUNK_SIZE;
      if (!Number.isSafeInteger(surfaceX) || !Number.isSafeInteger(surfaceY)) {
        throw new RangeError("WaterLayer render origin exceeds the safe integer domain");
      }
      chunk.mesh.position.set(
        1.5 * this.hexSize * surfaceX - this.floatingOriginX,
        0,
        Math.sqrt(3) * this.hexSize * surfaceY - this.floatingOriginZ
      );
      chunk.mesh.updateMatrix();
      chunk.mesh.updateMatrixWorld();
    }
    removeChunk(chunk) {
      if (!chunk.mesh) return;
      this.root.remove(chunk.mesh);
      chunk.mesh.onBeforeRender = () => void 0;
      if (chunk.ownsGeometry) chunk.mesh.geometry.dispose();
    }
    assertReady() {
      this.assertNotDisposed();
      if (this.stateValue !== "ready") throw new TypeError("WaterLayer cannot mutate while context is lost");
    }
    assertNotDisposed() {
      if (this.stateValue === "disposed") throw new TypeError("WaterLayer is disposed");
    }
  };

  // src/rendering/SurfacePresentationLayer.ts
  function keyString4(key2) {
    if (!key2 || !Number.isSafeInteger(key2.chunkX) || !Number.isSafeInteger(key2.chunkY)) {
      throw new TypeError("SurfacePresentationLayer render chunk key is invalid");
    }
    return `${key2.chunkX},${key2.chunkY}`;
  }
  var SurfacePresentationLayer = class {
    constructor(options) {
      this.root = new three.Group();
      this.mounts = /* @__PURE__ */ new Map();
      this.styleValue = DEFAULT_SURFACE_PRESENTATION_STYLE;
      this.stateValue = "ready";
      if (!options || typeof options !== "object" || Object.getOwnPropertyNames(options).some((name) => ![
        "surfaceTexturePool",
        "fogTexturePool",
        "lighting",
        "hexSize",
        "heightScale"
      ].includes(name)) || !(options.surfaceTexturePool instanceof SurfaceTexturePool) || options.fogTexturePool !== void 0 && !(options.fogTexturePool instanceof SurfaceFogTexturePool) || !(options.lighting instanceof LightingStateController)) {
        throw new TypeError("SurfacePresentationLayer options are invalid");
      }
      const hexSize = options.hexSize ?? 1;
      const heightScale = options.heightScale ?? 1;
      this.geometryPool = new SurfaceGroundGeometryPool(hexSize, heightScale);
      this.ground = new GroundLayer({ ...options, geometryPool: this.geometryPool });
      this.water = new WaterLayer({
        surfaceTexturePool: options.surfaceTexturePool,
        lighting: options.lighting,
        geometryPool: this.geometryPool,
        hexSize,
        heightScale
      });
      this.vegetation = new VegetationLayer({
        surfaceTexturePool: options.surfaceTexturePool,
        lighting: options.lighting,
        hexSize,
        heightScale
      });
      this.root.name = "surface-presentation-layer-v2";
      this.root.add(this.ground.root, this.water.root, this.vegetation.root);
    }
    mount(lease, lod) {
      this.assertReady();
      const key2 = lease.chunk.key;
      const serialized = keyString4(key2);
      let ground;
      try {
        ground = this.ground.mount(lease, lod);
        const water = this.water.mount(lease.chunk, ground);
        const vegetation = this.vegetation.mount(lease.chunk, ground);
        this.mounts.set(serialized, {
          key: Object.freeze({ ...key2 }),
          lease,
          ground,
          water,
          vegetation
        });
        return Object.freeze({ key: Object.freeze({ ...key2 }), ground, water, vegetation });
      } catch (reason) {
        if (ground) {
          this.vegetation.unmount(key2);
          this.water.unmount(key2);
          this.ground.unmount(key2);
          this.mounts.delete(serialized);
        }
        throw reason;
      }
    }
    mountGround(lease, lod) {
      this.assertReady();
      const key2 = lease.chunk.key;
      const serialized = keyString4(key2);
      if (this.mounts.has(serialized)) throw new Error("surface presentation chunk is already mounted");
      const ground = this.ground.mount(lease, lod);
      this.mounts.set(serialized, { key: Object.freeze({ ...key2 }), lease, ground });
      return ground;
    }
    mountWater(key2) {
      this.assertReady();
      const mount = this.mounts.get(keyString4(key2));
      if (!mount) throw new Error("water requires a mounted ground dependency");
      if (mount.water) throw new Error("surface water chunk is already mounted");
      mount.water = this.water.mount(mount.lease.chunk, mount.ground);
      return mount.water;
    }
    mountVegetation(key2) {
      this.assertReady();
      const mount = this.mounts.get(keyString4(key2));
      if (!mount) throw new Error("vegetation requires a mounted ground dependency");
      if (mount.vegetation) throw new Error("surface vegetation chunk is already mounted");
      mount.vegetation = this.vegetation.mount(mount.lease.chunk, mount.ground);
      return mount.vegetation;
    }
    setLod(key2, lod) {
      this.assertReady();
      const serialized = keyString4(key2);
      if (!this.mounts.has(serialized)) return false;
      const groundChanged = this.ground.setLod(key2, lod);
      const mount = this.mounts.get(serialized);
      const waterChanged = mount.water ? this.water.setLod(key2, lod) : false;
      const vegetationChanged = mount.vegetation ? this.vegetation.setLod(key2, lod) : false;
      return groundChanged || waterChanged || vegetationChanged;
    }
    setTime(seconds) {
      this.assertReady();
      this.water.setTime(seconds);
      this.vegetation.setTime(seconds);
    }
    setStyle(values) {
      this.assertNotDisposed();
      if (!values || typeof values !== "object" || Array.isArray(values)) {
        throw new TypeError("surface presentation style update is invalid");
      }
      const style = createSurfacePresentationStyle({ ...this.styleValue, ...values });
      this.ground.setStyle(style);
      this.water.setStyle(style);
      this.vegetation.setStyle(style);
      this.styleValue = style;
      return style;
    }
    get style() {
      return this.styleValue;
    }
    setFloatingOrigin(worldX, worldZ) {
      this.assertNotDisposed();
      this.ground.setFloatingOrigin(worldX, worldZ);
      this.water.setFloatingOrigin(worldX, worldZ);
      this.vegetation.setFloatingOrigin(worldX, worldZ);
    }
    uploadFog(key2, fog) {
      this.assertReady();
      return this.ground.uploadFog(key2, fog);
    }
    unmount(key2) {
      this.assertNotDisposed();
      const serialized = keyString4(key2);
      const mount = this.mounts.get(serialized);
      if (!mount) return false;
      if (mount.vegetation) this.vegetation.unmount(key2);
      if (mount.water) this.water.unmount(key2);
      this.mounts.delete(serialized);
      return this.ground.unmount(key2);
    }
    unmountVegetation(key2) {
      this.assertNotDisposed();
      const mount = this.mounts.get(keyString4(key2));
      if (!mount?.vegetation) return false;
      mount.vegetation = void 0;
      return this.vegetation.unmount(key2);
    }
    unmountWater(key2) {
      this.assertNotDisposed();
      const mount = this.mounts.get(keyString4(key2));
      if (!mount?.water) return false;
      if (mount.vegetation) throw new Error("water cannot unmount while vegetation dependency is mounted");
      mount.water = void 0;
      return this.water.unmount(key2);
    }
    unmountGround(key2) {
      this.assertNotDisposed();
      const serialized = keyString4(key2);
      const mount = this.mounts.get(serialized);
      if (!mount) return false;
      if (mount.water || mount.vegetation) throw new Error("ground cannot unmount while dependent layers are mounted");
      this.mounts.delete(serialized);
      return this.ground.unmount(key2);
    }
    handleContextLost() {
      this.assertNotDisposed();
      if (this.stateValue === "lost") return;
      this.water.handleContextLost();
      this.vegetation.handleContextLost();
      this.ground.handleContextLost();
      this.stateValue = "lost";
    }
    handleContextRestored() {
      this.assertNotDisposed();
      if (this.stateValue !== "lost") {
        throw new TypeError("SurfacePresentationLayer context can only restore from lost");
      }
      this.ground.handleContextRestored();
      this.water.handleContextRestored();
      this.vegetation.handleContextRestored();
      this.stateValue = "ready";
    }
    dispose() {
      if (this.stateValue === "disposed") return;
      for (const mount of [...this.mounts.values()]) this.unmount(mount.key);
      this.vegetation.dispose();
      this.water.dispose();
      this.ground.dispose();
      this.geometryPool.dispose();
      this.root.removeFromParent();
      this.stateValue = "disposed";
    }
    get stats() {
      return Object.freeze({
        state: this.stateValue,
        mountedChunks: this.mounts.size,
        ground: this.ground.stats,
        water: this.water.stats,
        vegetation: this.vegetation.stats,
        sharedGeometry: this.geometryPool.stats
      });
    }
    assertReady() {
      this.assertNotDisposed();
      if (this.stateValue !== "ready") {
        throw new TypeError("SurfacePresentationLayer cannot mutate while context is lost");
      }
    }
    assertNotDisposed() {
      if (this.stateValue === "disposed") {
        throw new TypeError("SurfacePresentationLayer is disposed");
      }
    }
  };

  // src/rendering/DependencyDrivenRenderGraph.ts
  var WorldRenderDependencyError = class extends Error {
    constructor() {
      super(...arguments);
      this.name = "WorldRenderDependencyError";
    }
  };
  function assertNames(values, label) {
    if (!Array.isArray(values) || values.some((value) => typeof value !== "string" || !value.trim())) {
      throw new TypeError(`${label} must contain non-empty dependency names`);
    }
  }
  var DependencyDrivenRenderGraph = class {
    constructor(externalDependencies) {
      this.externalDependencies = externalDependencies;
      this.layersById = /* @__PURE__ */ new Map();
      this.initialized = false;
      this.disposed = false;
      assertNames(externalDependencies, "external render dependencies");
      if (new Set(externalDependencies).size !== externalDependencies.length) {
        throw new WorldRenderDependencyError("external render dependencies contain duplicates");
      }
    }
    register(layer) {
      this.assertMutable();
      if (!layer || typeof layer.id !== "string" || !layer.id.trim() || typeof layer.mount !== "function" || typeof layer.unmount !== "function" || typeof layer.dispose !== "function") {
        throw new TypeError("dependency-driven render layer is invalid");
      }
      assertNames(layer.requires, `render layer ${layer.id} requirements`);
      assertNames(layer.owns ?? [], `render layer ${layer.id} ownership`);
      if (this.layersById.has(layer.id)) throw new WorldRenderDependencyError(`render layer ${layer.id} is already registered`);
      this.layersById.set(layer.id, layer);
    }
    async initialize() {
      this.assertMutable();
      const ordered = this.resolveOrder();
      const initialized = [];
      try {
        for (const layer of ordered) {
          await layer.initialize?.();
          initialized.push(layer);
        }
        this.initialized = true;
      } catch (reason) {
        for (const layer of initialized.reverse()) {
          try {
            layer.dispose();
          } catch {
          }
        }
        throw reason;
      }
    }
    async mount(context) {
      this.assertReady();
      const mounted = [];
      try {
        for (const layer of this.orderedLayers) {
          await layer.mount(context);
          mounted.push(layer);
        }
      } catch (reason) {
        for (const layer of mounted.reverse()) {
          try {
            layer.unmount(context);
          } catch {
          }
        }
        throw reason;
      }
    }
    unmount(context) {
      this.assertReady();
      const errors = [];
      for (const layer of [...this.orderedLayers].reverse()) {
        try {
          layer.unmount(context);
        } catch (reason) {
          errors.push(reason instanceof Error ? reason : new Error(String(reason)));
        }
      }
      if (errors.length > 0) {
        throw new WorldRenderDependencyError(`render layer unmount failed: ${errors.map((error) => error.message).join("; ")}`);
      }
    }
    setLod(context) {
      this.assertReady();
      for (const layer of this.orderedLayers) layer.setLod?.(context);
    }
    contextLost() {
      this.assertReady();
      for (const layer of [...this.orderedLayers].reverse()) layer.contextLost?.();
    }
    contextRestored() {
      this.assertReady();
      for (const layer of this.orderedLayers) layer.contextRestored?.();
    }
    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      const errors = [];
      for (const layer of [...this.orderedLayers ?? this.layersById.values()].reverse()) {
        try {
          layer.dispose();
        } catch (reason) {
          errors.push(reason instanceof Error ? reason : new Error(String(reason)));
        }
      }
      this.layersById.clear();
      if (errors.length > 0) {
        throw new WorldRenderDependencyError(`render layer disposal failed: ${errors.map((error) => error.message).join("; ")}`);
      }
    }
    get order() {
      return Object.freeze((this.orderedLayers ?? this.resolveOrder()).map((layer) => layer.id));
    }
    resolveOrder() {
      if (this.orderedLayers) return this.orderedLayers;
      const owners = /* @__PURE__ */ new Map();
      for (const dependency of this.externalDependencies) owners.set(dependency, void 0);
      for (const layer of this.layersById.values()) {
        for (const dependency of layer.owns ?? []) {
          if (owners.has(dependency)) {
            const owner = owners.get(dependency);
            throw new WorldRenderDependencyError(owner ? `render dependency ${dependency} has duplicate owners ${owner.id} and ${layer.id}` : `render layer ${layer.id} attempts to own external dependency ${dependency}`);
          }
          owners.set(dependency, layer);
        }
      }
      for (const layer of this.layersById.values()) {
        for (const dependency of layer.requires) {
          if (!owners.has(dependency)) {
            throw new WorldRenderDependencyError(`render layer ${layer.id} requires missing dependency ${dependency}`);
          }
        }
      }
      const visiting = /* @__PURE__ */ new Set();
      const visited = /* @__PURE__ */ new Set();
      const result = [];
      const visit = (layer) => {
        if (visited.has(layer.id)) return;
        if (visiting.has(layer.id)) throw new WorldRenderDependencyError(`render dependency graph contains a cycle at ${layer.id}`);
        visiting.add(layer.id);
        for (const dependency of layer.requires) {
          const owner = owners.get(dependency);
          if (owner) visit(owner);
        }
        visiting.delete(layer.id);
        visited.add(layer.id);
        result.push(layer);
      };
      for (const layer of this.layersById.values()) visit(layer);
      this.orderedLayers = Object.freeze(result);
      return this.orderedLayers;
    }
    assertMutable() {
      if (this.disposed) throw new Error("DependencyDrivenRenderGraph has been disposed");
      if (this.initialized) throw new Error("DependencyDrivenRenderGraph is already initialized");
    }
    assertReady() {
      if (this.disposed || !this.initialized) throw new Error("DependencyDrivenRenderGraph is not initialized");
    }
  };

  // src/rendering/WorldRenderSession.ts
  function keyString5(key2) {
    return `${key2.chunkX},${key2.chunkY}`;
  }
  function asError(reason) {
    return reason instanceof Error ? reason : new Error(String(reason));
  }
  function assertDemand(value) {
    if (!value || typeof value !== "object" || !Number.isSafeInteger(value.key?.chunkX) || !Number.isSafeInteger(value.key?.chunkY) || ![0, 1, 2].includes(value.lod) || value.priority !== void 0 && !Number.isFinite(value.priority) || value.lane !== void 0 && !["critical", "interactive", "visible", "prefetch", "background"].includes(value.lane)) {
      throw new TypeError("world render demand is invalid");
    }
  }
  var WorldRenderSession = class {
    constructor(options) {
      this.demanded = /* @__PURE__ */ new Map();
      this.stateValue = "created";
      this.nextGeneration = 0;
      this.mountedBytes = 0;
      this.demandUpdateCount = 0;
      this.editRefreshCount = 0;
      this.staleOutcomeCount = 0;
      this.failedChunkCount = 0;
      this.demandTransition = Promise.resolve();
      if (!options || typeof options !== "object" || !options.authority || !options.compilation || !options.presentation || !options.queries || !Number.isSafeInteger(options.compiledWorkingSetBudgetBytes) || options.compiledWorkingSetBudgetBytes <= 0) {
        throw new TypeError("WorldRenderSession options are invalid");
      }
      this.descriptor = options.descriptor;
      this.authority = options.authority;
      this.compilation = options.compilation;
      this.presentation = options.presentation;
      this.queries = options.queries;
      this.budgetBytes = options.compiledWorkingSetBudgetBytes;
      this.reportError = options.error ?? (() => void 0);
      this.root = this.presentation.root;
      this.graph = new DependencyDrivenRenderGraph([
        "authority",
        "compiled-surface",
        "surface-textures",
        "dynamic-fog",
        "lighting"
      ]);
      this.installBuiltins();
      for (const layer of options.customLayers ?? []) this.graph.register(layer);
      this.detachEditor = options.editor?.subscribe((changeSet) => this.applyChangeSet(changeSet));
    }
    async initialize() {
      if (this.stateValue !== "created") throw new Error("WorldRenderSession can only initialize once");
      await this.graph.initialize();
      this.stateValue = "ready";
    }
    async updateDemand(demands) {
      this.assertReady();
      if (!Array.isArray(demands)) throw new TypeError("world render demands must be an array");
      const canonical = /* @__PURE__ */ new Map();
      for (const demand of demands) {
        assertDemand(demand);
        const key2 = canonicalizeRenderChunkKey(this.descriptor, demand.key);
        const serialized = keyString5(key2);
        if (canonical.has(serialized)) throw new TypeError("world render demand contains duplicate canonical chunks");
        canonical.set(serialized, Object.freeze({ ...demand, key: key2 }));
      }
      this.demandUpdateCount += 1;
      const transition = this.demandTransition.then(() => this.applyDemand(canonical));
      this.demandTransition = transition.catch(() => void 0);
      return transition;
    }
    async applyDemand(canonical) {
      this.assertReady();
      const retiring = [...this.demanded].filter(([serialized]) => !canonical.has(serialized)).map(([, state]) => state);
      const retained = [];
      const prepared = [];
      const tasks = [];
      for (const [serialized, state] of [...this.demanded]) {
        const demand = canonical.get(serialized);
        if (!demand) continue;
        const changedLod = state.lod !== demand.lod;
        state.lod = demand.lod;
        state.priority = demand.priority ?? 0;
        state.lane = demand.lane ?? "visible";
        if (changedLod && state.context) {
          state.context = this.context(state, state.surfaceLease);
          this.graph.setLod(state.context);
        }
        retained.push(state);
        if (!state.context && !state.task) {
          state.generation = this.issueGeneration();
          state.task = this.prepareState(state);
          prepared.push(state);
        }
        if (state.task) tasks.push(state.task);
      }
      const added = [];
      for (const [serialized, demand] of canonical) {
        if (this.demanded.has(serialized)) continue;
        const state = {
          key: demand.key,
          lod: demand.lod,
          priority: demand.priority ?? 0,
          lane: demand.lane ?? "visible",
          generation: this.issueGeneration()
        };
        this.demanded.set(serialized, state);
        added.push(state);
        prepared.push(state);
        state.task = this.prepareState(state);
        tasks.push(state.task);
      }
      try {
        await Promise.all(tasks);
        const projectedBytes = retained.reduce(
          (total, state) => total + (state.context ? state.surfaceLease.chunk.byteLength : 0),
          0
        ) + prepared.reduce(
          (total, state) => total + (!state.context && state.surfaceLease ? state.surfaceLease.chunk.byteLength : 0),
          0
        );
        if (projectedBytes > this.budgetBytes) {
          this.failedChunkCount += 1;
          throw new RangeError("compiled surface working-set budget cannot admit the exact demand set");
        }
        for (const state of retiring) {
          this.releaseState(state);
          this.demanded.delete(keyString5(state.key));
        }
        for (const state of prepared) {
          if (!state.context && state.surfaceLease) await this.mountPreparedState(state);
        }
      } catch (reason) {
        for (const state of prepared) {
          if (!state.context) this.releaseTransient(state);
        }
        for (const state of added) {
          if (this.demanded.get(keyString5(state.key)) !== state) continue;
          this.releaseState(state);
          this.demanded.delete(keyString5(state.key));
        }
        throw reason;
      }
    }
    uploadFog(key2, fog) {
      this.assertReady();
      return this.presentation.uploadFog(key2, fog);
    }
    setTime(seconds) {
      this.assertReady();
      this.presentation.setTime(seconds);
    }
    setFloatingOrigin(worldX, worldZ) {
      if (this.stateValue === "disposed") throw new Error("WorldRenderSession is disposed");
      this.presentation.setFloatingOrigin(worldX, worldZ);
    }
    handleContextLost() {
      if (this.stateValue === "lost") return;
      this.assertReady();
      this.graph.contextLost();
      this.presentation.handleContextLost();
      this.stateValue = "lost";
    }
    handleContextRestored() {
      if (this.stateValue !== "lost") throw new Error("WorldRenderSession context is not lost");
      this.presentation.handleContextRestored();
      this.graph.contextRestored();
      this.stateValue = "ready";
    }
    async getSettled() {
      await this.demandTransition;
      await Promise.all([...this.demanded.values()].map((state) => state.task).filter(Boolean));
    }
    dispose() {
      if (this.stateValue === "disposed") return;
      this.detachEditor?.();
      for (const state of [...this.demanded.values()]) this.releaseState(state);
      this.demanded.clear();
      const errors = [];
      try {
        this.graph.dispose();
      } catch (reason) {
        errors.push(asError(reason));
      }
      try {
        this.queries.dispose();
      } catch (reason) {
        errors.push(asError(reason));
      }
      try {
        this.presentation.dispose();
      } catch (reason) {
        errors.push(asError(reason));
      }
      try {
        this.compilation.dispose();
      } catch (reason) {
        errors.push(asError(reason));
      }
      try {
        this.authority.dispose();
      } catch (reason) {
        errors.push(asError(reason));
      }
      this.stateValue = "disposed";
      if (errors.length > 0) throw new Error(`WorldRenderSession disposal failed: ${errors.map((error) => error.message).join("; ")}`);
    }
    get stats() {
      let pendingChunks = 0;
      let mountedChunks = 0;
      for (const state of this.demanded.values()) {
        if (state.context) mountedChunks += 1;
        else if (state.task) pendingChunks += 1;
      }
      return Object.freeze({
        state: this.stateValue,
        demandedChunks: this.demanded.size,
        pendingChunks,
        mountedChunks,
        mountedCompiledBytes: this.mountedBytes,
        compiledWorkingSetBudgetBytes: this.budgetBytes,
        demandUpdates: this.demandUpdateCount,
        editRefreshes: this.editRefreshCount,
        staleOutcomes: this.staleOutcomeCount,
        failedChunks: this.failedChunkCount,
        layerOrder: this.graph.order
      });
    }
    installBuiltins() {
      this.graph.register({
        id: "ground",
        requires: ["compiled-surface", "surface-textures", "lighting"],
        owns: ["ground"],
        mount: (context) => {
          this.presentation.mountGround(context.lease, context.lod);
          this.queries.bindLease(context.lease);
        },
        unmount: (context) => {
          this.queries.unbindLease(context.key, context.lease);
          this.presentation.unmountGround(context.key);
        },
        setLod: (context) => {
          this.presentation.setLod(context.key, context.lod);
        },
        dispose: () => void 0
      });
      this.graph.register({
        id: "water",
        requires: ["ground", "lighting"],
        owns: ["water"],
        mount: (context) => {
          this.presentation.mountWater(context.key);
        },
        unmount: (context) => {
          this.presentation.unmountWater(context.key);
        },
        dispose: () => void 0
      });
      this.graph.register({
        id: "vegetation",
        requires: ["ground", "lighting", "authority"],
        owns: ["vegetation"],
        mount: (context) => {
          this.presentation.mountVegetation(context.key);
        },
        unmount: (context) => {
          this.presentation.unmountVegetation(context.key);
        },
        dispose: () => void 0
      });
      this.graph.register({
        id: "fog",
        requires: ["ground", "dynamic-fog"],
        mount: () => void 0,
        unmount: () => void 0,
        dispose: () => void 0
      });
    }
    async prepareState(state) {
      const generation = state.generation;
      try {
        state.authorityLease = await this.authority.retain(state.key, {
          priority: state.priority,
          lane: state.lane
        });
        if (!this.isCurrent(state, generation)) return this.releaseTransient(state);
        state.request = this.compilation.request(state.authorityLease.snapshot, state.key, {
          priority: state.priority,
          lane: state.lane
        });
        state.authorityLease.release();
        state.authorityLease = void 0;
        const outcome = await state.request.result;
        state.request = void 0;
        if (!this.isCurrent(state, generation) || outcome.status === "stale") {
          if (outcome.status === "ready") outcome.lease.release();
          this.staleOutcomeCount += 1;
          return;
        }
        state.surfaceLease = outcome.lease;
      } catch (reason) {
        this.releaseTransient(state);
        if (this.isCurrent(state, generation)) {
          this.failedChunkCount += 1;
          this.reportError(asError(reason));
          throw reason;
        }
      } finally {
        if (this.isCurrent(state, generation)) state.task = void 0;
      }
    }
    async mountPreparedState(state) {
      const lease = state.surfaceLease;
      if (!lease) throw new Error("world render demand was published without a prepared surface lease");
      if (this.mountedBytes + lease.chunk.byteLength > this.budgetBytes) {
        throw new RangeError("compiled surface working-set budget cannot admit the exact demand set");
      }
      state.compiledBytesAccounted = true;
      this.mountedBytes += lease.chunk.byteLength;
      const context = this.context(state, lease);
      try {
        await this.graph.mount(context);
        state.context = context;
      } catch (reason) {
        this.mountedBytes -= lease.chunk.byteLength;
        state.compiledBytesAccounted = false;
        state.surfaceLease = void 0;
        lease.release();
        throw reason;
      }
    }
    async loadState(state) {
      await this.prepareState(state);
      if (state.surfaceLease && !state.context) await this.mountPreparedState(state);
    }
    context(state, lease) {
      return Object.freeze({
        key: Object.freeze({ ...state.key }),
        effectiveRevision: lease.effectiveRevision,
        lod: state.lod,
        chunk: lease.chunk,
        lease,
        sample: (localU, localV) => sampleCompiledSurfaceChunk(lease.chunk, localU, localV)
      });
    }
    applyChangeSet(changeSet) {
      if (this.stateValue === "disposed") return;
      const keys = changeSet.renderChunks.map((chunk) => chunk.key);
      this.compilation.invalidate(keys);
      this.queries.invalidate(keys);
      for (const key2 of keys) {
        const state = this.demanded.get(keyString5(key2));
        if (!state) continue;
        this.editRefreshCount += 1;
        this.releaseMounted(state);
        state.request?.cancel();
        state.request = void 0;
        state.authorityLease?.release();
        state.authorityLease = void 0;
        state.generation = this.issueGeneration();
        state.task = this.loadState(state);
        void state.task.catch((error) => this.reportError(asError(error)));
      }
    }
    releaseState(state) {
      state.generation = this.issueGeneration();
      state.request?.cancel();
      state.request = void 0;
      state.authorityLease?.release();
      state.authorityLease = void 0;
      this.releaseMounted(state);
    }
    releaseMounted(state) {
      if (!state.context || !state.surfaceLease) return;
      const bytes = state.surfaceLease.chunk.byteLength;
      try {
        this.graph.unmount(state.context);
      } finally {
        state.context = void 0;
        state.surfaceLease = void 0;
        if (state.compiledBytesAccounted) this.mountedBytes -= bytes;
        state.compiledBytesAccounted = false;
      }
    }
    releaseTransient(state) {
      state.request?.cancel();
      state.request = void 0;
      state.authorityLease?.release();
      state.authorityLease = void 0;
      if (state.surfaceLease && state.compiledBytesAccounted) {
        this.mountedBytes -= state.surfaceLease.chunk.byteLength;
        state.compiledBytesAccounted = false;
      }
      state.surfaceLease?.release();
      state.surfaceLease = void 0;
    }
    isCurrent(state, generation) {
      return state.generation === generation && this.demanded.get(keyString5(state.key)) === state;
    }
    issueGeneration() {
      if (this.nextGeneration >= Number.MAX_SAFE_INTEGER) throw new RangeError("world render session generation space is exhausted");
      this.nextGeneration += 1;
      return this.nextGeneration;
    }
    assertReady() {
      if (this.stateValue !== "ready") throw new Error("WorldRenderSession is not ready");
    }
  };

  // src/world/semantic/HydrologyFeatureDelta.ts
  var GENERATED_ID_PATTERN = /^[a-z][a-z0-9-]*:[a-f0-9]{32}$/;
  function assertFeatureId2(name, value) {
    if (typeof value !== "string" || !GENERATED_ID_PATTERN.test(value) || value === OCEAN_BODY_ID) {
      throw new TypeError(`${name} must be a non-ocean stable hydrology feature ID`);
    }
  }
  function assertConnectionId(name, value) {
    if (typeof value !== "string" || value !== OCEAN_BODY_ID && !GENERATED_ID_PATTERN.test(value)) {
      throw new TypeError(`${name} must be a stable hydrology feature or ocean ID`);
    }
  }
  function assertPositiveRevision2(value) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new RangeError("hydrology feature revision must be a positive safe integer");
    }
  }
  function assertUint83(name, value) {
    if (!Number.isInteger(value) || value < 0 || value > 255) {
      throw new RangeError(`${name} must be a Uint8 value`);
    }
  }
  function assertUint163(name, value) {
    if (!Number.isInteger(value) || value < 0 || value > 65535) {
      throw new RangeError(`${name} must be a Uint16 value`);
    }
  }
  function assertConnection(value, ownerId) {
    if (!value || value.kind !== "body" && value.kind !== "river" || Object.getOwnPropertyNames(value).some((name) => name !== "kind" && name !== "featureId")) {
      throw new TypeError("hydrology feature connection is invalid");
    }
    assertConnectionId("hydrology connection featureId", value.featureId);
    if (value.featureId === ownerId) throw new TypeError("hydrology feature cannot connect to itself");
    if (value.kind === "river" && value.featureId === OCEAN_BODY_ID) {
      throw new TypeError("the reserved ocean ID cannot be used as a river connection");
    }
  }
  function assertSource(value, ownerId) {
    if (!value || typeof value !== "object") throw new TypeError("hydrology river source is invalid");
    if (value.kind === "source") {
      if (Object.getOwnPropertyNames(value).some((name) => name !== "kind")) {
        throw new TypeError("hydrology spring source contains unknown fields");
      }
      return;
    }
    assertConnection(value, ownerId);
  }
  function assertWorldPoints(name, value, minimumPoints) {
    if (!(value instanceof Float64Array) || value.length < minimumPoints * 2 || value.length % 2 !== 0) {
      throw new TypeError(`${name} must contain at least ${minimumPoints} coordinate pairs`);
    }
    for (const coordinate of value) {
      if (!Number.isFinite(coordinate) || !Number.isSafeInteger(coordinate * HYDROLOGY_COORDINATE_SCALE)) {
        throw new RangeError(`${name} coordinates must be exact 1/${HYDROLOGY_COORDINATE_SCALE}-tile values`);
      }
    }
  }
  function assertRiver2(value) {
    const allowedFields = /* @__PURE__ */ new Set([
      "kind",
      "featureId",
      "revision",
      "source",
      "outlet",
      "controlPoints",
      "widthProfile",
      "levelProfile",
      "dischargeClass"
    ]);
    if (Object.getOwnPropertyNames(value).some((name) => !allowedFields.has(name))) {
      throw new TypeError("hydrology river delta contains unknown fields");
    }
    assertSource(value.source, value.featureId);
    assertConnection(value.outlet, value.featureId);
    assertWorldPoints("hydrology river controlPoints", value.controlPoints, 2);
    const pointCount = value.controlPoints.length / 2;
    if (!(value.widthProfile instanceof Uint8Array) || value.widthProfile.length !== pointCount || !(value.levelProfile instanceof Uint16Array) || value.levelProfile.length !== pointCount) {
      throw new TypeError("hydrology river profiles must contain one value per control point");
    }
    for (const width of value.widthProfile) {
      assertUint83("hydrology river width", width);
      if (width === 0) throw new RangeError("hydrology river width must remain positive");
    }
    for (let index2 = 0; index2 < value.levelProfile.length; index2 += 1) {
      assertUint163("hydrology river level", value.levelProfile[index2]);
      if (index2 > 0 && value.levelProfile[index2] > value.levelProfile[index2 - 1]) {
        throw new TypeError("hydrology river level profile must not rise downstream");
      }
    }
    if (!Number.isInteger(value.dischargeClass) || value.dischargeClass < 0 || value.dischargeClass > HYDROLOGY_MAX_DISCHARGE_CLASS) {
      throw new RangeError("hydrology river dischargeClass is invalid");
    }
  }
  function assertLake2(value) {
    const allowedFields = /* @__PURE__ */ new Set([
      "kind",
      "featureId",
      "revision",
      "boundaryPoints",
      "level",
      "profileIndex"
    ]);
    if (Object.getOwnPropertyNames(value).some((name) => !allowedFields.has(name))) {
      throw new TypeError("hydrology lake delta contains unknown fields");
    }
    assertWorldPoints("hydrology lake boundaryPoints", value.boundaryPoints, 3);
    assertUint163("hydrology lake level", value.level);
    assertUint83("hydrology lake profileIndex", value.profileIndex);
  }
  function assertTombstone(value) {
    if (value.targetKind !== "river" && value.targetKind !== "lake" || Object.getOwnPropertyNames(value).some((name) => name !== "kind" && name !== "featureId" && name !== "revision" && name !== "targetKind")) {
      throw new TypeError("hydrology feature tombstone is invalid");
    }
  }
  function assertHydrologyFeatureDelta(value) {
    if (!value || typeof value !== "object") throw new TypeError("hydrology feature delta must be an object");
    const delta = value;
    assertFeatureId2("hydrology delta featureId", delta.featureId);
    assertPositiveRevision2(delta.revision);
    if (delta.kind === "river") assertRiver2(delta);
    else if (delta.kind === "lake") assertLake2(delta);
    else if (delta.kind === "tombstone") assertTombstone(delta);
    else throw new TypeError("hydrology feature delta kind is invalid");
  }
  function cloneConnection(connection) {
    return Object.freeze({ kind: connection.kind, featureId: connection.featureId });
  }
  function cloneSource(source) {
    return source.kind === "source" ? Object.freeze({ kind: "source" }) : cloneConnection(source);
  }
  function cloneHydrologyFeatureDelta(delta) {
    assertHydrologyFeatureDelta(delta);
    let clone;
    if (delta.kind === "river") {
      clone = Object.freeze({
        kind: "river",
        featureId: delta.featureId,
        revision: delta.revision,
        source: cloneSource(delta.source),
        outlet: cloneConnection(delta.outlet),
        controlPoints: delta.controlPoints.slice(),
        widthProfile: delta.widthProfile.slice(),
        levelProfile: delta.levelProfile.slice(),
        dischargeClass: delta.dischargeClass
      });
    } else if (delta.kind === "lake") {
      clone = Object.freeze({
        kind: "lake",
        featureId: delta.featureId,
        revision: delta.revision,
        boundaryPoints: delta.boundaryPoints.slice(),
        level: delta.level,
        profileIndex: delta.profileIndex
      });
    } else {
      clone = Object.freeze({
        kind: "tombstone",
        featureId: delta.featureId,
        revision: delta.revision,
        targetKind: delta.targetKind
      });
    }
    assertHydrologyFeatureDelta(clone);
    return clone;
  }
  function hydrologyFeatureBounds(feature) {
    assertHydrologyFeatureDelta(feature);
    if (feature.kind !== "river" && feature.kind !== "lake") {
      throw new TypeError("hydrology tombstones do not have spatial bounds");
    }
    const points = feature.kind === "river" ? feature.controlPoints : feature.boundaryPoints;
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (let index2 = 0; index2 < points.length; index2 += 2) {
      minX = Math.min(minX, points[index2]);
      minY = Math.min(minY, points[index2 + 1]);
      maxX = Math.max(maxX, points[index2]);
      maxY = Math.max(maxY, points[index2 + 1]);
    }
    return Object.freeze({ minX, minY, maxX, maxY });
  }

  // src/world/semantic/EffectiveWorldView.ts
  var validatedBaseSemanticChunks = /* @__PURE__ */ new WeakSet();
  var validatedSparseSemanticDeltas = /* @__PURE__ */ new WeakSet();
  var validatedHydrologyRegions = /* @__PURE__ */ new WeakSet();
  var validatedHydrologyFeatureDeltas = /* @__PURE__ */ new WeakSet();
  function semanticKey2(key2) {
    return `${key2.chunkX},${key2.chunkY}`;
  }
  function hydrologyKey2(key2) {
    return `${key2.regionX},${key2.regionY}`;
  }
  function assertBaseSemanticChunkOnce(value) {
    if (validatedBaseSemanticChunks.has(value)) return;
    assertBaseSemanticChunk(value);
    validatedBaseSemanticChunks.add(value);
  }
  function assertSparseSemanticDeltaOnce(value) {
    if (validatedSparseSemanticDeltas.has(value)) return;
    assertSparseSemanticDelta(value);
    validatedSparseSemanticDeltas.add(value);
  }
  function assertHydrologyRegionOnce(value) {
    if (validatedHydrologyRegions.has(value)) return;
    assertHydrologyRegion(value);
    validatedHydrologyRegions.add(value);
  }
  function assertHydrologyFeatureDeltaOnce(value) {
    if (validatedHydrologyFeatureDeltas.has(value)) return;
    assertHydrologyFeatureDelta(value);
    validatedHydrologyFeatureDeltas.add(value);
  }
  function compareSemanticKeys2(first, second) {
    return first.chunkX - second.chunkX || first.chunkY - second.chunkY;
  }
  function compareHydrologyKeys2(first, second) {
    return first.regionX - second.regionX || first.regionY - second.regionY;
  }
  function assertEffectiveRevision(value) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError("effective revision must be a non-negative safe integer");
    }
  }
  function canonicalSemanticKey(descriptor, key2) {
    const canonical = canonicalizeSemanticChunkKey(descriptor, key2);
    if (canonical.chunkX !== key2.chunkX || canonical.chunkY !== key2.chunkY) {
      throw new TypeError("effective semantic dependencies must use canonical chunk keys");
    }
    return Object.freeze(canonical);
  }
  function canonicalHydrologyKey(descriptor, key2) {
    const canonical = canonicalizeHydrologyRegionKey(descriptor, key2);
    if (canonical.regionX !== key2.regionX || canonical.regionY !== key2.regionY) {
      throw new TypeError("effective hydrology dependencies must use canonical region keys");
    }
    return Object.freeze(canonical);
  }
  function normalizeSemanticDeltas(descriptor, effectiveRevision, values) {
    if (!Array.isArray(values)) throw new TypeError("effective semantic deltas must be an array");
    const result = values.map((value) => {
      assertSparseSemanticDelta(value);
      canonicalSemanticKey(descriptor, value.key);
      if (value.revision > effectiveRevision) {
        throw new RangeError("semantic delta revision cannot exceed the effective revision");
      }
      return cloneSparseSemanticDelta(value);
    }).sort((first, second) => compareSemanticKeys2(first.key, second.key));
    for (let index2 = 1; index2 < result.length; index2 += 1) {
      if (semanticKey2(result[index2 - 1].key) === semanticKey2(result[index2].key)) {
        throw new TypeError("effective delta snapshot contains duplicate semantic chunks");
      }
    }
    return Object.freeze(result);
  }
  function normalizeHydrologyFeatures(effectiveRevision, values) {
    if (!Array.isArray(values)) throw new TypeError("effective hydrology features must be an array");
    const result = values.map((value) => {
      assertHydrologyFeatureDelta(value);
      if (value.revision > effectiveRevision) {
        throw new RangeError("hydrology feature revision cannot exceed the effective revision");
      }
      return cloneHydrologyFeatureDelta(value);
    }).sort((first, second) => first.featureId.localeCompare(second.featureId));
    for (let index2 = 1; index2 < result.length; index2 += 1) {
      if (result[index2 - 1].featureId === result[index2].featureId) {
        throw new TypeError("effective delta snapshot contains duplicate hydrology features");
      }
    }
    return Object.freeze(result);
  }
  function normalizeHydrologyRegionFeatures(descriptor, values, featureById) {
    if (!Array.isArray(values)) throw new TypeError("hydrology region feature indices must be an array");
    const referenced = /* @__PURE__ */ new Set();
    const result = values.map((value) => {
      if (!value || typeof value !== "object" || Object.getOwnPropertyNames(value).some((name) => name !== "key" && name !== "featureIds") || !Array.isArray(value.featureIds) || value.featureIds.length === 0) {
        throw new TypeError("hydrology region feature index is invalid");
      }
      const key2 = canonicalHydrologyKey(descriptor, value.key);
      const featureIds = [...value.featureIds].sort((first, second) => first.localeCompare(second));
      for (let index2 = 0; index2 < featureIds.length; index2 += 1) {
        const featureId = featureIds[index2];
        if (!featureById.has(featureId)) {
          throw new TypeError("hydrology region index references an unknown feature delta");
        }
        if (index2 > 0 && featureId === featureIds[index2 - 1]) {
          throw new TypeError("hydrology region index contains a duplicate feature ID");
        }
        referenced.add(featureId);
      }
      return Object.freeze({ key: key2, featureIds: Object.freeze(featureIds) });
    }).sort((first, second) => compareHydrologyKeys2(first.key, second.key));
    for (let index2 = 1; index2 < result.length; index2 += 1) {
      if (hydrologyKey2(result[index2 - 1].key) === hydrologyKey2(result[index2].key)) {
        throw new TypeError("effective delta snapshot contains duplicate hydrology region indices");
      }
    }
    if (referenced.size !== featureById.size) {
      throw new TypeError("every hydrology feature delta must be indexed by at least one region");
    }
    return Object.freeze(result);
  }
  function createEffectiveDeltaSnapshot(options) {
    if (!options || typeof options !== "object") throw new TypeError("effective delta snapshot options are required");
    const worldIdentity = serializeWorldDescriptorV2(options.descriptor);
    assertEffectiveRevision(options.effectiveRevision);
    const semanticDeltas = normalizeSemanticDeltas(
      options.descriptor,
      options.effectiveRevision,
      options.semanticDeltas ?? []
    );
    const hydrologyFeatures = normalizeHydrologyFeatures(
      options.effectiveRevision,
      options.hydrologyFeatures ?? []
    );
    const featureById = new Map(hydrologyFeatures.map((feature) => [feature.featureId, feature]));
    const hydrologyRegionFeatures = normalizeHydrologyRegionFeatures(
      options.descriptor,
      options.hydrologyRegionFeatures ?? [],
      featureById
    );
    if (options.effectiveRevision === 0 && (semanticDeltas.length > 0 || hydrologyFeatures.length > 0 || hydrologyRegionFeatures.length > 0)) {
      throw new TypeError("effective revision zero is reserved for an empty delta snapshot");
    }
    return Object.freeze({
      worldIdentity,
      effectiveRevision: options.effectiveRevision,
      semanticDeltas,
      hydrologyFeatures,
      hydrologyRegionFeatures
    });
  }
  function normalizeEffectiveDeltaSnapshot(descriptor, value) {
    if (!value || typeof value !== "object") throw new TypeError("effective delta snapshot must be an object");
    const allowedFields = /* @__PURE__ */ new Set([
      "worldIdentity",
      "effectiveRevision",
      "semanticDeltas",
      "hydrologyFeatures",
      "hydrologyRegionFeatures"
    ]);
    const expectedIdentity = serializeWorldDescriptorV2(descriptor);
    if (Object.getOwnPropertyNames(value).some((name) => !allowedFields.has(name)) || value.worldIdentity !== expectedIdentity) {
      throw new TypeError("effective delta snapshot belongs to a different or invalid world identity");
    }
    return createEffectiveDeltaSnapshot({
      descriptor,
      effectiveRevision: value.effectiveRevision,
      semanticDeltas: value.semanticDeltas,
      hydrologyFeatures: value.hydrologyFeatures,
      hydrologyRegionFeatures: value.hydrologyRegionFeatures
    });
  }
  function createPublishedEffectiveState(snapshot) {
    return Object.freeze({
      snapshot,
      semanticDeltaByKey: new Map(snapshot.semanticDeltas.map((delta) => [semanticKey2(delta.key), delta])),
      hydrologyFeatureById: new Map(snapshot.hydrologyFeatures.map((feature) => [feature.featureId, feature])),
      hydrologyRegionIndexByKey: new Map(snapshot.hydrologyRegionFeatures.map((index2) => [hydrologyKey2(index2.key), index2]))
    });
  }
  var EffectiveSemanticChunkSnapshot = class {
    constructor(base, delta) {
      this.base = base;
      this.delta = delta;
      assertBaseSemanticChunkOnce(base);
      if (delta) {
        assertSparseSemanticDeltaOnce(delta);
        if (semanticKey2(base.key) !== semanticKey2(delta.key)) {
          throw new TypeError("semantic base chunk and delta keys do not match");
        }
        for (const index2 of delta.indices) {
          const localX = Math.floor(index2 / WORLD_SEMANTIC_CHUNK_SIZE);
          const localY = index2 % WORLD_SEMANTIC_CHUNK_SIZE;
          if (!localBoundsContain(base.validBounds, localX, localY)) {
            throw new RangeError("semantic delta overrides a tile outside base validBounds");
          }
        }
      }
      Object.freeze(this);
    }
    getTile(localX, localY) {
      const base = readValidatedBaseSemanticTile(this.base, localX, localY);
      if (!this.delta) return base;
      const tileIndex = semanticChunkLocalIndex(localX, localY);
      const offset = sparseSemanticDeltaOverrideOffset(this.delta, tileIndex);
      if (offset < 0) return base;
      const mask = this.delta.masks[offset];
      const biomeOffset = offset * 4;
      return Object.freeze({
        ...base,
        substrateClass: mask & 1 /* Substrate */ ? this.delta.substrateClass[offset] : base.substrateClass,
        macroHeight: mask & 2 /* MacroHeight */ ? this.delta.macroHeight[offset] / 65535 : base.macroHeight,
        biomeWeights: mask & 4 /* BiomeWeights */ ? Object.freeze([
          this.delta.biomeWeights[biomeOffset] / 255,
          this.delta.biomeWeights[biomeOffset + 1] / 255,
          this.delta.biomeWeights[biomeOffset + 2] / 255,
          this.delta.biomeWeights[biomeOffset + 3] / 255
        ]) : base.biomeWeights,
        vegetationDensity: mask & 8 /* VegetationDensity */ ? this.delta.vegetationDensity[offset] / 255 : base.vegetationDensity,
        vegetationProfile: mask & 16 /* VegetationProfile */ ? this.delta.vegetationProfile[offset] : base.vegetationProfile
      });
    }
  };
  var EffectiveHydrologyRegionSnapshot = class {
    constructor(base, featureDeltas) {
      this.base = base;
      assertHydrologyRegionOnce(base);
      for (const feature of featureDeltas) assertHydrologyFeatureDeltaOnce(feature);
      this.featureDeltas = Object.freeze([...featureDeltas]);
      Object.freeze(this);
    }
    suppressesBaseRiver(riverId) {
      return this.featureDeltas.some((feature) => feature.featureId === riverId && (feature.kind === "river" || feature.kind === "tombstone" && feature.targetKind === "river"));
    }
    suppressesBaseLake(bodyId) {
      return this.featureDeltas.some((feature) => feature.featureId === bodyId && (feature.kind === "lake" || feature.kind === "tombstone" && feature.targetKind === "lake"));
    }
  };
  var EffectiveWorldSnapshot = class {
    constructor(descriptor, worldIdentity, effectiveRevision, semanticChunks, hydrologyRegions) {
      this.descriptor = descriptor;
      this.worldIdentity = worldIdentity;
      this.effectiveRevision = effectiveRevision;
      this.semanticChunks = semanticChunks;
      this.hydrologyRegions = hydrologyRegions;
      this.semanticByKey = new Map(semanticChunks.map((chunk) => [semanticKey2(chunk.base.key), chunk]));
      this.hydrologyByKey = new Map(hydrologyRegions.map((region) => [hydrologyKey2(region.base.key), region]));
      Object.freeze(this);
    }
    getSemanticChunk(key2) {
      const canonical = canonicalizeSemanticChunkKey(this.descriptor, key2);
      const chunk = this.semanticByKey.get(semanticKey2(canonical));
      if (!chunk) throw new RangeError("effective snapshot does not contain the requested semantic chunk");
      return chunk;
    }
    getHydrologyRegion(key2) {
      const canonical = canonicalizeHydrologyRegionKey(this.descriptor, key2);
      const region = this.hydrologyByKey.get(hydrologyKey2(canonical));
      if (!region) throw new RangeError("effective snapshot does not contain the requested hydrology region");
      return region;
    }
    getTile(tileX, tileY) {
      const location = locateSemanticTile(tileX, tileY);
      return this.getSemanticChunk(location.key).getTile(location.localX, location.localY);
    }
  };
  var EffectiveWorldView = class {
    constructor(descriptor, initialDeltaSnapshot) {
      this.descriptor = descriptor;
      this.worldIdentity = serializeWorldDescriptorV2(descriptor);
      const snapshot = initialDeltaSnapshot ? normalizeEffectiveDeltaSnapshot(descriptor, initialDeltaSnapshot) : createEffectiveDeltaSnapshot({ descriptor, effectiveRevision: 0 });
      this.publishedState = createPublishedEffectiveState(snapshot);
    }
    get effectiveRevision() {
      return this.publishedState.snapshot.effectiveRevision;
    }
    captureDeltaSnapshot() {
      return normalizeEffectiveDeltaSnapshot(this.descriptor, this.publishedState.snapshot);
    }
    publishDeltaSnapshot(next, expectedRevision) {
      assertEffectiveRevision(expectedRevision);
      if (next?.worldIdentity !== this.worldIdentity) {
        throw new TypeError("cannot publish an effective delta snapshot from another world identity");
      }
      if (expectedRevision !== this.publishedState.snapshot.effectiveRevision) {
        throw new RangeError(
          `effective snapshot conflict: expected ${expectedRevision}, received ${this.publishedState.snapshot.effectiveRevision}`
        );
      }
      if (next.effectiveRevision !== expectedRevision + 1) {
        throw new RangeError("effective snapshot revision must advance exactly once");
      }
      const normalized = normalizeEffectiveDeltaSnapshot(this.descriptor, next);
      this.publishedState = createPublishedEffectiveState(normalized);
    }
    capture(options) {
      if (!options || typeof options !== "object") throw new TypeError("effective snapshot capture options are required");
      if (Object.getOwnPropertyNames(options).some((name) => name !== "semanticChunks" && name !== "hydrologyRegions")) {
        throw new TypeError("effective snapshot capture contains unknown dependency fields");
      }
      const state = this.publishedState;
      const deltaSnapshot = state.snapshot;
      if (options.semanticChunks !== void 0 && !Array.isArray(options.semanticChunks) || options.hydrologyRegions !== void 0 && !Array.isArray(options.hydrologyRegions)) {
        throw new TypeError("effective snapshot dependencies must be arrays");
      }
      const semanticChunks = (options.semanticChunks ?? []).map((base) => {
        canonicalSemanticKey(this.descriptor, base.key);
        return new EffectiveSemanticChunkSnapshot(
          base,
          state.semanticDeltaByKey.get(semanticKey2(base.key))
        );
      }).sort((first, second) => compareSemanticKeys2(first.base.key, second.base.key));
      for (let index2 = 1; index2 < semanticChunks.length; index2 += 1) {
        if (semanticKey2(semanticChunks[index2 - 1].base.key) === semanticKey2(semanticChunks[index2].base.key)) {
          throw new TypeError("effective snapshot capture contains duplicate semantic chunks");
        }
      }
      const hydrologyRegions = (options.hydrologyRegions ?? []).map((base) => {
        canonicalHydrologyKey(this.descriptor, base.key);
        const index2 = state.hydrologyRegionIndexByKey.get(hydrologyKey2(base.key));
        const features = index2?.featureIds.map((featureId) => state.hydrologyFeatureById.get(featureId)) ?? [];
        return new EffectiveHydrologyRegionSnapshot(base, features);
      }).sort((first, second) => compareHydrologyKeys2(first.base.key, second.base.key));
      for (let index2 = 1; index2 < hydrologyRegions.length; index2 += 1) {
        if (hydrologyKey2(hydrologyRegions[index2 - 1].base.key) === hydrologyKey2(hydrologyRegions[index2].base.key)) {
          throw new TypeError("effective snapshot capture contains duplicate hydrology regions");
        }
      }
      return new EffectiveWorldSnapshot(
        this.descriptor,
        this.worldIdentity,
        deltaSnapshot.effectiveRevision,
        Object.freeze(semanticChunks),
        Object.freeze(hydrologyRegions)
      );
    }
  };

  // src/world/WorldEditing.ts
  function clampUnit2(value) {
    if (!Number.isFinite(value)) throw new RangeError("world edit normalized value must be finite");
    return Math.max(0, Math.min(1, value));
  }
  function quantizeUnit16(value) {
    return Math.floor(clampUnit2(value) * 65535 + 0.5);
  }
  function quantizeUnit8(value) {
    return Math.floor(clampUnit2(value) * 255 + 0.5);
  }
  function assertExpectedRevision(value) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError("expected hydrology feature revision must be a non-negative safe integer");
    }
  }
  function assertArea(area) {
    if (!area || typeof area !== "object") throw new TypeError("world edit area is required");
    const coordinates = [];
    if (area.kind === "rectangle") {
      coordinates.push(area.minX, area.minY, area.maxX, area.maxY);
      if (area.minX > area.maxX || area.minY > area.maxY) throw new RangeError("world edit rectangle is inverted");
    } else if (area.kind === "circle") {
      coordinates.push(area.centerX, area.centerY, area.radius);
      if (!Number.isFinite(area.radius) || area.radius < 0) throw new RangeError("world edit circle radius is invalid");
    } else if (area.kind === "polygon") {
      if (!Array.isArray(area.points) || area.points.length < 3) {
        throw new TypeError("world edit polygon requires at least three points");
      }
      for (const point of area.points) coordinates.push(point.x, point.y);
    } else throw new TypeError("world edit area kind is invalid");
    if (coordinates.some((value) => !Number.isFinite(value) || !Number.isSafeInteger(value * HYDROLOGY_COORDINATE_SCALE))) {
      throw new RangeError(`world edit area coordinates must be exact 1/${HYDROLOGY_COORDINATE_SCALE}-tile values`);
    }
  }
  function areaBounds(area) {
    assertArea(area);
    if (area.kind === "rectangle") return Object.freeze({
      minX: Math.ceil(area.minX),
      minY: Math.ceil(area.minY),
      maxX: Math.floor(area.maxX),
      maxY: Math.floor(area.maxY)
    });
    if (area.kind === "circle") return Object.freeze({
      minX: Math.ceil(area.centerX - area.radius),
      minY: Math.ceil(area.centerY - area.radius),
      maxX: Math.floor(area.centerX + area.radius),
      maxY: Math.floor(area.centerY + area.radius)
    });
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const point of area.points) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
    return Object.freeze({ minX: Math.ceil(minX), minY: Math.ceil(minY), maxX: Math.floor(maxX), maxY: Math.floor(maxY) });
  }
  function pointInPolygon2(x, y, polygon) {
    let inside = false;
    for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current, current += 1) {
      const a = polygon[current];
      const b = polygon[previous];
      if (a.y > y !== b.y > y && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  }
  function areaWeight(area, x, y, falloff) {
    let inside = false;
    let normalized = 1;
    if (area.kind === "rectangle") {
      inside = x >= area.minX && x <= area.maxX && y >= area.minY && y <= area.maxY;
      if (inside && falloff === "smooth") {
        const halfWidth = Math.max(0.5, (area.maxX - area.minX) / 2);
        const halfHeight = Math.max(0.5, (area.maxY - area.minY) / 2);
        const centerX = (area.minX + area.maxX) / 2;
        const centerY = (area.minY + area.maxY) / 2;
        normalized = Math.max(0, 1 - Math.max(Math.abs(x - centerX) / halfWidth, Math.abs(y - centerY) / halfHeight));
      }
    } else if (area.kind === "circle") {
      const distance = Math.hypot(x - area.centerX, y - area.centerY);
      inside = distance <= area.radius;
      if (inside && falloff === "smooth") normalized = area.radius === 0 ? 1 : Math.max(0, 1 - distance / area.radius);
    } else inside = pointInPolygon2(x, y, area.points);
    if (!inside) return 0;
    return falloff === "smooth" ? normalized * normalized * (3 - 2 * normalized) : 1;
  }
  function rasterizeArea(area, maximumTiles) {
    const bounds = areaBounds(area);
    const width = Math.max(0, bounds.maxX - bounds.minX + 1);
    const height = Math.max(0, bounds.maxY - bounds.minY + 1);
    if (!Number.isSafeInteger(width * height) || width * height > maximumTiles * 4) {
      throw new RangeError("world edit area candidate bounds exceed the transaction limit");
    }
    const points = [];
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
        if (areaWeight(area, x, y, "none") === 0) continue;
        points.push(Object.freeze({ x, y }));
        if (points.length > maximumTiles) throw new RangeError("world edit area exceeds the transaction tile limit");
      }
    }
    return Object.freeze(points);
  }
  function quantizeBiomeWeights2(weights) {
    if (!Array.isArray(weights) || weights.length !== 4 || weights.some((value) => !Number.isFinite(value) || value < 0)) {
      throw new TypeError("material biome weights must contain four non-negative finite values");
    }
    const total = weights.reduce((sum, value) => sum + value, 0);
    if (total <= 0) throw new RangeError("material biome weights must have positive total weight");
    const scaled = weights.map((value) => value / total * 255);
    const result = scaled.map(Math.floor);
    let remaining = 255 - result.reduce((sum, value) => sum + value, 0);
    const order = scaled.map((value, index2) => ({ index: index2, remainder: value - result[index2] })).sort((first, second) => second.remainder - first.remainder || first.index - second.index);
    for (let index2 = 0; remaining > 0; index2 += 1, remaining -= 1) result[order[index2].index] += 1;
    return Object.freeze(result);
  }
  function quantizedWorldPoints(points, minimum) {
    if (!Array.isArray(points) || points.length < minimum) {
      throw new TypeError(`hydrology edit requires at least ${minimum} points`);
    }
    const result = new Float64Array(points.length * 2);
    for (let index2 = 0; index2 < points.length; index2 += 1) {
      const point = points[index2];
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
        throw new RangeError("hydrology edit point coordinates must be finite");
      }
      result[index2 * 2] = Math.round(point.x * HYDROLOGY_COORDINATE_SCALE) / HYDROLOGY_COORDINATE_SCALE;
      result[index2 * 2 + 1] = Math.round(point.y * HYDROLOGY_COORDINATE_SCALE) / HYDROLOGY_COORDINATE_SCALE;
    }
    return result;
  }
  function profileValues(value, count, quantize) {
    const values = typeof value === "number" ? Array(count).fill(value) : [...value];
    if (values.length !== count) throw new RangeError("hydrology profile length must match its control points");
    return Uint8Array.from(values, quantize);
  }
  function key(x, y) {
    return `${x},${y}`;
  }
  var WorldEditTransaction = class {
    constructor(maximumTiles) {
      this.maximumTiles = maximumTiles;
      this.semanticOperations = [];
      this.directSemanticMutations = [];
      this.hydrologyMutations = [];
      this.rebakes = [];
      this.closed = false;
    }
    raiseTerrain(area, options) {
      this.assertOpen();
      assertArea(area);
      if (!options || !Number.isFinite(options.delta) || options.delta < -1 || options.delta > 1 || options.delta === 0 || options.falloff !== void 0 && options.falloff !== "none" && options.falloff !== "smooth" || options.waterPolicy !== void 0 && !["reject", "preserve-channel", "coupled"].includes(options.waterPolicy)) {
        throw new TypeError("raiseTerrain options are invalid");
      }
      this.semanticOperations.push({
        area,
        options: {
          delta: options.delta,
          falloff: options.falloff ?? "smooth",
          waterPolicy: options.waterPolicy ?? "reject"
        }
      });
    }
    paintMaterial(area, options) {
      this.assertOpen();
      assertArea(area);
      const biomeWeights = quantizeBiomeWeights2(options?.biomeWeights ?? []);
      if (options.substrateClass !== void 0 && (!Number.isInteger(options.substrateClass) || options.substrateClass < 0 || options.substrateClass > 255)) {
        throw new RangeError("material substrateClass must be a Uint8 value");
      }
      this.semanticOperations.push({ area, options: Object.freeze({ ...options, biomeWeights }) });
    }
    paintVegetation(area, options) {
      this.assertOpen();
      assertArea(area);
      if (!options || !Number.isFinite(options.density) || options.density < 0 || options.density > 1 || !Number.isInteger(options.profile) || options.profile < 0 || options.profile > 255) {
        throw new TypeError("paintVegetation options are invalid");
      }
      this.semanticOperations.push({ area, options: Object.freeze({ ...options }) });
    }
    setSemantic(mutation) {
      this.assertOpen();
      this.directSemanticMutations.push(Object.freeze({ ...mutation }));
    }
    upsertHydrology(feature, expectedRevision) {
      this.assertOpen();
      assertExpectedRevision(expectedRevision);
      this.hydrologyMutations.push(Object.freeze({ kind: "upsert", expectedRevision, feature }));
    }
    deleteHydrology(featureId, targetKind, expectedRevision) {
      this.assertOpen();
      assertExpectedRevision(expectedRevision);
      this.hydrologyMutations.push(Object.freeze({ kind: "delete", featureId, targetKind, expectedRevision }));
    }
    upsertRiver(featureId, controlPoints, options) {
      this.assertOpen();
      assertExpectedRevision(options.expectedRevision);
      const points = quantizedWorldPoints(controlPoints, 2);
      const widthProfile = profileValues(options.width, controlPoints.length, (value) => {
        if (!Number.isFinite(value) || value <= 0) throw new RangeError("river width must be positive and finite");
        const quantized = Math.round(value * HYDROLOGY_COORDINATE_SCALE);
        if (quantized < 1 || quantized > 255) throw new RangeError("river width exceeds the authority format");
        return quantized;
      });
      if (options.levelMode === "fit-downhill") {
        this.hydrologyMutations.push(Object.freeze({
          kind: "upsert-pending-fit",
          featureId,
          expectedRevision: options.expectedRevision,
          source: options.source,
          outlet: options.outlet,
          controlPoints: points,
          widthProfile,
          dischargeClass: options.dischargeClass,
          minimumDepth: options.minimumDepth ?? 1 / 65535
        }));
        return;
      }
      const levelProfile = Uint16Array.from(options.levelMode, quantizeUnit16);
      if (levelProfile.length !== controlPoints.length) throw new RangeError("river level profile length is invalid");
      this.upsertHydrology({
        kind: "river",
        featureId,
        source: options.source,
        outlet: options.outlet,
        controlPoints: points,
        widthProfile,
        levelProfile,
        dischargeClass: options.dischargeClass
      }, options.expectedRevision);
    }
    upsertLake(featureId, boundary, options) {
      this.assertOpen();
      this.upsertHydrology({
        kind: "lake",
        featureId,
        boundaryPoints: quantizedWorldPoints(boundary, 3),
        level: quantizeUnit16(options.level),
        profileIndex: options.profileIndex
      }, options.expectedRevision);
    }
    rebakeHydrology(area) {
      this.assertOpen();
      assertArea(area);
      this.rebakes.push({ area });
    }
    close() {
      this.closed = true;
    }
    get operations() {
      return Object.freeze({
        semantic: Object.freeze([...this.semanticOperations]),
        directSemantic: Object.freeze([...this.directSemanticMutations]),
        hydrology: Object.freeze([...this.hydrologyMutations]),
        rebakes: Object.freeze([...this.rebakes])
      });
    }
    rasterize(area) {
      return rasterizeArea(area, this.maximumTiles);
    }
    assertOpen() {
      if (this.closed) throw new Error("world edit transaction is closed");
    }
  };
  function isPendingFit(value) {
    return value.kind === "upsert-pending-fit";
  }
  var WorldEditor = class _WorldEditor {
    constructor(options, snapshot) {
      this.pending = Promise.resolve();
      this.listeners = /* @__PURE__ */ new Set();
      this.disposed = false;
      this.descriptor = options.descriptor;
      this.store = options.store;
      this.authority = options.authority;
      this.rebaker = options.hydrologyRebaker;
      this.maximumTiles = options.maximumTilesPerTransaction ?? 65536;
      if (!Number.isSafeInteger(this.maximumTiles) || this.maximumTiles <= 0) {
        throw new RangeError("maximumTilesPerTransaction must be a positive safe integer");
      }
      this.view = new EffectiveWorldView(options.descriptor, snapshot);
    }
    static async create(options) {
      if (!options || typeof options !== "object" || !options.store || !options.authority || typeof options.authority.readSemanticTile !== "function" || typeof options.authority.hydrologyConstraintsAt !== "function") {
        throw new TypeError("WorldEditor options are invalid");
      }
      const snapshot = await options.store.load(options.descriptor);
      if (snapshot.worldIdentity !== serializeWorldDescriptorV2(options.descriptor)) {
        throw new TypeError("WorldDeltaStore returned a snapshot for another world");
      }
      return new _WorldEditor(options, snapshot);
    }
    edit(build) {
      if (this.disposed) return Promise.reject(new Error("WorldEditor has been disposed"));
      if (typeof build !== "function") return Promise.reject(new TypeError("world edit callback is required"));
      const execute = async () => {
        const expectedRevision = this.view.effectiveRevision;
        const transaction = new WorldEditTransaction(this.maximumTiles);
        build(transaction);
        transaction.close();
        const prepared = await this.prepare(transaction, expectedRevision);
        const result2 = await this.store.commit({
          descriptor: this.descriptor,
          expectedRevision,
          semanticMutations: prepared.semantic,
          hydrologyMutations: prepared.hydrology
        });
        if (result2.changed) {
          this.view.publishDeltaSnapshot(result2.snapshot, expectedRevision);
          for (const listener of this.listeners) listener(result2.changeSet);
        }
        return result2;
      };
      const result = this.pending.then(execute, execute);
      this.pending = result.then(() => void 0, () => void 0);
      return result;
    }
    subscribe(listener) {
      if (this.disposed || typeof listener !== "function") throw new TypeError("world editor subscription is invalid");
      this.listeners.add(listener);
      return () => {
        this.listeners.delete(listener);
      };
    }
    async saveBarrier() {
      await this.pending;
      await this.store.flush();
      return this.store.saveBarrier(this.descriptor);
    }
    async flush() {
      await this.pending;
      await this.store.flush();
    }
    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      this.listeners.clear();
    }
    async prepare(transaction, expectedRevision) {
      if (expectedRevision !== this.view.effectiveRevision) throw new Error("world edit revision changed while preparing");
      const deltaSnapshot = this.view.captureDeltaSnapshot();
      const operations = transaction.operations;
      const hydrology = [];
      for (const mutation of operations.hydrology) {
        if (!isPendingFit(mutation)) {
          hydrology.push(mutation);
          continue;
        }
        const pointCount = mutation.controlPoints.length / 2;
        const levels = new Uint16Array(pointCount);
        let previousLevel = 65535;
        const minimumDepth = Math.max(1, quantizeUnit16(mutation.minimumDepth));
        for (let index2 = 0; index2 < pointCount; index2 += 1) {
          const x = Math.round(mutation.controlPoints[index2 * 2]);
          const y = Math.round(mutation.controlPoints[index2 * 2 + 1]);
          const tile = await this.authority.readSemanticTile(x, y);
          const fitted = Math.min(65535, tile.macroHeight + minimumDepth, previousLevel);
          levels[index2] = fitted;
          previousLevel = fitted;
        }
        hydrology.push(Object.freeze({
          kind: "upsert",
          expectedRevision: mutation.expectedRevision,
          feature: Object.freeze({
            kind: "river",
            featureId: mutation.featureId,
            source: mutation.source,
            outlet: mutation.outlet,
            controlPoints: mutation.controlPoints,
            widthProfile: mutation.widthProfile,
            levelProfile: levels,
            dischargeClass: mutation.dischargeClass
          })
        }));
      }
      if (operations.rebakes.length > 0 && !this.rebaker) {
        throw new Error("rebakeHydrology requires an explicit HydrologyRebaker");
      }
      for (const operation of operations.rebakes) {
        const result = await this.rebaker.rebake(operation.area, deltaSnapshot);
        if (!result || !Array.isArray(result.mutations)) throw new TypeError("HydrologyRebaker returned an invalid result");
        hydrology.push(...result.mutations);
      }
      const coupledFeatures = new Set(hydrology.map((mutation) => mutation.kind === "upsert" ? mutation.feature.featureId : mutation.featureId));
      const semantic = /* @__PURE__ */ new Map();
      for (const mutation of operations.directSemantic) semantic.set(key(mutation.x, mutation.y), mutation);
      const tileCache = /* @__PURE__ */ new Map();
      const readTile = async (x, y) => {
        const serialized = key(x, y);
        let tile = tileCache.get(serialized);
        if (!tile) {
          const base = await this.authority.readSemanticTile(x, y);
          const location = locateSemanticTile(x, y);
          const delta = deltaSnapshot.semanticDeltas.find((candidate) => candidate.key.chunkX === location.key.chunkX && candidate.key.chunkY === location.key.chunkY);
          const offset = delta ? sparseSemanticDeltaOverrideOffset(
            delta,
            location.localX * 32 + location.localY
          ) : -1;
          if (!delta || offset < 0) tile = base;
          else {
            const mask = delta.masks[offset];
            const biomeOffset = offset * 4;
            tile = Object.freeze({
              substrateClass: mask & 1 /* Substrate */ ? delta.substrateClass[offset] : base.substrateClass,
              macroHeight: mask & 2 /* MacroHeight */ ? delta.macroHeight[offset] : base.macroHeight,
              biomeWeights: mask & 4 /* BiomeWeights */ ? Object.freeze([
                delta.biomeWeights[biomeOffset],
                delta.biomeWeights[biomeOffset + 1],
                delta.biomeWeights[biomeOffset + 2],
                delta.biomeWeights[biomeOffset + 3]
              ]) : base.biomeWeights,
              vegetationDensity: mask & 8 /* VegetationDensity */ ? delta.vegetationDensity[offset] : base.vegetationDensity,
              vegetationProfile: mask & 16 /* VegetationProfile */ ? delta.vegetationProfile[offset] : base.vegetationProfile
            });
          }
          tileCache.set(serialized, tile);
        }
        return tile;
      };
      for (const operation of operations.semantic) {
        const points = transaction.rasterize(operation.area);
        if ("delta" in operation.options) {
          for (const point of points) {
            const weight = areaWeight(operation.area, point.x, point.y, operation.options.falloff);
            if (weight <= 0) continue;
            const previous = semantic.get(key(point.x, point.y));
            const current = previous?.macroHeight ?? (await readTile(point.x, point.y)).macroHeight;
            let requested = Math.max(0, Math.min(65535, Math.round(current + operation.options.delta * weight * 65535)));
            const constraints = await this.authority.hydrologyConstraintsAt(point.x, point.y);
            for (const constraint of constraints) {
              if (!Number.isInteger(constraint.maximumGroundHeight) || constraint.maximumGroundHeight < 0 || constraint.maximumGroundHeight > 65535) {
                throw new TypeError("hydrology authority returned an invalid ground constraint");
              }
              if (requested <= constraint.maximumGroundHeight) continue;
              if (operation.options.waterPolicy === "reject") {
                throw new Error(`terrain edit conflicts with hydrology feature ${constraint.featureId}`);
              }
              if (operation.options.waterPolicy === "coupled") {
                if (!coupledFeatures.has(constraint.featureId)) {
                  throw new Error(`coupled terrain edit does not mutate hydrology feature ${constraint.featureId}`);
                }
                continue;
              }
              requested = constraint.maximumGroundHeight;
            }
            semantic.set(key(point.x, point.y), Object.freeze({ ...previous, x: point.x, y: point.y, macroHeight: requested }));
          }
        } else if ("biomeWeights" in operation.options) {
          for (const point of points) {
            const previous = semantic.get(key(point.x, point.y));
            semantic.set(key(point.x, point.y), Object.freeze({
              ...previous,
              x: point.x,
              y: point.y,
              substrateClass: operation.options.substrateClass,
              biomeWeights: operation.options.biomeWeights
            }));
          }
        } else {
          for (const point of points) {
            const previous = semantic.get(key(point.x, point.y));
            semantic.set(key(point.x, point.y), Object.freeze({
              ...previous,
              x: point.x,
              y: point.y,
              vegetationDensity: quantizeUnit8(operation.options.density),
              vegetationProfile: operation.options.profile
            }));
          }
        }
      }
      return Object.freeze({
        semantic: Object.freeze([...semantic.values()].sort((first, second) => first.x - second.x || first.y - second.y)),
        hydrology: Object.freeze(hydrology)
      });
    }
  };

  // src/world/semantic/WorldChangeSet.ts
  var WorldChangeDomain = /* @__PURE__ */ ((WorldChangeDomain2) => {
    WorldChangeDomain2[WorldChangeDomain2["Height"] = 1] = "Height";
    WorldChangeDomain2[WorldChangeDomain2["Material"] = 2] = "Material";
    WorldChangeDomain2[WorldChangeDomain2["Hydrology"] = 4] = "Hydrology";
    WorldChangeDomain2[WorldChangeDomain2["Vegetation"] = 8] = "Vegetation";
    WorldChangeDomain2[WorldChangeDomain2["Navigation"] = 16] = "Navigation";
    WorldChangeDomain2[WorldChangeDomain2["Fog"] = 32] = "Fog";
    WorldChangeDomain2[WorldChangeDomain2["Application"] = 64] = "Application";
    return WorldChangeDomain2;
  })(WorldChangeDomain || {});
  function assertDomainMask(value) {
    if (!Number.isSafeInteger(value) || value <= 0 || (value & -128) !== 0) {
      throw new RangeError("world change domain mask is invalid");
    }
  }
  function assertCoordinate(name, value) {
    if (!Number.isSafeInteger(value)) throw new RangeError(`${name} must be a safe integer`);
  }
  function nestedGetOrCreate(rows, x, y, create) {
    let row = rows.get(x);
    if (!row) {
      row = /* @__PURE__ */ new Map();
      rows.set(x, row);
    }
    let value = row.get(y);
    if (!value) {
      value = create();
      row.set(y, value);
    }
    return value;
  }
  function addPointBounds(rows, chunkX, chunkY, localX, localY, domains) {
    const value = nestedGetOrCreate(rows, chunkX, chunkY, () => ({
      minX: localX,
      minY: localY,
      maxX: localX,
      maxY: localY,
      domains: 0
    }));
    value.minX = Math.min(value.minX, localX);
    value.minY = Math.min(value.minY, localY);
    value.maxX = Math.max(value.maxX, localX);
    value.maxY = Math.max(value.maxY, localY);
    value.domains |= domains;
  }
  function forEachChunkInBounds(bounds, size, visit) {
    const minChunkX = Math.floor(bounds.minX / size);
    const minChunkY = Math.floor(bounds.minY / size);
    const maxChunkX = Math.floor(bounds.maxX / size);
    const maxChunkY = Math.floor(bounds.maxY / size);
    for (let chunkX = minChunkX; chunkX <= maxChunkX; chunkX += 1) {
      for (let chunkY = minChunkY; chunkY <= maxChunkY; chunkY += 1) visit(chunkX, chunkY);
    }
  }
  function combinedBounds(previous, next) {
    const present = previous ?? next;
    if (!present) throw new TypeError("hydrology feature change must have previous or next geometry");
    return Object.freeze({
      minX: Math.floor(Math.min(previous?.minX ?? present.minX, next?.minX ?? present.minX)),
      minY: Math.floor(Math.min(previous?.minY ?? present.minY, next?.minY ?? present.minY)),
      maxX: Math.ceil(Math.max(previous?.maxX ?? present.maxX, next?.maxX ?? present.maxX)),
      maxY: Math.ceil(Math.max(previous?.maxY ?? present.maxY, next?.maxY ?? present.maxY))
    });
  }
  function expanded(bounds, radius) {
    return Object.freeze({
      minX: bounds.minX - radius,
      minY: bounds.minY - radius,
      maxX: bounds.maxX + radius,
      maxY: bounds.maxY + radius
    });
  }
  function sortedNested(rows) {
    const values = [];
    for (const [x, row] of rows) for (const [y, value] of row) values.push([x, y, value]);
    values.sort((first, second) => first[0] - second[0] || first[1] - second[1]);
    return values;
  }
  function canonicalTile(descriptor, x, y) {
    if (descriptor.topology === "toroidal") {
      const modulo2 = (value, size) => (value % size + size) % size;
      return Object.freeze({ x: modulo2(x, descriptor.width), y: modulo2(y, descriptor.height) });
    }
    if (descriptor.topology === "bounded" && (x < 0 || y < 0 || x >= descriptor.width || y >= descriptor.height)) {
      throw new RangeError("world change lies outside bounded topology");
    }
    return Object.freeze({ x, y });
  }
  function createWorldChangeSet(options) {
    if (!options || typeof options !== "object" || typeof options.transactionId !== "bigint" || options.transactionId <= 0n || !Number.isSafeInteger(options.revision) || options.revision <= 0) {
      throw new TypeError("world change-set identity is invalid");
    }
    const semanticRows = /* @__PURE__ */ new Map();
    const renderRows = /* @__PURE__ */ new Map();
    const hydrologyRows = /* @__PURE__ */ new Map();
    const navigationRows = /* @__PURE__ */ new Map();
    const simulationRows = /* @__PURE__ */ new Map();
    let domains = 0;
    const addRenderBounds = (bounds, changeDomains) => {
      forEachChunkInBounds(bounds, SURFACE_RENDER_CHUNK_SIZE, (rawX, rawY) => {
        let key2;
        try {
          key2 = canonicalizeRenderChunkKey(options.descriptor, { chunkX: rawX, chunkY: rawY });
        } catch (reason) {
          if (options.descriptor.topology === "bounded" && reason instanceof RangeError) return;
          throw reason;
        }
        nestedGetOrCreate(renderRows, key2.chunkX, key2.chunkY, () => ({ domains: 0 })).domains |= changeDomains;
      });
    };
    const addConsumerBounds = (bounds) => {
      forEachChunkInBounds(bounds, WORLD_SEMANTIC_CHUNK_SIZE, (rawX, rawY) => {
        let key2;
        try {
          key2 = canonicalizeSemanticChunkKey(options.descriptor, { chunkX: rawX, chunkY: rawY });
        } catch (reason) {
          if (options.descriptor.topology === "bounded" && reason instanceof RangeError) return;
          throw reason;
        }
        nestedGetOrCreate(navigationRows, key2.chunkX, key2.chunkY, () => true);
      });
      forEachChunkInBounds(bounds, WORLD_SEMANTIC_CHUNK_SIZE * 2, (rawX, rawY) => {
        if (options.descriptor.topology === "bounded") {
          const originX = rawX * WORLD_SEMANTIC_CHUNK_SIZE * 2;
          const originY = rawY * WORLD_SEMANTIC_CHUNK_SIZE * 2;
          if (originX < 0 || originY < 0 || originX >= options.descriptor.width || originY >= options.descriptor.height) return;
        }
        const key2 = options.descriptor.topology === "toroidal" ? {
          chunkX: (rawX % Math.ceil(options.descriptor.width / 64) + Math.ceil(options.descriptor.width / 64)) % Math.ceil(options.descriptor.width / 64),
          chunkY: (rawY % Math.ceil(options.descriptor.height / 64) + Math.ceil(options.descriptor.height / 64)) % Math.ceil(options.descriptor.height / 64)
        } : { chunkX: rawX, chunkY: rawY };
        nestedGetOrCreate(simulationRows, key2.chunkX, key2.chunkY, () => true);
      });
    };
    for (const change of options.semanticChanges ?? []) {
      assertCoordinate("semantic change x", change.x);
      assertCoordinate("semantic change y", change.y);
      assertDomainMask(change.domains);
      const point = canonicalTile(options.descriptor, change.x, change.y);
      const chunkX = Math.floor(point.x / WORLD_SEMANTIC_CHUNK_SIZE);
      const chunkY = Math.floor(point.y / WORLD_SEMANTIC_CHUNK_SIZE);
      const key2 = canonicalizeSemanticChunkKey(options.descriptor, { chunkX, chunkY });
      const localX = point.x - chunkX * WORLD_SEMANTIC_CHUNK_SIZE;
      const localY = point.y - chunkY * WORLD_SEMANTIC_CHUNK_SIZE;
      addPointBounds(semanticRows, key2.chunkX, key2.chunkY, localX, localY, change.domains);
      domains |= change.domains;
      const influence = change.domains & (1 /* Height */ | 8 /* Vegetation */) ? SURFACE_INFLUENCE_RADIUS_TILES : 0;
      const dirty = expanded({ minX: point.x, minY: point.y, maxX: point.x, maxY: point.y }, influence);
      addRenderBounds(dirty, change.domains);
      if (change.domains & (1 /* Height */ | 16 /* Navigation */)) addConsumerBounds(dirty);
    }
    const hydrologyFeatures = [];
    for (const change of options.hydrologyChanges ?? []) {
      const previousBounds = change.previous ? hydrologyFeatureBounds(change.previous) : void 0;
      const nextBounds = change.next ? hydrologyFeatureBounds(change.next) : void 0;
      const bounds = combinedBounds(previousBounds, nextBounds);
      const dirty = expanded(bounds, SURFACE_INFLUENCE_RADIUS_TILES);
      hydrologyFeatures.push(Object.freeze({ featureId: change.featureId, previousBounds, nextBounds }));
      domains |= 4 /* Hydrology */ | 16 /* Navigation */;
      addRenderBounds(dirty, 4 /* Hydrology */ | 8 /* Vegetation */);
      addConsumerBounds(dirty);
      forEachChunkInBounds(bounds, HYDROLOGY_REGION_SIZE, (rawX, rawY) => {
        let key2;
        try {
          key2 = canonicalizeHydrologyRegionKey(options.descriptor, { regionX: rawX, regionY: rawY });
        } catch (reason) {
          if (options.descriptor.topology === "bounded" && reason instanceof RangeError) return;
          throw reason;
        }
        nestedGetOrCreate(hydrologyRows, key2.regionX, key2.regionY, () => true);
      });
    }
    hydrologyFeatures.sort((first, second) => first.featureId.localeCompare(second.featureId));
    return Object.freeze({
      transactionId: options.transactionId,
      revision: options.revision,
      domains,
      semanticChunks: Object.freeze(sortedNested(semanticRows).map(([chunkX, chunkY, value]) => Object.freeze({
        key: Object.freeze({ chunkX, chunkY }),
        domains: value.domains,
        localBounds: Object.freeze({
          minX: value.minX,
          minY: value.minY,
          maxX: value.maxX,
          maxY: value.maxY
        })
      }))),
      hydrologyFeatures: Object.freeze(hydrologyFeatures),
      hydrologyRegions: Object.freeze(sortedNested(hydrologyRows).map(([regionX, regionY]) => Object.freeze({
        key: Object.freeze({ regionX, regionY })
      }))),
      renderChunks: Object.freeze(sortedNested(renderRows).map(([chunkX, chunkY, value]) => Object.freeze({
        key: Object.freeze({ chunkX, chunkY }),
        domains: value.domains
      }))),
      navigationChunks: Object.freeze(sortedNested(navigationRows).map(([chunkX, chunkY]) => Object.freeze({
        key: Object.freeze({ chunkX, chunkY })
      }))),
      simulationChunks: Object.freeze(sortedNested(simulationRows).map(([chunkX, chunkY]) => Object.freeze({
        chunkX,
        chunkY
      })))
    });
  }

  // src/world/WorldDeltaStore.ts
  var WORLD_DELTA_FORMAT_VERSION = 3;
  var WORLD_DELTA_CHECKPOINT_FORMAT_VERSION = 1;
  var WorldDeltaRevisionConflictError = class extends Error {
    constructor(scope, expectedRevision, actualRevision, featureId) {
      super(scope === "world" ? `World delta revision conflict: expected ${expectedRevision}, received ${actualRevision}` : `Hydrology feature ${featureId} revision conflict: expected ${expectedRevision}, received ${actualRevision}`);
      this.scope = scope;
      this.expectedRevision = expectedRevision;
      this.actualRevision = actualRevision;
      this.featureId = featureId;
      this.name = "WorldDeltaRevisionConflictError";
    }
  };
  var SEMANTIC_FIELDS = [
    "substrateClass",
    "macroHeight",
    "biomeWeights",
    "vegetationDensity",
    "vegetationProfile"
  ];
  function assertRevision2(name, value) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError(`${name} must be a non-negative safe integer`);
    }
  }
  function semanticKey3(key2) {
    return `${key2.chunkX},${key2.chunkY}`;
  }
  function cloneDescriptor(descriptor) {
    assertWorldDescriptorV2(descriptor);
    return structuredClone(descriptor);
  }
  function semanticDomain(mutation) {
    let domains = 0;
    if (mutation.macroHeight !== void 0) domains |= 1 /* Height */ | 16 /* Navigation */;
    if (mutation.substrateClass !== void 0 || mutation.biomeWeights !== void 0) domains |= 2 /* Material */;
    if (mutation.vegetationDensity !== void 0 || mutation.vegetationProfile !== void 0) {
      domains |= 8 /* Vegetation */;
    }
    return domains;
  }
  function assertSemanticMutation(value) {
    if (!value || typeof value !== "object" || Object.getOwnPropertyNames(value).some((name) => ![
      "x",
      "y",
      "substrateClass",
      "macroHeight",
      "biomeWeights",
      "vegetationDensity",
      "vegetationProfile"
    ].includes(name)) || !Number.isSafeInteger(value.x) || !Number.isSafeInteger(value.y)) {
      throw new TypeError("semantic authority mutation is invalid");
    }
    if (semanticDomain(value) === 0) throw new TypeError("semantic authority mutation is empty");
    for (const field2 of ["substrateClass", "vegetationDensity", "vegetationProfile"]) {
      const candidate = value[field2];
      if (candidate !== void 0 && candidate !== null && (!Number.isInteger(candidate) || candidate < 0 || candidate > 255)) {
        throw new RangeError(`semantic ${field2} mutation must be a Uint8 value or null`);
      }
    }
    if (value.macroHeight !== void 0 && value.macroHeight !== null && (!Number.isInteger(value.macroHeight) || value.macroHeight < 0 || value.macroHeight > 65535)) {
      throw new RangeError("semantic macroHeight mutation must be a Uint16 value or null");
    }
    if (value.biomeWeights !== void 0 && value.biomeWeights !== null && (!Array.isArray(value.biomeWeights) || value.biomeWeights.length !== 4 || value.biomeWeights.some((weight) => !Number.isInteger(weight) || weight < 0 || weight > 255) || value.biomeWeights.reduce((sum, weight) => sum + weight, 0) !== 255)) {
      throw new RangeError("semantic biomeWeights mutation must contain four Uint8 values summing to 255 or null");
    }
  }
  function decodeSemanticDelta(delta) {
    const result = /* @__PURE__ */ new Map();
    for (let offset = 0; offset < delta.indices.length; offset += 1) {
      const index2 = delta.indices[offset];
      const mask = delta.masks[offset];
      const tile = {
        localX: Math.floor(index2 / 32),
        localY: index2 % 32
      };
      if (mask & 1 /* Substrate */) tile.substrateClass = delta.substrateClass[offset];
      if (mask & 2 /* MacroHeight */) tile.macroHeight = delta.macroHeight[offset];
      if (mask & 4 /* BiomeWeights */) {
        const start = offset * 4;
        tile.biomeWeights = [
          delta.biomeWeights[start],
          delta.biomeWeights[start + 1],
          delta.biomeWeights[start + 2],
          delta.biomeWeights[start + 3]
        ];
      }
      if (mask & 8 /* VegetationDensity */) {
        tile.vegetationDensity = delta.vegetationDensity[offset];
      }
      if (mask & 16 /* VegetationProfile */) {
        tile.vegetationProfile = delta.vegetationProfile[offset];
      }
      result.set(index2, tile);
    }
    return result;
  }
  function hasSemanticFields(tile) {
    return SEMANTIC_FIELDS.some((field2) => tile[field2] !== void 0);
  }
  function applySemanticMutations(descriptor, current, mutations, revision) {
    const byChunk = /* @__PURE__ */ new Map();
    const touched = /* @__PURE__ */ new Set();
    for (const delta of current) byChunk.set(semanticKey3(delta.key), { key: delta.key, tiles: decodeSemanticDelta(delta) });
    for (const mutation of mutations) {
      if (descriptor.topology === "bounded" && (mutation.x < 0 || mutation.y < 0 || mutation.x >= descriptor.width || mutation.y >= descriptor.height)) {
        throw new RangeError("semantic authority mutation lies outside bounded topology");
      }
      const location = locateSemanticTile(mutation.x, mutation.y);
      const key2 = canonicalizeSemanticChunkKey(descriptor, location.key);
      const localX = descriptor.topology === "toroidal" ? (mutation.x % descriptor.width + descriptor.width) % descriptor.width - key2.chunkX * 32 : location.localX;
      const localY = descriptor.topology === "toroidal" ? (mutation.y % descriptor.height + descriptor.height) % descriptor.height - key2.chunkY * 32 : location.localY;
      const index2 = semanticChunkLocalIndex(localX, localY);
      const bucketKey = semanticKey3(key2);
      touched.add(bucketKey);
      let bucket = byChunk.get(bucketKey);
      if (!bucket) {
        bucket = { key: key2, tiles: /* @__PURE__ */ new Map() };
        byChunk.set(bucketKey, bucket);
      }
      const tile = bucket.tiles.get(index2) ?? { localX, localY };
      for (const field2 of SEMANTIC_FIELDS) {
        const value = mutation[field2];
        if (value === void 0) continue;
        if (value === null) delete tile[field2];
        else if (field2 === "biomeWeights") {
          tile.biomeWeights = Object.freeze([...value]);
        } else tile[field2] = value;
      }
      if (hasSemanticFields(tile)) bucket.tiles.set(index2, tile);
      else bucket.tiles.delete(index2);
    }
    const result = [];
    for (const bucket of byChunk.values()) {
      if (bucket.tiles.size === 0) continue;
      const overrides = [...bucket.tiles.values()].sort(
        (first, second) => semanticChunkLocalIndex(first.localX, first.localY) - semanticChunkLocalIndex(second.localX, second.localY)
      ).map((tile) => ({ ...tile }));
      const previous = current.find((delta) => semanticKey3(delta.key) === semanticKey3(bucket.key));
      result.push(createSparseSemanticDelta({
        key: bucket.key,
        revision: touched.has(semanticKey3(bucket.key)) ? revision : previous.revision,
        overrides
      }));
    }
    result.sort((first, second) => first.key.chunkX - second.key.chunkX || first.key.chunkY - second.key.chunkY);
    return Object.freeze(result);
  }
  function hydrologyInputWithRevision(mutation, revision) {
    const value = mutation.kind === "delete" ? Object.freeze({
      kind: "tombstone",
      featureId: mutation.featureId,
      targetKind: mutation.targetKind,
      revision
    }) : Object.freeze({ ...mutation.feature, revision });
    assertHydrologyFeatureDelta(value);
    return cloneHydrologyFeatureDelta(value);
  }
  function featureRegions(descriptor, feature) {
    if (feature.kind === "tombstone") return Object.freeze([]);
    const bounds = hydrologyFeatureBounds(feature);
    const width = feature.kind === "river" ? Math.max(...feature.widthProfile) / 16 : 0;
    const minX = Math.floor((bounds.minX - width) / HYDROLOGY_REGION_SIZE);
    const minY = Math.floor((bounds.minY - width) / HYDROLOGY_REGION_SIZE);
    const maxX = Math.floor((bounds.maxX + width) / HYDROLOGY_REGION_SIZE);
    const maxY = Math.floor((bounds.maxY + width) / HYDROLOGY_REGION_SIZE);
    const result = /* @__PURE__ */ new Set();
    for (let regionX = minX; regionX <= maxX; regionX += 1) {
      for (let regionY = minY; regionY <= maxY; regionY += 1) {
        if (descriptor.topology === "bounded" && (regionX < 0 || regionY < 0 || regionX * HYDROLOGY_REGION_SIZE >= descriptor.width || regionY * HYDROLOGY_REGION_SIZE >= descriptor.height)) continue;
        try {
          const key2 = canonicalizeHydrologyRegionKey(descriptor, { regionX, regionY });
          result.add(`${key2.regionX},${key2.regionY}`);
        } catch (reason) {
          if (descriptor.topology !== "bounded" || !(reason instanceof RangeError)) throw reason;
        }
      }
    }
    return Object.freeze([...result].sort((first, second) => {
      const [ax, ay] = first.split(",").map(Number);
      const [bx, by] = second.split(",").map(Number);
      return ax - bx || ay - by;
    }));
  }
  function validateHydrologyDeltaGraph(features) {
    for (const feature of features.values()) {
      if (feature.kind !== "river") continue;
      for (const connection of [feature.source.kind === "source" ? void 0 : feature.source, feature.outlet]) {
        if (!connection) continue;
        const target = features.get(connection.featureId);
        if (!target) continue;
        if (target.kind === "tombstone") {
          throw new TypeError("hydrology feature connects to a tombstoned edited feature");
        }
        if (connection.kind === "river" && target.kind !== "river" || connection.kind === "body" && target.kind !== "lake") {
          throw new TypeError("hydrology feature connection kind does not match its edited target");
        }
      }
    }
    const complete = /* @__PURE__ */ new Set();
    for (const feature of features.values()) {
      if (feature.kind !== "river" || complete.has(feature.featureId)) continue;
      const path = /* @__PURE__ */ new Set();
      let current = feature;
      while (current?.kind === "river" && current.outlet.kind === "river") {
        if (path.has(current.featureId)) throw new TypeError("edited hydrology river graph contains a cycle");
        path.add(current.featureId);
        const next = features.get(current.outlet.featureId);
        if (!next) break;
        current = next;
      }
      for (const featureId of path) complete.add(featureId);
    }
  }
  function applyHydrologyMutations(descriptor, snapshot, mutations) {
    const features = new Map(snapshot.hydrologyFeatures.map((feature) => [feature.featureId, feature]));
    const regionsByFeature = /* @__PURE__ */ new Map();
    for (const index2 of snapshot.hydrologyRegionFeatures) {
      const serialized = `${index2.key.regionX},${index2.key.regionY}`;
      for (const featureId of index2.featureIds) {
        const list = regionsByFeature.get(featureId) ?? [];
        regionsByFeature.set(featureId, Object.freeze([...list, serialized]));
      }
    }
    const changes = [];
    for (const mutation of mutations) {
      const featureId = mutation.kind === "upsert" ? mutation.feature.featureId : mutation.featureId;
      const previous = features.get(featureId);
      const actualRevision = previous?.revision ?? 0;
      if (mutation.expectedRevision !== actualRevision) {
        throw new WorldDeltaRevisionConflictError(
          "hydrology-feature",
          mutation.expectedRevision,
          actualRevision,
          featureId
        );
      }
      if (mutation.kind === "delete" && (!previous || previous.kind === "tombstone")) {
        throw new TypeError("cannot delete a missing or already tombstoned hydrology feature");
      }
      const next = hydrologyInputWithRevision(mutation, actualRevision + 1);
      features.set(featureId, next);
      if (next.kind !== "tombstone") regionsByFeature.set(featureId, featureRegions(descriptor, next));
      else if (!regionsByFeature.has(featureId)) {
        throw new TypeError("cannot tombstone an unindexed hydrology feature");
      }
      changes.push({
        featureId,
        previous: previous && previous.kind !== "tombstone" ? previous : void 0,
        next: next.kind !== "tombstone" ? next : void 0
      });
    }
    validateHydrologyDeltaGraph(features);
    const idsByRegion = /* @__PURE__ */ new Map();
    for (const [featureId, featureRegionsValue] of regionsByFeature) {
      if (!features.has(featureId)) continue;
      for (const region of featureRegionsValue) {
        const ids = idsByRegion.get(region) ?? [];
        ids.push(featureId);
        idsByRegion.set(region, ids);
      }
    }
    const indices = [...idsByRegion].map(([key2, featureIds]) => {
      const [regionX, regionY] = key2.split(",").map(Number);
      featureIds.sort((first, second) => first.localeCompare(second));
      return Object.freeze({
        key: Object.freeze({ regionX, regionY }),
        featureIds: Object.freeze(featureIds)
      });
    }).sort((first, second) => first.key.regionX - second.key.regionX || first.key.regionY - second.key.regionY);
    return Object.freeze({
      features: Object.freeze([...features.values()].sort((first, second) => first.featureId.localeCompare(second.featureId))),
      indices: Object.freeze(indices),
      changes: Object.freeze(changes)
    });
  }
  function assertHydrologyMutation(value) {
    if (!value || typeof value !== "object" || value.kind !== "upsert" && value.kind !== "delete") {
      throw new TypeError("hydrology authority mutation is invalid");
    }
    assertRevision2("hydrology expected revision", value.expectedRevision);
    if (value.kind === "delete") {
      hydrologyInputWithRevision(value, 1);
      return;
    }
    hydrologyInputWithRevision(value, 1);
  }
  function cloneSnapshot(descriptor, snapshot) {
    return createEffectiveDeltaSnapshot({
      descriptor,
      effectiveRevision: snapshot.effectiveRevision,
      semanticDeltas: snapshot.semanticDeltas,
      hydrologyFeatures: snapshot.hydrologyFeatures,
      hydrologyRegionFeatures: snapshot.hydrologyRegionFeatures
    });
  }
  function createEmptyState(descriptor) {
    const ownedDescriptor = cloneDescriptor(descriptor);
    return {
      descriptor: ownedDescriptor,
      snapshot: createEffectiveDeltaSnapshot({ descriptor: ownedDescriptor, effectiveRevision: 0 }),
      commits: [],
      pendingCommitBytes: 0
    };
  }
  function estimateCommitBytes(semanticMutations, hydrologyMutations) {
    let bytes = 64 + semanticMutations.length * 32;
    for (const mutation of hydrologyMutations) {
      bytes += 64;
      if (mutation.kind === "upsert") {
        const feature = mutation.feature;
        if (feature.kind === "river") {
          bytes += feature.controlPoints.byteLength + feature.widthProfile.byteLength + feature.levelProfile.byteLength;
        } else if (feature.kind === "lake") bytes += feature.boundaryPoints.byteLength;
      }
    }
    return bytes;
  }
  function applyCommit(state, request) {
    assertWorldDescriptorV2(request.descriptor);
    if (serializeWorldDescriptorV2(request.descriptor) !== serializeWorldDescriptorV2(state.descriptor)) {
      throw new TypeError("world delta commit descriptor does not match its store state");
    }
    assertRevision2("expected world revision", request.expectedRevision);
    if (request.expectedRevision !== state.snapshot.effectiveRevision) {
      throw new WorldDeltaRevisionConflictError("world", request.expectedRevision, state.snapshot.effectiveRevision);
    }
    const semanticMutations = request.semanticMutations ?? [];
    const hydrologyMutations = request.hydrologyMutations ?? [];
    if (!Array.isArray(semanticMutations) || !Array.isArray(hydrologyMutations)) {
      throw new TypeError("world delta mutations must be arrays");
    }
    for (const mutation of semanticMutations) assertSemanticMutation(mutation);
    for (const mutation of hydrologyMutations) assertHydrologyMutation(mutation);
    if (semanticMutations.length === 0 && hydrologyMutations.length === 0) {
      return Object.freeze({ changed: false, snapshot: cloneSnapshot(state.descriptor, state.snapshot) });
    }
    const nextRevision = state.snapshot.effectiveRevision + 1;
    const hydrology = applyHydrologyMutations(state.descriptor, state.snapshot, hydrologyMutations);
    const semanticDeltas = applySemanticMutations(
      state.descriptor,
      state.snapshot.semanticDeltas,
      semanticMutations,
      nextRevision
    );
    const snapshot = createEffectiveDeltaSnapshot({
      descriptor: state.descriptor,
      effectiveRevision: nextRevision,
      semanticDeltas,
      hydrologyFeatures: hydrology.features,
      hydrologyRegionFeatures: hydrology.indices
    });
    const transactionId = BigInt(nextRevision);
    const semanticChanges = semanticMutations.map((mutation) => ({
      x: mutation.x,
      y: mutation.y,
      domains: semanticDomain(mutation)
    }));
    const changeSet = createWorldChangeSet({
      descriptor: state.descriptor,
      transactionId,
      revision: nextRevision,
      semanticChanges,
      hydrologyChanges: hydrology.changes
    });
    const commit = Object.freeze({
      formatVersion: WORLD_DELTA_FORMAT_VERSION,
      worldIdentity: snapshot.worldIdentity,
      transactionId,
      revision: nextRevision,
      semanticMutationCount: semanticMutations.length,
      hydrologyMutationCount: hydrologyMutations.length,
      byteLength: estimateCommitBytes(semanticMutations, hydrologyMutations)
    });
    state.snapshot = snapshot;
    state.commits.push(commit);
    state.pendingCommitBytes += commit.byteLength;
    return Object.freeze({ changed: true, snapshot: cloneSnapshot(state.descriptor, snapshot), commit, changeSet });
  }
  function checkpointFor(state) {
    const snapshot = cloneSnapshot(state.descriptor, state.snapshot);
    return Object.freeze({
      formatVersion: WORLD_DELTA_FORMAT_VERSION,
      checkpointVersion: WORLD_DELTA_CHECKPOINT_FORMAT_VERSION,
      worldIdentity: snapshot.worldIdentity,
      revision: snapshot.effectiveRevision,
      semanticDeltas: snapshot.semanticDeltas,
      hydrologyFeatures: snapshot.hydrologyFeatures,
      hydrologyRegionFeatures: snapshot.hydrologyRegionFeatures
    });
  }
  function stateFromCheckpoint(descriptor, checkpoint) {
    const worldIdentity = serializeWorldDescriptorV2(descriptor);
    if (!checkpoint || checkpoint.formatVersion !== WORLD_DELTA_FORMAT_VERSION || checkpoint.checkpointVersion !== WORLD_DELTA_CHECKPOINT_FORMAT_VERSION || checkpoint.worldIdentity !== worldIdentity) {
      throw new TypeError("world delta checkpoint is invalid or belongs to another world");
    }
    assertRevision2("world delta checkpoint revision", checkpoint.revision);
    const ownedDescriptor = cloneDescriptor(descriptor);
    return {
      descriptor: ownedDescriptor,
      snapshot: createEffectiveDeltaSnapshot({
        descriptor: ownedDescriptor,
        effectiveRevision: checkpoint.revision,
        semanticDeltas: checkpoint.semanticDeltas,
        hydrologyFeatures: checkpoint.hydrologyFeatures,
        hydrologyRegionFeatures: checkpoint.hydrologyRegionFeatures
      }),
      commits: [],
      pendingCommitBytes: 0
    };
  }
  function cloneState(state) {
    const descriptor = cloneDescriptor(state.descriptor);
    return {
      descriptor,
      snapshot: cloneSnapshot(descriptor, state.snapshot),
      commits: state.commits.map((commit) => Object.freeze({ ...commit })),
      pendingCommitBytes: state.pendingCommitBytes
    };
  }
  var MemoryWorldDeltaStore = class {
    constructor() {
      this.worlds = /* @__PURE__ */ new Map();
      this.listeners = /* @__PURE__ */ new Map();
      this.disposed = false;
      this.commitCount = 0;
      this.checkpointCount = 0;
      this.conflictCount = 0;
    }
    load(descriptor) {
      try {
        this.assertReady();
        const state = this.state(descriptor);
        return Promise.resolve(cloneSnapshot(state.descriptor, state.snapshot));
      } catch (reason) {
        return Promise.reject(reason);
      }
    }
    commit(request) {
      try {
        this.assertReady();
        const state = this.state(request.descriptor);
        const result = applyCommit(state, request);
        if (result.changed) {
          this.commitCount += 1;
          this.publish(result);
        }
        return Promise.resolve(result);
      } catch (reason) {
        if (reason instanceof WorldDeltaRevisionConflictError) this.conflictCount += 1;
        return Promise.reject(reason);
      }
    }
    saveBarrier(descriptor) {
      try {
        this.assertReady();
        const state = this.state(descriptor);
        const checkpoint = checkpointFor(state);
        state.commits.length = 0;
        state.pendingCommitBytes = 0;
        this.checkpointCount += 1;
        return Promise.resolve(checkpoint);
      } catch (reason) {
        return Promise.reject(reason);
      }
    }
    restoreBarrier(descriptor, checkpoint) {
      try {
        this.assertReady();
        const worldIdentity = serializeWorldDescriptorV2(descriptor);
        this.worlds.set(worldIdentity, stateFromCheckpoint(descriptor, checkpoint));
        return Promise.resolve();
      } catch (reason) {
        return Promise.reject(reason);
      }
    }
    subscribe(worldIdentity, listener) {
      this.assertReady();
      if (typeof worldIdentity !== "string" || worldIdentity.length === 0 || typeof listener !== "function") {
        throw new TypeError("world delta subscription is invalid");
      }
      const listeners = this.listeners.get(worldIdentity) ?? /* @__PURE__ */ new Set();
      listeners.add(listener);
      this.listeners.set(worldIdentity, listeners);
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        listeners.delete(listener);
        if (listeners.size === 0) this.listeners.delete(worldIdentity);
      };
    }
    flush() {
      return Promise.resolve();
    }
    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      this.worlds.clear();
      this.listeners.clear();
    }
    get stats() {
      let pendingCommitBytes = 0;
      for (const state of this.worlds.values()) pendingCommitBytes += state.pendingCommitBytes;
      return Object.freeze({
        state: this.disposed ? "disposed" : "ready",
        worlds: this.worlds.size,
        commits: this.commitCount,
        pendingCommitBytes,
        checkpoints: this.checkpointCount,
        conflicts: this.conflictCount
      });
    }
    state(descriptor) {
      assertWorldDescriptorV2(descriptor);
      const identity = serializeWorldDescriptorV2(descriptor);
      let state = this.worlds.get(identity);
      if (!state) {
        state = createEmptyState(descriptor);
        this.worlds.set(identity, state);
      }
      return state;
    }
    assertReady() {
      if (this.disposed) throw new Error("WorldDeltaStore has been disposed");
    }
    publish(result) {
      for (const listener of this.listeners.get(result.snapshot.worldIdentity) ?? []) {
        try {
          listener(result);
        } catch {
        }
      }
    }
  };
  var DEFAULT_DATABASE_NAME = "three-hex-map-world-deltas-v3";
  var DATABASE_VERSION = 1;
  var WORLD_STORE = "worlds";
  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error ?? new Error("IndexedDB request failed")), { once: true });
    });
  }
  function transactionComplete(transaction) {
    return new Promise((resolve, reject) => {
      transaction.addEventListener("complete", () => resolve(), { once: true });
      transaction.addEventListener("abort", () => reject(transaction.error ?? new Error("IndexedDB transaction aborted")), { once: true });
      transaction.addEventListener("error", () => reject(transaction.error ?? new Error("IndexedDB transaction failed")), { once: true });
    });
  }
  var IndexedDbWorldDeltaStore = class extends MemoryWorldDeltaStore {
    constructor(options = {}) {
      super();
      this.pending = Promise.resolve();
      this.databaseName = options.databaseName ?? DEFAULT_DATABASE_NAME;
      this.openTimeoutMs = options.openTimeoutMs ?? 5e3;
      if (!this.databaseName.trim() || !Number.isSafeInteger(this.openTimeoutMs) || this.openTimeoutMs <= 0) {
        throw new TypeError("IndexedDbWorldDeltaStore options are invalid");
      }
    }
    load(descriptor) {
      this.assertReady();
      return this.enqueue(async () => {
        const identity = serializeWorldDescriptorV2(descriptor);
        const database = await this.open();
        const transaction = database.transaction(WORLD_STORE, "readonly");
        const record = await requestResult(transaction.objectStore(WORLD_STORE).get(identity));
        await transactionComplete(transaction);
        const state = record ? cloneState(record) : createEmptyState(descriptor);
        if (serializeWorldDescriptorV2(state.descriptor) !== identity) {
          throw new TypeError("stored world delta state has a mismatched descriptor identity");
        }
        this.worlds.set(identity, state);
        return cloneSnapshot(state.descriptor, state.snapshot);
      });
    }
    commit(request) {
      this.assertReady();
      return this.enqueue(async () => {
        const identity = serializeWorldDescriptorV2(request.descriptor);
        const database = await this.open();
        const transaction = database.transaction(WORLD_STORE, "readwrite");
        const completion = transactionComplete(transaction);
        try {
          const store = transaction.objectStore(WORLD_STORE);
          const record = await requestResult(store.get(identity));
          const state = record ? cloneState(record) : createEmptyState(request.descriptor);
          const result = applyCommit(state, request);
          if (result.changed) store.put({ key: identity, ...cloneState(state) });
          await completion;
          this.worlds.set(identity, state);
          if (result.changed) {
            this.commitCount += 1;
            this.publish(result);
          }
          return result;
        } catch (reason) {
          try {
            transaction.abort();
          } catch {
          }
          await completion.catch(() => void 0);
          if (reason instanceof WorldDeltaRevisionConflictError) this.conflictCount += 1;
          throw reason;
        }
      });
    }
    saveBarrier(descriptor) {
      this.assertReady();
      return this.enqueue(async () => {
        const identity = serializeWorldDescriptorV2(descriptor);
        const database = await this.open();
        const transaction = database.transaction(WORLD_STORE, "readwrite");
        const store = transaction.objectStore(WORLD_STORE);
        const record = await requestResult(store.get(identity));
        const state = record ? cloneState(record) : createEmptyState(descriptor);
        const checkpoint = checkpointFor(state);
        state.commits.length = 0;
        state.pendingCommitBytes = 0;
        store.put({ key: identity, ...cloneState(state) });
        await transactionComplete(transaction);
        this.worlds.set(identity, state);
        this.checkpointCount += 1;
        return checkpoint;
      });
    }
    restoreBarrier(descriptor, checkpoint) {
      this.assertReady();
      return this.enqueue(async () => {
        const identity = serializeWorldDescriptorV2(descriptor);
        const state = stateFromCheckpoint(descriptor, checkpoint);
        const database = await this.open();
        const transaction = database.transaction(WORLD_STORE, "readwrite");
        transaction.objectStore(WORLD_STORE).put({ key: identity, ...cloneState(state) });
        await transactionComplete(transaction);
        this.worlds.set(identity, state);
      });
    }
    async flush() {
      await this.pending;
      if (this.pendingError !== void 0) {
        const error = this.pendingError;
        this.pendingError = void 0;
        throw error;
      }
    }
    dispose() {
      if (this.disposed) return;
      void this.flush().finally(() => this.databasePromise?.then((database) => database.close(), () => void 0));
      super.dispose();
    }
    enqueue(task) {
      const result = this.pending.then(task, task);
      this.pending = result.then(() => void 0, (error) => {
        this.pendingError ?? (this.pendingError = error);
      });
      return result;
    }
    open() {
      if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB is unavailable"));
      this.databasePromise ?? (this.databasePromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(this.databaseName, DATABASE_VERSION);
        let settled = false;
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          reject(new Error("Opening the v3 world delta database timed out"));
        }, this.openTimeoutMs);
        const finish = (callback, value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          callback(value);
        };
        request.addEventListener("upgradeneeded", () => {
          if (!request.result.objectStoreNames.contains(WORLD_STORE)) {
            request.result.createObjectStore(WORLD_STORE, { keyPath: "key" });
          }
        });
        request.addEventListener("success", () => {
          if (settled) {
            request.result.close();
            return;
          }
          request.result.addEventListener("versionchange", () => request.result.close());
          finish(resolve, request.result);
        }, { once: true });
        request.addEventListener("error", () => finish(reject, request.error ?? new Error("Opening IndexedDB failed")), { once: true });
        request.addEventListener("blocked", () => finish(reject, new Error("Opening IndexedDB was blocked")), { once: true });
      }));
      return this.databasePromise;
    }
  };

  // src/world/semantic/SurfaceWorkerProtocol.ts
  var SurfaceWorkerCompilationError = class extends Error {
    constructor(message, reclaimedWindowBuffers) {
      super(message);
      this.reclaimedWindowBuffers = reclaimedWindowBuffers;
      this.name = "SurfaceWorkerCompilationError";
    }
  };

  // src/world/semantic/SurfaceCompilationService.ts
  function assertNonNegativeSafeInteger(name, value) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError(`${name} must be a non-negative safe integer`);
    }
  }
  function renderKeyString3(key2) {
    return `${key2.chunkX},${key2.chunkY}`;
  }
  function tokensEqual(first, second) {
    return first.sessionEpoch === second.sessionEpoch && first.renderChunkGeneration === second.renderChunkGeneration;
  }
  function abortError() {
    if (typeof DOMException !== "undefined") {
      return new DOMException("Surface compilation request was aborted", "AbortError");
    }
    const error = new Error("Surface compilation request was aborted");
    error.name = "AbortError";
    return error;
  }
  function isAbortSignal(value) {
    if (!value || typeof value !== "object") return false;
    const signal = value;
    return typeof signal.aborted === "boolean" && typeof signal.addEventListener === "function" && typeof signal.removeEventListener === "function";
  }
  var SurfaceWindowBufferPool = class {
    constructor(retainedBudgetBytes) {
      this.retainedBudgetBytes = retainedBudgetBytes;
      this.buffersByByteLength = /* @__PURE__ */ new Map();
      this.retained = /* @__PURE__ */ new Set();
      this.retainedByteCount = 0;
      this.allocationCount = 0;
      this.reuseCount = 0;
      this.discardedBufferCount = 0;
      this.stateValue = "ready";
      assertNonNegativeSafeInteger("surface window retained buffer budget", retainedBudgetBytes);
    }
    acquire(byteLength) {
      if (this.stateValue === "disposed") throw new TypeError("surface window buffer pool is disposed");
      if (!Number.isSafeInteger(byteLength) || byteLength <= 0) {
        throw new RangeError("surface window buffer length must be a positive safe integer");
      }
      const bin = this.buffersByByteLength.get(byteLength);
      const reused = bin?.pop();
      if (reused) {
        this.retained.delete(reused);
        this.retainedByteCount -= byteLength;
        if (bin.length === 0) this.buffersByByteLength.delete(byteLength);
        this.reuseCount += 1;
        return reused;
      }
      this.allocationCount += 1;
      return new ArrayBuffer(byteLength);
    }
    release(buffers) {
      if (!Array.isArray(buffers) || new Set(buffers).size !== buffers.length || buffers.some((buffer) => !(buffer instanceof ArrayBuffer) || buffer.byteLength <= 0 || this.retained.has(buffer))) {
        throw new TypeError("surface window buffer release contains invalid or duplicate buffers");
      }
      for (const buffer of buffers) {
        if (this.stateValue === "disposed" || this.retainedByteCount + buffer.byteLength > this.retainedBudgetBytes) {
          this.discardedBufferCount += 1;
          continue;
        }
        const bin = this.buffersByByteLength.get(buffer.byteLength) ?? [];
        bin.push(buffer);
        this.buffersByByteLength.set(buffer.byteLength, bin);
        this.retained.add(buffer);
        this.retainedByteCount += buffer.byteLength;
      }
    }
    clear() {
      this.buffersByByteLength.clear();
      this.retained.clear();
      this.retainedByteCount = 0;
    }
    dispose() {
      if (this.stateValue === "disposed") return;
      this.clear();
      this.stateValue = "disposed";
    }
    get stats() {
      return Object.freeze({
        state: this.stateValue,
        retainedBuffers: this.retained.size,
        retainedBytes: this.retainedByteCount,
        retainedBudgetBytes: this.retainedBudgetBytes,
        allocations: this.allocationCount,
        reuses: this.reuseCount,
        discardedBuffers: this.discardedBufferCount
      });
    }
  };
  var SurfaceCompilationService = class {
    constructor(options) {
      this.activeByRenderKey = /* @__PURE__ */ new Map();
      this.jobsByDependency = /* @__PURE__ */ new Map();
      this.cacheByDependency = /* @__PURE__ */ new Map();
      this.liveLeaseReleasers = /* @__PURE__ */ new Set();
      this.cacheByteCount = 0;
      this.activeLeaseCount = 0;
      this.cacheHitCount = 0;
      this.cacheMissCount = 0;
      this.cacheEvictionCount = 0;
      this.workerCompilationCount = 0;
      this.coalescedRequestCount = 0;
      this.acceptedResultCount = 0;
      this.staleResultCount = 0;
      this.cancelledRequestCount = 0;
      this.workerFailureCount = 0;
      this.latestEffectiveRevision = -1;
      this.disposed = false;
      if (!options || typeof options !== "object" || Object.getOwnPropertyNames(options).some((name) => ![
        "descriptor",
        "sessionEpoch",
        "worker",
        "cpuCacheBudgetBytes",
        "retainedWindowBufferBudgetBytes"
      ].includes(name)) || !options.worker || typeof options.worker.compileSurfaceChunk !== "function") {
        throw new TypeError("surface compilation service options are invalid");
      }
      assertNonNegativeSafeInteger("surface compiled CPU cache budget", options.cpuCacheBudgetBytes);
      this.worldIdentity = serializeWorldDescriptorV2(options.descriptor);
      this.requestTracker = new SurfaceRequestTracker(options.descriptor, options.sessionEpoch);
      this.worker = options.worker;
      this.cpuCacheBudgetBytes = options.cpuCacheBudgetBytes;
      this.windowBufferPool = new SurfaceWindowBufferPool(options.retainedWindowBufferBudgetBytes);
    }
    request(snapshot, renderKey, options = {}) {
      this.assertReady();
      this.assertRequestOptions(options);
      if (snapshot.worldIdentity !== this.worldIdentity) {
        throw new TypeError("surface compilation request belongs to another world identity");
      }
      if (snapshot.effectiveRevision < this.latestEffectiveRevision) {
        throw new RangeError("surface compilation request cannot move effective revision backwards");
      }
      if (options.signal?.aborted) throw abortError();
      const effectiveWindow = createTransferableEffectiveWindow(snapshot, renderKey, {
        bufferAllocator: this.windowBufferPool
      });
      this.latestEffectiveRevision = snapshot.effectiveRevision;
      const key2 = effectiveWindow.key;
      const keyString7 = renderKeyString3(key2);
      const serializedKey = serializeSurfaceDependencyKey(effectiveWindow.dependencyKey);
      const binding = Object.freeze({
        effectiveRevision: effectiveWindow.effectiveRevision,
        dependencyKey: effectiveWindow.dependencyKey
      });
      const requestToken = this.requestTracker.issue(key2);
      const cached = this.findCacheEntry(serializedKey, effectiveWindow.dependencyKey);
      let job;
      let entryPromise;
      if (cached) {
        this.cacheHitCount += 1;
        this.windowBufferPool.release(effectiveSurfaceWindowTransferables(effectiveWindow));
        entryPromise = Promise.resolve(cached);
      } else {
        this.cacheMissCount += 1;
        job = this.jobsByDependency.get(serializedKey);
        if (job) {
          if (!surfaceDependencyKeysEqual(job.dependencyKey, effectiveWindow.dependencyKey)) {
            this.windowBufferPool.release(effectiveSurfaceWindowTransferables(effectiveWindow));
            throw new TypeError("serialized surface dependency key collision");
          }
          this.coalescedRequestCount += 1;
          this.windowBufferPool.release(effectiveSurfaceWindowTransferables(effectiveWindow));
        } else {
          job = this.createCompilationJob(effectiveWindow, serializedKey, options);
        }
        job.subscribers.add(requestToken.renderChunkGeneration);
        entryPromise = job.promise;
      }
      const previous = this.activeByRenderKey.get(keyString7);
      if (previous?.job) this.removeJobSubscriber(previous.job, previous.requestToken);
      const active = { key: key2, requestToken, binding, job };
      this.activeByRenderKey.set(keyString7, active);
      let leaseValue;
      const result = entryPromise.then((entry) => {
        job?.subscribers.delete(requestToken.renderChunkGeneration);
        active.job = void 0;
        if (!this.isCurrentActive(keyString7, requestToken, binding, entry.chunk)) {
          this.staleResultCount += 1;
          return Object.freeze({ status: "stale", requestToken });
        }
        leaseValue = this.createLease(entry, active);
        this.acceptedResultCount += 1;
        return Object.freeze({ status: "ready", requestToken, lease: leaseValue });
      }).catch((reason) => {
        job?.subscribers.delete(requestToken.renderChunkGeneration);
        active.job = void 0;
        if (this.disposed) throw new Error("surface compilation service is disposed");
        const current = this.activeByRenderKey.get(keyString7);
        if (!current || !tokensEqual(current.requestToken, requestToken)) {
          this.staleResultCount += 1;
          return Object.freeze({ status: "stale", requestToken });
        }
        this.activeByRenderKey.delete(keyString7);
        this.requestTracker.release(key2, requestToken);
        throw reason;
      });
      const abort = options.signal ? () => {
        if (!leaseValue && this.cancelPending(keyString7, active)) {
          this.cancelledRequestCount += 1;
        } else if (leaseValue?.release()) {
          this.cancelledRequestCount += 1;
        }
      } : void 0;
      options.signal?.addEventListener("abort", abort, { once: true });
      const removeAbortListener = () => {
        if (abort) options.signal?.removeEventListener("abort", abort);
      };
      void result.then(removeAbortListener, removeAbortListener);
      return Object.freeze({
        key: key2,
        requestToken,
        result,
        cancel: () => {
          if (leaseValue) return leaseValue.release();
          const cancelled = this.cancelPending(keyString7, active);
          if (cancelled) this.cancelledRequestCount += 1;
          return cancelled;
        }
      });
    }
    requestBatch(snapshot, renderKeys, options = {}) {
      this.assertReady();
      this.assertRequestOptions(options);
      if (!Array.isArray(renderKeys) || renderKeys.length === 0) {
        throw new TypeError("surface compilation batch requires render chunk keys");
      }
      const canonicalKeys = renderKeys.map((key2) => canonicalizeRenderChunkKey(snapshot.descriptor, key2));
      const serializedRenderKeys = canonicalKeys.map(renderKeyString3);
      if (new Set(serializedRenderKeys).size !== serializedRenderKeys.length) {
        throw new TypeError("surface compilation batch contains duplicate render chunk keys");
      }
      const exactSnapshots = canonicalKeys.map((key2) => new EffectiveWorldSnapshot(
        snapshot.descriptor,
        snapshot.worldIdentity,
        snapshot.effectiveRevision,
        Object.freeze(surfaceSemanticChunkRequirements(snapshot.descriptor, key2).map((required) => snapshot.getSemanticChunk(required))),
        Object.freeze(surfaceHydrologyRegionRequirements(snapshot.descriptor, key2).map((required) => snapshot.getHydrologyRegion(required)))
      ));
      const requests = [];
      try {
        for (let index2 = 0; index2 < canonicalKeys.length; index2 += 1) {
          requests.push(this.request(exactSnapshots[index2], canonicalKeys[index2], options));
        }
        return Object.freeze(requests);
      } catch (reason) {
        for (const request of requests) request.cancel();
        throw reason;
      }
    }
    invalidate(renderKeys) {
      this.assertReady();
      if (!Array.isArray(renderKeys)) throw new TypeError("surface invalidation keys must be an array");
      let invalidated = 0;
      for (const renderKey of renderKeys) {
        const canonical = canonicalizeRenderChunkKey(this.requestTracker.descriptor, renderKey);
        const serialized = renderKeyString3(canonical);
        const active = this.activeByRenderKey.get(serialized);
        if (!active) continue;
        this.activeByRenderKey.delete(serialized);
        this.requestTracker.release(active.key, active.requestToken);
        if (active.job) this.removeJobSubscriber(active.job, active.requestToken);
        invalidated += 1;
      }
      return invalidated;
    }
    clearUnusedCache() {
      this.assertReady();
      let removed = 0;
      for (const entry of [...this.cacheByDependency.values()]) {
        if (entry.leases !== 0) continue;
        this.deleteCacheEntry(entry);
        removed += 1;
      }
      return removed;
    }
    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      for (const job of this.jobsByDependency.values()) job.controller.abort();
      this.jobsByDependency.clear();
      this.activeByRenderKey.clear();
      this.requestTracker.dispose();
      for (const release of [...this.liveLeaseReleasers]) release();
      this.liveLeaseReleasers.clear();
      this.cacheByDependency.clear();
      this.cacheByteCount = 0;
      this.windowBufferPool.dispose();
    }
    get stats() {
      let inFlightWindowBytes = 0;
      for (const job of this.jobsByDependency.values()) inFlightWindowBytes += job.windowBytes;
      return Object.freeze({
        state: this.disposed ? "disposed" : "ready",
        activeRequests: this.activeByRenderKey.size,
        activeLeases: this.activeLeaseCount,
        inFlightCompilations: this.jobsByDependency.size,
        inFlightWindowBytes,
        cacheEntries: this.cacheByDependency.size,
        cacheBytes: this.cacheByteCount,
        cacheBudgetBytes: this.cpuCacheBudgetBytes,
        cacheHits: this.cacheHitCount,
        cacheMisses: this.cacheMissCount,
        cacheEvictions: this.cacheEvictionCount,
        workerCompilations: this.workerCompilationCount,
        coalescedRequests: this.coalescedRequestCount,
        acceptedResults: this.acceptedResultCount,
        staleResults: this.staleResultCount,
        cancelledRequests: this.cancelledRequestCount,
        workerFailures: this.workerFailureCount,
        windowBuffers: this.windowBufferPool.stats
      });
    }
    createCompilationJob(effectiveWindow, serializedKey, options) {
      const sourceBuffers = effectiveSurfaceWindowTransferables(effectiveWindow);
      const windowBytes = sourceBuffers.reduce((total, buffer) => total + buffer.byteLength, 0);
      const controller = new AbortController();
      const subscribers = /* @__PURE__ */ new Set();
      const job = {};
      let buffersReclaimed = false;
      const promise = Promise.resolve().then(() => this.worker.compileSurfaceChunk(effectiveWindow, {
        priority: options.priority,
        lane: options.lane,
        weight: options.weight,
        signal: controller.signal
      })).then((result) => {
        this.windowBufferPool.release(result.reclaimedWindowBuffers);
        buffersReclaimed = true;
        assertCompiledSurfaceChunk(result.chunk);
        if (!surfaceDependencyKeysEqual(result.chunk.dependencyKey, effectiveWindow.dependencyKey)) {
          throw new TypeError("surface compilation worker returned a mismatched dependency key");
        }
        return this.storeCacheEntry(result.chunk);
      }).catch((reason) => {
        if (!buffersReclaimed && reason instanceof SurfaceWorkerCompilationError) {
          this.windowBufferPool.release(reason.reclaimedWindowBuffers);
          buffersReclaimed = true;
        } else if (!buffersReclaimed) {
          const attached = sourceBuffers.filter((buffer) => buffer.byteLength > 0);
          if (attached.length > 0) {
            this.windowBufferPool.release(attached);
            buffersReclaimed = true;
          }
        }
        if (!(reason instanceof Error && reason.name === "AbortError")) {
          this.workerFailureCount += 1;
        }
        throw reason;
      }).finally(() => {
        if (this.jobsByDependency.get(serializedKey) === job) {
          this.jobsByDependency.delete(serializedKey);
        }
      });
      Object.assign(job, {
        dependencyKey: effectiveWindow.dependencyKey,
        controller,
        subscribers,
        windowBytes,
        promise
      });
      this.jobsByDependency.set(serializedKey, job);
      this.workerCompilationCount += 1;
      return job;
    }
    findCacheEntry(serializedKey, dependencyKey2) {
      const entry = this.cacheByDependency.get(serializedKey);
      if (!entry) return void 0;
      if (!surfaceDependencyKeysEqual(entry.dependencyKey, dependencyKey2)) {
        throw new TypeError("serialized surface dependency key collision");
      }
      this.cacheByDependency.delete(serializedKey);
      this.cacheByDependency.set(serializedKey, entry);
      return entry;
    }
    storeCacheEntry(chunk) {
      if (this.disposed) throw new Error("surface compilation service is disposed");
      const serializedKey = serializeSurfaceDependencyKey(chunk.dependencyKey);
      const existing = this.findCacheEntry(serializedKey, chunk.dependencyKey);
      if (existing) return existing;
      if (chunk.byteLength > this.cpuCacheBudgetBytes) {
        throw new RangeError("compiled surface chunk exceeds the CPU cache byte budget");
      }
      while (this.cacheByteCount + chunk.byteLength > this.cpuCacheBudgetBytes) {
        const candidate = [...this.cacheByDependency.values()].find((entry2) => entry2.leases === 0);
        if (!candidate) {
          throw new RangeError("compiled surface CPU cache budget is exhausted by active leases");
        }
        this.deleteCacheEntry(candidate);
        this.cacheEvictionCount += 1;
      }
      const entry = {
        serializedKey,
        dependencyKey: chunk.dependencyKey,
        chunk,
        byteLength: chunk.byteLength,
        leases: 0
      };
      this.cacheByDependency.set(serializedKey, entry);
      this.cacheByteCount += entry.byteLength;
      return entry;
    }
    deleteCacheEntry(entry) {
      if (this.cacheByDependency.get(entry.serializedKey) !== entry) return;
      this.cacheByDependency.delete(entry.serializedKey);
      this.cacheByteCount -= entry.byteLength;
    }
    createLease(entry, active) {
      entry.leases += 1;
      this.activeLeaseCount += 1;
      let released = false;
      let lease;
      const releaseInternal = () => {
        if (released) return;
        released = true;
        entry.leases -= 1;
        this.activeLeaseCount -= 1;
        this.liveLeaseReleasers.delete(releaseInternal);
        const keyString7 = renderKeyString3(active.key);
        const current = this.activeByRenderKey.get(keyString7);
        if (current && tokensEqual(current.requestToken, active.requestToken)) {
          this.activeByRenderKey.delete(keyString7);
          this.requestTracker.release(active.key, active.requestToken);
        }
      };
      lease = Object.freeze({
        requestToken: active.requestToken,
        effectiveRevision: active.binding.effectiveRevision,
        dependencyKey: entry.dependencyKey,
        chunk: entry.chunk,
        get released() {
          return released;
        },
        isCurrent: () => !released && this.requestTracker.isCurrent(active.key, active.requestToken),
        release: () => {
          if (released) return false;
          releaseInternal();
          return true;
        }
      });
      this.liveLeaseReleasers.add(releaseInternal);
      return lease;
    }
    isCurrentActive(keyString7, requestToken, binding, chunk) {
      const current = this.activeByRenderKey.get(keyString7);
      if (!current || !tokensEqual(current.requestToken, requestToken)) return false;
      return this.requestTracker.canAccept(current.key, {
        requestToken,
        effectiveRevision: chunk.effectiveRevision,
        dependencyKey: chunk.dependencyKey
      }, binding);
    }
    cancelPending(keyString7, active) {
      const current = this.activeByRenderKey.get(keyString7);
      if (!current || !tokensEqual(current.requestToken, active.requestToken)) return false;
      this.activeByRenderKey.delete(keyString7);
      this.requestTracker.release(active.key, active.requestToken);
      if (active.job) this.removeJobSubscriber(active.job, active.requestToken);
      return true;
    }
    removeJobSubscriber(job, token) {
      job.subscribers.delete(token.renderChunkGeneration);
      if (job.subscribers.size === 0) job.controller.abort();
    }
    assertRequestOptions(options) {
      if (!options || typeof options !== "object" || Object.getOwnPropertyNames(options).some((name) => ![
        "priority",
        "lane",
        "weight",
        "signal"
      ].includes(name)) || options.priority !== void 0 && !Number.isFinite(options.priority) || options.lane !== void 0 && ![
        "critical",
        "interactive",
        "visible",
        "prefetch",
        "background"
      ].includes(options.lane) || options.weight !== void 0 && (!Number.isSafeInteger(options.weight) || options.weight <= 0) || options.signal !== void 0 && !isAbortSignal(options.signal)) {
        throw new TypeError("surface compilation request options are invalid");
      }
    }
    assertReady() {
      if (this.disposed) throw new TypeError("surface compilation service is disposed");
    }
  };

  // src/world/semantic/SurfaceQueryService.ts
  function renderKeyString4(key2) {
    return `${key2.chunkX},${key2.chunkY}`;
  }
  function queryRenderKey(tileX, tileY) {
    if (!Number.isFinite(tileX) || !Number.isFinite(tileY) || tileX < Number.MIN_SAFE_INTEGER || tileX > Number.MAX_SAFE_INTEGER || tileY < Number.MIN_SAFE_INTEGER || tileY > Number.MAX_SAFE_INTEGER) {
      throw new RangeError("surface query coordinates must be finite values in the safe integer tile domain");
    }
    return {
      chunkX: Math.floor((tileX + 0.5) / SURFACE_RENDER_CHUNK_SIZE),
      chunkY: Math.floor((tileY + 0.5) / SURFACE_RENDER_CHUNK_SIZE)
    };
  }
  var SurfaceQueryService = class {
    constructor(options) {
      this.leases = /* @__PURE__ */ new Map();
      this.residentHitCount = 0;
      this.synchronousCompilationCount = 0;
      this.staleResidentRejectCount = 0;
      this.disposed = false;
      if (!options || typeof options !== "object" || !options.snapshots || typeof options.snapshots.capture !== "function") {
        throw new TypeError("SurfaceQueryService options are invalid");
      }
      this.descriptor = options.descriptor;
      this.snapshots = options.snapshots;
    }
    bindLease(lease) {
      this.assertReady();
      if (!lease || lease.released) throw new TypeError("surface query lease must be active");
      const key2 = canonicalizeRenderChunkKey(this.descriptor, lease.chunk.key);
      this.leases.set(renderKeyString4(key2), lease);
    }
    unbindLease(key2, lease) {
      this.assertReady();
      const canonical = canonicalizeRenderChunkKey(this.descriptor, key2);
      const serialized = renderKeyString4(canonical);
      const current = this.leases.get(serialized);
      if (!current || lease && current !== lease) return false;
      return this.leases.delete(serialized);
    }
    invalidate(keys) {
      this.assertReady();
      let invalidated = 0;
      for (const key2 of keys) if (this.unbindLease(key2)) invalidated += 1;
      return invalidated;
    }
    async sample(tileX, tileY) {
      this.assertReady();
      const key2 = canonicalizeRenderChunkKey(this.descriptor, queryRenderKey(tileX, tileY));
      const snapshot = await this.snapshots.capture(key2);
      const window2 = createTransferableEffectiveWindow(snapshot, key2);
      const resident = this.leases.get(renderKeyString4(key2));
      let compiled;
      if (resident && !resident.released && resident.isCurrent() && resident.effectiveRevision <= snapshot.effectiveRevision && surfaceDependencyKeysEqual(resident.dependencyKey, window2.dependencyKey)) {
        compiled = resident.chunk;
        this.residentHitCount += 1;
      } else {
        if (resident) {
          this.leases.delete(renderKeyString4(key2));
          this.staleResidentRejectCount += 1;
        }
        compiled = compileSurfaceChunk(window2);
        this.synchronousCompilationCount += 1;
      }
      const originX = key2.chunkX * SURFACE_RENDER_CHUNK_SIZE;
      const originY = key2.chunkY * SURFACE_RENDER_CHUNK_SIZE;
      return sampleCompiledSurfaceChunk(compiled, tileX - originX, tileY - originY);
    }
    async groundHeight(tileX, tileY) {
      return (await this.sample(tileX, tileY)).groundHeight;
    }
    async placementHeight(tileX, tileY, onWater = false) {
      const sample = await this.sample(tileX, tileY);
      return onWater && sample.waterCoverage > 0 ? sample.waterLevel : sample.groundHeight;
    }
    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      this.leases.clear();
    }
    get stats() {
      return Object.freeze({
        residentHits: this.residentHitCount,
        synchronousCompilations: this.synchronousCompilationCount,
        staleResidentRejects: this.staleResidentRejectCount,
        mountedLeases: this.leases.size
      });
    }
    assertReady() {
      if (this.disposed) throw new Error("SurfaceQueryService has been disposed");
    }
  };
  function positiveModulo2(value, size) {
    return (value % size + size) % size;
  }
  var SurfacePickingService = class {
    constructor(options) {
      this.raycaster = new three.Raycaster();
      this.ndc = new three.Vector2();
      this.worldPoint = new three.Vector3();
      this.floatingOriginX = 0;
      this.floatingOriginZ = 0;
      this.disposed = false;
      const hexSize = options?.hexSize ?? 1;
      if (!options || !options.descriptor || !options.queries || !(options.root instanceof three.Object3D) || !Number.isFinite(hexSize) || hexSize <= 0) {
        throw new TypeError("SurfacePickingService options are invalid");
      }
      this.descriptor = options.descriptor;
      this.queries = options.queries;
      this.root = options.root;
      this.hexSize = hexSize;
    }
    setFloatingOrigin(worldX, worldZ) {
      this.assertReady();
      if (!Number.isFinite(worldX) || !Number.isFinite(worldZ)) {
        throw new RangeError("surface picking floating origin must be finite");
      }
      this.floatingOriginX = worldX;
      this.floatingOriginZ = worldZ;
    }
    async pickScreen(clientX, clientY, canvas, camera) {
      this.assertReady();
      if (!Number.isFinite(clientX) || !Number.isFinite(clientY) || !canvas || !camera) {
        throw new TypeError("surface screen pick arguments are invalid");
      }
      const rect = canvas.getBoundingClientRect();
      if (!(rect.width > 0) || !(rect.height > 0)) return void 0;
      this.ndc.set(
        (clientX - rect.left) / rect.width * 2 - 1,
        -((clientY - rect.top) / rect.height * 2 - 1)
      );
      this.raycaster.setFromCamera(this.ndc, camera);
      const intersection = this.raycaster.intersectObject(this.root, true).find((candidate) => candidate.object.name.startsWith("surface-ground-") || candidate.object.name.startsWith("surface-water-"));
      if (!intersection) return void 0;
      this.worldPoint.copy(intersection.point);
      this.worldPoint.x += this.floatingOriginX;
      this.worldPoint.z += this.floatingOriginZ;
      return this.pickWorldPoint(
        this.worldPoint.x,
        this.worldPoint.z,
        intersection.object.name.startsWith("surface-water-")
      );
    }
    async pickWorldPoint(worldX, worldZ, onWater = false) {
      this.assertReady();
      const coordinate = worldToSurface(worldX, worldZ, this.hexSize);
      const baseX = Math.floor(coordinate.u);
      const baseY = Math.floor(coordinate.v);
      let bestX = baseX;
      let bestY = baseY;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
          const x2 = baseX + offsetX;
          const y2 = baseY + offsetY;
          const center = surfaceToWorld(x2, y2, this.hexSize);
          const distance = (center.x - worldX) ** 2 + (center.z - worldZ) ** 2;
          if (distance < bestDistance) {
            bestDistance = distance;
            bestX = x2;
            bestY = y2;
          }
        }
      }
      if (this.descriptor.topology === "bounded" && (bestX < 0 || bestY < 0 || bestX >= this.descriptor.width || bestY >= this.descriptor.height)) {
        return void 0;
      }
      const x = this.descriptor.topology === "toroidal" ? positiveModulo2(bestX, this.descriptor.width) : bestX;
      const y = this.descriptor.topology === "toroidal" ? positiveModulo2(bestY, this.descriptor.height) : bestY;
      const sample = await this.queries.sample(x, y);
      const water = onWater && sample.waterCoverage > 0;
      return Object.freeze({
        x,
        y,
        worldX,
        worldZ,
        height: water ? sample.waterLevel : sample.groundHeight,
        surface: water ? "water" : "ground"
      });
    }
    dispose() {
      this.disposed = true;
    }
    assertReady() {
      if (this.disposed) throw new Error("SurfacePickingService has been disposed");
    }
  };

  // src/world/semantic/WorldAuthorityRepository.ts
  var ProceduralWorldAuthoritySource = class {
    constructor(options) {
      this.disposed = false;
      if (!options || !options.pool || typeof options.pool.generateSemanticChunk !== "function" || typeof options.pool.generateHydrologyRegion !== "function") {
        throw new TypeError("ProceduralWorldAuthoritySource options are invalid");
      }
      this.descriptor = options.descriptor;
      this.pool = options.pool;
      this.ownsPool = options.ownsPool ?? false;
    }
    loadSemanticChunk(key2, options = {}) {
      this.assertReady();
      return this.pool.generateSemanticChunk({ descriptor: this.descriptor, key: key2 }, options);
    }
    loadHydrologyRegion(key2, options = {}) {
      this.assertReady();
      return this.pool.generateHydrologyRegion({ descriptor: this.descriptor, key: key2 }, options);
    }
    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      if (this.ownsPool) this.pool.dispose();
    }
    assertReady() {
      if (this.disposed) throw new Error("ProceduralWorldAuthoritySource has been disposed");
    }
  };
  var StaticWorldAuthoritySource = class {
    constructor(options) {
      this.semantic = /* @__PURE__ */ new Map();
      this.hydrology = /* @__PURE__ */ new Map();
      this.disposed = false;
      if (!options || options.descriptor.sourceKind !== "static" || !Array.isArray(options.semanticChunks) || !Array.isArray(options.hydrologyRegions)) {
        throw new TypeError("StaticWorldAuthoritySource options are invalid");
      }
      this.descriptor = options.descriptor;
      for (const chunk of options.semanticChunks) {
        const key2 = `${chunk.key.chunkX},${chunk.key.chunkY}`;
        if (this.semantic.has(key2)) throw new TypeError("static authority source contains duplicate semantic chunks");
        this.semantic.set(key2, chunk);
      }
      for (const region of options.hydrologyRegions) {
        const key2 = `${region.key.regionX},${region.key.regionY}`;
        if (this.hydrology.has(key2)) throw new TypeError("static authority source contains duplicate hydrology regions");
        this.hydrology.set(key2, region);
      }
    }
    loadSemanticChunk(key2) {
      this.assertReady();
      const chunk = this.semantic.get(`${key2.chunkX},${key2.chunkY}`);
      return chunk ? Promise.resolve(chunk) : Promise.reject(new RangeError("static semantic chunk is missing"));
    }
    loadHydrologyRegion(key2) {
      this.assertReady();
      const region = this.hydrology.get(`${key2.regionX},${key2.regionY}`);
      return region ? Promise.resolve(region) : Promise.reject(new RangeError("static hydrology region is missing"));
    }
    dispose() {
      this.disposed = true;
      this.semantic.clear();
      this.hydrology.clear();
    }
    assertReady() {
      if (this.disposed) throw new Error("StaticWorldAuthoritySource has been disposed");
    }
  };
  function assertBudget(name, value) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(`${name} must be a positive safe integer`);
  }
  function semanticKey4(key2) {
    return `${key2.chunkX},${key2.chunkY}`;
  }
  function hydrologyKey3(key2) {
    return `${key2.regionX},${key2.regionY}`;
  }
  var WorldAuthorityRepository = class {
    constructor(options) {
      this.semantic = /* @__PURE__ */ new Map();
      this.hydrology = /* @__PURE__ */ new Map();
      this.semanticInFlight = /* @__PURE__ */ new Map();
      this.hydrologyInFlight = /* @__PURE__ */ new Map();
      this.semanticPendingPins = /* @__PURE__ */ new Map();
      this.hydrologyPendingPins = /* @__PURE__ */ new Map();
      this.semanticBytes = 0;
      this.hydrologyBytes = 0;
      this.cacheHits = 0;
      this.cacheMisses = 0;
      this.evictionCount = 0;
      this.disposed = false;
      if (!options || !options.source || !options.view || serializeWorldDescriptorV2(options.source.descriptor) !== options.view.worldIdentity) {
        throw new TypeError("WorldAuthorityRepository options are invalid or cross-world");
      }
      assertBudget("semantic authority cache budget", options.semanticBudgetBytes);
      assertBudget("hydrology authority cache budget", options.hydrologyBudgetBytes);
      this.source = options.source;
      this.view = options.view;
      this.descriptor = options.source.descriptor;
      this.worldIdentity = options.view.worldIdentity;
      this.semanticBudgetBytes = options.semanticBudgetBytes;
      this.hydrologyBudgetBytes = options.hydrologyBudgetBytes;
    }
    async capture(renderKey, options = {}) {
      this.assertReady();
      const semanticKeys = surfaceSemanticChunkRequirements(this.descriptor, renderKey);
      const hydrologyKeys = surfaceHydrologyRegionRequirements(this.descriptor, renderKey);
      const [semanticChunks, hydrologyRegions] = await Promise.all([
        Promise.all(semanticKeys.map((key2) => this.loadSemantic(key2, options))),
        Promise.all(hydrologyKeys.map((key2) => this.loadHydrology(key2, options)))
      ]);
      return this.view.capture({ semanticChunks, hydrologyRegions });
    }
    async retain(renderKey, options = {}) {
      this.assertReady();
      const semanticKeys = surfaceSemanticChunkRequirements(this.descriptor, renderKey);
      const hydrologyKeys = surfaceHydrologyRegionRequirements(this.descriptor, renderKey);
      const semanticEntries = [];
      const hydrologyEntries = [];
      try {
        const [semanticChunks, hydrologyRegions] = await Promise.all([
          Promise.all(semanticKeys.map((key2) => this.acquireSemantic(key2, options).then((entry) => {
            semanticEntries.push(entry);
            return entry.value;
          }))),
          Promise.all(hydrologyKeys.map((key2) => this.acquireHydrology(key2, options).then((entry) => {
            hydrologyEntries.push(entry);
            return entry.value;
          })))
        ]);
        const snapshot = this.view.capture({ semanticChunks, hydrologyRegions });
        let released = false;
        return Object.freeze({
          key: Object.freeze({ ...renderKey }),
          snapshot,
          get released() {
            return released;
          },
          release: () => {
            if (released) return false;
            released = true;
            for (const entry of semanticEntries) entry.pins -= 1;
            for (const entry of hydrologyEntries) entry.pins -= 1;
            this.evictSemantic();
            this.evictHydrology();
            return true;
          }
        });
      } catch (reason) {
        for (const entry of semanticEntries) entry.pins -= 1;
        for (const entry of hydrologyEntries) entry.pins -= 1;
        throw reason;
      }
    }
    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      this.semantic.clear();
      this.hydrology.clear();
      this.semanticInFlight.clear();
      this.hydrologyInFlight.clear();
      this.semanticPendingPins.clear();
      this.hydrologyPendingPins.clear();
      this.semanticBytes = 0;
      this.hydrologyBytes = 0;
      this.source.dispose();
    }
    get stats() {
      let pinnedSemanticEntries = 0;
      let pinnedHydrologyEntries = 0;
      for (const entry of this.semantic.values()) if (entry.pins > 0) pinnedSemanticEntries += 1;
      for (const entry of this.hydrology.values()) if (entry.pins > 0) pinnedHydrologyEntries += 1;
      return Object.freeze({
        state: this.disposed ? "disposed" : "ready",
        semanticEntries: this.semantic.size,
        semanticBytes: this.semanticBytes,
        semanticBudgetBytes: this.semanticBudgetBytes,
        hydrologyEntries: this.hydrology.size,
        hydrologyBytes: this.hydrologyBytes,
        hydrologyBudgetBytes: this.hydrologyBudgetBytes,
        pinnedSemanticEntries,
        pinnedHydrologyEntries,
        cacheHits: this.cacheHits,
        cacheMisses: this.cacheMisses,
        evictions: this.evictionCount
      });
    }
    loadSemantic(key2, options) {
      const serialized = semanticKey4(key2);
      const cached = this.semantic.get(serialized);
      if (cached) {
        this.cacheHits += 1;
        this.semantic.delete(serialized);
        this.semantic.set(serialized, cached);
        return Promise.resolve(cached.value);
      }
      const active = this.semanticInFlight.get(serialized);
      if (active) {
        this.cacheHits += 1;
        return active.promise;
      }
      this.cacheMisses += 1;
      const promise = this.source.loadSemanticChunk(key2, options).then((value) => {
        if (this.disposed) throw new Error("WorldAuthorityRepository was disposed during a semantic load");
        if (value.key.chunkX !== key2.chunkX || value.key.chunkY !== key2.chunkY) {
          throw new TypeError("authority source returned a mismatched semantic chunk");
        }
        const entry = {
          key: serialized,
          value,
          bytes: BASE_SEMANTIC_CHUNK_PAYLOAD_BYTES,
          pins: this.semanticPendingPins.get(serialized) ?? 0
        };
        this.semanticPendingPins.delete(serialized);
        this.semantic.set(serialized, entry);
        this.semanticBytes += entry.bytes;
        try {
          this.evictSemantic();
        } catch (reason) {
          if (this.semantic.get(serialized) === entry) {
            this.semantic.delete(serialized);
            this.semanticBytes -= entry.bytes;
          }
          throw reason;
        }
        if (!this.semantic.has(serialized)) throw new RangeError("semantic authority cache cannot admit its minimum working item");
        return value;
      }).finally(() => this.semanticInFlight.delete(serialized));
      this.semanticInFlight.set(serialized, { promise });
      return promise;
    }
    loadHydrology(key2, options) {
      const serialized = hydrologyKey3(key2);
      const cached = this.hydrology.get(serialized);
      if (cached) {
        this.cacheHits += 1;
        this.hydrology.delete(serialized);
        this.hydrology.set(serialized, cached);
        return Promise.resolve(cached.value);
      }
      const active = this.hydrologyInFlight.get(serialized);
      if (active) {
        this.cacheHits += 1;
        return active.promise;
      }
      this.cacheMisses += 1;
      const promise = this.source.loadHydrologyRegion(key2, options).then((value) => {
        if (this.disposed) throw new Error("WorldAuthorityRepository was disposed during a hydrology load");
        if (value.key.regionX !== key2.regionX || value.key.regionY !== key2.regionY) {
          throw new TypeError("authority source returned a mismatched hydrology region");
        }
        const entry = {
          key: serialized,
          value,
          bytes: hydrologyRegionVectorBytes(value),
          pins: this.hydrologyPendingPins.get(serialized) ?? 0
        };
        this.hydrologyPendingPins.delete(serialized);
        this.hydrology.set(serialized, entry);
        this.hydrologyBytes += entry.bytes;
        try {
          this.evictHydrology();
        } catch (reason) {
          if (this.hydrology.get(serialized) === entry) {
            this.hydrology.delete(serialized);
            this.hydrologyBytes -= entry.bytes;
          }
          throw reason;
        }
        if (!this.hydrology.has(serialized)) throw new RangeError("hydrology authority cache cannot admit its minimum working item");
        return value;
      }).finally(() => this.hydrologyInFlight.delete(serialized));
      this.hydrologyInFlight.set(serialized, { promise });
      return promise;
    }
    async acquireSemantic(key2, options) {
      const serialized = semanticKey4(key2);
      const cached = this.semantic.get(serialized);
      if (cached) {
        cached.pins += 1;
        this.cacheHits += 1;
        this.semantic.delete(serialized);
        this.semantic.set(serialized, cached);
        return cached;
      }
      this.semanticPendingPins.set(serialized, (this.semanticPendingPins.get(serialized) ?? 0) + 1);
      try {
        await this.loadSemantic(key2, options);
        const entry = this.semantic.get(serialized);
        if (!entry) throw new RangeError("semantic authority lease was evicted before admission");
        return entry;
      } catch (reason) {
        const pending = this.semanticPendingPins.get(serialized);
        if (pending !== void 0) {
          if (pending <= 1) this.semanticPendingPins.delete(serialized);
          else this.semanticPendingPins.set(serialized, pending - 1);
        }
        throw reason;
      }
    }
    async acquireHydrology(key2, options) {
      const serialized = hydrologyKey3(key2);
      const cached = this.hydrology.get(serialized);
      if (cached) {
        cached.pins += 1;
        this.cacheHits += 1;
        this.hydrology.delete(serialized);
        this.hydrology.set(serialized, cached);
        return cached;
      }
      this.hydrologyPendingPins.set(serialized, (this.hydrologyPendingPins.get(serialized) ?? 0) + 1);
      try {
        await this.loadHydrology(key2, options);
        const entry = this.hydrology.get(serialized);
        if (!entry) throw new RangeError("hydrology authority lease was evicted before admission");
        return entry;
      } catch (reason) {
        const pending = this.hydrologyPendingPins.get(serialized);
        if (pending !== void 0) {
          if (pending <= 1) this.hydrologyPendingPins.delete(serialized);
          else this.hydrologyPendingPins.set(serialized, pending - 1);
        }
        throw reason;
      }
    }
    evictSemantic() {
      while (this.semanticBytes > this.semanticBudgetBytes) {
        const candidate = [...this.semantic.values()].find((entry) => entry.pins === 0);
        if (!candidate) throw new RangeError("semantic authority cache budget is exhausted by active leases");
        this.semantic.delete(candidate.key);
        this.semanticBytes -= candidate.bytes;
        this.evictionCount += 1;
      }
    }
    evictHydrology() {
      while (this.hydrologyBytes > this.hydrologyBudgetBytes) {
        const candidate = [...this.hydrology.values()].find((entry) => entry.pins === 0);
        if (!candidate) throw new RangeError("hydrology authority cache budget is exhausted by active leases");
        this.hydrology.delete(candidate.key);
        this.hydrologyBytes -= candidate.bytes;
        this.evictionCount += 1;
      }
    }
    assertReady() {
      if (this.disposed) throw new Error("WorldAuthorityRepository has been disposed");
    }
  };

  // src/rendering/WorldSurfaceRuntime.ts
  var MINIMUM_WORLD_SURFACE_RUNTIME_BUDGETS = Object.freeze({
    surfaceGpuBytes: SURFACE_GPU_PAGE_BYTES,
    fogGpuBytes: SURFACE_FOG_PAGE_BYTES
  });
  var nextWorldSurfaceSessionEpoch = 1;
  function takeSessionEpoch(requested) {
    if (requested !== void 0) {
      if (!Number.isSafeInteger(requested) || requested <= 0) {
        throw new RangeError("world surface sessionEpoch must be a positive safe integer");
      }
      return requested;
    }
    if (nextWorldSurfaceSessionEpoch > Number.MAX_SAFE_INTEGER) {
      throw new RangeError("world surface session epoch space is exhausted");
    }
    return nextWorldSurfaceSessionEpoch++;
  }
  function assertBudgets(value) {
    if (!value || typeof value !== "object" || Object.getOwnPropertyNames(value).some((name) => ![
      "semanticAuthorityBytes",
      "hydrologyAuthorityBytes",
      "compiledCpuBytes",
      "retainedWindowBytes",
      "compiledWorkingSetBytes",
      "surfaceGpuBytes",
      "fogGpuBytes"
    ].includes(name))) {
      throw new TypeError("world surface runtime budgets are invalid");
    }
    for (const [name, amount] of Object.entries(value)) {
      if (!Number.isSafeInteger(amount) || amount <= 0) {
        throw new RangeError(`${name} must be a positive safe integer`);
      }
    }
    if (value.surfaceGpuBytes < SURFACE_GPU_PAGE_BYTES) {
      throw new RangeError("surfaceGpuBytes cannot admit one physical texture page");
    }
    if (value.fogGpuBytes < SURFACE_FOG_PAGE_BYTES) {
      throw new RangeError("fogGpuBytes cannot admit one physical texture page");
    }
  }
  function renderKeyForTile(x, y) {
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) {
      throw new RangeError("world edit authority coordinates must be safe integers");
    }
    return Object.freeze({
      chunkX: Math.floor(x / SURFACE_RENDER_CHUNK_SIZE),
      chunkY: Math.floor(y / SURFACE_RENDER_CHUNK_SIZE)
    });
  }
  function quantizeUnit162(value) {
    return Math.floor(Math.max(0, Math.min(1, value)) * 65535 + 0.5);
  }
  function quantizeBiomeWeights3(weights) {
    return Object.freeze([
      Math.round(weights[0] * 255),
      Math.round(weights[1] * 255),
      Math.round(weights[2] * 255),
      Math.round(weights[3] * 255)
    ]);
  }
  var WorldSurfaceRuntime = class _WorldSurfaceRuntime {
    constructor(parts) {
      this.disposed = false;
      Object.assign(this, parts);
      this.source = parts.source;
      this.store = parts.store;
      this.ownsStore = parts.ownsStore;
      this.editor = parts.editor;
      this.authority = parts.authority;
      this.compilation = parts.compilation;
      this.queries = parts.queries;
      this.picking = parts.picking;
      this.surfaceTextures = parts.surfaceTextures;
      this.fogTextures = parts.fogTextures;
      this.lighting = parts.lighting;
      this.presentation = parts.presentation;
      this.session = parts.session;
      this.rendererBinding = parts.rendererBinding;
      this.sceneBinding = parts.sceneBinding;
      this.scene = parts.scene;
    }
    static async create(options) {
      if (!options || typeof options !== "object" || !options.source || !options.worker || typeof options.worker.compileSurfaceChunk !== "function" || options.renderer === void 0 !== (options.scene === void 0)) {
        throw new TypeError("WorldSurfaceRuntime options are invalid");
      }
      assertBudgets(options.budgets);
      const ownsStore = options.store === void 0;
      const store = options.store ?? new MemoryWorldDeltaStore();
      let authority;
      let compilation;
      let queries;
      let picking;
      let editor;
      let surfaceTextures;
      let fogTextures;
      let lighting;
      let presentation;
      let session;
      let rendererBinding;
      let sceneBinding;
      try {
        const editAuthority = {
          readSemanticTile: async (x, y) => {
            const snapshot = await authority.capture(renderKeyForTile(x, y));
            const tile = snapshot.getTile(x, y);
            return Object.freeze({
              substrateClass: tile.substrateClass,
              macroHeight: quantizeUnit162(tile.macroHeight),
              biomeWeights: quantizeBiomeWeights3(tile.biomeWeights),
              vegetationDensity: Math.round(tile.vegetationDensity * 255),
              vegetationProfile: tile.vegetationProfile
            });
          },
          hydrologyConstraintsAt: async (x, y) => {
            const sample = await queries.sample(x, y);
            const bodyId = sample.waterBody?.bodyId;
            if (!bodyId || sample.waterBody?.kind === "ocean") return Object.freeze([]);
            return Object.freeze([Object.freeze({
              featureId: bodyId,
              maximumGroundHeight: quantizeUnit162(sample.waterLevel - 1 / 65535)
            })]);
          }
        };
        editor = await WorldEditor.create({
          descriptor: options.source.descriptor,
          store,
          authority: editAuthority,
          hydrologyRebaker: options.hydrologyRebaker,
          maximumTilesPerTransaction: options.maximumTilesPerTransaction
        });
        authority = new WorldAuthorityRepository({
          source: options.source,
          view: editor.view,
          semanticBudgetBytes: options.budgets.semanticAuthorityBytes,
          hydrologyBudgetBytes: options.budgets.hydrologyAuthorityBytes
        });
        queries = new SurfaceQueryService({ descriptor: options.source.descriptor, snapshots: authority });
        compilation = new SurfaceCompilationService({
          descriptor: options.source.descriptor,
          sessionEpoch: takeSessionEpoch(options.sessionEpoch),
          worker: options.worker,
          cpuCacheBudgetBytes: options.budgets.compiledCpuBytes,
          retainedWindowBufferBudgetBytes: options.budgets.retainedWindowBytes
        });
        surfaceTextures = new SurfaceTexturePool({ gpuBudgetBytes: options.budgets.surfaceGpuBytes });
        fogTextures = new SurfaceFogTexturePool({
          surfacePool: surfaceTextures,
          gpuBudgetBytes: options.budgets.fogGpuBytes
        });
        lighting = new LightingStateController(options.lighting);
        rendererBinding = options.renderer ? lighting.bindRenderer(options.renderer) : void 0;
        sceneBinding = options.scene ? lighting.bindScene(options.scene) : void 0;
        presentation = new SurfacePresentationLayer({
          surfaceTexturePool: surfaceTextures,
          fogTexturePool: fogTextures,
          lighting,
          hexSize: options.hexSize,
          heightScale: options.heightScale
        });
        session = new WorldRenderSession({
          descriptor: options.source.descriptor,
          authority,
          compilation,
          presentation,
          queries,
          editor,
          compiledWorkingSetBudgetBytes: options.budgets.compiledWorkingSetBytes,
          customLayers: options.customLayers,
          error: options.error
        });
        await session.initialize();
        picking = new SurfacePickingService({
          descriptor: options.source.descriptor,
          queries,
          root: session.root,
          hexSize: options.hexSize
        });
        options.scene?.add(session.root);
        return new _WorldSurfaceRuntime({
          source: options.source,
          store,
          ownsStore,
          editor,
          authority,
          compilation,
          queries,
          picking,
          surfaceTextures,
          fogTextures,
          lighting,
          presentation,
          session,
          rendererBinding,
          sceneBinding,
          scene: options.scene
        });
      } catch (reason) {
        session?.dispose();
        if (!session) {
          presentation?.dispose();
          compilation?.dispose();
          queries?.dispose();
          authority?.dispose();
          if (!authority) options.source.dispose();
        }
        editor?.dispose();
        picking?.dispose();
        rendererBinding?.release();
        sceneBinding?.release();
        fogTextures?.dispose();
        surfaceTextures?.dispose();
        lighting?.dispose();
        if (ownsStore) store.dispose();
        throw reason;
      }
    }
    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      this.scene?.remove(this.session.root);
      this.session.dispose();
      this.picking.dispose();
      this.editor.dispose();
      this.rendererBinding?.release();
      this.sceneBinding?.release();
      this.fogTextures.dispose();
      this.surfaceTextures.dispose();
      this.lighting.dispose();
      if (this.ownsStore) this.store.dispose();
    }
    get state() {
      return this.disposed ? "disposed" : "ready";
    }
    setFloatingOrigin(worldX, worldZ) {
      if (this.disposed) throw new Error("WorldSurfaceRuntime has been disposed");
      this.session.setFloatingOrigin(worldX, worldZ);
      this.picking.setFloatingOrigin(worldX, worldZ);
    }
  };
  function asError2(reason) {
    return reason instanceof Error ? reason : new Error(String(reason));
  }
  var SurfaceHexMapInteractionController = class {
    constructor(options) {
      this.options = options;
      this.movementKeys = /* @__PURE__ */ new Set();
      this.pickGeneration = 0;
      this.disposed = false;
      this.onContextMenu = (event) => event.preventDefault();
      this.onKeyDown = (event) => {
        if (!this.isMovementKey(event.code)) return;
        this.movementKeys.add(event.code);
        event.preventDefault();
      };
      this.onKeyUp = (event) => {
        if (!this.isMovementKey(event.code)) return;
        this.movementKeys.delete(event.code);
        event.preventDefault();
      };
      this.clearMovementKeys = () => {
        this.movementKeys.clear();
      };
      this.onMouseDown = (event) => {
        this.options.canvas.focus({ preventScroll: true });
        this.mouseDownAt = event.button === 0 ? { x: event.clientX, y: event.clientY } : void 0;
      };
      this.onPointerMove = (event) => {
        if (!this.contains(event.clientX, event.clientY)) {
          this.clearHover();
          return;
        }
        this.pendingHover = { x: event.clientX, y: event.clientY };
        if (this.hoverFrame !== void 0) return;
        this.hoverFrame = requestAnimationFrame(() => {
          this.hoverFrame = void 0;
          const point = this.pendingHover;
          this.pendingHover = void 0;
          if (point) void this.publishHover(point);
        });
      };
      this.onMouseUp = (event) => {
        if (event.button !== 0) return;
        const downAt = this.mouseDownAt;
        this.mouseDownAt = void 0;
        if (!downAt || Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y) > 4) return;
        void this.publishClick({ x: event.clientX, y: event.clientY });
      };
      if (!options || !(options.canvas instanceof HTMLCanvasElement) || !Number.isFinite(options.hexSize) || options.hexSize <= 0 || !Number.isFinite(options.heightScale) || options.heightScale <= 0) {
        throw new TypeError("surface interaction options are invalid");
      }
      this.addedCanvasTabIndex = !options.canvas.hasAttribute("tabindex");
      if (this.addedCanvasTabIndex) options.canvas.tabIndex = 0;
      options.canvas.addEventListener("keydown", this.onKeyDown);
      options.canvas.addEventListener("keyup", this.onKeyUp);
      options.canvas.addEventListener("blur", this.clearMovementKeys);
      options.canvas.addEventListener("mousedown", this.onMouseDown);
      options.canvas.addEventListener("contextmenu", this.onContextMenu);
      window.addEventListener("blur", this.clearMovementKeys);
      window.addEventListener("pointermove", this.onPointerMove);
      window.addEventListener("mouseup", this.onMouseUp);
    }
    update(dtSeconds) {
      if (this.disposed || dtSeconds <= 0 || this.movementKeys.size === 0) return;
      const forwardAmount = Number(this.movementKeys.has("KeyW")) - Number(this.movementKeys.has("KeyS"));
      const rightAmount = Number(this.movementKeys.has("KeyD")) - Number(this.movementKeys.has("KeyA"));
      if (forwardAmount === 0 && rightAmount === 0) return;
      const { camera, controls, hexSize } = this.options;
      const forward = controls.target.clone().sub(camera.position);
      forward.y = 0;
      if (forward.lengthSq() < 1e-4) forward.set(0, 0, -1);
      else forward.normalize();
      const right = new three.Vector3(-forward.z, 0, forward.x);
      const movement = forward.multiplyScalar(forwardAmount).addScaledVector(right, rightAmount);
      if (movement.lengthSq() > 1) movement.normalize();
      const viewDistance = camera.position.distanceTo(controls.target);
      const speed = Math.min(hexSize * 120, Math.max(hexSize * 8, viewDistance * 0.9));
      movement.multiplyScalar(speed * dtSeconds);
      camera.position.add(movement);
      controls.target.add(movement);
    }
    reset() {
      this.pickGeneration += 1;
      this.mouseDownAt = void 0;
      this.pendingHover = void 0;
      this.hovered = void 0;
      this.movementKeys.clear();
      this.options.pointer.visible = false;
    }
    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      const { canvas } = this.options;
      canvas.removeEventListener("keydown", this.onKeyDown);
      canvas.removeEventListener("keyup", this.onKeyUp);
      canvas.removeEventListener("blur", this.clearMovementKeys);
      canvas.removeEventListener("mousedown", this.onMouseDown);
      canvas.removeEventListener("contextmenu", this.onContextMenu);
      window.removeEventListener("blur", this.clearMovementKeys);
      window.removeEventListener("pointermove", this.onPointerMove);
      window.removeEventListener("mouseup", this.onMouseUp);
      if (this.hoverFrame !== void 0) cancelAnimationFrame(this.hoverFrame);
      if (this.addedCanvasTabIndex && canvas.getAttribute("tabindex") === "0") {
        canvas.removeAttribute("tabindex");
      }
      this.reset();
    }
    async publishHover(point) {
      const generation = ++this.pickGeneration;
      try {
        const result = await this.options.pick(point.x, point.y);
        if (this.disposed || generation !== this.pickGeneration) return;
        if (!result) {
          this.clearHover();
          return;
        }
        this.positionPointer(result);
        if (this.hovered?.x === result.x && this.hovered.y === result.y) return;
        this.hovered = Object.freeze({ x: result.x, y: result.y });
        this.options.hover(result);
      } catch (reason) {
        if (!this.disposed && generation === this.pickGeneration) this.options.error(asError2(reason));
      }
    }
    async publishClick(point) {
      try {
        const result = await this.options.pick(point.x, point.y);
        if (this.disposed || !result) return;
        this.positionPointer(result);
        this.options.click(result);
      } catch (reason) {
        if (!this.disposed) this.options.error(asError2(reason));
      }
    }
    positionPointer(result) {
      const center = surfaceToWorld(result.x, result.y, this.options.hexSize);
      this.options.pointer.position.set(
        center.x,
        result.height * this.options.heightScale + this.options.hexSize * 0.08,
        center.z
      );
      this.options.pointer.visible = true;
    }
    clearHover() {
      this.pickGeneration += 1;
      this.hovered = void 0;
      this.options.pointer.visible = false;
    }
    contains(clientX, clientY) {
      const rect = this.options.canvas.getBoundingClientRect();
      return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
    }
    isMovementKey(code) {
      return code === "KeyW" || code === "KeyA" || code === "KeyS" || code === "KeyD";
    }
  };

  // src/rendering/SurfaceHexMap.ts
  function resolveCanvas(value) {
    const element = typeof value === "string" ? document.querySelector(value) : value;
    if (!(element instanceof HTMLCanvasElement)) {
      throw new TypeError("HexMap element must resolve to an HTMLCanvasElement");
    }
    return element;
  }
  function assertPositive(name, value) {
    if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be finite and positive`);
  }
  function createSurfaceSky(visible) {
    if (!visible) return void 0;
    const sky = new Sky();
    sky.name = "surface-atmospheric-sky";
    sky.scale.setScalar(45e4);
    sky.frustumCulled = false;
    const uniforms = sky.material.uniforms;
    uniforms.turbidity.value = 4;
    uniforms.rayleigh.value = 1.7;
    uniforms.mieCoefficient.value = 2e-3;
    uniforms.mieDirectionalG.value = 0.76;
    const elevation = 24 * Math.PI / 180;
    const azimuth = 205 * Math.PI / 180;
    uniforms.sunPosition.value.setFromSphericalCoords(1, Math.PI / 2 - elevation, azimuth);
    return sky;
  }
  function disposeSurfaceSky(sky) {
    if (!sky) return;
    sky.removeFromParent();
    sky.geometry.dispose();
    sky.material.dispose();
  }
  function canonicalTile2(source, point) {
    if (!Number.isSafeInteger(point.x) || !Number.isSafeInteger(point.y)) {
      throw new RangeError("world load initialTile must use safe integers");
    }
    const descriptor = source.descriptor;
    if (descriptor.topology === "bounded") {
      if (point.x < 0 || point.y < 0 || point.x >= descriptor.width || point.y >= descriptor.height) {
        throw new RangeError("world load initialTile is outside bounded topology");
      }
      return Object.freeze({ ...point });
    }
    if (descriptor.topology === "toroidal") {
      const modulo2 = (value, size) => (value % size + size) % size;
      return Object.freeze({ x: modulo2(point.x, descriptor.width), y: modulo2(point.y, descriptor.height) });
    }
    return Object.freeze({ ...point });
  }
  var HexMap = class extends EventEmitter {
    constructor(options) {
      super();
      this.activeScene = new three.Scene();
      this.loadRevision = 0;
      this.renderedFrames = 0;
      this.demandUpdates = 0;
      this.demandSignature = "";
      this.demandDrainRunning = false;
      this.lastAnimationTime = performance.now();
      this.stateValue = "ready";
      this.resize = () => {
        const width = Math.max(1, this.canvas.clientWidth || this.canvas.width || 1);
        const height = Math.max(1, this.canvas.clientHeight || this.canvas.height || 1);
        this.renderer.setSize(width, height, false);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
      };
      this.contextLost = (event) => {
        event.preventDefault();
        if (this.runtimeValue?.session.stats.state === "ready") this.runtimeValue.session.handleContextLost();
      };
      this.contextRestored = () => {
        if (this.runtimeValue?.session.stats.state === "lost") this.runtimeValue.session.handleContextRestored();
        if (this.activeSky) this.activeSky.material.needsUpdate = true;
      };
      this.animate = () => {
        if (this.stateValue === "disposed") return;
        this.animationFrame = requestAnimationFrame(this.animate);
        const now = performance.now();
        const dtSeconds = Math.min(0.1, Math.max(0, (now - this.lastAnimationTime) / 1e3));
        this.lastAnimationTime = now;
        this.interaction.update(dtSeconds);
        this.controls.update();
        this.updateDemand();
        if (this.runtimeValue?.session.stats.state === "ready") {
          this.runtimeValue.session.setTime(performance.now() / 1e3);
        }
        this.renderer.render(this.activeScene, this.camera);
        this.renderedFrames += 1;
      };
      if (!options || typeof options !== "object") throw new TypeError("HexMap options are required");
      this.canvas = resolveCanvas(options.element);
      this.hexSize = options.hexSize ?? 1;
      this.heightScale = options.heightScale ?? 80;
      this.backgroundColor = new three.Color(options.backgroundColor ?? 10471906);
      this.skyVisible = options.skyVisible ?? true;
      this.presentationStyleValue = createSurfacePresentationStyle(options.presentationStyle);
      const maxPixelRatio = options.maxPixelRatio ?? 2;
      assertPositive("hexSize", this.hexSize);
      assertPositive("heightScale", this.heightScale);
      assertPositive("maxPixelRatio", maxPixelRatio);
      this.renderer = new three.WebGLRenderer({ canvas: this.canvas, antialias: options.antialias ?? true });
      const context = this.renderer.getContext();
      if (typeof WebGL2RenderingContext !== "undefined" && !(context instanceof WebGL2RenderingContext)) {
        this.renderer.dispose();
        throw new Error("HexMap requires WebGL2 for array textures and GLSL 3");
      }
      this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, maxPixelRatio));
      this.camera = new three.PerspectiveCamera(
        options.fieldOfView ?? 60,
        1,
        options.nearPlane ?? 0.1,
        options.farPlane ?? 1e5
      );
      this.camera.position.set(18 * this.hexSize, 10.5 * this.hexSize, 20 * this.hexSize);
      this.controls = new OrbitControls(this.camera, this.canvas);
      this.controls.enableDamping = true;
      this.controls.screenSpacePanning = false;
      this.controls.minDistance = this.hexSize * 3;
      this.controls.maxDistance = this.hexSize * 80;
      this.controls.mouseButtons = { LEFT: null, MIDDLE: three.MOUSE.DOLLY, RIGHT: three.MOUSE.ROTATE };
      this.controls.touches = { ONE: three.TOUCH.PAN, TWO: three.TOUCH.DOLLY_ROTATE };
      this.controls.target.set(0, 0, 0);
      this.pointer = new three.Mesh(
        new three.RingGeometry(this.hexSize * 0.82, this.hexSize * 0.94, 6, 1),
        new three.MeshBasicMaterial({ color: 15986898, depthTest: true, depthWrite: false })
      );
      this.pointer.name = "surface-tile-pointer-v2";
      this.pointer.rotation.x = -Math.PI / 2;
      this.pointer.renderOrder = 10;
      this.pointer.visible = false;
      this.activeScene.add(this.pointer);
      this.interaction = new SurfaceHexMapInteractionController({
        canvas: this.canvas,
        camera: this.camera,
        controls: this.controls,
        pointer: this.pointer,
        hexSize: this.hexSize,
        heightScale: this.heightScale,
        pick: async (clientX, clientY) => {
          if (this.stateValue !== "ready" || !this.runtimeValue) return void 0;
          return this.runtimeValue.picking.pickScreen(clientX, clientY, this.canvas, this.camera);
        },
        hover: (result) => this.emit("hover", result),
        click: (result) => this.emit("click", result),
        error: (error) => this.emit("error", error)
      });
      this.activeSky = this.configureScene(this.activeScene);
      this.resize();
      if (typeof ResizeObserver !== "undefined") {
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(this.canvas);
      } else {
        window.addEventListener("resize", this.resize);
      }
      this.canvas.addEventListener("webglcontextlost", this.contextLost);
      this.canvas.addEventListener("webglcontextrestored", this.contextRestored);
      this.animate();
    }
    async loadWorld(options) {
      this.assertReady();
      if (!options || !options.source || !options.worker || !options.budgets) {
        throw new TypeError("HexMap world load options are invalid");
      }
      const initial = canonicalTile2(options.source, options.initialTile ?? { x: 0, y: 0 });
      const revision = ++this.loadRevision;
      this.stateValue = "loading";
      const scene = new three.Scene();
      const sky = this.configureScene(scene, options.prefetchRadiusTiles);
      let runtime;
      try {
        runtime = await WorldSurfaceRuntime.create({
          source: options.source,
          worker: options.worker,
          budgets: options.budgets,
          store: options.store,
          renderer: this.renderer,
          scene,
          hexSize: this.hexSize,
          heightScale: this.heightScale,
          error: (error) => this.emit("error", error)
        });
        runtime.presentation.setStyle(this.presentationStyleValue);
        await runtime.session.updateDemand(planWorldRenderDemand({
          descriptor: options.source.descriptor,
          centerX: initial.x,
          centerY: initial.y,
          visibleRadiusTiles: options.visibleRadiusTiles,
          prefetchRadiusTiles: options.prefetchRadiusTiles,
          lod1DistanceTiles: options.lod1DistanceTiles,
          lod2DistanceTiles: options.lod2DistanceTiles
        }));
        if (revision !== this.loadRevision || this.isDisposed()) {
          runtime.dispose();
          disposeSurfaceSky(sky);
          return;
        }
        const oldRuntime = this.runtimeValue;
        const oldSky = this.activeSky;
        this.runtimeValue = runtime;
        this.loadOptions = options;
        this.activeScene = scene;
        this.activeSky = sky;
        this.interaction.reset();
        scene.add(this.pointer);
        this.demandSignature = `${initial.x},${initial.y}`;
        await this.setCameraTargetTile(initial.x, initial.y);
        oldRuntime?.dispose();
        disposeSurfaceSky(oldSky);
        this.stateValue = "ready";
        this.emit("load", void 0);
      } catch (reason) {
        runtime?.dispose();
        disposeSurfaceSky(sky);
        if (revision === this.loadRevision && !this.isDisposed()) this.stateValue = "ready";
        throw reason;
      }
    }
    async edit(build) {
      const runtime = this.requireRuntime();
      await runtime.editor.edit(build);
    }
    async setCameraTargetTile(x, y) {
      const runtime = this.requireRuntime();
      const tile = canonicalTile2(runtime.source, { x, y });
      const center = surfaceToWorld(tile.x, tile.y, this.hexSize);
      const height = await runtime.queries.groundHeight(tile.x, tile.y) * this.heightScale;
      const offset = this.camera.position.clone().sub(this.controls.target);
      this.controls.target.set(center.x, height, center.z);
      this.camera.position.copy(this.controls.target).add(offset);
      this.controls.update();
      this.updateDemand();
    }
    setPresentationStyle(values) {
      this.assertReady();
      if (!values || typeof values !== "object" || Array.isArray(values)) {
        throw new TypeError("HexMap presentation style update is invalid");
      }
      const style = createSurfacePresentationStyle({ ...this.presentationStyleValue, ...values });
      this.runtimeValue?.presentation.setStyle(style);
      this.presentationStyleValue = style;
      return style;
    }
    get presentationStyle() {
      return this.presentationStyleValue;
    }
    getCameraTarget() {
      return this.controls.target.clone();
    }
    add(object) {
      this.activeScene.add(object);
    }
    remove(object) {
      this.activeScene.remove(object);
    }
    getScene() {
      return this.activeScene;
    }
    getCamera() {
      return this.camera;
    }
    get runtime() {
      return this.runtimeValue;
    }
    get state() {
      return this.stateValue;
    }
    get stats() {
      return Object.freeze({
        state: this.stateValue,
        worldLoaded: this.runtimeValue !== void 0,
        renderedFrames: this.renderedFrames,
        demandUpdates: this.demandUpdates,
        renderSession: this.runtimeValue?.session.stats
      });
    }
    dispose() {
      if (this.stateValue === "disposed") return;
      this.stateValue = "disposed";
      this.loadRevision += 1;
      if (this.animationFrame !== void 0) cancelAnimationFrame(this.animationFrame);
      this.resizeObserver?.disconnect();
      window.removeEventListener("resize", this.resize);
      this.canvas.removeEventListener("webglcontextlost", this.contextLost);
      this.canvas.removeEventListener("webglcontextrestored", this.contextRestored);
      this.interaction.dispose();
      this.runtimeValue?.dispose();
      this.runtimeValue = void 0;
      this.pendingDemand = void 0;
      disposeSurfaceSky(this.activeSky);
      this.activeSky = void 0;
      this.controls.dispose();
      this.pointer.geometry.dispose();
      this.pointer.material.dispose();
      this.renderer.dispose();
      this.removeAllListeners();
    }
    updateDemand() {
      const runtime = this.runtimeValue;
      const options = this.loadOptions;
      if (!runtime || !options || runtime.session.stats.state !== "ready") return;
      const target = worldToSurface(this.controls.target.x, this.controls.target.z, this.hexSize);
      const centerX = Math.round(target.u);
      const centerY = Math.round(target.v);
      const signature = `${centerX},${centerY}`;
      if (signature === this.demandSignature) return;
      this.demandSignature = signature;
      this.demandUpdates += 1;
      this.pendingDemand = Object.freeze({
        runtime,
        revision: this.loadRevision,
        demands: planWorldRenderDemand({
          descriptor: runtime.source.descriptor,
          centerX,
          centerY,
          visibleRadiusTiles: options.visibleRadiusTiles,
          prefetchRadiusTiles: options.prefetchRadiusTiles,
          lod1DistanceTiles: options.lod1DistanceTiles,
          lod2DistanceTiles: options.lod2DistanceTiles
        })
      });
      void this.drainDemandUpdates();
    }
    async drainDemandUpdates() {
      if (this.demandDrainRunning) return;
      this.demandDrainRunning = true;
      try {
        while (this.pendingDemand) {
          const pending = this.pendingDemand;
          this.pendingDemand = void 0;
          if (pending.revision !== this.loadRevision || pending.runtime !== this.runtimeValue) continue;
          await pending.runtime.session.updateDemand(pending.demands);
        }
      } catch (reason) {
        this.emit("error", reason instanceof Error ? reason : new Error(String(reason)));
      } finally {
        this.demandDrainRunning = false;
        if (this.pendingDemand && !this.isDisposed()) void this.drainDemandUpdates();
      }
    }
    requireRuntime() {
      this.assertReady();
      if (!this.runtimeValue) throw new Error("HexMap requires a loaded world");
      return this.runtimeValue;
    }
    configureScene(scene, prefetchRadiusTiles) {
      scene.background = this.backgroundColor.clone();
      if (prefetchRadiusTiles !== void 0) {
        assertPositive("prefetchRadiusTiles", prefetchRadiusTiles);
        const fogFar = prefetchRadiusTiles * this.hexSize * 1.35;
        scene.fog = new three.Fog(this.backgroundColor, fogFar * 0.64, fogFar);
      }
      const sky = createSurfaceSky(this.skyVisible);
      if (sky) scene.add(sky);
      return sky;
    }
    assertReady() {
      if (this.stateValue === "disposed") throw new Error("HexMap has been disposed");
    }
    isDisposed() {
      return this.stateValue === "disposed";
    }
  };

  // src/runtime/LifecycleScope.ts
  var nextLifecycleGeneration = 1;
  function lifecycleAbortError(message = "Lifecycle scope was closed") {
    if (typeof DOMException !== "undefined") return new DOMException(message, "AbortError");
    const error = new Error(message);
    error.name = "AbortError";
    return error;
  }
  var LifecycleDrainTimeoutError = class extends Error {
    constructor(label, timeoutMs, detachedTasks) {
      super(`${label} did not drain ${detachedTasks} task(s) within ${timeoutMs}ms`);
      this.label = label;
      this.timeoutMs = timeoutMs;
      this.detachedTasks = detachedTasks;
      this.name = "LifecycleDrainTimeoutError";
    }
  };
  var LifecycleScope = class {
    constructor(label, options = {}) {
      this.label = label;
      this.generation = nextLifecycleGeneration++;
      this.controller = new AbortController();
      this.pending = /* @__PURE__ */ new Set();
      this.stateValue = "active";
      this.startedTasks = 0;
      this.completedTasks = 0;
      this.failedTasks = 0;
      this.cancelledTasks = 0;
      this.detachedTasks = 0;
      this.rejectedPublications = 0;
      this.drainTimedOut = false;
      if (typeof label !== "string" || label.trim().length === 0) {
        throw new TypeError("lifecycle scope label must be a non-empty string");
      }
      this.now = options.now ?? (() => typeof performance === "undefined" ? Date.now() : performance.now());
      this.reportError = options.error;
      this.drainTimeoutMs = options.drainTimeoutMs;
      if (this.drainTimeoutMs !== void 0 && (!Number.isFinite(this.drainTimeoutMs) || this.drainTimeoutMs <= 0)) {
        throw new RangeError("lifecycle drainTimeoutMs must be positive and finite");
      }
      this.startedAt = this.now();
    }
    get signal() {
      return this.controller.signal;
    }
    get state() {
      return this.stateValue;
    }
    get active() {
      return this.stateValue === "active";
    }
    throwIfClosed() {
      if (!this.active) throw lifecycleAbortError(`${this.label} is no longer active`);
    }
    track(task) {
      if (!this.active) {
        void Promise.resolve(task).catch(() => void 0);
        return Promise.reject(lifecycleAbortError(`${this.label} is no longer active`));
      }
      this.startedTasks += 1;
      let observed;
      observed = Promise.resolve(task).then(
        (value) => {
          this.completedTasks += 1;
          return value;
        },
        (reason) => {
          const error = reason instanceof Error ? reason : new Error(String(reason));
          if (error.name === "AbortError" || this.signal.aborted) this.cancelledTasks += 1;
          else {
            this.failedTasks += 1;
            try {
              this.reportError?.(error);
            } catch {
            }
          }
          throw reason;
        }
      );
      this.pending.add(observed);
      void observed.then(
        () => this.finish(observed),
        () => this.finish(observed)
      );
      return observed;
    }
    run(operation) {
      if (!this.active) return Promise.reject(lifecycleAbortError(`${this.label} is no longer active`));
      let result;
      try {
        result = operation(this.signal);
      } catch (reason) {
        result = Promise.reject(reason);
      }
      return this.track(Promise.resolve(result));
    }
    // Returns false instead of invoking an observer when the session has been
    // superseded. Callers can release the value in onRejected when it owns a
    // resource that otherwise needs explicit cleanup.
    publish(value, observer, onRejected) {
      if (!this.active) {
        this.rejectedPublications += 1;
        try {
          onRejected?.(value);
        } catch (reason) {
          this.captureError(reason);
        }
        return false;
      }
      observer(value);
      return true;
    }
    close(reason = lifecycleAbortError(`${this.label} was closed`)) {
      if (this.stateValue === "active") {
        this.stateValue = "closing";
        this.controller.abort(reason);
      }
      if (this.pending.size === 0) this.markClosed();
      else this.armDrainTimeout();
      return this.settled;
    }
    get settled() {
      if (this.stateValue === "closed") return Promise.resolve();
      if (!this.settlePromise) {
        this.settlePromise = new Promise((resolve) => {
          this.resolveSettled = resolve;
        });
      }
      return this.settlePromise;
    }
    get stats() {
      return {
        label: this.label,
        generation: this.generation,
        state: this.stateValue,
        pendingTasks: this.pending.size,
        startedTasks: this.startedTasks,
        completedTasks: this.completedTasks,
        failedTasks: this.failedTasks,
        cancelledTasks: this.cancelledTasks,
        detachedTasks: this.detachedTasks,
        rejectedPublications: this.rejectedPublications,
        drainTimedOut: this.drainTimedOut,
        ageMs: Math.max(0, this.now() - this.startedAt)
      };
    }
    finish(task) {
      this.pending.delete(task);
      if (this.stateValue === "closing" && this.pending.size === 0) this.markClosed();
    }
    markClosed() {
      if (this.drainTimer !== void 0) {
        clearTimeout(this.drainTimer);
        this.drainTimer = void 0;
      }
      this.stateValue = "closed";
      this.resolveSettled?.();
      this.resolveSettled = void 0;
    }
    armDrainTimeout() {
      if (this.drainTimeoutMs === void 0 || this.drainTimer !== void 0) return;
      this.drainTimer = setTimeout(() => {
        this.drainTimer = void 0;
        if (this.stateValue !== "closing" || this.pending.size === 0) return;
        const detached = this.pending.size;
        this.pending.clear();
        this.detachedTasks += detached;
        this.drainTimedOut = true;
        this.captureError(new LifecycleDrainTimeoutError(this.label, this.drainTimeoutMs, detached));
        this.markClosed();
      }, this.drainTimeoutMs);
    }
    captureError(reason) {
      const error = reason instanceof Error ? reason : new Error(String(reason));
      try {
        this.reportError?.(error);
      } catch {
      }
    }
  };
  var ZERO_COST = {
    cpuBytes: 0,
    gpuBytes: 0,
    geometryBytes: 0,
    textureBytes: 0,
    modelBytes: 0
  };
  function normalizeResourceCost(cost = {}) {
    const normalized = { ...ZERO_COST, ...cost };
    for (const [name, value] of Object.entries(normalized)) {
      if (!Number.isFinite(value) || value < 0 || !Number.isSafeInteger(value)) {
        throw new RangeError(`${name} must be a non-negative safe integer byte count`);
      }
    }
    return normalized;
  }
  function addCost(first, second) {
    return {
      cpuBytes: first.cpuBytes + second.cpuBytes,
      gpuBytes: first.gpuBytes + second.gpuBytes,
      geometryBytes: first.geometryBytes + second.geometryBytes,
      textureBytes: first.textureBytes + second.textureBytes,
      modelBytes: first.modelBytes + second.modelBytes
    };
  }
  function subtractCost(first, second) {
    return {
      cpuBytes: Math.max(0, first.cpuBytes - second.cpuBytes),
      gpuBytes: Math.max(0, first.gpuBytes - second.gpuBytes),
      geometryBytes: Math.max(0, first.geometryBytes - second.geometryBytes),
      textureBytes: Math.max(0, first.textureBytes - second.textureBytes),
      modelBytes: Math.max(0, first.modelBytes - second.modelBytes)
    };
  }
  var ResourceBudgetLedger = class {
    constructor(limits) {
      this.entries = /* @__PURE__ */ new Map();
      this.accounts = /* @__PURE__ */ new Set();
      this.totals = { ...ZERO_COST };
      this.rejectedReservations = 0;
      this.peakCpuBytes = 0;
      this.peakGpuBytes = 0;
      this.nextAccountId = 1;
      this.disposed = false;
      this.limits = this.validateLimits(limits);
    }
    configure(limits) {
      this.assertActive();
      this.limits = this.validateLimits({ ...this.limits, ...limits });
    }
    reserve(key2, cost, pinned = false) {
      this.assertActive();
      this.assertKey(key2);
      const normalized = normalizeResourceCost(cost);
      const existing = this.entries.get(key2);
      const prospective = addCost(subtractCost(this.totals, existing ?? ZERO_COST), normalized);
      if (prospective.cpuBytes > this.limits.cpuBytes || prospective.gpuBytes > this.limits.gpuBytes) {
        this.rejectedReservations += 1;
        return false;
      }
      this.store(key2, normalized, pinned, existing);
      return true;
    }
    forceReserve(key2, cost, pinned = false) {
      this.assertActive();
      this.assertKey(key2);
      const normalized = normalizeResourceCost(cost);
      this.store(key2, normalized, pinned, this.entries.get(key2));
    }
    release(key2) {
      const existing = this.entries.get(key2);
      if (!existing) return false;
      this.entries.delete(key2);
      this.totals = subtractCost(this.totals, existing);
      return true;
    }
    clear() {
      if (this.disposed) return;
      for (const account of this.accounts) account.invalidateReservations();
      this.entries.clear();
      this.totals = { ...ZERO_COST };
    }
    dispose() {
      if (this.disposed) return;
      for (const account of [...this.accounts]) account.detachFromLedger();
      this.accounts.clear();
      this.entries.clear();
      this.totals = { ...ZERO_COST };
      this.disposed = true;
    }
    createAccount(label) {
      this.assertActive();
      if (typeof label !== "string" || label.trim().length === 0) {
        throw new TypeError("resource account label is required");
      }
      const account = new LedgerResourceBudgetAccount(
        this,
        label,
        `@account:${this.nextAccountId++}:`,
        (value) => {
          this.accounts.delete(value);
        }
      );
      this.accounts.add(account);
      return account;
    }
    setPinned(key2, pinned) {
      const existing = this.entries.get(key2);
      if (!existing || existing.pinned === pinned) return Boolean(existing);
      this.entries.set(key2, { ...existing, pinned });
      return true;
    }
    get(key2) {
      return this.entries.get(key2);
    }
    get stats() {
      let pinnedReservations = 0;
      for (const entry of this.entries.values()) if (entry.pinned) pinnedReservations += 1;
      return {
        ...this.totals,
        disposed: this.disposed,
        cpuLimitBytes: this.limits.cpuBytes,
        gpuLimitBytes: this.limits.gpuBytes,
        accounts: this.accounts.size,
        reservations: this.entries.size,
        pinnedReservations,
        cpuExceededBytes: Math.max(0, this.totals.cpuBytes - this.limits.cpuBytes),
        gpuExceededBytes: Math.max(0, this.totals.gpuBytes - this.limits.gpuBytes),
        rejectedReservations: this.rejectedReservations,
        peakCpuBytes: this.peakCpuBytes,
        peakGpuBytes: this.peakGpuBytes
      };
    }
    store(key2, cost, pinned, existing) {
      this.totals = addCost(subtractCost(this.totals, existing ?? ZERO_COST), cost);
      this.entries.set(key2, { key: key2, pinned, ...cost });
      this.peakCpuBytes = Math.max(this.peakCpuBytes, this.totals.cpuBytes);
      this.peakGpuBytes = Math.max(this.peakGpuBytes, this.totals.gpuBytes);
    }
    validateLimits(limits) {
      for (const [name, value] of Object.entries(limits)) {
        if (!Number.isFinite(value) || value < 0 || !Number.isSafeInteger(value)) {
          throw new RangeError(`${name} budget must be a non-negative safe integer`);
        }
      }
      return { ...limits };
    }
    assertKey(key2) {
      if (typeof key2 !== "string" || key2.trim().length === 0) {
        throw new TypeError("resource key is required");
      }
    }
    assertActive() {
      if (this.disposed) throw new Error("ResourceBudgetLedger has been disposed");
    }
  };
  var LedgerResourceReservationHandle = class {
    constructor(account, key2, ledgerKey) {
      this.account = account;
      this.key = key2;
      this.ledgerKey = ledgerKey;
      this.releasedValue = false;
    }
    get released() {
      return this.releasedValue;
    }
    get reservation() {
      return this.releasedValue ? void 0 : this.account.lookup(this.ledgerKey);
    }
    update(cost, pinned = this.reservation?.pinned ?? false) {
      if (this.releasedValue) throw new Error(`resource reservation "${this.key}" has been released`);
      return this.account.update(this, cost, pinned);
    }
    setPinned(pinned) {
      if (this.releasedValue) return false;
      return this.account.setPinned(this, pinned);
    }
    release() {
      if (this.releasedValue) return false;
      this.releasedValue = true;
      return this.account.releaseHandle(this);
    }
    invalidate() {
      this.releasedValue = true;
    }
  };
  var LedgerResourceBudgetAccount = class {
    constructor(ledger, label, prefix, detached) {
      this.ledger = ledger;
      this.label = label;
      this.prefix = prefix;
      this.detached = detached;
      this.handles = /* @__PURE__ */ new Map();
      this.disposedValue = false;
    }
    get disposed() {
      return this.disposedValue;
    }
    acquire(key2, cost, pinned = false) {
      this.assertActive();
      this.assertLocalKey(key2);
      if (this.handles.has(key2)) {
        throw new Error(`resource account "${this.label}" already owns reservation "${key2}"`);
      }
      const ledgerKey = `${this.prefix}${key2}`;
      if (!this.ledger.reserve(ledgerKey, cost, pinned)) return void 0;
      const handle = new LedgerResourceReservationHandle(this, key2, ledgerKey);
      this.handles.set(key2, handle);
      return handle;
    }
    release(key2) {
      return this.handles.get(key2)?.release() ?? false;
    }
    clear() {
      if (this.disposedValue) return;
      for (const handle of [...this.handles.values()]) handle.release();
    }
    dispose() {
      if (this.disposedValue) return;
      this.clear();
      this.disposedValue = true;
      this.detached(this);
    }
    get stats() {
      let totals = { ...ZERO_COST };
      let reservations = 0;
      let pinnedReservations = 0;
      for (const handle of this.handles.values()) {
        const reservation = handle.reservation;
        if (!reservation) continue;
        totals = addCost(totals, reservation);
        reservations += 1;
        if (reservation.pinned) pinnedReservations += 1;
      }
      return {
        ...totals,
        label: this.label,
        disposed: this.disposedValue,
        reservations,
        pinnedReservations
      };
    }
    lookup(ledgerKey) {
      return this.ledger.get(ledgerKey);
    }
    update(handle, cost, pinned) {
      this.assertOwned(handle);
      return this.ledger.reserve(handle.ledgerKey, cost, pinned);
    }
    setPinned(handle, pinned) {
      this.assertOwned(handle);
      return this.ledger.setPinned(handle.ledgerKey, pinned);
    }
    releaseHandle(handle) {
      if (this.handles.get(handle.key) !== handle) return false;
      this.handles.delete(handle.key);
      return this.ledger.release(handle.ledgerKey);
    }
    invalidateReservations() {
      for (const handle of this.handles.values()) handle.invalidate();
      this.handles.clear();
    }
    detachFromLedger() {
      this.invalidateReservations();
      this.disposedValue = true;
    }
    assertOwned(handle) {
      this.assertActive();
      if (this.handles.get(handle.key) !== handle) {
        throw new Error(`resource reservation "${handle.key}" is not owned by account "${this.label}"`);
      }
    }
    assertActive() {
      if (this.disposedValue) throw new Error(`resource account "${this.label}" has been disposed`);
    }
    assertLocalKey(key2) {
      if (typeof key2 !== "string" || key2.trim().length === 0) {
        throw new TypeError("resource reservation key is required");
      }
    }
  };
  function attributeArray(attribute) {
    return attribute instanceof three.InterleavedBufferAttribute ? attribute.data.array : attribute.array;
  }
  function estimateBufferGeometriesResourceBytes(geometries) {
    const arrays = /* @__PURE__ */ new Set();
    const uploads = /* @__PURE__ */ new Set();
    let cpuBytes = 0;
    let gpuBytes = 0;
    const account = (attribute) => {
      if (!attribute) return;
      const array = attributeArray(attribute);
      const buffer = array.buffer;
      if (!arrays.has(buffer)) {
        arrays.add(buffer);
        cpuBytes += buffer.byteLength;
      }
      const uploadOwner = attribute instanceof three.InterleavedBufferAttribute ? attribute.data : attribute;
      if (!uploads.has(uploadOwner)) {
        uploads.add(uploadOwner);
        gpuBytes += array.byteLength;
      }
    };
    for (const geometry of new Set(geometries)) {
      account(geometry.index);
      for (const attribute of Object.values(geometry.attributes)) account(attribute);
      for (const attributes of Object.values(geometry.morphAttributes)) {
        for (const attribute of attributes) account(attribute);
      }
    }
    return { cpuBytes, gpuBytes };
  }
  function estimateBufferGeometriesBytes(geometries) {
    return estimateBufferGeometriesResourceBytes(geometries).cpuBytes;
  }
  function textureImageBytes(image) {
    if (Array.isArray(image)) return image.reduce((bytes, face) => bytes + textureImageBytes(face), 0);
    if (!image || typeof image !== "object") return 0;
    const value = image;
    if (value.data) return value.data.byteLength;
    if (!Number.isFinite(value.width) || !Number.isFinite(value.height)) return 0;
    return Math.max(0, Math.round(
      value.width * value.height * (value.depth ?? 1) * 4
    ));
  }
  function textureResourceBytes(texture) {
    const baseBytes = textureImageBytes(texture.image);
    const mipmapBytes = texture.mipmaps.reduce((bytes, mipmap) => bytes + textureImageBytes(mipmap), 0);
    const generatedMipBytes = texture.generateMipmaps && mipmapBytes === 0 ? Math.ceil(baseBytes / 3) : 0;
    return {
      cpuBytes: baseBytes + mipmapBytes,
      gpuBytes: baseBytes + mipmapBytes + generatedMipBytes
    };
  }
  function collectTextureValue(value, textures) {
    if (value instanceof three.Texture) {
      textures.add(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const entry of value) collectTextureValue(entry, textures);
    }
  }
  function estimateObject3DResourceCost(objects) {
    const geometries = /* @__PURE__ */ new Set();
    const materials = /* @__PURE__ */ new Set();
    const textures = /* @__PURE__ */ new Set();
    const roots = new Set(objects);
    for (const root of roots) root.traverse((object) => {
      const renderable = object;
      if (renderable.geometry) geometries.add(renderable.geometry);
      const objectMaterials = renderable.material ? Array.isArray(renderable.material) ? renderable.material : [renderable.material] : [];
      for (const material of objectMaterials) materials.add(material);
    });
    for (const material of materials) {
      for (const value of Object.values(material)) collectTextureValue(value, textures);
      const uniforms = material.uniforms;
      for (const uniform of Object.values(uniforms ?? {})) {
        collectTextureValue(uniform?.value, textures);
      }
    }
    const geometry = estimateBufferGeometriesResourceBytes([...geometries]);
    let textureCpuBytes = 0;
    let textureGpuBytes = 0;
    for (const texture of textures) {
      const cost = textureResourceBytes(texture);
      textureCpuBytes += cost.cpuBytes;
      textureGpuBytes += cost.gpuBytes;
    }
    return normalizeResourceCost({
      cpuBytes: geometry.cpuBytes + textureCpuBytes,
      gpuBytes: geometry.gpuBytes + textureGpuBytes,
      geometryBytes: geometry.gpuBytes,
      textureBytes: textureGpuBytes,
      modelBytes: geometry.cpuBytes + textureCpuBytes
    });
  }

  // src/runtime/PriorityTaskQueue.ts
  var WorkQueueBackpressureError = class extends Error {
    constructor() {
      super(...arguments);
      this.name = "WorkQueueBackpressureError";
    }
  };
  var LANE_RANK = {
    critical: 0,
    interactive: 1,
    visible: 2,
    prefetch: 3,
    background: 4
  };
  function cancellationError(message) {
    if (typeof DOMException !== "undefined") return new DOMException(message, "AbortError");
    const error = new Error(message);
    error.name = "AbortError";
    return error;
  }
  var PriorityTaskQueue = class {
    constructor(options = {}) {
      this.entries = /* @__PURE__ */ new Map();
      this.keyed = /* @__PURE__ */ new Map();
      this.nextId = 1;
      this.sequence = 0;
      this.pendingWeight = 0;
      this.cancelledTasks = 0;
      this.shedTasks = 0;
      this.maxPendingTasks = options.maxPendingTasks ?? Number.MAX_SAFE_INTEGER;
      this.maxPendingWeight = options.maxPendingWeight ?? Number.MAX_SAFE_INTEGER;
      this.starvationMs = options.starvationMs ?? 2e3;
      this.now = options.now ?? (() => typeof performance === "undefined" ? Date.now() : performance.now());
      if (!Number.isSafeInteger(this.maxPendingTasks) || this.maxPendingTasks <= 0) {
        throw new RangeError("maxPendingTasks must be a positive safe integer");
      }
      if (!Number.isSafeInteger(this.maxPendingWeight) || this.maxPendingWeight <= 0) {
        throw new RangeError("maxPendingWeight must be a positive safe integer");
      }
      if (!Number.isFinite(this.starvationMs) || this.starvationMs <= 0) {
        throw new RangeError("starvationMs must be positive and finite");
      }
    }
    enqueue(value, options = {}) {
      const lane = options.lane ?? "visible";
      const priority = options.priority ?? 0;
      const weight = options.weight ?? 1;
      if (!(lane in LANE_RANK)) throw new TypeError(`unknown work lane "${String(lane)}"`);
      if (!Number.isFinite(priority)) throw new RangeError("task priority must be finite");
      if (!Number.isSafeInteger(weight) || weight <= 0) throw new RangeError("task weight must be a positive safe integer");
      if (options.key !== void 0 && options.key.length === 0) throw new TypeError("task key cannot be empty");
      if (options.signal?.aborted) {
        this.notifyCancellation(options.cancelled, cancellationError("Task was aborted before it was queued"));
        return void 0;
      }
      if (weight > this.maxPendingWeight) {
        this.shedTasks += 1;
        this.notifyCancellation(
          options.cancelled,
          new WorkQueueBackpressureError(
            `Task weight ${weight} exceeds the queue limit ${this.maxPendingWeight}`
          )
        );
        return void 0;
      }
      if (options.key !== void 0) {
        const previous = this.keyed.get(options.key);
        if (previous !== void 0) this.remove(previous, cancellationError("Task was replaced"), true);
      }
      const entry = {
        id: this.nextId++,
        key: options.key,
        lane,
        priority,
        weight,
        sequence: this.sequence++,
        enqueuedAt: this.now(),
        value,
        signal: options.signal,
        cancelled: options.cancelled
      };
      if (options.signal) {
        entry.abort = () => this.remove(entry.id, cancellationError("Queued task was aborted"), true);
        options.signal.addEventListener("abort", entry.abort, { once: true });
      }
      this.entries.set(entry.id, entry);
      if (entry.key !== void 0) this.keyed.set(entry.key, entry.id);
      this.pendingWeight += weight;
      this.shedOverflow();
      return this.entries.has(entry.id) ? entry.id : void 0;
    }
    take(predicate) {
      const now = this.now();
      let selected;
      for (const entry of this.entries.values()) {
        if (entry.signal?.aborted) {
          this.remove(entry.id, cancellationError("Queued task was aborted"), true);
          continue;
        }
        if (predicate && !predicate(entry.value)) continue;
        if (!selected || this.compare(entry, selected, now) < 0) selected = entry;
      }
      if (!selected) return void 0;
      this.detach(selected);
      return selected.value;
    }
    cancelKey(key2, reason = cancellationError("Queued task was cancelled")) {
      const id = this.keyed.get(key2);
      return id === void 0 ? false : this.remove(id, reason, true);
    }
    cancel(id, reason = cancellationError("Queued task was cancelled")) {
      return this.remove(id, reason, true);
    }
    clear(reason = cancellationError("Work queue was cleared")) {
      for (const id of [...this.entries.keys()]) this.remove(id, reason, true);
    }
    get values() {
      return [...this.entries.values()].map((entry) => entry.value);
    }
    get stats() {
      const now = this.now();
      let oldestTaskAgeMs = 0;
      let starvationPromotions = 0;
      for (const entry of this.entries.values()) {
        const age = Math.max(0, now - entry.enqueuedAt);
        oldestTaskAgeMs = Math.max(oldestTaskAgeMs, age);
        starvationPromotions += Math.min(LANE_RANK[entry.lane], Math.floor(age / this.starvationMs));
      }
      return {
        pendingTasks: this.entries.size,
        pendingWeight: this.pendingWeight,
        oldestTaskAgeMs,
        cancelledTasks: this.cancelledTasks,
        shedTasks: this.shedTasks,
        starvationPromotions
      };
    }
    shedOverflow() {
      while (this.entries.size > this.maxPendingTasks || this.pendingWeight > this.maxPendingWeight) {
        let worst;
        for (const entry of this.entries.values()) {
          if (!worst || this.compareForEviction(entry, worst) > 0) worst = entry;
        }
        if (!worst) return;
        this.shedTasks += 1;
        this.remove(
          worst.id,
          new WorkQueueBackpressureError("Queued task was shed by the configured backpressure limit"),
          false
        );
      }
    }
    compare(first, second, now) {
      const firstStarved = this.isStarved(first, now);
      const secondStarved = this.isStarved(second, now);
      if (firstStarved !== secondStarved) return firstStarved ? -1 : 1;
      if (firstStarved) return first.sequence - second.sequence;
      return this.effectiveLane(first, now) - this.effectiveLane(second, now) || first.priority - second.priority || first.sequence - second.sequence;
    }
    // Dispatch aging prevents starvation among admitted work. Admission is a
    // different policy boundary: an old background task must not evict a fresh
    // critical task merely because the tab was suspended long enough for its
    // wall-clock starvation deadline to elapse.
    compareForEviction(first, second) {
      return LANE_RANK[first.lane] - LANE_RANK[second.lane] || first.priority - second.priority || first.sequence - second.sequence;
    }
    isStarved(entry, now) {
      const deadlineWindows = LANE_RANK[entry.lane] + 1;
      return Math.max(0, now - entry.enqueuedAt) >= this.starvationMs * deadlineWindows;
    }
    effectiveLane(entry, now) {
      const promotions = Math.min(LANE_RANK[entry.lane], Math.floor(Math.max(0, now - entry.enqueuedAt) / this.starvationMs));
      return LANE_RANK[entry.lane] - promotions;
    }
    remove(id, reason, countCancellation) {
      const entry = this.entries.get(id);
      if (!entry) return false;
      this.detach(entry);
      if (countCancellation) this.cancelledTasks += 1;
      this.notifyCancellation(entry.cancelled, reason);
      return true;
    }
    notifyCancellation(observer, reason) {
      try {
        observer?.(reason);
      } catch {
      }
    }
    detach(entry) {
      this.entries.delete(entry.id);
      if (entry.key !== void 0 && this.keyed.get(entry.key) === entry.id) this.keyed.delete(entry.key);
      if (entry.signal && entry.abort) entry.signal.removeEventListener("abort", entry.abort);
      this.pendingWeight = Math.max(0, this.pendingWeight - entry.weight);
    }
  };

  // src/runtime/RuntimeWorkCoordinator.ts
  function nonNegativeTelemetry(value, fallback = 0) {
    return Number.isFinite(value) && value >= 0 ? value : fallback;
  }
  var RuntimeWorkCoordinator = class {
    constructor(options = {}) {
      this.domains = /* @__PURE__ */ new Map();
      this.queueDomains = /* @__PURE__ */ new WeakMap();
      this.controller = new AbortController();
      this.disposed = false;
      this.defaults = {
        maxPendingTasks: options.defaultMaxPendingTasks ?? 512,
        maxPendingWeight: options.defaultMaxPendingWeight ?? 2048,
        starvationMs: options.starvationMs ?? 2e3,
        now: options.now
      };
    }
    get signal() {
      return this.controller.signal;
    }
    createQueue(domain, options = {}) {
      this.assertActive();
      const id = this.uniqueDomainId(domain);
      const queue = new PriorityTaskQueue({
        maxPendingTasks: options.maxPendingTasks ?? this.defaults.maxPendingTasks,
        maxPendingWeight: options.maxPendingWeight ?? this.defaults.maxPendingWeight,
        starvationMs: options.starvationMs ?? this.defaults.starvationMs,
        now: options.now ?? this.defaults.now
      });
      this.domains.set(id, {
        telemetry: () => queue.stats,
        clear: (reason) => queue.clear(reason)
      });
      this.queueDomains.set(queue, id);
      return queue;
    }
    releaseQueue(queue, clear = true) {
      const id = this.queueDomains.get(queue);
      if (!id) return false;
      const registration = this.domains.get(id);
      if (clear) registration?.clear?.(new Error(`work domain "${id}" was released`));
      this.domains.delete(id);
      this.queueDomains.delete(queue);
      return true;
    }
    registerTelemetry(domain, telemetry) {
      this.assertActive();
      if (typeof telemetry !== "function") throw new TypeError("work-domain telemetry provider is required");
      const id = this.uniqueDomainId(domain);
      const registration = { telemetry };
      this.domains.set(id, registration);
      let attached = true;
      return () => {
        if (!attached) return;
        attached = false;
        if (this.domains.get(id) === registration) this.domains.delete(id);
      };
    }
    get stats() {
      const domains = {};
      const totals = {
        pendingTasks: 0,
        pendingWeight: 0,
        busyTasks: 0,
        oldestTaskAgeMs: 0,
        cancelledTasks: 0,
        shedTasks: 0,
        starvationPromotions: 0
      };
      for (const [id, registration] of this.domains) {
        let sample;
        try {
          sample = registration.telemetry() ?? {};
        } catch {
          sample = {};
        }
        const pendingTasks = nonNegativeTelemetry(sample.pendingTasks);
        const domain = {
          id,
          pendingTasks,
          pendingWeight: nonNegativeTelemetry(sample.pendingWeight, pendingTasks),
          busyTasks: nonNegativeTelemetry(sample.busyTasks),
          oldestTaskAgeMs: nonNegativeTelemetry(sample.oldestTaskAgeMs),
          cancelledTasks: nonNegativeTelemetry(sample.cancelledTasks),
          shedTasks: nonNegativeTelemetry(sample.shedTasks),
          starvationPromotions: nonNegativeTelemetry(sample.starvationPromotions)
        };
        domains[id] = domain;
        totals.pendingTasks += domain.pendingTasks;
        totals.pendingWeight += domain.pendingWeight;
        totals.busyTasks += domain.busyTasks;
        totals.oldestTaskAgeMs = Math.max(totals.oldestTaskAgeMs, domain.oldestTaskAgeMs);
        totals.cancelledTasks += domain.cancelledTasks;
        totals.shedTasks += domain.shedTasks;
        totals.starvationPromotions += domain.starvationPromotions;
      }
      return { disposed: this.disposed, domains, ...totals };
    }
    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      const error = new Error("RuntimeWorkCoordinator was disposed");
      error.name = "AbortError";
      this.controller.abort(error);
      for (const registration of this.domains.values()) registration.clear?.(error);
      this.domains.clear();
    }
    uniqueDomainId(domain) {
      if (typeof domain !== "string" || domain.trim().length === 0) {
        throw new TypeError("work domain must be a non-empty string");
      }
      if (!this.domains.has(domain)) return domain;
      let suffix = 2;
      while (this.domains.has(`${domain}#${suffix}`)) suffix += 1;
      return `${domain}#${suffix}`;
    }
    assertActive() {
      if (this.disposed) throw new Error("RuntimeWorkCoordinator has been disposed");
    }
  };

  // src/world/WorldWorkerProtocol.ts
  var WORLD_WORKER_PROTOCOL_VERSION = 5;

  // src/world/WorldSurfaceWorkerClient.ts
  function asError3(reason) {
    return reason instanceof Error ? reason : new Error(String(reason));
  }
  function reclaimedBuffers(value, byteLengths) {
    if (!Array.isArray(value) || !byteLengths || value.length !== byteLengths.length || value.some((buffer, index2) => !(buffer instanceof ArrayBuffer) || buffer.byteLength !== byteLengths[index2]) || new Set(value).size !== value.length) {
      throw new TypeError("surface worker returned invalid reclaimed window buffers");
    }
    return Object.freeze([...value]);
  }
  var WorldSurfaceWorkerClient = class {
    constructor(workerUrl, workerOptions = { type: "module" }) {
      this.pending = /* @__PURE__ */ new Map();
      this.nextRequestId = 1;
      this.disposed = false;
      this.handleMessage = (event) => {
        const data = event.data;
        if (!data || typeof data !== "object" || data.protocolVersion !== WORLD_WORKER_PROTOCOL_VERSION || !Number.isSafeInteger(data.id)) {
          this.fail(new TypeError("surface worker returned an invalid protocol envelope"));
          return;
        }
        const pending = this.pending.get(data.id);
        if (!pending) return;
        try {
          if (pending.kind === "surface") this.acceptSurface(pending, data);
          else this.acceptAuthority(pending, data);
          this.pending.delete(data.id);
        } catch (reason) {
          this.pending.delete(data.id);
          pending.reject(asError3(reason));
        }
      };
      this.handleWorkerError = (event) => {
        this.fail(event.error instanceof Error ? event.error : new Error(event.message));
      };
      this.handleMessageError = () => {
        this.fail(new Error("surface worker returned an unreadable message"));
      };
      this.worker = new Worker(workerUrl, workerOptions);
      this.worker.addEventListener("message", this.handleMessage);
      this.worker.addEventListener("error", this.handleWorkerError);
      this.worker.addEventListener("messageerror", this.handleMessageError);
    }
    generateSemanticChunk(options) {
      const key2 = canonicalizeSemanticChunkKey(options.descriptor, options.key);
      return this.request("semantic", { semanticKey: key2 }, {
        protocolVersion: WORLD_WORKER_PROTOCOL_VERSION,
        generatorVersion: WORLD_GENERATOR_VERSION,
        type: "generateSemanticChunk",
        options
      });
    }
    generateHydrologyRegion(options) {
      const key2 = canonicalizeHydrologyRegionKey(options.descriptor, options.key);
      return this.request("hydrology", { hydrologyKey: key2 }, {
        protocolVersion: WORLD_WORKER_PROTOCOL_VERSION,
        generatorVersion: WORLD_GENERATOR_VERSION,
        type: "generateHydrologyRegion",
        options
      });
    }
    compileSurfaceChunk(window2) {
      this.assertReady();
      assertTransferableEffectiveWindow(window2);
      const transferables = effectiveSurfaceWindowTransferables(window2);
      return this.request("surface", {
        dependencyKey: cloneSurfaceDependencyKey(window2.dependencyKey),
        windowBufferByteLengths: Object.freeze(transferables.map((buffer) => buffer.byteLength))
      }, {
        protocolVersion: WORLD_WORKER_PROTOCOL_VERSION,
        compilerRevision: SURFACE_COMPILER_REVISION,
        compileProfileVersion: SURFACE_COMPILE_PROFILE_VERSION,
        type: "compileSurfaceChunk",
        effectiveWindow: window2
      }, transferables);
    }
    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      this.worker.removeEventListener("message", this.handleMessage);
      this.worker.removeEventListener("error", this.handleWorkerError);
      this.worker.removeEventListener("messageerror", this.handleMessageError);
      this.worker.terminate();
      this.failPending(new Error("WorldSurfaceWorkerClient has been disposed"));
    }
    get isDisposed() {
      return this.disposed;
    }
    request(kind, expected, message, transferables = []) {
      this.assertReady();
      if (this.nextRequestId > Number.MAX_SAFE_INTEGER) {
        return Promise.reject(new RangeError("surface worker request identity space is exhausted"));
      }
      const id = this.nextRequestId++;
      return new Promise((resolve, reject) => {
        this.pending.set(id, { kind, resolve, reject, ...expected });
        try {
          this.worker.postMessage({ ...message, id }, [...transferables]);
        } catch (reason) {
          this.pending.delete(id);
          reject(asError3(reason));
        }
      });
    }
    acceptAuthority(pending, data) {
      if (data.generatorVersion !== WORLD_GENERATOR_VERSION) {
        throw new TypeError("surface worker generator identity mismatch");
      }
      if (data.error) return this.rejectRemote(pending, data.error);
      if (pending.kind === "semantic" && data.semanticChunk) {
        assertBaseSemanticChunk(data.semanticChunk);
        if (data.semanticChunk.key.chunkX !== pending.semanticKey?.chunkX || data.semanticChunk.key.chunkY !== pending.semanticKey?.chunkY) {
          throw new TypeError("surface worker returned a semantic chunk for another request");
        }
        pending.resolve(data.semanticChunk);
        return;
      }
      if (pending.kind === "hydrology" && data.hydrologyRegion) {
        assertHydrologyRegion(data.hydrologyRegion);
        if (data.hydrologyRegion.key.regionX !== pending.hydrologyKey?.regionX || data.hydrologyRegion.key.regionY !== pending.hydrologyKey?.regionY) {
          throw new TypeError("surface worker returned a hydrology region for another request");
        }
        pending.resolve(data.hydrologyRegion);
        return;
      }
      throw new TypeError(`surface worker returned the wrong ${pending.kind} response`);
    }
    acceptSurface(pending, data) {
      if (data.compilerRevision !== SURFACE_COMPILER_REVISION || data.compileProfileVersion !== SURFACE_COMPILE_PROFILE_VERSION) {
        throw new TypeError("surface worker compiler identity mismatch");
      }
      if (data.error) {
        const error = new SurfaceWorkerCompilationError(
          data.error.message,
          reclaimedBuffers(data.reclaimedWindowBuffers, pending.windowBufferByteLengths)
        );
        error.name = data.error.name;
        if (data.error.stack) error.stack = data.error.stack;
        pending.reject(error);
        return;
      }
      if (data.type !== "compileSurfaceChunk" || !data.surfaceChunk) {
        throw new TypeError("surface worker returned the wrong compilation response");
      }
      assertCompiledSurfaceChunk(data.surfaceChunk);
      if (!pending.dependencyKey || !surfaceDependencyKeysEqual(data.surfaceChunk.dependencyKey, pending.dependencyKey)) {
        throw new TypeError("surface worker returned a chunk for another dependency");
      }
      pending.resolve(Object.freeze({
        chunk: data.surfaceChunk,
        reclaimedWindowBuffers: reclaimedBuffers(
          data.reclaimedWindowBuffers,
          pending.windowBufferByteLengths
        )
      }));
    }
    rejectRemote(pending, remote) {
      if (typeof remote.name !== "string" || typeof remote.message !== "string") {
        throw new TypeError("surface worker returned an invalid error payload");
      }
      const error = new Error(remote.message);
      error.name = remote.name;
      if (remote.stack) error.stack = remote.stack;
      pending.reject(error);
    }
    fail(error) {
      this.failPending(error);
      this.dispose();
    }
    failPending(error) {
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
    }
    assertReady() {
      if (this.disposed) throw new Error("WorldSurfaceWorkerClient has been disposed");
    }
  };

  // src/world/semantic/generateHydrologyRegion.ts
  var EPSILON = 1e-9;
  var RIVER_DROP_WEIGHT_PER_MACRO_EDGE = 96;
  function riverNodeLevel(node, terminalLevel, maximumDrainageRank) {
    const available = 65535 - terminalLevel;
    if (available <= 0) return terminalLevel;
    const scale = available / (available + maximumDrainageRank * RIVER_DROP_WEIGHT_PER_MACRO_EDGE);
    return Math.min(65535, Math.max(terminalLevel, Math.round(
      terminalLevel + (node.drainageLevel - terminalLevel + node.drainageRank * RIVER_DROP_WEIGHT_PER_MACRO_EDGE) * scale
    )));
  }
  function validBoundsFor(descriptor, key2) {
    const origin = hydrologyRegionOrigin(key2);
    if (descriptor.topology === "infinite") {
      const minX = Math.max(0, Number.MIN_SAFE_INTEGER - origin.x);
      const minY = Math.max(0, Number.MIN_SAFE_INTEGER - origin.y);
      const maxXExclusive2 = Math.min(HYDROLOGY_REGION_SIZE, Number.MAX_SAFE_INTEGER - origin.x + 1);
      const maxYExclusive2 = Math.min(HYDROLOGY_REGION_SIZE, Number.MAX_SAFE_INTEGER - origin.y + 1);
      return Object.freeze({ minX, minY, maxXExclusive: maxXExclusive2, maxYExclusive: maxYExclusive2 });
    }
    if (origin.x >= descriptor.width || origin.y >= descriptor.height || origin.x < 0 || origin.y < 0) {
      throw new RangeError("hydrology region does not intersect the finite world bounds");
    }
    const maxXExclusive = Math.min(HYDROLOGY_REGION_SIZE, descriptor.width - origin.x);
    const maxYExclusive = Math.min(HYDROLOGY_REGION_SIZE, descriptor.height - origin.y);
    if (maxXExclusive === HYDROLOGY_REGION_SIZE && maxYExclusive === HYDROLOGY_REGION_SIZE) {
      return FULL_HYDROLOGY_REGION_BOUNDS;
    }
    return Object.freeze({ minX: 0, minY: 0, maxXExclusive, maxYExclusive });
  }
  function basinForRegion(key2) {
    const origin = hydrologyRegionOrigin(key2);
    return {
      basinX: Math.floor(origin.x / HYDROLOGY_INFINITE_BASIN_SIZE),
      basinY: Math.floor(origin.y / HYDROLOGY_INFINITE_BASIN_SIZE)
    };
  }
  function clipLine(start, end, rect) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    let startT = 0;
    let endT = 1;
    const tests = [
      [-dx, start.x - rect.minX],
      [dx, rect.maxX - start.x],
      [-dy, start.y - rect.minY],
      [dy, rect.maxY - start.y]
    ];
    for (const [p, q] of tests) {
      if (Math.abs(p) <= EPSILON) {
        if (q < 0) return void 0;
        continue;
      }
      const ratio = q / p;
      if (p < 0) startT = Math.max(startT, ratio);
      else endT = Math.min(endT, ratio);
      if (startT > endT) return void 0;
    }
    if (endT - startT <= EPSILON) return void 0;
    return {
      start: { x: start.x + dx * startT, y: start.y + dy * startT },
      end: { x: start.x + dx * endT, y: start.y + dy * endT },
      startT,
      endT
    };
  }
  function shortestDelta(delta, period, wraps) {
    if (!wraps) return delta;
    if (delta > period / 2) return delta - period;
    if (delta < -period / 2) return delta + period;
    return delta;
  }
  function quantizeLocal(value, origin) {
    const quantized = Math.round((value - origin) * HYDROLOGY_COORDINATE_SCALE);
    if (quantized < 0 || quantized > HYDROLOGY_REGION_SIZE * HYDROLOGY_COORDINATE_SCALE) {
      throw new RangeError("clipped hydrology coordinate lies outside its region");
    }
    return quantized;
  }
  function interpolateUint16(upstream, downstream, amount) {
    return Math.max(0, Math.min(65535, Math.floor(upstream + (downstream - upstream) * amount + 0.5)));
  }
  function riverWidth(dischargeClass) {
    return Math.min(255, 12 + dischargeClass * 8);
  }
  function normalizedFlow(start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (length <= EPSILON) throw new TypeError("hydrology edge has zero length");
    return [Math.round(dx / length * 127), Math.round(dy / length * 127)];
  }
  function pointSide(point, rect, flow) {
    const west = Math.abs(point.x - rect.minX) <= EPSILON;
    const east = Math.abs(point.x - rect.maxX) <= EPSILON;
    const north = Math.abs(point.y - rect.minY) <= EPSILON;
    const south = Math.abs(point.y - rect.maxY) <= EPSILON;
    if ((west || east) && (north || south)) {
      if (Math.abs(flow[0]) >= Math.abs(flow[1])) return west ? "west" : "east";
      return north ? "north" : "south";
    }
    if (west) return "west";
    if (east) return "east";
    if (north) return "north";
    if (south) return "south";
    throw new TypeError("clipped river endpoint is not on a region boundary");
  }
  function canonicalCrossingCoordinate(value, period, wraps) {
    const canonical = wraps ? value - Math.floor(value / period) * period : value;
    return canonical.toFixed(8);
  }
  function endpointAtNode(node, incomingRiverEdges, terminalNodes, edge, isExit) {
    let kind;
    if (isExit) kind = terminalNodes.has(node.nodeId) ? "mouth" : "confluence";
    else kind = (incomingRiverEdges.get(node.nodeId) ?? 0) === 0 ? "source" : "confluence";
    return Object.freeze({
      kind,
      connectionId: createStableHydrologyId(
        kind === "mouth" ? "river-mouth-node" : "river-node",
        kind === "mouth" ? [edge.riverId, node.nodeId, edge.edgeId] : [edge.riverId, node.nodeId]
      )
    });
  }
  function freezeBody(bodyId, kind, profileIndex) {
    return Object.freeze({ bodyId, kind, profileIndex });
  }
  function clipPolygonToRect(points, rect) {
    const boundaries = ["west", "east", "north", "south"];
    let output = [...points];
    for (const boundary of boundaries) {
      const input = output;
      output = [];
      const inside = (point) => {
        if (boundary === "west") return point.x >= rect.minX - EPSILON;
        if (boundary === "east") return point.x <= rect.maxX + EPSILON;
        if (boundary === "north") return point.y >= rect.minY - EPSILON;
        return point.y <= rect.maxY + EPSILON;
      };
      const intersection = (start, end) => {
        if (boundary === "west" || boundary === "east") {
          const x = boundary === "west" ? rect.minX : rect.maxX;
          const amount2 = (x - start.x) / (end.x - start.x);
          return { x, y: start.y + (end.y - start.y) * amount2 };
        }
        const y = boundary === "north" ? rect.minY : rect.maxY;
        const amount = (y - start.y) / (end.y - start.y);
        return { x: start.x + (end.x - start.x) * amount, y };
      };
      for (let index2 = 0; index2 < input.length; index2 += 1) {
        const start = input[(index2 + input.length - 1) % input.length];
        const end = input[index2];
        const startInside = inside(start);
        const endInside = inside(end);
        if (endInside) {
          if (!startInside) output.push(intersection(start, end));
          output.push(end);
        } else if (startInside) {
          output.push(intersection(start, end));
        }
      }
      if (output.length === 0) break;
    }
    return output;
  }
  function lakeBoundary(node, localOrigin, rect) {
    const radius = Math.min(12, 6 + node.dischargeClass);
    const circle = [];
    for (let index2 = 0; index2 < 12; index2 += 1) {
      const angle = index2 / 12 * Math.PI * 2;
      circle.push({ x: node.x + Math.cos(angle) * radius, y: node.y + Math.sin(angle) * radius });
    }
    const clipped = clipPolygonToRect(circle, rect);
    if (clipped.length < 3) return void 0;
    const points = new Int16Array(clipped.length * 2);
    for (let index2 = 0; index2 < clipped.length; index2 += 1) {
      points[index2 * 2] = quantizeLocal(clipped[index2].x, localOrigin.x);
      points[index2 * 2 + 1] = quantizeLocal(clipped[index2].y, localOrigin.y);
    }
    return points;
  }
  function shiftedCopies(graph) {
    const shiftsX = graph.wrapX ? [-graph.width, 0, graph.width] : [0];
    const shiftsY = graph.wrapY ? [-graph.height, 0, graph.height] : [0];
    const shifts = [];
    for (const x of shiftsX) for (const y of shiftsY) shifts.push({ x, y });
    return shifts;
  }
  function compileRegionFromGraph(graph, key2, bounds) {
    const origin = hydrologyRegionOrigin(key2);
    const rect = {
      minX: origin.x + bounds.minX,
      minY: origin.y + bounds.minY,
      maxX: origin.x + bounds.maxXExclusive,
      maxY: origin.y + bounds.maxYExclusive
    };
    const nodeById = new Map(graph.nodes.map((node) => [node.nodeId, node]));
    const terminalByNode = new Map(graph.terminals.map((terminal) => [terminal.nodeId, terminal]));
    const terminalLevelByBody = new Map(graph.terminals.map((terminal) => [terminal.bodyId, terminal.level]));
    const maximumDrainageRank = graph.nodes.reduce(
      (maximum, node) => Math.max(maximum, node.drainageRank),
      0
    );
    const terminalNodes = new Set(terminalByNode.keys());
    const riverEdges = graph.edges.filter((edge) => edge.dischargeClass >= HYDROLOGY_MIN_RIVER_DISCHARGE_CLASS);
    const incomingRiverEdges = /* @__PURE__ */ new Map();
    for (const edge of riverEdges) {
      incomingRiverEdges.set(edge.downstreamNodeId, (incomingRiverEdges.get(edge.downstreamNodeId) ?? 0) + 1);
    }
    const boundaryPorts = [];
    const rivers = [];
    const lakes = [];
    const mouths = [];
    const bodies = /* @__PURE__ */ new Map();
    bodies.set(OCEAN_BODY_ID, freezeBody(OCEAN_BODY_ID, "ocean", 0));
    const shifts = shiftedCopies(graph);
    for (const edge of riverEdges) {
      const upstream = nodeById.get(edge.upstreamNodeId);
      const downstream = nodeById.get(edge.downstreamNodeId);
      if (!upstream || !downstream) throw new Error("drainage edge references a missing node");
      const dx = shortestDelta(downstream.x - upstream.x, graph.width, graph.wrapX);
      const dy = shortestDelta(downstream.y - upstream.y, graph.height, graph.wrapY);
      const unshiftedEnd = { x: upstream.x + dx, y: upstream.y + dy };
      const flow = normalizedFlow(upstream, unshiftedEnd);
      let piece = 0;
      for (const shift of shifts) {
        const start = { x: upstream.x + shift.x, y: upstream.y + shift.y };
        const end = { x: unshiftedEnd.x + shift.x, y: unshiftedEnd.y + shift.y };
        const clipped = clipLine(start, end, rect);
        if (!clipped) continue;
        bodies.set(edge.riverId, freezeBody(edge.riverId, "river", Math.min(255, edge.dischargeClass)));
        const controlPoints = new Int16Array([
          quantizeLocal(clipped.start.x, origin.x),
          quantizeLocal(clipped.start.y, origin.y),
          quantizeLocal(clipped.end.x, origin.x),
          quantizeLocal(clipped.end.y, origin.y)
        ]);
        const width = riverWidth(edge.dischargeClass);
        const widthProfile = new Uint8Array([width, width]);
        const terminalLevel = terminalLevelByBody.get(edge.terminalBodyId);
        if (terminalLevel === void 0) throw new Error("drainage edge references a missing terminal body");
        const upstreamLevel = riverNodeLevel(upstream, terminalLevel, maximumDrainageRank);
        const downstreamLevel = riverNodeLevel(downstream, terminalLevel, maximumDrainageRank);
        const levelProfile = new Uint16Array([
          interpolateUint16(upstreamLevel, downstreamLevel, clipped.startT),
          interpolateUint16(upstreamLevel, downstreamLevel, clipped.endT)
        ]);
        const makeBoundaryEndpoint = (point, direction, level) => {
          const side = pointSide(point, rect, flow);
          const connectionId = createStableHydrologyId("river-crossing", [
            edge.edgeId,
            canonicalCrossingCoordinate(point.x, graph.width, graph.wrapX),
            canonicalCrossingCoordinate(point.y, graph.height, graph.wrapY)
          ]);
          const port = Object.freeze({
            portId: createStableHydrologyId("river-port", [
              connectionId,
              key2.regionX,
              key2.regionY,
              side,
              direction,
              piece
            ]),
            connectionId,
            edgeId: edge.edgeId,
            riverId: edge.riverId,
            bodyId: edge.riverId,
            side,
            x: quantizeLocal(point.x, origin.x),
            y: quantizeLocal(point.y, origin.y),
            flow: direction,
            flowX: flow[0],
            flowY: flow[1],
            width,
            level,
            dischargeClass: edge.dischargeClass
          });
          boundaryPorts.push(port);
          return Object.freeze({ kind: "boundary", connectionId });
        };
        const entry = clipped.startT > EPSILON ? makeBoundaryEndpoint(clipped.start, "in", levelProfile[0]) : endpointAtNode(upstream, incomingRiverEdges, terminalNodes, edge, false);
        const exit = clipped.endT < 1 - EPSILON ? makeBoundaryEndpoint(clipped.end, "out", levelProfile[1]) : endpointAtNode(downstream, incomingRiverEdges, terminalNodes, edge, true);
        const segment = Object.freeze({
          riverId: edge.riverId,
          segmentId: createStableHydrologyId("river-segment", [
            edge.edgeId,
            key2.regionX,
            key2.regionY,
            piece,
            controlPoints[0],
            controlPoints[1],
            controlPoints[2],
            controlPoints[3]
          ]),
          edgeId: edge.edgeId,
          controlPoints,
          widthProfile,
          levelProfile,
          dischargeClass: edge.dischargeClass,
          entry,
          exit
        });
        rivers.push(segment);
        if (exit.kind === "mouth") {
          const terminal = terminalByNode.get(downstream.nodeId);
          if (!terminal) throw new Error("river mouth resolved an unknown terminal");
          bodies.set(terminal.bodyId, freezeBody(
            terminal.bodyId,
            terminal.kind,
            terminal.kind === "ocean" ? 0 : 1
          ));
          mouths.push(Object.freeze({
            mouthId: exit.connectionId,
            riverId: edge.riverId,
            targetBodyId: terminal.bodyId,
            x: controlPoints[controlPoints.length - 2],
            y: controlPoints[controlPoints.length - 1],
            width,
            level: levelProfile[levelProfile.length - 1]
          }));
        }
        piece += 1;
      }
    }
    for (const terminal of graph.terminals) {
      if (terminal.kind !== "lake") continue;
      const node = nodeById.get(terminal.nodeId);
      if (!node) throw new Error("lake terminal references a missing node");
      for (const shift of shifts) {
        const point = { x: node.x + shift.x, y: node.y + shift.y };
        const shiftedNode = { ...node, x: point.x, y: point.y };
        const boundaryPoints = lakeBoundary(shiftedNode, origin, rect);
        if (!boundaryPoints) continue;
        const lakeId = createStableHydrologyId("lake-feature", [
          terminal.bodyId,
          key2.regionX,
          key2.regionY,
          shift.x,
          shift.y
        ]);
        bodies.set(terminal.bodyId, freezeBody(terminal.bodyId, "lake", 1));
        lakes.push(Object.freeze({
          lakeId,
          bodyId: terminal.bodyId,
          boundaryPoints,
          level: terminal.level,
          profileIndex: 1
        }));
      }
    }
    const region = Object.freeze({
      key: Object.freeze({ ...key2 }),
      revision: HYDROLOGY_REGION_REVISION,
      validBounds: bounds,
      boundaryPorts: Object.freeze(boundaryPorts.sort((first, second) => first.portId.localeCompare(second.portId))),
      rivers: Object.freeze(rivers.sort((first, second) => first.segmentId.localeCompare(second.segmentId))),
      lakes: Object.freeze(lakes.sort((first, second) => first.lakeId.localeCompare(second.lakeId))),
      mouths: Object.freeze(mouths.sort((first, second) => first.mouthId.localeCompare(second.mouthId))),
      bodies: Object.freeze([...bodies.values()].sort((first, second) => first.bodyId.localeCompare(second.bodyId)))
    });
    assertHydrologyRegion(region);
    return region;
  }
  var HydrologyRegionGenerator = class {
    constructor(descriptor, options = {}) {
      this.descriptor = descriptor;
      assertWorldDescriptorV2(descriptor);
      this.macroHeightSource = options.macroHeightSource ?? (descriptor.sourceKind === "static" ? (() => {
        throw new TypeError("static hydrology requires an immutable macro height source");
      })() : createProceduralMacroHeightSource(descriptor));
    }
    generate(key2) {
      const canonicalKey = canonicalizeHydrologyRegionKey(this.descriptor, key2);
      const bounds = validBoundsFor(this.descriptor, canonicalKey);
      const basin = this.descriptor.topology === "infinite" ? basinForRegion(canonicalKey) : void 0;
      const graphKey = basin ? `${basin.basinX},${basin.basinY}` : "finite";
      if (!this.graph || this.graphKey !== graphKey) {
        this.graph = buildMacroDrainageGraph({
          descriptor: this.descriptor,
          basin,
          macroHeightSource: this.macroHeightSource
        });
        this.graphKey = graphKey;
      }
      return compileRegionFromGraph(this.graph, canonicalKey, bounds);
    }
  };
  function generateHydrologyRegion(options) {
    if (!options || typeof options !== "object") {
      throw new TypeError("hydrology region generation options are required");
    }
    return new HydrologyRegionGenerator(options.descriptor).generate(options.key);
  }

  // src/world/semantic/compileStaticWorldAuthority.ts
  function assertStaticFields(input) {
    if (!input || typeof input !== "object" || Object.getOwnPropertyNames(input).some((name) => ![
      "width",
      "height",
      "topology",
      "sourceContentHash",
      "substrateClass",
      "macroHeight",
      "biomeWeights",
      "climate",
      "vegetationDensity",
      "vegetationProfile",
      "hydrologyRegions"
    ].includes(name)) || !Number.isSafeInteger(input.width) || input.width <= 0 || !Number.isSafeInteger(input.height) || input.height <= 0 || input.width > Number.MAX_SAFE_INTEGER / input.height || input.topology !== "bounded" && input.topology !== "toroidal" || !/^[0-9a-f]{64}$/.test(input.sourceContentHash) || !Array.isArray(input.hydrologyRegions)) {
      throw new TypeError("static semantic authority header is invalid");
    }
    const count = input.width * input.height;
    if (!(input.substrateClass instanceof Uint8Array) || input.substrateClass.length !== count || !(input.macroHeight instanceof Uint16Array) || input.macroHeight.length !== count || !(input.biomeWeights instanceof Uint8Array) || input.biomeWeights.length !== count * 4 || !(input.climate instanceof Uint8Array) || input.climate.length !== count * 2 || !(input.vegetationDensity instanceof Uint8Array) || input.vegetationDensity.length !== count || !(input.vegetationProfile instanceof Uint8Array) || input.vegetationProfile.length !== count) {
      throw new TypeError("static semantic authority SoA lengths are invalid");
    }
    for (let index2 = 0; index2 < count; index2 += 1) {
      const biomeOffset = index2 * 4;
      if (input.biomeWeights[biomeOffset] + input.biomeWeights[biomeOffset + 1] + input.biomeWeights[biomeOffset + 2] + input.biomeWeights[biomeOffset + 3] !== 255) {
        throw new TypeError("static semantic biome weights must sum to 255");
      }
      if (input.macroHeight[index2] < HYDROLOGY_SEA_LEVEL && input.substrateClass[index2] !== 0 /* Sediment */) {
        throw new TypeError("static ocean height and substrate authority are inconsistent");
      }
    }
  }
  function compileSemanticChunks(input) {
    const chunks = [];
    const chunkColumns = Math.ceil(input.width / WORLD_SEMANTIC_CHUNK_SIZE);
    const chunkRows = Math.ceil(input.height / WORLD_SEMANTIC_CHUNK_SIZE);
    for (let chunkX = 0; chunkX < chunkColumns; chunkX += 1) {
      for (let chunkY = 0; chunkY < chunkRows; chunkY += 1) {
        const substrateClass = new Uint8Array(WORLD_SEMANTIC_CHUNK_TILE_COUNT);
        const macroHeight = new Uint16Array(WORLD_SEMANTIC_CHUNK_TILE_COUNT);
        const biomeWeights = new Uint8Array(WORLD_SEMANTIC_CHUNK_TILE_COUNT * 4);
        const climate = new Uint8Array(WORLD_SEMANTIC_CHUNK_TILE_COUNT * 2);
        const vegetationDensity = new Uint8Array(WORLD_SEMANTIC_CHUNK_TILE_COUNT);
        const vegetationProfile = new Uint8Array(WORLD_SEMANTIC_CHUNK_TILE_COUNT);
        const maxXExclusive = Math.min(
          WORLD_SEMANTIC_CHUNK_SIZE,
          input.width - chunkX * WORLD_SEMANTIC_CHUNK_SIZE
        );
        const maxYExclusive = Math.min(
          WORLD_SEMANTIC_CHUNK_SIZE,
          input.height - chunkY * WORLD_SEMANTIC_CHUNK_SIZE
        );
        for (let localX = 0; localX < maxXExclusive; localX += 1) {
          const worldX = chunkX * WORLD_SEMANTIC_CHUNK_SIZE + localX;
          for (let localY = 0; localY < maxYExclusive; localY += 1) {
            const sourceIndex = worldX * input.height + chunkY * WORLD_SEMANTIC_CHUNK_SIZE + localY;
            const targetIndex = semanticChunkLocalIndex(localX, localY);
            substrateClass[targetIndex] = input.substrateClass[sourceIndex];
            macroHeight[targetIndex] = input.macroHeight[sourceIndex];
            biomeWeights.set(input.biomeWeights.subarray(sourceIndex * 4, sourceIndex * 4 + 4), targetIndex * 4);
            climate.set(input.climate.subarray(sourceIndex * 2, sourceIndex * 2 + 2), targetIndex * 2);
            vegetationDensity[targetIndex] = input.vegetationDensity[sourceIndex];
            vegetationProfile[targetIndex] = input.vegetationProfile[sourceIndex];
          }
        }
        const chunk = Object.freeze({
          key: Object.freeze({ chunkX, chunkY }),
          revision: BASE_SEMANTIC_CHUNK_REVISION,
          validBounds: Object.freeze({ minX: 0, minY: 0, maxXExclusive, maxYExclusive }),
          substrateClass,
          macroHeight,
          biomeWeights,
          climate,
          vegetationDensity,
          vegetationProfile
        });
        assertBaseSemanticChunk(chunk);
        chunks.push(chunk);
      }
    }
    return Object.freeze(chunks);
  }
  function validateHydrologyCoverage(input) {
    const required = /* @__PURE__ */ new Map();
    for (let regionX = 0; regionX < Math.ceil(input.width / HYDROLOGY_REGION_SIZE); regionX += 1) {
      for (let regionY = 0; regionY < Math.ceil(input.height / HYDROLOGY_REGION_SIZE); regionY += 1) {
        required.set(`${regionX},${regionY}`, Object.freeze({ regionX, regionY }));
      }
    }
    const regions = [...input.hydrologyRegions].sort((first, second) => first.key.regionX - second.key.regionX || first.key.regionY - second.key.regionY);
    const seen = /* @__PURE__ */ new Set();
    for (const region of regions) {
      assertHydrologyRegion(region);
      const serialized = `${region.key.regionX},${region.key.regionY}`;
      if (!required.has(serialized) || seen.has(serialized)) {
        throw new TypeError("static hydrology regions do not exactly cover the world");
      }
      seen.add(serialized);
      const expectedMaxX = Math.min(
        HYDROLOGY_REGION_SIZE,
        input.width - region.key.regionX * HYDROLOGY_REGION_SIZE
      );
      const expectedMaxY = Math.min(
        HYDROLOGY_REGION_SIZE,
        input.height - region.key.regionY * HYDROLOGY_REGION_SIZE
      );
      if (region.validBounds.minX !== 0 || region.validBounds.minY !== 0 || region.validBounds.maxXExclusive !== expectedMaxX || region.validBounds.maxYExclusive !== expectedMaxY) {
        throw new TypeError("static hydrology region bounds do not match the world topology");
      }
    }
    if (seen.size !== required.size) {
      throw new TypeError("static hydrology regions do not exactly cover the world");
    }
    return Object.freeze(regions);
  }
  function compileStaticWorldAuthority(input) {
    assertStaticFields(input);
    const descriptor = createWorldDescriptorV2({
      sourceKind: "static",
      sourceContentHash: input.sourceContentHash,
      topology: { kind: input.topology, width: input.width, height: input.height }
    });
    const semanticChunks = compileSemanticChunks(input);
    const hydrologyRegions = validateHydrologyCoverage(input);
    const source = new StaticWorldAuthoritySource({ descriptor, semanticChunks, hydrologyRegions });
    return Object.freeze({ descriptor, source, semanticChunks, hydrologyRegions });
  }

  // src/world/semantic/SemanticNavigationIndex.ts
  var WORLD_SEMANTIC_NAVIGATION_FORMAT_VERSION = 3;
  function keyString6(key2) {
    return `${key2.chunkX},${key2.chunkY}`;
  }
  function assertKey(key2) {
    if (!key2 || !Number.isSafeInteger(key2.chunkX) || !Number.isSafeInteger(key2.chunkY)) {
      throw new TypeError("semantic navigation chunk key is invalid");
    }
  }
  function index(localX, localY) {
    return localX * WORLD_SEMANTIC_CHUNK_SIZE + localY;
  }
  function dependencyKey(snapshot) {
    return Object.freeze({
      worldIdentity: snapshot.worldIdentity,
      semanticChunks: Object.freeze(snapshot.semanticChunks.map((chunk) => Object.freeze({
        chunkX: chunk.base.key.chunkX,
        chunkY: chunk.base.key.chunkY,
        baseRevision: chunk.base.revision,
        deltaRevision: chunk.delta?.revision ?? 0
      }))),
      hydrologyRegions: Object.freeze(snapshot.hydrologyRegions.map((region) => Object.freeze({
        regionX: region.base.key.regionX,
        regionY: region.base.key.regionY,
        baseRevision: region.base.revision,
        features: Object.freeze(region.featureDeltas.map((feature) => Object.freeze({
          featureId: feature.featureId,
          revision: feature.revision
        })))
      })))
    });
  }
  function dependencyKeysEqual(first, second) {
    if (first.worldIdentity !== second.worldIdentity || first.semanticChunks.length !== second.semanticChunks.length || first.hydrologyRegions.length !== second.hydrologyRegions.length) return false;
    for (let index2 = 0; index2 < first.semanticChunks.length; index2 += 1) {
      const left = first.semanticChunks[index2];
      const right = second.semanticChunks[index2];
      if (left.chunkX !== right.chunkX || left.chunkY !== right.chunkY || left.baseRevision !== right.baseRevision || left.deltaRevision !== right.deltaRevision) return false;
    }
    for (let index2 = 0; index2 < first.hydrologyRegions.length; index2 += 1) {
      const left = first.hydrologyRegions[index2];
      const right = second.hydrologyRegions[index2];
      if (left.regionX !== right.regionX || left.regionY !== right.regionY || left.baseRevision !== right.baseRevision || left.features.length !== right.features.length) return false;
      for (let featureIndex = 0; featureIndex < left.features.length; featureIndex += 1) {
        const leftFeature = left.features[featureIndex];
        const rightFeature = right.features[featureIndex];
        if (leftFeature.featureId !== rightFeature.featureId || leftFeature.revision !== rightFeature.revision) return false;
      }
    }
    return true;
  }
  function portalRuns(passable, costs, side) {
    const values = [];
    const tileIndex = (offset) => {
      if (side === "west") return index(0, offset);
      if (side === "east") return index(WORLD_SEMANTIC_CHUNK_SIZE - 1, offset);
      if (side === "north") return index(offset, 0);
      return index(offset, WORLD_SEMANTIC_CHUNK_SIZE - 1);
    };
    let start = -1;
    let minimumCost = 65535;
    for (let offset = 0; offset <= WORLD_SEMANTIC_CHUNK_SIZE; offset += 1) {
      const open = offset < WORLD_SEMANTIC_CHUNK_SIZE && passable[tileIndex(offset)] !== 0;
      if (open) {
        if (start < 0) start = offset;
        minimumCost = Math.min(minimumCost, costs[tileIndex(offset)]);
      } else if (start >= 0) {
        values.push(Object.freeze({ side, start, end: offset - 1, minimumCost }));
        start = -1;
        minimumCost = 65535;
      }
    }
    return Object.freeze(values);
  }
  var SemanticNavigationIndex = class {
    constructor(options) {
      this.chunkSize = WORLD_SEMANTIC_CHUNK_SIZE;
      this.cache = /* @__PURE__ */ new Map();
      this.cacheBytes = 0;
      this.disposed = false;
      if (!options || !options.authority || typeof options.authority.captureNavigationChunk !== "function" || typeof options.authority.sampleHydrology !== "function" || !Number.isSafeInteger(options.cacheBudgetBytes) || options.cacheBudgetBytes <= 0) {
        throw new TypeError("SemanticNavigationIndex options are invalid");
      }
      this.authority = options.authority;
      this.cacheBudgetBytes = options.cacheBudgetBytes;
      this.maximumSlope = options.maximumSlope ?? 0.22;
      if (!Number.isFinite(this.maximumSlope) || this.maximumSlope <= 0 || this.maximumSlope > 1) {
        throw new RangeError("semantic navigation maximumSlope must be in (0, 1]");
      }
    }
    async getSummary(key2) {
      this.assertReady();
      assertKey(key2);
      const serialized = keyString6(key2);
      const cached = this.cache.get(serialized);
      const snapshot = await this.authority.captureNavigationChunk(key2);
      const currentDependency = dependencyKey(snapshot);
      if (cached && dependencyKeysEqual(cached.dependencyKey, currentDependency)) {
        this.cache.delete(serialized);
        const current = cached.effectiveRevision === snapshot.effectiveRevision ? cached : Object.freeze({
          ...cached,
          effectiveRevision: snapshot.effectiveRevision
        });
        this.cache.set(serialized, current);
        return current;
      }
      if (cached) {
        this.cache.delete(serialized);
        this.cacheBytes -= cached.byteLength;
      }
      const summary = this.compile(key2, snapshot);
      if (summary.byteLength > this.cacheBudgetBytes) {
        throw new RangeError("semantic navigation summary exceeds its cache budget");
      }
      while (this.cacheBytes + summary.byteLength > this.cacheBudgetBytes) {
        const oldest = this.cache.entries().next().value;
        if (!oldest) break;
        this.cache.delete(oldest[0]);
        this.cacheBytes -= oldest[1].byteLength;
      }
      this.cache.set(serialized, summary);
      this.cacheBytes += summary.byteLength;
      return summary;
    }
    applyChangeSet(changeSet) {
      this.assertReady();
      let invalidated = 0;
      for (const chunk of changeSet.navigationChunks) {
        const cached = this.cache.get(keyString6(chunk.key));
        if (!cached) continue;
        this.cache.delete(keyString6(chunk.key));
        this.cacheBytes -= cached.byteLength;
        invalidated += 1;
      }
      return invalidated;
    }
    dispose() {
      this.disposed = true;
      this.cache.clear();
      this.cacheBytes = 0;
    }
    get stats() {
      return Object.freeze({ entries: this.cache.size, bytes: this.cacheBytes, budgetBytes: this.cacheBudgetBytes });
    }
    compile(key2, snapshot) {
      const passable = new Uint8Array(WORLD_SEMANTIC_CHUNK_SIZE * WORLD_SEMANTIC_CHUNK_SIZE);
      const movementCost = new Uint16Array(passable.length);
      const originX = key2.chunkX * WORLD_SEMANTIC_CHUNK_SIZE;
      const originY = key2.chunkY * WORLD_SEMANTIC_CHUNK_SIZE;
      for (let localX = 0; localX < WORLD_SEMANTIC_CHUNK_SIZE; localX += 1) {
        for (let localY = 0; localY < WORLD_SEMANTIC_CHUNK_SIZE; localY += 1) {
          const tile = snapshot.getTile(originX + localX, originY + localY);
          const east = snapshot.getTile(originX + Math.min(localX + 1, WORLD_SEMANTIC_CHUNK_SIZE - 1), originY + localY);
          const south = snapshot.getTile(originX + localX, originY + Math.min(localY + 1, WORLD_SEMANTIC_CHUNK_SIZE - 1));
          const slope = Math.max(Math.abs(tile.macroHeight - east.macroHeight), Math.abs(tile.macroHeight - south.macroHeight));
          const water = this.authority.sampleHydrology(snapshot, originX + localX, originY + localY);
          const tileIndex = index(localX, localY);
          const open = slope <= this.maximumSlope && water.coverage < 128;
          passable[tileIndex] = open ? 1 : 0;
          movementCost[tileIndex] = open ? Math.min(65535, 256 + Math.round(slope * 4096) + (tile.substrateClass === 3 ? 192 : 0)) : 65535;
        }
      }
      const portals = Object.freeze(["west", "east", "north", "south"].flatMap((side) => portalRuns(passable, movementCost, side)));
      return Object.freeze({
        formatVersion: WORLD_SEMANTIC_NAVIGATION_FORMAT_VERSION,
        key: Object.freeze({ ...key2 }),
        effectiveRevision: snapshot.effectiveRevision,
        dependencyKey: dependencyKey(snapshot),
        passable,
        movementCost,
        portals,
        byteLength: passable.byteLength + movementCost.byteLength + portals.length * 16
      });
    }
    assertReady() {
      if (this.disposed) throw new Error("SemanticNavigationIndex has been disposed");
    }
  };

  // src/world/WorldSurfaceWorkerPool.ts
  var LANE_ORDER = Object.freeze({
    critical: 0,
    interactive: 1,
    visible: 2,
    prefetch: 3,
    background: 4
  });
  function defaultPoolSize(maxWorkers) {
    const hardware = typeof navigator === "undefined" ? 4 : navigator.hardwareConcurrency || 4;
    return Math.max(1, Math.min(maxWorkers, hardware - 1));
  }
  function abortError2() {
    if (typeof DOMException !== "undefined") return new DOMException("surface worker task was aborted", "AbortError");
    const error = new Error("surface worker task was aborted");
    error.name = "AbortError";
    return error;
  }
  function asError4(reason) {
    return reason instanceof Error ? reason : new Error(String(reason));
  }
  var WorldSurfaceWorkerPool = class {
    constructor(workerUrl, options = {}) {
      this.queue = [];
      this.nextSequence = 1;
      this.completed = 0;
      this.rejected = 0;
      this.restarts = 0;
      this.disposed = false;
      const maxWorkers = options.maxWorkers ?? 8;
      const size = options.size ?? defaultPoolSize(maxWorkers);
      this.maxQueuedTasks = options.maxQueuedTasks ?? 512;
      if (!Number.isInteger(maxWorkers) || maxWorkers <= 0 || !Number.isInteger(size) || size <= 0 || size > maxWorkers || !Number.isSafeInteger(this.maxQueuedTasks) || this.maxQueuedTasks <= 0) {
        throw new RangeError("WorldSurfaceWorkerPool limits are invalid");
      }
      this.workerUrl = workerUrl;
      this.workerOptions = options.workerOptions ?? { type: "module" };
      this.factory = options.clientFactory ?? (() => new WorldSurfaceWorkerClient(this.workerUrl, this.workerOptions));
      this.slots = Array.from({ length: size }, () => ({ worker: this.factory() }));
    }
    generateSemanticChunk(options, request = {}) {
      return this.enqueue("semantic", options, request);
    }
    generateHydrologyRegion(options, request = {}) {
      return this.enqueue("hydrology", options, request);
    }
    compileSurfaceChunk(window2, request = {}) {
      return this.enqueue("surface", window2, request);
    }
    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      const error = new Error("WorldSurfaceWorkerPool has been disposed");
      for (const task of this.queue.splice(0)) this.rejectTask(task, error);
      for (const slot of this.slots) {
        if (slot.task) this.rejectTask(slot.task, error);
        slot.worker.dispose();
        slot.task = void 0;
      }
    }
    get stats() {
      return Object.freeze({
        state: this.disposed ? "disposed" : "ready",
        workers: this.slots.length,
        busyWorkers: this.slots.filter((slot) => slot.task).length,
        queuedTasks: this.queue.length,
        queuedSemanticChunks: this.queue.filter((task) => task.kind === "semantic").length,
        queuedHydrologyRegions: this.queue.filter((task) => task.kind === "hydrology").length,
        queuedSurfaceChunks: this.queue.filter((task) => task.kind === "surface").length,
        completedTasks: this.completed,
        rejectedTasks: this.rejected,
        workerRestarts: this.restarts
      });
    }
    enqueue(kind, input, options) {
      if (this.disposed) return Promise.reject(new Error("WorldSurfaceWorkerPool has been disposed"));
      const lane = options.lane ?? "visible";
      const priority = options.priority ?? 0;
      if (!(lane in LANE_ORDER) || !Number.isFinite(priority) || options.signal !== void 0 && typeof options.signal.addEventListener !== "function") {
        return Promise.reject(new TypeError("surface worker request options are invalid"));
      }
      if (options.signal?.aborted) return Promise.reject(abortError2());
      if (this.queue.length >= this.maxQueuedTasks && !this.slots.some((slot) => !slot.task)) {
        this.rejected += 1;
        return Promise.reject(new RangeError("surface worker queue capacity is exhausted"));
      }
      return new Promise((resolve, reject) => {
        const task = {
          sequence: this.nextSequence++,
          kind,
          input,
          priority,
          lane,
          signal: options.signal,
          resolve,
          reject,
          running: false,
          settled: false,
          attempts: 0
        };
        task.abort = () => {
          if (task.settled || task.running) return;
          const index2 = this.queue.indexOf(task);
          if (index2 >= 0) this.queue.splice(index2, 1);
          this.rejectTask(task, abortError2());
        };
        options.signal?.addEventListener("abort", task.abort, { once: true });
        this.queue.push(task);
        this.sortQueue();
        this.dispatch();
      });
    }
    sortQueue() {
      this.queue.sort((first, second) => LANE_ORDER[first.lane] - LANE_ORDER[second.lane] || first.priority - second.priority || first.sequence - second.sequence);
    }
    dispatch() {
      if (this.disposed) return;
      for (const slot of this.slots) {
        if (slot.task || this.queue.length === 0) continue;
        const task = this.queue.shift();
        task.running = true;
        task.attempts += 1;
        slot.task = task;
        let promise;
        if (task.kind === "semantic") {
          promise = slot.worker.generateSemanticChunk(task.input);
        } else if (task.kind === "hydrology") {
          promise = slot.worker.generateHydrologyRegion(task.input);
        } else {
          promise = slot.worker.compileSurfaceChunk(task.input);
        }
        void promise.then((value) => this.complete(slot, task, value), (reason) => this.failTask(slot, task, reason));
      }
    }
    complete(slot, task, value) {
      if (slot.task !== task) return;
      slot.task = void 0;
      if (task.signal?.aborted) {
        if (task.kind === "surface") {
          const result = value;
          const error = new SurfaceWorkerCompilationError("surface worker task was aborted", result.reclaimedWindowBuffers);
          error.name = "AbortError";
          this.rejectTask(task, error);
        } else this.rejectTask(task, abortError2());
      } else if (!task.settled) {
        task.settled = true;
        task.signal?.removeEventListener("abort", task.abort);
        this.completed += 1;
        task.resolve(value);
      }
      this.dispatch();
    }
    failTask(slot, task, reason) {
      if (slot.task !== task) return;
      slot.task = void 0;
      const failedWorker = slot.worker.isDisposed === true;
      if (!this.disposed && failedWorker && task.attempts < 2 && !task.signal?.aborted) {
        try {
          slot.worker = this.factory();
          this.restarts += 1;
          task.running = false;
          this.queue.push(task);
          this.sortQueue();
          this.dispatch();
          return;
        } catch (restartReason) {
          this.rejectTask(task, asError4(restartReason));
        }
      } else this.rejectTask(task, asError4(reason));
      this.dispatch();
    }
    rejectTask(task, error) {
      if (task.settled) return;
      task.settled = true;
      task.signal?.removeEventListener("abort", task.abort);
      this.rejected += 1;
      task.reject(error);
    }
  };

  exports.BASE_SEMANTIC_CHUNK_PAYLOAD_BYTES = BASE_SEMANTIC_CHUNK_PAYLOAD_BYTES;
  exports.BASE_SEMANTIC_CHUNK_REVISION = BASE_SEMANTIC_CHUNK_REVISION;
  exports.BASE_SEMANTIC_CHUNK_SERIALIZED_BYTES = BASE_SEMANTIC_CHUNK_SERIALIZED_BYTES;
  exports.BaseSemanticChunkView = BaseSemanticChunkView;
  exports.CompiledVegetationSpecies = CompiledVegetationSpecies;
  exports.DEFAULT_LIGHTING_STATE = DEFAULT_LIGHTING_STATE;
  exports.DEFAULT_SURFACE_PRESENTATION_STYLE = DEFAULT_SURFACE_PRESENTATION_STYLE;
  exports.DependencyDrivenRenderGraph = DependencyDrivenRenderGraph;
  exports.EffectiveWorldView = EffectiveWorldView;
  exports.EventEmitter = EventEmitter;
  exports.FULL_HYDROLOGY_REGION_BOUNDS = FULL_HYDROLOGY_REGION_BOUNDS;
  exports.FULL_SEMANTIC_CHUNK_BOUNDS = FULL_SEMANTIC_CHUNK_BOUNDS;
  exports.GroundLayer = GroundLayer;
  exports.HYDROLOGY_COORDINATE_SCALE = HYDROLOGY_COORDINATE_SCALE;
  exports.HYDROLOGY_INFINITE_BASIN_SIZE = HYDROLOGY_INFINITE_BASIN_SIZE;
  exports.HYDROLOGY_MACRO_CELLS_PER_INFINITE_BASIN = HYDROLOGY_MACRO_CELLS_PER_INFINITE_BASIN;
  exports.HYDROLOGY_MACRO_CELL_SIZE = HYDROLOGY_MACRO_CELL_SIZE;
  exports.HYDROLOGY_MAX_DISCHARGE_CLASS = HYDROLOGY_MAX_DISCHARGE_CLASS;
  exports.HYDROLOGY_MAX_MACRO_NODES = HYDROLOGY_MAX_MACRO_NODES;
  exports.HYDROLOGY_MAX_REGION_BODIES = HYDROLOGY_MAX_REGION_BODIES;
  exports.HYDROLOGY_MAX_REGION_CONTROL_POINTS = HYDROLOGY_MAX_REGION_CONTROL_POINTS;
  exports.HYDROLOGY_MAX_REGION_LAKES = HYDROLOGY_MAX_REGION_LAKES;
  exports.HYDROLOGY_MAX_REGION_MOUTHS = HYDROLOGY_MAX_REGION_MOUTHS;
  exports.HYDROLOGY_MAX_REGION_PORTS = HYDROLOGY_MAX_REGION_PORTS;
  exports.HYDROLOGY_MAX_REGION_RIVERS = HYDROLOGY_MAX_REGION_RIVERS;
  exports.HYDROLOGY_MIN_RIVER_DISCHARGE_CLASS = HYDROLOGY_MIN_RIVER_DISCHARGE_CLASS;
  exports.HYDROLOGY_REGION_FORMAT_VERSION = HYDROLOGY_REGION_FORMAT_VERSION;
  exports.HYDROLOGY_REGION_REVISION = HYDROLOGY_REGION_REVISION;
  exports.HYDROLOGY_REGION_SIZE = HYDROLOGY_REGION_SIZE;
  exports.HYDROLOGY_SEA_LEVEL = HYDROLOGY_SEA_LEVEL;
  exports.HYDROLOGY_SPATIAL_BIN_SIZE = HYDROLOGY_SPATIAL_BIN_SIZE;
  exports.HexMap = HexMap;
  exports.HydrologyRegionGenerator = HydrologyRegionGenerator;
  exports.HydrologyRegionSpatialIndex = HydrologyRegionSpatialIndex;
  exports.HydrologyWaterKind = HydrologyWaterKind;
  exports.IndexedDbWorldDeltaStore = IndexedDbWorldDeltaStore;
  exports.LifecycleDrainTimeoutError = LifecycleDrainTimeoutError;
  exports.LifecycleScope = LifecycleScope;
  exports.LightingStateController = LightingStateController;
  exports.MINIMUM_WORLD_SURFACE_RUNTIME_BUDGETS = MINIMUM_WORLD_SURFACE_RUNTIME_BUDGETS;
  exports.MemoryWorldDeltaStore = MemoryWorldDeltaStore;
  exports.OCEAN_BODY_ID = OCEAN_BODY_ID;
  exports.PriorityTaskQueue = PriorityTaskQueue;
  exports.ProceduralWorldAuthoritySource = ProceduralWorldAuthoritySource;
  exports.ResourceBudgetLedger = ResourceBudgetLedger;
  exports.RuntimeWorkCoordinator = RuntimeWorkCoordinator;
  exports.SURFACE_CANONICAL_HEX_SIZE = SURFACE_CANONICAL_HEX_SIZE;
  exports.SURFACE_COMPILER_REVISION = SURFACE_COMPILER_REVISION;
  exports.SURFACE_COMPILE_PROFILE_V1 = SURFACE_COMPILE_PROFILE_V1;
  exports.SURFACE_COMPILE_PROFILE_VERSION = SURFACE_COMPILE_PROFILE_VERSION;
  exports.SURFACE_EFFECTIVE_WINDOW_SIZE = SURFACE_EFFECTIVE_WINDOW_SIZE;
  exports.SURFACE_FIELD_CORE_SIZE = SURFACE_FIELD_CORE_SIZE;
  exports.SURFACE_FIELD_GUTTER_TEXELS = SURFACE_FIELD_GUTTER_TEXELS;
  exports.SURFACE_FIELD_TEXEL_COUNT = SURFACE_FIELD_TEXEL_COUNT;
  exports.SURFACE_FIELD_TEXTURE_SIZE = SURFACE_FIELD_TEXTURE_SIZE;
  exports.SURFACE_FLOW_TEXTURE_CHANNELS = SURFACE_FLOW_TEXTURE_CHANNELS;
  exports.SURFACE_FOG_LAYER_BYTES = SURFACE_FOG_LAYER_BYTES;
  exports.SURFACE_FOG_PAGE_BYTES = SURFACE_FOG_PAGE_BYTES;
  exports.SURFACE_FOG_TEXTURE_SIZE = SURFACE_FOG_TEXTURE_SIZE;
  exports.SURFACE_GPU_BYTES_PER_TEXEL = SURFACE_GPU_BYTES_PER_TEXEL;
  exports.SURFACE_GPU_LAYER_BYTES = SURFACE_GPU_LAYER_BYTES;
  exports.SURFACE_GPU_PAGE_BYTES = SURFACE_GPU_PAGE_BYTES;
  exports.SURFACE_GROUND_BOUNDARY_INTERVALS = SURFACE_GROUND_BOUNDARY_INTERVALS;
  exports.SURFACE_GROUND_DEFAULT_MATERIAL_PALETTE = SURFACE_GROUND_DEFAULT_MATERIAL_PALETTE;
  exports.SURFACE_GROUND_LOD_GRID_STEPS = SURFACE_GROUND_LOD_GRID_STEPS;
  exports.SURFACE_INFLUENCE_RADIUS_TILES = SURFACE_INFLUENCE_RADIUS_TILES;
  exports.SURFACE_LATTICE_TEST_VECTORS = SURFACE_LATTICE_TEST_VECTORS;
  exports.SURFACE_MATERIAL_TEXTURE_CHANNELS = SURFACE_MATERIAL_TEXTURE_CHANNELS;
  exports.SURFACE_MAX_VEGETATION_SEEDS = SURFACE_MAX_VEGETATION_SEEDS;
  exports.SURFACE_MAX_WATER_BODY_COUNT = SURFACE_MAX_WATER_BODY_COUNT;
  exports.SURFACE_NARROW_RIVER_MAX_WIDTH_QUANTIZED = SURFACE_NARROW_RIVER_MAX_WIDTH_QUANTIZED;
  exports.SURFACE_RENDER_CHUNK_SIZE = SURFACE_RENDER_CHUNK_SIZE;
  exports.SURFACE_SAMPLES_PER_TILE_INTERVAL = SURFACE_SAMPLES_PER_TILE_INTERVAL;
  exports.SURFACE_TEXTURE_FORMAT_V1 = SURFACE_TEXTURE_FORMAT_V1;
  exports.SURFACE_TEXTURE_PAGE_LAYERS = SURFACE_TEXTURE_PAGE_LAYERS;
  exports.SURFACE_VALUES_TEXTURE_CHANNELS = SURFACE_VALUES_TEXTURE_CHANNELS;
  exports.SURFACE_VEGETATION_COORDINATE_SCALE = SURFACE_VEGETATION_COORDINATE_SCALE;
  exports.SURFACE_WATER_COVERAGE_THRESHOLD = SURFACE_WATER_COVERAGE_THRESHOLD;
  exports.SURFACE_WATER_TEXTURE_CHANNELS = SURFACE_WATER_TEXTURE_CHANNELS;
  exports.SemanticNavigationIndex = SemanticNavigationIndex;
  exports.SemanticOverrideField = SemanticOverrideField;
  exports.StaticWorldAuthoritySource = StaticWorldAuthoritySource;
  exports.SubstrateClass = SubstrateClass;
  exports.SurfaceCompilationService = SurfaceCompilationService;
  exports.SurfaceFogTexturePool = SurfaceFogTexturePool;
  exports.SurfaceGroundGeometryPool = SurfaceGroundGeometryPool;
  exports.SurfacePickingService = SurfacePickingService;
  exports.SurfacePresentationLayer = SurfacePresentationLayer;
  exports.SurfaceQueryService = SurfaceQueryService;
  exports.SurfaceRequestTracker = SurfaceRequestTracker;
  exports.SurfaceTexturePool = SurfaceTexturePool;
  exports.SurfaceWindowBufferPool = SurfaceWindowBufferPool;
  exports.SurfaceWorkerCompilationError = SurfaceWorkerCompilationError;
  exports.VegetationLayer = VegetationLayer;
  exports.WORLD_BIOME_BASIS = WORLD_BIOME_BASIS;
  exports.WORLD_CHUNK_FORMAT_VERSION = WORLD_CHUNK_FORMAT_VERSION;
  exports.WORLD_DELTA_CHECKPOINT_FORMAT_VERSION = WORLD_DELTA_CHECKPOINT_FORMAT_VERSION;
  exports.WORLD_DELTA_FORMAT_VERSION = WORLD_DELTA_FORMAT_VERSION;
  exports.WORLD_DESCRIPTOR_FORMAT_VERSION = WORLD_DESCRIPTOR_FORMAT_VERSION;
  exports.WORLD_GENERATOR_VERSION = WORLD_GENERATOR_VERSION;
  exports.WORLD_SEMANTIC_CHUNK_SIZE = WORLD_SEMANTIC_CHUNK_SIZE;
  exports.WORLD_SEMANTIC_CHUNK_TILE_COUNT = WORLD_SEMANTIC_CHUNK_TILE_COUNT;
  exports.WORLD_SEMANTIC_NAVIGATION_FORMAT_VERSION = WORLD_SEMANTIC_NAVIGATION_FORMAT_VERSION;
  exports.WORLD_SUBSTRATE_CATALOG = WORLD_SUBSTRATE_CATALOG;
  exports.WORLD_SUBSTRATE_CATALOG_IDENTITY = WORLD_SUBSTRATE_CATALOG_IDENTITY;
  exports.WORLD_VEGETATION_CATALOG_IDENTITY = WORLD_VEGETATION_CATALOG_IDENTITY;
  exports.WORLD_VEGETATION_PROFILE_CATALOG = WORLD_VEGETATION_PROFILE_CATALOG;
  exports.WORLD_WORKER_PROTOCOL_VERSION = WORLD_WORKER_PROTOCOL_VERSION;
  exports.WaterLayer = WaterLayer;
  exports.WorkQueueBackpressureError = WorkQueueBackpressureError;
  exports.WorldAuthorityRepository = WorldAuthorityRepository;
  exports.WorldChangeDomain = WorldChangeDomain;
  exports.WorldDeltaRevisionConflictError = WorldDeltaRevisionConflictError;
  exports.WorldEditTransaction = WorldEditTransaction;
  exports.WorldEditor = WorldEditor;
  exports.WorldRenderDependencyError = WorldRenderDependencyError;
  exports.WorldRenderSession = WorldRenderSession;
  exports.WorldSurfaceRuntime = WorldSurfaceRuntime;
  exports.WorldSurfaceWorkerClient = WorldSurfaceWorkerClient;
  exports.WorldSurfaceWorkerPool = WorldSurfaceWorkerPool;
  exports.assertBaseSemanticChunk = assertBaseSemanticChunk;
  exports.assertCompiledSurfaceChunk = assertCompiledSurfaceChunk;
  exports.assertHydrologyFeatureDelta = assertHydrologyFeatureDelta;
  exports.assertHydrologyRegion = assertHydrologyRegion;
  exports.assertHydrologyRegionKey = assertHydrologyRegionKey;
  exports.assertHydrologyRegionLocalBounds = assertHydrologyRegionLocalBounds;
  exports.assertLocalTileBounds = assertLocalTileBounds;
  exports.assertMacroDrainageGraph = assertMacroDrainageGraph;
  exports.assertMatchingHydrologyPorts = assertMatchingHydrologyPorts;
  exports.assertSemanticChunkKey = assertSemanticChunkKey;
  exports.assertSparseSemanticDelta = assertSparseSemanticDelta;
  exports.assertSurfaceDependencyKey = assertSurfaceDependencyKey;
  exports.assertSurfaceRequestToken = assertSurfaceRequestToken;
  exports.assertTransferableEffectiveWindow = assertTransferableEffectiveWindow;
  exports.assertWorldDescriptorV2 = assertWorldDescriptorV2;
  exports.baseSemanticChunkTransferables = baseSemanticChunkTransferables;
  exports.buildMacroDrainageGraph = buildMacroDrainageGraph;
  exports.canonicalizeHydrologyRegionKey = canonicalizeHydrologyRegionKey;
  exports.canonicalizeRenderChunkKey = canonicalizeRenderChunkKey;
  exports.canonicalizeSemanticChunkKey = canonicalizeSemanticChunkKey;
  exports.cloneHydrologyFeatureDelta = cloneHydrologyFeatureDelta;
  exports.cloneSparseSemanticDelta = cloneSparseSemanticDelta;
  exports.cloneSurfaceDependencyKey = cloneSurfaceDependencyKey;
  exports.compileStaticWorldAuthority = compileStaticWorldAuthority;
  exports.compileSurfaceChunk = compileSurfaceChunk;
  exports.compileVegetationSeeds = compileVegetationSeeds;
  exports.compileWaterGeometry = compileWaterGeometry;
  exports.compiledSurfaceChunkTransferables = compiledSurfaceChunkTransferables;
  exports.createEffectiveDeltaSnapshot = createEffectiveDeltaSnapshot;
  exports.createLightingState = createLightingState;
  exports.createProceduralMacroHeightSource = createProceduralMacroHeightSource;
  exports.createSemanticChunkSurfaceResolver = createSemanticChunkSurfaceResolver;
  exports.createSparseSemanticDelta = createSparseSemanticDelta;
  exports.createStableHydrologyId = createStableHydrologyId;
  exports.createSurfaceDependencyBinding = createSurfaceDependencyBinding;
  exports.createSurfaceGroundGeometry = createSurfaceGroundGeometry;
  exports.createSurfacePresentationStyle = createSurfacePresentationStyle;
  exports.createTransferableEffectiveWindow = createTransferableEffectiveWindow;
  exports.createWorldChangeSet = createWorldChangeSet;
  exports.createWorldDescriptorV2 = createWorldDescriptorV2;
  exports.decodeFloat16 = decodeFloat16;
  exports.deriveHydrologyRaster = deriveHydrologyRaster;
  exports.derivedHydrologyRasterTransferables = derivedHydrologyRasterTransferables;
  exports.deserializeBaseSemanticChunk = deserializeBaseSemanticChunk;
  exports.effectiveSurfaceWindowTransferables = effectiveSurfaceWindowTransferables;
  exports.encodeFloat16 = encodeFloat16;
  exports.estimateBufferGeometriesBytes = estimateBufferGeometriesBytes;
  exports.estimateBufferGeometriesResourceBytes = estimateBufferGeometriesResourceBytes;
  exports.estimateObject3DResourceCost = estimateObject3DResourceCost;
  exports.generateBaseSemanticChunk = generateBaseSemanticChunk;
  exports.generateBaseSemanticChunkWithResolver = generateBaseSemanticChunkWithResolver;
  exports.generateHydrologyRegion = generateHydrologyRegion;
  exports.getSurfaceGroundGeometryInfo = getSurfaceGroundGeometryInfo;
  exports.hydrologyFeatureBounds = hydrologyFeatureBounds;
  exports.hydrologyRegionCoordinate = hydrologyRegionCoordinate;
  exports.hydrologyRegionOrigin = hydrologyRegionOrigin;
  exports.hydrologyRegionTransferables = hydrologyRegionTransferables;
  exports.hydrologyRegionVectorBytes = hydrologyRegionVectorBytes;
  exports.lifecycleAbortError = lifecycleAbortError;
  exports.locateSemanticTile = locateSemanticTile;
  exports.normalizeResourceCost = normalizeResourceCost;
  exports.planWorldRenderDemand = planWorldRenderDemand;
  exports.quantizeFloat16 = quantizeFloat16;
  exports.quantizeMacroHeight = quantizeMacroHeight;
  exports.sampleCompiledSurfaceChunk = sampleCompiledSurfaceChunk;
  exports.semanticChunkCoordinate = semanticChunkCoordinate;
  exports.semanticChunkLocalIndex = semanticChunkLocalIndex;
  exports.semanticChunkOrigin = semanticChunkOrigin;
  exports.serializeBaseSemanticChunk = serializeBaseSemanticChunk;
  exports.serializeSurfaceDependencyKey = serializeSurfaceDependencyKey;
  exports.serializeWorldDescriptorV2 = serializeWorldDescriptorV2;
  exports.sparseSemanticDeltaByteLength = sparseSemanticDeltaByteLength;
  exports.sparseSemanticDeltaOverrideOffset = sparseSemanticDeltaOverrideOffset;
  exports.surfaceColumnStagger = surfaceColumnStagger;
  exports.surfaceDependencyKeysEqual = surfaceDependencyKeysEqual;
  exports.surfaceFieldTexelCoordinate = surfaceFieldTexelCoordinate;
  exports.surfaceHydrologyRegionRequirements = surfaceHydrologyRegionRequirements;
  exports.surfaceLatticeIndex = surfaceLatticeIndex;
  exports.surfaceLatticeTexelLocalCoordinate = surfaceLatticeTexelLocalCoordinate;
  exports.surfaceLatticeTexelWorldCoordinate = surfaceLatticeTexelWorldCoordinate;
  exports.surfacePointOwnerRenderChunk = surfacePointOwnerRenderChunk;
  exports.surfacePresentationTransferables = surfacePresentationTransferables;
  exports.surfaceSemanticChunkRequirements = surfaceSemanticChunkRequirements;
  exports.surfaceStagger = surfaceStagger;
  exports.surfaceToWorld = surfaceToWorld;
  exports.vegetationSeedsByteLength = vegetationSeedsByteLength;
  exports.waterGeometryByteLength = waterGeometryByteLength;
  exports.worldDescriptorsV2Equal = worldDescriptorsV2Equal;
  exports.worldToSurface = worldToSurface;

}));
//# sourceMappingURL=hex-map.global.js.map
