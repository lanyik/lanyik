(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('three')) :
	typeof define === 'function' && define.amd ? define(['exports', 'three'], factory) :
	(global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.HexMap = {}, global.THREE));
})(this, (function (exports, three) { 'use strict';

	function getDefaultExportFromCjs (x) {
		return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x['default'] : x;
	}

	var orientation = {exports: {}};

	var twoProduct_1;
	var hasRequiredTwoProduct;

	function requireTwoProduct () {
		if (hasRequiredTwoProduct) return twoProduct_1;
		hasRequiredTwoProduct = 1;

		twoProduct_1 = twoProduct;

		var SPLITTER = +(Math.pow(2, 27) + 1.0);

		function twoProduct(a, b, result) {
		  var x = a * b;

		  var c = SPLITTER * a;
		  var abig = c - a;
		  var ahi = c - abig;
		  var alo = a - ahi;

		  var d = SPLITTER * b;
		  var bbig = d - b;
		  var bhi = d - bbig;
		  var blo = b - bhi;

		  var err1 = x - (ahi * bhi);
		  var err2 = err1 - (alo * bhi);
		  var err3 = err2 - (ahi * blo);

		  var y = alo * blo - err3;

		  if(result) {
		    result[0] = y;
		    result[1] = x;
		    return result
		  }

		  return [ y, x ]
		}
		return twoProduct_1;
	}

	var robustSum;
	var hasRequiredRobustSum;

	function requireRobustSum () {
		if (hasRequiredRobustSum) return robustSum;
		hasRequiredRobustSum = 1;

		robustSum = linearExpansionSum;

		//Easy case: Add two scalars
		function scalarScalar(a, b) {
		  var x = a + b;
		  var bv = x - a;
		  var av = x - bv;
		  var br = b - bv;
		  var ar = a - av;
		  var y = ar + br;
		  if(y) {
		    return [y, x]
		  }
		  return [x]
		}

		function linearExpansionSum(e, f) {
		  var ne = e.length|0;
		  var nf = f.length|0;
		  if(ne === 1 && nf === 1) {
		    return scalarScalar(e[0], f[0])
		  }
		  var n = ne + nf;
		  var g = new Array(n);
		  var count = 0;
		  var eptr = 0;
		  var fptr = 0;
		  var abs = Math.abs;
		  var ei = e[eptr];
		  var ea = abs(ei);
		  var fi = f[fptr];
		  var fa = abs(fi);
		  var a, b;
		  if(ea < fa) {
		    b = ei;
		    eptr += 1;
		    if(eptr < ne) {
		      ei = e[eptr];
		      ea = abs(ei);
		    }
		  } else {
		    b = fi;
		    fptr += 1;
		    if(fptr < nf) {
		      fi = f[fptr];
		      fa = abs(fi);
		    }
		  }
		  if((eptr < ne && ea < fa) || (fptr >= nf)) {
		    a = ei;
		    eptr += 1;
		    if(eptr < ne) {
		      ei = e[eptr];
		      ea = abs(ei);
		    }
		  } else {
		    a = fi;
		    fptr += 1;
		    if(fptr < nf) {
		      fi = f[fptr];
		      fa = abs(fi);
		    }
		  }
		  var x = a + b;
		  var bv = x - a;
		  var y = b - bv;
		  var q0 = y;
		  var q1 = x;
		  var _x, _bv, _av, _br, _ar;
		  while(eptr < ne && fptr < nf) {
		    if(ea < fa) {
		      a = ei;
		      eptr += 1;
		      if(eptr < ne) {
		        ei = e[eptr];
		        ea = abs(ei);
		      }
		    } else {
		      a = fi;
		      fptr += 1;
		      if(fptr < nf) {
		        fi = f[fptr];
		        fa = abs(fi);
		      }
		    }
		    b = q0;
		    x = a + b;
		    bv = x - a;
		    y = b - bv;
		    if(y) {
		      g[count++] = y;
		    }
		    _x = q1 + x;
		    _bv = _x - q1;
		    _av = _x - _bv;
		    _br = x - _bv;
		    _ar = q1 - _av;
		    q0 = _ar + _br;
		    q1 = _x;
		  }
		  while(eptr < ne) {
		    a = ei;
		    b = q0;
		    x = a + b;
		    bv = x - a;
		    y = b - bv;
		    if(y) {
		      g[count++] = y;
		    }
		    _x = q1 + x;
		    _bv = _x - q1;
		    _av = _x - _bv;
		    _br = x - _bv;
		    _ar = q1 - _av;
		    q0 = _ar + _br;
		    q1 = _x;
		    eptr += 1;
		    if(eptr < ne) {
		      ei = e[eptr];
		    }
		  }
		  while(fptr < nf) {
		    a = fi;
		    b = q0;
		    x = a + b;
		    bv = x - a;
		    y = b - bv;
		    if(y) {
		      g[count++] = y;
		    }
		    _x = q1 + x;
		    _bv = _x - q1;
		    _av = _x - _bv;
		    _br = x - _bv;
		    _ar = q1 - _av;
		    q0 = _ar + _br;
		    q1 = _x;
		    fptr += 1;
		    if(fptr < nf) {
		      fi = f[fptr];
		    }
		  }
		  if(q0) {
		    g[count++] = q0;
		  }
		  if(q1) {
		    g[count++] = q1;
		  }
		  if(!count) {
		    g[count++] = 0.0;
		  }
		  g.length = count;
		  return g
		}
		return robustSum;
	}

	var twoSum;
	var hasRequiredTwoSum;

	function requireTwoSum () {
		if (hasRequiredTwoSum) return twoSum;
		hasRequiredTwoSum = 1;

		twoSum = fastTwoSum;

		function fastTwoSum(a, b, result) {
			var x = a + b;
			var bv = x - a;
			var av = x - bv;
			var br = b - bv;
			var ar = a - av;
			if(result) {
				result[0] = ar + br;
				result[1] = x;
				return result
			}
			return [ar+br, x]
		}
		return twoSum;
	}

	var robustScale;
	var hasRequiredRobustScale;

	function requireRobustScale () {
		if (hasRequiredRobustScale) return robustScale;
		hasRequiredRobustScale = 1;

		var twoProduct = requireTwoProduct();
		var twoSum = requireTwoSum();

		robustScale = scaleLinearExpansion;

		function scaleLinearExpansion(e, scale) {
		  var n = e.length;
		  if(n === 1) {
		    var ts = twoProduct(e[0], scale);
		    if(ts[0]) {
		      return ts
		    }
		    return [ ts[1] ]
		  }
		  var g = new Array(2 * n);
		  var q = [0.1, 0.1];
		  var t = [0.1, 0.1];
		  var count = 0;
		  twoProduct(e[0], scale, q);
		  if(q[0]) {
		    g[count++] = q[0];
		  }
		  for(var i=1; i<n; ++i) {
		    twoProduct(e[i], scale, t);
		    var pq = q[1];
		    twoSum(pq, t[0], q);
		    if(q[0]) {
		      g[count++] = q[0];
		    }
		    var a = t[1];
		    var b = q[1];
		    var x = a + b;
		    var bv = x - a;
		    var y = b - bv;
		    q[1] = x;
		    if(y) {
		      g[count++] = y;
		    }
		  }
		  if(q[1]) {
		    g[count++] = q[1];
		  }
		  if(count === 0) {
		    g[count++] = 0.0;
		  }
		  g.length = count;
		  return g
		}
		return robustScale;
	}

	var robustDiff;
	var hasRequiredRobustDiff;

	function requireRobustDiff () {
		if (hasRequiredRobustDiff) return robustDiff;
		hasRequiredRobustDiff = 1;

		robustDiff = robustSubtract;

		//Easy case: Add two scalars
		function scalarScalar(a, b) {
		  var x = a + b;
		  var bv = x - a;
		  var av = x - bv;
		  var br = b - bv;
		  var ar = a - av;
		  var y = ar + br;
		  if(y) {
		    return [y, x]
		  }
		  return [x]
		}

		function robustSubtract(e, f) {
		  var ne = e.length|0;
		  var nf = f.length|0;
		  if(ne === 1 && nf === 1) {
		    return scalarScalar(e[0], -f[0])
		  }
		  var n = ne + nf;
		  var g = new Array(n);
		  var count = 0;
		  var eptr = 0;
		  var fptr = 0;
		  var abs = Math.abs;
		  var ei = e[eptr];
		  var ea = abs(ei);
		  var fi = -f[fptr];
		  var fa = abs(fi);
		  var a, b;
		  if(ea < fa) {
		    b = ei;
		    eptr += 1;
		    if(eptr < ne) {
		      ei = e[eptr];
		      ea = abs(ei);
		    }
		  } else {
		    b = fi;
		    fptr += 1;
		    if(fptr < nf) {
		      fi = -f[fptr];
		      fa = abs(fi);
		    }
		  }
		  if((eptr < ne && ea < fa) || (fptr >= nf)) {
		    a = ei;
		    eptr += 1;
		    if(eptr < ne) {
		      ei = e[eptr];
		      ea = abs(ei);
		    }
		  } else {
		    a = fi;
		    fptr += 1;
		    if(fptr < nf) {
		      fi = -f[fptr];
		      fa = abs(fi);
		    }
		  }
		  var x = a + b;
		  var bv = x - a;
		  var y = b - bv;
		  var q0 = y;
		  var q1 = x;
		  var _x, _bv, _av, _br, _ar;
		  while(eptr < ne && fptr < nf) {
		    if(ea < fa) {
		      a = ei;
		      eptr += 1;
		      if(eptr < ne) {
		        ei = e[eptr];
		        ea = abs(ei);
		      }
		    } else {
		      a = fi;
		      fptr += 1;
		      if(fptr < nf) {
		        fi = -f[fptr];
		        fa = abs(fi);
		      }
		    }
		    b = q0;
		    x = a + b;
		    bv = x - a;
		    y = b - bv;
		    if(y) {
		      g[count++] = y;
		    }
		    _x = q1 + x;
		    _bv = _x - q1;
		    _av = _x - _bv;
		    _br = x - _bv;
		    _ar = q1 - _av;
		    q0 = _ar + _br;
		    q1 = _x;
		  }
		  while(eptr < ne) {
		    a = ei;
		    b = q0;
		    x = a + b;
		    bv = x - a;
		    y = b - bv;
		    if(y) {
		      g[count++] = y;
		    }
		    _x = q1 + x;
		    _bv = _x - q1;
		    _av = _x - _bv;
		    _br = x - _bv;
		    _ar = q1 - _av;
		    q0 = _ar + _br;
		    q1 = _x;
		    eptr += 1;
		    if(eptr < ne) {
		      ei = e[eptr];
		    }
		  }
		  while(fptr < nf) {
		    a = fi;
		    b = q0;
		    x = a + b;
		    bv = x - a;
		    y = b - bv;
		    if(y) {
		      g[count++] = y;
		    }
		    _x = q1 + x;
		    _bv = _x - q1;
		    _av = _x - _bv;
		    _br = x - _bv;
		    _ar = q1 - _av;
		    q0 = _ar + _br;
		    q1 = _x;
		    fptr += 1;
		    if(fptr < nf) {
		      fi = -f[fptr];
		    }
		  }
		  if(q0) {
		    g[count++] = q0;
		  }
		  if(q1) {
		    g[count++] = q1;
		  }
		  if(!count) {
		    g[count++] = 0.0;
		  }
		  g.length = count;
		  return g
		}
		return robustDiff;
	}

	var hasRequiredOrientation;

	function requireOrientation () {
		if (hasRequiredOrientation) return orientation.exports;
		hasRequiredOrientation = 1;
		(function (module) {

			var twoProduct = requireTwoProduct();
			var robustSum = requireRobustSum();
			var robustScale = requireRobustScale();
			var robustSubtract = requireRobustDiff();

			var NUM_EXPAND = 5;

			var EPSILON     = 1.1102230246251565e-16;
			var ERRBOUND3   = (3.0 + 16.0 * EPSILON) * EPSILON;
			var ERRBOUND4   = (7.0 + 56.0 * EPSILON) * EPSILON;

			function orientation_3(sum, prod, scale, sub) {
			  return function orientation3Exact(m0, m1, m2) {
			    var p = sum(sum(prod(m1[1], m2[0]), prod(-m2[1], m1[0])), sum(prod(m0[1], m1[0]), prod(-m1[1], m0[0])));
			    var n = sum(prod(m0[1], m2[0]), prod(-m2[1], m0[0]));
			    var d = sub(p, n);
			    return d[d.length - 1]
			  }
			}

			function orientation_4(sum, prod, scale, sub) {
			  return function orientation4Exact(m0, m1, m2, m3) {
			    var p = sum(sum(scale(sum(prod(m2[1], m3[0]), prod(-m3[1], m2[0])), m1[2]), sum(scale(sum(prod(m1[1], m3[0]), prod(-m3[1], m1[0])), -m2[2]), scale(sum(prod(m1[1], m2[0]), prod(-m2[1], m1[0])), m3[2]))), sum(scale(sum(prod(m1[1], m3[0]), prod(-m3[1], m1[0])), m0[2]), sum(scale(sum(prod(m0[1], m3[0]), prod(-m3[1], m0[0])), -m1[2]), scale(sum(prod(m0[1], m1[0]), prod(-m1[1], m0[0])), m3[2]))));
			    var n = sum(sum(scale(sum(prod(m2[1], m3[0]), prod(-m3[1], m2[0])), m0[2]), sum(scale(sum(prod(m0[1], m3[0]), prod(-m3[1], m0[0])), -m2[2]), scale(sum(prod(m0[1], m2[0]), prod(-m2[1], m0[0])), m3[2]))), sum(scale(sum(prod(m1[1], m2[0]), prod(-m2[1], m1[0])), m0[2]), sum(scale(sum(prod(m0[1], m2[0]), prod(-m2[1], m0[0])), -m1[2]), scale(sum(prod(m0[1], m1[0]), prod(-m1[1], m0[0])), m2[2]))));
			    var d = sub(p, n);
			    return d[d.length - 1]
			  }
			}

			function orientation_5(sum, prod, scale, sub) {
			  return function orientation5Exact(m0, m1, m2, m3, m4) {
			    var p = sum(sum(sum(scale(sum(scale(sum(prod(m3[1], m4[0]), prod(-m4[1], m3[0])), m2[2]), sum(scale(sum(prod(m2[1], m4[0]), prod(-m4[1], m2[0])), -m3[2]), scale(sum(prod(m2[1], m3[0]), prod(-m3[1], m2[0])), m4[2]))), m1[3]), sum(scale(sum(scale(sum(prod(m3[1], m4[0]), prod(-m4[1], m3[0])), m1[2]), sum(scale(sum(prod(m1[1], m4[0]), prod(-m4[1], m1[0])), -m3[2]), scale(sum(prod(m1[1], m3[0]), prod(-m3[1], m1[0])), m4[2]))), -m2[3]), scale(sum(scale(sum(prod(m2[1], m4[0]), prod(-m4[1], m2[0])), m1[2]), sum(scale(sum(prod(m1[1], m4[0]), prod(-m4[1], m1[0])), -m2[2]), scale(sum(prod(m1[1], m2[0]), prod(-m2[1], m1[0])), m4[2]))), m3[3]))), sum(scale(sum(scale(sum(prod(m2[1], m3[0]), prod(-m3[1], m2[0])), m1[2]), sum(scale(sum(prod(m1[1], m3[0]), prod(-m3[1], m1[0])), -m2[2]), scale(sum(prod(m1[1], m2[0]), prod(-m2[1], m1[0])), m3[2]))), -m4[3]), sum(scale(sum(scale(sum(prod(m3[1], m4[0]), prod(-m4[1], m3[0])), m1[2]), sum(scale(sum(prod(m1[1], m4[0]), prod(-m4[1], m1[0])), -m3[2]), scale(sum(prod(m1[1], m3[0]), prod(-m3[1], m1[0])), m4[2]))), m0[3]), scale(sum(scale(sum(prod(m3[1], m4[0]), prod(-m4[1], m3[0])), m0[2]), sum(scale(sum(prod(m0[1], m4[0]), prod(-m4[1], m0[0])), -m3[2]), scale(sum(prod(m0[1], m3[0]), prod(-m3[1], m0[0])), m4[2]))), -m1[3])))), sum(sum(scale(sum(scale(sum(prod(m1[1], m4[0]), prod(-m4[1], m1[0])), m0[2]), sum(scale(sum(prod(m0[1], m4[0]), prod(-m4[1], m0[0])), -m1[2]), scale(sum(prod(m0[1], m1[0]), prod(-m1[1], m0[0])), m4[2]))), m3[3]), sum(scale(sum(scale(sum(prod(m1[1], m3[0]), prod(-m3[1], m1[0])), m0[2]), sum(scale(sum(prod(m0[1], m3[0]), prod(-m3[1], m0[0])), -m1[2]), scale(sum(prod(m0[1], m1[0]), prod(-m1[1], m0[0])), m3[2]))), -m4[3]), scale(sum(scale(sum(prod(m2[1], m3[0]), prod(-m3[1], m2[0])), m1[2]), sum(scale(sum(prod(m1[1], m3[0]), prod(-m3[1], m1[0])), -m2[2]), scale(sum(prod(m1[1], m2[0]), prod(-m2[1], m1[0])), m3[2]))), m0[3]))), sum(scale(sum(scale(sum(prod(m2[1], m3[0]), prod(-m3[1], m2[0])), m0[2]), sum(scale(sum(prod(m0[1], m3[0]), prod(-m3[1], m0[0])), -m2[2]), scale(sum(prod(m0[1], m2[0]), prod(-m2[1], m0[0])), m3[2]))), -m1[3]), sum(scale(sum(scale(sum(prod(m1[1], m3[0]), prod(-m3[1], m1[0])), m0[2]), sum(scale(sum(prod(m0[1], m3[0]), prod(-m3[1], m0[0])), -m1[2]), scale(sum(prod(m0[1], m1[0]), prod(-m1[1], m0[0])), m3[2]))), m2[3]), scale(sum(scale(sum(prod(m1[1], m2[0]), prod(-m2[1], m1[0])), m0[2]), sum(scale(sum(prod(m0[1], m2[0]), prod(-m2[1], m0[0])), -m1[2]), scale(sum(prod(m0[1], m1[0]), prod(-m1[1], m0[0])), m2[2]))), -m3[3])))));
			    var n = sum(sum(sum(scale(sum(scale(sum(prod(m3[1], m4[0]), prod(-m4[1], m3[0])), m2[2]), sum(scale(sum(prod(m2[1], m4[0]), prod(-m4[1], m2[0])), -m3[2]), scale(sum(prod(m2[1], m3[0]), prod(-m3[1], m2[0])), m4[2]))), m0[3]), scale(sum(scale(sum(prod(m3[1], m4[0]), prod(-m4[1], m3[0])), m0[2]), sum(scale(sum(prod(m0[1], m4[0]), prod(-m4[1], m0[0])), -m3[2]), scale(sum(prod(m0[1], m3[0]), prod(-m3[1], m0[0])), m4[2]))), -m2[3])), sum(scale(sum(scale(sum(prod(m2[1], m4[0]), prod(-m4[1], m2[0])), m0[2]), sum(scale(sum(prod(m0[1], m4[0]), prod(-m4[1], m0[0])), -m2[2]), scale(sum(prod(m0[1], m2[0]), prod(-m2[1], m0[0])), m4[2]))), m3[3]), scale(sum(scale(sum(prod(m2[1], m3[0]), prod(-m3[1], m2[0])), m0[2]), sum(scale(sum(prod(m0[1], m3[0]), prod(-m3[1], m0[0])), -m2[2]), scale(sum(prod(m0[1], m2[0]), prod(-m2[1], m0[0])), m3[2]))), -m4[3]))), sum(sum(scale(sum(scale(sum(prod(m2[1], m4[0]), prod(-m4[1], m2[0])), m1[2]), sum(scale(sum(prod(m1[1], m4[0]), prod(-m4[1], m1[0])), -m2[2]), scale(sum(prod(m1[1], m2[0]), prod(-m2[1], m1[0])), m4[2]))), m0[3]), scale(sum(scale(sum(prod(m2[1], m4[0]), prod(-m4[1], m2[0])), m0[2]), sum(scale(sum(prod(m0[1], m4[0]), prod(-m4[1], m0[0])), -m2[2]), scale(sum(prod(m0[1], m2[0]), prod(-m2[1], m0[0])), m4[2]))), -m1[3])), sum(scale(sum(scale(sum(prod(m1[1], m4[0]), prod(-m4[1], m1[0])), m0[2]), sum(scale(sum(prod(m0[1], m4[0]), prod(-m4[1], m0[0])), -m1[2]), scale(sum(prod(m0[1], m1[0]), prod(-m1[1], m0[0])), m4[2]))), m2[3]), scale(sum(scale(sum(prod(m1[1], m2[0]), prod(-m2[1], m1[0])), m0[2]), sum(scale(sum(prod(m0[1], m2[0]), prod(-m2[1], m0[0])), -m1[2]), scale(sum(prod(m0[1], m1[0]), prod(-m1[1], m0[0])), m2[2]))), -m4[3]))));
			    var d = sub(p, n);
			    return d[d.length - 1]
			  }
			}

			function orientation(n) {
			  var fn =
			    n === 3 ? orientation_3 :
			    n === 4 ? orientation_4 : orientation_5;

			  return fn(robustSum, twoProduct, robustScale, robustSubtract)
			}

			var orientation3Exact = orientation(3);
			var orientation4Exact = orientation(4);

			var CACHED = [
			  function orientation0() { return 0 },
			  function orientation1() { return 0 },
			  function orientation2(a, b) {
			    return b[0] - a[0]
			  },
			  function orientation3(a, b, c) {
			    var l = (a[1] - c[1]) * (b[0] - c[0]);
			    var r = (a[0] - c[0]) * (b[1] - c[1]);
			    var det = l - r;
			    var s;
			    if(l > 0) {
			      if(r <= 0) {
			        return det
			      } else {
			        s = l + r;
			      }
			    } else if(l < 0) {
			      if(r >= 0) {
			        return det
			      } else {
			        s = -(l + r);
			      }
			    } else {
			      return det
			    }
			    var tol = ERRBOUND3 * s;
			    if(det >= tol || det <= -tol) {
			      return det
			    }
			    return orientation3Exact(a, b, c)
			  },
			  function orientation4(a,b,c,d) {
			    var adx = a[0] - d[0];
			    var bdx = b[0] - d[0];
			    var cdx = c[0] - d[0];
			    var ady = a[1] - d[1];
			    var bdy = b[1] - d[1];
			    var cdy = c[1] - d[1];
			    var adz = a[2] - d[2];
			    var bdz = b[2] - d[2];
			    var cdz = c[2] - d[2];
			    var bdxcdy = bdx * cdy;
			    var cdxbdy = cdx * bdy;
			    var cdxady = cdx * ady;
			    var adxcdy = adx * cdy;
			    var adxbdy = adx * bdy;
			    var bdxady = bdx * ady;
			    var det = adz * (bdxcdy - cdxbdy)
			            + bdz * (cdxady - adxcdy)
			            + cdz * (adxbdy - bdxady);
			    var permanent = (Math.abs(bdxcdy) + Math.abs(cdxbdy)) * Math.abs(adz)
			                  + (Math.abs(cdxady) + Math.abs(adxcdy)) * Math.abs(bdz)
			                  + (Math.abs(adxbdy) + Math.abs(bdxady)) * Math.abs(cdz);
			    var tol = ERRBOUND4 * permanent;
			    if ((det > tol) || (-det > tol)) {
			      return det
			    }
			    return orientation4Exact(a,b,c,d)
			  }
			];

			function slowOrient(args) {
			  var proc = CACHED[args.length];
			  if(!proc) {
			    proc = CACHED[args.length] = orientation(args.length);
			  }
			  return proc.apply(undefined, args)
			}

			function proc (slow, o0, o1, o2, o3, o4, o5) {
			  return function getOrientation(a0, a1, a2, a3, a4) {
			    switch (arguments.length) {
			      case 0:
			      case 1:
			        return 0;
			      case 2:
			        return o2(a0, a1)
			      case 3:
			        return o3(a0, a1, a2)
			      case 4:
			        return o4(a0, a1, a2, a3)
			      case 5:
			        return o5(a0, a1, a2, a3, a4)
			    }

			    var s = new Array(arguments.length);
			    for (var i = 0; i < arguments.length; ++i) {
			      s[i] = arguments[i];
			    }
			    return slow(s)
			  }
			}

			function generateOrientationProc() {
			  while(CACHED.length <= NUM_EXPAND) {
			    CACHED.push(orientation(CACHED.length));
			  }
			  module.exports = proc.apply(undefined, [slowOrient].concat(CACHED));
			  for(var i=0; i<=NUM_EXPAND; ++i) {
			    module.exports[i] = CACHED[i];
			  }
			}

			generateOrientationProc();
		} (orientation));
		return orientation.exports;
	}

	var robustPnp;
	var hasRequiredRobustPnp;

	function requireRobustPnp () {
		if (hasRequiredRobustPnp) return robustPnp;
		hasRequiredRobustPnp = 1;
		robustPnp = robustPointInPolygon;

		var orient = requireOrientation();

		function robustPointInPolygon(vs, point) {
		  var x = point[0];
		  var y = point[1];
		  var n = vs.length;
		  var inside = 1;
		  var lim = n;
		  for(var i = 0, j = n-1; i<lim; j=i++) {
		    var a = vs[i];
		    var b = vs[j];
		    var yi = a[1];
		    var yj = b[1];
		    if(yj < yi) {
		      if(yj < y && y < yi) {
		        var s = orient(a, b, point);
		        if(s === 0) {
		          return 0
		        } else {
		          inside ^= (0 < s)|0;
		        }
		      } else if(y === yi) {
		        var c = vs[(i+1)%n];
		        var yk = c[1];
		        if(yi < yk) {
		          var s = orient(a, b, point);
		          if(s === 0) {
		            return 0
		          } else {
		            inside ^= (0 < s)|0;
		          }
		        }
		      }
		    } else if(yi < yj) {
		      if(yi < y && y < yj) {
		        var s = orient(a, b, point);
		        if(s === 0) {
		          return 0
		        } else {
		          inside ^= (s < 0)|0;
		        }
		      } else if(y === yi) {
		        var c = vs[(i+1)%n];
		        var yk = c[1];
		        if(yk < yi) {
		          var s = orient(a, b, point);
		          if(s === 0) {
		            return 0
		          } else {
		            inside ^= (s < 0)|0;
		          }
		        }
		      }
		    } else if(y === yi) {
		      var x0 = Math.min(a[0], b[0]);
		      var x1 = Math.max(a[0], b[0]);
		      if(i === 0) {
		        while(j>0) {
		          var k = (j+n-1)%n;
		          var p = vs[k];
		          if(p[1] !== y) {
		            break
		          }
		          var px = p[0];
		          x0 = Math.min(x0, px);
		          x1 = Math.max(x1, px);
		          j = k;
		        }
		        if(j === 0) {
		          if(x0 <= x && x <= x1) {
		            return 0
		          }
		          return 1
		        }
		        lim = j+1;
		      }
		      var y0 = vs[(j+n-1)%n][1];
		      while(i+1<lim) {
		        var p = vs[i+1];
		        if(p[1] !== y) {
		          break
		        }
		        var px = p[0];
		        x0 = Math.min(x0, px);
		        x1 = Math.max(x1, px);
		        i += 1;
		      }
		      if(x0 <= x && x <= x1) {
		        return 0
		      }
		      var y1 = vs[(i+1)%n][1];
		      if(x < x0 && (y0 < y !== y1 < y)) {
		        inside ^= 1;
		      }
		    }
		  }
		  return 2 * inside - 1
		}
		return robustPnp;
	}

	var robustPnpExports = requireRobustPnp();
	var pointInPolygon2 = /*@__PURE__*/getDefaultExportFromCjs(robustPnpExports);

	// src/HexMap.ts
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

	// src/enums.ts
	var Land = /* @__PURE__ */ ((Land2) => {
	  Land2["sea"] = "sea";
	  Land2["coastal"] = "coastal";
	  Land2["land"] = "land";
	  Land2["sand"] = "sand";
	  Land2["tundra"] = "tundra";
	  Land2["snow"] = "snow";
	  Land2["mountain"] = "mountain";
	  return Land2;
	})(Land || {});
	var LandColor = {
	  ["land" /* land */]: 8694355,
	  ["coastal" /* coastal */]: 5205120,
	  ["sea" /* sea */]: 2766476,
	  ["sand" /* sand */]: 11446117,
	  ["tundra" /* tundra */]: 16777215,
	  ["snow" /* snow */]: 16777215,
	  ["mountain" /* mountain */]: 9142389
	};
	var LandPriority = {
	  ["sea" /* sea */]: 0,
	  ["coastal" /* coastal */]: 1,
	  ["land" /* land */]: 2,
	  ["sand" /* sand */]: 3,
	  ["tundra" /* tundra */]: 4,
	  ["snow" /* snow */]: 5,
	  ["mountain" /* mountain */]: 6
	};
	var UnitActions = /* @__PURE__ */ ((UnitActions2) => {
	  UnitActions2["attack"] = "attack";
	  UnitActions2["walk"] = "walk";
	  UnitActions2["distanceAttack"] = "distanceAttack";
	  UnitActions2["death"] = "death";
	  UnitActions2["idle"] = "idle";
	  UnitActions2["defence"] = "defence";
	  return UnitActions2;
	})(UnitActions || {});

	// src/helpers/helpers.ts
	function pointy_hex_corner(center, size, i) {
	  let angle_deg = 60 * i;
	  let angle_rad = Math.PI / 180 * angle_deg;
	  return {
	    "x": Math.round(center.x + size * Math.cos(angle_rad)),
	    "y": Math.round(center.y + size * Math.sin(angle_rad))
	  };
	}
	function HEXPolygon(center = { x: 0, y: 0 }, size = 1) {
	  let arrPoints = [];
	  for (let i = 1; i <= 6; i++) {
	    arrPoints.push(pointy_hex_corner(center, size, i));
	  }
	  return arrPoints;
	}
	function getHexCenter(x, y, size) {
	  let space = 0;
	  if (x % 2 === 0) {
	    space = size * Math.sqrt(3) / 2;
	  }
	  return { x: x * size * 1.5, y: y * size * Math.sqrt(3) + space };
	}
	function wait(ms) {
	  return new Promise(function(resolve, reject) {
	    setTimeout(resolve, ms);
	  });
	}

	// src/helpers/neighbors.ts
	var NEIGHBOR_DIRECTIONS = ["NE", "N", "NW", "SW", "S", "SE"];
	function getNeighborCoords(x, y, direction) {
	  const odd = x % 2 !== 0;
	  switch (direction) {
	    case "NE":
	      return { x: x + 1, y: odd ? y - 1 : y };
	    case "N":
	      return { x, y: y - 1 };
	    case "NW":
	      return { x: x - 1, y: odd ? y - 1 : y };
	    case "SW":
	      return { x: x - 1, y: odd ? y : y + 1 };
	    case "S":
	      return { x, y: y + 1 };
	    case "SE":
	      return { x: x + 1, y: odd ? y : y + 1 };
	  }
	}
	function getNeighbors(x, y) {
	  return NEIGHBOR_DIRECTIONS.map((direction) => ({ direction, ...getNeighborCoords(x, y, direction) }));
	}

	// src/helpers/topology.ts
	function positiveModulo(value, modulus) {
	  if (!Number.isFinite(value) || !Number.isFinite(modulus) || modulus <= 0) {
	    throw new RangeError("positiveModulo requires a finite value and a positive finite modulus");
	  }
	  return (value % modulus + modulus) % modulus;
	}
	function normalizeMapCoordinates(map, x, y) {
	  if (map.infinite) {
	    return Number.isInteger(x) && Number.isInteger(y) ? { x, y } : null;
	  }
	  if (map.w <= 0 || map.h <= 0) return null;
	  let normalizedX = x;
	  let normalizedY = y;
	  if (map.wrapX) normalizedX = positiveModulo(normalizedX, map.w);
	  else if (normalizedX < 0 || normalizedX >= map.w) return null;
	  if (map.wrapY) normalizedY = positiveModulo(normalizedY, map.h);
	  else if (normalizedY < 0 || normalizedY >= map.h) return null;
	  return { x: normalizedX, y: normalizedY };
	}
	function getMapTile(map, x, y) {
	  const normalized = normalizeMapCoordinates(map, x, y);
	  if (!normalized) return void 0;
	  return map.tileAt?.(normalized.x, normalized.y) ?? map.data[normalized.x]?.[normalized.y];
	}
	function getMapNeighbors(map, x, y) {
	  const seen = /* @__PURE__ */ new Set();
	  const neighbors = [];
	  for (const neighbor of getNeighbors(x, y)) {
	    const normalized = normalizeMapCoordinates(map, neighbor.x, neighbor.y);
	    if (!normalized) continue;
	    const key = `${normalized.x},${normalized.y}`;
	    if (seen.has(key)) continue;
	    seen.add(key);
	    neighbors.push({ ...normalized, direction: neighbor.direction });
	  }
	  return neighbors;
	}
	function assertWrappableMap(map) {
	  if (!Number.isInteger(map.w) || !Number.isInteger(map.h) || map.w <= 0 || map.h <= 0) {
	    throw new RangeError("map width and height must be positive integers");
	  }
	  if (!map.data || typeof map.data !== "object") {
	    throw new TypeError("map data must be an object");
	  }
	  if (map.tileAt !== void 0 && typeof map.tileAt !== "function") {
	    throw new TypeError("map tileAt must be a function when provided");
	  }
	  if (map.forEachTile !== void 0 && typeof map.forEachTile !== "function") {
	    throw new TypeError("map forEachTile must be a function when provided");
	  }
	  if (map.wrapX !== void 0 && typeof map.wrapX !== "boolean") {
	    throw new TypeError("wrapX must be a boolean when provided");
	  }
	  if (map.wrapY !== void 0 && typeof map.wrapY !== "boolean") {
	    throw new TypeError("wrapY must be a boolean when provided");
	  }
	  if (map.infinite !== void 0 && typeof map.infinite !== "boolean") {
	    throw new TypeError("infinite must be a boolean when provided");
	  }
	  if (map.infinite && (map.wrapX || map.wrapY)) {
	    throw new RangeError("infinite maps cannot use finite-axis wrapping");
	  }
	  if (map.wrapX && map.w % 2 !== 0) {
	    throw new RangeError("wrapX requires an even map width");
	  }
	}

	// src/helpers/picking.ts
	var GROUND_PLANE = new three.Plane(new three.Vector3(0, 1, 0), 0);
	function screenToGround(clientX, clientY, canvas, camera) {
	  const rect = canvas.getBoundingClientRect();
	  if (rect.width <= 0 || rect.height <= 0) return null;
	  const ndc = new three.Vector2(
	    (clientX - rect.left) / rect.width * 2 - 1,
	    -((clientY - rect.top) / rect.height) * 2 + 1
	  );
	  const raycaster = new three.Raycaster();
	  raycaster.setFromCamera(ndc, camera);
	  const point = new three.Vector3();
	  return raycaster.ray.intersectPlane(GROUND_PLANE, point) ? point : null;
	}
	function pickTile(worldPoint, size, mapWidth, mapHeight, wrapX = false, wrapY = false) {
	  if (!Number.isFinite(size) || size <= 0) return null;
	  if (mapWidth !== void 0 && (!Number.isInteger(mapWidth) || mapWidth <= 0)) return null;
	  if (mapHeight !== void 0 && (!Number.isInteger(mapHeight) || mapHeight <= 0)) return null;
	  if (wrapX && mapWidth === void 0 || wrapY && mapHeight === void 0) return null;
	  const approxX = worldPoint.x / (size * 1.5);
	  const approxY = worldPoint.z / (size * Math.sqrt(3));
	  const x0 = Math.floor(approxX);
	  const y0 = Math.floor(approxY);
	  let best = null;
	  let bestDist = Infinity;
	  for (let dx = -1; dx <= 1; dx++) {
	    for (let dy = -1; dy <= 1; dy++) {
	      const rawX = x0 + dx;
	      const rawY = y0 + dy;
	      const center = getHexCenter(rawX, rawY, size);
	      const dist = (center.x - worldPoint.x) ** 2 + (center.y - worldPoint.z) ** 2;
	      if (dist < bestDist) {
	        bestDist = dist;
	        best = { x: rawX, y: rawY, worldX: center.x, worldY: center.y };
	      }
	    }
	  }
	  if (!best) return null;
	  if (!wrapX && (best.x < 0 || mapWidth !== void 0 && best.x >= mapWidth)) return null;
	  if (!wrapY && (best.y < 0 || mapHeight !== void 0 && best.y >= mapHeight)) return null;
	  return {
	    ...best,
	    x: wrapX ? positiveModulo(best.x, mapWidth) : best.x,
	    y: wrapY ? positiveModulo(best.y, mapHeight) : best.y
	  };
	}

	// src/helpers/mapData.ts
	function forEachMapTile(map, visit) {
	  if (map.forEachTile) {
	    map.forEachTile(visit);
	    return;
	  }
	  for (const xKey of Object.keys(map.data)) {
	    const x = Number(xKey);
	    if (!Number.isInteger(x)) continue;
	    const column = map.data[x];
	    if (!column) continue;
	    for (const yKey of Object.keys(column)) {
	      const y = Number(yKey);
	      const tile = column[y];
	      if (!Number.isInteger(y) || !tile) continue;
	      visit(tile, x, y);
	    }
	  }
	}

	// src/helpers/chunks.ts
	var WORLD_CHUNK_SIZE = 12;
	var WORLD_CHUNK_METADATA = "hexWorldChunk";
	var DEFAULT_WORLD_CHUNK_LOD_DISTANCES = Object.freeze({
	  near: 900,
	  far: 1650,
	  vegetation: 1450,
	  hysteresis: 120
	});
	function getWorldChunkKey(x, y, chunkSize = WORLD_CHUNK_SIZE) {
	  if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
	    throw new RangeError("chunkSize must be a positive integer");
	  }
	  return `${Math.floor(x / chunkSize)},${Math.floor(y / chunkSize)}`;
	}
	function groupTilesByWorldChunk(tiles, chunkSize = WORLD_CHUNK_SIZE) {
	  if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
	    throw new RangeError("chunkSize must be a positive integer");
	  }
	  const chunks = /* @__PURE__ */ new Map();
	  for (const tile of tiles) {
	    const key = getWorldChunkKey(tile.x, tile.y, chunkSize);
	    const chunk = chunks.get(key) ?? [];
	    chunk.push(tile);
	    chunks.set(key, chunk);
	  }
	  return chunks;
	}
	function getWorldChunkBounds(tiles, size, minY, maxY) {
	  if (tiles.length === 0) throw new Error("Cannot compute bounds for an empty world chunk");
	  let minX = Infinity;
	  let maxX = -Infinity;
	  let minZ = Infinity;
	  let maxZ = -Infinity;
	  for (const tile of tiles) {
	    const center = getHexCenter(tile.x, tile.y, size);
	    minX = Math.min(minX, center.x - size);
	    maxX = Math.max(maxX, center.x + size);
	    minZ = Math.min(minZ, center.y - size);
	    maxZ = Math.max(maxZ, center.y + size);
	  }
	  return { minX, maxX, minY, maxY, minZ, maxZ };
	}
	function getWorldChunkOrigin(chunkKey, size) {
	  const [chunkX, chunkY] = chunkKey.split(",").map(Number);
	  if (!Number.isInteger(chunkX) || !Number.isInteger(chunkY)) {
	    throw new TypeError(`invalid world chunk key "${chunkKey}"`);
	  }
	  return getHexCenter(chunkX * WORLD_CHUNK_SIZE, chunkY * WORLD_CHUNK_SIZE, size);
	}
	function localizeWorldChunkBounds(bounds, origin) {
	  return {
	    minX: bounds.minX - origin.x,
	    maxX: bounds.maxX - origin.x,
	    minY: bounds.minY,
	    maxY: bounds.maxY,
	    minZ: bounds.minZ - origin.y,
	    maxZ: bounds.maxZ - origin.y
	  };
	}
	function tagWorldChunk(object, chunkKey, kind, bounds, id = `${kind}:${chunkKey}`) {
	  const [chunkX, chunkY] = chunkKey.split(",").map(Number);
	  object.userData[WORLD_CHUNK_METADATA] = {
	    id,
	    key: chunkKey,
	    chunkX,
	    chunkY,
	    kind,
	    bounds
	  };
	}
	function getWorldChunkMetadata(object) {
	  return object.userData[WORLD_CHUNK_METADATA];
	}
	function resolveWorldChunkLod(distance, kind, previous, distances = DEFAULT_WORLD_CHUNK_LOD_DISTANCES) {
	  const decorative = kind === "grass" || kind === "forest";
	  const hiddenBeyond = decorative ? distances.vegetation : Infinity;
	  if (distance > hiddenBeyond + (previous === void 0 ? 0 : distances.hysteresis)) return null;
	  const near = distances.near;
	  const far = decorative ? distances.vegetation : distances.far;
	  const h = previous === void 0 ? 0 : distances.hysteresis;
	  if (previous === 0 && distance <= near + h) return 0;
	  if (previous === 1) {
	    if (distance < near - h) return 0;
	    if (distance <= far + h) return 1;
	  }
	  if (previous === 2 && distance >= far - h) return 2;
	  if (distance <= near) return 0;
	  if (distance <= far) return 1;
	  return decorative ? null : 2;
	}

	// src/helpers/rivers.ts
	var MASK_DIRECTIONS = ["SE", "S", "SW", "NW", "N", "NE"];
	var LAKE_FLAG = 4096;
	var EDGE_DIRS = [
	  [0.8660254, 0.5],
	  // SE
	  [0, 1],
	  // S
	  [-0.8660254, 0.5],
	  // SW
	  [-0.8660254, -0.5],
	  // NW
	  [0, -1],
	  // N
	  [0.8660254, -0.5]
	  // NE
	];
	function isRiverTile(tile) {
	  return !!tile?.modifiers?.includes("river");
	}
	function isLakeTile(tile) {
	  return !!tile?.modifiers?.includes("lake");
	}
	function isSeaOrCoastal(tile) {
	  return tile.type === "sea" /* sea */ || tile.type === "coastal" /* coastal */;
	}
	function waterEdgeValue(map, x, y) {
	  const tile = getMapTile(map, x, y);
	  if (isLakeTile(tile)) {
	    let openMask = 0, channelMask = 0;
	    MASK_DIRECTIONS.forEach((direction, bit) => {
	      const n = getNeighborCoords(x, y, direction);
	      const neighbor = getMapTile(map, n.x, n.y);
	      if (!neighbor) return;
	      if (isLakeTile(neighbor) || isSeaOrCoastal(neighbor)) openMask |= 1 << bit;
	      else if (isRiverTile(neighbor)) channelMask |= 1 << bit;
	    });
	    return LAKE_FLAG + openMask * 64 + channelMask;
	  }
	  if (isRiverTile(tile)) {
	    let mask = 0;
	    MASK_DIRECTIONS.forEach((direction, bit) => {
	      const n = getNeighborCoords(x, y, direction);
	      const neighbor = getMapTile(map, n.x, n.y);
	      if (!neighbor) return;
	      if (isRiverTile(neighbor) || isLakeTile(neighbor) || isSeaOrCoastal(neighbor)) mask |= 1 << bit;
	    });
	    return mask;
	  }
	  return -1;
	}
	function riverSeaMouthEdgeValue(map, x, y) {
	  const tile = getMapTile(map, x, y);
	  if (!isRiverTile(tile)) return 0;
	  let mask = 0;
	  MASK_DIRECTIONS.forEach((direction, bit) => {
	    const n = getNeighborCoords(x, y, direction);
	    const neighbor = getMapTile(map, n.x, n.y);
	    if (neighbor && isSeaOrCoastal(neighbor)) mask |= 1 << bit;
	  });
	  return mask;
	}
	function riverLakeMouthEdgeValue(map, x, y) {
	  const tile = getMapTile(map, x, y);
	  if (!isRiverTile(tile)) return 0;
	  let mask = 0;
	  MASK_DIRECTIONS.forEach((direction, bit) => {
	    const n = getNeighborCoords(x, y, direction);
	    const neighbor = getMapTile(map, n.x, n.y);
	    if (isLakeTile(neighbor)) mask |= 1 << bit;
	  });
	  return mask;
	}
	function lakeNeighborEdgeValue(map, x, y) {
	  const tile = getMapTile(map, x, y);
	  if (!tile || isLakeTile(tile)) return 0;
	  let mask = 0;
	  MASK_DIRECTIONS.forEach((direction, bit) => {
	    const n = getNeighborCoords(x, y, direction);
	    if (isLakeTile(getMapTile(map, n.x, n.y))) mask |= 1 << bit;
	  });
	  return mask;
	}
	function riverChannelDistance(lx, ly, mask, size) {
	  if (mask < 0) return Infinity;
	  const apothem = size * 0.8660254;
	  let best = Math.hypot(lx, ly);
	  for (let bit = 0; bit < 6; bit++) {
	    if (!(mask & 1 << bit)) continue;
	    const [dx, dy] = EDGE_DIRS[bit];
	    const t = Math.min(Math.max(lx * dx + ly * dy, 0), apothem);
	    best = Math.min(best, Math.hypot(lx - dx * t, ly - dy * t));
	  }
	  return best;
	}
	function isInRiverMouthWater(lx, ly, mask, size, options) {
	  if (mask <= 0) return false;
	  const apothem = size * 0.8660254;
	  const wobble = 0.3 * options.riverCurvature + 0.03;
	  for (let bit = 0; bit < 6; bit++) {
	    if (!(mask & 1 << bit)) continue;
	    const [dx, dy] = EDGE_DIRS[bit];
	    const t = Math.min(Math.max(lx * dx + ly * dy, 0), apothem);
	    const progress = t / apothem;
	    const mouthWidth = options.riverWidth + (0.4 - options.riverWidth) * progress * progress * (3 - 2 * progress);
	    const clearance = (mouthWidth + Math.max(options.riverBankWidth, wobble)) * size;
	    if (Math.hypot(lx - dx * t, ly - dy * t) < clearance) return true;
	  }
	  return false;
	}
	function isInLakeNeighborWater(lx, ly, mask, size, options) {
	  if (mask <= 0) return false;
	  const apothem = size * 0.8660254;
	  const wobble = 0.3 * options.riverCurvature + 0.03;
	  let shore = 0;
	  for (let bit = 0; bit < 6; bit++) {
	    if (!(mask & 1 << bit)) continue;
	    const [dx, dy] = EDGE_DIRS[bit];
	    shore = Math.max(shore, (lx * dx + ly * dy) / apothem);
	  }
	  return shore + wobble >= 1 - options.lakeShoreWidth;
	}
	function isInTileWater(lx, ly, value, size, options, riverSeaMouthValue = 0, riverLakeMouthValue = 0, lakeNeighborValue = 0) {
	  if (isInLakeNeighborWater(lx, ly, lakeNeighborValue, size, options)) return true;
	  if (value < 0) return false;
	  const wobble = 0.3 * options.riverCurvature + 0.03;
	  const channelClearance = (options.riverWidth + Math.max(options.riverBankWidth, wobble)) * size;
	  if (value >= LAKE_FLAG) {
	    return true;
	  }
	  return riverChannelDistance(lx, ly, value, size) < channelClearance || isInRiverMouthWater(lx, ly, riverSeaMouthValue, size, options) || isInRiverMouthWater(lx, ly, riverLakeMouthValue, size, options);
	}
	function subdivideTriangle(a, b, c, numSubdivisions) {
	  if ((numSubdivisions || 0) <= 0) return [a, b, c];
	  const ba = b.clone().sub(a);
	  const ah = a.clone().add(ba.setLength(ba.length() / 2));
	  const cb = c.clone().sub(b);
	  const bh = b.clone().add(cb.setLength(cb.length() / 2));
	  const ac = a.clone().sub(c);
	  const ch = c.clone().add(ac.setLength(ac.length() / 2));
	  return [].concat(
	    subdivideTriangle(ah, bh, ch, numSubdivisions - 1),
	    subdivideTriangle(ch, bh, c, numSubdivisions - 1),
	    subdivideTriangle(ah, ch, a, numSubdivisions - 1),
	    subdivideTriangle(bh, ah, b, numSubdivisions - 1)
	  );
	}
	function createHexagonGeometry(radius, numSubdivisions = 0) {
	  const numFaces = 6 * Math.pow(4, numSubdivisions);
	  const positions = new Float32Array(numFaces * 3 * 3);
	  const texcoords = new Float32Array(numFaces * 3 * 2);
	  let p = 0, t = 0;
	  const points = [0, 1, 2, 3, 4, 5].map((i) => {
	    const angle = Math.PI / 180 * (60 * i);
	    return new three.Vector3(radius * Math.cos(angle), 0, radius * Math.sin(angle));
	  }).concat([new three.Vector3(0, 0, 0)]);
	  const faces = [0, 6, 1, 1, 6, 2, 2, 6, 3, 3, 6, 4, 4, 6, 5, 5, 6, 0];
	  let vertices = [];
	  for (let i = 0; i < faces.length; i += 3) {
	    const a = points[faces[i]], b = points[faces[i + 1]], c = points[faces[i + 2]];
	    vertices = vertices.concat(subdivideTriangle(a, b, c, numSubdivisions));
	  }
	  for (let i = 0; i < vertices.length; i++) {
	    positions[p++] = vertices[i].x;
	    positions[p++] = vertices[i].y;
	    positions[p++] = vertices[i].z;
	    texcoords[t++] = 0.02 + 0.96 * ((vertices[i].x + radius) / (radius * 2));
	    texcoords[t++] = 0.02 + 0.96 * ((vertices[i].z + radius) / (radius * 2));
	  }
	  const geometry = new three.BufferGeometry();
	  geometry.setAttribute("position", new three.BufferAttribute(positions, 3));
	  geometry.setAttribute("uv", new three.BufferAttribute(texcoords, 2));
	  return geometry;
	}
	function createHexagonLodGeometry(radius, interiorSubdivisions, borderSubdivisions) {
	  if (interiorSubdivisions >= borderSubdivisions) {
	    return createHexagonGeometry(radius, borderSubdivisions);
	  }
	  const outerSegments = Math.pow(2, borderSubdivisions);
	  const innerSegments = Math.pow(2, Math.max(0, interiorSubdivisions));
	  const innerScale = 0.72;
	  const triangles = [];
	  const center = new three.Vector3();
	  const corners = Array.from({ length: 6 }, (_, index) => {
	    const angle = index * Math.PI / 3;
	    return new three.Vector3(radius * Math.cos(angle), 0, radius * Math.sin(angle));
	  });
	  const appendTriangle = (a, b, c) => {
	    const crossY = b.clone().sub(a).cross(c.clone().sub(a)).y;
	    if (crossY >= 0) triangles.push(a, b, c);
	    else triangles.push(a, c, b);
	  };
	  for (let side = 0; side < 6; side++) {
	    const a = corners[side];
	    const b = corners[(side + 1) % 6];
	    const outer = Array.from(
	      { length: outerSegments + 1 },
	      (_, index) => a.clone().lerp(b, index / outerSegments)
	    );
	    const innerA = a.clone().multiplyScalar(innerScale);
	    const innerB = b.clone().multiplyScalar(innerScale);
	    const inner = Array.from(
	      { length: innerSegments + 1 },
	      (_, index) => innerA.clone().lerp(innerB, index / innerSegments)
	    );
	    let outerIndex = 0;
	    let innerIndex = 0;
	    while (outerIndex < outerSegments || innerIndex < innerSegments) {
	      const nextOuter = outerIndex < outerSegments ? (outerIndex + 1) / outerSegments : Infinity;
	      const nextInner = innerIndex < innerSegments ? (innerIndex + 1) / innerSegments : Infinity;
	      if (Math.abs(nextOuter - nextInner) < 1e-9) {
	        appendTriangle(outer[outerIndex], inner[innerIndex], outer[outerIndex + 1]);
	        appendTriangle(outer[outerIndex + 1], inner[innerIndex], inner[innerIndex + 1]);
	        outerIndex++;
	        innerIndex++;
	      } else if (nextOuter < nextInner) {
	        appendTriangle(outer[outerIndex], inner[innerIndex], outer[outerIndex + 1]);
	        outerIndex++;
	      } else {
	        appendTriangle(outer[outerIndex], inner[innerIndex], inner[innerIndex + 1]);
	        innerIndex++;
	      }
	    }
	    for (let index = 0; index < innerSegments; index++) {
	      appendTriangle(inner[index], center, inner[index + 1]);
	    }
	  }
	  const positions = new Float32Array(triangles.length * 3);
	  const texcoords = new Float32Array(triangles.length * 2);
	  triangles.forEach((vertex, index) => {
	    positions[index * 3] = vertex.x;
	    positions[index * 3 + 1] = vertex.y;
	    positions[index * 3 + 2] = vertex.z;
	    texcoords[index * 2] = 0.02 + 0.96 * ((vertex.x + radius) / (radius * 2));
	    texcoords[index * 2 + 1] = 0.02 + 0.96 * ((vertex.z + radius) / (radius * 2));
	  });
	  const geometry = new three.BufferGeometry();
	  geometry.setAttribute("position", new three.BufferAttribute(positions, 3));
	  geometry.setAttribute("uv", new three.BufferAttribute(texcoords, 2));
	  return geometry;
	}
	function makeTextSprite(message, parameters = {}) {
	  const fontface = parameters.fontface ?? "Arial";
	  const fontsize = parameters.fontsize ?? 18;
	  const borderThickness = parameters.borderThickness ?? 4;
	  const borderColor = parameters.borderColor ?? { r: 0, g: 0, b: 0, a: 1 };
	  const backgroundColor = parameters.backgroundColor ?? { r: 255, g: 255, b: 255, a: 1 };
	  const canvas = document.createElement("canvas");
	  let context = canvas.getContext("2d");
	  if (!context) throw new Error("Unable to create a 2D canvas context for city label");
	  context.font = "Bold " + fontsize + "px " + fontface;
	  let metrics = context.measureText(message);
	  let textWidth = metrics.width;
	  const width = Math.ceil(textWidth + borderThickness * 2);
	  const height = Math.ceil(fontsize * 1.4 + borderThickness * 2);
	  canvas.width = width;
	  canvas.height = height;
	  context = canvas.getContext("2d");
	  if (!context) throw new Error("Unable to recreate the 2D canvas context for city label");
	  context.font = "Bold " + fontsize + "px " + fontface;
	  context.fillStyle = "rgba(" + backgroundColor.r + "," + backgroundColor.g + "," + backgroundColor.b + "," + backgroundColor.a + ")";
	  context.strokeStyle = "rgba(" + borderColor.r + "," + borderColor.g + "," + borderColor.b + "," + borderColor.a + ")";
	  context.lineWidth = borderThickness;
	  roundRect(context, borderThickness / 2, borderThickness / 2, textWidth + borderThickness, fontsize * 1.4 + borderThickness, 6);
	  context.fillStyle = "rgba(0, 0, 0, 1.0)";
	  context.fillText(message, borderThickness, fontsize + borderThickness);
	  const texture = new three.Texture(canvas);
	  texture.needsUpdate = true;
	  const spriteMaterial = new three.SpriteMaterial(
	    { map: texture, transparent: true, depthWrite: false }
	  );
	  const sprite = new three.Sprite(spriteMaterial);
	  const scale = 100 / 300;
	  sprite.scale.set(width * scale, height * scale, 1);
	  return sprite;
	}
	function roundRect(ctx, x, y, w, h, r) {
	  ctx.beginPath();
	  ctx.moveTo(x + r, y);
	  ctx.lineTo(x + w - r, y);
	  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
	  ctx.lineTo(x + w, y + h - r);
	  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
	  ctx.lineTo(x + r, y + h);
	  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
	  ctx.lineTo(x, y + r);
	  ctx.quadraticCurveTo(x, y, x + r, y);
	  ctx.closePath();
	  ctx.fill();
	  ctx.stroke();
	}
	function toTrianglesDrawMode(geometry, drawMode) {
	  if (drawMode === three.TrianglesDrawMode) {
	    console.warn("THREE.BufferGeometryUtils.toTrianglesDrawMode(): Geometry already defined as triangles.");
	    return geometry;
	  }
	  if (drawMode === three.TriangleFanDrawMode || drawMode === three.TriangleStripDrawMode) {
	    let index = geometry.getIndex();
	    if (index === null) {
	      const indices = [];
	      const position = geometry.getAttribute("position");
	      if (position !== void 0) {
	        for (let i = 0; i < position.count; i++) {
	          indices.push(i);
	        }
	        geometry.setIndex(indices);
	        index = geometry.getIndex();
	      } else {
	        console.error("THREE.BufferGeometryUtils.toTrianglesDrawMode(): Undefined position attribute. Processing not possible.");
	        return geometry;
	      }
	    }
	    const numberOfTriangles = index.count - 2;
	    const newIndices = [];
	    if (drawMode === three.TriangleFanDrawMode) {
	      for (let i = 1; i <= numberOfTriangles; i++) {
	        newIndices.push(index.getX(0));
	        newIndices.push(index.getX(i));
	        newIndices.push(index.getX(i + 1));
	      }
	    } else {
	      for (let i = 0; i < numberOfTriangles; i++) {
	        if (i % 2 === 0) {
	          newIndices.push(index.getX(i));
	          newIndices.push(index.getX(i + 1));
	          newIndices.push(index.getX(i + 2));
	        } else {
	          newIndices.push(index.getX(i + 2));
	          newIndices.push(index.getX(i + 1));
	          newIndices.push(index.getX(i));
	        }
	      }
	    }
	    if (newIndices.length / 3 !== numberOfTriangles) {
	      console.error("THREE.BufferGeometryUtils.toTrianglesDrawMode(): Unable to generate correct amount of triangles.");
	    }
	    const newGeometry = geometry.clone();
	    newGeometry.setIndex(newIndices);
	    newGeometry.clearGroups();
	    return newGeometry;
	  } else {
	    console.error("THREE.BufferGeometryUtils.toTrianglesDrawMode(): Unknown draw mode:", drawMode);
	    return geometry;
	  }
	}
	function clone(source) {
	  const sourceLookup = /* @__PURE__ */ new Map();
	  const cloneLookup = /* @__PURE__ */ new Map();
	  const clone2 = source.clone();
	  parallelTraverse(source, clone2, function(sourceNode, clonedNode) {
	    sourceLookup.set(clonedNode, sourceNode);
	    cloneLookup.set(sourceNode, clonedNode);
	  });
	  clone2.traverse(function(node) {
	    if (!node.isSkinnedMesh) return;
	    const clonedMesh = node;
	    const sourceMesh = sourceLookup.get(node);
	    const sourceBones = sourceMesh.skeleton.bones;
	    clonedMesh.skeleton = sourceMesh.skeleton.clone();
	    clonedMesh.bindMatrix.copy(sourceMesh.bindMatrix);
	    clonedMesh.skeleton.bones = sourceBones.map(function(bone) {
	      return cloneLookup.get(bone);
	    });
	    clonedMesh.bind(clonedMesh.skeleton, clonedMesh.bindMatrix);
	  });
	  return clone2;
	}
	function parallelTraverse(a, b, callback) {
	  callback(a, b);
	  for (let i = 0; i < a.children.length; i++) {
	    parallelTraverse(a.children[i], b.children[i], callback);
	  }
	}

	// node_modules/three/examples/jsm/loaders/GLTFLoader.js
	var GLTFLoader = class extends three.Loader {
	  /**
	   * Constructs a new glTF loader.
	   *
	   * @param {LoadingManager} [manager] - The loading manager.
	   */
	  constructor(manager) {
	    super(manager);
	    this.dracoLoader = null;
	    this.ktx2Loader = null;
	    this.meshoptDecoder = null;
	    this.pluginCallbacks = [];
	    this.register(function(parser) {
	      return new GLTFMaterialsClearcoatExtension(parser);
	    });
	    this.register(function(parser) {
	      return new GLTFMaterialsDispersionExtension(parser);
	    });
	    this.register(function(parser) {
	      return new GLTFTextureBasisUExtension(parser);
	    });
	    this.register(function(parser) {
	      return new GLTFTextureWebPExtension(parser);
	    });
	    this.register(function(parser) {
	      return new GLTFTextureAVIFExtension(parser);
	    });
	    this.register(function(parser) {
	      return new GLTFMaterialsSheenExtension(parser);
	    });
	    this.register(function(parser) {
	      return new GLTFMaterialsTransmissionExtension(parser);
	    });
	    this.register(function(parser) {
	      return new GLTFMaterialsVolumeExtension(parser);
	    });
	    this.register(function(parser) {
	      return new GLTFMaterialsIorExtension(parser);
	    });
	    this.register(function(parser) {
	      return new GLTFMaterialsEmissiveStrengthExtension(parser);
	    });
	    this.register(function(parser) {
	      return new GLTFMaterialsSpecularExtension(parser);
	    });
	    this.register(function(parser) {
	      return new GLTFMaterialsIridescenceExtension(parser);
	    });
	    this.register(function(parser) {
	      return new GLTFMaterialsAnisotropyExtension(parser);
	    });
	    this.register(function(parser) {
	      return new GLTFMaterialsBumpExtension(parser);
	    });
	    this.register(function(parser) {
	      return new GLTFLightsExtension(parser);
	    });
	    this.register(function(parser) {
	      return new GLTFMeshoptCompression(parser, EXTENSIONS.EXT_MESHOPT_COMPRESSION);
	    });
	    this.register(function(parser) {
	      return new GLTFMeshoptCompression(parser, EXTENSIONS.KHR_MESHOPT_COMPRESSION);
	    });
	    this.register(function(parser) {
	      return new GLTFMeshGpuInstancing(parser);
	    });
	  }
	  /**
	   * Starts loading from the given URL and passes the loaded glTF asset
	   * to the `onLoad()` callback.
	   *
	   * @param {string} url - The path/URL of the file to be loaded. This can also be a data URI.
	   * @param {function(GLTFLoader~LoadObject)} onLoad - Executed when the loading process has been finished.
	   * @param {onProgressCallback} onProgress - Executed while the loading is in progress.
	   * @param {onErrorCallback} onError - Executed when errors occur.
	   */
	  load(url, onLoad, onProgress, onError) {
	    const scope = this;
	    let resourcePath;
	    if (this.resourcePath !== "") {
	      resourcePath = this.resourcePath;
	    } else if (this.path !== "") {
	      const relativeUrl = three.LoaderUtils.extractUrlBase(url);
	      resourcePath = three.LoaderUtils.resolveURL(relativeUrl, this.path);
	    } else {
	      resourcePath = three.LoaderUtils.extractUrlBase(url);
	    }
	    this.manager.itemStart(url);
	    const _onError = function(e) {
	      if (onError) {
	        onError(e);
	      } else {
	        console.error(e);
	      }
	      scope.manager.itemError(url);
	      scope.manager.itemEnd(url);
	    };
	    const loader = new three.FileLoader(this.manager);
	    loader.setPath(this.path);
	    loader.setResponseType("arraybuffer");
	    loader.setRequestHeader(this.requestHeader);
	    loader.setWithCredentials(this.withCredentials);
	    loader.load(url, function(data) {
	      try {
	        scope.parse(data, resourcePath, function(gltf) {
	          onLoad(gltf);
	          scope.manager.itemEnd(url);
	        }, _onError);
	      } catch (e) {
	        _onError(e);
	      }
	    }, onProgress, _onError);
	  }
	  /**
	   * Sets the given Draco loader to this loader. Required for decoding assets
	   * compressed with the `KHR_draco_mesh_compression` extension.
	   *
	   * @param {DRACOLoader} dracoLoader - The Draco loader to set.
	   * @return {GLTFLoader} A reference to this loader.
	   */
	  setDRACOLoader(dracoLoader) {
	    this.dracoLoader = dracoLoader;
	    return this;
	  }
	  /**
	   * Sets the given KTX2 loader to this loader. Required for loading KTX2
	   * compressed textures.
	   *
	   * @param {KTX2Loader} ktx2Loader - The KTX2 loader to set.
	   * @return {GLTFLoader} A reference to this loader.
	   */
	  setKTX2Loader(ktx2Loader) {
	    this.ktx2Loader = ktx2Loader;
	    return this;
	  }
	  /**
	   * Sets the given meshopt decoder. Required for decoding assets
	   * compressed with the `EXT_meshopt_compression` extension.
	   *
	   * @param {Object} meshoptDecoder - The meshopt decoder to set.
	   * @return {GLTFLoader} A reference to this loader.
	   */
	  setMeshoptDecoder(meshoptDecoder) {
	    this.meshoptDecoder = meshoptDecoder;
	    return this;
	  }
	  /**
	   * Registers a plugin callback. This API is internally used to implement the various
	   * glTF extensions but can also used by third-party code to add additional logic
	   * to the loader.
	   *
	   * @param {function(parser:GLTFParser)} callback - The callback function to register.
	   * @return {GLTFLoader} A reference to this loader.
	   */
	  register(callback) {
	    if (this.pluginCallbacks.indexOf(callback) === -1) {
	      this.pluginCallbacks.push(callback);
	    }
	    return this;
	  }
	  /**
	   * Unregisters a plugin callback.
	   *
	   * @param {Function} callback - The callback function to unregister.
	   * @return {GLTFLoader} A reference to this loader.
	   */
	  unregister(callback) {
	    if (this.pluginCallbacks.indexOf(callback) !== -1) {
	      this.pluginCallbacks.splice(this.pluginCallbacks.indexOf(callback), 1);
	    }
	    return this;
	  }
	  /**
	   * Parses the given glTF data and returns the resulting group.
	   *
	   * @param {string|ArrayBuffer} data - The raw glTF data.
	   * @param {string} path - The URL base path.
	   * @param {function(GLTFLoader~LoadObject)} onLoad - Executed when the loading process has been finished.
	   * @param {onErrorCallback} onError - Executed when errors occur.
	   */
	  parse(data, path, onLoad, onError) {
	    let json;
	    const extensions = {};
	    const plugins = {};
	    const textDecoder = new TextDecoder();
	    if (typeof data === "string") {
	      json = JSON.parse(data);
	    } else if (data instanceof ArrayBuffer) {
	      const magic = textDecoder.decode(new Uint8Array(data, 0, 4));
	      if (magic === BINARY_EXTENSION_HEADER_MAGIC) {
	        try {
	          extensions[EXTENSIONS.KHR_BINARY_GLTF] = new GLTFBinaryExtension(data);
	        } catch (error) {
	          if (onError) onError(error);
	          return;
	        }
	        json = JSON.parse(extensions[EXTENSIONS.KHR_BINARY_GLTF].content);
	      } else {
	        json = JSON.parse(textDecoder.decode(data));
	      }
	    } else {
	      json = data;
	    }
	    if (json.asset === void 0 || json.asset.version[0] < 2) {
	      if (onError) onError(new Error("THREE.GLTFLoader: Unsupported asset. glTF versions >=2.0 are supported."));
	      return;
	    }
	    const parser = new GLTFParser(json, {
	      path: path || this.resourcePath || "",
	      crossOrigin: this.crossOrigin,
	      requestHeader: this.requestHeader,
	      manager: this.manager,
	      ktx2Loader: this.ktx2Loader,
	      meshoptDecoder: this.meshoptDecoder
	    });
	    parser.fileLoader.setRequestHeader(this.requestHeader);
	    for (let i = 0; i < this.pluginCallbacks.length; i++) {
	      const plugin = this.pluginCallbacks[i](parser);
	      if (!plugin.name) console.error("THREE.GLTFLoader: Invalid plugin found: missing name");
	      plugins[plugin.name] = plugin;
	      extensions[plugin.name] = true;
	    }
	    if (json.extensionsUsed) {
	      for (let i = 0; i < json.extensionsUsed.length; ++i) {
	        const extensionName = json.extensionsUsed[i];
	        const extensionsRequired = json.extensionsRequired || [];
	        switch (extensionName) {
	          case EXTENSIONS.KHR_MATERIALS_UNLIT:
	            extensions[extensionName] = new GLTFMaterialsUnlitExtension();
	            break;
	          case EXTENSIONS.KHR_DRACO_MESH_COMPRESSION:
	            extensions[extensionName] = new GLTFDracoMeshCompressionExtension(json, this.dracoLoader);
	            break;
	          case EXTENSIONS.KHR_TEXTURE_TRANSFORM:
	            extensions[extensionName] = new GLTFTextureTransformExtension();
	            break;
	          case EXTENSIONS.KHR_MESH_QUANTIZATION:
	            extensions[extensionName] = new GLTFMeshQuantizationExtension();
	            break;
	          default:
	            if (extensionsRequired.indexOf(extensionName) >= 0 && plugins[extensionName] === void 0) {
	              console.warn('THREE.GLTFLoader: Unknown extension "' + extensionName + '".');
	            }
	        }
	      }
	    }
	    parser.setExtensions(extensions);
	    parser.setPlugins(plugins);
	    parser.parse(onLoad, onError);
	  }
	  /**
	   * Async version of {@link GLTFLoader#parse}.
	   *
	   * @async
	   * @param {string|ArrayBuffer} data - The raw glTF data.
	   * @param {string} path - The URL base path.
	   * @return {Promise<GLTFLoader~LoadObject>} A Promise that resolves with the loaded glTF when the parsing has been finished.
	   */
	  parseAsync(data, path) {
	    const scope = this;
	    return new Promise(function(resolve, reject) {
	      scope.parse(data, path, resolve, reject);
	    });
	  }
	};
	function GLTFRegistry() {
	  let objects = {};
	  return {
	    get: function(key) {
	      return objects[key];
	    },
	    add: function(key, object) {
	      objects[key] = object;
	    },
	    remove: function(key) {
	      delete objects[key];
	    },
	    removeAll: function() {
	      objects = {};
	    }
	  };
	}
	function getMaterialExtension(parser, materialIndex, extensionName) {
	  const materialDef = parser.json.materials[materialIndex];
	  if (materialDef.extensions && materialDef.extensions[extensionName]) {
	    return materialDef.extensions[extensionName];
	  }
	  return null;
	}
	var EXTENSIONS = {
	  KHR_BINARY_GLTF: "KHR_binary_glTF",
	  KHR_DRACO_MESH_COMPRESSION: "KHR_draco_mesh_compression",
	  KHR_LIGHTS_PUNCTUAL: "KHR_lights_punctual",
	  KHR_MATERIALS_CLEARCOAT: "KHR_materials_clearcoat",
	  KHR_MATERIALS_DISPERSION: "KHR_materials_dispersion",
	  KHR_MATERIALS_IOR: "KHR_materials_ior",
	  KHR_MATERIALS_SHEEN: "KHR_materials_sheen",
	  KHR_MATERIALS_SPECULAR: "KHR_materials_specular",
	  KHR_MATERIALS_TRANSMISSION: "KHR_materials_transmission",
	  KHR_MATERIALS_IRIDESCENCE: "KHR_materials_iridescence",
	  KHR_MATERIALS_ANISOTROPY: "KHR_materials_anisotropy",
	  KHR_MATERIALS_UNLIT: "KHR_materials_unlit",
	  KHR_MATERIALS_VOLUME: "KHR_materials_volume",
	  KHR_TEXTURE_BASISU: "KHR_texture_basisu",
	  KHR_TEXTURE_TRANSFORM: "KHR_texture_transform",
	  KHR_MESH_QUANTIZATION: "KHR_mesh_quantization",
	  KHR_MATERIALS_EMISSIVE_STRENGTH: "KHR_materials_emissive_strength",
	  EXT_MATERIALS_BUMP: "EXT_materials_bump",
	  EXT_TEXTURE_WEBP: "EXT_texture_webp",
	  EXT_TEXTURE_AVIF: "EXT_texture_avif",
	  EXT_MESHOPT_COMPRESSION: "EXT_meshopt_compression",
	  KHR_MESHOPT_COMPRESSION: "KHR_meshopt_compression",
	  EXT_MESH_GPU_INSTANCING: "EXT_mesh_gpu_instancing"
	};
	var GLTFLightsExtension = class {
	  constructor(parser) {
	    this.parser = parser;
	    this.name = EXTENSIONS.KHR_LIGHTS_PUNCTUAL;
	    this.cache = { refs: {}, uses: {} };
	  }
	  _markDefs() {
	    const parser = this.parser;
	    const nodeDefs = this.parser.json.nodes || [];
	    for (let nodeIndex = 0, nodeLength = nodeDefs.length; nodeIndex < nodeLength; nodeIndex++) {
	      const nodeDef = nodeDefs[nodeIndex];
	      if (nodeDef.extensions && nodeDef.extensions[this.name] && nodeDef.extensions[this.name].light !== void 0) {
	        parser._addNodeRef(this.cache, nodeDef.extensions[this.name].light);
	      }
	    }
	  }
	  _loadLight(lightIndex) {
	    const parser = this.parser;
	    const cacheKey = "light:" + lightIndex;
	    let dependency = parser.cache.get(cacheKey);
	    if (dependency) return dependency;
	    const json = parser.json;
	    const extensions = json.extensions && json.extensions[this.name] || {};
	    const lightDefs = extensions.lights || [];
	    const lightDef = lightDefs[lightIndex];
	    let lightNode;
	    const color = new three.Color(16777215);
	    if (lightDef.color !== void 0) color.setRGB(lightDef.color[0], lightDef.color[1], lightDef.color[2], three.LinearSRGBColorSpace);
	    const range = lightDef.range !== void 0 ? lightDef.range : 0;
	    switch (lightDef.type) {
	      case "directional":
	        lightNode = new three.DirectionalLight(color);
	        lightNode.target.position.set(0, 0, -1);
	        lightNode.add(lightNode.target);
	        break;
	      case "point":
	        lightNode = new three.PointLight(color);
	        lightNode.distance = range;
	        break;
	      case "spot":
	        lightNode = new three.SpotLight(color);
	        lightNode.distance = range;
	        lightDef.spot = lightDef.spot || {};
	        lightDef.spot.innerConeAngle = lightDef.spot.innerConeAngle !== void 0 ? lightDef.spot.innerConeAngle : 0;
	        lightDef.spot.outerConeAngle = lightDef.spot.outerConeAngle !== void 0 ? lightDef.spot.outerConeAngle : Math.PI / 4;
	        lightNode.angle = lightDef.spot.outerConeAngle;
	        lightNode.penumbra = 1 - lightDef.spot.innerConeAngle / lightDef.spot.outerConeAngle;
	        lightNode.target.position.set(0, 0, -1);
	        lightNode.add(lightNode.target);
	        break;
	      default:
	        throw new Error("THREE.GLTFLoader: Unexpected light type: " + lightDef.type);
	    }
	    lightNode.position.set(0, 0, 0);
	    assignExtrasToUserData(lightNode, lightDef);
	    if (lightDef.intensity !== void 0) lightNode.intensity = lightDef.intensity;
	    lightNode.name = parser.createUniqueName(lightDef.name || "light_" + lightIndex);
	    dependency = Promise.resolve(lightNode);
	    parser.cache.add(cacheKey, dependency);
	    return dependency;
	  }
	  getDependency(type, index) {
	    if (type !== "light") return;
	    return this._loadLight(index);
	  }
	  createNodeAttachment(nodeIndex) {
	    const self2 = this;
	    const parser = this.parser;
	    const json = parser.json;
	    const nodeDef = json.nodes[nodeIndex];
	    const lightDef = nodeDef.extensions && nodeDef.extensions[this.name] || {};
	    const lightIndex = lightDef.light;
	    if (lightIndex === void 0) return null;
	    return this._loadLight(lightIndex).then(function(light) {
	      return parser._getNodeRef(self2.cache, lightIndex, light);
	    });
	  }
	};
	var GLTFMaterialsUnlitExtension = class {
	  constructor() {
	    this.name = EXTENSIONS.KHR_MATERIALS_UNLIT;
	  }
	  getMaterialType() {
	    return three.MeshBasicMaterial;
	  }
	  extendParams(materialParams, materialDef, parser) {
	    const pending = [];
	    materialParams.color = new three.Color(1, 1, 1);
	    materialParams.opacity = 1;
	    const metallicRoughness = materialDef.pbrMetallicRoughness;
	    if (metallicRoughness) {
	      if (Array.isArray(metallicRoughness.baseColorFactor)) {
	        const array = metallicRoughness.baseColorFactor;
	        materialParams.color.setRGB(array[0], array[1], array[2], three.LinearSRGBColorSpace);
	        materialParams.opacity = array[3];
	      }
	      if (metallicRoughness.baseColorTexture !== void 0) {
	        pending.push(parser.assignTexture(materialParams, "map", metallicRoughness.baseColorTexture, three.SRGBColorSpace));
	      }
	    }
	    return Promise.all(pending);
	  }
	};
	var GLTFMaterialsEmissiveStrengthExtension = class {
	  constructor(parser) {
	    this.parser = parser;
	    this.name = EXTENSIONS.KHR_MATERIALS_EMISSIVE_STRENGTH;
	  }
	  extendMaterialParams(materialIndex, materialParams) {
	    const extension = getMaterialExtension(this.parser, materialIndex, this.name);
	    if (extension === null) return Promise.resolve();
	    if (extension.emissiveStrength !== void 0) {
	      materialParams.emissiveIntensity = extension.emissiveStrength;
	    }
	    return Promise.resolve();
	  }
	};
	var GLTFMaterialsClearcoatExtension = class {
	  constructor(parser) {
	    this.parser = parser;
	    this.name = EXTENSIONS.KHR_MATERIALS_CLEARCOAT;
	  }
	  getMaterialType(materialIndex) {
	    const extension = getMaterialExtension(this.parser, materialIndex, this.name);
	    return extension !== null ? three.MeshPhysicalMaterial : null;
	  }
	  extendMaterialParams(materialIndex, materialParams) {
	    const extension = getMaterialExtension(this.parser, materialIndex, this.name);
	    if (extension === null) return Promise.resolve();
	    const pending = [];
	    if (extension.clearcoatFactor !== void 0) {
	      materialParams.clearcoat = extension.clearcoatFactor;
	    }
	    if (extension.clearcoatTexture !== void 0) {
	      pending.push(this.parser.assignTexture(materialParams, "clearcoatMap", extension.clearcoatTexture));
	    }
	    if (extension.clearcoatRoughnessFactor !== void 0) {
	      materialParams.clearcoatRoughness = extension.clearcoatRoughnessFactor;
	    }
	    if (extension.clearcoatRoughnessTexture !== void 0) {
	      pending.push(this.parser.assignTexture(materialParams, "clearcoatRoughnessMap", extension.clearcoatRoughnessTexture));
	    }
	    if (extension.clearcoatNormalTexture !== void 0) {
	      pending.push(this.parser.assignTexture(materialParams, "clearcoatNormalMap", extension.clearcoatNormalTexture));
	      if (extension.clearcoatNormalTexture.scale !== void 0) {
	        const scale = extension.clearcoatNormalTexture.scale;
	        materialParams.clearcoatNormalScale = new three.Vector2(scale, scale);
	      }
	    }
	    return Promise.all(pending);
	  }
	};
	var GLTFMaterialsDispersionExtension = class {
	  constructor(parser) {
	    this.parser = parser;
	    this.name = EXTENSIONS.KHR_MATERIALS_DISPERSION;
	  }
	  getMaterialType(materialIndex) {
	    const extension = getMaterialExtension(this.parser, materialIndex, this.name);
	    return extension !== null ? three.MeshPhysicalMaterial : null;
	  }
	  extendMaterialParams(materialIndex, materialParams) {
	    const extension = getMaterialExtension(this.parser, materialIndex, this.name);
	    if (extension === null) return Promise.resolve();
	    materialParams.dispersion = extension.dispersion !== void 0 ? extension.dispersion : 0;
	    return Promise.resolve();
	  }
	};
	var GLTFMaterialsIridescenceExtension = class {
	  constructor(parser) {
	    this.parser = parser;
	    this.name = EXTENSIONS.KHR_MATERIALS_IRIDESCENCE;
	  }
	  getMaterialType(materialIndex) {
	    const extension = getMaterialExtension(this.parser, materialIndex, this.name);
	    return extension !== null ? three.MeshPhysicalMaterial : null;
	  }
	  extendMaterialParams(materialIndex, materialParams) {
	    const extension = getMaterialExtension(this.parser, materialIndex, this.name);
	    if (extension === null) return Promise.resolve();
	    const pending = [];
	    if (extension.iridescenceFactor !== void 0) {
	      materialParams.iridescence = extension.iridescenceFactor;
	    }
	    if (extension.iridescenceTexture !== void 0) {
	      pending.push(this.parser.assignTexture(materialParams, "iridescenceMap", extension.iridescenceTexture));
	    }
	    if (extension.iridescenceIor !== void 0) {
	      materialParams.iridescenceIOR = extension.iridescenceIor;
	    }
	    if (materialParams.iridescenceThicknessRange === void 0) {
	      materialParams.iridescenceThicknessRange = [100, 400];
	    }
	    if (extension.iridescenceThicknessMinimum !== void 0) {
	      materialParams.iridescenceThicknessRange[0] = extension.iridescenceThicknessMinimum;
	    }
	    if (extension.iridescenceThicknessMaximum !== void 0) {
	      materialParams.iridescenceThicknessRange[1] = extension.iridescenceThicknessMaximum;
	    }
	    if (extension.iridescenceThicknessTexture !== void 0) {
	      pending.push(this.parser.assignTexture(materialParams, "iridescenceThicknessMap", extension.iridescenceThicknessTexture));
	    }
	    return Promise.all(pending);
	  }
	};
	var GLTFMaterialsSheenExtension = class {
	  constructor(parser) {
	    this.parser = parser;
	    this.name = EXTENSIONS.KHR_MATERIALS_SHEEN;
	  }
	  getMaterialType(materialIndex) {
	    const extension = getMaterialExtension(this.parser, materialIndex, this.name);
	    return extension !== null ? three.MeshPhysicalMaterial : null;
	  }
	  extendMaterialParams(materialIndex, materialParams) {
	    const extension = getMaterialExtension(this.parser, materialIndex, this.name);
	    if (extension === null) return Promise.resolve();
	    const pending = [];
	    materialParams.sheenColor = new three.Color(0, 0, 0);
	    materialParams.sheenRoughness = 0;
	    materialParams.sheen = 1;
	    if (extension.sheenColorFactor !== void 0) {
	      const colorFactor = extension.sheenColorFactor;
	      materialParams.sheenColor.setRGB(colorFactor[0], colorFactor[1], colorFactor[2], three.LinearSRGBColorSpace);
	    }
	    if (extension.sheenRoughnessFactor !== void 0) {
	      materialParams.sheenRoughness = extension.sheenRoughnessFactor;
	    }
	    if (extension.sheenColorTexture !== void 0) {
	      pending.push(this.parser.assignTexture(materialParams, "sheenColorMap", extension.sheenColorTexture, three.SRGBColorSpace));
	    }
	    if (extension.sheenRoughnessTexture !== void 0) {
	      pending.push(this.parser.assignTexture(materialParams, "sheenRoughnessMap", extension.sheenRoughnessTexture));
	    }
	    return Promise.all(pending);
	  }
	};
	var GLTFMaterialsTransmissionExtension = class {
	  constructor(parser) {
	    this.parser = parser;
	    this.name = EXTENSIONS.KHR_MATERIALS_TRANSMISSION;
	  }
	  getMaterialType(materialIndex) {
	    const extension = getMaterialExtension(this.parser, materialIndex, this.name);
	    return extension !== null ? three.MeshPhysicalMaterial : null;
	  }
	  extendMaterialParams(materialIndex, materialParams) {
	    const extension = getMaterialExtension(this.parser, materialIndex, this.name);
	    if (extension === null) return Promise.resolve();
	    const pending = [];
	    if (extension.transmissionFactor !== void 0) {
	      materialParams.transmission = extension.transmissionFactor;
	    }
	    if (extension.transmissionTexture !== void 0) {
	      pending.push(this.parser.assignTexture(materialParams, "transmissionMap", extension.transmissionTexture));
	    }
	    return Promise.all(pending);
	  }
	};
	var GLTFMaterialsVolumeExtension = class {
	  constructor(parser) {
	    this.parser = parser;
	    this.name = EXTENSIONS.KHR_MATERIALS_VOLUME;
	  }
	  getMaterialType(materialIndex) {
	    const extension = getMaterialExtension(this.parser, materialIndex, this.name);
	    return extension !== null ? three.MeshPhysicalMaterial : null;
	  }
	  extendMaterialParams(materialIndex, materialParams) {
	    const extension = getMaterialExtension(this.parser, materialIndex, this.name);
	    if (extension === null) return Promise.resolve();
	    const pending = [];
	    materialParams.thickness = extension.thicknessFactor !== void 0 ? extension.thicknessFactor : 0;
	    if (extension.thicknessTexture !== void 0) {
	      pending.push(this.parser.assignTexture(materialParams, "thicknessMap", extension.thicknessTexture));
	    }
	    materialParams.attenuationDistance = extension.attenuationDistance || Infinity;
	    const colorArray = extension.attenuationColor || [1, 1, 1];
	    materialParams.attenuationColor = new three.Color().setRGB(colorArray[0], colorArray[1], colorArray[2], three.LinearSRGBColorSpace);
	    return Promise.all(pending);
	  }
	};
	var GLTFMaterialsIorExtension = class {
	  constructor(parser) {
	    this.parser = parser;
	    this.name = EXTENSIONS.KHR_MATERIALS_IOR;
	  }
	  getMaterialType(materialIndex) {
	    const extension = getMaterialExtension(this.parser, materialIndex, this.name);
	    return extension !== null ? three.MeshPhysicalMaterial : null;
	  }
	  extendMaterialParams(materialIndex, materialParams) {
	    const extension = getMaterialExtension(this.parser, materialIndex, this.name);
	    if (extension === null) return Promise.resolve();
	    materialParams.ior = extension.ior !== void 0 ? extension.ior : 1.5;
	    if (materialParams.ior === 0) materialParams.ior = 1e3;
	    return Promise.resolve();
	  }
	};
	var GLTFMaterialsSpecularExtension = class {
	  constructor(parser) {
	    this.parser = parser;
	    this.name = EXTENSIONS.KHR_MATERIALS_SPECULAR;
	  }
	  getMaterialType(materialIndex) {
	    const extension = getMaterialExtension(this.parser, materialIndex, this.name);
	    return extension !== null ? three.MeshPhysicalMaterial : null;
	  }
	  extendMaterialParams(materialIndex, materialParams) {
	    const extension = getMaterialExtension(this.parser, materialIndex, this.name);
	    if (extension === null) return Promise.resolve();
	    const pending = [];
	    materialParams.specularIntensity = extension.specularFactor !== void 0 ? extension.specularFactor : 1;
	    if (extension.specularTexture !== void 0) {
	      pending.push(this.parser.assignTexture(materialParams, "specularIntensityMap", extension.specularTexture));
	    }
	    const colorArray = extension.specularColorFactor || [1, 1, 1];
	    materialParams.specularColor = new three.Color().setRGB(colorArray[0], colorArray[1], colorArray[2], three.LinearSRGBColorSpace);
	    if (extension.specularColorTexture !== void 0) {
	      pending.push(this.parser.assignTexture(materialParams, "specularColorMap", extension.specularColorTexture, three.SRGBColorSpace));
	    }
	    return Promise.all(pending);
	  }
	};
	var GLTFMaterialsBumpExtension = class {
	  constructor(parser) {
	    this.parser = parser;
	    this.name = EXTENSIONS.EXT_MATERIALS_BUMP;
	  }
	  getMaterialType(materialIndex) {
	    const extension = getMaterialExtension(this.parser, materialIndex, this.name);
	    return extension !== null ? three.MeshPhysicalMaterial : null;
	  }
	  extendMaterialParams(materialIndex, materialParams) {
	    const extension = getMaterialExtension(this.parser, materialIndex, this.name);
	    if (extension === null) return Promise.resolve();
	    const pending = [];
	    materialParams.bumpScale = extension.bumpFactor !== void 0 ? extension.bumpFactor : 1;
	    if (extension.bumpTexture !== void 0) {
	      pending.push(this.parser.assignTexture(materialParams, "bumpMap", extension.bumpTexture));
	    }
	    return Promise.all(pending);
	  }
	};
	var GLTFMaterialsAnisotropyExtension = class {
	  constructor(parser) {
	    this.parser = parser;
	    this.name = EXTENSIONS.KHR_MATERIALS_ANISOTROPY;
	  }
	  getMaterialType(materialIndex) {
	    const extension = getMaterialExtension(this.parser, materialIndex, this.name);
	    return extension !== null ? three.MeshPhysicalMaterial : null;
	  }
	  extendMaterialParams(materialIndex, materialParams) {
	    const extension = getMaterialExtension(this.parser, materialIndex, this.name);
	    if (extension === null) return Promise.resolve();
	    const pending = [];
	    if (extension.anisotropyStrength !== void 0) {
	      materialParams.anisotropy = extension.anisotropyStrength;
	    }
	    if (extension.anisotropyRotation !== void 0) {
	      materialParams.anisotropyRotation = extension.anisotropyRotation;
	    }
	    if (extension.anisotropyTexture !== void 0) {
	      pending.push(this.parser.assignTexture(materialParams, "anisotropyMap", extension.anisotropyTexture));
	    }
	    return Promise.all(pending);
	  }
	};
	var GLTFTextureBasisUExtension = class {
	  constructor(parser) {
	    this.parser = parser;
	    this.name = EXTENSIONS.KHR_TEXTURE_BASISU;
	  }
	  loadTexture(textureIndex) {
	    const parser = this.parser;
	    const json = parser.json;
	    const textureDef = json.textures[textureIndex];
	    if (!textureDef.extensions || !textureDef.extensions[this.name]) {
	      return null;
	    }
	    const extension = textureDef.extensions[this.name];
	    const loader = parser.options.ktx2Loader;
	    if (!loader) {
	      if (json.extensionsRequired && json.extensionsRequired.indexOf(this.name) >= 0) {
	        throw new Error("THREE.GLTFLoader: setKTX2Loader must be called before loading KTX2 textures");
	      } else {
	        return null;
	      }
	    }
	    return parser.loadTextureImage(textureIndex, extension.source, loader);
	  }
	};
	var GLTFTextureWebPExtension = class {
	  constructor(parser) {
	    this.parser = parser;
	    this.name = EXTENSIONS.EXT_TEXTURE_WEBP;
	  }
	  loadTexture(textureIndex) {
	    const name = this.name;
	    const parser = this.parser;
	    const json = parser.json;
	    const textureDef = json.textures[textureIndex];
	    if (!textureDef.extensions || !textureDef.extensions[name]) {
	      return null;
	    }
	    const extension = textureDef.extensions[name];
	    const source = json.images[extension.source];
	    let loader = parser.textureLoader;
	    if (source.uri) {
	      const handler = parser.options.manager.getHandler(source.uri);
	      if (handler !== null) loader = handler;
	    }
	    return parser.loadTextureImage(textureIndex, extension.source, loader);
	  }
	};
	var GLTFTextureAVIFExtension = class {
	  constructor(parser) {
	    this.parser = parser;
	    this.name = EXTENSIONS.EXT_TEXTURE_AVIF;
	  }
	  loadTexture(textureIndex) {
	    const name = this.name;
	    const parser = this.parser;
	    const json = parser.json;
	    const textureDef = json.textures[textureIndex];
	    if (!textureDef.extensions || !textureDef.extensions[name]) {
	      return null;
	    }
	    const extension = textureDef.extensions[name];
	    const source = json.images[extension.source];
	    let loader = parser.textureLoader;
	    if (source.uri) {
	      const handler = parser.options.manager.getHandler(source.uri);
	      if (handler !== null) loader = handler;
	    }
	    return parser.loadTextureImage(textureIndex, extension.source, loader);
	  }
	};
	var GLTFMeshoptCompression = class {
	  constructor(parser, name) {
	    this.name = name;
	    this.parser = parser;
	  }
	  loadBufferView(index) {
	    const json = this.parser.json;
	    const bufferView = json.bufferViews[index];
	    if (bufferView.extensions && bufferView.extensions[this.name]) {
	      const extensionDef = bufferView.extensions[this.name];
	      const buffer = this.parser.getDependency("buffer", extensionDef.buffer);
	      const decoder = this.parser.options.meshoptDecoder;
	      if (!decoder || !decoder.supported) {
	        if (json.extensionsRequired && json.extensionsRequired.indexOf(this.name) >= 0) {
	          throw new Error("THREE.GLTFLoader: setMeshoptDecoder must be called before loading compressed files");
	        } else {
	          return null;
	        }
	      }
	      return buffer.then(function(res) {
	        const byteOffset = extensionDef.byteOffset || 0;
	        const byteLength = extensionDef.byteLength || 0;
	        const count = extensionDef.count;
	        const stride = extensionDef.byteStride;
	        const source = new Uint8Array(res, byteOffset, byteLength);
	        if (decoder.decodeGltfBufferAsync) {
	          return decoder.decodeGltfBufferAsync(count, stride, source, extensionDef.mode, extensionDef.filter).then(function(res2) {
	            return res2.buffer;
	          });
	        } else {
	          return decoder.ready.then(function() {
	            const result = new ArrayBuffer(count * stride);
	            decoder.decodeGltfBuffer(new Uint8Array(result), count, stride, source, extensionDef.mode, extensionDef.filter);
	            return result;
	          });
	        }
	      });
	    } else {
	      return null;
	    }
	  }
	};
	var GLTFMeshGpuInstancing = class {
	  constructor(parser) {
	    this.name = EXTENSIONS.EXT_MESH_GPU_INSTANCING;
	    this.parser = parser;
	  }
	  createNodeMesh(nodeIndex) {
	    const json = this.parser.json;
	    const nodeDef = json.nodes[nodeIndex];
	    if (!nodeDef.extensions || !nodeDef.extensions[this.name] || nodeDef.mesh === void 0) {
	      return null;
	    }
	    const meshDef = json.meshes[nodeDef.mesh];
	    for (const primitive of meshDef.primitives) {
	      if (primitive.mode !== WEBGL_CONSTANTS.TRIANGLES && primitive.mode !== WEBGL_CONSTANTS.TRIANGLE_STRIP && primitive.mode !== WEBGL_CONSTANTS.TRIANGLE_FAN && primitive.mode !== void 0) {
	        return null;
	      }
	    }
	    const extensionDef = nodeDef.extensions[this.name];
	    const attributesDef = extensionDef.attributes;
	    const pending = [];
	    const attributes = {};
	    for (const key in attributesDef) {
	      pending.push(this.parser.getDependency("accessor", attributesDef[key]).then((accessor) => {
	        attributes[key] = accessor;
	        return attributes[key];
	      }));
	    }
	    if (pending.length < 1) {
	      return null;
	    }
	    pending.push(this.parser.createNodeMesh(nodeIndex));
	    return Promise.all(pending).then((results) => {
	      const nodeObject = results.pop();
	      const meshes = nodeObject.isGroup ? nodeObject.children : [nodeObject];
	      const count = results[0].count;
	      const instancedMeshes = [];
	      for (const mesh of meshes) {
	        const m = new three.Matrix4();
	        const p = new three.Vector3();
	        const q = new three.Quaternion();
	        const s = new three.Vector3(1, 1, 1);
	        const instancedMesh = new three.InstancedMesh(mesh.geometry, mesh.material, count);
	        for (let i = 0; i < count; i++) {
	          if (attributes.TRANSLATION) {
	            p.fromBufferAttribute(attributes.TRANSLATION, i);
	          }
	          if (attributes.ROTATION) {
	            q.fromBufferAttribute(attributes.ROTATION, i);
	          }
	          if (attributes.SCALE) {
	            s.fromBufferAttribute(attributes.SCALE, i);
	          }
	          instancedMesh.setMatrixAt(i, m.compose(p, q, s));
	        }
	        for (const attributeName in attributes) {
	          if (attributeName === "_COLOR_0") {
	            const attr = attributes[attributeName];
	            instancedMesh.instanceColor = new three.InstancedBufferAttribute(attr.array, attr.itemSize, attr.normalized);
	          } else if (attributeName !== "TRANSLATION" && attributeName !== "ROTATION" && attributeName !== "SCALE") {
	            mesh.geometry.setAttribute(attributeName, attributes[attributeName]);
	          }
	        }
	        three.Object3D.prototype.copy.call(instancedMesh, mesh);
	        this.parser.assignFinalMaterial(instancedMesh);
	        instancedMeshes.push(instancedMesh);
	      }
	      if (nodeObject.isGroup) {
	        nodeObject.clear();
	        nodeObject.add(...instancedMeshes);
	        return nodeObject;
	      }
	      return instancedMeshes[0];
	    });
	  }
	};
	var BINARY_EXTENSION_HEADER_MAGIC = "glTF";
	var BINARY_EXTENSION_HEADER_LENGTH = 12;
	var BINARY_EXTENSION_CHUNK_TYPES = { JSON: 1313821514, BIN: 5130562 };
	var GLTFBinaryExtension = class {
	  constructor(data) {
	    this.name = EXTENSIONS.KHR_BINARY_GLTF;
	    this.content = null;
	    this.body = null;
	    const headerView = new DataView(data, 0, BINARY_EXTENSION_HEADER_LENGTH);
	    const textDecoder = new TextDecoder();
	    this.header = {
	      magic: textDecoder.decode(new Uint8Array(data.slice(0, 4))),
	      version: headerView.getUint32(4, true),
	      length: headerView.getUint32(8, true)
	    };
	    if (this.header.magic !== BINARY_EXTENSION_HEADER_MAGIC) {
	      throw new Error("THREE.GLTFLoader: Unsupported glTF-Binary header.");
	    } else if (this.header.version < 2) {
	      throw new Error("THREE.GLTFLoader: Legacy binary file detected.");
	    }
	    const chunkContentsLength = this.header.length - BINARY_EXTENSION_HEADER_LENGTH;
	    const chunkView = new DataView(data, BINARY_EXTENSION_HEADER_LENGTH);
	    let chunkIndex = 0;
	    while (chunkIndex < chunkContentsLength) {
	      const chunkLength = chunkView.getUint32(chunkIndex, true);
	      chunkIndex += 4;
	      const chunkType = chunkView.getUint32(chunkIndex, true);
	      chunkIndex += 4;
	      if (chunkType === BINARY_EXTENSION_CHUNK_TYPES.JSON) {
	        const contentArray = new Uint8Array(data, BINARY_EXTENSION_HEADER_LENGTH + chunkIndex, chunkLength);
	        this.content = textDecoder.decode(contentArray);
	      } else if (chunkType === BINARY_EXTENSION_CHUNK_TYPES.BIN) {
	        const byteOffset = BINARY_EXTENSION_HEADER_LENGTH + chunkIndex;
	        this.body = data.slice(byteOffset, byteOffset + chunkLength);
	      }
	      chunkIndex += chunkLength;
	    }
	    if (this.content === null) {
	      throw new Error("THREE.GLTFLoader: JSON content not found.");
	    }
	  }
	};
	var GLTFDracoMeshCompressionExtension = class {
	  constructor(json, dracoLoader) {
	    if (!dracoLoader) {
	      throw new Error("THREE.GLTFLoader: No DRACOLoader instance provided.");
	    }
	    this.name = EXTENSIONS.KHR_DRACO_MESH_COMPRESSION;
	    this.json = json;
	    this.dracoLoader = dracoLoader;
	    this.dracoLoader.preload();
	  }
	  decodePrimitive(primitive, parser) {
	    const json = this.json;
	    const dracoLoader = this.dracoLoader;
	    const bufferViewIndex = primitive.extensions[this.name].bufferView;
	    const gltfAttributeMap = primitive.extensions[this.name].attributes;
	    const threeAttributeMap = {};
	    const attributeNormalizedMap = {};
	    const attributeTypeMap = {};
	    for (const attributeName in gltfAttributeMap) {
	      const threeAttributeName = ATTRIBUTES[attributeName] || attributeName.toLowerCase();
	      threeAttributeMap[threeAttributeName] = gltfAttributeMap[attributeName];
	    }
	    for (const attributeName in primitive.attributes) {
	      const threeAttributeName = ATTRIBUTES[attributeName] || attributeName.toLowerCase();
	      if (gltfAttributeMap[attributeName] !== void 0) {
	        const accessorDef = json.accessors[primitive.attributes[attributeName]];
	        const componentType = WEBGL_COMPONENT_TYPES[accessorDef.componentType];
	        attributeTypeMap[threeAttributeName] = componentType.name;
	        attributeNormalizedMap[threeAttributeName] = accessorDef.normalized === true;
	      }
	    }
	    return parser.getDependency("bufferView", bufferViewIndex).then(function(bufferView) {
	      return new Promise(function(resolve, reject) {
	        dracoLoader.decodeDracoFile(bufferView, function(geometry) {
	          for (const attributeName in geometry.attributes) {
	            const attribute = geometry.attributes[attributeName];
	            const normalized = attributeNormalizedMap[attributeName];
	            if (normalized !== void 0) attribute.normalized = normalized;
	          }
	          resolve(geometry);
	        }, threeAttributeMap, attributeTypeMap, three.LinearSRGBColorSpace, reject);
	      });
	    });
	  }
	};
	var GLTFTextureTransformExtension = class {
	  constructor() {
	    this.name = EXTENSIONS.KHR_TEXTURE_TRANSFORM;
	  }
	  extendTexture(texture, transform) {
	    if ((transform.texCoord === void 0 || transform.texCoord === texture.channel) && transform.offset === void 0 && transform.rotation === void 0 && transform.scale === void 0) {
	      return texture;
	    }
	    texture = texture.clone();
	    if (transform.texCoord !== void 0) {
	      texture.channel = transform.texCoord;
	    }
	    if (transform.offset !== void 0) {
	      texture.offset.fromArray(transform.offset);
	    }
	    if (transform.rotation !== void 0) {
	      texture.rotation = transform.rotation;
	    }
	    if (transform.scale !== void 0) {
	      texture.repeat.fromArray(transform.scale);
	    }
	    texture.needsUpdate = true;
	    return texture;
	  }
	};
	var GLTFMeshQuantizationExtension = class {
	  constructor() {
	    this.name = EXTENSIONS.KHR_MESH_QUANTIZATION;
	  }
	};
	var GLTFCubicSplineInterpolant = class extends three.Interpolant {
	  constructor(parameterPositions, sampleValues, sampleSize, resultBuffer) {
	    super(parameterPositions, sampleValues, sampleSize, resultBuffer);
	  }
	  copySampleValue_(index) {
	    const result = this.resultBuffer, values = this.sampleValues, valueSize = this.valueSize, offset = index * valueSize * 3 + valueSize;
	    for (let i = 0; i !== valueSize; i++) {
	      result[i] = values[offset + i];
	    }
	    return result;
	  }
	  interpolate_(i1, t0, t, t1) {
	    const result = this.resultBuffer;
	    const values = this.sampleValues;
	    const stride = this.valueSize;
	    const stride2 = stride * 2;
	    const stride3 = stride * 3;
	    const td = t1 - t0;
	    const p = (t - t0) / td;
	    const pp = p * p;
	    const ppp = pp * p;
	    const offset1 = i1 * stride3;
	    const offset0 = offset1 - stride3;
	    const s2 = -2 * ppp + 3 * pp;
	    const s3 = ppp - pp;
	    const s0 = 1 - s2;
	    const s1 = s3 - pp + p;
	    for (let i = 0; i !== stride; i++) {
	      const p0 = values[offset0 + i + stride];
	      const m0 = values[offset0 + i + stride2] * td;
	      const p1 = values[offset1 + i + stride];
	      const m1 = values[offset1 + i] * td;
	      result[i] = s0 * p0 + s1 * m0 + s2 * p1 + s3 * m1;
	    }
	    return result;
	  }
	};
	var _quaternion = new three.Quaternion();
	var GLTFCubicSplineQuaternionInterpolant = class extends GLTFCubicSplineInterpolant {
	  interpolate_(i1, t0, t, t1) {
	    const result = super.interpolate_(i1, t0, t, t1);
	    _quaternion.fromArray(result).normalize().toArray(result);
	    return result;
	  }
	};
	var WEBGL_CONSTANTS = {
	  POINTS: 0,
	  LINES: 1,
	  LINE_LOOP: 2,
	  LINE_STRIP: 3,
	  TRIANGLES: 4,
	  TRIANGLE_STRIP: 5,
	  TRIANGLE_FAN: 6};
	var WEBGL_COMPONENT_TYPES = {
	  5120: Int8Array,
	  5121: Uint8Array,
	  5122: Int16Array,
	  5123: Uint16Array,
	  5125: Uint32Array,
	  5126: Float32Array
	};
	var WEBGL_FILTERS = {
	  9728: three.NearestFilter,
	  9729: three.LinearFilter,
	  9984: three.NearestMipmapNearestFilter,
	  9985: three.LinearMipmapNearestFilter,
	  9986: three.NearestMipmapLinearFilter,
	  9987: three.LinearMipmapLinearFilter
	};
	var WEBGL_WRAPPINGS = {
	  33071: three.ClampToEdgeWrapping,
	  33648: three.MirroredRepeatWrapping,
	  10497: three.RepeatWrapping
	};
	var WEBGL_TYPE_SIZES = {
	  "SCALAR": 1,
	  "VEC2": 2,
	  "VEC3": 3,
	  "VEC4": 4,
	  "MAT2": 4,
	  "MAT3": 9,
	  "MAT4": 16
	};
	var ATTRIBUTES = {
	  POSITION: "position",
	  NORMAL: "normal",
	  TANGENT: "tangent",
	  TEXCOORD_0: "uv",
	  TEXCOORD_1: "uv1",
	  TEXCOORD_2: "uv2",
	  TEXCOORD_3: "uv3",
	  COLOR_0: "color",
	  WEIGHTS_0: "skinWeight",
	  JOINTS_0: "skinIndex"
	};
	var PATH_PROPERTIES = {
	  scale: "scale",
	  translation: "position",
	  rotation: "quaternion",
	  weights: "morphTargetInfluences"
	};
	var INTERPOLATION = {
	  CUBICSPLINE: void 0,
	  // We use a custom interpolant (GLTFCubicSplineInterpolation) for CUBICSPLINE tracks. Each
	  // keyframe track will be initialized with a default interpolation type, then modified.
	  LINEAR: three.InterpolateLinear,
	  STEP: three.InterpolateDiscrete
	};
	var ALPHA_MODES = {
	  OPAQUE: "OPAQUE",
	  MASK: "MASK",
	  BLEND: "BLEND"
	};
	function createDefaultMaterial(cache2) {
	  if (cache2["DefaultMaterial"] === void 0) {
	    cache2["DefaultMaterial"] = new three.MeshStandardMaterial({
	      color: 16777215,
	      emissive: 0,
	      metalness: 1,
	      roughness: 1,
	      transparent: false,
	      depthTest: true,
	      side: three.FrontSide
	    });
	  }
	  return cache2["DefaultMaterial"];
	}
	function addUnknownExtensionsToUserData(knownExtensions, object, objectDef) {
	  for (const name in objectDef.extensions) {
	    if (knownExtensions[name] === void 0) {
	      object.userData.gltfExtensions = object.userData.gltfExtensions || {};
	      object.userData.gltfExtensions[name] = objectDef.extensions[name];
	    }
	  }
	}
	function assignExtrasToUserData(object, gltfDef) {
	  if (gltfDef.extras !== void 0) {
	    if (typeof gltfDef.extras === "object") {
	      Object.assign(object.userData, gltfDef.extras);
	    } else {
	      console.warn("THREE.GLTFLoader: Ignoring primitive type .extras, " + gltfDef.extras);
	    }
	  }
	}
	function addMorphTargets(geometry, targets, parser) {
	  let hasMorphPosition = false;
	  let hasMorphNormal = false;
	  let hasMorphColor = false;
	  for (let i = 0, il = targets.length; i < il; i++) {
	    const target = targets[i];
	    if (target.POSITION !== void 0) hasMorphPosition = true;
	    if (target.NORMAL !== void 0) hasMorphNormal = true;
	    if (target.COLOR_0 !== void 0) hasMorphColor = true;
	    if (hasMorphPosition && hasMorphNormal && hasMorphColor) break;
	  }
	  if (!hasMorphPosition && !hasMorphNormal && !hasMorphColor) return Promise.resolve(geometry);
	  const pendingPositionAccessors = [];
	  const pendingNormalAccessors = [];
	  const pendingColorAccessors = [];
	  for (let i = 0, il = targets.length; i < il; i++) {
	    const target = targets[i];
	    if (hasMorphPosition) {
	      const pendingAccessor = target.POSITION !== void 0 ? parser.getDependency("accessor", target.POSITION) : geometry.attributes.position;
	      pendingPositionAccessors.push(pendingAccessor);
	    }
	    if (hasMorphNormal) {
	      const pendingAccessor = target.NORMAL !== void 0 ? parser.getDependency("accessor", target.NORMAL) : geometry.attributes.normal;
	      pendingNormalAccessors.push(pendingAccessor);
	    }
	    if (hasMorphColor) {
	      const pendingAccessor = target.COLOR_0 !== void 0 ? parser.getDependency("accessor", target.COLOR_0) : geometry.attributes.color;
	      pendingColorAccessors.push(pendingAccessor);
	    }
	  }
	  return Promise.all([
	    Promise.all(pendingPositionAccessors),
	    Promise.all(pendingNormalAccessors),
	    Promise.all(pendingColorAccessors)
	  ]).then(function(accessors) {
	    const morphPositions = accessors[0];
	    const morphNormals = accessors[1];
	    const morphColors = accessors[2];
	    if (hasMorphPosition) geometry.morphAttributes.position = morphPositions;
	    if (hasMorphNormal) geometry.morphAttributes.normal = morphNormals;
	    if (hasMorphColor) geometry.morphAttributes.color = morphColors;
	    geometry.morphTargetsRelative = true;
	    return geometry;
	  });
	}
	function updateMorphTargets(mesh, meshDef) {
	  mesh.updateMorphTargets();
	  if (meshDef.weights !== void 0) {
	    for (let i = 0, il = meshDef.weights.length; i < il; i++) {
	      mesh.morphTargetInfluences[i] = meshDef.weights[i];
	    }
	  }
	  if (meshDef.extras && Array.isArray(meshDef.extras.targetNames)) {
	    const targetNames = meshDef.extras.targetNames;
	    if (mesh.morphTargetInfluences.length === targetNames.length) {
	      mesh.morphTargetDictionary = {};
	      for (let i = 0, il = targetNames.length; i < il; i++) {
	        mesh.morphTargetDictionary[targetNames[i]] = i;
	      }
	    } else {
	      console.warn("THREE.GLTFLoader: Invalid extras.targetNames length. Ignoring names.");
	    }
	  }
	}
	function createPrimitiveKey(primitiveDef) {
	  let geometryKey;
	  const dracoExtension = primitiveDef.extensions && primitiveDef.extensions[EXTENSIONS.KHR_DRACO_MESH_COMPRESSION];
	  if (dracoExtension) {
	    geometryKey = "draco:" + dracoExtension.bufferView + ":" + dracoExtension.indices + ":" + createAttributesKey(dracoExtension.attributes);
	  } else {
	    geometryKey = primitiveDef.indices + ":" + createAttributesKey(primitiveDef.attributes) + ":" + primitiveDef.mode;
	  }
	  if (primitiveDef.targets !== void 0) {
	    for (let i = 0, il = primitiveDef.targets.length; i < il; i++) {
	      geometryKey += ":" + createAttributesKey(primitiveDef.targets[i]);
	    }
	  }
	  return geometryKey;
	}
	function createAttributesKey(attributes) {
	  let attributesKey = "";
	  const keys = Object.keys(attributes).sort();
	  for (let i = 0, il = keys.length; i < il; i++) {
	    attributesKey += keys[i] + ":" + attributes[keys[i]] + ";";
	  }
	  return attributesKey;
	}
	function getNormalizedComponentScale(constructor) {
	  switch (constructor) {
	    case Int8Array:
	      return 1 / 127;
	    case Uint8Array:
	      return 1 / 255;
	    case Int16Array:
	      return 1 / 32767;
	    case Uint16Array:
	      return 1 / 65535;
	    default:
	      throw new Error("THREE.GLTFLoader: Unsupported normalized accessor component type.");
	  }
	}
	function getImageURIMimeType(uri) {
	  if (uri.search(/\.jpe?g($|\?)/i) > 0 || uri.search(/^data\:image\/jpeg/) === 0) return "image/jpeg";
	  if (uri.search(/\.webp($|\?)/i) > 0 || uri.search(/^data\:image\/webp/) === 0) return "image/webp";
	  if (uri.search(/\.ktx2($|\?)/i) > 0 || uri.search(/^data\:image\/ktx2/) === 0) return "image/ktx2";
	  return "image/png";
	}
	var _identityMatrix = new three.Matrix4();
	var GLTFParser = class {
	  constructor(json = {}, options = {}) {
	    this.json = json;
	    this.extensions = {};
	    this.plugins = {};
	    this.options = options;
	    this.cache = new GLTFRegistry();
	    this.associations = /* @__PURE__ */ new Map();
	    this.primitiveCache = {};
	    this.nodeCache = {};
	    this.meshCache = { refs: {}, uses: {} };
	    this.cameraCache = { refs: {}, uses: {} };
	    this.lightCache = { refs: {}, uses: {} };
	    this.sourceCache = {};
	    this.textureCache = {};
	    this.nodeNamesUsed = {};
	    let isSafari = false;
	    let safariVersion = -1;
	    let isFirefox = false;
	    let firefoxVersion = -1;
	    if (typeof navigator !== "undefined" && typeof navigator.userAgent !== "undefined") {
	      const userAgent = navigator.userAgent;
	      isSafari = /^((?!chrome|android).)*safari/i.test(userAgent) === true;
	      const safariMatch = userAgent.match(/Version\/(\d+)/);
	      safariVersion = isSafari && safariMatch ? parseInt(safariMatch[1], 10) : -1;
	      isFirefox = userAgent.indexOf("Firefox") > -1;
	      firefoxVersion = isFirefox ? userAgent.match(/Firefox\/([0-9]+)\./)[1] : -1;
	    }
	    if (typeof createImageBitmap === "undefined" || isSafari && safariVersion < 17 || isFirefox && firefoxVersion < 98) {
	      this.textureLoader = new three.TextureLoader(this.options.manager);
	    } else {
	      this.textureLoader = new three.ImageBitmapLoader(this.options.manager);
	    }
	    this.textureLoader.setCrossOrigin(this.options.crossOrigin);
	    this.textureLoader.setRequestHeader(this.options.requestHeader);
	    this.fileLoader = new three.FileLoader(this.options.manager);
	    this.fileLoader.setResponseType("arraybuffer");
	    if (this.options.crossOrigin === "use-credentials") {
	      this.fileLoader.setWithCredentials(true);
	    }
	  }
	  setExtensions(extensions) {
	    this.extensions = extensions;
	  }
	  setPlugins(plugins) {
	    this.plugins = plugins;
	  }
	  parse(onLoad, onError) {
	    const parser = this;
	    const json = this.json;
	    const extensions = this.extensions;
	    this.cache.removeAll();
	    this.nodeCache = {};
	    this._invokeAll(function(ext) {
	      return ext._markDefs && ext._markDefs();
	    });
	    Promise.all(this._invokeAll(function(ext) {
	      return ext.beforeRoot && ext.beforeRoot();
	    })).then(function() {
	      return Promise.all([
	        parser.getDependencies("scene"),
	        parser.getDependencies("animation"),
	        parser.getDependencies("camera")
	      ]);
	    }).then(function(dependencies) {
	      const result = {
	        scene: dependencies[0][json.scene || 0],
	        scenes: dependencies[0],
	        animations: dependencies[1],
	        cameras: dependencies[2],
	        asset: json.asset,
	        parser,
	        userData: {}
	      };
	      addUnknownExtensionsToUserData(extensions, result, json);
	      assignExtrasToUserData(result, json);
	      return Promise.all(parser._invokeAll(function(ext) {
	        return ext.afterRoot && ext.afterRoot(result);
	      })).then(function() {
	        for (const scene of result.scenes) {
	          scene.updateMatrixWorld();
	        }
	        onLoad(result);
	      });
	    }).catch(onError);
	  }
	  /**
	   * Marks the special nodes/meshes in json for efficient parse.
	   *
	   * @private
	   */
	  _markDefs() {
	    const nodeDefs = this.json.nodes || [];
	    const skinDefs = this.json.skins || [];
	    const meshDefs = this.json.meshes || [];
	    for (let skinIndex = 0, skinLength = skinDefs.length; skinIndex < skinLength; skinIndex++) {
	      const joints = skinDefs[skinIndex].joints;
	      for (let i = 0, il = joints.length; i < il; i++) {
	        nodeDefs[joints[i]].isBone = true;
	      }
	    }
	    for (let nodeIndex = 0, nodeLength = nodeDefs.length; nodeIndex < nodeLength; nodeIndex++) {
	      const nodeDef = nodeDefs[nodeIndex];
	      if (nodeDef.mesh !== void 0) {
	        this._addNodeRef(this.meshCache, nodeDef.mesh);
	        if (nodeDef.skin !== void 0) {
	          meshDefs[nodeDef.mesh].isSkinnedMesh = true;
	        }
	      }
	      if (nodeDef.camera !== void 0) {
	        this._addNodeRef(this.cameraCache, nodeDef.camera);
	      }
	    }
	  }
	  /**
	   * Counts references to shared node / Object3D resources. These resources
	   * can be reused, or "instantiated", at multiple nodes in the scene
	   * hierarchy. Mesh, Camera, and Light instances are instantiated and must
	   * be marked. Non-scenegraph resources (like Materials, Geometries, and
	   * Textures) can be reused directly and are not marked here.
	   *
	   * Example: CesiumMilkTruck sample model reuses "Wheel" meshes.
	   *
	   * @private
	   * @param {Object} cache
	   * @param {Object3D} index
	   */
	  _addNodeRef(cache2, index) {
	    if (index === void 0) return;
	    if (cache2.refs[index] === void 0) {
	      cache2.refs[index] = cache2.uses[index] = 0;
	    }
	    cache2.refs[index]++;
	  }
	  /**
	   * Returns a reference to a shared resource, cloning it if necessary.
	   *
	   * @private
	   * @param {Object} cache
	   * @param {number} index
	   * @param {Object} object
	   * @return {Object}
	   */
	  _getNodeRef(cache2, index, object) {
	    if (cache2.refs[index] <= 1) return object;
	    const ref = object.clone();
	    const updateMappings = (original, clone2) => {
	      const mappings = this.associations.get(original);
	      if (mappings != null) {
	        this.associations.set(clone2, mappings);
	      }
	      for (const [i, child] of original.children.entries()) {
	        updateMappings(child, clone2.children[i]);
	      }
	    };
	    updateMappings(object, ref);
	    ref.name += "_instance_" + cache2.uses[index]++;
	    return ref;
	  }
	  _invokeOne(func) {
	    const extensions = Object.values(this.plugins);
	    extensions.push(this);
	    for (let i = 0; i < extensions.length; i++) {
	      const result = func(extensions[i]);
	      if (result) return result;
	    }
	    return null;
	  }
	  _invokeAll(func) {
	    const extensions = Object.values(this.plugins);
	    extensions.unshift(this);
	    const pending = [];
	    for (let i = 0; i < extensions.length; i++) {
	      const result = func(extensions[i]);
	      if (result) pending.push(result);
	    }
	    return pending;
	  }
	  /**
	   * Requests the specified dependency asynchronously, with caching.
	   *
	   * @private
	   * @param {string} type
	   * @param {number} index
	   * @return {Promise<Object3D|Material|Texture|AnimationClip|ArrayBuffer|Object>}
	   */
	  getDependency(type, index) {
	    const cacheKey = type + ":" + index;
	    let dependency = this.cache.get(cacheKey);
	    if (!dependency) {
	      switch (type) {
	        case "scene":
	          dependency = this.loadScene(index);
	          break;
	        case "node":
	          dependency = this._invokeOne(function(ext) {
	            return ext.loadNode && ext.loadNode(index);
	          });
	          break;
	        case "mesh":
	          dependency = this._invokeOne(function(ext) {
	            return ext.loadMesh && ext.loadMesh(index);
	          });
	          break;
	        case "accessor":
	          dependency = this.loadAccessor(index);
	          break;
	        case "bufferView":
	          dependency = this._invokeOne(function(ext) {
	            return ext.loadBufferView && ext.loadBufferView(index);
	          });
	          break;
	        case "buffer":
	          dependency = this.loadBuffer(index);
	          break;
	        case "material":
	          dependency = this._invokeOne(function(ext) {
	            return ext.loadMaterial && ext.loadMaterial(index);
	          });
	          break;
	        case "texture":
	          dependency = this._invokeOne(function(ext) {
	            return ext.loadTexture && ext.loadTexture(index);
	          });
	          break;
	        case "skin":
	          dependency = this.loadSkin(index);
	          break;
	        case "animation":
	          dependency = this._invokeOne(function(ext) {
	            return ext.loadAnimation && ext.loadAnimation(index);
	          });
	          break;
	        case "camera":
	          dependency = this.loadCamera(index);
	          break;
	        default:
	          dependency = this._invokeOne(function(ext) {
	            return ext != this && ext.getDependency && ext.getDependency(type, index);
	          });
	          if (!dependency) {
	            throw new Error("Unknown type: " + type);
	          }
	          break;
	      }
	      this.cache.add(cacheKey, dependency);
	    }
	    return dependency;
	  }
	  /**
	   * Requests all dependencies of the specified type asynchronously, with caching.
	   *
	   * @private
	   * @param {string} type
	   * @return {Promise<Array<Object>>}
	   */
	  getDependencies(type) {
	    let dependencies = this.cache.get(type);
	    if (!dependencies) {
	      const parser = this;
	      const defs = this.json[type + (type === "mesh" ? "es" : "s")] || [];
	      dependencies = Promise.all(defs.map(function(def, index) {
	        return parser.getDependency(type, index);
	      }));
	      this.cache.add(type, dependencies);
	    }
	    return dependencies;
	  }
	  /**
	   * Specification: https://github.com/KhronosGroup/glTF/blob/master/specification/2.0/README.md#buffers-and-buffer-views
	   *
	   * @private
	   * @param {number} bufferIndex
	   * @return {Promise<ArrayBuffer>}
	   */
	  loadBuffer(bufferIndex) {
	    const bufferDef = this.json.buffers[bufferIndex];
	    const loader = this.fileLoader;
	    if (bufferDef.type && bufferDef.type !== "arraybuffer") {
	      throw new Error("THREE.GLTFLoader: " + bufferDef.type + " buffer type is not supported.");
	    }
	    if (bufferDef.uri === void 0 && bufferIndex === 0) {
	      return Promise.resolve(this.extensions[EXTENSIONS.KHR_BINARY_GLTF].body);
	    }
	    const options = this.options;
	    return new Promise(function(resolve, reject) {
	      loader.load(three.LoaderUtils.resolveURL(bufferDef.uri, options.path), resolve, void 0, function() {
	        reject(new Error('THREE.GLTFLoader: Failed to load buffer "' + bufferDef.uri + '".'));
	      });
	    });
	  }
	  /**
	   * Specification: https://github.com/KhronosGroup/glTF/blob/master/specification/2.0/README.md#buffers-and-buffer-views
	   *
	   * @private
	   * @param {number} bufferViewIndex
	   * @return {Promise<ArrayBuffer>}
	   */
	  loadBufferView(bufferViewIndex) {
	    const bufferViewDef = this.json.bufferViews[bufferViewIndex];
	    return this.getDependency("buffer", bufferViewDef.buffer).then(function(buffer) {
	      const byteLength = bufferViewDef.byteLength || 0;
	      const byteOffset = bufferViewDef.byteOffset || 0;
	      return buffer.slice(byteOffset, byteOffset + byteLength);
	    });
	  }
	  /**
	   * Specification: https://github.com/KhronosGroup/glTF/blob/master/specification/2.0/README.md#accessors
	   *
	   * @private
	   * @param {number} accessorIndex
	   * @return {Promise<BufferAttribute|InterleavedBufferAttribute>}
	   */
	  loadAccessor(accessorIndex) {
	    const parser = this;
	    const json = this.json;
	    const accessorDef = this.json.accessors[accessorIndex];
	    if (accessorDef.bufferView === void 0 && accessorDef.sparse === void 0) {
	      const itemSize = WEBGL_TYPE_SIZES[accessorDef.type];
	      const TypedArray = WEBGL_COMPONENT_TYPES[accessorDef.componentType];
	      const normalized = accessorDef.normalized === true;
	      const array = new TypedArray(accessorDef.count * itemSize);
	      return Promise.resolve(new three.BufferAttribute(array, itemSize, normalized));
	    }
	    const pendingBufferViews = [];
	    if (accessorDef.bufferView !== void 0) {
	      pendingBufferViews.push(this.getDependency("bufferView", accessorDef.bufferView));
	    } else {
	      pendingBufferViews.push(null);
	    }
	    if (accessorDef.sparse !== void 0) {
	      pendingBufferViews.push(this.getDependency("bufferView", accessorDef.sparse.indices.bufferView));
	      pendingBufferViews.push(this.getDependency("bufferView", accessorDef.sparse.values.bufferView));
	    }
	    return Promise.all(pendingBufferViews).then(function(bufferViews) {
	      const bufferView = bufferViews[0];
	      const itemSize = WEBGL_TYPE_SIZES[accessorDef.type];
	      const TypedArray = WEBGL_COMPONENT_TYPES[accessorDef.componentType];
	      const elementBytes = TypedArray.BYTES_PER_ELEMENT;
	      const itemBytes = elementBytes * itemSize;
	      const byteOffset = accessorDef.byteOffset || 0;
	      const byteStride = accessorDef.bufferView !== void 0 ? json.bufferViews[accessorDef.bufferView].byteStride : void 0;
	      const normalized = accessorDef.normalized === true;
	      let array, bufferAttribute;
	      if (byteStride && byteStride !== itemBytes) {
	        const ibSlice = Math.floor(byteOffset / byteStride);
	        const ibCacheKey = "InterleavedBuffer:" + accessorDef.bufferView + ":" + accessorDef.componentType + ":" + ibSlice + ":" + accessorDef.count;
	        let ib = parser.cache.get(ibCacheKey);
	        if (!ib) {
	          array = new TypedArray(bufferView, ibSlice * byteStride, accessorDef.count * byteStride / elementBytes);
	          ib = new three.InterleavedBuffer(array, byteStride / elementBytes);
	          parser.cache.add(ibCacheKey, ib);
	        }
	        bufferAttribute = new three.InterleavedBufferAttribute(ib, itemSize, byteOffset % byteStride / elementBytes, normalized);
	      } else {
	        if (bufferView === null) {
	          array = new TypedArray(accessorDef.count * itemSize);
	        } else {
	          array = new TypedArray(bufferView, byteOffset, accessorDef.count * itemSize);
	        }
	        bufferAttribute = new three.BufferAttribute(array, itemSize, normalized);
	      }
	      if (accessorDef.sparse !== void 0) {
	        const itemSizeIndices = WEBGL_TYPE_SIZES.SCALAR;
	        const TypedArrayIndices = WEBGL_COMPONENT_TYPES[accessorDef.sparse.indices.componentType];
	        const byteOffsetIndices = accessorDef.sparse.indices.byteOffset || 0;
	        const byteOffsetValues = accessorDef.sparse.values.byteOffset || 0;
	        const sparseIndices = new TypedArrayIndices(bufferViews[1], byteOffsetIndices, accessorDef.sparse.count * itemSizeIndices);
	        const sparseValues = new TypedArray(bufferViews[2], byteOffsetValues, accessorDef.sparse.count * itemSize);
	        if (bufferView !== null) {
	          bufferAttribute = new three.BufferAttribute(bufferAttribute.array.slice(), bufferAttribute.itemSize, bufferAttribute.normalized);
	        }
	        bufferAttribute.normalized = false;
	        for (let i = 0, il = sparseIndices.length; i < il; i++) {
	          const index = sparseIndices[i];
	          bufferAttribute.setX(index, sparseValues[i * itemSize]);
	          if (itemSize >= 2) bufferAttribute.setY(index, sparseValues[i * itemSize + 1]);
	          if (itemSize >= 3) bufferAttribute.setZ(index, sparseValues[i * itemSize + 2]);
	          if (itemSize >= 4) bufferAttribute.setW(index, sparseValues[i * itemSize + 3]);
	          if (itemSize >= 5) throw new Error("THREE.GLTFLoader: Unsupported itemSize in sparse BufferAttribute.");
	        }
	        bufferAttribute.normalized = normalized;
	      }
	      return bufferAttribute;
	    });
	  }
	  /**
	   * Specification: https://github.com/KhronosGroup/glTF/tree/master/specification/2.0#textures
	   *
	   * @private
	   * @param {number} textureIndex
	   * @return {Promise<?Texture>}
	   */
	  loadTexture(textureIndex) {
	    const json = this.json;
	    const options = this.options;
	    const textureDef = json.textures[textureIndex];
	    const sourceIndex = textureDef.source;
	    const sourceDef = json.images[sourceIndex];
	    let loader = this.textureLoader;
	    if (sourceDef.uri) {
	      const handler = options.manager.getHandler(sourceDef.uri);
	      if (handler !== null) loader = handler;
	    }
	    return this.loadTextureImage(textureIndex, sourceIndex, loader);
	  }
	  loadTextureImage(textureIndex, sourceIndex, loader) {
	    const parser = this;
	    const json = this.json;
	    const textureDef = json.textures[textureIndex];
	    const sourceDef = json.images[sourceIndex];
	    const cacheKey = (sourceDef.uri || sourceDef.bufferView) + ":" + textureDef.sampler;
	    if (this.textureCache[cacheKey]) {
	      return this.textureCache[cacheKey];
	    }
	    const promise = this.loadImageSource(sourceIndex, loader).then(function(texture) {
	      texture.flipY = false;
	      texture.name = textureDef.name || sourceDef.name || "";
	      if (texture.name === "" && typeof sourceDef.uri === "string" && sourceDef.uri.startsWith("data:image/") === false) {
	        texture.name = sourceDef.uri;
	      }
	      const samplers = json.samplers || {};
	      const sampler = samplers[textureDef.sampler] || {};
	      texture.magFilter = WEBGL_FILTERS[sampler.magFilter] || three.LinearFilter;
	      texture.minFilter = WEBGL_FILTERS[sampler.minFilter] || three.LinearMipmapLinearFilter;
	      texture.wrapS = WEBGL_WRAPPINGS[sampler.wrapS] || three.RepeatWrapping;
	      texture.wrapT = WEBGL_WRAPPINGS[sampler.wrapT] || three.RepeatWrapping;
	      texture.generateMipmaps = !texture.isCompressedTexture && texture.minFilter !== three.NearestFilter && texture.minFilter !== three.LinearFilter;
	      parser.associations.set(texture, { textures: textureIndex });
	      return texture;
	    }).catch(function() {
	      return null;
	    });
	    this.textureCache[cacheKey] = promise;
	    return promise;
	  }
	  loadImageSource(sourceIndex, loader) {
	    const parser = this;
	    const json = this.json;
	    const options = this.options;
	    if (this.sourceCache[sourceIndex] !== void 0) {
	      return this.sourceCache[sourceIndex].then((texture) => texture.clone());
	    }
	    const sourceDef = json.images[sourceIndex];
	    const URL2 = self.URL || self.webkitURL;
	    let sourceURI = sourceDef.uri || "";
	    let isObjectURL = false;
	    if (sourceDef.bufferView !== void 0) {
	      sourceURI = parser.getDependency("bufferView", sourceDef.bufferView).then(function(bufferView) {
	        isObjectURL = true;
	        const blob = new Blob([bufferView], { type: sourceDef.mimeType });
	        sourceURI = URL2.createObjectURL(blob);
	        return sourceURI;
	      });
	    } else if (sourceDef.uri === void 0) {
	      throw new Error("THREE.GLTFLoader: Image " + sourceIndex + " is missing URI and bufferView");
	    }
	    const promise = Promise.resolve(sourceURI).then(function(sourceURI2) {
	      return new Promise(function(resolve, reject) {
	        let onLoad = resolve;
	        if (loader.isImageBitmapLoader === true) {
	          onLoad = function(imageBitmap) {
	            const texture = new three.Texture(imageBitmap);
	            texture.needsUpdate = true;
	            resolve(texture);
	          };
	        }
	        loader.load(three.LoaderUtils.resolveURL(sourceURI2, options.path), onLoad, void 0, reject);
	      });
	    }).then(function(texture) {
	      if (isObjectURL === true) {
	        URL2.revokeObjectURL(sourceURI);
	      }
	      assignExtrasToUserData(texture, sourceDef);
	      texture.userData.mimeType = sourceDef.mimeType || getImageURIMimeType(sourceDef.uri);
	      return texture;
	    }).catch(function(error) {
	      console.error("THREE.GLTFLoader: Couldn't load texture", sourceURI);
	      throw error;
	    });
	    this.sourceCache[sourceIndex] = promise;
	    return promise;
	  }
	  /**
	   * Asynchronously assigns a texture to the given material parameters.
	   *
	   * @private
	   * @param {Object} materialParams
	   * @param {string} mapName
	   * @param {Object} mapDef
	   * @param {string} [colorSpace]
	   * @return {Promise<Texture>}
	   */
	  assignTexture(materialParams, mapName, mapDef, colorSpace) {
	    const parser = this;
	    return this.getDependency("texture", mapDef.index).then(function(texture) {
	      if (!texture) return null;
	      if (mapDef.texCoord !== void 0 && mapDef.texCoord > 0) {
	        texture = texture.clone();
	        texture.channel = mapDef.texCoord;
	      }
	      if (parser.extensions[EXTENSIONS.KHR_TEXTURE_TRANSFORM]) {
	        const transform = mapDef.extensions !== void 0 ? mapDef.extensions[EXTENSIONS.KHR_TEXTURE_TRANSFORM] : void 0;
	        if (transform) {
	          const gltfReference = parser.associations.get(texture);
	          texture = parser.extensions[EXTENSIONS.KHR_TEXTURE_TRANSFORM].extendTexture(texture, transform);
	          parser.associations.set(texture, gltfReference);
	        }
	      }
	      if (colorSpace !== void 0) {
	        texture.colorSpace = colorSpace;
	      }
	      materialParams[mapName] = texture;
	      return texture;
	    });
	  }
	  /**
	   * Assigns final material to a Mesh, Line, or Points instance. The instance
	   * already has a material (generated from the glTF material options alone)
	   * but reuse of the same glTF material may require multiple threejs materials
	   * to accommodate different primitive types, defines, etc. New materials will
	   * be created if necessary, and reused from a cache.
	   *
	   * @private
	   * @param {Object3D} mesh Mesh, Line, or Points instance.
	   */
	  assignFinalMaterial(mesh) {
	    const geometry = mesh.geometry;
	    let material = mesh.material;
	    const useDerivativeTangents = geometry.attributes.tangent === void 0;
	    const useVertexColors = geometry.attributes.color !== void 0;
	    const useFlatShading = geometry.attributes.normal === void 0;
	    if (mesh.isPoints) {
	      const cacheKey = "PointsMaterial:" + material.uuid;
	      let pointsMaterial = this.cache.get(cacheKey);
	      if (!pointsMaterial) {
	        pointsMaterial = new three.PointsMaterial();
	        three.Material.prototype.copy.call(pointsMaterial, material);
	        pointsMaterial.color.copy(material.color);
	        pointsMaterial.map = material.map;
	        pointsMaterial.sizeAttenuation = false;
	        this.cache.add(cacheKey, pointsMaterial);
	      }
	      material = pointsMaterial;
	    } else if (mesh.isLine) {
	      const cacheKey = "LineBasicMaterial:" + material.uuid;
	      let lineMaterial = this.cache.get(cacheKey);
	      if (!lineMaterial) {
	        lineMaterial = new three.LineBasicMaterial();
	        three.Material.prototype.copy.call(lineMaterial, material);
	        lineMaterial.color.copy(material.color);
	        lineMaterial.map = material.map;
	        this.cache.add(cacheKey, lineMaterial);
	      }
	      material = lineMaterial;
	    }
	    if (useDerivativeTangents || useVertexColors || useFlatShading) {
	      let cacheKey = "ClonedMaterial:" + material.uuid + ":";
	      if (useDerivativeTangents) cacheKey += "derivative-tangents:";
	      if (useVertexColors) cacheKey += "vertex-colors:";
	      if (useFlatShading) cacheKey += "flat-shading:";
	      let cachedMaterial = this.cache.get(cacheKey);
	      if (!cachedMaterial) {
	        cachedMaterial = material.clone();
	        if (useVertexColors) cachedMaterial.vertexColors = true;
	        if (useFlatShading) cachedMaterial.flatShading = true;
	        if (useDerivativeTangents) {
	          if (cachedMaterial.normalScale) cachedMaterial.normalScale.y *= -1;
	          if (cachedMaterial.clearcoatNormalScale) cachedMaterial.clearcoatNormalScale.y *= -1;
	        }
	        this.cache.add(cacheKey, cachedMaterial);
	        this.associations.set(cachedMaterial, this.associations.get(material));
	      }
	      material = cachedMaterial;
	    }
	    mesh.material = material;
	  }
	  getMaterialType() {
	    return three.MeshStandardMaterial;
	  }
	  /**
	   * Specification: https://github.com/KhronosGroup/glTF/blob/master/specification/2.0/README.md#materials
	   *
	   * @private
	   * @param {number} materialIndex
	   * @return {Promise<Material>}
	   */
	  loadMaterial(materialIndex) {
	    const parser = this;
	    const json = this.json;
	    const extensions = this.extensions;
	    const materialDef = json.materials[materialIndex];
	    let materialType;
	    const materialParams = {};
	    const materialExtensions = materialDef.extensions || {};
	    const pending = [];
	    if (materialExtensions[EXTENSIONS.KHR_MATERIALS_UNLIT]) {
	      const kmuExtension = extensions[EXTENSIONS.KHR_MATERIALS_UNLIT];
	      materialType = kmuExtension.getMaterialType();
	      pending.push(kmuExtension.extendParams(materialParams, materialDef, parser));
	    } else {
	      const metallicRoughness = materialDef.pbrMetallicRoughness || {};
	      materialParams.color = new three.Color(1, 1, 1);
	      materialParams.opacity = 1;
	      if (Array.isArray(metallicRoughness.baseColorFactor)) {
	        const array = metallicRoughness.baseColorFactor;
	        materialParams.color.setRGB(array[0], array[1], array[2], three.LinearSRGBColorSpace);
	        materialParams.opacity = array[3];
	      }
	      if (metallicRoughness.baseColorTexture !== void 0) {
	        pending.push(parser.assignTexture(materialParams, "map", metallicRoughness.baseColorTexture, three.SRGBColorSpace));
	      }
	      materialParams.metalness = metallicRoughness.metallicFactor !== void 0 ? metallicRoughness.metallicFactor : 1;
	      materialParams.roughness = metallicRoughness.roughnessFactor !== void 0 ? metallicRoughness.roughnessFactor : 1;
	      if (metallicRoughness.metallicRoughnessTexture !== void 0) {
	        pending.push(parser.assignTexture(materialParams, "metalnessMap", metallicRoughness.metallicRoughnessTexture));
	        pending.push(parser.assignTexture(materialParams, "roughnessMap", metallicRoughness.metallicRoughnessTexture));
	      }
	      materialType = this._invokeOne(function(ext) {
	        return ext.getMaterialType && ext.getMaterialType(materialIndex);
	      });
	      pending.push(Promise.all(this._invokeAll(function(ext) {
	        return ext.extendMaterialParams && ext.extendMaterialParams(materialIndex, materialParams);
	      })));
	    }
	    if (materialDef.doubleSided === true) {
	      materialParams.side = three.DoubleSide;
	    }
	    const alphaMode = materialDef.alphaMode || ALPHA_MODES.OPAQUE;
	    if (alphaMode === ALPHA_MODES.BLEND) {
	      materialParams.transparent = true;
	      materialParams.depthWrite = false;
	    } else {
	      materialParams.transparent = false;
	      if (alphaMode === ALPHA_MODES.MASK) {
	        materialParams.alphaTest = materialDef.alphaCutoff !== void 0 ? materialDef.alphaCutoff : 0.5;
	      }
	    }
	    if (materialDef.normalTexture !== void 0 && materialType !== three.MeshBasicMaterial) {
	      pending.push(parser.assignTexture(materialParams, "normalMap", materialDef.normalTexture));
	      materialParams.normalScale = new three.Vector2(1, 1);
	      if (materialDef.normalTexture.scale !== void 0) {
	        const scale = materialDef.normalTexture.scale;
	        materialParams.normalScale.set(scale, scale);
	      }
	    }
	    if (materialDef.occlusionTexture !== void 0 && materialType !== three.MeshBasicMaterial) {
	      pending.push(parser.assignTexture(materialParams, "aoMap", materialDef.occlusionTexture));
	      if (materialDef.occlusionTexture.strength !== void 0) {
	        materialParams.aoMapIntensity = materialDef.occlusionTexture.strength;
	      }
	    }
	    if (materialDef.emissiveFactor !== void 0 && materialType !== three.MeshBasicMaterial) {
	      const emissiveFactor = materialDef.emissiveFactor;
	      materialParams.emissive = new three.Color().setRGB(emissiveFactor[0], emissiveFactor[1], emissiveFactor[2], three.LinearSRGBColorSpace);
	    }
	    if (materialDef.emissiveTexture !== void 0 && materialType !== three.MeshBasicMaterial) {
	      pending.push(parser.assignTexture(materialParams, "emissiveMap", materialDef.emissiveTexture, three.SRGBColorSpace));
	    }
	    return Promise.all(pending).then(function() {
	      const material = new materialType(materialParams);
	      if (materialDef.name) material.name = materialDef.name;
	      assignExtrasToUserData(material, materialDef);
	      parser.associations.set(material, { materials: materialIndex });
	      if (materialDef.extensions) addUnknownExtensionsToUserData(extensions, material, materialDef);
	      return material;
	    });
	  }
	  /**
	   * When Object3D instances are targeted by animation, they need unique names.
	   *
	   * @private
	   * @param {string} originalName
	   * @return {string}
	   */
	  createUniqueName(originalName) {
	    const sanitizedName = three.PropertyBinding.sanitizeNodeName(originalName || "");
	    if (sanitizedName in this.nodeNamesUsed) {
	      return sanitizedName + "_" + ++this.nodeNamesUsed[sanitizedName];
	    } else {
	      this.nodeNamesUsed[sanitizedName] = 0;
	      return sanitizedName;
	    }
	  }
	  /**
	   * Specification: https://github.com/KhronosGroup/glTF/blob/master/specification/2.0/README.md#geometry
	   *
	   * Creates BufferGeometries from primitives.
	   *
	   * @private
	   * @param {Array<GLTF.Primitive>} primitives
	   * @return {Promise<Array<BufferGeometry>>}
	   */
	  loadGeometries(primitives) {
	    const parser = this;
	    const extensions = this.extensions;
	    const cache2 = this.primitiveCache;
	    function createDracoPrimitive(primitive) {
	      return extensions[EXTENSIONS.KHR_DRACO_MESH_COMPRESSION].decodePrimitive(primitive, parser).then(function(geometry) {
	        return addPrimitiveAttributes(geometry, primitive, parser);
	      });
	    }
	    const pending = [];
	    for (let i = 0, il = primitives.length; i < il; i++) {
	      const primitive = primitives[i];
	      const cacheKey = createPrimitiveKey(primitive);
	      const cached = cache2[cacheKey];
	      if (cached) {
	        pending.push(cached.promise);
	      } else {
	        let geometryPromise;
	        if (primitive.extensions && primitive.extensions[EXTENSIONS.KHR_DRACO_MESH_COMPRESSION]) {
	          geometryPromise = createDracoPrimitive(primitive);
	        } else {
	          geometryPromise = addPrimitiveAttributes(new three.BufferGeometry(), primitive, parser);
	        }
	        cache2[cacheKey] = { primitive, promise: geometryPromise };
	        pending.push(geometryPromise);
	      }
	    }
	    return Promise.all(pending);
	  }
	  /**
	   * Specification: https://github.com/KhronosGroup/glTF/blob/master/specification/2.0/README.md#meshes
	   *
	   * @private
	   * @param {number} meshIndex
	   * @return {Promise<Group|Mesh|SkinnedMesh|Line|Points>}
	   */
	  loadMesh(meshIndex) {
	    const parser = this;
	    const json = this.json;
	    const extensions = this.extensions;
	    const meshDef = json.meshes[meshIndex];
	    const primitives = meshDef.primitives;
	    const pending = [];
	    for (let i = 0, il = primitives.length; i < il; i++) {
	      const material = primitives[i].material === void 0 ? createDefaultMaterial(this.cache) : this.getDependency("material", primitives[i].material);
	      pending.push(material);
	    }
	    pending.push(parser.loadGeometries(primitives));
	    return Promise.all(pending).then(function(results) {
	      const materials = results.slice(0, results.length - 1);
	      const geometries = results[results.length - 1];
	      const meshes = [];
	      for (let i = 0, il = geometries.length; i < il; i++) {
	        const geometry = geometries[i];
	        const primitive = primitives[i];
	        let mesh;
	        const material = materials[i];
	        if (primitive.mode === WEBGL_CONSTANTS.TRIANGLES || primitive.mode === WEBGL_CONSTANTS.TRIANGLE_STRIP || primitive.mode === WEBGL_CONSTANTS.TRIANGLE_FAN || primitive.mode === void 0) {
	          mesh = meshDef.isSkinnedMesh === true ? new three.SkinnedMesh(geometry, material) : new three.Mesh(geometry, material);
	          if (mesh.isSkinnedMesh === true) {
	            mesh.normalizeSkinWeights();
	          }
	          if (primitive.mode === WEBGL_CONSTANTS.TRIANGLE_STRIP) {
	            mesh.geometry = toTrianglesDrawMode(mesh.geometry, three.TriangleStripDrawMode);
	          } else if (primitive.mode === WEBGL_CONSTANTS.TRIANGLE_FAN) {
	            mesh.geometry = toTrianglesDrawMode(mesh.geometry, three.TriangleFanDrawMode);
	          }
	        } else if (primitive.mode === WEBGL_CONSTANTS.LINES) {
	          mesh = new three.LineSegments(geometry, material);
	        } else if (primitive.mode === WEBGL_CONSTANTS.LINE_STRIP) {
	          mesh = new three.Line(geometry, material);
	        } else if (primitive.mode === WEBGL_CONSTANTS.LINE_LOOP) {
	          mesh = new three.LineLoop(geometry, material);
	        } else if (primitive.mode === WEBGL_CONSTANTS.POINTS) {
	          mesh = new three.Points(geometry, material);
	        } else {
	          throw new Error("THREE.GLTFLoader: Primitive mode unsupported: " + primitive.mode);
	        }
	        if (Object.keys(mesh.geometry.morphAttributes).length > 0) {
	          updateMorphTargets(mesh, meshDef);
	        }
	        mesh.name = parser.createUniqueName(meshDef.name || "mesh_" + meshIndex);
	        assignExtrasToUserData(mesh, meshDef);
	        if (primitive.extensions) addUnknownExtensionsToUserData(extensions, mesh, primitive);
	        parser.assignFinalMaterial(mesh);
	        meshes.push(mesh);
	      }
	      for (let i = 0, il = meshes.length; i < il; i++) {
	        parser.associations.set(meshes[i], {
	          meshes: meshIndex,
	          primitives: i
	        });
	      }
	      if (meshes.length === 1) {
	        if (meshDef.extensions) addUnknownExtensionsToUserData(extensions, meshes[0], meshDef);
	        return meshes[0];
	      }
	      const group = new three.Group();
	      if (meshDef.extensions) addUnknownExtensionsToUserData(extensions, group, meshDef);
	      parser.associations.set(group, { meshes: meshIndex });
	      for (let i = 0, il = meshes.length; i < il; i++) {
	        group.add(meshes[i]);
	      }
	      return group;
	    });
	  }
	  /**
	   * Specification: https://github.com/KhronosGroup/glTF/tree/master/specification/2.0#cameras
	   *
	   * @private
	   * @param {number} cameraIndex
	   * @return {Promise<Camera>|undefined}
	   */
	  loadCamera(cameraIndex) {
	    let camera;
	    const cameraDef = this.json.cameras[cameraIndex];
	    const params = cameraDef[cameraDef.type];
	    if (!params) {
	      console.warn("THREE.GLTFLoader: Missing camera parameters.");
	      return;
	    }
	    if (cameraDef.type === "perspective") {
	      camera = new three.PerspectiveCamera(three.MathUtils.radToDeg(params.yfov), params.aspectRatio || 1, params.znear || 1, params.zfar || 2e6);
	    } else if (cameraDef.type === "orthographic") {
	      camera = new three.OrthographicCamera(-params.xmag, params.xmag, params.ymag, -params.ymag, params.znear, params.zfar);
	    }
	    if (cameraDef.name) camera.name = this.createUniqueName(cameraDef.name);
	    assignExtrasToUserData(camera, cameraDef);
	    return Promise.resolve(camera);
	  }
	  /**
	   * Specification: https://github.com/KhronosGroup/glTF/tree/master/specification/2.0#skins
	   *
	   * @private
	   * @param {number} skinIndex
	   * @return {Promise<Skeleton>}
	   */
	  loadSkin(skinIndex) {
	    const skinDef = this.json.skins[skinIndex];
	    const pending = [];
	    for (let i = 0, il = skinDef.joints.length; i < il; i++) {
	      pending.push(this._loadNodeShallow(skinDef.joints[i]));
	    }
	    if (skinDef.inverseBindMatrices !== void 0) {
	      pending.push(this.getDependency("accessor", skinDef.inverseBindMatrices));
	    } else {
	      pending.push(null);
	    }
	    return Promise.all(pending).then(function(results) {
	      const inverseBindMatrices = results.pop();
	      const jointNodes = results;
	      const bones = [];
	      const boneInverses = [];
	      for (let i = 0, il = jointNodes.length; i < il; i++) {
	        const jointNode = jointNodes[i];
	        if (jointNode) {
	          bones.push(jointNode);
	          const mat = new three.Matrix4();
	          if (inverseBindMatrices !== null) {
	            mat.fromArray(inverseBindMatrices.array, i * 16);
	          }
	          boneInverses.push(mat);
	        } else {
	          console.warn('THREE.GLTFLoader: Joint "%s" could not be found.', skinDef.joints[i]);
	        }
	      }
	      return new three.Skeleton(bones, boneInverses);
	    });
	  }
	  /**
	   * Specification: https://github.com/KhronosGroup/glTF/tree/master/specification/2.0#animations
	   *
	   * @private
	   * @param {number} animationIndex
	   * @return {Promise<AnimationClip>}
	   */
	  loadAnimation(animationIndex) {
	    const json = this.json;
	    const parser = this;
	    const animationDef = json.animations[animationIndex];
	    const animationName = animationDef.name ? animationDef.name : "animation_" + animationIndex;
	    const pendingNodes = [];
	    const pendingInputAccessors = [];
	    const pendingOutputAccessors = [];
	    const pendingSamplers = [];
	    const pendingTargets = [];
	    for (let i = 0, il = animationDef.channels.length; i < il; i++) {
	      const channel = animationDef.channels[i];
	      const sampler = animationDef.samplers[channel.sampler];
	      const target = channel.target;
	      const name = target.node;
	      const input = animationDef.parameters !== void 0 ? animationDef.parameters[sampler.input] : sampler.input;
	      const output = animationDef.parameters !== void 0 ? animationDef.parameters[sampler.output] : sampler.output;
	      if (target.node === void 0) continue;
	      pendingNodes.push(this.getDependency("node", name));
	      pendingInputAccessors.push(this.getDependency("accessor", input));
	      pendingOutputAccessors.push(this.getDependency("accessor", output));
	      pendingSamplers.push(sampler);
	      pendingTargets.push(target);
	    }
	    return Promise.all([
	      Promise.all(pendingNodes),
	      Promise.all(pendingInputAccessors),
	      Promise.all(pendingOutputAccessors),
	      Promise.all(pendingSamplers),
	      Promise.all(pendingTargets)
	    ]).then(function(dependencies) {
	      const nodes = dependencies[0];
	      const inputAccessors = dependencies[1];
	      const outputAccessors = dependencies[2];
	      const samplers = dependencies[3];
	      const targets = dependencies[4];
	      const tracks = [];
	      for (let i = 0, il = nodes.length; i < il; i++) {
	        const node = nodes[i];
	        const inputAccessor = inputAccessors[i];
	        const outputAccessor = outputAccessors[i];
	        const sampler = samplers[i];
	        const target = targets[i];
	        if (node === void 0) continue;
	        if (node.updateMatrix) {
	          node.updateMatrix();
	        }
	        const createdTracks = parser._createAnimationTracks(node, inputAccessor, outputAccessor, sampler, target);
	        if (createdTracks) {
	          for (let k = 0; k < createdTracks.length; k++) {
	            tracks.push(createdTracks[k]);
	          }
	        }
	      }
	      const animation = new three.AnimationClip(animationName, void 0, tracks);
	      assignExtrasToUserData(animation, animationDef);
	      return animation;
	    });
	  }
	  createNodeMesh(nodeIndex) {
	    const json = this.json;
	    const parser = this;
	    const nodeDef = json.nodes[nodeIndex];
	    if (nodeDef.mesh === void 0) return null;
	    return parser.getDependency("mesh", nodeDef.mesh).then(function(mesh) {
	      const node = parser._getNodeRef(parser.meshCache, nodeDef.mesh, mesh);
	      if (nodeDef.weights !== void 0) {
	        node.traverse(function(o) {
	          if (!o.isMesh) return;
	          for (let i = 0, il = nodeDef.weights.length; i < il; i++) {
	            o.morphTargetInfluences[i] = nodeDef.weights[i];
	          }
	        });
	      }
	      return node;
	    });
	  }
	  /**
	   * Specification: https://github.com/KhronosGroup/glTF/tree/master/specification/2.0#nodes-and-hierarchy
	   *
	   * @private
	   * @param {number} nodeIndex
	   * @return {Promise<Object3D>}
	   */
	  loadNode(nodeIndex) {
	    const json = this.json;
	    const parser = this;
	    const nodeDef = json.nodes[nodeIndex];
	    const nodePending = parser._loadNodeShallow(nodeIndex);
	    const childPending = [];
	    const childrenDef = nodeDef.children || [];
	    for (let i = 0, il = childrenDef.length; i < il; i++) {
	      childPending.push(parser.getDependency("node", childrenDef[i]));
	    }
	    const skeletonPending = nodeDef.skin === void 0 ? Promise.resolve(null) : parser.getDependency("skin", nodeDef.skin);
	    return Promise.all([
	      nodePending,
	      Promise.all(childPending),
	      skeletonPending
	    ]).then(function(results) {
	      const node = results[0];
	      const children = results[1];
	      const skeleton = results[2];
	      if (skeleton !== null) {
	        node.traverse(function(mesh) {
	          if (!mesh.isSkinnedMesh) return;
	          mesh.bind(skeleton, _identityMatrix);
	        });
	      }
	      for (let i = 0, il = children.length; i < il; i++) {
	        node.add(children[i]);
	      }
	      if (node.userData.pivot !== void 0 && children.length > 0) {
	        const pivot = node.userData.pivot;
	        const pivotChild = children[0];
	        node.pivot = new three.Vector3().fromArray(pivot);
	        node.position.x -= pivot[0];
	        node.position.y -= pivot[1];
	        node.position.z -= pivot[2];
	        pivotChild.position.set(0, 0, 0);
	        delete node.userData.pivot;
	      }
	      return node;
	    });
	  }
	  // ._loadNodeShallow() parses a single node.
	  // skin and child nodes are created and added in .loadNode() (no '_' prefix).
	  _loadNodeShallow(nodeIndex) {
	    const json = this.json;
	    const extensions = this.extensions;
	    const parser = this;
	    if (this.nodeCache[nodeIndex] !== void 0) {
	      return this.nodeCache[nodeIndex];
	    }
	    const nodeDef = json.nodes[nodeIndex];
	    const nodeName = nodeDef.name ? parser.createUniqueName(nodeDef.name) : "";
	    const pending = [];
	    const meshPromise = parser._invokeOne(function(ext) {
	      return ext.createNodeMesh && ext.createNodeMesh(nodeIndex);
	    });
	    if (meshPromise) {
	      pending.push(meshPromise);
	    }
	    if (nodeDef.camera !== void 0) {
	      pending.push(parser.getDependency("camera", nodeDef.camera).then(function(camera) {
	        return parser._getNodeRef(parser.cameraCache, nodeDef.camera, camera);
	      }));
	    }
	    parser._invokeAll(function(ext) {
	      return ext.createNodeAttachment && ext.createNodeAttachment(nodeIndex);
	    }).forEach(function(promise) {
	      pending.push(promise);
	    });
	    this.nodeCache[nodeIndex] = Promise.all(pending).then(function(objects) {
	      let node;
	      if (nodeDef.isBone === true) {
	        node = new three.Bone();
	      } else if (objects.length > 1) {
	        node = new three.Group();
	      } else if (objects.length === 1) {
	        node = objects[0];
	      } else {
	        node = new three.Object3D();
	      }
	      if (node !== objects[0]) {
	        for (let i = 0, il = objects.length; i < il; i++) {
	          node.add(objects[i]);
	        }
	      }
	      if (nodeDef.name) {
	        node.userData.name = nodeDef.name;
	        node.name = nodeName;
	      }
	      assignExtrasToUserData(node, nodeDef);
	      if (nodeDef.extensions) addUnknownExtensionsToUserData(extensions, node, nodeDef);
	      if (nodeDef.matrix !== void 0) {
	        const matrix = new three.Matrix4();
	        matrix.fromArray(nodeDef.matrix);
	        node.applyMatrix4(matrix);
	      } else {
	        if (nodeDef.translation !== void 0) {
	          node.position.fromArray(nodeDef.translation);
	        }
	        if (nodeDef.rotation !== void 0) {
	          node.quaternion.fromArray(nodeDef.rotation);
	        }
	        if (nodeDef.scale !== void 0) {
	          node.scale.fromArray(nodeDef.scale);
	        }
	      }
	      if (!parser.associations.has(node)) {
	        parser.associations.set(node, {});
	      } else if (nodeDef.mesh !== void 0 && parser.meshCache.refs[nodeDef.mesh] > 1) {
	        const mapping = parser.associations.get(node);
	        parser.associations.set(node, { ...mapping });
	      }
	      parser.associations.get(node).nodes = nodeIndex;
	      return node;
	    });
	    return this.nodeCache[nodeIndex];
	  }
	  /**
	   * Specification: https://github.com/KhronosGroup/glTF/tree/master/specification/2.0#scenes
	   *
	   * @private
	   * @param {number} sceneIndex
	   * @return {Promise<Group>}
	   */
	  loadScene(sceneIndex) {
	    const extensions = this.extensions;
	    const sceneDef = this.json.scenes[sceneIndex];
	    const parser = this;
	    const scene = new three.Group();
	    if (sceneDef.name) scene.name = parser.createUniqueName(sceneDef.name);
	    assignExtrasToUserData(scene, sceneDef);
	    if (sceneDef.extensions) addUnknownExtensionsToUserData(extensions, scene, sceneDef);
	    const nodeIds = sceneDef.nodes || [];
	    const pending = [];
	    for (let i = 0, il = nodeIds.length; i < il; i++) {
	      pending.push(parser.getDependency("node", nodeIds[i]));
	    }
	    return Promise.all(pending).then(function(nodes) {
	      for (let i = 0, il = nodes.length; i < il; i++) {
	        const node = nodes[i];
	        if (node.parent !== null) {
	          scene.add(clone(node));
	        } else {
	          scene.add(node);
	        }
	      }
	      const reduceAssociations = (node) => {
	        const reducedAssociations = /* @__PURE__ */ new Map();
	        for (const [key, value] of parser.associations) {
	          if (key instanceof three.Material || key instanceof three.Texture) {
	            reducedAssociations.set(key, value);
	          }
	        }
	        node.traverse((node2) => {
	          const mappings = parser.associations.get(node2);
	          if (mappings != null) {
	            reducedAssociations.set(node2, mappings);
	          }
	        });
	        return reducedAssociations;
	      };
	      parser.associations = reduceAssociations(scene);
	      return scene;
	    });
	  }
	  _createAnimationTracks(node, inputAccessor, outputAccessor, sampler, target) {
	    const tracks = [];
	    const targetName = node.name ? node.name : node.uuid;
	    const targetNames = [];
	    function collectMorphTargets(object) {
	      if (object.morphTargetInfluences) {
	        targetNames.push(object.name ? object.name : object.uuid);
	      }
	    }
	    if (PATH_PROPERTIES[target.path] === PATH_PROPERTIES.weights) {
	      collectMorphTargets(node);
	      if (node.isGroup) {
	        node.children.forEach(collectMorphTargets);
	      }
	    } else {
	      targetNames.push(targetName);
	    }
	    let TypedKeyframeTrack;
	    switch (PATH_PROPERTIES[target.path]) {
	      case PATH_PROPERTIES.weights:
	        TypedKeyframeTrack = three.NumberKeyframeTrack;
	        break;
	      case PATH_PROPERTIES.rotation:
	        TypedKeyframeTrack = three.QuaternionKeyframeTrack;
	        break;
	      case PATH_PROPERTIES.translation:
	      case PATH_PROPERTIES.scale:
	        TypedKeyframeTrack = three.VectorKeyframeTrack;
	        break;
	      default:
	        switch (outputAccessor.itemSize) {
	          case 1:
	            TypedKeyframeTrack = three.NumberKeyframeTrack;
	            break;
	          case 2:
	          case 3:
	          default:
	            TypedKeyframeTrack = three.VectorKeyframeTrack;
	            break;
	        }
	        break;
	    }
	    const interpolation = sampler.interpolation !== void 0 ? INTERPOLATION[sampler.interpolation] : three.InterpolateLinear;
	    const outputArray = this._getArrayFromAccessor(outputAccessor);
	    for (let j = 0, jl = targetNames.length; j < jl; j++) {
	      const track = new TypedKeyframeTrack(
	        targetNames[j] + "." + PATH_PROPERTIES[target.path],
	        inputAccessor.array,
	        outputArray,
	        interpolation
	      );
	      if (sampler.interpolation === "CUBICSPLINE") {
	        this._createCubicSplineTrackInterpolant(track);
	      }
	      tracks.push(track);
	    }
	    return tracks;
	  }
	  _getArrayFromAccessor(accessor) {
	    let outputArray = accessor.array;
	    if (accessor.normalized) {
	      const scale = getNormalizedComponentScale(outputArray.constructor);
	      const scaled = new Float32Array(outputArray.length);
	      for (let j = 0, jl = outputArray.length; j < jl; j++) {
	        scaled[j] = outputArray[j] * scale;
	      }
	      outputArray = scaled;
	    }
	    return outputArray;
	  }
	  _createCubicSplineTrackInterpolant(track) {
	    track.createInterpolant = function InterpolantFactoryMethodGLTFCubicSpline(result) {
	      const interpolantType = this instanceof three.QuaternionKeyframeTrack ? GLTFCubicSplineQuaternionInterpolant : GLTFCubicSplineInterpolant;
	      return new interpolantType(this.times, this.values, this.getValueSize() / 3, result);
	    };
	    track.createInterpolant.isInterpolantFactoryMethodGLTFCubicSpline = true;
	  }
	};
	function computeBounds(geometry, primitiveDef, parser) {
	  const attributes = primitiveDef.attributes;
	  const box = new three.Box3();
	  if (attributes.POSITION !== void 0) {
	    const accessor = parser.json.accessors[attributes.POSITION];
	    const min = accessor.min;
	    const max = accessor.max;
	    if (min !== void 0 && max !== void 0) {
	      box.set(
	        new three.Vector3(min[0], min[1], min[2]),
	        new three.Vector3(max[0], max[1], max[2])
	      );
	      if (accessor.normalized) {
	        const boxScale = getNormalizedComponentScale(WEBGL_COMPONENT_TYPES[accessor.componentType]);
	        box.min.multiplyScalar(boxScale);
	        box.max.multiplyScalar(boxScale);
	      }
	    } else {
	      console.warn("THREE.GLTFLoader: Missing min/max properties for accessor POSITION.");
	      return;
	    }
	  } else {
	    return;
	  }
	  const targets = primitiveDef.targets;
	  if (targets !== void 0) {
	    const maxDisplacement = new three.Vector3();
	    const vector = new three.Vector3();
	    for (let i = 0, il = targets.length; i < il; i++) {
	      const target = targets[i];
	      if (target.POSITION !== void 0) {
	        const accessor = parser.json.accessors[target.POSITION];
	        const min = accessor.min;
	        const max = accessor.max;
	        if (min !== void 0 && max !== void 0) {
	          vector.setX(Math.max(Math.abs(min[0]), Math.abs(max[0])));
	          vector.setY(Math.max(Math.abs(min[1]), Math.abs(max[1])));
	          vector.setZ(Math.max(Math.abs(min[2]), Math.abs(max[2])));
	          if (accessor.normalized) {
	            const boxScale = getNormalizedComponentScale(WEBGL_COMPONENT_TYPES[accessor.componentType]);
	            vector.multiplyScalar(boxScale);
	          }
	          maxDisplacement.max(vector);
	        } else {
	          console.warn("THREE.GLTFLoader: Missing min/max properties for accessor POSITION.");
	        }
	      }
	    }
	    box.expandByVector(maxDisplacement);
	  }
	  geometry.boundingBox = box;
	  const sphere = new three.Sphere();
	  box.getCenter(sphere.center);
	  sphere.radius = box.min.distanceTo(box.max) / 2;
	  geometry.boundingSphere = sphere;
	}
	function addPrimitiveAttributes(geometry, primitiveDef, parser) {
	  const attributes = primitiveDef.attributes;
	  const pending = [];
	  function assignAttributeAccessor(accessorIndex, attributeName) {
	    return parser.getDependency("accessor", accessorIndex).then(function(accessor) {
	      geometry.setAttribute(attributeName, accessor);
	    });
	  }
	  for (const gltfAttributeName in attributes) {
	    const threeAttributeName = ATTRIBUTES[gltfAttributeName] || gltfAttributeName.toLowerCase();
	    if (threeAttributeName in geometry.attributes) continue;
	    pending.push(assignAttributeAccessor(attributes[gltfAttributeName], threeAttributeName));
	  }
	  if (primitiveDef.indices !== void 0 && !geometry.index) {
	    const accessor = parser.getDependency("accessor", primitiveDef.indices).then(function(accessor2) {
	      geometry.setIndex(accessor2);
	    });
	    pending.push(accessor);
	  }
	  if (three.ColorManagement.workingColorSpace !== three.LinearSRGBColorSpace && "COLOR_0" in attributes) {
	    console.warn(`THREE.GLTFLoader: Converting vertex colors from "srgb-linear" to "${three.ColorManagement.workingColorSpace}" not supported.`);
	  }
	  assignExtrasToUserData(geometry, primitiveDef);
	  computeBounds(geometry, primitiveDef, parser);
	  return Promise.all(pending).then(function() {
	    return primitiveDef.targets !== void 0 ? addMorphTargets(geometry, primitiveDef.targets, parser) : geometry;
	  });
	}

	// src/helpers/models.ts
	var DEFAULT_INFO = {
	  offset: { x: 0, y: 0, z: 0 },
	  rotation: { x: 0, y: 0, z: 0 },
	  scale: 1
	};
	function loadGLTF(url) {
	  return new Promise((resolve, reject) => {
	    new GLTFLoader().load(url, (gltf) => resolve({ scene: gltf.scene, animations: gltf.animations }), void 0, reject);
	  });
	}
	function finiteNumber(value, fallback) {
	  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
	}
	function normalizeInfo(value) {
	  const raw = value && typeof value === "object" ? value : {};
	  const offset = raw.offset && typeof raw.offset === "object" ? raw.offset : {};
	  const rotation = raw.rotation && typeof raw.rotation === "object" ? raw.rotation : {};
	  return {
	    ...raw,
	    offset: {
	      x: finiteNumber(offset.x, DEFAULT_INFO.offset.x),
	      y: finiteNumber(offset.y, DEFAULT_INFO.offset.y),
	      z: finiteNumber(offset.z, DEFAULT_INFO.offset.z)
	    },
	    rotation: {
	      x: finiteNumber(rotation.x, DEFAULT_INFO.rotation.x),
	      y: finiteNumber(rotation.y, DEFAULT_INFO.rotation.y),
	      z: finiteNumber(rotation.z, DEFAULT_INFO.rotation.z)
	    },
	    scale: finiteNumber(raw.scale, DEFAULT_INFO.scale)
	  };
	}
	async function loadInfo(url) {
	  try {
	    const response = await fetch(url);
	    if (!response.ok) return DEFAULT_INFO;
	    return normalizeInfo(await response.json());
	  } catch {
	    return DEFAULT_INFO;
	  }
	}
	function fixupMatrix(info) {
	  const rotation = new three.Euler(
	    three.MathUtils.degToRad(info.rotation.x),
	    three.MathUtils.degToRad(info.rotation.y),
	    three.MathUtils.degToRad(info.rotation.z)
	  );
	  return new three.Matrix4().compose(
	    new three.Vector3(info.offset.x, info.offset.y, info.offset.z),
	    new three.Quaternion().setFromEuler(rotation),
	    new three.Vector3(info.scale, info.scale, info.scale)
	  );
	}
	var cache = /* @__PURE__ */ new Map();
	function loadModel(path) {
	  let promise = cache.get(path);
	  if (!promise) {
	    promise = (async () => {
	      const [{ scene, animations }, info] = await Promise.all([
	        loadGLTF(`${path}/model.glb`),
	        loadInfo(`${path}/info.json`)
	      ]);
	      scene.updateMatrixWorld(true);
	      return { scene, animations, info, fixup: fixupMatrix(info) };
	    })().catch((reason) => {
	      cache.delete(path);
	      throw reason;
	    });
	    cache.set(path, promise);
	  }
	  return promise;
	}

	// src/shaders/terrain.vertex.ts
	var TERRAIN_VERTEX_SHADER = `
// highp to match terrain.fragment.ts (see its precision comment) - vWorldXZ /
// vLocal feed the river noise there, and varyings shouldn't lose precision on
// the vertex side of the interpolation.
precision highp float;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;

// (atlas width, atlas height, cell size, cell spacing)
uniform vec4 textureAtlasMeta;
uniform float hexSize; // tile circumradius, matches getHexCenter's "size" (world units)

// Beach slope towards water neighbors (see neighborsKindA/B below). waterLevel
// is where the water plane sits (see water.vertex.ts) - a coastal land tile's
// rim sinks to meet it instead of staying flat and only color-blending in 2D.
// beachWidth is the fraction of the tile's radius over which the slope happens.
uniform float waterLevel;
uniform float beachWidth;
uniform float sandAtlasIndex;

// Mountains (Land.mountain tiles - style.x == mountainAtlasIndex): the whole
// tile rises to a craggy peak. The height is a pure function of the tile-local
// position (mountainHeightAt below) so the lighting normal can be derived from
// it by finite differences - an analytic chain rule through the noise octaves
// would be far messier than two extra evaluations. mountainHeight is the peak
// height in world units.
uniform float mountainAtlasIndex;
uniform float mountainHeight;

// Rivers/lakes (tiles with the "river"/"lake" modifier - see helpers/rivers.ts
// and terrain.fragment.ts). The vertex stage only carves the bed: a smooth
// sink towards -riverDepth around a river's channel centerline / across a
// lake's body. Widths are fractions of the tile radius (hexSize); the sink
// reaches slightly past the painted waterline so the fragment stage's
// noise-bent banks always lie on sloped ground.
uniform float riverWidth;
uniform float riverBankWidth;
uniform float riverDepth;
uniform float lakeShoreWidth; // grass rim inset from a lake's shored edges

// World units one repeat of the war-fog texture spans. Fog UVs are computed
// from world position (not per-tile local UVs) so one copy of the texture
// flows continuously across every fogged tile - the image tiles seamlessly on
// each side, so neighboring repeats merge with no visible hex-shaped seams.
uniform float fogTextureSize;
uniform vec2 worldOffset; // repeated-world translation used by procedural patterns
uniform vec2 chunkOrigin; // logical origin; instance offsets stay chunk-local for float precision
uniform vec2 worldCenter; // camera target on the ground plane
uniform vec2 worldPeriod; // 0 on bounded axes, map span on wrapped axes

attribute vec3 position;
attribute vec2 uv;

attribute vec2 offset;       // world-space (x,z) offset of this tile instance
attribute vec3 style;        // x = atlas cell index, y = modifier bitmask (reserved for hill/etc.), z = edge-blend priority
attribute vec3 neighborsA;   // atlas cell index of SE/S/SW neighbor (-1 = none)
attribute vec3 neighborsB;   // atlas cell index of NW/N/NE neighbor (-1 = none)
attribute vec3 neighborsPriorityA; // edge-blend priority of SE/S/SW neighbor
attribute vec3 neighborsPriorityB; // edge-blend priority of NW/N/NE neighbor
attribute vec3 neighborsKindA; // SE/S/SW: -1 no tile, 0 non-water, 1 sea, 2 coastal
attribute vec3 neighborsKindB; // NW/N/NE
// -1 = no water; 0..63 = river (connected-edge bitmask, bit order SE,S,SW,NW,
// N,NE); 4096 + openMask*64 + channelMask = lake - see helpers/rivers.ts's
// waterEdgeValue() for the authoritative encoding.
attribute float riverEdges;
attribute float riverSeaMouthEdges;
attribute float riverLakeMouthEdges;
attribute float lakeNeighborEdges;
attribute float fogState; // 0 = unseen, 1 = explored (darkened), 2 = visible - see FogOfWar.ts

varying vec2 vUV;
varying vec2 vTexCoord;
varying float vBorder;
varying float vTerrain;
varying float vModifiers;
varying float vPriority;
varying vec3 vNeighborsA;
varying vec3 vNeighborsB;
varying vec3 vNeighborsPriorityA;
varying vec3 vNeighborsPriorityB;
varying vec3 vEdgeFactorsA; // SE, S, SW
varying vec3 vEdgeFactorsB; // NW, N, NE
varying vec3 vNormal;
varying float vBeachT; // 0 = normal land color, 1 = fully sand (see terrain.fragment.ts)
varying float vFogState;
varying vec2 vFogUV; // world-space fog texture coords, continuous across tiles
varying float vRiverEdges; // riverEdges passed through (flat per tile - every vertex of an instance carries the same value)
varying float vRiverSeaMouthEdges;
varying float vRiverLakeMouthEdges;
varying float vLakeNeighborEdges;
varying vec2 vLocal;       // tile-local (x,z), for the fragment stage's channel distance
varying vec2 vWorldXZ;     // world (x,z), for the fragment stage's world-space bank/ripple noise
varying vec3 vNeighborsKindA; // passed through for the fragment stage's per-pixel curved coastline
varying vec3 vNeighborsKindB;
varying float vElevation;  // normalized mountain elevation (0 flat .. ~1 peak), for snowcap tinting

const vec2 DIR_SE = vec2(0.8660254, 0.5);
const vec2 DIR_S  = vec2(0.0, 1.0);
const vec2 DIR_SW = vec2(-0.8660254, 0.5);
const vec2 DIR_NW = vec2(-0.8660254, -0.5);
const vec2 DIR_N  = vec2(0.0, -1.0);
const vec2 DIR_NE = vec2(0.8660254, -0.5);

//Move each logical tile to the nearest toroidal image around the camera. This
//draws the map exactly once instead of submitting 9 complete copies; crossing
//a seam only moves far/off-screen instances from one side to the other.
vec2 nearestWorldOffset(vec2 canonical) {
    vec2 wrapped = canonical;
    if (worldPeriod.x > 0.5) wrapped.x += floor((worldCenter.x - canonical.x) / worldPeriod.x + 0.5) * worldPeriod.x;
    if (worldPeriod.y > 0.5) wrapped.y += floor((worldCenter.y - canonical.y) / worldPeriod.y + 0.5) * worldPeriod.y;
    return wrapped;
}

vec2 cellIndexToUV(float idx) {
    float atlasWidth = textureAtlasMeta.x;
    float atlasHeight = textureAtlasMeta.y;
    float cellSize = textureAtlasMeta.z;
    float cols = atlasWidth / cellSize;
    float rows = atlasHeight / cellSize;
    float x = mod(idx, cols);
    float y = floor(idx / cols);

    return vec2(x / cols + uv.x / cols, 1.0 - (y / rows + (1.0 - uv.y) / rows));
}

// Same cheap value noise as the fragment stages - the mountain relief has to
// be world-space so adjacent mountain tiles' crags line up across the shared
// edge exactly like the river banks do.
float hash21(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
        mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
        u.y
    );
}

// Saddle corner taper - a ridge saddle's height at an edge CORNER must agree
// across all three tiles meeting there, or the surfaces crack open (visible
// as background-colored triangular holes). If the corner's third tile is a
// mountain too, all three raise it to the same saddle height (no taper); if
// it isn't, the saddle fades to 0 towards that corner - the flat third tile
// stays at 0 there, and both mountain tiles taper symmetrically (the
// adjacent-edge factor measures the same corner distance from either side).
float saddleTaper(float adjIsMountain, float adjFactor) {
    return adjIsMountain > 0.5 ? 1.0 : 1.0 - smoothstep(0.6, 1.0, adjFactor);
}

// Normalized mountain height (0..~1.2) at a tile-local point p. Three parts:
//  - a central peak: (1 - rim)^1.2, 1 at the tile center, 0 on the rim;
//  - ridge saddles: towards every edge whose neighbor is also a mountain, the
//    height only falls to 0.55 at the shared edge instead of 0. Both tiles
//    compute the same 0.55 * edgeFactor there (each side's factor is 1.0 on
//    the edge), so adjacent mountains connect into a continuous ridgeline;
//  - two octaves of world-space noise multiplying the whole profile into
//    irregular crags (world-space: continuous across the shared edges too).
// Kept a pure function of p so main() can finite-difference it for normals.
float mountainHeightAt(vec2 p, vec2 tileOffset) {
    float apothem = hexSize * 0.8660254;
    vec3 efA = vec3(dot(p, DIR_SE), dot(p, DIR_S), dot(p, DIR_SW)) / apothem;
    vec3 efB = vec3(dot(p, DIR_NW), dot(p, DIR_N), dot(p, DIR_NE)) / apothem;
    float rim = max(max(max(efA.x, efA.y), max(efA.z, efB.x)), max(efB.y, efB.z));
    float h = pow(clamp(1.0 - rim, 0.0, 1.0), 1.2);

    float mSE = abs(neighborsA.x - mountainAtlasIndex) < 0.5 ? 1.0 : 0.0;
    float mS  = abs(neighborsA.y - mountainAtlasIndex) < 0.5 ? 1.0 : 0.0;
    float mSW = abs(neighborsA.z - mountainAtlasIndex) < 0.5 ? 1.0 : 0.0;
    float mNW = abs(neighborsB.x - mountainAtlasIndex) < 0.5 ? 1.0 : 0.0;
    float mN  = abs(neighborsB.y - mountainAtlasIndex) < 0.5 ? 1.0 : 0.0;
    float mNE = abs(neighborsB.z - mountainAtlasIndex) < 0.5 ? 1.0 : 0.0;

    // ring adjacency: SE-S-SW-NW-N-NE-SE (see the DIR_* constants' angles)
    float ridge = 0.0;
    if (mSE > 0.5) ridge = max(ridge, efA.x * saddleTaper(mNE, efB.z) * saddleTaper(mS,  efA.y));
    if (mS  > 0.5) ridge = max(ridge, efA.y * saddleTaper(mSE, efA.x) * saddleTaper(mSW, efA.z));
    if (mSW > 0.5) ridge = max(ridge, efA.z * saddleTaper(mS,  efA.y) * saddleTaper(mNW, efB.x));
    if (mNW > 0.5) ridge = max(ridge, efB.x * saddleTaper(mSW, efA.z) * saddleTaper(mN,  efB.y));
    if (mN  > 0.5) ridge = max(ridge, efB.y * saddleTaper(mNW, efB.x) * saddleTaper(mNE, efB.z));
    if (mNE > 0.5) ridge = max(ridge, efB.z * saddleTaper(mN,  efB.y) * saddleTaper(mSE, efA.x));
    h = max(h, clamp(ridge, 0.0, 1.0) * 0.55);

    // Shore flattening - a coastal mountain still gets its beach. Done here
    // per water-adjacent direction (not by multiplying with the vertex's own
    // beachT in main()) so it stays a symmetric function of the corner
    // distance: a mountain NEIGHBOR at the shared corner of a water tile
    // computes the same falloff from its own side, keeping the saddle heights
    // crack-free (same reasoning as saddleTaper above - the water tile at
    // such a corner is a direct neighbor of both mountain tiles).
    if (neighborsKindA.x >= 0.5) h *= 1.0 - smoothstep(0.5, 0.95, efA.x);
    if (neighborsKindA.y >= 0.5) h *= 1.0 - smoothstep(0.5, 0.95, efA.y);
    if (neighborsKindA.z >= 0.5) h *= 1.0 - smoothstep(0.5, 0.95, efA.z);
    if (neighborsKindB.x >= 0.5) h *= 1.0 - smoothstep(0.5, 0.95, efB.x);
    if (neighborsKindB.y >= 0.5) h *= 1.0 - smoothstep(0.5, 0.95, efB.y);
    if (neighborsKindB.z >= 0.5) h *= 1.0 - smoothstep(0.5, 0.95, efB.z);

    vec2 w = tileOffset + p + worldOffset;
    float n = valueNoise(w * (1.6 / hexSize));
    n = 0.65 * n + 0.35 * valueNoise(w * (4.0 / hexSize));
    return h * (0.72 + 1.1 * (n - 0.5));
}

// Tracks the strongest "closeness to a water-adjacent edge" (see
// vEdgeFactorsA/B) together with the direction it came from, so both the
// height (sink towards waterLevel) and its slope (for lighting normals) can be
// derived from the same single dominant edge.
vec3 strongestWaterEdge(vec3 best, float kind, float factor, vec2 dir) {
    if (kind >= 1.0 && factor > best.x) return vec3(factor, dir);
    return best;
}

// Distance from a tile-local point to the segment running from the hex center
// to the midpoint of the edge in direction dir (at the apothem) - one straight
// piece of the river channel's centerline.
float riverSegDist(vec2 p, vec2 dir, float apothem) {
    float t = clamp(dot(p, dir), 0.0, apothem);
    return length(p - dir * t);
}

// Distance to the river channel centerline: the min over every *connected*
// edge's center-to-edge-midpoint segment (bit i of mask, order SE,S,SW,NW,N,NE
// - decoded with mod/floor, GLSL ES 1.0 has no bitwise ops). A mask of 0 (a
// river tile with no connections) falls back to distance-to-center: a pond.
// Mirrors riverChannelDistance() in helpers/rivers.ts - keep the two in sync.
float riverChannelDist(vec2 p, float mask, float apothem) {
    float d = length(p);
    if (mod(floor(mask /  1.0), 2.0) > 0.5) d = min(d, riverSegDist(p, DIR_SE, apothem));
    if (mod(floor(mask /  2.0), 2.0) > 0.5) d = min(d, riverSegDist(p, DIR_S,  apothem));
    if (mod(floor(mask /  4.0), 2.0) > 0.5) d = min(d, riverSegDist(p, DIR_SW, apothem));
    if (mod(floor(mask /  8.0), 2.0) > 0.5) d = min(d, riverSegDist(p, DIR_NW, apothem));
    if (mod(floor(mask / 16.0), 2.0) > 0.5) d = min(d, riverSegDist(p, DIR_N,  apothem));
    if (mod(floor(mask / 32.0), 2.0) > 0.5) d = min(d, riverSegDist(p, DIR_NE, apothem));
    return d;
}

vec2 riverMouthSeg(vec2 p, vec2 dir, float apothem) {
    float t = clamp(dot(p, dir), 0.0, apothem);
    return vec2(length(p - dir * t), t / apothem);
}

float riverMouthBedT(vec2 p, float mask, float apothem) {
    float bedT = 0.0;
    for (int i = 0; i < 6; i++) {
        float bit = pow(2.0, float(i));
        if (mod(floor(mask / bit), 2.0) < 0.5) continue;

        vec2 dir = DIR_SE;
        if (i == 1) dir = DIR_S;
        else if (i == 2) dir = DIR_SW;
        else if (i == 3) dir = DIR_NW;
        else if (i == 4) dir = DIR_N;
        else if (i == 5) dir = DIR_NE;

        vec2 seg = riverMouthSeg(p, dir, apothem);
        // 0.4 half-width = 0.8 full outlet width relative to one hex side.
        float mouthWidth = mix(riverWidth, 0.4, smoothstep(0.0, 1.0, seg.y));
        float d = seg.x / hexSize;
        bedT = max(bedT, 1.0 - smoothstep(mouthWidth * 0.5, mouthWidth + riverBankWidth, d));
    }
    return bedT;
}

float edgeFieldFromMask(float mask, vec3 efA, vec3 efB) {
    float f = 0.0;
    if (mod(floor(mask /  1.0), 2.0) > 0.5) f = max(f, efA.x);
    if (mod(floor(mask /  2.0), 2.0) > 0.5) f = max(f, efA.y);
    if (mod(floor(mask /  4.0), 2.0) > 0.5) f = max(f, efA.z);
    if (mod(floor(mask /  8.0), 2.0) > 0.5) f = max(f, efB.x);
    if (mod(floor(mask / 16.0), 2.0) > 0.5) f = max(f, efB.y);
    if (mod(floor(mask / 32.0), 2.0) > 0.5) f = max(f, efB.z);
    return f;
}

// Lake shore factor: how far this point sits towards the nearest *shored* edge
// (one NOT in openMask) - 1.0 exactly on such an edge, falling off towards the
// far side. 0 on a fully-open tile (lake interior: all water). Mirrors
// isInTileWater() in helpers/rivers.ts - keep the two in sync.
float lakeShore(float openMask, vec3 efA, vec3 efB) {
    float s = 0.0;
    if (mod(floor(openMask /  1.0), 2.0) < 0.5) s = max(s, efA.x);
    if (mod(floor(openMask /  2.0), 2.0) < 0.5) s = max(s, efA.y);
    if (mod(floor(openMask /  4.0), 2.0) < 0.5) s = max(s, efA.z);
    if (mod(floor(openMask /  8.0), 2.0) < 0.5) s = max(s, efB.x);
    if (mod(floor(openMask / 16.0), 2.0) < 0.5) s = max(s, efB.y);
    if (mod(floor(openMask / 32.0), 2.0) < 0.5) s = max(s, efB.z);
    return s;
}

void main() {
    float apothem = hexSize * 0.8660254;
    vec2 local = position.xz;
    vec2 tileOffset = nearestWorldOffset(offset);
    vec2 logicalTileOffset = tileOffset + chunkOrigin;

    vEdgeFactorsA = vec3(dot(local, DIR_SE), dot(local, DIR_S), dot(local, DIR_SW)) / apothem;
    vEdgeFactorsB = vec3(dot(local, DIR_NW), dot(local, DIR_N), dot(local, DIR_NE)) / apothem;

    vec3 best = vec3(0.0); // (edgeFactor, dir.x, dir.y)
    best = strongestWaterEdge(best, neighborsKindA.x, vEdgeFactorsA.x, DIR_SE);
    best = strongestWaterEdge(best, neighborsKindA.y, vEdgeFactorsA.y, DIR_S);
    best = strongestWaterEdge(best, neighborsKindA.z, vEdgeFactorsA.z, DIR_SW);
    best = strongestWaterEdge(best, neighborsKindB.x, vEdgeFactorsB.x, DIR_NW);
    best = strongestWaterEdge(best, neighborsKindB.y, vEdgeFactorsB.y, DIR_N);
    best = strongestWaterEdge(best, neighborsKindB.z, vEdgeFactorsB.z, DIR_NE);

    // beachWidth is the *total* transition width shared with the water layer's
    // own mirrored slope (see water.vertex.ts) - each side only covers half of
    // it, so the two meet in the middle of the shared edge instead of the
    // whole transition being crammed into the land tile alone.
    float waterEdge = clamp(best.x, 0.0, 1.0);
    float e0 = 1.0 - clamp(beachWidth, 0.001, 1.0) * 0.5;
    float beachT = smoothstep(e0, 1.0, waterEdge);

    // Unseen (fog of war): keep the tile perfectly flat - a coastal land
    // tile's sunken beach rim would betray that water sits next door, which
    // the fog is supposed to hide.
    float fogVisible = fogState < 0.5 ? 0.0 : 1.0;

    // Land only sinks *half* the way down to waterLevel - the water layer
    // rises to meet it the other half (see water.vertex.ts's riseY), so the
    // two tiles' fall is evenly split instead of the whole drop happening on
    // the land side alone. The extra *1.2 nudges land slightly past that
    // midpoint (rather than exactly onto it) so the two meshes' edges don't
    // end up perfectly coincident and z-fight (flickery dark patches).
    float sinkY = beachT * (waterLevel * 0.5) * 1.2 * fogVisible;

    // River/lake bed: sink smoothly towards -riverDepth around a river's
    // channel centerline / across a lake's body. Undistorted distances only -
    // the fragment stage's noise-bent waterline stays within the carved area,
    // and per-vertex noise would be too coarse at this subdivision level
    // anyway. min() with the beach sink (both are <= 0) so a mouth next to
    // the sea takes the deeper of the two carves instead of stacking them.
    float riverSink = 0.0;
    if (riverEdges >= 0.0) {
        float bedT = 0.0;
        if (riverEdges >= 2048.0) {
            float openMask = floor((riverEdges - 4096.0) / 64.0);
            float channelMask = riverEdges - 4096.0 - openMask * 64.0;
            bedT = 1.0;
            if (channelMask > 0.5) {
                bedT = max(bedT, riverMouthBedT(local, channelMask, apothem));
            }
        } else {
            float dRiver = riverChannelDist(local, riverEdges, apothem) / hexSize;
            bedT = 1.0 - smoothstep(riverWidth * 0.5, riverWidth + riverBankWidth, dRiver);
            bedT = max(bedT, riverMouthBedT(local, floor(riverSeaMouthEdges + 0.5), apothem));
            bedT = max(bedT, riverMouthBedT(local, floor(riverLakeMouthEdges + 0.5), apothem));
        }
        riverSink = -riverDepth * bedT * fogVisible;
    }
    float lakeEdge = edgeFieldFromMask(floor(lakeNeighborEdges + 0.5), vEdgeFactorsA, vEdgeFactorsB);
    if (lakeEdge > 0.0) {
        float s0Lake = 1.0 - clamp(lakeShoreWidth, 0.001, 1.0);
        float lakeSinkT = smoothstep(s0Lake, 1.0, lakeEdge);
        riverSink = min(riverSink, -riverDepth * lakeSinkT * fogVisible);
    }
    sinkY = min(sinkY, riverSink);

    // Mountain elevation - flattened towards water edges inside
    // mountainHeightAt itself (so a coastal mountain still gets a shore),
    // gated to 0 on river/lake tiles (the carved bed wins - rivers stay
    // exactly as they were; don't combine the river/lake modifiers with
    // mountain tiles) and under unseen fog (same reasoning as the beach
    // sink above: relief betrays what's there).
    float raiseY = 0.0;
    vec2 mountainSlope = vec2(0.0);
    float elevation = 0.0;
    if (abs(style.x - mountainAtlasIndex) < 0.5) {
        float gate = fogVisible * (riverEdges >= 0.0 ? 0.0 : 1.0);
        if (gate > 0.0) {
            float eps = hexSize * 0.08;
            float h0 = mountainHeightAt(local, logicalTileOffset);
            float hx = mountainHeightAt(local + vec2(eps, 0.0), logicalTileOffset);
            float hz = mountainHeightAt(local + vec2(0.0, eps), logicalTileOffset);
            elevation = h0 * gate;
            raiseY = elevation * mountainHeight;
            mountainSlope = vec2(hx - h0, hz - h0) / eps * mountainHeight * gate;
        }
    }

    vec3 pos = vec3(tileOffset.x + position.x, position.y + sinkY + raiseY, tileOffset.y + position.z);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);

    // analytic slope of sinkY w.r.t. local (x,z), via the chain rule through
    // smoothstep, for lighting - see water.vertex.ts for the same idea applied
    // to waves. Only the single dominant edge direction is considered, which is
    // exact away from corners and a reasonable approximation right at them.
    // The mountain raise's finite-difference slope just adds on top.
    float xN = clamp((waterEdge - e0) / (1.0 - e0), 0.0, 1.0);
    float dSmooth = waterEdge > 0.0 ? 6.0 * xN * (1.0 - xN) / (1.0 - e0) : 0.0;
    vec2 slope = (waterLevel * 0.5) * 1.2 * dSmooth * (best.yz / apothem) * fogVisible + mountainSlope;
    vNormal = normalize(normalMatrix * normalize(vec3(-slope.x, 1.0, -slope.y)));

    // Rim distance for the grid line - NOT radial distance from center
    // (length(local)/hexSize): that only reaches 1.0 exactly at the 6 corners
    // and dips to ~0.866 (the apothem) at an edge's midpoint, since a hexagon's
    // boundary is 6 straight chords, not a circle. That went unnoticed while
    // this geometry had 0 subdivisions (both rim vertices of every wedge sat
    // exactly at a corner, so linear interpolation between two 1.0s stayed
    // 1.0 the whole edge) - once subdivided, the new mid-edge vertices' lower
    // radial value made the grid line threshold fail there, fragmenting a
    // continuous hex outline into isolated blobs at each corner. The edge
    // factors above are already exactly 1.0 along an entire straight edge
    // (not just at its endpoints), so reusing their max is the correct metric.
    float rimFactor = max(max(max(vEdgeFactorsA.x, vEdgeFactorsA.y), max(vEdgeFactorsA.z, vEdgeFactorsB.x)), max(vEdgeFactorsB.y, vEdgeFactorsB.z));

    vUV = uv;
    vBorder = clamp(rimFactor, 0.0, 1.0);
    vTerrain = style.x;
    vModifiers = style.y;
    vPriority = style.z;
    vBeachT = beachT;
    vTexCoord = cellIndexToUV(style.x);
    vNeighborsA = neighborsA;
    vNeighborsB = neighborsB;
    vNeighborsPriorityA = neighborsPriorityA;
    vNeighborsPriorityB = neighborsPriorityB;
    vNeighborsKindA = neighborsKindA;
    vNeighborsKindB = neighborsKindB;
    vElevation = elevation;
    vFogState = fogState;
    vRiverEdges = riverEdges;
    vRiverSeaMouthEdges = riverSeaMouthEdges;
    vRiverLakeMouthEdges = riverLakeMouthEdges;
    vLakeNeighborEdges = lakeNeighborEdges;
    vLocal = local;
    vec2 logicalWorldXZ = pos.xz + chunkOrigin + worldOffset;
    vWorldXZ = logicalWorldXZ;
    // Axes swapped/negated (not a plain pos.xz mapping) so the image reads
    // upright from this map's camera: the camera's azimuth is locked to ~90deg
    // (see HexMap's setupControls), which puts screen-right along world -Z and
    // screen-up along world -X - mapping u to -z and v to -x orients the
    // texture to the screen and keeps it un-mirrored when viewed from above.
    // Negation is free for a seamlessly wrapping texture (just a phase shift).
    vFogUV = vec2(-logicalWorldXZ.y, -logicalWorldXZ.x) / fogTextureSize;
}
`;

	// src/shaders/terrain.fragment.ts
	var TERRAIN_FRAGMENT_SHADER = `
// highp, not mediump: the river noise hash (hash21's fract(sin(x) * 43758...))
// is fed world-space coordinates in the hundreds/thousands - at fp16 precision
// it collapses into structured streak garbage. The water shader already runs
// highp for the same reason (its foam uses the same hash).
precision highp float;

uniform sampler2D map;
uniform vec4 textureAtlasMeta;
uniform float sandAtlasIndex;
uniform float landBlendWidth; // 0..1 fraction of tile radius, land-to-land diffusion size

// Curved coastline: the visual waterline is bent by *static* world-space value
// noise (same recipe as the river banks below) so bays and headlands cut
// across the straight hex edges. Where the bent waterline pushes inland, this
// shader paints animated sea water on the land tile - the water layer paints
// beach sand where it recedes seaward (see water.fragment.ts), both sampling
// the same world-space noise so the waterline stays continuous across the two
// meshes' shared edge. beachWidth/waterCornerRounding mirror the values the
// vertex/water stages use for the same signals.
uniform float beachWidth;
uniform float waterCornerRounding;
uniform float coastCurvature;   // 0..1, how strongly noise bends the waterline
uniform vec3 seaColorShallow;   // painted coast water colors - the SAME Color
uniform vec3 seaColorDeep;      // instances as the water layer's
                                // waterColorShallow/Deep (see TerrainMesh), so
                                // live color changes update both together

// Organic land-type transitions: the blendEdge() band is bent by the same
// world-space noise and its strength modulated by a finer octave, so borders
// read as patchy growth instead of straight strips parallel to hex edges.
uniform float landBlendCurvature; // 0..1

uniform sampler2D fogMap;        // war-fog.jpg, tiled per-tile via vUV (not atlas-indexed)
uniform float fogDarkenFactor;   // color multiplier for Explored (fogState 1) tiles

uniform float showGrid;
uniform vec3 gridColor;
uniform float gridWidth;
uniform float gridOpacity;

uniform vec3 lightDir;

// Rivers/lakes, drawn over the atlas texture on tiles with the "river"/"lake"
// modifier (vRiverEdges >= 0, see helpers/rivers.ts for the encoding). The
// waterline - a river's channel-centerline distance, a lake's shore factor -
// is bent by *static* world-space value noise: world-space makes the curved
// banks continue seamlessly across tile borders, static keeps the banks
// themselves still while the ripple noise (scrolled by uTime) animates only
// the water inside them.
uniform float hexSize;          // tile circumradius (shared via commonUniforms)
uniform float uTime;            // seconds, drives the ripple animation
uniform float foamEnabled;      // coastal wave foam on shader-painted coastal water
uniform vec3 foamColor;
uniform float foamCount;
uniform float foamSpeed;
uniform float foamWidth;
uniform float foamRange;
uniform float foamDistortion;
uniform float foamOpacity;
uniform float riverWidth;       // channel waterline half-width, fraction of tile radius
uniform float riverBankWidth;   // bank strip width beyond the waterline, same units
uniform float riverCurvature;   // 0..1, how strongly noise bends the banks
uniform float riverFlowSpeed;   // ripple scroll speed multiplier
uniform float lakeShoreWidth;   // lake grass rim inset from shored edges, same units
uniform vec3 riverColorShallow; // water color at the banks
uniform vec3 riverColorDeep;    // water color over the channel centerline / lake body
uniform vec3 riverBankColor;    // vegetation strip hugging the waterline

varying vec2 vUV;
varying vec2 vTexCoord;
varying float vBorder;
varying float vTerrain;
varying float vModifiers;
varying float vPriority;
varying vec3 vNeighborsA;
varying vec3 vNeighborsB;
varying vec3 vNeighborsPriorityA;
varying vec3 vNeighborsPriorityB;
varying vec3 vEdgeFactorsA;
varying vec3 vEdgeFactorsB;
varying vec3 vNormal;
varying float vBeachT;
varying float vFogState;
varying vec2 vFogUV;
varying float vRiverEdges;
varying float vRiverSeaMouthEdges;
varying float vRiverLakeMouthEdges;
varying float vLakeNeighborEdges;
varying vec2 vLocal;
varying vec2 vWorldXZ;
varying vec3 vNeighborsKindA; // -1 no tile, 0 land, 1 sea, 2 coastal (SE,S,SW)
varying vec3 vNeighborsKindB; // (NW,N,NE)
varying float vElevation;     // normalized mountain elevation, 0 on flat tiles

const vec3 lightAmbient = vec3(0.55, 0.55, 0.55);
const vec3 lightDiffuse = vec3(0.55, 0.55, 0.55);

const vec2 DIR_SE = vec2(0.8660254, 0.5);
const vec2 DIR_S  = vec2(0.0, 1.0);
const vec2 DIR_SW = vec2(-0.8660254, 0.5);
const vec2 DIR_NW = vec2(-0.8660254, -0.5);
const vec2 DIR_N  = vec2(0.0, -1.0);
const vec2 DIR_NE = vec2(0.8660254, -0.5);

// Cheap value noise, same recipe as water.fragment.ts's - keeps the land
// layer texture-free for rivers too (no extra noise texture to load).
float hash21(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
        mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
        u.y
    );
}

// Same channel-centerline distance as terrain.vertex.ts's riverChannelDist()
// (and helpers/rivers.ts's CPU mirror) - see the comments there. Duplicated
// because vertex and fragment shaders are separate string constants.
float riverSegDist(vec2 p, vec2 dir, float apothem) {
    float t = clamp(dot(p, dir), 0.0, apothem);
    return length(p - dir * t);
}

float riverChannelDist(vec2 p, float mask, float apothem) {
    float d = length(p);
    if (mod(floor(mask /  1.0), 2.0) > 0.5) d = min(d, riverSegDist(p, DIR_SE, apothem));
    if (mod(floor(mask /  2.0), 2.0) > 0.5) d = min(d, riverSegDist(p, DIR_S,  apothem));
    if (mod(floor(mask /  4.0), 2.0) > 0.5) d = min(d, riverSegDist(p, DIR_SW, apothem));
    if (mod(floor(mask /  8.0), 2.0) > 0.5) d = min(d, riverSegDist(p, DIR_NW, apothem));
    if (mod(floor(mask / 16.0), 2.0) > 0.5) d = min(d, riverSegDist(p, DIR_N,  apothem));
    if (mod(floor(mask / 32.0), 2.0) > 0.5) d = min(d, riverSegDist(p, DIR_NE, apothem));
    return d;
}

vec2 riverMouthSeg(vec2 p, vec2 dir, float apothem) {
    float t = clamp(dot(p, dir), 0.0, apothem);
    return vec2(length(p - dir * t), t / apothem);
}

// River mouths widen from the tile center to an outlet whose FULL width is
// 80% of one hex side. riverWidth/mouthWidth are half-widths, so the maximum
// half-width is 0.4 of hexSize.
// x = water mask strength, y = bank mask strength, z = deep-center strength,
// w = edge progress.
vec4 riverMouthShape(vec2 p, float mask, float apothem, float bendOff) {
    vec4 outShape = vec4(0.0);
    for (int i = 0; i < 6; i++) {
        float bit = pow(2.0, float(i));
        if (mod(floor(mask / bit), 2.0) < 0.5) continue;

        vec2 dir = DIR_SE;
        if (i == 1) dir = DIR_S;
        else if (i == 2) dir = DIR_SW;
        else if (i == 3) dir = DIR_NW;
        else if (i == 4) dir = DIR_N;
        else if (i == 5) dir = DIR_NE;

        vec2 seg = riverMouthSeg(p, dir, apothem);
        float progress = smoothstep(0.0, 1.0, seg.y);
        float mouthWidth = mix(riverWidth, 0.4, progress);
        float d = seg.x / hexSize + bendOff;

        float water = 1.0 - smoothstep(mouthWidth - 0.04, mouthWidth, d);
        float bank = 1.0 - smoothstep(mouthWidth + riverBankWidth * 0.35, mouthWidth + riverBankWidth, d);
        float depth = 1.0 - smoothstep(0.0, mouthWidth, d);
        outShape.x = max(outShape.x, water);
        outShape.y = max(outShape.y, bank);
        outShape.z = max(outShape.z, depth);
        outShape.w = max(outShape.w, progress * water);
    }
    return outShape;
}

// Lake shore factor - see terrain.vertex.ts's identical helper (and its CPU
// mirror in helpers/rivers.ts): closeness to the nearest *shored* edge, 1.0
// exactly on it, 0 on a fully-open lake-interior tile.
float lakeShore(float openMask, vec3 efA, vec3 efB) {
    float s = 0.0;
    if (mod(floor(openMask /  1.0), 2.0) < 0.5) s = max(s, efA.x);
    if (mod(floor(openMask /  2.0), 2.0) < 0.5) s = max(s, efA.y);
    if (mod(floor(openMask /  4.0), 2.0) < 0.5) s = max(s, efA.z);
    if (mod(floor(openMask /  8.0), 2.0) < 0.5) s = max(s, efB.x);
    if (mod(floor(openMask / 16.0), 2.0) < 0.5) s = max(s, efB.y);
    if (mod(floor(openMask / 32.0), 2.0) < 0.5) s = max(s, efB.z);
    return s;
}

vec2 cellIndexToUV(float idx) {
    float atlasWidth = textureAtlasMeta.x;
    float atlasHeight = textureAtlasMeta.y;
    float cellSize = textureAtlasMeta.z;
    // subtract a small epsilon to avoid edge flickering when sampling the last column/row
    float cols = atlasWidth / cellSize - 1e-6;
    float rows = atlasHeight / cellSize;
    float x = mod(idx, cols);
    float y = floor(idx / cols);

    return vec2(x / cols + vUV.x / cols, 1.0 - (y / rows + (1.0 - vUV.y) / rows));
}

// Blends towards a neighboring tile's atlas texture near the edge actually
// shared with it. factor (from vEdgeFactorsA/B, see terrain.vertex.ts) is an
// analytic "closeness to that specific edge" value: 1.0 exactly on the shared
// edge, fading to 0 towards the opposite side of the hex. landBlendWidth
// compresses that fade into just the outer fraction of the tile (0..1) instead
// of spanning the whole distance to the far side, so the transition band's
// size is controllable instead of always being "the whole tile".
//
// Only blends towards a STRICTLY higher-priority neighbor (neighborPriority >
// vPriority - see enums.ts LandPriority). Without this, a shared edge blended
// both ways at once (e.g. land fading into water AND water fading into land),
// which reads as a fuzzy halo on both sides of every border instead of a single
// one-directional transition.
//
// bend (world-space noise, shared by all 6 calls) shifts the band's position
// so the border meanders instead of running parallel to the hex edge; patch
// modulates its strength so the mixed-in texture reads as patchy growth.
vec4 blendEdge(vec4 inputColor, float neighborTerrain, float neighborPriority, float factor, float bend, float patch) {
    if (neighborTerrain < 0.0 || neighborTerrain == vTerrain) return inputColor;
    if (neighborPriority <= vPriority) return inputColor;

    vec2 otherUV = cellIndexToUV(neighborTerrain);
    vec4 neighborColor = texture2D(map, otherUV);

    float e0 = 1.0 - clamp(landBlendWidth, 0.001, 1.0);
    float t = smoothstep(e0, 1.0, factor + bend) * patch;
    return mix(inputColor, neighborColor, t);
}

// Same corner treatment as water.vertex.ts's roundedCorner() - see the
// comment there. Applied per-pixel here so the land side's coastal-distance
// field has the same rounded shape as the water layer's own.
float roundedCorner(float isWaterA, float isWaterB, float dA, float dB) {
    if (isWaterA < 0.5 || isWaterB < 0.5) return -1.0;
    float sharp = max(dA, dB);
    float rounded = length(vec2(dA, dB));
    return mix(sharp, rounded, clamp(waterCornerRounding, 0.0, 1.0));
}

float lakeNeighborField(float mask) {
    float wSE = mod(floor(mask /  1.0), 2.0) > 0.5 ? 1.0 : 0.0;
    float wS  = mod(floor(mask /  2.0), 2.0) > 0.5 ? 1.0 : 0.0;
    float wSW = mod(floor(mask /  4.0), 2.0) > 0.5 ? 1.0 : 0.0;
    float wNW = mod(floor(mask /  8.0), 2.0) > 0.5 ? 1.0 : 0.0;
    float wN  = mod(floor(mask / 16.0), 2.0) > 0.5 ? 1.0 : 0.0;
    float wNE = mod(floor(mask / 32.0), 2.0) > 0.5 ? 1.0 : 0.0;

    float f = 0.0;
    f = max(f, wSE > 0.5 ? vEdgeFactorsA.x : 0.0);
    f = max(f, wS  > 0.5 ? vEdgeFactorsA.y : 0.0);
    f = max(f, wSW > 0.5 ? vEdgeFactorsA.z : 0.0);
    f = max(f, wNW > 0.5 ? vEdgeFactorsB.x : 0.0);
    f = max(f, wN  > 0.5 ? vEdgeFactorsB.y : 0.0);
    f = max(f, wNE > 0.5 ? vEdgeFactorsB.z : 0.0);
    if (f <= 0.0) return 0.0;

    float dSE = max(vEdgeFactorsA.x, 0.0);
    float dS  = max(vEdgeFactorsA.y, 0.0);
    float dSW = max(vEdgeFactorsA.z, 0.0);
    float dNW = max(vEdgeFactorsB.x, 0.0);
    float dN  = max(vEdgeFactorsB.y, 0.0);
    float dNE = max(vEdgeFactorsB.z, 0.0);

    f = max(f, roundedCorner(wSE, wS,  dSE, dS));
    f = max(f, roundedCorner(wS,  wSW, dS,  dSW));
    f = max(f, roundedCorner(wSW, wNW, dSW, dNW));
    f = max(f, roundedCorner(wNW, wN,  dNW, dN));
    f = max(f, roundedCorner(wN,  wNE, dN,  dNE));
    f = max(f, roundedCorner(wNE, wSE, dNE, dSE));
    return f;
}

// Per-pixel "closeness to the coastline" field: max over the water-neighbor
// edges' factors, with shared corners between two water edges rounded off.
// Returns vec2(field, kind): field is 1.0 exactly on the mesh edge shared
// with a water tile, 0 on a tile with no water neighbor at all (never grows
// a coast); kind is the dominant water neighbor's kind (1 sea, 2 coastal),
// so the painted water can start from the same deep/shallow base color that
// actual neighbor tile renders - without it, an island in deep sea got a
// visibly lighter hex-shaped ring (shallow-based paint against deep water).
// Kinds arrive as varyings and must be re-rounded (floor(v + 0.5)): varying
// interpolation is not exact even for per-instance-constant values, and the
// >= 0.5 water test would otherwise flip per pixel (see vRiverEdges below).
vec2 coastField() {
    vec3 kA = floor(vNeighborsKindA + 0.5);
    vec3 kB = floor(vNeighborsKindB + 0.5);
    float wSE = kA.x >= 0.5 ? 1.0 : 0.0;
    float wS  = kA.y >= 0.5 ? 1.0 : 0.0;
    float wSW = kA.z >= 0.5 ? 1.0 : 0.0;
    float wNW = kB.x >= 0.5 ? 1.0 : 0.0;
    float wN  = kB.y >= 0.5 ? 1.0 : 0.0;
    float wNE = kB.z >= 0.5 ? 1.0 : 0.0;

    // straight per-edge max, tracking which edge's kind won
    float f = 0.0;
    float kind = 2.0;
    if (wSE > 0.5 && vEdgeFactorsA.x > f) { f = vEdgeFactorsA.x; kind = kA.x; }
    if (wS  > 0.5 && vEdgeFactorsA.y > f) { f = vEdgeFactorsA.y; kind = kA.y; }
    if (wSW > 0.5 && vEdgeFactorsA.z > f) { f = vEdgeFactorsA.z; kind = kA.z; }
    if (wNW > 0.5 && vEdgeFactorsB.x > f) { f = vEdgeFactorsB.x; kind = kB.x; }
    if (wN  > 0.5 && vEdgeFactorsB.y > f) { f = vEdgeFactorsB.y; kind = kB.y; }
    if (wNE > 0.5 && vEdgeFactorsB.z > f) { f = vEdgeFactorsB.z; kind = kB.z; }
    if (f <= 0.0) return vec2(0.0, kind);

    float dSE = max(vEdgeFactorsA.x, 0.0);
    float dS  = max(vEdgeFactorsA.y, 0.0);
    float dSW = max(vEdgeFactorsA.z, 0.0);
    float dNW = max(vEdgeFactorsB.x, 0.0);
    float dN  = max(vEdgeFactorsB.y, 0.0);
    float dNE = max(vEdgeFactorsB.z, 0.0);

    // rounded corners only strengthen the field; the winning edge's kind from
    // above is kept (a corner blends two edges anyway - the stronger one's
    // kind is the reasonable pick).
    f = max(f, roundedCorner(wSE, wS,  dSE, dS));
    f = max(f, roundedCorner(wS,  wSW, dS,  dSW));
    f = max(f, roundedCorner(wSW, wNW, dSW, dNW));
    f = max(f, roundedCorner(wNW, wN,  dNW, dN));
    f = max(f, roundedCorner(wN,  wNE, dN,  dNE));
    f = max(f, roundedCorner(wNE, wSE, dNE, dSE));
    return vec2(f, kind);
}

// Same travelling coastal foam bands as water.fragment.ts, used here for the
// part of the sea that the land shader paints when a curved coastline pushes
// water inland onto a land tile.
float coastalFoam(vec2 worldXZ, float t, float shoreDist) {
    float n = valueNoise(worldXZ * (3.0 / hexSize) + vec2(0.0, t * 0.2));
    n = 0.5 * n + 0.5 * valueNoise(worldXZ * (7.0 / hexSize) - vec2(t * 0.15, 0.0));
    float distort = (n - 0.5) * foamDistortion;

    float phase = fract(shoreDist * foamCount + t * foamSpeed + distort * 2.0);
    float halfW = clamp(foamWidth, 0.02, 1.0) * 0.5;
    float band = smoothstep(halfW, halfW * 0.35, abs(phase - 0.5));
    float fade = 1.0 - smoothstep(foamRange * 0.35, max(foamRange, 0.001), shoreDist);
    band *= fade * (0.55 + 0.45 * n);

    float edge = smoothstep(0.12, 0.0, shoreDist + distort * 0.35);

    return clamp(edge + band, 0.0, 1.0) * foamOpacity;
}

void main() {
    // Unseen: replace the tile outright with the war-fog texture, skipping
    // every other layer/lighting/grid computation below. vFogUV is computed
    // from *world* position (see terrain.vertex.ts), so one repeat of the
    // texture spans several tiles and flows seamlessly across every fogged
    // hex - no per-tile square-texture-in-a-hex seams.
    if (vFogState < 0.5) {
        gl_FragColor = vec4(texture2D(fogMap, vFogUV).rgb, 1.0);
        return;
    }

    vec4 texColor = texture2D(map, vTexCoord);

    // One noise evaluation shared by all 6 blendEdge calls: a coarse octave
    // meanders the border position, a finer one modulates its strength into
    // patches (like the river banks' bankPatchiness below).
    float blendNoise = valueNoise(vWorldXZ * (3.0 / hexSize));
    float blendBend = (blendNoise - 0.5) * landBlendCurvature * 0.5;
    float blendPatch = clamp(0.6 + 0.8 * valueNoise(vWorldXZ * (8.0 / hexSize)), 0.0, 1.0);

    texColor = blendEdge(texColor, vNeighborsA.x, vNeighborsPriorityA.x, vEdgeFactorsA.x, blendBend, blendPatch); // SE
    texColor = blendEdge(texColor, vNeighborsA.y, vNeighborsPriorityA.y, vEdgeFactorsA.y, blendBend, blendPatch); // S
    texColor = blendEdge(texColor, vNeighborsA.z, vNeighborsPriorityA.z, vEdgeFactorsA.z, blendBend, blendPatch); // SW
    texColor = blendEdge(texColor, vNeighborsB.x, vNeighborsPriorityB.x, vEdgeFactorsB.x, blendBend, blendPatch); // NW
    texColor = blendEdge(texColor, vNeighborsB.y, vNeighborsPriorityB.y, vEdgeFactorsB.y, blendBend, blendPatch); // N
    texColor = blendEdge(texColor, vNeighborsB.z, vNeighborsPriorityB.z, vEdgeFactorsB.z, blendBend, blendPatch); // NE

    // Curved coastline. coastField() is 1.0 exactly on the mesh edge shared
    // with a water tile; bending it with static world-space noise moves the
    // *visual* waterline off that straight edge. The bend is ONE-SIDED
    // (inland only, noise >= 0): the whole visible waterline - sand band,
    // painted sea, foam strip - then lives on the land tile, drawn from this
    // single tile's own field, so it is continuous by construction. An
    // earlier two-sided version also painted sand on the water layer where
    // the line receded seaward, but the water tiles' per-tile shore fields
    // disagree near shared corners (each tile only knows its own neighbors),
    // which cut visible gaps/straight seams into the painted sand - see
    // water.fragment.ts, whose foam now just softly continues this line.
    vec2 coastFK = coastField();
    float coast = coastFK.x;
    if (coast > 0.0) {
        float cn = valueNoise(vWorldXZ * (1.3 / hexSize));
        cn = 0.6 * cn + 0.4 * valueNoise(vWorldXZ * (3.2 / hexSize));
        float f = coast + cn * coastCurvature * 0.5;

        // sand beach: replaces the old vBeachT vertex blend with the same
        // smoothstep keyed to the bent per-pixel field.
        float e0Beach = 1.0 - clamp(beachWidth, 0.001, 1.0) * 0.5;
        float beachT = smoothstep(e0Beach, 1.0, f);
        if (beachT > 0.0) {
            vec4 sandColor = texture2D(map, cellIndexToUV(sandAtlasIndex));
            texColor = mix(texColor, sandColor, beachT);
        }

        // painted sea past the bent waterline. Color-matched to what the
        // water layer shows right across the mesh seam: the base color is
        // the dominant water neighbor's own (deep for a sea tile, shallow
        // for coastal - coastFK.y), and its shore-distance field at the same
        // physical point equals (2 - f) in this side's units (both fields
        // are 1.0 on the mesh edge and bent by the same noise), so feeding
        // that through the water shader's own shore lightening (base
        // brightened towards white, see water.fragment.ts) makes the strip
        // continue the water tile's color seamlessly - no darker band, no
        // lighter ring around deep-sea islands. A mean-neutral ripple (like
        // the river water below) keeps it alive without shifting brightness.
        float seaT = smoothstep(1.0, 1.04, f);
        if (seaT > 0.0) {
            vec3 seaBase = coastFK.y < 1.5 ? seaColorDeep : seaColorShallow;
            float shoreT = smoothstep(e0Beach, 1.0, 2.0 - f);
            vec3 shoreCol = mix(seaColorShallow, vec3(1.0), 0.5);
            vec3 seaColor = mix(seaBase, shoreCol, shoreT);
            float t = uTime;
            float ripple = valueNoise(vWorldXZ * (6.0 / hexSize) + vec2(t * 0.35, t * 0.2));
            ripple = 0.5 * ripple + 0.5 * valueNoise(vWorldXZ * (12.0 / hexSize) - vec2(t * 0.25, t * 0.4));
            seaColor *= 0.85 + 0.3 * ripple;
            texColor = mix(texColor, vec4(seaColor, 1.0), seaT);

            if (foamEnabled > 0.5) {
                texColor.rgb = mix(texColor.rgb, foamColor, coastalFoam(vWorldXZ, uTime, max(f - 1.0, 0.0)) * seaT);
            }
        }

        if (foamEnabled < 0.5) {
            // a thin non-animated lapping-foam strip for maps that disable
            // coastal wave bands but still want the curved waterline readable.
            float foamStrip = smoothstep(0.98, 1.005, f) - smoothstep(1.04, 1.1, f);
            texColor.rgb = mix(texColor.rgb, vec3(1.0), clamp(foamStrip, 0.0, 1.0) * 0.35);
        }
    }

    // Mountain snowcap: tint the rock towards snow near the peak (vElevation
    // is 0 on every non-mountain tile). The relief itself comes from the
    // vertex stage's displacement + normals; this is just the color accent.
    if (vElevation > 0.0) {
        float snowT = smoothstep(0.55, 0.95, vElevation);
        texColor.rgb = mix(texColor.rgb, vec3(0.93, 0.95, 0.98), snowT * 0.85);
    }

    // Rivers/lakes (see the uniform block's comment above). Drawn before
    // lighting/fog/grid so all three keep applying to them unchanged; the
    // Unseen fog short-circuit at the top already hides them entirely.
    if (vRiverEdges > -0.5 || vLakeNeighborEdges > 0.5) {
        // Round the mask back to an exact integer: every vertex of an instance
        // carries the same riverEdges value, but varying interpolation is not
        // exact - a mask of 34.0 can arrive as 33.99997 on some fragments, and
        // floor(mask / 2^i) then decodes *different connection bits on
        // neighboring pixels* (pixel-level water/bank garbage along the river).
        float mask = floor(vRiverEdges + 0.5);
        float apothem = hexSize * 0.8660254;

        // static two-octave world-space noise bends the waterline: the curved,
        // "hand-drawn" banks instead of ruler-straight strips/hex-edge rims.
        float bend = valueNoise(vWorldXZ * (2.2 / hexSize));
        bend = 0.6 * bend + 0.4 * valueNoise(vWorldXZ * (5.0 / hexSize));
        float bendOff = (bend - 0.5) * riverCurvature * 0.6;

        float waterT = 0.0; // 1 = water surface
        float bankT = 0.0;  // 1 = inside the vegetation band (water overdraws its inner part)
        float depthT = 0.0; // 0 shallow (waterline) .. 1 deep (channel center / lake body)
        float seaMouthT = 0.0;

        if (mask >= 2048.0) {
            // Lake tiles are full water. The curved green shoreline is painted
            // by neighboring land tiles (like sea/coast), which gives the lake
            // more room and avoids a straight hex-shaped rim on the lake tile.
            float openMask = floor((mask - 4096.0) / 64.0);
            float channelMask = mask - 4096.0 - openMask * 64.0;
            waterT = 1.0;
            depthT = 1.0;
        } else if (mask >= 0.0) {
            // river: water along the channel centerline segments
            float d = riverChannelDist(vLocal, mask, apothem) / hexSize + bendOff;
            bankT = 1.0 - smoothstep(riverWidth + riverBankWidth * 0.35, riverWidth + riverBankWidth, d);
            waterT = 1.0 - smoothstep(riverWidth - 0.04, riverWidth, d);
            depthT = 1.0 - smoothstep(0.0, riverWidth, d);

            float seaMouthMask = floor(vRiverSeaMouthEdges + 0.5);
            float lakeMouthMask = floor(vRiverLakeMouthEdges + 0.5);
            vec4 seaMouth = riverMouthShape(vLocal, seaMouthMask, apothem, bendOff);
            vec4 lakeMouth = riverMouthShape(vLocal, lakeMouthMask, apothem, bendOff);
            bankT = max(bankT, max(seaMouth.y, lakeMouth.y));
            waterT = max(waterT, max(seaMouth.x, lakeMouth.x));
            depthT = max(depthT, max(seaMouth.z, lakeMouth.z));
            seaMouthT = smoothstep(0.45, 1.0, seaMouth.w);
        }

        float lakeNeighborMask = floor(vLakeNeighborEdges + 0.5);
        if (mask < 2048.0 && lakeNeighborMask > 0.5) {
            float lakeField = lakeNeighborField(lakeNeighborMask);
            if (lakeField > 0.0) {
                float lakeNoise = valueNoise(vWorldXZ * (1.3 / hexSize));
                lakeNoise = 0.6 * lakeNoise + 0.4 * valueNoise(vWorldXZ * (3.2 / hexSize));
                float fLake = lakeField + lakeNoise * coastCurvature * 0.5;
                float s0Lake = 1.0 - clamp(lakeShoreWidth, 0.001, 1.0);
                float lakeBankT = smoothstep(s0Lake, 1.0, fLake);
                float lakeWaterT = smoothstep(1.0, 1.04, fLake);
                bankT = max(bankT, lakeBankT);
                waterT = max(waterT, lakeWaterT);
                depthT = max(depthT, smoothstep(1.0, 1.2, fLake));
            }
        }

        // bank strip first: a light vegetation band reaching past the
        // waterline, its own strength varied by a finer noise so it reads as
        // patchy growth instead of a uniform outline. The water below
        // overdraws its inner part, leaving the band hugging the waterline.
        float bankPatchiness = 0.55 + 0.45 * valueNoise(vWorldXZ * (8.0 / hexSize));
        texColor = mix(texColor, vec4(riverBankColor, 1.0), bankT * bankPatchiness);

        // water: shallow color at the waterline deepening inward, brightness
        // rippled by two octaves of scrolling noise (uTime) - non-directional
        // on purpose, since a junction/lake has no single flow direction.
        if (waterT > 0.0) {
            vec3 waterColor = mix(riverColorShallow, riverColorDeep, depthT);
            waterColor = mix(waterColor, seaColorShallow, seaMouthT);

            float t = uTime * riverFlowSpeed;
            float ripple = valueNoise(vWorldXZ * (6.0 / hexSize) + vec2(t * 0.35, t * 0.2));
            ripple = 0.5 * ripple + 0.5 * valueNoise(vWorldXZ * (12.0 / hexSize) - vec2(t * 0.25, t * 0.4));
            waterColor *= 0.85 + 0.3 * ripple;

            texColor = mix(texColor, vec4(waterColor, 1.0), waterT);
        }
    }

    vec3 normal = normalize(vNormal);
    float lambertian = max(dot(normalize(lightDir), normal), 0.0);
    vec3 color = lightAmbient * texColor.rgb + lambertian * lightDiffuse * texColor.rgb;

    // Explored (previously seen, currently outside every unit's view range):
    // keep every feature visible, just darker - the "remembered" Civ-style look.
    if (vFogState < 1.5) color *= fogDarkenFactor;

    gl_FragColor = vec4(color, 1.0);

    if (showGrid > 0.0 && vBorder > 1.0 - gridWidth) {
        gl_FragColor = mix(vec4(gridColor, 1.0), gl_FragColor, 1.0 - gridOpacity);
    }
}
`;

	// src/shaders/water.vertex.ts
	var WATER_VERTEX_SHADER = `
precision highp float;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;

uniform float hexSize; // tile circumradius, matches getHexCenter's "size" (world units)
uniform float uTime;   // seconds, animates the waves
uniform float waterLevel; // rest height of the water plane (usually negative, below land)

// Wave shape - see waveHeightAndSlope() below.
uniform float waveAmplitude;
uniform float waveFrequency;
uniform float waveSpeed;

// Beach: waterLevel is where the water plane sits, waveAmplitude/etc animate it -
// but near an actual coastline (a land-adjacent edge/corner, see coastalFactor()
// below) the water settles down to a flat shore instead of waving right up to
// the sand. beachWidth is the *total* transition width shared with the land
// layer's own mirrored slope (see terrain.vertex.ts) - each side only covers
// half of it. waterCornerRounding (0..1) controls how much a corner shared by
// two land-adjacent edges rounds off instead of meeting at a sharp point.
uniform float beachWidth;
uniform float waterCornerRounding;
uniform float fogTextureSize; // world units one repeat of the fog texture spans (see terrain.vertex.ts)
uniform vec2 worldOffset; // translation of a repeated toroidal world copy
uniform vec2 chunkOrigin; // logical origin; instance offsets stay chunk-local for float precision
uniform vec2 worldCenter;
uniform vec2 worldPeriod;

attribute vec3 position;
attribute vec2 uv;

attribute vec2 offset;
attribute vec3 style;        // x = atlas cell index (unused here), y = modifiers, z = priority (0 = sea, 1 = coastal)
attribute vec3 neighborsPriorityA; // edge-blend priority of SE/S/SW neighbor
attribute vec3 neighborsPriorityB; // edge-blend priority of NW/N/NE neighbor
attribute vec3 neighborsKindA; // SE/S/SW: -1 no tile, 0 non-water, 1 sea, 2 coastal
attribute vec3 neighborsKindB; // NW/N/NE
attribute float fogState; // 0 = unseen, 1 = explored (darkened), 2 = visible - see FogOfWar.ts

varying vec2 vUV;
varying float vBorder;
varying float vPriority;
varying vec3 vNeighborsPriorityA;
varying vec3 vNeighborsPriorityB;
varying vec3 vNeighborsKindA;
varying vec3 vNeighborsKindB;
varying vec3 vEdgeFactorsA; // SE, S, SW
varying vec3 vEdgeFactorsB; // NW, N, NE
varying vec3 vNormal;
varying vec3 vWorldPos;
varying float vBeachT; // 0 = open water, 1 = right at the shore (see terrain.fragment.ts's vBeachT)
varying float vShoreT; // like vBeachT but unsquashed by beachWidth: raw 0 (tile center) .. 1 (land edge) coastal distance, 0 on tiles with no land neighbor - drives the foam bands in water.fragment.ts
varying float vFogState;
varying vec2 vFogUV; // world-space fog texture coords, continuous across tiles

const vec2 DIR_SE = vec2(0.8660254, 0.5);
const vec2 DIR_S  = vec2(0.0, 1.0);
const vec2 DIR_SW = vec2(-0.8660254, 0.5);
const vec2 DIR_NW = vec2(-0.8660254, -0.5);
const vec2 DIR_N  = vec2(0.0, -1.0);
const vec2 DIR_NE = vec2(0.8660254, -0.5);

const float GOLDEN_ANGLE = 2.399963; // ~137.5 deg, keeps summed waves from lining up

vec2 nearestWorldOffset(vec2 canonical) {
    vec2 wrapped = canonical;
    if (worldPeriod.x > 0.5) wrapped.x += floor((worldCenter.x - canonical.x) / worldPeriod.x + 0.5) * worldPeriod.x;
    if (worldPeriod.y > 0.5) wrapped.y += floor((worldCenter.y - canonical.y) / worldPeriod.y + 0.5) * worldPeriod.y;
    return wrapped;
}

// Sum of sine waves (NVIDIA GPU Gems ocean approach): height is a sum of sines
// of the world-space position; the *derivative* of a sine is a cosine of the
// same phase, so the surface normal's slope can be computed analytically in
// the same loop instead of sampling a normal map.
// Returns (height, slope.x, slope.z).
vec3 waveHeightAndSlope(vec2 worldXZ, float t) {
    float height = 0.0;
    vec2 slope = vec2(0.0);

    float amp = waveAmplitude;
    float freq = waveFrequency;
    float speed = waveSpeed;
    float dirAngle = 0.4;

    for (int i = 0; i < 4; i++) {
        vec2 dir = vec2(cos(dirAngle), sin(dirAngle));
        float phase = dot(dir, worldXZ) * freq + t * speed;

        height += amp * sin(phase);
        slope += dir * (amp * freq * cos(phase));

        amp *= 0.55;
        freq *= 1.8;
        speed *= 1.3;
        dirAngle += GOLDEN_ANGLE;
    }

    return vec3(height, slope.x, slope.y);
}

// Only an edge whose neighbor is real land (kind == 0, not sea/coastal/off-map)
// counts as "coastal" - mirrors the land shader's opposite check (kind >= 1.0).
float isLandKind(float kind) {
    return (kind > -0.5 && kind < 0.5) ? 1.0 : 0.0;
}

// Rounds off a corner shared by two coastal edges instead of leaving a sharp
// wedge where their two straight falloffs meet. Both dA/dB are already
// clamped to >= 0 (distance past the tile's own center towards that edge), so
// at the actual hex corner both equal ~1 regardless of which edge you ask -
// length() there extends the reach slightly beyond either edge alone, forming
// a rounded arc; mix() lets waterCornerRounding dial that between "sharp"
// (plain max, same as a single straight edge) and "fully rounded".
// Returns a negative sentinel if either edge isn't itself coastal, so a
// corner with only one land-adjacent edge never gets any rounding treatment.
float roundedCorner(float isLandA, float isLandB, float dA, float dB) {
    if (isLandA < 0.5 || isLandB < 0.5) return -1.0;
    float sharp = max(dA, dB);
    float rounded = length(vec2(dA, dB));
    return mix(sharp, rounded, clamp(waterCornerRounding, 0.0, 1.0));
}

void main() {
    float apothem = hexSize * 0.8660254;
    vec2 local = position.xz;

    vEdgeFactorsA = vec3(dot(local, DIR_SE), dot(local, DIR_S), dot(local, DIR_SW)) / apothem;
    vEdgeFactorsB = vec3(dot(local, DIR_NW), dot(local, DIR_N), dot(local, DIR_NE)) / apothem;

    float isLandSE = isLandKind(neighborsKindA.x);
    float isLandS  = isLandKind(neighborsKindA.y);
    float isLandSW = isLandKind(neighborsKindA.z);
    float isLandNW = isLandKind(neighborsKindB.x);
    float isLandN  = isLandKind(neighborsKindB.y);
    float isLandNE = isLandKind(neighborsKindB.z);

    float dSE = max(vEdgeFactorsA.x, 0.0);
    float dS  = max(vEdgeFactorsA.y, 0.0);
    float dSW = max(vEdgeFactorsA.z, 0.0);
    float dNW = max(vEdgeFactorsB.x, 0.0);
    float dN  = max(vEdgeFactorsB.y, 0.0);
    float dNE = max(vEdgeFactorsB.z, 0.0);

    // straight per-edge contribution: a single coastal edge (water on both
    // sides of it around the tile) never triggers the corner rounding below.
    float coastal = -1.0;
    coastal = max(coastal, isLandSE > 0.5 ? vEdgeFactorsA.x : -1.0);
    coastal = max(coastal, isLandS  > 0.5 ? vEdgeFactorsA.y : -1.0);
    coastal = max(coastal, isLandSW > 0.5 ? vEdgeFactorsA.z : -1.0);
    coastal = max(coastal, isLandNW > 0.5 ? vEdgeFactorsB.x : -1.0);
    coastal = max(coastal, isLandN  > 0.5 ? vEdgeFactorsB.y : -1.0);
    coastal = max(coastal, isLandNE > 0.5 ? vEdgeFactorsB.z : -1.0);

    // corner rounding, only where two *adjacent* edges are both coastal.
    coastal = max(coastal, roundedCorner(isLandSE, isLandS,  dSE, dS));
    coastal = max(coastal, roundedCorner(isLandS,  isLandSW, dS,  dSW));
    coastal = max(coastal, roundedCorner(isLandSW, isLandNW, dSW, dNW));
    coastal = max(coastal, roundedCorner(isLandNW, isLandN,  dNW, dN));
    coastal = max(coastal, roundedCorner(isLandN,  isLandNE, dN,  dNE));
    coastal = max(coastal, roundedCorner(isLandNE, isLandSE, dNE, dSE));

    float e0 = 1.0 - clamp(beachWidth, 0.001, 1.0) * 0.5;
    float beachT = smoothstep(e0, 1.0, clamp(coastal, 0.0, 1.0));

    vec2 tileOffset = nearestWorldOffset(offset);
    vec2 worldXZ = tileOffset + chunkOrigin + position.xz + worldOffset;
    vec3 hs = waveHeightAndSlope(worldXZ, uTime);

    // Unseen (fog of war, see FogOfWar.ts): freeze the waves AND raise the
    // tile to land's rest height (y=0). A tile that kept animating - or even
    // just sat visibly lower than its land neighbors - would still read as
    // "there is water here" through fog that is supposed to hide everything.
    float fogVisible = fogState < 0.5 ? 0.0 : 1.0;

    // damp the wave out towards the shore (beachT -> 1) instead of a purely
    // radial falloff - a radial one shrinks towards *every* corner regardless
    // of what's actually next door, flattening/"rounding" corners between
    // three water tiles too where nothing should change at all.
    float damp = (1.0 - beachT) * fogVisible;
    float waveY = hs.x * damp;
    vec2 slope = hs.yz * damp;

    // Water rises *half* the way up towards land's own rest height (0) as it
    // nears the shore - land sinks the other half towards waterLevel (see
    // terrain.vertex.ts's sinkY) - so the total drop between the two tiles is
    // evenly split instead of the water side staying flat at waterLevel while
    // land does all the work alone. waterLevel is negative, so -waterLevel*0.5
    // is a positive lift.
    float riseY = beachT * (-waterLevel * 0.5);

    vec3 pos = vec3(tileOffset.x + position.x, mix(0.0, waterLevel + waveY + riseY, fogVisible), tileOffset.y + position.z);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);

    vNormal = normalize(normalMatrix * normalize(vec3(-slope.x, 1.0, -slope.y)));
    vWorldPos = pos + vec3(chunkOrigin.x + worldOffset.x, 0.0, chunkOrigin.y + worldOffset.y);

    // Rim distance for the grid line - see terrain.vertex.ts's rimFactor
    // comment: radial distance from center is wrong for a hexagon (it dips to
    // the apothem at edge midpoints instead of staying 1.0 along the whole
    // edge), which fragments the grid line into corner-only blobs once the
    // geometry is subdivided. The edge factors already computed above are the
    // correct, constant-along-the-edge metric.
    float rimFactor = max(max(max(vEdgeFactorsA.x, vEdgeFactorsA.y), max(vEdgeFactorsA.z, vEdgeFactorsB.x)), max(vEdgeFactorsB.y, vEdgeFactorsB.z));

    vUV = uv;
    vBorder = clamp(rimFactor, 0.0, 1.0);
    vPriority = style.z;
    vBeachT = beachT;
    vShoreT = clamp(coastal, 0.0, 1.0);
    vNeighborsPriorityA = neighborsPriorityA;
    vNeighborsPriorityB = neighborsPriorityB;
    vNeighborsKindA = neighborsKindA;
    vNeighborsKindB = neighborsKindB;
    vFogState = fogState;
    // Same upright-for-the-camera mapping as terrain.vertex.ts's vFogUV -
    // u along world -Z, v along world -X - so land and water sample the fog
    // texture identically and it stays continuous across the two layers.
    vFogUV = vec2(-worldXZ.y, -worldXZ.x) / fogTextureSize;
}
`;

	// src/shaders/water.fragment.ts
	var WATER_FRAGMENT_SHADER = `
precision highp float;

uniform vec4 textureAtlasMeta;

// Curved coastline (see terrain.fragment.ts's coast block - this is its water
// side): the shore-distance field is recomputed per-pixel and bent by the SAME
// static world-space noise the land layer uses. The bend is one-sided (inland
// only), so the actual waterline always lies on the LAND tile - this shader
// never paints past it, it only keys the foam and shore lightening off the
// bent field so they softly continue the land side's line across the seam.
// (Painting hard features like sand here doesn't work: the per-tile shore
// fields of neighboring water tiles disagree near shared corners, cutting
// visible gaps/straight seams into anything they draw.)
uniform float waterCornerRounding;
uniform float coastCurvature;
uniform float beachWidth;

uniform sampler2D fogMap;        // war-fog.jpg, tiled per-tile via vUV
uniform float fogDarkenFactor;   // color multiplier for Explored (fogState 1) tiles

uniform float showGrid;
uniform vec3 gridColor;
uniform float gridWidth;
uniform float gridOpacity;

uniform vec3 lightDir;
uniform vec3 cameraPosition; // auto-provided by three.js each frame
uniform vec2 cameraWorldOffset; // floating-origin logical offset (infinite worlds)

uniform vec3 waterColorDeep;
uniform vec3 waterColorShallow;
uniform float sparkleIntensity;
uniform float fresnelIntensity;

// Stylized coastal foam (after Harry Alisavakis' "My take on shaders: Stylized
// water shader" - his foam comes from a scene-depth difference + scrolling
// noise texture; this engine has no depth pass, but vShoreT is exactly the
// same "how close to the shore is this fragment" signal, so the foam recipe
// (noise-distorted bands marching towards the waterline + a solid lapping
// edge) ports directly onto it).
uniform float hexSize;        // shared with the vertex stage (commonUniforms)
uniform float uTime;          // shared with the vertex stage's wave clock
uniform float foamEnabled;    // 0/1 gate, cheap enough to keep as a uniform
uniform vec3 foamColor;
uniform float foamCount;      // wave bands per shore-to-center span
uniform float foamSpeed;      // bands' travel speed towards the shore
uniform float foamWidth;      // band thickness, fraction of one band's wavelength
uniform float foamRange;      // how far out from the shore bands reach (0..1 of tile radius)
uniform float foamDistortion; // 0..1, how strongly noise bends/breaks the bands
uniform float foamOpacity;

varying vec2 vUV;
varying float vBorder;
varying float vPriority;
varying vec3 vNeighborsPriorityA;
varying vec3 vNeighborsPriorityB;
varying vec3 vNeighborsKindA;
varying vec3 vNeighborsKindB;
varying vec3 vEdgeFactorsA;
varying vec3 vEdgeFactorsB;
varying vec3 vNormal;
varying vec3 vWorldPos;
varying float vBeachT;
varying float vShoreT;
varying float vFogState;
varying vec2 vFogUV;

const vec3 lightAmbient = vec3(0.55, 0.55, 0.55);
const vec3 lightDiffuse = vec3(0.55, 0.55, 0.55);
const vec3 sparkleColor = vec3(1.0, 0.97, 0.85);
const vec3 skyTint = vec3(0.85, 0.95, 1.0);

// Picks the single strongest edge among the 6 whose neighbor both passes the
// one-directional priority gate and is itself water (a sea tile bordering a
// shallower coastal tile), returning (bestFactor, kind). Mirrors the land
// shader's strongestWaterEdge() (see terrain.vertex.ts).
vec2 strongestWaterEdge(vec2 best, float kind, float priority, float factor) {
    if (kind < 0.5 || priority <= vPriority) return best;
    if (factor > best.x) return vec2(factor, kind);
    return best;
}

// Cheap value noise - stands in for the article's scrolling noise texture
// (keeps the shader texture-free like the rest of this water layer).
float hash21(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
        mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
        u.y
    );
}

// Same corner treatment as water.vertex.ts's roundedCorner() - duplicated per
// pixel here so the bent waterline works with the rounded field, not the
// vertex-interpolated approximation of it.
float roundedCorner(float isLandA, float isLandB, float dA, float dB) {
    if (isLandA < 0.5 || isLandB < 0.5) return -1.0;
    float sharp = max(dA, dB);
    float rounded = length(vec2(dA, dB));
    return mix(sharp, rounded, clamp(waterCornerRounding, 0.0, 1.0));
}

// Per-pixel shore-distance field: mirrors water.vertex.ts's coastal factor
// (straight per-edge max + rounded corners), 1.0 exactly on an edge shared
// with land, 0 on tiles without land neighbors. Kinds are re-rounded first -
// varying interpolation is not exact even for per-instance-constant values.
float shoreField() {
    vec3 kA = floor(vNeighborsKindA + 0.5);
    vec3 kB = floor(vNeighborsKindB + 0.5);
    float lSE = (kA.x > -0.5 && kA.x < 0.5) ? 1.0 : 0.0;
    float lS  = (kA.y > -0.5 && kA.y < 0.5) ? 1.0 : 0.0;
    float lSW = (kA.z > -0.5 && kA.z < 0.5) ? 1.0 : 0.0;
    float lNW = (kB.x > -0.5 && kB.x < 0.5) ? 1.0 : 0.0;
    float lN  = (kB.y > -0.5 && kB.y < 0.5) ? 1.0 : 0.0;
    float lNE = (kB.z > -0.5 && kB.z < 0.5) ? 1.0 : 0.0;

    float s = 0.0;
    s = max(s, lSE > 0.5 ? vEdgeFactorsA.x : 0.0);
    s = max(s, lS  > 0.5 ? vEdgeFactorsA.y : 0.0);
    s = max(s, lSW > 0.5 ? vEdgeFactorsA.z : 0.0);
    s = max(s, lNW > 0.5 ? vEdgeFactorsB.x : 0.0);
    s = max(s, lN  > 0.5 ? vEdgeFactorsB.y : 0.0);
    s = max(s, lNE > 0.5 ? vEdgeFactorsB.z : 0.0);
    if (s <= 0.0) return 0.0;

    float dSE = max(vEdgeFactorsA.x, 0.0);
    float dS  = max(vEdgeFactorsA.y, 0.0);
    float dSW = max(vEdgeFactorsA.z, 0.0);
    float dNW = max(vEdgeFactorsB.x, 0.0);
    float dN  = max(vEdgeFactorsB.y, 0.0);
    float dNE = max(vEdgeFactorsB.z, 0.0);

    s = max(s, roundedCorner(lSE, lS,  dSE, dS));
    s = max(s, roundedCorner(lS,  lSW, dS,  dSW));
    s = max(s, roundedCorner(lSW, lNW, dSW, dNW));
    s = max(s, roundedCorner(lNW, lN,  dNW, dN));
    s = max(s, roundedCorner(lN,  lNE, dN,  dNE));
    s = max(s, roundedCorner(lNE, lSE, dNE, dSE));
    return s;
}

// Coastal foam factor (0..1) for the current fragment. Two parts, both keyed
// off shoreDist (0 exactly at the - possibly noise-bent - waterline):
//   1) travelling bands: fract(shoreDist * foamCount + t) makes foamCount
//      bands whose crests march towards the shore as t grows, faded out with
//      distance so they read as swells rolling in and dying at the beach;
//   2) lapping edge: a solid strip of foam hugging the waterline itself.
// World-space value noise perturbs both so the bands wobble and tear instead
// of tracing the hex outline as perfect straight/parallel lines.
float coastalFoam(vec2 worldXZ, float t, float shoreDist) {
    // ~3 noise cells per tile radius; the second, slowly scrolling octave
    // keeps the tear pattern itself alive instead of frozen in world space.
    float n = valueNoise(worldXZ * (3.0 / hexSize) + vec2(0.0, t * 0.2));
    n = 0.5 * n + 0.5 * valueNoise(worldXZ * (7.0 / hexSize) - vec2(t * 0.15, 0.0));
    float distort = (n - 0.5) * foamDistortion;

    // 1) travelling bands
    float phase = fract(shoreDist * foamCount + t * foamSpeed + distort * 2.0);
    float halfW = clamp(foamWidth, 0.02, 1.0) * 0.5;
    float band = smoothstep(halfW, halfW * 0.35, abs(phase - 0.5));
    float fade = 1.0 - smoothstep(foamRange * 0.35, max(foamRange, 0.001), shoreDist);
    // noise also modulates each band's strength so crests come and go
    band *= fade * (0.55 + 0.45 * n);

    // 2) lapping edge, its reach wobbling with the same noise
    float edge = smoothstep(0.12, 0.0, shoreDist + distort * 0.35);

    return clamp(edge + band, 0.0, 1.0) * foamOpacity;
}

void main() {
    // Unseen: same short-circuit as the land layer (terrain.fragment.ts) -
    // replace the tile outright with the war-fog texture, skipping the wave
    // lighting/sparkle/fresnel/grid work below entirely. vFogUV is world-space
    // (see terrain.vertex.ts's comment), so the texture flows seamlessly
    // across neighboring fogged tiles instead of restarting per hex.
    if (vFogState < 0.5) {
        gl_FragColor = vec4(texture2D(fogMap, vFogUV).rgb, 1.0);
        return;
    }

    // self color: this mesh only ever contains sea (priority 0) / coastal
    // (priority 1) tiles (see TerrainMesh's WATER_TYPES split), so vPriority
    // alone is enough to tell which one a given instance is.
    vec4 texColor = vec4(vPriority < 0.5 ? waterColorDeep : waterColorShallow, 1.0);

    // water-to-water (e.g. sea blending towards a shallower coastal tile): blend once,
    // towards the single closest higher-priority water edge.
    vec2 water = vec2(0.0);
    water = strongestWaterEdge(water, vNeighborsKindA.x, vNeighborsPriorityA.x, vEdgeFactorsA.x);
    water = strongestWaterEdge(water, vNeighborsKindA.y, vNeighborsPriorityA.y, vEdgeFactorsA.y);
    water = strongestWaterEdge(water, vNeighborsKindA.z, vNeighborsPriorityA.z, vEdgeFactorsA.z);
    water = strongestWaterEdge(water, vNeighborsKindB.x, vNeighborsPriorityB.x, vEdgeFactorsB.x);
    water = strongestWaterEdge(water, vNeighborsKindB.y, vNeighborsPriorityB.y, vEdgeFactorsB.y);
    water = strongestWaterEdge(water, vNeighborsKindB.z, vNeighborsPriorityB.z, vEdgeFactorsB.z);
    if (water.x > 0.0) {
        vec3 otherColor = water.y > 1.5 ? waterColorShallow : waterColorDeep;
        texColor = mix(texColor, vec4(otherColor, 1.0), clamp(water.x, 0.0, 1.0));
    }

    // Curved coastline: recompute the shore field per-pixel and bend it with
    // the SAME one-sided static world-space noise as the land layer's coast
    // block (see terrain.fragment.ts) - the waterline sits inland, and the
    // shore visuals below (lightening, foam) recede with it so they continue
    // the land side's line across the seam. The wave-damping geometry stays
    // keyed to the un-bent vertex factors, which only affects height.
    float shore = shoreField();
    float fBent = 0.0;
    if (shore > 0.0) {
        float cn = valueNoise(vWorldPos.xz * (1.3 / hexSize));
        cn = 0.6 * cn + 0.4 * valueNoise(vWorldPos.xz * (3.2 / hexSize));
        fBent = shore - cn * coastCurvature * 0.5;
    }

    // shoreline: lighten towards a foamy/sandy tint as the water nears the
    // (bent) coastline. Blending towards waterColorShallow itself would be a
    // no-op on a map with no "sea" tiles (every water tile is already
    // priority 1 = shallow, so texColor is already waterColorShallow) - blend
    // towards a brightened version instead so the effect is visible
    // regardless of whether the tile started as deep or shallow.
    float e0Beach = 1.0 - clamp(beachWidth, 0.001, 1.0) * 0.5;
    float shoreT = smoothstep(e0Beach, 1.0, fBent);
    if (shoreT > 0.0) {
        vec3 shoreColor = mix(waterColorShallow, vec3(1.0), 0.5);
        texColor = mix(texColor, vec4(shoreColor, 1.0), shoreT);
    }

    vec3 normal = normalize(vNormal);
    vec3 light = normalize(lightDir);
    vec3 logicalCameraPosition = cameraPosition + vec3(cameraWorldOffset.x, 0.0, cameraWorldOffset.y);
    vec3 viewDir = normalize(logicalCameraPosition - vWorldPos);

    float ndotl = max(dot(normal, light), 0.0);
    vec3 color = lightAmbient * texColor.rgb + ndotl * lightDiffuse * texColor.rgb;

    // sun glitter: sharp specular highlight off the wave-perturbed normal
    vec3 halfDir = normalize(light + viewDir);
    float spec = pow(max(dot(normal, halfDir), 0.0), 60.0);
    color += spec * sparkleColor * sparkleIntensity;

    // cheap fresnel: brighten towards a fixed sky tint at grazing angles,
    // instead of a real planar reflection render target.
    float fresnel = pow(1.0 - clamp(dot(normal, viewDir), 0.0, 1.0), 3.0);
    color = mix(color, skyTint, fresnel * 0.5 * fresnelIntensity);

    // coastal foam waves - only fragments on a land-adjacent tile have a
    // shore field > 0, so open sea skips the noise work entirely. Keyed to
    // the bent waterline's distance so the bands/lapping edge follow the
    // curve. Applied before the fog darkening below so foam on Explored
    // tiles dims with the water.
    if (foamEnabled > 0.5 && shore > 0.001) {
        color = mix(color, foamColor, coastalFoam(vWorldPos.xz, uTime, max(1.0 - fBent, 0.0)));
    }

    // Explored (previously seen, currently outside every unit's view range):
    // keep the water visible, just darker - mirrors the land layer's own
    // fogState handling in terrain.fragment.ts.
    if (vFogState < 1.5) color *= fogDarkenFactor;

    gl_FragColor = vec4(color, 1.0);

    if (showGrid > 0.0 && vBorder > 1.0 - gridWidth) {
        gl_FragColor = mix(vec4(gridColor, 1.0), gl_FragColor, 1.0 - gridOpacity);
    }
}
`;

	// src/objects/TerrainMesh.ts
	var WATER_TYPES = ["sea" /* sea */, "coastal" /* coastal */];
	var CITY_FOG_TILE_KEY = "hexMapCityFogTile";
	var TerrainMesh = class extends three.Group {
	  constructor(map, options, initialTiles) {
	    super();
	    this.options = options;
	    this.landChunks = [];
	    this.waterChunks = [];
	    this.tileIndex = /* @__PURE__ */ new Map();
	    this.waterTileIndex = /* @__PURE__ */ new Map();
	    this.chunkRecords = /* @__PURE__ */ new Map();
	    this.fogStates = /* @__PURE__ */ new Map();
	    this.cityFog = /* @__PURE__ */ new Map();
	    this.atlasCellIndex = {};
	    this.clock = 0;
	    this.lodBuilds = 0;
	    this.map = map;
	    this.buildAtlasCellIndex();
	    this.fogTexture = this.loadFogTexture();
	    this.atlasTexture = this.loadAtlasTexture();
	    this.waterShallow = new three.Color(options.waterColorShallow ?? LandColor["coastal" /* coastal */]);
	    this.waterDeep = new three.Color(options.waterColorDeep ?? LandColor["sea" /* sea */]);
	    const landTiles = [];
	    const waterTiles = [];
	    if (initialTiles) {
	      for (const point of initialTiles) {
	        const tile = getMapTile(this.map, point.x, point.y);
	        if (tile) (WATER_TYPES.includes(tile.type) ? waterTiles : landTiles).push(point);
	      }
	    } else {
	      forEachMapTile(this.map, (tile, x, y) => {
	        (WATER_TYPES.includes(tile.type) ? waterTiles : landTiles).push({ x, y });
	      });
	    }
	    this.buildLandLayer(landTiles);
	    this.buildWaterLayer(waterTiles);
	  }
	  buildAtlasCellIndex() {
	    const atlas = this.options.atlas;
	    const cols = atlas.width / atlas.cellSize;
	    for (const name in atlas.textures) {
	      const cell = atlas.textures[name];
	      this.atlasCellIndex[name] = cell.cellY * cols + cell.cellX;
	    }
	  }
	  //Atlas cell index for a tile's terrain type. Returns -1 if the tile doesn't
	  //exist (used for out-of-map neighbors).
	  cellIndexFor(x, y) {
	    const tile = getMapTile(this.map, x, y);
	    if (!tile) return -1;
	    const cell = this.atlasCellIndex[tile.type];
	    return cell === void 0 ? -1 : cell;
	  }
	  //Edge-blend priority of a tile's terrain type (see enums.ts LandPriority).
	  //Returns -Infinity for out-of-map neighbors so a border tile never blends
	  //towards "nothing".
	  priorityFor(x, y) {
	    const tile = getMapTile(this.map, x, y);
	    return tile ? LandPriority[tile.type] : -Infinity;
	  }
	  //-1 no tile, 0 non-water, 1 sea, 2 coastal - drives the land layer's beach
	  //slope and the water layer's edge-color resolution (see shaders).
	  kindFor(x, y) {
	    const tile = getMapTile(this.map, x, y);
	    if (!tile) return -1;
	    const waterIndex = WATER_TYPES.indexOf(tile.type);
	    return waterIndex === -1 ? 0 : waterIndex + 1;
	  }
	  //Builds the per-instance attribute arrays (offset/style/neighbors/neighbor
	  //priorities/kinds) shared by every layer - land and water tiles are laid
	  //out identically, only the geometry/shader differ.
	  buildInstanceAttributes(tiles, origin) {
	    const { size } = this.options;
	    const attrs = {
	      offset: new Float32Array(tiles.length * 2),
	      style: new Float32Array(tiles.length * 3),
	      neighborsA: new Float32Array(tiles.length * 3),
	      neighborsB: new Float32Array(tiles.length * 3),
	      neighborsPriorityA: new Float32Array(tiles.length * 3),
	      neighborsPriorityB: new Float32Array(tiles.length * 3),
	      neighborsKindA: new Float32Array(tiles.length * 3),
	      neighborsKindB: new Float32Array(tiles.length * 3),
	      riverEdges: new Float32Array(tiles.length),
	      riverSeaMouthEdges: new Float32Array(tiles.length),
	      riverLakeMouthEdges: new Float32Array(tiles.length),
	      lakeNeighborEdges: new Float32Array(tiles.length),
	      fogState: new Float32Array(tiles.length)
	      // filled per tile below
	    };
	    tiles.forEach((tile, i) => {
	      const info = getMapTile(this.map, tile.x, tile.y);
	      const center = getHexCenter(tile.x, tile.y, size);
	      attrs.offset[i * 2 + 0] = center.x - origin.x;
	      attrs.offset[i * 2 + 1] = center.y - origin.y;
	      attrs.style[i * 3 + 0] = this.atlasCellIndex[info.type] ?? 0;
	      attrs.style[i * 3 + 1] = info.modifiers?.includes("hill") ? 1 : 0;
	      attrs.style[i * 3 + 2] = LandPriority[info.type] ?? 0;
	      attrs.fogState[i] = this.fogStates.get(`${tile.x},${tile.y}`) ?? 2;
	      const se = getNeighborCoords(tile.x, tile.y, "SE");
	      const s = getNeighborCoords(tile.x, tile.y, "S");
	      const sw = getNeighborCoords(tile.x, tile.y, "SW");
	      const nw = getNeighborCoords(tile.x, tile.y, "NW");
	      const n = getNeighborCoords(tile.x, tile.y, "N");
	      const ne = getNeighborCoords(tile.x, tile.y, "NE");
	      attrs.neighborsA[i * 3 + 0] = this.cellIndexFor(se.x, se.y);
	      attrs.neighborsA[i * 3 + 1] = this.cellIndexFor(s.x, s.y);
	      attrs.neighborsA[i * 3 + 2] = this.cellIndexFor(sw.x, sw.y);
	      attrs.neighborsB[i * 3 + 0] = this.cellIndexFor(nw.x, nw.y);
	      attrs.neighborsB[i * 3 + 1] = this.cellIndexFor(n.x, n.y);
	      attrs.neighborsB[i * 3 + 2] = this.cellIndexFor(ne.x, ne.y);
	      attrs.neighborsPriorityA[i * 3 + 0] = this.priorityFor(se.x, se.y);
	      attrs.neighborsPriorityA[i * 3 + 1] = this.priorityFor(s.x, s.y);
	      attrs.neighborsPriorityA[i * 3 + 2] = this.priorityFor(sw.x, sw.y);
	      attrs.neighborsPriorityB[i * 3 + 0] = this.priorityFor(nw.x, nw.y);
	      attrs.neighborsPriorityB[i * 3 + 1] = this.priorityFor(n.x, n.y);
	      attrs.neighborsPriorityB[i * 3 + 2] = this.priorityFor(ne.x, ne.y);
	      attrs.neighborsKindA[i * 3 + 0] = this.kindFor(se.x, se.y);
	      attrs.neighborsKindA[i * 3 + 1] = this.kindFor(s.x, s.y);
	      attrs.neighborsKindA[i * 3 + 2] = this.kindFor(sw.x, sw.y);
	      attrs.neighborsKindB[i * 3 + 0] = this.kindFor(nw.x, nw.y);
	      attrs.neighborsKindB[i * 3 + 1] = this.kindFor(n.x, n.y);
	      attrs.neighborsKindB[i * 3 + 2] = this.kindFor(ne.x, ne.y);
	      attrs.riverEdges[i] = waterEdgeValue(this.map, tile.x, tile.y);
	      attrs.riverSeaMouthEdges[i] = riverSeaMouthEdgeValue(this.map, tile.x, tile.y);
	      attrs.riverLakeMouthEdges[i] = riverLakeMouthEdgeValue(this.map, tile.x, tile.y);
	      attrs.lakeNeighborEdges[i] = lakeNeighborEdgeValue(this.map, tile.x, tile.y);
	    });
	    return attrs;
	  }
	  buildInstancedGeometry(tiles, numSubdivisions, borderSubdivisions = numSubdivisions, origin = { x: 0, y: 0 }, attributes) {
	    const hexagon = numSubdivisions === borderSubdivisions ? createHexagonGeometry(this.options.size, numSubdivisions) : createHexagonLodGeometry(this.options.size, numSubdivisions, borderSubdivisions);
	    const geometry = new three.InstancedBufferGeometry();
	    geometry.setAttribute("position", hexagon.getAttribute("position"));
	    geometry.setAttribute("uv", hexagon.getAttribute("uv"));
	    geometry.setIndex(hexagon.getIndex());
	    geometry.instanceCount = tiles.length;
	    const attrs = attributes ?? this.buildInstanceAttributes(tiles, origin);
	    geometry.setAttribute("offset", new three.InstancedBufferAttribute(attrs.offset, 2));
	    geometry.setAttribute("style", new three.InstancedBufferAttribute(attrs.style, 3));
	    geometry.setAttribute("neighborsA", new three.InstancedBufferAttribute(attrs.neighborsA, 3));
	    geometry.setAttribute("neighborsB", new three.InstancedBufferAttribute(attrs.neighborsB, 3));
	    geometry.setAttribute("neighborsPriorityA", new three.InstancedBufferAttribute(attrs.neighborsPriorityA, 3));
	    geometry.setAttribute("neighborsPriorityB", new three.InstancedBufferAttribute(attrs.neighborsPriorityB, 3));
	    geometry.setAttribute("neighborsKindA", new three.InstancedBufferAttribute(attrs.neighborsKindA, 3));
	    geometry.setAttribute("neighborsKindB", new three.InstancedBufferAttribute(attrs.neighborsKindB, 3));
	    geometry.setAttribute("riverEdges", new three.InstancedBufferAttribute(attrs.riverEdges, 1));
	    geometry.setAttribute("riverSeaMouthEdges", new three.InstancedBufferAttribute(attrs.riverSeaMouthEdges, 1));
	    geometry.setAttribute("riverLakeMouthEdges", new three.InstancedBufferAttribute(attrs.riverLakeMouthEdges, 1));
	    geometry.setAttribute("lakeNeighborEdges", new three.InstancedBufferAttribute(attrs.lakeNeighborEdges, 1));
	    geometry.setAttribute("fogState", new three.InstancedBufferAttribute(attrs.fogState, 1));
	    return geometry;
	  }
	  commonUniforms() {
	    const atlas = this.options.atlas;
	    const size = this.options.size;
	    return {
	      textureAtlasMeta: { value: new three.Vector4(atlas.width, atlas.height, atlas.cellSize, atlas.cellSpacing) },
	      hexSize: { value: size },
	      map: { value: this.atlasTexture },
	      sandAtlasIndex: { value: this.atlasCellIndex["sand" /* sand */] ?? 0 },
	      waterLevel: { value: -(this.options.waterDepth ?? size * 0.25) },
	      beachWidth: { value: this.options.beachWidth ?? 0.35 },
	      waterCornerRounding: { value: this.options.waterCornerRounding ?? 0.4 },
	      coastCurvature: { value: this.options.coastCurvature ?? 0.5 },
	      fogMap: { value: this.fogTexture },
	      fogDarkenFactor: { value: this.options.fogDarkenFactor ?? 0.45 },
	      fogTextureSize: { value: this.options.fogTextureSize ?? size * 8 },
	      //Physical chunk copies now handle toroidal placement. Leaving the
	      //shader period at zero keeps every tile attached to its canonical
	      //chunk, so chunks can be independently culled and streamed.
	      worldCenter: { value: new three.Vector2(0, 0) },
	      worldPeriod: { value: new three.Vector2(0, 0) },
	      chunkOrigin: { value: new three.Vector2(0, 0) },
	      lightDir: { value: { x: 0.4, y: 1, z: 0.3 } },
	      showGrid: { value: this.options.gridVisible === false ? 0 : 1 },
	      gridColor: { value: new three.Color(this.options.gridColor ?? 0) },
	      gridWidth: { value: this.options.gridWidth ?? 0.04 },
	      gridOpacity: { value: this.options.gridOpacity ?? 0.35 }
	    };
	  }
	  //Mipmapping a multi-cell texture atlas bleeds neighboring cells into each
	  //other at lower mip levels (each mip texel then averages pixels that span
	  //a cell boundary) - visible as dark blotches on distant/oblique tiles,
	  //worst on the water layer's sand-cell blend since it's sampled from many
	  //different tiles' local UVs at once. Disabling mipmaps (plain bilinear
	  //filtering) avoids it; some distant-terrain shimmer is an acceptable
	  //trade-off for a tile-based map that's mostly viewed from a fixed range of
	  //distances anyway.
	  loadAtlasTexture() {
	    const loader = new three.TextureLoader().setPath(this.options.texturesBaseUrl);
	    const atlasTexture = loader.load(this.options.atlas.image);
	    atlasTexture.wrapS = atlasTexture.wrapT = three.RepeatWrapping;
	    atlasTexture.generateMipmaps = false;
	    atlasTexture.minFilter = three.LinearFilter;
	    return atlasTexture;
	  }
	  //war-fog.jpg (see FogOfWar.ts) - a single, non-atlased image sampled with
	  //world-space UVs (see terrain/water vertex shaders' vFogUV), so one repeat
	  //spans several tiles. RepeatWrapping is required for that (world UVs run
	  //far past 0..1); mipmaps are fine here, unlike the atlas (a standalone
	  //image has no neighboring cells to bleed into).
	  loadFogTexture() {
	    const loader = new three.TextureLoader().setPath(this.options.texturesBaseUrl);
	    const texture = loader.load(this.options.fogTexture ?? "war-fog.jpg");
	    texture.wrapS = texture.wrapT = three.RepeatWrapping;
	    return texture;
	  }
	  //Subdivided (not a single flat triangle per wedge) so the beach slope and
	  //landBlendWidth/beachWidth's smoothstep-based falloffs actually have interior
	  //vertices to sample - with only the 2 outer corners + center (0 subdivisions),
	  //the corners always saturate to fully-blended (edge factor is exactly 1 at
	  //any hex corner) and the center is always 0, so the GPU only ever linearly
	  //interpolates between those 2 fixed extremes no matter the configured width.
	  buildLandLayer(tiles) {
	    this.landMaterial ?? (this.landMaterial = new three.RawShaderMaterial({
	      uniforms: {
	        worldOffset: { value: new three.Vector2(0, 0) },
	        landBlendWidth: { value: this.options.landBlendWidth ?? 0.5 },
	        landBlendCurvature: { value: this.options.landBlendCurvature ?? 0.5 },
	        mountainAtlasIndex: { value: this.atlasCellIndex["mountain" /* mountain */] ?? -2 },
	        mountainHeight: { value: this.options.mountainHeight ?? this.options.size * 0.6 },
	        seaColorShallow: { value: this.waterShallow },
	        seaColorDeep: { value: this.waterDeep },
	        uTime: { value: 0 },
	        foamEnabled: { value: this.options.coastalWavesEnabled ?? true ? 1 : 0 },
	        foamColor: { value: new three.Color(this.options.coastalWaveColor ?? 16777215) },
	        foamCount: { value: this.options.coastalWaveCount ?? 3 },
	        foamSpeed: { value: this.options.coastalWaveSpeed ?? 0.6 },
	        foamWidth: { value: this.options.coastalWaveWidth ?? 0.3 },
	        foamRange: { value: this.options.coastalWaveRange ?? 0.8 },
	        foamDistortion: { value: this.options.coastalWaveDistortion ?? 0.5 },
	        foamOpacity: { value: this.options.coastalWaveOpacity ?? 0.85 },
	        riverWidth: { value: this.options.riverWidth ?? 0.28 },
	        riverBankWidth: { value: this.options.riverBankWidth ?? 0.14 },
	        riverCurvature: { value: this.options.riverCurvature ?? 0.5 },
	        riverColorShallow: { value: new three.Color(this.options.riverColorShallow ?? this.options.waterColorShallow ?? LandColor["coastal" /* coastal */]) },
	        riverColorDeep: { value: new three.Color(this.options.riverColorDeep ?? this.options.waterColorDeep ?? LandColor["sea" /* sea */]) },
	        riverBankColor: { value: new three.Color(this.options.riverBankColor ?? 11059050) },
	        riverFlowSpeed: { value: this.options.riverFlowSpeed ?? 1 },
	        riverDepth: { value: this.options.riverDepth ?? (this.options.waterDepth ?? this.options.size * 0.25) * 0.6 },
	        lakeShoreWidth: { value: this.options.lakeShoreWidth ?? 0.18 },
	        ...this.commonUniforms()
	      },
	      vertexShader: TERRAIN_VERTEX_SHADER,
	      fragmentShader: TERRAIN_FRAGMENT_SHADER
	    }));
	    if (tiles.length === 0) return;
	    for (const [chunkKey, chunkTiles] of groupTilesByWorldChunk(tiles)) {
	      if (this.chunkRecords.has(`land:${chunkKey}`)) continue;
	      const geometry = new three.InstancedBufferGeometry();
	      const mesh = new three.Mesh(geometry, this.landMaterial);
	      const origin = getWorldChunkOrigin(chunkKey, this.options.size);
	      mesh.position.set(origin.x, 0, origin.y);
	      mesh.onBeforeRender = (_renderer, _scene, _camera, _geometry, material) => {
	        const shader = material;
	        shader.uniforms.chunkOrigin.value.set(origin.x, origin.y);
	        shader.uniformsNeedUpdate = true;
	      };
	      mesh.name = `terrain-chunk-land-${chunkKey}`;
	      mesh.frustumCulled = false;
	      tagWorldChunk(
	        mesh,
	        chunkKey,
	        "land",
	        localizeWorldChunkBounds(
	          getWorldChunkBounds(chunkTiles, this.options.size, -this.options.size * 2, this.options.size * 3),
	          origin
	        )
	      );
	      chunkTiles.forEach((tile, index) => this.tileIndex.set(`${tile.x},${tile.y}`, { mesh, index }));
	      this.chunkRecords.set(`land:${chunkKey}`, {
	        mesh,
	        tiles: chunkTiles,
	        layer: "land",
	        lodGeometries: /* @__PURE__ */ new Map()
	      });
	      this.landChunks.push(mesh);
	      this.add(mesh);
	    }
	  }
	  //Water tiles get a subdivided geometry (more vertices than the flat land
	  //hex) so the sum-of-sines wave displacement in water.vertex.ts has enough
	  //resolution to look like a smooth, rounded surface instead of a faceted tent.
	  buildWaterLayer(tiles) {
	    this.waterMaterial ?? (this.waterMaterial = new three.RawShaderMaterial({
	      uniforms: {
	        worldOffset: { value: new three.Vector2(0, 0) },
	        cameraWorldOffset: { value: new three.Vector2(0, 0) },
	        uTime: { value: 0 },
	        waveAmplitude: { value: this.options.waterWaveAmplitude ?? 1.6 },
	        waveFrequency: { value: 0.045 * (this.options.waterWaveFrequency ?? 1) },
	        waveSpeed: { value: this.options.waterWaveSpeed ?? 1 },
	        sparkleIntensity: { value: this.options.waterSparkleIntensity ?? 1 },
	        fresnelIntensity: { value: this.options.waterFresnelIntensity ?? 1 },
	        foamEnabled: { value: this.options.coastalWavesEnabled ?? true ? 1 : 0 },
	        foamColor: { value: new three.Color(this.options.coastalWaveColor ?? 16777215) },
	        foamCount: { value: this.options.coastalWaveCount ?? 3 },
	        foamSpeed: { value: this.options.coastalWaveSpeed ?? 0.6 },
	        foamWidth: { value: this.options.coastalWaveWidth ?? 0.3 },
	        foamRange: { value: this.options.coastalWaveRange ?? 0.8 },
	        foamDistortion: { value: this.options.coastalWaveDistortion ?? 0.5 },
	        foamOpacity: { value: this.options.coastalWaveOpacity ?? 0.85 },
	        waterColorDeep: { value: this.waterDeep },
	        waterColorShallow: { value: this.waterShallow },
	        ...this.commonUniforms()
	      },
	      vertexShader: WATER_VERTEX_SHADER,
	      fragmentShader: WATER_FRAGMENT_SHADER
	    }));
	    if (tiles.length === 0) return;
	    for (const [chunkKey, chunkTiles] of groupTilesByWorldChunk(tiles)) {
	      if (this.chunkRecords.has(`water:${chunkKey}`)) continue;
	      const geometry = new three.InstancedBufferGeometry();
	      const mesh = new three.Mesh(geometry, this.waterMaterial);
	      const origin = getWorldChunkOrigin(chunkKey, this.options.size);
	      mesh.position.set(origin.x, 0, origin.y);
	      mesh.onBeforeRender = (_renderer, _scene, _camera, _geometry, material) => {
	        const shader = material;
	        shader.uniforms.chunkOrigin.value.set(origin.x, origin.y);
	        shader.uniformsNeedUpdate = true;
	      };
	      mesh.name = `terrain-chunk-water-${chunkKey}`;
	      mesh.frustumCulled = false;
	      tagWorldChunk(
	        mesh,
	        chunkKey,
	        "water",
	        localizeWorldChunkBounds(
	          getWorldChunkBounds(chunkTiles, this.options.size, -this.options.size * 2, this.options.size),
	          origin
	        )
	      );
	      chunkTiles.forEach((tile, index) => this.waterTileIndex.set(`${tile.x},${tile.y}`, { mesh, index }));
	      this.chunkRecords.set(`water:${chunkKey}`, {
	        mesh,
	        tiles: chunkTiles,
	        layer: "water",
	        lodGeometries: /* @__PURE__ */ new Map()
	      });
	      this.waterChunks.push(mesh);
	      this.add(mesh);
	    }
	  }
	  //Places a 3D model + text label on every tile.city (TileInfo.city, see
	  //interfaces.ts) - independent of terrain type, so a city can sit on any
	  //land tile instead of being tied to a specific Land value. The model
	  //comes from the tile's own data if present (city.model), falling back to
	  //the map-wide cityModel option - a map can mix different models (e.g. a
	  //capital vs. a village) purely through its own JSON, no code changes
	  //required. Each model's own offset/rotation/scale fine-tuning lives in its
	  //folder's info.json (see helpers/models.ts's fixup matrix), not here -
	  //cityScale only applies an *additional* map-wide multiplier on top of that.
	  //
	  //Async because loading a glTF model is async (see helpers/models.ts) -
	  //called by HexMap.loadWorld() after construction, not from the constructor,
	  //so callers can await it if they need cities present before proceeding.
	  async loadCities(onlyTiles, owner) {
	    const { size } = this.options;
	    const defaultModel = this.options.cityModel ?? "Assets/models/monument";
	    const cityScale = this.options.cityScale ?? 1;
	    const cityTiles = [];
	    if (onlyTiles) {
	      for (const point of onlyTiles) {
	        if (getMapTile(this.map, point.x, point.y)?.city) cityTiles.push(point);
	      }
	    } else {
	      forEachMapTile(this.map, (tile, x, y) => {
	        if (tile.city) cityTiles.push({ x, y });
	      });
	    }
	    for (const { x, y } of cityTiles) {
	      const tile = getMapTile(this.map, x, y);
	      const key = `${x},${y}`;
	      if (!tile?.city) continue;
	      const existing = this.cityFog.get(key);
	      if (existing) {
	        existing.owner = owner;
	        continue;
	      }
	      const center = getHexCenter(x, y, size);
	      const modelPath = tile.city.model ?? defaultModel;
	      const { scene, fixup } = await loadModel(modelPath);
	      const loadedByAnotherRequest = this.cityFog.get(key);
	      if (loadedByAnotherRequest) {
	        loadedByAnotherRequest.owner = owner;
	        continue;
	      }
	      const model = scene.clone(true);
	      model.applyMatrix4(fixup);
	      model.updateMatrixWorld(true);
	      const cityMaterials = [];
	      model.traverse((o) => {
	        const mesh = o;
	        if (!mesh.isMesh) return;
	        const sourceMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
	        const clonedMaterials = sourceMaterials.map((material) => material.clone());
	        mesh.material = Array.isArray(mesh.material) ? clonedMaterials : clonedMaterials[0];
	        for (const material of clonedMaterials) {
	          const colored = material;
	          cityMaterials.push({ material: colored, baseColor: colored.color?.clone() });
	        }
	      });
	      const box = new three.Box3().setFromObject(model);
	      const modelHeight = box.getSize(new three.Vector3()).y;
	      const wrapper = new three.Group();
	      wrapper.add(model);
	      wrapper.scale.setScalar(cityScale);
	      wrapper.position.set(center.x, 0, center.y);
	      wrapper.userData[CITY_FOG_TILE_KEY] = key;
	      this.add(wrapper);
	      const sprite = makeTextSprite(` ${tile.city.name ?? "City"} `, {
	        fontsize: 32,
	        fontface: "Georgia",
	        borderColor: { r: 0, g: 0, b: 255, a: 0.8 }
	      });
	      sprite.position.set(center.x, modelHeight * cityScale + Math.round(size / 5), center.y);
	      sprite.userData[CITY_FOG_TILE_KEY] = key;
	      this.add(sprite);
	      this.cityFog.set(key, { wrapper, sprite, materials: cityMaterials, owner });
	    }
	  }
	  //Adds render shells for newly materialized sparse-world cells. Actual GPU
	  //attributes remain lazy and are built by activateChunk() when visible.
	  addTiles(tiles) {
	    const landTiles = [];
	    const waterTiles = [];
	    for (const point of tiles) {
	      const tile = getMapTile(this.map, point.x, point.y);
	      if (!tile) continue;
	      (WATER_TYPES.includes(tile.type) ? waterTiles : landTiles).push(point);
	    }
	    this.buildLandLayer(landTiles);
	    this.buildWaterLayer(waterTiles);
	  }
	  //Removes every render chunk touched by these cells. Streaming generation
	  //chunks are aligned to WORLD_CHUNK_SIZE, so a render chunk is never shared
	  //between two independently resident generation chunks.
	  removeTiles(tiles, removeCities = true, cityOwner) {
	    const chunkKeys = new Set(groupTilesByWorldChunk(tiles).keys());
	    const removedIds = [];
	    for (const chunkKey of chunkKeys) {
	      for (const layer of ["land", "water"]) {
	        const id = `${layer}:${chunkKey}`;
	        const record = this.chunkRecords.get(id);
	        if (!record) continue;
	        this.disposeChunkGeometries(record);
	        this.remove(record.mesh);
	        this.chunkRecords.delete(id);
	        const collection = layer === "land" ? this.landChunks : this.waterChunks;
	        const index = collection.indexOf(record.mesh);
	        if (index >= 0) collection.splice(index, 1);
	        const tileIndex = layer === "land" ? this.tileIndex : this.waterTileIndex;
	        for (const point of record.tiles) tileIndex.delete(`${point.x},${point.y}`);
	        removedIds.push(id);
	      }
	    }
	    for (const point of tiles) this.fogStates.delete(`${point.x},${point.y}`);
	    if (removeCities) this.removeCities(tiles, cityOwner);
	    return removedIds;
	  }
	  removeCities(tiles, owner) {
	    for (const point of tiles) this.removeCity(`${point.x},${point.y}`, owner);
	  }
	  removeCity(key, owner) {
	    const entry = this.cityFog.get(key);
	    if (!entry || owner !== void 0 && entry.owner !== owner) return;
	    this.remove(entry.wrapper);
	    this.remove(entry.sprite);
	    for (const { material } of entry.materials) material.dispose();
	    entry.sprite.material.map?.dispose();
	    entry.sprite.material.dispose();
	    this.cityFog.delete(key);
	  }
	  //Advances the water/river animation. `dtS` is the elapsed time in seconds
	  //since the previous frame - call this once per frame (see HexMap's render
	  //loop). The land material's clock drives river ripples (terrain.fragment.ts).
	  update(dtS) {
	    this.clock += dtS;
	    if (this.waterMaterial) this.waterMaterial.uniforms.uTime.value = this.clock;
	    if (this.landMaterial) this.landMaterial.uniforms.uTime.value = this.clock;
	  }
	  setWorldCenter(x, y) {
	    this.landMaterial?.uniforms.worldCenter.value.set(x, y);
	    this.waterMaterial?.uniforms.worldCenter.value.set(x, y);
	  }
	  setCameraWorldOffset(x, y) {
	    this.waterMaterial?.uniforms.cameraWorldOffset.value.set(x, y);
	  }
	  //Near terrain keeps the original subdivision counts (land 3 / water 2).
	  //Only interior vertices are reduced at middle/far distances; full-detail
	  //rim tessellation remains identical, so adjacent chunks cannot open cracks.
	  activateChunk(metadata, lod) {
	    const record = this.chunkRecords.get(metadata.id);
	    if (!record) return void 0;
	    if (record.lod === lod && record.mesh.geometry.getAttribute("position")) return record.mesh.geometry;
	    let geometry = record.lodGeometries.get(lod);
	    if (!geometry) {
	      record.attributes ?? (record.attributes = this.buildInstanceAttributes(
	        record.tiles,
	        { x: record.mesh.position.x, y: record.mesh.position.z }
	      ));
	      const subdivisions = record.layer === "land" ? [3, 2, 1][lod] : [2, 1, 0][lod];
	      const borderSubdivisions = record.layer === "land" ? 3 : 2;
	      geometry = this.buildInstancedGeometry(
	        record.tiles,
	        subdivisions,
	        borderSubdivisions,
	        { x: record.mesh.position.x, y: record.mesh.position.z },
	        record.attributes
	      );
	      record.lodGeometries.set(lod, geometry);
	      this.lodBuilds += 1;
	    }
	    const previous = record.mesh.geometry;
	    record.mesh.geometry = geometry;
	    if (record.lod === void 0 && !previous.getAttribute("position")) previous.dispose();
	    record.lod = lod;
	    return geometry;
	  }
	  releaseChunk(metadata) {
	    const record = this.chunkRecords.get(metadata.id);
	    if (!record || record.lod === void 0) return;
	    this.disposeChunkGeometries(record);
	    record.mesh.geometry = new three.InstancedBufferGeometry();
	    record.attributes = void 0;
	    record.lod = void 0;
	  }
	  get lodBuildCount() {
	    return this.lodBuilds;
	  }
	  disposeChunkGeometries(record) {
	    const geometries = /* @__PURE__ */ new Set([record.mesh.geometry, ...record.lodGeometries.values()]);
	    for (const geometry of geometries) geometry.dispose();
	    record.lodGeometries.clear();
	  }
	  get gridVisible() {
	    return (this.landMaterial ?? this.waterMaterial)?.uniforms.showGrid.value > 0;
	  }
	  set gridVisible(value) {
	    const v = value ? 1 : 0;
	    if (this.landMaterial) this.landMaterial.uniforms.showGrid.value = v;
	    if (this.waterMaterial) this.waterMaterial.uniforms.showGrid.value = v;
	  }
	  //-------------------------------------------------------------------------
	  //Live shader-uniform tuning knobs, for a GUI to adjust without rebuilding
	  //the map.
	  //beachWidth/waterDepth exist as separate uniform objects on landMaterial
	  //and waterMaterial each (commonUniforms() is called once per material, not
	  //shared), so both setters below write to both.
	  //-------------------------------------------------------------------------
	  get landBlendWidth() {
	    return this.landMaterial?.uniforms.landBlendWidth.value ?? 0.5;
	  }
	  set landBlendWidth(value) {
	    if (this.landMaterial) this.landMaterial.uniforms.landBlendWidth.value = value;
	  }
	  //River channel knobs - all live uniforms on the land material (rivers are
	  //drawn by the land layer's shaders).
	  get riverWidth() {
	    return this.landMaterial?.uniforms.riverWidth.value ?? 0.28;
	  }
	  set riverWidth(value) {
	    if (this.landMaterial) this.landMaterial.uniforms.riverWidth.value = value;
	  }
	  get riverBankWidth() {
	    return this.landMaterial?.uniforms.riverBankWidth.value ?? 0.14;
	  }
	  set riverBankWidth(value) {
	    if (this.landMaterial) this.landMaterial.uniforms.riverBankWidth.value = value;
	  }
	  get riverCurvature() {
	    return this.landMaterial?.uniforms.riverCurvature.value ?? 0.5;
	  }
	  set riverCurvature(value) {
	    if (this.landMaterial) this.landMaterial.uniforms.riverCurvature.value = value;
	  }
	  get riverColorShallow() {
	    return this.landMaterial?.uniforms.riverColorShallow.value?.getHex() ?? 0;
	  }
	  set riverColorShallow(value) {
	    this.landMaterial?.uniforms.riverColorShallow.value?.set(value);
	  }
	  get riverColorDeep() {
	    return this.landMaterial?.uniforms.riverColorDeep.value?.getHex() ?? 0;
	  }
	  set riverColorDeep(value) {
	    this.landMaterial?.uniforms.riverColorDeep.value?.set(value);
	  }
	  get riverBankColor() {
	    return this.landMaterial?.uniforms.riverBankColor.value?.getHex() ?? 11059050;
	  }
	  set riverBankColor(value) {
	    this.landMaterial?.uniforms.riverBankColor.value?.set(value);
	  }
	  get riverFlowSpeed() {
	    return this.landMaterial?.uniforms.riverFlowSpeed.value ?? 1;
	  }
	  set riverFlowSpeed(value) {
	    if (this.landMaterial) this.landMaterial.uniforms.riverFlowSpeed.value = value;
	  }
	  get riverDepth() {
	    return this.landMaterial?.uniforms.riverDepth.value ?? this.options.size * 0.15;
	  }
	  set riverDepth(value) {
	    if (this.landMaterial) this.landMaterial.uniforms.riverDepth.value = value;
	  }
	  get lakeShoreWidth() {
	    return this.landMaterial?.uniforms.lakeShoreWidth.value ?? 0.18;
	  }
	  set lakeShoreWidth(value) {
	    if (this.landMaterial) this.landMaterial.uniforms.lakeShoreWidth.value = value;
	  }
	  //Both materials carry this one now (commonUniforms) - the land layer's
	  //curved-coast field uses the same corner rounding as the water layer's.
	  get waterCornerRounding() {
	    return (this.waterMaterial ?? this.landMaterial)?.uniforms.waterCornerRounding.value ?? 0.4;
	  }
	  set waterCornerRounding(value) {
	    if (this.landMaterial) this.landMaterial.uniforms.waterCornerRounding.value = value;
	    if (this.waterMaterial) this.waterMaterial.uniforms.waterCornerRounding.value = value;
	  }
	  //Curved-coastline strength - a commonUniforms member, so write both.
	  get coastCurvature() {
	    return (this.landMaterial ?? this.waterMaterial)?.uniforms.coastCurvature.value ?? 0.5;
	  }
	  set coastCurvature(value) {
	    if (this.landMaterial) this.landMaterial.uniforms.coastCurvature.value = value;
	    if (this.waterMaterial) this.waterMaterial.uniforms.coastCurvature.value = value;
	  }
	  get landBlendCurvature() {
	    return this.landMaterial?.uniforms.landBlendCurvature.value ?? 0.5;
	  }
	  set landBlendCurvature(value) {
	    if (this.landMaterial) this.landMaterial.uniforms.landBlendCurvature.value = value;
	  }
	  get mountainHeight() {
	    return this.landMaterial?.uniforms.mountainHeight.value ?? this.options.size * 0.6;
	  }
	  set mountainHeight(value) {
	    if (this.landMaterial) this.landMaterial.uniforms.mountainHeight.value = value;
	  }
	  get beachWidth() {
	    return this.landMaterial?.uniforms.beachWidth.value ?? this.waterMaterial?.uniforms.beachWidth.value ?? 0.35;
	  }
	  set beachWidth(value) {
	    if (this.landMaterial) this.landMaterial.uniforms.beachWidth.value = value;
	    if (this.waterMaterial) this.waterMaterial.uniforms.beachWidth.value = value;
	  }
	  //waterLevel uniform is negative (rest height below land); exposed here as
	  //a positive "depth" to match the waterDepth constructor option's sign.
	  get waterDepth() {
	    const level = this.landMaterial?.uniforms.waterLevel.value ?? this.waterMaterial?.uniforms.waterLevel.value;
	    return level === void 0 ? this.options.size * 0.25 : -level;
	  }
	  set waterDepth(value) {
	    const level = -value;
	    if (this.landMaterial) this.landMaterial.uniforms.waterLevel.value = level;
	    if (this.waterMaterial) this.waterMaterial.uniforms.waterLevel.value = level;
	  }
	  get waterWaveAmplitude() {
	    return this.waterMaterial?.uniforms.waveAmplitude.value ?? 1.6;
	  }
	  set waterWaveAmplitude(value) {
	    if (this.waterMaterial) this.waterMaterial.uniforms.waveAmplitude.value = value;
	  }
	  //The stored uniform is pre-scaled by 0.045 (see buildWaterLayer) so the
	  //raw shader frequency stays in a sane range - getter/setter work in the
	  //same "multiplier" units as the constructor option so callers don't need
	  //to know about that factor.
	  get waterWaveFrequency() {
	    return (this.waterMaterial?.uniforms.waveFrequency.value ?? 0.045) / 0.045;
	  }
	  set waterWaveFrequency(value) {
	    if (this.waterMaterial) this.waterMaterial.uniforms.waveFrequency.value = 0.045 * value;
	  }
	  get waterWaveSpeed() {
	    return this.waterMaterial?.uniforms.waveSpeed.value ?? 1;
	  }
	  set waterWaveSpeed(value) {
	    if (this.waterMaterial) this.waterMaterial.uniforms.waveSpeed.value = value;
	  }
	  get waterSparkleIntensity() {
	    return this.waterMaterial?.uniforms.sparkleIntensity.value ?? 1;
	  }
	  set waterSparkleIntensity(value) {
	    if (this.waterMaterial) this.waterMaterial.uniforms.sparkleIntensity.value = value;
	  }
	  get waterFresnelIntensity() {
	    return this.waterMaterial?.uniforms.fresnelIntensity.value ?? 1;
	  }
	  set waterFresnelIntensity(value) {
	    if (this.waterMaterial) this.waterMaterial.uniforms.fresnelIntensity.value = value;
	  }
	  //Mutates the shared Color instances (see their field comment), so the
	  //water layer AND the land layer's painted curved-coast water update
	  //together - no per-material bookkeeping.
	  get waterColorShallow() {
	    return this.waterShallow.getHex();
	  }
	  set waterColorShallow(value) {
	    this.waterShallow.set(value);
	  }
	  get waterColorDeep() {
	    return this.waterDeep.getHex();
	  }
	  set waterColorDeep(value) {
	    this.waterDeep.set(value);
	  }
	  //Coastal foam waves - all plain uniforms on the water material, so
	  //toggling/tuning is live. The land material mirrors these for the small
	  //shader-painted water strips on curved coastal land tiles.
	  get coastalWavesEnabled() {
	    return ((this.waterMaterial ?? this.landMaterial)?.uniforms.foamEnabled.value ?? 1) > 0.5;
	  }
	  set coastalWavesEnabled(value) {
	    const v = value ? 1 : 0;
	    if (this.waterMaterial) this.waterMaterial.uniforms.foamEnabled.value = v;
	    if (this.landMaterial) this.landMaterial.uniforms.foamEnabled.value = v;
	  }
	  get coastalWaveColor() {
	    return (this.waterMaterial ?? this.landMaterial)?.uniforms.foamColor.value?.getHex() ?? 16777215;
	  }
	  set coastalWaveColor(value) {
	    this.waterMaterial?.uniforms.foamColor.value?.set(value);
	    this.landMaterial?.uniforms.foamColor.value?.set(value);
	  }
	  get coastalWaveCount() {
	    return (this.waterMaterial ?? this.landMaterial)?.uniforms.foamCount.value ?? 3;
	  }
	  set coastalWaveCount(value) {
	    if (this.waterMaterial) this.waterMaterial.uniforms.foamCount.value = value;
	    if (this.landMaterial) this.landMaterial.uniforms.foamCount.value = value;
	  }
	  get coastalWaveSpeed() {
	    return (this.waterMaterial ?? this.landMaterial)?.uniforms.foamSpeed.value ?? 0.6;
	  }
	  set coastalWaveSpeed(value) {
	    if (this.waterMaterial) this.waterMaterial.uniforms.foamSpeed.value = value;
	    if (this.landMaterial) this.landMaterial.uniforms.foamSpeed.value = value;
	  }
	  get coastalWaveWidth() {
	    return (this.waterMaterial ?? this.landMaterial)?.uniforms.foamWidth.value ?? 0.3;
	  }
	  set coastalWaveWidth(value) {
	    if (this.waterMaterial) this.waterMaterial.uniforms.foamWidth.value = value;
	    if (this.landMaterial) this.landMaterial.uniforms.foamWidth.value = value;
	  }
	  get coastalWaveRange() {
	    return (this.waterMaterial ?? this.landMaterial)?.uniforms.foamRange.value ?? 0.8;
	  }
	  set coastalWaveRange(value) {
	    if (this.waterMaterial) this.waterMaterial.uniforms.foamRange.value = value;
	    if (this.landMaterial) this.landMaterial.uniforms.foamRange.value = value;
	  }
	  get coastalWaveDistortion() {
	    return (this.waterMaterial ?? this.landMaterial)?.uniforms.foamDistortion.value ?? 0.5;
	  }
	  set coastalWaveDistortion(value) {
	    if (this.waterMaterial) this.waterMaterial.uniforms.foamDistortion.value = value;
	    if (this.landMaterial) this.landMaterial.uniforms.foamDistortion.value = value;
	  }
	  get coastalWaveOpacity() {
	    return (this.waterMaterial ?? this.landMaterial)?.uniforms.foamOpacity.value ?? 0.85;
	  }
	  set coastalWaveOpacity(value) {
	    if (this.waterMaterial) this.waterMaterial.uniforms.foamOpacity.value = value;
	    if (this.landMaterial) this.landMaterial.uniforms.foamOpacity.value = value;
	  }
	  //Index of a tile within the land layer's instanced attributes, for future
	  //point updates (e.g. HexMap.setTile) without rebuilding the whole geometry.
	  getInstanceIndex(x, y) {
	    return this.tileIndex.get(`${x},${y}`)?.index;
	  }
	  //-------------------------------------------------------------------------
	  //Fog of war (see FogOfWar.ts) - updates one tile's terrain (land or water,
	  //whichever layer it's actually on) and its city model/label (if any) to
	  //the given state. Plain per-instance attribute writes, no rebuild.
	  //-------------------------------------------------------------------------
	  setFogState(x, y, state) {
	    const key = `${x},${y}`;
	    this.fogStates.set(key, state);
	    const landEntry = this.tileIndex.get(key);
	    if (landEntry) {
	      const attribute = landEntry.mesh.geometry.getAttribute("fogState");
	      if (attribute) {
	        attribute.setX(landEntry.index, state);
	        attribute.addUpdateRange(landEntry.index, 1);
	        attribute.needsUpdate = true;
	      }
	    }
	    const waterEntry = this.waterTileIndex.get(key);
	    if (waterEntry) {
	      const attribute = waterEntry.mesh.geometry.getAttribute("fogState");
	      if (attribute) {
	        attribute.setX(waterEntry.index, state);
	        attribute.addUpdateRange(waterEntry.index, 1);
	        attribute.needsUpdate = true;
	      }
	    }
	    this.setCityFog(key, state);
	  }
	  setCityFog(key, state) {
	    const entry = this.cityFog.get(key);
	    if (!entry) return;
	    const hidden = state < 0.5;
	    entry.wrapper.visible = !hidden;
	    entry.sprite.visible = !hidden;
	    if (hidden) return;
	    const shade = state < 1.5 ? this.options.fogDarkenFactor ?? 0.45 : 1;
	    for (const { material, baseColor } of entry.materials) {
	      if (material.color && baseColor) material.color.copy(baseColor).multiplyScalar(shade);
	    }
	  }
	  get mesh() {
	    return this.landChunks[0];
	  }
	  //Releases the land/water geometries, materials and atlas texture. City
	  //Model geometry remains shared with loadModel()'s cache. Per-city cloned
	  //materials and canvas label textures are owned here and released below.
	  dispose() {
	    for (const record of this.chunkRecords.values()) this.disposeChunkGeometries(record);
	    this.landMaterial?.dispose();
	    this.waterMaterial?.dispose();
	    this.atlasTexture.dispose();
	    this.fogTexture.dispose();
	    for (const entry of this.cityFog.values()) {
	      for (const { material } of entry.materials) material.dispose();
	      entry.sprite.material.map?.dispose();
	      entry.sprite.material.dispose();
	    }
	    this.cityFog.clear();
	  }
	};

	// src/helpers/coast.ts
	var DIRS = {
	  SE: { x: 0.8660254, y: 0.5 },
	  S: { x: 0, y: 1 },
	  SW: { x: -0.8660254, y: 0.5 },
	  NW: { x: -0.8660254, y: -0.5 },
	  N: { x: 0, y: -1 },
	  NE: { x: 0.8660254, y: -0.5 }
	};
	var COAST_DIRECTIONS = ["SE", "S", "SW", "NW", "N", "NE"];
	function clamp(value, min, max) {
	  return Math.min(max, Math.max(min, value));
	}
	function fract(value) {
	  return value - Math.floor(value);
	}
	function mix(a, b, t) {
	  return a * (1 - t) + b * t;
	}
	function hash21(x, y) {
	  return fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453123);
	}
	function valueNoise(x, y) {
	  const ix = Math.floor(x);
	  const iy = Math.floor(y);
	  const fx = fract(x);
	  const fy = fract(y);
	  const ux = fx * fx * (3 - 2 * fx);
	  const uy = fy * fy * (3 - 2 * fy);
	  return mix(
	    mix(hash21(ix, iy), hash21(ix + 1, iy), ux),
	    mix(hash21(ix, iy + 1), hash21(ix + 1, iy + 1), ux),
	    uy
	  );
	}
	function isWater(tile) {
	  return tile?.type === "sea" /* sea */ || tile?.type === "coastal" /* coastal */;
	}
	function isLake(tile) {
	  return !!tile?.modifiers?.includes("lake");
	}
	function roundedCorner(isWaterA, isWaterB, dA, dB, waterCornerRounding) {
	  if (!isWaterA || !isWaterB) return -1;
	  return mix(Math.max(dA, dB), Math.hypot(dA, dB), clamp(waterCornerRounding, 0, 1));
	}
	function isInCoastalShore(map, tileX, tileY, localX, localY, worldX, worldY, size, options = {}) {
	  const tile = getMapTile(map, tileX, tileY);
	  if (!tile || isWater(tile)) return true;
	  const apothem = size * 0.8660254;
	  const waterByDirection = /* @__PURE__ */ new Map();
	  const factorByDirection = /* @__PURE__ */ new Map();
	  for (const direction of COAST_DIRECTIONS) {
	    const neighbor = getNeighborCoords(tileX, tileY, direction);
	    waterByDirection.set(direction, isWater(getMapTile(map, neighbor.x, neighbor.y)));
	    const dir = DIRS[direction];
	    factorByDirection.set(direction, (localX * dir.x + localY * dir.y) / apothem);
	  }
	  let coast = 0;
	  for (const direction of COAST_DIRECTIONS) {
	    const factor = factorByDirection.get(direction) ?? 0;
	    if (waterByDirection.get(direction) && factor > coast) coast = factor;
	  }
	  if (coast <= 0) return false;
	  const waterCornerRounding = options.waterCornerRounding ?? 0.4;
	  for (let i = 0; i < COAST_DIRECTIONS.length; i++) {
	    const a = COAST_DIRECTIONS[i];
	    const b = COAST_DIRECTIONS[(i + 1) % COAST_DIRECTIONS.length];
	    coast = Math.max(
	      coast,
	      roundedCorner(
	        waterByDirection.get(a) ?? false,
	        waterByDirection.get(b) ?? false,
	        Math.max(factorByDirection.get(a) ?? 0, 0),
	        Math.max(factorByDirection.get(b) ?? 0, 0),
	        waterCornerRounding
	      )
	    );
	  }
	  const coastCurvature = options.coastCurvature ?? 0.5;
	  const coarse = valueNoise(worldX * (1.3 / size), worldY * (1.3 / size));
	  const fine = valueNoise(worldX * (3.2 / size), worldY * (3.2 / size));
	  const curvedCoast = coast + (0.6 * coarse + 0.4 * fine) * coastCurvature * 0.5;
	  const beachStart = 1 - clamp(options.beachWidth ?? 0.35, 1e-3, 1) * 0.5;
	  return curvedCoast >= beachStart;
	}
	function isInLakeShore(map, tileX, tileY, localX, localY, worldX, worldY, size, options = {}) {
	  const tile = getMapTile(map, tileX, tileY);
	  if (!tile || isLake(tile)) return true;
	  const apothem = size * 0.8660254;
	  const lakeByDirection = /* @__PURE__ */ new Map();
	  const factorByDirection = /* @__PURE__ */ new Map();
	  for (const direction of COAST_DIRECTIONS) {
	    const neighbor = getNeighborCoords(tileX, tileY, direction);
	    lakeByDirection.set(direction, isLake(getMapTile(map, neighbor.x, neighbor.y)));
	    const dir = DIRS[direction];
	    factorByDirection.set(direction, (localX * dir.x + localY * dir.y) / apothem);
	  }
	  let lakeField = 0;
	  for (const direction of COAST_DIRECTIONS) {
	    const factor = factorByDirection.get(direction) ?? 0;
	    if (lakeByDirection.get(direction) && factor > lakeField) lakeField = factor;
	  }
	  if (lakeField <= 0) return false;
	  const waterCornerRounding = options.waterCornerRounding ?? 0.4;
	  for (let i = 0; i < COAST_DIRECTIONS.length; i++) {
	    const a = COAST_DIRECTIONS[i];
	    const b = COAST_DIRECTIONS[(i + 1) % COAST_DIRECTIONS.length];
	    lakeField = Math.max(
	      lakeField,
	      roundedCorner(
	        lakeByDirection.get(a) ?? false,
	        lakeByDirection.get(b) ?? false,
	        Math.max(factorByDirection.get(a) ?? 0, 0),
	        Math.max(factorByDirection.get(b) ?? 0, 0),
	        waterCornerRounding
	      )
	    );
	  }
	  const coastCurvature = options.coastCurvature ?? 0.5;
	  const coarse = valueNoise(worldX * (1.3 / size), worldY * (1.3 / size));
	  const fine = valueNoise(worldX * (3.2 / size), worldY * (3.2 / size));
	  const curvedLake = lakeField + (0.6 * coarse + 0.4 * fine) * coastCurvature * 0.5;
	  const shoreStart = 1 - clamp(options.lakeShoreWidth ?? 0.18, 1e-3, 1);
	  return curvedLake >= shoreStart;
	}

	// src/objects/Forest.ts
	var ForestSharedResources = class {
	  constructor() {
	    this.models = /* @__PURE__ */ new Map();
	    this.geometries = /* @__PURE__ */ new Set();
	    this.disposed = false;
	  }
	  prepare(modelPath) {
	    if (this.disposed) return Promise.reject(new Error("ForestSharedResources has been disposed"));
	    let pending = this.models.get(modelPath);
	    if (!pending) {
	      pending = loadModel(modelPath).then(({ scene, fixup }) => {
	        const meshes = [];
	        scene.traverse((object) => {
	          if (object.isMesh) meshes.push(object);
	        });
	        const parts = meshes.map((mesh) => {
	          const geometry = mesh.geometry.clone();
	          geometry.applyMatrix4(mesh.matrixWorld);
	          geometry.applyMatrix4(fixup);
	          this.geometries.add(geometry);
	          return { geometry, material: mesh.material };
	        });
	        if (this.disposed) {
	          for (const part of parts) part.geometry.dispose();
	          throw new Error("ForestSharedResources was disposed while loading a model");
	        }
	        return parts;
	      }).catch((reason) => {
	        this.models.delete(modelPath);
	        throw reason;
	      });
	      this.models.set(modelPath, pending);
	    }
	    return pending;
	  }
	  get preparedModelCount() {
	    return this.models.size;
	  }
	  get preparedGeometryCount() {
	    return this.geometries.size;
	  }
	  dispose() {
	    if (this.disposed) return;
	    this.disposed = true;
	    for (const geometry of this.geometries) geometry.dispose();
	    this.geometries.clear();
	    this.models.clear();
	  }
	};
	var ForestField = class extends three.Group {
	  constructor(tileRanges, fogDarkenFactor, chunks, context, resources, ownsResources) {
	    super();
	    this.tileRanges = tileRanges;
	    this.fogDarkenFactor = fogDarkenFactor;
	    this.chunks = chunks;
	    this.context = context;
	    this.resources = resources;
	    this.ownsResources = ownsResources;
	    this.hiddenMatrix = new three.Matrix4().makeScale(0, 0, 0);
	    this.fogStates = /* @__PURE__ */ new Map();
	    this.lodBuilds = 0;
	    for (const record of chunks.values()) this.add(record.root);
	  }
	  setFogState(x, y, state) {
	    const key = `${x},${y}`;
	    this.fogStates.set(key, state);
	    const range = this.tileRanges.get(key);
	    if (!range) return;
	    const hidden = state < 0.5;
	    const shade = state < 1.5 ? this.fogDarkenFactor : 1;
	    for (const instancedMesh of range.instancedMeshes) {
	      for (let i = 0; i < range.count; i++) {
	        const idx = range.start + i;
	        instancedMesh.setMatrixAt(idx, hidden ? this.hiddenMatrix : range.originalMatrices[i]);
	        instancedMesh.instanceColor?.setXYZ(idx, shade, shade, shade);
	      }
	      instancedMesh.instanceMatrix.addUpdateRange(range.start * 16, range.count * 16);
	      instancedMesh.instanceMatrix.needsUpdate = true;
	      if (instancedMesh.instanceColor) {
	        instancedMesh.instanceColor.addUpdateRange(range.start * 3, range.count * 3);
	        instancedMesh.instanceColor.needsUpdate = true;
	      }
	    }
	  }
	  activateChunk(metadata, lod, objects) {
	    const record = this.chunks.get(metadata.id);
	    if (!record) return;
	    if (record.lod !== lod) {
	      let cached = record.lodCache.get(lod);
	      if (!cached) {
	        cached = this.buildChunkLod(record, lod);
	        record.lodCache.set(lod, cached);
	        this.lodBuilds += 1;
	      }
	      this.applyChunkLod(record, cached);
	      record.lod = lod;
	    }
	    for (const object of objects) {
	      const copies = [];
	      object.traverse((child) => {
	        if (child.isInstancedMesh) copies.push(child);
	      });
	      copies.forEach((copy, index) => {
	        const source = record.instancedMeshes[index];
	        if (source) copy.count = source.count;
	      });
	    }
	  }
	  releaseChunk(metadata) {
	    const record = this.chunks.get(metadata.id);
	    if (!record || record.lod === void 0) return;
	    for (const tile of record.tiles) this.tileRanges.delete(`${tile.x},${tile.y}`);
	    for (const mesh of record.instancedMeshes) mesh.count = 0;
	    record.lodCache.clear();
	    record.lod = void 0;
	  }
	  disposeChunkGpu(metadata) {
	    const record = this.chunks.get(metadata.id);
	    if (!record) return;
	    for (const mesh of record.instancedMeshes) mesh.dispose();
	  }
	  get lodBuildCount() {
	    return this.lodBuilds;
	  }
	  dispose() {
	    for (const record of this.chunks.values()) {
	      for (const mesh of record.instancedMeshes) mesh.dispose();
	    }
	    this.tileRanges.clear();
	    this.chunks.clear();
	    if (this.ownsResources) this.resources.dispose();
	  }
	  buildChunkLod(record, lod) {
	    const {
	      map,
	      size,
	      treesPerTile,
	      treeScale,
	      treeFootprint,
	      polygon,
	      waterOptions,
	      coastOptions
	    } = this.context;
	    const density = Math.max(1, Math.round(treesPerTile * [1, 0.5, 0.2][lod]));
	    const matrix = new three.Matrix4();
	    const scaleVector = new three.Vector3();
	    const ranges = /* @__PURE__ */ new Map();
	    let instance = 0;
	    for (const tile of record.tiles) {
	      const key = `${tile.x},${tile.y}`;
	      const center = getHexCenter(tile.x, tile.y, size);
	      const placed = [];
	      const tileStart = instance;
	      const originalMatrices = [];
	      let attempts = 0;
	      const waterValue = waterEdgeValue(map, tile.x, tile.y);
	      const seaMouthValue = riverSeaMouthEdgeValue(map, tile.x, tile.y);
	      const lakeMouthValue = riverLakeMouthEdgeValue(map, tile.x, tile.y);
	      const lakeNeighborValue = lakeNeighborEdgeValue(map, tile.x, tile.y);
	      while (placed.length < density && attempts < density * 20) {
	        const salt = attempts++ * 17;
	        const lx = (stableRandom(tile.x, tile.y, salt) * 2 - 1) * size;
	        const ly = (stableRandom(tile.x, tile.y, salt + 1) * 2 - 1) * size;
	        if (pointInPolygon2(polygon, [lx, ly]) !== -1) continue;
	        if (isInTileWater(lx, ly, waterValue, size, waterOptions, seaMouthValue, lakeMouthValue, lakeNeighborValue)) continue;
	        if (isInCoastalShore(map, tile.x, tile.y, lx, ly, center.x + lx, center.y + ly, size, coastOptions)) continue;
	        if (isInLakeShore(map, tile.x, tile.y, lx, ly, center.x + lx, center.y + ly, size, coastOptions)) continue;
	        if (placed.some((p) => Math.abs(p.x - lx) < treeFootprint && Math.abs(p.y - ly) < treeFootprint)) continue;
	        placed.push({ x: lx, y: ly });
	        const scale = treeScale * (0.8 + stableRandom(tile.x, tile.y, salt + 3) * 0.4);
	        matrix.makeRotationY(stableRandom(tile.x, tile.y, salt + 5) * Math.PI * 2);
	        matrix.scale(scaleVector.set(scale, scale, scale));
	        matrix.setPosition(
	          center.x + lx - record.root.position.x,
	          0,
	          center.y + ly - record.root.position.z
	        );
	        originalMatrices.push(matrix.clone());
	        instance++;
	      }
	      ranges.set(key, {
	        start: tileStart,
	        count: instance - tileStart,
	        originalMatrices
	      });
	    }
	    return { instanceCount: instance, ranges };
	  }
	  applyChunkLod(record, cached) {
	    for (const tile of record.tiles) this.tileRanges.delete(`${tile.x},${tile.y}`);
	    for (const [key, range] of cached.ranges) {
	      const fogState = this.fogStates.get(key) ?? 2;
	      const shade = fogState < 1.5 ? this.fogDarkenFactor : 1;
	      for (let offset = 0; offset < range.count; offset += 1) {
	        const matrix = fogState < 0.5 ? this.hiddenMatrix : range.originalMatrices[offset];
	        const index = range.start + offset;
	        for (const mesh of record.instancedMeshes) {
	          mesh.setMatrixAt(index, matrix);
	          mesh.instanceColor?.setXYZ(index, shade, shade, shade);
	        }
	      }
	      this.tileRanges.set(key, { instancedMeshes: record.instancedMeshes, ...range });
	    }
	    for (const mesh of record.instancedMeshes) {
	      mesh.count = cached.instanceCount;
	      mesh.instanceMatrix.needsUpdate = true;
	      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
	    }
	  }
	};
	function stableRandom(x, y, salt) {
	  let value = Math.imul(x ^ 2654435769, 2246822507) ^ Math.imul(y ^ 3266489909, 668265263) ^ Math.imul(salt ^ 374761393, 2246822519);
	  value ^= value >>> 16;
	  value = Math.imul(value, 2146121005);
	  value ^= value >>> 15;
	  value = Math.imul(value, 2221713035);
	  value ^= value >>> 16;
	  return (value >>> 0) / 4294967296;
	}
	async function createForest(map, options, onlyTiles, sharedResources) {
	  const { size } = options;
	  const treesPerTile = options.treesPerTile ?? 20;
	  const defaultModel = options.treeModel ?? "Assets/models/pinia";
	  const treeScale = options.treeScale ?? 1;
	  const fogDarkenFactor = options.fogDarkenFactor ?? 0.45;
	  if (treesPerTile <= 0) return null;
	  const tilesByModel = /* @__PURE__ */ new Map();
	  const considerTile = (x, y) => {
	    const tile = getMapTile(map, x, y);
	    if (!tile?.modifiers?.includes("wood") || isLakeTile(tile)) return;
	    const modelPath = tile.treeModel ?? defaultModel;
	    const tiles = tilesByModel.get(modelPath) ?? [];
	    tiles.push({ x, y });
	    tilesByModel.set(modelPath, tiles);
	  };
	  if (onlyTiles) {
	    for (const point of onlyTiles) considerTile(point.x, point.y);
	  } else {
	    forEachMapTile(map, (_tile, x, y) => considerTile(x, y));
	  }
	  if (tilesByModel.size === 0) return null;
	  const treeFootprint = Math.max(1, Math.round(size / 10));
	  const polygon = HEXPolygon({ x: 0, y: 0 }, size - treeFootprint).map((p) => [p.x, p.y]);
	  const waterOptions = {
	    riverWidth: options.riverWidth ?? 0.28,
	    riverBankWidth: options.riverBankWidth ?? 0.14,
	    riverCurvature: options.riverCurvature ?? 0.5,
	    lakeShoreWidth: options.lakeShoreWidth ?? 0.18
	  };
	  const coastOptions = {
	    beachWidth: options.beachWidth ?? 0.35,
	    lakeShoreWidth: options.lakeShoreWidth ?? 0.18,
	    waterCornerRounding: options.waterCornerRounding ?? 0.4,
	    coastCurvature: options.coastCurvature ?? 0.5
	  };
	  const tileRanges = /* @__PURE__ */ new Map();
	  const chunkRecords = /* @__PURE__ */ new Map();
	  const resources = sharedResources ?? new ForestSharedResources();
	  let modelIndex = 0;
	  for (const [modelPath, tiles] of tilesByModel) {
	    const preparedParts = await resources.prepare(modelPath);
	    if (preparedParts.length === 0) continue;
	    const chunks = groupTilesByWorldChunk(tiles);
	    for (const [chunkKey, chunkTiles] of chunks) {
	      const totalInstances = chunkTiles.length * treesPerTile;
	      const root = new three.Group();
	      const origin = getWorldChunkOrigin(chunkKey, size);
	      root.position.set(origin.x, 0, origin.y);
	      root.name = `forest-chunk-${chunkKey}-${modelIndex}`;
	      const instancedMeshes = preparedParts.map(({ geometry, material }, partIndex) => {
	        const instancedMesh = new three.InstancedMesh(geometry, material, totalInstances);
	        instancedMesh.name = `forest-${chunkKey}-${partIndex}`;
	        instancedMesh.instanceMatrix.setUsage(three.DynamicDrawUsage);
	        instancedMesh.instanceColor = new three.InstancedBufferAttribute(new Float32Array(totalInstances * 3).fill(1), 3);
	        instancedMesh.count = 0;
	        instancedMesh.frustumCulled = false;
	        root.add(instancedMesh);
	        return instancedMesh;
	      });
	      const id = `forest:${chunkKey}:${modelIndex}`;
	      tagWorldChunk(
	        root,
	        chunkKey,
	        "forest",
	        localizeWorldChunkBounds(getWorldChunkBounds(chunkTiles, size, 0, size * 3), origin),
	        id
	      );
	      chunkRecords.set(id, { root, instancedMeshes, tiles: chunkTiles, lodCache: /* @__PURE__ */ new Map() });
	    }
	    modelIndex += 1;
	  }
	  return new ForestField(tileRanges, fogDarkenFactor, chunkRecords, {
	    map,
	    size,
	    treesPerTile,
	    treeScale,
	    treeFootprint,
	    polygon,
	    waterOptions,
	    coastOptions
	  }, resources, !sharedResources);
	}

	// src/shaders/grass.vertex.ts
	var GRASS_VERTEX_SHADER = `
precision mediump float;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

uniform float uTime;
uniform float windStrength;
uniform float windSpeed;
uniform vec2 worldOffset;
uniform vec2 chunkOrigin;
uniform vec2 worldCenter;
uniform vec2 worldPeriod;

// Blade shape authored once in local space (see Grass.ts buildBladeGeometry):
// x spans [-0.5, 0.5] at the root and tapers to 0 at the tip, y is a plain
// [0, 1] height factor (0 = root, 1 = tip) - not a world-unit height, that's
// what the per-instance "scale" attribute is for.
attribute vec3 position;

attribute vec2 offset;  // world XZ position of this blade's root
attribute vec2 tileOffset; // canonical center of the blade's owning hex
attribute float angle;  // random Y rotation, radians - so blades don't all face the same way
attribute vec2 scale;   // x = width multiplier, y = height multiplier (world units)
attribute float phase;  // random wind phase offset, see wave below
attribute float shade;  // random per-blade brightness multiplier (clump variation)
attribute float fogState; // 0 = unseen (blade hidden), 1 = explored (darkened), 2 = visible - see FogOfWar.ts

varying float vHeightFactor;
varying float vShade;
varying float vFogState;

vec2 nearestWorldOffset(vec2 canonical) {
    vec2 wrapped = canonical;
    if (worldPeriod.x > 0.5) wrapped.x += floor((worldCenter.x - canonical.x) / worldPeriod.x + 0.5) * worldPeriod.x;
    if (worldPeriod.y > 0.5) wrapped.y += floor((worldCenter.y - canonical.y) / worldPeriod.y + 0.5) * worldPeriod.y;
    return wrapped;
}

void main() {
    float heightFactor = position.y;
    vec3 p = vec3(position.x * scale.x, position.y * scale.y, position.z * scale.x);

    float s = sin(angle);
    float c = cos(angle);
    vec3 rotated = vec3(p.x * c - p.z * s, p.y, p.x * s + p.z * c);

    // Wind bends the blade towards its tip only (heightFactor^2 keeps the root
    // planted) - phase is offset by world position so a gust visibly travels
    // across the field instead of every blade swaying in lockstep.
    //Choose the toroidal image from the owning hex center, then preserve this
    //blade's local displacement inside that hex. Terrain uses the same center
    //anchor, so decorations cannot hop to the next image before their ground.
    vec2 wrappedTileOffset = nearestWorldOffset(tileOffset);
    vec2 bladeOffset = wrappedTileOffset + (offset - tileOffset);
    vec2 logicalBladeOffset = bladeOffset + chunkOrigin + worldOffset;
    float wave = sin(uTime * windSpeed + phase + (logicalBladeOffset.x + logicalBladeOffset.y) * 0.015);
    float bend = wave * windStrength * heightFactor * heightFactor;
    rotated.x += bend;
    rotated.z += bend * 0.4;

    vec3 worldPos = vec3(bladeOffset.x + rotated.x, rotated.y, bladeOffset.y + rotated.z);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(worldPos, 1.0);

    vHeightFactor = heightFactor;
    vShade = shade;
    vFogState = fogState;
}
`;

	// src/shaders/grass.fragment.ts
	var GRASS_FRAGMENT_SHADER = `
precision mediump float;

uniform vec3 colorBase;
uniform vec3 colorTip;
uniform float fogDarkenFactor;

varying float vHeightFactor;
varying float vShade;
varying float vFogState;

void main() {
    // Unseen: no feature should show at all under the war-fog tile.
    if (vFogState < 0.5) discard;

    vec3 color = mix(colorBase, colorTip, vHeightFactor) * vShade;

    // Explored: keep the blade visible, just darker (mirrors terrain.fragment.ts).
    if (vFogState < 1.5) color *= fogDarkenFactor;

    gl_FragColor = vec4(color, 1.0);
}
`;

	// src/objects/Grass.ts
	var GrassSharedResources = class {
	  constructor(options) {
	    this.blade = buildBladeGeometry();
	    this.clock = 0;
	    this.disposed = false;
	    const bladeHeight = options.bladeHeight ?? options.size * 0.18;
	    this.material = new three.RawShaderMaterial({
	      uniforms: {
	        worldOffset: { value: new three.Vector2(0, 0) },
	        worldCenter: { value: new three.Vector2(0, 0) },
	        worldPeriod: { value: new three.Vector2(0, 0) },
	        chunkOrigin: { value: new three.Vector2(0, 0) },
	        uTime: { value: 0 },
	        windStrength: { value: options.windStrength ?? bladeHeight * 0.35 },
	        windSpeed: { value: options.windSpeed ?? 1.2 },
	        colorBase: { value: new three.Color(options.colorBase ?? 3960366) },
	        colorTip: { value: new three.Color(options.colorTip ?? 9424474) },
	        fogDarkenFactor: { value: options.fogDarkenFactor ?? 0.45 }
	      },
	      vertexShader: GRASS_VERTEX_SHADER,
	      fragmentShader: GRASS_FRAGMENT_SHADER,
	      side: three.DoubleSide
	    });
	  }
	  update(dtS) {
	    this.clock += dtS;
	    this.material.uniforms.uTime.value = this.clock;
	  }
	  dispose() {
	    if (this.disposed) return;
	    this.disposed = true;
	    this.blade.dispose();
	    this.material.dispose();
	  }
	};
	var GrassField = class extends three.Group {
	  constructor(map, chunks, resources, options, ownsResources) {
	    super();
	    this.map = map;
	    this.chunks = chunks;
	    this.resources = resources;
	    this.options = options;
	    this.ownsResources = ownsResources;
	    this.tileRanges = /* @__PURE__ */ new Map();
	    this.fogStates = /* @__PURE__ */ new Map();
	    this.lodBuilds = 0;
	    for (const record of chunks.values()) this.add(record.mesh);
	  }
	  //Updates every blade belonging to (x, y) to the given fog state (see
	  //FogOfWar.ts) - a plain attribute-slice fill + needsUpdate, no rebuild.
	  //No-op for tiles with no grass (city tiles, non-"land" terrain).
	  setFogState(x, y, state) {
	    const key = `${x},${y}`;
	    this.fogStates.set(key, state);
	    const range = this.tileRanges.get(key);
	    if (!range) return;
	    const attribute = range.geometry.getAttribute("fogState");
	    for (let i = 0; i < range.count; i++) attribute.setX(range.start + i, state);
	    attribute.addUpdateRange(range.start, range.count);
	    attribute.needsUpdate = true;
	  }
	  //Advances the wind animation. `dtS` is the elapsed time in seconds since
	  //the previous frame - call this once per frame (see HexMap's render loop).
	  update(dtS) {
	    this.resources.update(dtS);
	  }
	  setWorldCenter(x, y) {
	    this.resources.material.uniforms.worldCenter.value.set(x, y);
	  }
	  get windStrength() {
	    return this.resources.material.uniforms.windStrength.value;
	  }
	  set windStrength(value) {
	    this.resources.material.uniforms.windStrength.value = value;
	  }
	  get windSpeed() {
	    return this.resources.material.uniforms.windSpeed.value;
	  }
	  set windSpeed(value) {
	    this.resources.material.uniforms.windSpeed.value = value;
	  }
	  activateChunk(metadata, lod) {
	    const record = this.chunks.get(metadata.id);
	    if (!record) return void 0;
	    if (record.lod === lod && record.mesh.geometry.getAttribute("position")) return record.mesh.geometry;
	    this.removeTileRanges(record);
	    let cached = record.lodCache.get(lod);
	    if (!cached) {
	      cached = this.buildChunkGeometry(
	        record.tiles,
	        lod,
	        { x: record.mesh.position.x, y: record.mesh.position.z }
	      );
	      record.lodCache.set(lod, cached);
	      this.lodBuilds += 1;
	    }
	    const previous = record.mesh.geometry;
	    record.mesh.geometry = cached.geometry;
	    if (record.lod === void 0 && !previous.getAttribute("position")) previous.dispose();
	    const fogAttribute = cached.geometry.getAttribute("fogState");
	    for (const range of cached.ranges) {
	      const state = this.fogStates.get(range.key) ?? 2;
	      for (let index = 0; index < range.count; index += 1) {
	        fogAttribute.setX(range.start + index, state);
	      }
	      this.tileRanges.set(range.key, { geometry: cached.geometry, start: range.start, count: range.count });
	    }
	    fogAttribute.needsUpdate = true;
	    record.lod = lod;
	    return record.mesh.geometry;
	  }
	  releaseChunk(metadata) {
	    const record = this.chunks.get(metadata.id);
	    if (!record || record.lod === void 0) return;
	    this.removeTileRanges(record);
	    for (const cached of record.lodCache.values()) cached.geometry.dispose();
	    record.lodCache.clear();
	    record.mesh.geometry = new three.InstancedBufferGeometry();
	    record.lod = void 0;
	  }
	  get lodBuildCount() {
	    return this.lodBuilds;
	  }
	  removeTileRanges(record) {
	    for (const tile of record.tiles) this.tileRanges.delete(`${tile.x},${tile.y}`);
	  }
	  buildChunkGeometry(chunkTiles, lod, origin) {
	    const { size, bladeWidth, bladeHeight, heightVariation, waterOptions } = this.options;
	    const densityScale = [1, 0.38, 0.14][lod];
	    const density = Math.max(1, Math.round(this.options.density * densityScale));
	    const totalBlades = chunkTiles.length * density;
	    const offsets = new Float32Array(totalBlades * 2);
	    const tileOffsets = new Float32Array(totalBlades * 2);
	    const angles = new Float32Array(totalBlades);
	    const scales = new Float32Array(totalBlades * 2);
	    const phases = new Float32Array(totalBlades);
	    const shades = new Float32Array(totalBlades);
	    const fogStates = new Float32Array(totalBlades);
	    const polygon = HEXPolygon({ x: 0, y: 0 }, size * 0.8).map((p) => [p.x, p.y]);
	    const pendingRanges = [];
	    let instance = 0;
	    for (const tile of chunkTiles) {
	      const key = `${tile.x},${tile.y}`;
	      const center = getHexCenter(tile.x, tile.y, size);
	      const tileStart = instance;
	      const waterValue = waterEdgeValue(this.map, tile.x, tile.y);
	      const seaMouthValue = riverSeaMouthEdgeValue(this.map, tile.x, tile.y);
	      const lakeMouthValue = riverLakeMouthEdgeValue(this.map, tile.x, tile.y);
	      const lakeNeighborValue = lakeNeighborEdgeValue(this.map, tile.x, tile.y);
	      for (let i = 0; i < density; i++) {
	        let lx = 0, ly = 0, attempts = 0, valid = false;
	        while (!valid && attempts < 20) {
	          lx = (stableRandom2(tile.x, tile.y, i * 97 + attempts * 2) * 2 - 1) * size;
	          ly = (stableRandom2(tile.x, tile.y, i * 97 + attempts * 2 + 1) * 2 - 1) * size;
	          valid = pointInPolygon2(polygon, [lx, ly]) === -1 && !isInTileWater(lx, ly, waterValue, size, waterOptions, seaMouthValue, lakeMouthValue, lakeNeighborValue);
	          attempts++;
	        }
	        if (!valid) continue;
	        offsets[instance * 2] = center.x + lx - origin.x;
	        offsets[instance * 2 + 1] = center.y + ly - origin.y;
	        tileOffsets[instance * 2] = center.x - origin.x;
	        tileOffsets[instance * 2 + 1] = center.y - origin.y;
	        angles[instance] = stableRandom2(tile.x, tile.y, i * 97 + 41) * Math.PI * 2;
	        const heightJitter = 1 - heightVariation * 0.5 + stableRandom2(tile.x, tile.y, i * 97 + 43) * heightVariation;
	        scales[instance * 2] = bladeWidth * (0.8 + stableRandom2(tile.x, tile.y, i * 97 + 47) * 0.4);
	        scales[instance * 2 + 1] = bladeHeight * heightJitter;
	        phases[instance] = stableRandom2(tile.x, tile.y, i * 97 + 53) * Math.PI * 2;
	        shades[instance] = 0.75 + stableRandom2(tile.x, tile.y, i * 97 + 59) * 0.35;
	        fogStates[instance] = this.fogStates.get(key) ?? 2;
	        instance++;
	      }
	      pendingRanges.push({ key, start: tileStart, count: instance - tileStart });
	    }
	    const geometry = new three.InstancedBufferGeometry();
	    geometry.setAttribute("position", this.resources.blade.getAttribute("position").clone());
	    geometry.setIndex(this.resources.blade.getIndex()?.clone() ?? null);
	    geometry.instanceCount = instance;
	    geometry.setAttribute("offset", new three.InstancedBufferAttribute(offsets, 2));
	    geometry.setAttribute("tileOffset", new three.InstancedBufferAttribute(tileOffsets, 2));
	    geometry.setAttribute("angle", new three.InstancedBufferAttribute(angles, 1));
	    geometry.setAttribute("scale", new three.InstancedBufferAttribute(scales, 2));
	    geometry.setAttribute("phase", new three.InstancedBufferAttribute(phases, 1));
	    geometry.setAttribute("shade", new three.InstancedBufferAttribute(shades, 1));
	    geometry.setAttribute("fogState", new three.InstancedBufferAttribute(fogStates, 1));
	    return { geometry, ranges: pendingRanges };
	  }
	  dispose() {
	    for (const record of this.chunks.values()) {
	      const geometries = /* @__PURE__ */ new Set([
	        record.mesh.geometry,
	        ...[...record.lodCache.values()].map((cached) => cached.geometry)
	      ]);
	      for (const geometry of geometries) geometry.dispose();
	      record.lodCache.clear();
	    }
	    if (this.ownsResources) this.resources.dispose();
	  }
	};
	function stableRandom2(x, y, salt) {
	  let value = Math.imul(x ^ 2654435769, 2246822507) ^ Math.imul(y ^ 3266489909, 668265263) ^ Math.imul(salt ^ 374761393, 2246822519);
	  value ^= value >>> 16;
	  value = Math.imul(value, 2146121005);
	  value ^= value >>> 15;
	  value = Math.imul(value, 2221713035);
	  value ^= value >>> 16;
	  return (value >>> 0) / 4294967296;
	}
	function buildBladeGeometry() {
	  const positions = new Float32Array([
	    -0.5,
	    0,
	    0,
	    0.5,
	    0,
	    0,
	    -0.25,
	    0.5,
	    0,
	    0.25,
	    0.5,
	    0,
	    0,
	    1,
	    0
	  ]);
	  const index = [0, 1, 2, 1, 3, 2, 2, 3, 4];
	  const geometry = new three.BufferGeometry();
	  geometry.setAttribute("position", new three.Float32BufferAttribute(positions, 3));
	  geometry.setIndex(index);
	  return geometry;
	}
	function createGrassField(map, options, onlyTiles, sharedResources) {
	  const { size } = options;
	  const density = options.density ?? 60;
	  if (density <= 0) return null;
	  const bladeWidth = options.bladeWidth ?? size * 0.03;
	  const bladeHeight = options.bladeHeight ?? size * 0.18;
	  const heightVariation = options.heightVariation ?? 0.4;
	  const tiles = [];
	  const considerTile = (x, y) => {
	    const tile = getMapTile(map, x, y);
	    if (tile?.type === "land" /* land */ && !tile.city && !isLakeTile(tile)) tiles.push({ x, y });
	  };
	  if (onlyTiles) {
	    for (const point of onlyTiles) considerTile(point.x, point.y);
	  } else {
	    forEachMapTile(map, (_tile, x, y) => considerTile(x, y));
	  }
	  if (tiles.length === 0) return null;
	  const waterOptions = {
	    riverWidth: options.riverWidth ?? 0.28,
	    riverBankWidth: options.riverBankWidth ?? 0.14,
	    riverCurvature: options.riverCurvature ?? 0.5,
	    lakeShoreWidth: options.lakeShoreWidth ?? 0.18
	  };
	  const resources = sharedResources ?? new GrassSharedResources(options);
	  const chunks = /* @__PURE__ */ new Map();
	  for (const [chunkKey, chunkTiles] of groupTilesByWorldChunk(tiles)) {
	    const geometry = new three.InstancedBufferGeometry();
	    const chunk = new three.Mesh(geometry, resources.material);
	    const origin = getWorldChunkOrigin(chunkKey, size);
	    chunk.position.set(origin.x, 0, origin.y);
	    chunk.onBeforeRender = (_renderer, _scene, _camera, _geometry, currentMaterial) => {
	      const shader = currentMaterial;
	      shader.uniforms.chunkOrigin.value.set(origin.x, origin.y);
	      shader.uniformsNeedUpdate = true;
	    };
	    chunk.name = `grass-chunk-${chunkKey}`;
	    chunk.frustumCulled = false;
	    tagWorldChunk(
	      chunk,
	      chunkKey,
	      "grass",
	      localizeWorldChunkBounds(
	        getWorldChunkBounds(chunkTiles, size, 0, bladeHeight * (1 + heightVariation)),
	        origin
	      )
	    );
	    chunks.set(`grass:${chunkKey}`, { mesh: chunk, tiles: chunkTiles, lodCache: /* @__PURE__ */ new Map() });
	  }
	  return new GrassField(map, chunks, resources, {
	    size,
	    density,
	    bladeWidth,
	    bladeHeight,
	    heightVariation,
	    waterOptions
	  }, !sharedResources);
	}

	// src/helpers/fog.ts
	function tilesWithinRange(map, x, y, range) {
	  const origin = normalizeMapCoordinates(map, x, y);
	  if (!Number.isFinite(range) || range < 0 || !origin || !getMapTile(map, origin.x, origin.y)) return [];
	  const wholeRange = Math.floor(range);
	  const visited = /* @__PURE__ */ new Set([`${origin.x},${origin.y}`]);
	  const result = [origin];
	  let frontier = [origin];
	  for (let step = 0; step < wholeRange; step++) {
	    const next = [];
	    for (const tile of frontier) {
	      for (const n of getMapNeighbors(map, tile.x, tile.y)) {
	        const key = `${n.x},${n.y}`;
	        if (visited.has(key)) continue;
	        visited.add(key);
	        next.push({ x: n.x, y: n.y });
	        result.push({ x: n.x, y: n.y });
	      }
	    }
	    frontier = next;
	  }
	  return result;
	}

	// src/objects/FogOfWar.ts
	var FogState = /* @__PURE__ */ ((FogState2) => {
	  FogState2[FogState2["Unseen"] = 0] = "Unseen";
	  FogState2[FogState2["Explored"] = 1] = "Explored";
	  FogState2[FogState2["Visible"] = 2] = "Visible";
	  return FogState2;
	})(FogState || {});
	var FogOfWar = class {
	  constructor(map) {
	    this.map = map;
	    this.visible = /* @__PURE__ */ new Set();
	    this.lastCandidates = 0;
	    assertWrappableMap(map);
	    this.state = new Uint8Array(map.w * map.h);
	  }
	  index(x, y) {
	    return x * this.map.h + y;
	  }
	  getState(x, y) {
	    const normalized = normalizeMapCoordinates(this.map, x, y);
	    if (!normalized || !getMapTile(this.map, normalized.x, normalized.y)) return 0 /* Unseen */;
	    return this.state[this.index(normalized.x, normalized.y)];
	  }
	  //Every existing tile, at its current state - used once at startup to sync
	  //a renderer whose own default (see HexMap.setTileFog()) doesn't necessarily
	  //match this class's all-Unseen initial state.
	  allTiles() {
	    const tiles = [];
	    for (let x = 0; x < this.map.w; x++) {
	      for (let y = 0; y < this.map.h; y++) {
	        if (!getMapTile(this.map, x, y)) continue;
	        tiles.push({ x, y, state: this.state[this.index(x, y)] });
	      }
	    }
	    return tiles;
	  }
	  //Recomputes which tiles are currently visible from `viewers` (typically
	  //every unit's {x, y, viewRange}) and updates state accordingly: tiles now
	  //visible -> Visible; tiles that *were* Visible but no longer are ->
	  //Explored (remembered, but dimmed); everything else is untouched (an
	  //Unseen tile stays Unseen until it's actually been seen at least once).
	  //Returns only the tiles whose state actually changed, so callers can push
	  //a cheap incremental update to the renderer instead of touching every tile.
	  recompute(viewers) {
	    const nowVisible = /* @__PURE__ */ new Set();
	    for (const viewer of viewers) {
	      for (const tile of tilesWithinRange(this.map, viewer.x, viewer.y, viewer.viewRange)) {
	        nowVisible.add(this.index(tile.x, tile.y));
	      }
	    }
	    const changes = [];
	    for (const idx of this.visible) {
	      if (nowVisible.has(idx)) continue;
	      this.state[idx] = 1 /* Explored */;
	      changes.push({ x: Math.floor(idx / this.map.h), y: idx % this.map.h, state: 1 /* Explored */ });
	    }
	    for (const idx of nowVisible) {
	      if (this.state[idx] === 2 /* Visible */) continue;
	      this.state[idx] = 2 /* Visible */;
	      changes.push({ x: Math.floor(idx / this.map.h), y: idx % this.map.h, state: 2 /* Visible */ });
	    }
	    this.lastCandidates = this.visible.size + nowVisible.size;
	    this.visible = nowVisible;
	    return changes;
	  }
	  get lastRecomputeCandidateCount() {
	    return this.lastCandidates;
	  }
	};

	// src/helpers/fogStateStore.ts
	var UNSET_FOG_STATE = 255;
	var MAX_DENSE_FOG_CELLS = 1e8;
	var FogStateStore = class {
	  constructor(map) {
	    this.map = map;
	    this.sparse = /* @__PURE__ */ new Map();
	    this.count = 0;
	    const cells = map.w * map.h;
	    if (!map.infinite && Number.isSafeInteger(cells) && cells >= 0 && cells <= MAX_DENSE_FOG_CELLS) {
	      this.denseLength = cells;
	    }
	  }
	  set(x, y, state) {
	    if (this.denseLength !== void 0) {
	      this.dense ?? (this.dense = this.createDenseStorage());
	      const index = x * this.map.h + y;
	      if (index < 0 || index >= this.denseLength || !Number.isSafeInteger(index)) return;
	      if (this.dense[index] === UNSET_FOG_STATE) this.count += 1;
	      this.dense[index] = state;
	      return;
	    }
	    const key = `${x},${y}`;
	    if (!this.sparse.has(key)) this.count += 1;
	    this.sparse.set(key, state);
	  }
	  get(x, y) {
	    if (this.denseLength !== void 0) {
	      if (!this.dense) return void 0;
	      const index = x * this.map.h + y;
	      if (index < 0 || index >= this.denseLength || !Number.isSafeInteger(index)) return void 0;
	      const state = this.dense[index];
	      return state === UNSET_FOG_STATE ? void 0 : state;
	    }
	    return this.sparse.get(`${x},${y}`);
	  }
	  forEach(visit) {
	    if (this.denseLength !== void 0) {
	      if (!this.dense) return;
	      for (let index = 0; index < this.dense.length; index += 1) {
	        const state = this.dense[index];
	        if (state === UNSET_FOG_STATE) continue;
	        visit(state, Math.floor(index / this.map.h), index % this.map.h);
	      }
	      return;
	    }
	    for (const [key, state] of this.sparse) {
	      const separator = key.indexOf(",");
	      visit(state, Number(key.slice(0, separator)), Number(key.slice(separator + 1)));
	    }
	  }
	  get size() {
	    return this.count;
	  }
	  get storageBytes() {
	    return this.dense?.byteLength ?? 0;
	  }
	  createDenseStorage() {
	    const storage = new Uint8Array(this.denseLength);
	    storage.fill(UNSET_FOG_STATE);
	    return storage;
	  }
	};
	var EMPTY_STATS = {
	  visibleObjects: 0,
	  visibleChunks: 0,
	  residentChunks: 0,
	  gpuResidentChunks: 0,
	  lod0: 0,
	  lod1: 0,
	  lod2: 0,
	  registeredObjects: 0,
	  sceneTraversals: 0
	};
	var WorldChunkScheduler = class {
	  constructor(options) {
	    this.options = options;
	    this.frustum = new three.Frustum();
	    this.projection = new three.Matrix4();
	    this.bounds = new three.Box3();
	    this.residents = /* @__PURE__ */ new Map();
	    this.bindings = /* @__PURE__ */ new Map();
	    this.visibleIds = /* @__PURE__ */ new Set();
	    this.inactive = [];
	    this.registryDirty = true;
	    this.registeredObjects = 0;
	    this.sceneTraversals = 0;
	    this.frame = 0;
	    this.snapshot = { ...EMPTY_STATS };
	  }
	  configure(options) {
	    this.options = { ...this.options, ...options };
	  }
	  clear() {
	    this.residents.clear();
	    this.frame = 0;
	    this.snapshot = { ...EMPTY_STATS };
	    this.registryDirty = true;
	  }
	  invalidateScene() {
	    this.registryDirty = true;
	  }
	  //Streaming worlds can physically remove render shells before the normal
	  //grace-frame eviction pass. Forget them immediately so residency stats and
	  //cache limits never retain metadata for unloaded logical chunks.
	  forget(ids) {
	    for (const id of ids) {
	      this.residents.delete(id);
	      this.bindings.delete(id);
	    }
	    this.registryDirty = true;
	  }
	  get stats() {
	    return this.snapshot;
	  }
	  update(root, camera, target, hooks) {
	    this.frame += 1;
	    if (root !== this.registeredRoot || this.registryDirty) this.rebuildRegistry(root);
	    camera.updateMatrixWorld();
	    this.projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
	    this.frustum.setFromProjectionMatrix(this.projection);
	    this.visibleIds.clear();
	    let visibleObjects = 0;
	    for (const binding of this.bindings.values()) {
	      const metadata = binding.metadata;
	      binding.visibleObjects.length = 0;
	      let requestedLod;
	      if (!hooks.enabled(metadata)) {
	        for (const object of binding.objects) object.visible = false;
	        continue;
	      }
	      for (const object of binding.objects) {
	        object.updateWorldMatrix(true, false);
	        const worldX = object.matrixWorld.elements[12];
	        const worldY = object.matrixWorld.elements[13];
	        const worldZ = object.matrixWorld.elements[14];
	        const local = metadata.bounds;
	        this.bounds.min.set(local.minX + worldX, local.minY + worldY, local.minZ + worldZ);
	        this.bounds.max.set(local.maxX + worldX, local.maxY + worldY, local.maxZ + worldZ);
	        const dx = Math.max(0, this.bounds.min.x - target.x, target.x - this.bounds.max.x);
	        const dz = Math.max(0, this.bounds.min.z - target.z, target.z - this.bounds.max.z);
	        const distance = Math.hypot(dx, dz);
	        const resident = this.residents.get(metadata.id);
	        const lod = this.options.lodEnabled ? resolveWorldChunkLod(distance, metadata.kind, resident?.lod, this.options.lodDistances) : distance <= (metadata.kind === "grass" || metadata.kind === "forest" ? this.options.lodDistances.vegetation : this.options.renderDistance) ? 0 : null;
	        const visible = distance <= this.options.renderDistance && lod !== null && this.frustum.intersectsBox(this.bounds);
	        object.visible = visible;
	        if (!visible || lod === null) continue;
	        visibleObjects += 1;
	        binding.visibleObjects.push(object);
	        if (requestedLod === void 0 || lod < requestedLod) requestedLod = lod;
	      }
	      if (requestedLod !== void 0) {
	        binding.lod = requestedLod;
	        this.visibleIds.add(metadata.id);
	      }
	    }
	    const lodCounts = [0, 0, 0];
	    for (const id of this.visibleIds) {
	      const request = this.bindings.get(id);
	      const activation = hooks.activate(request.metadata, request.lod, request.visibleObjects);
	      const geometries = (activation && activation.geometries) ?? this.residents.get(id)?.geometries ?? [];
	      const resident = this.residents.get(id);
	      this.residents.set(id, {
	        id,
	        metadata: request.metadata,
	        lod: request.lod,
	        lastVisible: this.frame,
	        geometries,
	        disposeGpu: activation?.disposeGpu ?? resident?.disposeGpu,
	        gpuResident: true
	      });
	      if (resident && resident.lod !== request.lod) {
	        for (const geometry of resident.geometries) geometry.dispose();
	        resident.disposeGpu?.();
	      }
	      lodCounts[request.lod] += 1;
	    }
	    this.evictInactive(this.visibleIds, hooks);
	    let gpuResidentChunks = 0;
	    for (const entry of this.residents.values()) if (entry.gpuResident) gpuResidentChunks += 1;
	    this.snapshot = {
	      visibleObjects,
	      visibleChunks: this.visibleIds.size,
	      residentChunks: this.residents.size,
	      gpuResidentChunks,
	      lod0: lodCounts[0],
	      lod1: lodCounts[1],
	      lod2: lodCounts[2],
	      registeredObjects: this.registeredObjects,
	      sceneTraversals: this.sceneTraversals
	    };
	  }
	  evictInactive(visible, hooks) {
	    this.inactive.length = 0;
	    for (const entry of this.residents.values()) {
	      if (!visible.has(entry.id)) this.inactive.push(entry);
	    }
	    this.inactive.sort((a, b) => a.lastVisible - b.lastVisible);
	    let gpuExcess = Math.max(
	      0,
	      this.countGpuResidents() - this.options.gpuCacheSize
	    );
	    for (const entry of this.inactive) {
	      if (!entry.gpuResident) continue;
	      const stale = this.frame - entry.lastVisible >= this.options.gpuGraceFrames;
	      if (!stale && gpuExcess <= 0) break;
	      for (const geometry of entry.geometries) geometry.dispose();
	      entry.disposeGpu?.();
	      entry.gpuResident = false;
	      if (gpuExcess > 0) gpuExcess -= 1;
	    }
	    let cpuExcess = Math.max(0, this.residents.size - this.options.cpuCacheSize);
	    for (const entry of this.inactive) {
	      const stale = this.frame - entry.lastVisible >= this.options.cpuGraceFrames;
	      if (!stale && cpuExcess <= 0) break;
	      for (const geometry of entry.geometries) geometry.dispose();
	      if (entry.gpuResident) entry.disposeGpu?.();
	      hooks.release(entry.metadata);
	      this.residents.delete(entry.id);
	      if (cpuExcess > 0) cpuExcess -= 1;
	    }
	  }
	  countGpuResidents() {
	    let count = 0;
	    for (const entry of this.residents.values()) if (entry.gpuResident) count += 1;
	    return count;
	  }
	  rebuildRegistry(root) {
	    this.bindings.clear();
	    this.registeredRoot = root;
	    this.registeredObjects = 0;
	    root.traverse((object) => {
	      const metadata = getWorldChunkMetadata(object);
	      if (!metadata) return;
	      let binding = this.bindings.get(metadata.id);
	      if (!binding) {
	        binding = { metadata, objects: [], visibleObjects: [], lod: 0 };
	        this.bindings.set(metadata.id, binding);
	      }
	      binding.objects.push(object);
	      this.registeredObjects += 1;
	    });
	    this.registryDirty = false;
	    this.sceneTraversals += 1;
	  }
	};
	function createDefaultWorldChunkSchedulerOptions() {
	  return {
	    renderDistance: 2400,
	    lodEnabled: true,
	    lodDistances: { ...DEFAULT_WORLD_CHUNK_LOD_DISTANCES },
	    gpuCacheSize: 128,
	    cpuCacheSize: 192,
	    gpuGraceFrames: 300,
	    cpuGraceFrames: 1200
	  };
	}

	// src/rendering/FrameTaskScheduler.ts
	var FrameTaskScheduler = class {
	  constructor(options = {}) {
	    this.tasks = /* @__PURE__ */ new Map();
	    this.sequence = 0;
	    this.completed = 0;
	    this.cancelled = 0;
	    this.lastFrameTasks = 0;
	    this.lastFrameDurationMs = 0;
	    this.budgetMs = options.budgetMs ?? 3;
	    this.maxTasksPerFrame = options.maxTasksPerFrame ?? 2;
	    this.now = options.now ?? (() => performance.now());
	    this.error = options.error;
	    this.validate();
	  }
	  configure(options) {
	    if (options.budgetMs !== void 0) this.budgetMs = options.budgetMs;
	    if (options.maxTasksPerFrame !== void 0) this.maxTasksPerFrame = options.maxTasksPerFrame;
	    this.validate();
	  }
	  enqueue(key, priority, run) {
	    if (!key) throw new TypeError("frame task key is required");
	    if (!Number.isFinite(priority)) throw new RangeError("frame task priority must be finite");
	    this.tasks.set(key, { key, priority, sequence: this.sequence++, run });
	  }
	  cancel(key) {
	    const removed = this.tasks.delete(key);
	    if (removed) this.cancelled += 1;
	    return removed;
	  }
	  clear() {
	    this.cancelled += this.tasks.size;
	    this.tasks.clear();
	    this.lastFrameTasks = 0;
	    this.lastFrameDurationMs = 0;
	  }
	  runFrame() {
	    const started = this.now();
	    let ran = 0;
	    const ordered = [...this.tasks.values()].sort((a, b) => a.priority - b.priority || a.sequence - b.sequence);
	    for (const task of ordered) {
	      if (ran >= this.maxTasksPerFrame) break;
	      if (ran > 0 && this.now() - started >= this.budgetMs) break;
	      if (!this.tasks.delete(task.key)) continue;
	      try {
	        task.run();
	      } catch (reason) {
	        try {
	          this.error?.(reason instanceof Error ? reason : new Error(String(reason)));
	        } catch {
	        }
	      }
	      ran += 1;
	      this.completed += 1;
	    }
	    this.lastFrameTasks = ran;
	    this.lastFrameDurationMs = this.now() - started;
	    return ran;
	  }
	  get stats() {
	    return {
	      pendingTasks: this.tasks.size,
	      completedTasks: this.completed,
	      cancelledTasks: this.cancelled,
	      lastFrameTasks: this.lastFrameTasks,
	      lastFrameDurationMs: this.lastFrameDurationMs
	    };
	  }
	  validate() {
	    if (!Number.isFinite(this.budgetMs) || this.budgetMs <= 0) {
	      throw new RangeError("frame task budgetMs must be a positive finite number");
	    }
	    if (!Number.isInteger(this.maxTasksPerFrame) || this.maxTasksPerFrame <= 0) {
	      throw new RangeError("frame task maxTasksPerFrame must be a positive integer");
	    }
	  }
	};

	// src/world/noise.ts
	var UINT32_MAX = 4294967295;
	function seedToUint32(seed) {
	  const text = String(seed);
	  let hash = 2166136261;
	  for (let index = 0; index < text.length; index += 1) {
	    hash ^= text.charCodeAt(index);
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
	function positiveModulo2(value, modulus) {
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
	    positiveModulo2(gx, px),
	    positiveModulo2(gy, py)
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
	function randomAt(seed, x, y, salt) {
	  return randomGridValue((seed ^ salt) >>> 0, x, y);
	}

	// src/world/generateWorldChunk.ts
	var DEFAULT_WORLD_GENERATION_CHUNK_SIZE = 24;
	var MAX_WORLD_GENERATION_CHUNK_SIZE = 128;
	var WORLD_CHUNK_FORMAT_VERSION = 1;
	var WORLD_CHUNK_PADDING = 1;
	function assertPackedWorldChunk(chunk) {
	  if (!chunk || typeof chunk !== "object" || chunk.version !== WORLD_CHUNK_FORMAT_VERSION || !Number.isSafeInteger(chunk.chunkX) || !Number.isSafeInteger(chunk.chunkY) || !Number.isInteger(chunk.chunkSize) || chunk.chunkSize <= 0 || chunk.chunkSize > MAX_WORLD_GENERATION_CHUNK_SIZE || chunk.padding !== WORLD_CHUNK_PADDING || chunk.stride !== chunk.chunkSize + chunk.padding * 2 || !(chunk.tiles instanceof Uint16Array) || chunk.tiles.length !== chunk.stride * chunk.stride) {
	    throw new TypeError("packed world chunk payload is invalid");
	  }
	}
	var LAND_BY_CODE = [
	  "sea" /* sea */,
	  "coastal" /* coastal */,
	  "land" /* land */,
	  "sand" /* sand */,
	  "tundra" /* tundra */,
	  "snow" /* snow */,
	  "mountain" /* mountain */
	];
	var LAND_CODE = new Map(LAND_BY_CODE.map((land, index) => [land, index]));
	var FLAG_HILL = 1 << 3;
	var FLAG_WOOD = 1 << 4;
	var FLAG_LAKE = 1 << 5;
	var TREE_SHIFT = 6;
	var TREE_MASK = 3 << TREE_SHIFT;
	var TREE_MODELS = [void 0, "Assets/models/palm", "Assets/models/pinia", "Assets/models/oak"];
	var SEA_LEVEL = 0.43;
	function assertChunkCoordinate(name, value) {
	  if (!Number.isSafeInteger(value)) throw new RangeError(`${name} must be a safe integer`);
	}
	function resolveChunkSize(value = DEFAULT_WORLD_GENERATION_CHUNK_SIZE) {
	  if (!Number.isInteger(value) || value <= 0 || value > MAX_WORLD_GENERATION_CHUNK_SIZE) {
	    throw new RangeError(`chunkSize must be an integer between 1 and ${MAX_WORLD_GENERATION_CHUNK_SIZE}`);
	  }
	  return value;
	}
	function sampleClimate(seed, x, y) {
	  const continent = fractalNoise2D(seed, x * 0.055, y * 0.055, 5);
	  const detail = fractalNoise2D(seed ^ 2738958700, x * 0.14, y * 0.14, 3);
	  const elevation = continent * 0.78 + detail * 0.22 + 0.03;
	  const moisture = fractalNoise2D(seed ^ 3355524772, x * 0.08, y * 0.08, 4);
	  const temperatureNoise = fractalNoise2D(seed ^ 2911926141, x * 0.025, y * 0.025, 3);
	  const temperature = 0.18 + temperatureNoise * 0.74 - Math.max(0, elevation - 0.55) * 0.8;
	  return { elevation, moisture, temperature };
	}
	function classifyTerrain({ elevation, moisture, temperature }) {
	  if (elevation < SEA_LEVEL) return "sea" /* sea */;
	  if (elevation > 0.75) return "mountain" /* mountain */;
	  if (temperature < 0.18) return "snow" /* snow */;
	  if (temperature < 0.34) return "tundra" /* tundra */;
	  if (temperature > 0.68 && moisture < 0.42) return "sand" /* sand */;
	  return "land" /* land */;
	}
	function baseTerrainAt(seed, x, y) {
	  return classifyTerrain(sampleClimate(seed, x, y));
	}
	function isWater2(type) {
	  return type === "sea" /* sea */ || type === "coastal" /* coastal */;
	}
	function terrainAt(seed, x, y) {
	  const base = baseTerrainAt(seed, x, y);
	  if (base !== "sea" /* sea */) return base;
	  const touchesLand = getNeighbors(x, y).some((neighbor) => !isWater2(baseTerrainAt(seed, neighbor.x, neighbor.y)));
	  return touchesLand ? "coastal" /* coastal */ : "sea" /* sea */;
	}
	function encodeTile(seed, x, y) {
	  const climate = sampleClimate(seed, x, y);
	  const type = terrainAt(seed, x, y);
	  let packed = LAND_CODE.get(type) ?? 0;
	  if (isWater2(type) || type === "mountain" /* mountain */ || type === "snow" /* snow */) return packed;
	  const lake = type === "land" /* land */ && climate.elevation > SEA_LEVEL + 0.025 && climate.elevation < 0.56 && climate.moisture > 0.74 && randomAt(seed, x, y, 1821285621) > 0.94;
	  if (lake) return packed | FLAG_LAKE;
	  if (climate.elevation > 0.62) packed |= FLAG_HILL;
	  const forestChance = Math.max(0, Math.min(0.58, (climate.moisture - 0.48) * 1.5));
	  if (randomAt(seed, x, y, 668265263) < forestChance) {
	    const treeCode = climate.temperature > 0.67 ? 1 : climate.temperature < 0.4 ? 2 : 3;
	    packed |= FLAG_WOOD | treeCode << TREE_SHIFT;
	  }
	  return packed;
	}
	function generateWorldChunk(options) {
	  assertChunkCoordinate("chunkX", options.chunkX);
	  assertChunkCoordinate("chunkY", options.chunkY);
	  const chunkSize = resolveChunkSize(options.chunkSize);
	  const stride = chunkSize + WORLD_CHUNK_PADDING * 2;
	  const tiles = new Uint16Array(stride * stride);
	  const seed = seedToUint32(options.seed);
	  const originX = options.chunkX * chunkSize - WORLD_CHUNK_PADDING;
	  const originY = options.chunkY * chunkSize - WORLD_CHUNK_PADDING;
	  if (!Number.isSafeInteger(originX) || !Number.isSafeInteger(originY) || !Number.isSafeInteger(originX + stride - 1) || !Number.isSafeInteger(originY + stride - 1)) {
	    throw new RangeError("chunk coordinates exceed the safe integer tile range");
	  }
	  for (let localX = 0; localX < stride; localX += 1) {
	    for (let localY = 0; localY < stride; localY += 1) {
	      tiles[localX * stride + localY] = encodeTile(seed, originX + localX, originY + localY);
	    }
	  }
	  return {
	    version: WORLD_CHUNK_FORMAT_VERSION,
	    chunkX: options.chunkX,
	    chunkY: options.chunkY,
	    chunkSize,
	    padding: WORLD_CHUNK_PADDING,
	    stride,
	    tiles
	  };
	}
	function decodeWorldChunkTile(chunk, localX, localY) {
	  if (!Number.isInteger(localX) || !Number.isInteger(localY) || localX < -chunk.padding || localX >= chunk.chunkSize + chunk.padding || localY < -chunk.padding || localY >= chunk.chunkSize + chunk.padding) {
	    throw new RangeError("chunk-local tile coordinate is outside the packed payload");
	  }
	  const packed = chunk.tiles[(localX + chunk.padding) * chunk.stride + localY + chunk.padding];
	  const type = LAND_BY_CODE[packed & 7];
	  if (!type) throw new Error("packed world chunk contains an unknown terrain code");
	  const tile = { type };
	  const modifiers = [];
	  if ((packed & FLAG_HILL) !== 0) modifiers.push("hill");
	  if ((packed & FLAG_WOOD) !== 0) modifiers.push("wood");
	  if ((packed & FLAG_LAKE) !== 0) modifiers.push("lake");
	  if (modifiers.length > 0) tile.modifiers = modifiers;
	  const treeModel = TREE_MODELS[(packed & TREE_MASK) >> TREE_SHIFT];
	  if (treeModel) tile.treeModel = treeModel;
	  return tile;
	}
	function getWorldChunkCorePoints(chunk) {
	  const points = [];
	  const originX = chunk.chunkX * chunk.chunkSize;
	  const originY = chunk.chunkY * chunk.chunkSize;
	  for (let localX = 0; localX < chunk.chunkSize; localX += 1) {
	    for (let localY = 0; localY < chunk.chunkSize; localY += 1) {
	      points.push({ x: originX + localX, y: originY + localY });
	    }
	  }
	  return points;
	}
	var SparseWorldChunkStore = class _SparseWorldChunkStore {
	  constructor() {
	    this.chunks = /* @__PURE__ */ new Map();
	    this.decodedTiles = /* @__PURE__ */ new Map();
	    this.map = {
	      data: {},
	      w: 1,
	      h: 1,
	      infinite: true,
	      tileAt: (x, y) => this.getTile(x, y),
	      forEachTile: (visit) => this.forEachCoreTile(visit)
	    };
	  }
	  static key(chunkX, chunkY) {
	    return `${chunkX},${chunkY}`;
	  }
	  add(chunk) {
	    assertPackedWorldChunk(chunk);
	    if (this.chunkSize !== void 0 && chunk.chunkSize !== this.chunkSize) {
	      throw new TypeError("all sparse world chunks must use the same chunkSize");
	    }
	    this.chunkSize = chunk.chunkSize;
	    const key = _SparseWorldChunkStore.key(chunk.chunkX, chunk.chunkY);
	    if (this.chunks.has(key)) return getWorldChunkCorePoints(chunk);
	    this.chunks.set(key, chunk);
	    return getWorldChunkCorePoints(chunk);
	  }
	  remove(chunkX, chunkY) {
	    const key = _SparseWorldChunkStore.key(chunkX, chunkY);
	    if (!this.chunks.has(key)) return;
	    this.chunks.delete(key);
	    if (this.chunks.size === 0) this.chunkSize = void 0;
	  }
	  hasCoreTile(x, y) {
	    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) || this.chunkSize === void 0) return false;
	    return this.hasChunk(Math.floor(x / this.chunkSize), Math.floor(y / this.chunkSize));
	  }
	  hasChunk(chunkX, chunkY) {
	    return this.chunks.has(_SparseWorldChunkStore.key(chunkX, chunkY));
	  }
	  get residentChunkCount() {
	    return this.chunks.size;
	  }
	  get residentPayloadBytes() {
	    let bytes = 0;
	    for (const chunk of this.chunks.values()) bytes += chunk.tiles.byteLength;
	    return bytes;
	  }
	  get decodedTileVariantCount() {
	    return this.decodedTiles.size;
	  }
	  getTile(x, y) {
	    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) || this.chunkSize === void 0) return void 0;
	    const ownerX = Math.floor(x / this.chunkSize);
	    const ownerY = Math.floor(y / this.chunkSize);
	    const direct = this.tileFromChunk(this.chunks.get(_SparseWorldChunkStore.key(ownerX, ownerY)), x, y);
	    if (direct) return direct;
	    for (let dx = -1; dx <= 1; dx += 1) {
	      for (let dy = -1; dy <= 1; dy += 1) {
	        if (dx === 0 && dy === 0) continue;
	        const tile = this.tileFromChunk(
	          this.chunks.get(_SparseWorldChunkStore.key(ownerX + dx, ownerY + dy)),
	          x,
	          y
	        );
	        if (tile) return tile;
	      }
	    }
	    return void 0;
	  }
	  tileFromChunk(chunk, x, y) {
	    if (!chunk) return void 0;
	    const localX = x - chunk.chunkX * chunk.chunkSize;
	    const localY = y - chunk.chunkY * chunk.chunkSize;
	    if (localX < -chunk.padding || localX >= chunk.chunkSize + chunk.padding || localY < -chunk.padding || localY >= chunk.chunkSize + chunk.padding) return void 0;
	    const packed = chunk.tiles[(localX + chunk.padding) * chunk.stride + localY + chunk.padding];
	    const cached = this.decodedTiles.get(packed);
	    if (cached) return cached;
	    const decoded = decodeWorldChunkTile(chunk, localX, localY);
	    if (decoded.modifiers) Object.freeze(decoded.modifiers);
	    Object.freeze(decoded);
	    this.decodedTiles.set(packed, decoded);
	    return decoded;
	  }
	  forEachCoreTile(visit) {
	    for (const chunk of this.chunks.values()) {
	      const originX = chunk.chunkX * chunk.chunkSize;
	      const originY = chunk.chunkY * chunk.chunkSize;
	      for (let localX = 0; localX < chunk.chunkSize; localX += 1) {
	        for (let localY = 0; localY < chunk.chunkSize; localY += 1) {
	          visit(this.tileFromChunk(chunk, originX + localX, originY + localY), originX + localX, originY + localY);
	        }
	      }
	    }
	  }
	  clear() {
	    this.chunks.clear();
	    this.decodedTiles.clear();
	    this.chunkSize = void 0;
	  }
	};

	// src/world/WorldGeneratorClient.ts
	var WorldGeneratorClient = class {
	  constructor(workerUrl, workerOptions = { type: "module" }) {
	    this.pending = /* @__PURE__ */ new Map();
	    this.nextRequestId = 1;
	    this.disposed = false;
	    this.handleMessage = (event) => {
	      const data = event.data;
	      if (!data || typeof data !== "object" || typeof data.id !== "number" || !("world" in data) && !("chunk" in data) && !("error" in data)) {
	        this.fail(new Error("World generation worker returned an invalid message"));
	        return;
	      }
	      const request = this.pending.get(data.id);
	      if (!request) return;
	      this.pending.delete(data.id);
	      if (request.kind === "world" && "world" in data && data.world) {
	        request.resolve(data.world);
	        return;
	      }
	      if (request.kind === "chunk" && "chunk" in data && data.chunk) {
	        try {
	          assertPackedWorldChunk(data.chunk);
	          request.resolve(data.chunk);
	        } catch (reason) {
	          request.reject(reason instanceof Error ? reason : new Error(String(reason)));
	        }
	        return;
	      }
	      if (!("error" in data)) {
	        request.reject(new Error(`World generation worker returned the wrong response type for ${request.kind}`));
	        return;
	      }
	      const remote = data.error;
	      if (!remote || typeof remote.message !== "string" || typeof remote.name !== "string") {
	        const error2 = new Error("World generation worker returned an invalid error");
	        request.reject(error2);
	        this.fail(error2);
	        return;
	      }
	      const error = new Error(remote.message);
	      error.name = remote.name;
	      if (remote.stack) error.stack = remote.stack;
	      request.reject(error);
	    };
	    this.handleWorkerError = (event) => {
	      const error = event.error instanceof Error ? event.error : new Error(event.message);
	      this.fail(error);
	    };
	    this.handleMessageError = () => {
	      this.fail(new Error("World generation worker returned an unreadable message"));
	    };
	    this.worker = new Worker(workerUrl, workerOptions);
	    this.worker.addEventListener("message", this.handleMessage);
	    this.worker.addEventListener("error", this.handleWorkerError);
	    this.worker.addEventListener("messageerror", this.handleMessageError);
	  }
	  generate(options) {
	    if (this.disposed) return Promise.reject(new Error("WorldGeneratorClient has been disposed"));
	    const id = this.nextRequestId++;
	    return new Promise((resolve, reject) => {
	      this.pending.set(id, { kind: "world", resolve: (value) => resolve(value), reject });
	      try {
	        this.worker.postMessage({ id, type: "world", options });
	      } catch (reason) {
	        this.pending.delete(id);
	        reject(reason instanceof Error ? reason : new Error(String(reason)));
	      }
	    });
	  }
	  generateChunk(options) {
	    if (this.disposed) return Promise.reject(new Error("WorldGeneratorClient has been disposed"));
	    const id = this.nextRequestId++;
	    return new Promise((resolve, reject) => {
	      this.pending.set(id, { kind: "chunk", resolve: (value) => resolve(value), reject });
	      try {
	        this.worker.postMessage({ id, type: "chunk", options });
	      } catch (reason) {
	        this.pending.delete(id);
	        reject(reason instanceof Error ? reason : new Error(String(reason)));
	      }
	    });
	  }
	  dispose() {
	    if (this.disposed) return;
	    this.disposed = true;
	    this.worker.removeEventListener("message", this.handleMessage);
	    this.worker.removeEventListener("error", this.handleWorkerError);
	    this.worker.removeEventListener("messageerror", this.handleMessageError);
	    this.worker.terminate();
	    const error = new Error("World generation worker was disposed");
	    for (const request of this.pending.values()) request.reject(error);
	    this.pending.clear();
	  }
	  fail(error) {
	    for (const request of this.pending.values()) request.reject(error);
	    this.pending.clear();
	    this.dispose();
	  }
	  get isDisposed() {
	    return this.disposed;
	  }
	};

	// src/world/WorldGeneratorPool.ts
	function abortError() {
	  if (typeof DOMException !== "undefined") return new DOMException("World chunk request was aborted", "AbortError");
	  const error = new Error("World chunk request was aborted");
	  error.name = "AbortError";
	  return error;
	}
	function defaultPoolSize(maxWorkers) {
	  const hardware = typeof navigator === "undefined" ? 4 : navigator.hardwareConcurrency || 4;
	  return Math.max(1, Math.min(maxWorkers, hardware - 1));
	}
	var WorldGeneratorPool = class {
	  constructor(workerUrl, options = {}) {
	    this.queue = [];
	    this.sequence = 0;
	    this.completed = 0;
	    this.disposed = false;
	    const maxWorkers = options.maxWorkers ?? 8;
	    const size = options.size ?? defaultPoolSize(maxWorkers);
	    if (!Number.isInteger(size) || size <= 0 || size > maxWorkers) {
	      throw new RangeError(`worker pool size must be an integer between 1 and ${maxWorkers}`);
	    }
	    this.clientFactory = options.clientFactory ?? (() => new WorldGeneratorClient(workerUrl, options.workerOptions ?? { type: "module" }));
	    this.slots = Array.from({ length: size }, () => ({ client: this.clientFactory(), busy: false }));
	  }
	  generateChunk(options, request = {}) {
	    if (this.disposed) return Promise.reject(new Error("WorldGeneratorPool has been disposed"));
	    if (request.signal?.aborted) return Promise.reject(abortError());
	    return new Promise((resolve, reject) => {
	      const task = {
	        sequence: this.sequence++,
	        priority: Number.isFinite(request.priority) ? request.priority : 0,
	        options,
	        signal: request.signal,
	        resolve,
	        reject,
	        settled: false
	      };
	      if (request.signal) {
	        task.abort = () => {
	          if (task.settled) return;
	          task.settled = true;
	          const index = this.queue.indexOf(task);
	          if (index >= 0) this.queue.splice(index, 1);
	          reject(abortError());
	        };
	        request.signal.addEventListener("abort", task.abort, { once: true });
	      }
	      this.queue.push(task);
	      this.queue.sort((a, b) => a.priority - b.priority || a.sequence - b.sequence);
	      this.dispatch();
	    });
	  }
	  get stats() {
	    return {
	      workers: this.slots.length,
	      busyWorkers: this.slots.filter((slot) => slot.busy).length,
	      queued: this.queue.length,
	      completed: this.completed
	    };
	  }
	  dispose() {
	    if (this.disposed) return;
	    this.disposed = true;
	    const error = new Error("WorldGeneratorPool was disposed");
	    for (const task of this.queue.splice(0)) this.finishTask(task, () => task.reject(error));
	    for (const slot of this.slots) slot.client.dispose();
	  }
	  dispatch() {
	    if (this.disposed) return;
	    for (const slot of this.slots) {
	      if (slot.busy) continue;
	      let task;
	      while (task = this.queue.shift()) {
	        if (!task.settled && !task.signal?.aborted) break;
	        if (!task.settled) {
	          const abortedTask = task;
	          this.finishTask(abortedTask, () => abortedTask.reject(abortError()));
	        }
	        task = void 0;
	      }
	      if (!task) return;
	      slot.busy = true;
	      void slot.client.generateChunk(task.options).then(
	        (chunk) => {
	          if (!task.settled) {
	            this.completed += 1;
	            this.finishTask(task, () => task.resolve(chunk));
	          }
	        },
	        (reason) => {
	          if (!task.settled) {
	            const error = reason instanceof Error ? reason : new Error(String(reason));
	            this.finishTask(task, () => task.reject(error));
	          }
	          if (!this.disposed && slot.client.isDisposed) slot.client = this.clientFactory();
	        }
	      ).finally(() => {
	        slot.busy = false;
	        this.dispatch();
	      });
	    }
	  }
	  finishTask(task, settle) {
	    if (task.settled) return;
	    task.settled = true;
	    if (task.signal && task.abort) task.signal.removeEventListener("abort", task.abort);
	    settle();
	  }
	};

	// src/world/WorldSource.ts
	function assertWorldSource(source) {
	  if (!source || typeof source !== "object") throw new TypeError("world source must be an object");
	  if (!source.map || typeof source.map !== "object") throw new TypeError("world source must expose a MapInfo view");
	  assertWrappableMap(source.map);
	  validateChunkSize(source.chunkSize);
	  for (const method of ["resolveChunk", "chunkDistance", "loadChunk", "releaseChunk", "hasChunk", "hasTile", "dispose"]) {
	    if (typeof source[method] !== "function") throw new TypeError(`world source must implement ${method}()`);
	  }
	  if (source.bounds) {
	    const { width, height, wrapX, wrapY } = source.bounds;
	    if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
	      throw new RangeError("world source bounds must use positive integer dimensions");
	    }
	    if (typeof wrapX !== "boolean" || typeof wrapY !== "boolean") {
	      throw new TypeError("world source bounds wrap flags must be boolean");
	    }
	    if (source.map.infinite || source.map.w !== width || source.map.h !== height || Boolean(source.map.wrapX) !== wrapX || Boolean(source.map.wrapY) !== wrapY) {
	      throw new TypeError("world source bounds must match its MapInfo topology");
	    }
	  } else if (!source.map.infinite) {
	    throw new TypeError("an unbounded world source must expose an infinite MapInfo view");
	  }
	}
	function assertWorldChunk(source, chunk, expectedX, expectedY) {
	  if (!chunk || typeof chunk !== "object" || chunk.chunkX !== expectedX || chunk.chunkY !== expectedY || chunk.chunkSize !== source.chunkSize || !Array.isArray(chunk.coreTiles)) {
	    throw new TypeError("world source returned an invalid chunk");
	  }
	  const seen = /* @__PURE__ */ new Set();
	  for (const point of chunk.coreTiles) {
	    const key = point ? `${point.x},${point.y}` : "";
	    if (!point || !Number.isSafeInteger(point.x) || !Number.isSafeInteger(point.y) || Math.floor(point.x / source.chunkSize) !== expectedX || Math.floor(point.y / source.chunkSize) !== expectedY || !source.hasTile(point.x, point.y) || seen.has(key)) {
	      throw new TypeError("world source returned an invalid core tile");
	    }
	    seen.add(key);
	  }
	}
	function validateChunkSize(value) {
	  if (!Number.isInteger(value) || value <= 0 || value > MAX_WORLD_GENERATION_CHUNK_SIZE) {
	    throw new RangeError(`chunkSize must be an integer between 1 and ${MAX_WORLD_GENERATION_CHUNK_SIZE}`);
	  }
	}
	function abortError2() {
	  if (typeof DOMException !== "undefined") return new DOMException("World chunk request was aborted", "AbortError");
	  const error = new Error("World chunk request was aborted");
	  error.name = "AbortError";
	  return error;
	}
	var StaticWorldSource = class {
	  constructor(map, options = {}) {
	    this.disposed = false;
	    assertWrappableMap(map);
	    if (map.infinite) throw new TypeError("StaticWorldSource requires a finite MapInfo");
	    this.map = map;
	    this.chunkSize = options.chunkSize ?? DEFAULT_WORLD_GENERATION_CHUNK_SIZE;
	    validateChunkSize(this.chunkSize);
	    this.bounds = {
	      width: map.w,
	      height: map.h,
	      wrapX: map.wrapX ?? false,
	      wrapY: map.wrapY ?? false
	    };
	    this.chunkCountX = Math.ceil(map.w / this.chunkSize);
	    this.chunkCountY = Math.ceil(map.h / this.chunkSize);
	  }
	  resolveChunk(chunkX, chunkY) {
	    if (!Number.isInteger(chunkX) || !Number.isInteger(chunkY)) return void 0;
	    const x = this.bounds.wrapX ? positiveModulo(chunkX, this.chunkCountX) : chunkX;
	    const y = this.bounds.wrapY ? positiveModulo(chunkY, this.chunkCountY) : chunkY;
	    if (x < 0 || x >= this.chunkCountX || y < 0 || y >= this.chunkCountY) return void 0;
	    return { x, y };
	  }
	  chunkDistance(chunkX, chunkY, centerChunkX, centerChunkY) {
	    let dx = Math.abs(chunkX - centerChunkX);
	    let dy = Math.abs(chunkY - centerChunkY);
	    if (this.bounds.wrapX) dx = Math.min(dx, this.chunkCountX - dx);
	    if (this.bounds.wrapY) dy = Math.min(dy, this.chunkCountY - dy);
	    return Math.hypot(dx, dy);
	  }
	  loadChunk(chunkX, chunkY, request = {}) {
	    if (this.disposed) return Promise.reject(new Error("StaticWorldSource has been disposed"));
	    if (request.signal?.aborted) return Promise.reject(abortError2());
	    const resolved = this.resolveChunk(chunkX, chunkY);
	    if (!resolved || resolved.x !== chunkX || resolved.y !== chunkY) {
	      return Promise.reject(new RangeError("static world chunk coordinates are outside the canonical bounds"));
	    }
	    const startX = chunkX * this.chunkSize;
	    const startY = chunkY * this.chunkSize;
	    const endX = Math.min(this.map.w, startX + this.chunkSize);
	    const endY = Math.min(this.map.h, startY + this.chunkSize);
	    const coreTiles = [];
	    for (let x = startX; x < endX; x += 1) {
	      for (let y = startY; y < endY; y += 1) {
	        if (this.map.data[x]?.[y]) coreTiles.push({ x, y });
	      }
	    }
	    return Promise.resolve({ chunkX, chunkY, chunkSize: this.chunkSize, coreTiles });
	  }
	  releaseChunk(_chunk) {
	  }
	  hasChunk(chunkX, chunkY) {
	    const resolved = this.resolveChunk(chunkX, chunkY);
	    return resolved?.x === chunkX && resolved.y === chunkY;
	  }
	  hasTile(x, y) {
	    return getMapTile(this.map, x, y) !== void 0;
	  }
	  dispose() {
	    this.disposed = true;
	  }
	};
	var ProceduralWorldSource = class {
	  constructor(options, dependencies = {}) {
	    this.disposed = false;
	    if (!options || typeof options !== "object") throw new TypeError("procedural world options are required");
	    if (options.workerCount !== void 0 && (!Number.isInteger(options.workerCount) || options.workerCount <= 0 || options.workerCount > 8)) {
	      throw new RangeError("workerCount must be an integer between 1 and 8");
	    }
	    this.chunkSize = options.chunkSize ?? DEFAULT_WORLD_GENERATION_CHUNK_SIZE;
	    validateChunkSize(this.chunkSize);
	    this.seed = options.seed;
	    this.store = dependencies.store ?? new SparseWorldChunkStore();
	    this.pool = dependencies.pool ?? new WorldGeneratorPool(options.workerUrl, { size: options.workerCount });
	  }
	  get map() {
	    return this.store.map;
	  }
	  get stats() {
	    return this.pool.stats;
	  }
	  resolveChunk(chunkX, chunkY) {
	    return Number.isSafeInteger(chunkX) && Number.isSafeInteger(chunkY) ? { x: chunkX, y: chunkY } : void 0;
	  }
	  chunkDistance(chunkX, chunkY, centerChunkX, centerChunkY) {
	    return Math.hypot(chunkX - centerChunkX, chunkY - centerChunkY);
	  }
	  async loadChunk(chunkX, chunkY, request = {}) {
	    if (this.disposed) throw new Error("ProceduralWorldSource has been disposed");
	    const packed = await this.pool.generateChunk(
	      { seed: this.seed, chunkX, chunkY, chunkSize: this.chunkSize },
	      request
	    );
	    if (request.signal?.aborted) throw abortError2();
	    const coreTiles = this.store.add(packed);
	    return { chunkX, chunkY, chunkSize: this.chunkSize, coreTiles, payload: packed };
	  }
	  releaseChunk(chunk) {
	    this.store.remove(chunk.chunkX, chunk.chunkY);
	  }
	  hasChunk(chunkX, chunkY) {
	    return this.store.hasChunk(chunkX, chunkY);
	  }
	  hasTile(x, y) {
	    return this.store.hasCoreTile(x, y);
	  }
	  dispose() {
	    if (this.disposed) return;
	    this.disposed = true;
	    this.pool.dispose();
	    this.store.clear();
	  }
	};
	function packedChunkFromWorldChunk(chunk) {
	  if (!(chunk.payload instanceof Object) || !("tiles" in chunk.payload)) return void 0;
	  const packed = chunk.payload;
	  assertPackedWorldChunk(packed);
	  if (packed.chunkX !== chunk.chunkX || packed.chunkY !== chunk.chunkY || packed.chunkSize !== chunk.chunkSize) {
	    throw new TypeError("packed payload does not match its world chunk");
	  }
	  return packed;
	}
	function getWorldSourceTile(source, x, y) {
	  return source.hasTile(x, y) ? getMapTile(source.map, x, y) : void 0;
	}

	// src/world/WorldStreamer.ts
	function integerOption(name, value, minimum) {
	  if (!Number.isInteger(value) || value < minimum) {
	    throw new RangeError(`${name} must be an integer >= ${minimum}`);
	  }
	}
	function abortError3(message) {
	  if (typeof DOMException !== "undefined") return new DOMException(message, "AbortError");
	  const error = new Error(message);
	  error.name = "AbortError";
	  return error;
	}
	function waitForRetry(delayMs, signal) {
	  if (signal.aborted) return Promise.reject(abortError3("Chunk retry was aborted"));
	  return new Promise((resolve, reject) => {
	    const timeout = setTimeout(() => {
	      signal.removeEventListener("abort", abort);
	      resolve();
	    }, delayMs);
	    const abort = () => {
	      clearTimeout(timeout);
	      reject(abortError3("Chunk retry was aborted"));
	    };
	    signal.addEventListener("abort", abort, { once: true });
	  });
	}
	var WorldStreamer = class _WorldStreamer {
	  constructor(source, handlers, options = {}) {
	    this.source = source;
	    this.handlers = handlers;
	    this.residents = /* @__PURE__ */ new Map();
	    this.pending = /* @__PURE__ */ new Map();
	    this.wanted = /* @__PURE__ */ new Set();
	    this.centerChunkX = 0;
	    this.centerChunkY = 0;
	    this.disposed = false;
	    this.completed = 0;
	    this.retried = 0;
	    this.failed = 0;
	    assertWorldSource(source);
	    this.loadRadius = options.loadRadius ?? 3;
	    this.retentionRadius = options.retentionRadius ?? this.loadRadius + 1;
	    this.maxResidentChunks = options.maxResidentChunks ?? (this.retentionRadius * 2 + 1) ** 2;
	    this.maxRetries = options.maxRetries ?? 2;
	    this.retryBaseDelayMs = options.retryBaseDelayMs ?? 100;
	    integerOption("loadRadius", this.loadRadius, 0);
	    integerOption("retentionRadius", this.retentionRadius, this.loadRadius);
	    integerOption("maxResidentChunks", this.maxResidentChunks, 1);
	    integerOption("maxRetries", this.maxRetries, 0);
	    integerOption("retryBaseDelayMs", this.retryBaseDelayMs, 0);
	  }
	  setCenterTile(x, y) {
	    if (this.disposed) return Promise.reject(new Error("WorldStreamer has been disposed"));
	    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) {
	      return Promise.reject(new RangeError("streaming center must use safe integer tile coordinates"));
	    }
	    const rawX = Math.floor(x / this.source.chunkSize);
	    const rawY = Math.floor(y / this.source.chunkSize);
	    const center = this.source.resolveChunk(rawX, rawY);
	    if (!center) return Promise.reject(new RangeError("streaming center is outside the world bounds"));
	    const changed = center.x !== this.centerChunkX || center.y !== this.centerChunkY || this.wanted.size === 0;
	    this.centerChunkX = center.x;
	    this.centerChunkY = center.y;
	    if (changed) this.refreshDemand();
	    return this.requestChunk(center.x, center.y, 0);
	  }
	  get stats() {
	    const source = this.source.stats;
	    return {
	      centerChunkX: this.centerChunkX,
	      centerChunkY: this.centerChunkY,
	      residentChunks: this.residents.size,
	      pendingChunks: this.pending.size,
	      queuedChunks: source?.queued ?? 0,
	      busyWorkers: source?.busyWorkers ?? 0,
	      completedChunks: source?.completed ?? this.completed,
	      retriedChunkRequests: this.retried,
	      failedChunks: this.failed
	    };
	  }
	  get residentChunks() {
	    return [...this.residents.values()];
	  }
	  hasResident(chunkX, chunkY) {
	    return this.residents.has(_WorldStreamer.key(chunkX, chunkY));
	  }
	  dispose(disposeSource = true) {
	    if (this.disposed) return;
	    this.disposed = true;
	    for (const request of this.pending.values()) request.controller.abort();
	    this.pending.clear();
	    for (const chunk of this.residents.values()) this.unload(chunk);
	    this.residents.clear();
	    if (disposeSource) this.source.dispose();
	  }
	  refreshDemand() {
	    const coordinateByKey = /* @__PURE__ */ new Map();
	    for (let dx = -this.loadRadius; dx <= this.loadRadius; dx += 1) {
	      for (let dy = -this.loadRadius; dy <= this.loadRadius; dy += 1) {
	        const distance = Math.hypot(dx, dy);
	        if (distance > this.loadRadius + 0.5) continue;
	        const resolved = this.source.resolveChunk(this.centerChunkX + dx, this.centerChunkY + dy);
	        if (!resolved) continue;
	        const key = _WorldStreamer.key(resolved.x, resolved.y);
	        const existing = coordinateByKey.get(key);
	        if (!existing || distance < existing.distance) {
	          coordinateByKey.set(key, { ...resolved, distance, key });
	        }
	      }
	    }
	    const coordinates = [...coordinateByKey.values()].sort((a, b) => a.distance - b.distance || a.x - b.x || a.y - b.y);
	    this.wanted = new Set(coordinates.map((coordinate) => coordinate.key));
	    for (const [key, request] of this.pending) {
	      if (!this.wanted.has(key)) request.controller.abort();
	    }
	    for (const coordinate of coordinates) {
	      if (!this.residents.has(coordinate.key) && !this.pending.has(coordinate.key)) {
	        void this.requestChunk(coordinate.x, coordinate.y, coordinate.distance).catch((error) => {
	          if (error instanceof Error && error.name !== "AbortError") this.reportError(error);
	        });
	      }
	    }
	    this.evictOutsideRetention();
	  }
	  requestChunk(chunkX, chunkY, priority) {
	    const key = _WorldStreamer.key(chunkX, chunkY);
	    const resident = this.residents.get(key);
	    if (resident) return Promise.resolve(resident);
	    const existing = this.pending.get(key);
	    if (existing) return existing.promise;
	    const controller = new AbortController();
	    const promise = this.loadWithRetry(chunkX, chunkY, priority, controller.signal).then((chunk) => {
	      if (this.disposed || !this.wanted.has(key)) {
	        this.source.releaseChunk(chunk);
	        throw abortError3("Chunk is no longer wanted");
	      }
	      this.residents.set(key, chunk);
	      try {
	        this.handlers.chunkLoaded(chunk);
	      } catch (reason) {
	        this.residents.delete(key);
	        this.unload(chunk);
	        throw reason;
	      }
	      this.completed += 1;
	      this.enforceResidentLimit();
	      return chunk;
	    }).finally(() => {
	      this.pending.delete(key);
	    });
	    this.pending.set(key, { controller, promise });
	    return promise;
	  }
	  async loadWithRetry(chunkX, chunkY, priority, signal) {
	    for (let attempt = 0; ; attempt += 1) {
	      try {
	        const chunk = await this.source.loadChunk(chunkX, chunkY, { priority, signal });
	        try {
	          assertWorldChunk(this.source, chunk, chunkX, chunkY);
	        } catch (reason) {
	          this.source.releaseChunk(chunk);
	          throw reason;
	        }
	        return chunk;
	      } catch (reason) {
	        const error = reason instanceof Error ? reason : new Error(String(reason));
	        if (signal.aborted || error.name === "AbortError") throw error;
	        if (error instanceof TypeError || attempt >= this.maxRetries) {
	          this.failed += 1;
	          throw error;
	        }
	        this.retried += 1;
	        this.reportError(error);
	        await waitForRetry(this.retryBaseDelayMs * 2 ** attempt, signal);
	      }
	    }
	  }
	  evictOutsideRetention() {
	    for (const [key, chunk] of this.residents) {
	      const distance = this.source.chunkDistance(
	        chunk.chunkX,
	        chunk.chunkY,
	        this.centerChunkX,
	        this.centerChunkY
	      );
	      if (distance <= this.retentionRadius + 0.5) continue;
	      this.residents.delete(key);
	      this.unload(chunk);
	    }
	  }
	  enforceResidentLimit() {
	    if (this.residents.size <= this.maxResidentChunks) return;
	    const candidates = [...this.residents.entries()].filter(([key]) => !this.wanted.has(key)).sort((a, b) => this.distanceFromCenter(b[1]) - this.distanceFromCenter(a[1]));
	    while (this.residents.size > this.maxResidentChunks && candidates.length > 0) {
	      const [key, chunk] = candidates.shift();
	      this.residents.delete(key);
	      this.unload(chunk);
	    }
	  }
	  distanceFromCenter(chunk) {
	    return this.source.chunkDistance(chunk.chunkX, chunk.chunkY, this.centerChunkX, this.centerChunkY);
	  }
	  unload(chunk) {
	    try {
	      this.handlers.chunkUnloading(chunk);
	    } catch (reason) {
	      this.reportError(reason);
	    }
	    try {
	      this.source.releaseChunk(chunk);
	    } catch (reason) {
	      this.reportError(reason);
	    }
	  }
	  reportError(reason) {
	    try {
	      this.handlers.error?.(reason instanceof Error ? reason : new Error(String(reason)));
	    } catch {
	    }
	  }
	  static key(chunkX, chunkY) {
	    return `${chunkX},${chunkY}`;
	  }
	};

	// src/HexMap.ts
	var DEFAULT_OPTIONS = {
	  size: 40,
	  texturesBaseUrl: "textures/",
	  gridVisible: true,
	  gridColor: 4338219,
	  gridWidth: 0.04,
	  gridOpacity: 0.35,
	  selectorColor: 16776960,
	  pointerColor: 15658734,
	  treesPerTile: 20,
	  waterColorShallow: LandColor["coastal" /* coastal */],
	  waterColorDeep: LandColor["sea" /* sea */],
	  waterWaveAmplitude: 1.6,
	  waterWaveFrequency: 1,
	  waterWaveSpeed: 1,
	  waterSparkleIntensity: 1,
	  waterFresnelIntensity: 1,
	  coastalWavesEnabled: true,
	  coastalWaveColor: 16777215,
	  coastalWaveCount: 3,
	  coastalWaveSpeed: 0.6,
	  coastalWaveWidth: 0.3,
	  coastalWaveRange: 0.8,
	  coastalWaveDistortion: 0.5,
	  coastalWaveOpacity: 0.85,
	  beachWidth: 0.35,
	  landBlendWidth: 0.5,
	  waterCornerRounding: 0.4,
	  coastCurvature: 0.5,
	  landBlendCurvature: 0.5,
	  riverWidth: 0.28,
	  riverBankWidth: 0.14,
	  riverCurvature: 0.5,
	  riverBankColor: 11059050,
	  riverFlowSpeed: 1,
	  lakeShoreWidth: 0.18,
	  treeModel: "Assets/models/pinia",
	  treeScale: 1,
	  cityModel: "Assets/models/monument",
	  cityScale: 1,
	  grassEnabled: true,
	  grassDensity: 60,
	  grassBladeWidth: 1.2,
	  grassBladeHeight: 7.2,
	  grassWindStrength: 2.5,
	  grassWindSpeed: 1.2,
	  fogTexture: "war-fog.jpg",
	  fogDarkenFactor: 0.45,
	  renderDistance: 2400,
	  lodEnabled: true,
	  lodNearDistance: 900,
	  lodFarDistance: 1650,
	  vegetationRenderDistance: 1450,
	  chunkLodHysteresis: 120,
	  gpuChunkCacheSize: 128,
	  cpuChunkCacheSize: 192
	};
	var HexMap = class extends EventEmitter {
	  constructor(options) {
	    super();
	    this.worldCopies = [];
	    this.worldCopyMaterials = [];
	    this.worldCopyMaterialCache = /* @__PURE__ */ new Map();
	    this.worldPatternOffset = new three.Vector2();
	    this.pressedMovementKeys = /* @__PURE__ */ new Set();
	    this.frameTasks = new FrameTaskScheduler({ error: (error) => this.emit("error", error) });
	    this.disposed = false;
	    this.loadRevision = 0;
	    this.forestRevision = 0;
	    this.worldChunkLayers = /* @__PURE__ */ new Map();
	    this.streamedGrassByChunkId = /* @__PURE__ */ new Map();
	    this.streamedForestByChunkId = /* @__PURE__ */ new Map();
	    this.worldLayerRevision = 0;
	    this.worldChunkSize = 24;
	    this.renderOrigin = new three.Vector2();
	    this.logicalTargetScratch = new three.Vector3();
	    this.floatingOriginThreshold = 8192;
	    this.mouseDownAt = null;
	    // screen coords, used to distinguish click vs. drag
	    this.lastHover = null;
	    this.lastSelected = null;
	    this.warFogShown = true;
	    this.onContextMenu = (event) => event.preventDefault();
	    this.handleResize = () => {
	      const width = this.canvas.clientWidth || window.innerWidth;
	      const height = this.canvas.clientHeight || window.innerHeight;
	      if (width <= 0 || height <= 0) return;
	      this.camera.aspect = width / height;
	      this.camera.updateProjectionMatrix();
	      this.renderer.setPixelRatio(window.devicePixelRatio);
	      this.renderer.setSize(width, height, false);
	    };
	    this.animate = (t) => {
	      if (this.disposed) return;
	      const dtS = this.lastFrameTime === void 0 ? 0 : (t - this.lastFrameTime) / 1e3;
	      this.lastFrameTime = t;
	      this.updateKeyboardMovement(Math.min(dtS, 0.05));
	      this.controls.update(dtS);
	      this.wrapCameraToWorld();
	      this.rebaseWorld();
	      this.updateWorldDemand();
	      this.frameTasks.runFrame();
	      this.updateWorldChunkVisibility();
	      this.terrain?.update(dtS);
	      const grassResources = /* @__PURE__ */ new Set();
	      if (this.grass) grassResources.add(this.grass.resources);
	      for (const record of this.worldChunkLayers.values()) {
	        if (record.grass) grassResources.add(record.grass.resources);
	      }
	      for (const resources of grassResources) resources.update(dtS);
	      this.emit("frame", { t, dtS });
	      this.renderer.render(this.scene, this.camera);
	      this.animationFrameId = window.requestAnimationFrame(this.animate);
	    };
	    this.onKeyDown = (event) => {
	      if (!this.isMovementKey(event.code) || this.isTextInput(event.target)) return;
	      this.pressedMovementKeys.add(event.code);
	      event.preventDefault();
	    };
	    this.onKeyUp = (event) => {
	      if (!this.isMovementKey(event.code)) return;
	      this.pressedMovementKeys.delete(event.code);
	      event.preventDefault();
	    };
	    this.clearMovementKeys = () => {
	      this.pressedMovementKeys.clear();
	    };
	    //-------------------------------------------------------------------------
	    //Picking (analytic, ground-plane based - see helpers/picking.ts)
	    //-------------------------------------------------------------------------
	    this.onMouseDown = (event) => {
	      if (event.button !== 0) {
	        this.mouseDownAt = null;
	        return;
	      }
	      this.mouseDownAt = { x: event.clientX, y: event.clientY };
	    };
	    this.onPointerMove = (event) => {
	      const ground = screenToGround(event.clientX, event.clientY, this.canvas, this.camera);
	      if (!ground) {
	        this.pointer.visible = false;
	        this.lastHover = null;
	        return;
	      }
	      this.logicalGround(ground);
	      const tileCoords = pickTile(
	        ground,
	        this.options.size,
	        this.mapData?.infinite ? void 0 : this.mapData?.w,
	        this.mapData?.infinite ? void 0 : this.mapData?.h,
	        this.mapData?.wrapX,
	        this.mapData?.wrapY
	      );
	      if (!tileCoords) {
	        this.pointer.visible = false;
	        this.lastHover = null;
	        return;
	      }
	      if (this.lastHover && this.lastHover.x === tileCoords.x && this.lastHover.y === tileCoords.y) return;
	      this.lastHover = tileCoords;
	      const tile = this.getTile(tileCoords.x, tileCoords.y);
	      if (!tile) {
	        this.pointer.visible = false;
	        this.lastHover = null;
	        return;
	      }
	      this.pointer.visible = true;
	      this.pointer.position.setX(tileCoords.worldX);
	      this.pointer.position.setZ(tileCoords.worldY);
	      this.emit("hover", { x: tileCoords.x, y: tileCoords.y, tile });
	    };
	    this.onMouseUp = (event) => {
	      if (event.button !== 0) return;
	      const downAt = this.mouseDownAt;
	      this.mouseDownAt = null;
	      if (!downAt) return;
	      const dragDistance = Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y);
	      if (dragDistance > 4) return;
	      const ground = screenToGround(event.clientX, event.clientY, this.canvas, this.camera);
	      if (!ground) return;
	      this.logicalGround(ground);
	      const tileCoords = pickTile(
	        ground,
	        this.options.size,
	        this.mapData?.infinite ? void 0 : this.mapData?.w,
	        this.mapData?.infinite ? void 0 : this.mapData?.h,
	        this.mapData?.wrapX,
	        this.mapData?.wrapY
	      );
	      if (!tileCoords) return;
	      const tile = this.getTile(tileCoords.x, tileCoords.y);
	      if (!tile) return;
	      this.selectTile(tileCoords.x, tileCoords.y);
	      this.selector.position.setX(tileCoords.worldX);
	      this.selector.position.setZ(tileCoords.worldY);
	      this.emit("click", { x: tileCoords.x, y: tileCoords.y, tile });
	    };
	    if (!options || typeof options !== "object") throw new TypeError("HexMap options are required");
	    const size = options.size ?? DEFAULT_OPTIONS.size;
	    const grassBladeHeight = options.grassBladeHeight ?? size * 0.18;
	    const waterDepth = options.waterDepth ?? size * 0.25;
	    this.options = {
	      ...DEFAULT_OPTIONS,
	      ...options,
	      waterDepth,
	      fogTextureSize: options.fogTextureSize ?? size * 8,
	      riverColorShallow: options.riverColorShallow ?? options.waterColorShallow ?? DEFAULT_OPTIONS.waterColorShallow,
	      riverColorDeep: options.riverColorDeep ?? options.waterColorDeep ?? DEFAULT_OPTIONS.waterColorDeep,
	      riverDepth: options.riverDepth ?? waterDepth * 0.6,
	      mountainHeight: options.mountainHeight ?? size * 0.6,
	      grassBladeWidth: options.grassBladeWidth ?? size * 0.03,
	      grassBladeHeight,
	      grassWindStrength: options.grassWindStrength ?? grassBladeHeight * 0.35
	    };
	    this.validateOptions();
	    const schedulerOptions = createDefaultWorldChunkSchedulerOptions();
	    this.chunkScheduler = new WorldChunkScheduler({
	      ...schedulerOptions,
	      renderDistance: this.options.renderDistance,
	      lodEnabled: this.options.lodEnabled,
	      lodDistances: {
	        near: this.options.lodNearDistance,
	        far: this.options.lodFarDistance,
	        vegetation: this.options.vegetationRenderDistance,
	        hysteresis: this.options.chunkLodHysteresis
	      },
	      gpuCacheSize: this.options.gpuChunkCacheSize,
	      cpuCacheSize: this.options.cpuChunkCacheSize
	    });
	    const el = document.querySelector(this.options.element);
	    if (!(el instanceof HTMLCanvasElement)) {
	      throw new Error(`HexMap: element "${this.options.element}" is not a <canvas>`);
	    }
	    this.canvas = el;
	    this.setupScene();
	    this.setupCamera();
	    this.setupLights();
	    this.setupSky();
	    this.setupControls();
	    this.setupMarkers();
	    this.setupEvents();
	    this.handleResize();
	    this.animationFrameId = window.requestAnimationFrame(this.animate);
	  }
	  validateOptions() {
	    const positive = (name, value) => {
	      if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be a positive finite number`);
	    };
	    const nonNegativeInteger = (name, value) => {
	      if (!Number.isInteger(value) || value < 0) throw new RangeError(`${name} must be a non-negative integer`);
	    };
	    positive("size", this.options.size);
	    positive("renderDistance", this.options.renderDistance);
	    if (this.options.lodNearDistance < 0 || this.options.lodFarDistance < this.options.lodNearDistance) {
	      throw new RangeError("LOD distances must be non-negative and lodFarDistance must be >= lodNearDistance");
	    }
	    if (this.options.vegetationRenderDistance < 0 || this.options.chunkLodHysteresis < 0) {
	      throw new RangeError("vegetationRenderDistance and chunkLodHysteresis must be non-negative");
	    }
	    nonNegativeInteger("gpuChunkCacheSize", this.options.gpuChunkCacheSize);
	    nonNegativeInteger("cpuChunkCacheSize", this.options.cpuChunkCacheSize);
	    nonNegativeInteger("treesPerTile", this.options.treesPerTile);
	    nonNegativeInteger("grassDensity", this.options.grassDensity);
	    positive("grassBladeWidth", this.options.grassBladeWidth);
	    positive("grassBladeHeight", this.options.grassBladeHeight);
	    if (!Number.isFinite(this.options.treeScale) || this.options.treeScale < 0) {
	      throw new RangeError("treeScale must be a non-negative finite number");
	    }
	    for (const [name, value] of [
	      ["waterCornerRounding", this.options.waterCornerRounding],
	      ["coastCurvature", this.options.coastCurvature],
	      ["landBlendCurvature", this.options.landBlendCurvature],
	      ["coastalWaveWidth", this.options.coastalWaveWidth],
	      ["coastalWaveRange", this.options.coastalWaveRange],
	      ["coastalWaveDistortion", this.options.coastalWaveDistortion],
	      ["coastalWaveOpacity", this.options.coastalWaveOpacity],
	      ["riverCurvature", this.options.riverCurvature],
	      ["lakeShoreWidth", this.options.lakeShoreWidth]
	    ]) {
	      if (!Number.isFinite(value) || value < 0 || value > 1) {
	        throw new RangeError(`${name} must be a finite number between 0 and 1`);
	      }
	    }
	  }
	  //-------------------------------------------------------------------------
	  //Scene / renderer / camera / controls
	  //-------------------------------------------------------------------------
	  setupScene() {
	    this.scene = new three.Scene();
	    this.scene.background = new three.Color(10471906);
	    this.worldRoot = new three.Group();
	    this.worldRoot.name = "hex-map-world-root";
	    this.scene.add(this.worldRoot);
	    this.renderer = new three.WebGLRenderer({ canvas: this.canvas, antialias: true });
	    this.renderer.toneMapping = three.ACESFilmicToneMapping;
	    this.renderer.toneMappingExposure = 0.65;
	  }
	  setupCamera() {
	    this.camera = new three.PerspectiveCamera(60, 1, 10, 1e5);
	    this.camera.position.set(900, 500, 1e3);
	    this.scene.add(this.camera);
	  }
	  setupLights() {
	    const dirLight1 = new three.DirectionalLight(16777215);
	    dirLight1.position.set(1, 1, 1);
	    this.scene.add(dirLight1);
	    const dirLight2 = new three.DirectionalLight(8840);
	    dirLight2.position.set(-1, -1, -1);
	    this.scene.add(dirLight2);
	    this.scene.add(new three.AmbientLight(2236962));
	  }
	  setupSky() {
	    this.sky = new Sky();
	    this.sky.scale.setScalar(45e4);
	    this.sky.frustumCulled = false;
	    const uniforms = this.sky.material.uniforms;
	    uniforms.turbidity.value = 4;
	    uniforms.rayleigh.value = 1.7;
	    uniforms.mieCoefficient.value = 2e-3;
	    uniforms.mieDirectionalG.value = 0.76;
	    const elevation = 24 * Math.PI / 180;
	    const azimuth = 205 * Math.PI / 180;
	    const sun = new three.Vector3().setFromSphericalCoords(1, Math.PI / 2 - elevation, azimuth);
	    uniforms.sunPosition.value.copy(sun);
	    this.scene.add(this.sky);
	  }
	  setupControls() {
	    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
	    this.controls.mouseButtons = { LEFT: null, MIDDLE: three.MOUSE.DOLLY, RIGHT: three.MOUSE.ROTATE };
	    this.controls.touches = { ONE: three.TOUCH.PAN, TWO: three.TOUCH.DOLLY_ROTATE };
	    this.controls.enableDamping = true;
	    this.controls.dampingFactor = 0.05;
	    this.controls.screenSpacePanning = false;
	    this.controls.minDistance = 100;
	    this.controls.maxDistance = 800;
	    this.controls.minAzimuthAngle = -Infinity;
	    this.controls.maxAzimuthAngle = Infinity;
	    this.controls.minPolarAngle = 15 * (Math.PI / 180);
	    this.controls.maxPolarAngle = 85 * (Math.PI / 180);
	  }
	  //The initial camera position/target (set in setupCamera(), before map data
	  //is known) looks at world origin, which is only the map's (0,0) corner, not
	  //its middle - most maps would load with the camera pointed off to one side
	  //of the actual content. Re-centers the existing look-at *angle* (the
	  //direction from target to camera, already tuned via min/maxAzimuth/PolarAngle)
	  //on the map's real center instead, at a fixed, in-range viewing distance.
	  frameMap(mapData) {
	    this.resetRenderOrigin();
	    const size = this.options.size;
	    const corner00 = getHexCenter(0, 0, size);
	    const cornerWH = getHexCenter(mapData.w - 1, mapData.h - 1, size);
	    const centerX = (corner00.x + cornerWH.x) / 2;
	    const centerZ = (corner00.y + cornerWH.y) / 2;
	    const viewDistance = (this.controls.minDistance + this.controls.maxDistance) / 2;
	    const direction = this.camera.position.clone().sub(this.controls.target).normalize();
	    this.controls.target.set(centerX, 0, centerZ);
	    this.camera.position.copy(this.controls.target).addScaledVector(direction, viewDistance);
	    this.controls.update();
	  }
	  get worldPeriodX() {
	    return this.mapData ? this.mapData.w * this.options.size * 1.5 : 0;
	  }
	  get worldPeriodY() {
	    return this.mapData ? this.mapData.h * this.options.size * Math.sqrt(3) : 0;
	  }
	  wrapCameraToWorld() {
	    if (!this.mapData) return;
	    let shifted = false;
	    let patternShiftX = 0;
	    let patternShiftY = 0;
	    if (this.mapData.wrapX && this.worldPeriodX > 0) {
	      const wrapped = positiveModulo(this.controls.target.x, this.worldPeriodX);
	      const delta = wrapped - this.controls.target.x;
	      if (Math.abs(delta) > 1e-4) {
	        this.controls.target.x += delta;
	        this.camera.position.x += delta;
	        patternShiftX -= delta;
	        shifted = true;
	      }
	    }
	    if (this.mapData.wrapY && this.worldPeriodY > 0) {
	      const wrapped = positiveModulo(this.controls.target.z, this.worldPeriodY);
	      const delta = wrapped - this.controls.target.z;
	      if (Math.abs(delta) > 1e-4) {
	        this.controls.target.z += delta;
	        this.camera.position.z += delta;
	        patternShiftY -= delta;
	        shifted = true;
	      }
	    }
	    if (shifted) {
	      this.shiftWorldPattern(patternShiftX, patternShiftY);
	      this.updateMarkerPositions();
	    }
	  }
	  nearestRepeatedCenter(x, y, reference = this.getCameraTarget()) {
	    const center = getHexCenter(x, y, this.options.size);
	    if (this.mapData?.wrapX && this.worldPeriodX > 0) {
	      center.x += Math.round((reference.x - center.x) / this.worldPeriodX) * this.worldPeriodX;
	    }
	    if (this.mapData?.wrapY && this.worldPeriodY > 0) {
	      center.y += Math.round((reference.z - center.y) / this.worldPeriodY) * this.worldPeriodY;
	    }
	    return center;
	  }
	  positionMarker(marker, tile, reference = this.getCameraTarget()) {
	    const center = this.nearestRepeatedCenter(tile.x, tile.y, reference);
	    marker.position.setX(center.x);
	    marker.position.setZ(center.y);
	  }
	  updateMarkerPositions() {
	    if (this.lastHover && this.pointer.visible) this.positionMarker(this.pointer, this.lastHover);
	    if (this.lastSelected && this.selector.visible) this.positionMarker(this.selector, this.lastSelected);
	  }
	  clearWorldCopies() {
	    this.chunkScheduler.invalidateScene();
	    for (const copy of this.worldCopies) this.worldRoot.remove(copy);
	    for (const material of this.worldCopyMaterials) material.dispose();
	    this.worldCopies = [];
	    this.worldCopyMaterials = [];
	    this.worldCopyMaterialCache.clear();
	  }
	  materialForWorldCopy(material, offsetX, offsetY) {
	    if (!(material instanceof three.RawShaderMaterial) || !material.uniforms.worldOffset) return material;
	    const cacheKey = `${material.uuid}:${offsetX}:${offsetY}`;
	    const cached = this.worldCopyMaterialCache.get(cacheKey);
	    if (cached) return cached;
	    const copy = material.clone();
	    copy.uniforms = {
	      ...material.uniforms,
	      worldOffset: { value: new three.Vector2(
	        this.worldPatternOffset.x + offsetX,
	        this.worldPatternOffset.y + offsetY
	      ) }
	    };
	    this.worldCopyMaterials.push(copy);
	    this.worldCopyMaterialCache.set(cacheKey, copy);
	    return copy;
	  }
	  applyWorldPatternToObject(object) {
	    object?.traverse((child) => {
	      const mesh = child;
	      if (!mesh.isMesh) return;
	      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
	      for (const material of materials) {
	        if (material instanceof three.RawShaderMaterial && material.uniforms.worldOffset) {
	          material.uniforms.worldOffset.value.copy(this.worldPatternOffset);
	        }
	      }
	    });
	  }
	  shiftWorldPattern(offsetX, offsetY) {
	    if (offsetX === 0 && offsetY === 0) return;
	    this.worldPatternOffset.x += offsetX;
	    this.worldPatternOffset.y += offsetY;
	    this.applyWorldPatternToObject(this.terrain);
	    this.applyWorldPatternToObject(this.grass);
	    for (const record of this.worldChunkLayers.values()) this.applyWorldPatternToObject(record.grass);
	    for (const material of this.worldCopyMaterials) {
	      material.uniforms.worldOffset.value.x += offsetX;
	      material.uniforms.worldOffset.value.y += offsetY;
	    }
	  }
	  cloneWorldObject(source, offsetX, offsetY) {
	    let copy;
	    if (source instanceof three.InstancedMesh) {
	      const instancedCopy = new three.InstancedMesh(source.geometry, source.material, source.count);
	      instancedCopy.copy(source, false);
	      instancedCopy.instanceMatrix = source.instanceMatrix;
	      instancedCopy.instanceColor = source.instanceColor;
	      instancedCopy.count = source.count;
	      copy = instancedCopy;
	    } else {
	      copy = source.clone(true);
	      const sourceInstances = [];
	      const copyInstances = [];
	      source.traverse((object) => {
	        if (object.isInstancedMesh) sourceInstances.push(object);
	      });
	      copy.traverse((object) => {
	        if (object.isInstancedMesh) copyInstances.push(object);
	      });
	      copyInstances.forEach((instance, index) => {
	        const original = sourceInstances[index];
	        if (!original) return;
	        instance.instanceMatrix = original.instanceMatrix;
	        instance.instanceColor = original.instanceColor;
	        instance.count = original.count;
	      });
	    }
	    copy.traverse((object) => {
	      const mesh = object;
	      if (!mesh.isMesh) return;
	      if (Array.isArray(mesh.material)) {
	        mesh.material = mesh.material.map((material) => this.materialForWorldCopy(material, offsetX, offsetY));
	      } else {
	        mesh.material = this.materialForWorldCopy(mesh.material, offsetX, offsetY);
	      }
	    });
	    return copy;
	  }
	  copyOffsets(wrapped, period) {
	    if (!wrapped || period <= 0) return [0];
	    const radius = Math.max(1, Math.ceil(this.options.renderDistance / period));
	    return Array.from({ length: radius * 2 + 1 }, (_, index) => index - radius);
	  }
	  worldCopyCanBecomeVisible(source, offsetX, offsetY) {
	    const metadata = getWorldChunkMetadata(source);
	    if (!metadata) return true;
	    const padding = this.options.renderDistance;
	    const bounds = metadata.bounds;
	    return bounds.maxX + source.position.x + offsetX >= -padding && bounds.minX + source.position.x + offsetX <= this.worldPeriodX + padding && bounds.maxZ + source.position.z + offsetY >= -padding && bounds.minZ + source.position.z + offsetY <= this.worldPeriodY + padding;
	  }
	  refreshWorldCopies() {
	    this.clearWorldCopies();
	    if (!this.mapData || !this.mapData.wrapX && !this.mapData.wrapY) return;
	    const xOffsets = this.copyOffsets(this.mapData.wrapX, this.worldPeriodX);
	    const yOffsets = this.copyOffsets(this.mapData.wrapY, this.worldPeriodY);
	    for (const copyX of xOffsets) {
	      for (const copyY of yOffsets) {
	        if (copyX === 0 && copyY === 0) continue;
	        const offsetX = copyX * this.worldPeriodX;
	        const offsetY = copyY * this.worldPeriodY;
	        const group = new three.Group();
	        group.position.set(offsetX, 0, offsetY);
	        for (const child of this.terrain?.children ?? []) {
	          if (!this.worldCopyCanBecomeVisible(child, offsetX, offsetY)) continue;
	          group.add(this.cloneWorldObject(child, offsetX, offsetY));
	        }
	        for (const child of this.forest?.children ?? []) {
	          if (!this.worldCopyCanBecomeVisible(child, offsetX, offsetY)) continue;
	          group.add(this.cloneWorldObject(child, offsetX, offsetY));
	        }
	        if (this.grass?.visible) {
	          for (const child of this.grass.children) {
	            if (!this.worldCopyCanBecomeVisible(child, offsetX, offsetY)) continue;
	            group.add(this.cloneWorldObject(child, offsetX, offsetY));
	          }
	        }
	        for (const record of this.worldChunkLayers.values()) {
	          for (const child of record.forest?.children ?? []) {
	            if (!this.worldCopyCanBecomeVisible(child, offsetX, offsetY)) continue;
	            group.add(this.cloneWorldObject(child, offsetX, offsetY));
	          }
	          if (!record.grass?.visible) continue;
	          for (const child of record.grass.children) {
	            if (!this.worldCopyCanBecomeVisible(child, offsetX, offsetY)) continue;
	            group.add(this.cloneWorldObject(child, offsetX, offsetY));
	          }
	        }
	        if (group.children.length === 0) continue;
	        this.worldCopies.push(group);
	        this.worldRoot.add(group);
	      }
	    }
	  }
	  setupMarkers() {
	    const size = this.options.size;
	    const selectorGeom = new three.RingGeometry(0.97 * size, size, 6, 2);
	    this.selector = new three.Mesh(selectorGeom, new three.MeshBasicMaterial({ color: this.options.selectorColor }));
	    this.selector.rotateX(-Math.PI / 2);
	    this.selector.position.setY(size / 10 + 1.1);
	    this.selector.visible = false;
	    this.worldRoot.add(this.selector);
	    const pointerGeom = new three.RingGeometry(0.97 * size, size, 6, 2);
	    this.pointer = new three.Mesh(pointerGeom, new three.MeshBasicMaterial({ color: this.options.pointerColor }));
	    this.pointer.rotateX(-Math.PI / 2);
	    this.pointer.position.setY(size / 10 + 1.1);
	    this.pointer.visible = false;
	    this.worldRoot.add(this.pointer);
	  }
	  setupEvents() {
	    window.addEventListener("resize", this.handleResize, { passive: true });
	    window.addEventListener("keydown", this.onKeyDown);
	    window.addEventListener("keyup", this.onKeyUp);
	    window.addEventListener("blur", this.clearMovementKeys);
	    this.canvas.addEventListener("mousedown", this.onMouseDown);
	    this.canvas.addEventListener("contextmenu", this.onContextMenu);
	    window.addEventListener("pointermove", this.onPointerMove);
	    window.addEventListener("mouseup", this.onMouseUp);
	    if (typeof ResizeObserver !== "undefined") {
	      this.resizeObserver = new ResizeObserver(this.handleResize);
	      this.resizeObserver.observe(this.canvas);
	    }
	  }
	  isMovementKey(code) {
	    return code === "KeyW" || code === "KeyA" || code === "KeyS" || code === "KeyD";
	  }
	  isTextInput(target) {
	    if (!(target instanceof HTMLElement)) return false;
	    return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target.isContentEditable;
	  }
	  updateKeyboardMovement(dtS) {
	    if (dtS <= 0 || this.pressedMovementKeys.size === 0) return;
	    const forwardAmount = Number(this.pressedMovementKeys.has("KeyW")) - Number(this.pressedMovementKeys.has("KeyS"));
	    const rightAmount = Number(this.pressedMovementKeys.has("KeyD")) - Number(this.pressedMovementKeys.has("KeyA"));
	    if (forwardAmount === 0 && rightAmount === 0) return;
	    const forward = this.controls.target.clone().sub(this.camera.position);
	    forward.y = 0;
	    if (forward.lengthSq() < 1e-4) forward.set(0, 0, -1);
	    else forward.normalize();
	    const right = new three.Vector3(-forward.z, 0, forward.x);
	    const movement = forward.multiplyScalar(forwardAmount).addScaledVector(right, rightAmount);
	    if (movement.lengthSq() > 1) movement.normalize();
	    const viewDistance = this.camera.position.distanceTo(this.controls.target);
	    const speed = Math.min(900, Math.max(140, viewDistance * 0.9));
	    movement.multiplyScalar(speed * dtS);
	    this.camera.position.add(movement);
	    this.controls.target.add(movement);
	  }
	  updateWorldChunkVisibility() {
	    if (!this.mapData) return;
	    this.chunkScheduler.update(this.scene, this.camera, this.controls.target, {
	      enabled: (metadata) => metadata.kind !== "grass" || this.options.grassEnabled,
	      activate: (metadata, lod, objects) => this.activateWorldChunk(metadata, lod, objects),
	      release: (metadata) => this.releaseWorldChunk(metadata)
	    });
	  }
	  activateWorldChunk(metadata, lod, objects) {
	    if (metadata.kind === "land" || metadata.kind === "water") {
	      const geometry = this.terrain?.activateChunk(metadata, lod);
	      return geometry ? { geometries: [geometry] } : void 0;
	    }
	    if (metadata.kind === "grass") {
	      const field = this.streamedGrassByChunkId.get(metadata.id) ?? this.grass;
	      const geometry = field?.activateChunk(metadata, lod);
	      return geometry ? { geometries: [geometry] } : void 0;
	    }
	    const forest = this.streamedForestByChunkId.get(metadata.id) ?? this.forest;
	    forest?.activateChunk(metadata, lod, objects);
	    return forest ? { disposeGpu: () => forest.disposeChunkGpu(metadata) } : void 0;
	  }
	  releaseWorldChunk(metadata) {
	    if (metadata.kind === "land" || metadata.kind === "water") this.terrain?.releaseChunk(metadata);
	    else if (metadata.kind === "grass") (this.streamedGrassByChunkId.get(metadata.id) ?? this.grass)?.releaseChunk(metadata);
	    else (this.streamedForestByChunkId.get(metadata.id) ?? this.forest)?.releaseChunk(metadata);
	  }
	  //-------------------------------------------------------------------------
	  //Public API
	  //-------------------------------------------------------------------------
	  async loadWorld(options) {
	    if (this.disposed) {
	      options?.source?.dispose();
	      throw new Error("HexMap has been disposed");
	    }
	    if (!options || typeof options !== "object" || !options.source) {
	      throw new TypeError("world load options with a source are required");
	    }
	    const source = options.source;
	    try {
	      assertWorldSource(source);
	    } catch (reason) {
	      if (typeof source.dispose === "function") source.dispose();
	      throw reason;
	    }
	    const chunkSize = source.chunkSize;
	    if (!Number.isInteger(chunkSize) || chunkSize <= 0 || chunkSize > MAX_WORLD_GENERATION_CHUNK_SIZE || chunkSize % WORLD_CHUNK_SIZE !== 0) {
	      source.dispose();
	      throw new RangeError(
	        `source.chunkSize must be a positive multiple of ${WORLD_CHUNK_SIZE} up to ${MAX_WORLD_GENERATION_CHUNK_SIZE}`
	      );
	    }
	    const defaultTile = source.bounds ? { x: Math.floor((source.bounds.width - 1) / 2), y: Math.floor((source.bounds.height - 1) / 2) } : { x: 0, y: 0 };
	    const requestedTile = options.initialTile ?? defaultTile;
	    const initialTile = normalizeMapCoordinates(source.map, requestedTile.x, requestedTile.y);
	    if (!initialTile || !Number.isSafeInteger(initialTile.x) || !Number.isSafeInteger(initialTile.y)) {
	      source.dispose();
	      throw new RangeError("initialTile must identify a safe integer tile inside the world");
	    }
	    const chunkSpan = chunkSize * this.options.size * 1.5;
	    const loadRadius = options.loadRadius ?? Math.max(1, Math.ceil(this.options.renderDistance / chunkSpan));
	    const retentionRadius = options.retentionRadius ?? loadRadius + 1;
	    const maxResidentChunks = options.maxResidentChunks ?? (retentionRadius * 2 + 1) ** 2;
	    const maxRetries = options.maxRetries ?? 2;
	    const retryBaseDelayMs = options.retryBaseDelayMs ?? 100;
	    const frameBudgetMs = options.frameBudgetMs ?? 3;
	    const maxMountsPerFrame = options.maxMountsPerFrame ?? 2;
	    const integerAtLeast = (name, value, minimum) => {
	      if (!Number.isInteger(value) || value < minimum) throw new RangeError(`${name} must be an integer >= ${minimum}`);
	    };
	    try {
	      integerAtLeast("loadRadius", loadRadius, 0);
	      integerAtLeast("retentionRadius", retentionRadius, loadRadius);
	      integerAtLeast("maxResidentChunks", maxResidentChunks, 1);
	      integerAtLeast("maxRetries", maxRetries, 0);
	      integerAtLeast("retryBaseDelayMs", retryBaseDelayMs, 0);
	      integerAtLeast("maxMountsPerFrame", maxMountsPerFrame, 1);
	      if (!Number.isFinite(frameBudgetMs) || frameBudgetMs <= 0) {
	        throw new RangeError("frameBudgetMs must be a positive finite number");
	      }
	    } catch (reason) {
	      source.dispose();
	      throw reason;
	    }
	    const threshold = options.floatingOriginThreshold ?? 8192;
	    if (!Number.isFinite(threshold) || threshold <= this.options.size * chunkSize) {
	      source.dispose();
	      throw new RangeError("floatingOriginThreshold must exceed one source chunk span");
	    }
	    this.stopWorldStreaming();
	    this.frameTasks.configure({ budgetMs: frameBudgetMs, maxTasksPerFrame: maxMountsPerFrame });
	    const revision = ++this.loadRevision;
	    this.worldSource = source;
	    this.worldChunkSize = chunkSize;
	    this.mapData = source.map;
	    this.fogStates = new FogStateStore(source.map);
	    this.floatingOriginThreshold = threshold;
	    this.worldPatternOffset.set(0, 0);
	    this.cleanRoutePath();
	    this.lastHover = null;
	    this.lastSelected = null;
	    this.pointer.visible = false;
	    this.selector.visible = false;
	    this.resetRenderOrigin();
	    if (this.forest) {
	      this.worldRoot.remove(this.forest);
	      this.forest.dispose();
	      this.forest = void 0;
	    }
	    if (this.grass) {
	      this.worldRoot.remove(this.grass);
	      this.grass.dispose();
	      this.grass = void 0;
	    }
	    try {
	      if (source.bounds && !options.initialTile) this.frameMap(source.map);
	      else this.positionCameraAtTile(initialTile);
	      this.atlas = await this.fetchTerrainAtlas();
	      if (this.disposed || revision !== this.loadRevision || this.worldSource !== source) return;
	      if (!await this.rebuildTerrain(revision, true)) return;
	      const streamer = new WorldStreamer(source, {
	        chunkLoaded: (chunk) => this.scheduleWorldChunkMount(chunk),
	        chunkUnloading: (chunk) => this.unmountWorldChunk(chunk),
	        error: (error) => this.emit("error", error)
	      }, {
	        loadRadius,
	        retentionRadius,
	        maxResidentChunks,
	        maxRetries,
	        retryBaseDelayMs
	      });
	      this.worldStreamer = streamer;
	      const centerChunk = source.resolveChunk(
	        Math.floor(initialTile.x / chunkSize),
	        Math.floor(initialTile.y / chunkSize)
	      );
	      if (!centerChunk) throw new RangeError("initialTile does not resolve to a source chunk");
	      this.worldDemandChunkKey = WorldStreamer.key(centerChunk.x, centerChunk.y);
	      this.rebaseWorld();
	      const loadedCenter = await streamer.setCenterTile(initialTile.x, initialTile.y);
	      const centerKey = WorldStreamer.key(loadedCenter.chunkX, loadedCenter.chunkY);
	      const centerLayers = this.worldChunkLayers.get(centerKey);
	      await Promise.all([centerLayers?.forestPromise, centerLayers?.cityPromise]);
	      if (this.disposed || revision !== this.loadRevision || this.worldStreamer !== streamer) return;
	      this.updateWorldChunkVisibility();
	      this.emit("load", void 0);
	    } catch (reason) {
	      if (revision === this.loadRevision && this.worldSource === source) this.stopWorldStreaming();
	      throw reason;
	    }
	  }
	  async fetchTerrainAtlas() {
	    const atlasUrl = new URL("land-atlas.json", new URL(this.options.texturesBaseUrl, window.location.href)).href;
	    const response = await fetch(atlasUrl);
	    if (!response.ok) throw new Error(`Failed to load terrain atlas (${response.status} ${response.statusText})`);
	    const atlas = await response.json();
	    if (!atlas || typeof atlas.image !== "string" || atlas.image.length === 0 || !Number.isFinite(atlas.width) || atlas.width <= 0 || !Number.isFinite(atlas.height) || atlas.height <= 0 || !Number.isFinite(atlas.cellSize) || atlas.cellSize <= 0 || !Number.isFinite(atlas.cellSpacing) || atlas.cellSpacing < 0 || !atlas.textures || typeof atlas.textures !== "object") {
	      throw new TypeError("Terrain atlas descriptor is invalid");
	    }
	    return atlas;
	  }
	  positionCameraAtTile(tile) {
	    const center = getHexCenter(tile.x, tile.y, this.options.size);
	    const viewDistance = (this.controls.minDistance + this.controls.maxDistance) / 2;
	    const direction = this.camera.position.clone().sub(this.controls.target).normalize();
	    this.controls.target.set(center.x, 0, center.y);
	    this.camera.position.copy(this.controls.target).addScaledVector(direction, viewDistance);
	    this.controls.update();
	  }
	  scheduleWorldChunkMount(chunk) {
	    const key = WorldStreamer.key(chunk.chunkX, chunk.chunkY);
	    if (key === this.worldDemandChunkKey) {
	      this.mountWorldChunk(chunk);
	      return;
	    }
	    const center = this.worldStreamer?.stats;
	    const priority = center && this.worldSource ? this.worldSource.chunkDistance(chunk.chunkX, chunk.chunkY, center.centerChunkX, center.centerChunkY) : 0;
	    this.frameTasks.enqueue(key, priority, () => {
	      if (this.worldStreamer?.hasResident(chunk.chunkX, chunk.chunkY)) this.mountWorldChunk(chunk);
	    });
	  }
	  mountWorldChunk(chunk) {
	    if (!this.worldStreamer || !this.terrain) return;
	    const points = chunk.coreTiles;
	    const key = WorldStreamer.key(chunk.chunkX, chunk.chunkY);
	    const revision = ++this.worldLayerRevision;
	    const record = { points, revision };
	    this.worldChunkLayers.set(key, record);
	    this.terrain.addTiles(points);
	    if (this.options.grassEnabled) {
	      this.streamedGrassResources ?? (this.streamedGrassResources = new GrassSharedResources({
	        size: this.options.size,
	        bladeHeight: this.options.grassBladeHeight,
	        windStrength: this.options.grassWindStrength,
	        windSpeed: this.options.grassWindSpeed,
	        fogDarkenFactor: this.options.fogDarkenFactor
	      }));
	      const grass = createGrassField(this.mapData, {
	        size: this.options.size,
	        density: this.options.grassDensity,
	        bladeWidth: this.options.grassBladeWidth,
	        bladeHeight: this.options.grassBladeHeight,
	        windStrength: this.options.grassWindStrength,
	        windSpeed: this.options.grassWindSpeed,
	        fogDarkenFactor: this.options.fogDarkenFactor,
	        riverWidth: this.options.riverWidth,
	        riverBankWidth: this.options.riverBankWidth,
	        riverCurvature: this.options.riverCurvature,
	        lakeShoreWidth: this.options.lakeShoreWidth
	      }, points, this.streamedGrassResources) ?? void 0;
	      if (grass) {
	        record.grass = grass;
	        this.applyWorldPatternToObject(grass);
	        this.indexChunkLayer(grass, this.streamedGrassByChunkId);
	        this.worldRoot.add(grass);
	      }
	    }
	    record.cityPromise = this.terrain.loadCities(points, record).then(() => {
	      if (this.worldChunkLayers.get(key) !== record) {
	        this.terrain?.removeCities(points, record);
	        return;
	      }
	      for (const point of points) {
	        const state = this.warFogShown ? this.fogStates?.get(point.x, point.y) ?? 2 /* Visible */ : 2 /* Visible */;
	        this.terrain?.setFogState(point.x, point.y, state);
	      }
	      this.refreshWorldCopies();
	    }).catch((error) => {
	      if (this.worldChunkLayers.get(key) === record) this.emit("error", error);
	    });
	    this.streamedForestResources ?? (this.streamedForestResources = new ForestSharedResources());
	    record.forestPromise = createForest(this.mapData, {
	      size: this.options.size,
	      treesPerTile: this.options.treesPerTile,
	      treeModel: this.options.treeModel,
	      treeScale: this.options.treeScale,
	      fogDarkenFactor: this.options.fogDarkenFactor,
	      riverWidth: this.options.riverWidth,
	      riverBankWidth: this.options.riverBankWidth,
	      riverCurvature: this.options.riverCurvature,
	      lakeShoreWidth: this.options.lakeShoreWidth,
	      beachWidth: this.options.beachWidth,
	      waterCornerRounding: this.options.waterCornerRounding,
	      coastCurvature: this.options.coastCurvature
	    }, points, this.streamedForestResources).then((forest) => {
	      const current = this.worldChunkLayers.get(key);
	      if (!forest) return;
	      if (this.disposed || !current || current.revision !== revision) {
	        forest.dispose();
	        return;
	      }
	      current.forest = forest;
	      this.indexChunkLayer(forest, this.streamedForestByChunkId);
	      this.worldRoot.add(forest);
	      this.reapplyFogToObject(forest, points);
	      this.refreshWorldCopies();
	    }).catch((error) => {
	      if (this.worldChunkLayers.get(key)?.revision === revision) this.emit("error", error);
	    });
	    this.reapplyFogToPoints(points, record);
	    this.refreshWorldCopies();
	  }
	  unmountWorldChunk(chunk) {
	    const key = WorldStreamer.key(chunk.chunkX, chunk.chunkY);
	    this.frameTasks.cancel(key);
	    const record = this.worldChunkLayers.get(key);
	    if (!record) return;
	    this.worldChunkLayers.delete(key);
	    const forgotten = this.terrain?.removeTiles(record.points, true, record) ?? [];
	    if (record.grass) {
	      this.collectChunkIds(record.grass, forgotten);
	      this.unindexChunkLayer(record.grass, this.streamedGrassByChunkId);
	      this.worldRoot.remove(record.grass);
	      record.grass.dispose();
	    }
	    if (record.forest) {
	      this.collectChunkIds(record.forest, forgotten);
	      this.unindexChunkLayer(record.forest, this.streamedForestByChunkId);
	      this.worldRoot.remove(record.forest);
	      record.forest.dispose();
	    }
	    this.chunkScheduler.forget(forgotten);
	    this.refreshWorldCopies();
	  }
	  collectChunkIds(object, target) {
	    object.traverse((child) => {
	      const metadata = getWorldChunkMetadata(child);
	      if (metadata) target.push(metadata.id);
	    });
	  }
	  indexChunkLayer(object, index) {
	    object.traverse((child) => {
	      const metadata = getWorldChunkMetadata(child);
	      if (metadata) index.set(metadata.id, object);
	    });
	  }
	  unindexChunkLayer(object, index) {
	    object.traverse((child) => {
	      const metadata = getWorldChunkMetadata(child);
	      if (metadata && index.get(metadata.id) === object) index.delete(metadata.id);
	    });
	  }
	  stopWorldStreaming() {
	    const streamer = this.worldStreamer;
	    const source = this.worldSource;
	    this.worldDemandChunkKey = void 0;
	    this.frameTasks.clear();
	    streamer?.dispose();
	    if (!streamer) source?.dispose();
	    this.worldStreamer = void 0;
	    this.worldSource = void 0;
	    this.worldLayerRevision += 1;
	    for (const record of this.worldChunkLayers.values()) {
	      if (record.grass) {
	        this.worldRoot.remove(record.grass);
	        record.grass.dispose();
	      }
	      if (record.forest) {
	        this.worldRoot.remove(record.forest);
	        record.forest.dispose();
	      }
	    }
	    this.worldChunkLayers.clear();
	    this.streamedGrassByChunkId.clear();
	    this.streamedForestByChunkId.clear();
	    this.streamedGrassResources?.dispose();
	    this.streamedGrassResources = void 0;
	    this.streamedForestResources?.dispose();
	    this.streamedForestResources = void 0;
	  }
	  reapplyFogToPoints(points, record) {
	    for (const point of points) {
	      const state = this.warFogShown ? this.fogStates?.get(point.x, point.y) ?? 2 /* Visible */ : 2 /* Visible */;
	      this.terrain?.setFogState(point.x, point.y, state);
	      record.grass?.setFogState(point.x, point.y, state);
	      record.forest?.setFogState(point.x, point.y, state);
	    }
	  }
	  reapplyFogToObject(object, points) {
	    if (points) {
	      for (const point of points) {
	        const state = this.warFogShown ? this.fogStates?.get(point.x, point.y) ?? 2 /* Visible */ : 2 /* Visible */;
	        object.setFogState(point.x, point.y, state);
	      }
	      return;
	    }
	    this.fogStates?.forEach((stored, x, y) => {
	      object.setFogState(x, y, this.warFogShown ? stored : 2 /* Visible */);
	    });
	  }
	  //Tears down and recreates the terrain (land/water layers + city models) from
	  //the current options against the already-fetched atlas/map data. Only needed
	  //when the map itself changes (see load()) - everything water/blend-related
	  //is a live uniform, see TerrainMesh's own getters/setters, forwarded below
	  //(waterWaveAmplitude, beachWidth, etc.)
	  async rebuildTerrain(expectedRevision = this.loadRevision, deferTiles = Boolean(this.worldStreamer)) {
	    this.clearWorldCopies();
	    this.chunkScheduler.clear();
	    if (this.terrain) {
	      this.worldRoot.remove(this.terrain);
	      this.terrain.dispose();
	    }
	    const terrain = new TerrainMesh(this.mapData, {
	      size: this.options.size,
	      texturesBaseUrl: this.options.texturesBaseUrl,
	      atlas: this.atlas,
	      gridVisible: this.options.gridVisible,
	      gridColor: this.options.gridColor,
	      gridWidth: this.options.gridWidth,
	      gridOpacity: this.options.gridOpacity,
	      waterColorShallow: this.options.waterColorShallow,
	      waterColorDeep: this.options.waterColorDeep,
	      waterWaveAmplitude: this.options.waterWaveAmplitude,
	      waterWaveFrequency: this.options.waterWaveFrequency,
	      waterWaveSpeed: this.options.waterWaveSpeed,
	      waterSparkleIntensity: this.options.waterSparkleIntensity,
	      waterFresnelIntensity: this.options.waterFresnelIntensity,
	      coastalWavesEnabled: this.options.coastalWavesEnabled,
	      coastalWaveColor: this.options.coastalWaveColor,
	      coastalWaveCount: this.options.coastalWaveCount,
	      coastalWaveSpeed: this.options.coastalWaveSpeed,
	      coastalWaveWidth: this.options.coastalWaveWidth,
	      coastalWaveRange: this.options.coastalWaveRange,
	      coastalWaveDistortion: this.options.coastalWaveDistortion,
	      coastalWaveOpacity: this.options.coastalWaveOpacity,
	      waterDepth: this.options.waterDepth,
	      beachWidth: this.options.beachWidth,
	      landBlendWidth: this.options.landBlendWidth,
	      waterCornerRounding: this.options.waterCornerRounding,
	      coastCurvature: this.options.coastCurvature,
	      landBlendCurvature: this.options.landBlendCurvature,
	      mountainHeight: this.options.mountainHeight,
	      riverWidth: this.options.riverWidth,
	      riverBankWidth: this.options.riverBankWidth,
	      riverCurvature: this.options.riverCurvature,
	      riverColorShallow: this.options.riverColorShallow,
	      riverColorDeep: this.options.riverColorDeep,
	      riverBankColor: this.options.riverBankColor,
	      riverFlowSpeed: this.options.riverFlowSpeed,
	      riverDepth: this.options.riverDepth,
	      lakeShoreWidth: this.options.lakeShoreWidth,
	      cityModel: this.options.cityModel,
	      cityScale: this.options.cityScale,
	      fogTexture: this.options.fogTexture,
	      fogDarkenFactor: this.options.fogDarkenFactor,
	      fogTextureSize: this.options.fogTextureSize
	    }, deferTiles ? [] : void 0);
	    this.terrain = terrain;
	    terrain.setCameraWorldOffset(this.renderOrigin.x, this.renderOrigin.y);
	    this.applyWorldPatternToObject(terrain);
	    this.worldRoot.add(terrain);
	    if (deferTiles) {
	      for (const record of this.worldChunkLayers.values()) terrain.addTiles(record.points);
	    }
	    if (!deferTiles) await terrain.loadCities();
	    else if (this.worldStreamer) {
	      await Promise.all([...this.worldChunkLayers.values()].map((record) => terrain.loadCities(record.points, record)));
	    }
	    if (this.disposed || expectedRevision !== this.loadRevision || this.terrain !== terrain) {
	      this.worldRoot.remove(terrain);
	      terrain.dispose();
	      return false;
	    }
	    this.reapplyFog();
	    this.refreshWorldCopies();
	    return true;
	  }
	  //Tears down and recreates the tree instances from the current tree*
	  //options. treesPerTile/treeScale are baked into the instanced geometry's
	  //instance count/matrices at build time, so - like grass - there's no live
	  //uniform for them, only a rebuild. Model files are cached (see
	  //helpers/models.ts), so repeated rebuilds don't re-fetch the glTF.
	  async rebuildForest(expectedRevision = this.loadRevision) {
	    const forestRevision = ++this.forestRevision;
	    if (this.worldStreamer) {
	      return this.rebuildStreamedForests(expectedRevision, forestRevision);
	    }
	    this.clearWorldCopies();
	    this.chunkScheduler.clear();
	    if (this.forest) {
	      this.worldRoot.remove(this.forest);
	      this.forest.dispose();
	      this.forest = void 0;
	    }
	    if (!this.mapData) return false;
	    const forest = await createForest(this.mapData, {
	      size: this.options.size,
	      treesPerTile: this.options.treesPerTile,
	      treeModel: this.options.treeModel,
	      treeScale: this.options.treeScale,
	      fogDarkenFactor: this.options.fogDarkenFactor,
	      riverWidth: this.options.riverWidth,
	      riverBankWidth: this.options.riverBankWidth,
	      riverCurvature: this.options.riverCurvature,
	      lakeShoreWidth: this.options.lakeShoreWidth,
	      beachWidth: this.options.beachWidth,
	      waterCornerRounding: this.options.waterCornerRounding,
	      coastCurvature: this.options.coastCurvature
	    }) ?? void 0;
	    if (this.disposed || expectedRevision !== this.loadRevision || forestRevision !== this.forestRevision) {
	      forest?.dispose();
	      return false;
	    }
	    this.forest = forest;
	    if (this.forest) {
	      this.worldRoot.add(this.forest);
	      this.reapplyFog();
	    }
	    this.refreshWorldCopies();
	    return true;
	  }
	  //Tears down and recreates the grass field from the current grass* options
	  //against the already-loaded map data. Grass is purely procedural (no
	  //textures/models to load), so this is synchronous and cheap enough to call
	  //directly from a live GUI slider (see grassDensity/grassBladeWidth/
	  //grassBladeHeight setters below) - a rebuild replaces the whole instanced
	  //geometry, there's no partial/incremental update.
	  rebuildGrass() {
	    if (this.worldStreamer) {
	      this.rebuildStreamedGrass();
	      return;
	    }
	    this.clearWorldCopies();
	    this.chunkScheduler.clear();
	    if (this.grass) {
	      this.worldRoot.remove(this.grass);
	      this.grass.dispose();
	      this.grass = void 0;
	    }
	    if (!this.mapData) return;
	    this.grass = createGrassField(this.mapData, {
	      size: this.options.size,
	      density: this.options.grassDensity,
	      bladeWidth: this.options.grassBladeWidth,
	      bladeHeight: this.options.grassBladeHeight,
	      windStrength: this.options.grassWindStrength,
	      windSpeed: this.options.grassWindSpeed,
	      fogDarkenFactor: this.options.fogDarkenFactor,
	      riverWidth: this.options.riverWidth,
	      riverBankWidth: this.options.riverBankWidth,
	      riverCurvature: this.options.riverCurvature,
	      lakeShoreWidth: this.options.lakeShoreWidth
	    }) ?? void 0;
	    this.applyWorldPatternToObject(this.grass);
	    if (this.grass) {
	      this.grass.visible = this.options.grassEnabled;
	      this.worldRoot.add(this.grass);
	      this.reapplyFog();
	    }
	    this.refreshWorldCopies();
	  }
	  rebuildStreamedGrass() {
	    this.chunkScheduler.clear();
	    this.streamedGrassByChunkId.clear();
	    for (const record of this.worldChunkLayers.values()) {
	      if (record.grass) {
	        this.worldRoot.remove(record.grass);
	        record.grass.dispose();
	        record.grass = void 0;
	      }
	    }
	    this.streamedGrassResources?.dispose();
	    this.streamedGrassResources = void 0;
	    if (this.options.grassEnabled) {
	      this.streamedGrassResources = new GrassSharedResources({
	        size: this.options.size,
	        bladeHeight: this.options.grassBladeHeight,
	        windStrength: this.options.grassWindStrength,
	        windSpeed: this.options.grassWindSpeed,
	        fogDarkenFactor: this.options.fogDarkenFactor
	      });
	    }
	    for (const record of this.worldChunkLayers.values()) {
	      if (!this.streamedGrassResources) continue;
	      const grass = createGrassField(this.mapData, {
	        size: this.options.size,
	        density: this.options.grassDensity,
	        bladeWidth: this.options.grassBladeWidth,
	        bladeHeight: this.options.grassBladeHeight,
	        windStrength: this.options.grassWindStrength,
	        windSpeed: this.options.grassWindSpeed,
	        fogDarkenFactor: this.options.fogDarkenFactor,
	        riverWidth: this.options.riverWidth,
	        riverBankWidth: this.options.riverBankWidth,
	        riverCurvature: this.options.riverCurvature,
	        lakeShoreWidth: this.options.lakeShoreWidth
	      }, record.points, this.streamedGrassResources) ?? void 0;
	      if (!grass) continue;
	      record.grass = grass;
	      this.applyWorldPatternToObject(grass);
	      this.indexChunkLayer(grass, this.streamedGrassByChunkId);
	      this.worldRoot.add(grass);
	      this.reapplyFogToObject(grass, record.points);
	    }
	    this.refreshWorldCopies();
	  }
	  async rebuildStreamedForests(expectedRevision, forestRevision) {
	    this.chunkScheduler.clear();
	    this.streamedForestByChunkId.clear();
	    const builds = [];
	    for (const [key, record] of this.worldChunkLayers) {
	      if (record.forest) {
	        this.worldRoot.remove(record.forest);
	        record.forest.dispose();
	        record.forest = void 0;
	      }
	    }
	    this.streamedForestResources?.dispose();
	    const resources = new ForestSharedResources();
	    this.streamedForestResources = resources;
	    for (const [key, record] of this.worldChunkLayers) {
	      const revision = ++this.worldLayerRevision;
	      record.revision = revision;
	      const build = createForest(this.mapData, {
	        size: this.options.size,
	        treesPerTile: this.options.treesPerTile,
	        treeModel: this.options.treeModel,
	        treeScale: this.options.treeScale,
	        fogDarkenFactor: this.options.fogDarkenFactor,
	        riverWidth: this.options.riverWidth,
	        riverBankWidth: this.options.riverBankWidth,
	        riverCurvature: this.options.riverCurvature,
	        lakeShoreWidth: this.options.lakeShoreWidth,
	        beachWidth: this.options.beachWidth,
	        waterCornerRounding: this.options.waterCornerRounding,
	        coastCurvature: this.options.coastCurvature
	      }, record.points, resources).then((forest) => {
	        if (!forest) return;
	        const current = this.worldChunkLayers.get(key);
	        if (this.disposed || expectedRevision !== this.loadRevision || forestRevision !== this.forestRevision || current !== record || record.revision !== revision) {
	          forest.dispose();
	          return;
	        }
	        record.forest = forest;
	        this.indexChunkLayer(forest, this.streamedForestByChunkId);
	        this.worldRoot.add(forest);
	        this.reapplyFogToObject(forest, record.points);
	        this.refreshWorldCopies();
	      });
	      record.forestPromise = build;
	      builds.push(build);
	    }
	    await Promise.all(builds);
	    this.refreshWorldCopies();
	    return !this.disposed && expectedRevision === this.loadRevision && forestRevision === this.forestRevision;
	  }
	  getTile(x, y) {
	    if (this.worldSource && !this.worldSource.hasTile(x, y)) return void 0;
	    return this.mapData ? getMapTile(this.mapData, x, y) : void 0;
	  }
	  //-------------------------------------------------------------------------
	  //Fog of war (see objects/FogOfWar.ts) - updates one tile's terrain, grass
	  //and trees/city to the given state (0 = Unseen, 1 = Explored, 2 = Visible).
	  //Every tile defaults to Visible, so calling this is entirely optional; a
	  //consumer that wants fog of war (e.g. GameEngine, when its own fogOfWar
	  //option is on) drives it from unit positions/view ranges.
	  //
	  //The state is always recorded in fogStates, even while warFogVisible is
	  //false (the layers then just aren't repainted) - so consumers keep feeding
	  //fog updates as usual and re-showing the fog repaints everything current.
	  //-------------------------------------------------------------------------
	  setTileFog(x, y, state) {
	    this.setTilesFog([{ x, y, state }]);
	  }
	  setTilesFog(changes) {
	    if (!this.mapData || !this.fogStates || changes.length === 0) return;
	    const normalizedChanges = [];
	    for (const change of changes) {
	      if (change.state !== 0 /* Unseen */ && change.state !== 1 /* Explored */ && change.state !== 2 /* Visible */) continue;
	      const normalized = normalizeMapCoordinates(this.mapData, change.x, change.y);
	      if (!normalized || !getMapTile(this.mapData, normalized.x, normalized.y)) continue;
	      this.fogStates.set(normalized.x, normalized.y, change.state);
	      normalizedChanges.push(normalized.x === change.x && normalized.y === change.y ? change : { ...normalized, state: change.state });
	    }
	    if (this.warFogShown) this.applyFogChanges(normalizedChanges);
	  }
	  resetRenderOrigin() {
	    this.renderOrigin.set(0, 0);
	    this.worldRoot.position.set(0, 0, 0);
	    this.terrain?.setCameraWorldOffset(0, 0);
	  }
	  rebaseWorld() {
	    if (!this.mapData?.infinite) return;
	    const x = this.controls.target.x;
	    const z = this.controls.target.z;
	    if (Math.max(Math.abs(x), Math.abs(z)) < this.floatingOriginThreshold) return;
	    this.renderOrigin.x += x;
	    this.renderOrigin.y += z;
	    this.terrain?.setCameraWorldOffset(this.renderOrigin.x, this.renderOrigin.y);
	    this.worldRoot.position.x -= x;
	    this.worldRoot.position.z -= z;
	    this.controls.target.x -= x;
	    this.controls.target.z -= z;
	    this.camera.position.x -= x;
	    this.camera.position.z -= z;
	  }
	  updateWorldDemand() {
	    if (!this.worldStreamer || !this.worldSource) return;
	    this.logicalTargetScratch.copy(this.controls.target);
	    if (this.mapData.infinite) {
	      this.logicalTargetScratch.x += this.renderOrigin.x;
	      this.logicalTargetScratch.z += this.renderOrigin.y;
	    }
	    const tile = pickTile(
	      this.logicalTargetScratch,
	      this.options.size,
	      this.mapData.infinite ? void 0 : this.mapData.w,
	      this.mapData.infinite ? void 0 : this.mapData.h,
	      this.mapData.wrapX,
	      this.mapData.wrapY
	    );
	    if (!tile) return;
	    const resolved = this.worldSource.resolveChunk(
	      Math.floor(tile.x / this.worldChunkSize),
	      Math.floor(tile.y / this.worldChunkSize)
	    );
	    if (!resolved) return;
	    const key = WorldStreamer.key(resolved.x, resolved.y);
	    if (key === this.worldDemandChunkKey) return;
	    this.worldDemandChunkKey = key;
	    void this.worldStreamer.setCenterTile(tile.x, tile.y).catch((error) => {
	      if (error instanceof Error && error.name !== "AbortError") this.emit("error", error);
	    });
	  }
	  logicalGround(point) {
	    if (!this.mapData?.infinite) return point;
	    point.x += this.renderOrigin.x;
	    point.z += this.renderOrigin.y;
	    return point;
	  }
	  applyFogChanges(changes) {
	    const renderedStates = /* @__PURE__ */ new Map();
	    for (const { x, y, state } of changes) {
	      if (this.worldSource) {
	        const resolved = this.worldSource.resolveChunk(
	          Math.floor(x / this.worldChunkSize),
	          Math.floor(y / this.worldChunkSize)
	        );
	        const record = resolved ? this.worldChunkLayers.get(WorldStreamer.key(resolved.x, resolved.y)) : void 0;
	        if (!record) continue;
	        this.terrain?.setFogState(x, y, state);
	        record.grass?.setFogState(x, y, state);
	        record.forest?.setFogState(x, y, state);
	      } else {
	        this.terrain?.setFogState(x, y, state);
	        this.grass?.setFogState(x, y, state);
	        this.forest?.setFogState(x, y, state);
	      }
	      renderedStates.set(`${x},${y}`, state);
	    }
	    if (renderedStates.size === 0) return;
	    for (const copy of this.worldCopies) {
	      copy.traverse((object) => {
	        const key = object.userData[CITY_FOG_TILE_KEY];
	        const state = key ? renderedStates.get(key) : void 0;
	        if (state !== void 0) object.visible = state !== 0 /* Unseen */;
	      });
	    }
	  }
	  //Repaints every recorded tile: its real state when the fog is shown, or
	  //Visible when it's hidden. Also called after any layer rebuild (see
	  //rebuildTerrain/rebuildForest/rebuildGrass) - a fresh layer's instanced
	  //attributes default to all-Visible, which silently dropped previously
	  //painted fog until the next consumer update.
	  reapplyFog() {
	    if (this.worldSource) {
	      for (const record of this.worldChunkLayers.values()) this.reapplyFogToPoints(record.points, record);
	      return;
	    }
	    const changes = [];
	    this.fogStates?.forEach((state, x, y) => {
	      changes.push({ x, y, state: this.warFogShown ? state : 2 /* Visible */ });
	    });
	    this.applyFogChanges(changes);
	  }
	  //Purely visual show/hide of the war fog: hiding repaints every tile as
	  //Visible but keeps the recorded states (and keeps recording new ones from
	  //setTileFog), so re-showing restores the current fog exactly. A debug/
	  //"reveal map" convenience - it does not touch GameEngine's FogOfWar
	  //tracking, unit visibility or pathfinding.
	  get warFogVisible() {
	    return this.warFogShown;
	  }
	  set warFogVisible(value) {
	    if (this.warFogShown === value) return;
	    this.warFogShown = value;
	    this.reapplyFog();
	  }
	  get gridVisible() {
	    return this.terrain?.gridVisible ?? this.options.gridVisible;
	  }
	  set gridVisible(value) {
	    this.options.gridVisible = value;
	    if (this.terrain) this.terrain.gridVisible = value;
	  }
	  //-------------------------------------------------------------------------
	  //Water - live shader uniforms forwarded straight through to TerrainMesh,
	  //no rebuild needed.
	  //-------------------------------------------------------------------------
	  get waterWaveAmplitude() {
	    return this.terrain?.waterWaveAmplitude ?? this.options.waterWaveAmplitude;
	  }
	  set waterWaveAmplitude(value) {
	    this.options.waterWaveAmplitude = value;
	    if (this.terrain) this.terrain.waterWaveAmplitude = value;
	  }
	  get waterWaveFrequency() {
	    return this.terrain?.waterWaveFrequency ?? this.options.waterWaveFrequency;
	  }
	  set waterWaveFrequency(value) {
	    this.options.waterWaveFrequency = value;
	    if (this.terrain) this.terrain.waterWaveFrequency = value;
	  }
	  get waterWaveSpeed() {
	    return this.terrain?.waterWaveSpeed ?? this.options.waterWaveSpeed;
	  }
	  set waterWaveSpeed(value) {
	    this.options.waterWaveSpeed = value;
	    if (this.terrain) this.terrain.waterWaveSpeed = value;
	  }
	  get waterSparkleIntensity() {
	    return this.terrain?.waterSparkleIntensity ?? this.options.waterSparkleIntensity;
	  }
	  set waterSparkleIntensity(value) {
	    this.options.waterSparkleIntensity = value;
	    if (this.terrain) this.terrain.waterSparkleIntensity = value;
	  }
	  get waterFresnelIntensity() {
	    return this.terrain?.waterFresnelIntensity ?? this.options.waterFresnelIntensity;
	  }
	  set waterFresnelIntensity(value) {
	    this.options.waterFresnelIntensity = value;
	    if (this.terrain) this.terrain.waterFresnelIntensity = value;
	  }
	  get waterColorShallow() {
	    return this.terrain?.waterColorShallow ?? this.options.waterColorShallow;
	  }
	  set waterColorShallow(value) {
	    this.options.waterColorShallow = value;
	    if (this.terrain) this.terrain.waterColorShallow = value;
	  }
	  get waterColorDeep() {
	    return this.terrain?.waterColorDeep ?? this.options.waterColorDeep;
	  }
	  set waterColorDeep(value) {
	    this.options.waterColorDeep = value;
	    if (this.terrain) this.terrain.waterColorDeep = value;
	  }
	  //-------------------------------------------------------------------------
	  //Coastal foam waves - all live shader uniforms forwarded to TerrainMesh,
	  //no rebuild (the enable flag included: it's a uniform gate in the water
	  //fragment shader).
	  //-------------------------------------------------------------------------
	  get coastalWavesEnabled() {
	    return this.terrain?.coastalWavesEnabled ?? this.options.coastalWavesEnabled;
	  }
	  set coastalWavesEnabled(value) {
	    this.options.coastalWavesEnabled = value;
	    if (this.terrain) this.terrain.coastalWavesEnabled = value;
	  }
	  get coastalWaveColor() {
	    return this.terrain?.coastalWaveColor ?? this.options.coastalWaveColor;
	  }
	  set coastalWaveColor(value) {
	    this.options.coastalWaveColor = value;
	    if (this.terrain) this.terrain.coastalWaveColor = value;
	  }
	  get coastalWaveCount() {
	    return this.terrain?.coastalWaveCount ?? this.options.coastalWaveCount;
	  }
	  set coastalWaveCount(value) {
	    this.options.coastalWaveCount = value;
	    if (this.terrain) this.terrain.coastalWaveCount = value;
	  }
	  get coastalWaveSpeed() {
	    return this.terrain?.coastalWaveSpeed ?? this.options.coastalWaveSpeed;
	  }
	  set coastalWaveSpeed(value) {
	    this.options.coastalWaveSpeed = value;
	    if (this.terrain) this.terrain.coastalWaveSpeed = value;
	  }
	  get coastalWaveWidth() {
	    return this.terrain?.coastalWaveWidth ?? this.options.coastalWaveWidth;
	  }
	  set coastalWaveWidth(value) {
	    this.options.coastalWaveWidth = value;
	    if (this.terrain) this.terrain.coastalWaveWidth = value;
	  }
	  get coastalWaveRange() {
	    return this.terrain?.coastalWaveRange ?? this.options.coastalWaveRange;
	  }
	  set coastalWaveRange(value) {
	    this.options.coastalWaveRange = value;
	    if (this.terrain) this.terrain.coastalWaveRange = value;
	  }
	  get coastalWaveDistortion() {
	    return this.terrain?.coastalWaveDistortion ?? this.options.coastalWaveDistortion;
	  }
	  set coastalWaveDistortion(value) {
	    this.options.coastalWaveDistortion = value;
	    if (this.terrain) this.terrain.coastalWaveDistortion = value;
	  }
	  get coastalWaveOpacity() {
	    return this.terrain?.coastalWaveOpacity ?? this.options.coastalWaveOpacity;
	  }
	  set coastalWaveOpacity(value) {
	    this.options.coastalWaveOpacity = value;
	    if (this.terrain) this.terrain.coastalWaveOpacity = value;
	  }
	  //-------------------------------------------------------------------------
	  //Land/coastal blending + beach height - all live shader uniforms, no rebuild.
	  //-------------------------------------------------------------------------
	  get landBlendWidth() {
	    return this.terrain?.landBlendWidth ?? this.options.landBlendWidth;
	  }
	  set landBlendWidth(value) {
	    this.options.landBlendWidth = value;
	    if (this.terrain) this.terrain.landBlendWidth = value;
	  }
	  get waterCornerRounding() {
	    return this.terrain?.waterCornerRounding ?? this.options.waterCornerRounding;
	  }
	  set waterCornerRounding(value) {
	    this.options.waterCornerRounding = value;
	    if (this.terrain) this.terrain.waterCornerRounding = value;
	  }
	  get coastCurvature() {
	    return this.terrain?.coastCurvature ?? this.options.coastCurvature;
	  }
	  set coastCurvature(value) {
	    this.options.coastCurvature = value;
	    if (this.terrain) this.terrain.coastCurvature = value;
	  }
	  get landBlendCurvature() {
	    return this.terrain?.landBlendCurvature ?? this.options.landBlendCurvature;
	  }
	  set landBlendCurvature(value) {
	    this.options.landBlendCurvature = value;
	    if (this.terrain) this.terrain.landBlendCurvature = value;
	  }
	  get mountainHeight() {
	    return this.terrain?.mountainHeight ?? this.options.mountainHeight;
	  }
	  set mountainHeight(value) {
	    this.options.mountainHeight = value;
	    if (this.terrain) this.terrain.mountainHeight = value;
	  }
	  get beachWidth() {
	    return this.terrain?.beachWidth ?? this.options.beachWidth;
	  }
	  set beachWidth(value) {
	    this.options.beachWidth = value;
	    if (this.terrain) this.terrain.beachWidth = value;
	  }
	  get waterDepth() {
	    return this.terrain?.waterDepth ?? this.options.waterDepth;
	  }
	  set waterDepth(value) {
	    this.options.waterDepth = value;
	    if (this.terrain) this.terrain.waterDepth = value;
	  }
	  //-------------------------------------------------------------------------
	  //Rivers - all live shader uniforms on the land material, forwarded to
	  //TerrainMesh, no rebuild needed. Which tiles/edges carry a river is map
	  //data (the "river" modifier), not an option - see helpers/rivers.ts.
	  //-------------------------------------------------------------------------
	  get riverWidth() {
	    return this.terrain?.riverWidth ?? this.options.riverWidth;
	  }
	  set riverWidth(value) {
	    this.options.riverWidth = value;
	    if (this.terrain) this.terrain.riverWidth = value;
	  }
	  get riverBankWidth() {
	    return this.terrain?.riverBankWidth ?? this.options.riverBankWidth;
	  }
	  set riverBankWidth(value) {
	    this.options.riverBankWidth = value;
	    if (this.terrain) this.terrain.riverBankWidth = value;
	  }
	  get riverCurvature() {
	    return this.terrain?.riverCurvature ?? this.options.riverCurvature;
	  }
	  set riverCurvature(value) {
	    this.options.riverCurvature = value;
	    if (this.terrain) this.terrain.riverCurvature = value;
	  }
	  get riverColorShallow() {
	    return this.terrain?.riverColorShallow ?? this.options.riverColorShallow;
	  }
	  set riverColorShallow(value) {
	    this.options.riverColorShallow = value;
	    if (this.terrain) this.terrain.riverColorShallow = value;
	  }
	  get riverColorDeep() {
	    return this.terrain?.riverColorDeep ?? this.options.riverColorDeep;
	  }
	  set riverColorDeep(value) {
	    this.options.riverColorDeep = value;
	    if (this.terrain) this.terrain.riverColorDeep = value;
	  }
	  get riverBankColor() {
	    return this.terrain?.riverBankColor ?? this.options.riverBankColor;
	  }
	  set riverBankColor(value) {
	    this.options.riverBankColor = value;
	    if (this.terrain) this.terrain.riverBankColor = value;
	  }
	  get riverFlowSpeed() {
	    return this.terrain?.riverFlowSpeed ?? this.options.riverFlowSpeed;
	  }
	  set riverFlowSpeed(value) {
	    this.options.riverFlowSpeed = value;
	    if (this.terrain) this.terrain.riverFlowSpeed = value;
	  }
	  get riverDepth() {
	    return this.terrain?.riverDepth ?? this.options.riverDepth;
	  }
	  set riverDepth(value) {
	    this.options.riverDepth = value;
	    if (this.terrain) this.terrain.riverDepth = value;
	  }
	  get lakeShoreWidth() {
	    return this.terrain?.lakeShoreWidth ?? this.options.lakeShoreWidth;
	  }
	  set lakeShoreWidth(value) {
	    this.options.lakeShoreWidth = value;
	    if (this.terrain) this.terrain.lakeShoreWidth = value;
	  }
	  //-------------------------------------------------------------------------
	  //Tree density/size - baked into the instanced geometry at build time (like
	  //grass), so both rebuild the forest rather than touching a uniform.
	  //-------------------------------------------------------------------------
	  get treesPerTile() {
	    return this.options.treesPerTile;
	  }
	  set treesPerTile(value) {
	    if (!Number.isInteger(value) || value < 0) throw new RangeError("treesPerTile must be a non-negative integer");
	    this.options.treesPerTile = value;
	    void this.rebuildForest();
	  }
	  get treeScale() {
	    return this.options.treeScale;
	  }
	  set treeScale(value) {
	    if (!Number.isFinite(value) || value < 0) throw new RangeError("treeScale must be a non-negative finite number");
	    this.options.treeScale = value;
	    void this.rebuildForest();
	  }
	  //Toggling visibility just flips the mesh's own `visible` flag (grass is
	  //still generated even when disabled) - the terrain's own grass texture
	  //keeps rendering underneath either way, so disabling this is purely
	  //"remove the blade overlay", not "regenerate as flat grass".
	  get grassVisible() {
	    return this.options.grassEnabled;
	  }
	  set grassVisible(value) {
	    this.options.grassEnabled = value;
	    if (this.grass) this.grass.visible = value;
	    if (this.worldStreamer) this.rebuildStreamedGrass();
	    this.refreshWorldCopies();
	  }
	  //Wind uniforms are cheap to update live - no rebuild needed.
	  get grassWindStrength() {
	    return this.grass?.windStrength ?? this.options.grassWindStrength;
	  }
	  set grassWindStrength(value) {
	    this.options.grassWindStrength = value;
	    if (this.grass) this.grass.windStrength = value;
	    for (const grass of new Set(this.streamedGrassByChunkId.values())) grass.windStrength = value;
	  }
	  get grassWindSpeed() {
	    return this.grass?.windSpeed ?? this.options.grassWindSpeed;
	  }
	  set grassWindSpeed(value) {
	    this.options.grassWindSpeed = value;
	    if (this.grass) this.grass.windSpeed = value;
	    for (const grass of new Set(this.streamedGrassByChunkId.values())) grass.windSpeed = value;
	  }
	  //Blade count/size is baked into the instanced geometry at build time, so
	  //changing any of these rebuilds the whole grass field (see rebuildGrass()).
	  get grassDensity() {
	    return this.options.grassDensity;
	  }
	  set grassDensity(value) {
	    if (!Number.isInteger(value) || value < 0) throw new RangeError("grassDensity must be a non-negative integer");
	    this.options.grassDensity = value;
	    this.rebuildGrass();
	  }
	  get grassBladeWidth() {
	    return this.options.grassBladeWidth;
	  }
	  set grassBladeWidth(value) {
	    if (!Number.isFinite(value) || value <= 0) throw new RangeError("grassBladeWidth must be a positive finite number");
	    this.options.grassBladeWidth = value;
	    this.rebuildGrass();
	  }
	  get grassBladeHeight() {
	    return this.options.grassBladeHeight;
	  }
	  set grassBladeHeight(value) {
	    if (!Number.isFinite(value) || value <= 0) throw new RangeError("grassBladeHeight must be a positive finite number");
	    this.options.grassBladeHeight = value;
	    this.rebuildGrass();
	  }
	  selectTile(x, y) {
	    const normalized = this.mapData ? normalizeMapCoordinates(this.mapData, x, y) : { x, y };
	    if (!normalized || this.mapData && !this.getTile(normalized.x, normalized.y)) return;
	    this.selector.visible = true;
	    this.positionMarker(this.selector, normalized);
	    this.lastSelected = normalized;
	  }
	  get selectedTile() {
	    return this.lastSelected;
	  }
	  get size() {
	    return this.options.size;
	  }
	  get streamingStats() {
	    return this.chunkScheduler.stats;
	  }
	  get worldStreamingStats() {
	    return this.worldStreamer?.stats;
	  }
	  get frameTaskStats() {
	    return this.frameTasks.stats;
	  }
	  drawRoutePath(path) {
	    this.cleanRoutePath();
	    let reference = this.getCameraTarget();
	    const points = path.map((p) => {
	      const center = this.nearestRepeatedCenter(p.x, p.y, reference);
	      const point = new three.Vector3(center.x, 10, center.y);
	      reference = point;
	      return point;
	    });
	    if (points.length === 0) return;
	    const origin = points[0].clone();
	    const geometry = new three.BufferGeometry().setFromPoints(points.map((point) => point.clone().sub(origin)));
	    const material = new three.LineBasicMaterial({ color: 16711680, linewidth: 5 });
	    this.routeLine = new three.Line(geometry, material);
	    this.routeLine.position.copy(origin);
	    this.worldRoot.add(this.routeLine);
	  }
	  cleanRoutePath() {
	    if (this.routeLine) {
	      this.worldRoot.remove(this.routeLine);
	      this.routeLine.geometry.dispose();
	      const materials = Array.isArray(this.routeLine.material) ? this.routeLine.material : [this.routeLine.material];
	      for (const material of materials) material.dispose();
	      this.routeLine = void 0;
	    }
	  }
	  //Escape hatch for consumers that want to add their own Object3D (units,
	  //effects, custom markers) to the map's scene.
	  add(object) {
	    this.worldRoot.add(object);
	  }
	  remove(object) {
	    this.worldRoot.remove(object);
	  }
	  getCamera() {
	    return this.camera;
	  }
	  getCameraTarget(target = new three.Vector3()) {
	    return target.copy(this.controls.target).add(this.logicalTargetScratch.set(this.renderOrigin.x, 0, this.renderOrigin.y));
	  }
	  getScene() {
	    return this.scene;
	  }
	  dispose() {
	    if (this.disposed) return;
	    this.disposed = true;
	    this.loadRevision += 1;
	    this.forestRevision += 1;
	    this.stopWorldStreaming();
	    if (this.animationFrameId !== void 0) window.cancelAnimationFrame(this.animationFrameId);
	    window.removeEventListener("resize", this.handleResize);
	    window.removeEventListener("keydown", this.onKeyDown);
	    window.removeEventListener("keyup", this.onKeyUp);
	    window.removeEventListener("blur", this.clearMovementKeys);
	    this.canvas.removeEventListener("mousedown", this.onMouseDown);
	    this.canvas.removeEventListener("contextmenu", this.onContextMenu);
	    window.removeEventListener("pointermove", this.onPointerMove);
	    window.removeEventListener("mouseup", this.onMouseUp);
	    this.resizeObserver?.disconnect();
	    this.cleanRoutePath();
	    this.clearWorldCopies();
	    this.chunkScheduler.clear();
	    if (this.terrain) {
	      this.worldRoot.remove(this.terrain);
	      this.terrain.dispose();
	    }
	    if (this.forest) {
	      this.worldRoot.remove(this.forest);
	      this.forest.dispose();
	      this.forest = void 0;
	    }
	    if (this.grass) {
	      this.worldRoot.remove(this.grass);
	      this.grass.dispose();
	      this.grass = void 0;
	    }
	    this.selector.geometry.dispose();
	    this.selector.material.dispose();
	    this.pointer.geometry.dispose();
	    this.pointer.material.dispose();
	    this.sky.geometry.dispose();
	    this.sky.material.dispose();
	    this.controls.dispose();
	    this.renderer.renderLists.dispose();
	    this.renderer.dispose();
	    this.removeAllListeners();
	  }
	};

	// src/helpers/setoptions.ts
	function setOptions(obj, options) {
	  const holder = obj;
	  const target = holder.options ?? {};
	  holder.options = target;
	  if (!options || typeof options !== "object") return target;
	  for (const key of Object.keys(options)) {
	    if (!Object.prototype.hasOwnProperty.call(target, key)) continue;
	    target[key] = options[key];
	  }
	  return target;
	}
	var Unit = class extends EventEmitter {
	  constructor(options = {}) {
	    super();
	    this.needAnimate = false;
	    this.animationClips = [];
	    this.pathFraction = 0;
	    this.movementToken = 0;
	    //Path currently being animated + the cell the model is nearest to right
	    //now. moveTo() sets options.x/y to the *destination* immediately (so game
	    //logic like "which tile holds this unit" is stable), which means position
	    //is wrong as a fog-of-war viewpoint for the whole duration of the
	    //animation - viewPosition below tracks the actual animated location
	    //instead, and "cell_enter" fires as it crosses into each new cell.
	    this.movePath = null;
	    this._viewCell = null;
	    this.alignedCopyX = Number.NaN;
	    this.alignedCopyY = Number.NaN;
	    this.alignedTileX = Number.NaN;
	    this.alignedTileY = Number.NaN;
	    this.options = {
	      animateFrameRate: 50,
	      //Framerate: how much per second run animate function
	      animateSpeed: 1,
	      //Animate speed: how much seconds spend to move from 1 cell to second cell
	      size: 40,
	      //Map size to calculate unit position on map
	      type: "Assets/units/viking_boat",
	      //Model folder path (model.glb + info.json), same convention as city.model/treeModel
	      x: 0,
	      y: 0,
	      actions: new Array(),
	      id: "new id",
	      viewRange: 0,
	      //Hex tiles seen around this unit (see FogOfWar.ts) - overridden by the model's own info.json
	      //Terrain the unit may enter, overridden by the model's own info.json
	      //(e.g. the viking boat sets coastal only) - default deny, so a unit
	      //whose info.json omits a terrain type never routes across it.
	      sea: false,
	      coastal: false,
	      land: false,
	      sand: false,
	      tundra: false,
	      snow: false,
	      mountain: false,
	      mapWidth: 0,
	      mapHeight: 0,
	      wrapX: false,
	      wrapY: false
	    };
	    setOptions(this, options);
	  }
	  async setUnit() {
	    const { scene, animations, info, fixup } = await loadModel(this.options.type);
	    setOptions(this, info);
	    const model = clone(scene);
	    model.applyMatrix4(fixup);
	    this.animationClips = animations;
	    this.animationMixer = animations.length > 0 ? new three.AnimationMixer(model) : void 0;
	    this._unit = new three.Object3D();
	    this._unit.add(model);
	    let position = getHexCenter(this.options.x, this.options.y, this.options.size);
	    this._unit.position.set(position.x, 0, position.y);
	    if (!this.activate("idle" /* idle */) && animations.length > 0) this.playClip(animations[0]);
	  }
	  //----------------------------------------------------------------------------------------------------------
	  //RETURN CURRENT 3D Object
	  //----------------------------------------------------------------------------------------------------------
	  get unit() {
	    if (!this._unit) throw new Error("Unit.setUnit() must complete before accessing unit");
	    return this._unit;
	  }
	  get actions() {
	    return this.options.actions;
	  }
	  get position() {
	    return { x: this.options.x, y: this.options.y };
	  }
	  get id() {
	    return this.options.id;
	  }
	  get viewRange() {
	    return this.options.viewRange;
	  }
	  //Which Land types this unit may enter (its info.json terrain flags) -
	  //feeds PathFinder so a route never crosses a tile the unit can't reach.
	  get terrain() {
	    return {
	      ["sea" /* sea */]: this.options.sea,
	      ["coastal" /* coastal */]: this.options.coastal,
	      ["land" /* land */]: this.options.land,
	      ["sand" /* sand */]: this.options.sand,
	      ["tundra" /* tundra */]: this.options.tundra,
	      ["snow" /* snow */]: this.options.snow,
	      ["mountain" /* mountain */]: this.options.mountain
	    };
	  }
	  //Where the unit actually is *right now* - the cell nearest the animated
	  //model while a moveTo() is in flight, its resting position otherwise. Use
	  //this (not position, which jumps to the destination the moment moveTo()
	  //is called) as the fog-of-war viewpoint, so tiles reveal as the unit
	  //passes them instead of the whole route lighting up at once.
	  get viewPosition() {
	    return this._viewCell ?? this.position;
	  }
	  set position(position) {
	    if (this.needAnimate) throw new Error("Cannot set a unit position while it is moving");
	    this.options.y = position.y;
	    this.options.x = position.x;
	    if (this._unit) {
	      const center = getHexCenter(position.x, position.y, this.options.size);
	      this._unit.position.set(center.x, this._unit.position.y, center.y);
	    }
	  }
	  activate(action) {
	    if (!this.options.actions.includes(action)) return false;
	    const clip = this.animationClips.find((candidate) => candidate.name.toLowerCase() === action.toLowerCase());
	    if (!clip) return false;
	    this._action = action;
	    this.playClip(clip, action === "death" /* death */);
	    return true;
	  }
	  playClip(clip, playOnce = false) {
	    if (!this.animationMixer) return;
	    const next = this.animationMixer.clipAction(clip);
	    if (next === this.animationAction && next.isRunning()) return;
	    this.animationAction?.fadeOut(0.15);
	    next.reset().fadeIn(0.15);
	    if (playOnce) {
	      next.setLoop(three.LoopOnce, 1);
	      next.clampWhenFinished = true;
	    }
	    next.play();
	    this.animationAction = next;
	  }
	  update(deltaSeconds) {
	    if (Number.isFinite(deltaSeconds) && deltaSeconds > 0) this.animationMixer?.update(deltaSeconds);
	  }
	  get moving() {
	    return this.needAnimate;
	  }
	  moveTo(path) {
	    if (this.needAnimate || path.length < 2) return false;
	    const route = path.map((point) => ({ ...point }));
	    this.options.x = route[route.length - 1].x;
	    this.options.y = route[route.length - 1].y;
	    const pointsPath = new three.CurvePath();
	    const points = createContinuousHexPath(route, this.options.size, {
	      mapWidth: this.options.mapWidth,
	      mapHeight: this.options.mapHeight,
	      wrapX: this.options.wrapX,
	      wrapY: this.options.wrapY
	    }, this.unit.position);
	    for (let i = 1; i < points.length; i++) {
	      pointsPath.add(new three.LineCurve3(points[i - 1], points[i]));
	    }
	    this.pointsPath = pointsPath;
	    this.movePath = route;
	    this._viewCell = route[0];
	    this.pathFraction = 0;
	    this.needAnimate = true;
	    this.activate("walk" /* walk */);
	    const token = ++this.movementToken;
	    this.emit("start_move", { id: this.id, from: route[0], to: this.position, path: route });
	    void this.animation(route.length - 1, token);
	    return true;
	  }
	  async animation(segmentCount, token) {
	    const frameRate = Number.isFinite(this.options.animateFrameRate) && this.options.animateFrameRate > 0 ? this.options.animateFrameRate : 50;
	    const secondsPerCell = Number.isFinite(this.options.animateSpeed) && this.options.animateSpeed > 0 ? this.options.animateSpeed : 1;
	    const fractionStep = 1 / (segmentCount * secondsPerCell * frameRate);
	    const forward = new three.Vector3(0, 0, 1);
	    while (this.needAnimate && token === this.movementToken) {
	      this.pathFraction = Math.min(1, this.pathFraction + fractionStep);
	      const newPosition = this.pointsPath.getPoint(this.pathFraction);
	      const tangent = this.pointsPath.getTangent(this.pathFraction).normalize();
	      this.unit.position.copy(newPosition);
	      if (tangent.lengthSq() > 0) this.unit.quaternion.setFromUnitVectors(forward, tangent);
	      if (this.movePath && this._viewCell) {
	        const cellIndex = Math.min(
	          this.movePath.length - 1,
	          Math.round(this.pathFraction * (this.movePath.length - 1))
	        );
	        const cell = this.movePath[cellIndex];
	        if (cell && (cell.x !== this._viewCell.x || cell.y !== this._viewCell.y)) {
	          this._viewCell = cell;
	          this.emit("cell_enter", { id: this.id, cell });
	        }
	      }
	      if (this.pathFraction >= 1) break;
	      await wait(Math.max(1, Math.floor(1e3 / frameRate)));
	    }
	    if (token !== this.movementToken) return;
	    this.pathFraction = 0;
	    this.needAnimate = false;
	    this.movePath = null;
	    this._viewCell = null;
	    this.activate("idle" /* idle */);
	    this.emit("end_move", { id: this.id, position: this.position });
	  }
	  alignToWorldReference(referenceX, referenceZ) {
	    if (this.needAnimate || !this._unit) return;
	    const center = getHexCenter(this.options.x, this.options.y, this.options.size);
	    const periodX = this.options.wrapX ? this.options.mapWidth * this.options.size * 1.5 : 0;
	    const periodY = this.options.wrapY ? this.options.mapHeight * this.options.size * Math.sqrt(3) : 0;
	    const copyX = periodX > 0 ? Math.round((referenceX - center.x) / periodX) : 0;
	    const copyY = periodY > 0 ? Math.round((referenceZ - center.y) / periodY) : 0;
	    if (copyX === this.alignedCopyX && copyY === this.alignedCopyY && this.options.x === this.alignedTileX && this.options.y === this.alignedTileY) return;
	    center.x += copyX * periodX;
	    center.y += copyY * periodY;
	    this._unit.position.set(center.x, this._unit.position.y, center.y);
	    this.alignedCopyX = copyX;
	    this.alignedCopyY = copyY;
	    this.alignedTileX = this.options.x;
	    this.alignedTileY = this.options.y;
	  }
	  dispose() {
	    this.needAnimate = false;
	    this.movementToken += 1;
	    this.movePath = null;
	    this._viewCell = null;
	    this._unit?.removeFromParent();
	    if (this.animationMixer && this._unit?.children[0]) {
	      this.animationMixer.stopAllAction();
	      this.animationMixer.uncacheRoot(this._unit.children[0]);
	    }
	    this.animationMixer = void 0;
	    this.animationAction = void 0;
	    this.animationClips = [];
	    this.removeAllListeners();
	  }
	};
	function createContinuousHexPath(path, size, topology = {}, start) {
	  const periodX = topology.wrapX && topology.mapWidth ? topology.mapWidth * size * 1.5 : 0;
	  const periodY = topology.wrapY && topology.mapHeight ? topology.mapHeight * size * Math.sqrt(3) : 0;
	  const points = [];
	  for (let index = 0; index < path.length; index++) {
	    if (index === 0 && start) {
	      points.push(start.clone());
	      continue;
	    }
	    const center = getHexCenter(path[index].x, path[index].y, size);
	    const previous = points[index - 1];
	    if (previous && periodX > 0) center.x += Math.round((previous.x - center.x) / periodX) * periodX;
	    if (previous && periodY > 0) center.y += Math.round((previous.z - center.y) / periodY) * periodY;
	    points.push(new three.Vector3(center.x, 0, center.y));
	  }
	  return points;
	}

	// src/helpers/pathfinder.ts
	var MinPriorityQueue = class {
	  constructor() {
	    this.entries = [];
	  }
	  get size() {
	    return this.entries.length;
	  }
	  push(entry) {
	    this.entries.push(entry);
	    let index = this.entries.length - 1;
	    while (index > 0) {
	      const parent = Math.floor((index - 1) / 2);
	      if (this.entries[parent].priority <= entry.priority) break;
	      this.entries[index] = this.entries[parent];
	      index = parent;
	    }
	    this.entries[index] = entry;
	  }
	  pop() {
	    const first = this.entries[0];
	    const last = this.entries.pop();
	    if (!first || !last || this.entries.length === 0) return first;
	    let index = 0;
	    while (true) {
	      const left = index * 2 + 1;
	      const right = left + 1;
	      if (left >= this.entries.length) break;
	      const child = right < this.entries.length && this.entries[right].priority < this.entries[left].priority ? right : left;
	      if (this.entries[child].priority >= last.priority) break;
	      this.entries[index] = this.entries[child];
	      index = child;
	    }
	    this.entries[index] = last;
	    return first;
	  }
	};
	var pointKey = ({ x, y }) => `${x},${y}`;
	var PathFinder = class {
	  constructor(map, restricted, accessible) {
	    this.map = map;
	    this.restricted = restricted;
	    this.accessible = accessible;
	    assertWrappableMap(map);
	    this.wrapX = map.wrapX === true;
	    this.wrapY = map.wrapY === true;
	  }
	  find(startX, startY, endX, endY) {
	    const start = normalizeMapCoordinates(this.map, startX, startY);
	    const end = normalizeMapCoordinates(this.map, endX, endY);
	    if (!start || !end || !this.isAccessible(start) || !this.isAccessible(end)) return [];
	    if (start.x === end.x && start.y === end.y) return [];
	    const frontier = new MinPriorityQueue();
	    const startKey = pointKey(start);
	    const endKey = pointKey(end);
	    const costs = /* @__PURE__ */ new Map([[startKey, 0]]);
	    const parents = /* @__PURE__ */ new Map();
	    frontier.push({ ...start, priority: 0 });
	    while (frontier.size > 0) {
	      const current = frontier.pop();
	      if (!current) break;
	      const currentKey = pointKey(current);
	      const currentCost = costs.get(currentKey);
	      if (currentCost === void 0) continue;
	      if (currentKey === endKey) return this.reconstructPath(start, end, parents);
	      for (const neighbor of getMapNeighbors(this.map, current.x, current.y)) {
	        if (!this.isAccessible(neighbor)) continue;
	        const neighborKey = pointKey(neighbor);
	        const nextCost = currentCost + 1;
	        if (nextCost >= (costs.get(neighborKey) ?? Infinity)) continue;
	        costs.set(neighborKey, nextCost);
	        parents.set(neighborKey, { x: current.x, y: current.y });
	        frontier.push({
	          x: neighbor.x,
	          y: neighbor.y,
	          priority: nextCost + this.hexDistance(neighbor, end)
	        });
	      }
	    }
	    return [];
	  }
	  isAccessible(point) {
	    const tile = getMapTile(this.map, point.x, point.y);
	    return tile !== void 0 && this.restricted[tile.type] === true && (!this.accessible || this.accessible(point.x, point.y));
	  }
	  reconstructPath(start, end, parents) {
	    const path = [{ ...end }];
	    let current = end;
	    const maximumLength = Math.max(1, this.map.w * this.map.h);
	    while (current.x !== start.x || current.y !== start.y) {
	      const parent = parents.get(pointKey(current));
	      if (!parent || path.length > maximumLength) return [];
	      path.push(parent);
	      current = parent;
	    }
	    return path.reverse();
	  }
	  // Converts the even-column offset coordinates used by getHexCenter() to
	  // axial coordinates. Wrapped worlds compare nearby copies of the target.
	  hexDistance(from, to) {
	    let best = Infinity;
	    const xCopies = this.wrapX ? [-1, 0, 1] : [0];
	    const yCopies = this.wrapY ? [-1, 0, 1] : [0];
	    for (const copyX of xCopies) {
	      for (const copyY of yCopies) {
	        const targetX = to.x + copyX * this.map.w;
	        const targetY = to.y + copyY * this.map.h;
	        const dq = from.x - targetX;
	        const fromR = from.y - Math.ceil(from.x / 2);
	        const targetR = targetY - Math.ceil(targetX / 2);
	        const dr = fromR - targetR;
	        best = Math.min(best, (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2);
	      }
	    }
	    return best;
	  }
	};
	var GameEngine = class extends EventEmitter {
	  constructor(options) {
	    super();
	    this._unitsList = {};
	    this._units = [];
	    this.initRevision = 0;
	    this.cameraTarget = new three.Vector3();
	    this.farUnitElapsed = /* @__PURE__ */ new Map();
	    this.fogViewers = [];
	    this.options = {
	      preventCellClick: true,
	      fogOfWar: true,
	      unitAnimationDistance: 3e3,
	      farUnitUpdateInterval: 0.25
	    };
	    setOptions(this, options);
	    if (!Number.isFinite(this.options.unitAnimationDistance) || this.options.unitAnimationDistance < 0) {
	      throw new RangeError("unitAnimationDistance must be a non-negative finite number");
	    }
	    if (!Number.isFinite(this.options.farUnitUpdateInterval) || this.options.farUnitUpdateInterval <= 0) {
	      throw new RangeError("farUnitUpdateInterval must be a positive finite number");
	    }
	    this._map = new HexMap(options);
	    this._map.on("click", (payload) => this.cellClick(payload));
	    this._map.on("hover", (payload) => this.cellHover(payload));
	    this._map.on("frame", ({ dtS }) => {
	      const target = this._map.getCameraTarget(this.cameraTarget);
	      for (const unit of this._units) {
	        unit.alignToWorldReference(target.x, target.z);
	        const dx = unit.unit.position.x - target.x;
	        const dz = unit.unit.position.z - target.z;
	        if (unit.moving || Math.hypot(dx, dz) <= this.options.unitAnimationDistance) {
	          unit.update(dtS);
	          this.farUnitElapsed.delete(unit);
	          continue;
	        }
	        const elapsed = (this.farUnitElapsed.get(unit) ?? 0) + dtS;
	        if (elapsed >= this.options.farUnitUpdateInterval) {
	          unit.update(elapsed);
	          this.farUnitElapsed.set(unit, 0);
	        } else {
	          this.farUnitElapsed.set(unit, elapsed);
	        }
	      }
	    });
	  }
	  async init(mapData, unitsData = []) {
	    const revision = ++this.initRevision;
	    assertWrappableMap(mapData);
	    const placements = this.validatePlacements(mapData, unitsData);
	    this.clearUnits();
	    this._currentUnit = void 0;
	    this._fog = void 0;
	    this.clearMapUnitMarkers(mapData);
	    this._mapData = mapData;
	    await this._map.loadWorld({ source: new StaticWorldSource(mapData) });
	    if (revision !== this.initRevision) return;
	    const units = placements.map((unitInfo) => new Unit({
	      ...unitInfo,
	      size: this._map.size,
	      mapWidth: mapData.w,
	      mapHeight: mapData.h,
	      wrapX: mapData.wrapX === true,
	      wrapY: mapData.wrapY === true
	    }));
	    try {
	      await Promise.all(units.map((unit) => unit.setUnit()));
	    } catch (reason) {
	      for (const unit of units) unit.dispose();
	      throw reason;
	    }
	    if (revision !== this.initRevision) {
	      for (const unit of units) unit.dispose();
	      return;
	    }
	    for (const unit of units) {
	      unit.on("start_move", (payload) => this.emit("start_move", payload));
	      unit.on("end_move", (payload) => this.emit("end_move", payload));
	      unit.on("cell_enter", (payload) => {
	        this.emit("cell_enter", payload);
	        this.recomputeFog();
	      });
	      unit.on("end_move", () => this.recomputeFog());
	      this._map.add(unit.unit);
	      this._unitsList[unit.id] = unit;
	      this._units.push(unit);
	      this.fogViewers.push({ ...unit.viewPosition, viewRange: unit.viewRange });
	      this._mapData.data[unit.position.x][unit.position.y].unit = unit.id;
	    }
	    if (this.options.fogOfWar) {
	      this._fog = new FogOfWar(mapData);
	      this._map.setTilesFog(this._fog.allTiles());
	      this.recomputeFog();
	    }
	  }
	  validatePlacements(map, units) {
	    const ids = /* @__PURE__ */ new Set();
	    const occupied = /* @__PURE__ */ new Set();
	    return units.map((placement) => {
	      if (!placement.id || typeof placement.id !== "string") {
	        throw new TypeError("unit id must be a non-empty string");
	      }
	      if (!placement.type || typeof placement.type !== "string") {
	        throw new TypeError(`unit "${placement.id}" type must be a non-empty model path`);
	      }
	      if (ids.has(placement.id)) throw new Error(`duplicate unit id "${placement.id}"`);
	      ids.add(placement.id);
	      const normalized = normalizeMapCoordinates(map, placement.x, placement.y);
	      if (!normalized || !map.data[normalized.x]?.[normalized.y]) {
	        throw new RangeError(`unit "${placement.id}" is outside the map or on a missing tile`);
	      }
	      const key = `${normalized.x},${normalized.y}`;
	      if (occupied.has(key)) throw new Error(`multiple units occupy tile ${key}`);
	      occupied.add(key);
	      return { ...placement, ...normalized };
	    });
	  }
	  clearUnits() {
	    for (const unit of this._units) {
	      const tile = this._mapData?.data[unit.position.x]?.[unit.position.y];
	      if (tile?.unit === unit.id) delete tile.unit;
	      unit.dispose();
	    }
	    this._unitsList = {};
	    this._units = [];
	    this.fogViewers.length = 0;
	    this.farUnitElapsed.clear();
	  }
	  clearMapUnitMarkers(map) {
	    forEachMapTile(map, (tile) => {
	      if (tile.unit) delete tile.unit;
	    });
	  }
	  //Recomputes which tiles are currently visible from every unit's own
	  //{x, y, viewRange} (see FogOfWar.recompute()), pushes only the tiles whose
	  //state actually changed into HexMap.setTileFog(), and hides/shows each
	  //unit's own model - a unit always sees its own tile, so this never hides
	  //a unit standing still, only ones that have moved out of view (there's no
	  //ownership/faction concept yet, so every unit in _unitsList reveals fog
	  //the same way "friendly" units would). Uses viewPosition, not position:
	  //during a moveTo() animation position is already the destination, while
	  //viewPosition tracks the cell the model is actually passing through.
	  recomputeFog() {
	    var _a;
	    if (!this._fog) return;
	    const units = this._units;
	    for (let index = 0; index < units.length; index += 1) {
	      const unit = units[index];
	      const position = unit.viewPosition;
	      const viewer = (_a = this.fogViewers)[index] ?? (_a[index] = { ...position, viewRange: unit.viewRange });
	      viewer.x = position.x;
	      viewer.y = position.y;
	      viewer.viewRange = unit.viewRange;
	    }
	    const changes = this._fog.recompute(this.fogViewers);
	    this._map.setTilesFog(changes);
	    for (const unit of units) {
	      unit.unit.visible = this._fog.getState(unit.viewPosition.x, unit.viewPosition.y) === 2 /* Visible */;
	    }
	  }
	  cellHover(payload) {
	    this._map.cleanRoutePath();
	    if (this._currentUnit && !this._currentUnit.moving) {
	      const path = this.findPath(this._currentUnit.position, payload);
	      if (path.length > 0) this._map.drawRoutePath(path);
	    }
	    this.emit("hover", payload);
	  }
	  cellClick({ x, y }) {
	    const cellCoords = { x, y };
	    const unitID = this._mapData.data[x][y].unit;
	    if (unitID) {
	      if (!this.options.preventCellClick) {
	        this.emit("click", cellCoords);
	      }
	      this._currentUnit = this._unitsList[unitID];
	      this.emit("unitClick", cellCoords);
	    } else {
	      if (this._currentUnit) {
	        const path = this.findPath(this._currentUnit.position, cellCoords);
	        if (path.length > 0) {
	          const from = this._currentUnit.position;
	          if (this._currentUnit.moveTo(path)) {
	            delete this._mapData.data[from.x][from.y].unit;
	            this._mapData.data[x][y].unit = this._currentUnit.id;
	          }
	        }
	      }
	      this._currentUnit = void 0;
	      this.emit("click", cellCoords);
	    }
	  }
	  get currentUnit() {
	    return this._currentUnit;
	  }
	  get map() {
	    return this._map;
	  }
	  get fogOfWar() {
	    return this._fog;
	  }
	  //Terrain restrictions come from the unit's own info.json flags (see
	  //Unit.terrain - e.g. the viking boat is coastal-only), not a global table,
	  //so each unit type routes over exactly the tiles it may enter. Defaults to
	  //the currently selected unit; without any unit every terrain is allowed.
	  findPath(start, stop, unit = this._currentUnit) {
	    const restrictions = unit ? unit.terrain : {
	      sea: true,
	      coastal: true,
	      land: true,
	      sand: true,
	      tundra: true,
	      snow: true,
	      mountain: true
	    };
	    const fog = this._fog;
	    const pathFinder = new PathFinder(this._mapData, restrictions, (x, y) => {
	      if (fog && fog.getState(x, y) === 0 /* Unseen */) return false;
	      if (x === start.x && y === start.y) return true;
	      const occupyingUnit = this._mapData.data[x]?.[y]?.unit;
	      return !occupyingUnit || occupyingUnit === unit?.id;
	    });
	    return pathFinder.find(start.x, start.y, stop.x, stop.y);
	  }
	  dispose() {
	    this.initRevision += 1;
	    this.clearUnits();
	    this._currentUnit = void 0;
	    this._fog = void 0;
	    this._map.dispose();
	    this.removeAllListeners();
	  }
	};

	// src/world/generateWorld.ts
	var MIN_WORLD_SIZE = 8;
	var MAX_WORLD_SIZE = 512;
	var SEA_LEVEL2 = 0.43;
	var isWater3 = (type) => type === "sea" /* sea */ || type === "coastal" /* coastal */;
	function assertDimension(name, value) {
	  if (!Number.isInteger(value) || value < MIN_WORLD_SIZE || value > MAX_WORLD_SIZE) {
	    throw new RangeError(`${name} must be an integer between ${MIN_WORLD_SIZE} and ${MAX_WORLD_SIZE}`);
	  }
	}
	function sampleBoundedClimate(seed, x, y, width, height) {
	  const nx = width === 1 ? 0 : x / (width - 1) * 2 - 1;
	  const ny = height === 1 ? 0 : y / (height - 1) * 2 - 1;
	  const edge = Math.max(Math.abs(nx), Math.abs(ny));
	  const continent = fractalNoise2D(seed, x * 0.055, y * 0.055, 5);
	  const detail = fractalNoise2D(seed ^ 2738958700, x * 0.14, y * 0.14, 3);
	  const elevation = continent * 0.78 + detail * 0.22 + 0.12 - Math.pow(edge, 3) * 0.58;
	  const moisture = fractalNoise2D(seed ^ 3355524772, x * 0.08, y * 0.08, 4);
	  const temperatureNoise = fractalNoise2D(seed ^ 2911926141, x * 0.07, y * 0.07, 3);
	  const latitude = Math.abs(ny);
	  const temperature = 1 - latitude * 0.82 - Math.max(0, elevation - 0.55) * 0.8 + (temperatureNoise - 0.5) * 0.18;
	  return { elevation, moisture, temperature };
	}
	function sampleToroidalClimate(seed, x, y, width, height) {
	  const nx = x / width;
	  const ny = y / height;
	  const cells = (scale, dimension, minimum) => Math.max(minimum, Math.round(dimension * scale));
	  const continent = periodicFractalNoise2D(
	    seed,
	    nx,
	    ny,
	    cells(0.055, width, 2),
	    cells(0.055, height, 2),
	    5
	  );
	  const detail = periodicFractalNoise2D(
	    seed ^ 2738958700,
	    nx,
	    ny,
	    cells(0.14, width, 3),
	    cells(0.14, height, 3),
	    3
	  );
	  const elevation = continent * 0.78 + detail * 0.22 + 0.03;
	  const moisture = periodicFractalNoise2D(
	    seed ^ 3355524772,
	    nx,
	    ny,
	    cells(0.08, width, 2),
	    cells(0.08, height, 2),
	    4
	  );
	  const temperatureNoise = periodicFractalNoise2D(
	    seed ^ 2911926141,
	    nx,
	    ny,
	    cells(0.07, width, 2),
	    cells(0.07, height, 2),
	    3
	  );
	  const latitude = 0.5 + 0.5 * Math.cos(ny * Math.PI * 2);
	  const temperature = 1 - latitude * 0.82 - Math.max(0, elevation - 0.55) * 0.8 + (temperatureNoise - 0.5) * 0.18;
	  return { elevation, moisture, temperature };
	}
	function classifyTerrain2({ elevation, moisture, temperature }) {
	  if (elevation < SEA_LEVEL2) return "sea" /* sea */;
	  if (elevation > 0.75) return "mountain" /* mountain */;
	  if (temperature < 0.18) return "snow" /* snow */;
	  if (temperature < 0.34) return "tundra" /* tundra */;
	  if (temperature > 0.68 && moisture < 0.42) return "sand" /* sand */;
	  return "land" /* land */;
	}
	function decorateTile(seed, x, y, climate, type) {
	  const tile = { type };
	  if (isWater3(type) || type === "mountain" /* mountain */ || type === "snow" /* snow */) return tile;
	  const modifiers = [];
	  const lake = type === "land" /* land */ && climate.elevation > SEA_LEVEL2 + 0.025 && climate.elevation < 0.56 && climate.moisture > 0.74 && randomAt(seed, x, y, 1821285621) > 0.94;
	  if (lake) {
	    modifiers.push("lake");
	  } else {
	    if (climate.elevation > 0.62) modifiers.push("hill");
	    const forestChance = Math.max(0, Math.min(0.58, (climate.moisture - 0.48) * 1.5));
	    if (randomAt(seed, x, y, 668265263) < forestChance) {
	      modifiers.push("wood");
	      tile.treeModel = climate.temperature > 0.67 ? "Assets/models/palm" : climate.temperature < 0.4 ? "Assets/models/pinia" : "Assets/models/oak";
	    }
	  }
	  if (modifiers.length > 0) tile.modifiers = modifiers;
	  return tile;
	}
	function generateWorld({ seed, width, height, topology = "bounded" }) {
	  assertDimension("width", width);
	  assertDimension("height", height);
	  if (topology !== "bounded" && topology !== "toroidal") {
	    throw new RangeError('topology must be either "bounded" or "toroidal"');
	  }
	  if (topology === "toroidal" && width % 2 !== 0) {
	    throw new RangeError("toroidal worlds require an even width");
	  }
	  const numericSeed = seedToUint32(seed);
	  const data = {};
	  const toroidal = topology === "toroidal";
	  for (let x = 0; x < width; x += 1) {
	    data[x] = {};
	    for (let y = 0; y < height; y += 1) {
	      const climate = toroidal ? sampleToroidalClimate(numericSeed, x, y, width, height) : sampleBoundedClimate(numericSeed, x, y, width, height);
	      const type = classifyTerrain2(climate);
	      data[x][y] = decorateTile(numericSeed, x, y, climate, type);
	    }
	  }
	  const world = { data, w: width, h: height, wrapX: toroidal, wrapY: toroidal };
	  for (let x = 0; x < width; x += 1) {
	    for (let y = 0; y < height; y += 1) {
	      const tile = data[x][y];
	      if (tile.type !== "sea" /* sea */) continue;
	      const touchesLand = getMapNeighbors(world, x, y).some(({ x: nx, y: ny }) => {
	        const neighbor = data[nx]?.[ny];
	        return neighbor !== void 0 && !isWater3(neighbor.type);
	      });
	      if (touchesLand) tile.type = "coastal" /* coastal */;
	    }
	  }
	  return world;
	}

	exports.DEFAULT_WORLD_GENERATION_CHUNK_SIZE = DEFAULT_WORLD_GENERATION_CHUNK_SIZE;
	exports.EventEmitter = EventEmitter;
	exports.FogOfWar = FogOfWar;
	exports.FogState = FogState;
	exports.FrameTaskScheduler = FrameTaskScheduler;
	exports.GameEngine = GameEngine;
	exports.HEXPolygon = HEXPolygon;
	exports.HexMap = HexMap;
	exports.Land = Land;
	exports.LandColor = LandColor;
	exports.LandPriority = LandPriority;
	exports.MAX_WORLD_GENERATION_CHUNK_SIZE = MAX_WORLD_GENERATION_CHUNK_SIZE;
	exports.MAX_WORLD_SIZE = MAX_WORLD_SIZE;
	exports.MIN_WORLD_SIZE = MIN_WORLD_SIZE;
	exports.NEIGHBOR_DIRECTIONS = NEIGHBOR_DIRECTIONS;
	exports.PathFinder = PathFinder;
	exports.ProceduralWorldSource = ProceduralWorldSource;
	exports.SparseWorldChunkStore = SparseWorldChunkStore;
	exports.StaticWorldSource = StaticWorldSource;
	exports.Unit = Unit;
	exports.UnitActions = UnitActions;
	exports.WORLD_CHUNK_FORMAT_VERSION = WORLD_CHUNK_FORMAT_VERSION;
	exports.WORLD_CHUNK_PADDING = WORLD_CHUNK_PADDING;
	exports.WorldGeneratorClient = WorldGeneratorClient;
	exports.WorldGeneratorPool = WorldGeneratorPool;
	exports.WorldStreamer = WorldStreamer;
	exports.assertPackedWorldChunk = assertPackedWorldChunk;
	exports.assertWorldChunk = assertWorldChunk;
	exports.assertWorldSource = assertWorldSource;
	exports.decodeWorldChunkTile = decodeWorldChunkTile;
	exports.generateWorld = generateWorld;
	exports.generateWorldChunk = generateWorldChunk;
	exports.getHexCenter = getHexCenter;
	exports.getMapNeighbors = getMapNeighbors;
	exports.getMapTile = getMapTile;
	exports.getNeighborCoords = getNeighborCoords;
	exports.getNeighbors = getNeighbors;
	exports.getWorldChunkCorePoints = getWorldChunkCorePoints;
	exports.getWorldSourceTile = getWorldSourceTile;
	exports.normalizeMapCoordinates = normalizeMapCoordinates;
	exports.packedChunkFromWorldChunk = packedChunkFromWorldChunk;
	exports.positiveModulo = positiveModulo;

}));
//# sourceMappingURL=hex-map.global.js.map
