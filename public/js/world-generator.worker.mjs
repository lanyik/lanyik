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
function randomAt(seed, x, y, salt) {
  return randomGridValue((seed ^ salt) >>> 0, x, y);
}

// src/world/WorldGeneratorVersion.ts
var WORLD_GENERATOR_VERSION = 19;

// src/world/WorldStyleProfile.ts
var DEFAULT_WORLD_WATER_STYLE = Object.freeze({
  oceanScale: 1.4,
  oceanLevel: 0.46,
  riverSourceCellSize: 16,
  riverSourcesPerCell: 4,
  riverLength: 100,
  riverWarpScale: 0.08,
  riverWarpAmplitude: 3.75,
  riverBaseRadius: 1.75,
  riverHighFlowRadius: 4,
  riverHighFlowThreshold: 24
});
var RIVER_COURSE_STEP = 8;
var waterRange = (min, max, step) => Object.freeze({ min, max, step });
var WORLD_WATER_STYLE_RANGES = Object.freeze({
  oceanScale: waterRange(0.7, 2.8, 0.05),
  oceanLevel: waterRange(0.32, 0.6, 5e-3),
  riverSourceCellSize: waterRange(8, 32, 1),
  riverSourcesPerCell: waterRange(1, 8, 1),
  riverLength: waterRange(10, 300, 5),
  riverWarpScale: waterRange(0.02, 0.12, 1e-3),
  riverWarpAmplitude: waterRange(0, 3.9, 0.05),
  // Disjoint intervals keep every slider combination valid: tributary < main river.
  riverBaseRadius: waterRange(0.5, 2.75, 0.05),
  riverHighFlowRadius: waterRange(3, 6, 0.05),
  riverHighFlowThreshold: waterRange(2, 48, 1)
});
var field = (salt, openScale, toroidalScale, octaves, minimumToroidalCells) => Object.freeze({
  salt,
  openScale,
  toroidalScale,
  octaves,
  minimumToroidalCells
});
var oceanField = (scale) => field(
  374761393,
  35e-4 * scale,
  6e-3 * scale,
  3,
  Math.max(1, Math.round(2 * scale))
);
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
    // This field intentionally stays an order of magnitude broader than
    // terrain detail. It owns continent-scale coastlines, not local relief.
    ocean: oceanField(DEFAULT_WORLD_WATER_STYLE.oceanScale),
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
    boundedEdgeFalloff: 0.58,
    boundedCenterOceanLift: 0.18
  }),
  terrain: Object.freeze({
    seaLevel: 0.43,
    oceanLevel: DEFAULT_WORLD_WATER_STYLE.oceanLevel,
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
    pageSize: 128,
    maximumCachedPages: 16,
    courseStep: RIVER_COURSE_STEP,
    courseWarpScale: DEFAULT_WORLD_WATER_STYLE.riverWarpScale,
    courseWarpAmplitude: DEFAULT_WORLD_WATER_STYLE.riverWarpAmplitude,
    courseWarpOctaves: 2,
    courseWarpSalt: 461845907,
    sourceCellSize: DEFAULT_WORLD_WATER_STYLE.riverSourceCellSize,
    sourcesPerCell: DEFAULT_WORLD_WATER_STYLE.riverSourcesPerCell,
    sourceSpawnChance: 1,
    sourceMinimumElevation: 0.46,
    sourceMaximumElevation: 0.82,
    sourceElevationTransition: 0.04,
    sourceMinimumMoisture: 0.2,
    sourceMoistureFloor: 0.7,
    minimumCourseLength: 3,
    maximumCourseLength: 72,
    courseLengthMultiplier: DEFAULT_WORLD_WATER_STYLE.riverLength / 100,
    baseCourseRadius: DEFAULT_WORLD_WATER_STYLE.riverBaseRadius,
    highFlowCourseRadius: DEFAULT_WORLD_WATER_STYLE.riverHighFlowRadius,
    highFlowThreshold: DEFAULT_WORLD_WATER_STYLE.riverHighFlowThreshold,
    mouthWideningDistance: 24,
    mouthWidthMultiplier: 1.6,
    potentialOceanWeight: 0.9,
    potentialElevationWeight: 0.08,
    potentialValleyWeight: 0.03,
    potentialMoistureWeight: 0.015,
    potentialJitter: 5e-4,
    sourceSalt: 1013904242,
    flowSalt: 1542469173
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
    const key = path ? `${path}.${name}` : name;
    if (typeof candidate === "number") finite(key, candidate);
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
    "forestPatch",
    "ocean"
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
    "boundedEdgeFalloff",
    "boundedCenterOceanLift"
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
    "oceanLevel",
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
  if (!Number.isSafeInteger(profile.vegetation.placementSalt)) {
    throw new RangeError("vegetation placement salt must be a safe integer");
  }
  const rivers = profile.rivers;
  for (const name of [
    "pageSize",
    "maximumCachedPages",
    "courseStep",
    "courseWarpOctaves",
    "sourceCellSize",
    "sourcesPerCell",
    "minimumCourseLength",
    "maximumCourseLength",
    "highFlowThreshold"
  ]) {
    if (!Number.isSafeInteger(rivers[name]) || rivers[name] <= 0) {
      throw new RangeError(`rivers.${name} must be a positive safe integer`);
    }
  }
  for (const name of [
    "courseWarpScale",
    "sourceElevationTransition",
    "potentialOceanWeight",
    "potentialElevationWeight",
    "potentialValleyWeight",
    "potentialMoistureWeight",
    "potentialJitter",
    "highFlowCourseRadius",
    "mouthWideningDistance",
    "mouthWidthMultiplier"
  ]) positive(`rivers.${name}`, rivers[name]);
  nonNegative("rivers.courseWarpAmplitude", rivers.courseWarpAmplitude);
  nonNegative("rivers.baseCourseRadius", rivers.baseCourseRadius);
  positive("rivers.courseLengthMultiplier", rivers.courseLengthMultiplier);
  if (rivers.courseLengthMultiplier > WORLD_WATER_STYLE_RANGES.riverLength.max / 100) {
    throw new RangeError("river course length multiplier exceeds the authoring limit");
  }
  if (!(rivers.minimumCourseLength < rivers.maximumCourseLength)) {
    throw new RangeError("river course length range must be ordered");
  }
  if (rivers.mouthWidthMultiplier < 1) {
    throw new RangeError("river mouth width multiplier must be at least one");
  }
  for (const name of [
    "sourceSpawnChance",
    "sourceMinimumElevation",
    "sourceMaximumElevation",
    "sourceMinimumMoisture",
    "sourceMoistureFloor"
  ]) unitInterval(`rivers.${name}`, rivers[name]);
  if (!(rivers.sourceMinimumElevation + rivers.sourceElevationTransition < rivers.sourceMaximumElevation - rivers.sourceElevationTransition)) {
    throw new RangeError("river source elevation range must contain both transition bands");
  }
  if (!(rivers.courseWarpAmplitude < rivers.courseStep / 2)) {
    throw new RangeError("river course warp amplitude must stay below half the course step");
  }
  if (!(rivers.baseCourseRadius < rivers.highFlowCourseRadius) || rivers.highFlowThreshold <= 1) {
    throw new RangeError("river flow width thresholds must be ordered");
  }
  if (!Number.isSafeInteger(rivers.courseStep * rivers.maximumCourseLength)) {
    throw new RangeError("river maximum world reach must be a safe integer");
  }
  if (!Number.isSafeInteger(rivers.courseWarpSalt) || !Number.isSafeInteger(rivers.sourceSalt) || !Number.isSafeInteger(rivers.flowSalt)) {
    throw new RangeError("river salts must be safe integers");
  }
}
assertWorldStyleProfile(WORLD_STYLE_PROFILE);
function assertWorldWaterGenerationStyle(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("world water generation style must be an object");
  }
  const style = value;
  for (const name of Object.keys(WORLD_WATER_STYLE_RANGES)) {
    const number = finite(`waterStyle.${name}`, style[name]);
    const { min, max, step } = WORLD_WATER_STYLE_RANGES[name];
    if (number < min || number > max) {
      throw new RangeError(`waterStyle.${name} must be between ${min} and ${max}`);
    }
    if (step >= 1 && (!Number.isSafeInteger(number) || (number - min) % step !== 0)) {
      throw new RangeError(`waterStyle.${name} must be an integer in increments of ${step} from ${min}`);
    }
  }
}
function normalizeWorldWaterGenerationStyle(value = DEFAULT_WORLD_WATER_STYLE) {
  assertWorldWaterGenerationStyle(value);
  return Object.freeze({
    oceanScale: value.oceanScale,
    oceanLevel: value.oceanLevel,
    riverSourceCellSize: value.riverSourceCellSize,
    riverSourcesPerCell: value.riverSourcesPerCell,
    riverLength: value.riverLength,
    riverWarpScale: value.riverWarpScale,
    riverWarpAmplitude: value.riverWarpAmplitude,
    riverBaseRadius: value.riverBaseRadius,
    riverHighFlowRadius: value.riverHighFlowRadius,
    riverHighFlowThreshold: value.riverHighFlowThreshold
  });
}
function serializeWorldWaterGenerationStyle(value) {
  assertWorldWaterGenerationStyle(value);
  return JSON.stringify([
    value.oceanScale,
    value.oceanLevel,
    value.riverSourceCellSize,
    value.riverSourcesPerCell,
    value.riverLength,
    value.riverWarpScale,
    value.riverWarpAmplitude,
    value.riverBaseRadius,
    value.riverHighFlowRadius,
    value.riverHighFlowThreshold
  ]);
}
function worldWaterGenerationStylesEqual(first, second) {
  assertWorldWaterGenerationStyle(first);
  assertWorldWaterGenerationStyle(second);
  return first.oceanScale === second.oceanScale && first.oceanLevel === second.oceanLevel && first.riverSourceCellSize === second.riverSourceCellSize && first.riverSourcesPerCell === second.riverSourcesPerCell && first.riverLength === second.riverLength && first.riverWarpScale === second.riverWarpScale && first.riverWarpAmplitude === second.riverWarpAmplitude && first.riverBaseRadius === second.riverBaseRadius && first.riverHighFlowRadius === second.riverHighFlowRadius && first.riverHighFlowThreshold === second.riverHighFlowThreshold;
}
function createWorldStyleProfile(waterStyle = DEFAULT_WORLD_WATER_STYLE) {
  const style = normalizeWorldWaterGenerationStyle(waterStyle);
  const profile = Object.freeze({
    ...WORLD_STYLE_PROFILE,
    fields: Object.freeze({
      ...WORLD_STYLE_PROFILE.fields,
      ocean: oceanField(style.oceanScale)
    }),
    terrain: Object.freeze({
      ...WORLD_STYLE_PROFILE.terrain,
      oceanLevel: style.oceanLevel
    }),
    rivers: Object.freeze({
      ...WORLD_STYLE_PROFILE.rivers,
      sourceCellSize: style.riverSourceCellSize,
      sourcesPerCell: style.riverSourcesPerCell,
      courseLengthMultiplier: style.riverLength / 100,
      courseWarpScale: style.riverWarpScale,
      courseWarpAmplitude: style.riverWarpAmplitude,
      baseCourseRadius: style.riverBaseRadius,
      highFlowCourseRadius: style.riverHighFlowRadius,
      highFlowThreshold: style.riverHighFlowThreshold
    })
  });
  assertWorldStyleProfile(profile);
  return profile;
}
assertWorldWaterGenerationStyle(DEFAULT_WORLD_WATER_STYLE);

