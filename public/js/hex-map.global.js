(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('three')) :
  typeof define === 'function' && define.amd ? define(['exports', 'three'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.HexMap = {}, global.THREE));
})(this, (function (exports, three) { 'use strict';

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
    __defProp(target, "default", { value: mod, enumerable: true }) ,
    mod
  ));

  // node_modules/two-product/two-product.js
  var require_two_product = __commonJS({
    "node_modules/two-product/two-product.js"(exports, module) {
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
    if (!wrapX && mapWidth !== void 0 && (best.x < 0 || best.x >= mapWidth)) return null;
    if (!wrapY && mapHeight !== void 0 && (best.y < 0 || best.y >= mapHeight)) return null;
    return {
      ...best,
      x: wrapX ? positiveModulo(best.x, mapWidth) : best.x,
      y: wrapY ? positiveModulo(best.y, mapHeight) : best.y
    };
  }

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
  var SharedBaseInstancedBufferGeometry = class extends three.InstancedBufferGeometry {
    constructor(base, attributeNames) {
      super();
      this.sharedAttributes = /* @__PURE__ */ new Map();
      for (const name of attributeNames) {
        const attribute = base.getAttribute(name);
        if (!attribute) continue;
        this.sharedAttributes.set(name, attribute);
        this.setAttribute(name, attribute);
      }
      this.sharedIndex = base.getIndex();
      this.setIndex(this.sharedIndex);
    }
    dispose() {
      for (const [name, attribute] of this.sharedAttributes) {
        if (this.getAttribute(name) === attribute) this.deleteAttribute(name);
      }
      const usesSharedIndex = this.getIndex() === this.sharedIndex;
      if (usesSharedIndex) this.setIndex(null);
      super.dispose();
      for (const [name, attribute] of this.sharedAttributes) this.setAttribute(name, attribute);
      if (usesSharedIndex) this.setIndex(this.sharedIndex);
    }
  };

  // src/rendering/BufferUpdateBatch.ts
  function mergeBufferUpdateRanges(ranges) {
    const sorted = ranges.filter((range) => Number.isSafeInteger(range.start) && Number.isSafeInteger(range.count) && range.start >= 0 && range.count > 0).map((range) => ({ start: range.start, count: range.count })).sort((a, b) => a.start - b.start || a.count - b.count);
    if (sorted.length === 0) return [];
    const merged = [sorted[0]];
    for (let index = 1; index < sorted.length; index += 1) {
      const next = sorted[index];
      const current = merged[merged.length - 1];
      const end = current.start + current.count;
      if (next.start > end) {
        merged.push(next);
        continue;
      }
      current.count = Math.max(end, next.start + next.count) - current.start;
    }
    return merged;
  }
  function commitBufferAttributeRanges(attribute, ranges) {
    const merged = mergeBufferUpdateRanges([...attribute.updateRanges, ...ranges]);
    if (merged.length === 0) return;
    attribute.clearUpdateRanges();
    for (const range of merged) attribute.addUpdateRange(range.start, range.count);
    attribute.needsUpdate = true;
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
  function getWorldChunkOrigin(chunkKey2, size) {
    const [chunkX, chunkY] = chunkKey2.split(",").map(Number);
    if (!Number.isInteger(chunkX) || !Number.isInteger(chunkY)) {
      throw new TypeError(`invalid world chunk key "${chunkKey2}"`);
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
  function tagWorldChunk(object, chunkKey2, kind, bounds, id = `${kind}:${chunkKey2}`) {
    const [chunkX, chunkY] = chunkKey2.split(",").map(Number);
    object.userData[WORLD_CHUNK_METADATA] = {
      id,
      key: chunkKey2,
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

uniform float hexSize; // tile circumradius, matches getHexCenter's "size" (world units)

// Beach slope towards water neighbors (see neighborsKindA/B below). waterLevel
// is where the water plane sits (see water.vertex.ts) - a coastal land tile's
// rim sinks to meet it instead of staying flat and only color-blending in 2D.
// beachWidth is the fraction of the tile's radius over which the slope happens.
uniform float waterLevel;
uniform float beachWidth;
uniform float sandAtlasIndex;

// Mountain centres and their surrounding foothill tiles form one world-space
// height field. Nothing in mountainHeightAt treats the hex centre as a summit:
// neighbouring instances therefore evaluate the same height at every shared
// vertex instead of building one cone per tile. The lighting normal is derived
// by finite differences; mountainHeight is the vertical scale in world units.
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
attribute vec4 style;        // x = atlas cell index, y = modifiers, z = edge priority, w = authoritative center relief
attribute vec3 neighborsA;   // atlas cell index of SE/S/SW neighbor (-1 = none)
attribute vec3 neighborsB;   // atlas cell index of NW/N/NE neighbor (-1 = none)
attribute vec3 neighborsPriorityA; // edge-blend priority of SE/S/SW neighbor
attribute vec3 neighborsPriorityB; // edge-blend priority of NW/N/NE neighbor
attribute vec3 neighborsKindA; // SE/S/SW: -1 no tile, 0 non-water, 1 sea, 2 coastal
attribute vec3 neighborsKindB; // NW/N/NE
// x = river/lake encoding, y/z = sea/lake mouth masks, w = adjacent-lake
// mask. Packed to leave two attribute slots for neighbour relief samples.
attribute vec4 waterEdges;
attribute float fogState; // 0 = unseen, 1 = explored (darkened), 2 = visible - see FogOfWar.ts
// x elevation, y ridge strength, z valley strength, w roughness. Values are
// sampled in global tile coordinates by LandformSampler, so chunk order and
// worker count cannot change the visible macro landform.
attribute vec4 landform;
// Normalized mountain relief sampled at SE/S/SW and NW/N/NE tile centres.
// Together with style.w at this tile centre these define a continuous fan
// surface whose shared edge endpoints are identical in adjacent instances.
attribute vec3 reliefNeighborsA;
attribute vec3 reliefNeighborsB;

varying vec2 vUV;
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
varying vec4 vLandform;

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

// Same cheap value noise as the fragment stages. Mountain relief is sampled
// exclusively in world-space so its extrema are unrelated to hex centres and
// adjacent tiles agree at every shared vertex.
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

float centerMountainRelief() {
    return style.w;
}

float cornerRelief(float center, float a, float b) {
    // -1 is the CPU surface view's explicit shoreline/out-of-map sentinel.
    // A shared corner touching water is held at the shoreline baseline.
    if (center < -0.5 || a < -0.5 || b < -0.5) return 0.0;
    // Mountain centres carry relief and ordinary land centres carry zero.
    // Averaging the same three centres makes every tile touching this world
    // vertex resolve the exact same height. Ordinary land therefore becomes
    // a short foothill ramp instead of forcing the range boundary into a
    // cliff, while two-tile-wide ridges no longer acquire a trench between
    // their mountain centres.
    return (center + a + b) / 3.0;
}

float fanTriangleRelief(vec2 p, vec2 a, vec2 b, float center, float ha, float hb) {
    vec2 q = p / hexSize;
    float det = a.x * b.y - a.y * b.x;
    float wa = (q.x * b.y - q.y * b.x) / det;
    float wb = (a.x * q.y - a.y * q.x) / det;
    return max(center * (1.0 - wa - wb) + ha * wa + hb * wb, 0.0);
}

// Piecewise-linear macro elevation over the six fan triangles. A corner uses
// the same three tile-centre samples from every touching hex, and a shared
// edge is the same interpolation between its two corners from either side.
// This is the actual cross-hex height contract; no tile centre is forced high.
float mountainMacroReliefAt(vec2 p) {
    float sourceCenter = centerMountainRelief();
    float cE  = cornerRelief(sourceCenter, reliefNeighborsB.z, reliefNeighborsA.x);
    float cSE = cornerRelief(sourceCenter, reliefNeighborsA.x, reliefNeighborsA.y);
    float cSW = cornerRelief(sourceCenter, reliefNeighborsA.y, reliefNeighborsA.z);
    float cW  = cornerRelief(sourceCenter, reliefNeighborsA.z, reliefNeighborsB.x);
    float cNW = cornerRelief(sourceCenter, reliefNeighborsB.x, reliefNeighborsB.y);
    float cNE = cornerRelief(sourceCenter, reliefNeighborsB.y, reliefNeighborsB.z);
    // The mesh's fan centre is derived from its six shared corner samples,
    // rather than using the tile's source sample as a seventh control point.
    // This removes the remaining tendency for every hex centre to become a
    // little convex summit; actual extrema now come from world-space detail.
    float macroCenter = (cE + cSE + cSW + cW + cNW + cNE) / 6.0;

    const vec2 C_E  = vec2(1.0, 0.0);
    const vec2 C_SE = vec2(0.5, 0.8660254);
    const vec2 C_SW = vec2(-0.5, 0.8660254);
    const vec2 C_W  = vec2(-1.0, 0.0);
    const vec2 C_NW = vec2(-0.5, -0.8660254);
    const vec2 C_NE = vec2(0.5, -0.8660254);
    float angle = atan(p.y, p.x);
    if (angle < 0.0) angle += 6.2831853;
    if (angle < 1.0471976) return fanTriangleRelief(p, C_E, C_SE, macroCenter, cE, cSE);
    if (angle < 2.0943951) return fanTriangleRelief(p, C_SE, C_SW, macroCenter, cSE, cSW);
    if (angle < 3.1415927) return fanTriangleRelief(p, C_SW, C_W, macroCenter, cSW, cW);
    if (angle < 4.1887902) return fanTriangleRelief(p, C_W, C_NW, macroCenter, cW, cNW);
    if (angle < 5.2359878) return fanTriangleRelief(p, C_NW, C_NE, macroCenter, cNW, cNE);
    return fanTriangleRelief(p, C_NE, C_E, macroCenter, cNE, cE);
}

// The generator-driven macro surface supplies the massif and summit heights.
// Four cheap world-space samples only bend/break that surface at sub-range
// scale; they never manufacture a contour line or override the macro field.
float mountainHeightAt(vec2 p, vec2 tileOffset) {
    vec2 w = tileOffset + p + worldOffset;
    vec2 terrainP = w / hexSize;
    float warp = valueNoise(terrainP * 0.075 + vec2(17.3, 41.7)) - 0.5;
    vec2 q = terrainP + vec2(warp * 4.2, warp * -2.7);
    vec2 stretched = vec2(q.x * 0.62 + q.y * 0.16, q.y * 0.24 - q.x * 0.05);
    float crestA = valueNoise(stretched * 0.38 + vec2(37.2, 11.8));
    float crestB = valueNoise(stretched * 0.57 + vec2(-19.4, 53.1));
    float crest = max(crestA, crestB * 0.92);
    float crag = valueNoise(q * 0.86 + vec2(61.3, -18.2));
    float detailScale = 0.42 + pow(crest, 1.7) * 1.05 + (crag - 0.5) * 0.2;
    return mountainMacroReliefAt(p) * max(detailScale, 0.25);
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
    float riverEdges = waterEdges.x;
    float riverSeaMouthEdges = waterEdges.y;
    float riverLakeMouthEdges = waterEdges.z;
    float lakeNeighborEdges = waterEdges.w;

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

    // Mountain elevation comes from one continuous cross-tile field. A land
    // tile adjacent to mountains participates only in the shared foothill
    // corners, keeping the range boundary continuous without lifting its
    // centre. Interior hex edges are no longer local peak/rim pairs.
    float raiseY = 0.0;
    vec2 mountainSlope = vec2(0.0);
    float elevation = 0.0;
    float reliefInfluence = max(max(centerMountainRelief(), 0.0), max(
        max(reliefNeighborsA.x, max(reliefNeighborsA.y, reliefNeighborsA.z)),
        max(reliefNeighborsB.x, max(reliefNeighborsB.y, reliefNeighborsB.z))
    ));
    if (reliefInfluence > 0.001) {
        float gate = fogVisible;
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
    vNeighborsA = neighborsA;
    vNeighborsB = neighborsB;
    vNeighborsPriorityA = neighborsPriorityA;
    vNeighborsPriorityB = neighborsPriorityB;
    vNeighborsKindA = neighborsKindA;
    vNeighborsKindB = neighborsKindB;
    vElevation = elevation;
    vLandform = landform;
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
uniform vec2 terrainTextureWorldSize;
uniform float sandAtlasIndex;
uniform float landBlendWidth; // 0..1 fraction of tile radius, land-to-land diffusion size
uniform float landBlendEnabled;

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
uniform float landformDebugMode; // 0 normal, 1 elevation, 2 ridge, 3 valley, 4 roughness

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
varying vec4 vLandform;       // elevation, ridge, valley, roughness

const vec3 lightAmbient = vec3(0.55, 0.55, 0.55);
const vec3 lightDiffuse = vec3(0.55, 0.55, 0.55);

const vec2 DIR_SE = vec2(0.8660254, 0.5);
const vec2 DIR_S  = vec2(0.0, 1.0);
const vec2 DIR_SW = vec2(-0.8660254, 0.5);
const vec2 DIR_NW = vec2(-0.8660254, -0.5);
const vec2 DIR_N  = vec2(0.0, -1.0);
const vec2 DIR_NE = vec2(0.8660254, -0.5);

vec3 elevationDebugColor(float value) {
    vec3 ground = vec3(0.035, 0.055, 0.09);
    vec3 slope = vec3(0.12, 0.58, 0.34);
    vec3 crest = vec3(0.92, 0.42, 0.09);
    vec3 summit = vec3(0.98, 0.96, 0.9);
    vec3 color = mix(ground, slope, smoothstep(0.02, 0.34, value));
    color = mix(color, crest, smoothstep(0.34, 0.76, value));
    color = mix(color, summit, smoothstep(0.76, 1.12, value));
    float band = fract(max(value, 0.0) * 8.0);
    float contourDistance = min(band, 1.0 - band);
    return color * mix(0.58, 1.0, smoothstep(0.015, 0.075, contourDistance));
}

vec3 landformDebugColor() {
    // Mode 1 shows the final displaced surface, including the continuous
    // cross-hex mountain field. It is intentionally not the centre-only
    // generator sample stored in vLandform.x.
    if (landformDebugMode < 1.5) return elevationDebugColor(vElevation);
    if (landformDebugMode < 2.5) return mix(vec3(0.08, 0.03, 0.12), vec3(1.0, 0.38, 0.08), vLandform.y);
    if (landformDebugMode < 3.5) return mix(vec3(0.08, 0.09, 0.12), vec3(0.08, 0.76, 1.0), vLandform.z);
    return mix(vec3(0.12, 0.1, 0.18), vec3(0.95, 0.82, 0.34), vLandform.w);
}

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

// One continuous low-frequency field bends the world-space UVs and modulates
// their tone. All terrain types share this pattern, so biome blends stay
// registered. It deliberately adds ALU only: sampleTerrainCell still performs
// exactly one atlas lookup, preserving the texture-fetch budget.
vec3 terrainPattern() {
    vec2 macroP = vWorldXZ / max(hexSize * 10.0, 1.0) + vec2(13.7, -8.2);
    float macro = valueNoise(macroP);
    float warp = (macro - 0.5) * hexSize * 1.15;
    vec2 sampleWorld = vWorldXZ + vec2(warp, -warp * 0.73);
    vec2 phase = fract(sampleWorld / max(terrainTextureWorldSize, vec2(1.0)) * 0.5) * 2.0;
    // Mirrored repeat joins the same source edge to itself at every regional
    // boundary, even when the atlas cell was not authored as tileable.
    vec2 regionUV = 1.0 - abs(phase - 1.0);
    return vec3(regionUV, macro);
}

// Select one atlas cell by terrain type, then reuse the shared, warped phase.
vec2 cellIndexToUV(float idx, vec2 regionUV) {
    float atlasWidth = textureAtlasMeta.x;
    float atlasHeight = textureAtlasMeta.y;
    float cellSize = textureAtlasMeta.z;
    float inset = max(textureAtlasMeta.w, 0.5);
    float cols = atlasWidth / cellSize;
    float rows = atlasHeight / cellSize;
    float x = mod(idx, cols);
    float y = floor(idx / cols);
    vec2 cellOriginPx = vec2(x * cellSize, (rows - y - 1.0) * cellSize);
    vec2 usablePx = vec2(max(cellSize - inset * 2.0, 1.0));
    return (cellOriginPx + vec2(inset) + regionUV * usablePx)
        / vec2(atlasWidth, atlasHeight);
}

vec4 sampleTerrainCell(float idx, vec3 pattern) {
    vec4 color = texture2D(map, cellIndexToUV(idx, pattern.xy));
    float tone = mix(0.9, 1.1, smoothstep(0.08, 0.92, pattern.z));
    vec3 tint = mix(vec3(1.03, 0.98, 0.93), vec3(0.96, 1.03, 0.98), pattern.z);
    color.rgb *= tone * mix(vec3(1.0), tint, 0.18);
    return color;
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
vec4 blendEdge(
    vec4 inputColor,
    float neighborTerrain,
    float neighborPriority,
    float factor,
    float bend,
    float patch,
    vec3 pattern
) {
    if (neighborTerrain < 0.0 || neighborTerrain == vTerrain) return inputColor;
    if (neighborPriority <= vPriority) return inputColor;

    vec4 neighborColor = sampleTerrainCell(neighborTerrain, pattern);

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

    vec3 materialPattern = terrainPattern();
    vec4 texColor = sampleTerrainCell(vTerrain, materialPattern);

    if (landBlendEnabled > 0.5) {
        // One noise evaluation shared by all 6 blendEdge calls: a coarse octave
        // meanders the border position, a finer one modulates its strength into
        // patches (like the river banks' bankPatchiness below).
        float blendNoise = valueNoise(vWorldXZ * (3.0 / hexSize));
        float blendBend = (blendNoise - 0.5) * landBlendCurvature * 0.5;
        float blendPatch = clamp(0.6 + 0.8 * valueNoise(vWorldXZ * (8.0 / hexSize)), 0.0, 1.0);

        texColor = blendEdge(texColor, vNeighborsA.x, vNeighborsPriorityA.x, vEdgeFactorsA.x, blendBend, blendPatch, materialPattern); // SE
        texColor = blendEdge(texColor, vNeighborsA.y, vNeighborsPriorityA.y, vEdgeFactorsA.y, blendBend, blendPatch, materialPattern); // S
        texColor = blendEdge(texColor, vNeighborsA.z, vNeighborsPriorityA.z, vEdgeFactorsA.z, blendBend, blendPatch, materialPattern); // SW
        texColor = blendEdge(texColor, vNeighborsB.x, vNeighborsPriorityB.x, vEdgeFactorsB.x, blendBend, blendPatch, materialPattern); // NW
        texColor = blendEdge(texColor, vNeighborsB.y, vNeighborsPriorityB.y, vEdgeFactorsB.y, blendBend, blendPatch, materialPattern); // N
        texColor = blendEdge(texColor, vNeighborsB.z, vNeighborsPriorityB.z, vEdgeFactorsB.z, blendBend, blendPatch, materialPattern); // NE
    }

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
            vec4 sandColor = sampleTerrainCell(sandAtlasIndex, materialPattern);
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

    // Mountain snow only survives on local high summits. A warped world-space
    // snowline breaks the constant-height rings that used to outline every
    // ridge and made the terrain read as rows of volcanic craters.
    if (vElevation > 0.0) {
        float snowNoise = valueNoise(vWorldXZ * (0.48 / hexSize) + vec2(7.1, -3.6));
        snowNoise = 0.7 * snowNoise
            + 0.3 * valueNoise(vWorldXZ * (1.15 / hexSize) + vec2(-11.4, 9.2));
        float snowLine = 0.78 + (snowNoise - 0.5) * 0.22;
        float snowT = smoothstep(snowLine, snowLine + 0.2, vElevation);
        texColor.rgb = mix(texColor.rgb, vec3(0.93, 0.95, 0.98), snowT * 0.72);
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
    vec3 color = landformDebugMode > 0.5
        ? landformDebugColor() * (0.72 + lambertian * 0.28)
        : lightAmbient * texColor.rgb + lambertian * lightDiffuse * texColor.rgb;

    // Explored (previously seen, currently outside every unit's view range):
    // keep every feature visible, just darker - the "remembered" Civ-style look.
    if (vFogState < 1.5) color *= fogDarkenFactor;

    gl_FragColor = vec4(color, 1.0);

    if (showGrid > 0.0 && vBorder > 1.0 - gridWidth) {
        gl_FragColor = mix(vec4(gridColor, 1.0), gl_FragColor, 1.0 - gridOpacity);
    }
}
`;

  // src/shaders/terrain.fast.fragment.ts
  var TERRAIN_FAST_FRAGMENT_SHADER = `
precision highp float;

uniform sampler2D map;
uniform sampler2D fogMap;
uniform vec4 textureAtlasMeta;
uniform vec2 terrainTextureWorldSize;
uniform float sandAtlasIndex;
uniform float beachWidth;
uniform float fogDarkenFactor;
uniform float showGrid;
uniform vec3 gridColor;
uniform float gridWidth;
uniform float gridOpacity;
uniform float landformDebugMode;
uniform vec3 lightDir;
uniform float hexSize;
uniform float riverWidth;
uniform float riverBankWidth;
uniform vec3 riverColorShallow;
uniform vec3 riverColorDeep;
uniform vec3 riverBankColor;

varying vec2 vUV;
varying float vBorder;
varying float vTerrain;
varying vec3 vNormal;
varying float vFogState;
varying vec2 vFogUV;
varying float vRiverEdges;
varying vec2 vLocal;
varying vec3 vNeighborsKindA;
varying vec3 vNeighborsKindB;
varying vec3 vEdgeFactorsA;
varying vec3 vEdgeFactorsB;
varying float vElevation;
varying vec4 vLandform;
varying vec2 vWorldXZ;

const vec2 DIR_SE = vec2(0.8660254, 0.5);
const vec2 DIR_S  = vec2(0.0, 1.0);
const vec2 DIR_SW = vec2(-0.8660254, 0.5);
const vec2 DIR_NW = vec2(-0.8660254, -0.5);
const vec2 DIR_N  = vec2(0.0, -1.0);
const vec2 DIR_NE = vec2(0.8660254, -0.5);

vec3 elevationDebugColor(float value) {
    vec3 ground = vec3(0.035, 0.055, 0.09);
    vec3 slope = vec3(0.12, 0.58, 0.34);
    vec3 crest = vec3(0.92, 0.42, 0.09);
    vec3 summit = vec3(0.98, 0.96, 0.9);
    vec3 color = mix(ground, slope, smoothstep(0.02, 0.34, value));
    color = mix(color, crest, smoothstep(0.34, 0.76, value));
    color = mix(color, summit, smoothstep(0.76, 1.12, value));
    float band = fract(max(value, 0.0) * 8.0);
    float contourDistance = min(band, 1.0 - band);
    return color * mix(0.58, 1.0, smoothstep(0.015, 0.075, contourDistance));
}

vec3 landformDebugColor() {
    if (landformDebugMode < 1.5) return elevationDebugColor(vElevation);
    if (landformDebugMode < 2.5) return mix(vec3(0.08, 0.03, 0.12), vec3(1.0, 0.38, 0.08), vLandform.y);
    if (landformDebugMode < 3.5) return mix(vec3(0.08, 0.09, 0.12), vec3(0.08, 0.76, 1.0), vLandform.z);
    return mix(vec3(0.12, 0.1, 0.18), vec3(0.95, 0.82, 0.34), vLandform.w);
}

// Fast mode keeps the same single texture lookup. Two broad sine waves replace
// full value noise, providing a cheap continuous UV bend and material tint.
vec3 terrainPattern() {
    vec2 p = vWorldXZ / max(hexSize * 4.0, 1.0);
    float macro = clamp(
        0.5
            + 0.25 * sin(dot(p, vec2(0.73, 1.21)))
            + 0.25 * sin(dot(p, vec2(-1.37, 0.61)) + 1.9),
        0.0,
        1.0
    );
    float warp = (macro - 0.5) * hexSize * 1.15;
    vec2 sampleWorld = vWorldXZ + vec2(warp, -warp * 0.73);
    vec2 phase = fract(sampleWorld / max(terrainTextureWorldSize, vec2(1.0)) * 0.5) * 2.0;
    return vec3(1.0 - abs(phase - 1.0), macro);
}

vec2 cellIndexToUV(float idx, vec2 regionUV) {
    float atlasWidth = textureAtlasMeta.x;
    float atlasHeight = textureAtlasMeta.y;
    float cellSize = textureAtlasMeta.z;
    float inset = max(textureAtlasMeta.w, 0.5);
    float cols = atlasWidth / cellSize;
    float rows = atlasHeight / cellSize;
    float x = mod(idx, cols);
    float y = floor(idx / cols);
    vec2 cellOriginPx = vec2(x * cellSize, (rows - y - 1.0) * cellSize);
    vec2 usablePx = vec2(max(cellSize - inset * 2.0, 1.0));
    return (cellOriginPx + vec2(inset) + regionUV * usablePx)
        / vec2(atlasWidth, atlasHeight);
}

vec4 sampleTerrainCell(float idx, vec3 pattern) {
    vec4 color = texture2D(map, cellIndexToUV(idx, pattern.xy));
    float tone = mix(0.91, 1.09, smoothstep(0.08, 0.92, pattern.z));
    color.rgb *= tone;
    return color;
}

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

float straightCoastField() {
    vec3 kA = floor(vNeighborsKindA + 0.5);
    vec3 kB = floor(vNeighborsKindB + 0.5);
    float coast = 0.0;
    if (kA.x >= 0.5) coast = max(coast, vEdgeFactorsA.x);
    if (kA.y >= 0.5) coast = max(coast, vEdgeFactorsA.y);
    if (kA.z >= 0.5) coast = max(coast, vEdgeFactorsA.z);
    if (kB.x >= 0.5) coast = max(coast, vEdgeFactorsB.x);
    if (kB.y >= 0.5) coast = max(coast, vEdgeFactorsB.y);
    if (kB.z >= 0.5) coast = max(coast, vEdgeFactorsB.z);
    return coast;
}

void main() {
    if (vFogState < 0.5) {
        gl_FragColor = vec4(texture2D(fogMap, vFogUV).rgb, 1.0);
        return;
    }

    vec3 materialPattern = terrainPattern();
    vec4 texColor = sampleTerrainCell(vTerrain, materialPattern);

    float coast = straightCoastField();
    if (coast > 0.0) {
        float edge = 1.0 - clamp(beachWidth, 0.001, 1.0) * 0.5;
        float beachT = smoothstep(edge, 1.0, coast);
        if (beachT > 0.0) {
            texColor = mix(texColor, sampleTerrainCell(sandAtlasIndex, materialPattern), beachT);
        }
    }

    if (vRiverEdges > -0.5) {
        float mask = floor(vRiverEdges + 0.5);
        float waterT = 0.0;
        float bankT = 0.0;
        float depthT = 0.0;
        if (mask >= 2048.0) {
            waterT = 1.0;
            depthT = 1.0;
        } else {
            float d = riverChannelDist(vLocal, mask, hexSize * 0.8660254) / hexSize;
            bankT = 1.0 - smoothstep(riverWidth + riverBankWidth * 0.35, riverWidth + riverBankWidth, d);
            waterT = 1.0 - smoothstep(riverWidth - 0.04, riverWidth, d);
            depthT = 1.0 - smoothstep(0.0, riverWidth, d);
        }
        texColor = mix(texColor, vec4(riverBankColor, 1.0), bankT);
        texColor = mix(texColor, vec4(mix(riverColorShallow, riverColorDeep, depthT), 1.0), waterT);
    }

    vec3 normal = normalize(vNormal);
    float lambertian = max(dot(normalize(lightDir), normal), 0.0);
    vec3 color = landformDebugMode > 0.5
        ? landformDebugColor() * (0.72 + lambertian * 0.28)
        : texColor.rgb * (0.55 + 0.55 * lambertian);
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
attribute vec4 style;        // x = atlas cell index (unused here), y = modifiers, z = priority, w = surface relief
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

  // src/shaders/water.fast.fragment.ts
  var WATER_FAST_FRAGMENT_SHADER = `
precision highp float;

uniform sampler2D fogMap;
uniform float fogDarkenFactor;
uniform float showGrid;
uniform vec3 gridColor;
uniform float gridWidth;
uniform float gridOpacity;
uniform vec3 lightDir;
uniform vec3 waterColorDeep;
uniform vec3 waterColorShallow;

varying float vBorder;
varying float vPriority;
varying vec3 vNormal;
varying float vShoreT;
varying float vFogState;
varying vec2 vFogUV;

void main() {
    if (vFogState < 0.5) {
        gl_FragColor = vec4(texture2D(fogMap, vFogUV).rgb, 1.0);
        return;
    }

    vec3 fastDeepColor = mix(waterColorDeep, waterColorShallow, 0.45);
    vec3 color = vPriority < 0.5 ? fastDeepColor : waterColorShallow;
    color = mix(color, mix(waterColorShallow, vec3(1.0), 0.42), smoothstep(0.72, 1.0, vShoreT));
    float lambertian = max(dot(normalize(lightDir), normalize(vNormal)), 0.0);
    color *= 0.55 + 0.55 * lambertian;
    if (vFogState < 1.5) color *= fogDarkenFactor;
    gl_FragColor = vec4(color, 1.0);

    if (showGrid > 0.0 && vBorder > 1.0 - gridWidth) {
        gl_FragColor = mix(vec4(gridColor, 1.0), gl_FragColor, 1.0 - gridOpacity);
    }
}
`;

  // src/objects/TerrainMesh.ts
  var LANDFORM_DEBUG_VALUE = {
    off: 0,
    elevation: 1,
    ridge: 2,
    valley: 3,
    roughness: 4
  };
  var WATER_TYPES = ["sea" /* sea */, "coastal" /* coastal */];
  var CITY_FOG_TILE_KEY = "hexMapCityFogTile";
  var TerrainMesh = class extends three.Group {
    constructor(map, options, initialTiles) {
      super();
      this.options = options;
      this.landChunks = [];
      this.waterChunks = [];
      this.baseLodGeometries = /* @__PURE__ */ new Map();
      this.tileIndex = /* @__PURE__ */ new Map();
      this.waterTileIndex = /* @__PURE__ */ new Map();
      this.chunkRecords = /* @__PURE__ */ new Map();
      this.fogStates = /* @__PURE__ */ new Map();
      this.cityFog = /* @__PURE__ */ new Map();
      this.atlasCellIndex = {};
      this.clock = 0;
      this.lodBuilds = 0;
      this.map = map;
      if (options.surface.map !== map || options.surface.tileSize !== options.size) {
        throw new TypeError("terrain surface must match the map and tile size");
      }
      this.surface = options.surface;
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
      const surface = this.surface.createWindow();
      const reliefFor = (point) => surface.isShoreline(point.x, point.y) ? -1 : surface.getEffectiveRelief(point.x, point.y);
      const attrs = {
        offset: new Float32Array(tiles.length * 2),
        style: new Float32Array(tiles.length * 4),
        neighborsA: new Float32Array(tiles.length * 3),
        neighborsB: new Float32Array(tiles.length * 3),
        neighborsPriorityA: new Float32Array(tiles.length * 3),
        neighborsPriorityB: new Float32Array(tiles.length * 3),
        neighborsKindA: new Float32Array(tiles.length * 3),
        neighborsKindB: new Float32Array(tiles.length * 3),
        waterEdges: new Float32Array(tiles.length * 4),
        fogState: new Float32Array(tiles.length),
        // filled per tile below
        landform: new Float32Array(tiles.length * 4),
        reliefNeighborsA: new Float32Array(tiles.length * 3),
        reliefNeighborsB: new Float32Array(tiles.length * 3)
      };
      tiles.forEach((tile, i) => {
        const info = getMapTile(this.map, tile.x, tile.y);
        const center = getHexCenter(tile.x, tile.y, size);
        attrs.offset[i * 2 + 0] = center.x - origin.x;
        attrs.offset[i * 2 + 1] = center.y - origin.y;
        attrs.style[i * 4 + 0] = this.atlasCellIndex[info.type] ?? 0;
        attrs.style[i * 4 + 1] = info.modifiers?.includes("hill") ? 1 : 0;
        attrs.style[i * 4 + 2] = LandPriority[info.type] ?? 0;
        attrs.style[i * 4 + 3] = surface.isShoreline(tile.x, tile.y) ? -1 : surface.getEffectiveRelief(tile.x, tile.y);
        attrs.fogState[i] = this.fogStates.get(`${tile.x},${tile.y}`) ?? 2;
        const landform = surface.sampleGenerated(tile.x, tile.y)?.landform;
        if (landform) {
          attrs.landform[i * 4 + 0] = landform.elevation;
          attrs.landform[i * 4 + 1] = landform.ridge;
          attrs.landform[i * 4 + 2] = landform.valley;
          attrs.landform[i * 4 + 3] = landform.roughness;
        }
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
        attrs.reliefNeighborsA[i * 3 + 0] = reliefFor(se);
        attrs.reliefNeighborsA[i * 3 + 1] = reliefFor(s);
        attrs.reliefNeighborsA[i * 3 + 2] = reliefFor(sw);
        attrs.reliefNeighborsB[i * 3 + 0] = reliefFor(nw);
        attrs.reliefNeighborsB[i * 3 + 1] = reliefFor(n);
        attrs.reliefNeighborsB[i * 3 + 2] = reliefFor(ne);
        attrs.waterEdges[i * 4 + 0] = waterEdgeValue(this.map, tile.x, tile.y);
        attrs.waterEdges[i * 4 + 1] = riverSeaMouthEdgeValue(this.map, tile.x, tile.y);
        attrs.waterEdges[i * 4 + 2] = riverLakeMouthEdgeValue(this.map, tile.x, tile.y);
        attrs.waterEdges[i * 4 + 3] = lakeNeighborEdgeValue(this.map, tile.x, tile.y);
      });
      surface.clear();
      return attrs;
    }
    buildInstancedGeometry(tiles, numSubdivisions, borderSubdivisions = numSubdivisions, origin = { x: 0, y: 0 }, attributes) {
      const baseKey = `${numSubdivisions}:${borderSubdivisions}`;
      let hexagon = this.baseLodGeometries.get(baseKey);
      if (!hexagon) {
        hexagon = numSubdivisions === borderSubdivisions ? createHexagonGeometry(this.options.size, numSubdivisions) : createHexagonLodGeometry(this.options.size, numSubdivisions, borderSubdivisions);
        this.baseLodGeometries.set(baseKey, hexagon);
      }
      const geometry = new SharedBaseInstancedBufferGeometry(hexagon, ["position", "uv"]);
      geometry.instanceCount = tiles.length;
      const attrs = attributes ?? this.buildInstanceAttributes(tiles, origin);
      geometry.setAttribute("offset", new three.InstancedBufferAttribute(attrs.offset, 2));
      geometry.setAttribute("style", new three.InstancedBufferAttribute(attrs.style, 4));
      geometry.setAttribute("neighborsA", new three.InstancedBufferAttribute(attrs.neighborsA, 3));
      geometry.setAttribute("neighborsB", new three.InstancedBufferAttribute(attrs.neighborsB, 3));
      geometry.setAttribute("neighborsPriorityA", new three.InstancedBufferAttribute(attrs.neighborsPriorityA, 3));
      geometry.setAttribute("neighborsPriorityB", new three.InstancedBufferAttribute(attrs.neighborsPriorityB, 3));
      geometry.setAttribute("neighborsKindA", new three.InstancedBufferAttribute(attrs.neighborsKindA, 3));
      geometry.setAttribute("neighborsKindB", new three.InstancedBufferAttribute(attrs.neighborsKindB, 3));
      geometry.setAttribute("waterEdges", new three.InstancedBufferAttribute(attrs.waterEdges, 4));
      geometry.setAttribute("fogState", new three.InstancedBufferAttribute(attrs.fogState, 1));
      geometry.setAttribute("landform", new three.InstancedBufferAttribute(attrs.landform, 4));
      geometry.setAttribute("reliefNeighborsA", new three.InstancedBufferAttribute(attrs.reliefNeighborsA, 3));
      geometry.setAttribute("reliefNeighborsB", new three.InstancedBufferAttribute(attrs.reliefNeighborsB, 3));
      return geometry;
    }
    commonUniforms() {
      const atlas = this.options.atlas;
      const size = this.options.size;
      const textureRegionSize = this.options.terrainTextureRegionSize ?? 2;
      return {
        textureAtlasMeta: { value: new three.Vector4(atlas.width, atlas.height, atlas.cellSize, atlas.cellSpacing) },
        // One atlas cell spans a configurable world region (two hexes by
        // default) instead of restarting inside every tile. The unequal
        // axes match the flat-top hex lattice's column/row spacing.
        terrainTextureWorldSize: { value: new three.Vector2(
          size * 1.5 * textureRegionSize,
          size * Math.sqrt(3) * textureRegionSize
        ) },
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
        gridOpacity: { value: this.options.gridOpacity ?? 0.35 },
        landformDebugMode: { value: LANDFORM_DEBUG_VALUE[this.options.landformDebugMode ?? "off"] }
      };
    }
    //Mipmapping a multi-cell texture atlas bleeds neighboring cells into each
    //other at lower mip levels. Regional world-space sampling stays inset by
    //atlas.cellSpacing, but lower mip texels would still cross a cell boundary,
    //so keep plain bilinear filtering and accept modest distant shimmer.
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
    chunkHeightBounds(layer) {
      const waterDepth = this.options.waterDepth ?? this.options.size * 0.25;
      if (layer === "water") {
        const waveAmplitude = Math.abs(this.options.waterWaveAmplitude ?? 1.6);
        return {
          minY: -waterDepth - waveAmplitude,
          maxY: Math.max(0, -waterDepth + waveAmplitude)
        };
      }
      const riverDepth = this.options.riverDepth ?? waterDepth * 0.6;
      return {
        minY: -Math.max(waterDepth, riverDepth),
        maxY: this.surface.maximumHeight * 1.57
      };
    }
    refreshChunkHeightBounds() {
      for (const record of this.chunkRecords.values()) {
        const metadata = getWorldChunkMetadata(record.mesh);
        if (!metadata) continue;
        const bounds = this.chunkHeightBounds(record.layer);
        metadata.bounds.minY = bounds.minY;
        metadata.bounds.maxY = bounds.maxY;
      }
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
          landBlendEnabled: { value: this.options.landBlendEnabled ?? true ? 1 : 0 },
          landBlendCurvature: { value: this.options.landBlendCurvature ?? 0.5 },
          mountainHeight: { value: this.surface.mountainHeight },
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
        fragmentShader: this.options.shaderQuality === "fast" ? TERRAIN_FAST_FRAGMENT_SHADER : TERRAIN_FRAGMENT_SHADER
      }));
      if (tiles.length === 0) return;
      for (const [chunkKey2, chunkTiles] of groupTilesByWorldChunk(tiles)) {
        if (this.chunkRecords.has(`land:${chunkKey2}`)) continue;
        const geometry = new three.InstancedBufferGeometry();
        const mesh = new three.Mesh(geometry, this.landMaterial);
        const origin = getWorldChunkOrigin(chunkKey2, this.options.size);
        mesh.position.set(origin.x, 0, origin.y);
        mesh.onBeforeRender = (_renderer, _scene, _camera, _geometry, material) => {
          const shader = material;
          shader.uniforms.chunkOrigin.value.set(origin.x, origin.y);
          shader.uniformsNeedUpdate = true;
        };
        mesh.name = `terrain-chunk-land-${chunkKey2}`;
        mesh.frustumCulled = false;
        tagWorldChunk(
          mesh,
          chunkKey2,
          "land",
          localizeWorldChunkBounds(
            getWorldChunkBounds(
              chunkTiles,
              this.options.size,
              this.chunkHeightBounds("land").minY,
              this.chunkHeightBounds("land").maxY
            ),
            origin
          )
        );
        chunkTiles.forEach((tile, index) => this.tileIndex.set(`${tile.x},${tile.y}`, { mesh, index }));
        this.chunkRecords.set(`land:${chunkKey2}`, {
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
        fragmentShader: this.options.shaderQuality === "fast" ? WATER_FAST_FRAGMENT_SHADER : WATER_FRAGMENT_SHADER
      }));
      if (tiles.length === 0) return;
      for (const [chunkKey2, chunkTiles] of groupTilesByWorldChunk(tiles)) {
        if (this.chunkRecords.has(`water:${chunkKey2}`)) continue;
        const geometry = new three.InstancedBufferGeometry();
        const mesh = new three.Mesh(geometry, this.waterMaterial);
        const origin = getWorldChunkOrigin(chunkKey2, this.options.size);
        mesh.position.set(origin.x, 0, origin.y);
        mesh.onBeforeRender = (_renderer, _scene, _camera, _geometry, material) => {
          const shader = material;
          shader.uniforms.chunkOrigin.value.set(origin.x, origin.y);
          shader.uniformsNeedUpdate = true;
        };
        mesh.name = `terrain-chunk-water-${chunkKey2}`;
        mesh.frustumCulled = false;
        tagWorldChunk(
          mesh,
          chunkKey2,
          "water",
          localizeWorldChunkBounds(
            getWorldChunkBounds(
              chunkTiles,
              this.options.size,
              this.chunkHeightBounds("water").minY,
              this.chunkHeightBounds("water").maxY
            ),
            origin
          )
        );
        chunkTiles.forEach((tile, index) => this.waterTileIndex.set(`${tile.x},${tile.y}`, { mesh, index }));
        this.chunkRecords.set(`water:${chunkKey2}`, {
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
      const surfaceWindow = this.surface.createWindow();
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
        const groundHeight = surfaceWindow.getTileCenterHeight(x, y);
        const labelOffset = modelHeight * cityScale + Math.round(size / 5);
        wrapper.position.set(center.x, groundHeight, center.y);
        wrapper.userData[CITY_FOG_TILE_KEY] = key;
        this.add(wrapper);
        const sprite = makeTextSprite(` ${tile.city.name ?? "City"} `, {
          fontsize: 32,
          fontface: "Georgia",
          borderColor: { r: 0, g: 0, b: 255, a: 0.8 }
        });
        sprite.position.set(center.x, groundHeight + labelOffset, center.y);
        sprite.userData[CITY_FOG_TILE_KEY] = key;
        this.add(sprite);
        this.cityFog.set(key, {
          wrapper,
          sprite,
          x,
          y,
          labelOffset,
          materials: cityMaterials,
          owner,
          signature: this.citySignature(tile)
        });
      }
    }
    refreshCitySurfaceHeights(points) {
      const filter = points ? new Set(points.map((point) => `${point.x},${point.y}`)) : void 0;
      const surfaceWindow = this.surface.createWindow();
      for (const [key, city] of this.cityFog) {
        if (filter && !filter.has(key)) continue;
        const height = surfaceWindow.getTileCenterHeight(city.x, city.y);
        city.wrapper.position.y = height;
        city.sprite.position.y = height + city.labelOffset;
      }
    }
    async refreshCities(changes) {
      const latest = /* @__PURE__ */ new Map();
      const surfaceWindow = this.surface.createWindow();
      for (const change of changes) latest.set(`${change.point.x},${change.point.y}`, change);
      const builds = [];
      for (const [key, { point, owner }] of latest) {
        const tile = getMapTile(this.map, point.x, point.y);
        const signature = this.citySignature(tile);
        const existing = this.cityFog.get(key);
        if (existing?.signature === signature) {
          existing.owner = owner;
          const height = surfaceWindow.getTileCenterHeight(point.x, point.y);
          existing.wrapper.position.y = height;
          existing.sprite.position.y = height + existing.labelOffset;
          continue;
        }
        if (existing) this.removeCity(key);
        if (tile?.city) builds.push(this.loadCities([point], owner));
      }
      await Promise.all(builds);
    }
    citySignature(tile) {
      return tile?.city ? JSON.stringify([tile.city.name ?? null, tile.city.model ?? null]) : "";
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
    //Updates terrain/rivers/neighborhood attributes in place when a tile stays
    //on its current land/water layer. A land<->water transition changes draw
    //membership, so only that 12x12 render chunk is rebuilt. Returned ids let
    //the scheduler drop stale GPU residency records for those rebuilt shells.
    refreshTileAttributes(tiles) {
      const structuralChunkKeys = /* @__PURE__ */ new Set();
      for (const point of tiles) {
        const key = `${point.x},${point.y}`;
        const tile = getMapTile(this.map, point.x, point.y);
        const landEntry = this.tileIndex.get(key);
        const waterEntry = this.waterTileIndex.get(key);
        const expectedWater = Boolean(tile && WATER_TYPES.includes(tile.type));
        if (!tile && (landEntry || waterEntry) || expectedWater && landEntry || !expectedWater && waterEntry) {
          structuralChunkKeys.add(getWorldChunkKey(point.x, point.y));
        }
      }
      const rebuiltIds = [];
      for (const chunkKey2 of structuralChunkKeys) {
        const allTiles = /* @__PURE__ */ new Map();
        for (const layer of ["land", "water"]) {
          for (const point of this.chunkRecords.get(`${layer}:${chunkKey2}`)?.tiles ?? []) {
            allTiles.set(`${point.x},${point.y}`, point);
          }
        }
        const points = [...allTiles.values()];
        rebuiltIds.push(...this.removeTiles(points, false, void 0, true));
        this.addTiles(points);
      }
      const attributeNames = [
        "style",
        "neighborsA",
        "neighborsB",
        "neighborsPriorityA",
        "neighborsPriorityB",
        "neighborsKindA",
        "neighborsKindB",
        "waterEdges",
        "landform",
        "reliefNeighborsA",
        "reliefNeighborsB"
      ];
      const pendingUpdates = /* @__PURE__ */ new Map();
      for (const point of tiles) {
        if (structuralChunkKeys.has(getWorldChunkKey(point.x, point.y))) continue;
        const key = `${point.x},${point.y}`;
        const entry = this.tileIndex.get(key) ?? this.waterTileIndex.get(key);
        if (!entry) continue;
        const metadata = getWorldChunkMetadata(entry.mesh);
        const record = metadata ? this.chunkRecords.get(metadata.id) : void 0;
        if (!record?.attributes) continue;
        const fresh = this.buildInstanceAttributes(
          [point],
          { x: record.mesh.position.x, y: record.mesh.position.z }
        );
        const geometries = /* @__PURE__ */ new Set([
          record.mesh.geometry,
          ...record.lodGeometries.values()
        ]);
        for (const name of attributeNames) {
          const source = fresh[name];
          const target = record.attributes[name];
          const itemSize = source.length;
          const start = entry.index * itemSize;
          target.set(source, start);
          for (const geometry of geometries) {
            const attribute = geometry.getAttribute(name);
            if (!attribute) continue;
            const ranges = pendingUpdates.get(attribute) ?? [];
            ranges.push({ start, count: itemSize });
            pendingUpdates.set(attribute, ranges);
          }
        }
      }
      for (const [attribute, ranges] of pendingUpdates) commitBufferAttributeRanges(attribute, ranges);
      return rebuiltIds;
    }
    //Removes every render chunk touched by these cells. Streaming generation
    //chunks are aligned to WORLD_CHUNK_SIZE, so a render chunk is never shared
    //between two independently resident generation chunks.
    removeTiles(tiles, removeCities = true, cityOwner, preserveFog = false) {
      const chunkKeys = new Set(groupTilesByWorldChunk(tiles).keys());
      const removedIds = [];
      for (const chunkKey2 of chunkKeys) {
        for (const layer of ["land", "water"]) {
          const id = `${layer}:${chunkKey2}`;
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
      if (!preserveFog) for (const point of tiles) this.fogStates.delete(`${point.x},${point.y}`);
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
        const fastTerrain = this.options.shaderQuality === "fast";
        const subdivisions = fastTerrain ? 0 : record.layer === "land" ? [3, 2, 1][lod] : [2, 1, 0][lod];
        const borderSubdivisions = fastTerrain ? 0 : record.layer === "land" ? 3 : 2;
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
    get landformDebugMode() {
      const value = this.landMaterial?.uniforms.landformDebugMode.value ?? 0;
      return Object.entries(LANDFORM_DEBUG_VALUE).find(([, candidate]) => candidate === value)?.[0] ?? "off";
    }
    set landformDebugMode(value) {
      if (!(value in LANDFORM_DEBUG_VALUE)) throw new RangeError(`unknown landform debug mode "${String(value)}"`);
      if (this.landMaterial) this.landMaterial.uniforms.landformDebugMode.value = LANDFORM_DEBUG_VALUE[value];
    }
    get terrainTextureRegionSize() {
      const worldSize = this.landMaterial?.uniforms.terrainTextureWorldSize.value;
      return worldSize ? worldSize.x / (this.options.size * 1.5) : this.options.terrainTextureRegionSize ?? 2;
    }
    set terrainTextureRegionSize(value) {
      if (!Number.isFinite(value) || value <= 0) {
        throw new RangeError("terrainTextureRegionSize must be a positive finite number");
      }
      const worldSize = this.landMaterial?.uniforms.terrainTextureWorldSize.value;
      worldSize?.set(
        this.options.size * 1.5 * value,
        this.options.size * Math.sqrt(3) * value
      );
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
    get landBlendEnabled() {
      return (this.landMaterial?.uniforms.landBlendEnabled.value ?? 1) > 0.5;
    }
    set landBlendEnabled(value) {
      if (this.landMaterial) this.landMaterial.uniforms.landBlendEnabled.value = value ? 1 : 0;
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
      return this.surface.mountainHeight;
    }
    set mountainHeight(value) {
      this.surface.setMountainHeight(value);
      if (this.landMaterial) this.landMaterial.uniforms.mountainHeight.value = value;
      this.refreshChunkHeightBounds();
      this.refreshCitySurfaceHeights();
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
      this.setFogStates([{ x, y, state }]);
    }
    setFogStates(changes) {
      const updates = /* @__PURE__ */ new Map();
      const write = (entry, state) => {
        if (!entry) return;
        const attribute = entry.mesh.geometry.getAttribute("fogState");
        if (!attribute) return;
        attribute.array[entry.index] = state;
        const metadata = getWorldChunkMetadata(entry.mesh);
        const record = metadata ? this.chunkRecords.get(metadata.id) : void 0;
        const geometries = record ? /* @__PURE__ */ new Set([
          entry.mesh.geometry,
          ...record.lodGeometries.values()
        ]) : /* @__PURE__ */ new Set([entry.mesh.geometry]);
        for (const geometry of geometries) {
          const target = geometry.getAttribute("fogState");
          if (!target) continue;
          const ranges = updates.get(target) ?? [];
          ranges.push({ start: entry.index, count: 1 });
          updates.set(target, ranges);
        }
      };
      for (const { x, y, state } of changes) {
        const key = `${x},${y}`;
        this.fogStates.set(key, state);
        write(this.tileIndex.get(key), state);
        write(this.waterTileIndex.get(key), state);
        this.setCityFog(key, state);
      }
      for (const [attribute, ranges] of updates) commitBufferAttributeRanges(attribute, ranges);
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
      for (const geometry of this.baseLodGeometries.values()) geometry.dispose();
      this.baseLodGeometries.clear();
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

  // src/objects/Forest.ts
  var import_robust_point_in_polygon = __toESM(require_robust_pnp());

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
  var HIDDEN_TREE_MATRIX = new Float32Array([
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    1
  ]);
  function writeHiddenMatrices(target, start, count) {
    for (let index = start; index < start + count; index += 1) {
      target.set(HIDDEN_TREE_MATRIX, index * 16);
    }
  }
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
      this.fogStates = /* @__PURE__ */ new Map();
      this.suppressedTiles = /* @__PURE__ */ new Set();
      this.lodBuilds = 0;
      for (const record of chunks.values()) this.add(record.root);
    }
    setFogState(x, y, state) {
      this.setFogStates([{ x, y, state }]);
    }
    setFogStates(changes) {
      const matrixUpdates = /* @__PURE__ */ new Map();
      const colorUpdates = /* @__PURE__ */ new Map();
      for (const { x, y, state } of changes) {
        const key = `${x},${y}`;
        this.fogStates.set(key, state);
        const range = this.tileRanges.get(key);
        if (!range) continue;
        const hidden = this.suppressedTiles.has(key) || state < 0.5;
        const shade = state < 1.5 ? this.fogDarkenFactor : 1;
        for (const mesh of range.instancedMeshes) {
          const matrices = mesh.instanceMatrix.array;
          if (hidden) writeHiddenMatrices(matrices, range.start, range.count);
          else matrices.set(range.originalMatrices, range.start * 16);
          const pendingMatrices = matrixUpdates.get(mesh.instanceMatrix) ?? [];
          pendingMatrices.push({ start: range.start * 16, count: range.count * 16 });
          matrixUpdates.set(mesh.instanceMatrix, pendingMatrices);
          if (!mesh.instanceColor) continue;
          mesh.instanceColor.array.fill(shade, range.start * 3, (range.start + range.count) * 3);
          const pendingColors = colorUpdates.get(mesh.instanceColor) ?? [];
          pendingColors.push({ start: range.start * 3, count: range.count * 3 });
          colorUpdates.set(mesh.instanceColor, pendingColors);
        }
      }
      for (const [attribute, ranges] of matrixUpdates) commitBufferAttributeRanges(attribute, ranges);
      for (const [attribute, ranges] of colorUpdates) commitBufferAttributeRanges(attribute, ranges);
    }
    /** Hides one tile's instances without rebuilding or reloading its model. */
    setTileSuppressed(x, y, suppressed) {
      const key = `${x},${y}`;
      if (suppressed) this.suppressedTiles.add(key);
      else this.suppressedTiles.delete(key);
      const range = this.tileRanges.get(key);
      if (!range) return;
      const state = this.fogStates.get(key) ?? 2;
      const hidden = suppressed || state < 0.5;
      const shade = state < 1.5 ? this.fogDarkenFactor : 1;
      for (const mesh of range.instancedMeshes) {
        const matrices = mesh.instanceMatrix.array;
        if (hidden) writeHiddenMatrices(matrices, range.start, range.count);
        else matrices.set(range.originalMatrices, range.start * 16);
        commitBufferAttributeRanges(mesh.instanceMatrix, [{
          start: range.start * 16,
          count: range.count * 16
        }]);
        if (!mesh.instanceColor) continue;
        mesh.instanceColor.array.fill(shade, range.start * 3, (range.start + range.count) * 3);
        commitBufferAttributeRanges(mesh.instanceColor, [{
          start: range.start * 3,
          count: range.count * 3
        }]);
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
      const prepared = this.context.preparedChunks.get(`${record.modelPath}\0${record.chunkKey}`)?.lods.find((candidate) => candidate.lod === lod);
      if (prepared) return this.buildPreparedChunkLod(record, prepared);
      const {
        map,
        surface,
        size,
        treesPerTile,
        treeScale,
        treeFootprint,
        polygon,
        waterOptions,
        coastOptions
      } = this.context;
      const maximumDensity = Math.max(1, Math.round(treesPerTile * [1, 0.5, 0.2][lod]));
      const matrix = new three.Matrix4();
      const scaleVector = new three.Vector3();
      const matrices = new Float32Array(record.tiles.length * maximumDensity * 16);
      const ranges = /* @__PURE__ */ new Map();
      const surfaceWindow = surface.createWindow();
      let instance = 0;
      for (const tile of record.tiles) {
        const key = `${tile.x},${tile.y}`;
        const center = getHexCenter(tile.x, tile.y, size);
        const density = Math.max(1, Math.round(
          maximumDensity * surfaceWindow.getEffectiveVegetationDensity(tile.x, tile.y)
        ));
        const placed = [];
        const tileStart = instance;
        let attempts = 0;
        const waterValue = waterEdgeValue(map, tile.x, tile.y);
        const seaMouthValue = riverSeaMouthEdgeValue(map, tile.x, tile.y);
        const lakeMouthValue = riverLakeMouthEdgeValue(map, tile.x, tile.y);
        const lakeNeighborValue = lakeNeighborEdgeValue(map, tile.x, tile.y);
        while (placed.length < density && attempts < density * 20) {
          const salt = attempts++ * 17;
          const lx = (stableRandom(tile.x, tile.y, salt) * 2 - 1) * size;
          const ly = (stableRandom(tile.x, tile.y, salt + 1) * 2 - 1) * size;
          if ((0, import_robust_point_in_polygon.default)(polygon, [lx, ly]) !== -1) continue;
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
            surfaceWindow.getWorldHeight(center.x + lx, center.y + ly),
            center.y + ly - record.root.position.z
          );
          matrix.toArray(matrices, instance * 16);
          instance++;
        }
        const count = instance - tileStart;
        ranges.set(key, {
          start: tileStart,
          count,
          originalMatrices: matrices.subarray(tileStart * 16, (tileStart + count) * 16)
        });
      }
      const compactMatrices = matrices.slice(0, instance * 16);
      for (const range of ranges.values()) {
        range.originalMatrices = compactMatrices.subarray(
          range.start * 16,
          (range.start + range.count) * 16
        );
      }
      return { instanceCount: instance, matrices: compactMatrices, ranges };
    }
    buildPreparedChunkLod(record, prepared) {
      const matrices = new Float32Array(prepared.matrices.length);
      const ranges = /* @__PURE__ */ new Map();
      const surfaceWindow = this.context.surface.createWindow();
      let instanceCount = 0;
      prepared.tiles.forEach((tile, index) => {
        const preparedStart = prepared.ranges[index * 2];
        const preparedCount = prepared.ranges[index * 2 + 1];
        const count = preparedCount === 0 ? 0 : Math.max(1, Math.round(
          preparedCount * surfaceWindow.getEffectiveVegetationDensity(tile.x, tile.y)
        ));
        const start = instanceCount;
        const source = prepared.matrices.subarray(preparedStart * 16, (preparedStart + count) * 16);
        matrices.set(source, start * 16);
        for (let instance = start; instance < start + count; instance += 1) {
          const offset = instance * 16;
          matrices[offset + 13] = surfaceWindow.getWorldHeight(
            matrices[offset + 12] + record.root.position.x,
            matrices[offset + 14] + record.root.position.z
          );
        }
        instanceCount += count;
        ranges.set(`${tile.x},${tile.y}`, {
          start,
          count,
          originalMatrices: matrices.subarray(start * 16, (start + count) * 16)
        });
      });
      const compactMatrices = matrices.slice(0, instanceCount * 16);
      for (const range of ranges.values()) {
        range.originalMatrices = compactMatrices.subarray(
          range.start * 16,
          (range.start + range.count) * 16
        );
      }
      return { instanceCount, matrices: compactMatrices, ranges };
    }
    applyChunkLod(record, cached) {
      for (const tile of record.tiles) this.tileRanges.delete(`${tile.x},${tile.y}`);
      for (const mesh of record.instancedMeshes) {
        mesh.instanceMatrix.array.set(cached.matrices);
        mesh.instanceColor?.array?.fill(1, 0, cached.instanceCount * 3);
      }
      for (const [key, range] of cached.ranges) {
        const fogState = this.fogStates.get(key) ?? 2;
        const shade = fogState < 1.5 ? this.fogDarkenFactor : 1;
        if (this.suppressedTiles.has(key) || fogState < 0.5) {
          for (const mesh of record.instancedMeshes) {
            writeHiddenMatrices(mesh.instanceMatrix.array, range.start, range.count);
          }
        }
        if (shade !== 1) for (const mesh of record.instancedMeshes) {
          mesh.instanceColor?.array?.fill(shade, range.start * 3, (range.start + range.count) * 3);
        }
        this.tileRanges.set(key, { instancedMeshes: record.instancedMeshes, ...range });
      }
      for (const mesh of record.instancedMeshes) {
        mesh.count = cached.instanceCount;
        commitBufferAttributeRanges(mesh.instanceMatrix, [{ start: 0, count: cached.instanceCount * 16 }]);
        if (mesh.instanceColor) {
          commitBufferAttributeRanges(mesh.instanceColor, [{ start: 0, count: cached.instanceCount * 3 }]);
        }
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
  async function createForest(map, options, onlyTiles, sharedResources, preparedLayout) {
    const { size, surface } = options;
    const treesPerTile = options.treesPerTile ?? 20;
    const defaultModel = options.treeModel ?? "Assets/models/pinia";
    const treeScale = options.treeScale ?? 1;
    const fogDarkenFactor = options.fogDarkenFactor ?? 0.45;
    if (treesPerTile <= 0) return null;
    const tilesByModel = /* @__PURE__ */ new Map();
    const considerTile = (x, y) => {
      const tile = getMapTile(map, x, y);
      if (!tile?.modifiers?.includes("wood") || tile.city || isLakeTile(tile)) return;
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
      for (const [chunkKey2, chunkTiles] of chunks) {
        const totalInstances = chunkTiles.length * treesPerTile;
        const root = new three.Group();
        const origin = getWorldChunkOrigin(chunkKey2, size);
        root.position.set(origin.x, 0, origin.y);
        root.name = `forest-chunk-${chunkKey2}-${modelIndex}`;
        const instancedMeshes = preparedParts.map(({ geometry, material }, partIndex) => {
          const instancedMesh = new three.InstancedMesh(geometry, material, totalInstances);
          instancedMesh.name = `forest-${chunkKey2}-${partIndex}`;
          instancedMesh.instanceMatrix.setUsage(three.DynamicDrawUsage);
          instancedMesh.instanceColor = new three.InstancedBufferAttribute(new Float32Array(totalInstances * 3).fill(1), 3);
          instancedMesh.count = 0;
          instancedMesh.frustumCulled = false;
          root.add(instancedMesh);
          return instancedMesh;
        });
        const id = `forest:${chunkKey2}:${modelIndex}`;
        tagWorldChunk(
          root,
          chunkKey2,
          "forest",
          localizeWorldChunkBounds(getWorldChunkBounds(
            chunkTiles,
            size,
            surface.minimumHeight,
            surface.maximumHeight + size * 3
          ), origin),
          id
        );
        chunkRecords.set(id, {
          chunkKey: chunkKey2,
          modelPath,
          root,
          instancedMeshes,
          tiles: chunkTiles,
          lodCache: /* @__PURE__ */ new Map()
        });
      }
      modelIndex += 1;
    }
    return new ForestField(tileRanges, fogDarkenFactor, chunkRecords, {
      map,
      surface,
      size,
      treesPerTile,
      treeScale,
      treeFootprint,
      polygon,
      waterOptions,
      coastOptions,
      preparedChunks: new Map(preparedLayout?.forest.map((chunk) => [
        `${chunk.modelPath}\0${chunk.chunkKey}`,
        chunk
      ]) ?? [])
    }, resources, !sharedResources);
  }

  // src/objects/Grass.ts
  var import_robust_point_in_polygon2 = __toESM(require_robust_pnp());

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
attribute float groundHeight; // authoritative CPU surface height at the blade root

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

    vec3 worldPos = vec3(bladeOffset.x + rotated.x, groundHeight + rotated.y, bladeOffset.y + rotated.z);
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
    constructor(map, chunks, resources, options, preparedChunks, ownsResources) {
      super();
      this.map = map;
      this.chunks = chunks;
      this.resources = resources;
      this.options = options;
      this.preparedChunks = preparedChunks;
      this.ownsResources = ownsResources;
      this.tileRanges = /* @__PURE__ */ new Map();
      this.fogStates = /* @__PURE__ */ new Map();
      this.suppressedTiles = /* @__PURE__ */ new Set();
      this.lodBuilds = 0;
      for (const record of chunks.values()) this.add(record.mesh);
    }
    //Updates every blade belonging to (x, y) to the given fog state (see
    //FogOfWar.ts) - a plain attribute-slice fill + needsUpdate, no rebuild.
    //No-op for tiles with no grass (city tiles, non-"land" terrain).
    setFogState(x, y, state) {
      this.setFogStates([{ x, y, state }]);
    }
    setFogStates(changes) {
      const updates = /* @__PURE__ */ new Map();
      for (const { x, y, state } of changes) {
        const key = `${x},${y}`;
        this.fogStates.set(key, state);
        const range = this.tileRanges.get(key);
        if (!range) continue;
        const attribute = range.geometry.getAttribute("fogState");
        const visibleState = this.suppressedTiles.has(key) ? 0 : state;
        attribute.array.fill(visibleState, range.start, range.start + range.count);
        const ranges = updates.get(attribute) ?? [];
        ranges.push({ start: range.start, count: range.count });
        updates.set(attribute, ranges);
      }
      for (const [attribute, ranges] of updates) commitBufferAttributeRanges(attribute, ranges);
    }
    /** Hides one tile's blades without rebuilding its streamed render chunk. */
    setTileSuppressed(x, y, suppressed) {
      const key = `${x},${y}`;
      if (suppressed) this.suppressedTiles.add(key);
      else this.suppressedTiles.delete(key);
      const range = this.tileRanges.get(key);
      if (!range) return;
      const attribute = range.geometry.getAttribute("fogState");
      attribute.array.fill(
        suppressed ? 0 : this.fogStates.get(key) ?? 2,
        range.start,
        range.start + range.count
      );
      commitBufferAttributeRanges(attribute, [{ start: range.start, count: range.count }]);
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
          record.chunkKey,
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
      const updateRanges = [];
      for (const range of cached.ranges) {
        const state = this.suppressedTiles.has(range.key) ? 0 : this.fogStates.get(range.key) ?? 2;
        fogAttribute.array.fill(state, range.start, range.start + range.count);
        updateRanges.push({ start: range.start, count: range.count });
        this.tileRanges.set(range.key, { geometry: cached.geometry, start: range.start, count: range.count });
      }
      commitBufferAttributeRanges(fogAttribute, updateRanges);
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
    buildChunkGeometry(chunkKey2, chunkTiles, lod, origin) {
      const prepared = this.preparedChunks.get(chunkKey2)?.lods.find((candidate) => candidate.lod === lod);
      if (prepared) return this.buildPreparedChunkGeometry(prepared, origin);
      const { size, surface, bladeWidth, bladeHeight, heightVariation, waterOptions } = this.options;
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
      const groundHeights = new Float32Array(totalBlades);
      const polygon = HEXPolygon({ x: 0, y: 0 }, size * 0.8).map((p) => [p.x, p.y]);
      const pendingRanges = [];
      const surfaceWindow = surface.createWindow();
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
            valid = (0, import_robust_point_in_polygon2.default)(polygon, [lx, ly]) === -1 && !isInTileWater(lx, ly, waterValue, size, waterOptions, seaMouthValue, lakeMouthValue, lakeNeighborValue);
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
          groundHeights[instance] = surfaceWindow.getWorldHeight(center.x + lx, center.y + ly);
          instance++;
        }
        pendingRanges.push({ key, start: tileStart, count: instance - tileStart });
      }
      const geometry = new SharedBaseInstancedBufferGeometry(this.resources.blade, ["position"]);
      geometry.instanceCount = instance;
      geometry.setAttribute("offset", new three.InstancedBufferAttribute(offsets, 2));
      geometry.setAttribute("tileOffset", new three.InstancedBufferAttribute(tileOffsets, 2));
      geometry.setAttribute("angle", new three.InstancedBufferAttribute(angles, 1));
      geometry.setAttribute("scale", new three.InstancedBufferAttribute(scales, 2));
      geometry.setAttribute("phase", new three.InstancedBufferAttribute(phases, 1));
      geometry.setAttribute("shade", new three.InstancedBufferAttribute(shades, 1));
      geometry.setAttribute("fogState", new three.InstancedBufferAttribute(fogStates, 1));
      geometry.setAttribute("groundHeight", new three.InstancedBufferAttribute(groundHeights, 1));
      return { geometry, ranges: pendingRanges };
    }
    buildPreparedChunkGeometry(prepared, origin) {
      const geometry = new SharedBaseInstancedBufferGeometry(this.resources.blade, ["position"]);
      const fogStates = new Float32Array(prepared.instanceCount);
      const groundHeights = new Float32Array(prepared.instanceCount);
      const surfaceWindow = this.options.surface.createWindow();
      for (let index = 0; index < prepared.instanceCount; index += 1) {
        groundHeights[index] = surfaceWindow.getWorldHeight(
          prepared.offsets[index * 2] + origin.x,
          prepared.offsets[index * 2 + 1] + origin.y
        );
      }
      const ranges = prepared.tiles.map((tile, index) => {
        const key = `${tile.x},${tile.y}`;
        const start = prepared.ranges[index * 2];
        const count = prepared.ranges[index * 2 + 1];
        fogStates.fill(this.fogStates.get(key) ?? 2, start, start + count);
        return { key, start, count };
      });
      geometry.instanceCount = prepared.instanceCount;
      geometry.setAttribute("offset", new three.InstancedBufferAttribute(prepared.offsets, 2));
      geometry.setAttribute("tileOffset", new three.InstancedBufferAttribute(prepared.tileOffsets, 2));
      geometry.setAttribute("angle", new three.InstancedBufferAttribute(prepared.angles, 1));
      geometry.setAttribute("scale", new three.InstancedBufferAttribute(prepared.scales, 2));
      geometry.setAttribute("phase", new three.InstancedBufferAttribute(prepared.phases, 1));
      geometry.setAttribute("shade", new three.InstancedBufferAttribute(prepared.shades, 1));
      geometry.setAttribute("fogState", new three.InstancedBufferAttribute(fogStates, 1));
      geometry.setAttribute("groundHeight", new three.InstancedBufferAttribute(groundHeights, 1));
      return { geometry, ranges };
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
  function createGrassField(map, options, onlyTiles, sharedResources, preparedLayout) {
    const { size, surface } = options;
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
    for (const [chunkKey2, chunkTiles] of groupTilesByWorldChunk(tiles)) {
      const geometry = new three.InstancedBufferGeometry();
      const chunk = new three.Mesh(geometry, resources.material);
      const origin = getWorldChunkOrigin(chunkKey2, size);
      chunk.position.set(origin.x, 0, origin.y);
      chunk.onBeforeRender = (_renderer, _scene, _camera, _geometry, currentMaterial) => {
        const shader = currentMaterial;
        shader.uniforms.chunkOrigin.value.set(origin.x, origin.y);
        shader.uniformsNeedUpdate = true;
      };
      chunk.name = `grass-chunk-${chunkKey2}`;
      chunk.frustumCulled = false;
      tagWorldChunk(
        chunk,
        chunkKey2,
        "grass",
        localizeWorldChunkBounds(
          getWorldChunkBounds(
            chunkTiles,
            size,
            surface.minimumHeight,
            surface.maximumHeight + bladeHeight * (1 + heightVariation)
          ),
          origin
        )
      );
      chunks.set(`grass:${chunkKey2}`, { chunkKey: chunkKey2, mesh: chunk, tiles: chunkTiles, lodCache: /* @__PURE__ */ new Map() });
    }
    return new GrassField(map, chunks, resources, {
      size,
      surface,
      density,
      bladeWidth,
      bladeHeight,
      heightVariation,
      waterOptions
    }, new Map(preparedLayout?.grass.map((chunk) => [chunk.chunkKey, chunk]) ?? []), !sharedResources);
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
          if (!getMapTile(map, n.x, n.y)) continue;
          next.push({ x: n.x, y: n.y });
          result.push({ x: n.x, y: n.y });
        }
      }
      frontier = next;
    }
    return result;
  }

  // src/helpers/fogStateStore.ts
  var UNSET_FOG_STATE = 255;
  var MAX_DENSE_FOG_CELLS = 1e8;
  var FogStateStore = class {
    constructor(map) {
      this.map = map;
      this.sparse = /* @__PURE__ */ new Map();
      this.count = 0;
      const cells = map.w * map.h;
      if (!map.infinite && Number.isSafeInteger(map.w) && map.w >= 0 && Number.isSafeInteger(map.h) && map.h >= 0 && Number.isSafeInteger(cells) && cells <= MAX_DENSE_FOG_CELLS) {
        this.denseLength = cells;
      }
    }
    set(x, y, state) {
      if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) return;
      if (this.denseLength !== void 0) {
        const index = this.denseIndex(x, y);
        if (index === void 0) return;
        this.dense ?? (this.dense = this.createDenseStorage());
        if (this.dense[index] === UNSET_FOG_STATE) this.count += 1;
        this.dense[index] = state;
        return;
      }
      const key = `${x},${y}`;
      if (!this.sparse.has(key)) this.count += 1;
      this.sparse.set(key, state);
    }
    get(x, y) {
      if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) return void 0;
      if (this.denseLength !== void 0) {
        if (!this.dense) return void 0;
        const index = this.denseIndex(x, y);
        if (index === void 0) return void 0;
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
    denseIndex(x, y) {
      if (x < 0 || x >= this.map.w || y < 0 || y >= this.map.h) return void 0;
      return x * this.map.h + y;
    }
  };

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
      this.visible = /* @__PURE__ */ new Map();
      this.lastCandidates = 0;
      assertWrappableMap(map);
      this.state = new FogStateStore(map);
    }
    getState(x, y) {
      const normalized = normalizeMapCoordinates(this.map, x, y);
      if (!normalized) return 0 /* Unseen */;
      return this.state.get(normalized.x, normalized.y) ?? 0 /* Unseen */;
    }
    //Every existing tile, at its current state - used once at startup to sync
    //a renderer whose own default (see HexMap.setTileFog()) doesn't necessarily
    //match this class's all-Unseen initial state.
    allTiles() {
      const tiles = [];
      forEachMapTile(this.map, (_tile, x, y) => {
        tiles.push({ x, y, state: this.state.get(x, y) ?? 0 /* Unseen */ });
      });
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
      const nowVisible = /* @__PURE__ */ new Map();
      for (const viewer of viewers) {
        for (const tile of tilesWithinRange(this.map, viewer.x, viewer.y, viewer.viewRange)) {
          nowVisible.set(`${tile.x},${tile.y}`, tile);
        }
      }
      const changes = [];
      for (const [key, tile] of this.visible) {
        if (nowVisible.has(key)) continue;
        this.state.set(tile.x, tile.y, 1 /* Explored */);
        changes.push({ ...tile, state: 1 /* Explored */ });
      }
      for (const tile of nowVisible.values()) {
        if (this.state.get(tile.x, tile.y) === 2 /* Visible */) continue;
        this.state.set(tile.x, tile.y, 2 /* Visible */);
        changes.push({ ...tile, state: 2 /* Visible */ });
      }
      this.lastCandidates = this.visible.size + nowVisible.size;
      this.visible = nowVisible;
      return changes;
    }
    get lastRecomputeCandidateCount() {
      return this.lastCandidates;
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
    reserve(key, cost, pinned = false) {
      this.assertActive();
      this.assertKey(key);
      const normalized = normalizeResourceCost(cost);
      const existing = this.entries.get(key);
      const prospective = addCost(subtractCost(this.totals, existing ?? ZERO_COST), normalized);
      if (prospective.cpuBytes > this.limits.cpuBytes || prospective.gpuBytes > this.limits.gpuBytes) {
        this.rejectedReservations += 1;
        return false;
      }
      this.store(key, normalized, pinned, existing);
      return true;
    }
    forceReserve(key, cost, pinned = false) {
      this.assertActive();
      this.assertKey(key);
      const normalized = normalizeResourceCost(cost);
      this.store(key, normalized, pinned, this.entries.get(key));
    }
    release(key) {
      const existing = this.entries.get(key);
      if (!existing) return false;
      this.entries.delete(key);
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
    setPinned(key, pinned) {
      const existing = this.entries.get(key);
      if (!existing || existing.pinned === pinned) return Boolean(existing);
      this.entries.set(key, { ...existing, pinned });
      return true;
    }
    get(key) {
      return this.entries.get(key);
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
    store(key, cost, pinned, existing) {
      this.totals = addCost(subtractCost(this.totals, existing ?? ZERO_COST), cost);
      this.entries.set(key, { key, pinned, ...cost });
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
    assertKey(key) {
      if (typeof key !== "string" || key.trim().length === 0) {
        throw new TypeError("resource key is required");
      }
    }
    assertActive() {
      if (this.disposed) throw new Error("ResourceBudgetLedger has been disposed");
    }
  };
  var LedgerResourceReservationHandle = class {
    constructor(account, key, ledgerKey) {
      this.account = account;
      this.key = key;
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
    acquire(key, cost, pinned = false) {
      this.assertActive();
      this.assertLocalKey(key);
      if (this.handles.has(key)) {
        throw new Error(`resource account "${this.label}" already owns reservation "${key}"`);
      }
      const ledgerKey = `${this.prefix}${key}`;
      if (!this.ledger.reserve(ledgerKey, cost, pinned)) return void 0;
      const handle = new LedgerResourceReservationHandle(this, key, ledgerKey);
      this.handles.set(key, handle);
      return handle;
    }
    release(key) {
      return this.handles.get(key)?.release() ?? false;
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
    assertLocalKey(key) {
      if (typeof key !== "string" || key.trim().length === 0) {
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

  // src/rendering/WorldChunkScheduler.ts
  var EMPTY_STATS = {
    visibleObjects: 0,
    visibleChunks: 0,
    residentChunks: 0,
    gpuResidentChunks: 0,
    lod0: 0,
    lod1: 0,
    lod2: 0,
    registeredObjects: 0,
    sceneTraversals: 0,
    cpuResidentBytes: 0,
    gpuResidentBytes: 0,
    geometryBytes: 0,
    textureBytes: 0,
    modelBytes: 0,
    cpuBudgetBytes: 0,
    gpuBudgetBytes: 0,
    cpuBudgetExceededBytes: 0,
    gpuBudgetExceededBytes: 0,
    resourceEvictions: 0
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
      this.resourceEvictions = 0;
      this.validateOptions(options);
      this.resources = new ResourceBudgetLedger({
        cpuBytes: options.cpuCacheBytes ?? 384 * 1024 * 1024,
        gpuBytes: options.gpuCacheBytes ?? 256 * 1024 * 1024
      });
      const resources = this.resources;
      this.resourceView = Object.freeze({
        get stats() {
          return resources.stats;
        }
      });
      this.refreshResourceSnapshot();
    }
    configure(options) {
      const next = { ...this.options, ...options };
      this.validateOptions(next);
      this.options = next;
      this.resources.configure({
        cpuBytes: next.cpuCacheBytes ?? 384 * 1024 * 1024,
        gpuBytes: next.gpuCacheBytes ?? 256 * 1024 * 1024
      });
      this.refreshResourceSnapshot();
    }
    clear() {
      for (const id of this.residents.keys()) this.resources.release(this.resourceKey(id));
      this.residents.clear();
      this.frame = 0;
      this.snapshot = { ...EMPTY_STATS };
      this.registryDirty = true;
      this.resourceEvictions = 0;
      this.refreshResourceSnapshot();
    }
    /** Final owner teardown; unlike clear(), this also drops external accounts. */
    dispose() {
      this.clear();
      this.resources.dispose();
      this.refreshResourceSnapshot();
    }
    invalidateScene() {
      this.registryDirty = true;
    }
    //Streaming worlds can physically remove render shells before the normal
    //grace-frame eviction pass. Forget them immediately so residency stats and
    //cache limits never retain metadata for unloaded logical chunks.
    forget(ids) {
      for (const id of ids) {
        this.resources.release(this.resourceKey(id));
        this.residents.delete(id);
        this.bindings.delete(id);
      }
      this.registryDirty = true;
    }
    get stats() {
      this.refreshResourceSnapshot();
      return this.snapshot;
    }
    // Shared admission surface for non-chunk render owners (units, buildings,
    // effects). Namespaced reservations participate in the same CPU/GPU hard
    // limits and remain intact when chunk residency is cleared.
    get resourceBudget() {
      return this.resourceView;
    }
    createResourceAccount(label) {
      return this.resources.createAccount(label);
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
          const local = metadata.bounds;
          this.bounds.min.set(local.minX, local.minY, local.minZ);
          this.bounds.max.set(local.maxX, local.maxY, local.maxZ);
          this.bounds.applyMatrix4(object.matrixWorld);
          const dx = Math.max(0, this.bounds.min.x - target.x, target.x - this.bounds.max.x);
          const dz = Math.max(0, this.bounds.min.z - target.z, target.z - this.bounds.max.z);
          const distance = Math.hypot(dx, dz);
          const resident = this.residents.get(metadata.id);
          const resolvedLod = this.options.lodEnabled ? resolveWorldChunkLod(distance, metadata.kind, resident?.lod, this.options.lodDistances) : distance <= (metadata.kind === "grass" || metadata.kind === "forest" ? this.options.lodDistances.vegetation : this.options.renderDistance) ? 0 : null;
          const vegetation = metadata.kind === "grass" || metadata.kind === "forest";
          const bias = (this.options.lodBias ?? 0) + (vegetation ? this.options.vegetationLodBias ?? 0 : 0);
          const lod = resolvedLod === null ? null : Math.min(2, resolvedLod + bias);
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
        const resourceCost = activation ? this.activationCost(activation, geometries, request.visibleObjects) : resident?.gpuResident ? resident.resourceCost : this.activationCost({}, geometries, request.visibleObjects);
        this.residents.set(id, {
          id,
          metadata: request.metadata,
          lod: request.lod,
          lastVisible: this.frame,
          geometries,
          disposeGpu: activation?.disposeGpu ?? resident?.disposeGpu,
          gpuResident: true,
          resourceCost
        });
        this.resources.forceReserve(this.resourceKey(id), resourceCost, true);
        if (resident && resident.lod !== request.lod) {
          for (const geometry of resident.geometries) geometry.dispose();
          resident.disposeGpu?.();
        }
        lodCounts[request.lod] += 1;
      }
      this.evictInactive(this.visibleIds, hooks);
      let gpuResidentChunks = 0;
      for (const entry of this.residents.values()) if (entry.gpuResident) gpuResidentChunks += 1;
      const resourceStats = this.resources.stats;
      this.snapshot = {
        visibleObjects,
        visibleChunks: this.visibleIds.size,
        residentChunks: this.residents.size,
        gpuResidentChunks,
        lod0: lodCounts[0],
        lod1: lodCounts[1],
        lod2: lodCounts[2],
        registeredObjects: this.registeredObjects,
        sceneTraversals: this.sceneTraversals,
        cpuResidentBytes: resourceStats.cpuBytes,
        gpuResidentBytes: resourceStats.gpuBytes,
        geometryBytes: resourceStats.geometryBytes,
        textureBytes: resourceStats.textureBytes,
        modelBytes: resourceStats.modelBytes,
        cpuBudgetBytes: resourceStats.cpuLimitBytes,
        gpuBudgetBytes: resourceStats.gpuLimitBytes,
        cpuBudgetExceededBytes: resourceStats.cpuExceededBytes,
        gpuBudgetExceededBytes: resourceStats.gpuExceededBytes,
        resourceEvictions: this.resourceEvictions
      };
    }
    evictInactive(visible, hooks) {
      this.inactive.length = 0;
      for (const entry of this.residents.values()) {
        const isVisible = visible.has(entry.id);
        this.resources.setPinned(this.resourceKey(entry.id), isVisible);
        if (!isVisible) this.inactive.push(entry);
      }
      this.inactive.sort((a, b) => a.lastVisible - b.lastVisible);
      let gpuExcess = Math.max(
        0,
        this.countGpuResidents() - this.options.gpuCacheSize
      );
      for (const entry of this.inactive) {
        if (!entry.gpuResident) continue;
        const stale = this.frame - entry.lastVisible >= this.options.gpuGraceFrames;
        const byteExcess = this.resources.stats.gpuExceededBytes;
        if (!stale && gpuExcess <= 0 && byteExcess <= 0) break;
        for (const geometry of entry.geometries) geometry.dispose();
        entry.disposeGpu?.();
        entry.gpuResident = false;
        entry.resourceCost = { ...entry.resourceCost, gpuBytes: 0 };
        this.resources.forceReserve(this.resourceKey(entry.id), entry.resourceCost, false);
        this.resourceEvictions += 1;
        if (gpuExcess > 0) gpuExcess -= 1;
      }
      let cpuExcess = Math.max(0, this.residents.size - this.options.cpuCacheSize);
      for (const entry of this.inactive) {
        const stale = this.frame - entry.lastVisible >= this.options.cpuGraceFrames;
        const byteExcess = this.resources.stats.cpuExceededBytes;
        if (!stale && cpuExcess <= 0 && byteExcess <= 0) break;
        if (entry.gpuResident) {
          for (const geometry of entry.geometries) geometry.dispose();
          entry.disposeGpu?.();
        }
        hooks.release(entry.metadata);
        this.residents.delete(entry.id);
        this.resources.release(this.resourceKey(entry.id));
        this.resourceEvictions += 1;
        if (cpuExcess > 0) cpuExcess -= 1;
      }
    }
    countGpuResidents() {
      let count = 0;
      for (const entry of this.residents.values()) if (entry.gpuResident) count += 1;
      return count;
    }
    activationCost(activation, geometries, objects) {
      const measured = objects.length > 0 ? estimateObject3DResourceCost(objects) : normalizeResourceCost();
      const geometry = geometries.length > 0 ? estimateBufferGeometriesResourceBytes(geometries) : { cpuBytes: measured.cpuBytes, gpuBytes: measured.geometryBytes };
      return normalizeResourceCost({
        ...measured,
        cpuBytes: Math.max(measured.cpuBytes, geometry.cpuBytes),
        gpuBytes: Math.max(measured.gpuBytes, geometry.gpuBytes),
        geometryBytes: geometry.gpuBytes,
        ...activation.resourceCost
      });
    }
    resourceKey(id) {
      return `world-chunk:${id}`;
    }
    validateOptions(options) {
      for (const [name, value] of [
        ["gpuCacheSize", options.gpuCacheSize],
        ["cpuCacheSize", options.cpuCacheSize],
        ["gpuGraceFrames", options.gpuGraceFrames],
        ["cpuGraceFrames", options.cpuGraceFrames]
      ]) {
        if (!Number.isInteger(value) || value < 0) throw new RangeError(`${name} must be a non-negative integer`);
      }
      for (const [name, value] of [
        ["gpuCacheBytes", options.gpuCacheBytes ?? 256 * 1024 * 1024],
        ["cpuCacheBytes", options.cpuCacheBytes ?? 384 * 1024 * 1024]
      ]) {
        if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${name} must be a non-negative safe integer`);
      }
    }
    refreshResourceSnapshot() {
      const resources = this.resources.stats;
      this.snapshot = {
        ...this.snapshot,
        cpuResidentBytes: resources.cpuBytes,
        gpuResidentBytes: resources.gpuBytes,
        geometryBytes: resources.geometryBytes,
        textureBytes: resources.textureBytes,
        modelBytes: resources.modelBytes,
        cpuBudgetBytes: resources.cpuLimitBytes,
        gpuBudgetBytes: resources.gpuLimitBytes,
        cpuBudgetExceededBytes: resources.cpuExceededBytes,
        gpuBudgetExceededBytes: resources.gpuExceededBytes,
        resourceEvictions: this.resourceEvictions
      };
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
      lodBias: 0,
      vegetationLodBias: 0,
      gpuCacheSize: 128,
      cpuCacheSize: 192,
      gpuCacheBytes: 256 * 1024 * 1024,
      cpuCacheBytes: 384 * 1024 * 1024,
      gpuGraceFrames: 300,
      cpuGraceFrames: 1200
    };
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
    cancelKey(key, reason = cancellationError("Queued task was cancelled")) {
      const id = this.keyed.get(key);
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

  // src/rendering/FrameTaskScheduler.ts
  var FrameTaskScheduler = class {
    constructor(options = {}) {
      this.completed = 0;
      this.lastFrameTasks = 0;
      this.lastFrameDurationMs = 0;
      this.disposed = false;
      this.budgetMs = options.budgetMs ?? 3;
      this.maxTasksPerFrame = options.maxTasksPerFrame ?? 2;
      this.now = options.now ?? (() => performance.now());
      this.error = options.error;
      this.workCoordinator = options.coordinator;
      const queueOptions = {
        now: this.now,
        maxPendingTasks: options.maxPendingTasks,
        maxPendingWeight: options.maxPendingWeight,
        starvationMs: options.starvationMs
      };
      this.tasks = options.coordinator ? options.coordinator.createQueue(options.domain ?? "frame", queueOptions) : new PriorityTaskQueue(queueOptions);
      this.validate();
    }
    configure(options) {
      if (this.disposed) throw new Error("FrameTaskScheduler has been disposed");
      if (options.budgetMs !== void 0) this.budgetMs = options.budgetMs;
      if (options.maxTasksPerFrame !== void 0) this.maxTasksPerFrame = options.maxTasksPerFrame;
      this.validate();
    }
    enqueue(key, priority, run, options = {}) {
      if (this.disposed) throw new Error("FrameTaskScheduler has been disposed");
      if (!key) throw new TypeError("frame task key is required");
      if (!Number.isFinite(priority)) throw new RangeError("frame task priority must be finite");
      return this.tasks.enqueue({ run }, {
        key,
        priority,
        lane: options.lane ?? "visible",
        weight: options.weight,
        signal: options.signal,
        cancelled: options.cancelled
      }) !== void 0;
    }
    cancel(key) {
      return this.tasks.cancelKey(key);
    }
    clear() {
      this.tasks.clear();
      this.lastFrameTasks = 0;
      this.lastFrameDurationMs = 0;
    }
    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      this.clear();
      this.workCoordinator?.releaseQueue(this.tasks, false);
    }
    runFrame() {
      if (this.disposed) return 0;
      const started = this.now();
      let ran = 0;
      while (true) {
        if (ran >= this.maxTasksPerFrame) break;
        if (ran > 0 && this.now() - started >= this.budgetMs) break;
        const task = this.tasks.take();
        if (!task) break;
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
      const queue = this.tasks.stats;
      return {
        pendingTasks: queue.pendingTasks,
        completedTasks: this.completed,
        cancelledTasks: queue.cancelledTasks,
        lastFrameTasks: this.lastFrameTasks,
        lastFrameDurationMs: this.lastFrameDurationMs,
        oldestTaskAgeMs: queue.oldestTaskAgeMs,
        pendingWeight: queue.pendingWeight,
        shedTasks: queue.shedTasks,
        starvationPromotions: queue.starvationPromotions
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

  // src/rendering/AdaptiveStreamingController.ts
  var QUALITY = [
    { mount: 1, tasks: 1, workers: 1, resolution: 1, vegetation: 1, lod: 1, lodBias: 0, vegetationBias: 0 },
    { mount: 0.75, tasks: 0.75, workers: 0.75, resolution: 0.85, vegetation: 0.85, lod: 0.9, lodBias: 0, vegetationBias: 0 },
    { mount: 0.5, tasks: 0.5, workers: 0.5, resolution: 0.65, vegetation: 0.55, lod: 0.75, lodBias: 0, vegetationBias: 1 },
    { mount: 0.3, tasks: 0.35, workers: 0.35, resolution: 0.25, vegetation: 0.25, lod: 0.55, lodBias: 1, vegetationBias: 1 }
  ];
  var pressureState = () => ({
    level: 0,
    average: 0,
    overloadFrames: 0,
    recoveryFrames: 0,
    cooldown: 0
  });
  var AdaptiveStreamingController = class {
    constructor(options) {
      this.options = options;
      this.averageFrameMs = 0;
      this.mainThread = pressureState();
      this.gpu = pressureState();
      this.worker = pressureState();
      this.transitions = 0;
      this.latest = {};
      this.enabled = options.enabled ?? true;
      this.targetFrameMs = options.targetFrameMs ?? 1e3 / 60;
      this.degradeFrames = options.degradeFrames ?? 18;
      this.recoverFrames = options.recoverFrames ?? 180;
      this.cooldownFrames = options.cooldownFrames ?? 90;
      this.emaAlpha = options.emaAlpha ?? 0.08;
      this.validate();
      this.profile = this.createProfile();
    }
    //Returns a profile only when a quality transition occurs. Samples above
    //250ms are normally background-tab/rAF suspension and are ignored.
    sample(value) {
      const legacy = typeof value === "number";
      const sample = legacy ? { frameMs: value } : value;
      const observedFrameMs = sample?.frameMs;
      if (!this.enabled || !Number.isFinite(observedFrameMs) || observedFrameMs <= 0 || legacy && observedFrameMs > 250) return void 0;
      const frameMs = legacy ? observedFrameMs : Math.min(observedFrameMs, 250);
      this.averageFrameMs = this.averageFrameMs === 0 ? frameMs : this.averageFrameMs + (frameMs - this.averageFrameMs) * this.emaAlpha;
      this.latest = { ...sample };
      delete this.latest.frameMs;
      let changed = false;
      if (legacy) {
        changed = this.samplePressure(this.mainThread, frameMs, this.targetFrameMs) || changed;
        changed = this.samplePressure(this.gpu, frameMs, this.targetFrameMs) || changed;
        changed = this.samplePressure(this.worker, frameMs, this.targetFrameMs) || changed;
      } else {
        const mainMeasurement = this.maximumDefined(
          sample.cpuFrameMs,
          sample.frameTaskMs,
          sample.longTaskMs,
          sample.oldestFrameTaskMs !== void 0 ? sample.oldestFrameTaskMs / 2 : void 0,
          sample.frameTaskBacklog !== void 0 ? sample.frameTaskBacklog > this.options.baseMaxTasksPerFrame * 3 ? this.targetFrameMs * 2 : 0 : void 0,
          sample.cpuBudgetExceededBytes !== void 0 ? sample.cpuBudgetExceededBytes > 0 ? this.targetFrameMs * 2 : 0 : void 0
        );
        if (mainMeasurement !== void 0) {
          changed = this.samplePressure(this.mainThread, mainMeasurement, this.targetFrameMs) || changed;
        }
        const observableWorkIsIdle = (sample.frameTaskBacklog ?? 0) === 0 && (sample.oldestFrameTaskMs ?? 0) <= this.targetFrameMs && (sample.workerQueueDepth ?? 0) === 0 && (sample.workerContentionMs ?? 0) <= this.targetFrameMs * 0.25 && (mainMeasurement ?? 0) <= this.targetFrameMs * 1.12;
        const gpuTimerStalled = Boolean(
          sample.gpuTimingSupported && sample.gpuTimingSaturated && (sample.gpuSampleAgeMs === void 0 || sample.gpuSampleAgeMs > this.targetFrameMs * 2)
        );
        const inferredRenderMs = !sample.gpuTimingSupported && observableWorkIsIdle ? frameMs : gpuTimerStalled && observableWorkIsIdle ? Math.max(frameMs, this.targetFrameMs * 2) : void 0;
        const renderMeasurement = this.maximumDefined(
          sample.gpuFrameMs ?? inferredRenderMs,
          sample.gpuBudgetExceededBytes !== void 0 ? sample.gpuBudgetExceededBytes > 0 ? this.targetFrameMs * 2 : 0 : void 0,
          sample.cpuBudgetExceededBytes !== void 0 ? sample.cpuBudgetExceededBytes > 0 ? this.targetFrameMs * 2 : 0 : void 0
        );
        if (renderMeasurement !== void 0) {
          changed = this.samplePressure(this.gpu, renderMeasurement, this.targetFrameMs) || changed;
        }
        if (sample.workerContentionMs !== void 0) {
          changed = this.samplePressure(this.worker, sample.workerContentionMs, this.targetFrameMs * 0.25) || changed;
        }
      }
      if (!changed) return void 0;
      this.transitions += 1;
      this.profile = this.createProfile();
      return this.profile;
    }
    get currentProfile() {
      return this.profile;
    }
    get stats() {
      return {
        ...this.profile,
        enabled: this.enabled,
        targetFrameMs: this.targetFrameMs,
        averageFrameMs: this.averageFrameMs,
        overloadFrames: Math.max(
          this.mainThread.overloadFrames,
          this.gpu.overloadFrames,
          this.worker.overloadFrames
        ),
        recoveryFrames: Math.max(
          this.mainThread.recoveryFrames,
          this.gpu.recoveryFrames,
          this.worker.recoveryFrames
        ),
        transitions: this.transitions,
        averageCpuFrameMs: this.mainThread.average,
        averageGpuFrameMs: this.gpu.average,
        averageWorkerContentionMs: this.worker.average,
        frameTaskBacklog: this.latest.frameTaskBacklog ?? 0,
        oldestFrameTaskMs: this.latest.oldestFrameTaskMs ?? 0,
        workerQueueDepth: this.latest.workerQueueDepth ?? 0,
        workerBusyRatio: this.latest.workerBusyRatio ?? 0,
        chunkLoadLatencyMs: this.latest.chunkLoadLatencyMs ?? 0,
        chunkVisibleLatencyMs: this.latest.chunkVisibleLatencyMs ?? 0,
        uploadBytes: this.latest.uploadBytes ?? 0,
        drawCalls: this.latest.drawCalls ?? 0,
        gpuTimingSupported: this.latest.gpuTimingSupported ?? false,
        gpuTimingSaturated: this.latest.gpuTimingSaturated ?? false,
        gpuSampleAgeMs: this.latest.gpuSampleAgeMs,
        cpuBudgetExceededBytes: this.latest.cpuBudgetExceededBytes ?? 0,
        gpuBudgetExceededBytes: this.latest.gpuBudgetExceededBytes ?? 0
      };
    }
    createProfile() {
      const main = QUALITY[this.mainThread.level];
      const gpu = QUALITY[this.gpu.level];
      const worker = QUALITY[this.worker.level];
      const minimumWorkerCount = this.options.minimumWorkerCount ?? 1;
      const scaleDistance = (value) => Math.max(0, value * gpu.lod);
      return {
        qualityLevel: Math.max(this.mainThread.level, this.gpu.level, this.worker.level),
        mainThreadLevel: this.mainThread.level,
        gpuLevel: this.gpu.level,
        workerLevel: this.worker.level,
        frameBudgetMs: Math.max(0.5, this.options.baseFrameBudgetMs * main.mount),
        maxTasksPerFrame: Math.max(1, Math.round(this.options.baseMaxTasksPerFrame * main.tasks)),
        workerCount: Math.max(minimumWorkerCount, Math.round(this.options.baseWorkerCount * worker.workers)),
        resolutionScale: gpu.resolution,
        vegetationDensityScale: gpu.vegetation,
        lodDistanceScale: gpu.lod,
        lodBias: gpu.lodBias,
        vegetationLodBias: gpu.vegetationBias,
        lodDistances: {
          near: scaleDistance(this.options.baseLodDistances.near),
          far: scaleDistance(this.options.baseLodDistances.far),
          vegetation: scaleDistance(this.options.baseLodDistances.vegetation),
          hysteresis: scaleDistance(this.options.baseLodDistances.hysteresis)
        }
      };
    }
    samplePressure(state, measurement, target) {
      if (!Number.isFinite(measurement) || measurement < 0) return false;
      state.average = state.average === 0 ? measurement : state.average + (measurement - state.average) * this.emaAlpha;
      if (state.cooldown > 0) state.cooldown -= 1;
      const overloaded = state.average > target * 1.12;
      const recoverable = state.average < target * 1.03;
      state.overloadFrames = overloaded ? state.overloadFrames + 1 : 0;
      state.recoveryFrames = recoverable ? state.recoveryFrames + 1 : 0;
      if (state.cooldown > 0) return false;
      if (state.overloadFrames >= this.degradeFrames && state.level < QUALITY.length - 1) {
        state.level += 1;
        state.overloadFrames = 0;
        state.recoveryFrames = 0;
        state.cooldown = this.cooldownFrames;
        return true;
      }
      if (state.recoveryFrames >= this.recoverFrames && state.level > 0) {
        state.level -= 1;
        state.overloadFrames = 0;
        state.recoveryFrames = 0;
        state.cooldown = this.cooldownFrames;
        return true;
      }
      return false;
    }
    maximumDefined(...values) {
      const defined = values.filter((value) => value !== void 0);
      return defined.length > 0 ? Math.max(...defined) : void 0;
    }
    validate() {
      const positive2 = (name, value) => {
        if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be positive`);
      };
      positive2("targetFrameMs", this.targetFrameMs);
      positive2("baseFrameBudgetMs", this.options.baseFrameBudgetMs);
      if (!Number.isInteger(this.options.baseMaxTasksPerFrame) || this.options.baseMaxTasksPerFrame <= 0) {
        throw new RangeError("baseMaxTasksPerFrame must be a positive integer");
      }
      if (!Number.isInteger(this.options.baseWorkerCount) || this.options.baseWorkerCount <= 0) {
        throw new RangeError("baseWorkerCount must be a positive integer");
      }
      const minimumWorkerCount = this.options.minimumWorkerCount ?? 1;
      if (!Number.isInteger(minimumWorkerCount) || minimumWorkerCount <= 0 || minimumWorkerCount > this.options.baseWorkerCount) {
        throw new RangeError("minimumWorkerCount must be between 1 and baseWorkerCount");
      }
      for (const [name, value] of [
        ["degradeFrames", this.degradeFrames],
        ["recoverFrames", this.recoverFrames],
        ["cooldownFrames", this.cooldownFrames]
      ]) {
        if (!Number.isInteger(value) || value < 0) throw new RangeError(`${name} must be a non-negative integer`);
      }
      if (!Number.isFinite(this.emaAlpha) || this.emaAlpha <= 0 || this.emaAlpha > 1) {
        throw new RangeError("emaAlpha must be in (0, 1]");
      }
    }
  };

  // src/rendering/WorldRenderLayer.ts
  var WorldRenderLayerLifecycleError = class extends Error {
    constructor(message, errors) {
      super(`${message}${errors.length > 0 ? `: ${errors.map((error) => error.message).join("; ")}` : ""}`);
      this.errors = errors;
      this.name = "WorldRenderLayerLifecycleError";
    }
  };
  function asLifecycleError(reason) {
    return reason instanceof Error ? reason : new Error(String(reason));
  }
  var WorldRenderLayerRegistry = class {
    constructor() {
      this.layers = /* @__PURE__ */ new Map();
      this.kinds = /* @__PURE__ */ new Map();
    }
    register(layer) {
      if (!layer || typeof layer !== "object" || typeof layer.id !== "string" || !layer.id.trim()) {
        throw new TypeError("world render layer id must be a non-empty string");
      }
      if (this.layers.has(layer.id)) throw new Error(`world render layer "${layer.id}" is already registered`);
      if (typeof layer.mountChunk !== "function" || typeof layer.unmountChunk !== "function" || typeof layer.dispose !== "function") {
        throw new TypeError("world render layer must implement mountChunk(), unmountChunk() and dispose()");
      }
      const kinds = layer.kinds ?? [layer.id];
      if (kinds.length === 0 || kinds.some((kind) => typeof kind !== "string" || !kind.trim())) {
        throw new TypeError("world render layer kinds must be non-empty strings");
      }
      for (const kind of new Set(kinds)) {
        const owner = this.kinds.get(kind);
        if (owner) throw new Error(`world render kind "${kind}" is already owned by layer "${owner.id}"`);
      }
      this.layers.set(layer.id, layer);
      for (const kind of new Set(kinds)) this.kinds.set(kind, layer);
    }
    unregister(id) {
      const layer = this.layers.get(id);
      if (!layer) return void 0;
      this.layers.delete(id);
      for (const [kind, owner] of this.kinds) if (owner === layer) this.kinds.delete(kind);
      return layer;
    }
    get(id) {
      return this.layers.get(id);
    }
    forKind(kind) {
      return this.kinds.get(kind);
    }
    values() {
      return [...this.layers.values()];
    }
    dispose() {
      const layers = [...this.layers.values()].reverse();
      this.layers.clear();
      this.kinds.clear();
      const errors = [];
      for (const layer of layers) {
        try {
          layer.dispose();
        } catch (reason) {
          errors.push(asLifecycleError(reason));
        }
      }
      if (errors.length > 0) {
        throw new WorldRenderLayerLifecycleError("one or more world render layers failed to dispose", errors);
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

  // src/world/WorldGeneratorVersion.ts
  var WORLD_GENERATOR_VERSION = 4;

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
    unitInterval("vegetation.palmTemperature", profile.vegetation.palmTemperature);
    unitInterval("vegetation.piniaTemperature", profile.vegetation.piniaTemperature);
    positive("vegetation.densityScale", profile.vegetation.densityScale);
    if (!(profile.vegetation.moistureStart < profile.vegetation.moistureFull) || !(profile.vegetation.temperatureMinimum < profile.vegetation.temperatureMaximum) || !(profile.vegetation.patchStart < profile.vegetation.patchFull)) {
      throw new RangeError("vegetation suitability thresholds must be ordered");
    }
    if (profile.vegetation.neutralDensity > profile.vegetation.maximumDensity) {
      throw new RangeError("vegetation neutral density must not exceed maximum density");
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
  function createLandformSampler(options) {
    return createLandformSamplerForProfile(options, WORLD_STYLE_PROFILE);
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
  function sampleLandform(seed, x, y, domain) {
    return createLandformSampler({ seed, domain }).sample(x, y);
  }

  // src/world/WorldSurfaceResolver.ts
  var isWater2 = (type) => type === "sea" /* sea */ || type === "coastal" /* coastal */;
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
    if (isWater2(type)) return Object.freeze({ temperate: 0, dry: 0, cold: 0, alpine: 0 });
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
    if (isWater2(type) || type === "mountain" /* mountain */ || type === "snow" /* snow */) return 0;
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
    if (isWater2(type) || type === "mountain" /* mountain */ || type === "snow" /* snow */) return 0;
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
    if (isWater2(type) || type === "mountain" /* mountain */ || type === "snow" /* snow */) return Object.freeze(tile);
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
      if (randomAt(numericSeed, x, y, profile.vegetation.placementSalt) < sample.vegetationDensity) {
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

  // src/world/generateWorldChunk.ts
  var DEFAULT_WORLD_GENERATION_CHUNK_SIZE = 24;
  var MAX_WORLD_GENERATION_CHUNK_SIZE = 128;
  var WORLD_CHUNK_FORMAT_VERSION = 1;
  var WORLD_CHUNK_PADDING = 1;
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
    const resolver = createWorldChunkSurfaceResolver(options);
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
    const tiles = new Uint16Array(stride * stride);
    const expectedDomain = options.world ? { topology: "toroidal", width: options.world.width, height: options.world.height } : { topology: "infinite" };
    if (!resolver || resolver.seed !== String(options.seed) || resolver.domain.topology !== expectedDomain.topology || expectedDomain.topology === "toroidal" && (resolver.domain.topology !== "toroidal" || resolver.domain.width !== expectedDomain.width || resolver.domain.height !== expectedDomain.height)) {
      throw new TypeError("world surface resolver does not match the chunk request");
    }
    const window2 = resolver.createWindow();
    const originX = options.chunkX * chunkSize - WORLD_CHUNK_PADDING;
    const originY = options.chunkY * chunkSize - WORLD_CHUNK_PADDING;
    if (!Number.isSafeInteger(originX) || !Number.isSafeInteger(originY) || !Number.isSafeInteger(originX + stride - 1) || !Number.isSafeInteger(originY + stride - 1)) {
      throw new RangeError("chunk coordinates exceed the safe integer tile range");
    }
    for (let localX = 0; localX < stride; localX += 1) {
      for (let localY = 0; localY < stride; localY += 1) {
        const x = originX + localX;
        const y = originY + localY;
        tiles[localX * stride + localY] = encodeTileInfo(window2.resolveGeneratedTile(x, y));
      }
    }
    window2.clear();
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
        const window2 = resolver.createWindow();
        const endX = Math.min(width, startX + windowSize);
        const endY = Math.min(height, startY + windowSize);
        for (let x = startX; x < endX; x += 1) {
          data[x] ?? (data[x] = {});
          for (let y = startY; y < endY; y += 1) {
            data[x][y] = cloneGeneratedTile(window2.resolveGeneratedTile(x, y));
          }
        }
        window2.clear();
      }
    }
    return { data, w: width, h: height, wrapX: toroidal, wrapY: toroidal };
  }

  // src/world/WorldDescriptor.ts
  var WORLD_DESCRIPTOR_FORMAT_VERSION = 1;
  var WORLD_WORKER_PROTOCOL_VERSION = 2;
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
  function worldDescriptorsEqual(first, second) {
    return serializeWorldDescriptor(first) === serializeWorldDescriptor(second);
  }

  // src/world/generateVegetation.ts
  var import_robust_point_in_polygon3 = __toESM(require_robust_pnp());
  var WORLD_VEGETATION_FORMAT_VERSION = 1;
  var LODS = [0, 1, 2];
  var GRASS_DENSITY = [1, 0.38, 0.14];
  var FOREST_DENSITY = [1, 0.5, 0.2];
  function stableRandom3(x, y, salt) {
    let value = Math.imul(x ^ 2654435769, 2246822507) ^ Math.imul(y ^ 3266489909, 668265263) ^ Math.imul(salt ^ 374761393, 2246822519);
    value ^= value >>> 16;
    value = Math.imul(value, 2146121005);
    value ^= value >>> 15;
    value = Math.imul(value, 2221713035);
    value ^= value >>> 16;
    return (value >>> 0) / 4294967296;
  }
  function cloneTile(tile) {
    return {
      ...tile,
      modifiers: tile.modifiers?.slice(),
      rivers: tile.rivers?.map((river) => ({ ...river })),
      city: tile.city ? { ...tile.city } : void 0
    };
  }
  function createWorldVegetationMapSnapshot(map, points) {
    var _a;
    const data = {};
    const selected = /* @__PURE__ */ new Map();
    for (const point of points) {
      selected.set(`${point.x},${point.y}`, point);
      for (const neighbor of getMapNeighbors(map, point.x, point.y)) {
        selected.set(`${neighbor.x},${neighbor.y}`, neighbor);
      }
    }
    for (const point of selected.values()) {
      const tile = getMapTile(map, point.x, point.y);
      if (!tile) continue;
      data[_a = point.x] ?? (data[_a] = {});
      data[point.x][point.y] = cloneTile(tile);
    }
    return {
      data,
      w: map.w,
      h: map.h,
      wrapX: map.wrapX,
      wrapY: map.wrapY,
      infinite: map.infinite
    };
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
  function buildGrassLod(map, chunkKey2, tiles, lod, options, waterOptions) {
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
    const origin = getWorldChunkOrigin(chunkKey2, options.size);
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
          lx = (stableRandom3(tile.x, tile.y, i * 97 + attempts * 2) * 2 - 1) * options.size;
          ly = (stableRandom3(tile.x, tile.y, i * 97 + attempts * 2 + 1) * 2 - 1) * options.size;
          valid = (0, import_robust_point_in_polygon3.default)(polygon, [lx, ly]) === -1 && !isInTileWater(
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
        angles[instance] = stableRandom3(tile.x, tile.y, i * 97 + 41) * Math.PI * 2;
        const heightJitter = 1 - heightVariation * 0.5 + stableRandom3(tile.x, tile.y, i * 97 + 43) * heightVariation;
        scales[instance * 2] = options.grassBladeWidth * (0.8 + stableRandom3(tile.x, tile.y, i * 97 + 47) * 0.4);
        scales[instance * 2 + 1] = options.grassBladeHeight * heightJitter;
        phases[instance] = stableRandom3(tile.x, tile.y, i * 97 + 53) * Math.PI * 2;
        shades[instance] = 0.75 + stableRandom3(tile.x, tile.y, i * 97 + 59) * 0.35;
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
    return [...groupTilesByWorldChunk(grassTiles(map, options.points))].map(([chunkKey2, tiles]) => ({
      chunkKey: chunkKey2,
      lods: LODS.map((lod) => buildGrassLod(map, chunkKey2, tiles, lod, options, waterOptions))
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
  function buildForestLod(map, chunkKey2, tiles, lod, options, polygon, treeFootprint, waterOptions, coastOptions) {
    const density = Math.max(1, Math.round(options.treesPerTile * FOREST_DENSITY[lod]));
    const matrices = new Float32Array(tiles.length * density * 16);
    const ranges = new Uint32Array(tiles.length * 2);
    const origin = getWorldChunkOrigin(chunkKey2, options.size);
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
        const lx = (stableRandom3(tile.x, tile.y, salt) * 2 - 1) * options.size;
        const ly = (stableRandom3(tile.x, tile.y, salt + 1) * 2 - 1) * options.size;
        if ((0, import_robust_point_in_polygon3.default)(polygon, [lx, ly]) !== -1) continue;
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
        const scale = options.treeScale * (0.8 + stableRandom3(tile.x, tile.y, salt + 3) * 0.4);
        writeTreeMatrix(
          matrices,
          instance,
          stableRandom3(tile.x, tile.y, salt + 5) * Math.PI * 2,
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
      for (const [chunkKey2, chunkTiles] of groupTilesByWorldChunk(tiles)) {
        layouts.push({
          chunkKey: chunkKey2,
          modelPath,
          lods: LODS.map((lod) => buildForestLod(
            map,
            chunkKey2,
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
  function assertWorldVegetationLayout(layout) {
    if (!layout || typeof layout !== "object" || layout.version !== WORLD_VEGETATION_FORMAT_VERSION || !Array.isArray(layout.grass) || !Array.isArray(layout.forest)) {
      throw new TypeError("world vegetation layout is invalid");
    }
    for (const chunk of layout.grass) {
      if (typeof chunk?.chunkKey !== "string" || !Array.isArray(chunk.lods) || chunk.lods.length !== 3) {
        throw new TypeError("world grass layout is invalid");
      }
      for (const lod of chunk.lods) {
        if (!(lod.ranges instanceof Uint32Array) || !(lod.offsets instanceof Float32Array) || !(lod.tileOffsets instanceof Float32Array) || !(lod.angles instanceof Float32Array) || !(lod.scales instanceof Float32Array) || !(lod.phases instanceof Float32Array) || !(lod.shades instanceof Float32Array) || !Array.isArray(lod.tiles) || lod.ranges.length !== lod.tiles.length * 2 || lod.offsets.length !== lod.instanceCount * 2 || lod.tileOffsets.length !== lod.instanceCount * 2 || lod.angles.length !== lod.instanceCount || lod.scales.length !== lod.instanceCount * 2 || lod.phases.length !== lod.instanceCount || lod.shades.length !== lod.instanceCount) {
          throw new TypeError("world grass LOD layout is invalid");
        }
      }
    }
    for (const chunk of layout.forest) {
      if (typeof chunk?.chunkKey !== "string" || typeof chunk.modelPath !== "string" || !Array.isArray(chunk.lods) || chunk.lods.length !== 3) {
        throw new TypeError("world forest layout is invalid");
      }
      for (const lod of chunk.lods) {
        if (!(lod.ranges instanceof Uint32Array) || !(lod.matrices instanceof Float32Array) || !Array.isArray(lod.tiles) || lod.ranges.length !== lod.tiles.length * 2 || lod.matrices.length !== lod.instanceCount * 16) {
          throw new TypeError("world forest LOD layout is invalid");
        }
      }
    }
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

  // src/world/WorldGeneratorClient.ts
  var WorldGeneratorClient = class {
    constructor(workerUrl, workerOptions = { type: "module" }) {
      this.pending = /* @__PURE__ */ new Map();
      this.nextRequestId = 1;
      this.disposed = false;
      this.handleMessage = (event) => {
        const data = event.data;
        if (!data || typeof data !== "object" || data.protocolVersion !== WORLD_WORKER_PROTOCOL_VERSION || data.generatorVersion !== WORLD_GENERATOR_VERSION || typeof data.id !== "number" || !("world" in data) && !("chunk" in data) && !("vegetation" in data) && !("error" in data)) {
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
            if (!request.expectedChunk || data.chunk.chunkX !== request.expectedChunk.chunkX || data.chunk.chunkY !== request.expectedChunk.chunkY || data.chunk.chunkSize !== request.expectedChunk.chunkSize) {
              throw new TypeError("World generation worker returned a chunk for the wrong request");
            }
            request.resolve(data.chunk);
          } catch (reason) {
            request.reject(reason instanceof Error ? reason : new Error(String(reason)));
          }
          return;
        }
        if (request.kind === "vegetation" && "vegetation" in data && data.vegetation) {
          try {
            assertWorldVegetationLayout(data.vegetation);
            request.resolve(data.vegetation);
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
          this.worker.postMessage({
            protocolVersion: WORLD_WORKER_PROTOCOL_VERSION,
            generatorVersion: WORLD_GENERATOR_VERSION,
            id,
            type: "world",
            options
          });
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
        this.pending.set(id, {
          kind: "chunk",
          resolve: (value) => resolve(value),
          reject,
          expectedChunk: {
            chunkX: options.chunkX,
            chunkY: options.chunkY,
            chunkSize: options.chunkSize ?? DEFAULT_WORLD_GENERATION_CHUNK_SIZE
          }
        });
        try {
          this.worker.postMessage({
            protocolVersion: WORLD_WORKER_PROTOCOL_VERSION,
            generatorVersion: WORLD_GENERATOR_VERSION,
            id,
            type: "chunk",
            options
          });
        } catch (reason) {
          this.pending.delete(id);
          reject(reason instanceof Error ? reason : new Error(String(reason)));
        }
      });
    }
    generateVegetation(options) {
      if (this.disposed) return Promise.reject(new Error("WorldGeneratorClient has been disposed"));
      const id = this.nextRequestId++;
      return new Promise((resolve, reject) => {
        this.pending.set(id, {
          kind: "vegetation",
          resolve: (value) => resolve(value),
          reject
        });
        try {
          this.worker.postMessage({
            protocolVersion: WORLD_WORKER_PROTOCOL_VERSION,
            generatorVersion: WORLD_GENERATOR_VERSION,
            id,
            type: "vegetation",
            options
          });
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
      this.completed = 0;
      this.disposed = false;
      this.averageChunkMs = 0;
      this.averageVegetationMs = 0;
      this.workerFailures = 0;
      this.clientFactoryFailures = 0;
      this.maxWorkers = options.maxWorkers ?? 8;
      const size = options.size ?? defaultPoolSize(this.maxWorkers);
      if (!Number.isInteger(size) || size <= 0 || size > this.maxWorkers) {
        throw new RangeError(`worker pool size must be an integer between 1 and ${this.maxWorkers}`);
      }
      this.desiredSize = size;
      this.reservedChunkWorkers = options.reservedChunkWorkers ?? 1;
      if (!Number.isInteger(this.reservedChunkWorkers) || this.reservedChunkWorkers < 0 || this.reservedChunkWorkers > this.maxWorkers) {
        throw new RangeError(`reservedChunkWorkers must be an integer between 0 and ${this.maxWorkers}`);
      }
      this.clientFactory = options.clientFactory ?? (() => new WorldGeneratorClient(workerUrl, options.workerOptions ?? { type: "module" }));
      const queueOptions = {
        maxPendingTasks: options.maxQueuedTasks ?? 512,
        maxPendingWeight: options.maxQueuedWeight ?? 1024,
        starvationMs: options.starvationMs,
        now: options.now
      };
      this.workCoordinator = options.coordinator;
      this.queue = options.coordinator ? options.coordinator.createQueue(options.domain ?? "worker", queueOptions) : new PriorityTaskQueue(queueOptions);
      this.coordinatorSignal = options.coordinator?.signal;
      this.coordinatorAbort = this.coordinatorSignal ? () => this.dispose() : void 0;
      this.coordinatorSignal?.addEventListener("abort", this.coordinatorAbort, { once: true });
      const initialSlots = [];
      try {
        for (let index = 0; index < size; index += 1) {
          initialSlots.push({ client: this.createClient(), busy: false });
        }
      } catch (reason) {
        for (const slot of initialSlots) {
          try {
            slot.client.dispose();
          } catch {
          }
        }
        if (this.coordinatorAbort) this.coordinatorSignal?.removeEventListener("abort", this.coordinatorAbort);
        this.workCoordinator?.releaseQueue(this.queue);
        throw reason;
      }
      this.slots = initialSlots;
    }
    generateChunk(options, request = {}) {
      if (this.disposed) return Promise.reject(new Error("WorldGeneratorPool has been disposed"));
      if (request.signal?.aborted) return Promise.reject(abortError());
      return new Promise((resolve, reject) => {
        const task = {
          kind: "chunk",
          options,
          signal: request.signal,
          resolve: (result) => resolve(result),
          reject,
          settled: false
        };
        if (request.signal) {
          task.abort = () => {
            if (task.settled) return;
            if (task.queueId !== void 0 && this.queue.cancel(task.queueId, abortError())) return;
            this.finishTask(task, () => reject(abortError()));
          };
          request.signal.addEventListener("abort", task.abort, { once: true });
        }
        task.queueId = this.queue.enqueue(task, {
          priority: Number.isFinite(request.priority) ? request.priority : 0,
          lane: request.lane ?? "visible",
          weight: request.weight ?? 1,
          cancelled: (reason) => this.finishTask(task, () => task.reject(reason))
        });
        if (task.queueId === void 0 && !task.settled) {
          this.finishTask(task, () => reject(new WorkQueueBackpressureError("World chunk request was shed")));
        }
        this.dispatch();
      });
    }
    generateVegetation(options, request = {}) {
      if (this.disposed) return Promise.reject(new Error("WorldGeneratorPool has been disposed"));
      if (request.signal?.aborted) return Promise.reject(abortError());
      return new Promise((resolve, reject) => {
        const task = {
          kind: "vegetation",
          options,
          signal: request.signal,
          resolve: (result) => resolve(result),
          reject,
          settled: false
        };
        if (request.signal) {
          task.abort = () => {
            if (task.settled) return;
            if (task.queueId !== void 0 && this.queue.cancel(task.queueId, abortError())) return;
            this.finishTask(task, () => reject(abortError()));
          };
          request.signal.addEventListener("abort", task.abort, { once: true });
        }
        task.queueId = this.queue.enqueue(task, {
          priority: Number.isFinite(request.priority) ? request.priority : 0,
          lane: request.lane ?? "prefetch",
          weight: request.weight ?? Math.max(1, Math.ceil((options.points?.length ?? 0) / 256)),
          cancelled: (reason) => this.finishTask(task, () => task.reject(reason))
        });
        if (task.queueId === void 0 && !task.settled) {
          this.finishTask(task, () => reject(new WorkQueueBackpressureError("Vegetation request was shed")));
        }
        this.dispatch();
      });
    }
    get stats() {
      const queued = this.queue.values.filter((task) => !task.settled && !task.signal?.aborted);
      const queueStats = this.queue.stats;
      return {
        workers: this.slots.length,
        configuredWorkers: this.desiredSize,
        busyWorkers: this.slots.filter((slot) => slot.busy).length,
        queued: queued.length,
        completed: this.completed,
        queuedChunks: queued.filter((task) => task.kind === "chunk").length,
        queuedVegetation: queued.filter((task) => task.kind === "vegetation").length,
        busyChunkWorkers: this.slots.filter((slot) => slot.busy && slot.taskKind === "chunk").length,
        busyVegetationWorkers: this.slots.filter((slot) => slot.busy && slot.taskKind === "vegetation").length,
        averageChunkMs: this.averageChunkMs,
        averageVegetationMs: this.averageVegetationMs,
        queuedWeight: queueStats.pendingWeight,
        oldestQueuedMs: queueStats.oldestTaskAgeMs,
        shedTasks: queueStats.shedTasks,
        starvationPromotions: queueStats.starvationPromotions,
        workerFailures: this.workerFailures,
        clientFactoryFailures: this.clientFactoryFailures
      };
    }
    configureSize(size) {
      if (this.disposed) throw new Error("WorldGeneratorPool has been disposed");
      if (!Number.isInteger(size) || size <= 0 || size > this.maxWorkers) {
        throw new RangeError(`worker pool size must be an integer between 1 and ${this.maxWorkers}`);
      }
      this.desiredSize = size;
      this.reconcileSize(true);
      this.dispatch();
      return this.desiredSize;
    }
    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      if (this.coordinatorAbort) this.coordinatorSignal?.removeEventListener("abort", this.coordinatorAbort);
      const error = new Error("WorldGeneratorPool was disposed");
      this.queue.clear(error);
      this.workCoordinator?.releaseQueue(this.queue, false);
      for (const slot of this.slots) {
        if (slot.task) this.finishTask(slot.task, () => slot.task.reject(error));
        try {
          slot.client.dispose();
        } catch {
        }
      }
    }
    dispatch() {
      if (this.disposed) return;
      for (const slot of this.slots) {
        if (slot.busy) continue;
        const task = this.takeNextTask();
        if (!task) return;
        if (slot.client.isDisposed) {
          const replacementError = this.replaceDisposedClient(slot);
          if (replacementError) {
            this.finishTask(task, () => task.reject(replacementError));
            if (this.slots.every((candidate) => candidate.client.isDisposed)) {
              this.queue.clear(replacementError);
            }
            continue;
          }
        }
        slot.busy = true;
        slot.taskKind = task.kind;
        slot.task = task;
        const started = typeof performance === "undefined" ? Date.now() : performance.now();
        let pending;
        try {
          pending = task.kind === "chunk" ? slot.client.generateChunk(task.options) : slot.client.generateVegetation ? slot.client.generateVegetation(task.options) : Promise.reject(new Error("World generation client does not support vegetation tasks"));
        } catch (reason) {
          pending = Promise.reject(reason);
        }
        void pending.then(
          (result) => {
            if (!task.settled) {
              this.completed += 1;
              this.finishTask(task, () => task.resolve(result));
            }
          },
          (reason) => {
            if (!task.settled) {
              const error = reason instanceof Error ? reason : new Error(String(reason));
              this.finishTask(task, () => task.reject(error));
            }
            if (slot.client.isDisposed) this.workerFailures += 1;
          }
        ).finally(() => {
          const finished = typeof performance === "undefined" ? Date.now() : performance.now();
          this.recordDuration(task.kind, Math.max(0, finished - started));
          slot.busy = false;
          slot.taskKind = void 0;
          slot.task = void 0;
          this.reconcileSize(false);
          this.dispatch();
        });
      }
    }
    takeNextTask() {
      const activeWorkers = Math.max(1, Math.min(this.desiredSize, this.slots.length));
      const maximumVegetation = activeWorkers === 1 ? 1 : Math.max(1, activeWorkers - this.reservedChunkWorkers);
      const busyVegetation = this.slots.filter((candidate) => candidate.busy && candidate.taskKind === "vegetation").length;
      const task = this.queue.take(busyVegetation >= maximumVegetation ? (candidate) => candidate.kind === "chunk" : void 0);
      if (task) task.queueId = void 0;
      return task;
    }
    recordDuration(kind, durationMs) {
      const alpha = 0.2;
      if (kind === "chunk") {
        this.averageChunkMs = this.averageChunkMs === 0 ? durationMs : this.averageChunkMs + (durationMs - this.averageChunkMs) * alpha;
      } else {
        this.averageVegetationMs = this.averageVegetationMs === 0 ? durationMs : this.averageVegetationMs + (durationMs - this.averageVegetationMs) * alpha;
      }
    }
    finishTask(task, settle) {
      if (task.settled) return;
      task.settled = true;
      if (task.signal && task.abort) task.signal.removeEventListener("abort", task.abort);
      settle();
    }
    replaceDisposedClient(slot) {
      try {
        slot.client = this.createClient();
        return void 0;
      } catch (reason) {
        this.clientFactoryFailures += 1;
        return reason instanceof Error ? reason : new Error(String(reason));
      }
    }
    createClient() {
      const client = this.clientFactory();
      if (!client || typeof client.generateChunk !== "function" || typeof client.dispose !== "function") {
        throw new TypeError("clientFactory must return a chunk generator client");
      }
      if (client.isDisposed) {
        try {
          client.dispose();
        } catch {
        }
        throw new Error("clientFactory returned an already disposed client");
      }
      return client;
    }
    reconcileSize(throwOnFactoryFailure) {
      if (this.disposed) return;
      while (this.slots.length > this.desiredSize) {
        let index = -1;
        for (let candidate = this.slots.length - 1; candidate >= 0; candidate -= 1) {
          if (!this.slots[candidate].busy) {
            index = candidate;
            break;
          }
        }
        if (index < 0) break;
        const [slot] = this.slots.splice(index, 1);
        try {
          slot.client.dispose();
        } catch {
        }
      }
      while (this.slots.length < this.desiredSize) {
        try {
          this.slots.push({ client: this.createClient(), busy: false });
        } catch (reason) {
          this.clientFactoryFailures += 1;
          if (throwOnFactoryFailure) throw reason;
          break;
        }
      }
    }
  };

  // src/world/WorldChunkCache.ts
  var DEFAULT_DATABASE_NAME = "three-hex-map-world-cache-v1";
  var DATABASE_VERSION = 1;
  var CHUNK_STORE = "chunks";
  var META_STORE = "meta";
  var USAGE_KEY = "usage";
  function createWorldChunkCacheKey(options) {
    if (!options || typeof options !== "object") throw new TypeError("world chunk cache key options are required");
    assertWorldDescriptor(options.descriptor);
    if (!Number.isSafeInteger(options.chunkX) || !Number.isSafeInteger(options.chunkY)) {
      throw new RangeError("world chunk cache coordinates must be safe integers");
    }
    return JSON.stringify([
      serializeWorldDescriptor(options.descriptor),
      options.chunkX,
      options.chunkY
    ]);
  }
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
  var IndexedDbWorldChunkCache = class {
    constructor(options = {}) {
      this.maintenance = Promise.resolve();
      this.disposed = false;
      this.snapshot = {
        available: typeof indexedDB !== "undefined",
        hits: 0,
        misses: 0,
        writes: 0,
        errors: 0,
        entries: 0,
        bytes: 0
      };
      this.databaseName = options.databaseName ?? DEFAULT_DATABASE_NAME;
      this.maxBytes = options.maxBytes ?? 128 * 1024 * 1024;
      this.openTimeoutMs = options.openTimeoutMs ?? 2e3;
      if (typeof this.databaseName !== "string" || this.databaseName.trim().length === 0) {
        throw new TypeError("cache databaseName must be a non-empty string");
      }
      if (!Number.isFinite(this.maxBytes) || this.maxBytes <= 0) {
        throw new RangeError("cache maxBytes must be a positive finite number");
      }
      if (!Number.isFinite(this.openTimeoutMs) || this.openTimeoutMs <= 0) {
        throw new RangeError("cache openTimeoutMs must be a positive finite number");
      }
    }
    get stats() {
      return this.snapshot;
    }
    async get(key) {
      if (this.disposed) return void 0;
      const database = await this.open();
      if (!database) {
        this.snapshot.misses += 1;
        return void 0;
      }
      try {
        const transaction = database.transaction(CHUNK_STORE, "readonly");
        const record = await requestResult(transaction.objectStore(CHUNK_STORE).get(key));
        await transactionComplete(transaction);
        if (!record) {
          this.snapshot.misses += 1;
          return void 0;
        }
        const chunk = {
          version: record.version,
          chunkX: record.chunkX,
          chunkY: record.chunkY,
          chunkSize: record.chunkSize,
          padding: record.padding,
          stride: record.stride,
          tiles: new Uint16Array(record.tiles.slice(0))
        };
        assertPackedWorldChunk(chunk);
        this.snapshot.hits += 1;
        this.enqueueMaintenance(() => this.touch(database, record));
        return chunk;
      } catch {
        this.snapshot.errors += 1;
        this.snapshot.misses += 1;
        this.enqueueMaintenance(() => this.deleteKey(database, key));
        return void 0;
      }
    }
    put(key, chunk) {
      assertPackedWorldChunk(chunk);
      if (this.disposed) return Promise.resolve(false);
      return this.enqueueMaintenance(async () => {
        const database = await this.open();
        if (!database) return false;
        try {
          const bytes = chunk.tiles.byteLength;
          const tiles = chunk.tiles.buffer.slice(
            chunk.tiles.byteOffset,
            chunk.tiles.byteOffset + chunk.tiles.byteLength
          );
          const transaction = database.transaction([CHUNK_STORE, META_STORE], "readwrite");
          const chunks = transaction.objectStore(CHUNK_STORE);
          const meta = transaction.objectStore(META_STORE);
          const [existing, usage] = await Promise.all([
            requestResult(chunks.get(key)),
            requestResult(meta.get(USAGE_KEY))
          ]);
          const nextUsage = {
            key: USAGE_KEY,
            bytes: Math.max(0, (usage?.bytes ?? 0) - (existing?.bytes ?? 0) + bytes),
            entries: Math.max(0, (usage?.entries ?? 0) + (existing ? 0 : 1))
          };
          chunks.put({
            key,
            version: chunk.version,
            chunkX: chunk.chunkX,
            chunkY: chunk.chunkY,
            chunkSize: chunk.chunkSize,
            padding: chunk.padding,
            stride: chunk.stride,
            tiles,
            bytes,
            accessedAt: Date.now()
          });
          meta.put(nextUsage);
          await transactionComplete(transaction);
          this.snapshot.writes += 1;
          this.snapshot.entries = nextUsage.entries;
          this.snapshot.bytes = nextUsage.bytes;
          await this.prune(database);
          return true;
        } catch {
          this.snapshot.errors += 1;
          return false;
        }
      });
    }
    async clear() {
      if (this.disposed) return false;
      return this.enqueueMaintenance(async () => {
        const database = await this.open();
        if (!database) return false;
        try {
          const transaction = database.transaction([CHUNK_STORE, META_STORE], "readwrite");
          transaction.objectStore(CHUNK_STORE).clear();
          transaction.objectStore(META_STORE).put({ key: USAGE_KEY, bytes: 0, entries: 0 });
          await transactionComplete(transaction);
          this.snapshot.entries = 0;
          this.snapshot.bytes = 0;
          return true;
        } catch {
          this.snapshot.errors += 1;
          return false;
        }
      });
    }
    flush() {
      return this.maintenance.then(() => void 0);
    }
    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      void this.databasePromise?.then((database) => database?.close());
    }
    enqueueMaintenance(task) {
      const result = this.maintenance.then(task, task);
      this.maintenance = result.then(() => void 0, () => void 0);
      return result;
    }
    async open() {
      if (this.disposed || typeof indexedDB === "undefined") return void 0;
      this.databasePromise ?? (this.databasePromise = new Promise((resolve) => {
        const request = indexedDB.open(this.databaseName, DATABASE_VERSION);
        let settled = false;
        let timeout;
        const finish = (database) => {
          if (settled) {
            database?.close();
            return;
          }
          settled = true;
          if (timeout !== void 0) clearTimeout(timeout);
          resolve(database);
        };
        timeout = setTimeout(() => {
          this.snapshot.available = false;
          this.snapshot.errors += 1;
          finish(void 0);
        }, this.openTimeoutMs);
        request.addEventListener("upgradeneeded", () => {
          const database = request.result;
          if (!database.objectStoreNames.contains(CHUNK_STORE)) {
            const chunks = database.createObjectStore(CHUNK_STORE, { keyPath: "key" });
            chunks.createIndex("accessedAt", "accessedAt");
          }
          if (!database.objectStoreNames.contains(META_STORE)) {
            database.createObjectStore(META_STORE, { keyPath: "key" });
          }
        });
        request.addEventListener("success", () => {
          const database = request.result;
          if (settled) {
            database.close();
            return;
          }
          database.addEventListener("versionchange", () => {
            database.close();
            this.databasePromise = void 0;
          });
          this.snapshot.available = true;
          void this.readUsage(database);
          finish(database);
        }, { once: true });
        request.addEventListener("error", () => {
          if (settled) return;
          this.snapshot.available = false;
          this.snapshot.errors += 1;
          finish(void 0);
        }, { once: true });
        request.addEventListener("blocked", () => {
          if (settled) return;
          this.snapshot.available = false;
          this.snapshot.errors += 1;
          finish(void 0);
        });
      }));
      return this.databasePromise;
    }
    async readUsage(database) {
      try {
        const transaction = database.transaction(META_STORE, "readonly");
        const usage = await requestResult(transaction.objectStore(META_STORE).get(USAGE_KEY));
        await transactionComplete(transaction);
        this.snapshot.entries = usage?.entries ?? 0;
        this.snapshot.bytes = usage?.bytes ?? 0;
      } catch {
        this.snapshot.errors += 1;
      }
    }
    async touch(database, record) {
      try {
        const transaction = database.transaction(CHUNK_STORE, "readwrite");
        transaction.objectStore(CHUNK_STORE).put({ ...record, accessedAt: Date.now() });
        await transactionComplete(transaction);
      } catch {
        this.snapshot.errors += 1;
      }
    }
    async deleteKey(database, key) {
      try {
        const transaction = database.transaction([CHUNK_STORE, META_STORE], "readwrite");
        const chunks = transaction.objectStore(CHUNK_STORE);
        const meta = transaction.objectStore(META_STORE);
        const [existing, usage] = await Promise.all([
          requestResult(chunks.get(key)),
          requestResult(meta.get(USAGE_KEY))
        ]);
        if (existing) {
          chunks.delete(key);
          const next = {
            key: USAGE_KEY,
            bytes: Math.max(0, (usage?.bytes ?? 0) - existing.bytes),
            entries: Math.max(0, (usage?.entries ?? 0) - 1)
          };
          meta.put(next);
          this.snapshot.bytes = next.bytes;
          this.snapshot.entries = next.entries;
        }
        await transactionComplete(transaction);
      } catch {
        this.snapshot.errors += 1;
      }
    }
    async prune(database) {
      if (this.snapshot.bytes <= this.maxBytes) return;
      const transaction = database.transaction([CHUNK_STORE, META_STORE], "readwrite");
      const chunks = transaction.objectStore(CHUNK_STORE);
      const meta = transaction.objectStore(META_STORE);
      let bytes = this.snapshot.bytes;
      let entries = this.snapshot.entries;
      await new Promise((resolve, reject) => {
        const request = chunks.index("accessedAt").openCursor();
        request.addEventListener("error", () => reject(request.error ?? new Error("cache pruning failed")), { once: true });
        request.addEventListener("success", () => {
          const cursor = request.result;
          if (!cursor || bytes <= this.maxBytes) {
            resolve();
            return;
          }
          const record = cursor.value;
          bytes = Math.max(0, bytes - record.bytes);
          entries = Math.max(0, entries - 1);
          cursor.delete();
          cursor.continue();
        });
      });
      meta.put({ key: USAGE_KEY, bytes, entries });
      await transactionComplete(transaction);
      this.snapshot.bytes = bytes;
      this.snapshot.entries = entries;
    }
  };
  async function clearWorldChunkCache(options = {}) {
    const cache2 = new IndexedDbWorldChunkCache(options);
    try {
      return await cache2.clear();
    } finally {
      cache2.dispose();
    }
  }

  // src/world/WorldDeltaStore.ts
  var WORLD_DELTA_FORMAT_VERSION = 2;
  var LEGACY_WORLD_DELTA_FORMAT_VERSION = 1;
  var WorldDeltaConflictError = class extends Error {
    constructor(expectedRevision, actualRevision) {
      super(`World delta revision conflict: expected ${expectedRevision}, received ${actualRevision}`);
      this.expectedRevision = expectedRevision;
      this.actualRevision = actualRevision;
      this.name = "WorldDeltaConflictError";
    }
  };
  function chunkKey(worldId, chunkX, chunkY) {
    return JSON.stringify([worldId, chunkX, chunkY]);
  }
  function assertChunkIdentity(worldId, chunkX, chunkY) {
    if (typeof worldId !== "string" || worldId.trim().length === 0) {
      throw new TypeError("worldId must be a non-empty string");
    }
    if (!Number.isSafeInteger(chunkX) || !Number.isSafeInteger(chunkY)) {
      throw new RangeError("world delta chunk coordinates must be safe integers");
    }
  }
  function assertChunkSize2(chunkSize) {
    if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0) {
      throw new RangeError("world delta chunkSize must be a positive safe integer");
    }
  }
  function tileBelongsToChunk(x, y, chunkX, chunkY, chunkSize) {
    return Math.floor(x / chunkSize) === chunkX && Math.floor(y / chunkSize) === chunkY;
  }
  function assertChanges(changes, chunkX, chunkY, options) {
    assertChunkSize2(options.chunkSize);
    if (!Array.isArray(changes)) throw new TypeError("world delta changes must be an array");
    if (options.expectedRevision !== void 0 && (!Number.isSafeInteger(options.expectedRevision) || options.expectedRevision < 0)) {
      throw new RangeError("expectedRevision must be a non-negative safe integer");
    }
    for (const change of changes) {
      if (!change || !Number.isSafeInteger(change.x) || !Number.isSafeInteger(change.y)) {
        throw new RangeError("world delta tile coordinates must be safe integers");
      }
      if (!tileBelongsToChunk(change.x, change.y, chunkX, chunkY, options.chunkSize)) {
        throw new RangeError("world delta tile coordinates do not belong to the declared chunk");
      }
      if (change.override !== null) assertWorldTileOverride(change.override);
    }
  }
  function normalizeWorldChunkDelta(value, worldId, chunkX, chunkY, options) {
    assertChunkIdentity(worldId, chunkX, chunkY);
    assertChunkSize2(options.chunkSize);
    const candidate = value;
    if (!candidate || candidate.version !== WORLD_DELTA_FORMAT_VERSION && candidate.version !== LEGACY_WORLD_DELTA_FORMAT_VERSION || candidate.worldId !== worldId || candidate.chunkX !== chunkX || candidate.chunkY !== chunkY || candidate.version === WORLD_DELTA_FORMAT_VERSION && candidate.chunkSize !== options.chunkSize || !Number.isSafeInteger(candidate.revision) || candidate.revision < 1 || !Array.isArray(candidate.entries) || candidate.entries.some((entry) => !entry || !Number.isSafeInteger(entry.x) || !Number.isSafeInteger(entry.y) || !tileBelongsToChunk(entry.x, entry.y, chunkX, chunkY, options.chunkSize) || !entry.override || typeof entry.override !== "object" || Array.isArray(entry.override))) {
      throw new TypeError("world chunk delta is invalid or incompatible");
    }
    const keys = /* @__PURE__ */ new Set();
    for (const entry of candidate.entries) {
      assertWorldTileOverride(entry.override);
      const key = `${entry.x},${entry.y}`;
      if (keys.has(key)) throw new TypeError("world chunk delta contains duplicate tile coordinates");
      keys.add(key);
    }
    return {
      version: WORLD_DELTA_FORMAT_VERSION,
      worldId,
      chunkX,
      chunkY,
      chunkSize: options.chunkSize,
      revision: candidate.revision,
      entries: candidate.entries.map((entry) => ({
        x: entry.x,
        y: entry.y,
        override: cloneWorldTileOverride(entry.override)
      }))
    };
  }
  function mergeChunkDelta(current, worldId, chunkX, chunkY, changes, options) {
    assertChunkIdentity(worldId, chunkX, chunkY);
    assertChanges(changes, chunkX, chunkY, options);
    if (current) current = normalizeWorldChunkDelta(current, worldId, chunkX, chunkY, options);
    const actualRevision = current?.revision ?? 0;
    if (options.expectedRevision !== void 0 && options.expectedRevision !== actualRevision) {
      throw new WorldDeltaConflictError(options.expectedRevision, actualRevision);
    }
    if (changes.length === 0) return current;
    const entries = new Map((current?.entries ?? []).map((entry) => [
      `${entry.x},${entry.y}`,
      { x: entry.x, y: entry.y, override: cloneWorldTileOverride(entry.override) }
    ]));
    for (const change of changes) {
      const key = `${change.x},${change.y}`;
      if (change.override === null || !hasWorldTileOverride(change.override)) entries.delete(key);
      else entries.set(key, { x: change.x, y: change.y, override: cloneWorldTileOverride(change.override) });
    }
    const currentEntries = new Map((current?.entries ?? []).map((entry) => [`${entry.x},${entry.y}`, entry.override]));
    const changed = entries.size !== currentEntries.size || [...entries].some(([key, entry]) => !worldTileOverridesEqual(entry.override, currentEntries.get(key)));
    if (!changed) return current;
    return {
      version: WORLD_DELTA_FORMAT_VERSION,
      worldId,
      chunkX,
      chunkY,
      chunkSize: options.chunkSize,
      revision: actualRevision + 1,
      entries: [...entries.values()].sort((a, b) => a.x - b.x || a.y - b.y)
    };
  }
  var MemoryWorldDeltaStore = class {
    constructor() {
      this.chunks = /* @__PURE__ */ new Map();
      this.disposed = false;
    }
    loadChunk(worldId, chunkX, chunkY, options) {
      assertChunkIdentity(worldId, chunkX, chunkY);
      const delta = this.chunks.get(chunkKey(worldId, chunkX, chunkY));
      return Promise.resolve(delta ? this.cloneDelta(normalizeWorldChunkDelta(delta, worldId, chunkX, chunkY, options)) : void 0);
    }
    putChunkDelta(worldId, chunkX, chunkY, changes, options) {
      if (this.disposed) return Promise.reject(new Error("WorldDeltaStore has been disposed"));
      try {
        const result = this.applyChunkDelta(worldId, chunkX, chunkY, changes, options);
        return Promise.resolve(result ? this.cloneDelta(result) : void 0);
      } catch (reason) {
        return Promise.reject(reason);
      }
    }
    putTile(worldId, chunkX, chunkY, entry, options) {
      if (this.disposed) throw new Error("WorldDeltaStore has been disposed");
      this.applyChunkDelta(worldId, chunkX, chunkY, [entry], options);
    }
    deleteTile(worldId, chunkX, chunkY, x, y, options) {
      if (this.disposed) throw new Error("WorldDeltaStore has been disposed");
      this.applyChunkDelta(worldId, chunkX, chunkY, [{ x, y, override: null }], options);
    }
    flush() {
      return Promise.resolve();
    }
    listWorld(worldId) {
      if (this.disposed) return Promise.reject(new Error("WorldDeltaStore has been disposed"));
      const deltas = [...this.chunks.values()].filter((delta) => delta.worldId === worldId).sort((first, second) => first.chunkX - second.chunkX || first.chunkY - second.chunkY).map((delta) => this.cloneDelta(delta));
      return Promise.resolve(deltas);
    }
    async replaceWorld(worldId, deltas) {
      if (this.disposed) throw new Error("WorldDeltaStore has been disposed");
      const replacements = /* @__PURE__ */ new Map();
      for (const delta of deltas) {
        const normalized = normalizeWorldChunkDelta(
          delta,
          worldId,
          delta.chunkX,
          delta.chunkY,
          { chunkSize: delta.chunkSize }
        );
        const key = chunkKey(worldId, normalized.chunkX, normalized.chunkY);
        if (replacements.has(key)) throw new TypeError("world delta checkpoint contains duplicate chunks");
        replacements.set(key, normalized);
      }
      await this.clear(worldId);
      for (const [key, delta] of replacements) this.chunks.set(key, this.cloneDelta(delta));
    }
    async clear(worldId) {
      for (const [key, delta] of this.chunks) if (delta.worldId === worldId) this.chunks.delete(key);
    }
    dispose() {
      this.disposed = true;
    }
    cloneDelta(delta) {
      if (delta.version !== WORLD_DELTA_FORMAT_VERSION) throw new Error(`Unsupported world delta version: ${delta.version}`);
      return {
        ...delta,
        entries: delta.entries.map((entry) => ({ ...entry, override: cloneWorldTileOverride(entry.override) }))
      };
    }
    applyChunkDelta(worldId, chunkX, chunkY, changes, options) {
      const key = chunkKey(worldId, chunkX, chunkY);
      const result = mergeChunkDelta(this.chunks.get(key), worldId, chunkX, chunkY, changes, options);
      if (result) this.chunks.set(key, result);
      return result;
    }
  };
  var DEFAULT_DELTA_DATABASE_NAME = "three-hex-map-world-deltas-v1";
  var DELTA_DATABASE_VERSION = 1;
  var DELTA_OBJECT_STORE = "deltas";
  function requestResult2(request) {
    return new Promise((resolve, reject) => {
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error ?? new Error("IndexedDB request failed")), { once: true });
    });
  }
  function transactionComplete2(transaction) {
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
      this.closing = false;
      this.databaseName = options.databaseName ?? DEFAULT_DELTA_DATABASE_NAME;
      this.openTimeoutMs = options.openTimeoutMs ?? 2e3;
      if (!this.databaseName.trim()) throw new TypeError("delta databaseName must be a non-empty string");
      if (!Number.isFinite(this.openTimeoutMs) || this.openTimeoutMs <= 0) {
        throw new RangeError("delta openTimeoutMs must be a positive finite number");
      }
    }
    async loadChunk(worldId, chunkX, chunkY, options) {
      if (this.disposed || this.closing) return void 0;
      await this.flush();
      const memory = await super.loadChunk(worldId, chunkX, chunkY, options);
      if (memory) return memory;
      const database = await this.open();
      const transaction = database.transaction(DELTA_OBJECT_STORE, "readonly");
      const record = await requestResult2(transaction.objectStore(DELTA_OBJECT_STORE).get(chunkKey(worldId, chunkX, chunkY)));
      await transactionComplete2(transaction);
      if (!record) return void 0;
      const delta = normalizeWorldChunkDelta(record, worldId, chunkX, chunkY, options);
      this.chunks.set(record.key, delta);
      return this.cloneDelta(delta);
    }
    putChunkDelta(worldId, chunkX, chunkY, changes, options) {
      if (this.disposed || this.closing) return Promise.reject(new Error("WorldDeltaStore has been disposed"));
      return this.enqueue(async () => {
        const key = chunkKey(worldId, chunkX, chunkY);
        const database = await this.open();
        const transaction = database.transaction(DELTA_OBJECT_STORE, "readwrite");
        const completion = transactionComplete2(transaction);
        try {
          const store = transaction.objectStore(DELTA_OBJECT_STORE);
          const record = await requestResult2(store.get(key));
          const current = record ? normalizeWorldChunkDelta(record, worldId, chunkX, chunkY, options) : void 0;
          const result = mergeChunkDelta(current, worldId, chunkX, chunkY, changes, options);
          const requiresWrite = result !== void 0 && (record?.version !== WORLD_DELTA_FORMAT_VERSION || result.revision !== current?.revision);
          if (requiresWrite) store.put({ key, ...this.cloneDelta(result) });
          await completion;
          if (result) this.chunks.set(key, this.cloneDelta(result));
          else this.chunks.delete(key);
          return result ? this.cloneDelta(result) : void 0;
        } catch (reason) {
          try {
            transaction.abort();
          } catch {
          }
          await completion.catch(() => void 0);
          throw reason;
        }
      });
    }
    putTile(worldId, chunkX, chunkY, entry, options) {
      if (this.disposed || this.closing) throw new Error("WorldDeltaStore has been disposed");
      void this.putChunkDelta(worldId, chunkX, chunkY, [entry], options).catch(() => void 0);
    }
    deleteTile(worldId, chunkX, chunkY, x, y, options) {
      if (this.disposed || this.closing) throw new Error("WorldDeltaStore has been disposed");
      void this.putChunkDelta(worldId, chunkX, chunkY, [{ x, y, override: null }], options).catch(() => void 0);
    }
    async flush() {
      await this.pending;
      if (this.pendingError !== void 0) {
        const error = this.pendingError;
        this.pendingError = void 0;
        throw error;
      }
    }
    async listWorld(worldId) {
      if (this.disposed || this.closing) throw new Error("WorldDeltaStore has been disposed");
      await this.flush();
      const database = await this.open();
      const transaction = database.transaction(DELTA_OBJECT_STORE, "readonly");
      const records = await requestResult2(
        transaction.objectStore(DELTA_OBJECT_STORE).index("worldId").getAll(worldId)
      );
      await transactionComplete2(transaction);
      return records.map((record) => normalizeWorldChunkDelta(
        record,
        worldId,
        record.chunkX,
        record.chunkY,
        { chunkSize: record.chunkSize }
      )).sort((first, second) => first.chunkX - second.chunkX || first.chunkY - second.chunkY);
    }
    replaceWorld(worldId, deltas) {
      if (this.disposed || this.closing) return Promise.reject(new Error("WorldDeltaStore has been disposed"));
      const replacements = /* @__PURE__ */ new Map();
      for (const delta of deltas) {
        const normalized = normalizeWorldChunkDelta(
          delta,
          worldId,
          delta.chunkX,
          delta.chunkY,
          { chunkSize: delta.chunkSize }
        );
        const key = chunkKey(worldId, normalized.chunkX, normalized.chunkY);
        if (replacements.has(key)) return Promise.reject(new TypeError("world delta checkpoint contains duplicate chunks"));
        replacements.set(key, normalized);
      }
      return this.enqueue(async () => {
        const database = await this.open();
        const transaction = database.transaction(DELTA_OBJECT_STORE, "readwrite");
        const store = transaction.objectStore(DELTA_OBJECT_STORE);
        const keys = await requestResult2(store.index("worldId").getAllKeys(worldId));
        for (const key of keys) store.delete(key);
        for (const [key, delta] of replacements) {
          store.put({ key, ...this.cloneDelta(delta) });
        }
        await transactionComplete2(transaction);
        await super.clear(worldId);
        for (const [key, delta] of replacements) this.chunks.set(key, this.cloneDelta(delta));
      });
    }
    async clear(worldId) {
      if (this.disposed || this.closing) throw new Error("WorldDeltaStore has been disposed");
      await this.enqueue(async () => {
        await super.clear(worldId);
        const database = await this.open();
        const transaction = database.transaction(DELTA_OBJECT_STORE, "readwrite");
        const index = transaction.objectStore(DELTA_OBJECT_STORE).index("worldId");
        const keys = await requestResult2(index.getAllKeys(worldId));
        for (const key of keys) transaction.objectStore(DELTA_OBJECT_STORE).delete(key);
        await transactionComplete2(transaction);
      });
      await this.flush();
    }
    dispose() {
      if (this.disposed || this.closing) return;
      this.closing = true;
      void this.flush().finally(() => {
        this.disposed = true;
        void this.databasePromise?.then((database) => database.close(), () => void 0);
      }).catch(() => void 0);
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
        const request = indexedDB.open(this.databaseName, DELTA_DATABASE_VERSION);
        let settled = false;
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          reject(new Error("Opening the world delta database timed out"));
        }, this.openTimeoutMs);
        const finish = (callback, value) => {
          if (settled) return false;
          settled = true;
          clearTimeout(timer);
          callback(value);
          return true;
        };
        request.addEventListener("upgradeneeded", () => {
          if (!request.result.objectStoreNames.contains(DELTA_OBJECT_STORE)) {
            const store = request.result.createObjectStore(DELTA_OBJECT_STORE, { keyPath: "key" });
            store.createIndex("worldId", "worldId", { unique: false });
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

  // src/world/WorldSource.ts
  function isWorldVegetationSource(source) {
    return typeof source.prepareVegetation === "function";
  }
  function isMutableWorldSource(source) {
    const candidate = source;
    return typeof candidate.setTileOverride === "function" && typeof candidate.clearTileOverride === "function";
  }
  var WORLD_DELTA_CHECKPOINT_FORMAT_VERSION = 1;
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
  function resolveCache(options, dependencies) {
    if (dependencies.cache) return { cache: dependencies.cache, owned: false };
    if (options.cache && typeof options.cache === "object") return { cache: options.cache, owned: false };
    if (options.cache === true) {
      return {
        cache: new IndexedDbWorldChunkCache({
          databaseName: options.cacheDatabaseName,
          maxBytes: options.cacheMaxBytes
        }),
        owned: true
      };
    }
    return { cache: void 0, owned: false };
  }
  function resolveDeltaStore(options, dependencies) {
    if (dependencies.deltaStore) return { store: dependencies.deltaStore, owned: false };
    if (options.deltaStore === true) {
      return { store: new IndexedDbWorldDeltaStore({ databaseName: options.deltaDatabaseName }), owned: true };
    }
    return { store: options.deltaStore || void 0, owned: false };
  }
  function resolveWorldId(value, fallback) {
    const worldId = value ?? fallback;
    if (typeof worldId !== "string" || worldId.trim().length === 0) {
      throw new TypeError("worldId must be a non-empty string");
    }
    return worldId;
  }
  var MAX_DELTA_REVISION_TOMBSTONES = 4096;
  var WorldDeltaSession = class {
    constructor(deltaStore, worldId, chunkSize, tileStore) {
      this.deltaStore = deltaStore;
      this.worldId = worldId;
      this.chunkSize = chunkSize;
      this.tileStore = tileStore;
      this.chunks = /* @__PURE__ */ new Map();
      //Recently emptied chunks retain a bounded revision tombstone so navigation
      //summaries can be invalidated precisely without keeping every historical
      //edit forever. Overflow promotes one global baseline and drops the set.
      this.revisionTombstones = /* @__PURE__ */ new Map();
      this.baselineRevision = 0;
      this.generation = 0;
      this.clearing = false;
      this.restoring = false;
      this.disposed = false;
    }
    get stats() {
      let pendingTiles = 0;
      let restoringChunks = 0;
      for (const state of this.chunks.values()) {
        pendingTiles += (/* @__PURE__ */ new Set([
          ...state.pendingTiles.keys(),
          ...state.modifiedDuringRestore.keys()
        ])).size;
        if (state.restore) restoringChunks += 1;
      }
      return {
        trackedChunks: this.chunks.size + this.revisionTombstones.size,
        pendingTiles,
        restoringChunks
      };
    }
    getRevision(chunkX, chunkY) {
      const key = `${chunkX},${chunkY}`;
      return this.chunks.get(key)?.revision ?? this.revisionTombstones.get(key) ?? this.baselineRevision;
    }
    assertEditable() {
      if (this.disposed) throw new Error("world delta session has been disposed");
      if (this.clearing) throw new Error("world deltas are being cleared; await clearDeltas() before editing");
      if (this.restoring) throw new Error("world deltas are being restored; await checkpoint recovery before editing");
    }
    persist(points) {
      if (points.length === 0) return;
      this.assertEditable();
      const unique = /* @__PURE__ */ new Map();
      for (const point of points) unique.set(`${point.x},${point.y}`, point);
      const groups = /* @__PURE__ */ new Map();
      for (const point of unique.values()) {
        const chunkX = Math.floor(point.x / this.chunkSize);
        const chunkY = Math.floor(point.y / this.chunkSize);
        const key = `${chunkX},${chunkY}`;
        const group = groups.get(key) ?? { chunkX, chunkY, points: [] };
        group.points.push(point);
        groups.set(key, group);
      }
      for (const [key, group] of groups) {
        const state = this.state(key, group.chunkX, group.chunkY);
        state.mutationEpoch += 1;
        state.revision = this.incrementRevision(Math.max(state.revision, this.baselineRevision));
        for (const point of group.points) {
          const tileKey = `${point.x},${point.y}`;
          if (this.tileStore.getTileOverride(point.x, point.y)) state.activeTiles.add(tileKey);
          else state.activeTiles.delete(tileKey);
          if (this.deltaStore) {
            state.pendingTiles.set(tileKey, { ...point, epoch: state.mutationEpoch });
            if (state.restore) state.modifiedDuringRestore.set(tileKey, state.mutationEpoch);
          }
        }
        this.persistGroup(key, state);
      }
    }
    restore(chunkX, chunkY) {
      if (!this.deltaStore || this.disposed || this.clearing || this.restoring) return Promise.resolve();
      const key = `${chunkX},${chunkY}`;
      const state = this.state(key, chunkX, chunkY);
      if (state.restored) return Promise.resolve();
      if (state.restore) return state.restore;
      const generation = this.generation;
      const mutationEpoch = state.mutationEpoch;
      const revisionBeforeRestore = state.revision;
      const restore = (async () => {
        const loaded = await this.deltaStore.loadChunk(this.worldId, chunkX, chunkY, {
          chunkSize: this.chunkSize
        });
        if (this.disposed || generation !== this.generation) return;
        const delta = loaded ? normalizeWorldChunkDelta(loaded, this.worldId, chunkX, chunkY, { chunkSize: this.chunkSize }) : void 0;
        state.restored = true;
        if (!delta) return;
        const locallyMutated = state.mutationEpoch !== mutationEpoch;
        state.revision = locallyMutated ? Math.max(state.revision, delta.revision + 1) : delta.entries.length > 0 && delta.revision <= revisionBeforeRestore ? this.incrementRevision(revisionBeforeRestore) : Math.max(state.revision, delta.revision);
        const protectedTiles = /* @__PURE__ */ new Set([
          ...state.pendingTiles.keys(),
          ...state.modifiedDuringRestore.keys()
        ]);
        const restored = delta.entries.filter((entry) => !protectedTiles.has(`${entry.x},${entry.y}`));
        this.tileStore.setTileOverrides(restored.map((entry) => ({
          x: entry.x,
          y: entry.y,
          changes: entry.override
        })));
        for (const entry of restored) state.activeTiles.add(`${entry.x},${entry.y}`);
      })();
      state.restore = restore;
      void restore.finally(() => {
        if (state.restore !== restore) return;
        state.restore = void 0;
        state.modifiedDuringRestore.clear();
        this.pruneState(key, state);
      }).catch(() => void 0);
      return restore;
    }
    async flush() {
      if (this.disposed) throw new Error("world delta session has been disposed");
      if (this.clearing) throw new Error("world deltas are being cleared");
      if (!this.deltaStore) return;
      while (true) {
        for (const [key, state] of this.chunks) {
          if (state.pendingTiles.size > 0 && !state.write) this.startWrite(key, state);
        }
        const writes = [...this.chunks.values()].flatMap((state) => state.write ? [state.write] : []);
        if (writes.length === 0) {
          await this.deltaStore.flush();
          if ([...this.chunks.values()].some((state) => state.write || state.pendingTiles.size > 0)) continue;
          return;
        }
        const results = await Promise.allSettled(writes);
        const failure = results.find((result) => result.status === "rejected");
        if (failure) {
          await this.deltaStore.flush().catch(() => void 0);
          throw this.persistenceError(failure.reason);
        }
      }
    }
    async createCheckpointSnapshot() {
      if (this.restoring) throw new Error("world deltas are being restored");
      await this.flush();
      if (!this.deltaStore?.listWorld) {
        throw new Error("WorldDeltaStore does not support checkpoint enumeration");
      }
      const deltas = await this.deltaStore.listWorld(this.worldId);
      return {
        version: WORLD_DELTA_CHECKPOINT_FORMAT_VERSION,
        worldId: this.worldId,
        chunkSize: this.chunkSize,
        deltas: deltas.map((delta) => normalizeWorldChunkDelta(
          delta,
          this.worldId,
          delta.chunkX,
          delta.chunkY,
          { chunkSize: this.chunkSize }
        ))
      };
    }
    async restoreCheckpointSnapshot(snapshot) {
      if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot) || snapshot.version !== WORLD_DELTA_CHECKPOINT_FORMAT_VERSION || snapshot.worldId !== this.worldId || snapshot.chunkSize !== this.chunkSize || !Array.isArray(snapshot.deltas)) {
        throw new TypeError("world delta checkpoint is invalid or incompatible");
      }
      if (!this.deltaStore?.replaceWorld) {
        throw new Error("WorldDeltaStore does not support atomic checkpoint replacement");
      }
      const deltas = snapshot.deltas.map((delta) => normalizeWorldChunkDelta(
        delta,
        this.worldId,
        delta.chunkX,
        delta.chunkY,
        { chunkSize: this.chunkSize }
      ));
      const keys = /* @__PURE__ */ new Set();
      for (const delta of deltas) {
        const key = `${delta.chunkX},${delta.chunkY}`;
        if (keys.has(key)) throw new TypeError("world delta checkpoint contains duplicate chunks");
        keys.add(key);
      }
      if (this.disposed) throw new Error("world delta session has been disposed");
      if (this.clearing) throw new Error("world deltas are being cleared");
      if (this.restoring) throw new Error("world deltas are already being restored");
      this.restoring = true;
      try {
        await this.flush();
        await this.deltaStore.replaceWorld(this.worldId, deltas);
        await this.deltaStore.flush();
        if (this.disposed) throw new Error("world delta session has been disposed");
        this.generation += 1;
        this.chunks.clear();
        this.revisionTombstones.clear();
        this.baselineRevision = 0;
        this.tileStore.clearTileOverrides();
        for (const delta of deltas) {
          const key = `${delta.chunkX},${delta.chunkY}`;
          const state = this.state(key, delta.chunkX, delta.chunkY);
          state.revision = delta.revision;
          state.restored = true;
          for (const entry of delta.entries) state.activeTiles.add(`${entry.x},${entry.y}`);
          this.tileStore.setTileOverrides(delta.entries.map((entry) => ({
            x: entry.x,
            y: entry.y,
            changes: entry.override
          })));
        }
      } finally {
        this.restoring = false;
      }
    }
    async clear() {
      if (this.disposed) throw new Error("world delta session has been disposed");
      if (this.clearing) throw new Error("world deltas are already being cleared");
      if (this.restoring) throw new Error("world deltas are being restored");
      this.clearing = true;
      this.generation += 1;
      try {
        await Promise.allSettled(
          [...this.chunks.values()].flatMap((state) => state.write ? [state.write] : [])
        );
        await this.deltaStore?.clear(this.worldId);
        this.tileStore.clearTileOverrides();
        let highestRevision = this.baselineRevision;
        for (const revision of this.revisionTombstones.values()) {
          highestRevision = Math.max(highestRevision, revision);
        }
        for (const state of this.chunks.values()) {
          highestRevision = Math.max(highestRevision, state.revision);
          state.restore = void 0;
        }
        this.baselineRevision = this.incrementRevision(highestRevision);
        this.chunks.clear();
        this.revisionTombstones.clear();
      } finally {
        this.clearing = false;
      }
    }
    dispose() {
      this.disposed = true;
      this.generation += 1;
      for (const state of this.chunks.values()) state.restore = void 0;
      this.chunks.clear();
      this.revisionTombstones.clear();
    }
    state(key, chunkX, chunkY) {
      let state = this.chunks.get(key);
      if (!state) {
        const revision = this.revisionTombstones.get(key) ?? this.baselineRevision;
        this.revisionTombstones.delete(key);
        state = {
          chunkX,
          chunkY,
          revision,
          mutationEpoch: 0,
          activeTiles: /* @__PURE__ */ new Set(),
          pendingTiles: /* @__PURE__ */ new Map(),
          modifiedDuringRestore: /* @__PURE__ */ new Map(),
          restored: false
        };
        this.chunks.set(key, state);
      } else if (state.chunkX !== chunkX || state.chunkY !== chunkY) {
        throw new Error("world delta chunk state identity is inconsistent");
      }
      return state;
    }
    persistGroup(key, state) {
      if (!this.deltaStore) {
        this.pruneState(key, state);
        return;
      }
      this.startWrite(key, state);
    }
    startWrite(key, state) {
      if (!this.deltaStore || state.write || state.pendingTiles.size === 0 || this.disposed || this.clearing) return;
      const pending = new Map(state.pendingTiles);
      const generation = this.generation;
      const write = this.writePendingTiles(state, pending).then((revision) => {
        if (this.disposed || generation !== this.generation) return;
        if (revision !== void 0) state.revision = Math.max(state.revision, revision);
        for (const [tileKey, point] of pending) {
          if (state.pendingTiles.get(tileKey)?.epoch === point.epoch) state.pendingTiles.delete(tileKey);
        }
      });
      state.write = write;
      void write.then(() => {
        if (state.write !== write) return;
        state.write = void 0;
        if (!this.disposed && generation === this.generation && state.pendingTiles.size > 0) {
          this.startWrite(key, state);
        }
        this.pruneState(key, state);
      }, () => {
        if (state.write === write) state.write = void 0;
      });
      void write.catch(() => void 0);
    }
    async writePendingTiles(state, pending) {
      const store = this.deltaStore;
      if (!store) throw new Error("world delta store is unavailable");
      const changes = [...pending.values()].map((point) => ({
        x: point.x,
        y: point.y,
        override: this.tileStore.getTileOverride(point.x, point.y) ?? null
      }));
      if (store.putChunkDelta) {
        const delta = await store.putChunkDelta(
          this.worldId,
          state.chunkX,
          state.chunkY,
          changes,
          { chunkSize: this.chunkSize }
        );
        return delta?.revision;
      }
      for (const change of changes) {
        if (change.override) {
          store.putTile(this.worldId, state.chunkX, state.chunkY, {
            x: change.x,
            y: change.y,
            override: change.override
          }, { chunkSize: this.chunkSize });
        } else {
          store.deleteTile(
            this.worldId,
            state.chunkX,
            state.chunkY,
            change.x,
            change.y,
            { chunkSize: this.chunkSize }
          );
        }
      }
      await store.flush();
      return void 0;
    }
    pruneState(key, state) {
      if (this.disposed || state.activeTiles.size > 0 || state.restore || state.write || state.pendingTiles.size > 0 || state.modifiedDuringRestore.size > 0) return;
      if (this.chunks.get(key) === state) this.chunks.delete(key);
      if (state.revision <= this.baselineRevision) return;
      this.revisionTombstones.delete(key);
      this.revisionTombstones.set(key, state.revision);
      if (this.revisionTombstones.size <= MAX_DELTA_REVISION_TOMBSTONES) return;
      let highestRevision = this.baselineRevision;
      for (const revision of this.revisionTombstones.values()) {
        highestRevision = Math.max(highestRevision, revision);
      }
      this.baselineRevision = this.incrementRevision(highestRevision);
      this.revisionTombstones.clear();
    }
    incrementRevision(revision) {
      if (!Number.isSafeInteger(revision) || revision >= Number.MAX_SAFE_INTEGER) {
        throw new RangeError("world delta revision space is exhausted");
      }
      return revision + 1;
    }
    persistenceError(reason) {
      return reason instanceof Error ? reason : new Error(`world delta persistence failed: ${String(reason)}`);
    }
  };
  function cacheStats(pool, cache2, cachedLoads, deltas) {
    const stored = cache2?.stats;
    return {
      ...pool,
      completed: pool.completed + cachedLoads,
      cacheHits: cachedLoads,
      cacheMisses: stored?.misses ?? 0,
      cacheWrites: stored?.writes ?? 0,
      cacheErrors: stored?.errors ?? 0,
      cachedChunks: stored?.entries ?? 0,
      cachedBytes: stored?.bytes ?? 0,
      trackedDeltaChunks: deltas.trackedChunks,
      pendingDeltaTiles: deltas.pendingTiles,
      restoringDeltaChunks: deltas.restoringChunks
    };
  }
  var ToroidalWorldSource = class {
    constructor(options, dependencies = {}) {
      this.cachedLoads = 0;
      this.cacheEpoch = 0;
      this.disposed = false;
      if (!options || typeof options !== "object") throw new TypeError("toroidal world options are required");
      if (!Number.isInteger(options.width) || options.width < MIN_WORLD_SIZE || options.width > MAX_WORLD_SIZE || !Number.isInteger(options.height) || options.height < MIN_WORLD_SIZE || options.height > MAX_WORLD_SIZE) {
        throw new RangeError(`toroidal world dimensions must be integers between ${MIN_WORLD_SIZE} and ${MAX_WORLD_SIZE}`);
      }
      if (options.width % 2 !== 0) throw new RangeError("toroidal worlds require an even width");
      if (options.workerCount !== void 0 && (!Number.isInteger(options.workerCount) || options.workerCount <= 0 || options.workerCount > 8)) {
        throw new RangeError("workerCount must be an integer between 1 and 8");
      }
      this.chunkSize = options.chunkSize ?? DEFAULT_WORLD_GENERATION_CHUNK_SIZE;
      validateChunkSize(this.chunkSize);
      this.seed = options.seed;
      this.descriptor = createWorldDescriptor({
        seed: options.seed,
        chunkSize: this.chunkSize,
        generatorVersion: options.generatorVersion,
        world: { width: options.width, height: options.height, topology: "toroidal" }
      });
      this.worldFingerprint = serializeWorldDescriptor(this.descriptor);
      this.bounds = { width: options.width, height: options.height, wrapX: true, wrapY: true };
      const resolvedDeltas = resolveDeltaStore(options, dependencies);
      this.deltaStore = resolvedDeltas.store;
      this.ownsDeltaStore = resolvedDeltas.owned;
      this.worldId = resolveWorldId(options.worldId, this.worldFingerprint);
      this.chunkCountX = Math.ceil(options.width / this.chunkSize);
      this.chunkCountY = Math.ceil(options.height / this.chunkSize);
      this.store = dependencies.store ?? new SparseWorldChunkStore(this.bounds);
      if (this.store.map.infinite || this.store.map.w !== options.width || this.store.map.h !== options.height || !this.store.map.wrapX || !this.store.map.wrapY) {
        throw new TypeError("toroidal world store bounds do not match source dimensions");
      }
      this.deltaSession = new WorldDeltaSession(this.deltaStore, this.worldId, this.chunkSize, this.store);
      const resolvedCache = resolveCache(options, dependencies);
      this.cache = resolvedCache.cache;
      this.ownsCache = resolvedCache.owned;
      try {
        this.pool = dependencies.pool ?? new WorldGeneratorPool(options.workerUrl, {
          size: options.workerCount,
          reservedChunkWorkers: options.reservedChunkWorkers,
          coordinator: options.workCoordinator,
          domain: "worker"
        });
      } catch (error) {
        if (this.ownsCache) this.cache?.dispose();
        throw error;
      }
    }
    get map() {
      return this.store.map;
    }
    get stats() {
      return cacheStats(this.pool.stats, this.cache, this.cachedLoads, this.deltaSession.stats);
    }
    resolveChunk(chunkX, chunkY) {
      if (!Number.isInteger(chunkX) || !Number.isInteger(chunkY)) return void 0;
      return {
        x: positiveModulo(chunkX, this.chunkCountX),
        y: positiveModulo(chunkY, this.chunkCountY)
      };
    }
    chunkDistance(chunkX, chunkY, centerChunkX, centerChunkY) {
      const dx = Math.min(Math.abs(chunkX - centerChunkX), this.chunkCountX - Math.abs(chunkX - centerChunkX));
      const dy = Math.min(Math.abs(chunkY - centerChunkY), this.chunkCountY - Math.abs(chunkY - centerChunkY));
      return Math.hypot(dx, dy);
    }
    async loadChunk(chunkX, chunkY, request = {}) {
      if (this.disposed) throw new Error("ToroidalWorldSource has been disposed");
      const resolved = this.resolveChunk(chunkX, chunkY);
      if (!resolved || resolved.x !== chunkX || resolved.y !== chunkY) {
        throw new RangeError("toroidal chunk coordinates must use canonical bounds");
      }
      const generation = {
        seed: this.seed,
        chunkX,
        chunkY,
        chunkSize: this.chunkSize,
        world: { width: this.bounds.width, height: this.bounds.height, topology: "toroidal" }
      };
      const cacheKey = createWorldChunkCacheKey({ descriptor: this.descriptor, chunkX, chunkY });
      const cacheEpoch = this.cacheEpoch;
      let packed = this.cache ? await this.readCachedChunk(cacheKey, chunkX, chunkY) : void 0;
      if (!packed) {
        packed = await this.pool.generateChunk(generation, request);
        if (cacheEpoch === this.cacheEpoch) void this.cache?.put(cacheKey, packed).catch(() => false);
      }
      if (request.signal?.aborted) throw abortError2();
      await this.restoreChunkDelta(chunkX, chunkY);
      const coreTiles = this.store.add(packed);
      return { chunkX, chunkY, chunkSize: this.chunkSize, coreTiles, payload: packed };
    }
    releaseChunk(chunk) {
      this.store.remove(chunk.chunkX, chunk.chunkY);
    }
    prepareVegetation(options, request = {}) {
      if (this.disposed) return Promise.reject(new Error("ToroidalWorldSource has been disposed"));
      return this.pool.generateVegetation({
        ...options,
        map: createWorldVegetationMapSnapshot(this.map, options.points)
      }, request);
    }
    configureWorkerCount(count) {
      return this.pool.configureSize(count);
    }
    hasChunk(chunkX, chunkY) {
      return this.store.hasChunk(chunkX, chunkY);
    }
    hasTile(x, y) {
      if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) || x < 0 || x >= this.bounds.width || y < 0 || y >= this.bounds.height) return false;
      return this.store.hasCoreTile(x, y);
    }
    getChunkRevision(chunkX, chunkY) {
      const resolved = this.resolveChunk(chunkX, chunkY);
      if (!resolved) return void 0;
      return {
        terrainRevision: this.worldFingerprint,
        deltaRevision: this.deltaSession.getRevision(resolved.x, resolved.y)
      };
    }
    setTileOverride(x, y, changes) {
      if (this.disposed) throw new Error("ToroidalWorldSource has been disposed");
      if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) {
        throw new RangeError("tile override coordinates must be safe integers");
      }
      const canonicalX = positiveModulo(x, this.bounds.width);
      const canonicalY = positiveModulo(y, this.bounds.height);
      this.deltaSession.assertEditable();
      if (this.store.setTileOverride(canonicalX, canonicalY, changes)) {
        this.persistOverrides([{ x: canonicalX, y: canonicalY }]);
      }
    }
    setTileOverrides(changes) {
      if (this.disposed) throw new Error("ToroidalWorldSource has been disposed");
      const normalized = changes.map((change) => {
        if (!Number.isSafeInteger(change.x) || !Number.isSafeInteger(change.y)) {
          throw new RangeError("tile override coordinates must be safe integers");
        }
        return {
          x: positiveModulo(change.x, this.bounds.width),
          y: positiveModulo(change.y, this.bounds.height),
          changes: change.changes
        };
      });
      this.deltaSession.assertEditable();
      this.persistOverrides(this.store.setTileOverrides(normalized));
    }
    clearTileOverride(x, y) {
      if (this.disposed) return false;
      if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) return false;
      const canonicalX = positiveModulo(x, this.bounds.width);
      const canonicalY = positiveModulo(y, this.bounds.height);
      this.deltaSession.assertEditable();
      const cleared = this.store.clearTileOverride(canonicalX, canonicalY);
      if (cleared) {
        this.persistOverrides([{ x: canonicalX, y: canonicalY }]);
      }
      return cleared;
    }
    clearCache() {
      this.cacheEpoch += 1;
      return this.cache?.clear() ?? Promise.resolve(false);
    }
    flushCache() {
      return this.cache?.flush?.() ?? Promise.resolve();
    }
    flushDeltas() {
      return this.deltaSession.flush();
    }
    createDeltaCheckpointSnapshot() {
      return this.deltaSession.createCheckpointSnapshot();
    }
    restoreDeltaCheckpointSnapshot(snapshot) {
      return this.deltaSession.restoreCheckpointSnapshot(snapshot);
    }
    clearDeltas() {
      return this.deltaSession.clear();
    }
    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      this.deltaSession.dispose();
      this.pool.dispose();
      this.store.clear();
      if (this.ownsCache) this.cache?.dispose();
      if (this.ownsDeltaStore) this.deltaStore?.dispose();
    }
    async readCachedChunk(key, chunkX, chunkY) {
      if (!this.cache) return void 0;
      const chunk = await this.cache.get(key).catch(() => void 0);
      if (!chunk || chunk.chunkX !== chunkX || chunk.chunkY !== chunkY || chunk.chunkSize !== this.chunkSize) return void 0;
      this.cachedLoads += 1;
      return chunk;
    }
    persistOverrides(points) {
      this.deltaSession.persist(points);
    }
    restoreChunkDelta(chunkX, chunkY) {
      return this.deltaSession.restore(chunkX, chunkY);
    }
  };
  var ProceduralWorldSource = class {
    constructor(options, dependencies = {}) {
      this.cachedLoads = 0;
      this.cacheEpoch = 0;
      this.disposed = false;
      if (!options || typeof options !== "object") throw new TypeError("procedural world options are required");
      if (options.workerCount !== void 0 && (!Number.isInteger(options.workerCount) || options.workerCount <= 0 || options.workerCount > 8)) {
        throw new RangeError("workerCount must be an integer between 1 and 8");
      }
      this.chunkSize = options.chunkSize ?? DEFAULT_WORLD_GENERATION_CHUNK_SIZE;
      validateChunkSize(this.chunkSize);
      this.seed = options.seed;
      this.descriptor = createWorldDescriptor({
        seed: options.seed,
        chunkSize: this.chunkSize,
        generatorVersion: options.generatorVersion
      });
      this.worldFingerprint = serializeWorldDescriptor(this.descriptor);
      this.store = dependencies.store ?? new SparseWorldChunkStore();
      const resolvedDeltas = resolveDeltaStore(options, dependencies);
      this.deltaStore = resolvedDeltas.store;
      this.ownsDeltaStore = resolvedDeltas.owned;
      this.worldId = resolveWorldId(options.worldId, this.worldFingerprint);
      this.deltaSession = new WorldDeltaSession(this.deltaStore, this.worldId, this.chunkSize, this.store);
      const resolvedCache = resolveCache(options, dependencies);
      this.cache = resolvedCache.cache;
      this.ownsCache = resolvedCache.owned;
      try {
        this.pool = dependencies.pool ?? new WorldGeneratorPool(options.workerUrl, {
          size: options.workerCount,
          reservedChunkWorkers: options.reservedChunkWorkers,
          coordinator: options.workCoordinator,
          domain: "worker"
        });
      } catch (error) {
        if (this.ownsCache) this.cache?.dispose();
        throw error;
      }
    }
    get map() {
      return this.store.map;
    }
    get stats() {
      return cacheStats(this.pool.stats, this.cache, this.cachedLoads, this.deltaSession.stats);
    }
    resolveChunk(chunkX, chunkY) {
      return Number.isSafeInteger(chunkX) && Number.isSafeInteger(chunkY) ? { x: chunkX, y: chunkY } : void 0;
    }
    chunkDistance(chunkX, chunkY, centerChunkX, centerChunkY) {
      return Math.hypot(chunkX - centerChunkX, chunkY - centerChunkY);
    }
    async loadChunk(chunkX, chunkY, request = {}) {
      if (this.disposed) throw new Error("ProceduralWorldSource has been disposed");
      const generation = { seed: this.seed, chunkX, chunkY, chunkSize: this.chunkSize };
      const cacheKey = createWorldChunkCacheKey({ descriptor: this.descriptor, chunkX, chunkY });
      const cacheEpoch = this.cacheEpoch;
      let packed = this.cache ? await this.readCachedChunk(cacheKey, chunkX, chunkY) : void 0;
      if (!packed) {
        packed = await this.pool.generateChunk(generation, request);
        if (cacheEpoch === this.cacheEpoch) void this.cache?.put(cacheKey, packed).catch(() => false);
      }
      if (request.signal?.aborted) throw abortError2();
      await this.restoreChunkDelta(chunkX, chunkY);
      const coreTiles = this.store.add(packed);
      return { chunkX, chunkY, chunkSize: this.chunkSize, coreTiles, payload: packed };
    }
    releaseChunk(chunk) {
      this.store.remove(chunk.chunkX, chunk.chunkY);
    }
    prepareVegetation(options, request = {}) {
      if (this.disposed) return Promise.reject(new Error("ProceduralWorldSource has been disposed"));
      return this.pool.generateVegetation({
        ...options,
        map: createWorldVegetationMapSnapshot(this.map, options.points)
      }, request);
    }
    configureWorkerCount(count) {
      return this.pool.configureSize(count);
    }
    hasChunk(chunkX, chunkY) {
      return this.store.hasChunk(chunkX, chunkY);
    }
    hasTile(x, y) {
      return this.store.hasCoreTile(x, y);
    }
    getChunkRevision(chunkX, chunkY) {
      const resolved = this.resolveChunk(chunkX, chunkY);
      if (!resolved) return void 0;
      return {
        terrainRevision: this.worldFingerprint,
        deltaRevision: this.deltaSession.getRevision(resolved.x, resolved.y)
      };
    }
    setTileOverride(x, y, changes) {
      if (this.disposed) throw new Error("ProceduralWorldSource has been disposed");
      this.deltaSession.assertEditable();
      if (this.store.setTileOverride(x, y, changes)) this.persistOverrides([{ x, y }]);
    }
    setTileOverrides(changes) {
      if (this.disposed) throw new Error("ProceduralWorldSource has been disposed");
      this.deltaSession.assertEditable();
      this.persistOverrides(this.store.setTileOverrides(changes));
    }
    clearTileOverride(x, y) {
      if (this.disposed) return false;
      this.deltaSession.assertEditable();
      const cleared = this.store.clearTileOverride(x, y);
      if (cleared) {
        this.persistOverrides([{ x, y }]);
      }
      return cleared;
    }
    clearCache() {
      this.cacheEpoch += 1;
      return this.cache?.clear() ?? Promise.resolve(false);
    }
    flushCache() {
      return this.cache?.flush?.() ?? Promise.resolve();
    }
    flushDeltas() {
      return this.deltaSession.flush();
    }
    createDeltaCheckpointSnapshot() {
      return this.deltaSession.createCheckpointSnapshot();
    }
    restoreDeltaCheckpointSnapshot(snapshot) {
      return this.deltaSession.restoreCheckpointSnapshot(snapshot);
    }
    clearDeltas() {
      return this.deltaSession.clear();
    }
    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      this.deltaSession.dispose();
      this.pool.dispose();
      this.store.clear();
      if (this.ownsCache) this.cache?.dispose();
      if (this.ownsDeltaStore) this.deltaStore?.dispose();
    }
    async readCachedChunk(key, chunkX, chunkY) {
      if (!this.cache) return void 0;
      const chunk = await this.cache.get(key).catch(() => void 0);
      if (!chunk || chunk.chunkX !== chunkX || chunk.chunkY !== chunkY || chunk.chunkSize !== this.chunkSize) return void 0;
      this.cachedLoads += 1;
      return chunk;
    }
    persistOverrides(points) {
      this.deltaSession.persist(points);
    }
    restoreChunkDelta(chunkX, chunkY) {
      return this.deltaSession.restore(chunkX, chunkY);
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

  // src/world/ChunkResidencyCoordinator.ts
  function abortError3(message) {
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
      if (options?.signal?.aborted) return Promise.reject(abortError3("Chunk lease request was aborted"));
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
          this.rejectWaiter(entry, waiter, abortError3("Chunk residency was disposed"));
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
            this.rejectWaiter(entry, waiter, abortError3("Chunk lease request was aborted"));
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
      this.rejectWaiter(entry, waiter, abortError3("Chunk lease request was aborted"));
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

  // src/world/WorldStreamer.ts
  function integerOption(name, value, minimum) {
    if (!Number.isInteger(value) || value < minimum) {
      throw new RangeError(`${name} must be an integer >= ${minimum}`);
    }
  }
  function abortError4(message) {
    if (typeof DOMException !== "undefined") return new DOMException(message, "AbortError");
    const error = new Error(message);
    error.name = "AbortError";
    return error;
  }
  function waitForRetry(delayMs, signal) {
    if (signal.aborted) return Promise.reject(abortError4("Chunk retry was aborted"));
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        signal.removeEventListener("abort", abort);
        resolve();
      }, delayMs);
      const abort = () => {
        clearTimeout(timeout);
        reject(abortError4("Chunk retry was aborted"));
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
      this.activeRequests = /* @__PURE__ */ new Set();
      this.wanted = /* @__PURE__ */ new Set();
      this.centerChunkX = 0;
      this.centerChunkY = 0;
      this.predictedChunkX = 0;
      this.predictedChunkY = 0;
      this.disposed = false;
      this.completed = 0;
      this.retried = 0;
      this.failed = 0;
      this.averageChunkLoadMs = 0;
      assertWorldSource(source);
      this.residency = options.residency ?? getChunkResidencyCoordinator(source);
      if (this.residency.source !== source) {
        throw new TypeError("WorldStreamer residency must coordinate its source");
      }
      this.residencyOwner = options.residencyOwner ?? "world-streamer";
      if (typeof this.residencyOwner !== "string" || this.residencyOwner.trim().length === 0) {
        throw new TypeError("residencyOwner must be a non-empty string");
      }
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
    setCenterTile(x, y, predictedTile) {
      if (this.disposed) return Promise.reject(new Error("WorldStreamer has been disposed"));
      if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) {
        return Promise.reject(new RangeError("streaming center must use safe integer tile coordinates"));
      }
      const center = this.resolveTileChunk(x, y);
      if (!center) return Promise.reject(new RangeError("streaming center is outside the world bounds"));
      let predicted = center;
      if (predictedTile) {
        if (!Number.isSafeInteger(predictedTile.x) || !Number.isSafeInteger(predictedTile.y)) {
          return Promise.reject(new RangeError("predicted streaming tile must use safe integer coordinates"));
        }
        const candidate = this.resolveTileChunk(predictedTile.x, predictedTile.y);
        const maximumAhead = Math.max(0, this.retentionRadius - this.loadRadius);
        if (candidate && this.source.chunkDistance(candidate.x, candidate.y, center.x, center.y) <= maximumAhead) {
          predicted = candidate;
        }
      }
      const changed = center.x !== this.centerChunkX || center.y !== this.centerChunkY || predicted.x !== this.predictedChunkX || predicted.y !== this.predictedChunkY || this.wanted.size === 0;
      this.centerChunkX = center.x;
      this.centerChunkY = center.y;
      this.predictedChunkX = predicted.x;
      this.predictedChunkY = predicted.y;
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
        configuredWorkers: source?.configuredWorkers ?? source?.workers ?? 0,
        completedChunks: source?.completed ?? this.completed,
        retriedChunkRequests: this.retried,
        failedChunks: this.failed,
        cacheHits: source?.cacheHits ?? 0,
        cacheMisses: source?.cacheMisses ?? 0,
        cachedChunks: source?.cachedChunks ?? 0,
        cachedBytes: source?.cachedBytes ?? 0,
        cacheErrors: source?.cacheErrors ?? 0,
        queuedTerrainChunks: source?.queuedChunks ?? 0,
        queuedVegetationChunks: source?.queuedVegetation ?? 0,
        busyTerrainWorkers: source?.busyChunkWorkers ?? 0,
        busyVegetationWorkers: source?.busyVegetationWorkers ?? 0,
        averageTerrainTaskMs: source?.averageChunkMs ?? 0,
        averageVegetationTaskMs: source?.averageVegetationMs ?? 0,
        averageChunkLoadMs: this.averageChunkLoadMs,
        queuedWeight: source?.queuedWeight ?? 0,
        oldestQueuedMs: source?.oldestQueuedMs ?? 0,
        shedTasks: source?.shedTasks ?? 0,
        starvationPromotions: source?.starvationPromotions ?? 0,
        workerFailures: source?.workerFailures ?? 0,
        clientFactoryFailures: source?.clientFactoryFailures ?? 0
      };
    }
    get residentChunks() {
      return [...this.residents.values()].map((lease) => lease.chunk);
    }
    // Resolves only after every request that was active at disposal has
    // observed cancellation and released any lease it acquired meanwhile.
    get settled() {
      return Promise.allSettled([...this.activeRequests]).then(() => void 0);
    }
    hasResident(chunkX, chunkY) {
      return this.residents.has(_WorldStreamer.key(chunkX, chunkY));
    }
    dispose(disposeSource = true) {
      if (this.disposed) return;
      this.disposed = true;
      for (const request of this.pending.values()) request.controller.abort();
      this.pending.clear();
      for (const lease of this.residents.values()) this.unload(lease);
      this.residents.clear();
      if (disposeSource) this.residency.dispose(true);
    }
    resolveTileChunk(tileX, tileY) {
      const bounds = this.source.bounds;
      let x = tileX;
      let y = tileY;
      if (bounds) {
        if (bounds.wrapX) x = positiveModulo(x, bounds.width);
        else if (x < 0 || x >= bounds.width) return void 0;
        if (bounds.wrapY) y = positiveModulo(y, bounds.height);
        else if (y < 0 || y >= bounds.height) return void 0;
      }
      return this.source.resolveChunk(
        Math.floor(x / this.source.chunkSize),
        Math.floor(y / this.source.chunkSize)
      );
    }
    refreshDemand() {
      const coordinateByKey = /* @__PURE__ */ new Map();
      const collect = (originX, originY, predictionPenalty) => {
        for (let dx = -this.loadRadius; dx <= this.loadRadius; dx += 1) {
          for (let dy = -this.loadRadius; dy <= this.loadRadius; dy += 1) {
            const radialDistance = Math.hypot(dx, dy);
            if (radialDistance > this.loadRadius + 0.5) continue;
            const resolved = this.source.resolveChunk(originX + dx, originY + dy);
            if (!resolved) continue;
            const key = _WorldStreamer.key(resolved.x, resolved.y);
            const distance = radialDistance + predictionPenalty;
            const existing = coordinateByKey.get(key);
            if (!existing || distance < existing.distance) {
              coordinateByKey.set(key, { ...resolved, distance, key });
            }
          }
        }
      };
      collect(this.centerChunkX, this.centerChunkY, 0);
      if (this.predictedChunkX !== this.centerChunkX || this.predictedChunkY !== this.centerChunkY) {
        collect(this.predictedChunkX, this.predictedChunkY, 0.35);
      }
      const coordinates = [...coordinateByKey.values()].sort((a, b) => a.distance - b.distance || a.x - b.x || a.y - b.y).slice(0, this.maxResidentChunks);
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
      if (resident) return Promise.resolve(resident.chunk);
      const existing = this.pending.get(key);
      if (existing && !existing.controller.signal.aborted) return existing.promise;
      if (existing) this.pending.delete(key);
      const controller = new AbortController();
      const startedAt = typeof performance === "undefined" ? Date.now() : performance.now();
      let pending;
      const promise = this.loadWithRetry(chunkX, chunkY, priority, controller.signal).then((lease) => {
        const chunk = lease.chunk;
        if (this.disposed || !this.wanted.has(key)) {
          lease.release();
          throw abortError4("Chunk is no longer wanted");
        }
        this.residents.set(key, lease);
        try {
          this.handlers.chunkLoaded(chunk);
        } catch (reason) {
          this.residents.delete(key);
          this.unload(lease);
          throw reason;
        }
        this.completed += 1;
        const completedAt = typeof performance === "undefined" ? Date.now() : performance.now();
        const loadMs = Math.max(0, completedAt - startedAt);
        this.averageChunkLoadMs = this.averageChunkLoadMs === 0 ? loadMs : this.averageChunkLoadMs + (loadMs - this.averageChunkLoadMs) * 0.2;
        this.enforceResidentLimit();
        return chunk;
      }).finally(() => {
        if (this.pending.get(key) === pending) this.pending.delete(key);
        this.activeRequests.delete(promise);
      });
      pending = { controller, promise };
      this.pending.set(key, pending);
      this.activeRequests.add(promise);
      return promise;
    }
    async loadWithRetry(chunkX, chunkY, priority, signal) {
      for (let attempt = 0; ; attempt += 1) {
        try {
          const lease = await this.residency.acquireChunk(chunkX, chunkY, {
            owner: this.residencyOwner,
            priority,
            signal
          });
          const chunk = lease.chunk;
          if (signal.aborted) {
            lease.release();
            throw abortError4("Chunk load completed after cancellation");
          }
          try {
            assertWorldChunk(this.source, chunk, chunkX, chunkY);
          } catch (reason) {
            lease.release();
            throw reason;
          }
          return lease;
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
      for (const [key, lease] of this.residents) {
        const chunk = lease.chunk;
        const distance = this.source.chunkDistance(
          chunk.chunkX,
          chunk.chunkY,
          this.centerChunkX,
          this.centerChunkY
        );
        if (distance <= this.retentionRadius + 0.5) continue;
        this.residents.delete(key);
        this.unload(lease);
      }
    }
    enforceResidentLimit() {
      if (this.residents.size <= this.maxResidentChunks) return;
      const candidates = [...this.residents.entries()].filter(([key]) => !this.wanted.has(key)).sort((a, b) => this.distanceFromCenter(b[1].chunk) - this.distanceFromCenter(a[1].chunk));
      while (this.residents.size > this.maxResidentChunks && candidates.length > 0) {
        const [key, lease] = candidates.shift();
        this.residents.delete(key);
        this.unload(lease);
      }
    }
    distanceFromCenter(chunk) {
      return this.source.chunkDistance(chunk.chunkX, chunk.chunkY, this.centerChunkX, this.centerChunkY);
    }
    unload(lease) {
      const chunk = lease.chunk;
      try {
        this.handlers.chunkUnloading(chunk);
      } catch (reason) {
        this.reportError(reason);
      }
      try {
        lease.release();
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

  // src/rendering/RenderWorldController.ts
  var RenderWorldController = class {
    constructor(source, workCoordinator, options = {}) {
      this.source = source;
      this.disposed = false;
      this.residency = getChunkResidencyCoordinator(source);
      this.lifecycle = new LifecycleScope("render-world", options);
      this.detachWorkTelemetry = workCoordinator?.registerTelemetry("streaming", () => ({
        pendingTasks: (this.stats?.pendingChunks ?? 0) + (this.stats?.queuedChunks ?? 0),
        pendingWeight: this.stats?.queuedWeight ?? this.stats?.queuedChunks ?? 0,
        busyTasks: this.stats?.busyWorkers ?? 0,
        oldestTaskAgeMs: this.stats?.oldestQueuedMs ?? 0,
        shedTasks: this.stats?.shedTasks ?? 0,
        starvationPromotions: this.stats?.starvationPromotions ?? 0
      }));
    }
    startStreaming(handlers, options = {}) {
      if (this.disposed) throw new Error("RenderWorldController has been disposed");
      if (this.activeStreamer) throw new Error("Render world streaming has already started");
      const guardedHandlers = {
        chunkLoaded: (chunk) => {
          this.lifecycle.publish(chunk, handlers.chunkLoaded);
        },
        chunkUnloading: (chunk) => {
          handlers.chunkUnloading(chunk);
        },
        error: (error) => {
          this.lifecycle.publish(error, (value) => handlers.error?.(value));
        }
      };
      this.activeStreamer = new WorldStreamer(this.source, guardedHandlers, {
        ...options,
        residency: this.residency,
        residencyOwner: options.residencyOwner ?? "render-world"
      });
      return this.activeStreamer;
    }
    setCenterTile(x, y, predictedTile) {
      if (!this.activeStreamer) return Promise.reject(new Error("Render world streaming has not started"));
      const task = this.activeStreamer.setCenterTile(x, y, predictedTile).then((chunk) => {
        if (!this.lifecycle.active) throw lifecycleAbortError("Render world session was superseded");
        return chunk;
      });
      return this.lifecycle.track(task);
    }
    get streamer() {
      return this.activeStreamer;
    }
    get stats() {
      return this.activeStreamer?.stats;
    }
    get lifecycleStats() {
      return this.lifecycle.stats;
    }
    get settled() {
      return this.lifecycle.settled;
    }
    stop(disposeSource = true) {
      if (this.disposed) return;
      this.disposed = true;
      this.detachWorkTelemetry?.();
      if (this.activeStreamer) void this.lifecycle.track(this.activeStreamer.settled).catch(() => void 0);
      void this.lifecycle.close();
      this.activeStreamer?.dispose(false);
      this.activeStreamer = void 0;
      this.residency.dispose(false);
      if (disposeSource) this.source.dispose();
    }
  };
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

  // src/rendering/WebGlGpuTimer.ts
  var WebGlGpuTimer = class {
    constructor(gl, options = {}) {
      this.gl = gl;
      this.pending = [];
      this.disposed = false;
      this.completedSamples = 0;
      this.disjointSamples = 0;
      this.droppedSamples = 0;
      this.saturatedFrames = 0;
      this.maxPendingQueries = options.maxPendingQueries ?? 4;
      this.now = options.now ?? (() => typeof performance === "undefined" ? Date.now() : performance.now());
      if (!Number.isInteger(this.maxPendingQueries) || this.maxPendingQueries <= 0) {
        throw new RangeError("maxPendingQueries must be a positive integer");
      }
      this.refreshExtension();
    }
    get supported() {
      return !this.disposed && this.extension !== void 0 && typeof this.gl.createQuery === "function";
    }
    begin() {
      if (!this.supported || this.activeQuery || this.gl.isContextLost()) return false;
      if (this.pending.length >= this.maxPendingQueries) {
        this.droppedSamples += 1;
        this.saturatedFrames += 1;
        return false;
      }
      const query = this.gl.createQuery();
      if (!query) {
        this.droppedSamples += 1;
        return false;
      }
      try {
        this.gl.beginQuery(this.extension.TIME_ELAPSED_EXT, query);
        this.activeQuery = query;
        return true;
      } catch {
        this.deleteQuery(query);
        this.droppedSamples += 1;
        return false;
      }
    }
    end() {
      const query = this.activeQuery;
      if (!query) return;
      this.activeQuery = void 0;
      try {
        this.gl.endQuery(this.extension.TIME_ELAPSED_EXT);
        this.pending.push(query);
      } catch {
        this.deleteQuery(query);
        this.droppedSamples += 1;
      }
    }
    // Returns the newest newly-available measurement, or undefined when the
    // GPU has not completed a query yet. Disjoint results are discarded.
    poll() {
      if (!this.supported) return void 0;
      if (this.gl.isContextLost()) {
        this.clearQueries(true);
        this.extension = void 0;
        this.resetLastSample();
        return void 0;
      }
      if (this.pending.length === 0) return void 0;
      let disjoint = false;
      try {
        disjoint = Boolean(this.gl.getParameter(this.extension.GPU_DISJOINT_EXT));
      } catch {
        this.clearQueries(true);
        return void 0;
      }
      if (disjoint) {
        this.disjointSamples += this.pending.length;
        for (const query of this.pending.splice(0)) this.deleteQuery(query);
        return void 0;
      }
      let latest;
      while (this.pending.length > 0) {
        const query = this.pending[0];
        let available = false;
        try {
          available = Boolean(this.gl.getQueryParameter(query, this.gl.QUERY_RESULT_AVAILABLE));
        } catch {
          this.pending.shift();
          this.deleteQuery(query);
          this.droppedSamples += 1;
          continue;
        }
        if (!available) break;
        this.pending.shift();
        let elapsedNs;
        try {
          elapsedNs = Number(this.gl.getQueryParameter(query, this.gl.QUERY_RESULT));
        } catch {
          this.deleteQuery(query);
          this.droppedSamples += 1;
          continue;
        }
        this.deleteQuery(query);
        if (!Number.isFinite(elapsedNs) || elapsedNs < 0) {
          this.droppedSamples += 1;
          continue;
        }
        latest = elapsedNs / 1e6;
        this.lastGpuMs = latest;
        this.lastSampleAt = this.now();
        this.completedSamples += 1;
      }
      return latest;
    }
    handleContextRestored() {
      if (this.disposed) return;
      this.clearQueries();
      this.resetLastSample();
      this.refreshExtension();
    }
    handleContextLost() {
      if (this.disposed) return;
      this.clearQueries(true);
      this.extension = void 0;
      this.resetLastSample();
    }
    get stats() {
      return {
        supported: this.supported,
        active: this.activeQuery !== void 0,
        pendingQueries: this.pending.length,
        maxPendingQueries: this.maxPendingQueries,
        saturated: this.pending.length >= this.maxPendingQueries,
        saturatedFrames: this.saturatedFrames,
        completedSamples: this.completedSamples,
        disjointSamples: this.disjointSamples,
        droppedSamples: this.droppedSamples,
        lastGpuMs: this.lastGpuMs,
        lastSampleAgeMs: this.lastSampleAt === void 0 ? void 0 : Math.max(0, this.now() - this.lastSampleAt)
      };
    }
    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      this.clearQueries();
      this.extension = void 0;
    }
    refreshExtension() {
      this.extension = this.gl.getExtension("EXT_disjoint_timer_query_webgl2") ?? void 0;
    }
    clearQueries(countDropped = false) {
      const discarded = this.pending.length + (this.activeQuery ? 1 : 0);
      if (this.activeQuery) {
        this.deleteQuery(this.activeQuery);
        this.activeQuery = void 0;
      }
      for (const query of this.pending.splice(0)) this.deleteQuery(query);
      if (countDropped) this.droppedSamples += discarded;
    }
    deleteQuery(query) {
      try {
        this.gl.deleteQuery(query);
      } catch {
      }
    }
    resetLastSample() {
      this.lastGpuMs = void 0;
      this.lastSampleAt = void 0;
    }
  };

  // src/rendering/HexMapRendererHost.ts
  var HexMapRendererHost = class {
    constructor(options) {
      this.options = options;
      this.contextState = "ready";
      this.contextGeneration = 1;
      this.contextLosses = 0;
      this.contextRestores = 0;
      this.disposed = false;
      this.onContextLost = (event) => {
        event.preventDefault();
        if (this.disposed || this.contextState === "lost") return;
        this.contextState = "lost";
        this.contextLosses += 1;
        this.gpuTimer.handleContextLost();
        this.options.contextLost?.();
      };
      this.onContextRestored = () => {
        if (this.disposed) return;
        this.contextState = "restoring";
        this.gpuTimer.handleContextRestored();
        this.renderer.resetState();
        this.invalidateManagedResources();
        this.contextGeneration += 1;
        this.contextRestores += 1;
        this.contextState = "ready";
        this.options.contextRestored?.();
      };
      this.scene = new three.Scene();
      this.scene.background = new three.Color(10471906);
      this.worldRoot = new three.Group();
      this.worldRoot.name = "hex-map-world-root";
      this.scene.add(this.worldRoot);
      this.renderer = new three.WebGLRenderer({ canvas: options.canvas, antialias: options.antialias });
      this.renderer.toneMapping = three.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 0.65;
      this.camera = new three.PerspectiveCamera(60, 1, 10, 1e5);
      this.camera.position.set(900, 500, 1e3);
      this.scene.add(this.camera);
      const primary = new three.DirectionalLight(16777215);
      primary.position.set(1, 1, 1);
      this.scene.add(primary);
      const fill = new three.DirectionalLight(8840);
      fill.position.set(-1, -1, -1);
      this.scene.add(fill);
      this.scene.add(new three.AmbientLight(2236962));
      this.sky = this.createSky(options.skyVisible);
      this.scene.add(this.sky);
      this.gpuTimer = new WebGlGpuTimer(this.renderer.getContext());
      options.canvas.addEventListener("webglcontextlost", this.onContextLost);
      options.canvas.addEventListener("webglcontextrestored", this.onContextRestored);
    }
    resize(width, height, pixelRatio) {
      if (this.disposed || this.contextState !== "ready" || width <= 0 || height <= 0) return;
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setPixelRatio(pixelRatio);
      this.renderer.setSize(width, height, false);
    }
    pollGpuFrameMs() {
      return this.contextState === "ready" ? this.gpuTimer.poll() : void 0;
    }
    get gpuTimingStats() {
      return this.gpuTimer.stats;
    }
    get contextStats() {
      return {
        state: this.contextState,
        generation: this.contextGeneration,
        losses: this.contextLosses,
        restores: this.contextRestores
      };
    }
    render() {
      if (this.disposed || this.contextState !== "ready") return;
      const measured = this.gpuTimer.begin();
      try {
        this.renderer.render(this.scene, this.camera);
      } finally {
        if (measured) this.gpuTimer.end();
      }
    }
    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      this.contextState = "disposed";
      this.options.canvas.removeEventListener("webglcontextlost", this.onContextLost);
      this.options.canvas.removeEventListener("webglcontextrestored", this.onContextRestored);
      this.gpuTimer.dispose();
      this.sky.geometry.dispose();
      this.sky.material.dispose();
      this.renderer.renderLists.dispose();
      this.renderer.dispose();
    }
    createSky(visible) {
      const sky = new Sky();
      sky.visible = visible;
      sky.scale.setScalar(45e4);
      sky.frustumCulled = false;
      const uniforms = sky.material.uniforms;
      uniforms.turbidity.value = 4;
      uniforms.rayleigh.value = 1.7;
      uniforms.mieCoefficient.value = 2e-3;
      uniforms.mieDirectionalG.value = 0.76;
      const elevation = 24 * Math.PI / 180;
      const azimuth = 205 * Math.PI / 180;
      const sun = new three.Vector3().setFromSphericalCoords(1, Math.PI / 2 - elevation, azimuth);
      uniforms.sunPosition.value.copy(sun);
      return sky;
    }
    invalidateManagedResources() {
      this.scene.traverse((object) => {
        const renderable = object;
        for (const attribute of Object.values(renderable.geometry?.attributes ?? {})) attribute.needsUpdate = true;
        if (renderable.geometry?.index) renderable.geometry.index.needsUpdate = true;
        const materials = Array.isArray(renderable.material) ? renderable.material : [renderable.material];
        for (const material of materials) {
          if (!material || typeof material !== "object") continue;
          material.needsUpdate = true;
          for (const value of Object.values(material)) {
            if (value instanceof three.Texture) value.needsUpdate = true;
          }
        }
      });
    }
  };
  var HexMapInteractionController = class {
    constructor(options) {
      this.options = options;
      this.movementKeys = /* @__PURE__ */ new Set();
      this.addedCanvasTabIndex = false;
      this.disposed = false;
      this.onContextMenu = (event) => event.preventDefault();
      this.onKeyDown = (event) => {
        if (!this.isMovementKey(event.code) || this.isTextInput(event.target)) return;
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
        const picked = this.pick(event.clientX, event.clientY);
        if (!picked) {
          this.clearHover();
          return;
        }
        if (this.hovered?.x === picked.x && this.hovered.y === picked.y) return;
        const tile = this.options.tile(picked.x, picked.y);
        if (!tile) {
          this.clearHover();
          return;
        }
        this.hovered = { x: picked.x, y: picked.y };
        this.options.pointer.visible = true;
        this.options.pointer.position.setX(picked.worldX);
        this.options.pointer.position.setZ(picked.worldY);
        this.options.hover(picked.x, picked.y, tile);
      };
      this.onMouseUp = (event) => {
        if (event.button !== 0) return;
        const downAt = this.mouseDownAt;
        this.mouseDownAt = void 0;
        if (!downAt || Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y) > 4) return;
        const picked = this.pick(event.clientX, event.clientY);
        if (!picked) return;
        const tile = this.options.tile(picked.x, picked.y);
        if (!tile) return;
        this.options.select(picked.x, picked.y);
        this.options.click(picked.x, picked.y, tile);
      };
      if (!Number.isFinite(options.size) || options.size <= 0) {
        throw new RangeError("interaction hex size must be positive and finite");
      }
      if (!options.canvas.hasAttribute("tabindex")) {
        options.canvas.tabIndex = 0;
        this.addedCanvasTabIndex = true;
      }
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
      const { camera, controls } = this.options;
      const forward = controls.target.clone().sub(camera.position);
      forward.y = 0;
      if (forward.lengthSq() < 1e-4) forward.set(0, 0, -1);
      else forward.normalize();
      const right = new three.Vector3(-forward.z, 0, forward.x);
      const movement = forward.multiplyScalar(forwardAmount).addScaledVector(right, rightAmount);
      if (movement.lengthSq() > 1) movement.normalize();
      const viewDistance = camera.position.distanceTo(controls.target);
      const speed = Math.min(900, Math.max(140, viewDistance * 0.9));
      movement.multiplyScalar(speed * dtSeconds);
      camera.position.add(movement);
      controls.target.add(movement);
    }
    reset() {
      this.mouseDownAt = void 0;
      this.hovered = void 0;
      this.movementKeys.clear();
      this.options.pointer.visible = false;
    }
    get hoveredTile() {
      return this.hovered ? { ...this.hovered } : null;
    }
    get stats() {
      return {
        disposed: this.disposed,
        movementKeys: [...this.movementKeys].sort(),
        hoveredTile: this.hoveredTile
      };
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
      if (this.addedCanvasTabIndex && canvas.getAttribute("tabindex") === "0") {
        canvas.removeAttribute("tabindex");
      }
      this.reset();
    }
    pick(clientX, clientY) {
      const ground = screenToGround(clientX, clientY, this.options.canvas, this.options.camera);
      if (!ground) return null;
      this.options.logicalGround(ground);
      const map = this.options.map();
      return pickTile(
        ground,
        this.options.size,
        map?.infinite ? void 0 : map?.w,
        map?.infinite ? void 0 : map?.h,
        map?.wrapX,
        map?.wrapY
      );
    }
    clearHover() {
      this.options.pointer.visible = false;
      this.hovered = void 0;
    }
    isMovementKey(code) {
      return code === "KeyW" || code === "KeyA" || code === "KeyS" || code === "KeyD";
    }
    isTextInput(target) {
      if (!(target instanceof HTMLElement)) return false;
      return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target.isContentEditable;
    }
  };

  // src/rendering/WorldChunkMountQueue.ts
  var WorldChunkMountQueue = class {
    constructor(options) {
      this.options = options;
      this.deferred = /* @__PURE__ */ new Map();
      this.sequence = 0;
    }
    schedule(chunk) {
      const key = WorldStreamer.key(chunk.chunkX, chunk.chunkY);
      const signal = this.options.signal();
      if (signal?.aborted || this.options.mounted(key)) {
        this.deferred.delete(key);
        return;
      }
      const priority = this.options.priority(chunk);
      if (key === this.options.demandKey()) {
        this.deferred.delete(key);
        this.options.mount(chunk);
        return;
      }
      this.options.frameTasks.enqueue(key, priority, () => {
        this.deferred.delete(key);
        if (this.options.streamer()?.hasResident(chunk.chunkX, chunk.chunkY)) {
          this.options.mount(chunk);
        }
      }, {
        lane: "visible",
        weight: Math.max(1, Math.ceil(chunk.coreTiles.length / 128)),
        signal,
        cancelled: (reason) => {
          if (reason instanceof WorkQueueBackpressureError && this.options.streamer()?.hasResident(chunk.chunkX, chunk.chunkY)) {
            const existing = this.deferred.get(key);
            this.deferred.set(key, {
              chunk,
              priority,
              sequence: existing?.sequence ?? this.sequence++
            });
          }
        }
      });
    }
    retryOne() {
      const streamer = this.options.streamer();
      if (!streamer) {
        this.deferred.clear();
        return;
      }
      const demandKey = this.options.demandKey();
      let selectedKey;
      let selected;
      for (const [key, candidate] of this.deferred) {
        if (!streamer.hasResident(candidate.chunk.chunkX, candidate.chunk.chunkY) || this.options.mounted(key)) {
          this.deferred.delete(key);
          continue;
        }
        const demanded = key === demandKey;
        const selectedDemanded = selectedKey === demandKey;
        if (!selected || demanded && !selectedDemanded || demanded === selectedDemanded && (candidate.priority < selected.priority || candidate.priority === selected.priority && candidate.sequence < selected.sequence)) {
          selectedKey = key;
          selected = candidate;
        }
      }
      if (!selectedKey || !selected) return;
      this.deferred.delete(selectedKey);
      this.schedule(selected.chunk);
    }
    forget(key) {
      this.deferred.delete(key);
      this.options.frameTasks.cancel(key);
    }
    clear() {
      this.deferred.clear();
    }
    get stats() {
      return { deferredChunks: this.deferred.size };
    }
  };

  // src/world/WorldEditingFacade.ts
  function worldTileTerrainSignature(tile) {
    const modifiers = tile?.modifiers ? [...tile.modifiers].sort() : [];
    const rivers = tile?.rivers ? tile.rivers.map((river) => `${river.riverIndex}:${river.riverTileIndex}`).sort() : [];
    return JSON.stringify([
      tile?.type ?? null,
      modifiers,
      tile?.treeModel ?? null,
      rivers
    ]);
  }
  function worldTileCitySignature(tile) {
    return JSON.stringify([
      Boolean(tile?.city),
      tile?.city?.name ?? null,
      tile?.city?.model ?? null
    ]);
  }
  function worldTileVisualSignature(tile) {
    return JSON.stringify([worldTileTerrainSignature(tile), worldTileCitySignature(tile)]);
  }
  function refreshKind(beforeTerrain, beforeCity, after) {
    if (worldTileTerrainSignature(after) !== beforeTerrain) return "terrain";
    return worldTileCitySignature(after) !== beforeCity ? "city" : "none";
  }
  var WorldEditingFacade = class {
    constructor(source, map, options = {}) {
      this.source = source;
      this.map = map;
      this.disposed = false;
      this.editBatches = 0;
      this.changedTiles = 0;
      this.visualDirtyTiles = 0;
      if (source.map !== void 0 && source.map !== map) {
        throw new TypeError("world editing facade map must belong to its source");
      }
      this.visualSignature = options.visualSignature ?? worldTileVisualSignature;
    }
    setTileOverride(x, y, changes) {
      const source = this.mutableSource();
      this.assertCoordinates(x, y);
      assertWorldTileOverride(changes);
      const point = this.normalizeRequired(x, y);
      const before = this.captureVisualState(point);
      source.setTileOverride(point.x, point.y, changes);
      return this.completeEdit(source, true, 1, [before]);
    }
    setTileOverrides(changes) {
      const source = this.mutableSource();
      if (!Array.isArray(changes)) throw new TypeError("tile overrides must be an array");
      const normalized = [];
      const before = /* @__PURE__ */ new Map();
      for (const change of changes) {
        if (!change || typeof change !== "object") {
          throw new RangeError("tile override coordinates must be safe integers");
        }
        this.assertCoordinates(change.x, change.y);
        assertWorldTileOverride(change.changes);
        const point = this.normalizeRequired(change.x, change.y);
        const key = `${point.x},${point.y}`;
        if (!before.has(key)) before.set(key, this.captureVisualState(point));
        normalized.push({ x: point.x, y: point.y, changes: change.changes });
      }
      if (source.setTileOverrides) source.setTileOverrides(normalized);
      else for (const change of normalized) source.setTileOverride(change.x, change.y, change.changes);
      return this.completeEdit(source, normalized.length > 0, before.size, before.values());
    }
    clearTileOverride(x, y) {
      const source = this.mutableSource();
      if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) {
        return { source, changed: false, dirtyTiles: [], refreshKind: "none" };
      }
      const point = normalizeMapCoordinates(this.map, x, y);
      if (!point) return { source, changed: false, dirtyTiles: [], refreshKind: "none" };
      const before = this.captureVisualState(point);
      if (!source.clearTileOverride(point.x, point.y)) {
        return { source, changed: false, dirtyTiles: [], refreshKind: "none" };
      }
      return this.completeEdit(source, true, 1, [before]);
    }
    flush() {
      const source = this.mutableSource();
      return source.flushDeltas?.() ?? Promise.resolve();
    }
    dispose() {
      this.disposed = true;
    }
    get stats() {
      return {
        disposed: this.disposed,
        editBatches: this.editBatches,
        changedTiles: this.changedTiles,
        visualDirtyTiles: this.visualDirtyTiles
      };
    }
    mutableSource() {
      if (this.disposed) throw new Error("WorldEditingFacade has been disposed");
      if (!isMutableWorldSource(this.source)) {
        throw new Error("The current world source does not support tile overrides");
      }
      return this.source;
    }
    assertCoordinates(x, y) {
      if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) {
        throw new RangeError("tile override coordinates must be safe integers");
      }
    }
    normalizeRequired(x, y) {
      const point = normalizeMapCoordinates(this.map, x, y);
      if (!point) throw new RangeError("tile override coordinates are outside the world bounds");
      return point;
    }
    captureVisualState(point) {
      const tile = getMapTile(this.map, point.x, point.y);
      return {
        point,
        visual: this.visualSignature(tile),
        terrain: worldTileTerrainSignature(tile),
        city: worldTileCitySignature(tile)
      };
    }
    completeEdit(source, changed, changedTiles, before) {
      const dirtyTiles = [];
      let refresh = "none";
      for (const state of before) {
        const after = getMapTile(this.map, state.point.x, state.point.y);
        if (this.visualSignature(after) === state.visual) continue;
        dirtyTiles.push(state.point);
        const detected = refreshKind(state.terrain, state.city, after);
        if (detected === "terrain") refresh = "terrain";
        else if (detected === "city" && refresh === "none") refresh = "city";
      }
      if (dirtyTiles.length > 0 && refresh === "none") refresh = "terrain";
      this.record(changedTiles, dirtyTiles.length);
      return { source, changed, dirtyTiles, refreshKind: refresh };
    }
    record(changedTiles, dirtyTiles) {
      this.editBatches += 1;
      this.changedTiles += changedTiles;
      this.visualDirtyTiles += dirtyTiles;
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

  // src/HexMapOptions.ts
  var DEFAULT_HEX_MAP_OPTIONS = {
    size: 40,
    maxPixelRatio: 2,
    antialias: true,
    terrainShaderQuality: "full",
    skyVisible: true,
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
    landBlendEnabled: true,
    waterCornerRounding: 0.4,
    coastCurvature: 0.5,
    landBlendCurvature: 0.5,
    landformDebugMode: "off",
    terrainTextureRegionSize: 2,
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
    cpuChunkCacheSize: 192,
    gpuChunkCacheBytes: 256 * 1024 * 1024,
    cpuChunkCacheBytes: 384 * 1024 * 1024,
    worldSessionDrainTimeoutMs: 15e3
  };
  function resolveHexMapOptions(options) {
    if (!options || typeof options !== "object") throw new TypeError("HexMap options are required");
    const size = options.size ?? DEFAULT_HEX_MAP_OPTIONS.size;
    const grassBladeHeight = options.grassBladeHeight ?? size * 0.18;
    const waterDepth = options.waterDepth ?? size * 0.25;
    const resolved = {
      ...DEFAULT_HEX_MAP_OPTIONS,
      ...options,
      waterDepth,
      fogTextureSize: options.fogTextureSize ?? size * 8,
      riverColorShallow: options.riverColorShallow ?? options.waterColorShallow ?? DEFAULT_HEX_MAP_OPTIONS.waterColorShallow,
      riverColorDeep: options.riverColorDeep ?? options.waterColorDeep ?? DEFAULT_HEX_MAP_OPTIONS.waterColorDeep,
      riverDepth: options.riverDepth ?? waterDepth * 0.6,
      mountainHeight: options.mountainHeight ?? size * 0.6,
      grassBladeWidth: options.grassBladeWidth ?? size * 0.03,
      grassBladeHeight,
      grassWindStrength: options.grassWindStrength ?? grassBladeHeight * 0.35
    };
    validateHexMapOptions(resolved);
    return resolved;
  }
  function validateHexMapOptions(options) {
    if (typeof options.element !== "string" || options.element.trim().length === 0) {
      throw new TypeError("HexMap element must be a non-empty CSS selector");
    }
    if (!["off", "elevation", "ridge", "valley", "roughness"].includes(options.landformDebugMode)) {
      throw new RangeError("landformDebugMode is invalid");
    }
    const positive2 = (name, value) => {
      if (!Number.isFinite(value) || value <= 0) {
        throw new RangeError(`${name} must be a positive finite number`);
      }
    };
    const nonNegativeSafeInteger = (name, value) => {
      if (!Number.isSafeInteger(value) || value < 0) {
        throw new RangeError(`${name} must be a non-negative safe integer`);
      }
    };
    positive2("size", options.size);
    positive2("terrainTextureRegionSize", options.terrainTextureRegionSize);
    positive2("renderDistance", options.renderDistance);
    positive2("maxPixelRatio", options.maxPixelRatio);
    if (options.terrainShaderQuality !== "full" && options.terrainShaderQuality !== "fast") {
      throw new RangeError('terrainShaderQuality must be "full" or "fast"');
    }
    if (options.lodNearDistance < 0 || options.lodFarDistance < options.lodNearDistance) {
      throw new RangeError("LOD distances must be non-negative and lodFarDistance must be >= lodNearDistance");
    }
    if (options.vegetationRenderDistance < 0 || options.chunkLodHysteresis < 0) {
      throw new RangeError("vegetationRenderDistance and chunkLodHysteresis must be non-negative");
    }
    nonNegativeSafeInteger("gpuChunkCacheSize", options.gpuChunkCacheSize);
    nonNegativeSafeInteger("cpuChunkCacheSize", options.cpuChunkCacheSize);
    nonNegativeSafeInteger("gpuChunkCacheBytes", options.gpuChunkCacheBytes);
    nonNegativeSafeInteger("cpuChunkCacheBytes", options.cpuChunkCacheBytes);
    positive2("worldSessionDrainTimeoutMs", options.worldSessionDrainTimeoutMs);
    nonNegativeSafeInteger("treesPerTile", options.treesPerTile);
    nonNegativeSafeInteger("grassDensity", options.grassDensity);
    positive2("grassBladeWidth", options.grassBladeWidth);
    positive2("grassBladeHeight", options.grassBladeHeight);
    if (!Number.isFinite(options.treeScale) || options.treeScale < 0) {
      throw new RangeError("treeScale must be a non-negative finite number");
    }
    for (const [name, value] of [
      ["waterCornerRounding", options.waterCornerRounding],
      ["coastCurvature", options.coastCurvature],
      ["landBlendCurvature", options.landBlendCurvature],
      ["coastalWaveWidth", options.coastalWaveWidth],
      ["coastalWaveRange", options.coastalWaveRange],
      ["coastalWaveDistortion", options.coastalWaveDistortion],
      ["coastalWaveOpacity", options.coastalWaveOpacity],
      ["riverCurvature", options.riverCurvature],
      ["lakeShoreWidth", options.lakeShoreWidth]
    ]) {
      if (!Number.isFinite(value) || value < 0 || value > 1) {
        throw new RangeError(`${name} must be a finite number between 0 and 1`);
      }
    }
  }

  // src/world/WorldSurfaceView.ts
  var clamp2 = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
  var CORNER_DIRECTIONS = [
    ["NE", "SE"],
    ["SE", "S"],
    ["S", "SW"],
    ["SW", "NW"],
    ["NW", "N"],
    ["N", "NE"]
  ];
  var CORNER_VECTORS = [
    { x: 1, y: 0 },
    { x: 0.5, y: Math.sqrt(3) / 2 },
    { x: -0.5, y: Math.sqrt(3) / 2 },
    { x: -1, y: 0 },
    { x: -0.5, y: -Math.sqrt(3) / 2 },
    { x: 0.5, y: -Math.sqrt(3) / 2 }
  ];
  function assertTileCoordinates2(x, y) {
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) {
      throw new RangeError("world surface tile coordinates must be safe integers");
    }
  }
  function assertMapMatchesResolver(map, resolver) {
    if (!resolver) return;
    const domain = resolver.domain;
    if (domain.topology === "infinite") {
      if (!map.infinite || map.wrapX || map.wrapY) {
        throw new TypeError("infinite surface resolver does not match the map topology");
      }
      return;
    }
    if (map.infinite || map.w !== domain.width || map.h !== domain.height) {
      throw new TypeError("surface resolver dimensions do not match the map");
    }
    const toroidal = domain.topology === "toroidal";
    if (Boolean(map.wrapX) !== toroidal || Boolean(map.wrapY) !== toroidal) {
      throw new TypeError("surface resolver wrapping does not match the map topology");
    }
  }
  function isShoreline(tile) {
    return !tile || tile.type === "sea" /* sea */ || tile.type === "coastal" /* coastal */ || Boolean(tile.modifiers?.includes("lake"));
  }
  function nearestTile(worldX, worldZ, size) {
    const approximateX = worldX / (size * 1.5);
    const approximateY = worldZ / (size * Math.sqrt(3));
    const x0 = Math.floor(approximateX);
    const y0 = Math.floor(approximateY);
    let best = { x: x0, y: y0 };
    let bestDistance = Infinity;
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        const candidate = { x: x0 + dx, y: y0 + dy };
        const center = getHexCenter(candidate.x, candidate.y, size);
        const distance = (center.x - worldX) ** 2 + (center.y - worldZ) ** 2;
        if (distance < bestDistance) {
          best = candidate;
          bestDistance = distance;
        }
      }
    }
    return best;
  }
  var MutableWorldSurfaceView = class {
    constructor(options) {
      this.displayRevision = 0;
      if (!options || typeof options !== "object" || !options.map) {
        throw new TypeError("world surface view options with a map are required");
      }
      if (!Number.isFinite(options.tileSize) || options.tileSize <= 0) {
        throw new RangeError("world surface tileSize must be a positive finite number");
      }
      if (!Number.isFinite(options.mountainHeight) || options.mountainHeight < 0) {
        throw new RangeError("world surface mountainHeight must be a non-negative finite number");
      }
      assertWrappableMap(options.map);
      assertMapMatchesResolver(options.map, options.resolver);
      this.map = options.map;
      this.resolver = options.resolver;
      this.tileSize = options.tileSize;
      this.displayMountainHeight = options.mountainHeight;
    }
    get revision() {
      return this.displayRevision;
    }
    get mountainHeight() {
      return this.displayMountainHeight;
    }
    get minimumHeight() {
      return 0;
    }
    get maximumHeight() {
      return this.displayMountainHeight * (this.resolver?.profile.relief.mountainMaximum ?? 1);
    }
    setMountainHeight(value) {
      if (!Number.isFinite(value) || value < 0) {
        throw new RangeError("world surface mountainHeight must be a non-negative finite number");
      }
      if (value === this.displayMountainHeight) return false;
      this.displayMountainHeight = value;
      this.displayRevision += 1;
      return true;
    }
    invalidate() {
      this.displayRevision += 1;
      return this.displayRevision;
    }
    getEffectiveRelief(x, y) {
      return this.createWindow().getEffectiveRelief(x, y);
    }
    getEffectiveVegetationDensity(x, y) {
      return this.createWindow().getEffectiveVegetationDensity(x, y);
    }
    getTileCenterHeight(x, y) {
      return this.createWindow().getTileCenterHeight(x, y);
    }
    getWorldHeight(worldX, worldZ) {
      if (!Number.isFinite(worldX) || !Number.isFinite(worldZ)) {
        throw new RangeError("world surface coordinates must be finite numbers");
      }
      return this.createWindow().getWorldHeight(worldX, worldZ);
    }
    createWindow() {
      return new WorldSurfaceWindow(this);
    }
  };
  var WorldSurfaceWindow = class {
    constructor(surface) {
      this.surface = surface;
      this.contributions = /* @__PURE__ */ new Map();
      this.corners = /* @__PURE__ */ new Map();
      this.samples = /* @__PURE__ */ new Map();
      this.generatedTiles = /* @__PURE__ */ new Map();
      this.vegetation = /* @__PURE__ */ new Map();
      this.resolverWindow = surface.resolver?.createWindow();
    }
    key(x, y) {
      const point = normalizeMapCoordinates(this.surface.map, x, y);
      return point ? `${point.x},${point.y}` : `outside:${x},${y}`;
    }
    sampleGenerated(x, y) {
      assertTileCoordinates2(x, y);
      const resolver = this.surface.resolver;
      if (!resolver) return void 0;
      const point = normalizeMapCoordinates(this.surface.map, x, y);
      if (!point) return void 0;
      const key = `${point.x},${point.y}`;
      let sample = this.samples.get(key);
      if (!sample) {
        sample = this.resolverWindow.sampleGenerated(point.x, point.y);
        this.samples.set(key, sample);
      }
      return sample;
    }
    resolveGeneratedTile(x, y) {
      const resolver = this.surface.resolver;
      if (!resolver) return void 0;
      const point = normalizeMapCoordinates(this.surface.map, x, y);
      if (!point) return void 0;
      const key = `${point.x},${point.y}`;
      let tile = this.generatedTiles.get(key);
      if (!tile) {
        tile = this.resolverWindow.resolveGeneratedTile(point.x, point.y);
        this.generatedTiles.set(key, tile);
      }
      return tile;
    }
    contribution(x, y) {
      assertTileCoordinates2(x, y);
      const key = this.key(x, y);
      let contribution = this.contributions.get(key);
      if (contribution) return contribution;
      const tile = getMapTile(this.surface.map, x, y);
      const sample = this.sampleGenerated(x, y);
      const profile = this.surface.resolver?.profile ?? WORLD_STYLE_PROFILE;
      if (isShoreline(tile)) {
        contribution = { shoreline: true, relief: 0 };
      } else if (tile?.type === "mountain" /* mountain */) {
        contribution = {
          shoreline: false,
          relief: sample ? clamp2(sample.relief, profile.relief.mountainMinimum, profile.relief.mountainMaximum) : profile.relief.staticMountain
        };
      } else if (tile?.modifiers?.includes("hill")) {
        contribution = {
          shoreline: false,
          relief: sample ? clamp2(sample.relief, profile.relief.hillMinimum, profile.relief.hillMaximum) : profile.relief.staticHill
        };
      } else {
        contribution = {
          shoreline: false,
          relief: sample ? clamp2(sample.relief, profile.relief.plainMinimum, profile.relief.plainMaximum) : 0
        };
      }
      this.contributions.set(key, contribution);
      return contribution;
    }
    getEffectiveRelief(x, y) {
      return this.contribution(x, y).relief;
    }
    getEffectiveVegetationDensity(x, y) {
      assertTileCoordinates2(x, y);
      const key = this.key(x, y);
      const cached = this.vegetation.get(key);
      if (cached !== void 0) return cached;
      const tile = getMapTile(this.surface.map, x, y);
      let density = 0;
      if (!isShoreline(tile) && tile?.type !== "mountain" /* mountain */ && tile?.type !== "snow" /* snow */ && tile?.modifiers?.includes("wood")) {
        const sample = this.sampleGenerated(x, y);
        const profile = this.surface.resolver?.profile ?? WORLD_STYLE_PROFILE;
        const generatedWood = this.resolveGeneratedTile(x, y)?.modifiers?.includes("wood") === true;
        density = generatedWood ? sample?.vegetationDensity ?? profile.vegetation.neutralDensity : Math.max(sample?.vegetationDensity ?? 0, profile.vegetation.neutralDensity);
      }
      density = clamp2(density, 0, 1);
      this.vegetation.set(key, density);
      return density;
    }
    isShoreline(x, y) {
      return this.contribution(x, y).shoreline;
    }
    getCornerReliefs(x, y) {
      const key = this.key(x, y);
      let values = this.corners.get(key);
      if (values) return values;
      const center = this.contribution(x, y);
      values = Object.freeze(CORNER_DIRECTIONS.map(([firstDirection, secondDirection]) => {
        const first = getNeighborCoords(x, y, firstDirection);
        const second = getNeighborCoords(x, y, secondDirection);
        const firstContribution = this.contribution(first.x, first.y);
        const secondContribution = this.contribution(second.x, second.y);
        if (center.shoreline || firstContribution.shoreline || secondContribution.shoreline) return 0;
        return (center.relief + firstContribution.relief + secondContribution.relief) / 3;
      }));
      this.corners.set(key, values);
      return values;
    }
    getTileCenterHeight(x, y) {
      const corners = this.getCornerReliefs(x, y);
      return corners.reduce((sum, height) => sum + height, 0) / corners.length * this.surface.mountainHeight;
    }
    getWorldHeight(worldX, worldZ) {
      const tile = nearestTile(worldX, worldZ, this.surface.tileSize);
      if (!getMapTile(this.surface.map, tile.x, tile.y)) return this.surface.minimumHeight;
      const center = getHexCenter(tile.x, tile.y, this.surface.tileSize);
      const localX = (worldX - center.x) / this.surface.tileSize;
      const localZ = (worldZ - center.y) / this.surface.tileSize;
      let angle = Math.atan2(localZ, localX);
      if (angle < 0) angle += Math.PI * 2;
      const cornerIndex = Math.min(5, Math.floor(angle / (Math.PI / 3)));
      const nextCornerIndex = (cornerIndex + 1) % 6;
      const first = CORNER_VECTORS[cornerIndex];
      const second = CORNER_VECTORS[nextCornerIndex];
      const determinant = first.x * second.y - first.y * second.x;
      const firstWeight = (localX * second.y - localZ * second.x) / determinant;
      const secondWeight = (first.x * localZ - first.y * localX) / determinant;
      const corners = this.getCornerReliefs(tile.x, tile.y);
      const centerRelief = corners.reduce((sum, height) => sum + height, 0) / corners.length;
      const relief = centerRelief * (1 - firstWeight - secondWeight) + corners[cornerIndex] * firstWeight + corners[nextCornerIndex] * secondWeight;
      return Math.max(0, relief) * this.surface.mountainHeight;
    }
    clear() {
      this.contributions.clear();
      this.corners.clear();
      this.samples.clear();
      this.generatedTiles.clear();
      this.vegetation.clear();
      this.resolverWindow?.clear();
    }
  };
  function createWorldSurfaceView(options) {
    return new MutableWorldSurfaceView(options);
  }

  // src/HexMap.ts
  function renderLayerError(reason) {
    return reason instanceof Error ? reason : new Error(String(reason));
  }
  var WORLD_COPY_REFRESH_TASK = "@world-copy-refresh";
  var INERT_WORLD_SIGNAL = new AbortController().signal;
  var HexMap = class extends EventEmitter {
    constructor(options) {
      super();
      this.worldCopies = [];
      this.worldCopyGroups = /* @__PURE__ */ new Map();
      this.worldCopyObjects = /* @__PURE__ */ new Map();
      this.worldCopyMaterials = [];
      this.worldCopyMaterialCache = /* @__PURE__ */ new Map();
      this.worldPatternOffset = new three.Vector2();
      this.runtimeWork = new RuntimeWorkCoordinator({
        defaultMaxPendingTasks: 512,
        defaultMaxPendingWeight: 2048,
        starvationMs: 1500
      });
      this.frameTasks = new FrameTaskScheduler({
        error: (error) => this.emit("error", error),
        maxPendingTasks: 512,
        maxPendingWeight: 2048,
        starvationMs: 1500,
        coordinator: this.runtimeWork,
        domain: "frame"
      });
      this.disposed = false;
      this.loadRevision = 0;
      this.forestRevision = 0;
      this.drainingWorldSessions = /* @__PURE__ */ new Set();
      this.worldChunkLayers = /* @__PURE__ */ new Map();
      this.streamedGrassByChunkId = /* @__PURE__ */ new Map();
      this.streamedForestByChunkId = /* @__PURE__ */ new Map();
      this.worldLayerRevision = 0;
      this.worldRenderLayers = new WorldRenderLayerRegistry();
      this.builtinWorldRenderLayerIds = /* @__PURE__ */ new Set(["@terrain", "@grass", "@forest"]);
      this.initializedWorldRenderLayers = /* @__PURE__ */ new Set();
      this.worldRenderLayerInitRevisions = /* @__PURE__ */ new Map();
      this.worldRenderLayerObjects = /* @__PURE__ */ new Map();
      this.surfaceHiddenObjects = /* @__PURE__ */ new Map();
      this.worldTileUpdateQueue = Promise.resolve();
      this.worldChunkSize = 24;
      this.renderOrigin = new three.Vector2();
      this.logicalTargetScratch = new three.Vector3();
      this.predictedTargetScratch = new three.Vector3();
      this.streamingVelocity = new three.Vector2();
      this.streamingMotionScratch = new three.Vector2();
      this.streamingAheadScratch = new three.Vector2();
      this.streamingPredictionSeconds = 1.25;
      this.streamingPredictionMaxChunks = 1;
      this.floatingOriginThreshold = 8192;
      this.adaptiveResolutionScale = 1;
      this.appliedVegetationDensityScale = 1;
      this.adaptiveVegetationRevision = 0;
      this.lastSelected = null;
      this.warFogShown = true;
      this.handleResize = () => {
        const width = this.canvas.clientWidth || window.innerWidth;
        const height = this.canvas.clientHeight || window.innerHeight;
        if (width <= 0 || height <= 0) return;
        this.rendererHost.resize(
          width,
          height,
          Math.min(window.devicePixelRatio, this.options.maxPixelRatio) * this.adaptiveResolutionScale
        );
      };
      this.animate = (t) => {
        if (this.disposed) return;
        if (this.rendererHost.contextStats.state !== "ready") {
          this.lastFrameTime = void 0;
          this.animationFrameId = window.requestAnimationFrame(this.animate);
          return;
        }
        const gpuFrameMs = this.rendererHost.pollGpuFrameMs();
        const gpuTiming = this.rendererHost.gpuTimingStats;
        const dtS = this.lastFrameTime === void 0 ? 0 : (t - this.lastFrameTime) / 1e3;
        this.lastFrameTime = t;
        if (dtS > 0 && !document.hidden) {
          const frameTaskStats = this.frameTasks.stats;
          const streamingStats = this.worldStreamer?.stats;
          const resourceStats = this.chunkScheduler.stats;
          const profile = this.adaptiveStreamingController?.sample({
            frameMs: dtS * 1e3,
            gpuFrameMs,
            gpuTimingSupported: gpuTiming.supported,
            gpuTimingSaturated: gpuTiming.saturated,
            gpuSampleAgeMs: gpuTiming.lastSampleAgeMs,
            frameTaskMs: frameTaskStats.lastFrameDurationMs,
            frameTaskBacklog: frameTaskStats.pendingTasks,
            oldestFrameTaskMs: frameTaskStats.oldestTaskAgeMs,
            workerQueueDepth: streamingStats?.queuedChunks,
            workerBusyRatio: streamingStats && streamingStats.configuredWorkers > 0 ? streamingStats.busyWorkers / streamingStats.configuredWorkers : 0,
            chunkLoadLatencyMs: streamingStats?.averageChunkLoadMs,
            cpuBudgetExceededBytes: resourceStats.cpuBudgetExceededBytes,
            gpuBudgetExceededBytes: resourceStats.gpuBudgetExceededBytes
          });
          if (profile) this.applyAdaptiveStreamingProfile(profile);
        }
        this.interactions.update(Math.min(dtS, 0.05));
        this.controls.update(dtS);
        this.wrapCameraToWorld();
        this.rebaseWorld();
        this.updateWorldDemand(Math.min(dtS, 0.1));
        this.frameTasks.runFrame();
        this.worldChunkMountQueue.retryOne();
        this.updateWorldChunkVisibility();
        this.terrain?.update(dtS);
        const grassResources = /* @__PURE__ */ new Set();
        if (this.grass) grassResources.add(this.grass.resources);
        for (const record of this.worldChunkLayers.values()) {
          if (record.grass) grassResources.add(record.grass.resources);
        }
        for (const resources of grassResources) resources.update(dtS);
        this.emit("frame", { t, dtS });
        this.rendererHost.render();
        this.animationFrameId = window.requestAnimationFrame(this.animate);
      };
      this.options = resolveHexMapOptions(options);
      this.worldChunkMountQueue = new WorldChunkMountQueue({
        frameTasks: this.frameTasks,
        streamer: () => this.worldStreamer,
        demandKey: () => this.worldDemandChunkKey,
        signal: () => this.worldController?.lifecycle.signal,
        mounted: (key) => this.worldChunkLayers.has(key),
        priority: (chunk) => {
          const center = this.worldStreamer?.stats;
          return center && this.worldSource ? this.worldSource.chunkDistance(chunk.chunkX, chunk.chunkY, center.centerChunkX, center.centerChunkY) : 0;
        },
        mount: (chunk) => this.mountWorldChunk(chunk)
      });
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
        cpuCacheSize: this.options.cpuChunkCacheSize,
        gpuCacheBytes: this.options.gpuChunkCacheBytes,
        cpuCacheBytes: this.options.cpuChunkCacheBytes
      });
      this.installBuiltinWorldRenderLayers();
      const el = document.querySelector(this.options.element);
      if (!(el instanceof HTMLCanvasElement)) {
        throw new Error(`HexMap: element "${this.options.element}" is not a <canvas>`);
      }
      this.canvas = el;
      this.rendererHost = new HexMapRendererHost({
        canvas: this.canvas,
        antialias: this.options.antialias,
        skyVisible: this.options.skyVisible,
        contextLost: () => {
          this.lastFrameTime = void 0;
          this.emit("contextlost", this.rendererHost.contextStats);
        },
        contextRestored: () => {
          this.lastFrameTime = void 0;
          this.chunkScheduler.invalidateScene();
          this.handleResize();
          this.emit("contextrestored", this.rendererHost.contextStats);
        }
      });
      this.renderer = this.rendererHost.renderer;
      this.scene = this.rendererHost.scene;
      this.worldRoot = this.rendererHost.worldRoot;
      this.camera = this.rendererHost.camera;
      this.setupControls();
      this.setupMarkers();
      this.interactions = new HexMapInteractionController({
        canvas: this.canvas,
        camera: this.camera,
        controls: this.controls,
        pointer: this.pointer,
        size: this.options.size,
        map: () => this.mapData,
        logicalGround: (point) => {
          this.logicalGround(point);
        },
        tile: (x, y) => this.getTile(x, y),
        select: (x, y) => this.selectTile(x, y),
        hover: (x, y, tile) => this.emit("hover", { x, y, tile }),
        click: (x, y, tile) => this.emit("click", { x, y, tile })
      });
      this.setupEvents();
      this.handleResize();
      this.animationFrameId = window.requestAnimationFrame(this.animate);
    }
    installBuiltinWorldRenderLayers() {
      this.worldRenderLayers.register({
        id: "@terrain",
        kinds: ["land", "water"],
        mountChunk: (context) => this.mountTerrainWorldRenderLayer(context),
        unmountChunk: (context) => this.unmountTerrainWorldRenderLayer(context),
        refreshTiles: (context) => this.refreshTerrainWorldRenderLayer(context),
        activateLod: (metadata, lod, objects) => this.activateTerrainWorldChunk(metadata, lod, objects),
        releaseChunk: (metadata) => this.terrain?.releaseChunk(metadata),
        dispose: () => void 0
      });
      this.worldRenderLayers.register({
        id: "@grass",
        kinds: ["grass"],
        enabled: () => this.options.grassEnabled,
        mountChunk: (context) => this.mountGrassWorldRenderLayer(context),
        unmountChunk: (context) => this.unmountGrassWorldRenderLayer(context),
        refreshTiles: (context) => this.refreshGrassWorldRenderLayer(context),
        activateLod: (metadata, lod, objects) => this.activateGrassWorldChunk(metadata, lod, objects),
        releaseChunk: (metadata) => (this.streamedGrassByChunkId.get(metadata.id) ?? this.grass)?.releaseChunk(metadata),
        dispose: () => void 0
      });
      this.worldRenderLayers.register({
        id: "@forest",
        kinds: ["forest"],
        mountChunk: (context) => this.mountForestWorldRenderLayer(context),
        unmountChunk: (context) => this.unmountForestWorldRenderLayer(context),
        refreshTiles: (context) => this.refreshForestWorldRenderLayer(context),
        activateLod: (metadata, lod, objects) => this.activateForestWorldChunk(metadata, lod, objects),
        releaseChunk: (metadata) => (this.streamedForestByChunkId.get(metadata.id) ?? this.forest)?.releaseChunk(metadata),
        dispose: () => void 0
      });
    }
    //-------------------------------------------------------------------------
    //Scene / renderer / camera / controls
    //-------------------------------------------------------------------------
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
      this.controls.target.set(
        centerX,
        this.worldSurface?.getWorldHeight(centerX, centerZ) ?? 0,
        centerZ
      );
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
      marker.position.setY(
        (this.worldSurface?.getWorldHeight(center.x, center.y) ?? 0) + this.options.size / 10 + 1.1
      );
      marker.position.setZ(center.y);
    }
    updateMarkerPositions() {
      const hovered = this.interactions.hoveredTile;
      if (hovered && this.pointer.visible) this.positionMarker(this.pointer, hovered);
      if (this.lastSelected && this.selector.visible) this.positionMarker(this.selector, this.lastSelected);
    }
    refreshCameraSurfaceTarget() {
      const surface = this.worldSurface;
      if (!surface) return;
      const logicalTarget = this.getCameraTarget(this.logicalTargetScratch);
      const nextY = surface.getWorldHeight(logicalTarget.x, logicalTarget.z);
      const deltaY = nextY - this.controls.target.y;
      this.controls.target.y = nextY;
      this.camera.position.y += deltaY;
      this.controls.update();
    }
    refreshRouteSurface() {
      if (!this.routePath) return;
      const path = this.routePath.map((point) => ({ ...point }));
      this.drawRoutePath(path);
    }
    hideSurfaceObject(object) {
      const state = this.surfaceHiddenObjects.get(object);
      if (state) {
        state.count += 1;
        return;
      }
      this.surfaceHiddenObjects.set(object, { count: 1, visible: object.visible });
      object.visible = false;
    }
    releaseSurfaceObject(object) {
      const state = this.surfaceHiddenObjects.get(object);
      if (!state) return;
      state.count -= 1;
      if (state.count > 0) return;
      object.visible = state.visible;
      this.surfaceHiddenObjects.delete(object);
    }
    async refreshCustomSurfaceLayers() {
      const layers = this.worldRenderLayers.values().filter(
        (layer) => !this.builtinWorldRenderLayerIds.has(layer.id) && this.initializedWorldRenderLayers.has(layer.id) && layer.surfaceChanged
      );
      await Promise.all(layers.map(async (layer) => {
        const objects = /* @__PURE__ */ new Set();
        for (const group of this.worldRenderLayerObjects.get(layer.id)?.values() ?? []) {
          for (const object of group) objects.add(object);
        }
        for (const object of objects) this.hideSurfaceObject(object);
        try {
          await layer.surfaceChanged?.(this.createWorldRenderLayerHost(layer.id, "@world"));
        } finally {
          for (const object of objects) this.releaseSurfaceObject(object);
        }
      }));
    }
    async refreshSurfaceConsumers(surfaceRevision, rebuildVegetation, points) {
      const surface = this.worldSurface;
      const loadRevision = this.loadRevision;
      if (!surface || surface.revision !== surfaceRevision || this.disposed) return;
      this.terrain?.refreshCitySurfaceHeights(points);
      this.refreshCameraSurfaceTarget();
      this.updateMarkerPositions();
      this.refreshRouteSurface();
      const builds = [this.refreshCustomSurfaceLayers()];
      if (rebuildVegetation) {
        builds.push(this.rebuildSurfaceVegetation(loadRevision));
      }
      await Promise.all(builds);
      if (this.disposed || this.loadRevision !== loadRevision || this.worldSurface !== surface || surface.revision !== surfaceRevision) return;
      this.updateWorldChunkVisibility();
      this.refreshWorldCopies();
      this.emit("surfacechange", { revision: surfaceRevision, surface });
    }
    clearWorldCopies() {
      this.frameTasks.cancel(WORLD_COPY_REFRESH_TASK);
      this.chunkScheduler.invalidateScene();
      for (const copy of this.worldCopies) this.worldRoot.remove(copy);
      for (const material of this.worldCopyMaterials) material.dispose();
      this.worldCopies = [];
      this.worldCopyGroups.clear();
      this.worldCopyObjects.clear();
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
        copy = instancedCopy;
      } else {
        copy = source.clone(true);
      }
      const sourceObjects = [];
      const copyObjects = [];
      source.traverse((object) => sourceObjects.push(object));
      copy.traverse((object) => copyObjects.push(object));
      copyObjects.forEach((object, index) => {
        const original = sourceObjects[index];
        if (!original) return;
        object.onBeforeRender = original.onBeforeRender;
        object.onAfterRender = original.onAfterRender;
        if (original.isInstancedMesh && object.isInstancedMesh) {
          const sourceInstance = original;
          const copyInstance = object;
          copyInstance.instanceMatrix = sourceInstance.instanceMatrix;
          copyInstance.instanceColor = sourceInstance.instanceColor;
          copyInstance.count = sourceInstance.count;
        }
      });
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
    //Multiple source chunks and their async city/forest models can finish in
    //the same browser turn. Coalesce those notifications into one scheduled
    //synchronization so toroidal copy work participates in frame backpressure.
    refreshWorldCopies() {
      if (this.disposed) return;
      this.frameTasks.enqueue(WORLD_COPY_REFRESH_TASK, -1, () => this.synchronizeWorldCopies());
    }
    //Diffs physical toroidal images by source UUID and offset. Existing clones,
    //shared geometry and copy-specific shader materials survive unrelated chunk
    //mounts; only newly visible/removed source objects are added or released.
    synchronizeWorldCopies() {
      if (!this.mapData || !this.mapData.wrapX && !this.mapData.wrapY) {
        this.clearWorldCopies();
        return;
      }
      const xOffsets = this.copyOffsets(this.mapData.wrapX, this.worldPeriodX);
      const yOffsets = this.copyOffsets(this.mapData.wrapY, this.worldPeriodY);
      const sources = [
        ...this.terrain?.children ?? [],
        ...this.forest?.children ?? [],
        ...this.grass?.visible ? this.grass.children : []
      ];
      for (const record of this.worldChunkLayers.values()) {
        sources.push(...record.forest?.children ?? []);
        if (record.grass?.visible) sources.push(...record.grass.children);
      }
      for (const byChunk of this.worldRenderLayerObjects.values()) {
        for (const objects of byChunk.values()) {
          for (const object of objects) if (object.visible) sources.push(object);
        }
      }
      const desired = /* @__PURE__ */ new Set();
      let sceneChanged = false;
      for (const copyX of xOffsets) {
        for (const copyY of yOffsets) {
          if (copyX === 0 && copyY === 0) continue;
          const offsetX = copyX * this.worldPeriodX;
          const offsetY = copyY * this.worldPeriodY;
          const groupKey = `${offsetX},${offsetY}`;
          for (const source of sources) {
            if (!this.worldCopyCanBecomeVisible(source, offsetX, offsetY)) continue;
            const objectKey = `${source.uuid}@${groupKey}`;
            desired.add(objectKey);
            if (this.worldCopyObjects.has(objectKey)) continue;
            let group = this.worldCopyGroups.get(groupKey);
            if (!group) {
              group = new three.Group();
              group.position.set(offsetX, 0, offsetY);
              this.worldCopyGroups.set(groupKey, group);
              this.worldRoot.add(group);
            }
            const copy = this.cloneWorldObject(source, offsetX, offsetY);
            group.add(copy);
            this.worldCopyObjects.set(objectKey, copy);
            sceneChanged = true;
          }
        }
      }
      for (const [key, copy] of this.worldCopyObjects) {
        if (desired.has(key)) continue;
        copy.removeFromParent();
        this.worldCopyObjects.delete(key);
        sceneChanged = true;
      }
      for (const [key, group] of this.worldCopyGroups) {
        if (group.children.length > 0) continue;
        group.removeFromParent();
        this.worldCopyGroups.delete(key);
      }
      const usedMaterials = /* @__PURE__ */ new Set();
      for (const copy of this.worldCopyObjects.values()) {
        copy.traverse((object) => {
          const mesh = object;
          if (!mesh.isMesh) return;
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const material of materials) usedMaterials.add(material);
        });
      }
      for (const [key, material] of this.worldCopyMaterialCache) {
        if (usedMaterials.has(material)) continue;
        material.dispose();
        this.worldCopyMaterialCache.delete(key);
      }
      this.worldCopies = [...this.worldCopyGroups.values()];
      this.worldCopyMaterials = [...this.worldCopyMaterialCache.values()];
      if (sceneChanged) this.chunkScheduler.invalidateScene();
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
      if (typeof ResizeObserver !== "undefined") {
        this.resizeObserver = new ResizeObserver(this.handleResize);
        this.resizeObserver.observe(this.canvas);
      }
    }
    updateWorldChunkVisibility() {
      if (!this.mapData) return;
      this.chunkScheduler.update(this.scene, this.camera, this.controls.target, {
        enabled: (metadata) => {
          const layer = this.worldRenderLayers?.forKind(metadata.kind);
          try {
            return layer?.enabled?.(metadata) ?? (metadata.kind !== "grass" || this.options.grassEnabled);
          } catch (reason) {
            this.reportWorldRenderLayerErrors(`world render layer "${layer?.id}" failed to evaluate visibility`, [renderLayerError(reason)]);
            return false;
          }
        },
        activate: (metadata, lod, objects) => this.activateWorldChunk(metadata, lod, objects),
        release: (metadata) => this.releaseWorldChunk(metadata)
      });
    }
    activateWorldChunk(metadata, lod, objects) {
      const registered = this.worldRenderLayers?.forKind(metadata.kind);
      if (registered) {
        try {
          return registered.activateLod?.(metadata, lod, objects);
        } catch (reason) {
          this.reportWorldRenderLayerErrors(`world render layer "${registered.id}" failed to activate LOD`, [renderLayerError(reason)]);
          return void 0;
        }
      }
      if (metadata.kind === "land" || metadata.kind === "water") return this.activateTerrainWorldChunk(metadata, lod, objects);
      if (metadata.kind === "grass") return this.activateGrassWorldChunk(metadata, lod, objects);
      if (metadata.kind === "forest") return this.activateForestWorldChunk(metadata, lod, objects);
      return void 0;
    }
    activateTerrainWorldChunk(metadata, lod, objects) {
      const geometry = this.terrain?.activateChunk(metadata, lod);
      if (geometry) {
        for (const object of objects) if (object.isMesh) object.geometry = geometry;
      }
      return geometry ? { geometries: [geometry] } : void 0;
    }
    activateGrassWorldChunk(metadata, lod, objects) {
      const field2 = this.streamedGrassByChunkId.get(metadata.id) ?? this.grass;
      const geometry = field2?.activateChunk(metadata, lod);
      if (geometry) {
        for (const object of objects) if (object.isMesh) object.geometry = geometry;
      }
      return geometry ? { geometries: [geometry] } : void 0;
    }
    activateForestWorldChunk(metadata, lod, objects) {
      const forest = this.streamedForestByChunkId.get(metadata.id) ?? this.forest;
      forest?.activateChunk(metadata, lod, objects);
      return forest ? { disposeGpu: () => forest.disposeChunkGpu(metadata) } : void 0;
    }
    releaseWorldChunk(metadata) {
      const registered = this.worldRenderLayers?.forKind(metadata.kind);
      if (registered) {
        try {
          registered.releaseChunk?.(metadata);
        } catch (reason) {
          this.reportWorldRenderLayerErrors(`world render layer "${registered.id}" failed to release a chunk`, [renderLayerError(reason)]);
        }
        return;
      }
      if (metadata.kind === "land" || metadata.kind === "water") this.terrain?.releaseChunk(metadata);
      else if (metadata.kind === "grass") (this.streamedGrassByChunkId.get(metadata.id) ?? this.grass)?.releaseChunk(metadata);
      else if (metadata.kind === "forest") (this.streamedForestByChunkId.get(metadata.id) ?? this.forest)?.releaseChunk(metadata);
    }
    //Public API
    //-------------------------------------------------------------------------
    //Backwards-compatible finite-map convenience entry point. loadWorld() is
    //the extensible source API; existing 0.5 consumers can keep passing MapInfo
    //directly without a breaking migration.
    load(mapData) {
      return this.loadWorld({ source: new StaticWorldSource(mapData) });
    }
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
      const predictionSeconds = options.predictionSeconds ?? 1.25;
      const predictionMaxChunks = options.predictionMaxChunks ?? 1;
      const baseWorkerCount = Math.max(1, source.stats?.configuredWorkers ?? source.stats?.workers ?? 1);
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
        integerAtLeast("predictionMaxChunks", predictionMaxChunks, 0);
        if (!Number.isFinite(frameBudgetMs) || frameBudgetMs <= 0) {
          throw new RangeError("frameBudgetMs must be a positive finite number");
        }
        if (!Number.isFinite(predictionSeconds) || predictionSeconds < 0) {
          throw new RangeError("predictionSeconds must be a non-negative finite number");
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
      let adaptiveController;
      let worldSurface;
      try {
        adaptiveController = new AdaptiveStreamingController({
          enabled: options.adaptiveStreaming ?? true,
          targetFrameMs: options.targetFrameMs,
          baseFrameBudgetMs: frameBudgetMs,
          baseMaxTasksPerFrame: maxMountsPerFrame,
          baseWorkerCount,
          minimumWorkerCount: options.adaptiveMinWorkerCount ?? 1,
          baseLodDistances: {
            near: this.options.lodNearDistance,
            far: this.options.lodFarDistance,
            vegetation: this.options.vegetationRenderDistance,
            hysteresis: this.options.chunkLodHysteresis
          },
          degradeFrames: options.adaptiveDegradeFrames,
          recoverFrames: options.adaptiveRecoverFrames,
          cooldownFrames: options.adaptiveCooldownFrames
        });
        const descriptor = source.descriptor;
        const resolver = descriptor ? createWorldSurfaceResolver({
          seed: descriptor.seed,
          domain: descriptor.topology === "toroidal" ? { topology: "toroidal", width: descriptor.width, height: descriptor.height } : { topology: "infinite" }
        }) : void 0;
        worldSurface = createWorldSurfaceView({
          map: source.map,
          resolver,
          tileSize: this.options.size,
          mountainHeight: this.options.mountainHeight
        });
      } catch (reason) {
        source.dispose();
        throw reason;
      }
      this.stopWorldStreaming();
      const revision = ++this.loadRevision;
      const worldController = new RenderWorldController(source, this.runtimeWork, {
        drainTimeoutMs: this.options.worldSessionDrainTimeoutMs,
        error: (error) => this.emit("error", error)
      });
      const residency = worldController.residency;
      this.worldController = worldController;
      this.worldSource = source;
      this.worldResidency = residency;
      this.adaptiveStreamingController = adaptiveController;
      this.applyAdaptiveStreamingProfile(adaptiveController.currentProfile);
      this.worldChunkSize = chunkSize;
      this.streamingPredictionSeconds = predictionSeconds;
      this.streamingPredictionMaxChunks = Math.min(
        predictionMaxChunks,
        Math.max(0, retentionRadius - loadRadius)
      );
      this.lastStreamingTarget = void 0;
      this.streamingVelocity.set(0, 0);
      this.mapData = source.map;
      this.worldSurface = worldSurface;
      this.worldEditing = new WorldEditingFacade(source, source.map, { visualSignature: worldTileVisualSignature });
      this.fogStates = new FogStateStore(source.map);
      this.floatingOriginThreshold = threshold;
      this.worldPatternOffset.set(0, 0);
      this.cleanRoutePath();
      this.interactions.reset();
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
        const atlas = await worldController.lifecycle.run((signal) => this.fetchTerrainAtlas(signal));
        if (!this.isWorldSessionCurrent(source, revision) || !worldController.lifecycle.active) return;
        this.atlas = atlas;
        if (!await worldController.lifecycle.run(() => this.rebuildTerrain(revision, true))) return;
        if (!await worldController.lifecycle.run(() => this.initializeWorldRenderLayers(source, revision))) return;
        if (!this.isWorldSessionCurrent(source, revision)) return;
        const streamer = worldController.startStreaming({
          chunkLoaded: (chunk) => this.worldChunkMountQueue.schedule(chunk),
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
        this.worldDemandSignature = this.worldDemandChunkKey;
        this.rebaseWorld();
        const loadedCenter = await worldController.setCenterTile(initialTile.x, initialTile.y);
        const centerKey = WorldStreamer.key(loadedCenter.chunkX, loadedCenter.chunkY);
        const centerLayers = this.worldChunkLayers.get(centerKey);
        await worldController.lifecycle.track(Promise.all([
          centerLayers?.forestPromise,
          centerLayers?.cityPromise,
          ...centerLayers?.renderLayerPromises?.values() ?? []
        ]));
        if (this.disposed || revision !== this.loadRevision || this.worldStreamer !== streamer) return;
        this.updateWorldChunkVisibility();
        this.emit("load", void 0);
      } catch (reason) {
        if (revision === this.loadRevision && this.worldSource === source) this.stopWorldStreaming();
        throw reason;
      }
    }
    async fetchTerrainAtlas(signal) {
      const atlasUrl = new URL("land-atlas.json", new URL(this.options.texturesBaseUrl, window.location.href)).href;
      const response = await fetch(atlasUrl, { signal });
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
      this.controls.target.set(
        center.x,
        this.worldSurface?.getTileCenterHeight(tile.x, tile.y) ?? 0,
        center.y
      );
      this.camera.position.copy(this.controls.target).addScaledVector(direction, viewDistance);
      this.controls.update();
    }
    runRenderWorldTask(source, operation) {
      const controller = this.worldController;
      if (controller && controller.source === source) return controller.lifecycle.run(operation);
      try {
        return Promise.resolve(operation());
      } catch (reason) {
        return Promise.reject(reason);
      }
    }
    mountWorldChunk(chunk) {
      if (!this.worldStreamer || !this.terrain) return;
      const points = chunk.coreTiles;
      const key = WorldStreamer.key(chunk.chunkX, chunk.chunkY);
      const revision = ++this.worldLayerRevision;
      const record = { chunk, points, revision };
      this.worldChunkLayers.set(key, record);
      record.renderLayerPromises = /* @__PURE__ */ new Map();
      record.renderLayerStates = /* @__PURE__ */ new Map();
      for (const layer of this.worldRenderLayers.values()) {
        const mounted = this.runRenderWorldTask(
          this.worldSource,
          () => this.mountRegisteredWorldRenderLayer(layer, key, record)
        );
        record.renderLayerPromises.set(layer.id, mounted);
        void mounted.catch((error) => {
          if (this.worldChunkLayers.get(key) === record) this.emit("error", error);
        });
      }
      this.reapplyFogToPoints(points, record);
      this.refreshWorldCopies();
    }
    unmountWorldChunk(chunk) {
      const key = WorldStreamer.key(chunk.chunkX, chunk.chunkY);
      this.worldChunkMountQueue.forget(key);
      this.frameTasks.cancel(`vegetation-quality:${key}`);
      const record = this.worldChunkLayers.get(key);
      if (!record) return;
      record.vegetationAbort?.abort();
      record.revision = ++this.worldLayerRevision;
      const errors = [];
      for (const layer of [...this.worldRenderLayers.values()].reverse()) {
        errors.push(...this.unmountRegisteredWorldRenderLayer(layer, key, record));
      }
      this.worldChunkLayers.delete(key);
      this.refreshWorldCopies();
      this.reportWorldRenderLayerErrors(`failed to unmount world chunk ${key}`, errors);
    }
    mountTerrainWorldRenderLayer(context) {
      const record = this.worldChunkLayers.get(context.key);
      if (!record || !this.terrain) return Promise.resolve();
      this.terrain.addTiles(context.points);
      const build = this.terrain.loadCities(context.points, record).then(() => {
        if (!context.isCurrent()) {
          this.terrain?.removeCities(context.points, record);
          return;
        }
        this.terrain?.setFogStates(this.fogChangesForPoints(context.points));
        this.refreshWorldCopies();
      }).catch((error) => {
        if (context.isCurrent()) this.emit("error", error);
      });
      record.cityPromise = build;
      return build;
    }
    unmountTerrainWorldRenderLayer(context) {
      const record = this.worldChunkLayers.get(context.key);
      const forgotten = this.terrain?.removeTiles(context.points, true, record) ?? [];
      this.chunkScheduler.forget(forgotten);
    }
    async refreshTerrainWorldRenderLayer(context) {
      if (!this.terrain) return;
      const forgotten = this.terrain.refreshTileAttributes(context.tiles);
      this.chunkScheduler.forget(forgotten);
      const cityChanges = context.tiles.flatMap((point) => {
        const owner = context.source.resolveChunk(
          Math.floor(point.x / context.source.chunkSize),
          Math.floor(point.y / context.source.chunkSize)
        );
        const record = owner ? this.worldChunkLayers.get(WorldStreamer.key(owner.x, owner.y)) : void 0;
        return record ? [{ point, owner: record }] : [];
      });
      await this.terrain.refreshCities(cityChanges);
      this.terrain.setFogStates(this.fogChangesForPoints(context.tiles));
      context.invalidateVisibility();
      context.requestWorldCopyRefresh();
    }
    async mountGrassWorldRenderLayer(context) {
      const record = this.worldChunkLayers.get(context.key);
      if (!record || !this.options.grassEnabled) return;
      const grassBuildRevision = record.grassBuildRevision ?? (record.grassBuildRevision = 0);
      const preparation = this.prepareWorldVegetation(context, record);
      const vegetationSignature = record.vegetationSignature;
      const density = this.worldVegetationDensity(record.requestedVegetationScale ?? 1);
      const prepared = await preparation;
      if (!context.isCurrent() || record.grassBuildRevision !== grassBuildRevision || record.requestedVegetationSignature !== vegetationSignature) return;
      this.streamedGrassResources ?? (this.streamedGrassResources = new GrassSharedResources({
        size: this.options.size,
        bladeHeight: this.options.grassBladeHeight,
        windStrength: this.options.grassWindStrength,
        windSpeed: this.options.grassWindSpeed,
        fogDarkenFactor: this.options.fogDarkenFactor
      }));
      const grass = createGrassField(this.mapData, {
        size: this.options.size,
        surface: this.worldSurface,
        density: density.grassDensity,
        bladeWidth: this.options.grassBladeWidth,
        bladeHeight: this.options.grassBladeHeight,
        windStrength: this.options.grassWindStrength,
        windSpeed: this.options.grassWindSpeed,
        fogDarkenFactor: this.options.fogDarkenFactor,
        riverWidth: this.options.riverWidth,
        riverBankWidth: this.options.riverBankWidth,
        riverCurvature: this.options.riverCurvature,
        lakeShoreWidth: this.options.lakeShoreWidth
      }, context.points, this.streamedGrassResources, prepared) ?? void 0;
      if (!context.isCurrent() || record.grassBuildRevision !== grassBuildRevision || record.requestedVegetationSignature !== vegetationSignature) {
        grass?.dispose();
        return;
      }
      this.replaceGrassWorldRenderLayer(context, record, grass, vegetationSignature);
    }
    replaceGrassWorldRenderLayer(context, record, grass, vegetationSignature) {
      const previous = record.grass;
      if (grass) {
        this.applyWorldPatternToObject(grass);
        this.indexChunkLayer(grass, this.streamedGrassByChunkId);
        this.worldRoot.add(grass);
        this.reapplyFogToObject(grass, context.points);
      }
      record.grass = grass;
      record.grassVegetationSignature = vegetationSignature;
      if (!previous || previous === grass) return;
      const forgotten = [];
      this.collectChunkIds(previous, forgotten);
      this.unindexChunkLayer(previous, this.streamedGrassByChunkId);
      this.worldRoot.remove(previous);
      previous.dispose();
      this.chunkScheduler.forget(forgotten);
    }
    unmountGrassWorldRenderLayer(context) {
      const record = this.worldChunkLayers.get(context.key);
      if (!record?.grass) return;
      const forgotten = [];
      this.collectChunkIds(record.grass, forgotten);
      this.unindexChunkLayer(record.grass, this.streamedGrassByChunkId);
      this.worldRoot.remove(record.grass);
      record.grass.dispose();
      record.grass = void 0;
      record.grassVegetationSignature = void 0;
      this.chunkScheduler.forget(forgotten);
    }
    refreshGrassWorldRenderLayer(context) {
      return this.refreshVegetationWorldRenderLayer(context, this.streamedGrassByChunkId.values());
    }
    mountForestWorldRenderLayer(context) {
      const record = this.worldChunkLayers.get(context.key);
      if (!record || this.options.treesPerTile <= 0) return Promise.resolve();
      const forestBuildRevision = record.forestBuildRevision ?? (record.forestBuildRevision = 0);
      this.streamedForestResources ?? (this.streamedForestResources = new ForestSharedResources());
      const preparation = this.prepareWorldVegetation(context, record);
      const vegetationSignature = record.vegetationSignature;
      const density = this.worldVegetationDensity(record.requestedVegetationScale ?? 1);
      const build = preparation.then((prepared) => createForest(this.mapData, {
        size: this.options.size,
        surface: this.worldSurface,
        treesPerTile: density.treesPerTile,
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
      }, context.points, this.streamedForestResources, prepared)).then((forest) => {
        if (!context.isCurrent() || record.forestBuildRevision !== forestBuildRevision) {
          forest?.dispose();
          return;
        }
        if (record.requestedVegetationSignature !== vegetationSignature) {
          forest?.dispose();
          return;
        }
        this.replaceForestWorldRenderLayer(context, record, forest ?? void 0, vegetationSignature);
        this.refreshWorldCopies();
      }).catch((error) => {
        if (context.isCurrent()) this.emit("error", error);
      });
      record.forestPromise = build;
      return build;
    }
    replaceForestWorldRenderLayer(context, record, forest, vegetationSignature) {
      const previous = record.forest;
      if (forest) {
        this.indexChunkLayer(forest, this.streamedForestByChunkId);
        this.worldRoot.add(forest);
        this.reapplyFogToObject(forest, context.points);
      }
      record.forest = forest;
      record.forestVegetationSignature = vegetationSignature;
      if (!previous || previous === forest) return;
      const forgotten = [];
      this.collectChunkIds(previous, forgotten);
      this.unindexChunkLayer(previous, this.streamedForestByChunkId);
      this.worldRoot.remove(previous);
      previous.dispose();
      this.chunkScheduler.forget(forgotten);
    }
    prepareWorldVegetation(context, record) {
      const scale = record.requestedVegetationScale ?? this.adaptiveStreamingController?.currentProfile.vegetationDensityScale ?? 1;
      const density = this.worldVegetationDensity(scale);
      record.requestedVegetationScale = scale;
      record.requestedVegetationSignature = density.signature;
      if (record.vegetationPromise && record.vegetationSignature === density.signature) {
        return record.vegetationPromise;
      }
      record.vegetationAbort?.abort();
      if (!isWorldVegetationSource(context.source)) {
        record.vegetationSignature = density.signature;
        const preparation2 = Promise.resolve(void 0);
        record.vegetationPromise = preparation2;
        return preparation2;
      }
      const center = this.worldStreamer?.stats;
      const priority = center ? context.source.chunkDistance(
        context.chunk.chunkX,
        context.chunk.chunkY,
        center.centerChunkX,
        center.centerChunkY
      ) : 0;
      const abort = new AbortController();
      record.vegetationAbort = abort;
      record.vegetationSignature = density.signature;
      const preparation = context.source.prepareVegetation({
        points: context.points,
        size: this.options.size,
        grassDensity: density.grassDensity,
        grassBladeWidth: this.options.grassBladeWidth,
        grassBladeHeight: this.options.grassBladeHeight,
        grassHeightVariation: 0.4,
        treesPerTile: density.treesPerTile,
        treeScale: this.options.treeScale,
        treeModel: this.options.treeModel,
        riverWidth: this.options.riverWidth,
        riverBankWidth: this.options.riverBankWidth,
        riverCurvature: this.options.riverCurvature,
        lakeShoreWidth: this.options.lakeShoreWidth,
        beachWidth: this.options.beachWidth,
        waterCornerRounding: this.options.waterCornerRounding,
        coastCurvature: this.options.coastCurvature
      }, { priority, signal: abort.signal, lane: "prefetch", weight: Math.max(1, Math.ceil(context.points.length / 128)) });
      record.vegetationPromise = this.worldController?.source === context.source ? this.worldController.lifecycle.track(preparation) : preparation;
      return record.vegetationPromise;
    }
    worldVegetationDensity(scale) {
      const normalizedScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
      const grassDensity = this.options.grassEnabled && this.options.grassDensity > 0 ? Math.max(1, Math.round(this.options.grassDensity * normalizedScale)) : 0;
      const treesPerTile = this.options.treesPerTile > 0 ? Math.max(1, Math.round(this.options.treesPerTile * normalizedScale)) : 0;
      return { grassDensity, treesPerTile, signature: `${grassDensity}:${treesPerTile}` };
    }
    unmountForestWorldRenderLayer(context) {
      const record = this.worldChunkLayers.get(context.key);
      if (!record?.forest) return;
      const forgotten = [];
      this.collectChunkIds(record.forest, forgotten);
      this.unindexChunkLayer(record.forest, this.streamedForestByChunkId);
      this.worldRoot.remove(record.forest);
      record.forest.dispose();
      record.forest = void 0;
      record.forestVegetationSignature = void 0;
      this.chunkScheduler.forget(forgotten);
    }
    refreshForestWorldRenderLayer(context) {
      return this.refreshVegetationWorldRenderLayer(context, this.streamedForestByChunkId.values());
    }
    refreshVegetationWorldRenderLayer(context, fields) {
      if (context.refreshKind !== "city") return false;
      const uniqueFields = new Set(fields);
      for (const point of context.tiles) {
        const suppressed = Boolean(getMapTile(this.mapData, point.x, point.y)?.city);
        for (const field2 of uniqueFields) field2.setTileSuppressed(point.x, point.y, suppressed);
      }
      context.invalidateVisibility();
      return true;
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
    applyAdaptiveStreamingProfile(profile) {
      const resolutionChanged = profile.resolutionScale !== this.adaptiveResolutionScale;
      this.adaptiveResolutionScale = profile.resolutionScale;
      const densityChanged = profile.vegetationDensityScale !== this.appliedVegetationDensityScale;
      this.appliedVegetationDensityScale = profile.vegetationDensityScale;
      this.frameTasks.configure({
        budgetMs: profile.frameBudgetMs,
        maxTasksPerFrame: profile.maxTasksPerFrame
      });
      this.chunkScheduler.configure({
        lodDistances: profile.lodDistances,
        lodBias: profile.lodBias,
        vegetationLodBias: profile.vegetationLodBias
      });
      try {
        this.worldSource?.configureWorkerCount?.(profile.workerCount);
      } catch (reason) {
        this.emit("error", reason instanceof Error ? reason : new Error(String(reason)));
      }
      if (resolutionChanged) this.handleResize();
      if (densityChanged) this.scheduleAdaptiveVegetationRebuild(profile.vegetationDensityScale);
    }
    scheduleAdaptiveVegetationRebuild(scale) {
      const source = this.worldSource;
      const streamer = this.worldStreamer;
      if (!source || !streamer || this.worldChunkLayers.size === 0) return;
      const target = this.worldVegetationDensity(scale);
      const revision = ++this.adaptiveVegetationRevision;
      const center = streamer.stats;
      for (const [key, record] of this.worldChunkLayers) {
        record.requestedVegetationScale = scale;
        record.requestedVegetationSignature = target.signature;
        const grassCurrent = !this.options.grassEnabled || this.options.grassDensity <= 0 || record.grassVegetationSignature === target.signature;
        const forestCurrent = this.options.treesPerTile <= 0 || record.forestVegetationSignature === target.signature;
        if (grassCurrent && forestCurrent) continue;
        const priority = source.chunkDistance(
          record.chunk.chunkX,
          record.chunk.chunkY,
          center.centerChunkX,
          center.centerChunkY
        );
        this.frameTasks.enqueue(`vegetation-quality:${key}`, priority, () => {
          if (this.disposed || revision !== this.adaptiveVegetationRevision || this.worldSource !== source || this.worldChunkLayers.get(key) !== record || record.requestedVegetationSignature !== target.signature) return;
          void this.runRenderWorldTask(
            source,
            () => this.rebuildAdaptiveWorldVegetation(key, record, target.signature)
          ).catch((reason) => {
            if (this.worldChunkLayers.get(key) === record) this.emit("error", renderLayerError(reason));
          });
        });
      }
    }
    async rebuildAdaptiveWorldVegetation(key, record, targetSignature) {
      if (this.worldChunkLayers.get(key) !== record || record.requestedVegetationSignature !== targetSignature) return;
      record.grassBuildRevision = (record.grassBuildRevision ?? 0) + 1;
      record.forestBuildRevision = (record.forestBuildRevision ?? 0) + 1;
      record.vegetationAbort?.abort();
      record.vegetationAbort = void 0;
      record.vegetationPromise = void 0;
      record.vegetationSignature = void 0;
      const builds = [];
      if (this.options.grassEnabled && this.worldRenderLayers.get("@grass")) {
        const build = this.mountGrassWorldRenderLayer(
          this.createWorldRenderChunkContext("@grass", key, record)
        );
        record.renderLayerPromises?.set("@grass", build);
        builds.push(build);
      }
      if (this.options.treesPerTile > 0 && this.worldRenderLayers.get("@forest")) {
        const build = this.mountForestWorldRenderLayer(
          this.createWorldRenderChunkContext("@forest", key, record)
        );
        record.renderLayerPromises?.set("@forest", build);
        builds.push(build);
      }
      await Promise.all(builds);
      if (this.worldChunkLayers.get(key) !== record || record.requestedVegetationSignature !== targetSignature) return;
      this.chunkScheduler.invalidateScene();
      this.refreshWorldCopies();
    }
    createWorldRenderLayerHost(layerId, objectKey) {
      const source = this.worldSource;
      if (!source || !this.mapData) throw new Error("No world is loaded");
      const signal = this.worldController?.source === source ? this.worldController.lifecycle.signal : INERT_WORLD_SIGNAL;
      const isCurrent = () => !this.disposed && !signal.aborted && this.worldSource === source;
      return {
        map: this.mapData,
        source,
        tileSize: this.options.size,
        surface: this.worldSurface,
        signal,
        addObject: (object) => {
          if (!isCurrent()) return;
          let byChunk = this.worldRenderLayerObjects.get(layerId);
          if (!byChunk) {
            byChunk = /* @__PURE__ */ new Map();
            this.worldRenderLayerObjects.set(layerId, byChunk);
          }
          let objects = byChunk.get(objectKey);
          if (!objects) {
            objects = /* @__PURE__ */ new Set();
            byChunk.set(objectKey, objects);
          }
          if (objects.has(object)) return;
          objects.add(object);
          this.applyWorldPatternToObject(object);
          this.worldRoot.add(object);
          this.chunkScheduler.invalidateScene();
        },
        removeObject: (object) => {
          this.worldRenderLayerObjects.get(layerId)?.get(objectKey)?.delete(object);
          this.worldRoot.remove(object);
          this.chunkScheduler.invalidateScene();
        },
        invalidateVisibility: () => {
          if (isCurrent()) this.chunkScheduler.invalidateScene();
        },
        requestWorldCopyRefresh: () => {
          if (isCurrent()) this.refreshWorldCopies();
        }
      };
    }
    createWorldRenderChunkContext(layerId, key, record, allowClosing = false) {
      const revision = record.revision;
      const host = this.createWorldRenderLayerHost(layerId, key);
      return {
        ...host,
        chunk: record.chunk,
        key,
        points: record.points,
        revision,
        isCurrent: () => (allowClosing || !this.disposed && !host.signal.aborted) && this.worldChunkLayers.get(key) === record && record.revision === revision
      };
    }
    async mountRegisteredWorldRenderLayer(layer, key, record) {
      if (!this.initializedWorldRenderLayers.has(layer.id)) return;
      record.renderLayerStates ?? (record.renderLayerStates = /* @__PURE__ */ new Map());
      record.renderLayerStates.set(layer.id, "mounting");
      const context = this.createWorldRenderChunkContext(layer.id, key, record);
      try {
        await layer.mountChunk(context);
      } catch (reason) {
        const errors = [renderLayerError(reason)];
        if (record.renderLayerStates.get(layer.id) !== "unmounted") {
          errors.push(...this.unmountRegisteredWorldRenderLayer(layer, key, record));
        } else {
          this.removeWorldRenderLayerObjects(layer.id, key);
        }
        throw new WorldRenderLayerLifecycleError(`world render layer "${layer.id}" failed to mount chunk ${key}`, errors);
      }
      const current = context.isCurrent() && this.worldRenderLayers.get(layer.id) === layer && this.initializedWorldRenderLayers.has(layer.id);
      if (!current || record.renderLayerStates.get(layer.id) === "unmounted") {
        this.removeWorldRenderLayerObjects(layer.id, key);
        return;
      }
      record.renderLayerStates.set(layer.id, "mounted");
      this.chunkScheduler.invalidateScene();
      this.refreshWorldCopies();
    }
    unmountRegisteredWorldRenderLayer(layer, key, record) {
      const errors = [];
      record.renderLayerStates ?? (record.renderLayerStates = /* @__PURE__ */ new Map());
      const state = record.renderLayerStates.get(layer.id);
      if (state !== "unmounted") {
        record.renderLayerStates.set(layer.id, "unmounted");
        try {
          layer.unmountChunk(this.createWorldRenderChunkContext(layer.id, key, record, true));
        } catch (reason) {
          errors.push(renderLayerError(reason));
        }
      }
      record.renderLayerPromises?.delete(layer.id);
      try {
        this.removeWorldRenderLayerObjects(layer.id, key);
      } catch (reason) {
        errors.push(renderLayerError(reason));
      }
      return errors;
    }
    removeWorldRenderLayerObjects(layerId, objectKey) {
      const byChunk = this.worldRenderLayerObjects.get(layerId);
      if (!byChunk) return;
      const keys = objectKey === void 0 ? [...byChunk.keys()] : [objectKey];
      for (const key of keys) {
        for (const object of byChunk.get(key) ?? []) this.worldRoot.remove(object);
        byChunk.delete(key);
      }
      if (byChunk.size === 0) this.worldRenderLayerObjects.delete(layerId);
      this.chunkScheduler.invalidateScene();
    }
    async initializeWorldRenderLayers(source, loadRevision) {
      for (const layer of this.worldRenderLayers.values()) {
        if (!this.isWorldSessionCurrent(source, loadRevision)) return false;
        if (!this.initializedWorldRenderLayers.has(layer.id)) {
          await this.initializeRegisteredWorldRenderLayer(layer);
        }
        if (!this.isWorldSessionCurrent(source, loadRevision)) return false;
      }
      return true;
    }
    async initializeRegisteredWorldRenderLayer(layer) {
      const source = this.worldSource;
      if (!source) return false;
      const revision = (this.worldRenderLayerInitRevisions.get(layer.id) ?? 0) + 1;
      this.worldRenderLayerInitRevisions.set(layer.id, revision);
      const host = this.createWorldRenderLayerHost(layer.id, "@world");
      try {
        await layer.initialize?.(host);
      } catch (reason) {
        const errors = [renderLayerError(reason)];
        try {
          layer.unloadWorld?.(host);
        } catch (cleanupReason) {
          errors.push(renderLayerError(cleanupReason));
        }
        this.removeWorldRenderLayerObjects(layer.id, "@world");
        throw new WorldRenderLayerLifecycleError(`world render layer "${layer.id}" failed to initialize`, errors);
      }
      if (this.disposed || this.worldSource !== source || this.worldRenderLayers.get(layer.id) !== layer || this.worldRenderLayerInitRevisions.get(layer.id) !== revision) {
        const errors = [];
        try {
          layer.unloadWorld?.(host);
        } catch (reason) {
          errors.push(renderLayerError(reason));
        }
        this.removeWorldRenderLayerObjects(layer.id, "@world");
        this.reportWorldRenderLayerErrors(`world render layer "${layer.id}" failed to clean up stale initialization`, errors);
        return false;
      }
      this.initializedWorldRenderLayers.add(layer.id);
      return true;
    }
    unloadWorldRenderLayers() {
      if (!this.worldSource || !this.mapData) return;
      const errors = [];
      for (const layer of [...this.worldRenderLayers.values()].reverse()) {
        this.worldRenderLayerInitRevisions.set(layer.id, (this.worldRenderLayerInitRevisions.get(layer.id) ?? 0) + 1);
        if (this.initializedWorldRenderLayers.delete(layer.id)) {
          try {
            layer.unloadWorld?.(this.createWorldRenderLayerHost(layer.id, "@world"));
          } catch (reason) {
            errors.push(renderLayerError(reason));
          }
        }
        try {
          this.removeWorldRenderLayerObjects(layer.id);
        } catch (reason) {
          errors.push(renderLayerError(reason));
        }
      }
      this.reportWorldRenderLayerErrors("one or more world render layers failed to unload", errors);
    }
    reportWorldRenderLayerErrors(message, errors) {
      if (errors.length === 0) return;
      const error = new WorldRenderLayerLifecycleError(message, errors);
      try {
        this.emit("error", error);
      } catch {
      }
    }
    stopWorldStreaming() {
      const streamer = this.worldStreamer;
      const source = this.worldSource;
      const residency = this.worldResidency;
      const controller = this.worldController;
      const editing = this.worldEditing;
      const errors = [];
      this.worldDemandChunkKey = void 0;
      this.worldDemandSignature = void 0;
      this.lastStreamingTarget = void 0;
      this.streamingVelocity.set(0, 0);
      this.adaptiveStreamingController = void 0;
      this.appliedVegetationDensityScale = 1;
      this.adaptiveVegetationRevision += 1;
      this.chunkScheduler.configure({
        lodDistances: {
          near: this.options.lodNearDistance,
          far: this.options.lodFarDistance,
          vegetation: this.options.vegetationRenderDistance,
          hysteresis: this.options.chunkLodHysteresis
        },
        lodBias: 0,
        vegetationLodBias: 0
      });
      this.frameTasks.clear();
      this.worldChunkMountQueue.clear();
      this.worldEditing = void 0;
      editing?.dispose();
      try {
        if (controller) {
          controller.stop(false);
          let draining;
          draining = controller.settled.finally(() => this.drainingWorldSessions.delete(draining));
          this.drainingWorldSessions.add(draining);
        } else {
          streamer?.dispose(false);
          residency?.dispose(false);
        }
      } catch (reason) {
        errors.push(renderLayerError(reason));
      }
      for (const [key, record] of [...this.worldChunkLayers]) {
        record.vegetationAbort?.abort();
        record.revision = ++this.worldLayerRevision;
        for (const layer of [...this.worldRenderLayers.values()].reverse()) {
          errors.push(...this.unmountRegisteredWorldRenderLayer(layer, key, record));
        }
      }
      try {
        this.unloadWorldRenderLayers();
      } catch (reason) {
        errors.push(renderLayerError(reason));
      }
      try {
        source?.dispose();
      } catch (reason) {
        errors.push(renderLayerError(reason));
      }
      this.worldStreamer = void 0;
      this.worldSource = void 0;
      this.worldSurface = void 0;
      this.worldResidency = void 0;
      this.worldController = void 0;
      this.worldTileUpdateQueue = Promise.resolve();
      this.worldLayerRevision += 1;
      for (const record of this.worldChunkLayers.values()) {
        if (record.grass) {
          const grass = record.grass;
          const forgotten = [];
          try {
            this.collectChunkIds(grass, forgotten);
          } catch (reason) {
            errors.push(renderLayerError(reason));
          }
          try {
            this.unindexChunkLayer(grass, this.streamedGrassByChunkId);
          } catch (reason) {
            errors.push(renderLayerError(reason));
          }
          this.worldRoot.remove(grass);
          try {
            grass.dispose();
          } catch (reason) {
            errors.push(renderLayerError(reason));
          }
          record.grass = void 0;
          this.chunkScheduler.forget(forgotten);
        }
        if (record.forest) {
          const forest = record.forest;
          const forgotten = [];
          try {
            this.collectChunkIds(forest, forgotten);
          } catch (reason) {
            errors.push(renderLayerError(reason));
          }
          try {
            this.unindexChunkLayer(forest, this.streamedForestByChunkId);
          } catch (reason) {
            errors.push(renderLayerError(reason));
          }
          this.worldRoot.remove(forest);
          try {
            forest.dispose();
          } catch (reason) {
            errors.push(renderLayerError(reason));
          }
          record.forest = void 0;
          this.chunkScheduler.forget(forgotten);
        }
      }
      this.worldChunkLayers.clear();
      this.streamedGrassByChunkId.clear();
      this.streamedForestByChunkId.clear();
      try {
        this.streamedGrassResources?.dispose();
      } catch (reason) {
        errors.push(renderLayerError(reason));
      }
      this.streamedGrassResources = void 0;
      try {
        this.streamedForestResources?.dispose();
      } catch (reason) {
        errors.push(renderLayerError(reason));
      }
      this.streamedForestResources = void 0;
      try {
        this.clearWorldCopies();
      } catch (reason) {
        errors.push(renderLayerError(reason));
      }
      this.chunkScheduler.clear();
      this.reportWorldRenderLayerErrors("world streaming cleanup encountered errors", errors);
    }
    reapplyFogToPoints(points, record) {
      const changes = this.fogChangesForPoints(points);
      this.terrain?.setFogStates(changes);
      record.grass?.setFogStates(changes);
      record.forest?.setFogStates(changes);
    }
    reapplyFogToObject(object, points) {
      if (points) {
        object.setFogStates(this.fogChangesForPoints(points));
        return;
      }
      const changes = [];
      this.fogStates?.forEach((stored, x, y) => {
        changes.push({ x, y, state: this.warFogShown ? stored : 2 /* Visible */ });
      });
      object.setFogStates(changes);
    }
    fogChangesForPoints(points) {
      return points.map((point) => ({
        x: point.x,
        y: point.y,
        state: this.warFogShown ? this.fogStates?.get(point.x, point.y) ?? 2 /* Visible */ : 2 /* Visible */
      }));
    }
    //Tears down and recreates the terrain (land/water layers + city models) from
    //the current options against the already-fetched atlas/map data. Only needed
    //when the map itself changes (see load()) - everything water/blend-related
    //is a live uniform, see TerrainMesh's own getters/setters, forwarded below
    //(waterWaveAmplitude, beachWidth, etc.)
    async rebuildTerrain(expectedRevision = this.loadRevision, deferTiles = Boolean(this.worldStreamer)) {
      if (!this.worldSurface) throw new Error("No world surface is loaded");
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
        surface: this.worldSurface,
        gridVisible: this.options.gridVisible,
        gridColor: this.options.gridColor,
        gridWidth: this.options.gridWidth,
        gridOpacity: this.options.gridOpacity,
        shaderQuality: this.options.terrainShaderQuality,
        landformDebugMode: this.options.landformDebugMode,
        terrainTextureRegionSize: this.options.terrainTextureRegionSize,
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
        landBlendEnabled: this.options.landBlendEnabled,
        waterCornerRounding: this.options.waterCornerRounding,
        coastCurvature: this.options.coastCurvature,
        landBlendCurvature: this.options.landBlendCurvature,
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
        surface: this.worldSurface,
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
    async rebuildGrass() {
      if (this.worldStreamer) {
        return this.rebuildStreamedGrass();
      }
      this.clearWorldCopies();
      this.chunkScheduler.clear();
      if (this.grass) {
        this.worldRoot.remove(this.grass);
        this.grass.dispose();
        this.grass = void 0;
      }
      if (!this.mapData) return false;
      this.grass = createGrassField(this.mapData, {
        size: this.options.size,
        surface: this.worldSurface,
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
      return true;
    }
    async rebuildStreamedGrass() {
      this.chunkScheduler.clear();
      this.streamedGrassByChunkId.clear();
      for (const [key, record] of this.worldChunkLayers) {
        this.unmountGrassWorldRenderLayer(this.createWorldRenderChunkContext("@grass", key, record));
      }
      this.streamedGrassResources?.dispose();
      this.streamedGrassResources = void 0;
      const layer = this.worldRenderLayers.get("@grass");
      if (!layer) return false;
      const builds = [];
      for (const [key, record] of this.worldChunkLayers) {
        record.grassBuildRevision = (record.grassBuildRevision ?? 0) + 1;
        record.vegetationAbort?.abort();
        record.vegetationPromise = void 0;
        record.vegetationAbort = void 0;
        const mounted = this.mountRegisteredWorldRenderLayer(layer, key, record);
        record.renderLayerPromises?.set(layer.id, mounted);
        builds.push(mounted);
      }
      await Promise.all(builds);
      this.refreshWorldCopies();
      return !this.disposed;
    }
    async rebuildStreamedForests(expectedRevision, forestRevision) {
      this.chunkScheduler.clear();
      this.streamedForestByChunkId.clear();
      const builds = [];
      for (const [key, record] of this.worldChunkLayers) {
        this.unmountForestWorldRenderLayer(this.createWorldRenderChunkContext("@forest", key, record));
      }
      this.streamedForestResources?.dispose();
      this.streamedForestResources = new ForestSharedResources();
      const layer = this.worldRenderLayers.get("@forest");
      if (!layer) return false;
      for (const [key, record] of this.worldChunkLayers) {
        record.forestBuildRevision = (record.forestBuildRevision ?? 0) + 1;
        record.vegetationAbort?.abort();
        record.vegetationPromise = void 0;
        record.vegetationAbort = void 0;
        const build = this.mountRegisteredWorldRenderLayer(layer, key, record);
        record.forestPromise = build;
        record.renderLayerPromises?.set(layer.id, build);
        builds.push(build);
      }
      await Promise.all(builds);
      this.refreshWorldCopies();
      return !this.disposed && expectedRevision === this.loadRevision && forestRevision === this.forestRevision;
    }
    async rebuildSurfaceVegetation(expectedRevision) {
      if (!this.worldStreamer) {
        await Promise.all([this.rebuildGrass(), this.rebuildForest(expectedRevision)]);
        return !this.disposed && expectedRevision === this.loadRevision;
      }
      const forestRevision = ++this.forestRevision;
      this.chunkScheduler.clear();
      this.streamedGrassByChunkId.clear();
      this.streamedForestByChunkId.clear();
      for (const [key, record] of this.worldChunkLayers) {
        const context = this.createWorldRenderChunkContext("@grass", key, record);
        this.unmountGrassWorldRenderLayer(context);
        this.unmountForestWorldRenderLayer(this.createWorldRenderChunkContext("@forest", key, record));
        record.grassBuildRevision = (record.grassBuildRevision ?? 0) + 1;
        record.forestBuildRevision = (record.forestBuildRevision ?? 0) + 1;
        record.vegetationAbort?.abort();
        record.vegetationAbort = void 0;
        record.vegetationPromise = void 0;
      }
      this.streamedGrassResources?.dispose();
      this.streamedGrassResources = void 0;
      this.streamedForestResources?.dispose();
      this.streamedForestResources = new ForestSharedResources();
      const grassLayer = this.worldRenderLayers.get("@grass");
      const forestLayer = this.worldRenderLayers.get("@forest");
      const builds = [];
      for (const [key, record] of this.worldChunkLayers) {
        record.renderLayerPromises ?? (record.renderLayerPromises = /* @__PURE__ */ new Map());
        if (grassLayer) {
          const build = this.mountRegisteredWorldRenderLayer(grassLayer, key, record);
          record.renderLayerPromises.set(grassLayer.id, build);
          builds.push(build);
        }
        if (forestLayer) {
          const build = this.mountRegisteredWorldRenderLayer(forestLayer, key, record);
          record.forestPromise = build;
          record.renderLayerPromises.set(forestLayer.id, build);
          builds.push(build);
        }
      }
      await Promise.all(builds);
      this.refreshWorldCopies();
      return !this.disposed && expectedRevision === this.loadRevision && forestRevision === this.forestRevision;
    }
    getTile(x, y) {
      if (this.worldSource && !this.worldSource.hasTile(x, y)) return void 0;
      return this.mapData ? getMapTile(this.mapData, x, y) : void 0;
    }
    async registerWorldRenderLayer(layer) {
      if (this.disposed) throw new Error("HexMap has been disposed");
      this.worldRenderLayers.register(layer);
      const registrationSource = this.worldSource;
      const registrationController = this.worldController?.source === registrationSource ? this.worldController : void 0;
      try {
        if (!registrationSource || !this.mapData) return;
        if (!await this.runRenderWorldTask(
          registrationSource,
          () => this.initializeRegisteredWorldRenderLayer(layer)
        )) return;
        const mounts = [];
        for (const [key, record] of this.worldChunkLayers) {
          const mounted = this.runRenderWorldTask(
            registrationSource,
            () => this.mountRegisteredWorldRenderLayer(layer, key, record)
          );
          record.renderLayerPromises ?? (record.renderLayerPromises = /* @__PURE__ */ new Map());
          record.renderLayerPromises.set(layer.id, mounted);
          mounts.push(mounted);
        }
        await Promise.all(mounts);
        this.refreshWorldCopies();
        this.updateWorldChunkVisibility();
      } catch (reason) {
        if (!this.disposed && registrationController && !registrationController.lifecycle.active && this.worldRenderLayers.get(layer.id) === layer) return;
        const errors = [renderLayerError(reason)];
        try {
          this.unregisterWorldRenderLayer(layer.id);
        } catch (cleanupReason) {
          const cleanup = cleanupReason instanceof WorldRenderLayerLifecycleError ? cleanupReason.errors : [renderLayerError(cleanupReason)];
          errors.push(...cleanup);
        }
        throw new WorldRenderLayerLifecycleError(`world render layer "${layer.id}" failed to register`, errors);
      }
    }
    unregisterWorldRenderLayer(id) {
      if (this.builtinWorldRenderLayerIds.has(id)) return false;
      const layer = this.worldRenderLayers.get(id);
      if (!layer) return false;
      const errors = [];
      this.worldRenderLayerInitRevisions.set(id, (this.worldRenderLayerInitRevisions.get(id) ?? 0) + 1);
      this.worldRenderLayers.unregister(id);
      for (const [key, record] of [...this.worldChunkLayers].reverse()) {
        errors.push(...this.unmountRegisteredWorldRenderLayer(layer, key, record));
      }
      if (this.initializedWorldRenderLayers.delete(id) && this.worldSource && this.mapData) {
        try {
          layer.unloadWorld?.(this.createWorldRenderLayerHost(id, "@world"));
        } catch (reason) {
          errors.push(renderLayerError(reason));
        }
      }
      try {
        this.removeWorldRenderLayerObjects(id);
      } catch (reason) {
        errors.push(renderLayerError(reason));
      }
      try {
        layer.dispose();
      } catch (reason) {
        errors.push(renderLayerError(reason));
      }
      this.refreshWorldCopies();
      this.chunkScheduler.invalidateScene();
      if (errors.length > 0) {
        throw new WorldRenderLayerLifecycleError(`world render layer "${id}" failed to unregister cleanly`, errors);
      }
      return true;
    }
    //Persists a sparse source override and refreshes only resident generation
    //chunks whose own or neighboring render attributes can depend on that tile.
    //Pure gameplay state such as `unit` needs no GPU work; terrain, rivers,
    //vegetation and cities are rebuilt locally and the returned promise settles
    //after their asynchronous models have finished (or been superseded).
    currentWorldEditingFacade() {
      if (this.worldEditing?.source === this.worldSource) return this.worldEditing;
      if (!this.worldSource || !this.mapData) return void 0;
      this.worldEditing?.dispose();
      this.worldEditing = new WorldEditingFacade(this.worldSource, this.mapData, {
        visualSignature: worldTileVisualSignature
      });
      return this.worldEditing;
    }
    setTileOverride(x, y, changes) {
      if (this.disposed) return Promise.reject(new Error("HexMap has been disposed"));
      try {
        const result = this.currentWorldEditingFacade()?.setTileOverride(x, y, changes);
        if (!result) throw new Error("The current world source does not support tile overrides");
        return result.dirtyTiles.length === 0 ? Promise.resolve() : this.enqueueTileRenderRefresh(result.dirtyTiles[0], result.source, result.refreshKind);
      } catch (reason) {
        return Promise.reject(reason);
      }
    }
    //Validates an editor-sized change set before dispatching it, then
    //coalesces all visual invalidation into one render refresh. Sources with a
    //native setTileOverrides() implementation can additionally make storage
    //mutation atomic; the per-tile fallback preserves source compatibility.
    setTileOverrides(changes) {
      if (this.disposed) return Promise.reject(new Error("HexMap has been disposed"));
      try {
        const result = this.currentWorldEditingFacade()?.setTileOverrides(changes);
        if (!result) throw new Error("The current world source does not support tile overrides");
        return result.dirtyTiles.length === 0 ? Promise.resolve() : this.enqueueTileRenderRefreshes(result.dirtyTiles, result.source, result.refreshKind);
      } catch (reason) {
        return Promise.reject(reason);
      }
    }
    clearTileOverride(x, y) {
      if (this.disposed) return Promise.reject(new Error("HexMap has been disposed"));
      try {
        const result = this.currentWorldEditingFacade()?.clearTileOverride(x, y);
        if (!result) throw new Error("The current world source does not support tile overrides");
        if (!result.changed || result.dirtyTiles.length === 0) return Promise.resolve(result.changed);
        return this.enqueueTileRenderRefresh(result.dirtyTiles[0], result.source, result.refreshKind).then(() => true);
      } catch (reason) {
        return Promise.reject(reason);
      }
    }
    refreshWorldTiles(points) {
      if (this.disposed) return Promise.reject(new Error("HexMap has been disposed"));
      if (!Array.isArray(points) || points.some((point) => !point || !Number.isSafeInteger(point.x) || !Number.isSafeInteger(point.y))) {
        return Promise.reject(new TypeError("world refresh points must use safe integer coordinates"));
      }
      const source = this.worldSource;
      if (!source || points.length === 0) return Promise.resolve();
      const unique = new Map(points.map((point) => [`${point.x},${point.y}`, { x: point.x, y: point.y }]));
      return this.enqueueTileRenderRefreshes([...unique.values()], source);
    }
    enqueueTileRenderRefresh(point, source, refreshKind2 = "terrain") {
      return this.enqueueTileRenderRefreshes([point], source, refreshKind2);
    }
    enqueueTileRenderRefreshes(points, source, refreshKind2 = "terrain") {
      const loadRevision = this.loadRevision;
      const controller = this.worldController;
      const surfaceRevision = refreshKind2 === "terrain" ? this.worldSurface?.invalidate() : void 0;
      const queued = this.worldTileUpdateQueue.then(async () => {
        if (!this.isWorldSessionCurrent(source, loadRevision)) return;
        await this.refreshTileOverridesRendering(points, source, loadRevision, refreshKind2);
        if (surfaceRevision !== void 0) {
          const affected = /* @__PURE__ */ new Map();
          for (const point of points) {
            for (const candidate of [point, ...getMapNeighbors(this.mapData, point.x, point.y)]) {
              affected.set(`${candidate.x},${candidate.y}`, candidate);
            }
          }
          await this.refreshSurfaceConsumers(surfaceRevision, false, [...affected.values()]);
        }
      });
      const refresh = controller?.source === source ? controller.lifecycle.track(queued) : queued;
      this.worldTileUpdateQueue = refresh.catch(() => void 0);
      return refresh;
    }
    refreshTileOverrideRendering(point, source, loadRevision) {
      return this.refreshTileOverridesRendering([point], source, loadRevision);
    }
    async refreshTileOverridesRendering(points, source, loadRevision, refreshKind2 = "terrain") {
      const streamer = this.worldStreamer;
      if (!streamer || !this.isWorldSessionCurrent(source, loadRevision)) return;
      const residents = new Map(streamer.residentChunks.map((chunk) => [
        WorldStreamer.key(chunk.chunkX, chunk.chunkY),
        chunk
      ]));
      const affectedChunks = /* @__PURE__ */ new Map();
      const affectedTiles = /* @__PURE__ */ new Map();
      for (const point of points) {
        for (const affected of [point, ...getMapNeighbors(this.mapData, point.x, point.y)]) {
          affectedTiles.set(`${affected.x},${affected.y}`, affected);
        }
      }
      for (const affected of affectedTiles.values()) {
        const owner = source.resolveChunk(
          Math.floor(affected.x / source.chunkSize),
          Math.floor(affected.y / source.chunkSize)
        );
        if (!owner) continue;
        const key = WorldStreamer.key(owner.x, owner.y);
        const chunk = residents.get(key);
        if (chunk && this.worldChunkLayers.has(key)) affectedChunks.set(key, chunk);
      }
      if (affectedChunks.size === 0) return;
      const keys = [...affectedChunks.keys()].sort();
      if (!this.worldRenderLayers) {
        for (const key of keys) this.unmountWorldChunk(affectedChunks.get(key));
        for (const key of keys) this.mountWorldChunk(affectedChunks.get(key));
        this.updateWorldChunkVisibility();
        return;
      }
      const layers = this.worldRenderLayers.values();
      const refreshable = layers.filter((layer) => layer.refreshTiles && this.initializedWorldRenderLayers.has(layer.id));
      await Promise.all(refreshable.flatMap((layer) => keys.map(
        (key) => this.worldChunkLayers.get(key)?.renderLayerPromises?.get(layer.id)
      )));
      if (!this.isWorldSessionCurrent(source, loadRevision)) return;
      const remounted = layers.filter((layer) => !layer.refreshTiles && this.initializedWorldRenderLayers.has(layer.id));
      for (const layer of refreshable) {
        const handled = await layer.refreshTiles?.({
          ...this.createWorldRenderLayerHost(layer.id, "@world"),
          tiles: [...affectedTiles.values()],
          refreshKind: refreshKind2
        });
        if (!this.isWorldSessionCurrent(source, loadRevision)) return;
        if (handled === false) remounted.push(layer);
      }
      for (const key of keys) {
        const record = this.worldChunkLayers.get(key);
        if (!record) continue;
        const unmountErrors = [];
        for (const layer of [...remounted].reverse()) {
          unmountErrors.push(...this.unmountRegisteredWorldRenderLayer(layer, key, record));
        }
        this.reportWorldRenderLayerErrors(`failed to refresh render layers for chunk ${key}`, unmountErrors);
        record.revision = ++this.worldLayerRevision;
        record.vegetationAbort?.abort();
        record.vegetationAbort = void 0;
        record.vegetationPromise = void 0;
        for (const layer of remounted) {
          const mounted = this.mountRegisteredWorldRenderLayer(layer, key, record);
          record.renderLayerPromises ?? (record.renderLayerPromises = /* @__PURE__ */ new Map());
          record.renderLayerPromises.set(layer.id, mounted);
        }
      }
      const builds = [];
      for (const key of keys) {
        const record = this.worldChunkLayers.get(key);
        builds.push(record?.cityPromise, record?.forestPromise, ...record?.renderLayerPromises?.values() ?? []);
      }
      await Promise.all(builds);
      if (!this.isWorldSessionCurrent(source, loadRevision)) return;
      this.updateWorldChunkVisibility();
    }
    isWorldSessionCurrent(source, loadRevision) {
      return !this.disposed && this.worldSource === source && this.loadRevision === loadRevision;
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
    updateWorldDemand(dtS) {
      if (!this.worldStreamer || !this.worldSource) return;
      this.logicalTargetScratch.copy(this.controls.target);
      if (this.mapData.infinite) {
        this.logicalTargetScratch.x += this.renderOrigin.x;
        this.logicalTargetScratch.z += this.renderOrigin.y;
      }
      const currentX = this.logicalTargetScratch.x;
      const currentY = this.logicalTargetScratch.z;
      if (this.lastStreamingTarget && dtS > 0) {
        let dx = currentX - this.lastStreamingTarget.x;
        let dy = currentY - this.lastStreamingTarget.y;
        if (this.mapData.wrapX && this.worldPeriodX > 0) {
          if (dx > this.worldPeriodX / 2) dx -= this.worldPeriodX;
          else if (dx < -this.worldPeriodX / 2) dx += this.worldPeriodX;
        }
        if (this.mapData.wrapY && this.worldPeriodY > 0) {
          if (dy > this.worldPeriodY / 2) dy -= this.worldPeriodY;
          else if (dy < -this.worldPeriodY / 2) dy += this.worldPeriodY;
        }
        const alpha = 1 - Math.exp(-dtS / 0.25);
        this.streamingMotionScratch.set(dx / dtS, dy / dtS);
        this.streamingVelocity.lerp(this.streamingMotionScratch, alpha);
      }
      this.lastStreamingTarget ?? (this.lastStreamingTarget = new three.Vector2());
      this.lastStreamingTarget.set(currentX, currentY);
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
      let predictedTile;
      if (this.streamingPredictionSeconds > 0 && this.streamingPredictionMaxChunks > 0 && this.streamingVelocity.lengthSq() > 1) {
        const maxAhead = this.streamingPredictionMaxChunks * this.worldChunkSize * this.options.size * 1.5;
        const ahead = this.streamingAheadScratch.copy(this.streamingVelocity).multiplyScalar(this.streamingPredictionSeconds);
        if (ahead.length() > maxAhead) ahead.setLength(maxAhead);
        this.predictedTargetScratch.copy(this.logicalTargetScratch);
        this.predictedTargetScratch.x += ahead.x;
        this.predictedTargetScratch.z += ahead.y;
        predictedTile = pickTile(
          this.predictedTargetScratch,
          this.options.size,
          this.mapData.infinite ? void 0 : this.mapData.w,
          this.mapData.infinite ? void 0 : this.mapData.h,
          this.mapData.wrapX,
          this.mapData.wrapY
        ) ?? void 0;
      }
      const predictedChunk = predictedTile ? this.worldSource.resolveChunk(
        Math.floor(predictedTile.x / this.worldChunkSize),
        Math.floor(predictedTile.y / this.worldChunkSize)
      ) : void 0;
      const signature = `${key}>${predictedChunk ? WorldStreamer.key(predictedChunk.x, predictedChunk.y) : key}`;
      if (signature === this.worldDemandSignature) return;
      this.worldDemandChunkKey = key;
      this.worldDemandSignature = signature;
      const demand = this.worldController?.setCenterTile(tile.x, tile.y, predictedTile);
      if (!demand) return;
      void demand.catch((error) => {
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
      const terrainChanges = [];
      const grassChanges = /* @__PURE__ */ new Map();
      const forestChanges = /* @__PURE__ */ new Map();
      const enqueue = (batches, field2, change) => {
        if (!field2) return;
        const batch = batches.get(field2) ?? [];
        batch.push(change);
        batches.set(field2, batch);
      };
      for (const { x, y, state } of changes) {
        const change = { x, y, state };
        if (this.worldSource) {
          const resolved = this.worldSource.resolveChunk(
            Math.floor(x / this.worldChunkSize),
            Math.floor(y / this.worldChunkSize)
          );
          const record = resolved ? this.worldChunkLayers.get(WorldStreamer.key(resolved.x, resolved.y)) : void 0;
          if (!record) continue;
          terrainChanges.push(change);
          enqueue(grassChanges, record.grass, change);
          enqueue(forestChanges, record.forest, change);
        } else {
          terrainChanges.push(change);
          enqueue(grassChanges, this.grass, change);
          enqueue(forestChanges, this.forest, change);
        }
        renderedStates.set(`${x},${y}`, state);
      }
      this.terrain?.setFogStates(terrainChanges);
      for (const [field2, batch] of grassChanges) field2.setFogStates(batch);
      for (const [field2, batch] of forestChanges) field2.setFogStates(batch);
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
    get landBlendEnabled() {
      return this.terrain?.landBlendEnabled ?? this.options.landBlendEnabled;
    }
    set landBlendEnabled(value) {
      this.options.landBlendEnabled = value;
      if (this.terrain) this.terrain.landBlendEnabled = value;
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
      if (!Number.isFinite(value) || value < 0) {
        throw new RangeError("mountainHeight must be a non-negative finite number");
      }
      if (value === this.mountainHeight) return;
      this.options.mountainHeight = value;
      if (this.terrain) this.terrain.mountainHeight = value;
      else this.worldSurface?.setMountainHeight(value);
      const revision = this.worldSurface?.revision;
      if (revision !== void 0) {
        void this.refreshSurfaceConsumers(revision, true).catch((error) => {
          if (this.worldSurface?.revision === revision) this.emit("error", error);
        });
      }
    }
    get landformDebugMode() {
      return this.terrain?.landformDebugMode ?? this.options.landformDebugMode;
    }
    set landformDebugMode(value) {
      this.options.landformDebugMode = value;
      if (this.terrain) this.terrain.landformDebugMode = value;
    }
    get terrainTextureRegionSize() {
      return this.terrain?.terrainTextureRegionSize ?? this.options.terrainTextureRegionSize;
    }
    set terrainTextureRegionSize(value) {
      if (!Number.isFinite(value) || value <= 0) {
        throw new RangeError("terrainTextureRegionSize must be a positive finite number");
      }
      this.options.terrainTextureRegionSize = value;
      if (this.terrain) this.terrain.terrainTextureRegionSize = value;
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
      void this.rebuildForest().catch((error) => this.emit("error", error));
    }
    get treeScale() {
      return this.options.treeScale;
    }
    set treeScale(value) {
      if (!Number.isFinite(value) || value < 0) throw new RangeError("treeScale must be a non-negative finite number");
      this.options.treeScale = value;
      void this.rebuildForest().catch((error) => this.emit("error", error));
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
      void this.rebuildGrass().catch((error) => this.emit("error", error));
    }
    get grassBladeWidth() {
      return this.options.grassBladeWidth;
    }
    set grassBladeWidth(value) {
      if (!Number.isFinite(value) || value <= 0) throw new RangeError("grassBladeWidth must be a positive finite number");
      this.options.grassBladeWidth = value;
      void this.rebuildGrass().catch((error) => this.emit("error", error));
    }
    get grassBladeHeight() {
      return this.options.grassBladeHeight;
    }
    set grassBladeHeight(value) {
      if (!Number.isFinite(value) || value <= 0) throw new RangeError("grassBladeHeight must be a positive finite number");
      this.options.grassBladeHeight = value;
      void this.rebuildGrass().catch((error) => this.emit("error", error));
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
    /** Current logical-world height authority; available after a world is loaded. */
    get surface() {
      return this.worldSurface;
    }
    get streamingStats() {
      return this.chunkScheduler.stats;
    }
    get resourceBudget() {
      return this.chunkScheduler.resourceBudget;
    }
    createResourceAccount(label) {
      if (this.disposed) throw new Error("HexMap has been disposed");
      return this.chunkScheduler.createResourceAccount(label);
    }
    get worldStreamingStats() {
      return this.worldStreamer?.stats;
    }
    get worldChunkResidency() {
      return this.worldResidency;
    }
    get renderWorldController() {
      return this.worldController;
    }
    get frameTaskStats() {
      return this.frameTasks.stats;
    }
    get adaptiveStreamingStats() {
      return this.adaptiveStreamingController?.stats;
    }
    get gpuTimingStats() {
      return this.rendererHost.gpuTimingStats;
    }
    get webGlContextStats() {
      return this.rendererHost.contextStats;
    }
    get worldEditingStats() {
      return this.worldEditing?.stats;
    }
    get workCoordinator() {
      return this.runtimeWork;
    }
    get workStats() {
      return this.runtimeWork.stats;
    }
    get settled() {
      return Promise.all([...this.drainingWorldSessions]).then(() => void 0);
    }
    sampleAdaptiveStreaming(sample) {
      const profile = this.adaptiveStreamingController?.sample(sample);
      if (profile) this.applyAdaptiveStreamingProfile(profile);
      return profile;
    }
    drawRoutePath(path) {
      this.cleanRoutePath();
      if (path.length === 0) return;
      this.routePath = path.map((point) => ({ ...point }));
      let reference = this.getCameraTarget();
      const points = path.map((p) => {
        const center = this.nearestRepeatedCenter(p.x, p.y, reference);
        const point = new three.Vector3(
          center.x,
          (this.worldSurface?.getWorldHeight(center.x, center.y) ?? 0) + 1.1,
          center.y
        );
        reference = point;
        return point;
      });
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
      this.routePath = void 0;
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
    get interactionStats() {
      return this.interactions.stats;
    }
    getCameraTarget(target = new three.Vector3()) {
      target.copy(this.controls.target);
      target.x += this.renderOrigin.x;
      target.z += this.renderOrigin.y;
      return target;
    }
    setCameraTargetTile(x, y) {
      if (!this.mapData) throw new Error("A world must be loaded before moving the camera target");
      const point = normalizeMapCoordinates(this.mapData, x, y);
      if (!point) throw new RangeError("camera target tile is outside the world bounds");
      const center = getHexCenter(point.x, point.y, this.options.size);
      const current = this.getCameraTarget(this.logicalTargetScratch);
      const dx = center.x - current.x;
      const targetY = this.worldSurface?.getTileCenterHeight(point.x, point.y) ?? 0;
      const dy = targetY - current.y;
      const dz = center.y - current.z;
      this.camera.position.x += dx;
      this.camera.position.y += dy;
      this.camera.position.z += dz;
      this.controls.target.x += dx;
      this.controls.target.y += dy;
      this.controls.target.z += dz;
      this.controls.update();
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
      try {
        this.worldRenderLayers.dispose();
      } catch (reason) {
        const errors = reason instanceof WorldRenderLayerLifecycleError ? reason.errors : [renderLayerError(reason)];
        this.reportWorldRenderLayerErrors("world render layer registry failed to dispose", errors);
      }
      if (this.animationFrameId !== void 0) window.cancelAnimationFrame(this.animationFrameId);
      window.removeEventListener("resize", this.handleResize);
      this.resizeObserver?.disconnect();
      this.interactions.dispose();
      this.cleanRoutePath();
      this.clearWorldCopies();
      this.chunkScheduler.dispose();
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
      this.controls.dispose();
      this.rendererHost.dispose();
      this.frameTasks.dispose();
      this.runtimeWork.dispose();
      this.removeAllListeners();
    }
    async disposeAsync() {
      this.dispose();
      await this.settled;
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
        wrapY: false,
        surface: void 0
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
      this._unit.position.set(
        position.x,
        this.options.surface?.getWorldHeight(position.x, position.y) ?? 0,
        position.y
      );
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
        this._unit.position.set(
          center.x,
          this.options.surface?.getWorldHeight(center.x, center.y) ?? 0,
          center.y
        );
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
      }, this.unit.position, this.options.surface);
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
        newPosition.y = this.options.surface?.getWorldHeight(newPosition.x, newPosition.z) ?? 0;
        const tangent = this.pointsPath.getTangent(this.pathFraction);
        tangent.y = 0;
        tangent.normalize();
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
      this._unit.position.set(
        center.x,
        this.options.surface?.getWorldHeight(center.x, center.y) ?? 0,
        center.y
      );
      this.alignedCopyX = copyX;
      this.alignedCopyY = copyY;
      this.alignedTileX = this.options.x;
      this.alignedTileY = this.options.y;
    }
    refreshSurface() {
      if (!this._unit) return;
      this._unit.position.y = this.options.surface?.getWorldHeight(
        this._unit.position.x,
        this._unit.position.z
      ) ?? 0;
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
  function createContinuousHexPath(path, size, topology = {}, start, surface) {
    const periodX = topology.wrapX && topology.mapWidth ? topology.mapWidth * size * 1.5 : 0;
    const periodY = topology.wrapY && topology.mapHeight ? topology.mapHeight * size * Math.sqrt(3) : 0;
    const points = [];
    for (let index = 0; index < path.length; index++) {
      if (index === 0 && start) {
        const first = start.clone();
        first.y = surface?.getWorldHeight(first.x, first.z) ?? 0;
        points.push(first);
        continue;
      }
      const center = getHexCenter(path[index].x, path[index].y, size);
      const previous = points[index - 1];
      if (previous && periodX > 0) center.x += Math.round((previous.x - center.x) / periodX) * periodX;
      if (previous && periodY > 0) center.y += Math.round((previous.z - center.y) / periodY) * periodY;
      points.push(new three.Vector3(
        center.x,
        surface?.getWorldHeight(center.x, center.y) ?? 0,
        center.y
      ));
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
      if (map.infinite) {
        throw new RangeError("PathFinder supports finite maps only; use HierarchicalPathfinder for streaming infinite worlds");
      }
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
      this._map.on("surfacechange", () => {
        for (const unit of this._units) unit.refreshSurface();
      });
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
        wrapY: mapData.wrapY === true,
        surface: this._map.surface
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

  exports.AdaptiveStreamingController = AdaptiveStreamingController;
  exports.ChunkResidencyCoordinator = ChunkResidencyCoordinator;
  exports.DEFAULT_WORLD_GENERATION_CHUNK_SIZE = DEFAULT_WORLD_GENERATION_CHUNK_SIZE;
  exports.EventEmitter = EventEmitter;
  exports.FogOfWar = FogOfWar;
  exports.FogState = FogState;
  exports.FrameTaskScheduler = FrameTaskScheduler;
  exports.GameEngine = GameEngine;
  exports.HEXPolygon = HEXPolygon;
  exports.HexMap = HexMap;
  exports.HexMapInteractionController = HexMapInteractionController;
  exports.HexMapRendererHost = HexMapRendererHost;
  exports.IndexedDbWorldChunkCache = IndexedDbWorldChunkCache;
  exports.LANDFORM_SEA_LEVEL = LANDFORM_SEA_LEVEL;
  exports.Land = Land;
  exports.LandColor = LandColor;
  exports.LandPriority = LandPriority;
  exports.LifecycleDrainTimeoutError = LifecycleDrainTimeoutError;
  exports.LifecycleScope = LifecycleScope;
  exports.MAX_WORLD_GENERATION_CHUNK_SIZE = MAX_WORLD_GENERATION_CHUNK_SIZE;
  exports.MAX_WORLD_SIZE = MAX_WORLD_SIZE;
  exports.MIN_WORLD_SIZE = MIN_WORLD_SIZE;
  exports.NEIGHBOR_DIRECTIONS = NEIGHBOR_DIRECTIONS;
  exports.PathFinder = PathFinder;
  exports.PriorityTaskQueue = PriorityTaskQueue;
  exports.ProceduralWorldSource = ProceduralWorldSource;
  exports.RenderWorldController = RenderWorldController;
  exports.ResourceBudgetLedger = ResourceBudgetLedger;
  exports.RuntimeWorkCoordinator = RuntimeWorkCoordinator;
  exports.SparseWorldChunkStore = SparseWorldChunkStore;
  exports.StaticWorldSource = StaticWorldSource;
  exports.ToroidalWorldSource = ToroidalWorldSource;
  exports.Unit = Unit;
  exports.UnitActions = UnitActions;
  exports.WORLD_CHUNK_FORMAT_VERSION = WORLD_CHUNK_FORMAT_VERSION;
  exports.WORLD_CHUNK_PADDING = WORLD_CHUNK_PADDING;
  exports.WORLD_CHUNK_SIZE = WORLD_CHUNK_SIZE;
  exports.WORLD_DELTA_CHECKPOINT_FORMAT_VERSION = WORLD_DELTA_CHECKPOINT_FORMAT_VERSION;
  exports.WORLD_DESCRIPTOR_FORMAT_VERSION = WORLD_DESCRIPTOR_FORMAT_VERSION;
  exports.WORLD_GENERATOR_VERSION = WORLD_GENERATOR_VERSION;
  exports.WORLD_VEGETATION_FORMAT_VERSION = WORLD_VEGETATION_FORMAT_VERSION;
  exports.WORLD_WORKER_PROTOCOL_VERSION = WORLD_WORKER_PROTOCOL_VERSION;
  exports.WebGlGpuTimer = WebGlGpuTimer;
  exports.WorkQueueBackpressureError = WorkQueueBackpressureError;
  exports.WorldChunkMountQueue = WorldChunkMountQueue;
  exports.WorldEditingFacade = WorldEditingFacade;
  exports.WorldGeneratorClient = WorldGeneratorClient;
  exports.WorldGeneratorPool = WorldGeneratorPool;
  exports.WorldRenderLayerRegistry = WorldRenderLayerRegistry;
  exports.WorldStreamer = WorldStreamer;
  exports.assertPackedWorldChunk = assertPackedWorldChunk;
  exports.assertSupportedWorldGeneratorVersion = assertSupportedWorldGeneratorVersion;
  exports.assertWorldChunk = assertWorldChunk;
  exports.assertWorldDescriptor = assertWorldDescriptor;
  exports.assertWorldSource = assertWorldSource;
  exports.assertWorldTileOverride = assertWorldTileOverride;
  exports.assertWorldVegetationLayout = assertWorldVegetationLayout;
  exports.clearWorldChunkCache = clearWorldChunkCache;
  exports.commitBufferAttributeRanges = commitBufferAttributeRanges;
  exports.createLandformSampler = createLandformSampler;
  exports.createWorldChunkCacheKey = createWorldChunkCacheKey;
  exports.createWorldDescriptor = createWorldDescriptor;
  exports.createWorldVegetationMapSnapshot = createWorldVegetationMapSnapshot;
  exports.decodeWorldChunkTile = decodeWorldChunkTile;
  exports.estimateBufferGeometriesBytes = estimateBufferGeometriesBytes;
  exports.estimateBufferGeometriesResourceBytes = estimateBufferGeometriesResourceBytes;
  exports.estimateObject3DResourceCost = estimateObject3DResourceCost;
  exports.generateWorld = generateWorld;
  exports.generateWorldChunk = generateWorldChunk;
  exports.generateWorldVegetation = generateWorldVegetation;
  exports.getChunkResidencyCoordinator = getChunkResidencyCoordinator;
  exports.getHexCenter = getHexCenter;
  exports.getMapNeighbors = getMapNeighbors;
  exports.getMapTile = getMapTile;
  exports.getNeighborCoords = getNeighborCoords;
  exports.getNeighbors = getNeighbors;
  exports.getWorldChunkBounds = getWorldChunkBounds;
  exports.getWorldChunkCorePoints = getWorldChunkCorePoints;
  exports.getWorldChunkMetadata = getWorldChunkMetadata;
  exports.getWorldSourceTile = getWorldSourceTile;
  exports.groupTilesByWorldChunk = groupTilesByWorldChunk;
  exports.isMutableWorldSource = isMutableWorldSource;
  exports.isWorldVegetationSource = isWorldVegetationSource;
  exports.lifecycleAbortError = lifecycleAbortError;
  exports.mergeBufferUpdateRanges = mergeBufferUpdateRanges;
  exports.normalizeMapCoordinates = normalizeMapCoordinates;
  exports.normalizeResourceCost = normalizeResourceCost;
  exports.packedChunkFromWorldChunk = packedChunkFromWorldChunk;
  exports.positiveModulo = positiveModulo;
  exports.sampleLandform = sampleLandform;
  exports.serializeWorldDescriptor = serializeWorldDescriptor;
  exports.tagWorldChunk = tagWorldChunk;
  exports.worldDescriptorsEqual = worldDescriptorsEqual;
  exports.worldTileVisualSignature = worldTileVisualSignature;
  exports.worldVegetationTransferables = worldVegetationTransferables;

}));
//# sourceMappingURL=hex-map.global.js.map
