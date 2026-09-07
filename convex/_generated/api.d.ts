/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as access from "../access.js";
import type * as activity from "../activity.js";
import type * as auth from "../auth.js";
import type * as calendar from "../calendar.js";
import type * as calendarEmail from "../calendarEmail.js";
import type * as content from "../content.js";
import type * as crons from "../crons.js";
import type * as dashboard from "../dashboard.js";
import type * as email from "../email.js";
import type * as emailInternal from "../emailInternal.js";
import type * as eventFiles from "../eventFiles.js";
import type * as events from "../events.js";
import type * as exportData from "../exportData.js";
import type * as gantt from "../gantt.js";
import type * as http from "../http.js";
import type * as ics from "../ics.js";
import type * as invites from "../invites.js";
import type * as lib from "../lib.js";
import type * as maintenance from "../maintenance.js";
import type * as notificationTypes from "../notificationTypes.js";
import type * as notifications from "../notifications.js";
import type * as projects from "../projects.js";
import type * as seed from "../seed.js";
import type * as settings from "../settings.js";
import type * as share from "../share.js";
import type * as subtasks from "../subtasks.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  access: typeof access;
  activity: typeof activity;
  auth: typeof auth;
  calendar: typeof calendar;
  calendarEmail: typeof calendarEmail;
  content: typeof content;
  crons: typeof crons;
  dashboard: typeof dashboard;
  email: typeof email;
  emailInternal: typeof emailInternal;
  eventFiles: typeof eventFiles;
  events: typeof events;
  exportData: typeof exportData;
  gantt: typeof gantt;
  http: typeof http;
  ics: typeof ics;
  invites: typeof invites;
  lib: typeof lib;
  maintenance: typeof maintenance;
  notificationTypes: typeof notificationTypes;
  notifications: typeof notifications;
  projects: typeof projects;
  seed: typeof seed;
  settings: typeof settings;
  share: typeof share;
  subtasks: typeof subtasks;
  users: typeof users;
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
