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

// src/world/generateWorld.ts
var MIN_WORLD_SIZE = 8;
var MAX_WORLD_SIZE = 512;
var SEA_LEVEL = 0.43;
var isWater = (type) => type === "sea" /* sea */ || type === "coastal" /* coastal */;
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
function classifyTerrain({ elevation, moisture, temperature }) {
  if (elevation < SEA_LEVEL) return "sea" /* sea */;
  if (elevation > 0.75) return "mountain" /* mountain */;
  if (temperature < 0.18) return "snow" /* snow */;
  if (temperature < 0.34) return "tundra" /* tundra */;
  if (temperature > 0.68 && moisture < 0.42) return "sand" /* sand */;
  return "land" /* land */;
}
function decorateTile(seed, x, y, climate, type) {
  const tile = { type };
  if (isWater(type) || type === "mountain" /* mountain */ || type === "snow" /* snow */) return tile;
  const modifiers = [];
  const lake = type === "land" /* land */ && climate.elevation > SEA_LEVEL + 0.025 && climate.elevation < 0.56 && climate.moisture > 0.74 && randomAt(seed, x, y, 1821285621) > 0.94;
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
var modulo = (value, period) => (value % period + period) % period;
function generateToroidalWorldTile(numericSeed, x, y, width, height) {
  const canonicalX = modulo(x, width);
  const canonicalY = modulo(y, height);
  const climate = sampleToroidalClimate(numericSeed, canonicalX, canonicalY, width, height);
  let type = classifyTerrain(climate);
  if (type === "sea" /* sea */) {
    const touchesLand = getNeighbors(canonicalX, canonicalY).some((neighbor) => {
      const nx = modulo(neighbor.x, width);
      const ny = modulo(neighbor.y, height);
      return !isWater(classifyTerrain(sampleToroidalClimate(numericSeed, nx, ny, width, height)));
    });
    if (touchesLand) type = "coastal" /* coastal */;
  }
  return decorateTile(numericSeed, canonicalX, canonicalY, climate, type);
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
      if (toroidal) {
        data[x][y] = generateToroidalWorldTile(numericSeed, x, y, width, height);
        continue;
      }
      const climate = sampleBoundedClimate(numericSeed, x, y, width, height);
      data[x][y] = decorateTile(numericSeed, x, y, climate, classifyTerrain(climate));
    }
  }
  const world = { data, w: width, h: height, wrapX: toroidal, wrapY: toroidal };
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) {
      const tile = data[x][y];
      if (toroidal || tile.type !== "sea" /* sea */) continue;
      const touchesLand = getMapNeighbors(world, x, y).some(({ x: nx, y: ny }) => {
        const neighbor = data[nx]?.[ny];
        return neighbor !== void 0 && !isWater(neighbor.type);
      });
      if (touchesLand) tile.type = "coastal" /* coastal */;
    }
  }
  return world;
}

