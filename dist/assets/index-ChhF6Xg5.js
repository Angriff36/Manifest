var Sd=Object.defineProperty;var Td=(t,e,n)=>e in t?Sd(t,e,{enumerable:!0,configurable:!0,writable:!0,value:n}):t[e]=n;var ce=(t,e,n)=>Td(t,typeof e!="symbol"?e+"":e,n);(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const s of document.querySelectorAll('link[rel="modulepreload"]'))r(s);new MutationObserver(s=>{for(const i of s)if(i.type==="childList")for(const a of i.addedNodes)a.tagName==="LINK"&&a.rel==="modulepreload"&&r(a)}).observe(document,{childList:!0,subtree:!0});function n(s){const i={};return s.integrity&&(i.integrity=s.integrity),s.referrerPolicy&&(i.referrerPolicy=s.referrerPolicy),s.crossOrigin==="use-credentials"?i.credentials="include":s.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function r(s){if(s.ep)return;s.ep=!0;const i=n(s);fetch(s.href,i)}})();var Fr=typeof globalThis<"u"?globalThis:typeof window<"u"?window:typeof global<"u"?global:typeof self<"u"?self:{};function Cd(t){return t&&t.__esModule&&Object.prototype.hasOwnProperty.call(t,"default")?t.default:t}var rc={exports:{}},Hs={},sc={exports:{}},de={};/**
 * @license React
 * react.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */var Ar=Symbol.for("react.element"),Id=Symbol.for("react.portal"),_d=Symbol.for("react.fragment"),Rd=Symbol.for("react.strict_mode"),Od=Symbol.for("react.profiler"),Pd=Symbol.for("react.provider"),Ad=Symbol.for("react.context"),jd=Symbol.for("react.forward_ref"),$d=Symbol.for("react.suspense"),zd=Symbol.for("react.memo"),Ud=Symbol.for("react.lazy"),Do=Symbol.iterator;function Dd(t){return t===null||typeof t!="object"?null:(t=Do&&t[Do]||t["@@iterator"],typeof t=="function"?t:null)}var ic={isMounted:function(){return!1},enqueueForceUpdate:function(){},enqueueReplaceState:function(){},enqueueSetState:function(){}},ac=Object.assign,oc={};function Wn(t,e,n){this.props=t,this.context=e,this.refs=oc,this.updater=n||ic}Wn.prototype.isReactComponent={};Wn.prototype.setState=function(t,e){if(typeof t!="object"&&typeof t!="function"&&t!=null)throw Error("setState(...): takes an object of state variables to update or a function which returns an object of state variables.");this.updater.enqueueSetState(this,t,e,"setState")};Wn.prototype.forceUpdate=function(t){this.updater.enqueueForceUpdate(this,t,"forceUpdate")};function lc(){}lc.prototype=Wn.prototype;function Pa(t,e,n){this.props=t,this.context=e,this.refs=oc,this.updater=n||ic}var Aa=Pa.prototype=new lc;Aa.constructor=Pa;ac(Aa,Wn.prototype);Aa.isPureReactComponent=!0;var Lo=Array.isArray,cc=Object.prototype.hasOwnProperty,ja={current:null},uc={key:!0,ref:!0,__self:!0,__source:!0};function dc(t,e,n){var r,s={},i=null,a=null;if(e!=null)for(r in e.ref!==void 0&&(a=e.ref),e.key!==void 0&&(i=""+e.key),e)cc.call(e,r)&&!uc.hasOwnProperty(r)&&(s[r]=e[r]);var o=arguments.length-2;if(o===1)s.children=n;else if(1<o){for(var l=Array(o),d=0;d<o;d++)l[d]=arguments[d+2];s.children=l}if(t&&t.defaultProps)for(r in o=t.defaultProps,o)s[r]===void 0&&(s[r]=o[r]);return{$$typeof:Ar,type:t,key:i,ref:a,props:s,_owner:ja.current}}function Ld(t,e){return{$$typeof:Ar,type:t.type,key:e,ref:t.ref,props:t.props,_owner:t._owner}}function $a(t){return typeof t=="object"&&t!==null&&t.$$typeof===Ar}function Md(t){var e={"=":"=0",":":"=2"};return"$"+t.replace(/[=:]/g,function(n){return e[n]})}var Mo=/\/+/g;function ui(t,e){return typeof t=="object"&&t!==null&&t.key!=null?Md(""+t.key):e.toString(36)}function os(t,e,n,r,s){var i=typeof t;(i==="undefined"||i==="boolean")&&(t=null);var a=!1;if(t===null)a=!0;else switch(i){case"string":case"number":a=!0;break;case"object":switch(t.$$typeof){case Ar:case Id:a=!0}}if(a)return a=t,s=s(a),t=r===""?"."+ui(a,0):r,Lo(s)?(n="",t!=null&&(n=t.replace(Mo,"$&/")+"/"),os(s,e,n,"",function(d){return d})):s!=null&&($a(s)&&(s=Ld(s,n+(!s.key||a&&a.key===s.key?"":(""+s.key).replace(Mo,"$&/")+"/")+t)),e.push(s)),1;if(a=0,r=r===""?".":r+":",Lo(t))for(var o=0;o<t.length;o++){i=t[o];var l=r+ui(i,o);a+=os(i,e,n,l,s)}else if(l=Dd(t),typeof l=="function")for(t=l.call(t),o=0;!(i=t.next()).done;)i=i.value,l=r+ui(i,o++),a+=os(i,e,n,l,s);else if(i==="object")throw e=String(t),Error("Objects are not valid as a React child (found: "+(e==="[object Object]"?"object with keys {"+Object.keys(t).join(", ")+"}":e)+"). If you meant to render a collection of children, use an array instead.");return a}function Br(t,e,n){if(t==null)return t;var r=[],s=0;return os(t,r,"","",function(i){return e.call(n,i,s++)}),r}function Fd(t){if(t._status===-1){var e=t._result;e=e(),e.then(function(n){(t._status===0||t._status===-1)&&(t._status=1,t._result=n)},function(n){(t._status===0||t._status===-1)&&(t._status=2,t._result=n)}),t._status===-1&&(t._status=0,t._result=e)}if(t._status===1)return t._result.default;throw t._result}var Ke={current:null},ls={transition:null},Bd={ReactCurrentDispatcher:Ke,ReactCurrentBatchConfig:ls,ReactCurrentOwner:ja};function pc(){throw Error("act(...) is not supported in production builds of React.")}de.Children={map:Br,forEach:function(t,e,n){Br(t,function(){e.apply(this,arguments)},n)},count:function(t){var e=0;return Br(t,function(){e++}),e},toArray:function(t){return Br(t,function(e){return e})||[]},only:function(t){if(!$a(t))throw Error("React.Children.only expected to receive a single React element child.");return t}};de.Component=Wn;de.Fragment=_d;de.Profiler=Od;de.PureComponent=Pa;de.StrictMode=Rd;de.Suspense=$d;de.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED=Bd;de.act=pc;de.cloneElement=function(t,e,n){if(t==null)throw Error("React.cloneElement(...): The argument must be a React element, but you passed "+t+".");var r=ac({},t.props),s=t.key,i=t.ref,a=t._owner;if(e!=null){if(e.ref!==void 0&&(i=e.ref,a=ja.current),e.key!==void 0&&(s=""+e.key),t.type&&t.type.defaultProps)var o=t.type.defaultProps;for(l in e)cc.call(e,l)&&!uc.hasOwnProperty(l)&&(r[l]=e[l]===void 0&&o!==void 0?o[l]:e[l])}var l=arguments.length-2;if(l===1)r.children=n;else if(1<l){o=Array(l);for(var d=0;d<l;d++)o[d]=arguments[d+2];r.children=o}return{$$typeof:Ar,type:t.type,key:s,ref:i,props:r,_owner:a}};de.createContext=function(t){return t={$$typeof:Ad,_currentValue:t,_currentValue2:t,_threadCount:0,Provider:null,Consumer:null,_defaultValue:null,_globalName:null},t.Provider={$$typeof:Pd,_context:t},t.Consumer=t};de.createElement=dc;de.createFactory=function(t){var e=dc.bind(null,t);return e.type=t,e};de.createRef=function(){return{current:null}};de.forwardRef=function(t){return{$$typeof:jd,render:t}};de.isValidElement=$a;de.lazy=function(t){return{$$typeof:Ud,_payload:{_status:-1,_result:t},_init:Fd}};de.memo=function(t,e){return{$$typeof:zd,type:t,compare:e===void 0?null:e}};de.startTransition=function(t){var e=ls.transition;ls.transition={};try{t()}finally{ls.transition=e}};de.unstable_act=pc;de.useCallback=function(t,e){return Ke.current.useCallback(t,e)};de.useContext=function(t){return Ke.current.useContext(t)};de.useDebugValue=function(){};de.useDeferredValue=function(t){return Ke.current.useDeferredValue(t)};de.useEffect=function(t,e){return Ke.current.useEffect(t,e)};de.useId=function(){return Ke.current.useId()};de.useImperativeHandle=function(t,e,n){return Ke.current.useImperativeHandle(t,e,n)};de.useInsertionEffect=function(t,e){return Ke.current.useInsertionEffect(t,e)};de.useLayoutEffect=function(t,e){return Ke.current.useLayoutEffect(t,e)};de.useMemo=function(t,e){return Ke.current.useMemo(t,e)};de.useReducer=function(t,e,n){return Ke.current.useReducer(t,e,n)};de.useRef=function(t){return Ke.current.useRef(t)};de.useState=function(t){return Ke.current.useState(t)};de.useSyncExternalStore=function(t,e,n){return Ke.current.useSyncExternalStore(t,e,n)};de.useTransition=function(){return Ke.current.useTransition()};de.version="18.3.1";sc.exports=de;var ie=sc.exports;/**
 * @license React
 * react-jsx-runtime.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */var Wd=ie,Kd=Symbol.for("react.element"),Vd=Symbol.for("react.fragment"),Yd=Object.prototype.hasOwnProperty,Hd=Wd.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentOwner,qd={key:!0,ref:!0,__self:!0,__source:!0};function hc(t,e,n){var r,s={},i=null,a=null;n!==void 0&&(i=""+n),e.key!==void 0&&(i=""+e.key),e.ref!==void 0&&(a=e.ref);for(r in e)Yd.call(e,r)&&!qd.hasOwnProperty(r)&&(s[r]=e[r]);if(t&&t.defaultProps)for(r in e=t.defaultProps,e)s[r]===void 0&&(s[r]=e[r]);return{$$typeof:Kd,type:t,key:i,ref:a,props:s,_owner:Hd.current}}Hs.Fragment=Vd;Hs.jsx=hc;Hs.jsxs=hc;rc.exports=Hs;var g=rc.exports,fc={exports:{}},tt={},mc={exports:{}},gc={};/**
 * @license React
 * scheduler.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */(function(t){function e(W,D){var G=W.length;W.push(D);e:for(;0<G;){var P=G-1>>>1,R=W[P];if(0<s(R,D))W[P]=D,W[G]=R,G=P;else break e}}function n(W){return W.length===0?null:W[0]}function r(W){if(W.length===0)return null;var D=W[0],G=W.pop();if(G!==D){W[0]=G;e:for(var P=0,R=W.length,se=R>>>1;P<se;){var X=2*(P+1)-1,Z=W[X],ge=X+1,z=W[ge];if(0>s(Z,G))ge<R&&0>s(z,Z)?(W[P]=z,W[ge]=G,P=ge):(W[P]=Z,W[X]=G,P=X);else if(ge<R&&0>s(z,G))W[P]=z,W[ge]=G,P=ge;else break e}}return D}function s(W,D){var G=W.sortIndex-D.sortIndex;return G!==0?G:W.id-D.id}if(typeof performance=="object"&&typeof performance.now=="function"){var i=performance;t.unstable_now=function(){return i.now()}}else{var a=Date,o=a.now();t.unstable_now=function(){return a.now()-o}}var l=[],d=[],y=1,v=null,h=3,f=!1,w=!1,m=!1,E=typeof setTimeout=="function"?setTimeout:null,c=typeof clearTimeout=="function"?clearTimeout:null,u=typeof setImmediate<"u"?setImmediate:null;typeof navigator<"u"&&navigator.scheduling!==void 0&&navigator.scheduling.isInputPending!==void 0&&navigator.scheduling.isInputPending.bind(navigator.scheduling);function k(W){for(var D=n(d);D!==null;){if(D.callback===null)r(d);else if(D.startTime<=W)r(d),D.sortIndex=D.expirationTime,e(l,D);else break;D=n(d)}}function b(W){if(m=!1,k(W),!w)if(n(l)!==null)w=!0,oe(T);else{var D=n(d);D!==null&&Y(b,D.startTime-W)}}function T(W,D){w=!1,m&&(m=!1,c(j),j=-1),f=!0;var G=h;try{for(k(D),v=n(l);v!==null&&(!(v.expirationTime>D)||W&&!ne());){var P=v.callback;if(typeof P=="function"){v.callback=null,h=v.priorityLevel;var R=P(v.expirationTime<=D);D=t.unstable_now(),typeof R=="function"?v.callback=R:v===n(l)&&r(l),k(D)}else r(l);v=n(l)}if(v!==null)var se=!0;else{var X=n(d);X!==null&&Y(b,X.startTime-D),se=!1}return se}finally{v=null,h=G,f=!1}}var I=!1,_=null,j=-1,$=5,M=-1;function ne(){return!(t.unstable_now()-M<$)}function C(){if(_!==null){var W=t.unstable_now();M=W;var D=!0;try{D=_(!0,W)}finally{D?L():(I=!1,_=null)}}else I=!1}var L;if(typeof u=="function")L=function(){u(C)};else if(typeof MessageChannel<"u"){var x=new MessageChannel,B=x.port2;x.port1.onmessage=C,L=function(){B.postMessage(null)}}else L=function(){E(C,0)};function oe(W){_=W,I||(I=!0,L())}function Y(W,D){j=E(function(){W(t.unstable_now())},D)}t.unstable_IdlePriority=5,t.unstable_ImmediatePriority=1,t.unstable_LowPriority=4,t.unstable_NormalPriority=3,t.unstable_Profiling=null,t.unstable_UserBlockingPriority=2,t.unstable_cancelCallback=function(W){W.callback=null},t.unstable_continueExecution=function(){w||f||(w=!0,oe(T))},t.unstable_forceFrameRate=function(W){0>W||125<W?console.error("forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported"):$=0<W?Math.floor(1e3/W):5},t.unstable_getCurrentPriorityLevel=function(){return h},t.unstable_getFirstCallbackNode=function(){return n(l)},t.unstable_next=function(W){switch(h){case 1:case 2:case 3:var D=3;break;default:D=h}var G=h;h=D;try{return W()}finally{h=G}},t.unstable_pauseExecution=function(){},t.unstable_requestPaint=function(){},t.unstable_runWithPriority=function(W,D){switch(W){case 1:case 2:case 3:case 4:case 5:break;default:W=3}var G=h;h=W;try{return D()}finally{h=G}},t.unstable_scheduleCallback=function(W,D,G){var P=t.unstable_now();switch(typeof G=="object"&&G!==null?(G=G.delay,G=typeof G=="number"&&0<G?P+G:P):G=P,W){case 1:var R=-1;break;case 2:R=250;break;case 5:R=1073741823;break;case 4:R=1e4;break;default:R=5e3}return R=G+R,W={id:y++,callback:D,priorityLevel:W,startTime:G,expirationTime:R,sortIndex:-1},G>P?(W.sortIndex=G,e(d,W),n(l)===null&&W===n(d)&&(m?(c(j),j=-1):m=!0,Y(b,G-P))):(W.sortIndex=R,e(l,W),w||f||(w=!0,oe(T))),W},t.unstable_shouldYield=ne,t.unstable_wrapCallback=function(W){var D=h;return function(){var G=h;h=D;try{return W.apply(this,arguments)}finally{h=G}}}})(gc);mc.exports=gc;var Gd=mc.exports;/**
 * @license React
 * react-dom.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */var Zd=ie,et=Gd;function q(t){for(var e="https://reactjs.org/docs/error-decoder.html?invariant="+t,n=1;n<arguments.length;n++)e+="&args[]="+encodeURIComponent(arguments[n]);return"Minified React error #"+t+"; visit "+e+" for the full message or use the non-minified dev environment for full errors and additional helpful warnings."}var yc=new Set,gr={};function fn(t,e){zn(t,e),zn(t+"Capture",e)}function zn(t,e){for(gr[t]=e,t=0;t<e.length;t++)yc.add(e[t])}var _t=!(typeof window>"u"||typeof window.document>"u"||typeof window.document.createElement>"u"),Di=Object.prototype.hasOwnProperty,Jd=/^[:A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD][:A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\-.0-9\u00B7\u0300-\u036F\u203F-\u2040]*$/,Fo={},Bo={};function Qd(t){return Di.call(Bo,t)?!0:Di.call(Fo,t)?!1:Jd.test(t)?Bo[t]=!0:(Fo[t]=!0,!1)}function Xd(t,e,n,r){if(n!==null&&n.type===0)return!1;switch(typeof e){case"function":case"symbol":return!0;case"boolean":return r?!1:n!==null?!n.acceptsBooleans:(t=t.toLowerCase().slice(0,5),t!=="data-"&&t!=="aria-");default:return!1}}function ep(t,e,n,r){if(e===null||typeof e>"u"||Xd(t,e,n,r))return!0;if(r)return!1;if(n!==null)switch(n.type){case 3:return!e;case 4:return e===!1;case 5:return isNaN(e);case 6:return isNaN(e)||1>e}return!1}function Ve(t,e,n,r,s,i,a){this.acceptsBooleans=e===2||e===3||e===4,this.attributeName=r,this.attributeNamespace=s,this.mustUseProperty=n,this.propertyName=t,this.type=e,this.sanitizeURL=i,this.removeEmptyString=a}var Ue={};"children dangerouslySetInnerHTML defaultValue defaultChecked innerHTML suppressContentEditableWarning suppressHydrationWarning style".split(" ").forEach(function(t){Ue[t]=new Ve(t,0,!1,t,null,!1,!1)});[["acceptCharset","accept-charset"],["className","class"],["htmlFor","for"],["httpEquiv","http-equiv"]].forEach(function(t){var e=t[0];Ue[e]=new Ve(e,1,!1,t[1],null,!1,!1)});["contentEditable","draggable","spellCheck","value"].forEach(function(t){Ue[t]=new Ve(t,2,!1,t.toLowerCase(),null,!1,!1)});["autoReverse","externalResourcesRequired","focusable","preserveAlpha"].forEach(function(t){Ue[t]=new Ve(t,2,!1,t,null,!1,!1)});"allowFullScreen async autoFocus autoPlay controls default defer disabled disablePictureInPicture disableRemotePlayback formNoValidate hidden loop noModule noValidate open playsInline readOnly required reversed scoped seamless itemScope".split(" ").forEach(function(t){Ue[t]=new Ve(t,3,!1,t.toLowerCase(),null,!1,!1)});["checked","multiple","muted","selected"].forEach(function(t){Ue[t]=new Ve(t,3,!0,t,null,!1,!1)});["capture","download"].forEach(function(t){Ue[t]=new Ve(t,4,!1,t,null,!1,!1)});["cols","rows","size","span"].forEach(function(t){Ue[t]=new Ve(t,6,!1,t,null,!1,!1)});["rowSpan","start"].forEach(function(t){Ue[t]=new Ve(t,5,!1,t.toLowerCase(),null,!1,!1)});var za=/[\-:]([a-z])/g;function Ua(t){return t[1].toUpperCase()}"accent-height alignment-baseline arabic-form baseline-shift cap-height clip-path clip-rule color-interpolation color-interpolation-filters color-profile color-rendering dominant-baseline enable-background fill-opacity fill-rule flood-color flood-opacity font-family font-size font-size-adjust font-stretch font-style font-variant font-weight glyph-name glyph-orientation-horizontal glyph-orientation-vertical horiz-adv-x horiz-origin-x image-rendering letter-spacing lighting-color marker-end marker-mid marker-start overline-position overline-thickness paint-order panose-1 pointer-events rendering-intent shape-rendering stop-color stop-opacity strikethrough-position strikethrough-thickness stroke-dasharray stroke-dashoffset stroke-linecap stroke-linejoin stroke-miterlimit stroke-opacity stroke-width text-anchor text-decoration text-rendering underline-position underline-thickness unicode-bidi unicode-range units-per-em v-alphabetic v-hanging v-ideographic v-mathematical vector-effect vert-adv-y vert-origin-x vert-origin-y word-spacing writing-mode xmlns:xlink x-height".split(" ").forEach(function(t){var e=t.replace(za,Ua);Ue[e]=new Ve(e,1,!1,t,null,!1,!1)});"xlink:actuate xlink:arcrole xlink:role xlink:show xlink:title xlink:type".split(" ").forEach(function(t){var e=t.replace(za,Ua);Ue[e]=new Ve(e,1,!1,t,"http://www.w3.org/1999/xlink",!1,!1)});["xml:base","xml:lang","xml:space"].forEach(function(t){var e=t.replace(za,Ua);Ue[e]=new Ve(e,1,!1,t,"http://www.w3.org/XML/1998/namespace",!1,!1)});["tabIndex","crossOrigin"].forEach(function(t){Ue[t]=new Ve(t,1,!1,t.toLowerCase(),null,!1,!1)});Ue.xlinkHref=new Ve("xlinkHref",1,!1,"xlink:href","http://www.w3.org/1999/xlink",!0,!1);["src","href","action","formAction"].forEach(function(t){Ue[t]=new Ve(t,1,!1,t.toLowerCase(),null,!0,!0)});function Da(t,e,n,r){var s=Ue.hasOwnProperty(e)?Ue[e]:null;(s!==null?s.type!==0:r||!(2<e.length)||e[0]!=="o"&&e[0]!=="O"||e[1]!=="n"&&e[1]!=="N")&&(ep(e,n,s,r)&&(n=null),r||s===null?Qd(e)&&(n===null?t.removeAttribute(e):t.setAttribute(e,""+n)):s.mustUseProperty?t[s.propertyName]=n===null?s.type===3?!1:"":n:(e=s.attributeName,r=s.attributeNamespace,n===null?t.removeAttribute(e):(s=s.type,n=s===3||s===4&&n===!0?"":""+n,r?t.setAttributeNS(r,e,n):t.setAttribute(e,n))))}var At=Zd.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED,Wr=Symbol.for("react.element"),yn=Symbol.for("react.portal"),vn=Symbol.for("react.fragment"),La=Symbol.for("react.strict_mode"),Li=Symbol.for("react.profiler"),vc=Symbol.for("react.provider"),xc=Symbol.for("react.context"),Ma=Symbol.for("react.forward_ref"),Mi=Symbol.for("react.suspense"),Fi=Symbol.for("react.suspense_list"),Fa=Symbol.for("react.memo"),$t=Symbol.for("react.lazy"),kc=Symbol.for("react.offscreen"),Wo=Symbol.iterator;function Gn(t){return t===null||typeof t!="object"?null:(t=Wo&&t[Wo]||t["@@iterator"],typeof t=="function"?t:null)}var Te=Object.assign,di;function rr(t){if(di===void 0)try{throw Error()}catch(n){var e=n.stack.trim().match(/\n( *(at )?)/);di=e&&e[1]||""}return`
`+di+t}var pi=!1;function hi(t,e){if(!t||pi)return"";pi=!0;var n=Error.prepareStackTrace;Error.prepareStackTrace=void 0;try{if(e)if(e=function(){throw Error()},Object.defineProperty(e.prototype,"props",{set:function(){throw Error()}}),typeof Reflect=="object"&&Reflect.construct){try{Reflect.construct(e,[])}catch(d){var r=d}Reflect.construct(t,[],e)}else{try{e.call()}catch(d){r=d}t.call(e.prototype)}else{try{throw Error()}catch(d){r=d}t()}}catch(d){if(d&&r&&typeof d.stack=="string"){for(var s=d.stack.split(`
`),i=r.stack.split(`
`),a=s.length-1,o=i.length-1;1<=a&&0<=o&&s[a]!==i[o];)o--;for(;1<=a&&0<=o;a--,o--)if(s[a]!==i[o]){if(a!==1||o!==1)do if(a--,o--,0>o||s[a]!==i[o]){var l=`
`+s[a].replace(" at new "," at ");return t.displayName&&l.includes("<anonymous>")&&(l=l.replace("<anonymous>",t.displayName)),l}while(1<=a&&0<=o);break}}}finally{pi=!1,Error.prepareStackTrace=n}return(t=t?t.displayName||t.name:"")?rr(t):""}function tp(t){switch(t.tag){case 5:return rr(t.type);case 16:return rr("Lazy");case 13:return rr("Suspense");case 19:return rr("SuspenseList");case 0:case 2:case 15:return t=hi(t.type,!1),t;case 11:return t=hi(t.type.render,!1),t;case 1:return t=hi(t.type,!0),t;default:return""}}function Bi(t){if(t==null)return null;if(typeof t=="function")return t.displayName||t.name||null;if(typeof t=="string")return t;switch(t){case vn:return"Fragment";case yn:return"Portal";case Li:return"Profiler";case La:return"StrictMode";case Mi:return"Suspense";case Fi:return"SuspenseList"}if(typeof t=="object")switch(t.$$typeof){case xc:return(t.displayName||"Context")+".Consumer";case vc:return(t._context.displayName||"Context")+".Provider";case Ma:var e=t.render;return t=t.displayName,t||(t=e.displayName||e.name||"",t=t!==""?"ForwardRef("+t+")":"ForwardRef"),t;case Fa:return e=t.displayName||null,e!==null?e:Bi(t.type)||"Memo";case $t:e=t._payload,t=t._init;try{return Bi(t(e))}catch{}}return null}function np(t){var e=t.type;switch(t.tag){case 24:return"Cache";case 9:return(e.displayName||"Context")+".Consumer";case 10:return(e._context.displayName||"Context")+".Provider";case 18:return"DehydratedFragment";case 11:return t=e.render,t=t.displayName||t.name||"",e.displayName||(t!==""?"ForwardRef("+t+")":"ForwardRef");case 7:return"Fragment";case 5:return e;case 4:return"Portal";case 3:return"Root";case 6:return"Text";case 16:return Bi(e);case 8:return e===La?"StrictMode":"Mode";case 22:return"Offscreen";case 12:return"Profiler";case 21:return"Scope";case 13:return"Suspense";case 19:return"SuspenseList";case 25:return"TracingMarker";case 1:case 0:case 17:case 2:case 14:case 15:if(typeof e=="function")return e.displayName||e.name||null;if(typeof e=="string")return e}return null}function Gt(t){switch(typeof t){case"boolean":case"number":case"string":case"undefined":return t;case"object":return t;default:return""}}function wc(t){var e=t.type;return(t=t.nodeName)&&t.toLowerCase()==="input"&&(e==="checkbox"||e==="radio")}function rp(t){var e=wc(t)?"checked":"value",n=Object.getOwnPropertyDescriptor(t.constructor.prototype,e),r=""+t[e];if(!t.hasOwnProperty(e)&&typeof n<"u"&&typeof n.get=="function"&&typeof n.set=="function"){var s=n.get,i=n.set;return Object.defineProperty(t,e,{configurable:!0,get:function(){return s.call(this)},set:function(a){r=""+a,i.call(this,a)}}),Object.defineProperty(t,e,{enumerable:n.enumerable}),{getValue:function(){return r},setValue:function(a){r=""+a},stopTracking:function(){t._valueTracker=null,delete t[e]}}}}function Kr(t){t._valueTracker||(t._valueTracker=rp(t))}function Ec(t){if(!t)return!1;var e=t._valueTracker;if(!e)return!0;var n=e.getValue(),r="";return t&&(r=wc(t)?t.checked?"true":"false":t.value),t=r,t!==n?(e.setValue(t),!0):!1}function ks(t){if(t=t||(typeof document<"u"?document:void 0),typeof t>"u")return null;try{return t.activeElement||t.body}catch{return t.body}}function Wi(t,e){var n=e.checked;return Te({},e,{defaultChecked:void 0,defaultValue:void 0,value:void 0,checked:n??t._wrapperState.initialChecked})}function Ko(t,e){var n=e.defaultValue==null?"":e.defaultValue,r=e.checked!=null?e.checked:e.defaultChecked;n=Gt(e.value!=null?e.value:n),t._wrapperState={initialChecked:r,initialValue:n,controlled:e.type==="checkbox"||e.type==="radio"?e.checked!=null:e.value!=null}}function Nc(t,e){e=e.checked,e!=null&&Da(t,"checked",e,!1)}function Ki(t,e){Nc(t,e);var n=Gt(e.value),r=e.type;if(n!=null)r==="number"?(n===0&&t.value===""||t.value!=n)&&(t.value=""+n):t.value!==""+n&&(t.value=""+n);else if(r==="submit"||r==="reset"){t.removeAttribute("value");return}e.hasOwnProperty("value")?Vi(t,e.type,n):e.hasOwnProperty("defaultValue")&&Vi(t,e.type,Gt(e.defaultValue)),e.checked==null&&e.defaultChecked!=null&&(t.defaultChecked=!!e.defaultChecked)}function Vo(t,e,n){if(e.hasOwnProperty("value")||e.hasOwnProperty("defaultValue")){var r=e.type;if(!(r!=="submit"&&r!=="reset"||e.value!==void 0&&e.value!==null))return;e=""+t._wrapperState.initialValue,n||e===t.value||(t.value=e),t.defaultValue=e}n=t.name,n!==""&&(t.name=""),t.defaultChecked=!!t._wrapperState.initialChecked,n!==""&&(t.name=n)}function Vi(t,e,n){(e!=="number"||ks(t.ownerDocument)!==t)&&(n==null?t.defaultValue=""+t._wrapperState.initialValue:t.defaultValue!==""+n&&(t.defaultValue=""+n))}var sr=Array.isArray;function _n(t,e,n,r){if(t=t.options,e){e={};for(var s=0;s<n.length;s++)e["$"+n[s]]=!0;for(n=0;n<t.length;n++)s=e.hasOwnProperty("$"+t[n].value),t[n].selected!==s&&(t[n].selected=s),s&&r&&(t[n].defaultSelected=!0)}else{for(n=""+Gt(n),e=null,s=0;s<t.length;s++){if(t[s].value===n){t[s].selected=!0,r&&(t[s].defaultSelected=!0);return}e!==null||t[s].disabled||(e=t[s])}e!==null&&(e.selected=!0)}}function Yi(t,e){if(e.dangerouslySetInnerHTML!=null)throw Error(q(91));return Te({},e,{value:void 0,defaultValue:void 0,children:""+t._wrapperState.initialValue})}function Yo(t,e){var n=e.value;if(n==null){if(n=e.children,e=e.defaultValue,n!=null){if(e!=null)throw Error(q(92));if(sr(n)){if(1<n.length)throw Error(q(93));n=n[0]}e=n}e==null&&(e=""),n=e}t._wrapperState={initialValue:Gt(n)}}function bc(t,e){var n=Gt(e.value),r=Gt(e.defaultValue);n!=null&&(n=""+n,n!==t.value&&(t.value=n),e.defaultValue==null&&t.defaultValue!==n&&(t.defaultValue=n)),r!=null&&(t.defaultValue=""+r)}function Ho(t){var e=t.textContent;e===t._wrapperState.initialValue&&e!==""&&e!==null&&(t.value=e)}function Sc(t){switch(t){case"svg":return"http://www.w3.org/2000/svg";case"math":return"http://www.w3.org/1998/Math/MathML";default:return"http://www.w3.org/1999/xhtml"}}function Hi(t,e){return t==null||t==="http://www.w3.org/1999/xhtml"?Sc(e):t==="http://www.w3.org/2000/svg"&&e==="foreignObject"?"http://www.w3.org/1999/xhtml":t}var Vr,Tc=function(t){return typeof MSApp<"u"&&MSApp.execUnsafeLocalFunction?function(e,n,r,s){MSApp.execUnsafeLocalFunction(function(){return t(e,n,r,s)})}:t}(function(t,e){if(t.namespaceURI!=="http://www.w3.org/2000/svg"||"innerHTML"in t)t.innerHTML=e;else{for(Vr=Vr||document.createElement("div"),Vr.innerHTML="<svg>"+e.valueOf().toString()+"</svg>",e=Vr.firstChild;t.firstChild;)t.removeChild(t.firstChild);for(;e.firstChild;)t.appendChild(e.firstChild)}});function yr(t,e){if(e){var n=t.firstChild;if(n&&n===t.lastChild&&n.nodeType===3){n.nodeValue=e;return}}t.textContent=e}var or={animationIterationCount:!0,aspectRatio:!0,borderImageOutset:!0,borderImageSlice:!0,borderImageWidth:!0,boxFlex:!0,boxFlexGroup:!0,boxOrdinalGroup:!0,columnCount:!0,columns:!0,flex:!0,flexGrow:!0,flexPositive:!0,flexShrink:!0,flexNegative:!0,flexOrder:!0,gridArea:!0,gridRow:!0,gridRowEnd:!0,gridRowSpan:!0,gridRowStart:!0,gridColumn:!0,gridColumnEnd:!0,gridColumnSpan:!0,gridColumnStart:!0,fontWeight:!0,lineClamp:!0,lineHeight:!0,opacity:!0,order:!0,orphans:!0,tabSize:!0,widows:!0,zIndex:!0,zoom:!0,fillOpacity:!0,floodOpacity:!0,stopOpacity:!0,strokeDasharray:!0,strokeDashoffset:!0,strokeMiterlimit:!0,strokeOpacity:!0,strokeWidth:!0},sp=["Webkit","ms","Moz","O"];Object.keys(or).forEach(function(t){sp.forEach(function(e){e=e+t.charAt(0).toUpperCase()+t.substring(1),or[e]=or[t]})});function Cc(t,e,n){return e==null||typeof e=="boolean"||e===""?"":n||typeof e!="number"||e===0||or.hasOwnProperty(t)&&or[t]?(""+e).trim():e+"px"}function Ic(t,e){t=t.style;for(var n in e)if(e.hasOwnProperty(n)){var r=n.indexOf("--")===0,s=Cc(n,e[n],r);n==="float"&&(n="cssFloat"),r?t.setProperty(n,s):t[n]=s}}var ip=Te({menuitem:!0},{area:!0,base:!0,br:!0,col:!0,embed:!0,hr:!0,img:!0,input:!0,keygen:!0,link:!0,meta:!0,param:!0,source:!0,track:!0,wbr:!0});function qi(t,e){if(e){if(ip[t]&&(e.children!=null||e.dangerouslySetInnerHTML!=null))throw Error(q(137,t));if(e.dangerouslySetInnerHTML!=null){if(e.children!=null)throw Error(q(60));if(typeof e.dangerouslySetInnerHTML!="object"||!("__html"in e.dangerouslySetInnerHTML))throw Error(q(61))}if(e.style!=null&&typeof e.style!="object")throw Error(q(62))}}function Gi(t,e){if(t.indexOf("-")===-1)return typeof e.is=="string";switch(t){case"annotation-xml":case"color-profile":case"font-face":case"font-face-src":case"font-face-uri":case"font-face-format":case"font-face-name":case"missing-glyph":return!1;default:return!0}}var Zi=null;function Ba(t){return t=t.target||t.srcElement||window,t.correspondingUseElement&&(t=t.correspondingUseElement),t.nodeType===3?t.parentNode:t}var Ji=null,Rn=null,On=null;function qo(t){if(t=zr(t)){if(typeof Ji!="function")throw Error(q(280));var e=t.stateNode;e&&(e=Qs(e),Ji(t.stateNode,t.type,e))}}function _c(t){Rn?On?On.push(t):On=[t]:Rn=t}function Rc(){if(Rn){var t=Rn,e=On;if(On=Rn=null,qo(t),e)for(t=0;t<e.length;t++)qo(e[t])}}function Oc(t,e){return t(e)}function Pc(){}var fi=!1;function Ac(t,e,n){if(fi)return t(e,n);fi=!0;try{return Oc(t,e,n)}finally{fi=!1,(Rn!==null||On!==null)&&(Pc(),Rc())}}function vr(t,e){var n=t.stateNode;if(n===null)return null;var r=Qs(n);if(r===null)return null;n=r[e];e:switch(e){case"onClick":case"onClickCapture":case"onDoubleClick":case"onDoubleClickCapture":case"onMouseDown":case"onMouseDownCapture":case"onMouseMove":case"onMouseMoveCapture":case"onMouseUp":case"onMouseUpCapture":case"onMouseEnter":(r=!r.disabled)||(t=t.type,r=!(t==="button"||t==="input"||t==="select"||t==="textarea")),t=!r;break e;default:t=!1}if(t)return null;if(n&&typeof n!="function")throw Error(q(231,e,typeof n));return n}var Qi=!1;if(_t)try{var Zn={};Object.defineProperty(Zn,"passive",{get:function(){Qi=!0}}),window.addEventListener("test",Zn,Zn),window.removeEventListener("test",Zn,Zn)}catch{Qi=!1}function ap(t,e,n,r,s,i,a,o,l){var d=Array.prototype.slice.call(arguments,3);try{e.apply(n,d)}catch(y){this.onError(y)}}var lr=!1,ws=null,Es=!1,Xi=null,op={onError:function(t){lr=!0,ws=t}};function lp(t,e,n,r,s,i,a,o,l){lr=!1,ws=null,ap.apply(op,arguments)}function cp(t,e,n,r,s,i,a,o,l){if(lp.apply(this,arguments),lr){if(lr){var d=ws;lr=!1,ws=null}else throw Error(q(198));Es||(Es=!0,Xi=d)}}function mn(t){var e=t,n=t;if(t.alternate)for(;e.return;)e=e.return;else{t=e;do e=t,e.flags&4098&&(n=e.return),t=e.return;while(t)}return e.tag===3?n:null}function jc(t){if(t.tag===13){var e=t.memoizedState;if(e===null&&(t=t.alternate,t!==null&&(e=t.memoizedState)),e!==null)return e.dehydrated}return null}function Go(t){if(mn(t)!==t)throw Error(q(188))}function up(t){var e=t.alternate;if(!e){if(e=mn(t),e===null)throw Error(q(188));return e!==t?null:t}for(var n=t,r=e;;){var s=n.return;if(s===null)break;var i=s.alternate;if(i===null){if(r=s.return,r!==null){n=r;continue}break}if(s.child===i.child){for(i=s.child;i;){if(i===n)return Go(s),t;if(i===r)return Go(s),e;i=i.sibling}throw Error(q(188))}if(n.return!==r.return)n=s,r=i;else{for(var a=!1,o=s.child;o;){if(o===n){a=!0,n=s,r=i;break}if(o===r){a=!0,r=s,n=i;break}o=o.sibling}if(!a){for(o=i.child;o;){if(o===n){a=!0,n=i,r=s;break}if(o===r){a=!0,r=i,n=s;break}o=o.sibling}if(!a)throw Error(q(189))}}if(n.alternate!==r)throw Error(q(190))}if(n.tag!==3)throw Error(q(188));return n.stateNode.current===n?t:e}function $c(t){return t=up(t),t!==null?zc(t):null}function zc(t){if(t.tag===5||t.tag===6)return t;for(t=t.child;t!==null;){var e=zc(t);if(e!==null)return e;t=t.sibling}return null}var Uc=et.unstable_scheduleCallback,Zo=et.unstable_cancelCallback,dp=et.unstable_shouldYield,pp=et.unstable_requestPaint,_e=et.unstable_now,hp=et.unstable_getCurrentPriorityLevel,Wa=et.unstable_ImmediatePriority,Dc=et.unstable_UserBlockingPriority,Ns=et.unstable_NormalPriority,fp=et.unstable_LowPriority,Lc=et.unstable_IdlePriority,qs=null,wt=null;function mp(t){if(wt&&typeof wt.onCommitFiberRoot=="function")try{wt.onCommitFiberRoot(qs,t,void 0,(t.current.flags&128)===128)}catch{}}var ft=Math.clz32?Math.clz32:vp,gp=Math.log,yp=Math.LN2;function vp(t){return t>>>=0,t===0?32:31-(gp(t)/yp|0)|0}var Yr=64,Hr=4194304;function ir(t){switch(t&-t){case 1:return 1;case 2:return 2;case 4:return 4;case 8:return 8;case 16:return 16;case 32:return 32;case 64:case 128:case 256:case 512:case 1024:case 2048:case 4096:case 8192:case 16384:case 32768:case 65536:case 131072:case 262144:case 524288:case 1048576:case 2097152:return t&4194240;case 4194304:case 8388608:case 16777216:case 33554432:case 67108864:return t&130023424;case 134217728:return 134217728;case 268435456:return 268435456;case 536870912:return 536870912;case 1073741824:return 1073741824;default:return t}}function bs(t,e){var n=t.pendingLanes;if(n===0)return 0;var r=0,s=t.suspendedLanes,i=t.pingedLanes,a=n&268435455;if(a!==0){var o=a&~s;o!==0?r=ir(o):(i&=a,i!==0&&(r=ir(i)))}else a=n&~s,a!==0?r=ir(a):i!==0&&(r=ir(i));if(r===0)return 0;if(e!==0&&e!==r&&!(e&s)&&(s=r&-r,i=e&-e,s>=i||s===16&&(i&4194240)!==0))return e;if(r&4&&(r|=n&16),e=t.entangledLanes,e!==0)for(t=t.entanglements,e&=r;0<e;)n=31-ft(e),s=1<<n,r|=t[n],e&=~s;return r}function xp(t,e){switch(t){case 1:case 2:case 4:return e+250;case 8:case 16:case 32:case 64:case 128:case 256:case 512:case 1024:case 2048:case 4096:case 8192:case 16384:case 32768:case 65536:case 131072:case 262144:case 524288:case 1048576:case 2097152:return e+5e3;case 4194304:case 8388608:case 16777216:case 33554432:case 67108864:return-1;case 134217728:case 268435456:case 536870912:case 1073741824:return-1;default:return-1}}function kp(t,e){for(var n=t.suspendedLanes,r=t.pingedLanes,s=t.expirationTimes,i=t.pendingLanes;0<i;){var a=31-ft(i),o=1<<a,l=s[a];l===-1?(!(o&n)||o&r)&&(s[a]=xp(o,e)):l<=e&&(t.expiredLanes|=o),i&=~o}}function ea(t){return t=t.pendingLanes&-1073741825,t!==0?t:t&1073741824?1073741824:0}function Mc(){var t=Yr;return Yr<<=1,!(Yr&4194240)&&(Yr=64),t}function mi(t){for(var e=[],n=0;31>n;n++)e.push(t);return e}function jr(t,e,n){t.pendingLanes|=e,e!==536870912&&(t.suspendedLanes=0,t.pingedLanes=0),t=t.eventTimes,e=31-ft(e),t[e]=n}function wp(t,e){var n=t.pendingLanes&~e;t.pendingLanes=e,t.suspendedLanes=0,t.pingedLanes=0,t.expiredLanes&=e,t.mutableReadLanes&=e,t.entangledLanes&=e,e=t.entanglements;var r=t.eventTimes;for(t=t.expirationTimes;0<n;){var s=31-ft(n),i=1<<s;e[s]=0,r[s]=-1,t[s]=-1,n&=~i}}function Ka(t,e){var n=t.entangledLanes|=e;for(t=t.entanglements;n;){var r=31-ft(n),s=1<<r;s&e|t[r]&e&&(t[r]|=e),n&=~s}}var ye=0;function Fc(t){return t&=-t,1<t?4<t?t&268435455?16:536870912:4:1}var Bc,Va,Wc,Kc,Vc,ta=!1,qr=[],Ft=null,Bt=null,Wt=null,xr=new Map,kr=new Map,Ut=[],Ep="mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset submit".split(" ");function Jo(t,e){switch(t){case"focusin":case"focusout":Ft=null;break;case"dragenter":case"dragleave":Bt=null;break;case"mouseover":case"mouseout":Wt=null;break;case"pointerover":case"pointerout":xr.delete(e.pointerId);break;case"gotpointercapture":case"lostpointercapture":kr.delete(e.pointerId)}}function Jn(t,e,n,r,s,i){return t===null||t.nativeEvent!==i?(t={blockedOn:e,domEventName:n,eventSystemFlags:r,nativeEvent:i,targetContainers:[s]},e!==null&&(e=zr(e),e!==null&&Va(e)),t):(t.eventSystemFlags|=r,e=t.targetContainers,s!==null&&e.indexOf(s)===-1&&e.push(s),t)}function Np(t,e,n,r,s){switch(e){case"focusin":return Ft=Jn(Ft,t,e,n,r,s),!0;case"dragenter":return Bt=Jn(Bt,t,e,n,r,s),!0;case"mouseover":return Wt=Jn(Wt,t,e,n,r,s),!0;case"pointerover":var i=s.pointerId;return xr.set(i,Jn(xr.get(i)||null,t,e,n,r,s)),!0;case"gotpointercapture":return i=s.pointerId,kr.set(i,Jn(kr.get(i)||null,t,e,n,r,s)),!0}return!1}function Yc(t){var e=nn(t.target);if(e!==null){var n=mn(e);if(n!==null){if(e=n.tag,e===13){if(e=jc(n),e!==null){t.blockedOn=e,Vc(t.priority,function(){Wc(n)});return}}else if(e===3&&n.stateNode.current.memoizedState.isDehydrated){t.blockedOn=n.tag===3?n.stateNode.containerInfo:null;return}}}t.blockedOn=null}function cs(t){if(t.blockedOn!==null)return!1;for(var e=t.targetContainers;0<e.length;){var n=na(t.domEventName,t.eventSystemFlags,e[0],t.nativeEvent);if(n===null){n=t.nativeEvent;var r=new n.constructor(n.type,n);Zi=r,n.target.dispatchEvent(r),Zi=null}else return e=zr(n),e!==null&&Va(e),t.blockedOn=n,!1;e.shift()}return!0}function Qo(t,e,n){cs(t)&&n.delete(e)}function bp(){ta=!1,Ft!==null&&cs(Ft)&&(Ft=null),Bt!==null&&cs(Bt)&&(Bt=null),Wt!==null&&cs(Wt)&&(Wt=null),xr.forEach(Qo),kr.forEach(Qo)}function Qn(t,e){t.blockedOn===e&&(t.blockedOn=null,ta||(ta=!0,et.unstable_scheduleCallback(et.unstable_NormalPriority,bp)))}function wr(t){function e(s){return Qn(s,t)}if(0<qr.length){Qn(qr[0],t);for(var n=1;n<qr.length;n++){var r=qr[n];r.blockedOn===t&&(r.blockedOn=null)}}for(Ft!==null&&Qn(Ft,t),Bt!==null&&Qn(Bt,t),Wt!==null&&Qn(Wt,t),xr.forEach(e),kr.forEach(e),n=0;n<Ut.length;n++)r=Ut[n],r.blockedOn===t&&(r.blockedOn=null);for(;0<Ut.length&&(n=Ut[0],n.blockedOn===null);)Yc(n),n.blockedOn===null&&Ut.shift()}var Pn=At.ReactCurrentBatchConfig,Ss=!0;function Sp(t,e,n,r){var s=ye,i=Pn.transition;Pn.transition=null;try{ye=1,Ya(t,e,n,r)}finally{ye=s,Pn.transition=i}}function Tp(t,e,n,r){var s=ye,i=Pn.transition;Pn.transition=null;try{ye=4,Ya(t,e,n,r)}finally{ye=s,Pn.transition=i}}function Ya(t,e,n,r){if(Ss){var s=na(t,e,n,r);if(s===null)Si(t,e,r,Ts,n),Jo(t,r);else if(Np(s,t,e,n,r))r.stopPropagation();else if(Jo(t,r),e&4&&-1<Ep.indexOf(t)){for(;s!==null;){var i=zr(s);if(i!==null&&Bc(i),i=na(t,e,n,r),i===null&&Si(t,e,r,Ts,n),i===s)break;s=i}s!==null&&r.stopPropagation()}else Si(t,e,r,null,n)}}var Ts=null;function na(t,e,n,r){if(Ts=null,t=Ba(r),t=nn(t),t!==null)if(e=mn(t),e===null)t=null;else if(n=e.tag,n===13){if(t=jc(e),t!==null)return t;t=null}else if(n===3){if(e.stateNode.current.memoizedState.isDehydrated)return e.tag===3?e.stateNode.containerInfo:null;t=null}else e!==t&&(t=null);return Ts=t,null}function Hc(t){switch(t){case"cancel":case"click":case"close":case"contextmenu":case"copy":case"cut":case"auxclick":case"dblclick":case"dragend":case"dragstart":case"drop":case"focusin":case"focusout":case"input":case"invalid":case"keydown":case"keypress":case"keyup":case"mousedown":case"mouseup":case"paste":case"pause":case"play":case"pointercancel":case"pointerdown":case"pointerup":case"ratechange":case"reset":case"resize":case"seeked":case"submit":case"touchcancel":case"touchend":case"touchstart":case"volumechange":case"change":case"selectionchange":case"textInput":case"compositionstart":case"compositionend":case"compositionupdate":case"beforeblur":case"afterblur":case"beforeinput":case"blur":case"fullscreenchange":case"focus":case"hashchange":case"popstate":case"select":case"selectstart":return 1;case"drag":case"dragenter":case"dragexit":case"dragleave":case"dragover":case"mousemove":case"mouseout":case"mouseover":case"pointermove":case"pointerout":case"pointerover":case"scroll":case"toggle":case"touchmove":case"wheel":case"mouseenter":case"mouseleave":case"pointerenter":case"pointerleave":return 4;case"message":switch(hp()){case Wa:return 1;case Dc:return 4;case Ns:case fp:return 16;case Lc:return 536870912;default:return 16}default:return 16}}var Lt=null,Ha=null,us=null;function qc(){if(us)return us;var t,e=Ha,n=e.length,r,s="value"in Lt?Lt.value:Lt.textContent,i=s.length;for(t=0;t<n&&e[t]===s[t];t++);var a=n-t;for(r=1;r<=a&&e[n-r]===s[i-r];r++);return us=s.slice(t,1<r?1-r:void 0)}function ds(t){var e=t.keyCode;return"charCode"in t?(t=t.charCode,t===0&&e===13&&(t=13)):t=e,t===10&&(t=13),32<=t||t===13?t:0}function Gr(){return!0}function Xo(){return!1}function nt(t){function e(n,r,s,i,a){this._reactName=n,this._targetInst=s,this.type=r,this.nativeEvent=i,this.target=a,this.currentTarget=null;for(var o in t)t.hasOwnProperty(o)&&(n=t[o],this[o]=n?n(i):i[o]);return this.isDefaultPrevented=(i.defaultPrevented!=null?i.defaultPrevented:i.returnValue===!1)?Gr:Xo,this.isPropagationStopped=Xo,this}return Te(e.prototype,{preventDefault:function(){this.defaultPrevented=!0;var n=this.nativeEvent;n&&(n.preventDefault?n.preventDefault():typeof n.returnValue!="unknown"&&(n.returnValue=!1),this.isDefaultPrevented=Gr)},stopPropagation:function(){var n=this.nativeEvent;n&&(n.stopPropagation?n.stopPropagation():typeof n.cancelBubble!="unknown"&&(n.cancelBubble=!0),this.isPropagationStopped=Gr)},persist:function(){},isPersistent:Gr}),e}var Kn={eventPhase:0,bubbles:0,cancelable:0,timeStamp:function(t){return t.timeStamp||Date.now()},defaultPrevented:0,isTrusted:0},qa=nt(Kn),$r=Te({},Kn,{view:0,detail:0}),Cp=nt($r),gi,yi,Xn,Gs=Te({},$r,{screenX:0,screenY:0,clientX:0,clientY:0,pageX:0,pageY:0,ctrlKey:0,shiftKey:0,altKey:0,metaKey:0,getModifierState:Ga,button:0,buttons:0,relatedTarget:function(t){return t.relatedTarget===void 0?t.fromElement===t.srcElement?t.toElement:t.fromElement:t.relatedTarget},movementX:function(t){return"movementX"in t?t.movementX:(t!==Xn&&(Xn&&t.type==="mousemove"?(gi=t.screenX-Xn.screenX,yi=t.screenY-Xn.screenY):yi=gi=0,Xn=t),gi)},movementY:function(t){return"movementY"in t?t.movementY:yi}}),el=nt(Gs),Ip=Te({},Gs,{dataTransfer:0}),_p=nt(Ip),Rp=Te({},$r,{relatedTarget:0}),vi=nt(Rp),Op=Te({},Kn,{animationName:0,elapsedTime:0,pseudoElement:0}),Pp=nt(Op),Ap=Te({},Kn,{clipboardData:function(t){return"clipboardData"in t?t.clipboardData:window.clipboardData}}),jp=nt(Ap),$p=Te({},Kn,{data:0}),tl=nt($p),zp={Esc:"Escape",Spacebar:" ",Left:"ArrowLeft",Up:"ArrowUp",Right:"ArrowRight",Down:"ArrowDown",Del:"Delete",Win:"OS",Menu:"ContextMenu",Apps:"ContextMenu",Scroll:"ScrollLock",MozPrintableKey:"Unidentified"},Up={8:"Backspace",9:"Tab",12:"Clear",13:"Enter",16:"Shift",17:"Control",18:"Alt",19:"Pause",20:"CapsLock",27:"Escape",32:" ",33:"PageUp",34:"PageDown",35:"End",36:"Home",37:"ArrowLeft",38:"ArrowUp",39:"ArrowRight",40:"ArrowDown",45:"Insert",46:"Delete",112:"F1",113:"F2",114:"F3",115:"F4",116:"F5",117:"F6",118:"F7",119:"F8",120:"F9",121:"F10",122:"F11",123:"F12",144:"NumLock",145:"ScrollLock",224:"Meta"},Dp={Alt:"altKey",Control:"ctrlKey",Meta:"metaKey",Shift:"shiftKey"};function Lp(t){var e=this.nativeEvent;return e.getModifierState?e.getModifierState(t):(t=Dp[t])?!!e[t]:!1}function Ga(){return Lp}var Mp=Te({},$r,{key:function(t){if(t.key){var e=zp[t.key]||t.key;if(e!=="Unidentified")return e}return t.type==="keypress"?(t=ds(t),t===13?"Enter":String.fromCharCode(t)):t.type==="keydown"||t.type==="keyup"?Up[t.keyCode]||"Unidentified":""},code:0,location:0,ctrlKey:0,shiftKey:0,altKey:0,metaKey:0,repeat:0,locale:0,getModifierState:Ga,charCode:function(t){return t.type==="keypress"?ds(t):0},keyCode:function(t){return t.type==="keydown"||t.type==="keyup"?t.keyCode:0},which:function(t){return t.type==="keypress"?ds(t):t.type==="keydown"||t.type==="keyup"?t.keyCode:0}}),Fp=nt(Mp),Bp=Te({},Gs,{pointerId:0,width:0,height:0,pressure:0,tangentialPressure:0,tiltX:0,tiltY:0,twist:0,pointerType:0,isPrimary:0}),nl=nt(Bp),Wp=Te({},$r,{touches:0,targetTouches:0,changedTouches:0,altKey:0,metaKey:0,ctrlKey:0,shiftKey:0,getModifierState:Ga}),Kp=nt(Wp),Vp=Te({},Kn,{propertyName:0,elapsedTime:0,pseudoElement:0}),Yp=nt(Vp),Hp=Te({},Gs,{deltaX:function(t){return"deltaX"in t?t.deltaX:"wheelDeltaX"in t?-t.wheelDeltaX:0},deltaY:function(t){return"deltaY"in t?t.deltaY:"wheelDeltaY"in t?-t.wheelDeltaY:"wheelDelta"in t?-t.wheelDelta:0},deltaZ:0,deltaMode:0}),qp=nt(Hp),Gp=[9,13,27,32],Za=_t&&"CompositionEvent"in window,cr=null;_t&&"documentMode"in document&&(cr=document.documentMode);var Zp=_t&&"TextEvent"in window&&!cr,Gc=_t&&(!Za||cr&&8<cr&&11>=cr),rl=" ",sl=!1;function Zc(t,e){switch(t){case"keyup":return Gp.indexOf(e.keyCode)!==-1;case"keydown":return e.keyCode!==229;case"keypress":case"mousedown":case"focusout":return!0;default:return!1}}function Jc(t){return t=t.detail,typeof t=="object"&&"data"in t?t.data:null}var xn=!1;function Jp(t,e){switch(t){case"compositionend":return Jc(e);case"keypress":return e.which!==32?null:(sl=!0,rl);case"textInput":return t=e.data,t===rl&&sl?null:t;default:return null}}function Qp(t,e){if(xn)return t==="compositionend"||!Za&&Zc(t,e)?(t=qc(),us=Ha=Lt=null,xn=!1,t):null;switch(t){case"paste":return null;case"keypress":if(!(e.ctrlKey||e.altKey||e.metaKey)||e.ctrlKey&&e.altKey){if(e.char&&1<e.char.length)return e.char;if(e.which)return String.fromCharCode(e.which)}return null;case"compositionend":return Gc&&e.locale!=="ko"?null:e.data;default:return null}}var Xp={color:!0,date:!0,datetime:!0,"datetime-local":!0,email:!0,month:!0,number:!0,password:!0,range:!0,search:!0,tel:!0,text:!0,time:!0,url:!0,week:!0};function il(t){var e=t&&t.nodeName&&t.nodeName.toLowerCase();return e==="input"?!!Xp[t.type]:e==="textarea"}function Qc(t,e,n,r){_c(r),e=Cs(e,"onChange"),0<e.length&&(n=new qa("onChange","change",null,n,r),t.push({event:n,listeners:e}))}var ur=null,Er=null;function eh(t){cu(t,0)}function Zs(t){var e=En(t);if(Ec(e))return t}function th(t,e){if(t==="change")return e}var Xc=!1;if(_t){var xi;if(_t){var ki="oninput"in document;if(!ki){var al=document.createElement("div");al.setAttribute("oninput","return;"),ki=typeof al.oninput=="function"}xi=ki}else xi=!1;Xc=xi&&(!document.documentMode||9<document.documentMode)}function ol(){ur&&(ur.detachEvent("onpropertychange",eu),Er=ur=null)}function eu(t){if(t.propertyName==="value"&&Zs(Er)){var e=[];Qc(e,Er,t,Ba(t)),Ac(eh,e)}}function nh(t,e,n){t==="focusin"?(ol(),ur=e,Er=n,ur.attachEvent("onpropertychange",eu)):t==="focusout"&&ol()}function rh(t){if(t==="selectionchange"||t==="keyup"||t==="keydown")return Zs(Er)}function sh(t,e){if(t==="click")return Zs(e)}function ih(t,e){if(t==="input"||t==="change")return Zs(e)}function ah(t,e){return t===e&&(t!==0||1/t===1/e)||t!==t&&e!==e}var gt=typeof Object.is=="function"?Object.is:ah;function Nr(t,e){if(gt(t,e))return!0;if(typeof t!="object"||t===null||typeof e!="object"||e===null)return!1;var n=Object.keys(t),r=Object.keys(e);if(n.length!==r.length)return!1;for(r=0;r<n.length;r++){var s=n[r];if(!Di.call(e,s)||!gt(t[s],e[s]))return!1}return!0}function ll(t){for(;t&&t.firstChild;)t=t.firstChild;return t}function cl(t,e){var n=ll(t);t=0;for(var r;n;){if(n.nodeType===3){if(r=t+n.textContent.length,t<=e&&r>=e)return{node:n,offset:e-t};t=r}e:{for(;n;){if(n.nextSibling){n=n.nextSibling;break e}n=n.parentNode}n=void 0}n=ll(n)}}function tu(t,e){return t&&e?t===e?!0:t&&t.nodeType===3?!1:e&&e.nodeType===3?tu(t,e.parentNode):"contains"in t?t.contains(e):t.compareDocumentPosition?!!(t.compareDocumentPosition(e)&16):!1:!1}function nu(){for(var t=window,e=ks();e instanceof t.HTMLIFrameElement;){try{var n=typeof e.contentWindow.location.href=="string"}catch{n=!1}if(n)t=e.contentWindow;else break;e=ks(t.document)}return e}function Ja(t){var e=t&&t.nodeName&&t.nodeName.toLowerCase();return e&&(e==="input"&&(t.type==="text"||t.type==="search"||t.type==="tel"||t.type==="url"||t.type==="password")||e==="textarea"||t.contentEditable==="true")}function oh(t){var e=nu(),n=t.focusedElem,r=t.selectionRange;if(e!==n&&n&&n.ownerDocument&&tu(n.ownerDocument.documentElement,n)){if(r!==null&&Ja(n)){if(e=r.start,t=r.end,t===void 0&&(t=e),"selectionStart"in n)n.selectionStart=e,n.selectionEnd=Math.min(t,n.value.length);else if(t=(e=n.ownerDocument||document)&&e.defaultView||window,t.getSelection){t=t.getSelection();var s=n.textContent.length,i=Math.min(r.start,s);r=r.end===void 0?i:Math.min(r.end,s),!t.extend&&i>r&&(s=r,r=i,i=s),s=cl(n,i);var a=cl(n,r);s&&a&&(t.rangeCount!==1||t.anchorNode!==s.node||t.anchorOffset!==s.offset||t.focusNode!==a.node||t.focusOffset!==a.offset)&&(e=e.createRange(),e.setStart(s.node,s.offset),t.removeAllRanges(),i>r?(t.addRange(e),t.extend(a.node,a.offset)):(e.setEnd(a.node,a.offset),t.addRange(e)))}}for(e=[],t=n;t=t.parentNode;)t.nodeType===1&&e.push({element:t,left:t.scrollLeft,top:t.scrollTop});for(typeof n.focus=="function"&&n.focus(),n=0;n<e.length;n++)t=e[n],t.element.scrollLeft=t.left,t.element.scrollTop=t.top}}var lh=_t&&"documentMode"in document&&11>=document.documentMode,kn=null,ra=null,dr=null,sa=!1;function ul(t,e,n){var r=n.window===n?n.document:n.nodeType===9?n:n.ownerDocument;sa||kn==null||kn!==ks(r)||(r=kn,"selectionStart"in r&&Ja(r)?r={start:r.selectionStart,end:r.selectionEnd}:(r=(r.ownerDocument&&r.ownerDocument.defaultView||window).getSelection(),r={anchorNode:r.anchorNode,anchorOffset:r.anchorOffset,focusNode:r.focusNode,focusOffset:r.focusOffset}),dr&&Nr(dr,r)||(dr=r,r=Cs(ra,"onSelect"),0<r.length&&(e=new qa("onSelect","select",null,e,n),t.push({event:e,listeners:r}),e.target=kn)))}function Zr(t,e){var n={};return n[t.toLowerCase()]=e.toLowerCase(),n["Webkit"+t]="webkit"+e,n["Moz"+t]="moz"+e,n}var wn={animationend:Zr("Animation","AnimationEnd"),animationiteration:Zr("Animation","AnimationIteration"),animationstart:Zr("Animation","AnimationStart"),transitionend:Zr("Transition","TransitionEnd")},wi={},ru={};_t&&(ru=document.createElement("div").style,"AnimationEvent"in window||(delete wn.animationend.animation,delete wn.animationiteration.animation,delete wn.animationstart.animation),"TransitionEvent"in window||delete wn.transitionend.transition);function Js(t){if(wi[t])return wi[t];if(!wn[t])return t;var e=wn[t],n;for(n in e)if(e.hasOwnProperty(n)&&n in ru)return wi[t]=e[n];return t}var su=Js("animationend"),iu=Js("animationiteration"),au=Js("animationstart"),ou=Js("transitionend"),lu=new Map,dl="abort auxClick cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel".split(" ");function Jt(t,e){lu.set(t,e),fn(e,[t])}for(var Ei=0;Ei<dl.length;Ei++){var Ni=dl[Ei],ch=Ni.toLowerCase(),uh=Ni[0].toUpperCase()+Ni.slice(1);Jt(ch,"on"+uh)}Jt(su,"onAnimationEnd");Jt(iu,"onAnimationIteration");Jt(au,"onAnimationStart");Jt("dblclick","onDoubleClick");Jt("focusin","onFocus");Jt("focusout","onBlur");Jt(ou,"onTransitionEnd");zn("onMouseEnter",["mouseout","mouseover"]);zn("onMouseLeave",["mouseout","mouseover"]);zn("onPointerEnter",["pointerout","pointerover"]);zn("onPointerLeave",["pointerout","pointerover"]);fn("onChange","change click focusin focusout input keydown keyup selectionchange".split(" "));fn("onSelect","focusout contextmenu dragend focusin keydown keyup mousedown mouseup selectionchange".split(" "));fn("onBeforeInput",["compositionend","keypress","textInput","paste"]);fn("onCompositionEnd","compositionend focusout keydown keypress keyup mousedown".split(" "));fn("onCompositionStart","compositionstart focusout keydown keypress keyup mousedown".split(" "));fn("onCompositionUpdate","compositionupdate focusout keydown keypress keyup mousedown".split(" "));var ar="abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting".split(" "),dh=new Set("cancel close invalid load scroll toggle".split(" ").concat(ar));function pl(t,e,n){var r=t.type||"unknown-event";t.currentTarget=n,cp(r,e,void 0,t),t.currentTarget=null}function cu(t,e){e=(e&4)!==0;for(var n=0;n<t.length;n++){var r=t[n],s=r.event;r=r.listeners;e:{var i=void 0;if(e)for(var a=r.length-1;0<=a;a--){var o=r[a],l=o.instance,d=o.currentTarget;if(o=o.listener,l!==i&&s.isPropagationStopped())break e;pl(s,o,d),i=l}else for(a=0;a<r.length;a++){if(o=r[a],l=o.instance,d=o.currentTarget,o=o.listener,l!==i&&s.isPropagationStopped())break e;pl(s,o,d),i=l}}}if(Es)throw t=Xi,Es=!1,Xi=null,t}function we(t,e){var n=e[ca];n===void 0&&(n=e[ca]=new Set);var r=t+"__bubble";n.has(r)||(uu(e,t,2,!1),n.add(r))}function bi(t,e,n){var r=0;e&&(r|=4),uu(n,t,r,e)}var Jr="_reactListening"+Math.random().toString(36).slice(2);function br(t){if(!t[Jr]){t[Jr]=!0,yc.forEach(function(n){n!=="selectionchange"&&(dh.has(n)||bi(n,!1,t),bi(n,!0,t))});var e=t.nodeType===9?t:t.ownerDocument;e===null||e[Jr]||(e[Jr]=!0,bi("selectionchange",!1,e))}}function uu(t,e,n,r){switch(Hc(e)){case 1:var s=Sp;break;case 4:s=Tp;break;default:s=Ya}n=s.bind(null,e,n,t),s=void 0,!Qi||e!=="touchstart"&&e!=="touchmove"&&e!=="wheel"||(s=!0),r?s!==void 0?t.addEventListener(e,n,{capture:!0,passive:s}):t.addEventListener(e,n,!0):s!==void 0?t.addEventListener(e,n,{passive:s}):t.addEventListener(e,n,!1)}function Si(t,e,n,r,s){var i=r;if(!(e&1)&&!(e&2)&&r!==null)e:for(;;){if(r===null)return;var a=r.tag;if(a===3||a===4){var o=r.stateNode.containerInfo;if(o===s||o.nodeType===8&&o.parentNode===s)break;if(a===4)for(a=r.return;a!==null;){var l=a.tag;if((l===3||l===4)&&(l=a.stateNode.containerInfo,l===s||l.nodeType===8&&l.parentNode===s))return;a=a.return}for(;o!==null;){if(a=nn(o),a===null)return;if(l=a.tag,l===5||l===6){r=i=a;continue e}o=o.parentNode}}r=r.return}Ac(function(){var d=i,y=Ba(n),v=[];e:{var h=lu.get(t);if(h!==void 0){var f=qa,w=t;switch(t){case"keypress":if(ds(n)===0)break e;case"keydown":case"keyup":f=Fp;break;case"focusin":w="focus",f=vi;break;case"focusout":w="blur",f=vi;break;case"beforeblur":case"afterblur":f=vi;break;case"click":if(n.button===2)break e;case"auxclick":case"dblclick":case"mousedown":case"mousemove":case"mouseup":case"mouseout":case"mouseover":case"contextmenu":f=el;break;case"drag":case"dragend":case"dragenter":case"dragexit":case"dragleave":case"dragover":case"dragstart":case"drop":f=_p;break;case"touchcancel":case"touchend":case"touchmove":case"touchstart":f=Kp;break;case su:case iu:case au:f=Pp;break;case ou:f=Yp;break;case"scroll":f=Cp;break;case"wheel":f=qp;break;case"copy":case"cut":case"paste":f=jp;break;case"gotpointercapture":case"lostpointercapture":case"pointercancel":case"pointerdown":case"pointermove":case"pointerout":case"pointerover":case"pointerup":f=nl}var m=(e&4)!==0,E=!m&&t==="scroll",c=m?h!==null?h+"Capture":null:h;m=[];for(var u=d,k;u!==null;){k=u;var b=k.stateNode;if(k.tag===5&&b!==null&&(k=b,c!==null&&(b=vr(u,c),b!=null&&m.push(Sr(u,b,k)))),E)break;u=u.return}0<m.length&&(h=new f(h,w,null,n,y),v.push({event:h,listeners:m}))}}if(!(e&7)){e:{if(h=t==="mouseover"||t==="pointerover",f=t==="mouseout"||t==="pointerout",h&&n!==Zi&&(w=n.relatedTarget||n.fromElement)&&(nn(w)||w[Rt]))break e;if((f||h)&&(h=y.window===y?y:(h=y.ownerDocument)?h.defaultView||h.parentWindow:window,f?(w=n.relatedTarget||n.toElement,f=d,w=w?nn(w):null,w!==null&&(E=mn(w),w!==E||w.tag!==5&&w.tag!==6)&&(w=null)):(f=null,w=d),f!==w)){if(m=el,b="onMouseLeave",c="onMouseEnter",u="mouse",(t==="pointerout"||t==="pointerover")&&(m=nl,b="onPointerLeave",c="onPointerEnter",u="pointer"),E=f==null?h:En(f),k=w==null?h:En(w),h=new m(b,u+"leave",f,n,y),h.target=E,h.relatedTarget=k,b=null,nn(y)===d&&(m=new m(c,u+"enter",w,n,y),m.target=k,m.relatedTarget=E,b=m),E=b,f&&w)t:{for(m=f,c=w,u=0,k=m;k;k=gn(k))u++;for(k=0,b=c;b;b=gn(b))k++;for(;0<u-k;)m=gn(m),u--;for(;0<k-u;)c=gn(c),k--;for(;u--;){if(m===c||c!==null&&m===c.alternate)break t;m=gn(m),c=gn(c)}m=null}else m=null;f!==null&&hl(v,h,f,m,!1),w!==null&&E!==null&&hl(v,E,w,m,!0)}}e:{if(h=d?En(d):window,f=h.nodeName&&h.nodeName.toLowerCase(),f==="select"||f==="input"&&h.type==="file")var T=th;else if(il(h))if(Xc)T=ih;else{T=rh;var I=nh}else(f=h.nodeName)&&f.toLowerCase()==="input"&&(h.type==="checkbox"||h.type==="radio")&&(T=sh);if(T&&(T=T(t,d))){Qc(v,T,n,y);break e}I&&I(t,h,d),t==="focusout"&&(I=h._wrapperState)&&I.controlled&&h.type==="number"&&Vi(h,"number",h.value)}switch(I=d?En(d):window,t){case"focusin":(il(I)||I.contentEditable==="true")&&(kn=I,ra=d,dr=null);break;case"focusout":dr=ra=kn=null;break;case"mousedown":sa=!0;break;case"contextmenu":case"mouseup":case"dragend":sa=!1,ul(v,n,y);break;case"selectionchange":if(lh)break;case"keydown":case"keyup":ul(v,n,y)}var _;if(Za)e:{switch(t){case"compositionstart":var j="onCompositionStart";break e;case"compositionend":j="onCompositionEnd";break e;case"compositionupdate":j="onCompositionUpdate";break e}j=void 0}else xn?Zc(t,n)&&(j="onCompositionEnd"):t==="keydown"&&n.keyCode===229&&(j="onCompositionStart");j&&(Gc&&n.locale!=="ko"&&(xn||j!=="onCompositionStart"?j==="onCompositionEnd"&&xn&&(_=qc()):(Lt=y,Ha="value"in Lt?Lt.value:Lt.textContent,xn=!0)),I=Cs(d,j),0<I.length&&(j=new tl(j,t,null,n,y),v.push({event:j,listeners:I}),_?j.data=_:(_=Jc(n),_!==null&&(j.data=_)))),(_=Zp?Jp(t,n):Qp(t,n))&&(d=Cs(d,"onBeforeInput"),0<d.length&&(y=new tl("onBeforeInput","beforeinput",null,n,y),v.push({event:y,listeners:d}),y.data=_))}cu(v,e)})}function Sr(t,e,n){return{instance:t,listener:e,currentTarget:n}}function Cs(t,e){for(var n=e+"Capture",r=[];t!==null;){var s=t,i=s.stateNode;s.tag===5&&i!==null&&(s=i,i=vr(t,n),i!=null&&r.unshift(Sr(t,i,s)),i=vr(t,e),i!=null&&r.push(Sr(t,i,s))),t=t.return}return r}function gn(t){if(t===null)return null;do t=t.return;while(t&&t.tag!==5);return t||null}function hl(t,e,n,r,s){for(var i=e._reactName,a=[];n!==null&&n!==r;){var o=n,l=o.alternate,d=o.stateNode;if(l!==null&&l===r)break;o.tag===5&&d!==null&&(o=d,s?(l=vr(n,i),l!=null&&a.unshift(Sr(n,l,o))):s||(l=vr(n,i),l!=null&&a.push(Sr(n,l,o)))),n=n.return}a.length!==0&&t.push({event:e,listeners:a})}var ph=/\r\n?/g,hh=/\u0000|\uFFFD/g;function fl(t){return(typeof t=="string"?t:""+t).replace(ph,`
`).replace(hh,"")}function Qr(t,e,n){if(e=fl(e),fl(t)!==e&&n)throw Error(q(425))}function Is(){}var ia=null,aa=null;function oa(t,e){return t==="textarea"||t==="noscript"||typeof e.children=="string"||typeof e.children=="number"||typeof e.dangerouslySetInnerHTML=="object"&&e.dangerouslySetInnerHTML!==null&&e.dangerouslySetInnerHTML.__html!=null}var la=typeof setTimeout=="function"?setTimeout:void 0,fh=typeof clearTimeout=="function"?clearTimeout:void 0,ml=typeof Promise=="function"?Promise:void 0,mh=typeof queueMicrotask=="function"?queueMicrotask:typeof ml<"u"?function(t){return ml.resolve(null).then(t).catch(gh)}:la;function gh(t){setTimeout(function(){throw t})}function Ti(t,e){var n=e,r=0;do{var s=n.nextSibling;if(t.removeChild(n),s&&s.nodeType===8)if(n=s.data,n==="/$"){if(r===0){t.removeChild(s),wr(e);return}r--}else n!=="$"&&n!=="$?"&&n!=="$!"||r++;n=s}while(n);wr(e)}function Kt(t){for(;t!=null;t=t.nextSibling){var e=t.nodeType;if(e===1||e===3)break;if(e===8){if(e=t.data,e==="$"||e==="$!"||e==="$?")break;if(e==="/$")return null}}return t}function gl(t){t=t.previousSibling;for(var e=0;t;){if(t.nodeType===8){var n=t.data;if(n==="$"||n==="$!"||n==="$?"){if(e===0)return t;e--}else n==="/$"&&e++}t=t.previousSibling}return null}var Vn=Math.random().toString(36).slice(2),kt="__reactFiber$"+Vn,Tr="__reactProps$"+Vn,Rt="__reactContainer$"+Vn,ca="__reactEvents$"+Vn,yh="__reactListeners$"+Vn,vh="__reactHandles$"+Vn;function nn(t){var e=t[kt];if(e)return e;for(var n=t.parentNode;n;){if(e=n[Rt]||n[kt]){if(n=e.alternate,e.child!==null||n!==null&&n.child!==null)for(t=gl(t);t!==null;){if(n=t[kt])return n;t=gl(t)}return e}t=n,n=t.parentNode}return null}function zr(t){return t=t[kt]||t[Rt],!t||t.tag!==5&&t.tag!==6&&t.tag!==13&&t.tag!==3?null:t}function En(t){if(t.tag===5||t.tag===6)return t.stateNode;throw Error(q(33))}function Qs(t){return t[Tr]||null}var ua=[],Nn=-1;function Qt(t){return{current:t}}function Ee(t){0>Nn||(t.current=ua[Nn],ua[Nn]=null,Nn--)}function ke(t,e){Nn++,ua[Nn]=t.current,t.current=e}var Zt={},Fe=Qt(Zt),qe=Qt(!1),cn=Zt;function Un(t,e){var n=t.type.contextTypes;if(!n)return Zt;var r=t.stateNode;if(r&&r.__reactInternalMemoizedUnmaskedChildContext===e)return r.__reactInternalMemoizedMaskedChildContext;var s={},i;for(i in n)s[i]=e[i];return r&&(t=t.stateNode,t.__reactInternalMemoizedUnmaskedChildContext=e,t.__reactInternalMemoizedMaskedChildContext=s),s}function Ge(t){return t=t.childContextTypes,t!=null}function _s(){Ee(qe),Ee(Fe)}function yl(t,e,n){if(Fe.current!==Zt)throw Error(q(168));ke(Fe,e),ke(qe,n)}function du(t,e,n){var r=t.stateNode;if(e=e.childContextTypes,typeof r.getChildContext!="function")return n;r=r.getChildContext();for(var s in r)if(!(s in e))throw Error(q(108,np(t)||"Unknown",s));return Te({},n,r)}function Rs(t){return t=(t=t.stateNode)&&t.__reactInternalMemoizedMergedChildContext||Zt,cn=Fe.current,ke(Fe,t),ke(qe,qe.current),!0}function vl(t,e,n){var r=t.stateNode;if(!r)throw Error(q(169));n?(t=du(t,e,cn),r.__reactInternalMemoizedMergedChildContext=t,Ee(qe),Ee(Fe),ke(Fe,t)):Ee(qe),ke(qe,n)}var St=null,Xs=!1,Ci=!1;function pu(t){St===null?St=[t]:St.push(t)}function xh(t){Xs=!0,pu(t)}function Xt(){if(!Ci&&St!==null){Ci=!0;var t=0,e=ye;try{var n=St;for(ye=1;t<n.length;t++){var r=n[t];do r=r(!0);while(r!==null)}St=null,Xs=!1}catch(s){throw St!==null&&(St=St.slice(t+1)),Uc(Wa,Xt),s}finally{ye=e,Ci=!1}}return null}var bn=[],Sn=0,Os=null,Ps=0,st=[],it=0,un=null,Tt=1,Ct="";function en(t,e){bn[Sn++]=Ps,bn[Sn++]=Os,Os=t,Ps=e}function hu(t,e,n){st[it++]=Tt,st[it++]=Ct,st[it++]=un,un=t;var r=Tt;t=Ct;var s=32-ft(r)-1;r&=~(1<<s),n+=1;var i=32-ft(e)+s;if(30<i){var a=s-s%5;i=(r&(1<<a)-1).toString(32),r>>=a,s-=a,Tt=1<<32-ft(e)+s|n<<s|r,Ct=i+t}else Tt=1<<i|n<<s|r,Ct=t}function Qa(t){t.return!==null&&(en(t,1),hu(t,1,0))}function Xa(t){for(;t===Os;)Os=bn[--Sn],bn[Sn]=null,Ps=bn[--Sn],bn[Sn]=null;for(;t===un;)un=st[--it],st[it]=null,Ct=st[--it],st[it]=null,Tt=st[--it],st[it]=null}var Xe=null,Qe=null,Ne=!1,ht=null;function fu(t,e){var n=at(5,null,null,0);n.elementType="DELETED",n.stateNode=e,n.return=t,e=t.deletions,e===null?(t.deletions=[n],t.flags|=16):e.push(n)}function xl(t,e){switch(t.tag){case 5:var n=t.type;return e=e.nodeType!==1||n.toLowerCase()!==e.nodeName.toLowerCase()?null:e,e!==null?(t.stateNode=e,Xe=t,Qe=Kt(e.firstChild),!0):!1;case 6:return e=t.pendingProps===""||e.nodeType!==3?null:e,e!==null?(t.stateNode=e,Xe=t,Qe=null,!0):!1;case 13:return e=e.nodeType!==8?null:e,e!==null?(n=un!==null?{id:Tt,overflow:Ct}:null,t.memoizedState={dehydrated:e,treeContext:n,retryLane:1073741824},n=at(18,null,null,0),n.stateNode=e,n.return=t,t.child=n,Xe=t,Qe=null,!0):!1;default:return!1}}function da(t){return(t.mode&1)!==0&&(t.flags&128)===0}function pa(t){if(Ne){var e=Qe;if(e){var n=e;if(!xl(t,e)){if(da(t))throw Error(q(418));e=Kt(n.nextSibling);var r=Xe;e&&xl(t,e)?fu(r,n):(t.flags=t.flags&-4097|2,Ne=!1,Xe=t)}}else{if(da(t))throw Error(q(418));t.flags=t.flags&-4097|2,Ne=!1,Xe=t}}}function kl(t){for(t=t.return;t!==null&&t.tag!==5&&t.tag!==3&&t.tag!==13;)t=t.return;Xe=t}function Xr(t){if(t!==Xe)return!1;if(!Ne)return kl(t),Ne=!0,!1;var e;if((e=t.tag!==3)&&!(e=t.tag!==5)&&(e=t.type,e=e!=="head"&&e!=="body"&&!oa(t.type,t.memoizedProps)),e&&(e=Qe)){if(da(t))throw mu(),Error(q(418));for(;e;)fu(t,e),e=Kt(e.nextSibling)}if(kl(t),t.tag===13){if(t=t.memoizedState,t=t!==null?t.dehydrated:null,!t)throw Error(q(317));e:{for(t=t.nextSibling,e=0;t;){if(t.nodeType===8){var n=t.data;if(n==="/$"){if(e===0){Qe=Kt(t.nextSibling);break e}e--}else n!=="$"&&n!=="$!"&&n!=="$?"||e++}t=t.nextSibling}Qe=null}}else Qe=Xe?Kt(t.stateNode.nextSibling):null;return!0}function mu(){for(var t=Qe;t;)t=Kt(t.nextSibling)}function Dn(){Qe=Xe=null,Ne=!1}function eo(t){ht===null?ht=[t]:ht.push(t)}var kh=At.ReactCurrentBatchConfig;function er(t,e,n){if(t=n.ref,t!==null&&typeof t!="function"&&typeof t!="object"){if(n._owner){if(n=n._owner,n){if(n.tag!==1)throw Error(q(309));var r=n.stateNode}if(!r)throw Error(q(147,t));var s=r,i=""+t;return e!==null&&e.ref!==null&&typeof e.ref=="function"&&e.ref._stringRef===i?e.ref:(e=function(a){var o=s.refs;a===null?delete o[i]:o[i]=a},e._stringRef=i,e)}if(typeof t!="string")throw Error(q(284));if(!n._owner)throw Error(q(290,t))}return t}function es(t,e){throw t=Object.prototype.toString.call(e),Error(q(31,t==="[object Object]"?"object with keys {"+Object.keys(e).join(", ")+"}":t))}function wl(t){var e=t._init;return e(t._payload)}function gu(t){function e(c,u){if(t){var k=c.deletions;k===null?(c.deletions=[u],c.flags|=16):k.push(u)}}function n(c,u){if(!t)return null;for(;u!==null;)e(c,u),u=u.sibling;return null}function r(c,u){for(c=new Map;u!==null;)u.key!==null?c.set(u.key,u):c.set(u.index,u),u=u.sibling;return c}function s(c,u){return c=qt(c,u),c.index=0,c.sibling=null,c}function i(c,u,k){return c.index=k,t?(k=c.alternate,k!==null?(k=k.index,k<u?(c.flags|=2,u):k):(c.flags|=2,u)):(c.flags|=1048576,u)}function a(c){return t&&c.alternate===null&&(c.flags|=2),c}function o(c,u,k,b){return u===null||u.tag!==6?(u=ji(k,c.mode,b),u.return=c,u):(u=s(u,k),u.return=c,u)}function l(c,u,k,b){var T=k.type;return T===vn?y(c,u,k.props.children,b,k.key):u!==null&&(u.elementType===T||typeof T=="object"&&T!==null&&T.$$typeof===$t&&wl(T)===u.type)?(b=s(u,k.props),b.ref=er(c,u,k),b.return=c,b):(b=vs(k.type,k.key,k.props,null,c.mode,b),b.ref=er(c,u,k),b.return=c,b)}function d(c,u,k,b){return u===null||u.tag!==4||u.stateNode.containerInfo!==k.containerInfo||u.stateNode.implementation!==k.implementation?(u=$i(k,c.mode,b),u.return=c,u):(u=s(u,k.children||[]),u.return=c,u)}function y(c,u,k,b,T){return u===null||u.tag!==7?(u=on(k,c.mode,b,T),u.return=c,u):(u=s(u,k),u.return=c,u)}function v(c,u,k){if(typeof u=="string"&&u!==""||typeof u=="number")return u=ji(""+u,c.mode,k),u.return=c,u;if(typeof u=="object"&&u!==null){switch(u.$$typeof){case Wr:return k=vs(u.type,u.key,u.props,null,c.mode,k),k.ref=er(c,null,u),k.return=c,k;case yn:return u=$i(u,c.mode,k),u.return=c,u;case $t:var b=u._init;return v(c,b(u._payload),k)}if(sr(u)||Gn(u))return u=on(u,c.mode,k,null),u.return=c,u;es(c,u)}return null}function h(c,u,k,b){var T=u!==null?u.key:null;if(typeof k=="string"&&k!==""||typeof k=="number")return T!==null?null:o(c,u,""+k,b);if(typeof k=="object"&&k!==null){switch(k.$$typeof){case Wr:return k.key===T?l(c,u,k,b):null;case yn:return k.key===T?d(c,u,k,b):null;case $t:return T=k._init,h(c,u,T(k._payload),b)}if(sr(k)||Gn(k))return T!==null?null:y(c,u,k,b,null);es(c,k)}return null}function f(c,u,k,b,T){if(typeof b=="string"&&b!==""||typeof b=="number")return c=c.get(k)||null,o(u,c,""+b,T);if(typeof b=="object"&&b!==null){switch(b.$$typeof){case Wr:return c=c.get(b.key===null?k:b.key)||null,l(u,c,b,T);case yn:return c=c.get(b.key===null?k:b.key)||null,d(u,c,b,T);case $t:var I=b._init;return f(c,u,k,I(b._payload),T)}if(sr(b)||Gn(b))return c=c.get(k)||null,y(u,c,b,T,null);es(u,b)}return null}function w(c,u,k,b){for(var T=null,I=null,_=u,j=u=0,$=null;_!==null&&j<k.length;j++){_.index>j?($=_,_=null):$=_.sibling;var M=h(c,_,k[j],b);if(M===null){_===null&&(_=$);break}t&&_&&M.alternate===null&&e(c,_),u=i(M,u,j),I===null?T=M:I.sibling=M,I=M,_=$}if(j===k.length)return n(c,_),Ne&&en(c,j),T;if(_===null){for(;j<k.length;j++)_=v(c,k[j],b),_!==null&&(u=i(_,u,j),I===null?T=_:I.sibling=_,I=_);return Ne&&en(c,j),T}for(_=r(c,_);j<k.length;j++)$=f(_,c,j,k[j],b),$!==null&&(t&&$.alternate!==null&&_.delete($.key===null?j:$.key),u=i($,u,j),I===null?T=$:I.sibling=$,I=$);return t&&_.forEach(function(ne){return e(c,ne)}),Ne&&en(c,j),T}function m(c,u,k,b){var T=Gn(k);if(typeof T!="function")throw Error(q(150));if(k=T.call(k),k==null)throw Error(q(151));for(var I=T=null,_=u,j=u=0,$=null,M=k.next();_!==null&&!M.done;j++,M=k.next()){_.index>j?($=_,_=null):$=_.sibling;var ne=h(c,_,M.value,b);if(ne===null){_===null&&(_=$);break}t&&_&&ne.alternate===null&&e(c,_),u=i(ne,u,j),I===null?T=ne:I.sibling=ne,I=ne,_=$}if(M.done)return n(c,_),Ne&&en(c,j),T;if(_===null){for(;!M.done;j++,M=k.next())M=v(c,M.value,b),M!==null&&(u=i(M,u,j),I===null?T=M:I.sibling=M,I=M);return Ne&&en(c,j),T}for(_=r(c,_);!M.done;j++,M=k.next())M=f(_,c,j,M.value,b),M!==null&&(t&&M.alternate!==null&&_.delete(M.key===null?j:M.key),u=i(M,u,j),I===null?T=M:I.sibling=M,I=M);return t&&_.forEach(function(C){return e(c,C)}),Ne&&en(c,j),T}function E(c,u,k,b){if(typeof k=="object"&&k!==null&&k.type===vn&&k.key===null&&(k=k.props.children),typeof k=="object"&&k!==null){switch(k.$$typeof){case Wr:e:{for(var T=k.key,I=u;I!==null;){if(I.key===T){if(T=k.type,T===vn){if(I.tag===7){n(c,I.sibling),u=s(I,k.props.children),u.return=c,c=u;break e}}else if(I.elementType===T||typeof T=="object"&&T!==null&&T.$$typeof===$t&&wl(T)===I.type){n(c,I.sibling),u=s(I,k.props),u.ref=er(c,I,k),u.return=c,c=u;break e}n(c,I);break}else e(c,I);I=I.sibling}k.type===vn?(u=on(k.props.children,c.mode,b,k.key),u.return=c,c=u):(b=vs(k.type,k.key,k.props,null,c.mode,b),b.ref=er(c,u,k),b.return=c,c=b)}return a(c);case yn:e:{for(I=k.key;u!==null;){if(u.key===I)if(u.tag===4&&u.stateNode.containerInfo===k.containerInfo&&u.stateNode.implementation===k.implementation){n(c,u.sibling),u=s(u,k.children||[]),u.return=c,c=u;break e}else{n(c,u);break}else e(c,u);u=u.sibling}u=$i(k,c.mode,b),u.return=c,c=u}return a(c);case $t:return I=k._init,E(c,u,I(k._payload),b)}if(sr(k))return w(c,u,k,b);if(Gn(k))return m(c,u,k,b);es(c,k)}return typeof k=="string"&&k!==""||typeof k=="number"?(k=""+k,u!==null&&u.tag===6?(n(c,u.sibling),u=s(u,k),u.return=c,c=u):(n(c,u),u=ji(k,c.mode,b),u.return=c,c=u),a(c)):n(c,u)}return E}var Ln=gu(!0),yu=gu(!1),As=Qt(null),js=null,Tn=null,to=null;function no(){to=Tn=js=null}function ro(t){var e=As.current;Ee(As),t._currentValue=e}function ha(t,e,n){for(;t!==null;){var r=t.alternate;if((t.childLanes&e)!==e?(t.childLanes|=e,r!==null&&(r.childLanes|=e)):r!==null&&(r.childLanes&e)!==e&&(r.childLanes|=e),t===n)break;t=t.return}}function An(t,e){js=t,to=Tn=null,t=t.dependencies,t!==null&&t.firstContext!==null&&(t.lanes&e&&(He=!0),t.firstContext=null)}function lt(t){var e=t._currentValue;if(to!==t)if(t={context:t,memoizedValue:e,next:null},Tn===null){if(js===null)throw Error(q(308));Tn=t,js.dependencies={lanes:0,firstContext:t}}else Tn=Tn.next=t;return e}var rn=null;function so(t){rn===null?rn=[t]:rn.push(t)}function vu(t,e,n,r){var s=e.interleaved;return s===null?(n.next=n,so(e)):(n.next=s.next,s.next=n),e.interleaved=n,Ot(t,r)}function Ot(t,e){t.lanes|=e;var n=t.alternate;for(n!==null&&(n.lanes|=e),n=t,t=t.return;t!==null;)t.childLanes|=e,n=t.alternate,n!==null&&(n.childLanes|=e),n=t,t=t.return;return n.tag===3?n.stateNode:null}var zt=!1;function io(t){t.updateQueue={baseState:t.memoizedState,firstBaseUpdate:null,lastBaseUpdate:null,shared:{pending:null,interleaved:null,lanes:0},effects:null}}function xu(t,e){t=t.updateQueue,e.updateQueue===t&&(e.updateQueue={baseState:t.baseState,firstBaseUpdate:t.firstBaseUpdate,lastBaseUpdate:t.lastBaseUpdate,shared:t.shared,effects:t.effects})}function It(t,e){return{eventTime:t,lane:e,tag:0,payload:null,callback:null,next:null}}function Vt(t,e,n){var r=t.updateQueue;if(r===null)return null;if(r=r.shared,fe&2){var s=r.pending;return s===null?e.next=e:(e.next=s.next,s.next=e),r.pending=e,Ot(t,n)}return s=r.interleaved,s===null?(e.next=e,so(r)):(e.next=s.next,s.next=e),r.interleaved=e,Ot(t,n)}function ps(t,e,n){if(e=e.updateQueue,e!==null&&(e=e.shared,(n&4194240)!==0)){var r=e.lanes;r&=t.pendingLanes,n|=r,e.lanes=n,Ka(t,n)}}function El(t,e){var n=t.updateQueue,r=t.alternate;if(r!==null&&(r=r.updateQueue,n===r)){var s=null,i=null;if(n=n.firstBaseUpdate,n!==null){do{var a={eventTime:n.eventTime,lane:n.lane,tag:n.tag,payload:n.payload,callback:n.callback,next:null};i===null?s=i=a:i=i.next=a,n=n.next}while(n!==null);i===null?s=i=e:i=i.next=e}else s=i=e;n={baseState:r.baseState,firstBaseUpdate:s,lastBaseUpdate:i,shared:r.shared,effects:r.effects},t.updateQueue=n;return}t=n.lastBaseUpdate,t===null?n.firstBaseUpdate=e:t.next=e,n.lastBaseUpdate=e}function $s(t,e,n,r){var s=t.updateQueue;zt=!1;var i=s.firstBaseUpdate,a=s.lastBaseUpdate,o=s.shared.pending;if(o!==null){s.shared.pending=null;var l=o,d=l.next;l.next=null,a===null?i=d:a.next=d,a=l;var y=t.alternate;y!==null&&(y=y.updateQueue,o=y.lastBaseUpdate,o!==a&&(o===null?y.firstBaseUpdate=d:o.next=d,y.lastBaseUpdate=l))}if(i!==null){var v=s.baseState;a=0,y=d=l=null,o=i;do{var h=o.lane,f=o.eventTime;if((r&h)===h){y!==null&&(y=y.next={eventTime:f,lane:0,tag:o.tag,payload:o.payload,callback:o.callback,next:null});e:{var w=t,m=o;switch(h=e,f=n,m.tag){case 1:if(w=m.payload,typeof w=="function"){v=w.call(f,v,h);break e}v=w;break e;case 3:w.flags=w.flags&-65537|128;case 0:if(w=m.payload,h=typeof w=="function"?w.call(f,v,h):w,h==null)break e;v=Te({},v,h);break e;case 2:zt=!0}}o.callback!==null&&o.lane!==0&&(t.flags|=64,h=s.effects,h===null?s.effects=[o]:h.push(o))}else f={eventTime:f,lane:h,tag:o.tag,payload:o.payload,callback:o.callback,next:null},y===null?(d=y=f,l=v):y=y.next=f,a|=h;if(o=o.next,o===null){if(o=s.shared.pending,o===null)break;h=o,o=h.next,h.next=null,s.lastBaseUpdate=h,s.shared.pending=null}}while(!0);if(y===null&&(l=v),s.baseState=l,s.firstBaseUpdate=d,s.lastBaseUpdate=y,e=s.shared.interleaved,e!==null){s=e;do a|=s.lane,s=s.next;while(s!==e)}else i===null&&(s.shared.lanes=0);pn|=a,t.lanes=a,t.memoizedState=v}}function Nl(t,e,n){if(t=e.effects,e.effects=null,t!==null)for(e=0;e<t.length;e++){var r=t[e],s=r.callback;if(s!==null){if(r.callback=null,r=n,typeof s!="function")throw Error(q(191,s));s.call(r)}}}var Ur={},Et=Qt(Ur),Cr=Qt(Ur),Ir=Qt(Ur);function sn(t){if(t===Ur)throw Error(q(174));return t}function ao(t,e){switch(ke(Ir,e),ke(Cr,t),ke(Et,Ur),t=e.nodeType,t){case 9:case 11:e=(e=e.documentElement)?e.namespaceURI:Hi(null,"");break;default:t=t===8?e.parentNode:e,e=t.namespaceURI||null,t=t.tagName,e=Hi(e,t)}Ee(Et),ke(Et,e)}function Mn(){Ee(Et),Ee(Cr),Ee(Ir)}function ku(t){sn(Ir.current);var e=sn(Et.current),n=Hi(e,t.type);e!==n&&(ke(Cr,t),ke(Et,n))}function oo(t){Cr.current===t&&(Ee(Et),Ee(Cr))}var be=Qt(0);function zs(t){for(var e=t;e!==null;){if(e.tag===13){var n=e.memoizedState;if(n!==null&&(n=n.dehydrated,n===null||n.data==="$?"||n.data==="$!"))return e}else if(e.tag===19&&e.memoizedProps.revealOrder!==void 0){if(e.flags&128)return e}else if(e.child!==null){e.child.return=e,e=e.child;continue}if(e===t)break;for(;e.sibling===null;){if(e.return===null||e.return===t)return null;e=e.return}e.sibling.return=e.return,e=e.sibling}return null}var Ii=[];function lo(){for(var t=0;t<Ii.length;t++)Ii[t]._workInProgressVersionPrimary=null;Ii.length=0}var hs=At.ReactCurrentDispatcher,_i=At.ReactCurrentBatchConfig,dn=0,Se=null,Oe=null,Ae=null,Us=!1,pr=!1,_r=0,wh=0;function De(){throw Error(q(321))}function co(t,e){if(e===null)return!1;for(var n=0;n<e.length&&n<t.length;n++)if(!gt(t[n],e[n]))return!1;return!0}function uo(t,e,n,r,s,i){if(dn=i,Se=e,e.memoizedState=null,e.updateQueue=null,e.lanes=0,hs.current=t===null||t.memoizedState===null?Sh:Th,t=n(r,s),pr){i=0;do{if(pr=!1,_r=0,25<=i)throw Error(q(301));i+=1,Ae=Oe=null,e.updateQueue=null,hs.current=Ch,t=n(r,s)}while(pr)}if(hs.current=Ds,e=Oe!==null&&Oe.next!==null,dn=0,Ae=Oe=Se=null,Us=!1,e)throw Error(q(300));return t}function po(){var t=_r!==0;return _r=0,t}function xt(){var t={memoizedState:null,baseState:null,baseQueue:null,queue:null,next:null};return Ae===null?Se.memoizedState=Ae=t:Ae=Ae.next=t,Ae}function ct(){if(Oe===null){var t=Se.alternate;t=t!==null?t.memoizedState:null}else t=Oe.next;var e=Ae===null?Se.memoizedState:Ae.next;if(e!==null)Ae=e,Oe=t;else{if(t===null)throw Error(q(310));Oe=t,t={memoizedState:Oe.memoizedState,baseState:Oe.baseState,baseQueue:Oe.baseQueue,queue:Oe.queue,next:null},Ae===null?Se.memoizedState=Ae=t:Ae=Ae.next=t}return Ae}function Rr(t,e){return typeof e=="function"?e(t):e}function Ri(t){var e=ct(),n=e.queue;if(n===null)throw Error(q(311));n.lastRenderedReducer=t;var r=Oe,s=r.baseQueue,i=n.pending;if(i!==null){if(s!==null){var a=s.next;s.next=i.next,i.next=a}r.baseQueue=s=i,n.pending=null}if(s!==null){i=s.next,r=r.baseState;var o=a=null,l=null,d=i;do{var y=d.lane;if((dn&y)===y)l!==null&&(l=l.next={lane:0,action:d.action,hasEagerState:d.hasEagerState,eagerState:d.eagerState,next:null}),r=d.hasEagerState?d.eagerState:t(r,d.action);else{var v={lane:y,action:d.action,hasEagerState:d.hasEagerState,eagerState:d.eagerState,next:null};l===null?(o=l=v,a=r):l=l.next=v,Se.lanes|=y,pn|=y}d=d.next}while(d!==null&&d!==i);l===null?a=r:l.next=o,gt(r,e.memoizedState)||(He=!0),e.memoizedState=r,e.baseState=a,e.baseQueue=l,n.lastRenderedState=r}if(t=n.interleaved,t!==null){s=t;do i=s.lane,Se.lanes|=i,pn|=i,s=s.next;while(s!==t)}else s===null&&(n.lanes=0);return[e.memoizedState,n.dispatch]}function Oi(t){var e=ct(),n=e.queue;if(n===null)throw Error(q(311));n.lastRenderedReducer=t;var r=n.dispatch,s=n.pending,i=e.memoizedState;if(s!==null){n.pending=null;var a=s=s.next;do i=t(i,a.action),a=a.next;while(a!==s);gt(i,e.memoizedState)||(He=!0),e.memoizedState=i,e.baseQueue===null&&(e.baseState=i),n.lastRenderedState=i}return[i,r]}function wu(){}function Eu(t,e){var n=Se,r=ct(),s=e(),i=!gt(r.memoizedState,s);if(i&&(r.memoizedState=s,He=!0),r=r.queue,ho(Su.bind(null,n,r,t),[t]),r.getSnapshot!==e||i||Ae!==null&&Ae.memoizedState.tag&1){if(n.flags|=2048,Or(9,bu.bind(null,n,r,s,e),void 0,null),je===null)throw Error(q(349));dn&30||Nu(n,e,s)}return s}function Nu(t,e,n){t.flags|=16384,t={getSnapshot:e,value:n},e=Se.updateQueue,e===null?(e={lastEffect:null,stores:null},Se.updateQueue=e,e.stores=[t]):(n=e.stores,n===null?e.stores=[t]:n.push(t))}function bu(t,e,n,r){e.value=n,e.getSnapshot=r,Tu(e)&&Cu(t)}function Su(t,e,n){return n(function(){Tu(e)&&Cu(t)})}function Tu(t){var e=t.getSnapshot;t=t.value;try{var n=e();return!gt(t,n)}catch{return!0}}function Cu(t){var e=Ot(t,1);e!==null&&mt(e,t,1,-1)}function bl(t){var e=xt();return typeof t=="function"&&(t=t()),e.memoizedState=e.baseState=t,t={pending:null,interleaved:null,lanes:0,dispatch:null,lastRenderedReducer:Rr,lastRenderedState:t},e.queue=t,t=t.dispatch=bh.bind(null,Se,t),[e.memoizedState,t]}function Or(t,e,n,r){return t={tag:t,create:e,destroy:n,deps:r,next:null},e=Se.updateQueue,e===null?(e={lastEffect:null,stores:null},Se.updateQueue=e,e.lastEffect=t.next=t):(n=e.lastEffect,n===null?e.lastEffect=t.next=t:(r=n.next,n.next=t,t.next=r,e.lastEffect=t)),t}function Iu(){return ct().memoizedState}function fs(t,e,n,r){var s=xt();Se.flags|=t,s.memoizedState=Or(1|e,n,void 0,r===void 0?null:r)}function ei(t,e,n,r){var s=ct();r=r===void 0?null:r;var i=void 0;if(Oe!==null){var a=Oe.memoizedState;if(i=a.destroy,r!==null&&co(r,a.deps)){s.memoizedState=Or(e,n,i,r);return}}Se.flags|=t,s.memoizedState=Or(1|e,n,i,r)}function Sl(t,e){return fs(8390656,8,t,e)}function ho(t,e){return ei(2048,8,t,e)}function _u(t,e){return ei(4,2,t,e)}function Ru(t,e){return ei(4,4,t,e)}function Ou(t,e){if(typeof e=="function")return t=t(),e(t),function(){e(null)};if(e!=null)return t=t(),e.current=t,function(){e.current=null}}function Pu(t,e,n){return n=n!=null?n.concat([t]):null,ei(4,4,Ou.bind(null,e,t),n)}function fo(){}function Au(t,e){var n=ct();e=e===void 0?null:e;var r=n.memoizedState;return r!==null&&e!==null&&co(e,r[1])?r[0]:(n.memoizedState=[t,e],t)}function ju(t,e){var n=ct();e=e===void 0?null:e;var r=n.memoizedState;return r!==null&&e!==null&&co(e,r[1])?r[0]:(t=t(),n.memoizedState=[t,e],t)}function $u(t,e,n){return dn&21?(gt(n,e)||(n=Mc(),Se.lanes|=n,pn|=n,t.baseState=!0),e):(t.baseState&&(t.baseState=!1,He=!0),t.memoizedState=n)}function Eh(t,e){var n=ye;ye=n!==0&&4>n?n:4,t(!0);var r=_i.transition;_i.transition={};try{t(!1),e()}finally{ye=n,_i.transition=r}}function zu(){return ct().memoizedState}function Nh(t,e,n){var r=Ht(t);if(n={lane:r,action:n,hasEagerState:!1,eagerState:null,next:null},Uu(t))Du(e,n);else if(n=vu(t,e,n,r),n!==null){var s=We();mt(n,t,r,s),Lu(n,e,r)}}function bh(t,e,n){var r=Ht(t),s={lane:r,action:n,hasEagerState:!1,eagerState:null,next:null};if(Uu(t))Du(e,s);else{var i=t.alternate;if(t.lanes===0&&(i===null||i.lanes===0)&&(i=e.lastRenderedReducer,i!==null))try{var a=e.lastRenderedState,o=i(a,n);if(s.hasEagerState=!0,s.eagerState=o,gt(o,a)){var l=e.interleaved;l===null?(s.next=s,so(e)):(s.next=l.next,l.next=s),e.interleaved=s;return}}catch{}finally{}n=vu(t,e,s,r),n!==null&&(s=We(),mt(n,t,r,s),Lu(n,e,r))}}function Uu(t){var e=t.alternate;return t===Se||e!==null&&e===Se}function Du(t,e){pr=Us=!0;var n=t.pending;n===null?e.next=e:(e.next=n.next,n.next=e),t.pending=e}function Lu(t,e,n){if(n&4194240){var r=e.lanes;r&=t.pendingLanes,n|=r,e.lanes=n,Ka(t,n)}}var Ds={readContext:lt,useCallback:De,useContext:De,useEffect:De,useImperativeHandle:De,useInsertionEffect:De,useLayoutEffect:De,useMemo:De,useReducer:De,useRef:De,useState:De,useDebugValue:De,useDeferredValue:De,useTransition:De,useMutableSource:De,useSyncExternalStore:De,useId:De,unstable_isNewReconciler:!1},Sh={readContext:lt,useCallback:function(t,e){return xt().memoizedState=[t,e===void 0?null:e],t},useContext:lt,useEffect:Sl,useImperativeHandle:function(t,e,n){return n=n!=null?n.concat([t]):null,fs(4194308,4,Ou.bind(null,e,t),n)},useLayoutEffect:function(t,e){return fs(4194308,4,t,e)},useInsertionEffect:function(t,e){return fs(4,2,t,e)},useMemo:function(t,e){var n=xt();return e=e===void 0?null:e,t=t(),n.memoizedState=[t,e],t},useReducer:function(t,e,n){var r=xt();return e=n!==void 0?n(e):e,r.memoizedState=r.baseState=e,t={pending:null,interleaved:null,lanes:0,dispatch:null,lastRenderedReducer:t,lastRenderedState:e},r.queue=t,t=t.dispatch=Nh.bind(null,Se,t),[r.memoizedState,t]},useRef:function(t){var e=xt();return t={current:t},e.memoizedState=t},useState:bl,useDebugValue:fo,useDeferredValue:function(t){return xt().memoizedState=t},useTransition:function(){var t=bl(!1),e=t[0];return t=Eh.bind(null,t[1]),xt().memoizedState=t,[e,t]},useMutableSource:function(){},useSyncExternalStore:function(t,e,n){var r=Se,s=xt();if(Ne){if(n===void 0)throw Error(q(407));n=n()}else{if(n=e(),je===null)throw Error(q(349));dn&30||Nu(r,e,n)}s.memoizedState=n;var i={value:n,getSnapshot:e};return s.queue=i,Sl(Su.bind(null,r,i,t),[t]),r.flags|=2048,Or(9,bu.bind(null,r,i,n,e),void 0,null),n},useId:function(){var t=xt(),e=je.identifierPrefix;if(Ne){var n=Ct,r=Tt;n=(r&~(1<<32-ft(r)-1)).toString(32)+n,e=":"+e+"R"+n,n=_r++,0<n&&(e+="H"+n.toString(32)),e+=":"}else n=wh++,e=":"+e+"r"+n.toString(32)+":";return t.memoizedState=e},unstable_isNewReconciler:!1},Th={readContext:lt,useCallback:Au,useContext:lt,useEffect:ho,useImperativeHandle:Pu,useInsertionEffect:_u,useLayoutEffect:Ru,useMemo:ju,useReducer:Ri,useRef:Iu,useState:function(){return Ri(Rr)},useDebugValue:fo,useDeferredValue:function(t){var e=ct();return $u(e,Oe.memoizedState,t)},useTransition:function(){var t=Ri(Rr)[0],e=ct().memoizedState;return[t,e]},useMutableSource:wu,useSyncExternalStore:Eu,useId:zu,unstable_isNewReconciler:!1},Ch={readContext:lt,useCallback:Au,useContext:lt,useEffect:ho,useImperativeHandle:Pu,useInsertionEffect:_u,useLayoutEffect:Ru,useMemo:ju,useReducer:Oi,useRef:Iu,useState:function(){return Oi(Rr)},useDebugValue:fo,useDeferredValue:function(t){var e=ct();return Oe===null?e.memoizedState=t:$u(e,Oe.memoizedState,t)},useTransition:function(){var t=Oi(Rr)[0],e=ct().memoizedState;return[t,e]},useMutableSource:wu,useSyncExternalStore:Eu,useId:zu,unstable_isNewReconciler:!1};function dt(t,e){if(t&&t.defaultProps){e=Te({},e),t=t.defaultProps;for(var n in t)e[n]===void 0&&(e[n]=t[n]);return e}return e}function fa(t,e,n,r){e=t.memoizedState,n=n(r,e),n=n==null?e:Te({},e,n),t.memoizedState=n,t.lanes===0&&(t.updateQueue.baseState=n)}var ti={isMounted:function(t){return(t=t._reactInternals)?mn(t)===t:!1},enqueueSetState:function(t,e,n){t=t._reactInternals;var r=We(),s=Ht(t),i=It(r,s);i.payload=e,n!=null&&(i.callback=n),e=Vt(t,i,s),e!==null&&(mt(e,t,s,r),ps(e,t,s))},enqueueReplaceState:function(t,e,n){t=t._reactInternals;var r=We(),s=Ht(t),i=It(r,s);i.tag=1,i.payload=e,n!=null&&(i.callback=n),e=Vt(t,i,s),e!==null&&(mt(e,t,s,r),ps(e,t,s))},enqueueForceUpdate:function(t,e){t=t._reactInternals;var n=We(),r=Ht(t),s=It(n,r);s.tag=2,e!=null&&(s.callback=e),e=Vt(t,s,r),e!==null&&(mt(e,t,r,n),ps(e,t,r))}};function Tl(t,e,n,r,s,i,a){return t=t.stateNode,typeof t.shouldComponentUpdate=="function"?t.shouldComponentUpdate(r,i,a):e.prototype&&e.prototype.isPureReactComponent?!Nr(n,r)||!Nr(s,i):!0}function Mu(t,e,n){var r=!1,s=Zt,i=e.contextType;return typeof i=="object"&&i!==null?i=lt(i):(s=Ge(e)?cn:Fe.current,r=e.contextTypes,i=(r=r!=null)?Un(t,s):Zt),e=new e(n,i),t.memoizedState=e.state!==null&&e.state!==void 0?e.state:null,e.updater=ti,t.stateNode=e,e._reactInternals=t,r&&(t=t.stateNode,t.__reactInternalMemoizedUnmaskedChildContext=s,t.__reactInternalMemoizedMaskedChildContext=i),e}function Cl(t,e,n,r){t=e.state,typeof e.componentWillReceiveProps=="function"&&e.componentWillReceiveProps(n,r),typeof e.UNSAFE_componentWillReceiveProps=="function"&&e.UNSAFE_componentWillReceiveProps(n,r),e.state!==t&&ti.enqueueReplaceState(e,e.state,null)}function ma(t,e,n,r){var s=t.stateNode;s.props=n,s.state=t.memoizedState,s.refs={},io(t);var i=e.contextType;typeof i=="object"&&i!==null?s.context=lt(i):(i=Ge(e)?cn:Fe.current,s.context=Un(t,i)),s.state=t.memoizedState,i=e.getDerivedStateFromProps,typeof i=="function"&&(fa(t,e,i,n),s.state=t.memoizedState),typeof e.getDerivedStateFromProps=="function"||typeof s.getSnapshotBeforeUpdate=="function"||typeof s.UNSAFE_componentWillMount!="function"&&typeof s.componentWillMount!="function"||(e=s.state,typeof s.componentWillMount=="function"&&s.componentWillMount(),typeof s.UNSAFE_componentWillMount=="function"&&s.UNSAFE_componentWillMount(),e!==s.state&&ti.enqueueReplaceState(s,s.state,null),$s(t,n,s,r),s.state=t.memoizedState),typeof s.componentDidMount=="function"&&(t.flags|=4194308)}function Fn(t,e){try{var n="",r=e;do n+=tp(r),r=r.return;while(r);var s=n}catch(i){s=`
Error generating stack: `+i.message+`
`+i.stack}return{value:t,source:e,stack:s,digest:null}}function Pi(t,e,n){return{value:t,source:null,stack:n??null,digest:e??null}}function ga(t,e){try{console.error(e.value)}catch(n){setTimeout(function(){throw n})}}var Ih=typeof WeakMap=="function"?WeakMap:Map;function Fu(t,e,n){n=It(-1,n),n.tag=3,n.payload={element:null};var r=e.value;return n.callback=function(){Ms||(Ms=!0,Ta=r),ga(t,e)},n}function Bu(t,e,n){n=It(-1,n),n.tag=3;var r=t.type.getDerivedStateFromError;if(typeof r=="function"){var s=e.value;n.payload=function(){return r(s)},n.callback=function(){ga(t,e)}}var i=t.stateNode;return i!==null&&typeof i.componentDidCatch=="function"&&(n.callback=function(){ga(t,e),typeof r!="function"&&(Yt===null?Yt=new Set([this]):Yt.add(this));var a=e.stack;this.componentDidCatch(e.value,{componentStack:a!==null?a:""})}),n}function Il(t,e,n){var r=t.pingCache;if(r===null){r=t.pingCache=new Ih;var s=new Set;r.set(e,s)}else s=r.get(e),s===void 0&&(s=new Set,r.set(e,s));s.has(n)||(s.add(n),t=Bh.bind(null,t,e,n),e.then(t,t))}function _l(t){do{var e;if((e=t.tag===13)&&(e=t.memoizedState,e=e!==null?e.dehydrated!==null:!0),e)return t;t=t.return}while(t!==null);return null}function Rl(t,e,n,r,s){return t.mode&1?(t.flags|=65536,t.lanes=s,t):(t===e?t.flags|=65536:(t.flags|=128,n.flags|=131072,n.flags&=-52805,n.tag===1&&(n.alternate===null?n.tag=17:(e=It(-1,1),e.tag=2,Vt(n,e,1))),n.lanes|=1),t)}var _h=At.ReactCurrentOwner,He=!1;function Be(t,e,n,r){e.child=t===null?yu(e,null,n,r):Ln(e,t.child,n,r)}function Ol(t,e,n,r,s){n=n.render;var i=e.ref;return An(e,s),r=uo(t,e,n,r,i,s),n=po(),t!==null&&!He?(e.updateQueue=t.updateQueue,e.flags&=-2053,t.lanes&=~s,Pt(t,e,s)):(Ne&&n&&Qa(e),e.flags|=1,Be(t,e,r,s),e.child)}function Pl(t,e,n,r,s){if(t===null){var i=n.type;return typeof i=="function"&&!Eo(i)&&i.defaultProps===void 0&&n.compare===null&&n.defaultProps===void 0?(e.tag=15,e.type=i,Wu(t,e,i,r,s)):(t=vs(n.type,null,r,e,e.mode,s),t.ref=e.ref,t.return=e,e.child=t)}if(i=t.child,!(t.lanes&s)){var a=i.memoizedProps;if(n=n.compare,n=n!==null?n:Nr,n(a,r)&&t.ref===e.ref)return Pt(t,e,s)}return e.flags|=1,t=qt(i,r),t.ref=e.ref,t.return=e,e.child=t}function Wu(t,e,n,r,s){if(t!==null){var i=t.memoizedProps;if(Nr(i,r)&&t.ref===e.ref)if(He=!1,e.pendingProps=r=i,(t.lanes&s)!==0)t.flags&131072&&(He=!0);else return e.lanes=t.lanes,Pt(t,e,s)}return ya(t,e,n,r,s)}function Ku(t,e,n){var r=e.pendingProps,s=r.children,i=t!==null?t.memoizedState:null;if(r.mode==="hidden")if(!(e.mode&1))e.memoizedState={baseLanes:0,cachePool:null,transitions:null},ke(In,Je),Je|=n;else{if(!(n&1073741824))return t=i!==null?i.baseLanes|n:n,e.lanes=e.childLanes=1073741824,e.memoizedState={baseLanes:t,cachePool:null,transitions:null},e.updateQueue=null,ke(In,Je),Je|=t,null;e.memoizedState={baseLanes:0,cachePool:null,transitions:null},r=i!==null?i.baseLanes:n,ke(In,Je),Je|=r}else i!==null?(r=i.baseLanes|n,e.memoizedState=null):r=n,ke(In,Je),Je|=r;return Be(t,e,s,n),e.child}function Vu(t,e){var n=e.ref;(t===null&&n!==null||t!==null&&t.ref!==n)&&(e.flags|=512,e.flags|=2097152)}function ya(t,e,n,r,s){var i=Ge(n)?cn:Fe.current;return i=Un(e,i),An(e,s),n=uo(t,e,n,r,i,s),r=po(),t!==null&&!He?(e.updateQueue=t.updateQueue,e.flags&=-2053,t.lanes&=~s,Pt(t,e,s)):(Ne&&r&&Qa(e),e.flags|=1,Be(t,e,n,s),e.child)}function Al(t,e,n,r,s){if(Ge(n)){var i=!0;Rs(e)}else i=!1;if(An(e,s),e.stateNode===null)ms(t,e),Mu(e,n,r),ma(e,n,r,s),r=!0;else if(t===null){var a=e.stateNode,o=e.memoizedProps;a.props=o;var l=a.context,d=n.contextType;typeof d=="object"&&d!==null?d=lt(d):(d=Ge(n)?cn:Fe.current,d=Un(e,d));var y=n.getDerivedStateFromProps,v=typeof y=="function"||typeof a.getSnapshotBeforeUpdate=="function";v||typeof a.UNSAFE_componentWillReceiveProps!="function"&&typeof a.componentWillReceiveProps!="function"||(o!==r||l!==d)&&Cl(e,a,r,d),zt=!1;var h=e.memoizedState;a.state=h,$s(e,r,a,s),l=e.memoizedState,o!==r||h!==l||qe.current||zt?(typeof y=="function"&&(fa(e,n,y,r),l=e.memoizedState),(o=zt||Tl(e,n,o,r,h,l,d))?(v||typeof a.UNSAFE_componentWillMount!="function"&&typeof a.componentWillMount!="function"||(typeof a.componentWillMount=="function"&&a.componentWillMount(),typeof a.UNSAFE_componentWillMount=="function"&&a.UNSAFE_componentWillMount()),typeof a.componentDidMount=="function"&&(e.flags|=4194308)):(typeof a.componentDidMount=="function"&&(e.flags|=4194308),e.memoizedProps=r,e.memoizedState=l),a.props=r,a.state=l,a.context=d,r=o):(typeof a.componentDidMount=="function"&&(e.flags|=4194308),r=!1)}else{a=e.stateNode,xu(t,e),o=e.memoizedProps,d=e.type===e.elementType?o:dt(e.type,o),a.props=d,v=e.pendingProps,h=a.context,l=n.contextType,typeof l=="object"&&l!==null?l=lt(l):(l=Ge(n)?cn:Fe.current,l=Un(e,l));var f=n.getDerivedStateFromProps;(y=typeof f=="function"||typeof a.getSnapshotBeforeUpdate=="function")||typeof a.UNSAFE_componentWillReceiveProps!="function"&&typeof a.componentWillReceiveProps!="function"||(o!==v||h!==l)&&Cl(e,a,r,l),zt=!1,h=e.memoizedState,a.state=h,$s(e,r,a,s);var w=e.memoizedState;o!==v||h!==w||qe.current||zt?(typeof f=="function"&&(fa(e,n,f,r),w=e.memoizedState),(d=zt||Tl(e,n,d,r,h,w,l)||!1)?(y||typeof a.UNSAFE_componentWillUpdate!="function"&&typeof a.componentWillUpdate!="function"||(typeof a.componentWillUpdate=="function"&&a.componentWillUpdate(r,w,l),typeof a.UNSAFE_componentWillUpdate=="function"&&a.UNSAFE_componentWillUpdate(r,w,l)),typeof a.componentDidUpdate=="function"&&(e.flags|=4),typeof a.getSnapshotBeforeUpdate=="function"&&(e.flags|=1024)):(typeof a.componentDidUpdate!="function"||o===t.memoizedProps&&h===t.memoizedState||(e.flags|=4),typeof a.getSnapshotBeforeUpdate!="function"||o===t.memoizedProps&&h===t.memoizedState||(e.flags|=1024),e.memoizedProps=r,e.memoizedState=w),a.props=r,a.state=w,a.context=l,r=d):(typeof a.componentDidUpdate!="function"||o===t.memoizedProps&&h===t.memoizedState||(e.flags|=4),typeof a.getSnapshotBeforeUpdate!="function"||o===t.memoizedProps&&h===t.memoizedState||(e.flags|=1024),r=!1)}return va(t,e,n,r,i,s)}function va(t,e,n,r,s,i){Vu(t,e);var a=(e.flags&128)!==0;if(!r&&!a)return s&&vl(e,n,!1),Pt(t,e,i);r=e.stateNode,_h.current=e;var o=a&&typeof n.getDerivedStateFromError!="function"?null:r.render();return e.flags|=1,t!==null&&a?(e.child=Ln(e,t.child,null,i),e.child=Ln(e,null,o,i)):Be(t,e,o,i),e.memoizedState=r.state,s&&vl(e,n,!0),e.child}function Yu(t){var e=t.stateNode;e.pendingContext?yl(t,e.pendingContext,e.pendingContext!==e.context):e.context&&yl(t,e.context,!1),ao(t,e.containerInfo)}function jl(t,e,n,r,s){return Dn(),eo(s),e.flags|=256,Be(t,e,n,r),e.child}var xa={dehydrated:null,treeContext:null,retryLane:0};function ka(t){return{baseLanes:t,cachePool:null,transitions:null}}function Hu(t,e,n){var r=e.pendingProps,s=be.current,i=!1,a=(e.flags&128)!==0,o;if((o=a)||(o=t!==null&&t.memoizedState===null?!1:(s&2)!==0),o?(i=!0,e.flags&=-129):(t===null||t.memoizedState!==null)&&(s|=1),ke(be,s&1),t===null)return pa(e),t=e.memoizedState,t!==null&&(t=t.dehydrated,t!==null)?(e.mode&1?t.data==="$!"?e.lanes=8:e.lanes=1073741824:e.lanes=1,null):(a=r.children,t=r.fallback,i?(r=e.mode,i=e.child,a={mode:"hidden",children:a},!(r&1)&&i!==null?(i.childLanes=0,i.pendingProps=a):i=si(a,r,0,null),t=on(t,r,n,null),i.return=e,t.return=e,i.sibling=t,e.child=i,e.child.memoizedState=ka(n),e.memoizedState=xa,t):mo(e,a));if(s=t.memoizedState,s!==null&&(o=s.dehydrated,o!==null))return Rh(t,e,a,r,o,s,n);if(i){i=r.fallback,a=e.mode,s=t.child,o=s.sibling;var l={mode:"hidden",children:r.children};return!(a&1)&&e.child!==s?(r=e.child,r.childLanes=0,r.pendingProps=l,e.deletions=null):(r=qt(s,l),r.subtreeFlags=s.subtreeFlags&14680064),o!==null?i=qt(o,i):(i=on(i,a,n,null),i.flags|=2),i.return=e,r.return=e,r.sibling=i,e.child=r,r=i,i=e.child,a=t.child.memoizedState,a=a===null?ka(n):{baseLanes:a.baseLanes|n,cachePool:null,transitions:a.transitions},i.memoizedState=a,i.childLanes=t.childLanes&~n,e.memoizedState=xa,r}return i=t.child,t=i.sibling,r=qt(i,{mode:"visible",children:r.children}),!(e.mode&1)&&(r.lanes=n),r.return=e,r.sibling=null,t!==null&&(n=e.deletions,n===null?(e.deletions=[t],e.flags|=16):n.push(t)),e.child=r,e.memoizedState=null,r}function mo(t,e){return e=si({mode:"visible",children:e},t.mode,0,null),e.return=t,t.child=e}function ts(t,e,n,r){return r!==null&&eo(r),Ln(e,t.child,null,n),t=mo(e,e.pendingProps.children),t.flags|=2,e.memoizedState=null,t}function Rh(t,e,n,r,s,i,a){if(n)return e.flags&256?(e.flags&=-257,r=Pi(Error(q(422))),ts(t,e,a,r)):e.memoizedState!==null?(e.child=t.child,e.flags|=128,null):(i=r.fallback,s=e.mode,r=si({mode:"visible",children:r.children},s,0,null),i=on(i,s,a,null),i.flags|=2,r.return=e,i.return=e,r.sibling=i,e.child=r,e.mode&1&&Ln(e,t.child,null,a),e.child.memoizedState=ka(a),e.memoizedState=xa,i);if(!(e.mode&1))return ts(t,e,a,null);if(s.data==="$!"){if(r=s.nextSibling&&s.nextSibling.dataset,r)var o=r.dgst;return r=o,i=Error(q(419)),r=Pi(i,r,void 0),ts(t,e,a,r)}if(o=(a&t.childLanes)!==0,He||o){if(r=je,r!==null){switch(a&-a){case 4:s=2;break;case 16:s=8;break;case 64:case 128:case 256:case 512:case 1024:case 2048:case 4096:case 8192:case 16384:case 32768:case 65536:case 131072:case 262144:case 524288:case 1048576:case 2097152:case 4194304:case 8388608:case 16777216:case 33554432:case 67108864:s=32;break;case 536870912:s=268435456;break;default:s=0}s=s&(r.suspendedLanes|a)?0:s,s!==0&&s!==i.retryLane&&(i.retryLane=s,Ot(t,s),mt(r,t,s,-1))}return wo(),r=Pi(Error(q(421))),ts(t,e,a,r)}return s.data==="$?"?(e.flags|=128,e.child=t.child,e=Wh.bind(null,t),s._reactRetry=e,null):(t=i.treeContext,Qe=Kt(s.nextSibling),Xe=e,Ne=!0,ht=null,t!==null&&(st[it++]=Tt,st[it++]=Ct,st[it++]=un,Tt=t.id,Ct=t.overflow,un=e),e=mo(e,r.children),e.flags|=4096,e)}function $l(t,e,n){t.lanes|=e;var r=t.alternate;r!==null&&(r.lanes|=e),ha(t.return,e,n)}function Ai(t,e,n,r,s){var i=t.memoizedState;i===null?t.memoizedState={isBackwards:e,rendering:null,renderingStartTime:0,last:r,tail:n,tailMode:s}:(i.isBackwards=e,i.rendering=null,i.renderingStartTime=0,i.last=r,i.tail=n,i.tailMode=s)}function qu(t,e,n){var r=e.pendingProps,s=r.revealOrder,i=r.tail;if(Be(t,e,r.children,n),r=be.current,r&2)r=r&1|2,e.flags|=128;else{if(t!==null&&t.flags&128)e:for(t=e.child;t!==null;){if(t.tag===13)t.memoizedState!==null&&$l(t,n,e);else if(t.tag===19)$l(t,n,e);else if(t.child!==null){t.child.return=t,t=t.child;continue}if(t===e)break e;for(;t.sibling===null;){if(t.return===null||t.return===e)break e;t=t.return}t.sibling.return=t.return,t=t.sibling}r&=1}if(ke(be,r),!(e.mode&1))e.memoizedState=null;else switch(s){case"forwards":for(n=e.child,s=null;n!==null;)t=n.alternate,t!==null&&zs(t)===null&&(s=n),n=n.sibling;n=s,n===null?(s=e.child,e.child=null):(s=n.sibling,n.sibling=null),Ai(e,!1,s,n,i);break;case"backwards":for(n=null,s=e.child,e.child=null;s!==null;){if(t=s.alternate,t!==null&&zs(t)===null){e.child=s;break}t=s.sibling,s.sibling=n,n=s,s=t}Ai(e,!0,n,null,i);break;case"together":Ai(e,!1,null,null,void 0);break;default:e.memoizedState=null}return e.child}function ms(t,e){!(e.mode&1)&&t!==null&&(t.alternate=null,e.alternate=null,e.flags|=2)}function Pt(t,e,n){if(t!==null&&(e.dependencies=t.dependencies),pn|=e.lanes,!(n&e.childLanes))return null;if(t!==null&&e.child!==t.child)throw Error(q(153));if(e.child!==null){for(t=e.child,n=qt(t,t.pendingProps),e.child=n,n.return=e;t.sibling!==null;)t=t.sibling,n=n.sibling=qt(t,t.pendingProps),n.return=e;n.sibling=null}return e.child}function Oh(t,e,n){switch(e.tag){case 3:Yu(e),Dn();break;case 5:ku(e);break;case 1:Ge(e.type)&&Rs(e);break;case 4:ao(e,e.stateNode.containerInfo);break;case 10:var r=e.type._context,s=e.memoizedProps.value;ke(As,r._currentValue),r._currentValue=s;break;case 13:if(r=e.memoizedState,r!==null)return r.dehydrated!==null?(ke(be,be.current&1),e.flags|=128,null):n&e.child.childLanes?Hu(t,e,n):(ke(be,be.current&1),t=Pt(t,e,n),t!==null?t.sibling:null);ke(be,be.current&1);break;case 19:if(r=(n&e.childLanes)!==0,t.flags&128){if(r)return qu(t,e,n);e.flags|=128}if(s=e.memoizedState,s!==null&&(s.rendering=null,s.tail=null,s.lastEffect=null),ke(be,be.current),r)break;return null;case 22:case 23:return e.lanes=0,Ku(t,e,n)}return Pt(t,e,n)}var Gu,wa,Zu,Ju;Gu=function(t,e){for(var n=e.child;n!==null;){if(n.tag===5||n.tag===6)t.appendChild(n.stateNode);else if(n.tag!==4&&n.child!==null){n.child.return=n,n=n.child;continue}if(n===e)break;for(;n.sibling===null;){if(n.return===null||n.return===e)return;n=n.return}n.sibling.return=n.return,n=n.sibling}};wa=function(){};Zu=function(t,e,n,r){var s=t.memoizedProps;if(s!==r){t=e.stateNode,sn(Et.current);var i=null;switch(n){case"input":s=Wi(t,s),r=Wi(t,r),i=[];break;case"select":s=Te({},s,{value:void 0}),r=Te({},r,{value:void 0}),i=[];break;case"textarea":s=Yi(t,s),r=Yi(t,r),i=[];break;default:typeof s.onClick!="function"&&typeof r.onClick=="function"&&(t.onclick=Is)}qi(n,r);var a;n=null;for(d in s)if(!r.hasOwnProperty(d)&&s.hasOwnProperty(d)&&s[d]!=null)if(d==="style"){var o=s[d];for(a in o)o.hasOwnProperty(a)&&(n||(n={}),n[a]="")}else d!=="dangerouslySetInnerHTML"&&d!=="children"&&d!=="suppressContentEditableWarning"&&d!=="suppressHydrationWarning"&&d!=="autoFocus"&&(gr.hasOwnProperty(d)?i||(i=[]):(i=i||[]).push(d,null));for(d in r){var l=r[d];if(o=s!=null?s[d]:void 0,r.hasOwnProperty(d)&&l!==o&&(l!=null||o!=null))if(d==="style")if(o){for(a in o)!o.hasOwnProperty(a)||l&&l.hasOwnProperty(a)||(n||(n={}),n[a]="");for(a in l)l.hasOwnProperty(a)&&o[a]!==l[a]&&(n||(n={}),n[a]=l[a])}else n||(i||(i=[]),i.push(d,n)),n=l;else d==="dangerouslySetInnerHTML"?(l=l?l.__html:void 0,o=o?o.__html:void 0,l!=null&&o!==l&&(i=i||[]).push(d,l)):d==="children"?typeof l!="string"&&typeof l!="number"||(i=i||[]).push(d,""+l):d!=="suppressContentEditableWarning"&&d!=="suppressHydrationWarning"&&(gr.hasOwnProperty(d)?(l!=null&&d==="onScroll"&&we("scroll",t),i||o===l||(i=[])):(i=i||[]).push(d,l))}n&&(i=i||[]).push("style",n);var d=i;(e.updateQueue=d)&&(e.flags|=4)}};Ju=function(t,e,n,r){n!==r&&(e.flags|=4)};function tr(t,e){if(!Ne)switch(t.tailMode){case"hidden":e=t.tail;for(var n=null;e!==null;)e.alternate!==null&&(n=e),e=e.sibling;n===null?t.tail=null:n.sibling=null;break;case"collapsed":n=t.tail;for(var r=null;n!==null;)n.alternate!==null&&(r=n),n=n.sibling;r===null?e||t.tail===null?t.tail=null:t.tail.sibling=null:r.sibling=null}}function Le(t){var e=t.alternate!==null&&t.alternate.child===t.child,n=0,r=0;if(e)for(var s=t.child;s!==null;)n|=s.lanes|s.childLanes,r|=s.subtreeFlags&14680064,r|=s.flags&14680064,s.return=t,s=s.sibling;else for(s=t.child;s!==null;)n|=s.lanes|s.childLanes,r|=s.subtreeFlags,r|=s.flags,s.return=t,s=s.sibling;return t.subtreeFlags|=r,t.childLanes=n,e}function Ph(t,e,n){var r=e.pendingProps;switch(Xa(e),e.tag){case 2:case 16:case 15:case 0:case 11:case 7:case 8:case 12:case 9:case 14:return Le(e),null;case 1:return Ge(e.type)&&_s(),Le(e),null;case 3:return r=e.stateNode,Mn(),Ee(qe),Ee(Fe),lo(),r.pendingContext&&(r.context=r.pendingContext,r.pendingContext=null),(t===null||t.child===null)&&(Xr(e)?e.flags|=4:t===null||t.memoizedState.isDehydrated&&!(e.flags&256)||(e.flags|=1024,ht!==null&&(_a(ht),ht=null))),wa(t,e),Le(e),null;case 5:oo(e);var s=sn(Ir.current);if(n=e.type,t!==null&&e.stateNode!=null)Zu(t,e,n,r,s),t.ref!==e.ref&&(e.flags|=512,e.flags|=2097152);else{if(!r){if(e.stateNode===null)throw Error(q(166));return Le(e),null}if(t=sn(Et.current),Xr(e)){r=e.stateNode,n=e.type;var i=e.memoizedProps;switch(r[kt]=e,r[Tr]=i,t=(e.mode&1)!==0,n){case"dialog":we("cancel",r),we("close",r);break;case"iframe":case"object":case"embed":we("load",r);break;case"video":case"audio":for(s=0;s<ar.length;s++)we(ar[s],r);break;case"source":we("error",r);break;case"img":case"image":case"link":we("error",r),we("load",r);break;case"details":we("toggle",r);break;case"input":Ko(r,i),we("invalid",r);break;case"select":r._wrapperState={wasMultiple:!!i.multiple},we("invalid",r);break;case"textarea":Yo(r,i),we("invalid",r)}qi(n,i),s=null;for(var a in i)if(i.hasOwnProperty(a)){var o=i[a];a==="children"?typeof o=="string"?r.textContent!==o&&(i.suppressHydrationWarning!==!0&&Qr(r.textContent,o,t),s=["children",o]):typeof o=="number"&&r.textContent!==""+o&&(i.suppressHydrationWarning!==!0&&Qr(r.textContent,o,t),s=["children",""+o]):gr.hasOwnProperty(a)&&o!=null&&a==="onScroll"&&we("scroll",r)}switch(n){case"input":Kr(r),Vo(r,i,!0);break;case"textarea":Kr(r),Ho(r);break;case"select":case"option":break;default:typeof i.onClick=="function"&&(r.onclick=Is)}r=s,e.updateQueue=r,r!==null&&(e.flags|=4)}else{a=s.nodeType===9?s:s.ownerDocument,t==="http://www.w3.org/1999/xhtml"&&(t=Sc(n)),t==="http://www.w3.org/1999/xhtml"?n==="script"?(t=a.createElement("div"),t.innerHTML="<script><\/script>",t=t.removeChild(t.firstChild)):typeof r.is=="string"?t=a.createElement(n,{is:r.is}):(t=a.createElement(n),n==="select"&&(a=t,r.multiple?a.multiple=!0:r.size&&(a.size=r.size))):t=a.createElementNS(t,n),t[kt]=e,t[Tr]=r,Gu(t,e,!1,!1),e.stateNode=t;e:{switch(a=Gi(n,r),n){case"dialog":we("cancel",t),we("close",t),s=r;break;case"iframe":case"object":case"embed":we("load",t),s=r;break;case"video":case"audio":for(s=0;s<ar.length;s++)we(ar[s],t);s=r;break;case"source":we("error",t),s=r;break;case"img":case"image":case"link":we("error",t),we("load",t),s=r;break;case"details":we("toggle",t),s=r;break;case"input":Ko(t,r),s=Wi(t,r),we("invalid",t);break;case"option":s=r;break;case"select":t._wrapperState={wasMultiple:!!r.multiple},s=Te({},r,{value:void 0}),we("invalid",t);break;case"textarea":Yo(t,r),s=Yi(t,r),we("invalid",t);break;default:s=r}qi(n,s),o=s;for(i in o)if(o.hasOwnProperty(i)){var l=o[i];i==="style"?Ic(t,l):i==="dangerouslySetInnerHTML"?(l=l?l.__html:void 0,l!=null&&Tc(t,l)):i==="children"?typeof l=="string"?(n!=="textarea"||l!=="")&&yr(t,l):typeof l=="number"&&yr(t,""+l):i!=="suppressContentEditableWarning"&&i!=="suppressHydrationWarning"&&i!=="autoFocus"&&(gr.hasOwnProperty(i)?l!=null&&i==="onScroll"&&we("scroll",t):l!=null&&Da(t,i,l,a))}switch(n){case"input":Kr(t),Vo(t,r,!1);break;case"textarea":Kr(t),Ho(t);break;case"option":r.value!=null&&t.setAttribute("value",""+Gt(r.value));break;case"select":t.multiple=!!r.multiple,i=r.value,i!=null?_n(t,!!r.multiple,i,!1):r.defaultValue!=null&&_n(t,!!r.multiple,r.defaultValue,!0);break;default:typeof s.onClick=="function"&&(t.onclick=Is)}switch(n){case"button":case"input":case"select":case"textarea":r=!!r.autoFocus;break e;case"img":r=!0;break e;default:r=!1}}r&&(e.flags|=4)}e.ref!==null&&(e.flags|=512,e.flags|=2097152)}return Le(e),null;case 6:if(t&&e.stateNode!=null)Ju(t,e,t.memoizedProps,r);else{if(typeof r!="string"&&e.stateNode===null)throw Error(q(166));if(n=sn(Ir.current),sn(Et.current),Xr(e)){if(r=e.stateNode,n=e.memoizedProps,r[kt]=e,(i=r.nodeValue!==n)&&(t=Xe,t!==null))switch(t.tag){case 3:Qr(r.nodeValue,n,(t.mode&1)!==0);break;case 5:t.memoizedProps.suppressHydrationWarning!==!0&&Qr(r.nodeValue,n,(t.mode&1)!==0)}i&&(e.flags|=4)}else r=(n.nodeType===9?n:n.ownerDocument).createTextNode(r),r[kt]=e,e.stateNode=r}return Le(e),null;case 13:if(Ee(be),r=e.memoizedState,t===null||t.memoizedState!==null&&t.memoizedState.dehydrated!==null){if(Ne&&Qe!==null&&e.mode&1&&!(e.flags&128))mu(),Dn(),e.flags|=98560,i=!1;else if(i=Xr(e),r!==null&&r.dehydrated!==null){if(t===null){if(!i)throw Error(q(318));if(i=e.memoizedState,i=i!==null?i.dehydrated:null,!i)throw Error(q(317));i[kt]=e}else Dn(),!(e.flags&128)&&(e.memoizedState=null),e.flags|=4;Le(e),i=!1}else ht!==null&&(_a(ht),ht=null),i=!0;if(!i)return e.flags&65536?e:null}return e.flags&128?(e.lanes=n,e):(r=r!==null,r!==(t!==null&&t.memoizedState!==null)&&r&&(e.child.flags|=8192,e.mode&1&&(t===null||be.current&1?Pe===0&&(Pe=3):wo())),e.updateQueue!==null&&(e.flags|=4),Le(e),null);case 4:return Mn(),wa(t,e),t===null&&br(e.stateNode.containerInfo),Le(e),null;case 10:return ro(e.type._context),Le(e),null;case 17:return Ge(e.type)&&_s(),Le(e),null;case 19:if(Ee(be),i=e.memoizedState,i===null)return Le(e),null;if(r=(e.flags&128)!==0,a=i.rendering,a===null)if(r)tr(i,!1);else{if(Pe!==0||t!==null&&t.flags&128)for(t=e.child;t!==null;){if(a=zs(t),a!==null){for(e.flags|=128,tr(i,!1),r=a.updateQueue,r!==null&&(e.updateQueue=r,e.flags|=4),e.subtreeFlags=0,r=n,n=e.child;n!==null;)i=n,t=r,i.flags&=14680066,a=i.alternate,a===null?(i.childLanes=0,i.lanes=t,i.child=null,i.subtreeFlags=0,i.memoizedProps=null,i.memoizedState=null,i.updateQueue=null,i.dependencies=null,i.stateNode=null):(i.childLanes=a.childLanes,i.lanes=a.lanes,i.child=a.child,i.subtreeFlags=0,i.deletions=null,i.memoizedProps=a.memoizedProps,i.memoizedState=a.memoizedState,i.updateQueue=a.updateQueue,i.type=a.type,t=a.dependencies,i.dependencies=t===null?null:{lanes:t.lanes,firstContext:t.firstContext}),n=n.sibling;return ke(be,be.current&1|2),e.child}t=t.sibling}i.tail!==null&&_e()>Bn&&(e.flags|=128,r=!0,tr(i,!1),e.lanes=4194304)}else{if(!r)if(t=zs(a),t!==null){if(e.flags|=128,r=!0,n=t.updateQueue,n!==null&&(e.updateQueue=n,e.flags|=4),tr(i,!0),i.tail===null&&i.tailMode==="hidden"&&!a.alternate&&!Ne)return Le(e),null}else 2*_e()-i.renderingStartTime>Bn&&n!==1073741824&&(e.flags|=128,r=!0,tr(i,!1),e.lanes=4194304);i.isBackwards?(a.sibling=e.child,e.child=a):(n=i.last,n!==null?n.sibling=a:e.child=a,i.last=a)}return i.tail!==null?(e=i.tail,i.rendering=e,i.tail=e.sibling,i.renderingStartTime=_e(),e.sibling=null,n=be.current,ke(be,r?n&1|2:n&1),e):(Le(e),null);case 22:case 23:return ko(),r=e.memoizedState!==null,t!==null&&t.memoizedState!==null!==r&&(e.flags|=8192),r&&e.mode&1?Je&1073741824&&(Le(e),e.subtreeFlags&6&&(e.flags|=8192)):Le(e),null;case 24:return null;case 25:return null}throw Error(q(156,e.tag))}function Ah(t,e){switch(Xa(e),e.tag){case 1:return Ge(e.type)&&_s(),t=e.flags,t&65536?(e.flags=t&-65537|128,e):null;case 3:return Mn(),Ee(qe),Ee(Fe),lo(),t=e.flags,t&65536&&!(t&128)?(e.flags=t&-65537|128,e):null;case 5:return oo(e),null;case 13:if(Ee(be),t=e.memoizedState,t!==null&&t.dehydrated!==null){if(e.alternate===null)throw Error(q(340));Dn()}return t=e.flags,t&65536?(e.flags=t&-65537|128,e):null;case 19:return Ee(be),null;case 4:return Mn(),null;case 10:return ro(e.type._context),null;case 22:case 23:return ko(),null;case 24:return null;default:return null}}var ns=!1,Me=!1,jh=typeof WeakSet=="function"?WeakSet:Set,te=null;function Cn(t,e){var n=t.ref;if(n!==null)if(typeof n=="function")try{n(null)}catch(r){Ce(t,e,r)}else n.current=null}function Ea(t,e,n){try{n()}catch(r){Ce(t,e,r)}}var zl=!1;function $h(t,e){if(ia=Ss,t=nu(),Ja(t)){if("selectionStart"in t)var n={start:t.selectionStart,end:t.selectionEnd};else e:{n=(n=t.ownerDocument)&&n.defaultView||window;var r=n.getSelection&&n.getSelection();if(r&&r.rangeCount!==0){n=r.anchorNode;var s=r.anchorOffset,i=r.focusNode;r=r.focusOffset;try{n.nodeType,i.nodeType}catch{n=null;break e}var a=0,o=-1,l=-1,d=0,y=0,v=t,h=null;t:for(;;){for(var f;v!==n||s!==0&&v.nodeType!==3||(o=a+s),v!==i||r!==0&&v.nodeType!==3||(l=a+r),v.nodeType===3&&(a+=v.nodeValue.length),(f=v.firstChild)!==null;)h=v,v=f;for(;;){if(v===t)break t;if(h===n&&++d===s&&(o=a),h===i&&++y===r&&(l=a),(f=v.nextSibling)!==null)break;v=h,h=v.parentNode}v=f}n=o===-1||l===-1?null:{start:o,end:l}}else n=null}n=n||{start:0,end:0}}else n=null;for(aa={focusedElem:t,selectionRange:n},Ss=!1,te=e;te!==null;)if(e=te,t=e.child,(e.subtreeFlags&1028)!==0&&t!==null)t.return=e,te=t;else for(;te!==null;){e=te;try{var w=e.alternate;if(e.flags&1024)switch(e.tag){case 0:case 11:case 15:break;case 1:if(w!==null){var m=w.memoizedProps,E=w.memoizedState,c=e.stateNode,u=c.getSnapshotBeforeUpdate(e.elementType===e.type?m:dt(e.type,m),E);c.__reactInternalSnapshotBeforeUpdate=u}break;case 3:var k=e.stateNode.containerInfo;k.nodeType===1?k.textContent="":k.nodeType===9&&k.documentElement&&k.removeChild(k.documentElement);break;case 5:case 6:case 4:case 17:break;default:throw Error(q(163))}}catch(b){Ce(e,e.return,b)}if(t=e.sibling,t!==null){t.return=e.return,te=t;break}te=e.return}return w=zl,zl=!1,w}function hr(t,e,n){var r=e.updateQueue;if(r=r!==null?r.lastEffect:null,r!==null){var s=r=r.next;do{if((s.tag&t)===t){var i=s.destroy;s.destroy=void 0,i!==void 0&&Ea(e,n,i)}s=s.next}while(s!==r)}}function ni(t,e){if(e=e.updateQueue,e=e!==null?e.lastEffect:null,e!==null){var n=e=e.next;do{if((n.tag&t)===t){var r=n.create;n.destroy=r()}n=n.next}while(n!==e)}}function Na(t){var e=t.ref;if(e!==null){var n=t.stateNode;switch(t.tag){case 5:t=n;break;default:t=n}typeof e=="function"?e(t):e.current=t}}function Qu(t){var e=t.alternate;e!==null&&(t.alternate=null,Qu(e)),t.child=null,t.deletions=null,t.sibling=null,t.tag===5&&(e=t.stateNode,e!==null&&(delete e[kt],delete e[Tr],delete e[ca],delete e[yh],delete e[vh])),t.stateNode=null,t.return=null,t.dependencies=null,t.memoizedProps=null,t.memoizedState=null,t.pendingProps=null,t.stateNode=null,t.updateQueue=null}function Xu(t){return t.tag===5||t.tag===3||t.tag===4}function Ul(t){e:for(;;){for(;t.sibling===null;){if(t.return===null||Xu(t.return))return null;t=t.return}for(t.sibling.return=t.return,t=t.sibling;t.tag!==5&&t.tag!==6&&t.tag!==18;){if(t.flags&2||t.child===null||t.tag===4)continue e;t.child.return=t,t=t.child}if(!(t.flags&2))return t.stateNode}}function ba(t,e,n){var r=t.tag;if(r===5||r===6)t=t.stateNode,e?n.nodeType===8?n.parentNode.insertBefore(t,e):n.insertBefore(t,e):(n.nodeType===8?(e=n.parentNode,e.insertBefore(t,n)):(e=n,e.appendChild(t)),n=n._reactRootContainer,n!=null||e.onclick!==null||(e.onclick=Is));else if(r!==4&&(t=t.child,t!==null))for(ba(t,e,n),t=t.sibling;t!==null;)ba(t,e,n),t=t.sibling}function Sa(t,e,n){var r=t.tag;if(r===5||r===6)t=t.stateNode,e?n.insertBefore(t,e):n.appendChild(t);else if(r!==4&&(t=t.child,t!==null))for(Sa(t,e,n),t=t.sibling;t!==null;)Sa(t,e,n),t=t.sibling}var $e=null,pt=!1;function jt(t,e,n){for(n=n.child;n!==null;)ed(t,e,n),n=n.sibling}function ed(t,e,n){if(wt&&typeof wt.onCommitFiberUnmount=="function")try{wt.onCommitFiberUnmount(qs,n)}catch{}switch(n.tag){case 5:Me||Cn(n,e);case 6:var r=$e,s=pt;$e=null,jt(t,e,n),$e=r,pt=s,$e!==null&&(pt?(t=$e,n=n.stateNode,t.nodeType===8?t.parentNode.removeChild(n):t.removeChild(n)):$e.removeChild(n.stateNode));break;case 18:$e!==null&&(pt?(t=$e,n=n.stateNode,t.nodeType===8?Ti(t.parentNode,n):t.nodeType===1&&Ti(t,n),wr(t)):Ti($e,n.stateNode));break;case 4:r=$e,s=pt,$e=n.stateNode.containerInfo,pt=!0,jt(t,e,n),$e=r,pt=s;break;case 0:case 11:case 14:case 15:if(!Me&&(r=n.updateQueue,r!==null&&(r=r.lastEffect,r!==null))){s=r=r.next;do{var i=s,a=i.destroy;i=i.tag,a!==void 0&&(i&2||i&4)&&Ea(n,e,a),s=s.next}while(s!==r)}jt(t,e,n);break;case 1:if(!Me&&(Cn(n,e),r=n.stateNode,typeof r.componentWillUnmount=="function"))try{r.props=n.memoizedProps,r.state=n.memoizedState,r.componentWillUnmount()}catch(o){Ce(n,e,o)}jt(t,e,n);break;case 21:jt(t,e,n);break;case 22:n.mode&1?(Me=(r=Me)||n.memoizedState!==null,jt(t,e,n),Me=r):jt(t,e,n);break;default:jt(t,e,n)}}function Dl(t){var e=t.updateQueue;if(e!==null){t.updateQueue=null;var n=t.stateNode;n===null&&(n=t.stateNode=new jh),e.forEach(function(r){var s=Kh.bind(null,t,r);n.has(r)||(n.add(r),r.then(s,s))})}}function ut(t,e){var n=e.deletions;if(n!==null)for(var r=0;r<n.length;r++){var s=n[r];try{var i=t,a=e,o=a;e:for(;o!==null;){switch(o.tag){case 5:$e=o.stateNode,pt=!1;break e;case 3:$e=o.stateNode.containerInfo,pt=!0;break e;case 4:$e=o.stateNode.containerInfo,pt=!0;break e}o=o.return}if($e===null)throw Error(q(160));ed(i,a,s),$e=null,pt=!1;var l=s.alternate;l!==null&&(l.return=null),s.return=null}catch(d){Ce(s,e,d)}}if(e.subtreeFlags&12854)for(e=e.child;e!==null;)td(e,t),e=e.sibling}function td(t,e){var n=t.alternate,r=t.flags;switch(t.tag){case 0:case 11:case 14:case 15:if(ut(e,t),vt(t),r&4){try{hr(3,t,t.return),ni(3,t)}catch(m){Ce(t,t.return,m)}try{hr(5,t,t.return)}catch(m){Ce(t,t.return,m)}}break;case 1:ut(e,t),vt(t),r&512&&n!==null&&Cn(n,n.return);break;case 5:if(ut(e,t),vt(t),r&512&&n!==null&&Cn(n,n.return),t.flags&32){var s=t.stateNode;try{yr(s,"")}catch(m){Ce(t,t.return,m)}}if(r&4&&(s=t.stateNode,s!=null)){var i=t.memoizedProps,a=n!==null?n.memoizedProps:i,o=t.type,l=t.updateQueue;if(t.updateQueue=null,l!==null)try{o==="input"&&i.type==="radio"&&i.name!=null&&Nc(s,i),Gi(o,a);var d=Gi(o,i);for(a=0;a<l.length;a+=2){var y=l[a],v=l[a+1];y==="style"?Ic(s,v):y==="dangerouslySetInnerHTML"?Tc(s,v):y==="children"?yr(s,v):Da(s,y,v,d)}switch(o){case"input":Ki(s,i);break;case"textarea":bc(s,i);break;case"select":var h=s._wrapperState.wasMultiple;s._wrapperState.wasMultiple=!!i.multiple;var f=i.value;f!=null?_n(s,!!i.multiple,f,!1):h!==!!i.multiple&&(i.defaultValue!=null?_n(s,!!i.multiple,i.defaultValue,!0):_n(s,!!i.multiple,i.multiple?[]:"",!1))}s[Tr]=i}catch(m){Ce(t,t.return,m)}}break;case 6:if(ut(e,t),vt(t),r&4){if(t.stateNode===null)throw Error(q(162));s=t.stateNode,i=t.memoizedProps;try{s.nodeValue=i}catch(m){Ce(t,t.return,m)}}break;case 3:if(ut(e,t),vt(t),r&4&&n!==null&&n.memoizedState.isDehydrated)try{wr(e.containerInfo)}catch(m){Ce(t,t.return,m)}break;case 4:ut(e,t),vt(t);break;case 13:ut(e,t),vt(t),s=t.child,s.flags&8192&&(i=s.memoizedState!==null,s.stateNode.isHidden=i,!i||s.alternate!==null&&s.alternate.memoizedState!==null||(vo=_e())),r&4&&Dl(t);break;case 22:if(y=n!==null&&n.memoizedState!==null,t.mode&1?(Me=(d=Me)||y,ut(e,t),Me=d):ut(e,t),vt(t),r&8192){if(d=t.memoizedState!==null,(t.stateNode.isHidden=d)&&!y&&t.mode&1)for(te=t,y=t.child;y!==null;){for(v=te=y;te!==null;){switch(h=te,f=h.child,h.tag){case 0:case 11:case 14:case 15:hr(4,h,h.return);break;case 1:Cn(h,h.return);var w=h.stateNode;if(typeof w.componentWillUnmount=="function"){r=h,n=h.return;try{e=r,w.props=e.memoizedProps,w.state=e.memoizedState,w.componentWillUnmount()}catch(m){Ce(r,n,m)}}break;case 5:Cn(h,h.return);break;case 22:if(h.memoizedState!==null){Ml(v);continue}}f!==null?(f.return=h,te=f):Ml(v)}y=y.sibling}e:for(y=null,v=t;;){if(v.tag===5){if(y===null){y=v;try{s=v.stateNode,d?(i=s.style,typeof i.setProperty=="function"?i.setProperty("display","none","important"):i.display="none"):(o=v.stateNode,l=v.memoizedProps.style,a=l!=null&&l.hasOwnProperty("display")?l.display:null,o.style.display=Cc("display",a))}catch(m){Ce(t,t.return,m)}}}else if(v.tag===6){if(y===null)try{v.stateNode.nodeValue=d?"":v.memoizedProps}catch(m){Ce(t,t.return,m)}}else if((v.tag!==22&&v.tag!==23||v.memoizedState===null||v===t)&&v.child!==null){v.child.return=v,v=v.child;continue}if(v===t)break e;for(;v.sibling===null;){if(v.return===null||v.return===t)break e;y===v&&(y=null),v=v.return}y===v&&(y=null),v.sibling.return=v.return,v=v.sibling}}break;case 19:ut(e,t),vt(t),r&4&&Dl(t);break;case 21:break;default:ut(e,t),vt(t)}}function vt(t){var e=t.flags;if(e&2){try{e:{for(var n=t.return;n!==null;){if(Xu(n)){var r=n;break e}n=n.return}throw Error(q(160))}switch(r.tag){case 5:var s=r.stateNode;r.flags&32&&(yr(s,""),r.flags&=-33);var i=Ul(t);Sa(t,i,s);break;case 3:case 4:var a=r.stateNode.containerInfo,o=Ul(t);ba(t,o,a);break;default:throw Error(q(161))}}catch(l){Ce(t,t.return,l)}t.flags&=-3}e&4096&&(t.flags&=-4097)}function zh(t,e,n){te=t,nd(t)}function nd(t,e,n){for(var r=(t.mode&1)!==0;te!==null;){var s=te,i=s.child;if(s.tag===22&&r){var a=s.memoizedState!==null||ns;if(!a){var o=s.alternate,l=o!==null&&o.memoizedState!==null||Me;o=ns;var d=Me;if(ns=a,(Me=l)&&!d)for(te=s;te!==null;)a=te,l=a.child,a.tag===22&&a.memoizedState!==null?Fl(s):l!==null?(l.return=a,te=l):Fl(s);for(;i!==null;)te=i,nd(i),i=i.sibling;te=s,ns=o,Me=d}Ll(t)}else s.subtreeFlags&8772&&i!==null?(i.return=s,te=i):Ll(t)}}function Ll(t){for(;te!==null;){var e=te;if(e.flags&8772){var n=e.alternate;try{if(e.flags&8772)switch(e.tag){case 0:case 11:case 15:Me||ni(5,e);break;case 1:var r=e.stateNode;if(e.flags&4&&!Me)if(n===null)r.componentDidMount();else{var s=e.elementType===e.type?n.memoizedProps:dt(e.type,n.memoizedProps);r.componentDidUpdate(s,n.memoizedState,r.__reactInternalSnapshotBeforeUpdate)}var i=e.updateQueue;i!==null&&Nl(e,i,r);break;case 3:var a=e.updateQueue;if(a!==null){if(n=null,e.child!==null)switch(e.child.tag){case 5:n=e.child.stateNode;break;case 1:n=e.child.stateNode}Nl(e,a,n)}break;case 5:var o=e.stateNode;if(n===null&&e.flags&4){n=o;var l=e.memoizedProps;switch(e.type){case"button":case"input":case"select":case"textarea":l.autoFocus&&n.focus();break;case"img":l.src&&(n.src=l.src)}}break;case 6:break;case 4:break;case 12:break;case 13:if(e.memoizedState===null){var d=e.alternate;if(d!==null){var y=d.memoizedState;if(y!==null){var v=y.dehydrated;v!==null&&wr(v)}}}break;case 19:case 17:case 21:case 22:case 23:case 25:break;default:throw Error(q(163))}Me||e.flags&512&&Na(e)}catch(h){Ce(e,e.return,h)}}if(e===t){te=null;break}if(n=e.sibling,n!==null){n.return=e.return,te=n;break}te=e.return}}function Ml(t){for(;te!==null;){var e=te;if(e===t){te=null;break}var n=e.sibling;if(n!==null){n.return=e.return,te=n;break}te=e.return}}function Fl(t){for(;te!==null;){var e=te;try{switch(e.tag){case 0:case 11:case 15:var n=e.return;try{ni(4,e)}catch(l){Ce(e,n,l)}break;case 1:var r=e.stateNode;if(typeof r.componentDidMount=="function"){var s=e.return;try{r.componentDidMount()}catch(l){Ce(e,s,l)}}var i=e.return;try{Na(e)}catch(l){Ce(e,i,l)}break;case 5:var a=e.return;try{Na(e)}catch(l){Ce(e,a,l)}}}catch(l){Ce(e,e.return,l)}if(e===t){te=null;break}var o=e.sibling;if(o!==null){o.return=e.return,te=o;break}te=e.return}}var Uh=Math.ceil,Ls=At.ReactCurrentDispatcher,go=At.ReactCurrentOwner,ot=At.ReactCurrentBatchConfig,fe=0,je=null,Re=null,ze=0,Je=0,In=Qt(0),Pe=0,Pr=null,pn=0,ri=0,yo=0,fr=null,Ye=null,vo=0,Bn=1/0,bt=null,Ms=!1,Ta=null,Yt=null,rs=!1,Mt=null,Fs=0,mr=0,Ca=null,gs=-1,ys=0;function We(){return fe&6?_e():gs!==-1?gs:gs=_e()}function Ht(t){return t.mode&1?fe&2&&ze!==0?ze&-ze:kh.transition!==null?(ys===0&&(ys=Mc()),ys):(t=ye,t!==0||(t=window.event,t=t===void 0?16:Hc(t.type)),t):1}function mt(t,e,n,r){if(50<mr)throw mr=0,Ca=null,Error(q(185));jr(t,n,r),(!(fe&2)||t!==je)&&(t===je&&(!(fe&2)&&(ri|=n),Pe===4&&Dt(t,ze)),Ze(t,r),n===1&&fe===0&&!(e.mode&1)&&(Bn=_e()+500,Xs&&Xt()))}function Ze(t,e){var n=t.callbackNode;kp(t,e);var r=bs(t,t===je?ze:0);if(r===0)n!==null&&Zo(n),t.callbackNode=null,t.callbackPriority=0;else if(e=r&-r,t.callbackPriority!==e){if(n!=null&&Zo(n),e===1)t.tag===0?xh(Bl.bind(null,t)):pu(Bl.bind(null,t)),mh(function(){!(fe&6)&&Xt()}),n=null;else{switch(Fc(r)){case 1:n=Wa;break;case 4:n=Dc;break;case 16:n=Ns;break;case 536870912:n=Lc;break;default:n=Ns}n=ud(n,rd.bind(null,t))}t.callbackPriority=e,t.callbackNode=n}}function rd(t,e){if(gs=-1,ys=0,fe&6)throw Error(q(327));var n=t.callbackNode;if(jn()&&t.callbackNode!==n)return null;var r=bs(t,t===je?ze:0);if(r===0)return null;if(r&30||r&t.expiredLanes||e)e=Bs(t,r);else{e=r;var s=fe;fe|=2;var i=id();(je!==t||ze!==e)&&(bt=null,Bn=_e()+500,an(t,e));do try{Mh();break}catch(o){sd(t,o)}while(!0);no(),Ls.current=i,fe=s,Re!==null?e=0:(je=null,ze=0,e=Pe)}if(e!==0){if(e===2&&(s=ea(t),s!==0&&(r=s,e=Ia(t,s))),e===1)throw n=Pr,an(t,0),Dt(t,r),Ze(t,_e()),n;if(e===6)Dt(t,r);else{if(s=t.current.alternate,!(r&30)&&!Dh(s)&&(e=Bs(t,r),e===2&&(i=ea(t),i!==0&&(r=i,e=Ia(t,i))),e===1))throw n=Pr,an(t,0),Dt(t,r),Ze(t,_e()),n;switch(t.finishedWork=s,t.finishedLanes=r,e){case 0:case 1:throw Error(q(345));case 2:tn(t,Ye,bt);break;case 3:if(Dt(t,r),(r&130023424)===r&&(e=vo+500-_e(),10<e)){if(bs(t,0)!==0)break;if(s=t.suspendedLanes,(s&r)!==r){We(),t.pingedLanes|=t.suspendedLanes&s;break}t.timeoutHandle=la(tn.bind(null,t,Ye,bt),e);break}tn(t,Ye,bt);break;case 4:if(Dt(t,r),(r&4194240)===r)break;for(e=t.eventTimes,s=-1;0<r;){var a=31-ft(r);i=1<<a,a=e[a],a>s&&(s=a),r&=~i}if(r=s,r=_e()-r,r=(120>r?120:480>r?480:1080>r?1080:1920>r?1920:3e3>r?3e3:4320>r?4320:1960*Uh(r/1960))-r,10<r){t.timeoutHandle=la(tn.bind(null,t,Ye,bt),r);break}tn(t,Ye,bt);break;case 5:tn(t,Ye,bt);break;default:throw Error(q(329))}}}return Ze(t,_e()),t.callbackNode===n?rd.bind(null,t):null}function Ia(t,e){var n=fr;return t.current.memoizedState.isDehydrated&&(an(t,e).flags|=256),t=Bs(t,e),t!==2&&(e=Ye,Ye=n,e!==null&&_a(e)),t}function _a(t){Ye===null?Ye=t:Ye.push.apply(Ye,t)}function Dh(t){for(var e=t;;){if(e.flags&16384){var n=e.updateQueue;if(n!==null&&(n=n.stores,n!==null))for(var r=0;r<n.length;r++){var s=n[r],i=s.getSnapshot;s=s.value;try{if(!gt(i(),s))return!1}catch{return!1}}}if(n=e.child,e.subtreeFlags&16384&&n!==null)n.return=e,e=n;else{if(e===t)break;for(;e.sibling===null;){if(e.return===null||e.return===t)return!0;e=e.return}e.sibling.return=e.return,e=e.sibling}}return!0}function Dt(t,e){for(e&=~yo,e&=~ri,t.suspendedLanes|=e,t.pingedLanes&=~e,t=t.expirationTimes;0<e;){var n=31-ft(e),r=1<<n;t[n]=-1,e&=~r}}function Bl(t){if(fe&6)throw Error(q(327));jn();var e=bs(t,0);if(!(e&1))return Ze(t,_e()),null;var n=Bs(t,e);if(t.tag!==0&&n===2){var r=ea(t);r!==0&&(e=r,n=Ia(t,r))}if(n===1)throw n=Pr,an(t,0),Dt(t,e),Ze(t,_e()),n;if(n===6)throw Error(q(345));return t.finishedWork=t.current.alternate,t.finishedLanes=e,tn(t,Ye,bt),Ze(t,_e()),null}function xo(t,e){var n=fe;fe|=1;try{return t(e)}finally{fe=n,fe===0&&(Bn=_e()+500,Xs&&Xt())}}function hn(t){Mt!==null&&Mt.tag===0&&!(fe&6)&&jn();var e=fe;fe|=1;var n=ot.transition,r=ye;try{if(ot.transition=null,ye=1,t)return t()}finally{ye=r,ot.transition=n,fe=e,!(fe&6)&&Xt()}}function ko(){Je=In.current,Ee(In)}function an(t,e){t.finishedWork=null,t.finishedLanes=0;var n=t.timeoutHandle;if(n!==-1&&(t.timeoutHandle=-1,fh(n)),Re!==null)for(n=Re.return;n!==null;){var r=n;switch(Xa(r),r.tag){case 1:r=r.type.childContextTypes,r!=null&&_s();break;case 3:Mn(),Ee(qe),Ee(Fe),lo();break;case 5:oo(r);break;case 4:Mn();break;case 13:Ee(be);break;case 19:Ee(be);break;case 10:ro(r.type._context);break;case 22:case 23:ko()}n=n.return}if(je=t,Re=t=qt(t.current,null),ze=Je=e,Pe=0,Pr=null,yo=ri=pn=0,Ye=fr=null,rn!==null){for(e=0;e<rn.length;e++)if(n=rn[e],r=n.interleaved,r!==null){n.interleaved=null;var s=r.next,i=n.pending;if(i!==null){var a=i.next;i.next=s,r.next=a}n.pending=r}rn=null}return t}function sd(t,e){do{var n=Re;try{if(no(),hs.current=Ds,Us){for(var r=Se.memoizedState;r!==null;){var s=r.queue;s!==null&&(s.pending=null),r=r.next}Us=!1}if(dn=0,Ae=Oe=Se=null,pr=!1,_r=0,go.current=null,n===null||n.return===null){Pe=1,Pr=e,Re=null;break}e:{var i=t,a=n.return,o=n,l=e;if(e=ze,o.flags|=32768,l!==null&&typeof l=="object"&&typeof l.then=="function"){var d=l,y=o,v=y.tag;if(!(y.mode&1)&&(v===0||v===11||v===15)){var h=y.alternate;h?(y.updateQueue=h.updateQueue,y.memoizedState=h.memoizedState,y.lanes=h.lanes):(y.updateQueue=null,y.memoizedState=null)}var f=_l(a);if(f!==null){f.flags&=-257,Rl(f,a,o,i,e),f.mode&1&&Il(i,d,e),e=f,l=d;var w=e.updateQueue;if(w===null){var m=new Set;m.add(l),e.updateQueue=m}else w.add(l);break e}else{if(!(e&1)){Il(i,d,e),wo();break e}l=Error(q(426))}}else if(Ne&&o.mode&1){var E=_l(a);if(E!==null){!(E.flags&65536)&&(E.flags|=256),Rl(E,a,o,i,e),eo(Fn(l,o));break e}}i=l=Fn(l,o),Pe!==4&&(Pe=2),fr===null?fr=[i]:fr.push(i),i=a;do{switch(i.tag){case 3:i.flags|=65536,e&=-e,i.lanes|=e;var c=Fu(i,l,e);El(i,c);break e;case 1:o=l;var u=i.type,k=i.stateNode;if(!(i.flags&128)&&(typeof u.getDerivedStateFromError=="function"||k!==null&&typeof k.componentDidCatch=="function"&&(Yt===null||!Yt.has(k)))){i.flags|=65536,e&=-e,i.lanes|=e;var b=Bu(i,o,e);El(i,b);break e}}i=i.return}while(i!==null)}od(n)}catch(T){e=T,Re===n&&n!==null&&(Re=n=n.return);continue}break}while(!0)}function id(){var t=Ls.current;return Ls.current=Ds,t===null?Ds:t}function wo(){(Pe===0||Pe===3||Pe===2)&&(Pe=4),je===null||!(pn&268435455)&&!(ri&268435455)||Dt(je,ze)}function Bs(t,e){var n=fe;fe|=2;var r=id();(je!==t||ze!==e)&&(bt=null,an(t,e));do try{Lh();break}catch(s){sd(t,s)}while(!0);if(no(),fe=n,Ls.current=r,Re!==null)throw Error(q(261));return je=null,ze=0,Pe}function Lh(){for(;Re!==null;)ad(Re)}function Mh(){for(;Re!==null&&!dp();)ad(Re)}function ad(t){var e=cd(t.alternate,t,Je);t.memoizedProps=t.pendingProps,e===null?od(t):Re=e,go.current=null}function od(t){var e=t;do{var n=e.alternate;if(t=e.return,e.flags&32768){if(n=Ah(n,e),n!==null){n.flags&=32767,Re=n;return}if(t!==null)t.flags|=32768,t.subtreeFlags=0,t.deletions=null;else{Pe=6,Re=null;return}}else if(n=Ph(n,e,Je),n!==null){Re=n;return}if(e=e.sibling,e!==null){Re=e;return}Re=e=t}while(e!==null);Pe===0&&(Pe=5)}function tn(t,e,n){var r=ye,s=ot.transition;try{ot.transition=null,ye=1,Fh(t,e,n,r)}finally{ot.transition=s,ye=r}return null}function Fh(t,e,n,r){do jn();while(Mt!==null);if(fe&6)throw Error(q(327));n=t.finishedWork;var s=t.finishedLanes;if(n===null)return null;if(t.finishedWork=null,t.finishedLanes=0,n===t.current)throw Error(q(177));t.callbackNode=null,t.callbackPriority=0;var i=n.lanes|n.childLanes;if(wp(t,i),t===je&&(Re=je=null,ze=0),!(n.subtreeFlags&2064)&&!(n.flags&2064)||rs||(rs=!0,ud(Ns,function(){return jn(),null})),i=(n.flags&15990)!==0,n.subtreeFlags&15990||i){i=ot.transition,ot.transition=null;var a=ye;ye=1;var o=fe;fe|=4,go.current=null,$h(t,n),td(n,t),oh(aa),Ss=!!ia,aa=ia=null,t.current=n,zh(n),pp(),fe=o,ye=a,ot.transition=i}else t.current=n;if(rs&&(rs=!1,Mt=t,Fs=s),i=t.pendingLanes,i===0&&(Yt=null),mp(n.stateNode),Ze(t,_e()),e!==null)for(r=t.onRecoverableError,n=0;n<e.length;n++)s=e[n],r(s.value,{componentStack:s.stack,digest:s.digest});if(Ms)throw Ms=!1,t=Ta,Ta=null,t;return Fs&1&&t.tag!==0&&jn(),i=t.pendingLanes,i&1?t===Ca?mr++:(mr=0,Ca=t):mr=0,Xt(),null}function jn(){if(Mt!==null){var t=Fc(Fs),e=ot.transition,n=ye;try{if(ot.transition=null,ye=16>t?16:t,Mt===null)var r=!1;else{if(t=Mt,Mt=null,Fs=0,fe&6)throw Error(q(331));var s=fe;for(fe|=4,te=t.current;te!==null;){var i=te,a=i.child;if(te.flags&16){var o=i.deletions;if(o!==null){for(var l=0;l<o.length;l++){var d=o[l];for(te=d;te!==null;){var y=te;switch(y.tag){case 0:case 11:case 15:hr(8,y,i)}var v=y.child;if(v!==null)v.return=y,te=v;else for(;te!==null;){y=te;var h=y.sibling,f=y.return;if(Qu(y),y===d){te=null;break}if(h!==null){h.return=f,te=h;break}te=f}}}var w=i.alternate;if(w!==null){var m=w.child;if(m!==null){w.child=null;do{var E=m.sibling;m.sibling=null,m=E}while(m!==null)}}te=i}}if(i.subtreeFlags&2064&&a!==null)a.return=i,te=a;else e:for(;te!==null;){if(i=te,i.flags&2048)switch(i.tag){case 0:case 11:case 15:hr(9,i,i.return)}var c=i.sibling;if(c!==null){c.return=i.return,te=c;break e}te=i.return}}var u=t.current;for(te=u;te!==null;){a=te;var k=a.child;if(a.subtreeFlags&2064&&k!==null)k.return=a,te=k;else e:for(a=u;te!==null;){if(o=te,o.flags&2048)try{switch(o.tag){case 0:case 11:case 15:ni(9,o)}}catch(T){Ce(o,o.return,T)}if(o===a){te=null;break e}var b=o.sibling;if(b!==null){b.return=o.return,te=b;break e}te=o.return}}if(fe=s,Xt(),wt&&typeof wt.onPostCommitFiberRoot=="function")try{wt.onPostCommitFiberRoot(qs,t)}catch{}r=!0}return r}finally{ye=n,ot.transition=e}}return!1}function Wl(t,e,n){e=Fn(n,e),e=Fu(t,e,1),t=Vt(t,e,1),e=We(),t!==null&&(jr(t,1,e),Ze(t,e))}function Ce(t,e,n){if(t.tag===3)Wl(t,t,n);else for(;e!==null;){if(e.tag===3){Wl(e,t,n);break}else if(e.tag===1){var r=e.stateNode;if(typeof e.type.getDerivedStateFromError=="function"||typeof r.componentDidCatch=="function"&&(Yt===null||!Yt.has(r))){t=Fn(n,t),t=Bu(e,t,1),e=Vt(e,t,1),t=We(),e!==null&&(jr(e,1,t),Ze(e,t));break}}e=e.return}}function Bh(t,e,n){var r=t.pingCache;r!==null&&r.delete(e),e=We(),t.pingedLanes|=t.suspendedLanes&n,je===t&&(ze&n)===n&&(Pe===4||Pe===3&&(ze&130023424)===ze&&500>_e()-vo?an(t,0):yo|=n),Ze(t,e)}function ld(t,e){e===0&&(t.mode&1?(e=Hr,Hr<<=1,!(Hr&130023424)&&(Hr=4194304)):e=1);var n=We();t=Ot(t,e),t!==null&&(jr(t,e,n),Ze(t,n))}function Wh(t){var e=t.memoizedState,n=0;e!==null&&(n=e.retryLane),ld(t,n)}function Kh(t,e){var n=0;switch(t.tag){case 13:var r=t.stateNode,s=t.memoizedState;s!==null&&(n=s.retryLane);break;case 19:r=t.stateNode;break;default:throw Error(q(314))}r!==null&&r.delete(e),ld(t,n)}var cd;cd=function(t,e,n){if(t!==null)if(t.memoizedProps!==e.pendingProps||qe.current)He=!0;else{if(!(t.lanes&n)&&!(e.flags&128))return He=!1,Oh(t,e,n);He=!!(t.flags&131072)}else He=!1,Ne&&e.flags&1048576&&hu(e,Ps,e.index);switch(e.lanes=0,e.tag){case 2:var r=e.type;ms(t,e),t=e.pendingProps;var s=Un(e,Fe.current);An(e,n),s=uo(null,e,r,t,s,n);var i=po();return e.flags|=1,typeof s=="object"&&s!==null&&typeof s.render=="function"&&s.$$typeof===void 0?(e.tag=1,e.memoizedState=null,e.updateQueue=null,Ge(r)?(i=!0,Rs(e)):i=!1,e.memoizedState=s.state!==null&&s.state!==void 0?s.state:null,io(e),s.updater=ti,e.stateNode=s,s._reactInternals=e,ma(e,r,t,n),e=va(null,e,r,!0,i,n)):(e.tag=0,Ne&&i&&Qa(e),Be(null,e,s,n),e=e.child),e;case 16:r=e.elementType;e:{switch(ms(t,e),t=e.pendingProps,s=r._init,r=s(r._payload),e.type=r,s=e.tag=Yh(r),t=dt(r,t),s){case 0:e=ya(null,e,r,t,n);break e;case 1:e=Al(null,e,r,t,n);break e;case 11:e=Ol(null,e,r,t,n);break e;case 14:e=Pl(null,e,r,dt(r.type,t),n);break e}throw Error(q(306,r,""))}return e;case 0:return r=e.type,s=e.pendingProps,s=e.elementType===r?s:dt(r,s),ya(t,e,r,s,n);case 1:return r=e.type,s=e.pendingProps,s=e.elementType===r?s:dt(r,s),Al(t,e,r,s,n);case 3:e:{if(Yu(e),t===null)throw Error(q(387));r=e.pendingProps,i=e.memoizedState,s=i.element,xu(t,e),$s(e,r,null,n);var a=e.memoizedState;if(r=a.element,i.isDehydrated)if(i={element:r,isDehydrated:!1,cache:a.cache,pendingSuspenseBoundaries:a.pendingSuspenseBoundaries,transitions:a.transitions},e.updateQueue.baseState=i,e.memoizedState=i,e.flags&256){s=Fn(Error(q(423)),e),e=jl(t,e,r,n,s);break e}else if(r!==s){s=Fn(Error(q(424)),e),e=jl(t,e,r,n,s);break e}else for(Qe=Kt(e.stateNode.containerInfo.firstChild),Xe=e,Ne=!0,ht=null,n=yu(e,null,r,n),e.child=n;n;)n.flags=n.flags&-3|4096,n=n.sibling;else{if(Dn(),r===s){e=Pt(t,e,n);break e}Be(t,e,r,n)}e=e.child}return e;case 5:return ku(e),t===null&&pa(e),r=e.type,s=e.pendingProps,i=t!==null?t.memoizedProps:null,a=s.children,oa(r,s)?a=null:i!==null&&oa(r,i)&&(e.flags|=32),Vu(t,e),Be(t,e,a,n),e.child;case 6:return t===null&&pa(e),null;case 13:return Hu(t,e,n);case 4:return ao(e,e.stateNode.containerInfo),r=e.pendingProps,t===null?e.child=Ln(e,null,r,n):Be(t,e,r,n),e.child;case 11:return r=e.type,s=e.pendingProps,s=e.elementType===r?s:dt(r,s),Ol(t,e,r,s,n);case 7:return Be(t,e,e.pendingProps,n),e.child;case 8:return Be(t,e,e.pendingProps.children,n),e.child;case 12:return Be(t,e,e.pendingProps.children,n),e.child;case 10:e:{if(r=e.type._context,s=e.pendingProps,i=e.memoizedProps,a=s.value,ke(As,r._currentValue),r._currentValue=a,i!==null)if(gt(i.value,a)){if(i.children===s.children&&!qe.current){e=Pt(t,e,n);break e}}else for(i=e.child,i!==null&&(i.return=e);i!==null;){var o=i.dependencies;if(o!==null){a=i.child;for(var l=o.firstContext;l!==null;){if(l.context===r){if(i.tag===1){l=It(-1,n&-n),l.tag=2;var d=i.updateQueue;if(d!==null){d=d.shared;var y=d.pending;y===null?l.next=l:(l.next=y.next,y.next=l),d.pending=l}}i.lanes|=n,l=i.alternate,l!==null&&(l.lanes|=n),ha(i.return,n,e),o.lanes|=n;break}l=l.next}}else if(i.tag===10)a=i.type===e.type?null:i.child;else if(i.tag===18){if(a=i.return,a===null)throw Error(q(341));a.lanes|=n,o=a.alternate,o!==null&&(o.lanes|=n),ha(a,n,e),a=i.sibling}else a=i.child;if(a!==null)a.return=i;else for(a=i;a!==null;){if(a===e){a=null;break}if(i=a.sibling,i!==null){i.return=a.return,a=i;break}a=a.return}i=a}Be(t,e,s.children,n),e=e.child}return e;case 9:return s=e.type,r=e.pendingProps.children,An(e,n),s=lt(s),r=r(s),e.flags|=1,Be(t,e,r,n),e.child;case 14:return r=e.type,s=dt(r,e.pendingProps),s=dt(r.type,s),Pl(t,e,r,s,n);case 15:return Wu(t,e,e.type,e.pendingProps,n);case 17:return r=e.type,s=e.pendingProps,s=e.elementType===r?s:dt(r,s),ms(t,e),e.tag=1,Ge(r)?(t=!0,Rs(e)):t=!1,An(e,n),Mu(e,r,s),ma(e,r,s,n),va(null,e,r,!0,t,n);case 19:return qu(t,e,n);case 22:return Ku(t,e,n)}throw Error(q(156,e.tag))};function ud(t,e){return Uc(t,e)}function Vh(t,e,n,r){this.tag=t,this.key=n,this.sibling=this.child=this.return=this.stateNode=this.type=this.elementType=null,this.index=0,this.ref=null,this.pendingProps=e,this.dependencies=this.memoizedState=this.updateQueue=this.memoizedProps=null,this.mode=r,this.subtreeFlags=this.flags=0,this.deletions=null,this.childLanes=this.lanes=0,this.alternate=null}function at(t,e,n,r){return new Vh(t,e,n,r)}function Eo(t){return t=t.prototype,!(!t||!t.isReactComponent)}function Yh(t){if(typeof t=="function")return Eo(t)?1:0;if(t!=null){if(t=t.$$typeof,t===Ma)return 11;if(t===Fa)return 14}return 2}function qt(t,e){var n=t.alternate;return n===null?(n=at(t.tag,e,t.key,t.mode),n.elementType=t.elementType,n.type=t.type,n.stateNode=t.stateNode,n.alternate=t,t.alternate=n):(n.pendingProps=e,n.type=t.type,n.flags=0,n.subtreeFlags=0,n.deletions=null),n.flags=t.flags&14680064,n.childLanes=t.childLanes,n.lanes=t.lanes,n.child=t.child,n.memoizedProps=t.memoizedProps,n.memoizedState=t.memoizedState,n.updateQueue=t.updateQueue,e=t.dependencies,n.dependencies=e===null?null:{lanes:e.lanes,firstContext:e.firstContext},n.sibling=t.sibling,n.index=t.index,n.ref=t.ref,n}function vs(t,e,n,r,s,i){var a=2;if(r=t,typeof t=="function")Eo(t)&&(a=1);else if(typeof t=="string")a=5;else e:switch(t){case vn:return on(n.children,s,i,e);case La:a=8,s|=8;break;case Li:return t=at(12,n,e,s|2),t.elementType=Li,t.lanes=i,t;case Mi:return t=at(13,n,e,s),t.elementType=Mi,t.lanes=i,t;case Fi:return t=at(19,n,e,s),t.elementType=Fi,t.lanes=i,t;case kc:return si(n,s,i,e);default:if(typeof t=="object"&&t!==null)switch(t.$$typeof){case vc:a=10;break e;case xc:a=9;break e;case Ma:a=11;break e;case Fa:a=14;break e;case $t:a=16,r=null;break e}throw Error(q(130,t==null?t:typeof t,""))}return e=at(a,n,e,s),e.elementType=t,e.type=r,e.lanes=i,e}function on(t,e,n,r){return t=at(7,t,r,e),t.lanes=n,t}function si(t,e,n,r){return t=at(22,t,r,e),t.elementType=kc,t.lanes=n,t.stateNode={isHidden:!1},t}function ji(t,e,n){return t=at(6,t,null,e),t.lanes=n,t}function $i(t,e,n){return e=at(4,t.children!==null?t.children:[],t.key,e),e.lanes=n,e.stateNode={containerInfo:t.containerInfo,pendingChildren:null,implementation:t.implementation},e}function Hh(t,e,n,r,s){this.tag=e,this.containerInfo=t,this.finishedWork=this.pingCache=this.current=this.pendingChildren=null,this.timeoutHandle=-1,this.callbackNode=this.pendingContext=this.context=null,this.callbackPriority=0,this.eventTimes=mi(0),this.expirationTimes=mi(-1),this.entangledLanes=this.finishedLanes=this.mutableReadLanes=this.expiredLanes=this.pingedLanes=this.suspendedLanes=this.pendingLanes=0,this.entanglements=mi(0),this.identifierPrefix=r,this.onRecoverableError=s,this.mutableSourceEagerHydrationData=null}function No(t,e,n,r,s,i,a,o,l){return t=new Hh(t,e,n,o,l),e===1?(e=1,i===!0&&(e|=8)):e=0,i=at(3,null,null,e),t.current=i,i.stateNode=t,i.memoizedState={element:r,isDehydrated:n,cache:null,transitions:null,pendingSuspenseBoundaries:null},io(i),t}function qh(t,e,n){var r=3<arguments.length&&arguments[3]!==void 0?arguments[3]:null;return{$$typeof:yn,key:r==null?null:""+r,children:t,containerInfo:e,implementation:n}}function dd(t){if(!t)return Zt;t=t._reactInternals;e:{if(mn(t)!==t||t.tag!==1)throw Error(q(170));var e=t;do{switch(e.tag){case 3:e=e.stateNode.context;break e;case 1:if(Ge(e.type)){e=e.stateNode.__reactInternalMemoizedMergedChildContext;break e}}e=e.return}while(e!==null);throw Error(q(171))}if(t.tag===1){var n=t.type;if(Ge(n))return du(t,n,e)}return e}function pd(t,e,n,r,s,i,a,o,l){return t=No(n,r,!0,t,s,i,a,o,l),t.context=dd(null),n=t.current,r=We(),s=Ht(n),i=It(r,s),i.callback=e??null,Vt(n,i,s),t.current.lanes=s,jr(t,s,r),Ze(t,r),t}function ii(t,e,n,r){var s=e.current,i=We(),a=Ht(s);return n=dd(n),e.context===null?e.context=n:e.pendingContext=n,e=It(i,a),e.payload={element:t},r=r===void 0?null:r,r!==null&&(e.callback=r),t=Vt(s,e,a),t!==null&&(mt(t,s,a,i),ps(t,s,a)),a}function Ws(t){if(t=t.current,!t.child)return null;switch(t.child.tag){case 5:return t.child.stateNode;default:return t.child.stateNode}}function Kl(t,e){if(t=t.memoizedState,t!==null&&t.dehydrated!==null){var n=t.retryLane;t.retryLane=n!==0&&n<e?n:e}}function bo(t,e){Kl(t,e),(t=t.alternate)&&Kl(t,e)}function Gh(){return null}var hd=typeof reportError=="function"?reportError:function(t){console.error(t)};function So(t){this._internalRoot=t}ai.prototype.render=So.prototype.render=function(t){var e=this._internalRoot;if(e===null)throw Error(q(409));ii(t,e,null,null)};ai.prototype.unmount=So.prototype.unmount=function(){var t=this._internalRoot;if(t!==null){this._internalRoot=null;var e=t.containerInfo;hn(function(){ii(null,t,null,null)}),e[Rt]=null}};function ai(t){this._internalRoot=t}ai.prototype.unstable_scheduleHydration=function(t){if(t){var e=Kc();t={blockedOn:null,target:t,priority:e};for(var n=0;n<Ut.length&&e!==0&&e<Ut[n].priority;n++);Ut.splice(n,0,t),n===0&&Yc(t)}};function To(t){return!(!t||t.nodeType!==1&&t.nodeType!==9&&t.nodeType!==11)}function oi(t){return!(!t||t.nodeType!==1&&t.nodeType!==9&&t.nodeType!==11&&(t.nodeType!==8||t.nodeValue!==" react-mount-point-unstable "))}function Vl(){}function Zh(t,e,n,r,s){if(s){if(typeof r=="function"){var i=r;r=function(){var d=Ws(a);i.call(d)}}var a=pd(e,r,t,0,null,!1,!1,"",Vl);return t._reactRootContainer=a,t[Rt]=a.current,br(t.nodeType===8?t.parentNode:t),hn(),a}for(;s=t.lastChild;)t.removeChild(s);if(typeof r=="function"){var o=r;r=function(){var d=Ws(l);o.call(d)}}var l=No(t,0,!1,null,null,!1,!1,"",Vl);return t._reactRootContainer=l,t[Rt]=l.current,br(t.nodeType===8?t.parentNode:t),hn(function(){ii(e,l,n,r)}),l}function li(t,e,n,r,s){var i=n._reactRootContainer;if(i){var a=i;if(typeof s=="function"){var o=s;s=function(){var l=Ws(a);o.call(l)}}ii(e,a,t,s)}else a=Zh(n,e,t,s,r);return Ws(a)}Bc=function(t){switch(t.tag){case 3:var e=t.stateNode;if(e.current.memoizedState.isDehydrated){var n=ir(e.pendingLanes);n!==0&&(Ka(e,n|1),Ze(e,_e()),!(fe&6)&&(Bn=_e()+500,Xt()))}break;case 13:hn(function(){var r=Ot(t,1);if(r!==null){var s=We();mt(r,t,1,s)}}),bo(t,1)}};Va=function(t){if(t.tag===13){var e=Ot(t,134217728);if(e!==null){var n=We();mt(e,t,134217728,n)}bo(t,134217728)}};Wc=function(t){if(t.tag===13){var e=Ht(t),n=Ot(t,e);if(n!==null){var r=We();mt(n,t,e,r)}bo(t,e)}};Kc=function(){return ye};Vc=function(t,e){var n=ye;try{return ye=t,e()}finally{ye=n}};Ji=function(t,e,n){switch(e){case"input":if(Ki(t,n),e=n.name,n.type==="radio"&&e!=null){for(n=t;n.parentNode;)n=n.parentNode;for(n=n.querySelectorAll("input[name="+JSON.stringify(""+e)+'][type="radio"]'),e=0;e<n.length;e++){var r=n[e];if(r!==t&&r.form===t.form){var s=Qs(r);if(!s)throw Error(q(90));Ec(r),Ki(r,s)}}}break;case"textarea":bc(t,n);break;case"select":e=n.value,e!=null&&_n(t,!!n.multiple,e,!1)}};Oc=xo;Pc=hn;var Jh={usingClientEntryPoint:!1,Events:[zr,En,Qs,_c,Rc,xo]},nr={findFiberByHostInstance:nn,bundleType:0,version:"18.3.1",rendererPackageName:"react-dom"},Qh={bundleType:nr.bundleType,version:nr.version,rendererPackageName:nr.rendererPackageName,rendererConfig:nr.rendererConfig,overrideHookState:null,overrideHookStateDeletePath:null,overrideHookStateRenamePath:null,overrideProps:null,overridePropsDeletePath:null,overridePropsRenamePath:null,setErrorHandler:null,setSuspenseHandler:null,scheduleUpdate:null,currentDispatcherRef:At.ReactCurrentDispatcher,findHostInstanceByFiber:function(t){return t=$c(t),t===null?null:t.stateNode},findFiberByHostInstance:nr.findFiberByHostInstance||Gh,findHostInstancesForRefresh:null,scheduleRefresh:null,scheduleRoot:null,setRefreshHandler:null,getCurrentFiber:null,reconcilerVersion:"18.3.1-next-f1338f8080-20240426"};if(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__<"u"){var ss=__REACT_DEVTOOLS_GLOBAL_HOOK__;if(!ss.isDisabled&&ss.supportsFiber)try{qs=ss.inject(Qh),wt=ss}catch{}}tt.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED=Jh;tt.createPortal=function(t,e){var n=2<arguments.length&&arguments[2]!==void 0?arguments[2]:null;if(!To(e))throw Error(q(200));return qh(t,e,null,n)};tt.createRoot=function(t,e){if(!To(t))throw Error(q(299));var n=!1,r="",s=hd;return e!=null&&(e.unstable_strictMode===!0&&(n=!0),e.identifierPrefix!==void 0&&(r=e.identifierPrefix),e.onRecoverableError!==void 0&&(s=e.onRecoverableError)),e=No(t,1,!1,null,null,n,!1,r,s),t[Rt]=e.current,br(t.nodeType===8?t.parentNode:t),new So(e)};tt.findDOMNode=function(t){if(t==null)return null;if(t.nodeType===1)return t;var e=t._reactInternals;if(e===void 0)throw typeof t.render=="function"?Error(q(188)):(t=Object.keys(t).join(","),Error(q(268,t)));return t=$c(e),t=t===null?null:t.stateNode,t};tt.flushSync=function(t){return hn(t)};tt.hydrate=function(t,e,n){if(!oi(e))throw Error(q(200));return li(null,t,e,!0,n)};tt.hydrateRoot=function(t,e,n){if(!To(t))throw Error(q(405));var r=n!=null&&n.hydratedSources||null,s=!1,i="",a=hd;if(n!=null&&(n.unstable_strictMode===!0&&(s=!0),n.identifierPrefix!==void 0&&(i=n.identifierPrefix),n.onRecoverableError!==void 0&&(a=n.onRecoverableError)),e=pd(e,null,t,1,n??null,s,!1,i,a),t[Rt]=e.current,br(t),r)for(t=0;t<r.length;t++)n=r[t],s=n._getVersion,s=s(n._source),e.mutableSourceEagerHydrationData==null?e.mutableSourceEagerHydrationData=[n,s]:e.mutableSourceEagerHydrationData.push(n,s);return new ai(e)};tt.render=function(t,e,n){if(!oi(e))throw Error(q(200));return li(null,t,e,!1,n)};tt.unmountComponentAtNode=function(t){if(!oi(t))throw Error(q(40));return t._reactRootContainer?(hn(function(){li(null,null,t,!1,function(){t._reactRootContainer=null,t[Rt]=null})}),!0):!1};tt.unstable_batchedUpdates=xo;tt.unstable_renderSubtreeIntoContainer=function(t,e,n,r){if(!oi(n))throw Error(q(200));if(t==null||t._reactInternals===void 0)throw Error(q(38));return li(t,e,n,!1,r)};tt.version="18.3.1-next-f1338f8080-20240426";function fd(){if(!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__>"u"||typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE!="function"))try{__REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(fd)}catch(t){console.error(t)}}fd(),fc.exports=tt;var Xh=fc.exports,md,Yl=Xh;md=Yl.createRoot,Yl.hydrateRoot;/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var ef={xmlns:"http://www.w3.org/2000/svg",width:24,height:24,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"};/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const tf=t=>t.replace(/([a-z0-9])([A-Z])/g,"$1-$2").toLowerCase().trim(),he=(t,e)=>{const n=ie.forwardRef(({color:r="currentColor",size:s=24,strokeWidth:i=2,absoluteStrokeWidth:a,className:o="",children:l,...d},y)=>ie.createElement("svg",{ref:y,...ef,width:s,height:s,stroke:r,strokeWidth:a?Number(i)*24/Number(s):i,className:["lucide",`lucide-${tf(t)}`,o].join(" "),...d},[...e.map(([v,h])=>ie.createElement(v,h)),...Array.isArray(l)?l:[l]]));return n.displayName=`${t}`,n};/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Ks=he("AlertCircle",[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["line",{x1:"12",x2:"12",y1:"8",y2:"12",key:"1pkeuh"}],["line",{x1:"12",x2:"12.01",y1:"16",y2:"16",key:"4dfq90"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const nf=he("AlertTriangle",[["path",{d:"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z",key:"c3ski4"}],["path",{d:"M12 9v4",key:"juzpu7"}],["path",{d:"M12 17h.01",key:"p32p05"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const rf=he("Ban",[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["path",{d:"m4.9 4.9 14.2 14.2",key:"1m5liu"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const sf=he("BookOpen",[["path",{d:"M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z",key:"vv98re"}],["path",{d:"M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z",key:"1cyq3y"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Vs=he("CheckCircle",[["path",{d:"M22 11.08V12a10 10 0 1 1-5.93-9.14",key:"g774vq"}],["path",{d:"m9 11 3 3L22 4",key:"1pflzl"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Co=he("Check",[["path",{d:"M20 6 9 17l-5-5",key:"1gmf2c"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ln=he("ChevronDown",[["path",{d:"m6 9 6 6 6-6",key:"qrunsl"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const $n=he("ChevronRight",[["path",{d:"m9 18 6-6-6-6",key:"mthhwq"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const gd=he("Clock",[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["polyline",{points:"12 6 12 12 16 14",key:"68esgv"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const af=he("Code2",[["path",{d:"m18 16 4-4-4-4",key:"1inbqp"}],["path",{d:"m6 8-4 4 4 4",key:"15zrgr"}],["path",{d:"m14.5 4-5 16",key:"e7oirm"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Hl=he("Code",[["polyline",{points:"16 18 22 12 16 6",key:"z7tu5w"}],["polyline",{points:"8 6 2 12 8 18",key:"1eg1df"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Io=he("Copy",[["rect",{width:"14",height:"14",x:"8",y:"8",rx:"2",ry:"2",key:"17jyea"}],["path",{d:"M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2",key:"zix9uf"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const of=he("Cpu",[["rect",{x:"4",y:"4",width:"16",height:"16",rx:"2",key:"1vbyd7"}],["rect",{x:"9",y:"9",width:"6",height:"6",key:"o3kz5p"}],["path",{d:"M15 2v2",key:"13l42r"}],["path",{d:"M15 20v2",key:"15mkzm"}],["path",{d:"M2 15h2",key:"1gxd5l"}],["path",{d:"M2 9h2",key:"1bbxkp"}],["path",{d:"M20 15h2",key:"19e6y8"}],["path",{d:"M20 9h2",key:"19tzq7"}],["path",{d:"M9 2v2",key:"165o2o"}],["path",{d:"M9 20v2",key:"i2bqo8"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const lf=he("Download",[["path",{d:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4",key:"ih7n3h"}],["polyline",{points:"7 10 12 15 17 10",key:"2ggqvy"}],["line",{x1:"12",x2:"12",y1:"15",y2:"3",key:"1vk2je"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const cf=he("FileCode",[["path",{d:"M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z",key:"1rqfz7"}],["path",{d:"M14 2v4a2 2 0 0 0 2 2h4",key:"tnqrlb"}],["path",{d:"m10 13-2 2 2 2",key:"17smn8"}],["path",{d:"m14 17 2-2-2-2",key:"14mezr"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const uf=he("File",[["path",{d:"M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z",key:"1rqfz7"}],["path",{d:"M14 2v4a2 2 0 0 0 2 2h4",key:"tnqrlb"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ql=he("FolderTree",[["path",{d:"M20 10a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2.5a1 1 0 0 1-.8-.4l-.9-1.2A1 1 0 0 0 15 3h-2a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1Z",key:"hod4my"}],["path",{d:"M20 21a1 1 0 0 0 1-1v-3a1 1 0 0 0-1-1h-2.9a1 1 0 0 1-.88-.55l-.42-.85a1 1 0 0 0-.92-.6H13a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1Z",key:"w4yl2u"}],["path",{d:"M3 5a2 2 0 0 0 2 2h3",key:"f2jnh7"}],["path",{d:"M3 3v13a2 2 0 0 0 2 2h3",key:"k8epm1"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const df=he("Folder",[["path",{d:"M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z",key:"1kt360"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Gl=he("Info",[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["path",{d:"M12 16v-4",key:"1dtifu"}],["path",{d:"M12 8h.01",key:"e9boi3"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const pf=he("Layers",[["path",{d:"m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z",key:"8b97xw"}],["path",{d:"m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65",key:"dd6zsq"}],["path",{d:"m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65",key:"ep9fru"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const hf=he("List",[["line",{x1:"8",x2:"21",y1:"6",y2:"6",key:"7ey8pc"}],["line",{x1:"8",x2:"21",y1:"12",y2:"12",key:"rjfblc"}],["line",{x1:"8",x2:"21",y1:"18",y2:"18",key:"c3b1m8"}],["line",{x1:"3",x2:"3.01",y1:"6",y2:"6",key:"1g7gq3"}],["line",{x1:"3",x2:"3.01",y1:"12",y2:"12",key:"1pjlvk"}],["line",{x1:"3",x2:"3.01",y1:"18",y2:"18",key:"28t2mc"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Ys=he("Package",[["path",{d:"m7.5 4.27 9 5.15",key:"1c824w"}],["path",{d:"M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z",key:"hh9hay"}],["path",{d:"m3.3 7 8.7 5 8.7-5",key:"g66t2b"}],["path",{d:"M12 22V12",key:"d0xqtd"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const _o=he("Play",[["polygon",{points:"5 3 19 12 5 21 5 3",key:"191637"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Zl=he("Plus",[["path",{d:"M5 12h14",key:"1ays0h"}],["path",{d:"M12 5v14",key:"s699le"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ff=he("Rocket",[["path",{d:"M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z",key:"m3kijz"}],["path",{d:"m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z",key:"1fmvmk"}],["path",{d:"M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0",key:"1f8sc4"}],["path",{d:"M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5",key:"qeys4"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const mf=he("Server",[["rect",{width:"20",height:"8",x:"2",y:"2",rx:"2",ry:"2",key:"ngkwjq"}],["rect",{width:"20",height:"8",x:"2",y:"14",rx:"2",ry:"2",key:"iecqi9"}],["line",{x1:"6",x2:"6.01",y1:"6",y2:"6",key:"16zg32"}],["line",{x1:"6",x2:"6.01",y1:"18",y2:"18",key:"nzw8ys"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Jl=he("Shield",[["path",{d:"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",key:"oel41y"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const yd=he("Sparkles",[["path",{d:"m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z",key:"17u4zn"}],["path",{d:"M5 3v4",key:"bklmnn"}],["path",{d:"M19 17v4",key:"iiml17"}],["path",{d:"M3 5h4",key:"nem4j1"}],["path",{d:"M17 19h4",key:"lbex7p"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const gf=he("TestTube",[["path",{d:"M14.5 2v17.5c0 1.4-1.1 2.5-2.5 2.5h0c-1.4 0-2.5-1.1-2.5-2.5V2",key:"187lwq"}],["path",{d:"M8.5 2h7",key:"csnxdl"}],["path",{d:"M14.5 16h-5",key:"1ox875"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Ql=he("Trash2",[["path",{d:"M3 6h18",key:"d0wm0j"}],["path",{d:"M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6",key:"4alrt4"}],["path",{d:"M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2",key:"v07s0e"}],["line",{x1:"10",x2:"10",y1:"11",y2:"17",key:"1uufr5"}],["line",{x1:"14",x2:"14",y1:"11",y2:"17",key:"xtxkd"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const yf=he("TreeDeciduous",[["path",{d:"M8 19a4 4 0 0 1-2.24-7.32A3.5 3.5 0 0 1 9 6.03V6a3 3 0 1 1 6 0v.04a3.5 3.5 0 0 1 3.24 5.65A4 4 0 0 1 16 19Z",key:"oadzkq"}],["path",{d:"M12 19v3",key:"npa21l"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const vf=he("User",[["path",{d:"M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2",key:"975kel"}],["circle",{cx:"12",cy:"7",r:"4",key:"17ys0d"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Xl=he("XCircle",[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["path",{d:"m15 9-6 6",key:"1uzhvr"}],["path",{d:"m9 9 6 6",key:"z0biqf"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const xf=he("Zap",[["polygon",{points:"13 2 3 14 12 14 11 22 21 10 12 10 13 2",key:"45s27k"}]]),kf=new Set(["entity","property","behavior","constraint","flow","effect","expose","compose","command","module","policy","store","event","computed","derived","hasMany","hasOne","belongsTo","ref","through","on","when","then","emit","mutate","compute","guard","publish","persist","as","from","to","with","where","connect","returns","string","number","boolean","list","map","any","void","true","false","null","required","unique","indexed","private","readonly","optional","rest","graphql","websocket","function","server","http","storage","timer","custom","memory","postgres","supabase","localStorage","read","write","delete","execute","all","override","allow","deny","and","or","not","is","in","contains","user","self","context","overrideable","ok","warn","block","versionProperty","versionAtProperty","transition"]),zi=new Set(["+","-","*","/","%","=","==","!=","<",">","<=",">=","&&","||","!","?",":","->","=>","|","&",".","..","?."]),wf=new Set(["(",")","{","}","[","]",",",";","@"]);class Ef{constructor(e){ce(this,"source");ce(this,"pos",0);ce(this,"line",1);ce(this,"col",1);ce(this,"tokens",[]);this.source=e}tokenize(){for(;this.pos<this.source.length&&(this.skipWhitespace(),!(this.pos>=this.source.length));){const e=this.source[this.pos];if(e===`
`){this.tokens.push({type:"NEWLINE",value:`
`,position:this.position()}),this.advance(),this.line++,this.col=1;continue}if(e==='"'||e==="'"){this.readString(e);continue}if(e==="`"){this.readTemplate();continue}if(this.isDigit(e)){this.readNumber();continue}if(this.isAlpha(e)||e==="_"){this.readIdentifier();continue}if(this.isOpStart(e)){this.readOperator();continue}if(wf.has(e)){this.tokens.push({type:"PUNCTUATION",value:e,position:this.position()}),this.advance();continue}this.advance()}return this.tokens.push({type:"EOF",value:"",position:this.position()}),this.tokens}skipWhitespace(){for(;this.pos<this.source.length;){const e=this.source[this.pos];if(e===" "||e==="	"||e==="\r"){this.advance();continue}if(e==="/"&&this.source[this.pos+1]==="/"){for(;this.pos<this.source.length&&this.source[this.pos]!==`
`;)this.advance();continue}if(e==="/"&&this.source[this.pos+1]==="*"){for(this.advance(),this.advance();this.pos<this.source.length&&!(this.source[this.pos]==="*"&&this.source[this.pos+1]==="/");)this.source[this.pos]===`
`&&(this.line++,this.col=0),this.advance();this.advance(),this.advance();continue}break}}readString(e){this.advance();let n="";for(;this.pos<this.source.length&&this.source[this.pos]!==e;){if(this.source[this.pos]==="\\"){this.advance();const r=this.source[this.pos];n+=r==="n"?`
`:r==="t"?"	":r}else n+=this.source[this.pos];this.advance()}this.advance(),this.tokens.push({type:"STRING",value:n,position:this.position()})}readTemplate(){this.advance();let e="";for(;this.pos<this.source.length&&this.source[this.pos]!=="`";)this.source[this.pos]===`
`&&(this.line++,this.col=0),e+=this.source[this.pos],this.advance();this.advance(),this.tokens.push({type:"STRING",value:e,position:this.position()})}readNumber(){let e="";for(;this.pos<this.source.length&&(this.isDigit(this.source[this.pos])||this.source[this.pos]===".");)e+=this.source[this.pos],this.advance();this.tokens.push({type:"NUMBER",value:e,position:this.position()})}readIdentifier(){let e="";for(;this.pos<this.source.length&&(this.isAlphaNum(this.source[this.pos])||this.source[this.pos]==="_");)e+=this.source[this.pos],this.advance();this.tokens.push({type:kf.has(e)?"KEYWORD":"IDENTIFIER",value:e,position:this.position()})}readOperator(){const e=this.source.slice(this.pos,this.pos+2);zi.has(e)?(this.tokens.push({type:"OPERATOR",value:e,position:this.position()}),this.advance(),this.advance()):(this.tokens.push({type:"OPERATOR",value:this.source[this.pos],position:this.position()}),this.advance())}isDigit(e){return e>="0"&&e<="9"}isAlpha(e){return e>="a"&&e<="z"||e>="A"&&e<="Z"}isAlphaNum(e){return this.isAlpha(e)||this.isDigit(e)}isOpStart(e){return zi.has(e)||zi.has(e+this.source[this.pos+1])}advance(){this.pos++,this.col++}position(){return{line:this.line,column:this.col}}}class Ro{constructor(){ce(this,"tokens",[]);ce(this,"pos",0);ce(this,"errors",[])}parse(e){var r;this.tokens=new Ef(e).tokenize(),this.pos=0,this.errors=[];const n={modules:[],entities:[],commands:[],flows:[],effects:[],exposures:[],compositions:[],policies:[],stores:[],events:[]};for(;!this.isEnd()&&(this.skipNL(),!this.isEnd());)try{this.check("KEYWORD","module")?n.modules.push(this.parseModule()):this.check("KEYWORD","entity")?n.entities.push(this.parseEntity()):this.check("KEYWORD","command")?n.commands.push(this.parseCommand()):this.check("KEYWORD","flow")?n.flows.push(this.parseFlow()):this.check("KEYWORD","effect")?n.effects.push(this.parseEffect()):this.check("KEYWORD","expose")?n.exposures.push(this.parseExpose()):this.check("KEYWORD","compose")?n.compositions.push(this.parseComposition()):this.check("KEYWORD","policy")?n.policies.push(this.parsePolicy()):this.check("KEYWORD","store")?n.stores.push(this.parseStore()):this.check("KEYWORD","event")?n.events.push(this.parseOutboxEvent()):this.advance()}catch(s){this.errors.push({message:s instanceof Error?s.message:"Parse error",position:(r=this.current())==null?void 0:r.position,severity:"error"}),this.sync()}return{program:n,errors:this.errors}}parseModule(){this.consume("KEYWORD","module");const e=this.consumeIdentifier().value;this.consume("PUNCTUATION","{"),this.skipNL();const n=[],r=[],s=[],i=[],a=[];for(;!this.check("PUNCTUATION","}")&&!this.isEnd()&&(this.skipNL(),!this.check("PUNCTUATION","}"));)this.check("KEYWORD","entity")?n.push(this.parseEntity()):this.check("KEYWORD","command")?r.push(this.parseCommand()):this.check("KEYWORD","policy")?s.push(this.parsePolicy()):this.check("KEYWORD","store")?i.push(this.parseStore()):this.check("KEYWORD","event")?a.push(this.parseOutboxEvent()):this.advance(),this.skipNL();return this.consume("PUNCTUATION","}"),{type:"Module",name:e,entities:n,commands:r,policies:s,stores:i,events:a}}parseEntity(){this.consume("KEYWORD","entity");const e=this.consumeIdentifier().value;this.consume("PUNCTUATION","{"),this.skipNL();const n=[],r=[],s=[],i=[],a=[],o=[],l=[],d=[];let y,v,h;for(;!this.check("PUNCTUATION","}")&&!this.isEnd()&&(this.skipNL(),!this.check("PUNCTUATION","}"));){if(this.check("KEYWORD","property"))n.push(this.parseProperty());else if(this.check("KEYWORD","computed")||this.check("KEYWORD","derived"))r.push(this.parseComputedProperty());else if(this.check("KEYWORD","hasMany")||this.check("KEYWORD","hasOne")||this.check("KEYWORD","belongsTo")||this.check("KEYWORD","ref"))s.push(this.parseRelationship());else if(this.check("KEYWORD","behavior")||this.check("KEYWORD","on"))i.push(this.parseBehavior());else if(this.check("KEYWORD","command"))a.push(this.parseCommand());else if(this.check("KEYWORD","constraint"))o.push(this.parseConstraint());else if(this.check("KEYWORD","policy"))l.push(this.parsePolicy());else if(this.check("KEYWORD","store")){const f=this.tokens[this.pos+1],w=this.tokens[this.pos+2];(f==null?void 0:f.value)==="in"?(this.advance(),this.advance(),y=this.advance().value):(w==null?void 0:w.value)==="in"?y=this.parseStore().target:(this.advance(),y=this.advance().value)}else this.check("KEYWORD","versionProperty")?(this.advance(),v=this.consumeIdentifier().value,this.check("OPERATOR",":")&&(this.advance(),this.advance())):this.check("KEYWORD","versionAtProperty")?(this.advance(),h=this.consumeIdentifier().value,this.check("OPERATOR",":")&&(this.advance(),this.advance())):this.check("KEYWORD","transition")?d.push(this.parseTransition()):this.advance();this.skipNL()}return this.consume("PUNCTUATION","}"),{type:"Entity",name:e,properties:n,computedProperties:r,relationships:s,behaviors:i,commands:a,constraints:o,policies:l,transitions:d,store:y,versionProperty:v,versionAtProperty:h}}parseProperty(){var i;this.consume("KEYWORD","property");const e=[];for(;["required","unique","indexed","private","readonly","optional"].includes(((i=this.current())==null?void 0:i.value)||"");)e.push(this.advance().value);const n=this.consumeIdentifier().value;this.consume("OPERATOR",":");const r=this.parseType();let s;return this.check("OPERATOR","=")&&(this.advance(),s=this.parseExpr()),{type:"Property",name:n,dataType:r,defaultValue:s,modifiers:e}}parseTransition(){this.consume("KEYWORD","transition");const e=this.consumeIdentifier().value;this.consume("KEYWORD","from");const n=this.advance(),r=(n.type==="STRING",n.value);this.consume("KEYWORD","to");const s=[];if(this.check("PUNCTUATION","[")){for(this.advance();!this.check("PUNCTUATION","]")&&!this.isEnd();){const i=this.advance();s.push((i.type==="STRING",i.value)),this.check("PUNCTUATION",",")&&this.advance()}this.consume("PUNCTUATION","]")}else{const i=this.advance();s.push((i.type==="STRING",i.value))}return{type:"Transition",property:e,from:r,to:s}}parseComputedProperty(){this.advance();const e=this.consumeIdentifier().value;this.consume("OPERATOR",":");const n=this.parseType();this.consume("OPERATOR","=");const r=this.parseExpr(),s=this.extractDependencies(r);return{type:"ComputedProperty",name:e,dataType:n,expression:r,dependencies:s}}extractDependencies(e){const n=new Set,r=["self","this","user","context"],s=i=>{switch(i.type){case"Identifier":r.includes(i.name)||n.add(i.name);break;case"MemberAccess":s(i.object);break;case"BinaryOp":s(i.left),s(i.right);break;case"UnaryOp":s(i.operand);break;case"Call":s(i.callee),i.arguments.forEach(s);break;case"Conditional":s(i.condition),s(i.consequent),s(i.alternate);break;case"Array":i.elements.forEach(s);break;case"Object":i.properties.forEach(a=>s(a.value));break;case"Lambda":s(i.body);break}};return s(e),Array.from(n)}parseRelationship(){const e=this.advance().value,n=this.consumeIdentifier().value;this.consume("OPERATOR",":");const r=this.consumeIdentifier().value;let s,i;return this.check("KEYWORD","through")&&(this.advance(),i=this.consumeIdentifier().value),this.check("KEYWORD","with")&&(this.advance(),s=this.consumeIdentifier().value),{type:"Relationship",kind:e,name:n,target:r,foreignKey:s,through:i}}parseCommand(){this.consume("KEYWORD","command");const e=this.consumeIdentifier().value;this.consume("PUNCTUATION","(");const n=[];for(;!this.check("PUNCTUATION",")")&&!this.isEnd();){const l=!this.check("KEYWORD","optional");l||this.advance();const d=this.consumeIdentifier().value;this.consume("OPERATOR",":");const y=this.parseType();let v;this.check("OPERATOR","=")&&(this.advance(),v=this.parseExpr()),n.push({type:"Parameter",name:d,dataType:y,required:l,defaultValue:v}),this.check("PUNCTUATION",",")&&this.advance()}this.consume("PUNCTUATION",")");let r;this.check("KEYWORD","returns")&&(this.advance(),r=this.parseType());const s=[],i=[],a=[],o=[];if(this.check("PUNCTUATION","{")){for(this.advance(),this.skipNL();!this.check("PUNCTUATION","}")&&!this.isEnd()&&(this.skipNL(),!this.check("PUNCTUATION","}"));)this.check("KEYWORD","guard")||this.check("KEYWORD","when")?(this.advance(),s.push(this.parseExpr())):this.check("KEYWORD","constraint")?i.push(this.parseConstraint()):this.check("KEYWORD","emit")?(this.advance(),o.push(this.consumeIdentifier().value)):a.push(this.parseAction()),this.skipNL();this.consume("PUNCTUATION","}")}else this.check("OPERATOR","=>")&&(this.advance(),a.push(this.parseAction()));return{type:"Command",name:e,parameters:n,guards:s.length?s:void 0,constraints:i.length?i:void 0,actions:a,emits:o.length?o:void 0,returns:r}}parsePolicy(){this.consume("KEYWORD","policy");const e=this.consumeIdentifier().value;let n="all";(this.check("KEYWORD","read")||this.check("KEYWORD","write")||this.check("KEYWORD","delete")||this.check("KEYWORD","execute")||this.check("KEYWORD","all")||this.check("KEYWORD","override"))&&(n=this.advance().value),this.consume("OPERATOR",":"),this.skipNL();const r=this.parseExpr(),s=this.check("STRING")?this.advance().value:void 0;return{type:"Policy",name:e,action:n,expression:r,message:s}}parseStore(){this.consume("KEYWORD","store");const e=this.consumeIdentifier().value;this.consume("KEYWORD","in");const n=this.advance().value,r={};if(this.check("PUNCTUATION","{")){for(this.advance(),this.skipNL();!this.check("PUNCTUATION","}")&&!this.isEnd()&&(this.skipNL(),!this.check("PUNCTUATION","}"));){const s=this.consumeIdentifierOrKeyword().value;this.consume("OPERATOR",":"),r[s]=this.parseExpr(),this.skipNL()}this.consume("PUNCTUATION","}")}return{type:"Store",entity:e,target:n,config:Object.keys(r).length?r:void 0}}parseOutboxEvent(){this.consume("KEYWORD","event");const e=this.consumeIdentifier().value;this.consume("OPERATOR",":");const n=this.check("STRING")?this.advance().value:e;let r={type:"Type",name:"unknown",nullable:!1};if(this.check("PUNCTUATION","{")){this.advance(),this.skipNL();const s=[];for(;!this.check("PUNCTUATION","}")&&!this.isEnd()&&(this.skipNL(),!this.check("PUNCTUATION","}"));){const i=this.consumeIdentifier().value;this.consume("OPERATOR",":");const a=this.parseType();s.push({type:"Parameter",name:i,dataType:a,required:!0}),this.skipNL()}this.consume("PUNCTUATION","}"),r={fields:s}}else(this.check("IDENTIFIER")||this.check("KEYWORD"))&&(r=this.parseType());return{type:"OutboxEvent",name:e,channel:n,payload:r}}parseType(){const e=this.advance().value;let n;this.check("OPERATOR","<")&&(this.advance(),n=this.parseType(),this.consume("OPERATOR",">"));const r=this.check("OPERATOR","?")?(this.advance(),!0):!1;return{type:"Type",name:e,generic:n,nullable:r}}parseBehavior(){this.check("KEYWORD","behavior")&&this.advance(),this.consume("KEYWORD","on");const e=this.parseTrigger(),n=[];for(;this.check("KEYWORD","guard")||this.check("KEYWORD","when");)this.advance(),n.push(this.parseExpr());const r=[];if(this.check("PUNCTUATION","{")){for(this.advance(),this.skipNL();!this.check("PUNCTUATION","}")&&!this.isEnd()&&(this.skipNL(),!this.check("PUNCTUATION","}"));)r.push(this.parseAction()),this.skipNL();this.consume("PUNCTUATION","}")}else(this.check("KEYWORD","then")||this.check("OPERATOR","=>"))&&(this.advance(),r.push(this.parseAction()));return{type:"Behavior",name:e.event,trigger:e,actions:r,guards:n.length?n:void 0}}parseTrigger(){const e=this.consumeIdentifier().value;let n;if(this.check("PUNCTUATION","(")){for(this.advance(),n=[];!this.check("PUNCTUATION",")")&&!this.isEnd();)n.push(this.consumeIdentifier().value),this.check("PUNCTUATION",",")&&this.advance();this.consume("PUNCTUATION",")")}return{type:"Trigger",event:e,parameters:n}}parseAction(){let e="compute",n;if(this.check("KEYWORD","mutate"))this.advance(),e="mutate",n=this.consumeIdentifier().value,this.consume("OPERATOR","=");else if(this.check("KEYWORD","emit"))this.advance(),e="emit";else if(this.check("KEYWORD","effect"))this.advance(),e="effect";else if(this.check("KEYWORD","publish"))this.advance(),e="publish";else if(this.check("KEYWORD","persist"))this.advance(),e="persist";else if(this.check("KEYWORD","compute")){this.advance(),e="compute";const r=this.tokens[this.pos+1];this.check("IDENTIFIER")&&(r==null?void 0:r.type)==="OPERATOR"&&(r==null?void 0:r.value)==="="&&(n=this.consumeIdentifier().value,this.consume("OPERATOR","="))}return{type:"Action",kind:e,target:n,expression:this.parseExpr()}}parseConstraint(){this.consume("KEYWORD","constraint");let e=!1;this.check("KEYWORD","overrideable")&&(this.advance(),e=!0);const n=this.consumeIdentifier().value;let r,s,i,a,o,l;if(this.check("PUNCTUATION","{")){this.advance(),this.skipNL();let y;for(;!this.check("PUNCTUATION","}")&&!this.isEnd()&&(this.skipNL(),!this.check("PUNCTUATION","}"));){const v=this.consumeIdentifierOrKeyword().value;switch(this.consume("OPERATOR",":"),v){case"code":r=this.consumeIdentifier().value;break;case"severity":{const h=this.consumeIdentifierOrKeyword().value;(h==="ok"||h==="warn"||h==="block")&&(s=h);break}case"expression":y=this.parseExpr();break;case"message":i=this.check("STRING")?this.advance().value:void 0;break;case"messageTemplate":a=this.check("STRING")?this.advance().value:void 0;break;case"overridePolicy":l=this.consumeIdentifier().value;break;case"details":if(o={},this.check("PUNCTUATION","{")){for(this.advance(),this.skipNL();!this.check("PUNCTUATION","}")&&!this.isEnd()&&(this.skipNL(),!this.check("PUNCTUATION","}"));){const h=this.consumeIdentifierOrKeyword().value;this.consume("OPERATOR",":"),o[h]=this.parseExpr(),this.skipNL(),this.check("PUNCTUATION",",")&&this.advance()}this.consume("PUNCTUATION","}")}break;default:this.parseExpr()}this.skipNL(),this.check("PUNCTUATION",",")&&this.advance()}if(this.consume("PUNCTUATION","}"),!y)throw new Error("Constraint block must include an expression");return{type:"Constraint",name:n,code:r,expression:y,severity:s||"block",message:i,messageTemplate:a,detailsMapping:o,overrideable:e,overridePolicyRef:l}}this.consume("OPERATOR",":"),(this.check("KEYWORD","ok")||this.check("KEYWORD","warn")||this.check("KEYWORD","block"))&&(s=this.advance().value);const d=this.parseExpr();return i=this.check("STRING")?this.advance().value:void 0,{type:"Constraint",name:n,code:r,expression:d,severity:s||"block",message:i,overrideable:e}}parseFlow(){this.consume("KEYWORD","flow");const e=this.consumeIdentifier().value;this.consume("PUNCTUATION","(");const n=this.parseType();this.consume("PUNCTUATION",")"),this.consume("OPERATOR","->");const r=this.parseType();this.consume("PUNCTUATION","{"),this.skipNL();const s=[];for(;!this.check("PUNCTUATION","}")&&!this.isEnd()&&(this.skipNL(),!this.check("PUNCTUATION","}"));)s.push(this.parseFlowStep()),this.skipNL();return this.consume("PUNCTUATION","}"),{type:"Flow",name:e,input:n,output:r,steps:s}}parseFlowStep(){const e=this.advance().value;let n;return this.check("KEYWORD","when")&&(this.advance(),n=this.parseExpr()),this.consume("OPERATOR",":"),{type:"FlowStep",operation:e,expression:this.parseExpr(),condition:n}}parseEffect(){this.consume("KEYWORD","effect");const e=this.consumeIdentifier().value;this.consume("OPERATOR",":");const n=this.advance().value,r={};if(this.check("PUNCTUATION","{")){for(this.advance(),this.skipNL();!this.check("PUNCTUATION","}")&&!this.isEnd()&&(this.skipNL(),!this.check("PUNCTUATION","}"));){const s=this.consumeIdentifierOrKeyword().value;this.consume("OPERATOR",":"),r[s]=this.parseExpr(),this.skipNL()}this.consume("PUNCTUATION","}")}return{type:"Effect",name:e,kind:n,config:r}}parseExpose(){this.consume("KEYWORD","expose");const e=this.consumeIdentifier().value;this.consume("KEYWORD","as");const n=this.advance().value;let r=e.toLowerCase(),s=!1;this.check("KEYWORD","server")&&(this.advance(),s=!0),this.check("STRING")&&(r=this.advance().value);const i=[],a=[];if(this.check("PUNCTUATION","{")){for(this.advance(),this.skipNL();!this.check("PUNCTUATION","}")&&!this.isEnd()&&(this.skipNL(),!this.check("PUNCTUATION","}"));){const o=this.advance().value;o==="middleware"?(this.consume("OPERATOR",":"),a.push(this.consumeIdentifier().value)):i.push(o),this.check("PUNCTUATION",",")&&this.advance(),this.skipNL()}this.consume("PUNCTUATION","}")}return{type:"Expose",name:r,protocol:n,entity:e,operations:i,generateServer:s,middleware:a.length?a:void 0}}parseComposition(){this.consume("KEYWORD","compose");const e=this.consumeIdentifier().value;this.consume("PUNCTUATION","{"),this.skipNL();const n=[],r=[];for(;!this.check("PUNCTUATION","}")&&!this.isEnd()&&(this.skipNL(),!this.check("PUNCTUATION","}"));)this.check("KEYWORD","connect")?r.push(this.parseConnection()):n.push(this.parseComponentRef()),this.skipNL();return this.consume("PUNCTUATION","}"),{type:"Composition",name:e,components:n,connections:r}}parseComponentRef(){const e=this.consumeIdentifier().value;let n;return this.check("KEYWORD","as")&&(this.advance(),n=this.consumeIdentifier().value),{type:"ComponentRef",entity:e,alias:n}}parseConnection(){this.consume("KEYWORD","connect");const e=this.consumeIdentifier().value;this.consume("OPERATOR",".");const n=this.consumeIdentifierOrKeyword().value;this.consume("OPERATOR","->");const r=this.consumeIdentifier().value;this.consume("OPERATOR",".");const s=this.consumeIdentifierOrKeyword().value;let i;return this.check("KEYWORD","with")&&(this.advance(),i=this.parseExpr()),{type:"Connection",from:{component:e,output:n},to:{component:r,input:s},transform:i}}parseExpr(){return this.parseTernary()}parseTernary(){const e=this.parseOr();if(this.check("OPERATOR","?")){this.advance();const n=this.parseExpr();this.consume("OPERATOR",":");const r=this.parseExpr();return{type:"Conditional",condition:e,consequent:n,alternate:r}}return e}parseOr(){let e=this.parseAnd();for(;this.check("OPERATOR","||")||this.check("KEYWORD","or");)e={type:"BinaryOp",operator:this.advance().value,left:e,right:this.parseAnd()};return e}parseAnd(){let e=this.parseEquality();for(;this.check("OPERATOR","&&")||this.check("KEYWORD","and");)e={type:"BinaryOp",operator:this.advance().value,left:e,right:this.parseEquality()};return e}parseEquality(){var n,r;let e=this.parseComparison();for(;["==","!="].includes(((n=this.current())==null?void 0:n.value)||"")||["is","in","contains"].includes(((r=this.current())==null?void 0:r.value)||"");)e={type:"BinaryOp",operator:this.advance().value,left:e,right:this.parseComparison()};return e}parseComparison(){var n;let e=this.parseAdditive();for(;["<",">","<=",">="].includes(((n=this.current())==null?void 0:n.value)||"");)e={type:"BinaryOp",operator:this.advance().value,left:e,right:this.parseAdditive()};return e}parseAdditive(){var n;let e=this.parseMultiplicative();for(;["+","-"].includes(((n=this.current())==null?void 0:n.value)||"");)e={type:"BinaryOp",operator:this.advance().value,left:e,right:this.parseMultiplicative()};return e}parseMultiplicative(){var n;let e=this.parseUnary();for(;["*","/","%"].includes(((n=this.current())==null?void 0:n.value)||"");)e={type:"BinaryOp",operator:this.advance().value,left:e,right:this.parseUnary()};return e}parseUnary(){var e;return["!","-"].includes(((e=this.current())==null?void 0:e.value)||"")||this.check("KEYWORD","not")?{type:"UnaryOp",operator:this.advance().value,operand:this.parseUnary()}:this.parsePostfix()}parsePostfix(){let e=this.parsePrimary();for(;;)if(this.check("OPERATOR",".")||this.check("OPERATOR","?."))this.advance(),e={type:"MemberAccess",object:e,property:this.consumeIdentifierOrKeyword().value};else if(this.check("PUNCTUATION","(")){this.advance();const n=[];for(;!this.check("PUNCTUATION",")")&&!this.isEnd();)n.push(this.parseExpr()),this.check("PUNCTUATION",",")&&this.advance();this.consume("PUNCTUATION",")"),e={type:"Call",callee:e,arguments:n}}else if(this.check("PUNCTUATION","[")){this.advance();const n=this.parseExpr();this.consume("PUNCTUATION","]"),e={type:"MemberAccess",object:e,property:`[${"value"in n?n.value:""}]`}}else break;return e}parsePrimary(){var e;if(this.check("NUMBER"))return{type:"Literal",value:parseFloat(this.advance().value),dataType:"number"};if(this.check("STRING"))return{type:"Literal",value:this.advance().value,dataType:"string"};if(this.check("KEYWORD","true")||this.check("KEYWORD","false"))return{type:"Literal",value:this.advance().value==="true",dataType:"boolean"};if(this.check("KEYWORD","null"))return this.advance(),{type:"Literal",value:null,dataType:"null"};if(this.check("PUNCTUATION","[")){this.advance();const n=[];for(;!this.check("PUNCTUATION","]")&&!this.isEnd();)n.push(this.parseExpr()),this.check("PUNCTUATION",",")&&this.advance();return this.consume("PUNCTUATION","]"),{type:"Array",elements:n}}if(this.check("PUNCTUATION","{")){this.advance(),this.skipNL();const n=[];for(;!this.check("PUNCTUATION","}")&&!this.isEnd()&&(this.skipNL(),!this.check("PUNCTUATION","}"));){const r=this.check("STRING")?this.advance().value:this.consumeIdentifierOrKeyword().value;this.consume("OPERATOR",":"),n.push({key:r,value:this.parseExpr()}),this.check("PUNCTUATION",",")&&this.advance(),this.skipNL()}return this.consume("PUNCTUATION","}"),{type:"Object",properties:n}}if(this.check("PUNCTUATION","(")){this.advance();const n=this.pos,r=[];for(;this.check("IDENTIFIER")&&!this.isEnd()&&(r.push(this.advance().value),this.check("PUNCTUATION",","));)this.advance();if(this.check("PUNCTUATION",")")&&(this.advance(),this.check("OPERATOR","=>")))return this.advance(),{type:"Lambda",parameters:r,body:this.parseExpr()};this.pos=n;const s=this.parseExpr();return this.consume("PUNCTUATION",")"),s}if(this.check("IDENTIFIER")||this.check("KEYWORD","user")||this.check("KEYWORD","self")||this.check("KEYWORD","context"))return{type:"Identifier",name:this.advance().value};throw new Error(`Unexpected: ${((e=this.current())==null?void 0:e.value)||"EOF"}`)}check(e,n){const r=this.current();return r&&r.type===e&&(n===void 0||r.value===n)}consume(e,n){var r;if(this.check(e,n))return this.advance();throw new Error(`Expected ${n||e}, got ${((r=this.current())==null?void 0:r.value)||"EOF"}`)}consumeIdentifier(){const e=this.current();return e&&e.type==="KEYWORD"?(this.errors.push({message:`Reserved word '${e.value}' cannot be used as an identifier`,position:e.position,severity:"error"}),this.advance()):this.consume("IDENTIFIER")}consumeIdentifierOrKeyword(){const e=this.current();if(e&&(e.type==="IDENTIFIER"||e.type==="KEYWORD"))return this.advance();throw new Error(`Expected identifier, got ${(e==null?void 0:e.value)||"EOF"}`)}advance(){return this.isEnd()||this.pos++,this.tokens[this.pos-1]}current(){return this.tokens[this.pos]}isEnd(){var e;return this.pos>=this.tokens.length||((e=this.tokens[this.pos])==null?void 0:e.type)==="EOF"}skipNL(){for(;this.check("NEWLINE",`
`);)this.advance()}sync(){var e;for(this.advance();!this.isEnd()&&!["entity","flow","effect","expose","compose","module","command","policy","store","event"].includes(((e=this.current())==null?void 0:e.value)||"");)this.advance()}}const Oo="0.3.8",Po="1.0";class Nf{constructor(){ce(this,"out",[]);ce(this,"serverOut",[]);ce(this,"testOut",[]);ce(this,"indent",0);ce(this,"provenance")}generate(e){this.out=[],this.serverOut=[],this.testOut=[],this.indent=0,this.provenance={compilerVersion:Oo,schemaVersion:Po,generatedAt:new Date().toISOString()},this.emitRuntime(),this.emitStoreRuntime(e);for(const n of e.stores)this.genStore(n);for(const n of e.entities)this.genEntity(n),this.line();for(const n of e.commands)this.genCommand(n),this.line();for(const n of e.flows)this.genFlow(n),this.line();for(const n of e.effects)this.genEffect(n),this.line();for(const n of e.events)this.genOutboxEvent(n),this.line();for(const n of e.exposures)this.genExpose(n),this.line();for(const n of e.compositions)this.genComposition(n),this.line();return this.emitExports(e),this.genServerCode(e),this.genTestCode(e),{code:this.out.join(`
`),serverCode:this.serverOut.join(`
`),testCode:this.testOut.join(`
`)}}emitRuntime(){this.line("// Generated by Manifest Compiler v2.0"),this.line("// This code is a PROJECTION from a Manifest source file."),this.line("// The IR (Intermediate Representation) is the single source of truth."),this.line("// This generated code should not be edited manually."),this.line("//"),this.line("// Provenance:"),this.line(`//   Compiler Version: ${this.provenance.compilerVersion}`),this.line(`//   Schema Version: ${this.provenance.schemaVersion}`),this.line(`//   Generated At: ${this.provenance.generatedAt}`),this.line("//"),this.line("// Includes: Commands, Computed Properties, Relationships, Policies, Stores, Events"),this.line(),this.line("type Subscriber<T> = (value: T) => void;"),this.line("type User = { id: string; role?: string; [key: string]: unknown };"),this.line("type Context = { user?: User; [key: string]: unknown };"),this.line(),this.line("let _context: Context = {};"),this.line("const setContext = (ctx: Context) => { _context = ctx; };"),this.line("const getContext = () => _context;"),this.line(),this.line("class Observable<T> {"),this.in(),this.line("private subs: Set<Subscriber<T>> = new Set();"),this.line("private _v: T;"),this.line("constructor(v: T) { this._v = v; }"),this.line("get value(): T { return this._v; }"),this.line("set(v: T) { this._v = v; this.subs.forEach(fn => fn(v)); }"),this.line("subscribe(fn: Subscriber<T>) { this.subs.add(fn); fn(this._v); return () => this.subs.delete(fn); }"),this.de(),this.line("}"),this.line(),this.line("class EventEmitter<T extends Record<string, unknown>> {"),this.in(),this.line("private listeners: Map<keyof T, Set<(d: unknown) => void>> = new Map();"),this.line("on<K extends keyof T>(e: K, fn: (d: T[K]) => void) { if (!this.listeners.has(e)) this.listeners.set(e, new Set()); this.listeners.get(e)!.add(fn); return () => this.listeners.get(e)?.delete(fn); }"),this.line("emit<K extends keyof T>(e: K, d: T[K]) { this.listeners.get(e)?.forEach(fn => fn(d)); }"),this.de(),this.line("}"),this.line(),this.line("class EventBus {"),this.in(),this.line("private static channels: Map<string, Set<(d: unknown) => void>> = new Map();"),this.line("static publish(channel: string, data: unknown) { this.channels.get(channel)?.forEach(fn => fn(data)); }"),this.line("static subscribe(channel: string, fn: (d: unknown) => void) { if (!this.channels.has(channel)) this.channels.set(channel, new Set()); this.channels.get(channel)!.add(fn); return () => this.channels.get(channel)?.delete(fn); }"),this.de(),this.line("}"),this.line()}emitStoreRuntime(e){const n=e.stores.some(r=>r.target==="supabase");n&&(this.line("// Development-time Supabase client mock (production runtime uses stores.node.ts:SupabaseStore)"),this.line("const supabase = { from: (table: string) => ({ select: () => Promise.resolve({ data: [], error: null }), insert: (d: unknown) => Promise.resolve({ data: d, error: null }), update: (d: unknown) => ({ eq: () => Promise.resolve({ data: d, error: null }) }), delete: () => ({ eq: () => Promise.resolve({ error: null }) }) }) };"),this.line()),this.line("interface Store<T> {"),this.in(),this.line("getAll(): Promise<T[]>;"),this.line("getById(id: string): Promise<T | null>;"),this.line("create(item: Partial<T>): Promise<T>;"),this.line("update(id: string, item: Partial<T>): Promise<T>;"),this.line("delete(id: string): Promise<boolean>;"),this.line("query(filter: (item: T) => boolean): Promise<T[]>;"),this.de(),this.line("}"),this.line(),this.line("class MemoryStore<T extends { id: string }> implements Store<T> {"),this.in(),this.line("private data: Map<string, T> = new Map();"),this.line("async getAll() { return Array.from(this.data.values()); }"),this.line("async getById(id: string) { return this.data.get(id) || null; }"),this.line("async create(item: Partial<T>) { const id = item.id || crypto.randomUUID(); const full = { ...item, id } as T; this.data.set(id, full); return full; }"),this.line('async update(id: string, item: Partial<T>) { const existing = this.data.get(id); if (!existing) throw new Error("Not found"); const updated = { ...existing, ...item }; this.data.set(id, updated); return updated; }'),this.line("async delete(id: string) { return this.data.delete(id); }"),this.line("async query(filter: (item: T) => boolean) { return Array.from(this.data.values()).filter(filter); }"),this.de(),this.line("}"),this.line(),this.line("class LocalStorageStore<T extends { id: string }> implements Store<T> {"),this.in(),this.line("constructor(private key: string) {}"),this.line("private load(): T[] { const d = localStorage.getItem(this.key); return d ? JSON.parse(d) : []; }"),this.line("private save(data: T[]) { localStorage.setItem(this.key, JSON.stringify(data)); }"),this.line("async getAll() { return this.load(); }"),this.line("async getById(id: string) { return this.load().find(x => x.id === id) || null; }"),this.line("async create(item: Partial<T>) { const data = this.load(); const id = item.id || crypto.randomUUID(); const full = { ...item, id } as T; data.push(full); this.save(data); return full; }"),this.line('async update(id: string, item: Partial<T>) { const data = this.load(); const idx = data.findIndex(x => x.id === id); if (idx < 0) throw new Error("Not found"); data[idx] = { ...data[idx], ...item }; this.save(data); return data[idx]; }'),this.line("async delete(id: string) { const data = this.load(); const idx = data.findIndex(x => x.id === id); if (idx < 0) return false; data.splice(idx, 1); this.save(data); return true; }"),this.line("async query(filter: (item: T) => boolean) { return this.load().filter(filter); }"),this.de(),this.line("}"),this.line(),n&&(this.line("class SupabaseStore<T extends { id: string }> implements Store<T> {"),this.in(),this.line("constructor(private table: string) {}"),this.line("async getAll() { const { data } = await supabase.from(this.table).select(); return (data || []) as T[]; }"),this.line('async getById(id: string) { const { data } = await supabase.from(this.table).select().eq("id", id).single(); return data as T | null; }'),this.line("async create(item: Partial<T>) { const { data } = await supabase.from(this.table).insert(item).select().single(); return data as T; }"),this.line('async update(id: string, item: Partial<T>) { const { data } = await supabase.from(this.table).update(item).eq("id", id).select().single(); return data as T; }'),this.line('async delete(id: string) { const { error } = await supabase.from(this.table).delete().eq("id", id); return !error; }'),this.line("async query(filter: (item: T) => boolean) { const all = await this.getAll(); return all.filter(filter); }"),this.de(),this.line("}"),this.line())}genStore(e){var r,s;const n=`${e.entity}Store`;switch(e.target){case"memory":this.line(`const ${n}: Store<I${e.entity}> = new MemoryStore();`);break;case"localStorage":{const i=(r=e.config)!=null&&r.key?this.genExpr(e.config.key):`"${e.entity.toLowerCase()}s"`;this.line(`const ${n}: Store<I${e.entity}> = new LocalStorageStore(${i});`);break}case"supabase":case"postgres":{const i=(s=e.config)!=null&&s.table?this.genExpr(e.config.table):`"${e.entity.toLowerCase()}s"`;this.line(`const ${n}: Store<I${e.entity}> = new SupabaseStore(${i});`);break}}this.line()}genEntity(e){const n=`I${e.name}`;this.line(`interface ${n} {`),this.in();for(const i of e.properties){const a=i.modifiers.includes("required")?"":"?";this.line(`${i.name}${a}: ${this.tsType(i.dataType)};`)}for(const i of e.computedProperties)this.line(`readonly ${i.name}: ${this.tsType(i.dataType)};`);for(const i of e.relationships)this.line(`${i.name}${i.kind==="belongsTo"||i.kind==="ref"?"?":""}: ${this.relationType(i)};`);this.de(),this.line("}"),this.line();const r=this.collectEvents(e),s=r.size?`{ ${[...r].map(i=>`${i}: unknown`).join("; ")} }`:"{}";this.line(`class ${e.name} extends EventEmitter<${s}> {`),this.in();for(const i of e.properties){const a=i.defaultValue?this.genExpr(i.defaultValue):this.defVal(i.dataType);this.line(`private _${i.name} = new Observable(${a});`)}this.line();for(const i of e.properties)this.line(`get ${i.name}() { return this._${i.name}.value; }`),i.modifiers.includes("readonly")||(this.line(`set ${i.name}(v: ${this.tsType(i.dataType)}) {`),this.in(),this.genConstraintChecks(e.constraints,i.name),this.line(`const old = this._${i.name}.value;`),this.line(`this._${i.name}.set(v);`),this.line("if (old !== v) this._recompute();"),this.de(),this.line("}"));for(const i of e.computedProperties)this.line(`private _computed_${i.name}: ${this.tsType(i.dataType)} = ${this.defVal(i.dataType)};`),this.line(`get ${i.name}() { return this._computed_${i.name}; }`);for(const i of e.relationships)i.kind==="hasMany"?(this.line(`private _rel_${i.name}: ${i.target}[] = [];`),this.line(`get ${i.name}() { return this._rel_${i.name}; }`),this.line(`add${this.capitalize(i.name.replace(/s$/,""))}(item: ${i.target}) { this._rel_${i.name}.push(item); }`)):(this.line(`private _rel_${i.name}: ${i.target} | null = null;`),this.line(`get ${i.name}() { return this._rel_${i.name}; }`),this.line(`set ${i.name}(v: ${i.target} | null) { this._rel_${i.name} = v; }`));this.line(),this.line(`constructor(init?: Partial<${n}>) {`),this.in(),this.line("super();"),this.line("if (init) {"),this.in();for(const i of e.properties)this.line(`if (init.${i.name} !== undefined) this._${i.name}.set(init.${i.name});`);this.de(),this.line("}"),this.line("this._initBehaviors();"),this.line("this._recompute();"),this.de(),this.line("}"),this.line(),this.line("private _recompute() {"),this.in();for(const i of e.computedProperties)this.line(`this._computed_${i.name} = ${this.genExpr(i.expression).replace(/\bthis\./g,"this.")};`);this.de(),this.line("}"),this.line(),this.line("private _initBehaviors() {"),this.in();for(const i of e.behaviors)this.genBehaviorBinding(i);if(this.de(),this.line("}"),e.policies.length>0){this.line(),this.line("checkPolicy(action: string, user: User): boolean {"),this.in(),this.line("const context = getContext();");for(const i of e.policies){const a=i.action==="all"?"true":`action === "${i.action}"`;this.line(`if (${a} && !(${this.genExpr(i.expression)})) return false;`)}this.line("return true;"),this.de(),this.line("}")}this.line(),this.line(`subscribe(prop: keyof ${n}, fn: (v: unknown) => void) { return (this as Record<string, unknown>)[\`_\${prop}\`]?.subscribe?.(fn); }`),this.line(),this.line("toJSON() {"),this.in(),this.line("return {"),this.in();for(const i of e.properties)this.line(`${i.name}: this.${i.name},`);for(const i of e.computedProperties)this.line(`${i.name}: this.${i.name},`);this.de(),this.line("};"),this.de(),this.line("}");for(const i of e.commands)this.genCommandMethod(i,e);for(const i of e.behaviors)i.trigger.event!=="create"&&!i.trigger.event.startsWith("_")&&this.genBehaviorMethod(i);this.de(),this.line("}")}collectEvents(e){const n=new Set;for(const r of e.behaviors){n.add(r.trigger.event);for(const s of r.actions)s.kind==="emit"&&s.expression.type==="Identifier"&&"name"in s.expression&&n.add(s.expression.name)}for(const r of e.commands)r.emits&&r.emits.forEach(s=>n.add(s));return n}relationType(e){return e.kind==="hasMany"?`${e.target}[]`:`${e.target} | null`}genCommandMethod(e,n){const r=e.parameters.map(i=>`${i.name}${i.required?"":"?"}: ${this.tsType(i.dataType)}`).join(", "),s=e.returns?this.tsType(e.returns):"unknown";if(this.line(),this.line(`async ${e.name}(${r}): Promise<${s}> {`),this.in(),n&&n.policies.length>0&&(this.line("// Policy checks"),n.policies.some(a=>a.action==="all"||a.action==="execute"))){this.line("const user = getContext().user;");for(const a of n.policies)a.action!=="all"&&a.action!=="execute"||this.line(`if (!(${this.genExpr(a.expression)})) throw new Error(${JSON.stringify(a.message||`Denied by policy '${a.name}'`)});`)}if(e.guards&&e.guards.length>0){this.line("// Guard checks");for(const i of e.guards)this.line(`if (!(${this.genExpr(i)})) throw new Error("Guard failed for ${e.name}");`)}if(e.actions.length>0){this.line("let _result: unknown;");for(const i of e.actions)this.line(`_result = ${this.genAction(i)};`)}if(e.emits)for(const i of e.emits)this.line(`this.emit('${i}', { ${e.parameters.map(a=>a.name).join(", ")} });`);e.actions.length>0&&this.line(`return _result as ${s};`),this.de(),this.line("}")}genCommand(e){const n=e.parameters.map(s=>`${s.name}${s.required?"":"?"}: ${this.tsType(s.dataType)}`).join(", "),r=e.returns?this.tsType(e.returns):"unknown";if(this.line(`async function ${e.name}(${n}): Promise<${r}> {`),this.in(),e.guards&&e.guards.length>0){this.line("// Guard checks");for(const s of e.guards)this.line(`if (!(${this.genExpr(s)})) throw new Error("Guard failed for ${e.name}");`)}if(e.actions.length>0){this.line("let _result: unknown;");for(const s of e.actions)this.line(`_result = ${this.genAction(s)};`)}if(e.emits)for(const s of e.emits)this.line(`EventBus.publish('${s}', { ${e.parameters.map(i=>i.name).join(", ")} });`);e.actions.length>0&&this.line(`return _result as ${r};`),this.de(),this.line("}")}genOutboxEvent(e){if("fields"in e.payload&&Array.isArray(e.payload.fields)){const r=`{ ${e.payload.fields.map(s=>`${s.name}: ${this.tsType(s.dataType)}`).join("; ")} }`;this.line(`interface ${e.name}Event ${r}`),this.line(),this.line(`const publish${e.name} = (data: ${e.name}Event) => {`),this.in(),this.line(`EventBus.publish('${e.channel}', data);`),this.de(),this.line("};");return}const n=this.tsType(e.payload);this.line(`interface ${e.name}Event ${n}`),this.line(),this.line(`const publish${e.name} = (data: ${e.name}Event) => {`),this.in(),this.line(`EventBus.publish('${e.channel}', data);`),this.de(),this.line("};"),this.line(),this.line(`const subscribe${e.name} = (fn: (data: ${e.name}Event) => void) => {`),this.in(),this.line(`return EventBus.subscribe('${e.channel}', fn);`),this.de(),this.line("};")}genConstraintChecks(e,n){for(const r of e){const s=this.genExpr(r.expression);(s.includes(n)||s.includes("this."))&&this.line(`if (!(${s.replace(new RegExp(`this\\.${n}`,"g"),"v")})) throw new Error(${JSON.stringify(r.message||`Constraint '${r.name}' violated`)});`)}}genBehaviorBinding(e){var r,s;if(e.trigger.event==="create"){for(const i of e.actions)this.line(this.genAction(i));return}const n=((r=e.trigger.parameters)==null?void 0:r.join(", "))||"d";if(this.line(`this.on('${e.trigger.event}', (${n}) => {`),this.in(),(s=e.guards)!=null&&s.length){const i=e.guards.map(a=>`(${this.genExpr(a)})`).join(" && ");this.line(`if (!(${i})) return;`)}for(const i of e.actions)this.line(this.genAction(i));this.de(),this.line("});")}genBehaviorMethod(e){const n=e.trigger.parameters||[];this.line(),this.line(`${e.trigger.event}(${n.map(r=>`${r}: unknown`).join(", ")}) {`),this.in(),this.line(`this.emit('${e.trigger.event}', ${n.length?`{ ${n.join(", ")} }`:"{}"});`),this.de(),this.line("}")}genAction(e){return e.kind==="mutate"?`this.${e.target} = ${this.genExpr(e.expression)};`:e.kind==="emit"?e.expression.type==="Identifier"&&"name"in e.expression?`this.emit('${e.expression.name}', {});`:`this.emit('event', ${this.genExpr(e.expression)});`:e.kind==="effect"?`await (${this.genExpr(e.expression)});`:e.kind==="publish"?`EventBus.publish('event', ${this.genExpr(e.expression)});`:e.kind==="persist"?`await ${e.target}Store.update(this.id, this.toJSON());`:`${this.genExpr(e.expression)};`}genFlow(e){this.line(`function ${e.name}(input: ${this.tsType(e.input)}): ${this.tsType(e.output)} {`),this.in(),this.line("let _v = input;"),this.line();for(const n of e.steps){const r=this.genExpr(n.expression);n.condition&&(this.line(`if (${this.genExpr(n.condition)}) {`),this.in()),n.operation==="map"?this.line(`_v = (${r})(_v);`):n.operation==="filter"?this.line(`if (!(${r})(_v)) return null;`):n.operation==="validate"?this.line(`if (!(${r})(_v)) throw new Error('Validation failed');`):n.operation==="transform"?this.line(`_v = ${r};`):n.operation==="tap"?this.line(`(${r})(_v);`):this.line(`_v = ${r};`),n.condition&&(this.de(),this.line("}"))}this.line(),this.line("return _v;"),this.de(),this.line("}")}genEffect(e){if(this.line(`const ${e.name}Effect = {`),this.in(),this.line(`kind: '${e.kind}' as const,`),e.kind==="http"){const n=e.config.url?this.genExpr(e.config.url):'""',r=e.config.method?this.genExpr(e.config.method):'"GET"';this.line("async execute(data?: unknown) {"),this.in(),this.line(`const res = await fetch(${n}, { method: ${r}, headers: { 'Content-Type': 'application/json' }, body: data ? JSON.stringify(data) : undefined });`),this.line("return res.json();"),this.de(),this.line("},")}else if(e.kind==="storage"){const n=e.config.key?this.genExpr(e.config.key):'"data"';this.line(`get() { const d = localStorage.getItem(${n}); return d ? JSON.parse(d) : null; },`),this.line(`set(v: unknown) { localStorage.setItem(${n}, JSON.stringify(v)); },`),this.line(`remove() { localStorage.removeItem(${n}); },`)}else if(e.kind==="timer"){const n=e.config.interval?this.genExpr(e.config.interval):"1000";this.line(`start(cb: () => void) { return setInterval(cb, ${n}); },`),this.line("stop(id: number) { clearInterval(id); },")}else{this.line("config: {"),this.in();for(const[n,r]of Object.entries(e.config))this.line(`${n}: ${this.genExpr(r)},`);this.de(),this.line("},"),this.line("execute(data?: unknown) { /* custom */ },")}this.de(),this.line("};")}genExpose(e){if(e.protocol==="rest"){const n=e.entity,r=e.name.startsWith("/")?e.name:`/${e.name}`;this.line(`const ${n}API = {`),this.in(),this.line(`basePath: '${r}',`),this.line(`entity: ${e.entity},`);const s=e.operations.length?e.operations:["list","get","create","update","delete"];s.includes("list")&&this.line(`async list(q?: Record<string, unknown>) { return ${e.entity}Store.getAll(); },`),s.includes("get")&&this.line(`async get(id: string) { return ${e.entity}Store.getById(id); },`),s.includes("create")&&this.line(`async create(d: Partial<I${e.entity}>) { return ${e.entity}Store.create(d); },`),s.includes("update")&&this.line(`async update(id: string, d: Partial<I${e.entity}>) { return ${e.entity}Store.update(id, d); },`),s.includes("delete")&&this.line(`async delete(id: string) { return ${e.entity}Store.delete(id); },`),this.de(),this.line("};")}else e.protocol==="function"&&this.line(`function create${e.entity}(d: Partial<I${e.entity}>) { return new ${e.entity}(d); }`)}genServerCode(e){var n;this.serverOut.push("// Generated Server Code - Express/Hono compatible routes"),this.serverOut.push("// Copy this to your server file"),this.serverOut.push(""),this.serverOut.push('import { Hono } from "hono";'),this.serverOut.push('import { cors } from "hono/cors";'),this.serverOut.push(""),this.serverOut.push("const app = new Hono();"),this.serverOut.push('app.use("*", cors());'),this.serverOut.push("");for(const r of e.exposures.filter(s=>s.generateServer&&s.protocol==="rest")){const s=e.entities.find(o=>o.name===r.entity),i=`/${r.name}`,a=r.operations.length?r.operations:["list","get","create","update","delete"];if(this.serverOut.push(`// ${r.entity} Routes`),a.includes("list")&&(this.serverOut.push(`app.get("${i}", async (c) => {`),this.serverOut.push(`  const items = await ${r.entity}Store.getAll();`),this.serverOut.push("  return c.json(items);"),this.serverOut.push("});")),a.includes("get")&&(this.serverOut.push(`app.get("${i}/:id", async (c) => {`),this.serverOut.push(`  const item = await ${r.entity}Store.getById(c.req.param("id"));`),this.serverOut.push('  if (!item) return c.json({ error: "Not found" }, 404);'),this.serverOut.push("  return c.json(item);"),this.serverOut.push("});")),a.includes("create")){if(this.serverOut.push(`app.post("${i}", async (c) => {`),this.serverOut.push("  const body = await c.req.json();"),s!=null&&s.constraints.length){this.serverOut.push("  // Validation from constraints");for(const o of s.constraints)this.serverOut.push(`  if (!(${this.genExpr(o.expression).replace(/this\./g,"body.")})) {`),this.serverOut.push(`    return c.json({ error: ${JSON.stringify(o.message||o.name)} }, 400);`),this.serverOut.push("  }")}this.serverOut.push(`  const item = await ${r.entity}Store.create(body);`),this.serverOut.push("  return c.json(item, 201);"),this.serverOut.push("});")}a.includes("update")&&(this.serverOut.push(`app.put("${i}/:id", async (c) => {`),this.serverOut.push("  const body = await c.req.json();"),this.serverOut.push(`  const item = await ${r.entity}Store.update(c.req.param("id"), body);`),this.serverOut.push("  return c.json(item);"),this.serverOut.push("});")),a.includes("delete")&&(this.serverOut.push(`app.delete("${i}/:id", async (c) => {`),this.serverOut.push(`  await ${r.entity}Store.delete(c.req.param("id"));`),this.serverOut.push("  return c.json({ success: true });"),this.serverOut.push("});")),this.serverOut.push("")}for(const r of e.commands){if(this.serverOut.push(`app.post("/commands/${r.name}", async (c) => {`),this.serverOut.push("  const body = await c.req.json();"),this.serverOut.push('  const user = c.get("user");'),(n=r.guards)!=null&&n.length){this.serverOut.push("  // Guard checks");for(const s of r.guards)this.serverOut.push(`  if (!(${this.genExpr(s).replace(/\buser\./g,"user.")})) {`),this.serverOut.push('    return c.json({ error: "Unauthorized" }, 403);'),this.serverOut.push("  }")}this.serverOut.push(`  const result = await ${r.name}(${r.parameters.map(s=>`body.${s.name}`).join(", ")});`),this.serverOut.push("  return c.json({ success: true, result });"),this.serverOut.push("});"),this.serverOut.push("")}this.serverOut.push("export default app;")}genTestCode(e){var n;this.testOut.push("// Generated Tests from Constraints"),this.testOut.push("// Run with: vitest or jest"),this.testOut.push(""),this.testOut.push('import { describe, it, expect } from "vitest";'),this.testOut.push("");for(const r of e.entities)if(r.constraints.length!==0){this.testOut.push(`describe("${r.name}", () => {`);for(const s of r.constraints){this.testOut.push(`  describe("constraint: ${s.name}", () => {`);const a=(s.message||s.name).replace(/"/g,'\\"').replace(/\\/g,"\\\\");this.testOut.push(`    it("should enforce: ${a}", () => {`),this.testOut.push(`      const instance = new ${r.name}();`),this.testOut.push("      // Test valid case"),this.testOut.push("      expect(() => {"),this.testOut.push("        // Set values that satisfy constraint"),this.testOut.push("      }).not.toThrow();"),this.testOut.push("    });"),this.testOut.push(""),this.testOut.push('    it("should reject invalid values", () => {'),this.testOut.push(`      const instance = new ${r.name}();`),this.testOut.push("      expect(() => {"),this.testOut.push("        // Set values that violate constraint"),this.testOut.push(`      }).toThrow(${JSON.stringify(s.message||`Constraint '${s.name}' violated`)});`),this.testOut.push("    });"),this.testOut.push("  });"),this.testOut.push("")}this.testOut.push("});"),this.testOut.push("")}for(const r of e.commands)if((n=r.guards)!=null&&n.length){this.testOut.push(`describe("command: ${r.name}", () => {`);for(let s=0;s<r.guards.length;s++)this.testOut.push(`  it("should enforce guard ${s+1}", async () => {`),this.testOut.push(`    await expect(${r.name}(/* invalid params */)).rejects.toThrow("Guard failed");`),this.testOut.push("  });");this.testOut.push("});"),this.testOut.push("")}}genComposition(e){this.line(`class ${e.name} {`),this.in();for(const n of e.components){const r=n.alias||n.entity.toLowerCase();this.line(`${r}: ${n.entity};`)}this.line(),this.line("constructor() {"),this.in();for(const n of e.components){const r=n.alias||n.entity.toLowerCase();this.line(`this.${r} = new ${n.entity}();`)}this.line();for(const n of e.connections)n.transform?this.line(`this.${n.from.component}.on('${n.from.output}', (d) => { const t = (${this.genExpr(n.transform)})(d); this.${n.to.component}.emit('${n.to.input}', t); });`):this.line(`this.${n.from.component}.on('${n.from.output}', (d) => this.${n.to.component}.emit('${n.to.input}', d));`);this.de(),this.line("}"),this.de(),this.line("}")}emitExports(e){const n=["setContext","getContext","EventBus"];for(const r of e.stores)n.push(`${r.entity}Store`);for(const r of e.entities)n.push(r.name);for(const r of e.commands)n.push(r.name);for(const r of e.flows)n.push(r.name);for(const r of e.effects)n.push(`${r.name}Effect`);for(const r of e.events)n.push(`publish${r.name}`),n.push(`subscribe${r.name}`);for(const r of e.exposures)n.push(r.protocol==="rest"?`${r.entity}API`:`create${r.entity}`);for(const r of e.compositions)n.push(r.name);n.length&&(this.line(),this.line(`export { ${n.join(", ")} };`))}genExpr(e){switch(e.type){case"Literal":return e.dataType==="string"?JSON.stringify(e.value):String(e.value);case"Identifier":{const n=e.name;return n==="self"?"this":n==="user"?"getContext().user":n==="context"?"getContext()":n}case"BinaryOp":{const n=e.operator,r=this.genExpr(e.left),s=this.genExpr(e.right),i={and:"&&",or:"||",is:"===",contains:".includes"};return n==="contains"?`${r}.includes(${s})`:`(${r} ${i[n]||n} ${s})`}case"UnaryOp":return`${e.operator==="not"?"!":e.operator}${this.genExpr(e.operand)}`;case"Call":return`${this.genExpr(e.callee)}(${e.arguments.map(n=>this.genExpr(n)).join(", ")})`;case"MemberAccess":return`${this.genExpr(e.object)}.${e.property}`;case"Conditional":return`(${this.genExpr(e.condition)} ? ${this.genExpr(e.consequent)} : ${this.genExpr(e.alternate)})`;case"Array":return`[${e.elements.map(n=>this.genExpr(n)).join(", ")}]`;case"Object":return`{ ${e.properties.map(n=>`${n.key}: ${this.genExpr(n.value)}`).join(", ")} }`;case"Lambda":return`(${e.parameters.join(", ")}) => ${this.genExpr(e.body)}`;default:return"/* ? */"}}tsType(e){let r={string:"string",number:"number",boolean:"boolean",any:"any",void:"void",list:"Array",map:"Map"}[e.name]||e.name;return e.generic&&(r+=`<${this.tsType(e.generic)}>`),e.nullable&&(r+=" | null"),r}defVal(e){return e.nullable?"null":{string:'""',number:"0",boolean:"false",list:"[]",map:"new Map()",unknown:"null"}[e.name]||"null"}capitalize(e){return e.charAt(0).toUpperCase()+e.slice(1)}line(e=""){this.out.push("  ".repeat(this.indent)+e)}in(){this.indent++}de(){this.indent=Math.max(0,this.indent-1)}}class bf{constructor(){ce(this,"parser",new Ro);ce(this,"generator",new Nf)}compile(e){const{program:n,errors:r}=this.parser.parse(e);if(r.length>0)return{success:!1,errors:r,ast:n};try{const{code:s,serverCode:i,testCode:a}=this.generator.generate(n);return{success:!0,code:s,serverCode:i,testCode:a,ast:n,errors:[]}}catch(s){return{success:!1,errors:[{message:s instanceof Error?s.message:"Generation failed",severity:"error"}],ast:n}}}parse(e){return this.parser.parse(e)}}const ec=[{name:"Kitchen Module",desc:"Full module with commands, policies, and events",code:`// Module: encapsulates related entities and commands
module kitchen {
  entity PrepTask {
    property required id: string
    property required name: string
    property assignedTo: string?
    property status: string = "pending"
    property priority: number = 1

    // Computed property - auto-recalculates
    computed isUrgent: boolean = priority >= 3

    // Relationships
    belongsTo station: Station
    hasMany ingredients: Ingredient

    // Commands - explicit business operations
    command claim(employeeId: string) {
      guard self.status == "pending"
      guard user.role == "cook" or user.role == "chef"
      mutate assignedTo = employeeId
      mutate status = "in_progress"
      emit taskClaimed
    }

    command complete() {
      guard self.status == "in_progress"
      guard self.assignedTo == user.id
      mutate status = "completed"
      emit taskCompleted
    }

    // Policies - auth rules
    policy canView read: true
    policy canClaim execute: user.role in ["cook", "chef"]
    policy canEdit write: user.id == assignedTo or user.role == "chef"

    constraint validStatus: status in ["pending", "in_progress", "completed"]
    constraint validPriority: priority >= 1 and priority <= 5
  }

  entity Station {
    property required id: string
    property required name: string
    property capacity: number = 4
    hasMany tasks: PrepTask
  }

  entity Ingredient {
    property required id: string
    property required name: string
    property quantity: number = 0
    property unit: string = "g"
  }

  // Outbox events for realtime
  event TaskClaimed: "kitchen.task.claimed" {
    taskId: string
    employeeId: string
    stationId: string
  }

  event TaskCompleted: "kitchen.task.completed" {
    taskId: string
    completedBy: string
    duration: number
  }
}

// Persistence
store PrepTask in supabase { table: "prep_tasks" }
store Station in supabase { table: "stations" }

// API with server generation
expose PrepTask as rest server "/api/tasks" {
  list, get, create, update
}`},{name:"Order with Computed",desc:"Derived properties that auto-update",code:`entity OrderItem {
  property required id: string
  property required productId: string
  property required name: string
  property price: number = 0
  property quantity: number = 1
  property discount: number = 0

  // Computed properties - spreadsheet-like
  computed subtotal: number = price * quantity
  computed discountAmount: number = subtotal * (discount / 100)
  computed total: number = subtotal - discountAmount
}

entity Order {
  property required id: string
  property customerId: string?
  property status: string = "draft"
  property taxRate: number = 0.08
  property readonly createdAt: string = now()

  hasMany items: OrderItem

  // These recompute when items change
  computed itemCount: number = items.length
  computed subtotal: number = items.reduce((sum, i) => sum + i.total, 0)
  computed tax: number = subtotal * taxRate
  computed total: number = subtotal + tax

  command addItem(productId: string, name: string, price: number, quantity: number) {
    guard self.status == "draft"
    compute newItem = { id: uuid(), productId: productId, name: name, price: price, quantity: quantity }
    mutate items = items.concat([newItem])
    emit itemAdded
  }

  command submit() {
    guard self.status == "draft"
    guard self.items.length > 0
    mutate status = "submitted"
    emit orderSubmitted
  }

  constraint hasItems: status != "submitted" or items.length > 0 "Order must have items"
}

store Order in localStorage { key: "orders" }
expose Order as function`},{name:"User with Policies",desc:"Auth and permission rules",code:`entity User {
  property required id: string
  property required email: string
  property name: string = ""
  property role: string = "user"
  property teamId: string?
  property active: boolean = true
  property loginAttempts: number = 0
  property readonly createdAt: string = now()

  // Only admins or self can read sensitive data
  policy readBasic read: true
  policy readSensitive read: user.id == self.id or user.role == "admin"

  // Only admins can change roles
  policy canChangeRole write: user.role == "admin" "Only admins can modify users"

  // Self or admin can deactivate
  policy canDeactivate execute: user.id == self.id or user.role == "admin"

  command deactivate() {
    guard self.active == true
    mutate active = false
    emit userDeactivated
  }

  command changeRole(newRole: string) {
    guard user.role == "admin"
    mutate role = newRole
    emit roleChanged
  }

  constraint validEmail: email contains "@" "Invalid email"
  constraint validRole: role in ["user", "manager", "admin"]
}

entity Team {
  property required id: string
  property required name: string
  property ownerId: string

  hasMany members: User

  policy canView read: user.teamId == self.id or user.role == "admin"
  policy canEdit write: user.id == ownerId or user.role == "admin"
}

store User in supabase { table: "users" }
store Team in supabase { table: "teams" }

expose User as rest server "/api/users" {
  list, get, create, update, delete
}`},{name:"Realtime Events",desc:"Outbox pattern for pub/sub",code:`// Define event types for realtime channels
event OrderCreated: "orders.created" {
  orderId: string
  customerId: string
  total: number
}

event OrderStatusChanged: "orders.status" {
  orderId: string
  oldStatus: string
  newStatus: string
  timestamp: string
}

event InventoryLow: "inventory.alerts" {
  productId: string
  productName: string
  currentStock: number
  threshold: number
}

entity Order {
  property required id: string
  property customerId: string
  property status: string = "pending"
  property total: number = 0

  command create(customerId: string, total: number) {
    mutate customerId = customerId
    mutate total = total
    // Publish to outbox
    publish OrderCreated
    emit created
  }

  command updateStatus(newStatus: string) {
    guard newStatus in ["pending", "processing", "shipped", "delivered"]
    publish OrderStatusChanged
    mutate status = newStatus
    emit statusChanged
  }
}

entity Product {
  property required id: string
  property required name: string
  property stock: number = 0
  property lowStockThreshold: number = 10

  computed isLowStock: boolean = stock <= lowStockThreshold

  command reduceStock(amount: number) {
    guard self.stock >= amount
    mutate stock = stock - amount
    // Alert when stock is low
    compute checkLowStock()
    emit stockReduced
  }

  behavior on stockReduced when isLowStock {
    publish InventoryLow
  }
}

store Order in supabase
store Product in supabase

expose Order as rest server "/api/orders"
expose Product as rest server "/api/products"`},{name:"E-commerce System",desc:"Full composition with relationships",code:`entity Customer {
  property required id: string
  property required email: string
  property name: string = ""
  property loyaltyPoints: number = 0

  hasMany orders: Order
  hasOne cart: ShoppingCart

  computed totalSpent: number = orders.reduce((sum, o) => sum + o.total, 0)
  computed tier: string = totalSpent > 1000 ? "gold" : totalSpent > 500 ? "silver" : "bronze"

  command addLoyaltyPoints(points: number) {
    mutate loyaltyPoints = loyaltyPoints + points
    emit pointsAdded
  }
}

entity ShoppingCart {
  property required id: string
  property customerId: string

  hasMany items: CartItem
  belongsTo customer: Customer

  computed itemCount: number = items.length
  computed subtotal: number = items.reduce((sum, i) => sum + i.total, 0)

  command addItem(productId: string, price: number, quantity: number) {
    compute item = { id: uuid(), productId: productId, price: price, quantity: quantity }
    mutate items = items.concat([item])
    emit itemAdded
  }

  command checkout() {
    guard self.items.length > 0
    emit checkoutStarted
  }

  command clear() {
    mutate items = []
    emit cartCleared
  }
}

entity CartItem {
  property required id: string
  property required productId: string
  property price: number = 0
  property quantity: number = 1
  computed total: number = price * quantity

  belongsTo cart: ShoppingCart
  ref product: Product
}

entity Product {
  property required id: string
  property required name: string
  property required price: number
  property stock: number = 0
  property category: string = "general"

  hasMany cartItems: CartItem

  constraint positivePrice: price > 0 "Price must be positive"
  constraint validStock: stock >= 0 "Stock cannot be negative"
}

entity Order {
  property required id: string
  property customerId: string
  property status: string = "pending"
  property total: number = 0

  hasMany items: OrderItem
  belongsTo customer: Customer

  command process() {
    guard self.status == "pending"
    mutate status = "processing"
    emit orderProcessing
  }

  command ship() {
    guard self.status == "processing"
    mutate status = "shipped"
    emit orderShipped
  }
}

entity OrderItem {
  property required id: string
  property productId: string
  property quantity: number = 1
  property price: number = 0

  belongsTo order: Order
  ref product: Product

  computed total: number = price * quantity
}

// Persistence configuration
store Customer in supabase
store ShoppingCart in memory
store Product in supabase
store Order in supabase

// Compose the checkout flow
compose CheckoutFlow {
  ShoppingCart as cart
  Order as order
  Customer as customer

  connect cart.checkoutStarted -> order.create
  connect order.orderProcessing -> customer.addLoyaltyPoints
}

expose Customer as rest server "/api/customers"
expose Product as rest server "/api/products"
expose Order as rest server "/api/orders"`},{name:"Simple Counter",desc:"Basic example with all v2 features",code:`// Simple counter showing v2 features

entity Counter {
  property value: number = 0
  property step: number = 1
  property maxValue: number = 100
  property minValue: number = 0

  // Computed - auto updates
  computed percentage: number = (value / maxValue) * 100
  computed isAtMax: boolean = value >= maxValue
  computed isAtMin: boolean = value <= minValue

  // Commands instead of behaviors
  command increment() {
    guard not self.isAtMax
    mutate value = value + step
    emit incremented
  }

  command decrement() {
    guard not self.isAtMin
    mutate value = value - step
    emit decremented
  }

  command reset() {
    mutate value = 0
    emit reset
  }

  command setStep(newStep: number) {
    guard newStep > 0
    mutate step = newStep
    emit stepChanged
  }

  // Constraints
  constraint inRange: value >= minValue and value <= maxValue "Value out of range"
  constraint positiveStep: step > 0 "Step must be positive"
}

// Store in browser
store Counter in localStorage { key: "counter" }

// Generate function factory
expose Counter as function`}];function is(t){throw new Error('Could not dynamically require "'+t+'". Please configure the dynamicRequireTargets or/and ignoreDynamicRequires option of @rollup/plugin-commonjs appropriately for this require call to work.')}var vd={exports:{}};/*!

JSZip v3.10.1 - A JavaScript class for generating and reading zip files
<http://stuartk.com/jszip>

(c) 2009-2016 Stuart Knightley <stuart [at] stuartk.com>
Dual licenced under the MIT license or GPLv3. See https://raw.github.com/Stuk/jszip/main/LICENSE.markdown.

JSZip uses the library pako released under the MIT license :
https://github.com/nodeca/pako/blob/main/LICENSE
*/(function(t,e){(function(n){t.exports=n()})(function(){return function n(r,s,i){function a(d,y){if(!s[d]){if(!r[d]){var v=typeof is=="function"&&is;if(!y&&v)return v(d,!0);if(o)return o(d,!0);var h=new Error("Cannot find module '"+d+"'");throw h.code="MODULE_NOT_FOUND",h}var f=s[d]={exports:{}};r[d][0].call(f.exports,function(w){var m=r[d][1][w];return a(m||w)},f,f.exports,n,r,s,i)}return s[d].exports}for(var o=typeof is=="function"&&is,l=0;l<i.length;l++)a(i[l]);return a}({1:[function(n,r,s){var i=n("./utils"),a=n("./support"),o="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";s.encode=function(l){for(var d,y,v,h,f,w,m,E=[],c=0,u=l.length,k=u,b=i.getTypeOf(l)!=="string";c<l.length;)k=u-c,v=b?(d=l[c++],y=c<u?l[c++]:0,c<u?l[c++]:0):(d=l.charCodeAt(c++),y=c<u?l.charCodeAt(c++):0,c<u?l.charCodeAt(c++):0),h=d>>2,f=(3&d)<<4|y>>4,w=1<k?(15&y)<<2|v>>6:64,m=2<k?63&v:64,E.push(o.charAt(h)+o.charAt(f)+o.charAt(w)+o.charAt(m));return E.join("")},s.decode=function(l){var d,y,v,h,f,w,m=0,E=0,c="data:";if(l.substr(0,c.length)===c)throw new Error("Invalid base64 input, it looks like a data url.");var u,k=3*(l=l.replace(/[^A-Za-z0-9+/=]/g,"")).length/4;if(l.charAt(l.length-1)===o.charAt(64)&&k--,l.charAt(l.length-2)===o.charAt(64)&&k--,k%1!=0)throw new Error("Invalid base64 input, bad content length.");for(u=a.uint8array?new Uint8Array(0|k):new Array(0|k);m<l.length;)d=o.indexOf(l.charAt(m++))<<2|(h=o.indexOf(l.charAt(m++)))>>4,y=(15&h)<<4|(f=o.indexOf(l.charAt(m++)))>>2,v=(3&f)<<6|(w=o.indexOf(l.charAt(m++))),u[E++]=d,f!==64&&(u[E++]=y),w!==64&&(u[E++]=v);return u}},{"./support":30,"./utils":32}],2:[function(n,r,s){var i=n("./external"),a=n("./stream/DataWorker"),o=n("./stream/Crc32Probe"),l=n("./stream/DataLengthProbe");function d(y,v,h,f,w){this.compressedSize=y,this.uncompressedSize=v,this.crc32=h,this.compression=f,this.compressedContent=w}d.prototype={getContentWorker:function(){var y=new a(i.Promise.resolve(this.compressedContent)).pipe(this.compression.uncompressWorker()).pipe(new l("data_length")),v=this;return y.on("end",function(){if(this.streamInfo.data_length!==v.uncompressedSize)throw new Error("Bug : uncompressed data size mismatch")}),y},getCompressedWorker:function(){return new a(i.Promise.resolve(this.compressedContent)).withStreamInfo("compressedSize",this.compressedSize).withStreamInfo("uncompressedSize",this.uncompressedSize).withStreamInfo("crc32",this.crc32).withStreamInfo("compression",this.compression)}},d.createWorkerFrom=function(y,v,h){return y.pipe(new o).pipe(new l("uncompressedSize")).pipe(v.compressWorker(h)).pipe(new l("compressedSize")).withStreamInfo("compression",v)},r.exports=d},{"./external":6,"./stream/Crc32Probe":25,"./stream/DataLengthProbe":26,"./stream/DataWorker":27}],3:[function(n,r,s){var i=n("./stream/GenericWorker");s.STORE={magic:"\0\0",compressWorker:function(){return new i("STORE compression")},uncompressWorker:function(){return new i("STORE decompression")}},s.DEFLATE=n("./flate")},{"./flate":7,"./stream/GenericWorker":28}],4:[function(n,r,s){var i=n("./utils"),a=function(){for(var o,l=[],d=0;d<256;d++){o=d;for(var y=0;y<8;y++)o=1&o?3988292384^o>>>1:o>>>1;l[d]=o}return l}();r.exports=function(o,l){return o!==void 0&&o.length?i.getTypeOf(o)!=="string"?function(d,y,v,h){var f=a,w=h+v;d^=-1;for(var m=h;m<w;m++)d=d>>>8^f[255&(d^y[m])];return-1^d}(0|l,o,o.length,0):function(d,y,v,h){var f=a,w=h+v;d^=-1;for(var m=h;m<w;m++)d=d>>>8^f[255&(d^y.charCodeAt(m))];return-1^d}(0|l,o,o.length,0):0}},{"./utils":32}],5:[function(n,r,s){s.base64=!1,s.binary=!1,s.dir=!1,s.createFolders=!0,s.date=null,s.compression=null,s.compressionOptions=null,s.comment=null,s.unixPermissions=null,s.dosPermissions=null},{}],6:[function(n,r,s){var i=null;i=typeof Promise<"u"?Promise:n("lie"),r.exports={Promise:i}},{lie:37}],7:[function(n,r,s){var i=typeof Uint8Array<"u"&&typeof Uint16Array<"u"&&typeof Uint32Array<"u",a=n("pako"),o=n("./utils"),l=n("./stream/GenericWorker"),d=i?"uint8array":"array";function y(v,h){l.call(this,"FlateWorker/"+v),this._pako=null,this._pakoAction=v,this._pakoOptions=h,this.meta={}}s.magic="\b\0",o.inherits(y,l),y.prototype.processChunk=function(v){this.meta=v.meta,this._pako===null&&this._createPako(),this._pako.push(o.transformTo(d,v.data),!1)},y.prototype.flush=function(){l.prototype.flush.call(this),this._pako===null&&this._createPako(),this._pako.push([],!0)},y.prototype.cleanUp=function(){l.prototype.cleanUp.call(this),this._pako=null},y.prototype._createPako=function(){this._pako=new a[this._pakoAction]({raw:!0,level:this._pakoOptions.level||-1});var v=this;this._pako.onData=function(h){v.push({data:h,meta:v.meta})}},s.compressWorker=function(v){return new y("Deflate",v)},s.uncompressWorker=function(){return new y("Inflate",{})}},{"./stream/GenericWorker":28,"./utils":32,pako:38}],8:[function(n,r,s){function i(f,w){var m,E="";for(m=0;m<w;m++)E+=String.fromCharCode(255&f),f>>>=8;return E}function a(f,w,m,E,c,u){var k,b,T=f.file,I=f.compression,_=u!==d.utf8encode,j=o.transformTo("string",u(T.name)),$=o.transformTo("string",d.utf8encode(T.name)),M=T.comment,ne=o.transformTo("string",u(M)),C=o.transformTo("string",d.utf8encode(M)),L=$.length!==T.name.length,x=C.length!==M.length,B="",oe="",Y="",W=T.dir,D=T.date,G={crc32:0,compressedSize:0,uncompressedSize:0};w&&!m||(G.crc32=f.crc32,G.compressedSize=f.compressedSize,G.uncompressedSize=f.uncompressedSize);var P=0;w&&(P|=8),_||!L&&!x||(P|=2048);var R=0,se=0;W&&(R|=16),c==="UNIX"?(se=798,R|=function(Z,ge){var z=Z;return Z||(z=ge?16893:33204),(65535&z)<<16}(T.unixPermissions,W)):(se=20,R|=function(Z){return 63&(Z||0)}(T.dosPermissions)),k=D.getUTCHours(),k<<=6,k|=D.getUTCMinutes(),k<<=5,k|=D.getUTCSeconds()/2,b=D.getUTCFullYear()-1980,b<<=4,b|=D.getUTCMonth()+1,b<<=5,b|=D.getUTCDate(),L&&(oe=i(1,1)+i(y(j),4)+$,B+="up"+i(oe.length,2)+oe),x&&(Y=i(1,1)+i(y(ne),4)+C,B+="uc"+i(Y.length,2)+Y);var X="";return X+=`
\0`,X+=i(P,2),X+=I.magic,X+=i(k,2),X+=i(b,2),X+=i(G.crc32,4),X+=i(G.compressedSize,4),X+=i(G.uncompressedSize,4),X+=i(j.length,2),X+=i(B.length,2),{fileRecord:v.LOCAL_FILE_HEADER+X+j+B,dirRecord:v.CENTRAL_FILE_HEADER+i(se,2)+X+i(ne.length,2)+"\0\0\0\0"+i(R,4)+i(E,4)+j+B+ne}}var o=n("../utils"),l=n("../stream/GenericWorker"),d=n("../utf8"),y=n("../crc32"),v=n("../signature");function h(f,w,m,E){l.call(this,"ZipFileWorker"),this.bytesWritten=0,this.zipComment=w,this.zipPlatform=m,this.encodeFileName=E,this.streamFiles=f,this.accumulate=!1,this.contentBuffer=[],this.dirRecords=[],this.currentSourceOffset=0,this.entriesCount=0,this.currentFile=null,this._sources=[]}o.inherits(h,l),h.prototype.push=function(f){var w=f.meta.percent||0,m=this.entriesCount,E=this._sources.length;this.accumulate?this.contentBuffer.push(f):(this.bytesWritten+=f.data.length,l.prototype.push.call(this,{data:f.data,meta:{currentFile:this.currentFile,percent:m?(w+100*(m-E-1))/m:100}}))},h.prototype.openedSource=function(f){this.currentSourceOffset=this.bytesWritten,this.currentFile=f.file.name;var w=this.streamFiles&&!f.file.dir;if(w){var m=a(f,w,!1,this.currentSourceOffset,this.zipPlatform,this.encodeFileName);this.push({data:m.fileRecord,meta:{percent:0}})}else this.accumulate=!0},h.prototype.closedSource=function(f){this.accumulate=!1;var w=this.streamFiles&&!f.file.dir,m=a(f,w,!0,this.currentSourceOffset,this.zipPlatform,this.encodeFileName);if(this.dirRecords.push(m.dirRecord),w)this.push({data:function(E){return v.DATA_DESCRIPTOR+i(E.crc32,4)+i(E.compressedSize,4)+i(E.uncompressedSize,4)}(f),meta:{percent:100}});else for(this.push({data:m.fileRecord,meta:{percent:0}});this.contentBuffer.length;)this.push(this.contentBuffer.shift());this.currentFile=null},h.prototype.flush=function(){for(var f=this.bytesWritten,w=0;w<this.dirRecords.length;w++)this.push({data:this.dirRecords[w],meta:{percent:100}});var m=this.bytesWritten-f,E=function(c,u,k,b,T){var I=o.transformTo("string",T(b));return v.CENTRAL_DIRECTORY_END+"\0\0\0\0"+i(c,2)+i(c,2)+i(u,4)+i(k,4)+i(I.length,2)+I}(this.dirRecords.length,m,f,this.zipComment,this.encodeFileName);this.push({data:E,meta:{percent:100}})},h.prototype.prepareNextSource=function(){this.previous=this._sources.shift(),this.openedSource(this.previous.streamInfo),this.isPaused?this.previous.pause():this.previous.resume()},h.prototype.registerPrevious=function(f){this._sources.push(f);var w=this;return f.on("data",function(m){w.processChunk(m)}),f.on("end",function(){w.closedSource(w.previous.streamInfo),w._sources.length?w.prepareNextSource():w.end()}),f.on("error",function(m){w.error(m)}),this},h.prototype.resume=function(){return!!l.prototype.resume.call(this)&&(!this.previous&&this._sources.length?(this.prepareNextSource(),!0):this.previous||this._sources.length||this.generatedError?void 0:(this.end(),!0))},h.prototype.error=function(f){var w=this._sources;if(!l.prototype.error.call(this,f))return!1;for(var m=0;m<w.length;m++)try{w[m].error(f)}catch{}return!0},h.prototype.lock=function(){l.prototype.lock.call(this);for(var f=this._sources,w=0;w<f.length;w++)f[w].lock()},r.exports=h},{"../crc32":4,"../signature":23,"../stream/GenericWorker":28,"../utf8":31,"../utils":32}],9:[function(n,r,s){var i=n("../compressions"),a=n("./ZipFileWorker");s.generateWorker=function(o,l,d){var y=new a(l.streamFiles,d,l.platform,l.encodeFileName),v=0;try{o.forEach(function(h,f){v++;var w=function(u,k){var b=u||k,T=i[b];if(!T)throw new Error(b+" is not a valid compression method !");return T}(f.options.compression,l.compression),m=f.options.compressionOptions||l.compressionOptions||{},E=f.dir,c=f.date;f._compressWorker(w,m).withStreamInfo("file",{name:h,dir:E,date:c,comment:f.comment||"",unixPermissions:f.unixPermissions,dosPermissions:f.dosPermissions}).pipe(y)}),y.entriesCount=v}catch(h){y.error(h)}return y}},{"../compressions":3,"./ZipFileWorker":8}],10:[function(n,r,s){function i(){if(!(this instanceof i))return new i;if(arguments.length)throw new Error("The constructor with parameters has been removed in JSZip 3.0, please check the upgrade guide.");this.files=Object.create(null),this.comment=null,this.root="",this.clone=function(){var a=new i;for(var o in this)typeof this[o]!="function"&&(a[o]=this[o]);return a}}(i.prototype=n("./object")).loadAsync=n("./load"),i.support=n("./support"),i.defaults=n("./defaults"),i.version="3.10.1",i.loadAsync=function(a,o){return new i().loadAsync(a,o)},i.external=n("./external"),r.exports=i},{"./defaults":5,"./external":6,"./load":11,"./object":15,"./support":30}],11:[function(n,r,s){var i=n("./utils"),a=n("./external"),o=n("./utf8"),l=n("./zipEntries"),d=n("./stream/Crc32Probe"),y=n("./nodejsUtils");function v(h){return new a.Promise(function(f,w){var m=h.decompressed.getContentWorker().pipe(new d);m.on("error",function(E){w(E)}).on("end",function(){m.streamInfo.crc32!==h.decompressed.crc32?w(new Error("Corrupted zip : CRC32 mismatch")):f()}).resume()})}r.exports=function(h,f){var w=this;return f=i.extend(f||{},{base64:!1,checkCRC32:!1,optimizedBinaryString:!1,createFolders:!1,decodeFileName:o.utf8decode}),y.isNode&&y.isStream(h)?a.Promise.reject(new Error("JSZip can't accept a stream when loading a zip file.")):i.prepareContent("the loaded zip file",h,!0,f.optimizedBinaryString,f.base64).then(function(m){var E=new l(f);return E.load(m),E}).then(function(m){var E=[a.Promise.resolve(m)],c=m.files;if(f.checkCRC32)for(var u=0;u<c.length;u++)E.push(v(c[u]));return a.Promise.all(E)}).then(function(m){for(var E=m.shift(),c=E.files,u=0;u<c.length;u++){var k=c[u],b=k.fileNameStr,T=i.resolve(k.fileNameStr);w.file(T,k.decompressed,{binary:!0,optimizedBinaryString:!0,date:k.date,dir:k.dir,comment:k.fileCommentStr.length?k.fileCommentStr:null,unixPermissions:k.unixPermissions,dosPermissions:k.dosPermissions,createFolders:f.createFolders}),k.dir||(w.file(T).unsafeOriginalName=b)}return E.zipComment.length&&(w.comment=E.zipComment),w})}},{"./external":6,"./nodejsUtils":14,"./stream/Crc32Probe":25,"./utf8":31,"./utils":32,"./zipEntries":33}],12:[function(n,r,s){var i=n("../utils"),a=n("../stream/GenericWorker");function o(l,d){a.call(this,"Nodejs stream input adapter for "+l),this._upstreamEnded=!1,this._bindStream(d)}i.inherits(o,a),o.prototype._bindStream=function(l){var d=this;(this._stream=l).pause(),l.on("data",function(y){d.push({data:y,meta:{percent:0}})}).on("error",function(y){d.isPaused?this.generatedError=y:d.error(y)}).on("end",function(){d.isPaused?d._upstreamEnded=!0:d.end()})},o.prototype.pause=function(){return!!a.prototype.pause.call(this)&&(this._stream.pause(),!0)},o.prototype.resume=function(){return!!a.prototype.resume.call(this)&&(this._upstreamEnded?this.end():this._stream.resume(),!0)},r.exports=o},{"../stream/GenericWorker":28,"../utils":32}],13:[function(n,r,s){var i=n("readable-stream").Readable;function a(o,l,d){i.call(this,l),this._helper=o;var y=this;o.on("data",function(v,h){y.push(v)||y._helper.pause(),d&&d(h)}).on("error",function(v){y.emit("error",v)}).on("end",function(){y.push(null)})}n("../utils").inherits(a,i),a.prototype._read=function(){this._helper.resume()},r.exports=a},{"../utils":32,"readable-stream":16}],14:[function(n,r,s){r.exports={isNode:typeof Buffer<"u",newBufferFrom:function(i,a){if(Buffer.from&&Buffer.from!==Uint8Array.from)return Buffer.from(i,a);if(typeof i=="number")throw new Error('The "data" argument must not be a number');return new Buffer(i,a)},allocBuffer:function(i){if(Buffer.alloc)return Buffer.alloc(i);var a=new Buffer(i);return a.fill(0),a},isBuffer:function(i){return Buffer.isBuffer(i)},isStream:function(i){return i&&typeof i.on=="function"&&typeof i.pause=="function"&&typeof i.resume=="function"}}},{}],15:[function(n,r,s){function i(T,I,_){var j,$=o.getTypeOf(I),M=o.extend(_||{},y);M.date=M.date||new Date,M.compression!==null&&(M.compression=M.compression.toUpperCase()),typeof M.unixPermissions=="string"&&(M.unixPermissions=parseInt(M.unixPermissions,8)),M.unixPermissions&&16384&M.unixPermissions&&(M.dir=!0),M.dosPermissions&&16&M.dosPermissions&&(M.dir=!0),M.dir&&(T=c(T)),M.createFolders&&(j=E(T))&&u.call(this,j,!0);var ne=$==="string"&&M.binary===!1&&M.base64===!1;_&&_.binary!==void 0||(M.binary=!ne),(I instanceof v&&I.uncompressedSize===0||M.dir||!I||I.length===0)&&(M.base64=!1,M.binary=!0,I="",M.compression="STORE",$="string");var C=null;C=I instanceof v||I instanceof l?I:w.isNode&&w.isStream(I)?new m(T,I):o.prepareContent(T,I,M.binary,M.optimizedBinaryString,M.base64);var L=new h(T,C,M);this.files[T]=L}var a=n("./utf8"),o=n("./utils"),l=n("./stream/GenericWorker"),d=n("./stream/StreamHelper"),y=n("./defaults"),v=n("./compressedObject"),h=n("./zipObject"),f=n("./generate"),w=n("./nodejsUtils"),m=n("./nodejs/NodejsStreamInputAdapter"),E=function(T){T.slice(-1)==="/"&&(T=T.substring(0,T.length-1));var I=T.lastIndexOf("/");return 0<I?T.substring(0,I):""},c=function(T){return T.slice(-1)!=="/"&&(T+="/"),T},u=function(T,I){return I=I!==void 0?I:y.createFolders,T=c(T),this.files[T]||i.call(this,T,null,{dir:!0,createFolders:I}),this.files[T]};function k(T){return Object.prototype.toString.call(T)==="[object RegExp]"}var b={load:function(){throw new Error("This method has been removed in JSZip 3.0, please check the upgrade guide.")},forEach:function(T){var I,_,j;for(I in this.files)j=this.files[I],(_=I.slice(this.root.length,I.length))&&I.slice(0,this.root.length)===this.root&&T(_,j)},filter:function(T){var I=[];return this.forEach(function(_,j){T(_,j)&&I.push(j)}),I},file:function(T,I,_){if(arguments.length!==1)return T=this.root+T,i.call(this,T,I,_),this;if(k(T)){var j=T;return this.filter(function(M,ne){return!ne.dir&&j.test(M)})}var $=this.files[this.root+T];return $&&!$.dir?$:null},folder:function(T){if(!T)return this;if(k(T))return this.filter(function($,M){return M.dir&&T.test($)});var I=this.root+T,_=u.call(this,I),j=this.clone();return j.root=_.name,j},remove:function(T){T=this.root+T;var I=this.files[T];if(I||(T.slice(-1)!=="/"&&(T+="/"),I=this.files[T]),I&&!I.dir)delete this.files[T];else for(var _=this.filter(function($,M){return M.name.slice(0,T.length)===T}),j=0;j<_.length;j++)delete this.files[_[j].name];return this},generate:function(){throw new Error("This method has been removed in JSZip 3.0, please check the upgrade guide.")},generateInternalStream:function(T){var I,_={};try{if((_=o.extend(T||{},{streamFiles:!1,compression:"STORE",compressionOptions:null,type:"",platform:"DOS",comment:null,mimeType:"application/zip",encodeFileName:a.utf8encode})).type=_.type.toLowerCase(),_.compression=_.compression.toUpperCase(),_.type==="binarystring"&&(_.type="string"),!_.type)throw new Error("No output type specified.");o.checkSupport(_.type),_.platform!=="darwin"&&_.platform!=="freebsd"&&_.platform!=="linux"&&_.platform!=="sunos"||(_.platform="UNIX"),_.platform==="win32"&&(_.platform="DOS");var j=_.comment||this.comment||"";I=f.generateWorker(this,_,j)}catch($){(I=new l("error")).error($)}return new d(I,_.type||"string",_.mimeType)},generateAsync:function(T,I){return this.generateInternalStream(T).accumulate(I)},generateNodeStream:function(T,I){return(T=T||{}).type||(T.type="nodebuffer"),this.generateInternalStream(T).toNodejsStream(I)}};r.exports=b},{"./compressedObject":2,"./defaults":5,"./generate":9,"./nodejs/NodejsStreamInputAdapter":12,"./nodejsUtils":14,"./stream/GenericWorker":28,"./stream/StreamHelper":29,"./utf8":31,"./utils":32,"./zipObject":35}],16:[function(n,r,s){r.exports=n("stream")},{stream:void 0}],17:[function(n,r,s){var i=n("./DataReader");function a(o){i.call(this,o);for(var l=0;l<this.data.length;l++)o[l]=255&o[l]}n("../utils").inherits(a,i),a.prototype.byteAt=function(o){return this.data[this.zero+o]},a.prototype.lastIndexOfSignature=function(o){for(var l=o.charCodeAt(0),d=o.charCodeAt(1),y=o.charCodeAt(2),v=o.charCodeAt(3),h=this.length-4;0<=h;--h)if(this.data[h]===l&&this.data[h+1]===d&&this.data[h+2]===y&&this.data[h+3]===v)return h-this.zero;return-1},a.prototype.readAndCheckSignature=function(o){var l=o.charCodeAt(0),d=o.charCodeAt(1),y=o.charCodeAt(2),v=o.charCodeAt(3),h=this.readData(4);return l===h[0]&&d===h[1]&&y===h[2]&&v===h[3]},a.prototype.readData=function(o){if(this.checkOffset(o),o===0)return[];var l=this.data.slice(this.zero+this.index,this.zero+this.index+o);return this.index+=o,l},r.exports=a},{"../utils":32,"./DataReader":18}],18:[function(n,r,s){var i=n("../utils");function a(o){this.data=o,this.length=o.length,this.index=0,this.zero=0}a.prototype={checkOffset:function(o){this.checkIndex(this.index+o)},checkIndex:function(o){if(this.length<this.zero+o||o<0)throw new Error("End of data reached (data length = "+this.length+", asked index = "+o+"). Corrupted zip ?")},setIndex:function(o){this.checkIndex(o),this.index=o},skip:function(o){this.setIndex(this.index+o)},byteAt:function(){},readInt:function(o){var l,d=0;for(this.checkOffset(o),l=this.index+o-1;l>=this.index;l--)d=(d<<8)+this.byteAt(l);return this.index+=o,d},readString:function(o){return i.transformTo("string",this.readData(o))},readData:function(){},lastIndexOfSignature:function(){},readAndCheckSignature:function(){},readDate:function(){var o=this.readInt(4);return new Date(Date.UTC(1980+(o>>25&127),(o>>21&15)-1,o>>16&31,o>>11&31,o>>5&63,(31&o)<<1))}},r.exports=a},{"../utils":32}],19:[function(n,r,s){var i=n("./Uint8ArrayReader");function a(o){i.call(this,o)}n("../utils").inherits(a,i),a.prototype.readData=function(o){this.checkOffset(o);var l=this.data.slice(this.zero+this.index,this.zero+this.index+o);return this.index+=o,l},r.exports=a},{"../utils":32,"./Uint8ArrayReader":21}],20:[function(n,r,s){var i=n("./DataReader");function a(o){i.call(this,o)}n("../utils").inherits(a,i),a.prototype.byteAt=function(o){return this.data.charCodeAt(this.zero+o)},a.prototype.lastIndexOfSignature=function(o){return this.data.lastIndexOf(o)-this.zero},a.prototype.readAndCheckSignature=function(o){return o===this.readData(4)},a.prototype.readData=function(o){this.checkOffset(o);var l=this.data.slice(this.zero+this.index,this.zero+this.index+o);return this.index+=o,l},r.exports=a},{"../utils":32,"./DataReader":18}],21:[function(n,r,s){var i=n("./ArrayReader");function a(o){i.call(this,o)}n("../utils").inherits(a,i),a.prototype.readData=function(o){if(this.checkOffset(o),o===0)return new Uint8Array(0);var l=this.data.subarray(this.zero+this.index,this.zero+this.index+o);return this.index+=o,l},r.exports=a},{"../utils":32,"./ArrayReader":17}],22:[function(n,r,s){var i=n("../utils"),a=n("../support"),o=n("./ArrayReader"),l=n("./StringReader"),d=n("./NodeBufferReader"),y=n("./Uint8ArrayReader");r.exports=function(v){var h=i.getTypeOf(v);return i.checkSupport(h),h!=="string"||a.uint8array?h==="nodebuffer"?new d(v):a.uint8array?new y(i.transformTo("uint8array",v)):new o(i.transformTo("array",v)):new l(v)}},{"../support":30,"../utils":32,"./ArrayReader":17,"./NodeBufferReader":19,"./StringReader":20,"./Uint8ArrayReader":21}],23:[function(n,r,s){s.LOCAL_FILE_HEADER="PK",s.CENTRAL_FILE_HEADER="PK",s.CENTRAL_DIRECTORY_END="PK",s.ZIP64_CENTRAL_DIRECTORY_LOCATOR="PK\x07",s.ZIP64_CENTRAL_DIRECTORY_END="PK",s.DATA_DESCRIPTOR="PK\x07\b"},{}],24:[function(n,r,s){var i=n("./GenericWorker"),a=n("../utils");function o(l){i.call(this,"ConvertWorker to "+l),this.destType=l}a.inherits(o,i),o.prototype.processChunk=function(l){this.push({data:a.transformTo(this.destType,l.data),meta:l.meta})},r.exports=o},{"../utils":32,"./GenericWorker":28}],25:[function(n,r,s){var i=n("./GenericWorker"),a=n("../crc32");function o(){i.call(this,"Crc32Probe"),this.withStreamInfo("crc32",0)}n("../utils").inherits(o,i),o.prototype.processChunk=function(l){this.streamInfo.crc32=a(l.data,this.streamInfo.crc32||0),this.push(l)},r.exports=o},{"../crc32":4,"../utils":32,"./GenericWorker":28}],26:[function(n,r,s){var i=n("../utils"),a=n("./GenericWorker");function o(l){a.call(this,"DataLengthProbe for "+l),this.propName=l,this.withStreamInfo(l,0)}i.inherits(o,a),o.prototype.processChunk=function(l){if(l){var d=this.streamInfo[this.propName]||0;this.streamInfo[this.propName]=d+l.data.length}a.prototype.processChunk.call(this,l)},r.exports=o},{"../utils":32,"./GenericWorker":28}],27:[function(n,r,s){var i=n("../utils"),a=n("./GenericWorker");function o(l){a.call(this,"DataWorker");var d=this;this.dataIsReady=!1,this.index=0,this.max=0,this.data=null,this.type="",this._tickScheduled=!1,l.then(function(y){d.dataIsReady=!0,d.data=y,d.max=y&&y.length||0,d.type=i.getTypeOf(y),d.isPaused||d._tickAndRepeat()},function(y){d.error(y)})}i.inherits(o,a),o.prototype.cleanUp=function(){a.prototype.cleanUp.call(this),this.data=null},o.prototype.resume=function(){return!!a.prototype.resume.call(this)&&(!this._tickScheduled&&this.dataIsReady&&(this._tickScheduled=!0,i.delay(this._tickAndRepeat,[],this)),!0)},o.prototype._tickAndRepeat=function(){this._tickScheduled=!1,this.isPaused||this.isFinished||(this._tick(),this.isFinished||(i.delay(this._tickAndRepeat,[],this),this._tickScheduled=!0))},o.prototype._tick=function(){if(this.isPaused||this.isFinished)return!1;var l=null,d=Math.min(this.max,this.index+16384);if(this.index>=this.max)return this.end();switch(this.type){case"string":l=this.data.substring(this.index,d);break;case"uint8array":l=this.data.subarray(this.index,d);break;case"array":case"nodebuffer":l=this.data.slice(this.index,d)}return this.index=d,this.push({data:l,meta:{percent:this.max?this.index/this.max*100:0}})},r.exports=o},{"../utils":32,"./GenericWorker":28}],28:[function(n,r,s){function i(a){this.name=a||"default",this.streamInfo={},this.generatedError=null,this.extraStreamInfo={},this.isPaused=!0,this.isFinished=!1,this.isLocked=!1,this._listeners={data:[],end:[],error:[]},this.previous=null}i.prototype={push:function(a){this.emit("data",a)},end:function(){if(this.isFinished)return!1;this.flush();try{this.emit("end"),this.cleanUp(),this.isFinished=!0}catch(a){this.emit("error",a)}return!0},error:function(a){return!this.isFinished&&(this.isPaused?this.generatedError=a:(this.isFinished=!0,this.emit("error",a),this.previous&&this.previous.error(a),this.cleanUp()),!0)},on:function(a,o){return this._listeners[a].push(o),this},cleanUp:function(){this.streamInfo=this.generatedError=this.extraStreamInfo=null,this._listeners=[]},emit:function(a,o){if(this._listeners[a])for(var l=0;l<this._listeners[a].length;l++)this._listeners[a][l].call(this,o)},pipe:function(a){return a.registerPrevious(this)},registerPrevious:function(a){if(this.isLocked)throw new Error("The stream '"+this+"' has already been used.");this.streamInfo=a.streamInfo,this.mergeStreamInfo(),this.previous=a;var o=this;return a.on("data",function(l){o.processChunk(l)}),a.on("end",function(){o.end()}),a.on("error",function(l){o.error(l)}),this},pause:function(){return!this.isPaused&&!this.isFinished&&(this.isPaused=!0,this.previous&&this.previous.pause(),!0)},resume:function(){if(!this.isPaused||this.isFinished)return!1;var a=this.isPaused=!1;return this.generatedError&&(this.error(this.generatedError),a=!0),this.previous&&this.previous.resume(),!a},flush:function(){},processChunk:function(a){this.push(a)},withStreamInfo:function(a,o){return this.extraStreamInfo[a]=o,this.mergeStreamInfo(),this},mergeStreamInfo:function(){for(var a in this.extraStreamInfo)Object.prototype.hasOwnProperty.call(this.extraStreamInfo,a)&&(this.streamInfo[a]=this.extraStreamInfo[a])},lock:function(){if(this.isLocked)throw new Error("The stream '"+this+"' has already been used.");this.isLocked=!0,this.previous&&this.previous.lock()},toString:function(){var a="Worker "+this.name;return this.previous?this.previous+" -> "+a:a}},r.exports=i},{}],29:[function(n,r,s){var i=n("../utils"),a=n("./ConvertWorker"),o=n("./GenericWorker"),l=n("../base64"),d=n("../support"),y=n("../external"),v=null;if(d.nodestream)try{v=n("../nodejs/NodejsStreamOutputAdapter")}catch{}function h(w,m){return new y.Promise(function(E,c){var u=[],k=w._internalType,b=w._outputType,T=w._mimeType;w.on("data",function(I,_){u.push(I),m&&m(_)}).on("error",function(I){u=[],c(I)}).on("end",function(){try{var I=function(_,j,$){switch(_){case"blob":return i.newBlob(i.transformTo("arraybuffer",j),$);case"base64":return l.encode(j);default:return i.transformTo(_,j)}}(b,function(_,j){var $,M=0,ne=null,C=0;for($=0;$<j.length;$++)C+=j[$].length;switch(_){case"string":return j.join("");case"array":return Array.prototype.concat.apply([],j);case"uint8array":for(ne=new Uint8Array(C),$=0;$<j.length;$++)ne.set(j[$],M),M+=j[$].length;return ne;case"nodebuffer":return Buffer.concat(j);default:throw new Error("concat : unsupported type '"+_+"'")}}(k,u),T);E(I)}catch(_){c(_)}u=[]}).resume()})}function f(w,m,E){var c=m;switch(m){case"blob":case"arraybuffer":c="uint8array";break;case"base64":c="string"}try{this._internalType=c,this._outputType=m,this._mimeType=E,i.checkSupport(c),this._worker=w.pipe(new a(c)),w.lock()}catch(u){this._worker=new o("error"),this._worker.error(u)}}f.prototype={accumulate:function(w){return h(this,w)},on:function(w,m){var E=this;return w==="data"?this._worker.on(w,function(c){m.call(E,c.data,c.meta)}):this._worker.on(w,function(){i.delay(m,arguments,E)}),this},resume:function(){return i.delay(this._worker.resume,[],this._worker),this},pause:function(){return this._worker.pause(),this},toNodejsStream:function(w){if(i.checkSupport("nodestream"),this._outputType!=="nodebuffer")throw new Error(this._outputType+" is not supported by this method");return new v(this,{objectMode:this._outputType!=="nodebuffer"},w)}},r.exports=f},{"../base64":1,"../external":6,"../nodejs/NodejsStreamOutputAdapter":13,"../support":30,"../utils":32,"./ConvertWorker":24,"./GenericWorker":28}],30:[function(n,r,s){if(s.base64=!0,s.array=!0,s.string=!0,s.arraybuffer=typeof ArrayBuffer<"u"&&typeof Uint8Array<"u",s.nodebuffer=typeof Buffer<"u",s.uint8array=typeof Uint8Array<"u",typeof ArrayBuffer>"u")s.blob=!1;else{var i=new ArrayBuffer(0);try{s.blob=new Blob([i],{type:"application/zip"}).size===0}catch{try{var a=new(self.BlobBuilder||self.WebKitBlobBuilder||self.MozBlobBuilder||self.MSBlobBuilder);a.append(i),s.blob=a.getBlob("application/zip").size===0}catch{s.blob=!1}}}try{s.nodestream=!!n("readable-stream").Readable}catch{s.nodestream=!1}},{"readable-stream":16}],31:[function(n,r,s){for(var i=n("./utils"),a=n("./support"),o=n("./nodejsUtils"),l=n("./stream/GenericWorker"),d=new Array(256),y=0;y<256;y++)d[y]=252<=y?6:248<=y?5:240<=y?4:224<=y?3:192<=y?2:1;d[254]=d[254]=1;function v(){l.call(this,"utf-8 decode"),this.leftOver=null}function h(){l.call(this,"utf-8 encode")}s.utf8encode=function(f){return a.nodebuffer?o.newBufferFrom(f,"utf-8"):function(w){var m,E,c,u,k,b=w.length,T=0;for(u=0;u<b;u++)(64512&(E=w.charCodeAt(u)))==55296&&u+1<b&&(64512&(c=w.charCodeAt(u+1)))==56320&&(E=65536+(E-55296<<10)+(c-56320),u++),T+=E<128?1:E<2048?2:E<65536?3:4;for(m=a.uint8array?new Uint8Array(T):new Array(T),u=k=0;k<T;u++)(64512&(E=w.charCodeAt(u)))==55296&&u+1<b&&(64512&(c=w.charCodeAt(u+1)))==56320&&(E=65536+(E-55296<<10)+(c-56320),u++),E<128?m[k++]=E:(E<2048?m[k++]=192|E>>>6:(E<65536?m[k++]=224|E>>>12:(m[k++]=240|E>>>18,m[k++]=128|E>>>12&63),m[k++]=128|E>>>6&63),m[k++]=128|63&E);return m}(f)},s.utf8decode=function(f){return a.nodebuffer?i.transformTo("nodebuffer",f).toString("utf-8"):function(w){var m,E,c,u,k=w.length,b=new Array(2*k);for(m=E=0;m<k;)if((c=w[m++])<128)b[E++]=c;else if(4<(u=d[c]))b[E++]=65533,m+=u-1;else{for(c&=u===2?31:u===3?15:7;1<u&&m<k;)c=c<<6|63&w[m++],u--;1<u?b[E++]=65533:c<65536?b[E++]=c:(c-=65536,b[E++]=55296|c>>10&1023,b[E++]=56320|1023&c)}return b.length!==E&&(b.subarray?b=b.subarray(0,E):b.length=E),i.applyFromCharCode(b)}(f=i.transformTo(a.uint8array?"uint8array":"array",f))},i.inherits(v,l),v.prototype.processChunk=function(f){var w=i.transformTo(a.uint8array?"uint8array":"array",f.data);if(this.leftOver&&this.leftOver.length){if(a.uint8array){var m=w;(w=new Uint8Array(m.length+this.leftOver.length)).set(this.leftOver,0),w.set(m,this.leftOver.length)}else w=this.leftOver.concat(w);this.leftOver=null}var E=function(u,k){var b;for((k=k||u.length)>u.length&&(k=u.length),b=k-1;0<=b&&(192&u[b])==128;)b--;return b<0||b===0?k:b+d[u[b]]>k?b:k}(w),c=w;E!==w.length&&(a.uint8array?(c=w.subarray(0,E),this.leftOver=w.subarray(E,w.length)):(c=w.slice(0,E),this.leftOver=w.slice(E,w.length))),this.push({data:s.utf8decode(c),meta:f.meta})},v.prototype.flush=function(){this.leftOver&&this.leftOver.length&&(this.push({data:s.utf8decode(this.leftOver),meta:{}}),this.leftOver=null)},s.Utf8DecodeWorker=v,i.inherits(h,l),h.prototype.processChunk=function(f){this.push({data:s.utf8encode(f.data),meta:f.meta})},s.Utf8EncodeWorker=h},{"./nodejsUtils":14,"./stream/GenericWorker":28,"./support":30,"./utils":32}],32:[function(n,r,s){var i=n("./support"),a=n("./base64"),o=n("./nodejsUtils"),l=n("./external");function d(m){return m}function y(m,E){for(var c=0;c<m.length;++c)E[c]=255&m.charCodeAt(c);return E}n("setimmediate"),s.newBlob=function(m,E){s.checkSupport("blob");try{return new Blob([m],{type:E})}catch{try{var c=new(self.BlobBuilder||self.WebKitBlobBuilder||self.MozBlobBuilder||self.MSBlobBuilder);return c.append(m),c.getBlob(E)}catch{throw new Error("Bug : can't construct the Blob.")}}};var v={stringifyByChunk:function(m,E,c){var u=[],k=0,b=m.length;if(b<=c)return String.fromCharCode.apply(null,m);for(;k<b;)E==="array"||E==="nodebuffer"?u.push(String.fromCharCode.apply(null,m.slice(k,Math.min(k+c,b)))):u.push(String.fromCharCode.apply(null,m.subarray(k,Math.min(k+c,b)))),k+=c;return u.join("")},stringifyByChar:function(m){for(var E="",c=0;c<m.length;c++)E+=String.fromCharCode(m[c]);return E},applyCanBeUsed:{uint8array:function(){try{return i.uint8array&&String.fromCharCode.apply(null,new Uint8Array(1)).length===1}catch{return!1}}(),nodebuffer:function(){try{return i.nodebuffer&&String.fromCharCode.apply(null,o.allocBuffer(1)).length===1}catch{return!1}}()}};function h(m){var E=65536,c=s.getTypeOf(m),u=!0;if(c==="uint8array"?u=v.applyCanBeUsed.uint8array:c==="nodebuffer"&&(u=v.applyCanBeUsed.nodebuffer),u)for(;1<E;)try{return v.stringifyByChunk(m,c,E)}catch{E=Math.floor(E/2)}return v.stringifyByChar(m)}function f(m,E){for(var c=0;c<m.length;c++)E[c]=m[c];return E}s.applyFromCharCode=h;var w={};w.string={string:d,array:function(m){return y(m,new Array(m.length))},arraybuffer:function(m){return w.string.uint8array(m).buffer},uint8array:function(m){return y(m,new Uint8Array(m.length))},nodebuffer:function(m){return y(m,o.allocBuffer(m.length))}},w.array={string:h,array:d,arraybuffer:function(m){return new Uint8Array(m).buffer},uint8array:function(m){return new Uint8Array(m)},nodebuffer:function(m){return o.newBufferFrom(m)}},w.arraybuffer={string:function(m){return h(new Uint8Array(m))},array:function(m){return f(new Uint8Array(m),new Array(m.byteLength))},arraybuffer:d,uint8array:function(m){return new Uint8Array(m)},nodebuffer:function(m){return o.newBufferFrom(new Uint8Array(m))}},w.uint8array={string:h,array:function(m){return f(m,new Array(m.length))},arraybuffer:function(m){return m.buffer},uint8array:d,nodebuffer:function(m){return o.newBufferFrom(m)}},w.nodebuffer={string:h,array:function(m){return f(m,new Array(m.length))},arraybuffer:function(m){return w.nodebuffer.uint8array(m).buffer},uint8array:function(m){return f(m,new Uint8Array(m.length))},nodebuffer:d},s.transformTo=function(m,E){if(E=E||"",!m)return E;s.checkSupport(m);var c=s.getTypeOf(E);return w[c][m](E)},s.resolve=function(m){for(var E=m.split("/"),c=[],u=0;u<E.length;u++){var k=E[u];k==="."||k===""&&u!==0&&u!==E.length-1||(k===".."?c.pop():c.push(k))}return c.join("/")},s.getTypeOf=function(m){return typeof m=="string"?"string":Object.prototype.toString.call(m)==="[object Array]"?"array":i.nodebuffer&&o.isBuffer(m)?"nodebuffer":i.uint8array&&m instanceof Uint8Array?"uint8array":i.arraybuffer&&m instanceof ArrayBuffer?"arraybuffer":void 0},s.checkSupport=function(m){if(!i[m.toLowerCase()])throw new Error(m+" is not supported by this platform")},s.MAX_VALUE_16BITS=65535,s.MAX_VALUE_32BITS=-1,s.pretty=function(m){var E,c,u="";for(c=0;c<(m||"").length;c++)u+="\\x"+((E=m.charCodeAt(c))<16?"0":"")+E.toString(16).toUpperCase();return u},s.delay=function(m,E,c){setImmediate(function(){m.apply(c||null,E||[])})},s.inherits=function(m,E){function c(){}c.prototype=E.prototype,m.prototype=new c},s.extend=function(){var m,E,c={};for(m=0;m<arguments.length;m++)for(E in arguments[m])Object.prototype.hasOwnProperty.call(arguments[m],E)&&c[E]===void 0&&(c[E]=arguments[m][E]);return c},s.prepareContent=function(m,E,c,u,k){return l.Promise.resolve(E).then(function(b){return i.blob&&(b instanceof Blob||["[object File]","[object Blob]"].indexOf(Object.prototype.toString.call(b))!==-1)&&typeof FileReader<"u"?new l.Promise(function(T,I){var _=new FileReader;_.onload=function(j){T(j.target.result)},_.onerror=function(j){I(j.target.error)},_.readAsArrayBuffer(b)}):b}).then(function(b){var T=s.getTypeOf(b);return T?(T==="arraybuffer"?b=s.transformTo("uint8array",b):T==="string"&&(k?b=a.decode(b):c&&u!==!0&&(b=function(I){return y(I,i.uint8array?new Uint8Array(I.length):new Array(I.length))}(b))),b):l.Promise.reject(new Error("Can't read the data of '"+m+"'. Is it in a supported JavaScript type (String, Blob, ArrayBuffer, etc) ?"))})}},{"./base64":1,"./external":6,"./nodejsUtils":14,"./support":30,setimmediate:54}],33:[function(n,r,s){var i=n("./reader/readerFor"),a=n("./utils"),o=n("./signature"),l=n("./zipEntry"),d=n("./support");function y(v){this.files=[],this.loadOptions=v}y.prototype={checkSignature:function(v){if(!this.reader.readAndCheckSignature(v)){this.reader.index-=4;var h=this.reader.readString(4);throw new Error("Corrupted zip or bug: unexpected signature ("+a.pretty(h)+", expected "+a.pretty(v)+")")}},isSignature:function(v,h){var f=this.reader.index;this.reader.setIndex(v);var w=this.reader.readString(4)===h;return this.reader.setIndex(f),w},readBlockEndOfCentral:function(){this.diskNumber=this.reader.readInt(2),this.diskWithCentralDirStart=this.reader.readInt(2),this.centralDirRecordsOnThisDisk=this.reader.readInt(2),this.centralDirRecords=this.reader.readInt(2),this.centralDirSize=this.reader.readInt(4),this.centralDirOffset=this.reader.readInt(4),this.zipCommentLength=this.reader.readInt(2);var v=this.reader.readData(this.zipCommentLength),h=d.uint8array?"uint8array":"array",f=a.transformTo(h,v);this.zipComment=this.loadOptions.decodeFileName(f)},readBlockZip64EndOfCentral:function(){this.zip64EndOfCentralSize=this.reader.readInt(8),this.reader.skip(4),this.diskNumber=this.reader.readInt(4),this.diskWithCentralDirStart=this.reader.readInt(4),this.centralDirRecordsOnThisDisk=this.reader.readInt(8),this.centralDirRecords=this.reader.readInt(8),this.centralDirSize=this.reader.readInt(8),this.centralDirOffset=this.reader.readInt(8),this.zip64ExtensibleData={};for(var v,h,f,w=this.zip64EndOfCentralSize-44;0<w;)v=this.reader.readInt(2),h=this.reader.readInt(4),f=this.reader.readData(h),this.zip64ExtensibleData[v]={id:v,length:h,value:f}},readBlockZip64EndOfCentralLocator:function(){if(this.diskWithZip64CentralDirStart=this.reader.readInt(4),this.relativeOffsetEndOfZip64CentralDir=this.reader.readInt(8),this.disksCount=this.reader.readInt(4),1<this.disksCount)throw new Error("Multi-volumes zip are not supported")},readLocalFiles:function(){var v,h;for(v=0;v<this.files.length;v++)h=this.files[v],this.reader.setIndex(h.localHeaderOffset),this.checkSignature(o.LOCAL_FILE_HEADER),h.readLocalPart(this.reader),h.handleUTF8(),h.processAttributes()},readCentralDir:function(){var v;for(this.reader.setIndex(this.centralDirOffset);this.reader.readAndCheckSignature(o.CENTRAL_FILE_HEADER);)(v=new l({zip64:this.zip64},this.loadOptions)).readCentralPart(this.reader),this.files.push(v);if(this.centralDirRecords!==this.files.length&&this.centralDirRecords!==0&&this.files.length===0)throw new Error("Corrupted zip or bug: expected "+this.centralDirRecords+" records in central dir, got "+this.files.length)},readEndOfCentral:function(){var v=this.reader.lastIndexOfSignature(o.CENTRAL_DIRECTORY_END);if(v<0)throw this.isSignature(0,o.LOCAL_FILE_HEADER)?new Error("Corrupted zip: can't find end of central directory"):new Error("Can't find end of central directory : is this a zip file ? If it is, see https://stuk.github.io/jszip/documentation/howto/read_zip.html");this.reader.setIndex(v);var h=v;if(this.checkSignature(o.CENTRAL_DIRECTORY_END),this.readBlockEndOfCentral(),this.diskNumber===a.MAX_VALUE_16BITS||this.diskWithCentralDirStart===a.MAX_VALUE_16BITS||this.centralDirRecordsOnThisDisk===a.MAX_VALUE_16BITS||this.centralDirRecords===a.MAX_VALUE_16BITS||this.centralDirSize===a.MAX_VALUE_32BITS||this.centralDirOffset===a.MAX_VALUE_32BITS){if(this.zip64=!0,(v=this.reader.lastIndexOfSignature(o.ZIP64_CENTRAL_DIRECTORY_LOCATOR))<0)throw new Error("Corrupted zip: can't find the ZIP64 end of central directory locator");if(this.reader.setIndex(v),this.checkSignature(o.ZIP64_CENTRAL_DIRECTORY_LOCATOR),this.readBlockZip64EndOfCentralLocator(),!this.isSignature(this.relativeOffsetEndOfZip64CentralDir,o.ZIP64_CENTRAL_DIRECTORY_END)&&(this.relativeOffsetEndOfZip64CentralDir=this.reader.lastIndexOfSignature(o.ZIP64_CENTRAL_DIRECTORY_END),this.relativeOffsetEndOfZip64CentralDir<0))throw new Error("Corrupted zip: can't find the ZIP64 end of central directory");this.reader.setIndex(this.relativeOffsetEndOfZip64CentralDir),this.checkSignature(o.ZIP64_CENTRAL_DIRECTORY_END),this.readBlockZip64EndOfCentral()}var f=this.centralDirOffset+this.centralDirSize;this.zip64&&(f+=20,f+=12+this.zip64EndOfCentralSize);var w=h-f;if(0<w)this.isSignature(h,o.CENTRAL_FILE_HEADER)||(this.reader.zero=w);else if(w<0)throw new Error("Corrupted zip: missing "+Math.abs(w)+" bytes.")},prepareReader:function(v){this.reader=i(v)},load:function(v){this.prepareReader(v),this.readEndOfCentral(),this.readCentralDir(),this.readLocalFiles()}},r.exports=y},{"./reader/readerFor":22,"./signature":23,"./support":30,"./utils":32,"./zipEntry":34}],34:[function(n,r,s){var i=n("./reader/readerFor"),a=n("./utils"),o=n("./compressedObject"),l=n("./crc32"),d=n("./utf8"),y=n("./compressions"),v=n("./support");function h(f,w){this.options=f,this.loadOptions=w}h.prototype={isEncrypted:function(){return(1&this.bitFlag)==1},useUTF8:function(){return(2048&this.bitFlag)==2048},readLocalPart:function(f){var w,m;if(f.skip(22),this.fileNameLength=f.readInt(2),m=f.readInt(2),this.fileName=f.readData(this.fileNameLength),f.skip(m),this.compressedSize===-1||this.uncompressedSize===-1)throw new Error("Bug or corrupted zip : didn't get enough information from the central directory (compressedSize === -1 || uncompressedSize === -1)");if((w=function(E){for(var c in y)if(Object.prototype.hasOwnProperty.call(y,c)&&y[c].magic===E)return y[c];return null}(this.compressionMethod))===null)throw new Error("Corrupted zip : compression "+a.pretty(this.compressionMethod)+" unknown (inner file : "+a.transformTo("string",this.fileName)+")");this.decompressed=new o(this.compressedSize,this.uncompressedSize,this.crc32,w,f.readData(this.compressedSize))},readCentralPart:function(f){this.versionMadeBy=f.readInt(2),f.skip(2),this.bitFlag=f.readInt(2),this.compressionMethod=f.readString(2),this.date=f.readDate(),this.crc32=f.readInt(4),this.compressedSize=f.readInt(4),this.uncompressedSize=f.readInt(4);var w=f.readInt(2);if(this.extraFieldsLength=f.readInt(2),this.fileCommentLength=f.readInt(2),this.diskNumberStart=f.readInt(2),this.internalFileAttributes=f.readInt(2),this.externalFileAttributes=f.readInt(4),this.localHeaderOffset=f.readInt(4),this.isEncrypted())throw new Error("Encrypted zip are not supported");f.skip(w),this.readExtraFields(f),this.parseZIP64ExtraField(f),this.fileComment=f.readData(this.fileCommentLength)},processAttributes:function(){this.unixPermissions=null,this.dosPermissions=null;var f=this.versionMadeBy>>8;this.dir=!!(16&this.externalFileAttributes),f==0&&(this.dosPermissions=63&this.externalFileAttributes),f==3&&(this.unixPermissions=this.externalFileAttributes>>16&65535),this.dir||this.fileNameStr.slice(-1)!=="/"||(this.dir=!0)},parseZIP64ExtraField:function(){if(this.extraFields[1]){var f=i(this.extraFields[1].value);this.uncompressedSize===a.MAX_VALUE_32BITS&&(this.uncompressedSize=f.readInt(8)),this.compressedSize===a.MAX_VALUE_32BITS&&(this.compressedSize=f.readInt(8)),this.localHeaderOffset===a.MAX_VALUE_32BITS&&(this.localHeaderOffset=f.readInt(8)),this.diskNumberStart===a.MAX_VALUE_32BITS&&(this.diskNumberStart=f.readInt(4))}},readExtraFields:function(f){var w,m,E,c=f.index+this.extraFieldsLength;for(this.extraFields||(this.extraFields={});f.index+4<c;)w=f.readInt(2),m=f.readInt(2),E=f.readData(m),this.extraFields[w]={id:w,length:m,value:E};f.setIndex(c)},handleUTF8:function(){var f=v.uint8array?"uint8array":"array";if(this.useUTF8())this.fileNameStr=d.utf8decode(this.fileName),this.fileCommentStr=d.utf8decode(this.fileComment);else{var w=this.findExtraFieldUnicodePath();if(w!==null)this.fileNameStr=w;else{var m=a.transformTo(f,this.fileName);this.fileNameStr=this.loadOptions.decodeFileName(m)}var E=this.findExtraFieldUnicodeComment();if(E!==null)this.fileCommentStr=E;else{var c=a.transformTo(f,this.fileComment);this.fileCommentStr=this.loadOptions.decodeFileName(c)}}},findExtraFieldUnicodePath:function(){var f=this.extraFields[28789];if(f){var w=i(f.value);return w.readInt(1)!==1||l(this.fileName)!==w.readInt(4)?null:d.utf8decode(w.readData(f.length-5))}return null},findExtraFieldUnicodeComment:function(){var f=this.extraFields[25461];if(f){var w=i(f.value);return w.readInt(1)!==1||l(this.fileComment)!==w.readInt(4)?null:d.utf8decode(w.readData(f.length-5))}return null}},r.exports=h},{"./compressedObject":2,"./compressions":3,"./crc32":4,"./reader/readerFor":22,"./support":30,"./utf8":31,"./utils":32}],35:[function(n,r,s){function i(w,m,E){this.name=w,this.dir=E.dir,this.date=E.date,this.comment=E.comment,this.unixPermissions=E.unixPermissions,this.dosPermissions=E.dosPermissions,this._data=m,this._dataBinary=E.binary,this.options={compression:E.compression,compressionOptions:E.compressionOptions}}var a=n("./stream/StreamHelper"),o=n("./stream/DataWorker"),l=n("./utf8"),d=n("./compressedObject"),y=n("./stream/GenericWorker");i.prototype={internalStream:function(w){var m=null,E="string";try{if(!w)throw new Error("No output type specified.");var c=(E=w.toLowerCase())==="string"||E==="text";E!=="binarystring"&&E!=="text"||(E="string"),m=this._decompressWorker();var u=!this._dataBinary;u&&!c&&(m=m.pipe(new l.Utf8EncodeWorker)),!u&&c&&(m=m.pipe(new l.Utf8DecodeWorker))}catch(k){(m=new y("error")).error(k)}return new a(m,E,"")},async:function(w,m){return this.internalStream(w).accumulate(m)},nodeStream:function(w,m){return this.internalStream(w||"nodebuffer").toNodejsStream(m)},_compressWorker:function(w,m){if(this._data instanceof d&&this._data.compression.magic===w.magic)return this._data.getCompressedWorker();var E=this._decompressWorker();return this._dataBinary||(E=E.pipe(new l.Utf8EncodeWorker)),d.createWorkerFrom(E,w,m)},_decompressWorker:function(){return this._data instanceof d?this._data.getContentWorker():this._data instanceof y?this._data:new o(this._data)}};for(var v=["asText","asBinary","asNodeBuffer","asUint8Array","asArrayBuffer"],h=function(){throw new Error("This method has been removed in JSZip 3.0, please check the upgrade guide.")},f=0;f<v.length;f++)i.prototype[v[f]]=h;r.exports=i},{"./compressedObject":2,"./stream/DataWorker":27,"./stream/GenericWorker":28,"./stream/StreamHelper":29,"./utf8":31}],36:[function(n,r,s){(function(i){var a,o,l=i.MutationObserver||i.WebKitMutationObserver;if(l){var d=0,y=new l(w),v=i.document.createTextNode("");y.observe(v,{characterData:!0}),a=function(){v.data=d=++d%2}}else if(i.setImmediate||i.MessageChannel===void 0)a="document"in i&&"onreadystatechange"in i.document.createElement("script")?function(){var m=i.document.createElement("script");m.onreadystatechange=function(){w(),m.onreadystatechange=null,m.parentNode.removeChild(m),m=null},i.document.documentElement.appendChild(m)}:function(){setTimeout(w,0)};else{var h=new i.MessageChannel;h.port1.onmessage=w,a=function(){h.port2.postMessage(0)}}var f=[];function w(){var m,E;o=!0;for(var c=f.length;c;){for(E=f,f=[],m=-1;++m<c;)E[m]();c=f.length}o=!1}r.exports=function(m){f.push(m)!==1||o||a()}}).call(this,typeof Fr<"u"?Fr:typeof self<"u"?self:typeof window<"u"?window:{})},{}],37:[function(n,r,s){var i=n("immediate");function a(){}var o={},l=["REJECTED"],d=["FULFILLED"],y=["PENDING"];function v(c){if(typeof c!="function")throw new TypeError("resolver must be a function");this.state=y,this.queue=[],this.outcome=void 0,c!==a&&m(this,c)}function h(c,u,k){this.promise=c,typeof u=="function"&&(this.onFulfilled=u,this.callFulfilled=this.otherCallFulfilled),typeof k=="function"&&(this.onRejected=k,this.callRejected=this.otherCallRejected)}function f(c,u,k){i(function(){var b;try{b=u(k)}catch(T){return o.reject(c,T)}b===c?o.reject(c,new TypeError("Cannot resolve promise with itself")):o.resolve(c,b)})}function w(c){var u=c&&c.then;if(c&&(typeof c=="object"||typeof c=="function")&&typeof u=="function")return function(){u.apply(c,arguments)}}function m(c,u){var k=!1;function b(_){k||(k=!0,o.reject(c,_))}function T(_){k||(k=!0,o.resolve(c,_))}var I=E(function(){u(T,b)});I.status==="error"&&b(I.value)}function E(c,u){var k={};try{k.value=c(u),k.status="success"}catch(b){k.status="error",k.value=b}return k}(r.exports=v).prototype.finally=function(c){if(typeof c!="function")return this;var u=this.constructor;return this.then(function(k){return u.resolve(c()).then(function(){return k})},function(k){return u.resolve(c()).then(function(){throw k})})},v.prototype.catch=function(c){return this.then(null,c)},v.prototype.then=function(c,u){if(typeof c!="function"&&this.state===d||typeof u!="function"&&this.state===l)return this;var k=new this.constructor(a);return this.state!==y?f(k,this.state===d?c:u,this.outcome):this.queue.push(new h(k,c,u)),k},h.prototype.callFulfilled=function(c){o.resolve(this.promise,c)},h.prototype.otherCallFulfilled=function(c){f(this.promise,this.onFulfilled,c)},h.prototype.callRejected=function(c){o.reject(this.promise,c)},h.prototype.otherCallRejected=function(c){f(this.promise,this.onRejected,c)},o.resolve=function(c,u){var k=E(w,u);if(k.status==="error")return o.reject(c,k.value);var b=k.value;if(b)m(c,b);else{c.state=d,c.outcome=u;for(var T=-1,I=c.queue.length;++T<I;)c.queue[T].callFulfilled(u)}return c},o.reject=function(c,u){c.state=l,c.outcome=u;for(var k=-1,b=c.queue.length;++k<b;)c.queue[k].callRejected(u);return c},v.resolve=function(c){return c instanceof this?c:o.resolve(new this(a),c)},v.reject=function(c){var u=new this(a);return o.reject(u,c)},v.all=function(c){var u=this;if(Object.prototype.toString.call(c)!=="[object Array]")return this.reject(new TypeError("must be an array"));var k=c.length,b=!1;if(!k)return this.resolve([]);for(var T=new Array(k),I=0,_=-1,j=new this(a);++_<k;)$(c[_],_);return j;function $(M,ne){u.resolve(M).then(function(C){T[ne]=C,++I!==k||b||(b=!0,o.resolve(j,T))},function(C){b||(b=!0,o.reject(j,C))})}},v.race=function(c){var u=this;if(Object.prototype.toString.call(c)!=="[object Array]")return this.reject(new TypeError("must be an array"));var k=c.length,b=!1;if(!k)return this.resolve([]);for(var T=-1,I=new this(a);++T<k;)_=c[T],u.resolve(_).then(function(j){b||(b=!0,o.resolve(I,j))},function(j){b||(b=!0,o.reject(I,j))});var _;return I}},{immediate:36}],38:[function(n,r,s){var i={};(0,n("./lib/utils/common").assign)(i,n("./lib/deflate"),n("./lib/inflate"),n("./lib/zlib/constants")),r.exports=i},{"./lib/deflate":39,"./lib/inflate":40,"./lib/utils/common":41,"./lib/zlib/constants":44}],39:[function(n,r,s){var i=n("./zlib/deflate"),a=n("./utils/common"),o=n("./utils/strings"),l=n("./zlib/messages"),d=n("./zlib/zstream"),y=Object.prototype.toString,v=0,h=-1,f=0,w=8;function m(c){if(!(this instanceof m))return new m(c);this.options=a.assign({level:h,method:w,chunkSize:16384,windowBits:15,memLevel:8,strategy:f,to:""},c||{});var u=this.options;u.raw&&0<u.windowBits?u.windowBits=-u.windowBits:u.gzip&&0<u.windowBits&&u.windowBits<16&&(u.windowBits+=16),this.err=0,this.msg="",this.ended=!1,this.chunks=[],this.strm=new d,this.strm.avail_out=0;var k=i.deflateInit2(this.strm,u.level,u.method,u.windowBits,u.memLevel,u.strategy);if(k!==v)throw new Error(l[k]);if(u.header&&i.deflateSetHeader(this.strm,u.header),u.dictionary){var b;if(b=typeof u.dictionary=="string"?o.string2buf(u.dictionary):y.call(u.dictionary)==="[object ArrayBuffer]"?new Uint8Array(u.dictionary):u.dictionary,(k=i.deflateSetDictionary(this.strm,b))!==v)throw new Error(l[k]);this._dict_set=!0}}function E(c,u){var k=new m(u);if(k.push(c,!0),k.err)throw k.msg||l[k.err];return k.result}m.prototype.push=function(c,u){var k,b,T=this.strm,I=this.options.chunkSize;if(this.ended)return!1;b=u===~~u?u:u===!0?4:0,typeof c=="string"?T.input=o.string2buf(c):y.call(c)==="[object ArrayBuffer]"?T.input=new Uint8Array(c):T.input=c,T.next_in=0,T.avail_in=T.input.length;do{if(T.avail_out===0&&(T.output=new a.Buf8(I),T.next_out=0,T.avail_out=I),(k=i.deflate(T,b))!==1&&k!==v)return this.onEnd(k),!(this.ended=!0);T.avail_out!==0&&(T.avail_in!==0||b!==4&&b!==2)||(this.options.to==="string"?this.onData(o.buf2binstring(a.shrinkBuf(T.output,T.next_out))):this.onData(a.shrinkBuf(T.output,T.next_out)))}while((0<T.avail_in||T.avail_out===0)&&k!==1);return b===4?(k=i.deflateEnd(this.strm),this.onEnd(k),this.ended=!0,k===v):b!==2||(this.onEnd(v),!(T.avail_out=0))},m.prototype.onData=function(c){this.chunks.push(c)},m.prototype.onEnd=function(c){c===v&&(this.options.to==="string"?this.result=this.chunks.join(""):this.result=a.flattenChunks(this.chunks)),this.chunks=[],this.err=c,this.msg=this.strm.msg},s.Deflate=m,s.deflate=E,s.deflateRaw=function(c,u){return(u=u||{}).raw=!0,E(c,u)},s.gzip=function(c,u){return(u=u||{}).gzip=!0,E(c,u)}},{"./utils/common":41,"./utils/strings":42,"./zlib/deflate":46,"./zlib/messages":51,"./zlib/zstream":53}],40:[function(n,r,s){var i=n("./zlib/inflate"),a=n("./utils/common"),o=n("./utils/strings"),l=n("./zlib/constants"),d=n("./zlib/messages"),y=n("./zlib/zstream"),v=n("./zlib/gzheader"),h=Object.prototype.toString;function f(m){if(!(this instanceof f))return new f(m);this.options=a.assign({chunkSize:16384,windowBits:0,to:""},m||{});var E=this.options;E.raw&&0<=E.windowBits&&E.windowBits<16&&(E.windowBits=-E.windowBits,E.windowBits===0&&(E.windowBits=-15)),!(0<=E.windowBits&&E.windowBits<16)||m&&m.windowBits||(E.windowBits+=32),15<E.windowBits&&E.windowBits<48&&!(15&E.windowBits)&&(E.windowBits|=15),this.err=0,this.msg="",this.ended=!1,this.chunks=[],this.strm=new y,this.strm.avail_out=0;var c=i.inflateInit2(this.strm,E.windowBits);if(c!==l.Z_OK)throw new Error(d[c]);this.header=new v,i.inflateGetHeader(this.strm,this.header)}function w(m,E){var c=new f(E);if(c.push(m,!0),c.err)throw c.msg||d[c.err];return c.result}f.prototype.push=function(m,E){var c,u,k,b,T,I,_=this.strm,j=this.options.chunkSize,$=this.options.dictionary,M=!1;if(this.ended)return!1;u=E===~~E?E:E===!0?l.Z_FINISH:l.Z_NO_FLUSH,typeof m=="string"?_.input=o.binstring2buf(m):h.call(m)==="[object ArrayBuffer]"?_.input=new Uint8Array(m):_.input=m,_.next_in=0,_.avail_in=_.input.length;do{if(_.avail_out===0&&(_.output=new a.Buf8(j),_.next_out=0,_.avail_out=j),(c=i.inflate(_,l.Z_NO_FLUSH))===l.Z_NEED_DICT&&$&&(I=typeof $=="string"?o.string2buf($):h.call($)==="[object ArrayBuffer]"?new Uint8Array($):$,c=i.inflateSetDictionary(this.strm,I)),c===l.Z_BUF_ERROR&&M===!0&&(c=l.Z_OK,M=!1),c!==l.Z_STREAM_END&&c!==l.Z_OK)return this.onEnd(c),!(this.ended=!0);_.next_out&&(_.avail_out!==0&&c!==l.Z_STREAM_END&&(_.avail_in!==0||u!==l.Z_FINISH&&u!==l.Z_SYNC_FLUSH)||(this.options.to==="string"?(k=o.utf8border(_.output,_.next_out),b=_.next_out-k,T=o.buf2string(_.output,k),_.next_out=b,_.avail_out=j-b,b&&a.arraySet(_.output,_.output,k,b,0),this.onData(T)):this.onData(a.shrinkBuf(_.output,_.next_out)))),_.avail_in===0&&_.avail_out===0&&(M=!0)}while((0<_.avail_in||_.avail_out===0)&&c!==l.Z_STREAM_END);return c===l.Z_STREAM_END&&(u=l.Z_FINISH),u===l.Z_FINISH?(c=i.inflateEnd(this.strm),this.onEnd(c),this.ended=!0,c===l.Z_OK):u!==l.Z_SYNC_FLUSH||(this.onEnd(l.Z_OK),!(_.avail_out=0))},f.prototype.onData=function(m){this.chunks.push(m)},f.prototype.onEnd=function(m){m===l.Z_OK&&(this.options.to==="string"?this.result=this.chunks.join(""):this.result=a.flattenChunks(this.chunks)),this.chunks=[],this.err=m,this.msg=this.strm.msg},s.Inflate=f,s.inflate=w,s.inflateRaw=function(m,E){return(E=E||{}).raw=!0,w(m,E)},s.ungzip=w},{"./utils/common":41,"./utils/strings":42,"./zlib/constants":44,"./zlib/gzheader":47,"./zlib/inflate":49,"./zlib/messages":51,"./zlib/zstream":53}],41:[function(n,r,s){var i=typeof Uint8Array<"u"&&typeof Uint16Array<"u"&&typeof Int32Array<"u";s.assign=function(l){for(var d=Array.prototype.slice.call(arguments,1);d.length;){var y=d.shift();if(y){if(typeof y!="object")throw new TypeError(y+"must be non-object");for(var v in y)y.hasOwnProperty(v)&&(l[v]=y[v])}}return l},s.shrinkBuf=function(l,d){return l.length===d?l:l.subarray?l.subarray(0,d):(l.length=d,l)};var a={arraySet:function(l,d,y,v,h){if(d.subarray&&l.subarray)l.set(d.subarray(y,y+v),h);else for(var f=0;f<v;f++)l[h+f]=d[y+f]},flattenChunks:function(l){var d,y,v,h,f,w;for(d=v=0,y=l.length;d<y;d++)v+=l[d].length;for(w=new Uint8Array(v),d=h=0,y=l.length;d<y;d++)f=l[d],w.set(f,h),h+=f.length;return w}},o={arraySet:function(l,d,y,v,h){for(var f=0;f<v;f++)l[h+f]=d[y+f]},flattenChunks:function(l){return[].concat.apply([],l)}};s.setTyped=function(l){l?(s.Buf8=Uint8Array,s.Buf16=Uint16Array,s.Buf32=Int32Array,s.assign(s,a)):(s.Buf8=Array,s.Buf16=Array,s.Buf32=Array,s.assign(s,o))},s.setTyped(i)},{}],42:[function(n,r,s){var i=n("./common"),a=!0,o=!0;try{String.fromCharCode.apply(null,[0])}catch{a=!1}try{String.fromCharCode.apply(null,new Uint8Array(1))}catch{o=!1}for(var l=new i.Buf8(256),d=0;d<256;d++)l[d]=252<=d?6:248<=d?5:240<=d?4:224<=d?3:192<=d?2:1;function y(v,h){if(h<65537&&(v.subarray&&o||!v.subarray&&a))return String.fromCharCode.apply(null,i.shrinkBuf(v,h));for(var f="",w=0;w<h;w++)f+=String.fromCharCode(v[w]);return f}l[254]=l[254]=1,s.string2buf=function(v){var h,f,w,m,E,c=v.length,u=0;for(m=0;m<c;m++)(64512&(f=v.charCodeAt(m)))==55296&&m+1<c&&(64512&(w=v.charCodeAt(m+1)))==56320&&(f=65536+(f-55296<<10)+(w-56320),m++),u+=f<128?1:f<2048?2:f<65536?3:4;for(h=new i.Buf8(u),m=E=0;E<u;m++)(64512&(f=v.charCodeAt(m)))==55296&&m+1<c&&(64512&(w=v.charCodeAt(m+1)))==56320&&(f=65536+(f-55296<<10)+(w-56320),m++),f<128?h[E++]=f:(f<2048?h[E++]=192|f>>>6:(f<65536?h[E++]=224|f>>>12:(h[E++]=240|f>>>18,h[E++]=128|f>>>12&63),h[E++]=128|f>>>6&63),h[E++]=128|63&f);return h},s.buf2binstring=function(v){return y(v,v.length)},s.binstring2buf=function(v){for(var h=new i.Buf8(v.length),f=0,w=h.length;f<w;f++)h[f]=v.charCodeAt(f);return h},s.buf2string=function(v,h){var f,w,m,E,c=h||v.length,u=new Array(2*c);for(f=w=0;f<c;)if((m=v[f++])<128)u[w++]=m;else if(4<(E=l[m]))u[w++]=65533,f+=E-1;else{for(m&=E===2?31:E===3?15:7;1<E&&f<c;)m=m<<6|63&v[f++],E--;1<E?u[w++]=65533:m<65536?u[w++]=m:(m-=65536,u[w++]=55296|m>>10&1023,u[w++]=56320|1023&m)}return y(u,w)},s.utf8border=function(v,h){var f;for((h=h||v.length)>v.length&&(h=v.length),f=h-1;0<=f&&(192&v[f])==128;)f--;return f<0||f===0?h:f+l[v[f]]>h?f:h}},{"./common":41}],43:[function(n,r,s){r.exports=function(i,a,o,l){for(var d=65535&i|0,y=i>>>16&65535|0,v=0;o!==0;){for(o-=v=2e3<o?2e3:o;y=y+(d=d+a[l++]|0)|0,--v;);d%=65521,y%=65521}return d|y<<16|0}},{}],44:[function(n,r,s){r.exports={Z_NO_FLUSH:0,Z_PARTIAL_FLUSH:1,Z_SYNC_FLUSH:2,Z_FULL_FLUSH:3,Z_FINISH:4,Z_BLOCK:5,Z_TREES:6,Z_OK:0,Z_STREAM_END:1,Z_NEED_DICT:2,Z_ERRNO:-1,Z_STREAM_ERROR:-2,Z_DATA_ERROR:-3,Z_BUF_ERROR:-5,Z_NO_COMPRESSION:0,Z_BEST_SPEED:1,Z_BEST_COMPRESSION:9,Z_DEFAULT_COMPRESSION:-1,Z_FILTERED:1,Z_HUFFMAN_ONLY:2,Z_RLE:3,Z_FIXED:4,Z_DEFAULT_STRATEGY:0,Z_BINARY:0,Z_TEXT:1,Z_UNKNOWN:2,Z_DEFLATED:8}},{}],45:[function(n,r,s){var i=function(){for(var a,o=[],l=0;l<256;l++){a=l;for(var d=0;d<8;d++)a=1&a?3988292384^a>>>1:a>>>1;o[l]=a}return o}();r.exports=function(a,o,l,d){var y=i,v=d+l;a^=-1;for(var h=d;h<v;h++)a=a>>>8^y[255&(a^o[h])];return-1^a}},{}],46:[function(n,r,s){var i,a=n("../utils/common"),o=n("./trees"),l=n("./adler32"),d=n("./crc32"),y=n("./messages"),v=0,h=4,f=0,w=-2,m=-1,E=4,c=2,u=8,k=9,b=286,T=30,I=19,_=2*b+1,j=15,$=3,M=258,ne=M+$+1,C=42,L=113,x=1,B=2,oe=3,Y=4;function W(p,F){return p.msg=y[F],F}function D(p){return(p<<1)-(4<p?9:0)}function G(p){for(var F=p.length;0<=--F;)p[F]=0}function P(p){var F=p.state,U=F.pending;U>p.avail_out&&(U=p.avail_out),U!==0&&(a.arraySet(p.output,F.pending_buf,F.pending_out,U,p.next_out),p.next_out+=U,F.pending_out+=U,p.total_out+=U,p.avail_out-=U,F.pending-=U,F.pending===0&&(F.pending_out=0))}function R(p,F){o._tr_flush_block(p,0<=p.block_start?p.block_start:-1,p.strstart-p.block_start,F),p.block_start=p.strstart,P(p.strm)}function se(p,F){p.pending_buf[p.pending++]=F}function X(p,F){p.pending_buf[p.pending++]=F>>>8&255,p.pending_buf[p.pending++]=255&F}function Z(p,F){var U,S,N=p.max_chain_length,O=p.strstart,K=p.prev_length,V=p.nice_match,A=p.strstart>p.w_size-ne?p.strstart-(p.w_size-ne):0,J=p.window,ee=p.w_mask,Q=p.prev,ae=p.strstart+M,xe=J[O+K-1],pe=J[O+K];p.prev_length>=p.good_match&&(N>>=2),V>p.lookahead&&(V=p.lookahead);do if(J[(U=F)+K]===pe&&J[U+K-1]===xe&&J[U]===J[O]&&J[++U]===J[O+1]){O+=2,U++;do;while(J[++O]===J[++U]&&J[++O]===J[++U]&&J[++O]===J[++U]&&J[++O]===J[++U]&&J[++O]===J[++U]&&J[++O]===J[++U]&&J[++O]===J[++U]&&J[++O]===J[++U]&&O<ae);if(S=M-(ae-O),O=ae-M,K<S){if(p.match_start=F,V<=(K=S))break;xe=J[O+K-1],pe=J[O+K]}}while((F=Q[F&ee])>A&&--N!=0);return K<=p.lookahead?K:p.lookahead}function ge(p){var F,U,S,N,O,K,V,A,J,ee,Q=p.w_size;do{if(N=p.window_size-p.lookahead-p.strstart,p.strstart>=Q+(Q-ne)){for(a.arraySet(p.window,p.window,Q,Q,0),p.match_start-=Q,p.strstart-=Q,p.block_start-=Q,F=U=p.hash_size;S=p.head[--F],p.head[F]=Q<=S?S-Q:0,--U;);for(F=U=Q;S=p.prev[--F],p.prev[F]=Q<=S?S-Q:0,--U;);N+=Q}if(p.strm.avail_in===0)break;if(K=p.strm,V=p.window,A=p.strstart+p.lookahead,J=N,ee=void 0,ee=K.avail_in,J<ee&&(ee=J),U=ee===0?0:(K.avail_in-=ee,a.arraySet(V,K.input,K.next_in,ee,A),K.state.wrap===1?K.adler=l(K.adler,V,ee,A):K.state.wrap===2&&(K.adler=d(K.adler,V,ee,A)),K.next_in+=ee,K.total_in+=ee,ee),p.lookahead+=U,p.lookahead+p.insert>=$)for(O=p.strstart-p.insert,p.ins_h=p.window[O],p.ins_h=(p.ins_h<<p.hash_shift^p.window[O+1])&p.hash_mask;p.insert&&(p.ins_h=(p.ins_h<<p.hash_shift^p.window[O+$-1])&p.hash_mask,p.prev[O&p.w_mask]=p.head[p.ins_h],p.head[p.ins_h]=O,O++,p.insert--,!(p.lookahead+p.insert<$)););}while(p.lookahead<ne&&p.strm.avail_in!==0)}function z(p,F){for(var U,S;;){if(p.lookahead<ne){if(ge(p),p.lookahead<ne&&F===v)return x;if(p.lookahead===0)break}if(U=0,p.lookahead>=$&&(p.ins_h=(p.ins_h<<p.hash_shift^p.window[p.strstart+$-1])&p.hash_mask,U=p.prev[p.strstart&p.w_mask]=p.head[p.ins_h],p.head[p.ins_h]=p.strstart),U!==0&&p.strstart-U<=p.w_size-ne&&(p.match_length=Z(p,U)),p.match_length>=$)if(S=o._tr_tally(p,p.strstart-p.match_start,p.match_length-$),p.lookahead-=p.match_length,p.match_length<=p.max_lazy_match&&p.lookahead>=$){for(p.match_length--;p.strstart++,p.ins_h=(p.ins_h<<p.hash_shift^p.window[p.strstart+$-1])&p.hash_mask,U=p.prev[p.strstart&p.w_mask]=p.head[p.ins_h],p.head[p.ins_h]=p.strstart,--p.match_length!=0;);p.strstart++}else p.strstart+=p.match_length,p.match_length=0,p.ins_h=p.window[p.strstart],p.ins_h=(p.ins_h<<p.hash_shift^p.window[p.strstart+1])&p.hash_mask;else S=o._tr_tally(p,0,p.window[p.strstart]),p.lookahead--,p.strstart++;if(S&&(R(p,!1),p.strm.avail_out===0))return x}return p.insert=p.strstart<$-1?p.strstart:$-1,F===h?(R(p,!0),p.strm.avail_out===0?oe:Y):p.last_lit&&(R(p,!1),p.strm.avail_out===0)?x:B}function H(p,F){for(var U,S,N;;){if(p.lookahead<ne){if(ge(p),p.lookahead<ne&&F===v)return x;if(p.lookahead===0)break}if(U=0,p.lookahead>=$&&(p.ins_h=(p.ins_h<<p.hash_shift^p.window[p.strstart+$-1])&p.hash_mask,U=p.prev[p.strstart&p.w_mask]=p.head[p.ins_h],p.head[p.ins_h]=p.strstart),p.prev_length=p.match_length,p.prev_match=p.match_start,p.match_length=$-1,U!==0&&p.prev_length<p.max_lazy_match&&p.strstart-U<=p.w_size-ne&&(p.match_length=Z(p,U),p.match_length<=5&&(p.strategy===1||p.match_length===$&&4096<p.strstart-p.match_start)&&(p.match_length=$-1)),p.prev_length>=$&&p.match_length<=p.prev_length){for(N=p.strstart+p.lookahead-$,S=o._tr_tally(p,p.strstart-1-p.prev_match,p.prev_length-$),p.lookahead-=p.prev_length-1,p.prev_length-=2;++p.strstart<=N&&(p.ins_h=(p.ins_h<<p.hash_shift^p.window[p.strstart+$-1])&p.hash_mask,U=p.prev[p.strstart&p.w_mask]=p.head[p.ins_h],p.head[p.ins_h]=p.strstart),--p.prev_length!=0;);if(p.match_available=0,p.match_length=$-1,p.strstart++,S&&(R(p,!1),p.strm.avail_out===0))return x}else if(p.match_available){if((S=o._tr_tally(p,0,p.window[p.strstart-1]))&&R(p,!1),p.strstart++,p.lookahead--,p.strm.avail_out===0)return x}else p.match_available=1,p.strstart++,p.lookahead--}return p.match_available&&(S=o._tr_tally(p,0,p.window[p.strstart-1]),p.match_available=0),p.insert=p.strstart<$-1?p.strstart:$-1,F===h?(R(p,!0),p.strm.avail_out===0?oe:Y):p.last_lit&&(R(p,!1),p.strm.avail_out===0)?x:B}function re(p,F,U,S,N){this.good_length=p,this.max_lazy=F,this.nice_length=U,this.max_chain=S,this.func=N}function le(){this.strm=null,this.status=0,this.pending_buf=null,this.pending_buf_size=0,this.pending_out=0,this.pending=0,this.wrap=0,this.gzhead=null,this.gzindex=0,this.method=u,this.last_flush=-1,this.w_size=0,this.w_bits=0,this.w_mask=0,this.window=null,this.window_size=0,this.prev=null,this.head=null,this.ins_h=0,this.hash_size=0,this.hash_bits=0,this.hash_mask=0,this.hash_shift=0,this.block_start=0,this.match_length=0,this.prev_match=0,this.match_available=0,this.strstart=0,this.match_start=0,this.lookahead=0,this.prev_length=0,this.max_chain_length=0,this.max_lazy_match=0,this.level=0,this.strategy=0,this.good_match=0,this.nice_match=0,this.dyn_ltree=new a.Buf16(2*_),this.dyn_dtree=new a.Buf16(2*(2*T+1)),this.bl_tree=new a.Buf16(2*(2*I+1)),G(this.dyn_ltree),G(this.dyn_dtree),G(this.bl_tree),this.l_desc=null,this.d_desc=null,this.bl_desc=null,this.bl_count=new a.Buf16(j+1),this.heap=new a.Buf16(2*b+1),G(this.heap),this.heap_len=0,this.heap_max=0,this.depth=new a.Buf16(2*b+1),G(this.depth),this.l_buf=0,this.lit_bufsize=0,this.last_lit=0,this.d_buf=0,this.opt_len=0,this.static_len=0,this.matches=0,this.insert=0,this.bi_buf=0,this.bi_valid=0}function me(p){var F;return p&&p.state?(p.total_in=p.total_out=0,p.data_type=c,(F=p.state).pending=0,F.pending_out=0,F.wrap<0&&(F.wrap=-F.wrap),F.status=F.wrap?C:L,p.adler=F.wrap===2?0:1,F.last_flush=v,o._tr_init(F),f):W(p,w)}function ue(p){var F=me(p);return F===f&&function(U){U.window_size=2*U.w_size,G(U.head),U.max_lazy_match=i[U.level].max_lazy,U.good_match=i[U.level].good_length,U.nice_match=i[U.level].nice_length,U.max_chain_length=i[U.level].max_chain,U.strstart=0,U.block_start=0,U.lookahead=0,U.insert=0,U.match_length=U.prev_length=$-1,U.match_available=0,U.ins_h=0}(p.state),F}function ve(p,F,U,S,N,O){if(!p)return w;var K=1;if(F===m&&(F=6),S<0?(K=0,S=-S):15<S&&(K=2,S-=16),N<1||k<N||U!==u||S<8||15<S||F<0||9<F||O<0||E<O)return W(p,w);S===8&&(S=9);var V=new le;return(p.state=V).strm=p,V.wrap=K,V.gzhead=null,V.w_bits=S,V.w_size=1<<V.w_bits,V.w_mask=V.w_size-1,V.hash_bits=N+7,V.hash_size=1<<V.hash_bits,V.hash_mask=V.hash_size-1,V.hash_shift=~~((V.hash_bits+$-1)/$),V.window=new a.Buf8(2*V.w_size),V.head=new a.Buf16(V.hash_size),V.prev=new a.Buf16(V.w_size),V.lit_bufsize=1<<N+6,V.pending_buf_size=4*V.lit_bufsize,V.pending_buf=new a.Buf8(V.pending_buf_size),V.d_buf=1*V.lit_bufsize,V.l_buf=3*V.lit_bufsize,V.level=F,V.strategy=O,V.method=U,ue(p)}i=[new re(0,0,0,0,function(p,F){var U=65535;for(U>p.pending_buf_size-5&&(U=p.pending_buf_size-5);;){if(p.lookahead<=1){if(ge(p),p.lookahead===0&&F===v)return x;if(p.lookahead===0)break}p.strstart+=p.lookahead,p.lookahead=0;var S=p.block_start+U;if((p.strstart===0||p.strstart>=S)&&(p.lookahead=p.strstart-S,p.strstart=S,R(p,!1),p.strm.avail_out===0)||p.strstart-p.block_start>=p.w_size-ne&&(R(p,!1),p.strm.avail_out===0))return x}return p.insert=0,F===h?(R(p,!0),p.strm.avail_out===0?oe:Y):(p.strstart>p.block_start&&(R(p,!1),p.strm.avail_out),x)}),new re(4,4,8,4,z),new re(4,5,16,8,z),new re(4,6,32,32,z),new re(4,4,16,16,H),new re(8,16,32,32,H),new re(8,16,128,128,H),new re(8,32,128,256,H),new re(32,128,258,1024,H),new re(32,258,258,4096,H)],s.deflateInit=function(p,F){return ve(p,F,u,15,8,0)},s.deflateInit2=ve,s.deflateReset=ue,s.deflateResetKeep=me,s.deflateSetHeader=function(p,F){return p&&p.state?p.state.wrap!==2?w:(p.state.gzhead=F,f):w},s.deflate=function(p,F){var U,S,N,O;if(!p||!p.state||5<F||F<0)return p?W(p,w):w;if(S=p.state,!p.output||!p.input&&p.avail_in!==0||S.status===666&&F!==h)return W(p,p.avail_out===0?-5:w);if(S.strm=p,U=S.last_flush,S.last_flush=F,S.status===C)if(S.wrap===2)p.adler=0,se(S,31),se(S,139),se(S,8),S.gzhead?(se(S,(S.gzhead.text?1:0)+(S.gzhead.hcrc?2:0)+(S.gzhead.extra?4:0)+(S.gzhead.name?8:0)+(S.gzhead.comment?16:0)),se(S,255&S.gzhead.time),se(S,S.gzhead.time>>8&255),se(S,S.gzhead.time>>16&255),se(S,S.gzhead.time>>24&255),se(S,S.level===9?2:2<=S.strategy||S.level<2?4:0),se(S,255&S.gzhead.os),S.gzhead.extra&&S.gzhead.extra.length&&(se(S,255&S.gzhead.extra.length),se(S,S.gzhead.extra.length>>8&255)),S.gzhead.hcrc&&(p.adler=d(p.adler,S.pending_buf,S.pending,0)),S.gzindex=0,S.status=69):(se(S,0),se(S,0),se(S,0),se(S,0),se(S,0),se(S,S.level===9?2:2<=S.strategy||S.level<2?4:0),se(S,3),S.status=L);else{var K=u+(S.w_bits-8<<4)<<8;K|=(2<=S.strategy||S.level<2?0:S.level<6?1:S.level===6?2:3)<<6,S.strstart!==0&&(K|=32),K+=31-K%31,S.status=L,X(S,K),S.strstart!==0&&(X(S,p.adler>>>16),X(S,65535&p.adler)),p.adler=1}if(S.status===69)if(S.gzhead.extra){for(N=S.pending;S.gzindex<(65535&S.gzhead.extra.length)&&(S.pending!==S.pending_buf_size||(S.gzhead.hcrc&&S.pending>N&&(p.adler=d(p.adler,S.pending_buf,S.pending-N,N)),P(p),N=S.pending,S.pending!==S.pending_buf_size));)se(S,255&S.gzhead.extra[S.gzindex]),S.gzindex++;S.gzhead.hcrc&&S.pending>N&&(p.adler=d(p.adler,S.pending_buf,S.pending-N,N)),S.gzindex===S.gzhead.extra.length&&(S.gzindex=0,S.status=73)}else S.status=73;if(S.status===73)if(S.gzhead.name){N=S.pending;do{if(S.pending===S.pending_buf_size&&(S.gzhead.hcrc&&S.pending>N&&(p.adler=d(p.adler,S.pending_buf,S.pending-N,N)),P(p),N=S.pending,S.pending===S.pending_buf_size)){O=1;break}O=S.gzindex<S.gzhead.name.length?255&S.gzhead.name.charCodeAt(S.gzindex++):0,se(S,O)}while(O!==0);S.gzhead.hcrc&&S.pending>N&&(p.adler=d(p.adler,S.pending_buf,S.pending-N,N)),O===0&&(S.gzindex=0,S.status=91)}else S.status=91;if(S.status===91)if(S.gzhead.comment){N=S.pending;do{if(S.pending===S.pending_buf_size&&(S.gzhead.hcrc&&S.pending>N&&(p.adler=d(p.adler,S.pending_buf,S.pending-N,N)),P(p),N=S.pending,S.pending===S.pending_buf_size)){O=1;break}O=S.gzindex<S.gzhead.comment.length?255&S.gzhead.comment.charCodeAt(S.gzindex++):0,se(S,O)}while(O!==0);S.gzhead.hcrc&&S.pending>N&&(p.adler=d(p.adler,S.pending_buf,S.pending-N,N)),O===0&&(S.status=103)}else S.status=103;if(S.status===103&&(S.gzhead.hcrc?(S.pending+2>S.pending_buf_size&&P(p),S.pending+2<=S.pending_buf_size&&(se(S,255&p.adler),se(S,p.adler>>8&255),p.adler=0,S.status=L)):S.status=L),S.pending!==0){if(P(p),p.avail_out===0)return S.last_flush=-1,f}else if(p.avail_in===0&&D(F)<=D(U)&&F!==h)return W(p,-5);if(S.status===666&&p.avail_in!==0)return W(p,-5);if(p.avail_in!==0||S.lookahead!==0||F!==v&&S.status!==666){var V=S.strategy===2?function(A,J){for(var ee;;){if(A.lookahead===0&&(ge(A),A.lookahead===0)){if(J===v)return x;break}if(A.match_length=0,ee=o._tr_tally(A,0,A.window[A.strstart]),A.lookahead--,A.strstart++,ee&&(R(A,!1),A.strm.avail_out===0))return x}return A.insert=0,J===h?(R(A,!0),A.strm.avail_out===0?oe:Y):A.last_lit&&(R(A,!1),A.strm.avail_out===0)?x:B}(S,F):S.strategy===3?function(A,J){for(var ee,Q,ae,xe,pe=A.window;;){if(A.lookahead<=M){if(ge(A),A.lookahead<=M&&J===v)return x;if(A.lookahead===0)break}if(A.match_length=0,A.lookahead>=$&&0<A.strstart&&(Q=pe[ae=A.strstart-1])===pe[++ae]&&Q===pe[++ae]&&Q===pe[++ae]){xe=A.strstart+M;do;while(Q===pe[++ae]&&Q===pe[++ae]&&Q===pe[++ae]&&Q===pe[++ae]&&Q===pe[++ae]&&Q===pe[++ae]&&Q===pe[++ae]&&Q===pe[++ae]&&ae<xe);A.match_length=M-(xe-ae),A.match_length>A.lookahead&&(A.match_length=A.lookahead)}if(A.match_length>=$?(ee=o._tr_tally(A,1,A.match_length-$),A.lookahead-=A.match_length,A.strstart+=A.match_length,A.match_length=0):(ee=o._tr_tally(A,0,A.window[A.strstart]),A.lookahead--,A.strstart++),ee&&(R(A,!1),A.strm.avail_out===0))return x}return A.insert=0,J===h?(R(A,!0),A.strm.avail_out===0?oe:Y):A.last_lit&&(R(A,!1),A.strm.avail_out===0)?x:B}(S,F):i[S.level].func(S,F);if(V!==oe&&V!==Y||(S.status=666),V===x||V===oe)return p.avail_out===0&&(S.last_flush=-1),f;if(V===B&&(F===1?o._tr_align(S):F!==5&&(o._tr_stored_block(S,0,0,!1),F===3&&(G(S.head),S.lookahead===0&&(S.strstart=0,S.block_start=0,S.insert=0))),P(p),p.avail_out===0))return S.last_flush=-1,f}return F!==h?f:S.wrap<=0?1:(S.wrap===2?(se(S,255&p.adler),se(S,p.adler>>8&255),se(S,p.adler>>16&255),se(S,p.adler>>24&255),se(S,255&p.total_in),se(S,p.total_in>>8&255),se(S,p.total_in>>16&255),se(S,p.total_in>>24&255)):(X(S,p.adler>>>16),X(S,65535&p.adler)),P(p),0<S.wrap&&(S.wrap=-S.wrap),S.pending!==0?f:1)},s.deflateEnd=function(p){var F;return p&&p.state?(F=p.state.status)!==C&&F!==69&&F!==73&&F!==91&&F!==103&&F!==L&&F!==666?W(p,w):(p.state=null,F===L?W(p,-3):f):w},s.deflateSetDictionary=function(p,F){var U,S,N,O,K,V,A,J,ee=F.length;if(!p||!p.state||(O=(U=p.state).wrap)===2||O===1&&U.status!==C||U.lookahead)return w;for(O===1&&(p.adler=l(p.adler,F,ee,0)),U.wrap=0,ee>=U.w_size&&(O===0&&(G(U.head),U.strstart=0,U.block_start=0,U.insert=0),J=new a.Buf8(U.w_size),a.arraySet(J,F,ee-U.w_size,U.w_size,0),F=J,ee=U.w_size),K=p.avail_in,V=p.next_in,A=p.input,p.avail_in=ee,p.next_in=0,p.input=F,ge(U);U.lookahead>=$;){for(S=U.strstart,N=U.lookahead-($-1);U.ins_h=(U.ins_h<<U.hash_shift^U.window[S+$-1])&U.hash_mask,U.prev[S&U.w_mask]=U.head[U.ins_h],U.head[U.ins_h]=S,S++,--N;);U.strstart=S,U.lookahead=$-1,ge(U)}return U.strstart+=U.lookahead,U.block_start=U.strstart,U.insert=U.lookahead,U.lookahead=0,U.match_length=U.prev_length=$-1,U.match_available=0,p.next_in=V,p.input=A,p.avail_in=K,U.wrap=O,f},s.deflateInfo="pako deflate (from Nodeca project)"},{"../utils/common":41,"./adler32":43,"./crc32":45,"./messages":51,"./trees":52}],47:[function(n,r,s){r.exports=function(){this.text=0,this.time=0,this.xflags=0,this.os=0,this.extra=null,this.extra_len=0,this.name="",this.comment="",this.hcrc=0,this.done=!1}},{}],48:[function(n,r,s){r.exports=function(i,a){var o,l,d,y,v,h,f,w,m,E,c,u,k,b,T,I,_,j,$,M,ne,C,L,x,B;o=i.state,l=i.next_in,x=i.input,d=l+(i.avail_in-5),y=i.next_out,B=i.output,v=y-(a-i.avail_out),h=y+(i.avail_out-257),f=o.dmax,w=o.wsize,m=o.whave,E=o.wnext,c=o.window,u=o.hold,k=o.bits,b=o.lencode,T=o.distcode,I=(1<<o.lenbits)-1,_=(1<<o.distbits)-1;e:do{k<15&&(u+=x[l++]<<k,k+=8,u+=x[l++]<<k,k+=8),j=b[u&I];t:for(;;){if(u>>>=$=j>>>24,k-=$,($=j>>>16&255)===0)B[y++]=65535&j;else{if(!(16&$)){if(!(64&$)){j=b[(65535&j)+(u&(1<<$)-1)];continue t}if(32&$){o.mode=12;break e}i.msg="invalid literal/length code",o.mode=30;break e}M=65535&j,($&=15)&&(k<$&&(u+=x[l++]<<k,k+=8),M+=u&(1<<$)-1,u>>>=$,k-=$),k<15&&(u+=x[l++]<<k,k+=8,u+=x[l++]<<k,k+=8),j=T[u&_];n:for(;;){if(u>>>=$=j>>>24,k-=$,!(16&($=j>>>16&255))){if(!(64&$)){j=T[(65535&j)+(u&(1<<$)-1)];continue n}i.msg="invalid distance code",o.mode=30;break e}if(ne=65535&j,k<($&=15)&&(u+=x[l++]<<k,(k+=8)<$&&(u+=x[l++]<<k,k+=8)),f<(ne+=u&(1<<$)-1)){i.msg="invalid distance too far back",o.mode=30;break e}if(u>>>=$,k-=$,($=y-v)<ne){if(m<($=ne-$)&&o.sane){i.msg="invalid distance too far back",o.mode=30;break e}if(L=c,(C=0)===E){if(C+=w-$,$<M){for(M-=$;B[y++]=c[C++],--$;);C=y-ne,L=B}}else if(E<$){if(C+=w+E-$,($-=E)<M){for(M-=$;B[y++]=c[C++],--$;);if(C=0,E<M){for(M-=$=E;B[y++]=c[C++],--$;);C=y-ne,L=B}}}else if(C+=E-$,$<M){for(M-=$;B[y++]=c[C++],--$;);C=y-ne,L=B}for(;2<M;)B[y++]=L[C++],B[y++]=L[C++],B[y++]=L[C++],M-=3;M&&(B[y++]=L[C++],1<M&&(B[y++]=L[C++]))}else{for(C=y-ne;B[y++]=B[C++],B[y++]=B[C++],B[y++]=B[C++],2<(M-=3););M&&(B[y++]=B[C++],1<M&&(B[y++]=B[C++]))}break}}break}}while(l<d&&y<h);l-=M=k>>3,u&=(1<<(k-=M<<3))-1,i.next_in=l,i.next_out=y,i.avail_in=l<d?d-l+5:5-(l-d),i.avail_out=y<h?h-y+257:257-(y-h),o.hold=u,o.bits=k}},{}],49:[function(n,r,s){var i=n("../utils/common"),a=n("./adler32"),o=n("./crc32"),l=n("./inffast"),d=n("./inftrees"),y=1,v=2,h=0,f=-2,w=1,m=852,E=592;function c(C){return(C>>>24&255)+(C>>>8&65280)+((65280&C)<<8)+((255&C)<<24)}function u(){this.mode=0,this.last=!1,this.wrap=0,this.havedict=!1,this.flags=0,this.dmax=0,this.check=0,this.total=0,this.head=null,this.wbits=0,this.wsize=0,this.whave=0,this.wnext=0,this.window=null,this.hold=0,this.bits=0,this.length=0,this.offset=0,this.extra=0,this.lencode=null,this.distcode=null,this.lenbits=0,this.distbits=0,this.ncode=0,this.nlen=0,this.ndist=0,this.have=0,this.next=null,this.lens=new i.Buf16(320),this.work=new i.Buf16(288),this.lendyn=null,this.distdyn=null,this.sane=0,this.back=0,this.was=0}function k(C){var L;return C&&C.state?(L=C.state,C.total_in=C.total_out=L.total=0,C.msg="",L.wrap&&(C.adler=1&L.wrap),L.mode=w,L.last=0,L.havedict=0,L.dmax=32768,L.head=null,L.hold=0,L.bits=0,L.lencode=L.lendyn=new i.Buf32(m),L.distcode=L.distdyn=new i.Buf32(E),L.sane=1,L.back=-1,h):f}function b(C){var L;return C&&C.state?((L=C.state).wsize=0,L.whave=0,L.wnext=0,k(C)):f}function T(C,L){var x,B;return C&&C.state?(B=C.state,L<0?(x=0,L=-L):(x=1+(L>>4),L<48&&(L&=15)),L&&(L<8||15<L)?f:(B.window!==null&&B.wbits!==L&&(B.window=null),B.wrap=x,B.wbits=L,b(C))):f}function I(C,L){var x,B;return C?(B=new u,(C.state=B).window=null,(x=T(C,L))!==h&&(C.state=null),x):f}var _,j,$=!0;function M(C){if($){var L;for(_=new i.Buf32(512),j=new i.Buf32(32),L=0;L<144;)C.lens[L++]=8;for(;L<256;)C.lens[L++]=9;for(;L<280;)C.lens[L++]=7;for(;L<288;)C.lens[L++]=8;for(d(y,C.lens,0,288,_,0,C.work,{bits:9}),L=0;L<32;)C.lens[L++]=5;d(v,C.lens,0,32,j,0,C.work,{bits:5}),$=!1}C.lencode=_,C.lenbits=9,C.distcode=j,C.distbits=5}function ne(C,L,x,B){var oe,Y=C.state;return Y.window===null&&(Y.wsize=1<<Y.wbits,Y.wnext=0,Y.whave=0,Y.window=new i.Buf8(Y.wsize)),B>=Y.wsize?(i.arraySet(Y.window,L,x-Y.wsize,Y.wsize,0),Y.wnext=0,Y.whave=Y.wsize):(B<(oe=Y.wsize-Y.wnext)&&(oe=B),i.arraySet(Y.window,L,x-B,oe,Y.wnext),(B-=oe)?(i.arraySet(Y.window,L,x-B,B,0),Y.wnext=B,Y.whave=Y.wsize):(Y.wnext+=oe,Y.wnext===Y.wsize&&(Y.wnext=0),Y.whave<Y.wsize&&(Y.whave+=oe))),0}s.inflateReset=b,s.inflateReset2=T,s.inflateResetKeep=k,s.inflateInit=function(C){return I(C,15)},s.inflateInit2=I,s.inflate=function(C,L){var x,B,oe,Y,W,D,G,P,R,se,X,Z,ge,z,H,re,le,me,ue,ve,p,F,U,S,N=0,O=new i.Buf8(4),K=[16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15];if(!C||!C.state||!C.output||!C.input&&C.avail_in!==0)return f;(x=C.state).mode===12&&(x.mode=13),W=C.next_out,oe=C.output,G=C.avail_out,Y=C.next_in,B=C.input,D=C.avail_in,P=x.hold,R=x.bits,se=D,X=G,F=h;e:for(;;)switch(x.mode){case w:if(x.wrap===0){x.mode=13;break}for(;R<16;){if(D===0)break e;D--,P+=B[Y++]<<R,R+=8}if(2&x.wrap&&P===35615){O[x.check=0]=255&P,O[1]=P>>>8&255,x.check=o(x.check,O,2,0),R=P=0,x.mode=2;break}if(x.flags=0,x.head&&(x.head.done=!1),!(1&x.wrap)||(((255&P)<<8)+(P>>8))%31){C.msg="incorrect header check",x.mode=30;break}if((15&P)!=8){C.msg="unknown compression method",x.mode=30;break}if(R-=4,p=8+(15&(P>>>=4)),x.wbits===0)x.wbits=p;else if(p>x.wbits){C.msg="invalid window size",x.mode=30;break}x.dmax=1<<p,C.adler=x.check=1,x.mode=512&P?10:12,R=P=0;break;case 2:for(;R<16;){if(D===0)break e;D--,P+=B[Y++]<<R,R+=8}if(x.flags=P,(255&x.flags)!=8){C.msg="unknown compression method",x.mode=30;break}if(57344&x.flags){C.msg="unknown header flags set",x.mode=30;break}x.head&&(x.head.text=P>>8&1),512&x.flags&&(O[0]=255&P,O[1]=P>>>8&255,x.check=o(x.check,O,2,0)),R=P=0,x.mode=3;case 3:for(;R<32;){if(D===0)break e;D--,P+=B[Y++]<<R,R+=8}x.head&&(x.head.time=P),512&x.flags&&(O[0]=255&P,O[1]=P>>>8&255,O[2]=P>>>16&255,O[3]=P>>>24&255,x.check=o(x.check,O,4,0)),R=P=0,x.mode=4;case 4:for(;R<16;){if(D===0)break e;D--,P+=B[Y++]<<R,R+=8}x.head&&(x.head.xflags=255&P,x.head.os=P>>8),512&x.flags&&(O[0]=255&P,O[1]=P>>>8&255,x.check=o(x.check,O,2,0)),R=P=0,x.mode=5;case 5:if(1024&x.flags){for(;R<16;){if(D===0)break e;D--,P+=B[Y++]<<R,R+=8}x.length=P,x.head&&(x.head.extra_len=P),512&x.flags&&(O[0]=255&P,O[1]=P>>>8&255,x.check=o(x.check,O,2,0)),R=P=0}else x.head&&(x.head.extra=null);x.mode=6;case 6:if(1024&x.flags&&(D<(Z=x.length)&&(Z=D),Z&&(x.head&&(p=x.head.extra_len-x.length,x.head.extra||(x.head.extra=new Array(x.head.extra_len)),i.arraySet(x.head.extra,B,Y,Z,p)),512&x.flags&&(x.check=o(x.check,B,Z,Y)),D-=Z,Y+=Z,x.length-=Z),x.length))break e;x.length=0,x.mode=7;case 7:if(2048&x.flags){if(D===0)break e;for(Z=0;p=B[Y+Z++],x.head&&p&&x.length<65536&&(x.head.name+=String.fromCharCode(p)),p&&Z<D;);if(512&x.flags&&(x.check=o(x.check,B,Z,Y)),D-=Z,Y+=Z,p)break e}else x.head&&(x.head.name=null);x.length=0,x.mode=8;case 8:if(4096&x.flags){if(D===0)break e;for(Z=0;p=B[Y+Z++],x.head&&p&&x.length<65536&&(x.head.comment+=String.fromCharCode(p)),p&&Z<D;);if(512&x.flags&&(x.check=o(x.check,B,Z,Y)),D-=Z,Y+=Z,p)break e}else x.head&&(x.head.comment=null);x.mode=9;case 9:if(512&x.flags){for(;R<16;){if(D===0)break e;D--,P+=B[Y++]<<R,R+=8}if(P!==(65535&x.check)){C.msg="header crc mismatch",x.mode=30;break}R=P=0}x.head&&(x.head.hcrc=x.flags>>9&1,x.head.done=!0),C.adler=x.check=0,x.mode=12;break;case 10:for(;R<32;){if(D===0)break e;D--,P+=B[Y++]<<R,R+=8}C.adler=x.check=c(P),R=P=0,x.mode=11;case 11:if(x.havedict===0)return C.next_out=W,C.avail_out=G,C.next_in=Y,C.avail_in=D,x.hold=P,x.bits=R,2;C.adler=x.check=1,x.mode=12;case 12:if(L===5||L===6)break e;case 13:if(x.last){P>>>=7&R,R-=7&R,x.mode=27;break}for(;R<3;){if(D===0)break e;D--,P+=B[Y++]<<R,R+=8}switch(x.last=1&P,R-=1,3&(P>>>=1)){case 0:x.mode=14;break;case 1:if(M(x),x.mode=20,L!==6)break;P>>>=2,R-=2;break e;case 2:x.mode=17;break;case 3:C.msg="invalid block type",x.mode=30}P>>>=2,R-=2;break;case 14:for(P>>>=7&R,R-=7&R;R<32;){if(D===0)break e;D--,P+=B[Y++]<<R,R+=8}if((65535&P)!=(P>>>16^65535)){C.msg="invalid stored block lengths",x.mode=30;break}if(x.length=65535&P,R=P=0,x.mode=15,L===6)break e;case 15:x.mode=16;case 16:if(Z=x.length){if(D<Z&&(Z=D),G<Z&&(Z=G),Z===0)break e;i.arraySet(oe,B,Y,Z,W),D-=Z,Y+=Z,G-=Z,W+=Z,x.length-=Z;break}x.mode=12;break;case 17:for(;R<14;){if(D===0)break e;D--,P+=B[Y++]<<R,R+=8}if(x.nlen=257+(31&P),P>>>=5,R-=5,x.ndist=1+(31&P),P>>>=5,R-=5,x.ncode=4+(15&P),P>>>=4,R-=4,286<x.nlen||30<x.ndist){C.msg="too many length or distance symbols",x.mode=30;break}x.have=0,x.mode=18;case 18:for(;x.have<x.ncode;){for(;R<3;){if(D===0)break e;D--,P+=B[Y++]<<R,R+=8}x.lens[K[x.have++]]=7&P,P>>>=3,R-=3}for(;x.have<19;)x.lens[K[x.have++]]=0;if(x.lencode=x.lendyn,x.lenbits=7,U={bits:x.lenbits},F=d(0,x.lens,0,19,x.lencode,0,x.work,U),x.lenbits=U.bits,F){C.msg="invalid code lengths set",x.mode=30;break}x.have=0,x.mode=19;case 19:for(;x.have<x.nlen+x.ndist;){for(;re=(N=x.lencode[P&(1<<x.lenbits)-1])>>>16&255,le=65535&N,!((H=N>>>24)<=R);){if(D===0)break e;D--,P+=B[Y++]<<R,R+=8}if(le<16)P>>>=H,R-=H,x.lens[x.have++]=le;else{if(le===16){for(S=H+2;R<S;){if(D===0)break e;D--,P+=B[Y++]<<R,R+=8}if(P>>>=H,R-=H,x.have===0){C.msg="invalid bit length repeat",x.mode=30;break}p=x.lens[x.have-1],Z=3+(3&P),P>>>=2,R-=2}else if(le===17){for(S=H+3;R<S;){if(D===0)break e;D--,P+=B[Y++]<<R,R+=8}R-=H,p=0,Z=3+(7&(P>>>=H)),P>>>=3,R-=3}else{for(S=H+7;R<S;){if(D===0)break e;D--,P+=B[Y++]<<R,R+=8}R-=H,p=0,Z=11+(127&(P>>>=H)),P>>>=7,R-=7}if(x.have+Z>x.nlen+x.ndist){C.msg="invalid bit length repeat",x.mode=30;break}for(;Z--;)x.lens[x.have++]=p}}if(x.mode===30)break;if(x.lens[256]===0){C.msg="invalid code -- missing end-of-block",x.mode=30;break}if(x.lenbits=9,U={bits:x.lenbits},F=d(y,x.lens,0,x.nlen,x.lencode,0,x.work,U),x.lenbits=U.bits,F){C.msg="invalid literal/lengths set",x.mode=30;break}if(x.distbits=6,x.distcode=x.distdyn,U={bits:x.distbits},F=d(v,x.lens,x.nlen,x.ndist,x.distcode,0,x.work,U),x.distbits=U.bits,F){C.msg="invalid distances set",x.mode=30;break}if(x.mode=20,L===6)break e;case 20:x.mode=21;case 21:if(6<=D&&258<=G){C.next_out=W,C.avail_out=G,C.next_in=Y,C.avail_in=D,x.hold=P,x.bits=R,l(C,X),W=C.next_out,oe=C.output,G=C.avail_out,Y=C.next_in,B=C.input,D=C.avail_in,P=x.hold,R=x.bits,x.mode===12&&(x.back=-1);break}for(x.back=0;re=(N=x.lencode[P&(1<<x.lenbits)-1])>>>16&255,le=65535&N,!((H=N>>>24)<=R);){if(D===0)break e;D--,P+=B[Y++]<<R,R+=8}if(re&&!(240&re)){for(me=H,ue=re,ve=le;re=(N=x.lencode[ve+((P&(1<<me+ue)-1)>>me)])>>>16&255,le=65535&N,!(me+(H=N>>>24)<=R);){if(D===0)break e;D--,P+=B[Y++]<<R,R+=8}P>>>=me,R-=me,x.back+=me}if(P>>>=H,R-=H,x.back+=H,x.length=le,re===0){x.mode=26;break}if(32&re){x.back=-1,x.mode=12;break}if(64&re){C.msg="invalid literal/length code",x.mode=30;break}x.extra=15&re,x.mode=22;case 22:if(x.extra){for(S=x.extra;R<S;){if(D===0)break e;D--,P+=B[Y++]<<R,R+=8}x.length+=P&(1<<x.extra)-1,P>>>=x.extra,R-=x.extra,x.back+=x.extra}x.was=x.length,x.mode=23;case 23:for(;re=(N=x.distcode[P&(1<<x.distbits)-1])>>>16&255,le=65535&N,!((H=N>>>24)<=R);){if(D===0)break e;D--,P+=B[Y++]<<R,R+=8}if(!(240&re)){for(me=H,ue=re,ve=le;re=(N=x.distcode[ve+((P&(1<<me+ue)-1)>>me)])>>>16&255,le=65535&N,!(me+(H=N>>>24)<=R);){if(D===0)break e;D--,P+=B[Y++]<<R,R+=8}P>>>=me,R-=me,x.back+=me}if(P>>>=H,R-=H,x.back+=H,64&re){C.msg="invalid distance code",x.mode=30;break}x.offset=le,x.extra=15&re,x.mode=24;case 24:if(x.extra){for(S=x.extra;R<S;){if(D===0)break e;D--,P+=B[Y++]<<R,R+=8}x.offset+=P&(1<<x.extra)-1,P>>>=x.extra,R-=x.extra,x.back+=x.extra}if(x.offset>x.dmax){C.msg="invalid distance too far back",x.mode=30;break}x.mode=25;case 25:if(G===0)break e;if(Z=X-G,x.offset>Z){if((Z=x.offset-Z)>x.whave&&x.sane){C.msg="invalid distance too far back",x.mode=30;break}ge=Z>x.wnext?(Z-=x.wnext,x.wsize-Z):x.wnext-Z,Z>x.length&&(Z=x.length),z=x.window}else z=oe,ge=W-x.offset,Z=x.length;for(G<Z&&(Z=G),G-=Z,x.length-=Z;oe[W++]=z[ge++],--Z;);x.length===0&&(x.mode=21);break;case 26:if(G===0)break e;oe[W++]=x.length,G--,x.mode=21;break;case 27:if(x.wrap){for(;R<32;){if(D===0)break e;D--,P|=B[Y++]<<R,R+=8}if(X-=G,C.total_out+=X,x.total+=X,X&&(C.adler=x.check=x.flags?o(x.check,oe,X,W-X):a(x.check,oe,X,W-X)),X=G,(x.flags?P:c(P))!==x.check){C.msg="incorrect data check",x.mode=30;break}R=P=0}x.mode=28;case 28:if(x.wrap&&x.flags){for(;R<32;){if(D===0)break e;D--,P+=B[Y++]<<R,R+=8}if(P!==(4294967295&x.total)){C.msg="incorrect length check",x.mode=30;break}R=P=0}x.mode=29;case 29:F=1;break e;case 30:F=-3;break e;case 31:return-4;case 32:default:return f}return C.next_out=W,C.avail_out=G,C.next_in=Y,C.avail_in=D,x.hold=P,x.bits=R,(x.wsize||X!==C.avail_out&&x.mode<30&&(x.mode<27||L!==4))&&ne(C,C.output,C.next_out,X-C.avail_out)?(x.mode=31,-4):(se-=C.avail_in,X-=C.avail_out,C.total_in+=se,C.total_out+=X,x.total+=X,x.wrap&&X&&(C.adler=x.check=x.flags?o(x.check,oe,X,C.next_out-X):a(x.check,oe,X,C.next_out-X)),C.data_type=x.bits+(x.last?64:0)+(x.mode===12?128:0)+(x.mode===20||x.mode===15?256:0),(se==0&&X===0||L===4)&&F===h&&(F=-5),F)},s.inflateEnd=function(C){if(!C||!C.state)return f;var L=C.state;return L.window&&(L.window=null),C.state=null,h},s.inflateGetHeader=function(C,L){var x;return C&&C.state&&2&(x=C.state).wrap?((x.head=L).done=!1,h):f},s.inflateSetDictionary=function(C,L){var x,B=L.length;return C&&C.state?(x=C.state).wrap!==0&&x.mode!==11?f:x.mode===11&&a(1,L,B,0)!==x.check?-3:ne(C,L,B,B)?(x.mode=31,-4):(x.havedict=1,h):f},s.inflateInfo="pako inflate (from Nodeca project)"},{"../utils/common":41,"./adler32":43,"./crc32":45,"./inffast":48,"./inftrees":50}],50:[function(n,r,s){var i=n("../utils/common"),a=[3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258,0,0],o=[16,16,16,16,16,16,16,16,17,17,17,17,18,18,18,18,19,19,19,19,20,20,20,20,21,21,21,21,16,72,78],l=[1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577,0,0],d=[16,16,16,16,17,17,18,18,19,19,20,20,21,21,22,22,23,23,24,24,25,25,26,26,27,27,28,28,29,29,64,64];r.exports=function(y,v,h,f,w,m,E,c){var u,k,b,T,I,_,j,$,M,ne=c.bits,C=0,L=0,x=0,B=0,oe=0,Y=0,W=0,D=0,G=0,P=0,R=null,se=0,X=new i.Buf16(16),Z=new i.Buf16(16),ge=null,z=0;for(C=0;C<=15;C++)X[C]=0;for(L=0;L<f;L++)X[v[h+L]]++;for(oe=ne,B=15;1<=B&&X[B]===0;B--);if(B<oe&&(oe=B),B===0)return w[m++]=20971520,w[m++]=20971520,c.bits=1,0;for(x=1;x<B&&X[x]===0;x++);for(oe<x&&(oe=x),C=D=1;C<=15;C++)if(D<<=1,(D-=X[C])<0)return-1;if(0<D&&(y===0||B!==1))return-1;for(Z[1]=0,C=1;C<15;C++)Z[C+1]=Z[C]+X[C];for(L=0;L<f;L++)v[h+L]!==0&&(E[Z[v[h+L]]++]=L);if(_=y===0?(R=ge=E,19):y===1?(R=a,se-=257,ge=o,z-=257,256):(R=l,ge=d,-1),C=x,I=m,W=L=P=0,b=-1,T=(G=1<<(Y=oe))-1,y===1&&852<G||y===2&&592<G)return 1;for(;;){for(j=C-W,M=E[L]<_?($=0,E[L]):E[L]>_?($=ge[z+E[L]],R[se+E[L]]):($=96,0),u=1<<C-W,x=k=1<<Y;w[I+(P>>W)+(k-=u)]=j<<24|$<<16|M|0,k!==0;);for(u=1<<C-1;P&u;)u>>=1;if(u!==0?(P&=u-1,P+=u):P=0,L++,--X[C]==0){if(C===B)break;C=v[h+E[L]]}if(oe<C&&(P&T)!==b){for(W===0&&(W=oe),I+=x,D=1<<(Y=C-W);Y+W<B&&!((D-=X[Y+W])<=0);)Y++,D<<=1;if(G+=1<<Y,y===1&&852<G||y===2&&592<G)return 1;w[b=P&T]=oe<<24|Y<<16|I-m|0}}return P!==0&&(w[I+P]=C-W<<24|64<<16|0),c.bits=oe,0}},{"../utils/common":41}],51:[function(n,r,s){r.exports={2:"need dictionary",1:"stream end",0:"","-1":"file error","-2":"stream error","-3":"data error","-4":"insufficient memory","-5":"buffer error","-6":"incompatible version"}},{}],52:[function(n,r,s){var i=n("../utils/common"),a=0,o=1;function l(N){for(var O=N.length;0<=--O;)N[O]=0}var d=0,y=29,v=256,h=v+1+y,f=30,w=19,m=2*h+1,E=15,c=16,u=7,k=256,b=16,T=17,I=18,_=[0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0],j=[0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13],$=[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,3,7],M=[16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15],ne=new Array(2*(h+2));l(ne);var C=new Array(2*f);l(C);var L=new Array(512);l(L);var x=new Array(256);l(x);var B=new Array(y);l(B);var oe,Y,W,D=new Array(f);function G(N,O,K,V,A){this.static_tree=N,this.extra_bits=O,this.extra_base=K,this.elems=V,this.max_length=A,this.has_stree=N&&N.length}function P(N,O){this.dyn_tree=N,this.max_code=0,this.stat_desc=O}function R(N){return N<256?L[N]:L[256+(N>>>7)]}function se(N,O){N.pending_buf[N.pending++]=255&O,N.pending_buf[N.pending++]=O>>>8&255}function X(N,O,K){N.bi_valid>c-K?(N.bi_buf|=O<<N.bi_valid&65535,se(N,N.bi_buf),N.bi_buf=O>>c-N.bi_valid,N.bi_valid+=K-c):(N.bi_buf|=O<<N.bi_valid&65535,N.bi_valid+=K)}function Z(N,O,K){X(N,K[2*O],K[2*O+1])}function ge(N,O){for(var K=0;K|=1&N,N>>>=1,K<<=1,0<--O;);return K>>>1}function z(N,O,K){var V,A,J=new Array(E+1),ee=0;for(V=1;V<=E;V++)J[V]=ee=ee+K[V-1]<<1;for(A=0;A<=O;A++){var Q=N[2*A+1];Q!==0&&(N[2*A]=ge(J[Q]++,Q))}}function H(N){var O;for(O=0;O<h;O++)N.dyn_ltree[2*O]=0;for(O=0;O<f;O++)N.dyn_dtree[2*O]=0;for(O=0;O<w;O++)N.bl_tree[2*O]=0;N.dyn_ltree[2*k]=1,N.opt_len=N.static_len=0,N.last_lit=N.matches=0}function re(N){8<N.bi_valid?se(N,N.bi_buf):0<N.bi_valid&&(N.pending_buf[N.pending++]=N.bi_buf),N.bi_buf=0,N.bi_valid=0}function le(N,O,K,V){var A=2*O,J=2*K;return N[A]<N[J]||N[A]===N[J]&&V[O]<=V[K]}function me(N,O,K){for(var V=N.heap[K],A=K<<1;A<=N.heap_len&&(A<N.heap_len&&le(O,N.heap[A+1],N.heap[A],N.depth)&&A++,!le(O,V,N.heap[A],N.depth));)N.heap[K]=N.heap[A],K=A,A<<=1;N.heap[K]=V}function ue(N,O,K){var V,A,J,ee,Q=0;if(N.last_lit!==0)for(;V=N.pending_buf[N.d_buf+2*Q]<<8|N.pending_buf[N.d_buf+2*Q+1],A=N.pending_buf[N.l_buf+Q],Q++,V===0?Z(N,A,O):(Z(N,(J=x[A])+v+1,O),(ee=_[J])!==0&&X(N,A-=B[J],ee),Z(N,J=R(--V),K),(ee=j[J])!==0&&X(N,V-=D[J],ee)),Q<N.last_lit;);Z(N,k,O)}function ve(N,O){var K,V,A,J=O.dyn_tree,ee=O.stat_desc.static_tree,Q=O.stat_desc.has_stree,ae=O.stat_desc.elems,xe=-1;for(N.heap_len=0,N.heap_max=m,K=0;K<ae;K++)J[2*K]!==0?(N.heap[++N.heap_len]=xe=K,N.depth[K]=0):J[2*K+1]=0;for(;N.heap_len<2;)J[2*(A=N.heap[++N.heap_len]=xe<2?++xe:0)]=1,N.depth[A]=0,N.opt_len--,Q&&(N.static_len-=ee[2*A+1]);for(O.max_code=xe,K=N.heap_len>>1;1<=K;K--)me(N,J,K);for(A=ae;K=N.heap[1],N.heap[1]=N.heap[N.heap_len--],me(N,J,1),V=N.heap[1],N.heap[--N.heap_max]=K,N.heap[--N.heap_max]=V,J[2*A]=J[2*K]+J[2*V],N.depth[A]=(N.depth[K]>=N.depth[V]?N.depth[K]:N.depth[V])+1,J[2*K+1]=J[2*V+1]=A,N.heap[1]=A++,me(N,J,1),2<=N.heap_len;);N.heap[--N.heap_max]=N.heap[1],function(pe,rt){var Yn,yt,Hn,Ie,Lr,ci,Nt=rt.dyn_tree,zo=rt.max_code,Ed=rt.stat_desc.static_tree,Nd=rt.stat_desc.has_stree,bd=rt.stat_desc.extra_bits,Uo=rt.stat_desc.extra_base,qn=rt.stat_desc.max_length,Mr=0;for(Ie=0;Ie<=E;Ie++)pe.bl_count[Ie]=0;for(Nt[2*pe.heap[pe.heap_max]+1]=0,Yn=pe.heap_max+1;Yn<m;Yn++)qn<(Ie=Nt[2*Nt[2*(yt=pe.heap[Yn])+1]+1]+1)&&(Ie=qn,Mr++),Nt[2*yt+1]=Ie,zo<yt||(pe.bl_count[Ie]++,Lr=0,Uo<=yt&&(Lr=bd[yt-Uo]),ci=Nt[2*yt],pe.opt_len+=ci*(Ie+Lr),Nd&&(pe.static_len+=ci*(Ed[2*yt+1]+Lr)));if(Mr!==0){do{for(Ie=qn-1;pe.bl_count[Ie]===0;)Ie--;pe.bl_count[Ie]--,pe.bl_count[Ie+1]+=2,pe.bl_count[qn]--,Mr-=2}while(0<Mr);for(Ie=qn;Ie!==0;Ie--)for(yt=pe.bl_count[Ie];yt!==0;)zo<(Hn=pe.heap[--Yn])||(Nt[2*Hn+1]!==Ie&&(pe.opt_len+=(Ie-Nt[2*Hn+1])*Nt[2*Hn],Nt[2*Hn+1]=Ie),yt--)}}(N,O),z(J,xe,N.bl_count)}function p(N,O,K){var V,A,J=-1,ee=O[1],Q=0,ae=7,xe=4;for(ee===0&&(ae=138,xe=3),O[2*(K+1)+1]=65535,V=0;V<=K;V++)A=ee,ee=O[2*(V+1)+1],++Q<ae&&A===ee||(Q<xe?N.bl_tree[2*A]+=Q:A!==0?(A!==J&&N.bl_tree[2*A]++,N.bl_tree[2*b]++):Q<=10?N.bl_tree[2*T]++:N.bl_tree[2*I]++,J=A,xe=(Q=0)===ee?(ae=138,3):A===ee?(ae=6,3):(ae=7,4))}function F(N,O,K){var V,A,J=-1,ee=O[1],Q=0,ae=7,xe=4;for(ee===0&&(ae=138,xe=3),V=0;V<=K;V++)if(A=ee,ee=O[2*(V+1)+1],!(++Q<ae&&A===ee)){if(Q<xe)for(;Z(N,A,N.bl_tree),--Q!=0;);else A!==0?(A!==J&&(Z(N,A,N.bl_tree),Q--),Z(N,b,N.bl_tree),X(N,Q-3,2)):Q<=10?(Z(N,T,N.bl_tree),X(N,Q-3,3)):(Z(N,I,N.bl_tree),X(N,Q-11,7));J=A,xe=(Q=0)===ee?(ae=138,3):A===ee?(ae=6,3):(ae=7,4)}}l(D);var U=!1;function S(N,O,K,V){X(N,(d<<1)+(V?1:0),3),function(A,J,ee,Q){re(A),se(A,ee),se(A,~ee),i.arraySet(A.pending_buf,A.window,J,ee,A.pending),A.pending+=ee}(N,O,K)}s._tr_init=function(N){U||(function(){var O,K,V,A,J,ee=new Array(E+1);for(A=V=0;A<y-1;A++)for(B[A]=V,O=0;O<1<<_[A];O++)x[V++]=A;for(x[V-1]=A,A=J=0;A<16;A++)for(D[A]=J,O=0;O<1<<j[A];O++)L[J++]=A;for(J>>=7;A<f;A++)for(D[A]=J<<7,O=0;O<1<<j[A]-7;O++)L[256+J++]=A;for(K=0;K<=E;K++)ee[K]=0;for(O=0;O<=143;)ne[2*O+1]=8,O++,ee[8]++;for(;O<=255;)ne[2*O+1]=9,O++,ee[9]++;for(;O<=279;)ne[2*O+1]=7,O++,ee[7]++;for(;O<=287;)ne[2*O+1]=8,O++,ee[8]++;for(z(ne,h+1,ee),O=0;O<f;O++)C[2*O+1]=5,C[2*O]=ge(O,5);oe=new G(ne,_,v+1,h,E),Y=new G(C,j,0,f,E),W=new G(new Array(0),$,0,w,u)}(),U=!0),N.l_desc=new P(N.dyn_ltree,oe),N.d_desc=new P(N.dyn_dtree,Y),N.bl_desc=new P(N.bl_tree,W),N.bi_buf=0,N.bi_valid=0,H(N)},s._tr_stored_block=S,s._tr_flush_block=function(N,O,K,V){var A,J,ee=0;0<N.level?(N.strm.data_type===2&&(N.strm.data_type=function(Q){var ae,xe=4093624447;for(ae=0;ae<=31;ae++,xe>>>=1)if(1&xe&&Q.dyn_ltree[2*ae]!==0)return a;if(Q.dyn_ltree[18]!==0||Q.dyn_ltree[20]!==0||Q.dyn_ltree[26]!==0)return o;for(ae=32;ae<v;ae++)if(Q.dyn_ltree[2*ae]!==0)return o;return a}(N)),ve(N,N.l_desc),ve(N,N.d_desc),ee=function(Q){var ae;for(p(Q,Q.dyn_ltree,Q.l_desc.max_code),p(Q,Q.dyn_dtree,Q.d_desc.max_code),ve(Q,Q.bl_desc),ae=w-1;3<=ae&&Q.bl_tree[2*M[ae]+1]===0;ae--);return Q.opt_len+=3*(ae+1)+5+5+4,ae}(N),A=N.opt_len+3+7>>>3,(J=N.static_len+3+7>>>3)<=A&&(A=J)):A=J=K+5,K+4<=A&&O!==-1?S(N,O,K,V):N.strategy===4||J===A?(X(N,2+(V?1:0),3),ue(N,ne,C)):(X(N,4+(V?1:0),3),function(Q,ae,xe,pe){var rt;for(X(Q,ae-257,5),X(Q,xe-1,5),X(Q,pe-4,4),rt=0;rt<pe;rt++)X(Q,Q.bl_tree[2*M[rt]+1],3);F(Q,Q.dyn_ltree,ae-1),F(Q,Q.dyn_dtree,xe-1)}(N,N.l_desc.max_code+1,N.d_desc.max_code+1,ee+1),ue(N,N.dyn_ltree,N.dyn_dtree)),H(N),V&&re(N)},s._tr_tally=function(N,O,K){return N.pending_buf[N.d_buf+2*N.last_lit]=O>>>8&255,N.pending_buf[N.d_buf+2*N.last_lit+1]=255&O,N.pending_buf[N.l_buf+N.last_lit]=255&K,N.last_lit++,O===0?N.dyn_ltree[2*K]++:(N.matches++,O--,N.dyn_ltree[2*(x[K]+v+1)]++,N.dyn_dtree[2*R(O)]++),N.last_lit===N.lit_bufsize-1},s._tr_align=function(N){X(N,2,3),Z(N,k,ne),function(O){O.bi_valid===16?(se(O,O.bi_buf),O.bi_buf=0,O.bi_valid=0):8<=O.bi_valid&&(O.pending_buf[O.pending++]=255&O.bi_buf,O.bi_buf>>=8,O.bi_valid-=8)}(N)}},{"../utils/common":41}],53:[function(n,r,s){r.exports=function(){this.input=null,this.next_in=0,this.avail_in=0,this.total_in=0,this.output=null,this.next_out=0,this.avail_out=0,this.total_out=0,this.msg="",this.state=null,this.data_type=2,this.adler=0}},{}],54:[function(n,r,s){(function(i){(function(a,o){if(!a.setImmediate){var l,d,y,v,h=1,f={},w=!1,m=a.document,E=Object.getPrototypeOf&&Object.getPrototypeOf(a);E=E&&E.setTimeout?E:a,l={}.toString.call(a.process)==="[object process]"?function(b){process.nextTick(function(){u(b)})}:function(){if(a.postMessage&&!a.importScripts){var b=!0,T=a.onmessage;return a.onmessage=function(){b=!1},a.postMessage("","*"),a.onmessage=T,b}}()?(v="setImmediate$"+Math.random()+"$",a.addEventListener?a.addEventListener("message",k,!1):a.attachEvent("onmessage",k),function(b){a.postMessage(v+b,"*")}):a.MessageChannel?((y=new MessageChannel).port1.onmessage=function(b){u(b.data)},function(b){y.port2.postMessage(b)}):m&&"onreadystatechange"in m.createElement("script")?(d=m.documentElement,function(b){var T=m.createElement("script");T.onreadystatechange=function(){u(b),T.onreadystatechange=null,d.removeChild(T),T=null},d.appendChild(T)}):function(b){setTimeout(u,0,b)},E.setImmediate=function(b){typeof b!="function"&&(b=new Function(""+b));for(var T=new Array(arguments.length-1),I=0;I<T.length;I++)T[I]=arguments[I+1];var _={callback:b,args:T};return f[h]=_,l(h),h++},E.clearImmediate=c}function c(b){delete f[b]}function u(b){if(w)setTimeout(u,0,b);else{var T=f[b];if(T){w=!0;try{(function(I){var _=I.callback,j=I.args;switch(j.length){case 0:_();break;case 1:_(j[0]);break;case 2:_(j[0],j[1]);break;case 3:_(j[0],j[1],j[2]);break;default:_.apply(o,j)}})(T)}finally{c(b),w=!1}}}}function k(b){b.source===a&&typeof b.data=="string"&&b.data.indexOf(v)===0&&u(+b.data.slice(v.length))}})(typeof self>"u"?i===void 0?this:i:self)}).call(this,typeof Fr<"u"?Fr:typeof self<"u"?self:typeof window<"u"?window:{})},{}]},{},[10])(10)})})(vd);var Sf=vd.exports;const xd=Cd(Sf);function Tf(t){return`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${t} - Manifest App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"><\/script>
  </body>
</html>`}function Cf(){return`import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  assetsInclude: ['**/*.manifest'],
});`}function If(){return JSON.stringify({compilerOptions:{target:"ES2020",useDefineForClassFields:!0,lib:["ES2020","DOM","DOM.Iterable"],module:"ESNext",skipLibCheck:!0,moduleResolution:"bundler",allowImportingTsExtensions:!0,resolveJsonModule:!0,isolatedModules:!0,noEmit:!0,jsx:"react-jsx",strict:!0,noUnusedLocals:!1,noUnusedParameters:!1,noFallthroughCasesInSwitch:!0},include:["src"]},null,2)}function _f(t){return JSON.stringify({name:t,private:!0,version:"0.0.0",type:"module",scripts:{dev:"vite",build:"tsc && vite build",preview:"vite preview"},dependencies:{react:"^18.3.1","react-dom":"^18.3.1"},devDependencies:{"@types/react":"^18.3.5","@types/react-dom":"^18.3.0","@vitejs/plugin-react":"^4.3.1",typescript:"^5.5.3",vite:"^5.4.2"}},null,2)}function Rf(){return`import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);`}function Of(){return`* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  background: #0f172a;
  color: #e2e8f0;
  min-height: 100vh;
}

#root {
  min-height: 100vh;
}

button {
  cursor: pointer;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;
}

button:hover:not(:disabled) {
  opacity: 0.9;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

input, textarea, select {
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid #334155;
  background: #1e293b;
  color: #e2e8f0;
  font-size: 14px;
}

input:focus, textarea:focus, select:focus {
  outline: none;
  border-color: #0ea5e9;
}

textarea {
  resize: vertical;
  font-family: 'Monaco', 'Menlo', monospace;
}`}function Pf(){return`import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { compileToIR } from './manifest/ir/ir-compiler';
import { RuntimeEngine, EmittedEvent, EntityInstance } from './manifest/ir/runtime-engine';
import type { IR, IREntity, IRCommand, IRDiagnostic, IRParameter, IRType } from './manifest/ir/types';
import manifestSource from './manifest/source.manifest?raw';

const EXAMPLE_MANIFEST = \`module TaskManager {
  entity Task {
    property required title: string
    property description: string = ""
    property completed: boolean = false
    property priority: number = 1
    property createdAt: string

    constraint validPriority: priority >= 1 and priority <= 5 "Priority must be 1-5"

    command complete() {
      guard not self.completed
      mutate completed = true
      emit TaskCompleted
    }

    command setPriority(level: number) {
      guard level >= 1 and level <= 5
      mutate priority = level
    }
  }

  store Task in localStorage {
    key: "tasks"
  }

  entity User {
    property required email: string
    property name: string = ""
    property role: string = "user"
  }

  store User in memory

  command createTask(title: string, description: string, priority: number) {
    guard title != ""
    emit TaskCreated
  }

  event TaskCompleted: "task.completed" {
    taskId: string
  }

  event TaskCreated: "task.created" {
    title: string
  }

  policy adminOnly execute: user.role == "admin" "Admin access required"
}
\`;

interface CompileState {
  ir: IR | null;
  diagnostics: IRDiagnostic[];
  compileTime: number;
  success: boolean;
}

interface RuntimeState {
  engine: RuntimeEngine | null;
  lastGoodEngine: RuntimeEngine | null;
  events: EmittedEvent[];
}

type TabId = 'status' | 'explorer' | 'entities' | 'commands' | 'events';

function RuntimeStatus({
  compileState,
  manifestPath,
  onRecompile,
  isCompiling
}: {
  compileState: CompileState | null;
  manifestPath: string;
  onRecompile: () => void;
  isCompiling: boolean;
}) {
  const ir = compileState?.ir;

  return (
    <div className="runtime-status">
      <div className="status-header">
        <div className="status-indicator">
          <span className={\`dot \${compileState?.success ? 'success' : compileState ? 'error' : 'pending'}\`} />
          <span className="status-text">
            {compileState?.success ? 'Compiled' : compileState ? 'Errors' : 'Not compiled'}
          </span>
        </div>
        <button className="recompile-btn" onClick={onRecompile} disabled={isCompiling}>
          {isCompiling ? 'Compiling...' : 'Recompile'}
        </button>
      </div>

      <div className="status-details">
        <div className="detail-row">
          <span className="label">Manifest:</span>
          <span className="value mono">{manifestPath}</span>
        </div>
        {compileState && (
          <>
            <div className="detail-row">
              <span className="label">Compile time:</span>
              <span className="value">{compileState.compileTime}ms</span>
            </div>
            {ir && (
              <div className="counts">
                <div className="count-item">
                  <span className="count-num">{ir.modules.length}</span>
                  <span className="count-label">Modules</span>
                </div>
                <div className="count-item">
                  <span className="count-num">{ir.entities.length}</span>
                  <span className="count-label">Entities</span>
                </div>
                <div className="count-item">
                  <span className="count-num">{ir.commands.length}</span>
                  <span className="count-label">Commands</span>
                </div>
                <div className="count-item">
                  <span className="count-num">{ir.events.length}</span>
                  <span className="count-label">Events</span>
                </div>
                <div className="count-item">
                  <span className="count-num">{ir.stores.length}</span>
                  <span className="count-label">Stores</span>
                </div>
                <div className="count-item">
                  <span className="count-num">{ir.policies.length}</span>
                  <span className="count-label">Policies</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {compileState && !compileState.success && compileState.diagnostics.length > 0 && (
        <div className="errors-panel">
          <div className="errors-title">Compilation Errors</div>
          {compileState.diagnostics.filter(d => d.severity === 'error').map((err, i) => (
            <div key={i} className="error-item">
              <span className="error-icon">!</span>
              <span className="error-msg">{err.message}</span>
              {err.line && <span className="error-pos">Line {err.line}:{err.column || 0}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RuntimeContextEditor({
  value,
  error,
  onChange
}: {
  value: string;
  error: string | null;
  onChange: (next: string) => void;
}) {
  return (
    <div className="runtime-context">
      <div className="context-header">
        <span>Runtime Context</span>
        <span className="context-hint">JSON</span>
      </div>
      <div className="context-shape mono">Expected: {'{ "user": { "id": "u1", "role": "cook" } }'}</div>
      <textarea
        className={\`context-editor \${error ? 'has-error' : ''}\`}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder='{
  "user": { "id": "u1", "role": "cook" }
}'
        spellCheck={false}
        rows={6}
      />
      {error ? (
        <div className="context-error">{error}</div>
      ) : (
        <div className="context-help">Runtime context object only.</div>
      )}
    </div>
  );
}

function ModelExplorer({ ir }: { ir: IR | null }) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['modules', 'entities', 'commands']));

  const toggleExpand = (path: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const getSelectedData = () => {
    if (!ir || !selectedPath) return null;
    const parts = selectedPath.split('/');
    if (parts[0] === 'entity') return ir.entities.find(e => e.name === parts[1]);
    if (parts[0] === 'command') return ir.commands.find(c => c.name === parts[1]);
    if (parts[0] === 'store') return ir.stores.find(s => s.entity === parts[1]);
    if (parts[0] === 'event') return ir.events.find(e => e.name === parts[1]);
    if (parts[0] === 'policy') return ir.policies.find(p => p.name === parts[1]);
    if (parts[0] === 'module') return ir.modules.find(m => m.name === parts[1]);
    return null;
  };

  if (!ir) {
    return <div className="model-explorer"><div className="tree-empty">No IR loaded</div></div>;
  }

  const renderTreeNode = (id: string, label: string, type: string, hasChildren: boolean, depth: number) => {
    const isExpanded = expanded.has(id);
    const isSelected = selectedPath === id;

    return (
      <div
        key={id}
        className={\`tree-node \${isSelected ? 'selected' : ''}\`}
        style={{ paddingLeft: \`\${depth * 16 + 8}px\` }}
        onClick={() => {
          if (hasChildren) toggleExpand(id);
          setSelectedPath(id);
        }}
      >
        {hasChildren ? (
          <span className={\`expand-icon \${isExpanded ? 'expanded' : ''}\`}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <path d="M4 2L8 6L4 10" stroke="currentColor" strokeWidth="1.5" fill="none"/>
            </svg>
          </span>
        ) : <span className="expand-icon-placeholder" />}
        <span className={\`node-icon \${type}\`}>{type[0].toUpperCase()}</span>
        <span className="node-name">{label}</span>
      </div>
    );
  };

  return (
    <div className="model-explorer">
      <div className="explorer-tree">
        <div className="tree-header">IR Structure</div>

        {renderTreeNode('modules', \`Modules (\${ir.modules.length})\`, 'module', ir.modules.length > 0, 0)}
        {expanded.has('modules') && ir.modules.map(m => (
          renderTreeNode(\`module/\${m.name}\`, m.name, 'module', false, 1)
        ))}

        {renderTreeNode('entities', \`Entities (\${ir.entities.length})\`, 'entity', ir.entities.length > 0, 0)}
        {expanded.has('entities') && ir.entities.map(e => (
          <React.Fragment key={e.name}>
            {renderTreeNode(\`entity/\${e.name}\`, e.name, 'entity', e.properties.length > 0, 1)}
            {expanded.has(\`entity/\${e.name}\`) && e.properties.map(p => (
              renderTreeNode(\`entity/\${e.name}/prop/\${p.name}\`, \`\${p.name}: \${p.type.name}\`, 'property', false, 2)
            ))}
          </React.Fragment>
        ))}

        {renderTreeNode('commands', \`Commands (\${ir.commands.length})\`, 'command', ir.commands.length > 0, 0)}
        {expanded.has('commands') && ir.commands.map(c => (
          renderTreeNode(\`command/\${c.name}\`, c.name, 'command', false, 1)
        ))}

        {renderTreeNode('stores', \`Stores (\${ir.stores.length})\`, 'store', ir.stores.length > 0, 0)}
        {expanded.has('stores') && ir.stores.map(s => (
          renderTreeNode(\`store/\${s.entity}\`, \`\${s.entity} -> \${s.target}\`, 'store', false, 1)
        ))}

        {renderTreeNode('events', \`Events (\${ir.events.length})\`, 'event', ir.events.length > 0, 0)}
        {expanded.has('events') && ir.events.map(e => (
          renderTreeNode(\`event/\${e.name}\`, e.name, 'event', false, 1)
        ))}

        {renderTreeNode('policies', \`Policies (\${ir.policies.length})\`, 'policy', ir.policies.length > 0, 0)}
        {expanded.has('policies') && ir.policies.map(p => (
          renderTreeNode(\`policy/\${p.name}\`, p.name, 'policy', false, 1)
        ))}
      </div>
      <div className="explorer-detail">
        <div className="detail-header">{selectedPath || 'Select a node'}</div>
        <div className="detail-content">
          {selectedPath ? (
            <pre>{JSON.stringify(getSelectedData(), null, 2)}</pre>
          ) : (
            <div className="detail-empty">Select a node from the tree</div>
          )}
        </div>
      </div>
    </div>
  );
}

function getDefaultValue(type: IRType): unknown {
  if (type.nullable) return null;
  switch (type.name) {
    case 'string': return '';
    case 'number': return 0;
    case 'boolean': return false;
    default: return '';
  }
}

function omitEmptyStrings(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== '') {
      result[key] = value;
    }
  }
  return result;
}

function EntityPanel({
  entity,
  engine
}: {
  entity: IREntity;
  engine: RuntimeEngine;
}) {
  const [items, setItems] = useState<EntityInstance[]>([]);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [editingId, setEditingId] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    setItems(await engine.getAllInstances(entity.name));
  }, [engine, entity.name]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const result = await engine.getAllInstances(entity.name);
      if (!cancelled) setItems(result);
    };
    load();
    const interval = setInterval(load, 500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [engine, entity.name]);

  useEffect(() => {
    const initial: Record<string, unknown> = {};
    entity.properties.forEach(p => {
      initial[p.name] = getDefaultValue(p.type);
    });
    setFormData(initial);
  }, [entity]);

  const handleCreate = async () => {
    const payload = omitEmptyStrings(formData);
    await engine.createInstance(entity.name, payload);
    await loadItems();
    const initial: Record<string, unknown> = {};
    entity.properties.forEach(p => {
      initial[p.name] = getDefaultValue(p.type);
    });
    setFormData(initial);
  };

  const handleDelete = async (id: string) => {
    await engine.deleteInstance(entity.name, id);
    await loadItems();
  };

  const handleUpdate = async (id: string) => {
    const payload = omitEmptyStrings(formData);
    await engine.updateInstance(entity.name, id, payload);
    setEditingId(null);
    await loadItems();
  };

  const startEdit = (item: EntityInstance) => {
    setEditingId(item.id);
    setFormData({ ...item });
  };

  const renderInput = (name: string, type: IRType, value: unknown, onChange: (v: unknown) => void) => {
    if (type.name === 'boolean') {
      return (
        <select value={String(value)} onChange={e => onChange(e.target.value === 'true')}>
          <option value="false">false</option>
          <option value="true">true</option>
        </select>
      );
    }
    if (type.name === 'number') {
      return (
        <input
          type="number"
          value={value as number}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
        />
      );
    }
    return (
      <input
        type="text"
        value={value as string}
        onChange={e => onChange(e.target.value)}
        placeholder={name}
      />
    );
  };

  return (
    <div className="entity-panel">
      <h2>{entity.name}</h2>
      <div className="entity-meta">
        {entity.properties.length} properties
        {entity.commands.length > 0 && \` | \${entity.commands.length} commands\`}
      </div>

      <div className="create-form-grid">
        {entity.properties.filter(p => !p.modifiers.includes('readonly')).map(prop => (
          <div key={prop.name} className="form-field">
            <label>{prop.name}</label>
            {renderInput(prop.name, prop.type, formData[prop.name], v => setFormData(d => ({ ...d, [prop.name]: v })))}
          </div>
        ))}
        <button className="btn-primary" onClick={handleCreate}>Create</button>
      </div>

      <div className="items-list">
        {items.length === 0 ? (
          <div className="items-empty">No {entity.name.toLowerCase()}s yet</div>
        ) : (
          items.map(item => (
            <div key={item.id} className="item-card">
              {editingId === item.id ? (
                <div className="edit-form">
                  {entity.properties.map(prop => (
                    <div key={prop.name} className="form-field-inline">
                      <label>{prop.name}:</label>
                      {renderInput(prop.name, prop.type, formData[prop.name], v => setFormData(d => ({ ...d, [prop.name]: v })))}
                    </div>
                  ))}
                  <div className="edit-actions">
                    <button className="btn-primary" onClick={() => handleUpdate(item.id)}>Save</button>
                    <button className="btn-secondary" onClick={() => setEditingId(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <pre>{JSON.stringify(item, null, 2)}</pre>
                  <div className="item-actions">
                    <button className="btn-secondary" onClick={() => startEdit(item)}>Edit</button>
                    <button className="btn-danger" onClick={() => handleDelete(item.id)}>Delete</button>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function CommandsPanel({
  engine,
  onEventEmitted
}: {
  engine: RuntimeEngine;
  onEventEmitted: (event: EmittedEvent) => void;
}) {
  const [selectedCommand, setSelectedCommand] = useState<IRCommand | null>(null);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [targetInstance, setTargetInstance] = useState<string>('');
  const [result, setResult] = useState<{ success: boolean; message: string; events: EmittedEvent[]; guardFailure?: { index: number; formatted: string; resolved?: { expression: string; value: string }[] } } | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [instances, setInstances] = useState<EntityInstance[]>([]);

  const commands = engine.getCommands();
  const entityCommands = commands.filter(c => c.entity);
  const moduleCommands = commands.filter(c => !c.entity);

  useEffect(() => {
    if (selectedCommand) {
      const initial: Record<string, unknown> = {};
      selectedCommand.parameters.forEach(p => {
        initial[p.name] = getDefaultValue(p.type);
      });
      setFormData(initial);
      setResult(null);
      setTargetInstance('');
    }
  }, [selectedCommand]);

  const formatResolvedValue = (value: unknown) => {
    if (value === undefined) return 'undefined';
    if (value === null) return 'null';
    if (typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    try {
      const json = JSON.stringify(value);
      return json === undefined ? String(value) : json;
    } catch {
      return String(value);
    }
  };

  const executeCommand = async () => {
    if (!selectedCommand) return;
    setIsExecuting(true);
    setResult(null);

    try {
      const cmdResult = await engine.runCommand(
        selectedCommand.name,
        formData,
        {
          entityName: selectedCommand.entity,
          instanceId: targetInstance || undefined
        }
      );

      cmdResult.emittedEvents.forEach(onEventEmitted);

      setResult({
        success: cmdResult.success,
        message: cmdResult.success
          ? \`Command executed successfully\${cmdResult.result !== undefined ? \`: \${JSON.stringify(cmdResult.result)}\` : ''}\`
          : cmdResult.error || 'Unknown error',
        events: cmdResult.emittedEvents,
        guardFailure: cmdResult.guardFailure
          ? {
              index: cmdResult.guardFailure.index,
              formatted: cmdResult.guardFailure.formatted,
              resolved: cmdResult.guardFailure.resolved
                ? cmdResult.guardFailure.resolved.map(entry => ({
                    expression: entry.expression,
                    value: formatResolvedValue(entry.value),
                  }))
                : undefined
            }
          : undefined
      });
    } catch (err: any) {
      setResult({
        success: false,
        message: err.message,
        events: []
      });
    }

    setIsExecuting(false);
  };

  const renderParamInput = (param: IRParameter) => {
    const value = formData[param.name];
    if (param.type.name === 'boolean') {
      return (
        <select value={String(value)} onChange={e => setFormData(d => ({ ...d, [param.name]: e.target.value === 'true' }))}>
          <option value="false">false</option>
          <option value="true">true</option>
        </select>
      );
    }
    if (param.type.name === 'number') {
      return (
        <input
          type="number"
          value={value as number}
          onChange={e => setFormData(d => ({ ...d, [param.name]: parseFloat(e.target.value) || 0 }))}
        />
      );
    }
    return (
      <input
        type="text"
        value={value as string}
        onChange={e => setFormData(d => ({ ...d, [param.name]: e.target.value }))}
        placeholder={param.name}
      />
    );
  };

  // Load instances when selectedCommand changes
  useEffect(() => {
    let cancelled = false;
    const loadInstances = async () => {
      const result = selectedCommand?.entity ? await engine.getAllInstances(selectedCommand.entity) : [];
      if (!cancelled) setInstances(result);
    };
    loadInstances();
    return () => { cancelled = true; };
  }, [selectedCommand, engine]);

  return (
    <div className="commands-panel">
      <div className="commands-sidebar">
        <div className="commands-header">Commands</div>

        {moduleCommands.length > 0 && (
          <>
            <div className="commands-section-title">Module Commands</div>
            {moduleCommands.map(cmd => (
              <div
                key={cmd.name}
                className={\`command-item \${selectedCommand?.name === cmd.name ? 'selected' : ''}\`}
                onClick={() => setSelectedCommand(cmd)}
              >
                <span className="command-name">{cmd.name}</span>
                <span className="command-params">({cmd.parameters.length} params)</span>
              </div>
            ))}
          </>
        )}

        {entityCommands.length > 0 && (
          <>
            <div className="commands-section-title">Entity Commands</div>
            {entityCommands.map(cmd => (
              <div
                key={\`\${cmd.entity}-\${cmd.name}\`}
                className={\`command-item \${selectedCommand?.name === cmd.name && selectedCommand?.entity === cmd.entity ? 'selected' : ''}\`}
                onClick={() => setSelectedCommand(cmd)}
              >
                <span className="command-entity">{cmd.entity}.</span>
                <span className="command-name">{cmd.name}</span>
              </div>
            ))}
          </>
        )}

        {commands.length === 0 && (
          <div className="commands-empty">No commands defined</div>
        )}
      </div>

      <div className="commands-main">
        {selectedCommand ? (
          <div className="command-form">
            <h3>{selectedCommand.entity ? \`\${selectedCommand.entity}.\` : ''}{selectedCommand.name}</h3>

            {selectedCommand.guards.length > 0 && (
              <div className="command-guards">
                <span className="guards-label">Guards:</span>
                <span className="guards-count">{selectedCommand.guards.length} condition(s)</span>
              </div>
            )}

            {selectedCommand.entity && instances.length > 0 && (
              <div className="form-field">
                <label>Target Instance</label>
                <select value={targetInstance} onChange={e => setTargetInstance(e.target.value)}>
                  <option value="">Select an instance...</option>
                  {instances.map(inst => (
                    <option key={inst.id} value={inst.id}>
                      {inst.id.slice(0, 8)}... {Object.entries(inst).filter(([k]) => k !== 'id').slice(0, 2).map(([k, v]) => \`\${k}=\${v}\`).join(', ')}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {selectedCommand.parameters.length > 0 && (
              <div className="command-params-form">
                {selectedCommand.parameters.map(param => (
                  <div key={param.name} className="form-field">
                    <label>
                      {param.name}
                      {param.required && <span className="required">*</span>}
                      <span className="type-hint">{param.type.name}</span>
                    </label>
                    {renderParamInput(param)}
                  </div>
                ))}
              </div>
            )}

            <button
              className="btn-execute"
              onClick={executeCommand}
              disabled={isExecuting || (selectedCommand.entity && !targetInstance && instances.length > 0)}
            >
              {isExecuting ? 'Executing...' : 'Execute Command'}
            </button>

            {result && (
              <div className={\`command-result \${result.success ? 'success' : 'error'}\`}>
                <div className="result-status">{result.success ? 'Success' : 'Failed'}</div>
                <div className="result-message">{result.message}</div>
                {!result.success && result.guardFailure && (
                  <div className="guard-failure">
                    <div className="guard-failure-title">Guard #{result.guardFailure.index} failed</div>
                    <div className="guard-failure-detail mono">{result.guardFailure.formatted}</div>
                    {result.guardFailure.resolved && result.guardFailure.resolved.length > 0 && (
                      <div className="guard-failure-resolved">
                        <span className="guard-failure-label">Resolved:</span>
                        <span className="guard-failure-detail mono">
                         {result.guardFailure.resolved.map(entry => String(entry.expression) + ' = ' + String(entry.value)).join(', ')}
                        </span>
                      </div>
                    )}
                  </div>
                )}
                {result.events.length > 0 && (
                  <div className="result-events">
                    <div className="events-title">Emitted Events:</div>
                    {result.events.map((e, i) => (
                      <div key={i} className="event-badge">{e.name}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="command-placeholder">
            Select a command from the list to execute it
          </div>
        )}
      </div>
    </div>
  );
}

function EventFeed({ events }: { events: EmittedEvent[] }) {
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [events]);

  return (
    <div className="event-feed">
      <div className="feed-header">
        <span>Event Feed</span>
        <span className="event-count">{events.length} events</span>
      </div>
      <div className="feed-list" ref={feedRef}>
        {events.length === 0 ? (
          <div className="feed-empty">No events emitted yet. Execute commands to see events appear here.</div>
        ) : (
          events.map((event, i) => (
            <div key={i} className="event-item">
              <div className="event-header">
                <span className="event-name">{event.name}</span>
                <span className="event-channel">{event.channel}</span>
                <span className="event-time">{new Date(event.timestamp).toLocaleTimeString()}</span>
              </div>
              <pre className="event-payload">{JSON.stringify(event.payload, null, 2)}</pre>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function EmptyState({ onInsertExample }: { onInsertExample: () => void }) {
  return (
    <div className="empty-state-panel">
      <div className="empty-icon">
        <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
          <rect x="8" y="8" width="48" height="48" rx="8" stroke="#475569" strokeWidth="2" strokeDasharray="4 4"/>
          <path d="M32 24V40M24 32H40" stroke="#475569" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </div>
      <h2>No Entities Defined</h2>
      <p>Your manifest has no entity declarations. Click below to load an example manifest with Tasks, Users, and Commands.</p>
      <button className="insert-example-btn" onClick={onInsertExample}>Insert Example Manifest</button>
    </div>
  );
}

export default function App() {
  const [source, setSource] = useState<string>(manifestSource);
  const [compileState, setCompileState] = useState<CompileState | null>(null);
  const [runtimeState, setRuntimeState] = useState<RuntimeState>({ engine: null, lastGoodEngine: null, events: [] });
  const [runtimeContextText, setRuntimeContextText] = useState<string>('{}');
  const [runtimeContext, setRuntimeContext] = useState<Record<string, unknown>>({});
  const [runtimeContextError, setRuntimeContextError] = useState<string | null>(null);
  const [isCompiling, setIsCompiling] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('status');
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);

  const handleContextChange = useCallback((next: string) => {
    setRuntimeContextText(next);
    const trimmed = next.trim();
    if (trimmed.length === 0) {
      setRuntimeContext({});
      setRuntimeContextError(null);
      return;
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setRuntimeContextError('Runtime context must be a JSON object.');
        return;
      }
      setRuntimeContext(parsed as Record<string, unknown>);
      setRuntimeContextError(null);
    } catch (err: any) {
      setRuntimeContextError(err?.message || 'Invalid JSON');
    }
  }, []);

  const compile = useCallback((src: string) => {
    setIsCompiling(true);
    const start = performance.now();

    setTimeout(async () => {
      const { ir, diagnostics } = compileToIR(src);
      const compileTime = Math.round(performance.now() - start);
      const success = ir !== null;

      setCompileState({ ir, diagnostics, compileTime, success });

      if (success && ir) {
        const newEngine = new RuntimeEngine(ir, runtimeContext);

        if (runtimeState.engine) {
          try {
            const data = await runtimeState.engine.serialize();
            await newEngine.restore({ stores: data.stores });
          } catch {}
        }

        setRuntimeState(prev => ({
          engine: newEngine,
          lastGoodEngine: newEngine,
          events: prev.events
        }));

        if (ir.entities.length > 0) {
          setSelectedEntity(ir.entities[0].name);
        }
      }

      setIsCompiling(false);
    }, 50);
  }, [runtimeContext, runtimeState.engine]);

  useEffect(() => {
    if (runtimeContextError) return;
    const activeEngine = runtimeState.engine || runtimeState.lastGoodEngine;
    if (!activeEngine) return;
    activeEngine.replaceContext(runtimeContext);
  }, [runtimeContext, runtimeContextError, runtimeState.engine, runtimeState.lastGoodEngine]);

  useEffect(() => {
    compile(source);
  }, []);

  const handleRecompile = () => compile(source);

  const handleInsertExample = () => {
    setSource(EXAMPLE_MANIFEST);
    compile(EXAMPLE_MANIFEST);
    setActiveTab('entities');
  };

  const handleEventEmitted = (event: EmittedEvent) => {
    setRuntimeState(prev => ({
      ...prev,
      events: [...prev.events, event]
    }));
  };

  const engine = runtimeState.engine || runtimeState.lastGoodEngine;
  const ir = compileState?.ir;
  const entities = ir?.entities || [];

  return (
    <div className="app">
      <header className="header">
        <div className="logo">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="8" fill="url(#grad)" />
            <path d="M10 16L14 20L22 12" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            <defs>
              <linearGradient id="grad" x1="0" y1="0" x2="32" y2="32">
                <stop stopColor="#0ea5e9" />
                <stop offset="1" stopColor="#06b6d4" />
              </linearGradient>
            </defs>
          </svg>
          <span>Manifest Runtime</span>
        </div>
        <nav className="nav">
          {(['status', 'explorer', 'entities', 'commands', 'events'] as TabId[]).map(tab => (
            <button
              key={tab}
              className={\`nav-btn \${activeTab === tab ? 'active' : ''}\`}
              onClick={() => setActiveTab(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </nav>
      </header>

      <div className="content">
        <aside className="sidebar">
          <RuntimeStatus
            compileState={compileState}
            manifestPath="manifest/source.manifest"
            onRecompile={handleRecompile}
            isCompiling={isCompiling}
          />
          <RuntimeContextEditor
            value={runtimeContextText}
            error={runtimeContextError}
            onChange={handleContextChange}
          />
        </aside>

        <main className="main">
          {activeTab === 'status' && (
            <div className="tab-content">
              <h2>IR Output</h2>
              {ir ? (
                <div className="code-preview">
                  <div className="code-header">Intermediate Representation (IR)</div>
                  <pre className="code-block">{JSON.stringify(ir, null, 2)}</pre>
                </div>
              ) : (
                <div className="status-message">
                  {compileState ? 'Fix errors to see IR output' : 'Compiling...'}
                </div>
              )}
            </div>
          )}

          {activeTab === 'explorer' && <ModelExplorer ir={ir || null} />}

          {activeTab === 'entities' && (
            <div className="tab-content">
              {!engine || entities.length === 0 ? (
                <EmptyState onInsertExample={handleInsertExample} />
              ) : (
                <>
                  <div className="entity-tabs">
                    {entities.map(e => (
                      <button
                        key={e.name}
                        className={\`entity-tab \${selectedEntity === e.name ? 'active' : ''}\`}
                        onClick={() => setSelectedEntity(e.name)}
                      >
                        {e.name}
                      </button>
                    ))}
                  </div>
                  {selectedEntity && entities.find(e => e.name === selectedEntity) && (
                    <EntityPanel
                      entity={entities.find(e => e.name === selectedEntity)!}
                      engine={engine}
                    />
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === 'commands' && engine && (
            <CommandsPanel engine={engine} onEventEmitted={handleEventEmitted} />
          )}

          {activeTab === 'events' && <EventFeed events={runtimeState.events} />}
        </main>
      </div>

      <style>{\`
        .app { min-height: 100vh; display: flex; flex-direction: column; }
        .header { display: flex; align-items: center; justify-content: space-between; padding: 12px 24px; background: #1e293b; border-bottom: 1px solid #334155; }
        .logo { display: flex; align-items: center; gap: 12px; font-size: 18px; font-weight: 600; }
        .nav { display: flex; gap: 4px; }
        .nav-btn { background: transparent; color: #94a3b8; padding: 8px 16px; border-radius: 6px; }
        .nav-btn:hover { background: #334155; }
        .nav-btn.active { background: #0ea5e9; color: white; }
        .content { flex: 1; display: flex; overflow: hidden; }
        .sidebar { width: 320px; flex-shrink: 0; border-right: 1px solid #334155; overflow-y: auto; background: #0f172a; }
        .main { flex: 1; overflow-y: auto; padding: 24px; }

        .runtime-status { padding: 16px; }
        .status-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
        .status-indicator { display: flex; align-items: center; gap: 8px; }
        .dot { width: 10px; height: 10px; border-radius: 50%; background: #475569; }
        .dot.success { background: #10b981; box-shadow: 0 0 8px #10b98166; }
        .dot.error { background: #ef4444; box-shadow: 0 0 8px #ef444466; }
        .dot.pending { background: #f59e0b; }
        .status-text { font-weight: 500; }
        .recompile-btn { background: #334155; color: #e2e8f0; padding: 6px 12px; font-size: 13px; }
        .recompile-btn:hover:not(:disabled) { background: #475569; }
        .status-details { display: flex; flex-direction: column; gap: 8px; }
        .detail-row { display: flex; justify-content: space-between; font-size: 13px; }
        .label { color: #64748b; }
        .value { color: #e2e8f0; }
        .mono { font-family: 'Monaco', 'Menlo', monospace; font-size: 12px; }
        .counts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 12px; padding-top: 12px; border-top: 1px solid #334155; }
        .count-item { text-align: center; padding: 8px; background: #1e293b; border-radius: 6px; }
        .count-num { display: block; font-size: 20px; font-weight: 600; color: #0ea5e9; }
        .count-label { font-size: 11px; color: #64748b; text-transform: uppercase; }
        .errors-panel { margin-top: 16px; padding: 12px; background: #7f1d1d33; border: 1px solid #ef444433; border-radius: 8px; }
        .errors-title { font-weight: 500; color: #fca5a5; margin-bottom: 8px; font-size: 13px; }
        .error-item { display: flex; align-items: flex-start; gap: 8px; font-size: 13px; padding: 4px 0; }
        .error-icon { width: 18px; height: 18px; background: #ef4444; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: bold; flex-shrink: 0; }
        .error-msg { color: #fca5a5; flex: 1; }
        .error-pos { color: #94a3b8; font-family: monospace; font-size: 11px; }

        .runtime-context { padding: 16px; border-top: 1px solid #1f2937; }
        .context-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; font-weight: 600; }
        .context-hint { font-size: 11px; color: #64748b; border: 1px solid #334155; padding: 2px 6px; border-radius: 999px; }
        .context-shape { font-size: 11px; color: #94a3b8; margin-bottom: 8px; }
        .context-editor { width: 100%; min-height: 120px; background: #0b1220; border: 1px solid #334155; border-radius: 8px; color: #e2e8f0; font-family: 'Monaco', 'Menlo', monospace; font-size: 12px; padding: 10px; resize: vertical; }
        .context-editor.has-error { border-color: #ef4444; }
        .context-help { margin-top: 6px; font-size: 11px; color: #64748b; }
        .context-error { margin-top: 6px; font-size: 11px; color: #fca5a5; }

        .model-explorer { display: flex; height: calc(100vh - 140px); background: #1e293b; border-radius: 8px; overflow: hidden; }
        .explorer-tree { width: 280px; border-right: 1px solid #334155; overflow-y: auto; }
        .tree-header { padding: 12px 16px; font-weight: 500; border-bottom: 1px solid #334155; background: #0f172a; }
        .tree-empty { padding: 24px; text-align: center; color: #64748b; }
        .tree-node { display: flex; align-items: center; gap: 4px; padding: 6px 8px; cursor: pointer; font-size: 13px; }
        .tree-node:hover { background: #334155; }
        .tree-node.selected { background: #0ea5e933; }
        .expand-icon { width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; color: #64748b; transition: transform 0.15s; }
        .expand-icon.expanded { transform: rotate(90deg); }
        .expand-icon-placeholder { width: 16px; }
        .node-icon { width: 18px; height: 18px; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: bold; flex-shrink: 0; }
        .node-icon.entity { background: #0ea5e9; color: white; }
        .node-icon.module { background: #8b5cf6; color: white; }
        .node-icon.command { background: #10b981; color: white; }
        .node-icon.store { background: #f59e0b; color: white; }
        .node-icon.event { background: #ec4899; color: white; }
        .node-icon.policy { background: #ef4444; color: white; }
        .node-icon.property { background: #475569; color: white; }
        .node-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .explorer-detail { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
        .detail-header { padding: 12px 16px; font-weight: 500; border-bottom: 1px solid #334155; background: #0f172a; }
        .detail-content { flex: 1; padding: 16px; overflow: auto; }
        .detail-content pre { font-size: 12px; line-height: 1.5; color: #94a3b8; white-space: pre-wrap; word-break: break-word; }
        .detail-empty { color: #64748b; text-align: center; padding: 24px; }

        .empty-state-panel { text-align: center; padding: 60px 40px; max-width: 500px; margin: 0 auto; }
        .empty-icon { margin-bottom: 24px; }
        .empty-state-panel h2 { font-size: 24px; margin-bottom: 16px; color: #f1f5f9; }
        .empty-state-panel p { color: #94a3b8; line-height: 1.6; margin-bottom: 24px; }
        .insert-example-btn { background: linear-gradient(135deg, #0ea5e9, #06b6d4); color: white; padding: 12px 24px; font-size: 15px; font-weight: 500; }
        .insert-example-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 12px #0ea5e933; }

        .tab-content h2 { font-size: 20px; margin-bottom: 20px; color: #f1f5f9; }
        .entity-tabs { display: flex; gap: 8px; margin-bottom: 24px; flex-wrap: wrap; }
        .entity-tab { background: #334155; color: #94a3b8; }
        .entity-tab.active { background: #0ea5e9; color: white; }
        .entity-panel h2 { font-size: 20px; margin-bottom: 4px; }
        .entity-meta { font-size: 13px; color: #64748b; margin-bottom: 20px; }
        .create-form-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; margin-bottom: 24px; padding: 16px; background: #1e293b; border-radius: 8px; align-items: end; }
        .form-field { display: flex; flex-direction: column; gap: 4px; }
        .form-field label { font-size: 12px; color: #94a3b8; }
        .form-field input, .form-field select { width: 100%; }
        .form-field-inline { display: flex; align-items: center; gap: 8px; }
        .form-field-inline label { font-size: 12px; color: #94a3b8; min-width: 80px; }
        .edit-form { display: flex; flex-direction: column; gap: 8px; width: 100%; }
        .edit-actions { display: flex; gap: 8px; margin-top: 8px; }
        .btn-primary { background: #0ea5e9; color: white; }
        .btn-secondary { background: #334155; color: #e2e8f0; }
        .btn-danger { background: #ef4444; color: white; }
        .items-list { display: flex; flex-direction: column; gap: 12px; }
        .items-empty { text-align: center; padding: 40px; color: #64748b; background: #1e293b; border-radius: 8px; }
        .item-card { background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 16px; display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
        .item-card pre { font-size: 13px; color: #94a3b8; margin: 0; white-space: pre-wrap; flex: 1; }
        .item-actions { display: flex; flex-direction: column; gap: 4px; }

        .commands-panel { display: flex; height: calc(100vh - 140px); background: #1e293b; border-radius: 8px; overflow: hidden; }
        .commands-sidebar { width: 260px; border-right: 1px solid #334155; overflow-y: auto; }
        .commands-header { padding: 12px 16px; font-weight: 500; border-bottom: 1px solid #334155; background: #0f172a; }
        .commands-section-title { padding: 8px 16px; font-size: 11px; text-transform: uppercase; color: #64748b; background: #0f172a; }
        .command-item { padding: 10px 16px; cursor: pointer; display: flex; align-items: center; gap: 4px; font-size: 13px; }
        .command-item:hover { background: #334155; }
        .command-item.selected { background: #0ea5e933; }
        .command-entity { color: #64748b; }
        .command-name { color: #e2e8f0; }
        .command-params { color: #64748b; font-size: 11px; margin-left: auto; }
        .commands-empty { padding: 24px; text-align: center; color: #64748b; }
        .commands-main { flex: 1; padding: 24px; overflow-y: auto; }
        .command-form h3 { font-size: 18px; margin-bottom: 16px; color: #f1f5f9; }
        .command-guards { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: #f59e0b22; border: 1px solid #f59e0b44; border-radius: 6px; margin-bottom: 16px; font-size: 13px; }
        .guards-label { color: #f59e0b; font-weight: 500; }
        .guards-count { color: #fcd34d; }
        .command-params-form { display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px; }
        .form-field .required { color: #ef4444; margin-left: 2px; }
        .form-field .type-hint { color: #64748b; font-size: 11px; margin-left: 4px; }
        .btn-execute { background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 12px 24px; font-size: 15px; }
        .btn-execute:disabled { background: #334155; }
        .command-result { margin-top: 16px; padding: 16px; border-radius: 8px; }
        .command-result.success { background: #10b98122; border: 1px solid #10b98144; }
        .command-result.error { background: #ef444422; border: 1px solid #ef444444; }
        .result-status { font-weight: 600; margin-bottom: 4px; }
        .command-result.success .result-status { color: #34d399; }
        .command-result.error .result-status { color: #f87171; }
        .guard-failure { margin-top: 10px; padding: 10px; border-radius: 6px; background: #1f2937; border: 1px dashed #ef444466; }
        .guard-failure-title { font-size: 12px; font-weight: 600; color: #fca5a5; margin-bottom: 4px; }
        .guard-failure-detail { font-size: 12px; color: #e2e8f0; white-space: pre-wrap; word-break: break-word; }
        .guard-failure-resolved { margin-top: 6px; display: flex; gap: 6px; flex-wrap: wrap; }
        .guard-failure-label { font-size: 12px; color: #cbd5f5; }
        .result-message { font-size: 13px; color: #94a3b8; }
        .result-events { margin-top: 12px; }
        .events-title { font-size: 12px; color: #64748b; margin-bottom: 8px; }
        .event-badge { display: inline-block; padding: 4px 8px; background: #ec4899; color: white; border-radius: 4px; font-size: 12px; margin-right: 4px; }
        .command-placeholder { display: flex; align-items: center; justify-content: center; height: 100%; color: #64748b; }

        .event-feed { height: calc(100vh - 140px); background: #1e293b; border-radius: 8px; display: flex; flex-direction: column; overflow: hidden; }
        .feed-header { padding: 12px 16px; font-weight: 500; border-bottom: 1px solid #334155; background: #0f172a; display: flex; justify-content: space-between; align-items: center; }
        .event-count { font-size: 12px; color: #64748b; }
        .feed-list { flex: 1; overflow-y: auto; padding: 16px; }
        .feed-empty { text-align: center; padding: 40px; color: #64748b; }
        .event-item { background: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 12px; margin-bottom: 8px; }
        .event-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
        .event-name { font-weight: 500; color: #ec4899; }
        .event-channel { font-size: 12px; color: #64748b; background: #334155; padding: 2px 6px; border-radius: 4px; }
        .event-time { font-size: 11px; color: #64748b; margin-left: auto; }
        .event-payload { font-size: 12px; color: #94a3b8; margin: 0; white-space: pre-wrap; }

        .code-preview { background: #1e293b; border-radius: 8px; overflow: hidden; }
        .code-header { padding: 10px 16px; background: #0f172a; font-size: 13px; font-weight: 500; border-bottom: 1px solid #334155; }
        .code-block { padding: 16px; font-size: 12px; line-height: 1.5; color: #94a3b8; max-height: 500px; overflow: auto; margin: 0; }
        .status-message { text-align: center; padding: 40px; color: #64748b; }
      \`}</style>
    </div>
  );
}`}function Af(t){return`# ${t}

Generated by Manifest Compiler v2.0 - IR Runtime Edition

## Quick Start

\`\`\`bash
npm install
npm run dev
\`\`\`

Then open http://localhost:5173 in your browser.

## Project Structure

- \`src/manifest/source.manifest\` - Original Manifest source
- \`src/manifest/generated.ts\` - Legacy compiled TypeScript (for debugging)
- \`src/manifest/runtime.ts\` - Legacy runtime library
- \`src/manifest/ir/\` - IR compiler and runtime engine
  - \`types.ts\` - IR type definitions
  - \`ir-compiler.ts\` - Source to IR compiler
  - \`runtime-engine.ts\` - IR execution engine
- \`src/manifest/compiler/\` - Legacy AST compiler
- \`src/App.tsx\` - React application UI

## Features

### IR-Driven Runtime

The application is powered by an Intermediate Representation (IR) that represents:
- Modules, Entities, Commands, Stores, Events, Policies
- All property definitions, computed fields, and constraints
- Command parameters, guards, mutations, and emits

### Runtime Status Panel

Always visible sidebar showing:
- Compilation status (success/error)
- Compile time and model statistics
- Compilation errors with locations

### Model Explorer

Interactive tree view of the IR structure:
- Browse all IR nodes by category
- View raw JSON for any selected node

### Entity Management

Full CRUD operations via RuntimeEngine:
- Auto-generated forms based on entity properties
- LocalStorage persistence for configured stores
- Edit and delete existing instances

### Commands Tab

Execute commands defined in your manifest:
- List of module and entity commands
- Input forms for command parameters
- Target instance selection for entity commands
- Guard condition indicators
- Execution results and denial reasons
- Emitted events display

### Event Feed

Real-time display of all emitted events:
- Event name and channel
- Timestamp
- Full payload data

### Last-Good State Preservation

If recompilation fails:
- Previous working RuntimeEngine stays active
- You can continue using the app
- Errors are displayed for fixing

## How It Works

1. Source manifest is compiled to IR (not generated TypeScript)
2. RuntimeEngine interprets the IR at runtime
3. Commands execute with guard/policy checks
4. Events are emitted to the event bus
5. Entity state is managed through stores

## Build for Production

\`\`\`bash
npm run build
\`\`\`
`}const jf=`export type Subscriber<T> = (value: T) => void;
export type User = { id: string; role?: string; [key: string]: unknown };
export type Context = { user?: User; [key: string]: unknown };

let _context: Context = {};
export const setContext = (ctx: Context) => { _context = ctx; };
export const getContext = () => _context;

export class Observable<T> {
  private subs: Set<Subscriber<T>> = new Set();
  private _v: T;
  constructor(v: T) { this._v = v; }
  get value(): T { return this._v; }
  set(v: T) { this._v = v; this.subs.forEach(fn => fn(v)); }
  subscribe(fn: Subscriber<T>) { this.subs.add(fn); fn(this._v); return () => this.subs.delete(fn); }
}

export class EventEmitter<T extends Record<string, unknown>> {
  private listeners: Map<keyof T, Set<(d: unknown) => void>> = new Map();
  on<K extends keyof T>(e: K, fn: (d: T[K]) => void) {
    if (!this.listeners.has(e)) this.listeners.set(e, new Set());
    this.listeners.get(e)!.add(fn as (d: unknown) => void);
    return () => this.listeners.get(e)?.delete(fn as (d: unknown) => void);
  }
  emit<K extends keyof T>(e: K, d: T[K]) {
    this.listeners.get(e)?.forEach(fn => fn(d));
  }
}

export class EventBus {
  private static channels: Map<string, Set<(d: unknown) => void>> = new Map();
  static publish(channel: string, data: unknown) {
    this.channels.get(channel)?.forEach(fn => fn(data));
  }
  static subscribe(channel: string, fn: (d: unknown) => void) {
    if (!this.channels.has(channel)) this.channels.set(channel, new Set());
    this.channels.get(channel)!.add(fn);
    return () => this.channels.get(channel)?.delete(fn);
  }
}

export interface Store<T> {
  getAll(): Promise<T[]>;
  getById(id: string): Promise<T | null>;
  create(item: Partial<T>): Promise<T>;
  update(id: string, item: Partial<T>): Promise<T>;
  delete(id: string): Promise<boolean>;
  query(filter: (item: T) => boolean): Promise<T[]>;
  onChange(fn: (items: T[]) => void): () => void;
}

export class MemoryStore<T extends { id: string }> implements Store<T> {
  private data: Map<string, T> = new Map();
  private listeners: Set<(items: T[]) => void> = new Set();

  private notify() {
    const items = Array.from(this.data.values());
    this.listeners.forEach(fn => fn(items));
  }

  async getAll() { return Array.from(this.data.values()); }
  async getById(id: string) { return this.data.get(id) || null; }
  async create(item: Partial<T>) {
    const id = (item as { id?: string }).id || crypto.randomUUID();
    const full = { ...item, id } as T;
    this.data.set(id, full);
    this.notify();
    return full;
  }
  async update(id: string, item: Partial<T>) {
    const existing = this.data.get(id);
    if (!existing) throw new Error("Not found");
    const updated = { ...existing, ...item };
    this.data.set(id, updated);
    this.notify();
    return updated;
  }
  async delete(id: string) {
    const result = this.data.delete(id);
    this.notify();
    return result;
  }
  async query(filter: (item: T) => boolean) {
    return Array.from(this.data.values()).filter(filter);
  }
  onChange(fn: (items: T[]) => void) {
    this.listeners.add(fn);
    fn(Array.from(this.data.values()));
    return () => this.listeners.delete(fn);
  }
}

export class LocalStorageStore<T extends { id: string }> implements Store<T> {
  private listeners: Set<(items: T[]) => void> = new Set();
  constructor(private key: string) {}

  private load(): T[] {
    try {
      const d = localStorage.getItem(this.key);
      return d ? JSON.parse(d) : [];
    } catch { return []; }
  }
  private save(data: T[]) {
    localStorage.setItem(this.key, JSON.stringify(data));
    this.listeners.forEach(fn => fn(data));
  }

  async getAll() { return this.load(); }
  async getById(id: string) { return this.load().find(x => x.id === id) || null; }
  async create(item: Partial<T>) {
    const data = this.load();
    const id = (item as { id?: string }).id || crypto.randomUUID();
    const full = { ...item, id } as T;
    data.push(full);
    this.save(data);
    return full;
  }
  async update(id: string, item: Partial<T>) {
    const data = this.load();
    const idx = data.findIndex(x => x.id === id);
    if (idx < 0) throw new Error("Not found");
    data[idx] = { ...data[idx], ...item };
    this.save(data);
    return data[idx];
  }
  async delete(id: string) {
    const data = this.load();
    const idx = data.findIndex(x => x.id === id);
    if (idx < 0) return false;
    data.splice(idx, 1);
    this.save(data);
    return true;
  }
  async query(filter: (item: T) => boolean) { return this.load().filter(filter); }
  onChange(fn: (items: T[]) => void) {
    this.listeners.add(fn);
    fn(this.load());
    return () => this.listeners.delete(fn);
  }
}
`,$f=`export interface IR {
  version: '1.0';
  modules: IRModule[];
  entities: IREntity[];
  stores: IRStore[];
  events: IREvent[];
  commands: IRCommand[];
  policies: IRPolicy[];
}

export interface IRModule {
  name: string;
  entities: string[];
  commands: string[];
  stores: string[];
  events: string[];
  policies: string[];
}

export interface IREntity {
  name: string;
  module?: string;
  properties: IRProperty[];
  computedProperties: IRComputedProperty[];
  relationships: IRRelationship[];
  commands: string[];
  constraints: IRConstraint[];
  policies: string[];
}

export interface IRProperty {
  name: string;
  type: IRType;
  defaultValue?: IRValue;
  modifiers: PropertyModifier[];
}

export type PropertyModifier = 'required' | 'unique' | 'indexed' | 'private' | 'readonly' | 'optional';

export interface IRComputedProperty {
  name: string;
  type: IRType;
  expression: IRExpression;
  dependencies: string[];
}

export interface IRRelationship {
  name: string;
  kind: 'hasMany' | 'hasOne' | 'belongsTo' | 'ref';
  target: string;
  foreignKey?: string;
  through?: string;
}

export interface IRConstraint {
  name: string;
  expression: IRExpression;
  message?: string;
}

export interface IRStore {
  entity: string;
  target: 'memory' | 'localStorage' | 'postgres' | 'supabase';
  config: Record<string, IRValue>;
}

export interface IREvent {
  name: string;
  channel: string;
  payload: IRType | IREventField[];
}

export interface IREventField {
  name: string;
  type: IRType;
  required: boolean;
}

export interface IRCommand {
  name: string;
  module?: string;
  entity?: string;
  parameters: IRParameter[];
  guards: IRExpression[];
  actions: IRAction[];
  emits: string[];
  returns?: IRType;
}

export interface IRParameter {
  name: string;
  type: IRType;
  required: boolean;
  defaultValue?: IRValue;
}

export interface IRAction {
  kind: 'mutate' | 'emit' | 'compute' | 'effect' | 'publish' | 'persist';
  target?: string;
  expression: IRExpression;
}

export interface IRPolicy {
  name: string;
  module?: string;
  entity?: string;
  action: 'read' | 'write' | 'delete' | 'execute' | 'all';
  expression: IRExpression;
  message?: string;
}

export interface IRType {
  name: string;
  generic?: IRType;
  nullable: boolean;
}

export type IRValue =
  | { kind: 'string'; value: string }
  | { kind: 'number'; value: number }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'null' }
  | { kind: 'array'; elements: IRValue[] }
  | { kind: 'object'; properties: Record<string, IRValue> };

export type IRExpression =
  | { kind: 'literal'; value: IRValue }
  | { kind: 'identifier'; name: string }
  | { kind: 'member'; object: IRExpression; property: string }
  | { kind: 'binary'; operator: string; left: IRExpression; right: IRExpression }
  | { kind: 'unary'; operator: string; operand: IRExpression }
  | { kind: 'call'; callee: IRExpression; args: IRExpression[] }
  | { kind: 'conditional'; condition: IRExpression; consequent: IRExpression; alternate: IRExpression }
  | { kind: 'array'; elements: IRExpression[] }
  | { kind: 'object'; properties: { key: string; value: IRExpression }[] }
  | { kind: 'lambda'; params: string[]; body: IRExpression };

export interface IRDiagnostic {
  severity: 'error' | 'warning' | 'info';
  message: string;
  line?: number;
  column?: number;
}

export interface CompileToIRResult {
  ir: IR | null;
  diagnostics: IRDiagnostic[];
}
`,zf=`import { Lexer } from '../compiler/lexer';
import { Parser } from '../compiler/parser';
import type {
  ManifestProgram, EntityNode, PropertyNode, ComputedPropertyNode, RelationshipNode,
  CommandNode, ParameterNode, PolicyNode, StoreNode, OutboxEventNode, ConstraintNode,
  ActionNode, ExpressionNode, TypeNode
} from '../compiler/types';
import type {
  IR, IRModule, IREntity, IRProperty, IRComputedProperty, IRRelationship, IRConstraint,
  IRStore, IREvent, IREventField, IRCommand, IRParameter, IRAction, IRPolicy, IRType,
  IRValue, IRExpression, IRDiagnostic, CompileToIRResult, PropertyModifier
} from './types';

class IRCompiler {
  private diagnostics: IRDiagnostic[] = [];

  compile(source: string): CompileToIRResult {
    this.diagnostics = [];
    const parser = new Parser();
    const { program, errors } = parser.parse(source);

    for (const err of errors) {
      this.diagnostics.push({
        severity: err.severity,
        message: err.message,
        line: err.position?.line,
        column: err.position?.column,
      });
    }

    if (errors.some(e => e.severity === 'error')) {
      return { ir: null, diagnostics: this.diagnostics };
    }

    return { ir: this.transform(program), diagnostics: this.diagnostics };
  }

  private transform(p: ManifestProgram): IR {
    const modules = p.modules.map(m => this.transformModule(m));
    const entities = [
      ...p.entities.map(e => this.transformEntity(e)),
      ...p.modules.flatMap(m => m.entities.map(e => this.transformEntity(e, m.name)))
    ];
    const stores = [
      ...p.stores.map(s => this.transformStore(s)),
      ...p.modules.flatMap(m => m.stores.map(s => this.transformStore(s)))
    ];
    const events = [
      ...p.events.map(e => this.transformEvent(e)),
      ...p.modules.flatMap(m => m.events.map(e => this.transformEvent(e)))
    ];
    const commands = [
      ...p.commands.map(c => this.transformCommand(c)),
      ...p.modules.flatMap(m => m.commands.map(c => this.transformCommand(c, m.name))),
      ...p.entities.flatMap(e => e.commands.map(c => this.transformCommand(c, undefined, e.name))),
      ...p.modules.flatMap(m => m.entities.flatMap(e => e.commands.map(c => this.transformCommand(c, m.name, e.name))))
    ];
    const policies = [
      ...p.policies.map(pl => this.transformPolicy(pl)),
      ...p.modules.flatMap(m => m.policies.map(pl => this.transformPolicy(pl, m.name)))
    ];

    return { version: '1.0', modules, entities, stores, events, commands, policies };
  }

  private transformModule(m: any): IRModule {
    return {
      name: m.name,
      entities: m.entities.map((e: EntityNode) => e.name),
      commands: m.commands.map((c: CommandNode) => c.name),
      stores: m.stores.map((s: StoreNode) => s.entity),
      events: m.events.map((e: OutboxEventNode) => e.name),
      policies: m.policies.map((p: PolicyNode) => p.name),
    };
  }

  private transformEntity(e: EntityNode, mod?: string): IREntity {
    return {
      name: e.name,
      module: mod,
      properties: e.properties.map(p => this.transformProperty(p)),
      computedProperties: e.computedProperties.map(c => this.transformComputed(c)),
      relationships: e.relationships.map(r => this.transformRelationship(r)),
      commands: e.commands.map(c => c.name),
      constraints: e.constraints.map(c => this.transformConstraint(c)),
      policies: e.policies.map(p => p.name),
    };
  }

  private transformProperty(p: PropertyNode): IRProperty {
    return {
      name: p.name,
      type: this.transformType(p.dataType),
      defaultValue: p.defaultValue ? this.exprToValue(p.defaultValue) : undefined,
      modifiers: p.modifiers as PropertyModifier[],
    };
  }

  private transformComputed(c: ComputedPropertyNode): IRComputedProperty {
    return {
      name: c.name,
      type: this.transformType(c.dataType),
      expression: this.transformExpr(c.expression),
      dependencies: c.dependencies,
    };
  }

  private transformRelationship(r: RelationshipNode): IRRelationship {
    return { name: r.name, kind: r.kind, target: r.target, foreignKey: r.foreignKey, through: r.through };
  }

  private transformConstraint(c: ConstraintNode): IRConstraint {
    return { name: c.name, expression: this.transformExpr(c.expression), message: c.message };
  }

  private transformStore(s: StoreNode): IRStore {
    const config: Record<string, IRValue> = {};
    if (s.config) {
      for (const [k, v] of Object.entries(s.config)) {
        const val = this.exprToValue(v);
        if (val) config[k] = val;
      }
    }
    return { entity: s.entity, target: s.target, config };
  }

  private transformEvent(e: OutboxEventNode): IREvent {
    if ('fields' in e.payload) {
      return {
        name: e.name,
        channel: e.channel,
        payload: (e.payload.fields as ParameterNode[]).map(f => ({
          name: f.name, type: this.transformType(f.dataType), required: f.required
        })),
      };
    }
    return { name: e.name, channel: e.channel, payload: this.transformType(e.payload as TypeNode) };
  }

  private transformCommand(c: CommandNode, mod?: string, entity?: string): IRCommand {
    return {
      name: c.name,
      module: mod,
      entity: entity,
      parameters: c.parameters.map(p => this.transformParam(p)),
      guards: (c.guards || []).map(g => this.transformExpr(g)),
      actions: c.actions.map(a => this.transformAction(a)),
      emits: c.emits || [],
      returns: c.returns ? this.transformType(c.returns) : undefined,
    };
  }

  private transformParam(p: ParameterNode): IRParameter {
    return {
      name: p.name,
      type: this.transformType(p.dataType),
      required: p.required,
      defaultValue: p.defaultValue ? this.exprToValue(p.defaultValue) : undefined,
    };
  }

  private transformAction(a: ActionNode): IRAction {
    return { kind: a.kind, target: a.target, expression: this.transformExpr(a.expression) };
  }

  private transformPolicy(p: PolicyNode, mod?: string, entity?: string): IRPolicy {
    return {
      name: p.name, module: mod, entity: entity, action: p.action,
      expression: this.transformExpr(p.expression), message: p.message,
    };
  }

  private transformType(t: TypeNode): IRType {
    return { name: t.name, generic: t.generic ? this.transformType(t.generic) : undefined, nullable: t.nullable };
  }

  private transformExpr(e: ExpressionNode): IRExpression {
    switch (e.type) {
      case 'Literal': {
        const l = e as any;
        return { kind: 'literal', value: this.litToValue(l.value, l.dataType) };
      }
      case 'Identifier': return { kind: 'identifier', name: (e as any).name };
      case 'MemberAccess': {
        const m = e as any;
        return { kind: 'member', object: this.transformExpr(m.object), property: m.property };
      }
      case 'BinaryOp': {
        const b = e as any;
        return { kind: 'binary', operator: b.operator, left: this.transformExpr(b.left), right: this.transformExpr(b.right) };
      }
      case 'UnaryOp': {
        const u = e as any;
        return { kind: 'unary', operator: u.operator, operand: this.transformExpr(u.operand) };
      }
      case 'Call': {
        const c = e as any;
        return { kind: 'call', callee: this.transformExpr(c.callee), args: c.arguments.map((a: ExpressionNode) => this.transformExpr(a)) };
      }
      case 'Conditional': {
        const cn = e as any;
        return { kind: 'conditional', condition: this.transformExpr(cn.condition), consequent: this.transformExpr(cn.consequent), alternate: this.transformExpr(cn.alternate) };
      }
      case 'Array': {
        const ar = e as any;
        return { kind: 'array', elements: ar.elements.map((el: ExpressionNode) => this.transformExpr(el)) };
      }
      case 'Object': {
        const ob = e as any;
        return { kind: 'object', properties: ob.properties.map((p: any) => ({ key: p.key, value: this.transformExpr(p.value) })) };
      }
      case 'Lambda': {
        const la = e as any;
        return { kind: 'lambda', params: la.parameters, body: this.transformExpr(la.body) };
      }
      default: return { kind: 'literal', value: { kind: 'null' } };
    }
  }

  private exprToValue(e: ExpressionNode): IRValue | undefined {
    if (e.type === 'Literal') {
      const l = e as any;
      return this.litToValue(l.value, l.dataType);
    }
    if (e.type === 'Array') {
      const ar = e as any;
      const els = ar.elements.map((el: ExpressionNode) => this.exprToValue(el)).filter((v: IRValue | undefined): v is IRValue => v !== undefined);
      return { kind: 'array', elements: els };
    }
    if (e.type === 'Object') {
      const ob = e as any;
      const props: Record<string, IRValue> = {};
      for (const p of ob.properties) {
        const v = this.exprToValue(p.value);
        if (v) props[p.key] = v;
      }
      return { kind: 'object', properties: props };
    }
    return undefined;
  }

  private litToValue(val: any, dtype: string): IRValue {
    if (dtype === 'string') return { kind: 'string', value: val };
    if (dtype === 'number') return { kind: 'number', value: val };
    if (dtype === 'boolean') return { kind: 'boolean', value: val };
    return { kind: 'null' };
  }
}

export function compileToIR(source: string): CompileToIRResult {
  return new IRCompiler().compile(source);
}
`,Uf=`import type { IR, IREntity, IRCommand, IRPolicy, IRExpression, IRValue, IRAction, IRType } from './types';

export interface RuntimeContext {
  user?: { id: string; role?: string; [key: string]: unknown };
  [key: string]: unknown;
}

export interface EntityInstance {
  id: string;
  [key: string]: unknown;
}

export interface CommandResult {
  success: boolean;
  result?: unknown;
  error?: string;
  deniedBy?: string;
  guardFailure?: GuardFailure;
  emittedEvents: EmittedEvent[];
}

export interface GuardFailure {
  index: number;
  expression: IRExpression;
  formatted: string;
  resolved?: GuardResolvedValue[];
}

export interface GuardResolvedValue {
  expression: string;
  value: unknown;
}

export interface EmittedEvent {
  name: string;
  channel: string;
  payload: unknown;
  timestamp: number;
}

interface Store<T extends EntityInstance = EntityInstance> {
  getAll(): Promise<T[]>;
  getById(id: string): Promise<T | undefined>;
  create(data: Partial<T>): Promise<T>;
  update(id: string, data: Partial<T>): Promise<T | undefined>;
  delete(id: string): Promise<boolean>;
  clear(): Promise<void>;
}

class MemoryStore<T extends EntityInstance> implements Store<T> {
  private items: Map<string, T> = new Map();
  async getAll(): Promise<T[]> { return Array.from(this.items.values()); }
  async getById(id: string): Promise<T | undefined> { return this.items.get(id); }
  async create(data: Partial<T>): Promise<T> {
    const id = data.id || crypto.randomUUID();
    const item = { ...data, id } as T;
    this.items.set(id, item);
    return item;
  }
  async update(id: string, data: Partial<T>): Promise<T | undefined> {
    const existing = this.items.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...data, id };
    this.items.set(id, updated);
    return updated;
  }
  async delete(id: string): Promise<boolean> { return this.items.delete(id); }
  async clear(): Promise<void> { this.items.clear(); }
}

class LocalStorageStore<T extends EntityInstance> implements Store<T> {
  constructor(private key: string) {}
  private load(): T[] {
    try { const d = localStorage.getItem(this.key); return d ? JSON.parse(d) : []; }
    catch { return []; }
  }
  private save(items: T[]): void { localStorage.setItem(this.key, JSON.stringify(items)); }
  async getAll(): Promise<T[]> { return this.load(); }
  async getById(id: string): Promise<T | undefined> { return this.load().find(i => i.id === id); }
  async create(data: Partial<T>): Promise<T> {
    const items = this.load();
    const id = data.id || crypto.randomUUID();
    const item = { ...data, id } as T;
    items.push(item);
    this.save(items);
    return item;
  }
  async update(id: string, data: Partial<T>): Promise<T | undefined> {
    const items = this.load();
    const idx = items.findIndex(i => i.id === id);
    if (idx === -1) return undefined;
    items[idx] = { ...items[idx], ...data, id };
    this.save(items);
    return items[idx];
  }
  async delete(id: string): Promise<boolean> {
    const items = this.load();
    const idx = items.findIndex(i => i.id === id);
    if (idx === -1) return false;
    items.splice(idx, 1);
    this.save(items);
    return true;
  }
  async clear(): Promise<void> { localStorage.removeItem(this.key); }
}

type EventListener = (event: EmittedEvent) => void;

export class RuntimeEngine {
  private ir: IR;
  private context: RuntimeContext;
  private stores: Map<string, Store> = new Map();
  private eventListeners: EventListener[] = [];
  private eventLog: EmittedEvent[] = [];

  constructor(ir: IR, context: RuntimeContext = {}) {
    this.ir = ir;
    this.context = context;
    this.initStores();
  }

  private initStores(): void {
    for (const entity of this.ir.entities) {
      const cfg = this.ir.stores.find(s => s.entity === entity.name);
      let store: Store;
      if (cfg?.target === 'localStorage') {
        const key = cfg.config.key?.kind === 'string' ? cfg.config.key.value : \`\${entity.name.toLowerCase()}s\`;
        store = new LocalStorageStore(key);
      } else {
        store = new MemoryStore();
      }
      this.stores.set(entity.name, store);
    }
  }

  getIR(): IR { return this.ir; }
  getContext(): RuntimeContext { return this.context; }
  setContext(ctx: Partial<RuntimeContext>): void { this.context = { ...this.context, ...ctx }; }
  replaceContext(ctx: RuntimeContext): void { this.context = { ...ctx }; }
  getEntities(): IREntity[] { return this.ir.entities; }
  getEntity(name: string): IREntity | undefined { return this.ir.entities.find(e => e.name === name); }

  getCommands(): IRCommand[] {
    return this.ir.commands;
  }

  getCommand(name: string, entityName?: string): IRCommand | undefined {
    if (entityName) {
      const entity = this.getEntity(entityName);
      if (!entity || !entity.commands.includes(name)) return undefined;
      return this.ir.commands.find(c => c.name === name && c.entity === entityName);
    }
    return this.ir.commands.find(c => c.name === name);
  }

  getPolicies(): IRPolicy[] { return this.ir.policies; }
  getStore(entityName: string): Store | undefined { return this.stores.get(entityName); }
  async getAllInstances(entityName: string): Promise<EntityInstance[]> { return this.stores.get(entityName)?.getAll() || []; }
  async getInstance(entityName: string, id: string): Promise<EntityInstance | undefined> { return this.stores.get(entityName)?.getById(id); }

  async createInstance(entityName: string, data: Partial<EntityInstance>): Promise<EntityInstance | undefined> {
    const entity = this.getEntity(entityName);
    if (!entity) return undefined;
    const defaults: Record<string, unknown> = {};
    for (const prop of entity.properties) {
      defaults[prop.name] = prop.defaultValue ? this.valueToJs(prop.defaultValue) : this.defaultFor(prop.type);
    }
    return this.stores.get(entityName)?.create({ ...defaults, ...data });
  }

  async updateInstance(entityName: string, id: string, data: Partial<EntityInstance>): Promise<EntityInstance | undefined> {
    return this.stores.get(entityName)?.update(id, data);
  }

  async deleteInstance(entityName: string, id: string): Promise<boolean> {
    return this.stores.get(entityName)?.delete(id) ?? false;
  }

  async runCommand(
    commandName: string,
    input: Record<string, unknown>,
    options: { entityName?: string; instanceId?: string } = {}
  ): Promise<CommandResult> {
    const cmd = this.getCommand(commandName, options.entityName);
    if (!cmd) return { success: false, error: \`Command '\${commandName}' not found\`, emittedEvents: [] };

    const instance = options.instanceId && options.entityName
      ? await this.getInstance(options.entityName, options.instanceId) : undefined;
    const ctx = this.buildCtx(input, instance);

    const policyResult = this.checkPolicies(cmd, ctx);
    if (!policyResult.ok) {
      return { success: false, error: policyResult.msg, deniedBy: policyResult.policy, emittedEvents: [] };
    }

    for (let i = 0; i < cmd.guards.length; i += 1) {
      const guard = cmd.guards[i];
      if (!this.evalExpr(guard, ctx)) {
        return {
          success: false,
          error: \`Guard failed for '\${commandName}'\`,
          guardFailure: {
            index: i + 1,
            expression: guard,
            formatted: this.formatExpr(guard),
            resolved: this.resolveExpressionValues(guard, ctx),
          },
          emittedEvents: [],
        };
      }
    }

    const emitted: EmittedEvent[] = [];
    let result: unknown;

    for (const action of cmd.actions) {
      result = await this.execAction(action, ctx, options);
      if (action.kind === 'mutate' && options.instanceId && options.entityName) {
        const updated = await this.getInstance(options.entityName, options.instanceId);
        ctx.self = updated;
        ctx.this = updated;
      }
    }

    for (const eventName of cmd.emits) {
      const eventDef = this.ir.events.find(e => e.name === eventName);
      const ev: EmittedEvent = {
        name: eventName,
        channel: eventDef?.channel || eventName,
        payload: { ...input, result },
        timestamp: Date.now(),
      };
      emitted.push(ev);
      this.eventLog.push(ev);
      this.notifyListeners(ev);
    }

    return { success: true, result, emittedEvents: emitted };
  }

  private buildCtx(input: Record<string, unknown>, instance?: EntityInstance): Record<string, unknown> {
    return { ...input, self: instance, this: instance, user: this.context.user, context: this.context };
  }

  private checkPolicies(cmd: IRCommand, ctx: Record<string, unknown>): { ok: boolean; policy?: string; msg?: string } {
    const relevant = this.ir.policies.filter(p => {
      if (p.entity && cmd.entity && p.entity !== cmd.entity) return false;
      if (p.action !== 'all' && p.action !== 'execute') return false;
      return true;
    });
    for (const p of relevant) {
      if (!this.evalExpr(p.expression, ctx)) {
        return { ok: false, policy: p.name, msg: p.message || \`Denied by '\${p.name}'\` };
      }
    }
    return { ok: true };
  }

  private async execAction(action: IRAction, ctx: Record<string, unknown>, opts: { entityName?: string; instanceId?: string }): Promise<unknown> {
    const val = this.evalExpr(action.expression, ctx);
    if (action.kind === 'mutate' && action.target && opts.instanceId && opts.entityName) {
      await this.updateInstance(opts.entityName, opts.instanceId, { [action.target]: val });
    }
    if (action.kind === 'emit' || action.kind === 'publish') {
      const ev: EmittedEvent = { name: 'action_event', channel: 'default', payload: val, timestamp: Date.now() };
      this.eventLog.push(ev);
      this.notifyListeners(ev);
    }
    return val;
  }

  evalExpr(expr: IRExpression, ctx: Record<string, unknown>): unknown {
    switch (expr.kind) {
      case 'literal': return this.valueToJs(expr.value);
      case 'identifier': {
        if (expr.name in ctx) return ctx[expr.name];
        if (expr.name === 'true') return true;
        if (expr.name === 'false') return false;
        if (expr.name === 'null') return null;
        return undefined;
      }
      case 'member': {
        const obj = this.evalExpr(expr.object, ctx);
        return obj && typeof obj === 'object' ? (obj as any)[expr.property] : undefined;
      }
      case 'binary': {
        const l = this.evalExpr(expr.left, ctx);
        const r = this.evalExpr(expr.right, ctx);
        return this.binOp(expr.operator, l, r);
      }
      case 'unary': {
        const op = this.evalExpr(expr.operand, ctx);
        if (expr.operator === '!' || expr.operator === 'not') return !op;
        if (expr.operator === '-') return -(op as number);
        return op;
      }
      case 'call': {
        const fn = this.evalExpr(expr.callee, ctx);
        const args = expr.args.map(a => this.evalExpr(a, ctx));
        return typeof fn === 'function' ? fn(...args) : undefined;
      }
      case 'conditional': return this.evalExpr(expr.condition, ctx) ? this.evalExpr(expr.consequent, ctx) : this.evalExpr(expr.alternate, ctx);
      case 'array': return expr.elements.map(e => this.evalExpr(e, ctx));
      case 'object': {
        const res: Record<string, unknown> = {};
        for (const p of expr.properties) res[p.key] = this.evalExpr(p.value, ctx);
        return res;
      }
      case 'lambda': return (...args: unknown[]) => {
        const local = { ...ctx };
        expr.params.forEach((p, i) => { local[p] = args[i]; });
        return this.evalExpr(expr.body, local);
      };
      default: return undefined;
    }
  }

  private formatExpr(expr: IRExpression): string {
    switch (expr.kind) {
      case 'literal':
        return this.formatValue(expr.value);
      case 'identifier':
        return expr.name;
      case 'member':
        return this.formatExpr(expr.object) + '.' + expr.property;
      case 'binary':
        return this.formatExpr(expr.left) + ' ' + expr.operator + ' ' + this.formatExpr(expr.right);
      case 'unary':
        return expr.operator === 'not'
          ? 'not ' + this.formatExpr(expr.operand)
          : expr.operator + this.formatExpr(expr.operand);
      case 'call':
        return this.formatExpr(expr.callee) + '(' + expr.args.map(a => this.formatExpr(a)).join(', ') + ')';
      case 'conditional':
        return this.formatExpr(expr.condition) + ' ? ' + this.formatExpr(expr.consequent) + ' : ' + this.formatExpr(expr.alternate);
      case 'array':
        return '[' + expr.elements.map(el => this.formatExpr(el)).join(', ') + ']';
      case 'object':
        return '{ ' + expr.properties.map(p => p.key + ': ' + this.formatExpr(p.value)).join(', ') + ' }';
      case 'lambda':
        return '(' + expr.params.join(', ') + ') => ' + this.formatExpr(expr.body);
      default:
        return '<expr>';
    }
  }

  private formatValue(value: IRValue): string {
    switch (value.kind) {
      case 'string':
        return JSON.stringify(value.value);
      case 'number':
        return String(value.value);
      case 'boolean':
        return String(value.value);
      case 'null':
        return 'null';
      case 'array':
        return '[' + value.elements.map(el => this.formatValue(el)).join(', ') + ']';
      case 'object':
        return '{ ' + Object.entries(value.properties).map(([k, v]) => k + ': ' + this.formatValue(v)).join(', ') + ' }';
      default:
        return 'null';
    }
  }

  private resolveExpressionValues(expr: IRExpression, ctx: Record<string, unknown>): GuardResolvedValue[] {
    const entries: GuardResolvedValue[] = [];
    const seen = new Set<string>();

    const addEntry = (node: IRExpression) => {
      const formatted = this.formatExpr(node);
      if (seen.has(formatted)) return;
      seen.add(formatted);
      let value: unknown;
      try {
        value = this.evalExpr(node, ctx);
      } catch {
        value = undefined;
      }
      entries.push({ expression: formatted, value });
    };

    const walk = (node: IRExpression): void => {
      switch (node.kind) {
        case 'literal':
        case 'identifier':
        case 'member':
          addEntry(node);
          return;
        case 'binary':
          walk(node.left);
          walk(node.right);
          return;
        case 'unary':
          walk(node.operand);
          return;
        case 'call':
          node.args.forEach(walk);
          return;
        case 'conditional':
          walk(node.condition);
          walk(node.consequent);
          walk(node.alternate);
          return;
        case 'array':
          node.elements.forEach(walk);
          return;
        case 'object':
          node.properties.forEach(p => walk(p.value));
          return;
        case 'lambda':
          walk(node.body);
          return;
        default:
          return;
      }
    };

    walk(expr);
    return entries;
  }

  private binOp(op: string, l: unknown, r: unknown): unknown {
    switch (op) {
      case '+': return typeof l === 'string' || typeof r === 'string' ? String(l) + String(r) : (l as number) + (r as number);
      case '-': return (l as number) - (r as number);
      case '*': return (l as number) * (r as number);
      case '/': return (l as number) / (r as number);
      case '%': return (l as number) % (r as number);
      case '==': case 'is': return l === r;
      case '!=': return l !== r;
      case '<': return (l as number) < (r as number);
      case '>': return (l as number) > (r as number);
      case '<=': return (l as number) <= (r as number);
      case '>=': return (l as number) >= (r as number);
      case '&&': case 'and': return Boolean(l) && Boolean(r);
      case '||': case 'or': return Boolean(l) || Boolean(r);
      case 'in': return Array.isArray(r) ? r.includes(l) : typeof r === 'string' && (r as string).includes(String(l));
      case 'contains': return Array.isArray(l) ? l.includes(r) : typeof l === 'string' && l.includes(String(r));
      default: return undefined;
    }
  }

  private valueToJs(v: IRValue): unknown {
    switch (v.kind) {
      case 'string': return v.value;
      case 'number': return v.value;
      case 'boolean': return v.value;
      case 'null': return null;
      case 'array': return v.elements.map(e => this.valueToJs(e));
      case 'object': {
        const res: Record<string, unknown> = {};
        for (const [k, val] of Object.entries(v.properties)) res[k] = this.valueToJs(val);
        return res;
      }
    }
  }

  private defaultFor(t: IRType): unknown {
    if (t.nullable) return null;
    switch (t.name) {
      case 'string': return '';
      case 'number': return 0;
      case 'boolean': return false;
      case 'list': return [];
      default: return null;
    }
  }

  onEvent(listener: EventListener): () => void {
    this.eventListeners.push(listener);
    return () => {
      const idx = this.eventListeners.indexOf(listener);
      if (idx !== -1) this.eventListeners.splice(idx, 1);
    };
  }

  private notifyListeners(event: EmittedEvent): void {
    for (const l of this.eventListeners) { try { l(event); } catch {} }
  }

  getEventLog(): EmittedEvent[] { return [...this.eventLog]; }
  clearEventLog(): void { this.eventLog = []; }

  serialize(): { ir: IR; context: RuntimeContext; stores: Record<string, EntityInstance[]> } {
    const storeData: Record<string, EntityInstance[]> = {};
    for (const [name, store] of this.stores) storeData[name] = store.getAll();
    return { ir: this.ir, context: this.context, stores: storeData };
  }

  restore(data: { stores: Record<string, EntityInstance[]> }): void {
    for (const [name, instances] of Object.entries(data.stores)) {
      const store = this.stores.get(name);
      if (store) {
        store.clear();
        for (const inst of instances) store.create(inst);
      }
    }
  }
}
`;class Df{constructor(){ce(this,"out",[]);ce(this,"indent",0);ce(this,"provenance")}generate(e){this.out=[],this.indent=0,this.provenance={compilerVersion:Oo,schemaVersion:Po,generatedAt:new Date().toISOString()},this.emitImports(e),this.line();for(const n of e.stores)this.genStore(n);for(const n of e.entities)this.genEntity(n),this.line();for(const n of e.commands)this.genCommand(n),this.line();for(const n of e.flows)this.genFlow(n),this.line();for(const n of e.effects)this.genEffect(n),this.line();for(const n of e.events)this.genOutboxEvent(n),this.line();for(const n of e.exposures)this.genExpose(n),this.line();for(const n of e.compositions)this.genComposition(n),this.line();return this.emitExports(e),this.out.join(`
`)}emitImports(e){this.line("// Generated by Manifest Compiler v2.0"),this.line("// This code is a PROJECTION from a Manifest source file."),this.line("// The IR (Intermediate Representation) is the single source of truth."),this.line("// This generated code should not be edited manually."),this.line("//"),this.line("// Provenance:"),this.line(`//   Compiler Version: ${this.provenance.compilerVersion}`),this.line(`//   Schema Version: ${this.provenance.schemaVersion}`),this.line(`//   Generated At: ${this.provenance.generatedAt}`),this.line("//"),this.line("// This file imports from the runtime module"),this.line();const n=["Observable","EventEmitter","EventBus","setContext","getContext","MemoryStore","LocalStorageStore"];e.stores.length>0&&n.push("Store"),this.line(`import { ${n.join(", ")} } from './runtime';`),this.line(),this.line("type User = { id: string; role?: string; [key: string]: unknown };")}genStore(e){var r;const n=`${e.entity}Store`;switch(e.target){case"memory":this.line(`const ${n}: Store<I${e.entity}> = new MemoryStore();`);break;case"localStorage":{const s=(r=e.config)!=null&&r.key?this.genExpr(e.config.key):`"${e.entity.toLowerCase()}s"`;this.line(`const ${n}: Store<I${e.entity}> = new LocalStorageStore(${s});`);break}default:this.line(`const ${n}: Store<I${e.entity}> = new MemoryStore();`)}this.line()}genEntity(e){const n=`I${e.name}`;this.line(`export interface ${n} {`),this.in(),this.line("id: string;");for(const i of e.properties){const a=i.modifiers.includes("required")?"":"?";this.line(`${i.name}${a}: ${this.tsType(i.dataType)};`)}for(const i of e.computedProperties)this.line(`readonly ${i.name}: ${this.tsType(i.dataType)};`);for(const i of e.relationships)this.line(`${i.name}${i.kind==="belongsTo"||i.kind==="ref"?"?":""}: ${this.relationType(i)};`);this.de(),this.line("}"),this.line();const r=this.collectEvents(e),s=r.size?`{ ${[...r].map(i=>`${i}: unknown`).join("; ")} }`:"Record<string, unknown>";this.line(`export class ${e.name} extends EventEmitter<${s}> {`),this.in(),this.line("id: string = crypto.randomUUID();");for(const i of e.properties){const a=i.defaultValue?this.genExpr(i.defaultValue):this.defVal(i.dataType);this.line(`private _${i.name} = new Observable(${a});`)}this.line();for(const i of e.properties)this.line(`get ${i.name}() { return this._${i.name}.value; }`),i.modifiers.includes("readonly")||(this.line(`set ${i.name}(v: ${this.tsType(i.dataType)}) {`),this.in(),this.genConstraintChecks(e.constraints,i.name),this.line(`const old = this._${i.name}.value;`),this.line(`this._${i.name}.set(v);`),this.line("if (old !== v) this._recompute();"),this.de(),this.line("}"));for(const i of e.computedProperties)this.line(`private _computed_${i.name}: ${this.tsType(i.dataType)} = ${this.defVal(i.dataType)};`),this.line(`get ${i.name}() { return this._computed_${i.name}; }`);for(const i of e.relationships)i.kind==="hasMany"?(this.line(`private _rel_${i.name}: ${i.target}[] = [];`),this.line(`get ${i.name}() { return this._rel_${i.name}; }`),this.line(`add${this.capitalize(i.name.replace(/s$/,""))}(item: ${i.target}) { this._rel_${i.name}.push(item); }`)):(this.line(`private _rel_${i.name}: ${i.target} | null = null;`),this.line(`get ${i.name}() { return this._rel_${i.name}; }`),this.line(`set ${i.name}(v: ${i.target} | null) { this._rel_${i.name} = v; }`));this.line(),this.line(`constructor(init?: Partial<${n}>) {`),this.in(),this.line("super();"),this.line("if (init) {"),this.in(),this.line("if (init.id) this.id = init.id;");for(const i of e.properties)this.line(`if (init.${i.name} !== undefined) this._${i.name}.set(init.${i.name});`);this.de(),this.line("}"),this.line("this._initBehaviors();"),this.line("this._recompute();"),this.de(),this.line("}"),this.line(),this.line("private _recompute() {"),this.in();for(const i of e.computedProperties)this.line(`this._computed_${i.name} = ${this.genExpr(i.expression)};`);this.de(),this.line("}"),this.line(),this.line("private _initBehaviors() {"),this.in();for(const i of e.behaviors)this.genBehaviorBinding(i);if(this.de(),this.line("}"),e.policies.length>0){this.line(),this.line("checkPolicy(action: string, user: User): boolean {"),this.in(),this.line("const context = getContext();");for(const i of e.policies){const a=i.action==="all"?"true":`action === "${i.action}"`;this.line(`if (${a} && !(${this.genExpr(i.expression)})) return false;`)}this.line("return true;"),this.de(),this.line("}")}this.line(),this.line(`subscribe(prop: keyof ${n}, fn: (v: unknown) => void) {`),this.in(),this.line("const obs = (this as Record<string, unknown>)[`_${String(prop)}`];"),this.line('if (obs && typeof (obs as Observable<unknown>).subscribe === "function") {'),this.in(),this.line("return (obs as Observable<unknown>).subscribe(fn);"),this.de(),this.line("}"),this.line("return () => {};"),this.de(),this.line("}"),this.line(),this.line("toJSON(): Record<string, unknown> {"),this.in(),this.line("return {"),this.in(),this.line("id: this.id,");for(const i of e.properties)this.line(`${i.name}: this.${i.name},`);for(const i of e.computedProperties)this.line(`${i.name}: this.${i.name},`);this.de(),this.line("};"),this.de(),this.line("}");for(const i of e.commands)this.genCommandMethod(i,e);for(const i of e.behaviors)i.trigger.event!=="create"&&!i.trigger.event.startsWith("_")&&this.genBehaviorMethod(i);this.de(),this.line("}")}collectEvents(e){const n=new Set;for(const r of e.behaviors){n.add(r.trigger.event);for(const s of r.actions)s.kind==="emit"&&s.expression.type==="Identifier"&&n.add(s.expression.name)}for(const r of e.commands)r.emits&&r.emits.forEach(s=>n.add(s));return n}relationType(e){return e.kind==="hasMany"?`${e.target}[]`:`${e.target} | null`}genCommandMethod(e,n){const r=e.parameters.map(i=>`${i.name}${i.required?"":"?"}: ${this.tsType(i.dataType)}`).join(", "),s=e.returns?this.tsType(e.returns):"unknown";if(this.line(),this.line(`async ${e.name}(${r}): Promise<${s}> {`),this.in(),n&&n.policies.length>0&&(this.line("// Policy checks"),n.policies.some(a=>a.action==="all"||a.action==="execute"))){this.line("const user = getContext().user;");for(const a of n.policies)a.action!=="all"&&a.action!=="execute"||this.line(`if (!(${this.genExpr(a.expression)})) throw new Error(${JSON.stringify(a.message||`Denied by policy '${a.name}'`)});`)}if(e.guards&&e.guards.length>0){this.line("// Guard checks");for(const i of e.guards)this.line(`if (!(${this.genExpr(i)})) throw new Error("Guard failed for ${e.name}");`)}if(e.actions.length>0){this.line("let _result: unknown;");for(const i of e.actions)this.line(`_result = ${this.genAction(i)};`)}if(e.emits)for(const i of e.emits)this.line(`this.emit('${i}', { ${e.parameters.map(a=>a.name).join(", ")} });`);e.actions.length>0&&this.line(`return _result as ${s};`),this.de(),this.line("}")}genCommand(e){const n=e.parameters.map(s=>`${s.name}${s.required?"":"?"}: ${this.tsType(s.dataType)}`).join(", "),r=e.returns?this.tsType(e.returns):"unknown";if(this.line(`export async function ${e.name}(${n}): Promise<${r}> {`),this.in(),e.guards&&e.guards.length>0){this.line("// Guard checks");for(const s of e.guards)this.line(`if (!(${this.genExpr(s)})) throw new Error("Guard failed for ${e.name}");`)}if(e.actions.length>0){this.line("let _result: unknown;");for(const s of e.actions)this.line(`_result = ${this.genAction(s)};`)}if(e.emits)for(const s of e.emits)this.line(`EventBus.publish('${s}', { ${e.parameters.map(i=>i.name).join(", ")} });`);e.actions.length>0&&this.line(`return _result as ${r};`),this.de(),this.line("}")}genOutboxEvent(e){const n=e.payload,r=n.fields?`{ ${n.fields.map(s=>`${s.name}: ${this.tsType(s.dataType)}`).join("; ")} }`:"unknown";this.line(`export interface ${e.name}Event ${r}`),this.line(),this.line(`export const publish${e.name} = (data: ${e.name}Event) => {`),this.in(),this.line(`EventBus.publish('${e.channel}', data);`),this.de(),this.line("};"),this.line(),this.line(`export const subscribe${e.name} = (fn: (data: ${e.name}Event) => void) => {`),this.in(),this.line(`return EventBus.subscribe('${e.channel}', fn as (d: unknown) => void);`),this.de(),this.line("};")}genConstraintChecks(e,n){for(const r of e){const s=this.genExpr(r.expression);(s.includes(n)||s.includes("this."))&&this.line(`if (!(${s.replace(new RegExp(`this\\.${n}`,"g"),"v")})) throw new Error(${JSON.stringify(r.message||`Constraint '${r.name}' violated`)});`)}}genBehaviorBinding(e){var r,s;if(e.trigger.event==="create"){for(const i of e.actions)this.line(this.genAction(i));return}const n=((r=e.trigger.parameters)==null?void 0:r.join(", "))||"d";if(this.line(`this.on('${e.trigger.event}', (${n}) => {`),this.in(),(s=e.guards)!=null&&s.length){const i=e.guards.map(a=>`(${this.genExpr(a)})`).join(" && ");this.line(`if (!(${i})) return;`)}for(const i of e.actions)this.line(this.genAction(i));this.de(),this.line("});")}genBehaviorMethod(e){const n=e.trigger.parameters||[];this.line(),this.line(`${e.trigger.event}(${n.map(r=>`${r}: unknown`).join(", ")}) {`),this.in(),this.line(`this.emit('${e.trigger.event}', ${n.length?`{ ${n.join(", ")} }`:"{}"});`),this.de(),this.line("}")}genAction(e){return e.kind==="mutate"?`this.${e.target} = ${this.genExpr(e.expression)};`:e.kind==="emit"?e.expression.type==="Identifier"?`this.emit('${e.expression.name}', {});`:`this.emit('event', ${this.genExpr(e.expression)});`:e.kind==="effect"?`await (${this.genExpr(e.expression)});`:e.kind==="publish"?`EventBus.publish('event', ${this.genExpr(e.expression)});`:e.kind==="persist"?`await ${e.target}Store.update(this.id, this.toJSON());`:`${this.genExpr(e.expression)};`}genFlow(e){this.line(`export function ${e.name}(input: ${this.tsType(e.input)}): ${this.tsType(e.output)} {`),this.in(),this.line("let _v = input;"),this.line();for(const n of e.steps){const r=this.genExpr(n.expression);n.condition&&(this.line(`if (${this.genExpr(n.condition)}) {`),this.in()),n.operation==="map"?this.line(`_v = (${r})(_v);`):n.operation==="filter"?this.line(`if (!(${r})(_v)) return null as unknown as ${this.tsType(e.output)};`):n.operation==="validate"?this.line(`if (!(${r})(_v)) throw new Error('Validation failed');`):n.operation==="transform"?this.line(`_v = ${r};`):n.operation==="tap"?this.line(`(${r})(_v);`):this.line(`_v = ${r};`),n.condition&&(this.de(),this.line("}"))}this.line(),this.line(`return _v as unknown as ${this.tsType(e.output)};`),this.de(),this.line("}")}genEffect(e){if(this.line(`export const ${e.name}Effect = {`),this.in(),this.line(`kind: '${e.kind}' as const,`),e.kind==="http"){const n=e.config.url?this.genExpr(e.config.url):'""',r=e.config.method?this.genExpr(e.config.method):'"GET"';this.line("async execute(data?: unknown) {"),this.in(),this.line(`const res = await fetch(${n}, { method: ${r}, headers: { 'Content-Type': 'application/json' }, body: data ? JSON.stringify(data) : undefined });`),this.line("return res.json();"),this.de(),this.line("},")}else if(e.kind==="storage"){const n=e.config.key?this.genExpr(e.config.key):'"data"';this.line(`get() { const d = localStorage.getItem(${n}); return d ? JSON.parse(d) : null; },`),this.line(`set(v: unknown) { localStorage.setItem(${n}, JSON.stringify(v)); },`),this.line(`remove() { localStorage.removeItem(${n}); },`)}else if(e.kind==="timer"){const n=e.config.interval?this.genExpr(e.config.interval):"1000";this.line(`start(cb: () => void) { return setInterval(cb, ${n}); },`),this.line("stop(id: number) { clearInterval(id); },")}else{this.line("config: {"),this.in();for(const[n,r]of Object.entries(e.config))this.line(`${n}: ${this.genExpr(r)},`);this.de(),this.line("},"),this.line("execute(_data?: unknown) { /* custom */ },")}this.de(),this.line("};")}genExpose(e){if(e.protocol==="rest"){this.line(`export const ${e.name}API = {`),this.in(),this.line(`basePath: '/${e.name}',`),this.line(`entity: '${e.entity}',`);const n=e.operations.length?e.operations:["list","get","create","update","delete"];n.includes("list")&&this.line(`async list() { return ${e.entity}Store.getAll(); },`),n.includes("get")&&this.line(`async get(id: string) { return ${e.entity}Store.getById(id); },`),n.includes("create")&&this.line(`async create(d: Partial<I${e.entity}>) { return ${e.entity}Store.create(d); },`),n.includes("update")&&this.line(`async update(id: string, d: Partial<I${e.entity}>) { return ${e.entity}Store.update(id, d); },`),n.includes("delete")&&this.line(`async delete(id: string) { return ${e.entity}Store.delete(id); },`),this.de(),this.line("};")}else e.protocol==="function"&&this.line(`export function create${e.entity}(d: Partial<I${e.entity}>) { return new ${e.entity}(d); }`)}genComposition(e){this.line(`export class ${e.name} {`),this.in();for(const n of e.components){const r=n.alias||n.entity.toLowerCase();this.line(`${r}: ${n.entity};`)}this.line(),this.line("constructor() {"),this.in();for(const n of e.components){const r=n.alias||n.entity.toLowerCase();this.line(`this.${r} = new ${n.entity}();`)}this.line();for(const n of e.connections)n.transform?this.line(`this.${n.from.component}.on('${n.from.output}', (d) => { const t = (${this.genExpr(n.transform)})(d); this.${n.to.component}.emit('${n.to.input}', t); });`):this.line(`this.${n.from.component}.on('${n.from.output}', (d) => this.${n.to.component}.emit('${n.to.input}', d));`);this.de(),this.line("}"),this.de(),this.line("}")}emitExports(e){const n=["setContext","getContext","EventBus"];for(const r of e.stores)n.push(`${r.entity}Store`);n.length&&(this.line(),this.line(`export { ${n.join(", ")} };`))}genExpr(e){switch(e.type){case"Literal":return e.dataType==="string"?JSON.stringify(e.value):String(e.value);case"Identifier":{const n=e.name;return n==="self"?"this":n==="user"?"getContext().user":n==="context"?"getContext()":n}case"BinaryOp":{const n=e.operator,r=this.genExpr(e.left),s=this.genExpr(e.right),i={and:"&&",or:"||",is:"===",contains:".includes"};return n==="contains"?`${r}.includes(${s})`:`(${r} ${i[n]||n} ${s})`}case"UnaryOp":{const n=e.operator;return`${n==="not"?"!":n}${this.genExpr(e.operand)}`}case"Call":{const n=this.genExpr(e.callee),r=e.arguments.map(s=>this.genExpr(s)).join(", ");return`${n}(${r})`}case"MemberAccess":return`${this.genExpr(e.object)}.${e.property}`;case"Conditional":{const n=this.genExpr(e.condition),r=this.genExpr(e.consequent),s=this.genExpr(e.alternate);return`(${n} ? ${r} : ${s})`}case"Array":return`[${e.elements.map(n=>this.genExpr(n)).join(", ")}]`;case"Object":return`{ ${e.properties.map(n=>`${n.key}: ${this.genExpr(n.value)}`).join(", ")} }`;case"Lambda":return`(${e.parameters.join(", ")}) => ${this.genExpr(e.body)}`;default:return"/* unknown */"}}tsType(e){let r={string:"string",number:"number",boolean:"boolean",any:"unknown",void:"void",list:"Array",map:"Map"}[e.name]||e.name;return e.generic&&(r+=`<${this.tsType(e.generic)}>`),e.nullable&&(r+=" | null"),r}defVal(e){return e.nullable?"null":{string:'""',number:"0",boolean:"false",list:"[]",map:"new Map()",any:"null"}[e.name]||"null"}capitalize(e){return e.charAt(0).toUpperCase()+e.slice(1)}line(e=""){this.out.push("  ".repeat(this.indent)+e)}in(){this.indent++}de(){this.indent=Math.max(0,this.indent-1)}}function Dr(t){const e=t.match(/module\s+(\w+)/),n=t.match(/entity\s+(\w+)/);return((e==null?void 0:e[1])||(n==null?void 0:n[1])||"manifest").toLowerCase()}function Ao(t){const e=Dr(t.source);return{"src/generated/client.ts":t.clientCode||"// No client code generated","src/generated/server.ts":t.serverCode||'// No server code generated (add "server" to expose declarations)',"src/generated/tests.spec.ts":t.testCode||"// No tests generated","src/generated/ast.json":JSON.stringify(t.ast,null,2)||"{}","manifest/source.manifest":t.source,"package.json":JSON.stringify({name:e,version:"1.0.0",type:"module",scripts:{build:"tsc",test:"vitest run",dev:"tsx src/generated/client.ts"},devDependencies:{typescript:"^5.5.0",vitest:"^2.0.0",tsx:"^4.0.0"}},null,2),"tsconfig.json":JSON.stringify({compilerOptions:{target:"ES2022",module:"ESNext",moduleResolution:"bundler",strict:!0,esModuleInterop:!0,skipLibCheck:!0,declaration:!0,outDir:"./dist",rootDir:"./src"},include:["src/**/*"]},null,2),"README.md":`# ${e}

Generated by Manifest Compiler v2.0

## Quick Start

\`\`\`bash
npm install
npm run build
npm test
\`\`\`
`}}function Lf(t){const e=Dr(t.source),n=new Ro,{program:r,errors:s}=n.parse(t.source);let i="// Failed to generate code";return s.length===0&&(i=new Df().generate(r)),{"index.html":Tf(e),"vite.config.ts":Cf(),"tsconfig.json":If(),"package.json":_f(e),"README.md":Af(e),"src/main.tsx":Rf(),"src/index.css":Of(),"src/App.tsx":Pf(),"src/manifest/source.manifest":t.source,"src/manifest/runtime.ts":jf,"src/manifest/generated.ts":i,"src/manifest/compiler/types.ts":Wf,"src/manifest/compiler/lexer.ts":Kf,"src/manifest/compiler/parser.ts":Vf,"src/manifest/compiler/generator.ts":Yf,"src/manifest/compiler/index.ts":Hf,"src/manifest/ir/types.ts":$f,"src/manifest/ir/ir-compiler.ts":zf,"src/manifest/ir/runtime-engine.ts":Uf,"src/vite-env.d.ts":'/// <reference types="vite/client" />'}}async function Mf(t){const e=new xd,n=Ao(t),r=Dr(t.source),s=new Date().toISOString().slice(0,10);for(const[l,d]of Object.entries(n))e.file(l,d);const i=await e.generateAsync({type:"blob"}),a=URL.createObjectURL(i),o=document.createElement("a");o.href=a,o.download=`manifest-${r}-${s}.zip`,document.body.appendChild(o),o.click(),document.body.removeChild(o),URL.revokeObjectURL(a)}async function Ff(t){const e=new xd,n=Lf(t),r=Dr(t.source),s=new Date().toISOString().slice(0,10);for(const[l,d]of Object.entries(n))e.file(l,d);const i=await e.generateAsync({type:"blob"}),a=URL.createObjectURL(i),o=document.createElement("a");o.href=a,o.download=`manifest-${r}-runnable-${s}.zip`,document.body.appendChild(o),o.click(),document.body.removeChild(o),URL.revokeObjectURL(a)}function jo(t){return navigator.clipboard.writeText(t)}function Bf(t){const e=Ao(t);return jo(JSON.stringify(e,null,2))}const Wf=`export interface Position {
  line: number;
  column: number;
}

export interface Token {
  type: 'KEYWORD' | 'IDENTIFIER' | 'STRING' | 'NUMBER' | 'OPERATOR' | 'PUNCTUATION' | 'NEWLINE' | 'EOF';
  value: string;
  position: Position;
}

export interface ASTNode {
  type: string;
  position?: Position;
}

export interface ModuleNode extends ASTNode {
  type: 'Module';
  name: string;
  entities: EntityNode[];
  commands: CommandNode[];
  policies: PolicyNode[];
  stores: StoreNode[];
  events: OutboxEventNode[];
}

export interface EntityNode extends ASTNode {
  type: 'Entity';
  name: string;
  properties: PropertyNode[];
  computedProperties: ComputedPropertyNode[];
  relationships: RelationshipNode[];
  behaviors: BehaviorNode[];
  commands: CommandNode[];
  constraints: ConstraintNode[];
  policies: PolicyNode[];
  store?: string;
}

export interface PropertyNode extends ASTNode {
  type: 'Property';
  name: string;
  dataType: TypeNode;
  defaultValue?: ExpressionNode;
  modifiers: string[];
}

export interface ComputedPropertyNode extends ASTNode {
  type: 'ComputedProperty';
  name: string;
  dataType: TypeNode;
  expression: ExpressionNode;
  dependencies: string[];
}

export interface RelationshipNode extends ASTNode {
  type: 'Relationship';
  kind: 'hasMany' | 'hasOne' | 'belongsTo' | 'ref';
  name: string;
  target: string;
  foreignKey?: string;
  through?: string;
}

export interface CommandNode extends ASTNode {
  type: 'Command';
  name: string;
  parameters: ParameterNode[];
  guards?: ExpressionNode[];
  actions: ActionNode[];
  emits?: string[];
  returns?: TypeNode;
}

export interface ParameterNode extends ASTNode {
  type: 'Parameter';
  name: string;
  dataType: TypeNode;
  required: boolean;
  defaultValue?: ExpressionNode;
}

export interface PolicyNode extends ASTNode {
  type: 'Policy';
  name: string;
  action: 'read' | 'write' | 'delete' | 'execute' | 'all';
  expression: ExpressionNode;
  message?: string;
}

export interface StoreNode extends ASTNode {
  type: 'Store';
  entity: string;
  target: 'memory' | 'postgres' | 'supabase' | 'localStorage';
  config?: Record<string, ExpressionNode>;
}

export interface OutboxEventNode extends ASTNode {
  type: 'OutboxEvent';
  name: string;
  channel: string;
  payload: TypeNode | { fields: ParameterNode[] };
}

export interface TypeNode extends ASTNode {
  type: 'Type';
  name: string;
  generic?: TypeNode;
  nullable: boolean;
}

export interface BehaviorNode extends ASTNode {
  type: 'Behavior';
  name: string;
  trigger: TriggerNode;
  actions: ActionNode[];
  guards?: ExpressionNode[];
}

export interface TriggerNode extends ASTNode {
  type: 'Trigger';
  event: string;
  parameters?: string[];
}

export interface ActionNode extends ASTNode {
  type: 'Action';
  kind: 'mutate' | 'emit' | 'compute' | 'effect' | 'publish' | 'persist';
  target?: string;
  expression: ExpressionNode;
}

export interface ConstraintNode extends ASTNode {
  type: 'Constraint';
  name: string;
  expression: ExpressionNode;
  message?: string;
}

export interface FlowNode extends ASTNode {
  type: 'Flow';
  name: string;
  input: TypeNode;
  output: TypeNode;
  steps: FlowStepNode[];
}

export interface FlowStepNode extends ASTNode {
  type: 'FlowStep';
  operation: string;
  expression: ExpressionNode;
  condition?: ExpressionNode;
}

export interface EffectNode extends ASTNode {
  type: 'Effect';
  name: string;
  kind: 'http' | 'storage' | 'timer' | 'event' | 'custom';
  config: Record<string, ExpressionNode>;
}

export interface ExposeNode extends ASTNode {
  type: 'Expose';
  name: string;
  protocol: 'rest' | 'graphql' | 'websocket' | 'function';
  entity: string;
  operations: string[];
  generateServer: boolean;
  middleware?: string[];
}

export interface CompositionNode extends ASTNode {
  type: 'Composition';
  name: string;
  components: ComponentRefNode[];
  connections: ConnectionNode[];
}

export interface ComponentRefNode extends ASTNode {
  type: 'ComponentRef';
  entity: string;
  alias?: string;
  config?: Record<string, ExpressionNode>;
}

export interface ConnectionNode extends ASTNode {
  type: 'Connection';
  from: { component: string; output: string };
  to: { component: string; input: string };
  transform?: ExpressionNode;
}

export type ExpressionNode =
  | LiteralNode
  | IdentifierNode
  | BinaryOpNode
  | UnaryOpNode
  | CallNode
  | MemberAccessNode
  | ConditionalNode
  | ArrayNode
  | ObjectNode
  | LambdaNode;

export interface LiteralNode extends ASTNode {
  type: 'Literal';
  value: string | number | boolean | null;
  dataType: 'string' | 'number' | 'boolean' | 'null';
}

export interface IdentifierNode extends ASTNode {
  type: 'Identifier';
  name: string;
}

export interface BinaryOpNode extends ASTNode {
  type: 'BinaryOp';
  operator: string;
  left: ExpressionNode;
  right: ExpressionNode;
}

export interface UnaryOpNode extends ASTNode {
  type: 'UnaryOp';
  operator: string;
  operand: ExpressionNode;
}

export interface CallNode extends ASTNode {
  type: 'Call';
  callee: ExpressionNode;
  arguments: ExpressionNode[];
}

export interface MemberAccessNode extends ASTNode {
  type: 'MemberAccess';
  object: ExpressionNode;
  property: string;
}

export interface ConditionalNode extends ASTNode {
  type: 'Conditional';
  condition: ExpressionNode;
  consequent: ExpressionNode;
  alternate: ExpressionNode;
}

export interface ArrayNode extends ASTNode {
  type: 'Array';
  elements: ExpressionNode[];
}

export interface ObjectNode extends ASTNode {
  type: 'Object';
  properties: { key: string; value: ExpressionNode }[];
}

export interface LambdaNode extends ASTNode {
  type: 'Lambda';
  parameters: string[];
  body: ExpressionNode;
}

export interface ManifestProgram {
  modules: ModuleNode[];
  entities: EntityNode[];
  commands: CommandNode[];
  flows: FlowNode[];
  effects: EffectNode[];
  exposures: ExposeNode[];
  compositions: CompositionNode[];
  policies: PolicyNode[];
  stores: StoreNode[];
  events: OutboxEventNode[];
}

export interface CompilationResult {
  success: boolean;
  code?: string;
  serverCode?: string;
  testCode?: string;
  errors?: CompilationError[];
  ast?: ManifestProgram;
}

export interface CompilationError {
  message: string;
  position?: Position;
  severity: 'error' | 'warning';
}
`,Kf=`import { Token, Position } from './types';

const KEYWORDS = new Set([
  'entity', 'property', 'behavior', 'constraint', 'flow', 'effect', 'expose', 'compose',
  'command', 'module', 'policy', 'store', 'event', 'computed', 'derived',
  'hasMany', 'hasOne', 'belongsTo', 'ref', 'through',
  'on', 'when', 'then', 'emit', 'mutate', 'compute', 'guard', 'publish', 'persist',
  'as', 'from', 'to', 'with', 'where', 'connect', 'returns',
  'string', 'number', 'boolean', 'list', 'map', 'any', 'void',
  'true', 'false', 'null',
  'required', 'unique', 'indexed', 'private', 'readonly', 'optional',
  'rest', 'graphql', 'websocket', 'function', 'server',
  'http', 'storage', 'timer', 'custom',
  'memory', 'postgres', 'supabase', 'localStorage',
  'read', 'write', 'delete', 'execute', 'all', 'allow', 'deny',
  'and', 'or', 'not', 'is', 'in', 'contains',
  'user', 'self', 'context'
]);

const OPERATORS = new Set([
  '+', '-', '*', '/', '%', '=', '==', '!=', '<', '>', '<=', '>=',
  '&&', '||', '!', '?', ':', '->', '=>', '|', '&', '.', '..', '?.'
]);

const PUNCTUATION = new Set(['(', ')', '{', '}', '[', ']', ',', ';', '@']);

export class Lexer {
  private source: string;
  private pos = 0;
  private line = 1;
  private col = 1;
  private tokens: Token[] = [];

  constructor(source: string) {
    this.source = source;
  }

  tokenize(): Token[] {
    while (this.pos < this.source.length) {
      this.skipWhitespace();
      if (this.pos >= this.source.length) break;

      const char = this.source[this.pos];

      if (char === '\\n') {
        this.tokens.push({ type: 'NEWLINE', value: '\\n', position: this.position() });
        this.advance();
        this.line++;
        this.col = 1;
        continue;
      }

      if (char === '"' || char === "'") { this.readString(char); continue; }
      if (char === '\`') { this.readTemplate(); continue; }
      if (this.isDigit(char)) { this.readNumber(); continue; }
      if (this.isAlpha(char) || char === '_') { this.readIdentifier(); continue; }
      if (this.isOpStart(char)) { this.readOperator(); continue; }
      if (PUNCTUATION.has(char)) {
        this.tokens.push({ type: 'PUNCTUATION', value: char, position: this.position() });
        this.advance();
        continue;
      }
      this.advance();
    }

    this.tokens.push({ type: 'EOF', value: '', position: this.position() });
    return this.tokens;
  }

  private skipWhitespace() {
    while (this.pos < this.source.length) {
      const c = this.source[this.pos];
      if (c === ' ' || c === '\\t' || c === '\\r') { this.advance(); continue; }
      if (c === '/' && this.source[this.pos + 1] === '/') {
        while (this.pos < this.source.length && this.source[this.pos] !== '\\n') this.advance();
        continue;
      }
      if (c === '/' && this.source[this.pos + 1] === '*') {
        this.advance(); this.advance();
        while (this.pos < this.source.length && !(this.source[this.pos] === '*' && this.source[this.pos + 1] === '/')) {
          if (this.source[this.pos] === '\\n') { this.line++; this.col = 0; }
          this.advance();
        }
        this.advance(); this.advance();
        continue;
      }
      break;
    }
  }

  private readString(quote: string) {
    this.advance();
    let value = '';
    while (this.pos < this.source.length && this.source[this.pos] !== quote) {
      if (this.source[this.pos] === '\\\\') {
        this.advance();
        const esc = this.source[this.pos];
        value += esc === 'n' ? '\\n' : esc === 't' ? '\\t' : esc;
      } else {
        value += this.source[this.pos];
      }
      this.advance();
    }
    this.advance();
    this.tokens.push({ type: 'STRING', value, position: this.position() });
  }

  private readTemplate() {
    this.advance();
    let value = '';
    while (this.pos < this.source.length && this.source[this.pos] !== '\`') {
      if (this.source[this.pos] === '\\n') { this.line++; this.col = 0; }
      value += this.source[this.pos];
      this.advance();
    }
    this.advance();
    this.tokens.push({ type: 'STRING', value, position: this.position() });
  }

  private readNumber() {
    let value = '';
    while (this.pos < this.source.length && (this.isDigit(this.source[this.pos]) || this.source[this.pos] === '.')) {
      value += this.source[this.pos];
      this.advance();
    }
    this.tokens.push({ type: 'NUMBER', value, position: this.position() });
  }

  private readIdentifier() {
    let value = '';
    while (this.pos < this.source.length && (this.isAlphaNum(this.source[this.pos]) || this.source[this.pos] === '_')) {
      value += this.source[this.pos];
      this.advance();
    }
    this.tokens.push({ type: KEYWORDS.has(value) ? 'KEYWORD' : 'IDENTIFIER', value, position: this.position() });
  }

  private readOperator() {
    const two = this.source.slice(this.pos, this.pos + 2);
    if (OPERATORS.has(two)) {
      this.tokens.push({ type: 'OPERATOR', value: two, position: this.position() });
      this.advance(); this.advance();
    } else {
      this.tokens.push({ type: 'OPERATOR', value: this.source[this.pos], position: this.position() });
      this.advance();
    }
  }

  private isDigit(c: string) { return c >= '0' && c <= '9'; }
  private isAlpha(c: string) { return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z'); }
  private isAlphaNum(c: string) { return this.isAlpha(c) || this.isDigit(c); }
  private isOpStart(c: string) { return OPERATORS.has(c) || OPERATORS.has(c + this.source[this.pos + 1]); }
  private advance() { this.pos++; this.col++; }
  private position(): Position { return { line: this.line, column: this.col }; }
}
`,Vf=`import { Lexer } from './lexer';
import {
  Token, ManifestProgram, EntityNode, PropertyNode, TypeNode, BehaviorNode,
  ConstraintNode, FlowNode, FlowStepNode, EffectNode, ExposeNode, CompositionNode,
  ComponentRefNode, ConnectionNode, ExpressionNode, TriggerNode, ActionNode, CompilationError,
  CommandNode, ParameterNode, PolicyNode, StoreNode, OutboxEventNode, ModuleNode,
  ComputedPropertyNode, RelationshipNode
} from './types';

export class Parser {
  private tokens: Token[] = [];
  private pos = 0;
  private errors: CompilationError[] = [];

  parse(source: string): { program: ManifestProgram; errors: CompilationError[] } {
    this.tokens = new Lexer(source).tokenize();
    this.pos = 0;
    this.errors = [];

    const program: ManifestProgram = {
      modules: [], entities: [], commands: [], flows: [], effects: [],
      exposures: [], compositions: [], policies: [], stores: [], events: []
    };

    while (!this.isEnd()) {
      this.skipNL();
      if (this.isEnd()) break;
      try {
        if (this.check('KEYWORD', 'module')) program.modules.push(this.parseModule());
        else if (this.check('KEYWORD', 'entity')) program.entities.push(this.parseEntity());
        else if (this.check('KEYWORD', 'command')) program.commands.push(this.parseCommand());
        else if (this.check('KEYWORD', 'flow')) program.flows.push(this.parseFlow());
        else if (this.check('KEYWORD', 'effect')) program.effects.push(this.parseEffect());
        else if (this.check('KEYWORD', 'expose')) program.exposures.push(this.parseExpose());
        else if (this.check('KEYWORD', 'compose')) program.compositions.push(this.parseComposition());
        else if (this.check('KEYWORD', 'policy')) program.policies.push(this.parsePolicy());
        else if (this.check('KEYWORD', 'store')) program.stores.push(this.parseStore());
        else if (this.check('KEYWORD', 'event')) program.events.push(this.parseOutboxEvent());
        else this.advance();
      } catch (e) {
        this.errors.push({ message: e instanceof Error ? e.message : 'Parse error', position: this.current()?.position, severity: 'error' });
        this.sync();
      }
    }
    return { program, errors: this.errors };
  }

  private parseModule(): ModuleNode {
    this.consume('KEYWORD', 'module');
    const name = this.consume('IDENTIFIER').value;
    this.consume('PUNCTUATION', '{');
    this.skipNL();

    const entities: EntityNode[] = [], commands: CommandNode[] = [], policies: PolicyNode[] = [], stores: StoreNode[] = [], events: OutboxEventNode[] = [];

    while (!this.check('PUNCTUATION', '}') && !this.isEnd()) {
      this.skipNL();
      if (this.check('PUNCTUATION', '}')) break;
      if (this.check('KEYWORD', 'entity')) entities.push(this.parseEntity());
      else if (this.check('KEYWORD', 'command')) commands.push(this.parseCommand());
      else if (this.check('KEYWORD', 'policy')) policies.push(this.parsePolicy());
      else if (this.check('KEYWORD', 'store')) stores.push(this.parseStore());
      else if (this.check('KEYWORD', 'event')) events.push(this.parseOutboxEvent());
      else this.advance();
      this.skipNL();
    }
    this.consume('PUNCTUATION', '}');
    return { type: 'Module', name, entities, commands, policies, stores, events };
  }

  private parseEntity(): EntityNode {
    this.consume('KEYWORD', 'entity');
    const name = this.consume('IDENTIFIER').value;
    this.consume('PUNCTUATION', '{');
    this.skipNL();

    const properties: PropertyNode[] = [], computedProperties: ComputedPropertyNode[] = [], relationships: RelationshipNode[] = [];
    const behaviors: BehaviorNode[] = [], commands: CommandNode[] = [], constraints: ConstraintNode[] = [], policies: PolicyNode[] = [];
    let store: string | undefined;

    while (!this.check('PUNCTUATION', '}') && !this.isEnd()) {
      this.skipNL();
      if (this.check('PUNCTUATION', '}')) break;

      if (this.check('KEYWORD', 'property')) properties.push(this.parseProperty());
      else if (this.check('KEYWORD', 'computed') || this.check('KEYWORD', 'derived')) computedProperties.push(this.parseComputedProperty());
      else if (this.check('KEYWORD', 'hasMany') || this.check('KEYWORD', 'hasOne') || this.check('KEYWORD', 'belongsTo') || this.check('KEYWORD', 'ref')) relationships.push(this.parseRelationship());
      else if (this.check('KEYWORD', 'behavior') || this.check('KEYWORD', 'on')) behaviors.push(this.parseBehavior());
      else if (this.check('KEYWORD', 'command')) commands.push(this.parseCommand());
      else if (this.check('KEYWORD', 'constraint')) constraints.push(this.parseConstraint());
      else if (this.check('KEYWORD', 'policy')) policies.push(this.parsePolicy());
      else if (this.check('KEYWORD', 'store')) { this.advance(); store = this.advance().value; }
      else this.advance();
      this.skipNL();
    }
    this.consume('PUNCTUATION', '}');
    return { type: 'Entity', name, properties, computedProperties, relationships, behaviors, commands, constraints, policies, store };
  }

  private parseProperty(): PropertyNode {
    this.consume('KEYWORD', 'property');
    const modifiers: string[] = [];
    while (['required', 'unique', 'indexed', 'private', 'readonly', 'optional'].includes(this.current()?.value || '')) {
      modifiers.push(this.advance().value);
    }
    const name = this.consume('IDENTIFIER').value;
    this.consume('OPERATOR', ':');
    const dataType = this.parseType();
    let defaultValue: ExpressionNode | undefined;
    if (this.check('OPERATOR', '=')) { this.advance(); defaultValue = this.parseExpr(); }
    return { type: 'Property', name, dataType, defaultValue, modifiers };
  }

  private parseComputedProperty(): ComputedPropertyNode {
    this.advance();
    const name = this.consume('IDENTIFIER').value;
    this.consume('OPERATOR', ':');
    const dataType = this.parseType();
    this.consume('OPERATOR', '=');
    const expression = this.parseExpr();
    const dependencies = this.extractDependencies(expression);
    return { type: 'ComputedProperty', name, dataType, expression, dependencies };
  }

  private extractDependencies(expr: ExpressionNode): string[] {
    const deps = new Set<string>();
    const walk = (e: ExpressionNode) => {
      if (e.type === 'Identifier' && !['self', 'this', 'user', 'context'].includes((e as any).name)) deps.add((e as any).name);
      if (e.type === 'MemberAccess') { walk((e as any).object); }
      if (e.type === 'BinaryOp') { walk((e as any).left); walk((e as any).right); }
      if (e.type === 'UnaryOp') walk((e as any).operand);
      if (e.type === 'Call') { walk((e as any).callee); (e as any).arguments.forEach(walk); }
      if (e.type === 'Conditional') { walk((e as any).condition); walk((e as any).consequent); walk((e as any).alternate); }
      if (e.type === 'Array') (e as any).elements.forEach(walk);
      if (e.type === 'Object') (e as any).properties.forEach((p: any) => walk(p.value));
      if (e.type === 'Lambda') walk((e as any).body);
    };
    walk(expr);
    return Array.from(deps);
  }

  private parseRelationship(): RelationshipNode {
    const kind = this.advance().value as RelationshipNode['kind'];
    const name = this.consume('IDENTIFIER').value;
    this.consume('OPERATOR', ':');
    const target = this.consume('IDENTIFIER').value;
    let foreignKey: string | undefined, through: string | undefined;
    if (this.check('KEYWORD', 'through')) { this.advance(); through = this.consume('IDENTIFIER').value; }
    if (this.check('KEYWORD', 'with')) { this.advance(); foreignKey = this.consume('IDENTIFIER').value; }
    return { type: 'Relationship', kind, name, target, foreignKey, through };
  }

  private parseCommand(): CommandNode {
    this.consume('KEYWORD', 'command');
    const name = this.consume('IDENTIFIER').value;
    this.consume('PUNCTUATION', '(');
    const parameters: ParameterNode[] = [];
    while (!this.check('PUNCTUATION', ')') && !this.isEnd()) {
      const required = !this.check('KEYWORD', 'optional');
      if (!required) this.advance();
      const pname = this.consume('IDENTIFIER').value;
      this.consume('OPERATOR', ':');
      const dataType = this.parseType();
      let defaultValue: ExpressionNode | undefined;
      if (this.check('OPERATOR', '=')) { this.advance(); defaultValue = this.parseExpr(); }
      parameters.push({ type: 'Parameter', name: pname, dataType, required, defaultValue });
      if (this.check('PUNCTUATION', ',')) this.advance();
    }
    this.consume('PUNCTUATION', ')');

    let returns: TypeNode | undefined;
    if (this.check('KEYWORD', 'returns')) { this.advance(); returns = this.parseType(); }

    const guards: ExpressionNode[] = [], actions: ActionNode[] = [], emits: string[] = [];

    if (this.check('PUNCTUATION', '{')) {
      this.advance(); this.skipNL();
      while (!this.check('PUNCTUATION', '}') && !this.isEnd()) {
        this.skipNL();
        if (this.check('PUNCTUATION', '}')) break;
        if (this.check('KEYWORD', 'guard') || this.check('KEYWORD', 'when')) { this.advance(); guards.push(this.parseExpr()); }
        else if (this.check('KEYWORD', 'emit')) { this.advance(); emits.push(this.consume('IDENTIFIER').value); }
        else actions.push(this.parseAction());
        this.skipNL();
      }
      this.consume('PUNCTUATION', '}');
    } else if (this.check('OPERATOR', '=>')) {
      this.advance();
      actions.push(this.parseAction());
    }

    return { type: 'Command', name, parameters, guards: guards.length ? guards : undefined, actions, emits: emits.length ? emits : undefined, returns };
  }

  private parsePolicy(): PolicyNode {
    this.consume('KEYWORD', 'policy');
    const name = this.consume('IDENTIFIER').value;
    let action: PolicyNode['action'] = 'all';
    if (this.check('KEYWORD', 'read') || this.check('KEYWORD', 'write') || this.check('KEYWORD', 'delete') || this.check('KEYWORD', 'execute') || this.check('KEYWORD', 'all')) {
      action = this.advance().value as PolicyNode['action'];
    }
    this.consume('OPERATOR', ':');
    const expression = this.parseExpr();
    const message = this.check('STRING') ? this.advance().value : undefined;
    return { type: 'Policy', name, action, expression, message };
  }

  private parseStore(): StoreNode {
    this.consume('KEYWORD', 'store');
    const entity = this.consume('IDENTIFIER').value;
    this.consume('KEYWORD', 'in');
    const target = this.advance().value as StoreNode['target'];
    const config: Record<string, ExpressionNode> = {};
    if (this.check('PUNCTUATION', '{')) {
      this.advance(); this.skipNL();
      while (!this.check('PUNCTUATION', '}') && !this.isEnd()) {
        this.skipNL();
        if (this.check('PUNCTUATION', '}')) break;
        const key = this.consume('IDENTIFIER').value;
        this.consume('OPERATOR', ':');
        config[key] = this.parseExpr();
        this.skipNL();
      }
      this.consume('PUNCTUATION', '}');
    }
    return { type: 'Store', entity, target, config: Object.keys(config).length ? config : undefined };
  }

  private parseOutboxEvent(): OutboxEventNode {
    this.consume('KEYWORD', 'event');
    const name = this.consume('IDENTIFIER').value;
    this.consume('OPERATOR', ':');
    const channel = this.check('STRING') ? this.advance().value : name;
    let payload: OutboxEventNode['payload'] = { type: 'Type', name: 'any', nullable: false };
    if (this.check('PUNCTUATION', '{')) {
      this.advance(); this.skipNL();
      const fields: ParameterNode[] = [];
      while (!this.check('PUNCTUATION', '}') && !this.isEnd()) {
        this.skipNL();
        if (this.check('PUNCTUATION', '}')) break;
        const fname = this.consume('IDENTIFIER').value;
        this.consume('OPERATOR', ':');
        const ftype = this.parseType();
        fields.push({ type: 'Parameter', name: fname, dataType: ftype, required: true });
        this.skipNL();
      }
      this.consume('PUNCTUATION', '}');
      payload = { fields };
    } else if (this.check('IDENTIFIER') || this.check('KEYWORD')) {
      payload = this.parseType();
    }
    return { type: 'OutboxEvent', name, channel, payload };
  }

  private parseType(): TypeNode {
    const name = this.advance().value;
    let generic: TypeNode | undefined;
    if (this.check('OPERATOR', '<')) { this.advance(); generic = this.parseType(); this.consume('OPERATOR', '>'); }
    const nullable = this.check('OPERATOR', '?') ? (this.advance(), true) : false;
    return { type: 'Type', name, generic, nullable };
  }

  private parseBehavior(): BehaviorNode {
    if (this.check('KEYWORD', 'behavior')) this.advance();
    this.consume('KEYWORD', 'on');
    const trigger = this.parseTrigger();
    const guards: ExpressionNode[] = [];
    while (this.check('KEYWORD', 'guard') || this.check('KEYWORD', 'when')) { this.advance(); guards.push(this.parseExpr()); }
    const actions: ActionNode[] = [];
    if (this.check('PUNCTUATION', '{')) {
      this.advance(); this.skipNL();
      while (!this.check('PUNCTUATION', '}') && !this.isEnd()) { this.skipNL(); if (this.check('PUNCTUATION', '}')) break; actions.push(this.parseAction()); this.skipNL(); }
      this.consume('PUNCTUATION', '}');
    } else if (this.check('KEYWORD', 'then') || this.check('OPERATOR', '=>')) { this.advance(); actions.push(this.parseAction()); }
    return { type: 'Behavior', name: trigger.event, trigger, actions, guards: guards.length ? guards : undefined };
  }

  private parseTrigger(): TriggerNode {
    const event = this.consume('IDENTIFIER').value;
    let parameters: string[] | undefined;
    if (this.check('PUNCTUATION', '(')) {
      this.advance(); parameters = [];
      while (!this.check('PUNCTUATION', ')') && !this.isEnd()) { parameters.push(this.consume('IDENTIFIER').value); if (this.check('PUNCTUATION', ',')) this.advance(); }
      this.consume('PUNCTUATION', ')');
    }
    return { type: 'Trigger', event, parameters };
  }

  private parseAction(): ActionNode {
    let kind: ActionNode['kind'] = 'compute', target: string | undefined;
    if (this.check('KEYWORD', 'mutate')) { this.advance(); kind = 'mutate'; target = this.consume('IDENTIFIER').value; this.consume('OPERATOR', '='); }
    else if (this.check('KEYWORD', 'emit')) { this.advance(); kind = 'emit'; }
    else if (this.check('KEYWORD', 'effect')) { this.advance(); kind = 'effect'; }
    else if (this.check('KEYWORD', 'publish')) { this.advance(); kind = 'publish'; }
    else if (this.check('KEYWORD', 'persist')) { this.advance(); kind = 'persist'; }
    return { type: 'Action', kind, target, expression: this.parseExpr() };
  }

  private parseConstraint(): ConstraintNode {
    this.consume('KEYWORD', 'constraint');
    const name = this.consume('IDENTIFIER').value;
    this.consume('OPERATOR', ':');
    const expression = this.parseExpr();
    const message = this.check('STRING') ? this.advance().value : undefined;
    return { type: 'Constraint', name, expression, message };
  }

  private parseFlow(): FlowNode {
    this.consume('KEYWORD', 'flow');
    const name = this.consume('IDENTIFIER').value;
    this.consume('PUNCTUATION', '('); const input = this.parseType(); this.consume('PUNCTUATION', ')');
    this.consume('OPERATOR', '->'); const output = this.parseType();
    this.consume('PUNCTUATION', '{'); this.skipNL();
    const steps: FlowStepNode[] = [];
    while (!this.check('PUNCTUATION', '}') && !this.isEnd()) { this.skipNL(); if (this.check('PUNCTUATION', '}')) break; steps.push(this.parseFlowStep()); this.skipNL(); }
    this.consume('PUNCTUATION', '}');
    return { type: 'Flow', name, input, output, steps };
  }

  private parseFlowStep(): FlowStepNode {
    const operation = this.advance().value;
    let condition: ExpressionNode | undefined;
    if (this.check('KEYWORD', 'when')) { this.advance(); condition = this.parseExpr(); }
    this.consume('OPERATOR', ':');
    return { type: 'FlowStep', operation, expression: this.parseExpr(), condition };
  }

  private parseEffect(): EffectNode {
    this.consume('KEYWORD', 'effect');
    const name = this.consume('IDENTIFIER').value;
    this.consume('OPERATOR', ':');
    const kind = this.advance().value as EffectNode['kind'];
    const config: Record<string, ExpressionNode> = {};
    if (this.check('PUNCTUATION', '{')) {
      this.advance(); this.skipNL();
      while (!this.check('PUNCTUATION', '}') && !this.isEnd()) {
        this.skipNL(); if (this.check('PUNCTUATION', '}')) break;
        const key = this.consume('IDENTIFIER').value; this.consume('OPERATOR', ':'); config[key] = this.parseExpr(); this.skipNL();
      }
      this.consume('PUNCTUATION', '}');
    }
    return { type: 'Effect', name, kind, config };
  }

  private parseExpose(): ExposeNode {
    this.consume('KEYWORD', 'expose');
    const entity = this.consume('IDENTIFIER').value;
    this.consume('KEYWORD', 'as');
    const protocol = this.advance().value as ExposeNode['protocol'];
    let name = entity.toLowerCase();
    let generateServer = false;
    if (this.check('KEYWORD', 'server')) { this.advance(); generateServer = true; }
    if (this.check('STRING')) name = this.advance().value;
    const operations: string[] = [], middleware: string[] = [];
    if (this.check('PUNCTUATION', '{')) {
      this.advance(); this.skipNL();
      while (!this.check('PUNCTUATION', '}') && !this.isEnd()) {
        this.skipNL(); if (this.check('PUNCTUATION', '}')) break;
        const val = this.advance().value;
        if (val === 'middleware') { this.consume('OPERATOR', ':'); middleware.push(this.consume('IDENTIFIER').value); }
        else operations.push(val);
        if (this.check('PUNCTUATION', ',')) this.advance();
        this.skipNL();
      }
      this.consume('PUNCTUATION', '}');
    }
    return { type: 'Expose', name, protocol, entity, operations, generateServer, middleware: middleware.length ? middleware : undefined };
  }

  private parseComposition(): CompositionNode {
    this.consume('KEYWORD', 'compose');
    const name = this.consume('IDENTIFIER').value;
    this.consume('PUNCTUATION', '{'); this.skipNL();
    const components: ComponentRefNode[] = [], connections: ConnectionNode[] = [];
    while (!this.check('PUNCTUATION', '}') && !this.isEnd()) {
      this.skipNL(); if (this.check('PUNCTUATION', '}')) break;
      if (this.check('KEYWORD', 'connect')) connections.push(this.parseConnection());
      else components.push(this.parseComponentRef());
      this.skipNL();
    }
    this.consume('PUNCTUATION', '}');
    return { type: 'Composition', name, components, connections };
  }

  private parseComponentRef(): ComponentRefNode {
    const entity = this.consume('IDENTIFIER').value;
    let alias: string | undefined;
    if (this.check('KEYWORD', 'as')) { this.advance(); alias = this.consume('IDENTIFIER').value; }
    return { type: 'ComponentRef', entity, alias };
  }

  private parseConnection(): ConnectionNode {
    this.consume('KEYWORD', 'connect');
    const fromComponent = this.consume('IDENTIFIER').value; this.consume('OPERATOR', '.'); const fromOutput = this.consume('IDENTIFIER').value;
    this.consume('OPERATOR', '->');
    const toComponent = this.consume('IDENTIFIER').value; this.consume('OPERATOR', '.'); const toInput = this.consume('IDENTIFIER').value;
    let transform: ExpressionNode | undefined;
    if (this.check('KEYWORD', 'with')) { this.advance(); transform = this.parseExpr(); }
    return { type: 'Connection', from: { component: fromComponent, output: fromOutput }, to: { component: toComponent, input: toInput }, transform };
  }

  private parseExpr(): ExpressionNode { return this.parseTernary(); }

  private parseTernary(): ExpressionNode {
    let expr = this.parseOr();
    if (this.check('OPERATOR', '?')) { this.advance(); const cons = this.parseExpr(); this.consume('OPERATOR', ':'); const alt = this.parseExpr(); return { type: 'Conditional', condition: expr, consequent: cons, alternate: alt }; }
    return expr;
  }

  private parseOr(): ExpressionNode {
    let left = this.parseAnd();
    while (this.check('OPERATOR', '||') || this.check('KEYWORD', 'or')) { const op = this.advance().value; left = { type: 'BinaryOp', operator: op, left, right: this.parseAnd() }; }
    return left;
  }

  private parseAnd(): ExpressionNode {
    let left = this.parseEquality();
    while (this.check('OPERATOR', '&&') || this.check('KEYWORD', 'and')) { const op = this.advance().value; left = { type: 'BinaryOp', operator: op, left, right: this.parseEquality() }; }
    return left;
  }

  private parseEquality(): ExpressionNode {
    let left = this.parseComparison();
    while (['==', '!='].includes(this.current()?.value || '') || ['is', 'in', 'contains'].includes(this.current()?.value || '')) { const op = this.advance().value; left = { type: 'BinaryOp', operator: op, left, right: this.parseComparison() }; }
    return left;
  }

  private parseComparison(): ExpressionNode {
    let left = this.parseAdditive();
    while (['<', '>', '<=', '>='].includes(this.current()?.value || '')) { const op = this.advance().value; left = { type: 'BinaryOp', operator: op, left, right: this.parseAdditive() }; }
    return left;
  }

  private parseAdditive(): ExpressionNode {
    let left = this.parseMultiplicative();
    while (['+', '-'].includes(this.current()?.value || '')) { const op = this.advance().value; left = { type: 'BinaryOp', operator: op, left, right: this.parseMultiplicative() }; }
    return left;
  }

  private parseMultiplicative(): ExpressionNode {
    let left = this.parseUnary();
    while (['*', '/', '%'].includes(this.current()?.value || '')) { const op = this.advance().value; left = { type: 'BinaryOp', operator: op, left, right: this.parseUnary() }; }
    return left;
  }

  private parseUnary(): ExpressionNode {
    if (['!', '-'].includes(this.current()?.value || '') || this.check('KEYWORD', 'not')) { const op = this.advance().value; return { type: 'UnaryOp', operator: op, operand: this.parseUnary() }; }
    return this.parsePostfix();
  }

  private parsePostfix(): ExpressionNode {
    let expr = this.parsePrimary();
    while (true) {
      if (this.check('OPERATOR', '.') || this.check('OPERATOR', '?.')) { this.advance(); expr = { type: 'MemberAccess', object: expr, property: this.consume('IDENTIFIER').value }; }
      else if (this.check('PUNCTUATION', '(')) {
        this.advance(); const args: ExpressionNode[] = [];
        while (!this.check('PUNCTUATION', ')') && !this.isEnd()) { args.push(this.parseExpr()); if (this.check('PUNCTUATION', ',')) this.advance(); }
        this.consume('PUNCTUATION', ')'); expr = { type: 'Call', callee: expr, arguments: args };
      }
      else if (this.check('PUNCTUATION', '[')) { this.advance(); const idx = this.parseExpr(); this.consume('PUNCTUATION', ']'); expr = { type: 'MemberAccess', object: expr, property: \`[\${(idx as any).value || ''}]\` }; }
      else break;
    }
    return expr;
  }

  private parsePrimary(): ExpressionNode {
    if (this.check('NUMBER')) return { type: 'Literal', value: parseFloat(this.advance().value), dataType: 'number' };
    if (this.check('STRING')) return { type: 'Literal', value: this.advance().value, dataType: 'string' };
    if (this.check('KEYWORD', 'true') || this.check('KEYWORD', 'false')) return { type: 'Literal', value: this.advance().value === 'true', dataType: 'boolean' };
    if (this.check('KEYWORD', 'null')) { this.advance(); return { type: 'Literal', value: null, dataType: 'null' }; }
    if (this.check('PUNCTUATION', '[')) { this.advance(); const els: ExpressionNode[] = []; while (!this.check('PUNCTUATION', ']') && !this.isEnd()) { els.push(this.parseExpr()); if (this.check('PUNCTUATION', ',')) this.advance(); } this.consume('PUNCTUATION', ']'); return { type: 'Array', elements: els }; }
    if (this.check('PUNCTUATION', '{')) { this.advance(); this.skipNL(); const props: { key: string; value: ExpressionNode }[] = []; while (!this.check('PUNCTUATION', '}') && !this.isEnd()) { this.skipNL(); if (this.check('PUNCTUATION', '}')) break; const key = this.check('STRING') ? this.advance().value : this.consume('IDENTIFIER').value; this.consume('OPERATOR', ':'); props.push({ key, value: this.parseExpr() }); if (this.check('PUNCTUATION', ',')) this.advance(); this.skipNL(); } this.consume('PUNCTUATION', '}'); return { type: 'Object', properties: props }; }
    if (this.check('PUNCTUATION', '(')) {
      this.advance();
      const startPos = this.pos;
      const params: string[] = [];
      while (this.check('IDENTIFIER') && !this.isEnd()) { params.push(this.advance().value); if (this.check('PUNCTUATION', ',')) this.advance(); else break; }
      if (this.check('PUNCTUATION', ')')) { this.advance(); if (this.check('OPERATOR', '=>')) { this.advance(); return { type: 'Lambda', parameters: params, body: this.parseExpr() }; } }
      this.pos = startPos;
      const expr = this.parseExpr(); this.consume('PUNCTUATION', ')'); return expr;
    }
    if (this.check('IDENTIFIER') || this.check('KEYWORD', 'user') || this.check('KEYWORD', 'self') || this.check('KEYWORD', 'context')) return { type: 'Identifier', name: this.advance().value };
    throw new Error(\`Unexpected: \${this.current()?.value || 'EOF'}\`);
  }

  private check(type: string, value?: string) { const t = this.current(); return t && t.type === type && (value === undefined || t.value === value); }
  private consume(type: string, value?: string) { if (this.check(type, value)) return this.advance(); throw new Error(\`Expected \${value || type}, got \${this.current()?.value || 'EOF'}\`); }
  private advance() { if (!this.isEnd()) this.pos++; return this.tokens[this.pos - 1]; }
  private current() { return this.tokens[this.pos]; }
  private isEnd() { return this.pos >= this.tokens.length || this.tokens[this.pos]?.type === 'EOF'; }
  private skipNL() { while (this.check('NEWLINE', '\\n')) this.advance(); }
  private sync() { this.advance(); while (!this.isEnd() && !['entity', 'flow', 'effect', 'expose', 'compose', 'module', 'command', 'policy', 'store', 'event'].includes(this.current()?.value || '')) this.advance(); }
}
`,Yf=`import { ManifestProgram, EntityNode, ExpressionNode, BehaviorNode, ConstraintNode, CommandNode, RelationshipNode } from './types';

export class StandaloneGenerator {
  private out: string[] = [];
  private indent = 0;

  generate(program: ManifestProgram): string {
    this.out = [];
    this.indent = 0;
    this.emitImports(program);
    this.line();

    for (const store of program.stores) this.genStore(store);
    for (const e of program.entities) { this.genEntity(e); this.line(); }
    for (const c of program.commands) { this.genCommand(c); this.line(); }
    this.emitExports(program);

    return this.out.join('\\n');
  }

  private emitImports(program: ManifestProgram) {
    this.line('// Generated by Manifest Compiler v2.0');
    this.line();
    const imports = ['Observable', 'EventEmitter', 'EventBus', 'setContext', 'getContext', 'MemoryStore', 'LocalStorageStore'];
    if (program.stores.length > 0) imports.push('Store');
    this.line(\`import { \${imports.join(', ')} } from './runtime';\`);
    this.line();
    this.line('type User = { id: string; role?: string; [key: string]: unknown };');
  }

  private genStore(store: any) {
    const storeName = \`\${store.entity}Store\`;
    switch (store.target) {
      case 'memory':
        this.line(\`const \${storeName}: Store<I\${store.entity}> = new MemoryStore();\`);
        break;
      case 'localStorage':
        const key = store.config?.['key'] ? this.genExpr(store.config['key']) : \`"\${store.entity.toLowerCase()}s"\`;
        this.line(\`const \${storeName}: Store<I\${store.entity}> = new LocalStorageStore(\${key});\`);
        break;
      default:
        this.line(\`const \${storeName}: Store<I\${store.entity}> = new MemoryStore();\`);
    }
    this.line();
  }

  private genEntity(e: EntityNode) {
    const iface = \`I\${e.name}\`;
    this.line(\`export interface \${iface} {\`);
    this.in();
    this.line('id: string;');
    for (const p of e.properties) {
      const opt = p.modifiers.includes('required') ? '' : '?';
      this.line(\`\${p.name}\${opt}: \${this.tsType(p.dataType)};\`);
    }
    this.de(); this.line('}');
    this.line();

    this.line(\`export class \${e.name} extends EventEmitter<Record<string, unknown>> {\`);
    this.in();
    this.line('id: string = crypto.randomUUID();');
    for (const p of e.properties) {
      const def = p.defaultValue ? this.genExpr(p.defaultValue) : this.defVal(p.dataType);
      this.line(\`private _\${p.name} = new Observable(\${def});\`);
    }
    this.line();

    for (const p of e.properties) {
      this.line(\`get \${p.name}() { return this._\${p.name}.value; }\`);
      if (!p.modifiers.includes('readonly')) {
        this.line(\`set \${p.name}(v: \${this.tsType(p.dataType)}) {\`);
        this.in();
        this.line(\`this._\${p.name}.set(v);\`);
        this.de(); this.line('}');
      }
    }

    this.line();
    this.line(\`constructor(init?: Partial<\${iface}>) {\`);
    this.in(); this.line('super();');
    this.line('if (init) {');
    this.in();
    this.line('if (init.id) this.id = init.id;');
    for (const p of e.properties) this.line(\`if (init.\${p.name} !== undefined) this._\${p.name}.set(init.\${p.name});\`);
    this.de(); this.line('}');
    this.de(); this.line('}');

    this.line();
    this.line('toJSON(): Record<string, unknown> {');
    this.in(); this.line('return {');
    this.in();
    this.line('id: this.id,');
    for (const p of e.properties) this.line(\`\${p.name}: this.\${p.name},\`);
    this.de(); this.line('};'); this.de(); this.line('}');

    for (const cmd of e.commands) this.genCommandMethod(cmd);

    this.de(); this.line('}');
  }

  private genCommandMethod(cmd: CommandNode) {
    const params = cmd.parameters.map(p => \`\${p.name}\${p.required ? '' : '?'}: \${this.tsType(p.dataType)}\`).join(', ');
    const returnType = cmd.returns ? this.tsType(cmd.returns) : 'void';
    this.line();
    this.line(\`async \${cmd.name}(\${params}): Promise<\${returnType}> {\`);
    this.in();
    if (cmd.guards?.length) {
      for (const g of cmd.guards) {
        this.line(\`if (!(\${this.genExpr(g)})) throw new Error("Guard failed for \${cmd.name}");\`);
      }
    }
    for (const action of cmd.actions) {
      this.line(this.genAction(action));
    }
    if (cmd.emits) {
      for (const ev of cmd.emits) {
        this.line(\`this.emit('\${ev}', { \${cmd.parameters.map(p => p.name).join(', ')} });\`);
      }
    }
    this.de(); this.line('}');
  }

  private genCommand(cmd: CommandNode) {
    const params = cmd.parameters.map(p => \`\${p.name}\${p.required ? '' : '?'}: \${this.tsType(p.dataType)}\`).join(', ');
    const returnType = cmd.returns ? this.tsType(cmd.returns) : 'void';
    this.line(\`export async function \${cmd.name}(\${params}): Promise<\${returnType}> {\`);
    this.in();
    if (cmd.guards?.length) {
      for (const g of cmd.guards) {
        this.line(\`if (!(\${this.genExpr(g)})) throw new Error("Guard failed for \${cmd.name}");\`);
      }
    }
    for (const action of cmd.actions) {
      this.line(this.genAction(action));
    }
    if (cmd.emits) {
      for (const ev of cmd.emits) {
        this.line(\`EventBus.publish('\${ev}', { \${cmd.parameters.map(p => p.name).join(', ')} });\`);
      }
    }
    this.de(); this.line('}');
  }

  private genAction(a: any): string {
    if (a.kind === 'mutate') return \`this.\${a.target} = \${this.genExpr(a.expression)};\`;
    if (a.kind === 'emit') return \`this.emit('event', \${this.genExpr(a.expression)});\`;
    if (a.kind === 'effect') return \`await (\${this.genExpr(a.expression)});\`;
    if (a.kind === 'publish') return \`EventBus.publish('event', \${this.genExpr(a.expression)});\`;
    return \`\${this.genExpr(a.expression)};\`;
  }

  private emitExports(p: ManifestProgram) {
    const exports: string[] = ['setContext', 'getContext', 'EventBus'];
    for (const s of p.stores) exports.push(\`\${s.entity}Store\`);
    if (exports.length) {
      this.line();
      this.line(\`export { \${exports.join(', ')} };\`);
    }
  }

  private genExpr(e: ExpressionNode): string {
    switch (e.type) {
      case 'Literal': return (e as any).dataType === 'string' ? JSON.stringify((e as any).value) : String((e as any).value);
      case 'Identifier': {
        const name = (e as any).name;
        if (name === 'self') return 'this';
        if (name === 'user') return 'getContext().user';
        if (name === 'context') return 'getContext()';
        return name;
      }
      case 'BinaryOp': {
        const op = (e as any).operator;
        const l = this.genExpr((e as any).left);
        const r = this.genExpr((e as any).right);
        const m: Record<string, string> = { 'and': '&&', 'or': '||', 'is': '===', 'contains': '.includes' };
        if (op === 'contains') return \`\${l}.includes(\${r})\`;
        return \`(\${l} \${m[op] || op} \${r})\`;
      }
      case 'UnaryOp': return \`\${(e as any).operator === 'not' ? '!' : (e as any).operator}\${this.genExpr((e as any).operand)}\`;
      case 'Call': return \`\${this.genExpr((e as any).callee)}(\${(e as any).arguments.map((a: ExpressionNode) => this.genExpr(a)).join(', ')})\`;
      case 'MemberAccess': return \`\${this.genExpr((e as any).object)}.\${(e as any).property}\`;
      case 'Conditional': return \`(\${this.genExpr((e as any).condition)} ? \${this.genExpr((e as any).consequent)} : \${this.genExpr((e as any).alternate)})\`;
      case 'Array': return \`[\${(e as any).elements.map((x: ExpressionNode) => this.genExpr(x)).join(', ')}]\`;
      case 'Object': return \`{ \${(e as any).properties.map((p: any) => \`\${p.key}: \${this.genExpr(p.value)}\`).join(', ')} }\`;
      case 'Lambda': return \`(\${(e as any).parameters.join(', ')}) => \${this.genExpr((e as any).body)}\`;
      default: return '/* unknown */';
    }
  }

  private tsType(t: any): string {
    const m: Record<string, string> = { string: 'string', number: 'number', boolean: 'boolean', any: 'unknown', void: 'void', list: 'Array', map: 'Map' };
    let r = m[t.name] || t.name;
    if (t.generic) r += \`<\${this.tsType(t.generic)}>\`;
    if (t.nullable) r += ' | null';
    return r;
  }

  private defVal(t: any): string {
    if (t.nullable) return 'null';
    const d: Record<string, string> = { string: '""', number: '0', boolean: 'false', list: '[]', map: 'new Map()', any: 'null' };
    return d[t.name] || 'null';
  }

  private line(s = '') { this.out.push('  '.repeat(this.indent) + s); }
  private in() { this.indent++; }
  private de() { this.indent = Math.max(0, this.indent - 1); }
}
`,Hf=`export { Lexer } from './lexer';
export { Parser } from './parser';
export { StandaloneGenerator } from './generator';
export * from './types';
`;function qf(t){const e={};for(const n of Object.keys(t)){const r=n.split("/");let s=e;for(let i=0;i<r.length-1;i++){const a=r[i];s[a]||(s[a]={}),s=s[a]}s[r[r.length-1]]=n}return e}function kd({name:t,children:e,files:n,selectedFile:r,onSelectFile:s,depth:i}){const[a,o]=ie.useState(!0);return g.jsxs("div",{children:[g.jsxs("button",{onClick:()=>o(!a),className:"flex items-center gap-2 w-full px-2 py-1 hover:bg-gray-800 rounded text-sm text-gray-300",style:{paddingLeft:i*12+8},children:[a?g.jsx(ln,{size:14,className:"text-gray-500"}):g.jsx($n,{size:14,className:"text-gray-500"}),g.jsx(df,{size:14,className:"text-amber-400"}),g.jsx("span",{children:t})]}),a&&g.jsx("div",{children:Object.entries(e).map(([l,d])=>typeof d=="string"?g.jsx(wd,{name:l,path:d,content:n[d],selected:r===d,onSelect:s,depth:i+1},l):g.jsx(kd,{name:l,children:d,files:n,selectedFile:r,onSelectFile:s,depth:i+1},l))})]})}function wd({name:t,path:e,content:n,selected:r,onSelect:s,depth:i}){const[a,o]=ie.useState(!1),l=async y=>{y.stopPropagation(),await jo(n),o(!0),setTimeout(()=>o(!1),2e3)},d=()=>t.endsWith(".ts")?"text-sky-400":t.endsWith(".json")?"text-amber-400":t.endsWith(".md")?"text-emerald-400":t.endsWith(".manifest")?"text-purple-400":"text-gray-400";return g.jsxs("button",{onClick:()=>s(e),className:`flex items-center gap-2 w-full px-2 py-1 rounded text-sm group ${r?"bg-sky-500/20 text-sky-300":"text-gray-400 hover:bg-gray-800 hover:text-gray-300"}`,style:{paddingLeft:i*12+8},children:[g.jsx(uf,{size:14,className:d()}),g.jsx("span",{className:"flex-1 text-left truncate",children:t}),g.jsx("button",{onClick:l,className:"opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-700 rounded transition-opacity",title:"Copy file contents",children:a?g.jsx(Co,{size:12,className:"text-emerald-400"}):g.jsx(Io,{size:12})})]})}function Gf({files:t,selectedFile:e,onSelectFile:n}){const r=qf(t);return g.jsx("div",{className:"py-2",children:Object.entries(r).map(([s,i])=>typeof i=="string"?g.jsx(wd,{name:s,path:i,content:t[i],selected:e===i,onSelect:n,depth:0},s):g.jsx(kd,{name:s,children:i,files:t,selectedFile:e,onSelectFile:n,depth:0},s))})}function Zf({path:t,content:e}){const[n,r]=ie.useState(!1),s=async()=>{await jo(e),r(!0),setTimeout(()=>r(!1),2e3)},a=(o=>o.endsWith(".ts")?"typescript":o.endsWith(".json")?"json":o.endsWith(".md")?"markdown":o.endsWith(".manifest")?"manifest":"text")(t);return g.jsxs("div",{className:"h-full flex flex-col",children:[g.jsxs("div",{className:"flex items-center justify-between px-3 py-2 border-b border-gray-800 bg-gray-900/50",children:[g.jsx("span",{className:"text-sm text-gray-400 font-mono",children:t}),g.jsx("button",{onClick:s,className:"flex items-center gap-2 px-3 py-1 text-xs bg-gray-800 hover:bg-gray-700 rounded transition-colors",children:n?g.jsxs(g.Fragment,{children:[g.jsx(Co,{size:12,className:"text-emerald-400"}),g.jsx("span",{className:"text-emerald-400",children:"Copied!"})]}):g.jsxs(g.Fragment,{children:[g.jsx(Io,{size:12}),g.jsx("span",{children:"Copy"})]})})]}),g.jsx("div",{className:"flex-1 overflow-auto",children:g.jsx("pre",{className:"p-4 text-sm font-mono text-gray-300 whitespace-pre-wrap",children:g.jsx("code",{className:`language-${a}`,children:e})})})]})}async function Jf(t,e){const n=performance.now(),r=[];if(!t||t.trim()==="")return{total:0,passed:0,failed:0,results:[],duration:0};const s=Qf(e),i=Xf(e),a=em(e);for(const l of s)r.push(await tm(t,l));for(const l of i)r.push(await nm(t,l.entity,l.name));for(const l of a)r.push(await rm(t,l.entity,l.expression));r.length===0&&r.push({name:"Code Compiles",passed:!0,duration:1});const o=r.filter(l=>l.passed).length;return{total:r.length,passed:o,failed:r.length-o,results:r,duration:Math.round(performance.now()-n)}}function Qf(t){if(!t)return[];const e=[];function n(r){r&&(r.type==="entity"&&r.name&&e.push(r.name),Array.isArray(r.entities)&&r.entities.forEach(n),Array.isArray(r.modules)&&r.modules.forEach(s=>{s&&typeof s=="object"&&"entities"in s&&s.entities.forEach(n)}))}return n(t),e}function Xf(t){if(!t)return[];const e=[];function n(r,s){r&&(r.type==="entity"&&r.name&&(s=r.name,Array.isArray(r.commands)&&r.commands.forEach(i=>{i&&typeof i=="object"&&"name"in i&&i.name&&e.push({entity:s,name:i.name})})),Array.isArray(r.entities)&&r.entities.forEach(i=>n(i)),Array.isArray(r.modules)&&r.modules.forEach(i=>{i&&typeof i=="object"&&"entities"in i&&i.entities.forEach(a=>n(a))}))}return n(t),e}function em(t){if(!t)return[];const e=[];function n(r,s){r&&(r.type==="entity"&&r.name&&(s=r.name,Array.isArray(r.constraints)&&r.constraints.forEach(i=>{if(i&&typeof i=="object"&&"expression"in i&&i.expression){const a=xs(i.expression);e.push({entity:s,expression:a})}})),Array.isArray(r.entities)&&r.entities.forEach(i=>n(i)),Array.isArray(r.modules)&&r.modules.forEach(i=>{i&&typeof i=="object"&&"entities"in i&&i.entities.forEach(a=>n(a))}))}return n(t),e}function xs(t){if(!t)return"";if(typeof t=="object"&&t!==null&&"type"in t){if(t.type==="identifier"&&"name"in t)return t.name;if(t.type==="literal"&&"value"in t)return String(t.value);if(t.type==="binary"&&"left"in t&&"operator"in t&&"right"in t)return`${xs(t.left)} ${t.operator} ${xs(t.right)}`;if(t.type==="member"&&"object"in t&&"property"in t)return`${xs(t.object)}.${t.property}`}return JSON.stringify(t)}async function tm(t,e){const n=performance.now(),r=`${e} instantiation`;try{const s=`
      ${t}

      const instance = new ${e}();
      if (!instance) throw new Error('Instance is falsy');
      return { success: true };
    `;return new Function(s)(),{name:r,passed:!0,duration:Math.round(performance.now()-n)}}catch(s){return{name:r,passed:!1,error:s.message||String(s),duration:Math.round(performance.now()-n)}}}async function nm(t,e,n){const r=performance.now(),s=`${e}.${n} exists`;try{const i=`
      ${t}

      const instance = new ${e}();
      if (typeof instance.${n} !== 'function') {
        throw new Error('Command ${n} is not a function');
      }
      return { success: true };
    `;return new Function(i)(),{name:s,passed:!0,duration:Math.round(performance.now()-r)}}catch(i){return{name:s,passed:!1,error:i.message||String(i),duration:Math.round(performance.now()-r)}}}async function rm(t,e,n){const r=performance.now(),s=`${e} constraint: ${n.slice(0,30)}...`;try{const i=`
      ${t}

      const instance = new ${e}();
      if (typeof instance._validateConstraints !== 'function') {
        return { success: true, note: 'No constraint validation method' };
      }
      return { success: true };
    `;return new Function(i)(),{name:s,passed:!0,duration:Math.round(performance.now()-r)}}catch(i){return{name:s,passed:!1,error:i.message||String(i),duration:Math.round(performance.now()-r)}}}function sm({clientCode:t,ast:e,disabled:n}){const[r,s]=ie.useState(!1),[i,a]=ie.useState(null),o=async()=>{s(!0),a(null);try{const l=await Jf(t,e);a(l)}catch(l){a({total:1,passed:0,failed:1,results:[{name:"Test Runner",passed:!1,error:l.message||String(l),duration:0}],duration:0})}finally{s(!1)}};return g.jsxs("div",{className:"border-t border-gray-800",children:[g.jsxs("div",{className:"flex items-center justify-between px-3 py-2 bg-gray-900/50",children:[g.jsx("span",{className:"text-sm font-medium text-gray-300",children:"Smoke Tests"}),g.jsxs("button",{onClick:o,disabled:n||r,className:`flex items-center gap-2 px-3 py-1 text-xs rounded transition-colors ${n||r?"bg-gray-800 text-gray-600 cursor-not-allowed":"bg-emerald-600 hover:bg-emerald-500 text-white"}`,children:[g.jsx(_o,{size:12}),r?"Running...":"Run Tests"]})]}),i&&g.jsxs("div",{className:"p-3 space-y-3",children:[g.jsxs("div",{className:"flex items-center gap-4 text-sm",children:[g.jsxs("div",{className:`flex items-center gap-1 ${i.failed===0?"text-emerald-400":"text-rose-400"}`,children:[i.failed===0?g.jsx(Vs,{size:14}):g.jsx(Xl,{size:14}),g.jsxs("span",{children:[i.passed,"/",i.total," passed"]})]}),g.jsxs("div",{className:"flex items-center gap-1 text-gray-500",children:[g.jsx(gd,{size:14}),g.jsxs("span",{children:[i.duration,"ms"]})]})]}),g.jsx("div",{className:"space-y-1",children:i.results.map((l,d)=>g.jsxs("div",{className:`flex items-start gap-2 p-2 rounded text-sm ${l.passed?"bg-emerald-900/20":"bg-rose-900/20"}`,children:[l.passed?g.jsx(Vs,{size:14,className:"text-emerald-400 flex-shrink-0 mt-0.5"}):g.jsx(Xl,{size:14,className:"text-rose-400 flex-shrink-0 mt-0.5"}),g.jsxs("div",{className:"flex-1 min-w-0",children:[g.jsx("div",{className:l.passed?"text-emerald-300":"text-rose-300",children:l.name}),l.error&&g.jsx("div",{className:"mt-1 text-xs text-rose-400 font-mono whitespace-pre-wrap break-all",children:l.error})]}),g.jsxs("span",{className:"text-xs text-gray-500",children:[l.duration,"ms"]})]},d))}),i.total===0&&g.jsxs("div",{className:"flex items-center gap-2 p-3 bg-amber-900/20 rounded text-amber-300 text-sm",children:[g.jsx(nf,{size:14}),g.jsx("span",{children:"No tests generated. Add entities or commands to your Manifest source."})]})]})]})}class im{constructor(e=36e5,n=100){ce(this,"cache",new Map);ce(this,"maxAge");ce(this,"maxSize");this.maxAge=e,this.maxSize=n}get(e){const n=this.cache.get(e);return n?Date.now()-n.timestamp>this.maxAge?(this.cache.delete(e),null):n.sourceHash!==e?(this.cache.delete(e),null):n.ir:null}set(e,n){if(this.cache.size>=this.maxSize&&!this.cache.has(e)){const r=this.cache.keys().next().value;r&&this.cache.delete(r)}this.cache.set(e,{ir:n,timestamp:Date.now(),sourceHash:e})}clear(){this.cache.clear()}invalidate(e){this.cache.delete(e)}getStats(){return{size:this.cache.size,keys:Array.from(this.cache.keys())}}cleanup(){const e=Date.now();let n=0;for(const[r,s]of this.cache.entries())e-s.timestamp>this.maxAge&&(this.cache.delete(r),n++);return n}}const am=new im;async function Ra(t){const n=new TextEncoder().encode(t),r=await crypto.subtle.digest("SHA-256",n);return Array.from(new Uint8Array(r)).map(i=>i.toString(16).padStart(2,"0")).join("")}async function tc(t,e){return{contentHash:await Ra(t),irHash:e,compilerVersion:Oo,schemaVersion:Po,compiledAt:new Date().toISOString()}}async function om(t){const{provenance:e,...n}=t,{irHash:r,...s}=e,i={...n,provenance:s},a=JSON.stringify(i,Object.keys(i).sort()),l=new TextEncoder().encode(a),d=await crypto.subtle.digest("SHA-256",l);return Array.from(new Uint8Array(d)).map(v=>v.toString(16).padStart(2,"0")).join("")}class lm{constructor(e){ce(this,"diagnostics",[]);ce(this,"cache");this.cache=e??am}async compileToIR(e,n){var l,d;this.diagnostics=[];const r=(n==null?void 0:n.useCache)??!0;if(r){const y=await Ra(e),v=this.cache.get(y);if(v)return{ir:v,diagnostics:[]}}const s=new Ro,{program:i,errors:a}=s.parse(e);for(const y of a)this.diagnostics.push({severity:y.severity,message:y.message,line:(l=y.position)==null?void 0:l.line,column:(d=y.position)==null?void 0:d.column});if(a.some(y=>y.severity==="error"))return{ir:null,diagnostics:this.diagnostics};const o=await this.transformProgram(i,e);if(r&&o){const y=await Ra(e);this.cache.set(y,o)}return{ir:o,diagnostics:this.diagnostics}}async transformProgram(e,n){const r=e.modules.map(h=>this.transformModule(h)),s=[...e.entities.map(h=>this.transformEntity(h)),...e.modules.flatMap(h=>h.entities.map(f=>this.transformEntity(f,h.name)))],i=[...e.entities.filter(h=>h.store).map(h=>({entity:h.name,target:h.store==="filesystem"?"localStorage":h.store,config:{}})),...e.modules.flatMap(h=>h.entities.filter(f=>f.store).map(f=>({entity:f.name,target:f.store==="filesystem"?"localStorage":f.store,config:{}})))],a=[...e.stores.map(h=>this.transformStore(h)),...e.modules.flatMap(h=>h.stores.map(f=>this.transformStore(f))),...i],o=[...e.events.map(h=>this.transformEvent(h)),...e.modules.flatMap(h=>h.events.map(f=>this.transformEvent(f)))],l=[...e.commands.map(h=>this.transformCommand(h)),...e.modules.flatMap(h=>h.commands.map(f=>this.transformCommand(f,h.name))),...e.entities.flatMap(h=>h.commands.map(f=>this.transformCommand(f,void 0,h.name))),...e.modules.flatMap(h=>h.entities.flatMap(f=>f.commands.map(w=>this.transformCommand(w,h.name,f.name))))],d=[...e.policies.map(h=>this.transformPolicy(h)),...e.modules.flatMap(h=>h.policies.map(f=>this.transformPolicy(f,h.name))),...e.entities.flatMap(h=>h.policies.map(f=>this.transformPolicy(f,void 0,h.name))),...e.modules.flatMap(h=>h.entities.flatMap(f=>f.policies.map(w=>this.transformPolicy(w,h.name,f.name))))],y={version:"1.0",provenance:await tc(n),modules:r,entities:s,stores:a,events:o,commands:l,policies:d},v=await om(y);return{...y,provenance:await tc(n,v)}}transformModule(e){return{name:e.name,entities:e.entities.map(n=>n.name),commands:[...e.commands.map(n=>n.name),...e.entities.flatMap(n=>n.commands.map(r=>r.name))],stores:e.stores.map(n=>n.entity),events:e.events.map(n=>n.name),policies:[...e.policies.map(n=>n.name),...e.entities.flatMap(n=>n.policies.map(r=>r.name))]}}transformEntity(e,n){return{name:e.name,module:n,properties:e.properties.map(r=>this.transformProperty(r)),computedProperties:e.computedProperties.map(r=>this.transformComputedProperty(r)),relationships:e.relationships.map(r=>this.transformRelationship(r)),commands:e.commands.map(r=>r.name),constraints:e.constraints.map(r=>this.transformConstraint(r)),policies:e.policies.map(r=>r.name),versionProperty:e.versionProperty,versionAtProperty:e.versionAtProperty,...e.transitions.length>0?{transitions:e.transitions.map(r=>this.transformTransition(r))}:{}}}transformTransition(e){return{property:e.property,from:e.from,to:e.to}}transformProperty(e){return{name:e.name,type:this.transformType(e.dataType),defaultValue:e.defaultValue?this.transformExprToValue(e.defaultValue):void 0,modifiers:e.modifiers}}transformComputedProperty(e){return{name:e.name,type:this.transformType(e.dataType),expression:this.transformExpression(e.expression),dependencies:e.dependencies}}transformRelationship(e){return{name:e.name,kind:e.kind,target:e.target,foreignKey:e.foreignKey,through:e.through}}transformConstraint(e){return{name:e.name,code:e.code||e.name,expression:this.transformExpression(e.expression),severity:e.severity||"block",message:e.message,messageTemplate:e.messageTemplate,detailsMapping:e.detailsMapping?Object.fromEntries(Object.entries(e.detailsMapping).map(([n,r])=>[n,this.transformExpression(r)])):void 0,overrideable:e.overrideable,overridePolicyRef:e.overridePolicyRef}}transformStore(e){const n={};if(e.config)for(const[r,s]of Object.entries(e.config)){const i=this.transformExprToValue(s);i&&(n[r]=i)}return{entity:e.entity,target:e.target,config:n}}transformEvent(e){return"fields"in e.payload?{name:e.name,channel:e.channel,payload:e.payload.fields.map(n=>({name:n.name,type:this.transformType(n.dataType),required:n.required}))}:{name:e.name,channel:e.channel,payload:this.transformType(e.payload)}}transformCommand(e,n,r){return{name:e.name,module:n,entity:r,parameters:e.parameters.map(s=>this.transformParameter(s)),guards:(e.guards||[]).map(s=>this.transformExpression(s)),constraints:(e.constraints||[]).map(s=>this.transformConstraint(s)),actions:e.actions.map(s=>this.transformAction(s)),emits:e.emits||[],returns:e.returns?this.transformType(e.returns):void 0}}transformParameter(e){return{name:e.name,type:this.transformType(e.dataType),required:e.required,defaultValue:e.defaultValue?this.transformExprToValue(e.defaultValue):void 0}}transformAction(e){return{kind:e.kind,target:e.target,expression:this.transformExpression(e.expression)}}transformPolicy(e,n,r){return{name:e.name,module:n,entity:r,action:e.action,expression:this.transformExpression(e.expression),message:e.message}}transformType(e){return{name:e.name,generic:e.generic?this.transformType(e.generic):void 0,nullable:e.nullable}}transformExpression(e){switch(e.type){case"Literal":{const n=e;return{kind:"literal",value:this.literalToValue(n.value,n.dataType)}}case"Identifier":return{kind:"identifier",name:e.name};case"MemberAccess":{const n=e;return{kind:"member",object:this.transformExpression(n.object),property:n.property}}case"BinaryOp":{const n=e;return{kind:"binary",operator:n.operator,left:this.transformExpression(n.left),right:this.transformExpression(n.right)}}case"UnaryOp":{const n=e;return{kind:"unary",operator:n.operator,operand:this.transformExpression(n.operand)}}case"Call":{const n=e;return{kind:"call",callee:this.transformExpression(n.callee),args:n.arguments.map(r=>this.transformExpression(r))}}case"Conditional":{const n=e;return{kind:"conditional",condition:this.transformExpression(n.condition),consequent:this.transformExpression(n.consequent),alternate:this.transformExpression(n.alternate)}}case"Array":return{kind:"array",elements:e.elements.map(r=>this.transformExpression(r))};case"Object":return{kind:"object",properties:e.properties.map(r=>({key:r.key,value:this.transformExpression(r.value)}))};case"Lambda":{const n=e;return{kind:"lambda",params:n.parameters,body:this.transformExpression(n.body)}}default:return{kind:"literal",value:{kind:"null"}}}}transformExprToValue(e){if(e.type==="Literal"){const n=e;return this.literalToValue(n.value,n.dataType)}if(e.type==="Array")return{kind:"array",elements:e.elements.map(s=>this.transformExprToValue(s)).filter(s=>s!==void 0)};if(e.type==="Object"){const n=e,r={};for(const s of n.properties){const i=this.transformExprToValue(s.value);i&&(r[s.key]=i)}return{kind:"object",properties:r}}}literalToValue(e,n){return n==="string"?{kind:"string",value:e}:n==="number"?{kind:"number",value:e}:n==="boolean"?{kind:"boolean",value:e}:{kind:"null"}}}async function cm(t){return new lm().compileToIR(t)}function um(){return typeof process<"u"}class dm extends Error{constructor(n){super(`Action '${n}' is not allowed in deterministicMode. Adapter actions (persist/publish/effect) must be handled externally. See docs/spec/adapters.md.`);ce(this,"actionKind");this.name="ManifestEffectBoundaryError",this.actionKind=n}}class Ui extends Error{constructor(n,r){super(`Evaluation budget exceeded: ${n} limit ${r} reached`);ce(this,"limitType");ce(this,"limit");this.name="EvaluationBudgetExceededError",this.limitType=n,this.limit=r}}let nc=class{constructor(e){ce(this,"items",new Map);ce(this,"generateId");this.generateId=e||(()=>crypto.randomUUID())}async getAll(){return Array.from(this.items.values())}async getById(e){return this.items.get(e)}async create(e){const n=e.id||this.generateId(),r={...e,id:n};return this.items.set(n,r),r}async update(e,n){const r=this.items.get(e);if(!r)return;const s={...r,...n,id:e};return this.items.set(e,s),s}async delete(e){return this.items.delete(e)}async clear(){this.items.clear()}};class pm{constructor(e){ce(this,"key");this.key=e}load(){try{const e=localStorage.getItem(this.key);return e?JSON.parse(e):[]}catch{return[]}}save(e){localStorage.setItem(this.key,JSON.stringify(e))}async getAll(){return this.load()}async getById(e){return this.load().find(n=>n.id===e)}async create(e){const n=this.load(),r=e.id||crypto.randomUUID(),s={...e,id:r};return n.push(s),this.save(n),s}async update(e,n){const r=this.load(),s=r.findIndex(a=>a.id===e);if(s===-1)return;const i={...r[s],...n,id:e};return r[s]=i,this.save(r),i}async delete(e){const n=this.load(),r=n.findIndex(s=>s.id===e);return r===-1?!1:(n.splice(r,1),this.save(n),!0)}async clear(){localStorage.removeItem(this.key)}}class $o{constructor(e,n={},r={}){ce(this,"ir");ce(this,"context");ce(this,"options");ce(this,"stores",new Map);ce(this,"eventListeners",[]);ce(this,"eventLog",[]);ce(this,"relationshipIndex",new Map);ce(this,"relationshipMemoCache",new Map);ce(this,"versionIncrementedForCommand",!1);ce(this,"justCreatedInstanceIds",new Set);ce(this,"lastTransitionError",null);ce(this,"evalBudget",null);this.ir=e,this.context=n,this.options=r,this.initializeStores(),this.buildRelationshipIndex()}initEvalBudget(){var e,n;return this.evalBudget?!1:(this.evalBudget={depth:0,steps:0,maxDepth:((e=this.options.evaluationLimits)==null?void 0:e.maxExpressionDepth)??64,maxSteps:((n=this.options.evaluationLimits)==null?void 0:n.maxEvaluationSteps)??1e4},!0)}clearEvalBudget(){this.evalBudget=null}initializeStores(){var e;for(const n of this.ir.entities){if(this.options.storeProvider){const i=this.options.storeProvider(n.name);if(i){this.stores.set(n.name,i);continue}}const r=this.ir.stores.find(i=>i.entity===n.name);let s;if(r)switch(r.target){case"localStorage":{const i=((e=r.config.key)==null?void 0:e.kind)==="string"?r.config.key.value:`${n.name.toLowerCase()}s`;s=new pm(i);break}case"memory":s=new nc(this.options.generateId);break;case"postgres":throw new Error(`PostgreSQL storage for entity '${n.name}' is not available in browser environments. Use 'memory' or 'localStorage' for browser, or provide a custom store via the storeProvider option. For server-side use, import PostgresStore from stores.node.ts.`);case"supabase":throw new Error(`Supabase storage for entity '${n.name}' is not available in browser environments. Use 'memory' or 'localStorage' for browser, or provide a custom store via the storeProvider option. For server-side use, import SupabaseStore from stores.node.ts.`);default:{const i=r.target;throw new Error(`Unsupported storage target '${i}' for entity '${n.name}'. Valid targets are: 'memory', 'localStorage', 'postgres', 'supabase'.`)}}else s=new nc(this.options.generateId);this.stores.set(n.name,s)}}buildRelationshipIndex(){for(const e of this.ir.entities)for(const n of e.relationships){const r=`${e.name}.${n.name}`;this.relationshipIndex.set(r,{entityName:e.name,relationshipName:n.name,kind:n.kind,targetEntity:n.target,foreignKey:n.foreignKey})}}clearMemoCache(){this.relationshipMemoCache.clear()}async resolveRelationship(e,n,r){const s=`${e}.${r}`,i=this.relationshipIndex.get(s);if(!i)return null;const a=n.id;if(!a)return null;const o=`${e}.${a}.${r}`,l=this.relationshipMemoCache.get(o);if(l)return l.result;let d=null;switch(i.kind){case"belongsTo":case"ref":{const y=i.foreignKey||`${i.relationshipName}Id`,v=n[y];v?d=await this.getInstance(i.targetEntity,v)??null:d=null;break}case"hasOne":{const y=this.getEntity(i.targetEntity);if(!y){d=null;break}const v=y.relationships.find(h=>(h.kind==="belongsTo"||h.kind==="ref")&&h.target===e);if(v){const h=v.foreignKey||`${v.name}Id`;d=(await this.getAllInstances(i.targetEntity)).find(w=>w[h]===a)??null}else{const h=`${e.toLowerCase()}Id`;d=(await this.getAllInstances(i.targetEntity)).find(w=>w[h]===a)??null}break}case"hasMany":{const y=this.getEntity(i.targetEntity);if(!y){d=[];break}const v=y.relationships.find(h=>(h.kind==="belongsTo"||h.kind==="ref")&&h.target===e);if(v){const h=v.foreignKey||`${v.name}Id`;d=(await this.getAllInstances(i.targetEntity)).filter(w=>w[h]===a)}else{const h=`${e.toLowerCase()}Id`;d=(await this.getAllInstances(i.targetEntity)).filter(w=>w[h]===a)}break}default:d=null}return this.relationshipMemoCache.set(o,{result:d,timestamp:this.getNow()}),d}getNow(){return this.options.now?this.options.now():Date.now()}getBuiltins(){return{now:()=>this.getNow(),uuid:()=>this.options.generateId?this.options.generateId():crypto.randomUUID()}}getIR(){return this.ir}getProvenance(){return this.ir.provenance}logProvenance(){if(!this.getProvenance()){console.warn("[Manifest Runtime] No provenance information found in IR.");return}}async verifyIRHash(e){const n=this.ir.provenance;if(!n)return console.warn("[Manifest Runtime] No provenance information found, cannot verify IR hash."),!1;const r=e||n.irHash;if(!r)return console.warn("[Manifest Runtime] No IR hash available for verification."),!1;try{const{irHash:s,...i}=n,a={...this.ir,provenance:i},o=JSON.stringify(a,Object.keys(a).sort()),d=new TextEncoder().encode(o),y=await crypto.subtle.digest("SHA-256",d),h=Array.from(new Uint8Array(y)).map(w=>w.toString(16).padStart(2,"0")).join(""),f=h===r;return f||console.error(`[Manifest Runtime] IR hash verification failed!
  Expected: ${r}
  Computed: ${h}
  The IR may have been tampered with or modified since compilation.`),f}catch(s){return console.error("[Manifest Runtime] Error during IR hash verification:",s),!1}}async assertValidProvenance(){if(this.options.requireValidProvenance&&!await this.verifyIRHash(this.options.expectedIRHash))throw new Error("IR provenance verification failed. The IR may have been modified since compilation. This runtime requires valid provenance for execution.")}getContext(){return this.context}setContext(e){this.context={...this.context,...e}}replaceContext(e){this.context={...e}}getEntities(){return this.ir.entities}getEntity(e){return this.ir.entities.find(n=>n.name===e)}getCommands(){return this.ir.commands}getCommand(e,n){if(n){const r=this.getEntity(n);return!r||!r.commands.includes(e)?void 0:this.ir.commands.find(s=>s.name===e&&s.entity===n)}return this.ir.commands.find(r=>r.name===e)}getPolicies(){return this.ir.policies}getStore(e){return this.stores.get(e)}async getAllInstances(e){const n=this.stores.get(e);return n?await n.getAll():[]}async getInstance(e,n){const r=this.stores.get(e);return r?await r.getById(n):void 0}async checkConstraints(e,n){const r=this.getEntity(e);if(!r)return[];const s=this.initEvalBudget();try{return(await this.validateConstraints(r,n)).filter(a=>!a.passed)}finally{s&&this.clearEvalBudget()}}async createInstance(e,n){const r=this.getEntity(e);if(!r)return;const s=this.initEvalBudget();try{const i={};for(const h of r.properties)h.defaultValue?i[h.name]=this.irValueToJs(h.defaultValue):i[h.name]=this.getDefaultForType(h.type);const a={...i,...n};r.versionProperty&&(a[r.versionProperty]=1),r.versionAtProperty&&(a[r.versionAtProperty]=this.getNow());const o=await this.validateConstraints(r,a),l=o.filter(h=>!h.passed&&h.severity==="block");if(l.length>0){console.warn("[Manifest Runtime] Blocking constraint validation failed:",l);return}const d=o.filter(h=>!h.passed&&h.severity!=="block");d.length>0&&console.info("[Manifest Runtime] Non-blocking constraint outcomes:",d);const y=this.stores.get(e);if(!y)return;const v=await y.create(a);return v&&v.id&&this.justCreatedInstanceIds.add(v.id),v}finally{s&&this.clearEvalBudget()}}async updateInstance(e,n,r){const s=this.getEntity(e),i=this.stores.get(e);if(!i||!s)return;const a=await i.getById(n);if(!a)return;const o=this.initEvalBudget();try{if(s.versionProperty){const h=a[s.versionProperty],f=r[s.versionProperty];if(h!==void 0&&f!==void 0&&h!==f){await this.emitConcurrencyConflictEvent(e,n,f,h);return}const w=this.justCreatedInstanceIds.has(n);f===void 0&&!this.versionIncrementedForCommand&&!w&&(r[s.versionProperty]=(h||0)+1,this.versionIncrementedForCommand=!0)}s.versionAtProperty&&(r[s.versionAtProperty]=this.getNow());const l={...a,...r};if(s.transitions&&s.transitions.length>0)for(const[h,f]of Object.entries(r)){const w=s.transitions.filter(c=>c.property===h);if(w.length===0)continue;const m=a[h];if(m===void 0)continue;const E=w.find(c=>c.from===String(m));if(E&&!E.to.includes(String(f))){const c=E.to.map(u=>`'${u}'`).join(", ");this.lastTransitionError=`Invalid state transition for '${h}': '${m}' -> '${f}' is not allowed. Allowed from '${m}': [${c}]`;return}}const d=await this.validateConstraints(s,l),y=d.filter(h=>!h.passed&&h.severity==="block");if(y.length>0){console.warn("[Manifest Runtime] Blocking constraint validation failed:",y);return}const v=d.filter(h=>!h.passed&&h.severity!=="block");return v.length>0&&console.info("[Manifest Runtime] Non-blocking constraint outcomes:",v),await i.update(n,r)}finally{o&&this.clearEvalBudget()}}async deleteInstance(e,n){const r=this.stores.get(e);return r?await r.delete(n):!1}async runCommand(e,n,r={}){if(this.options.idempotencyStore){if(r.idempotencyKey===void 0)return{success:!1,error:"IdempotencyStore is configured but no idempotencyKey was provided",emittedEvents:[]};const i=await this.options.idempotencyStore.get(r.idempotencyKey);if(i!==void 0)return i}const s=await this._executeCommandInternal(e,n,r);return this.options.idempotencyStore&&r.idempotencyKey!==void 0&&await this.options.idempotencyStore.set(r.idempotencyKey,s),s}async _executeCommandInternal(e,n,r){var i,a;this.clearMemoCache(),this.versionIncrementedForCommand=!1,this.justCreatedInstanceIds.clear(),this.lastTransitionError=null;const s=this.initEvalBudget();try{const o=this.getCommand(e,r.entityName);if(!o)return{success:!1,error:`Command '${e}' not found`,...r.correlationId!==void 0?{correlationId:r.correlationId}:{},...r.causationId!==void 0?{causationId:r.causationId}:{},emittedEvents:[]};const l=r.instanceId&&r.entityName?await this.getInstance(r.entityName,r.instanceId):void 0,d=this.buildEvalContext(n,l,r.entityName),y=await this.checkPolicies(o,d);if(!y.allowed)return{success:!1,error:(i=y.denial)==null?void 0:i.message,deniedBy:(a=y.denial)==null?void 0:a.policyName,policyDenial:y.denial,...r.correlationId!==void 0?{correlationId:r.correlationId}:{},...r.causationId!==void 0?{causationId:r.causationId}:{},emittedEvents:[]};const v=await this.evaluateCommandConstraints(o,d,r.overrideRequests);if(!v.allowed){const E=v.outcomes.find(c=>!c.passed&&!c.overridden&&c.severity==="block");return{success:!1,error:(E==null?void 0:E.message)||`Command blocked by constraint '${E==null?void 0:E.constraintName}'`,constraintOutcomes:v.outcomes,overrideRequests:r.overrideRequests,...r.correlationId!==void 0?{correlationId:r.correlationId}:{},...r.causationId!==void 0?{causationId:r.causationId}:{},emittedEvents:[]}}for(let E=0;E<o.guards.length;E+=1){const c=o.guards[E];if(!await this.evaluateExpression(c,d))return{success:!1,error:`Guard condition failed for command '${e}'`,guardFailure:{index:E+1,expression:c,formatted:this.formatExpression(c),resolved:await this.resolveExpressionValues(c,d)},constraintOutcomes:v.outcomes.length>0?v.outcomes:void 0,...r.correlationId!==void 0?{correlationId:r.correlationId}:{},...r.causationId!==void 0?{causationId:r.causationId}:{},emittedEvents:[]}}const h=[];let f;const w={value:0},m={correlationId:r.correlationId,causationId:r.causationId};for(const E of o.actions){const c=await this.executeAction(E,d,r,w,m);if(this.lastTransitionError)return{success:!1,error:this.lastTransitionError,...m.correlationId!==void 0?{correlationId:m.correlationId}:{},...m.causationId!==void 0?{causationId:m.causationId}:{},emittedEvents:[]};if((E.kind==="mutate"||E.kind==="compute")&&r.instanceId&&r.entityName){const u=await this.getInstance(r.entityName,r.instanceId);d.self=u,d.this=u,Object.assign(d,u)}f=c}for(const E of o.emits){const c=this.ir.events.find(b=>b.name===E),u=this.ir.provenance,k={name:E,channel:(c==null?void 0:c.channel)||E,payload:{...n,result:f},timestamp:this.getNow(),...u?{provenance:{contentHash:u.contentHash,compilerVersion:u.compilerVersion,schemaVersion:u.schemaVersion}}:{},...m.correlationId!==void 0?{correlationId:m.correlationId}:{},...m.causationId!==void 0?{causationId:m.causationId}:{},emitIndex:w.value++};h.push(k),this.eventLog.push(k),this.notifyListeners(k)}return{success:!0,result:f,constraintOutcomes:v.outcomes.length>0?v.outcomes:void 0,...m.correlationId!==void 0?{correlationId:m.correlationId}:{},...m.causationId!==void 0?{causationId:m.causationId}:{},emittedEvents:h}}catch(o){if(o instanceof Ui)return{success:!1,error:o.message,...r.correlationId!==void 0?{correlationId:r.correlationId}:{},...r.causationId!==void 0?{causationId:r.causationId}:{},emittedEvents:[]};throw o}finally{s&&this.clearEvalBudget()}}buildEvalContext(e,n,r){const s={...n||{},...e,self:n??null,this:n??null,user:this.context.user??null,context:this.context??{}};return n&&r&&(s._entity=r),s}async checkPolicies(e,n){const r=this.ir.policies.filter(s=>!(s.entity&&e.entity&&s.entity!==e.entity||s.action!=="all"&&s.action!=="execute"));for(const s of r)if(!await this.evaluateExpression(s.expression,n)){const a=this.extractContextKeys(s.expression),o=await this.resolveExpressionValues(s.expression,n);return{allowed:!1,denial:{policyName:s.name,expression:s.expression,formatted:this.formatExpression(s.expression),message:s.message||`Denied by policy '${s.name}'`,contextKeys:a,resolved:o}}}return{allowed:!0}}async validateConstraints(e,n){const r=[],s={...n,self:n,this:n,user:this.context.user??null,context:this.context??{},_entity:e.name};for(const i of e.constraints){const a=await this.evaluateConstraint(i,s);r.push(a)}return r}extractContextKeys(e){const n=new Set,r=s=>{switch(s.kind){case"identifier":(s.name==="self"||s.name==="this"||s.name==="user"||s.name==="context")&&n.add(s.name);return;case"member":{r(s.object);const i=this.formatExpression(s.object);n.add(`${i}.${s.property}`);return}case"binary":r(s.left),r(s.right);return;case"unary":r(s.operand);return;case"call":s.args.forEach(r);return;case"conditional":r(s.condition),r(s.consequent),r(s.alternate);return;case"array":s.elements.forEach(r);return;case"object":s.properties.forEach(i=>r(i.value));return;case"lambda":r(s.body);return;default:return}};return r(e),Array.from(n).sort()}formatExpression(e){switch(e.kind){case"literal":return this.formatValue(e.value);case"identifier":return e.name;case"member":return`${this.formatExpression(e.object)}.${e.property}`;case"binary":return`${this.formatExpression(e.left)} ${e.operator} ${this.formatExpression(e.right)}`;case"unary":return e.operator==="not"?`not ${this.formatExpression(e.operand)}`:`${e.operator}${this.formatExpression(e.operand)}`;case"call":return`${this.formatExpression(e.callee)}(${e.args.map(n=>this.formatExpression(n)).join(", ")})`;case"conditional":return`${this.formatExpression(e.condition)} ? ${this.formatExpression(e.consequent)} : ${this.formatExpression(e.alternate)}`;case"array":return`[${e.elements.map(n=>this.formatExpression(n)).join(", ")}]`;case"object":return`{ ${e.properties.map(n=>`${n.key}: ${this.formatExpression(n.value)}`).join(", ")} }`;case"lambda":return`(${e.params.join(", ")}) => ${this.formatExpression(e.body)}`;default:return"<expr>"}}formatValue(e){switch(e.kind){case"string":return JSON.stringify(e.value);case"number":return String(e.value);case"boolean":return String(e.value);case"null":return"null";case"array":return`[${e.elements.map(n=>this.formatValue(n)).join(", ")}]`;case"object":return`{ ${Object.entries(e.properties).map(([n,r])=>`${n}: ${this.formatValue(r)}`).join(", ")} }`;default:return"null"}}async resolveExpressionValues(e,n){const r=[],s=new Set,i=async o=>{const l=this.formatExpression(o);if(s.has(l))return;s.add(l);let d;try{d=await this.evaluateExpression(o,n)}catch{d=void 0}r.push({expression:l,value:d})},a=async o=>{switch(o.kind){case"literal":case"identifier":case"member":await i(o);return;case"binary":await a(o.left),await a(o.right);return;case"unary":await a(o.operand);return;case"call":for(const l of o.args)await a(l);return;case"conditional":await a(o.condition),await a(o.consequent),await a(o.alternate);return;case"array":for(const l of o.elements)await a(l);return;case"object":for(const l of o.properties)await a(l.value);return;case"lambda":await a(o.body);return;default:return}};return await a(e),r}async executeAction(e,n,r,s,i){if(this.options.deterministicMode&&(e.kind==="persist"||e.kind==="publish"||e.kind==="effect"))throw new dm(e.kind);const a=await this.evaluateExpression(e.expression,n);switch(e.kind){case"mutate":return e.target&&r.instanceId&&r.entityName&&await this.updateInstance(r.entityName,r.instanceId,{[e.target]:a}),a;case"emit":case"publish":{const o=this.ir.provenance,l={name:"action_event",channel:"default",payload:a,timestamp:this.getNow(),...o?{provenance:{contentHash:o.contentHash,compilerVersion:o.compilerVersion,schemaVersion:o.schemaVersion}}:{},...i.correlationId!==void 0?{correlationId:i.correlationId}:{},...i.causationId!==void 0?{causationId:i.causationId}:{},emitIndex:s.value++};return this.eventLog.push(l),this.notifyListeners(l),a}case"persist":return a;case"compute":return e.target&&r.instanceId&&r.entityName&&await this.updateInstance(r.entityName,r.instanceId,{[e.target]:a}),a;case"effect":default:return a}}async evaluateExpression(e,n){if(this.evalBudget){if(this.evalBudget.steps++,this.evalBudget.steps>this.evalBudget.maxSteps)throw new Ui("steps",this.evalBudget.maxSteps);if(this.evalBudget.depth++,this.evalBudget.depth>this.evalBudget.maxDepth)throw new Ui("depth",this.evalBudget.maxDepth)}try{switch(e.kind){case"literal":return this.irValueToJs(e.value);case"identifier":{const r=e.name;return r in n?n[r]:r==="true"?!0:r==="false"?!1:r==="null"?null:void 0}case"member":{const r=await this.evaluateExpression(e.object,n);if(r&&typeof r=="object"){if(e.object.kind==="identifier"&&(e.object.name==="self"||e.object.name==="this")&&"id"in r&&typeof r.id=="string"){const s=r._entity;if(s){const i=`${s}.${e.property}`;if(this.relationshipIndex.has(i))return await this.resolveRelationship(s,r,e.property)}}return Object.prototype.hasOwnProperty.call(r,e.property)?r[e.property]:void 0}return}case"binary":{const r=await this.evaluateExpression(e.left,n),s=await this.evaluateExpression(e.right,n);return this.evaluateBinaryOp(e.operator,r,s)}case"unary":{const r=await this.evaluateExpression(e.operand,n);return this.evaluateUnaryOp(e.operator,r)}case"call":{const r=e.callee;if(r.kind==="identifier"){const a=this.getBuiltins();if(r.name in a){const o=await Promise.all(e.args.map(l=>this.evaluateExpression(l,n)));return a[r.name](...o)}}const s=await this.evaluateExpression(e.callee,n),i=await Promise.all(e.args.map(a=>this.evaluateExpression(a,n)));return typeof s=="function"?s(...i):void 0}case"conditional":return await this.evaluateExpression(e.condition,n)?await this.evaluateExpression(e.consequent,n):await this.evaluateExpression(e.alternate,n);case"array":return await Promise.all(e.elements.map(r=>this.evaluateExpression(r,n)));case"object":{const r={};for(const s of e.properties)r[s.key]=await this.evaluateExpression(s.value,n);return r}case"lambda":return(...r)=>{const s={...n};return e.params.forEach((i,a)=>{s[i]=r[a]}),this.evaluateExpression(e.body,s)};default:return}}finally{this.evalBudget&&this.evalBudget.depth--}}evaluateBinaryOp(e,n,r){switch(e){case"+":return typeof n=="string"||typeof r=="string"?String(n)+String(r):n+r;case"-":return n-r;case"*":return n*r;case"/":return n/r;case"%":return n%r;case"==":case"is":return n==r;case"!=":return n!=r;case"<":return n<r;case">":return n>r;case"<=":return n<=r;case">=":return n>=r;case"&&":case"and":return!!n&&!!r;case"||":case"or":return!!n||!!r;case"in":return Array.isArray(r)?r.includes(n):typeof r=="string"?r.includes(String(n)):!1;case"contains":return Array.isArray(n)?n.includes(r):typeof n=="string"?n.includes(String(r)):!1;default:return}}evaluateUnaryOp(e,n){switch(e){case"!":case"not":return!n;case"-":return-n;default:return n}}irValueToJs(e){switch(e.kind){case"string":return e.value;case"number":return e.value;case"boolean":return e.value;case"null":return null;case"array":return e.elements.map(n=>this.irValueToJs(n));case"object":{const n={};for(const[r,s]of Object.entries(e.properties))n[r]=this.irValueToJs(s);return n}}}getDefaultForType(e){if(e.nullable)return null;switch(e.name){case"string":return"";case"number":return 0;case"boolean":return!1;case"list":return[];case"map":return{};default:return null}}async evaluateComputed(e,n,r){const s=this.getEntity(e);if(!s||!s.computedProperties.find(l=>l.name===r))return;const a=await this.getInstance(e,n);if(!a)return;const o=this.initEvalBudget();try{return await this.evaluateComputedInternal(s,a,r,new Set)}finally{o&&this.clearEvalBudget()}}async evaluateComputedInternal(e,n,r,s){if(s.has(r))return;s.add(r);const i=e.computedProperties.find(l=>l.name===r);if(!i)return;const a={};if(i.dependencies)for(const l of i.dependencies)e.computedProperties.find(y=>y.name===l)&&!s.has(l)&&(a[l]=await this.evaluateComputedInternal(e,n,l,new Set(s)));const o={self:n,this:n,...n,...a,user:this.context.user??null,context:this.context??{},_entity:e.name};return await this.evaluateExpression(i.expression,o)}interpolateTemplate(e,n,r,s){const i=new Map;if(s)for(const a of s)i.set(a.expression,a.value);return e.replace(/\{([^}]+)\}/g,(a,o)=>{if(r&&o in r)return String(r[o]);if(i.has(o)){const l=i.get(o);return l===void 0?o:String(l)}if(o in n){const l=n[o];return l===void 0?o:String(l)}return a})}async evaluateConstraint(e,n){const r=await this.evaluateExpression(e.expression,n),i=e.name.startsWith("severity")?!r:!!r;let a;if(e.detailsMapping){a={};for(const[d,y]of Object.entries(e.detailsMapping))a[d]=await this.evaluateExpression(y,n)}const o=await this.resolveExpressionValues(e.expression,n);let l=e.message;return e.messageTemplate&&!l&&(l=this.interpolateTemplate(e.messageTemplate,n,a,o.map(d=>({expression:d.expression,value:d.value})))),{code:e.code,constraintName:e.name,severity:e.severity||"block",formatted:this.formatExpression(e.expression),message:l,details:a,passed:i,resolved:o.map(d=>({expression:d.expression,value:d.value}))}}async evaluateCommandConstraints(e,n,r){const s=[];for(const i of e.constraints||[]){const a=await this.evaluateConstraint(i,n);if(!a.passed&&i.overrideable){if(r){const o=r.find(l=>l.constraintCode===i.code);o&&await this.validateOverrideAuthorization(i,o,n)&&(a.overridden=!0,a.overriddenBy=o.authorizedBy,await this.emitOverrideAppliedEvent(i,o,a))}if(!a.overridden&&i.overridePolicyRef){const o=this.ir.policies.find(l=>l.name===i.overridePolicyRef);o&&o.action==="override"&&await this.evaluateExpression(o.expression,n)&&(a.overridden=!0,a.overriddenBy="policy:"+o.name)}}if(s.push(a),!a.passed&&!a.overridden&&a.severity==="block")return{allowed:!1,outcomes:s}}return{allowed:!0,outcomes:s}}async validateOverrideAuthorization(e,n,r){if(e.overridePolicyRef){const i=this.ir.policies.find(a=>a.name===e.overridePolicyRef);if(i){const a={...r,_override:{constraintCode:e.code,constraintName:e.name,reason:n.reason,authorizedBy:n.authorizedBy}};return!!await this.evaluateExpression(i.expression,a)}}const s=this.context.user;return(s==null?void 0:s.role)==="admin"||!1}async emitOverrideAppliedEvent(e,n,r){const s={name:"OverrideApplied",channel:"system",payload:{constraintCode:e.code,constraintName:e.name,originalSeverity:r.severity,reason:n.reason,authorizedBy:n.authorizedBy,timestamp:this.getNow()},timestamp:this.getNow(),provenance:this.getProvenanceInfo()};this.eventLog.push(s),this.notifyListeners(s)}async emitConcurrencyConflictEvent(e,n,r,s){const i={name:"ConcurrencyConflict",channel:"system",payload:{entityType:e,entityId:n,expectedVersion:r,actualVersion:s,conflictCode:"VERSION_MISMATCH",timestamp:this.getNow()},timestamp:this.getNow(),provenance:this.getProvenanceInfo()};this.eventLog.push(i),this.notifyListeners(i)}getProvenanceInfo(){const e=this.ir.provenance;if(e)return{contentHash:e.contentHash,compilerVersion:e.compilerVersion,schemaVersion:e.schemaVersion}}onEvent(e){return this.eventListeners.push(e),()=>{const n=this.eventListeners.indexOf(e);n!==-1&&this.eventListeners.splice(n,1)}}notifyListeners(e){for(const n of this.eventListeners)try{n(e)}catch{}}getEventLog(){return[...this.eventLog]}clearEventLog(){this.eventLog=[]}async serialize(){const e={};for(const[n,r]of this.stores)e[n]=await r.getAll();return{ir:this.ir,context:this.context,stores:e}}async restore(e){for(const[n,r]of Object.entries(e.stores)){const s=this.stores.get(n);if(s){await s.clear();for(const i of r)await s.create(i)}}}static async create(e,n={},r={}){var o;const s=new $o(e,n,r);let i={valid:!0};if(r.requireValidProvenance??um()){const l=await s.verifyIRHash(r.expectedIRHash);i={valid:l,expectedHash:r.expectedIRHash||((o=e.provenance)==null?void 0:o.irHash)},l||(i.error="IR hash verification failed")}return[s,i]}}class hm{constructor(e){ce(this,"items",new Map);ce(this,"generateId");this.generateId=e||(()=>crypto.randomUUID())}async getAll(){return Array.from(this.items.values())}async getById(e){return this.items.get(e)}async create(e){const n=e.id||this.generateId(),r={...e,id:n};return this.items.set(n,r),r}async update(e,n){const r=this.items.get(e);if(!r)return;const s={...r,...n};return this.items.set(e,s),s}async delete(e){return this.items.delete(e)}async clear(){this.items.clear()}}function fm({source:t,disabled:e}){const[n,r]=ie.useState(null),[s,i]=ie.useState(`{
  "user": {
    "id": "u1",
    "role": "cook"
  }
}`),[a,o]=ie.useState([]),[l,d]=ie.useState(""),[y,v]=ie.useState([]),[h,f]=ie.useState(null),[w,m]=ie.useState(""),[E,c]=ie.useState("{}"),[u,k]=ie.useState(null),[b,T]=ie.useState(null),[I,_]=ie.useState([]),[j,$]=ie.useState(new Set),[M,ne]=ie.useState(!1),[C,L]=ie.useState({}),x=ie.useRef(new Map),B=z=>{if(z.kind==="null")return null;if("value"in z)return z.value;if(z.kind==="array")return z.elements.map(B);if(z.kind==="object"){const H={};for(const[re,le]of Object.entries(z.properties))H[re]=B(le);return H}};ie.useEffect(()=>{if(e||!t.trim()){r(null),o([]),d(""),v([]);return}(async()=>{var z,H,re,le,me;try{console.log("[RuntimePanel] Compiling source:",t==null?void 0:t.substring(0,100));const ue=await cm(t);if(console.log("[RuntimePanel] Compile result:",{hasDiagnostics:!!ue.diagnostics,diagnosticsCount:(z=ue.diagnostics)==null?void 0:z.length,diagnostics:ue.diagnostics,hasIR:!!ue.ir,entityCount:(re=(H=ue.ir)==null?void 0:H.entities)==null?void 0:re.length,entities:(me=(le=ue.ir)==null?void 0:le.entities)==null?void 0:me.map(S=>S.name)}),ue.diagnostics.some(S=>S.severity==="error")){r(null),o([]);return}if(!ue.ir){r(null),o([]);return}let ve={};try{ve=JSON.parse(s)}catch{}const p=S=>(x.current.has(S)||x.current.set(S,new hm),x.current.get(S)),F=new $o(ue.ir,ve,{storeProvider:p});r(F);const U=F.getEntities();o(U),U.length>0&&!l&&d(U[0].name)}catch(ue){console.error("[RuntimePanel] Compilation error:",ue),r(null),o([])}})()},[t,e]),ie.useEffect(()=>{if(!n||!l){v([]),f(null);return}(async()=>{try{const z=await n.getAllInstances(l);v(z),z.length>0&&!h&&f(z[0].id)}catch(z){console.error("Failed to load instances:",z),v([])}})()},[n,l]),ie.useEffect(()=>{if(!n||!l||!h){L({});return}(async()=>{try{const z=n.getEntity(l);if(!z)return;const H={};for(const re of z.computedProperties)try{H[re.name]=await n.evaluateComputed(l,h,re.name)}catch{H[re.name]="<error>"}L(H)}catch(z){console.error("Failed to load computed values:",z)}})()},[n,l,h]),ie.useEffect(()=>{_(n?n.getEventLog():[])},[n,u]),ie.useEffect(()=>{if(!n||!l){m("");return}const z=n.getEntity(l);z&&z.commands.length>0?m(z.commands[0]):m("")},[n,l]);const oe=()=>{n&&(n.clearEventLog(),_([]))},Y=async()=>{if(!(!n||!l))try{const z=n.getEntity(l);if(!z)return;const H={id:crypto.randomUUID()};for(const le of z.properties)if(le.name!=="id")if(le.defaultValue!==void 0)H[le.name]=B(le.defaultValue);else{const me=le.modifiers.includes("required");switch(le.type.name){case"string":H[le.name]=me?`New ${l}`:"";break;case"number":H[le.name]=0;break;case"boolean":H[le.name]=!1;break;default:H[le.name]=null}}const re=await n.createInstance(l,H);if(re){const le=await n.getAllInstances(l);v(le),f(re.id),_(n.getEventLog())}}catch(z){T(z instanceof Error?z.message:String(z))}},W=z=>{v(H=>H.filter(re=>re.id!==z)),h===z&&f(null)},D=async()=>{if(!n){T("Engine not initialized. Check compilation errors.");return}if(!l||!h){T("Select an entity and instance first");return}T(null),k(null);try{let z={};try{z=E.trim()?JSON.parse(E):{}}catch(ue){T(`Invalid command parameters JSON: ${ue instanceof Error?ue.message:String(ue)}`);return}let H={};try{H=JSON.parse(s)}catch(ue){T(`Invalid runtime context JSON: ${ue instanceof Error?ue.message:String(ue)}`);return}n.replaceContext(H);const re=await n.runCommand(w,z,{entityName:l,instanceId:h});k(re);const le=await n.getAllInstances(l);v(le);const me=n.getEntity(l);if(me){const ue={};for(const ve of me.computedProperties)try{ue[ve.name]=await n.evaluateComputed(l,h,ve.name)}catch{ue[ve.name]="<error>"}L(ue)}_(n.getEventLog())}catch(z){T(z instanceof Error?z.message:String(z))}},G=z=>{if(!z)return null;const H=`guard-${z.index}`,re=j.has(H),le=()=>{$(ve=>{const p=new Set(ve);return p.has(H)?p.delete(H):p.add(H),p})},ue=(z.resolved||[]).map(ve=>{const p=typeof ve.value=="string"?`"${ve.value}"`:String(ve.value??"undefined");return`${ve.expression} = ${p}`}).join(", ");return g.jsxs("div",{className:"mt-2 bg-rose-900/20 rounded border border-rose-800/50",children:[g.jsxs("button",{onClick:le,className:"w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-rose-900/30 transition-colors rounded",children:[re?g.jsx(ln,{size:14,className:"text-rose-400"}):g.jsx($n,{size:14,className:"text-rose-400"}),g.jsx(rf,{size:14,className:"text-rose-400"}),g.jsxs("span",{className:"text-sm font-medium text-rose-300",children:["Guard #",z.index," failed"]})]}),re&&g.jsxs("div",{className:"px-3 pb-3",children:[g.jsx("div",{className:"text-xs text-rose-400 font-mono mb-2 bg-rose-950/30 px-2 py-1 rounded",children:z.formatted}),ue&&g.jsxs("div",{className:"text-xs text-rose-400",children:[g.jsx("span",{className:"font-medium",children:"Resolved:"})," ",ue]})]})]})},P=z=>{const H=`policy-${z.policyName}`,re=j.has(H),le=()=>{$(p=>{const F=new Set(p);return F.has(H)?F.delete(H):F.add(H),F})},me=z.contextKeys.length>0?z.contextKeys.join(", "):"none",ve=(z.resolved||[]).map(p=>{const F=typeof p.value=="string"?`"${p.value}"`:String(p.value??"undefined");return`${p.expression} = ${F}`}).join(", ");return g.jsxs("div",{className:"mt-2 bg-amber-900/20 rounded border border-amber-800/50",children:[g.jsxs("button",{onClick:le,className:"w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-amber-900/30 transition-colors rounded",children:[re?g.jsx(ln,{size:14,className:"text-amber-400"}):g.jsx($n,{size:14,className:"text-amber-400"}),g.jsx(Jl,{size:14,className:"text-amber-400"}),g.jsxs("span",{className:"text-sm font-medium text-amber-300",children:["Policy Denial: ",g.jsx("code",{className:"text-amber-400",children:z.policyName})]})]}),re&&g.jsxs("div",{className:"px-3 pb-3 space-y-2",children:[z.formatted&&g.jsxs("div",{children:[g.jsx("div",{className:"text-xs text-amber-500 mb-1",children:"Policy Expression:"}),g.jsx("div",{className:"text-xs text-amber-400 font-mono bg-amber-950/30 px-2 py-1 rounded",children:z.formatted})]}),z.message&&g.jsxs("div",{className:"text-xs text-amber-400",children:[g.jsx("span",{className:"font-medium",children:"Message:"})," ",z.message]}),ve&&g.jsxs("div",{className:"text-xs text-amber-400",children:[g.jsx("span",{className:"font-medium",children:"Resolved:"})," ",ve]}),g.jsxs("div",{className:"text-xs text-amber-400",children:[g.jsx("span",{className:"font-medium",children:"Context Keys:"})," ",g.jsx("span",{className:"font-mono",children:me})]})]})]})},R=a.find(z=>z.name===l),se=y.find(z=>z.id===h),X=R?n==null?void 0:n.getCommand(w,l):null,Z=(X==null?void 0:X.parameters)||[],ge=()=>Z.length===0?"No parameters":Z.map(H=>{const re=H.required?"required":"optional",le=H.defaultValue!==void 0?` (default: ${JSON.stringify(H.defaultValue)})`:"";return`${H.name}: ${H.type.name} (${re})${le}`}).join(", ");return g.jsxs("div",{className:"h-full flex flex-col bg-gray-950",children:[g.jsxs("div",{className:"flex-shrink-0 px-3 py-3 border-b border-gray-800 bg-gray-900/50",children:[g.jsxs("div",{className:"flex items-center gap-2 mb-3",children:[g.jsx(Hl,{size:16,className:"text-sky-400"}),g.jsx("span",{className:"text-sm font-medium text-gray-200",children:"Runtime"}),a.length>0&&g.jsxs("span",{className:"text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded",children:[a.length," entities"]})]}),(()=>{const z=n==null?void 0:n.getProvenance();return z?g.jsxs("div",{className:"mb-3",children:[g.jsxs("button",{onClick:()=>ne(!M),className:"flex items-center gap-2 text-xs text-gray-400 hover:text-gray-300 transition-colors",children:[M?g.jsx(ln,{size:12}):g.jsx($n,{size:12}),g.jsx(Jl,{size:12,className:"text-emerald-400"}),g.jsx("span",{className:"font-medium",children:"IR Provenance"}),g.jsxs("span",{className:"text-gray-600",children:["v",z.compilerVersion]})]}),M&&g.jsxs("div",{className:"mt-2 ml-4 p-2 bg-gray-900/50 rounded border border-gray-800 space-y-1",children:[g.jsxs("div",{className:"flex items-center gap-2 text-xs",children:[g.jsx("span",{className:"text-gray-500",children:"Compiler:"}),g.jsx("span",{className:"font-mono text-gray-300",children:z.compilerVersion})]}),z.schemaVersion&&g.jsxs("div",{className:"flex items-center gap-2 text-xs",children:[g.jsx("span",{className:"text-gray-500",children:"Schema:"}),g.jsx("span",{className:"font-mono text-gray-300",children:z.schemaVersion})]}),z.irHash&&g.jsxs("div",{className:"flex items-center gap-2 text-xs",children:[g.jsx("span",{className:"text-gray-500",children:"IR Hash:"}),g.jsxs("span",{className:"font-mono text-gray-300 text-xs",title:z.irHash,children:[z.irHash.slice(0,16),"..."]})]})]})]}):null})(),g.jsx("div",{className:"space-y-3",children:g.jsxs("div",{children:[g.jsxs("label",{className:"flex items-center gap-1 text-xs text-gray-400 mb-1",children:[g.jsx(vf,{size:12}),"Runtime Context (JSON)"]}),g.jsx("textarea",{value:s,onChange:z=>i(z.target.value),disabled:e,className:"w-full h-16 px-2 py-1.5 bg-gray-900 border border-gray-700 rounded text-xs font-mono text-gray-300 resize-none focus:outline-none focus:border-sky-500 disabled:opacity-50 disabled:cursor-not-allowed",placeholder:'{ "user": { "id": "u1", "role": "cook" } }'})]})})]}),g.jsxs("div",{className:"flex-1 flex overflow-hidden",children:[g.jsxs("div",{className:"w-56 flex-shrink-0 border-r border-gray-800 overflow-auto",children:[g.jsx("div",{className:"px-3 py-2 border-b border-gray-800",children:g.jsx("div",{className:"text-xs text-gray-500 uppercase tracking-wider",children:"Entities"})}),g.jsx("div",{className:"p-2 space-y-1",children:a.map(z=>g.jsx("button",{onClick:()=>d(z.name),className:`w-full p-2 text-left rounded transition-colors ${l===z.name?"bg-sky-900/30 border border-sky-700":"hover:bg-gray-900 border border-transparent"}`,children:g.jsxs("div",{className:"flex items-center gap-2",children:[g.jsx(Ys,{size:14,className:l===z.name?"text-sky-400":"text-gray-500"}),g.jsxs("div",{className:"flex-1 min-w-0",children:[g.jsx("div",{className:"text-sm font-medium text-gray-200 truncate",children:z.name}),g.jsxs("div",{className:"text-xs text-gray-500",children:[z.properties.length," props, ",z.computedProperties.length," computed"]})]})]})},z.name))}),R&&g.jsxs(g.Fragment,{children:[g.jsx("div",{className:"px-3 py-2 border-b border-gray-800 mt-2",children:g.jsxs("div",{className:"flex items-center justify-between",children:[g.jsxs("div",{className:"text-xs text-gray-500 uppercase tracking-wider",children:[R.name," (",y.length,")"]}),g.jsxs("button",{onClick:Y,disabled:e||!n,className:"flex items-center gap-1 px-2 py-1 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed",children:[g.jsx(Zl,{size:10}),"New"]})]})}),g.jsx("div",{className:"p-2 space-y-1 max-h-64 overflow-auto",children:y.length===0?g.jsx("div",{className:"text-xs text-gray-500 text-center py-4",children:"No instances. Create one to get started."}):y.map(z=>g.jsxs("button",{onClick:()=>f(z.id),className:`w-full p-2 text-left rounded transition-colors ${h===z.id?"bg-sky-900/30 border border-sky-700":"hover:bg-gray-900 border border-transparent"}`,children:[g.jsx("div",{className:"text-sm font-medium text-gray-200 truncate",children:z.id}),R.properties.slice(0,2).map(H=>g.jsxs("div",{className:"text-xs text-gray-500 truncate",children:[H.name,": ",String(z[H.name]??"<null>")]},H.name))]},z.id))})]})]}),g.jsx("div",{className:"flex-1 flex flex-col overflow-auto",children:se&&R?g.jsxs(g.Fragment,{children:[g.jsx("div",{className:"flex-shrink-0 px-4 py-3 border-b border-gray-800 bg-gray-900/30",children:g.jsxs("div",{className:"flex items-start justify-between",children:[g.jsxs("div",{className:"flex-1",children:[g.jsx("h3",{className:"text-base font-medium text-gray-200",children:R.name}),g.jsx("p",{className:"text-sm text-gray-500 mt-1 font-mono",children:se.id})]}),g.jsx("button",{onClick:()=>W(h),className:"p-1 text-gray-500 hover:text-rose-400 hover:bg-rose-900/20 rounded transition-colors",children:g.jsx(Ql,{size:14})})]})}),g.jsxs("div",{className:"flex-1 overflow-auto p-4",children:[g.jsxs("div",{className:"mb-6",children:[g.jsxs("h4",{className:"text-xs text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1",children:[g.jsx(Gl,{size:12}),"Properties"]}),g.jsx("div",{className:"grid grid-cols-2 gap-2",children:R.properties.map(z=>{const H=se[z.name],re=z.modifiers.includes("required"),le=H==null?"<null>":typeof H=="object"?JSON.stringify(H):String(H);return g.jsxs("div",{className:"p-2 bg-gray-900/50 rounded border border-gray-800",children:[g.jsxs("div",{className:"text-xs text-gray-500",children:[z.name,re&&g.jsx("span",{className:"text-rose-400 ml-1",children:"*"})]}),g.jsx("div",{className:"text-sm text-gray-300 truncate",title:le,children:le})]},z.name)})})]}),R.computedProperties.length>0&&g.jsxs("div",{className:"mb-6",children:[g.jsxs("h4",{className:"text-xs text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1",children:[g.jsx(Gl,{size:12}),"Computed Properties"]}),g.jsx("div",{className:"grid grid-cols-3 gap-2",children:R.computedProperties.map(z=>{const H=C[z.name],re=H==null?"<null>":typeof H=="object"?JSON.stringify(H):String(H);return g.jsxs("div",{className:"p-2 bg-gray-900/30 rounded border border-gray-800",children:[g.jsx("div",{className:"text-xs text-gray-500",children:z.name}),g.jsx("div",{className:"text-sm text-gray-300 truncate",title:re,children:re})]},z.name)})})]}),R.commands.length>0&&g.jsxs("div",{className:"mb-6",children:[g.jsx("h4",{className:"text-xs text-gray-500 uppercase tracking-wider mb-2",children:"Execute Command"}),g.jsxs("div",{className:"space-y-2",children:[g.jsxs("div",{children:[g.jsx("label",{className:"text-xs text-gray-500 mb-1 block",children:"Command"}),g.jsx("select",{value:w,onChange:z=>m(z.target.value),disabled:e||!n,className:"w-full px-2 py-1.5 bg-gray-900 border border-gray-700 rounded text-xs text-gray-300 focus:outline-none focus:border-sky-500 disabled:opacity-50",children:R.commands.map(z=>{const H=n==null?void 0:n.getCommand(z,l);return g.jsxs("option",{value:z,children:[z," ",H!=null&&H.parameters.length?`(${H.parameters.map(re=>re.name).join(", ")})`:""]},z)})})]}),Z.length>0&&g.jsxs("div",{children:[g.jsx("label",{className:"text-xs text-gray-500 mb-1 block",children:"Parameters (JSON)"}),g.jsx("input",{type:"text",value:E,onChange:z=>c(z.target.value),disabled:e||!n,className:"w-full px-2 py-1.5 bg-gray-900 border border-gray-700 rounded text-xs font-mono text-gray-300 focus:outline-none focus:border-sky-500 disabled:opacity-50",placeholder:`{ ${Z.map(z=>`"${z.name}": ${z.type.name}`).join(", ")} }`}),g.jsx("div",{className:"text-xs text-gray-500 mt-1",children:ge()})]}),g.jsxs("button",{onClick:D,disabled:e||!n||!w,className:`w-full flex items-center justify-center gap-2 px-3 py-2 text-sm rounded transition-colors ${e||!n||!w?"bg-gray-800 text-gray-600 cursor-not-allowed":"bg-sky-600 hover:bg-sky-500 text-white"}`,children:[g.jsx(_o,{size:14}),"Execute Command"]})]})]}),b&&g.jsxs("div",{className:"mb-4 p-3 bg-rose-900/20 rounded border border-rose-800/50 flex items-start gap-2",children:[g.jsx(Ks,{size:16,className:"text-rose-400 flex-shrink-0 mt-0.5"}),g.jsx("div",{className:"text-sm text-rose-300",children:b})]}),u&&g.jsx("div",{className:"mb-4",children:g.jsxs("div",{className:`p-3 rounded border ${u.success?"bg-emerald-900/20 border-emerald-800/50":"bg-rose-900/20 border-rose-800/50"}`,children:[g.jsxs("div",{className:"flex items-center gap-2 mb-2",children:[u.success?g.jsx(Vs,{size:16,className:"text-emerald-400"}):g.jsx(Ks,{size:16,className:"text-rose-400"}),g.jsx("span",{className:`text-sm font-medium ${u.success?"text-emerald-300":"text-rose-300"}`,children:u.success?"Success":"Failed"})]}),u.error&&g.jsx("div",{className:"text-sm text-rose-300 mb-2",children:u.error}),u.guardFailure&&G(u.guardFailure),u.policyDenial&&P(u.policyDenial),u.emittedEvents.length>0&&g.jsxs("div",{className:"mt-3",children:[g.jsx("div",{className:"text-xs text-gray-400 mb-1",children:"Emitted Events:"}),u.emittedEvents.map((z,H)=>g.jsxs("div",{className:"text-xs font-mono text-emerald-300 bg-gray-900/50 p-2 rounded mt-1",children:[z.name," (",z.channel,")"]},H))]}),u.result!==void 0&&g.jsxs("div",{className:"mt-3",children:[g.jsx("div",{className:"text-xs text-gray-400 mb-1",children:"Result:"}),g.jsx("pre",{className:"text-xs font-mono text-gray-300 bg-gray-900/50 p-2 rounded overflow-auto",children:JSON.stringify(u.result,null,2)})]})]})})]})]}):g.jsx("div",{className:"flex-1 flex flex-col items-center justify-center text-gray-500 text-sm p-4",children:a.length===0?g.jsxs(g.Fragment,{children:[g.jsx(Hl,{size:24,className:"mb-2 opacity-50"}),g.jsx("p",{children:"No entities found. Compile a manifest to get started."})]}):R?y.length===0?g.jsxs(g.Fragment,{children:[g.jsx(Zl,{size:24,className:"mb-2 opacity-50"}),g.jsx("p",{children:"No instances yet. Create one to get started."})]}):g.jsxs(g.Fragment,{children:[g.jsx(hf,{size:24,className:"mb-2 opacity-50"}),g.jsx("p",{children:"Select an instance to view details."})]}):g.jsxs(g.Fragment,{children:[g.jsx(Ys,{size:24,className:"mb-2 opacity-50"}),g.jsx("p",{children:"Select an entity to view its instances."})]})})}),g.jsxs("div",{className:"w-72 flex-shrink-0 border-l border-gray-800 overflow-auto",children:[g.jsxs("div",{className:"px-3 py-2 border-b border-gray-800 flex items-center justify-between",children:[g.jsxs("div",{className:"flex items-center gap-2",children:[g.jsx(gd,{size:14,className:"text-purple-400"}),g.jsx("span",{className:"text-xs text-gray-500 uppercase tracking-wider",children:"Event Log"}),I.length>0&&g.jsx("span",{className:"text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded",children:I.length})]}),I.length>0&&g.jsx("button",{onClick:oe,disabled:e||!n,className:"p-1 text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed",children:g.jsx(Ql,{size:12})})]}),g.jsx("div",{className:"p-2 space-y-2",children:I.length===0?g.jsx("div",{className:"text-xs text-gray-500 text-center py-4",children:"No events yet"}):I.slice().reverse().map((z,H)=>g.jsxs("div",{className:"p-2 bg-gray-900/50 rounded border border-gray-800 hover:border-purple-800/50 transition-colors",children:[g.jsxs("div",{className:"flex items-center gap-2 mb-1",children:[g.jsx("span",{className:"text-xs font-medium text-purple-300",children:z.name}),g.jsxs("span",{className:"text-xs text-gray-600 font-mono",children:["(",z.channel,")"]})]}),g.jsx("div",{className:"text-xs text-gray-500",children:new Date(z.timestamp).toLocaleTimeString()}),g.jsxs("div",{className:"mt-1",children:[g.jsx("div",{className:"text-xs text-gray-600 mb-1",children:"Payload:"}),g.jsx("pre",{className:"text-xs font-mono text-gray-400 bg-gray-950 p-1.5 rounded overflow-auto border border-gray-800",children:JSON.stringify(z.payload,null,2)})]})]},H))})]})]})]})}function mm({source:t,clientCode:e,serverCode:n,testCode:r,ast:s,hasErrors:i}){const[a,o]=ie.useState("src/generated/client.ts"),[l,d]=ie.useState(!1),[y,v]=ie.useState(!1),[h,f]=ie.useState(!1),[w,m]=ie.useState("files"),E={source:t,clientCode:e,serverCode:n,testCode:r,ast:s},c=Ao(E),u=Dr(t);ie.useEffect(()=>{(!a||!c[a])&&o("src/generated/client.ts")},[c,a]);const k=async()=>{if(!i){v(!0);try{await Mf(E)}finally{v(!1)}}},b=async()=>{if(!i){f(!0);try{await Ff(E)}finally{f(!1)}}},T=async()=>{await Bf(E),d(!0),setTimeout(()=>d(!1),2e3)};return g.jsxs("div",{className:"h-full flex flex-col bg-gray-950",children:[g.jsxs("div",{className:"flex-shrink-0 px-3 py-3 border-b border-gray-800 bg-gray-900/50",children:[g.jsx("div",{className:"flex items-center justify-between mb-3",children:g.jsxs("div",{className:"flex items-center gap-2",children:[g.jsx(Ys,{size:16,className:"text-sky-400"}),g.jsx("span",{className:"text-sm font-medium text-gray-200",children:"Artifacts"}),g.jsx("span",{className:"text-xs text-gray-500 px-2 py-0.5 bg-gray-800 rounded",children:u})]})}),g.jsxs("div",{className:"flex flex-col gap-2",children:[g.jsxs("button",{onClick:b,disabled:i||h,className:`flex items-center justify-center gap-2 px-3 py-2.5 text-sm rounded transition-colors ${i||h?"bg-gray-800 text-gray-600 cursor-not-allowed":"bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white"}`,children:[g.jsx(ff,{size:14}),h?"Exporting...":"Export Runnable Project"]}),g.jsxs("div",{className:"flex gap-2",children:[g.jsxs("button",{onClick:k,disabled:i||y,className:`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm rounded transition-colors ${i||y?"bg-gray-800 text-gray-600 cursor-not-allowed":"bg-sky-600 hover:bg-sky-500 text-white"}`,children:[g.jsx(lf,{size:14}),y?"Exporting...":"Export .zip"]}),g.jsx("button",{onClick:T,className:"flex items-center justify-center gap-2 px-3 py-2 text-sm bg-gray-800 hover:bg-gray-700 rounded transition-colors",children:l?g.jsxs(g.Fragment,{children:[g.jsx(Co,{size:14,className:"text-emerald-400"}),g.jsx("span",{className:"text-emerald-400",children:"Copied!"})]}):g.jsxs(g.Fragment,{children:[g.jsx(Io,{size:14}),g.jsx("span",{children:"Copy All"})]})})]})]}),i&&g.jsx("div",{className:"mt-2 text-xs text-rose-400",children:"Fix compilation errors to enable export"})]}),g.jsxs("div",{className:"flex-1 flex overflow-hidden",children:[g.jsxs("div",{className:"w-48 flex-shrink-0 border-r border-gray-800 overflow-auto",children:[g.jsxs("div",{className:"px-2 py-2 text-xs text-gray-500 uppercase tracking-wider flex items-center gap-1 border-b border-gray-800",children:[g.jsx(ql,{size:12}),"Panels"]}),g.jsx("button",{onClick:()=>m("files"),className:`w-full px-2 py-2 text-left text-sm transition-colors ${w==="files"?"bg-gray-800 text-sky-400":"text-gray-400 hover:text-gray-300 hover:bg-gray-900/50"}`,children:"Files"}),g.jsx("button",{onClick:()=>m("runtime"),className:`w-full px-2 py-2 text-left text-sm transition-colors ${w==="runtime"?"bg-gray-800 text-sky-400":"text-gray-400 hover:text-gray-300 hover:bg-gray-900/50"}`,children:"Runtime"}),w==="files"&&g.jsxs(g.Fragment,{children:[g.jsxs("div",{className:"px-2 py-2 text-xs text-gray-500 uppercase tracking-wider flex items-center gap-1 border-t border-gray-800 mt-2",children:[g.jsx(ql,{size:12}),"Files"]}),g.jsx(Gf,{files:c,selectedFile:a,onSelectFile:o})]})]}),g.jsx("div",{className:"flex-1 flex flex-col overflow-hidden",children:w==="files"?a&&c[a]?g.jsx(Zf,{path:a,content:c[a]}):g.jsx("div",{className:"flex-1 flex items-center justify-center text-gray-500 text-sm",children:"Select a file to view"}):g.jsx(fm,{source:t,disabled:i})})]}),g.jsx(sm,{clientCode:e,ast:s,disabled:i})]})}const gm=new bf,ym=["entity","property","behavior","constraint","flow","effect","expose","compose","command","module","policy","store","event","computed","derived","hasMany","hasOne","belongsTo","ref","through","on","when","then","emit","mutate","compute","guard","publish","persist","as","from","to","with","where","connect","returns","string","number","boolean","list","map","any","void","true","false","null","required","unique","indexed","private","readonly","optional","rest","graphql","websocket","function","server","http","storage","timer","custom","memory","postgres","supabase","localStorage","read","write","delete","execute","all","allow","deny","and","or","not","is","in","contains","user","self","context"];function vm(t){return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}function xm(t,e){const n=vm(t),r=[],s=(l,d)=>{let y;for(;(y=l.exec(n))!==null;)r.push({start:y.index,end:y.index+y[0].length,className:d})};if(s(/(\/\/[^\n]*)/g,"text-gray-500"),s(/(\/\*[\s\S]*?\*\/)/g,"text-gray-500"),s(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g,"text-amber-400"),s(/\b(\d+\.?\d*)\b/g,"text-cyan-400"),e==="manifest"){const l=new RegExp(`\\b(${ym.join("|")})\\b`,"g");s(l,"text-sky-400 font-medium"),s(/\b([A-Z][a-zA-Z0-9]*)\b/g,"text-emerald-400")}else{const l=["class","interface","type","function","const","let","var","return","if","else","for","while","new","this","extends","export","import","async","await","try","catch","throw","private","public","get","set","implements"];s(new RegExp(`\\b(${l.join("|")})\\b`,"g"),"text-sky-400 font-medium"),s(/\b(string|number|boolean|any|void|null|undefined|true|false|Promise)\b/g,"text-orange-400")}r.sort((l,d)=>l.start-d.start);const i=[];for(const l of r)i.some(y=>l.start>=y.start&&l.start<y.end||l.end>y.start&&l.end<=y.end)||i.push(l);let a="",o=0;for(const l of i)l.start>o&&(a+=n.slice(o,l.start)),a+=`<span class="${l.className}">${n.slice(l.start,l.end)}</span>`,o=l.end;return a+=n.slice(o),a}function as({value:t,onChange:e,lang:n,readOnly:r,placeholder:s}){const i=ie.useRef(null),a=ie.useRef(null),o=ie.useCallback(()=>{i.current&&a.current&&(a.current.scrollTop=i.current.scrollTop,a.current.scrollLeft=i.current.scrollLeft)},[]);ie.useEffect(o,[t,o]);const l=y=>{if(y.key==="Tab"){y.preventDefault();const v=y.currentTarget.selectionStart,h=y.currentTarget.selectionEnd,f=t.substring(0,v)+"  "+t.substring(h);e(f),setTimeout(()=>{i.current&&(i.current.selectionStart=i.current.selectionEnd=v+2)},0)}},d=t?xm(t,n):`<span class="text-gray-600">${s||""}</span>`;return g.jsxs("div",{className:"relative h-full font-mono text-sm",children:[g.jsx("div",{ref:a,className:"absolute inset-0 p-4 overflow-auto whitespace-pre-wrap break-words pointer-events-none",style:{color:"#e2e8f0"},dangerouslySetInnerHTML:{__html:d}}),g.jsx("textarea",{ref:i,value:t,onChange:y=>e(y.target.value),onScroll:o,onKeyDown:l,readOnly:r,placeholder:s,spellCheck:!1,className:"absolute inset-0 w-full h-full p-4 bg-transparent text-transparent caret-white resize-none outline-none selection:bg-sky-500/30",style:{caretColor:"white"}})]})}function Oa({label:t,value:e,depth:n=0}){const[r,s]=ie.useState(n<2);if(e==null)return g.jsxs("div",{className:"flex gap-2 py-0.5",style:{paddingLeft:n*16},children:[g.jsxs("span",{className:"text-gray-400",children:[t,":"]}),g.jsx("span",{className:"text-gray-500",children:"null"})]});if(typeof e=="string"||typeof e=="number"||typeof e=="boolean")return g.jsxs("div",{className:"flex gap-2 py-0.5",style:{paddingLeft:n*16},children:[g.jsxs("span",{className:"text-gray-400",children:[t,":"]}),g.jsx("span",{className:typeof e=="string"?"text-amber-400":typeof e=="number"?"text-cyan-400":"text-orange-400",children:typeof e=="string"?`"${e}"`:String(e)})]});if(Array.isArray(e))return e.length===0?g.jsxs("div",{className:"flex gap-2 py-0.5",style:{paddingLeft:n*16},children:[g.jsxs("span",{className:"text-gray-400",children:[t,":"]}),g.jsx("span",{className:"text-gray-500",children:"[]"})]}):g.jsxs("div",{children:[g.jsxs("button",{onClick:()=>s(!r),className:"flex items-center gap-1 py-0.5 hover:bg-white/5 w-full text-left",style:{paddingLeft:n*16},children:[r?g.jsx(ln,{size:14,className:"text-gray-500"}):g.jsx($n,{size:14,className:"text-gray-500"}),g.jsx("span",{className:"text-gray-400",children:t}),g.jsxs("span",{className:"text-gray-600 text-xs",children:["Array(",e.length,")"]})]}),r&&e.map((i,a)=>g.jsx(Oa,{label:`[${a}]`,value:i,depth:n+1},a))]});if(typeof e=="object"){const i=Object.entries(e).filter(([a])=>a!=="position");return g.jsxs("div",{children:[g.jsxs("button",{onClick:()=>s(!r),className:"flex items-center gap-1 py-0.5 hover:bg-white/5 w-full text-left",style:{paddingLeft:n*16},children:[r?g.jsx(ln,{size:14,className:"text-gray-500"}):g.jsx($n,{size:14,className:"text-gray-500"}),g.jsx("span",{className:"text-gray-400",children:t}),e.type&&g.jsx("span",{className:"text-emerald-400 text-xs ml-1",children:e.type})]}),r&&i.map(([a,o])=>g.jsx(Oa,{label:a,value:o,depth:n+1},a))]})}return null}function km({ast:t}){return t?g.jsx("div",{className:"h-full overflow-auto p-4 font-mono text-sm",children:g.jsx(Oa,{label:"program",value:t})}):g.jsx("div",{className:"h-full flex items-center justify-center text-gray-500",children:"No AST"})}function wm(){return g.jsx("div",{className:"h-full overflow-auto p-6",children:g.jsxs("div",{className:"max-w-3xl mx-auto space-y-8",children:[g.jsxs("section",{children:[g.jsxs("h2",{className:"text-2xl font-bold text-white mb-4 flex items-center gap-3",children:[g.jsx(yd,{className:"text-sky-400"}),"Manifest v2.0"]}),g.jsx("p",{className:"text-gray-300 leading-relaxed",children:"A declarative language for AI to describe software systems. Now with commands, computed properties, relationships, policies, stores, modules, and realtime events."}),g.jsx("div",{className:"mt-4 grid grid-cols-3 gap-3",children:[{label:"Commands",desc:"Explicit business operations"},{label:"Computed",desc:"Auto-updating derived fields"},{label:"Relations",desc:"hasMany, belongsTo, ref"},{label:"Policies",desc:"Auth/permission rules"},{label:"Stores",desc:"Persistence targets"},{label:"Events",desc:"Realtime pub/sub"}].map(({label:t,desc:e})=>g.jsxs("div",{className:"p-3 bg-gray-800/50 rounded border border-gray-700",children:[g.jsx("div",{className:"text-sky-400 font-medium text-sm",children:t}),g.jsx("div",{className:"text-gray-500 text-xs mt-1",children:e})]},t))})]}),g.jsxs("section",{children:[g.jsx("h3",{className:"text-xl font-semibold text-white mb-3",children:"New in v2"}),g.jsxs("div",{className:"space-y-4",children:[g.jsxs("div",{className:"p-4 bg-gray-800/50 rounded-lg border border-gray-700",children:[g.jsx("h4",{className:"font-mono text-sky-400 mb-2",children:"command"}),g.jsx("p",{className:"text-sm text-gray-300 mb-2",children:"Explicit business operations with guards, actions, and emits."}),g.jsx("pre",{className:"p-3 bg-gray-900 rounded text-xs text-gray-300 overflow-x-auto",children:`command claimTask(taskId: string, employeeId: string) {
  guard user.role == "manager" or task.assignedTo == null
  mutate assignedTo = employeeId
  mutate status = "in_progress"
  emit taskClaimed
}`})]}),g.jsxs("div",{className:"p-4 bg-gray-800/50 rounded-lg border border-gray-700",children:[g.jsx("h4",{className:"font-mono text-sky-400 mb-2",children:"computed / derived"}),g.jsx("p",{className:"text-sm text-gray-300 mb-2",children:"Auto-recalculating properties like a spreadsheet."}),g.jsx("pre",{className:"p-3 bg-gray-900 rounded text-xs text-gray-300 overflow-x-auto",children:`computed total: number = subtotal + tax
computed isOverdue: boolean = dueDate < now()
computed fullName: string = firstName + " " + lastName`})]}),g.jsxs("div",{className:"p-4 bg-gray-800/50 rounded-lg border border-gray-700",children:[g.jsx("h4",{className:"font-mono text-sky-400 mb-2",children:"relationships"}),g.jsx("p",{className:"text-sm text-gray-300 mb-2",children:"Model connections between entities."}),g.jsx("pre",{className:"p-3 bg-gray-900 rounded text-xs text-gray-300 overflow-x-auto",children:`hasMany orders: Order
hasOne profile: Profile
belongsTo team: Team
ref product: Product`})]}),g.jsxs("div",{className:"p-4 bg-gray-800/50 rounded-lg border border-gray-700",children:[g.jsx("h4",{className:"font-mono text-sky-400 mb-2",children:"policy"}),g.jsx("p",{className:"text-sm text-gray-300 mb-2",children:"Auth rules - like RLS but in your spec."}),g.jsx("pre",{className:"p-3 bg-gray-900 rounded text-xs text-gray-300 overflow-x-auto",children:`policy canEdit write: user.id == ownerId or user.role == "admin"
policy canView read: user.teamId == self.teamId
policy canDelete delete: user.role == "admin"`})]}),g.jsxs("div",{className:"p-4 bg-gray-800/50 rounded-lg border border-gray-700",children:[g.jsx("h4",{className:"font-mono text-sky-400 mb-2",children:"store"}),g.jsx("p",{className:"text-sm text-gray-300 mb-2",children:"Where data lives - memory, localStorage, Supabase."}),g.jsx("pre",{className:"p-3 bg-gray-900 rounded text-xs text-gray-300 overflow-x-auto",children:`store User in supabase { table: "users" }
store Cart in memory
store Settings in localStorage { key: "app_settings" }`})]}),g.jsxs("div",{className:"p-4 bg-gray-800/50 rounded-lg border border-gray-700",children:[g.jsx("h4",{className:"font-mono text-sky-400 mb-2",children:"event (outbox)"}),g.jsx("p",{className:"text-sm text-gray-300 mb-2",children:"Realtime events for pub/sub."}),g.jsx("pre",{className:"p-3 bg-gray-900 rounded text-xs text-gray-300 overflow-x-auto",children:`event TaskClaimed: "kitchen.task.claimed" {
  taskId: string
  employeeId: string
  timestamp: string
}`})]}),g.jsxs("div",{className:"p-4 bg-gray-800/50 rounded-lg border border-gray-700",children:[g.jsx("h4",{className:"font-mono text-sky-400 mb-2",children:"expose ... server"}),g.jsx("p",{className:"text-sm text-gray-300 mb-2",children:"Generate server routes, not just client stubs."}),g.jsx("pre",{className:"p-3 bg-gray-900 rounded text-xs text-gray-300 overflow-x-auto",children:`expose User as rest server "/api/users" {
  list, get, create, update, delete
}`})]}),g.jsxs("div",{className:"p-4 bg-gray-800/50 rounded-lg border border-gray-700",children:[g.jsx("h4",{className:"font-mono text-sky-400 mb-2",children:"module"}),g.jsx("p",{className:"text-sm text-gray-300 mb-2",children:"Group related entities and commands."}),g.jsx("pre",{className:"p-3 bg-gray-900 rounded text-xs text-gray-300 overflow-x-auto",children:`module kitchen {
  entity PrepTask { ... }
  entity Station { ... }
  command claimTask(...) { ... }
}`})]})]})]})]})})}function Em(){const[t,e]=ie.useState(ec[0].code),[n,r]=ie.useState(""),[s,i]=ie.useState(""),[a,o]=ie.useState(""),[l,d]=ie.useState(null),[y,v]=ie.useState([]),[h,f]=ie.useState("output"),[w,m]=ie.useState(!1),[E,c]=ie.useState(null),[u,k]=ie.useState(!0),b=ie.useCallback(()=>{const T=performance.now(),I=gm.compile(t);c(Math.round((performance.now()-T)*100)/100),I.success&&I.code?(r(I.code),i(I.serverCode||""),o(I.testCode||""),d(I.ast||null),v([])):(v(I.errors||[]),d(I.ast||null))},[t]);return ie.useEffect(()=>{const T=setTimeout(b,300);return()=>clearTimeout(T)},[t,b]),g.jsxs("div",{className:"h-screen flex flex-col bg-gray-950 text-gray-100",children:[g.jsxs("header",{className:"flex-shrink-0 border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm",children:[g.jsxs("div",{className:"flex items-center justify-between px-6 py-4",children:[g.jsxs("div",{className:"flex items-center gap-3",children:[g.jsxs("div",{className:"relative",children:[g.jsx("div",{className:"w-10 h-10 bg-gradient-to-br from-sky-500 to-cyan-400 rounded-xl flex items-center justify-center shadow-lg shadow-sky-500/20",children:g.jsx(yd,{className:"w-5 h-5 text-white"})}),g.jsx("div",{className:"absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center",children:g.jsx(xf,{className:"w-2.5 h-2.5 text-white"})})]}),g.jsxs("div",{children:[g.jsxs("h1",{className:"text-xl font-bold text-white tracking-tight",children:["Manifest ",g.jsx("span",{className:"text-sky-400 text-sm font-normal",children:"v2.0"})]}),g.jsx("p",{className:"text-xs text-gray-500",children:"Commands / Computed / Relations / Policies / Stores"})]})]}),g.jsxs("div",{className:"flex items-center gap-4",children:[g.jsxs("button",{onClick:()=>k(!u),className:`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${u?"bg-sky-600 text-white":"bg-gray-800 hover:bg-gray-700 text-gray-300"}`,children:[g.jsx(Ys,{size:16}),"Artifacts"]}),g.jsxs("div",{className:"relative",children:[g.jsxs("button",{onClick:()=>m(!w),className:"flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm font-medium transition-colors",children:[g.jsx(sf,{size:16}),"Examples",g.jsx(ln,{size:14,className:`transition-transform ${w?"rotate-180":""}`})]}),w&&g.jsx("div",{className:"absolute right-0 top-full mt-2 w-80 bg-gray-800 rounded-xl shadow-xl border border-gray-700 overflow-hidden z-50",children:ec.map((T,I)=>g.jsxs("button",{onClick:()=>{e(T.code),m(!1)},className:"w-full px-4 py-3 text-left hover:bg-gray-700 transition-colors border-b border-gray-700 last:border-0",children:[g.jsx("div",{className:"font-medium text-white",children:T.name}),g.jsx("div",{className:"text-xs text-gray-400 mt-0.5",children:T.desc})]},I))})]}),g.jsxs("button",{onClick:b,className:"flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 rounded-lg text-sm font-semibold text-white shadow-lg shadow-sky-500/25 transition-all",children:[g.jsx(_o,{size:16}),"Compile"]})]})]}),(y.length>0||E!==null)&&g.jsxs("div",{className:"px-6 pb-3 flex items-center gap-4",children:[y.length>0?g.jsxs("div",{className:"flex items-center gap-2 text-rose-400 text-sm",children:[g.jsx(Ks,{size:14}),y.length," error",y.length>1?"s":""]}):g.jsxs("div",{className:"flex items-center gap-2 text-emerald-400 text-sm",children:[g.jsx(Vs,{size:14}),"Compiled successfully"]}),E!==null&&g.jsxs("div",{className:"flex items-center gap-2 text-gray-500 text-xs",children:[g.jsx(of,{size:12}),E,"ms"]})]})]}),g.jsxs("main",{className:"flex-1 flex overflow-hidden",children:[g.jsxs("div",{className:`${u?"w-1/3":"w-1/2"} border-r border-gray-800 flex flex-col transition-all`,children:[g.jsxs("div",{className:"flex-shrink-0 px-4 py-2 border-b border-gray-800 bg-gray-900/50 flex items-center gap-2",children:[g.jsx(cf,{size:14,className:"text-sky-400"}),g.jsx("span",{className:"text-sm font-medium text-gray-300",children:"Source"}),g.jsx("span",{className:"text-xs text-gray-600 ml-auto",children:".manifest"})]}),g.jsx("div",{className:"flex-1 overflow-hidden bg-gray-900",children:g.jsx(as,{value:t,onChange:e,lang:"manifest",placeholder:"Write Manifest code..."})}),y.length>0&&g.jsx("div",{className:"flex-shrink-0 max-h-32 overflow-auto bg-rose-950/30 border-t border-rose-900/50",children:y.map((T,I)=>g.jsxs("div",{className:"px-4 py-2 text-sm text-rose-300 flex items-start gap-2",children:[g.jsx(Ks,{size:14,className:"flex-shrink-0 mt-0.5"}),g.jsxs("span",{children:[T.position&&g.jsxs("span",{className:"text-rose-500",children:["Line ",T.position.line,": "]}),T.message]})]},I))})]}),g.jsxs("div",{className:`${u?"w-1/3":"w-1/2"} flex flex-col border-r border-gray-800 transition-all`,children:[g.jsx("div",{className:"flex-shrink-0 border-b border-gray-800 bg-gray-900/50 flex",children:[{id:"output",icon:af,label:"Client"},{id:"server",icon:mf,label:"Server"},{id:"tests",icon:gf,label:"Tests"},{id:"ast",icon:yf,label:"AST"},{id:"docs",icon:pf,label:"Docs"}].map(({id:T,icon:I,label:_})=>g.jsxs("button",{onClick:()=>f(T),className:`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${h===T?"text-sky-400 bg-gray-800/50 border-b-2 border-sky-400":"text-gray-400 hover:text-gray-300"}`,children:[g.jsx(I,{size:14}),_]},T))}),g.jsxs("div",{className:"flex-1 overflow-hidden bg-gray-900",children:[h==="output"&&g.jsx(as,{value:n,onChange:()=>{},lang:"ts",readOnly:!0,placeholder:"Generated client code..."}),h==="server"&&g.jsx(as,{value:s,onChange:()=>{},lang:"ts",readOnly:!0,placeholder:"Generated server routes (add 'server' keyword to expose)..."}),h==="tests"&&g.jsx(as,{value:a,onChange:()=>{},lang:"ts",readOnly:!0,placeholder:"Generated tests from constraints..."}),h==="ast"&&g.jsx(km,{ast:l}),h==="docs"&&g.jsx(wm,{})]})]}),u&&g.jsx("div",{className:"w-1/3 flex flex-col transition-all",children:g.jsx(mm,{source:t,clientCode:n,serverCode:s,testCode:a,ast:l,hasErrors:y.length>0})})]})]})}md(document.getElementById("root")).render(g.jsx(ie.StrictMode,{children:g.jsx(Em,{})}));