// src/world/LandformSampler.ts
var LANDFORM_SEA_LEVEL = WORLD_STYLE_PROFILE.terrain.seaLevel;
var clamp01 = (value) => Math.max(0, Math.min(1, value));
var smoothstep = (edge0, edge1, value) => {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};
function assertDimension(name, value) {
  if (!Number.isSafeInteger(value) || value < 2) {
    throw new RangeError(`landform ${name} must be a safe integer >= 2`);
  }
}
function resolveDomain(domain) {
  const resolved = domain ?? { topology: "infinite" };
  if (resolved.topology !== "infinite" && resolved.topology !== "bounded" && resolved.topology !== "toroidal") {
    throw new TypeError("landform topology must be infinite, bounded or toroidal");
  }
  if (resolved.topology !== "infinite") {
    assertDimension("width", resolved.width);
    assertDimension("height", resolved.height);
  }
  return Object.freeze({ ...resolved });
}
function composeSample(continent, detail, ridgeNoise, valleyNoise, roughness, moistureNoise, temperatureNoise, forestPatch, oceanNoise, latitude, edgeFalloff, profile) {
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
    ocean: oceanNoise - edgeFalloff
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
  const ocean = open(fields.ocean, x, y);
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
      ocean,
      void 0,
      0,
      profile
    );
  }
  const nx = x / (domain.width - 1) * 2 - 1;
  const ny = y / (domain.height - 1) * 2 - 1;
  const edge = Math.max(Math.abs(nx), Math.abs(ny));
  const boundedOcean = ocean + (1 - edge * edge) * fields.boundedCenterOceanLift;
  return composeSample(
    continent,
    detail,
    ridgeNoise,
    valleyNoise,
    rough,
    moisture,
    temperature,
    forestPatch,
    boundedOcean,
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
  const ocean = periodic(fields.ocean, nx, ny);
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
    ocean,
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

// src/world/hexRaster.ts
var SQRT_3 = 1.7320508075688772;
var positiveModulo2 = (value, period) => (value % period + period) % period;
function worldOffsetToAxial(point) {
  const parity = positiveModulo2(point.x, 2);
  return { x: point.x, y: point.y - (point.x + parity) / 2 };
}
function worldAxialToOffset(point) {
  const parity = positiveModulo2(point.x, 2);
  return { x: point.x, y: point.y + (point.x + parity) / 2 };
}
function cubeRound(x, y, z) {
  let roundedX = Math.round(x);
  let roundedY = Math.round(y);
  let roundedZ = Math.round(z);
  const deltaX = Math.abs(roundedX - x);
  const deltaY = Math.abs(roundedY - y);
  const deltaZ = Math.abs(roundedZ - z);
  if (deltaX > deltaY && deltaX > deltaZ) roundedX = -roundedY - roundedZ;
  else if (deltaY > deltaZ) roundedY = -roundedX - roundedZ;
  else roundedZ = -roundedX - roundedY;
  return worldAxialToOffset({ x: roundedX, y: roundedZ });
}
function rasterizeHexLine(from, to) {
  const first = worldOffsetToAxial(from);
  const second = worldOffsetToAxial(to);
  const firstY = -first.x - first.y;
  const secondY = -second.x - second.y;
  const distance = Math.max(
    Math.abs(first.x - second.x),
    Math.abs(firstY - secondY),
    Math.abs(first.y - second.y)
  );
  const result = [];
  for (let index = 0; index <= distance; index += 1) {
    const amount = distance === 0 ? 0 : index / distance;
    result.push(cubeRound(
      first.x + (second.x - first.x) * amount,
      firstY + (secondY - firstY) * amount,
      first.y + (second.y - first.y) * amount
    ));
  }
  return result;
}
function renderedCenterY(x, y) {
  return (y + (x % 2 === 0 ? 0.5 : 0)) * SQRT_3;
}
var renderedPoint = (point) => ({
  x: point.x * 1.5,
  y: renderedCenterY(point.x, point.y)
});
function renderedPointToHex(point) {
  const q = point.x / 1.5;
  const r = point.y / SQRT_3 - q / 2 - 0.5;
  return cubeRound(q, -q - r, r);
}
function createRiverReach(from, to, downstream, startsAtSource = true) {
  const first = renderedPoint(from);
  const corner = renderedPoint(to);
  const next = downstream ? renderedPoint(downstream) : corner;
  const start = startsAtSource ? first : { x: (first.x + corner.x) / 2, y: (first.y + corner.y) / 2 };
  const end = downstream ? { x: (corner.x + next.x) / 2, y: (corner.y + next.y) / 2 } : corner;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const control = { x: corner.x - start.x, y: corner.y - start.y };
  const secondDerivative = 2 * Math.hypot(dx - 2 * control.x, dy - 2 * control.y);
  const projection = dx * control.x + dy * control.y;
  const straight = (dx !== 0 || dy !== 0 || control.x === 0 && control.y === 0) && Math.abs(dx * control.y - dy * control.x) < 1e-9 && projection >= 0 && projection <= dx * dx + dy * dy;
  const segments = straight ? 1 : Math.max(1, Math.ceil(Math.sqrt(secondDerivative / (8 * SQRT_3 / 16))));
  if (segments > 32) throw new RangeError("river reach exceeds the bounded curve tessellation budget");
  const samples = [{ ...start, distance: 0 }];
  let length = 0;
  for (let index = 1; index <= segments; index += 1) {
    const t = index / segments;
    const u = 1 - t;
    const point = index === segments ? end : {
      x: start.x + 2 * u * t * control.x + t * t * dx,
      y: start.y + 2 * u * t * control.y + t * t * dy
    };
    const previous = samples[samples.length - 1];
    length += Math.hypot(point.x - previous.x, point.y - previous.y) / SQRT_3;
    samples.push({ ...point, distance: length });
  }
  return { samples, length };
}
function trimRiverReachStart(reach, distance) {
  if (!Number.isFinite(distance) || distance < 0 || distance > reach.length) {
    throw new RangeError("river trim distance must stay within its arc length");
  }
  if (distance === 0) return reach;
  const endIndex = reach.samples.findIndex((sample) => sample.distance >= distance);
  const end = reach.samples[endIndex];
  const start = reach.samples[endIndex - 1];
  const t = (distance - start.distance) / (end.distance - start.distance);
  const samples = [{
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t,
    distance: 0
  }];
  for (let index = endIndex; index < reach.samples.length; index += 1) {
    const sample = reach.samples[index];
    if (sample.distance > distance) samples.push({ ...sample, distance: sample.distance - distance });
  }
  return { samples, length: reach.length - distance };
}
function forEachHexRiverReach(reach, fromRadius, toRadius, visit) {
  if (!Number.isFinite(fromRadius) || fromRadius < 0 || !Number.isFinite(toRadius) || toRadius < 0) {
    throw new RangeError("river reach radii must be finite and non-negative");
  }
  const radius = Math.max(fromRadius, toRadius);
  const spine = /* @__PURE__ */ new Map();
  if (Math.min(fromRadius, toRadius) < 1) {
    for (let index = 1; index < reach.samples.length; index += 1) {
      for (const point of rasterizeHexLine(
        renderedPointToHex(reach.samples[index - 1]),
        renderedPointToHex(reach.samples[index])
      )) spine.set(`${point.x},${point.y}`, point);
    }
  }
  if (radius === 0) {
    spine.forEach(visit);
    return;
  }
  const segments = reach.samples.slice(1).map((end, index) => {
    const start = reach.samples[index];
    const startFraction = reach.length === 0 ? 0 : start.distance / reach.length;
    const endFraction = reach.length === 0 ? 1 : end.distance / reach.length;
    const startRadius = (fromRadius + (toRadius - fromRadius) * startFraction) * SQRT_3;
    const radiusDelta = (toRadius - fromRadius) * (endFraction - startFraction) * SQRT_3;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const quadratic = dx * dx + dy * dy - radiusDelta * radiusDelta;
    return { start, dx, dy, startRadius, radiusDelta, quadratic };
  });
  const padding = Math.ceil(radius * SQRT_3 / 1.5) + 1;
  const minimumX = Math.floor(Math.min(...reach.samples.map((point) => point.x)) / 1.5) - padding;
  const maximumX = Math.ceil(Math.max(...reach.samples.map((point) => point.x)) / 1.5) + padding;
  const minimumY = Math.floor(Math.min(...reach.samples.map((point) => point.y)) / SQRT_3) - padding;
  const maximumY = Math.ceil(Math.max(...reach.samples.map((point) => point.y)) / SQRT_3) + padding;
  for (let x = minimumX; x <= maximumX; x += 1) {
    const candidateWorldX = x * 1.5;
    for (let y = minimumY; y <= maximumY; y += 1) {
      const candidateWorldY = renderedCenterY(x, y);
      let inside = spine.size > 0 && spine.has(`${x},${y}`);
      for (const segment of segments) {
        if (inside) break;
        const { start, dx, dy, startRadius, radiusDelta, quadratic } = segment;
        const deltaX = candidateWorldX - start.x;
        const deltaY = candidateWorldY - start.y;
        const linear = deltaX * dx + deltaY * dy + startRadius * radiusDelta;
        const constant = deltaX * deltaX + deltaY * deltaY - startRadius * startRadius;
        const amount = quadratic > 0 ? Math.max(0, Math.min(1, linear / quadratic)) : 0;
        const distance = quadratic > 0 ? constant - 2 * linear * amount + quadratic * amount * amount : Math.min(constant, constant - 2 * linear + quadratic);
        inside = distance <= 1e-9;
      }
      if (inside) visit({ x, y });
    }
  }
}

// src/world/WorldWaterSampler.ts
var UINT32_RANGE = 4294967296;
var OVERVIEW_PAGE_SIZE_MULTIPLIER = 4;
var MAX_OVERVIEW_PAGE_AREA_OVERHEAD = 4;
var MAX_RIVER_BATCH_SIZE = 2048;
var AXIAL_NEIGHBORS = Object.freeze([
  Object.freeze({ x: 1, y: 0 }),
  Object.freeze({ x: 0, y: -1 }),
  Object.freeze({ x: -1, y: 0 }),
  Object.freeze({ x: -1, y: 1 }),
  Object.freeze({ x: 0, y: 1 }),
  Object.freeze({ x: 1, y: -1 })
]);
var positiveModulo3 = (value, period) => (value % period + period) % period;
var clamp012 = (value) => Math.max(0, Math.min(1, value));
var smoothstep2 = (edge0, edge1, value) => {
  const amount = clamp012((value - edge0) / (edge1 - edge0));
  return amount * amount * (3 - 2 * amount);
};
var pointKey = (point) => `${point.x},${point.y}`;
var bitArrayLength = (size) => Math.ceil(size / 8);
var hasBit = (bits, index) => (bits[Math.floor(index / 8)] & 1 << index % 8) !== 0;
var setBit = (bits, index) => {
  const offset = Math.floor(index / 8);
  bits[offset] |= 1 << index % 8;
};
function visitColumnBits(bits, column, start, end, visit) {
  const first = column + start;
  const stop = column + end;
  const lastByte = stop - 1 >>> 3;
  for (let byte = first >>> 3; byte <= lastByte; byte += 1) {
    let value = bits[byte];
    if (byte === first >>> 3) value &= 255 << (first & 7);
    if (byte === lastByte && (stop & 7) !== 0) value &= (1 << (stop & 7)) - 1;
    while (value !== 0) {
      const bit = 31 - Math.clz32(value & -value);
      visit(byte * 8 + bit - column);
      value &= value - 1;
    }
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
function sourceKey(seed, cellX, cellY, slot, salt) {
  return mix32(
    seed ^ salt ^ Math.imul(cellX, 1663821227) ^ Math.imul(cellY, 2232777461) ^ Math.imul(slot, 2654435761)
  );
}
function randomForSource(seed, key, salt) {
  return mix32(seed ^ key ^ Math.imul(salt, 668265261)) / UINT32_RANGE;
}
function assertExtent(originX, originY, width, height) {
  if (!Number.isSafeInteger(originX) || !Number.isSafeInteger(originY)) {
    throw new RangeError("water extent origins must be safe integers");
  }
  if (!Number.isSafeInteger(width) || width <= 0 || !Number.isSafeInteger(height) || height <= 0) {
    throw new RangeError("water extent dimensions must be positive safe integers");
  }
  if (!Number.isSafeInteger(originX + width - 1) || !Number.isSafeInteger(originY + height - 1) || !Number.isSafeInteger(width * height)) {
    throw new RangeError("water extent exceeds safe integer coordinates");
  }
}
var DrainageWorldWaterSampler = class {
  constructor(numericSeed, domain, profile) {
    this.numericSeed = numericSeed;
    this.domain = domain;
    this.profile = profile;
    this.pages = /* @__PURE__ */ new Map();
    this.overviewPages = /* @__PURE__ */ new Map();
    this.tilePageBuilds = 0;
    this.tilePageHits = 0;
    this.overviewPageBuilds = 0;
    this.overviewPageHits = 0;
    this.directExtentRasterizations = 0;
    this.maximumRasterizedTiles = 0;
    this.courseStep = this.resolveCourseStep();
  }
  get stats() {
    return {
      cachedTilePages: this.pages.size,
      cachedOverviewPages: this.overviewPages.size,
      tilePageBuilds: this.tilePageBuilds,
      tilePageHits: this.tilePageHits,
      overviewPageBuilds: this.overviewPageBuilds,
      overviewPageHits: this.overviewPageHits,
      directExtentRasterizations: this.directExtentRasterizations,
      cachedRiverBytes: [...this.pages.values(), ...this.overviewPages.values()].reduce((bytes, page) => bytes + page.riverBits.byteLength, this.toroidalMask?.byteLength ?? 0),
      maximumRasterizedTiles: this.maximumRasterizedTiles
    };
  }
  isRiverTile(x, y, sampleAt) {
    if (this.domain.topology === "toroidal") {
      const mask = this.toroidalMask ?? (this.toroidalMask = this.buildToroidalMask(sampleAt));
      const canonicalX = positiveModulo3(x, this.domain.width);
      const canonicalY = positiveModulo3(y, this.domain.height);
      return hasBit(mask, canonicalX * this.domain.height + canonicalY);
    }
    const pageSize = this.profile.rivers.pageSize;
    const pageX = Math.floor(x / pageSize);
    const pageY = Math.floor(y / pageSize);
    const page = this.pageFor(this.pages, pageX, pageY, pageSize, sampleAt, false);
    const localX = x - pageX * pageSize;
    const localY = y - pageY * pageSize;
    return hasBit(page.riverBits, localX * pageSize + localY);
  }
  forEachRiverTile(originX, originY, width, height, sampleAt, visit) {
    const batches = this.riverTileBatches(originX, originY, width, height, sampleAt, visit);
    while (!batches.next().done) {
    }
  }
  *riverTileBatches(originX, originY, width, height, sampleAt, visit) {
    assertExtent(originX, originY, width, height);
    if (this.domain.topology === "toroidal") {
      const mask = this.toroidalMask ?? (this.toroidalMask = this.buildToroidalMask(sampleAt));
      for (let x = originX; x < originX + width; x += 1) {
        const canonicalX = positiveModulo3(x, this.domain.width);
        for (let y = originY; y < originY + height; ) {
          const canonicalY = positiveModulo3(y, this.domain.height);
          const count = Math.min(this.domain.height - canonicalY, originY + height - y);
          const offset = y - canonicalY;
          visitColumnBits(
            mask,
            canonicalX * this.domain.height,
            canonicalY,
            canonicalY + count,
            (localY) => visit(x, offset + localY)
          );
          y += count;
        }
        if ((x - originX + 1) % 128 === 0) yield;
      }
      yield;
      return;
    }
    const pageSize = Math.max(width, height) > MAX_RIVER_BATCH_SIZE && Math.min(width, height) >= 512 ? MAX_RIVER_BATCH_SIZE : Math.min(MAX_RIVER_BATCH_SIZE, this.profile.rivers.pageSize * OVERVIEW_PAGE_SIZE_MULTIPLIER);
    if (this.shouldUseOverviewPages(originX, originY, width, height, pageSize)) {
      yield* this.visitOverviewPages(originX, originY, width, height, pageSize, sampleAt, visit);
      return;
    }
    for (let x = originX; x < originX + width; x += MAX_RIVER_BATCH_SIZE) {
      for (let y = originY; y < originY + height; y += MAX_RIVER_BATCH_SIZE) {
        this.directExtentRasterizations += 1;
        this.rasterizeCourses(
          x,
          y,
          Math.min(MAX_RIVER_BATCH_SIZE, originX + width - x),
          Math.min(MAX_RIVER_BATCH_SIZE, originY + height - y),
          sampleAt,
          visit
        );
        yield;
      }
    }
  }
  shouldUseOverviewPages(originX, originY, width, height, pageSize) {
    const firstPageX = Math.floor(originX / pageSize);
    const lastPageX = Math.floor((originX + width - 1) / pageSize);
    const firstPageY = Math.floor(originY / pageSize);
    const lastPageY = Math.floor((originY + height - 1) / pageSize);
    const pageCount = (lastPageX - firstPageX + 1) * (lastPageY - firstPageY + 1);
    return pageCount * pageSize * pageSize <= width * height * MAX_OVERVIEW_PAGE_AREA_OVERHEAD;
  }
  *visitOverviewPages(originX, originY, width, height, pageSize, sampleAt, visit) {
    const firstPageX = Math.floor(originX / pageSize);
    const lastPageX = Math.floor((originX + width - 1) / pageSize);
    const firstPageY = Math.floor(originY / pageSize);
    const lastPageY = Math.floor((originY + height - 1) / pageSize);
    const endX = originX + width;
    const endY = originY + height;
    for (let pageX = firstPageX; pageX <= lastPageX; pageX += 1) {
      const pageOriginX = pageX * pageSize;
      const startX = Math.max(originX, pageOriginX);
      const stopX = Math.min(endX, pageOriginX + pageSize);
      for (let pageY = firstPageY; pageY <= lastPageY; pageY += 1) {
        const pageOriginY = pageY * pageSize;
        const startY = Math.max(originY, pageOriginY);
        const stopY = Math.min(endY, pageOriginY + pageSize);
        const page = this.pageFor(
          this.overviewPages,
          pageX,
          pageY,
          pageSize,
          sampleAt,
          true
        );
        for (let x = startX; x < stopX; x += 1) {
          const column = (x - pageOriginX) * pageSize;
          visitColumnBits(
            page.riverBits,
            column,
            startY - pageOriginY,
            stopY - pageOriginY,
            (localY) => visit(x, pageOriginY + localY)
          );
        }
        yield;
      }
    }
  }
  pageFor(cache, pageX, pageY, pageSize, sampleAt, overview) {
    const key = `${pageSize}:${pageX},${pageY}`;
    let page = cache.get(key);
    if (page) {
      cache.delete(key);
      cache.set(key, page);
      if (overview) this.overviewPageHits += 1;
      else this.tilePageHits += 1;
      return page;
    }
    page = this.buildPage(pageX, pageY, pageSize, sampleAt);
    cache.set(key, page);
    if (overview) this.overviewPageBuilds += 1;
    else this.tilePageBuilds += 1;
    while (cache.size > this.profile.rivers.maximumCachedPages) {
      const oldest = cache.keys().next().value;
      if (oldest === void 0) break;
      cache.delete(oldest);
    }
    return page;
  }
  resolveCourseStep() {
    const requested = this.profile.rivers.courseStep;
    if (this.domain.topology !== "toroidal") return requested;
    for (let step = requested; step >= 1; step -= 1) {
      if (this.domain.width % step === 0 && this.domain.height % step === 0 && this.domain.width / step % 2 === 0) return step;
    }
    return 1;
  }
  courseToBaseWorld(point) {
    return worldAxialToOffset({ x: point.x * this.courseStep, y: point.y * this.courseStep });
  }
  courseWarpAt(base, salt) {
    const rivers = this.profile.rivers;
    if (this.domain.topology === "toroidal") {
      const x = positiveModulo3(base.x, this.domain.width);
      const y = positiveModulo3(base.y, this.domain.height);
      return periodicFractalNoise2D(
        this.numericSeed ^ salt,
        x / this.domain.width,
        y / this.domain.height,
        Math.max(1, Math.round(this.domain.width * rivers.courseWarpScale)),
        Math.max(1, Math.round(this.domain.height * rivers.courseWarpScale)),
        rivers.courseWarpOctaves
      );
    }
    return fractalNoise2D(
      this.numericSeed ^ salt,
      base.x * rivers.courseWarpScale,
      base.y * rivers.courseWarpScale,
      rivers.courseWarpOctaves
    );
  }
  courseToWorld(point) {
    const base = this.courseToBaseWorld(point);
    const rivers = this.profile.rivers;
    const amplitude = rivers.courseWarpAmplitude * this.courseStep / rivers.courseStep;
    if (amplitude === 0) return base;
    return {
      x: base.x + Math.round((this.courseWarpAt(base, rivers.courseWarpSalt) * 2 - 1) * amplitude),
      y: base.y + Math.round(
        (this.courseWarpAt(base, rivers.courseWarpSalt ^ 2654435769) * 2 - 1) * amplitude
      )
    };
  }
  normalizeWorld(point) {
    if (this.domain.topology === "infinite") return point;
    if (this.domain.topology === "toroidal") {
      return {
        x: positiveModulo3(point.x, this.domain.width),
        y: positiveModulo3(point.y, this.domain.height)
      };
    }
    return point.x >= 0 && point.x < this.domain.width && point.y >= 0 && point.y < this.domain.height ? point : void 0;
  }
  canonicalCourseKey(point) {
    const base = this.courseToBaseWorld(point);
    return pointKey(this.normalizeWorld(base) ?? base);
  }
  sourceSuitability(sample) {
    if (sample.baseTerrain === "sea" /* sea */ || sample.baseTerrain === "coastal" /* coastal */ || sample.baseTerrain === "mountain" /* mountain */ || sample.baseTerrain === "snow" /* snow */) return 0;
    const rivers = this.profile.rivers;
    const elevation = smoothstep2(
      rivers.sourceMinimumElevation,
      rivers.sourceMinimumElevation + rivers.sourceElevationTransition,
      sample.landform.elevation
    ) * (1 - smoothstep2(
      rivers.sourceMaximumElevation - rivers.sourceElevationTransition,
      rivers.sourceMaximumElevation,
      sample.landform.elevation
    ));
    const moisture = rivers.sourceMoistureFloor + (1 - rivers.sourceMoistureFloor) * smoothstep2(rivers.sourceMinimumMoisture, 1, sample.landform.moisture);
    return clamp012(elevation * moisture);
  }
  drainagePotential(point, sample) {
    if (sample.baseTerrain === "sea" /* sea */ || sample.baseTerrain === "coastal" /* coastal */) return -1;
    if (sample.baseTerrain === "mountain" /* mountain */ || sample.baseTerrain === "snow" /* snow */) return Infinity;
    const rivers = this.profile.rivers;
    const unwrappedWorld = this.courseToWorld(point);
    const world = this.normalizeWorld(unwrappedWorld) ?? unwrappedWorld;
    const jitter = (randomAt(this.numericSeed, world.x, world.y, rivers.flowSalt) - 0.5) * rivers.potentialJitter;
    return sample.landform.ocean * rivers.potentialOceanWeight + sample.landform.elevation * rivers.potentialElevationWeight - sample.landform.valley * rivers.potentialValleyWeight - sample.landform.moisture * rivers.potentialMoistureWeight + jitter;
  }
  drainageNode(point, sampleAt, cache) {
    const key = this.canonicalCourseKey(point);
    const cached = cache.get(key);
    if (cached) return cached;
    const world = this.courseToWorld(point);
    const sample = sampleAt(world.x, world.y);
    if (!sample) return void 0;
    const node = {
      sample,
      potential: this.drainagePotential(point, sample),
      nextResolved: false
    };
    cache.set(key, node);
    return node;
  }
  nextCoursePoint(point, node, sampleAt, cache) {
    if (node.nextResolved) {
      return node.nextDelta ? { x: point.x + node.nextDelta.x, y: point.y + node.nextDelta.y } : void 0;
    }
    let bestDelta;
    let bestPotential = node.potential;
    for (const delta of AXIAL_NEIGHBORS) {
      const candidate = { x: point.x + delta.x, y: point.y + delta.y };
      const adjacent = this.drainageNode(candidate, sampleAt, cache);
      if (adjacent && adjacent.potential < bestPotential) {
        bestDelta = delta;
        bestPotential = adjacent.potential;
      }
    }
    node.nextResolved = true;
    node.nextDelta = bestDelta;
    return bestDelta ? { x: point.x + bestDelta.x, y: point.y + bestDelta.y } : void 0;
  }
  traceCourse(source, sampleAt, cache, upstreamCache) {
    const rivers = this.profile.rivers;
    const points = [];
    const visited = /* @__PURE__ */ new Set();
    let current = source;
    let reachedSea = false;
    for (let index = 0; index < rivers.maximumCourseLength; index += 1) {
      const key = this.canonicalCourseKey(current);
      if (visited.has(key)) break;
      visited.add(key);
      const node = this.drainageNode(current, sampleAt, cache);
      if (!node) break;
      points.push(current);
      if (node.sample.baseTerrain === "sea" /* sea */ || node.sample.baseTerrain === "coastal" /* coastal */) {
        reachedSea = true;
        break;
      }
      const next = this.nextCoursePoint(current, node, sampleAt, cache);
      if (!next) break;
      current = next;
    }
    if (!reachedSea || points.length < rivers.minimumCourseLength) return void 0;
    while (points.length < rivers.maximumCourseLength) {
      const head = points[0];
      const branch = this.longestUpstreamBranch(
        head,
        rivers.maximumCourseLength - points.length,
        sampleAt,
        cache,
        upstreamCache
      );
      if (!branch.delta) break;
      points.unshift({ x: head.x + branch.delta.x, y: head.y + branch.delta.y });
    }
    return { points, anchor: source };
  }
  longestUpstreamBranch(point, remaining, sampleAt, drainage, cache) {
    if (remaining === 0) return { length: 0 };
    const pointId = this.canonicalCourseKey(point);
    const key = `${pointId}:${remaining}`;
    const cached = cache.get(key);
    if (cached) return cached;
    const node = this.drainageNode(point, sampleAt, drainage);
    const world = worldOffsetToAxial(this.courseToWorld(point));
    let best = { length: 0 };
    for (const delta of AXIAL_NEIGHBORS) {
      const candidate = { x: point.x + delta.x, y: point.y + delta.y };
      const adjacent = this.drainageNode(candidate, sampleAt, drainage);
      if (!adjacent || !Number.isFinite(adjacent.potential) || adjacent.potential <= node.potential) continue;
      const next = this.nextCoursePoint(candidate, adjacent, sampleAt, drainage);
      if (!next || this.canonicalCourseKey(next) !== pointId) continue;
      const upstream = this.longestUpstreamBranch(candidate, remaining - 1, sampleAt, drainage, cache);
      const from = worldOffsetToAxial(this.courseToWorld(candidate));
      const dx = from.x - world.x;
      const dy = from.y - world.y;
      const length = upstream.length + Math.sqrt(dx * dx + dx * dy + dy * dy);
      if (length > best.length) best = { length, delta };
    }
    cache.set(key, best);
    return best;
  }
  sourceFor(regionX, regionY, slot, sampleAt, cache) {
    const rivers = this.profile.rivers;
    const key = sourceKey(this.numericSeed, regionX, regionY, slot, rivers.sourceSalt);
    const source = {
      x: regionX * rivers.sourceCellSize + Math.floor(randomForSource(this.numericSeed, key, 1) * rivers.sourceCellSize),
      y: regionY * rivers.sourceCellSize + Math.floor(randomForSource(this.numericSeed, key, 2) * rivers.sourceCellSize)
    };
    const node = this.drainageNode(source, sampleAt, cache);
    if (!node) return void 0;
    const chance = rivers.sourceSpawnChance * this.sourceSuitability(node.sample);
    return randomForSource(this.numericSeed, key, 3) < chance ? source : void 0;
  }
  coursesForExtent(originX, originY, width, height, sampleAt) {
    const rivers = this.profile.rivers;
    const reach = this.domain.topology === "toroidal" ? 0 : rivers.maximumCourseLength * this.courseStep + Math.ceil(
      this.courseStep + rivers.courseWarpAmplitude * 2 + rivers.highFlowCourseRadius * rivers.mouthWidthMultiplier * 2
    );
    const corners = [
      worldOffsetToAxial({ x: originX - reach, y: originY - reach }),
      worldOffsetToAxial({ x: originX + width - 1 + reach, y: originY - reach }),
      worldOffsetToAxial({ x: originX - reach, y: originY + height - 1 + reach }),
      worldOffsetToAxial({ x: originX + width - 1 + reach, y: originY + height - 1 + reach })
    ];
    const minimumX = Math.floor(Math.min(...corners.map((point) => point.x)) / this.courseStep) - 1;
    const maximumX = Math.ceil(Math.max(...corners.map((point) => point.x)) / this.courseStep) + 1;
    const minimumY = Math.floor(Math.min(...corners.map((point) => point.y)) / this.courseStep) - 1;
    const maximumY = Math.ceil(Math.max(...corners.map((point) => point.y)) / this.courseStep) + 1;
    const firstRegionX = Math.floor(minimumX / rivers.sourceCellSize);
    const lastRegionX = Math.floor(maximumX / rivers.sourceCellSize);
    const firstRegionY = Math.floor(minimumY / rivers.sourceCellSize);
    const lastRegionY = Math.floor(maximumY / rivers.sourceCellSize);
    const sources = /* @__PURE__ */ new Set();
    const courses = [];
    const drainage = /* @__PURE__ */ new Map();
    const upstream = /* @__PURE__ */ new Map();
    for (let regionX = firstRegionX; regionX <= lastRegionX; regionX += 1) {
      for (let regionY = firstRegionY; regionY <= lastRegionY; regionY += 1) {
        for (let slot = 0; slot < rivers.sourcesPerCell; slot += 1) {
          const source = this.sourceFor(regionX, regionY, slot, sampleAt, drainage);
          if (!source) continue;
          const key = this.canonicalCourseKey(source);
          if (sources.has(key)) continue;
          sources.add(key);
          const course = this.traceCourse(source, sampleAt, drainage, upstream);
          if (course) courses.push(course);
        }
      }
    }
    return courses;
  }
  rasterizeCourses(originX, originY, width, height, sampleAt, visit) {
    this.maximumRasterizedTiles = Math.max(this.maximumRasterizedTiles, width * height);
    const courses = this.coursesForExtent(originX, originY, width, height, sampleAt);
    const nodes = /* @__PURE__ */ new Map();
    for (const course of courses) {
      let nextWorld;
      let nextKey;
      for (let index = course.points.length - 1; index >= 0; index -= 1) {
        const point = course.points[index];
        const world = this.courseToWorld(point);
        const key = this.canonicalCourseKey(point);
        const node = nodes.get(key);
        if (node) node.flow += 1;
        else nodes.set(key, {
          world,
          nextWorld,
          nextKey,
          distanceToSea: 0,
          visibleDistanceToSea: 0,
          hasIncoming: false,
          flow: 1,
          radius: 0
        });
        nextWorld = world;
        nextKey = key;
      }
    }
    for (const node of nodes.values()) {
      if (node.nextKey !== void 0) nodes.get(node.nextKey).hasIncoming = true;
    }
    for (const node of nodes.values()) {
      if (!node.nextWorld || node.nextKey === void 0) continue;
      const next = nodes.get(node.nextKey);
      const downstream = next.nextWorld ? {
        x: node.nextWorld.x + next.nextWorld.x - next.world.x,
        y: node.nextWorld.y + next.nextWorld.y - next.world.y
      } : void 0;
      node.reach = createRiverReach(node.world, node.nextWorld, downstream, !node.hasIncoming);
      node.distanceToSea = next.distanceToSea + node.reach.length;
    }
    const rivers = this.profile.rivers;
    for (const course of courses) {
      const head = nodes.get(this.canonicalCourseKey(course.points[0]));
      const anchor = nodes.get(this.canonicalCourseKey(course.anchor));
      head.visibleDistanceToSea = Math.max(
        head.visibleDistanceToSea,
        anchor.distanceToSea * rivers.courseLengthMultiplier
      );
    }
    const upstreamFirst = [...nodes.values()].reverse();
    for (const node of upstreamFirst) {
      if (node.nextKey === void 0) continue;
      const next = nodes.get(node.nextKey);
      next.visibleDistanceToSea = Math.max(next.visibleDistanceToSea, node.visibleDistanceToSea);
    }
    for (const node of nodes.values()) {
      const flowRadius = rivers.baseCourseRadius + (rivers.highFlowCourseRadius - rivers.baseCourseRadius) * smoothstep2(1, rivers.highFlowThreshold, node.flow);
      const mouth = 1 - smoothstep2(0, rivers.mouthWideningDistance, node.distanceToSea);
      node.radius = flowRadius * (1 + (rivers.mouthWidthMultiplier - 1) * mouth);
    }
    const endX = originX + width;
    const endY = originY + height;
    const visited = new Uint8Array(bitArrayLength(width * height));
    const emit = (point) => {
      const normalized = this.normalizeWorld(point);
      if (!normalized || normalized.x < originX || normalized.x >= endX || normalized.y < originY || normalized.y >= endY) return;
      const index = (normalized.x - originX) * height + normalized.y - originY;
      if (hasBit(visited, index)) return;
      setBit(visited, index);
      const sample = sampleAt(normalized.x, normalized.y);
      if (!sample || sample.baseTerrain === "sea" /* sea */ || sample.baseTerrain === "coastal" /* coastal */) return;
      visit(normalized.x, normalized.y);
    };
    for (const node of nodes.values()) {
      if (!node.reach || node.nextKey === void 0) continue;
      const next = nodes.get(node.nextKey);
      if (node.visibleDistanceToSea <= next.distanceToSea) continue;
      const trim = Math.max(0, node.distanceToSea - node.visibleDistanceToSea);
      const fraction = node.reach.length > 0 ? trim / node.reach.length : 0;
      forEachHexRiverReach(
        trimRiverReachStart(node.reach, trim),
        node.radius + (next.radius - node.radius) * fraction,
        next.radius,
        emit
      );
    }
  }
  buildPage(pageX, pageY, pageSize, sampleAt) {
    const riverBits = new Uint8Array(bitArrayLength(pageSize * pageSize));
    const originX = pageX * pageSize;
    const originY = pageY * pageSize;
    this.rasterizeCourses(originX, originY, pageSize, pageSize, sampleAt, (x, y) => {
      setBit(riverBits, (x - originX) * pageSize + y - originY);
    });
    return { riverBits };
  }
  buildToroidalMask(sampleAt) {
    if (this.domain.topology !== "toroidal") throw new Error("toroidal mask requires a toroidal domain");
    const domain = this.domain;
    const mask = new Uint8Array(bitArrayLength(domain.width * domain.height));
    this.rasterizeCourses(0, 0, domain.width, domain.height, sampleAt, (x, y) => {
      setBit(mask, x * domain.height + y);
    });
    return mask;
  }
};
function createWorldWaterSampler(numericSeed, domain, profile) {
  if (!Number.isSafeInteger(numericSeed) || numericSeed < 0 || numericSeed > 4294967295) {
    throw new RangeError("water sampler seed must be an unsigned 32-bit integer");
  }
  return new DrainageWorldWaterSampler(numericSeed, domain, profile);
}

// src/world/WorldSurfaceResolver.ts
var isWater = (type) => type === "sea" /* sea */ || type === "coastal" /* coastal */;
var clamp013 = (value) => Math.max(0, Math.min(1, value));
var smoothstep3 = (edge0, edge1, value) => {
  const t = clamp013((value - edge0) / (edge1 - edge0));
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
  if (sample.ocean < terrain.oceanLevel) return "sea" /* sea */;
  if (sample.elevation > terrain.mountainElevation && sample.ridge > terrain.mountainRidge || sample.elevation > terrain.mountainPeakElevation) return "mountain" /* mountain */;
  const snowColdness = terrain.snowTemperature > 0 ? clamp013((terrain.snowTemperature - sample.temperature) / terrain.snowTemperature) : 0;
  const minimumSnowElevation = terrain.seaLevel + (terrain.hillElevation - terrain.seaLevel) * 0.45;
  const snowElevation = terrain.hillElevation - (terrain.hillElevation - minimumSnowElevation) * snowColdness;
  if (sample.temperature < terrain.snowTemperature && sample.elevation > snowElevation) return "snow" /* snow */;
  if (sample.temperature < terrain.tundraTemperature) return "tundra" /* tundra */;
  if (sample.temperature > terrain.sandTemperature && sample.moisture < terrain.sandMoisture) return "sand" /* sand */;
  return "land" /* land */;
}
function generatedRelief(sample, profile) {
  const relief = profile.relief;
  if (sample.ocean < profile.terrain.oceanLevel) return relief.shoreline;
  const landElevation = Math.max(0, sample.elevation - profile.terrain.seaLevel);
  const plain = relief.plainMinimum + landElevation * relief.plainElevationScale + sample.roughness * relief.plainRoughnessScale - sample.valley * relief.valleyDepth;
  const hill = smoothstep3(relief.hillElevationStart, relief.hillElevationEnd, sample.elevation) * relief.hillScale;
  const mountainT = Math.max(
    0,
    (sample.elevation - relief.mountainElevationStart) / relief.mountainElevationSpan
  );
  const mountain = Math.pow(mountainT, relief.mountainPower) * relief.mountainScale + sample.ridge * clamp013(mountainT) * relief.mountainRidgeScale;
  return Math.max(
    relief.shoreline,
    Math.min(relief.mountainMaximum, plain + hill + mountain)
  );
}
function biomeWeightsFor(type, sample, profile) {
  if (isWater(type)) return Object.freeze({ temperate: 0, dry: 0, cold: 0, alpine: 0 });
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
  const alpine = clamp013(Math.max(
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
function biomeFor(type, weights) {
  if (type === "sea" /* sea */ || type === "coastal" /* coastal */) return type === "coastal" /* coastal */ ? "coast" : "ocean";
  const weighted = [
    ["temperate", weights.temperate],
    ["dry", weights.dry],
    ["cold", weights.cold],
    ["alpine", weights.alpine]
  ];
  return weighted.reduce((best, candidate) => candidate[1] > best[1] ? candidate : best)[0];
}
function vegetationDensityFor(type, sample, profile) {
  if (isWater(type) || type === "mountain" /* mountain */ || type === "snow" /* snow */) return 0;
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
  const slope = clamp013(1 - sample.ridge * vegetation.ridgePenalty - sample.roughness * vegetation.roughnessPenalty);
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
  const biome = biomeFor(baseTerrain, biomeWeights);
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
function resolveTile(numericSeed, profile, x, y, sampleAt, riverAt) {
  const sample = sampleAt(x, y);
  if (!sample) throw new RangeError("world surface coordinate is outside the generated domain");
  let type = !isWater(sample.baseTerrain) && riverAt(x, y) ? "sea" /* sea */ : sample.baseTerrain;
  if (type === "sea" /* sea */) {
    const touchesLand = getNeighbors(x, y).some((neighbor) => {
      const adjacent = sampleAt(neighbor.x, neighbor.y);
      return adjacent !== void 0 && !isWater(adjacent.baseTerrain) && !riverAt(neighbor.x, neighbor.y);
    });
    if (touchesLand) type = "coastal" /* coastal */;
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
    this.sampleWater = (x, y) => {
      const point = normalizeCoordinates(this.domain, x, y);
      if (!point) return void 0;
      const landform = this.sampler.sample(point.x, point.y);
      return { baseTerrain: classifyTerrain(landform, this.profile), landform };
    };
    if (!options || typeof options !== "object") throw new TypeError("world surface resolver options are required");
    this.seed = String(options.seed);
    this.waterStyle = normalizeWorldWaterGenerationStyle(options.waterStyle);
    this.profile = createWorldStyleProfile(this.waterStyle);
    this.sampler = createLandformSamplerForProfile({ seed: options.seed, domain: options.domain }, this.profile);
    this.domain = Object.freeze({ ...this.sampler.domain });
    this.waterSampler = createWorldWaterSampler(this.sampler.numericSeed, this.domain, this.profile);
  }
  get waterStats() {
    return this.waterSampler.stats;
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
      (riverX, riverY) => this.waterSampler.isRiverTile(
        riverX,
        riverY,
        this.sampleWater
      )
    );
  }
  visitGeneratedRiverTiles(originX, originY, width, height, visit) {
    const batches = this.generatedRiverTileBatches(originX, originY, width, height, visit);
    while (!batches.next().done) {
    }
  }
  generatedRiverTileBatches(originX, originY, width, height, visit) {
    if (typeof visit !== "function") throw new TypeError("generated river visitor must be a function");
    return this.waterSampler.riverTileBatches(originX, originY, width, height, this.sampleWater, visit);
  }
  createWindow() {
    return new WorldSurfaceResolverWindow(this, this.sampler.numericSeed, this.waterSampler, this.sampleWater);
  }
};
var WorldSurfaceResolverWindow = class {
  constructor(resolver, numericSeed, waterSampler, sampleWater) {
    this.resolver = resolver;
    this.numericSeed = numericSeed;
    this.waterSampler = waterSampler;
    this.sampleWater = sampleWater;
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
        (riverX, riverY) => this.waterSampler.isRiverTile(
          riverX,
          riverY,
          this.sampleWater
        )
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

// src/world/WorldGenerationLimits.ts
var MIN_WORLD_SIZE = 8;
var MAX_WORLD_SIZE = 512;
function assertWorldDimensions(width, height) {
  for (const [name, value] of [["width", width], ["height", height]]) {
    if (!Number.isSafeInteger(value) || value < MIN_WORLD_SIZE || value > MAX_WORLD_SIZE) {
      throw new RangeError(`${name} must be an integer between ${MIN_WORLD_SIZE} and ${MAX_WORLD_SIZE}`);
    }
  }
}
function assertToroidalWorldBounds(world) {
  if (world.topology !== "toroidal") throw new TypeError("world topology must be toroidal");
  assertWorldDimensions(world.width, world.height);
  if (world.width % 2 !== 0) throw new RangeError("toroidal worlds require an even width");
}

// src/world/generateWorld.ts
function cloneGeneratedTile(tile) {
  return {
    ...tile,
    modifiers: tile.modifiers ? [...tile.modifiers] : void 0,
    rivers: tile.rivers?.map((river) => ({ ...river })),
    city: tile.city ? { ...tile.city } : void 0
  };
}
function generateWorld({
  seed,
  width,
  height,
  topology = "bounded",
  waterStyle
}) {
  assertWorldDimensions(width, height);
  if (topology !== "bounded" && topology !== "toroidal") {
    throw new RangeError('topology must be either "bounded" or "toroidal"');
  }
  if (topology === "toroidal" && width % 2 !== 0) {
    throw new RangeError("toroidal worlds require an even width");
  }
  const data = {};
  const toroidal = topology === "toroidal";
  const resolver = createWorldSurfaceResolver({
    seed,
    waterStyle,
    domain: toroidal ? { topology: "toroidal", width, height } : { topology: "bounded", width, height }
  });
  const windowSize = 24;
  for (let startX = 0; startX < width; startX += windowSize) {
    for (let startY = 0; startY < height; startY += windowSize) {
      const window = resolver.createWindow();
      const endX = Math.min(width, startX + windowSize);
      const endY = Math.min(height, startY + windowSize);
      for (let x = startX; x < endX; x += 1) {
        data[x] ?? (data[x] = {});
        for (let y = startY; y < endY; y += 1) {
          data[x][y] = cloneGeneratedTile(window.resolveGeneratedTile(x, y));
        }
      }
      window.clear();
    }
  }
  return { data, w: width, h: height, wrapX: toroidal, wrapY: toroidal };
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
  assertToroidalWorldBounds(world);
}
function createWorldChunkSurfaceResolver(options) {
  if (!options || typeof options !== "object") throw new TypeError("world chunk generation options are required");
  validateBoundedWorld(options.world);
  return createWorldSurfaceResolver({
    seed: options.seed,
    waterStyle: options.waterStyle,
    domain: options.world ? { topology: "toroidal", width: options.world.width, height: options.world.height } : { topology: "infinite" }
  });
}
function generateWorldChunkWithResolver(options, resolver, resolvedChunkSize) {
  assertChunkCoordinate("chunkX", options.chunkX);
  assertChunkCoordinate("chunkY", options.chunkY);
  validateBoundedWorld(options.world);
  const chunkSize = resolvedChunkSize ?? resolveChunkSize(options.chunkSize);
  const stride = chunkSize + WORLD_CHUNK_PADDING * 2;
  const tiles = new Uint16Array(stride * stride);
  const expectedDomain = options.world ? { topology: "toroidal", width: options.world.width, height: options.world.height } : { topology: "infinite" };
  const expectedWaterStyle = options.waterStyle ?? DEFAULT_WORLD_WATER_STYLE;
  if (!resolver || resolver.seed !== String(options.seed) || !worldWaterGenerationStylesEqual(resolver.waterStyle, expectedWaterStyle) || resolver.domain.topology !== expectedDomain.topology || expectedDomain.topology === "toroidal" && (resolver.domain.topology !== "toroidal" || resolver.domain.width !== expectedDomain.width || resolver.domain.height !== expectedDomain.height)) {
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

// src/world/generateVegetation.ts
var import_robust_point_in_polygon = __toESM(require_robust_pnp(), 1);

// src/helpers/topology.ts
function positiveModulo4(value, modulus) {
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
  if (map.wrapX) normalizedX = positiveModulo4(normalizedX, map.w);
  else if (normalizedX < 0 || normalizedX >= map.w) return null;
  if (map.wrapY) normalizedY = positiveModulo4(normalizedY, map.h);
  else if (normalizedY < 0 || normalizedY >= map.h) return null;
  return { x: normalizedX, y: normalizedY };
}
function getMapTile(map, x, y) {
  const normalized = normalizeMapCoordinates(map, x, y);
  if (!normalized) return void 0;
  return map.tileAt?.(normalized.x, normalized.y) ?? map.data[normalized.x]?.[normalized.y];
}

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
function isWater2(tile) {
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
  if (!tile || isWater2(tile)) return true;
  const apothem = size * 0.8660254;
  const waterByDirection = /* @__PURE__ */ new Map();
  const factorByDirection = /* @__PURE__ */ new Map();
  for (const direction of COAST_DIRECTIONS) {
    const neighbor = getNeighborCoords(tileX, tileY, direction);
    waterByDirection.set(direction, isWater2(getMapTile(map, neighbor.x, neighbor.y)));
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
    if (!tile?.modifiers?.includes("wood") || tile.city || isLakeTile(tile)) continue;
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

// src/runtime/LifecycleScope.ts
function lifecycleAbortError(message = "Lifecycle scope was closed") {
  if (typeof DOMException !== "undefined") return new DOMException(message, "AbortError");
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

// src/world/WorldDescriptor.ts
var WORLD_DESCRIPTOR_FORMAT_VERSION = 5;
var WORLD_WORKER_PROTOCOL_VERSION = 8;
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
  const waterStyle = normalizeWorldWaterGenerationStyle(options.waterStyle);
  const base = {
    descriptorVersion: WORLD_DESCRIPTOR_FORMAT_VERSION,
    seed: String(options.seed),
    generatorVersion,
    chunkFormatVersion: WORLD_CHUNK_FORMAT_VERSION,
    chunkSize,
    waterStyle
  };
  if (!options.world) {
    return Object.freeze({ ...base, sourceKind: "procedural-infinite", topology: "infinite" });
  }
  const world = options.world;
  assertToroidalWorldBounds(world);
  return Object.freeze({
    ...base,
    sourceKind: "procedural-toroidal",
    topology: "toroidal",
    width: world.width,
    height: world.height
  });
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
  assertWorldWaterGenerationStyle(descriptor.waterStyle);
  if (descriptor.sourceKind === "procedural-infinite") {
    if (descriptor.topology !== "infinite" || descriptor.width !== void 0 || descriptor.height !== void 0) {
      throw new TypeError("infinite world descriptor topology is invalid");
    }
    return;
  }
  assertToroidalWorldBounds({
    topology: descriptor.topology,
    width: descriptor.width,
    height: descriptor.height
  });
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
    descriptor.height ?? null,
    serializeWorldWaterGenerationStyle(descriptor.waterStyle)
  ]);
}

// src/world/generateWorldOverview.ts
var WORLD_OVERVIEW_FORMAT_VERSION = 1;
var MAX_WORLD_OVERVIEW_RASTER_SIZE = 256;
var MAX_WORLD_OVERVIEW_TILE_SPAN = 16384;
var PALETTE = {
  deepWater: [13, 48, 76],
  shallowWater: [42, 112, 126],
  coast: [70, 139, 137],
  temperate: [91, 139, 73],
  dry: [169, 148, 86],
  cold: [126, 146, 126],
  alpine: [113, 119, 116],
  sand: [188, 166, 102],
  tundra: [151, 166, 157],
  snow: [225, 233, 235],
  mountain: [105, 108, 109],
  lake: [35, 105, 129],
  river: [28, 142, 174]
};
var clamp014 = (value) => Math.max(0, Math.min(1, value));
function assertSafeExtentCoordinate(name, value) {
  if (!Number.isSafeInteger(value)) throw new RangeError(`${name} must be a safe integer`);
}
function assertWorldOverviewPreparationOptions(options) {
  if (!options || typeof options !== "object") throw new TypeError("world overview options are required");
  assertSafeExtentCoordinate("originX", options.originX);
  assertSafeExtentCoordinate("originY", options.originY);
  for (const [name, value] of [
    ["tileSpanX", options.tileSpanX],
    ["tileSpanY", options.tileSpanY]
  ]) {
    if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_WORLD_OVERVIEW_TILE_SPAN) {
      throw new RangeError(`${name} must be an integer between 1 and ${MAX_WORLD_OVERVIEW_TILE_SPAN}`);
    }
  }
  for (const [name, value] of [
    ["pixelWidth", options.pixelWidth],
    ["pixelHeight", options.pixelHeight]
  ]) {
    if (!Number.isInteger(value) || value <= 0 || value > MAX_WORLD_OVERVIEW_RASTER_SIZE) {
      throw new RangeError(`${name} must be an integer between 1 and ${MAX_WORLD_OVERVIEW_RASTER_SIZE}`);
    }
  }
  if (!Number.isSafeInteger(options.originX + options.tileSpanX - 1) || !Number.isSafeInteger(options.originY + options.tileSpanY - 1)) {
    throw new RangeError("world overview extent exceeds safe integer coordinates");
  }
}
function assertWorldOverviewRaster(value) {
  if (!value || typeof value !== "object") throw new TypeError("world overview raster must be an object");
  const raster = value;
  if (raster.version !== WORLD_OVERVIEW_FORMAT_VERSION) {
    throw new TypeError(`unsupported world overview format ${String(raster.version)}`);
  }
  assertWorldOverviewPreparationOptions(raster);
  if (!(raster.pixels instanceof Uint8ClampedArray) || raster.pixels.length !== raster.pixelWidth * raster.pixelHeight * 4) {
    throw new TypeError("world overview pixels are invalid");
  }
}
function mix2(first, second, amount) {
  const t = clamp014(amount);
  return [
    first[0] + (second[0] - first[0]) * t,
    first[1] + (second[1] - first[1]) * t,
    first[2] + (second[2] - first[2]) * t
  ];
}
function shadeRgb(color, amount) {
  return [color[0] * amount, color[1] * amount, color[2] * amount];
}
function writePixel(pixels, offset, color) {
  pixels[offset] = Math.round(color[0]);
  pixels[offset + 1] = Math.round(color[1]);
  pixels[offset + 2] = Math.round(color[2]);
  pixels[offset + 3] = 255;
}
function overviewTileCoordinate(origin, span, pixel, pixels) {
  return origin + Math.min(span - 1, Math.floor((pixel + 0.5) * span / pixels));
}
function* generatedRiverCoverage(options, resolver) {
  const coverage = new Uint8Array(options.pixelWidth * options.pixelHeight);
  const magnifyX = options.pixelWidth > options.tileSpanX;
  const magnifyY = options.pixelHeight > options.tileSpanY;
  yield* resolver.generatedRiverTileBatches(
    options.originX,
    options.originY,
    options.tileSpanX,
    options.tileSpanY,
    (x, y) => {
      const localX = x - options.originX;
      const localY = y - options.originY;
      const firstX = magnifyX ? Math.max(0, Math.ceil(localX * options.pixelWidth / options.tileSpanX - 0.5)) : Math.floor(localX * options.pixelWidth / options.tileSpanX);
      const firstY = magnifyY ? Math.max(0, Math.ceil(localY * options.pixelHeight / options.tileSpanY - 0.5)) : Math.floor(localY * options.pixelHeight / options.tileSpanY);
      const endX = magnifyX ? Math.min(options.pixelWidth, Math.ceil((localX + 1) * options.pixelWidth / options.tileSpanX - 0.5)) : firstX + 1;
      const endY = magnifyY ? Math.min(options.pixelHeight, Math.ceil((localY + 1) * options.pixelHeight / options.tileSpanY - 0.5)) : firstY + 1;
      for (let py = firstY; py < endY; py += 1) {
        coverage.fill(1, py * options.pixelWidth + firstX, py * options.pixelWidth + endX);
      }
    }
  );
  return coverage;
}
async function generateWorldOverviewAsyncWithResolver(options, resolver, signal) {
  const steps = generateWorldOverviewSteps(options, resolver);
  let deadline = performance.now() + 8;
  for (; ; ) {
    if (signal?.aborted) steps.throw(lifecycleAbortError("World overview request was aborted"));
    const step = steps.next();
    if (step.done) return step.value;
    if (performance.now() < deadline) continue;
    await new Promise((resolve) => setTimeout(resolve, 0));
    deadline = performance.now() + 8;
  }
}
function* generateWorldOverviewSteps(options, resolver) {
  assertWorldOverviewPreparationOptions(options);
  assertWorldDescriptor(options.descriptor);
  const expectedTopology = options.descriptor.topology;
  if (resolver.seed !== options.descriptor.seed || resolver.domain.topology !== expectedTopology || !worldWaterGenerationStylesEqual(resolver.waterStyle, options.descriptor.waterStyle) || expectedTopology === "toroidal" && (resolver.domain.topology !== "toroidal" || resolver.domain.width !== options.descriptor.width || resolver.domain.height !== options.descriptor.height)) {
    throw new TypeError("world overview resolver does not match its descriptor");
  }
  const pixels = new Uint8ClampedArray(options.pixelWidth * options.pixelHeight * 4);
  const riverCoverage = yield* generatedRiverCoverage(options, resolver);
  const terrain = resolver.profile.terrain;
  const terrainRow = new Uint8ClampedArray(options.pixelWidth * 4);
  let previousY;
  for (let py = 0; py < options.pixelHeight; py += 1) {
    const tileY = overviewTileCoordinate(options.originY, options.tileSpanY, py, options.pixelHeight);
    if (tileY !== previousY) {
      let previousX;
      for (let px = 0; px < options.pixelWidth; px += 1) {
        const offset = px * 4;
        const tileX = overviewTileCoordinate(options.originX, options.tileSpanX, px, options.pixelWidth);
        if (tileX === previousX) {
          terrainRow.copyWithin(offset, offset - 4, offset);
          continue;
        }
        previousX = tileX;
        const sample = resolver.sampleGenerated(tileX, tileY);
        let color;
        if (sample.baseTerrain === "sea" /* sea */ || sample.baseTerrain === "coastal" /* coastal */) {
          const shoreline = clamp014(
            1 - (terrain.oceanLevel - sample.landform.ocean) / Math.max(1e-3, terrain.oceanLevel * 0.42)
          );
          color = mix2(PALETTE.deepWater, PALETTE.shallowWater, shoreline);
        } else if (sample.baseTerrain === "sand" /* sand */) {
          color = PALETTE.sand;
        } else if (sample.baseTerrain === "tundra" /* tundra */) {
          color = PALETTE.tundra;
        } else if (sample.baseTerrain === "snow" /* snow */) {
          color = PALETTE.snow;
        } else if (sample.baseTerrain === "mountain" /* mountain */) {
          color = mix2(PALETTE.mountain, PALETTE.snow, sample.biomeWeights.alpine * 0.22);
        } else {
          const weights = sample.biomeWeights;
          const dryCold = mix2(PALETTE.dry, PALETTE.cold, weights.cold / Math.max(1e-3, weights.dry + weights.cold));
          const nonTemperate = mix2(dryCold, PALETTE.alpine, weights.alpine);
          color = mix2(nonTemperate, PALETTE.temperate, weights.temperate);
        }
        const reliefShade = 0.88 + clamp014((sample.landform.elevation - terrain.seaLevel) * 1.7) * 0.18 - sample.vegetationDensity * 0.13 - sample.landform.valley * 0.035;
        writePixel(terrainRow, offset, shadeRgb(color, reliefShade));
      }
      previousY = tileY;
    }
    pixels.set(terrainRow, py * terrainRow.length);
    for (let px = 0; px < options.pixelWidth; px += 1) {
      const pixelIndex = py * options.pixelWidth + px;
      if (riverCoverage[pixelIndex]) writePixel(pixels, pixelIndex * 4, PALETTE.river);
    }
    if ((py + 1) % 16 === 0) yield;
  }
  return {
    version: WORLD_OVERVIEW_FORMAT_VERSION,
    originX: options.originX,
    originY: options.originY,
    tileSpanX: options.tileSpanX,
    tileSpanY: options.tileSpanY,
    pixelWidth: options.pixelWidth,
    pixelHeight: options.pixelHeight,
    pixels
  };
}
function worldOverviewTransferables(overview) {
  assertWorldOverviewRaster(overview);
  return [overview.pixels.buffer];
}

// src/world/generateWorld.worker.ts
var scope = globalThis;
var chunkResolver;
var chunkResolverKey;
var activeOverviews = /* @__PURE__ */ new Map();
function resolverFor(options) {
  const key = serializeWorldDescriptor(createWorldDescriptor({
    seed: options.seed,
    chunkSize: options.chunkSize,
    world: options.world,
    waterStyle: options.waterStyle
  }));
  if (!chunkResolver || chunkResolverKey !== key) {
    chunkResolver = createWorldChunkSurfaceResolver(options);
    chunkResolverKey = key;
  }
  return chunkResolver;
}
function overviewResolverFor(options) {
  assertWorldDescriptor(options.descriptor);
  const key = serializeWorldDescriptor(options.descriptor);
  if (!chunkResolver || chunkResolverKey !== key) {
    const descriptor = options.descriptor;
    chunkResolver = createWorldSurfaceResolver({
      seed: descriptor.seed,
      waterStyle: descriptor.waterStyle,
      domain: descriptor.topology === "toroidal" ? { topology: "toroidal", width: descriptor.width, height: descriptor.height } : { topology: "infinite" }
    });
    chunkResolverKey = key;
  }
  return chunkResolver;
}
scope.addEventListener("message", async (event) => {
  try {
    const request = event.data;
    if (!request || request.protocolVersion !== WORLD_WORKER_PROTOCOL_VERSION || request.generatorVersion !== WORLD_GENERATOR_VERSION || !Number.isSafeInteger(request.id) || !["world", "chunk", "vegetation", "overview", "cancel-overview"].includes(request.type)) {
      throw new TypeError("World generator received an invalid request");
    }
    if (request.type === "cancel-overview") {
      activeOverviews.get(request.id)?.abort();
      return;
    }
    if (!request.options) throw new TypeError("World generator received an invalid request");
    if (request.type === "chunk") {
      const chunk = generateWorldChunkWithResolver(request.options, resolverFor(request.options));
      scope.postMessage({
        protocolVersion: WORLD_WORKER_PROTOCOL_VERSION,
        generatorVersion: WORLD_GENERATOR_VERSION,
        id: request.id,
        chunk
      }, [chunk.tiles.buffer]);
    } else if (request.type === "vegetation") {
      const vegetation = generateWorldVegetation(request.options);
      scope.postMessage({
        protocolVersion: WORLD_WORKER_PROTOCOL_VERSION,
        generatorVersion: WORLD_GENERATOR_VERSION,
        id: request.id,
        vegetation
      }, worldVegetationTransferables(vegetation));
    } else if (request.type === "overview") {
      if (activeOverviews.has(request.id)) throw new TypeError("Duplicate active overview request id");
      const abort = new AbortController();
      activeOverviews.set(request.id, abort);
      try {
        const overview = await generateWorldOverviewAsyncWithResolver(
          request.options,
          overviewResolverFor(request.options),
          abort.signal
        );
        scope.postMessage({
          protocolVersion: WORLD_WORKER_PROTOCOL_VERSION,
          generatorVersion: WORLD_GENERATOR_VERSION,
          id: request.id,
          overview
        }, worldOverviewTransferables(overview));
      } finally {
        activeOverviews.delete(request.id);
      }
    } else {
      scope.postMessage({
        protocolVersion: WORLD_WORKER_PROTOCOL_VERSION,
        generatorVersion: WORLD_GENERATOR_VERSION,
        id: request.id,
        world: generateWorld(request.options)
      });
    }
  } catch (reason) {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    scope.postMessage({
      protocolVersion: WORLD_WORKER_PROTOCOL_VERSION,
      generatorVersion: WORLD_GENERATOR_VERSION,
      id: event.data?.id,
      error: { name: error.name, message: error.message, stack: error.stack }
    });
  }
});
//# sourceMappingURL=world-generator.worker.mjs.map