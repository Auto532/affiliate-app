/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as affiliates from "../affiliates.js";
import type * as commissionEngine from "../commissionEngine.js";
import type * as discounts from "../discounts.js";
import type * as emails from "../emails.js";
import type * as http from "../http.js";
import type * as notifications from "../notifications.js";
import type * as passwords from "../passwords.js";
import type * as payments from "../payments.js";
import type * as pricing from "../pricing.js";
import type * as rateLimit from "../rateLimit.js";
import type * as shopLeads from "../shopLeads.js";
import type * as support from "../support.js";
import type * as testPayments from "../testPayments.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  affiliates: typeof affiliates;
  commissionEngine: typeof commissionEngine;
  discounts: typeof discounts;
  emails: typeof emails;
  http: typeof http;
  notifications: typeof notifications;
  passwords: typeof passwords;
  payments: typeof payments;
  pricing: typeof pricing;
  rateLimit: typeof rateLimit;
  shopLeads: typeof shopLeads;
  support: typeof support;
  testPayments: typeof testPayments;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