// src/world/generateWorldChunk.ts
var DEFAULT_WORLD_GENERATION_CHUNK_SIZE = 24;
var MAX_WORLD_GENERATION_CHUNK_SIZE = 128;
var WORLD_CHUNK_FORMAT_VERSION = 1;
var WORLD_CHUNK_PADDING = 1;
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
var SEA_LEVEL2 = 0.43;
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
function classifyTerrain2({ elevation, moisture, temperature }) {
  if (elevation < SEA_LEVEL2) return "sea" /* sea */;
  if (elevation > 0.75) return "mountain" /* mountain */;
  if (temperature < 0.18) return "snow" /* snow */;
  if (temperature < 0.34) return "tundra" /* tundra */;
  if (temperature > 0.68 && moisture < 0.42) return "sand" /* sand */;
  return "land" /* land */;
}
function baseTerrainAt(seed, x, y) {
  return classifyTerrain2(sampleClimate(seed, x, y));
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
  const lake = type === "land" /* land */ && climate.elevation > SEA_LEVEL2 + 0.025 && climate.elevation < 0.56 && climate.moisture > 0.74 && randomAt(seed, x, y, 1821285621) > 0.94;
  if (lake) return packed | FLAG_LAKE;
  if (climate.elevation > 0.62) packed |= FLAG_HILL;
  const forestChance = Math.max(0, Math.min(0.58, (climate.moisture - 0.48) * 1.5));
  if (randomAt(seed, x, y, 668265263) < forestChance) {
    const treeCode = climate.temperature > 0.67 ? 1 : climate.temperature < 0.4 ? 2 : 3;
    packed |= FLAG_WOOD | treeCode << TREE_SHIFT;
  }
  return packed;
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
      const x = originX + localX;
      const y = originY + localY;
      tiles[localX * stride + localY] = options.world ? encodeTileInfo(generateToroidalWorldTile(seed, x, y, options.world.width, options.world.height)) : encodeTile(seed, x, y);
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

// src/world/generateVegetation.ts
var import_robust_point_in_polygon = __toESM(require_robust_pnp(), 1);

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
function isWater3(tile) {
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
  if (!tile || isWater3(tile)) return true;
  const apothem = size * 0.8660254;
  const waterByDirection = /* @__PURE__ */ new Map();
  const factorByDirection = /* @__PURE__ */ new Map();
  for (const direction of COAST_DIRECTIONS) {
    const neighbor = getNeighborCoords(tileX, tileY, direction);
    waterByDirection.set(direction, isWater3(getMapTile(map, neighbor.x, neighbor.y)));
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

// src/helpers/chunks.ts
var WORLD_CHUNK_SIZE = 12;
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
function getWorldChunkOrigin(chunkKey, size) {
  const [chunkX, chunkY] = chunkKey.split(",").map(Number);
  if (!Number.isInteger(chunkX) || !Number.isInteger(chunkY)) {
    throw new TypeError(`invalid world chunk key "${chunkKey}"`);
  }
  return getHexCenter(chunkX * WORLD_CHUNK_SIZE, chunkY * WORLD_CHUNK_SIZE, size);
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

// src/world/generateVegetation.ts
var WORLD_VEGETATION_FORMAT_VERSION = 1;
var LODS = [0, 1, 2];
var GRASS_DENSITY = [1, 0.38, 0.14];
var FOREST_DENSITY = [1, 0.5, 0.2];
function stableRandom(x, y, salt) {
  let value = Math.imul(x ^ 2654435769, 2246822507) ^ Math.imul(y ^ 3266489909, 668265263) ^ Math.imul(salt ^ 374761393, 2246822519);
  value ^= value >>> 16;
  value = Math.imul(value, 2146121005);
  value ^= value >>> 15;
  value = Math.imul(value, 2221713035);
  value ^= value >>> 16;
  return (value >>> 0) / 4294967296;
}
function assertOptions(options) {
  if (!options || typeof options !== "object" || !options.map || !Array.isArray(options.points)) {
    throw new TypeError("vegetation generation options are invalid");
  }
  if (!Number.isFinite(options.size) || options.size <= 0) {
    throw new RangeError("vegetation tile size must be a positive finite number");
  }
  for (const [name, value] of [
    ["grassDensity", options.grassDensity],
    ["treesPerTile", options.treesPerTile]
  ]) {
    if (!Number.isInteger(value) || value < 0) {
      throw new RangeError(`${name} must be a non-negative integer`);
    }
  }
  for (const point of options.points) {
    if (!Number.isSafeInteger(point?.x) || !Number.isSafeInteger(point?.y)) {
      throw new RangeError("vegetation points must use safe integer coordinates");
    }
  }
}
function grassTiles(map, points) {
  return points.filter(({ x, y }) => {
    const tile = getMapTile(map, x, y);
    return tile?.type === "land" /* land */ && !tile.city && !isLakeTile(tile);
  }).map((point) => ({ x: point.x, y: point.y }));
}
function buildGrassLod(map, chunkKey, tiles, lod, options, waterOptions) {
  const density = Math.max(1, Math.round(options.grassDensity * GRASS_DENSITY[lod]));
  const capacity = tiles.length * density;
  const offsets = new Float32Array(capacity * 2);
  const tileOffsets = new Float32Array(capacity * 2);
  const angles = new Float32Array(capacity);
  const scales = new Float32Array(capacity * 2);
  const phases = new Float32Array(capacity);
  const shades = new Float32Array(capacity);
  const ranges = new Uint32Array(tiles.length * 2);
  const polygon = HEXPolygon({ x: 0, y: 0 }, options.size * 0.8).map((point) => [point.x, point.y]);
  const origin = getWorldChunkOrigin(chunkKey, options.size);
  const heightVariation = options.grassHeightVariation ?? 0.4;
  let instance = 0;
  tiles.forEach((tile, tileIndex) => {
    const center = getHexCenter(tile.x, tile.y, options.size);
    const start = instance;
    const waterValue = waterEdgeValue(map, tile.x, tile.y);
    const seaMouthValue = riverSeaMouthEdgeValue(map, tile.x, tile.y);
    const lakeMouthValue = riverLakeMouthEdgeValue(map, tile.x, tile.y);
    const lakeNeighborValue = lakeNeighborEdgeValue(map, tile.x, tile.y);
    for (let i = 0; i < density; i += 1) {
      let lx = 0;
      let ly = 0;
      let attempts = 0;
      let valid = false;
      while (!valid && attempts < 20) {
        lx = (stableRandom(tile.x, tile.y, i * 97 + attempts * 2) * 2 - 1) * options.size;
        ly = (stableRandom(tile.x, tile.y, i * 97 + attempts * 2 + 1) * 2 - 1) * options.size;
        valid = (0, import_robust_point_in_polygon.default)(polygon, [lx, ly]) === -1 && !isInTileWater(
          lx,
          ly,
          waterValue,
          options.size,
          waterOptions,
          seaMouthValue,
          lakeMouthValue,
          lakeNeighborValue
        );
        attempts += 1;
      }
      if (!valid) continue;
      offsets[instance * 2] = center.x + lx - origin.x;
      offsets[instance * 2 + 1] = center.y + ly - origin.y;
      tileOffsets[instance * 2] = center.x - origin.x;
      tileOffsets[instance * 2 + 1] = center.y - origin.y;
      angles[instance] = stableRandom(tile.x, tile.y, i * 97 + 41) * Math.PI * 2;
      const heightJitter = 1 - heightVariation * 0.5 + stableRandom(tile.x, tile.y, i * 97 + 43) * heightVariation;
      scales[instance * 2] = options.grassBladeWidth * (0.8 + stableRandom(tile.x, tile.y, i * 97 + 47) * 0.4);
      scales[instance * 2 + 1] = options.grassBladeHeight * heightJitter;
      phases[instance] = stableRandom(tile.x, tile.y, i * 97 + 53) * Math.PI * 2;
      shades[instance] = 0.75 + stableRandom(tile.x, tile.y, i * 97 + 59) * 0.35;
      instance += 1;
    }
    ranges[tileIndex * 2] = start;
    ranges[tileIndex * 2 + 1] = instance - start;
  });
  return {
    lod,
    instanceCount: instance,
    tiles,
    ranges,
    offsets: offsets.slice(0, instance * 2),
    tileOffsets: tileOffsets.slice(0, instance * 2),
    angles: angles.slice(0, instance),
    scales: scales.slice(0, instance * 2),
    phases: phases.slice(0, instance),
    shades: shades.slice(0, instance)
  };
}
function buildGrass(map, options, waterOptions) {
  if (options.grassDensity <= 0) return [];
  return [...groupTilesByWorldChunk(grassTiles(map, options.points))].map(([chunkKey, tiles]) => ({
    chunkKey,
    lods: LODS.map((lod) => buildGrassLod(map, chunkKey, tiles, lod, options, waterOptions))
  }));
}
function writeTreeMatrix(target, index, angle, scale, x, z) {
  const offset = index * 16;
  const cosine = Math.cos(angle) * scale;
  const sine = Math.sin(angle) * scale;
  target.set([
    cosine,
    0,
    -sine,
    0,
    0,
    scale,
    0,
    0,
    sine,
    0,
    cosine,
    0,
    x,
    0,
    z,
    1
  ], offset);
}
function buildForestLod(map, chunkKey, tiles, lod, options, polygon, treeFootprint, waterOptions, coastOptions) {
  const density = Math.max(1, Math.round(options.treesPerTile * FOREST_DENSITY[lod]));
  const matrices = new Float32Array(tiles.length * density * 16);
  const ranges = new Uint32Array(tiles.length * 2);
  const origin = getWorldChunkOrigin(chunkKey, options.size);
  let instance = 0;
  tiles.forEach((tile, tileIndex) => {
    const center = getHexCenter(tile.x, tile.y, options.size);
    const placed = [];
    const start = instance;
    let attempts = 0;
    const waterValue = waterEdgeValue(map, tile.x, tile.y);
    const seaMouthValue = riverSeaMouthEdgeValue(map, tile.x, tile.y);
    const lakeMouthValue = riverLakeMouthEdgeValue(map, tile.x, tile.y);
    const lakeNeighborValue = lakeNeighborEdgeValue(map, tile.x, tile.y);
    while (placed.length < density && attempts < density * 20) {
      const salt = attempts++ * 17;
      const lx = (stableRandom(tile.x, tile.y, salt) * 2 - 1) * options.size;
      const ly = (stableRandom(tile.x, tile.y, salt + 1) * 2 - 1) * options.size;
      if ((0, import_robust_point_in_polygon.default)(polygon, [lx, ly]) !== -1) continue;
      if (isInTileWater(
        lx,
        ly,
        waterValue,
        options.size,
        waterOptions,
        seaMouthValue,
        lakeMouthValue,
        lakeNeighborValue
      )) continue;
      if (isInCoastalShore(
        map,
        tile.x,
        tile.y,
        lx,
        ly,
        center.x + lx,
        center.y + ly,
        options.size,
        coastOptions
      )) continue;
      if (isInLakeShore(
        map,
        tile.x,
        tile.y,
        lx,
        ly,
        center.x + lx,
        center.y + ly,
        options.size,
        coastOptions
      )) continue;
      if (placed.some((point) => Math.abs(point.x - lx) < treeFootprint && Math.abs(point.y - ly) < treeFootprint)) continue;
      placed.push({ x: lx, y: ly });
      const scale = options.treeScale * (0.8 + stableRandom(tile.x, tile.y, salt + 3) * 0.4);
      writeTreeMatrix(
        matrices,
        instance,
        stableRandom(tile.x, tile.y, salt + 5) * Math.PI * 2,
        scale,
        center.x + lx - origin.x,
        center.y + ly - origin.y
      );
      instance += 1;
    }
    ranges[tileIndex * 2] = start;
    ranges[tileIndex * 2 + 1] = instance - start;
  });
  return { lod, instanceCount: instance, tiles, ranges, matrices: matrices.slice(0, instance * 16) };
}
function buildForest(map, options, waterOptions, coastOptions) {
  if (options.treesPerTile <= 0) return [];
  const tilesByModel = /* @__PURE__ */ new Map();
  for (const point of options.points) {
    const tile = getMapTile(map, point.x, point.y);
    if (!tile?.modifiers?.includes("wood") || isLakeTile(tile)) continue;
    const modelPath = tile.treeModel ?? options.treeModel;
    const tiles = tilesByModel.get(modelPath) ?? [];
    tiles.push({ x: point.x, y: point.y });
    tilesByModel.set(modelPath, tiles);
  }
  const treeFootprint = Math.max(1, Math.round(options.size / 10));
  const polygon = HEXPolygon({ x: 0, y: 0 }, options.size - treeFootprint).map((point) => [point.x, point.y]);
  const layouts = [];
  for (const [modelPath, tiles] of tilesByModel) {
    for (const [chunkKey, chunkTiles] of groupTilesByWorldChunk(tiles)) {
      layouts.push({
        chunkKey,
        modelPath,
        lods: LODS.map((lod) => buildForestLod(
          map,
          chunkKey,
          chunkTiles,
          lod,
          options,
          polygon,
          treeFootprint,
          waterOptions,
          coastOptions
        ))
      });
    }
  }
  return layouts;
}
function generateWorldVegetation(options) {
  assertOptions(options);
  const map = options.map;
  const waterOptions = {
    riverWidth: options.riverWidth,
    riverBankWidth: options.riverBankWidth,
    riverCurvature: options.riverCurvature,
    lakeShoreWidth: options.lakeShoreWidth
  };
  const coastOptions = {
    beachWidth: options.beachWidth,
    lakeShoreWidth: options.lakeShoreWidth,
    waterCornerRounding: options.waterCornerRounding,
    coastCurvature: options.coastCurvature
  };
  return {
    version: WORLD_VEGETATION_FORMAT_VERSION,
    grass: buildGrass(map, options, waterOptions),
    forest: buildForest(map, options, waterOptions, coastOptions)
  };
}
function worldVegetationTransferables(layout) {
  const buffers = /* @__PURE__ */ new Set();
  for (const chunk of layout.grass) for (const lod of chunk.lods) {
    for (const array of [
      lod.ranges,
      lod.offsets,
      lod.tileOffsets,
      lod.angles,
      lod.scales,
      lod.phases,
      lod.shades
    ]) buffers.add(array.buffer);
  }
  for (const chunk of layout.forest) for (const lod of chunk.lods) {
    buffers.add(lod.ranges.buffer);
    buffers.add(lod.matrices.buffer);
  }
  return [...buffers];
}

// src/world/WorldDescriptor.ts
var WORLD_WORKER_PROTOCOL_VERSION = 1;

// src/world/generateWorld.worker.ts
var scope = globalThis;
scope.addEventListener("message", (event) => {
  try {
    const request = event.data;
    if (!request || request.protocolVersion !== WORLD_WORKER_PROTOCOL_VERSION || !Number.isSafeInteger(request.id) || !request.options || !["world", "chunk", "vegetation"].includes(request.type)) {
      throw new TypeError("World generator received an invalid request");
    }
    if (request.type === "chunk") {
      const chunk = generateWorldChunk(request.options);
      scope.postMessage({ protocolVersion: WORLD_WORKER_PROTOCOL_VERSION, id: request.id, chunk }, [chunk.tiles.buffer]);
    } else if (request.type === "vegetation") {
      const vegetation = generateWorldVegetation(request.options);
      scope.postMessage({
        protocolVersion: WORLD_WORKER_PROTOCOL_VERSION,
        id: request.id,
        vegetation
      }, worldVegetationTransferables(vegetation));
    } else {
      scope.postMessage({
        protocolVersion: WORLD_WORKER_PROTOCOL_VERSION,
        id: request.id,
        world: generateWorld(request.options)
      });
    }
  } catch (reason) {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    scope.postMessage({
      protocolVersion: WORLD_WORKER_PROTOCOL_VERSION,
      id: event.data?.id,
      error: { name: error.name, message: error.message, stack: error.stack }
    });
  }
});
//# sourceMappingURL=world-generator.worker.mjs.map