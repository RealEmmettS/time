// Copyright QubeTX — tikset.com
// Vercel Node.js function: UDP NTP provides the upstream clock reference.
import { createTimeHandler } from "../server/reference-clock.js";

export const GET = createTimeHandler();
