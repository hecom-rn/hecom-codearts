"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BusinessService = exports.ApiService = void 0;
// 导出API服务和类型定义
var api_service_1 = require("./services/api.service");
Object.defineProperty(exports, "ApiService", { enumerable: true, get: function () { return api_service_1.ApiService; } });
var business_service_1 = require("./services/business.service");
Object.defineProperty(exports, "BusinessService", { enumerable: true, get: function () { return business_service_1.BusinessService; } });
__exportStar(require("./types"), exports);
