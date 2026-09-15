// Copyright QubeTX — tikset.com
// Vercel Node.js function: UDP NTP provides the upstream clock reference.
import { createTimeApi } from "../server/time-api.js";

export const GET = createTimeApi();
