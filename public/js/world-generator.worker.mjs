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
    var EPSILON2 = 11102230246251565e-32;
    var ERRBOUND3 = (3 + 16 * EPSILON2) * EPSILON2;
    var ERRBOUND4 = (7 + 56 * EPSILON2) * EPSILON2;
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
var WORLD_GENERATOR_VERSION = 5;

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
var isWater = (type) => type === "sea" /* sea */ || type === "coastal" /* coastal */;
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
  if (sample.elevation < terrain.seaLevel) return "sea" /* sea */;
  if (sample.elevation > terrain.mountainElevation && sample.ridge > terrain.mountainRidge || sample.elevation > terrain.mountainPeakElevation) return "mountain" /* mountain */;
  if (sample.temperature < terrain.snowTemperature) return "snow" /* snow */;
  if (sample.temperature < terrain.tundraTemperature) return "tundra" /* tundra */;
  if (sample.temperature > terrain.sandTemperature && sample.moisture < terrain.sandMoisture) return "sand" /* sand */;
  return "land" /* land */;
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
    type === "mountain" /* mountain */ ? 0.7 : 0,
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
  if (isWater(type) || type === "mountain" /* mountain */ || type === "snow" /* snow */) return 0;
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
function resolveTile(numericSeed, profile, x, y, sampleAt) {
  const sample = sampleAt(x, y);
  if (!sample) throw new RangeError("world surface coordinate is outside the generated domain");
  let type = sample.baseTerrain;
  if (type === "sea" /* sea */) {
    const touchesLand = getNeighbors(x, y).some((neighbor) => {
      const adjacent = sampleAt(neighbor.x, neighbor.y);
      return adjacent !== void 0 && adjacent.baseTerrain !== "sea" /* sea */;
    });
    if (touchesLand) type = "coastal" /* coastal */;
  }
  const tile = { type };
  if (isWater(type) || type === "mountain" /* mountain */ || type === "snow" /* snow */) return Object.freeze(tile);
  const modifiers = [];
  const lakes = profile.lakes;
  const isLakeCandidate = (candidate, tileX, tileY) => Boolean(candidate && candidate.lakePotential >= lakes.minimumPotential && randomAt(numericSeed, tileX, tileY, lakes.placementSalt) < candidate.lakePotential * lakes.placementScale);
  const lakeCandidate = isLakeCandidate(sample, x, y);
  const lakeNeighbors = lakeCandidate ? getNeighbors(x, y).reduce((count, neighbor) => {
    const adjacent = sampleAt(neighbor.x, neighbor.y);
    return count + (isLakeCandidate(adjacent, neighbor.x, neighbor.y) ? 1 : 0);
  }, 0) : 0;
  const lake = lakeCandidate && lakeNeighbors >= lakes.minimumNeighbors;
  if (lake) {
    modifiers.push("lake");
  } else {
    if (sample.landform.elevation > profile.terrain.hillElevation) modifiers.push("hill");
    const forest = sample.vegetationDensity + (randomAt(numericSeed, x, y, profile.vegetation.placementSalt) - 0.5) * profile.vegetation.placementJitter >= profile.vegetation.placementThreshold;
    if (forest) {
      modifiers.push("wood");
      tile.treeModel = `Assets/models/${sample.vegetationKind ?? "oak"}`;
    }
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
      }
    );
  }
  createWindow() {
    return new WorldSurfaceResolverWindow(this, this.sampler.numericSeed);
  }
};
var WorldSurfaceResolverWindow = class {
  constructor(resolver, numericSeed) {
    this.resolver = resolver;
    this.numericSeed = numericSeed;
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
        (sampleX, sampleY) => this.sampleGenerated(sampleX, sampleY)
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

// src/world/generateWorld.ts
var MIN_WORLD_SIZE = 8;
var MAX_WORLD_SIZE = 512;
function assertDimension2(name, value) {
  if (!Number.isInteger(value) || value < MIN_WORLD_SIZE || value > MAX_WORLD_SIZE) {
    throw new RangeError(`${name} must be an integer between ${MIN_WORLD_SIZE} and ${MAX_WORLD_SIZE}`);
  }
}
function cloneGeneratedTile(tile) {
  return {
    ...tile,
    modifiers: tile.modifiers ? [...tile.modifiers] : void 0,
    rivers: tile.rivers?.map((river) => ({ ...river })),
    city: tile.city ? { ...tile.city } : void 0
  };
}
function generateWorld({ seed, width, height, topology = "bounded" }) {
  assertDimension2("width", width);
  assertDimension2("height", height);
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
  if (world.topology !== "toroidal" || !Number.isInteger(world.width) || world.width < 8 || !Number.isInteger(world.height) || world.height < 8 || world.width % 2 !== 0) {
    throw new RangeError("bounded chunk generation requires an even-width toroidal world of at least 8x8");
  }
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
  const tiles = new Uint16Array(stride * stride);
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

// src/world/generateVegetation.ts
var import_robust_point_in_polygon = __toESM(require_robust_pnp(), 1);

// src/helpers/topology.ts
function positiveModulo2(value, modulus) {
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
  if (map.wrapX) normalizedX = positiveModulo2(normalizedX, map.w);
  else if (normalizedX < 0 || normalizedX >= map.w) return null;
  if (map.wrapY) normalizedY = positiveModulo2(normalizedY, map.h);
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

// src/world/WorldDescriptor.ts
var WORLD_DESCRIPTOR_FORMAT_VERSION = 1;
var WORLD_WORKER_PROTOCOL_VERSION = 5;
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

// src/world/semantic/WorldSemanticCatalog.ts
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
var WORLD_SEMANTIC_CHUNK_FORMAT_VERSION = 2;
var WORLD_SURFACE_V2_GENERATOR_VERSION = 7;
var HYDROLOGY_REGION_FORMAT_VERSION = 1;
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
function semanticChunkLocalIndex(localX, localY) {
  if (!Number.isInteger(localX) || localX < 0 || localX >= WORLD_SEMANTIC_CHUNK_SIZE || !Number.isInteger(localY) || localY < 0 || localY >= WORLD_SEMANTIC_CHUNK_SIZE) {
    throw new RangeError(`semantic local coordinates must be integers between 0 and ${WORLD_SEMANTIC_CHUNK_SIZE - 1}`);
  }
  return localX * WORLD_SEMANTIC_CHUNK_SIZE + localY;
}
function semanticChunkOrigin(key) {
  assertSemanticChunkKey(key);
  return {
    x: key.chunkX * WORLD_SEMANTIC_CHUNK_SIZE,
    y: key.chunkY * WORLD_SEMANTIC_CHUNK_SIZE
  };
}
function hydrologyRegionOrigin(key) {
  assertHydrologyRegionKey(key);
  return {
    x: key.regionX * HYDROLOGY_REGION_SIZE,
    y: key.regionY * HYDROLOGY_REGION_SIZE
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

// src/world/semantic/BaseSemanticChunk.ts
var BIOME_CHANNELS = 4;
var CLIMATE_CHANNELS = 2;
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
function assertInvalidTileIsZero(chunk, index) {
  const biomeOffset = index * BIOME_CHANNELS;
  const climateOffset = index * CLIMATE_CHANNELS;
  if (chunk.substrateClass[index] !== 0 || chunk.macroHeight[index] !== 0 || chunk.biomeWeights[biomeOffset] !== 0 || chunk.biomeWeights[biomeOffset + 1] !== 0 || chunk.biomeWeights[biomeOffset + 2] !== 0 || chunk.biomeWeights[biomeOffset + 3] !== 0 || chunk.climate[climateOffset] !== 0 || chunk.climate[climateOffset + 1] !== 0 || chunk.vegetationDensity[index] !== 0 || chunk.vegetationProfile[index] !== 0) {
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
      const index = semanticChunkLocalIndex(localX, localY);
      if (!localBoundsContain(chunk.validBounds, localX, localY)) {
        assertInvalidTileIsZero(chunk, index);
        continue;
      }
      if (chunk.substrateClass[index] >= WORLD_SUBSTRATE_CATALOG.length) {
        throw new TypeError("semantic chunk contains an unknown substrate class");
      }
      if (chunk.vegetationProfile[index] >= WORLD_VEGETATION_PROFILE_CATALOG.length) {
        throw new TypeError("semantic chunk contains an unknown vegetation profile");
      }
      const biomeOffset = index * BIOME_CHANNELS;
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

// src/world/semantic/WorldDescriptorV2.ts
var WORLD_DESCRIPTOR_V2_FORMAT_VERSION = 2;
function assertSeed(value) {
  if (typeof value !== "string" && typeof value !== "number") {
    throw new TypeError("v2 procedural world seed must be a string or number");
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new RangeError("v2 numeric world seed must be finite");
  }
}
function assertDimension3(name, value) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`v2 world ${name} must be a positive safe integer`);
  }
}
function assertToroidalDimensions(width, height) {
  assertDimension3("width", width);
  assertDimension3("height", height);
  if (width < WORLD_SEMANTIC_CHUNK_SIZE || height < WORLD_SEMANTIC_CHUNK_SIZE || positiveIntegerModulo(width, WORLD_SEMANTIC_CHUNK_SIZE) !== 0 || positiveIntegerModulo(height, WORLD_SEMANTIC_CHUNK_SIZE) !== 0) {
    throw new RangeError(
      `v2 toroidal world dimensions must be multiples of ${WORLD_SEMANTIC_CHUNK_SIZE} and at least ${WORLD_SEMANTIC_CHUNK_SIZE}`
    );
  }
}
function catalogIdentityMatches(value, expected) {
  return Boolean(value && typeof value === "object" && Object.getOwnPropertyNames(value).sort().join(",") === "contentHash,id" && value.id === expected.id && value.contentHash === expected.contentHash);
}
function assertWorldDescriptorV2(value) {
  if (!value || typeof value !== "object") throw new TypeError("v2 world descriptor must be an object");
  const descriptor = value;
  if (descriptor.descriptorVersion !== WORLD_DESCRIPTOR_V2_FORMAT_VERSION) {
    throw new TypeError(`unsupported v2 world descriptor format ${String(descriptor.descriptorVersion)}`);
  }
  if (descriptor.semanticChunkFormatVersion !== WORLD_SEMANTIC_CHUNK_FORMAT_VERSION || descriptor.hydrologyRegionFormatVersion !== HYDROLOGY_REGION_FORMAT_VERSION) {
    throw new TypeError("v2 world descriptor contains unsupported semantic or hydrology formats");
  }
  if (!Array.isArray(descriptor.biomeBasis) || descriptor.biomeBasis.length !== WORLD_BIOME_BASIS.length || descriptor.biomeBasis.some((value2, index) => value2 !== WORLD_BIOME_BASIS[index])) {
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
    if (typeof descriptor.seed !== "string" || descriptor.generatorVersion !== WORLD_SURFACE_V2_GENERATOR_VERSION || descriptor.topology !== "infinite" || "width" in descriptor || "height" in descriptor) {
      throw new TypeError("v2 infinite world descriptor is invalid");
    }
    return;
  }
  if (descriptor.sourceKind === "procedural-toroidal") {
    assertFields(["seed", "generatorVersion", "width", "height"]);
    assertSeed(descriptor.seed);
    if (typeof descriptor.seed !== "string" || descriptor.generatorVersion !== WORLD_SURFACE_V2_GENERATOR_VERSION || descriptor.topology !== "toroidal") {
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
      assertDimension3("width", descriptor.width);
      assertDimension3("height", descriptor.height);
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
function canonicalizeSemanticChunkKey(descriptor, key) {
  assertWorldDescriptorV2(descriptor);
  if (!Number.isSafeInteger(key?.chunkX) || !Number.isSafeInteger(key?.chunkY)) {
    throw new RangeError("semantic chunk key must use safe integer coordinates");
  }
  if (descriptor.topology !== "toroidal") {
    assertSemanticChunkKey(key);
    return { chunkX: key.chunkX, chunkY: key.chunkY };
  }
  const chunksX = descriptor.width / WORLD_SEMANTIC_CHUNK_SIZE;
  const chunksY = descriptor.height / WORLD_SEMANTIC_CHUNK_SIZE;
  const canonical = {
    chunkX: positiveIntegerModulo(key.chunkX, chunksX),
    chunkY: positiveIntegerModulo(key.chunkY, chunksY)
  };
  assertSemanticChunkKey(canonical);
  return canonical;
}
function canonicalizeHydrologyRegionKey(descriptor, key) {
  assertWorldDescriptorV2(descriptor);
  if (!Number.isSafeInteger(key?.regionX) || !Number.isSafeInteger(key?.regionY)) {
    throw new RangeError("hydrology region key must use safe integer coordinates");
  }
  if (descriptor.topology !== "toroidal") {
    assertHydrologyRegionKey(key);
    return { regionX: key.regionX, regionY: key.regionY };
  }
  const regionsX = Math.ceil(descriptor.width / HYDROLOGY_REGION_SIZE);
  const regionsY = Math.ceil(descriptor.height / HYDROLOGY_REGION_SIZE);
  const canonical = {
    regionX: positiveIntegerModulo(key.regionX, regionsX),
    regionY: positiveIntegerModulo(key.regionY, regionsY)
  };
  assertHydrologyRegionKey(canonical);
  return canonical;
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
    case "sea" /* sea */:
    case "coastal" /* coastal */:
      return 0 /* Sediment */;
    case "sand" /* sand */:
      return 2 /* Sand */;
    case "mountain" /* mountain */:
      return 3 /* Rock */;
    case "tundra" /* tundra */:
    case "snow" /* snow */:
      return 4 /* Permafrost */;
    case "land" /* land */:
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
  const order = scaled.map((value, index) => ({ index, remainder: value - quantized[index] })).sort((first, second) => second.remainder - first.remainder || first.index - second.index);
  for (let index = 0; index < order.length && remaining > 0; index += 1, remaining -= 1) {
    quantized[order[index].index] += 1;
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
function generateBaseSemanticChunkWithResolver(options, resolver) {
  if (!options || typeof options !== "object") {
    throw new TypeError("base semantic chunk generation options are required");
  }
  const descriptor = requireProceduralDescriptor(options.descriptor);
  const key = canonicalizeSemanticChunkKey(descriptor, options.key);
  const origin = semanticChunkOrigin(key);
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
      const index = semanticChunkLocalIndex(localX, localY);
      if (!localBoundsContain(validBounds, localX, localY)) continue;
      const sample = resolver.sampleGenerated(origin.x + localX, origin.y + localY);
      const substrate = substrateFor(sample);
      const weights = quantizeBiomeWeights(sample, substrate);
      const density = quantizeUint8(sample.vegetationDensity);
      substrateClass[index] = substrate;
      macroHeight[index] = quantizeMacroHeight(sample.landform.elevation);
      const biomeOffset = index * 4;
      biomeWeights[biomeOffset] = weights[0];
      biomeWeights[biomeOffset + 1] = weights[1];
      biomeWeights[biomeOffset + 2] = weights[2];
      biomeWeights[biomeOffset + 3] = weights[3];
      const climateOffset = index * 2;
      climate[climateOffset] = quantizeUint8(sample.landform.temperature);
      climate[climateOffset + 1] = quantizeUint8(sample.landform.moisture);
      vegetationDensity[index] = density;
      vegetationProfile[index] = vegetationProfileFor(sample, density);
    }
  }
  const chunk = Object.freeze({
    key: Object.freeze(key),
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
    let index = this.entries.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (!_DrainageMinHeap.less(entry, this.entries[parent])) break;
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
      if (left >= this.entries.length) break;
      const right = left + 1;
      const child = right < this.entries.length && _DrainageMinHeap.less(this.entries[right], this.entries[left]) ? right : left;
      if (!_DrainageMinHeap.less(this.entries[child], last)) break;
      this.entries[index] = this.entries[child];
      index = child;
    }
    this.entries[index] = last;
    return first;
  }
  static less(first, second) {
    return first.drainageLevel < second.drainageLevel || first.drainageLevel === second.drainageLevel && (first.distance < second.distance || first.distance === second.distance && first.nodeIndex < second.nodeIndex);
  }
};
var STABLE_ID_SEEDS = [2166136261, 2654435769, 2246822507, 3266489909];
function hashText(value, initial) {
  let hash = initial >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
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
      const index = x * rows + y;
      if (index !== node.gridX * rows + node.gridY) result.add(index);
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
    const index = queue[cursor];
    const distance = distances[index];
    maximumDistance = Math.max(maximumDistance, distance);
    for (const candidateIndex of neighbors[index]) {
      if (componentByNode[candidateIndex] !== componentId || distances[candidateIndex] >= 0) continue;
      distances[candidateIndex] = distance + 1;
      queue.push(candidateIndex);
    }
  }
  if (maximumDistance < HYDROLOGY_MIN_EXPLICIT_LAKE_DISTANCE) {
    for (const index of component) distances[index] = -1;
    return void 0;
  }
  const minimumDistance = Math.max(
    HYDROLOGY_MIN_EXPLICIT_LAKE_DISTANCE,
    Math.ceil(maximumDistance * 2 / 3)
  );
  let selected;
  let selectedIsLocalMinimum = false;
  for (const index of component) {
    if (distances[index] < minimumDistance) continue;
    const isLocalMinimum = neighbors[index].every(
      (candidateIndex) => componentByNode[candidateIndex] !== componentId || nodes[candidateIndex].macroHeight >= nodes[index].macroHeight
    );
    if (selected === void 0 || isLocalMinimum && !selectedIsLocalMinimum || isLocalMinimum === selectedIsLocalMinimum && (nodes[index].macroHeight < nodes[selected].macroHeight || nodes[index].macroHeight === nodes[selected].macroHeight && (distances[index] > distances[selected] || distances[index] === distances[selected] && index < selected))) {
      selected = index;
      selectedIsLocalMinimum = isLocalMinimum;
    }
  }
  for (const index of component) distances[index] = -1;
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
      const index = component[cursor];
      for (const candidateIndex of neighbors[index]) {
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
    for (const index of component) {
      nodes[index].included = true;
      for (const candidateIndex of neighbors[index]) {
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
    const outletIngressIndex = neighbors[outletIndex].filter((index) => componentByNode[index] === componentId).sort((first, second) => lowerNodeFirst(nodes, first, second))[0];
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
    const oceanIndex = nodes.map((_, index) => index).sort((first, second) => lowerNodeFirst(nodes, first, second))[0];
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
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (node.macroHeight >= HYDROLOGY_SEA_LEVEL || seedIndices.has(index)) continue;
    node.drainageLevel = HYDROLOGY_SEA_LEVEL;
    node.distanceToTerminal = 0;
    node.terminalIndex = index;
    node.drainageRank = 0;
    node.settled = true;
    settled += 1;
  }
  for (const index of seedIndices) {
    const node = nodes[index];
    node.isDrainageRoot = true;
    node.drainageLevel = node.macroHeight < HYDROLOGY_SEA_LEVEL ? HYDROLOGY_SEA_LEVEL : node.macroHeight;
    node.distanceToTerminal = 0;
    node.terminalIndex = index;
    node.drainageRank = 0;
    queue.push({ nodeIndex: index, drainageLevel: node.drainageLevel, distance: 0 });
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
  const includedIndices = nodes.map((_, index) => index).filter((index) => nodes[index].included);
  const terminals = [];
  const terminalByIndex = /* @__PURE__ */ new Map();
  for (const index of includedIndices) {
    const node = nodes[index];
    if (node.downstreamIndex !== void 0) continue;
    const kind = node.macroHeight < HYDROLOGY_SEA_LEVEL ? "ocean" : "lake";
    const terminal = Object.freeze({
      nodeId: node.nodeId,
      bodyId: kind === "ocean" ? OCEAN_BODY_ID : createStableHydrologyId("lake", [graphId, node.nodeId]),
      kind,
      level: kind === "ocean" ? HYDROLOGY_SEA_LEVEL : node.macroHeight
    });
    terminalByIndex.set(index, terminal);
    terminals.push(terminal);
  }
  const byRankDescending = [...includedIndices].sort((first, second) => nodes[second].drainageRank - nodes[first].drainageRank || first - second);
  for (const index of byRankDescending) {
    const node = nodes[index];
    if (node.downstreamIndex !== void 0) {
      nodes[node.downstreamIndex].accumulatedFlow += node.accumulatedFlow;
    }
  }
  const frozenNodeByIndex = /* @__PURE__ */ new Map();
  const frozenNodes = includedIndices.map((index) => {
    const node = nodes[index];
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
    frozenNodeByIndex.set(index, frozen);
    return frozen;
  });
  const edges = [];
  for (const index of includedIndices) {
    const upstream = frozenNodeByIndex.get(index);
    const downstreamIndex = nodes[index].downstreamIndex;
    if (downstreamIndex === void 0) continue;
    const downstream = frozenNodeByIndex.get(downstreamIndex);
    if (!downstream) throw new Error("macro drainage edge resolved an excluded downstream node");
    const terminalIndex = nodes[index].terminalIndex;
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
function assertUint16(name, value) {
  if (!Number.isInteger(value) || value < 0 || value > 65535) {
    throw new RangeError(`${name} must be a Uint16 value`);
  }
}
function assertUint8(name, value) {
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
  for (let index = 0; index < segment.controlPoints.length; index += 2) {
    assertQuantizedCoordinate("river x", segment.controlPoints[index]);
    assertQuantizedCoordinate("river y", segment.controlPoints[index + 1]);
  }
  for (let index = 1; index < segment.levelProfile.length; index += 1) {
    if (segment.levelProfile[index] > segment.levelProfile[index - 1]) {
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
    assertUint8("hydrology body profileIndex", body.profileIndex);
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
    assertUint8("hydrology port width", port.width);
    assertUint16("hydrology port level", port.level);
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
    for (let index = 0; index < lake.boundaryPoints.length; index += 2) {
      assertQuantizedCoordinate("lake x", lake.boundaryPoints[index]);
      assertQuantizedCoordinate("lake y", lake.boundaryPoints[index + 1]);
    }
    assertUint16("lake level", lake.level);
    assertUint8("lake profileIndex", lake.profileIndex);
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
    assertUint8("river mouth width", mouth.width);
    assertUint16("river mouth level", mouth.level);
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

// src/world/semantic/generateHydrologyRegion.ts
var EPSILON = 1e-9;
function validBoundsFor(descriptor, key) {
  const origin = hydrologyRegionOrigin(key);
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
function basinForRegion(key) {
  const origin = hydrologyRegionOrigin(key);
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
    for (let index = 0; index < input.length; index += 1) {
      const start = input[(index + input.length - 1) % input.length];
      const end = input[index];
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
  for (let index = 0; index < 12; index += 1) {
    const angle = index / 12 * Math.PI * 2;
    circle.push({ x: node.x + Math.cos(angle) * radius, y: node.y + Math.sin(angle) * radius });
  }
  const clipped = clipPolygonToRect(circle, rect);
  if (clipped.length < 3) return void 0;
  const points = new Int16Array(clipped.length * 2);
  for (let index = 0; index < clipped.length; index += 1) {
    points[index * 2] = quantizeLocal(clipped[index].x, localOrigin.x);
    points[index * 2 + 1] = quantizeLocal(clipped[index].y, localOrigin.y);
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
function compileRegionFromGraph(graph, key, bounds) {
  const origin = hydrologyRegionOrigin(key);
  const rect = {
    minX: origin.x + bounds.minX,
    minY: origin.y + bounds.minY,
    maxX: origin.x + bounds.maxXExclusive,
    maxY: origin.y + bounds.maxYExclusive
  };
  const nodeById = new Map(graph.nodes.map((node) => [node.nodeId, node]));
  const terminalByNode = new Map(graph.terminals.map((terminal) => [terminal.nodeId, terminal]));
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
      const levelProfile = new Uint16Array([
        interpolateUint16(upstream.drainageLevel, downstream.drainageLevel, clipped.startT),
        interpolateUint16(upstream.drainageLevel, downstream.drainageLevel, clipped.endT)
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
            key.regionX,
            key.regionY,
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
          key.regionX,
          key.regionY,
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
        key.regionX,
        key.regionY,
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
    key: Object.freeze({ ...key }),
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
  generate(key) {
    const canonicalKey = canonicalizeHydrologyRegionKey(this.descriptor, key);
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

// src/world/semantic/SparseSemanticDelta.ts
var ALL_SEMANTIC_OVERRIDE_FIELDS = 1 /* Substrate */ | 2 /* MacroHeight */ | 4 /* BiomeWeights */ | 8 /* VegetationDensity */ | 16 /* VegetationProfile */;

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
var SURFACE_COMPILER_REVISION = 2;
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
function assertCanonicalSemanticDependencies(values) {
  if (!Array.isArray(values)) throw new TypeError("surface semantic dependencies must be an array");
  for (let index = 0; index < values.length; index += 1) {
    const dependency = values[index];
    if (!dependency || typeof dependency !== "object" || Object.getOwnPropertyNames(dependency).some((name) => name !== "key" && name !== "baseRevision" && name !== "deltaRevision")) {
      throw new TypeError("surface semantic dependency is invalid");
    }
    assertSemanticChunkKey(dependency.key);
    assertNonNegativeRevision("semantic base revision", dependency.baseRevision);
    assertNonNegativeRevision("semantic delta revision", dependency.deltaRevision);
    if (index > 0) {
      const previous = values[index - 1].key;
      if (previous.chunkX > dependency.key.chunkX || previous.chunkX === dependency.key.chunkX && previous.chunkY >= dependency.key.chunkY) {
        throw new TypeError("surface semantic dependencies must be strictly ordered");
      }
    }
  }
}
function assertCanonicalHydrologyDependencies(values) {
  if (!Array.isArray(values)) throw new TypeError("surface hydrology dependencies must be an array");
  for (let index = 0; index < values.length; index += 1) {
    const dependency = values[index];
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
    if (index > 0) {
      const previous = values[index - 1].key;
      if (previous.regionX > dependency.key.regionX || previous.regionX === dependency.key.regionX && previous.regionY >= dependency.key.regionY) {
        throw new TypeError("surface hydrology dependencies must be strictly ordered");
      }
    }
  }
}
function assertSurfaceDependencyKey(value) {
  if (!value || typeof value !== "object") throw new TypeError("surface dependency key must be an object");
  const key = value;
  const allowedFields = /* @__PURE__ */ new Set([
    "worldIdentity",
    "renderKey",
    "compilerRevision",
    "compileProfileVersion",
    "semanticChunks",
    "hydrologyRegions"
  ]);
  if (Object.getOwnPropertyNames(key).some((name) => !allowedFields.has(name)) || typeof key.worldIdentity !== "string" || key.worldIdentity.length === 0) {
    throw new TypeError("surface dependency key header is invalid");
  }
  assertRenderChunkKey(key.renderKey);
  assertPositiveVersion("surface compiler revision", key.compilerRevision);
  assertPositiveVersion("surface compile profile version", key.compileProfileVersion);
  assertCanonicalSemanticDependencies(key.semanticChunks);
  assertCanonicalHydrologyDependencies(key.hydrologyRegions);
}
function cloneSurfaceDependencyKey(key) {
  assertSurfaceDependencyKey(key);
  return Object.freeze({
    worldIdentity: key.worldIdentity,
    renderKey: Object.freeze({ ...key.renderKey }),
    compilerRevision: key.compilerRevision,
    compileProfileVersion: key.compileProfileVersion,
    semanticChunks: Object.freeze(key.semanticChunks.map((dependency) => Object.freeze({
      key: Object.freeze({ ...dependency.key }),
      baseRevision: dependency.baseRevision,
      deltaRevision: dependency.deltaRevision
    }))),
    hydrologyRegions: Object.freeze(key.hydrologyRegions.map((dependency) => Object.freeze({
      key: Object.freeze({ ...dependency.key }),
      baseRevision: dependency.baseRevision,
      features: Object.freeze(dependency.features.map((feature) => Object.freeze({ ...feature })))
    })))
  });
}

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
var SURFACE_LATTICE_TEST_VECTORS = Object.freeze([
  Object.freeze({ u: 0, v: 0, x: 0, z: Math.sqrt(3) / 2 }),
  Object.freeze({ u: 1, v: 0, x: 1.5, z: 0 }),
  Object.freeze({ u: -1, v: 0, x: -1.5, z: 0 }),
  Object.freeze({ u: -2, v: -3, x: -3, z: -2.5 * Math.sqrt(3) })
]);

// src/world/semantic/EffectiveSurfaceWindow.ts
var HYDROLOGY_MAX_HALF_WIDTH_TILES = 255 / (HYDROLOGY_COORDINATE_SCALE * 2);
var HYDROLOGY_REQUIREMENT_RADIUS_TILES = Math.ceil(
  HYDROLOGY_MAX_HALF_WIDTH_TILES + SURFACE_INFLUENCE_RADIUS_TILES
);
var FEATURE_ID_PATTERN = /^[a-z][a-z0-9-]*:[a-f0-9]{32}$/;
var FIELD_MIN = surfaceLatticeTexelLocalCoordinate(0, 0).u;
var FIELD_MAX = surfaceLatticeTexelLocalCoordinate(
  SURFACE_FIELD_TEXTURE_SIZE - 1,
  SURFACE_FIELD_TEXTURE_SIZE - 1
).u;
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
  for (let index = 1; index < value.levelProfile.length; index += 1) {
    if (value.levelProfile[index] > value.levelProfile[index - 1]) {
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
  const window = value;
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
  if (Object.getOwnPropertyNames(window).some((name) => !allowed.has(name)) || typeof window.worldIdentity !== "string" || window.worldIdentity.length === 0 || !Number.isSafeInteger(window.effectiveRevision) || window.effectiveRevision < 0 || !window.key || Object.getOwnPropertyNames(window.key).some((name) => name !== "chunkX" && name !== "chunkY") || !Number.isSafeInteger(window.key.chunkX) || !Number.isSafeInteger(window.key.chunkY) || window.dependencyKey.worldIdentity !== window.worldIdentity || window.dependencyKey.renderKey.chunkX !== window.key.chunkX || window.dependencyKey.renderKey.chunkY !== window.key.chunkY) {
    throw new TypeError("effective surface window identity is invalid");
  }
  assertSurfaceDependencyKey(window.dependencyKey);
  assertValidBounds(window.validBounds);
  const count = SURFACE_EFFECTIVE_WINDOW_SIZE * SURFACE_EFFECTIVE_WINDOW_SIZE;
  if (!(window.substrateClass instanceof Uint8Array) || window.substrateClass.length !== count || !(window.macroHeight instanceof Uint16Array) || window.macroHeight.length !== count || !(window.biomeWeights instanceof Uint8Array) || window.biomeWeights.length !== count * 4 || !(window.climate instanceof Uint8Array) || window.climate.length !== count * 2 || !(window.vegetationDensity instanceof Uint8Array) || window.vegetationDensity.length !== count || !(window.vegetationProfile instanceof Uint8Array) || window.vegetationProfile.length !== count || !Array.isArray(window.rivers) || !Array.isArray(window.lakes)) {
    throw new TypeError("effective surface window column lengths are invalid");
  }
  for (let index = 0; index < count; index += 1) {
    const biomeOffset = index * 4;
    if (window.substrateClass[index] >= WORLD_SUBSTRATE_CATALOG.length || window.vegetationProfile[index] >= WORLD_VEGETATION_PROFILE_CATALOG.length || window.biomeWeights[biomeOffset] + window.biomeWeights[biomeOffset + 1] + window.biomeWeights[biomeOffset + 2] + window.biomeWeights[biomeOffset + 3] !== 255) {
      throw new TypeError("effective surface window semantic values are invalid");
    }
  }
  for (const river of window.rivers) assertRiver(river);
  for (const lake of window.lakes) assertLake(lake);
  const featureRevisions = new Map(window.dependencyKey.hydrologyRegions.flatMap((region) => region.features.map((feature) => [feature.featureId, feature.revision])));
  for (const feature of [...window.rivers, ...window.lakes]) {
    if (feature.revision > 0 && featureRevisions.get(feature.bodyId) !== feature.revision) {
      throw new TypeError("effective surface feature revision is missing from the dependency key");
    }
  }
  for (let index = 1; index < window.rivers.length; index += 1) {
    if (window.rivers[index - 1].featureKey.localeCompare(window.rivers[index].featureKey) >= 0) {
      throw new TypeError("effective surface rivers must be strictly ordered");
    }
  }
  for (let index = 1; index < window.lakes.length; index += 1) {
    if (window.lakes[index - 1].featureKey.localeCompare(window.lakes[index].featureKey) >= 0) {
      throw new TypeError("effective surface lakes must be strictly ordered");
    }
  }
}
function assertWindowWithoutDescriptor(window) {
  assertValidBounds(window.validBounds);
  const count = SURFACE_EFFECTIVE_WINDOW_SIZE * SURFACE_EFFECTIVE_WINDOW_SIZE;
  if (window.substrateClass.length !== count || window.macroHeight.length !== count || window.biomeWeights.length !== count * 4 || window.climate.length !== count * 2 || window.vegetationDensity.length !== count || window.vegetationProfile.length !== count) {
    throw new TypeError("effective surface window has inconsistent semantic columns");
  }
  for (const river of window.rivers) assertRiver(river);
  for (const lake of window.lakes) assertLake(lake);
}
function effectiveSurfaceWindowTransferables(window) {
  assertWindowWithoutDescriptor(window);
  const candidates = [
    window.substrateClass.buffer,
    window.macroHeight.buffer,
    window.biomeWeights.buffer,
    window.climate.buffer,
    window.vegetationDensity.buffer,
    window.vegetationProfile.buffer
  ];
  for (const river of window.rivers) {
    candidates.push(river.controlPoints.buffer, river.widthProfile.buffer, river.levelProfile.buffer);
  }
  for (const lake of window.lakes) candidates.push(lake.boundaryPoints.buffer);
  if (candidates.some((buffer) => !(buffer instanceof ArrayBuffer))) {
    throw new TypeError("effective surface window buffers must be transferable ArrayBuffers");
  }
  const buffers = candidates;
  if (new Set(buffers).size !== buffers.length) {
    throw new TypeError("effective surface window must own distinct transferable buffers");
  }
  return Object.freeze(buffers);
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

// src/world/semantic/SurfacePresentationCompiler.ts
var WATER_INTERSECTION_SCALE = 65536;
var UINT32_SCALE = 4294967296;
function clamp2(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}
function fieldSampleIndices(localU, localV) {
  const coordinate = surfaceFieldTexelCoordinate(localU, localV);
  const x0 = clamp2(Math.floor(coordinate.u), 0, SURFACE_FIELD_TEXTURE_SIZE - 2);
  const y0 = clamp2(Math.floor(coordinate.v), 0, SURFACE_FIELD_TEXTURE_SIZE - 2);
  return {
    indices: [
      surfaceLatticeIndex(x0, y0),
      surfaceLatticeIndex(x0 + 1, y0),
      surfaceLatticeIndex(x0, y0 + 1),
      surfaceLatticeIndex(x0 + 1, y0 + 1)
    ],
    amountX: clamp2(coordinate.u - x0, 0, 1),
    amountY: clamp2(coordinate.v - y0, 0, 1)
  };
}
function bilinear(values, amountX, amountY) {
  const top = values[0] + (values[1] - values[0]) * amountX;
  const bottom = values[2] + (values[3] - values[2]) * amountX;
  return top + (bottom - top) * amountY;
}
function sampleField(field2, channel, localU, localV) {
  const sample = fieldSampleIndices(localU, localV);
  const values = sample.indices.map((index) => channel === "coverage" ? field2.waterCoverage[index] : decodeFloat16(channel === "ground" ? field2.groundHeight[index] : field2.shorelineDistance[index]));
  return bilinear(values, sample.amountX, sample.amountY);
}
function quantizedWaterVertex(builder, x, y) {
  const quantizedX = Math.round(x * WATER_INTERSECTION_SCALE);
  const quantizedY = Math.round(y * WATER_INTERSECTION_SCALE);
  const key = `${quantizedX},${quantizedY}`;
  const existing = builder.vertexByKey.get(key);
  if (existing !== void 0) return existing;
  const index = builder.coordinates.length / 2;
  builder.coordinates.push(
    -0.5 + quantizedX / (WATER_INTERSECTION_SCALE * SURFACE_SAMPLES_PER_TILE_INTERVAL),
    -0.5 + quantizedY / (WATER_INTERSECTION_SCALE * SURFACE_SAMPLES_PER_TILE_INTERVAL)
  );
  builder.vertexByKey.set(key, index);
  return index;
}
function waterIntersection(first, second) {
  const difference = second.coverage - first.coverage;
  const amount = difference === 0 ? 0.5 : clamp2((SURFACE_WATER_COVERAGE_THRESHOLD - first.coverage) / difference, 0, 1);
  return {
    x: first.x + (second.x - first.x) * amount,
    y: first.y + (second.y - first.y) * amount,
    coverage: SURFACE_WATER_COVERAGE_THRESHOLD
  };
}
function clipTriangleToWater(corners) {
  const output = [];
  for (let index = 0; index < corners.length; index += 1) {
    const current = corners[index];
    const next = corners[(index + 1) % corners.length];
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
  for (let index = 1; index < polygon.length - 1; index += 1) {
    const second = quantizedWaterVertex(builder, polygon[index].x, polygon[index].y);
    const third = quantizedWaterVertex(builder, polygon[index + 1].x, polygon[index + 1].y);
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
function riverPointWidth(river, index) {
  return river.widthProfile[index] / HYDROLOGY_COORDINATE_SCALE * Math.sqrt(3) / 2;
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
    for (let index = 0; index < pointCount; index += 1) {
      const current = surfaceToWorld(
        river.controlPoints[index * 2],
        river.controlPoints[index * 2 + 1]
      );
      const previous = surfaceToWorld(
        river.controlPoints[Math.max(0, index - 1) * 2],
        river.controlPoints[Math.max(0, index - 1) * 2 + 1]
      );
      const next = surfaceToWorld(
        river.controlPoints[Math.min(pointCount - 1, index + 1) * 2],
        river.controlPoints[Math.min(pointCount - 1, index + 1) * 2 + 1]
      );
      let tangentX = next.x - previous.x;
      let tangentZ = next.z - previous.z;
      const length = Math.hypot(tangentX, tangentZ);
      if (!(length > 0)) throw new TypeError("narrow river sweep contains a zero-length join");
      tangentX /= length;
      tangentZ /= length;
      const halfWidth = riverPointWidth(river, index);
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
    for (let index = 0; index < pointCount - 1; index += 1) {
      if (left[index] === right[index] || left[index + 1] === right[index + 1]) continue;
      builder.indices.push(
        left[index],
        right[index],
        right[index + 1],
        left[index],
        right[index + 1],
        left[index + 1]
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
function compileWaterGeometry(window, field2, waterBodies) {
  const state = coreCoverageState(field2);
  if (!state.any) return Object.freeze({ kind: "none" });
  if (state.full) return Object.freeze({ kind: "full" });
  const riverByBody = /* @__PURE__ */ new Map();
  for (const river of window.rivers) {
    const values = riverByBody.get(river.bodyId) ?? [];
    values.push(river);
    riverByBody.set(river.bodyId, values);
  }
  const narrowOnly = waterBodies.length > 0 && waterBodies.every((body) => {
    const rivers = riverByBody.get(body.bodyId);
    return body.kind === "river" && rivers?.length && rivers.every((river) => maximumRiverWidth(river) <= SURFACE_NARROW_RIVER_MAX_WIDTH_QUANTIZED);
  });
  if (narrowOnly && window.rivers.length === 1) {
    const sweep = compileSweepMesh(window.rivers);
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
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
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
function pushSeed(output, field2, window, tileX, tileY, candidateIndex, tree, worldHash) {
  const globalX = window.key.chunkX * SURFACE_RENDER_CHUNK_SIZE + tileX;
  const globalY = window.key.chunkY * SURFACE_RENDER_CHUNK_SIZE + tileY;
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
  const shoreFactor = clamp2((shore + 0.1) / 0.9, 0, 1);
  const semanticIndex = (tileX + SURFACE_INFLUENCE_RADIUS_TILES) * SURFACE_EFFECTIVE_WINDOW_SIZE + tileY + SURFACE_INFLUENCE_RADIUS_TILES;
  const density = window.vegetationDensity[semanticIndex] / 255;
  const acceptance = density * shoreFactor * (tree ? 0.42 : 1);
  if (unitRandom(mixHash(randomKey, 2911926141)) >= acceptance) return;
  const profileIndex = window.vegetationProfile[semanticIndex];
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
function compileVegetationSeeds(window, field2) {
  const records = [];
  const worldHash = hashString(window.worldIdentity);
  for (let tileX = window.validBounds.minX; tileX < window.validBounds.maxXExclusive; tileX += 1) {
    for (let tileY = window.validBounds.minY; tileY < window.validBounds.maxYExclusive; tileY += 1) {
      for (let candidate = 0; candidate < 8; candidate += 1) {
        pushSeed(records, field2, window, tileX, tileY, candidate, false, worldHash);
      }
      for (let candidate = 8; candidate < 10; candidate += 1) {
        pushSeed(records, field2, window, tileX, tileY, candidate, true, worldHash);
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
  for (let index = 0; index < count; index += 1) {
    const record = records[index];
    tileIndex[index] = record.tileIndex;
    candidateIndex[index] = record.candidateIndex;
    randomKey[index] = record.randomKey;
    surfaceCoordinates[index * 2] = Math.round(record.localU * SURFACE_VEGETATION_COORDINATE_SCALE);
    surfaceCoordinates[index * 2 + 1] = Math.round(record.localV * SURFACE_VEGETATION_COORDINATE_SCALE);
    groundHeight[index] = Math.max(0, Math.min(65535, Math.round(record.groundHeight * 65535)));
    species[index] = record.species;
    scale[index] = record.scale;
    rotation[index] = record.rotation;
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
var validatedCompiledChunks = /* @__PURE__ */ new WeakSet();
function clamp3(value, minimum, maximum) {
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
  const sampleU = clamp3(
    localU,
    -SURFACE_INFLUENCE_RADIUS_TILES,
    SURFACE_RENDER_CHUNK_SIZE + SURFACE_INFLUENCE_RADIUS_TILES - 1
  );
  const sampleV = clamp3(
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
  for (let index = 0; index < points.length; index += 2) {
    const world = surfaceToWorld(points[index], points[index + 1]);
    result[index] = world.x;
    result[index + 1] = world.z;
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
  return clamp3(Math.floor((0.5 + signedDistance / (TEXEL_ANTIALIAS_DISTANCE * 2)) * 255 + 0.5), 0, 255);
}
function riverCandidate(x, z, river) {
  let best;
  let bestSignedDistance = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < river.worldPoints.length - 2; index += 2) {
    const startX = river.worldPoints[index];
    const startZ = river.worldPoints[index + 1];
    const dx = river.worldPoints[index + 2] - startX;
    const dz = river.worldPoints[index + 3] - startZ;
    const lengthSquared = dx * dx + dz * dz;
    if (lengthSquared === 0) continue;
    const amount = clamp3(((x - startX) * dx + (z - startZ) * dz) / lengthSquared, 0, 1);
    const nearestX = startX + dx * amount;
    const nearestZ = startZ + dz * amount;
    const distance = Math.hypot(x - nearestX, z - nearestZ);
    const width = river.widthProfile[index / 2] + (river.widthProfile[index / 2 + 1] - river.widthProfile[index / 2]) * amount;
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
      level: (river.levelProfile[index / 2] + (river.levelProfile[index / 2 + 1] - river.levelProfile[index / 2]) * amount) / 65535,
      flowX: dx / length,
      flowY: dz / length
    };
  }
  return best?.coverage ? best : void 0;
}
function pointInPolygon2(x, z, points) {
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
    const amount = lengthSquared === 0 ? 0 : clamp3(((x - startX) * dx + (z - startZ) * dz) / lengthSquared, 0, 1);
    const offsetX = x - (startX + dx * amount);
    const offsetZ = z - (startZ + dz * amount);
    bestSquared = Math.min(bestSquared, offsetX * offsetX + offsetZ * offsetZ);
  }
  return Math.sqrt(bestSquared);
}
function surfaceLakeCandidate(x, z, lake) {
  const distance = polygonDistance(x, z, lake.worldPoints);
  const signedDistance = pointInPolygon2(x, z, lake.worldPoints) ? distance : -distance;
  const coverage = coverageForSignedDistance(signedDistance);
  if (coverage === 0) return void 0;
  return {
    coverage,
    rank: 2,
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
    rank: 1,
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
  for (let index = 0; index < wet.length; index += 1) wet[index] = coverage[index] >= 128 ? 1 : 0;
  for (let x = 0; x < size; x += 1) {
    for (let y = 0; y < size; y += 1) {
      const index = gridIndex(x, y, size);
      let boundary = false;
      if (x > 0 && wet[gridIndex(x - 1, y, size)] !== wet[index]) boundary = true;
      if (x + 1 < size && wet[gridIndex(x + 1, y, size)] !== wet[index]) boundary = true;
      if (y > 0 && wet[gridIndex(x, y - 1, size)] !== wet[index]) boundary = true;
      if (y + 1 < size && wet[gridIndex(x, y + 1, size)] !== wet[index]) boundary = true;
      if (boundary) boundaryByX[x].push(y);
    }
  }
  const result = new Float64Array(size * size);
  for (let x = 0; x < size; x += 1) {
    for (let y = 0; y < size; y += 1) {
      const index = gridIndex(x, y, size);
      let bestSquared = Number.POSITIVE_INFINITY;
      const minX = Math.max(0, x - SHORE_SEARCH_TEXELS);
      const maxX = Math.min(size - 1, x + SHORE_SEARCH_TEXELS);
      for (let candidateX = minX; candidateX <= maxX; candidateX += 1) {
        for (const candidateY of boundaryByX[candidateX]) {
          if (Math.abs(candidateY - y) > SHORE_SEARCH_TEXELS) continue;
          const candidateIndex = gridIndex(candidateX, candidateY, size);
          if (wet[candidateIndex] === wet[index]) continue;
          const dx = worldX[candidateIndex] - worldX[index];
          const dz = worldZ[candidateIndex] - worldZ[index];
          bestSquared = Math.min(bestSquared, dx * dx + dz * dz);
        }
      }
      const distance = Number.isFinite(bestSquared) ? Math.max(0, Math.sqrt(bestSquared) - TEXEL_ANTIALIAS_DISTANCE) : SHORE_DISTANCE_LIMIT;
      result[index] = (wet[index] ? -1 : 1) * Math.min(SHORE_DISTANCE_LIMIT, distance);
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
  const order = scaled.map((value, index) => ({ index, remainder: value - quantized[index] })).sort((first, second) => second.remainder - first.remainder || first.index - second.index);
  for (let index = 0; index < remaining; index += 1) quantized[order[index].index] += 1;
  return quantized;
}
function materialWeights(window, localU, localV, slope, shoreDistance) {
  const values = [0, 1, 2, 3].map((channel) => sampleWindowChannel(window.biomeWeights, localU, localV, 4, channel) / 255);
  const climateTemperature = sampleWindowChannel(window.climate, localU, localV, 2, 0) / 255;
  const climateMoisture = sampleWindowChannel(window.climate, localU, localV, 2, 1) / 255;
  const substrate = window.substrateClass[nearestWindowIndex(localU, localV)];
  if (substrate < 0 || substrate >= WORLD_SUBSTRATE_CATALOG.length) {
    throw new RangeError("surface compiler encountered an invalid substrate class");
  }
  if (substrate === 0 /* Sediment */) values[1] += 0.2;
  else if (substrate === 1 /* Soil */) values[0] += 0.15;
  else if (substrate === 2 /* Sand */) values[1] += 0.45;
  else if (substrate === 3 /* Rock */) values[3] += 0.5;
  else if (substrate === 4 /* Permafrost */) values[2] += 0.5;
  const steepness = clamp3(slope * 8, 0, 1);
  const shoreInfluence = clamp3(1 - Math.abs(shoreDistance) / SHORE_DISTANCE_LIMIT, 0, 1);
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
function compileSurfaceChunk(window) {
  assertTransferableEffectiveWindow(window);
  if (window.dependencyKey.compilerRevision !== SURFACE_COMPILER_REVISION || window.dependencyKey.compileProfileVersion !== SURFACE_COMPILE_PROFILE_VERSION) {
    throw new TypeError("effective surface window uses an unsupported compiler or profile revision");
  }
  const rivers = prepareRivers(window.rivers);
  const lakes = prepareLakes(window.lakes);
  const ground = new Float64Array(SURFACE_WORK_TEXEL_COUNT);
  const worldX = new Float64Array(SURFACE_WORK_TEXEL_COUNT);
  const worldZ = new Float64Array(SURFACE_WORK_TEXEL_COUNT);
  for (let physicalX = 0; physicalX < SURFACE_WORK_SIZE; physicalX += 1) {
    for (let physicalY = 0; physicalY < SURFACE_WORK_SIZE; physicalY += 1) {
      const index = gridIndex(physicalX, physicalY, SURFACE_WORK_SIZE);
      const local = workLocalCoordinate(physicalX, physicalY);
      const world = surfaceToWorld(local.u, local.v);
      worldX[index] = world.x;
      worldZ[index] = world.z;
      ground[index] = sampleWindowChannel(window.macroHeight, local.u, local.v, 1, 0) / 65535;
    }
  }
  const workCoverage = new Uint8Array(SURFACE_WORK_TEXEL_COUNT);
  const workWaterKind = new Uint8Array(SURFACE_WORK_TEXEL_COUNT);
  const workWaterProfile = new Uint8Array(SURFACE_WORK_TEXEL_COUNT);
  const workWaterLevel = new Float64Array(SURFACE_WORK_TEXEL_COUNT);
  const workFlow = new Float64Array(SURFACE_WORK_TEXEL_COUNT * 2);
  const workBodyIds = new Array(SURFACE_WORK_TEXEL_COUNT);
  for (let physicalX = 0; physicalX < SURFACE_WORK_SIZE; physicalX += 1) {
    for (let physicalY = 0; physicalY < SURFACE_WORK_SIZE; physicalY += 1) {
      const index = gridIndex(physicalX, physicalY, SURFACE_WORK_SIZE);
      let best;
      for (const river of rivers) {
        const candidate = riverCandidate(worldX[index], worldZ[index], river);
        if (candidate && candidateWins(candidate, best)) best = candidate;
      }
      for (const lake of lakes) {
        const candidate = surfaceLakeCandidate(worldX[index], worldZ[index], lake);
        if (candidate && candidateWins(candidate, best)) best = candidate;
      }
      const ocean = oceanCandidate(
        ground[index],
        fieldGradient(ground, worldX, worldZ, physicalX, physicalY, SURFACE_WORK_SIZE)
      );
      if (ocean && candidateWins(ocean, best)) best = ocean;
      if (!best) continue;
      workCoverage[index] = best.coverage;
      workWaterKind[index] = best.kind;
      workWaterProfile[index] = best.profileIndex;
      workWaterLevel[index] = best.level;
      workFlow[index * 2] = best.flowX;
      workFlow[index * 2 + 1] = best.flowY;
      workBodyIds[index] = best.bodyId;
    }
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
  const paletteById = new Map(waterBodies.map((body, index) => [body.bodyId, index + 1]));
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
      const index = surfaceLatticeIndex(physicalX, physicalY);
      const workX = physicalX + SURFACE_WORK_MARGIN_TEXELS;
      const workY = physicalY + SURFACE_WORK_MARGIN_TEXELS;
      const workIndex = gridIndex(workX, workY, SURFACE_WORK_SIZE);
      const local = surfaceLatticeTexelLocalCoordinate(physicalX, physicalY);
      field2.groundHeight[index] = encodeFloat16(ground[workIndex]);
      field2.shorelineDistance[index] = encodeFloat16(shore[workIndex]);
      field2.waterCoverage[index] = workCoverage[workIndex];
      field2.waterKind[index] = workWaterKind[workIndex];
      field2.waterProfile[index] = workWaterProfile[workIndex];
      const slope = fieldGradient(ground, worldX, worldZ, workX, workY, SURFACE_WORK_SIZE);
      field2.materialWeights.set(
        materialWeights(window, local.u, local.v, slope, shore[workIndex]),
        index * 4
      );
      if (workCoverage[workIndex] > 0) {
        const level = workWaterLevel[workIndex];
        const depth = Math.max(0, level - ground[workIndex]) * workCoverage[workIndex] / 255;
        field2.waterLevel[index] = encodeFloat16(level);
        field2.waterDepth[index] = encodeFloat16(depth);
        field2.flow[index * 2] = Math.round(clamp3(workFlow[workIndex * 2], -1, 1) * 127);
        field2.flow[index * 2 + 1] = Math.round(clamp3(workFlow[workIndex * 2 + 1], -1, 1) * 127);
        field2.waterBodyIndex[index] = paletteById.get(workBodyIds[workIndex]);
      }
      minGroundHeight = Math.min(minGroundHeight, decodeFloat16(field2.groundHeight[index]));
      maxGroundHeight = Math.max(maxGroundHeight, decodeFloat16(field2.groundHeight[index]));
      if (workCoverage[workIndex] >= 128) {
        const level = decodeFloat16(field2.waterLevel[index]);
        minWaterLevel = Math.min(minWaterLevel, level);
        maxWaterLevel = Math.max(maxWaterLevel, level);
        hasWater = true;
      }
    }
  }
  const bounds = Object.freeze({
    validTiles: Object.freeze({ ...window.validBounds }),
    minGroundHeight,
    maxGroundHeight,
    hasWater,
    minWaterLevel: hasWater ? minWaterLevel : 0,
    maxWaterLevel: hasWater ? maxWaterLevel : 0
  });
  const waterGeometry = compileWaterGeometry(window, field2, waterBodies);
  const vegetationSeeds = compileVegetationSeeds(window, field2);
  const byteLength = fieldByteLength(field2) + waterGeometryByteLength(waterGeometry) + vegetationSeedsByteLength(vegetationSeeds);
  const dependencyKey = cloneSurfaceDependencyKey(window.dependencyKey);
  const chunk = Object.freeze({
    key: Object.freeze({ ...window.key }),
    dependencyKey,
    effectiveRevision: window.effectiveRevision,
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
function assertBounds(bounds) {
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
  for (let index = 0; index < mesh.indices.length; index += 3) {
    const first = mesh.indices[index];
    const second = mesh.indices[index + 1];
    const third = mesh.indices[index + 2];
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
    if (!Array.isArray(value.featureKeys) || value.featureKeys.length === 0 || value.featureKeys.some((key, index) => typeof key !== "string" || key.length === 0 || index > 0 && value.featureKeys[index - 1].localeCompare(key) >= 0)) {
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
  for (let index = 0; index < count; index += 1) {
    const identity = value.tileIndex[index] * 10 + value.candidateIndex[index];
    const species = value.species[index];
    if (value.tileIndex[index] >= SURFACE_RENDER_CHUNK_SIZE * SURFACE_RENDER_CHUNK_SIZE || value.candidateIndex[index] >= 10 || identity <= previousIdentity || species < 0 /* Grass */ || species > 3 /* Oak */ || value.candidateIndex[index] < 8 !== (species === 0 /* Grass */) || value.scale[index] < 160) {
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
  assertBounds(chunk.bounds);
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
  for (let index = 1; index < chunk.waterBodies.length; index += 1) {
    if (chunk.waterBodies[index - 1].bodyId.localeCompare(chunk.waterBodies[index].bodyId) >= 0) {
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
  for (let index = 0; index < SURFACE_FIELD_TEXEL_COUNT; index += 1) {
    const materialOffset = index * 4;
    if (chunk.field.materialWeights[materialOffset] + chunk.field.materialWeights[materialOffset + 1] + chunk.field.materialWeights[materialOffset + 2] + chunk.field.materialWeights[materialOffset + 3] !== 255) {
      throw new TypeError("compiled surface material weights must sum to 255");
    }
    const coverage = chunk.field.waterCoverage[index];
    const kind = chunk.field.waterKind[index];
    const bodyIndex = chunk.field.waterBodyIndex[index];
    const groundHeight = decodeFloat16(chunk.field.groundHeight[index]);
    const waterLevel = decodeFloat16(chunk.field.waterLevel[index]);
    const waterDepth = decodeFloat16(chunk.field.waterDepth[index]);
    const shoreDistance = decodeFloat16(chunk.field.shorelineDistance[index]);
    if (coverage === 0 !== (kind === 0 /* None */ && bodyIndex === 0) || coverage > 0 && (kind < 1 /* Ocean */ || kind > 3 /* River */ || bodyIndex === 0 || bodyIndex > chunk.waterBodies.length) || coverage === 0 && (waterLevel !== 0 || waterDepth !== 0 || chunk.field.waterProfile[index] !== 0 || chunk.field.flow[index * 2] !== 0 || chunk.field.flow[index * 2 + 1] !== 0) || !Number.isFinite(groundHeight) || groundHeight < 0 || groundHeight > 1 || !Number.isFinite(waterLevel) || waterLevel < 0 || waterLevel > 1 || !Number.isFinite(waterDepth) || waterDepth < 0 || !Number.isFinite(shoreDistance) || Math.abs(shoreDistance) > SHORE_DISTANCE_LIMIT + 0.01) {
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

// src/world/generateWorld.worker.ts
var scope = globalThis;
var chunkResolver;
var chunkResolverKey;
var semanticResolver;
var semanticResolverKey;
var hydrologyGenerator;
var hydrologyGeneratorKey;
function resolverFor(options) {
  const key = serializeWorldDescriptor(createWorldDescriptor({
    seed: options.seed,
    chunkSize: options.chunkSize,
    world: options.world
  }));
  if (!chunkResolver || chunkResolverKey !== key) {
    chunkResolver = createWorldChunkSurfaceResolver(options);
    chunkResolverKey = key;
  }
  return chunkResolver;
}
function semanticResolverFor(options) {
  const key = serializeWorldDescriptorV2(options.descriptor);
  if (!semanticResolver || semanticResolverKey !== key) {
    semanticResolver = createSemanticChunkSurfaceResolver(options.descriptor);
    semanticResolverKey = key;
  }
  return semanticResolver;
}
function hydrologyGeneratorFor(options) {
  const key = serializeWorldDescriptorV2(options.descriptor);
  if (!hydrologyGenerator || hydrologyGeneratorKey !== key) {
    hydrologyGenerator = new HydrologyRegionGenerator(options.descriptor);
    hydrologyGeneratorKey = key;
  }
  return hydrologyGenerator;
}
function requestGeneratorVersion(request) {
  return request.type === "generateSemanticChunk" || request.type === "generateHydrologyRegion" ? WORLD_SURFACE_V2_GENERATOR_VERSION : WORLD_GENERATOR_VERSION;
}
scope.addEventListener("message", (event) => {
  try {
    const request = event.data;
    if (!request || request.protocolVersion !== WORLD_WORKER_PROTOCOL_VERSION || !Number.isSafeInteger(request.id) || ![
      "world",
      "chunk",
      "vegetation",
      "generateSemanticChunk",
      "generateHydrologyRegion",
      "compileSurfaceChunk"
    ].includes(request.type)) {
      throw new TypeError("World generator received an invalid request");
    }
    if (request.type === "compileSurfaceChunk") {
      if (request.compilerRevision !== SURFACE_COMPILER_REVISION || request.compileProfileVersion !== SURFACE_COMPILE_PROFILE_VERSION || !request.effectiveWindow) {
        throw new TypeError("World generator received an invalid surface compilation request");
      }
      const surfaceChunk = compileSurfaceChunk(request.effectiveWindow);
      const reclaimedWindowBuffers = effectiveSurfaceWindowTransferables(request.effectiveWindow);
      scope.postMessage({
        protocolVersion: WORLD_WORKER_PROTOCOL_VERSION,
        compilerRevision: SURFACE_COMPILER_REVISION,
        compileProfileVersion: SURFACE_COMPILE_PROFILE_VERSION,
        id: request.id,
        type: "compileSurfaceChunk",
        surfaceChunk,
        reclaimedWindowBuffers
      }, [
        ...compiledSurfaceChunkTransferables(surfaceChunk),
        ...reclaimedWindowBuffers
      ]);
    } else {
      if (!request.options || request.generatorVersion !== requestGeneratorVersion(request)) {
        throw new TypeError("World generator received an invalid request identity");
      }
      if (request.type === "generateHydrologyRegion") {
        const hydrologyRegion = hydrologyGeneratorFor(request.options).generate(request.options.key);
        scope.postMessage({
          protocolVersion: WORLD_WORKER_PROTOCOL_VERSION,
          generatorVersion: WORLD_SURFACE_V2_GENERATOR_VERSION,
          id: request.id,
          hydrologyRegion
        }, hydrologyRegionTransferables(hydrologyRegion));
      } else if (request.type === "generateSemanticChunk") {
        const semanticChunk = generateBaseSemanticChunkWithResolver(
          request.options,
          semanticResolverFor(request.options)
        );
        scope.postMessage({
          protocolVersion: WORLD_WORKER_PROTOCOL_VERSION,
          generatorVersion: WORLD_SURFACE_V2_GENERATOR_VERSION,
          id: request.id,
          semanticChunk
        }, baseSemanticChunkTransferables(semanticChunk));
      } else if (request.type === "chunk") {
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
      } else {
        scope.postMessage({
          protocolVersion: WORLD_WORKER_PROTOCOL_VERSION,
          generatorVersion: WORLD_GENERATOR_VERSION,
          id: request.id,
          world: generateWorld(request.options)
        });
      }
    }
  } catch (reason) {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    if (event.data?.type === "compileSurfaceChunk") {
      let reclaimedWindowBuffers = [];
      try {
        reclaimedWindowBuffers = effectiveSurfaceWindowTransferables(event.data.effectiveWindow);
      } catch {
      }
      scope.postMessage({
        protocolVersion: WORLD_WORKER_PROTOCOL_VERSION,
        compilerRevision: SURFACE_COMPILER_REVISION,
        compileProfileVersion: SURFACE_COMPILE_PROFILE_VERSION,
        id: event.data?.id,
        type: "compileSurfaceChunkError",
        reclaimedWindowBuffers,
        error: { name: error.name, message: error.message, stack: error.stack }
      }, [...reclaimedWindowBuffers]);
    } else {
      scope.postMessage({
        protocolVersion: WORLD_WORKER_PROTOCOL_VERSION,
        generatorVersion: event.data?.type === "generateSemanticChunk" || event.data?.type === "generateHydrologyRegion" ? WORLD_SURFACE_V2_GENERATOR_VERSION : WORLD_GENERATOR_VERSION,
        id: event.data?.id,
        error: { name: error.name, message: error.message, stack: error.stack }
      });
    }
  }
});
//# sourceMappingURL=world-generator.worker.mjs.map