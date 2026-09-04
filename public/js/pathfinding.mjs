var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/two-product/two-product.js
var require_two_product = __commonJS({
  "node_modules/two-product/two-product.js"(exports, module) {
    "use strict";
    module.exports = twoProduct;
    var SPLITTER = +(Math.pow(2, 27) + 1);
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
      var err1 = x - ahi * bhi;
      var err2 = err1 - alo * bhi;
      var err3 = err2 - ahi * blo;
      var y = alo * blo - err3;
      if (result) {
        result[0] = y;
        result[1] = x;
        return result;
      }
      return [y, x];
    }
  }
});

// node_modules/robust-sum/robust-sum.js
var require_robust_sum = __commonJS({
  "node_modules/robust-sum/robust-sum.js"(exports, module) {
    "use strict";
    module.exports = linearExpansionSum;
    function scalarScalar(a, b) {
      var x = a + b;
      var bv = x - a;
      var av = x - bv;
      var br = b - bv;
      var ar = a - av;
      var y = ar + br;
      if (y) {
        return [y, x];
      }
      return [x];
    }
    function linearExpansionSum(e, f) {
      var ne = e.length | 0;
      var nf = f.length | 0;
      if (ne === 1 && nf === 1) {
        return scalarScalar(e[0], f[0]);
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
      if (ea < fa) {
        b = ei;
        eptr += 1;
        if (eptr < ne) {
          ei = e[eptr];
          ea = abs(ei);
        }
      } else {
        b = fi;
        fptr += 1;
        if (fptr < nf) {
          fi = f[fptr];
          fa = abs(fi);
        }
      }
      if (eptr < ne && ea < fa || fptr >= nf) {
        a = ei;
        eptr += 1;
        if (eptr < ne) {
          ei = e[eptr];
          ea = abs(ei);
        }
      } else {
        a = fi;
        fptr += 1;
        if (fptr < nf) {
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
      while (eptr < ne && fptr < nf) {
        if (ea < fa) {
          a = ei;
          eptr += 1;
          if (eptr < ne) {
            ei = e[eptr];
            ea = abs(ei);
          }
        } else {
          a = fi;
          fptr += 1;
          if (fptr < nf) {
            fi = f[fptr];
            fa = abs(fi);
          }
        }
        b = q0;
        x = a + b;
        bv = x - a;
        y = b - bv;
        if (y) {
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
      while (eptr < ne) {
        a = ei;
        b = q0;
        x = a + b;
        bv = x - a;
        y = b - bv;
        if (y) {
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
        if (eptr < ne) {
          ei = e[eptr];
        }
      }
      while (fptr < nf) {
        a = fi;
        b = q0;
        x = a + b;
        bv = x - a;
        y = b - bv;
        if (y) {
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
        if (fptr < nf) {
          fi = f[fptr];
        }
      }
      if (q0) {
        g[count++] = q0;
      }
      if (q1) {
        g[count++] = q1;
      }
      if (!count) {
        g[count++] = 0;
      }
      g.length = count;
      return g;
    }
  }
});

// node_modules/two-sum/two-sum.js
var require_two_sum = __commonJS({
  "node_modules/two-sum/two-sum.js"(exports, module) {
    "use strict";
    module.exports = fastTwoSum;
    function fastTwoSum(a, b, result) {
      var x = a + b;
      var bv = x - a;
      var av = x - bv;
      var br = b - bv;
      var ar = a - av;
      if (result) {
        result[0] = ar + br;
        result[1] = x;
        return result;
      }
      return [ar + br, x];
    }
  }
});

// node_modules/robust-scale/robust-scale.js
var require_robust_scale = __commonJS({
  "node_modules/robust-scale/robust-scale.js"(exports, module) {
    "use strict";
    var twoProduct = require_two_product();
    var twoSum = require_two_sum();
    module.exports = scaleLinearExpansion;
    function scaleLinearExpansion(e, scale) {
      var n = e.length;
      if (n === 1) {
        var ts = twoProduct(e[0], scale);
        if (ts[0]) {
          return ts;
        }
        return [ts[1]];
      }
      var g = new Array(2 * n);
      var q = [0.1, 0.1];
      var t = [0.1, 0.1];
      var count = 0;
      twoProduct(e[0], scale, q);
      if (q[0]) {
        g[count++] = q[0];
      }
      for (var i = 1; i < n; ++i) {
        twoProduct(e[i], scale, t);
        var pq = q[1];
        twoSum(pq, t[0], q);
        if (q[0]) {
          g[count++] = q[0];
        }
        var a = t[1];
        var b = q[1];
        var x = a + b;
        var bv = x - a;
        var y = b - bv;
        q[1] = x;
        if (y) {
          g[count++] = y;
        }
      }
      if (q[1]) {
        g[count++] = q[1];
      }
      if (count === 0) {
        g[count++] = 0;
      }
      g.length = count;
      return g;
    }
  }
});

// node_modules/robust-subtract/robust-diff.js
var require_robust_diff = __commonJS({
  "node_modules/robust-subtract/robust-diff.js"(exports, module) {
    "use strict";
    module.exports = robustSubtract;
    function scalarScalar(a, b) {
      var x = a + b;
      var bv = x - a;
      var av = x - bv;
      var br = b - bv;
      var ar = a - av;
      var y = ar + br;
      if (y) {
        return [y, x];
      }
      return [x];
    }
    function robustSubtract(e, f) {
      var ne = e.length | 0;
      var nf = f.length | 0;
      if (ne === 1 && nf === 1) {
        return scalarScalar(e[0], -f[0]);
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
      if (ea < fa) {
        b = ei;
        eptr += 1;
        if (eptr < ne) {
          ei = e[eptr];
          ea = abs(ei);
        }
      } else {
        b = fi;
        fptr += 1;
        if (fptr < nf) {
          fi = -f[fptr];
          fa = abs(fi);
        }
      }
      if (eptr < ne && ea < fa || fptr >= nf) {
        a = ei;
        eptr += 1;
        if (eptr < ne) {
          ei = e[eptr];
          ea = abs(ei);
        }
      } else {
        a = fi;
        fptr += 1;
        if (fptr < nf) {
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
      while (eptr < ne && fptr < nf) {
        if (ea < fa) {
          a = ei;
          eptr += 1;
          if (eptr < ne) {
            ei = e[eptr];
            ea = abs(ei);
          }
        } else {
          a = fi;
          fptr += 1;
          if (fptr < nf) {
            fi = -f[fptr];
            fa = abs(fi);
          }
        }
        b = q0;
        x = a + b;
        bv = x - a;
        y = b - bv;
        if (y) {
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
      while (eptr < ne) {
        a = ei;
        b = q0;
        x = a + b;
        bv = x - a;
        y = b - bv;
        if (y) {
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
        if (eptr < ne) {
          ei = e[eptr];
        }
      }
      while (fptr < nf) {
        a = fi;
        b = q0;
        x = a + b;
        bv = x - a;
        y = b - bv;
        if (y) {
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
        if (fptr < nf) {
          fi = -f[fptr];
        }
      }
      if (q0) {
        g[count++] = q0;
      }
      if (q1) {
        g[count++] = q1;
      }
      if (!count) {
        g[count++] = 0;
      }
      g.length = count;
      return g;
    }
  }
});

// node_modules/robust-orientation/orientation.js
var require_orientation = __commonJS({
  "node_modules/robust-orientation/orientation.js"(exports, module) {
    "use strict";
    var twoProduct = require_two_product();
    var robustSum = require_robust_sum();
    var robustScale = require_robust_scale();
    var robustSubtract = require_robust_diff();
    var NUM_EXPAND = 5;
    var EPSILON = 11102230246251565e-32;
    var ERRBOUND3 = (3 + 16 * EPSILON) * EPSILON;
    var ERRBOUND4 = (7 + 56 * EPSILON) * EPSILON;
    function orientation_3(sum, prod, scale, sub) {
      return function orientation3Exact2(m0, m1, m2) {
        var p = sum(sum(prod(m1[1], m2[0]), prod(-m2[1], m1[0])), sum(prod(m0[1], m1[0]), prod(-m1[1], m0[0])));
        var n = sum(prod(m0[1], m2[0]), prod(-m2[1], m0[0]));
        var d = sub(p, n);
        return d[d.length - 1];
      };
    }
    function orientation_4(sum, prod, scale, sub) {
      return function orientation4Exact2(m0, m1, m2, m3) {
        var p = sum(sum(scale(sum(prod(m2[1], m3[0]), prod(-m3[1], m2[0])), m1[2]), sum(scale(sum(prod(m1[1], m3[0]), prod(-m3[1], m1[0])), -m2[2]), scale(sum(prod(m1[1], m2[0]), prod(-m2[1], m1[0])), m3[2]))), sum(scale(sum(prod(m1[1], m3[0]), prod(-m3[1], m1[0])), m0[2]), sum(scale(sum(prod(m0[1], m3[0]), prod(-m3[1], m0[0])), -m1[2]), scale(sum(prod(m0[1], m1[0]), prod(-m1[1], m0[0])), m3[2]))));
        var n = sum(sum(scale(sum(prod(m2[1], m3[0]), prod(-m3[1], m2[0])), m0[2]), sum(scale(sum(prod(m0[1], m3[0]), prod(-m3[1], m0[0])), -m2[2]), scale(sum(prod(m0[1], m2[0]), prod(-m2[1], m0[0])), m3[2]))), sum(scale(sum(prod(m1[1], m2[0]), prod(-m2[1], m1[0])), m0[2]), sum(scale(sum(prod(m0[1], m2[0]), prod(-m2[1], m0[0])), -m1[2]), scale(sum(prod(m0[1], m1[0]), prod(-m1[1], m0[0])), m2[2]))));
        var d = sub(p, n);
        return d[d.length - 1];
      };
    }
    function orientation_5(sum, prod, scale, sub) {
      return function orientation5Exact(m0, m1, m2, m3, m4) {
        var p = sum(sum(sum(scale(sum(scale(sum(prod(m3[1], m4[0]), prod(-m4[1], m3[0])), m2[2]), sum(scale(sum(prod(m2[1], m4[0]), prod(-m4[1], m2[0])), -m3[2]), scale(sum(prod(m2[1], m3[0]), prod(-m3[1], m2[0])), m4[2]))), m1[3]), sum(scale(sum(scale(sum(prod(m3[1], m4[0]), prod(-m4[1], m3[0])), m1[2]), sum(scale(sum(prod(m1[1], m4[0]), prod(-m4[1], m1[0])), -m3[2]), scale(sum(prod(m1[1], m3[0]), prod(-m3[1], m1[0])), m4[2]))), -m2[3]), scale(sum(scale(sum(prod(m2[1], m4[0]), prod(-m4[1], m2[0])), m1[2]), sum(scale(sum(prod(m1[1], m4[0]), prod(-m4[1], m1[0])), -m2[2]), scale(sum(prod(m1[1], m2[0]), prod(-m2[1], m1[0])), m4[2]))), m3[3]))), sum(scale(sum(scale(sum(prod(m2[1], m3[0]), prod(-m3[1], m2[0])), m1[2]), sum(scale(sum(prod(m1[1], m3[0]), prod(-m3[1], m1[0])), -m2[2]), scale(sum(prod(m1[1], m2[0]), prod(-m2[1], m1[0])), m3[2]))), -m4[3]), sum(scale(sum(scale(sum(prod(m3[1], m4[0]), prod(-m4[1], m3[0])), m1[2]), sum(scale(sum(prod(m1[1], m4[0]), prod(-m4[1], m1[0])), -m3[2]), scale(sum(prod(m1[1], m3[0]), prod(-m3[1], m1[0])), m4[2]))), m0[3]), scale(sum(scale(sum(prod(m3[1], m4[0]), prod(-m4[1], m3[0])), m0[2]), sum(scale(sum(prod(m0[1], m4[0]), prod(-m4[1], m0[0])), -m3[2]), scale(sum(prod(m0[1], m3[0]), prod(-m3[1], m0[0])), m4[2]))), -m1[3])))), sum(sum(scale(sum(scale(sum(prod(m1[1], m4[0]), prod(-m4[1], m1[0])), m0[2]), sum(scale(sum(prod(m0[1], m4[0]), prod(-m4[1], m0[0])), -m1[2]), scale(sum(prod(m0[1], m1[0]), prod(-m1[1], m0[0])), m4[2]))), m3[3]), sum(scale(sum(scale(sum(prod(m1[1], m3[0]), prod(-m3[1], m1[0])), m0[2]), sum(scale(sum(prod(m0[1], m3[0]), prod(-m3[1], m0[0])), -m1[2]), scale(sum(prod(m0[1], m1[0]), prod(-m1[1], m0[0])), m3[2]))), -m4[3]), scale(sum(scale(sum(prod(m2[1], m3[0]), prod(-m3[1], m2[0])), m1[2]), sum(scale(sum(prod(m1[1], m3[0]), prod(-m3[1], m1[0])), -m2[2]), scale(sum(prod(m1[1], m2[0]), prod(-m2[1], m1[0])), m3[2]))), m0[3]))), sum(scale(sum(scale(sum(prod(m2[1], m3[0]), prod(-m3[1], m2[0])), m0[2]), sum(scale(sum(prod(m0[1], m3[0]), prod(-m3[1], m0[0])), -m2[2]), scale(sum(prod(m0[1], m2[0]), prod(-m2[1], m0[0])), m3[2]))), -m1[3]), sum(scale(sum(scale(sum(prod(m1[1], m3[0]), prod(-m3[1], m1[0])), m0[2]), sum(scale(sum(prod(m0[1], m3[0]), prod(-m3[1], m0[0])), -m1[2]), scale(sum(prod(m0[1], m1[0]), prod(-m1[1], m0[0])), m3[2]))), m2[3]), scale(sum(scale(sum(prod(m1[1], m2[0]), prod(-m2[1], m1[0])), m0[2]), sum(scale(sum(prod(m0[1], m2[0]), prod(-m2[1], m0[0])), -m1[2]), scale(sum(prod(m0[1], m1[0]), prod(-m1[1], m0[0])), m2[2]))), -m3[3])))));
        var n = sum(sum(sum(scale(sum(scale(sum(prod(m3[1], m4[0]), prod(-m4[1], m3[0])), m2[2]), sum(scale(sum(prod(m2[1], m4[0]), prod(-m4[1], m2[0])), -m3[2]), scale(sum(prod(m2[1], m3[0]), prod(-m3[1], m2[0])), m4[2]))), m0[3]), scale(sum(scale(sum(prod(m3[1], m4[0]), prod(-m4[1], m3[0])), m0[2]), sum(scale(sum(prod(m0[1], m4[0]), prod(-m4[1], m0[0])), -m3[2]), scale(sum(prod(m0[1], m3[0]), prod(-m3[1], m0[0])), m4[2]))), -m2[3])), sum(scale(sum(scale(sum(prod(m2[1], m4[0]), prod(-m4[1], m2[0])), m0[2]), sum(scale(sum(prod(m0[1], m4[0]), prod(-m4[1], m0[0])), -m2[2]), scale(sum(prod(m0[1], m2[0]), prod(-m2[1], m0[0])), m4[2]))), m3[3]), scale(sum(scale(sum(prod(m2[1], m3[0]), prod(-m3[1], m2[0])), m0[2]), sum(scale(sum(prod(m0[1], m3[0]), prod(-m3[1], m0[0])), -m2[2]), scale(sum(prod(m0[1], m2[0]), prod(-m2[1], m0[0])), m3[2]))), -m4[3]))), sum(sum(scale(sum(scale(sum(prod(m2[1], m4[0]), prod(-m4[1], m2[0])), m1[2]), sum(scale(sum(prod(m1[1], m4[0]), prod(-m4[1], m1[0])), -m2[2]), scale(sum(prod(m1[1], m2[0]), prod(-m2[1], m1[0])), m4[2]))), m0[3]), scale(sum(scale(sum(prod(m2[1], m4[0]), prod(-m4[1], m2[0])), m0[2]), sum(scale(sum(prod(m0[1], m4[0]), prod(-m4[1], m0[0])), -m2[2]), scale(sum(prod(m0[1], m2[0]), prod(-m2[1], m0[0])), m4[2]))), -m1[3])), sum(scale(sum(scale(sum(prod(m1[1], m4[0]), prod(-m4[1], m1[0])), m0[2]), sum(scale(sum(prod(m0[1], m4[0]), prod(-m4[1], m0[0])), -m1[2]), scale(sum(prod(m0[1], m1[0]), prod(-m1[1], m0[0])), m4[2]))), m2[3]), scale(sum(scale(sum(prod(m1[1], m2[0]), prod(-m2[1], m1[0])), m0[2]), sum(scale(sum(prod(m0[1], m2[0]), prod(-m2[1], m0[0])), -m1[2]), scale(sum(prod(m0[1], m1[0]), prod(-m1[1], m0[0])), m2[2]))), -m4[3]))));
        var d = sub(p, n);
        return d[d.length - 1];
      };
    }
    function orientation(n) {
      var fn = n === 3 ? orientation_3 : n === 4 ? orientation_4 : orientation_5;
      return fn(robustSum, twoProduct, robustScale, robustSubtract);
    }
    var orientation3Exact = orientation(3);
    var orientation4Exact = orientation(4);
    var CACHED = [
      function orientation0() {
        return 0;
      },
      function orientation1() {
        return 0;
      },
      function orientation2(a, b) {
        return b[0] - a[0];
      },
      function orientation3(a, b, c) {
        var l = (a[1] - c[1]) * (b[0] - c[0]);
        var r = (a[0] - c[0]) * (b[1] - c[1]);
        var det = l - r;
        var s;
        if (l > 0) {
          if (r <= 0) {
            return det;
          } else {
            s = l + r;
          }
        } else if (l < 0) {
          if (r >= 0) {
            return det;
          } else {
            s = -(l + r);
          }
        } else {
          return det;
        }
        var tol = ERRBOUND3 * s;
        if (det >= tol || det <= -tol) {
          return det;
        }
        return orientation3Exact(a, b, c);
      },
      function orientation4(a, b, c, d) {
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
        var det = adz * (bdxcdy - cdxbdy) + bdz * (cdxady - adxcdy) + cdz * (adxbdy - bdxady);
        var permanent = (Math.abs(bdxcdy) + Math.abs(cdxbdy)) * Math.abs(adz) + (Math.abs(cdxady) + Math.abs(adxcdy)) * Math.abs(bdz) + (Math.abs(adxbdy) + Math.abs(bdxady)) * Math.abs(cdz);
        var tol = ERRBOUND4 * permanent;
        if (det > tol || -det > tol) {
          return det;
        }
        return orientation4Exact(a, b, c, d);
      }
    ];
    function slowOrient(args) {
      var proc2 = CACHED[args.length];
      if (!proc2) {
        proc2 = CACHED[args.length] = orientation(args.length);
      }
      return proc2.apply(void 0, args);
    }
    function proc(slow, o0, o1, o2, o3, o4, o5) {
      return function getOrientation(a0, a1, a2, a3, a4) {
        switch (arguments.length) {
          case 0:
          case 1:
            return 0;
          case 2:
            return o2(a0, a1);
          case 3:
            return o3(a0, a1, a2);
          case 4:
            return o4(a0, a1, a2, a3);
          case 5:
            return o5(a0, a1, a2, a3, a4);
        }
        var s = new Array(arguments.length);
        for (var i = 0; i < arguments.length; ++i) {
          s[i] = arguments[i];
        }
        return slow(s);
      };
    }
    function generateOrientationProc() {
      while (CACHED.length <= NUM_EXPAND) {
        CACHED.push(orientation(CACHED.length));
      }
      module.exports = proc.apply(void 0, [slowOrient].concat(CACHED));
      for (var i = 0; i <= NUM_EXPAND; ++i) {
        module.exports[i] = CACHED[i];
      }
    }
    generateOrientationProc();
  }
});

// node_modules/robust-point-in-polygon/robust-pnp.js
var require_robust_pnp = __commonJS({
  "node_modules/robust-point-in-polygon/robust-pnp.js"(exports, module) {
    "use strict";
    module.exports = robustPointInPolygon;
    var orient = require_orientation();
    function robustPointInPolygon(vs, point) {
      var x = point[0];
      var y = point[1];
      var n = vs.length;
      var inside = 1;
      var lim = n;
      for (var i = 0, j = n - 1; i < lim; j = i++) {
        var a = vs[i];
        var b = vs[j];
        var yi = a[1];
        var yj = b[1];
        if (yj < yi) {
          if (yj < y && y < yi) {
            var s = orient(a, b, point);
            if (s === 0) {
              return 0;
            } else {
              inside ^= 0 < s | 0;
            }
          } else if (y === yi) {
            var c = vs[(i + 1) % n];
            var yk = c[1];
            if (yi < yk) {
              var s = orient(a, b, point);
              if (s === 0) {
                return 0;
              } else {
                inside ^= 0 < s | 0;
              }
            }
          }
        } else if (yi < yj) {
          if (yi < y && y < yj) {
            var s = orient(a, b, point);
            if (s === 0) {
              return 0;
            } else {
              inside ^= s < 0 | 0;
            }
          } else if (y === yi) {
            var c = vs[(i + 1) % n];
            var yk = c[1];
            if (yk < yi) {
              var s = orient(a, b, point);
              if (s === 0) {
                return 0;
              } else {
                inside ^= s < 0 | 0;
              }
            }
          }
        } else if (y === yi) {
          var x0 = Math.min(a[0], b[0]);
          var x1 = Math.max(a[0], b[0]);
          if (i === 0) {
            while (j > 0) {
              var k = (j + n - 1) % n;
              var p = vs[k];
              if (p[1] !== y) {
                break;
              }
              var px = p[0];
              x0 = Math.min(x0, px);
              x1 = Math.max(x1, px);
              j = k;
            }
            if (j === 0) {
              if (x0 <= x && x <= x1) {
                return 0;
              }
              return 1;
            }
            lim = j + 1;
          }
          var y0 = vs[(j + n - 1) % n][1];
          while (i + 1 < lim) {
            var p = vs[i + 1];
            if (p[1] !== y) {
              break;
            }
            var px = p[0];
            x0 = Math.min(x0, px);
            x1 = Math.max(x1, px);
            i += 1;
          }
          if (x0 <= x && x <= x1) {
            return 0;
          }
          var y1 = vs[(i + 1) % n][1];
          if (x < x0 && y0 < y !== y1 < y) {
            inside ^= 1;
          }
        }
      }
      return 2 * inside - 1;
    }
  }
});

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

// src/world/WorldGeneratorVersion.ts
var WORLD_GENERATOR_VERSION = 11;

// src/world/InfiniteWaterCurveField.ts
var UINT32_RANGE = 4294967296;
var TAU = Math.PI * 2;
var BASIN_WAVE_A_MINIMUM = 0.07;
var BASIN_WAVE_A_SPAN = 0.05;
var BASIN_WAVE_B_MINIMUM = 0.035;
var BASIN_WAVE_B_SPAN = 0.035;
var BASIN_WAVE_C_MINIMUM = 0.02;
var BASIN_WAVE_C_SPAN = 0.03;
var BASIN_MAXIMUM_BOUNDARY_SCALE = 1 + BASIN_WAVE_A_MINIMUM + BASIN_WAVE_A_SPAN + BASIN_WAVE_B_MINIMUM + BASIN_WAVE_B_SPAN + BASIN_WAVE_C_MINIMUM + BASIN_WAVE_C_SPAN;
var REFERENCE_FAMILIES = Object.freeze([
  Object.freeze({
    cellSize: 950 / 28,
    slots: 2,
    spawnScale: 0.34,
    minimumLength: 700 / 28,
    maximumLength: 2600 / 28,
    minimumWidth: 27 / 28,
    maximumWidth: 42 / 28,
    minimumControlStep: 65 / 28,
    maximumControlStep: 125 / 28,
    maximumBranches: 1
  }),
  Object.freeze({
    cellSize: 2300 / 28,
    slots: 2,
    spawnScale: 0.52,
    minimumLength: 2200 / 28,
    maximumLength: 7200 / 28,
    minimumWidth: 38 / 28,
    maximumWidth: 78 / 28,
    minimumControlStep: 115 / 28,
    maximumControlStep: 210 / 28,
    maximumBranches: 3
  }),
  Object.freeze({
    cellSize: 5900 / 28,
    slots: 1,
    spawnScale: 0.62,
    minimumLength: 7200 / 28,
    maximumLength: 17e3 / 28,
    minimumWidth: 76 / 28,
    maximumWidth: 162 / 28,
    minimumControlStep: 190 / 28,
    maximumControlStep: 310 / 28,
    maximumBranches: 5
  })
]);
var REFERENCE_BASINS = Object.freeze({
  // These values reproduce the inspector's reviewed 58% basin setting in
  // radius-one hex units. Basin diameters span several 24-cell source chunks
  // while Poisson separation preserves deterministic land corridors.
  density: 0.12 + 0.58 * 0.55,
  candidateCellSize: 2600 / 28,
  minimumSeparation: 5600 / 28,
  minimumMajorRadius: 1250 * (0.82 + 0.58 * 0.22) / 28,
  maximumMajorRadius: 2050 * (0.82 + 0.58 * 0.22) / 28,
  minimumMinorRatio: 0.55,
  maximumMinorRatio: 0.82
});
var INFINITE_WATER_CURVE_REFERENCE_PROFILE = Object.freeze({
  density: 0.46,
  curvature: 0.68,
  polylineChance: 0.34,
  sampleSpacing: 0.64,
  minimumBranchLength: 280 / 28,
  maximumBranchLength: 860 / 28,
  broadDensityScale: 11e3 / 28,
  regionalDensityScale: 4800 / 28,
  families: REFERENCE_FAMILIES,
  basins: REFERENCE_BASINS
});
function finite(name, value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number`);
  }
  return value;
}
function positive(name, value) {
  const number = finite(name, value);
  if (number <= 0) throw new RangeError(`${name} must be positive`);
  return number;
}
function unitInterval(name, value) {
  const number = finite(name, value);
  if (number < 0 || number > 1) throw new RangeError(`${name} must be between 0 and 1`);
  return number;
}
function assertInfiniteWaterCurveProfile(value) {
  if (!value || typeof value !== "object") throw new TypeError("water curve profile must be an object");
  const profile = value;
  unitInterval("waterCurve.density", profile.density);
  unitInterval("waterCurve.curvature", profile.curvature);
  unitInterval("waterCurve.polylineChance", profile.polylineChance);
  positive("waterCurve.sampleSpacing", profile.sampleSpacing);
  positive("waterCurve.minimumBranchLength", profile.minimumBranchLength);
  positive("waterCurve.maximumBranchLength", profile.maximumBranchLength);
  positive("waterCurve.broadDensityScale", profile.broadDensityScale);
  positive("waterCurve.regionalDensityScale", profile.regionalDensityScale);
  if (!(profile.minimumBranchLength < profile.maximumBranchLength)) {
    throw new RangeError("water curve branch length range must be ordered");
  }
  if (!Array.isArray(profile.families) || profile.families.length === 0) {
    throw new RangeError("water curve profile must contain at least one family");
  }
  for (const [index, family] of profile.families.entries()) {
    if (!family || typeof family !== "object") {
      throw new TypeError(`waterCurve.families.${index} must be an object`);
    }
    positive(`waterCurve.families.${index}.cellSize`, family.cellSize);
    positive(`waterCurve.families.${index}.minimumLength`, family.minimumLength);
    positive(`waterCurve.families.${index}.maximumLength`, family.maximumLength);
    positive(`waterCurve.families.${index}.minimumWidth`, family.minimumWidth);
    positive(`waterCurve.families.${index}.maximumWidth`, family.maximumWidth);
    positive(`waterCurve.families.${index}.minimumControlStep`, family.minimumControlStep);
    positive(`waterCurve.families.${index}.maximumControlStep`, family.maximumControlStep);
    unitInterval(`waterCurve.families.${index}.spawnScale`, family.spawnScale);
    if (!Number.isInteger(family.slots) || family.slots <= 0) {
      throw new RangeError(`waterCurve.families.${index}.slots must be a positive integer`);
    }
    if (!Number.isInteger(family.maximumBranches) || family.maximumBranches < 0) {
      throw new RangeError(`waterCurve.families.${index}.maximumBranches must be a non-negative integer`);
    }
    if (!(family.minimumLength < family.maximumLength) || !(family.minimumWidth < family.maximumWidth) || !(family.minimumControlStep < family.maximumControlStep)) {
      throw new RangeError(`waterCurve.families.${index} ranges must be ordered`);
    }
  }
  if (!profile.basins || typeof profile.basins !== "object") {
    throw new TypeError("waterCurve.basins must be an object");
  }
  const basins = profile.basins;
  unitInterval("waterCurve.basins.density", basins.density);
  positive("waterCurve.basins.candidateCellSize", basins.candidateCellSize);
  positive("waterCurve.basins.minimumSeparation", basins.minimumSeparation);
  positive("waterCurve.basins.minimumMajorRadius", basins.minimumMajorRadius);
  positive("waterCurve.basins.maximumMajorRadius", basins.maximumMajorRadius);
  unitInterval("waterCurve.basins.minimumMinorRatio", basins.minimumMinorRatio);
  unitInterval("waterCurve.basins.maximumMinorRatio", basins.maximumMinorRatio);
  if (!(basins.minimumMajorRadius < basins.maximumMajorRadius) || !(basins.minimumMinorRatio < basins.maximumMinorRatio)) {
    throw new RangeError("water curve basin ranges must be ordered");
  }
  if (basins.minimumMinorRatio <= 0) {
    throw new RangeError("water curve basin minor ratios must be positive");
  }
  const maximumBasinReach = basins.maximumMajorRadius * BASIN_MAXIMUM_BOUNDARY_SCALE;
  if (basins.minimumSeparation <= maximumBasinReach * 2) {
    throw new RangeError("water curve basins must preserve a positive land corridor");
  }
}
function assertBounds(bounds) {
  if (!bounds || typeof bounds !== "object") throw new TypeError("water curve bounds are required");
  for (const name of ["minX", "maxX", "minY", "maxY"]) {
    finite(`water curve bounds.${name}`, bounds[name]);
  }
  if (!(bounds.minX <= bounds.maxX) || !(bounds.minY <= bounds.maxY)) {
    throw new RangeError("water curve bounds must be ordered");
  }
}
function mix32(value) {
  let mixed = value >>> 0;
  mixed ^= mixed >>> 16;
  mixed = Math.imul(mixed, 2146121005);
  mixed ^= mixed >>> 15;
  mixed = Math.imul(mixed, 2221713035);
  mixed ^= mixed >>> 16;
  return mixed >>> 0;
}
function featureKey(seed, familyIndex, cellX, cellY, slot) {
  return mix32(
    seed ^ Math.imul(cellX, 1663821227) ^ Math.imul(cellY, 2232777461) ^ Math.imul(familyIndex, 2654435761) ^ Math.imul(slot, 2246822519)
  );
}
function random(seed, x, y, salt) {
  return mix32(
    seed ^ Math.imul(x, 2654435761) ^ Math.imul(y, 2246822519) ^ Math.imul(salt, 3266489917)
  ) / UINT32_RANGE;
}
function randomForFeature(seed, key, salt) {
  return mix32(seed ^ key ^ Math.imul(salt, 668265261)) / UINT32_RANGE;
}
function buildBasinCandidate(seed, profile, cellX, cellY) {
  const key = featureKey(seed, 101, cellX, cellY, 0);
  if (randomForFeature(seed, key, 1001) >= profile.density) return void 0;
  return {
    ownerCellX: cellX,
    ownerCellY: cellY,
    key,
    centerX: (cellX + 0.05 + randomForFeature(seed, key, 1019) * 0.9) * profile.candidateCellSize,
    centerY: (cellY + 0.05 + randomForFeature(seed, key, 1021) * 0.9) * profile.candidateCellSize,
    priority: randomForFeature(seed, key, 1003)
  };
}
function buildBasin(seed, profile, cellX, cellY, candidateAt) {
  const candidate = candidateAt(cellX, cellY);
  if (!candidate) return void 0;
  const neighborRadius = Math.ceil(profile.minimumSeparation / profile.candidateCellSize);
  const minimumSquaredDistance = profile.minimumSeparation ** 2;
  for (let neighborX = cellX - neighborRadius; neighborX <= cellX + neighborRadius; neighborX += 1) {
    for (let neighborY = cellY - neighborRadius; neighborY <= cellY + neighborRadius; neighborY += 1) {
      if (neighborX === cellX && neighborY === cellY) continue;
      const neighbor = candidateAt(neighborX, neighborY);
      if (!neighbor) continue;
      const squaredDistance = (neighbor.centerX - candidate.centerX) ** 2 + (neighbor.centerY - candidate.centerY) ** 2;
      const neighborWins = neighbor.priority < candidate.priority || neighbor.priority === candidate.priority && (neighborX < cellX || neighborX === cellX && neighborY < cellY);
      if (squaredDistance < minimumSquaredDistance && neighborWins) return void 0;
    }
  }
  const majorRadius = profile.minimumMajorRadius + randomForFeature(seed, candidate.key, 1009) * (profile.maximumMajorRadius - profile.minimumMajorRadius);
  const minorRadius = majorRadius * (profile.minimumMinorRatio + randomForFeature(seed, candidate.key, 1013) * (profile.maximumMinorRatio - profile.minimumMinorRatio));
  const angle = randomForFeature(seed, candidate.key, 1031) * TAU;
  return Object.freeze({
    featureKey: candidate.key,
    ownerCellX: cellX,
    ownerCellY: cellY,
    centerX: candidate.centerX,
    centerY: candidate.centerY,
    cosine: Math.cos(angle),
    sine: Math.sin(angle),
    majorRadius,
    minorRadius,
    waveA: BASIN_WAVE_A_MINIMUM + randomForFeature(seed, candidate.key, 1033) * BASIN_WAVE_A_SPAN,
    waveB: BASIN_WAVE_B_MINIMUM + randomForFeature(seed, candidate.key, 1039) * BASIN_WAVE_B_SPAN,
    waveC: BASIN_WAVE_C_MINIMUM + randomForFeature(seed, candidate.key, 1049) * BASIN_WAVE_C_SPAN,
    phaseA: randomForFeature(seed, candidate.key, 1051) * TAU,
    phaseB: randomForFeature(seed, candidate.key, 1061) * TAU,
    phaseC: randomForFeature(seed, candidate.key, 1063) * TAU
  });
}
function waterBasinValue(x, y, basin) {
  finite("water basin x", x);
  finite("water basin y", y);
  const deltaX = x - basin.centerX;
  const deltaY = y - basin.centerY;
  const localX = deltaX * basin.cosine + deltaY * basin.sine;
  const localY = -deltaX * basin.sine + deltaY * basin.cosine;
  const angle = Math.atan2(localY / basin.minorRadius, localX / basin.majorRadius);
  const boundary = 1 + Math.sin(angle * 3 + basin.phaseA) * basin.waveA + Math.sin(angle * 5 + basin.phaseB) * basin.waveB + Math.sin(angle * 8 + basin.phaseC) * basin.waveC;
  return Math.hypot(localX / basin.majorRadius, localY / basin.minorRadius) / boundary - 1;
}
function isPointInsideWaterBasin(x, y, basin, footprintExpansion = 0) {
  const expansion = finite("water basin footprint expansion", footprintExpansion);
  if (expansion < 0) throw new RangeError("water basin footprint expansion must be non-negative");
  return waterBasinValue(x, y, basin) <= expansion / basin.minorRadius;
}
function basinReach(basin) {
  return basin.majorRadius * (1 + basin.waveA + basin.waveB + basin.waveC);
}
function basinIntersects(basin, bounds) {
  const reach = basinReach(basin);
  return basin.centerX + reach >= bounds.minX && basin.centerX - reach <= bounds.maxX && basin.centerY + reach >= bounds.minY && basin.centerY - reach <= bounds.maxY;
}
var smoothstep = (value) => value * value * (3 - 2 * value);
function valueNoise1D(seed, x, key, salt) {
  const cell = Math.floor(x);
  const amount = smoothstep(x - cell);
  const first = random(seed, cell, key, salt) * 2 - 1;
  const second = random(seed, cell + 1, key, salt) * 2 - 1;
  return first + (second - first) * amount;
}
function valueNoise2D2(seed, x, y, salt) {
  const cellX = Math.floor(x);
  const cellY = Math.floor(y);
  const amountX = smoothstep(x - cellX);
  const amountY = smoothstep(y - cellY);
  const topLeft = random(seed, cellX, cellY, salt) * 2 - 1;
  const topRight = random(seed, cellX + 1, cellY, salt) * 2 - 1;
  const bottomLeft = random(seed, cellX, cellY + 1, salt) * 2 - 1;
  const bottomRight = random(seed, cellX + 1, cellY + 1, salt) * 2 - 1;
  const top = topLeft + (topRight - topLeft) * amountX;
  const bottom = bottomLeft + (bottomRight - bottomLeft) * amountX;
  return top + (bottom - top) * amountY;
}
function localDensity(seed, profile, x, y) {
  const broad = valueNoise2D2(seed, x / profile.broadDensityScale, y / profile.broadDensityScale, 61) * 0.5 + 0.5;
  const regional = valueNoise2D2(
    seed,
    x / profile.regionalDensityScale,
    y / profile.regionalDensityScale,
    67
  ) * 0.5 + 0.5;
  const clustered = Math.max(0, Math.min(1, (broad * 0.72 + regional * 0.28 - 0.36) / 0.44));
  return 0.22 + smoothstep(clustered) * 0.78;
}
function turnAt(seed, key, parameter, turnScale) {
  const broad = valueNoise1D(seed, parameter / 8.2, key, 101);
  const middle = valueNoise1D(seed, parameter / 3.3, key, 211);
  const detail = valueNoise1D(seed, parameter / 1.45, key, 307);
  return turnScale * (broad * 0.58 + middle * 0.29 + detail * 0.13);
}
function buildMainCurve(seed, profile, familyIndex, cellX, cellY, slot) {
  const family = profile.families[familyIndex];
  const key = featureKey(seed, familyIndex, cellX, cellY, slot);
  const centerX = (cellX + 0.5) * family.cellSize;
  const centerY = (cellY + 0.5) * family.cellSize;
  const spawnChance = profile.density * family.spawnScale * localDensity(seed, profile, centerX, centerY);
  if (randomForFeature(seed, key, 17) >= spawnChance) return void 0;
  const origin = {
    x: (cellX + 0.04 + randomForFeature(seed, key, 23) * 0.92) * family.cellSize,
    y: (cellY + 0.04 + randomForFeature(seed, key, 29) * 0.92) * family.cellSize
  };
  const baseAngle = randomForFeature(seed, key, 31) * TAU;
  const lengthAmount = randomForFeature(seed, key, 37) ** 1.35;
  const totalLength = family.minimumLength + lengthAmount * (family.maximumLength - family.minimumLength);
  const controlStep = family.minimumControlStep + randomForFeature(seed, key, 41) * (family.maximumControlStep - family.minimumControlStep);
  const halfSteps = Math.ceil(totalLength / (controlStep * 2));
  const baseWidth = family.minimumWidth + randomForFeature(seed, key, 43) * (family.maximumWidth - family.minimumWidth);
  const turnScale = (0.035 + profile.curvature * 0.24) * (0.78 + randomForFeature(seed, key, 47) * 0.72);
  const widthAt = (parameter) => {
    const progress = (parameter + halfSteps) / (halfSteps * 2);
    const growth = 0.38 + smoothstep(progress) * 0.78;
    const variation = 1 + valueNoise1D(seed, parameter / 5.5, key, 401) * 0.24;
    return Math.max(family.minimumWidth, baseWidth * growth * variation);
  };
  const before = [];
  const after = [];
  let current = { ...origin };
  let heading = baseAngle;
  for (let step = 1; step <= halfSteps; step += 1) {
    heading -= turnAt(seed, key, -step + 0.5, turnScale);
    current = {
      x: current.x - Math.cos(heading) * controlStep,
      y: current.y - Math.sin(heading) * controlStep
    };
    before.push({ ...current, width: widthAt(-step) });
  }
  current = { ...origin };
  heading = baseAngle;
  for (let step = 1; step <= halfSteps; step += 1) {
    heading += turnAt(seed, key, step - 0.5, turnScale);
    current = {
      x: current.x + Math.cos(heading) * controlStep,
      y: current.y + Math.sin(heading) * controlStep
    };
    after.push({ ...current, width: widthAt(step) });
  }
  return {
    familyIndex,
    family,
    key,
    ownerCellX: cellX,
    ownerCellY: cellY,
    ownerSlot: slot,
    polyline: randomForFeature(seed, key, 59) < profile.polylineChance,
    controls: [...before.reverse(), { ...origin, width: widthAt(0) }, ...after]
  };
}
function catmullRomPoint(first, second, third, fourth, amount) {
  const squared = amount * amount;
  const cubed = squared * amount;
  const interpolate = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * amount + (2 * a - 5 * b + 4 * c - d) * squared + (-a + 3 * b - 3 * c + d) * cubed);
  return {
    x: interpolate(first.x, second.x, third.x, fourth.x),
    y: interpolate(first.y, second.y, third.y, fourth.y),
    width: second.width + (third.width - second.width) * smoothstep(amount)
  };
}
function linearPoint(first, second, amount) {
  return {
    x: first.x + (second.x - first.x) * amount,
    y: first.y + (second.y - first.y) * amount,
    width: first.width + (second.width - first.width) * smoothstep(amount)
  };
}
function sampleMain(profile, main) {
  const points = [];
  for (let index = 0; index < main.controls.length - 1; index += 1) {
    const first = main.controls[Math.max(0, index - 1)];
    const second = main.controls[index];
    const third = main.controls[index + 1];
    const fourth = main.controls[Math.min(main.controls.length - 1, index + 2)];
    const distance = Math.hypot(third.x - second.x, third.y - second.y);
    const samples = Math.max(1, Math.ceil(distance / profile.sampleSpacing));
    for (let sample = 0; sample < samples; sample += 1) {
      const amount = sample / samples;
      points.push(main.polyline ? linearPoint(second, third, amount) : catmullRomPoint(first, second, third, fourth, amount));
    }
  }
  points.push(main.controls[main.controls.length - 1]);
  return Object.freeze({
    featureKey: main.key,
    familyIndex: main.familyIndex,
    ownerCellX: main.ownerCellX,
    ownerCellY: main.ownerCellY,
    ownerSlot: main.ownerSlot,
    pathIndex: 0,
    branch: false,
    kind: main.polyline ? "polyline" : "curve",
    points: Object.freeze(points)
  });
}
function cubicPoint(points, amount) {
  const inverse = 1 - amount;
  const first = inverse ** 3;
  const second = 3 * inverse ** 2 * amount;
  const third = 3 * inverse * amount ** 2;
  const fourth = amount ** 3;
  return {
    x: points[0].x * first + points[1].x * second + points[2].x * third + points[3].x * fourth,
    y: points[0].y * first + points[1].y * second + points[2].y * third + points[3].y * fourth,
    width: points[0].width * first + points[1].width * second + points[2].width * third + points[3].width * fourth
  };
}
function buildBranch(seed, profile, main, branchIndex) {
  const controls = main.controls;
  const joinIndex = Math.min(
    controls.length - 2,
    2 + Math.floor(random(seed, main.key, branchIndex, 503) * Math.max(1, controls.length - 4))
  );
  const join = controls[joinIndex];
  const previous = controls[joinIndex - 1];
  const next = controls[joinIndex + 1];
  const tangentLength = Math.hypot(next.x - previous.x, next.y - previous.y) || 1;
  const tangent = {
    x: (next.x - previous.x) / tangentLength,
    y: (next.y - previous.y) / tangentLength
  };
  const normal = { x: -tangent.y, y: tangent.x };
  const side = random(seed, main.key, branchIndex, 509) < 0.5 ? -1 : 1;
  const length = profile.minimumBranchLength + random(seed, main.key, branchIndex, 521) * (profile.maximumBranchLength - profile.minimumBranchLength);
  const upstream = length * (0.34 + random(seed, main.key, branchIndex, 523) * 0.28);
  const lateral = length * (0.48 + random(seed, main.key, branchIndex, 541) * 0.38) * side;
  const sourceWidth = Math.max(
    main.family.minimumWidth,
    main.family.minimumWidth * (0.9 + random(seed, main.key, branchIndex, 547) * 0.5)
  );
  const targetWidth = Math.max(
    main.family.minimumWidth,
    Math.min(main.family.maximumWidth * 0.62, join.width * 0.62)
  );
  const source = {
    x: join.x - tangent.x * upstream + normal.x * lateral,
    y: join.y - tangent.y * upstream + normal.y * lateral,
    width: sourceWidth
  };
  const branchControls = [
    source,
    {
      x: source.x + tangent.x * length * 0.23 - normal.x * lateral * 0.12,
      y: source.y + tangent.y * length * 0.23 - normal.y * lateral * 0.12,
      width: sourceWidth + (targetWidth - sourceWidth) * 0.33
    },
    {
      x: join.x - tangent.x * length * 0.22,
      y: join.y - tangent.y * length * 0.22,
      width: sourceWidth + (targetWidth - sourceWidth) * 0.75
    },
    { x: join.x, y: join.y, width: targetWidth }
  ];
  const samples = Math.max(2, Math.ceil(length / profile.sampleSpacing));
  const points = [];
  for (let index = 0; index <= samples; index += 1) {
    points.push(cubicPoint(branchControls, index / samples));
  }
  return Object.freeze({
    featureKey: main.key,
    familyIndex: main.familyIndex,
    ownerCellX: main.ownerCellX,
    ownerCellY: main.ownerCellY,
    ownerSlot: main.ownerSlot,
    pathIndex: branchIndex + 1,
    branch: true,
    kind: "branch",
    points: Object.freeze(points)
  });
}
function intersects(points, bounds, margin) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  return maxX >= bounds.minX - margin && minX <= bounds.maxX + margin && maxY >= bounds.minY - margin && minY <= bounds.maxY + margin;
}
function scaledFamily(family, scale) {
  return Object.freeze({
    cellSize: family.cellSize * scale,
    slots: family.slots,
    spawnScale: family.spawnScale,
    minimumLength: family.minimumLength * scale,
    maximumLength: family.maximumLength * scale,
    minimumWidth: family.minimumWidth * scale,
    maximumWidth: family.maximumWidth * scale,
    minimumControlStep: family.minimumControlStep * scale,
    maximumControlStep: family.maximumControlStep * scale,
    maximumBranches: family.maximumBranches
  });
}
function scaledBasins(profile, scale) {
  return Object.freeze({
    density: profile.density,
    candidateCellSize: profile.candidateCellSize * scale,
    minimumSeparation: profile.minimumSeparation * scale,
    minimumMajorRadius: profile.minimumMajorRadius * scale,
    maximumMajorRadius: profile.maximumMajorRadius * scale,
    minimumMinorRatio: profile.minimumMinorRatio,
    maximumMinorRatio: profile.maximumMinorRatio
  });
}
function scaleInfiniteWaterCurveProfile(profile, scale) {
  assertInfiniteWaterCurveProfile(profile);
  positive("water curve spatial scale", scale);
  return Object.freeze({
    density: profile.density,
    curvature: profile.curvature,
    polylineChance: profile.polylineChance,
    sampleSpacing: profile.sampleSpacing * scale,
    minimumBranchLength: profile.minimumBranchLength * scale,
    maximumBranchLength: profile.maximumBranchLength * scale,
    broadDensityScale: profile.broadDensityScale * scale,
    regionalDensityScale: profile.regionalDensityScale * scale,
    families: Object.freeze(profile.families.map((family) => scaledFamily(family, scale))),
    basins: scaledBasins(profile.basins, scale)
  });
}
var DeterministicInfiniteWaterCurveField = class {
  constructor(numericSeed, profile) {
    this.numericSeed = numericSeed;
    this.profile = profile;
    this.maximumReach = profile.families.reduce((maximum, family) => Math.max(
      maximum,
      family.maximumLength / 2 + family.maximumControlStep * 2 + profile.maximumBranchLength
    ), 0);
    this.maximumWidth = profile.families.reduce(
      (maximum, family) => Math.max(maximum, family.maximumWidth),
      0
    );
    this.maximumBasinReach = profile.basins.maximumMajorRadius * BASIN_MAXIMUM_BOUNDARY_SCALE;
  }
  forEachPathIntersecting(bounds, visit) {
    assertBounds(bounds);
    if (typeof visit !== "function") throw new TypeError("water curve visitor must be a function");
    this.forEachCandidate(bounds, true, visit);
  }
  forEachPathOwnedBy(bounds, visit) {
    assertBounds(bounds);
    if (typeof visit !== "function") throw new TypeError("water curve visitor must be a function");
    this.forEachCandidate(bounds, false, visit);
  }
  forEachBasinIntersecting(bounds, visit) {
    assertBounds(bounds);
    if (typeof visit !== "function") throw new TypeError("water basin visitor must be a function");
    this.forEachBasinCandidate(bounds, true, visit);
  }
  forEachBasinOwnedBy(bounds, visit) {
    assertBounds(bounds);
    if (typeof visit !== "function") throw new TypeError("water basin visitor must be a function");
    this.forEachBasinCandidate(bounds, false, visit);
  }
  forEachCandidate(bounds, intersecting, visit) {
    for (let familyIndex = 0; familyIndex < this.profile.families.length; familyIndex += 1) {
      const family = this.profile.families[familyIndex];
      const reach = intersecting ? family.maximumLength / 2 + family.maximumControlStep * 2 + this.profile.maximumBranchLength : 0;
      const firstCellX = Math.floor((bounds.minX - reach) / family.cellSize);
      const lastCellX = intersecting ? Math.floor((bounds.maxX + reach) / family.cellSize) : Math.ceil(bounds.maxX / family.cellSize) - 1;
      const firstCellY = Math.floor((bounds.minY - reach) / family.cellSize);
      const lastCellY = intersecting ? Math.floor((bounds.maxY + reach) / family.cellSize) : Math.ceil(bounds.maxY / family.cellSize) - 1;
      for (let cellX = firstCellX; cellX <= lastCellX; cellX += 1) {
        for (let cellY = firstCellY; cellY <= lastCellY; cellY += 1) {
          for (let slot = 0; slot < family.slots; slot += 1) {
            const main = buildMainCurve(
              this.numericSeed,
              this.profile,
              familyIndex,
              cellX,
              cellY,
              slot
            );
            if (!main) continue;
            if (intersecting && !intersects(
              main.controls,
              bounds,
              this.profile.maximumBranchLength + family.maximumControlStep
            )) continue;
            const sampledMain = sampleMain(this.profile, main);
            if (!intersecting || intersects(sampledMain.points, bounds, this.profile.sampleSpacing * 2)) {
              visit(sampledMain);
            }
            const branchCount = Math.floor(
              randomForFeature(this.numericSeed, main.key, 557) * (family.maximumBranches + 1)
            );
            for (let branchIndex = 0; branchIndex < branchCount; branchIndex += 1) {
              const branch = buildBranch(this.numericSeed, this.profile, main, branchIndex);
              if (!intersecting || intersects(branch.points, bounds, this.profile.sampleSpacing * 2)) {
                visit(branch);
              }
            }
          }
        }
      }
    }
  }
  forEachBasinCandidate(bounds, intersecting, visit) {
    const profile = this.profile.basins;
    if (profile.density === 0) return;
    const reach = intersecting ? this.maximumBasinReach : 0;
    const firstCellX = Math.floor((bounds.minX - reach) / profile.candidateCellSize);
    const lastCellX = intersecting ? Math.floor((bounds.maxX + reach) / profile.candidateCellSize) : Math.ceil(bounds.maxX / profile.candidateCellSize) - 1;
    const firstCellY = Math.floor((bounds.minY - reach) / profile.candidateCellSize);
    const lastCellY = intersecting ? Math.floor((bounds.maxY + reach) / profile.candidateCellSize) : Math.ceil(bounds.maxY / profile.candidateCellSize) - 1;
    const candidates = /* @__PURE__ */ new Map();
    const candidateAt = (cellX, cellY) => {
      const key = `${cellX},${cellY}`;
      if (!candidates.has(key)) {
        candidates.set(key, buildBasinCandidate(this.numericSeed, profile, cellX, cellY));
      }
      return candidates.get(key);
    };
    for (let cellX = firstCellX; cellX <= lastCellX; cellX += 1) {
      for (let cellY = firstCellY; cellY <= lastCellY; cellY += 1) {
        const basin = buildBasin(this.numericSeed, profile, cellX, cellY, candidateAt);
        if (basin && (!intersecting || basinIntersects(basin, bounds))) visit(basin);
      }
    }
  }
};
function createInfiniteWaterCurveFieldFromUint32(numericSeed, profile = INFINITE_WATER_CURVE_REFERENCE_PROFILE) {
  if (!Number.isInteger(numericSeed) || numericSeed < 0 || numericSeed > 4294967295) {
    throw new RangeError("water curve numeric seed must be an unsigned 32-bit integer");
  }
  assertInfiniteWaterCurveProfile(profile);
  return new DeterministicInfiniteWaterCurveField(numericSeed, profile);
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
    temperatureLatitudeNoiseWeight: 0.18
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
  rivers: Object.freeze({
    pageSize: 32,
    maximumCachedPages: 16,
    toroidalReferenceSize: 512,
    curve: INFINITE_WATER_CURVE_REFERENCE_PROFILE
  })
});
var finite2 = (name, value) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number`);
  }
  return value;
};
var positive2 = (name, value) => {
  const number = finite2(name, value);
  if (number <= 0) throw new RangeError(`${name} must be positive`);
  return number;
};
var nonNegative = (name, value) => {
  const number = finite2(name, value);
  if (number < 0) throw new RangeError(`${name} must be non-negative`);
  return number;
};
var unitInterval2 = (name, value) => {
  const number = finite2(name, value);
  if (number < 0 || number > 1) throw new RangeError(`${name} must be between 0 and 1`);
  return number;
};
function assertFiniteNumbers(value, path) {
  for (const [name, candidate] of Object.entries(value)) {
    const key = path ? `${path}.${name}` : name;
    if (typeof candidate === "number") finite2(key, candidate);
    else if (candidate && typeof candidate === "object") assertFiniteNumbers(candidate, key);
  }
}
function assertWorldStyleProfile(value) {
  if (!value || typeof value !== "object") throw new TypeError("world style profile must be an object");
  const profile = value;
  if (profile.generatorVersion !== WORLD_GENERATOR_VERSION) {
    throw new RangeError("world style profile generatorVersion is unsupported");
  }
  if (!profile.fields || !profile.terrain || !profile.relief || !profile.vegetation || !profile.rivers) {
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
    "forestPatch"
  ];
  for (const name of noiseFieldNames) {
    const candidate = profile.fields[name];
    if (!candidate || typeof candidate !== "object") {
      throw new TypeError(`fields.${name} must be a noise field profile`);
    }
    const noise = candidate;
    positive2(`fields.${name}.openScale`, noise.openScale);
    positive2(`fields.${name}.toroidalScale`, noise.toroidalScale);
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
    "temperatureLatitudeNoiseWeight"
  ];
  for (const name of nonNegativeFieldNames) nonNegative(`fields.${name}`, profile.fields[name]);
  finite2("fields.elevationBias", profile.fields.elevationBias);
  unitInterval2("fields.landMaskStart", profile.fields.landMaskStart);
  unitInterval2("fields.landMaskEnd", profile.fields.landMaskEnd);
  unitInterval2("fields.valleyMaskStart", profile.fields.valleyMaskStart);
  unitInterval2("fields.valleyMaskEnd", profile.fields.valleyMaskEnd);
  if (!(profile.fields.landMaskStart < profile.fields.landMaskEnd) || !(profile.fields.valleyMaskStart < profile.fields.valleyMaskEnd)) {
    throw new RangeError("world style field mask thresholds must be ordered");
  }
  positive2("fields.ridgeExponent", profile.fields.ridgeExponent);
  positive2("fields.valleyExponent", profile.fields.valleyExponent);
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
  for (const name of terrainNames) unitInterval2(`terrain.${name}`, terrain[name]);
  positive2("terrain.climateTransition", terrain.climateTransition);
  if (!(finite2("terrain.mountainElevation", terrain.mountainElevation) < finite2("terrain.mountainPeakElevation", terrain.mountainPeakElevation))) {
    throw new RangeError("terrain mountain thresholds must be ordered");
  }
  if (!(finite2("terrain.snowTemperature", terrain.snowTemperature) < finite2("terrain.tundraTemperature", terrain.tundraTemperature))) {
    throw new RangeError("terrain temperature thresholds must be ordered");
  }
  const relief = profile.relief;
  for (const [name, candidate] of Object.entries(relief)) {
    if (finite2(`relief.${name}`, candidate) < 0) {
      throw new RangeError("relief heights and scales must be non-negative");
    }
  }
  positive2("relief.mountainElevationSpan", relief.mountainElevationSpan);
  positive2("relief.mountainPower", relief.mountainPower);
  positive2("relief.mountainScale", relief.mountainScale);
  unitInterval2("relief.mountainElevationStart", relief.mountainElevationStart);
  unitInterval2("relief.hillElevationStart", relief.hillElevationStart);
  unitInterval2("relief.hillElevationEnd", relief.hillElevationEnd);
  if (!(relief.hillElevationStart < relief.hillElevationEnd) || !(relief.plainMinimum <= relief.plainMaximum) || !(relief.hillMinimum <= relief.hillMaximum) || !(relief.plainMaximum < relief.hillMinimum)) {
    throw new RangeError("relief plain and hill ranges must be ordered");
  }
  if (finite2("relief.mountainMinimum", relief.mountainMinimum) > finite2("relief.mountainMaximum", relief.mountainMaximum)) {
    throw new RangeError("relief mountain range must be ordered");
  }
  if (relief.staticHill < relief.hillMinimum || relief.staticHill > relief.hillMaximum || relief.staticMountain < relief.mountainMinimum || relief.staticMountain > relief.mountainMaximum) {
    throw new RangeError("static relief heights must stay inside their terrain ranges");
  }
  unitInterval2("vegetation.moistureStart", profile.vegetation.moistureStart);
  unitInterval2("vegetation.moistureFull", profile.vegetation.moistureFull);
  unitInterval2("vegetation.maximumDensity", profile.vegetation.maximumDensity);
  unitInterval2("vegetation.neutralDensity", profile.vegetation.neutralDensity);
  unitInterval2("vegetation.temperatureMinimum", profile.vegetation.temperatureMinimum);
  unitInterval2("vegetation.temperatureMaximum", profile.vegetation.temperatureMaximum);
  unitInterval2("vegetation.temperatureTransition", profile.vegetation.temperatureTransition);
  positive2("vegetation.temperatureTransition", profile.vegetation.temperatureTransition);
  unitInterval2("vegetation.patchStart", profile.vegetation.patchStart);
  unitInterval2("vegetation.patchFull", profile.vegetation.patchFull);
  unitInterval2("vegetation.patchMinimum", profile.vegetation.patchMinimum);
  unitInterval2("vegetation.ridgePenalty", profile.vegetation.ridgePenalty);
  unitInterval2("vegetation.roughnessPenalty", profile.vegetation.roughnessPenalty);
  unitInterval2("vegetation.placementThreshold", profile.vegetation.placementThreshold);
  unitInterval2("vegetation.placementJitter", profile.vegetation.placementJitter);
  unitInterval2("vegetation.palmTemperature", profile.vegetation.palmTemperature);
  unitInterval2("vegetation.piniaTemperature", profile.vegetation.piniaTemperature);
  positive2("vegetation.densityScale", profile.vegetation.densityScale);
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
  if (!Number.isSafeInteger(profile.vegetation.placementSalt)) {
    throw new RangeError("world style vegetation placement salt must be a safe integer");
  }
  const rivers = profile.rivers;
  for (const name of ["pageSize", "maximumCachedPages", "toroidalReferenceSize"]) {
    if (!Number.isInteger(rivers[name]) || rivers[name] <= 0) {
      throw new RangeError(`rivers.${name} must be a positive integer`);
    }
  }
  assertInfiniteWaterCurveProfile(rivers.curve);
}
assertWorldStyleProfile(WORLD_STYLE_PROFILE);

// src/world/LandformSampler.ts
var LANDFORM_SEA_LEVEL = WORLD_STYLE_PROFILE.terrain.seaLevel;
var clamp01 = (value) => Math.max(0, Math.min(1, value));
var smoothstep2 = (edge0, edge1, value) => {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};
function assertDimension(name, value) {
  if (!Number.isInteger(value) || value < 2) {
    throw new RangeError(`landform ${name} must be an integer >= 2`);
  }
}
function resolveDomain(domain) {
  const resolved = domain ?? { topology: "infinite" };
  if (resolved.topology !== "infinite") {
    assertDimension("width", resolved.width);
    assertDimension("height", resolved.height);
  }
  return { ...resolved };
}
function composeSample(continent, detail, ridgeNoise, valleyNoise, roughness, moistureNoise, temperatureNoise, forestPatch, latitude, profile) {
  const fields = profile.fields;
  const landMask = smoothstep2(fields.landMaskStart, fields.landMaskEnd, continent);
  const ridge = Math.pow(1 - Math.abs(ridgeNoise * 2 - 1), fields.ridgeExponent) * landMask;
  const valley = Math.pow(1 - Math.abs(valleyNoise * 2 - 1), fields.valleyExponent) * smoothstep2(fields.valleyMaskStart, fields.valleyMaskEnd, continent);
  const elevation = continent * fields.continentWeight + detail * fields.detailWeight + ridge * fields.ridgeWeight - valley * fields.valleyWeight + fields.elevationBias;
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
    forestPatch: clamp01(forestPatch)
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
      void 0,
      profile
    );
  }
  const ny = y / (domain.height - 1) * 2 - 1;
  return composeSample(
    continent,
    detail,
    ridgeNoise,
    valleyNoise,
    rough,
    moisture,
    temperature,
    forestPatch,
    Math.abs(ny),
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
    latitude,
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

// src/world/WorldWaterSampler.ts
var SQRT_THREE = Math.sqrt(3);
var HEX_APOTHEM = SQRT_THREE / 2;
var positiveModulo3 = (value, period) => (value % period + period) % period;
function assertWaterExtent(originX, originY, width, height) {
  if (!Number.isSafeInteger(originX) || !Number.isSafeInteger(originY)) {
    throw new RangeError("water extent origins must be safe integers");
  }
  if (!Number.isSafeInteger(width) || width <= 0 || !Number.isSafeInteger(height) || height <= 0) {
    throw new RangeError("water extent dimensions must be positive safe integers");
  }
  if (!Number.isSafeInteger(originX + width - 1) || !Number.isSafeInteger(originY + height - 1)) {
    throw new RangeError("water extent exceeds safe integer coordinates");
  }
  if (!Number.isSafeInteger(width * height)) {
    throw new RangeError("water extent area exceeds safe integer indexing");
  }
}
function roundCube(q, r, s) {
  let roundedQ = Math.round(q);
  let roundedR = Math.round(r);
  let roundedS = Math.round(s);
  const qDifference = Math.abs(roundedQ - q);
  const rDifference = Math.abs(roundedR - r);
  const sDifference = Math.abs(roundedS - s);
  if (qDifference > rDifference && qDifference > sDifference) roundedQ = -roundedR - roundedS;
  else if (rDifference > sDifference) roundedR = -roundedQ - roundedS;
  else roundedS = -roundedQ - roundedR;
  return { q: roundedQ, r: roundedR, s: roundedS };
}
function cubeToOffset(point) {
  return { x: point.q, y: point.r + Math.ceil(point.q / 2) };
}
function offsetToCube(point) {
  const q = point.x;
  const r = point.y - Math.ceil(point.x / 2);
  return { q, r, s: -q - r };
}
function worldPointToHex(point) {
  const q = point.x * (2 / 3);
  const r = -point.x / 3 + point.y / SQRT_THREE - 0.5;
  return cubeToOffset(roundCube(q, r, -q - r));
}
function hexCenter(point) {
  return {
    x: point.x * 1.5,
    y: point.y * SQRT_THREE + (point.x % 2 === 0 ? SQRT_THREE / 2 : 0)
  };
}
function hexLine(from, to) {
  const start = offsetToCube(from);
  const end = offsetToCube(to);
  const distance = Math.max(
    Math.abs(end.q - start.q),
    Math.abs(end.r - start.r),
    Math.abs(end.s - start.s)
  );
  if (distance === 0) return [from];
  const result = [];
  for (let index = 0; index <= distance; index += 1) {
    const amount = index / distance;
    const rounded = roundCube(
      start.q + (end.q - start.q) * amount,
      start.r + (end.r - start.r) * amount,
      start.s + (end.s - start.s) * amount
    );
    const point = cubeToOffset(rounded);
    const previous = result[result.length - 1];
    if (!previous || previous.x !== point.x || previous.y !== point.y) result.push(point);
  }
  return result;
}
function tileExtentToWorldBounds(originX, originY, width, height, margin) {
  return {
    minX: originX * 1.5 - 1 - margin,
    maxX: (originX + width - 1) * 1.5 + 1 + margin,
    minY: originY * SQRT_THREE - 1 - margin,
    maxY: (originY + height) * SQRT_THREE + 1 + margin
  };
}
function isCenterInsideRibbon(center, first, second) {
  const segmentX = second.x - first.x;
  const segmentY = second.y - first.y;
  const lengthSquared = segmentX * segmentX + segmentY * segmentY;
  const amount = lengthSquared === 0 ? 0 : Math.max(0, Math.min(
    1,
    ((center.x - first.x) * segmentX + (center.y - first.y) * segmentY) / lengthSquared
  ));
  const nearestX = first.x + segmentX * amount;
  const nearestY = first.y + segmentY * amount;
  const width = first.width + (second.width - first.width) * amount;
  return Math.hypot(center.x - nearestX, center.y - nearestY) <= width + HEX_APOTHEM;
}
var DeterministicWorldWaterSampler = class {
  constructor(numericSeed, domain, profile) {
    this.domain = domain;
    this.profile = profile;
    this.pages = /* @__PURE__ */ new Map();
    if (domain.topology === "toroidal") {
      const scale = Math.min(
        1,
        Math.max(domain.width, domain.height) / profile.rivers.toroidalReferenceSize
      );
      this.toroidalWaterField = createInfiniteWaterCurveFieldFromUint32(
        numericSeed,
        scaleInfiniteWaterCurveProfile(profile.rivers.curve, scale)
      );
    } else {
      this.waterField = createInfiniteWaterCurveFieldFromUint32(numericSeed, profile.rivers.curve);
    }
  }
  isWaterTile(x, y) {
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) {
      throw new RangeError("water coordinates must be safe integers");
    }
    if (this.domain.topology === "toroidal") {
      const canonicalX = positiveModulo3(x, this.domain.width);
      const canonicalY = positiveModulo3(y, this.domain.height);
      const mask = this.toroidalMask ?? (this.toroidalMask = this.buildToroidalMask());
      return mask[canonicalX * this.domain.height + canonicalY] !== 0;
    }
    if (this.domain.topology === "bounded" && (x < 0 || x >= this.domain.width || y < 0 || y >= this.domain.height)) return false;
    const pageSize = this.profile.rivers.pageSize;
    const pageX = Math.floor(x / pageSize);
    const pageY = Math.floor(y / pageSize);
    const key = `${pageX},${pageY}`;
    let page = this.pages.get(key);
    if (page) {
      this.pages.delete(key);
      this.pages.set(key, page);
    } else {
      page = this.buildPage(pageX, pageY);
      this.pages.set(key, page);
      while (this.pages.size > this.profile.rivers.maximumCachedPages) {
        const oldest = this.pages.keys().next().value;
        if (oldest === void 0) break;
        this.pages.delete(oldest);
      }
    }
    const localX = x - pageX * pageSize;
    const localY = y - pageY * pageSize;
    return page.water[localX * pageSize + localY] !== 0;
  }
  forEachWaterTile(originX, originY, width, height, visit) {
    assertWaterExtent(originX, originY, width, height);
    if (typeof visit !== "function") throw new TypeError("water tile visitor must be a function");
    const endX = originX + width;
    const endY = originY + height;
    if (this.domain.topology === "toroidal") {
      const mask = this.toroidalMask ?? (this.toroidalMask = this.buildToroidalMask());
      for (let x = originX; x < endX; x += 1) {
        const canonicalX = positiveModulo3(x, this.domain.width);
        for (let y = originY; y < endY; y += 1) {
          const canonicalY = positiveModulo3(y, this.domain.height);
          if (mask[canonicalX * this.domain.height + canonicalY] !== 0) visit(x, y);
        }
      }
      return;
    }
    const visited = /* @__PURE__ */ new Set();
    this.visitOpenFieldTiles(originX, originY, width, height, (point) => {
      if (point.x < originX || point.x >= endX || point.y < originY || point.y >= endY) return;
      visited.add((point.x - originX) * height + point.y - originY);
    });
    for (const index of visited) {
      visit(originX + Math.floor(index / height), originY + index % height);
    }
  }
  get stats() {
    const mask = this.toroidalMask;
    let toroidalWaterTiles = 0;
    if (mask) for (const value of mask) toroidalWaterTiles += value !== 0 ? 1 : 0;
    return Object.freeze({
      cachedPages: this.pages.size,
      maximumCachedPages: this.profile.rivers.maximumCachedPages,
      toroidalMaskReady: mask !== void 0,
      toroidalWaterTiles
    });
  }
  clear() {
    this.pages.clear();
    this.toroidalMask = void 0;
  }
  normalizePoint(point) {
    if (this.domain.topology === "infinite") return point;
    if (this.domain.topology === "toroidal") {
      return {
        x: positiveModulo3(point.x, this.domain.width),
        y: positiveModulo3(point.y, this.domain.height)
      };
    }
    return point.x >= 0 && point.x < this.domain.width && point.y >= 0 && point.y < this.domain.height ? point : void 0;
  }
  openWaterField() {
    if (!this.waterField) throw new Error("open water field is unavailable for a toroidal domain");
    return this.waterField;
  }
  visitPathTiles(path, visit) {
    if (path.points.length < 2) return;
    for (let index = 1; index < path.points.length; index += 1) {
      const first = path.points[index - 1];
      const second = path.points[index];
      const centerline = hexLine(worldPointToHex(first), worldPointToHex(second));
      const radius = Math.ceil((Math.max(first.width, second.width) + 1) / SQRT_THREE);
      for (const base of centerline) {
        const normalizedBase = this.normalizePoint(base);
        if (normalizedBase) visit(normalizedBase);
        for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
          for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
            if (offsetX === 0 && offsetY === 0) continue;
            const candidate = { x: base.x + offsetX, y: base.y + offsetY };
            if (!isCenterInsideRibbon(hexCenter(candidate), first, second)) continue;
            const normalized = this.normalizePoint(candidate);
            if (normalized) visit(normalized);
          }
        }
      }
    }
  }
  visitBasinTiles(basin, clip, visit) {
    const reach = basin.majorRadius * (1 + basin.waveA + basin.waveB + basin.waveC) + HEX_APOTHEM;
    let firstX = Math.floor((basin.centerX - reach) / 1.5) - 1;
    let lastX = Math.ceil((basin.centerX + reach) / 1.5) + 1;
    let firstY = Math.floor((basin.centerY - reach) / SQRT_THREE) - 2;
    let lastY = Math.ceil((basin.centerY + reach) / SQRT_THREE) + 2;
    if (clip) {
      firstX = Math.max(firstX, clip.originX);
      lastX = Math.min(lastX, clip.originX + clip.width - 1);
      firstY = Math.max(firstY, clip.originY);
      lastY = Math.min(lastY, clip.originY + clip.height - 1);
    }
    for (let x = firstX; x <= lastX; x += 1) {
      for (let y = firstY; y <= lastY; y += 1) {
        const center = hexCenter({ x, y });
        if (!isPointInsideWaterBasin(center.x, center.y, basin, HEX_APOTHEM)) continue;
        const normalized = this.normalizePoint({ x, y });
        if (normalized) visit(normalized);
      }
    }
  }
  visitOpenFieldTiles(originX, originY, width, height, visit) {
    const field2 = this.openWaterField();
    field2.forEachPathIntersecting(
      tileExtentToWorldBounds(originX, originY, width, height, field2.maximumWidth),
      (path) => this.visitPathTiles(path, visit)
    );
    const clip = { originX, originY, width, height };
    field2.forEachBasinIntersecting(
      tileExtentToWorldBounds(originX, originY, width, height, HEX_APOTHEM),
      (basin) => this.visitBasinTiles(basin, clip, visit)
    );
  }
  buildPage(pageX, pageY) {
    const pageSize = this.profile.rivers.pageSize;
    const minX = pageX * pageSize;
    const minY = pageY * pageSize;
    const water = new Uint8Array(pageSize * pageSize);
    this.visitOpenFieldTiles(minX, minY, pageSize, pageSize, (point) => {
      const localX = point.x - minX;
      const localY = point.y - minY;
      if (localX < 0 || localX >= pageSize || localY < 0 || localY >= pageSize) return;
      water[localX * pageSize + localY] = 1;
    });
    return { water };
  }
  buildToroidalMask() {
    if (this.domain.topology !== "toroidal" || !this.toroidalWaterField) {
      throw new Error("toroidal water mask requires a toroidal domain");
    }
    const domain = this.domain;
    const mask = new Uint8Array(domain.width * domain.height);
    this.toroidalWaterField.forEachPathOwnedBy({
      minX: 0,
      maxX: domain.width * 1.5,
      minY: 0,
      maxY: domain.height * SQRT_THREE
    }, (path) => this.visitPathTiles(path, (point) => {
      mask[point.x * domain.height + point.y] = 1;
    }));
    this.toroidalWaterField.forEachBasinOwnedBy({
      minX: 0,
      maxX: domain.width * 1.5,
      minY: 0,
      maxY: domain.height * SQRT_THREE
    }, (basin) => this.visitBasinTiles(basin, void 0, (point) => {
      mask[point.x * domain.height + point.y] = 1;
    }));
    return mask;
  }
};
function createWorldWaterSampler(numericSeed, domain, profile) {
  return new DeterministicWorldWaterSampler(numericSeed, domain, profile);
}

// src/world/WorldSurfaceResolver.ts
var isWater = (type) => type === "sea" /* sea */ || type === "coastal" /* coastal */;
var clamp012 = (value) => Math.max(0, Math.min(1, value));
var smoothstep3 = (edge0, edge1, value) => {
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
  if (sample.elevation > terrain.mountainElevation && sample.ridge > terrain.mountainRidge || sample.elevation > terrain.mountainPeakElevation) return "mountain" /* mountain */;
  const snowColdness = terrain.snowTemperature > 0 ? clamp012((terrain.snowTemperature - sample.temperature) / terrain.snowTemperature) : 0;
  const minimumSnowElevation = terrain.seaLevel + (terrain.hillElevation - terrain.seaLevel) * 0.45;
  const snowElevation = terrain.hillElevation - (terrain.hillElevation - minimumSnowElevation) * snowColdness;
  if (sample.temperature < terrain.snowTemperature && sample.elevation > snowElevation) return "snow" /* snow */;
  if (sample.temperature < terrain.tundraTemperature) return "tundra" /* tundra */;
  if (sample.temperature > terrain.sandTemperature && sample.moisture < terrain.sandMoisture) return "sand" /* sand */;
  return "land" /* land */;
}
function generatedRelief(sample, profile) {
  const relief = profile.relief;
  const landElevation = Math.max(0, sample.elevation - profile.terrain.seaLevel);
  const plain = relief.plainMinimum + landElevation * relief.plainElevationScale + sample.roughness * relief.plainRoughnessScale - sample.valley * relief.valleyDepth;
  const hill = smoothstep3(relief.hillElevationStart, relief.hillElevationEnd, sample.elevation) * relief.hillScale;
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
  const terrain = profile.terrain;
  const transition = terrain.climateTransition;
  const cold = 1 - smoothstep3(
    terrain.snowTemperature - transition,
    terrain.tundraTemperature + transition,
    sample.temperature
  );
  const dry = smoothstep3(
    terrain.sandTemperature - transition,
    terrain.sandTemperature + transition,
    sample.temperature
  ) * (1 - smoothstep3(
    terrain.sandMoisture - transition,
    terrain.sandMoisture + transition,
    sample.moisture
  ));
  const alpine = clamp012(Math.max(
    type === "mountain" /* mountain */ ? 0.7 : 0,
    smoothstep3(
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
function biomeFor(weights) {
  const weighted = [
    ["temperate", weights.temperate],
    ["dry", weights.dry],
    ["cold", weights.cold],
    ["alpine", weights.alpine]
  ];
  return weighted.reduce((best, candidate) => candidate[1] > best[1] ? candidate : best)[0];
}
function vegetationDensityFor(type, sample, profile) {
  if (type === "mountain" /* mountain */ || type === "snow" /* snow */) return 0;
  const vegetation = profile.vegetation;
  const moisture = smoothstep3(vegetation.moistureStart, vegetation.moistureFull, sample.moisture);
  const cold = smoothstep3(
    vegetation.temperatureMinimum - vegetation.temperatureTransition,
    vegetation.temperatureMinimum + vegetation.temperatureTransition,
    sample.temperature
  );
  const heat = 1 - smoothstep3(
    vegetation.temperatureMaximum - vegetation.temperatureTransition,
    vegetation.temperatureMaximum + vegetation.temperatureTransition,
    sample.temperature
  );
  const patch = vegetation.patchMinimum + (1 - vegetation.patchMinimum) * smoothstep3(vegetation.patchStart, vegetation.patchFull, sample.forestPatch);
  const slope = clamp012(1 - sample.ridge * vegetation.ridgePenalty - sample.roughness * vegetation.roughnessPenalty);
  return Math.min(
    vegetation.maximumDensity,
    moisture * cold * heat * patch * slope * vegetation.densityScale
  );
}
function vegetationKindFor(sample, profile) {
  return sample.temperature > profile.vegetation.palmTemperature ? "palm" : sample.temperature < profile.vegetation.piniaTemperature ? "pinia" : "oak";
}
function sampleSurface(sampler, profile, x, y) {
  const landform = Object.freeze({ ...sampler.sample(x, y) });
  const baseTerrain = classifyTerrain(landform, profile);
  const biomeWeights = biomeWeightsFor(baseTerrain, landform, profile);
  const biome = biomeFor(biomeWeights);
  const vegetationDensity = vegetationDensityFor(baseTerrain, landform, profile);
  return Object.freeze({
    baseTerrain,
    relief: generatedRelief(landform, profile),
    biome,
    biomeWeights,
    vegetationDensity,
    vegetationKind: vegetationDensity > 0 ? vegetationKindFor(landform, profile) : void 0,
    landform
  });
}
function resolveTile(numericSeed, profile, x, y, sampleAt, waterAt) {
  const sample = sampleAt(x, y);
  if (!sample) throw new RangeError("world surface coordinate is outside the generated domain");
  let type = sample.baseTerrain;
  if (waterAt(x, y)) {
    const touchesLand = getNeighbors(x, y).some((neighbor) => {
      const adjacent = sampleAt(neighbor.x, neighbor.y);
      return adjacent !== void 0 && !waterAt(neighbor.x, neighbor.y);
    });
    type = touchesLand ? "coastal" /* coastal */ : "sea" /* sea */;
  }
  const tile = { type };
  if (isWater(type) || type === "mountain" /* mountain */) return Object.freeze(tile);
  const modifiers = [];
  if (type === "snow" /* snow */) {
    modifiers.push("hill");
    tile.modifiers = modifiers;
    Object.freeze(modifiers);
    return Object.freeze(tile);
  }
  if (sample.landform.elevation > profile.terrain.hillElevation) modifiers.push("hill");
  const forest = sample.vegetationDensity + (randomAt(numericSeed, x, y, profile.vegetation.placementSalt) - 0.5) * profile.vegetation.placementJitter >= profile.vegetation.placementThreshold;
  if (forest) {
    modifiers.push("wood");
    tile.treeModel = `Assets/models/${sample.vegetationKind ?? "oak"}`;
  }
  if (modifiers.length > 0) {
    tile.modifiers = modifiers;
    Object.freeze(modifiers);
  }
  return Object.freeze(tile);
}
var FrozenWorldSurfaceResolver = class {
  constructor(options) {
    if (!options || typeof options !== "object") throw new TypeError("world surface resolver options are required");
    this.seed = String(options.seed);
    this.profile = options.profile ?? WORLD_STYLE_PROFILE;
    this.sampler = createLandformSamplerForProfile({ seed: options.seed, domain: options.domain }, this.profile);
    this.domain = Object.freeze({ ...this.sampler.domain });
    this.waterSampler = createWorldWaterSampler(this.sampler.numericSeed, this.domain, this.profile);
  }
  sampleGenerated(x, y) {
    const point = normalizeCoordinates(this.domain, x, y);
    if (!point) throw new RangeError("world surface coordinate is outside the generated domain");
    return sampleSurface(this.sampler, this.profile, point.x, point.y);
  }
  resolveGeneratedTile(x, y) {
    const point = normalizeCoordinates(this.domain, x, y);
    if (!point) throw new RangeError("world surface coordinate is outside the generated domain");
    return resolveTile(
      this.sampler.numericSeed,
      this.profile,
      point.x,
      point.y,
      (sampleX, sampleY) => {
        const normalized = normalizeCoordinates(this.domain, sampleX, sampleY);
        return normalized ? sampleSurface(this.sampler, this.profile, normalized.x, normalized.y) : void 0;
      },
      (waterX, waterY) => this.waterSampler.isWaterTile(waterX, waterY)
    );
  }
  visitGeneratedWaterTiles(originX, originY, width, height, visit) {
    if (typeof visit !== "function") throw new TypeError("generated water visitor must be a function");
    this.waterSampler.forEachWaterTile(originX, originY, width, height, visit);
  }
  createWindow() {
    return new WorldSurfaceResolverWindow(this, this.sampler.numericSeed, this.waterSampler);
  }
};
var WorldSurfaceResolverWindow = class {
  constructor(resolver, numericSeed, waterSampler) {
    this.resolver = resolver;
    this.numericSeed = numericSeed;
    this.waterSampler = waterSampler;
    this.samples = /* @__PURE__ */ new Map();
    this.tiles = /* @__PURE__ */ new Map();
  }
  sampleGenerated(x, y) {
    const point = normalizeCoordinates(this.resolver.domain, x, y);
    if (!point) return void 0;
    const key = `${point.x},${point.y}`;
    let sample = this.samples.get(key);
    if (!sample) {
      sample = this.resolver.sampleGenerated(point.x, point.y);
      this.samples.set(key, sample);
    }
    return sample;
  }
  resolveGeneratedTile(x, y) {
    const point = normalizeCoordinates(this.resolver.domain, x, y);
    if (!point) throw new RangeError("world surface coordinate is outside the generated domain");
    const key = `${point.x},${point.y}`;
    let tile = this.tiles.get(key);
    if (!tile) {
      tile = resolveTile(
        this.numericSeed,
        this.resolver.profile,
        point.x,
        point.y,
        (sampleX, sampleY) => this.sampleGenerated(sampleX, sampleY),
        (waterX, waterY) => this.waterSampler.isWaterTile(waterX, waterY)
      );
      this.tiles.set(key, tile);
    }
    return tile;
  }
  clear() {
    this.samples.clear();
    this.tiles.clear();
  }
};
function createWorldSurfaceResolver(options) {
  return new FrozenWorldSurfaceResolver(options);
}

// src/world/generateWorldChunk.ts
var DEFAULT_WORLD_GENERATION_CHUNK_SIZE = 24;
var MAX_WORLD_GENERATION_CHUNK_SIZE = 128;
var WORLD_CHUNK_FORMAT_VERSION = 3;
var WORLD_CHUNK_PADDING = 1;
var recentChunkResolver;
function resolverMatchesOptions(resolver, options) {
  if (resolver.seed !== String(options.seed)) return false;
  if (!options.world) return resolver.domain.topology === "infinite";
  return resolver.domain.topology === "toroidal" && resolver.domain.width === options.world.width && resolver.domain.height === options.world.height;
}
function resolverForSynchronousGeneration(options) {
  if (!recentChunkResolver || !resolverMatchesOptions(recentChunkResolver, options)) {
    recentChunkResolver = createWorldChunkSurfaceResolver(options);
  }
  return recentChunkResolver;
}
function cloneWorldTileOverride(value) {
  const copy = { ...value };
  if (value.modifiers) copy.modifiers = [...value.modifiers];
  if (value.rivers) copy.rivers = value.rivers.map((river) => ({ ...river }));
  if (value.city) copy.city = { ...value.city };
  return copy;
}
function worldTileOverridesEqual(first, second) {
  if (first === second) return true;
  if (!first || !second) return !hasWorldTileOverride(first) && !hasWorldTileOverride(second);
  if (first.type !== second.type || first.treeModel !== second.treeModel || first.unit !== second.unit || first.city?.name !== second.city?.name || first.city?.model !== second.city?.model || Boolean(first.city) !== Boolean(second.city)) return false;
  const firstModifiers = first.modifiers;
  const secondModifiers = second.modifiers;
  if (firstModifiers?.length !== secondModifiers?.length || firstModifiers?.some((value, index) => value !== secondModifiers?.[index])) return false;
  const firstRivers = first.rivers;
  const secondRivers = second.rivers;
  return firstRivers?.length === secondRivers?.length && !firstRivers?.some((value, index) => value.riverIndex !== secondRivers?.[index]?.riverIndex || value.riverTileIndex !== secondRivers?.[index]?.riverTileIndex);
}
function hasWorldTileOverride(value) {
  return !!value && (value.type !== void 0 || value.modifiers !== void 0 || value.treeModel !== void 0 || value.rivers !== void 0 || value.unit !== void 0 || value.city !== void 0);
}
function assertWorldTileOverride(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("tile override must be an object");
  }
  if (value.type !== void 0 && !Object.values(Land).includes(value.type)) {
    throw new TypeError("tile override type is invalid");
  }
  if (value.modifiers !== void 0 && (!Array.isArray(value.modifiers) || value.modifiers.some((item) => typeof item !== "string"))) {
    throw new TypeError("tile override modifiers must be strings");
  }
  if (value.treeModel !== void 0 && typeof value.treeModel !== "string") {
    throw new TypeError("tile override treeModel must be a string");
  }
  if (value.unit !== void 0 && typeof value.unit !== "string") {
    throw new TypeError("tile override unit must be a string");
  }
  if (value.rivers !== void 0 && (!Array.isArray(value.rivers) || value.rivers.some((river) => !river || !Number.isSafeInteger(river.riverIndex) || !Number.isSafeInteger(river.riverTileIndex)))) {
    throw new TypeError("tile override rivers are invalid");
  }
  if (value.city !== void 0 && (!value.city || typeof value.city !== "object" || Array.isArray(value.city) || value.city.name !== void 0 && typeof value.city.name !== "string" || value.city.model !== void 0 && typeof value.city.model !== "string")) {
    throw new TypeError("tile override city is invalid");
  }
}
function assertPackedWorldChunk(chunk) {
  if (!chunk || typeof chunk !== "object" || chunk.version !== WORLD_CHUNK_FORMAT_VERSION || !Number.isSafeInteger(chunk.chunkX) || !Number.isSafeInteger(chunk.chunkY) || !Number.isInteger(chunk.chunkSize) || chunk.chunkSize <= 0 || chunk.chunkSize > MAX_WORLD_GENERATION_CHUNK_SIZE || chunk.padding !== WORLD_CHUNK_PADDING || chunk.stride !== chunk.chunkSize + chunk.padding * 2 || !(chunk.tiles instanceof Uint8Array) || chunk.tiles.length !== chunk.stride * chunk.stride) {
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
function assertChunkCoordinate(name, value) {
  if (!Number.isSafeInteger(value)) throw new RangeError(`${name} must be a safe integer`);
}
function resolveChunkSize(value = DEFAULT_WORLD_GENERATION_CHUNK_SIZE) {
  if (!Number.isInteger(value) || value <= 0 || value > MAX_WORLD_GENERATION_CHUNK_SIZE) {
    throw new RangeError(`chunkSize must be an integer between 1 and ${MAX_WORLD_GENERATION_CHUNK_SIZE}`);
  }
  return value;
}
function encodeTileInfo(tile) {
  let packed = LAND_CODE.get(tile.type) ?? 0;
  if (tile.modifiers?.includes("hill")) packed |= FLAG_HILL;
  if (tile.modifiers?.includes("wood")) packed |= FLAG_WOOD;
  if (tile.modifiers?.includes("lake")) packed |= FLAG_LAKE;
  const treeCode = TREE_MODELS.indexOf(tile.treeModel);
  if (treeCode > 0) packed |= treeCode << TREE_SHIFT;
  return packed;
}
function validateBoundedWorld(world) {
  if (!world) return;
  if (world.topology !== "toroidal" || !Number.isInteger(world.width) || world.width < 8 || !Number.isInteger(world.height) || world.height < 8 || world.width % 2 !== 0) {
    throw new RangeError("bounded chunk generation requires an even-width toroidal world of at least 8x8");
  }
}
function generateWorldChunk(options) {
  assertChunkCoordinate("chunkX", options.chunkX);
  assertChunkCoordinate("chunkY", options.chunkY);
  validateBoundedWorld(options.world);
  const chunkSize = resolveChunkSize(options.chunkSize);
  const resolver = resolverForSynchronousGeneration(options);
  return generateWorldChunkWithResolver(options, resolver, chunkSize);
}
function createWorldChunkSurfaceResolver(options) {
  if (!options || typeof options !== "object") throw new TypeError("world chunk generation options are required");
  validateBoundedWorld(options.world);
  return createWorldSurfaceResolver({
    seed: options.seed,
    domain: options.world ? { topology: "toroidal", width: options.world.width, height: options.world.height } : { topology: "infinite" }
  });
}
function generateWorldChunkWithResolver(options, resolver, resolvedChunkSize) {
  assertChunkCoordinate("chunkX", options.chunkX);
  assertChunkCoordinate("chunkY", options.chunkY);
  validateBoundedWorld(options.world);
  const chunkSize = resolvedChunkSize ?? resolveChunkSize(options.chunkSize);
  const stride = chunkSize + WORLD_CHUNK_PADDING * 2;
  const tiles = new Uint8Array(stride * stride);
  const expectedDomain = options.world ? { topology: "toroidal", width: options.world.width, height: options.world.height } : { topology: "infinite" };
  if (!resolver || resolver.seed !== String(options.seed) || resolver.domain.topology !== expectedDomain.topology || expectedDomain.topology === "toroidal" && (resolver.domain.topology !== "toroidal" || resolver.domain.width !== expectedDomain.width || resolver.domain.height !== expectedDomain.height)) {
    throw new TypeError("world surface resolver does not match the chunk request");
  }
  const window = resolver.createWindow();
  const originX = options.chunkX * chunkSize - WORLD_CHUNK_PADDING;
  const originY = options.chunkY * chunkSize - WORLD_CHUNK_PADDING;
  if (!Number.isSafeInteger(originX) || !Number.isSafeInteger(originY) || !Number.isSafeInteger(originX + stride - 1) || !Number.isSafeInteger(originY + stride - 1)) {
    throw new RangeError("chunk coordinates exceed the safe integer tile range");
  }
  for (let localX = 0; localX < stride; localX += 1) {
    for (let localY = 0; localY < stride; localY += 1) {
      const x = originX + localX;
      const y = originY + localY;
      tiles[localX * stride + localY] = encodeTileInfo(window.resolveGeneratedTile(x, y));
    }
  }
  window.clear();
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
  constructor(options = {}) {
    this.chunks = /* @__PURE__ */ new Map();
    this.decodedTiles = /* @__PURE__ */ new Map();
    this.tileOverrides = /* @__PURE__ */ new Map();
    this.overriddenTiles = /* @__PURE__ */ new Map();
    const bounded = options.width !== void 0 || options.height !== void 0;
    if (bounded) {
      if (!Number.isInteger(options.width) || options.width <= 0 || !Number.isInteger(options.height) || options.height <= 0) {
        throw new RangeError("bounded sparse stores require positive integer width and height");
      }
      this.bounds = {
        width: options.width,
        height: options.height,
        wrapX: options.wrapX ?? false,
        wrapY: options.wrapY ?? false
      };
    }
    this.map = this.bounds ? {
      data: {},
      w: this.bounds.width,
      h: this.bounds.height,
      wrapX: this.bounds.wrapX,
      wrapY: this.bounds.wrapY,
      tileAt: (x, y) => this.getTile(x, y),
      forEachTile: (visit) => this.forEachCoreTile(visit)
    } : {
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
  static tileKey(x, y) {
    return `${x},${y}`;
  }
  add(chunk) {
    assertPackedWorldChunk(chunk);
    if (this.chunkSize !== void 0 && chunk.chunkSize !== this.chunkSize) {
      throw new TypeError("all sparse world chunks must use the same chunkSize");
    }
    this.chunkSize = chunk.chunkSize;
    const key = _SparseWorldChunkStore.key(chunk.chunkX, chunk.chunkY);
    if (this.chunks.has(key)) return this.corePoints(chunk);
    this.chunks.set(key, chunk);
    return this.corePoints(chunk);
  }
  remove(chunkX, chunkY) {
    const key = _SparseWorldChunkStore.key(chunkX, chunkY);
    if (!this.chunks.has(key)) return;
    this.chunks.delete(key);
    if (this.chunks.size === 0) this.chunkSize = void 0;
  }
  hasCoreTile(x, y) {
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) || this.chunkSize === void 0) return false;
    const point = this.normalizePoint(x, y);
    if (!point) return false;
    return this.hasChunk(Math.floor(point.x / this.chunkSize), Math.floor(point.y / this.chunkSize));
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
  get tileOverrideCount() {
    return this.tileOverrides.size;
  }
  getTileOverride(x, y) {
    const value = this.tileOverrides.get(_SparseWorldChunkStore.tileKey(x, y));
    return value ? cloneWorldTileOverride(value) : void 0;
  }
  setTileOverride(x, y, changes) {
    return this.setTileOverrides([{ x, y, changes }]).length > 0;
  }
  setTileOverrides(changes) {
    if (!Array.isArray(changes)) throw new TypeError("tile override changes must be an array");
    const prepared = /* @__PURE__ */ new Map();
    for (const change of changes) {
      if (!change || typeof change !== "object") {
        throw new TypeError("tile override change must be an object");
      }
      const { x, y } = change;
      if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) {
        throw new RangeError("tile override coordinates must be safe integers");
      }
      assertWorldTileOverride(change.changes);
      const key = _SparseWorldChunkStore.tileKey(x, y);
      const previous = prepared.has(key) ? prepared.get(key).value : this.tileOverrides.get(key);
      const merged = { ...previous, ...cloneWorldTileOverride(change.changes) };
      prepared.set(key, { x, y, value: hasWorldTileOverride(merged) ? merged : void 0 });
    }
    const changed = [];
    for (const [key, next] of prepared) {
      if (worldTileOverridesEqual(this.tileOverrides.get(key), next.value)) continue;
      if (next.value) this.tileOverrides.set(key, next.value);
      else this.tileOverrides.delete(key);
      this.overriddenTiles.delete(key);
      changed.push({ x: next.x, y: next.y });
    }
    return changed;
  }
  clearTileOverride(x, y) {
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) return false;
    const key = _SparseWorldChunkStore.tileKey(x, y);
    this.overriddenTiles.delete(key);
    return this.tileOverrides.delete(key);
  }
  clearTileOverrides() {
    this.tileOverrides.clear();
    this.overriddenTiles.clear();
  }
  getTile(x, y) {
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) || this.chunkSize === void 0) return void 0;
    const point = this.normalizePoint(x, y);
    if (!point) return void 0;
    const ownerX = Math.floor(point.x / this.chunkSize);
    const ownerY = Math.floor(point.y / this.chunkSize);
    const direct = this.tileFromChunk(this.chunks.get(_SparseWorldChunkStore.key(ownerX, ownerY)), point.x, point.y);
    if (direct) return direct;
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        if (dx === 0 && dy === 0) continue;
        const candidate = this.resolveChunk(ownerX + dx, ownerY + dy);
        if (!candidate) continue;
        const tile = this.tileFromChunk(
          this.chunks.get(_SparseWorldChunkStore.key(candidate.x, candidate.y)),
          point.x,
          point.y
        );
        if (tile) return tile;
      }
    }
    return void 0;
  }
  tileFromChunk(chunk, x, y) {
    if (!chunk) return void 0;
    const xSamples = this.bounds?.wrapX ? [x, x - this.bounds.width, x + this.bounds.width] : [x];
    const ySamples = this.bounds?.wrapY ? [y, y - this.bounds.height, y + this.bounds.height] : [y];
    const originX = chunk.chunkX * chunk.chunkSize;
    const originY = chunk.chunkY * chunk.chunkSize;
    const coreWidth = this.bounds ? Math.max(0, Math.min(chunk.chunkSize, this.bounds.width - originX)) : chunk.chunkSize;
    const coreHeight = this.bounds ? Math.max(0, Math.min(chunk.chunkSize, this.bounds.height - originY)) : chunk.chunkSize;
    let packed;
    let localX = 0;
    let localY = 0;
    outer: for (const sampleX of xSamples) {
      for (const sampleY of ySamples) {
        const candidateX = sampleX - originX;
        const candidateY = sampleY - originY;
        if (candidateX < -chunk.padding || candidateX >= coreWidth + chunk.padding || candidateY < -chunk.padding || candidateY >= coreHeight + chunk.padding) continue;
        localX = candidateX;
        localY = candidateY;
        packed = chunk.tiles[(localX + chunk.padding) * chunk.stride + localY + chunk.padding];
        break outer;
      }
    }
    if (packed === void 0) return void 0;
    let base = this.decodedTiles.get(packed);
    if (!base) {
      base = decodeWorldChunkTile(chunk, localX, localY);
      if (base.modifiers) Object.freeze(base.modifiers);
      Object.freeze(base);
      this.decodedTiles.set(packed, base);
    }
    const key = _SparseWorldChunkStore.tileKey(x, y);
    const changes = this.tileOverrides.get(key);
    if (!changes) return base;
    const cached = this.overriddenTiles.get(key);
    if (cached?.packed === packed) return cached.tile;
    const tile = { ...base, ...changes };
    if (tile.modifiers) tile.modifiers = [...tile.modifiers];
    if (tile.rivers) tile.rivers = tile.rivers.map((river) => ({ ...river }));
    if (tile.city) tile.city = { ...tile.city };
    if (tile.modifiers) Object.freeze(tile.modifiers);
    if (tile.rivers) {
      for (const river of tile.rivers) Object.freeze(river);
      Object.freeze(tile.rivers);
    }
    if (tile.city) Object.freeze(tile.city);
    Object.freeze(tile);
    this.overriddenTiles.set(key, { packed, tile });
    return tile;
  }
  forEachCoreTile(visit) {
    for (const chunk of this.chunks.values()) {
      const originX = chunk.chunkX * chunk.chunkSize;
      const originY = chunk.chunkY * chunk.chunkSize;
      const width = this.bounds ? Math.min(chunk.chunkSize, this.bounds.width - originX) : chunk.chunkSize;
      const height = this.bounds ? Math.min(chunk.chunkSize, this.bounds.height - originY) : chunk.chunkSize;
      for (let localX = 0; localX < width; localX += 1) {
        for (let localY = 0; localY < height; localY += 1) {
          visit(this.tileFromChunk(chunk, originX + localX, originY + localY), originX + localX, originY + localY);
        }
      }
    }
  }
  corePoints(chunk) {
    if (!this.bounds) return getWorldChunkCorePoints(chunk);
    const originX = chunk.chunkX * chunk.chunkSize;
    const originY = chunk.chunkY * chunk.chunkSize;
    const width = Math.max(0, Math.min(chunk.chunkSize, this.bounds.width - originX));
    const height = Math.max(0, Math.min(chunk.chunkSize, this.bounds.height - originY));
    const points = [];
    for (let localX = 0; localX < width; localX += 1) {
      for (let localY = 0; localY < height; localY += 1) {
        points.push({ x: originX + localX, y: originY + localY });
      }
    }
    return points;
  }
  normalizePoint(x, y) {
    if (!this.bounds) return { x, y };
    const nx = this.bounds.wrapX ? (x % this.bounds.width + this.bounds.width) % this.bounds.width : x;
    const ny = this.bounds.wrapY ? (y % this.bounds.height + this.bounds.height) % this.bounds.height : y;
    if (nx < 0 || nx >= this.bounds.width || ny < 0 || ny >= this.bounds.height) return void 0;
    return { x: nx, y: ny };
  }
  resolveChunk(chunkX, chunkY) {
    if (!this.bounds || this.chunkSize === void 0) return { x: chunkX, y: chunkY };
    const countX = Math.ceil(this.bounds.width / this.chunkSize);
    const countY = Math.ceil(this.bounds.height / this.chunkSize);
    const x = this.bounds.wrapX ? (chunkX % countX + countX) % countX : chunkX;
    const y = this.bounds.wrapY ? (chunkY % countY + countY) % countY : chunkY;
    if (x < 0 || x >= countX || y < 0 || y >= countY) return void 0;
    return { x, y };
  }
  clear() {
    this.chunks.clear();
    this.decodedTiles.clear();
    this.tileOverrides.clear();
    this.overriddenTiles.clear();
    this.chunkSize = void 0;
  }
};

// src/world/WorldDescriptor.ts
var WORLD_DESCRIPTOR_FORMAT_VERSION = 1;
function assertChunkSize(value) {
  if (!Number.isInteger(value) || value <= 0 || value > MAX_WORLD_GENERATION_CHUNK_SIZE) {
    throw new RangeError(`chunkSize must be an integer between 1 and ${MAX_WORLD_GENERATION_CHUNK_SIZE}`);
  }
}
function assertSupportedWorldGeneratorVersion(value) {
  if (value !== WORLD_GENERATOR_VERSION) {
    throw new RangeError(
      `unsupported world generator version ${String(value)}; this build supports ${WORLD_GENERATOR_VERSION}`
    );
  }
}
function createWorldDescriptor(options) {
  if (!options || typeof options !== "object") throw new TypeError("world descriptor options are required");
  if (typeof options.seed !== "string" && typeof options.seed !== "number") {
    throw new TypeError("world seed must be a string or number");
  }
  if (typeof options.seed === "number" && !Number.isFinite(options.seed)) {
    throw new RangeError("numeric world seed must be finite");
  }
  const chunkSize = options.chunkSize ?? DEFAULT_WORLD_GENERATION_CHUNK_SIZE;
  assertChunkSize(chunkSize);
  const generatorVersion = options.generatorVersion ?? WORLD_GENERATOR_VERSION;
  assertSupportedWorldGeneratorVersion(generatorVersion);
  const base = {
    descriptorVersion: WORLD_DESCRIPTOR_FORMAT_VERSION,
    seed: String(options.seed),
    generatorVersion,
    chunkFormatVersion: WORLD_CHUNK_FORMAT_VERSION,
    chunkSize
  };
  if (!options.world) {
    return { ...base, sourceKind: "procedural-infinite", topology: "infinite" };
  }
  const world = options.world;
  if (world.topology !== "toroidal" || !Number.isInteger(world.width) || world.width < 8 || !Number.isInteger(world.height) || world.height < 8 || world.width % 2 !== 0) {
    throw new TypeError("toroidal world descriptor bounds are invalid");
  }
  return {
    ...base,
    sourceKind: "procedural-toroidal",
    topology: "toroidal",
    width: world.width,
    height: world.height
  };
}
function assertWorldDescriptor(value) {
  if (!value || typeof value !== "object") throw new TypeError("world descriptor must be an object");
  const descriptor = value;
  if (descriptor.descriptorVersion !== WORLD_DESCRIPTOR_FORMAT_VERSION) {
    throw new TypeError(`unsupported world descriptor format ${String(descriptor.descriptorVersion)}`);
  }
  if (descriptor.sourceKind !== "procedural-infinite" && descriptor.sourceKind !== "procedural-toroidal") {
    throw new TypeError("world descriptor sourceKind is invalid");
  }
  if (typeof descriptor.seed !== "string") throw new TypeError("world descriptor seed must be a string");
  assertSupportedWorldGeneratorVersion(descriptor.generatorVersion);
  if (descriptor.chunkFormatVersion !== WORLD_CHUNK_FORMAT_VERSION) {
    throw new TypeError(`unsupported world chunk format ${String(descriptor.chunkFormatVersion)}`);
  }
  assertChunkSize(descriptor.chunkSize);
  if (descriptor.sourceKind === "procedural-infinite") {
    if (descriptor.topology !== "infinite" || descriptor.width !== void 0 || descriptor.height !== void 0) {
      throw new TypeError("infinite world descriptor topology is invalid");
    }
    return;
  }
  if (descriptor.topology !== "toroidal" || !Number.isInteger(descriptor.width) || descriptor.width < 8 || descriptor.width % 2 !== 0 || !Number.isInteger(descriptor.height) || descriptor.height < 8) {
    throw new TypeError("toroidal world descriptor topology is invalid");
  }
}
function serializeWorldDescriptor(descriptor) {
  assertWorldDescriptor(descriptor);
  return JSON.stringify([
    descriptor.descriptorVersion,
    descriptor.sourceKind,
    descriptor.seed,
    descriptor.generatorVersion,
    descriptor.chunkFormatVersion,
    descriptor.chunkSize,
    descriptor.topology,
    descriptor.width ?? null,
    descriptor.height ?? null
  ]);
}

// src/world/generateVegetation.ts
var import_robust_point_in_polygon = __toESM(require_robust_pnp(), 1);

// src/helpers/chunks.ts
var DEFAULT_WORLD_CHUNK_LOD_DISTANCES = Object.freeze({
  near: 900,
  far: 1650,
  vegetation: 1450,
  hysteresis: 120
});

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

// src/world/ChunkResidencyCoordinator.ts
function abortError(message) {
  if (typeof DOMException !== "undefined") return new DOMException(message, "AbortError");
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}
function validateOwner(owner) {
  if (typeof owner !== "string" || owner.trim().length === 0) {
    throw new TypeError("chunk lease owner must be a non-empty string");
  }
}
var WorldChunkLeaseImpl = class {
  constructor(chunk, owner, onRelease) {
    this.chunk = chunk;
    this.owner = owner;
    this.onRelease = onRelease;
    this.isReleased = false;
  }
  get released() {
    return this.isReleased;
  }
  release() {
    if (this.isReleased) return;
    this.isReleased = true;
    this.onRelease(this);
  }
};
var ChunkResidencyCoordinator = class _ChunkResidencyCoordinator {
  constructor(source) {
    this.source = source;
    this.entries = /* @__PURE__ */ new Map();
    this.disposed = false;
    assertWorldSource(source);
  }
  acquireChunk(chunkX, chunkY, options) {
    if (this.disposed) return Promise.reject(new Error("ChunkResidencyCoordinator has been disposed"));
    const owner = options?.owner;
    try {
      validateOwner(owner);
    } catch (reason) {
      return Promise.reject(reason);
    }
    if (options?.signal?.aborted) return Promise.reject(abortError("Chunk lease request was aborted"));
    const resolved = this.source.resolveChunk(chunkX, chunkY);
    if (!resolved) return Promise.reject(new RangeError("chunk coordinates are outside the world bounds"));
    const key = _ChunkResidencyCoordinator.key(resolved.x, resolved.y);
    let entry = this.entries.get(key);
    if (!entry) {
      entry = {
        key,
        chunkX: resolved.x,
        chunkY: resolved.y,
        waiters: /* @__PURE__ */ new Set(),
        leases: /* @__PURE__ */ new Set()
      };
      this.entries.set(key, entry);
    }
    if (entry.chunk) return Promise.resolve(this.createLease(entry, owner));
    return new Promise((resolve, reject) => {
      const waiter = {
        owner,
        signal: options?.signal,
        priority: Number.isFinite(options?.priority) ? options.priority : 0,
        settled: false,
        resolve,
        reject
      };
      if (options?.signal) {
        waiter.abort = () => this.abortWaiter(entry, waiter);
        options.signal.addEventListener("abort", waiter.abort, { once: true });
      }
      entry.waiters.add(waiter);
      if (!entry.loading) this.startLoad(entry);
    });
  }
  get stats() {
    const leasesByOwner = {};
    let residentChunks = 0;
    let pendingChunks = 0;
    let activeLeases = 0;
    for (const entry of this.entries.values()) {
      if (entry.chunk) residentChunks += 1;
      if (entry.loading && !entry.chunk) pendingChunks += 1;
      activeLeases += entry.leases.size;
      for (const lease of entry.leases) {
        leasesByOwner[lease.owner] = (leasesByOwner[lease.owner] ?? 0) + 1;
      }
    }
    return { residentChunks, pendingChunks, activeLeases, leasesByOwner };
  }
  hasResident(chunkX, chunkY) {
    const resolved = this.source.resolveChunk(chunkX, chunkY);
    return resolved !== void 0 && this.entries.get(_ChunkResidencyCoordinator.key(resolved.x, resolved.y))?.chunk !== void 0;
  }
  dispose(disposeSource = false) {
    if (this.disposed) {
      if (disposeSource) this.source.dispose();
      return;
    }
    this.disposed = true;
    for (const entry of this.entries.values()) {
      entry.controller?.abort();
      for (const waiter of [...entry.waiters]) {
        this.rejectWaiter(entry, waiter, abortError("Chunk residency was disposed"));
      }
      const chunk = entry.chunk;
      entry.chunk = void 0;
      for (const lease of entry.leases) lease.release();
      entry.leases.clear();
      if (chunk) this.releaseSourceChunk(chunk);
    }
    this.entries.clear();
    if (coordinators.get(this.source) === this) coordinators.delete(this.source);
    if (disposeSource) this.source.dispose();
  }
  startLoad(entry) {
    const controller = new AbortController();
    entry.controller = controller;
    const priority = this.minimumPriority(entry);
    entry.loading = this.source.loadChunk(entry.chunkX, entry.chunkY, {
      priority,
      signal: controller.signal
    }).then((chunk) => {
      try {
        assertWorldChunk(this.source, chunk, entry.chunkX, entry.chunkY);
      } catch (reason) {
        this.releaseSourceChunk(chunk);
        throw reason;
      }
      if (this.disposed || entry.waiters.size === 0) {
        this.releaseSourceChunk(chunk);
        return;
      }
      entry.chunk = chunk;
      for (const waiter of [...entry.waiters]) {
        if (waiter.signal?.aborted) {
          this.rejectWaiter(entry, waiter, abortError("Chunk lease request was aborted"));
          continue;
        }
        this.resolveWaiter(entry, waiter, this.createLease(entry, waiter.owner));
      }
      this.releaseIfUnused(entry);
    }).catch((reason) => {
      const error = reason instanceof Error ? reason : new Error(String(reason));
      if (entry.waiters.size > 0 && controller.signal.aborted && !this.disposed) return;
      for (const waiter of [...entry.waiters]) this.rejectWaiter(entry, waiter, error);
    }).finally(() => {
      if (entry.controller !== controller) return;
      entry.loading = void 0;
      entry.controller = void 0;
      if (!this.disposed && entry.waiters.size > 0 && !entry.chunk) this.startLoad(entry);
      else this.releaseIfUnused(entry);
    });
  }
  minimumPriority(entry) {
    let priority = 0;
    let initialized = false;
    for (const waiter of entry.waiters) {
      if (!initialized || waiter.priority < priority) priority = waiter.priority;
      initialized = true;
    }
    return priority;
  }
  abortWaiter(entry, waiter) {
    if (waiter.settled) return;
    this.rejectWaiter(entry, waiter, abortError("Chunk lease request was aborted"));
    if (entry.waiters.size === 0 && entry.leases.size === 0 && entry.loading) entry.controller?.abort();
    this.releaseIfUnused(entry);
  }
  createLease(entry, owner) {
    const lease = new WorldChunkLeaseImpl(entry.chunk, owner, (released) => {
      entry.leases.delete(released);
      this.releaseIfUnused(entry);
    });
    entry.leases.add(lease);
    return lease;
  }
  resolveWaiter(entry, waiter, lease) {
    if (waiter.settled) return;
    waiter.settled = true;
    entry.waiters.delete(waiter);
    if (waiter.abort && waiter.signal) waiter.signal.removeEventListener("abort", waiter.abort);
    waiter.resolve(lease);
  }
  rejectWaiter(entry, waiter, reason) {
    if (waiter.settled) return;
    waiter.settled = true;
    entry.waiters.delete(waiter);
    if (waiter.abort && waiter.signal) waiter.signal.removeEventListener("abort", waiter.abort);
    waiter.reject(reason);
  }
  releaseIfUnused(entry) {
    if (entry.loading && !entry.chunk || entry.waiters.size > 0 || entry.leases.size > 0) return;
    if (entry.chunk) this.releaseSourceChunk(entry.chunk);
    entry.chunk = void 0;
    if (this.entries.get(entry.key) === entry) this.entries.delete(entry.key);
  }
  releaseSourceChunk(chunk) {
    try {
      this.source.releaseChunk(chunk);
    } catch {
    }
  }
  static key(chunkX, chunkY) {
    return `${chunkX},${chunkY}`;
  }
};
var coordinators = /* @__PURE__ */ new WeakMap();
function getChunkResidencyCoordinator(source) {
  const existing = coordinators.get(source);
  if (existing) return existing;
  const coordinator = new ChunkResidencyCoordinator(source);
  coordinators.set(source, coordinator);
  return coordinator;
}

// src/world/HierarchicalPathfinder.ts
var WORLD_NAVIGATION_FORMAT_VERSION = 2;
var StaleWorldNavigationSummaryError = class extends Error {
  constructor(chunkX, chunkY) {
    super(`Navigation summary ${chunkX},${chunkY} does not match the current world revision`);
    this.chunkX = chunkX;
    this.chunkY = chunkY;
    this.name = "StaleWorldNavigationSummaryError";
  }
};
var pointKey = (point) => `${point.x},${point.y}`;
var chunkKey = (x, y) => `${x},${y}`;
var MinQueue = class {
  constructor() {
    this.entries = [];
  }
  get size() {
    return this.entries.length;
  }
  push(value, priority) {
    const entry = { value, priority };
    this.entries.push(entry);
    let index = this.entries.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.entries[parent].priority <= priority) break;
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
var MemoryWorldNavigationIndex = class {
  constructor(chunkSize, bounds, movementType = "default") {
    this.chunkSize = chunkSize;
    this.bounds = bounds;
    this.movementType = movementType;
    this.summaries = /* @__PURE__ */ new Map();
    if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0) throw new RangeError("navigation chunkSize must be positive");
    if (!movementType.trim()) throw new TypeError("navigation movementType must be a non-empty string");
  }
  setSummary(summary) {
    assertNavigationSummary(summary);
    if (summary.movementType !== this.movementType) {
      throw new TypeError("navigation summary movementType does not match its index");
    }
    this.summaries.set(chunkKey(summary.chunkX, summary.chunkY), summary);
  }
  getSummary(chunkX, chunkY) {
    return Promise.resolve(this.summaries.get(chunkKey(chunkX, chunkY)));
  }
  invalidateChunk(chunkX, chunkY) {
    return this.summaries.delete(chunkKey(chunkX, chunkY));
  }
};
var ProceduralWorldNavigationIndex = class {
  constructor(options) {
    this.cache = /* @__PURE__ */ new Map();
    if (!options || !Number.isSafeInteger(options.chunkSize) || options.chunkSize <= 0) {
      throw new RangeError("procedural navigation chunkSize must be positive");
    }
    this.seed = options.seed;
    this.chunkSize = options.chunkSize;
    this.world = options.world;
    this.bounds = options.world ? { width: options.world.width, height: options.world.height, wrapX: true, wrapY: true } : void 0;
    this.passable = options.passable ?? ((tile) => tile.type !== "sea" /* sea */);
    this.movementType = options.movementType ?? "default";
    this.buildOptions = {
      movementType: this.movementType,
      movementCost: options.movementCost,
      terrainRevision: options.terrainRevision ?? serializeWorldDescriptor(createWorldDescriptor({
        seed: options.seed,
        chunkSize: options.chunkSize,
        world: options.world
      })),
      deltaRevision: options.deltaRevision ?? 0,
      maxPortalsPerEntrance: options.maxPortalsPerEntrance
    };
    this.maxCached = options.maxCachedSummaries ?? 2048;
    if (!Number.isInteger(this.maxCached) || this.maxCached <= 0) {
      throw new RangeError("maxCachedSummaries must be a positive integer");
    }
  }
  get cachedSummaries() {
    return this.cache.size;
  }
  getSummary(chunkX, chunkY) {
    const resolved = this.resolveChunk(chunkX, chunkY);
    if (!resolved) return Promise.resolve(void 0);
    const key = chunkKey(resolved.x, resolved.y);
    const cached = this.cache.get(key);
    if (cached) {
      this.cache.delete(key);
      this.cache.set(key, cached);
      return Promise.resolve(cached);
    }
    const packed = generateWorldChunk({
      seed: this.seed,
      chunkX: resolved.x,
      chunkY: resolved.y,
      chunkSize: this.chunkSize,
      world: this.world
    });
    const store = this.bounds ? new SparseWorldChunkStore(this.bounds) : new SparseWorldChunkStore();
    store.add(packed);
    const summary = buildWorldNavigationSummary(
      store.map,
      resolved.x,
      resolved.y,
      this.chunkSize,
      this.passable,
      this.buildOptions
    );
    this.cache.set(key, summary);
    while (this.cache.size > this.maxCached) this.cache.delete(this.cache.keys().next().value);
    return Promise.resolve(summary);
  }
  invalidateChunk(chunkX, chunkY) {
    const resolved = this.resolveChunk(chunkX, chunkY);
    return resolved ? this.cache.delete(chunkKey(resolved.x, resolved.y)) : false;
  }
  resolveChunk(chunkX, chunkY) {
    if (!Number.isSafeInteger(chunkX) || !Number.isSafeInteger(chunkY)) return void 0;
    if (!this.bounds) return { x: chunkX, y: chunkY };
    const countX = Math.ceil(this.bounds.width / this.chunkSize);
    const countY = Math.ceil(this.bounds.height / this.chunkSize);
    return { x: (chunkX % countX + countX) % countX, y: (chunkY % countY + countY) % countY };
  }
};
function assertNavigationSummary(summary) {
  if (!summary || summary.version !== WORLD_NAVIGATION_FORMAT_VERSION || !Number.isSafeInteger(summary.chunkX) || !Number.isSafeInteger(summary.chunkY) || typeof summary.movementType !== "string" || summary.movementType.trim().length === 0 || typeof summary.terrainRevision !== "string" && !Number.isFinite(summary.terrainRevision) || !Number.isSafeInteger(summary.deltaRevision) || summary.deltaRevision < 0 || !Array.isArray(summary.portals) || !Array.isArray(summary.costs) || summary.costs.length !== summary.portals.length || summary.costs.some((row) => !Array.isArray(row) || row.length !== summary.portals.length || row.some((cost) => cost !== null && (!Number.isFinite(cost) || cost < 0))) || summary.portals.some((portal) => !portal?.id || !portal.entranceId || !Number.isSafeInteger(portal.inside.x) || !Number.isSafeInteger(portal.inside.y) || !Number.isSafeInteger(portal.outside.x) || !Number.isSafeInteger(portal.outside.y) || !Number.isSafeInteger(portal.targetChunkX) || !Number.isSafeInteger(portal.targetChunkY) || !Number.isFinite(portal.crossingCost) || portal.crossingCost <= 0)) {
    throw new TypeError("world navigation chunk summary is invalid");
  }
}
function buildWorldNavigationSummary(map, chunkX, chunkY, chunkSize, passable, options = {}) {
  if (!Number.isSafeInteger(chunkX) || !Number.isSafeInteger(chunkY) || !Number.isSafeInteger(chunkSize) || chunkSize <= 0) throw new RangeError("navigation chunk coordinates and size are invalid");
  const originX = chunkX * chunkSize;
  const originY = chunkY * chunkSize;
  const width = map.infinite ? chunkSize : Math.max(0, Math.min(chunkSize, map.w - originX));
  const height = map.infinite ? chunkSize : Math.max(0, Math.min(chunkSize, map.h - originY));
  const maxPortalsPerEntrance = options.maxPortalsPerEntrance ?? 2;
  if (!Number.isInteger(maxPortalsPerEntrance) || maxPortalsPerEntrance <= 0) {
    throw new RangeError("maxPortalsPerEntrance must be a positive integer");
  }
  const movementType = options.movementType ?? "default";
  if (typeof movementType !== "string" || movementType.trim().length === 0) {
    throw new TypeError("navigation movementType must be a non-empty string");
  }
  const terrainRevision = options.terrainRevision ?? 0;
  if (typeof terrainRevision !== "string" && !Number.isFinite(terrainRevision)) {
    throw new TypeError("terrainRevision must be a string or finite number");
  }
  const deltaRevision = options.deltaRevision ?? 0;
  if (!Number.isSafeInteger(deltaRevision) || deltaRevision < 0) {
    throw new RangeError("deltaRevision must be a non-negative safe integer");
  }
  const rawPortals = [];
  const seen = /* @__PURE__ */ new Set();
  for (let localX = 0; localX < width; localX += 1) {
    for (let localY = 0; localY < height; localY += 1) {
      const inside = { x: originX + localX, y: originY + localY };
      const tile = getMapTile(map, inside.x, inside.y);
      if (!tile || !passable(tile, inside.x, inside.y)) continue;
      for (const raw of getNeighbors(inside.x, inside.y)) {
        const outside = normalizeMapCoordinates(map, raw.x, raw.y);
        if (!outside) continue;
        const targetChunkX = Math.floor(outside.x / chunkSize);
        const targetChunkY = Math.floor(outside.y / chunkSize);
        if (targetChunkX === chunkX && targetChunkY === chunkY) continue;
        const outsideTile = getMapTile(map, outside.x, outside.y);
        if (!outsideTile || !passable(outsideTile, outside.x, outside.y)) continue;
        const id = `${inside.x},${inside.y}>${outside.x},${outside.y}`;
        if (seen.has(id)) continue;
        seen.add(id);
        rawPortals.push({
          id,
          entranceId: id,
          inside,
          outside,
          targetChunkX,
          targetChunkY,
          crossingCost: getMovementCost(outsideTile, outside.x, outside.y, options.movementCost)
        });
      }
    }
  }
  const portals = compactPortals(map, rawPortals, maxPortalsPerEntrance);
  const costs = portals.map(() => portals.map(() => null));
  for (let index = 0; index < portals.length; index += 1) {
    const distances = localDistances(
      map,
      portals[index].inside,
      chunkX,
      chunkY,
      chunkSize,
      passable,
      options.movementCost
    );
    for (let target = 0; target < portals.length; target += 1) {
      costs[index][target] = distances.get(pointKey(portals[target].inside)) ?? null;
    }
  }
  return {
    version: WORLD_NAVIGATION_FORMAT_VERSION,
    chunkX,
    chunkY,
    movementType,
    terrainRevision,
    deltaRevision,
    portals,
    costs
  };
}
function compactPortals(map, rawPortals, maximum) {
  const remaining = new Set(rawPortals.map((_, index) => index));
  const compacted = [];
  while (remaining.size > 0) {
    const seed = remaining.values().next().value;
    remaining.delete(seed);
    const component = [];
    const queue = [seed];
    for (let head = 0; head < queue.length; head += 1) {
      const index = queue[head];
      const portal = rawPortals[index];
      component.push(portal);
      for (const candidate of [...remaining]) {
        if (!portalsTouch(map, portal, rawPortals[candidate])) continue;
        remaining.delete(candidate);
        queue.push(candidate);
      }
    }
    component.sort(compareUndirectedCrossings);
    const first = undirectedCrossingKey(component[0]);
    const last = undirectedCrossingKey(component[component.length - 1]);
    const entranceId = `${first}..${last}#${component.length}`;
    for (const portal of selectRepresentatives(component, maximum)) {
      compacted.push({ ...portal, entranceId });
    }
  }
  return compacted.sort((a, b) => a.id.localeCompare(b.id));
}
function portalsTouch(map, first, second) {
  if (first.targetChunkX !== second.targetChunkX || first.targetChunkY !== second.targetChunkY) return false;
  return sameOrNeighbor(map, first.inside, second.inside) && sameOrNeighbor(map, first.outside, second.outside);
}
function sameOrNeighbor(map, first, second) {
  return first.x === second.x && first.y === second.y || getMapNeighbors(map, first.x, first.y).some((point) => point.x === second.x && point.y === second.y);
}
function selectRepresentatives(portals, maximum) {
  if (portals.length <= maximum) return portals;
  if (maximum === 1) return [portals[Math.floor((portals.length - 1) / 2)]];
  const selected = [];
  const seen = /* @__PURE__ */ new Set();
  for (let index = 0; index < maximum; index += 1) {
    const selectedIndex = Math.round(index * (portals.length - 1) / (maximum - 1));
    if (!seen.has(selectedIndex)) selected.push(portals[selectedIndex]);
    seen.add(selectedIndex);
  }
  return selected;
}
function compareUndirectedCrossings(first, second) {
  const a = undirectedCrossingTuple(first);
  const b = undirectedCrossingTuple(second);
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}
function undirectedCrossingTuple(portal) {
  const first = portal.inside.x < portal.outside.x || portal.inside.x === portal.outside.x && portal.inside.y <= portal.outside.y ? portal.inside : portal.outside;
  const second = first === portal.inside ? portal.outside : portal.inside;
  return [first.x, first.y, second.x, second.y];
}
function undirectedCrossingKey(portal) {
  return undirectedCrossingTuple(portal).join(",");
}
function localDistances(map, start, chunkX, chunkY, chunkSize, passable, movementCost) {
  const distances = /* @__PURE__ */ new Map([[pointKey(start), 0]]);
  const frontier = new MinQueue();
  frontier.push(start, 0);
  while (frontier.size > 0) {
    const queued = frontier.pop();
    const current = queued.value;
    const distance = distances.get(pointKey(current));
    if (distance === void 0 || distance !== queued.priority) continue;
    for (const neighbor of getMapNeighbors(map, current.x, current.y)) {
      if (Math.floor(neighbor.x / chunkSize) !== chunkX || Math.floor(neighbor.y / chunkSize) !== chunkY) continue;
      const key = pointKey(neighbor);
      const tile = getMapTile(map, neighbor.x, neighbor.y);
      if (!tile || !passable(tile, neighbor.x, neighbor.y)) continue;
      const nextDistance = distance + getMovementCost(tile, neighbor.x, neighbor.y, movementCost);
      if (nextDistance >= (distances.get(key) ?? Infinity)) continue;
      distances.set(key, nextDistance);
      frontier.push(neighbor, nextDistance);
    }
  }
  return distances;
}
function getMovementCost(tile, x, y, movementCost) {
  const cost = movementCost?.(tile, x, y) ?? 1;
  if (!Number.isFinite(cost) || cost <= 0) {
    throw new RangeError("tile movement costs must be positive finite numbers");
  }
  return cost;
}
var HierarchicalPathfinder = class {
  constructor(source, index, passable = (tile) => tile.type !== "sea" /* sea */, options = {}) {
    this.source = source;
    this.index = index;
    this.passable = passable;
    if (source.chunkSize !== index.chunkSize) throw new Error("navigation index chunkSize must match WorldSource chunkSize");
    this.movementType = options.movementType ?? "default";
    if (index.movementType !== this.movementType) {
      throw new TypeError("navigation index movementType does not match the pathfinder");
    }
    this.movementCost = options.movementCost;
    this.expectedRevision = options.expectedRevision ?? (source.getChunkRevision ? (chunkX, chunkY) => source.getChunkRevision(chunkX, chunkY) : void 0);
    this.residency = options.residency ?? getChunkResidencyCoordinator(source);
    if (this.residency.source !== source) {
      throw new TypeError("HierarchicalPathfinder residency must coordinate its source");
    }
    this.owner = options.owner ?? "hierarchical-pathfinder";
    if (typeof this.owner !== "string" || this.owner.trim().length === 0) {
      throw new TypeError("pathfinder chunk lease owner must be a non-empty string");
    }
  }
  async find(startValue, endValue, options = {}) {
    const loadedByPath = /* @__PURE__ */ new Map();
    try {
      return await this.findInternal(startValue, endValue, options, loadedByPath);
    } catch (reason) {
      for (const lease of loadedByPath.values()) lease.release();
      throw reason;
    }
  }
  async findInternal(startValue, endValue, options, loadedByPath) {
    throwIfAborted(options.signal);
    const start = normalizeMapCoordinates(this.source.map, startValue.x, startValue.y);
    const end = normalizeMapCoordinates(this.source.map, endValue.x, endValue.y);
    if (!start || !end) return this.emptyResult();
    const startChunk = this.resolveTileChunk(start);
    const endChunk = this.resolveTileChunk(end);
    if (!startChunk || !endChunk) return this.emptyResult();
    await this.ensureDetailedChunk(startChunk, loadedByPath, options.signal);
    const startTile = getMapTile(this.source.map, start.x, start.y);
    if (!startTile || !this.passable(startTile, start.x, start.y)) {
      return this.result([], [], 0, loadedByPath, options.releaseLoadedChunks);
    }
    if (startChunk.x === endChunk.x && startChunk.y === endChunk.y) {
      const local = this.findLocalPath(start, end, startChunk.x, startChunk.y);
      return this.result(local.path, [startChunk], 0, loadedByPath, options.releaseLoadedChunks);
    }
    await this.ensureDetailedChunk(endChunk, loadedByPath, options.signal);
    const endTile = getMapTile(this.source.map, end.x, end.y);
    if (!endTile || !this.passable(endTile, end.x, end.y)) {
      return this.result([], [], 0, loadedByPath, options.releaseLoadedChunks);
    }
    if (!this.movementCost && getMapNeighbors(this.source.map, start.x, start.y).some((point) => point.x === end.x && point.y === end.y)) {
      return this.result([start, end], [startChunk, endChunk], 0, loadedByPath, options.releaseLoadedChunks);
    }
    const maximum = options.maxVisitedPortals ?? 1e5;
    if (!Number.isInteger(maximum) || maximum <= 0) throw new RangeError("maxVisitedPortals must be a positive integer");
    const summaries = /* @__PURE__ */ new Map();
    const getSummary = async (point) => {
      throwIfAborted(options.signal);
      const key = chunkKey(point.x, point.y);
      if (summaries.has(key)) return summaries.get(key);
      let summary = await this.index.getSummary(point.x, point.y);
      if (summary) {
        assertNavigationSummary(summary);
        if (summary.movementType !== this.movementType) {
          throw new TypeError("navigation summary movementType does not match the pathfinder");
        }
        const expected = await this.expectedRevision?.(point.x, point.y);
        if (expected && !summaryRevisionMatches(summary, expected)) {
          this.index.invalidateChunk?.(point.x, point.y);
          summary = await this.index.getSummary(point.x, point.y);
          if (!summary) throw new StaleWorldNavigationSummaryError(point.x, point.y);
          assertNavigationSummary(summary);
          if (summary.movementType !== this.movementType || !summaryRevisionMatches(summary, expected)) {
            throw new StaleWorldNavigationSummaryError(point.x, point.y);
          }
        }
        summaries.set(key, summary);
      }
      return summary;
    };
    const startSummary = await getSummary(startChunk);
    const endSummary = await getSummary(endChunk);
    if (!startSummary || !endSummary) return this.result([], [], 0, loadedByPath, options.releaseLoadedChunks);
    const frontier = new MinQueue();
    const costs = /* @__PURE__ */ new Map();
    const parents = /* @__PURE__ */ new Map();
    const stateKey = (state) => `${state.chunkX},${state.chunkY}|${state.entryIndex}`;
    for (let exitIndex = 0; exitIndex < startSummary.portals.length; exitIndex += 1) {
      const exit = startSummary.portals[exitIndex];
      const local = this.findLocalPath(start, exit.inside, startChunk.x, startChunk.y);
      if (local.path.length === 0) continue;
      const targetSummary = await getSummary({ x: exit.targetChunkX, y: exit.targetChunkY });
      const entryIndex = targetSummary ? reversePortalIndex(targetSummary, exit) : -1;
      if (!targetSummary || entryIndex < 0) continue;
      const state = { chunkX: targetSummary.chunkX, chunkY: targetSummary.chunkY, entryIndex };
      const key = stateKey(state);
      const cost = local.cost + exit.crossingCost;
      if (cost >= (costs.get(key) ?? Infinity)) continue;
      costs.set(key, cost);
      frontier.push(state, cost);
      parents.set(key, {
        from: { chunkX: startChunk.x, chunkY: startChunk.y, entryIndex: -1 },
        to: state,
        exit,
        entry: targetSummary.portals[entryIndex]
      });
    }
    let goal;
    let goalCost = Infinity;
    let visited = 0;
    while (frontier.size > 0 && visited < maximum) {
      throwIfAborted(options.signal);
      const queued = frontier.pop();
      const state = queued.value;
      const key = stateKey(state);
      const currentCost = costs.get(key);
      if (currentCost === void 0 || queued.priority !== currentCost) continue;
      if (currentCost >= goalCost) break;
      visited += 1;
      const summary = await getSummary({ x: state.chunkX, y: state.chunkY });
      if (!summary) continue;
      if (state.chunkX === endChunk.x && state.chunkY === endChunk.y) {
        const local = this.findLocalPath(summary.portals[state.entryIndex].inside, end, state.chunkX, state.chunkY);
        const candidateCost = currentCost + local.cost;
        if (local.path.length > 0 && candidateCost < goalCost) {
          goal = state;
          goalCost = candidateCost;
        }
      }
      for (let exitIndex = 0; exitIndex < summary.portals.length; exitIndex += 1) {
        const within = summary.costs[state.entryIndex]?.[exitIndex];
        if (within === null || within === void 0) continue;
        const exit = summary.portals[exitIndex];
        const target = await getSummary({ x: exit.targetChunkX, y: exit.targetChunkY });
        const entryIndex = target ? reversePortalIndex(target, exit) : -1;
        if (!target || entryIndex < 0) continue;
        const next = { chunkX: target.chunkX, chunkY: target.chunkY, entryIndex };
        const nextKey = stateKey(next);
        const nextCost = currentCost + within + exit.crossingCost;
        if (nextCost >= (costs.get(nextKey) ?? Infinity)) continue;
        costs.set(nextKey, nextCost);
        frontier.push(next, nextCost);
        parents.set(nextKey, { from: state, to: next, exit, entry: target.portals[entryIndex] });
      }
    }
    if (!goal) return this.result([], [], visited, loadedByPath, options.releaseLoadedChunks);
    const transitions = [];
    let cursor = goal;
    while (cursor.entryIndex >= 0) {
      const transition = parents.get(stateKey(cursor));
      if (!transition) return this.result([], [], visited, loadedByPath, options.releaseLoadedChunks);
      transitions.push(transition);
      cursor = transition.from;
    }
    transitions.reverse();
    const corridor = [startChunk];
    for (const transition of transitions) corridor.push({ x: transition.to.chunkX, y: transition.to.chunkY });
    for (const chunk of corridor) await this.ensureDetailedChunk(chunk, loadedByPath, options.signal);
    const fullPath = [];
    let current = start;
    for (let index = 0; index < corridor.length; index += 1) {
      const transition = transitions[index];
      const target = transition?.exit.inside ?? end;
      const local = this.findLocalPath(current, target, corridor[index].x, corridor[index].y);
      if (local.path.length === 0) return this.result([], corridor, visited, loadedByPath, options.releaseLoadedChunks);
      appendUnique(fullPath, local.path);
      if (transition) {
        appendUnique(fullPath, [transition.exit.outside]);
        current = transition.entry.inside;
      }
    }
    return this.result(fullPath, corridor, visited, loadedByPath, options.releaseLoadedChunks);
  }
  resolveTileChunk(point) {
    return this.source.resolveChunk(Math.floor(point.x / this.source.chunkSize), Math.floor(point.y / this.source.chunkSize));
  }
  async ensureDetailedChunk(point, loaded, signal) {
    throwIfAborted(signal);
    const key = chunkKey(point.x, point.y);
    if (loaded.has(key)) return;
    loaded.set(key, await this.residency.acquireChunk(point.x, point.y, {
      owner: this.owner,
      signal
    }));
  }
  findLocalPath(start, end, chunkX, chunkY) {
    if (start.x === end.x && start.y === end.y) return { path: [{ ...start }], cost: 0 };
    const frontier = new MinQueue();
    frontier.push(start, 0);
    const parents = /* @__PURE__ */ new Map();
    const costs = /* @__PURE__ */ new Map([[pointKey(start), 0]]);
    while (frontier.size > 0) {
      const queued = frontier.pop();
      const current = queued.value;
      const currentCost = costs.get(pointKey(current));
      if (currentCost === void 0 || currentCost !== queued.priority) continue;
      if (current.x === end.x && current.y === end.y) {
        return { path: reconstruct(start, end, parents), cost: currentCost };
      }
      for (const neighbor of getMapNeighbors(this.source.map, current.x, current.y)) {
        const owner = this.resolveTileChunk(neighbor);
        if (!owner || owner.x !== chunkX || owner.y !== chunkY) continue;
        const key = pointKey(neighbor);
        const tile = getMapTile(this.source.map, neighbor.x, neighbor.y);
        if (!tile || !this.passable(tile, neighbor.x, neighbor.y)) continue;
        const nextCost = currentCost + getMovementCost(tile, neighbor.x, neighbor.y, this.movementCost);
        if (nextCost >= (costs.get(key) ?? Infinity)) continue;
        costs.set(key, nextCost);
        parents.set(key, current);
        frontier.push(neighbor, nextCost);
      }
    }
    return { path: [], cost: Infinity };
  }
  result(path, chunks, visitedPortals, loaded, releaseNow = false) {
    let released = false;
    const leases = [...loaded.values()];
    const loadedChunks = leases.map((lease) => lease.chunk);
    const release = () => {
      if (released) return;
      released = true;
      for (const lease of leases) lease.release();
    };
    if (releaseNow) release();
    return { path, chunks, visitedPortals, loadedChunks, release };
  }
  emptyResult() {
    return { path: [], chunks: [], visitedPortals: 0, loadedChunks: [], release() {
    } };
  }
};
function reversePortalIndex(summary, portal) {
  return summary.portals.findIndex((candidate) => candidate.inside.x === portal.outside.x && candidate.inside.y === portal.outside.y && candidate.outside.x === portal.inside.x && candidate.outside.y === portal.inside.y);
}
function summaryRevisionMatches(summary, expected) {
  return summary.terrainRevision === expected.terrainRevision && summary.deltaRevision === expected.deltaRevision;
}
function reconstruct(start, end, parents) {
  const path = [{ ...end }];
  let current = end;
  while (current.x !== start.x || current.y !== start.y) {
    const parent = parents.get(pointKey(current));
    if (!parent) return [];
    path.push(parent);
    current = parent;
  }
  return path.reverse();
}
function appendUnique(target, points) {
  for (const point of points) {
    const previous = target[target.length - 1];
    if (!previous || previous.x !== point.x || previous.y !== point.y) target.push({ ...point });
  }
}
function throwIfAborted(signal) {
  if (!signal?.aborted) return;
  if (typeof DOMException !== "undefined") throw new DOMException("Hierarchical pathfinding was aborted", "AbortError");
  const error = new Error("Hierarchical pathfinding was aborted");
  error.name = "AbortError";
  throw error;
}
export {
  HierarchicalPathfinder,
  MemoryWorldNavigationIndex,
  ProceduralWorldNavigationIndex,
  StaleWorldNavigationSummaryError,
  WORLD_NAVIGATION_FORMAT_VERSION,
  assertNavigationSummary,
  buildWorldNavigationSummary
};
//# sourceMappingURL=pathfinding.mjs.map